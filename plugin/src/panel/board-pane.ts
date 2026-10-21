import {
  getMenuWindow,
  type LayoutRenderer,
  renderTableRow,
  type TableCell,
  type TableColumn,
  type Theme,
} from "@oh-my-pi/pi-tui";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { ClaimRow } from "../store/schema";
import { fitWidth } from "./chrome";

export type BoardRow = ClaimRow & { state: "held" | "expired" | "released" }; // [invented] — §6.4 dimming

/**
 * §6.4 — `cursor · resource · holder · TTL · state`.
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
 */
export const BOARD_COLUMNS: readonly TableColumn[] = [
  // The selection cursor gets its OWN one-cell column. The host's `alignCell` styles a whole cell
  // (and pads it), so a marker inside the resource cell would share the resource's tone — a dimmed
  // marker on a released row — and would silently eat one cell of the resource's declared width.
  { width: 1, minWidth: 1, align: "left", overflow: "truncate", priority: 4 },
  // The resource cell carries the resource AND what it waits on (R9): "build/parser ⟵ build/schema"
  // is 27 cells, 30 with the "+N" count of the dependencies that did not fit. It shrinks LAST
  // (priority 3): the dependency is the first thing a reader looks for, and it is the newest
  // thing on the board.
  { width: 30, minWidth: 12, align: "left", overflow: "truncate", priority: 3 },
  // The holder cell carries the holder AND the waiters: "AgentA +2 waiting" is 17 cells. Its floor
  // is 10, so the COUNT survives ("AgentA +2…") even when the word does not — the waiters are the
  // other half of the board's new state.
  { width: 17, minWidth: 10, align: "left", overflow: "truncate", priority: 1 },
  // The countdown goes first (priority 0): it is also encoded in the tone (warning under 25%
  // remaining, error once expired), so a narrow pane loses the number, never the urgency.
  { width: 5, minWidth: 4, align: "right", overflow: "truncate", priority: 0 },
  // The state word is never chopped: "expired" is 7 cells, "released" is 8.
  { width: 8, minWidth: 8, align: "left", overflow: "truncate", priority: 2 },
];

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
): { text: string; tone: "muted" | "warning" | "error" } {
  // An ended claim has no countdown. The STATE column already says "expired"/"released", and
  // repeating the word here spent seven cells of the narrowest column on a second copy — which
  // the row then truncated to "expi…".
  if (row.state !== "held") return { text: "—", tone: "muted" };
  const leftMs = row.expiresAt - now;
  if (leftMs <= 0) return { text: "—", tone: "error" };
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
  const out: string[] = [];
  for (const [index, row] of ordered.entries()) {
    const dim = row.state !== "held";
    const ttl = ttlCell(row, now);
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
    out.push(fitWidth(renderTableRow(cells, BOARD_COLUMNS, width), width));
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
