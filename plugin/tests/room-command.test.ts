import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { registerRoomCommand } from "../src/commands/room-command";
import { roomIdFor } from "../src/ids";
import { resetRoomStores, storeFor } from "../src/store/room-store";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-command-"));
}

afterEach(() => {
  resetRoomStores();
});

/** Capture the registered handler off a stub pi (same shape as panel.test.ts's harness). */
function captureHandler(
  notified: string[],
): (args: string, ctx: ExtensionContext) => Promise<void> {
  let handler: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
  const pi = {
    registerCommand: (_name: string, options: { handler: typeof handler }) => {
      handler = options.handler;
    },
    getFlag: () => undefined,
    // Headless report() goes to pi.logger.info, not ctx.ui.notify.
    logger: {
      info: (message: string) => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionAPI;
  registerRoomCommand(pi);
  if (!handler) throw new Error("registerRoomCommand registered no handler");
  return handler;
}

function headlessCtx(root: string, notified: string[]): ExtensionContext {
  return {
    hasUI: false,
    mode: "print",
    agent: { id: "Main", kind: "main" },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-cmd" },
    setInterval: () => 0 as unknown as Timer,
    clearTimer: () => {},
    ui: {
      notify: (message: string) => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionContext;
}

// The handler resolves its store via roomStoreFor(ctx) → <cwd>/.omp-room; the assertion store
// must be opened on that same root or the two never meet.
function roomStoreForCwd(root: string): ReturnType<typeof storeFor> {
  const roomRoot = `${root}/.omp-room`;
  return storeFor(roomRoot, roomIdFor(roomRoot));
}

test("/room claim with a non-numeric TTL appends nothing and warns", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step notanumber", headlessCtx(root, notified));
  expect(store.records.filter((r) => r.kind === "claim")).toHaveLength(0);
  expect(store.claims.has("build/step")).toBe(false);
  expect(notified.some((line) => line.includes("bad ttlMs"))).toBe(true);
});

test("/room claim with a numeric TTL grants with that lease (positive control)", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  await handler("claim build step 60000", headlessCtx(root, notified));
  expect(store.claims.get("build/step")?.ttlMs).toBe(60_000);
  expect(notified.some((line) => line.includes("granted"))).toBe(true);
});

test("/room config tells the truth: governor knobs live, only two inert", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  roomStoreForCwd(root);
  await handler("config", headlessCtx(root, notified));
  const text = notified.join("\n");
  // Live knobs appear on live lines.
  expect(text).toContain("live (governor): maxT1PerTurn=");
  expect(text).toContain("live (retention/sweep): logMaxRecords=");
  // The stale banner is gone.
  expect(text).not.toContain("inert under Option A");
  expect(text).not.toContain("both reserved, no effect yet");
  // The inert line names exactly the two genuinely unread knobs.
  const inert = notified.find((line) => line.includes("inert (present in the file"));
  expect(inert).toBeDefined();
  expect(inert).toContain("coldTreeEnabled=");
  expect(inert).toContain("panelKey=");
  expect(inert).not.toContain("maxT1PerTurn=");
  expect(inert).not.toContain("compactionCallsPerDay=");
});
