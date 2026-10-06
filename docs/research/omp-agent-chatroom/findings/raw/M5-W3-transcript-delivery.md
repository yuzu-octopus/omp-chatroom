# M5-W3: Transcript Delivery — Custom Messages, Persistence, and Tool Rendering

**Date:** 2026-10-06
**Scope:** How a plugin emits display cards into a session transcript, JSONL persistence on resume, `display:false` behaviour, and `renderCall`/`renderResult` contract.

---

## 1. `sendCustomMessage` — Verbatim Signature

**Source:** `agent-session.ts:8324-8334`

```typescript
async sendCustomMessage<T = unknown>(
    message: CustomMessagePayload<T>,
    options?: {
        triggerTurn?: boolean;
        deliverAs?: "steer" | "followUp" | "nextTurn" | "aside";
        queueChipText?: string;
        acceptTerminalEmptyStop?: boolean;
    },
): Promise<boolean> {
    return this.#admitSubmission(() => this.#sendCustomMessage(message, options));
}
```

**Source:** `agent-session.ts:8336-8344` (private impl)

```typescript
async #sendCustomMessage<T = unknown>(
    message: CustomMessagePayload<T>,
    options?: {
        triggerTurn?: boolean;
        deliverAs?: "steer" | "followUp" | "nextTurn" | "aside";
        queueChipText?: string;
        acceptTerminalEmptyStop?: boolean;
    },
): Promise<boolean> {
```

**Key behaviour** (`agent-session.ts:8361-8509`):
- Normalizes payload via `normalizeCustomMessagePayload<T>(message)` (line 8375)
- Constructs `CustomMessage<T>` with `role: "custom"`, `customType`, `content`, `display`, `details`, `attribution`, `timestamp: Date.now()` (lines 8386-8394)
- When idle + no `deliverAs` + no `triggerTurn`: appends to agent, persists via `sessionManager.appendCustomMessageEntry(...)`, and if `display === true` emits `message_start`/`message_end` session events for immediate paint (lines 8485-8507)
- When `display === false`: persists but does NOT emit session events — no immediate paint (line 8493 guard)

---

## 2. `sendMessage` — Verbatim Signature (Extension API)

**Source:** `types.ts:1592-1595`

```typescript
sendMessage<T = unknown>(
    message: CustomMessagePayload<T>,
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" | "aside" },
): void;
```

**Doc comment** (`types.ts:1576-1591`):
> With the default delivery (no `deliverAs`), an idle `display: true` message renders in the transcript immediately, even with `triggerTurn: false`, without starting a turn. This does not apply to `deliverAs: "nextTurn"` or `deliverAs: "aside"`, which keep the semantics described below (`nextTurn` stays hidden until consumed; `aside` starts a turn when idle).

---

## 3. `appendEntry` — Verbatim Signature

**Source:** `types.ts:1603`

```typescript
/** Append a custom entry to the session for state persistence (not sent to LLM). */
appendEntry<T = unknown>(customType: string, data?: T): void;
```

**Key distinction:** `appendEntry` writes a `type: "custom"` entry (NOT `custom_message`). It is for state persistence only — the entry is NOT sent to the LLM and does NOT render in the transcript. For transcript-visible cards, use `sendMessage`.

---

## 4. `CustomMessagePayload` Type

**Source:** `pi-tui/src/chat/messages.ts:42-44`

```typescript
/** Public input accepted by `pi.sendMessage` and `AgentSession.sendCustomMessage`. */
export type CustomMessagePayload<T = unknown> =
    | string
    | Partial<Pick<CustomMessage<T>, "customType" | "content" | "display" | "details" | "attribution">>;
```

---

## 5. `ToolDefinition` Interface — Verbatim (renderCall/renderResult/describeCall/describeResult)

**Source:** `types.ts:669-744`

```typescript
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown> {
    /** Tool name (used in LLM tool calls) */
    name: string;
    /** Human-readable label for UI */
    label: string;
    /** Description for LLM */
    description: string;
    /** Parameter schema (Zod, or TypeBox for legacy/extension compat). */
    parameters: TParams;
    /** If true, tool is excluded unless explicitly listed in --tools or agent's tools field */
    hidden?: boolean;
    /** If true, tool is registered but not auto-included in the initial active set.
     *  The registering extension is responsible for activating/deactivating it via setActiveTools(). */
    defaultInactive?: boolean;
    /** How this tool is presented when enabled. See {@link ToolLoadMode}. Extension tools default to `"discoverable"`; set `"essential"` to stay top-level. */
    loadMode?: ToolLoadMode;
    /** If true, tool may stage deferred changes that require explicit resolve/discard. */
    deferrable?: boolean;
    /** Whether this tool can read `skill://` instruction content. */
    readsSkillUris?: boolean;
    /** Tool approval tier. Defaults to `"exec"` when omitted.
     *  `"read"`: read-only operations. `"write"`: mutations. `"exec"`: code execution. */
    approval?: ToolApproval;
    /** Structured-output strict grammar opt-in/out. `false` is meaningful: OpenAI-family
     *  serializers preserve an explicit `strict: false` on the wire (#4336/#4340). */
    strict?: boolean;
    /** MCP server name for discovery/search metadata when this tool fronts an MCP server. */
    mcpServerName?: string;
    /** Original MCP tool name for discovery/search metadata. */
    mcpToolName?: string;
    /** Previous public name when a rename changed minting. Forwarded through
     *  RegisteredToolAdapter so approval falls back to legacy `deny`/`prompt`. */
    legacyName?: string;
    /** Optional environment hook applied when the interactive user shell invokes this tool's shell surface. */
    shellEnv?: ToolShellEnvironmentHook;
    /** Authoritative originating file for a discovered custom-tool module. */
    sourcePath?: string;
    /** Execute the tool. */
    execute(
        toolCallId: string,
        params: Static<TParams>,
        signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
        ctx: ExtensionContext,
    ): Promise<AgentToolResult<TDetails>>;

    /** Called on session lifecycle events - use to reconstruct state or cleanup resources */
    onSession?: (event: ToolSessionEvent, ctx: ExtensionContext) => void | Promise<void>;

    /**
     * Custom rendering for tool call display.
     *
     * At runtime `options` also answers the {@link Theme} API, so renderers
     * ported from upstream pi — declared `renderCall(args, theme, context)` —
     * keep styling correctly.
     */
    renderCall?: (args: Static<TParams>, options: ToolRenderResultOptions, theme: Theme) => Component;

    /** Custom rendering for tool result display */
    renderResult?: (
        result: AgentToolResult<TDetails>,
        options: ToolRenderResultOptions,
        theme: Theme,
        args?: Static<TParams>,
    ) => Component;

    /** Semantic call view for TSP terminals (the native counterpart of {@link renderCall}). */
    describeCall?: (args: Static<TParams>, options: ToolRenderResultOptions) => NativeToolView | undefined;

    /** Semantic result view for TSP terminals (the native counterpart of {@link renderResult}). */
    describeResult?: (
        result: AgentToolResult<TDetails>,
        options: ToolRenderResultOptions,
        args?: Static<TParams>,
    ) => NativeToolView | undefined;
}
```

---

## 6. `RenderResultOptions` — Verbatim

**Source:** `pi-tui/src/tools/renderer.ts:12-29`

```typescript
/** Display state handed to `renderCall`/`renderResult`. */
export interface RenderResultOptions {
    /** Whether the result view is expanded */
    expanded: boolean;
    /** Whether this is a partial/streaming result */
    isPartial: boolean;
    /** Current spinner frame index for animated elements (0-9, only provided during partial results) */
    spinnerFrame?: number;
    /**
     * True once arguments are final (`message_end` / `setArgsComplete`).
     * Exclusive tools can sit here while an earlier call still runs.
     */
    argsComplete?: boolean;
    /**
     * True once this specific call has begun executing (`tool_execution_start`).
     * Streamed `xd://` previews stay queued until this is set.
     */
    executionStarted?: boolean;
}
```

**Source:** `pi-tui/src/tools/renderer.ts:32`

```typescript
/** Render options for a result, plus the tool-specific context the transcript threads through. */
export type RenderResultContextOptions = RenderResultOptions & { renderContext?: Record<string, unknown> };
```

---

## 7. `ToolRenderResultOptions` (Extension API variant)

**Source:** `types.ts:638-646`

```typescript
/** Rendering options for tool results */
export interface ToolRenderResultOptions {
    /** Whether the result view is expanded */
    expanded: boolean;
    /** Whether this is a partial/streaming result */
    isPartial: boolean;
    /** Current spinner frame index for animated elements (optional) */
    spinnerFrame?: number;
}
```

**Note:** The extension API's `ToolRenderResultOptions` is a subset of the TUI's `RenderResultOptions` — it omits `argsComplete` and `executionStarted`. At runtime, the TUI's `RenderResultOptions` is passed, so `argsComplete` and `executionStarted` are available to extension renderers.

---

## 8. `display: true` vs `display: false` — Behaviour

### `display: true` (default for visible cards)

- **Idle + no deliverAs:** Appends to agent, persists to JSONL, emits `message_start`/`message_end` session events for immediate transcript paint (`agent-session.ts:8493-8507`)
- **Queued messages:** Renders in the queue UI (`queued-messages.ts:29-31`: `isDisplayableQueuedMessage` returns `true`)
- **Session history format:** Rendered as a one-liner in markdown transcript (`session-history-format.ts:591-615`)

### `display: false`

- **Idle + no deliverAs:** Appends to agent, persists to JSONL, but does NOT emit session events — no immediate paint (`agent-session.ts:8493` guard skips emit)
- **Queued messages:** Hidden from queue UI (`queued-messages.ts:30`: `return !(message.role === "custom" && message.display === false)`)
- **Session history format:** Skipped in markdown transcript unless the customType is in `PRIMARY_CONTEXT_CUSTOM_TYPES` or `CONTEXTUAL_NON_PRIMARY_HIDDEN_CUSTOM_TYPES` (`session-history-format.ts:594-600`)
- **LLM context:** Still appended to agent messages (line 8485), so the LLM sees it — it's just not rendered to the user

### Persistence

Both `display: true` and `display: false` entries are persisted to JSONL via `sessionManager.appendCustomMessageEntry(...)` (`agent-session.ts:8486-8492`). The `display` field is stored in the `CustomMessageEntry` and survives resume.

---

## 9. JSONL Persistence and Resume

### Entry type

**Source:** `session-entries.ts:292-300`

```typescript
export interface CustomMessageEntry<T = unknown> extends SessionEntryBase {
    type: "custom_message";
    customType: string;
    content: string | (TextContent | ImageContent)[];
    details?: T;
    display: boolean;
    /** Who initiated this message for billing/attribution semantics. */
    attribution?: MessageAttribution;
}
```

### Persistence path

1. `appendCustomMessageEntry` normalizes payload, creates `CustomMessageEntry` with `type: "custom_message"`, strips internal fields (`__queueChipText`), records via `#recordEntry` (`session-manager.ts:3439-3465`)
2. `#recordEntry` pushes to in-memory entries, inserts into index, calls `#appendToSessionFile(entry)` (`session-manager.ts:1926-1945`)
3. `#appendToSessionFile` writes to the `.jsonl` session file (`session-manager.ts:1655-1698`)

### Resume

- On resume, `buildSessionContext` iterates transcript entries and calls `customMessageEntryMessage(entry)` for `custom_message` entries (`session-context.ts:401-409`)
- `customMessageEntryMessage` (`transcript-entry.ts:39-51`) normalizes and creates a `CustomMessage` with the persisted `display` value
- The restored message is pushed into the agent's message array, making it visible on the next render

**Conclusion:** Custom message entries (both `display: true` and `display: false`) persist in the session JSONL and survive resume. On resume, they are restored as `CustomMessage` objects with their original `display` value.

---

## 10. `plan-mode.ts` Worked Example

**Source:** `examples/extensions/plan-mode.ts:209-549`

### `sendMessage` usage (display: true, triggerTurn: false)

```typescript
// Line 407-414: Plan complete card
pi.sendMessage(
    {
        customType: "plan-complete",
        content: `**Plan Complete!** ✓\n\n${completedList}`,
        display: true,
    },
    { triggerTurn: false },
);

// Line 452-459: Todo list card
pi.sendMessage(
    {
        customType: "plan-todo-list",
        content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
        display: true,
    },
    { triggerTurn: false },
);

// Line 480-487: Execute message (triggers turn)
pi.sendMessage(
    {
        customType: "plan-mode-execute",
        content: execMessage,
        display: true,
    },
    { triggerTurn: true },
);
```

### `sendMessage` usage (display: false, via before_agent_start hook)

```typescript
// Line 358-378: Plan mode context (hidden from user, sent to LLM)
return {
    message: {
        customType: "plan-mode-context",
        content: `[PLAN MODE ACTIVE]...`,
        display: false,
    },
};
```

### `appendEntry` usage (state persistence)

```typescript
// Line 528-533: Persist plan mode state at turn start
pi.on("turn_start", async () => {
    toolsCalledThisTurn = false;
    pi.appendEntry("plan-mode", {
        enabled: planModeEnabled,
        todos: todoItems,
        executing: executionMode,
    });
});
```

### State restoration on session_start

```typescript
// Line 497-523: Restore plan mode state from persisted entries
pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const planModeEntry = entries
        .filter((e) => e.type === "custom" && e.customType === "plan-mode")
        .pop();
    if (planModeEntry?.data) {
        planModeEnabled = planModeEntry.data.enabled;
        todoItems = planModeEntry.data.todos;
        executionMode = planModeEntry.data.executing;
    }
});
```

---

## 11. `renderCall`/`renderResult` Contract

### What they receive

| Parameter | Type | Description |
|-----------|------|-------------|
| `args` | `Static<TParams>` | The tool call parameters (parsed from LLM tool call) |
| `options` | `ToolRenderResultOptions` | Display state: `expanded`, `isPartial`, `spinnerFrame`, `argsComplete`, `executionStarted` |
| `theme` | `Theme` | Theme API for styling (colors, bold, etc.) — **only on `renderCall`/`renderResult`, NOT on `describeCall`/`describeResult`** |
| `result` | `AgentToolResult<TDetails>` | The tool execution result (content blocks + details) — **only on `renderResult`** |

### What they return

- **`renderCall`/`renderResult`:** `Component` (a pi-tui Component, which is a renderable UI node)
- **`describeCall`/`describeResult`:** `NativeToolView | undefined` (semantic view for TSP terminals)

### `NativeToolView` structure

**Source:** `pi-tui/src/tools/renderer.ts:98-113`

```typescript
export interface NativeToolView {
    /** The data head; the fallback card's head spans derive from it when {@link head} is absent. */
    readonly tool?: NativeToolHead;
    /** Header spans for the fallback card (and the `tool` title when {@link tool} is absent). */
    readonly head?: TspText;
    /** Body: sections, never frames. */
    readonly body?: readonly NativeChild[];
    /** Tone override; the frame otherwise derives it from the call status. */
    readonly tone?: TspTone;
    /** Body clamp while collapsed; `{tail}` keeps the end (terminal output). Defaults to the transcript's preview size. */
    readonly preview?: TspPreview | { readonly tail: number } | "none";
    /** Render frameless (`frame:"inline"`): a head line plus a disclosed body. */
    readonly inline?: boolean;
    /** Head actions offered on hover (`copy`, `retry`). */
    readonly tools?: TspToolProps["tools"];
}
```

### `NativeToolHead` structure

**Source:** `pi-tui/src/tools/renderer.ts:72-89`

```typescript
export interface NativeToolHead {
    /** The verb ("Bash", "Edit"); defaults to the tool's label. */
    readonly title?: TspText;
    /** The primary argument, shown once: command, path, pattern, query. */
    readonly target?: TspText;
    readonly targetKind?: TspToolProps["targetKind"];
    /** Language for `command` targets. */
    readonly lang?: string;
    /** `file://` link for path targets. */
    readonly href?: string;
    /** Short facts after the target (`+8 −1`, `5 matches · 2 files`). */
    readonly meta?: readonly TspText[];
    readonly badges?: TspToolProps["badges"];
    /** A one-word state note ("timed out", "partial"). */
    readonly note?: TspText;
    /** A non-zero exit code (error chip). */
    readonly exit?: number | null;
}
```

---

## 12. Making Tool Cards Look Native — `describeCall`/`describeResult` for TSP Terminals

### When to use describe vs render

- **`renderCall`/`renderResult`:** Return pi-tui `Component` objects. Used by the TUI transcript renderer. Full control over layout, but must handle all styling manually.
- **`describeCall`/`describeResult`:** Return `NativeToolView` semantic descriptions. Used by TSP (Tern Surface Protocol) terminals. The terminal handles frames, padding, width math. The renderer supplies only head data and body nodes.

**Key insight from `renderer.ts:129-133`:**
> When a renderer implements the describe hooks, the native backend never calls `renderCall`/`renderResult`.

### Pattern for native-looking tool cards

1. **Implement `describeCall`** to return a `NativeToolView` with:
   - `tool`: A `NativeToolHead` with `title` (verb), `target` (primary arg), `meta` (short facts)
   - `inline: true` for simple head-only views (pending state)
   - `body`: `NativeChild[]` for the result content

2. **Implement `describeResult`** to return a `NativeToolView` with:
   - `tool`: Updated head with result-specific meta (e.g., exit code, match count)
   - `body`: Result content as native nodes
   - `tone`: `"error"` for failed results

3. **Set `mergeCallAndResult: true`** on the renderer if the call and result should be merged into a single card (common for most tools)

4. **Use `inline: true`** for tools that should render without a background box (e.g., `grep`, `glob`, `find`)

### Example: Bash tool's describe hooks

**Source:** `pi-tui/src/tools/bash.ts:612-640`

```typescript
describeCall(args: TArgs, options: RenderResultOptions): NativeToolView {
    const command = formatBashCommandText(toBashRenderArgs(args, config));
    // The command shows once, in the head; the body is only the output.
    return {
        tool: {
            title: "Bash",
            target: command,
            lang: "bash",
        },
        inline: true,
    };
},

describeResult(result: ToolRenderResult<BashToolDetails>, options: RenderResultOptions, args?: TArgs): NativeToolView {
    const details = result.details;
    const renderContext = options.renderContext;
    const isError = result.isError === true;
    // ... builds body from result content
    return {
        tool: {
            title: "Bash",
            target: command,
            lang: "bash",
            exit: isError ? 1 : 0,
        },
        body: outputNodes,
        inline: true,
    };
},
```

### Example: Edit tool's describe hooks

**Source:** `pi-tui/src/tools/edit.ts:1152-1220`

```typescript
describeCall(args: EditRenderArgs, options: RenderResultOptions): NativeToolView {
    const renderContext = options.renderContext;
    const { rawPath, rename, op, fileCount, applyPatchError } = resolveEditCallFacts(args, ...);
    return {
        tool: {
            title: "Edit",
            target: rawPath,
            meta: [`${fileCount} file${fileCount !== 1 ? "s" : ""}`],
        },
        inline: true,
    };
},
```

---

## 13. `getMessageRenderer` — Custom Message Renderer Lookup

**Source:** `runner.ts:1280-1288`

```typescript
getMessageRenderer(customType: string): MessageRenderer | undefined {
    for (const ext of this.extensions) {
        const renderer = ext.messageRenderers.get(customType);
        if (renderer) {
            return renderer;
        }
    }
    return undefined;
}
```

Extensions register custom message renderers via `pi.registerMessageRenderer(customType, renderer)` (`types.ts:1559`). The runner looks up renderers by `customType` to render custom messages in the transcript.

---

## 14. `session-history-format.ts` — Fallback One-Liner for Custom Messages

**Source:** `session-history-format.ts:407-441`

```typescript
/** One-liner for custom/hook messages: `[irc] A → B: body…`. */
function customOneLiner(msg: CustomMessage | HookMessage): string {
    const details = (msg.details ?? {}) as Record<string, unknown>;
    const str = (key: string): string => (typeof details[key] === "string" ? (details[key] as string) : "");
    switch (msg.customType) {
        case "irc:incoming":
            return `[irc] ${str("from") || "?"} → me: ${oneLine(str("message"))}`;
        case "irc:relay":
            return `[irc] ${str("from") || "?"} → ${str("to") || "?"}: ${oneLine(str("body"))}`;
        case "irc:workpool":
            return `[pool] ${str("pool")} → ${str("to") || "?"}: ${oneLine(str("body"))}`;
        case "async-result": {
            const jobs = Array.isArray(details.jobs) && details.jobs.length > 0 ? details.jobs : [details];
            const labels = jobs
                .map(job => {
                    const j = (job ?? {}) as Record<string, unknown>;
                    return typeof j.label === "string" && j.label ? j.label : typeof j.jobId === "string" ? j.jobId : "job";
                })
                .join(", ");
            return `[async-result] ${oneLine(labels)}`;
        }
        case "image-attachment": {
            const text = contentToText(msg.content);
            const path = str("path") || LEGACY_IMAGE_ATTACHMENT_PATH.exec(text)?.[1];
            if (!path) return `[${msg.customType}] ${oneLine(text)}`;
            const index =
                typeof details.index === "number" ? details.index : (LEGACY_IMAGE_ATTACHMENT_INDEX.exec(text)?.[1] ?? "?");
            return `[image-attachment] Image #${index}: ${path}`;
        }
        default:
            return `[${msg.customType}] ${oneLine(contentToText(msg.content))}`;
    }
}
```

This is the fallback formatter for custom messages in the markdown transcript. It produces a one-line summary like `[irc] Alice → me: hello` or `[plan-mode-context] [PLAN MODE ACTIVE]...`.

---

## Summary

| Mechanism | API | Renders in transcript | Persisted to JSONL | Sent to LLM |
|-----------|-----|----------------------|--------------------|------------|
| `sendMessage({display: true})` | Extension API | Yes (immediate) | Yes | Yes |
| `sendMessage({display: false})` | Extension API | No (hidden) | Yes | Yes |
| `appendEntry(customType, data)` | Extension API | No | Yes (as `type: "custom"`) | No |
| `registerMessageRenderer(customType, renderer)` | Extension API | Yes (custom render) | No (renderer is runtime-only) | N/A |
| `renderCall`/`renderResult` | ToolDefinition | Yes (tool card) | No (runtime render) | N/A |
| `describeCall`/`describeResult` | ToolDefinition | Yes (TSP native) | No (runtime render) | N/A |
