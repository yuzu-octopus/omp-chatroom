import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveLocalRoot, resolveLocalUrlToPath }
  from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { logPathFor, roomIdFor } from "../src/ids";
import { appendLine, openRoomLog, readSince, replay, roomLogFd } from "../src/store/log";
import { resetRoomStores, storeFor } from "../src/store/room-store";
import { grant, reclaimIfStale, release } from "../src/store/claims";
import { bumpCursor, cursorFor, initCursor, lagFor } from "../src/store/cursors";

const OPTS = { getArtifactsDir: () => "/tmp/room-test", getSessionId: () => "20261006-abc123" };
// K14 — the test computes the filename with the SAME helper the store uses. Never a hardcoded name.
// X1 — the room id is ROOT-STABLE: it comes from the resolved root, never from a session id.
const ROOT = resolveLocalRoot(OPTS);
const ROOM_ID = roomIdFor(ROOT);
const LOG_PATH = logPathFor(ROOT, ROOM_ID);

test("3 interleaved writers × 200 lines produce 600 parseable lines, zero torn", () => {
  throw new Error("not implemented");
});

test("readSince(seq) returns exactly the records after seq", () => {
  throw new Error("not implemented");
});

test("replay reconstructs cursors and seq", () => {
  throw new Error("not implemented");
});

test("resolveLocalUrlToPath('local://room/r.jsonl', opts) is inside resolveLocalRoot(opts)", () => {
  throw new Error("not implemented");
});

test("logPathFor(root, roomId) is the path the store actually writes", () => {
  throw new Error("not implemented");
});

test("roomIdFor(root) is stable across two different session ids and never returns 'local'", () => {
  throw new Error("not implemented");
});

test("a torn line is skipped and a gap record is emitted (100 + torn + 100)", () => {
  throw new Error("not implemented");
});

test("only successfully parsed records consume a seq", () => {
  throw new Error("not implemented");
});

test("claim(a,res) grants; claim(b,res) returns {ok:false, holder:a}", () => {
  throw new Error("not implemented");
});

test("an expired-TTL claim is reclaimable and appends release{reason:'reclaimed'}", () => {
  throw new Error("not implemented");
});

test("spoofed `from` is overwritten with ctx.agent.id", () => {
  throw new Error("not implemented");
});

test("cursor persistence: appendEntry('chatroom:cursor') survives a resume", () => {
  throw new Error("not implemented");
});
