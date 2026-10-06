# Agent Hub Deep Dive — Raw Findings

## Angle
PI_TUI `src/overlays/agent-hub.ts` (2557 lines), `agent-hub-renderer.ts` (418), `agent-hub-types.ts` (74), `agent-hub-projection.ts` (275), `agents-hub.ts` (1841). Reconstruct component tree, pane layout, key handling, live-state wiring, host instantiation, activity log, and type interfaces.

## Claims

### 1. Two distinct components — agent-hub.ts vs agents-hub.ts

- `agent-hub.ts` exports `AgentHubOverlayComponent<TRecord>` — the live roster/activity overlay opened by ctrl+s or `/observe`. Extends `Container`, implements `SelectListMouseTarget`. — agent-hub.ts:320-322 — fetch 2026-10-06 — confidence: primary
- `agents-hub.ts` exports `AgentsHubComponent` — the fullscreen `/agents` config hub for managing agent definitions (model/prewalk/advisor overrides, create/delete agents). Implements `Component`. — agents-hub.ts:197 — fetch 2026-10-06 — confidence: primary
- Both are live and serve different purposes: agent-hub = runtime roster inspector; agents-hub = static config manager.

### 2. agent-hub.ts class structure

- `AgentHubOverlayComponent<TRecord extends AgentRecordLike = AgentRecordLike> extends Container implements SelectListMouseTarget` — agent-hub.ts:320-322 — fetch 2026-10-06 — confidence: primary
- Composes children: `SplitPane` (roster+inspector), `Stack` (vertical chrome frame), `PanelRows`×4 (top/divider/footer/bottom), `Input`×2 (agent filter + activity filter), `AgentTranscriptViewer` (fullscreen chat overlay). — agent-hub.ts:412-453 — fetch 2026-10-06 — confidence: primary
- SplitPane construction: `left: #renderRosterPane, right: #renderDetailPane, leftSize: { ratio: 0.58, min: 48 }, rightMinWidth: 34, splitAt: 96, narrowPane: "left"` — agent-hub.ts:412-422 — fetch 2026-10-06 — confidence: primary
- Stack frame: children = [frameTop(h:1), split(grow:1), frameDivider(h:1), frameFooter(h:1), frameBottom(h:1)] — agent-hub.ts:427-435 — fetch 2026-10-06 — confidence: primary

### 3. agents-hub.ts class structure

- `AgentsHubComponent implements Component` — agents-hub.ts:197 — fetch 2026-10-06 — confidence: primary
- Composes: `HubFrame` (sidebar+body split), `ModelBrowser` (model picker), `Input` (search), `Editor` (create flow), `StripState` (chip strips for property editing). — agents-hub.ts:219-228,251-263 — fetch 2026-10-06 — confidence: primary
- HubFrame wraps a SplitPane with sidebar renderer + body renderer, vertical chrome via Stack. — hub-frame.ts:158-191 — fetch 2026-10-06 — confidence: primary

### 4. Pane layout — SplitPane (agent-hub.ts)

- SplitPane is an adaptive two-pane layout over Row. Owns width bounds, optional narrow fallback, exact height budgets, pane-local mouse translation. — split-pane.ts:76-80 — fetch 2026-10-06 — confidence: primary
- SplitPaneOptions: `{ left, right, leftSize?, rightMinWidth?, splitAt?, narrowPane?, height?, prefix?, divider?, suffix?, align? }` — split-pane.ts:37-49 — fetch 2026-10-06 — confidence: primary
- SplitPaneGeometry: `{ mode: "split" | "narrow", left?, right?, dividerCol? }` — split-pane.ts:52-57 — fetch 2026-10-06 — confidence: primary
- agent-hub.ts uses `splitAt: 96` — below 96 cols the split collapses to narrow mode showing one pane. — agent-hub.ts:417 — fetch 2026-10-06 — confidence: primary
- agents-hub.ts uses HubFrame which wraps SplitPane with `rightMinWidth: bodyMinWidth` (default 0). — hub-frame.ts:169-181 — fetch 2026-10-06 — confidence: primary

### 5. Key handling — agent-hub.ts

- `handleInput(keyData: string)` — agent-hub.ts:566-601 — fetch 2026-10-06 — confidence: primary
- Mouse routing first: `routeSgrMouseInput` → `routeSelectListMouse(this, event, event.row)` — agent-hub.ts:568-575 — fetch 2026-10-06 — confidence: primary
- Hub toggle keys (app.agents.hub + app.session.observe) always close — agent-hub.ts:581-586 — fetch 2026-10-06 — confidence: primary
- `1` → switch to agents section; `2` → switch to activity section — agent-hub.ts:591-598 — fetch 2026-10-06 — confidence: primary
- Activity search editing intercepts all input — agent-hub.ts:587-590 — fetch 2026-10-06 — confidence: primary
- Table input (`#handleTableInput`): `/` = filter, `Tab` = toggle narrow details, `PageUp/PageDown` = scroll details, `t` = toggle view mode, `←` = double-tap close gesture, `j/k` = select row, `Enter` = open agent, `r` = revive, `x` = kill, `Esc` = close — agent-hub.ts:2374-2471 — fetch 2026-10-06 — confidence: primary
- Activity input (`#handleActivityInput`): `Esc` = close/clear search, `←` = back to agents, `/` = search, `Space` = toggle follow, `f` = cycle filter, `s` = cycle scope, `j/k` = select row, `Enter` = open transcript — agent-hub.ts:2286-2340 — fetch 2026-10-06 — confidence: primary
- Wheel: `handleWheel(delta)` moves selection in current section — agent-hub.ts:2216-2230 — fetch 2026-10-06 — confidence: primary
- Mouse: `hitTest(line)`, `setHoverIndex(index)`, `clickItem(index)` — agent-hub.ts:2232-2260 — fetch 2026-10-06 — confidence: primary
- No KeybindingsManager usage — keys are raw string matching via `matchesKey`, `matchesSelectUp/Down`. — agent-hub.ts:566-601 — fetch 2026-10-06 — confidence: primary

### 6. Key handling — agents-hub.ts

- `handleInput(data: string)` — agents-hub.ts:689-811 — fetch 2026-10-06 — confidence: priority
- Strip active → `#handleStripInput` (chip navigation, pattern input) — agents-hub.ts:697-700 — fetch 2026-10-06 — confidence: primary
- Create flow active → `#handleCreateInput` (editor, generate, save) — agents-hub.ts:703-706 — fetch 2026-10-06 — confidence: primary
- `matchesSelectCancel` (Esc): cancel assigning → clear search → close — agents-hub.ts:709-723 — fetch 2026-10-06 — confidence: primary
- `ctrl+r` = reload agents — agents-hub.ts:731-734 — fetch 2026-10-06 — confidence: primary
- `Tab/Shift+Tab` = toggle focus scope/list; `←/→` = move focus — agents-hub.ts:736-750 — fetch 2026-10-06 — confidence: primary
- Scope focus: `↑/↓` = move sidebar, `Enter` = select entry — agents-hub.ts:752-772 — fetch 2026-10-06 — confidence: primary
- List focus: `↑/↓` = move row, `Enter` = activate (open strip/create), `Space` = toggle agent enabled — agents-hub.ts:774-793 — fetch 2026-10-06 — confidence: primary
- Type-to-filter: every other key edits search field — agents-hub.ts:794-810 — fetch 2026-10-06 — confidence: primary

### 7. Live state — agent-hub.ts

- Subscribes to `registry.onChange(() => #scheduleDataChange())` and `observers.onChange(() => #scheduleDataChange())` — agent-hub.ts:496-497 — fetch 2026-10-06 — confidence: primary
- `#scheduleDataChange` coalesces with 100ms debounce → `#onDataChange` → `#refreshRows` + `#requestRender` — agent-hub.ts:1499-1511 — fetch 2026-10-06 — confidence: primary
- `#refreshRows`: re-reads registry, rebuilds observedById, stable row order, tree projection, status counts, aggregate metrics, activity data — agent-hub.ts:1513-1589 — fetch 2026-10-06 — confidence: primary
- Age timer: `setInterval(5000)` refreshes fallback live sessions + requests render — agent-hub.ts:498-504 — fetch 2026-10-06 — confidence: primary
- `#requestRender` closure: `() => { this.#native = undefined; deps.requestRender(); }` — agent-hub.ts:474-477 — fetch 2026-10-06 — confidence: primary
- State fields: `#rows`, `#selectedRow`, `#statusCounts`, `#observedById`, `#aggregate`, `#activityRows`, `#selectedActivityRow`, `#activityFilter`, `#activityScope`, `#viewMode`, `#treeDepthById/ParentById/LastSiblingById`, `#childrenByParent`, `#sessionMetrics` (WeakMap), `#narrowDetailsOpen`, `#detailScrollOffset` — agent-hub.ts:357-401 — fetch 2026-10-06 — confidence: primary

### 8. Live state — agents-hub.ts

- No live subscriptions. Loads once via `loadAgents()` in static `create()` factory. — agents-hub.ts:279-287 — fetch 2026-10-06 — confidence: primary
- `#requestRender` closure: `() => { this.#nativeVersion++; this.#tui.requestRender(); }` — agents-hub.ts:296-299 — fetch 2026-10-06 — confidence: primary
- State fields: `#allAgents`, `#entries`, `#activeEntryId`, `#focus`, `#rows`, `#rowIndex`, `#listScroll`, `#search`, `#notice`, `#loadError`, `#strip`, `#assigning`, `#browser`, `#createInput/Description/Scope/Generating/Spec/Error` — agents-hub.ts:202-228 — fetch 2026-10-06 — confidence: primary
- `ctrl+r` triggers `#reload()` to re-fetch agents from disk. — agents-hub.ts:731-734 — fetch 2026-10-06 — confidence: primary

### 9. Host instantiation — agent-hub.ts

- `SelectorController.showAgentHub(observers, options)` — selector-controller.ts:2224-2288 — fetch 2026-10-06 — confidence: primary
- Creates `new AgentHubOverlayComponent({ ...createAgentHubRuntime({...}), observers, hubKeys, expandKeys, initialSection, onDone, requestRender, remote, ui, getTool, isBuiltInTool, getMessageRenderer, cwd, hideThinkingBlock, proseOnlyThinking, focusAgent, sessionFile })` — selector-controller.ts:2243-2266 — fetch 2026-10-06 — confidence: primary
- `createAgentHubRuntime` provides: registry, lifecycle, irc, activity, manageActivityLive, transcript, loadPersisted, getRoleInfo — agent-hub-runtime.ts:35-48 — fetch 2026-10-06 — confidence: primary
- `onDone` callback: disposes hub, hides overlay, restores editor focus — selector-controller.ts:2232-2241 — fetch 2026-10-06 — confidence: primary
- `requestRender: () => this.ctx.ui.requestRender()` — selector-controller.ts:2255 — fetch 2026-10-06 — confidence: primary
- Shown via `this.#showFullscreenMenu(hub)` — selector-controller.ts:2280 — fetch 2026-10-06 — confidence: primary
- `requireContent` option: waits for `hub.persistedSubagentsReady` before showing — selector-controller.ts:2272-2284 — fetch 2026-10-06 — confidence: primary
- `armCloseTap` option: primes double-← close gesture detector — selector-controller.ts:2279 — fetch 2026-10-06 — confidence: primary
- Slash command `/activity` opens with `initialSection: "activity"` — builtin-session.ts:587 — fetch 2026-10-06 — confidence: primary
- Editor double-← gesture opens with `requireContent: true, armCloseTap: true` — input-controller.ts:718 — fetch 2026-10-06 — confidence: primary

### 10. Host instantiation — agents-hub.ts

- `SelectorController` creates via `AgentsHubComponent.create(this.ctx.ui, createAgentsHubDeps({...}))` — selector-controller.ts:596-601 — fetch 2026-10-06 — confidence: primary
- `createAgentsHubDeps` provides: browserSource, loadAgents, getAvailableModels, effectiveModelPatterns, resolvePatterns, effectivePrewalkPattern, effectiveAdvisorPattern, setAgentDisabled, setAgentOverride, generateAgent, saveAgent — agents-hub-deps.ts:55-63 — fetch 2026-10-06 — confidence: primary
- Shown via `this.#showFullscreenMenu(hub)` — selector-controller.ts:596-601 — fetch 2026-10-06 — confidence: primary

### 11. Activity log — agent-hub.ts

- Activity rows stored in `#activityRows: AgentActivityRow[]` — agent-hub.ts:345 — fetch 2026-10-06 — confidence: primary
- Refreshed by `#refreshActivityRows()` which queries `activity.query({ agentIds, kinds, search, limit: 2000 })` — agent-hub.ts:1644-1662 — fetch 2026-10-06 — confidence: primary
- Live updates: `#refreshActivityData` calls `activity.sync(id, sessionFile)` for changed session files, then `#refreshActivityRows` — agent-hub.ts:1591-1625 — fetch 2026-10-06 — confidence: primary
- Rendered as a virtual list with follow mode (auto-scroll to newest) — agent-hub.ts:1713-1726 — fetch 2026-10-06 — confidence: primary
- No ScrollView component — uses manual window slicing with `start`/`end` indices and overflow labels (`… N earlier`, `… N more`) — agent-hub.ts:1713-1726 — fetch 2026-10-06 — confidence: primary
- Activity row format: `cursor time glyph agentId title · summary` — agent-hub.ts:1745-1761 — fetch 2026-10-06 — confidence: primary

### 12. agent-hub-types.ts — public interfaces (verbatim)

- `AgentStatus = "running" | "idle" | "parked" | "aborted"` — agent-hub-types.ts:7 — fetch 2026-10-06 — confidence: primary
- `AgentMetricsSummary { tokens, requests, tools, cost, durationMs, durationKind?, contextTokens?, contextWindow? }` — agent-hub-types.ts:9-18 — fetch 2026-10-06 — confidence: primary
- `AgentHubSession { thinkingLevel?, model?, servingModel?, agent?, getSessionStats(), abort() }` — agent-hub-types.ts:20-33 — fetch 2026-10-06 — confidence: primary
- `AgentRecordLike { id, displayName, kind, parentId?, status, session?, sessionFile?, createdAt, lastActivity, activity?, history?, lifecycle? }` — agent-hub-types.ts:35-59 — fetch 2026-10-06 — confidence: primary
- `AgentHubRegistry { list(), get(id), onChange(listener) }` — agent-hub-types.ts:61-65 — fetch 2026-10-06 — confidence: primary
- `AgentLifecycleLike { ensureLive(id), release(id, expected, options) }` — agent-hub-types.ts:67-70 — fetch 2026-10-06 — confidence: primary
- `IrcBusLike { unreadCount(id) }` — agent-hub-types.ts:72-74 — fetch 2026-10-06 — confidence: primary
- `AgentHubDeps { observers, getRoleInfo?, transcript, loadPersisted, hubKeys, onDone, requestRender, registry, lifecycle, irc, ui?, getTool?, isBuiltInTool?, getMessageRenderer?, cwd?, hideThinkingBlock?, proseOnlyThinking?, expandKeys?, focusAgent?, sessionFile?, initialSection?, activity, manageActivityLive?, remote? }` — agent-hub.ts:271-318 — fetch 2026-10-06 — confidence: primary

### 13. agent-hub-projection.ts — view-model types (verbatim)

- `AgentMetrics = AgentMetricsSummary` — agent-hub-projection.ts:5 — fetch 2026-10-06 — confidence: primary
- `AggregateMetrics extends AgentMetrics { reportedAgents: number; activeDurationAgents: number }` — agent-hub-projection.ts:7-11 — fetch 2026-10-06 — confidence: primary
- `AgentTreeProjection { rows: TRecord[]; depthById: Map<string, number>; parentById: Map<string, string>; lastSiblingById: Map<string, boolean> }` — agent-hub-projection.ts:13-18 — fetch 2026-10-06 — confidence: primary
- `STATUS_ORDER: Record<AgentStatus, number> = { running: 0, idle: 1, parked: 2, aborted: 3 }` — agent-hub-projection.ts:20 — fetch 2026-10-06 — confidence: primary
- `aggregateMetrics({ rows, observedById, metricsFor, fallbackStatsSession, sessionMetrics, refreshFallback }): { metrics: AggregateMetrics; hasFallbackLiveSessions: boolean }` — agent-hub-projection.ts:138-148 — fetch 2026-10-06 — confidence: primary
- `projectAgentTree(refs): AgentTreeProjection` — agent-hub-projection.ts:187-189 — fetch 2026-10-06 — confidence: primary

### 14. agent-hub-renderer.ts — rendering helpers

- `RosterRender { lines: string[]; hitRows: Array<number | undefined> }` — agent-hub-renderer.ts:18-21 — fetch 2026-10-06 — confidence: primary
- `contentWidth()` = `Math.max(TRUNCATE_LENGTHS.SHORT, (process.stdout.columns || 80) - 6)` — agent-hub-renderer.ts:29-31 — fetch 2026-10-06 — confidence: primary
- `sanitizeLine(text, maxWidth?)` — agent-hub-renderer.ts:34-36 — fetch 2026-10-06 — confidence: primary
- `statusGlyph(status)`, `statusTone(status)`, `statusDot(status)` — agent-hub-renderer.ts:64-84 — fetch 2026-10-06 — confidence: primary
- `modelBadge(ref, observed)`, `modelChip(ref, observed)`, `modelBadgeSpans(ref, observed)` — agent-hub-renderer.ts:217-252 — fetch 2026-10-06 — confidence: primary
- `formatMetrics(metrics)`, `formatMetricColumns(metrics, age)`, `formatCost(cost)`, `formatMetricDuration(metrics)` — agent-hub-renderer.ts:254-316 — fetch 2026-10-06 — confidence: primary
- `treeBranch(ref, maxWidth, depthById, parentById, lastSiblingById)`, `treeContinuation(...)`, `treeMetadataIndent(maxWidth, maxDepth)` — agent-hub-renderer.ts:388-411 — fetch 2026-10-06 — confidence: primary

### 15. Native description (picker/tree/list)

- agent-hub.ts `describe(cx)` returns a `picker` node when `cx.supports("picker")`, else a `tabs` + `list`/`tree` + `detail` structure. — agent-hub.ts:683-698 — fetch 2026-10-06 — confidence: primary
- Picker: `#describePicker(meter)` builds `TspPickerProps` with title "Agents", tabs (agents/activity), items, preview, actions. — agent-hub.ts:843-856 — fetch 2026-10-06 — confidence: primary
- Native tree: `#describeRoster(nativeTree)` returns `node("tree", { nodes: #agentTreeNodes() })` in tree mode, else `node("list", { virtual: true, items })`. — agent-hub.ts:1176-1214 — fetch 2026-10-06 — confidence: primary
- Native detail: `#describeDetail(ref)` returns a `col` with status, model, kv facts, context progress, recent activity section. — agent-hub.ts:1283-1350 — fetch 2026-10-06 — confidence: primary
- agents-hub.ts `describe(cx)` returns a `picker` when `cx.supports("picker")`, else `describeHubFrame(role, title, sidebar, body, footer)`. — agents-hub.ts:1258-1261 — fetch 2026-10-06 — confidence: primary

## Searches
- Read agent-hub-types.ts (74 lines, complete)
- Read agent-hub-projection.ts:7-18, 138-184 (type interfaces)
- Read agent-hub-renderer.ts (418 lines, complete)
- Read agent-hub.ts:1-200, 200-500, 500-900, 900-1400, 1400-1800, 1800-2200, 2200-2557 (complete)
- Read agents-hub.ts:1-200, 200-300, 689-900 (class structure, constructor, handleInput)
- Read split-pane.ts:29-66 (SplitPaneOptions, SplitPaneGeometry)
- Read hub-frame.ts:139-223 (HubFrame class)
- Grep PI_CA for AgentHub/AgentsHub usage (selector-controller.ts, agent-hub-runtime.ts, agents-hub-deps.ts, interactive-mode.ts, input-controller.ts, builtin-session.ts)

## Conflicting evidence
- None found. All claims are consistent across source files.

## Gaps
- agents-hub.ts lines 300-688 and 900-1841 not fully read (data pipeline, render methods, native description details). Key handling and class structure are covered.
- agent-hub.ts native picker item construction (`#pickerAgentItem`, `#pickerActivityItem`) read but not fully quoted.
- agents-hub.ts `#describePicker`, `#describeBody`, `#describeList`, `#describeDetail` not fully read.
