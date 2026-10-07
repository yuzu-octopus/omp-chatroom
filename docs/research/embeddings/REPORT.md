# Embedding models for a local, CPU-only retrieval layer

**Answer:** Qwen3-Embedding-0.6B served via a self-hosted OpenAI-compatible endpoint (llama.cpp or TEI) is the primary recommendation — it is the only model that is simultaneously top-2 on both MTEB retrieval (61.83) and classification (84.58) at a CPU-feasible size (0.6 B, ~600 MB int8). The 7 models already whitelisted in omp are not competitive: the best whitelisted option (bge-base-en-v1.5) trails Qwen3-0.6B by 7.1 retrieval and 6.9 classification points. A hybrid architecture (BM25/FTS + dense) is strongly recommended over dense-only, because the room's identifier-heavy agent chatter is exactly where dense retrieval fails.

**Confidence:** medium-high. MTEB scores are from the live leaderboard (snapshot 2026-10-05, fetched 2026-10-07) [1]. CPU feasibility is inferred from published benchmarks on different hardware (i7-13700K desktop, not i5-1135G7 laptop) — no published 4-core-laptop benchmark exists for any embedding model [2]. The counter-angle (BM25 vs dense) is well-supported by published evidence but no benchmark covers agent-chat-log retrieval specifically [3].

## Why

### The integration constraint

omp whitelists exactly 7 local embedding models in `KNOWN_MODEL_NAMES` (`@oh-my-pi/pi-mnemopi/src/core/embeddings.ts:325-333`). A model outside this list cannot load locally without either (a) serving it through a self-hosted OpenAI-compatible endpoint, or (b) patching the whitelist. Every recommendation below is classified into one of four paths:

| Path | Meaning | Models |
|---|---|---|
| **1 — Already whitelisted** | Works today via `mnemopi.embeddingModel` / `embeddingVariant` | bge-small-en-v1.5, bge-base-en-v1.5, bge-small-en, bge-base-en, bge-small-zh-v1.5, multilingual-e5-large, all-MiniLM-L6-v2 |
| **2 — API path** | OpenAI-compatible endpoint via `mnemopi.embeddingApiUrl` + `embeddingApiKey` | Any API model (OpenAI, Voyage, Cohere, Gemini) — **does not satisfy local-CPU constraint** |
| **3 — Self-hosted OpenAI-compatible** | Local server speaking `POST /embeddings` (llama.cpp, TEI, Ollama, vLLM, Infinity) | Qwen3-Embedding-0.6B, EmbeddingGemma-300m, bge-m3, jina-embeddings-v2-base-en, granite-embedding-english-r2, and any other local model |
| **4 — Patch required** | Adding a name to `KNOWN_MODEL_NAMES` in the host source | jina-v3, Qwen3-Embedding-4B/8B, gte-Qwen2-7B, KaLM-12B |

Path 3 is the escape hatch: because `isApiModel()` (`:271-283`) accepts any `apiUrl`, a local server can serve **any** model without patching omp. This makes Path 3 models actionable today.

### The whitelisted models are not competitive

The 7 whitelisted models are all 2023–2024 era, 512-context, and mid-table on MTEB:

| Model | Params | Dim | Max ctx | MTEB(eng,v2) Retrieval | MTEB(eng,v2) Classification | MTEB(eng,v2) STS | Licence | Path |
|---|---|---|---|---|---|---|---|---|
| BAAI/bge-base-en-v1.5 | 109M | 768 | 512 | 54.75 | 77.69 | 82.12 | MIT | 1 |
| BAAI/bge-small-en-v1.5 | 33M | 384 | 512 | 53.86 | 76.56 | 81.28 | MIT | 1 |
| BAAI/bge-base-en | 109M | 768 | 512 | — | — | — | MIT | 1 |
| BAAI/bge-small-en | 33M | 384 | 512 | — | — | — | MIT | 1 |
| BAAI/bge-small-zh-v1.5 | 33M | 512 | 512 | — | — | — | MIT | 1 |
| intfloat/multilingual-e5-large | 560M | 1024 | 512 | 53.47 | 75.71 | 84.72 | MIT | 1 |
| sentence-transformers/all-MiniLM-L6-v2 | 22.7M | 384 | 256 | — | — | — | Apache-2.0 | 1 |

Source: MTEB leaderboard backend API, snapshot 2026-10-05, fetched 2026-10-07 [1]. Dashes = no full-coverage score on that suite.

The best whitelisted model (bge-base-en-v1.5) is 7.1 retrieval points and 6.9 classification points behind Qwen3-Embedding-0.6B. The gap is large enough to justify a change.

### Qwen3-Embedding-0.6B is the strongest single-model candidate

On the live MTEB(eng, v2) leaderboard (snapshot 2026-10-05):

| Model | Params | Dim | Max ctx | Retrieval | Classification | Clustering | STS | PairClass | Licence | Path |
|---|---|---|---|---|---|---|---|---|---|---|
| Qwen/Qwen3-Embedding-8B | 7.57B | 4096 | 32768 | 69.44 | 90.43 | 58.57 | 88.58 | 87.52 | Apache-2.0 | 4 |
| Qwen/Qwen3-Embedding-4B | 4.02B | 2560 | 32768 | 68.46 | 89.84 | 57.51 | 88.72 | 87.01 | Apache-2.0 | 4 |
| **Qwen/Qwen3-Embedding-0.6B** | **0.596B** | **1024** | **32768** | **61.83** | **84.58** | **54.05** | **86.57** | **84.37** | **Apache-2.0** | **3** |
| Alibaba-NLP/gte-Qwen2-7B-instruct | 7.07B | 3584 | 32768 | 58.09 | 88.52 | 58.97 | 82.69 | 85.90 | Apache-2.0 | 4 |
| intfloat/e5-mistral-7b-instruct | 7.11B | 4096 | 32768 | 57.62 | 79.85 | 51.44 | 84.32 | 88.42 | MIT | 4 |
| NovaSearch/stella_en_1.5B_v5 | 1.54B | 8960 | 131072 | 52.42 | 89.38 | 57.06 | 83.27 | 88.02 | MIT | 4 |
| NovaSearch/stella_en_400M_v5 | 0.435B | 4096 | 8192 | 52.73 | 88.25 | 57.65 | 83.93 | 87.17 | MIT | 3 |
| google/embeddinggemma-300m | 0.308B | 768 | 2048 | 55.69 | 87.55 | 56.55 | 83.61 | 87.29 | gemma (gated) | 3 |
| BAAI/bge-large-en-v1.5 | 0.335B | 1024 | 512 | 55.44 | 78.34 | 48.01 | 82.79 | 87.13 | MIT | 1 |
| BAAI/bge-base-en-v1.5 | 0.109B | 768 | 512 | 54.75 | 77.69 | 47.42 | 82.12 | 86.56 | MIT | 1 |
| BAAI/bge-small-en-v1.5 | 0.033B | 384 | 512 | 53.86 | 76.56 | 47.02 | 81.28 | 84.95 | MIT | 1 |
| intfloat/multilingual-e5-large | 0.56B | 1024 | 512 | 53.47 | 75.71 | 49.89 | 84.72 | 86.24 | MIT | 1 |
| Snowflake/snowflake-arctic-embed-l-v2.0 | 0.568B | 1024 | 8192 | 58.56 | 73.37 | 44.37 | 78.05 | 83.00 | Apache-2.0 | 3 |
| nvidia/NV-Embed-v2 | 7.85B | 4096 | 32768 | 62.84 | 87.19 | 47.66 | 83.82 | 88.69 | CC-BY-NC-4.0 | 4 |
| Salesforce/SFR-Embedding-2_R | 7.11B | 4096 | 32768 | 53.75 | 90.54 | 59.39 | 80.86 | 88.09 | CC-BY-NC-4.0 | 4 |

Source: MTEB leaderboard backend API, snapshot 2026-10-05, fetched 2026-10-07 [1]. PairClass = pair classification (dedup proxy).

Key readings:
- **Qwen3-8B is the only model simultaneously top-2 on both Retrieval (69.44) and Classification (90.43)** — but at 7.57 B params it is effectively GPU-only on 15 GB RAM [2].
- **Qwen3-0.6B (0.596 B)** reaches Retrieval 61.83 / Classification 84.58 / STS 86.57 — within 7.6 Retrieval and 5.9 Classification points of its own 8B sibling, at 1/13th the size [1].
- **EmbeddingGemma-300M** (0.308 B) is the smallest competitive model: Retrieval 55.69 / Classification 87.55, with 2048 context and MRL truncation to 128d [1]. It is text-only (no vision tower) [4].
- **SFR-2_R has the highest Classification (90.54)** but is 15.7 points behind on Retrieval (53.75) — a model optimized for one job loses badly on the other [1].

### CPU feasibility

No published benchmark exists for the target i5-1135G7 (4c/8t Tiger Lake). All published CPU data is on i7-13700K (16c/24t desktop), Xeon E5-2620 v2, Graviton3 (ARM), or unspecified CPU [2]. The following table uses published data with a discount factor:

| Model | Quantized size | CPU feasibility on 15 GB RAM | Evidence |
|---|---|---|---|
| all-MiniLM-L6-v2 (22.7M) | 0.09 GB | Excellent — 2.5–3.5× speedup with int8/ONNX [5] | Primary (i7-13700K) |
| bge-small-en-v1.5 (33M) | 0.067 GB | Excellent — 2–3× speedup with int8/ONNX [5] | Primary (i7-13700K) |
| bge-base-en-v1.5 (109M) | 0.21 GB | Very good — 2–3× speedup with int8/ONNX [5] | Primary (i7-13700K) |
| EmbeddingGemma-300M (308M) | ~0.6 GB bf16 / ~0.15 GB int4 | Good — 196 MB RSS at 2048 tokens [6] | Primary (LiteRT, hardware unspecified) |
| Qwen3-Embedding-0.6B (596M) | ~1.2 GB fp32 / ~0.6 GB int8 | Feasible — 639 MB via Ollama [7] | Primary (Ollama) |
| bge-m3 (568M) | ~2.27 GB fp32 | Feasible with int8 — labelled "GPU only" on sbert.net but benchmarked with int8/ONNX [5] | Contradicted [2] |
| multilingual-e5-large (560M) | 2.24 GB | Feasible — largest fastembed-shipped model [8] | Primary (fastembed) |
| jina-embeddings-v2-base-en (137M) | 0.52 GB | Good — 8K context, ALiBi [8] | Primary (fastembed) |
| granite-embedding-english-r2 (149M) | ~0.6 GB | Good — 8K context [9] | Primary (model card) |
| Qwen3-Embedding-4B (4.02B) | ~16 GB fp32 / ~8 GB fp16 / ~4 GB int8 | Borderline — may OOM with other processes [2] | Derived from param count |
| Qwen3-Embedding-8B (7.57B) | ~32 GB fp32 / ~16 GB fp16 / ~8 GB int8 | Impractical on 15 GB RAM [2] | Derived from param count |
| gte-Qwen2-7B (7.07B) | ~28 GB fp32 / ~14 GB fp16 | Impractical [2] | Derived from param count |
| KaLM-Embedding-Gemma3-12B (11.8B) | ~47 GB fp32 / ~24 GB F16 | Impossible [2] | Primary (Ollama) |
| jina-embeddings-v3 (572M) | ~2.3 GB | **GPU-only** — model card states "requires CUDA-capable GPU for production throughput" [10] | Primary (model card) |

Quantization quality cost (measured, MTEB retrieval nDCG@10) [11]:

| Model | fp32 | int8 | % fp32 | binary | % fp32 |
|---|---|---|---|---|---|
| mxbai-embed-large-v1 | 54.39 | 52.79 | 97% | 52.46 | 96.45% |
| e5-base-v2 | 50.77 | 47.54 | 94.68% | 37.96 | 74.77% |
| nomic-embed-text-v1.5 | 53.01 | — | — | 46.49 | 87.7% |
| all-MiniLM-L6-v2 | 41.66 | 37.82 | 90.79% | 39.07 | 93.79% |

Key nuance: quantization cost is model-specific. e5-base-v2 binary loses 25 points (74.77%), while mxbai binary loses only 3.55 points (96.45%). int8 is generally safe (~97–99% of fp32); binary must be checked per model [11].

### Long-context

The room log and its compressed tree summaries are long documents. Published evidence:

- **512-context models average 34–41 on LongEmbed** (6 retrieval tasks, 256–32K tokens); **native 8K models average 56.8–58.9** [12].
- **Context extension (NTK / SelfExtend) adds +10.9 to +20.3 points** to 512-ctx models [12].
- **Chunking+pooling loses to true long-context embedding**: M2-BERT-32k beats BM25 by 14.8 points, E5-Mistral (truncation) by 23.3, E5-Mistral (chunked) by 24.4 on LoCoV1 [13].
- **Late chunking** (embed full document, then pool chunk embeddings after the transformer) beats naive chunking on BEIR; gain correlates with document length [14].
- **jina-embeddings-v3** has the best late-chunking results but is GPU-only (CUDA required) [10].
- **Qwen3-Embedding-0.6B** has 32K context — the longest of any CPU-feasible model [1].

CPU-feasible long-context survivors (≤500M params, ≥8K context): jina-embeddings-v2-base-en (137M, 8K, LongEmbed 58.2), bge-m3 (568M, 8K, 58.9), granite-embedding-english-r2 (149M, 8K), snowflake-arctic-embed-m-long (137M, 2048/8192 with RPE) [12]. nomic-embed-text-v1.5 claims 8192 but was trained at 2048 with NTK interpolation — effective context is ~2048 [15].

### The counter-angle: BM25 vs dense

The room's content is agent chatter full of identifiers, file paths, and code. Published evidence:

**Where BM25 beats dense:**
- BM25 is a robust zero-shot baseline; dense bi-encoders often underperform it out-of-distribution (BEIR: DPR −47.7%, ANCE −7.4% vs BM25) [16].
- Dense false-positive rate grows with index size: BM25 0.00% vs dense 128-dim up to 9.73% noise hits; DPR retrieved a random-string passage above the relevant passage for up to 12.08% of questions at 100M docs [17].
- Dense retrievers "drastically underperform sparse methods" on entity-rich questions (EntityQuestions) [18].
- "Token amnesia": dense retrievers' inability to handle tail entities correlates with token distributions forgetting entity tokens [19].
- BRIGHT: the then-top MTEB retriever (SFR-Embedding-Mistral) scored 59.0 nDCG@10 on MTEB but only 18.3 on BRIGHT — reasoning-intensive queries (including coding) collapse retrieval quality [20].

**Where dense beats BM25:**
- On code retrieval (CoIR), dense models beat BM25: BM25 avg 29.79 vs dense/code models 36.40–56.26 nDCG@10 [21].
- CodeRAG-Bench: "dense embedding models frequently surpass BM25 on code retrieval" — code-trained retrievers win by 6.6–7.4 nDCG@10 [22].
- BGE-M3 hybrid (dense+sparse+multi-vector) on MIRACL: 71.5 nDCG@10 vs BM25 31.9 [23].

**The reconciliation:** the regime depends on model choice, not paradigm. Where the encoder is code-trained, dense wins on code; where it is not and the domain shifts, BM25 wins [3]. BEIR's own authors state the benchmark "can give an unfair disadvantage to non-lexical approaches" — many BEIR datasets were annotated from lexical retrieval pools [24].

**Hybrid (BM25 + dense) — measured deltas:**
- RRF (Reciprocal Rank Fusion) "consistently yields better results than any individual system" [25].
- Elastic: RRF raises average NDCG@10 by 1.4% over ELSER alone and 18% over BM25 alone [26].
- Vespa: hybrid ColBERT+BM25 avg 0.481 vs BM25 0.453 on 13 BEIR datasets — hybrid best on 12 of 13 [27].
- BEIR SIGIR-2024: hybrid (Contriever + SPLADE fusion) gives "more than a six-point gain on average" over the best individual model [28].
- Qdrant: default RRF beat the stronger individual retriever on 4/5 datasets [29].
- **Caveat:** fusion only reorders the union of the two retrievers' candidates — "a document neither one found cannot appear anywhere in the results" [29]. Gains are conditional on comparable retriever strength [30].

**Cost on CPU:** BEIR 1M-doc DBPedia index — BM25 0.4 GB / 20 ms CPU vs dense 768-dim 3 GB / 125–275 ms CPU vs ColBERT 20 GB [31]. Dense is 6–14× slower than BM25 at 1M docs.

### Multilingual

If the room holds non-English text:

| Model | Params | Dim | Max ctx | MMTEB mean(task) | Eng-v2 mean(task) | Licence | Path |
|---|---|---|---|---|---|---|---|
| Qwen/Qwen3-Embedding-8B | 7.57B | 4096 | 32768 | 0.7058 | 0.7478 | Apache-2.0 | 4 |
| Qwen/Qwen3-Embedding-4B | 4.02B | 2560 | 32768 | 0.6945 | 0.7401 | Apache-2.0 | 4 |
| Qwen/Qwen3-Embedding-0.6B | 0.596B | 1024 | 32768 | 0.6434 | 0.6913 | Apache-2.0 | 3 |
| intfloat/multilingual-e5-large-instruct | 0.56B | 1024 | 512 | 0.6322 | 0.6500 | MIT | 1 |
| google/embeddinggemma-300m | 0.308B | 768 | 2048 | 0.6115 | 0.6836 | gemma (gated) | 3 |
| BAAI/bge-m3 | 0.568B | 1024 | 8192 | 0.5956 | 0.6339 (28/41) | MIT | 3 |
| Alibaba-NLP/gte-multilingual-base | 0.305B | 768 | 8192 | 0.5857 | 0.6242 | Apache-2.0 | 3 |
| intfloat/multilingual-e5-large | 0.56B | 1024 | 512 | 0.5847 | 0.6175 | MIT | 1 |
| jina-embeddings-v3 | 0.572B | 1024 | 8192 | 0.5837 | 0.6691 | CC-BY-NC-4.0 | 4 |
| Snowflake/snowflake-arctic-embed-l-v2.0 | 0.568B | 1024 | 8192 | 0.5703 | 0.6291 | Apache-2.0 | 3 |
| ibm-granite/granite-embedding-311m-multilingual-r2 | 0.311B | 768 | 32768 | 0.5596 | — | Apache-2.0 | 3 |

Source: MTEB leaderboard backend API + parquet recompute, 2026-10-07 [32]. MMTEB = MTEB(Multilingual, v2), 131 tasks.

Key readings:
- **Qwen3-0.6B leads 131/131 MMTEB at 0.6434** and beats English-only bge-large-en-v1.5 on English (0.6913 vs 0.6127) — the multilingual penalty is now negligible at the top [32].
- **English-only models collapse on multilingual**: nomic-v1.5 MMTEB Retrieval 34.09, bge-large 39.00 [1].
- **jina-v3 is CC-BY-NC-4.0** — non-commercial, disqualifying for most production use despite competitive scores [33].
- **granite-embedding-311m-multilingual-r2** (311M, 32K ctx, Apache-2.0) is a strong CPU-feasible multilingual option with 0.5596 MMTEB [34].

## What would change this

1. **A published i5-1135G7 CPU benchmark** showing Qwen3-0.6B is too slow for the room's latency requirements → would flip the recommendation to bge-base-en-v1.5 (Path 1, already whitelisted).
2. **A published benchmark on agent-chat-log retrieval** showing dense-only is sufficient → would weaken the hybrid recommendation.
3. **omp adding Qwen3-Embedding-0.6B to `KNOWN_MODEL_NAMES`** → would make it Path 1 (zero config change).
4. **Evidence that the room's content is overwhelmingly English** → would make the multilingual premium unnecessary and favor English-only models.
5. **A whitelisted model with 8K+ context** → would eliminate the need for Path 3 for long-document retrieval.

## Considered and rejected

| Model | Why rejected |
|---|---|
| Qwen3-Embedding-8B | Best scores (Retrieval 69.44, Classification 90.43) but 7.57 B params → ~32 GB fp32 / ~16 GB fp16 — impractical on 15 GB RAM [2]. Path 4. |
| Qwen3-Embedding-4B | 4.02 B params → ~16 GB fp32 / ~8 GB fp16 — borderline on 15 GB RAM with other processes [2]. Path 4. |
| jina-embeddings-v3 | Best long-context + late-chunking results, but CC-BY-NC-4.0 licence and model card states "requires CUDA-capable GPU for production throughput" [10]. Path 4. |
| gte-Qwen2-7B-instruct | 7.07 B params → ~28 GB fp32 — impractical [2]. Path 4. |
| KaLM-Embedding-Gemma3-12B | 11.8 B params → ~47 GB fp32 — impossible [2]. Path 4. |
| NV-Embed-v2 | 7.85 B params, CC-BY-NC-4.0 licence — impractical size and non-commercial [1]. Path 4. |
| SFR-Embedding-2_R | Highest Classification (90.54) but 15.7 points behind on Retrieval (53.75) — too specialized for the room's mixed workload [1]. Path 4. |
| stella_en_1.5B_v5 | 1.54 B params, 512 base context (MRL dims are output dims, not input context) — no long-context advantage [35]. Path 4. |
| voyage-4-nano | Open-weight (Apache-2.0) but only 9/131 MMTEB tasks — aggregate unverified [36]. Path 3. |
| EmbeddingGemma-2 (740M) | Multimodal with separable text encoder (270M of 740M), Apache-2.0, 8192 context — but released 2026-10-06, no MTEB scores published yet [4]. Path 3. |

## Findings

### A. The two-jobs question: one model or two?

The room has three embedding jobs: (a) semantic retrieval, (b) routing/classification, (c) dedup. The architecture decision is whether one model can serve all three.

**Evidence that one model suffices:**
- Qwen3-0.6B is simultaneously competitive on Retrieval (61.83), Classification (84.58), and PairClass (84.37) — the only CPU-feasible model that is top-3 on all three [1].
- Task conditioning (instruction-aware embeddings, per-call task type) is the mechanism: Qwen3-Embedding is instruction-aware ("using instructions typically yields an improvement of 1% to 5%") [37]; Cohere exposes per-call `input_type` [38]; Gemini exposes named task types with duplicate detection assigned to `SEMANTIC_SIMILARITY` [39].
- MTEB places duplicate detection in Pair Classification (SprintDuplicateQuestions, TwitterSemEval2015, TwitterURLCorpus) [40] — a symmetric task that uses the same embedding space as classification.
- jina-v3 demonstrates a single model with five task adapters (retrieval, classification, clustering, reranking, text-matching) scoring well on both jobs [41].

**Evidence that two models may be better:**
- The 2022 MTEB finding "no particular text embedding method dominates across all tasks" is stale at the top of the board (Qwen3-8B now leads both) but the broader point holds — no model wins every subset [42].
- SFR-2_R has the highest Classification (90.54) but is 15.7 points behind on Retrieval — if classification quality is paramount, a specialized model may help [1].
- MTEB-BR shows cross-category rank transfer is imperfect (classification ρ=0.68, clustering ρ=0.62) — a model that wins retrieval may not win classification on a different corpus [43].

**Recommendation:** start with one model (Qwen3-0.6B). It is the only CPU-feasible model that is simultaneously top-3 on retrieval, classification, and pair classification. If classification quality proves insufficient after deployment, add a specialized classifier — but the published evidence says the gap is small within a family.

### B. The hybrid architecture recommendation

The room already has FTS (OptMem's `recall` is a regex scan over the log). The published evidence strongly supports a hybrid architecture:

1. **BM25 is a robust zero-shot baseline** — dense bi-encoders underperform it out-of-distribution [16].
2. **Dense fails on identifiers** — "token amnesia" on tail entities, 12.08% false-positive rate at 100M docs [17] [18].
3. **Hybrid beats both parents** — RRF fusion gives +6 points average on BEIR [28], +18% over BM25 alone [26], best on 12/13 datasets [27].
4. **Fusion is cheap** — RRF is rank-based, needs no score calibration, k=60 default [25].
5. **The cost is low** — BM25 adds 0.4 GB / 20 ms CPU at 1M docs [31].

**Recommended architecture:** BM25 (FTS) + Qwen3-0.6B (dense) with RRF fusion. The lexical channel catches exact identifiers, file paths, and code symbols that dense misses; the dense channel catches semantic paraphrases that BM25 misses.

### C. The tradeoff curve

| Tier | Model | Params | Size (int8) | Retrieval | Classification | Context | CPU feasibility | Path |
|---|---|---|---|---|---|---|---|---|
| **Best quality** | Qwen3-8B | 7.57B | ~8 GB | 69.44 | 90.43 | 32K | Impractical | 4 |
| **Best CPU-feasible** | Qwen3-0.6B | 0.596B | ~0.6 GB | 61.83 | 84.58 | 32K | Feasible | 3 |
| **Smallest competitive** | EmbeddingGemma-300M | 0.308B | ~0.15 GB | 55.69 | 87.55 | 2K | Excellent | 3 |
| **Best whitelisted** | bge-base-en-v1.5 | 0.109B | ~0.21 GB | 54.75 | 77.69 | 512 | Excellent | 1 |
| **Smallest whitelisted** | all-MiniLM-L6-v2 | 0.023B | ~0.09 GB | — | — | 256 | Excellent | 1 |

The curve: quality scales with size, but the marginal gain from 0.6B → 8B is 7.6 retrieval points for 13× the size. The sweet spot for CPU is 0.3–0.6B params.

## Open questions

1. **No published i5-1135G7 CPU benchmark exists for any embedding model.** All CPU data is 16c desktop or server. The recommendation assumes Qwen3-0.6B at ~0.6 GB int8 is feasible on 15 GB RAM — this is derived from parameter count, not measured on the target hardware.
2. **No published benchmark covers agent-chat-log retrieval.** All identifier-heavy evidence is proxied from code retrieval (CoIR, CodeSearchNet) and entity retrieval (EntityQuestions). The room's actual corpus shape (prose + file paths + identifiers + code) is unmeasured.
3. **No published per-task dedup scores at CPU-relevant sizes.** SprintDuplicateQuestions / TwitterSemEval2015 / TwitterURLCorpus are pair-classification tasks, but no vendor publishes those per-task numbers in a card or paper.
4. **EmbeddingGemma-2 (740M, 2026-10-06) has no MTEB scores yet.** Its text encoder (270M of 740M) is Apache-2.0, 8192 context — potentially a strong CPU-feasible option once evaluated.
5. **The exact rank formula of the live MTEB leaderboard is undocumented.** Reproduction as a per-task average-rank aggregate is inference from data, not a quoted spec.
6. **Voyage has no MTEB data at all.** Only its own 100-dataset suite exists — not comparable to MTEB.

## Sources

### Primary — MTEB leaderboard (snapshot 2026-10-05, fetched 2026-10-07)

[1] MTEB leaderboard backend API. `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%9/scores` and `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%9/scores`. Fetched 2026-10-07.

### Primary — CPU inference and quantization

[2] E3 findings: `docs/research/embeddings/findings/E3-long-context-cpu.md`. Merged from F3 (long-context) and F5 (CPU inference) worker findings. 54 sources. Fetched 2026-10-07.

[5] sentence-transformers efficiency benchmark. `https://sbert.net/docs/sentence_transformer/usage/efficiency.html`. Fetched 2026-10-07.

[6] EmbeddingGemma LiteRT benchmark. `https://huggingface.co/litert-community/embeddinggemma-300m`. Fetched 2026-10-07.

[7] Ollama Qwen3-Embedding-0.6B. `https://ollama.com/library/qwen3-embedding:0.6b`. Fetched 2026-10-07.

[8] fastembed supported models. `https://qdrant.github.io/fastembed/examples/Supported_Models`. Fetched 2026-10-07.

[9] granite-embedding-english-r2 model card. `https://huggingface.co/ibm-granite/granite-embedding-english-r2`. Fetched 2026-10-07.

[10] jina-embeddings-v3 model card. `https://jina.ai/models/jina-embeddings-v3`. Fetched 2026-10-07.

[11] HuggingFace embedding quantization blog. `https://huggingface.co/blog/embedding-quantization`. Fetched 2026-10-07.

### Primary — Long-context

[12] LongEmbed paper (arXiv:2404.12096). `https://arxiv.org/html/2404.12096v3`. Fetched 2026-10-07.

[13] M2-BERT / LoCoV1 (arXiv:2402.07440). `https://arxiv.org/html/2402.07440v3`. Fetched 2026-10-07.

[14] Late chunking (arXiv:2409.04701). `https://arxiv.org/abs/2409.04701`. Fetched 2026-10-07.

[15] Nomic Embed technical report (arXiv:2402.01613). `https://arxiv.org/html/2402.01613v2`. Fetched 2026-10-07.

### Primary — Counter-angle: BM25 vs dense

[3] E4 findings: `docs/research/embeddings/findings/E4-counter-hybrid.md`. Merged from F4 (multilingual) and F8 (counter-angle) worker findings. 65 sources. Fetched 2026-10-07.

[16] BEIR paper (arXiv:2104.08663). `https://arxiv.org/html/2104.08663v4`. Fetched 2026-10-07.

[17] Reimers & Gurevych (arXiv:2012.14210). `https://arxiv.org/html/2012.14210v2`. Fetched 2026-10-07.

[18] EntityQuestions (arXiv:2109.08535). `https://arxiv.org/abs/2109.08535`. Fetched 2026-10-07.

[19] "What Are You Token About?" (ACL 2023). `https://aclanthology.org/2023.acl-long.140.pdf`. Fetched 2026-10-07.

[20] BRIGHT (arXiv:2407.12883). `https://arxiv.org/abs/2407.12883`. Fetched 2026-10-07.

[21] CoIR (arXiv:2407.02883). `https://arxiv.org/html/2407.02883v3`. Fetched 2026-10-07.

[22] CodeRAG-Bench (arXiv:2406.14497). `https://arxiv.org/html/2406.14497v2`. Fetched 2026-10-07.

[23] BGE-M3 paper (arXiv:2402.03216). `https://arxiv.org/html/2402.03216v5`. Fetched 2026-10-07.

[24] BEIR lexical bias (arXiv:2104.08663 §6). `https://arxiv.org/html/2104.08663v4`. Fetched 2026-10-07.

[25] Cormack, Clarke & Buettcher — RRF (SIGIR 2009). `https://dl.acm.org/doi/pdf/10.1145/1571941.1572114`. Fetched 2026-10-07.

[26] Elastic hybrid search blog. `https://www.elastic.co/search-labs/blog/improving-information-retrieval-elastic-stack-hybrid`. Fetched 2026-10-07.

[27] Vespa hybrid search blog. `https://blog.vespa.ai/improving-zero-shot-ranking-with-vespa-part-two/`. Fetched 2026-10-07.

[28] BEIR SIGIR-2024 resource paper (arXiv:2306.07471). `https://arxiv.org/html/2306.07471v1`. Fetched 2026-10-07.

[29] Qdrant hybrid search documentation. `https://qdrant.tech/documentation/search-tuning/hybrid-search/`. Fetched 2026-10-07.

[30] Elastic hybrid search — conditional gains. `https://www.elastic.co/search-labs/blog/improving-information-retrieval-elastic-stack-hybrid`. Fetched 2026-10-07.

[31] BEIR cost/size table (arXiv:2104.08663 §5.1). `https://arxiv.org/html/2104.08663v4`. Fetched 2026-10-07.

### Primary — Multilingual

[32] MTEB(Multilingual, v2) parquet recompute. `https://huggingface.co/datasets/mteb/results`. Fetched 2026-10-07.

[33] jina-embeddings-v3 licence. `https://huggingface.co/jinaai/jina-embeddings-v3`. Fetched 2026-10-07.

[34] granite-embedding-311m-multilingual-r2 model card. `https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2`. Fetched 2026-10-07.

### Primary — Model cards and papers

[4] E1 findings: `docs/research/embeddings/findings/E1-open-weights-landscape.md`. Merged from F1 (landscape) and F6 (multimodal text-only) worker findings. 65 sources. Fetched 2026-10-07.

[35] stella_en_1.5B_v5 model card. `https://huggingface.co/NovaSearch/stella_en_1.5B_v5`. Fetched 2026-10-07.

[36] voyage-4-nano model card. `https://huggingface.co/voyageai/voyage-4-nano`. Fetched 2026-10-07.

[37] Qwen3-Embedding model card. `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B`. Fetched 2026-10-07.

[38] Cohere embeddings documentation. `https://docs.cohere.com/docs/embeddings`. Fetched 2026-10-07.

[39] Gemini embeddings documentation. `https://ai.google.dev/gemini-api/docs/embeddings`. Fetched 2026-10-07.

[40] MTEB pair classification tasks. `https://docs.mteb.org/overview/available_tasks/pair-classification/`. Fetched 2026-10-07.

[41] jina-embeddings-v3 paper (arXiv:2409.10173). `https://arxiv.org/html/2409.10173v3`. Fetched 2026-10-07.

[42] MTEB 2022 paper (arXiv:2210.07316). `https://arxiv.org/html/2210.07316v3`. Fetched 2026-10-07.

[43] MTEB-BR (arXiv:2607.04581). `https://arxiv.org/html/2607.04581v2`. Fetched 2026-10-07.
