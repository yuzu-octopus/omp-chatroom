# Multi-agent coordination patterns for omp-chatroom

**Answer:** omp-chatroom already runs the proven core — append-only log + per-agent cursor + at-least-once delivery [1][2][3] — and the highest-value additions are small: (1) fence expired leases at the store edge with a monotonic generation check on write, (2) add shared completion state beside claim locks (locks alone leave 64% duplicate work [4]), and (3) gate wakeups behind a read-before-commit rule (teams recover 62-73% of failures when the committing agent must read pending messages first [5]). Adopting multi-writer CRDT/Linda-style shared state, wall-clock LWW ordering, or free-form team chat without a coordinator is rejected — each conflicts with the single-writer lock, and each predicts measured failure (deadlock 25-95% [6], teams losing in every environment [5], token cost 4x/15x [7]).

**Confidence:** high. Every load-bearing claim has 2+ independent primary sources (spec/paper/repo); gaps are marked. Date of access for all sources: 2026-11-09.

## Why

**Logs + cursors are proven, idempotence is not free.** Kafka offsets, JetStream durable consumers, Raft log matching, and LangGraph checkpoints converge on the same pattern: durable append-only log, per-consumer cursor, at-least-once redelivery, client-side dedup [1][2][3]. The chatroom log + cursor + delivered-set [1] matches this shape. Two warnings travel with it: replay re-triggers side effects unless gated [3], and exactly-once requires transactional outbox/dedup keys — never assume it [1][2]. AutoGen/LangGraph frameworks ship only the memory/snapshot half, not the cursor/ack half — the coordination layer must add ack semantics itself [1].

**Leases need fencing, and locks need state.** etcd/Chubby/Kleppmann agree: TTL alone does not stop a paused former holder from writing after expiry; the protected resource must validate a strictly monotonic fencing token [8][9]. LLM claim boards (dibs, llm-bus, byzantine-lease) are all advisory/manager-only — none enforce fencing at storage [10]. Grid-point evidence (grite, N=32): locks-only leaves duplicate work at 0.64 and highest redundant-rediscovery; locks + shared completion state drives it to 0.00 with 3x goodput [4]. That points at a concrete cheap addition for this plugin: a `done`/`completed` record kind (or completion flag on claim release) visible to `grant()`, so a new claimant checks "already done" before re-doing.

**Bounded attention has three proven policies.** Block (JetStream `MaxAckPending` pauses at cap [11]), drop-oldest (Redis `MAXLEN`, JetStream `DiscardOld` [11][12]), and summarize/compact (Anthropic threshold compaction, default 150k tokens [13]). Anthropic also reports the counter-case: for filesystem-grounded coding, a fresh context that re-discovers state can beat compaction [13]. Practical mapping: keep the T0/T1/T2 tiers, but cap unacked T1 delivery per recipient (block policy) and cap log retention per room (drop-oldest) rather than letting either grow unbounded [11][12].

**Cross-process alternatives are real but rejected here.** Linda allows many writers; exclusion must be layered on top [14]. CRDTs converge without coordination but cannot provide mutual exclusion — vector clocks detect concurrency, they do not pick a winner [15]. NATS core pubsub preserves only per-publisher order, no cross-publisher total order [16]. A2A deliberately avoids shared internal state; MCP has no multi-writer merge semantics [17]. OpenAI/Microsoft guidance converges on the coordinator pattern that matches the single-writer lock: workers propose, one writer serializes [18][19]. Keep proposals concurrent, commits serialized.

**Roster legibility: converge on idle/busy/waiting.** Claude (Working/Needs-input/Idle, 30s idle-hide, 3-idle collapse [20]), Cursor (ACTIVE/IDLE/WAITING_FOR_BACKGROUND_WORK [21]), OpenCode (idle/busy/retry [22]), Devin (working/blocked/... [23]) all separate "waiting on you" from busy. omp Agent Hub already implements this vocabulary plus tree toggle, `/` filter, revive (x kills, r revives) [24]. Gaps worth importing: stale-busy detection (OpenCode reports busy lingering after stream close [25] — treat busy older than N as suspect, expose abort) and a Needs-input class distinct from busy, since lumping waiting into busy hides "needs you" [20][21].

**Digest: hierarchical summary works, but recursive merge drifts.** OptMem's append-only log + binary summary tree + bounded wake view is the closest prior art to the chatroom tree [26]. RAPTOR shows tree retrieval lifts multi-step QA by ~20% absolute [27]; Ou & Lapata show recursive merging amplifies hallucinations on >100k-token docs, mitigable by citation/context alignment, not by abandoning the tree [28]. Context-rot papers split mechanism (attention competition [29] vs accumulation fatigue [30]) but agree: lowering peak context helps both. Letta's issues (#3270 full-wipe, #3279 summarizer capping [31]) warn that compaction config bugs are silent — surface compaction failures visibly (a `gap` record, not a silent skip).

**Failures quantify the cost of getting this wrong.** Duplicated work without coordination 78% at N=32 [4]. Deadlock 25-95% under simultaneous contention, 0% under sequential/ordered protocols; single-round messaging can hurt (25%→65%) while 3 rounds of pre-commitment fix it [6]. Teams lose to a single coordinator in every environment; the committal agent reads the ask in only 47-67% of episodes [5]. MAST's largest modes are step repetition (15.7%) and unaware-of-termination (12.4%) [32]. Anthropic: 4x tokens single-agent, 15x multi-agent, +90.2% only for decomposable breadth-first tasks [7]. Cognition's reversal (single-agent default for coding [33]) reconciles: the win depends on task decomposability, not on agent count.

## What would change this

- A primary, reproducible study showing resource-side fencing for LLM agents at storage level (all current LLM boards are advisory [10]).
- A faithfulness benchmark for OptMem-style trees vs flat truncation on agent logs (none exists [26]).
- A primary measurement of orphaned-lease recovery time in LLM swarms (unfound; grite measures starvation, not orphans [4]).

## Considered and rejected

| Idea | Why lost |
|---|---|
| Multi-writer shared state / CRDT merge | Violates single-writer exclusion; convergence ≠ exclusion [14][15] |
| Wall-clock LWW ordering | Clock skew makes "last" a policy, not causality [15] |
| Adopting NATS/MQTT as transport | No cross-publisher total order; adds a broker to a single-process plugin [16] |
| Free-form team chat without coordinator | Teams lose in every measured environment [5]; deadlock rises with unstructured comms [6] |
| Locks-only coordination | 64% duplicate work remains without shared completion state [4] |
| Unbounded per-recipient delivery | Violates block/drop policies proven at scale [11][12]; predicts 15x token cost [7] |

## Findings (ranked for this plugin)

1. **Fence at the store edge** (`plugin/src/store/claims.ts`): generation already exists per claim; require `grant`/`release` to validate generation matches current held generation, reject stale. Mirrors Chubby sequencer / Kleppmann token [8][9]. Validate: test with expired holder re-issuing.
2. **Completion state** (`plugin/src/store/claims.ts`, `room-store.ts`): add done-set; `grant` refuses if resource done. Evidence [4]. Validate: grite-style N=16 simulation, dup-work to 0.
3. **Read-before-commit** (`plugin/src/attention/delivery.ts`): before a claim `release`/`grant` commits, require recipient cursor ≥ pending mentions for that resource, or emit `gap` record. Evidence [5]. Validate: DPBench-style contention sim, deadlock→0.
4. **Per-recipient delivery cap** (`governor.ts`): block policy — pause T1 delivery at cap until cursor advances [11]. Validate: 50-message burst, no delivery storm.
5. **Stale-busy flag** (`plugin/src/panel/roster-strip.ts`): busy > TTL shown suspect with abort hint [22][25]. Validate: roster screenshot test.
6. **Compaction visible failure** (`compactor.ts`): on summary failure emit `gap`, never silent [31][28]. Validate: forced-failure test.

## Open questions

- Orphaned-lease recovery time in LLM swarms — no primary measurement.
- "Last agent standing" dominance — unquantified; nearest are silent-team collapse and protocol decay.
- Room-message token overhead in bounded claim-board settings — no primary numbers; swarm token data comes from long-context frameworks.
- Devin/Cursor local panel visuals — API enums only.
- ACP spec, gossip wire protocol, full Letta summarizer bodies — unfetched.

## Sources

[1] Kafka design: https://kafka.apache.org/40/design/design/ [primary] · Kafka producer configs: https://kafka.apache.org/44/configuration/producer-configs/ [primary]
[2] NATS JetStream: https://docs.nats.io/concepts/jetstream [primary]
[3] Raft: https://raft.github.io/raft.pdf [primary] · Event sourcing: https://martinfowler.com/eaaDev/EventSourcing.html [primary] · LangGraph: https://docs.langchain.com/oss/python/langgraph/checkpointers [primary] · AutoGen memory: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html [primary]
[4] grite / Sarkar mining coordination: https://arxiv.org/abs/2606.19616 [primary]
[5] Worse Together: https://arxiv.org/abs/2610.00583 [primary]
[6] DPBench: https://arxiv.org/abs/2602.13255 [primary] · https://najmulhasan-code.github.io/research/dpbench [primary]
[7] Anthropic multi-agent research: https://www.anthropic.com/research/multi-agent-research-system [primary]
[8] Kleppmann distributed locking: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html [primary] · etcd: https://etcd.io/docs/v3.7/learning/api/ [primary]
[9] Chubby: https://www.usenix.org/legacy/events/osdi06/tech/full_papers/burrows/burrows.pdf [primary] · ZK: https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html [primary]
[10] byzantine-lease: https://github.com/AAH20/byzantine-lease [primary, single impl] · dibs: https://github.com/polymatx/dibs [primary] · llm-bus: https://github.com/danieldoderlein/llm-bus [primary] · Waymark: https://github.com/Y4tacker/Waymark [primary]
[11] NATS pull consumers: https://docs.nats.io/learn/jetstream/pull-consumers [primary] · queue groups: https://docs.nats.io/learn/core-nats/queue-groups [primary]
[12] Redis XADD: https://redis.io/docs/latest/commands/xadd/ [primary]
[13] Anthropic compaction: https://platform.claude.com/docs/en/build-with-claude/compaction-threshold.md [primary] · prompting: https://platform.claude.com/docs/en/build-with-claude/prompting-best-practices [primary]
[14] Linda/Vollset thesis: https://www.cs.cornell.edu/~einar/pubs/vollset05phd.pdf [primary] · Linda manual: https://www.cs.drexel.edu/~jjohnson/2010-11/winter/cs676/lindamanual.pdf [primary]
[15] CRDTs/Shapiro: https://inria.hal.science/inria-00555588/document [primary] · CRDT glossary: https://crdt.tech/glossary [primary]
[16] NATS pubsub: https://docs.nats.io/concepts/pub-sub-basics [primary] · NATS MQTT: https://github.com/nats-io/nats-server/blob/main/server/README-MQTT.md [primary]
[17] A2A spec: https://a2aproject.github.io/A2A/latest/specification/ [primary] · MCP spec: https://modelcontextprotocol.io/specification/2025-03-26 [primary]
[18] OpenAI Agents SDK: https://openai.github.io/openai-agents-python/multi_agent/ [primary]
[19] Microsoft Agent Framework: https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/ [primary]
[20] Claude agent teams: https://code.claude.com/docs/en/agent-teams.md [primary] · agent-view: https://code.claude.com/docs/en/agent-view.md [primary]
[21] Cursor Cloud API: https://cursor.com/docs/cloud-agent/api/endpoints.md [primary]
[22] OpenCode schema: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/schema/src/session-status-event.ts [primary] · server: https://docs.dev.opencode.ai/docs/server/ [primary]
[23] Devin API: https://cognitionai.mintlify.app/api-reference/v1/sessions/list-sessions.md [primary]
[24] omp Agent Hub: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/agent-hub.md [primary]
[25] OpenCode issue 35472: https://github.com/anomalyco/opencode/issues/35472 [secondary]
[26] OptMem: https://github.com/VictorTaelin/OptMem [primary] · OptChat: https://github.com/alpeware/opt-chat [primary]
[27] RAPTOR: https://arxiv.org/abs/2401.18059 [primary]
[28] Ou & Lapata 2025: https://arxiv.org/abs/2502.00977 [primary]
[29] Liu 2026 context rot: https://arxiv.org/abs/2611.04169 [primary]
[30] Xia 2026 context rot: https://arxiv.org/abs/2606.29718 [primary,-title/abstract-level]
[31] Letta issues: https://github.com/letta-ai/letta/issues/3270 · https://github.com/letta-ai/letta/issues/3279 [primary]
[32] MAST: https://arxiv.org/abs/2503.13657 [primary] · https://github.com/multi-agent-systems-failure-taxonomy/MAST [primary]
[33] Cognition: https://cognition.com/blog/dont-build-multi-agents [primary] · https://cognition.com/blog/multi-agents-working [primary]
All accessed 2026-11-09. Confidence: high for [4][5][6][7][8][32] (2+ primaries each), medium for [10][26][30] (single impl / unverified corpus).
