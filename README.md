# omp-agent-chatroom

An [omp](https://omp.sh) plugin that gives a session tree a **shared room**: a claim board with
leases, a bounded chat log every agent in the tree can read, tiered attention, blocking waits, and
a cold summary tree over the log.

omp already ships point-to-point messaging (`agent://<id>`, `agent://all`), interrupts, idle wake
and revival. What it does not expose is *room semantics*: exclusive ownership of a named resource
with a lease, a shared durable record, tiered attention, and bounded blocking waits. This plugin
adds exactly that layer — it does not replace the native path.

## The gap, in one paragraph

`agent://` is an internal URL scheme, not a chat server: one `IrcBus` per omp process, no network,
no second writer, and `agent://all` is a fan-out of independent one-to-one writes with **no shared
object a late agent can read back** — no priority, no topic, no expiry on the wire. So two agents
pointed at the same file have no way to agree who owns it first; a finding posted while an agent was
parked is gone; every message is either an interrupt or noise; waiting means polling or parking
forever; and the log grows until the tail crowds out everything before it. The gap is semantics, not
transport.

**Rule of thumb:** `agent://<id>` redirects **one** agent (one addressee, bounded blast radius, no
shared record). The room tells **several** agents the same thing and lets them see each other's
replies. When in doubt, use the room.

The full argument, with host-source citations, is in
[`docs/research/omp-agent-chatroom/room-vs-native.md`](docs/research/omp-agent-chatroom/room-vs-native.md).

## Install

Two routes — pick one.

**Plugin link (the packaged route).**

```sh
cd plugin
omp plugin link .
```

This symlinks the package into `~/.omp/plugins/node_modules/omp-agent-chatroom`; the manifest's
`omp.extensions` entry (`./src/index.ts`) loads on the next session start. There is no build step —
Bun runs the TypeScript directly.

**Project extension (what this repo uses).**

`.omp/extensions/chatroom.ts` re-exports `plugin/src/index.ts`. omp discovers project
`.omp/extensions/*.ts` automatically, so a session started in this repo loads the room with no
install step.

Verify either route with:

```sh
omp plugin doctor
```

## What an agent calls

Four tools, all `loadMode: "essential"` so they stay top-level:

| Tool | Purpose |
|---|---|
| `room` | one tool dispatched on `op`: `join` · `read` · `post` · `claim` · `release` · `board` · `topics` · `mute` · `unmute` · `tree` · `zoom` · `recall` |
| `wait_for_claim` | block until this agent holds a resource |
| `wait_for_agent` | block until named agents reach a status |
| `wait_for_message` | block until a matching room message arrives |

Plus the `/room` panel (a chat|board split with a roster line) and inline transcript cards. Every tool
returns `content: [{type:"text", text}]` plus `details`; a timeout is a **normal outcome**
(`outcome: "event" | "timeout" | "aborted"`), never a throw.

The op-by-op contract, the caps, the config and the known limits are in
[`plugin/README.md`](plugin/README.md) — that is the operational document, this file is the front
door.

## Where the room data lives

The room is keyed by the **project directory** (`ctx.cwd`, inherited by subagents), so the main
session and every agent it spawns share one room. It lives in the **global omp session store**, not
in the project tree:

```
<sessions>/rooms/<16 hex chars of the project path>/room/{config.json,<roomId>.jsonl}
```

where `<sessions>` is `getSessionsDir()` — `~/.omp/agent/sessions`, or `$XDG_DATA_HOME/omp/sessions`
under XDG. The leaf is `sha256(projectPath).slice(0,16)`, so a checkout stays clean and needs no
`.omp-room/` ignore entry.

Two deliberate exceptions: a project under the system temp dir stays project-local
(`<cwd>/.omp-room`), so a test or throwaway worktree never writes into the real room store; and a
legacy `<cwd>/.omp-room` is **moved** into the global store once, on first open — copied with its
pinned room id, verified, then removed. A skipped migration (legacy room held by a live omp
process, pinned room id matches no log, or the target already has a room) removes nothing.

**One omp process per project.** The room takes a single-writer lockfile (`<root>/room/.lock`, the
owner's pid, stale pids reaped). A second omp process on the same project fails loudly with
`room file locked by pid N` rather than minting colliding seqs — two writers were measured producing
10 duplicate seqs over 40 records without ever seeing each other's records. A swarm of subagents is
unaffected: they live in the same process and share one room and one lock.

## Current state

The plugin is **built**. Host pin: **omp 18.12.3** (`plugin/src/version.ts`, mirrored in the peer
and dev dependencies). Runtime is Bun only; there is no build step.

Gates, all green:

| Gate | Result |
|---|---|
| `bun test tests/` | **302 pass / 0 fail**, 15 files |
| `bunx --bun tsc --noEmit -p tsconfig.json` | **0 errors** |
| `bunx --bun @biomejs/biome check src tests` | **0 errors, 0 warnings** |
| Remaining `not implemented` stubs | **0** |

Verified **live** against host 18.12.3 — every surface was exercised by a real model in a real
terminal or a real session: the `/room` panel and its keys in a real terminal (raw pty, 120x40),
the inline cards in a real transcript, the claim board (a second claim refused, naming the holder),
mention delivery (a subagent's post arriving as a real T0 steer), all three wait tools'
`outcome: "event"`, the legacy migration keeping its room id, the cold-tree summaries (faithful at
the leaves, and a prompt injection inside a room message summarised as DATA, never obeyed), and the
**unprompted discovery rate** — measured over 16 trials at **85.7 %** (75.0 % counting the two
harness-error trials as misses), with a plugin-not-loaded control producing zero room calls.

The one thing that cannot be verified is live coordination across two omp *processes*: the
single-writer lock refuses the second writer by design, so that boundary is documented rather than
tested.

## Layout

| Path | What |
|---|---|
| `plugin/` | the plugin — `src/`, `tests/`, `skills/`, and its own [`README.md`](plugin/README.md) |
| `plugin/src/store/` | room root, log, projection, claim arbiter, cursors, tree, compactor |
| `plugin/src/attention/` | tier classification, governor, delivery adapter |
| `plugin/src/panel/`, `plugin/src/cards/` | the TUI overlay and the inline cards |
| `plugin/src/tools/` | the `room` tool and the three wait tools |
| `.omp/extensions/chatroom.ts` | the project-extension shim |
| `docs/research/` | the design record that produced it |
| [`AGENTS.md`](AGENTS.md) | the working guide for agents in this repo |

## Reading further

- [`plugin/README.md`](plugin/README.md) — the operational contract: every op, the caps, the config,
  the known limits.
- [`AGENTS.md`](AGENTS.md) — architecture, the invariants (I1–I13), and the development commands.
- [`docs/research/omp-agent-chatroom/HANDOFF.md`](docs/research/omp-agent-chatroom/HANDOFF.md) —
  **the current-state entry point**: gates, the live-verification evidence, what is still unverified.
- [`docs/research/omp-agent-chatroom/`](docs/research/omp-agent-chatroom/) — the design record
  (brief → reports → `PLAN-build.md` → build).
