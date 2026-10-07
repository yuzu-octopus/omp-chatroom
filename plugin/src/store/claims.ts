import type { RoomRecord } from "./schema";
import type { RoomStore } from "./room-store";   // type-only — breaks the runtime cycle
// §3.4 — verbatim
export interface ClaimState {
  resource: string; holder: string; ttlMs: number; acquiredAt: number; seq: number;
}

export type GrantResult =
  | { ok: true; claim: ClaimState }
  | { ok: false; holder: string; expiresAt: number };

// §3.2 defines the release-reason union inside RoomRecord; alias it rather than redeclare.
export type ReleaseReason = Extract<RoomRecord, { kind: "release" }>["reason"];

export function grant(store: RoomStore, resource: string, holder: string, ttlMs: number): GrantResult {
  throw new Error("not implemented");
}
// M11 — `prevHolder` is required on the record: for a reclaim it is the displaced holder; a plain
// release by the holder defaults it to `holder`. The T0 eviction notice classifies on it (§16).
export function release(store: RoomStore, resource: string, holder: string, reason: ReleaseReason,
                        prevHolder: string = holder): boolean {
  throw new Error("not implemented");
}
export function reclaimIfStale(store: RoomStore, resource: string, now: number): ClaimState | null {
  throw new Error("not implemented");
}
export function contended(store: RoomStore, resource: string): string[] {
  throw new Error("not implemented");
}

// K3/K12 — the TIMER path (nobody waiting): drop the stale claim, no successor.
// Distinct from reclaimIfStale, the CONTENDED path (replace + notify the previous holder).
export function expireStale(store: RoomStore, now: number): Array<{ resource: string; prev: string; next?: string }> {
  throw new Error("not implemented");
}

// §3.4 "claim state is rebuilt by replaying the log on first open"
export function hydrateClaims(store: RoomStore, records: readonly RoomRecord[]): void {
  throw new Error("not implemented");
}

// §4.4 — the in-store condition variable for wait_for_claim.
export function enqueueWaiter(store: RoomStore, resource: string, agentId: string): void {   // [invented]
  throw new Error("not implemented");
}
export function dequeueWaiter(store: RoomStore, resource: string, agentId: string): void {  // [invented]
  throw new Error("not implemented");
}
export function requeueWaiter(store: RoomStore, resource: string, agentId: string): void {  // [invented]
  throw new Error("not implemented");
}
export function resolveWaiters(store: RoomStore, resource: string, ttlMs: number): ClaimState | null { // [invented]
  throw new Error("not implemented");
}
