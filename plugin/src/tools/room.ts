import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { buildDigest } from "../onboarding/digest";
import { grant, release, reclaimIfStale, contended } from "../store/claims";
import { cursorFor, bumpCursor, initCursor, lagFor } from "../store/cursors";
import { roomStoreFor } from "../store/room-store";
import type { BoardResult, Performative, RoomRecord, TopicRow } from "../store/schema";
export const ROOM_TOOL_NAME = "room";
export const ROOM_DESCRIPTION: string = `Post to and read the shared room for this session tree: a
topic-based claim board plus a bounded chat stream. Use it for coordination artifacts several agents
must see — claims, releases, shared findings, status — NOT for private redirection (use agent://<id>
for one recipient; see the room-vs-direct routing rule in your prompt).
Ops: join (first call; mints your cursor), read (records after your cursor), post (send to a topic),
claim/release (exclusive ownership of "<topic>/<key>" with a mandatory TTL), board (claims + roster +
per-agent lag), topics, mute/unmute, tree/zoom (cold-tree views), recall (regex over the raw log).
Before starting work another agent might also start, claim it. Read the board first.`;   // K16 — §4.0.1 verbatim
export const ROOM_LOAD_MODE = "essential";  // RISK R3

// SCAFFOLD-DEFINED — derived from the §4.1 zod schema.
export type RoomOp =
  | "join" | "read" | "post" | "claim" | "release" | "board"
  | "topics" | "mute" | "unmute" | "tree" | "zoom" | "recall";

// K13 — the params type is explicit so `params.op` is not `unknown`; never annotate the tool object
// with a bare `ToolDefinition` (that erases TParams).
export interface RoomParams {
  op: RoomOp;
  topic?: string; body?: string; mention?: string[]; replyTo?: string;
  performative?: Performative;
  key?: string; ttl?: number;
  since?: number; limit?: number;
  lo?: number; hi?: number;
  pattern?: string;
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


export function registerRoomTool(pi: ExtensionAPI): void {     // §2.1.1
  throw new Error("not implemented");
}
