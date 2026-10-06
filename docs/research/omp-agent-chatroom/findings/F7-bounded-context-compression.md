# F7 Bounded context / memory compression

## Angle
How to bound context in a persistent agent chatroom: memory compression systems, progressive summarization, context-rot evidence, and omp's own compaction.

---

## OptMem deep dive (verified from source code)

### What OptMem is
- OptMem is a **permanent memory store for AI agents**, NOT a chat-log summarizer. It persists across sessions, compaction, model and vendor changes. | github.com/VictorTaelin/OptMem README.md | 2026-10-06 | primary | One Python file (`memo`), no dependencies. Installs to `~/.optmem/memo`.
- It is a **memory store**, not a chat-log summarizer. Memories are one-line facts (max 280 bytes), not conversation turns. | /tmp/OptMem/README.md:1-3 | 2026-10-06 | primary | "Permanent memory for AI agents."
- **OptChat repo does NOT exist.** `git clone https://github.com/VictorTaelin/OptChat.git` returns 404. OptChat is a harness spec (gist), not code. | bash git clone attempt + gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449 | 2026-10-06 | primary

### Algorithm (from source code, /tmp/OptMem/memo)

#### Data structures
- **LOG.txt**: append-only, fixed-width records (LOG_REC=320 bytes). Each record: `#<id> <date> <text>`. Never edited. | memo:72, memo:335-350 | 2026-10-06 | primary
- **TREE/<size>**: one file per block size (2,4,8,16...). Fixed-width records (TREE_REC=288 bytes). Each record is a one-line summary of that block. | memo:73, memo:213-214 | 2026-10-06 | primary
- **Position IS identity**: memory `i` lives at offset `i*320` in LOG.txt; block `[k*s,(k+1)*s)` lives at `k*288` in TREE/<s>. O(1) lookup by seeking. No index file. | memo:68-73 | 2026-10-06 | primary

#### Binary merge tree
- A **BLOCK** is an aligned power-of-two range of memories `[lo,hi)`, compressed into one line. Block `[lo,hi)` is the compression of `[lo,mid)` and `[mid,hi)`. | memo:78-80 | 2026-10-06 | primary
- Blocks form a **binary merge tree** over LOG.txt. #0-1, #2-3 exist as one-line summaries; pairs of those as #0-3, etc. | README.md:95-98 | 2026-10-06 | primary
- **Exception:** blocks ≤ RAW_MAX (16) compress directly from raw log, not from two halves. | memo:65, memo:464-477 | 2026-10-06 | primary

#### cover() — the wake-time tiling algorithm
- `cover(T, budget)` returns the blocks `memo wake` prints: at most `budget` of them, finest near T (the present). | memo:105-131 | 2026-10-06 | primary
- **Detail decays with age**: recent memories stay verbatim (block size 1), ancient ones collapse into larger blocks. | memo:106-109 | 2026-10-06 | primary
- If T <= budget, nothing is compressed at all — every memory is printed raw. | memo:112-113 | 2026-10-06 | primary
- Binary search on `alpha` (coarseness parameter). A block is kept whole iff `size <= alpha * (T - lo)` (its age). | memo:82-102, memo:114-121 | 2026-10-06 | primary
- After binary search, leftover budget is spent on the present (largest block near T is split). | memo:124-130 | 2026-10-06 | primary

#### Lazy compression (naps)
- `memo note "..."` appends to LOG.txt and prints a **nap prompt** asking the agent to compress a specific block. Nothing runs in the background. | memo:654-663, README.md:30-31 | 2026-10-06 | primary
- `memo nap <lo>-<hi> "<summary>"` writes the summary to TREE/<size>. Blocks must be built in order (smallest first). | memo:666-692 | 2026-10-06 | primary
- The nap prompt: "Compress memories #lo-hi into one line of at most 280 bytes. Keep what has lasting effect, drop what does not. Invent nothing." | memo:481-486 | 2026-10-06 | primary
- **The LLM does the compression** — the agent itself writes the summary line. OptMem is the tree infrastructure, not the summarizer. | memo:481-486 | 2026-10-06 | primary

#### Wake (reading)
- `memo wake` prints the memory context: at most WAKE_LINES (default 96) lines, oldest first. | memo:584-651 | 2026-10-06 | primary
- If a needed summary is missing, wake **refuses** and prints the nap prompt. The agent must compress before waking. | memo:609-622 | 2026-10-06 | primary
- Output is paginated into parts that fit harness output caps (Claude Code 30K chars, pi 50KB, Codex 10K tokens). | memo:569-581 | 2026-10-06 | primary
- WAKE_LINES=96 ≈ 8k tokens of dense text. | README.md:46 | 2026-10-06 | primary

#### Other commands
- `memo recall <regex>`: searches every memory ever recorded, word for word. Full scan of LOG.txt. | memo:731-759 | 2026-10-06 | primary
- `memo zoom <lo>-<hi>`: opens a tree node into its two halves, down to raw memories. | memo:762-782 | 2026-10-06 | primary
- `memo forget <lo>-<hi>`: drops a bad summary and everything built on it. Next nap rebuilds. Log is never touched. | memo:718-728 | 2026-10-06 | primary

#### Performance claims
- At 1M memories (608 MB), `wake` takes 0.03s. | README.md:55 | 2026-10-06 | primary
- Padding costs ~2x on disk, buys O(1) everywhere. | memo:71 | 2026-10-06 | primary
- "426-token prompt" (the setup block). | README.md:3 | 2026-10-06 | primary

#### Subagent rule
- "If you're a subagent: skip everything above. A subagent must never run `memo`, because it cannot judge what is already known, and its notes would arrive duplicated and incorrectly." | README.md:100-106, memo:536-541 | 2026-10-06 | primary

### OptChat: harness form (spec only, no code)

**What it is:** A harness that **replaces the chat history itself** with an OptMem-like tree. Not a tool the agent calls — the memory IS the chat. Source: `gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449` (fetched 2026-10-06). **No GitHub repo exists.**

**Key differences from OptMem:**
| Aspect | OptMem | OptChat |
|---|---|---|
| Raw compression | Blocks ≤ 16 compress from raw log | Purely binary — every parent from exactly two children |
| Node size | 280 bytes | 512 bytes |
| Context budget | 96 lines (~8k tokens) | 128,000 bytes (~62-64k tokens) |
| Architecture | Agent calls `memo` tool | Harness builds every turn from the tree |
| Block addressing | Position in TREE/<size> file | `id+n` (real message id + span) |
| Concurrency | Single agent, lock file | JOBS=8 concurrent compactor calls |
| Missing summary | `wake` refuses, orders nap | `settle()` waits; placeholder shown but never sent to model |

**Storage:**
- `chat/main/YYYY-MM-DD.jsonl` — one message per line: `{i, kind, text, size, date}`. Kinds: `user`, `talk`, `tool`, `echo`, `note`. (gist §2)
- `tree/YYYY-MM-DD.jsonl` — one node per line: `{l, i, text, size}`. (gist §2)
- Never edit or delete. Append-only. (gist §2)

**The tree:**
- `node(0, i) = message i`, in ≤ NODE bytes. (gist §3)
- `node(l, i) = merge(node(l-1, 2i), node(l-1, 2i+1))`, in ≤ NODE bytes. (gist §3)
- **Free nodes:** if the source already fits in NODE bytes, it IS the node — no model call. (gist §3)
- **Addressing:** node named `id+n` where `id` = first message, `n` = 2^l = span. Agent reads `2184+8` in view, calls `zoom(2184, 8)`. (gist §3)

**The view:**
- A list of tree nodes ("parts") tiling `[0, T)`, oldest first. (gist §5.1)
- Rendered as `<chat> id+n|text ... </chat>`. (gist §5.1)
- **The view never holds a whole message.** Only summaries. Not even the last message. (gist §5.1)
- **Fit():** on new message, append `part(0, i)`, then while `size > VIEW`, merge the most-due pair. (gist §5.2)
- **due = (T - start) / 2^(a.l + 2)** — OptMem's age rule. Merge the pair furthest from the end. (gist §5.2)
- Result: like a binary counter, a line at level `l` changes about once every `2^l` messages. (gist §5.2)

**The compactor:**
- Background "pump" scans all levels, starts every node that's ready, up to JOBS=8 at once. (gist §4.1)
- A node is ready if: not built, not busy, children built, and `end <= first(mem)` (everything before it in the view is already summarized). (gist §4.1)
- Retry: failed node waits RETRY=10s, tried again forever. (gist §4.1)
- Compactor sees: `<chat>` context + the message/two children to compress. (gist §4.2)
- Size enforcement: if over NODE, show the line cut at 512 bytes, ask again. TRIES=5 attempts. Keep shortest try. (gist §4.3)
- Compactor prompt (COMPACT) is verbatim in the spec — 4 priority levels: (1) user's words, (2) lasting effects, (3) findings/open questions/agent replies, (4) intermediate steps. (gist §4.4)

**The turn loop:**
- Each user message starts a **fresh model call** — no conversation carried over. The agent's continuity is the view. (gist §7)
- `settle()`: wait until all view parts are built. No call ever sees an unbuilt placeholder. (gist §6)
- Tools: `zoom(id, n)`, `date(id)`, `spawn(tasks)`, `tell(id, message)`, `computer(task)`. (gist §7.1)
- System prompt: MASTER + VIEW_DOC + user's AGENTS.md. Byte-identical across calls (for caching). (gist §7.2)
- Thoughts (model reasoning) are shown to user but **never logged**. (gist §2)

**Caching:**
- Breakpoints at MARKS = 50k / 80k / 100k chars inside the view. (gist §1)
- System prompt and tools always cached (byte-identical). View mostly cached. (gist §8)
- Consecutive views share 73k chars on average at 20k messages, 92k at 400k messages. (gist §5.4)

**Numeric claims:**
| Claim | Value | Source | Confidence |
|---|---|---|---|
| NODE = 512 bytes | target summary line size | gist §1 | primary |
| VIEW = 128,000 bytes | ≈ 62-64k tokens | gist §1, §5.4 | primary |
| ~500 lines per view | at ~250 bytes/line | gist §3 | primary |
| JOBS = 8 | concurrent compactor calls | gist §1 | primary |
| TRIES = 5 | attempts per node | gist §1 | primary |
| RETRY = 10s | wait before retry | gist §1 | primary |
| CAP = 30,000 chars | max tool result size | gist §1 | primary |
| View share at 20k msgs | 73k chars | gist §5.4 | primary |
| View share at 400k msgs | 92k chars | gist §5.4 | primary |
| "64k tokens for 50 years" | X post claim | X:2105310296482906202 | speculative | No measurement methodology given. |

### X posts (fetched via Tavily extract)

**Post 1: `x.com/VictorTaelin/status/2081453432318132603`** (Jul 26, 2026)
> "every memory solution I tried sucks, so I rolled my own it is a plug and play prompt that gives any agent infinite memory db is an append-only log. compression on the spot (nap, don't sleep). nothing is ever deleted, memory context is constant-sized, details fade with age"

Follow-up replies:
- "to be clear nothing here is novel, it is just that everything else seemed over-engineered or framework-specific, so I hacked my way out" (Jul 26, 2026)
- "Update: just added a command to expand a compressed memory into two larger parts. This lets the agent navigate the memory tree, allowing it to seek and recall information from ages ago, with arbitrary precision." (Jul 26, 2026)

Source: fetched via Tavily extract, 2026-10-06. Confidence: primary.

**Post 2: `x.com/VictorTaelin/status/2105310296482906202`** (Sep 30, 2026)
> "I just replace the chat history of my agent by optmem. Each message I send, and each tool call or answer the agent outputs, becomes one entry of that chat. And it is compressed in a binary tree fashion as explained in the video. So I can keep talking to the agent for years and years and it never uses more than ~64k tokens of its context. And the rest of the context can then be used for useful work. When the agent finishes that turn, and I send the next message, we're back to 64k tokens again. Basically I reserve 64k tokens for the chat history, which is compressed using OptMem's approach, and the rest of the context is what the agent uses to do useful work, every turn. If the agent needs more precise information on some older message, they can just navigate the past chat with the zoom() tool. The agent never calls a 'memo' tool actively because there is no memo tool. OptMem IS the chat already. It happens automatically as I talk to the agent, compressing the full history. Everything that happens is in it, forever, and it only costs 64k tokens of useful context. I could send 10k messages a day, for 50 years, and the most recent messages would still be uncompressed up to 8k tokens. Which is more than enough. Also keep in mind that master agent cannot read/write files, everything it does is delegated to a sub-agent. Reading a file becomes a sub-agent call that brings just the relevant parts. Because the main agent is not meant to do manual work, it is meant to manage sub-agents and to hold the big picture. So basically memory will never be a problem anymore, this gives me a 'master assistant' with full context of my entire life and everything I do, and I'll never have to write '/compact' again, and I'll never have to open multiple Claude Code chats again, and I can talk to it and work from my phone if I want to (because this lives in my local machine). For all I care about I don't even need a MacBook anymore. It is just me talking to that main agent who has full context of my life, it can read emails, clone repos, remind me of all my meetings, in the most optimal way and it just works because context management is not a problem anymore. 64k tokens of OptMem-like chat is all you need for as long as a human lifespan is concerned."

Source: fetched via Tavily extract, 2026-10-06. Confidence: primary.

**Post 3: `x.com/VictorTaelin/status/2106569004454219875`** (Oct 4, 2026)
> "I can't overstate how excited I am about OptChat. It has been the best upgrade to my workflow since GPT 3. Second only to learning VIM. I exported all my past chats to it, and life has been amazing. The convenience of having a single unified log of my entire life, in a way the AI (an..."

Also from search results (same thread):
- "guys I'll create and launch OptChat tomorrow you should use it for 3 reasons: 1. it works 2. it is fucking awesome 3. OpenAI is seemingly using my approach on its products, and you're upset that they're profiting on my ideas" (Oct 4, 2026)
- "finally managed to do something I long wanted to do: a harness that replaces the chat by optmem. i.e., it IS the chat history, rather than an active tool. now I can forever talk to a single unified manager agent, which knows all my life, and has no tools other than spawn" (Sep 30, 2026)
- "I made OptChat my main harness, and then I ask my agent to access Claude or Codex headless (-p flag) from it." (Oct 2026)
- "THE RECIPE gist.github.com/VictorTaelin/9… Ask your agent to build this and ENJOY FREEDOM 🥳" (Oct 4, 2026)

Source: fetched via Tavily search + extract, 2026-10-06. Confidence: primary.

### OptMem/OptChat relevance to chatroom design
- OptMem's binary-tree progressive summarization is directly applicable to a room log: recent messages stay verbatim, older ones collapse into summaries. | [INFERENCE] | 2026-10-06 | speculative | The brief proposes this pattern for the room log.
- The lazy compression model (note → nap prompt → agent compresses) maps to: message appended → compression due → agent summarizes at step boundary. | [INFERENCE] | 2026-10-06 | speculative
- OptChat's "view never holds a whole message" is a radical departure — the model only ever sees summaries. For a chatroom, this would mean agents never see raw history, only compressed views. | [INFERENCE] | 2026-10-06 | speculative
- OptChat's compactor prompt (4 priority levels: user's words > lasting effects > findings/open questions > intermediate steps) is a concrete summarization prompt for room logs. | [INFERENCE] | 2026-10-06 | speculative
- OptMem is a memory store (one-line facts), not a chat-log summarizer. The tree mechanics are transferable, but the use case differs. | [INFERENCE] | 2026-10-06 | speculative

---

## Memory systems survey

### MemGPT / Letta
- MemGPT treats the context window as a scarce working set (like RAM), external stores as longer-term memory (like disk), and agent-directed retrieval/editing/summarization as the paging mechanism. | https://arxiv.org/abs/2310.08560 | 2026-10-06 | primary | Paper: "MemGPT: Towards LLMs as Operating Systems"
- Three memory layers: **Main context** (RAM — system instructions + working context + recent messages), **Recall storage** (conversation log on disk — searchable past messages), **Archival storage** (external — documents/facts retrieved when needed). | https://arxiv.org/abs/2310.08560 | 2026-10-06 | primary
- External memory is NOT automatically part of what the model sees — the agent must use tools to search/retrieve it, then place results into active context. | https://arxiv.org/abs/2310.08560 | 2026-10-06 | primary
- The LLM participates in deciding what to move and retrieve, rather than relying only on a fixed truncation rule. | https://arxiv.org/abs/2310.08560 | 2026-10-06 | primary
- Recursive summary: when the active message queue approaches its limit, a summary in the queue is updated to represent evicted history. This is a compressed, lossy account — NOT the same as archival memory. | https://arxiv.org/abs/2310.08560 | 2026-10-06 | primary
- Letta (production framework): memory blocks = structured, persistent sections prepended to prompt, always visible. Blocks have `label`, `description`, `value`, `limit` (chars). Agents read/write via built-in tools. Agent-managed — multiple agents can share blocks. | https://docs.letta.com/v1-sdk/memory/memory-blocks | 2026-10-06 | primary
- Letta also has MemFS (git-backed memory filesystem) and background "dreaming" that reviews conversations and consolidates lessons. | https://docs.letta.com/v1-sdk/memory/memory-blocks | 2026-10-06 | primary

### Mem0
- Mem0 is a persistent memory layer: extract memories from interactions → store with user/session scope → retrieve relevant memories before model calls → add to prompt. | https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/how-it-works.mdx | 2026-10-06 | primary
- Write (`add`): LLM extracts reusable facts → checks related existing memories → deduplicates → embeds → stores in SQL (facts/metadata) + vector DB (embeddings) + entity store (entities/relationships). | https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/how-it-works.mdx | 2026-10-06 | primary
- Retrieve (`search`): semantic similarity + keyword matching + entity overlap + temporal signals, scoped by user_id/agent_id/app_id/run_id. | https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/how-it-works.mdx | 2026-10-06 | primary
- Mem0g variant adds graph-based memory for relational structures between conversational entities. | https://arxiv.org/abs/2504.19413 | 2026-10-06 | primary
- Paper reports 26% relative improvement in LLM-as-a-Judge over OpenAI, 91% lower p95 latency, >90% token cost savings vs full-context. | https://arxiv.org/abs/2504.19413 | 2026-10-06 | primary | Authors' reported results, not guaranteed for all deployments.
- Current repo describes v3 lifecycle as add-only extraction with explicit update/delete operations. | https://github.com/mem0ai/mem0/blob/main/skills/mem0/references/architecture.md | 2026-10-06 | primary

### Zep / Graphiti
- Graphiti is the open-source graph engine behind Zep's memory system. Stores raw episodes, derives entity-and-fact graph, tracks when facts were true separately from when they were recorded. | https://github.com/getzep/graphiti | 2026-10-06 | primary
- Three layers: **Episodes** (original input), **Entities and facts** (entity nodes + relationship edges), **Communities** (optional groups/summaries). | https://help.getzep.com/v2/understanding-the-graph | 2026-10-06 | primary
- Bi-temporal model: **valid time** (`valid_at`/`invalid_at` — when fact was true in real world) vs **transaction time** (`created_at`/`expired_at` — when system learned/changed it). | https://arxiv.org/abs/2501.13956 | 2026-10-06 | primary | Paper: "Zep: A Temporal Knowledge Graph Architecture for Agent Memory"
- When a new fact supersedes an old one, Graphiti sets old fact's `invalid_at` rather than deleting — preserves historical info for time-aware queries. | https://arxiv.org/abs/2501.13956 | 2026-10-06 | primary
- Ingestion pipeline: record episode → extract entities/facts → resolve against graph → resolve temporal details → check contradictions → persist. | https://github.com/getzep/graphiti/blob/main/graphiti_core/utils/maintenance/edge_operations.py | 2026-10-06 | primary
- Retrieval: hybrid — semantic search + keyword/full-text + graph-aware traversal. Temporal fields distinguish current from historical facts. | https://www.getzep.com/platform/graphiti/ | 2026-10-06 | primary

### LangMem
- LangMem (LangChain's long-term-memory library) works with LangGraph's Store. Not a vector database or chat history store. | https://github.com/langchain-ai/langmem | 2026-10-06 | primary
- Hot path: agent calls `manage_memory`/`search_memory` tools during conversation. Background path: memory manager extracts and consolidates. | https://github.com/langchain-ai/langmem/blob/main/src/langmem/knowledge/__init__.py | 2026-10-06 | primary
- `create_memory_manager(model, ...)` uses LLM to turn messages into structured memory entries (Pydantic schemas control shape). Configurable for inserts, updates, deletes. | https://github.com/langchain-ai/langmem/blob/main/src/langmem/knowledge/extraction.py | 2026-10-06 | primary
- `create_memory_store_manager(...)` combines memory processing with LangGraph `BaseStore`, handling search/storage. Namespaces separate memories by user. | https://github.com/langchain-ai/langmem/blob/main/src/langmem/knowledge/extraction.py | 2026-10-06 | primary
- `create_search_memory_tool(...)` exposes store search to agent. Model decides when to search/manage memories. | https://github.com/langchain-ai/langmem/blob/main/src/langmem/knowledge/tools.py | 2026-10-06 | primary

### Generative Agents (Park et al. 2023)
- Memory stream stores natural-language records of experiences (observations, reflections, plans). | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary | Paper: "Generative Agents: Interactive Simulacra of Human Behavior"
- Retrieval score = weighted sum: `score(m) = α_r·recency(m) + α_i·importance(m) + α_v·relevance(m)`. All three component scores min-max normalized to [0,1]; paper uses all weights = 1. | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary
- **Recency**: exponential decay over simulated game hours, decay factor **0.995**. **Importance**: LLM assigns integer 1–10 at creation time. **Relevance**: cosine similarity between memory and query embeddings. | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary
- **Reflection tree**: when importance scores of recent events sum to > **150**, the system generates a reflection — a higher-level insight inferred from observations. Reflections are stored back as memories with pointers to supporting memories. | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary
- Reflections can use earlier reflections as evidence, forming a **tree**: observations at leaves, increasingly abstract reflections higher up. | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary
- Highest-ranked memories that fit in context are included in prompt. | https://arxiv.org/abs/2304.03442 | 2026-10-06 | primary

### omp compaction
- Compaction rewrites old history into a summary on the current branch. Branch summary captures abandoned branch context during `/tree` navigation. | omp://compaction.md | 2026-10-06 | primary
- Triggers: manual `/compact`, automatic overflow recovery, incomplete-output recovery, threshold maintenance, mid-turn maintenance, idle maintenance. | omp://compaction.md | 2026-10-06 | primary
- Method order: `["remote", "snapcompact", "handoff", "shake", "soft"]`. Remote = provider-native server compaction (OpenAI Responses compact, Anthropic compaction beta). | omp://compaction.md | 2026-10-06 | primary
- **remote**: V2 streaming Responses compaction (OpenAI), V1 native `/responses/compact`, Anthropic on-demand compaction (`compact-2026-09-04` beta). | omp://compaction.md | 2026-10-06 | primary
- **snapcompact**: local deterministic archival — serializes history onto model-aware PNG frames using pixel fonts. No model/API key/network involved. Shape resolves from model id (Claude: `11on16-bw`, Gemini: `8on22-bw`, GPT/Codex: `8on22-bw`). Default max 80 frames. | omp://compaction.md | 2026-10-06 | primary
- **handoff**: generates handoff document via live-cache side-request pipeline, commits as compaction entry on current session. | omp://compaction.md | 2026-10-06 | primary
- **shake**: inline local reduction — replaces eligible tool results and large fenced/XML blocks with recoverable `artifact://` references. Protected recent-token window + minimum-savings threshold. | omp://compaction.md | 2026-10-06 | primary
- **soft**: LLM summarization (default fallback). First compaction uses `compaction-summary.md`; iterative uses `compaction-update-summary.md`; split-turn uses `compaction-turn-prefix.md`. | omp://compaction.md | 2026-10-06 | primary
- Threshold: `compaction.reserveTokens` default = `max(floor(contextWindow × 0.15), 16384)`. `compaction.keepRecentTokens` = 20000. | omp://compaction.md | 2026-10-06 | primary
- Async (speculative) compaction: when context enters pre-threshold band `[threshold − lead, threshold)` (lead = `clamp(threshold × 0.125, 8192, 32000)`), background summarization starts off branch snapshot. Armed result committed instantly when threshold crossed. | omp://compaction.md | 2026-10-06 | primary
- Pre-compaction pruning: protects newest 40K tool-output tokens, requires ≥20K savings, never blanks below 50 tokens. Replaces with `[Output truncated - N tokens]`. | omp://compaction.md | 2026-10-06 | primary
- Useless-result elision: tools flag contextually useless results (zero-match search, wait safety cap) → blanked to `[Uneventful result elided]`. | omp://compaction.md | 2026-10-06 | primary
- File-operation context: compaction tracks cumulative `readFiles`/`modifiedFiles` from tool calls, rendered as grouped directory tree capped at 20 files. | omp://compaction.md | 2026-10-06 | primary
- Experimental context management (`compaction.experimentalContextManagement`): replaces auto summary recompression with local context-window boundaries. `context_notes` tool for persistent notebook (limited to 16,384 UTF-8 bytes), `new_context` for rollover without summarization. `history://current/full` for raw history retrieval. | omp://compaction.md | 2026-10-06 | primary
- Branch summarization: tied to `/tree` navigation. Abandoned branch entries summarized and attached at navigation target. Token budget = `(model.contextWindow || 128000) - branchSummary.reserveTokens`. | omp://compaction.md | 2026-10-06 | primary
- **What survives compaction**: summary + kept messages from `firstKeptEntryId` forward + file-operation lists (capped at 20 files) + branch summaries + custom messages + snapcompact archive + provider-native replay payloads. | omp://compaction.md | 2026-10-06 | primary

### omp memory backends
- Five modes: `off`, `local`, `hindsight`, `mnemopi`, `sharpshooter`. Memory disabled by default. | omp://memory.md | 2026-10-06 | primary
- **local**: project-scoped summaries/lessons from persisted sessions. Two-phase: per-session extraction → cross-session consolidation. Produces `MEMORY.md`, `memory_summary.md`, `skills/`. Injected at session start as Memory Guidance block. | omp://memory.md | 2026-10-06 | primary
- **hindsight**: remote bank-scoped Hindsight memory. Auto-recall on first model turn, auto-retain every 3 user turns. Bank scoping: `per-project-tagged`, `per-project`, `global`. | omp://memory.md | 2026-10-06 | primary
- **mnemopi**: local Mnemopi SQLite memory. FTS + embedding recall. Scoping: `global`, `per-project`, `per-project-tagged`. Auto-recall on first turn, auto-retain every 4 turns. `recallLimit` = 8, `injectionTokenLimit` = 5000. | omp://mnemosyne-memory-backend.md | 2026-10-06 | primary
- Mnemopi recall: content preview capped at 500 chars. Full row via `read memory://<memory-id>`. Polyphonic recall fuses vector, graph, fact, and temporal voices. | omp://mnemosyne-memory-backend.md | 2026-10-06 | primary
- Mnemopi consolidation: `sleepAllSessions` selects unconsolidated working-memory rows older than `Math.floor(workingMemoryTtlHours / 2)` hours (12 hours with default 24-hour TTL). | omp://mnemosyne-memory-backend.md | 2026-10-06 | primary
- `memory.summaryInjectionTokenLimit` = 5000 (shared cap for summary + lessons injected into system prompt). | omp://memory.md | 2026-10-06 | primary
- `memories.maxRolloutAgeDays` = 30, `memories.maxRolloutsPerStartup` = 64, `memories.stage1Concurrency` = 8. | omp://memory.md | 2026-10-06 | primary

### omp context files
- Auto-discovered Markdown instruction files injected into agent's project context. | omp://context-files.md | 2026-10-06 | primary
- Native: `~/.omp/agent/AGENTS.md` (user) + `<nearest-non-empty-ancestor>/.omp/AGENTS.md` (project). | omp://context-files.md | 2026-10-06 | primary
- Foreign: `.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.gemini/GEMINI.md`, `.github/copilot-instructions.md`, etc. | omp://context-files.md | 2026-10-06 | primary
- `RULES.md` = sticky always-apply rule (carried on every request, never demoted). | omp://context-files.md | 2026-10-06 | primary
- `@` imports expand inline (up to 5 hops, cycles skipped). | omp://context-files.md | 2026-10-06 | primary

### omp retain/recall tools
- `retain`: stores durable facts through active memory backend. For Mnemopi: `rememberScoped()` with `importance: 0.75`, `extract: true`, `extractEntities: true`, `veracity: "tool"`, `memoryType: "fact"`. For Hindsight: queued batch write. | omp://tools/retain.md | 2026-10-06 | primary
- `recall`: searches active memory backend. For Mnemopi: `recallEnhanced(query, recallLimit, { includeFacts: true, channelId: bank })`, merges/deduplicates, sorts, truncates to `recallLimit`. For Hindsight: `POST /v1/default/banks/{bank_id}/memories/recall`. | omp://tools/recall.md | 2026-10-06 | primary
- `reflect`: synthesizes answer across recalled memories. | omp://tools/recall.md | 2026-10-06 | primary
- `memory_edit`: update, forget, or invalidate an editable memory by ID. | omp://mnemosyne-memory-backend.md | 2026-10-06 | primary
- Auto-retain: Hindsight every 3 user turns, Mnemopi every 4 user turns. | omp://tools/retain.md | 2026-10-06 | primary

### omp compress command
- `omp compress` rewrites text files into dense prompt register. One agent per file, two tools each (`rewrite` + `approve`). | ~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/compress/index.ts | 2026-10-06 | primary
- Protocol: agent submits draft with `rewrite` (complete text + declared losses). Command replies with measured size and losses, asks for verdict. Agent resubmits or calls `approve`. Only approved draft is written. | compress/protocol.ts | 2026-10-06 | primary
- Loss declaration: every draft must declare what it dropped (`content` + `reason`). Empty losses only when nothing dropped. | compress/protocol.ts | 2026-10-06 | primary
- Metrics: source vs draft word/token counts, reduction ratio. Default max 3 rounds, concurrency 4. | compress/index.ts:26-27 | 2026-10-06 | primary
- Session isolation: no extensions, no MCP, no file/shell access. Only the two protocol tools. | compress/session.ts | 2026-10-06 | primary

---

## Context-rot / long-context evidence

### Lost in the Middle (Liu et al., TACL 2024)
- U-shaped performance curve: models use relevant info best at beginning (primacy) or end (recency), worst in middle. | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | GPT-3.5-Turbo, Claude-1.3, MPT-30B-Instruct, LongChat-13B tested on multi-doc QA and KV retrieval
- GPT-3.5-Turbo drops >20% when relevant info in middle vs. edges; in 20-30 doc settings, performance falls below closed-book baseline (56.1%). | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | Figure 5, Table 1
- Extended-context models not necessarily better: GPT-3.5-Turbo (4K) and GPT-3.5-Turbo-16K nearly identical performance when context fits both. | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | §2.3
- Encoder-decoder models (Flan-UL2) robust within training length (1.9% best-worst gap) but U-shaped beyond training length. | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | §4.1, Figure 8
- Query-aware contextualization (query before AND after docs) enables near-perfect KV retrieval but minimally changes multi-doc QA trends. | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | §4.2
- Diminishing returns from more retrieved docs: 50 docs vs 20 docs only ~1.5% improvement for GPT-3.5-Turbo, ~1% for Claude-1.3. | https://arxiv.org/abs/2307.03172 | 2026-10-06 | primary | §5

### NoLiMa (Modarressi et al., ICML 2025)
- 13 models claiming ≥128K context tested; at 32K tokens, 11/13 drop below 50% of short-context baseline. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | Table 3
- GPT-4o: 99.3% base → 69.7% at 32K (best performer). | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | Table 3
- Llama 3.1 70B: 94.5% base → 42.7% at 32K; effective length only 2K. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | Table 3
- Llama 3.3 70B: 97.3% base → 42.7% at 32K; effective length 2K. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | Table 3
- Gemini 1.5 Pro: 92.6% base → 48.2% at 32K; effective length 2K. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | Table 3
- Two-hop reasoning harder than one-hop; gap widens with context length. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | §4.4.1, Figure 2(a)
- Inverted word order harder than default due to causal attention weakening in long contexts. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | §4.4.1, Figure 2(b)
- CoT prompting improves performance but fails to fully mitigate beyond 16K tokens. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | §4.4.3
- GPT-4o at 128K: still maintains >50% of base score; Gemini 2.0 Flash at 128K: drops to 16.4%. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | §4.4, Appendix E
- Lost-in-the-middle effect confirmed in non-lexical setting: performance dips at middle positions in 32K context. | https://arxiv.org/abs/2502.05167 | 2026-10-06 | primary | §4.4.2, Figure 3

### Chroma Context Rot (Hong et al., July 2025)
- 18 LLMs evaluated (GPT-4.1, Claude 4, Gemini 2.5, Qwen3, etc.); performance degrades with input length even on simple tasks. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Technical report
- NIAH passes but real tasks fail: near-perfect NIAH scores do not predict performance on semantic/distractor tasks. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Introduction
- Distractors have non-uniform impact; impact amplifies as input length grows. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Impact of Distractors section
- Claude models most conservative (lowest hallucination, tend to abstain); GPT models highest hallucination rates. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Distractor failure analysis
- Shuffled haystacks (no logical flow) consistently outperform structured haystacks across all 18 models — counterintuitive. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Haystack Structure section
- LongMemEval: focused prompts (~300 tokens) vs full (~113K tokens) — significant performance gap across all model families. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | LongMemEval section
- Repeated Words task: even trivial replication degrades with length; GPT-3.5 Turbo refused 60.29% of tasks. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Repeated Words section
- Claude Opus 4 refusal rate 2.89%; Qwen3-8B refusal rate 4.21%; GPT-4.1 refusal rate 2.55%. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Repeated Words section
- Needle-question similarity: lower similarity → faster degradation with length. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Needle-Question Similarity section
- 69 out of 194,480 total LLM calls (0.035%) resulted in refusal. | https://www.trychroma.com/research/context-rot | 2026-10-06 | primary | Details section

### Context Length Alone Hurts (Du et al., EMNLP 2025)
- Performance drops 13.9%–85% as input length increases even with perfect retrieval (100% exact match). | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | Abstract
- Llama-3.1-8B: 970/1000 MMLU problems retrieved perfectly at 30K tokens, but accuracy drops 24.2% vs. short-context. | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §3.2
- Degradation occurs even when irrelevant tokens replaced with whitespace (minimal distraction). | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §4.1
- Degradation occurs even when all distractions masked — model attends only to evidence and question. | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §4.2, Table 3
- Degradation occurs even when evidence placed immediately before question (best possible position). | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §4.1, Figure 4(b)
- Mitigation: retrieve-then-reason (recite evidence, then solve) improves GPT-4o up to 4% on RULER; Mistral up to 31.2% on GSM8K. | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §5, Tables 4–5
- Closed-source models (GPT-4o, Claude-3.5, Gemini) more robust than open-source but still degrade. | https://aclanthology.org/2025.findings-emnlp.1264/ | 2026-10-06 | primary | §4.1, Table 2

### RULER (Hsieh et al., COLM 2024)
- 17 long-context models tested; only ~half maintained satisfactory performance at 32K tokens. | https://arxiv.org/abs/2404.06654 | 2026-10-06 | primary | Abstract
- Performance generally fell as context length and task complexity increased. | https://arxiv.org/abs/2404.06654 | 2026-10-06 | primary | Abstract

### HELMET (ICLR 2025)
- 59 long-context models across 7 application-oriented categories; strong needle-test scores do not reliably predict downstream performance. | https://proceedings.iclr.cc/paper_files/paper/2025/hash/f5332c8273d02729730a9c24dec2135e-Abstract-Conference.html | 2026-10-06 | primary | Abstract

### Found in the Middle (Google Research, 2024)
- U-shaped attention bias: tokens at beginning and end receive higher attention regardless of relevance. | https://research.google/pubs/found-in-the-middle-calibrating-positional-attention-bias-improves-long-context-utilization/ | 2026-10-06 | primary | Abstract
- Calibration mechanism improves RAG performance by up to 15 percentage points. | https://research.google/pubs/found-in-the-middle-calibrating-positional-attention-bias-improves-long-context-utilization/ | 2026-10-06 | primary | Abstract

### LoCoMo (Maharana et al., ACL 2024)
- Conversations average ~600 turns, ~16K tokens, up to 32 sessions; long-context models and RAG help but remain well below human performance. | https://aclanthology.org/2024.acl-long.747/ | 2026-10-06 | primary | Abstract

### Compaction / Compression Effectiveness
- RECOMP: compression rates as low as 6% with minimal performance loss on evaluated tasks. | https://proceedings.iclr.cc/paper_files/paper/2024/hash/bda88ed2892f5e61c9a9bf215c566913-Abstract-Conference.html | 2026-10-06 | primary | ICLR 2024
- StreamingDialogue: 4× speedup, 18× lower memory use vs. dense attention recomputation. | https://papers.nips.cc/paper_files/paper/2024/hash/9c43057f39d49b8b5c989cc1aac70ab7-Abstract-Conference.html | 2026-10-06 | primary | NeurIPS 2024
- Compressed Context Memory: 5× smaller context-memory footprint, matches full-context performance. | https://proceedings.iclr.cc/paper_files/paper/2024/hash/97dc07f1253ab33ee514f395a82fa7cc-Abstract-Conference.html | 2026-10-06 | primary | ICLR 2024
- Recursive summarization improves long-term dialogue memory but is lossy; results depend on what is remembered and how memory is organized. | https://www.sciencedirect.com/science/article/abs/pii/S0925231225008653 | 2026-10-06 | primary | Neurocomputing 2025

---

## Searches
- "VictorTaelin OptMem x.com status 2081453432318132603" (web_search)
- git clone https://github.com/VictorTaelin/OptMem.git
- git clone https://github.com/VictorTaelin/OptChat.git (404)
- "MemGPT Letta memory architecture paging main context external archival recursive summary arXiv 2310.08560" (web_search)
- "Mem0 memory layer architecture mechanism source code arXiv paper" (web_search)
- "Zep Graphiti temporal knowledge graph memory mechanism architecture" (web_search)
- "LangMem memory mechanism LangChain source code" (web_search)
- "generative agents Park 2023 memory stream retrieval scoring recency importance relevance reflection tree arXiv 2304.03442" (web_search)
- "arXiv 2307.03172 Lost in the Middle long context LLM" (web_search)
- "arXiv 2502.05167 NoLiMa long context benchmark" (web_search)
- "trychroma.com context rot technical report long context LLM degradation" (web_search)
- "LLM context window degradation attention dilution compaction effectiveness paper 2024 2025" (web_search)
- "LLM effective context window study degradation beyond claimed context length 2024 2025" (web_search)
- "LLM context compaction summarization conversation memory effectiveness paper 2024 2025" (web_search)
- Tavily extract: x.com/VictorTaelin/status/2081453432318132603, /2105310296482906202, /2106569004454219875
- Tavily extract: gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449

## Conflicting evidence
- Chroma Context Rot finds shuffled haystacks outperform structured ones (counterintuitive); no other paper tests this directly — unclear if generalizable or artifact of specific setup.
- Context Length Alone Hurts shows closed-source models more robust than open-source; NoLiMa shows GPT-4o as best performer but still degrades significantly — relative robustness varies by benchmark and task.
- NoLiMa effective lengths (≤2K for most models) are far shorter than RULER effective lengths (up to 32K for some models) — different benchmarks yield very different effective-length estimates; not directly comparable.
- OptMem README says "426-token prompt" but actual TEMPLATE in source is longer by most tokenizers. [INFERENCE] 426 may be from earlier version or specific tokenizer.
- OptChat "64k tokens for 50 years" (X post) vs VIEW = 128,000 bytes ≈ 62-64k tokens (gist). Consistent but "50 years" claim has no measurement methodology.
- OptMem "nothing is ever deleted" (X post, README) vs `forget` command exists. `forget` drops summaries but never touches LOG.txt. Raw memories never deleted, but summaries can be rebuilt.

## Gaps
- No OptChat reference implementation exists. The gist is a spec, not code. All OptChat claims are from the spec document, not from running code.
- No benchmark data for OptChat. "73k chars shared at 20k messages" claim is from spec, with no methodology or raw data.
- OptMem test suite uses a fake compressor. No real LLM compression quality testing. 0.03s wake claim is for storage layer, not full system with LLM calls.
- No multi-agent OptMem/OptChat testing. Both are single-agent designs. The brief's room log use case (multiple agents writing to one log) is untested.
- OptChat compactor prompt quality unverified. Spec says "This prompt took many iterations" but no before/after data.
- Token counts are estimates. "96 ≈ 8k tokens" and "128,000 bytes ≈ 62-64k tokens" depend on tokenizer. No specific tokenizer named for OptMem. Gist says "Opus-class tokenizers" for OptChat.
- Mem0 benchmark results are author-reported; no independent verification found.
- Graphiti temporal fields rely on LLM extraction; mistaken extraction can produce wrong validity intervals. No accuracy benchmark found.
- LangMem background manager mechanism documented but not deeply verified from source.
- omp compress is a file compression tool, not a conversation compression tool — its applicability to room logs is inferential.
- No paper directly tests context-rot in multi-agent chatroom settings (multiple agents sharing a persistent room with chat + claim board + blackboard).
- No paper quantifies the optimal compaction threshold for conversational contexts — when to compact, how much to compact, what to preserve.
- No paper tests whether structured memory (claim board, blackboard) outperforms flat conversation history under context pressure.
- Effective-length estimates vary wildly across benchmarks (NoLiMa: ≤2K; RULER: up to 32K) — no consensus on how to measure practical context capacity.
- Compaction papers (RECOMP, StreamingDialogue, Compressed Context Memory) test retrieval/KV compression, not conversational summary compaction — gap between compression research and dialogue memory research.
- No paper tests whether retrieve-then-reason mitigation works in multi-turn agent conversations (only tested on single-turn QA/math/coding).
