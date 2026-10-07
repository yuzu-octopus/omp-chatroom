import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import rule from "./routing-rule.md" with { type: "text" };
import { buildDigest } from "./digest";
import { roomStoreFor, type MemberState, type RoomStore } from "../store/room-store";
import { cursorFor, initCursor, persistOwnCursor } from "../store/cursors";
export const HOOK_CURSOR_ENTRY_TYPE = "chatroom:cursor";    // §3.5

// The block is appended to the system prompt every turn, so a prior injection is detected by the
// routing rule's heading — a stable string owned by this file, never by room content.
const RULE_HEADING = "## Room vs direct message — routing rule";

// K5 — digest first, routing rule AFTER it. The rule is a separate block, so the digest budget
// (which buildDigest already enforced) never counts it.
export function buildPromptBlock(digest: string): string {
  return `${digest}\n\n${rule}`;
}

export function registerHooks(pi: ExtensionAPI): void {      // §2.1.1
  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx): BeforeAgentStartEventResult => {
    const store: RoomStore = roomStoreFor(ctx);
    const agentId = ctx.agent.id;
    initCursor(store, agentId);
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
    const injected = systemPrompt.findIndex(part => part.includes(RULE_HEADING));
    if (injected >= 0) systemPrompt[injected] = block;
    else systemPrompt.push(block);

    persistOwnCursor(pi, store.roomId, cursorFor(store, agentId));
    return { systemPrompt };
  });

  // I1/I5/R12 — mutations are synchronous, so shutdown only unsubscribes and drops the session's
  // refcount. `dispose()` closes the log fd + evicts the root once the last session leaves (K8/K9).
  pi.on("session_shutdown", (_event, ctx) => {
    roomStoreFor(ctx).dispose();
  });
}
