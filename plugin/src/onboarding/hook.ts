import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
} from "@oh-my-pi/pi-coding-agent";
import { resetTurnBudget } from "../attention/governor";
import {
  bumpCursor,
  cursorFor,
  initCursor,
  persistOwnCursor,
  restoreOwnCursor,
} from "../store/cursors";
import {
  disposeRoomSession,
  type MemberState,
  type RoomStore,
  roomStoreFor,
} from "../store/room-store";
import { buildDigest } from "./digest";
import rule from "./routing-rule.md" with { type: "text" };

// The block is appended to the system prompt every turn, so a prior injection is detected by the
// routing rule's heading — a stable string owned by this file, never by room content.
const RULE_HEADING = "## Room vs direct message — routing rule";

// K5 — digest first, routing rule AFTER it. The rule is a separate block, so the digest budget
// (which buildDigest already enforced) never counts it.
export function buildPromptBlock(digest: string): string {
  return `${digest}\n\n${rule}`;
}

export function registerHooks(pi: ExtensionAPI): void {
  // §2.1.1
  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx): BeforeAgentStartEventResult => {
    const store: RoomStore = roomStoreFor(ctx);
    const agentId = ctx.agent.id;
    initCursor(store, agentId);
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
    const block = buildPromptBlock(buildDigest(store, viewer));

    // Idempotent per agent: a prior injection is REPLACED, never appended twice.
    const systemPrompt = event.systemPrompt.slice();
    const injected = systemPrompt.findIndex((part) => part.includes(RULE_HEADING));
    if (injected >= 0) systemPrompt[injected] = block;
    else systemPrompt.push(block);

    persistOwnCursor(pi, store.roomId, cursorFor(store, agentId));
    return { systemPrompt };
  });

  // I1/I5/R12 — mutations are synchronous, so shutdown only unsubscribes and drops this session's
  // ref. `disposeRoomSession` is idempotent per agent; the last session closes the log fd (K8) and
  // evicts the root (K9). Calling `store.dispose()` here instead would decrement twice.
  pi.on("session_shutdown", (_event, ctx) => {
    disposeRoomSession(ctx);
  });

  // §5.2 K/B are PER TURN: refill the agent's injection/read budget at the turn boundary.
  pi.on("turn_start", (_event, ctx) => {
    resetTurnBudget(roomStoreFor(ctx), ctx.agent.id);
  });
}
