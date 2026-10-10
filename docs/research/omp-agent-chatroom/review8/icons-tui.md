# Icons & TUI audit — room-rendered strings (review8/AuditIconsTUI)

> Scope: `plugin/src/attention/delivery.ts`, `plugin/src/attention/governor.ts`, `plugin/src/panel/*.ts`, `plugin/src/cards/*.ts`,
> plus the host conventions in `@oh-my-pi/pi-tui` (`src/tools/wait.ts`, `src/render/status-line.ts`,
> `src/theme/symbols.ts`, `src/theme/theme-class.ts`, `src/overlays/agent-hub-renderer.ts`, `src/chrome/overlay-box.ts`)
> and `@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts`.
> Read-only on `plugin/src/**`; every claim carries a `file:line` or a command I actually ran.

---

## 0. Verdict up front

1. **The reported defect is not in the delivery line.** `renderLine` emits exactly ONE `U+0020` on
   each side of the `⟵`, which is the byte-exact spacing the host IRC card uses
   (`plugin/src/attention/delivery.ts:105` vs `pi-tui/src/tools/wait.ts:545` +
   `pi-tui/src/render/status-line.ts:38`). There is no missing space around the icon.
2. **`⟵` (U+27F5) is deliberate and correct — it is the host's own `nav.back` glyph**
   (`symbols.ts:407`), not a room invention. It measures **1 cell**.
3. **All room glyphs measure 1 cell.** No width defect anywhere in the room surface set.
4. **The tier badge `[T1]` is the right form for model-facing text and the WRONG form for TUI**
   (TUI must use `badge: {label, color}` so the theme's brackets win: `⟦T1⟧` / `⟨T1⟩` / `[T1]`).
5. **Real defects found (6), all of them in the TUI surfaces** — the panel chat row double-spaces its
   `·`, its unread cursor abuts the tier badge, and its badge is a glyph-free ASCII string; three card
   headers pass literal glyphs to `iconOverride` where the host passes theme symbols 28/28 times; the
   theme fallback shim leaks JS source into the panel.

---

## 1. Spacing verdict — byte-for-byte

Both strings below were produced by **executing the real code** (not transcribed), then dumped
codepoint-by-codepoint:

```
$ bun -e 'const {renderLine,roomBodyOf}=await import(".../src/attention/delivery.ts");
           renderLine({kind:"msg",seq:1,ts:0,from:"SwarmAlpha",topic:"swarm",body:"body text",id:"m1"},
                      roomBodyOf(/*same*/), "T1")'
"[T1] room ⟵ SwarmAlpha · topic:swarm · body text"

$ bun -e 'const {renderStatusLine}=await import(".../pi-tui/src/render/status-line.ts");
           renderStatusLine({iconOverride:"✉", title:"IRC ⟵ SwarmAlpha", meta:["reply","2m ago"]},
                            {fg:(c,t)=>t, sep:{dot:" · "}, nav:{back:"⟵"}})'
"✉ IRC ⟵ SwarmAlpha reply · 2m ago"
```

Codepoint dump (`.` = U+0020):

| # | room `renderLine` (`delivery.ts:105`) | native IRC card (`wait.ts:562` → `status-line.ts:38`) |
|---|---|---|
| 0 | `[` `T` `1` `]` ← tier slot | `✉` (U+2709) ← glyph slot |
| 1 | `.` | `.` |
| 2 | `r` `o` `o` `m` | `I` `R` `C` |
| 3 | `.` | `.` |
| 4 | **`⟵` (U+27F5)** | **`⟵` (U+27F5)** |
| 5 | `.` | `.` |
| 6 | `SwarmAlpha` | `SwarmAlpha` |
| 7 | `.` `·`(U+00B7) `.` | `.` `r` `e` `p` `l` `y` |
| 8 | `topic:swarm` | `.` `·`(U+00B7) `.` |
| 9 | `.` `·`(U+00B7) `.` | `2` `m` `.` `a` `g` `o` |
| 10 | `body` `text` | |

**Verdict: the spacing is correct and is not the defect.** The room line's arrow is flanked by exactly
one `U+0020` on each side and its separators are `SP U+00B7 SP` — the identical shape the host's status
line produces, because the host's own meta separator `sep.dot` already *carries* its flanking spaces
(`theme/symbols.ts:455` → `" · "`; rendered at `status-line.ts:51`).

The other two room-rendered strings with an icon, produced the same way:

```
selectT0(pending 52, ceiling 50).summaryLine   →  "[T0] room ⟵ 52 interrupts batched (ceiling 50) — read with room{op:\"read\"}"
coalescePending(...)                           →  "room ⟵ 20 new message(s) in swarm — read with room{op:\"read\", since:0}"
wait-for-message.ts:165                        →  "wait_for_message ⟵ <from> · topic:<t> · \"<body>\""
```

All three use the same `SP ⟵ SP`. **No missing space exists in any room-rendered string.**

### Where the missing space actually is

`plugin/src/panel/chat-pane.ts:106-108` — the one row surface with a genuine spacing defect:

```ts
const head =
  `${unread}${badge} ${time} ${indent}${author} ${theme.fg("dim", "›")} ` +
  `${theme.fg("muted", sanitizeText(row.topic))} ${theme.sep.dot} ${body}`;
```

`theme.sep.dot` is already `" · "` (`symbols.ts:455`), so `" " + sep.dot + " "` renders **two** spaces on
each flank, and `${unread}${badge}` renders the cursor glyph hard against the badge with **zero** spaces.
Executed output (unread row, unicode preset values):

```
"❯T0 01:49:59 SwarmAlpha › swarm  ·  hello                   "   ← 2 cells each side of ·
" T1 01:49:59 │├─Beta › swarm  ·  world                        "
   ^ zero-width gap between ❯ and T0
```

---

## 2. Measured display width — every glyph in the room surfaces

Measured with `Bun.stringWidth`, which is what the host's `visibleWidth` delegates to for any string
that is not pure ASCII (`pi-tui/src/utils.ts:340`; ASCII fast path `utils.ts:348`). The room's panel
measures with that same `visibleWidth` (`chat-pane.ts:82-88`, `chrome.ts:16-24`), so these numbers are
the ones the layout code uses.

| Glyph | Codepoint(s) | Used at | Width | Source of the glyph |
|---|---|---|---|---|
| `⟵` | U+27F5 | `delivery.ts:105`, `governor.ts:56`, `governor.ts:221`, `wait-for-message.ts:165` | **1** | host `nav.back`, unicode preset (`symbols.ts:407`) |
| `✉` | U+2709 | `message-cards.ts:109`, `message-cards.ts:143` | **1** | host `tool.irc` via `styledSymbol` (`symbols.ts:665`) |
| `❯` | U+276F | `chat-pane.ts:97` (`theme.nav.cursor`) | **1** | host `nav.cursor` (`symbols.ts:403`) |
| `✘` | U+2718 | not used yet — proposed tier badge (`theme.status.error`) | **1** | host `status.error` (`symbols.ts:392`) |
| `⚠` | U+26A0 | not used yet — proposed tier badge (`theme.status.warning`) | **1** | host `status.warning` (`symbols.ts:393`) |
| `ⓘ` | U+24D8 | not used yet — proposed tier badge (`theme.status.info`) | **1** | host `status.info` (`symbols.ts:394`) |
| `·` | U+00B7 | every model-facing line; the value of `theme.sep.dot` | **1** | host `sep.dot` (`symbols.ts:455`) |
| `›` | U+203A | `chat-pane.ts:107` | **1** | **room-invented — no host key** |
| `│` | U+2502 | `panel.ts:68` (`BORDER`), `panel.ts:338` (shim) | **1** | host `boxRound.vertical` (`symbols.ts:426`) |
| `├─` | U+251C U+2500 | `theme.tree.branch` via `chat-pane.ts:104` | **2** (2 codepoints) | host `tree.branch` (`symbols.ts:409`) |
| `⚑` | U+2691 | `message-cards.ts:171` (claim card `iconOverride`) | **1** | **room-invented — no host key** |
| `▦` | U+25A6 | `message-cards.ts:207`, `tool-cards.ts:28` | **1** | **room-invented — no host key** |
| `✕` | U+2715 | `message-cards.ts:185` (release detail row) | **1** | **room-invented — no host key** |
| `➤` | U+27A4 | `message-cards.ts:136` (`"➤ me"`) | **1** | host `nav.selected` (`symbols.ts:404`) — same codepoint, hardcoded |
| `◷` | U+25F7 | `tool-cards.ts:28` (wait cards) | **1** | **room-invented — no host key** |
| `→` | U+2192 | `room.ts` board/roster lines, `message-cards.ts:177` | **1** | room convention |
| `…` | U+2026 | `digest.ts:54`, `body-lines.ts:42`, `room.ts` tail | **1** | room convention |
| `—` | U+2014 | `governor.ts:56`, `governor.ts:151`, `governor.ts:221` | **1** | room convention |
| `⟦` `⟧` | U+27E6 U+27E7 | not used — host badge brackets, unicode | **1 / 1** | host `format.bracketLeft/Right` (`symbols.ts:580-581`) |
| `⟨` `⟩` | U+27E8 U+27E9 | not used — host badge brackets, nerd | **1 / 1** | host `format.bracketLeft/Right` (`symbols.ts:1041-1043`) |
| `▏` | U+258F | `body-lines.ts:26` (`theme.md.quoteBorder`) | **1** | host `md.quoteBorder` (`symbols.ts:583`) |
| `📌` | U+1F4CC | not used — proposed claim-card icon (`icon.pin`) | **2** ⚠ | host `icon.pin` (`symbols.ts:473`) |
| `⏱` | U+23F1 | not used — proposed wait-card icon (`icon.time`) | **1** | host `icon.time` (`symbols.ts:480`) |

**Conclusion: no glyph in the room set is width-wrong.** Every glyph the room uses is genuinely 1 cell;
the only 2-cell measurements in the whole set are a two-codepoint string (`├─`, from the theme itself)
and the emoji `📌`, which is 2 cells *by design* and only ever proposed, never used.

### Is `⟵` (U+27F5) a deliberate TEXT glyph?

Yes — and it is the host's own choice, not the room's. `U+27F5 LONG LEFTWARDS ARROW` is category `Sm`
(math symbol), East-Asian-Width `N` (neutral) — a **text** glyph, not a Nerd Font private-use glyph. It
is exactly the value the host ships for `nav.back` in the **unicode** symbol preset
(`symbols.ts:407`).

The host ships three tiers for the *same* key, so the "right" glyph is preset-relative:

| Preset | `nav.back` | `tool.irc` | `status.error` | `status.warning` | `status.info` | `sep.dot` | `format.bracketLeft` |
|---|---|---|---|---|---|---|---|
| `unicode` (`symbols.ts:391-583`) | `⟵` U+27F5 | `✉` U+2709 | `✘` U+2718 | `⚠` U+26A0 | `ⓘ` U+24D8 | `" · "` | `⟦` U+27E6 |
| `nerd` (`symbols.ts:689-1043`) | `U+F060` | `U+F086` | `U+F00D` | `U+F12A` | `U+F129` | `" · "` | `⟨` U+27E8 |
| `ascii` (`symbols.ts:1171-1357`) | `"<-"` | `"#"` | `"[!!]"` | `"[!]"` | `"[i]"` | `" - "` | `"["` |

**The nerd-font equivalent of `⟵` is `U+F060`** (`symbols.ts:723`), the FontAwesome `long_arrow_left`
private-use glyph. It measures **1 cell** (verified) — as do all private-use Nerd Font glyphs, because
`Bun.stringWidth` counts PUA codepoints as width 1 and Nerd Fonts draw them in one cell. Either glyph
is width-safe, so the room's choice of the unicode-tier value costs nothing in *width*.

What it does cost is consistency: on a `nerd`- or `ascii`-preset terminal the TUI renders ` ` / `<-`
while the model-facing text still says `⟵`. The TUI half is already correct — `message-cards.ts:110`
and `:144` read `theme.nav.back` — but the four model-facing sites hardcode the codepoint
(`delivery.ts:105`, `governor.ts:56`, `governor.ts:221`, `wait-for-message.ts:165`). Those sites have no
`Theme` in scope, so the hardcode is unavoidable there; see D6 for the landing spot (name the constant
once, stop duplicating the literal).

---

## 3. How the native IRC widget does it — verbatim

The native IRC card (`createIrcMessageCard`, `~/.bun/install/global/node_modules/@oh-my-pi/pi-tui/src/tools/wait.ts:533-587`)
never builds its header by hand. Three pieces compose it:

**The glyph** (`wait.ts:484-486`):

```ts
function ircGlyph(theme: Theme): string {
	return theme.styledSymbol("tool.irc", "accent");
}
```

**The title** (`wait.ts:544-552`, incoming shown):

```ts
const title =
    card.kind === "incoming"
        ? `IRC ${uiTheme.nav.back} ${from}`
        : card.kind === "autoreply"
            ? `IRC ${uiTheme.nav.selected} ${card.to?.trim() || "?"}`
            ...
```

**The render** (`wait.ts:559-567`):

```ts
const component = createCachedComponent(
    getExpanded,
    (width, expanded) => {
        const lines = [renderStatusLine({ iconOverride: ircGlyph(uiTheme), title, meta }, uiTheme)];
        if (body.trim()) {
            lines.push(...bodyLines(body, expanded, uiTheme, { indent: "  ", collapsedLines: 3 }));
        }
        return lines.map(line => truncateToWidth(line, width, Ellipsis.Unicode));
    },
    { paddingX: 1 },
);
```

**And the status-line composer** that turns those options into the actual string
(`pi-tui/src/render/status-line.ts:33-53`) — this is the spacing contract, quoted in full:

```ts
export function renderStatusLine(options: StatusLineOptions, theme: Theme): string {
	const icon =
		options.iconOverride ?? (options.icon ? formatStatusIcon(options.icon, theme, options.spinnerFrame) : "");
	const titleColor = options.titleColor ?? "accent";
	const title = theme.fg(titleColor, flattenForHeader(options.title));
	let line = icon ? `${icon} ${title}` : title;              // ← exactly ONE space after the icon

	if (options.description) {
		line += `: ${theme.fg("muted", flattenForHeader(options.description))}`;
	}

	if (options.badge) {
		const { label, color } = options.badge;
		line += ` ${theme.fg(color, `${theme.format.bracketLeft}${flattenForHeader(label)}${theme.format.bracketRight}`)}`;
	}

	const meta = options.meta?.map(flattenForHeader).filter(value => value.trim().length > 0) ?? [];
	if (meta.length > 0) {
		line += ` ${theme.fg("dim", meta.join(theme.sep.dot))}`;   // ← ONE space, then sep.dot (already " · ")
	}

	return line;
}
```

So the host's canonical chat row is:

```
<theme glyph><U+0020><title, words joined by single U+0020><U+0020><meta joined by sep.dot>
```

with `sep.dot` supplying its own flanking spaces (`symbols.ts:455`). **The room's `renderLine` follows
this contract exactly.** The room's *panel* row does not (§1) and its *cards* half-follow it (the two
message/mention cards use `theme.nav.back` + `styledSymbol` correctly, then hand literal glyphs to
`iconOverride` elsewhere — D4).

One more host detail the room cites but does not currently match: the native card passes
`collapsedLines: 3` explicitly (`wait.ts:564`) even though its module default is `BODY_LINES_COLLAPSED
= 2` (`wait.ts:480`) — the room's `COLLAPSED_QUOTE_LINES = 3` (`body-lines.ts:42`) matches the *call
site*, which is the right thing to match, but the doc comment's line range (`wait.ts:487-510`) has
drifted; `bodyLines` now spans `wait.ts:497-520`.

---

## 4. Tier badge — is `[T1]` the right form?

Three answers, one per surface.

**Model-facing delivery line — `[T1]` is correct as-is.** `renderLine` (`delivery.ts:105`) has no
`Theme` in scope, and the ASCII bracket pair is not a defect: it is *exactly* what the host's own badge
renderer emits under the `ascii` symbol preset, because `theme.format.bracketLeft/Right` = `[`/`]`
there (`symbols.ts:1356-1357`) and the badge is drawn at `status-line.ts:44-46`. Executed side by side
(the nerd line's private-use codepoints are written as escapes; they are invisible in most viewers):

```
unicode preset : "✉ room ⟵ SwarmAlpha ⟦T0⟧ ➤ me · 2m ago"    U+2709 U+0020 … U+27F5 … U+27E6 T 0 U+27E7 U+0020 U+27A4 me …
nerd preset    : "\uF086 room \uF060 SwarmAlpha ⟨T0⟩ ➤ me · 2m ago"   U+F086 U+0020 … U+F060 … U+27E8 T 0 U+27E9 …
ascii preset   : "# room <- SwarmAlpha [T0] ➤ me - 2m ago"   # U+0020 … <- … [ T 0 ] … - …
```

The plan's mapping (`T0=status.error`, `T1=status.warning`, `T2=status.info/muted`) is a **tone**
mapping, and the room already implements the tone half correctly in the panel
(`chat-pane.ts:28-32`: `T0:"error"`, `T1:"warning"`, `T2:"muted"`). The glyph half is missing.

**Panel chat row — `[T1]` is the wrong form.** `chat-pane.ts:98` paints the literal string
`row.tier` (i.e. `T0`/`T1`/`T2`, 2 ASCII cells) in the tier tone. The theme owns status glyphs for
exactly these three severities, each 1 cell, and each with a matching *tone* — so the badge can be one
cell instead of two, and it stops being the only element on the row that is not theme-sourced:

| Tier | Tone (already correct) | Glyph key to add | unicode | nerd | ascii |
|---|---|---|---|---|---|
| `T0` | `error` (`chat-pane.ts:29`) | `status.error` (`symbols.ts:392`) | `✘` U+2718 | `U+F00D` | `[!!]` |
| `T1` | `warning` (`chat-pane.ts:30`) | `status.warning` (`symbols.ts:393`) | `⚠` U+26A0 | `U+F12A` | `[!]` |
| `T2` | `muted` (`chat-pane.ts:31`) | `status.info` (`symbols.ts:394`) | `ⓘ` U+24D8 | `U+F129` | `[i]` |

Note there is **no `status.muted` key** in the `SymbolKey` union (`symbols.ts:10-22`: success, error,
warning, info, pending, disabled, enabled, running, shadowed, aborted, done), which is precisely why
the plan's "status.info/muted" phrasing resolves the way the room's own comment says it does
(`chat-pane.ts:27`): **glyph = `status.info`, colour = `muted`** (`muted` *is* a valid `ThemeColor`,
`theme/schema.ts:52`).

**Card heads — the tier is not rendered at all today, and `badge` is the host-native fix.** The four
card renderers (`message-cards.ts:95`, `:128`, `:162`, `:194`) take the `meta` array but never a tier;
`renderStatusLine` supports `badge: { label, color }` (`status-line.ts:13-20`, rendered
`:44-46`), and the room already uses that mechanism for tool errors (`tool-cards.ts:157`). With
`badge: { label: "T1", color: "warning" }` the head becomes `✉ room ⟵ SwarmAlpha ⟦T1⟧ · reply · 2m ago`
(unicode) — one extra token, preset-correct brackets, and it costs 4 cells.

Worth noting for scope: **only T0 and T1 ever reach a card.** `deliver()` returns early for T2 with a
cursor bump and never sends a payload (`delivery.ts:35-39`), so `room:message` cards are T1-only and
there is no T2 badge to design.

---

## 5. Defects found, in severity order

### D1 — panel chat row double-spaces its `·` (the only true spacing bug)

`plugin/src/panel/chat-pane.ts:106-108`:

```ts
const head =
  `${unread}${badge} ${time} ${indent}${author} ${theme.fg("dim", "›")} ` +
  `${theme.fg("muted", sanitizeText(row.topic))} ${theme.sep.dot} ${body}`;
```

`theme.sep.dot` is `" · "` **with** flanking spaces (`symbols.ts:455`, `symbols.ts:808`; only the ascii
preset differs, `symbols.ts:1233` → `" - "`), so `" " + sep.dot + " "` yields two cells on each flank.
Every other room surface joins with `sep.dot` and no extra spaces (`roster-strip.ts:34`,
`chrome.ts:58`, `tool-cards.ts:161`, `tool-cards.ts:221`) — this is the sole offender.
Executed: `"❯T0 01:49:59 SwarmAlpha › swarm  ·  hello"`.

### D2 — the unread cursor abuts the tier badge (`chat-pane.ts:97-98`)

`${unread}${badge}` renders `❯T0` with no separator. The host's own roster rows put two spaces between
the icon and the badge (`wait.ts:441`: `` `${icon}  ${badge}` ``) and its status line puts exactly one
(`status-line.ts:38`). Either is fine; zero is not.

### D3 — the tier badge is 2 ASCII cells and theme-free (`chat-pane.ts:98`)

`theme.fg(TIER_TONE[row.tier], row.tier)` paints the string `T0`/`T1`/`T2`. See §4.

### D4 — literal glyphs handed to `iconOverride`

- `message-cards.ts:171` — `iconOverride: "⚑"` (claim card)
- `message-cards.ts:207` — `iconOverride: "▦"` (board-delta card)
- `tool-cards.ts:28` — `const GLYPH = { room: "▦", wait: "◷" }`, used at `:152` and `:212`

The `SymbolKey` union has **no key for a claim/flag/board/wait** glyph (`symbols.ts:1-303`), so these
cannot become `styledSymbol` calls without picking a semantically wrong key. The host never passes a
literal to `iconOverride` — all 28 `iconOverride:` sites in `pi-tui/src` are
`styledSymbol(...)`/`symbol(...)`/spinner frames — but that is because the host always has a matching
key. Verdict: **documented deviation, not a bug**, provided the glyphs stay 1 cell (they do, §2) and
the choice is written down. The nearest honest theme keys, if the room ever wants them:
`icon.pin` (📌, 2 cells — avoid), `icon.time` (⏱, 1 cell — right shape for the wait cards),
`tool.irc` (✉, 1 cell — right shape for the room tool card, and already what the message cards use).

### D5 — the fallback theme shim leaks JavaScript source into the panel

`plugin/src/panel/panel.ts:333-341`:

```ts
const identity = (text: string): string => text;
return {
  fg: () => identity,
  bold: identity,
  sep: { dot: identity, space: identity },
  tree: { vertical: "│ ", branch: "├─ " },
  nav: { cursor: identity },
  status: { error: identity, warning: identity, info: identity, success: identity },
} as unknown as Theme;
```

`sep.dot`, `nav.cursor` and `status.*` are **functions**, but every consumer treats them as strings.
Reproduced by rendering a chat row through this exact shim:

```
" (text) => text (text) => text Beta (text) => text (text) =…"   ← Bun.stringWidth: 60
```

The row still pads to width 60 (`padOrTrim`, `chat-pane.ts:82-88`), so the panel renders a full-width
line of leaked source. This path is reached only when the injected theme has no `fg` **and**
`ensureThemeSync()` cannot populate the singleton (`panel.ts:318-333`), i.e. rarely — but when it is
reached the panel is garbage instead of uncoloured. Fix: `sep: { dot: " · ", space: " " }`,
`nav: { cursor: "❯" }`, `status: { error: "✘", warning: "⚠", info: "ⓘ", success: "✔" }` (the unicode
preset literals, `symbols.ts:392-404`).

### D6 — `⟵` duplicated as a literal at four model-facing sites

`delivery.ts:105`, `governor.ts:56`, `governor.ts:221`, `wait-for-message.ts:165`. All four are
byte-correct today (they are the unicode-preset `nav.back`), but they hardcode a preset-specific value
in four places. These sites have no `Theme` in scope, so the fix is not "read the theme" — it is one
named export (e.g. `export const ROOM_DIRECTION = "⟵"; // theme nav.back, unicode tier`) that all four
cite, so a preset decision is made in exactly one file.

### D7 — `chat-pane.ts:107` hardcodes `›` where the theme has a key

`U+203A` is not in `SymbolKey` (`symbols.ts:1-303`). The host's author/direction separator vocabulary
is `nav.selected` (➤, `symbols.ts:404`) for "to someone" and `sep.dot` for list metadata. Either is a
1-cell swap.

### Not defects (checked and clear)

- `body-lines.ts:26` uses `theme.md.quoteBorder` — correct, matches the native quote border
  (`wait.ts:510`).
- `roster-strip.ts:25-34` uses `statusGlyph`/`statusText` from the agent hub and joins with `sep.dot`
  and no extra spaces — correct, and it is the model the chat row should copy.
- `panel.ts:68` `BORDER = "│"` equals `boxRound.vertical` in the unicode and nerd presets
  (`symbols.ts:426`, `symbols.ts:755`); it diverges only on the ascii preset (`symbols.ts:1205`),
  and the SplitPane is given it explicitly (`panel.ts:111-113`), so it is a deliberate frame choice.
- Every model-facing `·` outside `chat-pane.ts` is single-flanked (`room.ts:154-167`,
  `digest.ts:92/103/107/129`, `room-command.ts:84-154`, `panel.ts:293`, `message-cards.ts:180/187/210`).

---

## 6. Concrete proposal — exact replacement strings, per tier, per record kind

Notation: `.` = U+0020, every codepoint below is written explicitly. All strings are what the code
would produce, verified by executing the real renderers.

### 6.1 Model-facing delivery line — **no change recommended**

`delivery.ts:105`, unchanged:

```ts
return `[${tier}] room ⟵ ${record.from} · ${where} · ${safeBody}`;
```

Per tier × kind, the exact strings (`⟵` = U+27F5, `·` = U+00B7, all flanks = one U+0020):

| Tier | Kind | Exact string | Codepoints |
|---|---|---|---|
| `T0` | `msg` (@mention) | `[T0] room ⟵ SwarmAlpha · topic:swarm · body text` | `[` `T` `0` `]` `.` `r` `o` `o` `m` `.` **U+27F5** `.` `SwarmAlpha` `.` **U+00B7** `.` `topic:swarm` `.` **U+00B7** `.` `body text` |
| `T1` | `msg` (followed/held topic) | `[T1] room ⟵ SwarmAlpha · topic:swarm · body text` | same, `T` `1` |
| `T2` | `msg` (not followed) | *(no line — pull-only, `delivery.ts:35-39`)* | — |
| `T1` | `note` | `[T1] room ⟵ system · topic:swarm · compaction finished` | same, `T` `1` |
| `T2` | `note` (unfollowed) | *(no line)* | — |
| `T1` | `claim` (waiter) | `[T1] room ⟵ SwarmAlpha · resource:review8/optmem · SwarmAlpha claimed review8/optmem (ttl 300s)` | **U+27F5** with one `.` each side |
| `T2` | `claim` (no interest) | *(no line)* | — |
| `T0` | `release` (`prevHolder` = viewer) | `[T0] room ⟵ SwarmAlpha · resource:review8/optmem · SwarmAlpha released review8/optmem — expired` | **U+27F5**, **U+00B7**, **U+2014** (one `.` each side) |
| `T1` | `release` (`reason:"released"`, followed) | `[T1] room ⟵ SwarmAlpha · resource:review8/optmem · SwarmAlpha released review8/optmem — released` | same, `T` `1` |
| `T1` | `gap` | `[T1] room ⟵ system · retention · 12 record(s) skipped (retention)` | **U+27F5** |
| `T2` | `member` (join/leave) | *(no line)* | — |
| `T0` | *(batch over ceiling)* `governor.ts:56` | `[T0] room ⟵ 52 interrupts batched (ceiling 50) — read with room{op:"read"}` | verified by executing `selectT0(pending(52), 50)` |
| `T2` | *(coalesced digest)* `governor.ts:221` | `room ⟵ 20 new message(s) in swarm — read with room{op:"read", since:0}` | verified by executing `coalescePending(...)` |
| `T1` | *(cap remainder)* `governor.ts:151` | `+3 more room messages (1 mention you) — read with room{op:"read", since:0}` | no glyph — plain text |
| `T0` | *(wait tool match)* `wait-for-message.ts:165` | `wait_for_message ⟵ SwarmAlpha · topic:swarm · "body text"` | **U+27F5** |

The only *optional* refinement here (D6): if the user wants the model-facing arrow to follow the active
preset, the exact substitute for `⟵` is `theme.nav.back` — **U+F060** on the nerd preset
(`symbols.ts:723`), **`<-`** on the ascii preset (`symbols.ts:1186`). That requires threading a theme
into `renderLine`, which is not worth it for model-facing text; naming one constant is.

### 6.2 Panel chat row — the fix

`chat-pane.ts:106-108`, replacing the hardcoded `›` and the double-spaced `·` and the ASCII badge:

```ts
const TIER_STATUS: Record<Tier, "error" | "warning" | "info"> = { T0: "error", T1: "warning", T2: "info" };
…
const unread = row.unread ? theme.fg("accent", theme.nav.cursor) : " ";
const badge = theme.fg(TIER_TONE[row.tier], theme.status[TIER_STATUS[row.tier]]);
…
const head =
  `${unread}${badge} ${time} ${indent}${author}${theme.sep.dot}` +
  `${theme.fg("muted", sanitizeText(row.topic))}${theme.sep.dot}${body}`;
```

Executed result, unicode preset (the `.` between badge and time is one U+0020; `sep.dot` supplies the
two separators with their own flanks):

| Tier | Before | After | Codepoints of the changed run |
|---|---|---|---|
| `T0` | `❯T0 01:49:59 SwarmAlpha › swarm  ·  hello` | `❯✘ 01:49:59 SwarmAlpha · swarm · hello` | **U+276F** **U+2718** `.` `01:49:59` `.` `SwarmAlpha` **U+00B7** `.` `swarm` **U+00B7** `.` `hello` |
| `T1` | ` T1 01:49:59 │├─Beta › swarm  ·  world` | ` ⚠ 01:49:59 │├─Beta · swarm · world` | `.` **U+26A0** `.` `01:49:59` `.` `│`**U+2502**`├`**U+251C**`─`**U+2500** `Beta` **U+00B7** `.` `swarm` **U+00B7** `.` `world` |
| `T2` | ` T2 01:49:59 Gamma › swarm  ·  note` | ` ⓘ 01:49:59 Gamma · swarm · note` | `.` **U+24D8** `.` `01:49:59` `.` `Gamma` **U+00B7** `.` `swarm` **U+00B7** `.` `note` |

(note: `theme.status` is a getter returning glyph strings — `theme-class.ts:485-499` — so
`theme.status.error` is the string `✘`, not a function; that is what makes this a 1-cell swap. Do not
confuse it with the room's fallback shim, where `status.error` *is* a function — D5.)

Width effect: the badge drops from 2 cells to 1 and the row keeps its `width` contract because
`padOrTrim` re-measures (`chat-pane.ts:82-88`). `Math.max(1, width - 32)` for the body
(`chat-pane.ts:105`) is unchanged.

### 6.3 Card heads — per tier × kind

| Kind (`cardTypeFor`, `message-cards.ts:29-43`) | Tier | Before (`message-cards.ts`) | After — call | After — string (unicode preset) |
|---|---|---|---|---|
| `msg`, no mention → `room:message` | `T1` | `✉ room ⟵ Alpha · reply · 2m ago` | add `badge: { label: "T1", color: "warning" }` | `✉ room ⟵ Alpha ⟦T1⟧ · reply · 2m ago` — **U+2709** `.` `room` `.` **U+27F5** `.` `Alpha` `.` **U+27E6** `T` `1` **U+27E7** `.` **U+00B7** `.` `reply` … |
| `msg`, mention → `room:mention` | `T0` | `✉ room ⟵ Alpha · ➤ me · 2m ago` | add `badge: { label: "T0", color: "error" }` | `✉ room ⟵ Alpha ⟦T0⟧ ➤ me · 2m ago` — **U+2709** `.` **U+27F5** `.` **U+27E6** `T` `0` **U+27E7** `.` **U+27A4** `me` … |
| `claim`/`release` → `room:claim` | `T0` if `prevHolder` = viewer, else `T1` | `⚑ room claim Alpha · 2m ago` | `iconOverride: theme.styledSymbol("icon.pin","accent")` **or** keep `⚑`; + `badge` | `📌 room claim Alpha ⟦T0⟧ · 2m ago` (unicode; `📌` is 2 cells) |
| `member`/`gap` → `room:board-delta` | `T1` for `gap`, `T2` for `member` | `▦ room board: 12 record(s) skipped · 2m ago` | keep `▦` (documented deviation) or `icon: "info"` | unchanged string |
| room tool call/result (`tool-cards.ts:152`,`:212`) | — | `▦ Room post swarm · posted seq 41` | `GLYPH.room = theme.styledSymbol("tool.irc","accent")` | `✉ Room post swarm · posted seq 41` |
| wait tool call/result (`tool-cards.ts:212`) | — | `◷ Wait wait_for_message from X · message` | `GLYPH.wait = theme.styledSymbol("icon.time","accent")` | `⏱ Wait wait_for_message from X · message` |

On the nerd preset the same two card heads become (rendered with the nerd literals from
`symbols.ts:694-723`; the private-use codepoints are shown as escapes because they are invisible in
most markdown viewers):

```
"\uF086 room \uF060 Alpha ⟨T1⟩ reply · 2m ago"     (U+F086 U+0020 room U+0020 U+F060 U+0020 Alpha U+0020 U+27E8 T 1 U+27E9 U+0020 reply U+0020 U+00B7 U+0020 2m ago)
"\uF086 room \uF060 Alpha ⟨T0⟩ ➤ me · 2m ago"      (… U+27E8 T 0 U+27E9 U+0020 U+27A4 me …)
```

and on the ascii preset (`symbols.ts:1171-1357`) — note the meta separator becomes `" - "`
(`symbols.ts:1233`), not `·`:

```
"# room <- Alpha [T1] reply - 2m ago"              (# U+0020 room U+0020 <- U+0020 Alpha U+0020 [ T 1 ] U+0020 reply U+0020 U+002D U+0020 2m ago)
"# room <- Alpha [T0] ➤ me - 2m ago"              (# … [ T 0 ] U+0020 ➤ me …)
```

The `➤ me` on the last line is the room's own hardcoded literal (`message-cards.ts:136`), *not*
`theme.nav.selected` — under a preset-aware surface it should read `theme.nav.selected`, which is `->`
on the ascii preset (`symbols.ts:1183`). That is the same hardcode class as D4/D7 — and it is the point
of this table: using `badge`/`styledSymbol` gets all three presets for free, whereas the current code is
frozen to the unicode tier.

### 6.4 Exact codepoint reference for the proposal

| String | Codepoints |
|---|---|
| room line, T0 mention | `[T0] room ⟵ SwarmAlpha · topic:swarm · body` = `005B 0054 0030 005D 0020 0072 006F 006F 006D 0020 27F5 0020 0053… 0020 00B7 0020 0074… 0020 00B7 0020 0062…` |
| room line, T1 | identical with `0054 0031` |
| T0 batch | `[T0] room ⟵ 52 interrupts batched (ceiling 50) — read with room{op:"read"}` — U+27F5 at index 11, U+2014 flanked by U+0020 |
| T2 digest | `room ⟵ 20 new message(s) in swarm — read with room{op:"read", since:0}` — U+27F5 flanked by U+0020 |
| panel row, T0 | `❯✘ 01:49:59 SwarmAlpha · swarm · hello` — `276F 2718 0020 0031… 0020 0053… 0020 00B7 0020 0073… 0020 00B7 0020 0068…` |
| panel row, T1 | `⚠ 01:49:59 │├─Beta · swarm · world` — `26A0 0020 … 2502 251C 2500 …` |
| card head, T0 | `✉ room ⟵ Alpha ⟦T0⟧ ➤ me · 2m ago` — `2709 0020 … 27F5 0020 … 27E6 0054 0030 27E7 0020 27A4 …` |

---

## 7. Evidence — what I actually ran

- `Bun.stringWidth` (the host's `visibleWidth` delegate, `pi-tui/src/utils.ts:340`) on every glyph in
  §2 — all room-used glyphs 1 cell.
- `uv run python -c` + `unicodedata` for `east_asian_width` / `category` / `name` of each codepoint.
- Imported and **executed** the real code, no transcription: `renderLine` + `roomBodyOf`
  (`delivery.ts`), `selectT0` + `coalescePending` (`governor.ts`), `renderChatRows` (`chat-pane.ts`),
  and the host's `renderStatusLine` (`pi-tui/src/render/status-line.ts`) with both a correct theme stub
  and the panel's own fallback shim (`panel.ts:333-341`) — the shim render is quoted in D5.
- `rg` over `plugin/src` for every non-ASCII literal; `rg` over `pi-tui/src` for
  `iconOverride` (28 sites, zero literals), `styledSymbol`, `sep.dot`, `format.bracket*`,
  `nav.*`, `status.*`, `tool.irc`, `icon.pin`, `icon.time`.
- No gates, formatters, or tests were run, per the assignment.






---
