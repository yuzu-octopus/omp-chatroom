import { estimateTokens } from "../onboarding/digest";
import { safeRoomText } from "../onboarding/escape";
import type { MemberState, RoomStore } from "../store/room-store"; // MemberState is owned here (K11)
import type { RoomRecord } from "../store/schema";
import { roomBodyOf } from "./delivery";
import { classify } from "./tiers";

// SCAFFOLD-DEFINED — §5.2 lists the knobs as a table, never as a type.
export interface Caps {
  maxT1PerTurn: number;
  maxT1Tokens: number;
  coalesceCount: number;
  coalesceMs: number;
  postsPerWindow: number;
  burstPosts: number;
  claimTtlMs: number;
  claimSweepMs: number; // K3
  logMaxRecords: number;
  logMaxAgeMs: number;
  maxBodyBytes: number; // K19
  compactionCallsPerDay: number; // K4 — a rate
}
export const DEFAULT_CAPS: Caps = {
  maxT1PerTurn: 10,
  maxT1Tokens: 2048,
  coalesceCount: 20,
  coalesceMs: 300_000,
  postsPerWindow: 1,
  burstPosts: 10,
  claimTtlMs: 300_000,
  claimSweepMs: 5_000,
  logMaxRecords: 5_000,
  logMaxAgeMs: 604_800_000,
  maxBodyBytes: 8192,
  compactionCallsPerDay: 20_000,
}; // the §5.2 caps verbatim

export type PostVerdict = "green" | "yellow" | "red"; // §5.2

// §5.2 N5 [invented] — T0 is exempt from K/B but carries its own coalescing ceiling: past it the
// pending interrupts are batched into ONE digest interrupt rather than dropped.
export const T0_COALESCE_CEILING = 50;

// §5.2 — CIR is "1 post / 2 s" (RFC 1459 §8.10, Slack 1/s/channel); the knob is `postsPerWindow`
// tokens per this window. EBS defaults to CBS (RFC 2697's own default), so the burst is 2×CBS.
const POST_WINDOW_MS = 2_000;

export function selectT0(
  pending: readonly RoomRecord[],
  ceiling: number = T0_COALESCE_CEILING,
): { injected: RoomRecord[]; summaryLine: string | null } {
  // Never dropped: under the ceiling every interrupt is injected; past it they are batched into a
  // single digest interrupt that carries the count. The CALLER must record the batched seqs as
  // GIVEN (cursors.markDeliveredT0): the summary sends the recipient to `room{op:"read"}` instead
  // of injecting them, and without that record the very next pass would inject all 50+
  // individually — the ceiling undone by the pass that was supposed to enforce it.
  if (pending.length <= ceiling) return { injected: [...pending], summaryLine: null };
  return {
    injected: [],
    summaryLine: `[T0] room ⟵ ${pending.length} interrupts batched (ceiling ${ceiling}) — read with room{op:"read"}`,
  };
}

// --- srTCM (RFC 2697) -----------------------------------------------------
// Per (room, agent) state: two token buckets, both starting FULL and both refilled at CIR.
// Green = the committed bucket (CBS); yellow = the excess bucket (EBS, the burst); red = neither.
interface Buckets {
  committed: number;
  excess: number;
  updatedAt: number;
}
const BUCKETS: WeakMap<RoomStore, Map<string, Buckets>> = new WeakMap();

function bucketsFor(
  store: RoomStore,
  agentId: string,
  now: number,
  caps: Caps = DEFAULT_CAPS,
): Buckets {
  let perStore = BUCKETS.get(store);
  if (perStore === undefined) {
    perStore = new Map();
    BUCKETS.set(store, perStore);
  }
  let bucket = perStore.get(agentId);
  if (bucket === undefined) {
    bucket = {
      committed: caps.burstPosts,
      excess: caps.burstPosts,
      updatedAt: now,
    };
    perStore.set(agentId, bucket);
    return bucket;
  }
  const refill = ((now - bucket.updatedAt) * caps.postsPerWindow) / POST_WINDOW_MS;
  if (refill > 0) {
    bucket.committed = Math.min(caps.burstPosts, bucket.committed + refill);
    bucket.excess = Math.min(caps.burstPosts, bucket.excess + refill);
    bucket.updatedAt = now;
  }
  return bucket;
}

/** Room posts only; T0 DMs are exempt (§5.2). `red` means coalesce the post, never drop it. */
export function admitPost(
  store: RoomStore,
  agentId: string,
  now: number,
  caps: Caps = DEFAULT_CAPS,
): PostVerdict {
  const bucket = bucketsFor(store, agentId, now, caps);
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

// §5.2 — K/B are PER TURN, so the ledger lives on the store beside the cursors. `turn_start`
// (onboarding/hook.ts) resets it; a store created before the first turn starts with a full budget.
interface TurnBudget {
  records: number;
  tokens: number;
}
const TURN_BUDGET = new WeakMap<RoomStore, Map<string, TurnBudget>>();

function budgetFor(store: RoomStore, agentId: string): TurnBudget {
  let byAgent = TURN_BUDGET.get(store);
  if (byAgent === undefined) {
    byAgent = new Map();
    TURN_BUDGET.set(store, byAgent);
  }
  let budget = byAgent.get(agentId);
  if (budget === undefined) {
    budget = { records: 0, tokens: 0 };
    byAgent.set(agentId, budget);
  }
  return budget;
}

/** §5.2 — `turn_start` refills the per-turn K/B budget. Never throws. */
export function resetTurnBudget(store: RoomStore, agentId: string): void {
  TURN_BUDGET.get(store)?.delete(agentId);
}

/** §5.2 — the one summary line the push cap and `read` both append for the unshown remainder. */
export function moreLine(dropped: number, mentions: number, since: number): string {
  const mentionNote = mentions > 0 ? ` (${mentions} mention you)` : "";
  return `+${dropped} more room messages${mentionNote} — read with room{op:"read", since:${since}}`;
}

/**
 * §5.2 — oldest-first up to K records AND B tokens, then one summary line for the remainder.
 * `spend` charges this turn's ledger as it admits, so a second pull in the same turn sees what is
 * left; the push path (already turn-scoped) leaves it unset. `limit` is `read`'s own bound and can
 * only narrow the result. The first record is always admitted (progress over a stall).
 *
 * `costOf` is the price of one record against B. The default charges the BODY alone; the tool
 * passes its renderer instead, because the budget must charge what the recipient is actually
 * shown — the rendered line carries seq, sender and topic as well as the body (`room.ts`
 * `recordLine`), so a huge topic was ~1 token and still injected in full.
 */
export function selectT1(
  store: RoomStore,
  viewer: MemberState,
  pending: readonly RoomRecord[],
  options: {
    spend?: boolean;
    limit?: number;
    caps?: Partial<Caps>;
    costOf?: (record: RoomRecord) => number;
  } = {},
): { injected: RoomRecord[]; summaryLine: string | null } {
  const caps = { ...DEFAULT_CAPS, ...options.caps };
  const costOf = options.costOf ?? ((record: RoomRecord) => estimateTokens(roomBodyOf(record)));
  const budget = options.spend === true ? budgetFor(store, viewer.agentId) : undefined;
  const maxRecords = Math.min(
    caps.maxT1PerTurn - (budget?.records ?? 0),
    options.limit ?? Number.POSITIVE_INFINITY,
  );
  const maxTokens = caps.maxT1Tokens - (budget?.tokens ?? 0);
  const injected: RoomRecord[] = [];
  let tokens = 0;
  if (maxRecords > 0) {
    for (const record of pending) {
      const cost = costOf(record);
      if (injected.length > 0) {
        if (injected.length >= maxRecords) break;
        if (tokens + cost > maxTokens) break;
      }
      injected.push(record);
      tokens += cost;
    }
  }
  if (budget !== undefined && injected.length > 0) {
    budget.records += injected.length;
    budget.tokens += tokens;
  }
  const dropped = pending.length - injected.length;
  if (dropped <= 0) return { injected, summaryLine: null };
  return {
    injected,
    summaryLine: moreLine(
      dropped,
      pending.filter((r) => r.kind === "msg" && r.mention?.includes(viewer.agentId)).length,
      store.cursors.get(viewer.agentId) ?? 0,
    ),
  };
}

// --- T2 coalescing (N pending or T lag) -----------------------------------

/** §5.2 — one digest line once N T2 records are pending OR the oldest has lagged T; else null. */
export function coalescePending(
  store: RoomStore,
  viewer: MemberState,
  now: number,
  caps: Caps = DEFAULT_CAPS,
  // Pre-partitioned T2 slice (above the cursor, unmuted, log order): the delivery pass feeds its
  // single-pass bucket so the digest costs no second log scan. Membership must mirror the filter
  // below exactly — no given check here either.
  t2Above?: readonly RoomRecord[],
): string | null {
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const t2 =
    t2Above ??
    store.records.filter(
      (r) => r.seq > cursor && classify(r, viewer) === "T2" && !isMuted(store, viewer, r),
    );
  if (t2.length === 0) return null;
  const lagMs = now - t2[0]!.ts;
  if (t2.length < caps.coalesceCount && lagMs < caps.coalesceMs) return null;
  const topics = new Set<string>();
  for (const r of t2) if (r.kind === "msg" || r.kind === "note") topics.add(r.topic);
  // K22/S1 — topic names are room-authored and this line reaches the model on TWO paths (deliver's
  // `extra` and notice's content), only one of which escapes. Escape at production; safeRoomText is
  // idempotent so the notice path's blanket safe() is harmless, not corrupting.
  const where =
    topics.size > 0 ? ` in ${[...topics].slice(0, 3).map(safeRoomText).join(", ")}` : "";
  return `room ⟵ ${t2.length} new message(s)${where} — read with room{op:"read", since:${cursor}}`;
}

// --- mute -----------------------------------------------------------------

// §5.2 — a muted topic never wakes, never injects and never counts as unread, EXCEPT an explicit
// mention, which promotes to T0 and is therefore never muted. The sentinel "" mutes the whole room.
export function isMuted(_store: RoomStore, viewer: MemberState, record: RoomRecord): boolean {
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
    agentId,
    joinedAtSeq: store.seq,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  };
  store.members.set(agentId, fresh);
  return fresh;
}

// --- per-topic scan (one pass for board / topics / unread) ------------------
//
// `buildBoard`'s topic scan, the topics op and `unreadCounts` each walked the whole log. One
// forward pass serves all three: per topic, in first-seen order, the last seq plus the unread
// counts above the viewer's cursor. `unread` skips muted topics (the topics-op / unreadCounts
// basis); `unreadAll` counts everything above the cursor (the board basis, which is mute-blind).

export interface TopicScanRow {
  topic: string;
  lastSeq: number;
  unread: number;
  unreadAll: number;
}

export function scanTopics(store: RoomStore, viewer: MemberState): TopicScanRow[] {
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const byTopic = new Map<string, TopicScanRow>();
  const rows: TopicScanRow[] = [];
  for (const record of store.records) {
    if (record.kind !== "msg" && record.kind !== "note") continue;
    let row = byTopic.get(record.topic);
    if (!row) {
      row = { topic: record.topic, lastSeq: record.seq, unread: 0, unreadAll: 0 };
      byTopic.set(record.topic, row);
      rows.push(row);
    }
    row.lastSeq = record.seq;
    if (record.seq <= cursor) continue;
    row.unreadAll++;
    if (!isMuted(store, viewer, record)) row.unread++;
  }
  return rows;
}

// --- unread counts --------------------------------------------------------

/** §5.2 — per-topic unread above the viewer's cursor; a muted topic contributes zero. */
export function unreadCounts(store: RoomStore, viewer: MemberState): Map<string, number> {
  // One shared pass (scanTopics): rows with zero unread contribute no entry, exactly as the old
  // filter-then-count did.
  const counts = new Map<string, number>();
  for (const row of scanTopics(store, viewer)) {
    if (row.unread > 0) counts.set(row.topic, row.unread);
  }
  return counts;
}

// --- retention gap notice -------------------------------------------------

export function noteGap(
  store: RoomStore,
  skipped: number,
  reason: "retention" | "invalid" | "corrupt",
): RoomRecord {
  return store.append({ kind: "gap", from: "system", skipped, reason });
}

// --- oversized message (N7) -----------------------------------------------

/** §5.2 N7 — a message over B tokens is truncated to a head + a read handle; never lost from the log. */
export function truncateOversized(
  body: string,
  tokenBudget: number,
): { head: string; handle: string } {
  if (estimateTokens(body) <= tokenBudget) return { head: body, handle: "" };
  const headChars = Math.max(0, tokenBudget * 4);
  const head = `${body.slice(0, headChars)}…`;
  return { head, handle: '… truncated — read the full record with room{op:"read"}' };
}
