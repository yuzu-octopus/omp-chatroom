import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { dequeueWaiter, enqueueWaiter, requeueWaiter, type ClaimState } from "../store/claims";
export const WAIT_FOR_CLAIM_NAME = "wait_for_claim";
export const WAIT_FOR_CLAIM_DESCRIPTION: string = `Block until you acquire the CLAIM on
"<topic>/<key>", or time out. When the holder releases, is reclaimed, or its TTL expires, the oldest
waiter is resolved AND granted the lease. Use this when a peer holds a resource you need; use
wait_for_message for chatter and wait_for_agent for peer status. Timeout is a normal outcome
(acquired:false), not an error. Optional maxWaitMs bounds the wait.`;   // K16 — §4.0.1 verbatim
export const CLAIM_WAIT_DEFAULT_TIMEOUT_MS = 20_000;   // §4.4 = SQS max long poll
export const CLAIM_WAIT_MIN_MS = 1_000;
export const CLAIM_WAIT_MAX_MS = 300_000;

// K11 — WaitOutcome is declared ONCE, here; imported by schema (types), tiers, governor, delivery.
export type WaitOutcome = "event" | "timeout" | "aborted";

export interface WaitForClaimParams {            // SCAFFOLD-DEFINED (derived from §4.4; K13)
  resource: string;
  timeout?: number;
  ttl?: number;
  maxWaitMs?: number;
}

// K1 — payload inside `details`.
export interface WaitForClaimDetails {
  ok: true;
  outcome: WaitOutcome;
  acquired: boolean;
  claim?: ClaimState;
}
export type WaitForClaimResult = AgentToolResult<WaitForClaimDetails>;

export function registerWaitForClaim(pi: ExtensionAPI): void {
  throw new Error("not implemented");
}
