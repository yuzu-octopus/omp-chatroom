import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
} from "@oh-my-pi/pi-coding-agent";
import { deliver } from "../attention/delivery";
import { resetTurnBudget } from "../attention/governor";
import {
  bumpCursor,
  cursorFor,
  initCursor,
  persistOwnCursor,
  restoreOwnCursor,
} from "../store/cursors";
import { roomRootFor } from "../store/room-root";
import {
  disposeRoomSession,
  type MemberState,
  type RoomStore,
  registerSweepNotifier,
  roomStoreFor,
  unregisterSweepNotifier,
} from "../store/room-store";
import { buildDigest } from "./digest";
import rule from "./routing-rule.md" with { type: "text" };

// The static block is appended to the system prompt every turn, so a prior injection is detected by
// the routing rule's heading — a stable string owned by this file, never by room content.
const RULE_HEADING = "## Room vs direct message — routing rule";

// F10 — the digest's custom-message type. The digest is volatile (roster/lag/claims change every
// turn), so it MUST NOT live in the system prompt: spec §3.3 caches tools + system prompt across
// every call, and §6 puts per-turn state after the view. `before_agent_start`'s `message` field is
// the host's non-system-prompt injection point; the static routing rule stays in the system prompt.
export const DIGEST_MESSAGE_TYPE = "room:digest";

export function registerHooks(pi: ExtensionAPI): void {
  // §2.1.1
  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx): BeforeAgentStartEventResult => {
    // §3.3 — the SYSTEM PROMPT holds only the static routing rule, so it is byte-identical every
    // turn and stays in the prompt cache. Idempotent per agent: a prior injection is REPLACED,
    // never appended twice. The rule is injected FIRST and unconditionally: a broken room must
    // never cost the turn its instructions, only its digest.
    const systemPrompt = event.systemPrompt.slice();
    const injected = systemPrompt.findIndex((part) => part.includes(RULE_HEADING));
    if (injected >= 0) systemPrompt[injected] = rule;
    else systemPrompt.push(rule);

    // The room can be unavailable (unwritable or corrupt log). That is a degraded turn, not a
    // failed one: the agent keeps the routing rule and loses only the digest.
    let store: RoomStore;
    try {
      store = roomStoreFor(ctx);
    } catch (error) {
      // F7 — the degradation must not be SILENT: an agent that cannot see the room behaves as if
      // it were alone in it, so the failure is logged with the error that caused it.
      pi.logger.warn(
        `omp-agent-chatroom: room unavailable for ${ctx.agent.id}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return { systemPrompt };
    }
    const agentId = ctx.agent.id;
    initCursor(store, agentId);
    // K3 — the sweep's promised T0 notice. The sweep lives in the store layer (which cannot
    // import delivery), so the main session registers the notifier that delivers it. Only the
    // main session runs the sweep (R11/R28), so only the main session registers.
    if (ctx.agent.kind === "main") {
      registerSweepNotifier(store.root, async (expired) => {
        for (const claim of expired) {
          // F4 — each expiry is delivered on its own: ONE dead target (a disposed session, a
          // transport rejection) must not swallow the rest of the batch, and the rejection must
          // never escape the notifier (the sweep timer would see an unhandled rejection).
          try {
            await deliver(pi, ctx, claim.prev, claim.record, "T0");
          } catch (error) {
            pi.logger.warn(
              `omp-agent-chatroom: expiry notice to ${claim.prev} failed: ` +
                `${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      });
    }
    // §3.5 — resume from the persisted cursor when it is higher than the fresh init.
    const persisted = restoreOwnCursor(ctx, store.roomId);
    if (persisted !== null && persisted > cursorFor(store, agentId)) {
      bumpCursor(store, agentId, persisted);
    }
    const viewer: MemberState = store.members.get(agentId) ?? {
      agentId,
      joinedAtSeq: store.seq,
      topics: new Set<string>(),
      muted: new Set<string>(),
      threadRoots: new Set<string>(),
      heldTopics: new Set<string>(),
    };

    // §6 — the volatile digest is per-turn state: it rides the turn's message, after the cached
    // prefix, never the system prompt.
    const message = {
      customType: DIGEST_MESSAGE_TYPE,
      content: buildDigest(store, viewer),
      display: false,
    };

    persistOwnCursor(pi, store.roomId, cursorFor(store, agentId));
    return { systemPrompt, message };
  });

  // I1/I5/R12 — mutations are synchronous, so shutdown only unsubscribes and drops this session's
  // ref. `disposeRoomSession` is idempotent per agent; the last session closes the log fd (K8) and
  // evicts the root (K9). Calling `store.dispose()` here instead would decrement twice.
  pi.on("session_shutdown", (_event, ctx) => {
    // F4 — a dead session's notifier must not fire later: the sweep would deliver the T0 notice
    // through a disposed session. Only the main session registers one, so only it unregisters.
    if (ctx.agent.kind === "main") unregisterSweepNotifier(roomRootFor(ctx));
    disposeRoomSession(ctx);
  });

  // §5.2 K/B are PER TURN: refill the agent's injection/read budget at the turn boundary.
  pi.on("turn_start", (_event, ctx) => {
    try {
      resetTurnBudget(roomStoreFor(ctx), ctx.agent.id);
    } catch {
      // A broken room simply carries no budget over to the next turn.
    }
  });
}
