# omp-agent-chatroom — build handoff

Date 2026-10-07. **Option B is built, tested, and verified live.**

## What to run

```sh
cd /home/yuzu/projects/omp-chatroom

# the plugin loads as a PROJECT extension — no install step needed
omp                    # from this directory; .omp/extensions/chatroom.ts is picked up

# then, inside omp:
#   /room              — opens the TUI panel
#   /room board        — claims, roster, topics
#   /room claim build parser 300000
#   /room config       — show the active knobs
#   ask the agent to use the room tool
```

The `.omp/extensions/chatroom.ts` shim re-exports `plugin/src/index.ts`, so edits to the plugin are
picked up on the next session (no hot reload — restart omp).

## Gates (all green)

| Gate | Result |
|---|---|
| `bunx --bun tsc --noEmit -p tsconfig.json` | **0 errors** |
| `bun test tests/` | **186 pass / 0 fail**, 1530 assertions, 11 files |
| `bunx --bun @biomejs/biome check src tests` | **0 errors, 0 warnings** |
| Remaining `not implemented` stubs | **0** |
| Plugin loads in a real session | **0 extension errors**, all 4 tools + `/room` registered |
| Governor delivery | **verified live** — a mention reaches the target as a T0 steer |
| Governor pull path | **verified live** — a parked agent's 60 pending mentions batch into ONE steer |
| Mutation testing (store) | 8/12 caught; 5 load-bearing tests non-vacuous |
| Mutation testing (tree) | **12/12 caught** |
| Panel keys | **wired via `ctx.ui.onTerminalInput`** — the host never focuses an overlay component |
| Room root | **`<project cwd>/.omp-room`** — one room per project, shared by subagents |

## What it does

**Option B scope** (`PLAN-build.md` §1.4) — the full plan: all 12 deliverables, all 12 `room` ops,
all three wait tools, the attention governor, the cold summary tree, the panel, and inline cards.

- **`room` tool**, ops: `join` · `read` · `post` · `claim` · `release` · `board` · `topics` ·
  `mute` · `unmute` · `tree` · `zoom` · `recall`
- **`wait_for_claim`** / **`wait_for_agent`** / **`wait_for_message`** — default 20 s, max 300 s
- **Attention governor** — T0/T1/T2 classification, K=10/B=2048 cap, T2 coalescing, srTCM, mute
- **Cold tree** — a rebuildable summary cache over the log, background compactor, daily rate cap
- **`/room`** — the TUI panel (3-pane, narrow fallback, windowed rendering)
- **Inline cards** — `room:message`, `room:mention`, `room:claim`, `room:board-delta`
- **Onboarding** — a bounded digest + the routing rule appended to the system prompt
- **Config** — `local://room/config.json`, editable via `/room config`

## Two defects the green suite hid — and the lesson

The 117-test suite passed while two fully implemented, fully tested components were called by
**nothing**:

1. **`deliver()`** (`attention/delivery.ts`) — no production caller, so a room mention reached
   nobody. Found by running a real 3-agent probe, not by the tests.
2. **`startCompactor()`** (`store/compactor.ts`) — never started, so the cold tree was never built.

A third class surfaced in the same audit: `startPruneJob` and `startClaimSweep` were redundant
standalone starters whose raw `ctx.setInterval` was never registered in the timer registry — a leak
waiting on session shutdown.

**Lesson: a passing test proves a component works, not that anything calls it.** The adversarial
wiring audit (`review6/wiring.md`) built a caller table for every exported symbol; that is the check
the suite cannot do for itself.

## Verification that is not a test

- **Delivery, live**: three sessions in one process, one shared room. A posts a message mentioning B;
  B receives `{"type":"room:mention","deliverAs":"steer"}` and its cursor advances. Before the fix, B
  received `[]`.
- **Ops, live**: `post` returns its tier; `mute` drops a topic's unread to 0; `tree` degrades to an
  all-raw tiling when the compactor has not run; a bad `recall` regex and an invalid `zoom` range
  return `{ok:false, error}` rather than throwing.
- **Host surface**: every panel primitive the plan names resolves — `Container`, `Text`, `Box`,
  `Stack`, `SplitPane`, `Table`, `ScrollView`, `TabBar`, plus `topBorderSplit`/`dividerSplit`/
  `bottomBorder` and `renderStatusLine`/`createCachedComponent`.

## Known limits (carry these forward)

- **Mute and topic-follow are session-scoped.** They live in the in-memory `MemberState` and are not
  written to the log. Only the read cursor persists (`pi.appendEntry`).
- **In-process only.** One omp process per `local://` root; a second writer would tear lines.
- **`ctx.signal` does not exist.** The panel aborts via `pi.on("session_shutdown", …)`.
- **The room is not a token-cost win.** Its value is correctness, not efficiency.
- **Room message volume has no study behind it** — the design caps it rather than proving it helps.

## Where the evidence is

| Path | What |
|---|---|
| `plugin/README.md` | the operational contract — ops, caps, config, limits |
| `plugin/skills/omp-agent-chatroom/SKILL.md` | what an agent reads |
| `docs/research/omp-agent-chatroom/PLAN-build.md` | the build-ready plan (§4.1 op table, §5.2 caps) |
| `docs/research/omp-agent-chatroom/review6/wiring.md` | the caller table + every dead symbol |
| `docs/research/omp-agent-chatroom/review6/host.md` | host-contract review |
| `docs/research/omp-agent-chatroom/PROBES.md` | host-surface probes |
