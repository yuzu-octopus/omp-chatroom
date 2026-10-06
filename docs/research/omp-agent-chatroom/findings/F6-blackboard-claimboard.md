# F6 LLM frameworks (this worker's section)

## Angle

Hunt how 12 LLM-agent frameworks hold SHARED STATE for group work. For each: what state is, how written, how bounded, who arbitrates, claim/lock. Main goal: steal blackboard/claim-board pattern for omp chatroom. Repo-first, docs second. Every claim = source URL + fetch date + confidence. No code written.

## Claims

### 1. AutoGen (microsoft/autogen)

- AutoGen 0.4 Core = actor model. Each agent has own state + message handlers. Runtime routes messages; agents talk direct (AgentId) or broadcast pub/sub (TopicId). Topic = (Topic Type, Topic Source). Runtime keeps subscription map; topic w/o subscription = message dropped. | https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/core-concepts/topic-and-subscription.html | 2026-10-06 | primary
- Broadcast = one-way. Handler return values NOT sent back to publisher. Publisher never knows recipient IDs. | same URL | 2026-10-06 | primary
- GroupChat = shared thread over ONE common topic. All participants subscribe + publish same topic. Turn order = Group Chat Manager agent picks next speaker. Only one agent works at a time (sequential). Algorithm = round-robin or LLM selector. | https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/group-chat.html | 2026-10-06 | primary
- GroupChat message protocol: user publishes GroupChatMessage to common topic -> manager picks speaker, sends RequestToSpeak -> agent publishes GroupChatMessage to common topic -> repeat until manager stops. | same URL | 2026-10-06 | primary
- AgentChat SelectorGroupChat = high-level built-in. Each participant keeps FULL chat history in own `_chat_history` list. Messages broadcast to all. Model picks next speaker from roles+history; default forbids same speaker twice in row (`allow_repeated_speaker=False`). Termination = text mention ("TERMINATE") OR MaxMessageTermination(max_messages=25) etc. | https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html | 2026-10-06 | primary
- Bounding: `max_turns` int + pluggable TerminationCondition. BaseGroupChatManager resets termination condition + turn count on stop. Group chat context persists INSIDE team across tasks until `reset()` called. | https://raw.githubusercontent.com/microsoft/autogen/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat_manager.py | 2026-10-06 | primary
- CLAIM/LOCK: explicit `FIFOLock` (asyncio.Queue of Events). `SequentialRoutedAgent` acquires FIFO lock for declared `sequential_message_types` (GroupChatStart/RequestPublish/Reset/AgentResponse/TeamResponse). Guarantees strict per-agent processing order. This is a real lock primitive, not just convention. | https://raw.githubusercontent.com/microsoft/autogen/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_sequential_routed_agent.py | 2026-10-06 | primary
- ChatAgentContainer holds `_message_buffer: List[BaseChatMessage]`; on GroupChatRequestPublish passes buffer to agent, then CLEARS buffer and publishes response. `save_state`/`load_state` serialize message buffer + agent state (persistable). | https://raw.githubusercontent.com/microsoft/autogen/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_chat_agent_container.py | 2026-10-06 | primary
- Manager keeps `_message_thread` list; selector manager maintains separate `_model_context` (UnboundedChatCompletionContext by default). `_active_speakers` list tracks concurrent speakers; manager only transitions when all active speakers respond. | https://raw.githubusercontent.com/microsoft/autogen/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_selector_group_chat.py | 2026-10-06 | primary
- Selector has `max_selector_attempts` retry loop; model must name exactly one valid participant, else re-prompt with feedback. Guards speaker-selection validity. | same URL | 2026-10-06 | primary
- [INFERENCE] "mailbox" is doc analogy, not a distinct API type; real surface = messages/AgentId/TopicId/subscription/runtime. | https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/framework/message-and-communication.html | 2026-10-06 | secondary

### 2. LangGraph (langchain-ai/langgraph)

- Shared state = single graph `State` (TypedDict or Pydantic). Every node reads state, returns PARTIAL update dict. State schema = input schema to all nodes/edges. | https://docs.langchain.com/oss/python/langgraph/graph-api | 2026-10-06 | primary
- Reducers = per-key binary fn `reducer(left=current, right=update)`. Default reducer DISCARDS left, replaces with right. Custom `Annotated[list, add]` appends. Reducers resolve concurrent updates in same super-step. | same URL | 2026-10-06 | primary
- Multiple schemas: OverallState + InputState + OutputState + PrivateState. Nodes may write to any channel in union; private channels excluded from invoke output BUT NOT redacted in `stream_mode="values"` (documented warning). | same URL | 2026-10-06 | primary
- `Overwrite` type bypasses a merging reducer. Empty update to merging reducer does NOT clear (documented gotcha). | same URL | 2026-10-06 | primary
- Bounding: checkpointer persists graph state per `thread_id`. `MemorySaver`/`InMemorySaver` = RAM, lost on restart. Durable = `PostgresSaver` (thread_id < 255 chars) / `SqliteSaver`. Docs warn "Checkpoints growing unboundedly" -> prune manually/cron. | https://docs.langchain.com/oss/python/langgraph/persistence | 2026-10-06 | primary
- Checkpointer (thread-scoped short-term) vs Store (cross-thread long-term KV). Store = shared knowledge across threads. Subgraph updates not immediately visible to parent (separate checkpoint namespace); fix = shared Store or parent-checkpoint write. | same URL | 2026-10-06 | primary
- `interrupt(value)` pauses, saves state, waits indefinitely; resume with `Command(resume=...)` on SAME thread_id. Node RESTARTS from beginning on resume (code before interrupt re-runs). Multiple parallel interrupts resumed via `{interrupt_id: value}` map. Optional `response_schema` validates resume value. | https://docs.langchain.com/oss/python/langgraph/interrupts | 2026-10-06 | primary
- CLAIM/LOCK: NO lock. Concurrent writes to same key WITHOUT reducer -> `InvalidUpdateError` (`INVALID_CONCURRENT_GRAPH_UPDATE`). This is conflict DETECTION, not locking; fix is define a reducer. | https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE ; https://reference.langchain.com/python/langgraph/errors/InvalidUpdateError | 2026-10-06 | primary
- Supervisor pattern = main agent routes to subagents as tools; all routing through main agent. Handoff pattern = tool call mutates state var that reroutes. Subagents are stateless by design (fresh each invocation); main agent keeps conversation context. | https://docs.langchain.com/oss/python/langchain/multi-agent | 2026-10-06 | primary
- Pregel-style super-steps: parallel nodes = same super-step; node active when message arrives on channel; halt when all inactive + no in-transit messages. | https://docs.langchain.com/oss/python/langgraph/graph-api | 2026-10-06 | primary

### 3. CrewAI (crewAIInc/crewAI)

- Crew = group of agents + ordered `tasks` + `process` (sequential default, or hierarchical). Hierarchical REQUIRES `manager_llm` or `manager_agent`. | https://docs.crewai.com/en/concepts/crews | 2026-10-06 | primary
- Shared state is NARROW: a Task's `context` = list of other Tasks whose OUTPUT is injected as context. Forward references rejected in JSONC. No global mutable board. | https://docs.crewai.com/en/concepts/tasks | 2026-10-06 | primary
- `TaskOutput` carries raw/json_dict/pydantic + `agent` + `messages`. Tasks run in list order when sequential. | same URL | 2026-10-06 | primary
- Delegation: `allow_delegation` per agent (default False). Hierarchical process = manager assigns by role/availability. | https://docs.crewai.com/en/concepts/agents | 2026-10-06 | primary
- Bounding: `max_iter` (20), `max_execution_time`, `max_rpm`, `max_retry_limit` (2), `guardrail_max_retries` (3), `respect_context_window` (summarize), Crew `max_rpm`. Crew-level `memory` (short/long/entity) + `cache`. | https://docs.crewai.com/en/concepts/agents ; https://docs.crewai.com/en/concepts/crews | 2026-10-06 | primary
- Checkpointing: `checkpoint=True` saves to `.checkpoints/` after each task; `CheckpointConfig(location, on_events, max_checkpoints)`; `Crew.from_checkpoint()` resumes. Bounded by `max_checkpoints` retention. | https://docs.crewai.com/en/concepts/crews | 2026-10-06 | primary
- CLAIM/LOCK: none documented. Sequential order or manager LLM = de facto arbitration. `Task.max_retries` deprecated -> `guardrail_max_retries`. | https://docs.crewai.com/en/concepts/tasks | 2026-10-06 | primary

### 4. CAMEL (camel-ai/camel)

- Core primitive = `RolePlaying` (turn-based, prompt-engineered). Fixed roles: AI User (instructor) + AI Assistant (solver); optional Critic. Turn-taking enforced by system prompts, NOT a lock. Guards role-flipping + infinite loops. | https://docs.camel-ai.org/key_modules/societies | 2026-10-06 | primary
- Inception prompting = system prompts P_I / P_A hypnotize LLMs into roles; message format enforced ("Solution: ...", ends "Next request."). | same URL ; https://arxiv.org/abs/2303.17760 | 2026-10-06 | primary
- Shared state = per-agent `AgentMemory`. No global board. Memory = MemoryRecord units; `ChatHistoryBlock` (recency, keep_rate 0.9) + `VectorDBBlock` (semantic). `LongtermAgentMemory` = hybrid. | https://docs.camel-ai.org/key_modules/memory | 2026-10-06 | primary
- Bounding: `ScoreBasedContextCreator(token_counter, token_limit)` caps context tokens; `chat_turn_limit` loop cap; termination via `CAMEL_TASK_DONE` or `terminated` flags. | https://docs.camel-ai.org/key_modules/societies ; https://docs.camel-ai.org/key_modules/memory | 2026-10-06 | primary
- Arbitration: none beyond fixed instructor/assistant roles + optional task_specify / task_planner / critic-in-the-loop. | https://docs.camel-ai.org/key_modules/societies | 2026-10-06 | primary
- CLAIM/LOCK: none. Turn discipline is prompt-level only. | same URL | 2026-10-06 | primary
- Note: CAMEL also has Runtimes (Docker/Remote/LLMGuard) but those sandbox TOOL EXECUTION, not shared agent state. | https://docs.camel-ai.org/key_modules/runtimes | 2026-10-06 | primary

### 5. ChatDev (OpenBMB/ChatDev)

- ChatDev 1.0 (legacy branch `chatdev1.0`) = "chat chain": sequential phases (Design, Coding, Testing), each split into subtasks. Each subtask = 2 agents (Instructor + Assistant) multi-turn dialogue; solution extracted then bridges to next subtask. | https://arxiv.org/abs/2307.07924 | 2026-10-06 | primary
- Shared state = global `ChatEnv` (chat_env.py): `roster`, `codes`, `documents` (requirements/manuals), `memory`, `env_dict` (directory, task_prompt, ideas, language, review_comments, error_summary, test_reports). Phases read/write this dict. | https://raw.githubusercontent.com/OpenBMB/ChatDev/chatdev1.0/chatdev/chat_env.py | 2026-10-06 | primary
- Memory bounded by SEGMENTATION not truncation: short-term memory = utterances within one phase; long-term memory = only extracted solutions from prior phases (`M~^i = τ(M^j)`). Prevents context overload. | https://arxiv.org/abs/2307.07924 | 2026-10-06 | primary
- Subtask terminates after 2 unchanged code modifications OR 10 rounds of communication. Communicative dehallucination = deliberate role reversal for extra info before answer. | same URL | 2026-10-06 | primary
- Arbitration = fixed chat-chain SOP (who talks to whom per subtask); no dynamic speaker selection, no claim/lock. | same URL | 2026-10-06 | primary
- WARNING: `main` branch is now ChatDev 2.0 (DevAll) zero-code YAML platform; classic ChatDev moved to `chatdev1.0` branch. Old `camel/environments.py` path 404s on `chatdev1.0` (no such file); CAMEL copy vendored under `camel/`. | https://github.com/OpenBMB/ChatDev ; https://github.com/OpenBMB/ChatDev/tree/chatdev1.0/camel | 2026-10-06 | primary

### 6. MetaGPT (FoundationAgents/MetaGPT)

- Shared state = global `Environment` message pool. Roles `publish_message`; `Environment.publish_message` routes by `member_addrs` (`is_send_to`), calls `role.put_message`, then appends to `env.history` (Memory) for debug. Message with no recipient -> warning logged, still stored in history. | https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/metagpt/environment/base_env.py | 2026-10-06 | primary
- Pub/sub = role `_watch([ActionType...])`; role only observes messages `cause_by` watched Actions. `important_memory` = memory.get_by_actions(watch). This is the SUBSCRIPTION filter. | https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/metagpt/roles/role.py | 2026-10-06 | primary
- Message pool = `Memory` (super-memory): `storage` list + `index` defaultdict by `cause_by`. Dedup: `if message in self.storage: return`. Query by role/content/action/position/keyword. | https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/metagpt/memory/memory.py | 2026-10-06 | primary
- Role private receive buffer moved from global env memory to `rc.msg_buffer: MessageQueue` (RFC 116 change). `publish_message` sends out; `put_message` into role's private buffer; no other transmit methods. | https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/metagpt/roles/role.py | 2026-10-06 | primary
- Bounding: `Team.run(n_round)` loop breaks early if `env.is_idle`; budget via `invest()` -> `cost_manager.max_budget`, `_check_balance` raises `NoMoneyException`. | https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/metagpt/team.py | 2026-10-06 | primary
- Arbitration = SOP + role subscription: agent acts only after ALL prerequisite dependency messages arrive (`_watch` set). ReAct modes: REACT / BY_ORDER / PLAN_AND_ACT with `max_react_loop` to prevent infinite reaction. | https://docs.deepwisdom.ai/main/en/guide/tutorials/multi_agent_101.html ; role.py | 2026-10-06 | primary
- `env.run(k)` gathers all non-idle roles concurrently with `asyncio.gather`. | base_env.py | 2026-10-06 | primary
- CLAIM/LOCK: none. Concurrency = single asyncio loop, roles filtered by `is_idle`. No per-message lock. | base_env.py | 2026-10-06 | primary

### 7. AgentVerse (OpenBMB/AgentVerse)

- Task-solving loop = 4 phases per round, all inside `BasicEnvironment.step()`: (1) Expert Recruitment (role_assigner dynamically generates expert descriptions), (2) Collaborative Decision-Making, (3) Action Execution, (4) Evaluation (score+advice; score>=8 -> success). | https://raw.githubusercontent.com/OpenBMB/AgentVerse/main/agentverse/environments/tasksolving_env/basic.py | 2026-10-06 | primary
- Shared state = `BaseEnvironment`: `agents`, `rule`, `max_turns=10`, `cnt_turn`, `last_messages: List[Message]`, `rule_params`. Step returns messages; env owns turn counter. | https://raw.githubusercontent.com/OpenBMB/AgentVerse/main/agentverse/environments/base.py | 2026-10-06 | primary
- Decision structures: horizontal (democratic, decisions integrated via f like summarization/ensemble) vs vertical (solver proposes, reviewers critique, iterate to consensus or fixed iterations). | https://arxiv.org/abs/2308.10848 | 2026-10-06 | primary
- Bounding: `max_turns`/`max_turn`; `is_done()` = cnt_turn >= max_turn OR success. | base.py ; basic.py | 2026-10-06 | primary
- Arbitration = pluggable `TasksolvingRule` (role_assigner, decision_maker, executor, evaluator). No claim/lock; sequential phases within a round. | basic.py | 2026-10-06 | primary
- Counter-evidence: repo README says simulation framework is "refactoring"; stable simulation only on `release-0.1` branch. Task-solving is the maintained path. | https://github.com/OpenBMB/AgentVerse | 2026-10-06 | primary

### 8. OpenAI Swarm (openai/swarm) — ABSENCE of shared state (explicit claim)

- CLAIM: Swarm has NO shared group state and NO claim/lock. Two primitives only: `Agent` + `handoffs`. "Swarm runs (almost) entirely on the client and, much like the Chat Completions API, does not store state between calls." | https://raw.githubusercontent.com/openai/swarm/main/README.md | 2026-10-06 | primary
- `client.run()` is analogous to `chat.completions.create()`: takes messages, returns messages, saves no state. Loop: get completion -> execute tool calls -> switch agent if needed -> update context vars -> return if no new calls. | same URL | 2026-10-06 | primary
- Closest thing to shared state = `context_variables: dict` passed IN and returned OUT by `client.run()`; caller owns it. Function returning `Agent` = handoff; `Result(value, agent, context_variables)`. "If an Agent calls multiple functions to hand-off, only the LAST handoff function will be used." | same URL | 2026-10-06 | primary
- Only agent `instructions` are swapped on handoff; chat history is NOT reset (history passed by caller). No conversation thread object. | same URL | 2026-10-06 | primary
- Bounding = `max_turns` param, default `float("inf")`. | same URL | 2026-10-06 | primary
- DEPRECATED: README banner: "Swarm is now replaced by the OpenAI Agents SDK... We recommend migrating." Repo = experimental/educational. | same URL | 2026-10-06 | primary
- [INFERENCE] Any group-chat/blackboard semantics must be built by the caller on top of `context_variables` + handoffs; the library itself provides none. | same URL | 2026-10-06 | secondary

### 9. Langroid (langroid/langroid)

- Shared state = NONE global. Each `ChatAgent` holds own `message_history`. `Task` wraps an agent and owns `pending_message` + `pending_sender`. Collaboration = message passing via task hierarchy. | https://raw.githubusercontent.com/langroid/langroid/main/langroid/agent/task.py | 2026-10-06 | primary
- `Task.step()` tries responders in order: native `[agent_response, llm_response, user_response]` then sub-tasks' `run()`. Valid response updates pending_message/sender; next step RESTARTS search from top. Semantics = "OR Else", not "AND Then". | https://raw.githubusercontent.com/langroid/langroid/main/docs/quick-start/multi-agent-task-delegation.md | 2026-10-06 | primary
- Sequential behavior achieved by NESTING sub-tasks (helper_task1.add_sub_task(helper_task2)). | same URL | 2026-10-06 | primary
- Messages = `ChatDocument` with metadata; agent-to-agent addressing via `RecipientTool` (preferred) or deprecated `addressing_prefix`; `SEND_TO` constant always enabled. | task.py | 2026-10-06 | primary
- Bounding: `max_stalled_steps` (default 5 in docstring; class docstring says 3 — CONFLICT, see below), infinite-loop detection `TaskConfig.inf_loop_cycle_len=10`, `inf_loop_dominance_factor=1.5`, `inf_loop_wait_factor=5`; `single_round`; `erase_substeps` to shrink prompts. | task.py | 2026-10-06 | primary
- Arbitration = responder order (fallback chain). Concurrent work via `run_batch_tasks`, not a shared board. | https://github.com/langroid/langroid/blob/main/docs/FAQ.md | 2026-10-06 | secondary
- CLAIM/LOCK: none. Single-threaded turn loop per task tree. | task.py | 2026-10-06 | primary

### 10. Agno (agno-agi/agno)

- `Team` = leader + members (+ nested teams). `TeamMode`: coordinate (default), route, broadcast, tasks. Leader can answer directly or delegate. | https://docs.agno.com/teams/overview | 2026-10-06 | primary
- Shared state = `session_state` dict on Team, shared between leader and members. Initialized `Team(session_state={...})`; members read/write via `run_context.session_state` in tools; updates merged back. | https://docs.agno.com/state/team/overview | 2026-10-06 | primary
- CONCURRENCY CAVEAT (explicit): "In the default coordinate mode, each delegated member receives a shallow copy of the current state dictionary. Task mode uses deep copies. On return, its updates are merged into the team state. Sequentially delegated members can use earlier results; parallel updates to the same key are not atomic database transactions." | same URL | 2026-10-06 | primary
- Bounding/persistence: needs a DB; state stored with team session and reloaded by `session_id`. `InMemoryDb` only lasts lifetime of the db object. `add_session_state_to_context=True` to expose state in system message. `enable_agentic_state=True` lets agents update autonomously. `overwrite_db_session_state` to replace vs merge. | same URL | 2026-10-06 | primary
- Arbitration = team leader (model call) in coordinate mode; mode controls delegation path. | https://docs.agno.com/teams/overview | 2026-10-06 | primary
- CLAIM/LOCK: none. Explicit non-atomic merge = documented lost-update risk on same key. | https://docs.agno.com/state/team/overview | 2026-10-06 | primary
- Note: state "propagates through nested team structures". | same URL | 2026-10-06 | primary

### 11. Letta (letta-ai/letta)

- Shared state = shared MEMORY BLOCKS attached to multiple agents. One block, N agents; "update once, visible everywhere". Blocks are prepended to prompt (always in context, no retrieval). Fields: label, description, value, limit(chars). | https://docs.letta.com/v1-sdk/memory/memory-blocks | 2026-10-06 | primary
- `read_only=True` on a block = whole block read-only for ALL attached agents (cannot be per-agent). | https://docs.letta.com/v1-sdk/memory/shared-memory | 2026-10-06 | primary
- CLAIM/LOCK (explicit concurrency table): `memory_insert` append-only = concurrent-safe YES; `memory_replace` targeted edit = mostly (fails if target string changed); `memory_rethink` full rewrite = NO (last-writer-wins). Anti-pattern: multiple agents doing `memory_rethink` simultaneously -> lost updates. Guidance: designate one owner agent for heavy edits; others append. | same URL | 2026-10-06 | primary
- `blocks.update()` REPLACES entire content, does not append. | same URL | 2026-10-06 | primary
- DEPRECATION: memory blocks marked "legacy"; docs say "We do not recommend building on memory blocks anymore. Use shared memory repositories for new work... migrate agents to MemFS." | https://docs.letta.com/v1-sdk/memory/shared-memory | 2026-10-06 | primary
- New model = shared memory repositories: org-owned Git repos in Letta Cloud. Agent clones beside MemFS, reads/edits with normal file+Git tools, must commit AND push; others pull. Attach per agent; also provides skills via `skills/<name>/SKILL.md`. Requires cloud-hosted agents. | https://docs.letta.com/concepts/shared-memory | 2026-10-06 | primary
- [INFERENCE] Git commit/push = the de facto claim/lock for the new model (conflict handled by Git, not by Letta). | same URL | 2026-10-06 | secondary
- Block size bounded by `limit` (chars); over-limit -> agent can't see update; fix = raise limit or archive/summarize. | https://docs.letta.com/v1-sdk/memory/shared-memory | 2026-10-06 | primary

### 12. Microsoft Semantic Kernel (microsoft/semantic-kernel)

- Shared state = conversation via `AgentThread` (abstract). Threads abstract where conversation state lives: some stateful services store it server-side (accessed by id), others require full chat history each call. Stateful agents need matching thread type (e.g. AzureAIAgent -> AzureAIAgentThread) else fail fast. | https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture | 2026-10-06 | primary
- Group chat = `GroupChatOrchestration` + `GroupChatManager` (e.g. `RoundRobinGroupChatManager{MaximumInvocationCount=5}`). Manager picks next agent, decides termination, can request human input. Runs on a runtime (`InProcessRuntime`). Messages captured via `ResponseCallback`. | https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/group-chat | 2026-10-06 | primary
- STATUS: Agent Orchestration features = "experimental stage... may change significantly". | same URL | 2026-10-06 | primary
- DEPRECATION/COUNTER-EVIDENCE: old `AgentGroupChat` (with SelectionStrategy/TerminationStrategy) "is no longer maintained"; migration guide mandates moving to GroupChatOrchestration and REMOVING AgentGroupChat-specific APIs. | https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture ; https://learn.microsoft.com/en-us/semantic-kernel/support/migration/group-chat-orchestration-migration-guide | 2026-10-06 | primary
- Orchestration patterns: Concurrent, Sequential, Handoff, Group Chat, Magentic. Human-in-the-loop supported in some. Java SDK: orchestration unavailable. | https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture | 2026-10-06 | primary
- Customization = subclass `GroupChatManager`, override `ShouldTerminate` / selection. | https://learn.microsoft.com/en-us/semantic-kernel/support/migration/group-chat-orchestration-migration-guide | 2026-10-06 | primary
- CLAIM/LOCK: none documented for group chat. `AgentChannel` (legacy) = per-agent conversation-state abstraction, NOT a shared board and NOT a lock. | https://learn.microsoft.com/en-us/semantic-kernel/support/migration/group-chat-orchestration-migration-guide | 2026-10-06 | secondary
- Bounding = `MaximumInvocationCount` / `max_rounds`. | https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/group-chat | 2026-10-06 | primary

### Cross-system synthesis (design-relevant)

- ONLY TWO systems ship a real lock primitive: AutoGen (`FIFOLock` on SequentialRoutedAgent) and Letta (append-only `memory_insert` declared concurrent-safe). Everything else uses turn order or documented lost-update risk. | see per-claim URLs | 2026-10-06 | primary
- ONLY ONE system detects write conflicts and errors instead of silently losing data: LangGraph `InvalidUpdateError` for reducer-less concurrent writes. | INVALID_CONCURRENT_GRAPH_UPDATE | 2026-10-06 | primary
- Explicit shared global board exists in exactly 3: MetaGPT (`Environment` message pool + subscription), ChatDev 1.0 (`ChatEnv` dict), AgentVerse (`BasicEnvironment.last_messages`). All three are SINGLE-ROUND / SOP-driven, none concurrent. | per-claim URLs | 2026-10-06 | primary
- Explicit shared mutable KV exists in exactly 3: LangGraph State, Agno session_state, Swarm context_variables (caller-owned). All three document a concurrency/lost-update caveat. | per-claim URLs | 2026-10-06 | primary
- Bounding mechanisms cluster into: turn/message caps (AutoGen max_turns, AgentVerse max_turns, Swarm max_turns, ChatDev 10 rounds, CrewAI max_iter), budget caps (MetaGPT max_budget, CrewAI max_rpm), token/context caps (CAMEL token_limit, Letta block limit, CrewAI respect_context_window), and memory SEGMENTATION (ChatDev short/long-term, LangGraph checkpointer vs store). | per-claim URLs | 2026-10-06 | primary
- No framework offers a first-class "claim" (reserve a task/item) primitive. Nearest equivalents: AutoGen RequestToSpeak (manager grants the floor), LangGraph interrupt (park+resume), Letta memory_replace (fails if target changed = optimistic concurrency), Git push in Letta shared repos. | per-claim URLs | 2026-10-06 | primary

## Searches

- "AutoGen 0.4 actor model AgentRuntime publish subscribe mailbox GroupChat"
- "LangGraph shared state TypedDict reducers checkpointer multi-agent supervisor"
- "Agno docs teams multi-agent shared context session state agno-agi"
- "Letta shared memory blocks multi-agent docs"
- "Semantic Kernel AgentGroupChat orchestration docs channels"
- "Langroid docs multi-agent collaboration task delegation agent messaging"
- "ChatDev 1.0 repo file structure message pool"
- "semantic kernel python AgentChannel deprecated AgentGroupChat channels"
- Direct fetches (primary): microsoft.github.io/autogen stable docs (topic-and-subscription, group-chat, selector-group-chat, message-and-communication); raw.githubusercontent.com microsoft/autogen main (_base_group_chat_manager.py, _sequential_routed_agent.py, _chat_agent_container.py, _selector_group_chat.py); docs.langchain.com (graph-api, persistence, interrupts, INVALID_CONCURRENT_GRAPH_UPDATE, langchain/multi-agent); raw.githubusercontent.com FoundationAgents/MetaGPT main (environment/base_env.py, memory/memory.py, roles/role.py, team.py); docs.deepwisdom.ai multi_agent_101; arxiv.org/abs/2308.00352 (MetaGPT paper); arxiv.org/abs/2307.07924 (ChatDev paper); raw.githubusercontent.com OpenBMB/ChatDev chatdev1.0 (chat_env.py) + tree/camel; arxiv.org/abs/2308.10848 (AgentVerse paper); raw.githubusercontent.com OpenBMB/AgentVerse main (environments/base.py, environments/tasksolving_env/basic.py); raw.githubusercontent.com openai/swarm main/README.md; raw.githubusercontent.com langroid/langroid main (agent/task.py, docs/quick-start/multi-agent-task-delegation.md); docs.agno.com (teams/overview, state/team/overview); docs.letta.com (v1-sdk/memory/memory-blocks, v1-sdk/memory/shared-memory, concepts/shared-memory); learn.microsoft.com semantic-kernel (agent-architecture, agent-orchestration/group-chat, group-chat-orchestration-migration-guide); docs.camel-ai.org (key_modules/societies, key_modules/memory, key_modules/runtimes); arxiv.org/abs/2303.17760 (CAMEL paper); docs.crewai.com (concepts/crews, concepts/tasks, concepts/agents)

## Conflicting evidence

- Langroid `max_stalled_steps`: `Task.__init__` docstring says "Default is 3", `TaskConfig`/param docs elsewhere say 5. Both appear in the same source file (langroid/agent/task.py). Unresolved. | task.py | 2026-10-06
- AgentVerse README claims simulation framework supported, but also says it is being refactored and stable simulation lives only on `release-0.1`; task-solving is the maintained path. Docs are internally inconsistent about readiness. | https://github.com/OpenBMB/AgentVerse | 2026-10-06
- Semantic Kernel: docs describe rich group-chat + human-in-the-loop, but label the whole orchestration subsystem "experimental", and simultaneously declare the previous group-chat API unmaintained. Two generations of docs coexist; some pages still describe `AgentGroupChat` behavior. | agent-architecture ; group-chat | 2026-10-06
- Letta: memory-blocks docs still describe shared blocks as a coordination primitive while the shared-memory page says "we do not recommend building on memory blocks anymore" and points to Git-backed repos. Two competing shared-state models, one legacy. | v1-sdk/memory/memory-blocks ; v1-sdk/memory/shared-memory | 2026-10-06
- ChatDev: `main` branch = ChatDev 2.0 (DevAll) with a completely different (YAML workflow) shared-state model; ChatDev 1.0's ChatEnv only exists on the `chatdev1.0` branch. Old doc/paper describe v1 behavior that no longer matches `main`. | https://github.com/OpenBMB/ChatDev | 2026-10-06
- OpenAI Swarm: README markets handoffs as sufficient for "networks of agents", yet explicitly says there is NO state between calls; the "shared state" is entirely caller-managed and the repo is deprecated in favor of Agents SDK. | openai/swarm README | 2026-10-06
- AutoGen: docs present a clean actor/runtime story, but the GroupChat pattern page itself warns the Core-API example "is complex" and recommends the higher-level AgentChat SelectorGroupChat — i.e., the general primitive is not the recommended path. | group-chat.html | 2026-10-06

## Gaps

- No official AutoGen doc found that states the message buffer/thread is bounded by default; `max_turns` caps turns but `_message_thread` and per-agent `_chat_history` appear to grow unbounded within a task. Did not verify runtime memory limits.
- LangGraph: did not fetch the exact `PostgresSaver`/`SqliteSaver` schema or retention tooling; "prune manually" is documented but no built-in TTL verified.
- CrewAI: could not verify whether hierarchical manager uses a shared mutable context or only task-output injection; `manager_llm`/`manager_agent` behavior at runtime not traced to source (docs-level only).
- ChatDev 1.0: `camel/environments.py` does not exist on `chatdev1.0` (404); could not confirm whether a distinct "message pool" object exists there vs only `ChatEnv`. Claim about ChatEnv is source-verified; "message pool" phrasing for ChatDev is doc/paper-level only and may be a MetaGPT import.
- AgentVerse: did not fetch `agentverse/environments/tasksolving_env/rules/` source for decision_maker horizontal/vertical implementation details; paper + env source only.
- MetaGPT: did not verify whether `Memory.storage` is ever pruned/truncated in long runs; `Team.run(n_round)` bounds rounds but per-role memory growth unverified.
- Letta: Git-conflict semantics for shared memory repositories (merge/rebase policy, locking) not documented on the fetched page; [INFERENCE] only.
- Semantic Kernel: no primary source found documenting any lock/claim or concurrency semantics for `GroupChatOrchestration`; absence is inferred from docs, not proven from source.
- No framework in this set was found to expose an explicit task/item CLAIM primitive (reserve-and-own) — searched but found none; this is an absence claim, not a proven negative across all source code.

# F6 blackboard/claim board (classical)

## Angle
Classical shared-state coordination: blackboard architectures, contract-net, stigmergy, tuple spaces, and modern work-queue claim patterns. How each system models shared state, bounds it, arbitrates access, and handles claim/lock.

## Claims

### Hearsay-II (Erman, Hayes-Roth, Lesser, Reddy 1980)
- Shared-state model: blackboard = multi-level hypothesis repository (acoustic -> phonetic -> word -> phrase -> semantic). KSs read/write hypotheses opportunistically. | https://faculty.chas.uni.edu/~wallingf/teaching/162/readings/hearsay-ii.pdf | 2026-10-06 | confidence: primary | Original paper in ACM Computing Surveys 11(2), June 1980.
- Bounding: hypotheses organized by abstraction level and time-segment; alternatives coexist but board size bounded by problem. | https://faculty.chas.uni.edu/~wallingf/teaching/162/readings/hearsay-ii.pdf | 2026-10-06 | confidence: primary
- Arbitration: control shell monitors board events, determines applicable KSs, schedules execution. No fixed pipeline. | https://faculty.chas.uni.edu/~wallingf/teaching/162/readings/hearsay-ii.pdf | 2026-10-06 | confidence: primary
- Claim/lock: none explicit. KSs coordinate purely through shared board state; no ownership transfer. | https://faculty.chas.uni.edu/~wallingf/teaching/162/readings/hearsay-ii.pdf | 2026-10-06 | confidence: primary

### BB1 (Hayes-Roth 1984)
- Shared-state model: dual blackboard -- domain blackboard (problem state) + control blackboard (plan/rationale). KSs act on both. | https://iiif.library.cmu.edu/file/Newell_box00075_fld05343_doc0007/Newell_box00075_fld05343_doc0007.pdf | 2026-10-06 | confidence: primary | Stanford STAN-CS-84-1034 / HPP-84-16.
- Bounding: control blackboard holds plan nodes with priorities; scheduler selects highest-priority executable action. | https://iiif.library.cmu.edu/file/Newell_box00075_fld05343_doc0007/Newell_box00075_fld05343_doc0007.pdf | 2026-10-06 | confidence: primary
- Arbitration: scheduler ranks pending control actions by priority + heuristics; can learn control rules. | https://iiif.library.cmu.edu/file/Newell_box00075_fld05343_doc0007/Newell_box00075_fld05343_doc0007.pdf | 2026-10-06 | confidence: primary
- Claim/lock: none. BB1 separates domain problem-solving from control knowledge; KSs share board but do not own regions. | https://iiif.library.cmu.edu/file/Newell_box00075_fld05343_doc0007/Newell_box00075_fld05343_doc0007.pdf | 2026-10-06 | confidence: primary

### Contract Net Protocol (Smith 1980)
- Shared-state model: task announcement -> bid -> award -> result. Manager broadcasts task; contractors bid; manager awards to best bid. | https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf | 2026-10-06 | confidence: primary | IEEE Trans. Computers C-29(12), Dec 1980, pp. 1104-1113.
- Bounding: task decomposition tree; manager controls subcontracting depth. | https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf | 2026-10-06 | confidence: primary
- Arbitration: manager node evaluates bids and awards contract. Contractors may subcontract recursively. | https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf | 2026-10-06 | confidence: primary
- Claim/lock: award message grants task ownership to contractor. No explicit lock timeout; contractor reports completion or failure. | https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf | 2026-10-06 | confidence: primary

### Stigmergy (Grasse 1959)
- Shared-state model: environment itself is shared state. Termite deposits material + pheromone cue -> cue influences later termite actions -> positive feedback -> coordinated structure. | https://cir.nii.ac.jp/crid/1362544420889208704?lang=en | 2026-10-06 | confidence: primary | Grasse, "La reconstruction du nid et les coordinations interindividuelles chez Bellicositermes natalensis et Cubitermes sp.", 1959.
- Bounding: pheromone diffusion/decay naturally bounds influence spatially and temporally. | https://cir.nii.ac.jp/crid/1362544420889208704?lang=en | 2026-10-06 | confidence: primary
- Arbitration: none. Fully decentralized; local response rules + environmental feedback produce global order. | https://cir.nii.ac.jp/crid/1362544420889208704?lang=en | 2026-10-06 | confidence: primary
- Claim/lock: none. No ownership; any termite can respond to any cue. | https://cir.nii.ac.jp/crid/1362544420889208704?lang=en | 2026-10-06 | confidence: primary

### Linda / Tuple Spaces (Gelernter 1985)
- Shared-state model: tuple space = shared associative collection of tuples. Processes write (out), read (rd), consume (in) tuples by template matching. | https://www.cs.tufts.edu/comp/150FP/archive/david-gelernter/generative-linda.pdf | 2026-10-06 | confidence: primary | ACM TOPLAS 7(1), Jan 1985, pp. 80-112.
- Bounding: tuple space grows unbounded unless tuples consumed; no automatic eviction. | https://www.cs.tufts.edu/comp/150FP/archive/david-gelernter/generative-linda.pdf | 2026-10-06 | confidence: primary
- Arbitration: none central. First-match-wins for in/rd; non-deterministic which process gets which tuple. | https://www.cs.tufts.edu/comp/150FP/archive/david-gelernter/generative-linda.pdf | 2026-10-06 | confidence: primary
- Claim/lock: in removes matching tuple (consumption = implicit claim). No explicit lock or timeout. | https://www.cs.tufts.edu/comp/150FP/archive/david-gelernter/generative-linda.pdf | 2026-10-06 | confidence: primary

### AWS SQS (visibility timeout)
- Shared-state model: queue of messages. Consumer calls ReceiveMessage -> message becomes invisible for visibility timeout. | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html | 2026-10-06 | confidence: primary
- Bounding: queue depth configurable; message retention 1 min - 14 days; max message size 256 KB. | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html | 2026-10-06 | confidence: primary
- Arbitration: SQS server. ReceiveMessage returns messages; no ordering guarantee (FIFO queues optional). | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html | 2026-10-06 | confidence: primary
- Claim/lock: visibility timeout = soft claim. Receipt handle per receive. ChangeMessageVisibility extends. DeleteMessage completes. At-least-once; duplicates possible if processing exceeds timeout. Max visibility 12 hours. | https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html | 2026-10-06 | confidence: primary

### Redis Streams (consumer groups)
- Shared-state model: stream = append-only log. Consumer groups track per-group delivery via Pending Entries List (PEL). | https://redis.io/docs/latest/develop/data-types/streams/ | 2026-10-06 | confidence: primary
- Bounding: stream capped by MAXLEN or trimming. PEL holds unacked entries. | https://redis.io/docs/latest/develop/data-types/streams/ | 2026-10-06 | confidence: primary
- Arbitration: XREADGROUP delivers new entries; XACK removes from PEL. XPENDING inspects; XCLAIM/XAUTOCLAIM transfers ownership of idle entries. | https://redis.io/docs/latest/commands/xclaim/ | 2026-10-06 | confidence: primary
- Claim/lock: XCLAIM with min-idle-ms = explicit claim. Delivery-attempt count incremented. At-least-once; no exactly-once. | https://redis.io/docs/latest/commands/xclaim/ | 2026-10-06 | confidence: primary

### Celery
- Shared-state model: broker-mediated task queue. Producer publishes task message; worker executes and acks. | https://docs.celeryq.dev/en/latest/userguide/tasks.html | 2026-10-06 | confidence: primary
- Bounding: broker-specific (RabbitMQ queue limits, Redis memory). Task result backend stores results with expiry. | https://docs.celeryq.dev/en/latest/userguide/tasks.html | 2026-10-06 | confidence: primary
- Arbitration: broker routes messages to workers. Early ack (default) or late ack (acks_late=True). | https://docs.celeryq.dev/en/latest/userguide/tasks.html | 2026-10-06 | confidence: primary
- Claim/lock: ack = claim completion. acks_late + task_reject_on_worker_lost enables redelivery on crash. At-least-once; idempotent tasks required. | https://docs.celeryq.dev/en/latest/userguide/tasks.html | 2026-10-06 | confidence: primary

### NATS JetStream
- Shared-state model: stream = persistent log. Durable pull consumer shared by worker pool. WorkQueue retention deletes on first ack. | https://docs.nats.io/learn/jetstream/worker-pool | 2026-10-06 | confidence: primary
- Bounding: stream retention (WorkQueue, Limits, Interest). MaxAckPending caps outstanding unacked per consumer. | https://docs.nats.io/learn/jetstream/worker-pool | 2026-10-06 | confidence: primary
- Arbitration: JetStream server delivers to one worker per message. AckWait timeout triggers redelivery. Explicit ack required. | https://docs.nats.io/learn/jetstream/delivery-and-acknowledgment | 2026-10-06 | confidence: primary
- Claim/lock: in-flight state = soft claim. AckWait = lock timeout. At-least-once; idempotent handlers required. | https://docs.nats.io/learn/jetstream/delivery-and-acknowledgment | 2026-10-06 | confidence: primary

### Kafka (consumer groups)
- Shared-state model: topic = partitioned log. Consumer group assigns each partition to exactly one consumer. | https://kafka.apache.org/42/operations/consumer-rebalance-protocol/ | 2026-10-06 | confidence: primary
- Bounding: partition count fixed at topic creation. Consumer lag = offset difference. Log retention by time/size. | https://kafka.apache.org/42/operations/consumer-rebalance-protocol/ | 2026-10-06 | confidence: primary
- Arbitration: group coordinator (broker) assigns partitions via rebalance protocol (eager, cooperative, or KIP-848 broker-side). | https://kafka.apache.org/42/operations/consumer-rebalance-protocol/ | 2026-10-06 | confidence: primary
- Claim/lock: partition assignment = exclusive claim. Consumer must commit offsets. Rebalance revokes and reassigns. At-least-once with manual offset commit. | https://kafka.apache.org/42/operations/consumer-rebalance-protocol/ | 2026-10-06 | confidence: primary

### BullMQ
- Shared-state model: Redis-backed job queue. Worker claims job via atomic moveToActive Lua script -> job enters active state with expiring lock token. | https://github.com/taskforcesh/bullmq/blob/master/src/commands/moveToActive-11.lua | 2026-10-06 | confidence: primary
- Bounding: queue length configurable. Job states: wait -> active -> completed/failed. Stalled jobs detected by stalledInterval. | https://docs.bullmq.io/bull/important-notes | 2026-10-06 | confidence: primary
- Arbitration: BullMQ Worker fetches from waiting queue. Lock token guards state transitions. Stalled jobs returned to waiting or failed. | https://docs.bullmq.io/bull/important-notes | 2026-10-06 | confidence: primary
- Claim/lock: moveToActive creates lock with lockDuration. Worker renews via lockRenewTime (default ~half lockDuration). Expired lock -> stalled -> recovery. At-least-once; duplicate processing possible. | https://docs.bullmq.io/bull/important-notes | 2026-10-06 | confidence: primary

## Searches
- "Hearsay-II blackboard architecture speech understanding Hayes-Roth"
- "BB1 blackboard architecture Hayes-Roth Stanford technical report"
- "contract-net protocol Smith 1980 CMU technical report task allocation"
- "stigmergy Grasse termite coordination self-organization"
- "Linda tuple spaces Gelernter 1985 coordination language"
- "AWS SQS visibility timeout message claim mechanism"
- "Redis Streams consumer groups claim pending entries XCLAIM"
- "Celery distributed task queue message model acknowledgment"
- "NATS JetStream consumer groups work queue ack mechanism"
- "Kafka consumer groups partition assignment rebalancing claim"
- "BullMQ Redis job queue claim lock mechanism"

## Conflicting evidence
- Stigmergy "cement pheromone" hypothesis (Grasse 1959) vs. later research showing termites use geometric/physical cues, not pheromones, for construction coordination. Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC5474063/ (2026-10-06 fetch). Grasse's original mechanism may be incorrect, but the stigmergy concept (environment-mediated coordination) remains valid.
- Kafka KIP-848 (new consumer group protocol, Kafka 4.0+) vs. classic eager/cooperative rebalance. Different arbitration models coexist; classic protocol still widely used. Source: https://kafka.apache.org/42/operations/consumer-rebalance-protocol/

## Gaps
- No classical system provides exactly-once semantics; all modern queues are at-least-once.
- Blackboard systems (Hearsay-II, BB1) lack explicit claim/lock -- coordination is purely through shared state observation.
- Stigmergy has no arbitration or bounding mechanism beyond environmental physics.
- Linda tuple space has no automatic bounding (unbounded growth possible).
- Contract Net has no timeout on task ownership -- contractor holds task indefinitely once awarded.
