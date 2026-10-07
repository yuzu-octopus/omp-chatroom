import * as fs from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { roomIdFor } from "../ids";
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
  return `${root}/room/config.json`;
}

// Field-by-field coercion over the defaults: an unknown key is ignored and a wrong-typed value
// falls back to its default. The plugin owns this file, but it is still on-disk input.
function coerceConfig(raw: unknown): RoomConfig {
  const config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  if (typeof raw !== "object" || raw === null) return config;
  // Each entry is type-checked against the default's type before it is written; the cast lets the
  // one loop write a mixed-type record.
  const target = config as unknown as Record<string, string | number | boolean>;
  for (const [key, value] of Object.entries(raw)) {
    const current = target[key];
    if (typeof current === "string" && typeof value === "string") {
      target[key] = value;
    } else if (typeof current === "number" && typeof value === "number" && Number.isFinite(value)) {
      target[key] = value;
    } else if (typeof current === "boolean" && typeof value === "boolean") {
      target[key] = value;
    }
  }
  return config;
}

export function loadRoomConfig(root: string): RoomConfig {
  try {
    return coerceConfig(JSON.parse(fs.readFileSync(configPath(root), "utf-8")));
  } catch {
    return { ...DEFAULT_ROOM_CONFIG };   // absent or unreadable → defaults
  }
}

export function saveRoomConfig(root: string, config: RoomConfig): void {
  const path = configPath(root);
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// X1 — the ONE room-id resolver: config override > roomIdFor(root). Root-stable, never a session id.
export function resolveRoomId(root: string): string {                            // [invented]
  const config = loadRoomConfig(root);
  if (config.roomId !== "") return config.roomId;
  const roomId = roomIdFor(root);
  saveRoomConfig(root, { ...config, roomId });   // persist once; every later session reads it back
  return roomId;
}

const PANEL_KEY_FLAG = "room-panel-key";
const COLD_TREE_FLAG = "room-cold-tree";
// A registered flag always returns its value (default or CLI), so `getFlag` cannot distinguish
// "user passed the flag" from "unset". The file therefore wins for a flag left at its default, and
// a flag only overrides the file when it carries a non-default value.
const FLAG_DEFAULTS: Readonly<Record<string, boolean | string>> = {
  [PANEL_KEY_FLAG]: "",
  [COLD_TREE_FLAG]: true,
};

// K6 — the ONLY feature-toggle mechanism. Registers every flag once; nothing reads a manifest feature.
export function registerRoomFlags(pi: ExtensionAPI): void {      // [invented name]
  pi.registerFlag(PANEL_KEY_FLAG, { description: "KeyId for the /room shortcut; empty disables", type: "string", default: "" });
  pi.registerFlag(COLD_TREE_FLAG, { description: "Enable the cold summary tree (Option B)", type: "boolean", default: true });
}

export function resolveRoomConfig(pi: ExtensionAPI, root: string): RoomConfig {   // flags > file > defaults
  const config = loadRoomConfig(root);
  const panelKey = pi.getFlag(PANEL_KEY_FLAG);
  if (typeof panelKey === "string" && panelKey !== FLAG_DEFAULTS[PANEL_KEY_FLAG]) {
    config.panelKey = panelKey;
  }
  const coldTree = pi.getFlag(COLD_TREE_FLAG);
  if (typeof coldTree === "boolean" && coldTree !== FLAG_DEFAULTS[COLD_TREE_FLAG]) {
    config.coldTreeEnabled = coldTree;
  }
  return config;
}
