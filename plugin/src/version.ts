// X6 — the installed host is 18.12.3 (verified in @oh-my-pi/pi-coding-agent/package.json).
// The pin mirrors package.json `peerDependencies`; tests/drift.test.ts asserts the two agree.
export const HOST_VERSION_PIN = "18.12.3";

// Every deep specifier the plugin imports (`[deep]` in the host map) — source OR test. The drift
// test imports the store-critical four and asserts each resolves non-undefined; this list is the
// full set the plugin imports anywhere, kept in one place so a host bump has a single list to
// audit. Four have an explicit barrel (`pi-coding-agent/internal-urls`, `pi-tui/chrome`,
// `pi-tui/render`, `pi-tui/tools`); the two highest-risk without one are
// `pi-tui/theme/active-symbols` and `pi-coding-agent/session/harness-tags`.
//
// The first four are the store-critical surface; the rest are listed so a future phase fails loudly
// on drift rather than at first use. Two of the ten are imported by the TESTS only
// (`pi-coding-agent/internal-urls/local-protocol` and `pi-coding-agent/utils/event-bus`): no
// source file imports them, but they are still subpaths the plugin resolves, so they belong in the
// list a host bump is audited against.
//
// `@oh-my-pi/pi-tui/overlays/agent-hub-renderer` used to be here — `statusGlyph`/`statusText` read
// the host `theme` singleton and took the panel down with it. The roster strip now paints from the
// theme it is handed (roster-strip.ts), so nothing imports it and listing it would gate a
// dependency the plugin does not have. Ten, not eleven.
//
// `@oh-my-pi/pi-tui/theme/active-symbols` is the tenth: it is the host's own lookup for the
// ACTIVE symbol set (unicode / nerd / ascii), which the plugin's theme shim reads — and snapshots
// at construction — instead of carrying a copy of the host's symbol tables.
//
// The theme ladder's other half — the host's own way to fill the pi-tui module singleton with a
// REAL theme (`initThemeSync`, with the user's symbol-preset override and colour-blind mode) and
// to read the override back (`getSymbolPresetOverride`) — needs NO pin: all of them are exports of
// the `@oh-my-pi/pi-tui` barrel the plugin already imports. Still ten, not eleven.
export const DEEP_SPECIFIERS: readonly string[] = [
  "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol",
  "@oh-my-pi/pi-coding-agent/registry/agent-registry",
  "@oh-my-pi/pi-coding-agent/session/harness-tags",
  "@oh-my-pi/pi-coding-agent/utils/event-bus",
  "@oh-my-pi/pi-tui/chat/messages",
  "@oh-my-pi/pi-tui/chrome/overlay-box",
  "@oh-my-pi/pi-tui/render/render-utils",
  "@oh-my-pi/pi-tui/render/status-line",
  "@oh-my-pi/pi-tui/theme/active-symbols",
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
