import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { deliver } from "../attention/delivery";
import {
  admitPost,
  coalescePending,
  isMuted,
  moreLine,
  muteRoom,
  muteTopic,
  selectT0,
  selectT1,
  truncateOversized,
  unmuteRoom,
  unmuteTopic,
  unreadCounts,
} from "../attention/governor";
import { classify, type Tier } from "../attention/tiers";
import {
  describeRoomCall,
  describeRoomResult,
  renderRoomCall,
  renderRoomResult,
} from "../cards/tool-cards";
import { buildDigest, DIGEST_CLAIMS_CAP, ROSTER_CAP } from "../onboarding/digest";
import { safeRoomText } from "../onboarding/escape";
import { contended, grant, reclaimIfStale, release } from "../store/claims";
import { type RoomConfig, resolveRoomConfig } from "../store/config";
import { bumpCursor, cursorFor, initCursor, lagFor } from "../store/cursors";
import { type MemberState, type RoomStore, roomStoreFor } from "../store/room-store";
import type { BoardResult, Performative, RoomRecord, TopicRow } from "../store/schema";
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
agents could touch the same work, so nobody duplicates it.

Triggers: before editing a shared file or step check the board, then claim the resource; when you
find something other agents need, post it; when you finish, release your claims; when you have
nothing to do but wait for a peer, a message, or a claim, block on the wait tools instead of polling.

NOT for private redirection — use agent://<id> when exactly one agent is the recipient and no shared
record is wanted.

Ops: join (first call) · read (records since your cursor) · post (send to a topic; mention is T0
wake+steer, so use it only when you really need to interrupt) · claim/release (exclusive ownership of
"<topic>/<key>", lease default 5 min) · board (claims + roster + lag) · topics · mute/unmute ·
tree/zoom (cold summary over older records) · recall (regex over the raw log).`;
export const ROOM_LOAD_MODE = "essential"; // RISK R3

// §4.1 — all 11 ops: join/read/post/claim/release/board/topics/mute/unmute/tree/zoom/recall
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
  key?: string;
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
  | { ok: true; op: "post"; id: string; seq: number; tier: Tier; deliveryError?: string }
  | { ok: true; op: "claim"; holder: string; expiresAt: number; deliveryError?: string }
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
  | { ok: true; op: "recall"; matches: Array<{ seq: number; record: RoomRecord }> }
  | { ok: false; error: string; holder?: string; expiresAt?: number }; // "not holder" carries the expiry

// K1 — the uniform tool result. `content` is ALWAYS present (the host coerces a result without a
// `content` array to `isError:true` + "Tool returned an invalid result: missing content array.").
export type RoomToolResult = AgentToolResult<RoomToolDetails>;

export const READ_LIMIT_DEFAULT = 50; // K20 — was 100; routed through the T1 budget
export const READ_LIMIT_MAX = 200; // K20 — was 1 000 (~97k tokens)
export const RECALL_LIMIT_MAX = 100; // §4.1

const CLAIM_TTL_MIN_MS = 1_000; // §3.4 — TTL is mandatory; a zero lease is not a lease
const CLAIM_TTL_MAX_MS = 86_400_000;
const _READ_CURSOR_LAG_MAX = 1_000;

/** K22/S1 — every room-authored string that reaches the model goes through the shared escaper. */
const safe = safeRoomText;

function ok<T extends RoomToolDetails>(details: T, text: string): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details };
}

/** Failures return `content` + `details:{ok:false}` and never throw (§4.5). */
function fail(error: string, holder?: string, expiresAt?: number): RoomToolResult {
  const line = holder ? `room → ${error} (held by ${holder})` : `room → ${error}`;
  return {
    content: [{ type: "text", text: line }],
    details: holder !== undefined ? { ok: false, error, holder, expiresAt } : { ok: false, error },
  };
}

export function viewerFor(store: RoomStore, agentId: string): MemberState {
  const existing = store.members.get(agentId);
  if (existing) return existing;
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

/** One model-facing line per record, tier-free (Option A has no governor) — §4.5.1 K17. */
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
    const waiting = claim.contended > 0 ? ` · ${claim.contended} waiting` : "";
    lines.push(`claim ${safe(claim.resource)} · ${safe(claim.holder)} · ${left}s left${waiting}`);
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
    contended: contended(store, claim.resource).length,
  }));
  const roster = [...store.members.values()].map((member) => ({
    agentId: member.agentId,
    status: AgentRegistry.global().get(member.agentId)?.status ?? "running",
    cursor: cursorFor(store, member.agentId),
    lag: lagFor(store, member.agentId),
    topics: [...member.topics],
  }));
  const cursor = cursorFor(store, viewer.agentId);
  const byTopic = new Map<string, TopicRow>();
  const topics: TopicRow[] = [];
  for (const record of store.records) {
    if (record.kind !== "msg" && record.kind !== "note") continue;
    let row = byTopic.get(record.topic);
    if (!row) {
      row = { topic: record.topic, lastSeq: record.seq, unread: 0 };
      byTopic.set(record.topic, row);
      topics.push(row);
    }
    row.lastSeq = record.seq;
    if (record.seq > cursor) row.unread++;
  }
  return { ok: true, claims, roster, topics };
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
 * §5.2 K/B injection cap: the T1 records pending above the viewer's cursor are admitted oldest-first
 * up to K and B; a record past the cap is left to the digest instead of pushed. T0/T2 are not
 * bounded here (T0 is never dropped; T2 never injects).
 */
function t1Admitted(
  store: RoomStore,
  viewer: MemberState,
  record: RoomRecord,
  config: RoomConfig,
): boolean {
  const cursor = store.cursors.get(viewer.agentId) ?? 0;
  const pending = store.records.filter(
    (r) => r.seq > cursor && classify(r, viewer) === "T1" && !isMuted(store, viewer, r),
  );
  return selectT1(store, viewer, pending, { caps: config }).injected.some(
    (r) => r.seq === record.seq,
  );
}

/** A board-delta card, the same shell `deliver` uses, for the T0 batch and the T2 digest. */
function notice(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: string,
  content: string,
  deliverAs: "steer" | "aside",
): void {
  // K22/S1 — the digest line carries room-authored topic names; escape before it reaches the model.
  const payload = { customType: "room:board-delta", content: safe(content), display: true };
  const session = AgentRegistry.global().get(target)?.session;
  if (session) {
    void session.sendCustomMessage(payload, { deliverAs });
    return;
  }
  if (target === ctx.agent.id) pi.sendMessage(payload, { deliverAs });
}

/**
 * §5.3 — deliver each just-appended record to every relevant recipient. Runs AFTER the synchronous
 * append (I1/I5): the log is already durable, so a delivery failure can only be reported, never
 * corrupt the record or throw out of `execute`. Returns the first failure message, if any.
 *
 * Exported for the `/room` command path (room-command.ts), the second caller: the command handler
 * has no `deliveryError` envelope, so this function must stay throw-free — a throw would surface
 * as an unhandled rejection in the TUI. T0 is never dropped, but its pending set is ceiling-batched
 * by `selectT0` (N5) — past the ceiling ONE digest interrupt carries the count and the records stay
 * above the recipient's cursor. T2 is cursor-only, except that its pending set is digested by
 * `coalescePending` (N/T) onto the next T0/T1 delivery for that recipient. A post past the
 * producer's srTCM burst is coalesced for the digest — the record is already durable and its
 * recipients' cursors stay put.
 */
export async function notifyRecipients(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  store: RoomStore,
  records: readonly RoomRecord[],
  actorId: string,
): Promise<string | undefined> {
  const config = resolveRoomConfig(pi, store.root);
  let failure: string | undefined;
  const note = (error: unknown): void => {
    failure ??= error instanceof Error ? error.message : "delivery failed";
  };
  try {
    // §5.2 — the producer's bucket, consumed once per appended post (claim/release are not posts).
    const coalesced =
      records.some((r) => r.kind === "msg") &&
      admitPost(store, actorId, Date.now(), config) === "red";
    for (const target of recipients(store, actorId)) {
      try {
        const viewer = viewerFor(store, target);
        const cursor = store.cursors.get(target) ?? 0;
        // The recipient's whole pending set, minus muted and cursor-only T2: exactly what a
        // push may show. T0 is exempt from K/B; T1 is admitted oldest-first by `selectT1`.
        const pending = store.records.filter(
          (r) => r.seq > cursor && !isMuted(store, viewer, r) && classify(r, viewer) !== "T2",
        );
        // N5 — past its ceiling the T0 set batches into ONE digest interrupt, never dropped.
        const t0 = selectT0(pending.filter((r) => classify(r, viewer) === "T0"));
        const admitted = [...t0.injected];
        for (const record of records) {
          if (isMuted(store, viewer, record)) continue;
          if (classify(record, viewer) !== "T1") continue;
          if (!coalesced && t1Admitted(store, viewer, record, config)) admitted.push(record);
        }
        // N/T — the T2 backlog rides the next T0/T1 for this recipient as ONE line.
        const digest =
          admitted.length > 0 || t0.summaryLine !== null
            ? coalescePending(store, viewer, Date.now(), config)
            : null;
        let extra = digest !== null ? [digest] : [];
        for (const record of admitted) {
          await deliver(pi, ctx, target, record, classify(record, viewer), extra);
          extra = [];
        }
        if (t0.summaryLine !== null) {
          await notice(pi, ctx, target, t0.summaryLine, "steer");
        } else if (extra.length > 0) {
          await notice(pi, ctx, target, extra.join("\n"), "aside");
        }
        // A red (coalesced) producer's records are left pending for the digest: the log is already
        // durable and the cursor must NOT advance, or `coalescePending` could never see them.
        // A non-coalesced T2 is cursor-only — never injected, and consumed on arrival.
        if (coalesced) continue;
        for (const record of records) {
          if (classify(record, viewer) === "T2") await deliver(pi, ctx, target, record, "T2");
        }
      } catch (error) {
        note(error);
      }
    }
  } catch (error) {
    note(error);
  }
  return failure;
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
  // tool these strings are all it sees: a bare `ttl?: number` tells it nothing about milliseconds,
  // and `lo`/`hi` without a block-range note is opaque. This was the gap — the room tool, the primary
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
        "join · read · post · claim · release · board · topics · mute · unmute · tree · zoom · recall",
      ),
    topic: z
      .string()
      .optional()
      .describe(
        'Topic name, e.g. "build". Used by post, mute and unmute. A claim rolls topic+key together.',
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
          "prefer a topic when the message can wait.",
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
    key: z
      .string()
      .optional()
      .describe(
        'Second half of a claim resource, e.g. "src/auth". The full resource is "<topic>/<key>".',
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
      .describe("Resume read at this log seq number (not a timestamp). Defaults to your cursor."),
    limit: z.number().optional().describe("Max records to return from read. 1…200, default 50."),
    lo: z
      .number()
      .optional()
      .describe(
        "First seq of the tree range for zoom, the same [lo, hi) pair the tree op printed. " +
          "hi-lo must be a power of two and lo aligned to it.",
      ),
    hi: z
      .number()
      .optional()
      .describe("Exclusive end of the zoom range, i.e. one past the last seq."),
    pattern: z
      .string()
      .optional()
      .describe(
        "Regex for recall over the raw log, newest first, max 100 matches. Max 200 chars; " +
          "a pattern that burns its 1s scan budget is refused rather than hanging the session.",
      ),
  });

  pi.registerTool({
    name: ROOM_TOOL_NAME,
    label: "Room",
    description: ROOM_DESCRIPTION,
    parameters: params,
    loadMode: ROOM_LOAD_MODE,
    approval: "read",
    strict: true,
    renderCall: renderRoomCall,
    renderResult: renderRoomResult,
    describeCall: describeRoomCall,
    describeResult: describeRoomResult,
    async execute(_toolCallId, p, _signal, _onUpdate, ctx): Promise<RoomToolResult> {
      // U6 — a missing/unwritable/corrupt room file returns a normal result, never a throw.
      let store: RoomStore;
      try {
        store = roomStoreFor(ctx);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "room file corrupt");
      }
      const agentId = ctx.agent.id;
      const config = resolveRoomConfig(pi, store.root);
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
          const viewer = viewerFor(store, agentId);
          const cursor = cursorFor(store, agentId);
          const since = p.since ?? cursor;
          const limit = clamp(p.limit ?? READ_LIMIT_DEFAULT, 1, READ_LIMIT_MAX);
          const pending = store.records.filter((r) => r.seq > since);
          // K20 — `read` is routed through the same per-turn K/B budget as the injection path.
          const { injected } = selectT1(store, viewer, pending, {
            spend: true,
            limit,
            caps: config,
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
                  remaining.filter((r) => r.kind === "msg" && r.mention?.includes(agentId)).length,
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
          const body = p.body;
          if (body === undefined) return fail("post requires a body");
          // K19 — the body cap is enforced here, before the record is drafted; never truncated silently.
          const bytes = Buffer.byteLength(body, "utf-8");
          if (bytes > config.maxBodyBytes) {
            return fail(`body exceeds maxBodyBytes (${config.maxBodyBytes})`);
          }
          // N7 — a body over the T1 token budget is truncated to a head + a read handle.
          const { head, handle } = truncateOversized(body, config.maxT1Tokens);
          const storedBody = handle !== "" ? `${head}${handle}` : head;
          const viewer = viewerFor(store, agentId);
          const record = store.append({
            kind: "msg",
            from: agentId, // S4 — `from` is always the authenticated caller id
            topic,
            body: storedBody,
            ...(p.mention ? { mention: p.mention } : {}),
            ...(p.replyTo ? { replyTo: p.replyTo } : {}),
            ...(p.performative ? { performative: p.performative } : {}),
          });
          viewer.lastMessageId = record.id;
          viewer.topics.add(topic);
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
          const resource = `${topic}/${key}`;
          const viewer = viewerFor(store, agentId);
          const ttlMs = clamp(p.ttl ?? config.claimTtlMs, CLAIM_TTL_MIN_MS, CLAIM_TTL_MAX_MS);
          const before = store.seq;
          const result = grant(store, resource, agentId, ttlMs);
          if (!result.ok) {
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
            },
            `room claim ${safe(resource)} → granted, expires in ${Math.round(ttlMs / 1000)}s`,
            failure,
          );
        }

        case "release": {
          const topic = p.topic;
          const key = p.key;
          if (!topic || !key) return fail("release requires topic and key");
          const resource = `${topic}/${key}`;
          const held = store.claims.get(resource);
          if (!held) return fail("unknown resource");
          const before = store.seq;
          if (held.holder !== agentId) {
            // §4.1 — a reclaim against a stale claim is explicit and logged, never silent.
            const reclaimed = reclaimIfStale(store, resource, Date.now());
            if (reclaimed) {
              const failure = await notifyRecipients(
                pi,
                ctx,
                store,
                appendedSince(store, before),
                agentId,
              );
              return okWithDelivery(
                { ok: true, op: "release" },
                `room release ${safe(resource)} → reclaimed (was stale)`,
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
          const board = buildBoard(store, viewerFor(store, agentId));
          return ok(
            { ok: true, op: "board", board },
            withRows(
              `room board → ${board.claims.length} claim(s), ${board.roster.length} member(s), ${board.topics.length} topic(s)`,
              boardLines(board),
            ),
          );
        }

        case "topics": {
          const viewer = viewerFor(store, agentId);
          const counts = unreadCounts(store, viewer);
          const byTopic = new Map<string, TopicRow>();
          const topics: TopicRow[] = [];
          for (const record of store.records) {
            if (record.kind !== "msg" && record.kind !== "note") continue;
            let row = byTopic.get(record.topic);
            if (!row) {
              row = { topic: record.topic, lastSeq: record.seq, unread: 0 };
              byTopic.set(record.topic, row);
              topics.push(row);
            }
            row.lastSeq = record.seq;
            row.unread = counts.get(record.topic) ?? 0;
          }
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
          if (pattern.length > 200) return fail("pattern too long (max 200 chars)");
          let regex: RegExp;
          try {
            regex = new RegExp(pattern);
          } catch {
            return fail("invalid regex pattern");
          }
          const deadline = Date.now() + 1000;
          const matches: Array<{ seq: number; record: RoomRecord }> = [];
          for (let i = store.records.length - 1; i >= 0; i--) {
            if (Date.now() > deadline) return fail("recall timed out");
            const record = store.records[i]!;
            const text = recordLine(record);
            if (regex.test(text)) {
              matches.push({ seq: record.seq, record });
              if (matches.length >= RECALL_LIMIT_MAX) break;
            }
          }
          return ok(
            { ok: true, op: "recall", matches },
            withRows(
              `room recall → ${matches.length} match(es)`,
              matches.map((m) => recordLine(m.record)),
            ),
          );
        }
      }
    },
  });
}
