import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import type { RoomStore } from "./room-store"; // type-only — breaks the runtime cycle
import type { RoomRecord } from "./schema";
// §3.4 — verbatim
export interface ClaimState {
  resource: string;
  holder: string;
  ttlMs: number;
  acquiredAt: number;
  seq: number;
}

export type GrantResult =
  | { ok: true; claim: ClaimState }
  | { ok: false; holder: string; expiresAt: number };

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
): GrantResult {
  const existing = store.claims.get(resource);
  if (existing !== undefined) {
    return { ok: false, holder: existing.holder, expiresAt: existing.acquiredAt + existing.ttlMs };
  }
  store.append({ kind: "claim", from: holder, resource, ttlMs });
  return { ok: true, claim: store.claims.get(resource)! };
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

export function reclaimIfStale(store: RoomStore, resource: string, now: number): ClaimState | null {
  const existing = store.claims.get(resource);
  if (existing === undefined || !isStale(existing, now)) return null;

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
  return resolveWaiters(store, resource, existing.ttlMs);
}

export function contended(store: RoomStore, resource: string): string[] {
  return [...(store.waiters.get(resource) ?? [])];
}

// K3/K12 — the TIMER path (nobody waiting): drop the stale claim, no successor.
// Distinct from reclaimIfStale, the CONTENDED path (replace + notify the previous holder).
export function expireStale(
  store: RoomStore,
  now: number,
): Array<{ resource: string; prev: string; next?: string }> {
  const stale: ClaimState[] = [];
  for (const claim of store.claims.values()) {
    if (isStale(claim, now)) stale.push(claim);
  }
  const out: Array<{ resource: string; prev: string; next?: string }> = [];
  for (const claim of stale) {
    store.append({
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
        ? { resource: claim.resource, prev: claim.holder }
        : { resource: claim.resource, prev: claim.holder, next: next.holder },
    );
  }
  return out;
}

// §3.4 "claim state is rebuilt by replaying the log on first open"
export function hydrateClaims(store: RoomStore, records: readonly RoomRecord[]): void {
  for (const record of records) {
    if (record.kind === "claim") {
      store.claims.set(record.resource, {
        resource: record.resource,
        holder: record.from,
        ttlMs: record.ttlMs,
        acquiredAt: record.ts,
        seq: record.seq,
      });
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
