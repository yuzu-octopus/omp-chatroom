import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { RoomStore } from "./room-store";
export const JOIN_BACKLOG = 50;                       // §3.5 "starts at logEnd - 50"
export const OWN_CURSOR_ENTRY_TYPE = "chatroom:cursor";   // §3.5 — must match onboarding/hook.ts

// §3.5 — one monotonic cursor per agent. A joining agent starts at logEnd - 50; a rejoin resumes
// its stored cursor. Advance on DELIVERY only (bumpCursor), never on send or read.
export function initCursor(store: RoomStore, agentId: string): number {   // [invented]
  const existing = store.cursors.get(agentId);
  if (existing !== undefined) return existing;
  const start = Math.max(0, store.seq - JOIN_BACKLOG);
  store.cursors.set(agentId, start);
  return start;
}

export function cursorFor(store: RoomStore, agentId: string): number {
  return store.cursors.get(agentId) ?? 0;
}

export function bumpCursor(store: RoomStore, agentId: string, seq: number): void {   // §5.3 uses this
  const current = store.cursors.get(agentId) ?? 0;
  if (seq > current) store.cursors.set(agentId, seq);   // monotonic — a cursor never rewinds
}

export function lagFor(store: RoomStore, agentId: string): number {       // logEnd - cursor
  return Math.max(0, store.seq - cursorFor(store, agentId));
}

// §3.5 — the session's own cursor survives resume via pi.appendEntry("chatroom:cursor", …)
export function persistOwnCursor(pi: ExtensionAPI, roomId: string, seq: number): void {
  pi.appendEntry(OWN_CURSOR_ENTRY_TYPE, { roomId, seq });
}

function isCursorData(value: unknown): value is { roomId: string; seq: number } {
  return typeof value === "object" && value !== null &&
    "roomId" in value && typeof value.roomId === "string" &&
    "seq" in value && typeof value.seq === "number";
}

export function restoreOwnCursor(ctx: ExtensionContext, roomId: string): number | null {  // [invented]
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === OWN_CURSOR_ENTRY_TYPE) {
      if (isCursorData(entry.data) && entry.data.roomId === roomId) return entry.data.seq;
    }
  }
  return null;
}
