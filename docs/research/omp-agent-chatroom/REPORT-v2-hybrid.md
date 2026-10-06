# omp agent chatroom, round 2: the hybrid (room + `agent://` + blocking waits)

**Answer:** Build the hybrid, but invert round 1's centre of gravity. Keep native `agent://`
untouched as the point-to-point steering and interrupt path — it already implements the hard
half (parent steer, sibling aside, idle wake, revival, abort folding) [1][2][3]. Add a plugin
room whose **value is carried by the structured claim/status board**, not by a chat backlog:
free-form chat is a T2 pull-only tier that never wakes an agent, while claims, mentions, and
directed coordination are T0/T1 [4]. Add three blocking-wait tools, because a room that only
polling can read is a room agents will not use — and because omp's own agent loop has no global
tool timeout, so a long in-tool block is viable [5][6][7]. The routing rule, envelope, and
attention model below are the deliverable.

**Confidence:** medium-high on the architecture (every omp mechanism is source-verified, and
the protocol prior art is unanimous on the shape of a bounded blocking wait). Medium on the
routing rule and the tier boundaries — they are derived from canonical practice plus measured
saturation curves, not from a study of a persistent agent room. **Low** on any claim that a
busier room helps: no primary source measures room message volume as an independent variable,
and the nearest measurements point the other way for chat specifically [8][9].

---

## Why

### 1. Round 1's either/or was the wrong frame, and the user's correction is supported by the primary sources

IRC is the canonical counter-example: one `PRIVMSG` command serves both channel broadcast and
direct-to-user messaging, distinguished only by whether the target starts with `#` [10][11].
Every mature chat system keeps both. Slack, Discord, and Zulip each ship channel/stream *and*
DM/MPIM as first-class objects [12][13][14]. Azure's own guidance is the cleanest statement of
the division of labour: "Use a queue to distribute work; use pub-sub to distribute information"
[15]. The multi-agent literature splits the same way and for the same reason — Anthropic's
orchestrator–worker topology deliberately keeps subagents from coordinating directly, and routes
bulk output through a filesystem rather than conversation [16]; Google's 260-configuration study
finds centralized coordination best for decomposable work (+80.8% on financial reasoning) and
decentralized best for dynamic web navigation (+9.2% vs +0.2%), with *every* multi-agent variant
worse on sequential planning (−39% to −70%) [8]. No single topology wins; the topology must match
the task. A hybrid is therefore not a compromise — it is the only shape the evidence supports.

### 2. What native `agent://` already does, precisely (do not rebuild)

| Capability | Native mechanism | Source |
|---|---|---|
| Point-to-point delivery | `write agent://<id>` → `IrcBus.send` → `session.deliverIrcMessage` | [2][3] |
| Broadcast | `agent://all` = client-side fan-out over `listVisibleTo` | [17] |
| Hard interrupt | parent → `agent.steer()` mid-run | [3] |
| Step-boundary aside | non-parent while streaming → `#interrupts`, drained at the next step boundary | [3] |
| Wake an idle peer | `wakeForIrc` → real turn; output relayed back to the sender | [3] |
| Block on peers | `wait` (no args, 30-min cap, `interruptible = true`) | [1] |
| Presence/identity | `AgentRegistry.global()` / `AgentRef` / `onChange` feed | [18][19] |
| Revival | parked agents revived on demand; same id | [2][18] |

The gaps are **semantics, not transport**: no shared log (a broadcast is N independent writes, so
a late joiner cannot reconstruct it) [17], no topic addressing, no claim/lock primitive, no read
cursor, and `IrcBus` is not re-exported from the package root [17][20]. Round 1 got this right and
it stands.

### 3. Blocking waits are the enabling primitive, and omp already contains every part

A room that can only be read by calling a tool is a room agents will ignore, because the correct
behaviour of an agent with nothing else to do is to stop — not to poll. The fix is a blocking
wait, and omp is unusually well-suited to it:

- There is **no global tool-execute timeout** in the agent loop; `src/tools/tool-timeouts.ts` has
  no `wait` entry, so `wait` is bounded only by its own `WAIT_MAX_MS = 30 * 60_000` [1][6].
- `interruptible` is read as `tool?.interruptible` (boolean *or* `(args) => boolean`) [7], and
  `applyToolProxy` copies **own keys** from a `ToolDefinition` onto the adapter through both
  wrapper layers — so an extension tool can opt into interruptible semantics at runtime even
  though `interruptible` is absent from the `ToolDefinition` TS interface [5][7]. This is the one
  mechanism that makes "a room message can cut my wait short" implementable without a new omp API.
- `IrcBus.wait(agentId, {from?}, timeoutMs, signal)` already exists and resolves the OLDEST
  matching waiter; a parked waiter **consumes the message directly**, bypassing the inbox and the
  injection path entirely [2]. Any plugin `wait_for_message` must therefore *not* also inject —
  that would double-deliver [2][21].

The prior art is unanimous on the shape: **block, bound it, and abort-and-return on a relevant
event.** Codex's `wait_agent` V1 blocks on named targets (default 30 s, min 10 s, max 1 h) and V2
blocks on any mailbox activity, returning the literal string `"Wait interrupted by new input."`
on a steer [22] — semantically identical to omp's `"Wait interrupted by message."` [1]. A2A's
`SendMessageConfiguration.return_immediately: false` is the *default* and "MUST wait until the
task reaches a terminal state … or an interrupted state" [23]. ACP v1's `session/prompt` response
*is* the turn barrier [24]. Temporal's `wait_condition`, Erlang's `gen_server:call`, and SQS long
polling are all bounded blocking waits [25][26][27]. The one protocol that removed its blocking
call — MCP, which deleted `tasks/result` in the 2026-07-28 extension — did so for **transport**
reasons: HTTP intermediaries, long-lived SSE connections, and session removal, per SEP-2663 [28].
None of those exist for an in-process tool call. That is the strongest single argument for
building these tools in omp rather than in a protocol.

### 4. But the room must be a board first and a chat second

The measured evidence has not changed and round 1's reading of it holds:

- **Context grows monotonically and costs accuracy.** Chroma's Context Rot tested 18 models over
  194,480 calls: performance degrades as input grows even on trivial tasks, and — inverting the
  tidy-your-context instinct — logically coherent haystacks performed *worse* than shuffled ones
  [29]. Independent work shows 13.9%–85% degradation from length alone with distractors masked
  [30].
- **More talk does not buy accuracy.** Google/MIT measure success as logarithmic in message
  density, `S = 0.73 + 0.28·ln(c)`, R² = 0.68, p < 0.001, **plateauing at c\* ≈ 0.39 messages per
  reasoning turn**; the most talkative architecture (Hybrid, 515% coordination overhead) gains
  0.7 pp over Centralized — not statistically significant (p = 0.542) [8]. Verified from the
  primary HTML for this report.
- **Conversation is the weakest coordination mode measured.** A pressure-field/stigmergy system
  operating on a shared artifact solved 48.5% of 1350 scheduling trials against **12.6% for
  conversation-based coordination** and 1.5% for hierarchical control [9].
- **What has measured support is shared *structured state*.** A blackboard-based LLM MAS beat
  CoT by 4.33% and static methods by 5.02% [31]; a blackboard data-discovery system scored 28.53%
  vs 24.01% for master-slave [32]. MAST's communication failures are *under*-communication —
  withholding crucial information 1.66%, ignoring other agents' input 0.17% — not overload, though
  MAST explicitly excluded efficiency metrics [33].

**Reconciliation:** the drowning risk is not in task *correctness* (where under-communication
dominates) but in *cost and attention* (where over-communication dominates). A room is therefore
justified on coordination coverage and must be bounded on volume. That is exactly the tier model
in the blueprint.

### 5. Attention mechanics are the difference between a room and a firehose

Every system that has solved this at scale uses the same four pieces: a **per-consumer cursor**
(Kafka committed offsets; Redis `last-delivered-id`) [34][35], a **bounded in-flight window**
(NATS `MaxAckPending`, default 1000; AMQP `basic.qos`) [36][37], **coalescing** (Zulip's per-topic
unread counts and batched email; Mailman's size-triggered digests; Slack's 15-min/hourly bundling)
[38][39][40], and **mute rules where a mention overrides the mute** — Zulip verbatim: "Messages in
muted topics do not generate notifications … unless you are mentioned … Unread messages in muted
topics do not contribute to channel unread counts" [41].

omp has exactly one of these today and it protects the wrong class: `MAILBOX_CAP = 100`
drop-oldest, applied to whatever is oldest regardless of whether it is a tier-0 interrupt or tier-2
chatter [2]. A grep for `priority|backpressure|rateLimit|coalesce|digest` across `src/irc/`,
`irc-bridge.ts`, `wait.ts`, and `agent-registry.ts` returns zero matches [4]. The plugin must
supply the missing four pieces. It can, because it can compute them itself.

---

## What would change this

- **A study that measures room message volume as an independent variable in a multi-agent LLM
  system.** Google's saturation curve is the closest analogue but is measured across architecture
  families, not by throttling a persistent room [8]. If a bounded room were shown to beat direct
  messaging at matched token budget, the tier model's T2 cap would be wrong.
- **Evidence that agents actually use a room when a blocking wait exists.** The entire justification
  for the wait tools is behavioural and untested here: no source measures whether an idle agent
  that can block on a room will do so productively rather than parking.
- **A negative result on the claim board.** Blackboard wins are measured on *task* coordination
  [31][32]; if claim-board contention turned out to be rarer than duplicated work in real omp
  swarms, the board's motivation weakens and the room reduces to a mention channel.
- **An omp substrate change.** If `IrcBus` were exported from the package root or `interruptible`
  were added to `ToolDefinition`, two load-bearing workarounds in this blueprint would become
  supported API [5][20]. If omp instead grew a native room/claim primitive, the plugin's remaining
  value would collapse to prompt engineering.

---

## Round 1: revised, confirmed, added

Round 1's recommendation was "build a narrow claim board, not a persistent chat log", and its
"Considered and rejected" table rejected the "full persistent room (chat + board + blackboard,
all agents read the log)". **That rejection is revised**, not withdrawn.

| Round-1 item | Status | Why |
|---|---|---|
| "Full persistent room — all agents read the log" → **rejected** | **REVISED** | The rejected object was *all agents reading an unbounded log*. A room whose log is per-agent-cursored, capped, and read pull-only is not that object, and the channel/DM coexistence evidence (IRC, Slack, Discord, Zulip) plus Anthropic's own topology shows the right answer is composition, not replacement [10][12][13][14][16]. A room **with** bounded attention is now recommended; an unbounded shared log is still rejected. |
| "Reuse `agent://all` as the room" → rejected | **CONFIRMED** | Still a per-recipient fan-out with no shared log, no cursor, no membership [17]. The room needs its own store. |
| "MCP server as the room transport" → rejected | **CONFIRMED** | MCP 2026-07-28 has no server→client long-poll, removed sessions and SSE resumability, and deleted its one blocking call (`tasks/result`) for transport reasons that do not apply in-process [28][42]. |
| "`appendEntry` as the room store" → rejected | **CONFIRMED** | Writes one `custom` entry into one session's JSONL; durability across agents needs a file under the shared `local://` root [43][44]. |
| "A new `room://` URL scheme" → rejected | **CONFIRMED** | Scheme list is a fixed builtin set with no extension API [45]. |
| OptChat tree as the room log → rejected | **CONFIRMED** | Its view deliberately never holds a whole message; single-agent by design [46]. |
| Gap is semantics, not transport | **CONFIRMED** | Unchanged; source-verified again this round [2][3][17]. |
| "Don't build a chat log" | **NARROWED, NOT REVERSED** | Correct for an *unbounded* log. The room ships a bounded log whose T2 tier is pull-only, which is the mechanism that keeps the objection satisfied [8][29][41]. |
| Claim board with TTL + central verification | **CONFIRMED** | Still the highest-value component; new evidence strengthens it — structured shared state is the one thing with measured wins (blackboard 28.53% vs 24.01%; stigmergy 48.5% vs conversation 12.6%) [9][32]. |
| Native `wait` semantics (30-min cap, abort string) | **CONFIRMED** | Re-verified from source; `wait` remains correct and should keep refusing peer-sustained waits [1]. |
| Documented 5/10/30/60/300 s wait ladder | **CONFIRMED as doc/code divergence** | Absent from installed 18.6.1 `src/tools/wait.ts` [1][47]. |
| **NEW:** blocking-wait tool surface (`wait_for_agent` / `wait_for_message` / `wait_for_claim`) | **ADDED** | Not in round 1. Enabled by the absence of a global tool timeout plus `interruptible` surviving the wrapper stack [5][6][7]; shape fixed by unanimous prior art [22][23][25][27]. |
| **NEW:** room-vs-DM routing rule | **ADDED** | Ordered 10-clause rule with per-clause sourcing (blueprint §5). |
| **NEW:** message envelope with performatives, correlation ids, and receipts | **ADDED** | FIPA-ACL/KQML envelope fields plus wire-level correlation (RFC 5322, AMQP, MQTT v5) [48][49][50][51]. |
| **NEW:** attention/priority/backpressure model with three tiers | **ADDED** | Mapped onto omp's existing interrupt/aside/mailbox split [3][4]. |
| **NEW:** `IrcBus` reachable via the wildcard subpath export | **ADDED** | `package.json` `"./*"` export makes `@oh-my-pi/pi-coding-agent/irc/bus` resolvable — a deep import, not public API [20]. |

---

## Findings

### A. Routing: room vs `agent://` — the decision rule

Canonical practice gives the primitive distinction (RFC 1855: private messages for "personal,
private, or sensitive" communication; channels for "public discussion") [10][52], and Azure gives
the systems version ("queue to distribute work, pub-sub to distribute information") [15]. The
multi-agent literature supplies the tie-breakers: directed communication contains error cascades
(17.2× independent vs 4.4× centralized) [8], broadcast costs ~15× tokens in Anthropic's own
measurement [16], and sparse topologies match or beat fully-connected debate at ~40% less cost
[53].

**The rule a prompt can state (ordered; first match wins):**

1. **Exactly one intended recipient → `agent://<id>`.** [10][15]
2. **Several recipients who must not see each other's responses → separate `agent://<id>` sends.**
   Direct fan-out, no shared state. [15][16]
3. **Several recipients who must see the message *and* each other's responses → room post.** This
   is the only case that needs shared visibility. [14][15][52]
4. **The message must interrupt a specific running agent → `agent://<id>`.** A parent's message
   hard-steers; a room mention does not hard-steer. [3][8]
5. **A direct command, correction, or steering instruction for one agent → `agent://<id>`.** [16][54]
6. **Content that would amplify errors if broadcast (corrections, unverified claims) → `agent://<id>`.**
   [8][55]
7. **A coordination artifact — task claim, release, shared finding, status → room.** [15][56][57]
8. **An async, non-urgent update → room, T1/T2.** [14][38]
9. **A question needing cross-critique or diverse input → room.** [8][53]
10. **Tie-break: if the token budget is constrained and the task is not decomposable → `agent://<id>`.**
    [8][16]

Note the asymmetry that matters: **an interrupt *intent* is not the same as an interrupt
*strength*.** A direct `agent://` message from a parent hard-steers the recipient's run [3]. A room
mention is T0 — it wakes an idle agent and cuts an interruptible wait — but it does not hard-steer a
streaming one. Both are "urgent"; only the DM is a steering instruction. Put a correction in the
room and the running agent may keep working on the wrong thing until its next step boundary.

### B. The wait tool surface

Three tools, not one op-discriminated tool. Precedent is unanimous: Codex ships `wait_agent` as a
top-level tool per version [22], MCP splits `tasks/get`/`tasks/update`/`tasks/cancel` [28], and omp
itself ships `wait` and `vibe_wait` as two tools [1][58]. `loadMode: "discoverable"` surfaces tools
by BM25 on name+summary+description, so a discriminator field would hide three intents behind one
name [59]. `interruptible` is also per-tool and resolved before `execute` [7].

| Tool | Parameters | Blocks? | `interruptible` |
|---|---|---|---|
| `wait_for_agent` | `agents?: string[]` (omit = every live agent in the tree), `timeout?: number` (s; default 30, min 1, max 1800), `require?: "any" \| "all"` (default `any`) | **Yes, bounded** | `true` |
| `wait_for_message` | `from?: string`, `mention?: boolean` (default false), `timeout?: number` (default 30, max 1800) | **Yes, bounded** | `true` |
| `wait_for_claim` | `resource: string`, `timeout?: number` (default 20, max 300), `ttl?: number` (lease seconds; default 300) | **Yes, short bound** | `false` |

Design decisions and their evidence:

- **All three block in-tool; none returns immediately.** Codex V1/V2 block [22]; A2A's default is a
  blocking wait [23]; Temporal `wait_condition`, Erlang `gen_server:call`, and SQS long polling all
  block [25][26][27]. MCP's deletion of `tasks/result` is *not* counter-evidence: SEP-2663 names HTTP
  intermediaries, SSE streams, and session removal as the reasons, none of which exist for an
  in-process tool [28].
- **Bounds are copied, not invented.** 1800 s = omp's existing `WAIT_MAX_MS` [1]; 30 s default =
  Codex's `DEFAULT_WAIT_TIMEOUT_MS` and `vibe_wait`'s documented default [22][58]; 20 s for
  `wait_for_claim` = SQS's hard maximum long poll, the largest wait any well-behaved request/reply
  primitive in the survey will hold [27]. Redis `BLPOP` allows `0` = indefinite and Erlang allows
  `infinity`, but both are stateless-worker patterns; an agent that blocks forever on a claim cannot
  be steered except through the interrupt path, and omp's own code names the failure — "waiting on
  peers can park both sides for good" [1][60][61].
- **`wait_for_message` must not also inject.** A parked `IrcBus` waiter consumes the message
  directly and it never reaches the inbox or injection path [2]. Call `IrcBus.wait(...)` and nothing
  else. It must also refuse to park a second concurrent waiter for the same agent, since the bus
  resolves the OLDEST waiter and has no such guard itself [2].
- **`wait_for_claim` is not interruptible by room chatter, on purpose.** Aborting a claim wait on an
  unrelated T2 post would drop the waiter's queue position and can livelock a hot claim. Start with
  `false`; widen only if the room proves noisy. `wait_for_claim` also always returns `acquired`
  explicitly and treats timeout as a **normal outcome**, not an error — the SQS empty-list and Redis
  nil shape [27][60] — and every real claim mechanism in the survey is a *lease* (SQS visibility
  timeout, BullMQ `lockDuration`, NATS `AckWait`), so `ttl` is required in spirit [27][36][62].
- **Discriminate on an explicit `outcome: "event" \| "timeout" \| "aborted"`**, never on the presence
  of other fields. omp already distinguishes timeout from abort (abort sets `details.interrupted`,
  timeout leaves it unset) but infers "timeout" from an absence [1]; Codex uses `timed_out` plus a
  message [22]. Set `useless: true` on both non-event paths so compaction can elide them — native
  `wait` sets it on abort but *not* on timeout [1][63].
- **`interruptible` requires a cast or declaration merge** because it is not in the `ToolDefinition`
  interface; it works only because `applyToolProxy` copies own keys through both wrapper layers
  [5][7].

### C. Envelope and addressing

omp's native `IrcMessage` carries `id`, `from`, `to`, `body`, `ts`, `replyTo?`, `wakeRelay?` — no
priority, no topic, no TTL [64]. The room envelope adds exactly the fields the ACL tradition and the
wire protocols agree on:

| Field | Type | Req | Precedent |
|---|---|---|---|
| `id` | string (UUID) | yes | RFC 5322 `Message-ID`; Matrix `event_id`; IRCv3 `msgid` [49][65][66] |
| `sender` | agent id | yes | FIPA-ACL `sender`; KQML `:sender` [48] |
| `room` | string | yes | channel/stream id [12][14] |
| `to` | agent id \| `"*"` | yes | FIPA-ACL `receiver` (a Set); KQML `:receiver` [48] |
| `content` | string \| object | yes | all protocols [48] |
| `performative` | enum | yes | FIPA-ACL's 22 performatives; KQML's 30+ [48] |
| `reply-to` | message id | no | RFC 5322 `In-Reply-To`; Slack `thread_ts`; Discord `message_reference.message_id` [49][12][13] |
| `thread-root` | message id | no | RFC 5322 `References`; XMPP `<thread>`; Matrix `m.thread` [49][67][65] |
| `reply-with` | message id | no | FIPA-ACL `reply-with`; AMQP `correlation-id`; MQTT v5 Correlation Data [48][50][51] |
| `reply-by` | ISO 8601 | no | FIPA-ACL `reply-by` [48] |
| `protocol` | enum | no | FIPA-ACL `protocol` (`request`/`contract-net`/`subscribe`) [48] |
| `conversation-id` | string | no | FIPA-ACL `conversation-id` [48] |
| `receipts` | array | no | RFC 8098 MDN; XMPP XEP-0184; Matrix `m.read` [68][69][65] |

**Reply-expected over a shared channel** — the mechanism the room needs, since the responder is not
the only reader:

1. Sender sets `performative: "request"`, a unique `reply-with`, and a `reply-by` deadline [48].
2. Responder answers with `in-reply-to` = the original `reply-with` [48][50][51].
3. No reply by the deadline → the sender's *own* timer expires; the sender retries, escalates to a
   room broadcast, or abandons. **No protocol surveyed enforces a server-side timeout**: FIPA-ACL
   defines `reply-by` but no automatic timeout behaviour, MQTT v5's request/response section is
   explicitly non-normative, and AMQP routes replies by application convention only [48][51][50].
   The plugin must run its own deadline.
4. Multiple responders are legal on a broadcast (FIPA contract-net: several `propose` to one `cfp`)
   [48][56]; each reply is correlated by the same `reply-with` and distinguished by `sender`.
5. **Receipts are not acks of understanding.** XMPP XEP-0184 signals delivery to the client, not
   comprehension, and is explicitly "not recommended for groupchat" [69]; Matrix read receipts are
   server-initiated tracking rather than sender-requested [65]; IRCv3 `label` correlates
   command↔response while `msgid` identifies a message, and they are not interchangeable [66]. For a
   room, the honest primitive is the **cursor** (§D), not a per-message receipt.

### D. Attention, priority, and backpressure

**Explicit answer: no, a busy room has no measured support — and for chat specifically the evidence
points the other way.** No primary source measures room message volume as an independent variable in
a multi-agent LLM system. Google's saturation curve plateaus at ~0.39 messages/turn with a
statistically insignificant gain beyond it [8]; stigmergy measures conversation-based coordination as
the weakest mode tested, 12.6% vs 48.5% for a shared artifact [9]; Anthropic names "distracting each
other with excessive updates" as an early failure and fixes it with artifact-passing [16]. What *is*
measured is shared **structured state** [31][32]. The design implication: the room's value rides on
the claim board, and chat is capped, coalesced, and pull-only.

**Three tiers, mapped onto omp's existing three delivery classes** [3][4]:

| Tier | Kinds | Delivery | Wakes? |
|---|---|---|---|
| **T0 interrupt** | direct `agent://` DM; `@mention`; reply with `replyTo` = your message; your claim revoked/contended; your task failed | interrupt queue; cuts an interruptible wait | yes (idle → wake; streaming → step-boundary interrupt) |
| **T1 step boundary** | room post on a topic/claim you follow; status change on a task you hold; reply in a thread you joined | aside at the next step boundary | only if idle |
| **T2 pull only** | general chatter, presence, progress, unaddressed broadcasts | per-agent cursor only; never injected | never |

Supporting mechanics:

- **Per-agent cursor, not a shared pointer.** Kafka gives every consumer group its own committed
  offset [34]; Redis's single group `last-delivered-id` is the shared-pointer design, and the entire
  `XAUTOCLAIM`/`IDLE`/delivery-counter/`XNACK` apparatus exists to remediate stuck positions [35].
  Advance the cursor on delivery into context, not on read — omp has no read receipts [2].
- **Injection cap.** At most K T1 messages or B tokens per turn, oldest-first, remainder replaced by
  one summary line plus a read handle. Today `resolveAsides()` injects an unbounded batch and the only
  cap anywhere is the 100-message mailbox that *drops* rather than *summarises* [4].
- **Rate limit: RFC 2697 srTCM (CIR + CBS + EBS), per agent, on room posts only.** Anchor: RFC 1459
  §8.10 — "the client may send 1 message every 2 seconds without being adversely affected" [70] — and
  Slack's Special-tier `chat.postMessage` at ~1/s/channel [39]. T0 is exempt, exactly as MQTT v5
  exempts non-PUBLISH control packets from the send quota [71] and Slack exempts event delivery from
  write limits [39].
- **Coalesce at N pending T2 or T lag.** Zulip coalesces unread into per-topic counts and batches
  notification email; Mailman digests on a size threshold; Slack bundles every 15 min or hourly
  [38][40][39]. The interruption evidence is the reason: Iqbal & Horvitz measured 4.28 email alerts
  per hour, 16 min 33 s to resume after an email alert, and 27% of alerts diverting the user for
  more than two hours [75]. Honest framing: this is a **productivity** measure, not a stress
  measure — Mark et al. CHI 2016 found a batching × duration interaction on *perceived productivity*
  (F = 3.05, p = .05) but **no** batching effect on measured stress (F = 1.30, p = .30) [72].
- **Drop-oldest for the log tail; never silently below the minimum live cursor.** Kafka and Redis both
  discard old segments/entries; when retention must pass a live cursor, emit an explicit gap notice
  rather than the silent loss Kafka's `auto.offset.reset` documents [34][35].
- **Mute rules with mention-override**, verbatim from Zulip, plus auto-unmute on participation [41].
- **The 100-message mailbox cap should become tier-aware**: never evict a T0/T1 entry to make room for
  a T2 one [2][4].

Why T2 must never wake: Mark CHI 2008 found interrupted work actually finished *faster* (20.31 vs
22.77 min) with equal errors but significantly higher stress and effort (p < .001) [73] — so the
"interruptions slow you down" argument is unsupported; the real agent analogue is token burn and
context pollution, which Google prices at zero marginal accuracy past c\* ≈ 0.39 messages/turn [8].
Waking for T2 buys nothing measurable and pays both costs.

---

## Considered and rejected

| Option | Why rejected |
|---|---|
| **Replace `agent://` with the room** | Contradicted by the canonical model: IRC, Slack, Discord, and Zulip all keep both, and Azure's queue-vs-pub-sub split says they do different jobs [10][12][13][14][15]. Also discards working native semantics (parent steer, wake, revival) [3]. |
| **Room = unbounded shared log every agent reads** | Still rejected: context rot is measured across 18 models/194,480 calls, and coherent context performed worse than shuffled [29]; success plateaus at ~0.39 messages/turn [8]. |
| **Room log = the transcript** | Native IRC persists into the *recipient's* session JSONL only; a broadcast is N separate writes and a late joiner cannot reconstruct it [17][43]. |
| **Polling instead of blocking waits** | Every mature primitive blocks; MCP deleted its blocking call for transport reasons that do not apply in-process [28][22][23][27]. Polling also reproduces the busy-wait omp's own prompt forbids [76]. |
| **One wait tool with an op discriminator** | Hides three intents behind one name under BM25 discovery, and cannot express per-tool `interruptible` cleanly [22][59]. |
| **`wait_for_claim` with `timeout: 0` (forever)** | Redis and Erlang allow it, but both are stateless-worker patterns; a permanently parked agent cannot be steered except via the interrupt path [1][60][61]. |
| **Server-enforced reply timeouts** | No surveyed protocol provides one: FIPA-ACL defines `reply-by` without behaviour, MQTT v5 §4.10.1 is non-normative, AMQP routes by convention [48][50][51]. The plugin runs its own timer. |
| **Per-message read receipts as the room's ack** | XEP-0184 signals delivery not comprehension and is not recommended for groupchat [69]; Matrix receipts are server-initiated [65]. A cursor is the honest primitive [34]. |
| **T0 by default (wake on everything)** | Anthropic's named failure mode is exactly this [16]; Google prices extra messages at ~0 marginal accuracy past the plateau [8]. |
| **Shared read pointer for the room** | Redis's `last-delivered-id` is that design and the remediation apparatus around it is the evidence it breaks [35]. |

---

## Open questions

- **No study covers this design.** No paper measures a persistent multi-agent room, compares a
  blackboard/claim board against free-form chat *in a room*, measures shared-state maintenance cost,
  or measures protocol stability across agent turnover [8][9][33]. The blueprint is inference.
- **The routing rule and tier boundaries are derived, not measured.** The primitives are
  spec-sourced; the thresholds (K messages, B tokens, N coalesce, CIR) are `[inference]` proposals to
  tune.
- **Behavioural uncertainty on blocking waits.** Whether agents use a bounded block productively
  rather than parking is untested; no source addresses it.
- **`IrcBus` is a deep import.** Reachable via the `"./*"` wildcard export, not the public API; it
  could change without a semver signal. Likewise `interruptible` is an untyped own property on
  `ToolDefinition` [5][20].
- **The interrupt path is polled.** `STEERING_INTERRUPT_POLL_MS = 250`, so an interruptible wait can
  take up to ~250 ms to observe an abort that is not the direct waiter-consumption path [7].
- **Restricted children still cannot join.** Plan-mode and `restrictToolNames` sessions drop extension
  tools entirely and force `enableIrc: false` [77][78].
- **Unverified numbers carried in findings and *not* used as load-bearing here:** the MAST "41%–86.7%
  failure rates" headline was not found in the abstract or either HTML revision [33]; Chroma's "30+pp
  middle-position drop" and "7.9% length-alone loss" are absent from the report text [29]; the
  "23 min 15 s" resumption figure is folklore and is not in Mark et al. CHI 2005, which reports
  25 min 26 s [74][92]. All three are excluded from the claims above.

---

## The hybrid blueprint

**Components**

1. **Room store** — one module-level singleton per extension module, shared across session rebinds
   [79]. Append-only JSONL at a fixed path under the session's shared `local://` root (subagents
   share the parent's root) [44]. Record = the envelope in §C plus `seq` (monotonic), `ts`, `kind`,
   `topic`. The file is the durable log; `seq` is the cursor unit.
2. **Roster/presence adapter** — `AgentRegistry.global().list()` for identity/status plus `onChange`
   for presence deltas; never invent peers [18][19].
3. **Delivery adapter** — for the calling session `pi.sendMessage(msg, {deliverAs})`; for another
   agent `AgentRegistry.global().get(id)?.session?.sendCustomMessage(...)` [18][59]. Skip `advisor`
   kind and aborted refs [2].
4. **Claim arbiter** — first-writer-wins on `(topic, key)` with a mandatory TTL; stale claims (TTL
   expired, holder parked/aborted/idle past threshold) are reclaimable and the previous holder is
   notified. Reclaim is explicit and logged, never silent — the one hard guarantee the room adds that
   native `agent://` lacks [2][56].
5. **Wait engine** — the three blocking tools of §B, built on `IrcBus.wait` for the message leg and
   on an in-store condition variable for the claim leg [2][5].
6. **Attention governor** — tiers, cursor, cap, token bucket, coalesce, mute, gap notices (§D).
7. **Onboarding hook** — a `before_agent_start` handler appending a bounded room digest (identity,
   roster, topic, bounded backlog, cursor, pinned claims, config) plus a `room` tool for pull [80].
   Needed because the native `§ Coop` roster is a start-time snapshot of live peers only and is absent
   in restricted children [81][77].

**Tool surface** — two tools: one op-dispatched `room` tool (`loadMode: "discoverable"`,
`approval: "read"`) and the three wait tools (§B).

| `room` op | args | effect |
|---|---|---|
| `join` | — | returns the digest + a read cursor |
| `read` | `since?`, `limit?` | messages/claims after the cursor, bounded (Zulip's 1000-recommended cap is the model) [82] |
| `post` | `topic, body, performative?, mention?, replyTo?` | append; push only on mention (T0) |
| `claim` | `topic, key, ttl` | reserve; returns holder or grant |
| `release` | `topic, key` | drop a claim |
| `board` | — | current claims + roster (the compact view) |

**Routing rule** — §A, ten ordered clauses.

**Envelope** — §C, thirteen fields, with the sender-owned reply deadline and cursor-based receipts.

**Attention model** — §D: three tiers, per-agent cursor, K/B injection cap, RFC 2697 token bucket at
1 post/2 s with burst 10, coalesce at N=20 or T=5 min, tier-aware drop-oldest with gap notices, Zulip
mute rules, T0-only wake semantics, and `interruptible` waits cut by T0 only (which is already
`hasInterrupts()`'s behaviour [4]).

**What this deliberately does not do:** it does not intercept or observe native `agent://` traffic
(the bus is not exported from the package root) [20]; it does not serve restricted/plan-mode children
[77][78]; it is in-process only; and it does not make the room the system of record — artifacts stay
on `local://`/`artifact://`, per Anthropic's own "minimise the game of telephone" finding [16].

---

## Sources

Primary — omp v18.6.1 first-party docs and installed source
(`~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`, `pi-agent-core/src`,
`pi-tui/src`), all accessed 2026-10-06 unless noted:

1. `src/tools/wait.ts` — no params; 5-leg race; `WAIT_MAX_MS = 30*60_000`; `interruptible = true`; `"Wait interrupted by message."`; timeout leaves `interrupted` unset; refuses peer-sustained waits. [primary]
2. `src/irc/bus.ts` — `IrcBus.global()`; `MAILBOX_CAP = 100` drop-oldest; `wait(agentId, filter, timeoutMs, signal)` oldest-waiter resolution; a parked waiter consumes the message directly; no read receipts. [primary]
3. `src/session/irc-bridge.ts` — `deliver()` branching (parent steer / `#interrupts` aside / plan-mode fold / `wakeForIrc`); `hasInterrupts()` = interrupt queue only; interrupt-before-aside drain. [primary]
4. `src/session/irc-bridge.ts` + `src/irc/` + `src/tools/wait.ts` + `src/registry/agent-registry.ts` — grep for `priority|backpressure|rateLimit|coalesce|digest` returns zero matches; `resolveAsides()` unbounded. [primary]
5. `src/extensibility/tool-proxy.ts:6-35` + `src/extensibility/extensions/wrapper.ts:77` — `applyToolProxy` copies own keys through the wrapper stack. [primary]
6. `src/tools/tool-timeouts.ts:10-20` — no `wait` entry; no global tool timeout applies to it. [primary]
7. `pi-agent-core/src/agent-loop.ts:3269-3288, 3244-3252, 3318-3325` — `tool?.interruptible` boolean-or-function; `interruptibleSignal = AbortSignal.any([external, steering, irc])`; `STEERING_INTERRUPT_POLL_MS = 250`. [primary]
8. Google Research / MIT, "Towards a Science of Scaling Agent Systems", arXiv 2512.08296 — `S = 0.73 + 0.28·ln(c)`, R² = 0.68, p < 0.001; plateau c\* ≈ 0.39 messages/turn; 17.2×/4.4× error amplification; coordination overhead 58/285/263/515%; +80.8% financial, −39…−70% sequential planning, +9.2% decentralized web navigation; p = 0.542 for the Hybrid-vs-Centralized gain. Verified from the v1 HTML 2026-10-06. https://arxiv.org/abs/2512.08296 [primary]
9. Rodriguez, "Emergent Coordination via Pressure Fields and Temporal Decay", arXiv 2601.08129 — 1350 trials; 48.5% pressure-field vs 12.6% conversation-based vs 1.5% hierarchical. https://arxiv.org/abs/2601.08129 [primary]
10. RFC 1459 §4.4.1, §4.2, §4.3.2, §8.10 — `PRIVMSG` channel-vs-user by target prefix; channel modes/operator; TOPIC; flood control "1 message every 2 seconds". https://www.rfc-editor.org/rfc/rfc1459 [primary]
11. RFC 2812 §3.3.1 — `msgto` BNF; channel prefixes. https://www.rfc-editor.org/rfc/rfc2812 [primary]
12. Slack — `chat.postMessage` (`thread_ts`, `reply_broadcast`, `client_msg_id`), rate limits (Tier 1–4, Special ≈1 msg/s/channel, 429 + `Retry-After`), Events API (30,000/60 min; 3 s ack; retry ladder), notification bundling (15 min/hourly). https://docs.slack.dev/reference/methods/chat.postMessage/ ; https://docs.slack.dev/apis/web-api/rate-limits ; https://docs.slack.dev/apis/events-api [primary]
13. Discord — threads and forum channels (type 15, `REQUIRE_TAG`), `message_reference` (`message_id`, `channel_id`, `type`), rate limits (per-route buckets, 50 req/s global, 10,000 invalid/10 min). https://docs.discord.com/developers/topics/threads ; https://docs.discord.com/developers/resources/channel ; https://docs.discord.com/developers/topics/rate-limits [primary]
14. Zulip — stream+topic model (channels define *who*, topics define *what*), muted topics/channels, unread counters, digest emails, DMs vs channels. https://zulip.com/help/introduction-to-topics ; https://zulip.com/help/introduction-to-channels ; https://zulip.com/help/direct-messages [primary]
15. Azure Service Bus — "Use a queue to distribute work; use pub-sub to distribute information". https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions [primary]
16. Anthropic Engineering, "How we built our multi-agent research system" — 15× tokens, 4× for single agents, 80% of variance; poor fit for shared-context domains; artifact-passing to minimise the "game of telephone"; "distracting each other with excessive updates"; +90.2%. https://www.anthropic.com/engineering/multi-agent-research-system [primary]
17. `src/irc/messaging.ts:44-104` + `src/registry/agent-registry.ts:322-331` — `agent://all` = client-side fan-out over `listVisibleTo`; no shared log. [primary]
18. `src/registry/agent-registry.ts` + `src/sdk.ts:898` — `AgentRef`, `AgentRegistry.global()`, `onChange` (`registered|status_changed|metadata_changed|removed`), package-root export. [primary]
19. `src/registry/agent-lifecycle.ts` — park/revive/coalesce. [primary]
20. `package.json` `exports` — `"./*": {"import": "./src/*.ts"}`; `IrcBus` not re-exported from `index.ts`/`sdk.ts`. Verified via `import.meta.resolve` 2026-10-06. [primary]
21. `src/irc/bus.ts:155-163` — "A pending `wait` from the recipient consumes the message directly — it is returned from their irc tool call and never hits the inbox or the session injection path." [primary]
22. OpenAI Codex — `multi_agents_spec.rs`, `multi_agents_common.rs`, `multi_agents/wait.rs`, `multi_agents_v2/wait.rs` — `wait_agent` V1 (targets required; 10 s/30 s/1 h clamps) and V2 (any mailbox activity; `"Wait interrupted by new input."`). [primary]
23. A2A 1.0.0 — `SendMessageConfiguration.return_immediately: false` is the default and "MUST wait until the task reaches a terminal state … or an interrupted state"; no protocol-level timeout; `SubscribeToTask` stream semantics; `TaskState` enum. https://github.com/a2aproject/A2A/blob/main/docs/specification.md [primary]
24. ACP v1 — `session/prompt` "Returns when the turn is complete with a stop reason"; v2 inverts it. https://agentclientprotocol.com/protocol/v1/schema.md [primary]
25. Temporal — `workflow.wait_condition(fn, timeout=…)`, durable timers, cooperative cancellation. https://docs.temporal.io/develop/python/workflows/message-passing [primary]
26. Erlang/OTP — `gen_server:call/3` default 5000 ms; timeout exits the caller; selective `receive…after` leaves non-matching messages queued. https://www.erlang.org/doc/apps/stdlib/gen_server.html [primary]
27. AWS SQS — `ReceiveMessage.WaitTimeSeconds` 0–20, "maximum long polling wait time is 20 seconds"; empty list on timeout; visibility timeout default 30 s / max 12 h. https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html ; https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html [primary]
28. MCP — 2026-07-28 changelog + SEP-2663 + `ext-tasks` schema: `tasks/result` deleted; the blocking trap's stated reasons are HTTP intermediaries, long-lived SSE, session removal; `subscriptions/listen`; MRTR; no numeric timeout anywhere. https://modelcontextprotocol.io/specification/2026-07-28/changelog ; https://modelcontextprotocol.io/seps/2663-tasks-extension.md [primary]
29. Chroma, "Context Rot" — 18 models, 194,480 calls; shuffled haystacks outperform logically structured ones; focused ~300-token prompts beat 113k-token LongMemEval prompts. https://research.trychroma.com/context-rot [primary]
30. Du et al., "Context Length Alone Hurts…", EMNLP 2025 Findings — 13.9%–85% degradation from length with distractors masked. https://arxiv.org/abs/2510.05381 [primary]
31. LbMAS, arXiv 2507.01701 — blackboard MAS beats CoT by 4.33% and static methods by 5.02%. https://arxiv.org/abs/2507.01701 [primary]
32. Salemi et al., arXiv 2510.01285 — blackboard data discovery 28.53% vs 24.01% master-slave; 13%–57% relative improvement. https://arxiv.org/abs/2510.01285 [primary]
33. "Why Do Multi-Agent LLM Systems Fail?" (MAST), arXiv 2503.13657 v2 — FC1 41.77 / FC2 36.94 / FC3 21.30; withholding 1.66%, ignoring input 0.17%, conversation resets 2.33%, context loss 3.33%; no "information overload" category; efficiency metrics excluded. https://arxiv.org/abs/2503.13657 [primary]
34. Kafka — `max.poll.records` 500, `max.poll.interval.ms` 300000, `retention.ms` 604800000, `auto.offset.reset` default `latest`, `cleanup.policy` `delete`; consumer-group offsets. https://kafka.apache.org/42/configuration/consumer-configs/ ; https://kafka.apache.org/42/configuration/topic-configs/ [primary]
35. Redis Streams — `XADD` `MAXLEN`/`MINID`/`KEEPREF` (default) / `DELREF` / `ACKED`; `XREADGROUP`; `XACK`; `XPENDING`; `XAUTOCLAIM`; consumer groups are load-balancing; `XINFO GROUPS lag`. https://redis.io/docs/latest/commands/xadd/ ; https://redis.io/docs/latest/develop/data-types/streams/ [primary]
36. NATS JetStream — pull `fetch` (`max_messages`, `expires`); `MaxAckPending` (server default 1000); `JsAckWaitDefault` 30 s; `DiscardOld` (default) vs `DiscardNew`; `MaxMsgs`/`MaxBytes`/`MaxAge`. https://docs.nats.io/learn/jetstream/pull-consumers ; https://docs.nats.io/learn/jetstream/shaping-the-stream [primary]
37. AMQP 0-9-1 — `basic.qos(prefetch-size, prefetch-count, global)`; RabbitMQ deviates on `global` (per-consumer, not per-channel); `x-max-priority` [1,255] with documented cycle-drain starvation fix. https://raw.githubusercontent.com/rabbitmq/amqp-0.9.1-spec/main/docs/amqp-0-9-1-reference.md ; https://www.rabbitmq.com/docs/consumer-prefetch ; https://www.rabbitmq.com/docs/priority [primary]
38. Zulip — muting: "Messages in muted topics do not generate notifications … unless you are mentioned"; unread counts; email batching over a configurable period; `GET /messages` 1000-recommended/5000-max per request. https://zulip.com/help/mute-a-channel ; https://zulip.com/help/email-notifications ; https://zulip.com/api/get-messages [primary]
39. Slack — rate-limit tiers and 429/`Retry-After`; event delivery not rate limited vs writes at 1/s. https://docs.slack.dev/apis/web-api/rate-limits [primary]
40. Mailman 3 digester — size-threshold-triggered digests. https://docs.mailman3.org/projects/mailman/en/latest/src/mailman/runners/docs/digester.html [primary]
41. Zulip — mute semantics verbatim incl. mention override and auto-unmute on participation. https://zulip.com/help/mute-a-channel ; https://zulip.com/help/mute-a-topic [primary]
42. MCP 2025-11-25 — `tasks/result` "MUST block the response until the task reaches a terminal status"; status enum; `tasks/cancel` MUST-transition rule; Timeouts section (SHOULD, unquantified). https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks [primary]
43. `omp://session.md` + `src/session/agent-session.ts` — entry taxonomy; IRC persisted as `custom_message` in the recipient's JSONL. [primary]
44. `src/internal-urls/local-protocol.ts` + `context.ts` — session-scoped `local://` root shared by subagents. [primary]
45. `src/internal-urls/router.ts` + `omp://rpc.md` — fixed builtin scheme list; host schemes reserved. [primary]
46. Taelin, OptChat spec (gist) — binary tree, 512-byte nodes, view never holds a whole message. https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449 [primary]
47. `omp://tools/wait.md` — documented 5/10/30/60/300 s message-only ladder, absent from installed 18.6.1 source. [primary]
48. FIPA-ACL — `fipa00061` (13 envelope fields, 22 performatives, `reply-by` without timeout behaviour), `fipa00026` (Request), `fipa00029` (Contract Net), `fipa00035` (Subscribe); KQML §3.6/§3.7 (`:reply-with`/`:in-reply-to`, performative classes). https://www.fipa.org/specs/fipa00061/ ; https://research.cs.umbc.edu/kqml/kqmlspec/section3.6.html [primary]
49. RFC 5322 — `Message-ID`, `In-Reply-To`, `References`. https://www.rfc-editor.org/rfc/rfc5322.html [primary]
50. AMQP 0-9-1 — `reply-to`, `correlation-id`, `basic.ack`/`basic.nack`. https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf [primary]
51. MQTT v5 — `Response Topic` (0x08), `Correlation Data` (0x09); §4.10.1 explicitly non-normative with no RPC timeout; §4.9 flow control and `Receive Maximum` default 65,535; 0x93 disconnect. https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html [primary]
52. RFC 1855 §2.0/§3.0 — private messages for personal/private/sensitive; channels for public discussion. https://www.rfc-editor.org/rfc/rfc1855 [primary]
53. Li et al., "Improving Multi-Agent Debate with Sparse Communication Topology", EMNLP 2024 Findings — MATH 64.0→66.0 with 41.5% cost reduction; not always sparser-is-better. https://aclanthology.org/2024.findings-emnlp.427.pdf [primary]
54. TalkHier, arXiv 2502.11098 — structured message tuple (M, B, I); supervisor→member edges carry more background; ablation: +2.78 pp structured comm, +8.91 pp for the background field. https://arxiv.org/abs/2502.11098 [primary]
55. "The Hallucination Snowball", arXiv 2608.14588 — 23.7% of injected hallucinations survived to final output undetected. https://arxiv.org/abs/2608.14588 [primary]
56. Smith, "The Contract Net Protocol", IEEE ToC 29(12), 1980 — cfp/propose/accept-proposal. https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf [primary]
57. Corkill, "Blackboard Systems" (AI Expert, 1991) — shared global database + independent knowledge sources + control component. https://dancorkill.com/pubs/ai-expert.pdf [primary]
58. `src/tools/vibe.ts:45-48,133-141,182-206` + `src/prompts/tools/vibe-wait.md` — `vibe_wait` (default 30 s, `interruptible = true`, timeout text). [primary]
59. `src/extensibility/extensions/types.ts:669-744, 485-595, 1588-1598` — `ToolDefinition` fields, `ExtensionContext`/`ExtensionAgentIdentity`, `deliverAs` semantics; `interruptible` absent from the interface. [primary]
60. Redis `BLPOP` — timeout 0 blocks indefinitely; double-valued timeout; nil on timeout. https://redis.io/docs/latest/commands/blpop/ [primary]
61. Akka — `ask` timeout raises `TimeoutException`; "the receiving actor does not know and may still process it to completion"; `stash` capacity + `StashOverflowException`. https://doc.akka.io/libraries/akka-core/current/typed/interaction-patterns.html ; https://doc.akka.io/libraries/akka-core/current/typed/stash.html [primary]
62. BullMQ `lockDuration` / NATS `AckWait` — lease-with-expiry claim analogues. `findings/F6-blackboard-claimboard.md` [primary, aggregated]
63. `pi-agent-core/src/types.ts:1003` — `useless` "safe for compaction to elide once consumed (e.g. zero matches, wait timeout)". [primary]
64. `pi-tui/src/tools/irc.ts` — `IrcMessage` fields; `DEFAULT_PEER_ROSTER_LIMIT = 32`; `wakeRelay` guard. [primary]
65. Matrix v1.5/1.7 client-server API — `event_id`, `m.relates_to`, `m.thread`, `m.read` receipts, `m.fully_read`. https://spec.matrix.org/v1.7/client-server-api/ [primary]
66. IRCv3 — message-tags, `batch`, `labeled-response` (label correlates command↔response), `message-ids` (`msgid` identifies a message; not interchangeable). https://ircv3.net/specs/extensions/message-tags ; https://ircv3.net/specs/extensions/message-ids [primary]
67. XMPP XEP-0201 (message threads) and XEP-0359 (unique/stable stanza ids). https://xmpp.org/extensions/xep-0201.html ; https://xmpp.org/extensions/xep-0359.html [primary]
68. RFC 8098 (MDN request/response) and RFC 3834 (`Auto-Submitted`). https://www.rfc-editor.org/rfc/rfc8098.html ; https://www.rfc-editor.org/rfc/rfc3834.html [primary]
69. XMPP XEP-0184 — delivery receipts signal delivery to the client, not comprehension; "not recommended for groupchat". https://xmpp.org/extensions/xep-0184.html [primary]
70. RFC 1459 §8.10 — flood control algorithm; "1 message every 2 seconds". https://www.rfc-editor.org/rfc/rfc1459 [primary]
71. MQTT v5 §4.9 — send quota applies only to QoS>0 PUBLISH; non-PUBLISH control packets MUST NOT be delayed. https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html [primary]
72. Mark, Iqbal, Czerwinski, Johns & Sano, CHI 2016 — batching × duration on perceived productivity F = 3.05, p = .05; no batching effect on stress F = 1.30, p = .30. https://ics.uci.edu/~gmark/Home_page/Publications_files/CHI%2016%20Email%20Duration.pdf [primary]
73. Mark, Gudith & Klocke, CHI 2008 — interrupted work faster (20.31 vs 22.77 min), equal errors, higher stress (p < .001). https://www.ics.uci.edu/~gmark/chi08-mark.pdf [primary]
74. Mark, Gonzalez & Harris, CHI 2005 — 57% interrupted, 25 min 26 s same-day resumption; the "23 min 15 s" figure is absent from the paper. https://leaddev.com/wp-content/uploads/2023/05/CHI2005.pdf [primary]
75. Iqbal & Horvitz, CHI 2007 — 4.28 email alerts/hr, 16 min 33 s resumption after an email alert, 27% of alerts diverting >2 h. https://doi.org/10.1145/1240624.1240730 [primary]
76. `src/prompts/tools/wait.md` — "Wait only when blocked with nothing else to do"; "Results and messages auto-deliver. NEVER poll while work remains." [primary]
77. `src/task/structured-subagent.ts:604,674-676` — `restrictToolNames = policy.planMode || …`; extension tools dropped. [primary]
78. `src/sdk.ts:724-725,2198` — `enableIrc: restrictToolNames ? false : options.enableIrc`. [primary]
79. `src/utils/event-bus.ts` + `src/extensibility/extensions/loader.ts:490-520` — shared `EventBus` per session tree; module-level state shared across rebinds. [primary]
80. `omp://extensions.md` + `src/extensibility/extensions/runner.ts` — `before_agent_start` and prompt-override contract. [primary]
81. `src/task/executor.ts:339-372` + `src/prompts/system/subagent-system-prompt.md` — `§ Coop`/`# Peers` roster, cap 32, start-time snapshot, live peers only. [primary]
82. Zulip `GET /messages` — 1000-recommended, 5000-max per request; `anchor=first_unread`. https://zulip.com/api/get-messages [primary]

Primary — round-1 findings files, cited as aggregated surveys (all accessed 2026-10-06):
83. `findings/F0-omp-primary-verification.md` — orchestrator primary verification of the native substrate. [primary, aggregated]
84. `findings/F1-native-irc-substrate.md` + `findings/F1b-native-irc-source.md` — `IrcBus`, delivery semantics, identity, persistence, limits. [primary, aggregated]
85. `findings/F2-omp-plugin-surface.md` — extension registration surface, delivery semantics, restricted children. [primary, aggregated]
86. `findings/F6-blackboard-claimboard.md` — 12 LLM frameworks + classical/work-queue claim survey. [primary, aggregated]
87. `findings/F9-multiagent-papers.md` — pro/anti-communication paper survey. [primary, aggregated]
88. `findings/F10-failure-modes-costs.md` — measured failure modes and costs. [primary, aggregated]
89. `findings/F11-channel-dm-coexistence.md` — IRC/Slack/Discord/Zulip + broadcast-vs-directed literature. [primary, aggregated]
90. `findings/F12-blocking-wait-primitives.md` — MCP/A2A/ACP/AG-UI, harness prior art, infra primitives, abort semantics. [primary, aggregated]
91. `findings/F13-message-envelope-addressing.md` — speech acts, ACLs, wire correlation, LLM envelopes. [primary, aggregated]
92. `findings/F14-attention-backpressure.md` — cursors, backpressure, chat-platform limits, interruption research. [primary, aggregated]

Secondary (used only where no primary exists; tagged in findings):

93. `findings/F14` — SQS message retention 4 d default / 14 d max rests on a secondary summary. [secondary]
94. `findings/F10` — practitioner coordination-tax and cost figures (30–40% coordination tax, $18k–90k/month, 40% project cancellation) are unrefereed secondary. [secondary]
