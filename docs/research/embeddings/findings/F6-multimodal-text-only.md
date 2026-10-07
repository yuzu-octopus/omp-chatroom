# F6 — Text-only extraction for multimodal embedding models

## Angle

For EmbeddingGemma and every other multimodal embedding model that is a plausible local CPU text retriever, isolate the text encoder: text-only params, text-only size (excluding vision/audio layers where separable), and text-benchmark scores (MTEB English, MTEB multilingual, MMTEB) with subset, number, snapshot date.

## Claims

### EmbeddingGemma-300m (google/embeddinggemma-300m)

- **Not multimodal.** EmbeddingGemma is a pure text embedding model built from the Gemma 3 language model architecture. It has no vision tower, no audio tower, no multimodal inputs. The name refers to the Gemma family, not to multimodal capability. / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
- **Architecture:** 24-layer bidirectional transformer encoder, d_model=768, mean pooling, two dense projection layers (768→3072→768). Output 768-dim, MRL-truncatable to 512/256/128. / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
- **Parameters:** 302,863,104 (F32, per HF safetensors metadata). Paper and blog round to 308M. / https://huggingface.co/api/models/google/embeddinggemma-300m?full=true / 2026-10-07 / primary
- **Size:** ~1.2 GB at F32 (302.9M × 4 bytes); ~600 MB at bf16; ~150 MB at int4. / https://huggingface.co/api/models/google/embeddinggemma-300m?full=true / 2026-10-07 / primary (param count); size computed from param count
- **MTEB scores (from paper Table 1, snapshot 2025-09-23):**
  - MTEB (Multilingual, v2): Mean(Task)=61.15, Mean(Type)=54.31 / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
  - MTEB (English, v2): Mean(Task)=69.67, Mean(Type)=65.11 / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
  - MTEB (Code): Mean(Task)=68.76 / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
- **Quantization:** int4 per-block, int8 per-block, and mixed-precision per-channel checkpoints published. Quality drop ≤0.5 points at int4. / https://arxiv.org/abs/2509.20354 / 2026-10-07 / primary
- **CPU feasibility:** 308M params, 2K context, <200 MB RAM when quantized (per HF blog). ONNX and TEI supported. / https://huggingface.co/blog/embeddinggemma / 2026-10-07 / primary

### jina-embeddings-v4 (jinaai/jina-embeddings-v4)

- **Multimodal.** 3.8B params + 60M per LoRA adapter (3 adapters: retrieval, text-matching, code). Base: Qwen2.5-VL-3B-Instruct. / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
- **Text encoder separable:** The text path uses the Qwen2.5-VL language-model backbone (36 layers, hidden_size=2048, 16 attention heads, 2 KV heads). The vision tower (depth=32, hidden_size=1280, patch_size=14) is a separate component. For text-only inference, the vision tower can be omitted. / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/config.json / 2026-10-07 / primary
- **Text-only params estimate:** The Qwen2.5-VL-3B backbone is ~3.0B params (text LLM) + ~0.5B vision tower ≈ 3.5B total. Text-only ≈ 3.0B (computed from config: text_config has 36 layers, hidden_size=2048, intermediate_size=11008, vocab_size=151936; vision_config has depth=32, hidden_size=1280). Label: computed-from-primary-config. / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/config.json / 2026-10-07 / primary
- **Text-only size estimate:** ~6.0 GB at bf16 (3.0B × 2 bytes); ~3.0 GB at int8; ~1.5 GB at int4. Label: computed-from-primary-config. / https://huggingface.co/jinaai/jina-embeddings-v4/raw/main/config.json / 2026-10-07 / primary
- **MTEB scores (from paper Table 3, snapshot 2025-07-07):**
  - MTEB (English, v2) Retrieval: 55.97 (nDCG@10) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
  - MMTEB (Multilingual, v2) Retrieval: 66.49 (nDCG@10) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
  - LongEmbed: 67.11 (nDCG@10) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
  - MTEB (English, v2) STS: 85.89 (Spearman) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
  - MMTEB (Multilingual, v2) STS: 72.70 (Spearman) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
  - CoIR Code Retrieval: 71.59 (nDCG@10) / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
- **CPU feasibility:** 3.8B total / ~3.0B text-only. At bf16, ~7.6 GB / ~6.0 GB. Too large for comfortable CPU inference on 15 GB RAM with other processes. GGUF versions published by community. / https://huggingface.co/jinaai/jina-embeddings-v4 / 2026-10-07 / primary

### Qwen3-VL-Embedding (Qwen/Qwen3-VL-Embedding-2B and -8B)

- **Multimodal.** Built on Qwen3-VL-8B-Instruct. Accepts text, images, screenshots, video. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **Text encoder separable:** The language_model component is separable from the visual (vision tower) component. For text-only deployment, the vision tower can be omitted. / https://github.com/QwenLM/Qwen3-VL-Embedding/blob/main/src/models/qwen3_vl_embedding.py / 2026-10-07 / primary
- **Parameters:** 2B (28 layers, 2048 dim) and 8B (36 layers, 4096 dim). Total model sizes; no official text-only/vision-only split published. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **Text-only params estimate:** Qwen3-VL-8B total is ~8B. Vision tower is ~0.5-0.7B (typical for ViT-L/14-class). Text-only ≈ 7.3-7.5B. Label: computed-from-primary-config (estimate). / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **MMTEB scores (from model card, snapshot 2026-10-07):**
  - Qwen3-VL-Embedding-2B: Mean(Task)=63.87, Mean(Type)=55.84 / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
  - Qwen3-VL-Embedding-8B: Mean(Task)=67.88, Mean(Type)=58.88 / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **MMEB-V2 scores (multimodal, from model card):**
  - Qwen3-VL-Embedding-2B: 73.4 / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
  - Qwen3-VL-Embedding-8B: 77.9 / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **Comparison to text-only Qwen3-Embedding:** Qwen3-Embedding-8B scores 70.58 Mean(Task) on MMTEB vs 67.88 for Qwen3-VL-Embedding-8B. The text-only variant outperforms the multimodal variant on text-only benchmarks by ~2.7 points. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary
- **CPU feasibility:** 2B variant: ~4 GB at bf16, ~2 GB at int8, ~1 GB at int4. 8B variant: ~16 GB at bf16 — too large for 15 GB RAM. 2B is borderline feasible on CPU. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary

### GME (Alibaba-NLP/gme-Qwen2-VL-2B-Instruct and -7B)

- **Multimodal.** Built on Qwen2-VL. Accepts text, images, text+image pairs. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
- **Text encoder separable:** Qwen2-VL architecture has separate language_model and visual components. Text-only inference can omit the vision tower. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
- **Parameters:** 2B and 7B total. No official text-only split published. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
- **MTEB scores (from model card, snapshot 2026-10-07):**
  - GME-2B English: 65.27 / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
  - GME-2B Chinese: 66.92 / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
  - GME-7B English: 67.48 / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
  - GME-7B Chinese: 69.73 / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
- **Embedding dim:** 2B=1536, 7B=3584. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary
- **CPU feasibility:** 2B: ~4 GB at bf16. 7B: ~14 GB at bf16 — borderline on 15 GB RAM. / https://huggingface.co/Alibaba-NLP/gme-Qwen2-VL-2B-Instruct / 2026-10-07 / primary

### BGE-VL (BAAI/BGE-VL-base and -large)

- **Multimodal (CLIP-based).** BGE-VL-base uses CLIP ViT-B/16 as both text and image encoder. BGE-VL-large uses CLIP ViT-L/14. / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **Text encoder:** CLIP's text tower. For BGE-VL-base, the text encoder is a 12-layer, 512-wide transformer with 8 attention heads (standard CLIP ViT-B/16 text tower). For BGE-VL-large, it is a 12-layer, 768-wide transformer with 12 attention heads (CLIP ViT-L/14 text tower). / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **Parameters:** BGE-VL-base total ~149M (text + vision + projections). BGE-VL-large total ~428M. Text-only portion: ~50-60M for base (CLIP-B/16 text tower), ~120-150M for large (CLIP-L/14 text tower). Label: computed-from-primary-config. / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **Embedding dim:** base=512, large=768. / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **MTEB scores:** Not published on MTEB leaderboard. BGE-VL is evaluated on multimodal benchmarks (CIRCO, MMEB) not text-only MTEB. / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **CPU feasibility:** Very small. Base: ~600 MB at F32. Large: ~1.7 GB at F32. Excellent CPU feasibility. / https://huggingface.co/BAAI/BGE-VL-base / 2026-10-07 / primary
- **Note:** CLIP text towers are weak text retrievers compared to dedicated text embedding models of similar size. BGE-VL-base text encoder (~50M) would underperform all-MiniLM-L6-v2 (22M) on most text tasks.

### VLM2Vec (TIGER-Lab/VLM2Vec)

- **Training framework, not a fixed model.** VLM2Vec provides training recipes to convert VLMs (Phi-3.5, Llama-3.2, etc.) into multimodal embedding models. Parameter count depends on the backbone. / https://arxiv.org/abs/2410.05160 / 2026-10-07 / primary
- **Text encoder:** Inherits the VLM's language model backbone. Separable from vision tower in principle. / https://arxiv.org/abs/2410.05160 / 2026-10-07 / primary
- **MTEB scores:** VLM2Vec-V2 on MMEB-V2: 59.2 (2B variant). Not directly comparable to text-only MTEB. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary

### LLaVE (XMUDeepLIT/LLaVE)

- **Multimodal.** Variants: LLaVE-0.5B, LLaVE-2B, LLaVE-7B. Built on LLaVA-OneVision and Aquila-VL backbones. / https://github.com/XMUDeepLIT/LLaVE / 2026-10-07 / primary
- **Text encoder:** Uses the language-model backbone shared with the multimodal model. No published text-only param split. / https://github.com/XMUDeepLIT/LLaVE / 2026-10-07 / primary
- **MTEB scores:** Not published on MTEB leaderboard. / https://github.com/XMUDeepLIT/LLaVE / 2026-10-07 / primary

### voyage-multimodal-3 (voyageai/voyage-multimodal-3)

- **API only.** No open weights. 1024-dim, 32K context. / https://blog.voyageai.com/2024/11/12/voyage-multimodal-3/ / 2026-10-07 / primary
- **Text encoder:** Unified transformer encoder for text and visual inputs. No separate text encoder disclosed. / https://blog.voyageai.com/2024/11/12/voyage-multimodal-3/ / 2026-10-07 / primary
- **Parameters:** Not disclosed. / https://blog.voyageai.com/2024/11/12/voyage-multimodal-3/ / 2026-10-07 / primary
- **MTEB scores:** Listed on MTEB leaderboard but scores not verified in this research. / https://leaderboard.mteb.org/models/voyageai/voyage-multimodal-3 / 2026-10-07 / primary

### Cohere embed-v4.0

- **API only.** No open weights. 1024/1536 dim, 128K context. / https://docs.cohere.com/v2/docs/cohere-embed / 2026-10-07 / primary
- **Text encoder:** Not disclosed. Cohere does not publish architecture details. / https://docs.cohere.com/v2/docs/cohere-embed / 2026-10-07 / primary
- **Parameters:** Not disclosed. / https://docs.cohere.com/v2/docs/cohere-embed / 2026-10-07 / primary

### NeoMME (H Company, 2026)

- **Multimodal.** 260M and 800M single-tower bidirectional multimodal encoders. Apache 2.0. / https://arxiv.org/abs/2609.01657 / 2026-10-07 / primary
- **Text encoder:** Single-tower architecture — text and images share the same encoder. Not separable into distinct text/vision towers. / https://arxiv.org/abs/2609.01657 / 2026-10-07 / primary
- **Parameters:** 260M and 800M total (shared encoder). / https://arxiv.org/abs/2609.01657 / 2026-10-07 / primary
- **MTEB scores:** Not yet published on MTEB leaderboard at time of research. / https://arxiv.org/abs/2609.01657 / 2026-10-07 / primary
- **CPU feasibility:** 260M: ~1 GB at F32, ~500 MB at bf16. 800M: ~3.2 GB at F32, ~1.6 GB at bf16. Excellent CPU feasibility. / https://arxiv.org/abs/2609.01657 / 2026-10-07 / primary

### BidirLM-Omni-2.5B (2026)

- **Multimodal.** Text + images + audio. Turns a causal LM into a bidirectional encoder. / https://huggingface.co/blog/Nicolas-BZRD/bidirlm-release / 2026-10-07 / primary
- **Text encoder:** The bidirectional text encoder is the base of the multimodal model. Audio and vision towers are additive. / https://huggingface.co/blog/Nicolas-BZRD/bidirlm-release / 2026-10-07 / primary
- **Parameters:** 2.5B total. Text-only portion not separately published. / https://huggingface.co/blog/Nicolas-BZRD/bidirlm-release / 2026-10-07 / primary
- **MTEB scores:** Not yet published on MTEB leaderboard at time of research. / https://huggingface.co/blog/Nicolas-BZRD/bidirlm-release / 2026-10-07 / primary

## Searches

1. "EmbeddingGemma 300M text encoder parameters MTEB benchmark" — web_search, 2026-10-07
2. "jina-embeddings-v4 multimodal text encoder parameters benchmark" — web_search, 2026-10-07
3. "voyage-multimodal-3 embedding model text encoder parameters" — web_search, 2026-10-07
4. "Cohere embed-v4.0 multimodal text embedding parameters" — web_search, 2026-10-07
5. "Qwen3-VL-Embedding model text encoder parameters benchmark" — web_search, 2026-10-07
6. "BGE-VL VLM2Vec multimodal embedding model text encoder parameters" — web_search, 2026-10-07
7. "GME gme-Qwen2-VL Alibaba multimodal embedding text encoder" — web_search, 2026-10-07
8. "LLaVE multimodal embedding model text encoder parameters" — web_search, 2026-10-07
9. "multimodal embedding model 2025 2026 text encoder open weights release" — web_search, 2026-10-07
10. "jina-embeddings-v4 text-only benchmark MTEB retrieval score" — web_search, 2026-10-07
11. "Qwen3-VL-Embedding text encoder parameters vision tower separable" — web_search, 2026-10-07
12. HuggingFace API: google/embeddinggemma-300m?full=true — 2026-10-07
13. HuggingFace API: jinaai/jina-embeddings-v4 — 2026-10-07
14. HuggingFace API: Qwen/Qwen3-VL-Embedding-8B — 2026-10-07
15. HuggingFace API: BAAI/BGE-VL-base — 2026-10-07
16. HuggingFace API: Alibaba-NLP/gme-Qwen2-VL-2B-Instruct — 2026-10-07
17. arXiv:2509.20354 (EmbeddingGemma paper) — 2026-10-07
18. arXiv:2506.18902 (jina-embeddings-v4 paper) — 2026-10-07
19. HuggingFace blog: embeddinggemma — 2026-10-07
20. config.json: jinaai/jina-embeddings-v4 — 2026-10-07

## Conflicting evidence

- **EmbeddingGemma param count:** HF safetensors metadata reports 302,863,104 (F32). Paper says "308M." MTEB catalog lists 307.6M. Converted model listing gives 302,863,104. Minor discrepancy likely due to rounding or tokenizer embedding treatment. All sources agree on ~300-308M range. / https://huggingface.co/api/models/google/embeddinggemma-300m?full=true / 2026-10-07 / primary
- **jina-embeddings-v4 text-only params:** Paper says "3.8 billion parameter multimodal embedding model" and base is "Qwen2.5-VL-3B-Instruct." The 3.8B likely includes the vision tower. Text-only portion is ~3.0B (computed from config). No official text-only param count published. / https://arxiv.org/abs/2506.18902 / 2026-10-07 / primary
- **Qwen3-VL-Embedding vs Qwen3-Embedding on MMTEB:** Qwen3-VL-Embedding-8B scores 67.88 Mean(Task) on MMTEB, while Qwen3-Embedding-8B scores 70.58. This suggests multimodal training may hurt text-only retrieval by ~2.7 points at the 8B scale. However, the VL model supports multimodal inputs, so this is a tradeoff not a pure regression. / https://huggingface.co/Qwen/Qwen3-VL-Embedding-8B / 2026-10-07 / primary

## Gaps

- **No published text-only param split for Qwen3-VL-Embedding, GME, jina-embeddings-v4, or LLaVE.** All text-only param counts in this report are computed from config files or estimated from architecture knowledge, not from official publications.
- **No MTEB scores for BGE-VL, VLM2Vec, LLaVE, NeoMME, or BidirLM-Omni on text-only English/multilingual benchmarks.** These models are evaluated on multimodal benchmarks (MMEB, CIRCO, ViDoRe) not text-only MTEB.
- **No CPU latency/throughput benchmarks published for any multimodal embedding model on the target hardware (i5-1135G7).** CPU feasibility is inferred from parameter count and size, not from published measurements.
- **voyage-multimodal-3 and Cohere embed-v4.0 are API-only.** No weights, no param counts, no architecture details. Cannot be evaluated for local CPU deployment.
- **NeoMME and BidirLM-Omni are very recent (2026).** No MTEB scores, no community benchmarks, no CPU performance data yet.
- **EmbeddingGemma is not multimodal.** It is included in this angle because it was listed as a candidate, but it is a pure text model. There is no vision tower to separate.
