import { type LayoutRenderer, type Theme, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { classify, type Tier } from "../attention/tiers";
import type { MemberState } from "../store/room-store";
import type { RoomRecord, StatusObject } from "../store/schema";
import { fitWidth } from "./chrome";

export interface ChatRow {
  // [invented]
  seq: number;
  ts: number;
  tier: Tier;
  author: string;
  topic: string;
  body: string;
  mention: boolean;
  unread: boolean;
  threadDepth: number;
  /** R6 — the topic's status ledger, when the message carries one. */
  status?: StatusObject;
}

// §6.3 — the per-row tier badge: error T0, warning T1, muted T2. (`info` is a status GLYPH in the
// theme, not a foreground colour; the plan's "info/muted T2" resolves to `muted`.)
const TIER_TONE: Record<Tier, "error" | "warning" | "muted"> = {
  T0: "error",
  T1: "warning",
  T2: "muted",
};

// The 1-cell status glyph per tier. `status.muted` does not exist in the theme's SymbolKey union, so
// T2 borrows `info` and keeps the muted tone above.
const TIER_GLYPH: Record<Tier, "error" | "warning" | "info"> = {
  T0: "error",
  T1: "warning",
  T2: "info",
};

type MsgRecord = Extract<RoomRecord, { kind: "msg" }>;

/**
 * The row's clock, in LOCAL time.
 *
 * The row used to slice `toISOString()`, which is UTC — so the panel's clock disagreed with the
 * host's own transcript (which renders `toLocaleTimeString`, `pi-tui/src/chat/user-message.ts:246`)
 * and with the host's local-date helper (`pi-tui/src/chrome/local-date.ts`, `getHours()`). A reader
 * comparing the panel with the transcript saw two different times for the same message.
 */
function clockOf(ts: number): string {
  const date = new Date(ts);
  const pad2 = (value: number): string => String(value).padStart(2, "0");
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

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
      ...(record.kind === "msg" && record.status !== undefined ? { status: record.status } : {}),
    });
  }
  return rows;
}

/**
 * §6.3 — one styled row per message: `[unread][tier][time] author › topic · body`, body truncated to
 * the pane. Every line is exactly `width` cells (the caller has already sliced the window).
 *
 * The width is BUDGETED, not guessed: the head is rendered first and measured, and the body takes
 * what is left. The old fixed `width - 32` reserve was a guess at the head's length — at a narrow
 * width the head alone is longer than 32 cells, so the body was cut to nothing and the row was then
 * truncated, taking the topic and the ledger with it.
 */
export function renderChatRows(
  rows: readonly ChatRow[],
  width: number,
  theme: Theme,
  selected = -1,
): string[] {
  return rows.map((row, index) => {
    const unread = row.unread ? theme.fg("accent", theme.nav.cursor) : " ";
    // D3: the theme owns a 1-cell status glyph per severity (theme-class.ts:485-503). Painting the
    // ASCII "T0"/"T1"/"T2" made the badge 2 cells and the only row element not theme-sourced.
    // There is no `status.muted` key, so T2 uses glyph `status.info` with the muted tone.
    const badge = theme.fg(TIER_TONE[row.tier], theme.status[TIER_GLYPH[row.tier]]);
    const time = theme.fg("dim", clockOf(row.ts));
    const author = row.mention
      ? theme.bold(theme.fg("accent", sanitizeText(row.author)))
      : theme.bold(sanitizeText(row.author));
    const indent =
      row.threadDepth > 0 ? theme.tree.vertical.repeat(row.threadDepth) + theme.tree.branch : "";
    // The visible cursor: the row the panel's actions address is the row the user can see. The
    // glyph is the THEME's own "selected" symbol (nav.selected) — the house rule is that every
    // row element comes from the theme, and the fallback theme defines nav.selected.
    const marker = index === selected ? theme.fg("accent", theme.nav.selected) : " ";
    // D2: one space between the unread cursor and the badge. D1: `sep.dot` is already " · " with its
    // flanks (symbols.ts:455), so it must not be wrapped in more spaces. D7: the separator between
    // author and topic is `nav.selected`, a SymbolKey, not a hardcoded "›".
    const head =
      `${marker}${unread}${badge} ${time} ${indent}${author}${theme.sep.dot}` +
      `${theme.fg("muted", sanitizeText(row.topic))}${theme.nav.selected}`;
    // R6 — the topic's status ledger, as the human sees it: is this topic looping, and who is next.
    // A ledger the panel cannot show is a ledger nobody reads.
    const status = row.status === undefined ? "" : statusLine(row.status, theme);
    // The body takes what the head and the ledger leave. The ledger is RESERVED before the body:
    // it is the actionable half of the row, and a body that grows past it would push the ledger
    // off the end of the line (the row is truncated from the tail).
    const free = Math.max(0, width - visibleWidth(head));
    const bodyWidth = Math.max(0, free - visibleWidth(status));
    const body =
      bodyWidth === 0 ? "" : truncateToWidth(row.body.replace(/[\r\n]+/g, " "), bodyWidth);
    return fitWidth(head + body + status, width);
  });
}

/**
 * R6 — the ledger in one line: `looping · next AgentB · publish it`.
 *
 * Only the parts a human watching the panel needs: the loop flag (the failure it prevents), the next
 * actor, and the instruction. The rest of the ledger is the agent's business.
 *
 * Each part is styled on its OWN, the way the host's `renderStatusLine` styles its fragments
 * (`pi-tui/src/render/status-line.ts`): `theme.fg` ends every string with `\x1b[39m`
 * (`theme-class.ts:350`), so wrapping already-styled parts in one outer `fg` reset the outer tone
 * for everything after the first part — the muted ledger text after "looping" came out in the
 * terminal's default colour. The parts are also joined with `sep.dot` (which already carries its
 * own flanks) after ONE space, not wrapped in spaces of its own.
 */
function statusLine(status: StatusObject, theme: Theme): string {
  const parts: string[] = [];
  if (status.is_in_loop.answer.toLowerCase() === "yes") {
    parts.push(theme.fg("error", "looping"));
  }
  const next = sanitizeText(status.next_speaker.answer.trim());
  if (next !== "") parts.push(theme.fg("muted", `next ${next}`));
  const instruction = sanitizeText(status.instruction_or_question.answer.trim());
  if (instruction !== "") parts.push(theme.fg("muted", instruction));
  if (parts.length === 0) return "";
  return ` ${parts.join(theme.sep.dot)}`;
}

/**
 * §6.2/§6.3 — a WINDOWED chat renderer: it renders only the tail of the row list that fits the pane
 * (`followTail`), never one component per message (§6.2 perf rule).
 *
 * `getSelected` is the index into the FULL row list (the panel's selection), so the marker lands
 * on the row the user is on even when the pane shows only the tail.
 */
export function createChatPane(
  getRows: () => readonly ChatRow[],
  height: number,
  theme: Theme,
  getSelected: () => number = () => -1,
): LayoutRenderer {
  return (width: number, paneHeight: number | undefined): readonly string[] => {
    const size = Math.max(0, paneHeight ?? height);
    const rows = getRows();
    const selected = getSelected();
    // The pane shows the TAIL of the log (the newest rows). When the cursor moves above that
    // window the window follows it, so the marker is never invisible in a long room.
    let start = Math.max(0, rows.length - size);
    if (selected >= 0 && selected < start)
      start = Math.min(selected, Math.max(0, rows.length - size));
    const windowed = rows.slice(start, start + size);
    return renderChatRows(windowed, width, theme, selected - start);
  };
}
