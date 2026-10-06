# F10 Failure Modes and Costs of Multi-Agent LLM Systems

## Angle
Hunt counter-evidence: measured costs, failure modes, negative results for multi-agent LLM
systems. When does communication hurt? When does multi-agent underperform single-agent?
Coordination overhead numbers, context dilution, cost blowup, redundant work, error
compounding, conformity/sycophancy/loafing, runaway loops, postmortems. Counter-evidence
first; pro-communication numbers included to avoid one-sidedness.

Fetch date for all items: 2026-10-06. Numbers marked UNVERIFIED were reported by a worker but
could not be confirmed from the primary source when re-read here.

## Claims

### Measured token / cost overhead

- Multi-agent systems use ~15× more tokens than chat interactions; single agents use ~4× | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | Anthropic first-party engineering blog, 2025-06-13. Verbatim: "agents typically use about 4× more tokens than chat interactions, and multi-agent systems use about 15× more tokens than chats"
- Token usage alone explains 80% of performance variance in BrowseComp; token count + tool calls + model choice explain 95% | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | Multi-agent works largely because it spends more tokens
- Multi-agent coordination overhead relative to single-agent: independent 58%, centralized 285%, decentralized 263%, hybrid 515% — "representing 1.6–6.2"× | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary | Verified verbatim in v1 HTML. Google Research + MIT, 260 configurations, 6 benchmarks, 3 LLM families
- AgentPrune: comparable results to SOTA topologies at $5.6 vs $43.7 cost (≈7.8× cheaper); 28.1%–72.8% token reduction when plugged into existing MAS | https://arxiv.org/abs/2410.02506 | 2026-10-06 | primary | "Cut the Crap", ICLR 2025
- G-Designer: task-aware topology cuts token consumption by up to 95.33% on HumanEval (MMLU 84.50%, HumanEval pass@1 89.90%) | https://arxiv.org/abs/2410.11782 | 2026-10-06 | primary | learned communication graphs
- Optima: trained MAS achieves up to 2.8× performance gain using <10% tokens on heavy-information-exchange tasks | https://arxiv.org/abs/2410.08115 | 2026-10-06 | primary | requires training (SFT/DPO), not prompting
- AgentDiet: useless/redundant/expired information is widespread in agent trajectories; removing it cuts input tokens 39.9%–59.7% and total computational cost 21.1%–35.9% with no performance loss | https://arxiv.org/abs/2509.23586 | 2026-10-06 | primary | implemented on a top coding agent, 2 LLMs × 2 benchmarks
- Synchronisation under naive broadcast scales O(n × S × |D|); a MESI-style lazy-invalidation protocol reduces it to O((n+W)×|D|), with modelled token savings 84.2%–95.0% across workload configurations | https://arxiv.org/abs/2603.15183 | 2026-10-06 | primary | single-author preprint; simulation + TLA+ proof, NOT a deployed measurement
- Homogeneous debate consumes 2.1–3.4× more tokens than isolated self-correction for equal or lower accuracy (up to 28,631 tokens per problem) | https://arxiv.org/abs/2605.00914 | 2026-10-06 | primary | N=10 agents, R=3 rounds, GSM-Hard + MMLU-Hard
- Cost of maintaining shared state can rival model cost: survey reports inference cost linear in agent count while coordination cost is quadratic in fully connected topologies ($0.50–$2.00 per daily decision for a 7-agent system) | https://arxiv.org/abs/2603.27539 | 2026-10-06 | primary | survey; figures are from the survey's own synthesis — see Gaps
- Coordination tax reported at 30–40% of total token spend in a CrewAI-style group chat | https://cloudatler.com/blog/swarm-economics-when-is-a-multi-agent-system-too-expensive- | 2026-10-06 | secondary | practitioner analysis, no methodology shown
- Context re-injection was the biggest cost surprise in a 90-day production multi-agent deployment; RAG-style retrieval cut cost 40%; context duplication caused ~35% coordination overhead, reduced to ~15% with progressive compaction; one Agent Improvement Loop incident cost $287 | https://github.com/anthropics/anthropic-sdk-python/discussions/1433 | 2026-10-06 | secondary | practitioner field report (5 agents, 24/7, 90+ days); unrefereed
- A 3-agent workflow costing $5–$50 in demo can generate $18,000–$90,000/month at production scale | https://agentmarketcap.ai/blog/2026/04/23/multi-agent-token-economics-cost-multiplication | 2026-10-06 | secondary | practitioner projection
- Gartner forecast: 40% of agentic AI projects cancelled by end-2027 due to escalating costs, unclear value, or inadequate risk controls | https://www.splunk.com/en_us/blog/artificial-intelligence/multi-agent-coordination-strategies.html | 2026-10-06 | secondary | forecast cited in a vendor blog; original Gartner note not read

### Measured failure rates and error propagation

- Independent multi-agent systems amplify errors by 17.2×; centralized systems contain amplification to 4.4× | https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/ | 2026-10-06 | primary | Google Research blog, 2026-01-28, reporting arXiv 2512.08296; orchestrator acts as a "validation bottleneck"
- Multi-agent mean improvement across all benchmarks is negative (−3.5%) with high variance; sequential planning degrades 39–70% | https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/ | 2026-10-06 | primary | blog states every multi-agent variant degraded 39–70% on PlanCraft; abstract reports −70.0% on sequential planning
- Capability saturation: coordination yields diminishing returns once single-agent baselines exceed a certain performance; tool-heavy tasks incur multi-agent overhead | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary | abstract verbatim
- MAST: 14 failure modes in 3 categories; failure distribution FC1 specification 41.77% / FC2 inter-agent misalignment 36.94% / FC3 task verification 21.30% (v2 HTML) | https://arxiv.org/abs/2503.13657 | 2026-10-06 | primary | 150+ traces, 6 expert annotators, κ = 0.88; v1 reports 44.2/32.3/23.5
- MAST top fine-grained modes (v2): fail to ask for clarification 11.65%, reasoning-action mismatch 13.98%, task derailment 7.15%, premature termination 7.82%, no/incomplete verification 6.82%, incorrect verification 6.66%, conversation reset 2.33%, information withholding 1.66%, ignored other agent's input 0.17% | https://arxiv.org/abs/2503.13657 | 2026-10-06 | primary | extracted from v2 HTML
- ChatDev correctness can be as low as 25%; prompt/orchestration interventions improve task completion by only ~14% and "remain insufficiently low for real-world deployment" | https://arxiv.org/abs/2503.13657 | 2026-10-06 | primary | v1 verbatim; v2 adds "75% failure for ChatDev on ProgramDev" and "33% correctness on ProgramDev"
- MAST headline "41%–86.7% failure rates across 7 frameworks" | UNVERIFIED — could not be found in abs page, v1, or v2 HTML | 2026-10-06 | speculative | worker-reported; do not cite without the PDF
- Hierarchical topology A→(B↔C) loses 5.5% under faulty agents vs 10.5% (linear) and 23.7% (flat); an Inspector agent recovers up to 96.4% of faulty-agent errors | https://arxiv.org/abs/2408.00989 | 2026-10-06 | primary | abstract verbatim
- Multi-agent LLMs achieve only 30.1% accuracy under distributed information vs 80.7% for a single agent with complete information; failures worsen as groups scale | https://arxiv.org/abs/2505.11556 | 2026-10-06 | primary | HiddenBench, 65 tasks, 15 frontier LLMs; lightweight structured protocol substantially improves it
- Teams consistently fail to match their best member, with losses up to 41.1% on ML benchmarks even when told who the expert is | https://arxiv.org/abs/2602.01011 | 2026-10-06 | primary | bottleneck is expert leveraging; integrative compromise grows with team size
- Minor inaccuracies solidify into system-level false consensus; one atomic error seed can cause widespread failure across 6 frameworks | https://arxiv.org/abs/2603.04474 | 2026-10-06 | primary | genealogy-graph governance layer prevents final infection in ≥89% of runs
- Collective hallucination is self-sustaining on scale-free topologies: amplification factor 1.45, reproduction number 1.21 (R0 > 1) | https://arxiv.org/abs/2606.07941 | 2026-10-06 | primary | 1,317 queries, 6 agents, 5 rounds; defense reduces R0 to 0.81
- Deeper agent cascades reduce hallucination score (0.422→0.272) but factual accuracy also declines (0.789→0.769) — net attenuation of hallucination but a trade-off against factual preservation | https://arxiv.org/abs/2606.07937 | 2026-10-06 | primary | 500 cascades, 10 domains, 1,250 evaluated responses
- Closed-system debate preserves answer accuracy while destroying reasoning faithfulness: majority-vote MAD reduces Supported Faithfulness Score to 1.7% of baseline (p < 10⁻⁶, d = −0.96) | https://arxiv.org/abs/2605.01704 | 2026-10-06 | primary | SciFact + FEVER; Data Processing Inequality bound
- Single-agent LLMs match or outperform multi-agent systems on multi-hop reasoning under equal thinking-token budgets | https://arxiv.org/abs/2604.02460 | 2026-10-06 | primary | also identifies API budget-control and benchmark artifacts that inflate reported MAS gains
- Group conformity: modal adoption up to 85.5%; contextual-fragility vulnerability up to 70.0%; consensus-collapse oracle gap up to 32.3pp | https://arxiv.org/abs/2605.00914 | 2026-10-06 | primary | homogeneous 7–8B teams
- Strict conformity is 29% of answer flips (MMLU-Pro); 57–77% of conformity events are correct-to-wrong; vacuous reasoning still causes 20–39% error adoption | https://arxiv.org/abs/2606.00820 | 2026-10-06 | primary | harmful conformity predictable from Round-0 features (AUC = 0.79)
- Debate can decrease accuracy: reported Mistral-7B CommonSenseQA 44.4%→39.4% (−5.0pp) and LLaMA-3.1-8B MMLU 61.6%→57.8% (−3.8pp) after debate | https://arxiv.org/abs/2509.05396 | 2026-10-06 | primary | abstract confirms direction and mechanism (sycophancy/conformity); the exact pp figures come from the v1 HTML, not re-verified here — treat magnitudes as provisional
- First-speaker bias: strong-agent influence 21.01pp greater when speaking first; placing a strong agent last cut accuracy 68.78%→66.43% (−2.34pp) | https://arxiv.org/abs/2609.38964 | 2026-10-06 | primary | abstract confirms the bias; exact pp figures from v1 HTML, not re-verified here

### Context dilution / degradation

- Context rot: all 18 tested models (GPT-4.1, Claude 4, Gemini 2.5, Qwen3, …) degrade as input length grows, even on simple tasks; 194,480 total LLM calls | https://research.trychroma.com/context-rot | 2026-10-06 | primary | Chroma technical report, 2025-07-14. Verified: 18 models, 194,480 calls
- Logically coherent haystacks performed WORSE than shuffled ones across models — structured context made the needle harder to find | https://research.trychroma.com/context-rot | 2026-10-06 | primary | verified verbatim ("shuffled haystacks than on logically structured ones"); inverts the "tidy your context" instinct
- Chroma "accuracy drops 30+ percentage points in positions 5–15 of 20 documents" and "7.9% average loss from length alone with distractors masked" | UNVERIFIED — not present in the report text re-read here | 2026-10-06 | speculative | the report contains only 0.035/2.55/2.89/33/4.21/50/60.29/72.4/99% as percentage figures
- Lost in the Middle: performance is highest when relevant information is at the start or end of the context and degrades significantly in the middle, even for explicitly long-context models | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | TACL; the report's own abstract states no specific pp figure
- Sheer input length hurts even with perfect retrieval: performance degrades 13.9%–85% as input length increases, including when irrelevant tokens are masked and when all relevant evidence is placed immediately before the question | https://arxiv.org/abs/2510.05381 | 2026-10-06 | primary | 5 open/closed LLMs, math/QA/coding
- Same Task, More Tokens: reasoning performance degrades at much shorter input lengths than a model's technical maximum; degradation appears in every dataset version | https://arxiv.org/abs/2402.14848 | 2026-10-06 | primary | isolation via padding of different lengths/types/locations
- NoLiMa: at 32K tokens 11 of 13 tested models drop below 50% of their short-context baseline; GPT-4o falls 99.3%→69.7% | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | abstract says 11 models at 32K; worker text said 10 of 12 — abstract wins

### Coordination / architecture failures (first-party engineering)

- Anthropic: multi-agent systems are a poor fit for "domains that require all agents to share the same context or involve many dependencies between agents"; most coding tasks have fewer truly parallelizable tasks than research | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | direct quote
- Anthropic: "LLM agents are not yet great at coordinating and delegating to other agents in real time" | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Anthropic early failure modes: spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, "distracting each other with excessive updates" | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Anthropic redundant-work example: one subagent explored the 2021 automotive chip crisis while 2 others duplicated work on 2025 supply chains | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | caused by vague task descriptions
- Anthropic: synchronous execution creates bottlenecks — the lead agent can't steer subagents, subagents can't coordinate, and the whole system can block on one subagent | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Anthropic: agents are stateful and errors compound; "one step failing can cause agents to explore entirely different trajectories"; "the gap between prototype and production is often wider than anticipated" | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Cognition: "running multiple agents in collaboration only results in fragile systems" — decision-making too dispersed, context not shared thoroughly enough; agents today "are not quite able to engage in this style of long-context proactive discourse with much more reliability than you would get with a single agent" | https://cognition.com/blog/dont-build-multi-agents | 2026-10-06 | primary | Walden Yan, 2025-06-12; principles: share context, actions carry implicit decisions
- Cognition follow-up (2026-04-22): multi-agent works only in a narrower class — "writes stay single-threaded and the additional agents contribute intelligence rather than actions"; unstructured swarms are "mostly a distraction" | https://cognition.com/blog/multi-agents-working | 2026-10-06 | primary | verified; map-reduce-and-manage is the practical shape; open problems are all communication problems
- Cognition follow-up: Devin Review catches an average of 2 bugs per PR, ~58% severe; works BEST when coding and review agents share NO context beforehand (clean context → more attention capacity) | https://cognition.com/blog/multi-agents-working | 2026-10-06 | primary | direct counter to "share more context" — the reviewer must NOT inherit the writer's context
- Cognition follow-up: cross-agent communication "doesn't happen by default, because models haven't been trained in environments where it needed to" | https://cognition.com/blog/multi-agents-working | 2026-10-06 | primary | dedicated work required to make sub-agent→manager messaging function
- LangChain: agent abstractions "end up making it really really hard to understand or control exactly what is going into the LLM at all steps"; "the hard part of building reliable agentic systems is making sure the LLM has the appropriate context at each step" | https://www.langchain.com/blog/how-to-think-about-agent-frameworks | 2026-10-06 | primary | Harrison Chase, 2025-04-20; most production agentic systems are a combination of workflows and agents
- LangChain survey: the #1 limitation reported by agent builders for putting more agents into production was "performance quality", not cost | https://www.langchain.com/blog/how-to-think-about-agent-frameworks | 2026-10-06 | primary

### Runaway loops / cost-exhaustion postmortems

- IAL-Scan: 68 confirmed infinite agentic loop failures across 47 projects (91.9% precision) out of 6,549 LLM-agent repositories scanned | https://arxiv.org/abs/2607.01641 | 2026-10-06 | primary | "When Agents Do Not Stop"; IALs cause cost exhaustion, model DoS, context growth, repeated external side effects
- IAL dominant patterns: retry feedback without bounds 25.0%, tool-call iteration without bounds 23.5%, multi-agent chat without turn bounds 20.6% | https://arxiv.org/abs/2607.01641 | 2026-10-06 | primary | worker-reported breakdown; abstract confirms the three pattern classes and the 68/47/91.9% figures
- Agents of Chaos: 2-week live red-team of agents with persistent memory, email, Discord, filesystems, and shell; 11 case studies including destructive system-level actions, DoS, uncontrolled resource consumption, identity spoofing, cross-agent propagation of unsafe practices, partial system takeover, and agents reporting task completion while system state contradicted it | https://arxiv.org/abs/2602.20021 | 2026-10-06 | primary | abstract verbatim; note abstract says eleven case studies (worker said ten vulnerabilities)
- Gartner-cited: 95.6% of confirmed infinite loop failures caused API cost exhaustion | https://arxiv.org/html/2607.01641v1 | 2026-10-06 | primary | worker-reported; the abs page does not state 95.6% — treat as provisional

### Pro-communication numbers (counter-counter-evidence)

- Anthropic: multi-agent Opus 4 lead + Sonnet 4 subagents outperformed single-agent Opus 4 by 90.2% on their internal research eval | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | breadth-first research with independent directions
- Anthropic: parallelisation (3–5 subagents, 3+ parallel tools each) cut research time by up to 90% for complex queries | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | latency benefit
- Anthropic: routing subagent output to a filesystem minimises the "game of telephone" and reduces token overhead from copying large outputs through conversation history | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary | directly relevant: artifact-passing instead of chat-passing
- Anthropic: a tool-testing agent that rewrote a flawed MCP tool description produced a 40% decrease in task completion time for future agents | https://www.anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Google: centralized coordination improved parallelizable financial reasoning by 80.9% over a single agent; predictive model identifies the best architecture for 87% of held-out configurations | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary
- HiddenBench: a lightweight structured communication protocol substantially improves collective reasoning across model families | https://arxiv.org/abs/2505.11556 | 2026-10-06 | primary | the bottleneck is actionable
- MultiAgentBench: graph structure performs best among coordination protocols; cognitive planning improves milestone achievement by 3% | https://arxiv.org/abs/2503.01935 | 2026-10-06 | primary
- Instructing agents not to withhold dissent increases the gain from discussion | https://arxiv.org/abs/2609.38324 | 2026-10-06 | primary

## Searches
- multi-agent LLM coordination overhead token cost negative result single agent outperforms
- multi-agent debate failure when communication hurts coordination breakdown
- LLM multi-agent communication topology chain star tree graph comparison overhead
- context dilution multi-agent LLM
- multi-agent LLM token cost measurement overhead quantification
- multi-agent system postmortem failure analysis LLM agents production
- Anthropic multi-agent research system token usage 15x engineering blog
- Cognition Walden Yan "Don't Build Multi-Agents"; "Multi-Agents: What's Actually Working"
- LangChain "How to think about agent frameworks" Harrison Chase
- OpenAI multi-agent engineering blog post orchestration patterns
- Google multi-agent engineering blog "Towards a science of scaling agent systems"
- Chroma "context rot" 18 models performance degradation
- "Talk Isn't Always Cheap" multi-agent debate 2509.05396
- "Stop Overvaluing Multi-Agent Debate" 2502.08788
- "Single-agent or Multi-agent Systems" 2505.18286
- "Multi-Agent Teams Hold Experts Back" 2602.01011
- "The Cost of Consensus" 2605.00914
- "When Agents Do Not Stop" infinite loops 2607.01641
- "Agents of Chaos" 2602.20021
- "Collective Hallucination" 2606.07941; "Hallucination Cascade" 2606.07937
- "Context Length Alone Hurts LLM Performance" 2510.05381
- "Lost in the Middle" 2307.03172; "Same Task, More Tokens" 2402.14848; NoLiMa 2502.05167
- "Token Coherence" MESI synchronization 2603.15183
- HiddenBench "Systematic Failures in Collective Reasoning" 2505.11556
- GitHub issues / HN / Reddit practitioner reports on multi-agent runaway loops cost spikes deadlocks

## Conflicting evidence
- Anthropic reports +90.2% from multi-agent on research, while Google reports −3.5% mean improvement across all benchmarks. Resolution: task structure — Anthropic tested breadth-first research (highly parallelizable); Google tested mixed tasks including sequential planning (multi-agent degraded 39–70%).
- Anthropic says ~15× tokens; Google says 1.6–6.2× overhead. Resolution: different denominators — Anthropic measures total token spend including all subagent contexts vs chat; Google measures overhead relative to single-agent at matched performance.
- Cognition (2025) says "don't build multi-agent"; Cognition (2026) says a narrower class works when writes stay single-threaded. Resolution: the follow-up narrows rather than reverses the claim — intelligence-contributing agents OK, parallel writers not.
- Cognition's 2026 finding that the review agent works BEST with a clean context contradicts Anthropic's "share as much context as possible" principle. Resolution: [INFERENCE] the two apply to different roles — verifiers benefit from independence; collaborating writers benefit from shared context.
- Talk Isn't Always Cheap shows debate harms accuracy; Du et al. (2305.14325) and Liang et al. (2305.19118) show debate helps. Resolution: [INFERENCE] homogeneous unguided debate harms; heterogeneous or structured debate can help (2502.08788 calls model heterogeneity a "universal antidote").
- Conformity can be calibrated to help (2505.21588) while unguided debate consistently harms (2605.00914). Resolution: structured/calibrated vs unstructured.
- Chroma reports coherent haystacks perform WORSE than shuffled ones; the intuitive expectation is the opposite. Recorded as a conflict, not smoothed.
- Worker-reported Chroma figures (30+ pp middle-position drop; 7.9% length-alone loss) are absent from the report text re-read here; the report's actual percentage set is 0.035/2.55/2.89/33/4.21/50/60.29/72.4/99%.

## Strongest evidence against the build thesis

1. **A persistent room's core premise (accumulate shared context) is exactly what degrades
   model performance.** Chroma's Context Rot tested 18 models over 194,480 calls: performance
   falls as input length grows even on trivial tasks, and — counterintuitively — a logically
   coherent haystack performed WORSE than a shuffled one. Independent work (2510.05381) shows
   13.9%–85% degradation from length alone *with perfect retrieval and distractors masked*.
   A room that persists grows monotonically; every agent reading it pays a measured,
   model-independent tax. "Bounded context" is not a refinement of the design — it is the
   only thing standing between the room and this result. Source:
   https://research.trychroma.com/context-rot ; https://arxiv.org/abs/2510.05381

2. **Unstructured peer exchange measurably makes agents worse, and costs more.** The Cost of
   Consensus (2605.00914) found homogeneous debate yields modal adoption up to 85.5%,
   contextual fragility up to 70.0%, a consensus-collapse oracle gap up to 32.3pp, and
   consumes 2.1–3.4× more tokens than isolated self-correction for equal or lower accuracy.
   Stop Overvaluing MAD (2502.08788) found 5 MAD methods across 9 benchmarks and 4 models
   "often fail to outperform simple single-agent baselines" at significantly higher compute.
   A free-form chat room with turn bounds removed is structurally the same regime. Sources:
   https://arxiv.org/abs/2605.00914 ; https://arxiv.org/abs/2502.08788

3. **Coordinated multi-agent systems amplify errors, and the only measured fix is a central
   validation bottleneck.** Google/MIT measured independent multi-agent error amplification
   at 17.2× and centralized at 4.4× (2512.08296) — even the *best* architecture still
   amplifies. From Spark to Fire (2603.04474) shows one atomic error seed causing widespread
   failure across six frameworks, and requires a governance layer to suppress it. A chat room
   is an independent-agent topology by default: no single writer, no validation bottleneck.
   Sources: https://arxiv.org/abs/2512.08296 ; https://arxiv.org/abs/2603.04474

4. **Sharing more context is not free and is not even always right.** Cognition's 2026
   production finding is that their generator–verifier loop works *best* when the review
   agent starts with a completely clean context, because a shorter context makes the model
   smarter ("the math of attention"). That directly undercuts a shared-room design where every
   agent reads the same accumulating transcript, and it means the room would have to support
   deliberate context *separation* to match what already works. Source:
   https://cognition.com/blog/multi-agents-working

5. **Unbounded multi-agent chat is a documented runaway-loop generator, and the failure mode
   is cost exhaustion.** IAL-Scan (2607.01641) statically confirmed 68 infinite agentic loop
   failures across 47 real projects, with "multi-agent chat without turn bounds" one of the
   three dominant patterns. Agents of Chaos (2602.20021) documents, in a live two-week
   deployment with persistent memory and chat, uncontrolled resource consumption, DoS
   conditions, destructive system actions, and cross-agent propagation of unsafe practices —
   and agents reporting success while the system state contradicted them. A persistent room
   is precisely the substrate these failures were observed on. Sources:
   https://arxiv.org/abs/2607.01641 ; https://arxiv.org/abs/2602.20021

## Gaps
- No primary study measures coordination overhead for a persistent chat room with claim board
  and blackboard specifically. Every number here is from task-scoped multi-agent pipelines,
  single-agent long-context degradation, or engineering writeups. The room's topology
  (broadcast + shared board) is unstudied.
- No study measures the cost of maintaining shared state (claim board, blackboard) across
  sessions, nor the cost of context re-injection per turn in a persistent room.
- No study measures protocol stability across agent turnover (joiners/leavers) — directly
  relevant to the brief's "future joiners" requirement.
- No primary study directly compares a shared blackboard/claim board vs free-form chat between
  LLM agents.
- Chroma worker numbers UNVERIFIED: "30+ pp drop in positions 5–15 of 20 documents" and "7.9%
  average loss from length alone with distractors masked" do not appear in the report text
  re-read here. Only 0.035/2.55/2.89/33/4.21/50/60.29/72.4/99% appear.
- MAST worker number UNVERIFIED: "41%–86.7% failure rates across 7 frameworks" is absent from
  the abs page, v1, and v2 HTML. v1/v2 give ChatDev correctness as low as 25% (v1) and 75%
  failure on ProgramDev (v2). Do not cite 41–86.7% without the PDF.
- Talk Isn't Always Cheap exact pp deltas (−5.0pp, −3.8pp) and When Order Matters pp figures
  (21.01pp, −2.34pp) are from v1 HTML, not re-verified here; direction is confirmed by the
  abstracts.
- IAL-Scan "95.6% caused API cost exhaustion" and the per-pattern percentages are worker-
  reported; the abs page confirms only the three pattern classes and the 68/47/91.9% figures.
- Agents of Chaos: abstract says "eleven representative case studies"; worker said "ten
  vulnerabilities". Abstract wins.
- Cost figures from the financial-MAS survey (2603.27539) — "quadratic coordination cost",
  "$0.50–$2.00 per daily decision for a 7-agent system" — are the survey's own synthesis, not
  a controlled measurement; the survey itself states the field lacks the evaluation
  infrastructure to validate its own Coordination Primacy Hypothesis.
- Secondary practitioner numbers (30–40% coordination tax, 3–5× overhead, $18k–$90k/month,
  40% project cancellation) are unrefereed and rest on vendor blogs and forum posts; no
  methodology was shown.
- No longitudinal study of multi-agent degradation over weeks/months of continuous operation.
- Social loafing in multi-agent LLM systems is thin: the Bystander Effect paper (2605.10698)
  is the only direct measurement found; broader social-loafing literature is human-group only.
- The Cognition 2026 blog is first-party but unreviewed; its Devin Review bug counts (2
  bugs/PR, 58% severe) have no published methodology.
