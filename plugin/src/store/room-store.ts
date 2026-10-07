import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot, type LocalProtocolOptions }
  from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { logPathFor, roomIdFor, newMessageId } from "../ids";
import { appendLine, openRoomLog, readSince, replay, closeRoomLog } from "./log";
import { expireStale, hydrateClaims, resolveWaiters, type ClaimState } from "./claims";
import type { RoomRecord, RoomRecordDraft } from "./schema";
// K11 — MemberState is declared ONCE, here (the store owns it); imported by tiers, governor,
// digest, chat-pane, delivery.
export interface MemberState {
  agentId: string;
  joinedAtSeq: number;
  topics: Set<string>;          // followed topics
  muted: Set<string>;           // muted topics; the sentinel "" means whole-room mute (§5.2)
  threadRoots: Set<string>;     // thread roots this agent posted in (§5.1 N1)
  heldTopics: Set<string>;      // topics with a claim held within 1 h (§5.1 N1)
  lastMessageId?: string;       // the agent's most recent msg id (replyTo → T0)
  waitedResource?: string;      // active wait_for_claim resource (§5.1 M-8 → T1)
}

// §3.1 — verbatim fields, plus the K8/K9/K10/K15 members.
export interface RoomStore {
  root: string;                 // absolute local:// root (§3.3)
  roomId: string;               // K7/X1 — from resolveRoomId(root) (§14); root-stable, never a session id
  logPath: string;              // logPathFor(root, roomId) — §2.1.2 (K14)
  treePath: string;             // <root>/room/tree/ (§3.6)
  records: RoomRecord[];
  byId: Map<string, RoomRecord>;
  claims: Map<string, ClaimState>;
  cursors: Map<string, number>;
  members: Map<string, MemberState>;
  listeners: Set<(r: RoomRecord) => void>;
  seq: number;

  // K15 — the ONLY write path: mint seq/ts/v/id, append the line, project, notify listeners.
  // Without it every writer module would import this module at runtime and close a cycle.
  append(draft: RoomRecordDraft): RoomRecord;

  // K10 — every subscriber MUST call the returned unsubscribe in its finally/dispose.
  addListener(fn: (r: RoomRecord) => void): () => void;
  removeListener(fn: (r: RoomRecord) => void): void;

  // K9 — refcount--. When the root's count reaches zero this closes the fd (K8) and evicts the root.
  dispose(): void;

  reset(): void;                // test seam (§2.1.1) — never evicts the registry entry
}

export interface RoomStoreOptions { root: string; roomId: string }   // [invented]

// K9 — the globalThis-anchored registry, keyed by the absolute root; create-on-first-use. [invented]
export function storeFor(root: string, roomId: string): RoomStore {              // [invented]
  throw new Error("not implemented");
}
export function roomStoreFor(ctx: ExtensionContext): RoomStore {                 // [invented] R10
  throw new Error("not implemented");
}
export function resetRoomStores(): void {                                        // [invented] __roomTest
  throw new Error("not implemented");
}

// §3.6 S5 pruning job — in-memory records array ONLY; the JSONL file is never truncated (K19).
export const LOG_MAX_RECORDS = 5_000;
export const LOG_MAX_AGE_MS = 604_800_000;
export const PRUNE_INTERVAL_MS = 60_000;       // [invented]
export function enforceRetention(store: RoomStore, now: number): RoomRecord | null {
  throw new Error("not implemented");
}
export function startPruneJob(store: RoomStore, ctx: ExtensionContext): void {   // [invented placement]
  throw new Error("not implemented");
}

// K3 — the third refcounted ctx.setInterval job: expireStale → release{reason:"expired"} →
// promote the oldest waiter → T0 notice. The ONLY producer of release{reason:"expired"}.
export const CLAIM_SWEEP_INTERVAL_MS = 5_000;  // [invented] [calibrate]
export function startClaimSweep(store: RoomStore, ctx: ExtensionContext): void {  // [invented]
  throw new Error("not implemented");
}

// [invented] — the refcounted timer registry (I4/R11/R28). One entry per root; the tick runs in the
// main session only and is cleared when the last live session disposes.
export interface RoomTimerRegistry {
  start(root: string, ctx: ExtensionContext): void;
  stop(root: string): void;
}
export const roomTimers: RoomTimerRegistry = {
  start(): void { throw new Error("not implemented"); },
  stop(): void { throw new Error("not implemented"); },
};

// K3 — the claim-expiry sweep as a named lifecycle object, so the three jobs (sweep, prune,
// compactor) are symmetric and the timer registry can drive them from one place.
export interface ClaimSweeper {                                          // [invented]
  start(store: RoomStore, ctx: ExtensionContext): void;
  stop(root: string): void;
}
export const claimSweeper: ClaimSweeper = {                              // [invented]
  start(): void { throw new Error("not implemented"); },
  stop(): void { throw new Error("not implemented"); },
};
