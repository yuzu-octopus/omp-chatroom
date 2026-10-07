import type { AgentRef } from "@oh-my-pi/pi-coding-agent";
import type { Theme } from "@oh-my-pi/pi-tui";
import { statusDot, statusGlyph, statusText } from "@oh-my-pi/pi-tui/overlays/agent-hub-renderer";

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
export function renderRosterStrip(refs: readonly AgentRef[], theme: Theme): string {
  void statusDot;
  const counts = statusCounts(refs);
  const parts: string[] = [];
  for (const status of ["running", "idle", "parked", "aborted"] as const) {
    const count = counts[status];
    if (count === 0) continue;
    parts.push(`${statusGlyph(status)} ${statusText(status, `${count} ${status}`)}`);
  }
  return parts.length === 0 ? theme.fg("dim", "no agents") : parts.join(theme.sep.dot);
}
