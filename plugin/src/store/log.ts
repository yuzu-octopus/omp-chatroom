import * as fs from "node:fs";
import { logPathFor, newMessageId } from "../ids";
import type { RecordKind, RoomRecord } from "./schema";

// §2.1 §3.3 — K8: one fd per process per logPath, in a globalThis registry.
// Opened O_RDWR (not O_WRONLY) because readSince/replay take this same fd; O_APPEND still gives
// the atomic append the plan relies on. Bun's `fs.constants` omits O_CLOEXEC and does not set it
// by default, so the raw Linux value is supplied explicitly (the only supported platform).
const O_CLOEXEC = process.platform === "linux" ? 0o2000000 : 0;
const FDS: Map<string, number> = ((globalThis as unknown as { __roomLogFds?: Map<string, number> })
  .__roomLogFds ??= new Map<string, number>());

export function roomLogFd(root: string, roomId: string): number {   // mkdirSync + O_APPEND|O_CLOEXEC
  const path = logPathFor(root, roomId);
  const existing = FDS.get(path);
  if (existing !== undefined) return existing;
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const fd = fs.openSync(
    path,
    fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | O_CLOEXEC,
  );
  FDS.set(path, fd);
  return fd;
}

export function appendLine(fd: number, line: string): void {        // line MUST end "\n"
  const buf = Buffer.from(line.endsWith("\n") ? line : `${line}\n`, "utf-8");
  let off = 0;
  while (off < buf.length) {
    const w = fs.writeSync(fd, buf, off, buf.length - off);
    if (w === 0) throw new Error("Short write");
    off += w;
  }
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

export function readSince(fd: number, seq: number, limit: number): RoomRecord[] {
  const out: RoomRecord[] = [];
  const cap = limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
  for (const line of readAllLines(fd)) {
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = validateRecord(parsed);
    if (record !== null && record.seq > seq) {
      out.push(record);
      if (out.length >= cap) break;
    }
  }
  return out;
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

export function closeRoomLog(root: string, roomId: string): void {  // K8 — last live session only
  const path = logPathFor(root, roomId);
  const fd = FDS.get(path);
  if (fd === undefined) return;
  try {
    fs.closeSync(fd);
  } finally {
    FDS.delete(path);
  }
}

// [invented] — §3.3's per-kind required-field table, as data (the validator's single source).
export const LOG_VALIDATION_FIELDS: Readonly<Record<RecordKind, readonly string[]>> = {
  msg:     ["v", "seq", "ts", "kind", "id", "from", "topic", "body"],
  claim:   ["v", "seq", "ts", "kind", "id", "from", "resource", "ttlMs"],
  release: ["v", "seq", "ts", "kind", "id", "from", "resource", "reason", "prevHolder"],
  note:    ["v", "seq", "ts", "kind", "id", "from", "topic", "body"],
  member:  ["v", "seq", "ts", "kind", "id", "from", "action"],
  gap:     ["v", "seq", "ts", "kind", "id", "from", "skipped", "reason"],
};

// §3.3 S3 — per-kind field validation on replay. A record that parses but does not match the
// RoomRecord shape is quarantined with gap{reason:"invalid"}.
const KINDS = new Set<string>(["msg", "claim", "release", "note", "member", "gap"]);
const RELEASE_REASONS = new Set<string>(["released", "expired", "reclaimed", "aborted"]);
const GAP_REASONS = new Set<string>(["retention", "invalid", "corrupt"]);
const MEMBER_ACTIONS = new Set<string>(["join", "leave"]);
const PERFORMATIVES = new Set<string>([
  "inform", "request", "propose", "accept", "reject", "query", "failure",
]);
const STRING_FIELDS = [
  "id", "from", "topic", "body", "to", "replyTo", "threadRoot",
  "resource", "prevHolder", "replyWith", "replyBy",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === "string" && KINDS.has(value);
}
function inSet(value: unknown, set: ReadonlySet<string>): boolean {
  return typeof value === "string" && set.has(value);
}

export function validateRecord(value: unknown): RoomRecord | null {       // [invented placement]
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
  if (kind === "msg" && value.performative !== undefined && !inSet(value.performative, PERFORMATIVES)) {
    return null;
  }
  if (kind === "claim" && !Number.isFinite(value.ttlMs)) return null;
  if (kind === "member" && !inSet(value.action, MEMBER_ACTIONS)) return null;
  if (kind === "release" && !inSet(value.reason, RELEASE_REASONS)) return null;
  if (kind === "gap" && (!Number.isInteger(value.skipped) || !inSet(value.reason, GAP_REASONS))) {
    return null;
  }
  // Every field was validated above; this cast is the validated boundary.
  const record: RoomRecord = value as RoomRecord;
  return record;
}

// Synthetic notice for a line replay could not use; never a real actor.
function gapRecord(seq: number, reason: "corrupt" | "invalid"): RoomRecord {
  return { v: 1, seq, ts: Date.now(), kind: "gap", id: newMessageId(), from: "system", skipped: 1, reason };
}

// F8 — [invented] the U6 mapping: errno → the detail string. Never throws.
export type LogOpenResult =
  | { ok: true; fd: number }
  | { ok: false; error: "room file not found" | "room file unwritable" | "room file corrupt" };
export function openRoomLog(root: string, roomId: string): LogOpenResult {   // [invented] F8 wrapper
  try {
    return { ok: true, fd: roomLogFd(root, roomId) };
  } catch (error) {
    let code: string | undefined;
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
      code = error.code;
    }
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: false, error: "room file not found" };
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return { ok: false, error: "room file unwritable" };
    }
    return { ok: false, error: "room file corrupt" };
  }
}
