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
// The cursor is a single scalar, so a record delivered while an OLDER record is still owed (a T1
// the K/B cap refused) cannot advance it: the cursor is pinned below the owed record, and the
// given record stays above the cursor — so the next pass would select it again and re-send it. A
// re-sent T0 is a wake+steer storm; a re-selected T1 spends a K/B window slot on a record the
// target already has, until the window admits nothing new.
//
// So the GIVEN seqs are remembered per room root and per recipient, and BOTH consumers consult
// the registry: the pass's selection skips them, and the owed floor skips them too (a given
// record owes nothing, so it must not pin the cursor cap at seq-1 for every later delivery).
//
// A given seq is any record the recipient has been handed — not only a T0:
//   · a delivered T0 (recordDelivery), the wake+steer that must happen once;
//   · an UNCERTAIN send: the bound expired after the message was issued (delivery.ts), so the
//     record is in the target's session or may be, but the cursor must not claim it was read;
//   · a T0 batched into the ceiling's ONE summary interrupt (governor.ts selectT0), so the next
//     pass does not inject all 50+ of them individually.
// `markDeliveredT0` keeps its T0-era name: onboarding/hook.ts and store/room-store.ts call it by
// that name and its busiest caller is still the T0 path — a rename would touch both.
// The registry is bounded (the oldest entries are dropped): it only has to cover the window in
// which a floor holds the cursor back.
const DELIVERED_T0 = globalMap<string, Map<string, Set<number>>>("__roomDeliveredT0");
const DELIVERED_T0_MAX = 256;

/** Remember that `seq` is GIVEN to this recipient (see the section note: not only T0s). */
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
    // Insertion-ordered: the Set iterates oldest-first, so slice the head — no sort needed.
    let drop = seqs.size - DELIVERED_T0_MAX;
    for (const entry of seqs) {
      if (drop <= 0) break;
      seqs.delete(entry);
      drop -= 1;
    }
  }
}

/** The seqs this recipient has already been GIVEN (see the section note: not only T0s). */
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
