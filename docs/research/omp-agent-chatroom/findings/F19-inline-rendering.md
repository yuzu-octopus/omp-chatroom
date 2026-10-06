# F19: Inline Transcript Rendering — Custom Message Cards in the Session Scrollback

> Research date: 2026-10-06
> Sources: `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-tui` packages in `~/.bun/install/global/node_modules/`

---

## Angle

How plugin-authored messages and tool calls render in the main session transcript scrollback, matching the visual conventions of native IRC cards. Covers the `registerMessageRenderer` contract, native IRC card anatomy, transcript delivery APIs, persistence, mode fallbacks, and `renderCall`/`renderResult` for tool cards.

---

## 1. `registerMessageRenderer` — Verbatim Signature

**Source:** `pi-coding-agent/src/extensibility/extensions/types.ts:1559`

```ts
registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
```

**Implementation:** `pi-coding-agent/src/extensibility/extensions/loader.ts:269-271`

```ts
registerMessageRenderer<T>(customType: string, renderer: MessageRenderer<T>): void {
    this.extension.messageRenderers.set(customType, renderer as MessageRenderer);
}
```

The renderer is stored in `Extension.messageRenderers: Map<string, MessageRenderer>` (types.ts:1932).

---

## 2. `MessageRenderer` Type — Verbatim

**Source:** `pi-tui/src/chat/extension-types.ts:15-19`

```ts
export type MessageRenderer<T = unknown> = (
    message: CustomMessage<T>,
    options: MessageRenderOptions,
    theme: Theme,
) => Component | undefined;
```

---

## 3. `MessageRenderOptions` — Verbatim

**Source:** `pi-tui/src/chat/extension-types.ts:11-13`

```ts
export interface MessageRenderOptions {
    expanded: boolean;
}
```

---

## 4. Fields the Renderer Receives

### `message: CustomMessage<T>`

**Source:** `pi-tui/src/chat/messages.ts:229-238`

```ts
export interface CustomMessage<T = unknown> {
    role: "custom";
    customType: string;
    content: CustomMessageContent;
    display: boolean;
    details?: T;
    attribution?: MessageAttribution;
    timestamp: number;
}
```

Where `CustomMessageContent = string | (TextContent | ImageContent)[]` (messages.ts:39).

### `options: MessageRenderOptions`

- `expanded: boolean` — whether the transcript is currently expanded (ctrl+o toggled)

### `theme: Theme`

- The current pi-tui theme object, used for colors, icons, and styling.

---

## 5. When the Renderer Is Invoked

### Entry point: `ChatTranscriptBuilder.#appendCustomMessage`

**Source:** `pi-tui/src/chat/chat-transcript-builder.ts:563-627`

```ts
#appendCustomMessage(message: Extract<AgentMessage, { role: "custom" | "hookMessage" }>): void {
    if (!message.display) return;                         // (A) display:true required
    if (message.customType === "async-result") { ... }    // (B) built-in types handled first
    if (message.customType === LSP_LATE_DIAGNOSTIC_MESSAGE_TYPE) { ... }
    if (message.customType === COLLAB_PROMPT_MESSAGE_TYPE) { ... }
    if (message.customType === SKILL_PROMPT_MESSAGE_TYPE) { ... }
    if (message.customType === "irc:incoming" ||
        message.customType === "irc:autoreply" ||
        message.customType === "irc:relay" ||
        message.customType === "irc:workpool") { ... }     // (C) IRC types have own cards
    if (message.customType === "advisor") { ... }
    if (message.customType === LAUNCH_COMPLETION_MESSAGE_TYPE) { ... }
    if (message.customType === BACKGROUND_TAN_DISPATCH_MESSAGE_TYPE) { ... }
    // ... handoff check ...
    const component = new CustomMessageComponent(        // (D) generic path
        message as CustomMessage<unknown>,
        this.#deps.getMessageRenderer?.(message.customType),  // (E) renderer lookup
    );
    this.#trackExpandable(component);
    this.container.addChild(component);
}
```

### Invocation conditions:

1. **`message.display` must be `true`** — otherwise the message is skipped entirely (line 564).
2. **`message.role` must be `"custom"` or `"hookMessage"`** — the method is typed for those roles (line 563).
3. **The `customType` must NOT match any built-in type** — built-in types (irc:incoming, irc:relay, advisor, async-result, etc.) are handled by their own components before the generic `CustomMessageComponent` path is reached.
4. **A renderer must be registered for the `customType`** — `getMessageRenderer(customType)` returns `undefined` if none is registered, and the component falls back to the default card.

### Renderer lookup: `ExtensionRunner.getMessageRenderer`

**Source:** `pi-coding-agent/src/extensibility/extensions/runner.ts:1280-1288`

```ts
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

---

## 6. Composition with Ctrl+O Expand/Collapse

### The renderer receives the `expanded` flag

**Source:** `pi-tui/src/chrome/message-frame.ts:139-150`

```ts
#rebuild(): void {
    if (this.#disposed) return;
    this.#version++;
    let nextCustomComponent: Component | undefined;
    const customRenderer = this.#options.customRenderer;
    if (customRenderer) {
        try {
            nextCustomComponent = customRenderer(this.#options.message, { expanded: this.#expanded }, theme);
        } catch {
            // A broken extension renderer must not hide its persisted message.
        }
    }
    // ...
}
```

### The renderer is re-invoked on toggle

**Source:** `pi-tui/src/chrome/message-frame.ts:77-81`

```ts
setExpanded(expanded: boolean): void {
    if (this.#expanded === expanded) return;
    this.#expanded = expanded;
    this.#rebuild();   // re-invokes the renderer with new expanded value
}
```

### Transcript-wide ctrl+o propagates to all expandable components

**Source:** `pi-tui/src/chat/chat-transcript-builder.ts:143-146`

```ts
setExpanded(expanded: boolean): void {
    this.#expanded = expanded;
    for (const component of this.#expandables) component.setExpanded(expanded);
}
```

### Native toggle event handling

**Source:** `pi-tui/src/chrome/message-frame.ts:125-128` and `pi-tui/src/native/node.ts:230-232`

```ts
handleNativeEvent(event: NativeUiEvent): void {
    const expanded = rootToggleExpanded(event);
    if (expanded !== undefined) this.setExpanded(expanded);
}

// rootToggleExpanded:
export function rootToggleExpanded(event: NativeUiEvent): boolean | undefined {
    return event.type === "toggle" && event.key === "" ? !event.collapsed : undefined;
}
```

### Summary of expand/collapse composition:

- The renderer is called with `{ expanded: boolean }` in `MessageRenderOptions`.
- When ctrl+o is pressed, `ChatTranscriptBuilder.setExpanded()` calls `setExpanded()` on all tracked expandable components.
- `FramedMessageComponent.setExpanded()` triggers `#rebuild()`, which re-invokes the renderer with the new `expanded` value.
- The renderer can return a different component based on `expanded`, or return the same component (in which case `super.invalidate()` is called to trigger a re-render).

---

## 7. Fallback When Renderer Returns `undefined` or Throws

### Renderer returns `undefined`

**Source:** `pi-tui/src/chrome/message-frame.ts:152-206`

When `customRenderer()` returns `undefined`, `FramedMessageComponent` falls back to a default card:

```ts
// nextCustomComponent is undefined → skip custom component path
if (previousCustomComponent) {
    this.removeChild(previousCustomComponent);
    previousCustomComponent.dispose?.();
    this.#customComponent = undefined;
}
this.removeChild(this.#box);
for (const child of this.#box.children) child.dispose?.();
this.#box.clear();
this.#box.setBorder({
    chars: theme.boxRound,
    color: text => theme.fg(this.#options.borderColor ?? "borderMuted", text),
});

// Header: icon + customType
if (!hideHeader) {
    const icon = typeof this.#options.icon === "function" ? this.#options.icon() : this.#options.icon;
    const tag = icon ? `${icon} ${this.#options.message.customType}` : this.#options.message.customType;
    this.#box.addChild(new Text(theme.fg("customMessageLabel", theme.bold(tag)), 0, 0));
    this.#box.addChild(new Spacer(1));
}

// Body: markdown content
let text = this.#messageText();
// ... collapseAfterLines handling ...
this.#box.addChild(
    new Markdown(text, 0, 0, getMarkdownTheme(), {
        color: value => theme.fg("customMessageText", value),
    }),
);
this.addChild(this.#box);
```

### Renderer throws

**Source:** `pi-tui/src/chrome/message-frame.ts:145-149`

```ts
try {
    nextCustomComponent = customRenderer(this.#options.message, { expanded: this.#expanded }, theme);
} catch {
    // A broken extension renderer must not hide its persisted message.
}
```

The throw is caught, `nextCustomComponent` remains `undefined`, and the fallback card is used.

---

## 8. Native IRC Card Anatomy

### `createIrcMessageCard` — Verbatim Signature

**File:** `pi-tui/src/tools/wait.ts:519-532`

```ts
export function createIrcMessageCard(
    card: {
        kind: "incoming" | "autoreply" | "relay" | "workpool";
        from?: string;
        to?: string;
        body?: string;
        replyTo?: string;
        timestamp?: number;
        pool?: string;
        mode?: string;
    },
    getExpanded: () => boolean,
    uiTheme: Theme,
): Component {
```

### Visual Shape

#### Title Format (wait.ts:534-541)

| kind | title template | example |
|------|---------------|---------|
| `incoming` | `IRC {nav.back} {from}` | `IRC ⟵ alice` |
| `autoreply` | `IRC {nav.selected} {to}` | `IRC ➤ bob` |
| `workpool` | `Pool {pool} {nav.selected} {to}` | `Pool workers ➤ agent-1` |
| `relay` | `IRC {from} {nav.selected} {to}` | `IRC alice ➤ bob` |

- `nav.back` = `⟵` (unicode), `<-` (ascii) — `pi-tui/src/theme/symbols.ts:407,1186`
- `nav.selected` = `➤` (unicode), `->` (ascii) — `pi-tui/src/theme/symbols.ts:404,1183`
- `from` falls back to `"?"` when missing (wait.ts:533)

#### Meta Badges (wait.ts:543-548)

Built as `string[]` in order:

1. `"auto"` — only for `autoreply` kind
2. `card.mode` — only for `workpool` kind when `mode` is set (e.g. `"spawned"`, `"dispatched"`, `"queued"`, `"batch"`, `"completed"`, `"cancelled"`)
3. `"reply"` — when `card.replyTo` is truthy
4. `age` — from `messageAge(card.timestamp)`, e.g. `"2m ago"`, `"1h ago"`

The age is computed by `formatAge(Math.max(1, Math.round((Date.now() - ts) / 1000)))` (wait.ts:478-481), imported from `@oh-my-pi/pi-utils`.

#### Body Rendering (wait.ts:553-555, 487-510)

Body lines are produced by `bodyLines(body, expanded, uiTheme, { indent: "  ", collapsedLines: 3 })`:

- **Quote border:** `theme.fg("dim", theme.md.quoteBorder)` — the `md.quoteBorder` symbol is `▏` (unicode), `│` (nerd font), or `|` (ascii) — `pi-tui/src/theme/symbols.ts:583,1046,1359`
- **Indent:** two spaces (`"  "`)
- **Line width cap:** `BODY_LINE_WIDTH = 100` — each line truncated to 100 chars with `Ellipsis.Unicode` (wait.ts:472,503)
- **Collapsed lines:** 3 (passed as `collapsedLines: 3`; default is `BODY_LINES_COLLAPSED = 2`)
- **Expanded lines:** `BODY_LINES_EXPANDED = 12` (wait.ts:471)
- **Hidden lines indicator:** `… +N more line(s)` in dim (wait.ts:507)
- **Tone:** `"toolOutput"` (default in bodyLines)
- **Tab handling:** `replaceTabs()` applied before truncation (wait.ts:503)

#### Width Handling (wait.ts:549-558)

The component is created via `createCachedComponent` with `{ paddingX: 1 }`:

- Inner width = `width - 2` (1 space padding each side)
- All lines (header + body) are truncated to `width` with `Ellipsis.Unicode` (wait.ts:556)
- Cache key = `Hasher().bool(expanded).u32(width).digest()` — re-renders only when width or expanded state changes

#### Header Line (wait.ts:552)

```ts
renderStatusLine({ iconOverride: ircGlyph(uiTheme), title, meta }, uiTheme)
```

- `ircGlyph` = `theme.styledSymbol("tool.irc", "accent")` — the `✉` symbol (unicode), `\uF086` (nerd font), or `#` (ascii) — `pi-tui/src/theme/symbols.ts:665,1134,1440`
- `renderStatusLine` (status-line.ts:33-55) outputs: `{icon} {title} {dim: meta.join(" · ")}`
- Meta separator: `sep.dot` = ` · ` (unicode), ` - ` (ascii) — `pi-tui/src/theme/symbols.ts:455,1233`

### `buildIrcMessageCard` Wrapper

**File:** `pi-tui/src/chat/transcript-render-helpers.ts:118-152`

```ts
export function buildIrcMessageCard(message: CustomOrHookMessage, getExpanded: () => boolean): Component {
    const details = (message as CustomMessage<{...}>).details;
    const kind =
        message.customType === "irc:incoming"     ? ("incoming" as const)
        : message.customType === "irc:autoreply"  ? ("autoreply" as const)
        : message.customType === "irc:workpool"   ? ("workpool" as const)
        : ("relay" as const);
    return createIrcMessageCard(
        {
            kind,
            from: details?.from,
            to: details?.to,
            body: kind === "incoming" ? details?.message : details?.body,
            replyTo: details?.replyTo,
            timestamp: message.timestamp,
            pool: details?.pool,
            mode: details?.mode,
        },
        getExpanded,
        theme,
    );
}
```

Key detail: for `incoming` kind, the body is read from `details.message` (not `details.body`). For all other kinds, `details.body` is used.

### Dispatch in `chat-transcript-builder`

**File:** `pi-tui/src/chat/chat-transcript-builder.ts:590-597`

```ts
if (
    message.customType === "irc:incoming" ||
    message.customType === "irc:autoreply" ||
    message.customType === "irc:relay" ||
    message.customType === "irc:workpool"
) {
    this.container.addChild(buildIrcMessageCard(message, () => this.#expanded));
    return;
}
```

### Native `describe()` Output

**File:** `pi-tui/src/tools/wait.ts:561-579`

```ts
const described = cardNode(
    {
        role: `omp.irc.${card.kind}`,
        tone: "info",
        head: [
            span(plainText(title), "toolTitle strong"),
            ...meta.filter(part => part !== age).map(part => span(` ${part}`, "muted")),
        ],
        collapsible: body.trim().length > 0,
        preview: { lines: 3 },
    },
    compact([
        card.timestamp
            ? row([elapsed(Date.now() - card.timestamp), text([span("ago", "dim")])], { gap: "xs" })
            : undefined,
        body.trim() ? md(body) : undefined,
    ]),
);
return Object.assign(component, { describe: () => described });
```

Structure:
- **role:** `omp.irc.incoming` / `omp.irc.autoreply` / `omp.irc.relay` / `omp.irc.workpool`
- **tone:** `"info"`
- **head:** title span (`toolTitle strong`) + meta spans (`muted`, age excluded)
- **collapsible:** true when body is non-empty
- **preview:** 3 lines
- **children:**
  - `row([elapsed(...), text("ago")], { gap: "xs" })` — live-updating elapsed counter (only when timestamp present)
  - `md(body)` — markdown-rendered body (only when body non-empty)

### Fallback One-Liner Format

**File:** `pi-coding-agent/src/session/session-history-format.ts:407-441`

```ts
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
        // ...
    }
}
```

### Card Anatomy Summary

```
✉ IRC ⟵ alice · reply · 2m ago     ← renderStatusLine header (icon + title + dim meta)
  ▏ body line 1                    ← bodyLines: quote-border + indent + toolOutput tone
  ▏ body line 2
  ▏ … +5 more lines                ← collapsed indicator (when collapsed)
```

- **Glyph:** `✉` (accent color)
- **Title:** `IRC ⟵ alice` (incoming) or `IRC alice ➤ bob` (relay)
- **Meta:** `reply · 2m ago` (dim, dot-separated)
- **Body:** quote-bordered, 3 lines collapsed, 12 lines expanded
- **Native describe:** `omp.irc.*` role, `info` tone, collapsible, 3-line preview, elapsed counter + md body

---

## 9. Proposed Room Card Types

### Card Spec Table

| customType | Collapsed Card | Expanded Card |
|------------|---------------|---------------|
| `room:message` | `✉ room ⟵ author · 2m ago` + 3 lines of quote-bordered body | Full body (12 lines), reply-to indicator, timestamp |
| `room:mention` | `✉ room ⟵ author → me · reply` + 3 lines | Full body, parent message ref, timestamp |
| `room:claim` | `⚑ room claim: agent-1 → task-42` + status badge | Full claim details, job snapshot, duration |
| `room:board-delta` | `▦ room board: +2 claims, -1 completed` | Full delta table, per-claim status |

### Primitives Available

| Primitive | Source | Purpose |
|-----------|--------|---------|
| `Text` | `pi-tui/src/components/text.ts` | Styled text runs |
| `Box` | `pi-tui/src/components/box.ts` | Bordered container |
| `Markdown` | `pi-tui/src/components/markdown.ts` | Markdown-rendered body |
| `Spacer` | `pi-tui/src/components/spacer.ts` | Horizontal spacing |
| `renderStatusLine` | `pi-tui/src/render/status-line.ts:33` | Header line: icon + title + dim meta |
| `bodyLines` | `pi-tui/src/tools/wait.ts:487` | Quote-bordered body lines with collapse/expand |
| `createCachedComponent` | `pi-tui/src/render/render-utils.ts:1109` | Memoized render by width+expanded |
| `card` (cardNode) | `pi-tui/src/native/describe.ts:41` | Native describe card node |
| `span` | `pi-tui/src/native/describe.ts:21` | Styled text span |
| `md` | `pi-tui/src/native/describe.ts:46` | Markdown source node |
| `row` | `pi-tui/src/native/describe.ts:36` | Horizontal flex row |
| `elapsed` | `pi-tui/src/native/describe.ts:112` | Terminal-clocked elapsed counter |
| `compact` | `pi-tui/src/native/describe.ts:85` | Filter undefined/null/false from child list |
| `truncateToWidth` | `pi-tui/src/utils.ts:157` | Width truncation with ellipsis |
| `formatAge` | `@oh-my-pi/pi-utils` | Human-readable age (e.g. "2m ago") |
| `cappedHeadLines` | `pi-tui/src/render/render-utils.ts:225` | Leading line window + hidden count |

### Renderer Pattern for Room Cards

```ts
pi.registerMessageRenderer("room:message", (message, options, theme) => {
    const details = message.details as { from: string; body: string; replyTo?: string };
    const from = details?.from || "?";
    const title = `room ${theme.nav.back} ${from}`;
    const meta: string[] = [];
    if (details?.replyTo) meta.push("reply");
    const age = messageAge(message.timestamp);
    if (age) meta.push(age);
    
    return createCachedComponent(
        options.expanded,
        (width, expanded) => {
            const lines = [renderStatusLine({ iconOverride: ircGlyph(theme), title, meta }, theme)];
            if (details?.body?.trim()) {
                lines.push(...bodyLines(details.body, expanded, theme, { indent: "  ", collapsedLines: 3 }));
            }
            return lines.map(line => truncateToWidth(line, width, Ellipsis.Unicode));
        },
        { paddingX: 1 },
    );
});
```

---

## 10. Transcript Delivery — APIs

### `sendCustomMessage` — Verbatim Signature

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

### `sendMessage` — Verbatim Signature (Extension API)

**Source:** `types.ts:1592-1595`

```typescript
sendMessage<T = unknown>(
    message: CustomMessagePayload<T>,
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" | "aside" },
): void;
```

**Doc comment** (`types.ts:1576-1591`):
> With the default delivery (no `deliverAs`), an idle `display: true` message renders in the transcript immediately, even with `triggerTurn: false`, without starting a turn. This does not apply to `deliverAs: "nextTurn"` or `deliverAs: "aside"`, which keep the semantics described below (`nextTurn` stays hidden until consumed; `aside` starts a turn when idle).

### `appendEntry` — Verbatim Signature

**Source:** `types.ts:1603`

```typescript
/** Append a custom entry to the session for state persistence (not sent to LLM). */
appendEntry<T = unknown>(customType: string, data?: T): void;
```

**Key distinction:** `appendEntry` writes a `type: "custom"` entry (NOT `custom_message`). It is for state persistence only — the entry is NOT sent to the LLM and does NOT render in the transcript. For transcript-visible cards, use `sendMessage`.

### `CustomMessagePayload` Type

**Source:** `pi-tui/src/chat/messages.ts:42-44`

```typescript
/** Public input accepted by `pi.sendMessage` and `AgentSession.sendCustomMessage`. */
export type CustomMessagePayload<T = unknown> =
    | string
    | Partial<Pick<CustomMessage<T>, "customType" | "content" | "display" | "details" | "attribution">>;
```

---

## 11. `display: true` vs `display: false` — Behaviour

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

## 12. JSONL Persistence and Resume

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

## 13. No-UI Mode Fallback (RPC / Print / ACP)

### Extensions ARE loaded in all modes

**Source:** `pi-coding-agent/src/sdk.ts:2609`

```ts
extensionsResult = await logger.time("loadExtensions", loadExtensions, extensionPaths, cwd, eventBus);
```

This runs regardless of mode (print, RPC, ACP, TUI).

### Extensions ARE initialized in no-UI modes

**Source:** `pi-coding-agent/src/modes/runtime-init.ts:56-213`

`initializeExtensions()` is called by:
- **Print mode:** `print-mode.ts:161` — `mode: "print"`
- **RPC mode:** `rpc-mode.ts:1492` — `mode: "rpc"`
- **ACP mode:** `acp-agent.ts:2564` — `mode: "acp"` (via `extensionRunner.initialize()`)

### `registerMessageRenderer` IS called in no-UI mode

The extension's `registerMessageRenderer()` runs during extension load (inside the extension's `activate()` function). It stores the renderer in the `Extension.messageRenderers` Map. This happens regardless of mode.

### But the renderer is NEVER invoked in no-UI mode

The renderer is only invoked by `FramedMessageComponent.#rebuild()`, which is part of the pi-tui component tree. In no-UI modes:
- **Print mode:** Custom messages are formatted as one-liners via `customOneLiner()` in `session-history-format.ts:408-441`.
- **RPC mode:** Custom messages are emitted as JSON events via `printableEvent()` in `print-mode.ts:75-104`.
- **ACP mode:** Custom messages are handled by the ACP protocol layer.

There is no `FramedMessageComponent` instantiation in no-UI modes, so the renderer function is never called.

### RISK: Renderer side-effects in no-UI mode

If an extension's renderer function has side effects (e.g., logging, state mutation), those side effects will NOT execute in no-UI mode. The renderer is purely a UI concern.

---

## 14. `renderCall` / `renderResult` — Tool Card Contract

### `ToolDefinition` Interface — Verbatim

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
    /** Previous public name when a rename changed minted. Forwarded through
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

### `RenderResultOptions` — Verbatim

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

### `ToolRenderResultOptions` (Extension API variant)

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

### Making Tool Cards Look Native

To make tool cards look native, implement `describeCall` and `describeResult` for TSP terminals. These return `NativeToolView` objects that follow the same card structure as native tools:

```ts
describeCall: (args, options) => ({
    head: toolHead("Room"),
    tone: "info",
    body: [text([span(plainText(`claim: ${args.taskId}`), "toolOutput")])],
}),
```

---

## 15. `plan-mode.ts` Worked Example

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
```

### `sendMessage` usage (display: true, triggerTurn: true)

```typescript
// Line 480-487: Execute plan message
pi.sendMessage(
    {
        customType: "plan-mode-execute",
        content: execMessage,
        display: true,
    },
    { triggerTurn: true },
);
```

### `appendEntry` usage (state persistence)

```typescript
// Line 528-532: Persist plan mode state
pi.appendEntry("plan-mode", {
    enabled: planModeEnabled,
    todos: todoItems,
    executing: executionMode,
});
```

### Key patterns from plan-mode.ts:

1. **`sendMessage` with `display: true`** — renders in transcript immediately when idle
2. **`sendMessage` with `triggerTurn: false`** — does not start a turn
3. **`sendMessage` with `triggerTurn: true`** — starts a turn (for agent-initiated actions)
4. **`appendEntry`** — persists state without rendering (survives resume, not sent to LLM)
5. **`pi.on("agent_end")`** — hook for post-turn actions
6. **`pi.on("session_start")`** — hook for state restoration from `appendEntry`

---

## Conflicting evidence

- **`irc:autoreply` emitter not found:** The `irc:autoreply` customType is handled in the renderer (transcript-render-helpers.ts:133, chat-transcript-builder.ts:592) and in the one-liner fallback (session-history-format.ts:412), but no emitter was found in pi-coding-agent source. This type may be emitted by an external plugin or a newer version not present in this install. — confidence: primary

---

## Gaps

- **No `renderCall`/`renderResult` example in plan-mode.ts:** The plan-mode extension does not register custom tools with `renderCall`/`renderResult`. The worked example only covers `sendMessage` and `appendEntry`. — confidence: primary
- **No room card renderer example:** The native IRC card renderer (`createIrcMessageCard`) is the closest analog, but no plugin-authored card renderer was found in the examples. — confidence: primary

---

## Risks

| Risk | Fallback |
|------|----------|
| Renderer throws at runtime | `FramedMessageComponent` catches the throw and falls back to default card (message-frame.ts:145-149) — confidence: primary |
| Renderer returns `undefined` | `FramedMessageComponent` falls back to default card with type tag + markdown body (message-frame.ts:152-206) — confidence: primary |
| `registerMessageRenderer` not called in no-UI mode | Renderer is registered but never invoked; custom messages degrade to one-liner format (session-history-format.ts:408-441) — confidence: primary |
| `display: false` not rendered | Entry persists in JSONL but not painted; LLM still sees it (agent-session.ts:8493) — confidence: primary |
| `irc:autoreply` emitter not found | Type is handled in renderer but no emitter exists in this version; may be external plugin — confidence: primary |
| Room card customType conflicts with built-in | Built-in types are checked first in `#appendCustomMessage`; room types (`room:*`) do not conflict — confidence: primary |
| `renderCall`/`renderResult` not implemented for TSP | Tool cards fall back to default renderer; `describeCall`/`describeResult` needed for native TSP rendering — confidence: primary |

---

## Searches

- `registerMessageRenderer` — `pi-coding-agent/src/extensibility/extensions/types.ts:1559`, `loader.ts:269-271`, `runner.ts:1280-1288`
- `MessageRenderer` type — `pi-tui/src/chat/extension-types.ts:15-19`
- `MessageRenderOptions` — `pi-tui/src/chat/extension-types.ts:11-13`
- `CustomMessage` interface — `pi-tui/src/chat/messages.ts:229-238`
- `FramedMessageComponent` — `pi-tui/src/chrome/message-frame.ts:60-207`
- `ChatTranscriptBuilder.#appendCustomMessage` — `pi-tui/src/chat/chat-transcript-builder.ts:563-627`
- `createIrcMessageCard` — `pi-tui/src/tools/wait.ts:519-580`
- `buildIrcMessageCard` — `pi-tui/src/chat/transcript-render-helpers.ts:118-152`
- `bodyLines` — `pi-tui/src/tools/wait.ts:487-510`
- `sendCustomMessage` — `pi-coding-agent/src/session/agent-session.ts:8324-8509`
- `sendMessage` — `pi-coding-agent/src/extensibility/extensions/types.ts:1592-1595`
- `appendEntry` — `pi-coding-agent/src/extensibility/extensions/types.ts:1603`
- `ToolDefinition` — `pi-coding-agent/src/extensibility/extensions/types.ts:669-744`
- `RenderResultOptions` — `pi-tui/src/tools/renderer.ts:12-29`
- `ToolRenderResultOptions` — `pi-coding-agent/src/extensibility/extensions/types.ts:638-646`
- `customOneLiner` — `pi-coding-agent/src/session/session-history-format.ts:407-441`
- `plan-mode.ts` — `pi-coding-agent/examples/extensions/plan-mode.ts:209-549`
- `matchesAppToolsExpand` — `pi-tui/src/keybinding-matchers.ts:22-29`
- `app.tools.expand` keybinding — `pi-tui/src/app-keybindings.ts:132-135`
