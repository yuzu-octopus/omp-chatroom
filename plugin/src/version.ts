// X6 — the installed host is 18.8.6 (verified in @oh-my-pi/pi-coding-agent/package.json).
// The pin mirrors package.json `peerDependencies`; tests/drift.test.ts asserts the two agree.
export const HOST_VERSION_PIN = "18.8.6";

// Every deep specifier the plugin imports (`[deep]` in the host map). The drift test imports each
// and asserts it resolves non-undefined. Four have an explicit barrel (`pi-coding-agent/internal-urls`,
// `pi-tui/chrome`, `pi-tui/render`, `pi-tui/tools`); the two highest-risk without one are
// `pi-tui/overlays/agent-hub-renderer` and `pi-coding-agent/session/harness-tags`.
//
// Option A only imports the first four; the rest are listed so a future Option B phase fails loudly
// on drift rather than at first use.
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

/**
 * Fail loudly when the host is not the version this plugin was written against.
 *
 * Every deep import in `DEEP_SPECIFIERS` is a wildcard-only path, not public API — a host bump can
 * move or remove one without a semver signal on the plugin side. Called from the drift test; also
 * safe to call at extension load if a future phase wants a runtime guard.
 *
 * @throws when `installed` is empty or differs from `HOST_VERSION_PIN`.
 */
export function assertHostVersion(installed: string): void {
  if (!installed) {
    throw new Error(
      `Host version unknown (got ${JSON.stringify(installed)}). Expected ${HOST_VERSION_PIN}.`,
    );
  }
  if (installed !== HOST_VERSION_PIN) {
    throw new Error(
      `Host version mismatch: installed ${installed}, expected ${HOST_VERSION_PIN}. ` +
        `The plugin imports ${DEEP_SPECIFIERS.length} wildcard-only subpaths; re-verify them ` +
        `before bumping HOST_VERSION_PIN (see AGENTS.md and PROBES.md).`,
    );
  }
}
