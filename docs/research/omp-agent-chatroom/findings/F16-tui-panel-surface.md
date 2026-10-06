# F16 Chatroom TUI Design

## Angle

Design the human-facing chatroom panel an omp extension mounts via `ctx.ui.custom(..., {overlay:true})`:
panel layouts, chat/board/roster panes, input model, lifecycle, theme/mouse, and the hard limits
versus a built-in overlay. Kept from round-3 research: the verbatim `Component` contract and
constructor signatures for every pi-tui primitive, the `agent-hub.ts` reference tree, and the
`custom()` lifecycle facts. Every claim traces to
`~/.bun/install/global/node_modules/@oh-my-pi/pi-tui/src` (alias `PI_TUI`),
`~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src` (alias `PI_CA`), or an `omp://`
doc, fetched 2026-10-06.

Footnote (deferred): the round-2 "ctrl+s collision" question — `ctrl+s` is the default keybinding
for `app.session.observe` (Agent Hub) while `ctrl+s` is not on the reserved-shortcut denylist, so an
extension `registerShortcut("ctrl+s", …)` and the built-in observe action can both claim it; that is
out of scope here. Sources: PI_TUI src/app-keybindings.ts:200-203; PI_CA
src/extensibility/extensions/runner.ts:1211-1229.

## Claims

### 1. The exact `Component` contract (required)

- **Only `render(width)` is REQUIRED.** Every other member is optional (`?`). Verbatim:
  ```ts
  // PI_TUI src/tui.ts:233-324
  export interface Component {
  	debugId?: string;
  	debugKind?: string;
  	debugState?(): Record<string, unknown>;
  	debugChildren?: readonly Component[];

  	render(width: number): readonly string[];

  	readonly retireDisplacedTranscript?: boolean;

  	describe?(cx: DescribeContext): NativeNode | null;

  	nativeOverlay?: {
  		role?: string;
  		head?: TspText;
  		size?: "sm" | "md" | "lg" | "full";
  		anchor?: "center" | "top" | "bottom";
  	};

  	nativeSheet?(cx: DescribeContext): boolean;

  	describeScreen?(cx: DescribeContext): NativeScreen;

  	handleNativeEvent?(event: NativeUiEvent): void;

  	handleInput?(data: string): void;

  	wantsKeyRelease?: boolean;

  	invalidate?(): void;
  	setIgnoreTight?(ignore: boolean): any;

  	dispose?(): void;
  }
  ```
  — PI_TUI src/tui.ts:233-324 — fetch 2026-10-06 — confidence: primary
- **No `height`/`measure` on `Component`.** Overlay size = `render(width)` row count clamped by
  `OverlayOptions.maxHeight`; width from `OverlayOptions.width`. `SplitPane`/`Stack`/`Row`/
  `ScrollView` expose explicit `setHeight`/`measure` on their own classes. — PI_TUI
  src/tui.ts:2816-2911 — fetch 2026-10-06 — confidence: primary
- **Render contract is reference-based.** The returned array belongs to the component; callers MUST
  NOT mutate; an unchanged component MAY (should) return the same array; a changed component MUST
  return a fresh array. A component mutating a returned array in place must implement
  `RenderStablePrefix`. — PI_TUI src/tui.ts:220-232 — fetch 2026-10-06 — confidence: primary
- **`Focusable` is what makes a component receive keys**:
  ```ts
  // PI_TUI src/tui.ts:350-355
  export interface Focusable {
  	focused: boolean;
  	setUseTerminalCursor?(useTerminalCursor: boolean): void;
  }
  // PI_TUI src/tui.ts:370-373
  export function isFocusable(component: Component | null): component is Component & Focusable {
  	return component !== null && "focused" in component;
  }
  ```
  — PI_TUI src/tui.ts:350-373 — fetch 2026-10-06 — confidence: primary
- `ExtensionUiComponent` is exactly `Component & { dispose?(): void }`; the factory type is
  `(tui: TUI, theme: Theme) => ExtensionUiComponent`. — PI_TUI src/chat/extension-types.ts:5-7 — fetch 2026-10-06 — confidence: primary
- `OverlayFocusOwner.ownsOverlayFocusTarget(component)` lets an overlay root declare which inner
  component owns keys (so an overlay wrapping an `Input` still gets `handleInput`). — PI_TUI
  src/tui.ts:326-337 — fetch 2026-10-06 — confidence: primary

### 2. Verbatim constructor signatures (all root-exported)

`pi-tui/src/index.ts:4-36` re-exports every component module; the package `exports` map has `"./*"`
→ `./src/*.ts` and `"./components/*"` wildcards, so deep imports resolve. — PI_TUI src/index.ts:4-36,
PI_TUI package.json exports — fetch 2026-10-06 — confidence: primary

| Component | File | Root export | Implements | Ctor args |
|---|---|---|---|---|
| Box | components/box.ts:42 | index.ts:7 | Component | 4 |
| Text | components/text.ts:26 | index.ts:33 | Component | 4 |
| ScrollView | components/scroll-view.ts:112 | index.ts:25 | Component | 2 |
| ScrollViewport | components/scroll-viewport.ts | index.ts:26 | **utility only** | — |
| TabBar | components/tab-bar.ts:60 | index.ts:31 | Component | 4 |
| Table | components/table.ts:94 | index.ts:32 | Component | 3 |
| KeyValueList | components/key-value-list.ts:33 | index.ts:15 | Component | 2 |
| Markdown | components/markdown.ts:1898 | index.ts:21 | Component | 6 |
| SplitPane | components/layout/split-pane.ts:80 | index.ts:18 | Component+MouseRoutable | 1 |
| Row | components/layout/row.ts:85 | index.ts:17 | Component+MouseRoutable | 1 |
| Stack | components/layout/stack.ts:76 | index.ts:19 | Component+MouseRoutable | 1 |
| Geometry | components/layout/geometry.ts | index.ts:16 | **utility only** | — |
| Section | components/section.ts:39 | index.ts:27 | Component | 1 |
| Spacer | components/spacer.ts:16 | index.ts:30 | Component | 1 |
| TruncatedText | components/truncated-text.ts:10 | index.ts:35 | Component | 3 |
| SelectList | components/select-list.ts:158 | index.ts:28 | Component+MouseRoutable | 4 |
| ProgressBar | components/progress-bar.ts:89 | index.ts:24 | Component | 2 |
| MetricRow | components/metric.ts:87 | index.ts:23 | Component | 2 |
| MenuSelection | components/menu-selection.ts:80 | index.ts:22 | **state class, no render** | 3 |
| Input | components/input.ts:65 | index.ts:14 | Component+Focusable | 1 |
| Editor | components/editor.ts:593 | index.ts:11 | Component+Focusable | 1 |

— PI_TUI src/index.ts:4-36 + each file cited — fetch 2026-10-06 — confidence: primary

```ts
// box.ts:67
constructor(paddingX = 1, paddingY = 1, bgFn?: (text: string) => string, border?: BoxBorder)

// box.ts:27-37
export interface BoxBorder {
	chars: { topLeft: string; topRight: string; bottomLeft: string;
	         bottomRight: string; horizontal: string; vertical: string; };
	color?: (text: string) => string;
}

// text.ts:48
constructor(text: string = "", paddingX: number = 1, paddingY: number = 1, customBgFn?: (text: string) => string)

// scroll-view.ts:112,134
export class ScrollView implements Component {
	constructor(content: readonly string[] | Component, options: ScrollViewOptions)
}
// scroll-view.ts:29-50
export interface ScrollViewOptions {
	height: number;
	scrollbar?: ScrollbarMode | boolean;
	totalRows?: number;
	theme?: ScrollViewTheme;
	trackChar?: string;
	thumbChar?: string;
	ellipsis?: Ellipsis;
	fastScrollLines?: number;
	followTail?: boolean;
	anchor?: ScrollAnchor;
}

// tab-bar.ts:60,76
export class TabBar implements Component {
	constructor(label: string, tabs: Tab[], theme: TabBarTheme, initialIndex: number = 0)
}
// tab-bar.ts:20-29
export interface Tab { id: string; label: string; short?: string; muted?: boolean; }
// tab-bar.ts:32-45
export interface TabBarTheme {
	label: (text: string) => string; activeTab: (text: string) => string;
	inactiveTab: (text: string) => string; hint: (text: string) => string;
	mutedTab?: (text: string) => string; hoverTab?: (text: string) => string;
}

// table.ts:94,101
export class Table implements Component {
	constructor(rows: readonly (readonly TableCell[])[], columns: readonly TableColumn[], options: TableOptions = {})
}
// table.ts:9-30
export interface TableCell { readonly text: string; readonly style?: (text: string) => string; }
export interface TableColumn {
	readonly width: number; readonly minWidth?: number;
	readonly align: "left" | "right";
	readonly overflow: "allow" | "truncate";
	readonly priority?: number; readonly style?: (text: string) => string;
}
export interface TableOptions { readonly gap?: string; readonly indent?: string; readonly fit?: boolean; }

// key-value-list.ts:33,39
export class KeyValueList implements Component {
	constructor(rows: readonly KeyValueRow[], options: KeyValueListOptions)
}
// key-value-list.ts:8-22
export interface KeyValueRow {
	readonly label: string; readonly value: string;
	readonly labelStyle?: (text: string) => string;
	readonly valueStyle?: (text: string) => string;
}
export interface KeyValueListOptions {
	readonly indent?: string; readonly labelWidth: number; readonly gap?: string;
	readonly minValueWidth?: number; readonly labelOverflow?: "allow" | "truncate";
}

// markdown.ts:1898,1991-1998
export class Markdown implements Component {
	constructor(text: string, paddingX: number, paddingY: number, theme: MarkdownTheme,
	            defaultTextStyle?: DefaultTextStyle, codeBlockIndent: number = 2)
}
// markdown.ts:1422-1433
export interface DefaultTextStyle {
	color?: (text: string) => string; bgColor?: (text: string) => string;
	bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean;
}

// split-pane.ts:37-49,80,108
export interface SplitPaneOptions {
	left: LayoutContent; right: LayoutContent;
	leftSize?: SplitPaneSize; rightMinWidth?: number; splitAt?: number;
	narrowPane?: PaneSide; height?: number;
	prefix?: LayoutDecoration; divider?: LayoutDecoration; suffix?: LayoutDecoration;
	align?: LayoutAlignment;
}
export class SplitPane implements Component, MouseRoutable { constructor(options: SplitPaneOptions) }

// row.ts:40-47,85,97
export interface RowOptions {
	children: readonly RowChild[]; height?: number;
	gap?: LayoutDecoration; prefix?: LayoutDecoration; suffix?: LayoutDecoration;
	align?: LayoutAlignment;
}
export class Row implements Component, MouseRoutable { constructor(options: RowOptions) }

// stack.ts:37-41,76,85
export interface StackOptions { children: readonly StackChild[]; height?: number; align?: LayoutAlignment; }
export class Stack implements Component, MouseRoutable { constructor(options: StackOptions) }

// layout/geometry.ts:7-53
export type LayoutAlignment = "start" | "center" | "end";
export interface LayoutInsets { top?: number; right?: number; bottom?: number; left?: number; }
export interface LayoutRect { row: number; col: number; width: number; height: number; }
export type LayoutRenderer = (width: number, height: number | undefined) => readonly string[];
export type LayoutContent = Component | LayoutRenderer;
export type LayoutDecoration = string | (() => string);
export interface HeightConstrainedComponent extends Component { setHeight(height: number | undefined): void; }

// select-list.ts:158,186-191
export class SelectList implements Component, MouseRoutable {
	constructor(items: ReadonlyArray<SelectItem>, maxVisible: number,
	            theme: SelectListTheme, layout: SelectListLayoutOptions = {})
}

// input.ts:65,70 ; editor.ts:593,776
export class Input implements Component, Focusable { prompt = "> "; }
export class Editor implements Component, Focusable { constructor(theme: EditorTheme) }

// section.ts:39,45 / spacer.ts:16,21 / truncated-text.ts:10,18
constructor(options: SectionOptions)
constructor(lines: number = 1)
constructor(text: string, paddingX: number = 0, paddingY: number = 0)

// progress-bar.ts:89,95 ; metric.ts:87,93
constructor(value: number | undefined, options: ProgressBarOptions)   // options.style required
constructor(metrics: readonly MetricSpec[], options: MetricRowOptions = {})
```
— each file:lines above — fetch 2026-10-06 — confidence: primary

- `Input` public API: `getValue()`, `setValue(value)`, `getCursor()`, `handleInput(data): boolean`,
  `pasteText(text)`, `submit()`, `setVolatileText`, `render(width)`; `prompt` is a public field. — PI_TUI
  src/components/input.ts:70-365 — fetch 2026-10-06 — confidence: primary
- `Editor` public API: `onSubmit?: (text) => void|Promise<void>`, `setMaxHeight(maxHeight)`,
  `setText`, `getText`, `handleInput`. — PI_TUI src/components/editor.ts:743,776,947 — fetch 2026-10-06 — confidence: primary
- `ScrollView` public API used by panels: `setLines`, `setChild`, `setHeight`, `setTotalRows`,
  `setFollowTail`, `setAnchor`, `setScrollOffset`, `getScrollOffset`, `getMaxScrollOffset`,
  `scroll(delta)`, `page(delta)`, `scrollToTop/Bottom`, `setActiveRow`, `revealRange`,
  `handleScrollKey(data): boolean`. — PI_TUI src/components/scroll-view.ts:175-368 — fetch 2026-10-06 — confidence: primary
- `SelectList` is mouse-capable (`hitTest`, `setHoverIndex`, `handleWheel`, `clickItem`,
  `routeMouse`) and has `onSelect`/`onCancel`/`onSelectionChange`. — PI_TUI src/components/select-list.ts:182-289 — fetch 2026-10-06 — confidence: primary

### 3. Reference panels — how the built-ins do layout

**`agent-hub.ts` (roster + inspector) — the primary reference.**
```
AgentHubOverlayComponent extends Container implements SelectListMouseTarget   (:320-322)
├─ #frame: Stack                       (:427-435)
│   ├─ { content: #frameTop:     PanelRows, height: 1 }
│   ├─ { content: #split:        SplitPane, grow: 1 }       (:412-422)
│   │   ├─ left:  #renderRosterPane  (LayoutRenderer)
│   │   └─ right: #renderDetailPane  (LayoutRenderer)
│   │        leftSize: { ratio: 0.58, min: ROSTER_MIN_WIDTH=48 }
│   │        rightMinWidth: DETAIL_MIN_WIDTH=34
│   │        splitAt: SPLIT_MIN_WIDTH=96
│   │        narrowPane: "left"
│   ├─ { content: #frameDivider: PanelRows, height: 1 }
│   ├─ { content: #frameFooter:  PanelRows, height: 1 }
│   └─ { content: #frameBottom:  PanelRows, height: 1 }
└─ #transcriptOverlay: OverlayHandle + AgentTranscriptViewer (fullscreen child, :452-453, :640-655)
```
— PI_TUI src/overlays/agent-hub.ts:109-111, 320-322, 404-453 — fetch 2026-10-06 — confidence: primary

- **Narrow-terminal fallback (mirror this):** when `#split.mode !== "split"` (terminal < 96 cols),
  `Tab`/`\t` toggles `#narrowDetailsOpen`, and the split shows one pane via
  `this.#split.setNarrowPane(this.#narrowDetailsOpen ? "right" : "left")`; the title becomes
  `Agent Hub · <selectedId>`; Esc first clears the filter, then closes narrow details, then closes the
  hub. — PI_TUI src/overlays/agent-hub.ts:1762-1790, 2374-2440 — fetch 2026-10-06 — confidence: primary
- Frame rows written per render with `#frameTop.setLines([topBorderSplit(width,"Agent Hub",leftWidth)])`,
  `#frameDivider.setLines([dividerSplit(width,leftWidth)])`, `#frameFooter.setLines([row(hint,width)])`,
  `#frameBottom.setLines([bottomBorder(width)])`, then `#frame.setHeight(contentRows + 4)`. — PI_TUI
  src/overlays/agent-hub.ts:1762-1790 — fetch 2026-10-06 — confidence: primary
- Chrome helpers (all in `chrome/overlay-box.ts`): `topBorder(width,title,color?)`,
  `divider(width)`, `bottomBorder(width,color?)`, `row(content,width,color?)`,
  `topBorderSplit(width,title,sidebarWidth)`, `dividerSplit(width,sidebarWidth)`,
  `splitRow(sidebar,body,width,sidebarWidth)`, `splitBodyWidth(width,sidebarWidth)`. — PI_TUI
  src/chrome/overlay-box.ts:22-100 — fetch 2026-10-06 — confidence: primary
- Pane bodies are lazy `LayoutRenderer` closures that also record per-row hit maps
  (`#paneHitRows`), translated to frame lines via `#frame.childRect(1)?.row` after layout. — PI_TUI
  src/overlays/agent-hub.ts:404-412, 1786-1792 — fetch 2026-10-06 — confidence: primary
- Roster pane = summary lines + windowed entries (manual slice with `start`/`end` around the
  selection), each entry multi-line, padded to `rows`, with `hitRows` aligned per line. — PI_TUI
  src/overlays/agent-hub.ts:1821-1900 — fetch 2026-10-06 — confidence: primary
- Activity pane = header line (scope·filter·follow·search) + virtual window of rows with
  `… N earlier` overflow label; `#formatActivityRow` composes `cursor time glyph roleBadge agent title · summary`. — PI_TUI
  src/overlays/agent-hub.ts:1680-1761 — fetch 2026-10-06 — confidence: primary
- Key handling order: mouse first → hub toggle keys close → `1`/`2` section switch → search editing
  intercept → table/activity handler. — PI_TUI src/overlays/agent-hub.ts:566-601 — fetch 2026-10-06 — confidence: primary
- Live state: `registry.onChange` + `observers.onChange` → `#scheduleDataChange()` (coalesced) →
  `#refreshRows()` + `#requestRender()`; unref'd `setInterval(AGE_TICK_MS)`; `dispose()` unsubscribes,
  clears timers, closes the child overlay. — PI_TUI src/overlays/agent-hub.ts:474-504, 535-548, 1499-1511 — fetch 2026-10-06 — confidence: primary

**`btw-panel.ts` (streaming, display-only).** `BtwPanelComponent extends OverlayPanel`; children:
`#content: StreamingPanelContent` → sections `[Markdown | Text]`; **no `handleInput`** — the parent
routes `app.interrupt` to close; `#rebuild()` = `#native = undefined; #content.refresh();
#tui.requestComponentRender(this)`. — PI_TUI src/overlays/btw-panel.ts:22-51, 189-197 — fetch 2026-10-06 — confidence: primary

**`jobs-panel.ts` (master-detail, list + detail).** `JobsSheet implements Component` with
`JobsSheetSource { load(); inspect(id); cancel(id); close() }`; `handleInput` = Esc close / ↑↓ move /
`x` cancel; native memo keyed on `agent|jobs|selected|pids|exitCode|artifactId|tick`. — PI_TUI
src/overlays/jobs-panel.ts:66-75, 103-116, 118-155, 190-202 — fetch 2026-10-06 — confidence: primary

**`hub-frame.ts` (reusable fullscreen chrome).** `HubFrame` = `SplitPane` + `Stack` with
top/divider/footer/bottom `PanelRows`; methods `sidebarWidth(entries)`, `scrollSidebar(delta,rows,count)`,
`selectChipAt(strip,col)`, `renderFooter(width,hint,renderStrip?)`, `locate(row,col)`,
`render(width,height,entries,footer)`. Exports `SidebarEntry`, `StripChip`, `StripState`,
`ChipRange`, `SidebarStyle`, `moveStripSelection`, `describeHubSidebar`, `describeHubChips`,
`describeHubFrame`. — PI_TUI src/overlays/hub-frame.ts:13-48, 139-360 — fetch 2026-10-06 — confidence: primary

**`OverlayPanel` (inline boxed chrome).** `constructor(title = "", role = "omp.overlay")`,
`addChild/removeChild/clear`, `renderContent(width)`, `invalidate()`, `dispose()` (propagates),
`setIgnoreTight`, `render(width)`; top border exactly one row, content inset 2 cols each side. — PI_TUI
src/chrome/overlay-box.ts:218-330 — fetch 2026-10-06 — confidence: primary

**`report-panel.ts` / `session-info-overlay.ts` (scrollable body).** `OverlayPanel` + `ScrollView`
+ footer; `handleInput` = Esc close + `#scrollView.handleScrollKey(data)`. — PI_TUI
src/overlays/report-panel.ts:74-97,151-185; session-info-overlay.ts:118-147 — fetch 2026-10-06 — confidence: primary

### 4. Panel layout proposals (recommended + alternatives)

All three use the agent-hub visual language: `Stack` frame with `PanelRows` chrome rows, a
`SplitPane` body, `LayoutRenderer` panes, and `topBorderSplit`/`dividerSplit`/`bottomBorder`.

**Layout A — Room (2-pane: Chat | Board), roster folded into the chat header — RECOMMENDED.**
```
Stack
├─ frameTop    (1)  topBorderSplit(width, "Room #general", chatWidth)   + topic · unread · T0/T1/T2 counts
├─ SplitPane   (grow)
│   ├─ left  (ratio 0.62, min 40): CHAT STREAM
│   │     header line: roster presence strip (● agent × N, unread dots) — 1 row, no separate pane
│   │     ScrollView(followTail:true, height) over message rows
│   ├─ right (rightMinWidth 30): BOARD
│   │     ScrollView over claim rows (Table or formatted lines)
├─ frameDivider(1)  dividerSplit(width, chatWidth)
├─ frameFooter (1)  hint row: j/k select · enter detail · p post · r release · o jump-to-agent · esc close
└─ frameBottom (1)  bottomBorder(width)
```
Rationale: chat is the dominant surface and wants the most columns; the board is narrow tabular
data; roster presence is a one-line strip (the room's presence is small — a handful of agents) so it
does not deserve a column. Narrow fallback: `splitAt: 88`, `narrowPane: "left"`, `Tab` toggles
`narrowDetailsOpen` to the board (agent-hub's exact pattern). — design inference over PI_TUI
src/overlays/agent-hub.ts:412-422, 2374-2440 — confidence: speculative

**Layout B — Room (3-pane: Roster | Chat | Board), hub-frame chrome.**
```
HubFrame(title="Room #general", sidebarBounds={min:18,max:28},
         renderSidebar=roster, renderBody=chat, footer=hints)
  body: SplitPane  left = CHAT (grow)  right = BOARD (ratio 0.32, min 28)
```
Use `HubFrame` so sidebar/border/hit-testing come for free (`sidebarWidth`, `scrollSidebar`,
`selectChipAt`, `locate`). Cost: on a 100-col terminal three panes leave ~50 cols for chat. — design
inference over PI_TUI src/overlays/hub-frame.ts:139-215 — confidence: speculative

**Layout C — Tabs (Chat | Board | Roster) in one full-width pane.**
`TabBar(label="", tabs=[chat,board,roster], theme, 0)` + a single `ScrollView` body;
`onTabChange` swaps the renderer; `showHint=false` when the footer carries the hint. Cheapest to
build, best for narrow terminals, but loses the "see the room at a glance" simultaneity. — design
inference over PI_TUI src/components/tab-bar.ts:60-100 — confidence: speculative

**Recommendation: Layout A**, with Layout C as the narrow-terminal mode (`splitAt` already collapses
to one pane — in narrow mode show the chat, `Tab` → board, `Tab` again → chat; roster stays the
header strip). Layout B only if the roster genuinely needs per-agent detail rows.

### 5. Chat pane design (panel-internal only)

Scope note: **inline transcript rendering** — `registerMessageRenderer`, the `irc:incoming` /
`irc:relay` native cards, `room:*` custom-message cards, ctrl+o expand/collapse, and
`renderCall`/`renderResult` for the room/wait tools — is owned by M5 and is **out of scope here**.
This section covers only how the panel draws its own chat stream inside the overlay.

- **Message row composition** (plain styled lines, not a component per message, to match
  agent-hub's activity rows and avoid per-frame component churn):
  `[unread marker][tier badge][time] author › topic · body(first line)`, continuation lines indented.
  `#formatActivityRow` is the exact precedent for this prefix+bold-agent+dot+summary shape. — PI_TUI
  src/overlays/agent-hub.ts:1745-1761 — fetch 2026-10-06 — confidence: primary
- **Author/ts/topic**: use `theme.fg("dim", clock)` for time, `theme.bold(agent)` for author,
  `theme.fg("muted"/"success", text)` for body, `theme.sep.dot` as the separator glyph. — PI_TUI
  src/overlays/agent-hub.ts:1750-1761; src/theme/theme-class.ts:574-592 — fetch 2026-10-06 — confidence: primary
- **Tier badge at a glance (T0/T1/T2)**: a one-glyph prefix with a distinct tone —
  `theme.status.error` for T0 (interrupt), `theme.status.warning` for T1 (step-boundary),
  `theme.status.info`/`muted` for T2 (pull-only). `theme.status.*` is the built-in glyph set for
  exactly this "state at a glance" role. — PI_TUI src/theme/theme-class.ts:485-500 — fetch 2026-10-06 — confidence: primary
- **Mention distinct**: wrap the mention in `theme.fg("accent", …)` + `theme.bold(...)`, and put a
  `theme.nav.cursor`-style marker in the unread gutter; the accent token is the built-in "attention"
  color. — PI_TUI src/theme/theme-class.ts:325-330, 501-510 — fetch 2026-10-06 — confidence: primary
- **Thread/reply indent**: prefix continuation rows with `theme.tree.vertical` /
  `theme.tree.branch` / `theme.tree.last` glyphs — the built-in tree glyph set exists for this. — PI_TUI
  src/theme/theme-class.ts:511-522 — fetch 2026-10-06 — confidence: primary
- **Scrolling / follow-newest**: `ScrollView` with `followTail: true`; it auto-follows appended rows
  while already at the tail and stops following once the user scrolls up (`setFollowTail` is driven
  by `getScrollOffset() >= getMaxScrollOffset()` in the built-in browser). — PI_TUI
  src/components/scroll-view.ts:134-160; src/chat/transcript-browser.ts:233-254 — fetch 2026-10-06 — confidence: primary
- **Unread marker**: a leading cell (`theme.nav.cursor` or a filled dot) on rows after the last-read
  cursor; track the cursor per room (round-2 per-agent cursors). — design inference — confidence: speculative
- **Long body**: render the message body with `Markdown` when it is multi-line/rich, otherwise plain
  `Text`; `new Markdown(text, 0, 0, getMarkdownTheme())` is the built-in btw-panel form. — PI_TUI
  src/overlays/btw-panel.ts:236-238 — fetch 2026-10-06 — confidence: primary
- Row primitives available to the pane: `Text`, `Markdown`, `Box`, `ScrollView`, `Table`,
  `TruncatedText`, `Spacer`, `PanelRows`. (Card-per-message chrome is M5's remit; the pane only
  needs rows.) — PI_TUI src/index.ts:7-35 — fetch 2026-10-06 — confidence: primary
- **Do NOT** build one component per message and re-render them all each frame; agent-hub renders
  only the visible window (manual slice) and keeps a `hitRows` map. — PI_TUI
  src/overlays/agent-hub.ts:1680-1760 — fetch 2026-10-06 — confidence: primary

### 6. Board pane design

- **Claim row shape**: `resource · holder · TTL/expiry · state`. Use `Table` for fixed columns
  (resource, holder, remaining) with `TableColumn { width, align, overflow:"truncate", priority }` so
  the holder column shrinks before the resource column under pressure. — PI_TUI
  src/components/table.ts:15-30 — fetch 2026-10-06 — confidence: primary
  Note: `new Table(` has 0 in-tree callers; built-ins use `renderTableRow(cells, columns, maxWidth?,
  options?)`. Either is fine; `renderTableRow` composes into a manual window like agent-hub's
  activity rows. — PI_TUI src/components/table.ts:72-101; src/overlays/agent-hub-renderer.ts:8 — fetch 2026-10-06 — confidence: primary
- **TTL/expiry**: render remaining time with the agent-hub `formatAge`/`formatMetricDuration` shape;
  color escalates as expiry nears (`theme.fg("warning", …)` under 25% remaining, `error` when
  expired). — design inference over PI_TUI src/overlays/agent-hub-renderer.ts:254-295 — confidence: speculative
- **Contended rows**: same resource held/requested by >1 agent → prefix with a contended glyph and
  `theme.status.warning`, and show the queue (`resource · holder · +N waiting`). — design inference — confidence: speculative
- **Live release/expiry**: the board must re-read the claim source every render (jobs-panel's
  `JobsSheetSource.load()` runs once per frame) and the panel re-renders on a timer plus on the
  room's change events; a settled/expired row moves to the bottom with a dimmed tone rather than
  vanishing mid-frame. — design inference over PI_TUI src/overlays/jobs-panel.ts:66-75, 118-155 — confidence: speculative
- **State source**: reuse round-2's structured claim board; the pane is a pure projection
  (`#projectClaims(rows) → string[]`), so it is unit-testable without the TUI. — design inference — confidence: speculative

### 7. Roster pane design

- **Reuse AgentRegistry data.** `AgentRecordLike` already carries `id`, `displayName`, `kind`
  (`"main"|"sub"|"advisor"`), `parentId?`, `status` (`"running"|"idle"|"parked"|"aborted"`),
  `session`, `sessionFile`, `createdAt`, `lastActivity`, `activity`, `history`, `lifecycle`. — PI_TUI
  src/overlays/agent-hub-types.ts:35-59 — fetch 2026-10-06 — confidence: primary
- **What Agent Hub already shows**: status glyph, displayName, id, model/role badge, task, current
  tool/last intent, usage metrics, context gauge, children — composed in `#renderDetailPanel` and the
  roster entry renderer. — PI_TUI src/overlays/agent-hub.ts:1821-1900, 2013-2075 — fetch 2026-10-06 — confidence: primary
- **What the room adds**: (a) **room cursor** — the agent's last-read position in the room
  (per-agent cursor from round 2), shown as a small offset/unread count; (b) **subscribed topics** —
  the room-specific subscription set; (c) **unread count** — Agent Hub's `IrcBusLike.unreadCount(id)`
  already exists and is exactly this. — PI_TUI src/overlays/agent-hub-types.ts:72-74 — fetch 2026-10-06 — confidence: primary
- **Status glyphs**: reuse `statusGlyph(status)` / `statusText(status, text)` / `statusDot` from
  `agent-hub-renderer.ts` rather than inventing new ones. — PI_TUI src/overlays/agent-hub-renderer.ts:64-100 — fetch 2026-10-06 — confidence: primary
- **Presence strip (Layout A header)**: one line `● 3 running · ○ 2 idle · ⏸ 1 parked` using
  `#statusCounts` (already maintained by agent-hub as `Record<AgentStatus, number>`). — PI_TUI
  src/overlays/agent-hub.ts:363-365 — fetch 2026-10-06 — confidence: primary

### 8. Input model — recommendation

**Recommend: read-only panel with actions, plus an optional composer only when the human opens the
"post" action.** Justification from the built-ins:
- Agent Hub's main table is **actions-only** (`Enter` opens transcript, `r` revive, `x` kill, `/`
  filter); only its nested `AgentTranscriptViewer` owns an `Editor` for sending. — PI_TUI
  src/overlays/agent-hub.ts:2374-2471; src/overlays/agent-transcript-viewer.ts:210-230, 485-530 — fetch 2026-10-06 — confidence: primary
- The transcript viewer's rule is the model to copy: **"once the reader starts typing, the editor
  owns every key"** — it checks `editorEmpty` before consuming scroll keys. — PI_TUI
  src/overlays/agent-transcript-viewer.ts:520-530 — fetch 2026-10-06 — confidence: primary
- A composer is cheap when needed: `new Editor(getEditorTheme())` + `setMaxHeight(4)` + `onSubmit`,
  or a single-line `Input` with a `prompt`. — PI_TUI src/overlays/agent-transcript-viewer.ts:214-218;
  src/components/input.ts:65-70 — fetch 2026-10-06 — confidence: primary
- Concretely: `p` (or `Enter` on a selected message's reply action) reveals a 1-line `Input` at the
  bottom; Esc returns to actions. Posting goes through the room's tool/command surface, not a new
  message path. Actions: `Enter` = open message/agent detail, `o` = jump to the agent's session
  (`focusAgent`), `r` = release a claim, `x` = kill/revive (as Agent Hub), `p` = post, `/` = filter,
  `Tab` = narrow-pane toggle, `Esc` = close. — design inference over PI_TUI
  src/overlays/agent-hub.ts:2374-2471 — confidence: speculative

### 9. Lifecycle

- **`ctx.ui.custom()` BLOCKS until `done(result)`.** Verbatim:
  ```ts
  // PI_CA src/extensibility/extensions/types.ts:312-321
  custom<T>(
  	factory: (
  		tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (result: T) => void,
  	) => ExtensionUiComponent | Promise<ExtensionUiComponent>,
  	options?: ExtensionCustomOptions,
  ): Promise<T>;
  ```
  The controller builds `Promise.withResolvers<T>()`, mounts, and resolves only from `close(result)`
  wired to `done`; factory throw / `options.signal` abort reject. — PI_CA
  src/extensibility/extensions/types.ts:312-321; src/modes/controllers/extension-ui-controller.ts:1135-1204 — fetch 2026-10-06 — confidence: primary
- **Consequence for a long-lived panel:** the awaiting handler is suspended for the panel's whole
  lifetime. Open it from a **slash command** (`registerCommand`) — the command handler is the
  natural long-lived frame and has no 30s handler budget. `registerCommand(name, { description?,
  getArgumentCompletions?, handler: (args, ctx) => Promise<void> })`; handler receives the raw arg
  string. — PI_CA src/extensibility/extensions/types.ts:1519-1527 — fetch 2026-10-06 — confidence: primary
  If opened from a dispatched event handler instead, the runner pauses the handler timeout budget
  once the component is returned (`timeoutBudget?.pause()`), but a factory that hangs before
  returning still burns the 30s budget. — PI_CA src/extensibility/extensions/runner.ts:221-238 — fetch 2026-10-06 — confidence: primary
- **Primary open = slash command; secondary = a configurable key.** A `registerShortcut` key is
  editor-scoped (see §10), so it should be a convenience, not the only route; make the key
  configurable via `registerFlag` rather than hardcoding. — PI_CA src/extensibility/extensions/types.ts:1529-1536 — fetch 2026-10-06 — confidence: primary
- **Mount** (identical to `SelectorController.#showFullscreenMenu` and agent-hub):
  ```ts
  const handle = ctx.ui.showOverlay(panel, {
    anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: 0, fullscreen: true,
  });
  ctx.ui.setFocus(panel);
  ctx.ui.requestRender();
  ```
  or the equivalent `ctx.ui.custom(factory, { overlay: true, overlayOptions: {…} })`, which forwards
  `overlayOptions` verbatim and calls `onHandle(handle)`. — PI_CA
  src/modes/controllers/selector-controller.ts:189-200; src/modes/controllers/extension-ui-controller.ts:1181-1196 — fetch 2026-10-06 — confidence: primary
- **Live refresh**: three sources, matching agent-hub — (1) change subscriptions
  (`registry.onChange` / the room's EventBus) coalesced through a debounce timer; (2) a slow unref'd
  `setInterval` for relative-age text and fallback polling; (3) `requestRender()` after any local
  mutation. `ctx.setInterval` is the managed variant (isolated callback, `unref`'d, auto-cleared on
  `session_shutdown`). — PI_TUI src/overlays/agent-hub.ts:496-504, 1499-1511; omp://extensions.md
  §"Background work" — fetch 2026-10-06 — confidence: primary
- **Re-render**: `requestRender(force = false, options?)` is coalesced via `#renderRequested`;
  `requestComponentRender(component)` is the scoped variant. A component can call either through the
  `tui` passed to the factory. — PI_TUI src/tui.ts:2525-2572 — fetch 2026-10-06 — confidence: primary
- **Close**: `Esc` in `handleInput` → `done(result)` (or `onDone()` when mounting directly);
  `done` calls `component.dispose?.()`, hides the overlay, restores editor + text, refocuses the
  editor, and resolves the promise. — PI_CA src/modes/controllers/extension-ui-controller.ts:1144-1155,
  1198-1204 — fetch 2026-10-06 — confidence: primary
- **`showOverlay` sets focus automatically** when the overlay is visible and returns an
  `OverlayHandle { hide(); setHidden(hidden); isHidden() }`. — PI_TUI src/tui.ts:1217-1266 — fetch 2026-10-06 — confidence: primary
- **`invalidate()`** is called on the whole tree by `TUI.invalidate()`, which also walks the overlay
  stack; triggers include `resetDisplay()`, glyph-protocol report, cell-size response, native motion.
  There is no `setTheme` hook that invalidates. — PI_TUI src/tui.ts:1385-1388, 550-555 — fetch 2026-10-06 — confidence: primary
- **Disposal is explicit.** `showOverlay().hide()` and `TUI.stop()` never call `component.dispose()`;
  the PI_CA controller does it in `cleanup()`. `Container.dispose()` propagates to children; `dispose`
  must be idempotent. — PI_TUI src/tui.ts:562-566, 1231-1244, 2404-2460; PI_CA
  src/modes/controllers/extension-ui-controller.ts:1144-1155 — fetch 2026-10-06 — confidence: primary

### 10. Theme + mouse, done the built-in way

**Theme**
- The factory's 2nd argument is `theme: Theme`; the live singleton is `export var theme: Theme`,
  re-exported from `pi-tui` root (`src/index.ts:75`) and from `@oh-my-pi/pi-coding-agent`
  (`src/index.ts:38`). **Read the live binding inside render callbacks; never retain an instance
  across theme switches.** — PI_TUI src/theme/theme.ts:93; omp://theme.md §"Runtime switching
  behavior" — fetch 2026-10-06 — confidence: primary
- Accessors: `fg(color, text)`, `fgResolved`, `bg(color, text)`, `bgFill`, `fgOnBg`, `bold`, `italic`,
  `underline`, `strikethrough`, `inverse`, `getFgAnsi`, `getBgAnsi`, plus symbol-category getters
  `status`, `nav`, `tree`, `progress`, `boxRound`, `boxDotted`, `boxSharp`, `sep`, `icon`, `cmd`,
  `format`, `md`, and `symbol(key)`. — PI_TUI src/theme/theme-class.ts:242-808 — fetch 2026-10-06 — confidence: primary
- Use the chrome tokens, not raw colors: `theme.boxRound.{topLeft,topRight,bottomLeft,bottomRight,
  horizontal,vertical,teeDown,teeUp,teeLeft,teeRight,cross}` for frames, `theme.sep.dot` between
  fields, `theme.nav.cursor` for selection, `theme.status.*` for state glyphs, `theme.tree.*` for
  thread indentation. — PI_TUI src/theme/theme-class.ts:485-590; omp://theme.md §"Box-drawing
  borders" — fetch 2026-10-06 — confidence: primary
- Markdown/table consistency: `getMarkdownTheme()` (memoized per Theme identity),
  `getSymbolTheme()` (table glyphs → `theme.boxSharp`), `getSelectListTheme()`, `getEditorTheme()`. — PI_TUI
  src/theme/tui-adapters.ts:169-316 — fetch 2026-10-06 — confidence: primary
- Terminal safety: never exceed `width`; measure with `visibleWidth()`; truncate/wrap with
  `truncateToWidth()` / `wrapTextWithAnsi()`; sanitize with `replaceTabs()`. — omp://tui.md
  §"Rendering constraints" — fetch 2026-10-06 — confidence: primary

**Mouse**
- `MouseRoutable` is a **convention, not an engine contract** — TUI never calls `routeMouse`; only
  layout containers forward and overlay hosts hit-test their own frames. Mouse bytes arrive at the
  focused component's `handleInput` as ordinary data strings. — PI_TUI src/tui.ts (0 `routeMouse`
  hits), src/components/layout/row.ts:220-221 — fetch 2026-10-06 — confidence: primary
- **Reporting is OFF for the default `custom` overlay.** It is enabled only while the topmost visible
  overlay sets `fullscreen: true` AND `mouseTracking !== false`. The default overlay options
  (`anchor:"bottom-center", width:"100%", maxHeight:"100%", margin:0`) leave it `"off"` → **zero SGR
  events**. Pass `overlayOptions: { fullscreen: true }` for pointer input. — PI_TUI
  src/tui.ts:3565-3573, 466-478 — fetch 2026-10-06 — confidence: primary
- Route with `routeSgrMouseInput(data, event => …)` and, for list-like panes,
  `routeSelectListMouse(target, event, line)`; hit-test your own pane geometry with
  `SplitPane.locate(line,col)` / `Stack.locate` / `Row.locate`. — PI_TUI src/mouse.ts:52-93;
  src/components/layout/split-pane.ts:150-160 — fetch 2026-10-06 — confidence: primary
- Built-ins that handle mouse: `agent-hub`, `agents-hub`, `report-panel` (wheel only). `btw-panel`
  and `jobs-panel` have none. — PI_TUI src/overlays/agent-hub.ts:566-578, agents-hub.ts:692-696,
  report-panel.ts:150-160 — fetch 2026-10-06 — confidence: primary

### 11. What an extension CANNOT do in the TUI (gaps vs a built-in overlay)

| Capability | Reachable? | Evidence |
|---|---|---|
| Global keybinding | **Editor-scoped only** — `registerShortcut` dispatches through the editor's `setCustomKeyHandler`, so it fires only while the editor holds focus. `ctx.ui.onTerminalInput(handler)` is the only raw global route (runs before focus dispatch, can `{consume:true}`). | PI_CA src/modes/controllers/input-controller.ts:2836-2858; PI_TUI src/prompt/custom-editor.ts:1660-1671; PI_TUI src/tui.ts:2734-2749 — fetch 2026-10-06 — confidence: primary |
| Intercept Esc | **Yes, while your component is focused** — TUI delivers Esc to the focused component with no fallthrough; `escape` is a reserved shortcut id so it cannot be registered globally. | PI_TUI src/tui.ts:2776-2789; PI_CA src/extensibility/extensions/runner.ts:1211-1229 — fetch 2026-10-06 — confidence: primary |
| Pinned row above the editor | **Partial** — `ctx.ui.setWidget(key, content, { placement: "aboveEditor" \| "belowEditor" })` accepts string arrays (≤10 lines + truncation notice) or a component factory. It is a fixed slot, not a live pane; it cannot show the room stream. | PI_CA src/modes/controllers/extension-ui-controller.ts:338-365; PI_CA src/extensibility/extensions/types.ts:236-239, 301 — fetch 2026-10-06 — confidence: primary |
| `ctrl+o` expansion hook (tool-output expand) | **Read-only** — `ctx.ui.getToolsExpanded()` / `setToolsExpanded(expanded)` exist; the *key* `app.tools.expand` is a built-in action and cannot be rebound by an extension. | PI_CA src/extensibility/extensions/types.ts:322-326; PI_TUI src/app-keybindings.ts:255 — fetch 2026-10-06 — confidence: primary |
| Own the status line | **Partial** — `ctx.ui.setStatus(key, text)` appends a status-line segment; `setWorkingMessage`/`setWidget` work. `setFooter`/`setHeader` are **literal no-ops** in interactive mode and everywhere else. | PI_CA src/modes/controllers/extension-ui-controller.ts:163-164, 130-138; PI_TUI src/status-line/component.ts:1124-1135 — fetch 2026-10-06 — confidence: primary |
| Render outside the overlay region | **Partial** — a component's only output surface is `render(width)` composited into the viewport; no API exposes transcript/scrollback. Outside surfaces: `setWidget` (fixed slot) and `registerMessageRenderer` (into the chat container). | PI_TUI src/tui.ts:2962-2996; PI_CA src/extensibility/extensions/types.ts:296-306 — fetch 2026-10-06 — confidence: primary |
| Replace the editor area | **Yes** — `ctx.ui.custom(factory)` without `overlay: true` clears `editorContainer` and mounts there; `setEditorComponent(factory)` swaps the editor (factory must return a `CustomEditor` subclass). | PI_CA src/modes/controllers/extension-ui-controller.ts:1198-1204; omp://extensions.md §"Interactive mode" — fetch 2026-10-06 — confidence: primary |
| Call `showOverlay` directly | **Yes** — the factory's 1st arg is the live `TUI` (`showOverlay`, `hideOverlay`, `setFocus`, `getFocused`, `hasOverlay`, `requestRender`, `requestComponentRender`, `renderNow`, `terminal`, `addInputListener`). A panel can nest a fullscreen child overlay like agent-hub. | PI_TUI src/tui.ts:773-1315; src/overlays/agent-hub.ts:640-655 — fetch 2026-10-06 — confidence: primary |
| Fullscreen alt-screen overlay | **Yes** — `overlayOptions: { fullscreen: true }` is forwarded verbatim (no allowlist); alt screen is borrowed and mouse tracking turns on unless `mouseTracking: false`. | PI_CA src/modes/controllers/extension-ui-controller.ts:1184-1194; PI_TUI src/tui.ts:3565-3573, 466-478 — fetch 2026-10-06 — confidence: primary |
| Rebind keys / read the user's keymap | **No** — the factory gets `KeybindingsManager.inMemory()` with **default** bindings, not the user's `keybindings.yml`; no setter. | PI_CA src/modes/controllers/extension-ui-controller.ts:1136; omp://tui.md §"Match app keybinding actions" — fetch 2026-10-06 — confidence: primary |
| Receive key-release events | **Yes** — set `wantsKeyRelease = true`; otherwise release events are filtered before `handleInput`. | PI_TUI src/tui.ts:2780-2785 — fetch 2026-10-06 — confidence: primary |
| Set terminal title / notify | **Yes** — `ctx.ui.setTitle(title)` → `setExtensionTerminalTitle`; `ctx.ui.notify(message, type)` → `showHookNotify`. | PI_CA src/modes/controllers/extension-ui-controller.ts:137, 134, 1113-1121; types.ts:289,310 — fetch 2026-10-06 — confidence: primary |
| Mount in RPC/print/headless | **No** — `custom` is unsupported in RPC (returns `undefined as never`) and no-op without a UI context; `hasUI === true` does not guarantee `custom` works. | omp://extensions.md §"UI integration points"; omp://tui.md §"Runtime behavior by mode" — fetch 2026-10-06 — confidence: primary |

## Risks

1. **`custom()` blocks until `done()`.** A long-lived room panel must be awaited by a handler that
   can suspend — use `registerCommand`. **Fallback:** return the component synchronously from the
   factory; never await inside it before returning.
2. **No automatic dispose on overlay hide or TUI stop.** **Fallback:** idempotent `dispose()`, pass
   `options.signal`, clear timers on `session_shutdown` via `ctx.setInterval`/`clearTimer`.
3. **Extension shortcuts die while the overlay has focus.** **Fallback:** handle all panel keys in
   `handleInput`; use `ctx.ui.onTerminalInput` for a true global hook.
4. **Mouse is off by default for a non-fullscreen overlay.** **Fallback:** `overlayOptions:
   { fullscreen: true }` + `routeSgrMouseInput`, or `tui.setInlineMouseTrackingProvider` for inline.
5. **`setFooter`/`setHeader` are no-ops.** **Fallback:** draw your own `PanelRows` chrome (agent-hub).
6. **`KeybindingsManager` given to the factory is in-memory defaults.** **Fallback:** match actions
   via `keybindings.matches(data, "app.interrupt")` and hardcode secondary keys with `matchesKey`.
7. **`invalidate()` is not wired to theme changes.** **Fallback:** read the live `theme` binding
   inside `render()`, or use `Text.setStyleFn` (styler re-runs at render time).
8. **Render reference contract**: mutating a cached array breaks memoization. **Fallback:** fresh
   array on change, cache only when byte-identical.
9. **RPC/print modes silently no-op `custom()`.** **Fallback:** guard with
   `ctx.hasUI && ctx.mode === "tui"`.
10. **Narrow terminals**: below `splitAt` the split collapses to one pane. **Fallback:** mirror
    agent-hub — `Tab` toggles `narrowDetailsOpen`, title carries the selected context, Esc unwinds
    filter → narrow → close.
11. **Per-frame component churn**: building a component per message/claim and rendering all of them
    each frame is the main perf risk. **Fallback:** windowed plain-string rows + a `hitRows` map
    (agent-hub's activity table), materializing `Markdown` only for the selected message.

## Searches

- Read (PI_TUI): `src/tui.ts` (Component 233-324, Focusable 350-373, OverlayOptions 428-478,
  Container 495-600, showOverlay 1217-1266, invalidate 1385-1388, mouse tracking 1315-1330/3565-3645,
  input dispatch 2680-2790, resolveOverlayLayout 2816-2911, composite 2962-2996, requestRender
  2525-2572, stop 2404-2460), `src/mouse.ts` (full), `src/index.ts`, `src/theme/{theme,theme-class,
  schema,tui-adapters}.ts`, `src/components/{box,text,table,key-value-list,tab-bar,scroll-view,
  scroll-viewport,markdown,progress-bar,metric,section,spacer,truncated-text,input,editor}.ts`,
  `src/components/layout/{geometry,row,stack,split-pane}.ts`, `src/chrome/{overlay-box,message-frame,
  keybinding-hints}.ts`, `src/key-hint-format.ts`, `src/prompt/custom-editor.ts`,
  `src/overlays/{agent-hub,agent-hub-types,agent-hub-renderer,agent-hub-projection,agents-hub,
  agent-transcript-viewer,btw-panel,jobs-panel,report-panel,session-info-overlay,hub-frame}.ts`,
  `src/chat/{transcript-browser,chat-transcript-builder,extension-types}.ts`
- Read (PI_CA): `src/extensibility/extensions/types.ts` (236-410, 1519-1536), `src/modes/controllers/
  extension-ui-controller.ts` (125-170, 338-365, 1124-1240), `src/modes/controllers/selector-controller.ts`
  (175-260, 2224-2288), `src/modes/controllers/input-controller.ts` (315-380, 505-605, 2836-2860),
  `src/extensibility/extensions/runner.ts` (205-245, 1211-1231), `src/extensibility/custom-commands/
  bundled/annotate/fullscreen.ts`, `src/utils/event-bus.ts`
- Read docs: `omp://tui.md`, `omp://theme.md`, `omp://extensions.md`
- Workers: `findings/raw/M2-W1-component-lifecycle.md`, `M2-W2-component-signatures.md`,
  `M2-W3-agent-hub-deep.md`, `M2-W5-mouse-theme-limits.md`, `W4-SimplePanels.md`

## Conflicting evidence

- `omp://tui.md` presents `MouseRoutable` as the opt-in mouse interface, but the engine never calls
  `routeMouse`; only layout containers and overlay hosts do. The doc also does not state that a
  non-fullscreen overlay receives **no** SGR reports. Engine code wins. — omp://tui.md vs PI_TUI
  src/tui.ts:3565-3573 — fetch 2026-10-06
- `omp://tui.md`'s simplified `Component` snippet omits the many optional members (debug/native/
  `retireDisplacedTranscript`); source is authoritative. — omp://tui.md vs PI_TUI src/tui.ts:233-324 — fetch 2026-10-06
- `AgentHubDeps.ui?: TUI` is optional and agent-hub substitutes a render-only stub when absent
  (`{ requestRender, requestComponentRender } as unknown as TUI`), guarding `openChat()` with
  `typeof this.#ui.showOverlay !== "function"`. An extension overlay should guard direct `tui.*`
  calls the same way. — PI_TUI src/overlays/agent-hub.ts:478-490, 624 — fetch 2026-10-06

## Gaps

- Did not read `native/*` (TSP); a room panel targeting Tern terminals would need `native/node.ts` +
  `native/describe.ts` for `describe()`/`handleNativeEvent()`.
- Did not analyse `Markdown.#renderTable` (markdown.ts:3893) for alignment/overflow options.
- Layout proposals are design inference, not measured: pane widths at 80/100/120 columns were not
  simulated against real terminal output.
- `OverlayFocusOwner` is documented in source but no built-in panel read here uses it; its
  interaction with panel-local focus was not verified.
