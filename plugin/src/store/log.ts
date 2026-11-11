import * as fs from "node:fs";
import { isMainThread } from "node:worker_threads";
import { globalMap } from "../globals";
import { logPathFor, newMessageId } from "../ids";
import { type RecordKind, type RoomRecord, STATUS_KEYS, type StatusObject } from "./schema";

// §2.1 §3.3 — K8: one fd per process per logPath, in a globalThis registry.
// Opened O_RDWR (not O_WRONLY) because readSince/replay take this same fd; O_APPEND still gives
// the atomic append the plan relies on. Bun's `fs.constants` omits O_CLOEXEC and does not set it
// by default, so the raw Linux value is supplied explicitly (the only supported platform).
const O_CLOEXEC = process.platform === "linux" ? 0o2000000 : 0;
// The log's last component must not be a link: H3 plants one and the O_CREAT|O_APPEND open
// would append room history to whatever it names. The lstat guard below refuses first; this
// refuses a link swapped in between the check and the open (ELOOP).
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const FDS = globalMap<string, number>("__roomLogFds");

export function lockPathFor(root: string): string {
  return `${root}/room/.lock`;
}

/**
 * The first symlink in a room's WRITE chain, or null when the chain is clean.
 *
 * The write paths FOLLOW links: `saveRoomConfig` mkdirs and writes `config.json`, the lock is
 * published inside `room/`, and `roomLogFd` opens the log O_CREAT|O_APPEND. A link planted in a
 * project-local room turns "open the project" into a write to whatever it names:
 * `ln -s ~/.bashrc /tmp/x/.omp-room/room/config.json` is enough. The delete paths already refuse
 * links (`room-root.ts:105-116` `rmTreeQuiet` lstat guard); this is the same refusal for the
 * writes. `lstat` never follows the link, so the check itself cannot be redirected.
 *
 * A MISSING component is safe — there is nothing to follow, and the mkdir that follows creates
 * a real directory. The chain stops at the leaf: the root and the room dir are the two
 * components this module (and `config.ts`) creates and renames inside.
 */
function symlinkInRoomPath(root: string, leaf: string): string | null {
  for (const target of [root, `${root}/room`, leaf]) {
    try {
      if (fs.lstatSync(target).isSymbolicLink()) return target;
    } catch {
      // absent: nothing to follow
    }
  }
  return null;
}

/** `symlinkInRoomPath` as a predicate, for callers that skip instead of throwing (migration). */
export function roomWritePathIsSafe(root: string, leaf: string): boolean {
  return symlinkInRoomPath(root, leaf) === null;
}

/** Refuse a room write path that reaches its target through a symlink; names the link. */
export function assertRoomWritePath(root: string, leaf: string): void {
  const link = symlinkInRoomPath(root, leaf);
  if (link !== null) throw new Error(`room path is a symlink: ${link}`);
}

/**
 * The lock holds THIS process keeps, keyed by root (K9: globalThis-anchored, one per root).
 *
 * `count` is how many holds we have on the root; `room` marks one of them as the ROOM's own:
 * the room's open ADOPTS that hold instead of taking a second one — a second
 * `acquireRoomLock` from the same process fails by design, see below — and the room's close
 * releases it. The registry (not the lock file) is the source of truth for "we hold it": a lock
 * file can name our pid without being ours (a probe writes one to simulate another process),
 * and only a hold we took ourselves may be treated as already held.
 */
interface LockHold {
  count: number;
  room: boolean;
}
const HOLDS = globalMap<string, LockHold>("__roomLockHolds");

/**
 * Whether this code is running inside a host worker thread.
 *
 * 18.17.0 put concurrent subagents on worker threads (`task.workerThreads`, default 4, from the
 * 9th concurrent run) so they stop competing with the TUI. A worker has its own module graph, so
 * the room's per-process singletons — the open log fd, the hydrated claim map, the cursors — are
 * a DIFFERENT instance there, and the pid-based lock below cannot tell the two apart: it reads
 * its own pid back and refuses as if a stranger held the room. A room is per-process by
 * construction, so the honest answer in a worker is a refusal that names the fix, not a
 * "locked by pid" that points at the caller itself.
 */
export function isWorkerThread(): boolean {
  // `isMainThread` is the runtime's own answer, not a guess from `process.pid` — a worker SHARES
  // the pid, which is exactly why the lock check below cannot tell the two apart.
  return !isMainThread;
}

/**
 * The refusal a worker-thread agent gets, with the setting that fixes it.
 *
 * Host default `task.workerThreads` is 4 and the pool starts using workers at the 9th concurrent
 * subagent, so this is reachable by a large swarm — the exact case the room exists for — and it
 * must be actionable rather than cryptic.
 */
export const WORKER_THREAD_REFUSAL =
  "room is per-process: this agent runs on a host worker thread, which has its own room state. " +
  "Set `task.workerThreads: 0` (or keep fewer than 9 concurrent subagents) to run the swarm " +
  "in-process, where the room is shared.";

// §lock — a FRESH lock file with no parseable pid is another writer MID-CREATE, not a dead
// owner: reaping it is what hands the room to two writers. This is how old a writer's create
// window may look before its file counts as abandoned (crash/legacy writer) and is reaped.
export const LOCK_MID_CREATE_MS = 5_000;
// How long a caller rides out a mid-create file before refusing, and how finely it polls.
// Creation is three syscalls, so this is ~4 orders of magnitude of headroom for a descheduled
// writer; the bound keeps the synchronous open from stalling the TUI.
const LOCK_MID_CREATE_WAIT_MS = 250;
const LOCK_MID_CREATE_POLL_MS = 5;

/** What an existing lock file says: a pid, or that it is empty/unreadable and how old. */
type LockInspection =
  | { kind: "missing" }
  | { kind: "owner"; owner: number }
  | { kind: "unreadable"; ageMs: number };

/** Block this thread without a timer: `acquireRoomLock` is synchronous by design (I1). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function recordHold(root: string): void {
  const held = HOLDS.get(root);
  HOLDS.set(root, { count: (held?.count ?? 0) + 1, room: held?.room ?? false });
}

/** The errno of a thrown value, without trusting its shape. */
function errnoCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

/**
 * Create `lockPath` ATOMICALLY WITH ITS CONTENT.
 *
 * `open(O_CREAT|O_EXCL)` creates an EMPTY file and the pid is a SECOND syscall, so a concurrent
 * opener could read the empty file in between, parse NaN, call it stale and unlink it; the first
 * writer's write then landed on an unlinked inode and BOTH processes believed they held the room
 * (measured: 10 duplicate seqs over 40 records). `link(2)` publishes the already-written temp
 * file in ONE atomic step and fails EEXIST when the name is taken, so the lock is never
 * observable without its pid.
 *
 * @returns true when this caller won the name, false when another entry already holds it.
 */
function createLockFile(lockPath: string): boolean {
  const tmp = `${lockPath}.${process.pid}.${newMessageId()}.tmp`;
  fs.writeFileSync(tmp, String(process.pid), { encoding: "utf-8", flag: "wx" });
  try {
    fs.linkSync(tmp, lockPath);
    return true;
  } catch (error) {
    if (errnoCode(error) === "EEXIST") return false;
    throw error;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Read the existing lock without ever following it. */
function inspectLock(lockPath: string): LockInspection {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(lockPath);
  } catch {
    return { kind: "missing" };
  }
  // A link at the lock path is never followed: its content could name any pid, and unlinking it
  // would target the link, not the file the link points at.
  if (stat.isSymbolicLink()) throw new Error(`room path is a symlink: ${lockPath}`);
  // Only a regular file can be a writer's lock. A directory or socket here is garbage, not a
  // mid-create writer — the pre-fix "reap it now" behaviour stays for that shape.
  if (!stat.isFile()) return { kind: "unreadable", ageMs: Number.POSITIVE_INFINITY };
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, "utf-8");
  } catch {
    return { kind: "unreadable", ageMs: Date.now() - stat.mtimeMs };
  }
  const owner = Number.parseInt(raw, 10);
  if (Number.isInteger(owner) && owner > 0) return { kind: "owner", owner };
  return { kind: "unreadable", ageMs: Date.now() - stat.mtimeMs };
}

/**
 * Cross-process single-writer lock (plan 017 followup). Two omp processes on one project root
 * would mint colliding seqs and never see each other's records (proven: 10 duplicate seqs over
 * 40 records with a rendezvous probe) — silent divergence, not an error. The lock makes the
 * second writer fail LOUDLY instead. `link(2)` is the atomic primitive (no flock in this
 * runtime); the file holds the owner pid so a dead owner's stale lock can be reaped after one
 * liveness check. Throws Error("room file locked by pid <N>") when a LIVE owner holds it.
 */
export function acquireRoomLock(root: string): void {
  const lockPath = lockPathFor(root);
  // H3 — refuse a planted link BEFORE mkdir: `mkdirSync(recursive)` through a symlinked room
  // directory succeeds silently, and every write below would then land inside the link's target.
  assertRoomWritePath(root, lockPath);
  fs.mkdirSync(lockPath.slice(0, lockPath.lastIndexOf("/")), { recursive: true });
  if (createLockFile(lockPath)) {
    recordHold(root);
    return;
  }
  // A lock exists. A parseable owner decides by liveness; an EMPTY/unparseable file is another
  // writer mid-create and is left alone until it is older than the freshness window.
  const deadline = Date.now() + LOCK_MID_CREATE_WAIT_MS;
  for (;;) {
    const found = inspectLock(lockPath);
    if (found.kind === "missing") {
      // It vanished between our failed link and the read: race for the name again.
      if (createLockFile(lockPath)) {
        recordHold(root);
        return;
      }
      continue;
    }
    if (found.kind === "owner") {
      try {
        process.kill(found.owner, 0); // liveness check only — no signal sent
        // The pid is alive. If it is OUR pid but we hold no lock on this root, the holder is
        // another thread of this process (18.17.0 worker-thread subagents): a room is
        // per-process, so this is a topology refusal, not another omp session.
        if (found.owner === process.pid && !HOLDS.has(root)) {
          throw new Error(
            `room is per-process and another thread of this process holds it (pid ${found.owner}); ` +
              WORKER_THREAD_REFUSAL,
          );
        }
        throw new Error(`room file locked by pid ${found.owner}`);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith("room file locked by pid") ||
            error.message.startsWith("room is per-process"))
        )
          throw error;
        // ESRCH: no such pid, the owner is dead → stale lock, fall through and reap it. Any
        // OTHER kill failure (EPERM: the pid belongs to another user and is alive; EINVAL and
        // anything unexpected) proves nothing about death — treat the owner as LIVE and refuse.
        if (errnoCode(error) !== "ESRCH") {
          throw new Error(`room file locked by pid ${found.owner}`);
        }
      }
    } else if (found.ageMs < LOCK_MID_CREATE_MS) {
      // Another writer is between create and write (an old-format creator) or crashed within
      // the window. Unlinking here is the double-writer bug: wait, then refuse LOUDLY.
      if (Date.now() >= deadline) {
        throw new Error(
          `room file locked: the lock file is being created by another process (${lockPath})`,
        );
      }
      sleepSync(LOCK_MID_CREATE_POLL_MS);
      continue;
    }
    // Stale: a dead pid, non-file garbage, or an unreadable file past the freshness window.
    // Re-inspect BEFORE unlinking: the file may have been replaced since `found` was read — a
    // live writer's lock could be standing on the name by now, and unlinking it would let two
    // processes mint colliding seqs. Only unlink when the lock still names the same dead owner
    // (or the same unreadable shape); anything else loops back to the top for a fresh decision.
    const again = inspectLock(lockPath);
    const sameOwner =
      found.kind === "owner" && again.kind === "owner" && again.owner === found.owner;
    const sameGarbage = found.kind === "unreadable" && again.kind === "unreadable";
    if (!sameOwner && !sameGarbage) continue;
    fs.rmSync(lockPath, { force: true, recursive: true });
  }
}

/** Release the lock taken by `acquireRoomLock`. Only the owner unlinks (pid check). */
export function releaseRoomLock(root: string): void {
  const lockPath = lockPathFor(root);
  // The hold bookkeeping runs first: a missing or stolen lock file must not strand our hold.
  const hold = HOLDS.get(root);
  if (hold) {
    hold.count -= 1;
    if (hold.count > 0) return; // another of our holds is still live — keep the lock
    HOLDS.delete(root);
  }
  try {
    const owner = Number.parseInt(fs.readFileSync(lockPath, "utf-8"), 10);
    if (owner === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    // Best-effort: a leftover lock is reaped as stale by the next opener.
  }
}

/**
 * True when THIS process holds the lock on `root` (a hold taken through `acquireRoomLock`).
 *
 * The registry, not the lock file: a lock file can carry our pid without being ours, and only a
 * hold we took ourselves may be treated as already-held.
 */
export function holdsRoomLock(root: string): boolean {
  const hold = HOLDS.get(root);
  return hold !== undefined && hold.count > 0;
}

/**
 * Earmark this process's hold on `root` for the room's own open.
 *
 * The room's open adopts the earmarked hold instead of taking a second one (a second
 * `acquireRoomLock` from the same process fails by design), and the room's close releases it.
 * This is what closes the window between the migration and the open: the lock is never
 * released in between, so no second omp process can take the room while we copy into it.
 *
 * @returns false when this process holds no lock on `root`.
 */
export function reserveRoomLock(root: string): boolean {
  const hold = HOLDS.get(root);
  if (!hold || hold.count <= 0) return false;
  hold.room = true;
  return true;
}

export function roomLogFd(root: string, roomId: string): number {
  // mkdirSync + O_APPEND|O_CLOEXEC
  const path = logPathFor(root, roomId);
  const existing = FDS.get(path);
  if (existing !== undefined) return existing;
  // H3 — the log is opened for WRITE: a planted link would append the room's history to its
  // target. `O_NOFOLLOW` below closes the race between this check and the open.
  assertRoomWritePath(root, path);
  // The room's open ADOPTS the lock handed to it by the migration (see `reserveRoomLock`):
  // taking a second one would fail — a second acquire from the same process is an error by
  // design — and the hold the room adopts is the one the room's close releases.
  const held = HOLDS.get(root);
  if (held && held.count > 0 && held.room) {
    held.room = false;
  } else {
    acquireRoomLock(root);
  }
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  let fd: number;
  try {
    fd = fs.openSync(
      path,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | O_CLOEXEC | O_NOFOLLOW,
    );
  } catch (error) {
    // The room never opened: hand the lock back instead of leaking it.
    releaseRoomLock(root);
    throw error;
  }
  FDS.set(path, fd);
  return fd;
}

export function appendLine(fd: number, line: string): void {
  // line MUST end "\n"
  const buf = Buffer.from(line.endsWith("\n") ? line : `${line}\n`, "utf-8");
  let off = 0;
  while (off < buf.length) {
    const w = fs.writeSync(fd, buf, off, buf.length - off);
    if (w === 0) throw new Error("Short write");
    off += w;
  }
  // §1 "flush each write" — O_APPEND makes the write atomic, but only fsync makes it durable: a
  // crash (process or machine) can drop a page-cached write, and I5 claims each append survives
  // one. This is the expensive part of an append, deliberately kept here (and synchronous) so
  // every writer funnels through the one durable path.
  //
  // Step 3 verdict (KEEP, measured 2026-11-11): one T0 fan-out to N recipients pays exactly N
  // fsyncs — one per `delivered` marker, all through this path (counted: 8 markers → 8 fsyncs).
  // Batching the markers behind ONE fsync was rejected: the markers share this fd with every
  // user record, so a crash between the batched writes and the single fsync loses an UNBOUNDED
  // prefix of user records too — the batch cannot be proven crash-safe without a second
  // (un-fsync'd) write path, which is exactly the weakening I5 forbids. The cost is accepted:
  // fsync latency on this filesystem measures ~0 ms p50/p90 (page-cache fast path), and a T0
  // fan-out already pays one steering send per recipient, against which N fsyncs are noise.
  fs.fsyncSync(fd);
}
// Sync whole-file read; a partial trailing line is returned as-is and rejected by JSON.parse.
function readAllLines(fd: number): string[] {
  const size = fs.fstatSync(fd).size;
  if (size === 0) return [];
  const buf = Buffer.allocUnsafe(size);
  let read = 0;
  while (read < size) {
    const n = fs.readSync(fd, buf, read, size - read, read);
    if (n === 0) break;
    read += n;
  }
  return buf.toString("utf-8", 0, read).split("\n");
}
// Step 4 — the bounded tail reader. `readAllLines` above stays the small-file path; this reads
// at most `maxBytes` from the END of the file plus the line fragment before it (a tail read that
// starts mid-line would lose the first record). Returns the lines and whether the head was cut.
function readTailLines(fd: number, maxBytes: number): { lines: string[]; truncated: boolean } {
  const size = fs.fstatSync(fd).size;
  if (size <= maxBytes) {
    return { lines: readAllLines(fd), truncated: false };
  }
  const start = size - maxBytes;
  const buf = Buffer.allocUnsafe(maxBytes);
  let read = 0;
  while (read < maxBytes) {
    const n = fs.readSync(fd, buf, read, maxBytes - read, start + read);
    if (n === 0) break;
    read += n;
  }
  const tail = buf.toString("utf-8", 0, read);
  // The first chunk may start mid-line AND mid-code-point: the slice before the first newline is
  // dropped (its record's head is in the unread prefix), and a replacement char at the seam is
  // the cut code point's other half — dropping the fragment drops it too.
  const lines = tail.split("\n");
  lines.shift();
  return { lines, truncated: true };
}

// §3.3 — skip malformed lines and CONTINUE (C1). A torn line must never drop later records.
// A skipped line emits one `gap` record; its `seq` is the preceding record's seq so it never
// consumes a number and cannot shift later cursors (M-2).
export function replay(
  fd: number,
  opts?: { maxRecords?: number; tailBytes?: number },
): { records: RoomRecord[]; skipped: number } {
  if (opts?.maxRecords === undefined && opts?.tailBytes === undefined) {
    return replayLines(readAllLines(fd), false);
  }
  // The bound covers the retention cap plus margin (maintenance note): the projection after open
  // must agree with retention about the head, or open and the first prune disagree. callers pass
  // logMaxRecords + margin for maxRecords; tailBytes caps the read when records are large.
  const maxRecords = opts.maxRecords ?? Number.POSITIVE_INFINITY;
  const { lines, truncated } =
    opts.tailBytes === undefined
      ? { lines: readAllLines(fd), truncated: false }
      : readTailLines(fd, opts.tailBytes);
  const { records, skipped } = replayLines(lines, truncated);
  if (records.length <= maxRecords) return { records, skipped };
  // Drop from BEHIND the leading prefix marker (index 0 when the tail was cut): the marker is
  // the projection's notice that the head is missing, and the maxRecords cut extends that same
  // notice — so the marker absorbs the extra drop instead of a second gap appearing. Its
  // `skipped` is recomputed from the new head (first.seq - 1), the same dense-seq count the
  // marker used at creation.
  const hasMarker = truncated && records.length > 0 && records[0]!.kind === "gap";
  const keepFrom = hasMarker ? 1 : 0;
  const drop = records.length - keepFrom - maxRecords;
  const kept = [...records.slice(0, keepFrom), ...records.slice(keepFrom + drop)];
  if (kept[1] !== undefined && kept[0]!.kind === "gap") {
    const newSkipped = kept[1]!.seq - 1;
    kept[0] = { ...kept[0], seq: kept[1]!.seq, ts: kept[1]!.ts, skipped: newSkipped };
  } else if (!hasMarker && kept[0] !== undefined && drop > 0) {
    // The byte tail did not cut but maxRecords did: the dropped prefix still needs its notice,
    // or the projection silently disagrees with the file about the head.
    kept.unshift(retentionGapRecord(kept[0]!));
  }
  return { records: kept, skipped: skipped + drop };
}

/**
 * The line parser both replay paths share. `prefixCut` is true when the caller read a bounded
 * tail: the skipped prefix is recorded as ONE leading `gap{reason:"retention"}`-style marker so
 * the projection knows the head is missing, exactly the shape retention's own prune produces.
 * The JSONL is never truncated (K19 intact); only the in-memory projection is bounded.
 */
function replayLines(
  lines: string[],
  prefixCut: boolean,
): { records: RoomRecord[]; skipped: number } {
  const records: RoomRecord[] = [];
  let skipped = 0;
  let lastSeq = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped++;
      records.push(gapRecord(lastSeq, "corrupt"));
      continue;
    }
    const record = validateRecord(parsed);
    // §3.3 — the log is append-only, so an accepted seq never goes backwards. A line that does
    // was not written through this room's lock (a hand edit, a merged legacy log) and is
    // quarantined like any other invalid record instead of shifting the projection.
    if (record === null || record.seq < lastSeq) {
      skipped++;
      records.push(gapRecord(lastSeq, "invalid"));
      continue;
    }
    records.push(record);
    lastSeq = record.seq;
  }
  if (prefixCut && records.length > 0) {
    // The leading marker must not consume a seq (M-2): it reuses the first kept record's seq —
    // the way C1's per-line gaps reuse the preceding record's seq. `first.seq - 1` is the count
    // of records the projection does not hold, NOT a stored head count: seqs are dense (minted
    // as store.seq + 1), and a quarantined line inside the unread prefix only makes this an
    // over-count, never an under-count — the same direction retention's own `skipped` errs when
    // the dropped prefix held invalid lines.
    const first = records[0]!;
    const skippedCount = first.seq - 1;
    if (skippedCount > 0) {
      records.unshift(retentionGapRecord(first));
      skipped += skippedCount;
    }
  }
  return { records, skipped };
}

export function closeRoomLog(root: string, roomId: string): void {
  // K8 — last live session only
  const path = logPathFor(root, roomId);
  const fd = FDS.get(path);
  if (fd === undefined) return;
  try {
    fs.closeSync(fd);
  } finally {
    FDS.delete(path);
    releaseRoomLock(root);
  }
}

// §3.4 — the lease bounds the WRITE path clamps the model's ttl to (`tools/room.ts`). Replay
// applies the SAME pair: a replayed line is on-disk input (the migration adopts a legacy
// `.omp-room` from any checkout), so a hand-written `ttlMs: 1e18` must not hydrate a lease the
// tool could never have minted — held by an id the registry does not know, it never goes stale
// (claims.ts:36-40), so `grant` denies every later claimant for the life of the room.
export const CLAIM_TTL_MIN_MS = 1_000;
export const CLAIM_TTL_MAX_MS = 86_400_000;

// [invented] — §3.3's per-kind required-field table, as data (the validator's single source).
export const LOG_VALIDATION_FIELDS: Readonly<Record<RecordKind, readonly string[]>> = {
  msg: ["v", "seq", "ts", "kind", "id", "from", "topic", "body"],
  claim: ["v", "seq", "ts", "kind", "id", "from", "resource", "ttlMs"],
  release: ["v", "seq", "ts", "kind", "id", "from", "resource", "reason", "prevHolder"],
  note: ["v", "seq", "ts", "kind", "id", "from", "topic", "body"],
  member: ["v", "seq", "ts", "kind", "id", "from", "action"],
  gap: ["v", "seq", "ts", "kind", "id", "from", "skipped", "reason"],
  contended: ["v", "seq", "ts", "kind", "id", "from", "resource", "holder"],
  wait: ["v", "seq", "ts", "kind", "id", "from", "waited", "target", "outcome", "enqueuedAt"],
  delivered: ["v", "seq", "ts", "kind", "id", "from", "deliveredSeq", "tier"],
};

// §3.3 S3 — per-kind field validation on replay. A record that parses but does not match the
// RoomRecord shape is quarantined with gap{reason:"invalid"}.
const KINDS = new Set<string>([
  "msg",
  "claim",
  "release",
  "note",
  "member",
  "gap",
  "contended",
  "wait",
  "delivered",
]);
const RELEASE_REASONS = new Set<string>(["released", "expired", "reclaimed", "aborted"]);
const GAP_REASONS = new Set<string>(["retention", "invalid", "corrupt"]);
const MEMBER_ACTIONS = new Set<string>(["join", "leave"]);
const PERFORMATIVES = new Set<string>([
  "inform",
  "request",
  "propose",
  "accept",
  "reject",
  "query",
  "failure",
]);
const WAITED_KINDS = new Set<string>(["claim", "agent", "message"]);
const WAIT_OUTCOMES = new Set<string>(["event", "timeout", "aborted"]);
const TIERS = new Set<string>(["T0", "T1", "T2"]);
const STRING_FIELDS = [
  "id",
  "from",
  "topic",
  "body",
  "to",
  "replyTo",
  "threadRoot",
  "resource",
  "prevHolder",
  "replyWith",
  "replyBy",
  "holder",
  "waited",
  "target",
  "outcome",
  "tier",
  "idemKey",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** R6 — the status ledger's shape: five keys, each `{reason, answer}`, both strings. */
function isStatusObject(value: unknown): value is StatusObject {
  if (!isPlainObject(value)) return false;
  for (const key of STATUS_KEYS) {
    const answer = value[key];
    if (!isPlainObject(answer)) return false;
    if (typeof answer.reason !== "string" || typeof answer.answer !== "string") return false;
  }
  return true;
}
function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === "string" && KINDS.has(value);
}
function inSet(value: unknown, set: ReadonlySet<string>): boolean {
  return typeof value === "string" && set.has(value);
}

export function validateRecord(value: unknown): RoomRecord | null {
  // [invented placement]
  if (!isPlainObject(value)) return null;
  if (value.v !== 1) return null;
  if (!isRecordKind(value.kind)) return null;
  // seq is minted as `store.seq + 1` (room-store.ts:204-211), so 0 can never be written; ts is
  // always Date.now(). Both are checked here because replay is the boundary for on-disk input.
  const seq = value.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1 || !Number.isFinite(value.ts)) {
    return null;
  }
  if (typeof value.id !== "string" || typeof value.from !== "string") return null;

  const kind: RecordKind = value.kind;
  for (const field of LOG_VALIDATION_FIELDS[kind]) {
    if (value[field] === undefined || value[field] === null) return null;
  }
  for (const field of STRING_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== "string") return null;
  }
  if (value.mention !== undefined && !isStringArray(value.mention)) return null;
  if (value.dependsOn !== undefined && !isStringArray(value.dependsOn)) return null;
  if (value.status !== undefined && !isStatusObject(value.status)) return null;
  if (
    kind === "msg" &&
    value.performative !== undefined &&
    !inSet(value.performative, PERFORMATIVES)
  ) {
    return null;
  }
  if (kind === "claim") {
    const ttl = value.ttlMs;
    if (
      typeof ttl !== "number" ||
      !Number.isFinite(ttl) ||
      ttl < CLAIM_TTL_MIN_MS ||
      ttl > CLAIM_TTL_MAX_MS
    ) {
      return null;
    }
  }
  if (kind === "member" && !inSet(value.action, MEMBER_ACTIONS)) return null;
  if (kind === "release" && !inSet(value.reason, RELEASE_REASONS)) return null;
  if (kind === "gap" && (!Number.isInteger(value.skipped) || !inSet(value.reason, GAP_REASONS))) {
    return null;
  }
  if (
    kind === "wait" &&
    (!inSet(value.waited, WAITED_KINDS) ||
      !inSet(value.outcome, WAIT_OUTCOMES) ||
      !Number.isFinite(value.enqueuedAt))
  ) {
    return null;
  }
  if (
    kind === "delivered" &&
    (!Number.isInteger(value.deliveredSeq) || !inSet(value.tier, TIERS))
  ) {
    return null;
  }
  // Every field was validated above; this cast is the validated boundary.
  const record: RoomRecord = value as RoomRecord;
  return record;
}

// Synthetic notice for a line replay could not use; never a real actor.
function gapRecord(seq: number, reason: "corrupt" | "invalid"): RoomRecord {
  return {
    v: 1,
    seq,
    ts: Date.now(),
    kind: "gap",
    id: newMessageId(),
    from: "system",
    skipped: 1,
    reason,
  };
}
// The bounded-replay prefix marker: the same shape retention's own prune produces (a `gap` with
// `reason:"retention"` and the count of records the projection does not hold). Anchored on the
// first KEPT record — same seq (consumes nothing, M-2), earlier ts — so cursor resume and the
// read path see the head exactly as if retention had pruned it.
function retentionGapRecord(firstKept: RoomRecord): RoomRecord {
  return {
    v: 1,
    seq: firstKept.seq,
    ts: firstKept.ts,
    kind: "gap",
    id: newMessageId(),
    from: "system",
    skipped: firstKept.seq - 1,
    reason: "retention",
  };
}

// F8 — [invented] the U6 mapping: errno → the detail string. Never throws.
export type LogOpenResult =
  | { ok: true; fd: number }
  | {
      ok: false;
      error:
        | "room file not found"
        | "room file unwritable"
        | "room file corrupt"
        | "room file locked by another session"
        | "room path is a symlink";
    };
export function openRoomLog(root: string, roomId: string): LogOpenResult {
  // [invented] F8 wrapper
  try {
    return { ok: true, fd: roomLogFd(root, roomId) };
  } catch (error) {
    // H3 — a refused link keeps its own stable variant: reporting it as corruption would hide
    // that opening the project would have written outside the room.
    if (error instanceof Error && error.message.startsWith("room path is a symlink")) {
      return { ok: false, error: "room path is a symlink" };
    }
    // The lock failure carries the owner pid ("room file locked by pid <N>") or the mid-create
    // state; the U6 surface reports the stable variant so callers need not parse the message.
    if (error instanceof Error && error.message.startsWith("room file locked")) {
      return { ok: false, error: "room file locked by another session" };
    }
    const code = errnoCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: false, error: "room file not found" };
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return { ok: false, error: "room file unwritable" };
    }
    if (code === "ELOOP") return { ok: false, error: "room path is a symlink" };
    return { ok: false, error: "room file corrupt" };
  }
}
