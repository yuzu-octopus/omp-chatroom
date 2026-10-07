import { AgentRegistry, type AgentToolResult, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AgentStatus } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { describeWaitCall, describeWaitResult, renderWaitCall, renderWaitResult } from "../cards/tool-cards";
import type { WaitOutcome } from "./wait-for-claim";   // K11 — declared once, there
export const WAIT_FOR_AGENT_NAME = "wait_for_agent";
export const WAIT_FOR_AGENT_DESCRIPTION: string = `Block until another AGENT changes status or
leaves. Use this when you must wait on a peer agent's state (e.g. a worker finishing), NOT for room
traffic (use wait_for_message) and NOT for a resource (use wait_for_claim). Bounded by timeout
(default 30 s, max 30 min); returns outcome "event" | "timeout" | "aborted". Enumerate the agents you
are waiting on explicitly. The native wait tool's "NEVER wait on other agents" guidance applies to
that tool's own async jobs — this tool is the supported way to block on a peer, and it does not
poll.`;   // K16 — §4.0.1 verbatim
export const WAIT_DEFAULT_TIMEOUT_MS = 30_000;   // §4.2
export const WAIT_MAX_MS = 1_800_000;            // §4.2 = omp WAIT_MAX_MS
export const WAIT_MIN_MS = 1_000;
export const WAIT_HEARTBEAT_MS = 500;            // §4.2 [invented]

export interface WaitForAgentParams {            // SCAFFOLD-DEFINED (derived from §4.2; K13)
  agents: string[];
  timeout?: number;
  require?: "any" | "all";
}

// K1 — the payload lives in `details`, never as a bare top-level `{ outcome }`.
export interface WaitForAgentDetails {
  ok: true;
  outcome: WaitOutcome;
  agents: Array<{ id: string; status: AgentStatus; activity?: string }>;
}
export type WaitForAgentResult = AgentToolResult<WaitForAgentDetails>;

export function registerWaitForAgent(pi: ExtensionAPI): void {
  throw new Error("not implemented");
}
