/**
 * The host's chrome helpers (`@oh-my-pi/pi-tui/chrome/overlay-box`) read the HOST's `theme` module
 * singleton, which is *not* initialised under a plugin — the factory hands us a theme, but
 * `topBorderSplit`/`divider`/`bottomBorder` read their own binding. In the real TUI every one of
 * them throws `undefined is not an object (evaluating 'theme.boxRound')` and takes the panel with
 * it.
 *
 * Fix: install the injected theme on the host module BEFORE any chrome helper runs. The host exports
 * `setThemeInstance` for exactly this, so the panel stays a consumer of the host's own chrome and
 * the frame rows keep their host look.
 *
 * The roster strip used to be in the same position — `statusGlyph`/`statusText` from
 * `agent-hub-renderer` read the same singleton. It no longer is: roster-strip.ts paints the glyph
 * and the tone from the theme it is handed, so it cannot be killed by the host's initialisation
 * order and nothing imports `agent-hub-renderer` any more.
 */
import { theme as hostTheme, setThemeInstance } from "@oh-my-pi/pi-tui";

/**
 * Make the host chrome helpers see `theme`, but ONLY when they cannot see anything.
 *
 * Two readers, one theme. The panel draws its frame through the host's `topBorderSplit` /
 * `divider` / `bottomBorder`, which read the `theme` export of `pi-tui/theme` rather than the
 * theme the factory handed us. Under the plugin that binding can be uninitialised, in which case
 * each helper throws `undefined is not an object (evaluating 'theme.boxRound')` and takes the
 * panel with it.
 *
 * `setThemeInstance` is the host's own publish path (`theme = value` + `setActiveSymbolTheme` +
 * theme-change notify). It is deliberately NOT called when the host already has a live theme: it
 * also stops the host's theme-file watcher, so overwriting a healthy singleton would silently kill
 * the user's live theme reload for no gain. Empty host fills, healthy host is left alone.
 */
export function adoptHostTheme(theme: unknown): void {
  const usable = (t: unknown): t is Parameters<typeof setThemeInstance>[0] =>
    t !== undefined &&
    t !== null &&
    typeof t === "object" &&
    typeof (t as { fg?: unknown }).fg === "function";
  if (usable(hostTheme)) return;
  if (!usable(theme)) return;
  setThemeInstance(theme);
}

/** The box characters the host's `topBorderSplit`/`divider`/`bottomBorder` read from `boxRound`. */
export const BOX_ROUND = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  cross: "┼",
  teeDown: "┬",
  teeUp: "┴",
  teeRight: "├",
  teeLeft: "┤",
} as const;

/**
 * The theme's SYMBOL sets, verbatim from the host's own defaults
 * (`pi-tui/src/theme/symbols.ts:393-587`).
 *
 * The fallback must define EVERY key the panel reads, not just the ones a test happened to touch.
 * The roster strip reads `status.running`, `status.enabled`, `status.shadowed` and
 * `status.aborted` — the four the old shim left out — so under the fallback the presence strip
 * painted the literal "undefined" in the frame title: `theme.fg(tone, undefined)` is
 * `<colour>undefined<reset>`.
 */
const STATUS_SYMBOLS = {
  success: "✔",
  error: "✘",
  warning: "⚠",
  info: "ⓘ",
  pending: "⏳",
  disabled: "⦸",
  enabled: "●",
  running: "⟳",
  shadowed: "○",
  aborted: "⏹",
  done: "•",
} as const;

const NAV_SYMBOLS = {
  cursor: "❯",
  selected: "➤",
  expand: "▸",
  collapse: "▾",
  back: "⟵",
} as const;

const TREE_SYMBOLS = {
  branch: "├─",
  last: "└─",
  vertical: "│",
  horizontal: "─",
  hook: "└",
} as const;

const SEP_SYMBOLS = {
  powerline: "▕",
  powerlineThin: "┆",
  powerlineLeft: "▶",
  powerlineRight: "◀",
  powerlineThinLeft: ">",
  powerlineThinRight: "<",
  powerlineCapLeft: "",
  block: "▌",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: " · ",
  slash: " / ",
  pipe: " │ ",
} as const;

const MD_SYMBOLS = {
  quoteBorder: "▏",
  hrChar: "─",
  bullet: "•",
  colorSwatch: "■",
} as const;

const FORMAT_SYMBOLS = {
  bullet: "•",
  dash: "—",
  bracketLeft: "⟦",
  bracketRight: "⟧",
} as const;

/**
 * A last-ditch theme that satisfies EVERY member the panel and the host's chrome helpers actually
 * read. It must be COMPLETE, not merely present: the panel's frame rows are drawn by the host's
 * `topBorderSplit`/`divider`/`bottomBorder`, which read the *host's* theme singleton rather than
 * the theme object `resolveTheme` returns. A partial shim here renders the panel fine and still
 * kills it the moment `chrome.ts` asks the singleton for `boxRound` — which is exactly the second
 * half of the original bug, reachable whenever the host hands the factory a theme with no `fg`.
 *
 * Every member must match the host Theme's OWN TYPE, not just exist: `sep`, `nav`, `tree`, `status`
 * and `md` are string-valued getters (theme-class.ts:485-510) that consumers interpolate, so a
 * function there renders literally as "(text) => text" into the pane.
 */
export function uncolouredTheme(): Record<string, unknown> {
  const plain = (_tone: string, text: string): string => text;
  // `bold` is ONE argument in the host Theme (theme-class.ts), not two like `fg`. A shim written
  // as `bold: plain` passes the text as the tone and returns `undefined`, which paints the literal
  // "undefined" into every author cell — the same class of defect as the original shim, in the
  // member's ARITY rather than its presence.
  const strong = (text: string): string => text;
  return {
    fg: plain,
    bold: strong,
    // `styledSymbol(key, tone)` must return the TEXT unchanged, like `fg`. Returning the identity
    // function itself (the obvious-looking `styledSymbol: plain`) yields a function wherever a
    // caller interpolates the result, which renders as the literal "(text) => text" into the pane.
    // Only `tool.irc` is read by the card renderers; anything else falls back to a bullet rather
    // than throwing, so an unknown key degrades instead of killing the transcript.
    styledSymbol: (key: string, _tone: string): string => (key === "tool.irc" ? "✉" : "•"),
    sep: SEP_SYMBOLS,
    nav: NAV_SYMBOLS,
    tree: TREE_SYMBOLS,
    status: STATUS_SYMBOLS,
    md: MD_SYMBOLS,
    format: FORMAT_SYMBOLS,
    boxRound: BOX_ROUND,
    boxSharp: BOX_ROUND,
  };
}
