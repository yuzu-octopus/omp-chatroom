# F17 Keybindings & Commands

## Angle
Can an extension bind ctrl+s? Can a plugin add a keybinding action? Full keypress→handler path. `registerCommand` slash commands. Non-interactive mode degradation. Every claim: source path:lines or URL (fetch 2026-10-06) — confidence: primary|secondary|speculative.

## Claims

### 1. ctrl+s precedence — built-in wins (footnote)

**Extension CANNOT bind ctrl+s.** Built-in `app.session.observe` (default `ctrl+s`) overwrites extension shortcuts at registration time. Empirically verified by executing installed source.

- `ctrl+s` is NOT in the reserved denylist — `src/extensibility/extensions/runner.ts:1211-1229` — primary
  Denylist = `ctrl+c/d/z/k/p/l/o/t/g`, `ctrl+q`, `alt+m`, `shift+tab`, `shift+ctrl+p`, `alt+enter`, `escape`, `enter`.
- `app.session.observe` default chord is `ctrl+s` — `pi-tui/src/app-keybindings.ts:200-203` — primary
- `app.session.toggleSort` also defaults to `ctrl+s` but is a **dead action** (no consumer anywhere in codebase) — `pi-tui/src/app-keybindings.ts:208-211` — primary

**Dispatch order (fixed, unconditional), `src/modes/controllers/input-controller.ts`:**

| # | Line | Statement | Effect |
|---|---|---|---|
| 1 | 661 | `editor.clearCustomKeyHandlers()` | wipes ALL custom handlers (incl. extension ones from a prior wiring) |
| 2 | 663 | `registerExtensionShortcuts()` | writes extension `ctrl+s` → extension handler |
| 3 | 664-695 | `setCustomKeyHandler` for plan/session/followUp/stt/live/copyLine | unrelated keys |
| 4 | 696-702 | `hubKeys = getKeys("app.agents.hub") ∪ getKeys("app.session.observe")`; loop `setCustomKeyHandler(key, () => showAgentHub())` | writes `ctrl+s` → **built-in hub handler**, overwriting step 2 |

- `setCustomKeyHandler` is a plain `Map.set` — `pi-tui/src/prompt/custom-editor.ts:1392-1395` — primary
  Last writer wins. No layering, no priority, no chain.
- `clearCustomKeyHandlers()` clears the same map extensions use — `pi-tui/src/prompt/custom-editor.ts:1408-1411` — primary
- **Empirically verified** (real `CustomEditor`, real `KeybindingsManager`, ctrl+s = `\x13`):
  - register order `EXT` then `BUILTIN_HUB` → `["BUILTIN_HUB"]`
  - register order `BUILTIN_HUB` then `EXT` → `["EXTENSION"]`
  - confidence: primary (direct execution of installed source)
- **Consequence:** the extension handler for `ctrl+s` is dead code. No warning emitted — it silently loses.

**Only way extension's `ctrl+s` fires:** user removes `ctrl+s` from both built-ins in `~/.omp/agent/keybindings.yml`. Verified by simulation:

| `keybindings.yml` | `hubKeys` at line 696 | ctrl+s dispatches to |
|---|---|---|
| (default) | `["alt+a","ctrl+s"]` | `BUILTIN_HUB` |
| `app.session.observe: []` | `["alt+a"]` | `EXTENSION` |
| `app.session.observe: []` + `app.agents.hub: []` | `[]` | `EXTENSION` |
| `app.session.observe: ctrl+j` | `["alt+a","ctrl+j"]` | `EXTENSION` |

— confidence: primary (executed simulation against installed source)

**Denylist bypass holes (raw-string check, not canonical):**

`getShortcuts()` compares `key.toLowerCase()` against a raw-string denylist; `setCustomKeyHandler` matches on `canonicalKeyId(key)` — `runner.ts:1235-1243` vs `custom-editor.ts:1368-1376` + `keybindings.ts:190-220` — primary. Verified by execution:

| `registerShortcut(...)` | denylist pass? | canonical |
|---|---|---|
| `escape` | blocked | `escape` |
| `esc` | **passes** | `escape` |
| `enter` | blocked | `enter` |
| `return` | **passes** | `enter` |
| `shift+ctrl+p` | blocked | `ctrl+shift+p` |
| `ctrl+shift+p` | **passes** | `ctrl+shift+p` |

Verified end-to-end: `registerShortcut("return")` + Enter → extension handler fires, editor **submit never runs** — primary.
### 2. Full keypress → handler path (interactive mode)

**Complete call chain:**

```
process.stdin "data"
  └─ ProcessTerminal #setupStdinBuffer handler          pi-tui:src/terminal.ts:1224,1259
      └─ StdinBuffer.process(data)                      pi-tui:src/stdin-buffer.ts:445
          (assembles fragmented CSI/OSC/DCS/APC/SS3 + bracketed paste; emits "paste")
          └─ TUI.#handleInput(data)                     pi-tui:src/tui.ts:2680
              ├─ TSP_PREFIX / CPR-reply filtering       tui.ts:2683-2727
              ├─ inputListeners (may consume/transform) tui.ts:2734-2749
              ├─ cell-size response consume             tui.ts:2752
              ├─ global debug key shift+ctrl+d          tui.ts:2757-2760
              └─ focusedComponent.handleInput(data)     tui.ts:2781-2789
                  └─ CustomEditor.handleInput(data)     pi-tui:src/prompt/custom-editor.ts:1441
                      ├─ 1444  queue behind in-flight async paste
                      ├─ 1451  kitty caps-lock (modifier bit 64)
                      ├─ 1470  bracketed-paste assembly / image paste / image path
                      ├─ 1504  parseKey(data) + canonicalKeyId(...)
                      ├─ 1510  left-arrow-at-start (agent-hub double-tap)
                      ├─ 1516  spaceHold push-to-talk
                      ├─ 1526  union probe: (#actionMatchKeyUnion ∪ #customMatchKeys).has(canonical)
                      ├─ 1532-1667  per-action interception chain, IN THIS ORDER:
                      │         pasteImage, pasteTextRaw, selectTemporary, displayReset,
                      │         suspend, model.select, cycleBackward, cycleForward,
                      │         thinking.cycle, interrupt, clear, exit, dequeue,
                      │         copyPrompt, retry
                      ├─ 1669-1674  #customMatchKeys.get(canonical) → handler()   ← EXTENSION SHORTCUTS
                      └─ 1678  #forwardInput → Editor.handleInput (base text pipeline)
                                                pi-tui:src/components/editor.ts:1755
```

— source: `pi-tui/src/prompt/custom-editor.ts:1441-1678`, `pi-tui/src/tui.ts:2680-2789` — primary

**Key dispatch facts:**

- `#customMatchKeys` is a `Map<string, () => void>` built from `#customKeyHandlers` — `custom-editor.ts:1334-1335,1368-1376` — primary
- First registered handler for colliding aliases wins (iteration order) — `custom-editor.ts:1372-1373` — primary
- `app.retry` is the ONLY action that checks custom handlers BEFORE its own callback — `custom-editor.ts:1659-1667` — primary
- All other app actions use `#matchesAction()` (keybinding system), NOT custom handlers — `custom-editor.ts:1532-1655` — primary
- `app.session.observe` is NOT in the explicit action list — it's registered as a custom key handler via `setCustomKeyHandler` — `input-controller.ts:701` — primary
- Custom handler lookup map is rebuilt on every mutation; **first registered wins per alias** — `custom-editor.ts:1368-1376` — primary
- Verified: `setCustomKeyHandler("esc", A)` then `("escape", B)` → `A` fires for `\x1b` — primary

**Extension shortcuts sit AFTER all built-in app actions in dispatch order.** They are checked last in `handleInput` (line 1669), after all app actions (lines 1532-1667).

**When extension shortcuts are unreachable:**

| Situation | Effect | Source |
|---|---|---|
| Overlay focused (Agent Hub, selectors, dialogs) | `TUI.#handleInput` routes to overlay's `handleInput`, not the editor; extension shortcuts dead until focus returns | `pi-tui:src/tui.ts:2781-2789`; hub own keys `pi-tui:src/overlays/agent-hub.ts:566-585` — primary |
| Editor mounted as draft beneath another surface (Ask dialog over non-empty prompt) | input goes through `CustomEditor.handleDraftEdit` which only honours `app.clear` then forwards — **all extension shortcuts and the whole action chain are skipped** | `pi-tui:src/prompt/custom-editor.ts:1702-1717`; caller `src/modes/controllers/extension-ui-controller.ts:651-658` — primary |
| Focused subagent view | editor stays focused, handlers still installed and fire; no per-mode gating found. Some *actions* self-guard but shortcuts do not | `src/modes/controllers/input-controller.ts:2677-2689` — primary |
| Plan mode | no gating found on the editor or the shortcut map; plan mode only claims `app.plan.toggle` via a custom handler | `input-controller.ts:664-667` — primary (absence of evidence) |
| Non-interactive modes (print/json/rpc/acp/subagent) | `registerExtensionShortcuts()` is never called — the only call sites are `input-controller.ts:663` and passthrough `interactive-mode.ts:8157` | `src/modes/interactive-mode.ts:8156-8158` — primary |
| Editor replaced via `ctx.ui.setEditorComponent` | `setupKeyHandlers()` re-runs (line 7025), so extension shortcuts are re-registered on the new editor | `src/modes/interactive-mode.ts:7025` — primary |
| Extension suspended at runtime (`disabledExtensions` edit) | handler still bound but returns early via `runner.isExtensionActive(shortcut.extensionPath)` | `input-controller.ts:2843-2844` — primary |

**Re-registration:** `setupKeyHandlers()` is called exactly twice — `interactive-mode.ts:2175` (init) and `7025` (after `setEditorComponent`). No extension-load path re-invokes it, so a plugin installed/loaded after init has no shortcut wiring until the editor is rebuilt — primary.
### 3. Can plugins add keybinding actions? — NO

**No plugin API exists to register a named keybinding action.** The action registry is compile-time TypeScript declaration merging only.

- `Keybindings` interface defines action IDs — `pi-tui/src/keybindings.ts:7-43` — primary
- `AppKeybindings` extends via `declare module "./keybindings"` — `pi-tui/src/app-keybindings.ts:26-72` — primary
- `TUI_KEYBINDINGS` + `KEYBINDINGS` consts provide definitions — `pi-tui/src/keybindings.ts:58-142`, `app-keybindings.ts:86-248` — primary
- `KeybindingsManager` class manages runtime lookup — `pi-tui/src/keybindings.ts:247-338` — primary
- No `registerKeybinding`/`addKeybinding`/`defineKeybinding` export in `pi-tui/src/index.ts` — primary
- No `registerKeybindingAction` in `pi-coding-agent/src/extensibility/` — primary
- `omp://keybindings.md`: "This is not an inventory of extension-registered shortcuts." — primary
- `KeybindingsManager.#rebuild()` silently drops user bindings whose id is not in `#definitions` — `pi-tui/src/keybindings.ts:266-273` — primary

**Unsupported escape hatch (works but is not an API):** `getKeybindings()`/`setKeybindings()` are exported from `pi-tui:src/keybindings.ts:342-351` and re-exported via `pi-tui:src/index.ts:48`. The global manager is a process singleton, so `getKeybindings().setUserBindings({ "app.session.observe": [] })` mutates the live session's manager — verified: same instance, `getKeys` flips to `[]` — primary.
Caveat: already-installed editor handlers are **snapshots**. `hubKeys` is read once at `input-controller.ts:696-699`, and `#actionMatchKeys` is a snapshot set by `setActionKeys` — `pi-tui:src/prompt/custom-editor.ts:1362-1366`. A late `setUserBindings` does NOT rewire them, so the old chord keeps firing. — primary (code path) + speculative (end-to-end plugin effect).

**Fallback:** raw `registerShortcut(shortcut: KeyId, {description?, handler})` on a non-reserved key — `src/extensibility/extensions/types.ts:1530-1536` — primary

**RISK:** `registerShortcut` bypasses keybinding action system — no user remapping, no conflict detection, no `/hotkeys` integration — primary

### 4. registerCommand — slash commands (first-class)

**Verbatim signature:**

```ts
registerCommand(
    name: string,
    options: {
        description?: string;
        getArgumentCompletions?: RegisteredCommand["getArgumentCompletions"];
        handler: RegisteredCommand["handler"];
    },
): void;
```

— source: `src/extensibility/extensions/types.ts:1519-1527` — primary

**RegisteredCommand interface:**

```ts
export interface RegisteredCommand {
    name: string;
    description?: string;
    getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}
```

— source: `src/extensibility/extensions/types.ts:1331-1336` — primary

**ExtensionCommandContext:**

```ts
export interface ExtensionCommandContext extends ExtensionContext {
    getContextUsage(): ContextUsage | undefined;
    waitForIdle(): Promise<void>;
    newSession(options?: {...}): Promise<{ cancelled: boolean }>;
    branch(entryId: string): Promise<{ cancelled: boolean }>;
    navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<{ cancelled: boolean }>;
    switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
    reload(): Promise<void>;
    compact(instructionsOrOptions?: string | CompactOptions): Promise<void>;
}
```

— source: `src/extensibility/extensions/types.ts:605-632` — primary

**Registration → storage:** `extension.commands.set(name, { name, ...options })` — `src/extensibility/extensions/loader.ts:234-243` — primary

**Discovery:** `getRegisteredCommands(reserved?)` iterates all extensions, skips reserved names — `src/extensibility/extensions/runner.ts:1294-1313` — primary

**Autocomplete:** `#buildPendingSlashCommands()` in `interactive-mode.ts:2531-2579` — extension commands get `iconName: "extension"`, `getArgumentCompletions` passed through — primary

**Execution:** `#tryExecuteExtensionCommand(text)` in `agent-session.ts:7669-7696`:

```ts
async #tryExecuteExtensionCommand(text: string, onRouted?: () => void): Promise<boolean> {
    if (!this.#extensionRunner) return false;
    const spaceIndex = text.indexOf(" ");
    const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
    const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
    const command = this.#extensionRunner.getCommand(commandName);
    if (!command) return false;
    onRouted?.();
    const ctx = this.#extensionRunner.createCommandContext();
    try {
        await this.#extensionRunner.runScoped(() => command.handler(args, ctx));
        return true;
    } catch (err) {
        this.#extensionRunner.emitError({...});
        return true;
    }
}
```

— source: `src/session/agent-session.ts:7669-7696` — primary

**Args are raw string** — `text.slice(spaceIndex + 1)`, NOT parsed. Handler receives raw remainder after command name. — primary

**Execution order in `#dispatchPrompt`:** extension commands → custom commands → file-based slash commands → prompt template expansion — `agent-session.ts:6922-6944` — primary

**`getCommand(name)`:** iterates extensions in reverse (last registered wins) — `runner.ts:1319-1327` — primary

**Extension commands are local:** they never reach the agent and do not name the session — `src/modes/controllers/input-controller.ts:1413-1421` (`#isLocalExtensionCommand`) — primary

**Queuing an extension command while streaming throws:** `Extension command "/x" cannot be queued.` — `src/session/agent-session.ts:8191-8203` — primary

**Verbatim example from source:**

```ts
api.registerCommand("autoresearch", {
    description: "Toggle builtin autoresearch mode, or pass off / clear, or a goal message.",
    getArgumentCompletions(argumentPrefix: string): AutocompleteItem[] | null {
        if (argumentPrefix.includes(" ")) return null;
        const normalized = argumentPrefix.trim().toLowerCase();
        if (normalized.length === 0) return null;
        const completions: AutocompleteItem[] = [
            { label: "off", value: "off", description: "Leave autoresearch mode" },
            { label: "clear", value: "clear", description: "Reset worktree to baseline and close the active session" },
        ];
        const filtered = completions.filter(item => item.label.startsWith(normalized));
        return filtered.length > 0 ? filtered : null;
    },
    async handler(args, ctx): Promise<void> {
        const trimmed = args.trim();
        const runtime = getRuntime(ctx);
        if (trimmed === "" && runtime.autoresearchMode) {
            setMode(ctx, false, runtime.goal, "off");
            return;
        }
        if (trimmed === "off") {
            return;
        }
    },
});
```

— source: `src/autoresearch/index.ts:125-163` — primary

**Recommended command name + arg shape for opening chatroom panel:**

- `/room` — no args, opens panel overlay
- `/room board` — opens to claim board view
- `/room join` — joins room and shows digest
- `/room leave` — leaves room

Handler receives args as raw string after command name. Parse with `args.trim()` and switch on value.

### 5. Non-interactive modes — degradation table

**Mode type:** `ExtensionMode = "tui" | "rpc" | "json" | "print"` — ACP uses `"rpc"` — `src/extensibility/extensions/types.ts:458` — primary

**Registration APIs never throw, never no-op by mode:**

- `registerTool` → `extension.tools` map — no mode guard — `loader.ts:216-224` — primary
- `registerCommand` → `extension.commands` map — no mode guard — `loader.ts:234-243` — primary
- `registerShortcut` → `extension.shortcuts` map — no mode guard — `loader.ts:249-257` — primary

**UI context by mode:**

- TUI: full `ExtensionUIContext` — `extension-ui-controller.ts:314` — primary
- RPC: `RpcExtensionUIContext` — dialogs round-trip; `onTerminalInput`/`setWorkingMessage`/`setFooter`/`setHeader`/`setEditorComponent`/`addAutocompleteProvider` no-op — `rpc-mode.ts:1292-1411` — primary
- Print/JSON: `noOpUIContext` — all methods return defaults — `runner.ts:453-480` — primary
- ACP: `createAcpExtensionUiContext` — `select`/`confirm`/`input`/`editor`/`askDialog` round-trip as ACP form elicitations — `acp-agent.ts:425-590` — primary

**`hasUI` detection:** `runner.hasUI()` returns `uiContext !== noOpUIContext` — `runner.ts:1032-1034` — primary

**Shortcut dispatch — TUI only:**

- `registerExtensionShortcuts()` called only from `input-controller.ts:663` — TUI only — primary
- In RPC/print/JSON/ACP: shortcuts registered but never dispatched (no input controller) — primary
- Shortcuts silently no-op in non-TUI modes — no error, no queue — primary

**Command dispatch — works in ALL modes:**

- `#tryExecuteExtensionCommand` dispatches via `session.prompt()` — no mode guard — `agent-session.ts:7669-7697` — primary

**Tool execution — works in ALL modes:**

- `getAllRegisteredTools()` returns tools from all extensions — no mode guard — `runner.ts:1082-1090` — primary

**Mode-by-mode degradation table:**

| API | TUI | RPC (with UI) | RPC (headless) | Print/JSON | ACP |
|-----|-----|---------------|----------------|------------|-----|
| `registerTool` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `registerCommand` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `registerShortcut` | ✅ dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched | ✅ registered, never dispatched |
| `ctx.ui.select` | ✅ | ✅ RPC round-trip | → undefined | → undefined | ✅ ACP elicitation |
| `ctx.ui.confirm` | ✅ | ✅ RPC round-trip | → false | → false | ✅ ACP elicitation |
| `ctx.ui.input` | ✅ | ✅ RPC round-trip | → undefined | → undefined | ✅ ACP elicitation |
| `ctx.ui.notify` | ✅ | ✅ RPC fire-forget | → void | → void | → debug log |
| `ctx.hasUI` | `true` | `true` | `false` | `false` | `true` |
| `ctx.mode` | `"tui"` | `"rpc"` | `"rpc"` | `"print"`/`"json"` | `"rpc"` |
| Command dispatch | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tool execution | ✅ | ✅ | ✅ | ✅ | ✅ |

**Required graceful degradation:**

- Plugins must check `ctx.hasUI` before calling `ctx.ui.*` methods — primary
- Plugins must not assume shortcuts work in non-TUI modes — use `registerCommand` for mode-independent actions — primary
- `ctx.mode` cannot distinguish ACP from RPC (both `"rpc"`) — primary

## Risks

1. **ctrl+s is unbuilt-in-winnable** — extension cannot bind ctrl+s; built-in `app.session.observe` overwrites it. Fallback: use a non-reserved key or require user remap. — primary
2. **No keybinding action API** — plugins cannot add user-remappable actions. Fallback: raw `registerShortcut` on non-reserved key. — primary
3. **Shortcut dispatch silently dropped in non-TUI** — no error, no log. Plugins must not rely on shortcuts for critical functionality in headless modes. — primary
4. **`registerShortcut` bypasses keybinding system** — no user remapping, no conflict detection, no `/hotkeys` integration. — primary
5. **ACP indistinguishable from RPC via `ctx.mode`** — both are `"rpc"`. — primary
6. **Denylist bypass via alias** — `registerShortcut("return")` or `registerShortcut("esc")` passes the raw-string denylist check and can shadow `enter`/`escape`. — primary
7. **Extension shortcuts dead in overlay/draft-edit contexts** — when an overlay (Agent Hub, dialog) is focused or the editor is mounted as a draft beneath another surface, extension shortcuts are unreachable. — primary
8. **Late-loaded plugin has no shortcut wiring** — `setupKeyHandlers()` runs only at init and after `setEditorComponent`; a plugin loaded after init has no shortcut wiring until the editor is rebuilt. — primary

## Searches

Read: `pi-tui/src/keybindings.ts`, `pi-tui/src/app-keybindings.ts`, `pi-tui/src/prompt/custom-editor.ts`, `pi-tui/src/tui.ts`, `pi-tui/src/terminal.ts`, `pi-tui/src/stdin-buffer.ts`, `pi-tui/src/components/editor.ts`, `pi-tui/src/overlays/agent-hub.ts`, `src/modes/controllers/input-controller.ts`, `src/modes/controllers/selector-controller.ts`, `src/modes/interactive-mode.ts`, `src/modes/controllers/extension-ui-controller.ts`, `src/extensibility/extensions/types.ts`, `src/extensibility/extensions/loader.ts`, `src/extensibility/extensions/runner.ts`, `src/session/agent-session.ts`, `src/modes/rpc/rpc-mode.ts`, `src/modes/print-mode.ts`, `src/modes/acp/acp-agent.ts`, `src/autoresearch/index.ts`, `src/slash-commands/builtin-registry.ts`, `src/extensibility/extensions/get-commands-handler.ts`
Read docs: `omp://keybindings.md`, `omp://extensions.md`, `omp://tui-runtime-internals.md`

## Conflicting evidence

None. All sources agree.

## Gaps

- `app.session.toggleSort` has no consumer in v18.6.1; intended host unaudited.
- `setUserBindings` + `setEditorComponent` runtime re-wire path is derived from code path, not executed in a live session (speculative).
- `handleHotkeysCommand` body not read in full (callers + hotkeys-markdown row builder only).
- TUI.showOverlay focus semantics audited only for hub/transcript-viewer + generic setFocus.
