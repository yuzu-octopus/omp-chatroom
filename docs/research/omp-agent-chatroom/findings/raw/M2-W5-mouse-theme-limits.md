# M2-W5 — Mouse routing, theme access, markdown/table parity, extension reachability limits

Aliases: `PI_TUI` = `~/.bun/install/global/node_modules/@oh-my-pi/pi-tui/src`; `PI_CA` = `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`.
All fetch dates 2026-10-06. omp v18.6.1.

## Angle

Can an extension panel mounted via `ctx.ui.custom(factory, {overlay:true})` get mouse events, theme tokens, and built-in-identical markdown/tables? Where exactly does the extension surface stop: global keys, Esc, status line, transcript painting, editor replacement, direct `showOverlay`, title/notify/widgets, fullscreen alt-screen, keybinding rebinding.

## Claims

### 1. Mouse routing

Core types (verbatim, `PI_TUI src/mouse.ts:11-32`):

```ts
/** A decoded SGR mouse report. */
export interface SgrMouseEvent {
	/** Raw button code (bit 32 = motion, bit 64 = wheel, low bits = button). */
	button: number;
	/** 0-based column of the event. */
	col: number;
	/** 0-based row of the event. */
	row: number;
	/** True for a release report (`m` suffix). */
	release: boolean;
	/**
	 * Vertical wheel direction: -1 up, 1 down, null when not a vertical wheel
	 * event. Horizontal wheel reports (buttons 66/67, the sideways drift of a
	 * two-finger trackpad scroll) are not a direction: treating them as one
	 * scrolled the selectors up and back down at the end of a gesture.
	 */
	wheel: -1 | 1 | null;
	/** True when the pointer moved (hover or drag) rather than clicked. */
	motion: boolean;
	/** True for a left-button press (not motion, not release, not wheel). */
	leftClick: boolean;
}
```

Opt-in interface (verbatim, `PI_TUI src/mouse.ts:102-110`):

```ts
/**
 * Implemented by components that accept routed mouse events at frame-local
 * coordinates. Hosts translate screen coordinates to the component's own
 * rendered lines before forwarding.
 */
export interface MouseRoutable {
	/** `line`/`col` are 0-based within the component's rendered output. */
	routeMouse(event: SgrMouseEvent, line: number, col: number): void;
}
```

Handler + helper (verbatim, `PI_TUI src/mouse.ts:52-66`):

```ts
/** Handler invoked with a decoded SGR event; returning `false` reports unhandled. */
export type SgrMouseHandler = (event: SgrMouseEvent) => boolean | undefined;

/**
 * Decode an SGR mouse report and forward it to `handler`. Returns `false` when
 * `data` is not an SGR mouse report (or fails to parse), so callers can fall
 * through to other input handling. Centralizes the repeated
 * `data.startsWith("\x1b[<")` + `parseSgrMouse()` pattern.
 */
export function routeSgrMouseInput(data: string, handler: SgrMouseHandler): boolean {
	if (!data.startsWith("\x1b[<")) return false;
	const event = parseSgrMouse(data);
	if (!event) return false;
	return handler(event) !== false;
}
```

- `MouseRoutable.routeMouse` is NOT auto-invoked by the TUI; no `routeMouse` call exists anywhere in `tui.ts` — path: PI_TUI src/tui.ts (grep for `routeMouse` = 0 hits) — fetch 2026-10-06 — confidence: primary
- Hosts must hit-test themselves; TUI has no hit-test/region registry for `MouseRoutable`; only layout containers forward (`Row`/`Stack`/`SplitPane` call `isLayoutMouseRoutable(...).routeMouse`) — path: PI_TUI src/components/layout/row.ts:220-221, stack.ts:190-191, split-pane.ts:352-353 — fetch 2026-10-06 — confidence: primary
- Mouse reports arrive as ordinary `data` strings through `Component.handleInput(data)`; there is no separate mouse dispatch — path: PI_TUI src/mouse.ts:5-8 + src/tui.ts:2781-2789 — fetch 2026-10-06 — confidence: primary
- TUI's single input funnel: `#handleInput(data)` → global input listeners → debug key → focused component `handleInput(data)`; no mouse-specific branch — path: PI_TUI src/tui.ts:2680-2790 — fetch 2026-10-06 — confidence: primary

Mouse reporting constants (verbatim, `PI_TUI src/tui.ts:98-107`):

```ts
// Mouse reporting is scoped to fullscreen overlays that opt into pointer
// interaction, plus the opt-in normal-buffer click capture (`tui.mouse`).
// 1000h = button click tracking, 1003h = any-motion tracking for hover
// targets, and 1006h = SGR extended coordinates past column/row 223.
// Selection-first surfaces leave these modes disabled so the terminal retains
// native text selection.
const MOUSE_TRACKING_ON = "\x1b[?1000h\x1b[?1003h\x1b[?1006h";
const MOUSE_TRACKING_OFF = "\x1b[?1006l\x1b[?1003l\x1b[?1000l";

type MouseTrackingState = "off" | "inline" | "full";
```

Enable decision (verbatim, `PI_TUI src/tui.ts:3561-3573`):

```ts
		// Fullscreen alt-screen short-circuit. While the topmost visible overlay
		// requests it, borrow the terminal's alternate buffer and paint only the
		// modal there; the normal screen and all accounting stay untouched.
		const topOverlay = this.#getTopmostVisibleOverlay();
		const wantAlt = topOverlay?.options?.fullscreen === true;
		const wantMouse: MouseTrackingState =
			topOverlay === undefined
				? this.#inlineMouseProvider?.() === true
					? "inline"
					: "off"
				: wantAlt && topOverlay.options?.mouseTracking !== false
					? "full"
					: "off";
```

- Mouse reporting for an overlay requires BOTH `fullscreen: true` AND `mouseTracking !== false`; a non-fullscreen overlay (the `custom(...,{overlay:true})` default) gets `"off"` — no SGR reports at all — path: PI_TUI src/tui.ts:3566-3573 — fetch 2026-10-06 — confidence: primary
- Inline (`"inline"`) reporting applies only when NO overlay is visible, and only when the host installed a provider (`setInlineMouseTrackingProvider`), which the coding-agent gates on the `tui.mouse` setting (default `false`) — path: PI_TUI src/tui.ts:1309-1317, PI_CA src/modes/interactive-mode.ts:1794-1809, PI_CA src/modes/settings.ts:504-507 — fetch 2026-10-06 — confidence: primary
- Emission is byte-level and idempotent (`#setMouseTracking` writes ON only entering from `off`) — path: PI_TUI src/tui.ts:1319-1331 — fetch 2026-10-06 — confidence: primary

OverlayOptions docs (verbatim, `PI_TUI src/tui.ts:463-478`):

```ts
	// === Fullscreen ===
	/**
	 * Borrow the terminal's alternate screen buffer for this overlay's lifetime
	 * (vim/less idiom). While the topmost visible overlay sets this, the engine
	 * paints only the modal on the alt screen and emits no ED3 / scrollback
	 * bytes, so the transcript on the normal screen stays untouched and is not
	 * scrollable behind the modal. Defaults off — all other overlays are
	 * unchanged and still draw over the transcript on the normal screen.
	 */
	fullscreen?: boolean;
	/**
	 * Enable terminal mouse reporting while fullscreen. Defaults on; disable it
	 * when native terminal text selection takes precedence over pointer events.
	 */
	mouseTracking?: boolean;
}
```

- `OverlayOptions.fullscreen` defaults off; `mouseTracking` defaults ON but is only consulted when `fullscreen` is true — path: PI_TUI src/tui.ts:472-477 — fetch 2026-10-06 — confidence: primary

Built-in panels:

- agent-hub handles mouse inline in `handleInput` via `routeSgrMouseInput` + `routeSelectListMouse(this, event, event.row)` (hub itself implements `SelectListMouseTarget`) — path: PI_TUI src/overlays/agent-hub.ts:566-578 — fetch 2026-10-06 — confidence: primary
- agent-hub mounts its transcript viewer fullscreen: `this.#ui.showOverlay(viewer, { width: "100%", margin: 0, fullscreen: true })` — path: PI_TUI src/overlays/agent-hub.ts:653 — fetch 2026-10-06 — confidence: primary
- agents-hub (the fullscreen hub) routes mouse with its own frame hit-test (`#frame.locate(event.row, event.col)` → `#browser.routeMouse(event, bodyLine)`) — path: PI_TUI src/overlays/agents-hub.ts:692-696, 925-940 — fetch 2026-10-06 — confidence: primary
- report-panel handles wheel only: `routeSgrMouseInput(data, event => { if (event.wheel === null) return false; this.#view.scroll(event.wheel * 3); return true; })` — path: PI_TUI src/overlays/report-panel.ts:150-160 — fetch 2026-10-06 — confidence: primary
- jobs-panel has NO mouse code: `handleInput` matches select cancel/up/down and `x` only; clicks are handled natively via `handleNativeEvent` — path: PI_TUI src/overlays/jobs-panel.ts:190-195, 198-201 — fetch 2026-10-06 — confidence: primary
- btw-panel has no `handleInput`/`routeMouse` of its own (extends `OverlayPanel`, which also has no mouse code) — path: PI_TUI src/overlays/btw-panel.ts:22, PI_TUI src/chrome/overlay-box.ts:218-300 (grep `handleInput|routeMouse` = 0 hits) — fetch 2026-10-06 — confidence: primary
- Fullscreen built-in mounts use the same options an extension could pass: `#showFullscreenMenu` → `showOverlay(component, {anchor:"bottom-center", width:"100%", maxHeight:"100%", margin:0, fullscreen:true})`; btw history panel identical — path: PI_CA src/modes/controllers/selector-controller.ts:189-200, PI_CA src/modes/controllers/btw-controller.ts:538-543 — fetch 2026-10-06 — confidence: primary

### 2. Theme access

- Factory 2nd arg is the live theme binding, not a snapshot: `Promise.try(() => factory(this.ctx.ui, theme, keybindings, close))` — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1176 — fetch 2026-10-06 — confidence: primary
- `theme` imported from `@oh-my-pi/pi-tui/theme` into the controller — path: PI_CA src/modes/controllers/extension-ui-controller.ts:38 — fetch 2026-10-06 — confidence: primary
- `ExtensionUIContext.theme` getter returns the same live binding: `get theme() { return theme; }` — path: PI_CA src/modes/controllers/extension-ui-controller.ts:151-153 — fetch 2026-10-06 — confidence: primary
- Interface declares `/** Get the current theme for styling. */ readonly theme: Theme;` — path: PI_CA src/extensibility/extensions/types.ts:364-365 — fetch 2026-10-06 — confidence: primary
- Coding-agent root re-exports the whole theme module: `export * from "@oh-my-pi/pi-tui/theme";` — path: PI_CA src/index.ts:38 — fetch 2026-10-06 — confidence: primary
- pi-tui theme index re-exports `theme.ts` (singleton + accessors), `session-color`, `shimmer`, `lang-from-path` — path: PI_TUI src/theme/index.ts:1-5 — fetch 2026-10-06 — confidence: primary

Active-theme singleton (verbatim, `PI_TUI src/theme/theme.ts:88-119`):

```ts
// ============================================================================
// Global Theme Instance
// ============================================================================

/** Active theme; imports remain live across initialization, previews, and theme switches. */
export var theme: Theme;
var currentThemeName: string | undefined;
/** Theme shown by `previewTheme` until the next non-preview assignment. */
var previewThemeName: string | undefined;

type ThemeBinding = (value: Theme) => void;
var themeBindings: Set<ThemeBinding> | undefined;

/** @internal Mirror assignments into bundled module bindings without replacing the UI change listener. */
export function bindTheme(binding: ThemeBinding): () => void {
	const bindings = (themeBindings ??= new Set<ThemeBinding>());
	bindings.add(binding);
	binding(theme);
	return () => {
		bindings.delete(binding);
	};
}

/** `previewName` marks a theme-selector preview; any other assignment ends it. */
function assignTheme(value: Theme, previewName?: string): void {
	theme = value;
	previewThemeName = previewName;
	setActiveSymbolTheme(value);
	if (themeBindings) {
		for (const binding of themeBindings) binding(value);
	}
}
```

- Accessor = the exported live `var theme: Theme`; no `getTheme()` function for the active instance. Related exported helpers: `getCurrentThemeName()`, `fgOrPlain()`, `onThemeChange()`, `getThemeEpoch()` — path: PI_TUI src/theme/theme.ts:93, 122-129, 406, 422 — fetch 2026-10-06 — confidence: primary
- `fgOrPlain` is the pre-init-safe styler: `return typeof theme === "undefined" ? text : theme.fg(color, styledText);` — path: PI_TUI src/theme/theme.ts:126-129 — fetch 2026-10-06 — confidence: primary

`Theme` class essentials (verbatim, `PI_TUI src/theme/theme-class.ts:163-193`):

```ts
export class Theme {
	#fgColors: Record<ThemeColor, string>;
	#bgColors: Record<ThemeBg, string>;
	/** Resolved hex strings for foreground colors — populated at construction. */
	readonly #hexFgColors: Record<ThemeColor, string>;
	/** Resolved hex strings for background colors — populated at construction. */
	readonly #hexBgColors: Record<ThemeBg, string>;
	/** Lazily resolved `fgResolved` ANSI per color; colors and mode are fixed per instance. */
	readonly #resolvedFgColors = new Map<ThemeColor, string>();
	/** Lazily built, frozen `sessionAccentInputs`; every input it reads is fixed per instance. */
	#sessionAccentInputs: SessionAccentTheme | undefined;
	#symbols: SymbolMap;
	#spinnerFramesOverrides: Partial<Record<SpinnerType, string[]>>;
	/**
	 * Perceptual luma (0..1) of the status-line background — used to classify the
	 * theme light/dark. Undefined when it can't be resolved. Classified against the
	 * status line (the surface session accents render on) rather than the chat bubble
	 * (`userMessageBg`), which some themes (e.g. `porcelain`) style dark on an
	 * otherwise-light theme.
	 */
	readonly statusLineLuminance: number | undefined;
	/** WCAG relative luminance of the status-line background — basis for accent contrast. */
	readonly #statusLineContrastLuminance: number | undefined;
	constructor(
		fgColors: Record<ThemeColor, string | number>,
		bgColors: Record<ThemeBg, string | number>,
		private readonly mode: ColorMode,
		private readonly symbolPreset: SymbolPreset,
		symbolOverrides: Partial<Record<SymbolKey, string>>,
		spinnerFramesOverrides: Partial<Record<SpinnerType, string[]>> = {},
	) {
```

Token accessors (verbatim, `PI_TUI src/theme/theme-class.ts:325-389`):

```ts
	fg(color: ThemeColor, text: string): string {
		const ansi = this.#fgColors[color];
		if (!ansi) throw new Error(`Unknown theme color: ${color}`);
		return `${ansi}${text}\x1b[39m`; // Reset only foreground color
	}

	/** Apply a foreground, replacing terminal-default tokens with the theme's contrast-safe fallback. */
	fgResolved(color: ThemeColor, text: string): string {
		let resolved = this.#resolvedFgColors.get(color);
		if (resolved === undefined) {
			const ansi = this.#fgColors[color];
			if (!ansi) throw new Error(`Unknown theme color: ${color}`);
			resolved = ansi === "\x1b[39m" ? colorToAnsi(this.getColorHex(color), this.mode) : ansi;
			this.#resolvedFgColors.set(color, resolved);
		}
		return `${resolved}${text.replace(FOREGROUND_RESET_PATTERN, `$&${resolved}`)}\x1b[39m`;
	}

	bg(color: ThemeBg, text: string): string {
		const ansi = this.#bgColors[color];
		if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
		return `${ansi}${text}\x1b[49m`; // Reset only background color
	}

	/**
	 * Apply a background fill that resumes after nested full/background resets.
	 *
	 * Composer rows contain styled text and cursor escapes; a normal background
	 * wrapper would otherwise stop at the first nested reset.
	 */
	bgFill(color: ThemeBg, text: string): string {
		const ansi = this.#bgColors[color];
		if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
		return `${ansi}${text.replace(BACKGROUND_RESET_PATTERN, `$&${ansi}`)}\x1b[49m`;
	}

	/**
	 * Apply a foreground over a controlled background, choosing a contrast-safe
	 * fallback only when the theme token requests the terminal default and
	 * reapplying it after nested full/foreground resets.
	 */
	fgOnBg(color: ThemeColor, background: ThemeBg, text: string): string {
		const ansi = this.getFgOnBgAnsi(color, background);
		return `${ansi}${text.replace(FOREGROUND_RESET_PATTERN, `$&${ansi}`)}\x1b[39m`;
	}

	bold(text: string): string {
		return boldStyler(text);
	}

	italic(text: string): string {
		return italicStyler(text);
	}

	underline(text: string): string {
		return underlineStyler(text);
	}

	strikethrough(text: string): string {
		return strikethroughStyler(text);
	}

	inverse(text: string): string {
		return inverseStyler(text);
	}
```

- Other public Theme members: `getColorHex`, `getBgHex`, `getAllThemeColorHexes`, `getMajorThemeColorHexes`, `getAccentColorHex`, `getFgAnsi`, `getBgAnsi`, `getFgOnBgAnsi`, `getContrastFgAnsi`, `getColorMode`, `getThinkingBorderColor`, `getBashModeBorderColor`, `getPythonModeBorderColor`, `symbol`, `styledSymbol`, `getSymbolPreset`, `getSpinnerFrames`, `getLangIcon`, `getLangIconStyled`, `isLight`, `accentSurfaceLuminance`, `sessionAccentInputs`, plus symbol-category getters `status/nav/tree/progress/boxRound/boxDotted/boxSharp/sep/icon/cmd/format/md` — path: PI_TUI src/theme/theme-class.ts:242-808 — fetch 2026-10-06 — confidence: primary

`md` symbol getter (verbatim, `PI_TUI src/theme/theme-class.ts:760-767`):

```ts
	get md() {
		return {
			quoteBorder: this.#symbols["md.quoteBorder"],
			hrChar: this.#symbols["md.hrChar"],
			bullet: this.#symbols["md.bullet"],
			colorSwatch: this.#symbols["md.colorSwatch"],
		};
	}
```

How markdown/table read tokens — adapters (verbatim, `PI_TUI src/theme/tui-adapters.ts:194-251`, excerpted):

```ts
export function getMarkdownTheme(): MarkdownTheme {
	ensureThemeSync();
	if (cachedMarkdownTheme !== undefined && cachedMarkdownThemeRef === theme) {
		return cachedMarkdownTheme;
	}
	...
	const markdownTheme: MarkdownTheme = {
		heading: (text: string) => theme.fg("mdHeading", text),
		link: (text: string) => theme.fg("mdLink", text),
		linkUrl: (text: string) => theme.fg("mdLinkUrl", text),
		code: (text: string) => theme.fg("mdCode", text),
		codeBlock: (text: string) => theme.fg("mdCodeBlock", text),
		codeBlockBorder: (text: string) => theme.fg("mdCodeBlockBorder", text),
		quote: (text: string) => theme.fg("mdQuote", text),
		quoteBorder: (text: string) => theme.fg("mdQuoteBorder", text),
		hr: (text: string) => theme.fg("mdHr", text),
		listBullet: (text: string) => theme.fg("mdListBullet", text),
		bold: (text: string) => theme.bold(text),
		italic: (text: string) => theme.italic(text),
		underline: (text: string) => theme.underline(text),
		strikethrough: (text: string) => chalk.strikethrough(text),
		symbols: getSymbolTheme(),
		...
		highlightCode: (code: string, lang?: string): string[] => {
			const validLang = lang && nativeSupportsLanguage(lang) ? lang : undefined;
			const highlighted = highlightCached(code, validLang, theme);
			if (highlighted !== null) return highlighted.split("\n");
			return code.split("\n").map(line => theme.fg("mdCodeBlock", line));
		},
		createHighlightStream: lang => createHighlightStream(lang, theme),
	};
	cachedMarkdownTheme = markdownTheme;
	cachedMarkdownThemeRef = theme;
	return markdownTheme;
}
```

- `getMarkdownTheme()` is memoized per Theme instance identity — a theme switch yields a fresh object; Markdown caches keyed by theme identity — path: PI_TUI src/theme/tui-adapters.ts:184-198, 248-250 — fetch 2026-10-06 — confidence: primary
- Table glyphs come from `getSymbolTheme().table` which maps to `theme.boxSharp` (tables keep sharp corners; rounded chrome uses `boxRound`) — path: PI_TUI src/theme/tui-adapters.ts:169-182; omp://theme.md "Box-drawing borders" — fetch 2026-10-06 — confidence: primary
- `getSymbolTheme()` guards `typeof theme === "undefined"` and falls back to ASCII — path: PI_TUI src/theme/tui-adapters.ts:139-168 — fetch 2026-10-06 — confidence: primary
- `getSelectListTheme()`, `getEditorTheme()`, `getSettingsListTheme()` are the other exported adapters — path: PI_TUI src/theme/tui-adapters.ts:253-352 — fetch 2026-10-06 — confidence: primary

`omp://theme.md` guidance for custom components (verbatim, omp://theme.md, section "Runtime switching behavior", fetch 2026-10-06):

> The `theme` export is a live binding, including in bundled extensions. Read it inside rendering callbacks rather than retaining a theme instance across switches. Extension renderer callbacks may also use their supplied theme argument.
>
> ```ts
> import { theme } from "@oh-my-pi/pi-coding-agent";
>
> const renderStatus = () => theme.fg("accent", "Ready");
> ```

- omp://theme.md also documents: custom theme files live at `~/.omp/agent/themes/<name>.json`, all `colors` tokens required except `thinkingMax`, `symbols` optional (`preset`/`overrides`/`spinnerFrames`), `$schema` informational, watcher reload keeps last-good on error — omp://theme.md, sections "Built-in vs custom theme sources" / "Creating a custom theme (practical)" / "Real constraints and caveats" — fetch 2026-10-06 — confidence: primary
- `omp://theme.md` documents no dedicated "custom component theming" API beyond the live `theme` export, `getMarkdownTheme()`/`getSelectListTheme()`/`getEditorTheme()`/`getSettingsListTheme()` adapters and symbol presets — omp://theme.md "What the theme system controls" — fetch 2026-10-06 — confidence: primary

### 3. Markdown + table rendering consistent with built-ins

Markdown class + constructor (verbatim, `PI_TUI src/components/markdown.ts:1898,1991-2009`):

```ts
export class Markdown implements Component {
	...
	constructor(
		text: string,
		paddingX: number,
		paddingY: number,
		theme: MarkdownTheme,
		defaultTextStyle?: DefaultTextStyle,
		codeBlockIndent: number = 2,
	) {
		this.#text = normalizeOsc8Terminators(text);
		this.#oscPartialEscape = trailingOsc8Partial(this.#text);
		this.#paddingX = paddingX;
		this.#paddingY = paddingY;
		this.#theme = theme;
		this.#symbols = theme.symbols ?? getSymbolTheme();
		const { quoteBorder, hrChar, colorSwatch, table } = this.#symbols;
		this.#symbolsProbe = theme.symbols ? "" : [quoteBorder, hrChar, colorSwatch, ...Object.values(table)].join("");
		this.#defaultTextStyle = defaultTextStyle;
		this.#codeBlockIndent = Math.max(0, Math.floor(codeBlockIndent));
	}
```

- There is NO options object: positional `(text, paddingX, paddingY, theme, defaultTextStyle?, codeBlockIndent=2)` — path: PI_TUI src/components/markdown.ts:1991-1998 — fetch 2026-10-06 — confidence: primary
- Public mutators/readers: `setText(text): boolean`, `invalidate()`, `getLastRenderStableText()`, `render(width)`, `setIgnoreTight(ignore): this`, `debugState()`, `describe(cx)` — path: PI_TUI src/components/markdown.ts:1985-1989, 2011-2013, 2023, 2083, 2095, 2113, 2400 — fetch 2026-10-06 — confidence: primary

`DefaultTextStyle` (verbatim, `PI_TUI src/components/markdown.ts:1422-1435`):

```ts
export interface DefaultTextStyle {
	/** Foreground color function */
	color?: (text: string) => string;
	/** Background color function */
	bgColor?: (text: string) => string;
	/** Bold text */
	bold?: boolean;
	/** Italic text */
	italic?: boolean;
	/** Strikethrough text */
	strikethrough?: boolean;
	/** Underline text */
	underline?: boolean;
}
```

`MarkdownTheme` (verbatim, `PI_TUI src/components/markdown.ts:1459-1496`):

```ts
export interface MarkdownTheme {
	heading: (text: string) => string;
	link: (text: string) => string;
	linkUrl: (text: string) => string;
	/** Resolve the OSC 8 destination without changing visible text; undefined preserves the authored URL. */
	resolveLink?: (href: string) => string | undefined;
	code: (text: string) => string;
	codeBlock: (text: string) => string;
	codeBlockBorder: (text: string) => string;
	quote: (text: string) => string;
	quoteBorder: (text: string) => string;
	hr: (text: string) => string;
	listBullet: (text: string) => string;
	bold: (text: string) => string;
	italic: (text: string) => string;
	strikethrough: (text: string) => string;
	underline: (text: string) => string;
	highlightCode?: (code: string, lang?: string) => string[];
	/**
	 * Create a stateful incremental highlighter for one streaming code fence.
	 * `push` receives newline-terminated complete lines (only the final push
	 * may omit the trailing newline) and must return highlighted ANSI text for
	 * exactly the pushed chunk, byte-identical to highlighting the concatenated
	 * text through `highlightCode`. Return null when `lang` is unsupported.
	 */
	createHighlightStream?: (lang?: string) => HighlightStreamSession | null;
	/**
	 * Resolve a mermaid ASCII rendering by fenced block source text.
	 * Return null to fall back to fenced code rendering.
	 */
	resolveMermaidAscii?: (source: string, maxWidth?: number) => string | null;
	/**
	 * Glyphs for quote borders, rules, tables and color swatches. Optional so themes
	 * built to the upstream pi-tui `MarkdownTheme` shape (which has no `symbols`)
	 * still render; omitted symbols fall back to the active theme's set.
	 */
	symbols?: SymbolTheme;
}
```

Table (verbatim, `PI_TUI src/components/table.ts:9-30,94-105`):

```ts
/** One table cell. Styling is applied after alignment so padding shares the cell style. */
export interface TableCell {
	readonly text: string;
	readonly style?: (text: string) => string;
}

/** Explicit sizing and overflow policy for a table column. */
export interface TableColumn {
	readonly width: number;
	readonly minWidth?: number;
	readonly align: "left" | "right";
	readonly overflow: "allow" | "truncate";
	/** Lower-priority columns shrink before higher-priority columns. */
	readonly priority?: number;
	readonly style?: (text: string) => string;
}

/** Row-layout options shared by table functions and the component. */
export interface TableOptions {
	readonly gap?: string;
	readonly indent?: string;
	readonly fit?: boolean;
}
```

```ts
/** Bounded table component for structured rows with replaceable data and stable unchanged-render arrays. */
export class Table implements Component {
	#rows: readonly (readonly TableCell[])[];
	readonly #columns: readonly TableColumn[];
	readonly #options: TableOptions;
	#cache: { width: number; epoch: number; lines: readonly string[] } | undefined;
	#native: NativeNode | undefined;

	constructor(rows: readonly (readonly TableCell[])[], columns: readonly TableColumn[], options: TableOptions = {}) {
```

- `Table` is a low-level fixed-column grid (`TableColumn.width` mandatory), NOT a boxed/markdown table; markdown tables are rendered inside `Markdown.#renderTable` with `boxSharp` glyphs — path: PI_TUI src/components/table.ts:15-23, 101; PI_TUI src/components/markdown.ts:3893; omp://theme.md "Box-drawing borders" — fetch 2026-10-06 — confidence: primary
- Only `renderTableRow`/`TableCell`/`TableColumn` are used by built-ins (agent-hub renderer, dashboards, boards); the `Table` class has no in-tree callers — path: PI_TUI src/overlays/agent-hub-renderer.ts:7, src/apps/ps-top.ts:13, src/apps/autoresearch-dashboard.ts:5, src/apps/if-bench-board.ts:12 (grep `new Table(` = 0 hits) — fetch 2026-10-06 — confidence: primary
- `Table.render` caches by width + `getWidthConfigEpoch()` and returns the same array reference when unchanged — path: PI_TUI src/components/table.ts:147-159 — fetch 2026-10-06 — confidence: primary

Built-in chat assistant markdown call site (verbatim, `PI_TUI src/chat/assistant-message.ts:1174-1189`):

```ts
	/** Constructor args mirror the live child Markdown so stable rows prefix the block render. */
	#createStableMarkdown(kind: StablePartKind, text: string): Markdown {
		return kind === "text"
			? new Markdown(
					text,
					1,
					0,
					this.#getProseTheme(),
					this.#textColorTransform ? { color: this.#textColorTransform } : undefined,
					0,
				)
			: new Markdown(text, 1, 0, getMarkdownTheme(), {
					color: (value: string) => theme.fg("thinkingText", value),
					italic: true,
				});
	}
```

- Built-in chat prose uses `new Markdown(text, 1, 0, getMarkdownTheme(), {color?}, 0)`; thinking uses `{color: thinkingText, italic:true}` — path: PI_TUI src/chat/assistant-message.ts:1175-1189 — fetch 2026-10-06 — confidence: primary
- Prose theme derives from `getMarkdownTheme()` plus a link-target resolver (`resolveLink`), with a fresh object whenever the map changes because Markdown's render cache keys themes by object identity — path: PI_TUI src/chat/assistant-message.ts:364-372, 375-378 — fetch 2026-10-06 — confidence: primary
- Other built-in markdown sites: user-message `new Markdown(text, 1, 1, getMarkdownTheme(), {...})`, skill-message `(text,0,0,...)`, compaction summary `(detailMarkdown(),0,0,...)`, btw-panel `(text,0,0,getMarkdownTheme())` — path: PI_TUI src/chat/user-message.ts:164, src/chat/skill-message.ts:212, src/chat/compaction-summary-message.ts:175, src/overlays/btw-panel.ts:236 — fetch 2026-10-06 — confidence: primary
- `Markdown` implements `describe(cx)` for the native (Tern) surface, so it degrades to rendered rows on non-native terminals — path: PI_TUI src/components/markdown.ts:2095 — fetch 2026-10-06 — confidence: primary

### 4. Reachable / not reachable from an extension

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 1 | Register a GLOBAL keybinding | **Reachable** (first-class) | `pi.registerShortcut(shortcut: KeyId, options: {description?, handler})` → `runner.getShortcuts()` → `editor.setCustomKeyHandler(keyId, …)` → dispatched in `CustomEditor.handleInput` |
| 1b | Raw global input intercept (any key, before focus dispatch) | **Reachable** | `ctx.ui.onTerminalInput(handler)` → `TUI.addInputListener`; listeners run before focused-component dispatch and may `{consume:true}` |
| 2 | Intercept Esc | **Reachable** (overlay owns it while focused) | TUI routes Esc only to the focused component; overlay takes focus on mount. `escape` is a default key for `app.interrupt` / `tui.select.cancel`, but those matchers run in the editor/app listeners, which are not focused while an overlay is up. TUI itself only uses Esc for a render-grace hint |
| 3 | Own the status line | **Partial** — `setStatus` adds a segment; `setFooter`/`setHeader` are NO-OPs in interactive | `setStatus(key,text)` → `StatusLineComponent.setHookStatus`; `setFooter: () => {}` / `setHeader: () => {}` in interactive controller (also no-op in runner/session/RPC) |
| 4 | Render outside the overlay region (transcript/scrollback) | **Partial** — widgets above/below editor + custom message renderers; no raw scrollback painting | `setWidget(key, content, {placement:"aboveEditor"\|"belowEditor"})`; `registerMessageRenderer(customType, renderer)` + `sendMessage`/`appendEntry` render into the transcript container. No ExtensionUIContext API exposes TUI children/scrollback |
| 5 | Replace the editor area | **Reachable** | non-overlay `custom()` sets `editorReplaced`, clears `editorContainer`, `addChild(component)`; plus `setEditorComponent(factory)` |
| 6 | Call `tui.showOverlay` directly | **Reachable** (unsanctioned) | factory receives the real `TUI` (`this.ctx.ui`); `TUI.showOverlay` is public. Bypasses controller cleanup/overlayHandle tracking |
| 7 | Terminal title / notify / widgets | **Reachable** | `setTitle(title)` → `setExtensionTerminalTitle`; `notify(message,type)` → showError/showWarning/showStatus; `setWidget(...)` |
| 8 | Fullscreen alt-screen overlay | **Reachable via `overlayOptions`** | `ExtensionCustomOptions.overlayOptions: OverlayOptions \| (() => OverlayOptions)` forwarded verbatim to `showOverlay`; `OverlayOptions.fullscreen`; `mouseTracking` defaults on |
| 9 | Access / rebind KeybindingsManager | **Partial** — read/match only | factory 3rd arg is `KeybindingsManager.inMemory()` (defaults only, not the user's file). No `ExtensionUIContext`/`ExtensionContext` API to rebind the user's bindings; the global manager is only reachable via the unsanctioned `getKeybindings()`/`setKeybindings()` exports |

Per-row evidence, verbatim:

1. `registerShortcut` (verbatim, `PI_CA src/extensibility/extensions/types.ts:1529-1536`):

```ts
	/** Register a keyboard shortcut. */
	registerShortcut(
		shortcut: KeyId,
		options: {
			description?: string;
			handler: (ctx: ExtensionContext) => Promise<void> | void;
		},
	): void;
```

Dispatch (verbatim, `PI_CA src/modes/controllers/input-controller.ts:2836-2858`):

```ts
	registerExtensionShortcuts(): void {
		const runner = this.ctx.session.extensionRunner;
		if (!runner) return;

		const shortcuts = runner.getShortcuts();
		for (const [keyId, shortcut] of shortcuts) {
			this.ctx.editor.setCustomKeyHandler(keyId, () => {
				// Bound once at startup; a live `disabledExtensions` edit may have suspended the owner since.
				if (!runner.isExtensionActive(shortcut.extensionPath)) return;
				const ctx = runner.createCommandContext();
				try {
					runner.runScoped(() => shortcut.handler(ctx));
				} catch (err) {
					runner.emitError({
						extensionPath: shortcut.extensionPath,
						event: "shortcut",
						error: err instanceof Error ? err.message : String(err),
						stack: err instanceof Error ? err.stack : undefined,
					});
				}
			});
		}
	}
```

- Custom key handlers are consulted inside the EDITOR's `handleInput`, after per-action interception and before `#forwardInput` — path: PI_TUI src/prompt/custom-editor.ts:1526-1528, 1655-1674, 1677-1678 — fetch 2026-10-06 — confidence: primary
- Caveat: `setCustomKeyHandler` is editor-scoped; while a different component holds focus (e.g. an extension overlay), the shortcut does not fire — path: PI_TUI src/prompt/custom-editor.ts:1669-1674 + src/tui.ts:2781-2789 — fetch 2026-10-06 — confidence: secondary

1b. `onTerminalInput` (verbatim, `PI_CA src/extensibility/extensions/types.ts:291-292`):

```ts
	/** Listen to raw terminal input (interactive mode only). Returns an unsubscribe function. */
	onTerminalInput(handler: TerminalInputHandler): () => void;
```

```ts
/** Raw terminal input listener for extensions. */
export type TerminalInputHandler = (data: string) => { consume?: boolean; data?: string } | undefined;
```

- Wired to `this.ctx.ui.addInputListener(handler)`; listeners run before focus dispatch and may consume or rewrite — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1211-1218; PI_TUI src/tui.ts:2228-2237, 2734-2749 — fetch 2026-10-06 — confidence: primary
- Listener ordering: `Set` iteration order = insertion order; coding-agent's own listeners are installed in `setupKeyHandlers()` at startup, so extension listeners registered later run after them — path: PI_TUI src/tui.ts:873, 2734-2749; PI_CA src/modes/controllers/input-controller.ts:319-455 — fetch 2026-10-06 — confidence: secondary

2. Esc routing (verbatim, `PI_TUI src/tui.ts:2776-2789`):

```ts
		// Pass input to focused component (including Ctrl+C).
		// The focused component can decide how to handle Ctrl+C.
		// Opted-in components only dirty their focused subtree. Unregistered
		// components retain the legacy full compose because their callbacks may
		// mutate siblings; focus changes also require the new surface to paint.
		const focused = this.#focusedComponent;
		if (focused?.handleInput) {
			// Filter out key release events unless component opts in
			if (isKeyRelease(data) && !focused.wantsKeyRelease) {
				return;
			}
			focused.handleInput(data);
			this.requestRender();
		}
```

- No fallthrough: if the focused overlay ignores Esc, no other component receives it — path: PI_TUI src/tui.ts:2781-2789 — fetch 2026-10-06 — confidence: primary
- `showOverlay` focuses the overlay when visible: `if (this.#isOverlayVisible(entry)) { this.setFocus(component); }` — path: PI_TUI src/tui.ts:1217-1223 — fetch 2026-10-06 — confidence: primary
- Default bindings that claim Esc: `"app.interrupt": { defaultKeys: "escape", description: "Interrupt current operation" }` and `"tui.select.cancel": { defaultKeys: ["escape", "ctrl+c"], description: "Cancel selection" }` — path: PI_TUI src/app-keybindings.ts:88-91; PI_TUI src/keybindings.ts:138-141 — fetch 2026-10-06 — confidence: primary
- Those bindings are consumed by editor/app code, not by the TUI: `CustomEditor` calls `this.onEscape?.()` when `#matchesAction(canonical, "app.interrupt")`, and `onEscape` is set by `input-controller.ts:455`; selectors use `matchesSelectCancel` (keybinding-matchers.ts:32-34). Neither runs unless the owning component is focused — path: PI_TUI src/prompt/custom-editor.ts:1595-1603, PI_CA src/modes/controllers/input-controller.ts:455-467, PI_TUI src/keybinding-matchers.ts:32-34 — fetch 2026-10-06 — confidence: primary
- TUI's only built-in Esc special-case is a render-grace hint: `if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape")) { this.#inputRenderGraceUntilMs = … }` — path: PI_TUI src/tui.ts:2728-2733 — fetch 2026-10-06 — confidence: primary
- Coding-agent global input listeners defensively defer while an overlay is up (`if (this.ctx.ui.hasOverlay()) return undefined;`), so they do not steal Esc from an overlay — path: PI_CA src/modes/controllers/input-controller.ts:371-445 — fetch 2026-10-06 — confidence: primary
- Built-in overlays treat Esc as close: report-panel `if (matchesSelectCancel(data)) { this.#onClose(); return; }` — path: PI_TUI src/overlays/report-panel.ts:162-165 — fetch 2026-10-06 — confidence: primary

3. Status line methods (verbatim, `PI_CA src/extensibility/extensions/types.ts:288-310`):

```ts
	/** Show a notification to the user. */
	notify(message: string, type?: "info" | "warning" | "error"): void;

	/** Listen to raw terminal input (interactive mode only). Returns an unsubscribe function. */
	onTerminalInput(handler: TerminalInputHandler): () => void;

	/** Set status text in the footer/status bar. Pass undefined to clear. */
	setStatus(key: string, text: string | undefined): void;

	/** Set the working/loading message shown during streaming. Call with no argument to restore default. */
	setWorkingMessage(message?: string): void;

	/** Set a widget to display above or below the editor. Accepts string array or component factory. */
	setWidget(key: string, content: ExtensionWidgetContent, options?: ExtensionWidgetOptions): void;

	/** Set a custom footer component, or undefined to restore the built-in footer. */
	setFooter(factory: ExtensionUiComponentFactory | undefined): void;

	/** Set a custom header component, or undefined to restore the built-in header. */
	setHeader(factory: ExtensionUiComponentFactory | undefined): void;

	/** Set the terminal window/tab title. */
	setTitle(title: string): void;
```

- Interactive controller implements `setStatus` → `statusLine.setHookStatus(key,text)` and `setTitle` → `setExtensionTerminalTitle(title)`, but `setFooter: () => {}` and `setHeader: () => {}` — path: PI_CA src/modes/controllers/extension-ui-controller.ts:134-137, 163-164, 576-579 — fetch 2026-10-06 — confidence: primary
- Same no-ops elsewhere: `runner.ts:462-463` (noOp context), `agent-session.ts:573-574`, `rpc-mode.ts:1394-1400` ("Custom footer not supported in RPC mode - requires TUI access") — path: PI_CA src/extensibility/extensions/runner.ts:462-463; PI_CA src/session/agent-session.ts:573-574; PI_CA src/modes/rpc/rpc-mode.ts:1394-1400 — fetch 2026-10-06 — confidence: primary
- `setHookStatus` only appends a sorted segment list; it does not replace the built-in status line — path: PI_TUI src/status-line/component.ts:1124-1135 — fetch 2026-10-06 — confidence: primary

4. Outside-the-overlay rendering (verbatim, `PI_CA src/extensibility/extensions/types.ts:236-240` + `1558-1559` + `1602-1603`):

```ts
export type WidgetPlacement = "aboveEditor" | "belowEditor";

export interface ExtensionWidgetOptions {
	placement?: WidgetPlacement;
}
```

```ts
	/** Register a custom renderer for CustomMessageEntry. */
	registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
```

```ts
	/** Append a custom entry to the session for state persistence (not sent to LLM). */
	appendEntry<T = unknown>(customType: string, data?: T): void;
```

- Widget content accepts `string[]` (truncated at `MAX_WIDGET_LINES`) or a factory `(tui, theme) => ExtensionUiComponent`, mounted above/below the editor — path: PI_CA src/modes/controllers/extension-ui-controller.ts:338-351, 359-373 — fetch 2026-10-06 — confidence: primary
- Custom message renderer receives `(message, options, theme) => Component | undefined` and is rendered into `chatContainer` via `CustomMessageComponent` — path: PI_TUI src/chat/extension-types.ts:11-19, 38-46; PI_CA src/modes/utils/ui-helpers.ts:255-258 — fetch 2026-10-06 — confidence: primary
- `ExtensionUiComponentFactory = (tui: TUI, theme: Theme) => ExtensionUiComponent` — the widget factory also receives the TUI — path: PI_TUI src/chat/extension-types.ts:5-7 — fetch 2026-10-06 — confidence: primary
- `ExtensionUIContext` exposes no transcript/scrollback component handle; the transcript container lives on the mode (`chatContainer`) and is not reachable from the UI context object — path: PI_CA src/modes/interactive-mode.ts:1195-1197; PI_CA src/modes/controllers/extension-ui-controller.ts:126-168 (full object literal) — fetch 2026-10-06 — confidence: primary
- `Component.retireDisplacedTranscript?: boolean` exists but is a component-level flag for inline decision panels inside the editor container, not an extension painting API — path: PI_TUI src/tui.ts:251-253 — fetch 2026-10-06 — confidence: secondary

5. Editor replacement (verbatim, `PI_CA src/modes/controllers/extension-ui-controller.ts:1183-1202`):

```ts
				if (options?.overlay) {
					const overlayOptions =
						typeof options.overlayOptions === "function" ? options.overlayOptions() : options.overlayOptions;
					overlayHandle = this.ctx.ui.showOverlay(
						component,
						overlayOptions ?? {
							anchor: "bottom-center",
							width: "100%",
							maxHeight: "100%",
							margin: 0,
						},
					);
					options.onHandle?.(overlayHandle);
					return;
				}
				editorReplaced = true;
				this.ctx.editorContainer.clear();
				this.ctx.editorContainer.addChild(component);
				this.ctx.ui.setFocus(component);
				this.ctx.ui.requestRender();
```

- Non-overlay mode replaces the editor slot and restores editor text on `done` (`cleanup` re-adds `this.ctx.editor` and `setText(savedText)`) — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1144-1155 — fetch 2026-10-06 — confidence: primary
- Overlay default options are exactly `{anchor:"bottom-center", width:"100%", maxHeight:"100%", margin:0}` (no `fullscreen`) — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1188-1193 — fetch 2026-10-06 — confidence: primary
- `setEditorComponent(factory: ((tui, theme: EditorTheme, keybindings) => CustomEditor) | undefined)` is a separate, persistent editor swap — path: PI_CA src/extensibility/extensions/types.ts:353-362 — fetch 2026-10-06 — confidence: primary

6. Direct `showOverlay` (verbatim, `PI_CA src/extensibility/extensions/types.ts:312-321`):

```ts
	/** Show a custom component with keyboard focus. */
	custom<T>(
		factory: (
			tui: TUI,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => ExtensionUiComponent | Promise<ExtensionUiComponent>,
		options?: ExtensionCustomOptions,
	): Promise<T>;
```

- The factory's first arg is the live `TUI` (`this.ctx.ui`, typed `ui: TUI` on the mode) — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1176; PI_CA src/modes/interactive-mode.ts:1194 — fetch 2026-10-06 — confidence: primary
- `TUI.showOverlay(component: Component, options?: OverlayOptions): OverlayHandle` is public — path: PI_TUI src/tui.ts:1217 — fetch 2026-10-06 — confidence: primary
- Other public TUI members the factory could reach: `hideOverlay`, `hasOverlay`, `setFocus`, `getFocused`, `requestRender`, `terminal`, `addInputListener`, `removeInputListener`, `setInlineMouseTrackingProvider`, `getMutableViewport`, `showOverlay` — path: PI_TUI src/tui.ts:1160-1317, 2228-2237 — fetch 2026-10-06 — confidence: primary
- Extension-side direct `showOverlay` is not tracked by `showHookCustom`'s cleanup (which only hides its own `overlayHandle`) — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1144-1155 — fetch 2026-10-06 — confidence: secondary

7. Title/notify/widgets: covered by quotes in row 3/4; `notify` maps to `showError`/`showWarning`/`showStatus` — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1113-1121 — fetch 2026-10-06 — confidence: primary
- `setTitle` writes an override on the terminal-title runtime: `terminalTitleRuntime.extensionOverride = sanitizeTerminalTitlePart(title); emitTerminalTitle();` — path: PI_CA src/utils/title-generator.ts:703-711 — fetch 2026-10-06 — confidence: primary

8. Fullscreen via overlayOptions (verbatim, `PI_CA src/extensibility/extensions/types.ts:242-252`):

```ts
/** Options for `ExtensionUIContext.custom()` (overlay rendering of a custom component). */
export interface ExtensionCustomOptions {
	/** Render the component as an overlay over the transcript instead of replacing the editor area. */
	overlay?: boolean;
	/** Static or lazily resolved overlay positioning/sizing options forwarded to `showOverlay`. */
	overlayOptions?: OverlayOptions | (() => OverlayOptions);
	/** Invoked with the overlay handle once the overlay is created (overlay mode only). */
	onHandle?: (handle: OverlayHandle) => void;
	/** Abort the custom UI and reject its promise. */
	signal?: AbortSignal;
}
```

- `OverlayOptions`/`OverlayHandle` are re-exported from the extension types module: `export type { OverlayHandle, OverlayOptions } from "@oh-my-pi/pi-tui";` — path: PI_CA src/extensibility/extensions/types.ts:139 — fetch 2026-10-06 — confidence: primary
- Therefore `overlayOptions: {fullscreen:true}` is forwarded verbatim (no allowlist/filter) — path: PI_CA src/modes/controllers/extension-ui-controller.ts:1184-1194 — fetch 2026-10-06 — confidence: primary
- With `fullscreen:true` and `mouseTracking` unset, SGR reporting turns on, so `handleInput` receives `\x1b[<…M/m` strings — path: PI_TUI src/tui.ts:3566-3573, 473-477 — fetch 2026-10-06 — confidence: primary
- `OverlayAnchor` union for reference: `"center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center" | "left-center" | "right-center"` — path: PI_TUI src/tui.ts:388-397 — fetch 2026-10-06 — confidence: primary

9. KeybindingsManager (verbatim, `PI_CA src/modes/controllers/extension-ui-controller.ts:1135-1136`):

```ts
		const savedText = this.ctx.editor.getText();
		const keybindings = KeybindingsManager.inMemory();
```

```ts
	/**
	 * Create an in-memory keybindings manager without file persistence.
	 */
	static inMemory(userBindings: KeybindingsConfig = {}): KeybindingsManager {
		return new KeybindingsManager(userBindings);
	}
```

- Interactive mode's real manager is `KeybindingsManager.create()` (loads `agentDir/keybindings.yml` and sets it global); the factory gets a defaults-only in-memory instance instead — path: PI_CA src/modes/interactive-mode.ts:2031; PI_TUI src/app-keybindings.ts:595-608 — fetch 2026-10-06 — confidence: primary
- Global manager accessors exist (`getKeybindings()`, `setKeybindings()`) but are not surfaced on `ExtensionUIContext` or `ExtensionContext` — path: PI_TUI src/keybindings.ts:342-349; PI_CA src/extensibility/extensions/types.ts:266-381 (full interface) and 485-527 (ExtensionContext head) — fetch 2026-10-06 — confidence: primary
- `KeybindingsManager` is re-exported for extensions: `export type { AppKeybinding, KeybindingsManager } from "@oh-my-pi/pi-tui/app-keybindings";` — path: PI_CA src/extensibility/extensions/types.ts:140 — fetch 2026-10-06 — confidence: primary
- omp://tui.md states the same for the factory arg: "Extension UI factories receive a `KeybindingsManager` (interactive mode; an in-memory instance carrying the default bindings, not the user's `keybindings.yml`)" — omp://tui.md "Match app keybinding actions" — fetch 2026-10-06 — confidence: primary

## Searches

- `grep -n "MouseRoutable|handleMouse|mouseTracking|MOUSE_TRACKING" PI_TUI/src` — located all mouse producers/consumers.
- `grep -n "routeMouse" PI_TUI/src/tui.ts` — 0 hits → no automatic routing in the engine.
- `grep -n "escape" PI_TUI/src/tui.ts` — only render-grace + ANSI parsing; no Esc interception.
- `grep -rn "new Markdown(" PI_TUI/src PI_CA/src` — all built-in call sites.
- `grep -rn "new Table(" PI_TUI/src PI_CA/src` — 0 hits for the class; only `renderTableRow` used.
- `grep -rn "setFooter|setHeader" PI_CA/src` — every implementation is a no-op.
- `grep -rn "setFrameProvider" PI_TUI/src PI_CA/src` — set only by `prompt/composer.ts:297`.
- `grep -rn "showOverlay" PI_CA/src` — every built-in mount option set.
- `grep -rn "registerShortcut|setCustomKeyHandler" PI_CA/src PI_TUI/src` — shortcut plumbing end-to-end.
- `read omp://theme.md`, `read omp://tui.md` — official guidance for tokens and TUI contract.

## Conflicting evidence

- omp://tui.md says "In interactive extension/custom UI, `custom(..., { overlay: true })` mounts your component through `TUI.showOverlay(...)`". True, but the doc does not state that a non-fullscreen overlay receives NO SGR mouse reports. Engine code (tui.ts:3566-3573) shows mouse reporting is `"off"` for any non-fullscreen topmost overlay, so an extension must pass `overlayOptions:{fullscreen:true}` to get pointer events. Doc vs code: code wins for the reachability verdict.
- omp://theme.md says "Extension renderer callbacks may also use their supplied theme argument" and the sample imports `theme` from `@oh-my-pi/pi-coding-agent`. Both work: the `custom` factory gets the same live binding (`extension-ui-controller.ts:1176`) and the root re-exports the theme module (`index.ts:38`). No conflict, two equivalent access paths.
- `MouseRoutable` is documented as the opt-in interface, but the TUI never calls `routeMouse`; only layout containers and overlay hosts do. `MouseRoutable` is therefore a convention, not an engine contract. [INFERENCE from grep evidence, primary sources]
- `report-panel.ts` is mounted by built-ins (report sheet) and handles wheel in `handleInput`, but its mount at `command-controller.ts:185,190` passes no `fullscreen`, so its wheel branch is only reachable on native/alt paths — path: PI_CA src/modes/controllers/command-controller.ts:185-196 — fetch 2026-10-06 — confidence: secondary

## Gaps

- Native (Tern Surface Protocol) mouse path is separate (`NativeUiEvent`, `describeScreen`, `handleNativeEvent`) and was not traced for extension components; extension components that only implement `render` fall back to rows (`Component.describe?` optional), so native pointer actions on extension UI are unverified.
- Whether `TUI.showOverlay` called directly by an extension is sanitized/rejected at runtime (vs only untracked) was not tested; no guard was found in `showOverlay` itself.
- Exact behavior when an extension's `onTerminalInput` handler is registered before coding-agent listeners (early load order) was not measured; the Set ordering claim is secondary.
- No in-repo extension in `PI_CA/src/extensibility/custom-commands/bundled/` was checked for a working `overlayOptions:{fullscreen:true}` + mouse example; the reachability verdict rests on the option passthrough at `extension-ui-controller.ts:1184-1194`.
- `Theme` instance identity vs `bindTheme` mirroring for bundled extension modules was read but not exercised across a live theme switch.
