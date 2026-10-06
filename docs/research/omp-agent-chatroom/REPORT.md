# Should omp build a persistent agent chatroom plugin?

**Answer:** Build a **narrow** version, not the room. omp's native substrate already covers
transport, addressing, cross-session injection, wake/interrupt semantics, presence, and
revival — so the irreducible gap is *room semantics only*: a shared durable log, topic
addressing, claims/locks, and read cursors. But the measured evidence says free-form shared
context makes agents worse, while the one structure with positive results is a **claim/status
board with central verification and a bounded join digest**. Build that as a small tool
surface; do not build a persistent chat log every agent reads.

**Confidence:** medium-high on the gap analysis and on the "don't build a chat log" half
(multiple independent primary sources agree). Medium on the "build the claim board" half —
no paper studies a claim board for LLM agents, so that recommendation is inference from
adjacent evidence (contract-net, Anthropic's artifact-passing, Google's validation-bottleneck
finding), not a measured result.

## Why

**1. The transport gap is much smaller than it looks.** `write agent://<id>` and
`agent://all` already deliver peer messages inside one omp process: a process-global
`IrcBus` with a 100-message per-agent mailbox, four delivery outcomes (`injected` /
`woken` / `revived` / `failed`), parked-agent revival, advisor exclusion, and abort
tombstones [1][2][3]. Delivery is state-aware: a parent's message hard-steers a streaming
child, a sibling's message lands at the next step boundary, an idle child gets a real wake
turn whose output is relayed back, and plan mode folds into context without a turn
[3][4]. `wait` blocks on the next owned job, service, or peer message with a 30-minute cap
[5]. Visibility is flat — every non-advisor `running`/`idle` agent [6] — and every subagent's
system prompt already carries a live peer roster capped at 32, rendered after the
`<project-context>` block for prompt-cache stability [7][8].

**2. And an extension can build on that substrate without any new omp API.** Extension
factories are rebound per child session while module-level state stays shared, so a plugin
can hold one room store for the whole session tree [9][10]. `AgentRegistry` is a public
export, and `AgentRef.session` is the live `AgentSession` with public
`sendCustomMessage`/`steer`/`followUp` [11][12][13]. The shared `EventBus` is forwarded to
children [14][15]. That is enough for a room store, a roster, and real push delivery.

**3. What is genuinely missing is only semantics.** There is no room, channel, or topic:
`agent://all` is a client-side fan-out of N separate one-to-one sends [16][17]. There is no
shared durable log — each message is stored (if at all) only in the *recipient's* session
JSONL, so a late joiner cannot reconstruct a broadcast it did not receive [18][19]. There is
no claim/lock primitive anywhere in omp [2][20]. "Unread" is mailbox depth and only ever
reflects *failed* hand-offs, because a delivered message is never buffered [21][22]. There
are no read receipts [21]. Cross-process does not exist outside Collab, which shares a
session with a human, not agent-to-agent [23].

**4. But the measured evidence is against a chat log specifically.** Anthropic's own
multi-agent system — the strongest pro-multi-agent primary source — reports multi-agent
systems use ~15× the tokens of chat, that token usage alone explains 80% of performance
variance on their benchmark, and that the architecture is a poor fit for "domains that
require all agents to share the same context or involve many dependencies between agents"
[24]. Their documented early failure modes include agents "distracting each other with
excessive updates" and duplicated work [24]. Cognition's production finding is that their
generator–verifier loop works *best* when the reviewer starts with a completely clean
context, because "clean context makes the agent smarter because of the math of attention"
[25][26]. Chroma's Context Rot tested 18 models over 194,480 calls: performance degrades as
input grows even on trivial tasks, and — counterintuitively — logically coherent haystacks
performed *worse* than shuffled ones [27]. Independent work shows 13.9%–85% degradation from
length alone with distractors masked [28].

**5. Unstructured peer exchange is the worst-measured regime.** Homogeneous debate consumes
2.1–3.4× more tokens than isolated self-correction for equal or lower accuracy, with modal
adoption up to 85.5% and a consensus-collapse oracle gap up to 32.3pp [29]. Five debate
methods across nine benchmarks and four models "often fail to outperform simple single-agent
baselines" at significantly higher compute [30]. Google/MIT measured independent multi-agent
error amplification at 17.2× and centralized at 4.4× [31]; a static scan found "multi-agent
chat without turn bounds" to be one of three dominant infinite-loop patterns in real projects
[32].

**6. The one structure with positive evidence is a board, not a chat.** Anthropic's fix for
redundant work was routing subagent output to a filesystem rather than through conversation
history, which "minimises the game of telephone" [24]. Google's fix for error amplification
is a central validation bottleneck [31]. Contract-net's claim/award is the classical answer
to redundant work, and Smith himself flagged network overload and recommended short messages
and interacting only with relevant agents [33]. Only two of twelve surveyed LLM frameworks
ship a real lock primitive, and only one detects write conflicts instead of losing updates
[34]. No framework offers a first-class task-claim primitive [34].

## What would change this

- **A measured study of a persistent multi-agent room.** Every cost and failure number here
  comes from task-scoped pipelines, debate, or single-agent long-context work. No paper
  studies a persistent room, none compares a blackboard/claim board against free-form chat,
  and none measures shared-state maintenance cost or protocol stability across agent turnover
  [35][36]. A result showing a bounded room beats direct messaging would flip the
  recommendation.
- **A retrieval-quality result for a bounded room digest.** If a join digest plus pull-based
  detail lookup were shown to match a full transcript's task performance at a fraction of
  tokens, the chat-log objection weakens.
- **Evidence that omp's native path is enough in practice.** If redundant work and
  "talking past each other" turn out to be rare in real omp swarms, the claim board loses its
  motivation too.
- **A change in the substrate.** If a future omp exported `IrcBus` or added a room/claim
  primitive natively, the plugin's remaining value would collapse to prompt engineering.

## Considered and rejected

| Option | Why rejected |
|---|---|
| **Do not build anything** | The claim/lock gap is real: there is no way for two subagents to reserve disjoint work, and Anthropic documents exactly this failure (duplicated work, one subagent on the 2021 chip crisis while two others covered 2025 supply chains) [24][2]. |
| **Full persistent room (chat + board + blackboard, all agents read the log)** | Directly contradicted by measured context-rot and clean-context findings [25][27][28]; unbounded multi-agent chat is a documented runaway-loop generator [32]; and no evidence supports a persistent room's benefit [35]. |
| **Cross-process room** | Out of scope by the brief's assumption, and omp's only cross-process agent surface is Collab's host/guest session mirroring, which is human-facing [23]. |
| **Reuse `agent://all` as the room** | It is a per-recipient fan-out with no shared log; a late joiner cannot reconstruct it, and there is no membership, topic, or cursor [16][18]. |
| **MCP server as the room transport** | Extensions cannot act as MCP servers; they can only bridge MCP notifications *into* a session [37][38]. Also adds a process boundary for an in-process problem. |
| **`appendEntry` as the room store** | It writes a `custom` entry into *one* session's JSONL [39]. Durability across agents needs a file both can read — the shared `local://` root [40]. |
| **A new `room://` internal URL scheme** | `InternalUrlRouter.register` is process-global code with a fixed builtin list; builtin schemes are reserved and there is no extension API to add one [41][42]. |
| **OptChat's tree as the room log** | Its own spec says the view "never holds a whole message", each turn starts fresh, and it is single-agent by design; the spec's subagent section keeps subagent tool calls *out* of the main log [43]. The mechanics are good for bounding a *digest*, not for a shared multi-writer log. |

## Findings

### A. The irreducible gap, precisely

Solved natively (do not rebuild):

| Capability | Native mechanism | Source |
|---|---|---|
| Addressing | `agent://<id>`, flat namespace, advisor exclusion | [1][6] |
| Broadcast | `agent://all` → fan-out to `running`/`idle` peers | [16] |
| Cross-session injection | `AgentRef.session.sendCustomMessage/steer/followUp` | [11][12] |
| Wake an idle agent | `wakeForIrc` → real turn; output relayed to sender | [3][4] |
| Interrupt a running agent | parent → hard steer; sibling → step-boundary aside | [3] |
| Block on peers | `wait` (30-min cap, 500 ms progress) | [5] |
| Presence/identity | `AgentRef` (status, kind, parentId, activity, metrics) | [6][44] |
| Peer roster at spawn | `§ Coop` block, cap 32, cached prefix | [7][8] |
| Revival | idle TTL 7 min, `write agent://<id>` revives | [45][46] |
| Durable per-agent state | session JSONL (`custom`/`custom_message` entries) | [39][18] |

Missing (the actual gap): shared durable log [18][19]; topic/channel addressing [16]; claim
or lock [2][20]; read cursor / receipts [21][22]; room membership [16]; cross-process
transport [23]; a way for an extension to intercept or enumerate bus traffic [47][48].

**The gap is semantics, not transport.** That is the single most important finding for the
build decision.

### B. Prior art: the market is split, and the biggest players are cautious

- **Claude Code** ships three tiers of peer messaging: named subagents addressable by
  `SendMessage` with a sibling roster, experimental **agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,
  off by default) with file-backed mailboxes at `~/.claude/teams/{team}/inboxes/{agent}.json`
  and a file-locked shared task list, and cross-session messaging over a local Unix socket
  [49][50][51]. The task list is a *claim board*, and it needs file locking to avoid claim
  races [50].
- **Codex CLI** ships in-process peer messaging (`spawn_agent`, `send_message`,
  `followup_task`, `wait_agent`, `list_agents`, `resume_agent`) with explicit
  queue-vs-interrupt semantics and a SQLite-backed parent/child graph; the mailbox itself is
  in-memory [52].
- **Cursor** explicitly does **not**: staff state sibling-to-sibling messaging is absent and
  the coordinator is the relay; multiple open forum requests confirm the absence [53][54].
- **Warp** runs agents on "a durable, server-backed message bus" with per-agent inboxes
  [55]. **Cline** ships SDK teams with `mailbox.json` + `task-board.json` [56]. Most others
  (OpenCode, Roo, Aider, Jules, Factory, Zed, Gemini CLI, Google ADK local peers, LangChain
  Deep Agents, OpenAI Swarm/Agents SDK handoffs) have **no** peer channel — parent↔child
  only [57].
- **Protocols**: MCP has no room or shared log and is *removing* sessions/SSE-resumability in
  2026-07-28 [58][59]; A2A explicitly says it is "not an interactive messaging app" and
  disclaims message reliability [60]; ACP has no cross-session log [61]; ANP is the only
  surveyed protocol with ordered group events, and it explicitly has no history playback
  [62]. No protocol specifies a persistent multi-agent room as a first-class object [62].
- **Frameworks**: only 3 of 12 ship an explicit shared global board (MetaGPT's environment
  message pool with `_watch` subscription, ChatDev 1.0's `ChatEnv`, AgentVerse's
  `last_messages`), and all three are single-round/SOP-driven, not concurrent [34]. LangGraph
  is the only one that *errors* on concurrent writes instead of silently losing data;
  Agno documents non-atomic state merges; Letta's own docs now say "we do not recommend
  building on memory blocks anymore" [34]. Classical blackboard systems (Hearsay-II, BB1)
  arbitrate through a scheduler, not locks; Linda's `in` is an implicit claim; SQS's
  visibility timeout is the closest real-world claim primitive [63].

**Read:** peer messaging is becoming table stakes for coding harnesses, but nobody ships a
persistent multi-agent room, and the two most-cited failures (Claude Code teams, Cursor) are
experimental or absent.

### C. Blueprint (the narrow build)

**Components**

1. **Room store** — one module-level singleton per extension module, shared across session
   rebinds [9][10]. Append-only JSONL at a fixed path under the session's shared `local://`
   root (subagents share the parent root) [40]. Records are `{seq, ts, from, kind, topic,
   body, refs, ttl}` with `kind ∈ {msg, claim, release, note, roster}`. `seq` is a monotonic
   counter from the store; the file is the durable log [18].
2. **Roster/presence adapter** — read `AgentRegistry.global().list()` for identity and status,
   and subscribe to `onChange` for presence deltas [6][11][64]. Never invent peers; the
   registry is authoritative.
3. **Delivery adapter** — for the calling session use `pi.sendMessage(..., {deliverAs})`; for
   another agent use `AgentRegistry.global().get(id)?.session?.sendCustomMessage(...)`
   [11][12]. Skip `advisor` kind and `aborted` refs [1][6].
4. **Onboarding hook** — a `before_agent_start` handler that appends a bounded room digest to
   the prompt when the agent is not yet a member, plus a `room` tool for pull [65][66]. This
   is required because the native `§ Coop` roster is a start-time snapshot of live peers only
   and does not exist in restricted children [7][67].
5. **Claim arbiter** — first-writer-wins on `(topic, key)` with a TTL; a stale claim (TTL
   expired, holder `parked`/`aborted`/`idle` past threshold) is reclaimable and the previous
   holder is notified [2][6][63].

**Tool surface** (one tool, op-dispatched, `loadMode: "discoverable"`, `approval: "read"`):

| op | args | effect |
|---|---|---|
| `join` | — | returns the digest + a read cursor |
| `read` | `since?` | messages/claims after cursor, bounded |
| `post` | `topic, body, mention?` | append a message; push only on mention |
| `claim` | `topic, key, ttl?` | reserve; returns holder or grant |
| `release` | `topic, key` | drop a claim |
| `board` | — | current claims + roster (the compact view) |

**Data model / delivery semantics**

- Delivery: `deliverAs: "aside"` for ordinary posts (step boundary, does not interrupt the
  in-flight tool batch) and `"steer"` only for a direct mention of a *running* agent
  [68][69]. Never start a turn for chatter: pass no `triggerTurn` when idle so the post is
  appended without a turn [68]. This is deliberately weaker than `agent://`'s wake semantics,
  because waking an idle peer for every room post is the "distracting each other with
  excessive updates" failure [24][3].
- Interrupt budget: cap mentions per turn, cap pushes per agent per window; the native bus has
  no rate limit and unbounded aside queues, so the plugin must impose them [70][71].
- Claims carry TTL and holder identity; reclaim is explicit and logged, never silent — this
  is the one place the room adds a hard guarantee the native path lacks [2].

**Context bound** (see D) and **onboarding** (see E).

**Limits the blueprint cannot escape:** in-process only [23]; restricted/plan-mode children
get no extension tools at all, so the room cannot serve them [67][72]; `IrcBus` is not
exported, so the plugin cannot observe or intercept `agent://` traffic — only its own
[47][48]; `sendCustomMessage` returns `false` when the target cannot own a turn [12].

### D. Context bound: bounded digest, not a persistent log

The brief proposes OptMem/OptChat binary-tree progressive summarization. The pattern is
real and well-specified, but its mechanics argue *against* using it as the room's primary
store:

- **OptMem** (verified from source) is an append-only fixed-width log plus one file per block
  size; a block `[lo,hi)` is the compression of its two halves; `cover(T, budget)` tiles the
  log so recent memories stay verbatim and older ones collapse into larger blocks, and the
  LLM writes each summary via a lazy `nap` prompt [73][74]. It is a *single-agent* memory
  store of one-line facts, and its own README says a subagent "must never run `memo`" because
  it cannot judge what is already known [73].
- **OptChat** (spec verified from the gist) turns the memory into the chat: a purely binary
  tree with 512-byte nodes, a ~128 KB view, `fit()` merging the most-due pair, JOBS=8
  background compactors, and `settle()` so no call ever sees an unbuilt placeholder [43].
  Crucially, **the view never holds a whole message**, every turn starts fresh, and subagent
  tool calls stay out of the main log [43].

Applied to a multi-writer room, that design is a mismatch: OptMem's compression is a
single-writer lazy pipeline, and OptChat's view deliberately withholds raw messages from the
agent. For a room, the right shape is:

1. **A bounded digest on join** — the F8 synthesis (identity, roster, topic/purpose, bounded
   backlog, unread cursor, pinned/important, room config) [75], capped like omp's own
   `memory.summaryInjectionTokenLimit = 5000` and the native roster cap of 32 [76][7].
2. **Pull for detail** — a `read since=<seq>` returning bounded entries, plus `zoom`-style
   expansion of a summarized range if a tree is kept [43][73].
3. **Artifact-passing for bulk** — Anthropic's own finding: route subagent output to a
   filesystem rather than through conversation history, which "minimises the game of
   telephone" [24]. omp already has `local://`, `artifact://`, and `agent://<id>` for exactly
   this [40][77].
4. **Per-agent cursors**, not a shared read pointer — so a joiner's cost is its own backlog,
   and one slow agent cannot pin the room's context [21][75].

The measured reason is unambiguous: every agent reading an ever-growing shared log pays the
context-rot tax [27][28][78], and a coherent shared transcript performed *worse* than a
shuffled one in Chroma's tests [27].

### E. Onboarding

What exists natively: a push roster at spawn (live peers only, capped 32, start-time snapshot,
absent in restricted children) [7][8]; pull via `history://`, `proc://`, `agent://<id>`
[79][80][81]; identity/presence via `AgentRef` and the registry change feed [6][64]; stable
ids across revival [82][83]; parked peers counted but never named [7].

What a room must add: a digest because none of the above carries room state, membership, a
backlog, or a cursor, and the native roster does not reach restricted children [67][75]. The
join digest should follow the F8 synthesis [75], and the cheapest delivery is a
`before_agent_start` prompt append plus a `join` op [65][66]. Backpressure should reuse the
native patterns that already work: drop-oldest with a cap (the bus uses 100) [70], bounded
rosters (32) [7], and pull-only detail [21].

### F. Failure evidence (the refutation case)

The strongest counter-points, all primary:

1. Shared context is what degrades models — 18 models, 194,480 calls, coherent context worse
   than shuffled [27]; 13.9%–85% degradation from length alone with distractors masked [28];
   11 of 13 long-context models below 50% of baseline at 32K [78].
2. Unguided peer exchange makes agents worse and costs more — 2.1–3.4× tokens, 85.5% modal
   adoption, 32.3pp oracle gap [29]; debate "often fail[s] to outperform simple single-agent
   baselines" [30]; debate can flip correct answers to wrong via sycophancy/conformity [84].
3. Error amplification is structural — 17.2× independent, 4.4× centralized [31]; one atomic
   error seed causes widespread failure across six frameworks [85]; collective hallucination
   is self-sustaining (R₀ = 1.21) on scale-free topologies [86]; closed-system debate
   preserves answers while destroying reasoning faithfulness [87].
4. Sharing more context is not always right — Cognition's reviewer works best with a clean
   context [25][26]; teams fail to match their best member by up to 41.1% even when told who
   the expert is [88]; multi-agent teams reach 30.1% under distributed information vs 80.7%
   for one agent with complete information [89].
5. Unbounded multi-agent chat is a runaway-loop generator — 68 confirmed infinite-loop
   failures across 47 real projects, with "multi-agent chat without turn bounds" one of three
   dominant patterns [32]; a live two-week red-team with persistent memory and chat produced
   uncontrolled resource consumption, DoS, and cross-agent propagation of unsafe practices
   [90].

The pro-communication evidence exists and is not dismissed: role-structured and SOP-driven
systems do outperform single agents (MetaGPT, ChatDev, CAMEL) [91][92][93], more agents via
sampling-and-voting scales [94], chain-of-agents improves over RAG [95], TalkHier's structured
protocol beats o1-class baselines [96], and Anthropic measured +90.2% on their research eval
with a lead/subagent split [24]. The reconciliation the sources themselves support: structure
and heterogeneity help; homogeneous unguided exchange hurts [30][29][34].

## Open questions

- **No study covers this design.** No paper studies a persistent multi-agent room, compares a
  blackboard/claim board against free-form chat, measures shared-state maintenance cost, or
  measures protocol stability across agent turnover [35][36]. The blueprint is inference.
- **The wait ladder is a doc/code divergence.** `omp://tools/wait.md` documents a 5/10/30/60/300 s
  message-only ladder; the installed 18.6.1 `src/tools/wait.ts` implements only the 30-minute
  cap and a bus leg [5][97]. Do not design against the documented behavior without confirming
  the running version.
- **Unverified numbers carried in findings:** MAST's "41%–86.7% failure rates across 7
  frameworks" was not found in the abstract or either HTML revision [98]; Chroma's "30+pp
  middle-position drop" and "7.9% length-alone loss" are absent from the report text [27];
  IAL-Scan's "95.6% caused cost exhaustion" is not on the abstract page [32]; several
  practitioner cost figures (30–40% coordination tax, $18k–90k/month, 40% project
  cancellation) are unrefereed secondary [99]. None of these are load-bearing above.
- **Whether restricted children can ever join a room** is a hard blocker: extension tools are
  excluded from plan-mode and `restrictToolNames` sessions entirely [67][72].
- **Cross-process rooms** have no omp transport short of building one; Collab is the only
  precedent and it is host/guest session mirroring [23].

## Sources

Primary — omp first-party docs (`omp://`, omp 18.6.1) and installed source
(`~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`), all accessed 2026-10-06:

1. `src/irc/bus.ts` — `IrcBus`, mailbox cap 100, four delivery outcomes, advisor/abort rules. [primary]
2. `src/irc/messaging.ts` — `executeSend`, broadcast fan-out, `isIrcEnabled`. [primary]
3. `src/session/irc-bridge.ts` — delivery branching (steer / interrupts / wake / plan fold). [primary]
4. `src/session/agent-session.ts` — `wakeForIrc`, stranded-aside resume, public delivery methods. [primary]
5. `omp://tools/wait.md` — wait semantics, 30-min cap, documented message-only ladder. [primary]
6. `src/registry/agent-registry.ts` — `AgentRef`, `listVisibleTo`, `onChange`. [primary]
7. `src/prompts/system/subagent-system-prompt.md` — `§ Coop` / `# Peers` roster block. [primary]
8. `src/task/executor.ts` — `collectIrcPeerRoster`, cap 32, prompt assembly. [primary]
9. `omp://extensions.md` — extension API, delivery semantics, runtime model. [primary]
10. `src/extensibility/extensions/loader.ts` — `bindPreparedExtensions`, shared module state. [primary]
11. `src/sdk.ts` — `AgentRegistry` export, `eventBus` creation, restricted-session rules. [primary]
12. `src/index.ts` — package barrel (no `irc/*` export). [primary]
13. `src/session/agent-session.ts` (public methods) — `sendCustomMessage`/`steer`/`followUp`. [primary]
14. `src/utils/event-bus.ts` — `EventBus` implementation and `emitSubagentFrame`. [primary]
15. `src/task/structured-subagent.ts` — `eventBus: session.eventBus`, restricted-child clamps. [primary]
16. `src/internal-urls/agent-protocol.ts` — `agent://` read/write handler. [primary]
17. `omp://tools/write.md` — `agent://` write semantics and receipts. [primary]
18. `src/session/agent-session.ts` — IRC persistence as `custom_message` entries. [primary]
19. `src/internal-urls/history-protocol.ts` — `history://` index and transcripts. [primary]
20. `src/tools/todo.ts` + `omp://tools/task.md` — todo is parent-owned; no claim primitive. [primary]
21. `omp://agent-hub.md` — roster, unread IRC count, revive/kill, `agent://` artifact reads. [primary]
22. `src/irc/bus.ts` — `unreadCount`, mailbox only holds failed hand-offs. [primary]
23. `omp://collab.md` — host/guest session sharing, local host registry. [primary]
24. Anthropic Engineering, "How we built our multi-agent research system" — 15× tokens, 80% variance, poor fit for shared-context domains, artifact-passing. https://www.anthropic.com/engineering/multi-agent-research-system [primary]
25. Cognition, "Don't Build Multi-Agents" — "fragile systems", share-context principle. https://cognition.com/blog/dont-build-multi-agents [primary]
26. Cognition, "Multi-Agents: What's Actually Working" — clean context helps; cross-agent comms do not happen by default. https://cognition.com/blog/multi-agents-working [primary]
27. Chroma, "Context Rot" — 18 models, 194,480 calls, coherent haystacks worse. https://research.trychroma.com/context-rot [primary]
28. Du et al., "Context Length Alone Hurts…", EMNLP 2025 Findings — 13.9%–85% degradation. https://arxiv.org/abs/2510.05381 [primary]
29. "The Cost of Consensus", arXiv 2605.00914 — 2.1–3.4× tokens, 85.5% modal adoption, 32.3pp oracle gap. https://arxiv.org/abs/2605.00914 [primary]
30. "Stop Overvaluing Multi-Agent Debate", arXiv 2502.08788. https://arxiv.org/abs/2502.08788 [primary]
31. Google Research, "Towards a Science of Scaling Agent Systems" — 17.2×/4.4× error amplification, +80.9% centralized financial reasoning. https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/ ; https://arxiv.org/abs/2512.08296 [primary]
32. "When Agents Do Not Stop" (IAL-Scan), arXiv 2607.01641 — 68 infinite loops / 47 projects. https://arxiv.org/abs/2607.01641 [primary]
33. Smith, "The Contract Net Protocol", IEEE ToC 29(12), 1980. https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf [primary]
34. F6 findings — 12 LLM frameworks + 8 classical/work-queue systems, shared-state/lock survey. `findings/F6-blackboard-claimboard.md` [primary, aggregated]
35. F9 findings — "no paper directly studies a persistent group-chat room… no paper directly compares a shared blackboard/claim board vs free-form chat." `findings/F9-multiagent-papers.md` [primary]
36. F10 findings — gaps: no shared-state maintenance cost, no turnover protocol stability. `findings/F10-failure-modes-costs.md` [primary]
37. `omp://mcp-server-tool-authoring.md` — MCP config/tool bridge. [primary]
38. `omp://mcp-protocol-transports.md` — transports, notification handling. [primary]
39. `omp://session.md` — entry taxonomy (`custom`, `custom_message`). [primary]
40. `src/internal-urls/local-protocol.ts` + `src/internal-urls/context.ts` — session-scoped `local://` root, shared by subagents. [primary]
41. `src/internal-urls/router.ts` — fixed builtin scheme list, reserved schemes. [primary]
42. `omp://rpc.md` — `set_host_uri_schemes`; "Host URI scheme is reserved by OMP". [primary]
43. Taelin, OptChat spec (gist) — binary tree, 512-byte nodes, 128 KB view, `settle()`, subagent section. https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449 [primary]
44. `src/registry/agent-registry.ts` — `setActivity`, `AgentHistorySummary`, lifecycle milestones. [primary]
45. `omp://tools/task.md` — idle TTL 420,000 ms, revival, output caps, concurrency. [primary]
46. `src/registry/agent-lifecycle.ts` — park/revive/coalesce. [primary]
47. `src/extensibility/extensions/lifecycle-mirror.ts` — 19 mapped session events, no `irc_message`. [primary]
48. `src/tools/xdev.ts` + `src/extensibility/extensions/types.ts` — no bus access or scheme registration. [primary]
49. Claude Code docs, "Subagents" — `SendMessage`, sibling roster, resume. https://code.claude.com/docs/en/sub-agents [primary]
50. Claude Code docs, "Agent teams" — file mailboxes, file-locked task list, experimental gate. https://code.claude.com/docs/en/agent-teams [primary]
51. Claude Code docs, "Cross-session messaging" — Unix socket transport, turn-boundary delivery. https://code.claude.com/docs/en/cross-session-messaging [primary]
52. OpenAI Codex source, `multi_agents_spec.rs` + `agent/control/mailbox.rs` + `agent-graph-store` — tool set, delivery semantics, in-memory mailbox, SQLite graph. [primary]
53. Cursor staff reply on sibling-to-sibling messaging. https://forum.cursor.com/t/let-me-talk-to-subagents-and-let-sibling-agents-talk-to-each-other/171387 [primary]
54. Cursor docs, "Subagents". https://cursor.com/docs/subagents [primary]
55. Warp docs, "Orchestration" — durable server-backed message bus, per-agent inbox. https://docs.warp.dev/platform/orchestration [primary]
56. Cline SDK multi-agent reference — `mailbox.json`, `task-board.json`. https://github.com/cline/cline/blob/main/.agents/skills/cline-sdk/references/multi-agent/REFERENCE.md [primary]
57. F4 findings — 17-harness peer-messaging table. `findings/F4-harness-messaging.md` [primary, aggregated]
58. MCP spec 2025-11-25 — transports, notifications, server→client requests. https://modelcontextprotocol.io/specification/2025-11-25/ [primary]
59. MCP spec 2026-07-28 — sessions/SSE-resumability removed, `subscriptions/listen`, MRTR. https://modelcontextprotocol.io/specification/2026-07-28/ [primary]
60. A2A specification 1.0.0 — "not an interactive messaging app"; delivery disclaimer. https://github.com/a2aproject/A2A/blob/main/docs/specification.md [primary]
61. ACP (Zed) v1 — session model, no cross-session log. https://agentclientprotocol.com/protocol/v1/overview [primary]
62. F5 findings — 12-protocol comparison; ANP ordered group events without history playback. `findings/F5-interagent-protocols.md` [primary, aggregated]
63. F6 findings — Hearsay-II, BB1, contract net, stigmergy, Linda, SQS visibility timeout, Redis Streams `XCLAIM`. `findings/F6-blackboard-claimboard.md` [primary, aggregated]
64. `src/registry/agent-registry.ts` — `onChange` registry event feed. [primary]
65. `omp://extensions.md` — `before_agent_start` event and prompt override contract. [primary]
66. `src/extensibility/extensions/runner.ts` — `emitBeforeAgentStart` chaining. [primary]
67. `src/task/structured-subagent.ts` — `restrictToolNames = policy.planMode || …`; extension tools dropped. [primary]
68. `omp://extensions.md` — `deliverAs` semantics (`steer`/`followUp`/`nextTurn`/`aside`) and `triggerTurn`. [primary]
69. `src/extensibility/extensions/types.ts` — `sendMessage`/`sendUserMessage` option types. [primary]
70. `src/irc/bus.ts` — `MAILBOX_CAP`, drop-oldest. [primary]
71. `src/session/irc-bridge.ts` — unbounded aside queues; no rate limit. [primary]
72. `src/sdk.ts` — `enableIrc: restrictToolNames ? false : …`. [primary]
73. `VictorTaelin/OptMem` — README + `memo` source: log/tree layout, `cover()`, `nap`, subagent rule. https://github.com/VictorTaelin/OptMem [primary]
74. Taelin, X post 2081453432318132603 (OptMem announcement, 2026-07-26). https://x.com/VictorTaelin/status/2081453432318132603 [primary]
75. F8 findings — 7-protocol join/presence survey + synthesized 7-component join digest. `findings/F8-onboarding-presence.md` [primary, aggregated]
76. `omp://memory.md` — `memories.summaryInjectionTokenLimit = 5000`; memory backends. [primary]
77. `omp://agent-hub.md` + `src/internal-urls/artifact-protocol.ts` — `artifact://` and `agent://` artifacts. [primary]
78. Modarressi et al., "NoLiMa", ICML 2025 — 11/13 models below 50% baseline at 32K. https://arxiv.org/abs/2502.05167 [primary]
79. `src/internal-urls/history-protocol.ts` — `history://` fallback to on-disk JSONL. [primary]
80. `src/internal-urls/proc-protocol.ts` — `proc://` jobs/services listing. [primary]
81. `omp://tools/task.md` — `agent://<id>` artifact, `history://<id>` transcript, `local://` sharing. [primary]
82. `src/task/output-manager.ts` — id allocation, dot-qualified nesting, `-2`/`-3` uniquification. [primary]
83. `src/task/persisted-revive.ts` — revival restores the same id from the session file. [primary]
84. "Talk Isn't Always Cheap", arXiv 2509.05396 — sycophancy/conformity flip correct to wrong. https://arxiv.org/abs/2509.05396 [primary]
85. "From Spark to Fire", arXiv 2603.04474 — error cascades across 6 frameworks. https://arxiv.org/abs/2603.04474 [primary]
86. "Collective Hallucination in Multi-Agent LLMs", arXiv 2606.07941 — R₀ = 1.21. https://arxiv.org/abs/2606.07941 [primary]
87. "The Reasoning Trap", arXiv 2605.01704 — faithfulness 1.7% of baseline under majority-vote MAD. https://arxiv.org/abs/2605.01704 [primary]
88. "Multi-Agent Teams Hold Experts Back", arXiv 2602.01011 — losses up to 41.1%. https://arxiv.org/abs/2602.01011 [primary]
89. "Systematic Failures in Collective Reasoning" (HiddenBench), arXiv 2505.11556 — 30.1% vs 80.7%. https://arxiv.org/abs/2505.11556 [primary]
90. "Agents of Chaos", arXiv 2602.20021 — live two-week red-team, 11 case studies. https://arxiv.org/abs/2602.20021 [primary]
91. MetaGPT, arXiv 2308.00352. https://arxiv.org/abs/2308.00352 [primary]
92. ChatDev, arXiv 2307.07924. https://arxiv.org/abs/2307.07924 [primary]
93. CAMEL, arXiv 2303.17760. https://arxiv.org/abs/2303.17760 [primary]
94. "More Agents Is All You Need", arXiv 2402.05120. https://arxiv.org/abs/2402.05120 [primary]
95. Chain-of-Agents, arXiv 2406.02818. https://arxiv.org/abs/2406.02818 [primary]
96. TalkHier, arXiv 2502.11098. https://arxiv.org/abs/2502.11098 [primary]
97. `src/tools/wait.ts` — 30-min cap, bus leg only (no documented ladder). [primary]
98. "Why Do Multi-Agent LLM Systems Fail?" (MAST), arXiv 2503.13657 — v2 categories 41.77/36.94/21.30. https://arxiv.org/abs/2503.13657 [primary]
99. F10 findings — practitioner/secondary cost figures, flagged unrefereed. `findings/F10-failure-modes-costs.md` [secondary]

Secondary (used only where no primary exists, tagged in findings):

100. F8 findings — AGENTS.md/CLAUDE.md convention note. `findings/F8-onboarding-presence.md` [secondary]
101. F6 findings — Langroid `max_stalled_steps` docstring conflict; Semantic Kernel orchestration status. `findings/F6-blackboard-claimboard.md` [secondary]
