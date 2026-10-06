# F15 Plugin Packaging & Dev Tooling

## Angle
Exact `package.json#omp` manifest shape, `omp plugin link` dev loop, tool activation chain, slash command/keybinding/settings registration, and what the hello-extension example + marketplace docs demonstrate vs omit. Every claim traces to source path:lines or URL+date.

## Claims

### Q1: Exact `package.json#omp` manifest shape

**Verbatim `PluginManifest` type** (`src/extensibility/plugins/types.ts:27-49`):

```ts
export interface PluginManifest {
	/** Plugin display name (defaults to package name) */
	name?: string;
	/** Plugin version (copied from package.json version) */
	version: string;
	/** Human-readable description */
	description?: string;

	/** Entry point for base tools (relative path from package root) */
	tools?: string;
	/** Entry point for base hooks (relative path from package root) */
	hooks?: string;
	/** Extension entry points (relative paths from package root) */
	extensions?: string[];
	/** Command files (relative paths from package root) */
	commands?: string[];

	/** Feature definitions for selective installation */
	features?: Record<string, PluginFeature>;

	/** Settings schema for plugin configuration */
	settings?: Record<string, PluginSettingSchema>;
}
```

**Verbatim `PluginFeature` type** (`types.ts:9-22`):

```ts
export interface PluginFeature {
	/** Human-readable description */
	description?: string;
	/** Whether this feature is enabled by default */
	default?: boolean;
	/** Additional extension entry points provided by this feature */
	extensions?: string[];
	/** Additional tool entry points provided by this feature */
	tools?: string[];
	/** Additional hook entry points provided by this feature */
	hooks?: string[];
	/** Additional command files provided by this feature */
	commands?: string[];
}
```

**Verbatim `PluginSettingSchema` union** (`types.ts:55-93`):

```ts
export type PluginSettingType = "string" | "number" | "boolean" | "enum";

interface PluginSettingBase {
	type: PluginSettingType;
	description?: string;
	secret?: boolean;
	env?: string;
}

export interface StringSetting extends PluginSettingBase {
	type: "string";
	default?: string;
}

export interface NumberSetting extends PluginSettingBase {
	type: "number";
	default?: number;
	min?: number;
	max?: number;
	step?: number;
}

export interface BooleanSetting extends PluginSettingBase {
	type: "boolean";
	default?: boolean;
}

export interface EnumSetting extends PluginSettingBase {
	type: "enum";
	values: string[];
	default?: string;
}

export type PluginSettingSchema = StringSetting | NumberSetting | BooleanSetting | EnumSetting;
```

**Manifest resolution** (`manager.ts:924`, `installer.ts:83`): `package.json.omp` → fallback `package.json.pi` → fallback `{ version: package.version }`. No strict schema validation. `manifest.version` always overwritten from `package.json#version`. — `omp://plugin-manager-installer-plumbing.md` § "Manifest source and required fields" — confidence: primary

**Settings validation** (`manager.ts:1327-1361`): `validateSetting(value, schema)` checks type, enum membership, min/max for numbers. `parseSettingValue(valueStr, schema)` coerces string input from CLI. — confidence: primary

**Settings storage**: `omp-plugins.lock.json#settings[pluginName][key]`. Project overrides via `.omp/plugin-overrides.json#settings[pluginName][key]`. Merge order: global lockfile → project overrides (project wins). — `loader.ts:482-490`, `types.ts:156-163` — confidence: primary

**Complete filled example manifest** for a plugin shipping extensions, tools, skills, slash commands, keybindings, and settings:

```json
{
  "name": "omp-agent-chatroom",
  "version": "0.1.0",
  "description": "Multi-agent chatroom plugin with claim board and structured messaging",
  "type": "module",
  "omp": {
    "name": "Agent Chatroom",
    "version": "0.1.0",
    "description": "Multi-agent chatroom plugin with claim board and structured messaging",
    "tools": "./src/tools/index.ts",
    "hooks": "./src/hooks/index.ts",
    "extensions": ["./src/extensions/index.ts"],
    "commands": ["./src/commands/index.ts"],
    "features": {
      "claim-board": {
        "description": "Structured claim board for multi-agent coordination",
        "default": true,
        "extensions": ["./src/extensions/claim-board.ts"]
      },
      "wait-tools": {
        "description": "Blocking wait primitives for agent synchronization",
        "default": true,
        "tools": ["./src/tools/wait.ts"]
      }
    },
    "settings": {
      "roomCapacity": {
        "type": "number",
        "description": "Maximum number of concurrent agents in the room",
        "default": 8,
        "min": 2,
        "max": 32,
        "step": 1
      },
      "claimTimeoutMs": {
        "type": "number",
        "description": "Timeout for claim expiration in milliseconds",
        "default": 300000,
        "min": 1000,
        "max": 3600000
      },
      "enableNotifications": {
        "type": "boolean",
        "description": "Show TUI notifications for room events",
        "default": true
      },
      "logLevel": {
        "type": "enum",
        "description": "Logging verbosity level",
        "values": ["debug", "info", "warn", "error"],
        "default": "info"
      },
      "apiKey": {
        "type": "string",
        "description": "Optional API key for external room service",
        "secret": true,
        "env": "CHATROOM_API_KEY"
      }
    }
  }
}
```

**Keybinding note**: The manifest has NO `keybindings` field. Keybindings are registered at runtime via `pi.registerShortcut()` inside the extension factory. The manifest only declares entry points (files); registration happens in code. — `types.ts:27-49` (no keybindings field), `types.ts:1530-1537` (registerShortcut) — confidence: primary

**Skills note**: The manifest has NO `skills` field. Skills are discovered via conventional directory scan (`skills/` directory under the plugin root) through the `omp-plugins` capability provider, not through the manifest. — `omp://plugin-manager-installer-plumbing.md` § "Current runtime wiring" — confidence: primary

### Q2: `omp plugin link` dev loop

**Symlink layout** (`manager.ts:890-944`):
- `omp plugin link <path>` resolves `<path>` against manager cwd
- Reads `<path>/package.json`, validates `name` field
- Creates directory symlink at `~/.omp/plugins/node_modules/<pkg.name>` → `<absolutePath>`
- On Windows: junction type; on POSIX: dir type
- Scoped packages (`@scope/pkg`): creates scope directory under `node_modules/@scope/`
- Adds entry to `~/.omp/plugins/omp-plugins.lock.json` with `enabled: true`, `enabledFeatures: null`
- The symlink target is the source directory itself — no copy, no build step

**`omp install <local-path>`** routes to the same `link()` path (`install.ts:44-48`, `classify-install-target.ts:7-8`). The `install` command classifies targets: local paths → link, npm specs → install, marketplace refs → marketplace install. — `install.ts:32-42, 64-106` — confidence: primary

**What reloads live vs needs restart**:

| What | Reload behavior | Source |
|------|----------------|--------|
| Config files (`config.yml`, settings) | Hot-reload via FSWatcher (200ms debounce) | `settings.ts:148-150, 1100-1113` |
| Plugin enable/disable | Next session picks up lockfile change | `manager.ts:953-960` |
| Plugin feature selection | Next session picks up lockfile change | `manager.ts:970-999` |
| Extension code | Loaded once per session; new session picks up edits | `sdk.ts:1017-1018, 2600-2612` |
| Custom tool code | Loaded once per session; subagents rebind factories | `sdk.ts:2524-2534` |
| Skills/hooks/slash/MCP | Discovered per session via capability scans | `omp://plugin-manager-installer-plumbing.md` |

**Extension code is NOT hot-reloadable within a session.** Once `loadExtensions()` runs, extension factories are bound to that session's `ExtensionAPI`. No mechanism to re-import or rebind mid-session. The process-global `enabledPluginsCache` (`loader.ts:32`) is cleared by `clearPluginRootsAndCaches()` on session switch/resume (`main.ts:929, 949`). — confidence: primary

**No watch mode or auto-reload for plugin code.** The `install.ts:5-10` comment says docs advertise "symlinks the directory into the plugin set and watches it for changes" — but this refers to the symlink making source edits immediately visible on disk, NOT a file watcher that triggers reloads. — `install.ts:5-10` — confidence: primary

**Fastest iterate-edit-observe cycle**:
1. Edit plugin source files (TS/JS) in the linked directory
2. Start a new session (or switch/resume session to clear `enabledPluginsCache`)
3. Observe — new session re-scans plugin paths and re-imports modules

No build step needed (Bun imports TS natively). The symlink means edits are immediately on disk. Bottleneck is session startup time. — confidence: primary

### Q3: Tool activation chain

**`disabledExtensions` filtering** (`loader.ts:580-598`):
- Format: `extension-module:<derivedName>` where `derivedName` comes from `getExtensionNameFromPath` (e.g. `/x/foo.ts` → `foo`)
- Filtering in `discoverExtensionPaths()`: `isDisabledName` checks `disabled.has("extension-module:" + name)` and skips matching paths
- Explicitly configured file paths bypass this filter
- Also covers non-extension capabilities via `toExtensionId` on each capability
- Source: `loader.ts:580-598`, `omp://extension-loading.md` § "Disable specific extension modules" — confidence: primary

**`enabledFeatures` gating** (`loader.ts:206-216, 377-395`):
- `enabledFeatures: string[] | null` — `null` means "use defaults" (features with `default: true`)
- Feature resolution: iterates `manifest.features`, checks `enabledSet.has(featName)`, includes feature's declared entries
- When `enabledFeatures === null`, only features with `feat.default === true` are activated
- Project overrides take precedence: `projectOverrides.features?.[name] ?? runtimeState?.enabledFeatures`
- Source: `loader.ts:206-216, 377-395`, `types.ts:116, 132` — confidence: primary

**`defaultInactive` on ToolDefinition** (`types.ts:680-682`):
- "If true, tool is registered but not auto-included in the initial active set. The registering extension is responsible for activating/deactivating it via `setActiveTools()`."
- When `defaultInactive === true` OR `hidden === true`, tool excluded from initial active set unless explicitly requested via `--tools` or agent's `tools` field (`sdk.ts:3931-3951`)
- Extension-registered tools with `defaultInactive` are NOT force-included in `alwaysInclude` (`sdk.ts:3954-3962`)
- `hidden` treated identically to `defaultInactive` for activation (`sdk.ts:3934, 4713`)
- Source: `types.ts:680-682`, `sdk.ts:3931-3962, 4712-4716` — confidence: primary

**`loadMode: "discoverable"` vs `"essential"`**:
- `ToolLoadMode = "essential" | "discoverable"` (`pi-agent-core/src/types.ts:1032`)
- **Essential**: tool always stays top-level in model's tool array. Essential built-in names: `read`, `write`, `bash`, `edit`, `glob`, `eval`, `context-notes`, `compact`, `learn`, `manage-skill`, `jfind` (`tools/essential-tools.ts:23-38`)
- **Discoverable**: tool unmounted from top-level tool array, exposed as `xd://` virtual device when `tools.xdev` enabled (default). Model calls via `write xd://<tool>` with JSON args, or reads docs via `read xd://<tool>` (`tools/xdev.ts:78-83`)
- Extension tools default to `"discoverable"`; set `"essential"` to stay top-level (`types.ts:683-684`)
- Source: `pi-agent-core/src/types.ts:1032`, `tools/essential-tools.ts:23-38`, `tools/xdev.ts:78-83` — confidence: primary

**`setActiveTools` activation** (`types.ts:1615`):
- `setActiveTools(toolNames: string[]): Promise<void>` — replaces the active tool set by name
- Called by extensions to activate/deactivate tools at runtime
- Waits for registration barrier before applying (`runner.ts:1106-1158`)
- Source: `types.ts:1615`, `runner.ts:1106-1158` — confidence: primary

**Subagent tool inheritance**:
- Subagents inherit extension tools via `preloadedPreparedExtensions` — child sessions rebind parent's already-imported extension factories to their own `ExtensionAPI` (`loader.ts:490-520`)
- Module-level variables stay shared across sessions (`omp://extensions.md` § "Runtime model")
- **Restricted children** (`restrictToolNames`, incl. plan mode) NEVER expose extension-contributed tools — even late registrations. `preloadedExtensionPaths`/custom tool paths are dropped (`restrictToolNames ? [] : ...`), while `preloadedPreparedExtensions` is still forwarded (`sdk.ts:664-674`, `structured-subagent.ts:674-676`)
- Normal task subagents (NOT restricted by default) DO inherit extension tools
- Source: `loader.ts:490-520`, `sdk.ts:664-674`, `structured-submission.ts:604, 674-676` — confidence: primary

**Full activation chain**: Plugin loads → extension factory runs → `registerTool` → tool enters registry → activation decision (`defaultInactive`/`hidden` excluded unless explicit) → presentation (`xd://` mount or top-level) → model sees tool in system prompt. Subagents inherit via `preloadedPreparedExtensions`; `restrictToolNames` clamps admission. — confidence: primary

### Q4: Slash commands, keybindings, settings

**`registerCommand` signature** (`types.ts:1520-1527`):

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

`RegisteredCommand` (`types.ts:1331-1336`):

```ts
export interface RegisteredCommand {
    name: string;
    description?: string;
    getArgumentCompletions?: (args: string) => Promise<string[]>;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
}
```

Dispatch: `ExtensionRunner.getCommand` → `AgentSession.#tryExecuteExtensionCommand` (`agent-session.ts:7677`) — parses `/name args`, calls `handler(args, ctx)`. — confidence: primary

**`registerShortcut` signature** (`types.ts:1530-1537`):

```ts
registerShortcut(
    shortcut: KeyId,
    options: {
        description?: string;
        handler: (ctx: ExtensionContext) => Promise<void> | void;
    },
): void;
```

**Reserved key denylist** (`runner.ts:1211-1228`): `ctrl+c/d/z/k/p/l/o/t/g`, `ctrl+q`, `alt+m`, `shift+tab`, `shift+ctrl+p`, `alt+enter`, `escape`, `enter`. `ctrl+s` is NOT reserved. — confidence: primary

Dispatch: `ExtensionRunner.getShortcuts` → `InputController.registerExtensionShortcuts` (`input-controller.ts:2839`) — `editor.setCustomKeyHandler(keyId, ...)` per shortcut, wired AFTER built-in handlers (`input-controller.ts:661-680`). — confidence: primary

**Settings schema declaration**: In `package.json#omp.settings` as `Record<string, PluginSettingSchema>`. Each setting has `type` (string|number|boolean|enum), `description?`, `secret?`, `env?`, type-specific fields (`default`, `min`/`max`/`step` for number, `values` for enum). — `types.ts:55-93` — confidence: primary

**CRITICAL: Settings are NOT on ExtensionAPI.** The `ExtensionAPI` interface (`types.ts:1357-1696`) has NO `settings` property. Extensions cannot read their own plugin settings at runtime through the API. — `types.ts:1357-1696` (no settings field) — confidence: primary

**How extensions CAN access settings**:
1. **Core settings** (not plugin settings): via `pi.pi.settings` scope + `lookup(id)` from `config/registry.ts`. Setting handle methods: `get`, `layered`, `parse`, `accepts`, `set`, `override`, `clearOverride`, `unset`, `isConfigured`, `provenance`, `listen`, `pinDefault` (`registry.ts:455-793`). String-path `settings.get/set/override` removed in 18.3. — `omp://extensions.md` § "Settings" — confidence: primary
2. **Plugin settings**: only via `PluginManager.getPluginSettings(name)` / `setPluginSetting(name, key, value)` — internal API, NOT exposed to extensions. — `manager.ts:1008-1030` — confidence: primary
3. **Environment variables**: via `env` field in setting schema — fallback value when no explicit setting. — `types.ts:65` — confidence: primary

**Settings flow**: Manifest schema → `omp-plugins.lock.json#settings[pluginName][key]` → `PluginManager.getPluginSettings` merges global + project overrides → returned as `Record<string, unknown>`. Extensions have NO direct read path to this merged view. — `loader.ts:482-490` — confidence: primary

### Q5: What examples demonstrate vs omit

**`examples/extensions/hello.ts`** (31 lines) — Minimal tool registration only:
- `pi.registerTool({ name, label, description, parameters: z.object({...}), execute })`
- `pi.logger.debug(...)` for debugging
- Return shape: `{ content: [{ type: "text", text }], details: {...} }`
- No events, no commands, no settings, no persistence
- Source: `examples/extensions/hello.ts:1-31` — confidence: primary

**`examples/extensions/tools.ts`** (145 lines) — Interactive `/tools` command:
- `pi.registerCommand("tools", { handler })` with pi-tui `SettingsList`
- `pi.setActiveTools(Array.from(enabledTools))` for tool activation
- `pi.appendEntry` for state persistence
- `pi.on("session_start", ...)`, `pi.on("session_tree", ...)`, `pi.on("session_branch", ...)` for state restore
- `ctx.sessionManager.getBranch()` for branch-aware state
- Source: `examples/extensions/tools.ts:1-145` — confidence: primary

**`examples/extensions/with-deps/`** — npm dependency resolution:
- `package.json` with `omp.extensions: ["./index.ts"]` and `dependencies: { ms: "^2.1.3" }`
- Tests that jiti resolves modules from extension's own `node_modules`
- Source: `examples/extensions/with-deps/index.ts:1-36`, `examples/extensions/with-deps/package.json:1-17` — confidence: primary

**`examples/extensions/plan-mode.ts`** (549 lines) — Most complete example:
- `registerFlag`, `registerShortcut(Shift+P)`, 2 commands, `setActiveTools`
- `tool_call` block, `context` filter, `before_agent_start` message injection
- `agent_end` todo extraction, `ui.select/input/setEditorText`
- `setStatus/setWidget`, `appendEntry`, `getEntries`, `getFlag`, `sendMessage`
- Source: `examples/extensions/plan-mode.ts` — confidence: primary

**`omp://skills/examples/hello-extension/README.md`** — 3 install methods (copy to extensions dir, config array, CLI flag). Demonstrates: factory, `session_start`, `registerCommand`, `ui.notify`, `package.json` manifest. "Intentionally small." — confidence: primary

**`omp://skills/authoring-extensions.md`** — Canonical reference: min viable extension, full example (command+tool+hook), 4 discovery paths, entry point resolution, sibling capabilities, package.json manifest, command context methods, tool options (loadMode/approval/strict/readsSkillUris/hidden/defaultInactive), event examples, extension-vs-hook table, debugging, constraints. — confidence: primary

**`omp://marketplace.md`** — Marketplace = Git repo with `.omp-plugin/marketplace.json`. Plugin = dir with skills/commands/agents/rules/hooks/tools/MCP/LSP/DAP. `package.json#omp.extensions` manifest. Install symlinks to `node_modules`. User+project scopes. Catalog format, plugin entry fields, source formats, on-disk layout, naming rules. — confidence: primary

**What examples OMIT**:
- Settings schema declaration and runtime settings read/write
- Keybinding registration (only `plan-mode.ts` shows `registerShortcut`)
- Subagent tool visibility and `restrictToolNames` behavior
- `loadMode`/`approval`/`strict`/`hidden`/`defaultInactive` in practice (only documented in authoring doc)
- Provider/MCP/agent/skill registration
- Error handling patterns
- Testing strategies
- Packaging and distribution workflow
- Extension lifecycle management
- Multi-extension coordination
- The extensions README lists 13+ examples NOT shipped in the package (permission-gate, protected-paths, todo, question, subagent/, handoff, qna, status-line, snake, git-checkpoint, auto-commit-on-exit, custom-compaction, file-trigger)
- Source: `examples/extensions/README.md`, `omp://skills/authoring-extensions.md` — confidence: primary

## Searches
- Read: `src/extensibility/plugins/types.ts`, `parser.ts`, `manager.ts`, `loader.ts`, `installer.ts`, `runtime-config.ts`, `settings-host.ts`, `marketplace/` (all files)
- Read: `src/cli/plugin-cli.ts`, `classify-install-target.ts`, `commands/install.ts`
- Read: `src/extensibility/extensions/types.ts`, `runner.ts`, `loader.ts`
- Read: `src/config/registry.ts`, `settings.ts`
- Read: `examples/extensions/hello.ts`, `tools.ts`, `with-deps/`, `plan-mode.ts`, `README.md`
- Read docs: `omp://plugin-manager-installer-plumbing.md`, `omp://marketplace.md`, `omp://extension-loading.md`, `omp://extensions.md`, `omp://skills/authoring-extensions.md`, `omp://skills/examples/hello-extension/README.md`
- Grep: `disabledExtensions`, `enabledFeatures`, `defaultInactive`, `ToolLoadMode`, `getPluginSettings`, `pluginSettings`, `lookup.*override.*listen`

## Conflicting evidence
- `install.ts:5-10` comment says docs advertise "symlinks the directory into the plugin set and watches it for changes" — but no file watcher exists for plugin code. The "watches" refers to the symlink making source edits visible on disk, not an auto-reload mechanism. — `install.ts:5-10` vs actual code — confidence: primary

## Gaps
- ExtensionAPI has NO settings property — extensions cannot read their own plugin settings at runtime. This is a significant gap for plugin developers who need configurable behavior. Workaround: use environment variables via `env` field in schema, or read core settings via `pi.pi.settings` + `lookup(id)`.
- No `keybindings` or `skills` field in the manifest — these are registered/discovered through code and conventional directory scans, not declared in the manifest.
- No example combines settings + error handling + testing + packaging into a production-ready extension.
- The extensions README references 13+ examples not shipped in the npm package.

## Risks

| Risk | Fallback |
|------|----------|
| ExtensionAPI has NO `settings` property — plugin settings unreadable from extension code | Use `env` field in setting schema for env var fallback; use `pi.pi.settings` + `lookup(id)` for core settings; use `omp plugin config` CLI for external management |
| No hot-reload for extension code within a session | Start new session or switch/resume session to clear `enabledPluginsCache`; use SDK's `loadExtensions`/`loadCustomTools` directly in test scripts for faster iteration |
| `loadMode: "discoverable"` (default for extension tools) hides tools from top-level model tool array — model must call via `xd://` protocol | Set `loadMode: "essential"` for tools that must always be top-level; or ensure `tools.xdev` setting is enabled (default) |
| `defaultInactive` tools are excluded from initial active set — model cannot call them until activated | Call `pi.setActiveTools([...])` to activate at runtime; or omit `defaultInactive` to include in initial set |
| Restricted children (plan mode, `restrictToolNames`) NEVER expose extension tools | Design room tool to work in normal subagents only; do not rely on plan-mode subagents having extension tools |
| Plugin settings stored in `omp-plugins.lock.json` — no cross-process locking | Concurrent writers can overwrite each other; avoid running multiple `omp plugin config` commands simultaneously |
| `link` does not restrict source to cwd (legacy installer.ts does) | Be careful with `omp plugin link` from untrusted paths — the symlinked code runs in-process with no sandbox |
