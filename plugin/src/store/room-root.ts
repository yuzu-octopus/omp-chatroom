import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { roomDirNameFor, roomIdFor } from "../ids";
import { isValidRoomId, loadRoomConfig } from "./config";
import { acquireRoomLock, releaseRoomLock } from "./log";

/**
 * The legacy project-local room root: `<cwd>/.omp-room`.
 *
 * Kept for two reasons: the migration source, and the temp-root location (see `roomRootFor`).
 */
export function legacyRoomRoot(cwd: string): string {
  return path.join(cwd, ".omp-room");
}

/**
 * The global room root, inside omp's own session store: `<sessions>/rooms/<hash16>`.
 *
 * `getSessionsDir()` is where the host keeps session transcripts, so the room lands under the
 * same XDG rules the host uses (`~/.omp/agent/sessions`, or `$XDG_DATA_HOME/omp/sessions`) and
 * stays out of the user's working tree. The `<hash16>` leaf is derived from the project path, so
 * two projects never share a room and one project always maps to the same room.
 *
 * The leaf is NOT the room id: the id is minted from the room ROOT (`roomIdFor`), so the two
 * never have to agree.
 */
export function globalRoomRoot(cwd: string, sessionsRoot: string = getSessionsDir()): string {
  return path.join(sessionsRoot, "rooms", roomDirNameFor(cwd));
}

function isUnderTemp(cwd: string): boolean {
  const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(cwd));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * WHERE the room lives.
 *
 * The room must be one per project, shared by the main session and every subagent it spawns.
 * `ctx.localProtocolOptions` is per-SESSION (a subagent's artifacts dir is its own session file
 * minus `.jsonl`), so deriving the room from it gave every agent a private room — the claim
 * board coordinated nobody. Verified live: main resolved `<session>/local` while its subagent
 * resolved `<session>/Task1/local`. `ctx.cwd` is the project directory and is inherited by
 * subagents, so it is the only stable per-tree key.
 *
 * Two locations, by rule:
 * - a project under the system temp dir stays project-local (`<cwd>/.omp-room`): a test, a
 *   scratch task or a throwaway worktree must never write into the user's real room store;
 * - every other project uses the global store (`globalRoomRoot`).
 */
export function roomRootFor(ctx: ExtensionContext): string {
  const cwd = ctx.cwd;
  if (isUnderTemp(cwd)) return legacyRoomRoot(cwd);
  return globalRoomRoot(cwd);
}

/**
 * Copy a legacy project-local room into the global store, once.
 *
 * Runs before the first open of the target root. It never clobbers: a target that already holds
 * a log is left alone, so this is a no-op after the first migration. The legacy `config.json`
 * travels with the room, and the copied log is named after the id the TARGET resolves — so the
 * migrated history is the file the target actually reads.
 *
 * Two locks guard the move (F5). The legacy room's lock says whether a live process still owns
 * it: that room belongs to that process, so the migration is skipped and the legacy room is left
 * alone. The target's lock keeps two omp processes starting on the same project from both
 * copying into the same room. Both locks are released again: the target's lock is taken LATER by
 * `openRoomLog`, and a lock left behind in the user's project tree would block a later
 * downgrade to the project-local room.
 *
 * @returns true when files were copied.
 */
export function migrateLegacyRoom(legacyRoot: string, targetRoot: string): boolean {
  if (legacyRoot === targetRoot) return false;
  const legacyRoomDir = path.join(legacyRoot, "room");
  const targetRoomDir = path.join(targetRoot, "room");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(legacyRoomDir, { withFileTypes: true });
  } catch {
    return false; // no legacy room
  }
  const logs = entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl"));
  if (logs.length === 0) return false;
  // A legacy room held by a LIVE process belongs to THAT process: copying it would fork the
  // history while the old owner keeps appending to the old file. Leave the legacy room alone.
  try {
    acquireRoomLock(legacyRoot);
  } catch {
    return false; // a live owner holds the legacy room
  }
  try {
    // The copy takes the TARGET's lock, so two omp processes starting on the same project at the
    // same time cannot both copy into the same room.
    try {
      acquireRoomLock(targetRoot);
    } catch {
      return false; // another process owns the target room
    }
    try {
      // It never clobbers: a target that already holds a log is left alone.
      try {
        if (fs.readdirSync(targetRoomDir).some((name) => name.endsWith(".jsonl"))) return false;
      } catch {
        // no target room yet — proceed
      }
      fs.mkdirSync(targetRoomDir, { recursive: true });
      const hasConfig = fs.existsSync(path.join(legacyRoomDir, "config.json"));
      if (hasConfig) {
        fs.copyFileSync(
          path.join(legacyRoomDir, "config.json"),
          path.join(targetRoomDir, "config.json"),
        );
      }
      // F6 — the copied log must carry the id the TARGET will use. `resolveRoomId` reads the
      // room's config and falls back to the id minted from the root, so the target's id is the
      // legacy config's `roomId` when that is a valid non-empty id, and the target's minted id
      // otherwise (`roomId: ""` means "mint from the root"). A log named after a DIFFERENT id
      // would be copied into a file the target never reads, and the history would be invisible.
      const pinned = loadRoomConfig(legacyRoot).roomId;
      const targetId = pinned !== "" && isValidRoomId(pinned) ? pinned : roomIdFor(targetRoot);
      const source = logs.find((log) => log.name === `${targetId}.jsonl`) ?? logs[0];
      fs.copyFileSync(
        path.join(legacyRoomDir, source.name),
        path.join(targetRoomDir, `${targetId}.jsonl`),
      );
      // Any other legacy log (a leftover from an earlier id) travels under its own name, so the
      // migration never silently drops history.
      for (const log of logs) {
        if (log.name === source.name) continue;
        fs.copyFileSync(path.join(legacyRoomDir, log.name), path.join(targetRoomDir, log.name));
      }
      // The tree is a rebuildable cache over the log — copy it so the first read after the move is
      // warm instead of rebuilding the summaries from scratch.
      const legacyTree = path.join(legacyRoomDir, "tree");
      if (fs.existsSync(legacyTree)) {
        fs.cpSync(legacyTree, path.join(targetRoomDir, "tree"), { recursive: true });
      }
      return true;
    } finally {
      releaseRoomLock(targetRoot);
    }
  } finally {
    releaseRoomLock(legacyRoot);
  }
}
