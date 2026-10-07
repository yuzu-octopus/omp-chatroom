# Embedding models for a local, CPU-only retrieval layer

**Answer:** Qwen3-Embedding-0.6B served via a self-hosted OpenAI-compatible endpoint (llama.cpp GGUF or TEI) is the primary recommendation — it is the best CPU-feasible model on the room's primary job, semantic retrieval (MTEB(eng, v2) Retrieval 61.83), while also being strong on classification (84.58), at 0.6 B params (~600 MB int8, official GGUF), Apache-2.0, 32K context. The 7 models already whitelisted in omp are not competitive: the best whitelisted option (bge-base-en-v1.5) trails by 7.1 retrieval and 6.9 classification points. A hybrid architecture (BM25/FTS + dense with RRF) is strongly recommended over dense-only, because the room's identifier-heavy agent chatter is exactly where dense retrieval fails. **Round 2 confirmed the pick, and did not revise it** — two serious candidates were added (jina-embeddings-v5-text-nano, EmbeddingGemma-2 text encoder); the one that would beat Qwen3-0.6B on overall/classification quality, jina-v5-text-nano, is **CC-BY-NC-4.0 and therefore not commercially usable**.

**Confidence:** medium-high. MTEB scores are from the live leaderboard backend (snapshot 2026-10-05, fetched 2026-10-07) [1]. CPU feasibility is inferred from published benchmarks on different hardware (i7-13700K desktop, not the i5-1135G7 laptop) — **no published 4-core-laptop CPU benchmark exists for any embedding model** [2]. The counter-angle (BM25 vs dense) is well-supported but no benchmark covers agent-chat-log retrieval specifically [3].

## Licence is a hard filter

Non-commercial (`cc-by-nc-*`) models are **unusable for commercial use** and are not ranked first, however good their scores:

| Model | Licence | Commercially usable? |
|---|---|---|
| jina-embeddings-v5-text-small / -nano / -omni-small / -omni-nano | `cc-by-nc-4.0` | **No** — cards say "for commercial use, please contact us" [44] |
| jina-embeddings-v3 | `cc-by-nc-4.0` | **No** [45] |
| nvidia/NV-Embed-v2 | `cc-by-nc-4.0` | **No** [1] |
| Salesforce/SFR-Embedding-2_R | `cc-by-nc-4.0` | **No** [1] |
| Qwen3-Embedding-* , bge-*, granite-*, arctic-*, mxbai-*, stella_*, nomic-* | Apache-2.0 / MIT | Yes |
| google/embeddinggemma-300m / -2 | `gemma` (gated) / Apache-2.0 | Yes — Gemma Terms of Use grant use/reproduction/modification/distribution; the §3.2 restrictions are a prohibited-use policy, not a commercial ban [48] |

## Round 2 — what changed

| Round 1 | Round 2 | Effect on the recommendation |
|---|---|---|
| jina-embeddings-v5 absent from all ranked tables | Added: nano 212M, 8K, Mean(Task) **71.11**, Retrieval 58.80, Classification 90.07 | **No change** — wins on quality-per-parameter and classification, but loses Retrieval and is CC-BY-NC-4.0 |
| EmbeddingGemma-2 "dismissed — no MTEB scores yet" | Card **does** publish scores (Eng-v2 68.46, Multi-v2 61.36, Code-v1 78.68 at 768d), but self-reported; live board has zero rows; text-only GGUF absent | **No change** — Path 3 works (multimodal GGUF), but no independent verification and no text-only build |
| Metric scales not reconciled | **Reconciled:** card "MTEB English v2" = live `Mean (Task)`; jina-v5's 71.7 is the same metric as Qwen3-0.6B's 70.47 | Enables a valid single-scale comparison; jina-v5 was an omission, not a scale error [46] |
| Licence mentioned once (jina-v3) | Licence column in **every** ranked table; non-commercial set stated up front | jina-v5, NV-Embed-v2, SFR-2_R, jina-v3 excluded from the primary pick |
| No GGUF/Path-3 audit | Full per-model GGUF/ONNX/TEI/Ollama audit | Confirms Qwen3-0.6B, jina-v5, LFM2.5, embeddinggemma-* all have CPU builds; **stella_en_400M_v5 has none** [47] |
| `multilingual-e5-large` row quoted the `-instruct` variant's scores | Corrected to the non-instruct model's actual cells | Whitelisted-set comparison slightly worse than round 1 showed [1] |

## Why

### The integration constraint

omp whitelists exactly 7 local embedding models in `KNOWN_MODEL_NAMES` (`@oh-my-pi/pi-mnemopi/src/core/embeddings.ts:325-333`). A model outside this list cannot load locally without either (a) serving it through a self-hosted OpenAI-compatible endpoint, or (b) patching the whitelist. Every recommendation below is classified into one of four paths:

| Path | Meaning | Models |
|---|---|---|
| **1 — Already whitelisted** | Works today via `mnemopi.embeddingModel` / `embeddingVariant` | bge-small-en-v1.5, bge-base-en-v1.5, bge-small-en, bge-base-en, bge-small-zh-v1.5, multilingual-e5-large, all-MiniLM-L6-v2 |
| **2 — API path** | OpenAI-compatible endpoint via `mnemopi.embeddingApiUrl` + `embeddingApiKey` | Any API model (OpenAI, Voyage, Cohere, Gemini) — **does not satisfy the local-CPU constraint** |
| **3 — Self-hosted OpenAI-compatible** | Local server speaking `POST /embeddings` (llama.cpp, TEI, Ollama, vLLM, Infinity) | Qwen3-Embedding-0.6B, jina-v5-*, EmbeddingGemma-2, bge-m3, granite r2, arctic, LFM2.5, and most open models |
| **4 — Patch required** | Adding a name to `KNOWN_MODEL_NAMES` in the host source | Anything with no GGUF/ONNX/TEI build (e.g. stella_en_400M_v5) |

Path 3 is the escape hatch: because `isApiModel()` (`:271-283`) accepts any `apiUrl`, a local server can serve **any** model without patching omp. This makes Path-3 models actionable today. `llama-server` exposes `POST /v1/embeddings` (OpenAI-compatible) with `--pooling` and `--embedding` [47].

### The whitelisted models are not competitive

| Model | Params | Dim | Max ctx | Mean(Task) | Retrieval | Classification | Clustering | STS | PairClass | Licence | Path |
|---|---|---|---|---|---|---|---|---|---|---|---|
| intfloat/multilingual-e5-large | 0.56B | 1024 | 512 | — | 51.53 | — | 42.07 | 81.39 | 84.75 | MIT | 1 |
| BAAI/bge-base-en-v1.5 | 0.109B | 768 | 512 | 65.14 | 54.75 | 77.69 | 47.42 | 82.12 | 86.56 | MIT | 1 |
| BAAI/bge-small-en-v1.5 | 0.033B | 384 | 512 | 64.30 | 53.86 | 76.56 | 47.02 | 81.28 | 84.95 | MIT | 1 |
| BAAI/bge-base-en | 0.109B | 768 | 512 | — | — | — | — | — | — | MIT | 1 |
| BAAI/bge-small-en | 0.033B | 384 | 512 | — | — | — | — | — | — | MIT | 1 |
| BAAI/bge-small-zh-v1.5 | 0.024B | 512 | 512 | — | — | — | — | — | — | MIT | 1 |
| sentence-transformers/all-MiniLM-L6-v2 | 0.023B | 384 | 256 | 59.03 | 42.92 | 69.25 | 44.90 | 78.95 | 82.37 | Apache-2.0 | 1 |

Source: MTEB(eng, v2) live leaderboard backend, snapshot 2026-10-05, fetched 2026-10-07 [1]. `—` = no full-coverage cell (partial task coverage), not zero. Note `multilingual-e5-large` (non-instruct) has partial eng-v2 coverage and no Mean(Task); the `-instruct` variant scores Retrieval 53.47 / Classification 75.71 / STS 84.72 but is a different checkpoint. Params from HF `safetensors.total`; the 7 whitelisted names come from the host source read (see the integration constraint above). Licence sources: `https://huggingface.co/BAAI/bge-small-zh-v1.5/raw/main/README.md` (`license: mit`), `https://huggingface.co/google/embeddinggemma-300m` (`gemma`).

The best whitelisted model (bge-base-en-v1.5) is 7.1 retrieval points and 6.9 classification points behind Qwen3-Embedding-0.6B — and has 512-token context versus 32K. The gap justifies a change.

### Ranked table — Retrieval (the room's primary job)

MTEB(eng, v2), live leaderboard backend, snapshot 2026-10-05, fetched 2026-10-07 [1]. All values are `meanTask` / `scoresByTaskType` × 100.

| # | Model | Params | Dim | Max ctx | Mean(Task) | Retrieval | Classification | Clustering | STS | PairClass | Licence | Path | GGUF/CPU build |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Qwen/Qwen3-Embedding-8B | 7.57B | 4096 | 32K | 75.23 | **69.44** | 90.43 | 58.57 | 88.58 | 87.52 | Apache-2.0 | 4 | official GGUF (CPU-slow) [47] |
| 2 | Qwen/Qwen3-Embedding-4B | 4.02B | 2560 | 32K | 74.61 | 68.46 | 89.84 | 57.51 | 88.72 | 87.01 | Apache-2.0 | 4 | official GGUF (CPU-slow) [47] |
| 3 | nvidia/NV-Embed-v2 | 7.85B | 4096 | 32K | 69.81 | 62.84 | 87.19 | 47.66 | 83.82 | 88.69 | **CC-BY-NC-4.0** | 4 | — |
| 4 | **Qwen/Qwen3-Embedding-0.6B** | **0.596B** | **1024** | **32K** | **70.47** | **61.83** | **84.58** | **54.05** | **86.57** | **84.37** | **Apache-2.0** | **3** | **official GGUF + ONNX + TEI + Ollama** [47] |
| 5 | jina-embeddings-v5-omni-small *(text encoder)* | 0.596B text / 1.63B total | 1024 | 32K | 71.78 | 60.07 | 90.75 | 54.69 | 88.13 | 84.95 | **CC-BY-NC-4.0** | 3 | official GGUF [44] |
| 6 | jina-embeddings-v5-text-small | 0.596B | 1024 | 32K | null (38/41) | 60.07 | — | 54.69 | 88.13 | 84.95 | **CC-BY-NC-4.0** | 3 | official GGUF [44] |
| 7 | jina-embeddings-v5-text-nano | **0.212B** | 768 | **8192** | **71.11** | 58.80 | **90.07** | 53.49 | 88.28 | 84.74 | **CC-BY-NC-4.0** | 3 | official GGUF (Q4_K_M 157 MB) [44] |
| 8 | Snowflake/snowflake-arctic-embed-l-v2.0 | 0.568B | 1024 | 8192 | 63.60 | 58.56 | 73.37 | 44.37 | 78.05 | 83.00 | Apache-2.0 | 3 | GGUF + ONNX [47] |
| 9 | Alibaba-NLP/gte-Qwen2-7B-instruct | 7.07B | 3584 | 32K | 70.72 | 58.09 | 88.52 | 58.97 | 82.69 | 85.90 | Apache-2.0 | 4 | — |
| 10 | intfloat/e5-mistral-7b-instruct | 7.11B | 4096 | 32K | 67.97 | 57.62 | 79.85 | 51.44 | 84.32 | 88.42 | MIT | 4 | — |
| 11 | ibm-granite/granite-embedding-english-r2 | 0.149B | 768 | 8192 | 62.84 | 56.43 | 70.71 | 47.20 | 78.12 | 79.34 | Apache-2.0 | 3 | GGUF + ONNX [47] |
| 12 | google/embeddinggemma-300m | 0.308B | 768 | 2048 | 69.67 | 55.69 | 87.55 | 56.55 | 83.61 | 87.29 | gemma (gated) | 3 | GGUF + ONNX + fastembed [47] |
| 13 | mixedbread-ai/mxbai-embed-large-v1 | 0.335B | 1024 | 512 | 66.26 | 55.40 | 79.10 | 47.48 | 84.42 | 87.20 | Apache-2.0 | 3 | ONNX (fastembed) [47] |
| 14 | nomic-ai/nomic-embed-text-v2-moe | 0.475B | 768 | 512 | 63.64 | 54.81 | 75.53 | 45.62 | 80.24 | 82.61 | Apache-2.0 | 3 | — |
| 15 | BAAI/bge-base-en-v1.5 | 0.109B | 768 | 512 | 65.14 | 54.75 | 77.69 | 47.42 | 82.12 | 86.56 | MIT | **1** | fastembed (bundled) [47] |
| 16 | BAAI/bge-small-en-v1.5 | 0.033B | 384 | 512 | 64.30 | 53.86 | 76.56 | 47.02 | 81.28 | 84.95 | MIT | **1** | fastembed (default) [47] |
| 17 | Salesforce/SFR-Embedding-2_R | 7.11B | 4096 | 32K | 69.82 | 53.75 | 90.54 | 59.39 | 80.86 | 88.09 | **CC-BY-NC-4.0** | 4 | — |
| 18 | NovaSearch/stella_en_400M_v5 | 0.435B | 4096 | 8192 | 69.39 | 52.73 | 88.25 | 57.65 | 83.93 | 87.17 | MIT | 4 | **no GGUF/llama.cpp arch** [47] |
| 19 | intfloat/multilingual-e5-large | 0.56B | 1024 | 512 | — | 51.53 | — | 42.07 | 81.39 | 84.75 | MIT | **1** | fastembed [47] |
| 20 | nomic-ai/nomic-embed-text-v1.5 | 0.137B | 768 | 8192* | 62.20 | 47.97 | 75.71 | 47.55 | 78.70 | 85.16 | Apache-2.0 | 3 | official GGUF + fastembed [47] |
| 21 | sentence-transformers/all-MiniLM-L6-v2 | 0.023B | 384 | 256 | 59.03 | 42.92 | 69.25 | 44.90 | 78.95 | 82.37 | Apache-2.0 | **1** | fastembed (bundled) [47] |

\* nomic-v1.5 was trained at 2048; 8192 is reached by NTK interpolation — effective context ~2048 [15].

Key readings:
- **Qwen3-0.6B is the top CPU-feasible model on Retrieval (61.83)** — ahead of jina-v5-nano (58.80), arctic-l-v2.0 (58.56), and granite-r2 (56.43), and behind only the 4B/8B Qwen3 and NV-Embed-v2 (the latter is CC-BY-NC and 7.85B) [1].
- **jina-v5-text-nano wins quality-per-parameter decisively**: 0.212B params, Mean(Task) 71.11 vs Qwen3-0.6B's 70.47, Classification 90.07 vs 84.58 — but Retrieval 58.80 vs 61.83, context 8192 vs 32768, and **CC-BY-NC-4.0** [1][44].
- **BGE-M3 has no eng-v2 category cells** (partial coverage, 28/41) — do not quote its eng-v2 retrieval from this board [1].
- **Models ≥4B are effectively GPU-only** on 15 GB RAM (see CPU table below) [2].

### Ranked table — Classification / dedup (the room's secondary jobs)

MTEB(eng, v2) Classification (`accuracy`) and PairClassification (`max_ap`, the dedup proxy — MTEB places duplicate detection in Pair Classification) [1][40].

| # | Model | Params | Classification | PairClass | Mean(Task) | Licence | Path |
|---|---|---|---|---|---|---|---|
| 1 | jina-embeddings-v5-omni-small *(text)* | 0.596B text | **90.75** | 84.95 | 71.78 | **CC-BY-NC-4.0** | 3 |
| 2 | Salesforce/SFR-Embedding-2_R | 7.11B | **90.54** | 88.09 | 69.82 | **CC-BY-NC-4.0** | 4 |
| 3 | Qwen/Qwen3-Embedding-8B | 7.57B | 90.43 | 87.52 | 75.23 | Apache-2.0 | 4 |
| 4 | jina-embeddings-v5-text-nano | 0.212B | 90.07 | 84.74 | 71.11 | **CC-BY-NC-4.0** | 3 |
| 5 | Qwen/Qwen3-Embedding-4B | 4.02B | 89.84 | 87.01 | 74.61 | Apache-2.0 | 4 |
| 6 | NovaSearch/stella_en_400M_v5 | 0.435B | 88.25 | 87.17 | 69.39 | MIT | 4 |
| 7 | Alibaba-NLP/gte-Qwen2-7B-instruct | 7.07B | 88.52 | 85.90 | 70.72 | Apache-2.0 | 4 |
| 8 | google/embeddinggemma-300m | 0.308B | 87.55 | 87.29 | 69.67 | gemma (gated) | 3 |
| 9 | nvidia/NV-Embed-v2 | 7.85B | 87.19 | 88.69 | 69.81 | **CC-BY-NC-4.0** | 4 |
| 10 | **Qwen/Qwen3-Embedding-0.6B** | **0.596B** | **84.58** | **84.37** | **70.47** | **Apache-2.0** | **3** |
| 11 | mixedbread-ai/mxbai-embed-large-v1 | 0.335B | 79.10 | 87.20 | 66.26 | Apache-2.0 | 3 |
| 12 | intfloat/e5-mistral-7b-instruct | 7.11B | 79.85 | 88.42 | 67.97 | MIT | 4 |
| 13 | BAAI/bge-base-en-v1.5 | 0.109B | 77.69 | 86.56 | 65.14 | MIT | **1** |
| 14 | BAAI/bge-small-en-v1.5 | 0.033B | 76.56 | 84.95 | 64.30 | MIT | **1** |
| 15 | nomic-ai/nomic-embed-text-v1.5 | 0.137B | 75.71 | 85.16 | 62.20 | Apache-2.0 | 3 |
| 16 | ibm-granite/granite-embedding-english-r2 | 0.149B | 70.71 | 79.34 | 62.84 | Apache-2.0 | 3 |
| 17 | sentence-transformers/all-MiniLM-L6-v2 | 0.023B | 69.25 | 82.37 | 59.03 | Apache-2.0 | **1** |

Key readings:
- **jina-v5-nano beats Qwen3-0.6B by 5.5 Classification points at 1/3 the size** — the strongest permissive-vs-nonpermissive tension in the whole comparison [1].
- Among **permissively licensed, CPU-feasible** models, EmbeddingGemma-300M wins both Classification (87.55 vs 84.58) and PairClass (87.29 vs 84.37) over Qwen3-0.6B — but loses Retrieval decisively (55.69 vs 61.83) and has 2048 context vs 32768 [1].
- PairClass (dedup) is compressed at the top: 14 of 17 models sit in 82–89 — dedup is not where models differentiate [1].

### Multilingual (MTEB(Multilingual, v2), 131 tasks)

Live board + parquet recompute, 2026-10-07 [1][32].

| Model | Params | Dim | Max ctx | MMTEB Mean(Task) | Eng-v2 Mean(Task) | Licence | Path |
|---|---|---|---|---|---|---|---|
| Qwen/Qwen3-Embedding-8B | 7.57B | 4096 | 32K | 0.7058 | 0.7478 | Apache-2.0 | 4 |
| Qwen/Qwen3-Embedding-4B | 4.02B | 2560 | 32K | 0.6945 | 0.7401 | Apache-2.0 | 4 |
| jina-v5-omni-small *(text)* | 0.596B text | 1024 | 32K | **0.6700** | 0.7178 | **CC-BY-NC-4.0** | 3 |
| jina-v5-text-nano | 0.212B | 768 | 8192 | **0.6552** | 0.7111 | **CC-BY-NC-4.0** | 3 |
| **Qwen/Qwen3-Embedding-0.6B** | **0.596B** | **1024** | **32K** | **0.6434** | **0.6913** | **Apache-2.0** | **3** |
| intfloat/multilingual-e5-large-instruct | 0.56B | 1024 | 512 | 0.6322 | 0.6500 | MIT | 1 |
| google/embeddinggemma-300m | 0.308B | 768 | 2048 | 0.6115 | 0.6836 | gemma (gated) | 3 |
| BAAI/bge-m3 | 0.568B | 1024 | 8192 | 0.5956 | 0.6339 (28/41) | MIT | 3 |
| intfloat/multilingual-e5-large | 0.56B | 1024 | 512 | 0.5847 | 0.6175 | MIT | 1 |
| jina-embeddings-v3 | 0.572B | 1024 | 8192 | 0.5837 | 0.6691 | **CC-BY-NC-4.0** | 4 |
| Snowflake/snowflake-arctic-embed-l-v2.0 | 0.568B | 1024 | 8192 | 0.5703 | 0.6291 | Apache-2.0 | 3 |
| ibm-granite/granite-embedding-311m-multilingual-r2 | 0.311B | 768 | 32K | 0.5596 | — | Apache-2.0 | 3 |

- **Qwen3-0.6B leads 131/131 MMTEB among permissively licensed, CPU-feasible models (0.6434)** — beaten only by jina-v5 (non-commercial) and the 4B/8B Qwen3 (GPU-only) [1][32].
- English-only models collapse on multilingual: nomic-v1.5 MMTEB Retrieval 34.09, bge-large 39.00 [1].
- **granite-embedding-311m-multilingual-r2** (311M, 32K ctx, Apache-2.0, ModernBERT) is the strongest small multilingual option with full 131/131 coverage and a GGUF build [34][47].

### CPU feasibility

**No published benchmark exists for the target i5-1135G7 (4c/8t Tiger Lake).** All published CPU data is i7-13700K (16c/24t desktop), Xeon E5-2620 v2, Graviton3 (ARM), Apple M4 Max, or unspecified CPU [2]. The table uses published data, with sizes from real GGUF/ONNX artifacts where they exist.

| Model | Quantized size | CPU feasibility on 15 GB RAM | Published evidence |
|---|---|---|---|
| all-MiniLM-L6-v2 (23M) | 0.09 GB | Excellent — 2.5–3.5× speedup int8/OpenVINO [5] | i7-13700K |
| bge-small-en-v1.5 (33M) | 0.067 GB | Excellent — 2–3× int8/ONNX [5] | i7-13700K |
| bge-base-en-v1.5 (109M) | 0.21 GB | Very good — 2–3× int8/ONNX [5] | i7-13700K |
| granite-embedding-english-r2 (149M) | ~0.6 GB | Good — ModernBERT, 8K ctx [47] | GGUF exists |
| jina-v5-text-nano (212M) | **0.157 GB** (Q4_K_M GGUF) | Very good — 8K ctx, official GGUF [44][47] | size only |
| EmbeddingGemma-300M (308M) | ~0.6 GB bf16 / ~0.15 GB int4 | Good — 196 MB RSS at 2048 tok [6] | LiteRT (hw unspecified) |
| Qwen3-Embedding-0.6B (596M) | **0.639 GB** (Q8_0 GGUF) / 639 MB Ollama | Feasible — official GGUF + ONNX + TEI [7][47] | Ollama |
| jina-v5-text-small (596M) | 0.639 GB (Q8_0 GGUF) | Feasible — 32K ctx, official GGUF [44][47] | size only |
| bge-m3 (568M) | ~2.27 GB fp32 | Feasible with int8 — labelled "GPU only" on sbert.net but benchmarked with int8/ONNX [5] | contradicted [2] |
| multilingual-e5-large (560M) | 2.24 GB | Feasible — largest fastembed-shipped model [8] | fastembed |
| EmbeddingGemma-2 (740M; 270M text) | ~1.5 GB bf16 / ~0.75 GB text-only | Good (text path) — GGUF exists but multimodal [47] | size only |
| Qwen3-Embedding-4B (4.02B) | ~16 GB fp32 / ~8 GB fp16 / ~4 GB int8 | Borderline — may OOM [2] | derived |
| Qwen3-Embedding-8B (7.57B) | ~32 GB fp32 / ~16 GB fp16 | Impractical [2] | derived |
| gte-Qwen2-7B (7.07B) | ~28 GB fp32 | Impractical [2] | derived |
| jina-embeddings-v3 (572M) | ~2.3 GB | **GPU-only** — card: "requires CUDA-capable GPU for production throughput" [10] | model card |

Quantization quality cost (measured, MTEB retrieval nDCG@10) [11]:

| Model | fp32 | int8 | % fp32 | binary | % fp32 |
|---|---|---|---|---|---|
| mxbai-embed-large-v1 | 54.39 | 52.79 | 97% | 52.46 | 96.45% |
| e5-base-v2 | 50.77 | 47.54 | 94.68% | 37.96 | 74.77% |
| nomic-embed-text-v1.5 | 53.01 | — | — | 46.49 | 87.7% |
| all-MiniLM-L6-v2 | 41.66 | 37.82 | 90.79% | 39.07 | 93.79% |

Quantization cost is model-specific: e5-base-v2 binary loses 25 points (74.77%), mxbai binary only 3.55 (96.45%). int8 is generally safe (~97–99% of fp32); binary must be checked per model [11].

### Long-context

- **512-context models average 34–41 on LongEmbed** (6 retrieval tasks, 256–32K tokens); **native 8K models average 56.8–58.9** [12].
- **Context extension (NTK / SelfExtend) adds +10.9 to +20.3 points** to 512-ctx models [12].
- **Chunking+pooling loses to true long-context embedding**: M2-BERT-32k beats BM25 by 14.8 points on LoCoV1 [13].
- **Late chunking** beats naive chunking on BEIR; gain correlates with document length [14].
- **Qwen3-Embedding-0.6B has 32K context** — the longest of any CPU-feasible permissive model, equal to jina-v5-text-small [1].
- CPU-feasible long-context survivors (≤600M, ≥8K): Qwen3-0.6B (32K), jina-v5-text-small (32K, NC), jina-v5-text-nano (8K, NC), granite-english-r2 (8K), bge-m3 (8K), arctic-l-v2.0 (8K), jina-v2-base-en (8K) [12][47].

### The counter-angle: BM25 vs dense

The room's content is agent chatter full of identifiers, file paths, and code.

**Where BM25 beats dense:**
- BM25 is a robust zero-shot baseline; dense bi-encoders often underperform it out-of-distribution (BEIR: DPR −47.7%, ANCE −7.4% vs BM25) [16].
- Dense false-positive rate grows with index size: BM25 0.00% vs dense 128-dim up to 9.73% noise hits; DPR retrieved a random-string passage above the relevant passage for up to 12.08% of questions at 100M docs [17].
- Dense retrievers "drastically underperform sparse methods" on entity-rich questions [18]; "token amnesia" on tail entities correlates with forgetting entity tokens [19].
- BRIGHT: the then-top MTEB retriever scored 59.0 nDCG@10 on MTEB but only 18.3 on BRIGHT — reasoning-intensive queries (incl. coding) collapse [20].

**Where dense beats BM25:**
- CoIR (code): BM25 avg 29.79 vs dense/code models 36.40–56.26 [21].
- CodeRAG-Bench: "dense embedding models frequently surpass BM25 on code retrieval" [22].
- BGE-M3 hybrid on MIRACL: 71.5 vs BM25 31.9 [23].

**Reconciliation:** the regime depends on model choice, not paradigm. Where the encoder is code-trained, dense wins on code; where it is not and the domain shifts, BM25 wins [3]. BEIR's own authors state the benchmark "can give an unfair disadvantage to non-lexical approaches" [24].

**Hybrid (BM25 + dense) — measured deltas:**
- RRF "consistently yields better results than any individual system" [25]; Elastic: +1.4% over ELSER, +18% over BM25 alone [26]; Vespa: hybrid 0.481 vs BM25 0.453, best on 12/13 datasets [27]; BEIR SIGIR-2024: fusion "more than a six-point gain on average" [28]; Qdrant: RRF beat the stronger retriever on 4/5 datasets [29].
- **Caveat:** fusion only reorders the union — "a document neither one found cannot appear anywhere in the results" [29]. Gains are conditional on comparable retriever strength [30].
- **Cost on CPU:** BEIR 1M-doc DBPedia index — BM25 0.4 GB / 20 ms vs dense 768-dim 3 GB / 125–275 ms [31].

### The two-jobs question: one model or two?

- Qwen3-0.6B is the only permissively licensed, CPU-feasible model that is simultaneously the best CPU-feasible option on Retrieval (61.83) and within 3.0 points of the best on Classification (84.58 vs EmbeddingGemma-300M's 87.55), with the best PairClass of the permissive CPU set tied at 84.37–84.95 [1].
- Task conditioning is the mechanism: Qwen3-Embedding is instruction-aware ("1% to 5%" improvement) [37]; Cohere exposes per-call `input_type` [38]; Gemini assigns duplicate detection to `SEMANTIC_SIMILARITY` [39].
- Dedup is measured as Pair Classification, not retrieval [40] — same embedding space, different metric.
- jina-v3 demonstrates one model with five task adapters scoring well on both jobs [41] — but it is non-commercial and GPU-only.
- The 2022 "no model dominates" finding is stale at the top (Qwen3-8B leads both) but holds across subsets [42]; MTEB-BR shows cross-category rank transfer is imperfect (classification ρ=0.68) [43].

**Recommendation:** start with one model (Qwen3-0.6B). If classification quality proves insufficient after deployment, add a specialized classifier — published evidence says the within-family gap is small.

## What would change this

1. **A published i5-1135G7 CPU benchmark** showing Qwen3-0.6B is too slow → flips the pick to bge-base-en-v1.5 (Path 1).
2. **A permissive (Apache/MIT) model with jina-v5-nano's quality-per-parameter** → jina-v5-nano's 71.11 / 90.07 at 212M is the target to beat; today it is licence-blocked.
3. **Independent MTEB verification of EmbeddingGemma-2's text encoder** — if Google's self-reported 68.46 Eng-v2 holds on the harness, it becomes a strong permissive alternative.
4. **omp adding Qwen3-Embedding-0.6B to `KNOWN_MODEL_NAMES`** → makes it Path 1 (zero config).
5. **A published benchmark on agent-chat-log retrieval** showing dense-only suffices → weakens the hybrid recommendation.
6. **Evidence the room is English-only** → removes the multilingual premium.

## Considered and rejected

| Model | Why rejected |
|---|---|
| **jina-embeddings-v5-text-nano** | **Best quality-per-parameter** (212M, 71.11 Mean(Task), 90.07 Classification) and has an official 157 MB GGUF — but **CC-BY-NC-4.0, not commercially usable**, and Retrieval (58.80) trails Qwen3-0.6B (61.83) [1][44] |
| **jina-embeddings-v5-text-small / -omni-small** | Same licence block; omni-small's text encoder equals text-small (71.78 / 60.07) [44] |
| **EmbeddingGemma-2 (740M; 270M text)** | Apache-2.0, 8192 ctx, card 68.46 Eng-v2 — but **self-reported, zero live-board rows**, no text-only GGUF (only multimodal with mmproj), and the 270M text export has never been benchmarked [46] |
| Qwen3-Embedding-8B / -4B | Best scores but 7.57B / 4.02B → ~16–32 GB fp16 — impractical on 15 GB [2] |
| nvidia/NV-Embed-v2 | Retrieval 62.84 (best in table) but 7.85B and **CC-BY-NC-4.0** [1] |
| Salesforce/SFR-Embedding-2_R | Highest Classification (90.54) but Retrieval 53.75 and **CC-BY-NC-4.0** [1] |
| NovaSearch/stella_en_400M_v5 | 435M, Classification 88.25, MIT — but **no usable GGUF** (arch `new`/`NewModel` unsupported by llama.cpp), so it needs Path 4 [47] |
| jina-embeddings-v3 | CC-BY-NC-4.0 **and** card states CUDA required for production throughput [10][45] |
| gte-Qwen2-7B-instruct / e5-mistral-7b-instruct | 7B-class → impractical on 15 GB [2] |
| voyage-4-nano | Apache-2.0 but only 9/131 MMTEB tasks — aggregate unverified [36]; Path 3 via community GGUF or TEI [47] |

## Findings

### A. Metric-scale reconciliation (round 2)

Four suites exist, each with three aggregations. `MTEB(eng, v2)` = 41 tasks / 7 types; `MTEB(eng, v1)` = 56; `MTEB(Multilingual, v2)` = 131 / 9; `BEIR` = 15 / 1. `meanTask` = unweighted mean over tasks; `meanTaskType` = mean of per-type means [46]. A modern card's "MTEB English v2 N.N" maps to live `meanTask` — confirmed by two independent Rosetta stones (Qwen3-0.6B: card 70.70 vs live 70.47 Mean(Task), 64.88 Mean(Type) both; EmbeddingGemma-300m: card 69.67 / 61.15 = live exactly) [46]. jina-v5's 71.7 is therefore the same metric as Qwen3-0.6B's 70.47; round 1's omission of jina-v5 was a coverage gap, not a scale error [44][46].

### B. Hybrid architecture recommendation

The room already has FTS. Published evidence supports hybrid: BM25 is robust zero-shot [16]; dense fails on identifiers [17][18]; RRF fusion beats both parents on most datasets [25][26][27][28][29]; fusion is rank-based and cheap [25]; BM25 adds 0.4 GB / 20 ms at 1M docs [31]. **Recommended:** BM25 (FTS) + Qwen3-0.6B (dense) with RRF fusion.

### C. The tradeoff curve

| Tier | Model | Params | Size | Retrieval | Classification | Context | Licence | Path |
|---|---|---|---|---|---|---|---|---|
| Best quality | Qwen3-8B | 7.57B | ~16 GB fp16 | 69.44 | 90.43 | 32K | Apache-2.0 | 4 |
| **Best CPU-feasible** | **Qwen3-0.6B** | **0.596B** | **0.64 GB Q8_0** | **61.83** | **84.58** | **32K** | **Apache-2.0** | **3** |
| Best per-param (NC) | jina-v5-text-nano | 0.212B | 0.157 GB Q4_K_M | 58.80 | 90.07 | 8K | CC-BY-NC-4.0 | 3 |
| Smallest permissive competitive | EmbeddingGemma-300M | 0.308B | ~0.15 GB int4 | 55.69 | 87.55 | 2K | gemma | 3 |
| Best whitelisted | bge-base-en-v1.5 | 0.109B | 0.21 GB | 54.75 | 77.69 | 512 | MIT | 1 |
| Smallest whitelisted | all-MiniLM-L6-v2 | 0.023B | 0.09 GB | 42.92 | 69.25 | 256 | Apache-2.0 | 1 |

Quality scales with size, but the marginal gain from 0.6B → 8B is 7.6 retrieval points for 13× the size. The CPU sweet spot is 0.2–0.6B.

## Open questions

1. **No published i5-1135G7 CPU benchmark exists for any embedding model** — all data is 16c desktop/server. The recommendation assumes Qwen3-0.6B at 0.64 GB Q8_0 is feasible on 15 GB RAM, derived from artifact size, not measured.
2. **No published benchmark covers agent-chat-log retrieval** — identifier-heavy evidence is proxied from code/entity retrieval.
3. **EmbeddingGemma-2's scores are self-reported** — zero live-board rows; the 270M text export has never been benchmarked.
4. **jina-v5-text-small's own live `meanTask` is null** (3 missing Classification cells); the omni-small proxy (71.78) is used. BEIR `meanTask` is null for all jina-v5 rows.
5. **TEI support for jina-v5-text-small and stella is unverified** (arch inference only).
6. **The live MTEB rank formula is undocumented** — reproduction as per-task average-rank is inference from data.

## Sources

### Primary — MTEB leaderboard (snapshot 2026-10-05, fetched 2026-10-07)

[1] MTEB leaderboard backend API — `MTEB(eng, v2)`, `MTEB(Multilingual, v2)`, `BEIR`, `MTEB(eng, v1)` scores endpoints. `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`. Fetched 2026-10-07.

### Primary — CPU inference, quantization, long-context

[2] E3 findings: `docs/research/embeddings/findings/E3-long-context-cpu.md` (F3 + F5). 54 sources.
[5] sentence-transformers efficiency benchmark. `https://sbert.net/docs/sentence_transformer/usage/efficiency.html`.
[6] EmbeddingGemma LiteRT benchmark. `https://huggingface.co/litert-community/embeddinggemma-300m`.
[7] Ollama Qwen3-Embedding-0.6B. `https://ollama.com/library/qwen3-embedding:0.6b`.
[8] fastembed supported models (docs — stale; source tree is authoritative [47]). `https://qdrant.github.io/fastembed/examples/Supported_Models`.
[10] jina-embeddings-v3 model card. `https://jina.ai/models/jina-embeddings-v3`.
[11] HuggingFace embedding quantization blog. `https://huggingface.co/blog/embedding-quantization`.
[12] LongEmbed (arXiv:2404.12096). `https://arxiv.org/html/2404.12096v3`.
[13] M2-BERT / LoCoV1 (arXiv:2402.07440). `https://arxiv.org/html/2402.07440v3`.
[14] Late chunking (arXiv:2409.04701). `https://arxiv.org/abs/2409.04701`.
[15] Nomic Embed technical report (arXiv:2402.01613). `https://arxiv.org/html/2402.01613v2`.

### Primary — Counter-angle: BM25 vs dense

[3] E4 findings: `docs/research/embeddings/findings/E4-counter-hybrid.md` (F4 + F8). 65 sources.
[16] BEIR (arXiv:2104.08663). `https://arxiv.org/html/2104.08663v4`.
[17] Reimers & Gurevych (arXiv:2012.14210). `https://arxiv.org/html/2012.14210v2`.
[18] EntityQuestions (arXiv:2109.08535). `https://arxiv.org/abs/2109.08535`.
[19] "What Are You Token About?" (ACL 2023). `https://aclanthology.org/2023.acl-long.140.pdf`.
[20] BRIGHT (arXiv:2407.12883). `https://arxiv.org/abs/2407.12883`.
[21] CoIR (arXiv:2407.02883). `https://arxiv.org/html/2407.02883v3`.
[22] CodeRAG-Bench (arXiv:2406.14497). `https://arxiv.org/html/2406.14497v2`.
[23] BGE-M3 paper (arXiv:2402.03216). `https://arxiv.org/html/2402.03216v5`.
[24] BEIR lexical bias (arXiv:2104.08663 §6).
[25] Cormack, Clarke & Buettcher — RRF (SIGIR 2009). `https://dl.acm.org/doi/pdf/10.1145/1571941.1572114`.
[26] Elastic hybrid search. `https://www.elastic.co/search-labs/blog/improving-information-retrieval-elastic-stack-hybrid`.
[27] Vespa hybrid search. `https://blog.vespa.ai/improving-zero-shot-ranking-with-vespa-part-two/`.
[28] BEIR SIGIR-2024 resource paper (arXiv:2306.07471). `https://arxiv.org/html/2306.07471v1`.
[29] Qdrant hybrid search. `https://qdrant.tech/documentation/search-tuning/hybrid-search/`.
[30] Elastic — conditional gains (same URL as [26]).
[31] BEIR cost/size table (arXiv:2104.08663 §5.1).

### Primary — Multilingual and model cards

[32] MTEB(Multilingual, v2) parquet recompute. `https://huggingface.co/datasets/mteb/results`.
[34] granite-embedding-311m-multilingual-r2 card. `https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2`.
[36] voyage-4-nano card. `https://huggingface.co/voyageai/voyage-4-nano`.
[37] Qwen3-Embedding card. `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B`.
[38] Cohere embeddings docs. `https://docs.cohere.com/docs/embeddings`.
[39] Gemini embeddings docs. `https://ai.google.dev/gemini-api/docs/embeddings`.
[40] MTEB pair classification tasks. `https://docs.mteb.org/overview/available_tasks/pair-classification/`.
[41] jina-embeddings-v3 paper (arXiv:2409.10173). `https://arxiv.org/html/2409.10173v3`.
[42] MTEB 2022 paper (arXiv:2210.07316). `https://arxiv.org/html/2210.07316v3`.
[43] MTEB-BR (arXiv:2607.04581). `https://arxiv.org/html/2607.04581v2`.

### Primary — Round 2 additions

[44] E5 findings (jina-v5): `docs/research/embeddings/findings/F9-jina-v5.md` + `docs/research/embeddings/findings/E5-v5-gemma2.md`. Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`, `https://arxiv.org/html/2602.15547v1` (Tables 1–3), `https://huggingface.co/jinaai/jina-embeddings-v5-text-nano/raw/main/README.md`, `https://arxiv.org/abs/2605.08384`. Fetched 2026-10-07.
[45] jina-embeddings-v3 licence. `https://huggingface.co/jinaai/jina-embeddings-v3`.
[46] F12 scale reconciliation: `docs/research/embeddings/findings/F12-scale-reconcile.md` + `F10-gemma2-text.md`. Sources: `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/_benchmark_metrics.py`, `.../benchmarks/benchmarks.py`, `https://huggingface.co/google/embeddinggemma-2/raw/main/README.md`. Fetched 2026-10-07.
[47] F11 CPU-servable build audit: `docs/research/embeddings/findings/F11-gguf-servability.md`. Sources: `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp`, `.../tools/server/README.md`, `https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/backends/candle/src/lib.rs`, `https://raw.githubusercontent.com/qdrant/fastembed/main/fastembed/text/*.py`, `https://huggingface.co/docs/text-embeddings-inference/supported_models`, GGUF headers via HTTP Range. Fetched 2026-10-07.
[48] Gemma Terms of Use. `https://ai.google.dev/gemma/terms` (§2.2 Use; §3.1 Distribution). Fetched 2026-10-07.

### Secondary

[9] granite-embedding-english-r2 card (primary; listed for the r2 context table). `https://huggingface.co/ibm-granite/granite-embedding-english-r2`.
[33] jina-embeddings-v5 licence field (primary; superseded by [44]).
[35] stella_en_1.5B_v5 card (primary). `https://huggingface.co/NovaSearch/stella_en_1.5B_v5`.
