/**
 * Host chrome helpers (`@oh-my-pi/pi-tui/chrome/overlay-box`) and the roster helpers
 * (`@oh-my-pi/pi-tui/overlays/agent-hub-renderer`) all read the HOST's `theme` module singleton,
 * which is *not* initialised under a plugin — the factory hands us a theme, but those modules read
 * their own binding. In the real TUI every one of them throws
 * `undefined is not an object (evaluating 'theme.boxRound')` (or `theme.fg`, `theme.sep`, …) and
 * takes the panel with it.
 *
 * Fix: install the injected theme on the host module BEFORE any chrome/roster helper runs.
 * `@oh-my-pi/pi-tui` re-exports the theme setter for exactly this, so the panel stays a consumer of
 * the host's own chrome and the frame rows keep their host look.
 */
import { setActiveSymbolTheme } from "@oh-my-pi/pi-tui/theme/active-symbols";

/**
 * Make the host chrome/roster helpers see `theme`.
 *
 * `setActiveSymbolTheme` publishes the symbol set they read and keeps the `theme` export in step
 * (the host's own install path is `initTheme` → `assignTheme` → `setActiveSymbolTheme`). Passing the
 * theme we were handed re-syncs those modules to the one the host actually gave the factory.
 */
export function adoptHostTheme(theme: unknown): void {
  if (theme === undefined || theme === null || typeof theme !== "object") return;
  setActiveSymbolTheme(theme as Parameters<typeof setActiveSymbolTheme>[0]);
}
