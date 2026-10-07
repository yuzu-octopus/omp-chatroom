import * as fs from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
// SCAFFOLD-DEFINED — mirrors the manifest settings, which are unreachable at runtime (R6).
export interface RoomConfig {
  roomId: string;                 // "" = mint from the root (roomIdFor(root)); non-empty = explicit override
  maxT1PerTurn: number;
  maxT1Tokens: number;
  coalesceCount: number;
  coalesceMs: number;
  postsPerWindow: number;
  burstPosts: number;
  claimTtlMs: number;
  claimSweepMs: number;           // K3
  maxBodyBytes: number;           // K19
  logMaxRecords: number;
  logMaxAgeMs: number;
  compactionCallsPerDay: number;  // K4 — a RATE, not a total
  digestBudgetTokens: number;     // K5 — digest only; the routing rule is excluded
  panelKey: string;
  coldTreeEnabled: boolean;       // K6 — the runtime toggle (flag), not a manifest feature
}

// Values are the §5.2 caps verbatim (10 / 2048 / 20 / 5 min / 1 per 2 s / 10 / 300 s / 5 s /
// 8192 / 5000 / 7 d / 20000 / 3800); `roomId: ""` means "mint from the root".
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  roomId: "", maxT1PerTurn: 10, maxT1Tokens: 2048, coalesceCount: 20, coalesceMs: 300_000,
  postsPerWindow: 1, burstPosts: 10, claimTtlMs: 300_000, claimSweepMs: 5_000,
  maxBodyBytes: 8192, logMaxRecords: 5_000, logMaxAgeMs: 604_800_000,
  compactionCallsPerDay: 20_000, digestBudgetTokens: 3_800, panelKey: "", coldTreeEnabled: true,
};
export function configPath(root: string): string {               // <root>/room/config.json
  throw new Error("not implemented");
}
export function loadRoomConfig(root: string): RoomConfig {
  throw new Error("not implemented");
}
export function saveRoomConfig(root: string, config: RoomConfig): void {
  throw new Error("not implemented");
}

// X1 — the ONE room-id resolver: config override > roomIdFor(root). Root-stable, never a session id.
export function resolveRoomId(root: string): string {                            // [invented]
  throw new Error("not implemented");
}

// K6 — the ONLY feature-toggle mechanism. Registers every flag once; nothing reads a manifest feature.
export function registerRoomFlags(pi: ExtensionAPI): void {      // [invented name]
  throw new Error("not implemented");
}
export function resolveRoomConfig(pi: ExtensionAPI, root: string): RoomConfig {   // flags > file > defaults
  throw new Error("not implemented");
}
