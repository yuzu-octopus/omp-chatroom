import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import {
  describeWaitCall,
  describeWaitResult,
  renderWaitCall,
  renderWaitResult,
} from "../cards/tool-cards";
import { safeRoomText } from "../onboarding/escape";
import { type RoomStore, roomStoreFor } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import {
  WAIT_DEFAULT_TIMEOUT_MS,
  WAIT_HEARTBEAT_MS,
  WAIT_MAX_MS,
  WAIT_MIN_MS,
} from "./wait-for-agent";
import type { WaitOutcome } from "./wait-for-claim"; // K11 — declared once, there

export const WAIT_FOR_MESSAGE_NAME = "wait_for_message";
export const WAIT_FOR_MESSAGE_DESCRIPTION: string = `Block until a new ROOM MESSAGE arrives that
matches your filter (from a given agent, or any message that mentions you). Use this when you are
waiting on room traffic; use wait_for_agent for a peer's status change and wait_for_claim for a
resource lease. Bounded by timeout (default 30 s, max 30 min); returns outcome "event" | "timeout" |
"aborted" plus the matched record. Prefer this over repeatedly calling room{op:"read"}.`; // K16 — §4.0.1 verbatim

export interface WaitForMessageParams {
  // SCAFFOLD-DEFINED (derived from §4.3; K13)
  from?: string;
  mention?: boolean;
  source?: "room";
  timeout?: number;
}

// K1 — payload inside `details`; `useless:true` sits on the result, not in `details`.
export interface WaitForMessageDetails {
  ok: boolean;
  outcome: WaitOutcome;
  message?: RoomRecord;
  error?: string;
}
export type WaitForMessageResult = AgentToolResult<WaitForMessageDetails>;

/** K22/S1 — caller-supplied strings and room bodies both reach the model; both are sanitised. */
const safe = safeRoomText;

/** The schema's documented bounds are the contract; this is the one place they are applied. */
const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.trunc(value)));

/** A one-line model-facing rendering of the matched record (kind-first; only msg/note carry `body`). */
function describeMatch(record: RoomRecord): string {
  switch (record.kind) {
    case "msg":
    case "note":
      return `${safe(record.from)} · topic:${safe(record.topic)} · "${safe(record.body)}"`;
    case "claim":
      return `${safe(record.from)} claimed ${safe(record.resource)}`;
    case "release":
      return `${safe(record.from)} released ${safe(record.resource)} (${record.reason})`;
    case "member":
      return `${safe(record.from)} ${record.action === "join" ? "joined" : "left"} the room`;
    case "gap":
      return `${record.skipped} record(s) skipped (${record.reason})`;
  }
}

function timeoutResult(timeoutMs: number): WaitForMessageResult {
  return {
    content: [
      {
        type: "text",
        text: `wait_for_message → timeout after ${timeoutMs}ms (no matching room message)`,
      },
    ],
    details: { ok: true, outcome: "timeout" },
    useless: true, // §4.5 — compaction may elide a non-event
  };
}

function abortResult(): WaitForMessageResult {
  return {
    content: [{ type: "text", text: "wait_for_message → aborted" }],
    details: { ok: true, outcome: "aborted" },
    useless: true,
  };
}

/**
 * §4.3 — block until a new room message matching `from`/`mention` arrives. v1 ships only
 * `source:"room"` (U4): the `"irc"` variant consumed from the mailbox and is out of scope (§1.2).
 *
 * Never throws and always settles (I6): the store subscription, the timeout timer and the abort
 * listener are all released in `finally`.
 */
async function waitForMessage(
  ctx: ExtensionContext,
  params: WaitForMessageParams,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<WaitForMessageDetails> | undefined,
): Promise<WaitForMessageResult> {
  if (params.source !== undefined && params.source !== "room") {
    return {
      content: [
        {
          type: "text",
          text: `wait_for_message → unsupported source "${safe(String(params.source))}" (v1 ships "room" only)`,
        },
      ],
      details: {
        ok: false,
        outcome: "aborted",
        error: `unsupported source: ${String(params.source)}`,
      },
    };
  }

  const timeoutMs = clamp(params.timeout ?? WAIT_DEFAULT_TIMEOUT_MS, WAIT_MIN_MS, WAIT_MAX_MS);
  const agentId = ctx.agent.id;
  const wantMention = params.mention === true;
  const from = params.from;

  // U6 — a missing/unwritable/corrupt room file is a normal result, never a throw.
  let store: RoomStore;
  try {
    store = roomStoreFor(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "room file corrupt";
    return {
      content: [{ type: "text", text: `wait_for_message → ${safe(message)}` }],
      details: { ok: false, outcome: "aborted", error: message },
      isError: true,
    };
  }

  if (signal?.aborted) return abortResult();

  let settle!: (result: WaitForMessageResult) => void;
  const done = new Promise<WaitForMessageResult>((resolve) => {
    settle = resolve;
  });
  let finished = false;
  const finish = (result: WaitForMessageResult): void => {
    if (finished) return;
    finished = true;
    settle(result);
  };

  // A message matches on the two filters the params expose: the sender, and "mentions me". With
  // neither filter set, any new `msg` satisfies the wait.
  const matches = (record: RoomRecord): boolean => {
    if (record.kind !== "msg") return false;
    if (from !== undefined && record.from !== from) return false;
    if (wantMention && !record.mention?.includes(agentId)) return false;
    return true;
  };

  const eventResult = (record: RoomRecord): WaitForMessageResult => ({
    content: [{ type: "text", text: `wait_for_message ⟵ ${describeMatch(record)}` }],
    details: { ok: true, outcome: "event", message: record },
  });

  const unsubscribe = store.addListener((record) => {
    if (matches(record)) finish(eventResult(record));
  });
  const timer = ctx.setTimeout(() => finish(timeoutResult(timeoutMs)), timeoutMs);
  const onAbort = (): void => finish(abortResult());
  signal?.addEventListener("abort", onAbort, { once: true });

  // U5 heartbeat — the TUI repaints "Waiting for … (elapsed Ns)" without the tool resolving.
  const startedAt = Date.now();
  const heartbeat = onUpdate
    ? ctx.setInterval(() => {
        onUpdate({
          content: [
            {
              type: "text",
              text: `wait_for_message → waiting ${Math.round((Date.now() - startedAt) / 1000)}s`,
            },
          ],
          details: { ok: true, outcome: "timeout" },
        });
      }, WAIT_HEARTBEAT_MS)
    : undefined;

  try {
    return await done;
  } finally {
    unsubscribe();
    ctx.clearTimer(timer);
    if (heartbeat !== undefined) ctx.clearTimer(heartbeat);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function registerWaitForMessage(pi: ExtensionAPI): void {
  const z = pi.zod;
  const params = z.object({
    from: z.string().optional().describe("only resolve on a message from this agent id"),
    mention: z
      .boolean()
      .optional()
      .describe("only resolve on a message that mentions you (default false)"),
    source: z.enum(["room"]).optional().describe('v1 ships only "room" — the room store listener'),
    timeout: z.number().optional().describe("ms to wait; default 30000, min 1000, max 1800000"),
  });

  const tool = {
    name: WAIT_FOR_MESSAGE_NAME,
    label: "Wait for message",
    description: WAIT_FOR_MESSAGE_DESCRIPTION,
    parameters: params,
    loadMode: "essential",
    approval: "read",
    strict: true,
    // R9 — not in the typed ToolDefinition; declared on the literal, and the wait never relies on it
    // for correctness (it observes `signal` and bounds its own timeout).
    interruptible: true,
    async execute(
      _toolCallId: string,
      p: WaitForMessageParams,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<WaitForMessageDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<WaitForMessageResult> {
      return await waitForMessage(ctx, p, signal, onUpdate);
    },
    renderCall: renderWaitCall,
    renderResult: renderWaitResult,
    describeCall: describeWaitCall,
    describeResult: describeWaitResult,
  } satisfies ToolDefinition<typeof params, WaitForMessageDetails> & { interruptible: boolean };

  pi.registerTool(tool);
}
