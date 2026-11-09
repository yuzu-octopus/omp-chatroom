# Brief: Multi-agent coordination patterns relevant to omp-chatroom

Date: 2026-11-09
Depth: deep (7 flat workers, target 25+ primary sources)

## Question
What current primary-source evidence exists for multi-agent coordination patterns that omp-chatroom could adopt — durable shared logs/cursors, claims/leases/fencing, bounded attention/injection, cross-process/thread coordination, roster/panel UX, digest/compaction — and what failure cases of swarms warn against? Which are feasible without breaking Bun/omp constraints?

## Decision
Which concrete features/optimizations to add to plugin (plugin/src, plugin/tests) vs reject. Report must rank feasible items, name rejected ideas with reasons.

## Answer form
Ranked recommendations + comparison evidence + rejected list. Concise answer first, citations inline.

## Scope
In: official docs, specs, source repos, original papers, benchmarks. Frameworks: AutoGen, LangGraph, CrewAI, Claude Agent SDK/Teams, OpenAI Agents SDK, A2A/ACP/MCP specs, JetStream/NATS, etcd/Zookeeper leases, Linda/tuple spaces, gossip/CRDT, MemGPT/Letta, OptMem. Practitioner failure postmortems.
Out: single-agent prompt engineering; market analysis; implementation code.
Plugin constraints: Bun-only, no build, host omp 18.18.1, Bun >=1.4.4, single-process per-root delivery-chain serialization, atomic single-writer lock, bounded recall, per-process room, three delivery transports, parked-peer revival via host bus, tool-throw suppression (all deliberate — do not re-flag without proof).

## Assumptions
Prior rounds already fixed many bugs; this is opportunity-hunting, not re-review. Cross-process future is in scope as evidence but must flag single-writer constraint conflict.

## Angles (7, flat)
F1 durable shared logs + cursors / event sourcing / idempotent replay
F2 claims/leases/fencing tokens / contract-net / work stealing
F3 bounded attention + injection policies / backpressure / priority tiers
F4 cross-process / thread / tuple-space / CRDT coordination
F5 roster/presence/panel UX in agent harnesses
F6 digest/compaction/memory summarization strategies
F7 swarm failure cases: duplication, deadlock, chatter overhead, postmortems
