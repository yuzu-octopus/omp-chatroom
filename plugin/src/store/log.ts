import * as fs from "node:fs";
import { globalMap } from "../globals";
import { logPathFor, newMessageId } from "../ids";
import { type RecordKind, type RoomRecord, STATUS_KEYS, type StatusObject } from "./schema";

// §2.1 §3.3 — K8: one fd per process per logPath, in a globalThis registry.
// Opened O_RDWR (not O_WRONLY) because readSince/replay take this same fd; O_APPEND still gives
// the atomic append the plan relies on. Bun's `fs.constants` omits O_CLOEXEC and does not set it
// by default, so the raw Linux value is supplied explicitly (the only supported platform).
const O_CLOEXEC = process.platform === "linux" ? 0o2000000 : 0;
const FDS = globalMap<string, number>("__roomLogFds");

export function lockPathFor(root: string): string {
  return `${root}/room/.lock`;
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
 * Cross-process single-writer lock (plan 017 followup). Two omp processes on one project root
 * would mint colliding seqs and never see each other's records (proven: 10 duplicate seqs over
 * 40 records with a rendezvous probe) — silent divergence, not an error. The lock makes the
 * second writer fail LOUDLY instead. O_CREAT|O_EXCL is the atomic primitive (no flock in this
 * runtime); the file holds the owner pid so a dead owner's stale lock can be reaped after one
 * liveness check. Throws Error("room file locked by pid <N>") when a LIVE owner holds it.
 */
export function acquireRoomLock(root: string): void {
  const lockPath = lockPathFor(root);
  fs.mkdirSync(lockPath.slice(0, lockPath.lastIndexOf("/")), { recursive: true });
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    const held = HOLDS.get(root);
    HOLDS.set(root, { count: (held?.count ?? 0) + 1, room: held?.room ?? false });
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error;
  }
  // A lock exists: reap it iff the owner is dead, else fail loudly.
  let owner = 0;
  try {
    owner = Number.parseInt(fs.readFileSync(lockPath, "utf-8"), 10);
  } catch {
    owner = 0; // unreadable → treat as stale, fall through to unlink
  }
  if (Number.isInteger(owner) && owner > 0) {
    try {
      process.kill(owner, 0); // liveness check only — no signal sent
      throw new Error(`room file locked by pid ${owner}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("room file locked by pid"))
        throw error;
      // ESRCH: owner dead → stale lock, fall through and reap it.
    }
  }
  fs.rmSync(lockPath, { force: true });
  fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  const held = HOLDS.get(root);
  HOLDS.set(root, { count: (held?.count ?? 0) + 1, room: held?.room ?? false });
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
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | O_CLOEXEC,
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

// §3.3 — skip malformed lines and CONTINUE (C1). A torn line must never drop later records.
// A skipped line emits one `gap` record; its `seq` is the preceding record's seq so it never
// consumes a number and cannot shift later cursors (M-2).
export function replay(fd: number): { records: RoomRecord[]; skipped: number } {
  const records: RoomRecord[] = [];
  let skipped = 0;
  let lastSeq = 0;
  for (const line of readAllLines(fd)) {
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
    if (record === null) {
      skipped++;
      records.push(gapRecord(lastSeq, "invalid"));
      continue;
    }
    records.push(record);
    lastSeq = record.seq;
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
  if (!Number.isInteger(value.seq) || !Number.isFinite(value.ts)) return null;
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
  if (kind === "claim" && !Number.isFinite(value.ttlMs)) return null;
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

// F8 — [invented] the U6 mapping: errno → the detail string. Never throws.
export type LogOpenResult =
  | { ok: true; fd: number }
  | {
      ok: false;
      error:
        | "room file not found"
        | "room file unwritable"
        | "room file corrupt"
        | "room file locked by another session";
    };
export function openRoomLog(root: string, roomId: string): LogOpenResult {
  // [invented] F8 wrapper
  try {
    return { ok: true, fd: roomLogFd(root, roomId) };
  } catch (error) {
    // The lock failure carries the owner pid ("room file locked by pid <N>"); the U6 surface
    // reports the stable variant so callers can match on it without parsing a pid.
    if (error instanceof Error && error.message.startsWith("room file locked by pid")) {
      return { ok: false, error: "room file locked by another session" };
    }
    let code: string | undefined;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      code = error.code;
    }
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: false, error: "room file not found" };
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return { ok: false, error: "room file unwritable" };
    }
    return { ok: false, error: "room file corrupt" };
  }
}
