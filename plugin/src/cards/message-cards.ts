import type {
  ExtensionAPI,
  MessageRenderer,
  MessageRenderOptions,
} from "@oh-my-pi/pi-coding-agent";
import { type Component, Ellipsis, type Theme, truncateToWidth } from "@oh-my-pi/pi-tui";
import type { CustomMessage } from "@oh-my-pi/pi-tui/chat/messages";
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import { formatAge } from "@oh-my-pi/pi-utils";
import { safeRoomText } from "../onboarding/escape";
import type { RoomRecord } from "../store/schema";
import { bodyLines, COLLAPSED_QUOTE_LINES } from "./body-lines";

export type CardType = "room:message" | "room:mention" | "room:claim" | "room:board-delta"; // §7.3
export const CARD_TYPES: readonly CardType[] = [
  "room:message",
  "room:mention",
  "room:claim",
  "room:board-delta",
]; // §7.3

/**
 * §5.3 — which transcript card a record is delivered as. Exhaustive over all six kinds with no
 * `default`, so a new kind is a compile error rather than a silent fall-through.
 *
 * `member`/`gap` are board/roster state with no body to quote, so they share `room:board-delta`;
 * `note` carries `topic` + `body` exactly like a `msg`, so it renders with the message card.
 */

export function cardTypeFor(record: RoomRecord): CardType {
  switch (record.kind) {
    case "msg":
      return record.mention?.length ? "room:mention" : "room:message";
    case "note":
      return "room:message";
    case "claim":
    case "release":
      return "room:claim";
    case "member":
    case "gap":
    case "contended":
    case "wait":
    case "delivered":
      return "room:board-delta";
  }
}

/** The record a card renders, when `details` survived (resume restores it; a bare payload may not). */
function recordOf(message: CustomMessage): RoomRecord | undefined {
  const details = message.details;
  if (details && typeof details === "object" && "kind" in details) return details as RoomRecord;
  return undefined;
}

/** The body a card quotes: the record's own `body`, else the message's `content` text. */
function bodyOf(message: CustomMessage, record: RoomRecord | undefined): string {
  if (record && (record.kind === "msg" || record.kind === "note")) return record.body;
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .map((block) => ("text" in block && typeof block.text === "string" ? block.text : ""))
    .join("");
}

/** `formatAge` takes seconds; a just-delivered card must read as an age, never as empty. */
function ageOf(timestamp: number): string {
  return formatAge(Math.max(1, Math.round((Date.now() - timestamp) / 1000)));
}

/**
 * The one-line form of a room-authored card FIELD.
 *
 * `safeRoomText` strips ESC and the rest of C0, but it keeps LF on purpose: a body needs its lines.
 * A field is a single row — `from` in a status line, `prevHolder`/`reason` in detail rows these
 * cards build themselves, where there is no `flattenForHeader` to fold a newline — so the fold
 * happens here. The log line is untrusted (a peer, a prompt-injected model, or a repo-committed
 * legacy `.omp-room` log wrote it), and `validateRecord` accepts any string for `from`/
 * `prevHolder`, so a raw field would paint a real OSC sequence or split the card's frame.
 */
function cardField(text: string): string {
  return safeRoomText(text).replace(/\n+/g, " ");
}

/**
 * The topic, escaped and capped. The card header is truncated to the render width, so an unbounded
 * topic would push the author and the age off the line; the cap keeps them visible. The topic is
 * free-form room text — `renderStatusLine` does not escape — so it is escaped here like every
 * other room string that reaches a surface, or a topic named `<system-reminder>…` would render raw
 * in the transcript (which a resumed session replays into an agent's context).
 *
 * The cap is CELLS, via the host's own truncation (`pi-tui/src/utils.ts:176`): `safe.length`
 * counted UTF-16 units, so a 24-character CJK topic passed the cap at 48 cells and pushed the
 * performative/reply/age off the header, and a `.slice` could cut a surrogate pair in half.
 * `Ellipsis.Omit` is "cut, no marker" — the header is already ellipsized at the render width, and
 * the marker would have to be paid for out of the 24 cells.
 */
const TOPIC_MAX = 24;
function topicOf(record: RoomRecord | undefined): string | undefined {
  if (!record || (record.kind !== "msg" && record.kind !== "note")) return undefined;
  const topic = record.topic;
  if (!topic) return undefined;
  return truncateToWidth(cardField(topic), TOPIC_MAX, Ellipsis.Omit);
}

/**
 * The speech act, when the poster set one. The tool schema promises it is "carried through to
 * cards"; before this it was stored and read by nobody, so the promise was a lie.
 */
function performativeOf(record: RoomRecord | undefined): string | undefined {
  if (record?.kind !== "msg") return undefined;
  return record.performative && cardField(record.performative);
}

/**
 * A card whose rows are padded to exactly `width` visible cells. Custom message frames draw their
 * own border around the renderer output, so the rows must be full-width or the frame ragged-edges.
 */
function frameComponent(
  message: CustomMessage,
  options: MessageRenderOptions,
  _theme: Theme,
  render: (
    width: number,
    expanded: boolean,
    record: RoomRecord | undefined,
    body: string,
  ) => string[],
): Component {
  const record = recordOf(message);
  const body = bodyOf(message, record);
  return createCachedComponent(
    () => options.expanded,
    (width, expanded) =>
      render(width, expanded, record, body).map((line) =>
        truncateToWidth(line, width, Ellipsis.Unicode, true),
      ),
    { paddingX: 1 },
  );
}

/** `✉ room ⟵ author · topic · [reply] · 2m ago` + the quote-bordered body (§7.3/§7.4). The icon is the theme's own `tool.irc`. */
export function renderMessageCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record, body) => {
    const from = record && "from" in record ? cardField(record.from) : "?";
    const replyTo = record?.kind === "msg" ? record.replyTo : undefined;
    const meta = [
      topicOf(record),
      performativeOf(record),
      replyTo ? "reply" : undefined,
      ageOf(message.timestamp),
    ].filter((part): part is string => !!part);
    const lines = [
      renderStatusLine(
        {
          iconOverride: theme.styledSymbol("tool.irc", "accent"),
          title: `room ${theme.nav.back} ${from}`,
          meta,
        },
        theme,
      ),
    ];
    if (body.trim())
      lines.push(
        ...bodyLines(body, expanded, theme, {
          indent: "  ",
          collapsedLines: COLLAPSED_QUOTE_LINES,
        }),
      );
    return lines;
  });
}

/** `✉ room ⟵ author ➤ me · topic · reply · 2m ago` — the mention card adds the addressing marker (§7.3). */
export function renderMentionCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record, body) => {
    const from = record && "from" in record ? cardField(record.from) : "?";
    const meta = [
      // The addressing marker is the host's own "selected" glyph (the theme's active symbol set:
      // unicode / nerd / ascii), not a hardcoded one.
      `${theme.nav.selected} me`,
      topicOf(record),
      performativeOf(record),
      record?.kind === "msg" && record.replyTo ? "reply" : undefined,
      ageOf(message.timestamp),
    ].filter((part): part is string => !!part);
    const lines = [
      renderStatusLine(
        {
          iconOverride: theme.styledSymbol("tool.irc", "accent"),
          title: `room ${theme.nav.back} ${from}`,
          meta,
        },
        theme,
      ),
    ];
    if (body.trim())
      lines.push(
        ...bodyLines(body, expanded, theme, {
          indent: "  ",
          collapsedLines: COLLAPSED_QUOTE_LINES,
        }),
      );
    return lines;
  });
}

/** `⚑ room claim: author → resource · 4m left`; expanded lists the lease detail (§7.3). The flag is the theme's own `status.pending`. */
export function renderClaimCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record) => {
    const from = record && "from" in record ? cardField(record.from) : "?";
    const lines = [
      renderStatusLine(
        {
          // The card's flag. The host has no "claim" symbol, so the card borrows the theme's
          // PENDING glyph — a lease in flight — and drops the hardcoded "⚑" that ignored the
          // user's symbol set (ascii, nerd or unicode). Styled like every other card icon:
          // `renderStatusLine` paints `iconOverride` verbatim and only tones the `icon` enum
          // (`pi-tui/src/render/status-line.ts:34-35`).
          iconOverride: theme.styledSymbol("status.pending", "accent"),
          title: `room claim ${from}`,
          meta: [ageOf(message.timestamp)],
        },
        theme,
      ),
    ];
    if (!record || (record.kind !== "claim" && record.kind !== "release")) return lines;
    if (record.kind === "claim") {
      // The resource is "<topic>/<key>" — both free-form room text, and the status line does not
      // escape, so it is escaped here rather than rendered raw; this row is built by hand, so it
      // also needs the newline fold `flattenForHeader` would have done.
      // The pointer is the theme's own `nav.selected` (the host has no forward-arrow key; this is
      // its pointer glyph) rather than a hardcoded "→".
      lines.push(
        `  ${theme.fg("toolOutput", `${theme.nav.selected} ${cardField(record.resource)}`)}`,
      );
      if (expanded) {
        lines.push(
          `  ${theme.fg("dim", `ttl ${Math.round(record.ttlMs / 1000)}s${theme.sep.dot}seq ${record.seq}`)}`,
        );
      }
      return lines;
    }
    // The release marker is the theme's ERROR glyph (the host's "✘") — a lease that ended — and the
    // dash joining the two clauses is the theme's own `format.dash`.
    lines.push(
      `  ${theme.fg("toolOutput", `${theme.symbol("status.error")} ${cardField(record.resource)} ${theme.format.dash} ${cardField(record.reason)}`)}`,
    );
    if (expanded) {
      // `prevHolder` is free-form room text like `from` — `validateRecord` accepts any string —
      // and this row is built by hand, so it takes the same escaping + newline fold.
      lines.push(
        `  ${theme.fg("dim", `prev holder ${cardField(record.prevHolder)}${theme.sep.dot}seq ${record.seq}`)}`,
      );
    }
    return lines;
  });
}

/** `▦ room board: +N claimed, −N released`; expanded lists each delta row (§7.3). The grid is the theme's own `status.info`. */
export function renderBoardDeltaCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record, body) => {
    // Every name in this title is room-authored (`from`, `resource`, `holder`), so each goes
    // through `cardField`: `renderStatusLine` escapes nothing, and it only folds CR/LF.
    const title =
      record?.kind === "gap"
        ? `room board: ${record.skipped} record(s) skipped`
        : record?.kind === "member"
          ? `room board: ${cardField(record.from)} ${record.action === "join" ? "joined" : "left"}`
          : record?.kind === "contended"
            ? `room board: ${cardField(record.from)} lost ${cardField(record.resource)} to ${cardField(record.holder)}`
            : "room board";
    const lines = [
      renderStatusLine(
        {
          // Styled, for the reason the claim card's flag documents: a bare `theme.symbol` glyph is
          // the one thing `renderStatusLine` will not tone.
          iconOverride: theme.styledSymbol("status.info", "accent"),
          title,
          meta: [ageOf(message.timestamp)],
        },
        theme,
      ),
    ];
    // The payload's OWN lines. `notice()` sends the T0-ceiling / T1-overflow summary as
    // `{customType:"room:board-delta", content}` with NO `details` (`tools/room.ts:376`), so there
    // is no record to derive a title from: the card drew a bare "▦ room board" row and the notice
    // was invisible in the TUI while the model still saw the content. Quoted and escaped through
    // the same path a room body takes, so a payload can neither forge a harness block nor close
    // the region it is rendered inside. A record-bearing payload is left alone: its own title
    // already names the delta, and the content repeats it (`attention/delivery.ts:319`).
    if (!record && body.trim())
      lines.push(
        ...bodyLines(body, expanded, theme, {
          indent: "  ",
          collapsedLines: COLLAPSED_QUOTE_LINES,
        }),
      );
    if (expanded && record) {
      // `details` is cast by `recordOf` and never re-validated on resume, so the discriminant and
      // the closed-set reason are still runtime strings here — they take the same fold as the rest.
      lines.push(
        `  ${theme.fg("dim", `seq ${record.seq}${theme.sep.dot}${cardField(record.kind)}`)}`,
      );
      if (record.kind === "gap")
        lines.push(`  ${theme.fg("toolOutput", `reason: ${cardField(record.reason)}`)}`);
    }
    return lines;
  });
}

export function registerMessageRenderers(pi: ExtensionAPI): void {
  // §2.1.1
  // Registered one by one so the registry holds exactly these four types — no catch-all that
  // would make an unknown `room:*` type resolve.
  pi.registerMessageRenderer("room:message", renderMessageCard as MessageRenderer);
  pi.registerMessageRenderer("room:mention", renderMentionCard as MessageRenderer);
  pi.registerMessageRenderer("room:claim", renderClaimCard as MessageRenderer);
  pi.registerMessageRenderer("room:board-delta", renderBoardDeltaCard as MessageRenderer);
}
