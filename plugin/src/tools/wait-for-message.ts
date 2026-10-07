import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { describeWaitCall, describeWaitResult, renderWaitCall, renderWaitResult } from "../cards/tool-cards";
import { storeFor } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import { WAIT_DEFAULT_TIMEOUT_MS, WAIT_MAX_MS } from "./wait-for-agent";
import type { WaitOutcome } from "./wait-for-claim";
export const WAIT_FOR_MESSAGE_NAME = "wait_for_message";
export const WAIT_FOR_MESSAGE_DESCRIPTION: string = `Block until a new ROOM MESSAGE arrives that
matches your filter (from a given agent, or any message that mentions you). Use this when you are
waiting on room traffic; use wait_for_agent for a peer's status change and wait_for_claim for a
resource lease. Bounded by timeout (default 30 s, max 30 min); returns outcome "event" | "timeout" |
"aborted" plus the matched record. Prefer this over repeatedly calling room{op:"read"}.`;   // K16 — §4.0.1 verbatim

export interface WaitForMessageParams {          // SCAFFOLD-DEFINED (derived from §4.3; K13)
  from?: string;
  mention?: boolean;
  source?: "room";
  timeout?: number;
}

// K1 — payload inside `details`; `useless:true` sits on the result, not in `details`.
export interface WaitForMessageDetails {
  ok: true;
  outcome: WaitOutcome;
  message?: RoomRecord;
}
export type WaitForMessageResult = AgentToolResult<WaitForMessageDetails>;

export function registerWaitForMessage(pi: ExtensionAPI): void {
  throw new Error("not implemented");
}
