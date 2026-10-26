# omp-agent-chatroom

An in-process coordination room for [omp](https://omp.sh): a **claim board** with leases, a bounded
chat log every agent in a session tree shares, tiered attention, blocking waits, and a cold summary
tree over the log.

omp already ships point-to-point messaging (`agent://<id>`, `agent://all`), hard interrupts, idle wake
and revival. What it does not expose is *room semantics* — exclusive ownership of a named resource with
a lease, a shared durable record, tiered attention, and bounded blocking waits. This plugin adds that
one layer; it does not replace the native path.

## Why not the native IRC + `agent://` messaging

`agent://` is an internal URL scheme, not a chat server: one `IrcBus` per omp process, no network, no
second writer. `agent://all` is a fan-out — N independent one-to-one writes, each with its own mailbox
and receipt, and **write-only**: there is no shared object a late agent can read back. Its wire format
carries `id, from, to, body, ts` and nothing else — no priority, no topic, no expiry
(`pi-tui/src/tools/irc.ts:7-24`).

The gap is semantics, not transport. That was R1's central verdict, and the plugin is the answer to
it:

| Gap | What breaks without it |
|---|---|
| **Exclusive ownership with a lease** | Two agents pointed at the same file have no way to agree who owns it first. Work is duplicated or overwritten. |
| **A shared, readable record** | A broadcast reaches the agents alive at that instant and nobody after. A claim or finding posted while an agent was parked is gone. |
| **Tiered attention** | Every message is either an interrupt or noise. There is no way to say "this matters to me" vs "this matters to them". |
| **Bounded blocking waits** | Polling, or parking forever with no way to be woken by a specific fact. |
| **A durable summary of the past** | The log grows without bound; the tail crowds out everything before it. |

The lease is enforced **inside the room**, and it is not a filesystem lock — see "What the lease is,
and what it is not" below.

### The asymmetry to remember

An interrupt *intent* is not an interrupt *strength*, and the two channels differ in **precision**,
not force:

- A **room mention is T0**. It wakes an idle agent (a real turn starts) and steers a streaming one —
  the same steering queue a parent's `agent://<id>` message uses, so neither aborts the running tool
  call; both land at the target's next step boundary. A plain room post (T1) is weaker: it is a
  non-interrupting aside. The mention's T0 class — `@mention`, reply-to-your-message,
  lease-revoked — is computed *per viewer*, so a correction posted to the room reaches every agent it
  classifies.
- A **native `agent://<id>`** message has one addressee, a bounded blast radius, and no shared record.
  Use it to correct or steer one agent.

So: `agent://<id>` to redirect one agent, the room to tell several agents the same thing. Think of
the room as a **coordination artifact, not a chat**: the claim board and the status ledger are the
value — who owns what, who is waiting on whom, what was decided. The chat log is the audit trail,
not the coordination mechanism. (A head-to-head measurement of room-vs-`agent://` on identical tasks
does not exist yet; the claim above is the evidenced gap table, not a benchmark.)

The full argument, with host-source citations and what breaks without each piece, is in
`docs/research/omp-agent-chatroom/room-vs-native.md`.

## Install

Two routes, pick one.

**Plugin link (the packaged route).**

```sh
cd plugin
omp plugin link .
```

That symlinks the package into `~/.omp/plugins/node_modules/omp-agent-chatroom` and the manifest's
`omp.extensions` entry (`./src/index.ts`) loads on the next session start. Verify with
`omp plugin doctor`. There is no build step — Bun runs the TypeScript directly.

**Project extension (what this repo uses).**

`.omp/extensions/chatroom.ts` re-exports `../../plugin/src/index.ts`. omp discovers project
`.omp/extensions/*.ts` automatically, so a session started in this repo loads the room with no install
step. Use the link route when you want it in every project.

The bundled skill lives at `plugin/skills/omp-agent-chatroom/SKILL.md` and is found by the plugin
provider's conventional `skills/` directory scan. It is **not** named in the manifest —
`PluginManifest` has no `skills` field.

## What an agent sees

Four tools, all with `loadMode: "essential"` so they stay top-level:

| Tool | Purpose |
|---|---|
| `room` | join / read / post / claim / release / board / topics / mute / unmute / tree / zoom / recall |
| `wait_for_claim` | block until this agent holds a resource |
| `wait_for_agent` | block until named agents reach a status |
| `wait_for_message` | block until a matching room message arrives |

Plus a `/room` panel and inline transcript cards.

The cards' and the panel's glyphs come from the host's **active symbol set** (unicode / nerd /
ascii, whichever the user configured): the tool cards' icons are symbol keys (`status.info` for
`room`, `status.pending` for the wait tools), the message card's envelope is the host's `tool.irc`
symbol, the claim card's flag is `status.pending`, the release marker is `status.error` and the
board-delta grid is `status.info`.

**The plugin paints no decorative glyph of its own in the panel and the cards.** The literals it
still writes are, and only:

- **text punctuation** — the `…` that marks a cut (`cards/body-lines.ts`,
  `cards/message-cards.ts`, `panel/panel.ts`) and the `—` in a notification
  (`panel/panel.ts`);
- **a text delimiter** — the `|` between the pane names in the panel title (`panel/panel.ts`): a
  literal ASCII pipe inside a bracketed label, not a glyph (the theme's `sep.pipe` carries flanking
  spaces and would change the label's shape and the title's cell budget);
- **the model-facing prose arrows** — `⟵` in the attention deliveries and the tool descriptions and
  `→` in the wait tools' texts (`attention/delivery.ts`, `attention/governor.ts`, `tools/room.ts`,
  `tools/wait-for-claim.ts`, `tools/wait-for-agent.ts`, `tools/wait-for-message.ts`). Those are
  TEXT in the model's input, not painted glyphs, and the model's contract is deliberately out of
  the symbol set's scope: changing them would change what the model is told.

The fallback theme it uses when the host hands it an unusable one answers from a **snapshot** of
the host's active glyphs, captured when the fallback is built: the table members and `symbol()`
read that one map, so they can never disagree with each other, and the fallback never asks the
host's symbol mirror for a glyph — so a mirror pointing at the fallback can never recurse. The
preset it reports is the one that snapshot was taken under, not the host's current one.

It is also **complete**: the fallback is published into the host's own theme singleton (the
panel's frame is drawn by the host's chrome helpers, which read that singleton), and in
production the plugin and the host share one `pi-tui` instance — so a published fallback is the
host's theme, and the host reads its own members off it. Every public member of the host's
`Theme` class is therefore answered, colourlessly, and the test derives that member list from
the host's class itself: a member the host adds later fails the test, not the host's next frame.

## The `room` tool

One tool, dispatched on `op`. Every op returns `content: [{type:"text", text}]` (always present — the
host coerces a result without it to an error) plus `details` carrying `ok` and the payload.

| op | required args | effect | `details` |
|---|---|---|---|
| `join` | — | register membership; mint a cursor at `logEnd − 50`. Idempotent | `{ ok, digest, cursor }` |
| `read` | `since?`, `limit?` | records after the cursor; 50 default / 200 max | `{ ok, records, cursor, more }` |
| `post` | `topic`, `body`, `mention?`, `replyTo?`, `performative?`, `idemKey?`, `gen?`, `status?` | append a msg, then notify per recipient | `{ ok, id, seq, tier, idempotent? }` |
| `claim` | `topic`, `key`, `ttl?`, `dependsOn?`, `gen?` | grant exclusive ownership of `"<topic>/<key>"`; claiming it again renews your lease | `{ ok, holder, expiresAt, gen }` |
| `release` | `topic`, `key` | drop a claim you hold | `{ ok }` |
| `board` | — | claims + roster + per-agent lag + topic unread counts, and **who is blocked on what** | `{ ok, board }` |
| `topics` | — | topic list with unread counts | `{ ok, topics: [{topic, unread, lastSeq}] }` |
| `mute` / `unmute` | `topic?` (omit = whole room) | per-agent mute set | `{ ok }` |
| `tree` | — | the current `view.json` tiling: which seq ranges, raw or summarised | `{ ok, blocks: [{lo, hi, size, raw, summary?}] }` |
| `zoom` | `lo`, `hi` | descend one level into a node | `{ ok, children: [{lo, hi, size, raw, text}] }` |
| `recall` | `pattern` | regex search over the raw log, newest first, cap 100 | `{ ok, matches: [{seq, record}] }` |

Units, stated because they are all milliseconds on the wire:

- `ttl` (claim) — **milliseconds**, default 300 000 (5 min), clamped to 1 000…86 400 000.
- `since` (read) — a **seq number**, not a timestamp.
- `limit` (read) — a **record count**, 1…200.
- `expiresAt` / `acquiredAt` (board) — **epoch ms**.
- `lag` — a **record count** behind the log head, not a duration.
- `tier` (post) — `"T0" | "T1" | "T2"`, the tier your own message was classified as.

A claim is **mandatory-TTL**: there is no zero-lease claim. A claim held past its TTL is reclaimable by
anyone, and reclaiming is explicit and logged (`release{reason:"reclaimed"}`), never silent. A 5 s
sweep job expires stale claims and promotes the oldest waiter.

### Leases, dependencies, and the fencing token

**Renewing.** The TTL is a guess about how long the work takes. **Claiming a resource you already
hold renews it** — the same op, no new one — and the lease's start moves to now. A claim that was
refused with "held by *you*" was a wart; now it is the renewal.

**Dependencies.** A claim may carry `dependsOn: ["<topic>/<key>", ...]`: the resources that must be
free before it can start. While one of them is held, the claim is **refused** and the refusal names
the resource *and* its holder, so the agent can `wait_for_claim` on it instead of duplicating the
work. A dependency nobody holds is satisfied.

**The fencing token.** Every grant carries a `gen` — a per-resource counter that rises when
**ownership** changes and stays put on a renewal. Presenting a stale `gen` (on a claim, or on a post
into a topic you claim) is refused, so an agent whose lease was reclaimed cannot land a late write
on top of the new holder's work. The fence is opt-in: a call without a `gen` is the ordinary path.

**What the lease is, and what it is not.** The board is enforced **inside the room**: only one agent
holds a claim, a stale write into the room is refused, and a dependency that is still held refuses
the claim. It is **not** a lock on your files: agents edit files through the host's own tools,
which the room never sees, so nothing here can stop an agent from editing a file it does not hold.
A claim is a **signal plus a room-level fence** — treat it as the strongest signal available, and
not as a mutex on the filesystem.

**Deadlock.** A wait that would close a cycle in the room's wait-for graph is **refused**, with the
cycle named in `details.cycle`. The graph spans all three wait mechanisms, because a cycle can span
them: an agent waiting for a claim while another waits for a message from the first is as deadlocked
as two agents waiting for each other's claims.

**The topic's status ledger.** A post may carry `status`: Magentic-One's five keys
(`is_request_satisfied`, `is_in_loop`, `is_progress_being_made`, `next_speaker`,
`instruction_or_question`), each `{reason, answer}`, checked on write. Only the agent **holding the
topic's claim** may write it — in a flat room that is the coordination role, and the claim holder is
the router. A ledger whose `is_in_loop` answer is `"yes"` **interrupts** the agents following that
topic, and only them: the failure it prevents is a swarm repeating itself until the timeout.

**Idempotency.** A post may carry an `idemKey`: a repeat with the same key returns the **first**
post instead of appending a second (a double post double-wakes every agent it mentions). A key
reused for different parameters is an error, not a silent second post.

Failures are normal results, not exceptions: `details:{ ok:false, error }` with a `content` line.
`claim` losing a race returns the holder and its expiry; `release` by a non-holder returns
`not holder`. A `recall` pattern longer than 200 chars, or one with a quantifier over a quantified
group (`(a+)+` — exponential on a non-matching input), returns `{ ok:false, error }` rather than
hanging the process.

### Delivery — posting actually notifies

A `post`/`claim`/`release` does not merely append. After the synchronous append, the attention
pipeline runs per recipient: `classify` → mute check → rate limit → `deliver`. Delivery happens
**after** the append and is wrapped in try/catch, so a transport failure cannot corrupt the log or
throw out of `execute`; it surfaces as `deliveryError` on `details`.

A delivery never waits for the recipient's whole turn. The host's `sendCustomMessage` resolves when
the *target's* turn ends, so the send is bounded (250 ms): a rejection inside the bound still
surfaces as `deliveryError`, and a recipient that is busy does not hold up the others. Without that
bound, two agents talking to each other would deadlock — A's post waits for B's turn, B's turn
posts and waits for A's post.

| Tier | Kinds | Delivery | Wakes? |
|---|---|---|---|
| **T0** | direct mention, reply to your message, claim you waited on, your lease revoked | wake + steer | yes |
| **T1** | post on a topic you follow, claim status change, reply in a joined thread | `deliverAs: "aside"` | only if idle |
| **T2** | general chatter, presence, progress, unaddressed broadcast | cursor only; never injected | never |

Caps: K=10 T1/turn, B=2048 tokens/turn, N=20 T2 coalesce count, T=5 min lag, srTCM 1 post/2 s with
burst 10. T0 is never dropped — past its ceiling it coalesces into one batched interrupt.

## The three wait tools

```
wait_for_claim   { resource: "<topic>/<key>", timeout?, ttl?, maxWaitMs? }
wait_for_agent   { agents: [...], timeout? }
wait_for_message { source: "room", topic?, mention?, from?, timeout? }
```

All three return a **normal** timeout, not an error — `{ ok: true, outcome: "timeout" }` with
`useless: true` so compaction can elide it. `outcome` is `"event" | "timeout" | "aborted"`, and
every wait observes the abort signal directly and settles. The timeouts differ, and the difference
is the contract: `wait_for_claim` defaults to **20 000 ms** (max 300 000); `wait_for_agent` and
`wait_for_message` default to **30 000 ms** (max 1 800 000).

Three footguns closed deliberately:

- `wait_for_agent` **requires** an explicit `agents` list. Omitting it is rejected rather than
  broadcast, which would silently wait on the whole tree.
- `wait_for_message`'s `source` enum is `["room"]` only. It does not consume the native IRC stream.
- A wait that would close a **cycle** in the room's wait-for graph is refused, with the cycle in
  `details.cycle`. The graph spans all three mechanisms, because a cycle can span them.

## Configuration

The manifest deliberately carries no `settings` block: `PluginManifest.settings` is CLI-facing
validation only, and `ExtensionAPI` has no `settings` property, so a manifest setting is unreachable
from extension code. The plugin owns a real config file inside the room root
(`<room root>/room/config.json`, and the room root is in the global session store — see below),
surfaced via `/room config`.

Load order, highest first: **registered flags → config file → built-in defaults**. Unknown keys are
ignored, wrong-typed values fall back to defaults.

| Flag | Type | Default | Effect |
|---|---|---|---|
| `--room-panel-key` | string | `""` | keyboard shortcut that opens the panel; empty disables |

`--room-panel-key` is best-effort: the host's `setupKeyHandlers()` runs only at editor build, so a
late-loaded plugin has no shortcut until the next rebuild. The slash command is the primary route.

## The room is one per project

The room is keyed by the **project directory** (`ctx.cwd`), not the `local://` root. That is
deliberate: `localProtocolOptions` is per-session — a subagent's artifacts dir is its own session
file minus `.jsonl` — so keying the room there gave every agent a private room and the claim board
coordinated nobody. `ctx.cwd` is inherited by subagents, so main and children share one room.

The room **lives in the global omp session store**, not in the project tree:
`<sessions>/rooms/<16 hex chars of the project path>/room/`, where `<sessions>` is
`getSessionsDir()` — `~/.omp/agent/sessions`, or `$XDG_DATA_HOME/omp/sessions` under XDG. The room
data is working data, so it does not belong in a checkout; the project directory stays clean. Two
exceptions: a project under the system temp dir stays project-local (a test or a throwaway worktree
must never write into the user's real room store — a temp-dir project that is itself a git checkout
may want its own `.omp-room/` ignore entry), and a legacy project-local `.omp-room/` is MOVED into
the global store once, on first open: it is copied there, keeping its room id, and then removed, so
the project tree ends up with no `.omp-room` at all and a checkout needs no `.omp-room/` ignore
entry. A migration that is skipped — the legacy room is held by a live omp process, the pinned room
id matches no log, or the target already has a room — removes nothing and leaves the legacy room
byte-for-byte intact.

Only one omp process per project may write it, and that is now enforced rather than assumed: the
room takes a lockfile (`<root>/room/.lock`, the owner's pid, stale pids reaped) and a second omp
process on the same project fails loudly with `room file locked by pid N`. Two writers were measured
minting 10 duplicate seqs over 40 records without ever seeing each other's records. A swarm of
subagents is unaffected — they live in the same process and share one room and one lock.

## Development

```sh
cd plugin
bun test tests/                                 # 528 tests, 18 files
bunx --bun tsc --noEmit -p tsconfig.json        # typecheck only
bunx --bun @biomejs/biome check src tests       # lint + format check
bunx --bun @biomejs/biome check src tests --write   # apply fixes
```

Bun only — never Node, npm, or npx. There is no build step; the design record behind every constant
is in `docs/research/omp-agent-chatroom/`, with `HANDOFF.md` as the current-state entry point.

## Known limits

- **One omp process per project directory.** See the section above.
- **Restricted and plan-mode children get no extension tools.** The room tool is never admitted to a
  session with `restrictToolNames`, so such an agent is simply not a member of the room. Do not design
  a protocol that assumes it will answer a post.
- **Embeddings are deliberately deferred, not rejected.** Recall is the raw log and the cold tree;
  there is no vector index. The revisit trigger is the log growing past ~10⁵ records, or observed "we
  discussed this but I cannot find it" failures. See
  `docs/research/embeddings/CONCLUSION.md`. Count them as zero-match `room recall` results with `recallMiss:true` in details; watch miss rate over recalls on a non-empty log.
- **The room is not a token-cost win.** Coordination overhead can exceed per-turn task tokens for
  short-turn work. Its value is correctness — preventing duplicated work on a shared resource — not
  efficiency.
- **Room message volume has no study behind it.** The design caps it rather than proving it helps.
- **No hot reload.** Editing the plugin needs a new session (or a session switch) before the change
  is live; extension code is loaded once per session tree.
- **Deep host imports.** The plugin imports wildcard-only subpaths, not public API. They are pinned to
  the host version and `tests/drift.test.ts` fails the build when the installed host drifts.
