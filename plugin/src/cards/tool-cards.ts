import type { AgentToolResult, ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import {
  type Component,
  compact,
  Ellipsis,
  type SymbolKey,
  span,
  type Theme,
  text,
  truncateToWidth,
} from "@oh-my-pi/pi-tui"; // TSP builders (native/describe)
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import type { NativeToolView } from "@oh-my-pi/pi-tui/tools/renderer";
import type { RoomParams, RoomToolDetails } from "../tools/room";
import type { WaitForAgentDetails } from "../tools/wait-for-agent";
import type { WaitForClaimDetails } from "../tools/wait-for-claim";
import type { WaitForMessageDetails } from "../tools/wait-for-message";

/**
 * Tool cards for `room` and the three wait tools (§7.5). Each pair has an ANSI renderer
 * (`renderCall`/`renderResult`) and a semantic TSP view (`describeCall`/`describeResult`) so the
 * cards look native in both terminal backends.
 *
 * Every string here is either a caller-supplied argument or a room-authored value, so it passes
 * through `plainText`/`safe` before it is styled or described.
 */

/**
 * The card icons, as SYMBOL KEYS — not as glyphs.
 *
 * The host ships three symbol sets (`pi-tui/src/theme/symbols.ts`: `unicode`, `nerd`, `ascii`) and
 * the active theme publishes the one the user chose; `theme.symbol(key)` resolves it. A hardcoded
 * glyph here ignored that choice: the card drew a nerd-font shape on an ASCII terminal, or a box
 * character where the user's set says `[i]`.
 */
const SYMBOL_KEY = { room: "status.info", wait: "status.pending" } as const satisfies Record<
  string,
  SymbolKey
>;

/** One-line, ANSI-free summary of the arguments — shared by both backends. */
function roomCallSummary(args: RoomParams): string {
  const target =
    args.op === "claim" || args.op === "release"
      ? [args.topic, args.key].filter(Boolean).join("/")
      : args.topic;
  return [args.op, target, args.limit !== undefined ? `limit ${args.limit}` : undefined]
    .filter((part): part is string => !!part)
    .join(" ");
}

function waitCallSummary(args: Record<string, unknown>): string {
  const timeout =
    typeof args.timeout === "number" ? `timeout ${Math.round(args.timeout / 1000)}s` : undefined;
  if (Array.isArray(args.agents))
    return [`wait_for_agent`, (args.agents as string[]).join(", "), timeout]
      .filter((p): p is string => !!p)
      .join(" ");
  if (typeof args.resource === "string")
    return [`wait_for_claim`, args.resource, timeout].filter((p): p is string => !!p).join(" ");
  const filter = [
    typeof args.from === "string" ? `from ${args.from}` : undefined,
    args.mention ? "mention" : undefined,
  ]
    .filter((p): p is string => !!p)
    .join(" ");
  return [`wait_for_message`, filter, timeout].filter((p): p is string => !!p).join(" ");
}

/** One-line result summary, derived from `details` (never from the rendered `content` text). */
function roomResultSummary(result: AgentToolResult<RoomToolDetails>): {
  meta: string[];
  error?: string;
} {
  const details = result.details;
  if (!details?.ok) {
    const error = details && "error" in details ? details.error : "failed";
    return { meta: [], error: typeof error === "string" ? error : "failed" };
  }
  switch (details.op) {
    case "join":
      return { meta: ["joined", `${details.cursor} cursor`] };
    case "read":
      return { meta: [`${details.records.length} record(s)`, details.more ? "more" : "caught up"] };
    case "post":
      return { meta: ["posted", `seq ${details.seq}`] };
    case "claim":
      return { meta: ["granted", details.holder] };
    case "release":
      return { meta: ["released"] };
    case "board":
      return {
        meta: [
          `${details.board.claims.length} claim(s)`,
          `${details.board.roster.length} member(s)`,
        ],
      };
    case "topics":
      return { meta: [`${details.topics.length} topic(s)`] };
    case "mute":
      return { meta: ["muted"] };
    case "unmute":
      return { meta: ["unmuted"] };
    case "tree":
      return { meta: [`${details.blocks.length} block(s)`] };
    case "zoom":
      return { meta: [`${details.children.length} child(ren)`] };
    case "recall":
      return { meta: [`${details.matches.length} match(es)`] };
  }
}

function waitResultSummary(details: WaitDetails | undefined): { meta: string[]; error?: string } {
  if (!details) return { meta: [] };
  if (!details.ok) return { meta: [], error: details.error ?? "failed" };
  // `outcome` is exhaustive over WaitOutcome; the trailing return keeps the function total even if
  // a future variant widens the union.
  switch (details.outcome) {
    case "event":
      if ("acquired" in details)
        return {
          meta: [details.acquired ? `acquired ${details.claim?.resource ?? ""}`.trim() : "event"],
        };
      if ("message" in details && details.message) return { meta: ["message"] };
      return { meta: ["event"] };
    case "timeout":
      return { meta: ["timeout"] };
    case "aborted":
      return { meta: ["aborted"] };
    default:
      return { meta: [] };
  }
}

/** The ANSI card shell: a status line, truncated to the render width, with optional body rows. */
function card(lines: readonly string[]): Component {
  return createCachedComponent(
    () => false,
    (width) => lines.map((line) => truncateToWidth(line, width, Ellipsis.Unicode)),
  );
}

export function renderRoomCall(
  args: RoomParams,
  _options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  return card([
    renderStatusLine(
      {
        iconOverride: theme.symbol(SYMBOL_KEY.room),
        title: "Room",
        description: roomCallSummary(args),
      },
      theme,
    ),
  ]);
}

export function renderRoomResult(
  result: AgentToolResult<RoomToolDetails>,
  _options: ToolRenderResultOptions,
  theme: Theme,
  args?: RoomParams,
): Component {
  const { meta, error } = roomResultSummary(result);
  const head = renderStatusLine(
    {
      iconOverride: theme.symbol(SYMBOL_KEY.room),
      title: "Room",
      description: args ? roomCallSummary(args) : undefined,
      ...(error ? { badge: { label: error, color: "error" as const } } : { meta }),
    },
    theme,
  );
  const body = meta.length > 0 ? [`  ${theme.fg("dim", meta.join(theme.sep.dot))}`] : [];
  return card([head, ...body]);
}

export function describeRoomCall(
  args: RoomParams,
  _options: ToolRenderResultOptions,
): NativeToolView | undefined {
  return {
    tool: { title: "Room", target: roomCallSummary(args), targetKind: "command" },
    head: toolHeadSpans("Room", roomCallSummary(args)),
  };
}

export function describeRoomResult(
  result: AgentToolResult<RoomToolDetails>,
  _options: ToolRenderResultOptions,
  args?: RoomParams,
): NativeToolView | undefined {
  const { meta, error } = roomResultSummary(result);
  return {
    head: toolHeadSpans("Room", args ? roomCallSummary(args) : undefined, ...meta),
    tone: error ? "error" : "neutral",
    body: error ? [text([span(error, "error")], { wrap: "word" })] : [],
  };
}

// The three wait tools share one card pair; names are scaffold-invented.
// K13 — typed, not `unknown`: the union of the three `details` payloads.
export type WaitDetails = WaitForAgentDetails | WaitForMessageDetails | WaitForClaimDetails; // [invented]

export function renderWaitCall(
  args: Record<string, unknown>,
  _options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  return card([
    renderStatusLine(
      {
        iconOverride: theme.symbol(SYMBOL_KEY.wait),
        title: "Wait",
        description: waitCallSummary(args),
      },
      theme,
    ),
  ]);
}

export function renderWaitResult(
  result: AgentToolResult<WaitDetails>,
  _options: ToolRenderResultOptions,
  theme: Theme,
  args?: Record<string, unknown>,
): Component {
  const { meta, error } = waitResultSummary(result.details);
  const head = renderStatusLine(
    {
      iconOverride: theme.symbol(SYMBOL_KEY.wait),
      title: "Wait",
      description: args ? waitCallSummary(args) : undefined,
      ...(error ? { badge: { label: error, color: "error" as const } } : { meta }),
    },
    theme,
  );
  const body = meta.length > 0 ? [`  ${theme.fg("dim", meta.join(theme.sep.dot))}`] : [];
  return card([head, ...body]);
}

export function describeWaitCall(
  args: Record<string, unknown>,
  _options: ToolRenderResultOptions,
): NativeToolView | undefined {
  return { head: toolHeadSpans("Wait", waitCallSummary(args)) };
}

export function describeWaitResult(
  result: AgentToolResult<WaitDetails>,
  _options: ToolRenderResultOptions,
  args?: Record<string, unknown>,
): NativeToolView | undefined {
  const { meta, error } = waitResultSummary(result.details);
  return {
    head: toolHeadSpans("Wait", args ? waitCallSummary(args) : undefined, ...meta),
    tone: error ? "error" : "neutral",
    body: error ? [text([span(error, "error")], { wrap: "word" })] : [],
  };
}

/** The card head spans: a bold title plus dim details (`compact` drops the empty ones). */
function toolHeadSpans(title: string, ...details: readonly (string | undefined)[]) {
  return compact([
    span(title, "toolTitle strong"),
    ...details
      .filter((detail): detail is string => !!detail)
      .map((detail) => span(` ${detail}`, "muted")),
  ]);
}
