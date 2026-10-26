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
  acquireRoomLock,
  appendLine,
  closeRoomLog,
  lockPathFor,
  openRoomLog,
  releaseRoomLock,
  replay,
  roomLogFd,
  validateRecord,
} from "../src/store/log";
import {
  disposeRoomSession,
  enforceRetention,
  type RoomStore,
  roomStoreFor,
  roomTimers,
  storeFor,
} from "../src/store/room-store";
import type { RoomRecord } from "../src/store/schema";
import { findWaitCycle, setWaitEdges } from "../src/store/wait-graph";
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

test("a record with a malformed status ledger is quarantined as invalid", () => {
  // Lines 292-297: a msg whose status is not five {reason, answer} string
  // pairs fails validation — replay skips it without shifting later seqs.
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);
  appendLine(fd, `${JSON.stringify(msg(1))}\n`);
  const badStatus = {
    is_request_satisfied: { reason: "r", answer: "a" },
    is_in_loop: { reason: "r", answer: "a" },
    is_progress_being_made: { reason: "r", answer: "a" },
    next_speaker: { reason: "r", answer: "a" },
    instruction_or_question: { reason: 42, answer: "a" },
  };
  appendLine(fd, `${JSON.stringify({ ...msg(2), status: badStatus })}\n`);
  appendLine(fd, `${JSON.stringify(msg(3))}\n`);
  const { records, skipped } = replay(fd);
  expect(skipped).toBe(1);
  expect(records.filter((r) => r.kind === "msg").map((r) => r.seq)).toEqual([1, 3]);
  expect(records.filter((r) => r.kind === "gap").length).toBe(1);
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

test("per-kind field violations are quarantined without shifting later seqs", () => {
  // Lines 329-351: each kind's extra shape check. One bad line per arm,
  // all skipped as invalid; the good records keep their seqs.
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);
  const badPerformative = { ...msg(1), performative: "shout" };
  const badTtl = {
    v: 1,
    seq: 2,
    ts: 1002,
    kind: "claim",
    id: "c2",
    from: "A",
    resource: "t/k",
    ttlMs: NaN,
  };
  const badAction = {
    v: 1,
    seq: 3,
    ts: 1003,
    kind: "member",
    id: "m3",
    from: "A",
    action: "explode",
  };
  const badReason = {
    v: 1,
    seq: 4,
    ts: 1004,
    kind: "release",
    id: "r4",
    from: "A",
    resource: "t/k",
    reason: "vanished",
    prevHolder: "A",
  };
  const badGap = {
    v: 1,
    seq: 5,
    ts: 1005,
    kind: "gap",
    id: "g5",
    from: "system",
    skipped: 1.5,
    reason: "retention",
  };
  for (const bad of [badPerformative, badTtl, badAction, badReason, badGap]) {
    appendLine(fd, `${JSON.stringify(bad)}\n`);
  }
  appendLine(fd, `${JSON.stringify(msg(6))}\n`);
  const { records, skipped } = replay(fd);
  expect(skipped).toBe(5);
  expect(records.filter((r) => r.kind === "msg").map((r) => r.seq)).toEqual([6]);
  closeRoomLog(root, roomId);
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

test("registerRoomFlags registers only room-panel-key (room-cold-tree was removed)", () => {
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
  expect([...flags.keys()].sort()).toEqual(["room-panel-key"]);
  expect(flags.get("room-panel-key")?.type).toBe("string");
  expect(flags.get("room-panel-key")?.default).toBe("");

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

test("enforceRetention drops the idempotency key with its pruned post", () => {
  // Line 389: the key's promise ("this post happened once") dies with the
  // record it referred to — a repost after the prune is a new post.
  const root = tempRoot();
  const storeRoot = path.join(root, ".omp-room");
  saveRoomConfig(storeRoot, { ...DEFAULT_ROOM_CONFIG, logMaxRecords: 3 });
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root: storeRoot },
    setInterval: () => 0,
    clearInterval: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);
  store.append({ kind: "msg", from: "A", topic: "t", body: "keyed", idemKey: "k1" });
  for (let i = 0; i < 5; i++) store.append({ kind: "msg", from: "A", topic: "t", body: `f${i}` });
  expect(store.idemKeys.size).toBe(1);
  enforceRetention(store, Date.now());
  expect(store.idemKeys.size).toBe(0);
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

// --- roomTimers: managed-timer hygiene (plan 001) ---------------------------

test("roomTimers.stop clears through the captured host clearTimer, not the bare global", () => {
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  const cleared: unknown[] = [];
  let next = 1;
  const ctx = {
    setInterval: () => next++ as unknown as Timer,
    clearTimer: (handle: unknown) => {
      cleared.push(handle);
    },
  } as unknown as ExtensionContext;
  try {
    roomTimers.start(root, ctx);
    roomTimers.stop(root);
    // prune + sweep: exactly the two scheduled handles, via the host clearer.
    expect(cleared).toEqual([1, 2]);
  } finally {
    roomTimers.stop(root); // safe no-op: stop() deletes before clearing
    store.dispose();
  }
});

test("roomTimers.start with no timer API schedules nothing and never throws", () => {
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  const ctx = {} as unknown as ExtensionContext;
  expect(() => roomTimers.start(root, ctx)).not.toThrow();
  // No entry, so stop is a no-op and no raw timer was ever scheduled.
  expect(() => roomTimers.stop(root)).not.toThrow();
  store.dispose();
});

test("roomTimers prune tick runs enforceRetention on the store", () => {
  // Line 434: the prune handle calls enforceRetention with the live store.
  // Captured (not fired by a real clock): invoking the handle prunes past
  // the cap and appends the retention gap record.
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  store.config.logMaxRecords = 3;
  const callbacks: Array<() => void> = [];
  const ctx = {
    setInterval: (fn: () => void) => {
      callbacks.push(fn);
      return callbacks.length as unknown as Timer;
    },
    clearTimer: () => {},
  } as unknown as ExtensionContext;
  for (let i = 0; i < 5; i++) store.append({ kind: "msg", from: "A", topic: "t", body: `m${i}` });
  roomTimers.start(root, ctx);
  try {
    expect(callbacks.length).toBe(2);
    callbacks[0]();
    expect(store.records.filter((r) => r.kind !== "gap").length).toBe(3);
    expect(store.records.some((r) => r.kind === "gap")).toBe(true);
  } finally {
    roomTimers.stop(root);
    store.dispose();
  }
});

// --- cross-process single-writer lock (plan 017 followup) --------------------

test("acquire/release round-trips: the lock file appears and disappears", () => {
  const root = tempRoot();
  acquireRoomLock(root);
  expect(fs.existsSync(lockPathFor(root))).toBe(true);
  expect(fs.readFileSync(lockPathFor(root), "utf-8")).toBe(String(process.pid));
  releaseRoomLock(root);
  expect(fs.existsSync(lockPathFor(root))).toBe(false);
});

test("an unreadable lock entry is treated as stale and reaped, not fatal", () => {
  // Lines 56-57: a lock path that cannot be read (here a directory, so
  // readFileSync throws EISDIR) degrades to owner 0 — stale — and the
  // acquire proceeds instead of failing loudly on garbage.
  const root = tempRoot();
  const lockPath = lockPathFor(root);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.mkdirSync(lockPath);
  acquireRoomLock(root);
  expect(fs.readFileSync(lockPath, "utf-8")).toBe(String(process.pid));
  releaseRoomLock(root);
  expect(fs.existsSync(lockPath)).toBe(false);
});

test("a second live holder fails loudly; openRoomLog reports the locked variant", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId); // first opener takes the lock
  try {
    // Simulate a second process: drop the in-process fd entry so roomLogFd re-opens.
    closeRoomLog(root, roomId); // releases fd AND lock — re-acquire to hold it
    acquireRoomLock(root);
    // Same process re-opening hits its OWN live lock: still loud (pid check is honest).
    expect(() => acquireRoomLock(root)).toThrow(/room file locked by pid/);
    const second = openRoomLog(root, roomId);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("room file locked by another session");
  } finally {
    releaseRoomLock(root);
    void fd;
  }
});

test("a stale lock from a dead pid is reaped, not fatal", () => {
  const root = tempRoot();
  fs.mkdirSync(`${root}/room`, { recursive: true });
  fs.writeFileSync(lockPathFor(root), "999999999"); // no such pid
  expect(() => acquireRoomLock(root)).not.toThrow();
  expect(fs.readFileSync(lockPathFor(root), "utf-8")).toBe(String(process.pid));
  releaseRoomLock(root);
});

test("releaseRoomLock never unlinks another owner's lock", () => {
  const root = tempRoot();
  fs.mkdirSync(`${root}/room`, { recursive: true });
  fs.writeFileSync(lockPathFor(root), "999999999");
  releaseRoomLock(root); // not our pid → must not unlink
  expect(fs.existsSync(lockPathFor(root))).toBe(true);
});

// --- wait-edge eviction on dispose (the graph is per-root global state) -------

test("disposeRoomSession evicts the room's wait edges with its other per-root state", () => {
  // forgetWaitEdges was dead code: nothing called it, so a disposed room's
  // wait graph lived in the global map for the life of the process. A stale
  // edge makes a LATER room on the same root see a phantom cycle.
  const root = tempRoot();
  const ctx = {
    cwd: root,
    agent: { id: "A", kind: "main" },
    localProtocolOptions: { root },
    setInterval: () => 0,
    clearInterval: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);
  // A waits B, B waits A: a real cycle while both edges are live.
  setWaitEdges(store.root, "A", [{ kind: "agent", agentId: "B" }]);
  setWaitEdges(store.root, "B", [{ kind: "agent", agentId: "A" }]);
  expect(
    findWaitCycle(store.root, "A", [{ kind: "agent", agentId: "B" }], () => undefined),
  ).not.toBeNull();
  disposeRoomSession(ctx);
  // After dispose the graph is gone: the same query finds no cycle.
  expect(
    findWaitCycle(store.root, "A", [{ kind: "agent", agentId: "B" }], () => undefined),
  ).toBeNull();
});

test("records with non-string array fields are quarantined as invalid", () => {
  // Lines 287-288 via 320/323: mention/dependsOn must be string arrays —
  // a number inside (or a bare string) fails validation and the line is skipped.
  const root = tempRoot();
  const roomId = roomIdFor(root);
  const fd = roomLogFd(root, roomId);
  appendLine(fd, `${JSON.stringify({ ...msg(1), mention: ["A", 42] })}\n`);
  appendLine(fd, `${JSON.stringify({ ...msg(2), dependsOn: "build/step" })}\n`);
  appendLine(fd, `${JSON.stringify(msg(3))}\n`);
  const { records, skipped } = replay(fd);
  expect(skipped).toBe(2);
  expect(records.filter((r) => r.kind === "msg").map((r) => r.seq)).toEqual([3]);
  closeRoomLog(root, roomId);
});
