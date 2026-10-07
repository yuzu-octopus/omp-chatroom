# E7 — Head-to-head: jina-v5-text-small vs Qwen3-Embedding-0.6B vs EmbeddingGemma-2 text-270M

Merged 2026-10-07 from `F13-code-benchmark.md` (10 sources) + `F14-cpu-latency.md` (46) +
`F15-larger-models.md` (14), plus direct orchestrator reads of the live MTEB boards.

## Angle

Per-task-type comparison of the three ~0.2–0.6 B CPU-servable candidates on one reconciled scale
(card "MTEB English v2" = live `meanTask`, established round 2), with Code flagged specifically
because the room's content is agent chatter full of code and identifiers; plus the CPU cost of each.
The user's hypothesis to test: *"no way embeddinggemma is better than these larger ones… maybe
compare to gemma text only."*

## Claims

### A. Per-task-type, MTEB(eng, v2) — one scale (live board, snapshot 2026-10-05, fetched 2026-10-07)

All values `meanTask` / `scoresByTaskType` × 100.

| Model | Params (text) | Dim | Max ctx | **Mean(Task)** | Retrieval | Classification | Clustering | STS | PairClass | Reranking | Licence | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| jina-v5-text-small | 0.596 B | 1024 | 32 768 | null (38/41) | 60.07 | — (missing) | 54.69 | 88.13 | 84.95 | 49.38 | **CC-BY-NC-4.0** | 3 |
| jina-v5-text-nano | 0.212 B | 768 | 8 192 | **71.11** | 58.80 | 90.07 | 53.49 | 88.28 | 84.74 | 49.23 | **CC-BY-NC-4.0** | 3 |
| jina-v5-omni-small *(text)* | 0.596 B text / 1.63 B total | 1024 | 32 768 | **71.78** | 60.07 | 90.75 | 54.69 | 88.13 | 84.95 | 49.38 | **CC-BY-NC-4.0** | 3 |
| **Qwen3-Embedding-0.6B** | **0.596 B** | **1024** | **32 768** | **70.47** | **61.83** | 84.58 | 54.05 | 86.57 | 84.37 | 48.18 | **Apache-2.0** | 3 |
| google/embeddinggemma-300m | 0.308 B | 768 | 2 048 | 69.67 | 55.69 | **87.55** | **56.55** | 83.61 | **87.29** | 47.43 | gemma (gated) | 3 |
| **EmbeddingGemma-2 (text-270M)** | **0.270 B text** / 0.740 B total | 768 | 8 192 | **68.46** *(self-reported)* | — | — | — | — | — | — | **Apache-2.0** | 3 |

jina-v5-text-small's own `meanTask` is null because 3 Classification tasks are missing from the
board; the omni-small row (bit-identical text embeddings) supplies 71.78.

### B. Code — the flagged comparison

| Model | Benchmark | Score | Snapshot | Verified? |
|---|---|---|---|---|
| **Qwen3-Embedding-0.6B** | **MTEB(Code, v1)** | **75.42** | live board, 2026-10-07 | **harness** (12/12 tasks) |
| Qwen3-Embedding-0.6B | CoIR | 74.96 | live board, 2026-10-07 | harness |
| **EmbeddingGemma-2 (text-270M)** | MTEB(Code, v1) | **78.68** @768d (71.41 @128d) | card, snapshot not stated | **self-reported — zero live-board rows** |
| google/embeddinggemma-300m | MTEB(Code, v1) | **68.76** | live board, 2026-10-07 | harness |
| google/embeddinggemma-300m | CoIR | 67.29 | live board, 2026-10-07 | harness |
| jina-v5-text-small / -nano | MTEB(Code, v1) | **absent** | — | no code benchmark in paper or board |
| Qwen3-Embedding-8B / -4B | MTEB(Code, v1) | 80.69 / 80.07 | live board | harness |
| codefuse-ai/F2LLM-v2-0.6B | MTEB(Code, v1) | **77.41** | live board, 2026-10-07 | harness (Apache-2.0) |
| codefuse-ai/F2LLM-v2-1.7B | MTEB(Code, v1) | **78.76** | live board, 2026-10-07 | harness (Apache-2.0) |
| perplexity-ai/pplx-embed-v1-0.6b | MTEB(Code, v1) | 75.85 | live board | harness (MIT) |

MTEB(Code, v1) = **12 tasks, all Retrieval, nDCG@10** — a pure retrieval benchmark.

**Key results:**
- **The user's hypothesis is refuted on Code, partially confirmed on Classification.** Qwen3-0.6B
  beats EmbeddingGemma **v1** on Code by **6.7 points** (75.42 vs 68.76) at 2× the params — so
  "EmbeddingGemma is not better" holds against v1. But EmbeddingGemma-**2**'s self-reported 78.68
  would beat Qwen3-0.6B by 3.3 points — *if* it is real.
- **The 78.68 is plausible but unverified.** It is leader-class (above Qwen3-0.6B, Gemini 74.66,
  GritLM-7B 73.6; below Qwen3-8B 80.69), and the model has a dedicated `CodeRetrieval` instruction
  prefix. But it is self-reported, has zero harness rows, and a **270M text encoder reaching
  78.68 is notable**. Independent harness evaluation is required before relying on it.
- **The 740M total is misleading in the user's favour:** the vision (170M) and audio (300M) towers
  are irrelevant to text, and the text layer is genuinely **270M** — so EmbeddingGemma-2 is not
  "a 740M model competing with 0.6B models", it is a 270M model competing with them.
- **Qwen3-0.6B is the strongest harness-verified code retriever of the three** (75.42), and is
  beaten only by larger models and by code-specialised models.

### C. The real cost of the text-only layer

| | Total params | Text-only params | Text-only size | Non-text waste |
|---|---|---|---|---|
| EmbeddingGemma-2 | 740 M | **270 M** | ~0.27 GB fp16 / 0.165 GB int4 (LiteRT, measured) | 470 M (vision+audio) — **excluded under the text-only rule** |
| jina-v5-omni-small | 1.626 B | 0.596 B (= v5-text-small) | 0.639 GB Q8_0 | 1.03 B (image+video+audio) |
| jina-v5-text-small | 0.596 B | 0.596 B | 0.639 GB Q8_0 | none |
| Qwen3-Embedding-0.6B | 0.596 B | 0.596 B | 0.639 GB Q8_0 | none |

Text-only loading is documented: EmbeddingGemma-2 via `config_kwargs={"vision_config": None,
"audio_config": None}`; jina-v5-omni via `model_kwargs={"modality": "text"}`. The standalone text
export `jayyun98/embeddinggemma-2-text-270m` (271 M params, 542 MB bf16) exists with verified tensor
equality to the source checkpoint.

### D. CPU latency head-to-head (derived, i5-1135G7 — see E6)

| Model | @128 tok | @512 tok | @2048 tok | <1 s at 512? | <1 s at 2048? |
|---|---|---|---|---|---|
| **EmbeddingGemma-2 text-270M** | 0.10–0.21 s | **0.42–0.84 s** | 1.7–3.4 s | **Yes** | **No** |
| **embeddinggemma-300m** | 0.11–0.22 s | **0.45–0.89 s** | 1.8–3.6 s | **Yes** | **No** |
| **jina-v5-text-nano** | 0.18–0.36 s | **0.71–1.42 s** | 2.8–5.7 s | Borderline | **No** |
| **Qwen3-Embedding-0.6B** | 0.66–1.32 s | **2.7–5.3 s** | 11–21 s | **No** | **No** |
| **jina-v5-text-small** | 0.74–1.48 s | **3.0–5.9 s** | 12–24 s | **No** | **No** |

All rows `[derived]`, 2× band; the dominant uncertainty. **The EmbeddingGemma family wins on CPU
cost by ~6× at 512 tokens**, and structurally so: its llama.cpp graph never builds `lm_head`,
while the qwen3-arch models build and discard it (**26 % of their FLOPs**, verified in llama.cpp
source at master; the fix was closed unmerged).

### E. Head-to-head winner per job

| Job | Winner | Runner-up | Licence note |
|---|---|---|---|
| **Retrieval** (eng-v2) | **Qwen3-Embedding-0.6B** (61.83) | jina-v5-text-small (60.07) | Qwen3 permissive |
| **Code retrieval** (harness) | **Qwen3-Embedding-0.6B** (75.42) | embeddinggemma-300m (68.76) | Qwen3 permissive |
| **Classification** | jina-v5-text-nano (90.07) | embeddinggemma-300m (87.55) | jina **NC** |
| **Clustering** | embeddinggemma-300m (56.55) | jina-v5 (54.69) | gemma licence |
| **STS** | jina-v5-text-nano (88.28) | Qwen3-0.6B (86.57) | jina **NC** |
| **PairClass / dedup** | embeddinggemma-300m (87.29) | jina-v5 (84.95) | gemma licence |
| **CPU speed** | EmbeddingGemma-2 text-270M (0.42–0.84 s @512) | embeddinggemma-300m | both permissive |
| **Best permissive overall** | **Qwen3-Embedding-0.6B** | embeddinggemma-300m | — |
| **Best overall if licence ignored** | jina-v5-text-nano / -omni-small | — | **CC-BY-NC — unusable commercially** |

## Conflicting evidence

1. **EmbeddingGemma-2's 78.68 Code vs zero harness rows.** Card self-reported; not a conflict, but
   it cannot be treated as verified. **Carry forward as self-reported.**
2. **F15 vs F14 CPU latency (20× gap).** **Winner: F14** (calibrated on real CPU runs). See E6 §E.
3. **jina-v5-text-small's `meanTask` null vs omni-small's 71.78.** Same text embeddings
   (verified bit-identical on 38 shared tasks) — omni-small is the valid proxy.

## Gaps

- No harness-verified Code score for EmbeddingGemma-2 or for any jina-v5 model.
- No published CPU benchmark for any of the three on a 4-core Intel laptop.
- No text-only GGUF for EmbeddingGemma-2 (the GGUF repos are multimodal with `mmproj`).
- The 2× latency band is irreducible without a local `llama-bench` run.

## Verdict

The three-way head-to-head splits by job and by licence. **Qwen3-Embedding-0.6B wins both jobs the
room actually has** — Retrieval (61.83) and Code (75.42, harness-verified) — and is Apache-2.0. The
jina-v5 family wins Classification/STS and quality-per-parameter but is **CC-BY-NC-4.0, i.e. not
commercially usable**. EmbeddingGemma wins clustering, dedup, and CPU speed, and its **v1 is
clearly behind Qwen3-0.6B on Code (68.76 vs 75.42)** — the user's instinct was right about v1.
EmbeddingGemma-**2**'s self-reported 78.68 Code would flip that if harness-verified, and its text
layer is a genuine **270M**, not 740M. The decisive new fact is latency: on the target CPU the two
0.6B qwen3-arch models **exceed the user's 1 s budget from ~128 tokens upward**, while the
EmbeddingGemma family stays under 1 s to ~1 K tokens.
