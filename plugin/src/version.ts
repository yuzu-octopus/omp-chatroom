// X6 — the installed host is 18.7.0 (verified in @oh-my-pi/pi-coding-agent/package.json).
// The pin mirrors package.json `peerDependencies`; tests/drift.test.ts asserts the two agree.
export const HOST_VERSION_PIN = "18.7.0";

// Every deep specifier the plugin imports (`[deep]` in the host map). The drift test imports each
// and asserts it resolves non-undefined. Four have an explicit barrel (`pi-coding-agent/internal-urls`,
// `pi-tui/chrome`, `pi-tui/render`, `pi-tui/tools`); the two highest-risk without one are
// `pi-tui/overlays/agent-hub-renderer` and `pi-coding-agent/session/harness-tags`.
export const DEEP_SPECIFIERS: readonly string[] = [
  "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol",
  "@oh-my-pi/pi-coding-agent/registry/agent-registry",
  "@oh-my-pi/pi-coding-agent/session/harness-tags",
  "@oh-my-pi/pi-coding-agent/utils/event-bus",
  "@oh-my-pi/pi-tui/chat/messages",
  "@oh-my-pi/pi-tui/chrome/overlay-box",
  "@oh-my-pi/pi-tui/overlays/agent-hub-renderer",
  "@oh-my-pi/pi-tui/render/render-utils",
  "@oh-my-pi/pi-tui/render/status-line",
  "@oh-my-pi/pi-tui/tools/renderer",
];

// Throws when `installed !== HOST_VERSION_PIN`; the drift test calls it and asserts it does not throw.
export function assertHostVersion(installed: string): void {
  throw new Error("not implemented");
}
