import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { logPathFor, roomIdFor } from "../src/ids";
import { resolveRoomId } from "../src/store/config";
import { lockPathFor, openRoomLog } from "../src/store/log";
import {
  globalRoomRoot,
  legacyRoomRoot,
  migrateLegacyRoom,
  roomRootFor,
} from "../src/store/room-root";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-root-"));
}

function fakeCtx(cwd: string): ExtensionContext {
  return { cwd, agent: { id: "Main" } } as unknown as ExtensionContext;
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
});

test("migration never clobbers a room that already has a log", () => {
  const legacy = tempRoot();
  const target = tempRoot();
  const legacyId = roomIdFor(legacy);
  fs.mkdirSync(path.join(legacy, "room"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "room", `${legacyId}.jsonl`), '{"seq":1}\n');
  fs.mkdirSync(path.join(target, "room"), { recursive: true });
  fs.writeFileSync(path.join(target, "room", "r-existing.jsonl"), '{"seq":99}\n');

  expect(migrateLegacyRoom(legacy, target)).toBe(false);
  expect(fs.existsSync(path.join(target, "room", "r-existing.jsonl"))).toBe(true);
  expect(fs.existsSync(path.join(target, "room", `${legacyId}.jsonl`))).toBe(false);
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
