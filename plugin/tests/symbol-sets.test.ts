/**
 * The plugin paints the USER's glyphs, not its own.
 *
 * The host ships three symbol sets (`pi-tui/src/theme/symbols.ts`: `unicode`, `nerd`, `ascii`) and
 * the active theme publishes the one the user chose; `theme.symbol(key)` resolves it. The plugin
 * reads every glyph it paints from that theme — the cards' icons, the panel's tier badge, the
 * board's cursor and resource arrow — and its fallback theme mirrors the host's own set.
 *
 * Until now the suite only ever ran under the unicode preset, so a regression that only shows
 * under ascii (the widest, most multi-cell set) would have shipped green. This file switches the
 * host's ACTIVE symbol set with the host's own `setSymbolPreset` and asserts that the plugin's
 * rendering follows it — against the HOST's values, never against a literal glyph, so the next
 * symbol set the host adds is covered by the same assertions.
 *
 * The switch is process-global (`setSymbolPreset` recreates the host's `Theme` and republishes it
 * through `setActiveSymbolTheme`), so this file restores the previous theme AND the previous preset
 * override in `afterAll`.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import {
  ensureThemeSync,
  getSymbolPresetOverride,
  initThemeSync,
  type SymbolKey,
  type SymbolPreset,
  setSymbolPreset,
  setThemeInstance,
  type Theme,
  theme,
  truncateToWidth,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { renderMessageCard } from "../src/cards/message-cards";
import { renderRoomCall, renderWaitCall } from "../src/cards/tool-cards";
import { type BoardRow, boardColumns, projectClaims } from "../src/panel/board-pane";
import { type ChatRow, renderChatRows } from "../src/panel/chat-pane";
import { uncolouredTheme } from "../src/panel/host-theme";
import type { RoomRecord } from "../src/store/schema";

// --- fixtures -------------------------------------------------------------

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI needs ESC
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * The host's own TRUNCATION marker — derived from the host's own truncation, never a literal: the
 * host paints this where a cell had to be cut, so a cursor cell that shows it was truncated.
 */
const HOST_ELLIPSIS = truncateToWidth("abcdefgh", 3).slice(-1);

/** A regex-safe literal for a theme glyph ("[!!]" is a character class, "->" a quantifier). */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The rendered rows, ANSI-free. */
function plain(rows: readonly string[]): string[] {
  return rows.map((row) => row.replace(ANSI, ""));
}

/** One chat row of the given tier. */
function chatRow(tier: ChatRow["tier"]): ChatRow {
  return {
    seq: 1,
    ts: 1_000_000,
    tier,
    author: "AgentA",
    topic: "build",
    body: "hi",
    mention: false,
    unread: false,
    threadDepth: 0,
  };
}

/** One board row, waiting on a dependency (so the resource arrow is painted). */
function boardRow(now: number): BoardRow {
  return {
    resource: "build/parser",
    holder: "AgentA",
    ttlMs: 60_000,
    expiresAt: now + 60_000,
    acquiredAt: now,
    waiting: [],
    dependsOn: ["build/schema"],
    state: "held",
  };
}

const MESSAGE_RECORD: RoomRecord = {
  v: 1,
  seq: 1,
  ts: 1_000_000,
  kind: "msg",
  id: "m1",
  from: "agent-1",
  topic: "build",
  body: "hi",
};

const MESSAGE = {
  role: "custom",
  customType: "room:message",
  content: "hi",
  display: true,
  details: MESSAGE_RECORD,
  timestamp: 1_000_000,
} as unknown as Parameters<typeof renderMessageCard>[0];

/**
 * The host's OWN values for the ACTIVE symbol set.
 *
 * Every assertion below is made against these, never against a glyph literal: the set is the
 * user's choice, and a literal would make this file fail for the next set the host adds.
 */
interface HostGlyphs {
  theme: Theme;
  info: string;
  pending: string;
  error: string;
  warning: string;
  irc: string;
  selected: string;
  back: string;
}

/** Switch the host's active symbol set and read the host's own values for it. */
async function hostGlyphs(preset: SymbolPreset): Promise<HostGlyphs> {
  await setSymbolPreset(preset);
  const active = theme;
  return {
    theme: active,
    info: active.symbol("status.info"),
    pending: active.symbol("status.pending"),
    error: active.symbol("status.error"),
    warning: active.symbol("status.warning"),
    irc: active.symbol("tool.irc"),
    selected: active.nav.selected,
    back: active.nav.back,
  };
}

// --- the state to restore -------------------------------------------------

let originalTheme: Theme;
let originalOverride: SymbolPreset | undefined;

beforeAll(() => {
  // The host's own way to fill the pi-tui singleton with a REAL theme. `setSymbolPreset` reloads
  // the theme BY NAME, so the name has to exist.
  ensureThemeSync();
  originalTheme = theme;
  originalOverride = getSymbolPresetOverride();
});

afterAll(async () => {
  // `setSymbolPreset` mutates TWO process-global things: the host's theme singleton (recreated
  // and republished through `setActiveSymbolTheme`) and the preset override the next theme load
  // reads. Both are restored here, so the files that run after this one see the theme they
  // expect.
  if (originalOverride !== undefined) {
    await setSymbolPreset(originalOverride);
  } else {
    // No override: `initThemeSync` is the host's own way to clear it (it configures the theme with
    // no preset), and it republishes a theme with the default set.
    initThemeSync();
  }
  // The ORIGINAL instance, not the rebuilt one: a file that captured a glyph off the theme
  // singleton sees exactly what it saw before.
  setThemeInstance(originalTheme);

  // The restore is ASSERTED, not assumed: the singleton is the original instance again, and the
  // preset override is back to what it was (no override, or the one that was there).
  expect(theme).toBe(originalTheme);
  expect(theme.getSymbolPreset()).toBe(originalTheme.getSymbolPreset());
  expect(getSymbolPresetOverride()).toBe(originalOverride);
});

// --- 1. the cards follow the host's set -----------------------------------

test("the tool cards' icons follow the host's active symbol set", async () => {
  const unicode = await hostGlyphs("unicode");
  const ascii = await hostGlyphs("ascii");

  // The room card's icon is the host's `status.info`; the wait card's is `status.pending`.
  const options = {} as ToolRenderResultOptions;
  const room = plain(renderRoomCall({ op: "join" }, options, ascii.theme).render(80));
  const wait = plain(renderWaitCall({ timeout: 1000 }, options, ascii.theme).render(80));
  expect(room[0]).toStartWith(`${ascii.info} Room`);
  expect(wait[0]).toStartWith(`${ascii.pending} Wait`);

  // And they are the ASCII set's glyphs, not the unicode set's: the plugin follows the HOST's
  // choice, it does not carry its own.
  expect(ascii.info).not.toBe(unicode.info);
  expect(ascii.pending).not.toBe(unicode.pending);
  expect(room[0]).not.toContain(unicode.info);
  expect(wait[0]).not.toContain(unicode.pending);
});

test("the message card's envelope follows the host's active symbol set", async () => {
  const unicode = await hostGlyphs("unicode");
  const ascii = await hostGlyphs("ascii");

  const rows = plain(renderMessageCard(MESSAGE, { expanded: false }, ascii.theme).render(120));
  expect(rows[0]).toContain(`${ascii.irc} room`);
  expect(ascii.irc).not.toBe(unicode.irc);
  expect(rows[0]).not.toContain(unicode.irc);
});

// --- 2. the panel follows the host's set ----------------------------------

test("the chat row's tier badge is the host's own status glyph", async () => {
  const unicode = await hostGlyphs("unicode");
  const ascii = await hostGlyphs("ascii");

  // The badge sits directly in front of the row's clock, so the assertion is about the badge
  // ITSELF: an ascii `[!!]` CONTAINS an ascii `[!]`, so a containment check alone cannot tell the
  // two tiers apart.
  const t0 = plain(renderChatRows([chatRow("T0")], 80, ascii.theme))[0]!;
  const t1 = plain(renderChatRows([chatRow("T1")], 80, ascii.theme))[0]!;
  const t2 = plain(renderChatRows([chatRow("T2")], 80, ascii.theme))[0]!;

  expect(t0).toMatch(new RegExp(`${escapeRegExp(ascii.error)} \\d{2}:\\d{2}:\\d{2}`));
  expect(t1).toMatch(new RegExp(`${escapeRegExp(ascii.warning)} \\d{2}:\\d{2}:\\d{2}`));
  expect(t2).toMatch(new RegExp(`${escapeRegExp(ascii.info)} \\d{2}:\\d{2}:\\d{2}`));

  // The same row under the unicode set carries the unicode glyph — the badge is the theme's, not
  // a literal that happens to look right under one preset.
  const u0 = plain(renderChatRows([chatRow("T0")], 80, unicode.theme))[0]!;
  expect(u0).toMatch(new RegExp(`${escapeRegExp(unicode.error)} \\d{2}:\\d{2}:\\d{2}`));
  expect(u0).not.toMatch(new RegExp(`${escapeRegExp(ascii.error)} \\d{2}:\\d{2}:\\d{2}`));
});

test("the board's cursor is the host's own glyph, and is not truncated to an ellipsis", async () => {
  const ascii = await hostGlyphs("ascii");
  const now = Date.now();

  // The ascii set's cursor is TWO cells wide ("->"). A one-cell cursor column made the host cut
  // it to its own ellipsis, so the cursor became indistinguishable from a chopped cell.
  expect(visibleWidth(ascii.selected)).toBeGreaterThan(1);
  expect(boardColumns(ascii.theme)[0]!.width).toBe(visibleWidth(ascii.selected));
  expect(boardColumns(ascii.theme)[0]!.minWidth).toBe(visibleWidth(ascii.selected));

  const row = plain(projectClaims([boardRow(now)], 120, ascii.theme, now, 0))[0]!;
  expect(row).toStartWith(ascii.selected);
  expect(row).not.toContain(HOST_ELLIPSIS);
  expect(visibleWidth(row)).toBe(120);
});

test("the board's resource arrow is the host's own glyph", async () => {
  const unicode = await hostGlyphs("unicode");
  const ascii = await hostGlyphs("ascii");
  const now = Date.now();

  const row = plain(projectClaims([boardRow(now)], 120, ascii.theme, now, 0))[0]!;
  expect(row).toContain(`build/parser ${ascii.back} build/schema`);
  expect(ascii.back).not.toBe(unicode.back);
  expect(row).not.toContain(unicode.back);
});

// --- 3. the fallback theme agrees with the host ---------------------------

test("the fallback theme's tables and symbol() equal the host's values for the active set", async () => {
  const ascii = await hostGlyphs("ascii");
  // The fallback is built NOW, so its snapshot is the ascii set's.
  const fallback = uncolouredTheme() as unknown as {
    symbol: (key: string) => string;
    getSymbolPreset: () => string;
    status: Record<string, string>;
    nav: Record<string, string>;
    tree: Record<string, string>;
    sep: Record<string, string>;
    md: Record<string, string>;
    format: Record<string, string>;
    tool: Record<string, string>;
    boxRound: Record<string, string>;
    boxSharp: Record<string, string>;
  };

  // The rounded box's JUNCTIONS borrow the sharp set — the host's own `get boxRound()` does the
  // same, because a rounded box has no rounded junction glyph.
  const junctions = ["cross", "teeDown", "teeUp", "teeRight", "teeLeft"];
  const tables = [
    "status",
    "nav",
    "tree",
    "sep",
    "md",
    "format",
    "tool",
    "boxRound",
    "boxSharp",
  ] as const;

  for (const bucket of tables) {
    for (const member of Object.keys(fallback[bucket])) {
      const key = (
        bucket === "boxRound" && junctions.includes(member)
          ? `boxSharp.${member}`
          : `${bucket}.${member}`
      ) as SymbolKey;
      const hostGlyph = ascii.theme.symbol(key);
      expect(hostGlyph, `${key} is not a host symbol`).toBeDefined();
      expect(fallback[bucket][member], `${key}`).toBe(hostGlyph);
      expect(fallback.symbol(key), `${key}`).toBe(hostGlyph);
    }
  }

  // And the fallback agrees with the host's LOOKUP too, not only with its tables.
  expect(fallback.symbol("status.info")).toBe(ascii.theme.symbol("status.info"));
  expect(fallback.symbol("tool.irc")).toBe(ascii.theme.symbol("tool.irc"));
  expect(fallback.symbol("nav.selected")).toBe(ascii.theme.symbol("nav.selected"));

  // And the preset it REPORTS is the one its glyphs came from: the fallback's snapshot and its
  // `getSymbolPreset()` are one fact. A live lookup made the fallback name a set its own glyphs
  // did not come from — the host switched set, the tables still carried the old set's glyphs, and
  // the fallback (whose preset the host's theme-change listener reads) named the new one.
  expect(fallback.getSymbolPreset()).toBe("ascii");
});

// --- 4. the width budgets hold under every set ----------------------------

test("the panel's rows are exactly `width` cells under the nerd set's private-use glyphs", async () => {
  const nerd = await hostGlyphs("nerd");
  const now = Date.now();

  for (const row of renderChatRows([chatRow("T0")], 60, nerd.theme, 0)) {
    expect(visibleWidth(row)).toBe(60);
  }
  for (const row of projectClaims([boardRow(now)], 100, nerd.theme, now, 0)) {
    expect(visibleWidth(row)).toBe(100);
  }

  // The cursor column is still as wide as the cursor glyph, whatever that glyph is.
  expect(boardColumns(nerd.theme)[0]!.width).toBe(visibleWidth(nerd.selected));
});
