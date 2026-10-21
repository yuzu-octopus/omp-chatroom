import { Ellipsis, replaceTabs, type Theme, truncateToWidth } from "@oh-my-pi/pi-tui";
import { safeRoomText } from "../onboarding/escape";

export interface BodyLinesOptions {
  indent: string;
  collapsedLines: number;
} // §7.4

/**
 * Quote-bordered message body preview, matching the native IRC card's anatomy
 * (`pi-tui/src/tools/wait.ts:487-510`, RISK R21 — that helper is module-private, so the room
 * carries its own copy of the documented behaviour).
 *
 * Every line is room-authored text, so it goes through `safeRoomText` (harness tags + the
 * `<room-authored>` region marker) before it is styled: a body can neither forge a harness block
 * nor close the region it is rendered inside.
 *
 * The width cap is the host's: `truncateToWidth(line, BODY_LINE_CHARS, Ellipsis.Unicode)` —
 * CELLS, not characters. The copy sliced the first 100 CHARACTERS, which is 200 cells for a CJK
 * line and 50 for a line of emoji: the row was then twice the width the cap promised, and the
 * card's own frame cut it back, so a wide-glyph body lost half its preview. The truncation also
 * runs BEFORE the escaping, so the cap can no longer cut a harness escape in half.
 *
 * One deliberate difference from the host: the host trims the line (`line.trim()`), the room does
 * not, because a room body is often a code block whose indentation is the content.
 */
export function bodyLines(
  body: string,
  expanded: boolean,
  theme: Theme,
  opts: BodyLinesOptions,
): string[] {
  const cap = expanded ? EXPANDED_BODY_LINES : opts.collapsedLines;
  const quote = theme.fg("dim", theme.md.quoteBorder);
  const all = body
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0) // native drops blank lines before counting
    .map(
      (line) =>
        `${opts.indent}${quote} ${theme.fg(
          "toolOutput",
          safeRoomText(replaceTabs(truncateToWidth(line, BODY_LINE_CHARS, Ellipsis.Unicode))),
        )}`,
    );
  if (all.length <= cap) return all;
  // The counter's "…" is TEXT — the same ellipsis character the host's own truncation paints
  // (`Ellipsis.Unicode` is a numeric strategy enum in the host, not a string).
  return [
    ...all.slice(0, cap),
    `${opts.indent}${quote} ${theme.fg("dim", `… +${all.length - cap} more lines`)}`,
  ];
}

export const COLLAPSED_QUOTE_LINES = 3; // §7.4 (3 collapsed / 12 expanded)
export const EXPANDED_BODY_LINES = 12; // §7.4
export const BODY_LINE_CHARS = 100; // §7.4
