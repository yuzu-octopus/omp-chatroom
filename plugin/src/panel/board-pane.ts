import {
  type LayoutRenderer,
  renderTableRow,
  type TableCell,
  type TableColumn,
  type Theme,
} from "@oh-my-pi/pi-tui";
import type { ClaimRow } from "../store/schema";
import { fitWidth } from "./chrome";

export type BoardRow = ClaimRow & { state: "held" | "expired" | "released" }; // [invented] — §6.4 dimming

/**
 * §6.4 — `resource · holder · TTL · state`. The holder column shrinks before the resource column
 * (`priority` 0 < 1 < 2), and the state column never truncates a word the user needs.
 */
export const BOARD_COLUMNS: readonly TableColumn[] = [
  { width: 28, minWidth: 8, align: "left", overflow: "truncate", priority: 2 },
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
  return row.contended > 0 ? `${row.holder} +${row.contended} waiting` : row.holder;
}

/**
 * §6.4 — the pure projection: claim rows → exactly `width`-cell strings, one per row, `held` first
 * and finished rows last. No TUI required.
 */
export function projectClaims(
  rows: readonly BoardRow[],
  width: number,
  theme: Theme,
  now = Date.now(),
): string[] {
  if (rows.length === 0) return [fitWidth(theme.fg("dim", "no claims"), width)];
  const ordered = [...rows].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);
  const out: string[] = [];
  for (const row of ordered) {
    const dim = row.state !== "held";
    const ttl = ttlCell(row, now);
    const cells: TableCell[] = [
      { text: row.resource, style: dim ? (text) => theme.fg("muted", text) : undefined },
      {
        text: holderText(row),
        style: (text) => theme.fg(row.contended > 0 ? "warning" : dim ? "muted" : "text", text),
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
): LayoutRenderer {
  return (paneWidth: number, height: number | undefined): readonly string[] => {
    const rows = projectClaims(getRows(), paneWidth > 0 ? paneWidth : width, theme);
    return rows.slice(0, height ?? rows.length);
  };
}
