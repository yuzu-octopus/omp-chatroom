# Repository Guidelines

Research and design record for **`omp-agent-chatroom`** — an in-process coordination room for
[omp](https://omp.sh) that adds what native agent messaging lacks: **exclusive ownership of a named
resource with a lease**.

State: the plugin is **built**. `docs/research/omp-agent-chatroom/HANDOFF.md` is the current-state
entry point (gates, verified-live evidence, known limits); `PLAN-build.md` is the normative design
document. This file is the practical guide for working in the repo.

> **Authority order when documents disagree:** `plugin/src/**` > dated addenda in `PLAN-build.md` >
> plan body > `SCAFFOLD.md` > reviews > reports. `PLAN-build.md:60-62` declares its own body a
> historical record whose superseded prose was left untouched on purpose.

## Architecture & Data Flow

One omp plugin, loaded in-process as a TS module. Two halves: the plugin (`plugin/`) and the research
record that produced it (`docs/research/`).

```mermaid
flowchart TD
  T["Tools: room / wait_for_agent / wait_for_message / wait_for_claim"]
  S["RoomStore (module singleton, keyed by project cwd)<br/>append-only JSONL + in-memory projection"]
  G["Attention Governor<br/>classify T0 / T1 / T2"]
  D["Delivery Adapter"]
  P["TUI panel (/room overlay)"]
  C["Inline transcript cards"]

  T -->|"synchronous mutation"| S
  S --> G
  G -->|"T0 interrupt"| D
  G -->|"T1 step boundary"| D
  G -->|"T2 cursor only"| S
  D --> P
  D --> C
```

`op:post` is the path everything hangs off: `tools/room.ts` appends synchronously, then
`notifyRecipients` runs `classify → isMuted → admitPost/selectT1 → deliver` per recipient.

**The store is authoritative**; the cold tree is a rebuildable cache over it. Cursors are per agent,
advanced on delivery into context, never on send.

## Key Directories

| Path | Purpose |
|---|---|
| `plugin/src/store/` | log, projection, claim arbiter, cursors, config, tree, compactor |
| `plugin/src/attention/` | tier classification, governor, delivery adapter |
| `plugin/src/panel/` | three-pane overlay (chrome, keys, chat, board, roster) |
| `plugin/src/cards/` | quote-bordered body lines, message cards, tool cards |
| `plugin/src/tools/` | `room` and the three wait tools |
| `plugin/src/onboarding/` | digest, routing rule, `before_agent_start` hook |
| `plugin/src/commands/` | slash commands |
| `docs/research/omp-agent-chatroom/` | brief → REPORT → REPORT-v2 → PLAN-build → REPORT-v3 → build |
| `docs/research/omp-agent-notes/` | agent-facing notes on src / tests / config / docs |
| `docs/research/optmem-2026-10-08/` | OptMem/UniiChat revision 2026-10-08: four reports + rejection |

## Development Commands

```sh
cd plugin
bun test tests/                                 # the whole suite (232 pass, 13 files)
bunx --bun tsc --noEmit -p tsconfig.json        # typecheck only; Bun executes the TS
bunx --bun @biomejs/biome check src tests       # lint + format
bunx --bun @biomejs/biome check src tests --write   # apply fixes
```

**There is no build step** — Bun runs the TypeScript directly and omp loads it in-process. Two load
routes reach `plugin/src/index.ts`: the project shim `.omp/extensions/chatroom.ts` (what this repo
uses, auto-discovered) and `omp plugin link .` (packaged, verified with `omp plugin doctor`).

## Code Conventions & Common Patterns

**Runtime is Bun. Never Node, npm, or npx.** There is no root `package.json` and no workspace.

**Invariants that must hold when editing** (I1–I6):

| # | Rule | Enforced at |
|---|---|---|
| I1 | mutations are synchronous — no `await` between mint, write, project, notify | `store/room-store.ts:127-146` |
| I2 | no session-scoped module state; key by root/agent in `globalThis` maps | `store/room-store.ts:58-65`, `store/compactor.ts:255`, `store/tree-store.ts:133` |
| I3 | key every shared structure by `ctx.agent.id` | `store/room-store.ts:224-229`, `panel/panel.ts:34` |
| I4 | timers via `ctx.setInterval` only — never a raw timer (a throw is process-fatal) | `store/compactor.ts:259-270`, `store/room-store.ts:281-292` |
| I5 | synchronous append survives a crash — `fsyncSync` in the one `appendLine` path | `store/log.ts:30-42` |
| I6 | every wait promise settles — signal, timeout and promotion all `finish()` | `tools/wait-for-claim.ts:96-100` and both siblings |

**Room root is `ctx.cwd + "/.omp-room"`, NOT the `local://` root.** `localProtocolOptions` is
per-session — a subagent's artifacts dir is its own session file minus `.jsonl`, so keying the room
there gave every agent a private room. `ctx.cwd` is inherited by subagents and is the one stable
per-tree key. `rootOf()` is `store/room-store.ts:211-222`.

**Result contract (K1).** Every tool returns `content: [{type:"text", text}]` — always present; a
result without it is coerced to an error by the host — plus `details` with `ok`. The payload lives in
`details`, never as a bare object. Timeouts are **normal outcomes**:
`{ ok: true, outcome: "timeout", … }` with `useless: true` so compaction may elide them.
`outcome` ∈ `"event" | "timeout" | "aborted"`. Room failures are results, never throws.

**Escaping is load-bearing.** Every room-authored string that reaches the model goes through
`safeRoomText` (`onboarding/escape.ts`) — harness-tag neutralisation plus `sanitizeText`. The digest
rides `BeforeAgentStartEventResult.message` as a custom message, inside
`<room-authored untrusted="true">`. The system prompt carries only the static routing rule, so the
prompt-cache prefix is byte-stable.

**Tests are plain `bun:test` — no `mock.module`** (it leaks across files in one process). Fixtures
are real temp roots via `fs.mkdtempSync(path.join(os.tmpdir(), …))`; the fake LLM seam is
`registerCustomApi`. Fake ctx builders must set `cwd` to the temp root and complete the timer API.
Detailed conventions and the not-covered list: `docs/research/omp-agent-notes/tests.md`.

## Important Files

| File | Why |
|---|---|
| `plugin/src/index.ts` | the extension entry — calls every `registerX` |
| `plugin/src/version.ts` | `HOST_VERSION_PIN`; the drift gate |
| `plugin/src/store/room-store.ts` | append, projection, refcounted registry, retention |
| `plugin/src/store/log.ts` | the one append path, with `fsyncSync` |
| `plugin/src/store/tree-store.ts` | `cover`, `putNode`, `pending`/`ready`, `TREE_REC=512` |
| `plugin/src/store/compactor.ts` | background summarisation, rate cap, retry-with-ruler |
| `plugin/src/attention/tiers.ts` → `governor.ts` → `delivery.ts` | the attention pipeline |
| `plugin/src/panel/panel.ts` | the overlay; `resolveTheme` handles a host theme with no `fg` |
| `plugin/src/onboarding/routing-rule.md` | the shipped room-vs-`agent://` rule |
| `docs/research/omp-agent-chatroom/PLAN-build.md` | normative design; §4.1 ops, §5.2 caps, §10 risks |
| `docs/research/omp-agent-chatroom/HANDOFF.md` | current build state and verification evidence |

## Runtime/Tooling Preferences

- **Bun only** — `bun` 1.4.2. Package manager, runner, and runtime. No `node`, `npm`, or `npx`.
- **Host: omp 18.10.3.** The plugin pins it exactly in both `peerDependencies` and
  `devDependencies` because ten subpath imports are wildcard-only, not public API. `tests/drift.test.ts`
  asserts the installed host equals `HOST_VERSION_PIN` and ESM-imports every deep specifier.
  Whoever bumps the global omp must re-pin (`package.json` + `bun.lock` + `HOST_VERSION_PIN`) —
  the host moves fast and the drift gate only guards the pinned version.
- **No hot reload.** Extension factories bind once per session tree; source edits need a new session.
- **Python via `uv`**, never `python3`/`pip` (global agent rule).
- Biome config: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 100`,
  `noNonNullAssertion` **off** (those assertions are deliberate, documented invariants),
  scope `src/**` + `tests/**`.

## Testing & QA

`bun:test`, no mocking. Run `cd plugin && bun test tests/`.

Test-only seams: `__roomTest.store.reset()` (`src/index.ts`), `__compactTest`
(`store/compactor.ts` — for the daily spend cap without 20 000 real calls), and
`AgentRegistry.resetGlobalForTests()` for the process-wide registry singleton. Reset store state in
`afterEach` for unit suites, and at the top of each test for the `createAgentSession` e2e suites.

**Assert the model-facing `content` array** for anything the model reads — `details` never reaches it.
A gap here hid a real defect once (see the K1 block in `tests/room-tool.test.ts`).

**Not covered, so treat as unverified:** the panel in a real terminal, cards in a real transcript, a
live model choosing to call the room, real-model summarisation quality, and
`wait_for_agent`'s happy `event` path.

**Do not re-litigate these settled findings** — both are recorded with evidence:

- **Embeddings are deferred, not rejected**, with a stated revisit trigger (log past ~10⁵ records, or
  observed "cannot find it" failures). `docs/research/embeddings/CONCLUSION.md`.
- **The UniiChat merge-age formula change was measured and rejected.** The spec's `first`→`last` fix
  looks authoritative (a reproducible counterexample plus a "481 of 20 001" match rate), but that
  figure describes its greedy most-due-pair loop, not our bisection. Measured on our procedure, the
  rejected change matches Taelin's `push` **worse** (8/400 vs 140/400).
  `docs/research/optmem-2026-10-08/A-merge-order-verification.md`.
