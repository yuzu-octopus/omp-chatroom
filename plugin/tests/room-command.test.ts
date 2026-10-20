import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
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

test("/room config shows only live knobs — no inert line, no reserved flags", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  roomStoreForCwd(root);
  await handler("config", headlessCtx(root, notified));
  const text = notified.join("\n");
  // Live knobs appear on live lines.
  expect(text).toContain("live (governor): maxT1PerTurn=");
  expect(text).toContain("live (retention/sweep): logMaxRecords=");
  // The removed surfaces are gone entirely.
  expect(text).not.toContain("inert");
  expect(text).not.toContain("coldTreeEnabled");
  expect(text).not.toContain("panelKey");
  expect(text).not.toContain("room-cold-tree");
  expect(text).toContain('--room-panel-key=""');
});

// --- plan 007 — the command path runs the delivery pass ----------------------

interface Send {
  payload: Record<string, unknown>;
  options: Record<string, unknown>;
}

/** A fake live session in the global registry that records its custom messages. */
function registerSession(id: string, calls: Send[]): void {
  const session = {
    async sendCustomMessage(payload: unknown, options?: unknown): Promise<boolean> {
      calls.push({
        payload: payload as Record<string, unknown>,
        options: options as Record<string, unknown>,
      });
      return true;
    },
  };
  AgentRegistry.global().register({
    id,
    displayName: id,
    kind: "sub",
    status: "running",
    session: session as never,
  });
}

test("/room post pushes to a follower (T1), not just the log", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // B follows the topic, so the post classifies T1 for B and must push.
  store.members.set("Follower", {
    agentId: "Follower",
    joinedAtSeq: 0,
    topics: new Set(["build"]),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  const calls: Send[] = [];
  registerSession("Follower", calls);
  try {
    await handler("post build hello from the command", headlessCtx(root, notified));
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
    expect(JSON.stringify(calls[0]!.payload)).toContain("hello from the command");
  } finally {
    AgentRegistry.global().unregister("Follower");
  }
});

test("/room claim notifies a waiter on the resource (M-8 T1)", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  // W is mid-wait on build/step, so the claim classifies T1 for W and must push.
  store.members.set("Waiter", {
    agentId: "Waiter",
    joinedAtSeq: 0,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
    waitedResource: "build/step",
  });
  const calls: Send[] = [];
  registerSession("Waiter", calls);
  try {
    await handler("claim build step 60000", headlessCtx(root, notified));
    expect(store.claims.get("build/step")?.holder).toBe("Main");
    expect(calls.length).toBe(1);
    expect(calls[0]!.options).toMatchObject({ deliverAs: "aside" });
  } finally {
    AgentRegistry.global().unregister("Waiter");
  }
});

test("/room join records membership even when the agent already has a cursor", async () => {
  const notified: string[] = [];
  const handler = captureHandler(notified);
  const root = tempRoot();
  const store = roomStoreForCwd(root);
  const ctx = headlessCtx(root, notified);
  // The hook's initCursor runs for EVERY agent at turn start, so the cursor map already
  // contains the agent. A cursor-keyed join check therefore never fires and the agent never
  // gets a member{join} record — it stays out of the board roster and out of the log.
  store.cursors.set("Main", 0);
  expect(store.members.has("Main")).toBe(false);

  await handler("join", ctx);

  expect(store.records.filter((r) => r.kind === "member" && r.from === "Main")).toHaveLength(1);
  expect(store.members.has("Main")).toBe(true);
  // A second join is still a no-op: no second member record.
  await handler("join", ctx);
  expect(store.records.filter((r) => r.kind === "member" && r.from === "Main")).toHaveLength(1);
});
