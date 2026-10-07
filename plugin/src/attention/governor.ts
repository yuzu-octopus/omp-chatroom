import type { MemberState, RoomStore } from "../store/room-store";   // MemberState is owned here (K11)
import type { RoomRecord } from "../store/schema";
// SCAFFOLD-DEFINED — §5.2 lists the knobs as a table, never as a type.
export interface Caps {
  maxT1PerTurn: number; maxT1Tokens: number; coalesceCount: number; coalesceMs: number;
  postsPerWindow: number; burstPosts: number; claimTtlMs: number; claimSweepMs: number;   // K3
  logMaxRecords: number; logMaxAgeMs: number; maxBodyBytes: number;                       // K19
  compactionCallsPerDay: number;                                                          // K4 — a rate
}
export const DEFAULT_CAPS: Caps = {
  maxT1PerTurn: 10, maxT1Tokens: 2048, coalesceCount: 20, coalesceMs: 300_000,
  postsPerWindow: 1, burstPosts: 10, claimTtlMs: 300_000, claimSweepMs: 5_000,
  logMaxRecords: 5_000, logMaxAgeMs: 604_800_000, maxBodyBytes: 8192,
  compactionCallsPerDay: 20_000,
};   // the §5.2 caps verbatim

export type PostVerdict = "green" | "yellow" | "red";     // §5.2

export function admitPost(store: RoomStore, agentId: string, now: number): PostVerdict {
  throw new Error("not implemented");
}
export function selectT1(store: RoomStore, viewer: MemberState, pending: readonly RoomRecord[]):
  { injected: RoomRecord[]; summaryLine: string | null } {                      // §5.2 K/B caps
  throw new Error("not implemented");
}
export function coalescePending(store: RoomStore, viewer: MemberState, now: number): string | null {  // §5.2 N/T
  throw new Error("not implemented");
}
export function isMuted(store: RoomStore, viewer: MemberState, record: RoomRecord): boolean {
  throw new Error("not implemented");
}
export function muteTopic(store: RoomStore, agentId: string, topic: string): void {
  throw new Error("not implemented");
}
export function unmuteTopic(store: RoomStore, agentId: string, topic: string): void {
  throw new Error("not implemented");
}
export function muteRoom(store: RoomStore, agentId: string): void {
  throw new Error("not implemented");
}
export function unmuteRoom(store: RoomStore, agentId: string): void {
  throw new Error("not implemented");
}
export function unreadCounts(store: RoomStore, viewer: MemberState): Map<string, number> {
  throw new Error("not implemented");
}
export function noteGap(store: RoomStore, skipped: number, reason: "retention" | "invalid" | "corrupt"): RoomRecord {  // [invented]
  throw new Error("not implemented");
}
export function truncateOversized(body: string, tokenBudget: number): { head: string; handle: string } {  // §5.2 N7
  throw new Error("not implemented");
}
