# W4 Simple Panels — btw/jobs/report/session-info/omfg + hub-frame + extensions

## Angle

Research the reusable panel patterns in PI_TUI: the five overlay panels (btw, jobs, report, session-info, omfg), the shared hub-frame helper, and the extensions/ sub-tree (types, state-manager, inspector-model, dashboard, list, inspector-panel, display-text). Goal: identify the closest reusable pattern for an extension-owned multi-pane overlay.

## Claims

### 1. btw-panel.ts — Streaming inline answer panel

**Component tree:**
```
BtwPanelComponent extends OverlayPanel
  └─ #content: StreamingPanelContent
       └─ sections: [#contentComponent()]  → Markdown | Text
       └─ footer: () => #footerLine()       → string
```

**Construction (lines 37–51):**
```ts
constructor(options: BtwPanelComponentOptions) {
    const baseTitle = `/btw ${replaceTabs(options.question)}`;
    super(baseTitle, "omp.overlay.btw");
    this.#baseTitle = baseTitle;
    this.#question = replaceTabs(options.question);
    this.#tui = options.tui;
    this.#canBranch = options.canBranch;
    this.#canFollowUp = options.canFollowUp;
    this.#content = new StreamingPanelContent(() => ({
        sections: [this.#contentComponent()],
        footer: () => this.#footerLine(),
    }));
    this.addChild(this.#content);
    this.#rebuild();
}
```

**Input:** No `handleInput` — the panel is display-only. The parent routes `app.interrupt` (Escape) to close it. Key hints shown in footer: `c` copy, `f` follow up, `b` branch, `Esc` close.

**Close (line 126–128):**
```ts
close(): void {
    this.#closed = true;
}
```
Sets a flag; the parent checks `isCopyable()` / `getCopyText()` and calls `close()`.

**Re-render (lines 189–197):**
```ts
#rebuild(): void {
    this.#native = undefined;
    this.#content.refresh();
    this.#tui.requestComponentRender(this);
}
```
Every state mutation (`appendText`, `setAnswer`, `markComplete`, `markCopied`, `markBranching`, `markAborted`, `markError`) calls `#rebuild()` which invalidates the native node, refreshes the streaming content, and requests a component-scoped render.

**State machine:** `"running" | "complete" | "branching" | "aborted" | "error"` — drives tone, footer hints, and body content.

**Native describe (lines 135–154):** Memoized on `{canFollowUp, canBranch}`. Builds a `col` with `role: this.nativeRole`, `gap: "sm"`, and optional `tone`. Head is a `row` with spinner (when live) + title. Body is `#describeBody()`. Footer is `#describeFooter()`.

---

### 2. jobs-panel.ts — Master-detail job inspector

**Component tree:**
```
JobsSheet implements Component
  └─ nativeOverlay = { role: "omp.overlay.jobs", size: "lg", anchor: "center", head: "Background jobs" }
  └─ describe() → col
       ├─ selectList("jobs", items, { selected, empty, max: { lines: 6 } })
       ├─ describeDetail(selected, detail, now, agent)
       └─ actionBar([null, actionButton("Close", "close", { keys: "escape" })])
```

**Construction (lines 103–116):**
```ts
export class JobsSheet implements Component {
    readonly nativeOverlay = {
        role: "omp.overlay.jobs",
        size: "lg",
        anchor: "center",
        head: "Background jobs",
    } as const;
    readonly #source: JobsSheetSource;
    #selectedId: string | undefined;
    #native: { key: string; output: string | undefined; node: NativeNode } | undefined;

    constructor(source: JobsSheetSource) {
        this.#source = source;
    }
```

**Input (lines 190–195):**
```ts
handleInput(data: string): void {
    if (matchesSelectCancel(data)) this.#source.close();
    else if (matchesSelectUp(data)) this.#move(-1);
    else if (matchesSelectDown(data)) this.#move(1);
    else if (matchesKey(data, "x")) this.#cancelSelected();
}
```

**Native events (lines 198–202):**
```ts
handleNativeEvent(event: NativeUiEvent): void {
    if (event.type === "select" || event.type === "activate") this.#selectedId = event.item;
    else if (event.type === "action" && event.act === "close") this.#source.close();
    else if (event.type === "action" && event.act === "cancel") this.#cancelSelected();
}
```

**Re-render:** Memoized on a composite key (lines 126–136): `agent | job ids+statuses | selected id | pids | exitCode | artifactId | (running ? floor(now/1000) : "")`. The caller re-renders on a timer while open. `invalidate()` clears the memo.

**Source interface (lines 66–75):**
```ts
export interface JobsSheetSource {
    load(): JobsPanelSnapshot;
    inspect(id: string): JobsPanelDetail | undefined;
    cancel(id: string): void;
    close(): void;
}
```

---

### 3. report-panel.ts — Read-only scrolling report

**Component tree:**
```
ReportPanel extends OverlayPanel
  ├─ #view: ScrollView (wraps #body)
  ├─ #footer: Text
  └─ children: [Spacer(1), #view, Spacer(1), #footer]
```

**Construction (lines 74–97):**
```ts
constructor(options: ReportPanelOptions) {
    super(options.title, "omp.overlay.report");
    this.nativeOverlay = {
        role: "omp.overlay.report",
        size: "lg",
        anchor: "center",
        head: options.head ?? options.title,
    };
    this.#body = options.body;
    this.#onClose = options.onClose;
    this.#maxRows = options.maxRows;
    this.#closeHint = `${options.closeKey} to close`;
    this.#view = new ScrollView(options.body, {
        height: 0,
        scrollbar: "auto",
        ellipsis: Ellipsis.Omit,
        theme: { track: text => theme.fg("dim", text), thumb: text => theme.fg("accent", text) },
    });
    this.#footer = new Text(theme.fg("muted", this.#closeHint), 0, 0);
    this.addChild(new Spacer(1));
    this.addChild(this.#view);
    this.addChild(new Spacer(1));
    this.addChild(this.#footer);
}
```

**Input (lines 151–185):** Handles SGR mouse wheel, `matchesSelectCancel` (Esc), and scroll keys (up/down/pageUp/pageDown/home/end). Scroll requests are forwarded natively via `#scroll` and to the `ScrollView` in text mode.

**Close:** `onClose` callback from options; also `handleNativeEvent` for the Close button.

**Re-render:** `render(width)` computes body rows, caps to `maxRows`, sets `ScrollView` height, and slices output. `describe()` memoizes on `#scroll`.

---

### 4. session-info-overlay.ts — Key/value report panel

**Component tree:**
```
SessionInfoOverlay implements Component
  └─ #panel: OverlayPanel
       ├─ #scrollView: ScrollView
       ├─ PanelDivider
       └─ #footer: PanelRows
```

**Construction (lines 118–139):**
```ts
constructor(host: SessionInfoOverlayHost, info: string, onClose: () => void, context?: ContextUsage) {
    this.#host = host;
    this.#onClose = onClose;
    this.#context = context;
    this.#infoSource = info;
    this.#info = new Text(info, 0, 0);
    this.#scrollView = new ScrollView([], {
        height: 0,
        scrollbar: "auto",
        ellipsis: Ellipsis.Omit,
        theme: {
            track: text => theme.fg("dim", text),
            thumb: text => theme.fg("accent", text),
        },
    });
    this.#footer = new PanelRows();
    this.#footer.setHeight(1);
    this.#panel = new OverlayPanel("Session Info");
    this.#panel.addChild(this.#scrollView);
    this.#panel.addChild(new PanelDivider());
    this.#panel.addChild(this.#footer);
}
```

**Input (lines 141–147):**
```ts
handleInput(data: string): void {
    if (matchesSelectCancel(data) || matchesKey(data, "escape") || matchesKey(data, "esc")) {
        this.#onClose();
        return;
    }
    this.#scrollView.handleScrollKey(data);
}
```

**Close:** `onClose` callback; also `handleNativeEvent` for Close button.

**Re-render:** `render(width)` recomputes info lines, sets `ScrollView` height to fit terminal, and delegates to `#panel.render(width)`. `describe()` memoizes on `meter` support.

---

### 5. omfg-panel.ts — Streaming rule-generation panel

**Component tree:**
```
OmfgPanelComponent extends OverlayPanel
  └─ #content: StreamingPanelContent
       └─ sections: [Text(status), #contentComponent()]  → Markdown | Text
       └─ footer: #footerLine()                             → string
```

**Construction (lines 50–60):**
```ts
constructor(options: OmfgPanelComponentOptions) {
    super(`/omfg ${replaceTabs(options.complaint)}`, "omp.overlay.omfg");
    this.#tui = options.tui;
    this.#complaint = replaceTabs(options.complaint);
    this.#content = new StreamingPanelContent(() => ({
        sections: [new Text(theme.fg("muted", replaceTabs(this.#status)), 0, 0), this.#contentComponent()],
        footer: this.#footerLine(),
    }));
    this.addChild(this.#content);
    this.#rebuild();
}
```

**Input:** No `handleInput` — display-only. Parent routes `app.interrupt` to close.

**Close (lines 115–117):**
```ts
close(): void {
    this.#closed = true;
}
```

**Re-render (lines 184–188):**
```ts
#rebuild(): void {
    this.#native = undefined;
    this.#content.refresh();
    this.#tui.requestRender();
}
```
Same pattern as btw-panel but calls `requestRender()` (full) instead of `requestComponentRender(this)`.

**State machine:** `"generating" | "validating" | "confirming" | "saving" | "saved" | "rejected" | "aborted" | "error"` — drives tone, footer, and body.

---

### 6. hub-frame.ts — Shared fullscreen hub chrome

**Exported interfaces (lines 13–48):**
```ts
export interface SidebarEntry<TKind extends string> {
    id: string;
    kind: TKind;
    label: string;
    annotation?: string;
}

export interface StripChip<TAction> {
    label: string;
    styled: string;
    action: TAction;
}

export interface StripState<TChip extends StripChip<unknown>> {
    chips: TChip[];
    index: number;
}

export interface ChipRange {
    start: number;
    end: number;
    index: number;
}

export interface SidebarStyle {
    icon: string;
    annotation: string;
    muted?: boolean;
    hovered?: boolean;
    padTruncated?: boolean;
}
```

**Exported functions (lines 50–136):**
```ts
export function moveStripSelection(strip: StripState<StripChip<unknown>>, data: string): boolean {
    if (matchesKey(data, "left") || matchesKey(data, "up") || matchesKey(data, "shift+tab")) {
        strip.index = (strip.index - 1 + strip.chips.length) % strip.chips.length;
        return true;
    }
    if (matchesKey(data, "right") || matchesKey(data, "down") || matchesKey(data, "tab")) {
        strip.index = (strip.index + 1) % strip.chips.length;
        return true;
    }
    return false;
}

export function describeHubSidebar<TEntry extends SidebarEntry<string>>(
    entries: readonly TEntry[],
    selectedId: string,
    style: (entry: TEntry, index: number) => Pick<SidebarStyle, "icon" | "annotation" | "muted">,
    key = "sidebar",
): NativeNode {
    const items: NativeNode[] = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.kind === "separator") {
            items.push(node("rule", undefined, undefined, entry.id));
            continue;
        }
        const decoration = style(entry, i);
        items.push(
            node(
                "item",
                {
                    label: decoration.icon
                        ? [
                                span(`${plainText(decoration.icon)} `, "muted"),
                                span(entry.label, decoration.muted ? "dim" : undefined),
                            ]
                        : [span(entry.label, decoration.muted ? "dim" : undefined)],
                    value: decoration.annotation ? plainText(decoration.annotation) : undefined,
                },
                undefined,
                entry.id,
            ),
        );
    }
    return node("list", { selected: selectedId }, items, key);
}

export function describeHubChips(strip: StripState<StripChip<unknown>>, prefix?: TspText, key = "chips"): NativeNode {
    const tabs = node(
        "tabs",
        {
            items: strip.chips.map((chip, index) => ({ id: String(index), label: chip.label })),
            active: String(strip.index),
        },
        undefined,
        "tabs",
    );
    const children: NativeChild[] = prefix === undefined ? [tabs] : [text(prefix), tabs];
    return node("row", { gap: "sm", align: "center" }, children, key);
}

export function describeHubFrame(
    role: string,
    title: TspText,
    sidebar: NativeChild,
    body: NativeChild,
    footer: NativeChild,
): NativeNode {
    return overlayCard(role, title, [
        node("row", { gap: "md", align: "start", grow: 1 }, [sidebar, body], "split"),
        node("rule", undefined, undefined, "divider"),
        footer,
    ]);
}
```

**HubFrame class (lines 139–360):** Persistent fullscreen split frame with:
- `constructor(title, sidebarBounds, renderSidebar, renderBody, options)` — composes a `SplitPane` + `Stack` with top border, divider, footer, bottom border.
- `sidebarWidth(entries)` — measures labels/annotations within bounds.
- `scrollSidebar(delta, rows, entryCount)` — pans the sidebar.
- `selectChipAt(strip, col)` — hit-tests footer chips.
- `renderSidebar(entries, width, rows, selection, style)` — renders the sidebar viewport with follow/clamp policy.
- `renderFooter(width, hint, renderStrip?)` — renders footer hint or chip strip.
- `renderChips(width, prefix, strip, start)` — renders footer chips with hit ranges.
- `locate(row, col)` — translates mouse position to footer/sidebar/body coordinates.
- `render(width, height, entries, footer)` — paints the complete fullscreen hub.

---

### 7. extensions/types.ts — Dashboard domain types

**Extension interface (lines 42–75):**
```ts
export interface Extension {
    id: string;
    kind: ExtensionKind;
    name: string;
    displayName: string;
    description?: string;
    trigger?: string;
    path: string;
    source: {
        provider: string;
        providerName: string;
        level: "user" | "project" | "native";
    };
    state: ExtensionState;
    disabledReason?: DisabledReason;
    shadowedBy?: string;
    raw: unknown;
}
```

**DashboardState (lines 144–166):**
```ts
export interface DashboardState {
    tabs: ProviderTab[];
    activeTabIndex: number;
    extensions: Extension[];
    tabFiltered: Extension[];
    searchFiltered: Extension[];
    searchQuery: string;
    listIndex: number;
    scrollOffset: number;
    selected: Extension | null;
}
```

**DashboardCallbacks (lines 171–178):**
```ts
export interface DashboardCallbacks {
    onProviderToggle: (providerId: string, enabled: boolean) => void;
    onExtensionToggle: (extensionId: string, enabled: boolean) => void;
    onClose: () => void;
}
```

**TreeNode (lines 96–111):**
```ts
export interface TreeNode {
    id: string;
    label: string;
    type: TreeNodeType;
    enabled: boolean;
    collapsed: boolean;
    children: TreeNode[];
    count?: number;
}
```

**ProviderTab (lines 130–139):**
```ts
export interface ProviderTab {
    id: string;
    label: string;
    enabled: boolean;
    count: number;
}
```

**ExtensionProvider (lines 5–11):**
```ts
export interface ExtensionProvider {
    id: string;
    displayName: string;
    enabled: boolean;
    userSourceEnabled: boolean;
    foreignUserSource: boolean;
}
```

---

### 8. extensions/state-manager.ts — Pure dashboard state logic

**Exported functions:**
- `resolveExtensionState(source, isDisabled, isShadowed, providers)` → `{ state, disabledReason? }` (lines 16–33)
- `buildSidebarTree(extensions, providers)` → `TreeNode[]` (lines 39–96) — groups by provider → kind
- `flattenTree(tree)` → `FlatTreeItem[]` (lines 101–119)
- `applyFilter(extensions, query)` → `Extension[]` (lines 124–146) — fuzzy match on name/displayName/description/trigger/providerName/kind
- `getKindDisplayName(kind)` → `string` (lines 151–176)
- `buildProviderTabs(extensions, providers)` → `ProviderTab[]` (lines 181–232) — ALL first, then by count
- `filterByProvider(extensions, providerId)` → `Extension[]` (lines 237–242)
- `applyDisabledExtensionsToState(state, disabledIds, providers)` → `DashboardState` (lines 248–275)
- `createInitialState(extensions, providers)` → `DashboardState` (lines 280–296)
- `refreshState(state, extensions, providers)` → `DashboardState` (lines 301–337) — re-applies filters, preserves selection

---

### 9. extensions/inspector-model.ts — Kind-specific view-models

**ExtensionInspectorSource (lines 72–81):**
```ts
export interface ExtensionInspectorSource {
    readToolHeader?(filePath: string): string | undefined;
    parseRule?(raw: Record<string, unknown>): {
        condition?: string[];
        astCondition?: string[];
        scope?: string[];
        agents?: string[];
    };
}
```

**LiveToolRecord (lines 18–29):**
```ts
export interface LiveToolRecord {
    name: string;
    label?: string;
    description?: string;
    parameters?: unknown;
    hidden?: boolean;
    loadMode?: "essential" | "discoverable";
    source?: "builtin" | "mcp" | "sdk" | "extension";
    sourcePath?: string;
}
```

**ToolParamView (lines 36–42):**
```ts
export interface ToolParamView {
    name: string;
    type: string;
    required: boolean;
    flag: string;
    description?: string;
}
```

**CommandPreview (lines 44–49):**
```ts
export interface CommandPreview {
    description?: string;
    body: string;
    argumentHint?: string;
    usesArguments: boolean;
}
```

**Key exported functions:**
- `liveToolsForExtension(ext, source)` → `LiveToolRecord[]` (lines 211–241)
- `toolInspectorData(ext, lives, source?)` → `{ label?, description?, params, runtimeDetail?, factory }` (lines 297–340)
- `ruleInspectorData(ext, source?)` → `{ description?, alwaysApply, globs?, condition?, astCondition?, scope?, agents?, interruptMode?, content, runtimeDetail? }` (lines 342–375)
- `skillInspectorData(ext)` → `{ description?, content, globs?, alwaysApply, hidden, runtimeDetail? }` (lines 377–402)
- `commandInspectorData(ext)` → `{ description?, body, argumentHint?, usesArguments, runtimeDetail? }` (lines 404–419)
- `hookInspectorData(ext)` → `{ hookType?, tool?, runtimeDetail? }` (lines 421–434)
- `promptInspectorData(ext)` → `{ content, runtimeDetail? }` (lines 436–442)
- `instructionInspectorData(ext)` → `{ content, applyTo?, runtimeDetail? }` (lines 444–455)
- `contextInspectorData(ext)` → `{ content, runtimeDetail? }` (lines 457–464)
- `enablementLabel(state, reason?, shadowedBy?)` → `string` (lines 466–484)
- `formatExtensionListHint(ext, lives?)` → `string | undefined` (lines 271–295)
- `projectListHint(ext)` → `string | undefined` (lines 257–264)
- `joinListHints(...parts)` → `string | undefined` (lines 266–269)

---

### 10. extensions/extension-dashboard.ts — Master-detail control center

**Component tree:**
```
ExtensionDashboard implements Component
  ├─ #tabBar: TabBar
  ├─ #body: TwoColumnBody
  │    ├─ #leftPane: ExtensionList
  │    └─ #rightPane: InspectorPanel
  ├─ #frame: Stack
  │    ├─ #frameTop: PanelRows          (top border)
  │    ├─ #frameTabs: PanelRows         (tab bar)
  │    ├─ #frameUpperDivider: PanelRows (divider)
  │    ├─ #frameBody: PanelRows         (two-column body)
  │    ├─ #frameLowerDivider: PanelRows (divider)
  │    ├─ #frameFooter: PanelRows       (footer hint)
  │    └─ #frameBottom: PanelRows       (bottom border)
  └─ #native: Memo<NativeNode>
```

**Construction (lines 192–255):**
```ts
private constructor(
    runtime: ExtensionDashboardRuntime,
    terminalHeight: number,
    toolSource: ToolRuntimeSource | undefined,
) {
    this.#runtime = runtime;
    this.#terminalHeight = terminalHeight;
    this.#toolSource = toolSource;
}

static async create(options: ExtensionDashboardOptions): Promise<ExtensionDashboard> {
    const dashboard = new ExtensionDashboard(
        options.runtime,
        options.terminalHeight ?? process.stdout.rows ?? 24,
        options.toolSource,
    );
    await dashboard.#init();
    return dashboard;
}

async #init(): Promise<void> {
    const disabledIds = this.#runtime.getDisabledExtensions();
    this.#state = createInitialState(await this.#runtime.loadExtensions(disabledIds), this.#runtime.getProviders());

    const initialMaxVisible = Math.max(3, this.#terminalHeight - 9);
    this.#inspector = new InspectorPanel(this.#runtime.inspectorSource);
    this.#inspector.setMcpSource(this.#runtime.mcpSource);
    this.#inspector.setToolSource(this.#toolSource);
    this.#mainList = new ExtensionList(
        this.#state.searchFiltered,
        {
            getProviders: () => this.#runtime.getProviders(),
            onSelectionChange: ext => {
                this.#state.selected = ext;
                this.#inspector.setExtension(ext);
                this.#body.resetInspectorScroll();
            },
            onToggle: (extensionId, enabled) => this.#handleExtensionToggle(extensionId, enabled),
            onMasterToggle: providerId => this.#handleProviderToggle(providerId),
            onUserSourceToggle: providerId => this.#handleUserSourceToggle(providerId),
            masterSwitchProvider: this.#getActiveProviderId(),
            mcpSource: this.#runtime.mcpSource,
            toolSource: this.#toolSource,
        },
        initialMaxVisible,
    );
    this.#mainList.setFocused(true);
    this.#mainList.setMcpSource(this.#runtime.mcpSource);
    this.#mainList.setToolSource(this.#toolSource);

    if (this.#state.selected) {
        this.#inspector.setExtension(this.#state.selected);
    }

    this.#subscribeMcpRuntime();

    this.#body = new TwoColumnBody(this.#mainList, this.#inspector, this.#terminalHeight);

    this.#tabBar = new TabBar("", buildTabBarTabs(this.#state.tabs), getTabBarTheme());
    this.#tabBar.showHint = false;
    this.#tabBar.onTabChange = tab => this.#selectProviderById(tab.id);
    const activeId = this.#state.tabs[this.#state.activeTabIndex]?.id;
    if (activeId) this.#tabBar.setActiveById(activeId);
}
```

**Input (lines 549–602):**
```ts
handleInput(data: string): void {
    if (data.startsWith("\x1b[<")) {
        this.#handleMouse(data);
        return;
    }
    if (matchesKey(data, "ctrl+c")) {
        this.#close();
        return;
    }
    if (matchesAppInterrupt(data)) {
        if (this.#state.searchQuery.length > 0) {
            this.#clearSearch();
            return;
        }
        this.#close();
        return;
    }
    if (matchesAppToolsExpand(data)) {
        this.#inspector.toggleExpanded();
        this.#requestRender();
        return;
    }
    const page = matchesSelectPageUp(data) ? -1 : matchesSelectPageDown(data) ? 1 : 0;
    if (page !== 0) {
        this.#inspectorScroll = { by: page < 0 ? "page-up" : "page-down", n: (this.#inspectorScroll?.n ?? 0) + 1 };
    }
    if (this.#body.pageInspector(page)) {
        this.#requestRender();
        return;
    }
    if (this.#tabBar.handleInput(data)) {
        return;
    }
    this.#mainList.handleInput(data);
    const query = this.#mainList.getSearchQuery();
    if (query !== this.#state.searchQuery) {
        this.#state.searchQuery = query;
        this.#state.searchFiltered = applyFilter(this.#state.tabFiltered, query);
    }
    this.#requestRender();
}
```

**Close (lines 604–607):**
```ts
#close(): void {
    this.dispose();
    this.onClose?.();
}
```

**Live refresh (lines 809–811):**
```ts
#subscribeMcpRuntime(): void {
    this.#unsubscribers.push(...this.#runtime.subscribeMcpChanges(() => this.#requestRender()));
}
```
MCP health changes arrive as render requests. Full refresh (`#refreshFromState`) re-loads extensions and re-applies filters.

**Native describe (lines 634–644):**
```ts
describe(cx: DescribeContext): NativeNode {
    const sheet = this.nativeSheet(cx);
    const toolFrame = snapshotToolRuntimeSource(this.#toolSource);
    let tools = "";
    for (const tool of toolFrame?.listLiveTools?.() ?? []) tools += `${tool.name}${tool.hidden ? "!" : ""}\0`;
    return this.#native.get([this.#nativeVersion, sheet, tools, this.#inspectorScroll], () => {
        this.#mainList.setToolSource(toolFrame);
        this.#inspector.setToolSource(toolFrame);
        return sheet ? this.#describePicker() : this.#describePage();
    });
}
```

**TwoColumnBody (lines 825–902):** A `SplitPane` with `leftPane: ExtensionList` and `rightPane: InspectorPanel`. The right pane is wrapped in a `ScrollView` for wheel scrolling. `locate(line, col)` hit-tests panes. `scrollInspector(delta)` and `pageInspector(delta)` manage scroll offset.

---

### 11. extensions/extension-list.ts — Inventory list with search

**Component tree:**
```
ExtensionList implements Component
  ├─ #menu: MenuSelection<ListItem>
  ├─ #search: Input
  └─ callbacks: ExtensionListCallbacks
```

**Construction (lines 146–159):**
```ts
constructor(extensions: Extension[], callbacks: ExtensionListCallbacks = {}, maxVisible?: number) {
    this.#extensions = extensions;
    this.#callbacks = callbacks;
    this.#masterSwitchProvider = callbacks.masterSwitchProvider ?? null;
    this.#mcpSource = callbacks.mcpSource;
    this.#toolSource = callbacks.toolSource;
    this.#maxVisible = maxVisible ?? DEFAULT_MAX_VISIBLE;
    this.#search.prompt = "";
    this.#menu = new MenuSelection<ListItem>(this.#buildListItems(""), {
        getKey: getListItemKey,
        getSearchText: getListItemSearchText,
        filter: (_items, query) => this.#buildListItems(query),
    });
}
```

**Input (lines 884–913):**
```ts
handleInput(data: string): void {
    if (matchesSelectUp(data)) {
        this.#moveSelectionUp();
        return;
    }
    if (matchesSelectDown(data)) {
        this.#moveSelectionDown();
        return;
    }
    if (data === " " || matchesKey(data, "enter") || matchesKey(data, "return") || data === "\n") {
        this.activateSelected();
        return;
    }
    const before = this.#search.getValue();
    this.#search.handleInput(data);
    const after = this.#search.getValue();
    if (after !== before) {
        this.#menu.setQuery(after, false);
        this.#scrollOffset = 0;
        this.#notifySelectionChange();
    }
}
```

**Key handling:** Up/Down navigate, Space/Enter toggle, all other input goes to search field. Bare `j`/`k` are NOT navigation (they reach the search query).

**Live refresh:** `setExtensions(extensions)` rebuilds the list, preserving selection index. `setToolSource(source)` updates the live tool frame. `pickerView()` and `describeList(key)` join live MCP health and tool runtime at render time.

---

### 12. extensions/inspector-panel.ts — Detail pane

**Component tree:**
```
InspectorPanel implements Component
  ├─ #extension: Extension | null
  ├─ #mcpSource: MCPRuntimeSource | undefined
  ├─ #toolSource: ToolRuntimeSource | undefined
  ├─ #source: ExtensionInspectorSource | undefined
  └─ #expanded: boolean
```

**Construction (lines 107–109):**
```ts
constructor(source?: ExtensionInspectorSource) {
    this.#source = source;
}
```

**Key API:**
- `setExtension(extension)` — sets the selected extension, resets expanded state if key changed
- `setMcpSource(source)` / `setToolSource(source)` — set live runtime sources
- `setHeight(height)` — sets the render height for budget calculations
- `isExpanded()` / `toggleExpanded()` — manage expanded/collapsed preview state
- `render(width)` → `string[]` — ANSI rendering
- `describePreview()` → `NativeNode[]` — native preview nodes

**Native preview (lines 158–196):**
```ts
describePreview(): NativeNode[] {
    const ext = this.#extension;
    if (!ext) {
        return [text([span("Select an extension to view details", "muted")], { wrap: "word" })];
    }
    this.#toolFrame = snapshotToolRuntimeSource(this.#toolSource);
    const view = this.#nativeKindView(ext);
    const name = sanitizeDisplayLine(ext.displayName);
    const title = sanitizeDisplayLineField(view.title);
    const levelLabel = ext.source.level === "user" ? "User" : ext.source.level === "project" ? "Project" : "Native";
    const filePath = sanitizeDisplayText(ext.path);
    const facts = kv([
        ...view.runtime,
        ["Status", view.health && ext.state === "active" ? undefined : this.#nativeStatus(ext)],
        ["Origin", `via ${sanitizeDisplayLine(ext.source.providerName)} (${levelLabel})`],
        [
            "Path",
            [
                span(
                    sanitizeDisplayText(shortenPath(ext.path, os.homedir())),
                    "path dim",
                    filePath.startsWith("/") ? { href: `file://${filePath}` } : undefined,
                ),
            ],
        ],
    ]);
    const out: NativeNode[] = compact<NativeNode>([
        node("text", { text: name, role: "omp.picker.title" }, undefined, "title"),
        title && title !== name ? node("text", { spans: [span(title, "muted")] }, undefined, "subtitle") : undefined,
        facts && keyed(facts, "facts"),
        this.#nativeShortText(view.description, "description"),
        this.#nativeShortText(view.guidance, "guidance"),
        ...view.sections,
    ]);
    if (view.preview) out.push(this.#nativePreviewSection(view.preview.heading, view.preview.text));
    const config = kv(view.config);
    if (config) out.push(keyed(config, "config"));
    return out;
}
```

**Live refresh:** `render()` and `describePreview()` both call `snapshotToolRuntimeSource(this.#toolSource)` to get the current live tool frame. MCP health is joined via `snapshotMcpRuntime(ext.raw, this.#mcpSource, ...)` in `#nativeMcpKind`.

---

### 13. extensions/display-text.ts — Text sanitization helpers

**Exported functions (lines 12–39):**
```ts
/** Strip ANSI/C0/C1/malformed unicode, then expand tabs. Call before theming. */
export function sanitizeDisplayText(text: string): string {
    return replaceTabs(sanitizeText(text));
}

/** Collapse newlines to spaces so a hostile title cannot inject extra TUI rows (no trimming). */
export function sanitizeDisplaySingleLine(text: string): string {
    return sanitizeDisplayText(text).replace(/[\r\n]+/g, " ");
}

/** Collapse newlines so a hostile title cannot inject extra TUI rows. */
export function sanitizeDisplayLine(text: string): string {
    return sanitizeDisplaySingleLine(text).trim();
}

/** Like {@link sanitizeDisplayText}, dropping empty results. */
export function sanitizeDisplayField(text: string | undefined | null): string | undefined {
    if (typeof text !== "string" || text.length === 0) return undefined;
    const cleaned = sanitizeDisplayText(text);
    return cleaned.length > 0 ? cleaned : undefined;
}

/** Like {@link sanitizeDisplayLine}, dropping empty results. */
export function sanitizeDisplayLineField(text: string | undefined | null): string | undefined {
    if (typeof text !== "string" || text.length === 0) return undefined;
    const cleaned = sanitizeDisplayLine(text);
    return cleaned.length > 0 ? cleaned : undefined;
}
```

**Usage pattern:** All inspector-panel and extension-list display fields are sanitized through these helpers before being passed to `theme.fg()` / `theme.bold()` etc. This prevents ANSI injection from untrusted extension content.

---

## Searches

- Read btw-panel.ts (238 lines), jobs-panel.ts (321 lines), report-panel.ts (191 lines), session-info-overlay.ts (277 lines), omfg-panel.ts (223 lines)
- Read hub-frame.ts (360 lines)
- Read extensions/types.ts (208 lines), state-manager.ts (337 lines), inspector-model.ts (484 lines)
- Read extension-dashboard.ts (902 lines), extension-list.ts (933 lines), inspector-panel.ts (1037 lines)
- Read display-text.ts (39 lines)

## Conflicting evidence

None. All files read directly from source.

## Gaps

- OverlayPanel base class (chrome/overlay-box.ts) not read — its `addChild`, `nativeRole`, `title`, and `invalidate` semantics are inferred from usage.
- StreamingPanelContent (chrome/streaming-panel.ts) not read — its `refresh()` and `sections`/`footer` callback contract is inferred from btw-panel and omfg-panel usage.
- The `Component` interface (tui.ts) is already verified in prior research.
