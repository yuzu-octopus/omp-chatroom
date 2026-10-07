# E4 — Cluster: multilingual/MMTEB (Angle 4) + counter-angle lexical/BM25 vs dense (Angle 8)

Merged from worker findings files `F4.md` (multilingual/MMTEB) and `F8.md`
(lexical/BM25 counter-angle). This file is a merge, not new research. Every claim
below traces to a worker findings file; source URLs and fetch dates are carried
verbatim from those files. Fetch date for all items: **2026-10-07**.

Confidence scale: primary > secondary > speculative. `[parquet-recompute]` marks
the F4 worker's own aggregation over the official `mteb/results` parquet dataset
(dataset `lastModified` 2026-10-04) — official data, but not a leaderboard-published
aggregate; coverage count is printed with every such number.

---

## Angle

**Angle 4 — Multilingual / MMTEB.** Relevant if the room ever holds non-English
text. MMTEB scores, sizes, dims, licences, context, and the English-vs-multilingual
tradeoff for local (CPU-capable, text-only) multilingual embedding models: BGE-M3,
GTE multilingual / Qwen3-Embedding, E5 multilingual, Nomic multilingual, plus other
strong MMTEB performers.

**Angle 8 — Counter-angle: lexical/BM25 vs dense.** Evidence against dense
embeddings for this use case: the room is agent chatter full of identifiers, file
paths, code symbols. Sub-questions: where lexical/BM25 beats dense (published),
hybrid BM25+dense measured deltas, dense failure modes on exact identifiers/code,
domain-shift robustness.

---

## Claims

### Part A — Multilingual / MMTEB (from F4)

#### A1. Benchmark definition and scale

**A1.1. `MTEB(Multilingual, v2)` = 131 tasks; `MTEB(Multilingual)` is an alias to
the same object in mteb v2.x.** (F4 §A-1)
- source: https://github.com/embeddings-benchmark/mteb (`mteb/benchmarks/benchmarks/benchmarks.py`) | fetch 2026-10-07 | **primary**

**A1.2. MMTEB paper v4 (2025-11-13) states 132 datasets in its results table while
its prose says 131 tasks.** Discrepancy unresolved; current code says 131. (F4 §A-2)
- source: https://arxiv.org/abs/2502.13595 (v4) + https://arxiv.org/html/2502.13595v4 (Table 1, Table 2) | fetch 2026-10-07 | **primary**, discrepancy noted

**A1.3. MMTEB scale: >500 quality-controlled tasks, 250+ languages, 10 task
categories; full-benchmark runtime 3.11 h on one H100 for a 7B model, using 2% of
original documents.** (F4 §A-3)
- source: https://arxiv.org/abs/2502.13595 (abstract), https://arxiv.org/html/2502.13595v4 §2.3 | fetch 2026-10-07 | **primary**

**A1.4. MMTEB paper conclusion: best publicly available model at paper time =
`multilingual-e5-large-instruct`, 560M params, beating GritLM-7B and
e5-mistral-7b-instruct on MTEB(Multilingual).** (F4 §A-4)
- source: https://arxiv.org/abs/2502.13595 (abstract) | fetch 2026-10-07 | **primary**

#### A2. MMTEB scores — published (paper/card snapshots)

**A2.1. MMTEB Table 2, MTEB(Multilingual) 132 datasets (Avg / Avg-per-category,
Borda rank):** multilingual-e5-large-instruct 63.2/62.1 (rank 1, Borda 1375);
GritLM-7B 60.9/60.1; e5-mistral-7b-instruct 60.3/59.9; multilingual-e5-large
58.6/58.2; multilingual-e5-base 57.0/56.5; multilingual-e5-small 55.5/55.2;
multilingual-mpnet-base 52.0/51.1; LaBSE 52.1/51.9; multilingual-MiniLM-L12
48.8/48.0; all-mpnet-base 42.5/41.1; all-MiniLM-L12 42.2/40.9; all-MiniLM-L6
41.4/39.9. (F4 §A-5)
- source: https://arxiv.org/html/2502.13595v4 §3.3 Table 2 | fetch 2026-10-07 | **primary**

**A2.2. MMTEB Table 2, MTEB(Europe) 74 datasets:** GritLM-7B 63.0/62.7 (rank 1);
multilingual-e5-large-instruct 62.2/62.3; e5-mistral-7b-instruct 61.7/61.9;
multilingual-e5-large 58.5/58.7; mE5-base 57.2/57.5; mE5-small 55.0/55.7; LaBSE
51.8/53.5. **MTEB(Indic) 23 datasets:** multilingual-e5-large-instruct 70.2/71.6
(rank 1); multilingual-e5-large 66.4/65.1; mE5-base 64.6/62.6; mE5-small 64.7/63.2;
GritLM-7B 60.2/58.0; e5-mistral-7b-instruct 60.0/58.4. (F4 §A-6)
- source: https://arxiv.org/html/2502.13595v4 §3.3 Table 2 | fetch 2026-10-07 | **primary**

**A2.3. `[parquet-recompute]` MTEB(Multilingual, v2) mean(task), all 131 tasks
matched, official results as of 2026-10-07:**

| model | mean(task) | tasks matched | params | dim |
|---|---|---|---|---|
| Qwen3-Embedding-8B | **0.7058** | 131/131 | 7.57B | 4096 |
| Qwen3-Embedding-4B | 0.6945 | 131/131 | 4.02B | 2560 |
| Qwen3-Embedding-0.6B | 0.6434 | 131/131 | 0.596B | 1024 |
| multilingual-e5-large-instruct | 0.6322 | 131/131 | 0.560B | 1024 |
| gte-Qwen2-7B-instruct | 0.6251 | 131/131 | ~7.6B | 3584 |
| google/embeddinggemma-300m | 0.6115 | 131/131 | 0.308B | 768 |
| Cohere-embed-multilingual-v3.0 (API) | 0.6113 | 131/131 | n/a | 1024 |
| BAAI/bge-m3 | 0.5956 | 131/131 | 0.568B | 1024 |
| Alibaba-NLP/gte-multilingual-base | 0.5857 | 131/131 | 0.305B | 768 |
| multilingual-e5-large | 0.5847 | 130/131 | 0.560B | 1024 |
| jina-embeddings-v3 | 0.5837 | 131/131 | 0.572B | 1024 |
| nomic-embed-text-v2-moe | 0.5764 | 131/131 | 0.475B total / 0.305B active | 768 |
| multilingual-e5-base | 0.5703 | 131/131 | 0.278B | 768 |
| snowflake-arctic-embed-l-v2.0 | 0.5703 | 131/131 | 0.568B | 1024 |
| multilingual-e5-small | 0.5630 | 131/131 | 0.118B | 384 |
| snowflake-arctic-embed-m-v2.0 | 0.5370 | 131/131 | 0.305B | 768 |

(F4 §A-7)
- source: https://huggingface.co/datasets/mteb/results (parquet shards `data/train-000{0..3}-of-00004.parquet`), task list from `mteb` v2.x | fetch 2026-10-07 | **primary** (own aggregation of official results)

**A2.4. `[parquet-recompute]` same benchmark, full-coverage additional models
(comparable to A2.3):** ibm-granite/granite-embedding-311m-multilingual-r2 0.5596
(131/131); mongodb/voyage-3.5 (API) 0.5846 (131/131);
tencent/KaLM-Embedding-Gemma3-12B-2511 0.7232 (131/131, 12B — not a local-CPU
candidate); google/gemini-embedding-001 (API) 0.6837 (131/131). **Partial coverage
— NOT comparable to A2.3:** voyage-multilingual-2 0.6027 (110/131); voyage-4-large
/ voyage-4 / voyage-4-lite 0.5608 / 0.5524 / 0.5280 (2/131 each — aggregate
meaningless); Cohere-embed-v4.0 0.4942 (2/131 — meaningless);
bge-multilingual-gemma2 0.7750 (28/131); KaLM-mini-v2.5 0.7596 (24/131);
KaLM-mini-v2 0.7795 (18/131); voyage-4-nano 0.7287 (9/131). (F4 §A-8)
- source: https://huggingface.co/datasets/mteb/results parquet | fetch 2026-10-07 | **primary** (own aggregation), coverage caveats as stated

**A2.5. Qwen3-Embedding model card "MTEB (Multilingual)" table** (scores from the
MTEB leaderboard retrieved **May 24, 2025**), Mean(Task)/Mean(Type): Qwen3-8B
70.58/61.69 (4096d, 32K ctx); Qwen3-4B 69.45/60.86; Qwen3-0.6B 64.33/56.00 (1024d);
multilingual-e5-large-instruct 63.22/55.08; gte-Qwen2-7B-instruct 62.51/55.93;
Cohere-embed-multilingual-v3.0 61.12/53.23; BGE-M3 59.56/52.18;
text-embedding-3-large 58.93/51.41; gemini-embedding-exp-03-07 68.37/59.59. (F4 §B-9)
- source: https://huggingface.co/Qwen/Qwen3-Embedding-8B (model card, table note) | fetch 2026-10-07 | **primary** (vendor card; snapshot date given)

**A2.6. Qwen3-Embedding paper Table 2 (arXiv 2506.05176v1, 2025-06-05): same
values, but note says leaderboard retrieved June 4th, 2025** (card says May 24):
Qwen3-8B 70.58, 4B 69.45, 0.6B 64.33; BGE-M3 59.56; mE5-large-instruct 63.22;
Gemini Embedding 68.37. Qwen3 MMTEB evaluation covers 216 tasks = 131
MTEB(Multilingual) + 41 MTEB(English, v2) + 32 CMTEB + 12 MTEB(Code). (F4 §B-10, B-11)
- source: https://arxiv.org/html/2506.05176v1 §3.3 Table 2, §4.1 | fetch 2026-10-07 | **primary**

**A2.7. EmbeddingGemma paper Table 5 (arXiv 2509.20354v3, 2025-11-01) —
MTEB(Multi, v2) Mean(Task)/Mean(Type), leaderboard snapshot 2025-09-23:**
EmbeddingGemma (308M) 61.15/54.31; Gecko Embedding (278M) 53.47/46.23; GTE
Multilingual Base (305M) 58.24/51.44; mE5 Large Instruct (560M) 63.22/55.08; BGE-M3
(568M) 59.56/52.18; Jina v3 (572M) 58.37/50.66; Qwen3-0.6B (595M) 64.34/56.01;
Gemini Embedding (API) 68.37/59.59; Cohere Embed Multilingual v3 (API) 61.12/53.23;
text-embedding-3-large (API) 58.93/51.41. Process memory (MB) on the same run:
EmbeddingGemma 578, GTE Multilingual Base 582, mE5 Large Instruct 1068, Jina v3
1092, BGE-M3 2167, Qwen3-0.6B 2272. (F4 §B-12, B-13)
- source: https://arxiv.org/html/2509.20354v3 §4 Table 5 | fetch 2026-10-07 | **primary** (RAM, not CPU latency; hardware unspecified)

**A2.8. EmbeddingGemma paper Table 6 — MTEB(Multilingual, v2), models <500M
params, same 2025-09-23 snapshot:** EmbeddingGemma 61.2/54.3 (rank 8 overall,
578 MB); 512d 60.7/53.9; 256d 59.7/53.0; 128d 58.2/51.8; KaLM mini-v1 (494M)
57.0/50.0; gte-multilingual-base 58.2/51.4; multilingual-e5-base 57.0/49.8;
multilingual-e5-small 55.8/49.0; snowflake-arctic-embed-m-v2.0 53.7/46.9;
granite-embedding-278m-multilingual 53.7/47.2; USER-bge-m3 51.6/45.3. (F4 §B-14)
- source: https://arxiv.org/html/2509.20354v3 §4.3 Table 6 | fetch 2026-10-07 | **primary**

**A2.9. EmbeddingGemma official card — MTEB(Multilingual, v2) by output dim:**
768d 61.15/54.31; 512d 60.71/53.89; 256d 59.68/53.01; 128d 58.23/51.77.
MTEB(English, v2): 69.67/65.11 (768d) → 66.66/62.70 (128d). MTEB(Code, v1): 68.76
→ 62.96 (128d). QAT checkpoints (Multi v2, 768d): Q8_0 60.93/53.95; Q4_0
60.62/53.61; mixed 60.69/53.82. (F4 §B-15)
- source: https://ai.google.dev/gemma/docs/embeddinggemma/model_card | fetch 2026-10-07 | **primary**

**A2.10. EmbeddingGemma specs: 300M/308M params (HF safetensors total
302,863,104), 768-dim output (MRL to 128), max input context 2K tokens, trained on
~320B tokens, 100+ spoken languages, licence `gemma` (gated on HF), released
2025-09-04.** (F4 §B-16)
- source: https://ai.google.dev/gemma/docs/embeddinggemma/model_card ; https://huggingface.co/api/models/google/embeddinggemma-300m | fetch 2026-10-07 | **primary**

#### A3. Retrieval-specific multilingual benchmarks

**A3.1. BGE-M3 paper Table 1 — MIRACL dev, nDCG@10, avg over 18 languages:** Dense
69.2; Sparse 53.9; Multi-vec 70.5; Dense+Sparse 70.4; All (hybrid) 71.5. Baselines:
mE5_large 66.6; mDPR 41.8; mContriever 43.1; BM25 31.9; E5_mistral-7b 63.4. (F4 §C-17)
- source: https://arxiv.org/html/2402.03216v5 §4.1 Table 1 | fetch 2026-10-07 | **primary**

**A3.2. BGE-M3 specs: 1024 dim, 8192 sequence length, >100 languages, MIT licence,
dense + sparse + ColBERT multi-vector in one model.** (F4 §C-18)
- source: https://huggingface.co/BAAI/bge-m3 (model card "Specs") | fetch 2026-10-07 | **primary**

**A3.3. Nomic Embed v2 paper — retrieval averages.** MIRACL avg(18) nDCG@10: BGE M3
69.2; Nomic Embed v2 66.0; Arctic L v2.0 66.3; mE5 Large 66.6; E5 Large Instr. 66.1;
mGTE Base 63.6; mE5 Base 62.2. BEIR: Nomic Embed v2 52.86; mE5 Base 48.88; mGTE
Base 51.10; Arctic v2 Base 55.40; BGE M3 48.80; Arctic v2 Large 55.65; mE5 Large
51.40. (F4 §C-19)
- source: https://arxiv.org/html/2502.07972v1 §1 Table 1, §4.4 Table 5 | fetch 2026-10-07 | **primary**

**A3.4. Nomic Embed v2 model card restates the table: MIRACL 65.80 (16-language
avg) vs paper 66.0 (18-language avg). Card and paper quote different language
counts — do not mix.** (F4 §C-20)
- source: https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe | fetch 2026-10-07 | **primary**

**A3.5. nomic-embed-text-v2-moe specs: 475M total / 305M active (MoE, 8 experts
top-2), 768-dim (Matryoshka to 256), max sequence length 512 tokens, Apache-2.0,
~100 languages, requires `trust_remote_code=True`, task prefixes `search_query:` /
`search_document:` mandatory.** (F4 §C-21)
- source: https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe ; https://huggingface.co/api/models/nomic-ai/nomic-embed-text-v2-moe?expand[]=safetensors | fetch 2026-10-07 | **primary**

**A3.6. `[parquet-recompute]` MIRACLRetrievalHardNegatives.v2 (current MTEB task),
mean nDCG@10 over language subsets present:** BGE-M3 0.6964 (21 subsets);
nomic-embed-text-v2-moe 0.6663 (18); snowflake-arctic-embed-l-v2.0 0.6658 (19);
EmbeddingGemma-300m 0.6654 (20); gte-multilingual-base 0.6417 (18);
jina-embeddings-v3 0.6243 (20); multilingual-e5-base 0.6226 (20);
Qwen3-Embedding-0.6B 0.6197 (20); snowflake-arctic-embed-m-v2.0 0.6148 (18);
multilingual-e5-small 0.6046 (21); multilingual-e5-large-instruct 0.5835 (21);
multilingual-e5-large 0.5628 (2 — unreliable). Subset counts differ per model, so
cross-model comparison is approximate. (F4 §C-22)
- source: https://huggingface.co/datasets/mteb/results parquet | fetch 2026-10-07 | **primary** (own aggregation)

**A3.7. `[parquet-recompute]` legacy MIRACLRetrieval task, mean nDCG@10:**
gte-multilingual-base 0.6351 (18); multilingual-e5-base 0.6220 (18);
jina-embeddings-v3 0.6193 (18); snowflake-arctic-embed-m-v2.0 0.6062 (18);
multilingual-e5-small 0.5930 (18); snowflake-arctic-embed-l-v2.0 0.6611 (18);
multilingual-e5-large-instruct 0.5605 (18); BGE-M3 0.7107 (3 — partial);
nomic-v2-moe 0.6591 (1 — unreliable); Qwen3-0.6B 0.7466 (1 — unreliable). (F4 §C-23)
- source: https://huggingface.co/datasets/mteb/results parquet | fetch 2026-10-07 | **primary** (own aggregation), coverage caveats as stated

**A3.8. Arctic-Embed 2.0 paper Table 1 — nDCG@10, MTEB-R / CLEF / MIRACL /
MIRACL-O:** Arctic-Embed 2.0-M (113M non-emb params, 768d): 0.554/0.534/0.592/0.552;
+trunc 256d: 0.549/0.522/0.578/0.545. Arctic-Embed 2.0-L (303M, 1024d):
0.556/0.541/0.649/0.558; +trunc 256d: 0.547/0.530/0.638/0.547. GTE Multilingual
Base: 0.511/0.479/0.621/0.523. BGE M3: 0.488/0.410/0.678/0.568. ME5 Large:
0.514/0.431/0.651/0.540. ME5 Base: 0.489/0.432/0.608/0.509. Arctic-Embed 1.0-M
(English-only): 0.549 MTEB-R. OpenAI text-embedding-3-large: 0.554* MTEB-R / 0.565
CLEF / 0.549* MIRACL. Voyage Multilingual 2: 0.569 CLEF. (F4 §C-24)
- source: https://arxiv.org/html/2412.04506v2 §3.2 Table 1 | fetch 2026-10-07 | **primary**

**A3.9. Arctic-Embed 2.0 paper: moving English-only → multilingual cost −1.3 pts
(E5 Base), −2.9 pts (GTE Base), −3.3 pts (BGE Large) on MTEB-R; the paper's own
models avoid the gap and it attributes this to training-data quality.** (F4 §C-25)
- source: https://arxiv.org/html/2412.04506v2 §4.2 | fetch 2026-10-07 | **primary**

**A3.10. Arctic-Embed 2.0 specs: m-v2.0 = 305,368,320 params (gte-based, 768d);
l-v2.0 = 567,754,752 params (xlm-roberta-based, 1024d); both Apache-2.0, MRL
truncation to 256d.** (F4 §C-26)
- source: https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0 ; https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0 ; https://arxiv.org/html/2412.04506v2 §2.1 | fetch 2026-10-07 | **primary**

#### A4. English-only vs multilingual on the same benchmark

**A4.1. `[parquet-recompute]` MTEB(eng, v2) mean(task), 41/41 tasks matched, next to
MMTEB mean(task):**

| model | type | eng v2 mean(task) | MMTEB mean(task) |
|---|---|---|---|
| Qwen3-Embedding-8B | multi | 0.7478 | 0.7058 |
| Qwen3-Embedding-4B | multi | 0.7401 | 0.6945 |
| Qwen3-Embedding-0.6B | multi | 0.6913 | 0.6434 |
| embeddinggemma-300m | multi | 0.6836 | 0.6115 |
| jina-embeddings-v3 | multi | 0.6691 | 0.5837 |
| multilingual-e5-large-instruct | multi | 0.6500 | 0.6322 |
| bge-m3 | multi | 0.6339 (**28/41**) | 0.5956 |
| nomic-embed-text-v2-moe | multi | 0.6300 | 0.5764 |
| arctic-embed-l-v2.0 | multi | 0.6291 | 0.5703 |
| granite-embedding-english-r2 | **en-only** | 0.6284 | 0.6489 (**25/131**) |
| gte-multilingual-base | multi | 0.6242 | 0.5857 |
| multilingual-e5-large | multi | 0.6175 | 0.5847 |
| arctic-embed-m-v2.0 | multi | 0.6131 | 0.5370 |
| bge-large-en-v1.5 | **en-only** | 0.6127 | — |
| multilingual-e5-base | multi | 0.6009 | 0.5703 |
| bge-small-en-v1.5 | **en-only** | 0.5967 | — |
| multilingual-e5-small | multi | 0.5888 | 0.5630 |
| nomic-embed-text-v1.5 | **en-only** | 0.5795 | 0.4410 |
| all-MiniLM-L6-v2 | **en-only** | 0.5443 | 0.4139 |

Reading: at ~0.6B the top multilingual models now exceed English-only models of
similar or larger size on English (Qwen3-0.6B 0.6913 vs bge-large-en-v1.5 0.6127);
the residual multilingual penalty shows as the MMTEB column dropping ~0.05–0.11.
(F4 §D-27)
- source: https://huggingface.co/datasets/mteb/results parquet + `mteb` v2.x task lists | fetch 2026-10-07 | **primary** (own aggregation); incomplete-coverage rows marked

**A4.2. Qwen3 paper Table 3 — MTEB(Eng, v2) Mean(Task)/Mean(Type)** (snapshot
2025-06-04): Qwen3-8B 75.22/68.70; Qwen3-4B 74.60/68.09; Qwen3-0.6B 70.70/64.88;
gte-Qwen2-7B-instruct 70.72/65.77; NV-Embed-v2 69.81/65.00; GritLM-7B 67.07/63.22;
multilingual-e5-large-instruct 65.53/61.21; text-embedding-3-large 66.43/62.15;
cohere-embed-multilingual-v3.0 66.01/61.43; Gemini Embedding 73.30/67.67. (F4 §D-28)
- source: https://arxiv.org/html/2506.05176v1 §4.2 Table 3 | fetch 2026-10-07 | **primary**

**A4.3. English-vs-multilingual sanity check, same family:** multilingual-e5 small
0.5888 eng v2 / 0.5630 MMTEB vs bge-small-en-v1.5 0.5967 eng v2 — English-only
still wins at the tiny end. nomic-embed-text-v2-moe 0.6300 eng v2 vs
nomic-embed-text-v1.5 (English-only) 0.5795 eng v2 — multilingual MoE wins at ~3.5×
the parameters. (F4 §D-40)
- source: parquet recompute as in A4.1 | fetch 2026-10-07 | **primary** (own aggregation)

#### A5. Specs table (params / dim / context / licence)

**A5.1. Specs, primary sources (HF cards + HF API `safetensors` totals):**

| model | params | dim (MRL) | max ctx | licence |
|---|---|---|---|---|
| BAAI/bge-m3 | ~568M (0.6B class) | 1024 | 8192 | MIT |
| Alibaba-NLP/gte-multilingual-base | 305,369,089 | 768 (128–768) | 8192 | Apache-2.0 |
| Qwen/Qwen3-Embedding-0.6B | 595,776,512 | 1024 (32–1024) | 32768 | Apache-2.0 |
| Qwen/Qwen3-Embedding-4B | 4,021,774,336 | 2560 | 32768 | Apache-2.0 |
| Qwen/Qwen3-Embedding-8B | 7,567,295,488 | 4096 (32–4096) | 32768 | Apache-2.0 |
| intfloat/multilingual-e5-small | 117,654,272 | 384 | 512 | MIT |
| intfloat/multilingual-e5-base | 278,044,162 | 768 | 512 | MIT |
| intfloat/multilingual-e5-large | 559,890,946 | 1024 | 512 | MIT |
| intfloat/multilingual-e5-large-instruct | 559,890,432 | 1024 | 512 | MIT |
| nomic-ai/nomic-embed-text-v2-moe | 475,292,928 (305M active) | 768 (→256) | 512 | Apache-2.0 |
| nomic-ai/nomic-embed-text-v1.5 | 136,731,648 | 768 (→64) | 8192 | Apache-2.0 |
| jinaai/jina-embeddings-v3 | 572,310,396 | 1024 (→32) | 8192 | **CC-BY-NC-4.0** |
| Snowflake/snowflake-arctic-embed-m-v2.0 | 305,368,320 | 768 (→256) | 8192 | Apache-2.0 |
| Snowflake/snowflake-arctic-embed-l-v2.0 | 567,754,752 | 1024 (→256) | 8192 | Apache-2.0 |
| ibm-granite/granite-embedding-311m-multilingual-r2 | 311,664,384 | 768 (→128) | 32768 | Apache-2.0 |
| ibm-granite/granite-embedding-97m-multilingual-r2 | 97,441,152 | 384 | 32768 | Apache-2.0 |
| ibm-granite/granite-embedding-small-english-r2 | 47M (card) | 384 | 8192 | Apache-2.0 |
| google/embeddinggemma-300m | 302,863,104 | 768 (→128) | 2048 | gemma (gated) |
| LiquidAI/LFM2.5-Embedding-350M | 354,483,968 | 1024 (CLS) | 512 | LFM Open License v1.0 |
| KaLM-Embedding/KaLM-embedding-multilingual-mini-instruct-v2.5 | 494,032,768 | 896 (→64) | 32768 | Apache-2.0 |

(F4 §E-30)
- sources: HF model cards + `https://huggingface.co/api/models/<id>?expand[]=safetensors&expand[]=config` | fetch 2026-10-07 | **primary** (param counts from safetensors index where available; BGE-M3 param count not exposed by API → "0.6B class")

**A5.2. jina-embeddings-v3 is CC-BY-NC-4.0 — non-commercial. Disqualifying for most
production use despite competitive scores (0.5837 MMTEB, 0.6691 eng v2).** (F4 §E-31)
- source: https://huggingface.co/jinaai/jina-embeddings-v3 (licence field + card front-matter) | fetch 2026-10-07 | **primary**

**A5.3. granite-embedding-311m-multilingual-r2 vendor claim: "Multilingual MTEB
Retrieval (18 tasks) = 65.2" vs granite-embedding-278m-multilingual 52.2 (+13 pts),
avg 56.3 across all retrieval benchmarks (+14.5 over previous generation). 311M,
768d, 32K ctx, Apache-2.0, released 2026-04-29.** Different subset from
MTEB(Multilingual, v2) mean(task) = 0.5596 recomputed. (F4 §E-32)
- source: https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2 | fetch 2026-10-07 | **primary** (vendor card)

**A5.4. KaLM-Embedding-V2 paper Table 2 (leaderboard accessed 2025-09-10) —
MTEB(eng, v1) Mean(Task):** KaLM-V2.5 69.33, KaLM-V2 67.47, Qwen3-Embedding-0.6B
66.76, jina-embeddings-v3 65.51, gte-multilingual-base 61.40, multilingual-e5-large
60.89, bge-m3 59.84; MTEB(cmn, v1): KaLM-V2.5 70.93, bge-multilingual-gemma2 67.64,
KaLM-V2 68.15, gte-Qwen2-1.5B 67.12, Qwen3-0.6B 66.33. (F4 §E-33)
- source: https://arxiv.org/html/2506.20923v4 §4 Table 2 | fetch 2026-10-07 | **primary**

**A5.5. LFM2.5-Embedding-350M published retrieval numbers (vendor benchmark, not
MTEB):** NanoBEIR Multilingual Extended nDCG@10 AVG 0.577 (vs Qwen3-Embedding-0.6B
0.556, gte-multilingual-base 0.528, LFM2-ColBERT-350M 0.540); MKQA-11 Recall@20 AVG
0.691 (vs Qwen3-0.6B 0.638, gte-multilingual-base 0.675). 11 languages, 512-token
docs. (F4 §E-34)
- source: https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M | fetch 2026-10-07 | **primary** (vendor card), **secondary benchmark** (NanoBEIR/MKQA-11 subsets, vendor-run)

**A5.6. Published CPU/edge latency exists only for LFM2.5 and only on Apple
Silicon:** llama.cpp fp16 on MacBook Pro M4 Max, 32-token query, 256-token doc, docs
cached → query embedding p50 7.3 ms / p95 9.6 ms; enterprise GPU stack p50 1.5 ms.
granite r2 publishes **H100** throughput (199 docs/sec for
granite-embedding-small-english-r2, 512-token sliding window). **No x86 CPU latency
found for any model in this angle → unverified for i5-1135G7-class hardware.**
(F4 §E-35)
- source: https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M ; https://huggingface.co/ibm-granite/granite-embedding-small-english-r2 | fetch 2026-10-07 | **primary**

**A5.7. English-only baselines for the gap comparison:** BGE-M3 MIRACL 69.2 dense
(paper) vs BEIR 48.80 (nomic card). granite-embedding-small-english-r2 (47M, 384d,
8192 ctx, Apache-2.0): BEIR Retrieval (15) 50.9, MTEB-v2 (41) 61.1, CoIR 53.8,
MLDR(En) 39.8. (F4 §E-36)
- source: https://huggingface.co/ibm-granite/granite-embedding-small-english-r2 ; https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe ; https://arxiv.org/html/2402.03216v5 | fetch 2026-10-07 | **primary**

**A5.8. API-only models (not local, for completeness):**
gemini-embedding-001 — 2048 input-token limit, output dims 128–3072 (recommended
768/1536/3072), 100+ languages, $0.15/1M input tokens, GA 2025-07-14; MMTEB
mean(task) 0.6837 (131/131, parquet-recompute) and 68.37 Mean(Task) per Qwen/
EmbeddingGemma tables. Cohere embed-multilingual-v3.0 — 1024 dim, 512 max tokens,
100+ languages; 61.12/53.23 (2025-05-24 snapshot) and 0.6113 (131/131 recompute);
Cohere embed-v4.0 aggregate **unverified** (2/131). Voyage — voyage-4-large / -4 /
-4-lite (32k ctx, 1024 default dim, 256/512/2048 selectable), legacy
voyage-multilingual-2 (32k, 1024d); voyage-3.5 0.5846 (131/131),
voyage-multilingual-2 0.6027 (110/131); voyage-4 family **unverified** (2/131).
(F4 §E-37, E-38, E-39)
- source: https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001 ; https://docs.cohere.com/v2/docs/cohere-embed ; https://docs.voyageai.com/docs/embeddings ; parquet | fetch 2026-10-07 | **primary**

### Part B — Counter-angle: lexical/BM25 vs dense (from F8)

#### B1. Lexical/BM25 vs dense — head-to-head published evidence

**B1.1. BEIR headline: BM25 is a robust zero-shot baseline; dense/sparse bi-encoders
often underperform it out-of-distribution.** 18 datasets, 10 systems. Average
nDCG@10 performance *relative to BM25*: DPR −47.7%, ANCE −7.4%, TAS-B −2.8%, GenQ
−3.6%, docT5query +1.6%, ColBERT +2.5%, BM25+CE +11%. (F8 §A1)
- source: https://arxiv.org/html/2104.08663v4 (Table 2) | fetch 2026-10-07 | **primary**

**B1.2. In-domain performance does not predict out-of-domain performance; BM25
underperforms neural by 7–18 points on in-domain MS MARCO yet beats many of them
zero-shot.** MS MARCO nDCG@10: BM25 0.228 vs TAS-B 0.408; TREC-COVID: BM25 0.656 vs
DPR 0.332, TAS-B 0.481. (F8 §A2)
- source: https://arxiv.org/html/2104.08663v4 §5 + Table 2 | fetch 2026-10-07 | **primary**

**B1.3. Dense retrievers underperform BM25 specifically on datasets with large
domain shift (BioASQ) or task shift (Touché-2020).** (F8 §A3)
- source: https://arxiv.org/html/2104.08663v4 §5 finding 3 | fetch 2026-10-07 | **primary**

**B1.4. Contriever authors: dense retrievers "do not transfer well to new
applications with no training data, and are outperformed by unsupervised
term-frequency methods such as BM25."** Their unsupervised model beats BM25 on
11/15 datasets for Recall@100 (not nDCG@10). (F8 §A4)
- source: https://arxiv.org/abs/2112.09118 (16 Dec 2021) | fetch 2026-10-07 | **primary**

**B1.5. Dense performance "severely degrades under a domain shift"; unsupervised
domain adaptation (GPL) recovers up to 9.3 nDCG@10 points on six domain-specialized
datasets.** (F8 §A5)
- source: https://arxiv.org/abs/2112.07577 (14 Dec 2021) | fetch 2026-10-07 | **primary**

**B1.6. HyDE exists because fully zero-shot dense retrieval without relevance
labels is hard; it needs an instruction-following LLM to generate a hypothetical
document to reach competitive quality.** (F8 §A6)
- source: https://arxiv.org/abs/2212.10496 (20 Dec 2022) | fetch 2026-10-07 | **primary**

#### B2. Theory: dense fixed-vector capacity and large-index failure

**B2.1. Probability of dense false positives increases with index size and decreases
with embedding dimensionality (proved analytically, spherical-cap argument).**
(F8 §B1)
- source: https://arxiv.org/html/2012.14210v2 §3 (Reimers & Gurevych, ACL 2021) | fetch 2026-10-07 | **primary**

**B2.2. Measured: dense 768-dim (no hard negatives) MRR@10 88.99 at 10k index →
17.34 at 8.8M index, falling below BM25 at 8.8M (17.56).** MS MARCO passage, 8.8M
docs. (F8 §B2)
- source: https://arxiv.org/html/2012.14210v2 Table 1 | fetch 2026-10-07 | **primary**

**B2.3. BM25 ranked a randomly generated noise passage above the relevant passage
for 0.00% of queries at every index size (100k/1M/10M/100M); dense 128-dim did so
for up to 9.73%.** MS MARCO/NQ. (F8 §B3)
- source: https://arxiv.org/html/2012.14210v2 Table 3 | fetch 2026-10-07 | **primary**

**B2.4. DPR retrieved a random-string passage above the relevant passage for up to
12.08% of questions when the index contained 100M entries with real Wikipedia
titles + random paragraphs.** (F8 §B4)
- source: https://arxiv.org/html/2012.14210v2 Table 3 | fetch 2026-10-07 | **primary**

**B2.5. Dual-encoder capacity is bounded by encoding dimension, margin between gold
and lower-ranked docs, and document length — a limitation for precise retrieval of
long documents; sparse-dense hybrids are proposed to "capitalize on the precision of
sparse retrieval."** (F8 §B5)
- source: https://arxiv.org/abs/2005.00181 (Luan et al., TACL 2021) | fetch 2026-10-07 | **primary**

#### B3. Exact identifiers, entities, and code-specific failures

**B3.1. Dense retrievers "drastically underperform sparse methods" on simple,
entity-rich questions (EntityQuestions); they generalize only to common entities
unless the question pattern was seen in training, and data augmentation does not fix
it.** (F8 §C1)
- source: https://arxiv.org/abs/2109.08535 (Sciavolino et al., 17 Sep 2021) | fetch 2026-10-07 | **primary**

**B3.2. "Token amnesia": dense retrievers' inability to handle tail entities
correlates with token distributions forgetting entity tokens; injecting lexical
information at inference improves zero-shot retrieval, specifically on BEIR.**
(F8 §C2)
- source: https://aclanthology.org/2023.acl-long.140.pdf ("What Are You Token About?", ACL 2023) | fetch 2026-10-07 | **primary**

**B3.3. CoIR (code retrieval) headline: "even state-of-the-art models struggle in
code retrieval"; models that top text leaderboards do not transfer — GTE-Base ranks
2nd on BEIR but 6th on CoIR.** (F8 §C3)
- source: https://arxiv.org/html/2407.02883v3 §5.4 Table 6 (CoIR, ACL 2025) | fetch 2026-10-07 | **primary**

**B3.4. On CoIR, BM25 average nDCG@10 = 29.79 vs dense/code models: Contriever
36.40, GTE-Base 36.75, UniXcoder 37.33, BGE-M3 39.31, BGE-Base 42.77,
OpenAI-Ada-002 45.59, E5-base 50.90, E5-Mistral 55.18, Voyage-Code-002 56.26.**
Counter-evidence: dense generally beats BM25 on code retrieval. (F8 §C4)
- source: https://arxiv.org/html/2407.02883v3 Table 3 | fetch 2026-10-07 | **primary**

**B3.5. CoIR lists as a benchmark limitation that real code needs meta-data
(programming-language / library *versioning* materially changes whether a snippet
works) and that its queries are purely semantic/textual — version strings are not
covered by any benchmark.** (F8 §C5)
- source: https://arxiv.org/html/2407.02883v3 §7 Limitations | fetch 2026-10-07 | **primary**

**B3.6. BM25's weakness on code is largely an *IDF/tokenization* problem, not a
lexical-vs-dense problem: replacing BM25's log RSJ-odds IDF with a q-log lifted
CoIR CodeSearchNet-Go nDCG@10 from 0.2575 → 0.4874 (+89.3%, p≤1e-4), and an
identifier-aware tokenization ablation "largely removes the incremental gain."**
(F8 §C6)
- source: https://arxiv.org/abs/2605.18561 (18 May 2026) | fetch 2026-10-07 | **primary**

**B3.7. CodeSearchNet Challenge defines the code-search task precisely as needing to
"bridge the gap between the language used in code (often abbreviated and highly
technical) and natural language" — queries and corpus are lexically different by
construction.** 6M functions, 6 languages, 99 expert-annotated queries. (F8 §C7)
- source: https://arxiv.org/abs/1909.09436 | fetch 2026-10-07 | **primary**

**B3.8. CodeRAG-Bench counter-finding: dense embedding models frequently surpass
BM25 on code retrieval, because competitive retrievers are trained on code data;
Jina-v2-code beats GIST-base and BGE-base by 7.4 and 6.6 average nDCG@10.**
(F8 §C8)
- source: https://arxiv.org/html/2406.14497v2 §3.2 (NAACL 2025 Findings) | fetch 2026-10-07 | **primary**

**B3.9. BRIGHT: the then-top MTEB retriever (SFR-Embedding-Mistral) scored 59.0
nDCG@10 on MTEB but only 18.3 on BRIGHT — reasoning-intensive queries (incl. coding)
collapse retrieval quality.** (F8 §C9)
- source: https://arxiv.org/abs/2407.12883 (16 Jul 2024) | fetch 2026-10-07 | **primary**

#### B4. Hybrid (BM25 + dense) — measured deltas

**B4.1. Reciprocal Rank Fusion (RRF) "consistently yields better results than any
individual system" across TREC experiments; rank-based, needs no score calibration;
k=60 default.** (F8 §D1)
- source: https://dl.acm.org/doi/pdf/10.1145/1571941.1572114 (Cormack, Clarke & Buettcher, SIGIR 2009) | fetch 2026-10-07 | **primary**

**B4.2. Elastic first-party: RRF (k=20, N=1000) raises average NDCG@10 by 1.4% over
ELSER alone and 18% over BM25 alone on a 9-dataset BEIR subset; better-or-equal to
BM25 alone on all test datasets.** Blog dated 20 Jul 2023. (F8 §D2)
- source: https://www.elastic.co/search-labs/blog/improving-information-retrieval-elastic-stack-hybrid | fetch 2026-10-07 | **primary (vendor)**

**B4.3. Elastic: picking the best method per dataset gives +3% (over ELSER) and +20%
(over BM25) — the ceiling hybrid tuning chases; linear score combination needs ~40
annotated queries to beat RRF and is not "plug and play".** (F8 §D3)
- source: same Elastic blog | fetch 2026-10-07 | **primary (vendor)**

**B4.4. Vespa first-party BEIR (13 datasets, nDCG@10): Vespa BM25 avg 0.453, Vespa
ColBERT avg 0.363, Vespa hybrid ColBERT+BM25 avg 0.481 — hybrid best on 12 of 13
datasets.** ColBERT in-domain MS MARCO 0.401 vs BM25 0.228, but ColBERT underperforms
BM25 out-of-domain (e.g. CLIMATE-FEVER 0.067 vs 0.207). Blog dated 09 Jan 2023.
(F8 §D4)
- source: https://blog.vespa.ai/improving-zero-shot-ranking-with-vespa-part-two/ | fetch 2026-10-07 | **primary (vendor)**

**B4.5. BEIR SIGIR-2024 resource paper: hybrid (Contriever + SPLADE fusion) gives
"more than a six-point gain on average" over the best individual model, with gains
"consistent"; four exceptions: BioASQ, Touché-2020, ArguAna, Quora.** (F8 §D5)
- source: https://arxiv.org/html/2306.07471v1 (13 Jun 2023) | fetch 2026-10-07 | **primary**

**B4.6. Qdrant first-party: across five BEIR-style datasets, default RRF beat the
stronger individual retriever on 4/5.** CodeSearchNet: dense 0.6299, sparse 0.5126,
hybrid 0.6555 nDCG@10 (+0.0256). SciFact 0.6886→0.7175; ArguAna 0.4905→0.5216;
WANDS 0.7098→0.7254; DBPedia-entity exception (hybrid 0.4638 < dense 0.4677).
(F8 §D6)
- source: https://qdrant.tech/documentation/search-tuning/hybrid-search/ | fetch 2026-10-07 | **primary (vendor)**

**B4.7. Fusion only reorders the union of the two retrievers' candidates — "a
document neither one found cannot appear anywhere in the results."** (F8 §D7)
- source: same Qdrant doc | fetch 2026-10-07 | **primary (vendor)**

**B4.8. SPLADE (learned sparse) keeps exact term matching + inverted index, gains
>9% NDCG@10 on TREC DL 2019 over prior SPLADE and reaches SOTA on BEIR; SPLADE++
reaches 38.3 MRR@10 on MS MARCO dev.** (F8 §D8)
- source: https://arxiv.org/abs/2107.05720, 2109.10086, 2205.04733; https://raw.githubusercontent.com/naver/splade/main/README.md | fetch 2026-10-07 | **primary**

**B4.9. Efficient SPLADE achieves latency "less than 4ms difference" from BM25 under
the same compute constraints while keeping within 10% MRR@10 of the state-of-the-art
single-stage neural ranker (in-domain).** (F8 §D9)
- source: Lassance & Clinchant, SIGIR 2022, DOI 10.1145/3477495.3531833 | fetch 2026-10-07 | **primary**

**B4.10. WANDS e-commerce: BM25 0.6983, pure KNN 0.6953, basic RRF 0.7068,
field-boosted hybrid 0.7497 mean nDCG — BM25 and dense statistically
indistinguishable, fusion reliably above both.** Turnbull study, March 2025;
reported via third-party write-up (underlying softwaredoug.com source not fetched).
(F8 §D10)
- source: https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026 | fetch 2026-10-07 | **secondary**

#### B5. Retrieval-to-context: ordering and context limits

**B5.1. "Lost in the Middle": LLM performance is highest when relevant information
sits at the beginning or end of the input context and degrades significantly when it
must be found in the middle — even correctly-retrieved evidence can be wasted.**
(F8 §E1)
- source: https://arxiv.org/abs/2307.03172 (6 Jul 2023) | fetch 2026-10-07 | **primary**

**B5.2. Cost/size asymmetry (CPU-relevant): BEIR 1M-doc DBPedia index — BM25 0.4GB /
20ms CPU vs dense 768-dim 3GB / 125–275ms CPU vs ColBERT 20GB.** On BioASQ (~15M
docs) ColBERT needs ~900GB vs BM25 18GB. (F8 §E2)
- source: https://arxiv.org/html/2104.08663v4 §5.1 Table 3 | fetch 2026-10-07 | **primary**

**B5.3. CoIR efficiency on CodeFeedBack-ST (156k corpus, 31k queries): embedding
latency per sample 7.4–7.8ms for 768-dim base models, 31.4ms for BGE-M3 (1024),
1840ms for E5-Mistral (7B); index sizes 0.3GB–2.3GB.** (F8 §E3)
- source: https://arxiv.org/html/2407.02883v3 Table 4 | fetch 2026-10-07 | **primary**

---

## Searches

Worker query strings / endpoints (from F4 and F8 `## Searches` sections).

**F4 (Angle 4):**
- `https://huggingface.co/datasets/mteb/results` (+ DuckDB over `data/train-000{0..3}-of-00004.parquet`)
- `uv run --with mteb` → `get_benchmark("MTEB(Multilingual, v2)")`, `get_benchmark("MTEB(eng, v2)")`
- `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/benchmarks/benchmarks.py`
- `https://huggingface.co/api/models/<model>?expand[]=safetensors&expand[]=config` for ~20 models
- `https://huggingface.co/api/models?search=LFM2-Embedding`, `?search=granite-embedding`
- HF model cards: BAAI/bge-m3, Alibaba-NLP/gte-multilingual-base, intfloat/multilingual-e5-{small,base,large,large-instruct}, nomic-ai/nomic-embed-text-v{1.5,2-moe}, jinaai/jina-embeddings-v3, jinaai/jina-embeddings-v4, Snowflake/snowflake-arctic-embed-{m,l}-v2.0, google/embeddinggemma-300m, Qwen/Qwen3-Embedding-{0.6B,4B,8B}, HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v2, KaLM-Embedding/KaLM-embedding-multilingual-mini-instruct-v2.5, ibm-granite/granite-embedding-{small-english-r2,311m-multilingual-r2}, NovaSearch/stella_en_1.5B_v5, LiquidAI/LFM2.5-Embedding-350M, BAAI/bge-multilingual-gemma2
- Papers: arXiv 2502.13595v4 (MMTEB), 2506.05176v1 (Qwen3-Embedding), 2402.03216v5 (BGE-M3), 2502.07972v1 (Nomic v2 MoE), 2412.04506v2 (Arctic-Embed 2.0), 2509.20354v3 (EmbeddingGemma), 2409.10173 (jina-v3), 2506.20923v4 (KaLM-V2), 2503.07891 (Gemini Embedding), 2508.21085 (Granite r2)
- Vendor docs: ai.google.dev/gemini-api/docs/{embeddings,models/gemini-embedding-001}, ai.google.dev/gemma/docs/embeddinggemma{,/model_card}, docs.cohere.com/v2/docs/cohere-embed, docs.voyageai.com/docs/embeddings
- web_search: `voyage-4-large MTEB Multilingual score nDCG blog 2026`; `Cohere embed-v4.0 MTEB Multilingual v2 score leaderboard`
- Leaderboard endpoints tried: `https://huggingface.co/spaces/mteb/leaderboard`, `https://leaderboard.mteb.org/models/google/embeddinggemma-300m`, `https://mteb-leaderboard-backend.hf.space/api/v1/models` (404), `mteb-leaderboard.hf.space/gradio_api/info` (JS-only)
- Failed/empty: `datasets-server.huggingface.co/filter|search` on `mteb/results` (HTTP 500); HF raw README for gated models (401); `docs.liquid.ai/lfm/models/lfm2-embedding` (404); snowflake.com blog (404)

**F8 (Angle 8):**
- `hybrid retrieval BM25 dense fusion nDCG gain BEIR benchmark results` (Tavily)
- `dense retrieval failure exact identifiers code search lexical BM25 domain shift` (Tavily)
- `Sparse, Dense, and Attentional Representations for Text Retrieval Luan TACL dense needs more capacity lexical matching` (Tavily)
- `BM25 outperforms dense retrieval out-of-domain generalization domain shift numbers nDCG` (Tavily)
- `Cormack Clarke Buettcher reciprocal rank fusion outperforms condorcet SIGIR 2009` (Tavily)
- `"Complementary Strengths" dense sparse retrieval combination paper nDCG` (Tavily)
- `GPL Generative Pseudo Labeling unsupervised domain adaptation dense retrieval nDCG BEIR improvement Wang` (Tavily)
- `CodeRAG-Bench retrieval BM25 vs dense code nDCG results` (Tavily)
- `dense retrieval fails exact match rare tokens embedding no signal tokenizer out-of-vocabulary study` (Tavily)
- `log retrieval anomaly detection BM25 vs embedding dense technical log messages` (Tavily)
- `CoIR leaderboard code retrieval BM25 baseline nDCG average 2025` (Tavily)
- `SPLADEv2 BEIR average nDCG@10 0.4333 leaderboard BM25 0.428` (Tavily)
- `Vespa hybrid search BM25 embedding rank fusion blog` (Tavily)
- `Qdrant hybrid search BM25 dense fusion documentation when keyword wins` (Tavily)
- `Simon Willison embeddings search hybrid BM25 FTS SQLite blog` (Tavily)
- Direct `read` on ~20 primary URLs (arXiv abs/html, GitHub raw, vendor docs)

---

## Conflicting evidence

### Within-cluster conflicts (Angle 4 vs Angle 8) — and who wins

**X1. Multilingual dense vs BM25 on the same benchmark — BGE-M3's own MIRACL
numbers.**
- Angle 4, A3.1 (BGE-M3 paper Table 1, MIRACL dev 18-lang nDCG@10): BGE-M3 dense
  69.2, sparse 53.9, **hybrid (all) 71.5**; **BM25 31.9**.
- Angle 8, B1.1/B1.2 (BEIR): BM25 is a robust zero-shot baseline; dense
  bi-encoders underperform it out-of-distribution.
- **Winner: A3.1 for the multilingual-retrieval case.** Conditions differ: A3.1 is
  an in-distribution multilingual retrieval benchmark where the encoder (BGE-M3)
  was trained for multilingual retrieval and hybrid fusion is used; B1.1/B1.2 is
  zero-shot out-of-domain English BEIR with general-domain encoders. A3.1 does not
  contradict B1.1 — it actually supports Angle 8's hybrid claim (sparse 53.9 +
  dense 69.2 → fused 71.5, and BM25-only 31.9 is weak). Both carry forward.

**X2. Code retrieval: dense wins (Angle 8 internal conflict, carried here because it
bounds Angle 4's multilingual claims).**
- Angle 8, B3.4 (CoIR): BM25 avg 29.79 vs dense models 36.40–56.26.
- Angle 8, B3.8 (CodeRAG-Bench): "dense embedding models frequently surpass BM25" on
  code; code-trained retrievers win by 6.6–7.4 nDCG@10.
- Angle 8, B1.1 (BEIR): dense underperforms BM25 out-of-domain.
- **Winner: conditional, not absolute.** Reconciliation (F8 K1): BEIR's result is
  for **general-domain** encoders on **natural-language** corpora; CoIR/CodeRAG-Bench
  use **code-trained or multi-domain-trained** encoders on **code** corpora. Where
  the encoder is code-trained, dense wins on code; where it is not and the domain
  shifts, BM25 wins. Which regime applies depends on model choice, not on
  "embeddings vs BM25" in the abstract. **Carry forward both.**

**X3. BEIR itself is biased against dense — weakens B1.1/B1.2 as pure anti-dense
evidence.**
- Angle 8, B1.1: dense underperforms BM25 on BEIR.
- Angle 8 K2 (BEIR §6, same paper): many BEIR datasets were annotated from lexical
  retrieval pools (lexical bias). Hole@10: BM25 6.4%, docT5query 2.8% vs TAS-B
  31.8%, ANCE 14.4%, DPR 30.6%. After manually annotating the holes on TREC-COVID,
  ANCE went 0.654 → 0.735 (6.7 points *above* BM25), ColBERT 0.677 → 0.735.
- **Winner: direction survives, magnitude does not.** BEIR's own authors state the
  benchmark "can give an unfair disadvantage to non-lexical approaches." Both
  claims are true. **Carry forward:** do not treat BEIR aggregate gaps as ground
  truth for a new domain; the qualitative direction (BM25 robust zero-shot)
  survives, the magnitude does not.
- source: https://arxiv.org/html/2104.08663v4 §6 Table 4 | fetch 2026-10-07 | **primary**

**X4. Hybrid gains are real but not universal.**
- Angle 8, B4.2/B4.4/B4.5/B4.6: hybrid beats both parents on most datasets.
- Angle 8, B4.5: four BEIR exceptions (BioASQ, Touché-2020, ArguAna, Quora).
- Angle 8, B4.6: DBPedia-entity exception, hybrid 0.4638 < dense 0.4677.
- Angle 8, B4.4: on in-domain MS MARCO, adding BM25 *hurt* ColBERT (0.401 → 0.344).
- **Winner: conditional.** Fusion helps when the two retrievers have comparable
  strength and complementary errors; it hurts when one is far weaker (Elastic:
  "hybrid search performs strongly when both methods have similar overall
  accuracy"). **Carry forward:** the hybrid gain is conditional on relative
  retriever quality, not automatic.

**X5. Dense retrieval can be improved rather than replaced.**
- Angle 8, B3.2: lexical enrichment at inference improves dense on BEIR.
- Angle 8, B1.5/B4.8: domain adaptation (GPL) and learned sparse (SPLADE) close gaps.
- Angle 8, B3.6: BM25's code weakness is fixable by IDF/tokenization changes.
- **Winner: neither paradigm is terminal.** The honest counter-argument is not
  "embeddings are useless" but "a plain general-purpose dense model with no lexical
  channel is the wrong default for identifier-heavy text." **Carry forward.**

**X6. Hybrid cost on CPU — Angle 8's own latency caveat vs Angle 4's missing CPU
numbers.**
- Angle 8, B5.2 (BEIR §5.1 Table 3): BEIR 1M-doc DBPedia index — BM25 0.4GB / 20ms
  CPU vs dense 768-dim 3GB / 125–275ms CPU. Hardware = 8-core Xeon Platinum 8168.
- Angle 4, A5.6: no x86 CPU latency published for any multilingual model; only
  Apple-Silicon llama.cpp (LFM2.5) and H100 throughput (granite).
- **Winner: B5.2 stands for the *relative* cost shape (dense ~6–14× BM25 CPU time at
  1M docs), A5.6 stands as an absolute gap.** No conflict in direction; the absolute
  numbers for i5-1135G7 are **unverified** from both angles. **Carry forward both,
  marked as extrapolation-only.**

### Conflicts inside Angle 4 (F4 §Conflicting evidence)

**Y1. gte-multilingual-base on MTEB(Multilingual, v2):** 58.24 (EmbeddingGemma paper
Table 5, 2025-09-23) vs 58.57 `[parquet-recompute]` (131/131, 2026-10-07) vs 58.2
(EmbeddingGemma Table 6). Likely task-version/leaderboard drift over ~13 months.
**Winner: the recomputed 0.5857 for currency, with the date; the paper value when
matching the paper's own table.** (F4 §1)

**Y2. Qwen3-Embedding-0.6B MMTEB:** 64.33 (Qwen card, 2025-05-24), 64.34 (Qwen paper
+ EmbeddingGemma paper), 0.6434 recompute (2026-10-07). Rounding-level only; treat
as 64.3. (F4 §2)

**Y3. Leaderboard snapshot dates disagree inside Qwen3 materials:** card says
"retrieved ... May 24th, 2025"; paper Table 2 note says "June 4th, 2025" for the
same numbers. Neither changes a value; flag when quoting "as of". (F4 §3)

**Y4. MMTEB task count:** 131 (paper prose §2.4, mteb v2.x code) vs 132 (paper Table
1/2). Unresolved; current code says 131. **Winner: 131 for the live benchmark; note
the paper's 132 when quoting the paper's tables.** (F4 §4)

**Y5. Nomic Embed v2 MIRACL:** card 65.80 (16-language avg) vs paper 66.0
(18-language avg). Not a real conflict — different language sets; a trap if mixed.
(F4 §5)

**Y6. BGE-M3 MIRACL:** 69.2 (dense, paper, original MIRACL dev) vs recompute
MIRACLRetrieval 0.7107 (3 subsets only) vs MIRACLRetrievalHardNegatives.v2 0.6964
(21 subsets). **Winner: the paper's 69.2 for the original benchmark; the parquet
values are on the current hard-negatives/downsampled MTEB task. Do not compare
across these.** (F4 §6)

**Y7. BGE-M3 card reports a corrected MIRACL table (2024-07-01); earlier results
were lower due to a query-passage dedup bug; the arXiv v5 paper contains corrected
numbers. Earlier third-party quotes of BGE-M3 MIRACL may be ~2 pts low.** (F4 §7)

**Y8. Arctic-Embed 2.0 paper asserts no English gap, while its own Table 1 shows
English-only → multilingual drops of 1.3–3.3 pts for E5/GTE/BGE.** Resolution: the
gap is real for *those* models; Arctic claims only that *its* training recipe avoids
it. Both correct for their scope. (F4 §8)

**Y9. granite-embedding-311m-multilingual-r2 "65.2 on Multilingual MTEB Retrieval
(18 tasks)"** vs recompute MTEB(Multilingual, v2) mean(task) 0.5596 (131/131).
Different subsets (retrieval-only vs all task types); not a conflict but not
interchangeable. (F4 §9)

**Y10. KaLM v2.5 scores are not leaderboard-comparable:** official results dataset
has only 24/131 MTEB(Multilingual, v2) tasks; parquet mean of those 24 = 0.7596 —
higher than Qwen3-8B's full-131 score. Coverage bias, not a real ranking. Same for
bge-multilingual-gemma2 (28/131 → 0.7750) and KaLM v2 (18/131 → 0.7795).
**Winner: full-coverage (131/131) numbers only for ranking.** (F4 §10)

---

## Gaps

**From Angle 4 (F4 §Gaps):**
1. **No x86 CPU latency published for any model in this angle.** LFM2.5 publishes
   Apple-Silicon llama.cpp latency; granite publishes H100 throughput; EmbeddingGemma
   publishes process memory only. Target hardware (i5-1135G7, no CUDA) → **unverified**.
   A real gap for the "local CPU-only" decision.
2. **MTEB(Multilingual, v2) mean(TaskType) not recomputed** for most models; the
   aggregation here is mean(task). Only papers' Mean(Type) values are quoted, and only
   for their own snapshot dates.
3. **BGE-M3 param count:** HF API exposes no `safetensors` index for `BAAI/bge-m3`;
   568M is third-party (Qwen/EmbeddingGemma/Nomic papers list 560–568M). Model card
   does not state a parameter count → treat 568M as **secondary/approximate**.
4. **voyage-4 family and Cohere embed-v4.0:** MTEB(Multilingual, v2) aggregates are
   **unverified** (2/131 tasks). Voyage's 2026 blog reports RTEB, not MTEB.
5. **google/gemini-embedding-2** (multimodal, 2026): only 4 tasks in official results
   → no MMTEB aggregate. **EmbeddingGemma-2** (740M, multimodal, 2026-10-06) outside
   this text-only angle; no MMTEB numbers found.
6. **MTEB(Code, v1) and MTEB(eng, v1)** comparisons for multilingual models only
   partially recomputed (e.g. bge-m3 22/56 eng v1, 28/41 eng v2).
7. **Instruction-prompt sensitivity not quantified** across models. Qwen3 and
   EmbeddingGemma report 1–5% swings; KaLM/EmbeddingGemma use task prefixes; nomic v2
   requires `search_query:`/`search_document:`. Leaderboard scores assume the
   officially recommended prompts; a local pipeline omitting them will score lower —
   magnitude per model **unverified** except Qwen3's stated 1–5%.
8. **No published MMTEB number for `gte-multilingual-base` in its own card** (card
   shows per-task results and images only, no aggregate table).

**From Angle 8 (F8 §Gaps):**
9. **No published benchmark on agent/LLM chat-log retrieval.** No paper measuring
   retrieval over agent transcripts, tool-call logs, or chatroom chatter. All
   identifier-heavy evidence is proxied from code retrieval (CoIR, CodeSearchNet,
   CodeRAG-Bench) and entity retrieval (EntityQuestions). **The single largest gap
   for the repo's actual corpus.**
10. **No head-to-head BM25 vs dense on error codes / hashes / version strings.**
    Failure-mode claims (B2.x, B3.1) are on entities, product codes, and random
    strings; error-code and hash tokens are asserted by practitioner sources only
    (e.g. the `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` example at
    https://tianpan.co/blog/2026/04/12/hybrid-search-production-bm25-dense-embeddings
    — **secondary**, not fetched as primary).
11. **BEIR official leaderboard (eval.ai challenge 1897) is JS-rendered and returned
    empty on fetch.** Current SPLADE/BM25 leaderboard numbers could not be verified
    from the primary leaderboard; only the 2021 paper and 2023 SIGIR resource paper
    were readable. Any "current BEIR average" is **unverified**.
12. **No CPU-specific dense-vs-BM25 latency benchmark for the target hardware class**
    (4c/8t, no CUDA, 15GB). BEIR reports CPU latency on an 8-core Xeon Platinum 8168
    (B5.2); CoIR reports GPU embedding latency (B5.3). Extrapolation to i5-1135G7 is
    inference, not measured.
13. **SPLADE/BGE-M3 hybrid deltas on code not measured.** CoIR (B3.4) evaluates BM25
    and dense but not hybrid; CodeRAG-Bench adds a BGE reranker but the
    hybrid-vs-parents delta for code is not reported as a single nDCG@10 figure.
14. **WANDS numbers (B4.10) are secondary** — the underlying Turnbull study
    (softwaredoug.com, March 2025) was not fetched; treat as indicative only.

**Cluster-level gap (both angles):** No published benchmark evaluates retrieval over
this repo's actual corpus shape — agent chatter mixing prose, file paths, identifiers,
and code. Angle 4 supplies multilingual quality; Angle 8 supplies the failure-mode and
hybrid evidence; the intersection (multilingual model + identifier-heavy agent log +
BM25 hybrid on CPU) is unmeasured anywhere in the literature found.

---

## Cluster verdict

Multilingual is only worth its cost if the room actually holds non-English text:
Qwen3-Embedding-0.6B leads 131/131 MMTEB at 0.6434 (multi) vs 0.6913 eng v2, and
beats English-only bge-large-en-v1.5 on English — but the safe local-CPU pick stays
multilingual-e5 or BGE-M3 at ~560M, and jina-v3 is licence-blocked (CC-BY-NC).

The counter-angle lands: BM25 is a robust zero-shot baseline (BEIR: DPR −47.7% vs
BM25), dense false-positive rate grows with index size (BM25 0.00% vs dense up to
9.73% noise hits; DPR 12.08%), and dense retrieval collapses on tail entities,
reasoning-heavy queries (BRIGHT: MTEB 59.0 → 18.3), and out-of-domain corpora.

But the anti-dense case is conditional, not absolute: code-trained encoders beat BM25
on code (CoIR dense 36–56 vs BM25 29.79), BEIR's own Hole@10 analysis shows the
benchmark is lexically biased against dense (ANCE 0.654 → 0.735 after re-annotation),
and BM25's code weakness is mostly an IDF/tokenization bug fixable in place.

Winner for this repo: hybrid, not either pole. RRF/BM25+dense beats both parents on
most datasets (Elastic +18% over BM25; Vespa 0.481 vs 0.453 BM25; BEIR fusion +6 pts
avg), but gains are conditional on comparable retriever strength, and fusion only
reorders the union — so a lexical channel is required to find the identifiers dense
misses. Carry forward: no published benchmark covers agent-chat-log retrieval at all;
the identifier-heavy evidence is proxied from code retrieval, and no CPU latency
exists for the target i5-1135G7 in either angle.
