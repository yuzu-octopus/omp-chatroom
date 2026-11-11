import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { logPathFor, roomIdFor } from "../src/ids";
import { DEFAULT_ROOM_CONFIG, resolveRoomId, saveRoomConfig } from "../src/store/config";
import {
  acquireRoomLock,
  closeRoomLog,
  lockPathFor,
  openRoomLog,
  roomLogFd,
} from "../src/store/log";
import {
  globalRoomRoot,
  legacyRoomRoot,
  migrateLegacyRoom,
  migrationTempPath,
  openMigratedRoom,
  roomRootFor,
} from "../src/store/room-root";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-root-"));
}

function fakeCtx(cwd: string): ExtensionContext {
  return { cwd, agent: { id: "Main" } } as unknown as ExtensionContext;
}

/**
 * A byte-for-byte snapshot of a directory tree: every file's relative path and base64 content.
 *
 * Two snapshots that match prove the tree was not touched — the "the legacy room survives
 * intact" claim, checked on the CONTENT and not just on the file names.
 */
function snapshotTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // the directory is gone
    }
    for (const entry of entries) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        out.push(`${rel}:${fs.readFileSync(full).toString("base64")}`);
      }
    }
  };
  walk(dir, "");
  return out.sort();
}

test("a project outside the temp dir resolves to the global room store", () => {
  const root = roomRootFor(fakeCtx("/home/someone/project"));
  expect(root).toBe(globalRoomRoot("/home/someone/project"));
  expect(root).toContain(`${path.sep}rooms${path.sep}`);
});

test("a project under the temp dir stays project-local", () => {
  const tmp = tempRoot();
  expect(roomRootFor(fakeCtx(tmp))).toBe(legacyRoomRoot(tmp));
});

test("two projects never share a room, and one project always maps to the same room", () => {
  const a = globalRoomRoot("/home/someone/a");
  const b = globalRoomRoot("/home/someone/b");
  expect(a).not.toBe(b);
  expect(globalRoomRoot("/home/someone/a")).toBe(a);
});

test("the global root sits under omp's session store", () => {
  const root = globalRoomRoot("/home/someone/project");
  expect(root.startsWith(path.join(getSessionsDir(), "rooms"))).toBe(true);
  // The leaf is a hex hash of the project path, never a path fragment of it.
  const leaf = path.basename(root);
  expect(leaf).toMatch(/^[0-9a-f]{16}$/);
  expect(root).not.toContain("someone");
});

test("migration copies the legacy log and config, and keeps the pinned room id", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(legacyRoomDir, { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(
    path.join(legacyRoomDir, "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(true);
  // The config travels with the log, so the room id survives the move.
  expect(fs.existsSync(path.join(target, "room", "config.json"))).toBe(true);
  // The history travelled with it, byte for byte.
  expect(fs.readFileSync(path.join(target, "room", `${legacyId}.jsonl`), "utf-8")).toBe(
    '{"seq":1}\n',
  );
  expect(fs.readFileSync(path.join(target, "room", "config.json"), "utf-8")).toBe(
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );
});

test("a successful migration is a MOVE: the legacy room is gone from the project", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(legacyRoomDir, { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(
    path.join(legacyRoomDir, "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  // The whole legacy room is gone — the room dir AND the root that held it.
  expect(fs.existsSync(legacyRoomDir)).toBe(false);
  expect(fs.existsSync(legacy)).toBe(false);
  // The global room holds the history, the config and the same room id.
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(true);
  expect(fs.existsSync(path.join(target, "room", "config.json"))).toBe(true);
  expect(resolveRoomId(target)).toBe(legacyId);
});

test("a successful migration leaves the tree cache behind: the target rebuilds it", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(path.join(legacyRoomDir, "tree"), { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(path.join(legacyRoomDir, "tree", "64"), "tree-cache-bytes");

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  // The cache did NOT travel: its nodes are indexed by dense positions into the legacy's records
  // array, which (after a retention prune) is shorter than the file the target replays - so a
  // copied cache would describe the WRONG records, and the dense-prefix CAS would keep the
  // compactor from ever rebuilding them. A cold cache costs one rebuild; a wrong one costs the
  // truth.
  expect(fs.existsSync(path.join(target, "room", "tree"))).toBe(false);
  // The legacy cache went with the room.
  expect(fs.existsSync(path.join(legacy, "room", "tree"))).toBe(false);
  expect(fs.existsSync(legacy)).toBe(false);
});

test("migration never clobbers a room that already has a log", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyId = roomIdFor(legacy);
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.mkdirSync(path.join(target, "room"), { recursive: true });
  fs.writeFileSync(path.join(target, "room", "r-existing.jsonl"), '{"seq":99}\n');
  const before = snapshotTree(legacy);

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  expect(fs.existsSync(path.join(target, "room", "r-existing.jsonl"))).toBe(true);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(false);
  // A SKIPPED migration removes NOTHING: the legacy room is still there, byte for byte.
  expect(snapshotTree(legacy)).toEqual(before);
  expect(fs.existsSync(legacy)).toBe(true);
});

test("migration of a legacy room without a config names the log after the target's id", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", "r-legacy.jsonl"), '{"seq":1}\n');

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(fs.existsSync(path.join(target, "room", `${roomIdFor(target)}.jsonl`))).toBe(true);
  expect(fs.existsSync(path.join(target, "room", "r-legacy.jsonl"))).toBe(false);
});

test("migration is a no-op without a legacy room, and for an identical source and target", () => {
  const empty = tempRoot();
  expect(migrateLegacyRoom(empty, tempRoot())).toBe(false);
  expect(migrateLegacyRoom(empty, empty)).toBe(false);
});

// --- F5: the migration copies a room another process may still be writing ---------

/** A legacy room with one log, ready to be migrated. */
function legacyRoomWithLog(): { legacy: string; legacyId: string } {
  const legacy = tempRoot();
  const legacyId = roomIdFor(legacy);
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  return { legacy, legacyId };
}

test("migration skips a legacy room that a LIVE process still holds (F5)", () => {
  const { legacy, legacyId } = legacyRoomWithLog();
  const target = tempRoot();
  // The lock file holds the owner pid; this process is alive, so the room belongs to a live
  // writer and must be left alone.
  fs.writeFileSync(lockPathFor(legacy), String(process.pid));

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  // The legacy room is untouched — including its lock, which the live owner still needs...
  expect(fs.readFileSync(lockPathFor(legacy), "utf-8")).toBe(String(process.pid));
  expect(fs.existsSync(path.join(legacy, "room", `${legacyId}.jsonl`))).toBe(true);
  // ...and nothing was copied into the target.
  expect(fs.existsSync(path.join(target, "room"))).toBe(false);
});

test("a legacy room held by a LIVE process is left completely untouched, and nothing is copied", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(path.join(legacyRoomDir, "tree"), { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(
    path.join(legacyRoomDir, "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );
  fs.writeFileSync(path.join(legacyRoomDir, "tree", "64"), "tree-cache-bytes");
  // The lock file holds the owner pid; this process is alive, so the room belongs to a live
  // writer and must be left alone.
  fs.writeFileSync(lockPathFor(legacy), String(process.pid));
  const before = snapshotTree(legacy);

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  // BYTE FOR BYTE: the directory, its log, its config and its tree cache are all as they were —
  // the live owner is still writing here.
  expect(snapshotTree(legacy)).toEqual(before);
  expect(fs.existsSync(legacy)).toBe(true);
  expect(fs.existsSync(path.join(legacy, "room", `${legacyId}.jsonl`))).toBe(true);
  expect(fs.existsSync(path.join(legacy, "room", "config.json"))).toBe(true);
  expect(fs.existsSync(path.join(legacy, "room", "tree", "64"))).toBe(true);
  // And NOTHING was copied into the target.
  expect(fs.existsSync(path.join(target, "room"))).toBe(false);
});

test("the removal never follows a symlink out of the tree", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(legacyRoomDir, { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  // A directory OUTSIDE the legacy tree, linked INTO it: a removal that followed the link
  // would delete the target's contents.
  const outside = tempRoot();
  fs.writeFileSync(path.join(outside, "precious.txt"), "precious");
  fs.symlinkSync(outside, path.join(legacyRoomDir, "link-to-outside"));

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  // The link was unlinked as a link; the directory it pointed at is untouched.
  expect(fs.existsSync(path.join(outside, "precious.txt"))).toBe(true);
  expect(fs.readFileSync(path.join(outside, "precious.txt"), "utf-8")).toBe("precious");
  expect(fs.existsSync(legacyRoomDir)).toBe(false);
  expect(fs.existsSync(legacy)).toBe(false);
});

test("migration does not copy into a target that a LIVE process holds (F5)", () => {
  const { legacy, legacyId } = legacyRoomWithLog();
  const target = tempRoot();
  fs.mkdirSync(path.join(target, "room"), { recursive: true });
  fs.writeFileSync(lockPathFor(target), String(process.pid));

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(false);
  // The live owner's lock survives the attempt.
  expect(fs.readFileSync(lockPathFor(target), "utf-8")).toBe(String(process.pid));
});

test("migration leaves no lock behind: the project tree is clean and the target opens (F5)", () => {
  const { legacy, legacyId } = legacyRoomWithLog();
  const target = tempRoot();

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  // No stale pid in the user's project tree — a leftover would block a later downgrade.
  expect(fs.existsSync(lockPathFor(legacy))).toBe(false);
  // The target's lock was released too: openRoomLog takes it later, and a lock left behind
  // would make that acquisition fail.
  expect(fs.existsSync(lockPathFor(target))).toBe(false);
  const opened = openRoomLog(target, legacyId);
  expect(opened.ok).toBe(true);
});

// --- F6: the migration can orphan the copied log ----------------------------------

test("migration names the copied log after the id the TARGET resolves (F6)", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  // The config pins an id the log was never named after: copied as-is, the history would sit
  // in a file the target never reads.
  fs.writeFileSync(path.join(legacy, "room", "r-legacy.jsonl"), '{"seq":1}\n');
  fs.writeFileSync(
    path.join(legacy, "room", "config.json"),
    `${JSON.stringify({ roomId: "custom-room" })}\n`,
  );

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(resolveRoomId(target)).toBe("custom-room");
  // The migrated history IS the file the target reads.
  expect(fs.existsSync(logPathFor(target, resolveRoomId(target)))).toBe(true);
  expect(fs.existsSync(path.join(target, "room", "custom-room.jsonl"))).toBe(true);
});

test("migration names the copied log after the target's minted id when the config pins none (F6)", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", "r-legacy.jsonl"), '{"seq":1}\n');
  // `roomId: ""` is the documented "mint from the root".
  fs.writeFileSync(path.join(legacy, "room", "config.json"), `${JSON.stringify({ roomId: "" })}\n`);

  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(resolveRoomId(target)).toBe(roomIdFor(target));
  expect(fs.existsSync(logPathFor(target, resolveRoomId(target)))).toBe(true);
});

// --- the migration never adopts an arbitrary log ---------------------------------

test("migration never adopts an arbitrary log when the pinned id matches none", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", "r-one.jsonl"), '{"seq":1}\n');
  fs.writeFileSync(path.join(legacy, "room", "r-two.jsonl"), '{"seq":2}\n');
  // The config pins a valid id that matches NO log file: the legacy room's own log is missing.
  fs.writeFileSync(
    path.join(legacy, "room", "config.json"),
    `${JSON.stringify({ roomId: "custom-room" })}\n`,
  );

  // Two logs, neither of them the log the legacy room opens: picking one would be arbitrary.
  const before = snapshotTree(legacy);
  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  // The target got NO log at all — not one of the two renamed to the pinned id, and not the
  // other one copied under its own name (it would sit there, never opened).
  expect(fs.existsSync(path.join(target, "room"))).toBe(false);
  // The legacy room is left exactly as it was.
  expect(snapshotTree(legacy)).toEqual(before);
  expect(fs.readdirSync(path.join(legacy, "room")).sort()).toEqual([
    "config.json",
    "r-one.jsonl",
    "r-two.jsonl",
  ]);
});

// --- the copy is atomic: an interrupted copy leaves NO log ------------------------

test("an interrupted copy leaves the target with NO log, so the next attempt retries", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyId = roomIdFor(legacy);
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(
    path.join(legacy, "room", "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );
  // The staging path of the log is a DIRECTORY: the staged copy fails (EISDIR) exactly where a
  // crash would interrupt it — deterministically, with no mocking.
  fs.mkdirSync(path.join(target, "room"), { recursive: true });
  fs.mkdirSync(migrationTempPath(path.join(target, "room", `${legacyId}.jsonl`)), {
    recursive: true,
  });
  const before = snapshotTree(legacy);

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  // NO log at all — not a truncated one. The "never clobbers" guard only looks for ".jsonl",
  // so the half-written staging name does not block the next attempt.
  const names = fs.readdirSync(path.join(target, "room"));
  expect(names.filter((name) => name.endsWith(".jsonl"))).toEqual([]);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(false);
  // A FAILED copy removes NOTHING either: the legacy room is still there, byte for byte.
  expect(snapshotTree(legacy)).toEqual(before);

  // The next attempt retries: the blocker is gone and the room migrates for real.
  fs.rmSync(path.join(target, "room"), { recursive: true, force: true });
  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(true);
  // …and this time it is a MOVE: the legacy room is gone.
  expect(fs.existsSync(legacy)).toBe(false);
});

test("migration carries a leftover log under its own name instead of dropping it", () => {
  // Lines 374-381: a second legacy log (an earlier room id) travels too —
  // the migration never silently drops history.
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyRoomDir = path.join(legacy, "room");
  fs.mkdirSync(legacyRoomDir, { recursive: true });
  const legacyId = roomIdFor(legacy);
  fs.writeFileSync(path.join(legacyRoomDir, `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.writeFileSync(path.join(legacyRoomDir, "r-old.jsonl"), '{"seq":9}\n');
  fs.writeFileSync(
    path.join(legacyRoomDir, "config.json"),
    `${JSON.stringify({ roomId: legacyId })}\n`,
  );
  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  expect(fs.readFileSync(path.join(target, "room", "r-old.jsonl"), "utf-8")).toBe('{"seq":9}\n');
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(true);
});

// --- the lock hand-off: no window between the migration and the open -------------

test("the room's lock covers the migration and the open: a second writer is refused", () => {
  const { legacy } = legacyRoomWithLog();
  const target = tempRoot();
  const targetId = roomIdFor(target);

  // ONE lock hold covers the migration AND the open: the room opens…
  const opened = openMigratedRoom(legacy, target, () => openRoomLog(target, targetId));
  expect(opened.ok).toBe(true);
  // …and the lock is still held, so a second live writer is refused…
  expect(fs.existsSync(lockPathFor(target))).toBe(true);
  const second = openRoomLog(target, "r-second");
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.error).toBe("room file locked by another session");
  // …the exclusive create a second PROCESS performs fails too.
  expect(() =>
    fs.writeFileSync(lockPathFor(target), String(process.pid), { flag: "wx" }),
  ).toThrow();

  // Closing the room releases the lock: the next opener gets the room.
  closeRoomLog(target, targetId);
  expect(fs.existsSync(lockPathFor(target))).toBe(false);
  const reopened = openRoomLog(target, targetId);
  expect(reopened.ok).toBe(true);
  closeRoomLog(target, targetId);
});

// --- H3: the write paths refuse a planted symlink ---------------------------

test("a symlinked config.json is refused and the link target is untouched", () => {
  const root = tempRoot();
  const roomDir = path.join(root, "room");
  fs.mkdirSync(roomDir, { recursive: true });
  const outside = tempRoot();
  const precious = path.join(outside, "precious.txt");
  fs.writeFileSync(precious, "precious");
  // `ln -s ~/.bashrc /tmp/x/.omp-room/room/config.json`, in miniature.
  fs.symlinkSync(precious, path.join(roomDir, "config.json"));

  // Opening the room resolves its id through config.json: the READ refuses, and so does the
  // write that would have followed the link.
  expect(() => resolveRoomId(root)).toThrow(/room path is a symlink: .*config\.json/);
  expect(fs.readFileSync(precious, "utf-8")).toBe("precious");
  expect(() => saveRoomConfig(root, { ...DEFAULT_ROOM_CONFIG, roomId: "x" })).toThrow(
    /room path is a symlink/,
  );
  // The assertion that fails if the direct write comes back: the target's bytes are unchanged.
  expect(fs.readFileSync(precious, "utf-8")).toBe("precious");
});

test("a symlinked room dir is refused before any write reaches the link target", () => {
  const root = tempRoot();
  const outside = tempRoot();
  fs.symlinkSync(outside, path.join(root, "room"));

  expect(() => acquireRoomLock(root)).toThrow(/room path is a symlink: .*\/room$/);
  expect(() => saveRoomConfig(root, DEFAULT_ROOM_CONFIG)).toThrow(/room path is a symlink/);
  const opened = openRoomLog(root, roomIdFor(root));
  expect(opened.ok).toBe(false);
  if (!opened.ok) expect(opened.error).toBe("room path is a symlink");
  // Nothing was created inside the link target (no mkdir, no .lock, no log).
  expect(fs.readdirSync(outside)).toEqual([]);
});

test("a symlinked log file is refused and its target is not appended to", () => {
  const root = tempRoot();
  const roomId = roomIdFor(root);
  fs.mkdirSync(path.join(root, "room"), { recursive: true });
  const outside = tempRoot();
  const precious = path.join(outside, "precious.jsonl");
  fs.writeFileSync(precious, "keep\n");
  fs.symlinkSync(precious, logPathFor(root, roomId));

  expect(() => roomLogFd(root, roomId)).toThrow(/room path is a symlink: .*\.jsonl/);
  const opened = openRoomLog(root, roomId);
  expect(opened.ok).toBe(false);
  if (!opened.ok) expect(opened.error).toBe("room path is a symlink");
  // Neither the guard nor the refused open ever appended a record through the link.
  expect(fs.readFileSync(precious, "utf-8")).toBe("keep\n");
});

test("a normal root still opens, writes its config atomically, and migrates", () => {
  const root = tempRoot();
  const roomId = resolveRoomId(root);
  const roomDir = path.join(root, "room");
  // The temp+rename leaves no staging file behind, and config.json is the only file yet.
  expect(fs.readdirSync(roomDir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  expect(fs.readdirSync(roomDir)).toEqual(["config.json"]);

  const opened = openRoomLog(root, roomId);
  expect(opened.ok).toBe(true);
  closeRoomLog(root, roomId);
  expect(fs.existsSync(logPathFor(root, roomId))).toBe(true);

  // A normal legacy room still moves.
  const legacy = tempRoot();
  const legacyId = roomIdFor(legacy);
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  const target = tempRoot();
  expect(migrateLegacyRoom(legacy, target)).toBe(true);
  // No legacy config, so the copied log is named after the id the TARGET resolves.
  expect(fs.existsSync(path.join(target, "room", `${roomIdFor(target)}.jsonl`))).toBe(true);
  expect(fs.existsSync(legacy)).toBe(false);
});

test("migration refuses a symlinked legacy root and removes nothing", () => {
  const outside = tempRoot();
  const legacyId = roomIdFor(outside);
  fs.mkdirSync(path.join(outside, "room"), { recursive: true });
  fs.writeFileSync(path.join(outside, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  const legacy = tempRoot();
  const legacyLink = path.join(legacy, ".omp-room");
  fs.symlinkSync(outside, legacyLink);
  const target = tempRoot();
  const before = snapshotTree(outside);

  expect(migrateLegacyRoom(legacyLink, target)).toBe(false);
  // BYTE FOR BYTE: the linked-to room is untouched, and the target got nothing.
  expect(snapshotTree(outside)).toEqual(before);
  expect(fs.existsSync(path.join(target, "room"))).toBe(false);
});

test("migration refuses a symlinked legacy room dir before taking its lock", () => {
  const outside = tempRoot();
  fs.mkdirSync(path.join(outside, "room"), { recursive: true });
  fs.writeFileSync(path.join(outside, "room", `${roomIdFor(outside)}.jsonl`), '{"seq":1}\n');
  const legacy = tempRoot();
  fs.symlinkSync(path.join(outside, "room"), path.join(legacy, "room"));
  const target = tempRoot();
  const before = snapshotTree(outside);

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  expect(snapshotTree(outside)).toEqual(before);
  expect(fs.existsSync(path.join(target, "room"))).toBe(false);
});

// --- plan 026: lock liveness + reap identity --------------------------------------

/** A kill failure with an errno code, shaped like the kernel's (errnoCode reads `.code`). */
function killError(code: string, pid: number): NodeJS.ErrnoException {
  const error = new Error(`kill ${pid}: ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

test("a lock whose owner kill rejects with EPERM is live, never reaped", () => {
  // EPERM means the pid belongs to another user and is ALIVE: reaping it would hand the room to
  // two writers. Only ESRCH (no such pid) proves death.
  const root = tempRoot();
  const lockPath = lockPathFor(root);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const otherPid = 999_999_998; // no such pid: the stub decides liveness, not the kernel
  fs.writeFileSync(lockPath, String(otherPid));
  const realKill = process.kill.bind(process);
  const killSpy = spyOn(process, "kill");
  killSpy.mockImplementation(((pid: number) => {
    if (pid === otherPid) throw killError("EPERM", pid);
    return realKill(pid, 0);
  }) as never);
  const rmSpy = spyOn(fs, "rmSync");
  try {
    let message = "";
    try {
      acquireRoomLock(root);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(`room file locked by pid ${otherPid}`);
    expect(fs.readFileSync(lockPath, "utf-8")).toBe(String(otherPid)); // never reaped
    expect(rmSpy.mock.calls.some((call) => call[0] === lockPath)).toBe(false);
  } finally {
    killSpy.mockRestore();
    rmSpy.mockRestore();
  }
});

test("a stale lock replaced by a live lock before the reap is not unlinked", () => {
  // The reap window: the kill stub publishes a live writer's lock between the liveness check and
  // the unlink. The re-inspect must see the new owner, loop back, and refuse on the LIVE lock —
  // unlinking it would let two processes mint colliding seqs.
  const root = tempRoot();
  const lockPath = lockPathFor(root);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadPid = 999_999_999; // no such pid
  fs.writeFileSync(lockPath, String(deadPid));
  const livePid = process.ppid;
  const realKill = process.kill.bind(process);
  const killSpy = spyOn(process, "kill");
  killSpy.mockImplementation(((pid: number) => {
    if (pid === deadPid) {
      fs.writeFileSync(lockPath, String(livePid)); // the race, simulated inside the window
      throw killError("ESRCH", pid);
    }
    return realKill(pid, 0);
  }) as never);
  const rmSpy = spyOn(fs, "rmSync");
  try {
    let message = "";
    try {
      acquireRoomLock(root);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // The re-check saw a different owner, looped back, and refused on the live lock (EPERM on the
    // parent and a live check agree here: either way the owner counts as live, same message).
    expect(message).toBe(`room file locked by pid ${livePid}`);
    expect(fs.readFileSync(lockPath, "utf-8")).toBe(String(livePid)); // never unlinked
    expect(rmSpy.mock.calls.some((call) => call[0] === lockPath)).toBe(false);
  } finally {
    killSpy.mockRestore();
    rmSpy.mockRestore();
  }
});
