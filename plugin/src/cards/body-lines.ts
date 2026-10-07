import { replaceTabs, type Theme } from "@oh-my-pi/pi-tui";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
export interface BodyLinesOptions { indent: string; collapsedLines: number }   // §7.4

export function bodyLines(body: string, expanded: boolean, theme: Theme, opts: BodyLinesOptions): string[] {
  throw new Error("not implemented");
}

export const COLLAPSED_QUOTE_LINES = 3;     // §7.4 (3 collapsed / 12 expanded)
export const EXPANDED_BODY_LINES = 12;      // §7.4
export const BODY_LINE_CHARS = 100;         // §7.4
