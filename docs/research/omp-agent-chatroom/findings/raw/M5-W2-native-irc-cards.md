# M5-W2: Native IRC Cards in pi-tui / pi-coding-agent

> Research date: 2026-10-06
> Sources: `@oh-my-pi/pi-tui` and `@oh-my-pi/pi-coding-agent` (global bun install)

---

## 1. `createIrcMessageCard` — Verbatim Signature

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

The function returns a `Component` (renderable + `describe()` method). It is the single renderer for all four IRC card kinds.

---

## 2. Visual Shape

### 2.1 Title Format (wait.ts:534-541)

| kind | title template | example |
|------|---------------|---------|
| `incoming` | `IRC {nav.back} {from}` | `IRC ⟵ alice` |
| `autoreply` | `IRC {nav.selected} {to}` | `IRC ➤ bob` |
| `workpool` | `Pool {pool} {nav.selected} {to}` | `Pool workers ➤ agent-1` |
| `relay` | `IRC {from} {nav.selected} {to}` | `IRC alice ➤ bob` |

- `nav.back` = `⟵` (unicode), `<-` (ascii) — `pi-tui/src/theme/symbols.ts:407,1186`
- `nav.selected` = `➤` (unicode), `->` (ascii) — `pi-tui/src/theme/symbols.ts:404,1183`
- `from` falls back to `"?"` when missing (wait.ts:533)

### 2.2 Meta Badges (wait.ts:543-548)

Built as `string[]` in order:

1. `"auto"` — only for `autoreply` kind
2. `card.mode` — only for `workpool` kind when `mode` is set (e.g. `"spawned"`, `"dispatched"`, `"queued"`, `"batch"`, `"completed"`, `"cancelled"`)
3. `"reply"` — when `card.replyTo` is truthy
4. `age` — from `messageAge(card.timestamp)`, e.g. `"2m ago"`, `"1h ago"`

The age is computed by `formatAge(Math.max(1, Math.round((Date.now() - ts) / 1000)))` (wait.ts:478-481), imported from `@oh-my-pi/pi-utils`.

### 2.3 Body Rendering (wait.ts:553-555, 487-510)

Body lines are produced by `bodyLines(body, expanded, uiTheme, { indent: "  ", collapsedLines: 3 })`:

- **Quote border:** `theme.fg("dim", theme.md.quoteBorder)` — the `md.quoteBorder` symbol is `▏` (unicode), `│` (nerd font), or `|` (ascii) — `pi-tui/src/theme/symbols.ts:583,1046,1359`
- **Indent:** two spaces (`"  "`)
- **Line width cap:** `BODY_LINE_WIDTH = 100` — each line truncated to 100 chars with `Ellipsis.Unicode` (wait.ts:472,503)
- **Collapsed lines:** 3 (passed as `collapsedLines: 3`; default is `BODY_LINES_COLLAPSED = 2`)
- **Expanded lines:** `BODY_LINES_EXPANDED = 12` (wait.ts:471)
- **Hidden lines indicator:** `… +N more line(s)` in dim (wait.ts:507)
- **Tone:** `"toolOutput"` (default in bodyLines)
- **Tab handling:** `replaceTabs()` applied before truncation (wait.ts:503)

### 2.4 Width Handling (wait.ts:549-558)

The component is created via `createCachedComponent` with `{ paddingX: 1 }`:

- Inner width = `width - 2` (1 space padding each side)
- All lines (header + body) are truncated to `width` with `Ellipsis.Unicode` (wait.ts:556)
- Cache key = `Hasher().bool(expanded).u32(width).digest()` — re-renders only when width or expanded state changes

### 2.5 Header Line (wait.ts:552)

```ts
renderStatusLine({ iconOverride: ircGlyph(uiTheme), title, meta }, uiTheme)
```

- `ircGlyph` = `theme.styledSymbol("tool.irc", "accent")` — the `✉` symbol (unicode), `\uF086` (nerd font), or `#` (ascii) — `pi-tui/src/theme/symbols.ts:665,1134,1440`
- `renderStatusLine` (status-line.ts:33-55) outputs: `{icon} {title} {dim: meta.join(" · ")}`
- Meta separator: `sep.dot` = ` · ` (unicode), ` - ` (ascii) — `pi-tui/src/theme/symbols.ts:455,1233`

---

## 3. `buildIrcMessageCard` Wrapper

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

---

## 4. Dispatch in `chat-transcript-builder`

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

The builder checks `customType` against all four IRC types and delegates to `buildIrcMessageCard`. The `getExpanded` callback returns `this.#expanded` (the builder's expanded-state flag).

---

## 5. Native `describe()` Output

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

---

## 6. Fallback One-Liner Format

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

`oneLine()` (session-history-format.ts:110-113): collapses whitespace, truncates to `PRIMARY_ARG_MAX` chars with `…`.

---

## 7. Primitives Used

| Primitive | Source | Purpose |
|-----------|--------|---------|
| `renderStatusLine` | `pi-tui/src/render/status-line.ts:33` | Header line: icon + title + dim meta |
| `bodyLines` | `pi-tui/src/tools/wait.ts:487` | Quote-bordered body lines with collapse/expand |
| `createCachedComponent` | `pi-tui/src/render/render-utils.ts:1109` | Memoized render by width+expanded |
| `cardNode` (as `card`) | `pi-tui/src/native/describe.ts:41` | Native describe card node |
| `span` | `pi-tui/src/native/describe.ts:21` | Styled text span |
| `plainText` | `pi-tui/src/native/spans.ts` | Plain (unstyled) text |
| `text` | `pi-tui/src/native/describe.ts:26` | Text node |
| `md` | `pi-tui/src/native/describe.ts:46` | Markdown source node |
| `row` | `pi-tui/src/native/describe.ts:36` | Horizontal flex row |
| `elapsed` | `pi-tui/src/native/describe.ts:112` | Terminal-clocked elapsed counter |
| `compact` | `pi-tui/src/native/describe.ts:85` | Filter undefined/null/false from child list |
| `truncateToWidth` | `pi-tui/src/utils.ts:157` | Width truncation with ellipsis |
| `formatAge` | `@oh-my-pi/pi-utils` | Human-readable age (e.g. "2m ago") |
| `cappedHeadLines` | `pi-tui/src/render/render-utils.ts:225` | Leading line window + hidden count |

---

## 8. IRC Message Creation (pi-coding-agent)

### 8.1 `irc:incoming` — irc-bridge.ts:190-211

```ts
const record: CustomMessage = {
	role: "custom",
	customType: "irc:incoming",
	content: prompt.render(ircIncomingTemplate, { from, message: envelopeBody, replyTo, interrupting, relayOnStop }),
	display: true,
	details: {
		id: msg.id,
		from: msg.from,
		message: msg.body,
		...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
		...(msg.wakeRelay ? { wakeRelay: true } : {}),
		...(fromParent ? { fromParent: true } : {}),
	},
	attribution: "agent",
	timestamp: msg.ts,
};
```

Note: `details.message` holds the raw body (not `details.body`). The `content` field uses a prompt template for model-facing display.

### 8.2 `irc:relay` — bus.ts:336-344

```ts
const record: CustomMessage = {
	role: "custom",
	customType: "irc:relay",
	content: `[IRC \`${message.from}\` → \`${message.to}\`]\n\n${message.body}`,
	display: true,
	details: { from: message.from, to: message.to, body: message.body },
	attribution: "agent",
	timestamp: message.ts,
};
```

Emitted by `IrcBus.#relayToMainUi()` (bus.ts:332) when neither `from` nor `to` is `MAIN_AGENT_ID` — i.e., agent↔agent traffic that the main agent should observe but didn't send/receive directly.

### 8.3 `irc:workpool` — workpool.ts:607-615

```ts
const record: CustomMessage = {
	role: "custom",
	customType: "irc:workpool",
	content: `[pool ${this.name} → ${agentId}]\n\n${body}`,
	display: true,
	details: { pool: this.name, from: `pool:${this.name}`, to: agentId, body, mode },
	attribution: "agent",
	timestamp,
};
```

`mode` is one of: `"spawned"`, `"dispatched"`, `"queued"`, `"batch"`, `"completed"`, `"cancelled"` (workpool.ts:601).

### 8.4 `irc:autoreply` — RISK: no emitter found

The `irc:autoreply` customType is handled in the renderer (transcript-render-helpers.ts:133, chat-transcript-builder.ts:592) and in the one-liner fallback (session-history-format.ts:412), but **no emitter was found** in pi-coding-agent source. The only match is in `ui-helpers.ts:228` which is the same dispatch check. This type may be emitted by an external plugin or a newer version not present in this install.

---

## 9. Summary: Card Anatomy

```
✉ IRC ⟵ alice · reply · 2m ago     ← renderStatusLine header (icon + title + dim meta)
  ▏ body line 1                    ← bodyLines: quote-border + indent + toolOutput tone
  ▏ body line 2
  ▏ … +5 more lines                ← collapsed indicator (when collapsed)
```

- **Glyph:** `✉` (accent color)
- **Title:** `toolTitle strong` style
- **Meta:** `muted` style, dot-separated
- **Body:** `▏` quote border, 2-space indent, `toolOutput` tone
- **Collapsed:** 3 lines visible; expanded: 12 lines
- **Width:** truncated to component width with `…`
- **Padding:** 1 space each side
- **Native describe:** `omp.irc.*` role, `info` tone, collapsible, 3-line preview, elapsed counter + md body
