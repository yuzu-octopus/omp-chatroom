import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import rule from "./routing-rule.md" with { type: "text" };
import { buildDigest } from "./digest";
import { closeRoomLog } from "../store/log";
import { roomStoreFor } from "../store/room-store";
import { initCursor, persistOwnCursor } from "../store/cursors";
export function registerHooks(pi: ExtensionAPI): void {      // §2.1.1
  throw new Error("not implemented");
}
export function buildPromptBlock(): string {                 // digest + routing rule  [invented]
  throw new Error("not implemented");
}
export const HOOK_CURSOR_ENTRY_TYPE = "chatroom:cursor";    // §3.5
