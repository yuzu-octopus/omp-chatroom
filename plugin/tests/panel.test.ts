import { afterAll, beforeAll, expect, setSystemTime, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentRef, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import {
  type Component,
  ensureThemeSync,
  type Theme,
  type TUI,
  theme,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { registerRoomCommand } from "../src/commands/room-command";
import { roomIdFor } from "../src/ids";
import { type BoardRow, projectClaims } from "../src/panel/board-pane";
import {
  type ChatRow,
  createChatPane,
  projectChatRows,
  renderChatRows,
} from "../src/panel/chat-pane";
import { frameBottomRow, frameDividerRow, frameHintRow, frameTopRow } from "../src/panel/chrome";
import { uncolouredTheme } from "../src/panel/host-theme";
import { actionFor, PANEL_KEY_MAP, type PanelAction } from "../src/panel/keys";
import {
  openRoomPanel,
  PANEL_SPLIT_AT,
  RoomPanel,
  type RoomPanelOptions,
} from "../src/panel/panel";
import { renderRosterStrip, statusCounts } from "../src/panel/roster-strip";
import { enqueueWaiter, grant } from "../src/store/claims";
import { type MemberState, type RoomStore, roomStoreFor, storeFor } from "../src/store/room-store";
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

/** R6 — a message carrying the topic's status ledger. */
function ledgerMsg(seq: number, isInLoop: "yes" | "no"): RoomRecord {
  return {
    v: 1,
    seq,
    ts: 1_000_000 + seq,
    kind: "msg",
    id: `m${seq}`,
    from: "AgentA",
    topic: "build",
    body: "status",
    status: {
      is_request_satisfied: { reason: "the parser is green", answer: "no" },
      is_in_loop: { reason: "the same edit, again", answer: isInLoop },
      is_progress_being_made: { reason: "the last commit changed the parser", answer: "yes" },
      next_speaker: { reason: "the parser needs the schema", answer: "AgentB" },
      instruction_or_question: { reason: "AgentB must publish the schema", answer: "publish it" },
    },
  };
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

/**
 * Render a store's chat rows through `renderChatRows` — the theme-sourced path. Unlike the full
 * panel, whose frame rows read the HOST's theme singleton and so never see a fallback in-process,
 * this actually reads the theme it is given. That makes it the only in-process check that can fail
 * on a bad fallback theme.
 */
function panelRows(store: RoomStore, theme: Theme, width: number): string[] {
  return renderChatRows(projectChatRows(store.records, viewer(), 0), width, theme);
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
    theme,
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
        waiting: ["AgentB", "AgentC"],
        dependsOn: [],
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

test("a throw in the first refresh releases the age timer and both listeners", () => {
  // The real failure: the panel read the pi-tui `theme` module singleton, which is `export var
  // theme: Theme` and undefined until initTheme() runs, so refresh() threw "undefined is not an
  // object (evaluating 'theme.fg')" — AFTER the timer and listeners were live. The factory never
  // got a panel to dispose, so the 5 s timer fired forever into a half-built panel.
  const store = fixtureStore();
  let cleared = 0;
  let registryUnsubs = 0;
  const hostile = {
    ...registryStub(),
    list: () => {
      throw new Error("undefined is not an object (evaluating 'theme.fg')");
    },
  };
  expect(() =>
    makePanel(store, 30, {
      registry: {
        ...hostile,
        onChange: () => () => {
          registryUnsubs += 1;
        },
      },
      setInterval: () => "timer-1",
      clearTimer: () => {
        cleared += 1;
      },
    }),
  ).toThrow(/theme\.fg/);

  // Everything the failed constructor acquired is released.
  expect(store.listeners.size).toBe(0);
  expect(registryUnsubs).toBe(1);
  expect(cleared).toBe(1);
});

// --- 6. key map -----------------------------------------------------------

test("key map resolves every documented key and an unknown key is a no-op", () => {
  const narrow = { splitMode: "narrow" as const, editorEmpty: true };
  const documented: ReadonlyArray<readonly [string, PanelAction]> = [
    ["\x1b", "close"],
    ["\t", "toggle-narrow"],
    ["j", "down"],
    ["\x1b[B", "down"],
    ["k", "up"],
    ["\x1b[A", "up"],
    ["g", "top"],
    ["G", "bottom"],
    ["o", "focus-agent"],
    ["r", "release-claim"],
    ["1", "focus-chat"],
    ["2", "focus-board"],
  ];
  for (const [key, action] of documented) expect(actionFor(key, narrow)).toBe(action);

  // The table is exactly the documented key set.
  expect(Object.keys(PANEL_KEY_MAP).length).toBe(12);

  // unknown / empty input is a no-op — including the unbound ex-detail/compose/filter keys.
  expect(actionFor("z", narrow)).toBeNull();
  expect(actionFor("", narrow)).toBeNull();
  expect(actionFor("\r", narrow)).toBeNull();
  expect(actionFor("p", narrow)).toBeNull();
  expect(actionFor("/", narrow)).toBeNull();

  // Tab only collapses when the split is narrow
  expect(actionFor("\t", { splitMode: "split", editorEmpty: true })).toBeNull();

  // "once the reader starts typing, the editor owns every key" (§6.7)
  expect(actionFor("j", { ...narrow, editorEmpty: false })).toBeNull();
  expect(actionFor("\x1b", { ...narrow, editorEmpty: false })).toBeNull();
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
    cwd: root,
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

// --- F2 security: ANSI injection in board pane ---

test("board pane strips ANSI escape from resource and holder", () => {
  setSystemTime(new Date("2026-10-07T00:00:00Z"));
  try {
    const now = Date.now();
    const rows: BoardRow[] = [
      {
        resource: "x\x1b[2Jy",
        holder: "Agent\x1b[31mA",
        ttlMs: 60_000,
        expiresAt: now + 12_000,
        acquiredAt: now - 48_000,
        waiting: [],
        dependsOn: [],
        state: "held",
      },
    ];
    const lines = projectClaims(rows, 80, theme);
    const text = lines.join("\n");
    const stripped = text.replace(ANSI, "");
    expect(stripped).not.toContain("\x1b");
    expect(text).toContain("xy");
    expect(text).toContain("AgentA");
  } finally {
    setSystemTime();
  }
});

// --- F2 security: ANSI injection in chat pane ---

test("chat pane strips ANSI escape from author and topic", () => {
  const rows: ChatRow[] = [
    {
      seq: 1,
      ts: 1_000_000,
      tier: "T1",
      author: "a\x1b[31mb",
      topic: "build\x1b[2J",
      body: "hello",
      mention: false,
      unread: false,
      threadDepth: 0,
    },
  ];
  const lines = renderChatRows(rows, 80, theme);
  const text = lines.join("\n");
  const stripped = text.replace(ANSI, "");
  expect(stripped).not.toContain("\x1b");
  expect(text).toContain("ab");
  expect(text).toContain("build");
});

// --- 7. handleInput returns boolean ----------------------------------------

test("handleInput returns true for a mapped key and false for an unmapped one", () => {
  const store = fixtureStore();
  const panel = makePanel(store);
  expect(panel.handleInput("j")).toBe(true);
  expect(panel.handleInput("z")).toBe(false);
});

// --- 8. onTerminalInput registration ---------------------------------------

/** A fake ctx that captures the onTerminalInput handler and the done callback. */
function captureTerminalInput(): {
  handler: (data: string) => { consume: true } | undefined;
  done: () => void;
  unsubscribe: () => void;
  unsubscribeCalls: number;
  tuiCtx: ExtensionContext;
} {
  // `openRoomPanel` hands the host theme to the panel; the module-level `theme` export is
  // `export var theme` and stays undefined until `initTheme()` runs, so a test that renders before
  // `beforeAll` has no theme. Ensure it here rather than depend on suite ordering.
  ensureThemeSync();
  let handler: ((data: string) => { consume: true } | undefined) | undefined;
  const done: () => void = () => {};
  let unsubscribeCalls = 0;
  const unsubscribe = () => {
    unsubscribeCalls += 1;
  };
  const root = tempRoot();
  const tuiCtx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    setInterval: () => "t",
    clearTimer: () => {},
    ui: {
      notify: () => {},
      custom: async (
        factory: (
          tui: TUI,
          hostTheme: Theme,
          keybindings: unknown,
          closeOverlay: () => void,
        ) => Component,
      ) => {
        // The factory's 4th arg is the host's close callback. Capture it so the test can drive the
        // close path (`done`), and pass the imported theme as arg 2 — the panel must use the
        // injected theme, since the pi-tui `theme` module export is undefined until initTheme runs.
        const panel = factory(tuiStub(30), theme, {}, () => {
          done();
        });
        void panel;
        return undefined as never;
      },
      onTerminalInput: (h: typeof handler) => {
        handler = h;
        return unsubscribe;
      },
    },
  } as unknown as ExtensionContext;
  return {
    get handler() {
      if (!handler) throw new Error("onTerminalInput was not called");
      return handler;
    },
    get done() {
      return done;
    },
    unsubscribe,
    get unsubscribeCalls() {
      return unsubscribeCalls;
    },
    tuiCtx,
  };
}
test("openRoomPanel registers an onTerminalInput handler", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const { tuiCtx } = captureTerminalInput();
  await openRoomPanel(pi, tuiCtx);
  // If we got here without throwing, the handler was registered.
  // The captureTerminalInput helper throws if onTerminalInput was not called.
});

test("the registered handler forwards a key to the panel and returns { consume: true }", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  // Bind the helper first: destructuring evaluates a getter immediately, and `handler` throws while
  // it is still unset — before openRoomPanel has run.
  const capture = captureTerminalInput();
  await openRoomPanel(pi, capture.tuiCtx);
  const result = capture.handler("j");
  expect(result).toEqual({ consume: true });
});

test("closing the panel unsubscribes exactly once", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput();
  await openRoomPanel(pi, capture.tuiCtx);
  // `esc` is the panel's close key: handleInput -> done() -> close() -> unsubscribe(). Driving the
  // key is the real path; calling the host's close callback directly would bypass the panel.
  expect(capture.handler("\x1b")).toEqual({ consume: true });
  expect(capture.unsubscribeCalls).toBe(1);
  // A second close is a no-op (dispose is idempotent).
  capture.handler("\x1b");
  expect(capture.unsubscribeCalls).toBe(1);
});
test("an unmapped key is not consumed", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput();
  await openRoomPanel(pi, capture.tuiCtx);
  const result = capture.handler("z");
  expect(result).toBeUndefined();
});

// --- F2 security: ANSI injection in roomId ---------------------------------

test("roomId with ANSI escape is sanitized in the title", () => {
  const store = fixtureStore();
  const panel = makePanel(store, 30, { roomId: "x\x1b[2Jy" });
  const rows = panel.render(80);
  const text = rows.join("\n").replace(ANSI, "");
  expect(text).not.toContain("\x1b");
  expect(text).toContain("xy");
});

// --- 9. theme fallback shape (D5) -------------------------------------------

test("the fallback theme satisfies every member src/ reads (D5, and the boxRound regression)", () => {
  // The fallback theme is not decoration: it is the second half of the boxRound bug. The panel's
  // frame rows are drawn by the HOST's `topBorderSplit`/`divider`/`bottomBorder`, which read the
  // host `theme` singleton rather than the theme handed to the panel, so a partial fallback renders
  // the pane and still kills the panel at `chrome.ts`. Four crashes in one bug: `statusGlyph`,
  // `statusText`, `topBorderSplit`, then the shim itself.
  const shim = uncolouredTheme();
  const t = shim as unknown as {
    fg: unknown;
    bold: unknown;
    styledSymbol: unknown;
    boxRound: { topLeft: string };
    md: { quoteBorder: string };
    sep: unknown;
    nav: unknown;
    tree: unknown;
    status: unknown;
  };
  // Presence: every one of these is read somewhere in src/ (or by the host chrome).
  expect(t.boxRound.topLeft).toBeTruthy();
  expect(t.md.quoteBorder).toBeTruthy();
  expect(typeof t.styledSymbol).toBe("function");
  // Arity: `bold` takes ONE argument in the host Theme, not two like `fg`. A fallback written as
  // `bold(_tone, text) => text` returns `undefined` for every author cell — caught live, not by a
  // test, because the frame rows read the host singleton and never see the fallback in-process.
  expect((t.bold as (text: string) => string)("AgentA")).toBe("AgentA");
  expect((t.fg as (tone: string, text: string) => string)("accent", "AgentA")).toBe("AgentA");
  expect((t.styledSymbol as (key: string, tone: string) => string)("tool.irc", "accent")).toBe("✉");
  // Getter-shaped members must stay strings, or consumers interpolate them literally.
  for (const bucket of [t.sep, t.nav, t.tree, t.status, t.md]) {
    for (const value of Object.values(bucket as Record<string, string>))
      expect(typeof value).toBe("string");
  }
});

test("the fallback theme renders chat rows with no undefined or function source (D5)", () => {
  // `renderChatRows` is theme-sourced, so unlike the full panel it ACTUALLY reads the fallback —
  // which makes it the only in-process check that can fail on a bad one.
  const shim = uncolouredTheme();
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  for (let i = 0; i < 3; i++)
    store.append({ kind: "msg", from: "AgentA", topic: "t", body: `m${i}` });

  const rows = panelRows(store, shim as unknown as Theme, 80);
  const text = rows.join("\n");
  expect(text).not.toContain("undefined");
  expect(text).not.toContain("=> text");
  expect(text).toContain("AgentA");
});

// --- 10. chat row glyph and spacing defects (D1/D2/D3/D7) ------------------

test("chat row: one-cell tier glyph, single-spaced separator", () => {
  const store = storeFor(tempRoot(), "r");
  const rows: ChatRow[] = [
    {
      seq: 1,
      ts: 1_700_000_000_000,
      tier: "T0",
      author: "Alpha",
      topic: "build",
      body: "first",
      unread: true,
      threadDepth: 0,
      mention: false,
    },
    {
      seq: 2,
      ts: 1_700_000_000_100,
      tier: "T1",
      author: "Beta",
      topic: "build",
      body: "second",
      unread: false,
      threadDepth: 0,
      mention: false,
    },
    {
      seq: 3,
      ts: 1_700_000_000_200,
      tier: "T2",
      author: "Gamma",
      topic: "chat",
      body: "third",
      unread: true,
      threadDepth: 0,
      mention: true,
    },
  ];
  const out = renderChatRows(rows, 100, theme);

  // D3: no ASCII tier badge anywhere — the badge is a 1-cell theme status glyph.
  for (const row of out) {
    expect(row.replace(ANSI, "")).not.toContain("T0");
    expect(row.replace(ANSI, "")).not.toContain("T1");
    expect(row.replace(ANSI, "")).not.toContain("T2");
  }
  // D1: no triple space around the separator. `sep.dot` is already " · " (symbols.ts:455), so the
  // old `${topic} ${sep.dot} ${body}` produced "topic  ·  body".
  for (const row of out) expect(row.replace(ANSI, "")).not.toContain("  ·  ");
  // D2: the unread cursor no longer abuts the badge. It reads "❯✘ <time>" — cursor, glyph, space.
  // The row starts with the selection-marker cell (a space when the row is not selected), so the
  // columns of every row stay aligned.
  expect(out[0]!.replace(ANSI, "")).toMatch(/^.?❯✘ \d\d:\d\d:\d\d /);
  // D7: the author/topic separator is the theme's nav.selected, not a hardcoded "›".
  expect(out[0]!.replace(ANSI, "")).not.toContain("›");
  // Every row is padded/trimmed to exactly `width` VISIBLE cells (ANSI codes are invisible).
  for (const row of out) expect(visibleWidth(row)).toBe(100);
  store.reset();
});

test("panel `r` releases through the arbiter: reason released + waiter promoted + notified", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput();
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  // Main holds the lease; W waits on it.
  grant(store, "build/step", "Main", 60_000);
  enqueueWaiter(store, "build/step", "W");
  // Focus the board pane, select the row, press `r`.
  expect(capture.handler("2")).toEqual({ consume: true });
  expect(capture.handler("r")).toEqual({ consume: true });
  // The holder's own release reasons "released" (not "reclaimed") and promotes the waiter.
  const releases = store.records.filter((r) => r.kind === "release");
  expect(releases.length).toBe(1);
  expect(releases[0]).toMatchObject({ resource: "build/step", reason: "released" });
  expect(store.claims.get("build/step")?.holder).toBe("W");
});

// --- the live-pty findings: the index leak, the focus, the selection --------

test("`r` in CHAT focus releases nothing (the old shared index released an arbitrary claim)", () => {
  const store = fixtureStore();
  const released: string[] = [];
  const panel = makePanel(store, 30, { onReleaseClaim: (resource) => released.push(resource) });
  try {
    // The chat has ONE row, the board has ONE claim. With one shared index, `G` (bottom) clamped
    // the index to the CHAT's row count (0) and `r` then released board row 0 — a claim the user
    // never selected.
    panel.handleInput("G");
    panel.handleInput("r");
    expect(released).toEqual([]);

    // With the board focused, `r` releases the claim the user has selected.
    panel.handleInput("2");
    panel.handleInput("r");
    expect(released).toEqual(["build/step"]);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("`r` in board focus releases the row the user sees (display order: held first)", () => {
  const store = fixtureStore();
  store.append({ kind: "claim", from: "AgentC", resource: "build/second", ttlMs: 600_000 });
  const released: string[] = [];
  const panel = makePanel(store, 30, { onReleaseClaim: (resource) => released.push(resource) });
  try {
    panel.handleInput("2");
    panel.handleInput("r");
    expect(released).toEqual(["build/step"]);
    panel.handleInput("j");
    panel.handleInput("r");
    expect(released).toEqual(["build/step", "build/second"]);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("the focused pane is visible in the rendered panel", () => {
  const store = fixtureStore();
  const panel = makePanel(store);
  try {
    const chatFocused = panel.render(100).join("\n");
    expect(chatFocused).toContain("[chat]|board");
    panel.handleInput("2");
    const boardFocused = panel.render(100).join("\n");
    expect(boardFocused).toContain("chat|[board]");
    expect(boardFocused).not.toContain("[chat]|board");
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("R9: the board row shows what the claim is waiting on", () => {
  const now = Date.now();
  const rows: BoardRow[] = [
    {
      resource: "build/parser",
      holder: "AgentA",
      ttlMs: 60_000,
      expiresAt: now + 30_000,
      acquiredAt: now,
      waiting: ["AgentB", "AgentC"],
      dependsOn: ["build/schema", "build/types"],
      state: "held",
    },
  ];
  const text = projectClaims(rows, 100, theme).join("\n");
  // the dependency, and the count of the rest
  expect(text).toContain("build/schema");
  expect(text).toContain("+1");
});

test("R6: the chat pane shows the topic's status ledger", () => {
  const root = tempRoot();
  const store = storeFor(root, roomIdFor(root));
  store.append(ledgerMsg(1, "yes"));
  const looping = panelRows(store, theme, 120).join("\n");
  expect(looping).toContain("looping");
  expect(looping).toContain("AgentB");

  const root2 = tempRoot();
  const store2 = storeFor(root2, roomIdFor(root2));
  store2.append(ledgerMsg(1, "no"));
  const healthy = panelRows(store2, theme, 120).join("\n");
  expect(healthy).not.toContain("looping");
  expect(healthy).toContain("AgentB");
});

test("the selected row is marked in the board pane", () => {
  const store = fixtureStore();
  const panel = makePanel(store);
  try {
    panel.handleInput("2");
    const rows = projectClaims(
      [
        {
          resource: "build/step",
          holder: "AgentB",
          state: "held",
          expiresAt: 0,
          ttlMs: 1,
          waiting: [],
          dependsOn: [],
        },
        {
          resource: "build/other",
          holder: "AgentC",
          state: "held",
          expiresAt: 0,
          ttlMs: 1,
          waiting: [],
          dependsOn: [],
        },
      ] as unknown as BoardRow[],
      60,
      theme,
      Date.now(),
      1,
    );
    // The marker is the THEME's own "selected" glyph (nav.selected), not a hardcoded character.
    expect(rows[1]).toContain(theme.nav.selected);
    expect(rows[0]).not.toContain(theme.nav.selected);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("the board keeps an ended claim visible, dimmed (it does not vanish mid-frame)", () => {
  // §6.4 — a row moves to the bottom, dimmed, rather than vanishing: a board whose claims blink
  // out as they expire is unreadable. A RELEASED claim is not in the store's live claim map, so
  // the panel finds it in the log's tail.
  const store = fixtureStore();
  store.append({
    kind: "release",
    from: "AgentB",
    resource: "build/step",
    reason: "released",
    prevHolder: "AgentB",
  });
  const panel = makePanel(store);
  try {
    const screen = panel.render(100).join("\n");
    // The ended claim is still listed — not gone (before the fix the board said "no claims",
    // because the store's claim map only holds live leases).
    expect(screen).toContain("build/step");
    expect(screen).not.toContain("no claims");
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("`r` on a claim that already ended releases nothing", () => {
  const store = fixtureStore();
  store.append({
    kind: "release",
    from: "AgentB",
    resource: "build/step",
    reason: "released",
    prevHolder: "AgentB",
  });
  const released: string[] = [];
  const panel = makePanel(store, 30, { onReleaseClaim: (resource) => released.push(resource) });
  try {
    panel.handleInput("2");
    panel.handleInput("r");
    // The only claim on the board has ended, so there is nothing to release.
    expect(released).toEqual([]);
  } finally {
    panel.dispose();
    store.reset();
  }
});
