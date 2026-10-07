# omp-agent-chatroom

An in-process coordination room for [omp](https://omp.sh): a **claim board** plus a bounded chat
log that every agent in one session tree shares.

omp already gives agents point-to-point messaging (`write agent://<id>`, `agent://all`) and
hierarchical steering. What it does **not** expose is any lock, claim, or reserve primitive — two
agents pointed at the same file have no way to agree who owns it first. That gap is the reason this
plugin exists. The room adds exactly one thing the native path cannot do: **exclusive ownership of a
named resource with a lease**.

This is the **Option A** build (`PLAN-build.md` §1.4): store + claim board + the `room` tool op +
join digest + routing rule + `wait_for_claim`. There is no TUI panel, no inline transcript cards, no
cold summary tree, and no attention governor. The board is read with `room{op:"board"}` or `/room
board`.

## Install

Two routes. Pick one.

**Plugin link (the packaged route).**

```sh
cd plugin
omp plugin link .
```

That symlinks the package into `~/.omp/plugins/node_modules/omp-agent-chatroom`, and the manifest's
`omp.extensions` entry (`./src/index.ts`) is loaded on the next session start. Verify with
`omp plugin doctor`. There is no build step — Bun runs the TypeScript directly.

**Project extension (what this repo uses).**

`.omp/extensions/chatroom.ts` is a one-line shim:

```ts
export { default } from "../../plugin/src/index.ts";
```

omp discovers project `.omp/extensions/*.ts` automatically, so a session started anywhere in this
repository loads the room without any install. Use this route when you are developing the plugin
itself; use `omp plugin link` when you want it in every project.

Either way the bundled skill (`skills/omp-agent-chatroom/SKILL.md`) is found by the plugin
provider's conventional `skills/` directory scan — it is **not** named in the manifest, because
`PluginManifest` has no `skills` field.

## The `room` tool

One tool, dispatched on `op`. All six ops return the uniform host result contract:
`content: [{type:"text", text}]` (always present — a result without it is coerced to an error by the
host) plus `details` carrying `ok` and the structured payload.

| op | required args | effect | `details` |
|---|---|---|---|
| `join` | — | register membership; mint a cursor at `logEnd − 50`. Idempotent — a second join appends nothing | `{ ok, digest, cursor }` |
| `read` | `since?`, `limit?` | records after the cursor; `limit` defaults to 50, max 200 | `{ ok, records, cursor, more }` |
| `post` | `topic`, `body`, `mention?`, `replyTo?`, `performative?` | append a `msg`; body capped at `maxBodyBytes` (8 KiB) | `{ ok, id, seq }` |
| `claim` | `topic`, `key`, `ttl?` | grant exclusive ownership of `"<topic>/<key>"`, or return the current holder | `{ ok, holder, expiresAt }` |
| `release` | `topic`, `key` | drop a claim you hold | `{ ok }` |
| `board` | — | current claims + roster + per-agent lag + topic unread counts | `{ ok, board }` |

Units, stated because they are all milliseconds on the wire:

- `ttl` (claim) — **milliseconds**, default `claimTtlMs` (300 000 ms = 5 min), clamped to
  1 000…86 400 000.
- `since` (read) — a **seq number**, not a timestamp.
- `limit` (read) — a **record count**, 1…200.
- `expiresAt` / `acquiredAt` (board) — **epoch ms**.
- `lag` — a **record count** behind the log head, not a duration.

A claim is **mandatory-TTL**: there is no zero-lease claim, and a claim held past its TTL is
reclaimable by anyone. Reclaiming is explicit and logged (`release{reason:"reclaimed"}`), never
silent. A 5 s sweep job expires stale claims and promotes the oldest waiter.

Failures are normal results, not exceptions: `details:{ ok:false, error }` with a `content` line.
`claim` losing a race returns the holder and its expiry; `release` by a non-holder returns
`not holder`; an unknown resource returns `unknown resource`.

## `wait_for_claim`

```
wait_for_claim { resource: "<topic>/<key>", timeout?, ttl?, maxWaitMs? }
```

Blocks until this agent **holds** the claim, then returns
`details:{ ok:true, outcome:"event", acquired:true, claim }`.

- `timeout` — ms, default **20 000** (SQS's maximum long poll), max 300 000.
- `ttl` — the lease granted when the wait succeeds; defaults to `claimTtlMs`.
- `maxWaitMs` — optional livelock guard bounding the total wait even across re-queues.

Timeout is a **normal outcome**, not an error: `details:{ ok:true, outcome:"timeout",
acquired:false }`. If another agent grabs the resource first the waiter is **re-queued**, not
failed — it never resolves `acquired:false` except on timeout. `outcome` is one of
`"event" | "timeout" | "aborted"`. The tool observes the abort signal directly and always settles.

`wait_for_agent` and `wait_for_message` are **not** in this build (Option A drops them; see the
plan §1.4). For peer state use the native `agent://` / Agent Hub surfaces.

## Routing rule

Every session start appends a digest plus this rule to the system prompt (two separate blocks — the
digest budget never truncates the rule). The full text ships as
`src/onboarding/routing-rule.md`; the summary:

- **Use `agent://<id>`** when exactly one agent is the recipient, when recipients must not see each
  other's replies, when the message must interrupt a *running* agent, or when broadcasting it would
  amplify an error.
- **Use the room** when several recipients must see the message **and each other's responses**, and
  for coordination artifacts: claims, releases, shared findings, status, async non-urgent updates.
- When in doubt, use the room.
- An interrupt *intent* is not an interrupt *strength*: a parent `agent://` message hard-steers a
  streaming agent; a room mention does not.

## Caps

The active values, as implemented (`src/store/config.ts`; `src/store/room-store.ts` for retention):

| Knob | Value | Where it bites |
|---|---|---|
| `claimTtlMs` | 300 000 ms (5 min) | default lease for `claim` / `wait_for_claim` |
| `claimSweepMs` | 5 000 ms | the expiry sweep; the only producer of `release{reason:"expired"}` |
| `maxBodyBytes` | 8 192 (8 KiB) | `post` rejects a larger body — never truncated silently |
| `logMaxRecords` | 5 000 | in-memory projection retention |
| `logMaxAgeMs` | 604 800 000 ms (7 d) | in-memory projection retention |
| `digestBudgetTokens` | 3 800 | the join digest only; the routing rule is excluded |
| `read` limit | 50 default / 200 max | `room{op:"read"}` |
| roster / claims in digest | 32 / 10 | digest truncation |
| raw backlog in digest | 50 records | the last 50 records |

**The JSONL log file is never truncated** — retention prunes the in-memory projection only.

## Configuration

The manifest deliberately carries **no `settings` block**. Even if it did, `PluginManifest.settings`
is CLI-facing validation only — it is read by `omp plugin config`, and `ExtensionAPI` has no
`settings` property (`getPluginSettings` is a loader function), so a manifest setting is unreachable
from extension code. The plugin therefore owns a real config file, and `/room config` is its
surface:

```
<local:// root>/room/config.json
```

Load order, highest first: **registered flags → config file → built-in defaults**. Unknown keys are
ignored and wrong-typed values fall back to their defaults; the file is on-disk input.

Registered flags (per-launch overrides — they only override the file when set to a non-default
value, because `getFlag` always returns a value):

| Flag | Type | Default | Effect |
|---|---|---|---|
| `--room-panel-key` | string | `""` | reserved for the Option B panel shortcut; empty disables |
| `--room-cold-tree` | boolean | `true` | reserved for the Option B cold tree |

`/room config` prints the resolved config (including which knobs are inert under Option A), and
`/room config set <key>=<value>` writes the file.

### `/room` subcommands

`board`, `join`, `claim <topic> <key> [ttlMs]`, `release <topic> <key>`, `post <topic> <body>`,
`config [set <key>=<value>]`. Tab completion returns the subcommands filtered by prefix.

The command works **headlessly**: it calls the store directly and reports through `ctx.ui.notify`
when a UI is present, or the host log otherwise. There is no panel, so nothing here depends on TUI
mode.

## Known limits

- **In-process only.** The room log lives under the shared `local://` root, but only one omp process
  may write it. Atomicity rests on single-threaded JS and synchronous `O_APPEND` writes; a second
  process writing the same file would tear lines. There is no cross-process locking, and the room is
  not a system of record — bulk artifacts belong on `local://` / `artifact://`.
- **Restricted and plan-mode children get no extension tools.** This is a host rule, not a plugin
  setting: extension tools are never admitted to a session with `restrictToolNames`. Such an agent
  is simply "not a member" of the room. Normal `task` subagents are unrestricted and do get it.
- **Embeddings are deliberately deferred.** Recall is the raw log and the last-50-record tail; there
  is no vector index and no semantic search. The board, not retrieval quality, is what carries the
  value, and an embedding index would add a model dependency and a staleness problem for a log that
  is already bounded by cursor.
- **No hot reload.** Editing the plugin needs a new session (or a session switch) before the change
  is live; extension code is loaded once per session tree.
- **The room is not a token-cost win.** Coordination overhead can exceed per-turn task tokens for
  short-turn work. Its value is correctness — preventing duplicated work on a shared resource — not
  efficiency.
- **Deep host imports.** The plugin source itself imports two wildcard-only subpaths
  (`session/harness-tags`, `internal-urls/local-protocol`); the test suite adds two more
  (`registry/agent-registry`, `utils/event-bus`). They are pinned to host `18.7.0` in
  `peerDependencies`, and `tests/drift.test.ts` fails the build when the installed host drifts.

## Development

```sh
bun test tests/                                 # 62 tests
bunx --bun tsc --noEmit -p tsconfig.json        # typecheck only; Bun executes the TS
```

There is no lint, format, or build step. `PLAN-build.md` §9 holds the per-phase acceptance checks;
the design record behind every constant above is in `docs/research/omp-agent-chatroom/`.
