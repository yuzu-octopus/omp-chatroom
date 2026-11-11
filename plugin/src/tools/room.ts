import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { prompt } from "@oh-my-pi/pi-utils";
import { deliver, sendToTarget } from "../attention/delivery";
import {
  admitPost,
  coalescePending,
  isMuted,
  moreLine,
  muteRoom,
  muteTopic,
  scanTopics,
  selectT0,
  selectT1,
  truncateOversized,
  unmuteRoom,
  unmuteTopic,
} from "../attention/governor";
import { classify, type Tier } from "../attention/tiers";
import {
  describeRoomCall,
  describeRoomResult,
  renderRoomCall,
  renderRoomResult,
} from "../cards/tool-cards";
import { globalMap } from "../globals";
import { hostSchema } from "../host-schema";
import { buildDigest, DIGEST_CLAIMS_CAP, estimateTokens, ROSTER_CAP } from "../onboarding/digest";
import { safeRoomText } from "../onboarding/escape";
import { contended, grant, reclaimIfStale, release, renew, staleGen } from "../store/claims";
import { type RoomConfig, resolveRoomConfig } from "../store/config";
import {
  bumpCursor,
  cursorFor,
  deliveredT0s,
  initCursor,
  lagFor,
  markDeliveredT0,
} from "../store/cursors";
import { CLAIM_TTL_MAX_MS, CLAIM_TTL_MIN_MS } from "../store/log";
import { idemIndexKey, type MemberState, type RoomStore, roomStoreFor } from "../store/room-store";
import {
  type BoardResult,
  type Performative,
  type RoomRecord,
  STATUS_KEYS,
  type StatusObject,
  type TopicRow,
} from "../store/schema";
import {
  COVER_BUDGET_LINES,
  loadView,
  openTreeStore,
  RAW_MAX,
  validateZoomRange,
  zoom,
} from "../store/tree-store";
export const ROOM_TOOL_NAME = "room";
export const ROOM_DESCRIPTION: string = `Coordinate with the other agents in this session tree: a
shared claim board (who owns what), a bounded chat log, and blocking waits. Use it whenever several
agents could touch the same work, so nobody duplicates it — the board is the agreement, not a
filesystem lock.

Triggers: before editing a shared file or step check the board, then claim the resource; when you
find something other agents need, post it; when you finish, release your claims; when you have
nothing to do but wait for a peer, a message, or a claim, block on the wait tools instead of polling.

First call is join: it registers you and mints your cursor; board/read before join see empty state.

NOT for private redirection — use agent://<id> when exactly one agent is the recipient and no shared
record is wanted. When NOT to use: do not claim one-step or strictly-sequential work; do not post
bulk output (artifact + id instead).

Ops: join (first call) · read (records since your cursor) · post (send to a topic; mention is T0
wake+steer, so use it only when you really need to interrupt) · claim/release (exclusive ownership of
"<topic>/<key>", lease default 5 min; claiming a resource you already hold renews it) · board
(claims + roster + lag) · topics · mute/unmute · tree/zoom (cold summary over older records) ·
recall (regex over the raw log).`;
export const ROOM_LOAD_MODE = "essential"; // RISK R3

// §4.1 — all 12 ops: join/read/post/claim/release/board/topics/mute/unmute/tree/zoom/recall
export type RoomOp =
  | "join"
  | "read"
  | "post"
  | "claim"
  | "release"
  | "board"
  | "topics"
  | "mute"
  | "unmute"
  | "tree"
  | "zoom"
  | "recall";

// K13 — the params type is explicit so `params.op` is not `unknown`; never annotate the tool object
// with a bare `ToolDefinition` (that erases TParams).
export interface RoomParams {
  op: RoomOp;
  topic?: string;
  body?: string;
  mention?: string[];
  replyTo?: string;
  performative?: Performative;
  idemKey?: string;
  key?: string;
  /** R1 — the fencing token: the generation of the grant this call belongs to. */
  gen?: number;
  /** R6 — the topic's status ledger, as it arrives on the wire; checked on write. */
  status?: Record<string, { reason: string; answer: string }>;
  /** R3 — the resources that must be free before this claim can start. */
  dependsOn?: string[];
  ttl?: number;
  since?: number;
  limit?: number;
  lo?: number;
  hi?: number;
  pattern?: string;
}

// K1 — the `details` payload. `ok` is always present; `outcome` only on the wait tools.
export type RoomToolDetails =
  | { ok: true; op: "join"; digest: string; cursor: number }
  | { ok: true; op: "read"; records: RoomRecord[]; cursor: number; more: boolean }
  | {
      ok: true;
      op: "post";
      id: string;
      seq: number;
      tier: Tier;
      /** R7 — this post was a retry: the original record was returned, nothing was appended. */
      idempotent?: boolean;
      deliveryError?: string;
    }
  | {
      ok: true;
      op: "claim";
      holder: string;
      expiresAt: number;
      /** R1 — the generation of this grant; pass it back to fence a later write. */
      gen?: number;
      deliveryError?: string;
    }
  | { ok: true; op: "release"; deliveryError?: string }
  | { ok: true; op: "board"; board: BoardResult }
  | { ok: true; op: "topics"; topics: TopicRow[] }
  | { ok: true; op: "mute" }
  | { ok: true; op: "unmute" }
  | {
      ok: true;
      op: "tree";
      blocks: Array<{ lo: number; hi: number; size: number; raw: boolean; summary?: string }>;
    }
  | {
      ok: true;
      op: "zoom";
      children: Array<{ lo: number; hi: number; size: number; raw: boolean; text: string }>;
    }
  | {
      ok: true;
      op: "recall";
      matches: Array<{ seq: number; record: RoomRecord }>;
      recallMiss?: true;
      logSize?: number;
    }
  | { ok: false; error: string; holder?: string; expiresAt?: number }; // "not holder" carries the expiry

// K1 — the uniform tool result. `content` is ALWAYS present (the host coerces a result without a
// `content` array to `isError:true` + "Tool returned an invalid result: missing content array.").
export type RoomToolResult = AgentToolResult<RoomToolDetails>;

export const READ_LIMIT_DEFAULT = 50; // K20 — was 100; routed through the T1 budget
export const READ_LIMIT_MAX = 200; // K20 — was 1 000 (~97k tokens)
export const RECALL_LIMIT_MAX = 100; // §4.1

/** S1 — the longest pattern the op will compile (documented in the schema). */
const RECALL_PATTERN_MAX = 200;
/** S1 — the scan's wall-clock budget, checked BEFORE and AFTER every test. */
const RECALL_SCAN_MS = 1_000;
/**
 * S1 — the most text any ONE `regex.test` sees. `recordLine` embeds a body up to `maxBodyBytes`
 * (8192) verbatim, and the plugin is in-process, so one test over a whole line freezes the TUI and
 * every agent: measured on Bun 1.4.4, `(a|aa)+x` over `"a".repeat(8000)` costs 2 222 ms. 512 chars
 * shrinks the per-test input 16× and keeps an allowed super-linear pattern cheap (measured:
 * `.*a.*z` costs 163 ms here, 671 ms at 768 chars, 1 340 ms at 1024).
 *
 * THE BOUND, BY DESIGN: a recall call costs at most RECALL_SCAN_MS plus ONE test, and that test
 * sees at most RECALL_TEXT_MAX chars — a function of these two constants, not of the log or of a
 * body an untrusted peer chose. (The engine has no regex timeout, so one test cannot be cut short;
 * that is why the filter below refuses the families that make a test explode at ANY length.)
 */
const RECALL_TEXT_MAX = 512;
/** S1 — how many unrestricted wildcards a pattern may carry; each adds a factor of the line. */
const RECALL_WILDCARD_MAX = 2;

/**
 * S1 — the shapes that make backtracking super-linear, refused before the pattern is compiled.
 * A cheap CONSERVATIVE filter, not a proof: a false positive costs a rewrite, a false negative
 * costs a freeze, so it errs toward refusing. Quantifier tokens are `+`, `*`, `?` and
 * `{n,}`/`{n,m}`; an exact `{n}` is bounded, so it is not one.
 */
const RECALL_UNSAFE: ReadonlyArray<{ shape: RegExp; why: string }> = [
  {
    // (a+)+ (a*)* (a?)+ (.*)* — a repeat of a group that itself repeats. This is the shape the
    // old guard caught; `?` is a quantifier too and the group may repeat it. The optional
    // `(?…` prefix keeps a non-capturing group's own `?` out of the inner-quantifier match, so
    // a harmless `(?:abc)+` is not refused.
    shape:
      /\((?:\?(?:[:=!]|<[^>]*>))?(?!\?)(?:\\.|[^()\\])*(?:[+*?]|\{\d+,\d*\})(?:\\.|[^()\\])*\)\s*(?:[+*]|\{\d+,\d*\})/,
    why: "a repeated group contains another quantifier",
  },
  {
    // (a|aa)+ — the measured input; any alternation under a repeat multiplies the branches.
    shape: /\((?:\\.|[^()\\])*\|(?:\\.|[^()\\])*\)\s*(?:[+*]|\{\d+,\d*\})/,
    why: "a repeated group contains alternation",
  },
  {
    // \1 / \k<name> — a backreference re-scans what it already matched.
    shape: /\\[1-9]|\\k<[^>]*>/,
    why: "a backreference re-scans what it matched",
  },
];

/** S1 — one unrestricted repetition of a multi-character atom: `.*`, `\s+`, `[a-z]*`, `.{2,}`. */
const RECALL_WILDCARD = /(?<!\\)(?:\.|\\[wWsSdD]|\[[^\]]*\])(?:[+*]|\{\d+,\d*\})/g;

/** S1 — the refusal sentence, or null when the pattern may be compiled and run. */
function recallRefusal(pattern: string): string | null {
  for (const { shape, why } of RECALL_UNSAFE) {
    if (shape.test(pattern)) {
      return (
        `pattern refused — catastrophic backtracking risk: ${why}. Allowed: literals, character ` +
        `classes, and repetition of a single character; flatten a repeated group into a class ` +
        `([ab]* instead of (a|b)*) or search one alternative at a time.`
      );
    }
  }
  if ((pattern.match(RECALL_WILDCARD) ?? []).length > RECALL_WILDCARD_MAX) {
    return (
      `pattern refused — catastrophic backtracking risk: more than ${RECALL_WILDCARD_MAX} ` +
      `unrestricted wildcards (every .* / \\s+ / [class]* multiplies the backtracking by the line ` +
      `length). Anchor them, or search a narrower literal.`
    );
  }
  return null;
}

const _READ_CURSOR_LAG_MAX = 1_000;

/**
 * S3 — the persisted model-supplied fields, capped at the WRITE boundary. Only `body` was bounded
 * (config.maxBodyBytes); the rest are appended to the JSONL verbatim and land in every recipient's
 * read content and digest, and the per-turn budget is a TOKEN budget, so a 40 KB topic used to cost
 * ~1 token and still be injected in full. Bytes, not chars: the log is bytes and the budget is a
 * byte estimate. A refusal names the field and the cap, so the agent shortens the right thing.
 */
export const TOPIC_MAX_BYTES = 512;
export const KEY_MAX_BYTES = 512;
export const IDEM_KEY_MAX_BYTES = 256;
export const MENTION_ID_MAX_BYTES = 128;
export const STATUS_FIELD_MAX_BYTES = 512;
/** A dependency is persisted as "<topic>/<key>", so it can never outgrow the two halves. */
export const DEPENDS_ON_MAX_BYTES = TOPIC_MAX_BYTES + 1 + KEY_MAX_BYTES;

/** S3 — null when the value fits; else a sentence naming the field and the cap it broke. */
function overCap(field: string, value: string, max: number): string | null {
  const bytes = Buffer.byteLength(value, "utf-8");
  return bytes > max ? `${field} exceeds its ${max}-byte cap (got ${bytes} bytes)` : null;
}

/**
 * S3 — a persisted string list (mention, dependsOn): every entry capped, and the list itself no
 * longer than the roster — a list longer than the agents that exist names nobody.
 * The entries are untrusted at this boundary, so a non-string is refused rather than coerced.
 */
function overListCap(field: string, values: readonly unknown[], idMax: number): string | null {
  if (values.length > ROSTER_CAP) {
    return `${field} names ${values.length} entries; the cap is ${ROSTER_CAP} (the roster cap)`;
  }
  for (const value of values) {
    if (typeof value !== "string") return `${field} entries must be strings`;
    const error = overCap(`${field} entry`, value, idMax);
    if (error !== null) return error;
  }
  return null;
}

/** K22/S1 — every room-authored string that reaches the model goes through the shared escaper. */
const safe = safeRoomText;

function ok<T extends RoomToolDetails>(details: T, text: string): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details };
}

/** Failures return `content` + `details:{ok:false}` and never throw (§4.5). */
function fail(error: string, holder?: string, expiresAt?: number): RoomToolResult {
  // The error text embeds caller-chosen values (the resource, the holder), so it is escaped like
  // every other model-facing string. `details` keeps the raw values for the caller.
  const line = holder ? `room → ${safe(error)} (held by ${safe(holder)})` : `room → ${safe(error)}`;
  return {
    content: [{ type: "text", text: line }],
    details: holder !== undefined ? { ok: false, error, holder, expiresAt } : { ok: false, error },
  };
}

export function viewerFor(store: RoomStore, agentId: string): MemberState {
  const existing = store.members.get(agentId);
  if (existing) return existing;
  const fresh = freshViewer(store, agentId);
  store.members.set(agentId, fresh);
  return fresh;
}

/** The fresh-member shape, shared by the ensure and lookup paths. */
function freshViewer(store: RoomStore, agentId: string): MemberState {
  return {
    agentId,
    joinedAtSeq: store.seq,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  };
}

/**
 * Read-only viewer state for classification; never mints membership. Use this on every path that
 * only READS the viewer (read/board/topics delivery classification). Use `viewerFor` only where
 * the mutation must persist (join/claim/post, wait_for_claim's waitedResource).
 */
export function viewerStateFor(store: RoomStore, agentId: string): MemberState {
  return store.members.get(agentId) ?? freshViewer(store, agentId);
}

/** One model-facing line per record — tier-free by format (no badge field); tiering lives in `classify`/`renderLine`. §4.5.1 K17. */
function recordLine(record: RoomRecord): string {
  const head = `seq ${record.seq} · ${safe(record.from)}`;
  switch (record.kind) {
    case "msg":
      return `${head} · ${safe(record.topic)} · "${safe(record.body)}"`;
    case "note":
      return `${head} · note ${safe(record.topic)} · "${safe(record.body)}"`;
    case "claim":
      return `${head} · claim ${safe(record.resource)} (ttl ${record.ttlMs} ms)`;
    case "release":
      return `${head} · release ${safe(record.resource)} · ${record.reason} · prev ${safe(record.prevHolder)}`;
    case "member":
      return `${head} · ${record.action}`;
    case "gap":
      return `${head} · gap · ${record.skipped} skipped (${record.reason})`;
    case "contended":
      return `${head} · contended ${safe(record.resource)} — lost to ${safe(record.holder)}`;
    case "wait":
      return `${head} · wait ${safe(record.target)} — ${record.outcome}`;
    case "delivered":
      return `${head} · delivered seq ${record.deliveredSeq} — ${record.tier}`;
  }
}

/**
 * The board as MODEL-FACING lines. `details.board` never reaches the model — `coerceToolResult`
 * (pi-agent-core `agent-loop.ts:540`) keeps only `content` on the wire, so a counts-only content
 * line makes "who holds this resource" unanswerable. Capped like the join digest (§5.4) so a large
 * roster cannot blow the reply.
 */
function boardLines(board: BoardResult): string[] {
  const lines: string[] = [];
  const claims = board.claims.slice(0, DIGEST_CLAIMS_CAP);
  for (const claim of claims) {
    const left = Math.max(0, Math.round((claim.expiresAt - Date.now()) / 1000));
    // R9 — who is blocked on what: the waiters, and what this claim itself waits on.
    const waiting =
      claim.waiting.length > 0 ? ` · waiting: ${claim.waiting.map(safe).join(", ")}` : "";
    const depends =
      claim.dependsOn.length > 0 ? ` · needs ${claim.dependsOn.map(safe).join(", ")}` : "";
    lines.push(
      `claim ${safe(claim.resource)} · ${safe(claim.holder)} · ${left}s left${waiting}${depends}`,
    );
  }
  if (board.claims.length > claims.length)
    lines.push(`… +${board.claims.length - claims.length} more claim(s)`);

  const roster = board.roster.slice(0, ROSTER_CAP);
  for (const member of roster) {
    const topics = member.topics.length > 0 ? ` · ${member.topics.map(safe).join(", ")}` : "";
    lines.push(`${safe(member.agentId)} · ${member.status} · lag ${member.lag}${topics}`);
  }
  if (board.roster.length > roster.length)
    lines.push(`… +${board.roster.length - roster.length} more member(s)`);

  for (const topic of board.topics) {
    lines.push(`topic ${safe(topic.topic)} · ${topic.unread} unread · last seq ${topic.lastSeq}`);
  }
  return lines;
}

/** Append rendered rows to a content line. `read` already renders; the count-only ops did not. */
function withRows(line: string, rows: readonly string[], more?: string): string {
  if (rows.length === 0) return line;
  return [line, ...rows, ...(more !== undefined ? [more] : [])].join("\n");
}

function buildBoard(store: RoomStore, viewer: MemberState): BoardResult {
  const claims = [...store.claims.values()].map((claim) => ({
    resource: claim.resource,
    holder: claim.holder,
    ttlMs: claim.ttlMs,
    expiresAt: claim.acquiredAt + claim.ttlMs,
    acquiredAt: claim.acquiredAt,
    // R9 — who is blocked on what: the agent ids waiting for this resource, and the resources
    // this claim itself waits on.
    waiting: contended(store, claim.resource),
    dependsOn: claim.dependsOn ?? [],
  }));
  const roster = [...store.members.values()].map((member) => ({
    agentId: member.agentId,
    // Absent from the registry ≠ running: after a restart the roster replays from the log while
    // the registry starts empty, so every member would read "running". "unknown" matches the
    // /room board path (room-command.ts) and tells the truth.
    status: AgentRegistry.global().get(member.agentId)?.status ?? "unknown",
    cursor: cursorFor(store, member.agentId),
    lag: lagFor(store, member.agentId),
    topics: [...member.topics],
  }));
  // The board's topic rows share the single-pass scan (scanTopics): the board basis is
  // mute-blind, so it reads `unreadAll`. Shape, order and caps are unchanged.
  const topics: TopicRow[] = scanTopics(store, viewer).map((row) => ({
    topic: row.topic,
    lastSeq: row.lastSeq,
    unread: row.unreadAll,
  }));
  return { ok: true, claims, roster, topics, deliveries: { ...store.deliveries } };
}

/** The schema's documented bounds are the contract; this is the one place they are applied. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

// --- §5.3 the post-append delivery pass -----------------------------------

/**
 * The agents considered for a record: the room roster plus every live registry ref, minus the
 * acting agent (self-authored records never echo back), advisor transcripts (observability-only,
 * never messageable) and aborted refs. Parked refs stay in the set — `deliver` skips them.
 */
function recipients(store: RoomStore, actorId: string): string[] {
  const ids = new Set<string>(store.members.keys());
  for (const ref of AgentRegistry.global().list()) {
    if (ref.kind === "advisor" || ref.status === "aborted") continue;
    ids.add(ref.id);
  }
  ids.delete(actorId);
  return [...ids];
}

/**
 * A board-delta card, the same shell `deliver` uses, for the T0 batch and the T2 digest.
 *
 * Returns whether the line was ISSUED: `false` means the target has no session and is not the
 * caller, so nothing went out — the T0-batch marking depends on it (a batch nobody was told
 * about must stay selectable).
 */
async function notice(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: string,
  content: string,
  deliverAs: "steer" | "aside",
): Promise<boolean> {
  // K22/S1 — the digest line carries room-authored topic names; escape before it reaches the model.
  const payload = { customType: "room:board-delta", content: safe(content), display: true };
  const session = AgentRegistry.global().get(target)?.session;
  if (session) {
    // Awaited: the callers already `await notice(...)`, and a floating send would escape
    // notifyRecipients' per-recipient try/catch as an unhandled rejection. A throw here lands
    // in the caller's `failure` note and surfaces as deliveryError, like deliver() failures.
    //
    // Bounded: the host's send resolves when the TARGET'S TURN ends, so an unbounded await would
    // deadlock the room (A's pass waits for B's turn, B's turn posts and waits for A's pass).
    const outcome = await sendToTarget(ctx, session, target, {
      from: ctx.agent.id,
      content: typeof payload.content === "string" ? payload.content : safe(content),
      payload,
      options: { deliverAs },
    });
    if (!outcome.ok) throw outcome.error;
    return true;
  }
  if (target === ctx.agent.id) {
    pi.sendMessage(payload, { deliverAs });
    return true;
  }
  return false; // no session and not the caller: nothing was issued
}

/**
 * §5.3 — deliver each just-appended record to every relevant recipient. Runs AFTER the synchronous
 * append (I1/I5): the log is already durable, so a delivery failure can only be reported, never
 * corrupt the record or throw out of `execute`. Returns the first failure message, if any.
 *
 * Exported for the `/room` command path (room-command.ts), the second caller: the command handler
 * has no `deliveryError` envelope, so this function must stay throw-free — a throw would surface
 * as an unhandled rejection in the TUI. T0 is never dropped, but its pending set is ceiling-batched
 * by `selectT0` (N5) — past the ceiling ONE digest interrupt carries the count, and the records stay
 * above the recipient's cursor (recorded as given, so the next pass injects only newer ones). T2 is
 * cursor-only, except that its pending set is digested by `coalescePending` (N/T) onto the next
 * T0/T1 delivery for that recipient. A post past the producer's srTCM burst is coalesced for the
 * digest — the record is already durable and its recipients' cursors stay put.
 */
export async function notifyRecipients(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: RoomStore,
  records: readonly RoomRecord[],
  actorId: string,
): Promise<string | undefined> {
  // Serialised per room root (I2: the chain lives in a globalThis map, keyed by root). Two agents
  // posting in the same tick would otherwise interleave their awaits, so a recipient could see
  // seq 11 before seq 10 — and if 10's send failed, 10 would fall below the cursor for good.
  const previous = DELIVERY_CHAIN.get(store.root) ?? Promise.resolve();
  const pass = previous.then(
    () => deliverPass(pi, ctx, store, records, actorId),
    () => deliverPass(pi, ctx, store, records, actorId),
  );
  DELIVERY_CHAIN.set(
    store.root,
    pass.then(
      () => undefined,
      () => undefined,
    ),
  );
  return pass;
}

/** The delivery chain, one per room root. */
const DELIVERY_CHAIN = globalMap<string, Promise<void>>("__roomDeliveryChain");

async function deliverPass(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: RoomStore,
  records: readonly RoomRecord[],
  actorId: string,
): Promise<string | undefined> {
  const config = resolveRoomConfig(pi, store.root);
  let failure: string | undefined;
  try {
    // §5.2 — the producer's bucket, consumed once per appended post (claim/release are not posts).
    const coalesced =
      records.some((r) => r.kind === "msg") &&
      admitPost(store, actorId, Date.now(), config) === "red";
    // The recipients are INDEPENDENT of each other: each one gets its own records, in seq order,
    // inside its own task, so a slow (or busy) recipient must not hold up the others. The
    // per-root serialisation of PASSES (the DELIVERY_CHAIN) is untouched, and the per-recipient
    // order is preserved inside each task. The store's cursor map is mutated synchronously, so
    // the concurrent tasks never race on shared state.
    const targets = recipients(store, actorId);
    const errors = await Promise.all(
      targets.map((target) => deliverToTarget(pi, ctx, store, records, target, coalesced, config)),
    );
    // The failures are reported in RECIPIENT ORDER, so the reported one does not depend on which
    // transport lost the race.
    for (const message of errors) {
      if (message === undefined) continue;
      failure ??= message;
    }
  } catch (error) {
    failure ??= error instanceof Error ? error.message : "delivery failed";
  }
  return failure;
}

/**
 * Deliver this pass's records to ONE recipient. Returns the failure MESSAGE instead of throwing
 * it: the pass reports the first failure in recipient order and never lets one recipient's
 * transport decide the outcome for the others.
 */
async function deliverToTarget(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: RoomStore,
  records: readonly RoomRecord[],
  target: string,
  coalesced: boolean,
  config: RoomConfig,
): Promise<string | undefined> {
  try {
    const viewer = viewerStateFor(store, target);
    const cursor = store.cursors.get(target) ?? 0;
    // A seq this recipient has already been GIVEN is not pending: while an older record is still
    // owed the cursor cannot advance past it, so it would sit above the cursor forever and every
    // later pass would re-send it — a wake+steer storm for a T0, and for an uncertain T1 a K/B
    // window slot spent on a record the target already has (until `selectT1` admits nothing new).
    // The same registry keeps a given seq out of the owed floor below.
    const given = deliveredT0s(store.root, target);
    // Single-pass bucketing: ONE forward pass over the log above the cursor computes
    // `tier` + `muted` ONCE per record and partitions into the buckets below. The buckets hold
    // the same refs in the same log order the stacked filters produced, so every admitted set,
    // summary line and cursor cap is identical — with one scan instead of six. A new tier or
    // mute rule must update the partition arms here (maintenance note).
    // The recipient's whole pending set, minus muted, cursor-only T2, and given: exactly what a
    // push may show. T0 is exempt from K/B; T1 is admitted oldest-first by `selectT1`.
    const t0Pending: RoomRecord[] = [];
    const t1Pending: RoomRecord[] = [];
    const gapPending: RoomRecord[] = [];
    // The T2 slice above the cursor (muted out, GIVEN kept): `coalescePending`'s own filter has
    // no given check, so this must not either — it is fed in pre-partitioned below.
    const t2Above: RoomRecord[] = [];
    // classify/isMuted per seq for this pass's batch lookups below (the T1-admit loop, the
    // deliver loop and the T2 tail all re-asked for the same records).
    const classBySeq = new Map<number, { tier: Tier; muted: boolean }>();
    for (const r of store.records) {
      if (r.seq <= cursor) continue;
      const muted = isMuted(store, viewer, r);
      const tier = classify(r, viewer);
      classBySeq.set(r.seq, { tier, muted });
      if (muted) continue;
      if (tier === "T2") {
        t2Above.push(r);
        continue;
      }
      if (given.has(r.seq)) continue;
      if (r.kind === "gap") gapPending.push(r);
      else if (tier === "T0") t0Pending.push(r);
      else t1Pending.push(r);
    }
    // A batch record missing from the map (not in the log above the cursor) is classified live —
    // the same predicates the stacked filters applied.
    const classOf = (record: RoomRecord): { tier: Tier; muted: boolean } =>
      classBySeq.get(record.seq) ?? {
        tier: classify(record, viewer),
        muted: isMuted(store, viewer, record),
      };
    // N5 — past its ceiling the T0 set batches into ONE digest interrupt, never dropped.
    const t0 = selectT0(t0Pending);
    const admitted = [...t0.injected];
    // The T1 window is computed ONCE for this target: the admitted set cannot change within the
    // pass (the per-turn budget is not spent here), and the selection's SUMMARY LINE is what a
    // starved recipient needs — it says how many records the window refused and how to read them.
    //
    // Without it the push channel starves silently: the window admits the OLDEST pending T1s, so
    // a recipient whose backlog exceeds the window never has its own (newer) record admitted, the
    // cursor never moves, and the backlog grows — forever. The data stays readable, but the push
    // is dead and the recipient was never told. The hint is the difference between a starved agent
    // and a deaf one.
    // t1Pending is the bucket from the single pass above (T1, non-gap, unmuted, above the
    // cursor, never given) — the same membership the old re-filter computed.
    // S3 — same cost basis as `read`: the recipient is shown the rendered line, so the budget
    // charges that line, not the body `roomBodyOf` alone would price.
    const t1 = selectT1(store, viewer, t1Pending, {
      caps: config,
      costOf: (record) => estimateTokens(recordLine(record)),
    });
    for (const record of records) {
      const cls = classOf(record);
      if (cls.muted) continue;
      if (cls.tier !== "T1") continue;
      if (!coalesced && t1.injected.some((r) => r.seq === record.seq)) admitted.push(record);
    }
    // A `gap` record is a promised notify (T1 for every viewer) that the retention prune
    // appends OUTSIDE any op's batch — so it is never in `records`, and no delivery pass would
    // ever carry it. Left in the pending set it counts as owed and pins the cursor floor below
    // its seq for good: the cursor freezes and EVERY pass re-delivers the T0s above it (an
    // interrupt storm). So the gap is CARRIED here, on the T1 path, and it is exempt from the
    // K/B cap (like T0): the one notice that says "the log lost records" must never be starved
    // by a busy turn.
    // `owedOthers` was the non-gap pending set minus admitted; only its MINIMUM is used (the
    // floor below the oldest still-owed record), computed here from the non-gap buckets.
    const admittedSeqs = new Set<number>(admitted.map((a) => a.seq));
    let owedFloorOthers = Number.POSITIVE_INFINITY;
    for (const bucket of [t0Pending, t1Pending] as const) {
      for (const r of bucket) {
        if (!admittedSeqs.has(r.seq) && r.seq < owedFloorOthers) owedFloorOthers = r.seq;
      }
    }
    // The gap may only be carried when nothing the recipient still OWES sits BELOW it: telling
    // the gap moves the cursor to its seq, and that must not cross an owed record — otherwise
    // `room{op:"read"}` (which starts at the cursor) could never return it. While a gap waits
    // behind a refusal it stays owed, but it never lowers the floor: the refusal below it
    // already sets a lower one.
    const batchSeqs = new Set<number>(records.map((r) => r.seq));
    const gaps = gapPending.filter((r) => !batchSeqs.has(r.seq) && r.seq < owedFloorOthers);
    // Last in the batch: the T0/T1 deliveries go first, so a failed one aborts the pass before
    // the gap is told (the gap is retried on the next pass) and the gap's cursor bump never
    // crosses a record whose delivery just failed.
    admitted.push(...gaps);
    // The floor for this target: the seq just below the oldest record it still OWES (a T1 the
    // K/B cap refused, or a T0 past the batch ceiling). NO cursor bump may cross it — not the
    // T0/T1 bump and not the T2 bump — or the owed record falls below the cursor and
    // `room{op:"read"}` (which starts at the cursor) can never return it. `bumpCursor` is
    // monotonic, so a later capped bump cannot pull the cursor back either. A CARRIED gap is
    // not owed (it was told), so it never pins the floor; an uncarried one stays owed but never
    // lowers the floor the refusal below it already sets. Already-GIVEN seqs were filtered out
    // of `pending` above, so they never pin the floor — but the T0 batch `selectT0` is about to
    // collapse still counts as owed until its summary is ISSUED (below), so nothing bumps the
    // cursor past records the recipient has not been told about yet.
    for (const g of gaps) admittedSeqs.add(g.seq);
    // `owed` was the pending set minus admitted; only its MINIMUM is used. A carried gap was
    // told, so it never pins the floor — which is exactly what removing it from the owed set
    // means here.
    let owedFloor = Number.POSITIVE_INFINITY;
    for (const bucket of [t0Pending, t1Pending, gapPending] as const) {
      for (const r of bucket) {
        if (!admittedSeqs.has(r.seq) && r.seq < owedFloor) owedFloor = r.seq;
      }
    }
    const cursorCap = owedFloor - 1;
    // N/T — the T2 backlog rides the next T0/T1 for this recipient as ONE line. The T2 slice is
    // fed in pre-partitioned (no second log scan); its membership mirrors coalescePending's own
    // filter exactly.
    const digest =
      admitted.length > 0 || t0.summaryLine !== null
        ? coalescePending(store, viewer, Date.now(), config, t2Above)
        : null;
    let extra = digest !== null ? [digest] : [];
    for (const record of admitted) {
      await deliver(pi, ctx, target, record, classOf(record).tier, extra, cursorCap);
      extra = [];
    }
    if (t0.summaryLine !== null) {
      const issued = await notice(pi, ctx, target, t0.summaryLine, "steer");
      // Only an ISSUED summary may mark the batch GIVEN: ONE line went out in place of the
      // records, sending the recipient to `room{op:"read"}`. Recording them is what makes the
      // ceiling hold on the next pass — without it that pass would inject all 50+ individually
      // (the ceiling undone by the pass that was supposed to enforce it). They stay above the
      // cursor (nothing bumped it past them: the floor below still counted them), so `read` still
      // returns them, which is exactly what the summary promised. A target with no session got
      // nothing, so its batch is NOT marked: it is re-selected (and re-summarised) on revival.
      if (issued) {
        for (const record of t0Pending) markDeliveredT0(store.root, target, record.seq);
      }
    } else if (extra.length > 0) {
      await notice(pi, ctx, target, extra.join("\n"), "aside");
    }
    // The T1 overflow hint (the window refused records this recipient still owes). It goes out
    // even when nothing was admitted — that is exactly the case where the recipient would
    // otherwise never learn that it is behind.
    if (t1.summaryLine !== null) {
      await notice(pi, ctx, target, t1.summaryLine, "aside");
    }
    // A red (coalesced) producer's records are left pending for the digest: the log is already
    // durable and the cursor must NOT advance, or `coalescePending` could never see them.
    // A non-coalesced T2 is cursor-only — never injected, and consumed on arrival.
    if (coalesced) return undefined;
    for (const record of records) {
      if (classOf(record).tier === "T2") {
        await deliver(pi, ctx, target, record, "T2", [], cursorCap);
      }
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "delivery failed";
  }
}

/**
 * The seq just below the oldest record this recipient still OWES — the floor no cursor bump may
 * cross. `null` when it owes nothing.
 *
 * Shared with the sweep's expiry notice (plugin/src/onboarding/hook.ts), which delivers OUTSIDE a
 * delivery pass: the notice is a T0 at the room head, and an uncapped bump would carry the
 * holder's cursor over every record it had not read yet — those records would fall below the
 * cursor and `room{op:"read"}` could never return them.
 *
 * `exceptSeq` excludes the record being delivered (the notice's own release record).
 */
export function owedFloorFor(
  store: RoomStore,
  target: string,
  exceptSeq?: number,
  options: { gapsOwed?: boolean } = {},
): number | null {
  const viewer = viewerStateFor(store, target);
  const cursor = store.cursors.get(target) ?? 0;
  // A GIVEN seq owes nothing: it was handed to the recipient (a delivered T0, an uncertain send
  // whose bound expired, a T0 batched into the ceiling summary) and only a floor kept it above
  // the cursor. Left in the owed set it pins the cap at its seq-1 for EVERY later delivery, so
  // the cursor freezes and the T1 window fills with already-sent records — the record is still
  // readable (nothing bumped the cursor past it) and a later confirmed delivery may carry the
  // cursor over it, which is honest: it was given.
  const given = deliveredT0s(store.root, target);
  const owed = store.records.filter(
    (r) =>
      r.seq > cursor &&
      r.seq !== exceptSeq &&
      !given.has(r.seq) &&
      // A `gap` is CARRIED by the next pass, not owed (see `deliverToTarget`) — unless the caller
      // is NOT a delivery pass. The sweep's expiry notice is not one: nothing carries the gap, so
      // a cursor bump past it would lose the notice that records were skipped.
      (r.kind !== "gap" || options.gapsOwed === true) &&
      !isMuted(store, viewer, r) &&
      classify(r, viewer) !== "T2",
  );
  if (owed.length === 0) return null;
  return owed.reduce((min, r) => Math.min(min, r.seq), Number.POSITIVE_INFINITY);
}

/** The records an operation appended: everything with a seq above the pre-op watermark. */
export function appendedSince(store: RoomStore, before: number): RoomRecord[] {
  return store.records.filter((r) => r.seq > before);
}

/** K1 — an ok result carrying the optional delivery-failure note. */
function okWithDelivery<T extends RoomToolDetails>(
  details: T,
  text: string,
  failure?: string,
): AgentToolResult<T> {
  return ok(failure === undefined ? details : { ...details, deliveryError: failure }, text);
}

export function registerRoomTool(pi: ExtensionAPI): void {
  // §2.1.1
  const z = pi.zod;
  // Every param carries its units, its default, and which ops read it. Once an agent has loaded the
  // tool these strings are the per-param half of the contract it sees (the tool-level `description`
  // rides alongside on every normal request — pi-agent-core/src/agent-loop.ts:1028-1054 normalizeTools;
  // pruned only under opt-in `pruneToolDescriptions` — pi-ai/src/utils/schema/wire.ts:645-675): a bare
  // `ttl?: number` tells it nothing about milliseconds, and `lo`/`hi` without a block-range note is
  // opaque. This was the gap — the room tool, the primary
  // one, shipped with no param descriptions at all while all three wait tools had them.
  const params = z.object({
    op: z
      .enum([
        "join",
        "read",
        "post",
        "claim",
        "release",
        "board",
        "topics",
        "mute",
        "unmute",
        "tree",
        "zoom",
        "recall",
      ])
      .describe(
        "join · read · post · claim · release · board · topics · mute · unmute · tree · zoom · recall. " +
          "Join first; post needs topic+body; claim/release need topic+key; zoom needs lo+hi from tree; " +
          "recall needs pattern.",
      ),
    topic: z
      .string()
      .optional()
      .describe(
        'Topic name, e.g. "build". Used by post, mute and unmute. A claim rolls topic+key together. ' +
          "Max 512 bytes; longer is rejected, never truncated.",
      ),
    body: z
      .string()
      .optional()
      .describe(
        "Message text for post. Max 8192 bytes; longer is rejected, never truncated. Coordination " +
          "summary — leave bulk output in an artifact and reference it by id.",
      ),
    mention: z
      .array(z.string())
      .optional()
      .describe(
        "Agent ids to notify. A mention is delivered as T0 (wake + steer), so use it deliberately and " +
          "prefer a topic when the message can wait. Each id max 128 bytes; at most 32 ids.",
      ),
    replyTo: z
      .string()
      .optional()
      .describe("Message id this answers; makes the post a reply so the author gets a T0 nudge."),
    performative: z
      .enum(["inform", "request", "propose", "accept", "reject", "query", "failure"])
      .optional()
      .describe(
        "Speech act, carried through to cards: inform · request · propose · accept · reject · query · failure.",
      ),
    idemKey: z
      .string()
      .optional()
      .describe(
        "Retry key: a repeat of this post with the same key returns the first one instead of " +
          "posting twice. Use it when a post may be retried — a double post double-wakes every " +
          "mentioned agent. Max 256 bytes.",
      ),
    key: z
      .string()
      .optional()
      .describe(
        'Second half of a claim resource, e.g. "src/auth". The full resource is "<topic>/<key>". ' +
          'Same "<topic>/<key>" string wait_for_claim takes. Max 512 bytes.',
      ),
    status: z
      .object({
        is_request_satisfied: z.object({ reason: z.string(), answer: z.string() }),
        is_in_loop: z.object({ reason: z.string(), answer: z.string() }),
        is_progress_being_made: z.object({ reason: z.string(), answer: z.string() }),
        next_speaker: z.object({ reason: z.string(), answer: z.string() }),
        instruction_or_question: z.object({ reason: z.string(), answer: z.string() }),
      })
      .optional()
      .describe(
        "The topic's status ledger: five keys (is_request_satisfied, is_in_loop, " +
          "is_progress_being_made, next_speaker, instruction_or_question), each {reason, answer}. " +
          "Only the agent holding the topic's claim may write it. Every reason/answer max 512 bytes.",
      ),
    gen: z
      .number()
      .optional()
      .describe(
        "The fencing token: the generation of the grant this call belongs to. A claim whose " +
          "generation is stale - the resource was granted again since - is refused, and a post " +
          "into a topic you claim must carry that claim's current generation. " +
          "Optional; only post-into-claimed-topic and claim-after-displacement check it.",
      ),
    dependsOn: z
      .array(z.string())
      .optional()
      .describe(
        'Resources that must be free before this claim can start, as "<topic>/<key>". The claim ' +
          "is refused while one of them is held, and the refusal names the holder. Each entry max " +
          "1025 bytes; at most 32 entries.",
      ),
    ttl: z
      .number()
      .optional()
      .describe(
        "Lease in MILLISECONDS, default 300000 (5 min), clamped 1000…86400000. Only claim uses it.",
      ),
    since: z
      .number()
      .optional()
      .describe(
        "Resume read at this log seq number (not a timestamp). Defaults to your cursor; " +
          "read advances it — re-reading the same since re-delivers. Clamped to the log " +
          "(0…the highest seq): a value past the end reads nothing and cannot skip the future.",
      ),
    limit: z.number().optional().describe("Max records to return from read. 1…200, default 50."),
    lo: z
      .number()
      .optional()
      .describe(
        "First seq of the tree range for zoom, the same [lo, hi) pair the tree op printed. " +
          "hi-lo must be a power of two and lo aligned to it. Tree first, then zoom with its exact [lo,hi).",
      ),
    hi: z
      .number()
      .optional()
      .describe("Exclusive end of the zoom range, i.e. one past the last seq."),
    pattern: z
      .string()
      .optional()
      .describe(
        "Regex for recall over the raw log, newest first, max 100 matches. Max 200 chars; each " +
          "record is searched through its first 512 chars. Refused before running: a repeat of a " +
          "group that repeats or alternates ((a+)+, (a|aa)+), backreferences, and more than two " +
          "unrestricted wildcards (.*, \\s+, [class]*) — they backtrack catastrophically on the " +
          "host's thread. The scan also stops at its 1s budget; narrow the pattern and retry.",
      ),
  });

  pi.registerTool({
    name: ROOM_TOOL_NAME,
    label: "Room",
    description: prompt.render(ROOM_DESCRIPTION),
    parameters: hostSchema(params),
    loadMode: ROOM_LOAD_MODE,
    approval: "read",
    strict: true,
    renderCall: renderRoomCall,
    renderResult: renderRoomResult,
    describeCall: describeRoomCall,
    describeResult: describeRoomResult,
    async execute(
      _toolCallId,
      // 18.18.1 / Bun's checker: `Static<TParams>` collapses to `unknown` when the schema is the
      // runtime stub, so the param type is stated here rather than inferred through the host
      // generic; `RoomParams` is the same shape the zod schema validates.
      p: RoomParams,
      _signal,
      _onUpdate,
      ctx,
    ): Promise<RoomToolResult> {
      // U6 — a missing/unwritable/corrupt room file returns a normal result, never a throw.
      let store: RoomStore;
      try {
        store = roomStoreFor(ctx);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "room file corrupt");
      }
      const agentId = ctx.agent.id;
      const config = resolveRoomConfig(pi, store.root);
      try {
        switch (p.op) {
          case "join": {
            // §4.1 join idempotency — a second join is a no-op: no second member record.
            // The membership check MUST run BEFORE `viewerFor`, which registers a fresh member as a
            // side effect. Checking after it is always false, so no `member{join}` record would ever be
            // appended and the roster would stay empty forever.
            const isNewMember = !store.members.has(agentId);
            const viewer = viewerFor(store, agentId);
            if (isNewMember) {
              store.append({ kind: "member", from: agentId, action: "join" });
            }
            initCursor(store, agentId);
            const cursor = cursorFor(store, agentId);
            const digest = buildDigest(store, viewer, config.digestBudgetTokens);
            return ok(
              { ok: true, op: "join", digest, cursor },
              `room join → ${safe(store.roomId)} · ${store.claims.size} claim(s) · ${store.members.size} member(s) · cursor ${cursor}`,
            );
          }

          case "read": {
            const viewer = viewerStateFor(store, agentId);
            const cursor = cursorFor(store, agentId);
            // S2 — `since` is model-supplied and `bumpCursor` is monotonic (cursors.ts:25), so one
            // call with `since: 999999999` and nothing matching would push the cursor past every
            // future record: no T0/T1 push ever again, `lagFor` (cursors.ts:30) reports 0 so the
            // board says "caught up", and persistOwnCursor saves the poison into the session.
            // Clamp the resume point to the log itself ([0, store.seq]) so a bump can only land on
            // a seq the log has; a non-finite value (NaN) has no usable resume point and starts
            // from the beginning rather than propagating NaN through Math.min/Math.max.
            const requested = p.since ?? cursor;
            const since = Number.isFinite(requested)
              ? Math.min(Math.max(0, Math.trunc(requested)), store.seq)
              : 0;
            const limit = clamp(p.limit ?? READ_LIMIT_DEFAULT, 1, READ_LIMIT_MAX);
            const pending = store.records.filter((r) => r.seq > since);
            // K20 — `read` is routed through the same per-turn K/B budget as the injection path.
            // S3 — the budget charges the RENDERED line, not the body: the line also carries seq,
            // sender and topic, and `selectT1`'s default (`roomBodyOf`, delivery.ts:296) ignores
            // them, so a huge topic used to cost ~1 token and still be injected in full.
            const { injected } = selectT1(store, viewer, pending, {
              spend: true,
              limit,
              caps: config,
              costOf: (record) => estimateTokens(recordLine(record)),
            });
            const next = injected.length > 0 ? injected[injected.length - 1]!.seq : since;
            bumpCursor(store, agentId, next);
            const body = injected.map(recordLine).join("\n");
            // The summary must name the resume point — the last delivered seq, not the pre-read
            // cursor — or the caller would re-read the records it was just shown.
            const remaining = pending.slice(injected.length);
            const summary =
              remaining.length > 0
                ? moreLine(
                    remaining.length,
                    remaining.filter((r) => r.kind === "msg" && r.mention?.includes(agentId))
                      .length,
                    next,
                  )
                : null;
            return ok(
              {
                ok: true,
                op: "read",
                records: injected,
                cursor: next,
                more: remaining.length > 0,
              },
              `room read → ${injected.length} record(s) since seq ${since}` +
                (body ? `\n${body}` : "") +
                (summary !== null ? `\n${summary}` : ""),
            );
          }

          case "post": {
            const topic = p.topic;
            if (!topic) return fail("post requires a topic");
            const topicError = overCap("topic", topic, TOPIC_MAX_BYTES);
            if (topicError !== null) return fail(topicError);
            const body = p.body;
            if (body === undefined) return fail("post requires a body");
            // K19 — the body cap is enforced here, before the record is drafted; never truncated silently.
            const bytes = Buffer.byteLength(body, "utf-8");
            if (bytes > config.maxBodyBytes) {
              return fail(`body exceeds maxBodyBytes (${config.maxBodyBytes})`);
            }
            // S3 — the fields the body cap never covered, capped before the record is drafted: the
            // log is append-only, so an oversized one is paid for on every later read and digest.
            if (p.idemKey !== undefined) {
              const idemError = overCap("idemKey", p.idemKey, IDEM_KEY_MAX_BYTES);
              if (idemError !== null) return fail(idemError);
            }
            if (p.mention !== undefined) {
              const mentionError = overListCap("mention", p.mention, MENTION_ID_MAX_BYTES);
              if (mentionError !== null) return fail(mentionError);
            }
            // N7 — a body over the T1 token budget is truncated to a head + a read handle.
            const { head, handle } = truncateOversized(body, config.maxT1Tokens);
            const storedBody = handle !== "" ? `${head}${handle}` : head;
            const viewer = viewerFor(store, agentId);
            // R6 — the topic's status ledger. The writer is the agent that HOLDS the topic's
            // claim: in a flat room that is the coordination role, without a hierarchy (the
            // report's synthesis: give the flat room the protocol a router provides, not the
            // router itself). The shape is Magentic-One's five keys, each {reason, answer}, and
            // it is checked on write the way that ledger is checked at runtime.
            if (p.status !== undefined) {
              const missing = STATUS_KEYS.filter((key) => {
                const answer = p.status?.[key];
                return (
                  answer === undefined ||
                  typeof answer.reason !== "string" ||
                  typeof answer.answer !== "string"
                );
              });
              if (missing.length > 0) {
                return fail(
                  `status is missing or malformed: ${missing.join(", ")} (each key needs ` +
                    `{reason, answer})`,
                );
              }
              // S3 — the ledger is persisted verbatim and injected to every recipient; cap each
              // string before the shape check's `holds` gate, so the cap is what refuses it.
              for (const key of STATUS_KEYS) {
                const entry = p.status[key]!;
                const reasonError = overCap(
                  `status.${key}.reason`,
                  entry.reason,
                  STATUS_FIELD_MAX_BYTES,
                );
                if (reasonError !== null) return fail(reasonError);
                const answerError = overCap(
                  `status.${key}.answer`,
                  entry.answer,
                  STATUS_FIELD_MAX_BYTES,
                );
                if (answerError !== null) return fail(answerError);
              }
              const holds = [...store.claims.values()].some(
                (claim) => claim.holder === agentId && claim.resource.startsWith(`${topic}/`),
              );
              if (!holds) {
                return fail(
                  `status is written by the agent holding the topic's claim — claim ${topic}/… first`,
                );
              }
            }
            // R1 — the write-path fence. A post into a topic the poster CLAIMS must carry that
            // claim's current generation: a holder whose lease was reclaimed and re-granted is
            // behind, and its late write is refused instead of landing on top of the new holder's
            // work. The room can fence its own operations; it cannot fence a raw `edit` on a file
            // (agents write files outside the room), so this is the enforcement point, not a
            // complete one.
            if (p.gen !== undefined) {
              const stale = [...store.claims.values()].find(
                (claim) => claim.holder === agentId && claim.resource.startsWith(`${topic}/`),
              );
              if (stale !== undefined && stale.gen !== p.gen) {
                return fail(
                  `post refused — your claim on ${stale.resource} is at generation ${stale.gen}, ` +
                    `not ${p.gen}`,
                );
              }
            }
            // R7 — idempotency. A retry with the same key returns the FIRST post instead of
            // appending a second: a retried post would double-wake every mentioned peer, and a T0
            // is a wake+steer. Stripe's contract, copyable: the saved response is returned, and a
            // key reused for DIFFERENT parameters is an error rather than a silent second post.
            if (p.idemKey !== undefined) {
              const priorSeq = store.idemKeys.get(idemIndexKey(agentId, p.idemKey));
              const prior =
                priorSeq === undefined ? undefined : store.records.find((r) => r.seq === priorSeq);
              if (prior !== undefined && prior.kind === "msg") {
                if (prior.topic !== topic || prior.body !== storedBody) {
                  return fail(`idemKey ${p.idemKey} was already used for a different post`);
                }
                return okWithDelivery(
                  {
                    ok: true,
                    op: "post",
                    id: prior.id,
                    seq: prior.seq,
                    tier: classify(prior, viewer),
                    idempotent: true,
                  },
                  `room post ${safe(topic)} → already posted (seq ${prior.seq})`,
                );
              }
            }
            // §5.1 N1 — replying subscribes the poster to the thread: resolve the parent's root
            // (or the parent itself when it starts the thread) and stamp it on the new record. An
            // unknown replyTo is ignored, never a failure — the reply still posts.
            const parent = p.replyTo ? store.byId.get(p.replyTo) : undefined;
            const threadRoot =
              parent?.kind === "msg" ? (parent.threadRoot ?? parent.id) : undefined;
            const record = store.append({
              kind: "msg",
              from: agentId, // S4 — `from` is always the authenticated caller id
              topic,
              body: storedBody,
              ...(p.mention ? { mention: p.mention } : {}),
              ...(p.replyTo ? { replyTo: p.replyTo } : {}),
              ...(threadRoot ? { threadRoot } : {}),
              ...(p.performative ? { performative: p.performative } : {}),
              ...(p.idemKey !== undefined ? { idemKey: p.idemKey } : {}),
              ...(p.status !== undefined ? { status: p.status as unknown as StatusObject } : {}),
            });
            viewer.lastMessageId = record.id;
            viewer.topics.add(topic);
            if (threadRoot) viewer.threadRoots.add(threadRoot);
            const failure = await notifyRecipients(pi, ctx, store, [record], agentId);
            return okWithDelivery(
              {
                ok: true,
                op: "post",
                id: record.id,
                seq: record.seq,
                tier: classify(record, viewer),
              },
              `room post → ${safe(topic)} · seq ${record.seq}`,
              failure,
            );
          }

          case "claim": {
            const topic = p.topic;
            const key = p.key;
            if (!topic || !key) return fail("claim requires topic and key");
            // S3 — `<topic>/<key>` is persisted on the claim record and every board/read line.
            const fieldError =
              overCap("topic", topic, TOPIC_MAX_BYTES) ?? overCap("key", key, KEY_MAX_BYTES);
            if (fieldError !== null) return fail(fieldError);
            if (p.dependsOn !== undefined) {
              const dependsError = overListCap("dependsOn", p.dependsOn, DEPENDS_ON_MAX_BYTES);
              if (dependsError !== null) return fail(dependsError);
            }
            const resource = `${topic}/${key}`;
            const viewer = viewerFor(store, agentId);
            const ttlMs = clamp(p.ttl ?? config.claimTtlMs, CLAIM_TTL_MIN_MS, CLAIM_TTL_MAX_MS);
            const before = store.seq;
            // R1 — the fencing token. A caller that was displaced (its lease was reclaimed) still
            // holds the generation it was given; presenting it says "I am a zombie". The fence is
            // opt-in: a claim without a generation is the ordinary path.
            if (staleGen(store, resource, p.gen)) {
              return fail(
                `claim ${resource} refused — your generation ${p.gen} is stale (the resource has ` +
                  `moved on)`,
              );
            }
            const result = grant(store, resource, agentId, ttlMs, p.dependsOn);
            if (!result.ok) {
              // R3 — the claim depends on a resource that is still held. Say WHO holds it, so the
              // agent can wait for it (wait_for_claim) instead of duplicating the work.
              if ("blockedBy" in result && result.blockedBy.length > 0) {
                const blockers = result.blockedBy
                  .map((b) => `${b.resource} (held by ${b.holder})`)
                  .join(", ");
                return fail(
                  `claim ${resource} blocked — depends on ${blockers}`,
                  result.holder,
                  result.expiresAt,
                );
              }
              // The holder's own lease: RENEW it rather than reporting "denied — held by <me>".
              // A TTL is a guess about how long the work takes; renewing is how a slow-but-alive
              // agent keeps a live lease.
              if (result.holder === agentId) {
                const renewed = renew(store, resource, agentId, ttlMs);
                if (!renewed.ok) {
                  return fail(
                    `claim ${resource} denied — held by ${renewed.holder ?? "?"}`,
                    renewed.holder,
                    renewed.expiresAt,
                  );
                }
                viewer.heldTopics.add(topic);
                const renewalFailure = await notifyRecipients(
                  pi,
                  ctx,
                  store,
                  appendedSince(store, before),
                  agentId,
                );
                return okWithDelivery(
                  {
                    ok: true,
                    op: "claim",
                    holder: renewed.claim.holder,
                    expiresAt: renewed.claim.acquiredAt + renewed.claim.ttlMs,
                    renewed: true,
                  },
                  `room claim ${safe(resource)} → renewed, expires in ${Math.round(ttlMs / 1000)}s`,
                  renewalFailure,
                );
              }
              // R5 — contention must be VISIBLE. A denied claim used to append nothing, so duplicate
              // work and contention were structurally unmeasurable. The record says who wanted
              // what and who had it.
              store.append({
                kind: "contended",
                from: agentId,
                resource,
                holder: result.holder,
              });
              return fail(
                `claim ${resource} denied — held by ${result.holder}`,
                result.holder,
                result.expiresAt,
              );
            }
            viewer.heldTopics.add(topic);
            const failure = await notifyRecipients(
              pi,
              ctx,
              store,
              appendedSince(store, before),
              agentId,
            );
            return okWithDelivery(
              {
                ok: true,
                op: "claim",
                holder: result.claim.holder,
                expiresAt: result.claim.acquiredAt + result.claim.ttlMs,
                gen: result.claim.gen,
              },
              `room claim ${safe(resource)} → granted, expires in ${Math.round(ttlMs / 1000)}s`,
              failure,
            );
          }

          case "release": {
            const topic = p.topic;
            const key = p.key;
            if (!topic || !key) return fail("release requires topic and key");
            // S3 — the release record persists the resource too.
            const fieldError =
              overCap("topic", topic, TOPIC_MAX_BYTES) ?? overCap("key", key, KEY_MAX_BYTES);
            if (fieldError !== null) return fail(fieldError);
            const resource = `${topic}/${key}`;
            const held = store.claims.get(resource);
            if (!held) return fail("unknown resource");
            const before = store.seq;
            if (held.holder !== agentId) {
              // §4.1 — a reclaim against a stale claim is explicit and logged, never silent.
              const outcome = reclaimIfStale(store, resource, Date.now());
              if (outcome.reclaimed) {
                const failure = await notifyRecipients(
                  pi,
                  ctx,
                  store,
                  appendedSince(store, before),
                  agentId,
                );
                // The lease WAS freed — say so, and name the successor when a waiter took it.
                const successor =
                  outcome.holder === null ? " (lease dropped)" : ` → ${outcome.holder}`;
                return okWithDelivery(
                  { ok: true, op: "release" },
                  `room release ${safe(resource)} → reclaimed (was stale)${successor}`,
                  failure,
                );
              }
              return fail(
                `release ${resource} denied — not holder`,
                held.holder,
                held.acquiredAt + held.ttlMs,
              );
            }
            release(store, resource, agentId, "released");
            const failure = await notifyRecipients(
              pi,
              ctx,
              store,
              appendedSince(store, before),
              agentId,
            );
            return okWithDelivery(
              { ok: true, op: "release" },
              `room release ${safe(resource)} → released`,
              failure,
            );
          }

          case "board": {
            const board = buildBoard(store, viewerStateFor(store, agentId));
            return ok(
              { ok: true, op: "board", board },
              withRows(
                `room board → ${board.claims.length} claim(s), ${board.roster.length} member(s), ${board.topics.length} topic(s)`,
                boardLines(board),
              ),
            );
          }

          case "topics": {
            const viewer = viewerStateFor(store, agentId);
            // Same single-pass scan as the board: the topics basis is mute-aware, so it reads
            // `unread`. Rows, order and counts are identical to the old scan + unreadCounts.
            const topics: TopicRow[] = scanTopics(store, viewer).map((row) => ({
              topic: row.topic,
              lastSeq: row.lastSeq,
              unread: row.unread,
            }));
            return ok(
              { ok: true, op: "topics", topics },
              withRows(
                `room topics → ${topics.length} topic(s)`,
                topics.map(
                  (t) => `topic ${safe(t.topic)} · ${t.unread} unread · last seq ${t.lastSeq}`,
                ),
              ),
            );
          }

          case "mute": {
            if (p.topic === undefined) {
              muteRoom(store, agentId);
            } else {
              muteTopic(store, agentId, p.topic);
            }
            return ok(
              { ok: true, op: "mute" },
              `room mute → ${p.topic !== undefined ? safe(p.topic) : "whole room"}`,
            );
          }

          case "unmute": {
            if (p.topic === undefined) {
              unmuteRoom(store, agentId);
            } else {
              unmuteTopic(store, agentId, p.topic);
            }
            return ok(
              { ok: true, op: "unmute" },
              `room unmute → ${p.topic !== undefined ? safe(p.topic) : "whole room"}`,
            );
          }

          case "tree": {
            const n = store.records.length;
            const tree = openTreeStore(store.treePath, n);
            // F3 — the persisted view, loaded (and saved on first use), never rebuilt from the log.
            // F5 — `loadView` tiles with a minimum block of 2, so no block covers a single message.
            const tiling = loadView(store.treePath, n, COVER_BUDGET_LINES);
            const blocks = tiling.map(([lo, hi]) => {
              const size = hi - lo;
              const raw = size <= RAW_MAX;
              const summary = raw ? undefined : (tree.getNode(lo, hi) ?? undefined);
              return { lo, hi, size, raw, ...(summary !== undefined ? { summary } : {}) };
            });
            return ok(
              { ok: true, op: "tree", blocks },
              withRows(
                `room tree → ${blocks.length} block(s)`,
                blocks.map(
                  (b) =>
                    `[${b.lo},${b.hi}) size ${b.size} ${b.raw ? "raw" : "summary"}${b.summary !== undefined ? ` · "${safe(b.summary)}"` : ""}`,
                ),
              ),
            );
          }

          case "zoom": {
            const lo = p.lo;
            const hi = p.hi;
            if (lo === undefined || hi === undefined) return fail("zoom requires lo and hi");
            const n = store.records.length;
            const validation = validateZoomRange(lo, hi, n);
            if (!validation.ok) return fail(validation.error);
            const tree = openTreeStore(store.treePath, n);
            const children = zoom(tree, lo, hi, (seq) => {
              const record = store.records[seq];
              return record !== undefined ? recordLine(record) : "";
            });
            return ok(
              { ok: true, op: "zoom", children },
              withRows(
                `room zoom → ${children.length} child(ren)`,
                children.map(
                  (c) =>
                    `[${c.lo},${c.hi}) size ${c.size} ${c.raw ? "raw" : "summary"} · ${safe(c.text)}`,
                ),
              ),
            );
          }

          case "recall": {
            const pattern = p.pattern;
            if (pattern === undefined) return fail("recall requires a pattern");
            if (pattern.length > RECALL_PATTERN_MAX) {
              return fail(`pattern too long (max ${RECALL_PATTERN_MAX} chars)`);
            }
            // S1 — refuse the super-linear shapes BEFORE compiling: the regex engine has no
            // timeout, and one catastrophic `test` used to run for 2 222 ms (measured) on the
            // host's own thread while the deadline was only checked between records.
            const refusal = recallRefusal(pattern);
            if (refusal !== null) return fail(refusal);
            let regex: RegExp;
            try {
              regex = new RegExp(pattern);
            } catch {
              return fail("invalid regex pattern");
            }
            const deadline = Date.now() + RECALL_SCAN_MS;
            const matches: Array<{ seq: number; record: RoomRecord }> = [];
            for (let i = store.records.length - 1; i >= 0; i--) {
              // S1 — the deadline is checked BEFORE the test (never start one past the budget) and
              // AFTER it (a single test that overran aborts the scan instead of waking up to run
              // every remaining record). One overrun is the bounded worst case, and the slice below
              // is what keeps that one affordable.
              if (Date.now() > deadline) return fail("recall timed out");
              const record = store.records[i]!;
              const line = recordLine(record);
              // S1 — a per-record slice: the pattern never sees more than RECALL_TEXT_MAX chars, so
              // its cost is bounded by the slice, not by a body an untrusted peer chose. A match in
              // the head or the first ~490 bytes of the body is still found.
              const probe = line.length > RECALL_TEXT_MAX ? line.slice(0, RECALL_TEXT_MAX) : line;
              const hit = regex.test(probe);
              if (Date.now() > deadline) return fail("recall timed out");
              if (hit) {
                matches.push({ seq: record.seq, record });
                if (matches.length >= RECALL_LIMIT_MAX) break;
              }
            }
            // Miss signal is details-only (no extra write): a zero-match recall on a non-empty
            // log is exactly the countable "cannot find it" event the embeddings revisit trigger needs.
            const logSize = store.records.length;
            const miss = matches.length === 0 && logSize > 0;
            return ok(
              miss
                ? {
                    ok: true as const,
                    op: "recall" as const,
                    matches,
                    recallMiss: true as const,
                    logSize,
                  }
                : { ok: true as const, op: "recall" as const, matches },
              withRows(
                `room recall → ${matches.length} match(es)`,
                matches.map((m) => recordLine(m.record)),
              ),
            );
          }
        }
      } catch (error) {
        // U6/K1 — a mutation that throws (the log write on a full disk, a corrupt tree) is a
        // RESULT, never a throw out of `execute`: the host coerces a throwing tool into an
        // error, and the room contract is a normal `{ok:false}`.
        return fail(error instanceof Error ? error.message : "room operation failed");
      }
    },
  });
}
