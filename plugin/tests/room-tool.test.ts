import { test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentRegistry, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  storeFor, resetRoomStores, roomStoreFor, disposeRoomSession, type RoomStore,
} from "../src/store/room-store";
import {
  grant, release, reclaimIfStale, expireStale, hydrateClaims, contended,
  enqueueWaiter, dequeueWaiter, requeueWaiter, resolveWaiters,
} from "../src/store/claims";

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

afterEach(() => { resetRoomStores(); });

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
  expect(held?.holder).toBe("B");          // the OLDEST waiter, not C
  expect(held?.ttlMs).toBe(45_000);        // granted with the dropped claim's ttl
  expect(s.waiters.get("build/step")).toEqual(["C"]);   // B dequeued, C still waiting

  const last = s.records.at(-1)!;
  expect(last.kind).toBe("claim");
  if (last.kind === "claim") expect(last.from).toBe("B");

  // the release record itself carries prevHolder = the releaser (M11)
  const rel = s.records.filter(r => r.kind === "release").at(-1)!;
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
  expect(dropped[0].next).toBeUndefined();      // timer path: no successor

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
  grant(s, "build/step", "A", 3_600_000);         // long TTL — NOT expired
  registerAgent("A", "parked");
  enqueueWaiter(s, "build/step", "B");            // the contender

  const claimed = reclaimIfStale(s, "build/step", Date.now());
  expect(claimed?.holder).toBe("B");              // the waiter got the lease
  expect(s.claims.get("build/step")?.holder).toBe("B");

  const rel = s.records.filter(r => r.kind === "release").at(-1)!;
  expect(rel.kind).toBe("release");
  if (rel.kind === "release") {
    expect(rel.reason).toBe("reclaimed");
    expect(rel.prevHolder).toBe("A");             // the DISPLACED holder, not the reclaimer
  }
});

test("an aborted holder's claim is reclaimable and a fresh claim is not", () => {
  const s = newStore();
  grant(s, "build/step", "A", 3_600_000);
  registerAgent("A", "running");
  expect(reclaimIfStale(s, "build/step", Date.now())).toBeNull();  // live + no waiter → untouched
  expect(s.claims.get("build/step")?.holder).toBe("A");

  registerAgent("A", "aborted");
  expect(reclaimIfStale(s, "build/step", Date.now())).toBeNull();  // no waiter → dropped, no successor
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
  expect(s.records.map(r => r.seq)).toEqual([r1.seq, r2.seq]);
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
  const off = s.addListener(r => seen.push(r.seq));

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
  const c = storeFor(root, ROOM_ID);              // b and c still hold live refs
  expect(c).toBe(a);
  c.dispose();
  b.dispose();                                    // last ref → evicted
  expect(storeFor(root, ROOM_ID)).not.toBe(a);    // a fresh store is minted
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
  expect(storeFor(s.root, ROOM_ID)).toBe(s);      // still registered
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
  release(s, "build/step", "A", "released");       // promotes B
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
  enqueueWaiter(s, "build/step", "B");             // duplicate ignored
  expect(contended(s, "build/step")).toEqual(["B", "C"]);
  expect(contended(s, "other/thing")).toEqual([]);
});

// --- session refcount + main-only timers (K9, R11/R28) --------------------------

function fakeCtx(root: string, agentId: string, kind: "main" | "sub" = "main",
                 onInterval?: () => void): ExtensionContext {
  const opts = { getArtifactsDir: () => root, getSessionId: () => agentId };
  return {
    agent: { kind, id: agentId, name: kind, depth: 0 },
    localProtocolOptions: opts,
    sessionManager: { ...opts, getEntries: () => [] },
    setInterval: () => { onInterval?.(); return 0 as unknown as Timer; },
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

  disposeRoomSession(fakeCtx(root, "AgentA"));      // one session leaves; B still holds the root
  expect(roomStoreFor(fakeCtx(root, "AgentB"))).toBe(a);

  disposeRoomSession(fakeCtx(root, "AgentB"));      // last session → fd closed, root evicted
  expect(roomStoreFor(fakeCtx(root, "AgentC"))).not.toBe(a);
});

test("background jobs start from the main session only (R11/R28)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  let intervals = 0;
  roomStoreFor(fakeCtx(root, "Sub", "sub", () => { intervals++; }));
  expect(intervals).toBe(0);                        // a subagent must not own the tick
  roomStoreFor(fakeCtx(root, "Main", "main", () => { intervals++; }));
  expect(intervals).toBe(2);                        // prune + claim sweep, from the main session
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
