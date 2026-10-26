import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { prompt } from "@oh-my-pi/pi-utils";
import { DEFAULT_CAPS, resetTurnBudget } from "../src/attention/governor";
import { classify } from "../src/attention/tiers";
import { DIGEST_CLAIMS_CAP } from "../src/onboarding/digest";
import {
  contended,
  dequeueWaiter,
  enqueueWaiter,
  expireStale,
  grant,
  hydrateClaims,
  reclaimIfStale,
  release,
  renew,
  requeueWaiter,
  resolveWaiters,
} from "../src/store/claims";
import {
  disposeRoomSession,
  type RoomStore,
  registerSweepNotifier,
  resetRoomStores,
  roomStoreFor,
  roomTimers,
  storeFor,
} from "../src/store/room-store";
import type { RoomRecord } from "../src/store/schema";
import { viewPath } from "../src/store/tree-store";
import { ROOM_DESCRIPTION, registerRoomTool } from "../src/tools/room";
import { zodStub } from "./zod-stub";

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

test("renew: the holder extends its own lease instead of being denied", () => {
  const s = newStore();
  const first = grant(s, "build/step", "A", 60_000);
  expect(first.ok).toBe(true);
  const expiryBefore = first.ok ? first.claim.acquiredAt + first.claim.ttlMs : 0;

  const renewed = renew(s, "build/step", "A", 120_000);
  expect(renewed.ok).toBe(true);
  if (renewed.ok) {
    expect(renewed.claim.holder).toBe("A");
    expect(renewed.claim.ttlMs).toBe(120_000);
    // the lease's start moves to now, so the expiry is strictly later
    expect(renewed.claim.acquiredAt + renewed.claim.ttlMs).toBeGreaterThan(expiryBefore);
  }
  // the lease the board sees is the renewed one
  expect(s.claims.get("build/step")?.ttlMs).toBe(120_000);
  // and it is in the log, so a replay reproduces it
  const last = s.records.at(-1);
  expect(last?.kind).toBe("claim");
  // A renewal keeps the generation: ownership did not change, so the
  // fence still fences on the original grant's gen. Proved by the
  // RETURNED claim too — `renewed.claim.gen` is the same number.
  expect(s.claims.get("build/step")?.gen).toBe(first.ok ? first.claim.gen : -1);
  if (renewed.ok) expect(renewed.claim.gen).toBe(first.ok ? first.claim.gen : -1);
});

test("claim: the TTL is clamped to the mandatory [1s, 1d] window", async () => {
  // room.ts claim 979: CLAIM_TTL_MIN/MAX_MS — a zero lease is not a lease
  // (§3.4 TTL mandatory), and a century lease never expires. Both ends
  // clamp instead of refusing.
  const { store, ctx } = newTestStore();
  const tiny = await invokeRoom(ctx, { op: "claim", topic: "build", key: "a", ttl: 0 });
  expect(tiny.details).toMatchObject({ ok: true });
  expect(store.claims.get("build/a")?.ttlMs).toBe(1_000);
  const huge = await invokeRoom(ctx, { op: "claim", topic: "build", key: "b", ttl: 9_999_999_999 });
  expect(huge.details).toMatchObject({ ok: true });
  expect(store.claims.get("build/b")?.ttlMs).toBe(86_400_000);
  // ...and a renewal re-clamps the same way: a renewed zero lease lands
  // on the floor, not on zero.
  const renewed = await invokeRoom(ctx, { op: "claim", topic: "build", key: "a", ttl: 0 });
  expect(renewed.details).toMatchObject({ ok: true, renewed: true });
  expect(store.claims.get("build/a")?.ttlMs).toBe(1_000);
});

test("renew: a non-holder cannot renew somebody else's lease", () => {
  const s = newStore();
  expect(grant(s, "build/step", "A", 60_000).ok).toBe(true);
  const seqBefore = s.seq;

  const denied = renew(s, "build/step", "B", 60_000);
  expect(denied.ok).toBe(false);
  if (!denied.ok) expect(denied.holder).toBe("A");
  // a denied renewal is not state
  expect(s.seq).toBe(seqBefore);
});

test("renew: a missing claim cannot be renewed — it must be claimed", () => {
  // claims.ts `renew` 208: no row at all → `existing === undefined` → the
  // ok:false arm with holder undefined and expiresAt 0. Renewing what was
  // never claimed is a claim, not a renewal.
  const s = newStore();
  const seqBefore = s.seq;
  const denied = renew(s, "build/step", "A", 60_000);
  expect(denied.ok).toBe(false);
  if (!denied.ok) {
    expect(denied.holder).toBeUndefined();
    expect(denied.expiresAt).toBe(0);
  }
  // a denied renewal is not state
  expect(s.seq).toBe(seqBefore);
});

test("R6: the status ledger is written by the topic's claim holder, and its shape is checked", async () => {
  const { store, ctx } = newTestStore();
  const ledger = {
    is_request_satisfied: { reason: "the parser is green", answer: "no" },
    is_in_loop: { reason: "three agents are re-reading the same file", answer: "yes" },
    is_progress_being_made: { reason: "the last commit changed the parser", answer: "yes" },
    next_speaker: { reason: "the parser needs the schema", answer: "AgentB" },
    instruction_or_question: {
      reason: "AgentB must publish the schema first",
      answer: "publish it",
    },
  };

  // No claim on the topic: the ledger is not the caller's to write.
  const refused = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "status",
    status: ledger,
  });
  expect(refused.details).toMatchObject({ ok: false });
  expect(JSON.stringify(refused.content)).toContain("holding the topic's claim");
  expect(store.records.filter((r) => r.kind === "msg")).toHaveLength(0);

  // Holding it: the ledger is accepted.
  expect(grant(store, "build/parser", "AgentA", 60_000).ok).toBe(true);
  const ok = await invokeRoom(ctx, { op: "post", topic: "build", body: "status", status: ledger });
  expect(ok.details).toMatchObject({ ok: true, op: "post" });
  const written = store.records.find((r) => r.kind === "msg");
  expect(written?.kind === "msg" ? written.status?.is_in_loop?.answer : undefined).toBe("yes");
});

test("R6: a ledger that says the topic is looping interrupts the topic's followers", () => {
  const viewer = {
    agentId: "AgentB",
    joinedAtSeq: 0,
    topics: new Set(["build"]),
    muted: new Set<string>(),
    threadRoots: new Set<string>(),
    heldTopics: new Set<string>(),
  };
  const record: RoomRecord = {
    v: 1,
    seq: 1,
    ts: Date.now(),
    kind: "msg",
    id: "m1",
    from: "AgentA",
    topic: "build",
    body: "status",
    status: {
      is_request_satisfied: { reason: "no", answer: "no" },
      is_in_loop: { reason: "the same edit, again", answer: "yes" },
      is_progress_being_made: { reason: "no", answer: "no" },
      next_speaker: { reason: "someone else", answer: "AgentC" },
      instruction_or_question: { reason: "stop", answer: "stop repeating" },
    },
  };
  // The follower is interrupted: MAST's largest failure mode is step repetition.
  expect(classify(record, viewer)).toBe("T0");
  // An agent that does not follow the topic is not.
  const stranger = { ...viewer, topics: new Set<string>() };
  expect(classify(record, stranger)).toBe("T2");
});

test("R9: the board says who is blocked on what", async () => {
  const { store, ctx } = newTestStore();

  // A claims build/step, depending on build/schema (which nobody holds).
  const claimed = await invokeRoom(ctx, {
    op: "claim",
    topic: "build",
    key: "step",
    dependsOn: ["build/schema"],
  });
  expect(claimed.details).toMatchObject({ ok: true, op: "claim" });

  // B waits for it.
  enqueueWaiter(store, "build/step", "AgentB");

  const board = await invokeRoom(ctx, { op: "board" });
  const text = board.content.map((c) => c.text ?? "").join("\n");
  expect(text).toContain("waiting: AgentB"); // who waits on it
  expect(text).toContain("needs build/schema"); // what it waits on
  // ...and the R9 counters: one claim with a waiter, one dependency.
  expect(board.details).toMatchObject({ ok: true, op: "board" });
  const claims = (board.details as { board: { claims: unknown[] } }).board.claims;
  expect(claims).toHaveLength(1);
});

test("R1: a displaced agent's late write is fenced out by its stale generation", async () => {
  const { store, ctx } = newTestStore();

  const first = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step" });
  expect(first.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });
  const gen = first.details?.gen as number;
  // A first grant starts the counter at exactly 1 — the fence's baseline.
  // (The record's own `gen` field is gone: the projection is the single
  // minter now, so no double increment.)
  expect(gen).toBe(1);

  // A is displaced: the lease is reclaimed and the resource granted again, so the generation moves.
  expect(release(store, "build/step", "AgentA", "released")).toBe(true);
  const second = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step" });
  expect(second.details?.gen as number).toBeGreaterThan(gen);

  // A comes back with its old generation: a claim is refused, and so is a post into the topic.
  const staleClaim = await invokeRoom(ctx, {
    op: "claim",
    topic: "build",
    key: "step",
    gen,
  });
  expect(staleClaim.details).toMatchObject({ ok: false });
  expect(JSON.stringify(staleClaim.content)).toContain("build/step");

  const stalePost = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "late write",
    gen,
  });
  expect(stalePost.details).toMatchObject({ ok: false });
  // ...and the refusal names the resource AND both generations, so the
  // zombie learns exactly how far behind it is.
  const staleText = JSON.stringify(stalePost.content);
  expect(staleText).toContain("build/step");
  expect(staleText).toContain("generation 2, not 1");
});

test("R3: a claim whose dependency is still held is refused, and the refusal names the blocker", async () => {
  const { store, ctx } = newTestStore();

  // B holds the schema; A wants the parser, which depends on it.
  expect(grant(store, "build/schema", "AgentB", 60_000).ok).toBe(true);
  const blocked = await invokeRoom(ctx, {
    op: "claim",
    topic: "build",
    key: "parser",
    dependsOn: ["build/schema"],
  });
  expect(blocked.details).toMatchObject({ ok: false });
  const text = JSON.stringify(blocked.content);
  expect(text).toContain("build/schema");
  expect(text).toContain("AgentB");
  // ...and the refusal names the wanted resource AND its blocker in one
  // line — the agent learns WHAT is blocked, BY WHOM, in a single read.
  expect(text).toContain("build/parser blocked — depends on build/schema (held by AgentB)");
  // and nothing was granted
  expect(store.claims.get("build/parser")).toBeUndefined();
  // once the dependency is released, the claim succeeds
  expect(release(store, "build/schema", "AgentB", "released")).toBe(true);
  const granted = await invokeRoom(ctx, {
    op: "claim",
    topic: "build",
    key: "parser",
    dependsOn: ["build/schema"],
  });
  expect(granted.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });
});

test("R3: a self-dependency is dropped from the lease's recorded dependsOn", async () => {
  // claims.ts grant 65 vs 83: the BLOCK check drops self (`dep ===
  // resource`) but the RECORD keeps the raw list — including self. A
  // lease recording itself as a dependency misleads the board ("needs
  // build/step" while holding build/step). The two must agree: self is
  // dropped from BOTH, so the recorded lease is clean.
  const { store, ctx } = newTestStore();
  const res = await invokeRoom(ctx, {
    op: "claim",
    topic: "build",
    key: "step",
    dependsOn: ["build/step"],
  });
  expect(res.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });
  expect(store.claims.get("build/step")?.dependsOn).toEqual([]);
});

test("R7: a retried post with the same key returns the first one instead of posting twice", async () => {
  const { store, ctx } = newTestStore();

  const first = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "the finding",
    idemKey: "finding-1",
  });
  expect(first.details).toMatchObject({ ok: true, op: "post" });
  const seqAfterFirst = store.seq;

  const retry = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "the finding",
    idemKey: "finding-1",
  });
  expect(retry.details).toMatchObject({ ok: true, op: "post", idempotent: true });
  expect(retry.details?.seq).toBe(first.details?.seq);
  // A retried post is still a clean post: no deliveryError envelope.
  expect("deliveryError" in (retry.details ?? {})).toBe(false);
  // nothing was appended: a double post double-wakes every mentioned peer
  expect(store.seq).toBe(seqAfterFirst);
  expect(store.records.filter((r) => r.kind === "msg")).toHaveLength(1);

  // the same key with DIFFERENT parameters is an error, not a silent second post
  const mismatch = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "a different finding",
    idemKey: "finding-1",
  });
  expect(mismatch.details).toMatchObject({ ok: false });
  expect(store.seq).toBe(seqAfterFirst);
  // ...and the mismatch names the key, so the retrier learns WHICH key
  // collided instead of just "parameters differ".
  expect(JSON.stringify(mismatch.content)).toContain("finding-1");
});

test("R5: a lost claim is recorded, so contention is measurable", async () => {
  const { store, ctx } = newTestStore();
  expect(grant(store, "build/step", "AgentB", 60_000).ok).toBe(true);

  const denied = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step" });
  expect(denied.details).toMatchObject({ ok: false });
  expect(denied.details).toMatchObject({ holder: "AgentB" });

  const contended = store.records.filter((r) => r.kind === "contended");
  expect(contended).toHaveLength(1);
  const record = contended[0]!;
  if (record.kind === "contended") {
    expect(record.from).toBe("AgentA"); // the agent that lost
    expect(record.holder).toBe("AgentB"); // the agent that holds it
    expect(record.resource).toBe("build/step");
  }
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
  grant(s, "build/live", "A", 60_000);

  const dropped = expireStale(s, Date.now() + 5_000);
  expect(dropped.length).toBe(1);
  expect(dropped[0].resource).toBe("build/step");
  expect(dropped[0].prev).toBe("A");
  expect(dropped[0].next).toBeUndefined(); // timer path: no successor

  expect(s.claims.has("build/step")).toBe(false);
  // ...and the live lease survives the same sweep untouched — staleness
  // is per-claim, not per-sweep.
  expect(s.claims.get("build/live")?.holder).toBe("A");

  const rel = s.records.at(-1)!;
  expect(rel.kind).toBe("release");
  if (rel.kind === "release") {
    expect(rel.reason).toBe("expired");
    expect(rel.prevHolder).toBe("A");
    // ...and the releaser is the arbiter ("system"), never the displaced
    // holder — M11: `from` is the releaser, `prevHolder` the displaced.
    expect(rel.from).toBe("system");
  }

  // the resource is free again
  expect(grant(s, "build/step", "B", 1_000).ok).toBe(true);
  // a second sweep drops B's fresh (now stale) claim too — plus the
  // untouched live lease from above, which is also stale by now.
  expect(expireStale(s, Date.now() + 60_000).length).toBe(2);
});

test("expireStale is a no-op while the TTL is live", () => {
  const s = newStore();
  grant(s, "build/step", "A", 60_000);
  expect(expireStale(s, Date.now()).length).toBe(0);
  expect(s.claims.get("build/step")?.holder).toBe("A");
});
test("expireStale promotes the oldest waiter with the expired lease's ttl", () => {
  // Line 243: the `next` arm — expiry WITH a waiter queued hands the lease
  // to the oldest waiter instead of freeing the resource.
  const s = newStore();
  grant(s, "build/step", "A", 1_000);
  enqueueWaiter(s, "build/step", "B");
  enqueueWaiter(s, "build/step", "C");
  const dropped = expireStale(s, Date.now() + 5_000);
  expect(dropped.length).toBe(1);
  expect(dropped[0].next).toBe("B");
  expect(s.claims.get("build/step")?.holder).toBe("B");
  expect(s.waiters.get("build/step")).toEqual(["C"]);
  // ...and the promoted lease carries the EXPIRED lease's ttl (1000),
  // not a fresh default — the waiter's window matches what expired.
  expect(s.claims.get("build/step")?.ttlMs).toBe(1_000);
});

// --- test 5 — parked/aborted holder is reclaimable ------------------------------

test("a parked/aborted holder's claim is reclaimable", () => {
  const s = newStore();
  grant(s, "build/step", "A", 3_600_000); // long TTL — NOT expired
  registerAgent("A", "parked");
  enqueueWaiter(s, "build/step", "B"); // the contender

  const claimed = reclaimIfStale(s, "build/step", Date.now());
  expect(claimed.reclaimed).toBe(true);
  expect(claimed.holder).toBe("B"); // the waiter got the lease
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
  // A live claim: nothing happens, and the outcome says so.
  expect(reclaimIfStale(s, "build/step", Date.now())).toMatchObject({ reclaimed: false });
  expect(s.claims.get("build/step")?.holder).toBe("A");

  registerAgent("A", "aborted");
  // An aborted holder's claim IS reclaimed even with a live TTL. The old API returned the
  // promoted claim, so this case (no waiter → no successor) looked identical to "not stale" and
  // the caller told the agent its release was denied.
  const outcome = reclaimIfStale(s, "build/step", Date.now());
  expect(outcome.reclaimed).toBe(true);
  expect(outcome.holder).toBe(null); // no waiter → the lease is simply dropped
  expect(s.claims.has("build/step")).toBe(false);
});

test("a reclaim with no waiter records from=system — never the displaced holder", () => {
  // claims.ts reclaimIfStale 169-176: with no waiter the releaser is the
  // arbiter ("system"), never the displaced holder. M11: `from` is the
  // releaser, `prevHolder` is the displaced — conflating them makes the
  // eviction notice classify the release as the holder's own act.
  const s = newStore();
  grant(s, "build/step", "A", 3_600_000);
  registerAgent("A", "parked");
  const outcome = reclaimIfStale(s, "build/step", Date.now());
  expect(outcome.reclaimed).toBe(true);
  expect(outcome.holder).toBe(null);
  const rel = s.records.filter((r) => r.kind === "release").at(-1)!;
  expect(rel.kind).toBe("release");
  if (rel.kind === "release") {
    expect(rel.from).toBe("system");
    expect(rel.prevHolder).toBe("A");
  }
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

test("hydrateClaims restores the holder's heldTopics so the board stays correct", () => {
  // room-store.ts projection 150: every grant funnels the holder's
  // heldTopics through the projection — hydrateClaims must do the same,
  // or a replayed lease is invisible to the board's topic filter.
  const s = newStore();
  s.members.set("A", {
    agentId: "A",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  grant(s, "build/step", "A", 60_000, ["build/schema"]);
  const snapshot = s.records.slice();

  s.claims.clear();
  s.members.get("A")!.heldTopics.clear();
  hydrateClaims(s, snapshot);

  expect(s.claims.get("build/step")?.holder).toBe("A");
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(true);
  // ...and the TTL + dependency list travel too: the replayed lease
  // carries the same window and the same "needs" the board shows.
  expect(s.claims.get("build/step")?.ttlMs).toBe(60_000);
  expect(s.claims.get("build/step")?.dependsOn).toEqual(["build/schema"]);
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
  // ...as a COPY: mutating the return never touches the store's list.
  const listed = contended(s, "build/step");
  listed.push("MUTANT");
  listed.length = 0;
  expect(contended(s, "build/step")).toEqual(["B", "C"]);
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
    // The room root is derived from `ctx.cwd` (one room per project, shared with subagents), so a
    // test's isolated root must be its cwd — `localProtocolOptions` is per-session and no longer
    // keys the room.
    cwd: root,
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

test("main and a subagent share ONE room even with different artifacts dirs (the real layout)", () => {
  // The bug this pins: the room root used to come from `ctx.localProtocolOptions`, which is
  // PER-SESSION — a subagent's artifacts dir is its own session file minus `.jsonl`
  // (`artifactsDirectoryFor`), so main resolved `<session>/local` and its subagent resolved
  // `<session>/Task1/local`. Every agent got a private room and the claim board coordinated
  // nobody. Nothing caught it because every fixture handed each session the SAME root, a shape
  // that cannot occur in production.
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "room-shared-"));
  const mainArtifacts = path.join(project, "sess-main");
  const subArtifacts = path.join(project, "sess-main", "Task1");

  const main = {
    ...fakeCtx(project, "Main"),
    localProtocolOptions: {
      getArtifactsDir: () => mainArtifacts,
      getSessionId: () => "Main",
    },
  } as ExtensionContext;
  const sub = {
    ...fakeCtx(project, "Task1", "sub"),
    localProtocolOptions: {
      getArtifactsDir: () => subArtifacts,
      getSessionId: () => "Task1",
    },
  } as ExtensionContext;

  expect(subArtifacts).not.toBe(mainArtifacts); // the layout that broke it
  const a = roomStoreFor(main);
  const b = roomStoreFor(sub);
  expect(b).toBe(a); // one store, one board

  const granted = a.append({ kind: "claim", from: "Main", resource: "build/step", ttlMs: 60_000 });
  expect(a.claims.get("build/step")?.holder).toBe("Main");
  // The subagent sees the claim its parent took — the entire point of the room.
  expect(b.claims.get("build/step")?.holder).toBe("Main");
  expect(granted.seq).toBeGreaterThan(0);
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
    zod: zodStub,
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
test("claim: claiming a resource you already hold renews it, it does not deny you", async () => {
  const { ctx } = newTestStore();

  const first = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step", ttl: 60_000 });
  expect(first.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });
  expect(first.details?.renewed).toBeUndefined();
  expect("deliveryError" in (first.details ?? {})).toBe(false);
  const expiryBefore = first.details?.expiresAt as number;

  const second = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step", ttl: 120_000 });
  expect(second.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA", renewed: true });
  expect(second.details?.expiresAt as number).toBeGreaterThan(expiryBefore);
  // A clean renewal also carries no deliveryError envelope.
  expect("deliveryError" in (second.details ?? {})).toBe(false);
  // the model-facing line says what happened
  const text = JSON.stringify(second.content);
  expect(text).toContain("renewed");
  expect(text).toContain("expires in 120s");
});

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
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("0 topic(s)");
});

test("topics lists a note-only topic with its unread count", async () => {
  // tools/room.ts topics 1138: the scan admits both msg and note — a
  // note-only topic appears with its own last seq and unread math, not
  // silence.
  const { store, ctx } = newTestStore();
  store.append({ kind: "note", from: "AgentA", topic: "margin", body: "margin note" });
  store.cursors.set("AgentA", 0);
  const result = await invokeRoom(ctx, { op: "topics" });
  const text = result.content.map((c) => c.text ?? "").join("\n");
  expect(text).toContain("room topics → 1 topic(s)");
  expect(text).toContain("topic margin · 1 unread · last seq 1");
  expect(result.details?.topics).toMatchObject([{ topic: "margin", unread: 1, lastSeq: 1 }]);
});

// --- mute / unmute ---

test("mute: topic mute adds to muted set", async () => {
  const { store, ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "mute", topic: "build" });
  expect(result.details).toMatchObject({ ok: true, op: "mute" });
  const member = store.members.get("AgentA");
  expect(member?.muted.has("build")).toBe(true);
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("build");
});

test("mute: whole-room mute adds empty string sentinel", async () => {
  const { store, ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "mute" });
  expect(result.details).toMatchObject({ ok: true, op: "mute" });
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("whole room");
  const member = store.members.get("AgentA");
  expect(member?.muted.has("")).toBe(true);
});

test("unmute: removes topic from muted set", async () => {
  const { store, ctx } = newTestStore();
  await invokeRoom(ctx, { op: "mute", topic: "build" });
  const result = await invokeRoom(ctx, { op: "unmute", topic: "build" });
  expect(result.details).toMatchObject({ ok: true, op: "unmute" });
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("build");
  const member = store.members.get("AgentA");
  expect(member?.muted.has("build")).toBe(false);
});

test("unmute: whole-room unmute removes sentinel", async () => {
  const { store, ctx } = newTestStore();
  await invokeRoom(ctx, { op: "mute" });
  const result = await invokeRoom(ctx, { op: "unmute" });
  expect(result.details).toMatchObject({ ok: true, op: "unmute" });
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("whole room");
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
  expect(result.details).toMatchObject({
    ok: false,
    error: expect.stringContaining("invalid zoom range: "),
  });
});

test("zoom: missing lo/hi returns error", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "zoom" });
  expect(result.details).toMatchObject({ ok: false });
});

test("zoom: non-integer lo/hi is rejected before the bounds check", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "zoom", lo: 0.5, hi: 2 });
  expect(result.details).toMatchObject({ ok: false, error: expect.stringContaining("integers") });
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
  expect(result.details).toMatchObject({ ok: false, error: "recall requires a pattern" });
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

test("recall: hit carries no miss signal", async () => {
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "hello world" });
  const result = await invokeRoom(ctx, { op: "recall", pattern: "hello" });
  expect(result.details).toMatchObject({ ok: true, op: "recall" });
  expect(result.details?.recallMiss).toBeUndefined();
  expect(result.details?.logSize).toBeUndefined();
});

test("recall: zero matches on non-empty log signals a miss", async () => {
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "hello world" });
  const before = store.records.length;
  const result = await invokeRoom(ctx, { op: "recall", pattern: "zzz-no-such-text" });
  expect(result.details).toMatchObject({
    ok: true,
    op: "recall",
    recallMiss: true,
    logSize: before,
  });
  const matches = result.details?.matches as Array<unknown>;
  expect(matches).toHaveLength(0);
  // read-only signal: the miss must not grow the log it measures
  expect(store.records.length).toBe(before);
});

test("recall: zero matches on empty log is not a miss", async () => {
  const { ctx } = newTestStore();
  const result = await invokeRoom(ctx, { op: "recall", pattern: "anything" });
  expect(result.details).toMatchObject({ ok: true, op: "recall" });
  expect(result.details?.recallMiss).toBeUndefined();
  expect(result.details?.matches as Array<unknown>).toHaveLength(0);
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
test("read: every record kind renders its own model-facing line", async () => {
  // recordLine arms (room.ts:228-245): one of each kind in the log, then a
  // read asserts each shape. `note` has no tool-path producer (no op mints
  // it), so the arm is pinned by appending one directly.
  const { store, ctx } = newTestStore();
  store.append({ kind: "note", from: "AgentB", topic: "build", body: "margin-note" });
  store.append({ kind: "msg", from: "AgentB", topic: "build", body: "hello" });
  store.append({ kind: "claim", from: "AgentB", resource: "build/step", ttlMs: 60_000 });
  store.append({
    kind: "release",
    from: "AgentB",
    resource: "build/step",
    reason: "released",
    prevHolder: "AgentB",
  });
  store.append({ kind: "member", from: "AgentC", action: "join" });
  store.append({ kind: "gap", from: "system", skipped: 3, reason: "retention" });
  store.append({ kind: "contended", from: "AgentD", resource: "build/step", holder: "AgentB" });
  store.append({
    kind: "wait",
    from: "AgentD",
    waited: "claim",
    target: "build/step",
    outcome: "timeout",
    enqueuedAt: 1,
  });
  store.append({ kind: "delivered", from: "AgentB", deliveredSeq: 1, tier: "T1" });
  const result = await invokeRoom(ctx, { op: "read", limit: 50 });
  const text = result.content.map((c) => c.text ?? "").join("\n");
  expect(text).toContain("room read →");
  expect(text).toContain('note build · "margin-note"');
  expect(text).toContain('build · "hello"');
  expect(text).toContain("claim build/step");
  expect(text).toContain("release build/step · released");
  expect(text).toContain("join");
  expect(text).toContain("gap · 3 skipped");
  expect(text).toContain("contended build/step");
  expect(text).toContain("wait build/step");
  expect(text).toContain("delivered seq 1");
});

test("reopening a store replays the log: records, seq and index survive", () => {
  // Lines 253-256: first open rebuilds projection + claim state by replay.
  // Evict the in-memory store, reopen the same root, and the log's records
  // come back with their seqs and byId entries intact.
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "A", topic: "t", body: "one" });
  store.append({ kind: "msg", from: "A", topic: "t", body: "two" });
  store.append({ kind: "claim", from: "A", resource: "t/k", ttlMs: 60_000 });
  expect(store.records.length).toBe(3);
  resetRoomStores();
  const reopened = roomStoreFor(ctx);
  expect(reopened.records.length).toBe(3);
  expect(reopened.seq).toBe(store.seq);
  expect(reopened.records.map((r) => r.seq)).toEqual([1, 2, 3]);
  expect(reopened.byId.get(reopened.records[0].id)?.seq).toBe(1);
  expect(reopened.claims.get("t/k")?.holder).toBe("A");
});

test("a member leave record removes the roster entry", () => {
  // Lines 124-125: the join arm registers, the leave arm deletes.
  const { store } = newTestStore();
  store.append({ kind: "member", from: "AgentC", action: "join" });
  expect(store.members.has("AgentC")).toBe(true);
  store.append({ kind: "member", from: "AgentC", action: "leave" });
  expect(store.members.has("AgentC")).toBe(false);
});

test("a throwing listener does not break the append path", () => {
  // Lines 209-210: listeners must not break appends — a throw is swallowed.
  const { store } = newTestStore();
  store.addListener(() => {
    throw new Error("listener boom");
  });
  const seen: number[] = [];
  store.addListener((r) => {
    seen.push(r.seq);
  });
  const record = store.append({ kind: "msg", from: "A", topic: "t", body: "b" });
  expect(record.seq).toBeGreaterThan(0);
  expect(seen).toEqual([record.seq]);
});

test("removeListener drops exactly that listener — others keep firing", () => {
  // room-store.ts removeListener 221-223: delete-one semantics. A removed
  // listener never fires again, and its siblings are untouched.
  const { store } = newTestStore();
  const seenA: number[] = [];
  const seenB: number[] = [];
  const fnA = (r: RoomRecord): void => {
    seenA.push(r.seq);
  };
  const fnB = (r: RoomRecord): void => {
    seenB.push(r.seq);
  };
  store.addListener(fnA);
  store.addListener(fnB);
  store.append({ kind: "msg", from: "AgentA", topic: "build", body: "one" });
  store.removeListener(fnA);
  store.append({ kind: "msg", from: "AgentA", topic: "build", body: "two" });
  expect(seenA).toEqual([1]);
  expect(seenB).toEqual([1, 2]);
  // Removing what was never added is a silent no-op.
  expect(() => store.removeListener(fnA)).not.toThrow();
});

// --- K1 content contract: what the MODEL sees ---
// `details` never reaches the model — pi-agent-core's `coerceToolResult` (agent-loop.ts:540) keeps
// only `content` on the wire. So an op whose content is a bare count is unanswerable to a model.
// These tests assert on `content`, which no earlier test did — the gap that hid the board defect.

test("board content names the holder, not just the count", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  await invokeRoom(ctx, { op: "join" });
  await invokeRoom(ctx, { op: "claim", topic: "build", key: "parser", ttl: 300_000 });

  const res = await invokeRoom(ctx, { op: "board" });
  const text = res.content[0]?.text ?? "";
  expect(text).toContain("build/parser"); // the resource
  expect(text).toContain("AgentA"); // the holder
  expect(text).toContain("left"); // the remaining TTL
  expect(text).not.toBe("room board → 1 claim(s), 1 member(s), 0 topic(s)");
  expect(text).toContain("room board → 1 claim(s)");
});

test("board content stays capped on a large roster (no context blowout)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  await invokeRoom(ctx, { op: "join" });
  for (let i = 0; i < 60; i++) {
    await invokeRoom(ctx, { op: "claim", topic: "bulk", key: `k${i}`, ttl: 300_000 });
  }
  const text = (await invokeRoom(ctx, { op: "board" })).content[0]?.text ?? "";
  const rows = text.split("\n").filter((l) => l.startsWith("claim "));
  expect(rows.length).toBe(DIGEST_CLAIMS_CAP); // §5.4 cap
  expect(text).toContain("more claim(s)"); // the remainder is disclosed, not hidden
});
test("board content truncates the roster past ROSTER_CAP and discloses the remainder", async () => {
  // boardLines line 278: the member loop caps at ROSTER_CAP (32); the
  // overflow is a disclosed "+N more member(s)" line, not a silent cut.
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 35; i++) {
    store.append({ kind: "member", from: `Agent${i}`, action: "join" });
  }
  const text = (await invokeRoom(ctx, { op: "board" })).content[0]?.text ?? "";
  expect(text).toContain("more member(s)");
  expect(text).toContain("+3 more member(s)");
});
test("room on a corrupt root returns ok:false + error, never throws", async () => {
  // Tool-entry U6 arm (room.ts:786-787): a file where room/ must go → mkdir
  // fails (ENOTDIR). Written before roomStoreFor ever opens the root.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  fs.mkdirSync(path.join(root, ".omp-room"), { recursive: true });
  fs.writeFileSync(path.join(root, ".omp-room", "room"), "not a dir");
  const res = await invokeRoom(fakeCtx(root, "AgentA"), { op: "board" });
  expect(res.details).toMatchObject({ ok: false });
  expect(typeof res.details?.error).toBe("string");
  expect(Array.isArray(res.content)).toBe(true);
});

test("post with a body over maxBodyBytes is refused and appends nothing", async () => {
  // K19 arm (room.ts:860-862): the cap is enforced before the record is
  // drafted — an oversized body never lands in the log, even truncated.
  const { store, ctx } = newTestStore();
  const before = store.records.length;
  const res = await invokeRoom(ctx, { op: "post", topic: "build", body: "x".repeat(8193) });
  expect(res.details).toMatchObject({ ok: false });
  expect(JSON.stringify(res.content)).toContain("body exceeds maxBodyBytes");
  expect(store.records.length).toBe(before);
  // A body exactly at the cap is admitted.
  const ok = await invokeRoom(ctx, { op: "post", topic: "build", body: "y".repeat(8192) });
  expect(ok.details).toMatchObject({ ok: true });
});

test("a clean post carries no deliveryError envelope — only failures do", async () => {
  // room.ts okWithDelivery 619-625: deliveryError is ADDED only when a
  // failure note exists. A clean post's details must have NO deliveryError
  // key at all — a key that is always present (even undefined) teaches
  // models to treat delivery as suspect on every post.
  const { ctx } = newTestStore();
  const res = await invokeRoom(ctx, { op: "post", topic: "build", body: "clean hello" });
  expect(res.details).toMatchObject({ ok: true, op: "post" });
  expect("deliveryError" in (res.details ?? {})).toBe(false);
});

test("a clean release carries no deliveryError envelope — only failures do", async () => {
  // room.ts release arm 1072-1119 via okWithDelivery: the same contract —
  // a clean release's details has NO deliveryError key. The post arm is
  // pinned above; the release arm must obey it too.
  const { ctx } = newTestStore();
  await invokeRoom(ctx, { op: "claim", topic: "build", key: "step", ttl: 60_000 });
  const res = await invokeRoom(ctx, { op: "release", topic: "build", key: "step" });
  expect(res.details).toMatchObject({ ok: true, op: "release" });
  expect("deliveryError" in (res.details ?? {})).toBe(false);
});

test("a clean claim carries no deliveryError envelope — only failures do", async () => {
  // room.ts claim arm 1059-1069 via okWithDelivery: the same contract as
  // the pinned post and release arms — a clean grant's details has NO
  // deliveryError key.
  const { ctx } = newTestStore();
  const res = await invokeRoom(ctx, { op: "claim", topic: "build", key: "step", ttl: 60_000 });
  expect(res.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });
  expect("deliveryError" in (res.details ?? {})).toBe(false);
});
test("release by a non-holder is denied naming the holder", async () => {
  // Release-denied arm (room.ts:1100-1104): a live lease held by someone
  // else is neither released nor reclaimed — the denial names the holder.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const store = roomStoreFor(ctx);
  await invokeRoom(ctx, { op: "claim", topic: "build", key: "step", ttl: 300_000 });
  const other = fakeCtx(root, "AgentB");
  const before = store.records.length;
  const res = await invokeRoom(other, { op: "release", topic: "build", key: "step" });
  expect(res.details).toMatchObject({ ok: false });
  expect(JSON.stringify(res.content)).toContain("denied — not holder");
  expect(JSON.stringify(res.content)).toContain("AgentA");
  expect(store.claims.get("build/step")?.holder).toBe("AgentA");
  expect(store.records.length).toBe(before);
});

test("post with a malformed status ledger is refused naming the missing keys", async () => {
  // R6 validation arm 1 (room.ts:881-886): each of the five keys needs
  // {reason, answer}; a partial ledger names what is missing.
  const { store, ctx } = newTestStore();
  const before = store.records.length;
  const res = await invokeRoom(ctx, {
    op: "post",
    topic: "build",
    body: "status update",
    status: { is_request_satisfied: { reason: "done", answer: "yes" } },
  });
  expect(res.details).toMatchObject({ ok: false });
  expect(JSON.stringify(res.content)).toContain("is_in_loop");
  expect(store.records.length).toBe(before);
});

test("post with a full status ledger but no topic claim is refused", async () => {
  // R6 validation arm 2 (room.ts:890-894): the ledger is written by the
  // agent holding the topic's claim — no claim, no ledger write.
  const { store, ctx } = newTestStore();
  const full = {
    is_request_satisfied: { reason: "r", answer: "a" },
    is_in_loop: { reason: "r", answer: "a" },
    is_progress_being_made: { reason: "r", answer: "a" },
    next_speaker: { reason: "r", answer: "a" },
    instruction_or_question: { reason: "r", answer: "a" },
  };
  const before = store.records.length;
  const res = await invokeRoom(ctx, { op: "post", topic: "build", body: "x", status: full });
  expect(res.details).toMatchObject({ ok: false });
  expect(JSON.stringify(res.content)).toContain("claim build/");
  expect(store.records.length).toBe(before);
});

test("topics/recall content carries the rows, not a count", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  await invokeRoom(ctx, { op: "join" });
  await invokeRoom(ctx, { op: "post", topic: "alpha", body: "needle in here" });

  const topics = (await invokeRoom(ctx, { op: "topics" })).content[0]?.text ?? "";
  expect(topics).toContain("alpha");
  expect(topics).toContain("room topics → 1 topic(s)");

  const recall =
    (await invokeRoom(ctx, { op: "recall", pattern: "needle" })).content[0]?.text ?? "";
  expect(recall).toContain("needle in here");
  expect(recall).toContain("1 match(es)");
});

test("post without a topic is refused", async () => {
  const { ctx } = newTestStore();
  const res = await invokeRoom(ctx, { op: "post", body: "hello" });
  expect(res.details).toMatchObject({ ok: false, error: "post requires a topic" });
});

test("post without a body is refused", async () => {
  const { ctx } = newTestStore();
  const res = await invokeRoom(ctx, { op: "post", topic: "build" });
  expect(res.details).toMatchObject({ ok: false, error: "post requires a body" });
});

// --- F1 security: recall pattern length limit ---

test("recall: pattern over 200 chars is rejected", async () => {
  const { ctx } = newTestStore();
  const longPattern = "a".repeat(201);
  const result = await invokeRoom(ctx, { op: "recall", pattern: longPattern });
  expect(result.details).toMatchObject({ ok: false });
  expect(result.details?.error).toContain("too long");
});

// --- F1 security: recall ReDoS guard ---

test("recall: a catastrophic regex is refused up front, never run", async () => {
  const { store, ctx } = newTestStore();
  // `(a+)+$` is the classic exponential shape: it only backtracks when the match FAILS, so the
  // bodies carry a non-matching tail. The shape is refused before any test runs, so the scan
  // deadline never has to cover a single catastrophic `regex.test()`.
  for (let i = 0; i < 200; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `${"a".repeat(50)}b` });
  }
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      invokeRoom(ctx, { op: "recall", pattern: "(a+)+$" }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("recall hung — ReDoS regression")), 15_000);
      }),
    ]);
    expect(Date.now() - start).toBeLessThan(2_000);
    expect(result.details).toMatchObject({ ok: false });
    expect(result.details?.error).toContain("catastrophic backtracking");
  } finally {
    clearTimeout(timer);
  }
});

test("recall: an ordinary pattern still scans the log", async () => {
  const { store, ctx } = newTestStore();
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "needle in the haystack" });
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "nothing here" });
  const result = await invokeRoom(ctx, { op: "recall", pattern: "needle" });
  expect(result.details).toMatchObject({ ok: true, op: "recall" });
  const matches = (result.details as { matches: Array<{ record: { body?: string } }> }).matches;
  expect(matches.length).toBe(1);
});

// --- F3/F5: the room tree op serves the persisted, no-whole-message view ---

test("tree: the view is persisted beside the tree and carries no whole-message block", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 10; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `msg ${i}` });
  }

  const result = await invokeRoom(ctx, { op: "tree" });
  const blocks = result.details?.blocks as Array<{ lo: number; hi: number; size: number }>;
  expect(blocks.length).toBeGreaterThan(0);
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain("room tree →");
  // F5 — no block covers exactly one message (not even the newest).
  for (const b of blocks) expect(b.size).toBeGreaterThanOrEqual(2);
  expect(blocks[blocks.length - 1].size).toBe(2);

  // F3 — the view landed beside the tree, and a second call serves the SAME tiling.
  expect(fs.existsSync(viewPath(store.treePath))).toBe(true);
  const second = await invokeRoom(ctx, { op: "tree" });
  const secondBlocks = second.details?.blocks as Array<{ lo: number; hi: number }>;
  expect(secondBlocks.map((b) => [b.lo, b.hi])).toEqual(blocks.map((b) => [b.lo, b.hi]));
});

test("tree: a corrupt view file falls back to recomputing, never throws", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 6; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `m${i}` });
  }
  fs.mkdirSync(path.dirname(viewPath(store.treePath)), { recursive: true });
  fs.writeFileSync(viewPath(store.treePath), "\u0000 not json at all");

  const result = await invokeRoom(ctx, { op: "tree" });
  expect(result.details).toMatchObject({ ok: true, op: "tree" });
  const blocks = result.details?.blocks as Array<{ size: number }>;
  expect(blocks.length).toBeGreaterThan(0);
  for (const b of blocks) expect(b.size).toBeGreaterThanOrEqual(2);
});

// --- F5: zoom still reaches a single whole message -------------------------

test("zoom: a pair of messages opens to two raw singletons (zoom reaches one message)", async () => {
  const { store, ctx } = newTestStore();
  for (let i = 0; i < 4; i++) {
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `body-${i}` });
  }
  const result = await invokeRoom(ctx, { op: "zoom", lo: 0, hi: 2 });
  const children = result.details?.children as Array<{
    lo: number;
    hi: number;
    size: number;
    raw: boolean;
    text: string;
  }>;
  expect(children).toHaveLength(2);
  expect(children[0]).toMatchObject({ lo: 0, hi: 1, size: 1, raw: true });
  expect(children[0].text).toContain("body-0");
  expect(children[1]).toMatchObject({ lo: 1, hi: 2, size: 1, raw: true });
  expect(children[1].text).toContain("body-1");
  expect(result.content.map((c) => c.text ?? "").join("\n")).toContain(
    "room zoom \u2192 2 child(ren)",
  );
});

/** The schema the tool registered, by param name — so tests can assert on its descriptions. */
function capturedShapes(): Record<string, { describes: string[] }> {
  const pi = {
    zod: zodStub,
    registerTool: (def: Record<string, unknown>) => {
      captured = def;
    },
  };
  let captured: Record<string, unknown> | undefined;
  registerRoomTool(pi as unknown as Parameters<typeof registerRoomTool>[0]);
  if (!captured) throw new Error("registerRoomTool registered no tool");
  const parameters = captured.parameters as Record<string, { describes: string[] }>;
  expect(parameters).toBeDefined();
  return parameters;
}

// --- descriptions: units, defaults, and discovery vocabulary -----------------

test("every room param carries a description naming its units and which ops read it", () => {
  // The gap this pins: the room tool — the primary one — shipped with NO param descriptions while
  // all three wait tools had them, so an agent loading it saw \`ttl?: number\` with no hint that it
  // was milliseconds and \`lo\`/\`hi\` with no note that they are a block range.
  const shapes = capturedShapes();
  expect(Object.keys(shapes).length).toBeGreaterThan(0);
  for (const [name, schema] of Object.entries(shapes)) {
    const description = schema?.describes?.[schema.describes.length - 1];
    expect(typeof description, `${name} must be described`).toBe("string");
    expect(description!.length, `${name} needs a real description`).toBeGreaterThan(10);
  }
  const ttl = shapes.ttl.describes.join(" ");
  expect(ttl).toContain("MILLISECONDS");
  expect(ttl).toContain("300000");
  const body = shapes.body.describes.join(" ");
  expect(body).toContain("8192");
  const lo = shapes.lo.describes.join(" ");
  expect(lo).toContain("power of two");
  const pattern = shapes.pattern.describes.join(" ");
  expect(pattern).toContain("100");
  const limit = shapes.limit.describes.join(" ");
  expect(limit).toContain("200");
});

test("the tool description carries the vocabulary an agent would actually ask for", () => {
  // Tool discovery is BM25 over name + description, so these phrases are the load-bearing part.
  expect(ROOM_DESCRIPTION).toContain("claim board");
  expect(ROOM_DESCRIPTION).toContain("shared file");
  expect(ROOM_DESCRIPTION).toContain("duplicates");
  expect(ROOM_DESCRIPTION).toContain("release");
  expect(ROOM_DESCRIPTION).toContain("agent://<id>");
  expect(ROOM_DESCRIPTION).toContain("polling");
});

test("the registered description is prompt.render(ROOM_DESCRIPTION)", () => {
  // Guards the wiring, not today's bytes: with an empty context the render is byte-identical,
  // so this passes either way — it exists so a future {{#if}} in ROOM_DESCRIPTION still flows.
  const pi = {
    zod: zodStub,
    registerTool: (def: Record<string, unknown>) => {
      captured = def;
    },
  };
  let captured: Record<string, unknown> | undefined;
  registerRoomTool(pi as unknown as Parameters<typeof registerRoomTool>[0]);
  if (!captured) throw new Error("registerRoomTool registered no tool");
  expect(captured.description).toBe(prompt.render(ROOM_DESCRIPTION));
});

// --- plan 002 — heldTopics liveness ------------------------------------------

test("release prunes the topic from heldTopics when it was the holder's last claim there", () => {
  const s = newStore();
  s.members.set("A", {
    agentId: "A",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  expect(grant(s, "build/step", "A", 60_000).ok).toBe(true);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(true);
  expect(release(s, "build/step", "A", "released")).toBe(true);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(false);
});

test("release keeps the topic while the holder still holds another claim under it", () => {
  const s = newStore();
  s.members.set("A", {
    agentId: "A",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  expect(grant(s, "build/a", "A", 60_000).ok).toBe(true);
  expect(grant(s, "build/b", "A", 60_000).ok).toBe(true);
  expect(release(s, "build/a", "A", "released")).toBe(true);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(true);
  expect(release(s, "build/b", "A", "released")).toBe(true);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(false);
});

test("expireStale prunes heldTopics for the expired holder", () => {
  const s = newStore();
  s.members.set("A", {
    agentId: "A",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  expect(grant(s, "build/step", "A", 1_000).ok).toBe(true);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(true);
  const dropped = expireStale(s, Date.now() + 60_000);
  expect(dropped.length).toBe(1);
  expect(s.members.get("A")?.heldTopics.has("build")).toBe(false);
});

// --- plan 009 — read ops must not mint membership ---------------------------

test("board by a never-joined agent does not add them to the roster", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const store = roomStoreFor(fakeCtx(root, "AgentA"));
  expect(store.members.has("Ghost")).toBe(false);
  await invokeRoom(fakeCtx(root, "Ghost"), { op: "board" });
  expect(store.members.has("Ghost")).toBe(false);
});

test("read by a never-joined agent returns records without minting membership", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const store = roomStoreFor(fakeCtx(root, "AgentA"));
  store.append({ kind: "msg", from: "AgentA", topic: "t", body: "hello" });
  const res = await invokeRoom(fakeCtx(root, "Ghost"), { op: "read" });
  expect((res.details as unknown as { records: unknown[] }).records.length).toBeGreaterThan(0);
  expect(store.members.has("Ghost")).toBe(false);
});

test("post by a never-joined agent DOES create the member (writers keep ensure)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const store = roomStoreFor(fakeCtx(root, "AgentA"));
  await invokeRoom(fakeCtx(root, "Newcomer"), { op: "post", topic: "t", body: "hi" });
  expect(store.members.has("Newcomer")).toBe(true);
});

test("board reports unknown (not running) for members absent from the registry", async () => {
  // After a restart the roster replays from the log while the host registry starts empty: every
  // member would read "running". The honest default matches the /room board path.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  roomStoreFor(ctx);
  await invokeRoom(ctx, { op: "join" });
  AgentRegistry.global().unregister("AgentA");
  const res = await invokeRoom(ctx, { op: "board" });
  const board = res.details?.board as {
    roster: Array<{ agentId: string; status: string }>;
  };
  expect(board.roster.find((m) => m.agentId === "AgentA")?.status).toBe("unknown");
});

test("post with replyTo stamps threadRoot and subscribes the poster (§5.1 N1)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctxA = fakeCtx(root, "AgentA");
  const store = roomStoreFor(ctxA);
  const first = await invokeRoom(ctxA, { op: "post", topic: "t", body: "root message" });
  const rootId = (first.details as unknown as { id: string }).id;
  // B replies without following the topic: the reply carries the root and B is subscribed.
  const ctxB = fakeCtx(root, "AgentB");
  const reply = await invokeRoom(ctxB, { op: "post", topic: "t", body: "reply", replyTo: rootId });
  expect(reply.details).toMatchObject({ ok: true, op: "post" });
  const replyRecord = store.byId.get((reply.details as unknown as { id: string }).id);
  expect(replyRecord?.kind).toBe("msg");
  if (replyRecord?.kind !== "msg") throw new Error("expected msg");
  expect(replyRecord.threadRoot).toBe(rootId);
  expect(store.members.get("AgentB")?.threadRoots.has(rootId)).toBe(true);
  // A nested reply resolves the ROOT, not the parent.
  const nested = await invokeRoom(ctxA, {
    op: "post",
    topic: "t",
    body: "nested",
    replyTo: replyRecord.id,
  });
  const nestedRecord = store.byId.get((nested.details as unknown as { id: string }).id);
  if (nestedRecord?.kind !== "msg") throw new Error("expected msg");
  expect(nestedRecord.threadRoot).toBe(rootId);
});

test("post with an unknown replyTo still posts, with no threadRoot", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const store = roomStoreFor(ctx);
  const res = await invokeRoom(ctx, { op: "post", topic: "t", body: "orphan", replyTo: "nope" });
  expect(res.details).toMatchObject({ ok: true, op: "post" });
  const record = store.byId.get((res.details as unknown as { id: string }).id);
  if (record?.kind !== "msg") throw new Error("expected msg");
  expect(record.threadRoot).toBeUndefined();
});

// --- the review fixes: expiry notice, hook guard, throw-to-result -----------

test("the claim sweep hands the expiry to the registered notifier", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const store = roomStoreFor(fakeCtx(root, "AgentA"));
  // A stale lease: a TTL of zero means it is already past.
  store.append({ kind: "claim", from: "AgentA", resource: "build/step", ttlMs: 0 });
  const seen: string[] = [];
  registerSweepNotifier(store.root, (expired) => {
    for (const claim of expired) seen.push(`${claim.resource}:${claim.prev}`);
  });
  // The sweep is the second interval the store schedules; capture it and run it.
  const intervals: Array<() => unknown> = [];
  const ctx = {
    ...fakeCtx(root, "AgentA"),
    setInterval: (cb: () => unknown) => {
      intervals.push(cb);
      return 0 as unknown as Timer;
    },
  } as unknown as ExtensionContext;
  roomTimers.stop(store.root);
  roomTimers.start(store.root, ctx);
  expect(intervals.length).toBe(2);
  await intervals[1]!();
  expect(seen.length).toBe(1);
  expect(seen[0]).toContain("build/step:AgentA");
  // The expiry is a durable record, not just a notification.
  const release = store.records.filter((r) => r.kind === "release").at(-1);
  expect(release?.kind).toBe("release");
  if (release?.kind === "release") expect(release.reason).toBe("expired");
});

test("a release of a stale claim held by someone else reports the reclaim, not a denial", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentB");
  const store = roomStoreFor(ctx);
  registerAgent("AgentA", "running");
  store.append({ kind: "claim", from: "AgentA", resource: "build/step", ttlMs: 0 });
  const res = await invokeRoom(ctx, { op: "release", topic: "build", key: "step" });
  expect(res.details).toMatchObject({ ok: true, op: "release" });
  expect(String(res.content[0]?.text)).toContain("reclaimed");
  expect(String(res.content[0]?.text)).not.toContain("denied");
});

test("a throwing mutation is a result, never a throw out of the tool", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-tool-"));
  const ctx = fakeCtx(root, "AgentA");
  const store = roomStoreFor(ctx);
  // A full disk (ENOSPC) on the log write.
  const original = store.append;
  (store as { append: typeof store.append }).append = (() => {
    throw new Error("ENOSPC: no space left on device");
  }) as typeof store.append;
  try {
    const res = await invokeRoom(ctx, { op: "post", topic: "t", body: "hello" });
    expect(res.details).toMatchObject({ ok: false });
    expect(String(res.details?.error)).toContain("ENOSPC");
    expect(res.content[0]?.text).toContain("ENOSPC");
  } finally {
    (store as { append: typeof store.append }).append = original;
  }
});

test("release of a missing key is refused as unknown and appends nothing", async () => {
  const { store, ctx } = newTestStore();
  const before = store.records.length;
  const res = await invokeRoom(ctx, { op: "release", topic: "build", key: "ghost" });
  expect(res.details).toMatchObject({ ok: false, error: "unknown resource" });
  expect(store.records.length).toBe(before);
});

test("release without topic and key is refused", async () => {
  const { ctx } = newTestStore();
  const res = await invokeRoom(ctx, { op: "release" });
  expect(res.details).toMatchObject({ ok: false, error: "release requires topic and key" });
});
