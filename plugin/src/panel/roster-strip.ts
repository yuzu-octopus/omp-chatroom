import type { AgentRef } from "@oh-my-pi/pi-coding-agent";
import { statusDot, statusGlyph, statusText } from "@oh-my-pi/pi-tui/overlays/agent-hub-renderer";
import type { Theme } from "@oh-my-pi/pi-tui";
export interface StatusCounts { running: number; idle: number; parked: number; aborted: number }  // [invented]

export function statusCounts(refs: readonly AgentRef[]): StatusCounts {
  throw new Error("not implemented");
}
export function renderRosterStrip(refs: readonly AgentRef[], theme: Theme): string {
  throw new Error("not implemented");
}
