# Component Signatures Reference — pi-tui v18.6.1

All paths relative to `~/.bun/install/global/node_modules/@oh-my-pi/pi-tui/src/`.
Root export confirmed via `index.ts` re-export lines cited per component.

## Summary Table

| Component | File | Root-exported? | Implements Component | Constructor args |
|---|---|---|---|---|
| Box | components/box.ts | Yes (index.ts:7) | Yes | 4 |
| Text | components/text.ts | Yes (index.ts:33) | Yes | 4 |
| ScrollView | components/scroll-view.ts | Yes (index.ts:25) | Yes | 2 |
| ScrollViewport | components/scroll-viewport.ts | Yes (index.ts:26) | No (utility) | — |
| TabBar | components/tab-bar.ts | Yes (index.ts:31) | Yes | 4 |
| Table | components/table.ts | Yes (index.ts:32) | Yes | 3 |
| KeyValueList | components/key-value-list.ts | Yes (index.ts:15) | Yes | 2 |
| Markdown | components/markdown.ts | Yes (index.ts:21) | Yes | 6 |
| SplitPane | components/layout/split-pane.ts | Yes (index.ts:18) | Yes + MouseRoutable | 1 |
| Row | components/layout/row.ts | Yes (index.ts:17) | Yes + MouseRoutable | 1 |
| Stack | components/layout/stack.ts | Yes (index.ts:19) | Yes + MouseRoutable | 1 |
| Geometry | components/layout/geometry.ts | Yes (index.ts:16) | No (utility) | — |
| Section | components/section.ts | Yes (index.ts:27) | Yes | 1 |
| Spacer | components/spacer.ts | Yes (index.ts:30) | Yes | 1 |
| TruncatedText | components/truncated-text.ts | Yes (index.ts:35) | Yes | 3 |
| SelectList | components/select-list.ts | Yes (index.ts:28) | Yes + MouseRoutable | 4 |
| MenuSelection | components/menu-selection.ts | Yes (index.ts:22) | No (state class) | 3 |
| ProgressBar | components/progress-bar.ts | Yes (index.ts:24) | Yes | 2 |
| MetricRow | components/metric.ts | Yes (index.ts:23) | Yes | 2 |

---

## Box — components/box.ts

### Exported types

```ts
// box.ts:27-37
export interface BoxBorder {
  chars: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
  };
  color?: (text: string) => string;
}
```

### Class declaration

```ts
// box.ts:42
export class Box implements Component {
```

### Constructor

```ts
// box.ts:67
constructor(paddingX = 1, paddingY = 1, bgFn?: (text: string) => string, border?: BoxBorder)
```

All params optional. Defaults: `paddingX=1`, `paddingY=1`, `bgFn=undefined`, `border=undefined`.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `debugState` | `(): Record<string, unknown>` | — |
| `addChild` | `(component: Component): void` | required |
| `removeChild` | `(component: Component): void` | required |
| `clear` | `(): void` | — |
| `setPaddingX` | `(paddingX: number): void` | required |
| `setPaddingY` | `(paddingY: number): void` | required |
| `setBgFn` | `(bgFn?: (text: string) => string): void` | optional |
| `setBorder` | `(border?: BoxBorder): void` | optional |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## Text — components/text.ts

### Class declaration

```ts
// text.ts:26
export class Text implements Component {
```

### Constructor

```ts
// text.ts:48
constructor(text: string = "", paddingX: number = 1, paddingY: number = 1, customBgFn?: (text: string) => string)
```

All params optional. Defaults: `text=""`, `paddingX=1`, `paddingY=1`, `customBgFn=undefined`.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `debugState` | `(): Record<string, unknown>` | — |
| `getText` | `(): string` | — |
| `setText` | `(text: string): boolean` | required |
| `setCustomBgFn` | `(customBgFn?: (text: string) => string): void` | optional |
| `setStyleFn` | `(styleFn?: (text: string) => string): this` | optional |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## ScrollView — components/scroll-view.ts

### Exported types

```ts
// scroll-view.ts:24-27
export interface ScrollViewTheme {
  track?: (text: string) => string;
  thumb?: (text: string) => string;
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

// scroll-view.ts:53-62
export interface ScrollRangeAnchor {
  id: string;
  start: number;
  end: number;
  margin?: number;
  alignment?: ViewportAlignment;
  mode?: "selection" | "once";
  oversized?: "nearest" | "start";
}

// scroll-view.ts:22
export type ScrollAnchor = "start" | "end";
```

### Class declaration

```ts
// scroll-view.ts:112
export class ScrollView implements Component {
```

### Constructor

```ts
// scroll-view.ts:134
constructor(content: readonly string[] | Component, options: ScrollViewOptions)
```

Both params required. `options.height` is the only required field in `ScrollViewOptions`.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `debugChildren` | `get: readonly Component[]` | — |
| `debugState` | `(): Record<string, unknown>` | — |
| `setLines` | `(lines: readonly string[]): void` | required |
| `setChild` | `(child: Component): void` | required |
| `setTotalRows` | `(totalRows: number \| undefined): void` | required |
| `setHeight` | `(height: number): void` | required |
| `setScrollbar` | `(scrollbar: ScrollViewOptions["scrollbar"]): void` | required |
| `setFollowTail` | `(followTail: boolean): void` | required |
| `setAnchor` | `(anchor: ScrollAnchor): void` | required |
| `getScrollOffset` | `(): number` | — |
| `getMaxScrollOffset` | `(): number` | — |
| `getVisibleRange` | `(): { start: number; end: number }` | — |
| `logicalRowAt` | `(localRow: number): number \| undefined` | required |
| `localRowFor` | `(logicalRow: number): number \| undefined` | required |
| `setScrollOffset` | `(offset: number): void` | required |
| `setActiveRow` | `(row: number \| undefined, alignment?: ViewportAlignment): void` | row required, alignment optional |
| `hasRevealedRange` | `(id: string): boolean` | required |
| `revealRange` | `(anchor: ScrollRangeAnchor \| undefined, width: number): boolean` | required |
| `scroll` | `(delta: number): void` | required |
| `page` | `(delta: number): void` | required |
| `scrollToTop` | `(): void` | — |
| `scrollToBottom` | `(): void` | — |
| `handleScrollKey` | `(data: string): boolean` | required |
| `invalidate` | `(): void` | — |
| `dispose` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## ScrollViewport — components/scroll-viewport.ts

**Not a Component.** Pure utility functions and types. No constructor.

### Exported types

```ts
// scroll-viewport.ts:7-12
export interface ViewportRange {
  start: number;
  end: number;
}

// scroll-viewport.ts:14-19
export interface ScrollbarThumbRange {
  start: number;
  end: number;
}

// scroll-viewport.ts:21-28
export interface CursorColumnWindow {
  text: string;
  startColumn: number;
  cursorIndex: number;
}

// scroll-viewport.ts:5
export type ViewportAlignment = "nearest" | "start" | "center" | "end";
```

### Exported functions

| Function | Signature |
|---|---|
| `maxScrollOffset` | `(totalRows: number, viewportRows: number): number` |
| `clampScrollOffset` | `(offset: number, totalRows: number, viewportRows: number): number` |
| `viewportRange` | `(totalRows: number, viewportRows: number, offset: number): ViewportRange` |
| `viewportOverflows` | `(totalRows: number, viewportRows: number): boolean` |
| `scrollOffsetForRow` | `(currentOffset: number, row: number, totalRows: number, viewportRows: number, alignment?: ViewportAlignment): number` |
| `centeredViewportRange` | `(selectedRow: number, totalRows: number, viewportRows: number): ViewportRange` |
| `scrollbarThumbRange` | `(viewportRows: number, totalRows: number, scrollOffset: number): ScrollbarThumbRange` |
| `cursorColumnWindow` | `(text: string, cursorIndex: number, width: number): CursorColumnWindow` |

---

## TabBar — components/tab-bar.ts

### Exported types

```ts
// tab-bar.ts:20-29
export interface Tab {
  id: string;
  label: string;
  short?: string;
  muted?: boolean;
}

// tab-bar.ts:32-45
export interface TabBarTheme {
  label: (text: string) => string;
  activeTab: (text: string) => string;
  inactiveTab: (text: string) => string;
  hint: (text: string) => string;
  mutedTab?: (text: string) => string;
  hoverTab?: (text: string) => string;
}
```

### Class declaration

```ts
// tab-bar.ts:60
export class TabBar implements Component {
```

### Constructor

```ts
// tab-bar.ts:76
constructor(label: string, tabs: Tab[], theme: TabBarTheme, initialIndex: number = 0)
```

`label`, `tabs`, `theme` required. `initialIndex` optional (default `0`).

### Public properties

| Property | Type | Required/Optional |
|---|---|---|
| `onTabChange` | `((tab: Tab, index: number) => void) \| undefined` | optional |
| `showHint` | `boolean` | optional (default `true`) |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `debugState` | `(): Record<string, unknown>` | — |
| `getActiveTab` | `(): Tab` | — |
| `getActiveIndex` | `(): number` | — |
| `setActiveIndex` | `(index: number): void` | required |
| `setTabs` | `(tabs: Tab[], activeId?: string): void` | tabs required, activeId optional |
| `setActiveById` | `(id: string): boolean` | required |
| `selectTab` | `(id: string): boolean` | required |
| `nextTab` | `(): void` | — |
| `prevTab` | `(): void` | — |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `handleNativeEvent` | `(event: NativeUiEvent): void` | required |
| `handleInput` | `(data: string): boolean` | required |
| `render` | `(width: number): readonly string[]` | required |
| `tabAt` | `(line: number, col: number): Tab \| undefined` | required |
| `setHoverTab` | `(id: string \| null): void` | required |

---

## Table — components/table.ts

### Exported types

```ts
// table.ts:9-12
export interface TableCell {
  readonly text: string;
  readonly style?: (text: string) => string;
}

// table.ts:15-23
export interface TableColumn {
  readonly width: number;
  readonly minWidth?: number;
  readonly align: "left" | "right";
  readonly overflow: "allow" | "truncate";
  readonly priority?: number;
  readonly style?: (text: string) => string;
}

// table.ts:26-30
export interface TableOptions {
  readonly gap?: string;
  readonly indent?: string;
  readonly fit?: boolean;
}
```

### Class declaration

```ts
// table.ts:94
export class Table implements Component {
```

### Constructor

```ts
// table.ts:101
constructor(rows: readonly (readonly TableCell[])[], columns: readonly TableColumn[], options: TableOptions = {})
```

`rows` and `columns` required. `options` optional (default `{}`).

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setRows` | `(rows: readonly (readonly TableCell[])[]): boolean` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

### Exported functions

| Function | Signature |
|---|---|
| `renderTableRow` | `(cells: readonly TableCell[], columns: readonly TableColumn[], maxWidth?: number, options?: TableOptions): string` |

---

## KeyValueList — components/key-value-list.ts

### Exported types

```ts
// key-value-list.ts:8-13
export interface KeyValueRow {
  readonly label: string;
  readonly value: string;
  readonly labelStyle?: (text: string) => string;
  readonly valueStyle?: (text: string) => string;
}

// key-value-list.ts:16-22
export interface KeyValueListOptions {
  readonly indent?: string;
  readonly labelWidth: number;
  readonly gap?: string;
  readonly minValueWidth?: number;
  readonly labelOverflow?: "allow" | "truncate";
}
```

### Class declaration

```ts
// key-value-list.ts:33
export class KeyValueList implements Component {
```

### Constructor

```ts
// key-value-list.ts:39
constructor(rows: readonly KeyValueRow[], options: KeyValueListOptions)
```

Both params required. `options.labelWidth` is the only required field in `KeyValueListOptions`.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setRows` | `(rows: readonly KeyValueRow[]): boolean` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## Markdown — components/markdown.ts

### Exported types

```ts
// markdown.ts:1435-1496
export interface DefaultTextStyle {
  color?: (text: string) => string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  bgColor?: (text: string) => string;
}

// markdown.ts:1496
export interface MarkdownTheme {
  // (large interface — see source for full list)
}

// markdown.ts:1362
export interface MarkdownLink {
  text: string;
  href: string;
}
```

### Class declaration

```ts
// markdown.ts:1898
export class Markdown implements Component {
```

### Constructor

```ts
// markdown.ts:1991-1998
constructor(
  text: string,
  paddingX: number,
  paddingY: number,
  theme: MarkdownTheme,
  defaultTextStyle?: DefaultTextStyle,
  codeBlockIndent: number = 2,
)
```

`text`, `paddingX`, `paddingY`, `theme` required. `defaultTextStyle` optional. `codeBlockIndent` optional (default `2`).

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `debugState` | `(): Record<string, unknown>` | — |
| `setText` | `(text: string): boolean` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `getLastRenderStableText` | `(): string` | — |
| `transientRenderCache` | `get: boolean` | — |
| `transientRenderCache` | `set(value: boolean): void` | required |
| `render` | `(width: number): readonly string[]` | required |

### Exported functions

| Function | Signature |
|---|---|
| `renderInlineMarkdown` | `(text: string, mdTheme: MarkdownTheme, baseColor?: (t: string) => string): string` |
| `extractMarkdownLinks` | `(text: string): MarkdownLink[]` |
| `getMarkdownLinkUrls` | `(text: string): string[]` |
| `clearRenderCache` | `(): void` |
| `fastLineStartHazard` | `(grownLine: string): boolean` |

---

## SplitPane — components/layout/split-pane.ts

### Exported types

```ts
// split-pane.ts:26
export type PaneSide = "left" | "right";

// split-pane.ts:29-34
export interface SplitPaneSize {
  fixed?: number;
  ratio?: number;
  min?: number;
  max?: number;
}

// split-pane.ts:37-49
export interface SplitPaneOptions {
  left: LayoutContent;
  right: LayoutContent;
  leftSize?: SplitPaneSize;
  rightMinWidth?: number;
  splitAt?: number;
  narrowPane?: PaneSide;
  height?: number;
  prefix?: LayoutDecoration;
  divider?: LayoutDecoration;
  suffix?: LayoutDecoration;
  align?: LayoutAlignment;
}

// split-pane.ts:52-57
export interface SplitPaneGeometry {
  mode: "split" | "narrow";
  left?: LayoutRect;
  right?: LayoutRect;
  dividerCol?: number;
}

// split-pane.ts:60-66
export interface SplitPaneHit {
  pane: PaneSide;
  content: LayoutContent;
  line: number;
  col: number;
  rect: LayoutRect;
}
```

### Class declaration

```ts
// split-pane.ts:80
export class SplitPane implements Component, MouseRoutable {
```

### Constructor

```ts
// split-pane.ts:108
constructor(options: SplitPaneOptions)
```

Single param. `options.left` and `options.right` are the only required fields.

### Public properties

| Property | Type |
|---|---|
| `debugChildren` | `get: readonly Component[]` |
| `mode` | `get: "split" \| "narrow"` |
| `leftWidth` | `get: number` |
| `rightWidth` | `get: number` |
| `dividerCol` | `get: number \| undefined` |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setHeight` | `(height: number \| undefined): void` | required |
| `setNarrowPane` | `(pane: PaneSide \| undefined): void` | required |
| `setLeftSize` | `(size: SplitPaneSize): void` | required |
| `setSplitAt` | `(width: number): void` | required |
| `setRightMinWidth` | `(width: number): void` | required |
| `setDecorations` | `(prefix: LayoutDecoration \| undefined, divider: LayoutDecoration \| undefined, suffix: LayoutDecoration \| undefined): void` | required |
| `measure` | `(width: number): SplitPaneGeometry` | required |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `locate` | `(line: number, col: number): SplitPaneHit \| undefined` | required |
| `routeMouse` | `(event: SgrMouseEvent, line: number, col: number): void` | required |
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `invalidate` | `(): void` | — |
| `dispose` | `(): void` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## Row — components/layout/row.ts

### Exported types

```ts
// row.ts:29-37
export interface RowChild {
  content: LayoutContent;
  width?: number;
  grow?: number;
  minWidth?: number;
  maxWidth?: number;
  padding?: LayoutInsets;
  align?: LayoutAlignment;
}

// row.ts:40-47
export interface RowOptions {
  children: readonly RowChild[];
  height?: number;
  gap?: LayoutDecoration;
  prefix?: LayoutDecoration;
  suffix?: LayoutDecoration;
  align?: LayoutAlignment;
}

// row.ts:50-56
export interface RowHit {
  index: number;
  content: LayoutContent;
  line: number;
  col: number;
  rect: LayoutRect;
}
```

### Class declaration

```ts
// row.ts:85
export class Row implements Component, MouseRoutable {
```

### Constructor

```ts
// row.ts:97
constructor(options: RowOptions)
```

Single param. `options.children` is the only required field.

### Public properties

| Property | Type |
|---|---|
| `debugChildren` | `get: readonly Component[]` |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `childRect` | `(index: number): LayoutRect \| undefined` | required |
| `setChildren` | `(children: readonly RowChild[]): void` | required |
| `setHeight` | `(height: number \| undefined): void` | required |
| `setDecorations` | `(prefix: LayoutDecoration \| undefined, gap: LayoutDecoration \| undefined, suffix: LayoutDecoration \| undefined): void` | required |
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `invalidate` | `(): void` | — |
| `dispose` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `locate` | `(line: number, col: number): RowHit \| undefined` | required |
| `routeMouse` | `(event: SgrMouseEvent, line: number, col: number): void` | required |
| `render` | `(width: number): readonly string[]` | required |

---

## Stack — components/layout/stack.ts

### Exported types

```ts
// stack.ts:26-34
export interface StackChild {
  content: LayoutContent;
  height?: number;
  grow?: number;
  minHeight?: number;
  maxHeight?: number;
  padding?: LayoutInsets;
  align?: LayoutAlignment;
}

// stack.ts:37-41
export interface StackOptions {
  children: readonly StackChild[];
  height?: number;
  align?: LayoutAlignment;
}

// stack.ts:44-50
export interface StackHit {
  index: number;
  content: LayoutContent;
  line: number;
  col: number;
  rect: LayoutRect;
}
```

### Class declaration

```ts
// stack.ts:76
export class Stack implements Component, MouseRoutable {
```

### Constructor

```ts
// stack.ts:85
constructor(options: StackOptions)
```

Single param. `options.children` is the only required field.

### Public properties

| Property | Type |
|---|---|
| `debugChildren` | `get: readonly Component[]` |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `childRect` | `(index: number): LayoutRect \| undefined` | required |
| `setChildren` | `(children: readonly StackChild[]): void` | required |
| `setHeight` | `(height: number \| undefined): void` | required |
| `setIgnoreTight` | `(ignore: boolean): this` | required |
| `invalidate` | `(): void` | — |
| `dispose` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `locate` | `(line: number, col: number): StackHit \| undefined` | required |
| `routeMouse` | `(event: SgrMouseEvent, line: number, col: number): void` | required |
| `render` | `(width: number): readonly string[]` | required |

---

## Geometry — components/layout/geometry.ts

**Not a Component.** Pure utility functions and types. No constructor.

### Exported types

```ts
// geometry.ts:7
export type LayoutAlignment = "start" | "center" | "end";

// geometry.ts:10-15
export interface LayoutInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

// geometry.ts:18-23
export interface NormalizedLayoutInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// geometry.ts:26-31
export interface LayoutRect {
  row: number;
  col: number;
  width: number;
  height: number;
}

// geometry.ts:34
export type LayoutRenderer = (width: number, height: number | undefined) => readonly string[];

// geometry.ts:37
export type LayoutContent = Component | LayoutRenderer;

// geometry.ts:40
export type LayoutDecoration = string | (() => string);

// geometry.ts:43-45
export interface HeightConstrainedComponent extends Component {
  setHeight(height: number | undefined): void;
}

// geometry.ts:48-53
export interface LayoutAllocation {
  fixed?: number;
  grow?: number;
  min?: number;
  max?: number;
}
```

### Exported functions

| Function | Signature |
|---|---|
| `nativeLayoutChild` | `(content: LayoutContent): Component` |
| `nativeLayoutGap` | `(decoration: LayoutDecoration \| undefined): TspSpace \| undefined` |
| `nativeSlotProps` | `(axis: "w" \| "h", slot: { fixed?: number; grow?: number; min?: number; max?: number }): TspProps<"col">` |
| `layoutSize` | `(value: number \| undefined, fallback?: number): number` |
| `optionalLayoutSize` | `(value: number \| undefined): number \| undefined` |
| `layoutRatio` | `(value: number \| undefined, fallback: number): number` |
| `layoutDecorationText` | `(decoration: LayoutDecoration \| undefined): string` |
| `allocateLayoutSpace` | `(items: readonly LayoutAllocation[], available: number): number[]` |
| `layoutInsets` | `(insets: LayoutInsets \| undefined): NormalizedLayoutInsets` |
| `equalLayoutInsets` | `(left: LayoutInsets \| undefined, right: LayoutInsets \| undefined): boolean` |
| `layoutAlignmentOffset` | `(space: number, alignment: LayoutAlignment): number` |
| `isLayoutComponent` | `(content: LayoutContent): content is Component` |
| `isHeightConstrainedComponent` | `(content: LayoutContent): content is HeightConstrainedComponent` |
| `isLayoutMouseRoutable` | `(content: LayoutContent): content is Component & MouseRoutable` |
| `uniqueLayoutComponents` | `(contents: readonly LayoutContent[]): readonly Component[]` |
| `fitLayoutLine` | `(line: string, width: number): string` |
| `renderLayoutContent` | `(content: LayoutContent, width: number, height: number \| undefined): readonly string[]` |

---

## Section — components/section.ts

### Exported types

```ts
// section.ts:28-36
export interface SectionOptions {
  readonly title: string;
  readonly body: Component | readonly string[];
  readonly titleStyle?: (text: string) => string;
  readonly ruleStyle?: (text: string) => string;
  readonly ruleGlyph: string;
  readonly ruleWidth: number | "fill";
  readonly blankAfter?: boolean;
}
```

### Class declaration

```ts
// section.ts:39
export class Section implements Component {
```

### Constructor

```ts
// section.ts:45
constructor(options: SectionOptions)
```

Single param. `options.title`, `options.body`, `options.ruleGlyph`, `options.ruleWidth` required. `titleStyle`, `ruleStyle`, `blankAfter` optional.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `invalidate` | `(): void` | — |
| `dispose` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## Spacer — components/spacer.ts

### Exported functions

```ts
// spacer.ts:6-11
export function spaceForRows(rows: number): "none" | "sm" | "md" | "lg"
```

### Class declaration

```ts
// spacer.ts:16
export class Spacer implements Component {
```

### Constructor

```ts
// spacer.ts:21
constructor(lines: number = 1)
```

Single param optional (default `1`).

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `debugState` | `(): Record<string, unknown>` | — |
| `setLines` | `(lines: number): void` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(_width: number): readonly string[]` | — |

---

## TruncatedText — components/truncated-text.ts

### Class declaration

```ts
// truncated-text.ts:10
export class TruncatedText implements Component {
```

### Constructor

```ts
// truncated-text.ts:18
constructor(text: string, paddingX: number = 0, paddingY: number = 0)
```

`text` required. `paddingX` optional (default `0`). `paddingY` optional (default `0`).

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `debugState` | `(): Record<string, unknown>` | — |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

---

## SelectList — components/select-list.ts

### Exported types

```ts
// select-list.ts:39-59
export interface SelectItem {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  iconName?: string;
  nativeDetail?: string;
  state?: string;
  hint?: string;
  disabled?: boolean;
  confirmation?: string;
  searchText?: string;
}

// select-list.ts:61-72
export interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
  symbols: SymbolTheme;
  icon?: (text: string) => string;
  hovered?: (text: string) => string;
}

// select-list.ts:74-80
export interface SelectListTruncatePrimaryContext {
  text: string;
  maxWidth: number;
  columnWidth: number;
  item: SelectItem;
  isSelected: boolean;
}

// select-list.ts:83-91
export interface SelectListRenderItemContext {
  item: SelectItem;
  index: number;
  width: number;
  selected: boolean;
  hovered: boolean;
  pendingConfirmation: boolean;
  theme: SelectListTheme;
}

// select-list.ts:94-100
export interface SelectListStatusContext {
  query: string;
  selectedIndex: number;
  visibleCount: number;
  totalCount: number;
  pendingItem: SelectItem | undefined;
}

// select-list.ts:102-137
export interface SelectListLayoutOptions {
  minPrimaryColumnWidth?: number;
  maxPrimaryColumnWidth?: number;
  truncatePrimary?: (context: SelectListTruncatePrimaryContext) => string;
  overflowSearch?: boolean;
  search?: "overflow" | "always" | "never";
  filterItems?: (items: readonly SelectItem[], query: string) => readonly SelectItem[];
  renderItem?: (context: SelectListRenderItemContext) => readonly string[];
  measureItem?: (context: SelectListRenderItemContext) => number;
  emptyText?: string;
  noMatchText?: string;
  statusText?: (context: SelectListStatusContext) => string | undefined;
  wrapNavigation?: boolean;
  wrapDescription?: boolean;
  maxDescriptionRows?: number;
}
```

### Class declaration

```ts
// select-list.ts:158
export class SelectList implements Component, MouseRoutable {
```

### Constructor

```ts
// select-list.ts:186-191
constructor(
  items: ReadonlyArray<SelectItem>,
  maxVisible: number,
  private readonly theme: SelectListTheme,
  private readonly layout: SelectListLayoutOptions = {},
)
```

`items`, `maxVisible`, `theme` required. `layout` optional (default `{}`).

### Public properties

| Property | Type | Required/Optional |
|---|---|---|
| `onSelect` | `((item: SelectItem) => void) \| undefined` | optional |
| `onCancel` | `(() => void) \| undefined` | optional |
| `onSelectionChange` | `((item: SelectItem) => void) \| undefined` | optional |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `debugState` | `(): Record<string, unknown>` | — |
| `setMaxVisible` | `(rows: number): void` | required |
| `setFilter` | `(filter: string): void` | required |
| `setItems` | `(items: readonly SelectItem[]): void` | required |
| `setSelectedIndex` | `(index: number): void` | required |
| `setSelectedValue` | `(value: string): void` | required |
| `getFilter` | `(): string` | — |
| `pickerView` | `(): { items, selected, pending, query, cursor }` | — |
| `hitTest` | `(line: number): number \| undefined` | required |
| `setHoverIndex` | `(index: number \| null): void` | required |
| `handleWheel` | `(delta: -1 \| 1): void` | required |
| `clickItem` | `(index: number): void` | required |
| `routeMouse` | `(event: SgrMouseEvent, line: number, _col: number): void` | required |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `setNativeMark` | `(typed: string): void` | required |
| `handleNativeEvent` | `(event: NativeUiEvent): void` | required |
| `invalidate` | `(): void` | — |
| `render` | `(width: number): readonly string[]` | required |
| `handleInput` | `(keyData: string): void` | required |
| `getSelectedItem` | `(): SelectItem \| null` | — |

---

## MenuSelection — components/menu-selection.ts

**Not a Component.** Generic state management class.

### Exported types

```ts
// menu-selection.ts:4-15
export interface MenuSelectionAdapter<T> {
  getKey: (item: T) => string;
  getSearchText: (item: T) => string;
  isDisabled?: (item: T) => boolean;
  requiresConfirmation?: (item: T) => boolean;
  filter?: (items: readonly T[], query: string) => readonly T[];
}

// menu-selection.ts:18-22
export type MenuActivation<T> =
  | { kind: "empty" }
  | { kind: "disabled"; item: T }
  | { kind: "pending"; item: T }
  | { kind: "confirmed"; item: T };

// menu-selection.ts:25-32
export interface MenuWindow {
  startIndex: number;
  endIndex: number;
  rowOffset: number;
  totalRows: number;
}
```

### Class declaration

```ts
// menu-selection.ts:80
export class MenuSelection<T> {
```

### Constructor

```ts
// menu-selection.ts:87-91
constructor(
  items: readonly T[],
  readonly adapter: MenuSelectionAdapter<T>,
  initialKey?: string,
)
```

`items` and `adapter` required. `initialKey` optional.

### Public properties

| Property | Type |
|---|---|
| `items` | `get: readonly T[]` |
| `visibleItems` | `get: readonly T[]` |
| `query` | `get: string` |
| `selectedIndex` | `get: number` |
| `selectedItem` | `get: T \| undefined` |
| `selectedKey` | `get: string \| undefined` |
| `pendingKey` | `get: string \| undefined` |

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `isDisabled` | `(item: T): boolean` | required |
| `isPending` | `(item: T): boolean` | required |
| `setItems` | `(items: readonly T[], selectedKey?: string): boolean` | items required, selectedKey optional |
| `setQuery` | `(query: string, retainSelection?: boolean): boolean` | query required, retainSelection optional |
| `setSelectedIndex` | `(index: number, direction?: -1 \| 1): boolean` | index required, direction optional |
| `setSelectedKey` | `(key: string): boolean` | required |
| `move` | `(delta: number, wrap?: boolean): boolean` | delta required, wrap optional |
| `moveToBoundary` | `(boundary: "first" \| "last"): boolean` | required |
| `cancelConfirmation` | `(): boolean` | — |
| `requestActivation` | `(index?: number): MenuActivation<T>` | optional |

### Exported functions

| Function | Signature |
|---|---|
| `getMenuWindow` | `(rowCounts: readonly number[], selectedIndex: number, rowBudget: number): MenuWindow` |

---

## ProgressBar — components/progress-bar.ts

### Exported types

```ts
// progress-bar.ts:8-16
export interface ProgressBarStyle {
  readonly filled: string;
  readonly empty: string;
  readonly indeterminate?: string;
  readonly styleFilled?: (text: string) => string;
  readonly styleEmpty?: (text: string) => string;
  readonly styleIndeterminate?: (text: string) => string;
  readonly styleBar?: (text: string) => string;
}

// progress-bar.ts:19-30
export interface ProgressBarOptions {
  readonly min?: number;
  readonly max?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly showPercentage?: boolean;
  readonly percentageSeparator?: string;
  readonly formatPercentage?: (fraction: number) => string;
  readonly style: ProgressBarStyle;
}
```

### Class declaration

```ts
// progress-bar.ts:89
export class ProgressBar implements Component {
```

### Constructor

```ts
// progress-bar.ts:95
constructor(value: number | undefined, options: ProgressBarOptions)
```

Both params required. `options.style` is the only required field in `ProgressBarOptions`.

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setValue` | `(value: number \| undefined): boolean` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

### Exported functions

| Function | Signature |
|---|---|
| `progressFraction` | `(value: number \| undefined, min?: number, max?: number): number \| undefined` |
| `renderProgressBar` | `(value: number \| undefined, width: number, options: ProgressBarOptions): string` |

---

## MetricRow — components/metric.ts

### Exported types

```ts
// metric.ts:9-20
export interface MetricSpec {
  readonly value: string | undefined;
  readonly leading?: string;
  readonly separator?: string;
  readonly priority?: number;
  readonly style?: (text: string) => string;
}

// metric.ts:23
export type MetricOverflow = "allow" | "drop" | "truncate" | "wrap";

// metric.ts:26-33
export interface MetricRowOptions {
  readonly separator?: string;
  readonly overflow?: MetricOverflow;
  readonly maxWidth?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
  readonly style?: (text: string) => string;
}
```

### Class declaration

```ts
// metric.ts:86
export class MetricRow implements Component {
```

### Constructor

```ts
// metric.ts:93
constructor(metrics: readonly MetricSpec[], options: MetricRowOptions = {})
```

`metrics` required. `options` optional (default `{}`).

### Public methods

| Method | Signature | Required/Optional |
|---|---|---|
| `setMetrics` | `(metrics: readonly MetricSpec[]): boolean` | required |
| `invalidate` | `(): void` | — |
| `describe` | `(_cx: DescribeContext): NativeNode` | — |
| `render` | `(width: number): readonly string[]` | required |

### Exported functions

| Function | Signature |
|---|---|
| `formatMetric` | `(metric: MetricSpec): string \| undefined` |
| `formatMetricRow` | `(metrics: readonly MetricSpec[], options?: MetricRowOptions): string` |
