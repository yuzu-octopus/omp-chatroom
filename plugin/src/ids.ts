import * as crypto from "node:crypto";
export function roomIdFor(root: string): string {
  // K7/X1 — ROOT-STABLE, never a session id
  return `r${crypto.createHash("sha256").update(root).digest("hex").slice(0, 16)}`;
}
export function logPathFor(root: string, roomId: string): string {
  // K14 — the ONE log filename
  return `${root}/room/${roomId}.jsonl`;
}
export function resourceKey(topic: string, key: string): string {
  // "<topic>/<key>"
  return `${topic}/${key}`;
}
export function newMessageId(): string {
  // UUID v4
  return crypto.randomUUID();
}
