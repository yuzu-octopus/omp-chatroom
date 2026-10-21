import {
  getMenuWindow,
  type LayoutRenderer,
  renderTableRow,
  type TableCell,
  type TableColumn,
  type Theme,
  visibleWidth,
} from "@oh-my-pi/pi-tui";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { ClaimRow } from "../store/schema";
import { fitWidth } from "./chrome";

export type BoardRow = ClaimRow & { state: "held" | "expired" | "released" }; // [invented] — §6.4 dimming

/**
 * The resource cell's natural width, measured for a ONE-cell arrow: "build/parser ⟵ build/schema"
 * is 27 cells, 30 with the "+N" count of the dependencies that did not fit.
 *
 * The arrow is the theme's own `nav.back`, so the cell's real width follows the user's symbol set
 * (the ascii set paints "<-", two cells) — see `boardColumns`.
 */
const RESOURCE_WIDTH = 30;

/**
 * The holder cell's natural width: "AgentA +2 waiting" is 17 cells.
 */
const HOLDER_WIDTH = 17;

/**
 * The holder cell's FLOOR: ten cells — the shortest holder plus its waiter count AND the host's
 * ellipsis ("AgentA +2…"). The count is the part a reader acts on, and it sits at the END of the
 * cell, so the floor is what keeps it from being cut away with the word "waiting".
 */
const HOLDER_FLOOR = 10;

/**
 * The countdown cell's FLOOR: FOUR cells — "300s" is four, and 300 s is the DEFAULT lease
 * (`store/config.ts`: `claimTtlMs: 300_000`).
 *
 * The floor is not a nicety: the board pane is 40–55 cells wide in practice (the panel gives the
 * board 48 % of an 88–120 column terminal), while the table's natural width is ~65 — so the table
 * is ALWAYS narrower than the pane, the host's `fitWidths` ALWAYS shrinks the countdown, and the
 * countdown therefore ALWAYS sits at its floor. A floor of three renders the default lease as
 * "30…" — the host's own ellipsis — which reads about ten times too small: the user sees a 300 s
 * lease as 30 s and a claim about to expire as one with plenty of time left.
 *
 * The urgency is ALSO in the tone (warning under 25 % remaining, error once expired), so the tone
 * is not the number: the tone says "hurry", the number says how long is left, and a lease that
 * reads "30…" says the wrong thing about both.
 *
 * Where the ascii set's extra cells come from: the cursor column is two cells wide under ascii
 * ("->" against "➤") and the resource arrow is two cells wide too ("<-" against "⟵"). The arrow's
 * extra cell is already paid for — the resource column's natural width scales with it
 * (`RESOURCE_WIDTH + max(0, visibleWidth(theme.nav.back) - 1)`) — and the cursor's extra cell is
 * paid for by the RESOURCE column, which is the last content column to shrink (priority 3) and is
 * already being cut at these widths: at 55 cells the ascii board gives the dependency 27 of the 28
 * it needs ("build/parser <- build/schema"), the unicode board 28 of 27. So the ascii board is
 * ONE cell tighter in the resource cell than the unicode one, and the countdown keeps the digit
 * that says how long the lease has left. The holder's floor (10) is not available: it is what
 * keeps the waiter COUNT ("AgentA +2…") on screen. The state's floor (8) is not available either:
 * "released" is eight cells.
 */
const COUNTDOWN_FLOOR = 4;

/**
 * §6.4 — `cursor · resource · holder · TTL · state`, for a THEME: the widths follow the GLYPHS the
 * theme paints.
 *
 * The host's table model (`pi-tui/src/components/table.ts`, `fitWidths`) treats a declared `width`
 * as the column's DESIRED width and shrinks columns in `priority` order — lowest priority number
 * first — down to `minWidth`, never growing them. The old widths (36/18/7/6) described a 70-cell
 * table that the board pane never has: the panel gives the board 31–43 cells at 88–120 columns, so
 * EVERY column was shrunk on EVERY frame and the R9 dependency — the newest thing on the board —
 * was truncated to a stub.
 *
 * The widths below are the CONTENT's natural widths, the way the host's own process table computes
 * them (`pi-tui/src/apps/ps-top.ts`, `#renderTable`: a column is as wide as its widest cell). The
 * priorities then say what is sacrificed first when the pane is narrower than the content.
 *
 * The selection cursor gets its OWN column. The host's `alignCell` styles a whole cell (and pads
 * it), so a marker inside the resource cell would share the resource's tone — a dimmed marker on
 * a released row — and would silently eat one cell of the resource's declared width.
 *
 * Its WIDTH cannot be a constant: the cursor glyph is the theme's own `nav.selected`, and the
 * user's symbol set decides how wide that is (unicode "▸" is one cell, ascii "->" is two). A
 * fixed one-cell column made the host truncate the ascii marker to its own ellipsis ("…"), so the
 * cursor became indistinguishable from a chopped cell. The column is therefore as wide as the
 * glyph, measured in cells with the host's own `visibleWidth`.
 *
 * The RESOURCE column follows the theme's arrow for the same reason: the dependency is written
 * with the theme's `nav.back`, and in the ascii set that arrow is a cell wider, so a fixed width
 * cut the "+N" count of the extra dependencies off the end.
 */
export function boardColumns(theme: Theme): readonly TableColumn[] {
  const cursorWidth = Math.max(1, visibleWidth(theme.nav.selected));
  // The arrow's extra cells are the resource cell's extra cells: the content grew by exactly that
  // much, and a narrower resource column would push the "+N" count off the end.
  const resourceWidth = RESOURCE_WIDTH + Math.max(0, visibleWidth(theme.nav.back) - 1);
  return [
    { width: cursorWidth, minWidth: cursorWidth, align: "left", overflow: "truncate", priority: 4 },
    // The resource cell carries the resource AND what it waits on (R9). It shrinks LAST of the
    // content columns (priority 3): the dependency is the first thing a reader looks for, and it
    // is the newest thing on the board.
    { width: resourceWidth, minWidth: 12, align: "left", overflow: "truncate", priority: 3 },
    // The holder cell carries the holder AND the waiters. Its floor keeps the COUNT.
    {
      width: HOLDER_WIDTH,
      minWidth: HOLDER_FLOOR,
      align: "left",
      overflow: "truncate",
      priority: 1,
    },
    // The countdown goes first (priority 0) — but it stops at four cells, which is where "300s"
    // still fits. Below that the TONE carries the urgency (warning under 25% remaining, error
    // once expired), and the number would be a lie rather than a loss.
    { width: 5, minWidth: COUNTDOWN_FLOOR, align: "right", overflow: "truncate", priority: 0 },
    // The state word is never chopped: "expired" is 7 cells, "released" is 8.
    { width: 8, minWidth: 8, align: "left", overflow: "truncate", priority: 2 },
  ];
}

/** §6.4 — "expired/released rows move to the bottom dimmed rather than vanishing mid-frame". */
const STATE_RANK: Record<BoardRow["state"], number> = { held: 0, expired: 1, released: 2 };

const STATE_TONE: Record<BoardRow["state"], "success" | "warning" | "muted"> = {
  held: "success",
  expired: "warning",
  released: "muted",
};

function ttlCell(
  row: BoardRow,
  now: number,
  theme: Theme,
): { text: string; tone: "muted" | "warning" | "error" } {
  // The "no countdown" placeholder is the theme's own dash (`format.dash`), not a hardcoded em
  // dash: on an ASCII terminal the em dash is a glyph the user's symbol set does not carry.
  // An ended claim has no countdown. The STATE column already says "expired"/"released", and
  // repeating the word here spent seven cells of the narrowest column on a second copy — which
  // the row then truncated to "expi…".
  if (row.state !== "held") return { text: theme.format.dash, tone: "muted" };
  const leftMs = row.expiresAt - now;
  if (leftMs <= 0) return { text: theme.format.dash, tone: "error" };
  const remaining = leftMs / Math.max(1, row.ttlMs);
  return {
    text: `${Math.max(1, Math.round(leftMs / 1000))}s`,
    tone: remaining < 0.25 ? "warning" : "muted", // §6.4 — escalate under 25% remaining
  };
}

function holderText(row: BoardRow): string {
  return row.waiting.length > 0 ? `${row.holder} +${row.waiting.length} waiting` : row.holder;
}

/**
 * R9 — what the claim is waiting on, in the resource cell: `build/parser ⟵ build/schema`.
 *
 * The arrow is the theme's own `nav.back` (the card uses it for "room ⟵"), not a hardcoded glyph.
 * Only the first dependency fits the column; the rest are counted. The whole cell is 27 cells, 30
 * with the "+N" count, which is why the resource column declares a 30-cell natural width.
 */
function resourceText(row: BoardRow, theme: Theme): string {
  const name = sanitizeText(row.resource);
  if (row.dependsOn.length === 0) return name;
  const first = sanitizeText(row.dependsOn[0]!);
  const more = row.dependsOn.length > 1 ? ` +${row.dependsOn.length - 1}` : "";
  return `${name} ${theme.nav.back} ${first}${more}`;
}

/**
 * §6.4 — the display order: `held` first, finished rows last.
 *
 * Exported because the panel's ACTIONS must address the row the user SEES. The panel used to
 * index the unsorted projection, so `r` could release a different claim than the highlighted one.
 */
export function sortBoardRows(rows: readonly BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);
}

/**
 * §6.4 — the pure projection: claim rows → exactly `width`-cell strings, one per row, `held` first
 * and finished rows last. No TUI required.
 *
 * `selected` marks the row the panel's actions will act on (the visible cursor).
 */
export function projectClaims(
  rows: readonly BoardRow[],
  width: number,
  theme: Theme,
  now = Date.now(),
  selected = -1,
): string[] {
  if (rows.length === 0) return [fitWidth(theme.fg("dim", "no claims"), width)];
  const ordered = sortBoardRows(rows);
  // The columns are computed ONCE per projection: the cursor column's width depends on the
  // theme's glyph, and rebuilding the array per row would cost an allocation per claim per frame.
  const columns = boardColumns(theme);
  const out: string[] = [];
  for (const [index, row] of ordered.entries()) {
    const dim = row.state !== "held";
    const ttl = ttlCell(row, now, theme);
    const marked = index === selected;
    const cells: TableCell[] = [
      {
        // The cursor marker: the row `r`/`o` will act on is the row the user can see. The glyph is
        // the THEME's own "selected" symbol (nav.selected) — the house rule is that every row
        // element comes from the theme, and the plugin's fallback theme defines nav.selected. It
        // has its own column so its accent tone is not overwritten by the row's dimming.
        text: marked ? theme.nav.selected : "",
        style: (text) => theme.fg("accent", text),
      },
      {
        text: resourceText(row, theme),
        style: dim ? (text) => theme.fg("muted", text) : undefined,
      },
      {
        text: sanitizeText(holderText(row)),
        style: (text) =>
          theme.fg(row.waiting.length > 0 ? "warning" : dim ? "muted" : "text", text),
      },
      { text: ttl.text, style: (text) => theme.fg(ttl.tone, text) },
      { text: row.state, style: (text) => theme.fg(STATE_TONE[row.state], text) },
    ];
    out.push(fitWidth(renderTableRow(cells, columns, width), width));
  }
  return out;
}

/**
 * §6.4 — a windowed layout renderer: only the visible slice is rendered, never all rows.
 *
 * The window is the host's own: `getMenuWindow` (`pi-tui/src/components/menu-selection.ts`, a
 * public export of `@oh-my-pi/pi-tui`) picks a contiguous window that CONTAINS the selected item.
 * The board used to render every row and cut the slice from the top, so `j` could move the cursor
 * below the fold and the marker vanished — and every claim was stringified on every frame, which
 * is the per-record cost the panel's perf rule forbids.
 */
export function createBoardPane(
  getRows: () => readonly BoardRow[],
  width: number,
  theme: Theme,
  getSelected: () => number = () => -1,
): LayoutRenderer {
  return (paneWidth: number, height: number | undefined): readonly string[] => {
    const rows = getRows();
    const size = Math.max(0, height ?? rows.length);
    if (size === 0) return [];
    const ordered = sortBoardRows(rows);
    const selected = getSelected();
    const viewport = getMenuWindow(
      ordered.map(() => 1),
      Math.max(0, selected),
      size,
    );
    const slice = ordered.slice(viewport.startIndex, viewport.endIndex);
    return projectClaims(
      slice,
      paneWidth > 0 ? paneWidth : width,
      theme,
      Date.now(),
      selected - viewport.startIndex,
    );
  };
}
