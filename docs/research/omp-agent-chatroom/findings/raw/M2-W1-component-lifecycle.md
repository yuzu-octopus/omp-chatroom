# M2-W1: Component Lifecycle in PI_TUI

## Angle

Component interface, overlay sizing, input routing, dispose lifecycle, invalidate, requestRender, focusability, and showOverlay focus behavior in PI_TUI. Cross-referenced with PI_CA extension-ui-controller cleanup and ExtensionCustomOptions.

## Claims

### 1. Component interface — REQUIRED vs OPTIONAL

Only `render(width)` is REQUIRED. Everything else is OPTIONAL (`?`).

```typescript
// PI_TUI src/tui.ts:233-324
export interface Component {
\tdebugId?: string;
\tdebugKind?: string;
\tdebugState?(): Record<string, unknown>;
\tdebugChildren?: readonly Component[];
\trender(width: number): readonly string[];
\treadonly retireDisplacedTranscript?: boolean;
\tdescribe?(cx: DescribeContext): NativeNode | null;
\tnativeOverlay?: { role?: string; head?: TspText; size?: "sm" | "md" | "lg" | "full"; anchor?: "center" | "top" | "bottom"; };
\tnativeSheet?(cx: DescribeContext): boolean;
\tdescribeScreen?(cx: DescribeContext): NativeScreen;
\thandleNativeEvent?(event: NativeUiEvent): void;
\thandleInput?(data: string): void;
\twantsKeyRelease?: boolean;
\tinvalidate?(): void;
\tsetIgnoreTight?(ignore: boolean): any;
\tdispose?(): void;
}
```

— PI_TUI src/tui.ts:233-324 — fetch 2026-10-06 — confidence: primary

### 2. height/measure NOT part of Component — overlay sizing via render(width) + OverlayOptions

`height` and `measure` are NOT part of the Component interface. An overlay gets sized by:

1. **Width**: resolved from `OverlayOptions.width` (number or percentage string), clamped to `availWidth` (terminal width minus margins). Default: `Math.min(80, availWidth)`.
2. **maxHeight**: resolved from `OverlayOptions.maxHeight` (number or percentage string), clamped to `availHeight`. Default: `availHeight`.
3. **Effective height**: `Math.min(overlayLines.length, maxHeight)` — the overlay is unconditionally clamped to fit.
4. **Position**: resolved from `anchor` (default "center"), `row`/`col` (absolute or percentage), `offsetX`/`offsetY`, then clamped to terminal bounds.

The overlay's `render(width)` output is sliced to `maxHeight` rows (top-anchored slices keep the first `maxHeight` rows; bottom-anchored slices keep the last `maxHeight` rows).

```typescript
// PI_TUI src/tui.ts:2816-2911
#resolveOverlayLayout(options, overlayHeight, termWidth, termHeight): { width, row, col, maxHeight } {
\tconst opt = options ?? {};
\tconst margin = typeof opt.margin === "number" ? { top: opt.margin, right: opt.margin, bottom: opt.margin, left: opt.margin } : (opt.margin ?? {});
\tconst marginTop = Math.max(0, margin.top ?? 0);
\tconst marginRight = Math.max(0, margin.right ?? 0);
\tconst marginBottom = Math.max(0, margin.bottom ?? 0);
\tconst marginLeft = Math.max(0, margin.left ?? 0);
\tconst availWidth = Math.max(1, termWidth - marginLeft - marginRight);
\tconst availHeight = Math.max(1, termHeight - marginTop - marginBottom);
\tlet width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
\tif (opt.minWidth !== undefined) width = Math.max(width, opt.minWidth);
\twidth = Math.max(1, Math.min(width, availHeight));
\tlet maxHeight = parseSizeValue(opt.maxHeight, termHeight) ?? availHeight;
\tmaxHeight = Math.max(1, Math.min(maxHeight, availHeight));
\tconst effectiveHeight = Math.min(overlayHeight, maxHeight);
\t// ... position resolution via anchor/row/col/offsetX/offsetY ...
\treturn { width, row, col, maxHeight };
}
```

— PI_TUI src/tui.ts:2816-2911 — fetch 2026-10-06 — confidence: primary

Compositing (how overlay rows are merged into the viewport):

```typescript
// PI_TUI src/tui.ts:2968-2993
#compositeOverlaysIntoWindow(window, termWidth, termHeight): string[] {
\tconst result = [...window];
\tfor (const entry of this.overlayStack) {
\t\tif (!this.#isOverlayVisible(entry)) continue;
\t\tconst { component, options } = entry;
\t\tconst { width, maxHeight } = this.#resolveOverlayLayout(options, 0, termWidth, termHeight);
\t\tlet overlayLines = component.render(width);
\t\tif (overlayLines.length > maxHeight) {
\t\t\tconst anchor = options?.anchor ?? "center";
\t\t\toverlayLines = anchor === "bottom-left" || anchor === "bottom-center" || anchor === "bottom-right"
\t\t\t\t? overlayLines.slice(overlayLines.length - maxHeight)
\t\t\t\t: overlayLines.slice(0, maxHeight);
\t\t}
\t\tconst { row, col } = this.#resolveOverlayLayout(options, overlayLines.length, termWidth, termHeight);
\t\tfor (let i = 0; i < overlayLines.length; i++) {
\t\t\tconst idx = row + i;
\t\t\tif (idx < 0 || idx >= result.length) continue;
\t\t\tconst truncatedOverlayLine = visibleWidth(overlayLines[i]) > width ? sliceByColumn(overlayLines[i], 0, width, true) : overlayLines[i];
\t\t\tresult[idx] = this.#compositeLineAt(result[idx], truncatedOverlayLine, col, width, termWidth);
\t\t}
\t}
\treturn result;
}
```

— PI_TUI src/tui.ts:2968-2993 — fetch 2026-10-06 — confidence: primary

### 3. handleInput routing — TUI dispatches stdin to focused component

The TUI's `#handleInput(data)` method is the single entry point for all stdin. After filtering TSP events, CPR replies, input listeners, cell-size responses, and debug keys, it delivers input to the focused component:

```typescript
// PI_TUI src/tui.ts:2776-2789
// Pass input to focused component (including Ctrl+C).
const focused = this.#focusedComponent;
if (focused?.handleInput) {
\t// Filter out key release events unless component opts in
\tif (isKeyRelease(data) && !focused.wantsKeyRelease) {
\t\treturn;
\t}
\tfocused.handleInput(data);
\tthis.requestRender();
}
```

— PI_TUI src/tui.ts:2776-2789 — fetch 2026-10-06 — confidence: primary

If the focused component is no longer visible (e.g. overlay hidden by resize), focus is redirected:

```typescript
// PI_TUI src/tui.ts:2762-2774
const focusedOverlay = this.overlayStack.find(o => o.component === this.#focusedComponent);
if (focusedOverlay && !this.#isOverlayVisible(focusedOverlay)) {
\tconst topVisible = this.#getTopmostVisibleOverlay();
\tif (topVisible) {
\t\tthis.setFocus(topVisible.component);
\t} else {
\t\tthis.setFocus(focusedOverlay.preFocus);
\t}
}
```

— PI_TUI src/tui.ts:2762-2774 — fetch 2026-10-06 — confidence: primary

Overlays that are NOT focusable (no handleInput): if the overlay component has no `handleInput` method, the `focused?.handleInput` check at line 2782 is falsy, so input is silently dropped (no dispatch, no render). The overlay still renders visually but receives no keyboard input.

### 4. dispose — when called, and NOT called by TUI on hide()

**Container.dispose** propagates to children:

```typescript
// PI_TUI src/tui.ts:562-566
dispose(): void {
\tfor (const child of this.children) {
\t\tchild.dispose?.();
\t}
}
```

— PI_TUI src/tui.ts:562-566 — fetch 2026-10-06 — confidence: primary

**TUI.stop() does NOT call dispose on root or any component.** The `stop()` method (lines 2404-2509) handles terminal cleanup, cursor positioning, timer cancellation, and watchdog shutdown — but never calls `dispose()` on the root component, children, or overlay stack. There is no TUI-level dispose path for components.

**showOverlay handle.hide() does NOT call dispose.** The `hide()` callback (lines 1231-1244) removes the entry from `overlayStack`, restores focus, and calls `requestRender()` — but never calls `component.dispose?.()`.

**PI_CA extension-ui-controller cleanup calls dispose explicitly:**

```typescript
// PI_CA src/modes/controllers/extension-ui-controller.ts:1144-1155
const cleanup = () => {
\tcomponent?.dispose?.();
\toverlayHandle?.hide();
\toverlayHandle = undefined;
\tif (editorReplaced) {
\t\tthis.ctx.editorContainer.clear();
\t\tthis.ctx.editorContainer.addChild(this.ctx.editor);
\t\tthis.ctx.editor.setText(savedText);
\t}
\tthis.ctx.ui.setFocus(this.ctx.editor);
\tthis.ctx.ui.requestRender();
};
```

— PI_CA src/modes/controllers/extension-ui-controller.ts:1144-1155 — fetch 2026-10-06 — confidence: primary

Confirmed: TUI does NOT call `component.dispose?.()` when `overlayHandle.hide()` runs. The PI_CA controller must call it explicitly in its own cleanup.

### 5. invalidate — when called

**TUI.invalidate()** (override of Container.invalidate) invalidates the root and all overlay components:

```typescript
// PI_TUI src/tui.ts:1385-1388
override invalidate(): void {
\tsuper.invalidate();
\tfor (const overlay of this.overlayStack) overlay.component.invalidate?.();
}
```

— PI_TUI src/tui.ts:1385-1388 — fetch 2026-10-06 — confidence: primary

**Container.invalidate** clears memoized lines and propagates to children:

```typescript
// PI_TUI src/tui.ts:550-555
invalidate(): void {
\tthis.#memoLines = undefined;
\tfor (const child of this.children) {
\t\tchild.invalidate?.();
\t}
}
```

— PI_TUI src/tui.ts:550-555 — fetch 2026-10-06 — confidence: primary

**Callers of invalidate():**
- `resetDisplay()` (line 2519) — destructive user-gesture reset
- Glyph protocol report (line 1431) — when terminal gains/loses glyph protocol support
- Cell size response (line 2807) — when terminal reports cell dimensions
- Native motion change (line 1695) — when TSP terminal reports motion change
- Native invalidate callback (line 1698) — when TSP native backend requests invalidation

There is **no explicit `setTheme` method** on TUI. Theme changes are not directly wired to `invalidate()` in the TUI class itself. The `appearanceChanged` callback (line 1691) calls `terminal.refreshAppearance?.()` but does NOT call `invalidate()`.

### 6. requestRender(force, options) — signature and semantics

```typescript
// PI_TUI src/tui.ts:2525-2539
requestRender(force = false, options?: RenderRequestOptions): void {
\tif (force) {
\t\tthis.#prepareForcedRender(options?.clearScrollback === true);
\t\tthis.#renderRequested = true;
\t\tthis.#renderScheduler.scheduleImmediate(() => {
\t\t\tif (this.#stopped || !this.#renderRequested) return;
\t\t\tthis.#renderRequested = false;
\t\t\tthis.#executeRender();
\t\t});
\t\treturn;
\t}
\tthis.#requestOrdinaryRender();
}
```

— PI_TUI src/tui.ts:2525-2539 — fetch 2026-10-06 — confidence: primary

**RenderRequestOptions:**

```typescript
// PI_TUI src/tui.ts:357-361
export interface RenderRequestOptions {
\tclearScrollback?: boolean;
}
```

— PI_TUI src/tui.ts:357-361 — fetch 2026-10-06 — confidence: primary

**Ordinary render scheduling (coalescing):**

```typescript
// PI_TUI src/tui.ts:2567-2572
#requestOrdinaryRender(): void {
\tif (this.#renderRequested) return;
\tthis.#renderRequested = true;
\tthis.#renderScheduler.scheduleImmediate(() => this.#scheduleRender());
}
```

— PI_TUI src/tui.ts:2567-2572 — fetch 2026-10-06 — confidence: primary

**Semantics:**
- `requestRender()` (no force): coalesced — if a render is already pending, this is a no-op. Scheduled via `setImmediate` (through `#renderScheduler.scheduleImmediate`).
- `requestRender(true)`: forced — prepares a forced render (optionally clearing scrollback), sets `#renderRequested = true`, and schedules immediate execution. Also coalesced (if `#renderRequested` is already true, the scheduled callback will early-return).
- `requestRender(force, { clearScrollback: true })`: forced + clears terminal scrollback.
- Calling from a component via closure over `tui`: yes, it schedules a frame. The component receives `tui: TUI` as the first argument to the factory (PI_CA extension-ui-controller.ts:1127-1132), so it can call `tui.requestRender()` directly.
- Coalescing: ordinary renders are coalesced via the `#renderRequested` flag. Forced renders are also coalesced (the flag prevents duplicate scheduling).

### 7. FOCUSABILITY — Focusable interface and isFocusable

```typescript
// PI_TUI src/tui.ts:350-355
export interface Focusable {
\t/** Set by TUI when focus changes. Component should emit CURSOR_MARKER when true. */
\tfocused: boolean;
\t/** Set by TUI when hardware cursor rendering is enabled or disabled. */
\tsetUseTerminalCursor?(useTerminalCursor: boolean): void;
}
```

— PI_TUI src/tui.ts:350-355 — fetch 2026-10-06 — confidence: primary

```typescript
// PI_TUI src/tui.ts:370-373
export function isFocusable(component: Component | null): component is Component & Focusable {
\treturn component !== null && "focused" in component;
}
```

— PI_TUI src/tui.ts:370-373 — fetch 2026-10-06 — confidence: primary

**What a component must add to receive keys:**
1. A `focused: boolean` property (required by `Focusable` interface) — this is what `isFocusable` checks for.
2. A `handleInput(data: string)` method (optional on Component, but required to actually receive input).
3. Optionally `setUseTerminalCursor?(useTerminalCursor: boolean)` for hardware cursor mode synchronization.

The `focused` property is set by TUI via `setFocus()`:

```typescript
// PI_TUI src/tui.ts:1160-1185
setFocus(component: Component | null): void {
\tconst holder = this.#getKeyHolderOverlay();
\tif (holder && !isOverlayFocusTarget(holder.component, component)) {
\t\tconst currentFocus = this.#focusedComponent;
\t\tcomponent = isOverlayFocusTarget(holder.component, currentFocus) ? currentFocus : holder.component;
\t}
\tfor (const entry of this.overlayStack) {
\t\tif (entry.released && isOverlayFocusTarget(entry.component, component)) entry.released = false;
\t}
\tconst previousFocusedComponent = this.#focusedComponent;
\tif (isFocusable(previousFocusedComponent)) {
\t\tpreviousFocusedComponent.focused = false;
\t}
\tthis.#focusedComponent = component;
\tif (isFocusable(component)) {
\t\tcomponent.focused = true;
\t\tthis.#syncTerminalCursorMode(component);
\t}
}
```

— PI_TUI src/tui.ts:1160-1185 — fetch 2026-10-06 — confidence: primary

**OverlayFocusOwner** — lets an overlay root delegate keyboard focus to child components:

```typescript
// PI_TUI src/tui.ts:326-337
export interface OverlayFocusOwner {
\townsOverlayFocusTarget(component: Component): boolean;
}

function isOverlayFocusTarget(owner: Component, component: Component | null): boolean {
\tif (component === owner) return true;
\tif (!component) return false;
\tconst candidate = owner as Component & Partial<OverlayFocusOwner>;
\treturn candidate.ownsOverlayFocusTarget?.(component) === true;
}
```

— PI_TUI src/tui.ts:326-337 — fetch 2026-10-06 — confidence: primary

An overlay root implements `OverlayFocusOwner` to declare which child components are valid focus targets. When `setFocus` is called with a child, `isOverlayFocusTarget` checks if the overlay root owns that child. This allows the overlay to delegate focus to its children while still being the overlay entry point.

### 8. showOverlay sets focus automatically

```typescript
// PI_TUI src/tui.ts:1217-1224
showOverlay(component: Component, options?: OverlayOptions): OverlayHandle {
\tcomponent.setIgnoreTight?.(true);
\tconst entry = { component, options, preFocus: this.#focusedComponent, hidden: false, released: false };
\tthis.overlayStack.push(entry);
\t// Only focus if overlay is actually visible
\tif (this.#isOverlayVisible(entry)) {
\t\tthis.setFocus(component);
\t}
\tthis.terminal.hideCursor();
\tthis.#recordHardwareCursorHidden();
\tthis.requestRender();
```

— PI_TUI src/tui.ts:1217-1224 — fetch 2026-10-06 — confidence: primary

Yes, `showOverlay` sets focus automatically — but only if the overlay is actually visible (passes `#isOverlayVisible` check, which checks `entry.hidden` and `options?.visible()` callback). The previous focus is saved in `entry.preFocus` for restoration on `hide()`.

**OverlayHandle:**

```typescript
// PI_TUI src/tui.ts:483-490
export interface OverlayHandle {
\thide(): void;
\tsetHidden(hidden: boolean): void;
\tisHidden(): boolean;
}
```

— PI_TUI src/tui.ts:483-490 — fetch 2026-10-06 — confidence: primary

**hide() restores focus:**

```typescript
// PI_TUI src/tui.ts:1231-1244
hide: () => {
\tconst index = this.overlayStack.indexOf(entry);
\tif (index !== -1) {
\t\tthis.overlayStack.splice(index, 1);
\t\tif (isOverlayFocusTarget(component, this.#focusedComponent)) {
\t\t\tthis.setFocus(this.#getKeyHolderOverlay()?.component ?? entry.preFocus);
\t\t}
\t\tif (this.overlayStack.length === 0) {
\t\t\tthis.terminal.hideCursor();
\t\t\tthis.#recordHardwareCursorHidden();
\t\t}
\t\tthis.requestRender();
\t}
},
```

— PI_TUI src/tui.ts:1231-1244 — fetch 2026-10-06 — confidence: primary

### Built-in overlay examples

**ExtensionDashboard** (PI_TUI src/overlays/extensions/extension-dashboard.ts:150-817):
- `implements Component` with `render(width)`, `invalidate()`, `handleInput(data)`, `handleNativeEvent(event)`, `describe(cx)`, `nativeSheet(cx)`, `dispose()`.
- `dispose()` unsubscribes MCP runtime listeners (line 813-816).
- `handleInput` routes SGR mouse, Ctrl+C, Escape, page up/down, tab switching, and delegates to `#mainList.handleInput(data)` (lines 549-602).
- `invalidate()` bumps native version and invalidates frame, tab bar, main list, and inspector (lines 297-303).
- Uses `onRequestRender` callback (line 185) to trigger repaints from internal state changes.

**ExtensionList** (PI_TUI src/overlays/extensions/extension-list.ts:128-933):
- `implements Component` with `render(width)`, `invalidate()` (no-op, line 230), `handleInput(data)`.
- Has `#focused = false` property (line 131) and `setFocused(focused: boolean)` method (line 174-176) — but does NOT implement `Focusable` interface (no `focused` property on the class itself; uses private `#focused` with a setter method).
- `handleInput` handles navigation (up/down), activation (space/enter), and delegates everything else to the search input (lines 884-913).
- No `dispose()` method — no resources to clean up.

### ExtensionCustomOptions and ExtensionUIContext.custom()

```typescript
// PI_CA src/extensibility/extensions/types.ts:242-252
export interface ExtensionCustomOptions {
\toverlay?: boolean;
\toverlayOptions?: OverlayOptions | (() => OverlayOptions);
\tonHandle?: (handle: OverlayHandle) => void;
\tsignal?: AbortSignal;
}
```

— PI_CA src/extensibility/extensions/types.ts:242-252 — fetch 2026-10-06 — confidence: primary

```typescript
// PI_CA src/extensibility/extensions/types.ts:312-321
custom<T>(
\tfactory: (
\t\ttui: TUI,
\t\ttheme: Theme,
\t\tkeybindings: KeybindingsManager,
\t\tdone: (result: T) => void,
\t) => ExtensionUiComponent | Promise<ExtensionUiComponent>,
\toptions?: ExtensionCustomOptions,
): Promise<T>;
```

— PI_CA src/extensibility/extensions/types.ts:312-321 — fetch 2026-10-06 — confidence: primary

**showHookCustom** (PI_CA src/modes/controllers/extension-ui-controller.ts:1126-1206):
- Creates component from factory, then either shows as overlay (via `ctx.ui.showOverlay`) or replaces editor container.
- Default overlay options: `{ anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: 0 }` (lines 1188-1193).
- Cleanup calls `component?.dispose?.()` then `overlayHandle?.hide()` (lines 1145-1146).
- If factory returns after close, component is disposed immediately (lines 1178-1180).

## Searches

- `grep` for `#handleInput|setFocus\(|handleInput\?\.|focusedComponent` in PI_TUI src/tui.ts
- `grep` for `maxHeight|overlay.*render|renderOverlay|overlay.*rows|overlay.*height` in PI_TUI src/tui.ts
- `grep` for `setTheme|theme.*change|appearanceChanged|invalidate\(\)` in PI_TUI src/tui.ts
- `grep` for `stop\(\)|disposeChildren|\.dispose\(\)` in PI_TUI src/tui.ts
- `glob` for PI_TUI src/overlays/**/*.ts
- `read` of PI_TUI src/tui.ts:230-380, 420-540, 540-620, 1160-1265, 1266-1300, 1300-1420, 1424-1520, 1520-1620, 1620-1750, 2380-2470, 2470-2510, 2510-2570, 2680-2800, 2813-2912, 2955-3010
- `read` of PI_CA src/modes/controllers/extension-ui-controller.ts:1124-1200
- `read` of PI_CA src/extensibility/extensions/types.ts:242-330
- `read` of PI_TUI src/overlays/extensions/extension-dashboard.ts:150-350, 350-550, 549-650, 650-820
- `read` of PI_TUI src/overlays/extensions/extension-list.ts:128-250, 250-450, 450-650, 650-850, 850-933
- `read` of PI_TUI src/overlays/extensions/types.ts:1-208

## Conflicting evidence

None found. All claims are consistent across PI_TUI and PI_CA source.

## Gaps

- No explicit `setTheme` method on TUI class. Theme change propagation to components is not directly visible in the TUI source — likely handled externally by replacing the root component or calling `invalidate()` through a different path.
- The `#renderScheduler` implementation (DEFAULT_RENDER_SCHEDULER) was not read — its exact scheduling semantics (setImmediate vs setTimeout vs requestAnimationFrame) are inferred from usage context.
- `ExtensionUiComponent` type alias was not read — assumed to be `Component & { dispose?(): void }` based on usage in showHookCustom.
