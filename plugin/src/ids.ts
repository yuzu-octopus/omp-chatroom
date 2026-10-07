import * as crypto from "node:crypto";
export function roomIdFor(root: string): string {                   // K7/X1 — ROOT-STABLE, never a session id
  throw new Error("not implemented");
}
export function logPathFor(root: string, roomId: string): string {  // K14 — the ONE log filename
  throw new Error("not implemented");
}
export function resourceKey(topic: string, key: string): string {   // "<topic>/<key>"
  throw new Error("not implemented");
}
export function newMessageId(): string {                            // UUID v4
  throw new Error("not implemented");
}
