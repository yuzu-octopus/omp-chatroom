import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import { safeRoomText } from "../onboarding/escape";
import {
  type ClaimState,
  dequeueWaiter,
  enqueueWaiter,
  requeueWaiter,
  resolveWaiters,
} from "../store/claims";
import { resolveRoomConfig } from "../store/config";
import { type RoomStore, roomStoreFor } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import { clearWaitEdges, findWaitCycle, setWaitEdges } from "../store/wait-graph";
import { viewerFor } from "../tools/room";

export const WAIT_FOR_CLAIM_NAME = "wait_for_claim";
export const WAIT_FOR_CLAIM_DESCRIPTION: string = `Block until you acquire the CLAIM on
"<topic>/<key>", or time out. When the holder releases, is reclaimed, or its TTL expires, the oldest
waiter is resolved AND granted the lease. Use this when a peer holds a resource you need. Timeout is
a normal outcome (acquired:false), not an error. Optional maxWaitMs bounds the wait.`;
export const CLAIM_WAIT_DEFAULT_TIMEOUT_MS = 20_000; // §4.4 = SQS max long poll
export const CLAIM_WAIT_MIN_MS = 1_000;
export const CLAIM_WAIT_MAX_MS = 300_000;

// K11 — WaitOutcome is declared ONCE, here; imported by schema (types), tiers, governor, delivery.
export type WaitOutcome = "event" | "timeout" | "aborted";

export interface WaitForClaimParams {
  // SCAFFOLD-DEFINED (derived from §4.4; K13)
  resource: string;
  timeout?: number;
  ttl?: number;
  maxWaitMs?: number;
}

// K1 — payload inside `details`. `ok:false` carries the U6 file-state failures; the tool never throws.
export interface WaitForClaimDetails {
  ok: boolean;
  outcome: WaitOutcome;
  /** R4 — the agents in the wait cycle this wait would have closed. */
  cycle?: string[];
  acquired: boolean;
  claim?: ClaimState;
  error?: string;
}
export type WaitForClaimResult = AgentToolResult<WaitForClaimDetails>;

/** K22/S1 — the resource string reaches the model, so it goes through the shared escaper. */
const safe = safeRoomText;

/** The schema's documented bounds are the contract; this is the one place they are applied. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

function eventResult(resource: string, claim: ClaimState): WaitForClaimResult {
  return {
    content: [
      {
        type: "text",
        text: `wait_for_claim ${safe(resource)} → acquired by ${safe(claim.holder)} (ttl ${claim.ttlMs} ms)`,
      },
    ],
    details: { ok: true, outcome: "event", acquired: true, claim },
  };
}

/** §4.5 — timeout/abort are NORMAL outcomes: `useless:true` so compaction may elide them. */
function timeoutResult(resource: string, timeoutMs: number): WaitForClaimResult {
  return {
    content: [
      {
        type: "text",
        text: `wait_for_claim ${safe(resource)} → timeout after ${timeoutMs}ms (acquired:false)`,
      },
    ],
    details: { ok: true, outcome: "timeout", acquired: false },
    useless: true,
  };
}

function abortResult(resource: string): WaitForClaimResult {
  return {
    content: [{ type: "text", text: `wait_for_claim ${safe(resource)} → aborted` }],
    details: { ok: true, outcome: "aborted", acquired: false },
    useless: true,
  };
}

/**
 * §4.4 — the in-store condition variable, wired to the arbiter's waiter queue.
 * Never throws and always settles (I6): signal, timeout and every promotion path call `finish`.
 */
async function waitForClaim(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  params: WaitForClaimParams,
  signal: AbortSignal | undefined,
): Promise<WaitForClaimResult> {
  // U6 — a missing/unwritable/corrupt room file is a normal result, never a throw.
  let store: RoomStore;
  try {
    store = roomStoreFor(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "room file corrupt";
    return {
      content: [{ type: "text", text: `wait_for_claim ${safe(params.resource)} → ${message}` }],
      details: { ok: false, outcome: "aborted", acquired: false, error: message },
      isError: true,
    };
  }
  const agentId = ctx.agent.id;
  const resource = params.resource;
  const ttlMs = clamp(
    params.ttl ?? resolveRoomConfig(pi, store.root).claimTtlMs,
    CLAIM_WAIT_MIN_MS,
    86_400_000,
  );
  const timeoutMs = clamp(
    params.timeout ?? CLAIM_WAIT_DEFAULT_TIMEOUT_MS,
    CLAIM_WAIT_MIN_MS,
    CLAIM_WAIT_MAX_MS,
  );
  const maxWaitMs =
    params.maxWaitMs === undefined
      ? undefined
      : clamp(params.maxWaitMs, CLAIM_WAIT_MIN_MS, CLAIM_WAIT_MAX_MS);
  const startedAt = Date.now();

  // R5 — a wait that is not recorded cannot be measured: the wait's outcome is the room's only
  // evidence that a blocked agent was blocked rather than idle. The record is T2 (bookkeeping), so
  // it never reaches anyone's context.
  const recordWait = (outcome: WaitOutcome): void => {
    store.append({
      kind: "wait",
      from: agentId,
      waited: "claim",
      target: resource,
      outcome,
      enqueuedAt: startedAt,
    });
  };

  if (signal?.aborted) {
    recordWait("aborted");
    return abortResult(resource);
  }

  // Fast path: this agent already holds the lease — waiting would be a no-op.
  const held = store.claims.get(resource);
  if (held?.holder === agentId) {
    recordWait("event");
    return eventResult(resource, held);
  }
  // R4 — refuse a wait that would close a cycle. A cycle is a deadlock: every agent in it waits
  // for something another one of them holds, so nothing unblocks it and nothing says so — the
  // swarm burns the full wait timeout with every agent reporting "running".
  const cycle = findWaitCycle(
    store.root,
    agentId,
    [{ kind: "resource", resource }],
    (r) => store.claims.get(r)?.holder,
  );
  if (cycle !== null) {
    recordWait("aborted");
    return {
      content: [
        {
          type: "text",
          text: `wait_for_claim ${safe(resource)} → refused: wait cycle ${cycle.join(" → ")}`,
        },
      ],
      details: {
        ok: false,
        outcome: "aborted",
        acquired: false,
        error: `wait cycle: ${cycle.join(" → ")}`,
        cycle,
      },
      isError: true,
    };
  }
  // M-8 — mark this agent as waiting on the resource so classify returns T1 for claim/release.
  const viewer = viewerFor(store, agentId);
  viewer.waitedResource = resource;

  let settle!: (result: WaitForClaimResult) => void;
  const done = new Promise<WaitForClaimResult>((resolve) => {
    settle = resolve;
  });
  let finished = false;
  const finish = (result: WaitForClaimResult): void => {
    if (finished) return;
    finished = true;
    recordWait(result.details?.outcome ?? "aborted");
    settle(result);
  };

  // The arbiter appends the `claim` record BEFORE it updates `store.claims`, so this listener must
  // never read that map mid-append — the granted record is the authoritative signal.
  const listener = (record: RoomRecord): void => {
    if (record.kind !== "claim" && record.kind !== "release") return;
    if (record.resource !== resource) return;
    if (record.kind === "claim") {
      if (record.from === agentId) {
        finish(
          eventResult(resource, {
            resource,
            holder: agentId,
            ttlMs: record.ttlMs,
            acquiredAt: record.ts,
            seq: record.seq,
            gen: record.gen ?? store.claims.get(resource)?.gen ?? 1,
          }),
        );
        return;
      }
      // A foreign claim won the race: stay queued and keep waiting — never `acquired:false` (§4.4).
      requeueWaiter(store, resource, agentId);
      if (maxWaitMs !== undefined && Date.now() - startedAt > maxWaitMs)
        finish(timeoutResult(resource, timeoutMs));
    }
  };

  const unsubscribe = store.addListener(listener);
  const timer = ctx.setTimeout(() => finish(timeoutResult(resource, timeoutMs)), timeoutMs);
  const onAbort = (): void => finish(abortResult(resource));
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // Queue first, then let the arbiter promote us when the resource is free (FIFO).
    enqueueWaiter(store, resource, agentId);
    // R4 — the wait edge goes in as the wait starts, so another agent's wait can see it.
    setWaitEdges(store.root, agentId, [{ kind: "resource", resource }]);
    const granted = resolveWaiters(store, resource, ttlMs);
    if (granted?.holder === agentId) finish(eventResult(resource, granted));
    return await done;
  } finally {
    clearWaitEdges(store.root, agentId);
    unsubscribe();
    dequeueWaiter(store, resource, agentId);
    ctx.clearTimer(timer);
    signal?.removeEventListener("abort", onAbort);
    viewer.waitedResource = undefined;
  }
}

export function registerWaitForClaim(pi: ExtensionAPI): void {
  const z = pi.zod;
  const params = z.object({
    resource: z.string().describe('the claim to acquire, as "<topic>/<key>"'),
    timeout: z.number().optional().describe("ms to wait; default 20000, min 1000, max 300000"),
    ttl: z
      .number()
      .optional()
      .describe("lease ms granted if the claim is free; default from room config"),
    maxWaitMs: z
      .number()
      .optional()
      .describe("livelock guard: bound the total wait even if requeued"),
  });

  const tool = {
    name: WAIT_FOR_CLAIM_NAME,
    label: "Wait for claim",
    description: WAIT_FOR_CLAIM_DESCRIPTION,
    parameters: params,
    loadMode: "essential",
    approval: "read",
    strict: true,
    // R9 — not in the typed ToolDefinition; declared on the literal, and the wait never relies on it
    // for correctness (it observes `signal` and bounds its own timeout).
    interruptible: false,
    async execute(
      _toolCallId: string,
      p: WaitForClaimParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<WaitForClaimDetails> | undefined,
      ctx: ExtensionContext,
    ): Promise<WaitForClaimResult> {
      return await waitForClaim(pi, ctx, p, signal);
    },
  } satisfies ToolDefinition<typeof params, WaitForClaimDetails> & { interruptible: boolean };

  pi.registerTool(tool);
}
