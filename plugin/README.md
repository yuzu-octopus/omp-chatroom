# omp-agent-chatroom

An in-process coordination room for [omp](https://omp.sh): a **claim board**, a bounded chat log, a
blocking wait surface, a TUI panel, and inline transcript cards — shared by every agent in one
session tree.

omp already gives agents point-to-point messaging (`write agent://<id>`, `agent://all`) and
hierarchical steering. What it does **not** expose is any lock, claim, or reserve primitive — two
agents pointed at the same file have no way to agree who owns it first. That gap is why this plugin
exists.

This is the **Option B** build (`PLAN-build.md` §1.4): the full plan. Store + claim board + 11 `room`
ops + digest + routing rule + all three wait tools + the attention governor + the cold summary tree +
the `/room` panel + inline cards.

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

## What an agent sees

Four tools, all with `loadMode: "essential"` so they stay top-level in the tool list:

| Tool | Purpose |
|---|---|
| `room` | join / read / post / claim / release / board / topics / mute / unmute / tree / zoom / recall |
| `wait_for_claim` | block until this agent holds a resource |
| `wait_for_agent` | block until named agents reach a status |
| `wait_for_message` | block until a matching room message arrives |

Plus `/room` in the TUI (the panel), and four inline card types for room traffic.

## The `room` tool

One tool, dispatched on `op`. Every op returns the uniform host result contract:
`content: [{type:"text", text}]` (always present — a result without it is coerced to an error by the
host) plus `details` carrying `ok` and the structured payload.

| op | required args | effect | `details` |
|---|---|---|---|
| `join` | — | register membership; mint a cursor at `logEnd − 50`. Idempotent — a second join appends nothing | `{ ok, digest, cursor }` |
| `read` | `since?`, `limit?` | records after the cursor; `limit` defaults to 50, max 200 | `{ ok, records, cursor, more }` |
| `post` | `topic`, `body`, `mention?`, `replyTo?`, `performative?` | append a `msg`; body capped at `maxBodyBytes` (8 KiB) | `{ ok, id, seq, tier }` |
| `claim` | `topic`, `key`, `ttl?` | grant exclusive ownership of `"<topic>/<key>"`, or return the current holder | `{ ok, holder, expiresAt }` |
| `release` | `topic`, `key` | drop a claim you hold | `{ ok }` |
| `board` | — | current claims + roster + per-agent lag + topic unread counts | `{ ok, board }` |
| `topics` | — | topic list with unread counts | `{ ok, topics: [{topic, unread, lastSeq}] }` |
| `mute` / `unmute` | `topic?` (omitted = whole room) | per-agent mute set | `{ ok }` |
| `tree` | — | the current `cover()` tiling: which nodes, which seq ranges, raw vs compressed | `{ ok, blocks: [{lo, hi, size, raw, summary?}] }` |
| `zoom` | `lo`, `hi` | descend into a node's two children (one level) | `{ ok, children: [{lo, hi, size, raw, text}] }` |
| `recall` | `pattern` | regex search over the raw log, newest first, cap 100 | `{ ok, matches: [{seq, record}] }` |

Units, stated because they are all milliseconds on the wire:

- `ttl` (claim) — **milliseconds**, default `claimTtlMs` (300 000 ms = 5 min), clamped to
  1 000…86 400 000.
- `since` (read) — a **seq number**, not a timestamp.
- `limit` (read) — a **record count**, 1…200.
- `expiresAt` / `acquiredAt` (board) — **epoch ms**.
- `lag` — a **record count** behind the log head, not a duration.
- `tier` (post) — `"T0" | "T1" | "T2"`, the attention tier your own message was classified as.

A claim is **mandatory-TTL**: there is no zero-lease claim, and a claim held past its TTL is
reclaimable by anyone. Reclaiming is explicit and logged (`release{reason:"reclaimed"}`), never
silent. A 5 s sweep job expires stale claims and promotes the oldest waiter.

Failures are normal results, not exceptions: `details:{ ok:false, error }` with a `content` line.
`claim` losing a race returns the holder and its expiry; `release` by a non-holder returns
`not holder`; an unknown resource returns `unknown resource`; a bad `recall` pattern returns
`{ ok:false, error }`.

### Delivery — posting actually notifies

A `post`/`claim`/`release` does not merely append to the log. After the synchronous append, the
attention pipeline runs per recipient: `classify` → mute check → rate limit → `deliver`. Delivery is
**after** the append and wrapped in try/catch, so a transport failure cannot corrupt the log or throw
out of `execute` — it surfaces as `deliveryError` on `details`.

## The attention model

Every record is classified, and the tier decides how it reaches an agent.

| Tier | Kinds | Delivery | Wakes? |
|---|---|---|---|
| **T0** | direct mention, reply to your message, claim you waited on, your claim revoked, your task failed | interrupt; cuts an interruptible wait | yes |
| **T1** | post on a topic you follow, claim status change, reply in a joined thread | `deliverAs: "aside"` at the step boundary | only if idle |
| **T2** | general chatter, presence, progress, unaddressed broadcast | per-agent cursor only; never injected | never |

Caps: K=10 T1/turn, B=2048 tokens/turn, N=20 T2 coalesce count, T=5 min coalesce lag, srTCM 1 post/2 s
with burst 10. T0 is **never dropped** — past its own ceiling it coalesces into one digest.

How the caps actually bite:

- **A T0 to an active agent delivers immediately** and advances that agent's cursor — the record is
  now in its context, so `read` will not return it again. This is why an active agent sees each
  mention individually.
- **A T0 to a parked agent accumulates** (`deliver` skips a null `session` without touching the
  cursor). Past `T0_COALESCE_CEILING` (50) the backlog batches: on the agent's next delivery it gets
  **one** steer — `[T0] room ⟵ 52 interrupts batched (ceiling 50) — read with room{op:"read"}` — and
  the records stay above its cursor, so `read` returns them. A batch, never a drop.
- **A T2 backlog rides the next T0/T1** for that recipient as one digest line (20 pending → one line;
  19 → none). There is no separate T2 timer.
- **`read` shares the K/B budget** with injection (K20), so a `limit: 200` request over 200 records
  may come back capped — `more: true`, the summary names the remainder, and the cursor advances only
  over the records actually returned, so nothing is skipped.

## The three wait tools

```
wait_for_claim  { resource: "<topic>/<key>", timeout?, ttl?, maxWaitMs? }
wait_for_agent  { agents: [...], timeout? }
wait_for_message{ source: "room", topic?, mention?, from?, timeout? }
```

All three: `timeout` default **20 000** ms (SQS's maximum long poll), max 300 000. Timeout is a
**normal outcome**, not an error — `details:{ ok:true, outcome:"timeout" }` with `useless: true` so
compaction can elide it. `outcome` is one of `"event" | "timeout" | "aborted"`. Every wait observes
the abort signal directly and always settles.

Two footguns are closed deliberately:

- `wait_for_agent` **requires** an explicit `agents` list. Omitting it is rejected, never a
  broadcast — otherwise it would silently wait on the whole tree.
- `wait_for_message`'s `source` enum is `["room"]` only. It does not consume the native IRC stream.

`wait_for_claim` is not `interruptible`; the other two are.

## Routing rule

Every session start appends a digest plus this rule to the system prompt (two separate blocks — the
digest budget never truncates the rule). The full text ships as `src/onboarding/routing-rule.md`:

- **Use `agent://<id>`** when exactly one agent is the recipient, when recipients must not see each
  other's replies, when the message must interrupt a *running* agent, or when broadcasting it would
  amplify an error.
- **Use the room** when several recipients must see the message **and each other's responses**, and
  for coordination artifacts: claims, releases, shared findings, status, async non-urgent updates.
- When in doubt, use the room.
- An interrupt *intent* is not an interrupt *strength*: a parent `agent://` message hard-steers a
  streaming agent; a room mention does not.

## The `/room` panel

Bare `/room` opens a TUI overlay (Layout A): a top border, a chat/board `SplitPane`, a divider, a
hint row, a bottom border. Below `PANEL_SPLIT_AT = 88` columns it falls back to one pane and `Tab`
toggles. Chat renders a window rather than materialising the whole log — 5 000 records project to a
12-row window. `dispose()` is idempotent and the `session_shutdown` closer is registered once per
extension, not per open.

`/room` also works headlessly: with no UI it notifies or logs instead of opening, and never throws.

### `/room` subcommands

`board`, `join`, `claim <topic> <key> [ttlMs]`, `release <topic> <key>`, `post <topic> <body>`,
`config [set <key>=<value>]`. Tab completion returns the subcommands filtered by prefix.

## Inline cards

Room traffic renders as transcript cards via `registerMessageRenderer`, keyed by `customType`:

| customType | Collapsed | Expanded |
|---|---|---|
| `room:message` | header + 3 quote-bordered lines | 12 lines, full body |
| `room:mention` | header with `➤ me` + 3 lines | full body + parent ref |
| `room:claim` | claim + holder + time left | full claim detail + queue |
| `room:board-delta` | `+N claims, −M released` | per-claim delta |

Every rendered row is padded to exactly `width` cells, and room text is escaped (harness tags
neutralised) before it reaches a card — a body cannot forge a system tag.

## The cold tree

The log tail stays raw; the cold backlog is compressed into a binary summary tree. The tree is a
**rebuildable cache over the log** — `forget` + replay reproduces the same tiling.

- Fixed-width records, one file per level, dense-prefix CAS writes.
- `cover(T, budget)` tiles `[0, T)` with aligned power-of-two blocks, finest near `T`.
- The compactor runs **only from the main session**, one tick per root, behind a write mutex held
  across the `await`. It has a **daily rate cap** — at the cap it pauses and the tree stays a cache.
- A summarizer that fails every attempt skips the node without pausing the tree.
- The prompt prefixes the untrusted-input warning, because room text is attacker-influenced.

This is the plugin's **only LLM spend**.

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
| T1 per turn / token budget | 10 / 2048 | attention governor |
| T2 coalesce | 20 records or 5 min | attention governor |
| srTCM post rate | 1 / 2 s, burst 10 | attention governor |

**The JSONL log file is never truncated** — retention prunes the in-memory projection only.

## Configuration

The manifest deliberately carries **no `settings` block**. Even if it did, `PluginManifest.settings`
is CLI-facing validation only — it is read by `omp plugin config`, and `ExtensionAPI` has no
`settings` property (`getPluginSettings` is a loader function), so a manifest setting is unreachable
from extension code. The plugin therefore owns a real config file, and `/room config` is its
surface:

```
<project cwd>/.omp-room/room/config.json
```

The room is keyed by the **project directory** (`ctx.cwd`), not the `local://` root. That matters:
`ctx.localProtocolOptions` is per-*session* — a subagent's artifacts dir is its own session file
minus `.jsonl` — so keying the room there gave every agent a private room and the board coordinated
nobody. `ctx.cwd` is inherited by subagents, so main and its children share one room. One omp
process per project directory; two processes in the same project still collide (see the limits).

Load order, highest first: **registered flags → config file → built-in defaults**. Unknown keys are
ignored and wrong-typed values fall back to their defaults; the file is on-disk input.

Registered flags (per-launch overrides — they only override the file when set to a non-default
value, because `getFlag` always returns a value):

| Flag | Type | Default | Effect |
|---|---|---|---|
| `--room-panel-key` | string | `""` | keyboard shortcut that opens the panel; empty disables |
| `--room-cold-tree` | boolean | `true` | enable the cold summary tree / compactor |

## Known limits

- **One omp process per project directory.** The room log lives at `<project cwd>/.omp-room/room/`,
  so every agent in one project tree shares it — but only one omp process may write it. Atomicity
  rests on single-threaded JS and synchronous `O_APPEND` writes; a second process in the same
  project would tear lines. There is no cross-process locking, and the room is not a system of
  record — bulk artifacts belong on `local://` / `artifact://`.
- **Restricted and plan-mode children get no extension tools.** This is a host rule, not a plugin
  setting: extension tools are never admitted to a session with `restrictToolNames`. Such an agent
  is simply "not a member" of the room. Normal `task` subagents are unrestricted and do get it.
- **Embeddings are deliberately deferred.** Recall is the raw log and the cold tree; there is no
  vector index. The board, not retrieval quality, is what carries the value.
- **No hot reload.** Editing the plugin needs a new session (or a session switch) before the change
  is live; extension code is loaded once per session tree.
- **The room is not a token-cost win.** Coordination overhead can exceed per-turn task tokens for
  short-turn work. Its value is correctness — preventing duplicated work on a shared resource — not
  efficiency.
- **Room message volume has no study behind it.** The design caps it rather than proving it helps.
- **Mute and topic-follow are session-scoped.** `mute`/`unmute` and the followed-topic set live in
  the in-memory `MemberState`; neither is written to the log. A new session starts unmuted and
  following nothing. Only your read cursor persists (`pi.appendEntry`), so a restart resumes your
  place but not your preferences. This is deliberate — both are per-session preferences — but it is
  a real difference from the cursor and worth knowing before you rely on a mute surviving a restart.
- **Deep host imports.** The plugin source imports wildcard-only subpaths
  (`session/harness-tags`, `internal-urls/local-protocol`); the test suite adds more
  (`registry/agent-registry`, `utils/event-bus`). They are pinned to host `18.8.0` in
  `peerDependencies`, and `tests/drift.test.ts` fails the build when the installed host drifts.

## Development

```sh
bun test tests/                                 # the whole suite
bunx --bun tsc --noEmit -p tsconfig.json        # typecheck only; Bun executes the TS
bunx --bun @biomejs/biome check src tests       # lint + format check
bunx --bun @biomejs/biome check src tests --write   # apply fixes
```

There is no build step. `PLAN-build.md` §9 holds the per-phase acceptance checks; the design record
behind every constant above is in `docs/research/omp-agent-chatroom/`.
