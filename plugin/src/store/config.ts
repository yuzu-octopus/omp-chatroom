import * as fs from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { roomIdFor } from "../ids";
// SCAFFOLD-DEFINED — mirrors the manifest settings, which are unreachable at runtime (R6).
export interface RoomConfig {
  roomId: string; // "" = mint from the root (roomIdFor(root)); non-empty = explicit override
  maxT1PerTurn: number;
  maxT1Tokens: number;
  coalesceCount: number;
  coalesceMs: number;
  postsPerWindow: number;
  burstPosts: number;
  claimTtlMs: number;
  claimSweepMs: number; // K3
  maxBodyBytes: number; // K19
  logMaxRecords: number;
  logMaxAgeMs: number;
  compactionCallsPerDay: number; // K4 — a RATE, not a total
  digestBudgetTokens: number; // K5 — digest only; the routing rule is excluded
  panelKey: string;
  coldTreeEnabled: boolean; // K6 — the runtime toggle (flag), not a manifest feature
}

// Values are the §5.2 caps verbatim (10 / 2048 / 20 / 5 min / 1 per 2 s / 10 / 300 s / 5 s /
// 8192 / 5000 / 7 d / 20000 / 3800); `roomId: ""` means "mint from the root".
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  roomId: "",
  maxT1PerTurn: 10,
  maxT1Tokens: 2048,
  coalesceCount: 20,
  coalesceMs: 300_000,
  postsPerWindow: 1,
  burstPosts: 10,
  claimTtlMs: 300_000,
  claimSweepMs: 5_000,
  maxBodyBytes: 8192,
  logMaxRecords: 5_000,
  logMaxAgeMs: 604_800_000,
  compactionCallsPerDay: 20_000,
  digestBudgetTokens: 3_800,
  panelKey: "",
  coldTreeEnabled: true,
};

export function configPath(root: string): string {
  // <root>/room/config.json
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
    return { ...DEFAULT_ROOM_CONFIG }; // absent or unreadable → defaults
  }
}

export function saveRoomConfig(root: string, config: RoomConfig): void {
  const path = configPath(root);
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

// X1 — the ONE room-id resolver: config override > roomIdFor(root). Root-stable, never a session id.
export function resolveRoomId(root: string): string {
  // [invented]
  const config = loadRoomConfig(root);
  if (config.roomId !== "") return config.roomId;
  const roomId = roomIdFor(root);
  saveRoomConfig(root, { ...config, roomId }); // persist once; every later session reads it back
  return roomId;
}

// K6 — the two runtime flags. `room-panel-key` is the optional shortcut that opens the panel
// (R4: default "" disables it); `room-cold-tree` toggles the cold-tree view. Both are read by
// the panel at registration time.
//
// Configuration lives in `local://room/config.json` (see `loadRoomConfig`) and is editable via
// `/room config`.
export function registerRoomFlags(pi: ExtensionAPI): void {
  pi.registerFlag("room-panel-key", {
    description: "Keyboard shortcut that opens the agent chatroom panel (empty = disabled)",
    type: "string",
    default: "",
  });
  pi.registerFlag("room-cold-tree", {
    description: "Enable the cold-tree view in the chatroom panel",
    type: "boolean",
    default: true,
  });
}

export function resolveRoomConfig(_pi: ExtensionAPI, root: string): RoomConfig {
  return loadRoomConfig(root);
}
