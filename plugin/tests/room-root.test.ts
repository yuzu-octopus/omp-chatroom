import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { getSessionsDir } from "@oh-my-pi/pi-utils";
import { roomIdFor } from "../src/ids";
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
