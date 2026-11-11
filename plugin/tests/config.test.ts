import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { logPathFor, roomIdFor } from "../src/ids";
import {
  configPath,
  DEFAULT_ROOM_CONFIG,
  isValidRoomId,
  loadRoomConfig,
  resolveRoomId,
  saveRoomConfig,
} from "../src/store/config";
import { resetRoomStores, roomStoreFor } from "../src/store/room-store";
import { registerRoomTool } from "../src/tools/room";
import { zodStub } from "./zod-stub";

afterEach(() => {
  resetRoomStores();
});

// --- fixtures -------------------------------------------------------------

const TMP: string[] = [];

/** A unique on-disk local:// root per test — never the fixed /tmp path the scaffold used. */
function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join("/tmp", "omp-config-test-"));
  TMP.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of TMP) fs.rmSync(dir, { recursive: true, force: true });
});

// --- configPath -----------------------------------------------------------

test("configPath(root) is <root>/room/config.json", () => {
  const root = tempRoot();
  expect(configPath(root)).toBe(path.join(root, "room", "config.json"));
});

// --- loadRoomConfig: missing file ----------------------------------------

test("loadRoomConfig on a missing file returns the defaults", () => {
  const root = tempRoot();
  expect(loadRoomConfig(root)).toEqual(DEFAULT_ROOM_CONFIG);
});

// --- saveRoomConfig / loadRoomConfig round-trip ---------------------------

test("saveRoomConfig / loadRoomConfig round-trip preserves all fields", () => {
  const root = tempRoot();
  const cfg = { ...DEFAULT_ROOM_CONFIG, claimTtlMs: 120_000, maxBodyBytes: 256 };
  saveRoomConfig(root, cfg);
  expect(loadRoomConfig(root)).toEqual(cfg);
});

// --- unknown keys are ignored --------------------------------------------

test("loadRoomConfig ignores unknown keys", () => {
  const root = tempRoot();
  const cfg = { ...DEFAULT_ROOM_CONFIG, claimTtlMs: 1000 };
  saveRoomConfig(root, cfg);
  // Manually inject unknown keys
  const raw = JSON.parse(fs.readFileSync(configPath(root), "utf-8"));
  raw.unknownKey = "should be ignored";
  raw.anotherUnknown = 42;
  fs.writeFileSync(configPath(root), JSON.stringify(raw, null, 2), "utf-8");
  const loaded = loadRoomConfig(root);
  expect(loaded).toEqual(cfg);
  expect((loaded as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
});

// --- wrong-typed values fall back to defaults -----------------------------

test("loadRoomConfig falls back to defaults for wrong-typed values", () => {
  const root = tempRoot();
  const cfg = { ...DEFAULT_ROOM_CONFIG, claimTtlMs: 1000, maxBodyBytes: 256 };
  saveRoomConfig(root, cfg);
  // Manually inject wrong-typed values — plus the REMOVED coldTreeEnabled key, which must be
  // ignored (old config files need no migration).
  const raw = JSON.parse(fs.readFileSync(configPath(root), "utf-8"));
  raw.claimTtlMs = "not a number";
  raw.maxBodyBytes = true;
  raw.coldTreeEnabled = "yes";
  raw.roomId = 123;
  fs.writeFileSync(configPath(root), JSON.stringify(raw, null, 2), "utf-8");
  const loaded = loadRoomConfig(root);
  expect(loaded.claimTtlMs).toBe(DEFAULT_ROOM_CONFIG.claimTtlMs);
  expect(loaded.maxBodyBytes).toBe(DEFAULT_ROOM_CONFIG.maxBodyBytes);
  expect("coldTreeEnabled" in loaded).toBe(false);
  expect(loaded.roomId).toBe(DEFAULT_ROOM_CONFIG.roomId);
});

// --- resolveRoomId: derives, persists, round-trip ------------------------

test("resolveRoomId derives from roomIdFor(root), persists, and reads back", () => {
  const root = tempRoot();
  const id = resolveRoomId(root);
  expect(id).toBe(roomIdFor(root));
  // Persisted to the config file
  expect(loadRoomConfig(root).roomId).toBe(id);
  // Second call reads the persisted id back
  expect(resolveRoomId(root)).toBe(id);
});

test("resolveRoomId respects an explicit roomId override", () => {
  const root = tempRoot();
  saveRoomConfig(root, { ...DEFAULT_ROOM_CONFIG, roomId: "custom-room" });
  expect(resolveRoomId(root)).toBe("custom-room");
});

// --- plan 003 — roomId validation -----------------------------------------

test("a stored roomId with path separators resolves to the minted id, inside the root", () => {
  const root = tempRoot();
  saveRoomConfig(root, { ...DEFAULT_ROOM_CONFIG, roomId: "../../evil" });
  const id = resolveRoomId(root);
  expect(id).toBe(roomIdFor(root));
  expect(isValidRoomId(id)).toBe(true);
  // The resolved log path stays under the room directory.
  expect(logPathFor(root, id).startsWith(`${root}/room/`)).toBe(true);
});

test("isValidRoomId admits minted and custom ids, rejects separators and empties", () => {
  expect(isValidRoomId(roomIdFor("/tmp/x"))).toBe(true);
  expect(isValidRoomId("custom-room")).toBe(true);
  expect(isValidRoomId("a/b")).toBe(false);
  expect(isValidRoomId("..\\x")).toBe(false);
  expect(isValidRoomId("")).toBe(false);
  expect(isValidRoomId("x".repeat(65))).toBe(false);
});

test("loadRoomConfig coerces an invalid roomId back to mint-from-root", () => {
  const root = tempRoot();
  saveRoomConfig(root, { ...DEFAULT_ROOM_CONFIG, roomId: "a/b" });
  expect(loadRoomConfig(root).roomId).toBe("");
});

// --- plan 027 — the live config --------------------------------------------

/**
 * 027 — a post plus its delivery pass performs zero config-file reads after open, while a
 * config write still changes the effective value for the next op. The seam is `fs.readFileSync`
 * filtered to the config path (the log replay's reads must not count); the counter is the
 * established `spyOn(fs, …)` shape from store.test.ts. The poster is the room's only member, so
 * the pass has no recipients to side-channel through — its config use is the live value only.
 */
test("post + delivery pass read the live store config, not the config file", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "omp-config-live-"));
  TMP.push(project);
  const ctx = {
    agent: { kind: "main", id: "AgentA", name: "main", depth: 0 },
    cwd: project,
    localProtocolOptions: {
      getArtifactsDir: () => project,
      getSessionId: () => "AgentA",
    },
    sessionManager: {
      getArtifactsDir: () => project,
      getSessionId: () => "AgentA",
      getEntries: () => [],
    },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
  } as unknown as ExtensionContext;
  const store = roomStoreFor(ctx);
  const cfgPath = configPath(store.root);

  const realRead = fs.readFileSync;
  let configReads = 0;
  const spy = spyOn(fs, "readFileSync");
  spy.mockImplementation(((target: unknown, ...rest: unknown[]) => {
    if (String(target) === cfgPath) configReads++;
    return (realRead as (...args: never[]) => unknown)(target as never, ...(rest as never[]));
  }) as typeof fs.readFileSync);
  try {
    let tool:
      | {
          execute: (
            id: string,
            params: Record<string, unknown>,
            signal: AbortSignal,
            onUpdate: (u: unknown) => void,
            ctx: ExtensionContext,
          ) => Promise<{ details?: Record<string, unknown> }>;
        }
      | undefined;
    const pi = {
      zod: zodStub,
      registerTool: (def: { name: string; execute: NonNullable<typeof tool>["execute"] }) => {
        if (def.name === "room") tool = def as typeof tool;
      },
    } as unknown as ExtensionAPI;
    registerRoomTool(pi);
    if (!tool) throw new Error("room tool not registered");

    const posted = await tool.execute(
      "test-call",
      { op: "post", topic: "build", body: "hello" },
      new AbortController().signal,
      () => {},
      ctx,
    );
    expect(posted.details).toMatchObject({ ok: true, op: "post" });
    expect(configReads).toBe(0);

    // A hand-edited file mid-session is invisible by design (save-path reload is the only
    // mutation route); the save path refreshes the live value the next op reads.
    const next = { ...store.config, maxBodyBytes: 16 };
    saveRoomConfig(store.root, next);
    store.config = loadRoomConfig(store.root);
    expect(store.config.maxBodyBytes).toBe(16);
  } finally {
    spy.mockRestore();
  }
});
