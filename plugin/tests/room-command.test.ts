import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import {
  ROOM_SUBCOMMANDS,
  registerRoomCommand,
  roomCompletions,
} from "../src/commands/room-command";
import { roomIdFor } from "../src/ids";
import { enqueueWaiter } from "../src/store/claims";
import { loadRoomConfig } from "../src/store/config";
import { resetRoomStores, storeFor } from "../src/store/room-store";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-command-"));
}

afterEach(() => {
  resetRoomStores();
});

/** Capture the registered handler off a stub pi (same shape as panel.test.ts's harness). */
function captureHandler(
  notified: string[],
): (args: string, ctx: ExtensionContext) => Promise<void> {
  let handler: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
  const pi = {
    registerCommand: (_name: string, options: { handler: typeof handler }) => {
      handler = options.handler;
    },
    getFlag: () => undefined,
    // Headless report() goes to pi.logger.info, not ctx.ui.notify.
    logger: {
      info: (message: string) => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionAPI;
  registerRoomCommand(pi);
  if (!handler) throw new Error("registerRoomCommand registered no handler");
  return handler;
}

function headlessCtx(root: string, notified: string[]): ExtensionContext {
  return {
    hasUI: false,
    mode: "print",
    agent: { id: "Main", kind: "main" },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-cmd" },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
    ui: {
      notify: (message: string) => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionContext;
}

// The handler resolves its store via roomStoreFor(ctx) → <cwd>/.omp-room; the assertion store
// must be opened on that same root or the two never meet.
function roomStoreForCwd(root: string): ReturnType<typeof storeFor> {
  const roomRoot = `${root}/.omp-room`;
  return storeFor(roomRoot, roomIdFor(roomRoot));
}

test("/room claim with a non-numeric TTL appends nothing and warns", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step notanumber", headlessCtx(root, notified));
  expect(store.records.filter((r) => r.kind === "claim")).toHaveLength(0);
  expect(store.claims.has("build/step")).toBe(false);
  expect(notified.some((line) => line.includes("bad ttlMs"))).toBe(true);
});

test("/room claim with a numeric TTL grants with that lease (positive control)", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step 60000", headlessCtx(root, notified));
  expect(store.claims.get("build/step")?.ttlMs).toBe(60_000);
  expect(notified.some((line) => line.includes("granted"))).toBe(true);
});

test("/room claim re-claims your own lease → renewed with the new expiry, no contended record", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step 60000", headlessCtx(root, notified));
  expect(store.claims.get("build/step")?.holder).toBe("Main");

  await handler("claim build step 120000", headlessCtx(root, notified));

  expect(notified.some((line) => line.includes("renewed"))).toBe(true);
  expect(notified.some((line) => line.includes("expires in 120s"))).toBe(true);
  // The renewal replaces the lease: same holder, new expiry …
  expect(store.claims.get("build/step")?.holder).toBe("Main");
  expect(store.claims.get("build/step")?.ttlMs).toBe(120_000);
  // … appended as a second claim record, and the loss path never fires.
  expect(store.records.filter((r) => r.kind === "claim")).toHaveLength(2);
  expect(store.records.filter((r) => r.kind === "contended")).toHaveLength(0);
});

test("/room claim on another holder's live lease → denied with a contended record", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // A fresh 60s lease is live, so the renew-own path cannot fire — this must deny.
  store.append({ kind: "claim", from: "Other", resource: "build/step", ttlMs: 60_000 });

  await handler("claim build step 60000", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("denied, held by Other");
  expect(store.claims.get("build/step")?.holder).toBe("Other");
  // R5 — the loss is a measurement: one contended record naming claimant and holder …
  const contended = store.records.filter((r) => r.kind === "contended");
  expect(contended).toHaveLength(1);
  expect(contended[0]).toMatchObject({ from: "Main", resource: "build/step", holder: "Other" });
  // … and no new claim record.
  expect(store.records.filter((r) => r.kind === "claim")).toHaveLength(1);
});

test("/room claim renewal notifies the waiter but does not promote it", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step 60000", headlessCtx(root, notified));
  // W is mid-wait on build/step; the renewal re-appends a claim on that resource …
  store.members.set("Waiter", {
    agentId: "Waiter",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
    waitedResource: "build/step",
  });
  enqueueWaiter(store, "build/step", "Waiter");
  const calls: Send[] = [];
  registerSession("Waiter", calls);
  try {
    await handler("claim build step 60000", headlessCtx(root, notified));
    expect(notified.some((line) => line.includes("renewed"))).toBe(true);
    // … which classifies T1 for the waiter (M-8) and pushes an aside …
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
    // … but the lease stays with the holder: no promotion, no release record.
    expect(store.claims.get("build/step")?.holder).toBe("Main");
    expect(store.records.filter((r) => r.kind === "release")).toHaveLength(0);
    expect(store.waiters.get("build/step")).toEqual(["Waiter"]);
  } finally {
    AgentRegistry.global().unregister("Waiter");
  }
});

test("/room config shows only live knobs — no inert line, no reserved flags", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  roomStoreForCwd(root);
  await handler("config", headlessCtx(root, notified));
  const text = notified.join("\n");
  // Live knobs appear on live lines.
  expect(text).toContain("live (governor): maxT1PerTurn=");
  expect(text).toContain("live (retention/sweep): logMaxRecords=");
  // The removed surfaces are gone entirely.
  expect(text).not.toContain("inert");
  expect(text).not.toContain("coldTreeEnabled");
  expect(text).not.toContain("panelKey");
  expect(text).not.toContain("room-cold-tree");
  expect(text).toContain('--room-panel-key=""');
});

// --- plan 007 — the command path runs the delivery pass ----------------------

interface Send {
  payload: Record<string, unknown>;
  options: Record<string, unknown>;
}

/** A fake live session in the global registry that records its custom messages. */
function registerSession(id: string, calls: Send[]): void {
  const session = {
    async sendCustomMessage(payload: unknown, options?: unknown): Promise<boolean> {
      calls.push({
        payload: payload as Record<string, unknown>,
        options: options as Record<string, unknown>,
      });
      return true;
    },
  };
  AgentRegistry.global().register({
    id,
    displayName: id,
    kind: "sub",
    status: "running",
    session: session as never,
  });
}

test("/room post pushes to a follower (T1), not just the log", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // B follows the topic, so the post classifies T1 for B and must push.
  store.members.set("Follower", {
    agentId: "Follower",
    joinedAtSeq: 0,
    topics: new Set(["build"]),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  const calls: Send[] = [];
  registerSession("Follower", calls);
  try {
    await handler("post build hello from the command", headlessCtx(root, notified));
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
    expect(JSON.stringify(calls[0]!.payload)).toContain("hello from the command");
  } finally {
    AgentRegistry.global().unregister("Follower");
  }
});

test("/room claim notifies a waiter on the resource (M-8 T1)", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // W is mid-wait on build/step, so the claim classifies T1 for W and must push.
  store.members.set("Waiter", {
    agentId: "Waiter",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
    waitedResource: "build/step",
  });
  const calls: Send[] = [];
  registerSession("Waiter", calls);
  try {
    await handler("claim build step 60000", headlessCtx(root, notified));
    expect(store.claims.get("build/step")?.holder).toBe("Main");
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
  } finally {
    AgentRegistry.global().unregister("Waiter");
  }
});

test("/room join records membership even when the agent already has a cursor", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const ctx = headlessCtx(root, notified);
  // The hook's initCursor runs for EVERY agent at turn start, so the cursor map already
  // contains the agent. A cursor-keyed join check therefore never fires and the agent never
  // gets a member{join} record — it stays out of the board roster and out of the log.
  store.cursors.set("Main", 0);
  expect(store.members.has("Main")).toBe(false);

  await handler("join", ctx);

  expect(store.records.filter((r) => r.kind === "member" && r.from === "Main")).toHaveLength(1);
  expect(store.members.has("Main")).toBe(true);
  // A second join is still a no-op: no second member record.
  await handler("join", ctx);
  expect(store.records.filter((r) => r.kind === "member" && r.from === "Main")).toHaveLength(1);
});
// --- /room release: the arbiter path (release → promote → deliver) --------------

test("/room release drops your own claim and the board no longer lists it", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  store.append({ kind: "claim", from: "Main", resource: "build/step", ttlMs: 60_000 });
  expect(store.claims.get("build/step")?.holder).toBe("Main");

  await handler("release build step", headlessCtx(root, notified));

  expect(store.claims.has("build/step")).toBe(false);
  expect(notified.join("\n")).toContain("room release build/step → released");
  expect(store.records.filter((r) => r.kind === "release")).toHaveLength(1);

  notified.length = 0;
  await handler("board", headlessCtx(root, notified));
  expect(notified.join("\n")).toContain("claims: none");
  expect(notified.join("\n")).not.toContain("build/step");
});

test("/room release promotes the oldest waiter with the dropped lease", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  store.append({ kind: "claim", from: "Main", resource: "build/step", ttlMs: 60_000 });
  store.members.set("Waiter", {
    agentId: "Waiter",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
    waitedResource: "build/step",
  });
  enqueueWaiter(store, "build/step", "Waiter");
  const calls: Send[] = [];
  registerSession("Waiter", calls);
  try {
    await handler("release build step", headlessCtx(root, notified));
    expect(store.claims.get("build/step")?.holder).toBe("Waiter");
    expect(store.waiters.get("build/step")).toBeUndefined();
    expect(notified.join("\n")).toContain("room release build/step → released");
    // The release record classifies T1 for the waiter (waitedResource match) and must push;
    // the waiter's own promoted claim is self-authored, so it only bumps the cursor.
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
  } finally {
    AgentRegistry.global().unregister("Waiter");
  }
});

test("/room release of someone else's live claim is refused and the claim stands", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // A fresh 60s lease is not stale, so the reclaim path cannot fire — this must deny.
  store.append({ kind: "claim", from: "Other", resource: "build/step", ttlMs: 60_000 });

  await handler("release build step", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("denied, held by Other");
  expect(store.claims.get("build/step")?.holder).toBe("Other");
  expect(store.records.filter((r) => r.kind === "release")).toHaveLength(0);
});

// --- /room completions + config set -------------------------------------------

test('roomCompletions("") returns all six subcommands with help text', () => {
  const completions = roomCompletions("");
  expect(completions.map((c) => c.value).sort()).toEqual([...ROOM_SUBCOMMANDS].sort());
  for (const c of completions) {
    expect(c.label).toBe(c.value);
    expect(typeof c.description).toBe("string");
    expect(c.description!.length).toBeGreaterThan(0);
  }
});

test("roomCompletions filters by prefix and never returns null", () => {
  const filtered = roomCompletions("c");
  expect(filtered.map((c) => c.value).sort()).toEqual(["claim", "config"]);
  expect(roomCompletions("nope")).toEqual([]);
  expect(Array.isArray(roomCompletions(""))).toBe(true);
});

test("/room config set applies a valid number and reports the write", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  roomStoreForCwd(root);

  await handler("config set maxBodyBytes=4096", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("maxBodyBytes=4096");
  expect(loadRoomConfig(`${root}/.omp-room`).maxBodyBytes).toBe(4096);
});

test("/room config set applies a valid string and reports the write", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  roomStoreForCwd(root);

  await handler("config set roomId=custom-room", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("roomId=custom-room");
  expect(loadRoomConfig(`${root}/.omp-room`).roomId).toBe("custom-room");
});

test("/room config set with an unknown key is refused and changes nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const storeRoot = `${root}/.omp-room`;
  roomStoreForCwd(root);
  // Warm-up: opening the store persists the minted roomId (resolveRoomId). Snapshot after so
  // the refusal assertion compares the set op alone, not the open side effect.
  await handler("config", headlessCtx(root, notified));
  notified.length = 0;
  const before = loadRoomConfig(storeRoot);

  await handler("config set nope=1", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("unknown key or bad value");
  expect(loadRoomConfig(storeRoot)).toEqual(before);
});

test("/room config set with an unparseable number or boolean is refused", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const storeRoot = `${root}/.omp-room`;
  roomStoreForCwd(root);
  // Same warm-up as above: the store open persists the minted roomId.
  await handler("config", headlessCtx(root, notified));
  notified.length = 0;
  const before = loadRoomConfig(storeRoot);

  await handler("config set maxBodyBytes=notanumber", headlessCtx(root, notified));
  await handler("config set claimTtlMs=true", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("unknown key or bad value");
  expect(loadRoomConfig(storeRoot)).toEqual(before);
});

// --- validation branches: warnings refuse and mutate nothing ------------------

test("/room release with no args warns and appends nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const before = store.records.length;

  await handler("release", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("release requires <topic> <key>");
  expect(store.records.length).toBe(before);
  expect(store.claims.size).toBe(0);
});

test("/room release of an unknown resource warns and appends nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const before = store.records.length;

  await handler("release build missing", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("unknown resource");
  expect(store.records.length).toBe(before);
  expect(store.claims.has("build/missing")).toBe(false);
});

test("/room release of someone else's stale claim reclaims and names the successor", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // ttlMs 0 is already past at append time, so the lease is stale without any clock tricks.
  store.append({ kind: "claim", from: "Other", resource: "build/step", ttlMs: 0 });
  store.members.set("Waiter", {
    agentId: "Waiter",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
    waitedResource: "build/step",
  });
  enqueueWaiter(store, "build/step", "Waiter");

  await handler("release build step", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("reclaimed (was stale)");
  expect(notified.join("\n")).toContain("Waiter");
  expect(store.claims.get("build/step")?.holder).toBe("Waiter");
  expect(store.records.some((r) => r.kind === "release" && r.reason === "reclaimed")).toBe(true);
});

test("/room post with no body warns and appends nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const before = store.records.length;

  await handler("post build", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("post requires <topic> <body>");
  expect(store.records.length).toBe(before);
  expect(store.records.some((r) => r.kind === "msg")).toBe(false);
});

test("/room post over maxBodyBytes errors and appends nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const before = store.records.length;

  await handler(`post build ${"x".repeat(9000)}`, headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("body exceeds maxBodyBytes");
  expect(store.records.length).toBe(before);
  expect(store.records.some((r) => r.kind === "msg")).toBe(false);
});

test("/room config set with no assignment warns and changes nothing", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const storeRoot = `${root}/.omp-room`;
  roomStoreForCwd(root);
  await handler("config", headlessCtx(root, notified));
  notified.length = 0;
  const before = loadRoomConfig(storeRoot);

  await handler("config set", headlessCtx(root, notified));

  expect(notified.join("\n")).toContain("config set requires <key>=<value>");
  expect(loadRoomConfig(storeRoot)).toEqual(before);
});
