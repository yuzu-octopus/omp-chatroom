---
name: omp-agent-chatroom
description: Use when coordinating with peer agents in one omp session tree — claiming a shared resource, checking who holds a file or step, posting a shared finding, reading the room board, or blocking on a claim. Triggers on: claim a resource, who owns this file, is anyone working on this, coordinate with other agents, check the room, room board, post to the room, avoid duplicate work, wait for a claim, release my claim, shared status board.
---

# Agent Chatroom

One in-process room per session tree: a **claim board** plus a bounded chat log. Every agent in the
tree — the main session and normal `task` subagents — is a member. The room exists because omp has
**no lock, claim, or reserve primitive**: without it, two agents pointed at the same file have no
way to agree who owns it first.

## When to use the room vs `agent://`

This is the same rule that is already in your system prompt (`src/onboarding/routing-rule.md`) —
read that as the source of truth; this is the operational summary.

**Use `agent://<id>`** when:

1. Exactly one agent is the intended recipient.
2. Several recipients must NOT see each other's responses.
3. The message must interrupt a specific **running** agent — a parent `agent://` message
   hard-steers; a room mention does not.
4. It is a direct command, correction, or steering instruction for one agent.
5. Broadcasting it would amplify an error (corrections, unverified claims).

**Use the room** when:

6. Several recipients must see the message AND each other's responses.
7. It is a coordination artifact — a claim, release, shared finding, status, or async non-urgent
   update.
8. It is a question that wants cross-critique or diverse input.

When in doubt, use the room.

The asymmetry that trips people up: an interrupt *intent* is not an interrupt *strength*. A room
post does **not** hard-steer a streaming agent — it may keep working on the wrong thing until its
next step boundary. If you must correct a running agent, use `agent://<id>`.

## The claim workflow

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
- **Release when done.** Holding a lease you no longer need blocks everyone queued behind you.
- `wait_for_claim` never fails on a lost race: if another agent takes the resource first you are
  **re-queued**, not rejected. It returns `acquired:false` only on timeout.

## Op cheat-sheet

One tool, `room`, dispatched on `op`. All ops return a `content` line plus `details` with `ok`.

This build ships **six ops**: `join`, `read`, `post`, `claim`, `release`, `board`. There is no
`topics`, `mute`, `unmute`, `tree`, `zoom`, or `recall`, and no `wait_for_agent` /
`wait_for_message` — do not call them.

| op | use when | key args |
|---|---|---|
| `join` | first call — registers you and mints your cursor | — |
| `read` | pull records after your cursor | `since?` (seq), `limit?` (default 50, max 200) |
| `post` | send a message to a topic | `topic`, `body` (≤ 8 KiB), `mention?`, `replyTo?`, `performative?` |
| `claim` | take exclusive ownership of `"<topic>/<key>"` | `topic`, `key`, `ttl?` (ms) |
| `release` | drop a claim you hold | `topic`, `key` |
| `board` | see claims, roster, per-agent lag, unread topics | — |

Resource keys are always `"<topic>/<key>"` — the same string `wait_for_claim` takes.

Units: `ttl` is **milliseconds**; `since` is a **seq number**; `limit` is a **record count**;
`lag` is a **record count**, not a duration.

`post` is for coordination artifacts, not for dumping output — bulk content belongs in an artifact
and should be referenced by id.

## Human-facing

A human can run `/room board`, `/room join`, `/room claim <topic> <key> [ttlMs]`,
`/room release <topic> <key>`, `/room post <topic> <body>`, or `/room config` from the prompt.

## Limits to design around

- The room is **in-process only** — one omp process per `local://` root. It is not a system of
  record and does not replace artifacts.
- Agents running restricted or in plan mode get **no extension tools at all**, so they are not room
  members. Do not build a protocol that assumes they will answer a room post.
- There is no semantic search: recall is the raw log and the last 50 records.
