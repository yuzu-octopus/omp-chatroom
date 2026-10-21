/**
 * The board's COUNTDOWN column: the number on screen has to be the number that is true.
 *
 * The board pane is 40–55 cells wide in practice — the panel gives the board 48 % of an 88–120
 * column terminal (`panel.ts`: `PANEL_LEFT_RATIO = 0.52`, `PANEL_SPLIT_AT = 88`) — while the
 * table's natural width is ~65 cells. The table is therefore ALWAYS narrower than the pane, the
 * host's `fitWidths` (`pi-tui/src/components/table.ts`) ALWAYS shrinks a column, and the countdown
 * — the first column to shrink (priority 0) — therefore ALWAYS sits at its floor.
 *
 * That makes the floor a NUMBER, not a nicety. The default lease is 300 s
 * (`store/config.ts`: `claimTtlMs: 300_000`), "300s" is four cells, and a floor of three renders
 * it as the host's own ellipsis — "30…" — so the default lease reads about ten times too small:
 * the user sees 30 s where there are 300, and a claim that is about to expire looks like one with
 * plenty of time left.
 *
 * The floor is four, and the ascii set's extra cells (the cursor is two cells wide, the arrow is
 * two) come out of the RESOURCE column, which is truncated to its floor at these widths anyway.
 * The holder's floor (10) is what keeps the waiter COUNT on screen and the state's floor (8) is
 * the word "released", so neither can be spent on the countdown.
 *
 * The assertions are made against the host's OWN truncation (`truncateToWidth`), never against a
 * literal ellipsis character: the host paints that where a cell had to be cut, and a literal would
 * make this file fail for the next host that changes its marker.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  ensureThemeSync,
  getSymbolPresetOverride,
  initThemeSync,
  type SymbolPreset,
  setSymbolPreset,
  setThemeInstance,
  type Theme,
  theme,
  truncateToWidth,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { type BoardRow, projectClaims } from "../src/panel/board-pane";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI needs ESC
const ANSI = /\x1b\[[0-9;]*m/g;

/** The rendered rows, ANSI-free. */
function plain(rows: readonly string[]): string[] {
  return rows.map((row) => row.replace(ANSI, ""));
}

/**
 * The board's REAL widths: the panel gives the board 48 % of an 88–120 column terminal, and the
 * board's own frame takes a cell or two of that.
 */
const BOARD_WIDTHS: readonly number[] = [40, 45, 50, 55];

/** The default lease — `store/config.ts`: `claimTtlMs: 300_000`. */
const DEFAULT_LEASE_MS = 300_000;

/**
 * The host's own truncation of the countdown at a three-cell floor: "300s" cut to three cells.
 *
 * Derived from the host's own `truncateToWidth`, so this file does not hardcode the marker the
 * host paints.
 */
const TRUNCATED_LEASE = truncateToWidth("300s", 3);

/** One HELD claim with the default lease and no waiters. */
function leasedRow(now: number): BoardRow {
  return {
    resource: "build/parser",
    holder: "AgentA",
    ttlMs: DEFAULT_LEASE_MS,
    expiresAt: now + DEFAULT_LEASE_MS,
    acquiredAt: now,
    waiting: [],
    dependsOn: [],
    state: "held",
  };
}

// --- the state to restore -------------------------------------------------

let originalTheme: Theme;
let originalOverride: SymbolPreset | undefined;

beforeAll(() => {
  // The host's own way to fill the pi-tui singleton with a REAL theme.
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
    initThemeSync();
  }
  setThemeInstance(originalTheme);
  expect(theme).toBe(originalTheme);
  expect(getSymbolPresetOverride()).toBe(originalOverride);
});

// --- the countdown ---------------------------------------------------------

test("a 300 s lease reads as 300 s at every real board width", async () => {
  const now = Date.now();
  // The ascii set is the WIDEST one (the cursor is "->" and the arrow is "<-"), so it is the case
  // where the board is tightest and the countdown is squeezed hardest.
  await setSymbolPreset("ascii");
  const ascii = theme;

  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now)], width, ascii, now, 0))[0]!;
    expect(visibleWidth(row), `the row is not ${width} cells wide`).toBe(width);
    // The lease, whole.
    expect(row, `the lease is not readable at ${width} cells`).toContain("300s");
    // And NOT the host's own cut of it — the failure this file exists for.
    expect(row, `the lease is truncated at ${width} cells`).not.toContain(TRUNCATED_LEASE);
    // The state word is never chopped, and the row is not cut short.
    expect(row).toContain("held");
  }
});

test("the lease reads whole under the unicode set too", async () => {
  const now = Date.now();
  await setSymbolPreset("unicode");
  const unicode = theme;

  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now)], width, unicode, now, 0))[0]!;
    expect(visibleWidth(row), `the row is not ${width} cells wide`).toBe(width);
    expect(row, `the lease is not readable at ${width} cells`).toContain("300s");
    expect(row, `the lease is truncated at ${width} cells`).not.toContain(TRUNCATED_LEASE);
  }
});

test("a short lease is not padded into a longer one", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // "12s" is three cells and the column is four: the host PADS the cell (right-aligned), so the
  // countdown reads " 12s" — the number is still the number.
  const row = plain(
    projectClaims(
      [{ ...leasedRow(now), ttlMs: 12_000, expiresAt: now + 12_000 }],
      55,
      ascii,
      now,
      0,
    ),
  )[0]!;
  expect(row).toContain("12s");
  expect(row).not.toContain("012s");
});
