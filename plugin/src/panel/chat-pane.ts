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

// The status glyph per tier. `status.muted` does not exist in the theme's SymbolKey union, so
// T2 borrows `info` and keeps the muted tone above. The glyph's CELL WIDTH is the user's choice,
// not ours: the unicode set paints a one-cell glyph, the ascii set paints "[!!]" (four cells), and
// the row's budget is measured, so a wider glyph costs the body cells rather than the row.
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

/** The parent index: message id → record, for the reply-chain depth. */
type MessageIndex = Map<string, MsgRecord>;

function messageIndexOf(records: readonly RoomRecord[]): MessageIndex {
  const byId: MessageIndex = new Map<string, MsgRecord>();
  for (const record of records) if (record.kind === "msg") byId.set(record.id, record);
  return byId;
}

/**
 * One chat row, or `undefined` for a record the chat does not show (claims, members, wait
 * bookkeeping). `byId` holds the records projected SO FAR, so the reply chain resolves to whatever
 * depth the log had when the row was built.
 */
function chatRowOf(
  record: RoomRecord,
  viewer: MemberState,
  cursor: number,
  byId: ReadonlyMap<string, MsgRecord>,
): ChatRow | undefined {
  if (record.kind !== "msg" && record.kind !== "note") return undefined;
  return {
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
  };
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
  const byId = messageIndexOf(records);
  const rows: ChatRow[] = [];
  for (const record of records) {
    const row = chatRowOf(record, viewer, cursor, byId);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

/**
 * §6.8 — the state an INCREMENTAL chat projection carries between refreshes: the rows already
 * built, the record watermark they cover, the parent index, and what they were built FOR.
 */
export interface ChatProjection {
  rows: ChatRow[];
  /** How many records `rows` covers (`records.length` at the last projection). */
  watermark: number;
  /**
   * The seq of `records[watermark - 1]` (0 when empty). Retention SHIFTS the array from the front
   * without notifying, so a prune followed by an append can leave `records.length` unchanged while
   * the covered prefix moved — the watermark alone would then miss the appended record and keep
   * the pruned one. A changed tail seq means the prefix is no longer the one projected.
   */
  tailSeq: number;
  /** The message index, extended per append so `threadDepth` needs no rescan. */
  byId: MessageIndex;
  /** The viewer state the rows were classified for (see `viewerKeyOf`). */
  viewerKey: string;
  /** The cursor the `unread` flags were computed against. */
  cursor: number;
  /**
   * The first row that MAY be unread: every row before it is read. The boundary only moves forward
   * while the cursor does, so a refresh touches only the rows that just became read.
   */
  unreadFrom: number;
}

/**
 * Everything `classify` and the row's `mention` flag read off the viewer (`attention/tiers.ts`:
 * `agentId`, `lastMessageId`, `waitedResource`, `topics`, `heldTopics`, `threadRoots`; `muted` rides
 * along because the panel's viewer is the same member state the delivery layer reads).
 *
 * A projection is only reusable while this key is unchanged: a topic the viewer starts following
 * turns its T2 rows into T1, and the rows already built cannot be re-tiered without re-classifying.
 */
export function viewerKeyOf(viewer: MemberState): string {
  const setKey = (set: ReadonlySet<string>): string => [...set].sort().join("\u0001");
  return [
    viewer.agentId,
    viewer.lastMessageId ?? "",
    viewer.waitedResource ?? "",
    setKey(viewer.topics),
    setKey(viewer.muted),
    setKey(viewer.heldTopics),
    setKey(viewer.threadRoots),
  ].join("\u0000");
}

/** The first row that may be unread. `seq` is monotonic in the log (the store mints it). */
function unreadStartOf(rows: readonly ChatRow[], cursor: number): number {
  let index = 0;
  while (index < rows.length && rows[index]!.seq <= cursor) index += 1;
  return index;
}

/** Flip the rows the cursor has now reached; returns the new first-maybe-unread index. */
function advanceUnread(rows: ChatRow[], from: number, cursor: number): number {
  let index = from;
  while (index < rows.length && rows[index]!.seq <= cursor) {
    rows[index]!.unread = false;
    index += 1;
  }
  return index;
}

/**
 * Test-only seam (the `__compactTest` idiom, `store/compactor.ts:87`): how many times the chat
 * projection rebuilt every row. A refresh after one append must not move it.
 */
export const __chatPaneTest: { fullProjections: number } = { fullProjections: 0 };

/**
 * §6.8 — the incremental projection: append the rows `records.slice(watermark)` produce, flip only
 * the `unread` flags the cursor has moved past, and keep the parent index.
 *
 * `refresh()` used to project every record on every store append and registry change — measured
 * 2.1 ms at 5000 records and 8.6 ms for the 8000-byte maximum body, against <0.001 ms to project
 * the appended records alone — while the pane renders at most a pane-height tail. A full rebuild is
 * only needed when the rows are no longer a prefix of the new projection: retention shrank the log
 * (`records.length < watermark`), the viewer state changed, or the cursor rewound (a reset).
 *
 * The one semantic the incremental path does not reproduce is a `replyTo` that names a record LATER
 * in the log: the full projection resolves it because it indexes every message first, while the
 * incremental one sees the parent only when it arrives. A forward reference is a corrupt log, and
 * the next rebuild (retention or a viewer change) resolves it; reply chains inside the projected
 * window — the indentation the pane promises — are unchanged.
 */
export function projectChatRowsIncremental(
  records: readonly RoomRecord[],
  viewer: MemberState,
  cursor: number,
  previous?: ChatProjection,
): ChatProjection {
  const viewerKey = viewerKeyOf(viewer);
  // The rows are reusable only while `records` still STARTS with the records they were built from:
  // retention shifts the front of the array without notifying, so the length alone can stay equal
  // across a prune+append and hide both the dropped row and the appended one.
  const prefixIntact =
    previous === undefined ||
    previous.watermark === 0 ||
    records[previous.watermark - 1]?.seq === previous.tailSeq;
  if (
    previous === undefined ||
    records.length < previous.watermark ||
    !prefixIntact ||
    previous.viewerKey !== viewerKey ||
    cursor < previous.cursor
  ) {
    __chatPaneTest.fullProjections += 1;
    const byId = messageIndexOf(records);
    const rows: ChatRow[] = [];
    for (const record of records) {
      const row = chatRowOf(record, viewer, cursor, byId);
      if (row !== undefined) rows.push(row);
    }
    return {
      rows,
      watermark: records.length,
      tailSeq: records.at(-1)?.seq ?? 0,
      byId,
      viewerKey,
      cursor,
      unreadFrom: unreadStartOf(rows, cursor),
    };
  }
  const rows = previous.rows;
  // The cursor is monotonic here (a rewind rebuilt above), so this walks only the rows that just
  // became read; every other row keeps its object, and the pane keeps its identity.
  const unreadFrom = advanceUnread(rows, previous.unreadFrom, cursor);
  const byId = previous.byId;
  for (let index = previous.watermark; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.kind === "msg") byId.set(record.id, record);
    const row = chatRowOf(record, viewer, cursor, byId);
    if (row !== undefined) rows.push(row);
  }
  // A record can arrive already delivered (the cursor was bumped before this refresh), so the
  // boundary is re-derived after the append instead of being assumed to be the old row count.
  return {
    rows,
    watermark: records.length,
    tailSeq: records.at(-1)?.seq ?? 0,
    byId,
    viewerKey,
    cursor,
    unreadFrom: advanceUnread(rows, unreadFrom, cursor),
  };
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
    // D3: the theme owns the status glyph per severity (theme-class.ts:485-503). Painting the
    // ASCII "T0"/"T1"/"T2" made the badge 2 cells and the only row element not theme-sourced.
    // There is no `status.muted` key, so T2 uses glyph `status.info` with the muted tone. The
    // glyph's cell width is the USER's active set (the ascii set paints "[!!]", four cells), so the
    // head is measured with `visibleWidth` below — a wider glyph costs the body, never the row.
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
    const headText =
      `${marker}${unread}${badge} ${time} ${indent}${author}${theme.sep.dot}` +
      `${theme.fg("muted", sanitizeText(row.topic))}${theme.nav.selected}`;
    // R6 — the topic's status ledger, as the human sees it: is this topic looping, and who is next.
    // A ledger the panel cannot show is a ledger nobody reads.
    const status = row.status === undefined ? "" : statusLine(row.status, theme);
    const statusWidth = visibleWidth(status);
    // The head is BOUNDED before it is measured. The author and the topic are room-authored and
    // unbounded, and a head wider than the row made `free` zero: the body got nothing and the row
    // was then truncated from the tail — taking the ledger, the actionable half of the row, with
    // it. Cutting the head to the row minus the ledger's cells keeps the ledger reserved no matter
    // how long the topic is.
    const head = truncateToWidth(headText, Math.max(0, width - statusWidth));
    // The body takes what the head and the ledger leave.
    const bodyWidth = Math.max(0, width - visibleWidth(head) - statusWidth);
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
 *
 * `followsTail` is the panel's follow state, and it is what makes a live room live: while it is
 * true the window is ALWAYS the newest `size` rows and the selection tracks the newest row, so rows
 * appended after the first clamp still arrive. Without it the clamped selection fell `size` rows
 * behind the log, the `selected < start` branch below pinned the window to that row, and the pane
 * followed for exactly `size` new rows before freezing. Scrolling away from the tail drops follow
 * mode, and the window follows the selection again so the marker is never invisible.
 */
export function createChatPane(
  getRows: () => readonly ChatRow[],
  height: number,
  theme: Theme,
  getSelected: () => number = () => -1,
  followsTail: () => boolean = () => false,
): LayoutRenderer {
  return (width: number, paneHeight: number | undefined): readonly string[] => {
    const size = Math.max(0, paneHeight ?? height);
    const rows = getRows();
    const selected = getSelected();
    let start = Math.max(0, rows.length - size);
    if (!followsTail() && selected >= 0 && selected < start) start = selected;
    const windowed = rows.slice(start, start + size);
    return renderChatRows(windowed, width, theme, selected - start);
  };
}
