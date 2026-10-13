import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

import { noteGap } from "../attention/governor";
import { globalMap } from "../globals";
import { logPathFor, newMessageId, topicOf } from "../ids";
import { type ClaimState, expireStale, hydrateClaims } from "./claims";
import { startCompactor, stopCompactor } from "./compactor";
import { loadRoomConfig, type RoomConfig, resolveRoomId } from "./config";
import { appendLine, closeRoomLog, openRoomLog, replay } from "./log";
import type { RoomRecord, RoomRecordDraft } from "./schema";
import { invalidateTree } from "./tree-store";

// K11 — MemberState is declared ONCE, here (the store owns it); imported by tiers, governor,
// digest, chat-pane, delivery.
export interface MemberState {
  agentId: string;
  joinedAtSeq: number;
  topics: Set<string>; // followed topics
  muted: Set<string>; // muted topics; the sentinel "" means whole-room mute (§5.2)
  threadRoots: Set<string>; // thread roots this agent posted in (§5.1 N1)
  heldTopics: Set<string>; // topics on which this agent holds a live claim (§5.1 N1)
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
  /** The highest seq written or replayed. The next append mints `seq + 1`. */
  seq: number;
  byId: Map<string, RoomRecord>;
  claims: Map<string, ClaimState>;
  cursors: Map<string, number>;
  members: Map<string, MemberState>;
  // [invented] §4.4 — the in-store condition variable for wait_for_claim: resource → FIFO waiter ids.
  waiters: Map<string, string[]>;
  listeners: Set<(r: RoomRecord) => void>;
  config: RoomConfig;

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
    // Plan 002 — the mirror of the release prune: every grant path (direct claim AND waiter
    // promotion via resolveWaiters) funnels through here, so the holder's topics stay correct
    // no matter which path granted the lease. Idempotent: Set.add on re-grant is a no-op.
    store.members.get(record.from)?.heldTopics.add(topicOf(record.resource));
  } else if (record.kind === "release") {
    store.claims.delete(record.resource);
    // Plan 002 — prune AFTER the delete, so the liveness check sees the post-release state.
    // Every claim end (release, expiry, reclaim) funnels through a `release` record, so one
    // hook here covers all three paths with no call-site changes.
    pruneHeldTopic(store, record.prevHolder, topicOf(record.resource));
  }
}

/**
 * Drop `topic` from `holder`'s `heldTopics` iff they hold no other live claim under it.
 * Lives here (not claims.ts) because claims.ts imports RoomStore type-only to break the
 * runtime cycle — and because the projection is the one funnel every release passes through.
 */
export function pruneHeldTopic(store: RoomStore, holder: string, topic: string): void {
  for (const claim of store.claims.values()) {
    if (claim.holder === holder && claim.resource.startsWith(`${topic}/`)) return;
  }
  store.members.get(holder)?.heldTopics.delete(topic);
}

function createStore(root: string, roomId: string): RoomStore {
  const config = loadRoomConfig(root);
  const logPath = logPathFor(root, roomId);
  const opened = openRoomLog(root, roomId);
  if (!opened.ok) throw new Error(opened.error);
  const fd = opened.fd;

  const store: RoomStore = {
    config,
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
  // The room MUST be one per project, shared by the main session and every subagent it spawns.
  //
  // `ctx.localProtocolOptions` is per-SESSION: a subagent's artifacts dir is its own session file
  // minus `.jsonl` (`artifactsDirectoryFor`), so deriving the room from it gave every agent a
  // private room — the claim board coordinated nobody. Verified live: main resolved
  // `<session>/local` while its subagent resolved `<session>/Task1/local`.
  //
  // `ctx.cwd` is the project directory and is inherited by subagents, so it is the only stable
  // per-tree key. The `local://` protocol root is deliberately NOT used for the room.
  return `${ctx.cwd}/.omp-room`;
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
export const PRUNE_INTERVAL_MS = 60_000; // [invented]
export function enforceRetention(store: RoomStore, now: number): RoomRecord | null {
  const cutoff = now - store.config.logMaxAgeMs;
  let dropped = 0;
  while (
    store.records.length > 0 &&
    (store.records.length > store.config.logMaxRecords || store.records[0].ts < cutoff)
  ) {
    const record = store.records.shift()!;
    store.byId.delete(record.id);
    dropped++;
  }
  if (dropped === 0) return null;
  // Tree positions are dense indices into `store.records`: the prune just shifted every survivor
  // under its summary, so the persisted tree is stale by construction. Invalidate it — the
  // compactor rebuilds lazily, and reads fall back to raw records meanwhile (T2/T3).
  invalidateTree(store.treePath);
  // The drop is itself a record — the file is never truncated, only the projection (K19).
  return noteGap(store, dropped, "retention");
}

// K3 — the third refcounted ctx.setInterval job: expireStale → release{reason:"expired"} →
// promote the oldest waiter → T0 notice. The ONLY producer of release{reason:"expired"}.
// [invented] — the refcounted timer registry (I4/R11/R28). One entry per root; the tick runs in the
// main session only and is cleared when the last live session disposes.
export interface RoomTimerRegistry {
  start(root: string, ctx: ExtensionContext): void;
  stop(root: string): void;
}
interface RoomTimerEntry {
  /**
   * The `clearTimer` captured at start, NOT the ctx itself. Holding the ctx and calling
   * `ctx.clearTimer` later is unsafe: `stop` runs from `resetRoomStores`/`dispose`, which can fire
   * after the owning session is gone (same rationale as the compactor's `CompactorEntry`).
   */
  clearTimer: (handle: Timer) => void;
  handles: Timer[];
}
const TIMERS = globalMap<string, RoomTimerEntry>("__roomTimers");

export const roomTimers: RoomTimerRegistry = {
  start(root: string, ctx: ExtensionContext): void {
    if (TIMERS.has(root)) return;
    const store = STORES.get(root);
    if (store === undefined) return;
    // Capture the bound clearer up front; `ctx` may be unusable by the time we stop. No timer
    // API → no job (never a raw timer; I4).
    const clearTimer = ctx.clearTimer?.bind(ctx);
    if (clearTimer === undefined) return;
    TIMERS.set(root, {
      clearTimer,
      handles: [
        ctx.setInterval(() => {
          enforceRetention(store, Date.now());
        }, PRUNE_INTERVAL_MS),
        ctx.setInterval(() => {
          expireStale(store, Date.now());
        }, store.config.claimSweepMs),
      ],
    });
  },
  stop(root: string): void {
    const entry = TIMERS.get(root);
    if (entry === undefined) return;
    TIMERS.delete(root); // delete FIRST: a throwing clearer must not strand the entry
    for (const handle of entry.handles) entry.clearTimer(handle);
  },
};
