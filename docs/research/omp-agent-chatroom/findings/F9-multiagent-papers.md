# F9 Multi-Agent LLM Papers: Pro- and Anti-Communication Evidence

## Angle
Survey of multi-agent LLM papers (2023–2026) to find evidence for and against building a
persistent group-chat room between agents. Pro-communication papers show multi-agent
outperforms single-agent; anti-communication papers show multi-agent underperforms, incurs
coordination overhead, or actively hurts. Also covers emergent-communication literature
(message efficiency, degenerate protocols, compositionality failures) and protocol-design /
coordination-overhead theory (FIPA-ACL, KQML, contract net, speech acts, communication
complexity). Counter-evidence hunted first and hardest.

All arXiv IDs below were verified by reading the abs page (https://arxiv.org/abs/<id>) on
2026-10-06 unless marked otherwise. Where a worker-reported number differs from the abs-page
abstract, the abstract wins; discrepancies recorded under Conflicting evidence.

## Claims

### Anti-communication / failure evidence

- Multi-agent debate (MAD) often fails to outperform simple single-agent baselines (Chain-of-Thought, Self-Consistency) even when consuming significantly more inference-time computation | https://arxiv.org/abs/2502.08788 | 2026-10-06 | primary | "Stop Overvaluing Multi-Agent Debate"; systematic eval of 5 MAD methods × 9 benchmarks × 4 models; model heterogeneity is the "universal antidote"
- Debate can decrease accuracy over time; models shift from correct to incorrect answers in response to peer reasoning, favouring agreement over challenging flawed reasoning | https://arxiv.org/abs/2509.05396 | 2026-10-06 | primary | "Talk Isn't Always Cheap"; harmful shifts attributed to sycophancy and social conformity; harm even when stronger models outnumber weaker
- Single-agent LLM with strong prompts achieves almost the same performance as the best multi-agent discussion on a wide range of reasoning tasks | https://arxiv.org/abs/2402.18272 | 2026-10-06 | primary | "Rethinking the Bounds of LLM Reasoning"; MAD better than single agent only when the prompt has no demonstration
- Homogeneous teams without structured roles do not benefit from unguided peer exchange; isolated self-correction gives a more favourable cost-accuracy tradeoff | https://arxiv.org/abs/2605.00914 | 2026-10-06 | primary | "The Cost of Consensus"; N=10 homogeneous agents (Qwen2.5-7B, Llama-3.1-8B, Ministral-3-8B), R=3 rounds, GSM-Hard + MMLU-Hard; modal adoption up to 85.5%, contextual-fragility vulnerability up to 70.0%, oracle gap up to 32.3pp; debate consumes 2.1–3.4× more tokens (up to 28,631 tokens/problem)
- Sycophancy is a core failure mode in multi-agent debating systems: amplifies disagreement collapse before a correct conclusion, yields lower accuracy than single-agent baselines | https://arxiv.org/abs/2509.23055 | 2026-10-06 | primary | "Peacemaker or Troublemaker"; first operational framework for inter-agent sycophancy; distinct debater-driven and judge-driven failure modes
- Sequential MAD suffers a pronounced first-speaker bias: agents disproportionately shape the final answer when they speak first, offsetting a stronger model's reasoning advantage | https://arxiv.org/abs/2609.38964 | 2026-10-06 | primary | "When Order Matters"; low-agreeableness prompting on the strong agent helps restore influence; note arXiv ID is dated 2026-09-30
- Group conformity in LLM MAS mirrors human behaviour: initially neutral agents align with numerically dominant groups or more intelligent agents | https://arxiv.org/abs/2506.01332 | 2026-10-06 | primary | >2,500 simulated debates, 5 contentious topics
- Identity drives conformity independent of correctness: in-group consensus increases conformity to incorrect answers, out-group consensus decreases it; a correct ally from the opposing group intensifies the effect | https://arxiv.org/abs/2609.33495 | 2026-10-06 | primary | 12 open-weights models, 9 tasks; Chain-of-Thought suppresses most effects but not all
- Strict conformity is 29% of observed answer flips in MMLU-Pro, and 57–77% of conformity events are correct-to-wrong | https://arxiv.org/abs/2606.00820 | 2026-10-06 | primary | "Not All Flips Are Conformity"; 37% of flips occur under self-reflection alone; vacuous reasoning still causes 20–39% error adoption
- Multi-agent LLM teams consistently fail to match their best individual member, incurring losses up to 41.1% on ML benchmarks, even when told who the expert is | https://arxiv.org/abs/2602.01011 | 2026-10-06 | primary | "Multi-Agent Teams Hold Experts Back"; bottleneck is expert leveraging, not identification; integrative compromise increases with team size and correlates negatively with performance
- Multi-agent LLMs achieve only 30.1% accuracy under distributed information vs 80.7% for a single agent given complete information; failures worsen as groups scale | https://arxiv.org/abs/2505.11556 | 2026-10-06 | primary | HiddenBench, 65 tasks, 15 frontier LLMs; agents cannot reason about latent information asymmetry
- Deep multi-agent interaction amplifies errors: minor inaccuracies solidify into system-level false consensus through message dependencies; a single atomic error seed can cause widespread failure | https://arxiv.org/abs/2603.04474 | 2026-10-06 | primary | "From Spark to Fire"; 6 mainstream frameworks; three vulnerability classes (cascade amplification, topological sensitivity, consensus inertia)
- Collective hallucination can self-sustain: scale-free topologies show amplification factor 1.45 and reproduction number 1.21 (R0 > 1) | https://arxiv.org/abs/2606.07941 | 2026-10-06 | primary | 1,317 TruthfulQA/TriviaQA queries, six-agent system, five recursive rounds
- Closed-system multi-agent debate preserves answer accuracy while degrading the reasoning behind the answers; copies of the same model produce diverse phrasings of one perspective | https://arxiv.org/abs/2605.01704 | 2026-10-06 | primary | "The Reasoning Trap"; Data Processing Inequality bound; majority-vote MAD reduces Supported Faithfulness Score to 1.7% of baseline
- Single-agent LLMs match or outperform multi-agent systems on multi-hop reasoning under equal thinking-token budgets | https://arxiv.org/abs/2604.02460 | 2026-10-06 | primary | Data Processing Inequality argument + controlled study across Qwen3, DeepSeek-R1-Distill-Llama, Gemini 2.5; identifies API budget-control and benchmark artifacts that inflate MAS gains
- Unanimity never certifies correctness: semantic agreement correlates with factual convergence but never enough for unanimity to certify correctness; hallucination-minimising temperature depends on coupling topology | https://arxiv.org/abs/2609.39211 | 2026-10-06 | primary | RHEON; 432 configurations; Eraclitus-4.7M corpus of 4.7M responses
- Discussion gains shrink as agents withhold dissent; instructing agents not to withhold increases the gain | https://arxiv.org/abs/2609.38324 | 2026-10-06 | primary | critical withholding rate c* = γ/(γ+a); HiddenBench + MedEInst
- LLM groups follow majorities more often, surface less unique information, and converge earlier than human groups; correct minority signals succeed mainly when re-expressed early | https://arxiv.org/abs/2609.13261 | 2026-10-06 | primary | "From Process Loss to Assembly Bonus"; LLM groups reproduce some outcome patterns of human deliberation but diverge in mechanism
- Multi-agent systems have 14 distinct failure modes in 3 categories; the taxonomy's own interventions improve task completion by only ~14% and "remain insufficiently low for real-world deployment" | https://arxiv.org/abs/2503.13657 | 2026-10-06 | primary | MAST; 150+ traces, 6 expert annotators, Cohen's κ = 0.88; ChatDev correctness as low as 25% (v1), 75% failure for ChatDev on ProgramDev (v2)
- Inter-agent misalignment is a top-level MAST failure category (v2: FC1 specification 41.77%, FC2 inter-agent misalignment 36.94%, FC3 task verification 21.30%) | https://arxiv.org/abs/2503.13657 | 2026-10-06 | primary | v2 HTML read directly; v1 reports 44.2/32.3/23.5 — see Conflicting evidence
- Hierarchical topology A→(B↔C) is most resilient under faulty agents: 5.5% performance drop vs 10.5% (linear) and 23.7% (flat) | https://arxiv.org/abs/2408.00989 | 2026-10-06 | primary | "On the Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents"; an added Inspector agent recovers up to 96.4% of faulty-agent errors
- Sparse communication topology can achieve comparable or superior performance to all-to-all debate while significantly reducing computational cost | https://arxiv.org/abs/2406.11776 | 2026-10-06 | primary | "Improving Multi-Agent Debate with Sparse Communication Topology"; brute-force all-to-all is wasteful
- Communication can reduce alignment in coordination games and its effect varies by language, personality, and game structure | https://arxiv.org/abs/2508.00032 | 2026-10-06 | primary | "Strategic Communication and Language Bias in Multi-Agent LLM Coordination"; GPT-4o and Llama 4 Maverick; FAIRGAME
- Communication redundancy is formally defined in LLM multi-agent pipelines; AgentPrune matches SOTA topologies at $5.6 vs $43.7 cost and cuts tokens 28.1%–72.8% | https://arxiv.org/abs/2410.02506 | 2026-10-06 | primary | "Cut the Crap"; ICLR 2025
- Task-aware communication topology (G-Designer) cuts token consumption by up to 95.33% on HumanEval (MMLU 84.50%, HumanEval pass@1 89.90%) | https://arxiv.org/abs/2410.11782 | 2026-10-06 | primary | variational graph auto-encoder designs task-adaptive topology
- Prompt+topology design matters critically; MASS-optimised multi-agent systems substantially outperform alternatives | https://arxiv.org/abs/2502.02533 | 2026-10-06 | primary | "Multi-Agent Design"; 3-stage prompt/topology search
- As LLM capabilities improve, the benefits of MAS over single-agent systems diminish; hybrid request cascading improves accuracy 1.1–12% while cutting deployment cost up to 20% | https://arxiv.org/abs/2505.18286 | 2026-10-06 | primary | "Single-agent or Multi-agent Systems? Why Not Both?"; frontier o3 and Gemini-2.5-Pro closing the gap
- Coordination overhead is a measured, per-architecture cost: Google's 260-config study reports relative performance change from +80.8% (decomposable financial reasoning) to −70.0% (sequential planning) vs single-agent | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary | "Towards a Science of Scaling Agent Systems"; capability-saturation effect, tool-heavy overhead, error propagation without centralized verification; R² = 0.373 cross-validated
- Orchestration is only effective if there are performance or cost differentials between agents; otherwise it overestimates performance and underestimates cost | https://arxiv.org/abs/2503.13577 | 2026-10-06 | primary | "When Should We Orchestrate Multiple Agents?"; theoretical + empirical (agent selection, Rogers' Paradox, QA user study)
- LLM teams inherit distributed-systems pathologies (consistency violations, stragglers, scalability limits), making distributed systems a principled foundation for reasoning about them | https://arxiv.org/abs/2603.12229 | 2026-10-06 | primary | "Language Model Teams as Distributed Systems"
- MAPoRL: training individual LLMs alone is insufficient to induce effective collaboration; multi-agent co-training is required | https://arxiv.org/abs/2502.18439 | 2026-10-06 | primary | prompting out-of-the-box LLMs "may not improve LLMs' performance as shown recently"
- AgentBench: poor long-term reasoning, decision-making, and instruction following are the main obstacles for usable LLM agents; OSS LLMs ≤70B lag far behind commercial | https://arxiv.org/abs/2308.03688 | 2026-10-06 | primary | 8 environments, ICLR 2024

### Emergent-communication evidence (message efficiency, degenerate protocols)

- Natural language does NOT emerge "naturally" in multi-agent dialog: agent-invented languages achieve near-perfect task rewards but are decidedly not interpretable or compositional | https://arxiv.org/abs/1706.08502 | 2026-10-06 | primary | Kottur et al., EMNLP 2017; restricts communication to coax human-like structure
- Networks develop an anti-efficient encoding: the most frequent inputs get the LONGEST messages, opposite of Zipf's Law of Abbreviation; the speaker imposes no least-effort pressure toward brevity | https://arxiv.org/abs/1905.12561 | 2026-10-06 | primary | Chaabouni et al., NeurIPS 2019; ZLA appears only when a length penalty is added
- Emergent languages are subject to entropy-minimisation pressure: mutual information between inputs and messages is minimised within the range needed for task success | https://arxiv.org/abs/1905.13687 | 2026-10-06 | primary | Kharitonov et al.; stronger discreteness amplifies this; also increases robustness to overfitting/adversarial attack
- No correlation between compositionality and generalisation in emergent languages | https://arxiv.org/abs/2004.09124 | 2026-10-06 | primary | Chaabouni et al., ACL 2020; compositionality aids transmission, not generalisation
- Non-compositional languages can show equal or better generalisation and acquisition speed than compositional ones, depending on the task | https://arxiv.org/abs/2004.03420 | 2026-10-06 | primary | Kharitonov & Baroni, BlackboxNLP 2020
- Most compositionality metrics fail to detect non-trivial compositionality — they treat it as a failure of compositionality; only tree reconstruction error works | https://arxiv.org/abs/2010.15058 | 2026-10-06 | primary | Korbak et al., NeurIPS 2020
- Increasing vocabulary size is detrimental to compositionality; only increasing maximum sentence length helps | https://arxiv.org/abs/2012.10776 | 2026-10-06 | primary | Denamganaï & Walker; also finds no correlation between training-time compositionality and generalisation for visual stimuli
- Agents establish successful communication via visual representations that align with each other but do NOT capture the conceptual properties of the objects | https://arxiv.org/abs/1808.10696 | 2026-10-06 | primary | Bouchacourt & Baroni, EMNLP 2018
- Apparent communication can be entirely spurious: agents' messages carry information about their subsequent action yet have zero causal impact on the environment or the other agent | https://arxiv.org/abs/1903.05168 | 2026-10-06 | primary | Lowe et al., AAMAS 2019; standard "communication emerged" metrics can be misleading
- Compositionality requires model capacity in a specific range; too high memorises, too low fails catastrophically; no evidence found for the top of the range | https://arxiv.org/abs/1910.11424 | 2026-10-06 | primary | Resnick et al., AAMAS 2020
- Lewis-game objective decomposes into a co-adaptation loss and an information loss; the two overfitting sources undermine structured protocol emergence — controlling co-adaptation overfitting recovers compositionality and generalisation | https://arxiv.org/abs/2209.15342 | 2026-10-06 | primary | Rita et al., NeurIPS 2022
- Self-interested agents cannot effectively use an a priori ungrounded cheap-talk channel; cooperation (prosociality) is necessary for ungrounded language to emerge | https://arxiv.org/abs/1804.03980 | 2026-10-06 | primary | Cao et al., ICLR 2018
- In situated open-ended environments, emergent communication is sparse: agents generate meaningful messages only in states where they cannot succeed without coordination | https://arxiv.org/abs/2408.14649 | 2026-10-06 | primary | Wolff et al. 2024; Multi-Agent Pong and Collectors

### Emergent-communication evidence (pro — communication emerges and can help)

- Two networks learn to coordinate in referential games from scratch, developing their own language out of the need to communicate | https://arxiv.org/abs/1612.07182 | 2026-10-06 | primary | Lazaridou, Peysakhovich, Baroni
- Grounded compositional language emerges in multi-agent populations as streams of abstract discrete symbols with vocabulary and syntax | https://arxiv.org/abs/1703.04908 | 2026-10-06 | primary | Mordatch & Abbeel
- Sequential symbol protocols emerge with compositionality and variability; straight-through Gumbel-softmax converges faster than REINFORCE | https://arxiv.org/abs/1705.11192 | 2026-10-06 | primary | Havrylov & Titov
- RIAL/DIAL enable end-to-end learning of communication protocols under partial observability | https://arxiv.org/abs/1605.06676 | 2026-10-06 | primary | Foerster et al., NeurIPS 2016
- Multi-modal multi-step referential games produce a robust, efficient protocol where gradual information exchange improves predictions | https://arxiv.org/abs/1705.10369 | 2026-10-06 | primary | Evtimova et al., ICLR 2018
- Compositional language can develop from raw pixels given proper environmental pressure | https://arxiv.org/abs/1804.02341 | 2026-10-06 | primary | Choi, Lazaridou, de Freitas, ICLR 2018
- Structured input data affects protocol structure: compositional language is most likely when agents perceive a structured world | https://arxiv.org/abs/1804.03984 | 2026-10-06 | primary | Lazaridou et al., ICLR 2018
- Positive-signalling and positive-listening inductive biases ease learning of communication in temporally extended domains | https://arxiv.org/abs/1912.05676 | 2026-10-06 | primary | Eccles et al., NeurIPS 2019
- Complex language-evolution phenomena (majority-protocol convergence, creole formation, dialect continua) emerge from simple social exchanges | https://arxiv.org/abs/1901.08706 | 2026-10-06 | primary | Graesser, Cho, Kiela, EMNLP 2019
- Communication is proportional to cooperation and can emerge in partially competitive scenarios with standard RL | https://arxiv.org/abs/2101.10276 | 2026-10-06 | primary | Noukhovitch et al., AAMAS 2021
- Communicating about sets of objects (generalizations) greatly improves systematicity and interpretability over single-object reference games | https://arxiv.org/abs/2106.02668 | 2026-10-06 | primary | Mu & Goodman, NeurIPS 2021
- Survey of emergent communication in the deep-learning era (no new empirical results) | https://arxiv.org/abs/2006.02419 | 2026-10-06 | primary | Lazaridou & Baroni

### Protocol-design and coordination-overhead theory

- FIPA-ACL defines 12 message fields (only `performative` mandatory) and 20+ communicative acts (inform, request, propose, cfp, accept-proposal, refuse, agree, cancel, failure, not-understood, …), grounded in speech-act theory | https://www.fipa.org/specs/fipa00061/SC00061G.html (HTTP 403 on fetch; content corroborated via https://arxiv.org/abs/cs/9809034) | 2026-10-06 | primary | FIPA became an IEEE committee in 2005; content languages FIPA-SL, KIF, RDF, CCF; transport IIOP/HTTP — full spec page returned 403, see Gaps
- KQML semantics are grounded in speech-act theory: a formal semantic description associates "cognitive" states of the agent with each performative, and conversation policies are specified as a Definite Clause Grammar | https://arxiv.org/abs/cs/9809034 | 2026-10-06 | primary | Labrou & Finin 1998; predecessor to FIPA-ACL
- Contract Net Protocol (Smith 1980): manager announces a task, contractors bid, manager awards, contractor reports; Smith himself flagged network overload and recommended short messages and interacting only with relevant agents | https://en.wikipedia.org/wiki/Contract_Net_Protocol (secondary hub); canonical PDF https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf (not opened) | 2026-10-06 | secondary | IEEE Trans. Computers 29(12):1104–1113, doi:10.1109/TC.1980.1675516; see Gaps
- Communication complexity (Yao 1979) proves fundamental lower bounds on the bits needed to compute functions with distributed inputs; e.g. disjointness requires Ω(n) bits | https://dblp.org/rec/conf/stoc/Yao79 | 2026-10-06 | primary | STOC 1979:209–213; lower bound attribution to Razborov 1992 via secondary summary — see Gaps
- Synchronisation cost under naive broadcast scales as O(n × S × |D|) in agents, steps, and artifact size ("broadcast-induced triply-multiplicative overhead"); a MESI-style lazy-invalidation protocol reduces it to O((n+W)×|D|) with 84–95% token savings in simulation | https://arxiv.org/abs/2603.15183 | 2026-10-06 | primary | TLA+-verified protocol; single-author preprint, simulation-only — treat savings as modelled, not deployed
- Coordination Primacy Hypothesis: inter-agent coordination protocol design may be a primary driver of trading-decision quality, often more than model scaling — presented as a falsifiable hypothesis, not validated | https://arxiv.org/abs/2603.27539 | 2026-10-06 | primary | survey; introduces Coordination Breakeven Spread metric; documents 5 evaluation failures that can reverse the sign of reported returns

### Pro-communication evidence

- Multi-agent groups can outperform a single agent via role specialisation and SOPs; encodes SOPs into prompt sequences to reduce cascading hallucinations | https://arxiv.org/abs/2308.00352 | 2026-10-06 | primary | MetaGPT
- ChatDev: unified language-based communication across design/code/test phases; "communicative dehallucination" | https://arxiv.org/abs/2307.07924 | 2026-10-06 | primary | chat chain; language as unifying bridge
- CAMEL: role-playing with inception prompting enables autonomous cooperation among communicative agents | https://arxiv.org/abs/2303.17760 | 2026-10-06 | primary | NeurIPS 2023
- Multiple LM instances debating improves mathematical and strategic reasoning and reduces fallacious answers/hallucinations | https://arxiv.org/abs/2305.14325 | 2026-10-06 | primary | Du et al.; "society of minds"
- MAD encourages divergent thinking and addresses Degeneration-of-Thought; adaptive break and modest "tit for tat" required | https://arxiv.org/abs/2305.19118 | 2026-10-06 | primary | Liang et al.; notes LLMs may not be a fair judge when different LLMs are used for agents
- LLM performance scales with the number of instantiated agents via sampling-and-voting (Agent Forest); orthogonal to other methods | https://arxiv.org/abs/2402.05120 | 2026-10-06 | primary | enhancement correlates with task difficulty
- AgentVerse: multi-agent groups outperform a single agent; discusses emergent social behaviours, both positive and negative | https://arxiv.org/abs/2308.10848 | 2026-10-06 | primary
- Chain-of-Agents: worker agents sequentially communicate over segmented text, manager synthesises; up to 10% improvement over RAG/Full-Context/multi-agent LLM baselines | https://arxiv.org/abs/2406.02818 | 2026-10-06 | primary
- Cross-Team Orchestration (Croto): multiple agent teams jointly propose solutions and share insights; notable increase in software quality; generalises to story generation | https://arxiv.org/abs/2406.08979 | 2026-10-06 | primary | Findings of ACL 2025
- TalkHier: structured communication protocol + hierarchical refinement surpasses SoTA including OpenAI-o1, AgentVerse, majority voting, ReAct | https://arxiv.org/abs/2502.11098 | 2026-10-06 | primary | Sony
- Optima: trained MAS achieves up to 2.8× performance gain with <10% tokens on heavy-information-exchange tasks | https://arxiv.org/abs/2410.08115 | 2026-10-06 | primary | generate-rank-select-train; requires explicit training, not prompting
- Agent-as-a-Judge: agentic evaluation dramatically outperforms LLM-as-a-Judge and is as reliable as human evaluation | https://arxiv.org/abs/2410.10934 | 2026-10-06 | primary | DevAI benchmark, 55 tasks / 365 hierarchical requirements
- MultiAgentBench: graph structure performs best among coordination protocols (star, chain, tree, graph) in the research scenario; cognitive planning improves milestone achievement by 3% | https://arxiv.org/abs/2503.01935 | 2026-10-06 | primary
- Scaling multi-agent collaboration: MacNet supports 1,000+ agents, irregular topologies outperform regular ones, performance follows a logistic collaborative scaling law | https://arxiv.org/abs/2406.07155 | 2026-10-06 | primary
- AutoGen: generic infrastructure for multi-agent conversation with flexible, programmable interaction patterns | https://arxiv.org/abs/2308.08155 | 2026-10-06 | primary
- Survey: LLM-MAS is a research hotspot spanning complex tasks, simulation, and evaluation | https://arxiv.org/abs/2412.17481 | 2026-10-06 | primary
- Herd behaviour can be systematically controlled, and appropriately calibrated herd tendencies can enhance collaborative outcomes | https://arxiv.org/abs/2505.21588 | 2026-10-06 | primary | dual-edged: default conformity is harmful, calibrated conformity can help
- Social learning and collective norm formation can foster cooperation in LLM MAS | https://arxiv.org/abs/2510.14401 | 2026-10-06 | primary | AAMAS 2026

## Searches
- "Why Do Multi-Agent LLM Systems Fail?" arXiv 2503.13657
- "Should we be going MAD" / "Rethinking the Bounds of LLM Reasoning" arXiv 2402.18272
- "Multi-Agent Collaboration via Cross-Team Orchestration" arXiv
- AgentVerse 2308.10848; AutoGen 2308.08155; MetaGPT 2308.00352; ChatDev 2307.07924; CAMEL 2303.17760
- "Encouraging Divergent Thinking" multi-agent debate 2305.19118
- "Improving Factuality and Reasoning" multiagent debate 2305.14325
- "More Agents Is All You Need" 2402.05120
- AgentBench; Agent-as-a-Judge; Chain of Agents 2406.02818
- "Talk Structurally Talk Freely" arXiv 2025 (found as TalkHier 2502.11098)
- Optima / MAPoRL multi-agent LLM arXiv
- "Multi-Agent Systems Powered by LLMs: A Survey" (found 2410.02506 = AgentPrune)
- "A Survey on LLM-based Multi-Agent Systems" 2412.17481
- "On the Resilience of LLM-Based Multi-Agent Collaboration" 2408.00989
- "Stop Overvaluing Multi-Agent Debate" 2502.08788
- "Single-agent or Multi-agent Systems" 2505.18286
- "Talk Isn't Always Cheap" 2509.05396
- "Strategic Communication and Language Bias" 2508.00032
- "Improving Multi-Agent Debate with Sparse Communication Topology" 2406.11776
- G-Designer multi-agent communication topology 2410.11782
- MultiAgentBench 2503.01935
- LLM agents conformity multi-agent arXiv 2025 → 2501.13381, 2506.01332, 2507.22467, 2508.18321, 2510.19107
- sycophancy / order matters multi-agent debate → 2509.23055, 2609.38964
- social loafing multi-agent LLM → 2605.10698 (Bystander Effect)
- error compounding multi-agent LLM → 2603.04474, 2606.07937, 2606.07941
- "Language Model Teams as Distributed Systems" 2603.12229
- "Multi-Agent Teams Hold Experts Back" 2602.01011
- "When Should We Orchestrate Multiple Agents" 2503.13577
- "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval" 2510.05381
- "Agents of Chaos" 2602.20021
- FIPA-ACL spec; KQML Finin Labrou; contract net Smith 1980; speech-act theory Austin/Searle; Yao 1979 communication complexity
- Lewis games / referential games / emergent communication Lazaridou
- "On the Pitfalls of Measuring Emergent Communication" 1903.05168
- anti-efficient encoding 1905.12561; entropy minimization 1905.13687; compositionality vs generalization 2004.09124, 2004.03420
- "Natural Language Does Not Emerge Naturally" 1706.08502
- "Token Coherence" MESI multi-agent 2603.15183
- "Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning" 2604.02460

## Conflicting evidence
- Pro-communication papers (MetaGPT, ChatDev, CAMEL, AgentVerse, TalkHier, Optima, CoA, Croto) report multi-agent outperforming single-agent. Anti-communication papers (2402.18272, 2502.08788, 2509.05396, 2605.00914, 2604.02460) report matching or underperforming. Differentiator: pro papers typically use role specialisation, structured protocols, and/or trained models; anti papers use homogeneous unguided debate and/or compute-normalised baselines. [INFERENCE] Structured role-based communication may help; unstructured homogeneous debate likely hurts.
- MAST category percentages differ by version: v1 reports system design 44.2% / inter-agent misalignment 32.3% / task verification 23.5%; v2 HTML reports FC1 41.77% / FC2 36.94% / FC3 21.30%. Read both; cite the version.
- MAST headline failure rate: worker reports "41%–86.7% across 7 frameworks" — this could NOT be confirmed from the abs page or v1/v2 HTML (found "correctness … as low as 25%" v1, "75% failure for ChatDev on ProgramDev" v2). Treat 41–86.7% as UNVERIFIED.
- Optima reports 2.8× gain with <10% tokens (pro), while Cut the Crap reports $43.7 cost for SOTA topologies (anti). Different baselines: Optima trains the model; AgentPrune prunes an existing topology. [INFERENCE] Training-based optimisation may be more effective than pruning, but both confirm large baseline overhead.
- MAPoRL says training individual LLMs alone is insufficient for collaboration (pro multi-agent), while 2505.18286 says MAS benefits diminish as single LLMs improve (anti). [INFERENCE] Co-training may be needed today but could become unnecessary as base models improve.
- Resilience paper favours hierarchical topology (pro structure); Sparse Communication paper favours sparse topology (anti dense); MultiAgentBench favours graph. [INFERENCE] Optimal topology is task-dependent.
- Compositionality → generalisation: 2004.09124 and 2004.03420 find no/loose correlation; 1910.11424 and 2209.15342 find compositionality aids systematic generalisation and is recoverable by fixing overfitting. Conflict likely stems from differing compositionality definitions and evaluation protocols (2010.15058 shows most metrics are broken).
- Emergent-communication pro results (1612.07182, 1703.04908) vs anti results (1706.08502, 1905.12561, 1903.05168): communication reliably emerges and solves the task, but the code is frequently non-compositional, anti-efficient, or spurious. [INFERENCE] Task success ≠ useful, efficient, interpretable protocol.

## Gaps
- No paper directly studies a persistent group-chat room (chat + claim board + blackboard) spanning a main agent, subagents, nested subagents, and future joiners. All papers study debate, role-based workflows, topologies, or evaluation frameworks.
- No paper measures the cost of maintaining a persistent shared context (chat history) across long-running agent sessions; token overhead is measured per-task, not per-session.
- No paper isolates persistent memory (chat history) vs ephemeral communication on multi-agent performance.
- No paper studies communication protocols that persist across agent turnover (joiners/leavers).
- No paper directly compares a shared blackboard/claim board vs free-form chat between LLM agents.
- FIPA-ACL full spec page (fipa.org/specs/fipa00061/SC00061G.html) returned HTTP 403; performative counts and message-field structure come from a corroborating primary source (arXiv cs/9809034) and worker notes. Treat exact counts as unverified.
- Contract Net canonical PDF (reidgsmith.com) not opened; Smith 1980 details rest on a secondary hub page. doi:10.1109/TC.1980.1675516 is the citable identifier.
- Communication-complexity lower bound attribution (Razborov 1992, Ω(n) for disjointness) rests on a secondary summary; Yao 1979 itself is primary but not read in full.
- Worker-cited arXiv 2501.13381 (BenchForm conformity benchmark) and 2507.22467 / 2508.18321 (social influence) were verified as resolving to conformity papers but not independently re-summarised in this file.
- Radeva et al. "Multi-Agent Coordination Strategies vs RAG" (Electronics 14(24):4883) reported 87.5% of multi-agent configs underperforming single-agent — the MDPI page returned HTTP 403 and the claim is UNVERIFIED.
- Worker-cited 2606.07937 (Hallucination Cascade) numbers (0.422→0.272, 0.789→0.769) were verified from the abs page; the reported "amplification factor 0.644" is quoted from the abstract.
- "Emergent Communication of Generalizations" = 2106.02668 verified; "The Emergence of Complex Communication" was not located as a distinct arXiv paper (searched, not found).
- No paper measures "context dilution" or "context pollution" as a named failure mode in multi-agent LLM systems; nearest evidence is long-context degradation (2510.05381, 2307.03172) recorded in F10.
