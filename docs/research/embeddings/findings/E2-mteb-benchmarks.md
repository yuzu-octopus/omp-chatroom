# E2 — MTEB benchmarks + retrieval vs classification suitability (cluster merge)

**Cluster:** Angle 2 (MTEB results) + Angle 7 (retrieval vs classification suitability)
**Manager:** EmbeddingResearch.M2-MTEBBenchmarks
**Fetch date for all items:** 2026-10-07
**Workers:** Angle2-MTEB (F2.md, 46 sources), Angle7-RetrievalVsClass (F7.md, 33 sources)

## Angle

Two questions merged:
1. What are the actual MTEB scores for top embedding models on retrieval, classification, clustering, STS?
2. Which models win at short-text classification/dedup vs long-text retrieval — one model or two?

The room has three embedding jobs: (a) semantic retrieval over the log, (b) routing/classifying a message, (c) near-duplicate post detection. The architecture decision is whether (a) and (b)+(c) want different models.

## Claims

### A. Suite definitions and metrics (prerequisite for reading every number)

- **There is no single "MTEB score".** Four different suites exist: `MTEB(eng, v1)` (56 datasets, superseded), `MTEB(eng, v2)` (41 tasks, current English), `MTEB(Multilingual, v2)` / MMTEB (131 tasks), `BEIR` (15 retrieval datasets). A number from one is not comparable to a number from another. / https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v1%9 / 2026-10-07 / primary
- **Per-category main metrics in MTEB(eng, v2):** Retrieval = `ndcg_at_10`, Classification = `accuracy`, Clustering = `v_measure`, STS = `cosine_spearman`, PairClassification = `max_ap`, Reranking = `map_at_1000`. / https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%9 / 2026-10-07 / primary
- **Category cells are populated iff the model has full coverage of that category's tasks.** An empty cell is a coverage flag, not a zero. Verified exhaustively: 0/340 Eng-v2 rows and 0/466 Multi-v2 rows violate the "Mean(Task) populated iff full coverage" rule. / https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%9/scores / 2026-10-07 / primary
- **The live board's displayed `rank` is NOT monotone in `Mean(Task)`.** Reproducing the ordering requires per-task average-rank aggregation, not the printed mean. The exact formula is undocumented. / https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%9/scores / 2026-10-07 / primary (inference from data)

### B. MTEB(eng, v2) — live leaderboard category averages (fetched 2026-10-07)

Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%9/scores` (Space rev `77f36c1`, 2026-10-05; results dataset 2026-10-04). All figures ×100. `—` = no score (partial coverage).

| Model | Rank | Mean(Task) | Class. | Clust. | Retr. | STS | PairClass. | Rerank. | Summ. | Params(B) | Dim | Max tok. |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `Qwen/Qwen3-Embedding-8B` | 5 | 75.23 | 90.43 | 58.57 | 69.44 | 88.58 | 87.52 | 51.56 | 34.83 | 7.567 | 4096 | 32768 |
| `Qwen/Qwen3-Embedding-4B` | 7 | 74.61 | 89.84 | 57.51 | 68.46 | 88.72 | 87.01 | 50.76 | 34.39 | 4.022 | 2560 | 32768 |
| `Qwen/Qwen3-Embedding-0.6B` | 26 | 70.47 | 84.58 | 54.05 | 61.83 | 86.57 | 84.37 | 48.18 | 33.43 | 0.596 | 1024 | 32768 |
| `Alibaba-NLP/gte-Qwen2-7B-instruct` | 28 | 70.72 | 88.52 | 58.97 | 58.09 | 82.69 | 85.90 | 50.47 | 35.74 | 7.069 | 3584 | 32768 |
| `Alibaba-NLP/gte-Qwen2-1.5B-instruct` | 43 | 67.20 | 85.84 | 53.54 | 50.25 | 82.51 | 87.52 | 49.25 | 33.94 | 1.543 | 8960 | 32768 |
| `intfloat/e5-mistral-7b-instruct` | 39 | 67.97 | 79.85 | 51.44 | 57.62 | 84.32 | 88.42 | 49.78 | 36.57 | 7.111 | 4096 | 32768 |
| `intfloat/multilingual-e5-large-instruct` | 60 | 65.56 | 75.71 | 49.89 | 53.47 | 84.72 | 86.24 | 48.74 | 29.89 | 0.56 | 1024 | 514 |
| `intfloat/e5-large-v2` | 102 | 62.79 | 76.44 | 45.23 | 49.31 | 80.67 | 86.06 | 45.72 | 32.34 | 0.335 | 1024 | 514 |
| `intfloat/e5-base-v2` | 107 | 62.67 | 75.48 | 45.20 | 49.67 | 80.64 | 85.63 | 45.13 | 34.26 | 0.109 | 768 | 512 |
| `intfloat/e5-small-v2` | 136 | 61.32 | 74.58 | 42.05 | 48.46 | 80.09 | 84.79 | 44.10 | 33.23 | 0.033 | 384 | 512 |
| `nomic-ai/nomic-embed-text-v1.5` | 117 | 62.20 | 75.71 | 47.55 | 47.97 | 78.70 | 85.16 | 46.01 | 28.56 | 0.137 | 768 | 8192 |
| `nomic-ai/nomic-embed-text-v1` | 90 | 63.60 | 76.77 | 46.64 | 50.72 | 81.78 | 85.15 | 45.71 | 30.40 | 0.137 | 768 | 8192 |
| `nomic-ai/nomic-embed-text-v2-moe` | 98 | 63.64 | 75.53 | 45.62 | 54.81 | 80.24 | 82.61 | 45.23 | 31.28 | 0.475 | 768 | 512 |
| `jinaai/jina-embeddings-v3` | 59 | — | — | 47.41 | 54.29 | 85.82 | 84.02 | 47.94 | 32.90 | 0.572 | 1024 | 8192 |
| `NovaSearch/stella_en_1.5B_v5` | 32 | 69.43 | 89.38 | 57.06 | 52.42 | 83.27 | 88.02 | 50.19 | 36.91 | 1.54 | 8960 | 131072 |
| `NovaSearch/stella_en_400M_v5` | 35 | 69.39 | 88.25 | 57.65 | 52.73 | 83.93 | 87.17 | 49.60 | 34.53 | 0.435 | 4096 | 8192 |
| `BAAI/bge-large-en-v1.5` | 64 | 65.89 | 78.34 | 48.01 | 55.44 | 82.79 | 87.13 | 48.26 | 33.13 | 0.335 | 1024 | 512 |
| `BAAI/bge-base-en-v1.5` | 72 | 65.14 | 77.69 | 47.42 | 54.75 | 82.12 | 86.56 | 46.66 | 30.19 | 0.109 | 768 | 512 |
| `BAAI/bge-small-en-v1.5` | 84 | 64.30 | 76.56 | 47.02 | 53.86 | 81.28 | 84.95 | 46.94 | 28.92 | 0.033 | 384 | 512 |
| `BAAI/bge-m3` | 218 | — | — | — | — | — | — | — | 34.77 | 0.568 | 1024 | 8192 |
| `mongodb/voyage-3` | 129 | 61.38 | 69.72 | 44.85 | 53.46 | 78.59 | 78.55 | 46.72 | 28.87 | — | 1024 | 32000 |
| `mongodb/voyage-3-lite` | 143 | 60.44 | 70.14 | 45.00 | 50.30 | 77.20 | 78.73 | 46.20 | 30.49 | — | 512 | 32000 |
| `openai/text-embedding-3-large` | 86 | — | 79.15 | 48.90 | 57.98 | 81.45 | — | — | 34.31 | — | 3072 | 8191 |
| `openai/text-embedding-3-small` | 113 | — | 77.56 | 47.46 | 53.48 | 81.35 | — | — | 32.49 | — | 1536 | 8191 |
| `openai/text-embedding-ada-002` | 230 | — | 75.79 | — | — | — | 84.89 | — | — | — | 1536 | 8191 |
| `google/gemini-embedding-001` | 9 | 73.30 | 90.05 | 59.39 | 64.35 | 85.29 | 87.70 | 48.59 | 38.28 | — | 3072 | 2048 |
| `google/embeddinggemma-300m` | 33 | 69.67 | 87.55 | 56.55 | 55.69 | 83.61 | 87.29 | 47.43 | 37.64 | 0.308 | 768 | 2048 |
| `mixedbread-ai/mxbai-embed-large-v1` | 52 | 66.26 | 79.10 | 47.48 | 55.40 | 84.42 | 87.20 | 48.05 | 32.63 | 0.335 | 1024 | 512 |
| `Snowflake/snowflake-arctic-embed-l-v2.0` | 99 | 63.60 | 73.37 | 44.37 | 58.56 | 78.05 | 83.00 | 47.47 | 33.83 | 0.568 | 1024 | 8192 |
| `nvidia/NV-Embed-v2` | 24 | 69.81 | 87.19 | 47.66 | 62.84 | 83.82 | 88.69 | 49.61 | 35.21 | 7.85 | 4096 | 32768 |
| `Salesforce/SFR-Embedding-2_R` | 42 | 69.82 | 90.54 | 59.39 | 53.75 | 80.86 | 88.09 | 48.99 | 35.54 | 7.111 | 4096 | 32768 |
| `BAAI/bge-en-icl` | 144 | — | 90.20 | — | — | — | 88.16 | 47.88 | — | 7.11 | 4096 | 32768 |

Confidence: **primary** (official leaderboard backend API, snapshot 2026-10-05).

Key readings:
- **Qwen3-8B leads in-scope Retrieval (69.44) AND has the highest in-scope Classification (90.43)** on Eng-v2 — the only model that is simultaneously top-2 on both. The next-best Classification model (SFR-2_R 90.54) is 15.7 points behind on Retrieval (53.75).
- **Qwen3-0.6B (0.596 B)** reaches Retrieval 61.83 / Classification 84.58 / STS 86.57 — within 7.6 Retrieval and 5.9 Classification points of its own 8B sibling, and beats bge-large-en-v1.5 (0.335 B) by 6.4 Retrieval and 6.2 Classification points.
- **BGE-M3 has no Eng-v2 category cells** (only Summarization 34.77; 27/41 tasks). Do not quote bge-m3 English-v2 retrieval from this board.
- **jina-v3 has no Eng-v2 Classification cell** on the live board (partial coverage), despite its paper reporting 82.58 on its own task selection.
- **Voyage-3-large has 3 task scores only** on Eng-v2; no category averages.

### C. MTEB(Multilingual, v2) — live leaderboard category averages (fetched 2026-10-07)

Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%9/scores`. ×100.

| Model | Rank | Mean(Task) | Class. | Clust. | Retr. | STS | PairClass. | Rerank. | Bitext | Params(B) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `Qwen/Qwen3-Embedding-8B` | 4 | 70.58 | 74.00 | 57.65 | 70.88 | 81.08 | 86.40 | 65.63 | 80.89 | 7.567 |
| `Qwen/Qwen3-Embedding-4B` | 6 | 69.45 | 72.33 | 57.15 | 69.60 | 80.86 | 85.05 | 65.08 | 79.36 | 4.022 |
| `Qwen/Qwen3-Embedding-0.6B` | 20 | 64.34 | 66.83 | 52.33 | 64.65 | 76.17 | 80.83 | 61.41 | 72.23 | 0.596 |
| `BAAI/bge-m3` | 51 | — | 60.35 | 40.88 | 54.59 | 74.12 | 80.76 | 62.79 | — | 0.568 |
| `intfloat/multilingual-e5-large-instruct` | 27 | 63.22 | 64.94 | 50.74 | 57.11 | 76.81 | 80.83 | 62.60 | 80.13 | 0.56 |
| `jinaai/jina-embeddings-v3` | 50 | 58.37 | 58.77 | 45.65 | 55.76 | 77.13 | 79.27 | 57.09 | 65.25 | 0.572 |
| `google/gemini-embedding-001` | 5 | 68.37 | 71.82 | 54.59 | 67.71 | 79.40 | 83.63 | 65.58 | 79.28 | — |
| `google/embeddinggemma-300m` | 31 | 61.15 | 60.90 | 51.17 | 62.49 | 74.73 | 81.40 | 63.25 | 64.40 | 0.308 |
| `nvidia/NV-Embedding-v2` | 47 | — | 57.29 | 40.80 | 56.72 | — | 78.94 | 63.82 | 57.84 | 7.85 |
| `Salesforce/SFR-Embedding-2_R` | 41 | 59.80 | 59.01 | 53.65 | 57.93 | 71.04 | 78.58 | 63.04 | 68.84 | 7.111 |
| `Alibaba-NLP/gte-Qwen2-7B-instruct` | 23 | 62.51 | 61.55 | 52.77 | 60.08 | 73.98 | 85.13 | 65.55 | 73.92 | 7.069 |
| `Alibaba-NLP/gte-Qwen2-1.5B-instruct` | 38 | — | — | — | 60.78 | — | 81.58 | 62.58 | 62.51 | 1.543 |
| `intfloat/e5-mistral-7b-instruct` | 36 | 60.03 | 60.31 | 50.57 | 55.75 | 74.02 | 81.12 | 63.82 | 68.40 | 7.111 |
| `nomic-ai/nomic-embed-text-v1.5` | 115 | 44.10 | 48.51 | 39.74 | 34.09 | 59.45 | 71.90 | 44.84 | 27.09 | 0.137 |
| `nomic-ai/nomic-embed-text-v2-moe` | 56 | 57.64 | 60.36 | 44.52 | 57.21 | 71.02 | 76.34 | 60.32 | 60.72 | 0.475 |
| `NovaSearch/stella_en_1.5B_v5` | 45 | 56.53 | 56.69 | 49.71 | 52.84 | 69.91 | 78.47 | 61.37 | 58.56 | 1.54 |
| `mongodb/voyage-3` | 71 | — | — | — | 66.18 | 68.52 | 76.18 | 63.36 | 60.03 | — |
| `openai/text-embedding-3-large` | 44 | — | 60.27 | 47.05 | 59.32 | — | — | 63.89 | 62.15 | — |
| `mixedbread-ai/mxbai-embed-large-v1` | 87 | 45.91 | 49.74 | 42.49 | 40.30 | 60.46 | 72.56 | 47.60 | 25.74 | 0.335 |
| `Snowflake/snowflake-arctic-embed-l-v2.0` | 63 | 57.03 | 57.39 | 42.76 | 58.36 | 70.11 | 76.71 | 63.67 | 64.08 | 0.568 |

Confidence: **primary**.

Key readings:
- **Qwen3-8B leads the in-scope multilingual field** at Mean(Task) 70.58, Retrieval 70.88, Classification 74.00.
- **English-tuned models collapse on multilingual**: nomic-v1.5 Retrieval 34.09, jina-v2-base-en 10.70, bge-large 39.00. BGE-M3 holds 54.59 with 130/131 coverage.
- **EmbeddingGemma vs Qwen3-0.6B on classification reverses between benchmarks**: EmbeddingGemma wins Eng-v2 (87.55 vs 84.58) but loses Multi-v2 (60.90 vs 66.83). "Which small model wins classification" is benchmark-dependent.

### D. BEIR (15 retrieval datasets, nDCG@10) — live board

Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/BEIR/scores`. ×100.

| Model | BEIR rank | BEIR mean nDCG@10 | Subsets scored |
|---|--:|--:|--:|
| `TencentBAC/Conan-embedding-v2` | 1 | 66.40 | 15/15 |
| `nvidia/NV-Embed-v2` | 3 | 63.21 | 15/15 |
| `Qwen/Qwen3-Embedding-8B` | 2 | 62.76 | 15/15 |
| `Qwen/Qwen3-Embedding-4B` | 7 | 61.58 | 15/15 |
| `Qwen/Qwen3-Embedding-0.6B` | 51 | 55.52 | 15/15 |
| `BAAI/bge-en-icl` | 5 | 62.16 | 15/15 |
| `NovaSearch/stella_en_1.5B_v5` | 12 | 59.31 | 15/15 |
| `Salesforce/SFR-Embedding-2_R` | 13 | 59.77 | 15/15 |
| `Alibaba-NLP/gte-Qwen2-7B-instruct` | 14 | 58.86 | 15/15 |
| `openai/text-embedding-3-large` | 35 | 55.43 | 15/15 |
| `BAAI/bge-large-en-v1.5` | 50 | 54.34 | 15/15 |
| `intfloat/multilingual-e5-large-instruct` | 77 | 52.74 | 15/15 |
| `nomic-ai/nomic-embed-text-v1.5` | 102 | 51.83 | 15/15 |
| `BAAI/bge-m3` | 284 | — | 5/15 |
| `google/gemini-embedding-001` | 228 | — | 4/15 |

Confidence: **primary**. Note: bge-m3, gemini-embedding-001, and embeddinggemma-300m have partial BEIR coverage — their means are not comparable to full-15 means.

### E. Model-card / paper numbers (first-party) and dated snapshots

**Qwen3 Embedding** (card snapshot 2025-05-24, paper snapshot 2025-06-04):
- MTEB(Eng, v2): Qwen3-0.6B Mean(Task) 70.70, Qwen3-4B 74.60, Qwen3-8B 75.22. The live board reproduces Qwen3-8B and 4B cells exactly; Qwen3-0.6B Classification drifted from 85.76 (card) to 84.58 (live).
- MTEB(Multilingual): Qwen3-8B Mean(Task) 70.58 — matches live board exactly. The card's "No.1" rank is now rank 4.
- / https://huggingface.co/Qwen/Qwen3-Embedding-4B / 2026-10-07 / primary

**BGE-M3** (paper, arXiv:2402.03216):
- MIRACL nDCG@10: M3 dense 69.2, M3 all 71.5. MKQA Recall@100: M3 all 75.5. MLDR nDCG@10: M3 all 65.0 (with caveat: M3's own long-doc training set used). NarrativeQA nDCG@10: M3 all 61.7.
- The bge-m3 card publishes no MTEB category table. / https://arxiv.org/pdf/2402.03216 / 2026-10-07 / primary

**E5** (paper, arXiv:2212.03533, snapshot 2022-12):
- MTEB English-v1 (56 datasets): E5-large (sup) Avg56 61.4, Class. 73.1, Clust. 43.3, Retr. 50.0, STS 82.1. E5-mistral-7b-instruct: 66.63 Avg56 (from live v1 board snapshot 2024-09-09).
- / https://arxiv.org/pdf/2212.03533 / 2026-10-07 / primary

**GTE** (cards):
- gte-Qwen2-7B-instruct: MTEB(56) 70.24, C-MTEB(35) 72.05. gte-base-en-v1.5: MTEB(56) 64.11. gte-large-en-v1.5: MTEB(56) 65.39.
- / https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct / 2026-10-07 / primary

**Stella** (paper, arXiv:2412.19048, snapshot 2024-12-24):
- stella_en_1.5B_v5: MTEB(56) 71.19, Class. 87.63, Clust. 57.69, Retr. 61.01, STS 84.51. stella_en_400M_v5: 70.11.
- / https://arxiv.org/pdf/2412.19048 / 2026-10-07 / primary

**Nomic** (card + technical report, arXiv:2402.01613):
- nomic-embed-text-v1: MTEB 62.39 (v1 suite). nomic-embed-text-v1.5: 62.28. nomic-embed-text-v2-moe: BEIR 52.86, MIRACL 65.80.
- / https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 / 2026-10-07 / primary

**jina-embeddings-v3** (paper, arXiv:2409.10173):
- MTEB (v1-shaped, own task selection): jina-v3 Average 65.52, Class. 82.58, Clust. 45.27, Retr. 53.87, STS 85.80. jina-v2-base-en: 60.38.
- LongEmbed (6 long-doc tasks): jina-v3 70.39 avg, jina-v2 58.12, text-embedding-3-large 51.30, bge-m3 56.56.
- / https://arxiv.org/pdf/2409.10173 / 2026-10-07 / primary

**Voyage** (first-party blog + spreadsheet, 2025-01-07):
- voyage-3-large (float, 2048): Voyage-suite overall avg NDCG@10 80.41%. voyage-3: 76.27%. voyage-3-lite: 72.73%. OpenAI v3 large: 70.67%. BGE M3: 67.45%.
- **These are NOT MTEB scores.** No MTEB category breakdown exists for any Voyage model on the current board.
- / https://blog.voyageai.com/2025/01/07/voyage-3-large/ / 2026-10-07 / primary

**OpenAI** (announcement, 2024-01-25):
- MTEB average: ada-002 61.0, text-embedding-3-small 62.3, text-embedding-3-large 64.6. These are v1-suite (56-dataset) numbers, confirmed against the frozen 2024-09-09 v1 board.
- / https://openai.com/index/new-embedding-models-and-api-updates/ / 2026-10-07 / primary

**Google Gemini** (API docs):
- MTEB score by MRL dimension: 2048d = 68.16, 1536d = 68.17. **Unverified which MTEB variant** — matches neither live Eng-v2 (73.30) nor Multi-v2 (68.37).
- / https://ai.google.dev/gemini-api/docs/embeddings / 2026-10-07 / primary (variant unverified)

**EmbeddingGemma** (paper, arXiv:2509.20354):
- MTEB(Eng, v2) Mean(Task) 69.67, MTEB(Multi, v2) Mean(Task) 61.15 — both match live board exactly. Classification 87.6 / Clustering 56.6 on Eng-v2 at 768d.
- / https://arxiv.org/pdf/2509.20354 / 2026-10-07 / primary

### F. Cross-task rank divergence (the "no model dominates" finding)

- **MTEB 2022 paper (arXiv:2210.07316):** "No particular text embedding method dominates across all tasks." ST5-XXL wins Classification (73.42), SGPT-5.8B-msmarco wins Retrieval (50.25). "Models geared towards STS perform badly on retrieval tasks" and vice versa. / https://arxiv.org/abs/2210.07316 / 2026-10-07 / primary
- **MMTEB 2025 (arXiv:2502.13595):** Per-category winners differ — `multilingual-e5-large-instruct` leads MTEB(Multilingual) and MTEB(Indic), `GritLM-7B` leads MTEB(Europe). / https://arxiv.org/html/2502.13595v4 / 2026-10-07 / primary
- **MTEB-BR (arXiv:2607.04581, 93 models, 22 Portuguese tasks):** "No single model leads all of retrieval, classification, and clustering." The same masked-language-model encoders that trail on retrieval rank among the leading models on classification. Cross-category rank transfer from global leaderboard: overall ρ=0.754, classification ρ=0.68, clustering ρ=0.62. / https://arxiv.org/html/2607.04581v2 / 2026-10-07 / primary
- **Live 2026 board confirms the divergence persists but the leaders have changed:** Qwen3-8B is now simultaneously the best in-scope model on Eng-v2 Retrieval (69.44) and Classification (90.43). The 2022 "no model dominates" finding is stale for the top of the board, though the broader point (no model wins every subset) still holds — Qwen3-8B does not win Clustering (gemini 59.39) or all retrieval subsets.

### G. Task conditioning — the mechanism that makes one model serve both jobs

- **Retrieval is asymmetric (short query → long document); classification and dedup are symmetric (text → text).** This is the structural reason for rank divergence. MTEB §4.2: "Retrieval tasks are unique in that there are two distinct types of texts: Queries and documents ('asymmetric'), while other tasks only have a single type of text ('symmetric')." / https://arxiv.org/html/2210.07316v3 / 2026-10-07 / primary
- **Cohere exposes per-call task type:** `input_type` ∈ `search_query` / `search_document` / `classification` / `clustering`. / https://docs.cohere.com/docs/embeddings / 2026-10-07 / primary
- **Gemini exposes named task types** with duplicate detection explicitly assigned to `SEMANTIC_SIMILARITY`. / https://ai.google.dev/gemini-api/docs/embeddings / 2026-10-07 / primary
- **EmbeddingGemma (300M) ships the same prompt taxonomy**, with Semantic Similarity flagged "not intended for retrieval use cases." / https://ai.google.dev/gemma/docs/embeddinggemma/model_card / 2026-10-07 / primary
- **Qwen3-Embedding is instruction-aware:** "using instructions (instruct) typically yields an improvement of 1% to 5% compared to not using them." / https://huggingface.co/Qwen/Qwen3-Embedding-0.6B / 2026-10-07 / primary
- **sentence-transformers documents the split:** use `encode_query()`/`encode_document()` for IR, `encode()` for all other tasks. / https://sbert.net/docs/package_reference/sentence_transformer/model.html / 2026-10-07 / primary
- **BGE v1.5 documents query instruction as retrieval-only:** "If you need to search the relevant passages to a query, we suggest to add the instruction to the query; in other cases, no instruction is needed." / https://huggingface.co/BAAI/bge-small-en-v1.5 / 2026-10-07 / primary
- **Voyage's `input_type` covers only query/document** — no first-class classification/clustering mode on the current 4-series. / https://docs.voyageai.com/docs/embeddings / 2026-10-07 / primary

### H. Single-model multi-task designs

- **jina-embeddings-v3 (570M) is explicitly one model with five task adapters** spanning retrieval, classification, clustering, reranking, and text-matching (dedup). LoRA adapters < 3% of total params. / https://arxiv.org/html/2409.10173v3 / 2026-10-07 / primary
- **jina-v3 measures a single model scoring well on both jobs:** MTEB English averages 65.52 overall, 82.58 Classification, 53.87 Retrieval, 85.80 STS. / same source / 2026-10-07 / primary
- **BGE-M3 is a single model doing dense + sparse + multi-vector retrieval** (multi-functionality within retrieval only; no classification/clustering adapters). / https://huggingface.co/BAAI/bge-m3 / 2026-10-07 / primary
- **E5's design intent is a single general-purpose model** across retrieval, clustering, and classification. / https://arxiv.org/abs/2212.03533 / 2026-10-07 / primary
- **GritLM (7B) unifies generation and embedding** at no performance loss — not CPU-viable on the target box. / https://arxiv.org/abs/2402.09906 / 2026-10-07 / primary

### I. Dedup is measured as pair classification, not retrieval

- **MTEB places duplicate detection in Pair Classification.** `SprintDuplicateQuestions`, `TwitterSemEval2015`, `TwitterURLCorpus` are pair-classification tasks scored by max AP. / https://docs.mteb.org/overview/available_tasks/pair-classification/ / 2026-10-07 / primary
- **Dedup is scored by a thresholded pair decision (AP/F1) or a ranking metric, not by nDCG@10 over a corpus.** A model can be strong at one and not the other. / https://arxiv.org/html/2210.07316v3 §4.2 / 2026-10-07 / primary
- **Both first-party task taxonomies route dedup to the symmetric/similarity mode:** Gemini `SEMANTIC_SIMILARITY` → "duplicate detection"; jina `text-matching` → "deduplication". / sources in §G / 2026-10-07 / primary
- **SemDeDup (Meta AI)** uses general-purpose embeddings + k-means + cosine threshold for dedup — no dedup-specialised model. / https://arxiv.org/html/2303.09540v3 / 2026-10-07 / primary

### J. Published guidance on model selection for mixed workloads

- **Do not select on the aggregate leaderboard number; select on the task that matches the workload.** MTEB §4.2, MTEB-BR §X ("model choice should follow the task"), MTEB-BR §VII (category-level rank transfer ρ=0.62–0.80, imperfect). / sources in §F / 2026-10-07 / primary
- **MTEB maintainers confirm the aggregate rank is not a per-task rank.** Borda points accumulate per task; missing tasks get zero. "A model with only retrieval results should not expect its overall rank to be the same as its retrieval rank." / https://github.com/embeddings-benchmark/mteb/discussions/3706 / 2026-10-07 / primary (maintainer statement)
- **RTEB (retrieval-only leaderboard) exists precisely because one rank cannot serve both.** / https://huggingface.co/blog/rteb / 2026-10-07 / primary
- **sentence-transformers guidance:** "models that perform well on the leaderboard do not necessarily do well on your tasks, it is crucial to experiment with various promising models." / https://sbert.net/docs/sentence_transformer/pretrained_models.html / 2026-10-07 / primary

## Searches

F2 (Angle 2) searches:
1. `MTEB leaderboard 2025 2026 BGE-M3 GTE Qwen3-Embedding E5 Nomic Jina Stella Voyage OpenAI retrieval classification clustering STS scores` — web_search
2. `site:huggingface.co/spaces/mteb/leaderboard embedding model scores retrieval classification` — web_search
3. `BAAI BGE-M3 MTEB scores retrieval classification clustering STS model card huggingface` — web_search
4. Direct fetches: MTEB leaderboard backend API for all 6 benchmark suites; 12 model card READMEs; 8 arXiv papers; frozen v1 board data file (2024-09-09); Voyage blog + spreadsheet; OpenAI announcement (archived); Gemini API docs; Nomic technical report PDF

F7 (Angle 7) searches:
1. `MTEB leaderboard classification vs retrieval model performance comparison` — Tavily
2. `embedding model selection classification dedup retrieval single model or two` — Tavily
3. `sentence-transformers model card classification retrieval task suitability` — Tavily
4. `MTEB leaderboard classification rank differs from retrieval rank correlation model` — Tavily
5. `EmbeddingGemma MTEB classification retrieval clustering score` — Tavily
6. `duplicate detection embedding model deduplication semantic dedup sentence transformers` — Tavily
7. `RTEB Retrieval Embedding Benchmark MTEB arXiv 2025` — web_search
8. Direct fetches: MTEB paper (arXiv:2210.07316), MMTEB (arXiv:2502.13595), MTEB-BR (arXiv:2607.04581), jina-v3 (arXiv:2409.10173), EmbeddingGemma (arXiv:2509.20354), SemDeDup (arXiv:2303.09540), GritLM (arXiv:2402.09906), E5 (arXiv:2212.03533), BGE-M3 (arXiv:2402.03216), Qwen3 (arXiv:2506.05176); Cohere/Gemini/EmbeddingGemma/Voyage docs; sentence-transformers docs; MTEB task taxonomy; MTEB maintainer discussion; RTEB blog; NVIDIA NeMo Curator docs; 6 model cards

## Conflicting evidence

1. **Card numbers vs live board for the same suite — real, large, date-driven.**
   - stella_en_1.5B_v5: 71.19 Avg(56) at rank 3 on frozen 2024-09-09 v1 board vs 70.54 Mean(Task) at rank 12 on live v1 board. Same suite, same model, 1.9 points of board movement.
   - nomic-embed-text-v1.5: 62.28 (card / frozen board) vs 61.09 (live v1).
   - Qwen3-0.6B Eng-v2 Classification: 85.76 (card snapshot 2025-05-24) vs 84.58 (live board 2026-10-07).
   - **Winner:** Live board (F2) — it is the current snapshot. Cards are frozen at their publication date.

2. **EmbeddingGemma vs Qwen3-0.6B on classification reverses between benchmarks.**
   - EmbeddingGemma wins Eng-v2 Classification (87.55 vs 84.58) but loses Multi-v2 Classification (60.90 vs 66.83). Both primary, same snapshot family.
   - **Winner:** Neither — the conflict is benchmark-dependent. A one-model choice cannot be made on a single category table.

3. **jina-embeddings-v3 Classification on Eng-v2: no cell (live board) vs 82.58 (paper).**
   - The live board has no Eng-v2 Classification cell for jina-v3 because it lacks full coverage. The paper's 82.58 is a weighted average over its own task selection with the classification adapter.
   - **Winner:** Not a true conflict — different task selections. Both primary, different scopes. The paper's number is the only primary Classification figure for jina-v3; the board's empty cell is a coverage flag.

4. **BGE-M3 MTEB coverage: no Eng-v2 cells (live board) vs full Multi-v2 cells (paper).**
   - F2 live board: bge-m3 has only Summarization 34.77 on Eng-v2 (27/41 tasks). F7 paper: bge-m3 has full Multi-v2 cells (59.56 Mean(Task), 54.60 Retrieval).
   - **Winner:** Both are correct for their respective suites. BGE-M3 simply has different coverage on different suites.

5. **"No single model dominates" — MTEB 2022 vs live 2026 board.**
   - F7: MTEB 2022 paper says no model dominates; ST5-XXL wins classification, SGPT-5.8B-msmarco wins retrieval.
   - F2: Live 2026 board shows Qwen3-8B is simultaneously the best in-scope model on Eng-v2 Retrieval (69.44) and Classification (90.43).
   - **Winner:** F2 live board — the 2022 finding is stale. Qwen3-8B now leads both categories. The broader point (no model wins every subset) still holds.

6. **MTEB-BR classification mirror image vs live English board.**
   - F7: MTEB-BR shows masked-language-model encoders that trail on retrieval rank among the leading models on classification (Portuguese).
   - F2: Live English board shows Qwen3-8B leads both.
   - **Winner:** Not a direct conflict — different languages. MTEB-BR is Portuguese-only and cannot be transplanted to English. Both can be true simultaneously.

7. **Voyage MTEB numbers: none exist.**
   - F2: No MTEB category breakdown for any Voyage model on the current board.
   - F7: Notes Voyage's classification/clustering instructions only for legacy voyage-large-2-instruct.
   - **Winner:** Consistent — Voyage simply has no MTEB coverage. Only Voyage's own 100-dataset suite exists.

8. **Gemini Embedding "MTEB score" has three different values in circulation.**
   - 68.16/68.17 by dimension in Google API docs (unlabelled variant); 73.30 Mean(Task) Eng-v2 in Qwen3 card snapshot; 68.37 Mean(Task) Multi-v2 on live board.
   - **Winner:** All three are primary; none is wrong; none is interchangeable. The API docs' variant is unverified.

9. **jina-v3 is cc-by-nc-4.0, not permissive.**
   - Any recommendation built on jina-v3's single-model multi-task story must carry this constraint. MTEB-BR §IX independently flags the same class of problem.
   - **Winner:** F7 caught this; F2 did not mention it. Relevant for production use.

## Gaps

- **Voyage has no MTEB data at all.** No category breakdown on any suite. Only Voyage's own 100-dataset suite exists. Unverified: no Voyage MTEB Retrieval/STS average in any source.
- **openai/text-embedding-ada-002 has no live Multi-v2 category cells** and only Classification (75.79) on Eng-v2. The 60.99 v1 average (frozen 2024-09-09) is its only complete primary number.
- **jina-embeddings-v2-base-en Eng-v2 numbers look broken** (Classification 49.07, Clustering 25.38, Retrieval 26.68 — implausibly low vs v1). Flagged, not explained.
- **No published benchmark isolates "short-text classification" and "long-text retrieval" as the two axes** for the exact sizes in this repo's CPU budget. The contrast is assembled from two benchmark families (MTEB classification + BEIR retrieval) rather than measured in one run.
- **No published MTEB task-type score for a dedup-specific task per model at CPU-relevant sizes.** SprintDuplicateQuestions / TwitterSemEval2015 / TwitterURLCorpus are pair-classification tasks, but no vendor publishes those per-task numbers in a card or paper.
- **No published guidance that says "use two embedding models" or "use one" as a direct recommendation** from a benchmark maintainer. The nearest statement is the Borda zero-for-missing-tasks design intent plus the separate RTEB retrieval surface.
- **Voyage's classification/clustering instructions are only documented for the legacy voyage-large-2-instruct**, not the current 4-series.
- **No first-party CPU latency numbers** attached to the classification-vs-retrieval decision. This angle is about quality; the CPU cost side is F5/E3's scope.
- **MTEB-BR is Brazilian Portuguese and cannot be transplanted.** Its cross-category rank correlations (classification ρ=0.68, clustering ρ=0.62) are the best published quantification of the divergence, but they are measured on 22 non-English tasks.
- **Gemini Embedding's API-doc "MTEB score" column has no stated variant.** Unverified as to which suite 68.16/68.17 refers to.
- **The live board's exact rank formula is not documented.** The reproduction as a per-task average-rank aggregate is inference from data, not a quoted spec.
- **No CPU/throughput data in this file.** Angle 5 / F5 owns it.

## Cluster verdict

Qwen3-Embedding-8B is the only model that is simultaneously top-2 on both Eng-v2 Retrieval (69.44) and Classification (90.43) on the live 2026-10-07 board — the 2022 "no model dominates" finding is stale at the top of the board. For CPU-feasible sizes, Qwen3-0.6B (0.6 B) reaches Retrieval 61.83 / Classification 84.58 / STS 86.57, within 7.6 Retrieval points of its 8B sibling, making it the strongest single-model candidate for the room's mixed workload. The classification-vs-retrieval divergence is real but mild within a family; the cross-family counter-examples (SFR-2_R 90.54 Classification but 53.75 Retrieval) trade 15.7 Retrieval points for 0.1 Classification points. Task conditioning (instruction-aware embeddings, per-call task type) is the mechanism that makes one model serve both jobs — Qwen3-Embedding is instruction-aware with documented 1-5% improvement from instructions. The architecture decision is not "one model or two" but "does the chosen model expose a task-type switch"; Qwen3-0.6B does, and at 0.6 B params it is the strongest CPU-feasible single-model choice for the room's retrieval + classification + dedup workload.
