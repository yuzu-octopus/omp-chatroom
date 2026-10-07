import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_CAPS, resetTurnBudget } from "../src/attention/governor";
import {
  contended,
  dequeueWaiter,
  enqueueWaiter,
  expireStale,
  grant,
  hydrateClaims,
  reclaimIfStale,
  release,
  requeueWaiter,
  resolveWaiters,
} from "../src/store/claims";
import {
  disposeRoomSession,
  type RoomStore,
  resetRoomStores,
  roomStoreFor,
  storeFor,
} from "../src/store/room-store";
import { registerRoomTool } from "../src/tools/room";

// §3.1 — a real store over a real temp root; the real JSONL log is written (§3.3).
const ROOM_ID = "rtool";

function newStore(): RoomStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  return storeFor(root, ROOM_ID);
}

// §3.4 — holder status comes from the host AgentRegistry (real, not faked).
function registerAgent(id: string, status: "running" | "parked" | "aborted"): void {
  AgentRegistry.global().register({ id, displayName: id, kind: "sub", session: null, status });
}

afterEach(() => {
  resetRoomStores();
});

// --- test 1 — first-writer-wins -------------------------------------------------

test("first-writer-wins: A claims, B's claim returns {ok:false, holder:'A'} and appends nothing", () => {
  const s = newStore();
  const a = grant(s, "build/step", "A", 60_000);
  expect(a.ok).toBe(true);
  if (a.ok) {
    expect(a.claim.holder).toBe("A");
    expect(a.claim.ttlMs).toBe(60_000);
    expect(a.claim.acquiredAt).toBeGreaterThan(0);
  }

  const seqAfterA = s.seq;
  const recordsAfterA = s.records.length;

  const b = grant(s, "build/step", "B", 60_000);
  expect(b.ok).toBe(false);
  if (!b.ok) {
    expect(b.holder).toBe("A");
    expect(b.expiresAt).toBeGreaterThan(Date.now());
  }
  // a loss is not state: no record appended, no seq consumed
  expect(s.records.length).toBe(recordsAfterA);
  expect(s.seq).toBe(seqAfterA);
});

// --- test 2 — release promotes the oldest waiter --------------------------------

test("release promotes the oldest waiter AND grants it the lease", () => {
  const s = newStore();
  expect(grant(s, "build/step", "A", 45_000).ok).toBe(true);
  enqueueWaiter(s, "build/step", "B");
  enqueueWaiter(s, "build/step", "C");

  expect(release(s, "build/step", "A", "released")).toBe(true);

  const held = s.claims.get("build/step");
  expect(held?.holder).toBe("B"); // the OLDEST waiter, not C
  expect(held?.ttlMs).toBe(45_000); // granted with the dropped claim's ttl
  expect(s.waiters.get("build/step")).toEqual(["C"]); // B dequeued, C still waiting

  const last = s.records.at(-1)!;
  expect(last.kind).toBe("claim");
  if (last.kind === "claim") expect(last.from).toBe("B");

  // the release record itself carries prevHolder = the releaser (M11)
  const rel = s.records.filter((r) => r.kind === "release").at(-1)!;
  if (rel.kind === "release") {
    expect(rel.reason).toBe("released");
    expect(rel.prevHolder).toBe("A");
  }
});

// --- test 3 — re-queue, never fail ---------------------------------------------

test("re-queue: two waiters, a third agent grabs the resource first → the first waiter is re-queued, not failed", () => {
  const s = newStore();
  enqueueWaiter(s, "build/step", "B");
  enqueueWaiter(s, "build/step", "C");

  // A third agent takes the free resource before any promotion runs.
  expect(grant(s, "build/step", "D", 60_000).ok).toBe(true);

  // resolveWaiters must not double-grant while D holds.
  expect(resolveWaiters(s, "build/step", 1_000)).toBeNull();
  expect(s.claims.get("build/step")?.holder).toBe("D");

  // The displaced waiter is moved to the BACK and stays waiting — it does NOT fail.
  requeueWaiter(s, "build/step", "B");
  expect(s.waiters.get("build/step")).toEqual(["C", "B"]);

  // dequeue/requeue are idempotent-safe: dequeue removes, second dequeue is a no-op.
  dequeueWaiter(s, "build/step", "C");
  dequeueWaiter(s, "build/step", "C");
  expect(s.waiters.get("build/step")).toEqual(["B"]);
});

// --- test 4 — expireStale (the TIMER path) --------------------------------------

test("expireStale releases a TTL-expired claim and appends release{reason:'expired', prevHolder}", () => {
  const s = newStore();
  grant(s, "build/step", "A", 1_000);

  const dropped = expireStale(s, Date.now() + 5_000);
  expect(dropped.length).toBe(1);
  expect(dropped[0].resource).toBe("build/step");
  expect(dropped[0].prev).toBe("A");
  expect(dropped[0].next).toBeUndefined(); // timer path: no successor

  expect(s.claims.has("build/step")).toBe(false);

  const rel = s.records.at(-1)!;
  expect(rel.kind).toBe("release");
  if (rel.kind === "release") {
    expect(rel.reason).toBe("expired");
    expect(rel.prevHolder).toBe("A");
  }

  // the resource is free again
  expect(grant(s, "build/step", "B", 1_000).ok).toBe(true);
  // a second sweep drops B's fresh (now stale) claim too
  expect(expireStale(s, Date.now() + 60_000).length).toBe(1);
});

test("expireStale is a no-op while the TTL is live", () => {
  const s = newStore();
  grant(s, "build/step", "A", 60_000);
  expect(expireStale(s, Date.now()).length).toBe(0);
  expect(s.claims.get("build/step")?.holder).toBe("A");
});

// --- test 5 — parked/aborted holder is reclaimable ------------------------------

test("a parked/aborted holder's claim is reclaimable", () => {
  const s = newStore();
  grant(s, "build/step", "A", 3_600_000); // long TTL — NOT expired
  registerAgent("A", "parked");
  enqueueWaiter(s, "build/step", "B"); // the contender

  const claimed = reclaimIfStale(s, "build/step", Date.now());
  expect(claimed?.holder).toBe("B"); // the waiter got the lease
  expect(s.claims.get("build/step")?.holder).toBe("B");

  const rel = s.records.filter((r) => r.kind === "release").at(-1)!;
  expect(rel.kind).toBe("release");
  if (rel.kind === "release") {
    expect(rel.reason).toBe("reclaimed");
    expect(rel.prevHolder).toBe("A"); // the DISPLACED holder, not the reclaimer
  }
});

test("an aborted holder's claim is reclaimable and a fresh claim is not", () => {
  const s = newStore();
  grant(s, "build/step", "A", 3_600_000);
  registerAgent("A", "running");
  expect(reclaimIfStale(s, "build/step", Date.now())).toBeNull(); // live + no waiter → untouched
  expect(s.claims.get("build/step")?.holder).toBe("A");

  registerAgent("A", "aborted");
  expect(reclaimIfStale(s, "build/step", Date.now())).toBeNull(); // no waiter → dropped, no successor
  expect(s.claims.has("build/step")).toBe(false);
});

// --- test 6 — append is the only writer, monotonic seq --------------------------

test("append is the only writer and mints monotonically increasing seq", () => {
  const s = newStore();
  const r1 = s.append({ kind: "note", from: "A", topic: "t", body: "one" });
  const r2 = s.append({ kind: "note", from: "A", topic: "t", body: "two" });

  expect(r1.v).toBe(1);
  expect(typeof r1.ts).toBe("number");
  expect(r1.id.length).toBeGreaterThan(0);
  expect(r2.seq).toBe(r1.seq + 1);
  expect(s.seq).toBe(r2.seq);
  expect(s.records.map((r) => r.seq)).toEqual([r1.seq, r2.seq]);
  expect(s.byId.get(r2.id)).toBe(r2);

  // every claim mutation also goes through append (K15): one claim = one seq
  const before = s.seq;
  grant(s, "build/step", "A", 1_000);
  expect(s.seq).toBe(before + 1);
  expect(s.records.at(-1)!.kind).toBe("claim");

  // the line really landed in the JSONL log (§3.3)
  const text = fs.readFileSync(s.logPath, "utf-8");
  expect(text.trim().split("\n").length).toBe(s.records.length);
});

// --- listeners ------------------------------------------------------------------

test("addListener returns an unsubscribe that removes the listener", () => {
  const s = newStore();
  const seen: number[] = [];
  const off = s.addListener((r) => seen.push(r.seq));

  s.append({ kind: "note", from: "A", topic: "t", body: "x" });
  off();
  s.append({ kind: "note", from: "A", topic: "t", body: "y" });

  expect(seen.length).toBe(1);
  expect(s.listeners.size).toBe(0);
});

test("removeListener drops a listener without the unsubscribe closure", () => {
  const s = newStore();
  const fn = (): void => {};
  s.addListener(fn);
  expect(s.listeners.size).toBe(1);
  s.removeListener(fn);
  expect(s.listeners.size).toBe(0);
});

// --- registry: storeFor / eviction / reset --------------------------------------

test("storeFor returns the same store per root and evicts on last dispose", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const a = storeFor(root, ROOM_ID);
  const b = storeFor(root, ROOM_ID);
  expect(b).toBe(a);

  a.dispose();
  const c = storeFor(root, ROOM_ID); // b and c still hold live refs
  expect(c).toBe(a);
  c.dispose();
  b.dispose(); // last ref → evicted
  expect(storeFor(root, ROOM_ID)).not.toBe(a); // a fresh store is minted
});

test("reset() clears state without evicting the registry entry", () => {
  const s = newStore();
  s.append({ kind: "note", from: "A", topic: "t", body: "x" });
  grant(s, "build/step", "A", 1_000);
  expect(s.records.length).toBe(2);

  s.reset();
  expect(s.records.length).toBe(0);
  expect(s.byId.size).toBe(0);
  expect(s.claims.size).toBe(0);
  expect(s.seq).toBe(0);
  expect(storeFor(s.root, ROOM_ID)).toBe(s); // still registered
});

// --- hydrateClaims: replay rebuilds claim state ---------------------------------

test("hydrateClaims rebuilds claim state by replaying the log", () => {
  const s = newStore();
  grant(s, "build/step", "A", 60_000);
  const snapshot = s.records.slice();

  s.claims.clear();
  hydrateClaims(s, snapshot);

  expect(s.claims.get("build/step")?.holder).toBe("A");
  expect(s.claims.get("build/step")?.ttlMs).toBe(60_000);
});

test("hydrateClaims applies a later release over an earlier claim", () => {
  const s = newStore();
  grant(s, "build/step", "A", 60_000);
  release(s, "build/step", "A", "released");
  const snapshot = s.records.slice();

  s.claims.clear();
  hydrateClaims(s, snapshot);
  expect(s.claims.has("build/step")).toBe(false);
});

test("hydrateClaims applies a reclaim chain (claim → release → claim)", () => {
  const s = newStore();
  grant(s, "build/step", "A", 60_000);
  enqueueWaiter(s, "build/step", "B");
  release(s, "build/step", "A", "released"); // promotes B
  const snapshot = s.records.slice();

  s.claims.clear();
  hydrateClaims(s, snapshot);
  expect(s.claims.get("build/step")?.holder).toBe("B");
});

// --- contended ------------------------------------------------------------------

test("contended lists the waiters for a resource, oldest first", () => {
  const s = newStore();
  enqueueWaiter(s, "build/step", "B");
  enqueueWaiter(s, "build/step", "C");
  enqueueWaiter(s, "build/step", "B"); // duplicate ignored
  expect(contended(s, "build/step")).toEqual(["B", "C"]);
  expect(contended(s, "other/thing")).toEqual([]);
});

// --- session refcount + main-only timers (K9, R11/R28) --------------------------

function fakeCtx(
  root: string,
  agentId: string,
  kind: "main" | "sub" = "main",
  onInterval?: () => void,
): ExtensionContext {
  const opts = { getArtifactsDir: () => root, getSessionId: () => agentId };
  return {
    agent: { kind, id: agentId, name: kind, depth: 0 },
    localProtocolOptions: opts,
    sessionManager: { ...opts, getEntries: () => [] },
    setInterval: () => {
      onInterval?.();
      return 0 as unknown as Timer;
    },
    clearTimer: () => {},
  } as unknown as ExtensionContext;
}

test("roomStoreFor refs once per session; disposeRoomSession evicts on the last", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const a = roomStoreFor(fakeCtx(root, "AgentA"));
  // per-operation calls from the same session must not inflate the refcount
  expect(roomStoreFor(fakeCtx(root, "AgentA"))).toBe(a);
  expect(roomStoreFor(fakeCtx(root, "AgentA"))).toBe(a);
  const b = roomStoreFor(fakeCtx(root, "AgentB"));
  expect(b).toBe(a);

  disposeRoomSession(fakeCtx(root, "AgentA")); // one session leaves; B still holds the root
  expect(roomStoreFor(fakeCtx(root, "AgentB"))).toBe(a);

  disposeRoomSession(fakeCtx(root, "AgentB")); // last session → fd closed, root evicted
  expect(roomStoreFor(fakeCtx(root, "AgentC"))).not.toBe(a);
});

test("background jobs start from the main session only (R11/R28)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  let intervals = 0;
  roomStoreFor(
    fakeCtx(root, "Sub", "sub", () => {
      intervals++;
    }),
  );
  expect(intervals).toBe(0); // a subagent must not own the tick
  roomStoreFor(
    fakeCtx(root, "Main", "main", () => {
      intervals++;
    }),
  );
  expect(intervals).toBe(3); // prune + claim sweep + compactor, from the main session
});

// --- TDD: refcount leak fix (R10) --------------------------------------------

test("refcount does not leak: 50 roomStoreFor calls + 1 dispose evicts the root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const first = roomStoreFor(ctx);
  for (let i = 0; i < 49; i++) {
    roomStoreFor(ctx);
  }
  // One dispose from the single session must evict the root
  disposeRoomSession(ctx);
  // A fresh roomStoreFor must return a new object (root was evicted)
  expect(roomStoreFor(ctx)).not.toBe(first);
});

test("distinct agents each hold a ref: two disposes evict, one does not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const a = roomStoreFor(fakeCtx(root, "AgentA"));
  const b = roomStoreFor(fakeCtx(root, "AgentB"));
  expect(b).toBe(a);

  // One dispose — B still holds the root (same store, no refcount-inflating probe).
  disposeRoomSession(fakeCtx(root, "AgentA"));
  expect(roomStoreFor(fakeCtx(root, "AgentB"))).toBe(a);

  // Second dispose — last ref, root evicted.
  disposeRoomSession(fakeCtx(root, "AgentB"));
  expect(roomStoreFor(fakeCtx(root, "AgentB"))).not.toBe(a);
});

test("idempotent accessor: 50 roomStoreFor calls return the same store object", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const first = roomStoreFor(ctx);
  for (let i = 0; i < 49; i++) {
    expect(roomStoreFor(ctx)).toBe(first);
  }
});

// --- §4.1 Option B ops: topics/mute/unmute/tree/zoom/recall + post tier ---

/** Invoke the room tool with a specific ctx. */
function invokeRoom(
  ctx: ExtensionContext,
  params: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text?: string }>; details?: Record<string, unknown> }> {
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
    zod: {
      object: (shape: Record<string, unknown>) => shape,
      enum: (values: string[]) => ({
        values,
        optional: function (this: { optional: unknown }) {
          return this;
        },
      }),
      string: () => ({
        optional: function (this: { optional: unknown }) {
          return this;
        },
      }),
      number: () => ({
        optional: function (this: { optional: unknown }) {
          return this;
        },
      }),
      array: (t: unknown) => ({
        t,
        optional: function (this: { optional: unknown }) {
          return this;
        },
      }),
      optional: (t: unknown) => ({ t }),
    },
    registerTool: (def: {
      name: string;
      execute: typeof tool extends infer T ? (T extends { execute: infer E } ? E : never) : never;
    }) => {
      if (def.name === "room") tool = def as typeof tool;
    },
  } as unknown as ExtensionAPI;
  registerRoomTool(pi);
  if (!tool) throw new Error("room tool not registered");
  return tool.execute("test-call", params, new AbortController().signal, () => {}, ctx);
}

/** Create a test store with a fakeCtx. */
function newTestStore(): { store: RoomStore; ctx: ExtensionContext } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const store = roomStoreFor(ctx);
  return { store, ctx };
}

// --- topics ---

test("topics: returns topic list with unread counts and lastSeq", async () => {
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "AgentA", topic: "build", body: "hello" });
  store.append({ kind: "msg", from: "AgentB", topic: "build", body: "world" });
  store.append({ kind: "msg", from: "AgentA", topic: "test", body: "foo" });

  const result = await invokeRoom(ctx, { op: "topics" });
  expect(result.details).toMatchObject({ ok: true, op: "topics" });
  const topics = result.details?.topics as Array<{
    topic: string;
    unread: number;
    lastSeq: number;
  }>;
  expect(topics).toHaveLength(2);
  const build = topics.find((t) => t.topic === "build");
  const test = topics.find((t) => t.topic === "test");
  expect(build).toMatchObject({ topic: "build", unread: 2, lastSeq: 2 });
  expect(test).toMatchObject({ topic: "test", unread: 1, lastSeq: 3 });
});

test("topics: empty room returns empty array", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "topics" });
  expect(result.details).toMatchObject({ ok: true, op: "topics", topics: [] });
});

// --- mute / unmute ---

test("mute: topic mute adds to muted set", async () => {
  const { store, ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "mute", topic: "build" });
  expect(result.details).toMatchObject({ ok: true, op: "mute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("build")).toBe(true);
});

test("mute: whole-room mute adds empty string sentinel", async () => {
  const { store, ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "mute" });
  expect(result.details).toMatchObject({ ok: true, op: "mute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("")).toBe(true);
});

test("unmute: removes topic from muted set", async () => {
  const { store, ctx } = newTestStore();
  await invokeRoom(ctx, { op: "mute", topic: "build" });
  const result = await invokeRoom(ctx, { op: "unmute", topic: "build" });
  expect(result.details).toMatchObject({ ok: true, op: "unmute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("build")).toBe(false);
});

test("unmute: whole-room unmute removes sentinel", async () => {
  const { store, ctx } = newTestStore();
  await invokeRoom(ctx, { op: "mute" });
  const result = await invokeRoom(ctx, { op: "unmute" });
  expect(result.details).toMatchObject({ ok: true, op: "unmute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("")).toBe(false);
});

test("mute: muting a non-existent topic is allowed", async () => {
  const { store, ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "mute", topic: "nonexistent" });
  expect(result.details).toMatchObject({ ok: true, op: "mute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("nonexistent")).toBe(true);
});

test("mute: does not persist to the log file (in-memory only)", async () => {
  const { store, ctx } = newTestStore();
  // Join first to create a member record in the log
  await invokeRoom(ctx, { op: "join" });
  await invokeRoom(ctx, { op: "mute", topic: "build" });
  expect(store.members.get("AgentA")?.muted.has("build")).toBe(true);

  // Verify the muted set is NOT in the log file (in-memory only)
  const logContent = fs.readFileSync(store.logPath, "utf8");
  const logLines = logContent
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  // No mute record should exist in the log
  expect(logLines.some((r: Record<string, unknown>) => r.kind === "mute")).toBe(false);
  // The member record should exist
  expect(logLines.some((r: Record<string, unknown>) => r.kind === "member")).toBe(true);
});

// --- tree ---

test("tree: returns cover tiling with blocks", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 10; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `msg ${i}` });
  }
  const result = await invokeRoom(ctx, { op: "tree" });
  expect(result.details).toMatchObject({ ok: true, op: "tree" });
  const blocks = result.details?.blocks as Array<{
    lo: number;
    hi: number;
    size: number;
    raw: boolean;
  }>;
  expect(blocks.length).toBeGreaterThan(0);
  // All blocks should be within [0, 10)
  for (const b of blocks) {
    expect(b.lo).toBeGreaterThanOrEqual(0);
    expect(b.hi).toBeLessThanOrEqual(10);
    expect(b.size).toBe(b.hi - b.lo);
  }
});

test("tree: empty room returns empty blocks", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "tree" });
  expect(result.details).toMatchObject({ ok: true, op: "tree", blocks: [] });
});

// --- zoom ---

test("zoom: returns children of a valid range", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 8; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `msg ${i}` });
  }
  const result = await invokeRoom(ctx, { op: "zoom", lo: 0, hi: 8 });
  expect(result.details).toMatchObject({ ok: true, op: "zoom" });
  const children = result.details?.children as Array<{
    lo: number;
    hi: number;
    size: number;
    raw: boolean;
    text: string;
  }>;
  expect(children).toHaveLength(2);
  expect(children[0]).toMatchObject({ lo: 0, hi: 4, size: 4 });
  expect(children[1]).toMatchObject({ lo: 4, hi: 8, size: 4 });
});

test("zoom: invalid range returns error", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 8; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `msg ${i}` });
  }
  // lo=1 is not aligned for size=8
  const result = await invokeRoom(ctx, { op: "zoom", lo: 1, hi: 9 });
  expect(result.details).toMatchObject({ ok: false, error: "invalid zoom range" });
});

test("zoom: missing lo/hi returns error", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "zoom" });
  expect(result.details).toMatchObject({ ok: false });
});

// --- recall ---

test("recall: regex search returns matches newest first", async () => {
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "hello world" });
  store.append({ kind: "msg", from: "AgentB", topic: "t", body: "goodbye world" });
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "hello again" });

  const result = await invokeRoom(ctx, { op: "recall", pattern: "hello" });
  expect(result.details).toMatchObject({ ok: true, op: "recall" });
  const matches = result.details?.matches as Array<{ seq: number; record: { body: string } }>;
  expect(matches).toHaveLength(2);
  // Newest first
  expect(matches[0].seq).toBe(3);
  expect(matches[0].record.body).toBe("hello again");
  expect(matches[1].seq).toBe(1);
  expect(matches[1].record.body).toBe("hello world");
});

test("recall: invalid regex returns error", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "recall", pattern: "[invalid" });
  expect(result.details).toMatchObject({ ok: false, error: "invalid regex pattern" });
});

test("recall: missing pattern returns error", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "recall" });
  expect(result.details).toMatchObject({ ok: false });
});

test("recall: caps at 100 matches", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 150; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: "match me" });
  }
  const result = await invokeRoom(ctx, { op: "recall", pattern: "match" });
  expect(result.details).toMatchObject({ ok: true, op: "recall" });
  const matches = result.details?.matches as Array<{ seq: number }>;
  expect(matches).toHaveLength(100);
});

// --- post tier ---

test("post: returns tier in details", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "post", topic: "build", body: "hello" });
  expect(result.details).toMatchObject({ ok: true, op: "post" });
  expect(result.details).toHaveProperty("tier");
  const tier = result.details?.tier as string;
  expect(["T0", "T1", "T2"]).toContain(tier);
});

test("post: tier is T1 for a new topic (poster auto-follows)", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "post", topic: "new-topic", body: "first message" });
  expect(result.details).toMatchObject({ ok: true, op: "post", tier: "T1" });
});

test("post: tier is T1 for a followed topic", async () => {
  const { ctx } = newTestStore();
  // First post creates the topic and follows it
  await invokeRoom(ctx, { op: "post", topic: "build", body: "first" });
  // Second post on same topic should be T1 (followed)
  const result = await invokeRoom(ctx, { op: "post", topic: "build", body: "second" });
  expect(result.details).toMatchObject({ ok: true, op: "post", tier: "T1" });
});

// --- K20 — `read` is routed through the injection budget (the pull path) ---

test("read: the per-turn budget caps the records, more:true, and the summary names the remainder", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 200; i++) {
    store.append({ kind: "msg", from: "AgentB", topic: "bulk", body: `m${i} ${"x".repeat(48)}` });
  }

  const result = await invokeRoom(ctx, { op: "read", limit: 200 });
  const records = (result.details?.records ?? []) as Array<{ seq: number }>;
  expect(records.length).toBeGreaterThan(0);
  expect(records.length).toBeLessThan(200);
  expect(result.details?.more).toBe(true);

  const text = result.content.map((c) => c.text ?? "").join("\n");
  expect(text).toContain(`+${200 - records.length} more room messages`);
  expect(text).toContain('room{op:"read"');

  // The cursor advances only over the records actually returned — the rest stay readable.
  const last = records[records.length - 1]!.seq;
  expect(result.details?.cursor).toBe(last);
  expect(store.cursors.get("AgentA")).toBe(last);
  expect(store.records.filter((r) => r.seq > last).length).toBe(200 - records.length);
});

test("read: the budget is per turn — a repeat read is throttled and the turn boundary refills it", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 40; i++) {
    store.append({ kind: "msg", from: "AgentB", topic: "bulk", body: "y".repeat(240) });
  }

  const first = await invokeRoom(ctx, { op: "read", limit: 200 });
  const firstRecords = (first.details?.records ?? []) as unknown[];
  expect(firstRecords.length).toBe(DEFAULT_CAPS.maxT1PerTurn); // K binds before the 40 records
  expect(first.details?.more).toBe(true);

  // Same turn: the budget is spent, so nothing more is admitted and nothing is skipped.
  const second = await invokeRoom(ctx, { op: "read", limit: 200 });
  expect(((second.details?.records ?? []) as unknown[]).length).toBe(0);
  expect(second.details?.cursor).toBe(first.details?.cursor);
  expect(second.details?.more).toBe(true);

  resetTurnBudget(store, "AgentA"); // the turn_start hook
  const third = await invokeRoom(ctx, { op: "read", limit: 200 });
  expect(((third.details?.records ?? []) as unknown[]).length).toBeGreaterThan(0);
});
