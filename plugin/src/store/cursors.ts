import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { RoomStore } from "./room-store";
export const JOIN_BACKLOG = 50;                       // §3.5 "starts at logEnd - 50"

export function initCursor(store: RoomStore, agentId: string): number {   // [invented]
  throw new Error("not implemented");
}
export function cursorFor(store: RoomStore, agentId: string): number {
  throw new Error("not implemented");
}
export function bumpCursor(store: RoomStore, agentId: string, seq: number): void {   // §5.3 uses this
  throw new Error("not implemented");
}
export function lagFor(store: RoomStore, agentId: string): number {       // logEnd - cursor
  throw new Error("not implemented");
}

// §3.5 — the session's own cursor survives resume via pi.appendEntry("chatroom:cursor", …)
export function persistOwnCursor(pi: ExtensionAPI, roomId: string, seq: number): void {
  throw new Error("not implemented");
}
export function restoreOwnCursor(ctx: ExtensionContext, roomId: string): number | null {  // [invented]
  throw new Error("not implemented");
}
