import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { safeRoomText } from "../onboarding/escape";
import { buildDigest } from "../onboarding/digest";
import { grant, release, reclaimIfStale, contended } from "../store/claims";
import { resolveRoomConfig } from "../store/config";
import { cursorFor, bumpCursor, initCursor, lagFor } from "../store/cursors";
import { roomStoreFor, type MemberState, type RoomStore } from "../store/room-store";
import type { BoardResult, Performative, RoomRecord, TopicRow } from "../store/schema";
export const ROOM_TOOL_NAME = "room";
export const ROOM_DESCRIPTION: string = `Post to and read the shared room for this session tree: a
topic-based claim board plus a bounded chat stream. Use it for coordination artifacts several agents
must see — claims, releases, shared findings, status — NOT for private redirection (use agent://<id>
for one recipient; see the room-vs-direct routing rule in your prompt).
Ops: join (first call; mints your cursor), read (records after your cursor), post (send to a topic),
claim/release (exclusive ownership of "<topic>/<key>" with a mandatory TTL), board (claims + roster +
per-agent lag).
Before starting work another agent might also start, claim it. Read the board first.`;   // K16 — §4.0.1, trimmed to the Option A op set (§1.4)
export const ROOM_LOAD_MODE = "essential";  // RISK R3

// Option A (§1.4) ships six of the twelve §4.1 ops; the rest (topics/mute/unmute/tree/zoom/recall)
// belong to dropped rows and are not advertised, not schematized and not dispatched.
export type RoomOp = "join" | "read" | "post" | "claim" | "release" | "board";

// K13 — the params type is explicit so `params.op` is not `unknown`; never annotate the tool object
// with a bare `ToolDefinition` (that erases TParams).
export interface RoomParams {
  op: RoomOp;
  topic?: string; body?: string; mention?: string[]; replyTo?: string;
  performative?: Performative;
  key?: string; ttl?: number;
  since?: number; limit?: number;
}

// K1 — the `details` payload. `ok` is always present; `outcome` only on the wait tools.
export type RoomToolDetails =
  | { ok: true; op: "join"; digest: string; cursor: number }
  | { ok: true; op: "read"; records: RoomRecord[]; cursor: number; more: boolean }
  | { ok: true; op: "post"; id: string; seq: number }   // Option A: no attention tiers (§1.4)
  | { ok: true; op: "claim"; holder: string; expiresAt: number }
  | { ok: true; op: "release" }
  | { ok: true; op: "board"; board: BoardResult }
  | { ok: false; error: string; holder?: string; expiresAt?: number };   // "not holder" carries the expiry

// K1 — the uniform tool result. `content` is ALWAYS present (the host coerces a result without a
// `content` array to `isError:true` + "Tool returned an invalid result: missing content array.").
export type RoomToolResult = AgentToolResult<RoomToolDetails>;

export const READ_LIMIT_DEFAULT = 50;      // K20 — was 100; routed through the T1 budget
export const READ_LIMIT_MAX = 200;         // K20 — was 1 000 (~97k tokens)
export const RECALL_LIMIT_MAX = 100;       // §4.1

const CLAIM_TTL_MIN_MS = 1_000;            // §3.4 — TTL is mandatory; a zero lease is not a lease
const CLAIM_TTL_MAX_MS = 86_400_000;
const READ_CURSOR_LAG_MAX = 1_000;

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

function viewerFor(store: RoomStore, agentId: string): MemberState {
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

export function registerRoomTool(pi: ExtensionAPI): void {     // §2.1.1
  const z = pi.zod;
  const params = z.object({
    op: z.enum(["join", "read", "post", "claim", "release", "board"]),
    topic: z.string().optional(),
    body: z.string().optional(),
    mention: z.array(z.string()).optional(),
    replyTo: z.string().optional(),
    performative: z.enum(["inform", "request", "propose", "accept", "reject", "query", "failure"]).optional(),
    key: z.string().optional(),
    ttl: z.number().optional(),
    since: z.number().optional(),
    limit: z.number().optional(),
  });

  pi.registerTool({
    name: ROOM_TOOL_NAME,
    label: "Room",
    description: ROOM_DESCRIPTION,
    parameters: params,
    loadMode: ROOM_LOAD_MODE,
    approval: "read",
    strict: true,
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
          const viewer = viewerFor(store, agentId);
          // §4.1 join idempotency — a second join is a no-op: no second member record.
          // Gate on MEMBERSHIP, not on the cursor: the onboarding hook pre-mints every agent's
          // cursor at `before_agent_start`, so a cursor-existence test is always false here and no
          // `member{join}` record would ever be appended (the roster would stay empty forever).
          if (!store.members.has(agentId)) {
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
          viewerFor(store, agentId);
          const cursor = cursorFor(store, agentId);
          const since = p.since ?? cursor;
          const limit = clamp(p.limit ?? READ_LIMIT_DEFAULT, 1, READ_LIMIT_MAX);
          const pending = store.records.filter((r) => r.seq > since);
          const records = pending.slice(0, limit);
          const next = records.length > 0 ? records[records.length - 1]!.seq : since;
          bumpCursor(store, agentId, next);
          const body = records.map(recordLine).join("\n");
          return ok(
            { ok: true, op: "read", records, cursor: next, more: pending.length > records.length },
            `room read → ${records.length} record(s) since seq ${since}` + (body ? `\n${body}` : ""),
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
          const viewer = viewerFor(store, agentId);
          const record = store.append({
            kind: "msg",
            from: agentId,               // S4 — `from` is always the authenticated caller id
            topic,
            body,
            ...(p.mention ? { mention: p.mention } : {}),
            ...(p.replyTo ? { replyTo: p.replyTo } : {}),
            ...(p.performative ? { performative: p.performative } : {}),
          });
          viewer.lastMessageId = record.id;
          viewer.topics.add(topic);
          return ok(
            { ok: true, op: "post", id: record.id, seq: record.seq },
            `room post → ${safe(topic)} · seq ${record.seq}`,
          );
        }

        case "claim": {
          const topic = p.topic;
          const key = p.key;
          if (!topic || !key) return fail("claim requires topic and key");
          const resource = `${topic}/${key}`;
          viewerFor(store, agentId);
          const ttlMs = clamp(p.ttl ?? config.claimTtlMs, CLAIM_TTL_MIN_MS, CLAIM_TTL_MAX_MS);
          const result = grant(store, resource, agentId, ttlMs);
          if (!result.ok) {
            return fail(`claim ${resource} denied — held by ${result.holder}`, result.holder, result.expiresAt);
          }
          return ok(
            { ok: true, op: "claim", holder: result.claim.holder, expiresAt: result.claim.acquiredAt + result.claim.ttlMs },
            `room claim ${safe(resource)} → granted, expires in ${Math.round(ttlMs / 1000)}s`,
          );
        }

        case "release": {
          const topic = p.topic;
          const key = p.key;
          if (!topic || !key) return fail("release requires topic and key");
          const resource = `${topic}/${key}`;
          const held = store.claims.get(resource);
          if (!held) return fail("unknown resource");
          if (held.holder !== agentId) {
            // §4.1 — a reclaim against a stale claim is explicit and logged, never silent.
            const reclaimed = reclaimIfStale(store, resource, Date.now());
            if (reclaimed) {
              return ok({ ok: true, op: "release" }, `room release ${safe(resource)} → reclaimed (was stale)`);
            }
            return fail(`release ${resource} denied — not holder`, held.holder, held.acquiredAt + held.ttlMs);
          }
          release(store, resource, agentId, "released");
          return ok({ ok: true, op: "release" }, `room release ${safe(resource)} → released`);
        }

        case "board": {
          const board = buildBoard(store, viewerFor(store, agentId));
          return ok(
            { ok: true, op: "board", board },
            `room board → ${board.claims.length} claim(s), ${board.roster.length} member(s), ${board.topics.length} topic(s)`,
          );
        }
      }
    },
  });
}
