import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import {
  type LocalProtocolOptions,
  resolveLocalRoot,
} from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { globalMap } from "../globals";
import { logPathFor, newMessageId } from "../ids";
import { type ClaimState, expireStale, hydrateClaims } from "./claims";
import { startCompactor, stopCompactor } from "./compactor";
import { resolveRoomId } from "./config";
import { appendLine, closeRoomLog, openRoomLog, replay } from "./log";
import type { RoomRecord, RoomRecordDraft } from "./schema";

// K11 — MemberState is declared ONCE, here (the store owns it); imported by tiers, governor,
// digest, chat-pane, delivery.
export interface MemberState {
  agentId: string;
  joinedAtSeq: number;
  topics: Set<string>; // followed topics
  muted: Set<string>; // muted topics; the sentinel "" means whole-room mute (§5.2)
  threadRoots: Set<string>; // thread roots this agent posted in (§5.1 N1)
  heldTopics: Set<string>; // topics with a claim held within 1 h (§5.1 N1)
  lastMessageId?: string; // the agent's most recent msg id (replyTo → T0)
  waitedResource?: string; // active wait_for_claim resource (§5.1 M-8 → T1)
}

// §3.1 — verbatim fields, plus the K8/K9/K10/K15 members.
export interface RoomStore {
  root: string; // absolute local:// root (§3.3)
  roomId: string; // K7/X1 — from resolveRoomId(root) (§14); root-stable, never a session id
  logPath: string; // logPathFor(root, roomId) — §2.1.2 (K14)
  treePath: string; // <root>/room/tree/ (§3.6)
  records: RoomRecord[];
  byId: Map<string, RoomRecord>;
  claims: Map<string, ClaimState>;
  cursors: Map<string, number>;
  members: Map<string, MemberState>;
  // [invented] §4.4 — the in-store condition variable for wait_for_claim: resource → FIFO waiter ids.
  waiters: Map<string, string[]>;
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

  reset(): void; // test seam (§2.1.1) — never evicts the registry entry
}

// K9 — the globalThis-anchored registries, keyed by the absolute root; create-on-first-use. [invented]
const STORES = globalMap<string, RoomStore>("__roomStores");

// One ref per live session, not per call: `storeFor` bumps the root's refcount, `dispose()` drops
// it. `roomStoreFor` is called per operation, so it dedupes on the agent id (one ref per agent) and
// `disposeRoomSession(ctx)` — the session_shutdown hook — drops exactly that ref. The last ref
// closes the fd and evicts the root (K9).
const REFS = globalMap<string, number>("__roomStoreRefs");
const SESSIONS = globalMap<string, Set<string>>("__roomSessions");

function newMember(agentId: string, joinedAtSeq: number): MemberState {
  return {
    agentId,
    joinedAtSeq,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  };
}

// The record projection (K15 "append … projects"): a live `member` record updates the roster map
// and a `claim`/`release` record updates the claim map. Claim state is projected HERE, before
// listeners run, so a listener woken by a promotion sees the grant it is reacting to (claims.ts
// owns the arbiter's rules — TTL/staleness/waiter promotion — not this projection).
function project(store: RoomStore, record: RoomRecord): void {
  if (record.kind === "member") {
    if (record.action === "join") {
      if (!store.members.has(record.from))
        store.members.set(record.from, newMember(record.from, record.seq));
    } else {
      store.members.delete(record.from);
    }
    return;
  }
  if (record.kind === "claim") {
    store.claims.set(record.resource, {
      resource: record.resource,
      holder: record.from,
      ttlMs: record.ttlMs,
      acquiredAt: record.ts,
      seq: record.seq,
    });
  } else if (record.kind === "release") {
    store.claims.delete(record.resource);
  }
}

function createStore(root: string, roomId: string): RoomStore {
  const logPath = logPathFor(root, roomId);
  const opened = openRoomLog(root, roomId);
  if (!opened.ok) throw new Error(opened.error);
  const fd = opened.fd;

  const store: RoomStore = {
    root,
    roomId,
    logPath,
    treePath: `${root}/room/tree/`,
    records: [],
    byId: new Map(),
    claims: new Map(),
    cursors: new Map(),
    members: new Map(),
    waiters: new Map(),
    listeners: new Set(),
    seq: 0,

    append(draft: RoomRecordDraft): RoomRecord {
      // I1 — synchronous critical section: mint, write, project, notify with no await between.
      const seq = store.seq + 1;
      const record = { v: 1, seq, ts: Date.now(), id: newMessageId(), ...draft } as RoomRecord;
      appendLine(fd, `${JSON.stringify(record)}\n`);
      store.seq = seq;
      store.records.push(record);
      store.byId.set(record.id, record);
      project(store, record);
      for (const fn of [...store.listeners]) {
        try {
          fn(record);
        } catch {
          // listeners must not break the append path
        }
      }
      return record;
    },

    addListener(fn: (r: RoomRecord) => void): () => void {
      store.listeners.add(fn);
      return () => store.listeners.delete(fn);
    },

    removeListener(fn: (r: RoomRecord) => void): void {
      store.listeners.delete(fn);
    },

    dispose(): void {
      const n = (REFS.get(root) ?? 1) - 1;
      if (n > 0) {
        REFS.set(root, n);
        return;
      }
      // Last live session: stop the background jobs, close the shared fd (K8), evict the root (K9).
      roomTimers.stop(root);
      stopCompactor(root);
      closeRoomLog(root, roomId);
      STORES.delete(root);
      REFS.delete(root);
    },

    reset(): void {
      store.records.length = 0;
      store.byId.clear();
      store.claims.clear();
      store.cursors.clear();
      store.members.clear();
      store.waiters.clear();
      store.seq = 0;
    },
  };

  // §3.3/§3.4 — first open rebuilds the projection and claim state by replaying the log.
  const { records } = replay(fd);
  for (const record of records) {
    store.records.push(record);
    store.byId.set(record.id, record);
    if (record.seq > store.seq) store.seq = record.seq;
    project(store, record);
  }
  hydrateClaims(store, records);

  return store;
}

export function storeFor(root: string, roomId: string): RoomStore {
  // [invented]
  const existing = STORES.get(root);
  if (existing !== undefined) {
    REFS.set(root, (REFS.get(root) ?? 0) + 1);
    return existing;
  }
  const store = createStore(root, roomId);
  STORES.set(root, store);
  REFS.set(root, 1);
  return store;
}

function rootOf(ctx: ExtensionContext): string {
  const opts: LocalProtocolOptions = ctx.localProtocolOptions ?? {
    getArtifactsDir: () => ctx.sessionManager.getArtifactsDir(),
    getSessionId: () => ctx.sessionManager.getSessionId(),
  };
  return resolveLocalRoot(opts);
}

export function roomStoreFor(ctx: ExtensionContext): RoomStore {
  // [invented] R10
  const root = rootOf(ctx);
  const agentId = ctx.agent.id;
  const live = SESSIONS.get(root);
  // One ref per session: a repeat call from the same agent must not bump the refcount again.
  if (live?.has(agentId) && STORES.has(root)) return STORES.get(root)!;
  const store = storeFor(root, resolveRoomId(root));
  const members = live ?? new Set<string>();
  if (live === undefined) SESSIONS.set(root, members);
  members.add(agentId);
  // R11/R28 — the background jobs (claim sweep, pruning, compactor) MUST run from the main
  // session only: a tick scheduled on a subagent dies when that subagent's session_shutdown clears
  // its timers. Both registries are idempotent per root.
  if (ctx.agent.kind === "main") {
    roomTimers.start(root, ctx);
    startCompactor(store, ctx);
  }
  return store;
}

/** session_shutdown — drop this session's single ref; the last one closes the fd and evicts (K9). */
export function disposeRoomSession(ctx: ExtensionContext): void {
  const root = rootOf(ctx);
  const set = SESSIONS.get(root);
  if (set === undefined || !set.delete(ctx.agent.id)) return;
  if (set.size === 0) SESSIONS.delete(root);
  STORES.get(root)?.dispose();
}

export function resetRoomStores(): void {
  // [invented] __roomTest
  for (const [root, store] of STORES) {
    roomTimers.stop(root);
    stopCompactor(root);
    closeRoomLog(root, store.roomId);
  }
  STORES.clear();
  REFS.clear();
  SESSIONS.clear();
}

// §3.6 S5 pruning job — in-memory records array ONLY; the JSONL file is never truncated (K19).
export const LOG_MAX_RECORDS = 5_000;
export const LOG_MAX_AGE_MS = 604_800_000;
export const PRUNE_INTERVAL_MS = 60_000; // [invented]
export function enforceRetention(store: RoomStore, now: number): RoomRecord | null {
  const cutoff = now - LOG_MAX_AGE_MS;
  let dropped = 0;
  while (
    store.records.length > 0 &&
    (store.records.length > LOG_MAX_RECORDS || store.records[0].ts < cutoff)
  ) {
    const record = store.records.shift()!;
    store.byId.delete(record.id);
    dropped++;
  }
  if (dropped === 0) return null;
  // The drop is itself a record — the file is never truncated, only the projection (K19).
  return store.append({ kind: "gap", from: "system", skipped: dropped, reason: "retention" });
}

// K3 — the third refcounted ctx.setInterval job: expireStale → release{reason:"expired"} →
// promote the oldest waiter → T0 notice. The ONLY producer of release{reason:"expired"}.
export const CLAIM_SWEEP_INTERVAL_MS = 5_000; // [invented] [calibrate]

// [invented] — the refcounted timer registry (I4/R11/R28). One entry per root; the tick runs in the
// main session only and is cleared when the last live session disposes.
export interface RoomTimerRegistry {
  start(root: string, ctx: ExtensionContext): void;
  stop(root: string): void;
}
const TIMERS = globalMap<string, Timer[]>("__roomTimers");

export const roomTimers: RoomTimerRegistry = {
  start(root: string, ctx: ExtensionContext): void {
    if (TIMERS.has(root)) return;
    const store = STORES.get(root);
    if (store === undefined) return;
    TIMERS.set(root, [
      ctx.setInterval(() => {
        enforceRetention(store, Date.now());
      }, PRUNE_INTERVAL_MS),
      ctx.setInterval(() => {
        expireStale(store, Date.now());
      }, CLAIM_SWEEP_INTERVAL_MS),
    ]);
  },
  stop(root: string): void {
    const handles = TIMERS.get(root);
    if (handles === undefined) return;
    for (const handle of handles) clearInterval(handle);
    TIMERS.delete(root);
  },
};
