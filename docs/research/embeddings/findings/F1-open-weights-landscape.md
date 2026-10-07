# F1 — Open-weights landscape: text embedding model families

Fetch date for all rows: **2026-10-07** unless a row states otherwise.

## Angle

Enumerate every serious text-embedding model family, open-weights first, with family, params,
embedding dim, max context, licence, release date, and the primary source that states it.
Then enumerate notable API-only models for completeness (not as recommendations), and verify
version currency as of 2026-10-07 (does BGE-M4/M5, Qwen4-Embedding, Nomic v3, jina-v5,
arctic-embed-3, EmbeddingGemma 2, Cohere Embed 5 exist?).

Param counts are the safetensors tensor total reported by the HF API (`?full=true` →
`safetensors.total`) unless a model card states a different figure; those are flagged.
Context lengths are from `sentence_bert_config.json:max_seq_length` when present, else
`config.json:max_position_embeddings`, else the model card; the source is named per row.

### Version-currency verdict (2026-10-07)

| Expected successor | Verdict | Evidence |
|---|---|---|
| BGE-M4 / BGE-M5 | **Absent / unverified** | HF API search `bge-m4` and `bge-m5` return `[]`; FlagEmbedding README's newest embedding news is 3/6/2025 (BGE-VL). |
| Qwen4-Embedding (text) | **Absent** | QwenLM org has Qwen3-Embedding (0.6B/4B/8B, June 2025) and a *multimodal* Qwen3-VL-Embedding (Jan 2026); no Qwen4 text embedder. |
| Nomic v3 | **Absent** | Nomic's newest text embedder is nomic-embed-text-v2-moe (Feb 2025); later releases are code/multimodal. |
| jina-embeddings-v5 | **Released** | v5-text nano/small Feb 18 2026; v5-omni (multimodal) May 11 2026. |
| arctic-embed-3 | **Absent** | Snowflake-Labs/arctic-embed README newest entry is 12/18/2024; v2.0 (Dec 2024) is latest. |
| EmbeddingGemma 2 | **Released** | 740M multimodal, announced 2026-10-06, HF `google/embeddinggemma-2` created 2026-09-14. |
| Cohere Embed 5 | **Released** | `embed-v5.0-pro` / `embed-v5.0-fast`, announced 2026-09-30. |
| Voyage 4 open weights | **Released** | `voyage-4-nano` on HF, created 2026-01-06, Apache-2.0. |
| Gemini Embedding 2 | **Released** | Preview 2026-03-10, GA 2026-04-22; multimodal, 8,192-token input. |
| OpenAI text-embedding-4 | **Absent** | OpenAI's model catalog still lists text-embedding-3-small/large as latest. |

## Claims

### Family 1 — BGE / BAAI (FlagOpen/FlagEmbedding)

- **BAAI/bge-m3** — params ≈568M total / 303M non-embedding (figure from Snowflake's comparison table, not the BGE card itself; HF `safetensors.total` is `null` for this repo) · dim 1024 · context 8192 · MIT · released 2024-01-27 (HF `createdAt`) · multilingual 100+, dense+sparse+multi-vector. / https://huggingface.co/BAAI/bge-m3/raw/main/README.md and https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0/raw/main/README.md / 2026-10-07 / primary.
- **BAAI/bge-large-en-v1.5** — 335,142,400 params · dim 1024 · context 512 · MIT · 2023-09-12. / https://huggingface.co/BAAI/bge-large-en-v1.5 (config.json + API) / 2026-10-07 / primary.
- **BAAI/bge-base-en-v1.5** — 109,482,752 params · dim 768 · context 512 · MIT · 2023-09-11. / https://huggingface.co/BAAI/bge-base-en-v1.5 (config.json + API) / 2026-10-07 / primary.
- **BAAI/bge-small-en-v1.5** — 33,360,512 params · dim 384 · context 512 · MIT · 2023-09-12. / https://huggingface.co/BAAI/bge-small-en-v1.5 (config.json + API) / 2026-10-07 / primary.
- **BAAI/bge-en-icl** — 7,110,672,384 params (Mistral-7B backbone, dim 4096) · context 32768 · Apache-2.0 · released 2024-07-25 (FlagEmbedding news 7/26/2024). / https://huggingface.co/BAAI/bge-en-icl (config.json + API) and https://raw.githubusercontent.com/FlagOpen/FlagEmbedding/master/README.md / 2026-10-07 / primary.
- **BAAI/bge-multilingual-gemma2** — 9,241,713,152 params (Gemma-2-9B backbone, dim 3584) · context 8192 · `gemma` licence · released 2024-07-25. / https://huggingface.co/BAAI/bge-multilingual-gemma2 (config.json + API) / 2026-10-07 / primary.
- **BAAI/bge-reasoner-embed-qwen3-8b-0923** — 7,568,405,504 params · Apache-2.0 · created 2025-09-22 · reports nDCG@10 **37.1** on BRIGHT with original queries. / https://huggingface.co/BAAI/bge-reasoner-embed-qwen3-8b-0923/raw/main/README.md / 2026-10-07 / primary.
- **No BGE-M4 or BGE-M5 exists** on HF or in the FlagEmbedding changelog as of 2026-10-07. / https://huggingface.co/api/models?search=bge-m4 and https://raw.githubusercontent.com/FlagOpen/FlagEmbedding/master/README.md / 2026-10-07 / primary.
- BGE v1.5 retrieval models require the query prefix `Represent this sentence for searching relevant passages: `; bge-m3 does not. / https://raw.githubusercontent.com/FlagOpen/FlagEmbedding/master/README.md / 2026-10-07 / primary.

### Family 2 — GTE + Qwen3-Embedding (Alibaba-NLP / Qwen)

- **Alibaba-NLP/gte-large-en-v1.5** — 434,139,136 params · dim 1024 · context 8192 (NTK RoPE factor 2) · Apache-2.0 · 2024-04-20. / https://huggingface.co/Alibaba-NLP/gte-large-en-v1.5 (config.json + API) / 2026-10-07 / primary.
- **Alibaba-NLP/gte-base-en-v1.5** — 136,776,192 params · dim 768 · context 8192 · Apache-2.0 · 2024-04-20. / https://huggingface.co/Alibaba-NLP/gte-base-en-v1.5 (config.json + API) / 2026-10-07 / primary.
- **Alibaba-NLP/gte-Qwen2-1.5B-instruct** — 1,776,197,120 params · dim 1536 · context 32768 (`sentence_bert_config`; raw `max_position_embeddings` 131072) · Apache-2.0 · 2024-06-29. / https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct (config.json + API) / 2026-10-07 / primary.
- **Alibaba-NLP/gte-Qwen2-7B-instruct** — 7,612,620,288 params · dim 3584 · context 32768 · Apache-2.0 · 2024-06-15. / https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct (config.json + API) / 2026-10-07 / primary.
- **Alibaba-NLP/gte-multilingual-base** — 305,369,089 params · dim 768 · context 8192 (NTK RoPE factor 8) · Apache-2.0 · 2024-07-20. / https://huggingface.co/Alibaba-NLP/gte-multilingual-base (config.json + API) / 2026-10-07 / primary.
- **Alibaba-NLP/gte-modernbert-base** — 149,014,272 params · dim 768 · context 8192 · Apache-2.0 · created 2025-01-20 · card reports MTEB-en 64.38, BEIR 55.33, LoCo 87.57, CoIR 79.31. / https://huggingface.co/Alibaba-NLP/gte-modernbert-base/raw/main/README.md / 2026-10-07 / primary.
- **Qwen/Qwen3-Embedding-0.6B** — 595,776,512 params · dim 1024 (MRL 32–1024) · context 32K · Apache-2.0 · created 2025-06-03 · card reports MTEB(Eng v2) Mean(Task) **70.70**, MTEB(Multilingual) **64.33**. / https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/raw/main/README.md / 2026-10-07 / primary.
- **Qwen/Qwen3-Embedding-4B** — 4,021,774,336 params · dim 2560 · context 32K · Apache-2.0 · MTEB(Eng v2) **74.60**, MTEB(Multi) **69.45**. / https://huggingface.co/Qwen/Qwen3-Embedding-4B / 2026-10-07 / primary.
- **Qwen/Qwen3-Embedding-8B** — 7,567,295,488 params · dim 4096 · context 32K · Apache-2.0 · MTEB(Multi) **70.58** as of June 5 2025 (No.1 on the MTEB multilingual leaderboard at that date), MTEB(Eng v2) **75.22**. / https://huggingface.co/Qwen/Qwen3-Embedding-8B / 2026-10-07 / primary.
- **No Qwen4-Embedding text model exists.** The only 2026 Qwen embedding release is *multimodal*: Qwen3-VL-Embedding-2B (2,127,532,032 params, Apache-2.0, created 2026-01-07) and Qwen3-VL-Embedding-8B. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-2B and https://huggingface.co/collections/Qwen/qwen3-embedding / 2026-10-07 / primary.
- Alibaba-NLP's 2026 embedding releases are **not** GTE successors: `core-emb-2b`/`core-emb-8b` (multimodal MLLM, CC-BY-4.0, created 2026-08-30), `UEmbed-2B/4B/9B` (CC-BY-4.0, 2026-07-29), `LaSER-Qwen3-0.6B/4B/8B` (MIT, 2026-03-31). No `gte-Qwen3`. / https://huggingface.co/api/models?author=Alibaba-NLP&sort=createdAt / 2026-10-07 / primary.

### Family 3 — E5 (intfloat)

- **intfloat/e5-large-v2** — 335,142,400 params · dim 1024 · context 512 · MIT · 2023-05-19. / https://huggingface.co/intfloat/e5-large-v2 (config.json + API) / 2026-10-07 / primary.
- **intfloat/e5-base-v2** — 109,482,752 params · dim 768 · context 512 · MIT. / https://huggingface.co/intfloat/e5-base-v2 / 2026-10-07 / primary.
- **intfloat/e5-small-v2** — 33,360,512 params · dim 384 · context 512 · MIT. / https://huggingface.co/intfloat/e5-small-v2 / 2026-10-07 / primary.
- **intfloat/multilingual-e5-large** — 559,890,946 params · dim 1024 · context 512 · MIT · 2023-06-30. / https://huggingface.co/intfloat/multilingual-e5-large (config.json + API) / 2026-10-07 / primary.
- **intfloat/multilingual-e5-large-instruct** — 559,890,432 params · dim 1024 · context 512 · MIT · 2024-02-08. / https://huggingface.co/intfloat/multilingual-e5-large-instruct / 2026-10-07 / primary.
- **intfloat/e5-mistral-7b-instruct** — 7,110,660,096 params · dim 4096 · context 32768 · MIT · 2023-12-20. / https://huggingface.co/intfloat/e5-mistral-7b-instruct (config.json + API) / 2026-10-07 / primary.
- **No newer intfloat text-embedding release than e5-mistral-7b-instruct exists.** The org's newest artifacts are `mmE5-mllama-11b-instruct` (multimodal, 2025-02-13) and older e5 variants. / https://huggingface.co/api/models?author=intfloat&sort=createdAt / 2026-10-07 / primary.

### Family 4 — Nomic

- **nomic-ai/nomic-embed-text-v1.5** — 136,731,648 params · dim 768 (MRL to 64) · context 8192 (`n_positions`) · Apache-2.0 · 2024-02-10 · requires task prefixes `search_query:` / `search_document:`. / https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/raw/main/README.md / 2026-10-07 / primary.
- **nomic-ai/nomic-embed-text-v2-moe** — 475,292,928 total / **305M active** params (8 experts, top-2) · dim 768 (MRL to 256) · context **512** · Apache-2.0 · 2025-02-07 · card reports BEIR 52.86, MIRACL 65.80. / https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe/raw/main/README.md / 2026-10-07 / primary.
- **No nomic-embed-text-v3 exists.** Nomic's post-v2 embedding releases are `nomic-embed-code` (2025-03-24) and `nomic-embed-multimodal-3b`/`-7b` (2025-03-27/29); its own product page still lists v2 as the multilingual text model. / https://huggingface.co/api/models?author=nomic-ai&sort=createdAt and https://home.nomic.ai/embed / 2026-10-07 / primary.

### Family 5 — Jina

- **jinaai/jina-embeddings-v2-base-en** — 137,368,320 params · dim 768 · context 8192 · Apache-2.0 · 2023-09-27. / https://huggingface.co/jinaai/jina-embeddings-v2-base-en/raw/main/README.md / 2026-10-07 / primary.
- **jinaai/jina-embeddings-v3** — 572,310,396 params · dim 1024 (MRL to 32) · context 8192 · **CC-BY-NC-4.0** (non-commercial) · 2024-09-05 · 5 task LoRA adapters. / https://huggingface.co/jinaai/jina-embeddings-v3/raw/main/README.md / 2026-10-07 / primary.
- **jinaai/jina-embeddings-v4** — 3,754,885,248 params (Qwen2.5-VL-3B backbone) · dim 2048 (MRL to 128) · context 32768 · **Qwen Research License** (research/non-commercial; card states the earlier CC-BY-NC-4.0 release was "an error") · 2025-05-07 · multimodal (text+images+visual documents). / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/README.md / 2026-10-07 / primary.
- **jinaai/jina-embeddings-v5-text-small** — 677M stated params (HF `safetensors.total` 596,049,920) · dim 1024 (MRL 32–1024) · context **32768** · **CC-BY-NC-4.0** · released **2026-02-18** (HF `createdAt` 2026-01-22) · MTEB English v2 **71.7**, MMTEB **67.7** · base Qwen3-0.6B-Base. / https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md / 2026-10-07 / primary.
- **jinaai/jina-embeddings-v5-text-nano** — 239M stated params (HF 211,766,016) · dim 768 (MRL 32–768) · context **8192** in the spec table (prose says "up to 32K") · CC-BY-NC-4.0 · 2026-02-18 · MTEB English v2 **71.0**, MMTEB **65.5** · base EuroBERT-210m. / https://huggingface.co/jinaai/jina-embeddings-v5-text-nano/raw/main/README.md / 2026-10-07 / primary.
- **jinaai/jina-embeddings-v5-omni-small / -nano** — multimodal (text/image/video/audio); small ≈1.74B params, 1024 dim, 32768 context, CC-BY-NC-4.0, announced 2026-05-11, HF `createdAt` 2026-04-01. Text encoder shares the v5-text embedding space. / https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/README.md and https://jina.ai/news/jina-embeddings-v5-omni-multimodal-embeddings-for-text-image-audio-and-video/ / 2026-10-07 / primary.
- Jina v5 text models are also served through the Jina Embeddings API and Elastic Inference Service; the API accepts image inputs for the omni models. / https://jina.ai/embeddings/ / 2026-10-07 / primary.

### Family 6 — Stella (dunzhang → NovaSearch)

- **NovaSearch/stella_en_1.5B_v5** (formerly `dunzhang/stella_en_1.5B_v5`; HF redirects dunzhang → NovaSearch) — 1,543,268,864 params · MRL dims 512/768/1024/2048/4096/6144/8192, default **1024** · trained/recommended at **512** tokens (card FAQ: "512 is recommended… the model is trained on datasets of 512 length") · MIT · 2024-07-12. / https://huggingface.co/NovaSearch/stella_en_1.5B_v5/raw/main/README.md / 2026-10-07 / primary.
- **NovaSearch/stella_en_400M_v5** — 435,188,736 params · default dim 1024, MRL 512–8192 · MIT · 2024-07-12. / https://huggingface.co/NovaSearch/stella_en_400M_v5/raw/main/README.md / 2026-10-07 / primary.
- No stella v6 or newer; NovaSearch org's newest non-Stella release is `jasper_en_vision_language_v1` (2024-12-11). / https://huggingface.co/api/models?author=NovaSearch&sort=createdAt / 2026-10-07 / primary.

### Family 7 — Snowflake Arctic Embed

- **snowflake-arctic-embed-xs / -s / -m / -l** — 22M/33M/110M/335M params · dim 384/384/768/1024 · context 512 · Apache-2.0 · released 2024-04-16 · MTEB Retrieval NDCG@10: 50.15 / 51.98 / 54.90 / 55.98. / https://raw.githubusercontent.com/Snowflake-Labs/arctic-embed/main/README.md / 2026-10-07 / primary.
- **snowflake-arctic-embed-m-long** — 137M params · dim 768 · context 2048 (8192 with RPE) · Apache-2.0 · 2024-04-12. / https://raw.githubusercontent.com/Snowflake-Labs/arctic-embed/main/README.md / 2026-10-07 / primary.
- **snowflake-arctic-embed-m-v1.5** — 108,891,648 params · dim 768 (MRL 256) · context 512 · Apache-2.0 · 2024-07-03 · MTEB Retrieval 55.14. / https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v1.5 and the arctic-embed README / 2026-10-07 / primary.
- **snowflake-arctic-embed-l-v2.0** — 568M total / **303M non-embedding** params · dim 1024 (MRL 256) · context 8192 · Apache-2.0 · released 2024-12-04 · BEIR(15) 55.6, MIRACL(4) 55.8, CLEF-Full 54.3. / https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0/raw/main/README.md / 2026-10-07 / primary.
- **snowflake-arctic-embed-m-v2.0** — 305,368,320 params · dim 768 · context 8192 · Apache-2.0 · 2024-11-08. / https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0 (config.json + API) / 2026-10-07 / primary.
- **No arctic-embed-3 exists.** Snowflake-Labs/arctic-embed's newest news item is 12/18/2024; v2.0 (Dec 2024) remains latest. / https://raw.githubusercontent.com/Snowflake-Labs/arctic-embed/main/README.md / 2026-10-07 / primary.

### Family 8 — Mixedbread (mxbai)

- **mixedbread-ai/mxbai-embed-large-v1** — 335,141,888 params · dim 1024 (MRL to 512/256/128 + binary quant) · context 512 · Apache-2.0 · 2024-03-07 · MTEB avg (56 datasets) **64.68**, retrieval 54.39. / https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1/raw/main/README.md / 2026-10-07 / primary.
- **mixedbread-ai/mxbai-embed-2d-large-v1** — 335,141,888 params · dim 1024, 2D-shrinkable to 768 with no retraining · context 512 · Apache-2.0 · 2024-03-04 · MTEB avg 63.25. / https://huggingface.co/mixedbread-ai/mxbai-embed-2d-large-v1/raw/main/README.md / 2026-10-07 / primary.
- **mixedbread-ai/mxbai-embed-xsmall-v1** — 24,089,472 params · dim 384 · context 4096 · Apache-2.0 · 2024-09-13. / https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1 (config.json + API) / 2026-10-07 / primary.
- **mixedbread-ai/mxbai-edge-colbert-v0-32m / -17m** — 32M/17M params ColBERT late-interaction retrievers, dim 64 per token, up to 32000 tokens, Apache-2.0, created 2025-10-13. / https://huggingface.co/mixedbread-ai/mxbai-edge-colbert-v0-32m/raw/main/README.md / 2026-10-07 / primary.
- **No new mxbai dense embedder in 2025–2026.** Mixedbread's org page lists only mxbai-embed-large-v1 / -2d-large-v1 / -xsmall-v1 / deepset-mxbai-embed-de-large-v1 plus rerankers and ColBERT models. / https://huggingface.co/mixedbread-ai/models?sort=created / 2026-10-07 / primary.

### Family 9 — EmbeddingGemma (Google)

- **google/embeddinggemma-300m** — 308M stated params (HF `safetensors.total` 302,863,104) · dim 768 (MRL 128/256/512/768) · context **2048** · `gemma` licence (gated repo) · HF created 2025-07-17, announced **2025-09-04** · text-only (Gemma3 text backbone, bidirectional attention); MRL truncation to 256 is near-lossless per the model card. / https://huggingface.co/blog/embeddinggemma and https://huggingface.co/google/embeddinggemma-300m / 2026-10-07 / primary.
- **google/embeddinggemma-2** — 740M total params, of which **270M text backbone** (130M transformer + 140M embedder), 170M vision, 300M audio · dim 768 (MRL 128/256/512) · context **8192** · **Apache-2.0** · HF created 2026-09-14, announced **2026-10-06** · multimodal (text/code/image/video/audio); text-only load = 270M via `config_kwargs={"vision_config": None, "audio_config": None}` · card reports MTEB(Multilingual v2) 61.36, MTEB(Eng v2) 68.46, MTEB(Code v1) 78.68 at 768d; at 128d 57.89/65.68/71.41. / https://huggingface.co/google/embeddinggemma-2/raw/main/README.md and https://ai.google.dev/gemma/docs/embeddinggemma / 2026-10-07 / primary.
- EmbeddingGemma 2 must **not** be run in float16 (activations exceed fp16 range; use bfloat16 or float32 — the card recommends float32 on most CPUs). / https://huggingface.co/google/embeddinggemma-2/raw/main/README.md / 2026-10-07 / primary.
- EmbeddingGemma (v1) arXiv preprint is 2509.20354, submitted 2025-09-24. / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary.

### Family 10 — IBM Granite Embedding

- **ibm-granite/granite-embedding-english-r2** — 149,014,272 params · dim 768 · context 8192 · Apache-2.0 · released **2025-08-15** · MTEB-v2 **62.8**, BEIR 53.1, CoIR 55.3, MLDR(En) 40.7, MTRAG 56.7 · ModernBERT-based. / https://huggingface.co/ibm-granite/granite-embedding-english-r2/raw/main/README.md / 2026-10-07 / primary.
- **ibm-granite/granite-embedding-small-english-r2** — 47,662,464 params · dim 384 · context 8192 · Apache-2.0 · 2025-08-15 · MTEB-v2 61.1, BEIR 50.9. / https://huggingface.co/ibm-granite/granite-embedding-small-english-r2 / 2026-10-07 / primary.
- **ibm-granite/granite-embedding-125m-english** — 125M · dim 768 · context 512 · Apache-2.0 · 2024-12-04. **granite-embedding-30m-english** — 30M · dim 384 · context 512. **granite-embedding-278m-multilingual** — 278,043,648 params · dim 768 · context 512 · 2024-12-04. **granite-embedding-107m-multilingual** — 106,994,304 params · dim 384 · context 512. / https://huggingface.co/ibm-granite/granite-embedding-278m-multilingual and r2 card comparison tables / 2026-10-07 / primary.
- **ibm-granite/granite-embedding-311m-multilingual-r2** — 311M params · dim 768 (MRL 512/384/256/128) · context **32768** · Apache-2.0 · released **2026-04-29** · Multilingual MTEB Retrieval (18 tasks) **65.2** (+13 vs 278m-multilingual's 52.2) · 200+ languages, explicit training for 52 languages + code. / https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2/raw/main/README.md / 2026-10-07 / primary.
- **ibm-granite/granite-embedding-97m-multilingual-r2** — 97M params · dim 384 · context 32768 · Apache-2.0 · 2026-04-20. / https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2 (config.json + API) / 2026-10-07 / primary.

### Family 11 — KaLM Embedding

- **KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5** — 494,032,768 params (0.5B, Qwen2.5-0.5B base) · dim 896 (MRL 896/512/256/128/64) · max input 32k (card) / `sentence_bert_config` 32768 · Apache-2.0 · created 2025-09-29 · mean pooling, bidirectional attention. / https://huggingface.co/KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5/raw/main/README.md / 2026-10-07 / primary.
- Earlier members: `KaLM-embedding-multilingual-mini-instruct-v1`, `-v1.5`, `-v2` (under HIT-TMG). A 12B sibling exists: **tencent/KaLM-Embedding-Gemma3-12B-2511** — 11,766,034,176 params · `other` licence · created 2025-11-04. / https://huggingface.co/KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5/raw/main/README.md / 2026-10-07 / primary.
- KaLM-Embedding v2 paper: ICLR 2026 (OpenReview Y7qzhvWhcz) and arXiv 2506.20923. / https://huggingface.co/KaLM-embedding/KaLM-embedding-multilingual-mini-instruct-v2.5/raw/main/README.md / 2026-10-07 / primary.

### Family 12 — LFM2 / LFM2.5 (Liquid AI)

- **LiquidAI/LFM2.5-Embedding-350M** — ~354M params (17 layers: 10 conv + 6 attn + 1 pool) · dim **1024** CLS vector · **document length 512 tokens** · **LFM Open License v1.0** (`other`) · HF created 2026-05-05, blog 2026-06-18 · 11 languages · asymmetric prompts `query: ` / `document: ` · card reports NanoBEIR-Multilingual-Extended NDCG@10 avg **0.577** and MKQA-11 Recall@20 **0.691**, beating Qwen3-Embedding-0.6B (0.556 / 0.638) on those sets. / https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M/raw/main/README.md and https://www.liquid.ai/blog/lfm2-5-retrievers / 2026-10-07 / primary.
- **LiquidAI/LFM2.5-ColBERT-350M** — ~353M params · 128-dim per-token (MaxSim) · 512 tokens · LFM Open License v1.0 · 2026-06-16 · NanoBEIR-Multi avg 0.605. / https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M/raw/main/README.md / 2026-10-07 / primary.
- Earlier member **LiquidAI/LFM2-ColBERT-350M** — 353,322,752 params · `other` licence · created 2025-10-28. `LiquidAI/LFM2-350M-Embedding` returns HTTP 401 (gated/renamed); the shipping dense retriever is LFM2.5-Embedding-350M. / https://huggingface.co/api/models?author=LiquidAI&sort=createdAt / 2026-10-07 / primary.
- LFM2.5-Embedding-350M GGUF exists (`LiquidAI/LFM2.5-Embedding-350M-GGUF`, created 2026-06-16); card publishes llama.cpp CPU latency on an M4 Max: query embedding p50 **7.3 ms** / p95 9.6 ms (docs cached). / https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M/raw/main/README.md / 2026-10-07 / primary.

### Family 13 — Voyage open weights

- **voyageai/voyage-4-nano** — 180M non-embedding + 160M embedding params (≈340M total) · dim **2048** default (MRL 2048/1024/512/256) · context **32000** · **Apache-2.0** · HF created 2026-01-06, blog 2026-01-15 · Qwen3-derived bidirectional architecture; shared embedding space with the API-only voyage-4 / -large / -lite · supports float32/int8/uint8/binary outputs (quantization-aware training). / https://huggingface.co/voyageai/voyage-4-nano/raw/main/README.md and https://blog.voyageai.com/2026/01/15/voyage-4/ / 2026-10-07 / primary.
- This is Voyage's **first open-weight** model; voyage-3, voyage-3-large, voyage-3.5, voyage-code-3, voyage-4, voyage-4-large, voyage-4-lite, voyage-code-4 remain API-only. / https://docs.voyageai.com/docs/embeddings / 2026-10-07 / primary.

### Family 14 — SFR-Embedding (Salesforce)

- **Salesforce/SFR-Embedding-Mistral** — 7,110,660,096 params · dim 4096 · context 32768 · **CC-BY-NC-4.0** (research only) · 2024-01-24. / https://huggingface.co/Salesforce/SFR-Embedding-Mistral (config.json + API) / 2026-10-07 / primary.
- **Salesforce/SFR-Embedding-2_R** — 7,110,660,096 params · dim 4096 · `sentence_bert_config` max_seq_length 4096 (raw `max_position_embeddings` 32768) · CC-BY-NC-4.0 · 2024-06-14. / https://huggingface.co/Salesforce/SFR-Embedding-2_R (config.json + API) / 2026-10-07 / primary.
- **Salesforce/SFR-Embedding-Code-400M_R** — 434,139,136 params · dim 1024 · context 8192 · CC-BY-NC-4.0 · 2025-01-16 · CoIR avg NDCG@10 61.9. **SFR-Embedding-Code-2B_R** — 2,614,341,888 params · CC-BY-NC-4.0 · 2025-01-17 · CoIR 67.4. / https://huggingface.co/Salesforce/SFR-Embedding-Code-400M_R/raw/main/README.md / 2026-10-07 / primary.
- All SFR releases are explicitly "for research purposes only". / https://huggingface.co/Salesforce/SFR-Embedding-2_R/raw/main/README.md / 2026-10-07 / primary.

### Family 15 — Cohere "open"

- **Cohere's embed models are NOT open-weights.** The HF repo `CohereLabs/Cohere-embed-multilingual-v3.0` contains only tokenizer/config files (`.gitattributes`, `README.md`, `config.json`, `sentencepiece.bpe.model`, `special_tokens_map.json`, `tokenizer.json`, `tokenizer_config.json`) — no model weights. Embed v3/v4/v5 are API/private-deployment only. / https://huggingface.co/api/models/CohereLabs/Cohere-embed-multilingual-v3.0/tree/main and https://cohere.com/models-overview / 2026-10-07 / primary.

### API-only models (for completeness, NOT recommendations)

- **Voyage (API):** `voyage-4-large`, `voyage-4`, `voyage-4-lite`, `voyage-code-4` — all 32,000-token context, dims 1024 default (256/512/2048 supported), released 2026-01-15 (`voyage-code-4` 2026-08-06). `voyage-3-large` (2025-01-07), `voyage-3.5` (2025-05-20), `voyage-3.5-lite`, `voyage-code-3` (2024-12-04), `voyage-finance-2` (32k, 1024), `voyage-law-2` (16k, 1024). **Voyage publishes no parameter counts for any API model.** Licence = commercial API terms; `voyage-4-large` uses an MoE architecture (exact size unpublished). / https://docs.voyageai.com/docs/embeddings and https://blog.voyageai.com/2026/01/15/voyage-4/ / 2026-10-07 / primary.
- **Cohere (API):** `embed-v4.0` — released 2025-04-15, 128k context, dims 256/512/1024/1536 (default 1536), text+image. `embed-v5.0-pro` / `embed-v5.0-fast` — released **2026-09-30**, 128k context, dims 256/512/768/1024/1536/2048 (default 2048), multimodal, shared embedding space. `embed-english-v3.0` / `embed-multilingual-v3.0` — 512 context, dim 1024; `*-light-v3.0` — dim 384. **Cohere publishes no parameter counts.** Proprietary/commercial terms; v3.0+ available on AWS SageMaker / Azure / Model Vault. / https://docs.cohere.com/docs/cohere-embed and https://docs.cohere.com/changelog/embed-v5 / 2026-10-07 / primary.
- **OpenAI (API):** `text-embedding-3-small` — dim 1536 (reducible via `dimensions`), max input 8192 tokens, MTEB 62.3%. `text-embedding-3-large` — dim 3072 (reducible), max input 8192, MTEB 64.6%, $0.13/1M tokens. `text-embedding-ada-002` — dim 1536, max input 8192, MTEB 61.0%. Released 2024-01-25. **OpenAI publishes no parameter counts.** No text-embedding-4. / https://developers.openai.com/api/docs/guides/embeddings and https://developers.openai.com/api/docs/models/text-embedding-3-large / 2026-10-07 / primary.
- **Google Gemini (API):** `gemini-embedding-001` — input token limit **2048**, output dims flexible 128–3072 (recommended 768/1536/3072), text-only, GA 2025-07-14, latest update June 2025. `gemini-embedding-2` — input token limit **8192**, output dims 128–3072, multimodal (text/image/video/audio/PDF), preview 2026-03-10, GA 2026-04-22. Both use MRL. **Google publishes no parameter counts.** / https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001 and https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2 / 2026-10-07 / primary.
- **Jina API:** the same v5-text-small/nano and v5-omni weights are served via `api.jina.ai/v1/embeddings`; the API also accepts image inputs on the omni models. / https://jina.ai/embeddings/ / 2026-10-07 / primary.

## Searches

- HF API model metadata + config sweep (all families): `https://huggingface.co/api/models/{id}?full=true`, `https://huggingface.co/{id}/raw/main/config.json`, `.../sentence_bert_config.json` — used for params, dim, context, licence, `createdAt`. 2026-10-07.
- HF API org listings by `createdAt` for: BAAI, Alibaba-NLP, intfloat, nomic-ai, jinaai, mixedbread-ai, Snowflake, NovaSearch, LiquidAI, voyageai, CohereLabs, ibm-granite, KaLM-Embedding, Qwen, google, Salesforce, tencent. 2026-10-07.
- HF API existence probes: `?search=bge-m4`, `?search=bge-m5`, `?search=nomic-embed-text-v3`, `?search=arctic-embed-3` — all empty or unrelated. 2026-10-07.
- Model cards read raw: bge-m3, bge-en-icl, bge-multilingual-gemma2, bge-reasoner-embed, gte-large-en-v1.5, gte-modernbert-base, Qwen3-Embedding-0.6B, e5-large-v2, nomic-embed-text-v1.5, nomic-embed-text-v2-moe, jina-embeddings-v2/v3/v4/v5-text-small/v5-text-nano/v5-omni-small, stella_en_1.5B_v5, stella_en_400M_v5, snowflake-arctic-embed-l-v2.0, mxbai-embed-large-v1, mxbai-embed-2d-large-v1, mxbai-edge-colbert-v0-32m, granite-embedding-english-r2, granite-embedding-311m-multilingual-r2, KaLM-embedding-mini-instruct-v2.5, LFM2.5-Embedding-350M, voyage-4-nano, SFR-Embedding-Mistral, SFR-Embedding-2_R, SFR-Embedding-Code-400M_R, google/embeddinggemma-2. 2026-10-07.
- GitHub READMEs: FlagOpen/FlagEmbedding (master), QwenLM/Qwen3-Embedding (main), Snowflake-Labs/arctic-embed (main). 2026-10-07.
- Official docs: docs.cohere.com/docs/cohere-embed, docs.cohere.com/changelog/embed-v5, docs.voyageai.com/docs/embeddings, developers.openai.com/api/docs/guides/embeddings, developers.openai.com/api/docs/models/text-embedding-3-large, ai.google.dev/gemini-api/docs/embeddings, ai.google.dev/gemini-api/docs/models/gemini-embedding-001, ai.google.dev/gemini-api/docs/models/gemini-embedding-2, ai.google.dev/gemma/docs/embeddinggemma, jina.ai/embeddings. 2026-10-07.
- Web discovery (Tavily-backed search) for release dates and successor existence: BGE-M4/M5, Qwen4-Embedding, nomic v3, jina v5, arctic-embed-3, EmbeddingGemma 2, Cohere Embed 5, Gemini Embedding 2, OpenAI text-embedding-4, mxbai 2026, gte 2026. 2026-10-07.
- arXiv: 2509.20354 (EmbeddingGemma), 2602.15547 (jina v5 text), 2605.08384 (jina v5 omni), 2412.04506 (Arctic-Embed 2.0), 2506.05176 (Qwen3 Embedding), 2609.04083 (Core-Embed). 2026-10-07.

## Conflicting evidence

- **bge-m3 parameter count.** The BGE-M3 model card does not state a parameter count, and HF reports `safetensors.total = null` for the repo (weights are stored as `pytorch_model.bin`, not safetensors). Snowflake's Arctic-Embed 2.0 table lists bge-m3 as 568M total / 303M non-embedding; Nomic's v2-moe table lists 568M. The two independent third parties agree on 568M, but no first-party BAAI figure was found. Treated as **third-party-sourced**.
- **jina-embeddings-v4 licence.** The model card says the model "was initially released under cc-by-nc-4.0 due to an error" and that the correct licence is the **Qwen Research License**; the HF repo's `cardData.license` is `null`. Both are non-commercial, so the practical constraint is unchanged, but the exact licence string differs by source.
- **jina-embeddings-v5-text-nano context.** The card's prose says "supports multilingual text up to 32K tokens", while its own spec table says `Max Sequence Length | 8192` and `config.json` reports `max_position_embeddings: 8192`. The spec table/config (8192) is taken as authoritative; the prose appears to be inherited from the v5-text-small paragraph.
- **jina-embeddings-v5-text-small param count.** Card states 677M; HF `safetensors.total` is 596,049,920 (≈596M). Both are reported above.
- **stella_en_1.5B_v5 identifier.** `dunzhang/stella_en_1.5B_v5` now HTTP-redirects to `NovaSearch/stella_en_1.5B_v5`; both URLs resolve to the same repo. Reported under NovaSearch.
- **LFM2-350M-Embedding.** The name in the brief (`LiquidAI/LFM2-350M-Embedding`) returns HTTP 401; the shipping dense retriever is `LiquidAI/LFM2.5-Embedding-350M`. The brief's name may be an earlier/renamed artifact.
- **EmbeddingGemma 300m context.** The brief and the model card's family framing say "2K context"; the HF blog confirms 2048 tokens. EmbeddingGemma 2 raises this to 8192. No conflict, but note the two generations differ.
- **mxbai "2026 release".** A secondary Reddit post claims a Mixedbread 2026 embedding release ("Wholembed v3"); no such model exists on Mixedbread's HF org, so this is treated as **unverified/likely misattributed**.

## Gaps

- **bge-m3 first-party parameter count** — not published by BAAI on the model card or FlagEmbedding README; only third-party tables (568M) exist. Unverified first-party.
- **Exact release dates for several open models** are approximated by HF `createdAt` (repo creation), which precedes or lags the announcement. Dates given as `createdAt` are labelled as such; announcement dates were only confirmed for jina v5-text (2026-02-18), EmbeddingGemma 1 (2025-09-04) and 2 (2026-10-06), granite english-r2 (2025-08-15), granite multilingual-r2 (2026-04-29), LFM2.5 (2026-06-18), Voyage 4 (2026-01-15), Cohere Embed 4 (2025-04-15) and Embed 5 (2026-09-30), Gemini Embedding 001 GA (2025-07-14) and Embedding 2 (preview 2026-03-10 / GA 2026-04-22), OpenAI text-embedding-3 (2024-01-25).
- **Parameter counts for all API-only models** (Voyage, Cohere, OpenAI, Gemini) are unpublished. Explicitly stated where applicable; not estimated.
- **`voyageai/voyage-4`, `-large`, `-lite` and `voyage-code-4` HF repos exist** (created 2026-01-08 / 2026-08-06) with very low download counts, but Voyage's docs describe only `voyage-4-nano` as open-weight. Whether these repos carry usable weights or are config/tokenizer stubs was not verified — flagged as unverified. `voyage-4-nano` (340k downloads) is the only confirmed open-weight release.
- **Qwen3-Embedding model card `sentence_bert_config.json` is absent**, so max sequence length for the 4B/8B is taken from the card table (32K); `config.json` reports `max_position_embeddings: 40960`. Card figure used.
- **BGE-VL / MegaPairs, nomic-embed-code, jina-code-embeddings, mxbai-edge-colbert** are code/multimodal or late-interaction families mentioned only in passing; their full text-retrieval specs are out of scope for this angle and are not enumerated exhaustively.
- **Alibaba-NLP's 2026 lines** (core-emb, UEmbed, LaSER-Qwen3, E2Rank, GVE) are multimodal/reranking or research artifacts; whether any is a general text-retrieval successor to GTE was not fully evaluated (download counts are very low, suggesting research-stage).
- **No MTEB leaderboard snapshot was read directly** in this angle — reported scores are from model cards with their stated snapshot dates (e.g. Qwen3-Embedding-8B "as of June 5, 2025"). Cross-model comparison on one snapshot belongs to Angle 2.
