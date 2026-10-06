# M3-W1: ctrl+s precedence + full keypress→handler dispatch

## Angle

Extension `registerShortcut("ctrl+s", …)` collides with built-in `app.session.observe` (default `ctrl+s`).
Who wins at runtime? Full stdin→handler chain in interactive mode. Can a plugin add a keybinding *action*
or remap/disable a built-in one? Which modes disable extension shortcuts? `registerCommand` contract.
Mode-by-mode degradation for non-interactive frontends.

Source root (omp v18.6.1): `~/.bun/install/global/node_modules/@oh-my-pi/{pi-tui,pi-coding-agent}/src`.
Repo-relative paths below are under `pi-coding-agent/src/` unless prefixed `pi-tui:`.

---

## Claims

### 1. ctrl+s: extension CAN register it, but the BUILT-IN WINS at runtime

**Definitive answer: the built-in `app.session.observe` handler wins. An extension `registerShortcut("ctrl+s", …)` never fires under default config.**

- `ctrl+s` is NOT in the reserved denylist — `src/extensibility/extensions/runner.ts:1211-1229` — confidence: primary.
  Denylist = `ctrl+c/d/z/k/p/l/o/t/g`, `ctrl+q`, `alt+m`, `shift+tab`, `shift+ctrl+p`, `alt+enter`, `escape`, `enter`.
- `app.session.observe` default chord is `ctrl+s` — `pi-tui:src/app-keybindings.ts:200-203` — confidence: primary.
- `app.agents.hub` default chord is `alt+a` — `pi-tui:src/app-keybindings.ts:196-199` — confidence: primary.

**Dispatch order (fixed, unconditional), `src/modes/controllers/input-controller.ts`:**

| # | Line | Statement | Effect |
|---|---|---|---|
| 1 | 661 | `editor.clearCustomKeyHandlers()` | wipes ALL custom handlers (incl. extension ones from a prior wiring) |
| 2 | 663 | `registerExtensionShortcuts()` | writes extension `ctrl+s` → extension handler |
| 3 | 664-695 | `setCustomKeyHandler` for plan/session/followUp/stt/live/copyLine | unrelated keys |
| 4 | 696-702 | `hubKeys = getKeys("app.agents.hub") ∪ getKeys("app.session.observe")`; loop `setCustomKeyHandler(key, () => showAgentHub())` | writes `ctrl+s` → **built-in hub handler**, overwriting step 2 |

- `setCustomKeyHandler` is a plain `Map.set` — `pi-tui:src/prompt/custom-editor.ts:1392-1395` — confidence: primary.
  Last writer wins. No layering, no priority, no chain.
- `clearCustomKeyHandlers()` clears the same map extensions use — `pi-tui:src/prompt/custom-editor.ts:1408-1411` — confidence: primary.
  (So line 661 does clear extension shortcuts; line 663 re-adds them immediately after.)
- **Empirically verified** (real `CustomEditor`, real `KeybindingsManager`, ctrl+s = `\x13`):
  - register order `EXT` then `BUILTIN_HUB` → `["BUILTIN_HUB"]`
  - register order `BUILTIN_HUB` then `EXT` → `["EXTENSION"]`
  - confidence: primary (direct execution of installed source).
- `registerExtensionShortcuts()` body: `runner.getShortcuts()` → `setCustomKeyHandler(keyId, …)` with an
  `isExtensionActive()` liveness guard — `src/modes/controllers/input-controller.ts:2836-2858` — confidence: primary.
- `getShortcuts()` lowercases keys, drops reserved ones, last-extension-wins on duplicates —
  `src/extensibility/extensions/runner.ts:1231-1257` — confidence: primary.

**Consequence:** the extension handler for `ctrl+s` is dead code. The extension registration is not an error
(no warning is emitted for `ctrl+s`, since the reserved check only covers the denylist) — it silently loses.

**Only way the extension's `ctrl+s` fires:** the user removes `ctrl+s` from both built-ins in
`~/.omp/agent/keybindings.yml` (see §3). Verified by simulation:

| `keybindings.yml` | `hubKeys` at line 696 | ctrl+s dispatches to |
|---|---|---|
| (default) | `["alt+a","ctrl+s"]` | `BUILTIN_HUB` |
| `app.session.observe: []` | `["alt+a"]` | `EXTENSION` |
| `app.session.observe: []` + `app.agents.hub: []` | `[]` | `EXTENSION` |
| `app.session.observe: ctrl+j` | `["alt+a","ctrl+j"]` | `EXTENSION` |
| confidence: primary (executed simulation against installed source) | | |

### 2. `app.session.toggleSort` also defaults to `ctrl+s` but is a dead action

- `app.session.toggleSort` defined with `defaultKeys: "ctrl+s"` — `pi-tui:src/app-keybindings.ts:208-211` — confidence: primary.
- **No consumer anywhere**: zero matches for `toggleSort` in `pi-tui/src` + `pi-coding-agent/src` outside its
  own declaration; zero `setActionKeys`/`setCustomKeyHandler`/`getKeys` reference — confidence: primary.
- Not in `ConfigurableEditorAction` (`pi-tui:src/prompt/custom-editor.ts:93-110`) → cannot be dispatched by the editor.
- Practical effect: none today. It is a latent second claimant on `ctrl+s` that would collide if ever wired.
- `app.session.observe` is only *read* in three places: `input-controller.ts:698` (editor custom handler),
  `selector-controller.ts:2227` (hub overlay close keys), `pi-tui:src/hotkeys-markdown.ts:150` (`/hotkeys` display) — confidence: primary.

### 3. Built-in `app.session.observe` CAN be remapped/disabled — by the USER, not by a plugin

- `~/.omp/agent/keybindings.yml`, YAML mapping action-id → chord or chord array; empty array disables —
  `omp://keybindings.md` (fetch 2026-10-06) — confidence: primary.
  ```yaml
  app.session.observe: []        # disable
  app.session.observe: Ctrl+J    # remap
  ```
- Load path: `KeybindingsManager.create()` → `loadMergedKeybindingsConfig` → `resolveKeybindingsConfigPaths`
  (`.yml` → `.yaml` → legacy `.json`) → `loadKeybindingsConfig` (name migration + YAML write-back) —
  `pi-tui:src/app-keybindings.ts:441-528, 595-601` — confidence: primary.
- Merge: `{ ...inheritedConfig, ...profileConfig }` — `pi-tui:src/app-keybindings.ts:460-465` — confidence: primary.
- Manager construction in the interactive session: `KeybindingsManager.create()` — `src/modes/interactive-mode.ts:2031` — confidence: primary.
  (Constructor pre-init uses `inMemory()` — `interactive-mode.ts:1754`.)
- Empty array ⇒ `getKeys()` returns `[]` ⇒ loop at 696-702 registers nothing for that action —
  verified: `getKeys("app.session.observe")` → `[]`, `matchesCanonical("ctrl+s", …)` → `false` — confidence: primary.
- **No plugin API.** `ExtensionAPI` has no keybinding member — `src/extensibility/extensions/types.ts:1357-1696` — confidence: primary.
  `KeybindingsManager` appears in extension types only as (a) a type re-export and (b) the 3rd arg of
  `ctx.ui.custom(...)` / `ctx.ui.setEditorComponent(...)` factories — `types.ts:140, 317, 361` — confidence: primary.
- User-facing remap is documented; plugin-facing remap is not — `omp://keybindings.md` (fetch 2026-10-06) — confidence: primary.

**Unsupported escape hatch (works but is not an API):** `getKeybindings()`/`setKeybindings()` are exported from
`pi-tui:src/keybindings.ts:342-351` and re-exported via `pi-tui:src/index.ts:48`. The global manager is a
process singleton, so `getKeybindings().setUserBindings({ "app.session.observe": [] })` mutates the live
session's manager — verified: same instance, `getKeys` flips to `[]` — confidence: primary.
Caveat (critical): already-installed editor handlers are **snapshots**. `hubKeys` is read once at
`input-controller.ts:696-699`, and `#actionMatchKeys` is a snapshot set by `setActionKeys`
(`pi-tui:src/prompt/custom-editor.ts:1362-1366`). A late `setUserBindings` does NOT rewire them, so the
old chord keeps firing. Only consumers calling `getKeybindings().matches(...)` at dispatch time
(`pi-tui:src/keybinding-matchers.ts`) would observe the change. — confidence: primary (code path) + speculative (end-to-end plugin effect).

**Re-wiring trick (inference, unsupported):** `ctx.ui.setEditorComponent(factory|undefined)` re-runs
`setupKeyHandlers()` — `src/modes/interactive-mode.ts:6975-7036`, call at `7025` — which re-reads
`keybindings.getKeys(...)`. So `setUserBindings(...)` followed by `setEditorComponent(...)` would apply a
runtime remap. Side effect: the editor is rebuilt (losing any prior custom editor). Not documented, not
tested, and `setEditorComponent` is a no-op in RPC/ACP — confidence: speculative.

### 4. Keybinding ACTIONS cannot be added by a plugin — NO API

- Action IDs are TypeScript interface keys resolved by declaration merging:
  `interface Keybindings` (`pi-tui:src/keybindings.ts:7-43`), `interface AppKeybindings` +
  `declare module "./keybindings" { interface Keybindings extends AppKeybindings {} }`
  (`pi-tui:src/app-keybindings.ts:26-72`), `TUI_KEYBINDINGS` (`keybindings.ts:58-142`),
  merged `KEYBINDINGS` (`app-keybindings.ts:86-248`) — confidence: primary.
- Merge is compile-time only; a runtime plugin cannot extend an interface — confidence: primary.
- `KeybindingsManager.#rebuild()` silently drops user bindings whose id is not in `#definitions`:
  `if (!(keybinding in this.#definitions)) continue;` — `pi-tui:src/keybindings.ts:266-273` — confidence: primary.
  So a plugin-authored `keybindings.yml` entry for an unknown id is ignored, not registered.
- No `registerKeybinding` / `addKeybinding` / `registerAction` export exists in either package — confidence: primary
  (see Searches).
- `omp://keybindings.md` states outright: "This is not an inventory of extension-registered shortcuts."
  (fetch 2026-10-06) — confidence: primary.
- **Fallback:** raw `pi.registerShortcut(KeyId, { description?, handler })` on a non-reserved key.
  Signature — `src/extensibility/extensions/types.ts:1530-1536`; stored — `src/extensibility/extensions/loader.ts:249-257`;
  dispatched — `src/modes/controllers/input-controller.ts:2836-2858`.
  Trade-offs: no user remap, no conflict detection, no `/hotkeys` row, no `KeybindingsManager` participation.

### 5. Denylist bypass holes (raw-string check, not canonical)

`getShortcuts()` compares `key.toLowerCase()` against a raw-string denylist; `setCustomKeyHandler`
matches on `canonicalKeyId(key)` — `runner.ts:1235-1243` vs `custom-editor.ts:1368-1376` +
`keybindings.ts:190-220` — confidence: primary. Verified by execution:

| `registerShortcut(...)` | denylist pass? | canonical |
|---|---|---|
| `escape` | blocked | `escape` |
| `esc` | **passes** | `escape` |
| `enter` | blocked | `enter` |
| `return` | **passes** | `enter` |
| `shift+ctrl+p` | blocked | `ctrl+shift+p` |
| `ctrl+shift+p` | **passes** | `ctrl+shift+p` |
| `ctrL+c` | blocked (lowercased) | `ctrl+c` |

- Verified end-to-end: `registerShortcut("return")` + Enter → extension handler fires, editor **submit never runs** — confidence: primary.
- The same alias hole lets an extension claim chords the action chain owns (`app.interrupt` on `esc`,
  `app.model.cycleBackward` on `ctrl+shift+p`). In those cases the action chain still wins (checked earlier),
  but the extension registers without any reserved-key warning — confidence: primary.

### 6. Full keypress → handler chain (interactive mode)

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

- Extension shortcut handler invocation — `pi-tui:src/prompt/custom-editor.ts:1669-1674` — confidence: primary.
- `app.retry` is the one action that explicitly defers to a custom handler first — `custom-editor.ts:1655-1667` — confidence: primary.
- Custom handler lookup map is rebuilt on every mutation; **first registered wins per alias**
  (`if (!this.#customMatchKeys.has(alias))`) — `custom-editor.ts:1368-1376` — confidence: primary.
  Verified: `setCustomKeyHandler("esc", A)` then `("escape", B)` → `A` fires for `\x1b`.
  Note this "first wins" is *within the alias map rebuild*, while the map itself is last-write-wins per key id.
- TUI input path documented — `omp://tui-runtime-internals.md` "Input and focus" (fetch 2026-10-06) — confidence: primary.
- `/hotkeys` row for the hub shows `app.agents.hub` / `app.session.observe` / double-tap left —
  `pi-tui:src/hotkeys-markdown.ts:144-152` — confidence: primary.

**When extension shortcuts are unreachable:**

| Situation | Effect | Source |
|---|---|---|
| Overlay focused (Agent Hub, selectors, dialogs) | `TUI.#handleInput` routes to the overlay's `handleInput`, not the editor; extension shortcuts dead until focus returns | `pi-tui:src/tui.ts:2781-2789`; hub own keys `pi-tui:src/overlays/agent-hub.ts:566-585` — primary |
| Editor mounted as draft beneath another surface (Ask dialog over a non-empty prompt) | input goes through `CustomEditor.handleDraftEdit` which only honours `app.clear` then forwards — **all extension shortcuts and the whole action chain are skipped** | `pi-tui:src/prompt/custom-editor.ts:1702-1717`; caller `src/modes/controllers/extension-ui-controller.ts:651-658` — primary |
| Focused subagent view | editor stays focused, handlers still installed and fire; no per-mode gating found. Some *actions* self-guard (`cycleThinkingLevel` at `input-controller.ts:2677-2689`, `cycleRoleModel` at `:2693-2700`) show a hint instead, but shortcuts do not | `src/modes/controllers/input-controller.ts:2677-2689`; `interactive-mode.ts:3667-3672` — primary |
| Plan mode | no gating found on the editor or the shortcut map; plan mode only claims `app.plan.toggle` via a custom handler | `input-controller.ts:664-667` — primary (absence of evidence) |
| Non-interactive modes (print/json/rpc/acp/subagent) | `registerExtensionShortcuts()` is never called — the only call sites are `input-controller.ts:663` and the passthrough `interactive-mode.ts:8157` | `src/modes/interactive-mode.ts:8156-8158` — primary |
| Editor replaced via `ctx.ui.setEditorComponent` | `setupKeyHandlers()` re-runs (line 7025), so extension shortcuts are re-registered on the new editor | `src/modes/interactive-mode.ts:7025` — primary |
| Extension suspended at runtime (`disabledExtensions` edit) | handler still bound but returns early via `runner.isExtensionActive(shortcut.extensionPath)` | `input-controller.ts:2843-2844` — primary |

**Re-registration:** `setupKeyHandlers()` is called exactly twice — `interactive-mode.ts:2175` (init) and
`7025` (after `setEditorComponent`). No extension-load path re-invokes it, so a plugin installed/loaded
after init has no shortcut wiring until the editor is rebuilt — confidence: primary.

### 7. `registerCommand` — exact contract

Verbatim signature — `src/extensibility/extensions/types.ts:1519-1527` — confidence: primary:

```ts
/** Register a custom command. */
registerCommand(
	name: string,
	options: {
		description?: string;
		getArgumentCompletions?: RegisteredCommand["getArgumentCompletions"];
		handler: RegisteredCommand["handler"];
	},
): void;
```

`RegisteredCommand` — `src/extensibility/extensions/types.ts:1331-1336` — confidence: primary:

```ts
export interface RegisteredCommand {
	name: string;
	description?: string;
	getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}
```

- Storage: `this.extension.commands.set(name, { name, ...options })` — `src/extensibility/extensions/loader.ts:234-243` — confidence: primary.
- `AutocompleteItem` = `{ value, label, description?, icon?, iconName?, … }` — `pi-tui:src/autocomplete.ts:196-204` — confidence: primary.

**Args:** split at the FIRST space of the raw text; `args` is the remainder (may be empty), never `undefined` —
`src/session/agent-session.ts:7672-7675` — confidence: primary:
```ts
const spaceIndex = text.indexOf(" ");
const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
```
- Dispatch: `src/session/agent-session.ts:7669-7696`; runs inside `runner.runScoped(...)`; a throw is
  reported via `runner.emitError({ event: "command" })` and still returns `true` (consumed) — confidence: primary.
- Entered from `AgentSession.prompt` before prompt-template expansion: `#dispatchPrompt` → `#tryExecuteExtensionCommand`
  when `text.startsWith("/")` — `src/session/agent-session.ts:6920-6930` — confidence: primary.
- Extension commands are **local**: they never reach the agent and do not name the session —
  `src/modes/controllers/input-controller.ts:1413-1421` (`#isLocalExtensionCommand`) — confidence: primary.
- Queuing an extension command while streaming throws:
  `Extension command "/x" cannot be queued.` — `src/session/agent-session.ts:8191-8203` — confidence: primary.

**Rendering / autocomplete:**
- Interactive picker rows built from `runner.getRegisteredCommands(BUILTIN_SLASH_COMMAND_RESERVED_NAMES)`
  with icon `extension` and description fallback `"(hook command)"` —
  `src/modes/interactive-mode.ts:2542-2549` — confidence: primary.
- Reserved-name filter + diagnostics: skipped with a warning when `!hasUI()` —
  `src/extensibility/extensions/runner.ts:1294-1313`; reserved set = all builtin names,
  `src/slash-commands/builtin-registry.ts:60` — confidence: primary.
- `getArgumentCompletions` is passed straight through to the picker — `interactive-mode.ts:2548` — confidence: primary.
- Non-interactive discovery union (`source: "extension" | "prompt" | "skill"`):
  `getSessionSlashCommands` — `src/extensibility/extensions/get-commands-handler.ts:31-67` — confidence: primary.
  Called by interactive (`extension-ui-controller.ts:211,433`), RPC and print (`runtime-init.ts:129`), ACP
  (`acp-agent.ts:2583`) — confidence: primary.

**Verbatim working example** (real, shipped) — `src/autoresearch/index.ts:125-141` — confidence: primary:

```ts
api.registerCommand("autoresearch", {
	description: "Toggle builtin autoresearch mode, or pass off / clear, or a goal message.",
	getArgumentCompletions(argumentPrefix: string): AutocompleteItem[] | null {
		if (argumentPrefix.includes(" ")) return null;
		const normalized = argumentPrefix.trim().toLowerCase();
		if (normalized.length === 0) return null;
		const completions: AutocompleteItem[] = [
			{ label: "off", value: "off", description: "Leave autoresearch mode" },
			{
				label: "clear",
				value: "clear",
				description: "Reset worktree to baseline and close the active session",
			},
		];
		const filtered = completions.filter(item => item.label.startsWith(normalized));
		return filtered.length > 0 ? filtered : null;
	},
	async handler(args, ctx): Promise<void> {
		const trimmed = args.trim();
		const runtime = getRuntime(ctx);
		// ...
	},
});
```

Minimal shape from `omp://extensions.md` (fetch 2026-10-06) — confidence: primary:

```ts
pi.registerCommand("hello-ext", {
  description: "Show queue state",
  handler: async (_args, ctx) => {
    ctx.ui.notify(`pending=${ctx.hasPendingMessages()}`, "info");
  },
});
```

### 8. Mode-by-mode degradation (non-interactive frontends)

Runner mode union: `"tui" | "rpc" | "json" | "print"` — `src/extensibility/extensions/types.ts:458` — confidence: primary.
`ctx.hasUI` is `this.#uiContext !== noOpUIContext` — `runner.ts:1032-1034` — confidence: primary.

| Frontend | `initialize` call | `ctx.mode` | `ctx.hasUI` | UI context | Notes |
|---|---|---|---|---|---|
| Interactive TUI | `extension-ui-controller.ts:314` and `:532` | `"tui"` | `true` | full `ExtensionUIContext` | only place `registerExtensionShortcuts` runs |
| RPC (with UI ctx) | `rpc-mode.ts:1492-1493` | `"rpc"` | `true` | `RpcExtensionUIContext` (`rpc-mode.ts:1292`) | dialogs round-trip; `custom()` returns `undefined as never` (`:1413-1416`); `setEditorComponent()` no-op (`:1478-1480`) |
| RPC `--no-ui` | same, no `uiContext` | `"rpc"` | `false` | `noOpUIContext` | all `ctx.ui` no-op/default-returning |
| Print | `print-mode.ts:161-170` | `"print"` | `false` | `noOpUIContext` | no `uiContext` passed |
| JSON | same | `"json"` | `false` | `noOpUIContext` | stdout JSON header stream |
| ACP | `acp-agent.ts:2564-2642` | `"rpc"` | `true` | `createAcpExtensionUiContext` (`acp-agent.ts:425`) | elicitation-bridged select/confirm/input/editor; widgets/editor/theming/autocomplete inert; `setEditorComponent: () => {}` (`acp-agent.ts:581`) |
| Subagent / child task | `task/executor.ts:3718,4406`, `task/persisted-revive.ts:235` | via `runtime-init` default | depends | usually none | restricted children don't admit extension tools |
| Hand-built session w/o runner | `agent-session.ts:7698-7713` | `"print"` | `false` | literal `noOpUIContext` object | fallback command context |

**What degrades how:**

| API | Interactive | RPC | Print/JSON | ACP |
|---|---|---|---|---|
| `registerCommand` | works, in picker | works (via prompt) | works (via prompt) | works |
| `registerShortcut` | bound to editor | **inert** — never wired | **inert** | **inert** |
| `registerFlag` | works | works | works | works |
| `registerTool` / `registerMessageRenderer` | works | works | works | works |
| `ctx.ui.custom()` | mounts component | returns `undefined as never` | no-op → `undefined` | inert (elicitation only) |
| `ctx.ui.setEditorComponent()` | swaps editor | no-op | no-op | no-op |
| `ctx.ui.addAutocompleteProvider()` | stacks provider | accepted+ignored | ignored | ignored |
| `ctx.ui.getEditorText()` | live text | `""` | `""` | `""` |
| `ctx.ui.setTheme()` | works | failure return | failure | failure |
| `ctx.ui.setFooter/setHeader` | no-op in controller | no-op | no-op | no-op |
| `ctx.ui.onTerminalInput()` | works | unsupported | no-op returns disposer | inert |
| Command ctx (`waitForIdle`, `newSession`, `branch`, `navigateTree`, `switchSession`, `reload`) | real handlers | **absent** (no `commandContextActions` in `runtime-init.ts:56-213`) → defaults `async () => ({ cancelled: false })` / `async () => {}` | same | real handlers (`acp-agent.ts:2617-2641`) |

- `noOpUIContext` definition — `src/extensibility/extensions/runner.ts:453-500` — confidence: primary.
- Command-context default stubs — `src/extensibility/extensions/runner.ts:503-516`, applied at `813-822`
  ("optional, only for interactive mode" comment at `812`) — confidence: primary.
- `createCommandContext()` spread — `src/extensibility/extensions/runner.ts:1463-1477` — confidence: primary.
- Shared print/RPC wiring — `src/modes/runtime-init.ts:1-8` header + `56-213` — confidence: primary.
- Degradation summary also stated in `omp://extensions.md` "UI integration points" (fetch 2026-10-06) — confidence: primary.

**Load-time guards (mode-independent):** action methods throw `ExtensionRuntimeNotInitializedError` until
`initialize()` — `src/extensibility/extensions/loader.ts:90-125`, e.g. `sendMessage`, `sendUserMessage`,
`appendEntry`, `setLabel` — confidence: primary. Registration methods are safe at load.

---

## Risks (unsupported mechanisms + fallbacks)

| Risk | Severity | Fallback |
|---|---|---|
| **`registerShortcut("ctrl+s")` is silently dead** — overwritten by the built-in hub handler at `input-controller.ts:696-702`; no warning, no error | high | use a non-reserved, non-action chord (e.g. `ctrl+shift+x`, as `autoresearch/index.ts:240` does); document the required `keybindings.yml` edit if `ctrl+s` is essential |
| **Extension shortcut chords are not user-remappable** — raw key, no `KeybindingsManager` participation, no `/hotkeys` row | medium | ship the chord in the plugin's README; or expose the feature as a `registerCommand` and let the user bind a built-in action they don't use |
| **`registerShortcut` can hijack reserved chords via aliases** (`esc`, `return`, `ctrl+shift+p`) because the denylist is a raw-string compare, not `canonicalKeyId` | medium (plugin-footgun) | never register alias spellings; treat the canonical set as reserved even where the check misses it |
| **No plugin API to add a named keybinding action** | medium | `registerShortcut` on a free chord (no remap), or require a manual `keybindings.yml` entry against a built-in action the plugin intercepts |
| **Late extension load has no shortcut wiring** — `setupKeyHandlers()` runs only at `interactive-mode.ts:2175` and after `setEditorComponent` (`7025`) | medium | register shortcuts from the factory (load time); a plugin that must load late needs `ctx.ui.setEditorComponent(...)` to re-run wiring |
| **`getKeybindings().setUserBindings(...)` mutates a process singleton and leaks across sessions/subagents** | medium | do not use; treat as read-only. If unavoidable, restore prior bindings on `session_shutdown` |
| **`handleDraftEdit` path silently drops all shortcuts** while an Ask dialog owns a non-empty draft | low | expected behaviour; don't rely on shortcuts during modal draft edit |
| **Extension commands cannot be queued while streaming** (`agent-session.ts:8199-8201`) | low | call `waitForIdle()` first (interactive/RPC/ACP only; absent in print) |
| **`app.session.toggleSort` is a latent second `ctrl+s` claimant** — currently unwired | low | ignore until it gains a consumer; re-check on omp upgrades |

---

## Searches

- `setCustomKeyHandler|clearCustomKeyHandlers|removeCustomKeyHandler` across `pi-tui/src`, `pi-coding-agent/src` — 1 impl file (`pi-tui:src/prompt/custom-editor.ts`), 1 wiring file (`input-controller.ts`), 1 passthrough (`interactive-mode.ts:8156-8158`).
- `registerExtensionShortcuts` across the whole installed tree incl. `dist/cli.js` — exactly 3 call sites (definition + 2 calls); nothing re-invokes it on extension load.
- `toggleSort|app.session.toggleSort` across `pi-tui/src` + `pi-coding-agent/src` (+ bundled `dist/cli.js`) — declaration only, zero consumers.
- `"ctrl+s"` literal across `pi-tui/src` + `pi-coding-agent/src` — 2 definitions (`app-keybindings.ts:201,209`), 0 `matchesKey` call sites.
- `registerKeybinding|addKeybinding|defineKeybinding|keybindingAction|registerAction` in both packages — no matches.
- `keybind|Keybind` in `extensibility/` — only type imports/re-exports and the `custom()`/`setEditorComponent` factory arg.
- `getKeybindings|setKeybindings` in `pi-coding-agent/src` — only `legacy-pi-coding-agent-shim.ts:34,435` (display helper).
- `KeybindingsManager.create|KeybindingsManager.inMemory` — `interactive-mode.ts:1754,2031`; `extension-ui-controller.ts:1136`.
- `setupKeyHandlers` — definition `input-controller.ts:319`; calls `interactive-mode.ts:2175,7025`.
- `getSessionSlashCommands` — `extension-ui-controller.ts:211,433`; `runtime-init.ts:129`; `acp-agent.ts:2583`.
- `initializeExtensions(` — `print-mode.ts:161`; `rpc-mode.ts:1492`; `task/executor.ts:3718,4406`; `task/persisted-revive.ts:235`.
- Executed: `CustomEditor` + `KeybindingsManager` + `parseKey`/`canonicalKeyId`/`matchesKey` against installed source to confirm ctrl+s winner, alias collisions, denylist gaps, and remap/disable outcomes.

---

## Conflicting evidence

- `input-controller.ts:661` (`clearCustomKeyHandlers`) runs **before** `663` (`registerExtensionShortcuts`), so the
  clear does NOT wipe extension shortcuts at init — it wipes them only if `setupKeyHandlers` is re-run without
  re-registering (it always re-registers on the next line). The earlier note that extension shortcuts are wired
  "AFTER built-in `setCustomKeyHandler` calls" is true only for lines 605-660; the hub registration at 696-702
  comes after and is what actually defeats `ctrl+s`.
- `#rebuildCustomMatchKeys` uses first-wins per alias, while `setCustomKeyHandler` is last-write-wins per key id.
  Both are true: the map is keyed by the *registered* `KeyId` string, and the alias projection keeps the first.
  Consequence: registering `esc` then `escape` leaves two map entries but one alias winner (`esc`).
- `omp://extensions.md` says reserved shortcuts are "ignored"; `getShortcuts` logs a warning and `continue`s —
  consistent, but note `ctrl+s` is not reserved, so nothing warns about the `app.session.observe` collision.

## Gaps

- No omp version pin beyond v18.6.1 installed source; `dist/cli.js` bundle was spot-checked only for call-site
  counts and the `toggleSort` declaration.
- `app.session.toggleSort` has no consumer in v18.6.1; its intended host (session selector) was not exhaustively
  audited — it may be planned or removed.
- The `setUserBindings` + `setEditorComponent` re-wire path is derived from the code path, not executed
  end-to-end inside a live session (marked speculative).
- `handleHotkeysCommand` (`command-controller.ts:824`) was not read in full; only its callers and the
  `hotkeys-markdown.ts` row builder were inspected.
- Exact `TUI.showOverlay` focus semantics for every overlay type were not audited; only the hub/transcript
  viewer key handling and the generic `setFocus` dispatch were confirmed.
