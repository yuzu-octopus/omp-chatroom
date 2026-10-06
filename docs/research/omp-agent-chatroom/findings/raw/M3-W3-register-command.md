# M3-W3: registerCommand — slash commands via ExtensionAPI

## Angle
How `pi.registerCommand()` works: signature, rendering, autocomplete, execution, args.

## Claims

### 1. Verbatim `registerCommand` signature

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
— source: `src/extensibility/extensions/types.ts:1519-1527` — confidence: primary

### 2. `RegisteredCommand` interface (the stored shape)

```ts
export interface RegisteredCommand {
    name: string;
    description?: string;
    getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}
```
— source: `src/extensibility/extensions/types.ts:1331-1336` — confidence: primary

Key: handler receives `args: string` (raw string, NOT `string[]`). This differs from `CustomCommand.execute` which receives `args: string[]` (parsed).

### 3. `ExtensionCommandContext` shape

```ts
export interface ExtensionCommandContext extends ExtensionContext {
    getContextUsage(): ContextUsage | undefined;
    waitForIdle(): Promise<void>;
    newSession(options?: {
        parentSession?: string;
        setup?: (sessionManager: SessionManager) => Promise<void>;
    }): Promise<{ cancelled: boolean }>;
    branch(entryId: string): Promise<{ cancelled: boolean }>;
    navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<{ cancelled: boolean }>;
    switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
    reload(): Promise<void>;
    compact(instructionsOrOptions?: string | CompactOptions): Promise<void>;
}
```
— source: `src/extensibility/extensions/types.ts:605-632` — confidence: primary

Extends `ExtensionContext` (ui, mode, hasUI, cwd, sessionManager, modelRegistry, model, models, agent, isIdle, hasPendingMessages, abort, shutdown, getSystemPrompt, isProjectTrusted, runEphemeralTurn, memory, setInterval/setTimeout/clearTimer, etc.) — source: `omp://extensions.md` — confidence: primary

### 4. Registration → storage

`registerCommand` stores into `Extension.commands` Map:
```ts
registerCommand(name, options): void {
    this.extension.commands.set(name, { name, ...options });
}
```
— source: `src/extensibility/extensions/loader.ts:234-243` — confidence: primary

### 5. Discovery — `getRegisteredCommands()`

```ts
getRegisteredCommands(reserved?: ReadonlySet<string>): RegisteredCommand[] {
    const commands = new Map<string, RegisteredCommand>();
    for (const ext of this.extensions) {
        for (const command of ext.commands.values()) {
            if (reserved?.has(command.name)) {
                // skip with warning
                continue;
            }
            commands.set(command.name, command);
        }
    }
    return [...commands.values()];
}
```
— source: `src/extensibility/extensions/runner.ts:1294-1313` — confidence: primary

Reserved names (built-in slash commands) are skipped. `BUILTIN_SLASH_COMMAND_RESERVED_NAMES` is the denylist — source: `src/slash-commands/builtin-registry.ts:60` — confidence: primary

### 6. Autocomplete — how commands appear in slash menu

`#buildPendingSlashCommands()` in `interactive-mode.ts:2531-2579`:
- Extension commands → `SlashCommand[]` with `iconName: "extension"`, `getArgumentCompletions: cmd.getArgumentCompletions` passed through directly
- Custom commands (TypeScript) → `SlashCommand[]` with `getArgumentCompletions: complete && (prefix => complete(prefix, cwd))`
- Skill commands → `SlashCommand[]` with `iconName: "skill"`
- All merged: `[...builtinCommands, ...hookCommands, ...customCommands, ...skillCommandList]`

— source: `src/modes/interactive-mode.ts:2531-2579` — confidence: primary

`#rebuildSlashCommandAutocomplete()` (interactive-mode.ts:2607-2653) builds the autocomplete provider from pending + file + prompt template commands, then wraps with extension autocomplete factories.

### 7. `getArgumentCompletions` — what it is

For extension commands: `(argumentPrefix: string) => AutocompleteItem[] | null` — synchronous, receives the raw argument prefix string, returns `AutocompleteItem[]` or `null` (no completions).

For custom commands (TypeScript): `(argumentPrefix: string, cwd: string) => Promise<AutocompleteItem[] | null> | AutocompleteItem[] | null` — async, receives cwd.

`AutocompleteItem` shape (pi-tui):
```ts
export interface AutocompleteItem {
    value: string;
    label: string;
    description?: string;
    icon?: string;
    iconName?: string;
    nativeDetail?: string;
    state?: string;
    hint?: string;
}
```
— source: `pi-tui/src/autocomplete.ts:196-210` — confidence: primary

### 8. Execution — how `/command` reaches the handler

`#tryExecuteExtensionCommand(text)` in `agent-session.ts:7669-7696`:
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
— source: `src/session/agent-session.ts:7669-7696` — confidence: primary

**Args are raw string** — `text.slice(spaceIndex + 1)`, NOT parsed via `parseCommandArgs`. Handler receives the raw remainder after the command name.

### 9. Execution order in `#dispatchPrompt`

1. Extension commands (`#tryExecuteExtensionCommand`) — first
2. Custom commands (`#tryExecuteCustomCommand`) — second
3. File-based slash commands (`expandSlashCommand`) — third
4. Prompt template expansion — fourth

— source: `src/session/agent-session.ts:6922-6944` — confidence: primary

### 10. `getCommand()` — lookup by name

```ts
getCommand(name: string): RegisteredCommand | undefined {
    for (let index = this.extensions.length - 1; index >= 0; index -= 1) {
        const command = this.extensions[index]?.commands.get(name);
        if (command) return command;
    }
    return undefined;
}
```
— source: `src/extensibility/extensions/runner.ts:1319-1327` — confidence: primary

Iterates extensions in reverse order (last registered wins).

### 11. Verbatim example from source

From `src/autoresearch/index.ts:125-163`:
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
        if (trimmed === "" && runtime.autoresearchMode) {
            setMode(ctx, false, runtime.goal, "off");
            // ...
            return;
        }
        if (trimmed === "off") {
            // ...
            return;
        }
        // ...
    },
});
```
— source: `src/autoresearch/index.ts:125-163` — confidence: primary

### 12. Verbatim example from docs

From `omp://extensions.md` quick start:
```ts
pi.registerCommand("hello-ext", {
    description: "Show queue state",
    handler: async (_args, ctx) => {
        ctx.ui.notify(`pending=${ctx.hasPendingMessages()}`, "info");
    },
});
```
— source: `omp://extensions.md` (fetch 2026-10-06) — confidence: primary

### 13. `getCommands()` — extension discovery of all commands

`getSessionSlashCommands()` in `get-commands-handler.ts:31-67` returns `SlashCommandInfo[]` with `source: "extension" | "prompt" | "skill"`. Built-in commands are excluded (frontends prepend their own).

— source: `src/extensibility/extensions/get-commands-handler.ts:31-67` — confidence: primary

### 14. `SlashCommand` type (pi-tui, used in autocomplete)

```ts
export interface SlashCommand {
    name: string;
    aliases?: string[];
    description?: string;
    icon?: string;
    iconName?: string;
    argumentHint?: string;
    allowArgs?: boolean;
    getAutocompleteDescription?: () => string | undefined;
    getArgumentCompletions?(argumentPrefix: string): Awaitable<AutocompleteItem[] | null>;
    getInlineHint?(argumentText: string): string | null;
}
```
— source: `pi-tui/src/autocomplete.ts:214-232` — confidence: primary

### 15. `ExtensionCommandContextActions` — the action subset

```ts
export interface ExtensionCommandContextActions {
    getContextUsage: () => ContextUsage | undefined;
    waitForIdle: () => Promise<void>;
    newSession: (options?: {...}) => Promise<{ cancelled: boolean }>;
    branch: (entryId: string) => Promise<{ cancelled: boolean }>;
    navigateTree: (targetId: string, options?: { summarize?: boolean }) => Promise<{ cancelled: boolean }>;
    compact: (instructionsOrOptions?: string | CompactOptions) => Promise<void>;
    switchSession: (sessionPath: string) => Promise<{ cancelled: boolean }>;
    reload: () => Promise<void>;
}
```
— source: `src/extensibility/extensions/types.ts:1901-1913` — confidence: primary

## Searches
- `registerCommand` across `src/` — found in types.ts, loader.ts, runner.ts, hooks, agent-session.ts, interactive-mode.ts
- `getArgumentCompletions` across `src/` — found in types.ts, custom-commands/types.ts, interactive-mode.ts, builtin-completions.ts, autoresearch/index.ts
- `ExtensionCommandContext` across `src/` — found in types.ts, runner.ts, agent-session.ts, runtime-init.ts, extension-ui-controller.ts
- `getRegisteredCommands` in runner.ts — found at line 1294
- `#tryExecuteExtensionCommand` in agent-session.ts — found at line 7669
- `parseSlashCommand` helper — found in `slash-commands/helpers/parse.ts:22-36`
- `parseCommandArgs` — found in `utils/command-args.ts:2-47`
- `SlashCommand` type in pi-tui — found at `autocomplete.ts:214-232`
- `AutocompleteItem` type in pi-tui — found at `autocomplete.ts:196-210`

## Conflicting evidence
- None. All sources agree.

## Gaps
- No dedicated `get-commands-handler.ts` for extension commands alone — `getSessionSlashCommands()` covers extension + custom + skill commands together.
- The `getArgumentCompletions` signature differs between extension commands (sync, 1 arg) and custom commands (async, 2 args). This is a design inconsistency but not a conflict.
- `parseSlashCommand` (used by ACP/builtin) splits on earliest whitespace or colon, while `#tryExecuteExtensionCommand` splits only on space. Extension commands with `:` in args may behave differently between TUI and ACP dispatch paths.
