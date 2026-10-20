# Large-swarm coordination: what actually makes it work, and what should our plugin do about it

**Date:** 2026-10-20
**Depth mode:** deep

## Question

Our omp plugin (`omp-agent-chatroom`) gives a session tree of agents a shared room: a claim board
with TTL leases, a bounded append-only chat log, tiered attention (T0 interrupt / T1 aside / T2
cursor-only), blocking waits (`wait_for_claim`, `wait_for_agent`, `wait_for_message`), a cold
summary tree over the log, and a TUI panel. The primitives are the ones people ask for, and the
plugin works — but in practice it does not make swarms coordinate *well*. We have plenty of
features; what we lack is effectiveness.

So: **how do other systems and the literature make large multi-agent coordination actually work,
and which of those findings should change this plugin (its mechanics), the guidance it hands
agents (a protocol it teaches), or both?**

## Decision this informs

Which of the following to build, and what to write into the plugin:

- **Mechanics**: change what the room can do (e.g. dependency ordering between claims, a shared
  task list, a "who is blocked on what" view, budget/backpressure on swarm chatter, richer
  ownership than a single lease, a heartbeat/lease-renewal protocol, conflict detection on
  overlapping edits, an escalation path, per-agent budgets).
- **Guidance**: ship the *protocol* — a playbook/skill/prompt the agents read, so they use the
  room the way the successful swarms use theirs (when to claim, when to wait, when to escalate,
  how to hand off, how to record a finding so a late agent can read it).
- **Agent research**: give agents a way to look things up mid-task (a retrieval tool over the
  coordination literature/patterns), so a swarm can consult prior art instead of improvising.

The research must END with a ranked, concrete list of changes for THIS plugin — not a survey.

## Scope

**In:**
- Multi-agent LLM frameworks and their coordination primitives (AutoGen, CrewAI, LangGraph,
  OpenAI Swarm/Agents SDK, Claude Agent SDK, smolagents, Letta, MetaGPT, ChatDev, OpenHands,
  SWE-agent, AgentVerse, and the omp/pi-agent ecosystem's own IRC semantics).
- The academic literature on multi-agent coordination: shared blackboards, contract nets,
  market/bidding mechanisms, distributed coordination, LLM-agent societies, emergent conventions
  and stigmergy, multi-agent debate, role assignment, credit assignment, coordination overhead.
- Distributed-systems primitives the plugin borrows or should borrow: leases/fencing tokens,
  optimistic concurrency, vector clocks, blackboards/tuple spaces, sagas, idempotency, work stealing.
- Failure modes and what makes swarms go wrong: duplicated work, deadlock/livelock, orphaned
  leases, coordination overhead drowning the task, agents talking past each other, lost findings,
  agent attrition, silent divergence, the "last agent standing" problem.
- Practitioner experience: what actually goes wrong in real swarms (forums, issue trackers,
  postmortems) — the counter-angle the vendor docs never publish.
- The measurement question: how do people MEASURE swarm effectiveness (throughput, duplication
  rate, wait-time, coordination-token overhead, escape rate)?

**Out:**
- Single-agent performance and prompt engineering.
- General multi-agent debate quality (the "which answer is better" literature) except where it
  bears on coordination.
- Building the plugin's internals; this is a research brief, not an implementation plan.
- Anything about the user's local omp setup, machine, or session store.

## Assumptions (written, not blocking)

1. The plugin's primitives (leases, tiers, waits, a durable log) are the right *shape*; the gap is
   in effectiveness and in agent behaviour, not in the absence of a primitive. If the research
   contradicts this, that is a finding, not a problem — report it.
2. The swarm we care about is one omp process: a main session plus `task` subagents, 5–50 of
   them, on one codebase. Cross-process coordination is deliberately refused by the plugin's
   single-writer lock.
3. Agents are LLM agents with a tool interface, not humans; the plugin already teaches them the
   room-vs-`agent://` rule.
4. "Working well" means: no duplicated work on the same resource, no agent blocked forever, a
   finding posted by one agent is usable by a later one, and the coordination cost stays a
   minority of the tokens.

## Answer form

A ranked, concrete recommendation list for this plugin, each item with: the change (what to
build or write), the evidence that it works, the failure it prevents, and a rough cost. Plus a
short table comparing the major systems' coordination models against ours (what they have that
we do not, and what we have that they do not). Plus an explicit answer on the "should agents read
papers" question: if retrieval or a distilled playbook is worth building, say which and why.

## Clusters (for the coordinator)

1. **Frameworks** — how real systems coordinate agents today; their primitives, their defaults,
   their known limits. Angle per framework family.
2. **Literature** — shared blackboards, contract nets, markets, stigmergy, multi-agent
   coordination theory; what the evidence says about which mechanisms work at scale.
3. **Failure modes** — what goes wrong in real swarms, from practitioners and postmortems.
4. **Primitives we could adopt** — leases/fencing, work stealing, dependency graphs, budgets,
   blackboards, heartbeat protocols; and the measurement instruments.

## Acceptance for the report

- Every claim cites a primary source (official docs, source code, spec, or the paper itself),
  with a fetch date.
- At least one academic angle with real papers (the "agents should read papers" question needs
  evidence about what the literature actually recommends).
- At least one practitioner/failure-mode angle — the counter-angle, from people who hit the
  problems, not the vendors.
- The ranked recommendation list is specific to THIS plugin's feature set (it can cite
  `room` ops, tiers, waits, the log, the tree, the panel) and each item says what to change.
- A measurement section: what we could instrument to know whether coordination got better.
