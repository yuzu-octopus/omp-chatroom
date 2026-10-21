import type { AgentRef } from "@oh-my-pi/pi-coding-agent";
import { type Theme, type ThemeColor, visibleWidth } from "@oh-my-pi/pi-tui";

export interface StatusCounts {
  running: number;
  idle: number;
  parked: number;
  aborted: number;
}

/** §6.5 — presence counts over the live registry (the same shape agent-hub keeps internally). */
export function statusCounts(refs: readonly AgentRef[]): StatusCounts {
  const counts: StatusCounts = { running: 0, idle: 0, parked: 0, aborted: 0 };
  for (const ref of refs) counts[ref.status] += 1;
  return counts;
}

/**
 * §6.5 — the one-line presence strip rendered into the frame header. Reuses the hub's own
 * glyph/colour vocabulary (`statusGlyph`/`statusText`) so the panel speaks the same language.
 * `statusDot` is asserted alongside them by the drift test; it stays part of this surface's
 * verified host contract.
 */
/** Tone per host roster conventions (`agent-hub-renderer.ts` STATUS_TONE). */
const STATUS_TONE = {
  running: "accent",
  idle: "success",
  parked: "muted",
  aborted: "error",
} as const satisfies Record<string, ThemeColor>;

/**
 * Roster status → the theme status GLYPH key. The two differ for `idle`/`parked`: the theme names
 * them `enabled` and `shadowed`.
 */
const STATUS_KEY = {
  running: "running",
  idle: "enabled",
  parked: "shadowed",
  aborted: "aborted",
} as const satisfies Record<string, keyof Theme["status"]>;

/** The strip's group order — the host's own roster order (`agent-hub-renderer.ts`, STATUS_TONE). */
const GROUP_ORDER = ["running", "idle", "parked", "aborted"] as const;
type GroupStatus = (typeof GROUP_ORDER)[number];

/**
 * §6.5 — the one-line presence strip.
 *
 * `maxWidth` is the room the strip actually has. The strip lives in the frame TITLE, and the host
 * truncates a title to the border segment it sits in (`pi-tui/src/chrome/overlay-box.ts`,
 * `topBorderSplit`: `truncateToWidth(" " + title + " ", leftLen - 1)`), so a strip that is wider
 * than the title's segment loses its TAIL — the "aborted" count, or worse, half a group.
 *
 * So the strip DROPS WHOLE GROUPS instead of being cut mid-word, and reports what it dropped with
 * the host's own "+N more" convention (`pi-tui/src/overlays/usage-dashboard.ts:851`). A count that
 * does not fit is worth less than a count that is honest about what it left out.
 *
 * The budget is MEASURED, not assumed: every candidate strip is measured with `visibleWidth`
 * before it is returned. That matters because the status glyph's cell width belongs to the user's
 * active symbol set — the ascii set paints "[!!]" (four cells) where the unicode set paints one —
 * so a wider glyph costs a group, never a half-painted one.
 */
export function renderRosterStrip(
  refs: readonly AgentRef[],
  theme: Theme,
  maxWidth = Number.POSITIVE_INFINITY,
): string {
  const counts = statusCounts(refs);
  const groups = GROUP_ORDER.filter((status) => counts[status] > 0);
  if (maxWidth <= 0) return "";
  if (groups.length === 0) {
    const empty = theme.fg("dim", "no agents");
    return visibleWidth(empty) <= maxWidth ? empty : "";
  }
  // The glyph and the tone both come from `theme`. Nothing from `agent-hub-renderer` is used
  // here: both of its helpers read the HOST's theme singleton, which is uninitialised under the
  // plugin, so either one killed the panel with "undefined is not an object (evaluating
  // 'theme.fg')". Rendering locally is the only version that survives.
  const render = (kept: readonly GroupStatus[], tail?: string): string => {
    const parts = kept.map((status) => {
      const symbol = theme.status[STATUS_KEY[status]];
      const tone = STATUS_TONE[status];
      return `${theme.fg(tone, symbol)} ${theme.fg(tone, `${counts[status]} ${status}`)}`;
    });
    if (tail !== undefined) parts.push(theme.fg("dim", tail));
    return parts.join(theme.sep.dot);
  };
  // Keep as many WHOLE groups as fit. Each candidate is rendered with the tail that reports what
  // it left out, so the reader is never told a partial count. The tail loses its word before the
  // strip loses a group: "+3 more" is the host's shape, "+3" is what fits when it does not.
  for (let keep = groups.length; keep >= 1; keep--) {
    const candidate = groups.slice(0, keep);
    const lost = groups.slice(keep).reduce((sum, status) => sum + counts[status], 0);
    const tails: (string | undefined)[] = lost > 0 ? [`+${lost} more`, `+${lost}`] : [undefined];
    for (const tail of tails) {
      const strip = render(candidate, tail);
      if (visibleWidth(strip) <= maxWidth) return strip;
    }
  }
  // Even one group does not fit: the presence strip is dropped rather than cut mid-group.
  const single = render(groups.slice(0, 1), undefined);
  return visibleWidth(single) <= maxWidth ? single : "";
}
