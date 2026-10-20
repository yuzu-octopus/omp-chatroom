---
name: omp-agent-chatroom
description: Use when coordinating with peer agents in one omp session tree — claiming a shared resource, checking who holds a file or step, posting a shared finding, reading the room board, muting a noisy topic, searching the room log, or blocking until a peer, a message, or a claim arrives. Triggers on: claim a resource, who owns this file, is anyone working on this, coordinate with other agents, check the room, room board, post to the room, avoid duplicate work, wait for a claim, wait for an agent, wait for a message, release my claim, hand off a claim, record a finding for the team, shared status board, mute a topic.
---

# Agent Chatroom

One in-process room per session tree: a **claim board** plus a bounded chat log. Every agent in the
tree — the main session and normal `task` subagents — is a member. The room exists because omp has
**no lock, claim, or reserve primitive**: without it, two agents pointed at the same file have no
way to agree who owns it first.

## When to use the room vs `agent://`

Your system prompt already carries the full routing rule (`src/onboarding/routing-rule.md`) — it is
the source of truth and it is the same rule, so it is not repeated here. The one thing worth
remembering from it:

- **An interrupt *intent* is not an interrupt *strength*.** A plain room post (T1) does not steer a
  streaming agent — it may keep working on the wrong thing until its next step boundary. A room
  **mention** is T0: it steers the agent it names, at its next step boundary, and it steers every
  other agent the mention classifies as T0. To correct **one** running agent and nobody else, use
  `agent://<id>` — the difference is precision and the shared record, not force.
- **When in doubt, use the room.** It is cheap, and the log is the record a late agent can read.

## Module 1 — the claim cycle

Before starting work another agent might also start — a shared file, a build step, a migration —
claim it first. Read the board before you claim.

```
1. room { op: "board" }                                  # who holds what, and who is lagging
2. room { op: "claim", topic: "build", key: "step" }     # granted, or told the current holder
   ...do the work...
3. room { op: "release", topic: "build", key: "step" }   # drop it the moment you are done
```

If the claim is already held and you need it, **block** instead of polling:

```
wait_for_claim { resource: "build/step", timeout: 20000 }
```

Rules that are not optional:

- **Never assume a claim you did not take.** A granted claim is the only evidence you own a
  resource.
- **A claim is a lease with a mandatory TTL** (default 5 min). A claim you hold past its TTL is
  reclaimable, and both you and the reclaimer are told — explicitly and in the log.
- **Keep your own lease alive by claiming it again.** The TTL is a guess about how long your task
  will take; a second `claim` on a resource you already hold **renews** it (and extends the
  expiry). If your work is long, either claim with a `ttl` that covers it or renew when you are
  halfway through — do not let a live lease expire while you are still working on it.
- **Say what your work depends on.** A claim may carry `dependsOn: ["<topic>/<key>", ...]`: the
  resources that must be free before you can start. If one of them is still held, the claim is
  **refused** and the refusal names the holder — then `wait_for_claim` on it, and claim again when
  it frees. Use it when the next step needs another's result; do not use it for ordering you can
  simply wait for.
- **Release when done.** Holding a lease you no longer need blocks everyone queued behind you.
- **Keep the generation your claim was granted under.** A claim returns a `gen`; pass it back on
  the posts you make into that topic. If your lease was reclaimed and the resource granted again,
  the room refuses your late write instead of letting it land on top of the new holder's work.
- `wait_for_claim` never fails on a lost race: if another agent takes the resource first you are
  **re-queued**, not rejected. It returns `acquired:false` only on timeout.
- **If you are blocked on someone else, say so in the room** — a `post` naming what you need and
  what you have already tried. Sitting silent on a blocker is the failure mode the room exists to
  prevent. If the work needs a different owner, **release** the claim and post the hand-off; do not
  hold a lease you are not working on.

## Module 2 — wait, post, or mention

Every room post lands on one of three levels, and choosing wrong is the most common waste:

| you want to… | do this | why |
|---|---|---|
| be woken when a peer finishes, a message arrives, or a claim frees | **block** on `wait_for_agent` / `wait_for_message` / `wait_for_claim` | blocking is bounded and returns an explicit `outcome`; polling burns turns and tokens |
| tell everyone something that can wait | **post** to a topic | a post is an aside: it arrives at the reader's next step boundary and it never interrupts anyone |
| change what a running agent is doing right now | **mention** it (`mention: ["AgentB"]`) | a mention is T0 — it wakes an idle agent and steers a streaming one, at its next step boundary |
| correct one agent without a shared record | `agent://<id>` | a mention steers *every* agent it classifies, not just the one you meant |

Never poll `room { op: "read" }` in a loop. If you have nothing to do but wait for a peer, a
message, or a claim, block.

The three wait tools, and what each waits for:

```
wait_for_claim   { resource: "build/step", timeout? }   # a resource frees up
wait_for_agent   { agents: ["AgentB", "AgentC"], timeout? }  # a peer finishes or leaves
wait_for_message { source: "room", topic?, mention?, from?, timeout? }  # a message arrives
```

All three block and all three return a **normal** timeout rather than an error —
`details:{ ok:true, outcome:"timeout", useless:true }`. `timeout` is in milliseconds:
`wait_for_claim` defaults to 20 000 (max 300 000); `wait_for_agent` and `wait_for_message` default
to 30 000 (max 1 800 000). `wait_for_agent` **requires** an explicit `agents` list; omitting it is
rejected rather than broadcast. `wait_for_message` reads the room only — it does not consume the
native IRC stream.

### What reaches you without asking

You are not expected to poll for everything. The attention governor pushes some records into your
context:

- **T0 — interrupts you.** A direct `@mention`, a reply to your message, a claim you were waiting
  on, your claim being revoked, or your task failing. This cuts an interruptible wait.
- **T1 — arrives at your next step boundary** as an aside, if you are idle. A post on a topic you
  follow, a claim status change, a reply in a joined thread.
- **T2 — never pushed.** General chatter, presence, progress. It advances your cursor only; read it
  with `room { op: "read" }` when you want it.

Muting a topic suppresses its T1 pushes, but a direct mention still gets through.

## Module 3 — finish, hand off, and record

The most common multi-agent failure is not doing the work — it is **finishing ambiguously**: a
claim released with no outcome, a finding posted in a way nobody can use later, or a task closed
before anyone checked it.

- **Release and record in the same breath.** When the work is done, post the outcome *and* release
  the claim. A released claim with no outcome leaves the next agent with nothing but a lease.
- **Write findings so a later agent can use them.** Post in a **named** topic (the topic is how a
  later agent finds it and how the card says where it came from), and put the conclusion in the
  first two lines — a collapsed card shows three. Say what you did, what you found, and what is
  left. If it is a conclusion someone could contradict, say what evidence it rests on.
- **Mention nobody unless you need them now.** A mention is an interrupt, and an unnecessary one
  costs the whole room a turn.
- **Do not close a task you did not verify.** A claim is a promise that someone else will not
  duplicate your work; releasing it early breaks that promise.
- **If a post might be retried, give it a `idemKey`.** A repeat with the same key returns the first
  post instead of posting twice — and a double post double-wakes every agent it mentions.

## When NOT to use the room

Coordination overhead is real, and redundant work hurts: the room pays for itself only when agents
actually share resources.

- **Strictly sequential work.** If the next step cannot start until the previous one finishes, the
  room is overhead — do the steps, do not coordinate them.
- **A task you can finish in one step.** Claiming a file you will edit once and never again is
  ceremony.
- **Work nobody else touches.** A claim protects a *shared* resource.

## Op cheat-sheet

One tool, `room`, dispatched on `op`. All ops return a `content` line plus `details` with `ok`.

This build ships the full **twelve ops**: `join`, `read`, `post`, `claim`, `release`, `board`,
`topics`, `mute`, `unmute`, `tree`, `zoom`, `recall` — plus all three wait tools.

| op | use when | key args |
|---|---|---|
| `join` | first call — registers you and mints your cursor | — |
| `read` | pull records after your cursor | `since?` (seq), `limit?` (default 50, max 200) |
| `post` | send a message to a topic | `topic`, `body` (≤ 8 KiB), `mention?`, `replyTo?`, `performative?`, `idemKey?` |
| `claim` | take exclusive ownership of `"<topic>/<key>"`; claiming it again renews your lease | `topic`, `key`, `ttl?` (ms), `dependsOn?` |
| `release` | drop a claim you hold | `topic`, `key` |
| `board` | see claims, roster, per-agent lag, unread topics | — |
| `topics` | list topics with unread counts | — |
| `mute` / `unmute` | silence a topic, or the whole room when `topic` is omitted | `topic?` |
| `tree` | see the cold-tree tiling (which ranges are compressed) | — |
| `zoom` | descend one level into a tree node | `lo`, `hi` |
| `recall` | regex search over the raw log, newest first, cap 100 | `pattern` |

Resource keys are always `"<topic>/<key>"` — the same string `wait_for_claim` takes.

Units: `ttl` is **milliseconds**; `since` is a **seq number**; `limit` is a **record count**;
`lag` is a **record count**, not a duration.

`post` is for coordination artifacts, not for dumping output — bulk content belongs in an artifact
and should be referenced by id.

## Human-facing

A human can run `/room` (opens the panel), `/room board`, `/room join`,
`/room claim <topic> <key> [ttlMs]`, `/room release <topic> <key>`, `/room post <topic> <body>`,
or `/room config` from the prompt.

## Limits to design around

- The room is **in-process only** — one omp process per `local://` root. It is not a system of
  record and does not replace artifacts.
- Agents running restricted or in plan mode get **no extension tools at all**, so they are not room
  members. Do not build a protocol that assumes they will answer a room post.
- There is no semantic search: `recall` is a regex over the raw log, and the cold tree is a
  summary cache, not an index.

