# Repository Guidelines

## Project Overview

This repository is the research and design record for **`omp-agent-chatroom`**, an
[omp](https://omp.sh) plugin that adds a collaborative room to a single omp process: a shared
chat log, a structured claim/status board, blocking wait tools, a TUI panel, and inline
transcript cards.

The motivation: omp's native peer messaging (`write agent://<id>`, `agent://all`, IRC cards)
works but is point-to-point and hierarchical — it is easy to talk *up* to a parent and awkward
to collaborate *across* peers. The plugin is designed to make collaboration the path of least
resistance without replacing the native path.

**Current state: documentation only.** There is no `src/`, no `tests/`, no `package.json`, and
no build. `docs/research/omp-agent-chatroom/PLAN-build.md` is the build-ready plan; everything
else is evidence behind it.

### Verdict history

| Round | Artifact | Outcome |
|---|---|---|
| R1 | `REPORT.md` | Gap is **semantics, not transport**. Rejected an unbounded shared chat log on measured evidence. |
| R2 | `REPORT-v2-hybrid.md` | Revised: keep `agent://` intact, add room + board + blocking waits. |
| R3 | `PLAN-build.md` | Build-ready plan: repo layout, store, tools, panel, cards, 10 phases (P0–P8 + P1b). |
| R4 | `REPORT-v3-tree.md` | Two-region log: raw tail + compressed tree over the cold backlog. |

## Architecture & Data Flow

The design keeps native `agent://` untouched for point-to-point steering and interrupts, and
adds one coordination layer beside it.

```mermaid
flowchart TD
  T["Tools: room / wait_for_agent / wait_for_message / wait_for_claim"]
  S["RoomStore (module singleton, keyed by project cwd)<br/>append-only JSONL + in-memory projection"]
  G["Attention Governor<br/>classify T0 / T1 / T2"]
  D["Delivery Adapter"]
  P["TUI panel (/room overlay)"]
  C["Inline transcript cards"]

  T -->|synchronous mutation| S
  S --> G
  G -->|T0 interrupt| D
  G -->|T1 step boundary| D
  G -->|T2 cursor only| S
  D --> P
  D --> C
```

### Three-tier attention model

Every record is classified; the tier decides delivery.

| Tier | Kinds | Delivery | Wakes? |
|---|---|---|---|
| **T0** | direct DM, `@mention`, reply to your message, claim revoked, your task failed | interrupt queue; cuts an interruptible wait | yes |
| **T1** | post on a topic you follow, claim status change, reply in a joined thread | `deliverAs: "aside"` at the step boundary | only if idle |
| **T2** | general chatter, presence, progress, unaddressed broadcast | per-agent cursor only; never injected | never |

Caps: K=10 T1/turn, B=2048 tokens/turn, N=20 T2 coalesce count, T=5 min coalesce lag,
srTCM 1 post/2 s with burst 10, log retention 5000 records / 7 days.

### Data flow notes

- The **store is authoritative**; the tree is a rebuildable cache over it.
- Cursors are **per agent**, advanced on delivery into context, never on send.
- Delivery to a sibling session goes through `AgentRef.session.sendCustomMessage`; to the
  calling session through `pi.sendMessage`. Null-check `AgentRef.session` (null when parked).
- Cards are emitted as `customType` messages (`room:message`, `room:mention`, `room:claim`,
  `room:board-delta`) and rendered by `registerMessageRenderer` handlers.

## Key Directories

Planned layout, from `PLAN-build.md` §2.1 — none of it exists yet.

| Path | Purpose |
|---|---|
| `src/store/` | Room store: log append, projection, claim arbiter, cursors |
| `src/attention/` | Tier classification, governor, rate limiting |
| `src/tools/` | `room` and the three wait tools |
| `src/onboarding/` | Join digest + routing-rule prompt block |
| `src/panel/` | `/room` TUI overlay components |
| `src/cards/` | Inline transcript card renderers |
| `src/commands/` | Slash command |
| `tests/` | `bun:test` suites + multi-agent harness |
| `skills/` | Bundled skill for agents using the room |
| `docs/research/omp-agent-chatroom/` | Briefs, reports, plan, findings |

## Development Commands

**There is no build, lint, or format step, and none is specified.** Bun runs TypeScript
directly; the plugin is loaded in-process by omp.

```sh
# Link the plugin for development (planned, PLAN-build.md §9 P7)
omp plugin link .

# Run a test suite (planned, PLAN-build.md §9 P0 / P3)
bun test tests/store.test.ts
bun test tests/attention.test.ts
```

Per-phase acceptance checks are in `PLAN-build.md` §9. For P1/P2 the plan calls tool methods
directly (`session.getToolByName().execute(...)`) instead of driving a model.

## Code Conventions & Common Patterns

- **Tool names**: `room`, `wait_for_agent`, `wait_for_message`, `wait_for_claim` — separate
  names, not one op-discriminated tool, because tool discovery is BM25 over name + description.
- **`customType` namespace**: `room:message`, `room:mention`, `room:claim`, `room:board-delta`.
- **Resource form**: `<topic>/<key>`.
- **`loadMode: "essential"`** is required — the extension default (`discoverable`) leaves the
  tool inactive.
- **`interruptible`**: `true` for `wait_for_agent` / `wait_for_message`, `false` for
  `wait_for_claim`. It is **not** in the typed `ToolDefinition`; declare it on the object literal
  and never rely on it for correctness — every wait tool also observes `signal` directly.
- **Tool `execute` signature**: `(toolCallId, params, signal, onUpdate, ctx)`. Follow the
  wrapper, not the example extension.
- **Result contract**: `{ outcome: "event" | "timeout" | "aborted", ... }` with `useless: true`
  on non-event paths so compaction can elide them. Timeout is a normal outcome, not an error.
- **State**: one module-level store keyed by the `local://` root — never a bare global. Cursors
  persist via `appendEntry`, which is not rendered to the model.
- **Atomicity**: synchronous `O_APPEND` writes, no lock, no `fsync`; claim state is rebuilt by
  replaying the log on first open.
- **Path resolution**: `ctx.localProtocolOptions` when present, else derive from
  `sessionManager`.
- **Panel**: opened from a slash command, guarded by `hasUI` and `ctx.mode === "tui"`; keys live
  in `handleInput`; `dispose` must be idempotent.

Invariants I1–I6 (sync mutations, no session-scoped module state, key by `ctx.agent.id`,
refcounted `ctx.setInterval`, synchronous append, all wait promises settle) are in
`PLAN-build.md` §3 and must hold across every phase.

## Important Files

| File | Why it matters |
|---|---|
| `docs/research/omp-agent-chatroom/PLAN-build.md` | The build-ready plan — repo layout, schemas, phases, risks, test plan |
| `docs/research/omp-agent-chatroom/brief.md` | Research question + Addenda A (hybrid) and B (tree) |
| `docs/research/omp-agent-chatroom/REPORT.md` | R1 gap analysis and the measured case against unbounded chat |
| `docs/research/omp-agent-chatroom/REPORT-v2-hybrid.md` | R2 hybrid design: routing rule, wait tools, envelope, attention |
| `docs/research/omp-agent-chatroom/findings/F*.md` | Per-angle evidence, every claim with a path:line or URL |
| `.gitignore` | Excludes `node_modules/`, `dist/`, `build/`, `.omp/plugins/`, `.env*`, `coverage/` |

Read `PLAN-build.md` §10 (risks) before changing any design decision — it lists the unsupported
mechanisms and their fallbacks.

## Runtime/Tooling Preferences

- **Runtime: Bun** (verified present: `bun 1.4.2` at `/usr/bin/bun`). Bun is also the package
  manager and test runner. Do **not** use Node or npm.
- **Host: omp 18.6.1** (`/home/yuzu/.bun/bin/omp`). The plugin loads in-process as a TS module.
- **Not yet specified** in the plan: `engines`, `dependencies`, `scripts`, `tsconfig.json`
  contents, CI. Fill these in when P0 starts; do not assume they exist.
- **Deep imports are a risk, not a pattern.** Subpath imports such as
  `@oh-my-pi/pi-coding-agent/irc/bus` resolve via a wildcard export but are not public API. Pin
  the host version and add a smoke test that imports each specifier (`PLAN-build.md` §10 R2).
- No per-directory trust gate: `ctx.isProjectTrusted()` is always `true`.

## Testing & QA

- **Framework**: `bun:test`. No linter or formatter is configured.
- **Deterministic harness**: `PLAN-build.md` §11 specifies an in-process multi-agent harness
  built on `createAgentSession` with an in-memory `SessionManager`, extension discovery, MCP,
  LSP, and UI all disabled — so tests exercise real sessions without a model.
- **Store reset between tests**: `__roomTest.store.reset()` (test-only seam).
- **Coverage expectation**: each phase in §9 has an acceptance check; §11.2 states what each
  assertion proves. The attention governor is table-tested across all 12 trigger cases.
- **What must not be tested away**: invariants I1–I6, the "no agent blocked on compaction" rule,
  and the "tree is rebuildable from the log" property.

### Probes (run the host, don't just read it)

`probes/*.mjs` execute the plan's load-bearing assumptions against the installed host. See
`docs/research/omp-agent-chatroom/PROBES.md` for results and the full recipe.

**Environment gotcha that costs ~20 minutes every time:** the native loader resolves
`pi_natives.*.node` relative to the module's own directory. When the package is reached through
Bun's cache the path becomes `~/.bun/install/cache/@oh-my-pi/pi-natives@<v>@@@1/native/`, and that
directory ships **without** the `.node` files. A bare symlink to the global install therefore fails
with `Failed to load pi_natives native addon`. Fix:

```sh
mkdir -p /tmp/roomprobe && cd /tmp/roomprobe
cp -r ~/.bun/install/global/node_modules/@oh-my-pi node_modules/@oh-my-pi
cp ~/.bun/install/global/node_modules/@oh-my-pi/pi-natives-linux-x64/*.node \
   node_modules/@oh-my-pi/pi-natives/native/
bun probes/probe2.mjs
```

**Probe limit worth remembering:** the K1 result-shape coercion lives in the **agent loop**
(`coerceToolResult`), not at the `execute()` boundary. A probe that calls `execute()` directly
cannot observe it — the raw object comes back unchanged. Assert on a real agent turn instead.

## Open Questions

Do not present these as settled. They are flagged as unmeasured in the corpus:

- Room message volume has no study behind it; the design caps it rather than proving it helps.
- Whether an agent given a bounded blocking wait uses it productively rather than parking is
  untested.
- No primary source studies hierarchical compression for a **multi-writer** agent log.
- The routing-rule thresholds and the coalesce/rate-limit constants are proposals, not measured
  values.
