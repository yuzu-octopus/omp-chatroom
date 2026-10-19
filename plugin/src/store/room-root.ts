import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { roomDirNameFor, roomIdFor } from "../ids";

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
 * a log is left alone, so this is a no-op after the first migration. The log keeps its legacy
 * name and the legacy `config.json` travels with it, so the room id (which the config pins)
 * survives the move; a legacy room with no config gets its log renamed to the id the target
 * would mint.
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
  for (const log of logs) {
    const name = hasConfig ? log.name : `${roomIdFor(targetRoot)}.jsonl`;
    fs.copyFileSync(path.join(legacyRoomDir, log.name), path.join(targetRoomDir, name));
  }
  // The tree is a rebuildable cache over the log — copy it so the first read after the move is
  // warm instead of rebuilding the summaries from scratch.
  const legacyTree = path.join(legacyRoomDir, "tree");
  if (fs.existsSync(legacyTree)) {
    fs.cpSync(legacyTree, path.join(targetRoomDir, "tree"), { recursive: true });
  }
  return true;
}
