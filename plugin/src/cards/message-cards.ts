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
 * The topic, escaped and capped. The card header is truncated to the render width, so an unbounded
 * topic would push the author and the age off the line; the cap keeps them visible. The topic is
 * free-form room text — `renderStatusLine` does not escape — so it is escaped here like every
 * other room string that reaches a surface, or a topic named `<system-reminder>…` would render raw
 * in the transcript (which a resumed session replays into an agent's context).
 */
const TOPIC_MAX = 24;
function topicOf(record: RoomRecord | undefined): string | undefined {
  if (!record || (record.kind !== "msg" && record.kind !== "note")) return undefined;
  const topic = record.topic;
  if (!topic) return undefined;
  const safe = safeRoomText(topic);
  return safe.length > TOPIC_MAX ? `${safe.slice(0, TOPIC_MAX - 1)}…` : safe;
}

/**
 * The speech act, when the poster set one. The tool schema promises it is "carried through to
 * cards"; before this it was stored and read by nobody, so the promise was a lie.
 */
function performativeOf(record: RoomRecord | undefined): string | undefined {
  if (record?.kind !== "msg") return undefined;
  return record.performative;
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

/** `✉ room ⟵ author · topic · [reply] · 2m ago` + the quote-bordered body (§7.3/§7.4). */
export function renderMessageCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record, body) => {
    const from = record && "from" in record ? record.from : "?";
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
    const from = record && "from" in record ? record.from : "?";
    const meta = [
      "➤ me",
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

/** `⚑ room claim: author → resource · 4m left`; expanded lists the lease detail (§7.3). */
export function renderClaimCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record) => {
    const from = record && "from" in record ? record.from : "?";
    const lines = [
      renderStatusLine(
        { iconOverride: "⚑", title: `room claim ${from}`, meta: [ageOf(message.timestamp)] },
        theme,
      ),
    ];
    if (!record || (record.kind !== "claim" && record.kind !== "release")) return lines;
    if (record.kind === "claim") {
      // The resource is "<topic>/<key>" — both free-form room text, and the status line does not
      // escape, so it is escaped here rather than rendered raw.
      lines.push(`  ${theme.fg("toolOutput", `→ ${safeRoomText(record.resource)}`)}`);
      if (expanded) {
        lines.push(
          `  ${theme.fg("dim", `ttl ${Math.round(record.ttlMs / 1000)}s · seq ${record.seq}`)}`,
        );
      }
      return lines;
    }
    lines.push(
      `  ${theme.fg("toolOutput", `✕ ${safeRoomText(record.resource)} — ${safeRoomText(record.reason)}`)}`,
    );
    if (expanded) {
      lines.push(`  ${theme.fg("dim", `prev holder ${record.prevHolder} · seq ${record.seq}`)}`);
    }
    return lines;
  });
}

/** `▦ room board: +N claimed, −N released`; expanded lists each delta row (§7.3). */
export function renderBoardDeltaCard(
  message: CustomMessage,
  options: MessageRenderOptions,
  theme: Theme,
): Component {
  return frameComponent(message, options, theme, (_width, expanded, record) => {
    const title =
      record?.kind === "gap"
        ? `room board: ${record.skipped} record(s) skipped`
        : record?.kind === "member"
          ? `room board: ${record.from} ${record.action === "join" ? "joined" : "left"}`
          : record?.kind === "contended"
            ? `room board: ${record.from} lost ${record.resource} to ${record.holder}`
            : "room board";
    const lines = [
      renderStatusLine({ iconOverride: "▦", title, meta: [ageOf(message.timestamp)] }, theme),
    ];
    if (expanded && record) {
      lines.push(`  ${theme.fg("dim", `seq ${record.seq} · ${record.kind}`)}`);
      if (record.kind === "gap")
        lines.push(`  ${theme.fg("toolOutput", `reason: ${record.reason}`)}`);
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
