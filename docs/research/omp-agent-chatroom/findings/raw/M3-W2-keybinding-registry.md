# M3-W2: Keybinding Registry & Plugin Keybinding Actions

## Angle
Can a plugin add a named keybinding action (with user remapping, `/hotkeys` integration, conflict detection)? How does `keybindings.yml` load/merge? What is the action registry mechanism?

## Claims

### 1. No plugin API for adding keybinding actions — NO

There is no runtime API to register a new keybinding action. The action registry is purely TypeScript declaration merging:

- `Keybindings` interface defines action IDs as keys with `true` values — `pi-tui/src/keybindings.ts:7-43` — source: primary
- `AppKeybindings` interface extends it via `declare module "./keybindings" { interface Keybindings extends AppKeybindings {} }` — `pi-tui/src/app-keybindings.ts:70-72` — source: primary
- `TUI_KEYBINDINGS` const provides `KeybindingDefinitions` (default keys + descriptions) — `pi-tui/src/keybindings.ts:58-142` — source: primary
- `KEYBINDINGS` const merges TUI + app definitions — `pi-tui/src/app-keybindings.ts:86-248` — source: primary
- `KeybindingsManager` class manages runtime lookup, matching, conflicts — `pi-tui/src/keybindings.ts:247-338` — source: primary
- No `registerKeybinding`, `addKeybinding`, `defineKeybinding`, or similar export exists in `pi-tui/src/index.ts` (only `export * from "./keybindings"` at line 48) — source: primary
- No `registerKeybindingAction` or similar in `pi-coding-agent/src/extensibility/` — source: primary
- `omp://keybindings.md` explicitly states: "This is not an inventory of extension-registered shortcuts." — source: primary

### 2. keybindings.yml load/merge path
- `KeybindingsManager.create(agentDir, options)` — `pi-tui/src/app-keybindings.ts:595-601` — source: primary
- Calls `loadMergedKeybindingsConfig(agentDir, options)` — `pi-tui/src/app-keybindings.ts:475-500` — source: primary
- `resolveKeybindingsConfigPaths(agentDir)` — `pi-tui/src/app-keybindings.ts:441-458` — looks for `keybindings.yml`, `keybindings.yaml`, legacy `keybindings.json` in agent dir — source: primary
- `loadKeybindingsConfig(filePath, writeBackPath)` — `pi-tui/src/app-keybindings.ts:506-528` — parses YAML/JSON, migrates legacy names, writes back to YAML — source: primary
- `mergeKeybindingsConfig(inheritedConfig, profileConfig)` — `pi-tui/src/app-keybindings.ts:460-465` — simple spread: `{ ...inheritedConfig, ...profileConfig }` — source: primary
- `resolveInheritedAgentDir(agentDir, options)` — `pi-tui/src/app-keybindings.ts:467-473` — resolves default profile's agent dir for named profiles — source: primary
- File is user-only; no plugin contribution mechanism exists — source: primary
- `omp://keybindings.md`: "User remaps live in `~/.omp/agent/keybindings.yml`" — source: primary

### 3. Fallback: raw `registerShortcut`

- `ExtensionAPI.registerShortcut(shortcut: KeyId, {description?, handler})` — `src/extensibility/extensions/types.ts:1530-1536` — source: primary
- Signature verbatim:
  ```ts
  registerShortcut(
      shortcut: KeyId,
      options: {
          description?: string;
          handler: (ctx: ExtensionContext) => Promise<void> | void;
      },
  ): void;
  ```
- Reserved denylist defined at `runner.ts:1211-1229` — `ctrl+c/d/z/k/p/l/o/t/g`, `ctrl+q`, `alt+m`, `shift+tab`, `shift+ctrl+p`, `alt+enter`, `escape`, `enter` — source: primary
- Dispatch via `editor.setCustomKeyHandler(keyId, ...)` in `registerExtensionShortcuts()` — `src/modes/controllers/input-controller.ts:2836-2858` — source: primary
- Wired AFTER built-in `setCustomKeyHandler` calls (`input-controller.ts:661-680`) — source: primary

### 4. RISK: `registerShortcut` bypasses keybinding action system

- No user remapping via `keybindings.yml` — the raw key is hardcoded — source: primary
- No conflict detection with other actions — source: primary
- No `/hotkeys` integration — source: primary
- No `KeybindingsManager` participation — source: primary
- Extension shortcuts are process-wide and checked at dispatch time via `runner.isExtensionActive()` — `input-controller.ts:2844` — source: primary

## Searches
- `registerKeybinding|addKeybinding|defineKeybinding|keybindingAction|registerAction` in `pi-tui/src` — no matches
- `registerKeybinding|addKeybinding|keybindingAction|registerAction` in `pi-coding-agent/src` — no matches
- `keybinding|Keybinding` in `pi-coding-agent/src/extensibility` — only type imports and `keyText()` helper
- `keybindings.yml|keybindings.yaml` in `pi-coding-agent/src` — no matches (file loading is in pi-tui)
- `export.*keybinding|export.*Keybinding` in `pi-tui/src` — only `export * from "./keybindings"` in index.ts:48

## Conflicting evidence
None.

## Gaps
- No plugin-facing API to contribute to `keybindings.yml` or register named actions.
- The TypeScript declaration merging mechanism (`declare module "./keybindings"`) is compile-time only; cannot be used by runtime plugins.
- A plugin that needs a user-remappable keybinding must either: (a) use `registerShortcut` on a non-reserved key (no remapping), or (b) require the user to manually add a `keybindings.yml` entry for a built-in action that the plugin intercepts.
