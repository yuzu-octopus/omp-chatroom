# F2 omp Plugin Surface

## Angle
What can an omp extension do? Full inventory of registration methods, event surface, message-delivery semantics, timer isolation, ephemeral turns, agent identity, subagent hooks, state durability, restricted children limits, and MCP bridging. Every code claim quotes repo path:line.

## Claims

### Registration API

- `registerTool(tool)` registers an LLM-callable tool; `ToolDefinition` fields: `name`, `label`, `description`, `parameters` (omptype schema), `hidden`, `defaultInactive`, `loadMode` (`"discoverable"` default, `"essential"` for built-in names), `deferrable`, `readsSkillUris`, `approval` (default `"exec"`), `strict`, `mcpServerName`, `mcpToolName`, `legacyName`, `sourcePath`, `shellEnv`, `execute(toolCallId, params, signal, onUpdate, ctx)`, `onSession(event, ctx)`, `renderCall`, `renderResult`, `describeCall`, `describeResult` | `types.ts:669-744` | fetch date 2026-10-06 | confidence: primary
- `registerCommand(name, {description?, getArgumentCompletions?, handler})` registers a slash command; handler receives `(args: string, ctx: ExtensionCommandContext)` | `types.ts:1520-1527` | fetch date 2026-10-06 | confidence: primary
- `registerShortcut(shortcut: KeyId, {description?, handler})` registers a keyboard shortcut; reserved keys (ctrl+c/d/z/k/p/l/o/t/g, ctrl+q, alt+m, shift+tab, shift+ctrl+p, alt+enter, escape, enter) rejected with warning | `runner.ts:1211-1229` | fetch date 2026-10-06 | confidence: primary
- `registerFlag(name, {description?, type: "boolean"|"string", default?})` registers a CLI flag; `getFlag(name)` reads its value | `types.ts:1539-1552` | fetch date 2026-10-06 | confidence: primary
- `registerMessageRenderer(customType, renderer)` registers a custom renderer for `CustomMessageEntry` | `types.ts:1559` | fetch date 2026-10-06 | confidence: primary
- `registerAssistantThinkingRenderer(renderer)` adds display-only UI below thinking blocks | `types.ts:1562` | fetch date 2026-10-06 | confidence: primary
- `registerComposerShape(definition)` adds an editor layout; built-in ids cannot be replaced; later extension wins collisions | `types.ts:1570` | fetch date 2026-10-06 | confidence: primary
- `registerFileWriteFallback(handler)` registers fallback for EPERM/EACCES/EROFS on native write/edit/apply_patch; first `true` wins; process-wide registry; must register during load | `types.ts:1488`, `omp://extensions.md` § "File write fallback" | fetch date 2026-10-06 | confidence: primary
- `registerFileDeleteFallback(handler)` registers fallback for EPERM/EACCES/EROFS on unlink; separate from write fallback; must register during load | `types.ts:1513`, `omp://extensions.md` § "File delete fallback" | fetch date 2026-10-06 | confidence: primary
- `registerProvider(name, config)` / `unregisterProvider(name)` register/override model providers; can include `usage` field with `fetchUsage` | `types.ts:1684-1692`, `omp://extensions.md` § "Provider registration" | fetch date 2026-10-06 | confidence: primary

### Event surface (38 events)

- Full event union: `resources_discover`, `session_start`, `session_before_switch`, `session_switch`, `session_before_branch`, `session_branch`, `session_before_compact`, `session.compacting`, `session_compact`, `session_shutdown`, `session_before_tree`, `session_tree`, `context`, `cache_warming_decision`, `before_provider_request`, `after_provider_response`, `before_agent_start`, `before_subagent_spawn`, `agent_start`, `agent_end`, `session_stop`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `assistant_message`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `auto_compaction_start`, `auto_compaction_end`, `auto_retry_start`, `auto_retry_end`, `retry_fallback_applied`, `retry_fallback_succeeded`, `ttsr_triggered`, `todo_reminder`, `goal_updated`, `credential_disabled`, `input`, `tool_approval_requested`, `tool_approval_resolved`, `tool_call`, `tool_result`, `user_bash`, `user_python`, `mcp_notification` | `types.ts:1204-1242` | fetch date 2026-10-06 | confidence: primary
- `session_shutdown` handlers run concurrently with 2-second budget (`SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS = 2_000`) | `runner.ts:154`, `runner.ts:1585-1597` | fetch date 2026-10-06 | confidence: primary
- `tool_call` handlers bounded by `extensionHandlers.toolCallTimeoutMs` (default 30,000ms); fail-closed on timeout/error (returns `{block: true}`) | `runner.ts:1813-1861` | fetch date 2026-10-06 | confidence: primary
- `before_subagent_spawn` fires once per spawned child at dispatch; can return `{model}` to replace model patterns, `{block: true}` to refuse spawn, `{note}` for routing reason | `runner.ts:2163-2193` | fetch date 2026-10-06 | confidence: primary
- `context` event receives conversation messages; may return `{messages}` replacement; handlers chain without rewriting persisted history | `runner.ts:1968-2042` | fetch date 2026-10-06 | confidence: primary
- `assistant_message` event: awaited once per finalized assistant message; return `{content}` to replace text; text blocks must retain count/order/positions | `runner.ts:1663-1737` | fetch date 2026-10-06 | confidence: primary
- `input` event runs at submission ingress before command interpretation; `handled: true` stops remaining handlers | `runner.ts:1942-1966` | fetch date 2026-10-06 | confidence: primary
- `mcp_notification` fires for every JSON-RPC notification from connected MCP servers, AFTER manager's own handling | `types.ts:988-1000`, `runner.ts:974-982` | fetch date 2026-10-06 | confidence: primary

### Message delivery semantics

- `pi.sendMessage(message, {deliverAs, triggerTurn})` — `deliverAs: "steer"` (default while streaming), `"followUp"` (queued behind current run), `"nextTurn"` (hidden, waits for next turn), `"aside"` (injected at next step boundary without interrupting tool batch) | `types.ts:1592-1595`, `omp://extensions.md` § "Message delivery semantics" | fetch date 2026-10-06 | confidence: primary
- `pi.sendUserMessage(content, {deliverAs, attribution})` — submits text/images without slash-command expansion; `attribution: "user"` default, `"agent"` for extension-generated text | `types.ts:1600`, `omp://extensions.md` § "Message delivery semantics" | fetch date 2026-10-06 | confidence: primary
- `pi.appendEntry(customType, data?)` — appends custom entry to session for state persistence (NOT sent to LLM) | `types.ts:1603` | fetch date 2026-10-06 | confidence: primary
- `triggerTurn: true` starts a turn when idle (also honored with `deliverAs: "nextTurn"`) | `omp://extensions.md` § "Message delivery semantics" | fetch date 2026-10-06 | confidence: primary
- When idle without `triggerTurn`, ordinary `sendMessage` delivery appends message without starting a turn; `display: true` renders immediately | `omp://extensions.md` § "Message delivery semantics" | fetch date 2026-10-06 | confidence: primary
- `deliverAs: "aside"` when idle starts a turn regardless of `triggerTurn`; plan mode folds into context instead | `omp://extensions.md` § "Message delivery semantics" | fetch date 2026-10-06 | confidence: primary

### EventBus sharing

- `pi.events` is a shared `EventBus` — one per top-level session tree; shared by main + all its subagents; NOT process-global across independent top-level sessions. SDK creates `const eventBus = options.eventBus ?? new EventBus()` per `createAgentSession` call (`src/sdk.ts:1632`) and forwards THAT bus to children (`eventBus: session.eventBus`, `src/task/structured-subagent.ts:653`). CLI interactive path creates one bus per process and passes it to main session (`src/main.ts:2278-2279, 2400`) | `src/sdk.ts:1632`, `src/task/structured-subagent.ts:653` | fetch date 2026-10-06 | confidence: primary
- Child/subagent sessions share the same EventBus — factories are rebound but module-level variables remain shared across sessions | `omp://extensions.md` § "Runtime model": "child sessions reuse imported factories but bind fresh APIs and extension registrations; module-level variables remain shared across those sessions" | fetch date 2026-10-06 | confidence: primary
- `bindPreparedExtensions` creates one `ExtensionRuntime` and one `EventBus` per `loadExtensions` call; child sessions rebind to fresh `ExtensionAPI` instances but share the same prepared module graph | `loader.ts:491-520` | fetch date 2026-10-06 | confidence: primary

### Timer isolation

- `ctx.setInterval`/`ctx.setTimeout`/`clearTimer` are managed timers — callbacks run with same isolation as handler dispatch; sync throw or rejected promise is logged and reported through extension error channel, session keeps running | `runner.ts:549-558`, `types.ts:549-557` | fetch date 2026-10-06 | confidence: primary
- Raw `setInterval`/`setTimeout`/detached-promise callback that throws runs outside handler-dispatch try/catch → process-level `uncaughtException` → whole session torn down | `omp://extensions.md` § "Background work" | fetch date 2026-10-06 | confidence: primary
- Managed timers are `unref`'d (never keep process alive) and cleared automatically on `session_shutdown` | `runner.ts:553-554`, `types.ts:546-547` | fetch date 2026-10-06 | confidence: primary

### Ephemeral turns (runEphemeralTurn)

- `ctx.runEphemeralTurn(options)` runs same side-turn pipeline as `/btw`; question and response NOT appended to session history; can run while main turn active | `types.ts:537`, `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- Options: `promptText`, `tools` (false to omit tool definitions), `maxTokens`, `maxContextBytes`, `onTextDelta`, `signal` | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- `maxTokens` and `maxContextBytes` must be positive safe integers; both caps checked before inference | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- Tool calls always discarded rather than executed; `tools: false` removes tool definitions and sets `toolChoice: "none"` | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- Recursion guard: only `context`, `before_provider_request`, `after_provider_response` hooks reached within a running side turn reject nested `runEphemeralTurn` | `runner.ts:1390-1392`, `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- `dedupeReply` defaults to `true`: collapses runs of >3 identical lines, caps reply at 4 KiB | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- `conversationKey` keeps related side turns on one provider lineage; rotate after cancellation/failure | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary
- Side turn rejects with retryable error if session or exact model instance changes before dispatch | `omp://extensions.md` § "Ephemeral side turns" | fetch date 2026-10-06 | confidence: primary

### Agent identity (ctx.agent)

- `ctx.agent` = `{kind: "main"|"sub", id, name, depth, parentId?}` | `types.ts:466-483` | fetch date 2026-10-06 | confidence: primary
- `kind` (not `depth`) distinguishes subagents: `/tan` clones are subagents at depth 0 | `types.ts:468-470` | fetch date 2026-10-06 | confidence: primary
- `name` is lowercased agent definition name (e.g. `"main"`, `"task"`, `"explore"`, `"sub"` for undefined) | `types.ts:475-478` | fetch date 2026-10-06 | confidence: primary
- `depth` counts `task` nesting only; 0 for top-level and non-task subagents | `types.ts:479-480` | fetch date 2026-10-06 | confidence: primary
- Advisor's tool calls reach session's handlers with `{kind: "sub", id: "advisor", name: "advisor", depth: 0, parentId}` | `types.ts:463-464` | fetch date 2026-10-06 | confidence: primary
- A tool CAN know it is a subagent via `ctx.agent.kind === "sub"` | `types.ts:471` | fetch date 2026-10-06 | confidence: primary
- A tool CANNOT reach sibling sessions via `ctx` alone — no sibling session accessor on ctx. BUT `pi.pi.AgentRegistry.global()` IS exported from package root (`src/sdk.ts:898`, re-exported via `src/index.ts:40`) and `AgentRef.session` is the live `AgentSession` with public `sendCustomMessage`/`steer`/`followUp`/`sendUserMessage`/`deliverIrcMessage`/`drainPendingIrcInboxMessages` (`src/session/agent-session.ts:7829,7852,8324,8518,10380-10420`). So a plugin CAN enumerate every agent in the process and push a custom message into a sibling's context. `IrcBus` itself is NOT exported | `src/sdk.ts:898`, `src/session/agent-session.ts:7829,7852,8324,8518,10380-10420` | fetch date 2026-10-06 | confidence: primary

### State durability

- `appendEntry(customType, data?)` appends `custom` entry to session JSONL; `buildSessionContext` does NOT turn them into model messages, but subsystem replay code can consume `customType` values | `omp://session.md` § "Entry Taxonomy" | fetch date 2026-10-06 | confidence: primary
- Extension messages sent through `pi.sendMessage` persist as `custom_message` entries and reconstruct as `custom` role | `omp://session.md` § "Entry Taxonomy" | fetch date 2026-10-06 | confidence: primary
- Cross-session shared store: `AgentRegistry` IS exported from package root and provides live `AgentSession` handles for all agents in the process. A plugin can use `pi.pi.AgentRegistry.global()` to enumerate agents and push messages into sibling contexts via `session.sendCustomMessage()`/`steer()`/`followUp()`. No dedicated shared key-value store or shared directory API exists, but the registry + session handles serve as a de facto cross-session coordination surface | `src/sdk.ts:898`, `src/session/agent-session.ts:7829,7852,8324,8518,10380-10420` | fetch date 2026-10-06 | confidence: primary
- Extension module-level variables persist across rebinds to child sessions (shared module graph) | `omp://extensions.md` § "Runtime model" | fetch date 2026-10-06 | confidence: primary

### Handler context (ctx.*)

- `ctx.ui` — ExtensionUIContext (dialogs, editor, widgets, theming) | `types.ts:487` | fetch date 2026-10-06 | confidence: primary
- `ctx.mode` — `"tui"|"rpc"|"json"|"print"` | `types.ts:489` | fetch date 2026-10-06 | confidence: primary
- `ctx.cwd` — live session directory (not cached) | `runner.ts:743-745` | fetch date 2026-10-06 | confidence: primary
- `ctx.sessionManager` — read-only SessionManager | `types.ts:501` | fetch date 2026-10-06 | confidence: primary
- `ctx.modelRegistry` — ModelRegistry for API key resolution | `types.ts:503` | fetch date 2026-10-06 | confidence: primary
- `ctx.models` — read-only model query facade: `list()`, `current()`, `resolve(spec)`, `family(model)` | `types.ts:509`, `omp://extensions.md` § "Model selection" | fetch date 2026-10-06 | confidence: primary
- `ctx.isIdle()`, `ctx.hasPendingMessages()`, `ctx.abort()`, `ctx.shutdown()` | `types.ts:511-517` | fetch date 2026-10-06 | confidence: primary
- `ctx.compact(instructionsOrOptions?)` — compact session context | `types.ts:495` | fetch date 2026-10-06 | confidence: primary
- `ctx.getSystemPrompt()` — get current effective system prompt | `types.ts:529` | fetch date 2026-10-06 | confidence: primary
- `ctx.isProjectTrusted()` — always `true`; OMP has no per-directory trust gate | `types.ts:527`, `omp://extensions.md` | fetch date 2026-10-06 | confidence: primary
- `ctx.addAdditionalContext?.("...")` — attach trusted instructions to next provider request; present only during tool execution | `types.ts:564` | fetch date 2026-10-06 | confidence: primary
- `ctx.invokeTool?<TDetails>(params, options?)` — run native built-in of same name; delegation is same-tool only; depth-guarded (max 8) | `types.ts:576-579`, `runner.ts:678-708` | fetch date 2026-10-06 | confidence: primary

### Timeout/error isolation

- Most dispatched handlers have 30-second budget (`EXTENSION_HANDLER_TIMEOUT_MS = 30_000`) | `runner.ts:130-131` | fetch date 2026-10-06 | confidence: primary
- `session_shutdown` handlers: 2-second budget, run concurrently | `runner.ts:154`, `runner.ts:1585-1597` | fetch date 2026-10-06 | confidence: primary
- `tool_call` handlers: `extensionHandlers.toolCallTimeoutMs` (default 30,000ms); fail-closed on timeout/error | `runner.ts:1819-1843` | fetch date 2026-10-06 | confidence: primary
- Handler exceptions caught and emitted as extension errors instead of crashing runner loop | `omp://extension-loading.md` § "After loading" | fetch date 2026-10-06 | confidence: primary

### Loading lifecycle

- Extension modules imported concurrently; factories run sequentially in path order | `omp://extensions.md` § "Runtime model" | fetch date 2026-10-06 | confidence: primary
- During load phase, registration methods valid; session action methods throw `ExtensionRuntimeNotInitializedError` | `loader.ts:90-94`, `omp://extensions.md` § "Runtime model" | fetch date 2026-10-06 | confidence: primary
- `ExtensionRunner.initialize(...)` wires live actions/contexts for active mode | `runner.ts:768-932` | fetch date 2026-10-06 | confidence: primary
- Tools discovered later (e.g. in `session_start`) are mounted into live registry; registrations inside dispatched event handler flushed before handler completes | `omp://extensions.md` § "Tool authoring details" | fetch date 2026-10-06 | confidence: primary

### Restricted Children — Extension Tool Limits

- Extension tools cannot load in restricted children; tool admission stays clamped to parent's explicit tool set | `omp://extension-loading.md` § "Restricted children and revival" | fetch date 2026-10-06 | confidence: primary
- Restricted children rebind parent's already-imported extension factories but skip ambient discovery, new extension inputs, and parent-bound instances | `omp://extension-loading.md` § "Restricted children and revival" | fetch date 2026-10-06 | confidence: primary
- Late registration (e.g. in `session_start`) cannot widen the restricted tool set | `omp://extensions.md` § "Tool authoring details": "Restricted children do not admit extension tools, including late registrations." | fetch date 2026-10-06 | confidence: primary
- `restrictToolNames` flag in `CreateAgentSessionOptions` gates the entire restricted-session path | `omp://sdk.md` § "Tools and extension integration" | fetch date 2026-10-06 | confidence: primary
- `allowRestrictedCustomTools` (default false) permits only caller-supplied SDK custom tools in restricted sessions; discovered extensions, MCP, and ambient custom tools remain disabled | `omp://sdk.md` § "Tools and extension integration" | fetch date 2026-10-06 | confidence: primary
- Restricted sessions cannot inherit or discover MCP capabilities | `omp://sdk.md` § "Tools and extension integration": "Restricted sessions disable ambient MCP, extensions, custom commands, and LSP by default." | fetch date 2026-10-06 | confidence: primary
- Extension factories still execute host code when rebound in restricted children; tool restrictions are not an extension sandbox | `omp://extension-loading.md` § "Restricted children and revival" | fetch date 2026-10-06 | confidence: primary

### MCP — Extension Bridge and Push Notifications

- Extensions can subscribe to `mcp_notification` events for every JSON-RPC notification from connected MCP servers | `types.ts:1449`, `omp://extensions.md` § "MCP notifications" | fetch date 2026-10-06 | confidence: primary
- `mcp_notification` fires AFTER manager's own handling of known list/update methods; unknown/custom methods also delivered | `omp://extensions.md` § "MCP notifications" | fetch date 2026-10-06 | confidence: primary
- Multiple extensions may subscribe; a handler that throws does not prevent other handlers from firing | `omp://extensions.md` § "MCP notifications" | fetch date 2026-10-06 | confidence: primary
- Notifications received before any listener attaches are buffered (bounded FIFO, cap 100, drop-oldest) and drained into first subscriber | `runner.ts:535-544`, `omp://extensions.md` § "MCP notifications" | fetch date 2026-10-06 | confidence: primary
- `emitMcpNotification` buffers events before `initialize()` runs, then drains them once runtime context is wired | `runner.ts:974-982` | fetch date 2026-10-06 | confidence: primary
- Extensions can bridge MCP push notifications into a session steer via `pi.sendUserMessage(..., {deliverAs: "steer", attribution: "agent"})` | `omp://extensions.md` § "MCP notifications" (documented peer-bus steer example) | fetch date 2026-10-06 | confidence: primary
- MCP transports: stdio (subprocess), http (Streamable HTTP), sse (legacy HTTP+SSE); timeout default 30,000ms; `OMP_MCP_TIMEOUT_MS` env override | `omp://mcp-protocol-transports.md` | fetch date 2026-10-06 | confidence: primary
- MCP tool names: `mcp__<sanitized_server>_<sanitized_tool>`; collision domain deduplicated by lexicographic origin key | `omp://mcp-server-tool-authoring.md` § "Naming and collision domain" | fetch date 2026-10-06 | confidence: primary

## Plugin-surface limits (explicit enumeration)

1. **No dedicated cross-session shared store** — no shared key-value store or shared directory API; BUT `AgentRegistry` is exported and provides live `AgentSession` handles, serving as a de facto cross-session coordination surface
2. **No sibling session accessor on `ctx`** — `ctx` provides no direct accessor to sibling/parent sessions; BUT `pi.pi.AgentRegistry.global()` exposes all agents and their live sessions
3. **No sandbox** — extensions run in same process with full host module graph access
4. **Restricted children clamp tool set** — extension tools cannot widen restricted tool set, even via late registration
5. **No MCP server mode** — extensions cannot act as MCP servers; they can only bridge MCP notifications into session messages
6. **Handler timeout budget** — 30s default, 2s for session_shutdown, 30s for tool_call; fail-closed on timeout
7. **No delivery confirmation** — `sendMessage` returns void; no ack, no read receipt
8. **File write/delete fallback registration must happen during load** — first registration after `initialize` never takes effect
9. **No per-directory trust gate** — `isProjectTrusted()` always returns `true`
10. **Ephemeral turn recursion guard** — nested `runEphemeralTurn` from within side-turn hooks is rejected
11. **Ephemeral turn tool rejection** — tool calls always discarded; `tools: false` required to omit tool definitions
12. **No cross-process EventBus** — EventBus is in-process only; no IPC, no network transport

## Searches
- Read: `src/extensibility/extensions/types.ts`, `src/extensibility/extensions/runner.ts`, `src/extensibility/extensions/loader.ts`, `src/extensibility/extensions/wrapper.ts`
- Read docs: `omp://extensions.md`, `omp://extension-loading.md`, `omp://mcp-server-tool-authoring.md`, `omp://mcp-protocol-transports.md`, `omp://sdk.md`, `omp://settings.md`, `omp://session.md`

## Conflicting evidence
- None found

## Gaps
- Did not read `src/extensibility/extensions/managed-timers.ts` directly (worker referenced it)
- Did not read `src/extensibility/shared-events.ts` directly
- Did not read `src/extensibility/event-bus.ts` directly
- Did not verify `sdk.ts` restricted-session code paths directly (relied on worker + doc claims)
