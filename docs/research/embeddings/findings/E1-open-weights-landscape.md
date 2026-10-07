# E1 — Cluster: Open-weights landscape (Angle 1) + text-only extraction for multimodal models (Angle 6)

Merged by `EmbeddingResearch.M1-OpenWeightsLandscape` on **2026-10-07** from worker findings:
- `F1-open-weights-landscape.md` (Angle 1 — landscape enumeration; 45 sources)
- `F6-multimodal-text-only.md` (Angle 6 — text-only extraction for multimodal models; 20 sources)

All fetch dates are **2026-10-07** unless a row states otherwise. Param counts are HF API
`safetensors.total` unless a model card states a different figure (flagged). Every claim below
traces to a worker findings file; no claim was produced by this merger.

## Angle

**Angle 1 — Landscape enumeration.** Enumerate every serious text-embedding model family,
open-weights first (BGE/M3, GTE/Qwen3-Embedding, E5, Nomic, Jina, Stella, Snowflake Arctic,
mxbai, EmbeddingGemma, Granite, KaLM, LFM2, Voyage/open, SFR, Cohere open), then notable
API-only models (Voyage, Cohere, OpenAI, Gemini, Jina v5 API) for completeness. For each:
family, params, embedding dim, max context, licence, release date, primary source. Verify
version currency as of 2026-10-07.

**Angle 6 — Text-only extraction for multimodal models.** For EmbeddingGemma and every other
multimodal embedding model that is a plausible local CPU text retriever, isolate the text
encoder: text-only params, text-only size (excluding vision/audio layers where separable),
and text-benchmark scores (MTEB English, MTEB multilingual, MMTEB) with subset and snapshot
date. Where not separable, say so and report both total and a text-only estimate.

## Claims

### A1 · Version-currency verdict (2026-10-07)

| Expected successor | Verdict | Evidence |
|---|---|---|
| BGE-M4 / BGE-M5 | **Absent / unverified** | HF API search `bge-m4`, `bge-m5` return `[]`; FlagEmbedding README newest embedding news is 3/6/2025 (BGE-VL). |
| Qwen4-Embedding (text) | **Absent** | QwenLM org has Qwen3-Embedding (0.6B/4B/8B, June 2025) and a *multimodal* Qwen3-VL-Embedding (Jan 2026); no Qwen4 text embedder. |
| Nomic v3 | **Absent** | Newest Nomic text embedder is nomic-embed-text-v2-moe (Feb 2025); later releases are code/multimodal. |
| jina-embeddings-v5 | **Released** | v5-text nano/small Feb 18 2026; v5-omni (multimodal) May 11 2026. |
| arctic-embed-3 | **Absent** | Snowflake-Labs/arctic-embed README newest entry 12/18/2024; v2.0 (Dec 2024) is latest. |
| EmbeddingGemma 2 | **Released** | 740M multimodal, announced 2026-10-06, HF `google/embeddinggemma-2` created 2026-09-14. |
| Cohere Embed 5 | **Released** | `embed-v5.0-pro` / `embed-v5.0-fast`, announced 2026-09-30. |
| Voyage 4 open weights | **Released** | `voyage-4-nano` on HF, created 2026-01-06, Apache-2.0. |
| Gemini Embedding 2 | **Released** | Preview 2026-03-10, GA 2026-04-22; multimodal, 8,192-token input. |
| OpenAI text-embedding-4 | **Absent** | OpenAI model catalog still lists text-embedding-3-small/large as latest. |

Source: F1 (HF API probes, FlagEmbedding/Snowflake READMEs, first-party docs) / primary.

### A1 · Open-weights families

**Family 1 — BGE / BAAI (FlagOpen/FlagEmbedding)**
- `BAAI/bge-m3` — ≈568M total / 303M non-embedding (third-party Snowflake table; HF `safetensors.total` is `null` for this repo) · dim 1024 · context 8192 · MIT · released 2024-01-27 (HF `createdAt`) · multilingual 100+, dense+sparse+multi-vector. / https://huggingface.co/BAAI/bge-m3/raw/main/README.md + https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0/raw/main/README.md / primary (param figure third-party).
- `BAAI/bge-large-en-v1.5` — 335,142,400 params · dim 1024 · context 512 · MIT · 2023-09-12. / https://huggingface.co/BAAI/bge-large-en-v1.5 / primary.
- `BAAI/bge-base-en-v1.5` — 109,482,752 params · dim 768 · context 512 · MIT · 2023-09-11. / https://huggingface.co/BAAI/bge-base-en-v1.5 / primary.
- `BAAI/bge-small-en-v1.5` — 33,360,512 params · dim 384 · context 512 · MIT · 2023-09-12. / https://huggingface.co/BAAI/bge-small-en-v1.5 / primary.
- `BAAI/bge-en-icl` — 7,110,672,384 params (Mistral-7B backbone, dim 4096) · context 32768 · Apache-2.0 · 2024-07-25. / https://huggingface.co/BAAI/bge-en-icl + https://raw.githubusercontent.com/FlagOpen/FlagEmbedding/master/README.md / primary.
- `BAAI/bge-multilingual-gemma2` — 9,241,713,152 params (Gemma-2-9B backbone, dim 3584) · context 8192 · `gemma` licence · 2024-07-25. / https://huggingface.co/BAAI/bge-multilingual-gemma2 / primary.
- `BAAI/bge-reasoner-embed-qwen3-8b-0923` — 7,568,405,504 params · Apache-2.0 · created 2025-09-22 · BRIGHT nDCG@10 **37.1** (original queries). / https://huggingface.co/BAAI/bge-reasoner-embed-qwen3-8b-0923/raw/main/README.md / primary.
- **No BGE-M4 or BGE-M5 exists** as of 2026-10-07. / https://huggingface.co/api/models?search=bge-m4 + FlagEmbedding README / primary.
- BGE v1.5 retrieval models require query prefix `Represent this sentence for searching relevant passages: `; bge-m3 does not. / FlagEmbedding README / primary.

**Family 2 — GTE + Qwen3-Embedding (Alibaba-NLP / Qwen)**
- `Alibaba-NLP/gte-large-en-v1.5` — 434,139,136 params · dim 1024 · context 8192 (NTK RoPE factor 2) · Apache-2.0 · 2024-04-20. / https://huggingface.co/Alibaba-NLP/gte-large-en-v1.5 / primary.
- `Alibaba-NLP/gte-base-en-v1.5` — 136,776,192 params · dim 768 · context 8192 · Apache-2.0 · 2024-04-20. / https://huggingface.co/Alibaba-NLP/gte-base-en-v1.5 / primary.
- `Alibaba-NLP/gte-Qwen2-1.5B-instruct` — 1,776,197,120 params · dim 1536 · context 32768 (`sentence_bert_config`; raw `max_position_embeddings` 131072) · Apache-2.0 · 2024-06-29. / https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct / primary.
- `Alibaba-NLP/gte-Qwen2-7B-instruct` — 7,612,620,288 params · dim 3584 · context 32768 · Apache-2.0 · 2024-06-15. / https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct / primary.
- `Alibaba-NLP/gte-multilingual-base` — 305,369,089 params · dim 768 · context 8192 (NTK RoPE factor 8) · Apache-2.0 · 2024-07-20. / https://huggingface.co/Alibaba-NLP/gte-multilingual-base / primary.
- `Alibaba-NLP/gte-modernbert-base` — 149,014,272 params · dim 768 · context 8192 · Apache-2.0 · created 2025-01-20 · MTEB-en 64.38, BEIR 55.33, LoCo 87.57, CoIR 79.31. / https://huggingface.co/Alibaba-NLP/gte-modernbert-base/raw/main/README.md / primary.
- `Qwen/Qwen3-Embedding-0.6B` — 595,776,512 params · dim 1024 (MRL 32–1024) · context 32K · Apache-2.0 · created 2025-06-03 · MTEB(Eng v2) Mean(Task) **70.70**, MTEB(Multilingual) **64.33**. / https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/raw/main/README.md / primary.
- `Qwen/Qwen3-Embedding-4B` — 4,021,774,336 params · dim 2560 · context 32K · Apache-2.0 · MTEB(Eng v2) **74.60**, MTEB(Multi) **69.45**. / https://huggingface.co/Qwen/Qwen3-Embedding-4B / primary.
- `Qwen/Qwen3-Embedding-8B` — 7,567,295,488 params · dim 4096 · context 32K · Apache-2.0 · MTEB(Multi) **70.58** (No.1 MTEB multilingual on 2025-06-05), MTEB(Eng v2) **75.22**. / https://huggingface.co/Qwen/Qwen3-Embedding-8B / primary.
- **No Qwen4-Embedding text model.** Only 2026 Qwen embedding release is multimodal: `Qwen/Qwen3-VL-Embedding-2B` (2,127,532,032 params, Apache-2.0, created 2026-01-07) and -8B. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-2B + https://huggingface.co/collections/Qwen/qwen3-embedding / primary.
- Alibaba-NLP 2026 releases are **not** GTE successors: `core-emb-2b/8b` (multimodal MLLM, CC-BY-4.0, 2026-08-30), `UEmbed-2B/4B/9B` (CC-BY-4.0, 2026-07-29), `LaSER-Qwen3-0.6B/4B/8B` (MIT, 2026-03-31). No `gte-Qwen3`. / https://huggingface.co/api/models?author=Alibaba-NLP&sort=createdAt / primary.

**Family 3 — E5 (intfloat)**
- `intfloat/e5-large-v2` — 335,142,400 params · dim 1024 · context 512 · MIT · 2023-05-19. / https://huggingface.co/intfloat/e5-large-v2 / primary.
- `intfloat/e5-base-v2` — 109,482,752 params · dim 768 · context 512 · MIT. / https://huggingface.co/intfloat/e5-base-v2 / primary.
- `intfloat/e5-small-v2` — 33,360,512 params · dim 384 · context 512 · MIT. / https://huggingface.co/intfloat/e5-small-v2 / primary.
- `intfloat/multilingual-e5-large` — 559,890,946 params · dim 1024 · context 512 · MIT · 2023-06-30. / https://huggingface.co/intfloat/multilingual-e5-large / primary.
- `intfloat/multilingual-e5-large-instruct` — 559,890,432 params · dim 1024 · context 512 · MIT · 2024-02-08. / https://huggingface.co/intfloat/multilingual-e5-large-instruct / primary.
- `intfloat/e5-mistral-7b-instruct` — 7,110,660,096 params · dim 4096 · context 32768 · MIT · 2023-12-20. / https://huggingface.co/intfloat/e5-mistral-7b-instruct / primary.
- **No newer intfloat text-embedding release** than e5-mistral-7b-instruct; newest artifact is `mmE5-mllama-11b-instruct` (multimodal, 2025-02-13). / https://huggingface.co/api/models?author=intfloat&sort=createdAt / primary.

**Family 4 — Nomic**
- `nomic-ai/nomic-embed-text-v1.5` — 136,731,648 params · dim 768 (MRL to 64) · context 8192 (`n_positions`) · Apache-2.0 · 2024-02-10 · requires task prefixes `search_query:` / `search_document:`. / https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/raw/main/README.md / primary.
- `nomic-ai/nomic-embed-text-v2-moe` — 475,292,928 total / **305M active** (8 experts, top-2) · dim 768 (MRL to 256) · context **512** · Apache-2.0 · 2025-02-07 · BEIR 52.86, MIRACL 65.80. / https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe/raw/main/README.md / primary.
- **No nomic-embed-text-v3.** Post-v2 releases are `nomic-embed-code` (2025-03-24) and `nomic-embed-multimodal-3b/-7b` (2025-03-27/29). / HF API org listing + https://home.nomic.ai/embed / primary.

**Family 5 — Jina**
- `jinaai/jina-embeddings-v2-base-en` — 137,368,320 params · dim 768 · context 8192 · Apache-2.0 · 2023-09-27. / https://huggingface.co/jinaai/jina-embeddings-v2-base-en/raw/main/README.md / primary.
- `jinaai/jina-embeddings-v3` — 572,310,396 params · dim 1024 (MRL to 32) · context 8192 · **CC-BY-NC-4.0** · 2024-09-05 · 5 task LoRA adapters. / https://huggingface.co/jinaai/jina-embeddings-v3/raw/main/README.md / primary.
- `jinaai/jina-embeddings-v4` — 3,754,885,248 params (Qwen2.5-VL-3B backbone) · dim 2048 (MRL to 128) · context 32768 · **Qwen Research License** (research/non-commercial; card states the earlier CC-BY-NC-4.0 release was "an error") · 2025-05-07 · multimodal. / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/README.md / primary.
- `jinaai/jina-embeddings-v5-text-small` — 677M stated (HF `safetensors.total` 596,049,920) · dim 1024 (MRL 32–1024) · context **32768** · **CC-BY-NC-4.0** · released **2026-02-18** (HF `createdAt` 2026-01-22) · MTEB English v2 **71.7**, MMTEB **67.7** · base Qwen3-0.6B-Base. / https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md / primary.
- `jinaai/jina-embeddings-v5-text-nano` — 239M stated (HF 211,766,016) · dim 768 (MRL 32–768) · context **8192** (spec table; prose says "up to 32K") · CC-BY-NC-4.0 · 2026-02-18 · MTEB English v2 **71.0**, MMTEB **65.5** · base EuroBERT-210m. / https://huggingface.co/jinaai/jina-embeddings-v5-text-nano/raw/main/README.md / primary.
- `jinaai/jina-embeddings-v5-omni-small / -nano` — multimodal (text/image/video/audio); small ≈1.74B, 1024 dim, 32768 context, CC-BY-NC-4.0, announced 2026-05-11 (HF `createdAt` 2026-04-01). Text encoder shares the v5-text embedding space. / https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/README.md + https://jina.ai/news/jina-embeddings-v5-omni-multimodal-embeddings-for-text-image-audio-and-video/ / primary.
- Jina v5 text models served through Jina Embeddings API and Elastic Inference Service; API accepts image inputs on omni models. / https://jina.ai/embeddings/ / primary.

**Family 6 — Stella (dunzhang → NovaSearch)**
- `NovaSearch/stella_en_1.5B_v5` (dunzhang redirects here) — 1,543,268,864 params · MRL dims 512/768/1024/2048/4096/6144/8192, default **1024** · trained/recommended at **512** tokens · MIT · 2024-07-12. / https://huggingface.co/NovaSearch/stella_en_1.5B_v5/raw/main/README.md / primary.
- `NovaSearch/stella_en_400M_v5` — 435,188,736 params · default dim 1024, MRL 512–8192 · MIT · 2024-07-12. / https://huggingface.co/NovaSearch/stella_en_400M_v5/raw/main/README.md / primary.
- No stella v6 or newer; NovaSearch newest non-Stella release is `jasper_en_vision_language_v1` (2024-12-11). / https://huggingface.co/api/models?author=NovaSearch&sort=createdAt / primary.

**Family 7 — Snowflake Arctic Embed**
- `snowflake-arctic-embed-xs / -s / -m / -l` — 22M/33M/110M/335M params · dim 384/384/768/1024 · context 512 · Apache-2.0 · 2024-04-16 · MTEB Retrieval NDCG@10: 50.15 / 51.98 / 54.90 / 55.98. / https://raw.githubusercontent.com/Snowflake-Labs/arctic-embed/main/README.md / primary.
- `snowflake-arctic-embed-m-long` — 137M params · dim 768 · context 2048 (8192 with RPE) · Apache-2.0 · 2024-04-12. / arctic-embed README / primary.
- `snowflake-arctic-embed-m-v1.5` — 108,891,648 params · dim 768 (MRL 256) · context 512 · Apache-2.0 · 2024-07-03 · MTEB Retrieval 55.14. / https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v1.5 + README / primary.
- `snowflake-arctic-embed-l-v2.0` — 568M total / **303M non-embedding** params · dim 1024 (MRL 256) · context 8192 · Apache-2.0 · 2024-12-04 · BEIR(15) 55.6, MIRACL(4) 55.8, CLEF-Full 54.3. / https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0/raw/main/README.md / primary.
- `snowflake-arctic-embed-m-v2.0` — 305,368,320 params · dim 768 · context 8192 · Apache-2.0 · 2024-11-08. / https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0 / primary.
- **No arctic-embed-3.** README newest news 12/18/2024; v2.0 (Dec 2024) is latest. / arctic-embed README / primary.

**Family 8 — Mixedbread (mxbai)**
- `mixedbread-ai/mxbai-embed-large-v1` — 335,141,888 params · dim 1024 (MRL to 512/256/128 + binary quant) · context 512 · Apache-2.0 · 2024-03-07 · MTEB avg (56 datasets) **64.68**, retrieval 54.39. / https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1/raw/main/README.md / primary.
- `mixedbread-ai/mxbai-embed-2d-large-v1` — 335,141,888 params · dim 1024, 2D-shrinkable to 768 with no retraining · context 512 · Apache-2.0 · 2024-03-04 · MTEB avg 63.25. / https://huggingface.co/mixedbread-ai/mxbai-embed-2d-large-v1/raw/main/README.md / primary.
- `mixedbread-ai/mxbai-embed-xsmall-v1` — 24,089,472 params · dim 384 · context 4096 · Apache-2.0 · 2024-09-13. / https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1 / primary.
- `mixedbread-ai/mxbai-edge-colbert-v0-32m / -17m` — 32M/17M params ColBERT late-interaction, dim 64/token, up to 32000 tokens, Apache-2.0, created 2025-10-13. / https://huggingface.co/mixedbread-ai/mxbai-edge-colbert-v0-32m/raw/main/README.md / primary.
- **No new mxbai dense embedder in 2025–2026.** / https://huggingface.co/mixedbread-ai/models?sort=created / primary.

**Family 9 — EmbeddingGemma (Google)**
- `google/embeddinggemma-300m` — 308M stated (HF `safetensors.total` 302,863,104) · dim 768 (MRL 128/256/512/768) · context **2048** · `gemma` licence (gated) · HF created 2025-07-17, announced **2025-09-04** · **text-only** (Gemma3 text backbone, bidirectional attention); MRL truncation to 256 near-lossless. / https://huggingface.co/blog/embeddinggemma + https://huggingface.co/google/embeddinggemma-300m / primary.
- `google/embeddinggemma-2` — 740M total, of which **270M text backbone** (130M transformer + 140M embedder), 170M vision, 300M audio · dim 768 (MRL 128/256/512) · context **8192** · **Apache-2.0** · HF created 2026-09-14, announced **2026-10-06** · multimodal (text/code/image/video/audio); text-only load = 270M via `config_kwargs={"vision_config": None, "audio_config": None}` · MTEB(Multilingual v2) 61.36, MTEB(Eng v2) 68.46, MTEB(Code v1) 78.68 at 768d; at 128d 57.89/65.68/71.41. / https://huggingface.co/google/embeddinggemma-2/raw/main/README.md + https://ai.google.dev/gemma/docs/embeddinggemma / primary.
- EmbeddingGemma 2 must **not** run in float16 (activations exceed fp16 range; use bfloat16 or float32 — card recommends float32 on most CPUs). / https://huggingface.co/google/embeddinggemma-2/raw/main/README.md / primary.
- EmbeddingGemma (v1) arXiv preprint 2509.20354, submitted 2025-09-24. / https://arxiv.org/abs/2509.20354 / primary.

**Family 10 — IBM Granite Embedding**
- `ibm-granite/granite-embedding-english-r2` — 149,014,272 params · dim 768 · context 8192 · Apache-2.0 · released **2025-08-15** · MTEB-v2 **62.8**, BEIR 53.1, CoIR 55.3, MLDR(En) 40.7, MTRAG 56.7 · ModernBERT-based. / https://huggingface.co/ibm-granite/granite-embedding-english-r2/raw/main/README.md / primary.
- `ibm-granite/granite-embedding-small-english-r2` — 47,662,464 params · dim 384 · context 8192 · Apache-2.0 · 2025-08-15 · MTEB-v2 61.1, BEIR 50.9. / https://huggingface.co/ibm-granite/granite-embedding-small-english-r2 / primary.
- `granite-embedding-125m-english` — 125M · dim 768 · context 512 · Apache-2.0 · 2024-12-04. `granite-embedding-30m-english` — 30M · dim 384 · context 512. `granite-embedding-278m-multilingual` — 278,043,648 params · dim 768 · context 512 · 2024-12-04. `granite-embedding-107m-multilingual` — 106,994,304 params · dim 384 · context 512. / https://huggingface.co/ibm-granite/granite-embedding-278m-multilingual + r2 cards / primary.
- `ibm-granite/granite-embedding-311m-multilingual-r2` — 311M params · dim 768 (MRL 512/384/256/128) · context **32768** · Apache-2.0 · released **2026-04-29** · Multilingual MTEB Retrieval (18 tasks) **65.2** (+13 vs 278m-multilingual's 52.2) · 200+ languages, explicit training for 52 languages + code. / https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2/raw/main/README.md / primary.
- `ibm-granite/granite-embedding-97m-multilingual-r2` — 97M params · dim 384 · context 32768 · Apache-2.0 · 2026-04-20. / https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2 / primary.

**Family 11 — KaLM Embedding**
- `KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5` — 494,032,768 params (0.5B, Qwen2.5-0.5B base) · dim 896 (MRL 896/512/256/128/64) · max input 32k (card) / `sentence_bert_config` 32768 · Apache-2.0 · created 2025-09-29 · mean pooling, bidirectional attention. / https://huggingface.co/KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5/raw/main/README.md / primary.
- Earlier members v1/v1.5/v2 (under HIT-TMG). 12B sibling: `tencent/KaLM-Embedding-Gemma3-12B-2511` — 11,766,034,176 params · `other` licence · created 2025-11-04. / same card / primary.
- KaLM-Embedding v2 paper: ICLR 2026 (OpenReview Y7qzhvWhcz), arXiv 2506.20923. / same card / primary.

**Family 12 — LFM2 / LFM2.5 (Liquid AI)**
- `LiquidAI/LFM2.5-Embedding-350M` — ~354M params (17 layers: 10 conv + 6 attn + 1 pool) · dim **1024** CLS · document length **512 tokens** · **LFM Open License v1.0** (`other`) · HF created 2026-05-05, blog 2026-06-18 · 11 languages · asymmetric prompts `query: ` / `document: ` · NanoBEIR-Multilingual-Extended NDCG@10 avg **0.577**, MKQA-11 Recall@20 **0.691**, beating Qwen3-Embedding-0.6B (0.556 / 0.638). / https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M/raw/main/README.md + https://www.liquid.ai/blog/lfm2-5-retrievers / primary.
- `LiquidAI/LFM2.5-ColBERT-350M` — ~353M params · 128-dim per-token (MaxSim) · 512 tokens · LFM Open License v1.0 · 2026-06-16 · NanoBEIR-Multi avg 0.605. / LFM2.5 card / primary.
- `LiquidAI/LFM2-ColBERT-350M` — 353,322,752 params · `other` licence · created 2025-10-28. `LiquidAI/LFM2-350M-Embedding` returns HTTP 401; shipping dense retriever is LFM2.5-Embedding-350M. / https://huggingface.co/api/models?author=LiquidAI&sort=createdAt / primary.
- LFM2.5-Embedding-350M GGUF exists (`...-GGUF`, 2026-06-16); card publishes llama.cpp CPU latency on M4 Max: query embedding p50 **7.3 ms** / p95 9.6 ms (docs cached). / LFM2.5 card / primary.

**Family 13 — Voyage open weights**
- `voyageai/voyage-4-nano` — 180M non-embedding + 160M embedding (≈340M total) · dim **2048** default (MRL 2048/1024/512/256) · context **32000** · **Apache-2.0** · HF created 2026-01-06, blog 2026-01-15 · Qwen3-derived bidirectional architecture; shared embedding space with API-only voyage-4 / -large / -lite · float32/int8/uint8/binary outputs (quantization-aware training). / https://huggingface.co/voyageai/voyage-4-nano/raw/main/README.md + https://blog.voyageai.com/2026/01/15/voyage-4/ / primary.
- Voyage's **first open-weight** model; voyage-3, -3-large, -3.5, -code-3, -4, -4-large, -4-lite, -code-4 remain API-only. / https://docs.voyageai.com/docs/embeddings / primary.

**Family 14 — SFR-Embedding (Salesforce)**
- `Salesforce/SFR-Embedding-Mistral` — 7,110,660,096 params · dim 4096 · context 32768 · **CC-BY-NC-4.0** · 2024-01-24. / https://huggingface.co/Salesforce/SFR-Embedding-Mistral / primary.
- `Salesforce/SFR-Embedding-2_R` — 7,110,660,096 params · dim 4096 · `sentence_bert_config` max_seq_length 4096 (raw `max_position_embeddings` 32768) · CC-BY-NC-4.0 · 2024-06-14. / https://huggingface.co/Salesforce/SFR-Embedding-2_R / primary.
- `Salesforce/SFR-Embedding-Code-400M_R` — 434,139,136 params · dim 1024 · context 8192 · CC-BY-NC-4.0 · 2025-01-16 · CoIR avg NDCG@10 61.9. `SFR-Embedding-Code-2B_R` — 2,614,341,888 params · CC-BY-NC-4.0 · 2025-01-17 · CoIR 67.4. / https://huggingface.co/Salesforce/SFR-Embedding-Code-400M_R/raw/main/README.md / primary.
- All SFR releases "for research purposes only". / https://huggingface.co/Salesforce/SFR-Embedding-2_R/raw/main/README.md / primary.

**Family 15 — Cohere "open"**
- **Cohere embed models are NOT open-weights.** HF repo `CohereLabs/Cohere-embed-multilingual-v3.0` contains only tokenizer/config files — no weights. Embed v3/v4/v5 are API/private-deployment only. / https://huggingface.co/api/models/CohereLabs/Cohere-embed-multilingual-v3.0/tree/main + https://cohere.com/models-overview / primary.

### A1 · API-only models (for completeness, NOT recommendations)

- **Voyage:** `voyage-4-large`, `-4`, `-4-lite`, `voyage-code-4` — 32,000-token context, dims 1024 default (256/512/2048 supported), released 2026-01-15 (`voyage-code-4` 2026-08-06). `voyage-3-large` (2025-01-07), `voyage-3.5` (2025-05-20), `voyage-3.5-lite`, `voyage-code-3` (2024-12-04), `voyage-finance-2` (32k, 1024), `voyage-law-2` (16k, 1024). **No parameter counts published.** Commercial API terms; `voyage-4-large` uses MoE (size unpublished). / https://docs.voyageai.com/docs/embeddings + https://blog.voyageai.com/2026/01/15/voyage-4/ / primary.
- **Cohere:** `embed-v4.0` — 2025-04-15, 128k context, dims 256/512/1024/1536 (default 1536), text+image. `embed-v5.0-pro` / `embed-v5.0-fast` — **2026-09-30**, 128k context, dims 256/512/768/1024/1536/2048 (default 2048), multimodal, shared embedding space. `embed-english-v3.0` / `embed-multilingual-v3.0` — 512 context, dim 1024; `*-light-v3.0` — dim 384. **No parameter counts.** Proprietary; v3.0+ on AWS SageMaker / Azure / Model Vault. / https://docs.cohere.com/docs/cohere-embed + https://docs.cohere.com/changelog/embed-v5 / primary.
- **OpenAI:** `text-embedding-3-small` — dim 1536 (reducible), max input 8192, MTEB 62.3%. `text-embedding-3-large` — dim 3072 (reducible), max input 8192, MTEB 64.6%. `text-embedding-ada-002` — dim 1536, max input 8192, MTEB 61.0%. Released 2024-01-25. **No parameter counts.** No text-embedding-4. / https://developers.openai.com/api/docs/guides/embeddings + https://developers.openai.com/api/docs/models/text-embedding-3-large / primary.
- **Google Gemini:** `gemini-embedding-001` — input limit **2048**, output dims 128–3072 (rec. 768/1536/3072), text-only, GA 2025-07-14. `gemini-embedding-2` — input limit **8192**, output dims 128–3072, multimodal (text/image/video/audio/PDF), preview 2026-03-10, GA 2026-04-22. Both MRL. **No parameter counts.** / https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001 + https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2 / primary.
- **Jina API:** same v5-text-small/nano and v5-omni weights served via `api.jina.ai/v1/embeddings`; API accepts image inputs on omni models. / https://jina.ai/embeddings/ / primary.

### A6 · Multimodal models — text-encoder isolation

**EmbeddingGemma-300m (google/embeddinggemma-300m)**
- **Not multimodal.** Pure text embedding model from the Gemma 3 language architecture. No vision tower, no audio tower, no multimodal inputs. The name refers to the Gemma family. / https://arxiv.org/abs/2509.20354 / primary.
- Architecture: 24-layer bidirectional transformer encoder, d_model=768, mean pooling, two dense projection layers (768→3072→768). Output 768-dim, MRL-truncatable to 512/256/128. / https://arxiv.org/abs/2509.20354 / primary.
- Parameters: 302,863,104 (F32, HF safetensors metadata). Paper/blog round to 308M. / https://huggingface.co/api/models/google/embeddinggemma-300m?full=true / primary.
- Size: ~1.2 GB F32 (302.9M × 4 B); ~600 MB bf16; ~150 MB int4. / computed from param count / primary (param count) + computed size.
- MTEB (paper Table 1, snapshot 2025-09-23): MTEB (Multilingual v2) Mean(Task)=61.15, Mean(Type)=54.31; MTEB (English v2) Mean(Task)=69.67, Mean(Type)=65.11; MTEB (Code) Mean(Task)=68.76. / https://arxiv.org/abs/2509.20354 / primary.
- Quantization: int4 per-block, int8 per-block, mixed-precision per-channel checkpoints published. Quality drop ≤0.5 points at int4. / https://arxiv.org/abs/2509.20354 / primary.
- CPU feasibility: 308M params, 2K context, <200 MB RAM quantized (HF blog). ONNX and TEI supported. / https://huggingface.co/blog/embeddinggemma / primary.

**jina-embeddings-v4 (jinaai/jina-embeddings-v4)**
- Multimodal. 3.8B params + 60M per LoRA adapter (3 adapters: retrieval, text-matching, code). Base: Qwen2.5-VL-3B-Instruct. / https://arxiv.org/abs/2506.18902 / primary.
- **Text encoder separable.** Text path uses the Qwen2.5-VL language backbone (36 layers, hidden_size=2048, 16 attn heads, 2 KV heads); vision tower (depth=32, hidden_size=1280, patch_size=14) is separate and can be omitted for text-only. / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/config.json / primary.
- **Text-only params estimate:** ~3.0B (text LLM) + ~0.5B vision ≈ 3.5B total; text-only ≈ **3.0B** (computed from config: text 36 layers/hidden 2048/intermediate 11008/vocab 151936; vision depth 32/hidden 1280). Label: computed-from-primary-config. / same config / primary.
- Text-only size estimate: ~6.0 GB bf16 (3.0B × 2); ~3.0 GB int8; ~1.5 GB int4. Label: computed-from-primary-config. / same config / primary.
- MTEB (paper Table 3, snapshot 2025-07-07): MTEB (English v2) Retrieval **55.97** nDCG@10; MMTEB (Multilingual v2) Retrieval **66.49** nDCG@10; LongEmbed **67.11** nDCG@10; MTEB (English v2) STS **85.89** Spearman; MMTEB (Multilingual v2) STS **72.70** Spearman; CoIR Code Retrieval **71.59** nDCG@10. / https://arxiv.org/abs/2506.18902 / primary.
- CPU feasibility: 3.8B total / ~3.0B text-only → ~7.6 GB / ~6.0 GB bf16. Too large for comfortable CPU inference on 15 GB RAM with other processes. Community GGUF exists. / https://huggingface.co/jinaai/jina-embeddings-v4 / primary.

**Qwen3-VL-Embedding (Qwen/Qwen3-VL-Embedding-2B, -8B)**
- Multimodal. Built on Qwen3-VL-8B-Instruct; accepts text, images, screenshots, video. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / primary.
- **Text encoder separable:** `language_model` component separable from `visual` (vision tower); vision tower can be omitted for text-only. / https://github.com/QwenLM/Qwen3-VL-Embedding/blob/main/src/models/qwen3_vl_embedding.py / primary.
- Parameters: 2B (28 layers, 2048 dim) and 8B (36 layers, 4096 dim). Totals; no official text-only/vision split published. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / primary.
- Text-only params estimate: 8B total ≈ 8B; vision tower ~0.5–0.7B (ViT-L/14-class) → text-only ≈ **7.3–7.5B**. Label: computed-from-primary-config (estimate). / same card / primary.
- MMTEB (model card, snapshot 2026-10-07): 2B Mean(Task)=63.87, Mean(Type)=55.84; 8B Mean(Task)=67.88, Mean(Type)=58.88. / same card / primary.
- MMEB-V2 (multimodal): 2B 73.4; 8B 77.9. / same card / primary.
- vs text-only Qwen3-Embedding: Qwen3-Embedding-8B 70.58 Mean(Task) MMTEB vs Qwen3-VL-Embedding-8B 67.88 → text-only variant +~2.7 points. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / primary.
- CPU feasibility: 2B ~4 GB bf16 / ~2 GB int8 / ~1 GB int4 (borderline feasible); 8B ~16 GB bf16 (too large for 15 GB RAM). / same card / primary.

**GME (Alibaba-NLP/gme-Qwen2-VL-2B-Instruct, -7B)**
- Multimodal. Built on Qwen2-VL; accepts text, images, text+image pairs. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / primary.
- **Text encoder separable:** Qwen2-VL has separate `language_model` and `visual` components; text-only inference can omit the vision tower. / same card / primary.
- Parameters: 2B and 7B total; no official text-only split. / same card / primary.
- MTEB (model card, snapshot 2026-10-07): GME-2B English 65.27, Chinese 66.92; GME-7B English 67.48, Chinese 69.73. / same card / primary.
- Embedding dim: 2B=1536, 7B=3584. / same card / primary.
- CPU feasibility: 2B ~4 GB bf16; 7B ~14 GB bf16 (borderline on 15 GB). / same card / primary.

**BGE-VL (BAAI/BGE-VL-base, -large)**
- Multimodal (CLIP-based). base uses CLIP ViT-B/16 for both text and image; large uses CLIP ViT-L/14. / https://huggingface.co/BAAI/BGE-VL-base / primary.
- Text encoder: CLIP text tower. base = 12-layer, 512-wide, 8 heads; large = 12-layer, 768-wide, 12 heads. / same card / primary.
- Parameters: base total ~149M; large total ~428M. Text-only portion: ~50–60M base (CLIP-B/16 text tower), ~120–150M large (CLIP-L/14 text tower). Label: computed-from-primary-config. / same card / primary.
- Embedding dim: base=512, large=768. / same card / primary.
- **MTEB: not published.** BGE-VL evaluated on multimodal benchmarks (CIRCO, MMEB), not text-only MTEB. / same card / primary.
- CPU feasibility: base ~600 MB F32, large ~1.7 GB F32. Excellent. / same card / primary.
- Note: CLIP text towers are weak text retrievers vs dedicated text embedders of similar size. / same card / primary.

**VLM2Vec (TIGER-Lab/VLM2Vec)**
- Training framework, not a fixed model. Converts VLMs (Phi-3.5, Llama-3.2) into multimodal embedders; param count depends on backbone. / https://arxiv.org/abs/2410.05160 / primary.
- Text encoder inherits the VLM's LM backbone; separable in principle. / https://arxiv.org/abs/2410.05160 / primary.
- VLM2Vec-V2 on MMEB-V2: 59.2 (2B variant). Not directly comparable to text-only MTEB. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / primary.

**LLaVE (XMUDeepLIT/LLaVE)**
- Multimodal. Variants LLaVE-0.5B, -2B, -7B; LLaVA-OneVision and Aquila-VL backbones. / https://github.com/XMUDeepLIT/LLaVE / primary.
- Text encoder: LM backbone shared with the multimodal model; no published text-only param split. / same repo / primary.
- MTEB: not published. / same repo / primary.

**voyage-multimodal-3 (API only)**
- No open weights. 1024-dim, 32K context. Unified transformer encoder for text and visual; no separate text encoder disclosed. Parameters not disclosed. / https://blog.voyageai.com/2024/11/12/voyage-multimodal-3/ / primary.
- Listed on MTEB leaderboard; scores not verified in this angle. / https://leaderboard.mteb.org/models/voyageai/voyage-multimodal-3 / primary.

**Cohere embed-v4.0 (API only)**
- No open weights. 1024/1536 dim, 128K context. Text encoder and parameters not disclosed. / https://docs.cohere.com/v2/docs/cohere-embed / primary.

**NeoMME (H Company, 2026)**
- Multimodal. 260M and 800M single-tower bidirectional multimodal encoders, Apache 2.0. / https://arxiv.org/abs/2609.01657 / primary.
- **Not separable** — text and images share the same single-tower encoder. Parameters are totals. / same / primary.
- MTEB: not yet published at research time. / same / primary.
- CPU feasibility: 260M ~1 GB F32 / ~500 MB bf16; 800M ~3.2 GB F32 / ~1.6 GB bf16. Excellent. / same / primary.

**BidirLM-Omni-2.5B (2026)**
- Multimodal. Text + images + audio; turns a causal LM into a bidirectional encoder. / https://huggingface.co/blog/Nicolas-BZRD/bidirlm-release / **secondary (community HF blog, not first-party)**.
- Text encoder is the base; audio and vision towers additive. 2.5B total; text-only portion not separately published. / same / secondary.
- MTEB: not yet published at research time. / same / secondary.

## Searches

**Angle 1 (F1):**
- HF API metadata + config sweep (all families): `https://huggingface.co/api/models/{id}?full=true`, `https://huggingface.co/{id}/raw/main/config.json`, `.../sentence_bert_config.json` — params, dim, context, licence, `createdAt`. 2026-10-07.
- HF API org listings by `createdAt` for: BAAI, Alibaba-NLP, intfloat, nomic-ai, jinaai, mixedbread-ai, Snowflake, NovaSearch, LiquidAI, voyageai, CohereLabs, ibm-granite, KaLM-Embedding, Qwen, google, Salesforce, tencent. 2026-10-07.
- HF API existence probes: `?search=bge-m4`, `?search=bge-m5`, `?search=nomic-embed-text-v3`, `?search=arctic-embed-3` — all empty or unrelated. 2026-10-07.
- Model cards read raw: bge-m3, bge-en-icl, bge-multilingual-gemma2, bge-reasoner-embed, gte-large-en-v1.5, gte-modernbert-base, Qwen3-Embedding-0.6B, e5-large-v2, nomic-embed-text-v1.5, nomic-embed-text-v2-moe, jina-embeddings-v2/v3/v4/v5-text-small/v5-text-nano/v5-omni-small, stella_en_1.5B_v5, stella_en_400M_v5, snowflake-arctic-embed-l-v2.0, mxbai-embed-large-v1, mxbai-embed-2d-large-v1, mxbai-edge-colbert-v0-32m, granite-embedding-english-r2, granite-embedding-311m-multilingual-r2, KaLM-embedding-mini-instruct-v2.5, LFM2.5-Embedding-350M, voyage-4-nano, SFR-Embedding-Mistral, SFR-Embedding-2_R, SFR-Embedding-Code-400M_R, google/embeddinggemma-2. 2026-10-07.
- GitHub READMEs: FlagOpen/FlagEmbedding (master), QwenLM/Qwen3-Embedding (main), Snowflake-Labs/arctic-embed (main). 2026-10-07.
- Official docs: docs.cohere.com/docs/cohere-embed, docs.cohere.com/changelog/embed-v5, docs.voyageai.com/docs/embeddings, developers.openai.com/api/docs/guides/embeddings, developers.openai.com/api/docs/models/text-embedding-3-large, ai.google.dev/gemini-api/docs/embeddings, ai.google.dev/gemini-api/docs/models/gemini-embedding-001, ai.google.dev/gemini-api/docs/models/gemini-embedding-2, ai.google.dev/gemma/docs/embeddinggemma, jina.ai/embeddings. 2026-10-07.
- Web discovery (Tavily-backed) for release dates and successor existence: BGE-M4/M5, Qwen4-Embedding, nomic v3, jina v5, arctic-embed-3, EmbeddingGemma 2, Cohere Embed 5, Gemini Embedding 2, OpenAI text-embedding-4, mxbai 2026, gte 2026. 2026-10-07.
- arXiv: 2509.20354 (EmbeddingGemma), 2602.15547 (jina v5 text), 2605.08384 (jina v5 omni), 2412.04506 (Arctic-Embed 2.0), 2506.05176 (Qwen3 Embedding), 2609.04083 (Core-Embed). 2026-10-07.

**Angle 6 (F6):**
1. "EmbeddingGemma 300M text encoder parameters MTEB benchmark" — web_search, 2026-10-07.
2. "jina-embeddings-v4 multimodal text encoder parameters benchmark" — web_search, 2026-10-07.
3. "voyage-multimodal-3 embedding model text encoder parameters" — web_search, 2026-10-07.
4. "Cohere embed-v4.0 multimodal text embedding parameters" — web_search, 2026-10-07.
5. "Qwen3-VL-Embedding model text encoder parameters benchmark" — web_search, 2026-10-07.
6. "BGE-VL VLM2Vec multimodal embedding model text encoder parameters" — web_search, 2026-10-07.
7. "GME gme-Qwen2-VL Alibaba multimodal embedding text encoder" — web_search, 2026-10-07.
8. "LLaVE multimodal embedding model text encoder parameters" — web_search, 2026-10-07.
9. "multimodal embedding model 2025 2026 text encoder open weights release" — web_search, 2026-10-07.
10. "jina-embeddings-v4 text-only benchmark MTEB retrieval score" — web_search, 2026-10-07.
11. "Qwen3-VL-Embedding text encoder parameters vision tower separable" — web_search, 2026-10-07.
12-16. HF API metadata: google/embeddinggemma-300m?full=true, jinaai/jina-embeddings-v4, Qwen/Qwen3-VL-Embedding-8B, BAAI/BGE-VL-base, Alibaba-NLP/gme-Qwen2-VL-2B-Instruct — 2026-10-07.
17. arXiv:2509.20354 (EmbeddingGemma) — 2026-10-07.
18. arXiv:2506.18902 (jina-embeddings-v4) — 2026-10-07.
19. HF blog: embeddinggemma — 2026-10-07.
20. config.json: jinaai/jina-embeddings-v4 — 2026-10-07.

## Conflicting evidence

**Cluster-internal (F1 vs F6, and within F1):**

1. **EmbeddingGemma 300m is text-only, NOT multimodal** — the brief (angle 6) assumed a vision tower to strip. Both workers independently agree there is none: F6 states it explicitly ("pure text model… no vision tower"), F1 states "text-only (Gemma3 text backbone, bidirectional attention)". **Winner: the first-party EmbeddingGemma paper (arXiv 2509.20354) and the Gemma docs** — the brief's premise is wrong, not the models. Angle 6's "text-only params" question is moot for v1.
2. **EmbeddingGemma 2 (2026-10-06) IS multimodal with a separable text encoder** — F6 does not cover it at all (it treated "EmbeddingGemma" as v1 only), while F1 found the card-stated split: 740M total = 270M text (130M transformer + 140M embedder) + 170M vision + 300M audio, Apache-2.0, 8192 context. **Winner: F1 / the first-party `google/embeddinggemma-2` model card** (primary, card-stated split). This is the one genuinely multimodal Gemma embedder and is the real answer to angle 6's premise; F6's coverage is stale/incomplete here.
3. **jina-embeddings-v4 total params** — F6 says "3.8B" (paper prose), F1 says 3,754,885,248 (HF `safetensors.total`). **Winner: F1's exact safetensors figure (3.75B)** for total; F6's ~3.0B text-only estimate stands, both agree on the ~0.5B vision tower.
4. **Qwen3-VL-Embedding-2B params** — F6 says "2B (28 layers, 2048 dim)" without an exact count; F1 gives 2,127,532,032 (HF safetensors). **Winner: F1's exact figure.**
5. **Qwen3-VL vs Qwen3-Embedding MMTEB gap (F6's 2.7-point claim)** — F6 compares Qwen3-VL-Embedding-8B 67.88 (card figure, snapshot 2026-10-07) against Qwen3-Embedding-8B 70.58, but F1 records the text model's 70.58 as "as of June 5, 2025". **The two numbers are not from the same leaderboard snapshot** — the 2.7-point gap is therefore not a clean controlled comparison. Winner: keep both numbers, but the *comparison* is downgraded to speculative-until-same-snapshot (Angle 2's job).
6. **GME 7B scores attributed to the 2B card URL** — F6 cites `Alibaba-NLP/gme-Qwen2-VL-2B-Instruct` as the source for both 2B and 7B MTEB rows. The 7B figures need the `-7B` card to be first-party. Flagged as a citation defect; numbers retained as primary-unverified for the 7B row.
7. **BidirLM-Omni-2.5B labelled "primary" by F6** — its only source is a community HF blog (`Nicolas-BZRD/bidirlm-release`), which is **secondary**, not first-party. Winner: reclassified secondary.
8. **NeoMME / BidirLM-Omni arXiv IDs (2609.01657) and F1's 2026 arXiv IDs (2602.15547, 2605.08384, 2609.04083)** — all consistent with a 2026-10-07 timeline and read by the workers, but this merger could not independently re-verify them (merger does not search). Carried as primary-as-reported, flagged unverified-by-merger.

**Within F1:**

9. **bge-m3 param count** — BAAI card states none, HF `safetensors.total = null` (weights as `pytorch_model.bin`). Snowflake's Arctic-2.0 table and Nomic's v2-moe table independently both say 568M total / 303M non-embedding. **Winner: two independent third parties agreeing → third-party-sourced, not first-party.** No first-party BAAI figure exists.
10. **jina-embeddings-v4 licence** — card says the initial CC-BY-NC-4.0 release was "an error" and the correct licence is the **Qwen Research License**; HF `cardData.license` is `null`. Both non-commercial → practical constraint unchanged. **Winner: the card's stated Qwen Research License** (the card's own correction), noted as ambiguous.
11. **jina-embeddings-v5-text-nano context** — card prose says "up to 32K"; card spec table and `config.json` say 8192. **Winner: the spec table + `config.json` (8192)** — prose appears copied from the v5-text-small paragraph.
12. **jina-embeddings-v5-text-small params** — card says 677M; HF `safetensors.total` 596,049,920. **Winner: report both**; safetensors is the artifact on disk, card figure is the marketing claim.
13. **stella_en_1.5B_v5 identifier** — `dunzhang/...` now HTTP-redirects to `NovaSearch/...`. Not a real conflict; same repo. Reported under NovaSearch.
14. **LFM2-350M-Embedding (brief's name)** — HTTP 401; shipping dense retriever is `LiquidAI/LFM2.5-Embedding-350M`. Brief's name is stale/renamed.
15. **mxbai "2026 release"** — a secondary Reddit post claims "Wholembed v3"; no such model on Mixedbread's HF org → **unverified / likely misattributed**. Winner: no 2026 mxbai dense embedder exists.

## Gaps

- **bge-m3 first-party param count** — never published by BAAI on card or FlagEmbedding README; only third-party tables (568M). Unverified first-party.
- **Exact release dates for most open models** are approximated by HF `createdAt` (repo creation), which precedes/lags the announcement. Announcement dates confirmed first-party only for: jina v5-text (2026-02-18), EmbeddingGemma 1 (2025-09-04) and 2 (2026-10-06), granite english-r2 (2025-08-15), granite multilingual-r2 (2026-04-29), LFM2.5 (2026-06-18), Voyage 4 (2026-01-15), Cohere Embed 4 (2025-04-15) / Embed 5 (2026-09-30), Gemini Embedding 001 GA (2025-07-14) / Embedding 2 (preview 2026-03-10, GA 2026-04-22), OpenAI text-embedding-3 (2024-01-25).
- **Parameter counts for all API-only models** (Voyage, Cohere, OpenAI, Gemini) unpublished; stated as such, never estimated.
- **No published text-only param split** for Qwen3-VL-Embedding, GME, jina-embeddings-v4, LLaVE, BidirLM-Omni. All text-only counts in A6 are computed-from-config or architecture estimates, clearly labelled.
- **No MTEB text-only scores** for BGE-VL, VLM2Vec, LLaVE, NeoMME, BidirLM-Omni — evaluated on multimodal benchmarks (MMEB, CIRCO, ViDoRe) instead.
- **No CPU latency/throughput published for any multimodal embedder** on the target hardware (i5-1135G7). Only CPU figure in the whole cluster: LFM2.5-Embedding-350M llama.cpp query embedding p50 7.3 ms on an **M4 Max** (not the target CPU).
- **voyage-multimodal-3 and Cohere embed-v4.0 are API-only** — no weights, params, or architecture details; cannot be evaluated for local CPU deployment.
- **NeoMME and BidirLM-Omni are very recent (2026)** — no MTEB scores, no community benchmarks, no CPU data.
- **`voyageai/voyage-4`, `-large`, `-lite`, `voyage-code-4` HF repos exist** (created 2026-01-08 / 2026-08-06) with very low download counts, but Voyage docs describe only `voyage-4-nano` as open-weight. Whether these carry usable weights or are config/tokenizer stubs was not verified. `voyage-4-nano` (340k downloads) is the only confirmed open-weight release.
- **Qwen3-Embedding `sentence_bert_config.json` absent** — 4B/8B max seq taken from card table (32K); `config.json` reports `max_position_embeddings: 40960`.
- **BGE-VL / MegaPairs, nomic-embed-code, jina-code-embeddings, mxbai-edge-colbert** (code/multimodal/late-interaction) not enumerated exhaustively for text-retrieval specs.
- **Alibaba-NLP 2026 lines** (core-emb, UEmbed, LaSER-Qwen3, E2Rank, GVE) are multimodal/reranking/research artifacts; whether any is a general text-retrieval successor to GTE was not fully evaluated (very low download counts).
- **No MTEB leaderboard snapshot read directly** in this cluster — all scores are model-card figures with their stated snapshot dates. Cross-model comparison on one snapshot belongs to Angle 2.

## Cluster verdict

Landscape is mature and stable on the open-weights side: no BGE-M4/M5, no Qwen4-Embedding, no Nomic v3, no arctic-embed-3, no OpenAI text-embedding-4 — the serious local CPU candidates are the 2025–2026 mid-size models (Qwen3-Embedding-0.6B, EmbeddingGemma 1/2, granite-*-r2, gte-modernbert, jina v5-text-nano/small, LFM2.5-Embedding-350M, voyage-4-nano). Angle 6's premise mostly collapses: EmbeddingGemma **v1 is pure text** (no tower to strip), and the only truly multimodal Gemma embedder is the 2026-10-06 **EmbeddingGemma 2**, whose text encoder is cleanly separable at **270M of 740M** (card-stated), Apache-2.0, 8192 ctx. Every other multimodal embedder (jina-v4, Qwen3-VL-Embedding, GME, BGE-VL) needs computed-from-config text-only splits and has no text-only MTEB score, so none is a first-class local CPU text retriever on published evidence alone. Cross-model score comparison is unsafe inside this cluster: snapshots differ (2025-06 vs 2026-10) and F6's "multimodal hurts text by 2.7 points" mixes snapshots — Angle 2 must normalise to one MTEB snapshot. Licence trap for a shipped product: jina v3/v4/v5-text, SFR, and jina-v5-omni are all non-commercial (CC-BY-NC-4.0 / Qwen Research / research-only); Apache-2.0 options are BGE, GTE, E5, Nomic, mxbai, Arctic, Granite, KaLM-mini, Voyage-4-nano, EmbeddingGemma 2 (v1 is `gemma` gated licence).
