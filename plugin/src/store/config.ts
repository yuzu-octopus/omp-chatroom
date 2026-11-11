import * as fs from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { newMessageId, roomIdFor } from "../ids";
import { assertRoomWritePath } from "./log";
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
  // NOTE: `panelKey` and `coldTreeEnabled` were removed — neither was read anywhere (the live
  // panel shortcut is the `room-panel-key` *flag*, not a config field). Old config files may
  // still carry them; coerceConfig ignores unknown keys, so no migration is needed.
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
};

// Every NUMERIC key with its sane range. A zero/negative count or window persisted in
// config.json is a room-wide denial of service (logMaxRecords=0 prunes everything,
// maxBodyBytes=0 refuses every post), so the floor is load-bearing; the ceiling only bounds
// absurdity (a hand-edited 1e18 ttl must not hydrate a lease the write path could never mint).
// claimTtlMs reuses the write path's own 1 s – 24 h pair (store/log.ts) — one source, not two.
export const CONFIG_NUMERIC_BOUNDS: Readonly<
  Record<Exclude<keyof RoomConfig, "roomId">, { min: number; max: number }>
> = {
  maxT1PerTurn: { min: 1, max: 1_000_000 },
  maxT1Tokens: { min: 1, max: 1_000_000_000 },
  coalesceCount: { min: 1, max: 1_000_000 },
  coalesceMs: { min: 1_000, max: 2_592_000_000 },
  postsPerWindow: { min: 1, max: 1_000_000 },
  burstPosts: { min: 1, max: 1_000_000 },
  claimTtlMs: { min: 1_000, max: 86_400_000 },
  claimSweepMs: { min: 1_000, max: 86_400_000 },
  maxBodyBytes: { min: 1, max: 1_000_000_000 },
  logMaxRecords: { min: 1, max: 1_000_000 },
  logMaxAgeMs: { min: 1_000, max: 31_536_000_000 },
  compactionCallsPerDay: { min: 1, max: 1_000_000_000 },
  digestBudgetTokens: { min: 1, max: 1_000_000_000 },
};

/**
 * The ONE clamp (config.ts owns it; room-command.ts `config set` calls it rather than mirroring
 * the table — two tables drift). Returns the value and whether it moved.
 */
export function clampNumericConfig(
  key: string,
  value: number,
): { value: number; clamped: boolean } {
  const bounds = (CONFIG_NUMERIC_BOUNDS as Readonly<Record<string, { min: number; max: number }>>)[
    key
  ];
  if (bounds === undefined) return { value, clamped: false };
  const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
  return { value: clamped, clamped: clamped !== value };
}

/** A clamp report: which field moved and from what. Wired to `pi.logger.warn` where `pi` exists. */
export type ConfigClampReport = (key: string, raw: number, clamped: number) => void;

export function configPath(root: string): string {
  // <root>/room/config.json
  return `${root}/room/config.json`;
}
// Field-by-field coercion over the defaults: an unknown key is ignored and a wrong-typed value
// falls back to its default. The plugin owns this file, but it is still on-disk input.
function coerceConfig(raw: unknown, onClamp?: ConfigClampReport): RoomConfig {
  const config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  if (typeof raw !== "object" || raw === null) return config;
  // Each entry is type-checked against the default's type before it is written; the cast lets the
  // one loop write a mixed-type record.
  const target = config as unknown as Record<string, string | number>;
  for (const [key, value] of Object.entries(raw)) {
    const current = target[key];
    if (typeof current === "string" && typeof value === "string") {
      target[key] = value;
    } else if (typeof current === "number" && typeof value === "number" && Number.isFinite(value)) {
      // A persisted 0/negative count or window is a room-wide DoS — clamp to the floor, loudly.
      const { value: clamped, clamped: moved } = clampNumericConfig(key, value);
      target[key] = clamped;
      if (moved) onClamp?.(key, value, clamped);
    }
  }
  // roomId becomes a filename (logPathFor), so a type check is not enough: an id containing
  // `/`, `\` or `..` would escape the room directory. Fall back to "mint from the root",
  // exactly like a wrong-typed value falls back to its default.
  if (config.roomId !== "" && !isValidRoomId(config.roomId)) config.roomId = "";
  return config;
}

/**
 * The roomId alphabet: what `roomIdFor` mints (`r` + 16 hex) plus the documented custom form
 * (`"custom-room"`). Nothing containing a path separator, so a config-provided id can never
 * escape `${root}/room/` when it becomes `${roomId}.jsonl`.
 */
const ROOM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function isValidRoomId(value: string): boolean {
  return ROOM_ID_RE.test(value);
}

export function loadRoomConfig(root: string, onClamp?: ConfigClampReport): RoomConfig {
  // H3 — config.json is READ for the room id and then (via `resolveRoomId`) WRITTEN. A planted
  // link must be refused here too: following it would read a foreign file, and the later save
  // would overwrite it. Refusal is outside the try — an absent file is defaults, a link is not.
  assertRoomWritePath(root, configPath(root));
  try {
    return coerceConfig(JSON.parse(fs.readFileSync(configPath(root), "utf-8")), onClamp);
  } catch {
    return { ...DEFAULT_ROOM_CONFIG }; // absent or unreadable → defaults
  }
}

export function saveRoomConfig(root: string, config: RoomConfig): void {
  const path = configPath(root);
  assertRoomWritePath(root, path);
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  // Write a unique temp INSIDE the verified directory and rename it into place. `rename(2)`
  // replaces a link rather than writing through it, so a link planted after the check cannot
  // redirect these bytes, and a crash cannot leave a half-written config that `coerceConfig`
  // would silently read as defaults.
  const tmp = `${path}.${newMessageId()}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf-8",
      flag: "wx",
    });
    fs.renameSync(tmp, path);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // Best-effort: the temp is inert either way (it is not the config the room reads).
    }
    throw error;
  }
}

// X1 — the ONE room-id resolver: config override > roomIdFor(root). Root-stable, never a session id.
export function resolveRoomId(root: string): string {
  // [invented]
  const config = loadRoomConfig(root);
  // Defense in depth for callers that construct a config without going through coerceConfig:
  // only a valid id wins over the minted one.
  if (config.roomId !== "" && isValidRoomId(config.roomId)) return config.roomId;
  const roomId = roomIdFor(root);
  saveRoomConfig(root, { ...config, roomId }); // persist once; every later session reads it back
  return roomId;
}

// K6 — the runtime flag. `room-panel-key` is the optional shortcut that opens the panel (R4:
// default "" disables it); the panel reads it at registration time. (`room-cold-tree` was
// removed — registered but never read. `coerceConfig` ignores unknown keys, so old config
// files carrying `coldTreeEnabled` need no migration.)
//
// Configuration lives in `local://room/config.json` (see `loadRoomConfig`) and is editable via
// `/room config`.
export function registerRoomFlags(pi: ExtensionAPI): void {
  pi.registerFlag("room-panel-key", {
    description: "Keyboard shortcut that opens the agent chatroom panel (empty = disabled)",
    type: "string",
    default: "",
  });
}

export function resolveRoomConfig(pi: ExtensionAPI, root: string): RoomConfig {
  // The clamp is load-bearing (a floored value changes behavior), so it must not be silent
  // where a logger exists: the tool/command paths resolve through here, not loadRoomConfig.
  return loadRoomConfig(root, (key, raw, clamped) =>
    pi.logger.warn(`omp-agent-chatroom: config ${key}=${raw} out of range, clamped to ${clamped}`),
  );
}
