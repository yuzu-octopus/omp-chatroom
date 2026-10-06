# F20 — Multi-writer hierarchical summarisation

Merged from workers `F20-W1.md` (OptMem/OptChat re-read), `F20-W2.md` (multi-agent prior art),
`F20-W3.md` (Merkle/CDC/transparency logs), `F20-W4.md` (single-writer requirement).
Round 4, addendum B, angle 14. All fetches 2026-10-06 unless stated. Local sources are pinned
files, not URLs: `/tmp/OptMem/memo` (859 lines), `/tmp/OptMem/README.md`, `/tmp/OptMem/test.py`,
`/tmp/optchat.md` (777 lines, the OptChat gist body).

## Angle

The brief proposes a **two-region** room store: a raw hot tail every member reads verbatim, and a
compressed binary tree over the cold backlog that a late joiner reads as a bounded view and can
`zoom(lo,hi)` to descend. Round 1 had rejected "the tree as the room log" on the grounds that
OptChat's view never holds a whole message. This angle asks the questions that inversion raises:

1. How do OptMem and OptChat *actually* implement raw-vs-compressed regions, and is either already
   two-region?
2. Does any multi-agent system compress a **shared** log hierarchically?
3. What do Merkle trees, content-defined chunking, and transparency logs contribute to an
   append-only summarised log?
4. Must a summariser be **single-writer by construction**, or is that incidental to OptMem/OptChat?

The load-bearing answer: **OptMem is already a two-region design, and it is already multi-writer.**
Its `cover()` returns raw singletons near the present and compressed blocks far from it
(`memo:105-131`), and its tree is written by *any* process under a per-operation `flock`, with
concurrent nappers handled by a compare-and-append on a per-level dense prefix
(`memo:353-369`, `test.py:362-368`, `test.py:452-466`). What must be single-valued is the **node for
a range**, not the writer.

---

## Claims

### 1. OptMem is already two-region; `cover()` is the mechanism

- [F20.1] `_cover(T, alpha)` tiles `[0,T)` with aligned power-of-two blocks, keeping a block whole
  iff `size <= alpha * (T - lo)` (its age). Larger alpha = coarser = fewer lines. — source:
  `/tmp/OptMem/memo:82-102` — confidence: high
- [F20.2] `cover(T, budget)` binary-searches alpha in `[0,1]` for 60 iterations and then, if the
  tiling undershoots the budget, repeatedly splits the largest block until the budget is reached
  ("spend what is left on the present, where detail is worth most"). — source:
  `/tmp/OptMem/memo:105-131` — confidence: high
- [F20.3] Consequence: near T blocks are size 1 (raw memories printed verbatim); far from T they are
  large summaries. If `T <= budget`, the cover is **all raw** — `[(i,i+1) for i in range(T)]` — i.e.
  compression is skipped entirely when everything fits. — source: `/tmp/OptMem/memo:112-113` —
  confidence: high
- [F20.4] `wake` renders a cover directly: a size-1 block prints `#i <raw memory>` via `log_get`; a
  larger block prints `#lo-hi <summary>` via `tree_get`. This is literally a raw-hot-tail +
  compressed-cold-tail read path in the existing tool. — source: `/tmp/OptMem/memo:604-628` —
  confidence: high
- [F20.5] The test suite asserts the two-region property directly: `cover(300, 320)` must equal all
  singletons ("under budget, memory should be verbatim"), every cover must tile `[0,T)` with no gap
  or overlap, every block must be an aligned power of two, and block sizes must be non-increasing
  toward the present ("detail does not increase toward the present"). — source:
  `/tmp/OptMem/test.py:60-75` — confidence: high

### 2. `RAW_MAX=16` is OptMem's raw/compressed seam

- [F20.6] `RAW_MAX = 16` — "blocks up to this many memories compress from the raw log". In
  `nap_prompt`, a block with `hi-lo <= RAW_MAX` is fed the **raw memories** (`log_slice`); a larger
  block is fed its **two halves' summaries** (`tree_get`). — source: `/tmp/OptMem/memo:65,463-477` —
  confidence: high
- [F20.7] So OptMem's compression is raw → ≤16-summary → larger summaries-of-summaries. The seam is
  a quality/faithfulness tradeoff, not a storage one. `RAW_MAX` is a module constant, **not** in
  `KNOBS`, so it is not tunable per memory. — source: `/tmp/OptMem/memo:50-65` — confidence: high
- [F20.8] OptChat dropped this seam: "The tree is purely binary. (OptMem built small blocks of up to
  16 memories straight from the raw notes, and only bigger ones from two halves. That had no real
  justification and made the structure confusing; OptChat dropped it. Every parent comes from exactly
  its two children.)" — source: `/tmp/optchat.md:145-148` — confidence: high
- [F20.9] OptChat's §11 mistake list re-asserts it: "Hybrid trees (raw blocks of 16, etc.). Keep it
  purely binary." — source: `/tmp/optchat.md:777` — confidence: high

### 3. The `nap` model: lazy, agent-triggered, and *blocking on read*

- [F20.10] Nothing in OptMem runs in the background. "Merges arrive one at a time, in the output of
  `note`. Nothing ever runs in the background." `next_nap(d,T)` returns the smallest pending block's
  prompt; it is printed after `note`, after `nap`, and at the end of `wake`. — source:
  `/tmp/OptMem/README.md:30-31`, `/tmp/OptMem/memo:489-494,649-651,661-663,688-692` — confidence: high
- [F20.11] `wake` **refuses with exit 1** when a block the view needs is unbuilt, printing the nap
  prompt. The comment names the design rule: "The ONLY reason to refuse: this document cannot be
  written without that summary. Work that the document does not need is handed over after the read
  instead, costing no round trip." — source: `/tmp/OptMem/memo:609-622` — confidence: high
- [F20.12] So compaction is *non-blocking as a background process* (there is none) but *blocking on
  read*: an agent cannot wake without first paying the compression. — source:
  `/tmp/OptMem/memo:609-622` — confidence: high
- [F20.13] `wake` re-checks `tree_get` after the refusal path because a parallel session may have
  paid the block in the meantime. — source: `/tmp/OptMem/memo:623` — confidence: high
- [F20.14] OptChat is the opposite: a background pump runs up to `JOBS=8` compactor calls, and the
  turn loop `settle()`s — waits until every view part is built — before a call starts. "No call ever
  sees that placeholder." — source: `/tmp/optchat.md:89,176-216,503-506` — confidence: high

### 4. `zoom` and `forget`: exact semantics

- [F20.15] `zoom(lo,hi)` parses a real block id (`block_id` enforces aligned power-of-two, `n>=2`),
  computes `mid`, and prints each half: raw via `log_get` if `b-a==1`, else the summary via
  `tree_get`, else the literal string `not compressed yet`. Halves beyond `T` are omitted. — source:
  `/tmp/OptMem/memo:762-782,407-419` — confidence: high
- [F20.16] `forget(lo,hi)` calls `tree_drop`, which truncates **every level file from `lo//size`
  upward** for `size = hi-lo, 2*(hi-lo), ...` — dropping the target *and every ancestor*, plus later
  blocks at those levels. The log is never touched; the next `nap` rebuilds. — source:
  `/tmp/OptMem/memo:372-389,718-728` — confidence: high
- [F20.17] Invariant, asserted by tests: `forget` shrinks TREE and leaves LOG.txt byte-identical;
  `wake` then refuses until rebuild; rebuilding restores the tree to its original size. — source:
  `/tmp/OptMem/test.py:356-361,382-384` — confidence: high
- [F20.18] Detection of a bad node is **not** by hash: it is a `UnicodeDecodeError` ("The summary of
  #a-b is corrupt. Run: forget") or a blank record, and a blank half makes `nap` point at
  `forget a-b`. — source: `/tmp/OptMem/memo:288-292,624-628,466-477`;
  `/tmp/OptMem/test.py:492-506,527-540` — confidence: high

### 5. Is OptMem single-writer? **No — it is multi-writer, by per-operation lock + compare-and-append**

- [F20.19] `locked(d)` takes an **exclusive `fcntl.flock`** (or `msvcrt.locking` with spin/backoff on
  Windows) on `.lock`. It is acquired and released **per operation** by `log_append`, `tree_put`, and
  `tree_drop` — not held for the life of the process. — source: `/tmp/OptMem/memo:302-350,353-369,
  372-389` — confidence: high
- [F20.20] Multi-writer is documented and intended: "Parallel sessions on this machine are all you,
  and may all write memories." Ids are assigned **inside** the lock: "two sessions noting at the same
  moment must not be handed the same id." — source: `/tmp/OptMem/memo:536-541,335-338` —
  confidence: high
- [F20.21] The test suite runs **16 real processes** appending concurrently and asserts all 16 notes
  survive with distinct, contiguous ids `#0..#15` — i.e. cross-process multi-writer is a *tested*
  property, not a hope. — source: `/tmp/OptMem/test.py:450-466` — confidence: high
- [F20.22] **The key mechanism.** `tree_put` writes an *append-only dense prefix* to the level file
  for a block size and refuses unless the file length already equals `lo // size`:
  `if count(p, TREE_REC) != lo // size: return False`. A concurrent loser gets
  "`lo-hi` was settled or forgotten meanwhile." — source: `/tmp/OptMem/memo:353-369,683-687` —
  confidence: high
- [F20.23] The test suite asserts exactly this concurrent case: "a settled block cannot be rewritten.
  Resubmitting one (two sessions paid the same nap) is not an error: say it is settled, write
  nothing" — and checks the tree size did not change. It also asserts an out-of-order nap
  (`0-31` before its halves) is rejected with "Wrong block". — source: `/tmp/OptMem/test.py:362-373`
  — confidence: high
- [F20.24] Therefore: **OptMem's summariser need not be a single writer.** Any number of processes
  may attempt a nap; the store serialises *node identity* via a length check on an ordered append,
  which is a compare-and-append / CAS on a dense prefix. The lock protects record alignment
  (fixed-width `LOG_REC=320`, "position IS identity"), not summariser uniqueness. — source:
  `/tmp/OptMem/memo:68-73,302-369`; `/tmp/OptMem/test.py:362-373,450-466` — confidence: high
- [F20.25] OptChat, by contrast, is **single-writer for the life of the process**: a Unix-socket
  lock; "a second process that can connect to it exits"; a stale socket is taken over. This is
  because OptChat's tree is *never recomputed* ("it costs model calls to rebuild, so it is stored and
  never recomputed") and its view must be a stable, cacheable tiling. — source:
  `/tmp/optchat.md:120-127` — confidence: high
- [F20.26] `fit()` merges the most-due adjacent pair (`due = (T-start)/2^(l+2)`) until the view fits
  `VIEW`, and "Never split" — the view only appends at the end and coarsens. This is what makes the
  view cacheable, and it is *why* OptChat cannot tolerate two writers. — source:
  `/tmp/optchat.md:414-442` — confidence: high
- [F20.27] OptChat's own mistake list item 13: "Writing without fsync, or letting two processes write
  the same log." — source: `/tmp/optchat.md:775` — confidence: high

### 6. Why a subagent must never run `memo` — and why it is *not* a concurrency rule

- [F20.28] Exact text: "If you're a subagent: skip everything above. Parallel sessions on this
  machine are all you, and may all write memories. A subagent is not: it must never run `memo`,
  because it cannot judge what is already known, and its notes would arrive duplicated and
  incorrectly. When you spawn one, write: `You are a subagent. Don't run memo.`" — source:
  `/tmp/OptMem/memo:536-541`; `/tmp/OptMem/README.md:100-106` — confidence: high
- [F20.29] The stated reason is **semantic, not mechanical**: a subagent lacks the parent's context
  so it cannot judge novelty, and its notes would duplicate/pollute. Parallel *sessions of the same
  agent* are "all you" and are explicitly allowed to write concurrently. — source:
  `/tmp/OptMem/memo:536-541` — confidence: high
- [F20.30] OptChat reaches the same place differently: subagents "stay in their own session, NOT in
  the main log (only the master's chat is the memory)"; their reports arrive as ONE `user`-kind
  message. The shared tree therefore has exactly one *author*, even though it has many contributors.
  — source: `/tmp/optchat.md:690-724` — confidence: high

### 7. Does any multi-agent system compress a shared log hierarchically? **No.**

- [F20.31] **Verdict: no system found that hierarchically compresses a shared multi-agent log.**
  Across framework docs/source (AutoGen, LangGraph, CrewAI, CAMEL, MetaGPT, AgentVerse, ChatDev,
  Agno, Letta, OpenAI Swarm), production memory layers (Letta/MemGPT, Mem0, Zep/Graphiti), and
  MAS-memory papers (G-Memory, MIRIX, HMARS, DeALOG, DeLM, Agentsensus, AOI, Ensemble QSP,
  AutoWorldBuilder), every deployed *shared* log is either unbounded, bounded by flat rolling/one-shot
  summarisation, or compressed non-hierarchically (dedup, graph selection, KV/latent compression).
  — sources: `F20-W2.md` §A–F; survey https://github.com/YerbaPage/Awesome-Agent-Context-Compression
  (fetched 2026-10-06) — confidence: high (absence claim: ~20 searches + ~40 primary fetches)
- [F20.32] AutoGen shared memory is "pass the same memory instance to multiple agents"; its memory
  API is store/retrieve and is "not itself a built-in conversation summarizer". Context limiting is
  buffer/head-tail/token selection, "not semantic summarization". — source:
  https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html (fetched
  2026-10-06) — confidence: high
- [F20.33] LangGraph shared state is a user-defined `messages` list; summarisation is an application
  pattern ("you decide when to summarize"), and checkpoints are documented to grow unboundedly and
  need manual pruning. — source: https://docs.langchain.com/oss/python/langgraph/persistence (fetched
  2026-10-06) — confidence: high
- [F20.34] Letta/MemGPT compaction is a **flat replacement** of in-context history (modes `all`,
  `sliding_window`, self-compaction); shared blocks are "update once, visible everywhere" but "shared
  memory lets multiple agents access common information; it doesn't mean their conversation threads
  are merged." — sources: https://docs.letta.com/api/resources/conversations/subresources/messages/methods/compact,
  https://docs.letta.com/v1-sdk/memory/shared-memory (fetched 2026-10-06) — confidence: high
- [F20.35] Zep: "There is one summary per thread, and it is persisted ... generated and updated
  automatically as new messages arrive" — one flat summary per thread, no level above it, no upward
  merge. — source: https://help.getzep.com/thread-summaries (fetched 2026-10-06) — confidence: high
- [F20.36] CrewAI/MetaGPT: no semantic rolling group-transcript summariser; MetaGPT memory "stores
  messages and retrieves all or the most recent k by recency". CAMEL has "No global board"; bounding
  is `ScoreBasedContextCreator(token_limit)`. ChatDev bounds by *segmentation* (short-term = one
  phase's utterances; long-term = extracted solutions `M~^i = τ(M^j)`), one flat extraction step per
  phase — not a hierarchy. — sources: https://docs.crewai.com/core-concepts/Agents,
  https://docs.deepwisdom.ai/main/en/guide/tutorials/use_memories.html, `F6-blackboard-claimboard.md:50-61`,
  https://arxiv.org/abs/2307.07924 (fetched 2026-10-06) — confidence: high
- [F20.37] AgentScope's `MsgHub` broadcasts into a shared history; "if that formatted history exceeds
  the token limit, built-in formatters truncate older messages; that is not summarization." —
  source: https://doc.agentscope.io/tutorial/task_agent.html (fetched 2026-10-06) — confidence: high
- [F20.38] **G-Memory (NeurIPS 2025)** is the closest "hierarchical MAS memory" claim, but its
  three-tier hierarchy (insight/query/interaction graphs) is over **cross-trial collaboration
  experience**, retrieved by traversal — not a compression of the live shared transcript, and it does
  not give a late joiner a bounded tiled view. — source: https://arxiv.org/abs/2506.07398 (fetched
  2026-10-06) — confidence: high
- [F20.39] **HMARS** is a retrieval hierarchy (sub-agent bounded regions → mid-agent regional
  context → frontier reasoning over retrieved evidence pages), i.e. routing/expansion, not a merge
  tree of summaries. **AOI / Ensemble QSP / AutoWorldBuilder** are context-budgeting/eviction
  hierarchies, not log trees. — sources: https://arxiv.org/abs/2606.28349,
  https://arxiv.org/abs/2512.13956, https://arxiv.org/abs/2607.07666, https://arxiv.org/abs/2607.09403
  (fetched 2026-10-06) — confidence: medium (abstract-level verification)
- [F20.40] **DeLM (Stanford)** is the strongest *shared-log* hit: "a shared context and a task queue",
  an append-only log of typed entries (FACT/FAIL/DONE) that "stay brief and attach files by reference,
  so the log stays under 15K tokens even with four agents." But compression is a flat per-entry gist
  bounded by authoring discipline — no tree, no descent. Its own conclusion: "Coordination, not
  parallelism or CRDT-merge, bears the load." — sources: https://arxiv.org/abs/2606.10662,
  https://raw.githubusercontent.com/yuzhenmao/DeLM/main/board/shared_context.py (fetched 2026-10-06)
  — confidence: high
- [F20.41] **DeALOG** does use "a shared natural-language log as persistent memory", but the log is
  not size-bounded or compressed; a Summarizing agent proposes answers, it does not maintain a tree.
  — source: https://arxiv.org/abs/2602.00996 (fetched 2026-10-06) — confidence: high
- [F20.42] **RAPTOR** and **HAT** build genuine recursive summary trees, but over a static retrieval
  corpus and a single conversation respectively — no shared/multi-agent dimension. — sources:
  https://arxiv.org/abs/2401.18059, https://arxiv.org/abs/2406.06124 (fetched 2026-10-06) —
  confidence: high
- [F20.43] **Toward a Theory of Hierarchical Memory** (ICLR 2026) formalises the (extract, coarsen,
  traverse) pipeline over 11 systems; none is a shared multi-agent log (the agent-trace instances are
  single-agent). — source: https://arxiv.org/abs/2603.21564 (fetched 2026-10-06) — confidence: high
- [F20.44] **CRDT attempts exist but none summarises hierarchically**: `crdt-merge` (LWWMap/ORSet/
  PNCounter + budget-capped context lists, no summary tree), `agentcrdt` (LWW over content-addressed
  `WorldFact`s, no summarisation), `AgentRoom` (CRDT-backed workspace merging *files*; conclusion:
  "Coordination, not parallelism or CRDT-merge, bears the load"). — sources:
  https://github.com/mgillr/crdt-merge/blob/main/docs/guides/convergent-multi-agent-ai.md,
  https://github.com/sandeep-alluru/agentcrdt, https://arxiv.org/abs/2608.23740 (fetched 2026-10-06)
  — confidence: high
- [F20.45] **Epoch/generation-based shared summarisation: no system found.** Epochs appear as
  fencing/scheduling (Kleppmann fencing tokens, ZooKeeper/etcd leader epochs), never as a
  shared-summary tree. — source: `F20-W2.md` §F, `F20-W4.md:33-40` (fetched 2026-10-06) —
  confidence: medium (absence claim)
- [F20.46] The **only** hierarchical summary tree over a transcript found anywhere is OptChat/OptMem,
  and it is single-writer/single-agent/single-chat. — sources:
  https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449 §2,
  `/tmp/OptMem/README.md:100-106` (fetched 2026-10-06) — confidence: high
- [F20.47] **18 public OptChat replications exist** (GitHub search `optchat`), incl.
  `ericjuta/omp-optchat` (OMP extension), `jonaslsaa/pi-optchat`, `samoylenkodmitry/optchat` (MCP
  server, multi-machine), `AodhanHayter/optchat-rs`. **All remain single-user**: `samoylenkodmitry`
  states "One memory for the Claude Code and Codex agents **of one user**"; its subagent compactor is
  a *worker for the same chat*, not a peer. — sources: https://github.com/samoylenkodmitry/optchat,
  https://github.com/ericjuta/omp-optchat (fetched 2026-10-06) — confidence: high
- [F20.48] `ericjuta/omp-optchat` confirms the single-writer boundary is deliberate and host-enforced:
  "Run just one enabled session per chat directory"; "The Linux lock uses an OS-owned abstract Unix
  socket keyed by the directory's filesystem identity ... A second writer in the same network
  namespace fails." — source: https://github.com/ericjuta/omp-optchat (fetched 2026-10-06) —
  confidence: high (independently re-verified by the manager)

### 8. Why no CRDT+summarisation shared tree exists

- [F20.49] A 2026 survey of 89 LLM-agent papers on collective memory states the failure directly:
  "Convergence does not transfer without an equality relation over natural-language state;
  commutative merge fails separately because semantic summarization is order-dependent and
  non-associative." — source: https://github.com/xiaoqi-7/Multi-Agent-Memory-Survey (fetched
  2026-10-06, re-verified by the manager) — confidence: high
- [F20.50] The same survey codes **global scope in 0 of 89 papers** (widest scope: individual 53.9%,
  team 25.8%); 80/89 do not state who controls memory operations. — source: same (fetched
  2026-10-06, re-verified) — confidence: high
- [F20.51] CvRDTs require a join-semilattice (states partially ordered; join associative, commutative,
  idempotent, updates monotonic); CmRDTs require commuting concurrent ops with causal broadcast. —
  source: Shapiro et al., "Conflict-free Replicated Data Types", INRIA RR-7687 (2011),
  https://www.lip6.fr/Marc.Shapiro/papers/RR-7687.pdf (fetched 2026-10-06) — confidence: high
- [F20.52] **LLM summarisation is non-deterministic**, so a node's text is a function of
  (range, model, prompt, decoding, time), not of its input range alone. OpenAI: with `seed` and all
  parameters fixed and `system_fingerprint` matched, outputs "will mostly be identical. There is a
  small chance that responses differ even when request parameters and `system_fingerprint` match,
  due to the inherent non-determinism of our models" — determinism "is not guaranteed". — source:
  https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter
  (fetched 2026-10-06, re-verified) — confidence: high
- [F20.53] Consequence: two honest compactors given identical children produce different text and
  therefore different hashes. A hash difference carries **no signal about which is right**. Content
  addressing can only record that they disagreed. — source: [INFERENCE] from F20.52 + Git's
  content-addressing model (https://git-scm.com/book/en/v2/Git-Internals-Git-Objects, fetched
  2026-10-06) — confidence: high
- [F20.54] A multi-value register would retain both summaries, but the view's tiling invariant —
  "a list of tree nodes that tiles the whole chat `[0,T)`", exactly one part per range — forces a
  deterministic read-time selection, which reintroduces single-writer semantics at read time. —
  sources: `/tmp/optchat.md:389-390,414-435`; Shapiro RR-7687 (fetched 2026-10-06) — confidence:
  medium (inference)

### 9. Merkle trees, transparency logs, CDC — what transfers

- [F20.55] RFC 6962 MTH: `MTH({}) = SHA-256()`, `MTH({d0}) = SHA-256(0x00||d0)`,
  `MTH(D[n]) = SHA-256(0x01||MTH(D[0:k])||MTH(D[k:n]))` with `k` the largest power of two < n; leaf
  and interior hashes use different prefixes (domain separation). — source:
  https://www.rfc-editor.org/rfc/rfc6962.txt §2.1 (fetched 2026-10-06); restated in
  https://www.rfc-editor.org/rfc/rfc9162.txt §2.1.1 — confidence: high
- [F20.56] Detection cascades: "If any record is modified, its hash changes. This cascades up all the
  levels, resulting in a different tree head." Localisation is an audit path of
  `ceil(log2(n))+1` sibling hashes; "As soon as two conflicting Signed Tree Heads for the same log
  are detected, this is cryptographic proof of that log's misbehavior." — sources:
  https://transparency.dev/verifiable-data-structures/,
  https://www.rfc-editor.org/rfc/rfc6962.txt §2.1.1-2.1.2, §7.3 (fetched 2026-10-06) — confidence: high
- [F20.57] Compact ranges (transparency.dev): *perfect* nodes are immutable, *ephemeral* nodes change
  on each append until they become perfect; a compact range is the unique minimal set of perfect
  nodes covering `[L,R)`, size `O(log(R-L))`, mergeable. This is the modern formalisation of "old
  hashes stable, tail churns" — the property OptMem approximates positionally with per-size level
  files. — source: https://raw.githubusercontent.com/transparency-dev/merkle/main/docs/compact_ranges.md
  (fetched 2026-10-06) — confidence: high
- [F20.58] Transparency logs never repair in place (append-only, MUST NOT be edited). The repair
  *recipe* that transfers is recompute-from-children: every node is a pure function of its children.
  OptMem already implements that recipe with ad-hoc detection (`forget` → `tree_drop` → rebuild),
  just without hashes. — sources: [INFERENCE] from F20.55/F20.56;
  `/tmp/OptMem/memo:372-389,718-728` (fetched 2026-10-06) — confidence: high
- [F20.59] Git: a blob is named `SHA-1("blob <len>\0"+content)`; a tree lists `(mode,hash,name)`;
  changing one leaf rewrites the leaf plus **its ancestors** (`O(depth)` tree objects) while
  unchanged sibling subtrees are shared by hash. OptMem's `tree_drop` instead invalidates a
  positional **suffix per level** (dense prefix), so it is coarser but needs no hash→location index
  and keeps O(1) `tree_get` seeks. — sources:
  https://git-scm.com/book/en/v2/Git-Internals-Git-Objects,
  https://git-scm.com/book/en/v2/Git-Internals-Packfiles, `/tmp/OptMem/memo:68-73,372-389` (fetched
  2026-10-06) — confidence: high
- [F20.60] **CDC does not apply to OptMem's fixed-width log.** CDC chunks the byte stream to survive
  middle insertions/deletions (the boundary-shift problem); the log is fixed-width (`LOG_REC=320`),
  "position IS identity", and appended only at the tail. Content-defined boundaries would make node
  membership non-deterministic and break the aligned power-of-two block invariant that `cover()`,
  `tree_get`, and `zoom()` depend on. — sources: FastCDC (USENIX ATC '16)
  https://www.usenix.org/system/files/conference/atc16/atc16-paper-xia.pdf; restic
  https://raw.githubusercontent.com/restic/restic/master/doc/design.rst; `/tmp/OptMem/memo:68-73,78-102,
  279-292,762-782` (fetched 2026-10-06) — confidence: high
- [F20.61] Even CDC vendors agree fixed-size is correct for already-aligned content: borg recommends
  `--chunker-params=fixed,4194304` for "block devices (like disks, partitions, LVM LVs) or raw disk
  image files". — source: https://borgbackup.readthedocs.io/en/stable/usage/notes.html (fetched
  2026-10-06) — confidence: high
- [F20.62] IPLD/IPFS: a CID = hash + multicodec + multibase; a node's id hashes its payload **and its
  children's ids**, so any change creates a different DAG. Mutable state is a *signed pointer*
  (IPNS: name = hash of a public key; record carries target, `sequence`, validity, signature), and
  MFS hides hash rewriting. IPLD Patch is RFC-6902-like declarative ops applied all-or-nothing. —
  sources: https://docs.ipfs.tech/concepts/content-addressing/,
  https://docs.ipfs.tech/concepts/merkle-dag/, https://docs.ipfs.tech/concepts/ipns/,
  https://docs.ipfs.tech/concepts/file-systems/, https://ipld.io/specs/patch/,
  https://ipld.io/docs/codecs/known/dag-cbor/ (fetched 2026-10-06) — confidence: high
- [F20.63] What content-addressing buys a summary tree: (a) divergence *detection*, (b) provenance
  ("which summary from which children, by which model/prompt"), (c) dedup of identical subtrees. It
  buys **none** of semantic correctness, determinism, or repair. — source: [INFERENCE] from F20.53,
  F20.56, F20.62 — confidence: high
- [F20.64] Split-view detection needs a **deterministic** tree: RFC 6962 consistency proofs and
  gossip assume the same leaf set yields the same root. Non-deterministic leaves mean two compactors
  can never produce a shared root, so gossip can only observe two incomparable roots. — source:
  [INFERENCE] from https://www.rfc-editor.org/rfc/rfc6962.txt §7.3 + F20.52 — confidence: medium-high
- [F20.65] The practical substitute for a hash is **provenance**, not verification: Traceable Text
  links passages of a generated summary to source passages and "markedly improved correctness of
  answers in cases where there were hallucinations in the summaries." A hash chain proves a summary
  is unchanged; only source links let a reader check it. — source: https://arxiv.org/abs/2409.13099
  (fetched 2026-10-06) — confidence: high
- [F20.66] **No primary source combines Merkle trees or CDC with LLM hierarchical-summarisation
  compression** (the OptMem/OptChat shape). Integrity/provenance work (VCT, MemLineage, Portable
  Agent Memory) and hierarchical-compression work (Hierarchical Aggregate Tree) are disjoint. —
  sources: https://arxiv.org/abs/2406.06124 + 7 failed searches (`F20-W3.md` §Searches) (fetched
  2026-10-06) — confidence: medium (absence claim)

### 10. Must a summariser be single-writer by construction?

- [F20.67] **No — OptMem is the counterexample.** OptMem supports N concurrent writers (16-process
  test), each of which may attempt naps; node identity is serialised by an ordered append with a
  length check (`tree_put`'s `count(p,TREE_REC) != lo // size` → `False`), and a concurrent loser is
  told "was settled or forgotten meanwhile" without error. Single-writer is therefore **not
  required by construction**. — sources: `/tmp/OptMem/memo:353-369,683-687`;
  `/tmp/OptMem/test.py:362-373,450-466` — confidence: high
- [F20.68] What *is* required is that **at most one node exists per range** at any read. OptMem
  achieves this with a dense-prefix invariant + compare-and-append; OptChat achieves it with a
  process-lifetime lock. Two mechanisms, one invariant. — sources: `/tmp/OptMem/memo:353-369`;
  `/tmp/optchat.md:120-127` — confidence: high
- [F20.69] Where single-writer becomes *practically* necessary is OptChat's "never recompute the
  tree" + "never split" policy: because summaries are expensive and the view's tiling must be stable
  and cacheable, a second writer's divergent summary is a real cost, not a free alternative. —
  sources: `/tmp/optchat.md:120-127,414-442` — confidence: high
- [F20.70] **CALM theorem** (Hellerstein & Alvaro): monotone computations can be implemented
  consistently without coordination; non-monotone ones generally need it. LLM summarisation is
  plausibly non-monotone (new context can change what is salient in an old range), so it is *not*
  coordination-free under CALM — the choice is which serialisation mechanism, not whether to have
  one. — source: https://arxiv.org/abs/1901.01930 (fetched 2026-10-06) — confidence: medium (the
  application to LLM summarisation is the worker's inference; CALM is about query monotonicity)
- [F20.71] **Epoch/fencing works.** Kleppmann's fencing token: each lock acquisition gets a strictly
  increasing number; the resource remembers the greatest accepted token and rejects lower ones. A
  monotonic epoch on `T` (log length) or block index serialises compaction the same way — at most one
  compactor owns a block per epoch, and a stale compactor's write is rejected. — source: Kleppmann,
  "How to do distributed locking" (2016-02-08),
  https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html (fetched 2026-10-06) —
  confidence: high
- [F20.72] **Verdict.** Single-writer is *incidental to the concept* (OptMem proves multi-writer
  works) but *practically required given* (a) LLM non-determinism, (b) the view's one-part-per-range
  invariant, and (c) the cost of rebuilding summaries. The cheapest correct design for the room is
  therefore: **many writers on the log, a designated compactor per block serialised by an epoch /
  ordered append on the tree** — exactly OptMem's split. — sources: `F20-W4.md:42-47`, `F20-W2.md` §F,
  F20.67-F20.71 — confidence: medium-high

### 11. The two-region rejection in OptChat is *not* a rejection of the brief's design

- [F20.73] OptChat §5.3 verbatim: "**Showing recent messages whole** (and only older ones
  summarized). This breaks everything. A message can be any size: one 30 KB tool output entering the
  view forces dozens of merges among old lines, which are never split back, so a few big messages
  permanently erase old detail. And a long last turn could be 200k tokens. With summaries only, every
  line is ≤ ~512 bytes, so the budget is stable and the math works. The cost is a zoom when the agent
  needs exact text, which is cheap." — source: `/tmp/optchat.md:470-476` — confidence: high
- [F20.74] The rejection is specific to OptChat's constraints: the view is the *only* context, it
  must be cacheable, and merges are irreversible ("never split"). A design that keeps raw messages in
  a **separate region** (as OptMem's log already does) is not what §5.3 rejects: the raw region is
  not part of the compressed view, so a big message cannot force irreversible merges of old lines. —
  sources: `/tmp/optchat.md:470-476,441-442` vs `/tmp/OptMem/memo:82-131` — confidence: medium
  (manager's reconciliation; the sources do not state this directly)

---

## Searches

**W1 (local re-read):** full read of `/tmp/OptMem/memo` (1-859), `/tmp/optchat.md` (1-777),
`/tmp/OptMem/README.md`, `/tmp/OptMem/test.py` (1-614).

**W2 (prior art, ~20 queries + ~40 primary fetches):** "CRDT shared log LLM summarization compression
multi-agent"; "hierarchical summarization shared conversation log multi-agent system"; "recursive
abstractive summarization tree memory agents RAPTOR"; "epoch generation based summarization shared
agent log hierarchical compression"; "communication compression multi-agent LLM shared transcript
summarization arXiv"; "AutoGen CrewAI LangGraph hierarchical memory compression shared conversation";
"Mem0 Zep Letta shared multi-agent conversation log hierarchical summarization"; "shared context
compaction tree multi-agent LLM 2026"; "group chat history compression agents shared conversation
summarization tree bounded context"; "framework group chat history summarization bounded context
AutoGen CrewAI LangGraph MetaGPT shared"; "blackboard architecture LLM agents shared state
summarization compression hierarchical"; "shared log binary tree summarization agents compress cold
backlog"; "log-structured merge tree agent memory compaction shared conversation"; "multi-agent shared
memory hierarchical summarization compression shared agents 2026"; "survey multi-agent memory systems
shared log compression 2026 arXiv"; "AgentSensus consensus compressed shared memory"; "Letta
conversation compaction summarization shared memory multi-agent docs"; "OptMem VictorTaelin
multi-agent shared memory subagent limitation"; "hierarchical shared memory multi-agent MAS tree
compression"; "collaborative memory hierarchy LLM agent teams shared history compression
summarization tree". Primary fetches: OptChat gist; GitHub OptMem + /issues; GitHub search API
(`optchat`, `optmem`); arXiv abs/full 2506.07398, 2606.28349, 2602.00996, 2606.10662, 2609.32297,
2607.07666, 2607.09403, 2603.21564 (full PDF), 2609.40118, 2605.23296, 2602.00454, 2609.00237,
2602.05965, 2609.34060, 2609.37017, 2510.12872, 2608.23740, 2603.21278, 2512.13956, 2401.18059,
2406.06124; raw.githubusercontent microsoft/multi-agent-reference-architecture (Memory.md,
Short-Term-Memory.md), apache/maka compaction draft, mgillr/crdt-merge guide, yuzhenmao/DeLM
`board/shared_context.py`, samoylenkodmitry/optchat `memory.py`; help.getzep.com/thread-summaries;
docs.letta.com (compact, shared-memory, stateful-agents, multi-agent-parallel-execution);
microsoft.github.io/autogen memory docs; doc.agentscope.io (task_agent, task_prompt);
github.com/YerbaPage/Awesome-Agent-Context-Compression; github.com/xiaoqi-7/Multi-Agent-Memory-Survey;
gossip.py HN/reddit/arxiv (returned empty for every query).

**W3 (Merkle/CDC, 7 queries + direct fetches):** "Merkle tree content-addressed LLM context memory
compression append-only log"; "content-defined chunking LLM context window prompt compression
deduplication"; "verifiable summarization provenance hash LLM generated summary tamper-evident";
"content-defined chunking fixed-size records boundary-shift problem applicability"; "Merkle tree
verifiable memory agent LLM tamper-evident conversation log"; "Merkle tree hierarchical summarization
LLM memory integrity verification arxiv"; "LLM nondeterminism temperature=0 reproducibility same
prompt different output hash verification". Direct fetches: RFC 6962 / RFC 9162, Go `sumdb/tlog`,
FastCDC (USENIX ATC '16), restic `doc/design.rst`, borg internals/notes, IPFS content-addressing /
merkle-dag / file-systems / IPNS, IPLD patch + dag-cbor, transparency.dev verifiable-data-structures,
transparency-dev/merkle compact_ranges.md, Trillian README, Rekor README/docs, c2sp.org/tlog-tiles,
Git book ch. 10.2/10.4/10.7, OpenAI seed cookbook, arXiv 2409.13099 / 2406.06124 / 2605.11032 /
2605.14421 / 2606.23003, eprint 2025/558.

**W4 (single-writer):** "Shapiro \"Conflict-free Replicated Data Types\" RR-7687 state-based op-based
join-semilattice"; "Martin Kleppmann \"How to do distributed locking\" fencing token epoch";
"Hellerstein Alvaro \"Coordination Avoidance in Database Systems\" CALM theorem monotonic".

**Manager verification (re-fetched to confirm load-bearing cross-cutting claims):**
`raw.githubusercontent.com/xiaoqi-7/Multi-Agent-Memory-Survey/main/README.md` (lines 188, 155-173),
`raw.githubusercontent.com/ericjuta/omp-optchat/main/README.md` (lines 31, 87),
`developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter`.

---

## Conflicting evidence

1. **Is OptChat's §5.3 rejection general or specific?** W2 reads it as "OptChat explicitly rejected
   the two-region raw hot tail design that a shared-log variant would want" (W2.38). W1 reads it as
   specific to OptChat's cacheability + never-split constraints (W1.8.3). The sources support W1:
   §5.3's stated failure mechanism is "one 30 KB tool output entering *the view* forces dozens of
   merges among old lines, which are never split back" — a *view* invariant, not a store invariant.
   A two-region store keeps raw messages outside the compressed view, so the mechanism does not
   apply. **Resolved in favour of W1**; the disagreement is recorded because W2's framing is what a
   reader skimming "OptChat rejected it" would take away, and it is misleading. Confidence in the
   resolution: medium — neither source states the reconciliation directly.
2. **Is single-writer "incidental" or "practically necessary"?** W4's own Q1 verdict says the lock is
   "incidental to summarisation" (W4.5); its Q5 verdict says "practically necessary" (W4.24).
   Reconciled: the *lock* is incidental to the concept (OptMem proves multi-writer), but a
   serialisation *mechanism* for node identity is necessary. W4.5's wording conflates the two.
   Confidence: high (the reconciliation follows from F20.67).
3. **Can a CRDT make a shared summary tree convergent?** W4.23 says a content-addressed tree with a
   deterministic selection policy could let two compactors write different summaries and still be
   deterministic — so single-writer is a policy choice. W2.4/F20.49 says commutative merge of
   natural-language memory fails (order-dependent, non-associative), so there is no equality relation
   to converge on. Not a true contradiction: W4's proposal does not *merge* the summaries, it *retains*
   both and selects one deterministically; F20.49 rules out merging them. Both agree the selected
   design ends up with a single effective value per range. Confidence: high.
4. **OptMem's TEMPLATE wording.** "Parallel sessions ... may all write memories" (F20.20) reads as
   endorsement of multi-writer, yet `locked()` serialises every write. Not a conflict — the TEMPLATE
   refers to the agent's own sessions coordinating through the lock. Recorded because the wording is
   ambiguous and could mislead a reader into thinking OptMem is lock-free. Confidence: high.
5. **Repair semantics.** CT/Merkle literature treats the tree as strictly append-only and never edits
   a node; OptMem *does* truncate tree nodes (`tree_drop`). Both are consistent because OptMem's tree
   is explicitly a rebuildable cache over an authoritative log, while a CT log has no underlying
   authoritative source. A chatroom store is in OptMem's camp. Confidence: high.

---

## Gaps

1. **No system compresses a shared multi-agent log hierarchically** — this is an *absence* claim
   backed by ~20 searches and ~40 primary fetches, not a proof over all code. GitHub code search
   returned 401 unauthenticated, so the sweep rests on repo + web search, not code-level search.
2. **The two-region reconciliation (F20.74) is the manager's inference.** Neither OptChat nor OptMem
   states that "raw in a separate region" is exempt from §5.3's rejection. It follows from the
   mechanism §5.3 names, but it is not quoted.
3. **No published measurement that a hash-pinned summary tree detects compactor divergence in
   practice.** F20.64 is inferred from RFC 6962's determinism assumption, not an experiment.
4. **`RAW_MAX`'s effect on summary quality is unmeasured** — OptMem fixes it at 16 and OptChat
   dropped it with "no real justification" (F20.8), but neither reports a comparison.
5. **HMARS, AOI, Ensemble QSP, AutoWorldBuilder were verified from abstracts only**; their
   "hierarchical" labels are the authors' and the internal structure was not confirmed line-by-line.
6. **AutoGen's `Memory` protocol, LangGraph's checkpointer, and Letta's compaction were verified from
   docs/API reference**, not traced through full source for a hidden summariser.
7. **The CALM application (F20.70) is an inference** — CALM addresses logical monotonicity of
   queries, not LLM summarisation formally.
8. **Git's `O(depth)` rewrite count is derived from the object model**, not benchmarked.
9. **`gossip.py` HN/Reddit/arXiv adapters returned empty for every query**, so forum chatter
   contributed no evidence to any worker.
10. **OptChat's gist comments were not retrievable** (returned the same document body), so no author
    statement on multi-agent limits beyond §9 was obtained.
11. **Not established here:** whether the room's designated compactor should be a dedicated agent, a
    rotating member, or the host process — that is angle 15 (F21) territory (boundary/cursor
    semantics), deliberately out of scope for this file.

---

## Implications for the two-region room store (confidence-tagged, not settled)

- **[high]** The design is not novel as a *store shape*: OptMem already is raw-tail + compressed-cold-
  tree, with `cover()` producing exactly the two-region view the brief wants (F20.1-F20.4). Reuse
  `cover`'s age rule rather than inventing a boundary rule.
- **[high]** Multi-writer is already solved for the *log* by omp's sync `O_APPEND` writes (F18
  §2: `write(2)` appends are atomic; 2/5-writer probes passed). It is *not* solved for the tree by
  OptChat's approach (process-lifetime lock) — but it *is* solved by OptMem's dense-prefix +
  compare-and-append (F20.22-F20.24), which is the mechanism to copy.
- **[high]** Do **not** put a Merkle hash tree under the summaries expecting verification: LLM
  non-determinism means a hash proves integrity of an artifact, not reproducibility or correctness
  (F20.52-F20.53). If provenance is wanted, bind the node to its children's hashes and generation
  metadata, and prefer source-linked provenance over a hash chain (F20.65).
- **[high]** Do **not** use CDC. Fixed-width records at a tail-only append have no boundary-shift
  problem; content-defined boundaries would break `zoom` addressing and the aligned power-of-two
  invariant (F20.60-F20.61).
- **[medium]** The single-writer question is the wrong question: the invariant is *one node per
  range*, and the cheapest way to hold it in a multi-writer room is an ordered append on a per-level
  dense file (OptMem's exact `tree_put` guard), optionally fenced by an epoch on `T` (F20.67-F20.71).
- **[medium]** OptChat's §5.3 is not an argument against this design, because the raw region sits
  outside the compressed view (F20.73-F20.74) — but the *view* itself, if it ever holds raw messages,
  does inherit §5.3's warning about a 30 KB tool output forcing irreversible merges.
