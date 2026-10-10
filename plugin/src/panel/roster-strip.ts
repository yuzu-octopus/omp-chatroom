import type { AgentRef } from "@oh-my-pi/pi-coding-agent";
import type { Theme, ThemeColor } from "@oh-my-pi/pi-tui";

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

export function renderRosterStrip(refs: readonly AgentRef[], theme: Theme): string {
  const counts = statusCounts(refs);
  const parts: string[] = [];
  for (const status of ["running", "idle", "parked", "aborted"] as const) {
    const count = counts[status];
    if (count === 0) continue;
    // The glyph and the tone both come from `theme`. Nothing from `agent-hub-renderer` is used
    // here: both of its helpers read the HOST's theme singleton, which is uninitialised under the
    // plugin, so either one killed the panel with "undefined is not an object (evaluating
    // 'theme.fg')". Rendering locally is the only version that survives.
    const symbol = theme.status[STATUS_KEY[status]];
    const tone = STATUS_TONE[status];
    parts.push(`${theme.fg(tone, symbol)} ${theme.fg(tone, `${count} ${status}`)}`);
  }
  return parts.length === 0 ? theme.fg("dim", "no agents") : parts.join(theme.sep.dot);
}
