import { afterAll, beforeAll, expect, setSystemTime, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentRef, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { ensureThemeSync, type TUI, theme, visibleWidth } from "@oh-my-pi/pi-tui";
import { registerRoomCommand } from "../src/commands/room-command";
import { roomIdFor } from "../src/ids";
import { type BoardRow, projectClaims } from "../src/panel/board-pane";
import { createChatPane, projectChatRows } from "../src/panel/chat-pane";
import { frameBottomRow, frameDividerRow, frameHintRow, frameTopRow } from "../src/panel/chrome";
import { actionFor, PANEL_KEY_MAP, type PanelAction } from "../src/panel/keys";
import {
  openRoomPanel,
  PANEL_SPLIT_AT,
  RoomPanel,
  type RoomPanelOptions,
} from "../src/panel/panel";
import { renderRosterStrip, statusCounts } from "../src/panel/roster-strip";
import { type MemberState, type RoomStore, storeFor } from "../src/store/room-store";
import type { RoomRecord } from "../src/store/schema";

// --- fixtures -------------------------------------------------------------

const TMP: string[] = [];
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI needs ESC
const ANSI = /\x1b\[[0-9;]*m/g;

beforeAll(() => {
  ensureThemeSync();
});

afterAll(() => {
  for (const dir of TMP) fs.rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-panel-"));
  TMP.push(dir);
  return resolveLocalRoot({ getArtifactsDir: () => dir, getSessionId: () => "sess-panel" });
}

function msg(seq: number, body: string, from = "AgentA", topic = "build"): RoomRecord {
  return { v: 1, seq, ts: 1_000_000 + seq, kind: "msg", id: `m${seq}`, from, topic, body };
}

function viewer(agentId = "Viewer"): MemberState {
  return {
    agentId,
    joinedAtSeq: 0,
    topics: new Set<string>(),
    muted: new Set<string>(),
    threadRoots: new Set<string>(),
    heldTopics: new Set<string>(),
  };
}

/** A store with one chat message and one live claim, on a real temp root. */
function fixtureStore(): RoomStore {
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  store.append({ kind: "msg", from: "AgentA", topic: "build", body: "hello-chat" });
  store.append({ kind: "claim", from: "AgentB", resource: "build/step", ttlMs: 600_000 });
  return store;
}

/** Structural TUI: the panel only reads `terminal.rows` and calls `requestRender`. */
function tuiStub(rows: number): TUI {
  return { requestRender: () => {}, terminal: { rows } } as unknown as TUI;
}

/** Structural registry: process-global in production, injected here for determinism. */
function registryStub(
  onChange: () => () => void = () => () => {},
): NonNullable<RoomPanelOptions["registry"]> {
  return { list: () => [], onChange };
}

function makePanel(
  store: RoomStore,
  rows = 30,
  overrides: Partial<RoomPanelOptions> = {},
): RoomPanel {
  return new RoomPanel({
    roomId: store.roomId,
    store,
    tui: tuiStub(rows),
    done: () => {},
    onReleaseClaim: () => {},
    onFocusAgent: () => {},
    selfId: "Main",
    registry: registryStub(),
    ...overrides,
  });
}

// --- 1. exact-width rows --------------------------------------------------

test("render(width) returns rows of exactly `width` visible cells at 80, 100 and 120", () => {
  const store = fixtureStore();
  const panel = makePanel(store);
  try {
    for (const width of [80, 100, 120]) {
      const rows = panel.render(width);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(visibleWidth(row)).toBe(width);
    }
  } finally {
    panel.dispose();
  }
});

// --- 2. narrow fallback + Tab --------------------------------------------

test("narrow fallback triggers below PANEL_SPLIT_AT and Tab toggles the visible pane", () => {
  const store = fixtureStore();
  const panel = makePanel(store);
  const narrowWidth = PANEL_SPLIT_AT - 8;
  try {
    // Below the threshold only the chat (left) pane is shown.
    const narrow = panel.render(narrowWidth).join("\n");
    expect(narrow).toContain("hello-chat");
    expect(narrow).not.toContain("build/step");

    // Tab swaps to the board (right) pane.
    panel.handleInput("\t");
    const toggled = panel.render(narrowWidth).join("\n");
    expect(toggled).toContain("build/step");
    expect(toggled).not.toContain("hello-chat");

    // Tab again returns to chat.
    panel.handleInput("\t");
    expect(panel.render(narrowWidth).join("\n")).toContain("hello-chat");

    // At/above the threshold both panes render and Tab is a no-op.
    const wide = panel.render(120).join("\n");
    expect(wide).toContain("hello-chat");
    expect(wide).toContain("build/step");
    panel.handleInput("\t");
    const after = panel.render(120).join("\n");
    expect(after).toContain("hello-chat");
    expect(after).toContain("build/step");
  } finally {
    panel.dispose();
  }
});

// --- 3. chat pane windowing ----------------------------------------------

test("chat pane windows a 5000-record room instead of materialising every row", () => {
  const records: RoomRecord[] = Array.from({ length: 5000 }, (_, i) => msg(i + 1, `line-${i + 1}`));
  const rows = projectChatRows(records, viewer(), 0);
  expect(rows.length).toBe(5000);

  const pane = createChatPane(() => rows, 12, theme);
  const out = pane(60, 12);
  expect(out.length).toBe(12);
  expect(out[out.length - 1]).toContain("line-5000");
  expect(out.join("\n")).not.toContain("line-4000");
  expect(out.join("\n")).not.toContain("line-1000");
  for (const line of out) expect(visibleWidth(line)).toBe(60);

  // A taller window still cannot exceed its own budget.
  expect(pane(60, 40).length).toBe(40);
});

// --- 4. board pane claim row ---------------------------------------------

test("board pane renders a claim row with resource, holder and remaining TTL", () => {
  setSystemTime(new Date("2026-10-07T00:00:00Z"));
  try {
    const now = Date.now();
    const rows: BoardRow[] = [
      {
        resource: "build/step",
        holder: "AgentA",
        ttlMs: 60_000,
        expiresAt: now + 12_000,
        acquiredAt: now - 48_000,
        contended: 2,
        state: "held",
      },
    ];
    const lines = projectClaims(rows, 80, theme);
    const text = lines.join("\n");
    expect(text).toContain("build/step");
    expect(text).toContain("AgentA");
    expect(text).toContain("12s");
    expect(text).toContain("2 waiting");
    for (const line of lines) expect(visibleWidth(line)).toBe(80);
  } finally {
    setSystemTime();
  }
});

// --- 5. dispose idempotence ----------------------------------------------

test("dispose() is idempotent: unsubscribes once and never double-clears", () => {
  const store = fixtureStore();
  let registryUnsubs = 0;
  let cleared = 0;
  const panel = makePanel(store, 30, {
    registry: {
      list: () => [],
      onChange: () => () => {
        registryUnsubs += 1;
      },
    },
    setInterval: () => "timer-1",
    clearTimer: () => {
      cleared += 1;
    },
  });
  // The panel subscribes to the store for live refresh (§6.8/K10).
  expect(store.listeners.size).toBe(1);

  panel.dispose();
  expect(store.listeners.size).toBe(0);
  expect(registryUnsubs).toBe(1);
  expect(cleared).toBe(1);

  // A second dispose is a no-op.
  panel.dispose();
  expect(store.listeners.size).toBe(0);
  expect(registryUnsubs).toBe(1);
  expect(cleared).toBe(1);
});

// --- 6. key map -----------------------------------------------------------

test("key map resolves every documented key and an unknown key is a no-op", () => {
  const narrow = { splitMode: "narrow" as const, editorEmpty: true, filterOpen: false };
  const documented: ReadonlyArray<readonly [string, PanelAction]> = [
    ["\x1b", "close"],
    ["\t", "toggle-narrow"],
    ["j", "down"],
    ["\x1b[B", "down"],
    ["k", "up"],
    ["\x1b[A", "up"],
    ["g", "top"],
    ["G", "bottom"],
    ["\r", "detail"],
    ["o", "focus-agent"],
    ["r", "release-claim"],
    ["p", "compose"],
    ["/", "filter"],
    ["1", "focus-chat"],
    ["2", "focus-board"],
  ];
  for (const [key, action] of documented) expect(actionFor(key, narrow)).toBe(action);

  // The table is exactly the documented key set.
  expect(Object.keys(PANEL_KEY_MAP).length).toBe(15);

  // unknown / empty input is a no-op
  expect(actionFor("z", narrow)).toBeNull();
  expect(actionFor("", narrow)).toBeNull();

  // Tab only collapses when the split is narrow
  expect(actionFor("\t", { splitMode: "split", editorEmpty: true, filterOpen: false })).toBeNull();

  // "once the reader starts typing, the editor owns every key" (§6.7)
  expect(actionFor("j", { ...narrow, editorEmpty: false })).toBeNull();
  expect(actionFor("\x1b", { ...narrow, editorEmpty: false })).toBeNull();

  // the filter input owns keys while it is open
  expect(actionFor("j", { ...narrow, filterOpen: true })).toBeNull();
});

// --- chrome rows ----------------------------------------------------------

test("chrome rows are exactly `width` cells, including degenerate widths", () => {
  for (const width of [80, 100, 120, 20, 6, 1]) {
    expect(visibleWidth(frameTopRow(width, "Room #r1", Math.floor(width * 0.62)))).toBe(width);
    expect(visibleWidth(frameDividerRow(width, Math.floor(width * 0.62)))).toBe(width);
    expect(visibleWidth(frameBottomRow(width))).toBe(width);
    expect(visibleWidth(frameHintRow(width, ["esc close", "tab narrow", "j/k move"], theme))).toBe(
      width,
    );
  }
  expect(frameTopRow(80, "Room #r1", 49).replace(ANSI, "")).toContain("Room #r1");
});

// --- roster strip ---------------------------------------------------------

test("roster strip counts statuses and renders a one-line presence summary", () => {
  const refs = [
    { id: "A", status: "running" },
    { id: "B", status: "running" },
    { id: "C", status: "idle" },
    { id: "D", status: "parked" },
    { id: "E", status: "aborted" },
  ] as unknown as AgentRef[];
  expect(statusCounts(refs)).toEqual({ running: 2, idle: 1, parked: 1, aborted: 1 });
  const plain = renderRosterStrip(refs, theme).replace(ANSI, "");
  expect(plain).toContain("2 running");
  expect(plain).toContain("1 idle");
  expect(plain).toContain("1 parked");
  expect(renderRosterStrip([], theme).replace(ANSI, "")).toContain("no agents");
});

// --- open guard -----------------------------------------------------------

test("openRoomPanel degrades instead of throwing outside a TUI", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const notified: string[] = [];
  const ctx = {
    hasUI: false,
    mode: "print",
    ui: { notify: (message: string) => notified.push(message) },
  } as unknown as ExtensionContext;
  await openRoomPanel(pi, ctx);

  const rpc = {
    hasUI: true,
    mode: "rpc",
    ui: { notify: (message: string) => notified.push(message) },
  } as unknown as ExtensionContext;
  await openRoomPanel(pi, rpc);

  expect(notified.length).toBeGreaterThan(0);
});

// --- /room command wiring -------------------------------------------------

/** The command's registered handler, captured from a structural `pi`. */
function captureRoomHandler(): (args: string, ctx: ExtensionContext) => Promise<void> {
  let handler: ((args: string, ctx: ExtensionContext) => Promise<void>) | undefined;
  const pi = {
    registerCommand: (_name: string, options: { handler: typeof handler }) => {
      handler = options.handler;
    },
    logger: { info: () => {} },
  } as unknown as ExtensionAPI;
  registerRoomCommand(pi);
  if (!handler) throw new Error("registerRoomCommand registered no handler");
  return handler;
}

test("/room with no arguments opens the panel, and degrades without a TUI", async () => {
  const handler = captureRoomHandler();

  // Bare `/room` in a TUI opens the overlay (custom is invoked) instead of printing usage.
  const root = tempRoot();
  let customCalls = 0;
  const tuiCtx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    // The real ExtensionContext schedules the store's background jobs (I4); the stub must too.
    setInterval: () => "t",
    clearTimer: () => {},
    ui: {
      notify: () => {},
      custom: async () => {
        customCalls += 1;
        return undefined as never;
      },
    },
  } as unknown as ExtensionContext;
  await handler("", tuiCtx);
  expect(customCalls).toBe(1);

  // Headless (print) must not throw and must not try to open an overlay.
  const notified: string[] = [];
  const headless = {
    hasUI: false,
    mode: "print",
    ui: { notify: (message: string) => notified.push(message) },
  } as unknown as ExtensionContext;
  await handler("", headless);
  expect(notified.length).toBeGreaterThan(0);
});
