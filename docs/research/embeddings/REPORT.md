# Embedding models for a local, CPU-only retrieval layer

**Answer:** With the size constraint relaxed but a **<1 s per embedding call** budget, the pick **changes from round 2**. On the target CPU the two 0.6 B qwen3-architecture models (Qwen3-Embedding-0.6B and jina-v5-text-small) are **derived at 2.7–5.9 s per 512-token call** — they break the 1 s budget from roughly **128 tokens upward** [49]. The **EmbeddingGemma family** is the only competitive family that stays under 1 s across its supported range (0.42–0.89 s at 512 tokens), because its llama.cpp graph skips a wasted `lm_head` pass that the qwen3-arch models pay (26 % of their FLOPs, verified in llama.cpp source) [49][50].

**Recommended:** `google/embeddinggemma-300m` (308 M, 2 K ctx, `gemma` licence, Path 3, GGUF + ONNX + fastembed + Ollama) as the **primary**, with Qwen3-Embedding-0.6B retained as the **quality fallback** for cases where its 512-token latency is acceptable (e.g. short queries, or batched offline indexing where throughput — not single-call latency — is what matters). For code retrieval specifically, Qwen3-0.6B is the stronger and harness-verified model (MTEB(Code, v1) **75.42** vs EmbeddingGemma-v1's 68.76) [51] — so if the room's content is code-dominant *and* calls can be kept short, Qwen3-0.6B is still defensible.

**Confidence:** medium on the ranking, **low-medium on the absolute latency numbers**. MTEB scores are from the live leaderboard backend (snapshot 2026-10-05, fetched 2026-10-07) [1]. **No published CPU benchmark exists for any of these models on a 4-core Intel laptop** — the latency figures are derived with a 2× uncertainty band, calibrated against real CPU llama.cpp runs on other hardware [49]. The 1 s verdict is robust at the order-of-magnitude level; the exact crossing point is not.

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

## Round 3 — the size constraint relaxed, latency budget added

The user relaxed size ("we aren't aiming for small") and set the real constraint: **<1 s per embedding call**, generously. This changes the pick.

| Round 2 | Round 3 | Effect on the recommendation |
|---|---|---|
| Qwen3-Embedding-0.6B primary; size optimised | **Latency measured/derived on the target CPU**: Qwen3-0.6B 2.7–5.3 s at 512 tokens [49] | **CHANGED** — Qwen3-0.6B breaks the 1 s budget from ~128 tokens up |
| No Code benchmark comparison | Qwen3-0.6B **75.42** on MTEB(Code, v1) — harness-verified; EmbeddingGemma-v1 68.76; jina-v5 absent [51] | Qwen3-0.6B keeps the **Code** crown; EmbeddingGemma-2's 78.68 is self-reported only |
| Larger models out of scope | Qwen3-4B/8B checked: **no model >1.5 B meets <1 s at 2048 tokens** [52] | Size relaxation buys nothing — latency, not size, is binding |
| EmbeddingGemma-2 dismissed | Text layer is a genuine **270 M** (not 740 M); Apache-2.0; stays <1 s to ~1 K tokens [53] | Becomes the **primary** |
| jina-v5 quality-per-parameter noted | Still wins Classification/STS, still **CC-BY-NC-4.0** | Excluded from the commercial pick |

### Head-to-head — the three CPU candidates, one scale

MTEB(eng, v2), live board snapshot 2026-10-05, fetched 2026-10-07 [1]. All values × 100.

| Model | Params (text) | Dim | Max ctx | Mean(Task) | Retrieval | Classification | Clustering | STS | PairClass | **Code (MTEB Code v1)** | Licence | CPU @512 tok `[derived]` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| jina-v5-text-small | 0.596 B | 1024 | 32 K | null (38/41) | 60.07 | — | 54.69 | 88.13 | 84.95 | **absent** | **CC-BY-NC-4.0** | 3.0–5.9 s |
| jina-v5-text-nano | 0.212 B | 768 | 8 K | **71.11** | 58.80 | **90.07** | 53.49 | **88.28** | 84.74 | **absent** | **CC-BY-NC-4.0** | 0.71–1.42 s |
| jina-v5-omni-small *(text)* | 0.596 B text | 1024 | 32 K | 71.78 | 60.07 | 90.75 | 54.69 | 88.13 | 84.95 | **absent** | **CC-BY-NC-4.0** | 3.0–5.9 s |
| **Qwen3-Embedding-0.6B** | 0.596 B | 1024 | 32 K | 70.47 | **61.83** | 84.58 | 54.05 | 86.57 | 84.37 | **75.42** ✓harness | **Apache-2.0** | 2.7–5.3 s |
| google/embeddinggemma-300m | 0.308 B | 768 | 2 K | 69.67 | 55.69 | 87.55 | **56.55** | 83.61 | **87.29** | **68.76** ✓harness | gemma (gated) | **0.45–0.89 s** |
| **EmbeddingGemma-2 (text-270M)** | **0.270 B text** / 0.740 B total | 768 | 8 K | 68.46 *(self-rep.)* | — | — | — | — | — | 78.68 *(self-rep.)* | **Apache-2.0** | **0.42–0.84 s** |

**On the user's hypothesis** ("no way embeddinggemma is better than these larger ones"): **confirmed for EmbeddingGemma v1** — Qwen3-0.6B beats it on Retrieval (61.83 vs 55.69), on Code (75.42 vs 68.76), and at 2× the params it is the stronger model per parameter on the room's primary job. **Not confirmed for EmbeddingGemma-2**: its self-reported 68.46 Eng-v2 / 78.68 Code would beat Qwen3-0.6B on Code — but it has **zero harness rows** and must be treated as unverified [51][53].

**The 740 M figure is misleading in the user's favour:** 270 M text + 170 M vision + 300 M audio. Under the text-only rule the model is a **270 M text encoder**, and the standalone export `jayyun98/embeddinggemma-2-text-270m` (271 M params, 542 MB bf16) exists with verified tensor equality [53].

### CPU latency — where each model crosses the 1 s line

All `[derived]` from per-token FLOPs calibrated against real CPU llama.cpp runs; band 115–230 GFLOP/s on the i5-1135G7. **No published 4-core-laptop benchmark exists for any of these models** [49].

| Model | 128 tok | 512 tok | 2048 tok | Crosses 1 s at | Verdict |
|---|---|---|---|---|---|
| **EmbeddingGemma-2 text-270M** | 0.10–0.21 s | **0.42–0.84 s** | 1.7–3.4 s | ~605–1210 tok | **within budget** to ~1 K tok |
| **embeddinggemma-300m** | 0.11–0.22 s | **0.45–0.89 s** | 1.8–3.6 s | ~575–1150 tok | **within budget** across its 2 K ctx (borderline at top) |
| **jina-v5-text-nano** | 0.18–0.36 s | 0.71–1.42 s | 2.8–5.7 s | ~360–720 tok | safe for chunks ≤512 |
| **Qwen3-Embedding-0.6B** | 0.66–1.32 s | **2.7–5.3 s** | 11–21 s | **~100–190 tok** | **breaks budget from ~128 tok** |
| **jina-v5-text-small** | 0.74–1.48 s | 3.0–5.9 s | 12–24 s | ~85–175 tok | **breaks budget** |
| bge-base-en-v1.5 INT8 | 0.09–0.19 s | 0.38–0.75 s | n/a (512 cap) | never | safe by construction |
| multilingual-e5-large INT8 | 0.48–0.96 s | 1.9–3.8 s | n/a (512 cap) | ~135–270 tok | over budget at its own cap |

**Why the qwen3-arch models are structurally slower:** llama.cpp builds and then discards the `lm_head` projection in embedding mode for every architecture except `llama` — verified in `src/models/qwen3.cpp` at master, which builds `build_lora_mm(model.output, cur)` unconditionally. For Qwen3-Embedding-0.6B that is **26 % of all CPU FLOPs, wasted**. `src/models/gemma-embedding.cpp` never builds lm_head, so the EmbeddingGemma family does not pay it. The upstream fix (issue #24713) was **closed without merging** [50].

**Larger models do not help.** Under the relaxed size constraint, no model >1.5 B meets the budget at 2048 tokens, and Qwen3-Embedding-4B is borderline even at 512 (0.28–1.0 s, then 2.2–8.0 s at 2048). All candidates fit 15 GB RAM at Q4–Q8 — memory is not binding, latency is [52].

**Caveat on the whole table:** the band is 2× wide and irreducible without a local run. A 10-minute `llama-bench -m <model>.gguf -embd 1 -ngl 0 -t 4 -p 128,512,2048 -n 0 -r 5` settles it [49].

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

- **The latency constraint now dominates this decision.** Qwen3-0.6B is the best *permissive* model on Retrieval (61.83) and Code (75.42), but it breaks the 1 s budget from ~128 tokens on the target CPU [49][51]. EmbeddingGemma-300M is 5.7 points behind on Retrieval and 6.7 behind on Code, but answers in 0.45–0.89 s at 512 tokens [49].
- Task conditioning is the mechanism: Qwen3-Embedding is instruction-aware ("1% to 5%" improvement) [37]; Cohere exposes per-call `input_type` [38]; Gemini assigns duplicate detection to `SEMANTIC_SIMILARITY` [39].
- Dedup is measured as Pair Classification, not retrieval [40] — same embedding space, different metric.
- jina-v3 demonstrates one model with five task adapters scoring well on both jobs [41] — but it is non-commercial and GPU-only.
- The 2022 "no model dominates" finding is stale at the top (Qwen3-8B leads both) but holds across subsets [42]; MTEB-BR shows cross-category rank transfer is imperfect (classification ρ=0.68) [43].

**Recommendation:** still one model, but which one depends on the workload split. EmbeddingGemma-300M for latency-bound single-call retrieval/classification; Qwen3-0.6B where code-retrieval quality matters most and inputs can be kept short, or for offline batch indexing where throughput rather than per-call latency is the metric.

## What would change this

1. **A local `llama-bench -embd 1 -ngl 0 -t 4` run** — the single cheapest thing that would settle the latency question. If Qwen3-0.6B lands near the optimistic end (~2.7 s at 512 tokens) it is still over budget; if it lands under 1 s at 512, Qwen3-0.6B becomes the primary again on quality grounds [49].
2. **Harness verification of EmbeddingGemma-2's text encoder** — if Google's self-reported 68.46 Eng-v2 / 78.68 Code holds on the MTEB harness, EmbeddingGemma-2 (270 M text, Apache-2.0, <1 s) wins outright [51][53].
3. **A build carrying the llama.cpp `lm_head` skip** (issue #24713) — removes 26 % of Qwen3-0.6B's FLOPs and pulls its 1 s crossing out to ~150–260 tokens. Still short of 512 [50].
4. **ONNX Runtime / OpenVINO instead of llama.cpp** — batched GEMM reaches 60–75 % efficiency vs llama.cpp's ~30 %, which would roughly halve the Qwen3 numbers; single-call still uses the pessimistic end [49].
5. **An Apache/MIT model with jina-v5-nano's quality-per-parameter** (71.11 / 90.07 at 212 M) — today licence-blocked.
6. **Evidence the room is English-only** → removes the multilingual premium.

## Considered and rejected

| Model | Why rejected |
|---|---|
| **Qwen3-Embedding-0.6B (as primary)** | **Demoted to fallback, not rejected.** Best permissive Retrieval (61.83) and Code (75.42, harness-verified), Apache-2.0, 32 K ctx — but **2.7–5.3 s per 512-token call** on the target CPU `[derived]`, breaking the 1 s budget from ~128 tokens [49][51] |
| **jina-embeddings-v5-text-nano** | Best quality-per-parameter (212 M, 71.11 Mean(Task), 90.07 Classification), official 157 MB GGUF, and within budget to ~512 tokens — but **CC-BY-NC-4.0, not commercially usable** [1][44] |
| **jina-embeddings-v5-text-small / -omni-small** | Same licence block; omni-small's text encoder equals text-small (71.78 / 60.07); 3.0–5.9 s at 512 tokens [44][49] |
| **EmbeddingGemma-2 (740 M; 270 M text)** | *Promoted, not rejected* — Apache-2.0, 8 K ctx, 270 M text layer, 0.42–0.84 s at 512 tokens. Held out of the primary slot only because its scores are **self-reported with zero harness rows** [51][53] |
| Qwen3-Embedding-8B / -4B | Best scores (75.23 / 74.61) but **no model >1.5 B meets <1 s at 2048 tokens**; 4B is borderline even at 512 [52] |
| nvidia/NV-Embed-v2 | Retrieval 62.84 but 7.85 B, **CC-BY-NC-4.0**, and **no CPU build** [1][52] |
| Salesforce/SFR-Embedding-2_R | Highest Classification (90.54) but Retrieval 53.75, **CC-BY-NC-4.0**, no CPU build [1][52] |
| NovaSearch/stella_en_400M_v5 | 435 M, Classification 88.25, MIT — but **no usable GGUF** (arch `new`/`NewModel` unsupported by llama.cpp), and *below* Qwen3-0.6B on meanTask [47][52] |
| jina-embeddings-v3 | CC-BY-NC-4.0 **and** 0.55 sentences/s on CPU (~1.8 s/call, 480× slower than bge-base) [10][45][49] |
| gte-Qwen2-7B-instruct / e5-mistral-7b-instruct | 7 B-class → 0.65–2.0 s at 512 tokens `[derived]` [52] |
| voyage-4-nano | Apache-2.0 but only 9/131 MMTEB tasks — aggregate unverified [36]; Path 3 via community GGUF or TEI [47] |
| codefuse-ai/F2LLM-v2-0.6B / -1.7B | **New in round 3:** harness-verified Code 77.41 / 78.76 (Apache-2.0, GGUF available) — the best code-per-parameter found. Not adopted because their eng-v2 Retrieval is *lower* than Qwen3-0.6B (54.31 / 56.65 vs 61.83) and they inherit the same qwen3-arch latency penalty [51] |

## Findings

### A. Metric-scale reconciliation (round 2)

Four suites exist, each with three aggregations. `MTEB(eng, v2)` = 41 tasks / 7 types; `MTEB(eng, v1)` = 56; `MTEB(Multilingual, v2)` = 131 / 9; `BEIR` = 15 / 1. `meanTask` = unweighted mean over tasks; `meanTaskType` = mean of per-type means [46]. A modern card's "MTEB English v2 N.N" maps to live `meanTask` — confirmed by two independent Rosetta stones (Qwen3-0.6B: card 70.70 vs live 70.47 Mean(Task), 64.88 Mean(Type) both; EmbeddingGemma-300m: card 69.67 / 61.15 = live exactly) [46]. jina-v5's 71.7 is therefore the same metric as Qwen3-0.6B's 70.47; round 1's omission of jina-v5 was a coverage gap, not a scale error [44][46].

### B. Hybrid architecture recommendation

The room already has FTS. Published evidence supports hybrid: BM25 is robust zero-shot [16]; dense fails on identifiers [17][18]; RRF fusion beats both parents on most datasets [25][26][27][28][29]; fusion is rank-based and cheap [25]; BM25 adds 0.4 GB / 20 ms at 1M docs [31]. **Recommended:** BM25 (FTS) + the chosen dense model with RRF fusion. Hybrid is *more* important now, not less: the dense model that fits the latency budget (EmbeddingGemma-300M, Retrieval 55.69) is weaker on retrieval than Qwen3-0.6B (61.83), so the lexical channel carries more of the load.

### C. The tradeoff curve

| Tier | Model | Params | Size | Retrieval | Code | Classification | Context | Licence | Path | CPU @512 `[derived]` |
|---|---|---|---|---|---|---|---|---|---|---|
| Best quality (no CPU budget) | Qwen3-8B | 7.57 B | ~16 GB fp16 | 69.44 | 80.69 | 90.43 | 32 K | Apache-2.0 | 4 | 8+ s |
| **Best quality within budget** | **EmbeddingGemma-2 (text-270M)** | **0.270 B text** | 0.165 GB int4 | 68.46 *(self-rep.)* | 78.68 *(self-rep.)* | — | 8 K | **Apache-2.0** | 3 | **0.42–0.84 s** |
| **Primary (verified)** | **embeddinggemma-300m** | 0.308 B | ~0.15 GB int4 | 55.69 | 68.76 | 87.55 | 2 K | gemma (gated) | 3 | **0.45–0.89 s** |
| Quality fallback | Qwen3-0.6B | 0.596 B | 0.639 GB Q8_0 | **61.83** | **75.42** | 84.58 | 32 K | Apache-2.0 | 3 | 2.7–5.3 s |
| Best per-param (NC) | jina-v5-text-nano | 0.212 B | 0.157 GB Q4_K_M | 58.80 | — | 90.07 | 8 K | CC-BY-NC-4.0 | 3 | 0.71–1.42 s |
| Best whitelisted | bge-base-en-v1.5 | 0.109 B | 0.21 GB | 54.75 | — | 77.69 | 512 | MIT | 1 | 0.38–0.75 s |
| Smallest whitelisted | all-MiniLM-L6-v2 | 0.023 B | 0.09 GB | 42.92 | — | 69.25 | 256 | Apache-2.0 | 1 | <0.1 s |

**The curve is not monotone in size once latency is the constraint.** Quality rises with size, but the 0.6 B models cross the 1 s line and the 0.27–0.31 B EmbeddingGemma family does not. Under a <1 s budget the efficient frontier is the EmbeddingGemma family plus (for short inputs) Qwen3-0.6B.

## Open questions

1. **No published i5-1135G7 CPU benchmark exists for any embedding model** — all data is 16c desktop/server, a phone, or hardware-unstated. Every latency figure in this report is `[derived]` with a 2× band. **This is the single largest gap and the cheapest to close** (a 10-minute `llama-bench` run) [49].
2. **No published benchmark covers agent-chat-log retrieval** — identifier-heavy evidence is proxied from code/entity retrieval.
3. **EmbeddingGemma-2's scores are self-reported** — zero live-board rows; the 270M text export has never been benchmarked.
4. **jina-v5-text-small's own live `meanTask` is null** (3 missing Classification cells); the omni-small proxy (71.78) is used. BEIR `meanTask` is null for all jina-v5 rows.
5. **TEI support for jina-v5-text-small and stella is unverified** (arch inference only).
6. **The live MTEB rank formula is undocumented** — reproduction as per-task average-rank is inference from data.
7. **No harness-verified Code score** for EmbeddingGemma-2 or any jina-v5 model; the 78.68 is self-reported [51].
8. **No published CPU number for any target model on a 4-core Intel laptop**, and no `llama-bench -embd 1` result for any `eurobert` model (jina-v5-nano) [49].

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

### Primary — Round 3 additions

[49] E6 findings (CPU latency): `docs/research/embeddings/findings/F14-cpu-latency.md` + `docs/research/embeddings/findings/E6-cpu-latency.md`. Published CPU numbers: `https://github.com/ikawrakow/ik_llama.cpp/discussions/898`, `https://github.com/ggml-org/llama.cpp/issues/19933`, `https://engineered.at/articles/text-embedding-inference-on-a-cheap-server`, `https://github.com/QuixiAI/embeddinggemma.c`, `https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm`, `https://huggingface.co/blog/static-embeddings`, `https://treeru.com/en/blog/cpu-embedding-benchmark-tool`, `https://github.com/Oaklight/openvino-meteor-lake-ai-inference/blob/main/docs/BENCHMARK_RESULTS.md`, `https://github.com/huggingface/text-embeddings-inference/issues/31`, `https://github.com/ggml-org/llama.cpp/issues/21854`. Derived latency: per-token FLOPs from published architecture, calibrated 115–230 GFLOP/s. Fetched 2026-10-07.
[50] llama.cpp `lm_head` in embedding mode. `https://github.com/ggml-org/llama.cpp/issues/24713` (closed unmerged); source read at master: `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/models/qwen3.cpp`, `.../src/models/gemma-embedding.cpp`. Fetched 2026-10-07.
[51] E7 findings (head-to-head) + F13 code benchmark: `docs/research/embeddings/findings/F13-code-benchmark.md`, `E7-headtohead.md`. MTEB(Code, v1) live board: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Code%2C%20v1%29/scores` (12 tasks, all Retrieval, nDCG@10); CoIR: `.../CoIR/scores`. EmbeddingGemma-2 card: `https://huggingface.co/google/embeddinggemma-2/raw/main/README.md`. Qwen3 paper: `https://arxiv.org/abs/2506.05176` (Tables 3, 5). Fetched 2026-10-07.
[52] F15 larger-models findings: `docs/research/embeddings/findings/F15-larger-models.md` (14 sources). Fetched 2026-10-07.
[53] EmbeddingGemma-2 text-only artifacts: `https://huggingface.co/jayyun98/embeddinggemma-2-text-270m` (271,002,624 params, 542 MB bf16, verified tensor equality), `https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm`, `https://huggingface.co/ggml-org/embeddinggemma-2-GGUF`, `https://huggingface.co/unsloth/embeddinggemma-2-GGUF`. Fetched 2026-10-07.
[54] New code-specialised candidates: `codefuse-ai/F2LLM-v2-0.6B` (Apache-2.0, Code 77.41), `codefuse-ai/F2LLM-v2-1.7B` (Code 78.76), `perplexity-ai/pplx-embed-v1-0.6b` (MIT, Code 75.85). Live MTEB(Code, v1) + MTEB(eng, v2) boards; GGUF repos `mradermacher/F2LLM-v2-0.6B-GGUF`, `mradermacher/F2LLM-v2-1.7B-GGUF`. Fetched 2026-10-07.
