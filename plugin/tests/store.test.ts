import { afterAll, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { classify } from "../src/attention/tiers";
import { logPathFor, newMessageId, resourceKey, roomIdFor } from "../src/ids";
import { registerHooks } from "../src/onboarding/hook";
import {
  configPath,
  DEFAULT_ROOM_CONFIG,
  loadRoomConfig,
  registerRoomFlags,
  resolveRoomConfig,
  resolveRoomId,
  saveRoomConfig,
} from "../src/store/config";
import {
  bumpCursor,
  cursorFor,
  initCursor,
  JOIN_BACKLOG,
  lagFor,
  persistOwnCursor,
  restoreOwnCursor,
} from "../src/store/cursors";
import {
  appendLine,
  closeRoomLog,
  openRoomLog,
  replay,
  roomLogFd,
  validateRecord,
} from "../src/store/log";
import { enforceRetention, type RoomStore, roomStoreFor } from "../src/store/room-store";
import type { RoomRecord } from "../src/store/schema";
import { registerRoomTool } from "../src/tools/room";
import { zodStub } from "./zod-stub";

// --- fixtures -------------------------------------------------------------

const TMP: string[] = [];

/** A unique on-disk local:// root per test — never the fixed /tmp path the scaffold used. */
function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-store-"));
  TMP.push(dir);
  return resolveLocalRoot({ getArtifactsDir: () => dir, getSessionId: () => "sess-x" });
}

afterAll(() => {
  for (const dir of TMP) fs.rmSync(dir, { recursive: true, force: true });
});

function msg(seq: number, from = "A", topic = "t", body = "b"): RoomRecord {
  return { v: 1, seq, ts: 1000 + seq, kind: "msg", id: `id-${seq}`, from, topic, body };
}

/** Minimal structural RoomStore: cursors.ts touches only `seq` and `cursors`. */
function cursorStore(seq: number): RoomStore {
  return { seq, cursors: new Map<string, number>() } as unknown as RoomStore;
}

function readLines(p: string): string[] {
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

// --- 1. concurrent writers ------------------------------------------------

test("two writers on one fd produce N interleaved parseable lines, zero torn", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const p = logPathFor(root, roomId);
  const fd = roomLogFd(root, roomId);

  const N = 200;
  for (let i = 0; i < N; i++) {
    appendLine(fd, `${JSON.stringify(msg(i * 2 + 1, "A"))}\n`);
    appendLine(fd, `${JSON.stringify(msg(i * 2 + 2, "B"))}\n`);
  }

  const lines = readLines(p);
  expect(lines.length).toBe(2 * N);
  // JSON.parse throws on a torn line — this is the zero-torn assertion.
  const parsed = lines.map((l) => JSON.parse(l) as RoomRecord);
  expect(parsed.map((r) => r.seq)).toEqual(Array.from({ length: 2 * N }, (_, i) => i + 1));
  expect(new Set(parsed.map((r) => r.from))).toEqual(new Set(["A", "B"]));
  closeRoomLog(root, roomId);
});

// --- 2. torn-line tolerance (round-2 C1 regression) -----------------------

test("torn-line tolerance: 100 valid + 1 torn + 100 valid → all 200 valid records survive", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);

  for (let i = 1; i <= 100; i++) appendLine(fd, `${JSON.stringify(msg(i))}\n`);
  // A torn line: partial JSON, newline-terminated. Must not drop anything after it.
  fs.writeSync(fd, '{"v":1,"seq":101,"kind":"ms\n');
  for (let i = 101; i <= 200; i++) appendLine(fd, `${JSON.stringify(msg(i))}\n`);

  const { records, skipped } = replay(fd);
  const msgs = records.filter((r) => r.kind === "msg");
  expect(msgs.map((r) => r.seq)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  expect(skipped).toBe(1);
  const gaps = records.filter((r) => r.kind === "gap");
  expect(gaps.length).toBe(1);
  expect(gaps[0].skipped).toBe(1);
  closeRoomLog(root, roomId);
});

// --- 3. replay rebuilds identical state -----------------------------------

test("replay rebuilds identical state from the log", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);

  const written: RoomRecord[] = [
    msg(1, "A", "build"),
    msg(2, "B", "build"),
    {
      v: 1,
      seq: 3,
      ts: 1003,
      kind: "claim",
      id: "c3",
      from: "A",
      resource: "build/api",
      ttlMs: 5000,
    },
    {
      v: 1,
      seq: 4,
      ts: 1004,
      kind: "release",
      id: "r4",
      from: "A",
      resource: "build/api",
      reason: "released",
      prevHolder: "A",
    },
    { v: 1, seq: 5, ts: 1005, kind: "member", id: "m5", from: "C", action: "join" },
  ];
  for (const r of written) appendLine(fd, `${JSON.stringify(r)}\n`);

  const { records, skipped } = replay(fd);
  expect(skipped).toBe(0);
  expect(records).toEqual(written);
  closeRoomLog(root, roomId);
});

// --- 4. malformed mid-file record does not shift seq ----------------------

test("a malformed mid-file record is skipped and does not shift later seq values", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);

  appendLine(fd, `${JSON.stringify(msg(1))}\n`);
  appendLine(fd, `${JSON.stringify(msg(2))}\n`);
  fs.writeSync(fd, '{"v":1,"seq":3,"kind":"ms\n'); // corrupt (unparseable)
  appendLine(fd, `${JSON.stringify(msg(4))}\n`);
  // parseable but shape-invalid (unknown kind) — quarantined as "invalid", not "corrupt".
  appendLine(fd, `${JSON.stringify({ v: 1, seq: 5, ts: 1, kind: "bogus", id: "x", from: "A" })}\n`);
  appendLine(fd, `${JSON.stringify(msg(6))}\n`);

  const { records, skipped } = replay(fd);
  expect(skipped).toBe(2);
  expect(records.filter((r) => r.kind === "msg").map((r) => r.seq)).toEqual([1, 2, 4, 6]);
  closeRoomLog(root, roomId);
});

// --- 5. roomIdFor is a pure function of the root --------------------------

test("roomIdFor is a pure function of the root, never derived from a session id", () => {
  const a = "/home/u/.omp/artifacts/tree1/local";
  const b = "/home/u/.omp/artifacts/tree2/local";

  expect(roomIdFor(a)).toBe(roomIdFor(a));
  expect(roomIdFor(a)).not.toBe(roomIdFor(b));
  expect(roomIdFor(a)).toMatch(/^r[0-9a-f]{16}$/);
  expect(roomIdFor(a)).not.toBe("local");

  // Same artifacts dir, two different session ids → same root → same room id.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-store-"));
  TMP.push(dir);
  const root1 = resolveLocalRoot({ getArtifactsDir: () => dir, getSessionId: () => "sess-1" });
  const root2 = resolveLocalRoot({ getArtifactsDir: () => dir, getSessionId: () => "sess-2" });
  expect(root1).toBe(root2);
  expect(roomIdFor(root1)).toBe(roomIdFor(root2));
  expect(roomIdFor(root1)).not.toContain("sess-1");
  expect(roomIdFor(root1)).not.toContain("sess-2");
});

// --- 6. logPathFor is stable and single-convention ------------------------

test("logPathFor is stable and single-convention, and is the file the store writes", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);

  expect(logPathFor(root, roomId)).toBe(logPathFor(root, roomId));
  expect(logPathFor(root, roomId)).toBe(path.join(root, "room", `${roomId}.jsonl`));

  const fd = roomLogFd(root, roomId);
  appendLine(fd, `${JSON.stringify(msg(1))}\n`);
  expect(fs.existsSync(logPathFor(root, roomId))).toBe(true);

  const files = fs.readdirSync(path.join(root, "room")).filter((f) => f.endsWith(".jsonl"));
  expect(files).toEqual([`${roomId}.jsonl`]);
  closeRoomLog(root, roomId);
});

// --- ids: resourceKey / newMessageId --------------------------------------

test("resourceKey is '<topic>/<key>' and newMessageId is a unique UUID v4", () => {
  expect(resourceKey("build", "api.ts")).toBe("build/api.ts");
  const a = newMessageId();
  const b = newMessageId();
  expect(a).not.toBe(b);
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("validateRecord accepts every kind and rejects missing or wrong-typed fields", () => {
  expect(validateRecord(msg(1))).not.toBeNull();
  expect(
    validateRecord({ v: 1, seq: 1, ts: 1, kind: "msg", id: "x", from: "A", topic: "t" }),
  ).toBeNull();
  expect(validateRecord({ v: 1, seq: 1, ts: 1, kind: "bogus", id: "x", from: "A" })).toBeNull();
  expect(
    validateRecord({ v: 2, seq: 1, ts: 1, kind: "msg", id: "x", from: "A", topic: "t", body: "b" }),
  ).toBeNull();
  expect(
    validateRecord({
      v: 1,
      seq: 1,
      ts: 1,
      kind: "release",
      id: "x",
      from: "A",
      resource: "t/k",
      reason: "nope",
      prevHolder: "A",
    }),
  ).toBeNull();
  expect(validateRecord(null)).toBeNull();
  expect(validateRecord("nope")).toBeNull();
  expect(validateRecord([])).toBeNull();
});

test("openRoomLog returns ok for a fresh root and maps a bad path without throwing", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const ok = openRoomLog(root, roomId);
  expect(ok.ok).toBe(true);
  closeRoomLog(root, roomId);

  // A file where the room/ directory must go → mkdir fails (ENOTDIR).
  const badRoot = tempRoot();
  fs.mkdirSync(badRoot, { recursive: true });
  fs.writeFileSync(path.join(badRoot, "room"), "not a dir");
  const bad = openRoomLog(badRoot, roomIdFor(badRoot));
  expect(bad.ok).toBe(false);
  if (!bad.ok)
    expect(["room file not found", "room file unwritable", "room file corrupt"]).toContain(
      bad.error,
    );
});

test("closeRoomLog drops the registry entry and a later roomLogFd reopens the same file", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd1 = roomLogFd(root, roomId);
  appendLine(fd1, `${JSON.stringify(msg(1))}\n`);
  closeRoomLog(root, roomId);
  expect(() => fs.fstatSync(fd1)).toThrow();

  const fd2 = roomLogFd(root, roomId);
  appendLine(fd2, `${JSON.stringify(msg(2))}\n`);
  expect(replay(fd2).records.map((r) => r.seq)).toEqual([1, 2]);
  closeRoomLog(root, roomId);
});

// --- cursors: per-agent, advance on delivery only -------------------------

test("cursors are per-agent, start at logEnd - JOIN_BACKLOG, advance monotonically, lag = logEnd - cursor", () => {
  const store = cursorStore(200);
  expect(initCursor(store, "A")).toBe(200 - JOIN_BACKLOG);
  expect(initCursor(store, "B")).toBe(200 - JOIN_BACKLOG);
  expect(cursorFor(store, "A")).toBe(150);

  bumpCursor(store, "A", 175); // delivery
  expect(cursorFor(store, "A")).toBe(175);
  expect(cursorFor(store, "B")).toBe(150); // per-agent, unaffected
  expect(lagFor(store, "A")).toBe(25);
  expect(lagFor(store, "B")).toBe(50);

  bumpCursor(store, "A", 160); // never rewinds
  expect(cursorFor(store, "A")).toBe(175);

  expect(initCursor(store, "A")).toBe(175); // a rejoin resumes the stored cursor
});

test("initCursor clamps to 0 on a short log and cursorFor never mutates (read ≠ advance)", () => {
  const store = cursorStore(10);
  expect(initCursor(store, "A")).toBe(0);

  const fresh = cursorStore(100);
  expect(cursorFor(fresh, "ghost")).toBe(0);
  expect(fresh.cursors.has("ghost")).toBe(false);
});

test("persistOwnCursor / restoreOwnCursor round-trip through appendEntry('chatroom:cursor')", () => {
  const entries: Array<{ type: string; customType: string; data?: unknown }> = [];
  const pi = {
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ type: "custom", customType, data });
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    sessionManager: { getEntries: () => entries },
  } as unknown as ExtensionContext;

  persistOwnCursor(pi, "r123", 42);
  expect(entries[0].customType).toBe("chatroom:cursor");
  expect(restoreOwnCursor(ctx, "r123")).toBe(42);
  expect(restoreOwnCursor(ctx, "other-room")).toBe(null);
});

// --- config: local://room/config.json + flags -----------------------------

test("config: defaults when absent, save/load round-trip, and resolveRoomId persists once", () => {
  const root = tempRoot();
  expect(configPath(root)).toBe(path.join(root, "room", "config.json"));
  expect(loadRoomConfig(root)).toEqual(DEFAULT_ROOM_CONFIG);

  const cfg = { ...DEFAULT_ROOM_CONFIG, claimTtlMs: 1000, maxBodyBytes: 256 };
  saveRoomConfig(root, cfg);
  expect(loadRoomConfig(root)).toEqual(cfg);

  const id = resolveRoomId(root);
  expect(id).toBe(roomIdFor(root));
  expect(loadRoomConfig(root).roomId).toBe(id);
  expect(resolveRoomId(root)).toBe(id); // idempotent — persisted value wins

  saveRoomConfig(root, { ...cfg, roomId: "custom-room" });
  expect(resolveRoomId(root)).toBe("custom-room");
});

test("registerRoomFlags registers room-panel-key (string) and room-cold-tree (boolean)", () => {
  const flags = new Map<string, { type: string; default?: unknown }>();
  const pi = {
    registerFlag: (
      name: string,
      options: { type: "boolean" | "string"; default?: boolean | string },
    ) => {
      flags.set(name, options);
    },
    getFlag: () => undefined,
  } as unknown as ExtensionAPI;

  registerRoomFlags(pi);
  expect([...flags.keys()].sort()).toEqual(["room-cold-tree", "room-panel-key"]);
  expect(flags.get("room-panel-key")?.type).toBe("string");
  expect(flags.get("room-panel-key")?.default).toBe("");
  expect(flags.get("room-cold-tree")?.type).toBe("boolean");
  expect(flags.get("room-cold-tree")?.default).toBe(true);

  const root = tempRoot();
  saveRoomConfig(root, { ...DEFAULT_ROOM_CONFIG, claimTtlMs: 120_000 });
  expect(resolveRoomConfig(pi, root).claimTtlMs).toBe(120_000);
});

test("enforceRetention prunes to the config's logMaxRecords, not the default 5000", () => {
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  saveRoomConfig(storeRoot, { ...DEFAULT_ROOM_CONFIG, logMaxRecords: 5 });
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    setInterval: () => 0,
    clearInterval: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);

  for (let i = 0; i < 10; i++) {
    store.append({ kind: "msg", from: "A", topic: "t", body: "b" });
  }
  expect(store.records.length).toBe(10);

  enforceRetention(store, Date.now());
  // 5 remaining + 1 gap record appended by enforceRetention
  expect(store.records.filter((r) => r.kind !== "gap").length).toBe(5);
});

// --- F1: room tool registers card renderers ---

test("room tool registers renderCall/renderResult/describeCall/describeResult", () => {
  let tool: Record<string, unknown> | undefined;
  const pi = {
    zod: zodStub,
    registerTool: (def: Record<string, unknown>) => {
      if (def.name === "room") tool = def;
    },
  } as unknown as ExtensionAPI;
  registerRoomTool(pi);
  expect(tool).toBeDefined();
  expect(tool!.renderCall).toBeDefined();
  expect(tool!.renderResult).toBeDefined();
  expect(tool!.describeCall).toBeDefined();
  expect(tool!.describeResult).toBeDefined();
});

// --- F3: restoreOwnCursor is called by before_agent_start ---

test("before_agent_start restores a persisted cursor when it is higher", async () => {
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  const roomId = roomIdFor(storeRoot);

  const entries: Array<{ type: string; customType: string; data?: unknown }> = [
    { type: "custom", customType: "chatroom:cursor", data: { roomId, seq: 80 } },
  ];

  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    sessionManager: { getEntries: () => entries },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
  } as unknown as ExtensionContext;

  const store = roomStoreFor(ctx);
  for (let i = 0; i < 100; i++) {
    store.append({ kind: "msg", from: "A", topic: "t", body: "b" });
  }

  initCursor(store, "A");
  expect(cursorFor(store, "A")).toBe(50);

  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  const pi = {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    appendEntry() {},
    getFlag() {
      return undefined;
    },
    registerFlag() {},
  } as unknown as ExtensionAPI;

  registerHooks(pi);

  let result: unknown;
  for (const handler of handlers.get("before_agent_start") ?? []) {
    result = await handler(
      { type: "before_agent_start", prompt: "hi", systemPrompt: ["BASE"] },
      ctx,
    );
  }

  expect((result as { systemPrompt?: string[] })?.systemPrompt).toBeDefined();
  expect(cursorFor(store, "A")).toBe(80);
});

// --- F4: enforceRetention appends the gap via noteGap ---

test("enforceRetention appends a gap record via noteGap", () => {
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  saveRoomConfig(storeRoot, { ...DEFAULT_ROOM_CONFIG, logMaxRecords: 5 });
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);

  for (let i = 0; i < 10; i++) {
    store.append({ kind: "msg", from: "A", topic: "t", body: "b" });
  }
  expect(store.records.length).toBe(10);

  const gap = enforceRetention(store, Date.now());
  expect(gap).not.toBeNull();
  expect(gap!.kind).toBe("gap");
  if (gap!.kind !== "gap") throw new Error("expected gap record");
  expect(gap!.skipped).toBe(5);
  expect(gap!.reason).toBe("retention");
  expect(store.records.length).toBe(6); // 5 remaining + 1 gap
});

// --- F5: claim adds topic to heldTopics; classify returns T1 ---

test("claim adds topic to heldTopics and classify returns T1 for that topic", async () => {
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);

  let tool:
    | {
        execute: (
          id: string,
          params: Record<string, unknown>,
          signal: AbortSignal,
          onUpdate: (u: unknown) => void,
          ctx: ExtensionContext,
        ) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: Record<string, unknown>;
        }>;
      }
    | undefined;
  const pi = {
    zod: zodStub,
    registerTool: (def: {
      name: string;
      execute: typeof tool extends infer T ? (T extends { execute: infer E } ? E : never) : never;
    }) => {
      if (def.name === "room") tool = def as typeof tool;
    },
  } as unknown as ExtensionAPI;
  registerRoomTool(pi);

  const result = await tool!.execute(
    "test-call",
    { op: "claim", topic: "build", key: "api", ttl: 5000 },
    new AbortController().signal,
    () => {},
    ctx,
  );
  expect(result.details).toMatchObject({ ok: true, op: "claim" });

  const viewer = store.members.get("A")!;
  expect(viewer.heldTopics.has("build")).toBe(true);

  const msg = {
    v: 1,
    seq: 999,
    ts: 1000,
    kind: "msg",
    id: "x",
    from: "B",
    topic: "build",
    body: "b",
  } as RoomRecord;
  expect(classify(msg, viewer)).toBe("T1");
});

// --- F6: post truncates oversized body with read handle ---

test("post truncates an oversized body and appends the read handle", async () => {
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  saveRoomConfig(storeRoot, { ...DEFAULT_ROOM_CONFIG, maxBodyBytes: 100_000 });
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);

  let tool:
    | {
        execute: (
          id: string,
          params: Record<string, unknown>,
          signal: AbortSignal,
          onUpdate: (u: unknown) => void,
          ctx: ExtensionContext,
        ) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: Record<string, unknown>;
        }>;
      }
    | undefined;
  const pi = {
    zod: zodStub,
    registerTool: (def: {
      name: string;
      execute: typeof tool extends infer T ? (T extends { execute: infer E } ? E : never) : never;
    }) => {
      if (def.name === "room") tool = def as typeof tool;
    },
  } as unknown as ExtensionAPI;
  registerRoomTool(pi);

  // 9000 chars = 2250 tokens > 2048 token budget
  const bigBody = "x".repeat(9000);
  const result = await tool!.execute(
    "test-call",
    { op: "post", topic: "t", body: bigBody },
    new AbortController().signal,
    () => {},
    ctx,
  );
  expect(result.details).toMatchObject({ ok: true, op: "post" });

  const record = store.records[store.records.length - 1]!;
  expect(record.kind).toBe("msg");
  const body = (record as { body: string }).body;
  expect(body.length).toBeLessThan(bigBody.length);
  expect(body).toContain("…");
  expect(body).toContain('room{op:"read"}');
});

// --- F12: appendLine flushes each write (spec §1 "flush each write") -------

test("appendLine fsyncs the fd, so a crash cannot lose the last write", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);
  const spy = spyOn(fs, "fsyncSync");
  try {
    appendLine(fd, `${JSON.stringify(msg(1))}\n`);
    // I5 says appends are synchronous AND durable; fsync is what makes durability true.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(fd);
  } finally {
    spy.mockRestore();
    closeRoomLog(root, roomId);
  }
});
