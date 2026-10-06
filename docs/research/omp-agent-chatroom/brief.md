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