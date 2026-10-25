# Making omp-agent-chatroom seamless with omp 18.12.6

**Answer:** The plugin is already well-aligned with omp's TUI and extension contract — it uses the host's theme, symbols, chrome helpers, and message-renderer pipeline correctly. The remaining gaps are: (1) the tool description teaches mechanics where native tools teach *workflow*; (2) the panel hand-rolls framing the host already provides (`OverlayPanel`, `FramedMessageComponent`, `MessageDivider`); (3) the degraded-theme path publishes a fallback the host reads members from — safe only by enumeration, not by contract. The advantages over native `agent://` are real and evidenced (exclusive ownership, shared durable record, tiered attention, bounded waits, cold summary tree), but the claim board is the only layer with both a verified gap and adjacent measured support; the rest rest on inference.

**Confidence:** high on the TUI/theme findings (primary host source); medium on the tool-design improvements (inferred from native `todo.md` pattern, no LLM empirical data); medium on the host-version diff (changelog only, no source diff).

## What omp 18.12.6 provides that the plugin already uses correctly

- **Theme singleton + injected theme** — plugin uses `ctx.ui.custom`'s injected theme, never reads module singleton at render. Correct. (`F1` §2, §3)
- **`ensureThemeSync` / `initThemeSync` / `setThemeInstance`** — plugin's `hostRealTheme()` calls `initThemeSync(preset, colorBlind, name, name)` preserving user settings. Correct. (`F2`)
- **Symbol sourcing** — every decorative glyph resolves from `theme.symbol()` / table getters. Correct. (`F1` §6)
- **Chrome helpers** — plugin wraps `topBorder`/`divider`/`bottomBorder`/`row` from host. Functional but see gap below. (`F1` §1)
- **Message renderers** — `registerMessageRenderer` for `room:message` etc. with `renderCall`/`renderResult`/`describeCall`/`describeResult`. Native-grade. (`F4`)
- **Result contract** — `content: [{type:"text", text}]` always present, `details` with `ok`, never-throw. Matches host. (`F4`)

## Gaps and improvements (ranked)

### 1. Tool description teaches mechanics, not workflow (medium value, low risk)
Native `todo` loads its description from a `.md` prompt file with behavioral rules ("never takes a turn of its own", "parallel emission"). Plugin inlines a 17-line `ROOM_DESCRIPTION` string that echoes the op enum. Rewrite as a behavioral guide: sequencing (join first), when to use which op, when NOT to use the room (private 1:1 → `agent://`), example call snippets. Move to a `.md` prompt file like native. (`F4`)

### 2. Panel hand-rolls framing the host already provides (medium value, medium risk)
`plugin/src/panel/chrome.ts` wraps host chrome helpers with `fitWidth`/`fitBlock` because "overlay-box helpers under-fill/over-fill". Host provides `OverlayPanel` + `PanelRows` (height budgeting, memoized rows, native describe) and `FramedMessageComponent` for chat blocks. Adopting these would reduce ~100 lines and eliminate the width-mismatch class of bugs. Risk: requires rewriting the panel's render path. (`F1` §13-14, §8)

### 3. `onThemeChange` is single-callback — plugin cannot register without displacing host (low value)
`onThemeChange` sets one global callback. Plugin uses `getThemeEpoch()` polling instead. Acceptable; no change needed unless theme-switch repaint lag becomes visible. (`F2`)

### 4. `footerMeta` in tool cards (low value, low risk)
omp 18.12.4 added `footerMeta` to `OutputBlockOptions` and `ToolCardSnapshot` for drawing facts in a frame's bottom border. Plugin cards could show room counts there instead of inline. Aligns with native bash/wait cards. (`F6`)

### 5. Centered sheets fill narrow panes (low value, low risk)
omp 18.12.6: centered sheets fill pane when <100 cols. Plugin overlays should follow. (`F6`)

### 6. Deferred extension loading (informational)
omp 18.12.6 defers tools/commands/flags/renderers/event-hooks-only extensions after first launch. Plugin registers only those → will be deferred. Init must be idempotent (it is). No change needed. (`F6`)

## What not to change

- Never-throw contract, content-always-present, strict, approval=read, loadMode essential, render hooks. (`F4`)
- Idempotent join/claim, idemKey, recall guards, clamped read limit. (`F4`)
- The monolith `room` tool (matches native `todo` pattern). (`F4`)
- The attention governor, tier classification, delivery adapter. (core mechanics)
- The claim board's first-writer-wins + mandatory TTL. (evidenced gap)

## Advantages over native `agent://` (justified)

| Capability | Native `agent://` | Room |
|---|---|---|
| Exclusive ownership | None (no claim/lock/lease primitive exists) | First-writer-wins with mandatory TTL, logged reclaim |
| Shared durable record | Per-recipient (10 files, none is "the room") | Append-only fsync JSONL, replayable by late joiner |
| Tiered attention | Undifferentiated drop-oldest queue (cap 100) | T0/T1/T2 with token bucket, per-turn caps, coalescing |
| Bounded blocking waits | Refuses peer-only waits | `wait_for_agent`/`wait_for_message`/`wait_for_claim` with timeout as normal outcome |
| Cold summary tree | None | `tree`/`zoom`/`recall` with compaction |
| Claim-expiry sweep | None | 5s interval, expired → release → promote waiter → T0 notice |

Evidence: 9 of 17 claude-code issue bodies describe duplicate/racing work; Bun's 64-agent port had agents `git stash`/`reset --hard` on each other; AI-agent PRs conflict at 27.67% vs 0.2% humans; Cursor abandoned self-coordination via shared file because "twenty agents slowed to the throughput of two or three." (`F5`)

The strongest signal that a *peer-to-peer room* is not the whole answer: Cursor's fix was to abandon worker-to-worker coordination entirely (planner owns plan, executor owns it, judge verifies). The room should be understood as a **coordination artifact**, not a chat — the claim board and the status ledger are the value; the chat is secondary.

- The open item it left: adopt the host's `PanelRows.setHeight(1)` for the panel's fixed-height frame rows (top border, divider, hint, bottom). A dedicated investigation (`agent://TuiAdopt`) verified the host's `HubFrame` pattern (`PanelRows` *4 + `SplitPane` + `Stack`, per-frame `setLines([topBorderSplit(...)])`) is exactly the plugin's architecture with `PanelRows` in place of the hand-rolled `fitBlock`, and produced a working fixed-width proof. It also ruled OUT: `OverlayPanel` as the container (single-column, no split chrome — would dismantle the working `SplitPane` geometry for zero width gain), `FramedMessageComponent` for transcript cards (the host already frames every `MessageRenderer` — adoption double-frames — and header/collapse semantics differ), `MessageDividerComponent`/`MessageNoticeComponent` (no consumer: the plugin renders no transcript section rules), and `footerMeta` (fits-or-wraps bottom-border is right for board-count deltas but requires the whole `ToolCard` snapshot lifecycle — prototype first, out of scope here).
- No measured study of a persistent multi-agent room exists. Revisit triggers: log past ~10⁵ records, or observed "cannot find it" failures. (`F5`)
- Tier distribution (T0/T1/T2) is unmeasurable: computed per-viewer at delivery, never stored. (`F5`)
- The production topology (shared pi-tui instance) is a live check, not a test. (`F5`, `tests.md` §6.10)

## Sources
1. Host source: `@oh-my-pi/pi-tui/src/chrome/*`, `theme/*`, `components/*`, `render/*`, `overlays/*` (18.12.6) [primary]
2. Host source: `@oh-my-pi/pi-coding-agent/src/extensibility/extensions/*`, `src/modes/controllers/extension-ui-controller.ts`, `src/tools/todo.ts`, `src/tools/irc.ts` (18.12.6) [primary]
3. Host changelogs: `@oh-my-pi/pi-coding-agent/CHANGELOG.md`, `@oh-my-pi/pi-tui/CHANGELOG.md` 18.12.3–18.12.6 [primary]
4. Plugin source: `plugin/src/panel/*.ts`, `plugin/src/cards/*.ts`, `plugin/src/tools/room.ts` [primary]
5. `docs/research/large-swarm-coordination/REPORT.md` — MAST, Cohere, Cursor, Bun 64-agent, noise floor [primary/secondary]
6. `docs/research/omp-agent-chatroom/room-vs-native.md` — prior synthesis [primary]
7. `docs/research/omp-agent-chatroom/brief.md`, `PLAN-build.md` — design decisions [primary]