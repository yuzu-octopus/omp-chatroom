import type { AgentToolResult, ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import {
  type Component,
  Ellipsis,
  type SymbolKey,
  span,
  type Theme,
  text,
  truncateToWidth,
} from "@oh-my-pi/pi-tui"; // TSP builders (native/describe)
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import type { NativeToolHead, NativeToolView } from "@oh-my-pi/pi-tui/tools/renderer";
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

/**
 * The card icon, STYLED — every host tool passes an already-styled override.
 *
 * `renderStatusLine` paints `iconOverride` verbatim; it only applies a tone on the `icon` ENUM
 * path (`pi-tui/src/render/status-line.ts:34-35`). So `theme.symbol(key)` put a bare glyph on the
 * row, and the room/wait cards were the only tool icons in the transcript with no colour at all.
 * `theme.styledSymbol` is the host's own lookup-then-paint (`pi-tui/src/theme/theme-class.ts:527`),
 * the one `pi-tui/src/tools/ask.ts:682` and its siblings use.
 */
function styledIcon(key: SymbolKey, theme: Theme): string {
  return theme.styledSymbol(key, "accent");
}

/** One-line, ANSI-free summary of the arguments — shared by both backends. */
function roomCallSummary(raw: unknown): string {
  // Narrowed here, not in the signature: the hook receives raw pre-validation args, and Bun's
  // checker resolves the host's `Static<TParams>` for a runtime schema stub to `unknown`.
  const args = (raw ?? {}) as RoomParams;
  const target =
    args.op === "claim" || args.op === "release"
      ? [args.topic, args.key].filter(Boolean).join("/")
      : args.topic;
  return [args.op, target, args.limit !== undefined ? `limit ${args.limit}` : undefined]
    .filter((part): part is string => !!part)
    .join(" ");
}

/**
 * The call's one-line summary, from the RAW args the host hands a renderer.
 *
 * `unknown`, not `Record<string, unknown>`: a render hook receives pre-validation arguments (the
 * host documents `lenientArgValidation` and passes raw values), and Bun's checker resolves the
 * generic `Static<TParams>` for the runtime schema stub to `unknown`, so a narrower parameter
 * would not be assignable to the hook it is registered as. Narrowing happens here instead.
 */
function waitCallSummary(raw: unknown): string {
  const args = (raw ?? {}) as Record<string, unknown>;
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
  args: unknown,
  _options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  return card([
    renderStatusLine(
      {
        iconOverride: styledIcon(SYMBOL_KEY.room, theme),
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
  args?: unknown,
): Component {
  const { meta, error } = roomResultSummary(result);
  // ONE row: the head carries the facts, a body row carries CONTENT. The status line is the only
  // place this card's meta is painted (`pi-tui/src/render/status-line.ts:50`), and the card used
  // to pass `meta` there AND join the same list into a second row — so every settled card printed
  // its facts twice.
  return card([
    renderStatusLine(
      {
        iconOverride: styledIcon(SYMBOL_KEY.room, theme),
        title: "Room",
        description: args ? roomCallSummary(args) : undefined,
        ...(error ? { badge: { label: error, color: "error" as const } } : { meta }),
      },
      theme,
    ),
  ]);
}

/**
 * The native (TSP) head data — and the ONE place a result's facts may live.
 *
 * The host merges a call with its result by keeping the CALL's `head` and spreading only the
 * RESULT's `tool` over the call's (`pi-tui/src/chat/tool-execution.ts:1555-1564`, the `head:` line
 * at `:1557` and the `tool:` spread at `:1556`). A count put in `head` — where these describe hooks
 * used to put it — was discarded the moment the result landed, so the settled card read exactly
 * like the pending one. `tool.meta` survives the spread, and the fallback card derives its spans
 * from `tool` when `head` is absent (`:1440-1451`), so the facts reach both native hosts.
 */
function nativeTool(
  title: string,
  target: string | undefined,
  meta: readonly string[] = [],
  error?: string,
): NativeToolHead {
  return {
    title,
    ...(target !== undefined ? { target } : {}),
    targetKind: "command",
    ...(meta.length > 0 ? { meta } : {}),
    // A one-word state note: the host draws it beside the head in BOTH native layouts
    // (`pi-tui/src/chat/tool-execution.ts:1422`, `:1454-1459`).
    ...(error ? { note: error } : {}),
  };
}

export function describeRoomCall(
  args: unknown,
  _options: ToolRenderResultOptions,
): NativeToolView | undefined {
  return { tool: nativeTool("Room", roomCallSummary(args)) };
}

export function describeRoomResult(
  result: AgentToolResult<RoomToolDetails>,
  _options: ToolRenderResultOptions,
  args?: unknown,
): NativeToolView | undefined {
  const { meta, error } = roomResultSummary(result);
  return {
    tool: nativeTool("Room", args ? roomCallSummary(args) : undefined, meta, error),
    tone: error ? "error" : "neutral",
    body: error ? [text([span(error, "error")], { wrap: "word" })] : [],
  };
}

// The three wait tools share one card pair; names are scaffold-invented.
// K13 — typed, not `unknown`: the union of the three `details` payloads.
export type WaitDetails = WaitForAgentDetails | WaitForMessageDetails | WaitForClaimDetails; // [invented]

export function renderWaitCall(
  args: unknown,
  _options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  return card([
    renderStatusLine(
      {
        iconOverride: styledIcon(SYMBOL_KEY.wait, theme),
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
  args?: unknown,
): Component {
  const { meta, error } = waitResultSummary(result.details);
  // One row, for the reason renderRoomResult documents: head-only meta, never a second copy.
  return card([
    renderStatusLine(
      {
        iconOverride: styledIcon(SYMBOL_KEY.wait, theme),
        title: "Wait",
        description: args ? waitCallSummary(args) : undefined,
        ...(error ? { badge: { label: error, color: "error" as const } } : { meta }),
      },
      theme,
    ),
  ]);
}

export function describeWaitCall(
  args: unknown,
  _options: ToolRenderResultOptions,
): NativeToolView | undefined {
  return { tool: nativeTool("Wait", waitCallSummary(args)) };
}

export function describeWaitResult(
  result: AgentToolResult<WaitDetails>,
  _options: ToolRenderResultOptions,
  args?: unknown,
): NativeToolView | undefined {
  const { meta, error } = waitResultSummary(result.details);
  return {
    tool: nativeTool("Wait", args ? waitCallSummary(args) : undefined, meta, error),
    tone: error ? "error" : "neutral",
    body: error ? [text([span(error, "error")], { wrap: "word" })] : [],
  };
}
