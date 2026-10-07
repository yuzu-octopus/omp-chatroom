import type { MemberState, RoomStore } from "../store/room-store";   // MemberState is owned here (K11)
import type { RoomRecord } from "../store/schema";
import { estimateTokens } from "../onboarding/digest";
import { classify } from "./tiers";
import { roomBodyOf } from "./delivery";

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

// §5.2 N5 [invented] — T0 is exempt from K/B but carries its own coalescing ceiling: past it the
// pending interrupts are batched into ONE digest interrupt rather than dropped.
export const T0_COALESCE_CEILING = 50;

// §5.2 — CIR is "1 post / 2 s" (RFC 1459 §8.10, Slack 1/s/channel); the knob is `postsPerWindow`
// tokens per this window. EBS defaults to CBS (RFC 2697's own default), so the burst is 2×CBS.
const POST_WINDOW_MS = 2_000;

export function selectT0(pending: readonly RoomRecord[], ceiling: number = T0_COALESCE_CEILING):
  { injected: RoomRecord[]; summaryLine: string | null } {
  // Never dropped: under the ceiling every interrupt is injected; past it they are batched into a
  // single digest interrupt that carries the count.
  if (pending.length <= ceiling) return { injected: [...pending], summaryLine: null };
  return {
    injected: [],
    summaryLine: `[T0] room ⟵ ${pending.length} interrupts batched (ceiling ${ceiling}) — read with room{op:"read"}`,
  };
}

// --- srTCM (RFC 2697) -----------------------------------------------------
// Per (room, agent) state: two token buckets, both starting FULL and both refilled at CIR.
// Green = the committed bucket (CBS); yellow = the excess bucket (EBS, the burst); red = neither.
interface Buckets { committed: number; excess: number; updatedAt: number }
const BUCKETS: WeakMap<RoomStore, Map<string, Buckets>> = new WeakMap();

function bucketsFor(store: RoomStore, agentId: string, now: number): Buckets {
  let perStore = BUCKETS.get(store);
  if (perStore === undefined) {
    perStore = new Map();
    BUCKETS.set(store, perStore);
  }
  let bucket = perStore.get(agentId);
  if (bucket === undefined) {
    bucket = { committed: DEFAULT_CAPS.burstPosts, excess: DEFAULT_CAPS.burstPosts, updatedAt: now };
    perStore.set(agentId, bucket);
    return bucket;
  }
  const refill = ((now - bucket.updatedAt) * DEFAULT_CAPS.postsPerWindow) / POST_WINDOW_MS;
  if (refill > 0) {
    bucket.committed = Math.min(DEFAULT_CAPS.burstPosts, bucket.committed + refill);
    bucket.excess = Math.min(DEFAULT_CAPS.burstPosts, bucket.excess + refill);
    bucket.updatedAt = now;
  }
  return bucket;
}

/** Room posts only; T0 DMs are exempt (§5.2). `red` means coalesce the post, never drop it. */
export function admitPost(store: RoomStore, agentId: string, now: number): PostVerdict {
  const bucket = bucketsFor(store, agentId, now);
  if (bucket.committed >= 1) {
    bucket.committed -= 1;
    return "green";
  }
  if (bucket.excess >= 1) {
    bucket.excess -= 1;
    return "yellow";
  }
  return "red";
}

// --- T1 injection cap (K messages / B tokens per turn) --------------------

/** §5.2 — oldest-first up to K records AND B tokens, then one summary line for the remainder. */
export function selectT1(store: RoomStore, viewer: MemberState, pending: readonly RoomRecord[]):
  { injected: RoomRecord[]; summaryLine: string | null } {
  const injected: RoomRecord[] = [];
  let tokens = 0;
  for (const record of pending) {
    if (injected.length >= DEFAULT_CAPS.maxT1PerTurn) break;
    const cost = estimateTokens(roomBodyOf(record));
    // Always admit the first record (progress over a stall); a later one must fit the budget.
    if (injected.length > 0 && tokens + cost > DEFAULT_CAPS.maxT1Tokens) break;
    injected.push(record);
    tokens += cost;
  }
  const dropped = pending.length - injected.length;
  if (dropped <= 0) return { injected, summaryLine: null };
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const mentions = pending.filter(r => r.kind === "msg" && r.mention?.includes(viewer.agentId)).length;
  const mentionNote = mentions > 0 ? ` (${mentions} mention you)` : "";
  return {
    injected,
    summaryLine: `+${dropped} more room messages${mentionNote} — read with room{op:"read", since:${cursor}}`,
  };
}

// --- T2 coalescing (N pending or T lag) -----------------------------------

/** §5.2 — one digest line once N T2 records are pending OR the oldest has lagged T; else null. */
export function coalescePending(store: RoomStore, viewer: MemberState, now: number): string | null {
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const t2 = store.records.filter(
    r => r.seq > cursor && classify(r, viewer) === "T2" && !isMuted(store, viewer, r),
  );
  if (t2.length === 0) return null;
  const lagMs = now - t2[0]!.ts;
  if (t2.length < DEFAULT_CAPS.coalesceCount && lagMs < DEFAULT_CAPS.coalesceMs) return null;
  const topics = new Set<string>();
  for (const r of t2) if (r.kind === "msg" || r.kind === "note") topics.add(r.topic);
  const where = topics.size > 0 ? ` in ${[...topics].slice(0, 3).join(", ")}` : "";
  return `room ⟵ ${t2.length} new message(s)${where} — read with room{op:"read", since:${cursor}}`;
}

// --- mute -----------------------------------------------------------------

// §5.2 — a muted topic never wakes, never injects and never counts as unread, EXCEPT an explicit
// mention, which promotes to T0 and is therefore never muted. The sentinel "" mutes the whole room.
export function isMuted(store: RoomStore, viewer: MemberState, record: RoomRecord): boolean {
  if (record.kind === "msg" && record.mention?.includes(viewer.agentId)) return false;
  if (viewer.muted.has("")) return true;
  const topic = record.kind === "msg" || record.kind === "note" ? record.topic : undefined;
  return topic !== undefined && viewer.muted.has(topic);
}

export function muteTopic(store: RoomStore, agentId: string, topic: string): void {
  memberFor(store, agentId).muted.add(topic);
}

export function unmuteTopic(store: RoomStore, agentId: string, topic: string): void {
  memberFor(store, agentId).muted.delete(topic);
}

export function muteRoom(store: RoomStore, agentId: string): void {
  memberFor(store, agentId).muted.add("");
}

export function unmuteRoom(store: RoomStore, agentId: string): void {
  memberFor(store, agentId).muted.delete("");
}

function memberFor(store: RoomStore, agentId: string): MemberState {
  const existing = store.members.get(agentId);
  if (existing !== undefined) return existing;
  const fresh: MemberState = {
    agentId, joinedAtSeq: store.seq,
    topics: new Set(), muted: new Set(), threadRoots: new Set(), heldTopics: new Set(),
  };
  store.members.set(agentId, fresh);
  return fresh;
}

// --- unread counts --------------------------------------------------------

/** §5.2 — per-topic unread above the viewer's cursor; a muted topic contributes zero. */
export function unreadCounts(store: RoomStore, viewer: MemberState): Map<string, number> {
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const counts = new Map<string, number>();
  for (const record of store.records) {
    if (record.seq <= cursor) continue;
    if (record.kind !== "msg" && record.kind !== "note") continue;
    if (isMuted(store, viewer, record)) continue;
    counts.set(record.topic, (counts.get(record.topic) ?? 0) + 1);
  }
  return counts;
}

// --- retention gap notice -------------------------------------------------

export function noteGap(store: RoomStore, skipped: number, reason: "retention" | "invalid" | "corrupt"): RoomRecord {
  return store.append({ kind: "gap", from: "system", skipped, reason });
}

// --- oversized message (N7) -----------------------------------------------

/** §5.2 N7 — a message over B tokens is truncated to a head + a read handle; never lost from the log. */
export function truncateOversized(body: string, tokenBudget: number): { head: string; handle: string } {
  if (estimateTokens(body) <= tokenBudget) return { head: body, handle: "" };
  const headChars = Math.max(0, tokenBudget * 4);
  const head = `${body.slice(0, headChars)}…`;
  return { head, handle: "… truncated — read the full record with room{op:\"read\"}" };
}
