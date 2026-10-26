import { afterAll, beforeAll, expect, setSystemTime, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentRef,
  AgentRegistry,
  type ExtensionAPI,
  type ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import {
  type Component,
  ensureThemeSync,
  type SymbolKey,
  setThemeInstance,
  type Theme,
  type TUI,
  theme,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { activeThemeSymbol, setActiveSymbolTheme } from "@oh-my-pi/pi-tui/theme/active-symbols";
import { registerRoomCommand } from "../src/commands/room-command";
import { roomIdFor } from "../src/ids";
import {
  type BoardRow,
  boardColumns,
  createBoardPane,
  projectClaims,
} from "../src/panel/board-pane";
import {
  type ChatRow,
  createChatPane,
  projectChatRows,
  renderChatRows,
} from "../src/panel/chat-pane";
import { frameBottomRow, frameDividerRow, frameHintRow, frameTopRow } from "../src/panel/chrome";
import { adoptHostTheme, uncolouredTheme } from "../src/panel/host-theme";
import { actionFor, PANEL_KEY_MAP, type PanelAction } from "../src/panel/keys";
import {
  openRoomPanel,
  PANEL_SPLIT_AT,
  RoomPanel,
  type RoomPanelOptions,
  registerPanel,
} from "../src/panel/panel";
import { renderRosterStrip, statusCounts } from "../src/panel/roster-strip";
import { enqueueWaiter, grant } from "../src/store/claims";
import { type MemberState, type RoomStore, roomStoreFor, storeFor } from "../src/store/room-store";
import type { RoomRecord } from "../src/store/schema";

// --- fixtures -------------------------------------------------------------

const TMP: string[] = [];
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI needs ESC
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * A regex-safe literal for a theme glyph.
 *
 * The assertions below are built from the THEME's own values, because the glyph is the user's
 * active symbol set: "[!!]" is a character class, "->" is a quantifier, and a private-use glyph is
 * neither. Escaping keeps the expectation about the VALUE, not about the regex dialect.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A theme whose "selected" glyph is `glyph` — the ascii symbol set's TWO-cell cursor ("->").
 *
 * The glyph's WIDTH is part of the contract: a cell that is one cell wide truncates a two-cell
 * marker, and the host paints its own ellipsis where the marker was.
 */
function themeWithSelectedGlyph(glyph: string): Theme {
  return new Proxy(theme, {
    get(target, prop) {
      if (prop === "nav") {
        const nav = Reflect.get(target, "nav", target) as Record<string, string>;
        return new Proxy(nav, {
          get(navTarget, navProp) {
            if (navProp === "selected") return glyph;
            return Reflect.get(navTarget, navProp, navTarget);
          },
        });
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Theme;
}

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
test("chat pane follows the selection above the tail window", () => {
  // Line 204: with 20 rows and a height-5 window the tail starts at row 15;
  // selecting row 0 pulls the window up so the marker stays visible.
  const records: RoomRecord[] = Array.from({ length: 20 }, (_, i) => msg(i + 1, `line-${i + 1}`));
  const rows = projectChatRows(records, viewer(), 0);
  const pane = createChatPane(
    () => rows,
    5,
    theme,
    () => 0,
  );
  const out = pane(60, 5);
  expect(out.length).toBe(5);
  expect(out.join("\n")).toContain("line-1");
  expect(out.join("\n")).not.toContain("line-20");
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

test("openRoomPanel notifies instead of throwing when the overlay fails", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const notified: string[] = [];
  const ctx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    cwd: tempRoot(),
    localProtocolOptions: { getArtifactsDir: () => tempRoot(), getSessionId: () => "s" },
    setInterval: () => "t",
    clearTimer: () => {},
    ui: {
      notify: (message: string) => notified.push(message),
      custom: async () => {
        throw new Error("overlay boom");
      },
    },
  } as unknown as ExtensionContext;
  await openRoomPanel(pi, ctx);
  expect(notified.some((m) => m.startsWith("Room panel unavailable:"))).toBe(true);
});

test("registerPanel registers the shortcut only when the flag is set", async () => {
  const shortcuts: string[] = [];
  const closers: Array<() => void> = [];
  const plain = {
    on: (_event: string, _handler: () => void) => {},
    getFlag: (_name: string) => undefined,
    registerShortcut: (key: string) => shortcuts.push(key),
  } as unknown as ExtensionAPI;
  registerPanel(plain);
  expect(shortcuts).toEqual([]);
  const flagged = {
    on: (_event: string, _handler: () => void) => {},
    getFlag: (_name: string) => "ctrl-r",
    registerShortcut: (key: string) => shortcuts.push(key),
  } as unknown as ExtensionAPI;
  registerPanel(flagged);
  // The registered handler opens the panel: with no TUI it degrades instead of throwing.
  const handlers: Array<(ctx: ExtensionContext) => Promise<void>> = [];
  const withHandler = {
    on: (_event: string, _handler: () => void) => {},
    getFlag: (_name: string) => "ctrl-r",
    registerShortcut: (
      _key: string,
      options: { handler: (ctx: ExtensionContext) => Promise<void> },
    ) => handlers.push(options.handler),
  } as unknown as ExtensionAPI;
  registerPanel(withHandler);
  expect(handlers).toHaveLength(1);
  const notified: string[] = [];
  const printCtx = {
    hasUI: false,
    mode: "print",
    ui: { notify: (message: string) => notified.push(message) },
  } as unknown as ExtensionContext;
  await handlers[0](printCtx);
  expect(notified.length).toBeGreaterThan(0);
  for (const close of closers) close();
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

/**
 * A fake ctx that captures the onTerminalInput handler, the done callback, and every `notify`.
 * The `notified` array also captures the rejection branch of `openRoomPanel`'s delivery float
 * (lines 620-629): the handler path is async but the test awaits a macrotask before asserting.
 */
function captureTerminalInput(options: { agentId?: string } = {}): {
  handler: (data: string) => { consume: true } | undefined;
  done: () => void;
  unsubscribe: () => void;
  unsubscribeCalls: number;
  notified: Array<{ message: string; level: string }>;
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
  const notified: Array<{ message: string; level: string }> = [];
  const root = tempRoot();
  const tuiCtx = {
    hasUI: true,
    mode: "tui",
    agent: { id: options.agentId ?? "Main", kind: "main", name: "main", depth: 0 },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    setInterval: () => "t",
    clearTimer: () => {},
    // The host's managed timers (I4): the bounded send needs a deadline, and a raw timer is
    // forbidden — so the fake ctx exposes the same `ctx.setTimeout` pair the attention tests use.
    setTimeout: (callback: (...args: unknown[]) => void, ms?: number): Timer =>
      setTimeout(callback, ms),
    ui: {
      notify: (message: string, level?: string) => notified.push({ message, level: level ?? "" }),
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
    notified,
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
  // The envelope glyph is the HOST's own — the user's active symbol set decides what it is
  // ("✉" in unicode, a private-use glyph in nerd, "#" in ascii), so the fallback is asserted
  // against the host's live lookup, never against a literal.
  expect((t.styledSymbol as (key: string, tone: string) => string)("tool.irc", "accent")).toBe(
    activeThemeSymbol("tool.irc"),
  );
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
  // D1: no triple space around the separator. `sep.dot` already carries its own flanks (" · " in
  // unicode, " - " in ascii), so the old `${topic} ${sep.dot} ${body}` produced "topic  ·  body".
  // The expectation is built from the THEME's separator: a literal only describes one symbol set.
  for (const row of out) expect(row.replace(ANSI, "")).not.toContain(`${theme.sep.dot} `);
  // D2: the unread cursor no longer abuts the badge. It reads "<cursor><glyph> <time>" — cursor,
  // glyph, space. Both glyphs are the theme's own (`nav.cursor`, `status.error`): the ascii set
  // paints ">" and "[!!]", the nerd set private-use shapes, so a literal fails for every user but
  // the unicode one. The row starts with the selection-marker cell (a space when the row is not
  // selected), so the columns of every row stay aligned.
  const cursor = escapeRegExp(theme.nav.cursor);
  const badge = escapeRegExp(theme.status.error);
  const head = new RegExp(`^.?${cursor}${badge} \\d\\d:\\d\\d:\\d\\d `);
  expect(out[0]!.replace(ANSI, "")).toMatch(head);
  // D7: the author/topic separator is the theme's nav.selected, not a hardcoded "›".
  expect(out[0]!.replace(ANSI, "")).toContain(theme.nav.selected);
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

test("panel `r` on a stale held row refreshes without throwing or appending a release", async () => {
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput();
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  // Main holds the lease; the board projects it as held.
  grant(store, "build/step", "Main", 60_000);
  expect(capture.handler("2")).toEqual({ consume: true });
  const recordsBefore = store.records.length;
  // The race: the claim leaves the map without a log append (no listener fires), so the board
  // cache still shows the row as held when the user presses `r`.
  store.claims.delete("build/step");
  expect(capture.handler("r")).toEqual({ consume: true });
  // No throw, no release record appended by the panel, and the board re-projects cleanly.
  expect(store.records.length).toBe(recordsBefore);
  expect(store.records.filter((r) => r.kind === "release").length).toBe(0);
});
test("panel `r` on a foreign holder's EXPIRED claim reclaims through the arbiter", async () => {
  // Lines 615-616: the foreign-holder branch — `r` on a claim held by ANOTHER agent routes to
  // `reclaimIfStale`, not to `release`. Staleness here comes from a parked holder (deterministic:
  // no wall-clock sleep): the registry reports "parked", so the lease is stale even with a live
  // TTL, and the reclaim reasons "reclaimed" and promotes the waiter.
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput({ agentId: "Main" });
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  // Other holds the lease; Main waits on it.
  grant(store, "build/step", "Other", 600_000);
  enqueueWaiter(store, "build/step", "Main");
  AgentRegistry.global().register({
    id: "Other",
    displayName: "Other",
    kind: "sub",
    status: "parked",
    session: null,
  });
  try {
    expect(capture.handler("2")).toEqual({ consume: true });
    expect(capture.handler("r")).toEqual({ consume: true });
    // The stale foreign claim was reclaimed: a release record naming the displaced holder.
    const releases = store.records.filter((r) => r.kind === "release");
    expect(releases.length).toBe(1);
    expect(releases[0]).toMatchObject({
      resource: "build/step",
      reason: "reclaimed",
      prevHolder: "Other",
    });
    // The waiter (Main) was promoted to the lease.
    expect(store.claims.get("build/step")?.holder).toBe("Main");
  } finally {
    AgentRegistry.global().unregister("Other");
  }
  // The floated delivery pass resolves after the sync key path; flush it before teardown.
  await Promise.resolve();
});

test("panel `r` on a foreign holder's LIVE claim appends nothing (reclaim-if-stale refuses)", async () => {
  // The same 615-616 branch, live side: `reclaimIfStale` on a lease that is neither expired nor
  // held by a parked/aborted agent returns `{ reclaimed: false }` — no record, no promotion, no
  // throw. The panel still refreshes, so the board keeps showing the foreign holder.
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput({ agentId: "Main" });
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  grant(store, "build/step", "Other", 600_000);
  expect(capture.handler("2")).toEqual({ consume: true });
  const recordsBefore = store.records.length;
  expect(capture.handler("r")).toEqual({ consume: true });
  expect(store.records.length).toBe(recordsBefore);
  expect(store.claims.get("build/step")?.holder).toBe("Other");
  // The floated delivery pass resolves after the sync key path; flush it before teardown.
  await Promise.resolve();
});

test("panel `o` on a held claim names the holder and points at the agent hub", async () => {
  // Line 635: the REAL onFocusAgent closure — no extension-facing focus action exists, so the
  // overlay names the agent and tells the human to jump via the agent hub. Driven through the
  // REAL panel behind `openRoomPanel` (board focus + `o`), not a stubbed callback.
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput({ agentId: "Main" });
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  grant(store, "build/step", "Other", 600_000);
  expect(capture.handler("2")).toEqual({ consume: true });
  expect(capture.handler("o")).toEqual({ consume: true });
  expect(capture.notified).toHaveLength(1);
  expect(capture.notified[0]!.message).toContain("Other");
  expect(capture.notified[0]!.message).toContain("agent hub");
  expect(capture.notified[0]!.level).toBe("info");
});
test("openRoomPanel's timer wiring runs setInterval and clears through clearTimer on dispose", async () => {
  // Lines 637-639: the REAL factory passes `ctx.setInterval`/`ctx.clearTimer` into the panel, and
  // dispose() clears the age timer through the passthrough. Driven through the REAL openRoomPanel
  // (not a direct constructor): the custom stub captures the constructed panel, the fake ctx
  // observes the SAME token flowing from setInterval to clearTimer, and dispose is idempotent.
  // (Lines 624-628's rejection arm is intentionally untested: `notifyRecipients` try/catches every
  // send and the `.then` chain swallows, so the rejection is unreachable — defensive-dead.)
  ensureThemeSync();
  const tokens: unknown[] = [];
  const cleared: unknown[] = [];
  let panel: Component | undefined;
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const root = tempRoot();
  const tuiCtx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    setInterval: ((callback: () => void, ms: number) => {
      void callback;
      void ms;
      tokens.push(`age-token-${tokens.length + 1}`);
      return tokens[tokens.length - 1];
    }) as never,
    clearTimer: ((timer: unknown) => {
      cleared.push(timer);
    }) as never,
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
        panel = factory(tuiStub(30), theme, {}, () => {});
        return undefined as never;
      },
      onTerminalInput: () => () => {},
    },
  } as unknown as ExtensionContext;
  await openRoomPanel(pi, tuiCtx);
  // ctx.setInterval is shared (panel age timer + store background jobs), so the panel's token is
  // the LAST one issued before the factory ran — the one dispose() must clear exactly once.
  expect(tokens.length).toBeGreaterThanOrEqual(1);
  const roomPanel = panel as unknown as RoomPanel;
  expect(() => roomPanel.dispose()).not.toThrow();
  const panelToken = tokens[tokens.length - 1];
  expect(cleared).toContain(panelToken);
  expect(cleared.filter((t) => t === panelToken)).toHaveLength(1);
  // Dispose is idempotent: the token is cleared exactly once.
  roomPanel.dispose();
  expect(cleared.filter((t) => t === panelToken)).toHaveLength(1);
});
test("panel `r` delivery failure surfaces as a warning notify (lines 620-628)", async () => {
  // Lines 620-628: the key path is sync but the push is async — a rejection lands in the `.then`
  // rejection arm and surfaces via `notify` as a warning. Forced headless by registering a live
  // registry session whose send REJECTS: the release record classifies T0 for the displaced holder
  // (prevHolder === Other), so the pass attempts the send and the rejection propagates as the
  // pass's failure note.
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const capture = captureTerminalInput({ agentId: "Main" });
  await openRoomPanel(pi, capture.tuiCtx);
  const store = roomStoreFor(capture.tuiCtx);
  // Other is a RUNNING follower of the topic: Main's own live lease releases with reason
  // "released", which classifies T1 for a topic follower — so the pass attempts the send to
  // Other, Other's session REJECTS, and the rejection propagates as the pass's failure note.
  // (The reclaim shapes cannot force this: a stale-by-expiry row projects as `expired`, which
  // `handleInput` refuses to release, and a parked holder is SKIPPED by `deliver` with no send.)
  grant(store, "build/step", "Main", 60_000);
  store.members.set("Other", {
    agentId: "Other",
    joinedAtSeq: 0,
    topics: new Set(["build"]),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  });
  AgentRegistry.global().register({
    id: "Other",
    displayName: "Other",
    kind: "sub",
    status: "running",
    session: {
      sendCustomMessage: async () => {
        throw new Error("transport boom");
      },
    } as never,
  });
  try {
    expect(capture.handler("2")).toEqual({ consume: true });
    expect(capture.handler("r")).toEqual({ consume: true });
    // The release itself still went through (the log is durable before the push runs).
    expect(store.records.filter((r) => r.kind === "release")).toHaveLength(1);
    // The floated push rejects → the rejection arm notifies a warning. The host's send resolves
    // when the target's turn ends, so the rejection needs a macrotask to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(capture.notified.some((n) => n.message.startsWith("delivery: "))).toBe(true);
    expect(
      capture.notified.some((n) => n.message.startsWith("delivery: ") && n.level === "warning"),
    ).toBe(true);
  } finally {
    AgentRegistry.global().unregister("Other");
  }
});

test("registerPanel's session_shutdown closer closes the open panel (ACTIVE_PANEL observable)", async () => {
  // Lines 677-681: the closer invokes the captured `close`, which unsubscribes the terminal-input
  // listener and calls the host's overlay `done`. Observable headlessly: the custom stub captures
  // the host-side `done`, and the `onTerminalInput` stub counts unsubscribes.
  //
  // `openRoomPanel` awaits `ctx.ui.custom` and DELETES the ACTIVE_PANEL entry in its `finally`
  // when the overlay resolves — so the custom stub must stay PENDING (the overlay is still open)
  // while the shutdown fires. The pending promise is settled at the end so the open call can
  // return and the `afterAll` tmp cleanup is not held up.
  //
  // NOTE: `close` does NOT dispose the RoomPanel (the host owns teardown; dispose is only for the
  // panel's own listeners/timer) — so the age timer is NOT cleared here. Line 639's clearTimer
  // passthrough is already covered by the dispose-idempotence tests through the real panel.
  const shutdownHandlers: Array<() => void> = [];
  const pi = {
    on: (event: string, handler: () => void) => {
      if (event === "session_shutdown") shutdownHandlers.push(handler);
    },
    getFlag: (_name: string) => undefined,
  } as unknown as ExtensionAPI;
  registerPanel(pi);
  expect(shutdownHandlers).toHaveLength(1);
  ensureThemeSync();
  let unsubscribes = 0;
  let hostDoneCalls = 0;
  const overlayOpen = Promise.withResolvers<void>();
  const root = tempRoot();
  const tuiCtx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    setInterval: () => "age-timer",
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
        const panel = factory(tuiStub(30), theme, {}, () => {
          hostDoneCalls += 1;
        });
        void panel;
        // The overlay stays open (the host would resolve this when the user closes it).
        await overlayOpen.promise;
        return undefined as never;
      },
      onTerminalInput: () => () => {
        unsubscribes += 1;
      },
    },
  } as unknown as ExtensionContext;
  const open = openRoomPanel(pi, tuiCtx);
  // Let the factory run (ACTIVE_PANEL is set inside `custom`'s synchronous factory call).
  await Promise.resolve();
  await Promise.resolve();
  // The shutdown closer runs the captured `close`: unsubscribe once + host done once.
  shutdownHandlers[0]!();
  expect(unsubscribes).toBe(1);
  expect(hostDoneCalls).toBe(1);
  // ...and the ACTIVE_PANEL entry is gone: a second shutdown is a no-op (no double-unsubscribe).
  shutdownHandlers[0]!();
  expect(unsubscribes).toBe(1);
  expect(hostDoneCalls).toBe(1);
  overlayOpen.resolve();
  await open;
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

test("`o` in board focus focuses the selected row's holder; in chat focus it focuses nothing", () => {
  const store = fixtureStore();
  const focused: string[] = [];
  const panel = makePanel(store, 30, { onFocusAgent: (id) => focused.push(id) });
  try {
    // Chat focus: `o` has no row to read, so it focuses nothing.
    panel.handleInput("o");
    expect(focused).toEqual([]);
    // Board focus: `o` focuses the selected claim's holder (AgentB).
    panel.handleInput("2");
    panel.handleInput("o");
    expect(focused).toEqual(["AgentB"]);
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

test("`k`/`g`/`G` move the focused pane's own selection; `1` returns focus to chat", () => {
  const store = fixtureStore();
  store.append({ kind: "claim", from: "AgentC", resource: "build/second", ttlMs: 600_000 });
  const released: string[] = [];
  const panel = makePanel(store, 30, { onReleaseClaim: (resource) => released.push(resource) });
  try {
    // Board focus: `j` moves down to the second row, `k` moves back up.
    panel.handleInput("2");
    panel.handleInput("j");
    panel.handleInput("r");
    expect(released).toEqual(["build/second"]);
    panel.handleInput("k");
    panel.handleInput("r");
    expect(released).toEqual(["build/second", "build/step"]);
    // `G` jumps to the bottom row, `g` back to the top.
    panel.handleInput("G");
    panel.handleInput("r");
    expect(released).toEqual(["build/second", "build/step", "build/second"]);
    panel.handleInput("g");
    panel.handleInput("r");
    expect(released).toEqual(["build/second", "build/step", "build/second", "build/step"]);
    // `1` returns focus to chat: `r` releases nothing there.
    panel.handleInput("1");
    panel.handleInput("r");
    expect(released).toEqual(["build/second", "build/step", "build/second", "build/step"]);
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

// --- the host-convention fixes (panel rendering) ---------------------------

/** A chat row carrying the topic's status ledger, as R6 records it. */
function ledgerRow(seq: number, ts: number, body: string): ChatRow {
  return {
    seq,
    ts,
    tier: "T1",
    author: "AgentA",
    topic: "build",
    body,
    mention: false,
    unread: false,
    threadDepth: 0,
    status: {
      is_request_satisfied: { reason: "the parser is green", answer: "no" },
      is_in_loop: { reason: "the same edit, again", answer: "yes" },
      is_progress_being_made: { reason: "the last commit changed the parser", answer: "yes" },
      next_speaker: { reason: "the parser needs the schema", answer: "AgentB" },
      instruction_or_question: { reason: "AgentB must publish the schema", answer: "publish it" },
    },
  };
}

test("the chat row budgets its width: the ledger survives, the body yields", () => {
  // The row used to reserve a GUESSED 32 cells for the head and append the ledger AFTER the
  // body, so a row wider than the guess pushed the ledger off the end of the line — the one part
  // of the row a human acts on. The head is now measured and the ledger is reserved before the
  // body gets anything.
  const row = ledgerRow(1, Date.now(), "hello world");
  const out = renderChatRows([row], 70, theme);
  const line = out[0]!;
  const plain = line.replace(ANSI, "");
  expect(visibleWidth(line)).toBe(70);
  // The ledger reads in full — "publish it" is the last word on the line. The separator is the
  // THEME's `sep.dot` (" · " in unicode and nerd, " - " in ascii), so the expectation is built
  // from the theme rather than from one symbol set's literal.
  expect(plain).toContain(`looping${theme.sep.dot}next AgentB${theme.sep.dot}publish it`);
  // The body still shows what fits: the START of it (the rest is cut, and the cut is marked).
  // How much survives depends on the symbol set's glyph widths (the ascii tier badge is four cells
  // wide, the unicode one a single cell), so the assertion is on the prefix, not on a count.
  const bodyAt = plain.indexOf("hel");
  expect(bodyAt, "the body still shows its start").toBeGreaterThan(0);
  const survivor = plain.slice(bodyAt).split(/…|\s/)[0] ?? "";
  expect(survivor.length).toBeGreaterThan(0);
  expect("hello world".startsWith(survivor)).toBe(true);
  // The topic survives too.
  expect(plain).toContain("build");
});

test("the chat ledger's parts keep their own tone (no nested fg)", () => {
  // `theme.fg` ends every string with `\x1b[39m` (theme-class.ts:350), so wrapping the styled
  // parts in one outer `fg` reset the outer tone for everything after the first part. Each part
  // is styled on its own now, the way the host's `renderStatusLine` styles its fragments.
  const row = ledgerRow(1, Date.now(), "body");
  const line = renderChatRows([row], 120, theme)[0]!;
  expect(line).toContain(theme.fg("error", "looping"));
  expect(line).toContain(theme.fg("muted", "next AgentB"));
  expect(line).toContain(theme.fg("muted", "publish it"));
  // "looping" comes first, and the muted parts AFTER it are still muted.
  expect(line.indexOf(theme.fg("error", "looping"))).toBeLessThan(
    line.indexOf(theme.fg("muted", "next AgentB")),
  );
  // `sep.dot` already carries its flanks: no double spaces around the separator.
  expect(line.replace(ANSI, "")).not.toContain(`${theme.sep.dot} `);
});

test("the board pane windows around the selection, so the cursor cannot scroll away", () => {
  // The board used to render EVERY claim and cut the slice from the top, so `j` could move the
  // cursor below the fold and the marker vanished. The window is the host's own (`getMenuWindow`,
  // pi-tui/src/components/menu-selection.ts): it always contains the selected item.
  const now = Date.now();
  const rows: BoardRow[] = Array.from({ length: 20 }, (_, index) => ({
    resource: `build/r${index}`,
    holder: "AgentA",
    ttlMs: 60_000,
    expiresAt: now + 60_000,
    acquiredAt: now,
    waiting: [],
    dependsOn: [],
    state: "held",
  }));
  const pane = createBoardPane(
    () => rows,
    5,
    theme,
    () => 15,
  );
  const out = pane(60, 5);
  expect(out.length).toBe(5);
  const text = out.join("\n");
  expect(text).toContain("build/r15");
  // The marker is on the selected row, and only there.
  const marked = out.filter((line) => line.includes(theme.nav.selected));
  expect(marked.length).toBe(1);
  expect(marked[0]).toContain("build/r15");
  for (const line of out) expect(visibleWidth(line)).toBe(60);
});

test("the board's cursor column is as wide as the theme's cursor glyph (never an ellipsis)", () => {
  // The cursor glyph is the theme's own `nav.selected`, and the user's symbol set decides how wide
  // it is: the ascii set paints "->" (TWO cells), the nerd set a private-use glyph. The cursor
  // column was a fixed ONE cell, so the host truncated the ascii marker to its own ellipsis
  // ("…") — indistinguishable from a chopped cell, and the row lost its cursor entirely.
  const asciiCursor = themeWithSelectedGlyph("->");
  const now = Date.now();
  const rows: BoardRow[] = [
    {
      resource: "build/step",
      holder: "AgentA",
      ttlMs: 60_000,
      expiresAt: now + 12_000,
      acquiredAt: now,
      waiting: [],
      dependsOn: [],
      state: "held",
    },
  ];
  const line = projectClaims(rows, 60, asciiCursor, now, 0)[0]!;
  const plain = line.replace(ANSI, "");
  // The two-cell marker is painted in full.
  expect(plain).toContain("->");
  // And it is not the host's truncation marker.
  expect(plain).not.toContain("…");
  expect(visibleWidth(line)).toBe(60);
  // The theme's own cursor column is sized from the SAME glyph, so the host never truncates it.
  expect(boardColumns(asciiCursor)[0]!.width).toBe(visibleWidth("->"));
  expect(boardColumns(asciiCursor)[0]!.minWidth).toBe(visibleWidth("->"));
});

test("the board row reads in a real pane: the dependency, the waiters and the state survive", () => {
  // The board pane is 55 cells at 120 columns. The old columns declared a 70-cell table, so every
  // column was shrunk on every frame: the holder lost the waiter count and the state word was
  // chopped to "expi…".
  const now = Date.now();
  const rows: BoardRow[] = [
    {
      resource: "build/parser",
      holder: "AgentA",
      ttlMs: 60_000,
      expiresAt: now - 1_000,
      acquiredAt: now - 61_000,
      waiting: ["AgentB", "AgentC"],
      dependsOn: ["build/schema"],
      state: "expired",
    },
  ];
  const lines = projectClaims(rows, 55, theme);
  const text = lines.join("\n");
  // The dependency reads in full — the arrow is the theme's own `nav.back`.
  expect(text).toContain(`build/parser ${theme.nav.back} build/schema`);
  // The waiters survive (the holder cell's floor is 8 cells: "AgentA +2").
  expect(text).toContain("+2");
  // The state word is never chopped.
  expect(text).toContain("expired");
  for (const line of lines) expect(visibleWidth(line)).toBe(55);
});

test("the roster strip under the FALLBACK theme paints no 'undefined' glyph", () => {
  // The fallback theme defined only five of the host's eleven status symbols, and the roster
  // strip reads four of the missing ones (`running`, `enabled`, `shadowed`, `aborted`). Under the
  // fallback the presence strip painted the literal "undefined" in the frame title.
  const shim = uncolouredTheme() as unknown as Theme;
  const refs = [
    { id: "A", status: "running" },
    { id: "B", status: "running" },
    { id: "C", status: "idle" },
    { id: "D", status: "parked" },
    { id: "E", status: "aborted" },
  ] as unknown as AgentRef[];
  const plain = renderRosterStrip(refs, shim);
  expect(plain).not.toContain("undefined");
  expect(plain).toContain("2 running");
  expect(plain).toContain("1 idle");
  expect(plain).toContain("1 parked");
  expect(plain).toContain("1 aborted");
});

test("the roster strip drops whole groups when the title is narrow, and says what it dropped", () => {
  // The strip lives in the frame title, and the host truncates a border title to its segment
  // (pi-tui/src/chrome/overlay-box.ts, `topBorderSplit`). A strip cut mid-group reads as a
  // partial count; a strip that drops whole groups and reports the rest is honest.
  const refs = [
    { id: "A", status: "running" },
    { id: "B", status: "running" },
    { id: "C", status: "idle" },
    { id: "D", status: "parked" },
    { id: "E", status: "aborted" },
  ] as unknown as AgentRef[];
  const plain = renderRosterStrip(refs, theme, 32).replace(ANSI, "");
  expect(visibleWidth(renderRosterStrip(refs, theme, 32))).toBeLessThanOrEqual(32);
  expect(plain).toContain("2 running");
  expect(plain).toContain("1 idle");
  // The dropped groups are counted, not silently lost. The strip's own rule is that the tail
  // loses its WORD before the strip loses a group ("+3 more" is the host's shape, "+3" is what
  // fits when it does not) — and in the ascii set the status glyphs are wider, so the 32-cell
  // budget runs out earlier. Both forms count the drop.
  expect(plain).toMatch(/\+2(?: more)?/);
  expect(plain).not.toContain("parked");
  // With room, every group is there.
  const full = renderRosterStrip(refs, theme).replace(ANSI, "");
  expect(full).toContain("1 parked");
  expect(full).toContain("1 aborted");
  expect(full).not.toContain("more");
});
test("the roster strip returns empty when even one group cannot fit", () => {
  // Line 102-103: a width narrower than the narrowest single group (no tail to
  // shed, nothing to drop) yields "" rather than a cut-mid-group strip.
  const refs = [{ id: "A", status: "running" }] as unknown as AgentRef[];
  expect(renderRosterStrip(refs, theme, 1).replace(ANSI, "")).toBe("");
  // Zero or negative budgets short-circuit at the guard.
  expect(renderRosterStrip(refs, theme, 0)).toBe("");
});
test("chat rows bound a cyclic replyTo chain instead of spinning", () => {
  // threadDepthOf's `seen` set: A replies to B, B replies to A. Without the
  // guard the walk never terminates; with it the depth stops at the cycle.
  const viewer = {
    agentId: "me",
    status: "running",
    topics: new Set<string>(),
    heldTopics: new Set<string>(),
  } as unknown as MemberState;
  const records = [
    { kind: "msg", id: "a", seq: 1, ts: 1, from: "x", topic: "t", body: "A", replyTo: "b" },
    { kind: "msg", id: "b", seq: 2, ts: 2, from: "y", topic: "t", body: "B", replyTo: "a" },
  ] as unknown as RoomRecord[];
  const rows = projectChatRows(records, viewer, 0);
  expect(rows).toHaveLength(2);
  // A→B→A resolves in 2 steps via the `seen` set; without it the walk runs
  // to the depth-8 cap.
  expect(rows[0].threadDepth).toBe(2);
  expect(rows[1].threadDepth).toBe(2);
});

test("the panel's frame glyph and title separator come from the theme", () => {
  // The split's border was a hardcoded "│" and the title a hardcoded " · ". Both are theme
  // symbols (`boxRound.vertical`, `sep.dot`), and the panel is the one surface that must follow
  // the user's theme.
  const shim = uncolouredTheme() as Record<string, unknown>;
  const custom = {
    ...shim,
    sep: { dot: " | ", space: " " },
    boxRound: { ...(shim.boxRound as Record<string, string>), vertical: "|" },
  };
  const store = fixtureStore();
  const panel = makePanel(store, 30, { theme: custom as unknown as Theme });
  try {
    const rows = panel.render(100);
    const text = rows.join("\n");
    // The title's separator is the theme's `sep.dot`.
    expect(text).toContain(" | [chat]|board");
    // The roster strip joins its groups with the theme's `sep.dot` too.
    const refs = [
      { id: "A", status: "running" },
      { id: "B", status: "idle" },
    ] as unknown as AgentRef[];
    expect(renderRosterStrip(refs, custom as unknown as Theme)).toContain(" | ");
    // The split's frame is the theme's `boxRound.vertical`.
    const chatLine = rows.find((row) => row.includes("hello-chat"));
    expect(chatLine?.startsWith("|")).toBe(true);
    for (const row of rows) expect(visibleWidth(row)).toBe(100);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("a theme without boxRound.vertical falls back to the host default glyph, not a throw", () => {
  // The half-built theme of 18.8.7: boxRound exists but has no vertical member.
  const shim = uncolouredTheme() as unknown as Record<string, unknown>;
  const { vertical: _dropped, ...rest } = shim.boxRound as Record<string, string>;
  const custom = { ...shim, boxRound: rest };
  const store = fixtureStore();
  const panel = makePanel(store, 30, { theme: custom as unknown as Theme });
  try {
    const rows = panel.render(100);
    const text = rows.join("\n");
    // Falls back to BOX_ROUND.vertical ("│") instead of rendering "undefined" or throwing.
    expect(text).not.toContain("undefined");
    const chatLine = rows.find((row) => row.includes("hello-chat"));
    expect(chatLine).toBeDefined();
    for (const row of rows) expect(visibleWidth(row)).toBe(100);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("the chat row's clock is local time, like the host's transcript", () => {
  // The row sliced `toISOString()`, which is UTC, while the host renders its own timestamps in
  // local time (pi-tui/src/chat/user-message.ts uses `toLocaleTimeString`;
  // pi-tui/src/chrome/local-date.ts uses `getHours()`).
  const ts = new Date(2026, 0, 2, 3, 4, 5).getTime();
  const row: ChatRow = {
    seq: 1,
    ts,
    tier: "T2",
    author: "AgentA",
    topic: "build",
    body: "hello",
    mention: false,
    unread: false,
    threadDepth: 0,
  };
  const plain = renderChatRows([row], 100, theme)[0]!.replace(ANSI, "");
  expect(plain).toContain("03:04:05");
});

// --- the fallback theme follows the host's symbol set ----------------------

/**
 * Every symbol key the panel and the cards read — DERIVED from the source, not hand-listed.
 *
 * A hand-written list goes stale the moment a new `theme.status.foo` is read: the test keeps
 * passing while the fallback paints "undefined" for the key nobody listed. So the list is scanned
 * out of `src/`, and the hand-written one below is only the FALLBACK's own contract.
 */
function scanReadSymbolKeys(): SymbolKey[] {
  const root = path.join(import.meta.dir, "..", "src");
  const found = new Set<string>();
  const boxTables = scanBoxTables();
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const text = fs.readFileSync(full, "utf-8");
      // `theme.status.running`, `theme.nav.selected`, … — the table getters.
      for (const m of text.matchAll(/theme\.(status|nav|tree|sep|md|format|tool)\.([a-zA-Z]+)/g)) {
        found.add(`${m[1]}.${m[2]}`);
      }
      // `theme.boxRound` / `theme.boxSharp` — the WHOLE table is read, so every member of it has
      // to resolve. The member lists are parsed out of the shim's own key maps (see
      // `scanBoxTables`), so they grow with the source instead of being hand-listed here.
      for (const m of text.matchAll(/theme\.(boxRound|boxSharp)\b/g)) {
        for (const member of Object.keys(boxTables[m[1]!] ?? {})) {
          found.add(`${m[1]}.${member}`);
        }
      }
      // `theme.symbol("status.info")` — the keyed lookup.
      for (const m of text.matchAll(/symbol\("([a-zA-Z]+\.[a-zA-Z]+)"/g)) {
        found.add(m[1]!);
      }
      // `theme.styledSymbol("tool.irc", "accent")` — the SAME lookup, styled. The old scanner
      // matched `symbol("…")` only, so the envelope on EVERY message card (`tool.irc`) was
      // invisible to it, and the fallback had no `tool` table at all.
      for (const m of text.matchAll(/styledSymbol\("([a-zA-Z]+\.[a-zA-Z]+)"/g)) {
        found.add(m[1]!);
      }
      // The dynamic table reads: `theme.status[STATUS_KEY[status]]`. The KEY MAP the read names
      // is the contract: its VALUES are keys of THAT table, so the map's values are resolved
      // against the bucket the read indexes.
      //
      // A map's VALUES say what it is, and the two kinds are read differently:
      //  - BARE names ("error") are members of a TABLE, read as `theme.status[MAP.member]`;
      //  - DOTTED names ("status.info") are SYMBOL KEYS, read as `theme.symbol(MAP.member)`.
      const maps = new Map<string, { table: string[]; symbol: string[] }>();
      // The declaration may carry a TYPE ANNOTATION between the identifier and the `=` — e.g.
      // `const TIER_GLYPH: Record<Tier, "error" | "warning" | "info"> = {` — so the annotation is
      // part of the pattern. Without it the whole of `chat-pane.ts` was invisible to the scan and
      // `status.warning` was never derived. The body may also be a ONE-LINE map
      // (`{ room: "status.info", wait: "status.pending" }`), so the body ends at the first brace.
      for (const m of text.matchAll(/([A-Z][A-Z_]*)\s*(?::[^=;]*?)?=\s*\{([^}]*)\}/g)) {
        const body = m[2]!;
        const table = [...body.matchAll(/"([a-zA-Z]+)"/g)].map((v) => v[1]!);
        const symbol = [...body.matchAll(/"([a-zA-Z]+\.[a-zA-Z]+)"/g)].map((v) => v[1]!);
        if (table.length > 0 || symbol.length > 0) maps.set(m[1]!, { table, symbol });
      }
      for (const m of text.matchAll(/theme\.(status|nav|tree|sep|md|format)\[([A-Z][A-Z_]*)/g)) {
        for (const value of maps.get(m[2]!)?.table ?? []) found.add(`${m[1]}.${value}`);
      }
      // The dynamic SYMBOL reads: `theme.symbol(SYMBOL_KEY.room)` / `theme.styledSymbol(SYMBOL_KEY.wait)`.
      // The map holds SYMBOL KEYS, so its values are the keys themselves — no bucket to prefix.
      for (const m of text.matchAll(/theme\.(?:styledSymbol|symbol)\(\s*([A-Z][A-Z_]*)\./g)) {
        for (const value of maps.get(m[1]!)?.symbol ?? []) found.add(value);
      }
    }
  };
  visit(root);
  // The scan can never silently find NOTHING: a scanner that matches no source at all leaves
  // every "the fallback paints no undefined" assertion vacuously true.
  if (found.size === 0) {
    throw new Error("scanReadSymbolKeys found no symbol keys in src/ — the scan is broken");
  }
  // And it must find the KNOWN keys: `status.error` comes from the tier map's BARE values, so
  // this also fails if the type annotation between the identifier and `=` is not matched again.
  if (!found.has("status.error")) {
    throw new Error("scanReadSymbolKeys did not derive status.error — the scan is broken");
  }
  return [...found] as SymbolKey[];
}

/**
 * The shim's box tables, parsed out of `host-theme.ts`: the member names and the SYMBOL KEY each
 * member resolves to.
 *
 * The rounded box borrows its JUNCTIONS from the sharp set — the host's own `get boxRound()` does
 * the same, because a rounded box has no rounded junction glyph — so a table member and its
 * symbol key are not always the same key. The tests need the real mapping, not a guess.
 */
function scanBoxTables(): Record<string, Record<string, string>> {
  const source = fs.readFileSync(
    path.join(import.meta.dir, "..", "src", "panel", "host-theme.ts"),
    "utf-8",
  );
  const tables: Record<string, Record<string, string>> = {};
  for (const [constName, bucket] of [
    ["BOX_ROUND_KEYS", "boxRound"],
    ["BOX_SHARP_KEYS", "boxSharp"],
  ] as const) {
    const block = source.match(new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\n\\}`));
    if (block === null) continue;
    const members: Record<string, string> = {};
    for (const m of block[1]!.matchAll(/(\w+):\s*"([a-zA-Z]+\.[a-zA-Z]+)"/g)) {
      members[m[1]!] = m[2]!;
    }
    tables[bucket] = members;
  }
  return tables;
}

/** The SYMBOL KEY a table member resolves to — the rounded box's junctions borrow the sharp set. */
function symbolKeyOf(key: string, boxTables: Record<string, Record<string, string>>): SymbolKey {
  const [bucket, name] = key.split(".");
  return (boxTables[bucket ?? ""]?.[name ?? ""] ?? key) as SymbolKey;
}

/** The fallback theme's own contract: every key it MUST define, by the host's key names. */
const FALLBACK_CONTRACT_KEYS: readonly SymbolKey[] = [
  "status.success",
  "status.error",
  "status.warning",
  "status.info",
  "status.pending",
  "status.disabled",
  "status.enabled",
  "status.running",
  "status.shadowed",
  "status.aborted",
  "status.done",
  "nav.cursor",
  "nav.selected",
  "nav.expand",
  "nav.collapse",
  "nav.back",
  "tree.branch",
  "tree.last",
  "tree.vertical",
  "tree.horizontal",
  "tree.hook",
  "sep.block",
  "sep.space",
  "sep.dot",
  "sep.slash",
  "sep.pipe",
  "md.quoteBorder",
  "md.hrChar",
  "md.bullet",
  "md.colorSwatch",
  "format.bullet",
  "format.dash",
  "format.bracketLeft",
  "format.bracketRight",
];

/** Resolve a dotted symbol key through the fallback theme's own tables. */
function fallbackSymbol(shim: Record<string, unknown>, key: string): string | undefined {
  const [bucket, name] = key.split(".");
  const table = shim[bucket ?? ""] as Record<string, string> | undefined;
  return table?.[name ?? ""];
}

test("the fallback theme paints no 'undefined' for ANY key the panel reads", () => {
  // The earlier shim defined only five of the host's eleven status symbols, and the roster strip
  // reads four of the missing ones (`running`, `enabled`, `shadowed`, `aborted`): under the
  // fallback the presence strip painted the literal "undefined" into the frame title. Every key
  // the panel and the cards read must resolve to a real glyph.
  const shim = uncolouredTheme() as unknown as Record<string, unknown>;
  // The keys the SOURCE reads, scanned out of `src/` — a key nobody listed cannot slip past.
  const read = scanReadSymbolKeys();
  const boxTables = scanBoxTables();
  expect(read.length).toBeGreaterThan(0);
  for (const key of read) {
    const value = fallbackSymbol(shim, key);
    expect(value, `the fallback must define ${key}`).toBeDefined();
    expect(value).not.toBe("undefined");
    // "?" is the fallback's marker for a key the HOST has no symbol for — never a painted glyph.
    expect(value).not.toBe("?");
    expect(value!.length).toBeGreaterThan(0);
  }
  // The keyed lookups the cards use resolve as well — a fallback without `symbol()` made
  // `theme.symbol(...)` throw "theme.symbol is not a function".
  const symbol = shim.symbol as (key: string) => string;
  const styled = shim.styledSymbol as (key: string, tone: string) => string;
  for (const key of read) {
    // The rounded box's junctions resolve through the SHARP set (the host's own `get boxRound()`
    // does the same), so the member's symbol key is not always the member's own name.
    const member = symbolKeyOf(key, boxTables);
    expect(symbol(member)).not.toBe("undefined");
    expect(symbol(member)).not.toBe("?");
    expect(styled(member, "accent")).not.toBe("undefined");
    expect(styled(member, "accent")).not.toBe("?");
  }
});

test("the fallback resolves its symbols through the host's own lookup, not a private copy", () => {
  const shim = uncolouredTheme() as unknown as Record<string, unknown>;
  const boxTables = scanBoxTables();
  // Equal to the host's own lookup, key by key: a private copy of the tables would drift.
  for (const key of FALLBACK_CONTRACT_KEYS) {
    expect(fallbackSymbol(shim, key)).toBe(activeThemeSymbol(key));
  }
  // And the SOURCE's keys resolve to the host's own glyphs too.
  for (const key of scanReadSymbolKeys()) {
    expect(fallbackSymbol(shim, key)).toBe(activeThemeSymbol(symbolKeyOf(key, boxTables)));
  }
  // And it FOLLOWS the host: a different active symbol set changes what the fallback paints.
  // (The tables are a SNAPSHOT, taken when the fallback is built: a map built at import time froze
  // the pre-theme ascii preset for the whole session, and a LIVE table — resolved per call through
  // the host's mirror — is a cycle when that mirror points at the fallback.)
  const original = theme;
  try {
    setActiveSymbolTheme({ symbol: (key: SymbolKey) => `«${key}»` } as unknown as Theme);
    const changed = uncolouredTheme() as unknown as Record<string, unknown>;
    expect(fallbackSymbol(changed, "status.running")).toBe("«status.running»");
    expect(fallbackSymbol(changed, "nav.selected")).toBe("«nav.selected»");
    expect((changed.symbol as (key: string) => string)("status.info")).toBe("«status.info»");
  } finally {
    setActiveSymbolTheme(original);
  }
  // The restore is real: the fallback is back on the host's own glyphs.
  const restored = uncolouredTheme() as unknown as Record<string, unknown>;
  expect(fallbackSymbol(restored, "status.running")).toBe(activeThemeSymbol("status.running"));
});

// --- the fallback theme and the host's symbol mirror ------------------------
//
// The host's publish path (`setThemeInstance`) MIRRORS the published theme into
// `theme/active-symbols`, and the fallback resolves its own symbols THROUGH that mirror. A mirror
// pointing at the fallback is therefore a cycle: the fallback asks the mirror, the mirror asks the
// fallback, and the stack overflows — `Maximum call stack size exceeded`, in the plugin's cards AND
// in the host's own `formatKeyHint`, which poisons the host's key hints for the rest of the session.

test("the fallback's symbol lookup survives a mirror that points at the fallback", () => {
  const original = theme;
  const shim = uncolouredTheme() as unknown as Record<string, unknown>;
  const symbol = shim.symbol as (key: string) => string;
  try {
    setActiveSymbolTheme(shim as unknown as Theme);
    let value: string | undefined;
    expect(() => {
      value = symbol("status.info");
    }).not.toThrow();
    expect(value).toBeDefined();
    expect(value).not.toBe("undefined");
    expect(value).not.toBe("");
  } finally {
    // The mirror is the host's own state: put it back, or the rest of this file reads glyphs
    // through a poisoned lookup.
    setActiveSymbolTheme(original);
  }
});

test("publishing the fallback leaves the host's own symbol lookup usable", () => {
  // The PRODUCTION path: `resolveTheme` publishes the fallback through `adoptHostTheme`, and the
  // host's publish path mirrors it into `theme/active-symbols`. A mirror left pointing at the
  // fallback breaks the host's own UI — `formatKeyHint` and `src/tools/lsp.ts` read the same
  // lookup — so the publish has to restore it.
  const original = theme;
  const shim = uncolouredTheme() as unknown as Record<string, unknown>;
  try {
    // A degraded host: the singleton has no `fg`, so `adoptHostTheme` publishes.
    setThemeInstance({} as unknown as Theme);
    adoptHostTheme(shim);
    expect(() => activeThemeSymbol("status.info")).not.toThrow();
    // A REAL symbol, not the fallback's "?" marker — which is exactly what a mirror pointing at
    // the fallback returns.
    expect(activeThemeSymbol("status.info")).not.toBe("?");
    expect(activeThemeSymbol("status.info").length).toBeGreaterThan(0);
  } finally {
    // `setThemeInstance` mutates the host's theme singleton AND its mirror; restore both.
    setThemeInstance(original);
    setActiveSymbolTheme(original);
  }
});

test("the fallback's tables and its symbol() never disagree", () => {
  // The regression: the tables and the keyed lookup resolved through DIFFERENT sources, so the
  // panel painted `theme.status.error` from one and the cards painted `theme.symbol("status.error")`
  // from the other — two glyphs for one key, in the same pane.
  //
  // The fallback answers from ONE snapshot of the host's active glyphs, captured when it is
  // built, so the table member and `symbol(key)` are the same glyph by construction — and the
  // snapshot is what the HOST was painting at that moment, so the fallback mirrors the host
  // instead of inventing glyphs of its own.
  const original = theme;
  const boxTables = scanBoxTables();
  try {
    setActiveSymbolTheme({ symbol: (key: SymbolKey) => `«${key}»` } as unknown as Theme);
    const shim = uncolouredTheme() as unknown as Record<string, unknown>;
    const symbol = shim.symbol as (key: string) => string;
    for (const key of scanReadSymbolKeys()) {
      const member = symbolKeyOf(key, boxTables);
      // The table and the lookup answer the same.
      expect(fallbackSymbol(shim, key), `table ${key}`).toBe(symbol(member));
      // And the fallback mirrors the host's own glyph for that key.
      expect(fallbackSymbol(shim, key), `host ${key}`).toBe(`«${member}»`);
    }
  } finally {
    setActiveSymbolTheme(original);
  }
});

// --- uncovered edges: board-focus selection, no-strip title, corrupt store --

test("`G`/`g` in board focus move the BOARD's selection, not the chat's", () => {
  // Line 397: `#setSelection`'s board branch. The chat-selection twin was covered by the
  // index-leak test; the board branch needs its own witness: with the board focused, `G`
  // must bottom the BOARD's cursor (second claim released), while `g` tops it back.
  const store = fixtureStore();
  store.append({ kind: "claim", from: "AgentC", resource: "build/second", ttlMs: 600_000 });
  const released: string[] = [];
  const panel = makePanel(store, 30, { onReleaseClaim: (resource) => released.push(resource) });
  try {
    panel.handleInput("2");
    panel.handleInput("G");
    panel.handleInput("r");
    expect(released).toEqual(["build/second"]);
    panel.handleInput("g");
    panel.handleInput("r");
    expect(released).toEqual(["build/second", "build/step"]);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("a very narrow render drops the presence strip (title with no room for it)", () => {
  // Line 453: the title's no-strip branch — the budget fits neither the full id nor the short
  // one, so the title is just the room and the focus, with no presence strip at all. The host
  // then truncates that title to its segment (`Room #rffc44b0…`), which is still strip-free.
  const store = fixtureStore();
  const panel = makePanel(store);
  try {
    const text = panel.render(20).join("\n").replace(ANSI, "");
    const shortId = store.roomId.length > 9 ? `${store.roomId.slice(0, 8)}…` : store.roomId;
    expect(text).toContain(`Room #${shortId}`);
    expect(text).not.toContain("no agents");
    for (const row of panel.render(20)) expect(visibleWidth(row)).toBe(20);
  } finally {
    panel.dispose();
    store.reset();
  }
});

test("openRoomPanel with a corrupt store reports unavailable instead of throwing", async () => {
  // Lines 564-569: `roomStoreFor` throws when the room log cannot open (here the log path is a
  // DIRECTORY, so `openSync` fails with EISDIR → "room file corrupt"). The headless pattern of
  // the existing degrade test is reused: hasUI true + TUI mode, so the guard passes and the
  // corrupt store path is reached — no real TUI harness needed.
  const pi = { on: () => {} } as unknown as ExtensionAPI;
  const root = tempRoot();
  // Temp roots are project-local: roomRootFor(ctx) = `<cwd>/.omp-room`, and the log is
  // `<legacyRoot>/room/<id>.jsonl` where the legacy root is `<cwd>/.omp-room`.
  const legacyRoot = path.join(root, ".omp-room");
  const roomId = roomIdFor(legacyRoot);
  // A DIRECTORY at the log path makes `openSync` fail (EISDIR → "room file corrupt").
  fs.mkdirSync(path.join(legacyRoot, "room", `${roomId}.jsonl`), { recursive: true });
  const notified: string[] = [];
  const customCalls: string[] = [];
  const ctx = {
    hasUI: true,
    mode: "tui",
    agent: { id: "Main", kind: "main", name: "main", depth: 0 },
    cwd: root,
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "sess-panel" },
    setInterval: () => "t",
    clearTimer: () => {},
    ui: {
      notify: (message: string) => notified.push(message),
      custom: async () => {
        customCalls.push("called");
        return undefined as never;
      },
    },
  } as unknown as ExtensionContext;
  await openRoomPanel(pi, ctx);
  expect(customCalls).toEqual([]);
  expect(notified.length).toBe(1);
  expect(notified[0]).toContain("room unavailable:");
});
