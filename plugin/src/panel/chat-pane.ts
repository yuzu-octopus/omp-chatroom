import { sanitizeText } from "@oh-my-pi/pi-utils";
import { padding, truncateToWidth, visibleWidth, type LayoutRenderer, type Theme } from "@oh-my-pi/pi-tui";
import type { MemberState } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import { classify, type Tier } from "../attention/tiers";

export interface ChatRow {                                 // [invented]
  seq: number; ts: number; tier: Tier; author: string; topic: string;
  body: string; mention: boolean; unread: boolean; threadDepth: number;
}

// §6.3 — the per-row tier badge: error T0, warning T1, muted T2. (`info` is a status GLYPH in the
// theme, not a foreground colour; the plan's "info/muted T2" resolves to `muted`.)
const TIER_TONE: Record<Tier, "error" | "warning" | "muted"> = { T0: "error", T1: "warning", T2: "muted" };

type MsgRecord = Extract<RoomRecord, { kind: "msg" }>;

/** Reply chain depth, bounded at 8 so a cyclic log cannot spin. `byId` is the parent index. */
function threadDepthOf(record: MsgRecord, byId: ReadonlyMap<string, MsgRecord>): number {
  let depth = 0;
  let parent = record.replyTo;
  const seen = new Set<string>();
  while (parent !== undefined && depth < 8 && !seen.has(parent)) {
    seen.add(parent);
    const record_ = byId.get(parent);
    if (record_ === undefined) break;
    depth += 1;
    parent = record_.replyTo;
  }
  return depth;
}

/**
 * §6.3 — records → chat rows. `cursor` is the viewer's position: rows after it are unread. Room text
 * is ANSI-sanitized here (S2), before any styling. Linear in the record count (the parent index is
 * built once), so a 5000-record room projects without a per-row scan.
 */
export function projectChatRows(
  records: readonly RoomRecord[],
  viewer: MemberState,
  cursor: number,
): ChatRow[] {
  const byId = new Map<string, MsgRecord>();
  for (const record of records) if (record.kind === "msg") byId.set(record.id, record);

  const rows: ChatRow[] = [];
  for (const record of records) {
    if (record.kind !== "msg" && record.kind !== "note") continue;
    rows.push({
      seq: record.seq,
      ts: record.ts,
      tier: classify(record, viewer),
      author: record.from,
      topic: record.topic,
      body: sanitizeText(record.body),
      mention: record.kind === "msg" && (record.mention?.includes(viewer.agentId) ?? false),
      unread: record.seq > cursor,
      threadDepth: record.kind === "msg" ? threadDepthOf(record, byId) : 0,
    });
  }
  return rows;
}

/** Pad to exactly `width` or hard-truncate (styling preserved by `truncateToWidth`). */
function padOrTrim(text: string, width: number): string {
  const visible = visibleWidth(text);
  if (visible === width) return text;
  if (visible < width) return text + padding(width - visible);
  const cut = truncateToWidth(text, width);
  return visibleWidth(cut) < width ? cut + padding(width - visibleWidth(cut)) : cut;
}

/**
 * §6.3 — one styled row per message: `[unread][tier][time] author › topic · body`, body truncated to
 * the pane. Every line is exactly `width` cells (the caller has already sliced the window).
 */
export function renderChatRows(rows: readonly ChatRow[], width: number, theme: Theme): string[] {
  return rows.map(row => {
    const unread = row.unread ? theme.fg("accent", theme.nav.cursor) : " ";
    const badge = theme.fg(TIER_TONE[row.tier], row.tier);
    const time = theme.fg("dim", new Date(row.ts).toISOString().slice(11, 19));
    const author = row.mention ? theme.bold(theme.fg("accent", row.author)) : theme.bold(row.author);
    const indent = row.threadDepth > 0 ? theme.tree.vertical.repeat(row.threadDepth) + theme.tree.branch : "";
    const body = truncateToWidth(row.body.replace(/[\r\n]+/g, " "), Math.max(1, width - 32));
    const head =
      `${unread}${badge} ${time} ${indent}${author} ${theme.fg("dim", "›")} ` +
      `${theme.fg("muted", row.topic)} ${theme.sep.dot} ${body}`;
    return padOrTrim(head, width);
  });
}

/**
 * §6.2/§6.3 — a WINDOWED chat renderer: it renders only the tail of the row list that fits the pane
 * (`followTail`), never one component per message (§6.2 perf rule).
 */
export function createChatPane(getRows: () => readonly ChatRow[], height: number, theme: Theme): LayoutRenderer {
  return (width: number, paneHeight: number | undefined): readonly string[] => {
    const size = Math.max(0, paneHeight ?? height);
    const rows = getRows();
    return renderChatRows(rows.slice(Math.max(0, rows.length - size)), width, theme);
  };
}
