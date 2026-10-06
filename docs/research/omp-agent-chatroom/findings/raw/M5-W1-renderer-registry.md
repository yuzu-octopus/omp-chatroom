# M5-W1: registerMessageRenderer — Signature, Invocation, Composition, No-UI Behaviour

> Research date: 2026-10-06
> Sources: `@oh-my-pi/pi-coding-agent` and `@oh-my-pi/pi-tui` packages in `~/.bun/install/global/node_modules/`

---

## 1. Verbatim `registerMessageRenderer` Signature

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

## 2. Verbatim `MessageRenderer` Type

**Source:** `pi-tui/src/chat/extension-types.ts:15-19`

```ts
export type MessageRenderer<T = unknown> = (
	message: CustomMessage<T>,
	options: MessageRenderOptions,
	theme: Theme,
) => Component | undefined;
```

---

## 3. Verbatim `MessageRenderOptions` Interface

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

## 7. No-UI Mode Behaviour (RPC / Print / ACP)

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

## 8. Fallback When Renderer Returns `undefined` or Throws

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
this.#box.addChild(new Markdown(text, 0, 0, getMarkdownTheme(), { ... }));
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

### Fallback card structure:

- **Header:** `icon + customType` (e.g., `📦 my-custom-type`) styled with `customMessageLabel` color
- **Body:** markdown-rendered `content` text
- **Border:** rounded box with `borderMuted` color (or custom `borderColor`)
- **Collapse:** only if `collapseAfterLines` is set (not set by default for `CustomMessageComponent`)

### `CustomMessageComponent` passes no `collapseAfterLines`

**Source:** `pi-tui/src/chat/custom-message.ts:10-24`

```ts
export class CustomMessageComponent extends FramedMessageComponent<CustomMessage<unknown>> {
	constructor(message: CustomMessage<unknown>, customRenderer?: MessageRenderer) {
		const isLiveDelegation = message.customType === LIVE_DELEGATION_MESSAGE_TYPE;
		const isHook = String(message.role) === "hookMessage";
		super({
			message,
			role: isHook ? "omp.hook" : isLiveDelegation ? "omp.custom.delegation" : "omp.custom",
			icon: () => (isHook ? theme.icon.extensionHook : theme.icon.package),
			hideHeader: isLiveDelegation,
			borderColor: isLiveDelegation ? "borderAccent" : undefined,
			customRenderer,
		});
	}
}
```

No `collapseAfterLines` is passed, so the fallback card is **not collapsible** for custom messages.

---

## Summary Table

| Aspect | Behaviour |
|---|---|
| **Signature** | `registerMessageRenderer<T>(customType: string, renderer: MessageRenderer<T>): void` |
| **Renderer type** | `(message: CustomMessage<T>, options: { expanded: boolean }, theme: Theme) => Component \| undefined` |
| **Invocation** | Only for `display: true`, `role: "custom"`, non-builtin `customType`, with registered renderer |
| **Expand/collapse** | Renderer re-invoked with new `expanded` value on ctrl+o toggle |
| **No-UI mode** | `registerMessageRenderer` is called but renderer is never invoked |
| **Fallback** | Returns `undefined` or throws → default card with icon + customType header + markdown body |
| **Fallback collapsible** | No (no `collapseAfterLines` passed by `CustomMessageComponent`) |
