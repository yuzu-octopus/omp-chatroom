/**
 * The board's COUNTDOWN and HOLDER columns: the numbers on screen have to be the numbers that are
 * true, and the waiter count has to survive the pane's real width.
 *
 * The board pane is 40–55 cells wide in practice — the panel gives the board 48 % of an 88–120
 * column terminal (`panel.ts`: `PANEL_LEFT_RATIO = 0.52`, `PANEL_SPLIT_AT = 88`) — while the
 * table's natural width is ~62 cells. The table is therefore ALWAYS narrower than the pane, the
 * host's `fitWidths` (`pi-tui/src/components/table.ts`) ALWAYS shrinks a column, and the countdown
 * and holder columns therefore sit at their floors.
 *
 * That makes each floor a NUMBER, not a nicety:
 *
 *  - The countdown is formatted with the host's own `formatDuration`
 *    (`@oh-my-pi/pi-utils`; the host's wait card uses it for a remaining lease,
 *    `pi-tui/src/tools/task.ts:817`). A lease is capped at one day (`CLAIM_TTL_MAX_MS`,
 *    `tools/room.ts:182`), so the widest string the formatter emits is "23h59m" (or "59m59s") —
 *    six cells, which is the floor. The old raw-seconds form in a four-cell floor rendered 1800 s
 *    as "180…" and 86400 s as "8640…": a long lease read about ten times too small.
 *  - The holder cell leads with the waiter COUNT ("+2 AdverseLo…"), so the host's tail truncation
 *    cannot take it. The old trailing form ("AdverseLocust +2 waiting") lost the "+2" at the
 *    ten-cell floor, and who is waiting is the board's whole point.
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

/** The lease cap — `CLAIM_TTL_MAX_MS`, `tools/room.ts:182` / `commands/room-command.ts:47`. */
const MAX_LEASE_MS = 86_400_000;

/** One HELD claim with the given lease and no waiters. */
function leasedRow(now: number, ttlMs = DEFAULT_LEASE_MS): BoardRow {
  return {
    resource: "build/parser",
    holder: "AgentA",
    ttlMs,
    expiresAt: now + ttlMs,
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

test("a 300 s lease reads as 5m at every real board width", async () => {
  const now = Date.now();
  // The ascii set is the WIDEST one (the cursor is "->" and the arrow is "<-"), so it is the case
  // where the board is tightest and the countdown is squeezed hardest.
  await setSymbolPreset("ascii");
  const ascii = theme;

  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now)], width, ascii, now, 0))[0]!;
    expect(visibleWidth(row), `the row is not ${width} cells wide`).toBe(width);
    // The lease, as the host's own duration formatter writes it.
    expect(row, `the lease is not readable at ${width} cells`).toContain("5m");
    // And NOT the old raw-seconds form.
    expect(row, `the lease is still raw seconds at ${width} cells`).not.toContain("300");
    // The state word is never chopped, and the row is not cut short.
    expect(row).toContain("held");
  }
});

test("the lease reads as the host formatter writes it under the unicode set too", async () => {
  const now = Date.now();
  await setSymbolPreset("unicode");
  const unicode = theme;

  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now)], width, unicode, now, 0))[0]!;
    expect(visibleWidth(row), `the row is not ${width} cells wide`).toBe(width);
    expect(row, `the lease is not readable at ${width} cells`).toContain("5m");
    expect(row, `the lease is still raw seconds at ${width} cells`).not.toContain("300");
  }
});

test("a 1800 s lease reads 30m, never the smaller-looking 180", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // 1800 s in the old raw-seconds cell was "1800s" cut to a four-cell floor: "180…" — a reader saw
  // 180 s where the lease had 1800. `formatDuration(1_800_000)` is "30m".
  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now, 1_800_000)], width, ascii, now, 0))[0]!;
    expect(visibleWidth(row)).toBe(width);
    expect(row, `the lease is not 30m at ${width} cells`).toContain("30m");
    expect(row, `the lease still looks ten times smaller at ${width} cells`).not.toContain("180");
  }
});

test("a 86400 s lease reads 1d, never 8640…", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // The lease cap is one day; `formatDuration(86_400_000)` is "1d". The raw-seconds cell rendered
  // it as "8640…" (four-cell floor) — a reader saw ten days short of the truth.
  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now, MAX_LEASE_MS)], width, ascii, now, 0))[0]!;
    expect(visibleWidth(row)).toBe(width);
    expect(row, `the lease is not 1d at ${width} cells`).toContain("1d");
    expect(row, `the lease still reads as raw seconds at ${width} cells`).not.toContain("8640");
  }
});

test("the widest string the formatter emits for a lease survives the floor", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // One day is the lease cap, so 86 399 s remaining — "23h59m" — is the widest countdown the board
  // can show, and six cells is what the floor must guarantee. A four-cell floor cut it to the
  // host's own ellipsis.
  const widest = "23h59m";
  const cut = truncateToWidth(widest, 4);
  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims([leasedRow(now, MAX_LEASE_MS)], width, ascii, now + 1_000))[0]!;
    expect(visibleWidth(row)).toBe(width);
    expect(row, `the widest countdown is cut at ${width} cells`).toContain(widest);
    expect(row).not.toContain(cut);
  }
});

test("a short lease is not padded into a longer one", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // `formatDuration(12_000)` is "12.0s", five cells in a six-cell column: the host PADS the cell
  // (right-aligned), so the countdown reads " 12.0s" — the number is still the number.
  const row = plain(
    projectClaims(
      [{ ...leasedRow(now), ttlMs: 12_000, expiresAt: now + 12_000 }],
      55,
      ascii,
      now,
      0,
    ),
  )[0]!;
  expect(row).toContain("12.0s");
  expect(row).not.toContain("012.0s");
});

// --- the holder cell -------------------------------------------------------

test("a long holder id never eats the waiter count", async () => {
  const now = Date.now();
  await setSymbolPreset("ascii");
  const ascii = theme;

  // A real agent id, and the holder column at its floor at every width here. The old cell put the
  // count last ("AdverseLocust +2 waiting"), so the tail truncation left "AdverseLo…" and the
  // board lost the one thing it exists to say: who is waiting. The count leads now.
  const rows: BoardRow[] = [
    {
      ...leasedRow(now),
      holder: "AdverseLocust",
      waiting: ["AgentB", "AgentC"],
    },
  ];
  for (const width of BOARD_WIDTHS) {
    const row = plain(projectClaims(rows, width, ascii, now, 0))[0]!;
    expect(visibleWidth(row), `the row is not ${width} cells wide`).toBe(width);
    expect(row, `the waiter count is gone at ${width} cells`).toContain("+2");
    // The state word still survives the wider countdown and the longer holder.
    expect(row).toContain("held");
  }
});
