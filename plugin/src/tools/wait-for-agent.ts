import {
  AgentRegistry,
  type AgentToolResult,
  type AgentToolUpdateCallback,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import type { AgentStatus } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import {
  describeWaitCall,
  describeWaitResult,
  renderWaitCall,
  renderWaitResult,
} from "../cards/tool-cards";
import { type RoomStore, roomStoreFor } from "../store/room-store";
import { clearWaitEdges, findWaitCycle, setWaitEdges } from "../store/wait-graph";
import type { WaitOutcome } from "./wait-for-claim"; // K11 — declared once, there

export const WAIT_FOR_AGENT_NAME = "wait_for_agent";
export const WAIT_FOR_AGENT_DESCRIPTION: string = `Block until another AGENT changes status or
leaves. Use this when you must wait on a peer agent's state (e.g. a worker finishing), NOT for room
traffic (use wait_for_message) and NOT for a resource (use wait_for_claim). Bounded by timeout
(default 30 s, max 30 min); returns outcome "event" | "timeout" | "aborted". Enumerate the agents you
are waiting on explicitly. The native wait tool's "NEVER wait on other agents" guidance applies to
that tool's own async jobs — this tool is the supported way to block on a peer, and it does not
poll.`; // K16 — §4.0.1 verbatim
export const WAIT_DEFAULT_TIMEOUT_MS = 30_000; // §4.2
export const WAIT_MAX_MS = 1_800_000; // §4.2 = omp WAIT_MAX_MS
export const WAIT_MIN_MS = 1_000;
export const WAIT_HEARTBEAT_MS = 500; // §4.2 [invented]

export interface WaitForAgentParams {
  // SCAFFOLD-DEFINED (derived from §4.2; K13)
  agents: string[];
  timeout?: number;
  require?: "any" | "all";
}

// K1 — the payload lives in `details`, never as a bare top-level `{ outcome }`.
export interface WaitForAgentDetails {
  ok: boolean;
  outcome: WaitOutcome;
  /** R4 — the agents in the wait cycle this wait would have closed. */
  cycle?: string[];
  agents: Array<{ id: string; status: AgentStatus; activity?: string }>;
  error?: string;
}
export type WaitForAgentResult = AgentToolResult<WaitForAgentDetails>;

/** K22/S1 — every room-authored / caller-supplied string reaching the model is sanitised. */
const safe = (text: string): string => escapeHarnessTags(sanitizeText(text));

/** The schema's documented bounds are the contract; this is the one place they are applied. */
const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.trunc(value)));

/** A snapshot row per named agent; an unregistered id reports `parked` (it is gone, not running). */
function snapshot(registry: AgentRegistry, ids: readonly string[]): WaitForAgentDetails["agents"] {
  return ids.map((id) => {
    const ref = registry.get(id);
    return ref === undefined
      ? { id, status: "parked" as AgentStatus }
      : {
          id,
          status: ref.status,
          ...(ref.activity === undefined ? {} : { activity: ref.activity }),
        };
  });
}

function timeoutResult(
  agents: WaitForAgentDetails["agents"],
  timeoutMs: number,
): WaitForAgentResult {
  const names = agents.map((agent) => safe(agent.id)).join(", ");
  return {
    content: [
      {
        type: "text",
        text: `wait_for_agent [${names}] → timeout after ${timeoutMs}ms (no status change)`,
      },
    ],
    details: { ok: true, outcome: "timeout", agents },
    useless: true, // §4.5 — compaction may elide a non-event
  };
}

function abortResult(agents: WaitForAgentDetails["agents"]): WaitForAgentResult {
  const names = agents.map((agent) => safe(agent.id)).join(", ");
  return {
    content: [{ type: "text", text: `wait_for_agent [${names}] → aborted` }],
    details: { ok: true, outcome: "aborted", agents },
    useless: true,
  };
}

/**
 * §4.2 — block until the named agents change status or leave. `agents` is REQUIRED and is never
 * widened to "everyone": an omitted list was the footgun finding, so a missing/empty list is a
 * normal `ok:false` result, not a broadcast.
 *
 * Never throws and always settles (I6): the registry unsubscribe, the timeout timer and the abort
 * listener are all released in `finally`.
 */
async function waitForAgent(
  ctx: ExtensionContext,
  params: WaitForAgentParams,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<WaitForAgentDetails> | undefined,
): Promise<WaitForAgentResult> {
  const ids = Array.isArray(params.agents)
    ? params.agents.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  if (ids.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "wait_for_agent → `agents` is required: name the peer agents to wait on",
        },
      ],
      details: { ok: false, outcome: "aborted", agents: [], error: "agents is required" },
    };
  }

  const registry = AgentRegistry.global();
  const timeoutMs = clamp(params.timeout ?? WAIT_DEFAULT_TIMEOUT_MS, WAIT_MIN_MS, WAIT_MAX_MS);
  const require = params.require ?? "any";
  const startedAt = Date.now();
  const agentId = ctx.agent.id;

  // R5 — a wait that is not recorded cannot be measured: the wait's outcome is the room's only
  // evidence that a blocked agent was blocked rather than idle. This tool waits on the PROCESS's
  // agent registry, not on the room, so the room is opened best-effort: if it cannot be opened the
  // wait still works, it is just not recorded.
  let store: RoomStore | undefined;
  try {
    store = roomStoreFor(ctx);
  } catch {
    store = undefined;
  }
  const recordWait = (outcome: WaitOutcome): void => {
    store?.append({
      kind: "wait",
      from: agentId,
      waited: "agent",
      target: ids.join(","),
      outcome,
      enqueuedAt: startedAt,
    });
  };

  if (signal?.aborted) {
    recordWait("aborted");
    return abortResult(snapshot(registry, ids));
  }

  // R4 — refuse a wait that would close a cycle. A cycle can span mechanisms: an agent waiting
  // for a claim while another waits for a message from the first is just as deadlocked as two
  // agents waiting for each other's claims, and a per-mechanism check would miss it.
  const cycle =
    store === undefined
      ? null
      : findWaitCycle(
          store.root,
          agentId,
          ids.map((id) => ({ kind: "agent", agentId: id }) as const),
          (resource) => store!.claims.get(resource)?.holder,
        );
  if (cycle !== null) {
    recordWait("aborted");
    return {
      content: [
        {
          type: "text",
          text: `wait_for_agent → refused: wait cycle ${cycle.join(" → ")}`,
        },
      ],
      details: {
        ok: false,
        outcome: "aborted",
        agents: [],
        error: `wait cycle: ${cycle.join(" → ")}`,
        cycle,
      },
      isError: true,
    };
  }

  let settle!: (result: WaitForAgentResult) => void;
  const done = new Promise<WaitForAgentResult>((resolve) => {
    settle = resolve;
  });
  let finished = false;
  const finish = (result: WaitForAgentResult): void => {
    if (finished) return;
    finished = true;
    recordWait(result.details?.outcome ?? "aborted");
    settle(result);
  };

  // §4.2 — "block until a named agent changes status or leaves". The baseline is the status at
  // wait start, so an id that was never registered (or was already idle) is NOT an instant event:
  // `require:"any"` resolves on the first named agent whose status differs from its baseline (or
  // that disappears), `"all"` when every named agent has.
  const baseline = new Map(ids.map((id) => [id, registry.get(id)?.status]));
  const changed = (id: string): boolean => registry.get(id)?.status !== baseline.get(id);
  const satisfied = (): boolean => (require === "all" ? ids.every(changed) : ids.some(changed));

  // R4 — the wait edge goes in as the wait starts, so another agent's wait can see it.
  if (store !== undefined) {
    setWaitEdges(
      store.root,
      agentId,
      ids.map((id) => ({ kind: "agent", agentId: id }) as const),
    );
  }

  const unsubscribe = registry.onChange((event) => {
    if (event.type !== "status_changed" && event.type !== "removed") return;
    if (!ids.includes(event.ref.id)) return;
    if (satisfied()) finish(eventResult(registry, ids, startedAt));
  });
  const timer = ctx.setTimeout(
    () => finish(timeoutResult(snapshot(registry, ids), timeoutMs)),
    timeoutMs,
  );
  const onAbort = (): void => finish(abortResult(snapshot(registry, ids)));
  signal?.addEventListener("abort", onAbort, { once: true });

  // U5 heartbeat — the TUI repaints "Waiting for … (elapsed Ns)" without the tool resolving.
  const heartbeat = onUpdate
    ? ctx.setInterval(() => {
        onUpdate({
          content: [
            {
              type: "text",
              text: `wait_for_agent → waiting ${Math.round((Date.now() - startedAt) / 1000)}s`,
            },
          ],
          details: { ok: true, outcome: "timeout", agents: snapshot(registry, ids) },
        });
      }, WAIT_HEARTBEAT_MS)
    : undefined;

  try {
    // The event may have fired between the caller's decision and the subscription; the state
    // check closes that race so a wait can never hang on an already-satisfied condition.
    if (satisfied()) finish(eventResult(registry, ids, startedAt));
    return await done;
  } finally {
    if (store !== undefined) clearWaitEdges(store.root, agentId);
    unsubscribe();
    ctx.clearTimer(timer);
    if (heartbeat !== undefined) ctx.clearTimer(heartbeat);
    signal?.removeEventListener("abort", onAbort);
  }
}

function eventResult(
  registry: AgentRegistry,
  ids: readonly string[],
  startedAt: number,
): WaitForAgentResult {
  const agents = snapshot(registry, ids);
  const summary = agents.map((agent) => `${safe(agent.id)}:${agent.status}`).join(", ");
  return {
    content: [
      {
        type: "text",
        text: `wait_for_agent [${summary}] → event after ${Date.now() - startedAt}ms`,
      },
    ],
    details: { ok: true, outcome: "event", agents },
  };
}

export function registerWaitForAgent(pi: ExtensionAPI): void {
  const z = pi.zod;
  const params = z.object({
    agents: z
      .array(z.string())
      .describe("REQUIRED — the peer agent ids to wait on, enumerated explicitly"),
    timeout: z.number().optional().describe("ms to wait; default 30000, min 1000, max 1800000"),
    require: z
      .enum(["any", "all"])
      .optional()
      .describe('wait for the first named agent to leave "running", or all of them'),
  });

  const tool = {
    name: WAIT_FOR_AGENT_NAME,
    label: "Wait for agent",
    description: WAIT_FOR_AGENT_DESCRIPTION,
    parameters: params,
    loadMode: "essential",
    approval: "read",
    strict: true,
    // R9 — not in the typed ToolDefinition; declared on the literal, and the wait never relies on it
    // for correctness (it observes `signal` and bounds its own timeout).
    interruptible: true,
    async execute(
      _toolCallId: string,
      p: WaitForAgentParams,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<WaitForAgentDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<WaitForAgentResult> {
      return await waitForAgent(ctx, p, signal, onUpdate);
    },
    renderCall: renderWaitCall,
    renderResult: renderWaitResult,
    describeCall: describeWaitCall,
    describeResult: describeWaitResult,
  } satisfies ToolDefinition<typeof params, WaitForAgentDetails> & { interruptible: boolean };

  pi.registerTool(tool);
}
