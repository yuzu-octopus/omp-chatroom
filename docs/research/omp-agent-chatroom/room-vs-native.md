# Why this plugin, and not native omp IRC + `agent://`

Short answer: **native `agent://` is the right steering channel and this plugin does not replace
it.** omp already ships point-to-point delivery, hard interrupts, idle wake, revival and presence.
What omp does not ship is *room semantics*: a shared durable record, exclusive ownership of a named
resource with a lease, tiered attention, and a bounded blocking wait on a peer. The gap is semantics,
not transport — that is R1's central verdict (`REPORT.md:132`, "The gap is semantics, not transport.
That is the single most important finding for the build decision.").

Citations below come in two flavours:

- **Host source** — read from the installed tree on this machine:
  `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent` (`H`) and
  `~/.bun/install/global/node_modules/@oh-my-pi/pi-tui` (`T`), version `18.8.7`
  (`H/package.json:3`). The plugin pins `18.8.6` (`plugin/package.json:39-41`); the plan was written
  against 18.7.0 and stores the drift risk as **R34** (`PLAN-build.md:2352`).
- **Research record** — `REPORT.md` (R1), `REPORT-v2-hybrid.md` (R2), `PLAN-build.md` (the plan).

---

## 1. What `agent://<id>` / `agent://all` actually do

`agent://` is an internal URL scheme, not a chat server. The write handler takes the URL, the body and
the write context, and hands it to the IRC messaging layer (`H/src/internal-urls/agent-protocol.ts:172`
→ `executeSend`, imported at `H/src/internal-urls/agent-protocol.ts:28`). There is no network, no
server, and no second process: one `IrcBus` singleton per omp process
(`H/src/irc/bus.ts:27-30`).

**Point-to-point.** One recipient, one receipt. Outcomes are exactly four — `injected`, `woken`,
`revived`, `failed` (`T/src/tools/irc.ts:27-31`).

**Broadcast is a fan-out, not an event.** `agent://all` resolves to every visible peer and issues N
independent sends:

```
H/src/irc/messaging.ts:64   const targets = isBroadcast ? registry.listVisibleTo(senderId).map(ref => ref.id) : [to];
H/src/irc/messaging.ts:67   const receipts = await Promise.all(
H/src/irc/messaging.ts:68     targets.map(target => bus.send({ from: senderId, to: target, body: message }, { suppressRelay })),
```

So a "broadcast" is N one-to-one writes, each with its own mailbox, its own session file and its own
receipt. There is no shared object a late agent can read back. `agent://all` is explicitly write-only
(`H/src/internal-urls/agent-protocol.ts:209`).

**Delivery is state-aware — and this is the part that must not be rebuilt.** `IrcBridge.deliver()`
branches on the recipient's state (`H/src/session/irc-bridge.ts:180-243`):

| State | Behaviour | Line |
|---|---|---|
| streaming + message from a parent | `this.#host.agent.steer({... steering: true})` — **hard steer mid-run** | `H/src/session/irc-bridge.ts:220-227` |
| streaming + non-parent | pushed to `#interrupts`, drained interrupt-before-aside at the next step boundary | `H/src/session/irc-bridge.ts:26,67-71,228` |
| plan-mode idle | `appendMessage` + `appendCustomMessageEntry` — folds into context, no turn | `H/src/session/irc-bridge.ts:232-240` |
| idle, non-main | `wakeForIrc([record])` — a real wake turn whose output is relayed to the sender | `H/src/session/irc-bridge.ts:243`, `:189` |

**Presence and identity** come from `AgentRegistry.global()` (`listVisibleTo`, `onChange`); child
prompts get a live-roster block capped at 32 (`REPORT.md:124`, `:341`). **Revival** keeps the same agent id
(`REPORT.md:125`).

**The wire format is thin.** `IrcMessage` carries `id`, `from`, `to`, `body`, `ts`, optional `replyTo`
and `wakeRelay` — and nothing else (`T/src/tools/irc.ts:7-24`). No priority, no topic, no TTL, no
lease, no claim, no envelope fields.

**Persistence is per-recipient.** An incoming record is a `custom` entry of type `irc:incoming`
appended into the *recipient's* session JSONL (`H/src/session/irc-bridge.ts:195-205`,
`:232-240`). Ten recipients = ten separate files; none of them is the room.

**Backpressure is one undifferentiated drop-oldest queue.**

```
H/src/irc/bus.ts:24-25   /** Mailbox cap per agent; oldest messages are dropped beyond it. */
                          const MAILBOX_CAP = 100;
H/src/irc/bus.ts:286-292 if (mailbox.length > MAILBOX_CAP) { const dropped = mailbox.shift(); ... }
```

The cap does not know whether the dropped message was a tier-0 interrupt or chatter, and the mailbox
only ever holds *failed* hand-offs — a delivered message is never buffered, so `unreadCount` is
mailbox depth and nothing else (`H/src/irc/bus.ts:275-276`, `:64-65`). A grep for
`priority|backpressure|rateLimit|coalesce|tier` across `H/src/irc/`, `H/src/tools/wait.ts`,
`irc-bridge.ts` and `agent-registry.ts` returns **zero matches** (verified in this tree 2026-10-10; also `REPORT.md:403`,
`REPORT-v2-hybrid.md:126-127,460`).

**`wait` cannot block on a peer alone.** Native `wait` blocks on a *job or service the caller owns*,
and refuses otherwise:

```
H/src/tools/wait.ts:90-94  if (jobs.length === 0 && !serviceRunning) {
                             throw new ToolError(
                               "Nothing to wait for: no background job or service you started is running. Other agents' results and messages arrive on their own."
```

Its bus leg exists but is only reachable once something else is already being awaited
(`H/src/tools/wait.ts:114-118`), and the cap is `WAIT_MAX_MS = 30 * 60_000` (`H/src/tools/wait.ts:25`).
There is no wait that says "block until peer X changes state", "block until a message for me arrives",
or "block until resource R is free".

**There is no claim/lock/lease primitive anywhere.** `H/src/tools/builtin-names.ts` has no claim,
lock, reserve or lease entry (verified by grep); a grep for `claim|lease|lock` across
`H/src/tools/*.ts` returns only unrelated identifiers (`blocks`, `answerImageBlocks`). `todo` is
parent-owned, not a shared reservation (`REPORT.md:353`). Two agents pointed at the same file have no
way to agree who owns it first — this is the plan's stated, checkable motivation
(`PLAN-build.md:85-93`).

---

## 2. R1's verdict on the native path

R1's answer was "build a **narrow** version, not the room", and its finding table splits the
capabilities explicitly — solved natively (addressing, broadcast, cross-session injection, wake,
interrupt, `wait`, presence, roster, revival, per-agent durable state) versus missing
(`REPORT.md:118-129`):

> Missing (the actual gap): shared durable log; topic/channel addressing; claim or lock; read cursor
> / receipts; room membership; cross-process transport; a way for an extension to intercept or
> enumerate bus traffic.

Three R1 rejections matter for this document because they are the options a reader will propose:

- **"Reuse `agent://all` as the room"** → rejected: *"It is a per-recipient fan-out with no shared log;
  a late joiner cannot reconstruct it, and there is no membership, topic, or cursor"*
  (`REPORT.md:103`).
- **"Do not build anything"** → rejected: *"The claim/lock gap is real: there is no way for two
  subagents to reserve disjoint work"* (`REPORT.md:100`).
- **"`appendEntry` as the room store"** → rejected: it writes a `custom` entry into *one* session's
  JSONL; cross-agent durability needs a shared file (`REPORT.md:105`).

R2 narrowed and confirmed the same list, and added the two gaps R1 did not name: **no tiered
attention** (the 100-message cap protects the wrong class; the priority/backpressure grep is empty,
`REPORT-v2-hybrid.md:126-127,347`) and **no bounded blocking wait on coordination**
(`REPORT-v2-hybrid.md:3,57-85`).

---

## 3. What the room fills, and what breaks without each piece

| Piece | Where it lives | What breaks without it |
|---|---|---|
| **Claim board with a lease** — first-writer-wins on `(topic, key)`, mandatory TTL, explicit reclaim | `plugin/src/store/claims.ts:30-45` (acquire returns the incumbent holder + expiry on a loss, appends nothing), `:19-27` (staleness = TTL expired **or** holder parked/aborted), `:64-79` (contested reclaim), `plugin/src/tools/room.ts` ops `claim`/`release`/`board` | Duplicate work on a shared resource. Two subagents assigned overlapping files both "start", both write, one silently loses. The native substrate offers no way to reserve anything (§1), so the only coordination left is prose — Anthropic's named failure mode (`REPORT.md:100-102`, `PLAN-build.md:85-93`). |
| **Tiered attention (T0/T1/T2)** | `plugin/src/attention/tiers.ts:19-42` (`classify`: `@mention`/reply-to-your-message/your-lease-revoked → T0; followed topic, held claim, joined thread → T1; everything else → T2), `plugin/src/attention/governor.ts:100` (token bucket, T0-exempt), `:119-172` (per-turn T1 caps), `:205-217` (coalesce), `plugin/src/store/config.ts:35` | Every message has the same delivery weight. The native `MAILBOX_CAP` drop-oldest queue evicts a tier-0 interrupt to make room for a tier-2 post (`REPORT-v2-hybrid.md:126-127,347`), and `resolveAsides()` injects an unbounded batch.
Without tiers, a room with N agents degrades into the firehose the research explicitly warns against
(`REPORT-v2-hybrid.md:88-124`). |
| **Three bounded blocking waits** — `wait_for_agent`, `wait_for_message`, `wait_for_claim` | `plugin/src/tools/wait-for-agent.ts:126` (timeout clamped, never throws), `:82-92` (timeout/aborted return `useless: true`), `plugin/src/tools/wait-for-claim.ts:26,74-91` (timeout is a **normal outcome**: `acquired: false`, not an error) | The only alternative is polling, which omp's own prompt forbids — "NEVER poll while work remains"
(`H/src/prompts/tools/wait.md:4`) — or parking. Native `wait` refuses a peer-only wait (§1), so "wait
until Alice publishes the schema" is inexpressible. |
| **Cold summary tree (`tree`/`zoom`/`recall`)** | `plugin/src/store/tree-store.ts:214-332` (`viewPath`, `viewTiling`, `loadView`), `:461-483` (`validateZoomRange`, `zoom`), `plugin/src/store/compactor.ts:11` (single-writer background compaction), `plugin/src/tools/room.ts:691-706` | A late joiner must replay the whole raw log, or accept a summary with no route back to the original bytes. `zoom` is what makes a bounded digest honest: the digest stays small, and the detail is still reachable without re-reading context (`REPORT-v3-tree.md:43-55`, `PLAN-build.md:2228-2246`). Note this is the plugin's only LLM spend
(`PLAN-build.md:2228-2246`, §1.5). |
| **Claim-expiry sweep** | `plugin/src/store/room-store.ts:279-299` (refcounted `ctx.setInterval` job calling `expireStale`), `plugin/src/attention/governor.ts:30` / `plugin/src/store/config.ts:35` (`claimSweepMs: 5_000`), `plugin/src/store/claims.ts:88-102` (`expireStale` → `release{reason:"expired"}` → promote oldest waiter → T0 notice) | A lease with no sweeper is a squat. An agent that crashes, is aborted, or parks mid-claim holds the resource forever and every other agent blocks on a claim that will never be released — plan risk **R31**: *"A claim held past its TTL can be squatted forever if
nothing sweeps it"* (`PLAN-build.md:2349`). |
| **Bounded join digest + per-agent cursors** | `plugin/src/onboarding/digest.ts`, `hook.ts`, `plugin/src/store/cursors.ts`; each agent's read position is its own | The native `§ Coop` roster is a start-time snapshot of live peers only, absent in restricted children (`REPORT.md:124`, `REPORT-v2-hybrid.md:422`). Without a digest, a new agent has no room state; without per-agent cursors, one slow reader pins the room's context for everyone (`REPORT-v2-hybrid.md:324`). |

What the room deliberately does **not** take over: native `agent://` stays the steering path; the room
does not intercept or observe bus traffic; artifacts stay the system of record on `local://` /
`artifact://` (`PLAN-build.md:114-124`, `REPORT-v2-hybrid.md:446`).

**One correction to the plan, for honesty:** the shipped store puts the log at
`<ctx.cwd>/.omp-room`, *not* under the shared `local://` root the plan specified
(`plugin/src/store/room-store.ts:210-222`; the comment records why — the per-session `local://` root
gave every subagent a private room). The plan's durability argument (§1.3 assumptions 7-8,
`PLAN-build.md:144-145`) survives, but on a different path: the log now lives with the project, so it
survives sessions and resumes, and is in-process-only by construction (`PLAN-build.md:114-124`).

---

## 4. The asymmetry that matters — and what the code actually does

The host has exactly three delivery strengths, and both channels reach them differently.

Native `agent://` goes through `IrcBus.send` → `IrcBridge.deliver()`, which branches on the
recipient's state and on whether the sender is a parent
(`H/src/session/irc-bridge.ts:180-243`):

- **parent → streaming child**: `agent.steer(..., {steering: true})`, taken up mid-run
  (`H/src/session/irc-bridge.ts:220-227`) — a hard steer.
- **non-parent → streaming**: pushed to `#interrupts`, drained interrupt-before-aside at the next
  step boundary (`H/src/session/irc-bridge.ts:26,67-71,228`).
- **→ idle, non-main**: `wakeForIrc([record])`, a real wake turn whose output is relayed back to the
  sender (`H/src/session/irc-bridge.ts:243`, `:189`).

The room does **not** use the bus at all. Its delivery adapter calls the recipient session's
`sendCustomMessage` with `deliverAs: "steer"` for T0 and `"aside"` for T1, and bumps only a cursor
for T2 (`plugin/src/attention/delivery.ts:60`, `:67`, `:35-37`). Per the host's own delivery rule —
*"Omitted `deliverAs` starts a turn when idle and queues as a steer while streaming. Explicit
`deliverAs` queues without starting a turn in either state; `aside` at an idle session instead starts
a turn, since there is no live run to inject into."* (`H/src/session/agent-session.ts:8796-8798`) —
that gives:

| Recipient state | room T0 (`deliverAs: "steer"`) | room T1 (`deliverAs: "aside"`) | room T2 |
|---|---|---|---|
| streaming | hard steer — `agent.steer` (`H/src/session/agent-session.ts:8700`) | step-boundary aside (`:8692`) | nothing |
| idle | **appended + persisted, no turn** (`:8767-8774`) — no wake | **starts a turn** (`:8752-8753`) | nothing |

So the strength ladder is *not* the one the design docs assume. Two consequences a reader of this
repo needs:

1. **To wake or revive an idle peer, use native `agent://`.** A room T0 mention to an idle agent is
   written into its context and stays there until something else runs it — the room has no
   wake/relay/revival path, because it bypasses `IrcBus` (no mailbox, no receipt, and
   `sendCustomMessage` returns `false` when the message was queued/appended without a turn — its own
   doc comment, `H/src/session/agent-session.ts:8591-8605`, and `REPORT.md:224`). R2's tier table
   asserts the opposite for T0 — "yes (idle → wake; streaming → step-boundary interrupt)"
   (`REPORT-v2-hybrid.md:318-320`); the implementation delivers
   a hard steer to a streaming agent and no turn to an idle one. **That divergence is a doc/code gap,
   not a settled semantic.**
2. **A room T0 mention does interrupt a running agent — by steering everyone it classifies, not just
   the agent you meant.** That is the real reason the routing rule sends corrections, private
   instructions and single-recipient commands to `agent://<id>` instead: the DM has one addressee, a
   bounded blast radius and no shared record, whereas the room's T0 class (`@mention`,
   reply-to-your-message, your-lease-revoked — `plugin/src/attention/tiers.ts:22-23`, `:33`) is
   computed per viewer. R2 states the principle verbatim
   (`REPORT-v2-hybrid.md:210-214`):

> Note the asymmetry that matters: **an interrupt *intent* is not the same as an interrupt
> strength*.** A direct `agent://` message from a parent hard-steers the recipient's run. A room
> mention is T0 — it wakes an idle agent and cuts an interruptible wait — but it does not hard-steer
> a streaming one. Both are "urgent"; only the DM is a steering instruction. Put a correction in the
> room and the running agent may keep working on the wrong thing until its next step boundary.

Practical consequence — and it is why the room does not try to be a drop-in replacement:

- **Steer, correct, redirect, send a private or sensitive instruction → `agent://<id>`.** One
  addressee, a bounded blast radius, no shared record (`PLAN-build.md:2070-2110` routing rule clauses
  1, 2, 4, 5, 6).
- **Coordinate — claims, releases, shared findings, status, cross-critique → room post.** Many
  recipients who must see the message *and each other's answers*; also the safe place for anything
  that would amplify an error if broadcast (`PLAN-build.md:2070-2110` clauses 3, 6, 7, 8, 9).
- **Two failure modes, both asymmetric.** A correction sent to the room steers every agent the T0
  class matches, not just the one who was wrong. A broadcast sent as a DM reaches nobody else, and
  nobody can reconstruct it later (§2). And a room mention aimed at an *idle* agent does not wake it
  at all — the message waits in that session's context.

Note that the quote's last clause ("it does not hard-steer a streaming one") describes the *design
intent*; per the table above, the shipped T0 path does steer a streaming agent, and the real limits
of a room mention are reach (who it classifies) and wake (it starts no turn).

---

## 5. What the room is NOT

Say this plainly in the README, because the pitch is easy to oversell:

1. **It is not a token-cost win.** Measured at 2026-10-07 prices: room overhead exceeds per-turn task
   tokens whenever work/turn < 20,480 tokens, and *"The room never pays for itself on token cost at
   any task size. Its value is coordination correctness — preventing duplicate work on a shared
   resource — not efficiency."* (`PLAN-build.md:201-224`). Option A of the plan drops the cold tree
   and removes the only real LLM spend; Option B budgets ≈$12.26/day of compaction at the cap
   (`PLAN-build.md:210`, `:2228-2246`).
2. **It is in-process only.** `AgentRegistry.global()` is per-process, `EventBus` per-session-tree,
   and omp's only cross-process agent surface is Collab, which mirrors a session to a human
   (`PLAN-build.md:114-124`, `REPORT.md:44,102`). Cross-process is out of scope, not unimplemented.
3. **It cannot serve restricted or plan-mode children.** Extension tools are never admitted to
   `restrictToolNames` sessions, so those agents are "not a member" by design
   (`PLAN-build.md:118`, `:2335`).
4. **It is not a system of record and not an IRC bridge.** Bulk output stays on `local://` /
   `artifact://`; transcript history stays in `history://` (`PLAN-build.md:122`,
   `REPORT-v2-hybrid.md:446`). It also cannot see native `agent://` traffic — `IrcBus` is not a
   root export, only reachable as a deep subpath import (`REPORT-v2-hybrid.md:385,446`).
5. **Embeddings and semantic retrieval are deferred.** No embedding or vector index exists anywhere —
   verified by grep: `embedding|vector` hits nothing in `plugin/src/`, and in `PLAN-build.md` only
   the phrase "injection vector". History search is regex over the raw log, `room{op:"recall"}`
   (`plugin/src/tools/room.ts:48`). A semantic "find related discussion" is a future layer, not a
   hidden one.
6. **The evidence is inference, not measurement.** No source studies a persistent multi-agent room,
   compares a claim board against free-form chat, or measures shared-state maintenance cost across
   agent turnover (`REPORT.md:311-313`, `REPORT-v2-hybrid.md:377-379`). The claim board is the one
   layer with both a verified gap and adjacent measured support; chat, panel, cards and the tree rest
   on inference (`PLAN-build.md:151-160`).

### Revisit triggers

Re-open this decision when any of these becomes true (from `REPORT.md:79-88`,
`REPORT-v2-hybrid.md:134-150`, `PLAN-build.md:2352`):

- **A measured study of a persistent multi-agent room** — especially one that measures room message
  volume as an independent variable, or shows a bounded digest plus pull-based lookup matches a full
  transcript's task performance at a fraction of the tokens. That flips the "don't build a chat log"
  objection *and* the tier caps.
- **Evidence that omp's native path is enough in practice** — if redundant work and talking past each
  other turn out to be rare in real swarms, the claim board loses its motivation and the room reduces
  to a mention channel.
- **A substrate change** — `IrcBus` exported from the package root, `interruptible` on
  `ToolDefinition`, a native `room://` scheme, or a native claim/lease primitive. Any of these makes
  the plugin's remaining value prompt engineering (`REPORT.md:79-88`,
  `REPORT-v2-hybrid.md:146-150`, `PLAN-build.md:2352`).
- **Host drift.** Every host line above was read from 18.8.7 while the plugin pins 18.8.6 and the plan
  was verified against 18.7.0; the deep-import surface (`/irc/bus`, `/registry/agent-registry`,
  `/internal-urls/local-protocol`, `/utils/event-bus`) is not public API. `tests/drift.test.ts` exists
  to fail loudly on that (`PLAN-build.md:2352`).
