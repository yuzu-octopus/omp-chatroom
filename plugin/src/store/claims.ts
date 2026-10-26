import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { topicOf } from "../ids";
import type { RoomStore } from "./room-store"; // type-only — breaks the runtime cycle
import type { RoomRecord } from "./schema";
// §3.4 — verbatim
export interface ClaimState {
  resource: string;
  holder: string;
  ttlMs: number;
  acquiredAt: number;
  seq: number;
  /** R1 — the generation of this grant (per resource); it rises when ownership changes. */
  gen: number;
  /** R3 — the resources this claim waits on. */
  dependsOn: string[];
}

export type GrantResult =
  | { ok: true; claim: ClaimState }
  | { ok: false; holder: string; expiresAt: number }
  /** R3 — the claim was refused because a dependency is still held. */
  | {
      ok: false;
      holder: string;
      expiresAt: number;
      blockedBy: { resource: string; holder: string }[];
    };

// §3.2 defines the release-reason union inside RoomRecord; alias it rather than redeclare.
export type ReleaseReason = Extract<RoomRecord, { kind: "release" }>["reason"];
// §3.4 — staleness = TTL expired OR the holder is parked/aborted. A holder that is merely idle
// still holds its lease until the TTL runs out (the TTL is the idle bound); `parked`/`aborted`
// are the only statuses that displace a live lease early. Status is read from the host registry
// (§1.3 assumption 9: `AgentRegistry.global()` is populated before any tool runs); a holder not
// in the registry has no status and is displaced only by TTL.
function isStale(claim: ClaimState, now: number): boolean {
  if (now >= claim.acquiredAt + claim.ttlMs) return true;
  const status = AgentRegistry.global().get(claim.holder)?.status;
  return status === "parked" || status === "aborted";
}

// §3.4 — first-writer-wins. A loss appends NOTHING: it returns the current holder and expiry.
// `append` projects the claim into `store.claims` (K15), so listeners woken during the append
// already observe the grant.
export function grant(
  store: RoomStore,
  resource: string,
  holder: string,
  ttlMs: number,
  dependsOn?: readonly string[],
): GrantResult {
  const existing = store.claims.get(resource);
  if (existing !== undefined) {
    return { ok: false, holder: existing.holder, expiresAt: existing.acquiredAt + existing.ttlMs };
  }
  // R3 — dependency ordering. A claim may declare the resources that must be free before it can
  // start; if one of them is still held, the claim is REFUSED and the refusal names the blocker.
  // This is the shape Claude Code's shipped agent teams use ("a pending task with unresolved
  // dependencies cannot be claimed until those dependencies are completed") and Smith's contract
  // net ("A subcontract will not be announced... until its predecessors have been completed").
  //
  // A dependency that nobody holds is satisfied: the ordering is about the CLAIM order, not about
  // a resource having to exist first.
  if (dependsOn !== undefined && dependsOn.length > 0) {
    const blockedBy = dependsOn
      .filter((dep) => dep !== resource)
      .map((dep) => ({ resource: dep, holder: store.claims.get(dep)?.holder }))
      .filter((dep): dep is { resource: string; holder: string } => dep.holder !== undefined);
    if (blockedBy.length > 0) {
      return {
        ok: false,
        holder: blockedBy[0]!.holder,
        expiresAt: 0,
        blockedBy,
      };
    }
  }
  store.append({
    kind: "claim",
    from: holder,
    resource,
    ttlMs,
    // Self is not a dependency (the block check above drops it): recording
    // it would mislead the board ("needs X" while holding X).
    ...(dependsOn !== undefined && dependsOn.length > 0
      ? { dependsOn: dependsOn.filter((dep) => dep !== resource) }
      : {}),
  });
  return { ok: true, claim: store.claims.get(resource)! };
}
/**
 * R1 — the generation rule, per resource. It rises when OWNERSHIP changes:
 * a fresh grant, or one that takes the resource from a previous holder,
 * gets the next generation; a RENEWAL by the same holder keeps it. The
 * counter survives the release (it lives beside the claim map, not inside
 * it), so a re-grant never reuses a generation. The projection
 * (room-store.ts) and the replay (hydrateClaims) each apply this same rule
 * — the RECORD carries no `gen` field.
 */
/**
 * R1 — the generation a caller claims to hold, and whether it is stale.
 *
 * A caller that was displaced (its lease was reclaimed) still holds the generation it was given.
 * Presenting it is how the room learns that the caller is a zombie: the generation is behind the
 * resource's current one.
 */
export function staleGen(
  store: RoomStore,
  resource: string,
  presented: number | undefined,
): boolean {
  if (presented === undefined) return false; // the fence is opt-in
  const current = store.claimGens.get(resource);
  if (current === undefined) return false; // the resource was never granted
  return presented < current;
}

// M11 — `prevHolder` is required on the record: for a reclaim it is the displaced holder; a plain
// release by the holder defaults it to `holder`. The T0 eviction notice classifies on it (§16).
export function release(
  store: RoomStore,
  resource: string,
  holder: string,
  reason: ReleaseReason,
  prevHolder: string = holder,
): boolean {
  const existing = store.claims.get(resource);
  if (existing === undefined || existing.holder !== holder) return false;
  store.append({ kind: "release", from: holder, resource, reason, prevHolder });
  // §4.4 — the oldest waiter is resolved AND granted the lease with the dropped lease's ttl.
  resolveWaiters(store, resource, existing.ttlMs);
  return true;
}

/**
 * The outcome of a reclaim attempt.
 *
 * `reclaimed: false` means nothing happened (no claim, or the claim is still live). `reclaimed:
 * true` means the stale claim WAS freed — `holder` is the new lease holder when a waiter was
 * promoted, or null when the lease was simply dropped. The distinction matters: the old API
 * returned the promoted claim, so a reclaim with no waiter looked identical to "not stale" and
 * the caller reported "denied — not holder" for a lease it had just freed.
 */
export type ReclaimOutcome = {
  reclaimed: boolean;
  holder: string | null;
  prevHolder: string;
};

export function reclaimIfStale(store: RoomStore, resource: string, now: number): ReclaimOutcome {
  const existing = store.claims.get(resource);
  if (existing === undefined || !isStale(existing, now)) {
    return { reclaimed: false, holder: null, prevHolder: "" };
  }

  // §3.4 — the CONTENDED path: replace the stale claim and notify the previous holder (T0).
  // `from` is the releaser; for a reclaim that is the new claimant (the oldest waiter), else the
  // arbiter itself — never the displaced holder (M11).
  const next = store.waiters.get(resource)?.[0] ?? "system";
  store.append({
    kind: "release",
    from: next,
    resource,
    reason: "reclaimed",
    prevHolder: existing.holder,
  });
  const promoted = resolveWaiters(store, resource, existing.ttlMs);
  return { reclaimed: true, holder: promoted?.holder ?? null, prevHolder: existing.holder };
}

export function contended(store: RoomStore, resource: string): string[] {
  return [...(store.waiters.get(resource) ?? [])];
}

/**
 * Extend a lease the caller already holds.
 *
 * A TTL is a guess about how long the work takes — "timeout is only a guess" (Chubby's KeepAlive).
 * So **claiming a resource you already hold renews it**: no new op, and it replaces the
 * "denied — held by yourself" answer with the truth. A renewal is a `claim` record with the same
 * holder; the projection resets the lease unconditionally, moving its start to now.
 */
export type RenewResult =
  | { ok: true; claim: ClaimState }
  | { ok: false; holder: string | undefined; expiresAt: number };

export function renew(
  store: RoomStore,
  resource: string,
  holder: string,
  ttlMs: number,
): RenewResult {
  const existing = store.claims.get(resource);
  if (existing === undefined || existing.holder !== holder) {
    return {
      ok: false,
      holder: existing?.holder,
      expiresAt: existing === undefined ? 0 : existing.acquiredAt + existing.ttlMs,
    };
  }
  store.append({ kind: "claim", from: holder, resource, ttlMs });
  return { ok: true, claim: store.claims.get(resource)! };
}

// K3/K12 — the TIMER path (nobody waiting): drop the stale claim, no successor.
// Distinct from reclaimIfStale, the CONTENDED path (replace + notify the previous holder).
export function expireStale(
  store: RoomStore,
  now: number,
): Array<{ resource: string; prev: string; next?: string; record: RoomRecord }> {
  const stale: ClaimState[] = [];
  for (const claim of store.claims.values()) {
    if (isStale(claim, now)) stale.push(claim);
  }
  const out: Array<{ resource: string; prev: string; next?: string; record: RoomRecord }> = [];
  for (const claim of stale) {
    const record = store.append({
      kind: "release",
      from: "system",
      resource: claim.resource,
      reason: "expired",
      prevHolder: claim.holder,
    });
    // §3.4 step 3 — if waiters exist, the oldest is promoted with the expired lease's ttl.
    const next = resolveWaiters(store, claim.resource, claim.ttlMs);
    out.push(
      next === null
        ? { resource: claim.resource, prev: claim.holder, record }
        : { resource: claim.resource, prev: claim.holder, next: next.holder, record },
    );
  }
  return out;
}

// §3.4 "claim state is rebuilt by replaying the log on first open"
export function hydrateClaims(store: RoomStore, records: readonly RoomRecord[]): void {
  for (const record of records) {
    if (record.kind === "claim") {
      // R1 — the same rule the projection applies, so a replay reproduces the generations.
      const current = store.claimGens.get(record.resource) ?? 0;
      const previous = store.claims.get(record.resource);
      const ownershipChanges = previous === undefined || previous.holder !== record.from;
      const gen = ownershipChanges ? current + 1 : Math.max(current, 1);
      store.claimGens.set(record.resource, gen);
      store.claims.set(record.resource, {
        resource: record.resource,
        holder: record.from,
        ttlMs: record.ttlMs,
        acquiredAt: record.ts,
        seq: record.seq,
        gen,
        dependsOn: record.dependsOn ?? [],
      });
      store.members.get(record.from)?.heldTopics.add(topicOf(record.resource));
    } else if (record.kind === "release") {
      store.claims.delete(record.resource);
    }
  }
}

// §4.4 — the in-store condition variable for wait_for_claim.
export function enqueueWaiter(store: RoomStore, resource: string, agentId: string): void {
  // [invented]
  const queue = store.waiters.get(resource);
  if (queue === undefined) {
    store.waiters.set(resource, [agentId]);
    return;
  }
  if (!queue.includes(agentId)) queue.push(agentId);
}

export function dequeueWaiter(store: RoomStore, resource: string, agentId: string): void {
  // [invented]
  const queue = store.waiters.get(resource);
  if (queue === undefined) return;
  const at = queue.indexOf(agentId);
  if (at !== -1) queue.splice(at, 1);
  if (queue.length === 0) store.waiters.delete(resource);
}

// §4.4 — a waiter that lost the race is moved to the BACK of the queue; it never fails.
export function requeueWaiter(store: RoomStore, resource: string, agentId: string): void {
  // [invented]
  dequeueWaiter(store, resource, agentId);
  enqueueWaiter(store, resource, agentId);
}

// §4.4 — grant the lease to the OLDEST queued waiter. Null when the queue is empty OR a claim is
// currently held (idempotent: two callers racing on the same promotion cannot double-grant).
export function resolveWaiters(
  store: RoomStore,
  resource: string,
  ttlMs: number,
): ClaimState | null {
  // [invented]
  if (store.claims.has(resource)) return null;
  const queue = store.waiters.get(resource);
  if (queue === undefined || queue.length === 0) return null;
  const holder = queue.shift()!;
  if (queue.length === 0) store.waiters.delete(resource);
  store.append({ kind: "claim", from: holder, resource, ttlMs });
  return store.claims.get(resource)!;
}
