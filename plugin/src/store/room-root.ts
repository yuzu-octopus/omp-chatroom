import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { roomDirNameFor, roomIdFor } from "../ids";
import { isValidRoomId, loadRoomConfig } from "./config";
import { acquireRoomLock, holdsRoomLock, releaseRoomLock, reserveRoomLock } from "./log";

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
 * The staging suffix: a file copied under this name is not part of the room yet.
 *
 * The "never clobbers" guard only looks for ".jsonl", so a staging name never counts as a
 * migrated log — that is what lets the next attempt retry after an interrupted copy.
 */
const STAGING_SUFFIX = ".migrate-tmp";

/**
 * The staging path for a file in the target room dir: the SAME directory, so the rename that
 * puts the file in place is atomic (a rename across filesystems is not).
 */
export function migrationTempPath(dest: string): string {
  return `${dest}${STAGING_SUFFIX}`;
}

/** A file staged for the atomic copy. */
interface StagedCopy {
  src: string;
  tmp: string;
  dest: string;
}

function rmQuiet(target: string): void {
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // Best-effort: a staging name that cannot be removed is harmless (it is not a ".jsonl").
  }
}

/** The legacy room's log files. */
function legacyLogs(legacyRoomDir: string): fs.Dirent[] {
  try {
    return fs
      .readdirSync(legacyRoomDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
  } catch {
    return [];
  }
}

/**
 * The legacy log that becomes the target room's history.
 *
 * THE RULE: the migration copies the log the LEGACY room itself would have opened — the file
 * named after the id the legacy root resolves. A pinned id that matches no log file means the
 * legacy room's own log is missing; with exactly ONE log in the directory there is nothing to
 * choose between, so that one is the room's history; with SEVERAL, picking one would adopt an
 * ARBITRARY file (the other half of the history would then sit on disk under a name the room
 * never opens), so the migration DECLINES and leaves the legacy room alone.
 *
 * @returns the source log, or null when the choice would be arbitrary.
 */
function pickSourceLog(logs: fs.Dirent[], legacyId: string): fs.Dirent | null {
  const match = logs.find((log) => log.name === `${legacyId}.jsonl`);
  if (match) return match;
  return logs.length === 1 ? logs[0] : null;
}

/**
 * Copy `staged` into the target room dir, atomically.
 *
 * Every file is staged under a temporary name in the SAME directory and then renamed into
 * place: a rename is atomic, so an interrupted copy leaves either no file or the whole file —
 * never a truncated one. The staging phase completes before the first rename, so a failure
 * there leaves the target without a log and the next attempt retries. A failure during the
 * renames rolls the whole set back, so the target never keeps a config that pins an id whose
 * log is missing.
 *
 * @param restore put the target's previous config back (the rollback path).
 */
function copyStaged(staged: StagedCopy[], restore: (() => void) | null): boolean {
  try {
    for (const item of staged) fs.copyFileSync(item.src, item.tmp);
  } catch {
    for (const item of staged) rmQuiet(item.tmp);
    return false;
  }
  const renamed: StagedCopy[] = [];
  try {
    for (const item of staged) {
      fs.renameSync(item.tmp, item.dest);
      renamed.push(item);
    }
  } catch {
    for (const item of renamed) rmQuiet(item.dest);
    if (restore) restore();
    for (const item of staged) rmQuiet(item.tmp);
    return false;
  }
  return true;
}

/**
 * Copy a legacy project-local room into the global store, once.
 *
 * Runs before the first open of the target root. It never clobbers: a target that already holds
 * a log is left alone, so this is a no-op after the first migration. The legacy `config.json`
 * travels with the room, and the copied log is named after the id the TARGET resolves — so the
 * migrated history is the file the target actually reads.
 *
 * The source log is never an arbitrary file: it is the log the legacy room itself would have
 * opened (see `pickSourceLog`), and an ambiguous legacy directory makes the migration DECLINE
 * rather than adopt one of several logs.
 *
 * The copy is ATOMIC: every file is staged under a temporary name in the target room dir and
 * renamed into place, so an interrupted copy leaves either nothing or the whole file — never a
 * truncated log the "never clobbers" guard would then refuse to repair.
 *
 * Two locks guard the move (F5). The legacy room's lock says whether a live process still owns
 * it: that room belongs to that process, so the migration is skipped and the legacy room is left
 * alone; that lock is released again when the copy is done. The target's lock keeps two omp
 * processes starting on the same project from both copying into the same room. When the caller
 * already holds the target's lock (the room's lock hand-off, see `openMigratedRoom`) the
 * migration leaves that lock alone — it is released when the room is closed.
 *
 * @returns true when files were copied.
 */
export function migrateLegacyRoom(legacyRoot: string, targetRoot: string): boolean {
  if (legacyRoot === targetRoot) return false;
  const legacyRoomDir = path.join(legacyRoot, "room");
  const targetRoomDir = path.join(targetRoot, "room");
  if (legacyLogs(legacyRoomDir).length === 0) return false; // no legacy room
  // A legacy room held by a LIVE process belongs to THAT process: copying it would fork the
  // history while the old owner keeps appending to the old file. Leave the legacy room alone.
  try {
    acquireRoomLock(legacyRoot);
  } catch {
    return false; // a live owner holds the legacy room
  }
  try {
    // Re-read under the lock: the legacy room's contents are stable while we hold it.
    const logs = legacyLogs(legacyRoomDir);
    if (logs.length === 0) return false;
    // F6 — the copied log must carry the id the TARGET will use. `resolveRoomId` reads the
    // room's config and falls back to the id minted from the root, so the target's id is the
    // legacy config's `roomId` when that is a valid non-empty id, and the target's minted id
    // otherwise (`roomId: ""` means "mint from the root"). A log named after a DIFFERENT id
    // would be copied into a file the target never reads, and the history would be invisible.
    const pinned = loadRoomConfig(legacyRoot).roomId;
    const pinnedValid = pinned !== "" && isValidRoomId(pinned);
    // The id the LEGACY room resolves for itself — its own log is the file the migration
    // copies (the one the legacy room would have opened).
    const legacyId = pinnedValid ? pinned : roomIdFor(legacyRoot);
    const targetId = pinnedValid ? pinned : roomIdFor(targetRoot);
    const source = pickSourceLog(logs, legacyId);
    if (source === null) {
      // Ambiguous: the legacy dir holds several logs and none of them is the log the legacy
      // room opens. Copying one of them would adopt an arbitrary history and hide the rest —
      // decline and leave the legacy room alone.
      return false;
    }
    // The copy takes the TARGET's lock, so two omp processes starting on the same project at
    // the same time cannot both copy into the same room. The caller may already hold it (the
    // room's lock hand-off): then it is ours, and it stays ours until the room is closed.
    const targetHeld = holdsRoomLock(targetRoot);
    if (!targetHeld) {
      try {
        acquireRoomLock(targetRoot);
      } catch {
        return false; // another process owns the target room
      }
    }
    try {
      // It never clobbers: a target that already holds a log is left alone.
      try {
        if (fs.readdirSync(targetRoomDir).some((name) => name.endsWith(".jsonl"))) return false;
      } catch {
        // no target room yet — proceed
      }
      fs.mkdirSync(targetRoomDir, { recursive: true });
      const staged: StagedCopy[] = [];
      const configSrc = path.join(legacyRoomDir, "config.json");
      const configDest = path.join(targetRoomDir, "config.json");
      if (fs.existsSync(configSrc)) {
        staged.push({ src: configSrc, tmp: migrationTempPath(configDest), dest: configDest });
      }
      const primaryDest = path.join(targetRoomDir, `${targetId}.jsonl`);
      staged.push({
        src: path.join(legacyRoomDir, source.name),
        tmp: migrationTempPath(primaryDest),
        dest: primaryDest,
      });
      // Any other legacy log (a leftover from an earlier id) travels under its own name, so the
      // migration never silently drops history.
      for (const log of logs) {
        if (log.name === source.name) continue;
        const dest = path.join(targetRoomDir, log.name);
        staged.push({
          src: path.join(legacyRoomDir, log.name),
          tmp: migrationTempPath(dest),
          dest,
        });
      }
      // The config is renamed into place FIRST: the target's room id comes from it, so the log
      // must never be there without the config that names it.
      let originalConfig: Buffer | null = null;
      try {
        originalConfig = fs.readFileSync(configDest);
      } catch {
        originalConfig = null; // the target has no config yet
      }
      const restoreConfig = (): void => {
        if (originalConfig === null) return; // the rollback already removed ours
        try {
          fs.writeFileSync(configDest, originalConfig);
        } catch {
          // Best-effort: the config is a cache of the room's id, not history.
        }
      };
      if (!copyStaged(staged, restoreConfig)) return false;
      // The tree is a rebuildable cache over the log — copy it so the first read after the move is
      // warm instead of rebuilding the summaries from scratch. Staged and renamed like the log:
      // a half-copied cache would be worse than none.
      const legacyTree = path.join(legacyRoomDir, "tree");
      if (fs.existsSync(legacyTree)) {
        const treeDest = path.join(targetRoomDir, "tree");
        const treeTmp = migrationTempPath(treeDest);
        try {
          // Recursive: a staging name left by a crashed run is a directory.
          fs.rmSync(treeTmp, { recursive: true, force: true });
          fs.cpSync(legacyTree, treeTmp, { recursive: true });
          fs.renameSync(treeTmp, treeDest);
        } catch {
          try {
            fs.rmSync(treeTmp, { recursive: true, force: true });
          } catch {
            // Best-effort: the cache rebuilds from the log.
          }
        }
      }
      return true;
    } finally {
      if (!targetHeld) releaseRoomLock(targetRoot);
    }
  } finally {
    releaseRoomLock(legacyRoot);
  }
}

/**
 * Migrate the legacy room into `targetRoot` and open it, holding the room's lock ACROSS both.
 *
 * The lock is taken BEFORE the migration and handed to the room's open, so there is no window
 * in which a second omp process on the same project could take the room's lock: our open would
 * then fail ("room file locked by another session"), `roomStoreFor` would throw, and the tool
 * would answer `{ok:false}` for the whole session — a hard loss of the room, not a degradation.
 * The room's close releases the lock, and a dead owner's lock is still reaped by the next
 * opener.
 */
export function openMigratedRoom<T>(legacyRoot: string, targetRoot: string, open: () => T): T {
  try {
    acquireRoomLock(targetRoot);
  } catch (error) {
    // The room belongs to a live process: the open would fail exactly like this.
    if (error instanceof Error && error.message.startsWith("room file locked by pid")) {
      throw new Error("room file locked by another session");
    }
    throw error;
  }
  try {
    migrateLegacyRoom(legacyRoot, targetRoot);
    // Hand the hold to the room's open: it adopts this hold instead of taking a second one (a
    // second acquire from the same process is an error), and the room's close releases it.
    if (!reserveRoomLock(targetRoot)) {
      // Nothing to hand over: give the lock back, so the open can take it itself.
      releaseRoomLock(targetRoot);
    }
    return open();
  } catch (error) {
    releaseRoomLock(targetRoot);
    throw error;
  }
}
