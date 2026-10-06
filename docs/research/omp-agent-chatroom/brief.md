# Brief: omp agent chatroom plugin

Date: 2026-10-06
Depth: **deep** (3 researcher agents, each fanning out its own angle workers, 25+ sources target)

## Question

What is the correct design for an omp plugin that gives one agent process a persistent
group-chat room — chat + claim board + blackboard — spanning the main agent, its
subagents, nested subagents, and future joiners, with bounded context?

## Decision

This report informs ONE choice: **build or not build, and if build, what architecture.**

Specifically it must settle:

1. **Is there an irreducible gap** that native `agent://` peer messaging + Agent Hub
   steering do not already fill for a single omp process?
2. If a gap exists, **what transport/protocol** (in-process bus, MCP notifications, socket)
   and **what tools** the plugin registers.
3. **Delivery model**: pull-only vs push-when-mentioned, and the interrupt semantics —
   do messages arriving mid-turn land at a step boundary (`deliverAs: "aside"`),
   at turn end (`followUp`), or immediately (`steer`)?
4. **Context bound**: append-only log + binary-tree progressive summarization
   (OptMem/OptChat pattern) versus plain transcript + compaction.
5. **Onboarding**: how a brand-new agent learns the room exists, who is in it, and
   what it must read to be useful.

Not answerable: "write the code". No implementation this round.

## Answer form

Layered, gap-first:

- **Gap analysis** vs native IRC / `agent://` / Agent Hub / workpool / `wait` / MCP notifications.
- **Prior art landscape**: other harnesses' multi-agent messaging, inter-agent protocols,
  shared-blackboard systems, agent memory compression.
- **Blueprint**: concrete component list, tool surface, data model, open decisions.
- **Verdict**: build / narrow / do not build, with the specific evidence that drives it.

## Scope

**In:** omp extension/plugin capability surface (from `omp://` docs, primary); native
IRC + `agent://` semantics; other agent harnesses and multi-agent frameworks; inter-agent
protocols (MCP, A2A, ACP, and others); shared-blackboard/claim-board/stigmergy patterns;
agent memory compression and bounded-context techniques incl. OptMem/OptChat
(github.com/VictorTaelin/OptMem, x.com/VictorTaelin/status/2081453432318132603 and
/2106569004454219875, /2105310296482906202); failure modes and measured costs of
multi-agent chatter; onboarding/discovery.

**Out:** implementation, TypeScript plugin code, UI/TUI rendering design, protocol
versioning for a shipped product, market sizing.

## Assumptions

- Single omp process today; multi-process and cross-harness are future, not blockers.
- "Group chat" means the plugin mediates messages between agents that already exist in
  the registry, not between independently-launched processes.
- Agents in a swarm are mostly idle or busy, and the room must not wake them wastefully.
- The report may conclude the idea is redundant with native IRC. That is a valid answer
  and must be argued with the same rigor as a build recommendation.

## Angles

1. **Native substrate, exact semantics** — how `write agent://<id>`, `agent://all`,
   steering, unread counts, abort/steer signal folding, and the Agent Hub actually work.
   What is already solved. Source: `omp://` docs and repo source where reachable.
2. **Plugin capability surface** — what an omp extension can actually do: `registerTool`,
   `registerCommand`, events, `ctx.setInterval`, `runEphemeralTurn`, `sendMessage`
   `deliverAs` semantics, shared EventBus across sessions, restriction on restricted
   children. Source: `omp://extensions.md`, `omp://extension-loading.md`,
   `omp://plugin-manager-installer-plumbing.md`, `omp://mcp-*.md`, `omp://sdk.md`.
3. **Other harnesses' multi-agent messaging** — Claude Code agent teams, Codex
   multi-agent, Cursor, OpenCode, Cline, Roo, Aider, Devin, Manus, and any shipped
   agent-to-agent chat feature. Primary sources: official docs, repos, changelogs.
4. **Inter-agent protocols** — MCP notifications/elicitation, Google A2A, Anthropic
   agent messaging conventions, ACP, any agent-bus protocol. Specs, not blog posts.
5. **Shared blackboard / claim board** — blackboard architectures, contract-net protocol,
   stigmergy, blackboard LLM frameworks (AutoGen group chat, LangGraph shared state,
   CrewAI, CAMEL, ChatDev, MetaGPT, AgentVerse), work-queue claim patterns.
6. **Bounded context / memory compression** — OptMem/OptChat binary-tree progressive
   summarization and its OptChat harness form; recursive summarization; MemGPT/Letta;
   Mem0, Zep/Graphiti; generative-agents; context-rot evidence.
7. **Papers** — arXiv/ACL work on multi-agent LLM communication, emergent communication,
   inter-agent protocol design, coordination overhead, when communication hurts.
8. **Failure modes and costs** — redundant chatter, context dilution, cost blowup,
   coordination breakdown, "agents talking past each other"; measured or reported numbers
   with sources. Counter-angle lens, actively hunt postmortems and negative results.
9. **Onboarding and discovery** — how a new agent joins a room, what it must read,
   identity/presence, backpressure, unread budgets, "relevant vs noise" filtering.
   Includes how to make a fresh subagent useful in one turn.

## Manager plan (orchestration)

| Manager | Angles | Findings files |
|---|---|---|
| M1 native-omp | 1, 2, 9 (omp half) | F1-native-irc-substrate, F2-omp-plugin-surface, F3-omp-onboarding-discovery |
| M2 prior-art | 3, 4, 5 | F4-harness-messaging, F5-interagent-protocols, F6-blackboard-claimboard |
| M3 context-onboarding | 6, 9 (general half) | F7-bounded-context-compression, F8-onboarding-presence |
| M4 papers-failures | 7, 8 | F9-multiagent-papers, F10-failure-modes-costs |

Primary sources for angles 1/2/9-omp: `omp://` docs plus the installed package source at
`~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src` (omp 18.6.1).

---

## Addendum A — hybrid design round (2026-10-06, after first report)

### Why this round exists

The first report framed the choice as either/or: keep native `agent://` **or** build a room.
The user pushed back correctly — IRC itself is channel **+** direct message coexisting, not a
replacement. The revised question is **how the two compose**, and what tool surface makes
agents *able to chat easily* rather than merely *permitted* to.

### Revised question

Design a **hybrid**: native `agent://`/IRC stays for point-to-point steering and interrupts;
the plugin adds a room for high-volume discussion, mentions, claims, and status. Plus a
**blocking-wait tool surface** (`wait for agent`, `wait for next message`, `wait for claim
released`) so an agent can block on coordination instead of polling.

### Addendum decision

Settle: (a) when a message should go to the room vs stay a direct `agent://` message;
(b) the exact wait/blocking tool surface and its interrupt semantics; (c) the message
envelope and addressing model for agent chat; (d) the attention/backpressure model that
stops a high-volume room from drowning its members.

### Addendum angles

10. **Channel/DM coexistence + high-volume room mechanics** — IRC channel vs `/msg`,
    Slack/Discord/Zulip models, threading, topic segmentation, mute/digest, rate limits,
    mention semantics, and when chat beats direct messages. What makes a busy room useful
    rather than noise.
11. **Blocking/wait primitives for agents** — `wait for agent`, `wait for message`,
    `wait for claim`; long-poll vs polling vs push; how MCP/A2A/ACP express blocking waits;
    prior art in harnesses. Include the omp feasibility finding below.
12. **Message envelope and addressing for agent chat** — structured vs free-form; speech-act
    performatives (FIPA-ACL, KQML), structured protocols (TalkHier, AgentPrune); reply-expected
    semantics, correlation ids, request/response over a channel; how an agent knows a reply is
    wanted and how the responder knows it was read.
13. **Attention, priority, and backpressure** — per-agent queue vs shared log, cursors,
    unread budgets, priority tiers, push-vs-pull economics; evidence on keeping agents from
    drowning in each other's updates.

### Orchestrator inline finding (verified, do not redo)

- omp has **no global tool-execute timeout** in the agent loop; a long-blocking tool call is
  viable and bounded only by its own abort-signal handling.
- `interruptible` is read by the agent loop as `tool?.interruptible` (boolean or
  `(args) => boolean`), and `applyToolProxy` copies own keys from a `ToolDefinition` onto the
  adapter — so an **extension tool can opt into interruptible semantics at runtime**, but
  `interruptible` is NOT declared in the `ToolDefinition` TS interface. Source:
  `pi-agent-core/src/agent-loop.ts:3265-3288`,
  `pi-agent-core/src/types.ts:1159`, `src/extensibility/tool-proxy.ts:6-31`,
  `src/extensibility/extensions/wrapper.ts:77`.
- Only two native tools declare it: `src/tools/wait.ts:56`, `src/tools/vibe.ts:141`.

### Addendum scope

**In:** the four angles above, primary sources only. **Out:** implementation, UI design.

### Addendum answer form

A second report, `REPORT-v2-hybrid.md`, that supersedes the first report's
"Considered and rejected → full persistent room" row and its recommendation, and answers:
room-vs-DM routing rule; wait tool surface; envelope/addressing; attention model.

---

## Addendum B — hierarchical log compression (2026-10-06, after PLAN-build.md)

### Why this round exists

Round 3's plan bounds context with per-agent cursors + caps + a `gap` record, and ships **no**
hierarchical compression. The user wants the tree after all, with a specific and better shape
than round 1 considered: **agents read raw messages normally; the tree compresses only the
backlog**, so a late joiner gets a bounded view instead of a `gap` and a hole.

That inverts round 1's objection. Round 1 rejected "the tree as the room log" because OptChat's
view never holds a whole message. It did not evaluate "raw log for the hot tail, tree for the
cold tail, zoom to descend" — which is what the user is describing.

### Revised question

Given an append-only multi-writer room log, design a **two-region** store: a raw tail every
member reads verbatim, and a compressed tree over the older region that a late joiner reads as
a bounded view and can `zoom(lo, hi)` to descend. Settle who compacts, how races are avoided,
what the digest becomes, and what invariants survive.

### Addendum decision

Settle: (a) the store layout and node format; (b) **who runs compaction** in a multi-writer
system and how concurrent compaction is serialised; (c) the boundary rule (raw vs compressed)
and how a cursor maps onto it; (d) `zoom` semantics and addressing when a node covers N
messages; (e) what happens when a compressed node must be invalidated; (f) failure modes —
a member whose cursor falls below the raw tail, a crashed compactor, a divergent node.

### Addendum angles

14. **Multi-writer hierarchical summarisation** — OptMem/OptChat mechanics re-read as a
    *two-region* design; who compacts; whether any multi-agent system does this; CRDT/epoch
    approaches to a shared summarised log; content-defined chunking; Merkle/append-only trees
    (transparency logs, git, IPLD); and whether a summariser must be a single writer by
    construction.
15. **Raw-tail + cold-tree boundary and cursor semantics** — Kafka/NATS retention vs replay;
    how `zoom` addresses a range; node invalidation; what a `gap` becomes when a tree exists;
    and whether a late joiner can be *guaranteed* a bounded view.

### Addendum constraints

- The tree must never be required for correctness: the raw log stays authoritative and the
  tree must be rebuildable from it (OptMem's own property).
- No agent may be blocked on compaction to make progress.
- Compaction must not be an unbounded LLM cost sink; it needs a budget.
- Restricted/plan-mode children still cannot join — unchanged.

### Addendum answer form

A round-4 report `REPORT-v3-tree.md` plus findings F20/F21, and an update to
`PLAN-build.md` §3 (store) and §5.4 (digest) with the two-region design, marked by confidence
and with the unmeasured parts called out.