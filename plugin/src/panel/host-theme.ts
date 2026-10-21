/**
 * The host's chrome helpers (`@oh-my-pi/pi-tui/chrome/overlay-box`) read the HOST's `theme` module
 * singleton, which is *not* initialised under a plugin — the factory hands us a theme, but
 * `topBorderSplit`/`divider`/`bottomBorder` read their own binding. In the real TUI every one of
 * them throws `undefined is not an object (evaluating 'theme.boxRound')` and takes the panel with
 * it.
 *
 * Fix: install a theme on the host module BEFORE any chrome helper runs. The host exports
 * `setThemeInstance` for exactly this, so the panel stays a consumer of the host's own chrome and
 * the frame rows keep their host look.
 *
 * The panel's own last-ditch theme (`uncolouredTheme`) is a hand-rolled shim, NOT a host theme:
 * publishing one used to throw INSIDE the host's theme-change listener (`theme.getSymbolPreset is
 * not a function`, `pi-coding-agent/src/modes/interactive-mode.ts:2745`), and the error propagated
 * out of the panel factory, where the host turns it into a one-line "Room panel unavailable"
 * notify. So the panel asks the HOST for a real theme first (panel.ts: `hostRealTheme`); the
 * shim is the panel's own painting, and it reaches the host's singleton only when the host holds
 * NOTHING usable at all — through `adoptHostTheme`, which restores the host's symbol mirror in a
 * `finally`, so the host's own UI never reads a fallback.
 *
 * WHY THE SHIM IS PUBLISHED AT ALL (and what that costs). The panel's frame rows are drawn by the
 * host's own chrome helpers (`pi-tui/src/chrome/overlay-box.ts`: `topBorderSplit`, `divider`,
 * `bottomBorder`, `row`), and those read the HOST's `theme` singleton — `const box = theme.boxRound`
 * — not the theme the factory handed the panel. A panel whose frame is drawn from a theme the
 * singleton does not hold dies on the first frame with "undefined is not an object (evaluating
 * 'theme.boxRound')". So the fallback HAS to reach the singleton.
 *
 * And that is the whole of the risk: in production the plugin and the host share ONE
 * `@oh-my-pi/pi-tui` module instance — omp's extension loader rewrites every `@oh-my-pi/pi-*`
 * specifier an extension imports onto the host's in-process modules
 * (`pi-coding-agent/src/extensibility/plugins/legacy-pi-compat.ts`, `LEGACY_PI_SPECIFIER_FILTER`),
 * so `setThemeInstance` here publishes into the HOST's live singleton. The host then reads
 * members off it — the status line (`getColorHex`, `getFgAnsi`, `getBgAnsi`), the git app
 * (`getBgHex`), the diff pane (`getColorHex`), `chat/assistant-message.ts` (`getColorMode`,
 * `getAccentColorHex`), the spinners (`spinnerFrames`), the session accent
 * (`getAllThemeColorHexes`, `getMajorThemeColorHexes`, `statusLineLuminance`,
 * `accentSurfaceLuminance`) — and a member that does not exist is a HOST-WIDE crash on the next
 * frame. So the fallback is COMPLETE: it answers every public member of the host's `Theme` class
 * (`pi-tui/src/theme/theme-class.ts`), each with a colour-less but well-formed value. A missing
 * member is not "one more thing to add later" — it is the next frame's crash.
 *
 * The values are colour-less on purpose: the fallback paints no colour at all, so a colour it
 * invented would be a WRONG colour, and the host's own hex helpers (`hexToRgb`, `mixHex`,
 * `colorLuma`) would then compute on it. Where a hex is unavoidable the fallback answers with the
 * host's OWN value for an unset token (`#e5e5e7` for a foreground, `#000000` for a background),
 * which is what the host's own `getColorHex` returns when the token is missing.
 *
 * The roster strip used to be in the same position — `statusGlyph`/`statusText` from
 * `agent-hub-renderer` read the same singleton. It no longer is: roster-strip.ts paints the glyph
 * and the tone from the theme it is handed, so it cannot be killed by the host's initialisation
 * order and nothing imports `agent-hub-renderer` any more.
 */
import {
  getColorBlindMode,
  getCurrentThemeName,
  getSymbolPresetOverride,
  theme as hostTheme,
  initThemeSync,
  type SymbolKey,
  type SymbolPreset,
  setThemeInstance,
  type Theme,
} from "@oh-my-pi/pi-tui";
import { activeThemeSymbol, setActiveSymbolTheme } from "@oh-my-pi/pi-tui/theme/active-symbols";

/**
 * Every fallback this module handed out.
 *
 * The host's symbol mirror must never be left pointing at one of them: the mirror is what the
 * host's own key hints read (`pi-tui/src/key-hint-format.ts`), so a mirror left on a fallback
 * paints the fallback's glyphs into the host's UI for the rest of the session.
 */
const FALLBACKS = new WeakSet<object>();

/**
 * A theme with a working `fg` — the only member the panel's own code calls, and the shape the
 * host's chrome helpers need from the singleton (`theme.fg`, `theme.bold`, `theme.boxRound`).
 *
 * The host's singleton is typed `Theme` but is `undefined` until the host initialises it, and a
 * half-built theme can reach it, so the shape is checked at runtime.
 */
export function isUsableTheme(value: unknown): value is Theme {
  if (value === undefined || value === null || typeof value !== "object") return false;
  if (!("fg" in value)) return false;
  return typeof value.fg === "function";
}

/**
 * The host's own theme initialiser — `initThemeSync` from the `@oh-my-pi/pi-tui` barrel.
 *
 * It is a NAMED type because `hostRealTheme` takes it as a parameter: the guard around the host's
 * call (the try/catch that keeps the last-resort branch reachable) can only be exercised by
 * making the host's initialiser fail, and the host offers no way to break its own loader from
 * outside. Everything else on that path — the singleton, the publish, the fallback — is the real
 * one.
 */
export type HostThemeInit = (
  symbolPreset?: SymbolPreset,
  colorBlindMode?: boolean,
  darkTheme?: string,
  lightTheme?: string,
) => void;

/**
 * The HOST's own theme, built with the USER's settings — the second step of the theme ladder.
 *
 * `ensureThemeSync()` (what this ladder used to call) fills the module singleton when it is
 * empty, but it fills it with the DEFAULT settings: `initThemeSync()` runs
 * `configureTheme(undefined)`, which sets `currentSymbolPresetOverride = undefined` and
 * `currentColorBlindMode = false`. That WIPES the user's symbol-preset override — the user chose
 * "ascii", and the degraded path silently switched the panel back to the unicode set — and the
 * theme it builds carries the DEFAULT preset rather than the user's.
 *
 * `initThemeSync(preset, colorBlind)` is the host's own way to build a theme with the user's
 * settings: it PRESERVES the override (`currentSymbolPresetOverride = preset`, and the theme is
 * built with `symbolPresetOverride: preset`), so the degraded path paints the user's set and the
 * user's override survives it.
 *
 * The theme NAME: `configureTheme` also sets `currentThemeName` to the auto theme ("dark" or
 * "light"), so a plain `initThemeSync` would REPLACE the user's chosen theme with the default one
 * and then report the default as their theme. The name is therefore handed back in as the auto
 * theme's name — `initThemeSync(preset, colorBlind, name, name)` — so the host loads the USER'S
 * theme and keeps naming it. With no name to keep (the host never named one) the host's defaults
 * are used, exactly as `ensureThemeSync` would have used them.
 *
 * The call is guarded: the host's own `initThemeSync` has its `loadThemeSync("dark", …)` fallback
 * OUTSIDE its try/catch (`pi-tui/src/theme/theme.ts`), so a loader broken enough for BOTH loads to
 * fail THROWS out of it. Unguarded, that throw would leave `resolveTheme` — and with it the whole
 * panel — dead, and the last-resort branch unreachable.
 *
 * A healthy singleton is left alone: the host's theme is the user's, with the user's name, the
 * user's colours and the user's watcher.
 */
export function hostRealTheme(init: HostThemeInit = initThemeSync): Theme | undefined {
  const singleton: Theme | undefined = hostTheme;
  if (isUsableTheme(singleton)) return singleton;
  const preset = getSymbolPresetOverride();
  const colorBlind = getColorBlindMode();
  const name = getCurrentThemeName();
  // "<in-memory>" is the name the host gives a theme that was PUBLISHED rather than loaded (the
  // plugin's own publish path sets it), and it is not a theme file: it cannot be loaded back.
  const keep = name === undefined || name === "" || name === "<in-memory>" ? undefined : name;
  try {
    init(preset, colorBlind, keep, keep);
  } catch {
    // The host's theme loader is broken. The last-resort branch is the answer now.
    return undefined;
  }
  return isUsableTheme(hostTheme) ? hostTheme : undefined;
}

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
 *
 * The publish path also MIRRORS the published theme into the host's symbol lookup
 * (`theme/active-symbols`). A mirror left pointing at one of OUR fallbacks would make the host's
 * own key hints read the fallback's glyphs, so the mirror is restored in a `finally` — to the
 * host's own theme when there is one, otherwise to `undefined`, the host's documented pre-theme
 * behaviour (its ascii preset). ONLY a fallback publish needs that restore: a real theme's own
 * symbols are the ones the user chose, and restoring the previous theme over them would reset the
 * user's symbol set to the ascii preset.
 */
export function adoptHostTheme(theme: unknown): void {
  if (isUsableTheme(hostTheme)) return;
  if (!isUsableTheme(theme)) return;
  // `hostTheme` is a LIVE ESM binding: after `setThemeInstance` it points at the newly published
  // theme, so the PREVIOUS one is captured BEFORE publishing.
  const previous = hostTheme;
  const isFallback = FALLBACKS.has(theme);
  try {
    setThemeInstance(theme);
  } catch {
    // The host's theme-change listener runs SYNCHRONOUSLY inside the publish
    // (`notifyThemeChange`), and a listener that throws would take the panel down with it: the
    // error propagates out of `setThemeInstance`, out of the panel factory, and into the host's
    // one-line "Room panel unavailable" notify. The theme itself IS assigned before the notify
    // (`assignTheme` runs first), so the publish succeeded — only the LISTENER failed, and that
    // is the host's problem, not the panel's. A panel that renders uncoloured beats a panel that
    // does not render.
  } finally {
    if (isFallback) setActiveSymbolTheme(isHostTheme(previous) ? previous : undefined);
  }
}

/**
 * A theme the host's symbol mirror may point at: a real theme with a callable `symbol`.
 *
 * The host's singleton is typed `Theme` but is `undefined` until the host initialises it, and a
 * half-built theme can reach it, so the shape is checked at runtime. One of OUR fallbacks is not
 * one: the mirror must never be left on a fallback, so the restore above treats it as "no theme".
 */
function isHostTheme(value: Theme | undefined): value is Theme {
  if (value === undefined || value === null || typeof value !== "object") return false;
  if (FALLBACKS.has(value)) return false;
  if (!("symbol" in value)) return false;
  return typeof value.symbol === "function";
}

/**
 * The fallback's marker for a key the host has no glyph for — never a painted glyph.
 */
const MISSING_SYMBOL = "?";

/**
 * ONE live lookup, guarded.
 *
 * The mirror can hold a half-built theme — the host hands one out while it is still initialising —
 * and its `symbol` may not be a function at all. An unguarded lookup would throw out of the
 * fallback's construction and take the panel with it.
 */
function activeSymbol(key: SymbolKey): string | undefined {
  try {
    const glyph = activeThemeSymbol(key);
    // An EMPTY glyph is a glyph the host itself has (a theme can blank a symbol out) — it is kept,
    // so the fallback mirrors the host exactly. Only a key the host does not have at all is
    // missing.
    return typeof glyph === "string" ? glyph : undefined;
  } catch {
    // A mirror that cannot answer has no glyph to give.
    return undefined;
  }
}

/**
 * The fallback's symbol SNAPSHOT: the glyphs the host's active symbol set resolves to RIGHT NOW.
 *
 * The fallback's own lookups read this map instead of the host's live lookup, and that is what
 * makes the mirror→fallback path FINITE. The host's publish path mirrors the published theme into
 * `theme/active-symbols`, so a mirror left pointing at a fallback makes the fallback's `symbol()`
 * ask the mirror, which asks the fallback again — until the stack overflows (`Maximum call stack
 * size exceeded`, in the plugin's cards AND in the host's own `formatKeyHint`, which poisons the
 * host's key hints for the rest of the session). A snapshot cannot cycle: the fallback answers
 * from its own map, so the host's key-hint path (mirror → fallback) resolves to a real glyph.
 *
 * The snapshot is also what keeps the fallback's TABLES and its `symbol()` in agreement: both read
 * the same map, so the panel can never paint one glyph from a table and another from the lookup.
 */
function captureSymbols(keys: readonly SymbolKey[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    const glyph = activeSymbol(key);
    if (glyph !== undefined) snapshot[key] = glyph;
  }
  return snapshot;
}

/**
 * A symbol table whose members come from the SNAPSHOT: each one is the glyph the host's active
 * symbol set had when the fallback was built.
 *
 * The host's own `Theme` rebuilds its tables on every access (`get status()`, theme-class.ts), and
 * the reason the fallback does NOT is the cycle above: a live table asks the mirror, and the
 * mirror can be the fallback. The snapshot trades "follows the user's symbol set" for "can never
 * recurse and can never disagree with `symbol()`" — and the fallback is the LAST resort anyway,
 * reached only when the host has no usable theme to follow.
 */
function snapshotTable<K extends string>(
  keys: Readonly<Record<K, SymbolKey>>,
  snapshot: Readonly<Record<string, string | undefined>>,
): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const name of Object.keys(keys) as K[]) {
    const key = keys[name];
    Object.defineProperty(table, name, {
      enumerable: true,
      get: () => snapshot[key] ?? MISSING_SYMBOL,
    });
  }
  return table;
}

/**
 * A symbol table whose members are LIVE: each one resolves through the host's own lookup, at
 * access time.
 */
function liveTable<K extends string>(keys: Readonly<Record<K, SymbolKey>>): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const name of Object.keys(keys) as K[]) {
    const key = keys[name];
    Object.defineProperty(table, name, {
      enumerable: true,
      get: () => activeSymbol(key) ?? MISSING_SYMBOL,
    });
  }
  return table;
}

/** The symbol keys of one bucket — `prefix.name` for each name in it. */
function bucketKeys(prefix: string, names: readonly string[]): Record<string, SymbolKey> {
  return Object.fromEntries(names.map((name) => [name, `${prefix}.${name}` as SymbolKey]));
}

const STATUS_NAMES = [
  "success",
  "error",
  "warning",
  "info",
  "pending",
  "disabled",
  "enabled",
  "running",
  "shadowed",
  "aborted",
  "done",
] as const;
const NAV_NAMES = ["cursor", "selected", "expand", "collapse", "back"] as const;
const TREE_NAMES = ["branch", "last", "vertical", "horizontal", "hook"] as const;
const SEP_NAMES = [
  "powerline",
  "powerlineThin",
  "powerlineLeft",
  "powerlineRight",
  "powerlineThinLeft",
  "powerlineThinRight",
  "powerlineCapLeft",
  "block",
  "space",
  "asciiLeft",
  "asciiRight",
  "dot",
  "slash",
  "pipe",
] as const;
const MD_NAMES = ["quoteBorder", "hrChar", "bullet", "colorSwatch"] as const;
const FORMAT_NAMES = ["bullet", "dash", "bracketLeft", "bracketRight"] as const;
/**
 * The tool symbols the CARDS read. The host's `Theme` exposes the tool symbols only through
 * `symbol()` (it has no `tool` table), but the fallback gives them a table too, so a card that
 * reads `theme.tool.irc` resolves exactly like one that reads `theme.symbol("tool.irc")`.
 *
 * `tool.irc` is the envelope on EVERY message card — the key an earlier scanner missed, because it
 * matched `symbol("…")` but not `styledSymbol("…")`.
 */
const TOOL_NAMES = ["irc"] as const;

/**
 * The rounded box's members — the host's `boxRound.*`, with the JUNCTIONS borrowed from
 * `boxSharp.*`.
 *
 * The host reads `theme.boxRound` for the frame it draws around the panel, so the fallback's box
 * is a theme value too — the same way the host's own `get boxRound()` builds it: the rounded
 * corners/edges from `boxRound.*`, and the junctions (`cross`, the four tees) from `boxSharp.*`,
 * because a rounded box has no rounded junction glyph.
 */
const BOX_ROUND_KEYS = {
  topLeft: "boxRound.topLeft",
  topRight: "boxRound.topRight",
  bottomLeft: "boxRound.bottomLeft",
  bottomRight: "boxRound.bottomRight",
  horizontal: "boxRound.horizontal",
  vertical: "boxRound.vertical",
  cross: "boxSharp.cross",
  teeDown: "boxSharp.teeDown",
  teeUp: "boxSharp.teeUp",
  teeRight: "boxSharp.teeRight",
  teeLeft: "boxSharp.teeLeft",
} as const satisfies Record<string, SymbolKey>;

/** The sharp box's members — the host's own `boxSharp.*` set, the fallback's second box style. */
const BOX_SHARP_KEYS = {
  topLeft: "boxSharp.topLeft",
  topRight: "boxSharp.topRight",
  bottomLeft: "boxSharp.bottomLeft",
  bottomRight: "boxSharp.bottomRight",
  horizontal: "boxSharp.horizontal",
  vertical: "boxSharp.vertical",
  cross: "boxSharp.cross",
  teeDown: "boxSharp.teeDown",
  teeUp: "boxSharp.teeUp",
  teeRight: "boxSharp.teeRight",
  teeLeft: "boxSharp.teeLeft",
} as const satisfies Record<string, SymbolKey>;

/**
 * The dotted rule's members — the host's own `boxDotted.*` set.
 *
 * The host reads `theme.boxDotted.horizontal`/`.vertical` for the dotted outline it draws around
 * a transient selection (`pi-tui/src/chat/transcript-outline.ts:162`, `:171`), so the fallback
 * needs the table or that outline dies on a missing member.
 */
const BOX_DOTTED_KEYS = {
  horizontal: "boxDotted.horizontal",
  vertical: "boxDotted.vertical",
} as const satisfies Record<string, SymbolKey>;

/** The progress bar's members — the host's own `progress.*` set. */
const PROGRESS_NAMES = ["filled", "empty"] as const;

/** The thinking-level glyphs — the host's own `thinking.*` set. */
const THINKING_NAMES = ["minimal", "low", "medium", "high", "xhigh", "max", "autoPending"] as const;

/** The checkbox's members — the host's own `checkbox.*` set. */
const CHECKBOX_NAMES = ["checked", "unchecked"] as const;

/** The radio button's members — the host's own `radio.*` set. */
const RADIO_NAMES = ["selected", "unselected"] as const;

/**
 * The icon table's members — the host's own `icon.*` set.
 *
 * The host reads these off the singleton all over its own UI (`theme.icon.output`,
 * `theme.icon.warning`, `theme.icon.extensionTool`, …), so the fallback has to carry the table:
 * a missing `icon` is "Cannot read properties of undefined" in the host's chat renderer.
 */
const ICON_NAMES = [
  "model",
  "plan",
  "prewalk",
  "goal",
  "pause",
  "loop",
  "folder",
  "worktree",
  "scratchFolder",
  "file",
  "git",
  "branch",
  "pr",
  "pin",
  "tokens",
  "context",
  "cost",
  "subscription",
  "advisor",
  "advisorClosed",
  "time",
  "omp",
  "ghost",
  "agents",
  "job",
  "cache",
  "cacheMiss",
  "input",
  "output",
  "throughput",
  "host",
  "session",
  "package",
  "warning",
  "rewind",
  "auto",
  "fast",
  "extensionSkill",
  "extensionTool",
  "extensionSlashCommand",
  "extensionMcp",
  "extensionRule",
  "extensionHook",
  "extensionPrompt",
  "extensionContextFile",
  "extensionInstruction",
  "vimNormal",
  "vimInsert",
  "vimVisual",
  "vimVisualLine",
  "mic",
  "camera",
] as const;

/**
 * The slash-command table's members, and the SYMBOL KEY each one resolves to.
 *
 * The host's own `get cmd()` is a table of ALIASES: most members are their own `cmd.*` key, and
 * the rest point at an `icon.*` key (`cmd.model` is `icon.model`, `cmd.tools` is
 * `icon.extensionTool`, …). The mapping is spelled out here rather than derived, because the
 * host's aliases are not a rule: `cmd.tree` is `icon.worktree`, not `icon.tree`.
 */
const CMD_KEYS = {
  action: "cmd.action",
  prompt: "cmd.prompt",
  extension: "cmd.extension",
  settings: "cmd.settings",
  gear: "cmd.gear",
  shield: "cmd.shield",
  wave: "cmd.wave",
  compass: "cmd.compass",
  inbox: "cmd.inbox",
  swap: "cmd.swap",
  expand: "cmd.expand",
  computer: "cmd.computer",
  eye: "cmd.eye",
  todo: "cmd.todo",
  stats: "cmd.stats",
  news: "cmd.news",
  keyboard: "cmd.keyboard",
  export: "cmd.export",
  clipboard: "cmd.clipboard",
  share: "cmd.share",
  broadcast: "cmd.broadcast",
  globe: "cmd.globe",
  copy: "cmd.copy",
  plus: "cmd.plus",
  restart: "cmd.restart",
  eraser: "cmd.eraser",
  trash: "cmd.trash",
  compress: "cmd.compress",
  vibrate: "cmd.vibrate",
  handoff: "cmd.handoff",
  history: "cmd.history",
  question: "cmd.question",
  rocket: "cmd.rocket",
  stethoscope: "cmd.stethoscope",
  redo: "cmd.redo",
  bug: "cmd.bug",
  memory: "cmd.memory",
  pencil: "cmd.pencil",
  folderMove: "cmd.folderMove",
  folderPlus: "cmd.folderPlus",
  folderMinus: "cmd.folderMinus",
  hammer: "cmd.hammer",
  power: "cmd.power",
  cart: "cmd.cart",
  model: "icon.model",
  plan: "icon.plan",
  prewalk: "icon.prewalk",
  goal: "icon.goal",
  pause: "icon.pause",
  loop: "icon.loop",
  session: "icon.session",
  jobs: "icon.job",
  gauge: "icon.throughput",
  context: "icon.context",
  ghost: "icon.ghost",
  agents: "icon.agents",
  branch: "icon.branch",
  tree: "icon.worktree",
  signIn: "icon.input",
  signOut: "icon.output",
  advisor: "icon.advisor",
  host: "icon.host",
  package: "icon.package",
  fast: "icon.fast",
  voice: "icon.mic",
  tools: "icon.extensionTool",
  rule: "icon.extensionRule",
  skill: "icon.extensionSkill",
  mcp: "icon.extensionMcp",
  pin: "icon.pin",
} as const satisfies Record<string, SymbolKey>;

/**
 * EVERY symbol key the fallback can resolve — the snapshot's key set.
 *
 * It is the union of the tables' own keys, so a table member and the `symbol()` lookup of the same
 * key always come out of the same map entry and can never disagree. A key the plugin reads that is
 * NOT in here resolves to the "?" marker — the panel.test.ts scan of the source is what catches a
 * new one.
 *
 * The host's OWN tables are in here too (`icon`, `cmd`, `thinking`, `checkbox`, `radio`,
 * `progress`, `boxDotted`): the fallback is published into the host's live singleton, and the
 * host reads those tables off it.
 */
const FALLBACK_SYMBOL_KEYS: readonly SymbolKey[] = [
  ...Object.values(bucketKeys("status", STATUS_NAMES)),
  ...Object.values(bucketKeys("nav", NAV_NAMES)),
  ...Object.values(bucketKeys("tree", TREE_NAMES)),
  ...Object.values(bucketKeys("sep", SEP_NAMES)),
  ...Object.values(bucketKeys("md", MD_NAMES)),
  ...Object.values(bucketKeys("format", FORMAT_NAMES)),
  ...Object.values(bucketKeys("tool", TOOL_NAMES)),
  ...Object.values(bucketKeys("icon", ICON_NAMES)),
  ...Object.values(bucketKeys("progress", PROGRESS_NAMES)),
  ...Object.values(bucketKeys("thinking", THINKING_NAMES)),
  ...Object.values(bucketKeys("checkbox", CHECKBOX_NAMES)),
  ...Object.values(bucketKeys("radio", RADIO_NAMES)),
  ...Object.values(CMD_KEYS),
  ...Object.values(BOX_ROUND_KEYS),
  ...Object.values(BOX_SHARP_KEYS),
  ...Object.values(BOX_DOTTED_KEYS),
] as SymbolKey[];

/**
 * The LAST-DITCH box characters — the ones the panel paints when the theme it was handed has no
 * `boxRound` member at all.
 *
 * They are LIVE, resolved through the host's own active symbol set, so the panel's split rule can
 * never paint a different glyph than the host's frame paints around it. A hardcoded literal here
 * painted a rounded "│" while the host's frame painted the user's ascii "|", and one frame read as
 * two different boxes. Before any theme loads the host's own lookup falls back to its ascii
 * preset, so the last-ditch set is the host's ascii box.
 *
 * This is the ONE live lookup left in this file, and it is safe: the fallback's `symbol()` answers
 * from its own snapshot, so a mirror pointing at a fallback resolves to a real glyph instead of
 * recursing.
 */
export const BOX_ROUND = liveTable(BOX_ROUND_KEYS);

/**
 * The preset the SNAPSHOT was taken under.
 *
 * The fallback's glyphs come from ONE snapshot, so the preset it reports has to be the preset that
 * snapshot was taken under — not the host's CURRENT one. A live lookup made the fallback name a
 * set its own glyphs did not come from: the host switched symbol set, the fallback's tables still
 * carried the OLD set's glyphs, and the fallback's `getSymbolPreset()` (which the host's
 * theme-change listener reads) named the NEW one. The two facts have to be the same fact.
 *
 * The source is the theme the snapshot's glyphs came from: the host's singleton — the mirror holds
 * the same theme, because the host publishes both together (`assignTheme` → `setActiveSymbolTheme`)
 * — or the host's own ascii preset when there is no theme at all (`activeThemeSymbol` falls back
 * to `SYMBOL_PRESETS.ascii` before any theme loads).
 */
function snapshotPreset(): SymbolPreset {
  const singleton: Theme | undefined = hostTheme;
  if (singleton === undefined || singleton === null) return "ascii";
  if (FALLBACKS.has(singleton)) return "ascii";
  if (typeof singleton.getSymbolPreset !== "function") return "ascii";
  try {
    const preset = singleton.getSymbolPreset();
    if (preset === "unicode" || preset === "nerd" || preset === "ascii") return preset;
  } catch {
    // A half-built theme cannot say which set it carries; the snapshot fell back to the host's
    // own ascii set, so the preset is ascii.
  }
  return "ascii";
}

/**
 * The fallback's colour answers, when a colour is unavoidable.
 *
 * The host's own values for an UNSET token: `#e5e5e7` is what the host's `getColorHex` returns on
 * a dark surface when the token has no colour, and `#000000` is what the host's own `canvasHex()`
 * uses on a dark surface. A neutral, never a wrong hue.
 */
const FALLBACK_FG_HEX = "#e5e5e7";
const FALLBACK_BG_HEX = "#000000";
/** The fallback's accent — the same neutral grey its session-accent inputs carry. */
const FALLBACK_ACCENT_HEX = "#808080";

/**
 * The fallback's spinner frames — the host's own ascii preset frames
 * (`pi-tui/src/theme/symbols.ts`, `SPINNER_FRAMES.ascii`).
 *
 * An EMPTY array is not safe: the host indexes the frames as `frames[i % frames.length]`, and
 * `% 0` is `NaN`, so an empty array paints the literal "undefined" where the spinner should be.
 * ASCII frames are what every terminal carries, so they are the safe answer for a host whose
 * symbol set cannot be read.
 */
const FALLBACK_SPINNER_FRAMES: { status: string[]; activity: string[] } = {
  status: ["|", "/", "-", "\\"],
  activity: ["-", "\\", "|", "/"],
};

/**
 * The session-accent inputs — the host's status line and the interactive mode read them off the
 * published theme (`pi-tui/src/status-line/component.ts:1358`,
 * `pi-coding-agent/src/modes/interactive-mode.ts:3913`).
 *
 * The shape is the host's own `SessionAccentTheme` (`pi-tui/src/theme/session-color.ts:140`): the
 * theme's accent hex, the major theme colour hexes, and the status-line surface luminance (which
 * is undefined on dark themes). The fallback paints no colour, so its accent is a neutral grey and
 * it has no theme colours to avoid — the session accent then derives from the host's own arc.
 */
const FALLBACK_ACCENT_INPUTS = Object.freeze({
  accentHex: FALLBACK_ACCENT_HEX,
  colorHexes: Object.freeze([] as readonly string[]),
});

/**
 * A last-ditch theme that satisfies EVERY member the host's `Theme` class has.
 *
 * It must be COMPLETE, not merely present: the panel's frame rows are drawn by the host's
 * `topBorderSplit`/`divider`/`bottomBorder`, which read the *host's* theme singleton rather than
 * the theme object `resolveTheme` returns — so the fallback has to be PUBLISHED. And in production
 * the plugin and the host share ONE `pi-tui` instance, so a published fallback IS the host's
 * theme: the host then reads its own members off it (the status line's `getColorHex`/`getFgAnsi`,
 * the git app's `getBgHex`, the diff pane, the chat renderer's `getColorMode`, the session
 * accent's `getAllThemeColorHexes`, the spinners' `spinnerFrames`, …), and a member that does not
 * exist is a host-wide crash on the next frame.
 *
 * Every member must match the host Theme's OWN TYPE, not just exist: `sep`, `nav`, `tree`, `status`
 * and `md` are string-valued getters (theme-class.ts:485-510) that consumers interpolate, so a
 * function there renders literally as "(text) => text" into the pane. And a member's ARITY matters
 * for the same reason (`bold` takes one argument, not two).
 *
 * The values are COLOUR-LESS: the fallback paints no colour, so every colour member answers with
 * the text unchanged, and where a hex is unavoidable the host's own value for an unset token is
 * used — a wrong colour is worse than none.
 */
export function uncolouredTheme(): Record<string, unknown> {
  const plain = (_tone: string, text: string): string => text;
  // `bold` is ONE argument in the host Theme (theme-class.ts), not two like `fg`. A shim written
  // as `bold: plain` passes the text as the tone and returns `undefined`, which paints the literal
  // "undefined" into every author cell — the same class of defect as the original shim, in the
  // member's ARITY rather than its presence.
  const strong = (text: string): string => text;
  // The snapshot: EVERY glyph the panel and the cards read, captured NOW. The tables below and the
  // `symbol()` lookup read this one map, so they can never disagree — and the fallback never asks
  // the host's mirror for a glyph, so the mirror can point at it without a cycle.
  //
  // The capture is guarded: a mirror that cannot be read at all degrades the GLYPHS (every key
  // falls back to the "?" marker), never the MEMBERS. A missing member is a host-wide crash on
  // the next frame; a missing glyph is a question mark.
  let snapshot: Record<string, string | undefined> = {};
  try {
    snapshot = captureSymbols(FALLBACK_SYMBOL_KEYS);
  } catch {
    snapshot = {};
  }
  const sep = snapshotTable(bucketKeys("sep", SEP_NAMES), snapshot);
  const nav = snapshotTable(bucketKeys("nav", NAV_NAMES), snapshot);
  const tree = snapshotTable(bucketKeys("tree", TREE_NAMES), snapshot);
  const status = snapshotTable(bucketKeys("status", STATUS_NAMES), snapshot);
  const md = snapshotTable(bucketKeys("md", MD_NAMES), snapshot);
  const format = snapshotTable(bucketKeys("format", FORMAT_NAMES), snapshot);
  const tool = snapshotTable(bucketKeys("tool", TOOL_NAMES), snapshot);
  const icon = snapshotTable(bucketKeys("icon", ICON_NAMES), snapshot);
  const progress = snapshotTable(bucketKeys("progress", PROGRESS_NAMES), snapshot);
  const thinking = snapshotTable(bucketKeys("thinking", THINKING_NAMES), snapshot);
  const checkbox = snapshotTable(bucketKeys("checkbox", CHECKBOX_NAMES), snapshot);
  const radio = snapshotTable(bucketKeys("radio", RADIO_NAMES), snapshot);
  // The slash-command table is the host's own alias table, so it is built from the alias MAP, not
  // from a `cmd.<name>` rule: `cmd.tree` is `icon.worktree`, `cmd.tools` is `icon.extensionTool`.
  const cmd = snapshotTable(CMD_KEYS, snapshot);
  const boxRound = snapshotTable(BOX_ROUND_KEYS, snapshot);
  const boxSharp = snapshotTable(BOX_SHARP_KEYS, snapshot);
  const boxDotted = snapshotTable(BOX_DOTTED_KEYS, snapshot);
  // The preset the SNAPSHOT was taken under — the fallback's glyphs and the preset it reports are
  // one fact, not two.
  const preset = snapshotPreset();
  const shim: Record<string, unknown> = {
    fg: plain,
    bold: strong,
    // `symbol(key)` is the keyed lookup the card renderers use. The host's Theme has it; a
    // fallback without it made `theme.symbol(...)` throw "theme.symbol is not a function" — the
    // same class of defect as a missing `fg`.
    symbol: (key: string): string => snapshot[key] ?? MISSING_SYMBOL,
    // `styledSymbol(key, tone)` must return the TEXT unchanged, like `fg`. Returning the identity
    // function itself (the obvious-looking `styledSymbol: plain`) yields a function wherever a
    // caller interpolates the result, which renders as the literal "(text) => text" into the pane.
    // It reads the SAME snapshot, so it can never disagree with `symbol()`.
    styledSymbol: (key: string, _tone: string): string => snapshot[key] ?? MISSING_SYMBOL,
    // The tables are getters, exactly like the host's own `get status()`: what a caller reads is
    // the snapshot the fallback was built with.
    get sep() {
      return sep;
    },
    get nav() {
      return nav;
    },
    get tree() {
      return tree;
    },
    get status() {
      return status;
    },
    get md() {
      return md;
    },
    get format() {
      return format;
    },
    get tool() {
      return tool;
    },
    // The host's OWN tables: the fallback is published into the host's live singleton, and the
    // host reads these off it (`theme.icon.output` in the chat renderer, `theme.cmd.copy` in the
    // copy overlay, `theme.checkbox.checked` in the approval dialog, `theme.radio.selected` in
    // the transcript outline, `theme.boxDotted.horizontal` in the same outline).
    get icon() {
      return icon;
    },
    get progress() {
      return progress;
    },
    get thinking() {
      return thinking;
    },
    get checkbox() {
      return checkbox;
    },
    get radio() {
      return radio;
    },
    get cmd() {
      return cmd;
    },
    get boxRound() {
      return boxRound;
    },
    get boxSharp() {
      return boxSharp;
    },
    get boxDotted() {
      return boxDotted;
    },
    // The members the host's THEME-CHANGE path reads off the published theme. The host notifies its
    // listener synchronously inside the publish (`notifyThemeChange`), and the interactive mode's
    // listener asks the published theme for the symbol preset and the editor's border colours
    // (`pi-coding-agent/src/modes/interactive-mode.ts:2632`, `:2745`, `:3898`). A published theme
    // without them threw `TypeError: theme.getSymbolPreset is not a function` INSIDE the publish,
    // and the panel died with it.
    getSymbolPreset: (): SymbolPreset => preset,
    // The host's own INSTANCE fields, which the host's class assigns in its constructor
    // (`pi-tui/src/theme/theme-class.ts`: `private readonly mode`, `private readonly symbolPreset`).
    // They are private in TypeScript and the host reads them through the methods above, but they
    // ARE own properties of a real theme — so the fallback carries them too, with the values its
    // own methods report: the colour mode it claims, and the preset its snapshot was taken under.
    mode: "256color",
    symbolPreset: preset,
    // The host's own implementations return a ONE-argument function
    // (`(str) => this.fg("bashMode", str)`), so the fallback returns one too: a function that
    // returns its text unchanged. A two-argument identity would take the text as the TONE and
    // return `undefined` — the same arity bug the fallback's `bold` once had.
    getBashModeBorderColor: (): ((str: string) => string) => strong,
    getPythonModeBorderColor: (): ((str: string) => string) => strong,
    sessionAccentInputs: FALLBACK_ACCENT_INPUTS,

    // ---- the colour surface -------------------------------------------------
    //
    // The fallback paints NO colour, so every colour member answers with the TEXT unchanged (or
    // with the host's own value for an unset token). They exist because the fallback is PUBLISHED
    // into the host's live singleton, and the host reads them: the status line
    // (`getColorHex`, `getFgAnsi`, `getBgAnsi`), the git app (`getBgHex`), the diff pane
    // (`getColorHex`), the chat renderer (`getColorMode`, `getAccentColorHex`), the session accent
    // (`getAllThemeColorHexes`, `getMajorThemeColorHexes`).
    //
    // A hex cannot be "no colour" — the host's own hex helpers (`hexToRgb`, `mixHex`, `colorLuma`)
    // would compute on it, and an empty string makes them produce "#NaNNaNNaN". So the hex members
    // answer with the host's OWN value for a missing token: `#e5e5e7` for a foreground (what the
    // host's `getColorHex` returns on a dark surface) and `#000000` for a background (what the
    // host's own `canvasHex()` uses on a dark surface). A neutral, never a wrong hue.
    getColorHex: (_color: string): string => FALLBACK_FG_HEX,
    getBgHex: (_color: string): string => FALLBACK_BG_HEX,
    getAccentColorHex: (): string => FALLBACK_ACCENT_HEX,
    // No colour is set, so there is no palette to clash with: the host's session-accent picker
    // reads these to AVOID the theme's own colours, and an empty list means "nothing to avoid".
    getAllThemeColorHexes: (): string[] => [],
    getMajorThemeColorHexes: (): string[] => [],
    // The fallback sets no colour token, so `hasColor` is false for every one of them — the same
    // answer the host gives for an optional token a theme does not define.
    hasColor: (_color: string): boolean => false,
    // The ANSI escapes are EMPTY: the host embeds them in a template (`${theme.getFgAnsi("text")}`
    //), so an empty escape paints the text in the terminal's own colour and cannot mis-colour it.
    getFgAnsi: (_color: string): string => "",
    getBgAnsi: (_color: string): string => "",
    getFgOnBgAnsi: (_color: string, _background: string): string => "",
    getContrastFgAnsi: (_color: string): string => "",
    // "256color" and not "truecolor": the host picks its hex paths off this, and the fallback has
    // no palette to speak of. The host's own `ColorMode` is "truecolor" | "256color"
    // (`pi-tui/src/theme/schema.ts`).
    getColorMode: (): "256color" => "256color",
    // The text-side colour members, with the host's own ARITIES: `fgResolved` takes the colour and
    // the text, `bg`/`bgFill` the background and the text, `fgOnBg` the foreground, the background
    // and the text. All of them answer with the text unchanged.
    fgResolved: (_color: string, text: string): string => text,
    bg: (_color: string, text: string): string => text,
    bgFill: (_color: string, text: string): string => text,
    fgOnBg: (_color: string, _background: string, text: string): string => text,
    // The style members are ONE-argument functions in the host's Theme (`italic(text)`), like
    // `bold`. The fallback paints no styling at all — `bold` no-ops for the same reason — so a
    // half-styled line is never painted: the text is the text.
    italic: strong,
    underline: strong,
    strikethrough: strong,
    inverse: strong,
    // The border-colour members answer with a ONE-argument function, like the bash/python ones.
    getThinkingBorderColor: (_level: string): ((str: string) => string) => strong,
    // The spinner frames. The host's own ascii preset frames (`pi-tui/src/theme/symbols.ts`,
    // `SPINNER_FRAMES.ascii`), because an EMPTY array is not safe: the host indexes it as
    // `frames[i % frames.length]`, and `% 0` is `NaN`, so an empty array paints the literal
    // "undefined" where the spinner should be. ASCII frames are what every terminal carries.
    get spinnerFrames(): string[] {
      return FALLBACK_SPINNER_FRAMES.status;
    },
    getSpinnerFrames: (type: "status" | "activity" = "status"): string[] =>
      type === "activity" ? FALLBACK_SPINNER_FRAMES.activity : FALLBACK_SPINNER_FRAMES.status,
    // The language icons: the fallback has no language map (the host's `langMap` is not exported),
    // and a WRONG language icon is worse than none — the host's own `getLangIconStyled` treats an
    // empty icon as a valid value ("the bare (possibly empty) icon when the active symbol preset
    // has none").
    getLangIcon: (_lang: string | undefined): string => "",
    getLangIconStyled: (_lang: string | undefined): string => "",
    // The surface luminance: the fallback has no background, so the luminance is undefined — which
    // is the host's own value for a dark theme (`statusLineLuminance` is undefined there, and
    // `accentSurfaceLuminance` follows it). `isLight` is therefore false, exactly as the host
    // computes it from the same undefined luminance.
    get statusLineLuminance(): number | undefined {
      return undefined;
    },
    get accentSurfaceLuminance(): number | undefined {
      return undefined;
    },
    get isLight(): boolean {
      return false;
    },
  };
  // Registered so the publish path can recognise a fallback and never leave the host's symbol
  // mirror pointing at one.
  FALLBACKS.add(shim);
  return shim;
}
