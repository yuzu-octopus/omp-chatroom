import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { globalMap } from "../globals";
import type { RoomStore } from "./room-store";
export const JOIN_BACKLOG = 50; // §3.5 "starts at logEnd - 50"
export const OWN_CURSOR_ENTRY_TYPE = "chatroom:cursor"; // §3.5 — must match onboarding/hook.ts

// §3.5 — one monotonic cursor per agent. A joining agent starts at logEnd - 50; a rejoin resumes
// its stored cursor. Advance on DELIVERY only (bumpCursor), never on send or read.
export function initCursor(store: RoomStore, agentId: string): number {
  // [invented]
  const existing = store.cursors.get(agentId);
  if (existing !== undefined) return existing;
  const start = Math.max(0, store.seq - JOIN_BACKLOG);
  store.cursors.set(agentId, start);
  return start;
}

export function cursorFor(store: RoomStore, agentId: string): number {
  return store.cursors.get(agentId) ?? 0;
}

export function bumpCursor(store: RoomStore, agentId: string, seq: number): void {
  // §5.3 uses this
  const current = store.cursors.get(agentId) ?? 0;
  if (seq > current) store.cursors.set(agentId, seq); // monotonic — a cursor never rewinds
}

export function lagFor(store: RoomStore, agentId: string): number {
  // logEnd - cursor
  return Math.max(0, store.seq - cursorFor(store, agentId));
}

// --- what a recipient has ALREADY been given -------------------------------
//
// The cursor is a single scalar, so a T0 delivered while an OLDER record is still owed (a T1 the
// K/B cap refused) cannot advance it: the cursor is pinned below the owed record, and the T0
// stays above the cursor — so the next pass would select it again and re-send it. A T0 is a
// wake+steer: re-sending it is an interrupt storm.
//
// So the delivered T0s are remembered per room root and per recipient, and the pass skips them.
// The registry is bounded (the oldest entries are dropped): it only has to cover the window in
// which a floor holds the cursor back.
const DELIVERED_T0 = globalMap<string, Map<string, Set<number>>>("__roomDeliveredT0");
const DELIVERED_T0_MAX = 256;

export function markDeliveredT0(root: string, agentId: string, seq: number): void {
  let byAgent = DELIVERED_T0.get(root);
  if (byAgent === undefined) {
    byAgent = new Map();
    DELIVERED_T0.set(root, byAgent);
  }
  let seqs = byAgent.get(agentId);
  if (seqs === undefined) {
    seqs = new Set();
    byAgent.set(agentId, seqs);
  }
  seqs.add(seq);
  if (seqs.size > DELIVERED_T0_MAX) {
    // Drop the oldest entries: they are the ones a long-passed floor can no longer revive.
    const oldest = [...seqs].sort((a, b) => a - b).slice(0, seqs.size - DELIVERED_T0_MAX);
    for (const entry of oldest) seqs.delete(entry);
  }
}

/** The T0 seqs this recipient has already been given. */
export function deliveredT0s(root: string, agentId: string): ReadonlySet<number> {
  return DELIVERED_T0.get(root)?.get(agentId) ?? new Set<number>();
}

/** Forget a room's delivered-T0 registry (the room was disposed). */
export function forgetDeliveredT0(root: string): void {
  DELIVERED_T0.delete(root);
}

// §3.5 — the session's own cursor survives resume via pi.appendEntry("chatroom:cursor", …)
export function persistOwnCursor(pi: ExtensionAPI, roomId: string, seq: number): void {
  pi.appendEntry(OWN_CURSOR_ENTRY_TYPE, { roomId, seq });
}

function isCursorData(value: unknown): value is { roomId: string; seq: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "roomId" in value &&
    typeof value.roomId === "string" &&
    "seq" in value &&
    typeof value.seq === "number"
  );
}

export function restoreOwnCursor(ctx: ExtensionContext, roomId: string): number | null {
  // [invented]
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === OWN_CURSOR_ENTRY_TYPE) {
      if (isCursorData(entry.data) && entry.data.roomId === roomId) return entry.data.seq;
    }
  }
  return null;
}
