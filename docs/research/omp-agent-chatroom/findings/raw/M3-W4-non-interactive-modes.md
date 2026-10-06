# M3-W4: Non-Interactive Modes — Extension API Degradation

## Angle

How extension APIs behave across TUI, RPC, JSON, print, and ACP modes — which registration APIs no-op or throw, what must degrade gracefully, and how plugins detect the current mode.

## Claims

### Mode type and values

- `ExtensionMode = "tui" | "rpc" | "json" | "print"` — ACP uses `"rpc"` — source: `src/extensibility/extensions/types.ts:458` — confidence: primary
- ACP passes `mode: "rpc"` to `extensionRunner.initialize()` — source: `src/modes/acp/acp-agent.ts:2642` — confidence: primary
- Print mode passes `mode: "print"` or `mode: "json"` — source: `src/modes/print-mode.ts:162` — confidence: primary
- RPC mode passes `mode: "rpc"` — source: `src/modes/rpc/rpc-mode.ts:1493` — confidence: primary
- TUI mode passes `mode: "tui"` — source: `src/modes/controllers/extension-ui-controller.ts:314` — confidence: primary

### Mode initialization callsites

- TUI: `extensionRunner.initialize(actions, contextActions, commandActions, uiContext, "tui")` — source: `src/modes/controllers/extension-ui-controller.ts:314` — confidence: primary
- RPC: `initializeExtensions(session, { mode: "rpc", ... })` — source: `src/modes/rpc/rpc-mode.ts:1492-1531` — confidence: primary
- Print/JSON: `initializeExtensions(session, { mode: mode === "json" ? "json" : "print", ... })` — source: `src/modes/print-mode.ts:161-162` — confidence: primary
- ACP: `extensionRunner.initialize(..., uiContext, "rpc")` — source: `src/modes/acp/acp-agent.ts:2641-2642` — confidence: primary

### Registration APIs — never throw, never no-op by mode

- `registerTool(tool)` writes to `extension.tools` map — no mode guard — source: `src/extensibility/extensions/loader.ts:216-224` — confidence: primary
- `registerCommand(name, options)` writes to `extension.commands` map — no mode guard — source: `src/extensibility/extensions/loader.ts:234-243` — confidence: primary
- `registerShortcut(shortcut, options)` writes to `extension.shortcuts` map — no mode guard — source: `src/extensibility/extensions/loader.ts:249-257` — confidence: primary
- All registration methods work identically in ALL modes — they write to in-memory maps on the Extension object — source: `src/extensibility/extensions/loader.ts:216-257` — confidence: primary

### UI context by mode

- TUI: full `ExtensionUIContext` from `extension-ui-controller.ts` — dialogs, editor, widgets, theme — source: `src/modes/controllers/extension-ui-controller.ts:314` — confidence: primary
- RPC: `RpcExtensionUIContext` — dialogs round-trip via RPC; `onTerminalInput`, `setWorkingMessage`, `setFooter`, `setHeader`, `setEditorComponent`, `addAutocompleteProvider` are no-op; `setTitle` gated on `PI_RPC_EMIT_TITLE` — source: `src/modes/rpc/rpc-mode.ts:1292-1411` — confidence: primary
- Print/JSON: `noOpUIContext` — all methods return defaults (`select`→undefined, `confirm`→false, `input`→undefined, `notify`→void, etc.) — source: `src/extensibility/extensions/runner.ts:453-480` — confidence: primary
- ACP: `createAcpExtensionUiContext` — `select`/`confirm`/`input`/`editor`/`askDialog` round-trip as ACP form elicitations; non-elicitation surface inert — source: `src/modes/acp/acp-agent.ts:425-590` — confidence: primary

### hasUI detection

- `runner.hasUI()` returns `this.#uiContext !== noOpUIContext` — source: `src/extensibility/extensions/runner.ts:1032-1034` — confidence: primary
- `ctx.hasUI` set to `this.hasUI()` in `createContext()` — source: `src/extensibility/extensions/runner.ts:1373` — confidence: primary
- Print/JSON: `hasUI = false` (noOpUIContext) — source: `src/extensibility/extensions/runner.ts:724,824` — confidence: primary
- RPC headless (`--no-ui`): `hasUI = false` (uiContext undefined → noOpUIContext) — source: `src/modes/rpc/rpc-mode.ts:1530` — confidence: primary
- RPC with UI: `hasUI = true` (rpcUiContext) — source: `src/modes/rpc/rpc-mode.ts:1487,1530` — confidence: primary
- ACP: `hasUI = true` (ACP elicitation UI context) — source: `src/modes/acp/acp-agent.ts:2538,2641` — confidence: primary

### ExtensionRuntimeNotInitializedError

- Thrown by `ExtensionRuntime` action methods when `initialize()` hasn't run yet — source: `src/extensibility/extensions/loader.ts:90-172` — confidence: primary
- Affects: `sendMessage`, `sendUserMessage`, `appendEntry`, `setLabel`, `getActiveTools`, `getAllTools`, `setActiveTools`, `getCommands`, `setModel`, `getThinkingLevel`, `setThinkingLevel`, `getServiceTiers`, `setServiceTier`, `getSessionName`, `setSessionName` — source: `src/extensibility/extensions/loader.ts:113-171` — confidence: primary
- Does NOT affect registration methods (`registerTool`, `registerCommand`, `registerShortcut`) — source: `src/extensibility/extensions/loader.ts:216-257` — confidence: primary
- Only relevant during extension load phase; after `initialize()` all action methods are wired — source: `src/extensibility/extensions/runner.ts:774-826` — confidence: primary

### Command dispatch — works in ALL modes

- `#tryExecuteExtensionCommand(text)` in agent-session dispatches extension commands via `session.prompt()` — source: `src/session/agent-session.ts:7669-7697` — confidence: primary
- No mode guard — commands dispatched in TUI, RPC, print, JSON, ACP alike — source: `src/session/agent-session.ts:6924-6927` — confidence: primary
- `getCommands` action wired in all modes via `getSessionSlashCommands(session)` — source: `src/modes/runtime-init.ts:129` — confidence: primary

### Shortcut dispatch — TUI only

- `registerExtensionShortcuts()` called only from `input-controller.ts:663` — TUI only — source: `src/modes/controllers/input-controller.ts:663` — confidence: primary
- In RPC/print/JSON/ACP: shortcuts registered but never dispatched (no input controller) — source: `src/modes/controllers/input-controller.ts:2836-2858` — confidence: primary
- Shortcuts silently no-op in non-TUI modes — no error, no queue — source: `src/modes/controllers/input-controller.ts:663` — confidence: primary

### Tool registration and execution — works in ALL modes

- `getAllRegisteredTools()` returns tools from all extensions — source: `src/extensibility/extensions/runner.ts:1082-1090` — confidence: primary
- Tools mounted into tool registry via `sdk.ts:3281` — no mode guard — source: `src/sdk.ts:3281-3301` — confidence: primary
- Tool execution via `ExtensionToolWrapper` — no mode guard — source: `src/sdk.ts:4675-4703` — confidence: primary

### Mode detection by plugins

- `ctx.mode` value: `"tui"`, `"rpc"`, `"json"`, or `"print"` — source: `src/extensibility/extensions/types.ts:489` — confidence: primary
- `ctx.hasUI` boolean — source: `src/extensibility/extensions/types.ts:497` — confidence: primary
- `ctx.agent.kind` (`"main"` | `"sub"`) — source: `src/extensibility/extensions/types.ts:471` — confidence: primary

## Mode-by-Mode Degradation Table

| API | TUI | RPC (with UI) | RPC (headless) | Print/JSON | ACP |
|-----|-----|---------------|----------------|------------|-----|
| `registerTool` | ✅ works | ✅ works | ✅ works | ✅ works | ✅ works |
| `registerCommand` | ✅ works | ✅ works | ✅ works | ✅ works | ✅ works |
| `registerShortcut` | ✅ registered + dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched |
| `ctx.ui.select` | ✅ interactive | ✅ RPC round-trip | → undefined (no-op) | → undefined (no-op) | ✅ ACP elicitation |
| `ctx.ui.confirm` | ✅ interactive | ✅ RPC round-trip | → false (no-op) | → false (no-op) | ✅ ACP elicitation |
| `ctx.ui.input` | ✅ interactive | ✅ RPC round-trip | → undefined (no-op) | → undefined (no-op) | ✅ ACP elicitation |
| `ctx.ui.notify` | ✅ interactive | ✅ RPC fire-forget | → void (no-op) | → void (no-op) | → debug log |
| `ctx.ui.setWidget` | ✅ interactive | ✅ RPC (string arrays only) | → void (no-op) | → void (no-op) | → inert |
| `ctx.ui.setEditorText` | ✅ interactive | ✅ RPC | → void (no-op) | → void (no-op) | → inert |
| `ctx.ui.setWorkingMessage` | ✅ interactive | → void (no-op) | → void (no-op) | → void (no-op) | → inert |
| `ctx.ui.setFooter` | → void (no-op) | → void (no-op) | → void (no-op) | → void (no-op) | → inert |
| `ctx.ui.setHeader` | → void (no-op) | → void (no-op) | → void (no-op) | → void (no-op) | → inert |
| `ctx.ui.setTheme` | ✅ interactive | → failure | → failure | → failure | → inert |
| `ctx.hasUI` | `true` | `true` | `false` | `false` | `true` |
| `ctx.mode` | `"tui"` | `"rpc"` | `"rpc"` | `"print"`/`"json"` | `"rpc"` |
| `sendMessage` | ✅ works | ✅ works | ✅ works | ✅ works | ✅ works |
| `setModel` | ✅ works | ✅ works | ✅ works | ✅ works | ✅ works |
| Command dispatch | ✅ via prompt | ✅ via prompt | ✅ via prompt | ✅ via prompt | ✅ via prompt |
| Tool execution | ✅ works | ✅ works | ✅ works | ✅ works | ✅ works |

## Conflicting evidence

None. All claims trace to source.

## Gaps

- No explicit "mode guard" check in registration APIs — they unconditionally write to maps. The degradation is in dispatch (shortcuts) and UI context (no-op defaults), not in registration.
- `ctx.mode` is not documented as having an `"acp"` value — ACP reuses `"rpc"`. Plugins cannot distinguish ACP from RPC via `ctx.mode` alone.
- Shortcut dispatch in non-TUI modes is silently dropped — no error, no log, no queue. Plugins registering shortcuts that are critical to functionality will silently fail in headless modes.
