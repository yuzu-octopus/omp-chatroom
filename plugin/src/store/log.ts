import * as fs from "node:fs";
import { logPathFor } from "../ids";
import type { RecordKind, RoomRecord } from "./schema";
// §2.1 §3.3 — K8: one fd per process per logPath, in a globalThis registry.
export function roomLogFd(root: string, roomId: string): number {   // mkdirSync + O_APPEND|O_CLOEXEC
  throw new Error("not implemented");
}
export function appendLine(fd: number, line: string): void {        // line MUST end "\n"
  throw new Error("not implemented");
}
export function readSince(fd: number, seq: number, limit: number): RoomRecord[] {
  throw new Error("not implemented");
}
export function replay(fd: number): { records: RoomRecord[]; skipped: number } {   // §3.3
  throw new Error("not implemented");
}
export function closeRoomLog(root: string, roomId: string): void {  // K8 — last live session only
  throw new Error("not implemented");
}

// S3 requires per-kind field validation on replay; §2.1 assigns it no file.
export function validateRecord(value: unknown): RoomRecord | null {       // [invented placement]
  throw new Error("not implemented");
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

// F8 — [invented] the U6 mapping: errno → the detail string. Never throws.
export type LogOpenResult =
  | { ok: true; fd: number }
  | { ok: false; error: "room file not found" | "room file unwritable" | "room file corrupt" };
export function openRoomLog(root: string, roomId: string): LogOpenResult {   // [invented] F8 wrapper
  throw new Error("not implemented");
}
