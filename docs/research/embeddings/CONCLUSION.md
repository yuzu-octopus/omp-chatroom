# Embedding research — conclusion

Date 2026-10-07. Three rounds, 53 sources. **Outcome: do not build this into the room yet.**

## The decision

**Defer embeddings. Not rejected — deferred, with the trigger stated.**

The room's retrieval needs are met without a model:

| Job | Mechanism | Cost |
|---|---|---|
| Find a past message | `room{op:"recall", pattern}` — regex over the raw log | **~1.7 ms** at the 5000-record retention cap (1.6 MiB); ~17 ms at 50,000 records |
| Locate a tree range | `zoom(lo, hi)` — positional arithmetic | O(1) |
| Find a claim | `board` — exact match on `<topic>/<key>` | O(1) |
| Find a peer | `AgentRegistry` roster | O(1) |

**Why semantic search does not earn its place here:**

1. **The corpus is tiny.** Retention caps at 5000 records ≈ 1.6 MiB. Similarity search only beats
   lexical when the corpus is large *and* query vocabulary diverges from document vocabulary. A few
   thousand messages in one session tree is the wrong regime.
2. **The content is identifier-heavy.** The research's own counter-angle: dense retrievers suffer
   "token amnesia" on tail entities, underperform sparse methods on entity-rich queries, and pulled
   a random-string passage above the relevant one for up to **12.08%** of questions at 100M docs.
   Agent chatter full of file paths, symbol names and hashes is exactly that regime — and
   **BM25/regex is the half that wins there**.
3. **The coordination half is already solved** by the claim board and the digest. Semantic search is
   a convenience on top, not load-bearing.
4. **It adds real operational surface**: a process to start, supervise, and kill inside the 2 s
   `session_shutdown` budget; a model to download; a vector store to keep in sync with an
   append-only log; an index to rebuild when the model changes.

**Revisit trigger:** the log growing past ~10⁵ records, or observed "we discussed this but I cannot
find it" failures in practice. Until one of those happens, regex + (if needed) BM25 is sufficient. Count the misses as zero-match `room recall` results carrying `recallMiss:true` in details (miss rate = misses / recalls on a non-empty log).

## If that trigger fires, here is the answer

**Primary: `google/embeddinggemma-300m`** — Path 3 (self-hosted OpenAI-compatible endpoint; GGUF +
ONNX + fastembed + Ollama builds all exist), 308 M, 2 K context, `gemma` licence.

**Quality fallback: `Qwen/Qwen3-Embedding-0.6B`** — Apache-2.0, official GGUF, 32 K context, and the
**Code** crown (MTEB(Code, v1) **75.42**, harness-verified, vs EmbeddingGemma-v1's 68.76). Use it for
short queries or batched offline indexing where per-call latency is not the constraint.

**Excluded:** jina-v5-text-small/-nano — would win on quality-per-parameter but are
**CC-BY-NC-4.0** (non-commercial). jina-v5 publishes no Code score at all.

## The finding that decided it

Round 3 derived CPU latency on the target class (no published 4-core-laptop benchmark exists for any
embedding model). At 512 tokens:

| Model | Derived latency on i5-1135G7-class CPU |
|---|---|
| EmbeddingGemma-2-270M | 0.42–0.84 s |
| embeddinggemma-300m | **0.45–0.89 s** |
| jina-v5-text-nano | 0.71–1.42 s |
| Qwen3-Embedding-0.6B | **2.7–5.3 s** |
| jina-v5-text-small | 3.0–5.9 s |

The two 0.6 B qwen3-architecture models break a 1 s budget from roughly **128 tokens upward** —
they fail on an ordinary chunk, not just long inputs.

**Structural cause, verified in llama.cpp source** (`src/models/qwen3.cpp` at master): the qwen3
graph declares `output` as `TENSOR_NOT_REQUIRED` but still builds `build_lora_mm(model.output, …)`
(line 153), so the embedding path pays for an `lm_head` pass it discards — **26% of its FLOPs**.
The Gemma embedding graph never builds it. That is why a 308 M model outruns a 596 M one here.

## What the three rounds established (kept for the future)

- The **integration constraint**: omp whitelists exactly 7 local models (`KNOWN_MODEL_NAMES`,
  `pi-mnemopi/src/core/embeddings.ts:325-333`). Anything else needs Path 3 (self-hosted
  OpenAI-compatible endpoint — `isApiModel()` accepts any `apiUrl`) or a host patch.
- The **scale reconciliation**: a model card's "MTEB English v2" is the live leaderboard's
  `Mean (Task)`. Compare on that, not on per-task subsets.
- **Licence is a hard filter**: CC-BY-NC models (jina-v5, jina-v3, NV-Embed-v2, SFR-2_R) are
  unusable commercially and must not be ranked first.
- **Self-reported scores are not scores**: EmbeddingGemma-2's card claims Code 78.68 with **zero
  rows on the live MTEB board**. Do not treat card claims as harness-verified.

## Open, if it is ever built

- No published CPU benchmark exists for the target hardware — all latency figures are **derived**,
  not measured. First task on any real build is to measure.
- No benchmark covers agent-chat-log retrieval specifically; the identifier evidence is proxied
  from code and entity retrieval.
- EmbeddingGemma-2's text layer (270 M of 740 M, Apache-2.0, 8 K context) is promising but
  unverified and has **no text-only GGUF** — only multimodal builds.

## Files

`REPORT.md` (345 lines, 53 sources) · `brief.md` · findings `E1`–`E7`, `F1`–`F15`.
