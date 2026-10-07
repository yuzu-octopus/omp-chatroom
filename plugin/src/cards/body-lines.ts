import { replaceTabs, type Theme } from "@oh-my-pi/pi-tui";
import { safeRoomText } from "../onboarding/escape";

export interface BodyLinesOptions { indent: string; collapsedLines: number }   // §7.4

/**
 * Quote-bordered message body preview, matching the native IRC card's anatomy
 * (`pi-tui/src/tools/wait.ts:487-510`, RISK R21 — that helper is module-private, so the room
 * carries its own copy of the documented behaviour).
 *
 * Every line is room-authored text, so it goes through `safeRoomText` (harness tags + the
 * `<room-authored>` region marker) before it is styled: a body can neither forge a harness block
 * nor close the region it is rendered inside. `replaceTabs` runs first so the width cap counts
 * display cells, not a tab's single UTF-16 unit.
 */
export function bodyLines(body: string, expanded: boolean, theme: Theme, opts: BodyLinesOptions): string[] {
  const cap = expanded ? EXPANDED_BODY_LINES : opts.collapsedLines;
  const quote = theme.fg("dim", theme.md.quoteBorder);
  const all = body
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0)     // native drops blank lines before counting
    .map((line) =>
      `${opts.indent}${quote} ${theme.fg("toolOutput", safeRoomText(replaceTabs(line)).slice(0, BODY_LINE_CHARS))}`);
  if (all.length <= cap) return all;
  return [
    ...all.slice(0, cap),
    `${opts.indent}${quote} ${theme.fg("dim", `… +${all.length - cap} more lines`)}`,
  ];
}

export const COLLAPSED_QUOTE_LINES = 3;     // §7.4 (3 collapsed / 12 expanded)
export const EXPANDED_BODY_LINES = 12;      // §7.4
export const BODY_LINE_CHARS = 100;         // §7.4
