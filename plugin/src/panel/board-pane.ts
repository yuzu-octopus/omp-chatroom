import {
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
 * §6.4 — `resource · holder · TTL · state`. The holder column shrinks before the resource column
 * (`priority` 0 < 1 < 2), and the state column never truncates a word the user needs.
 */
export const BOARD_COLUMNS: readonly TableColumn[] = [
  // The resource column carries the resource AND what it waits on (R9), and a real path plus a
  // dependency is ~26 cells — so it needs the room. It has the highest priority (2), which means
  // it shrinks LAST when the pane is narrow.
  { width: 36, minWidth: 8, align: "left", overflow: "truncate", priority: 2 },
  { width: 18, minWidth: 6, align: "left", overflow: "truncate", priority: 0 },
  { width: 7, minWidth: 4, align: "right", overflow: "truncate", priority: 1 },
  { width: 6, minWidth: 4, align: "left", overflow: "truncate", priority: 1 },
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
  if (row.state === "expired") return { text: "expired", tone: "error" };
  if (row.state !== "held") return { text: "—", tone: "muted" };
  const leftMs = row.expiresAt - now;
  if (leftMs <= 0) return { text: "expired", tone: "error" };
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
 * R9 — what the claim is waiting on, in the resource cell: `build/step ← build/schema`.
 *
 * The arrow is the theme's own `nav.back` (the card uses it for "room ⟵"), not a hardcoded glyph.
 * Only the first dependency fits the column; the rest are counted.
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
        // element comes from the theme, and the plugin's fallback theme defines nav.selected.
        text: `${marked ? theme.nav.selected : " "}${resourceText(row, theme)}`,
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

/** §6.4 — a windowed layout renderer: only the visible slice is rendered, never all rows. */
export function createBoardPane(
  getRows: () => readonly BoardRow[],
  width: number,
  theme: Theme,
  getSelected: () => number = () => -1,
): LayoutRenderer {
  return (paneWidth: number, height: number | undefined): readonly string[] => {
    const rows = projectClaims(
      getRows(),
      paneWidth > 0 ? paneWidth : width,
      theme,
      Date.now(),
      getSelected(),
    );
    return rows.slice(0, height ?? rows.length);
  };
}
