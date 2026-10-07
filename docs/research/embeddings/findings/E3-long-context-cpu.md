# E3 — Long-Context Embeddings + CPU Inference Reality (merged cluster)

Merged from two worker findings files:
- `docs/research/embeddings/findings/F3-long-context.md` (Angle 3) — 25 sources
- `docs/research/embeddings/findings/F5-cpu-inference.md` (Angle 5) — 29 sources

Merge rule applied: every claim below traces to one of those two files. No independent search
was performed by the merger. All fetch dates are 2026-10-07 (both workers ran 2026-10-07).
Confidence labels are the workers' own, except where this merge explicitly downgrades provenance
(see §Conflicting evidence items 7–8).

## Angle

**Angle 3 — Long-context embeddings.** The room log and its compressed tree summaries are long
documents. Which embedding models keep retrieval quality past 512 tokens? Max context length,
quality at various context lengths, benchmark scores for long-document retrieval (LongEmbed,
LoCo/LoCoV1, RULER, late chunking).

**Angle 5 — CPU inference reality.** Target hardware Intel i5-1135G7 (4c/8t Tiger Lake), 15 GB RAM,
Iris Xe, no CUDA. Published CPU latency/throughput (ONNX, GGUF/llama.cpp, OpenVINO), memory
footprint at inference, quantization options and their measured quality cost, and which models are
effectively GPU-only.

## Claims

### A. Long-context quality (origin: F3)

**A1. LongEmbed benchmark definition** — 6 retrieval tasks: 4 real (NarrativeQA, QMSum,
2WikiMultihopQA, SummScreenFD) + 2 synthetic (Passkey, Needle). Context range 256–32,768 tokens.
Documents avg 5,582–50,474 words.
Source: https://arxiv.org/html/2404.12096v3 · Fetch 2026-10-07 · **primary**

**A2. LongEmbed Table 2 — 512-context models** (Avg. score %):

| Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
|---|---|---|---|---|---|---|---|---|---|
| E5Base | 110M | 512 | 38.0 | 28.5 | 25.3 | 23.8 | 74.7 | 55.8 | 41.0 |
| E5-RoPEBase | 110M | 512 | 38.5 | 31.5 | 24.6 | 23.2 | 66.6 | 58.8 | 40.5 |
| GTEBase | 110M | 512 | 31.0 | 24.5 | 28.6 | 21.8 | 55.8 | 47.3 | 34.8 |
| BGEBase | 110M | 512 | 18.0 | 25.3 | 25.6 | 22.4 | 60.3 | 51.7 | 33.9 |
| Contriever | 110M | 512 | 38.5 | 29.0 | 26.7 | 25.5 | 73.5 | 47.3 | 40.1 |
| GTRBase | 110M | 512 | 38.5 | 26.3 | 26.5 | 18.3 | 63.7 | 52.2 | 36.5 |

Source: https://arxiv.org/html/2404.12096v3 (Table 2) · Fetch 2026-10-07 · **primary**

**A3. LongEmbed Table 2 — ≥4K-context models** (Avg. score %):

| Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
|---|---|---|---|---|---|---|---|---|---|
| E5-Mistral | 7B | 4,096 | 71.0 | 48.3 | 44.6 | 43.6 | 96.8 | 82.0 | 64.4 |
| Jina-V2 | 137M | 8,192 | 50.3 | 54.5 | 37.9 | 38.9 | 93.5 | 74.0 | 58.2 |
| Nomic-V1 | 137M | 8,192 | 60.7 | 39.5 | 41.2 | 36.7 | 93.0 | 73.8 | 57.5 |
| BGE-M3 | 568M | 8,192 | 59.3 | 40.5 | 45.8 | 35.5 | 94.0 | 78.0 | 58.9 |
| OpenAI-Ada-002 | — | — | 50.8 | 36.8 | 41.1 | 40.0 | 91.8 | 80.1 | 56.8 |

Source: https://arxiv.org/html/2404.12096v3 (Table 2) · Fetch 2026-10-07 · **primary**

**A4. LongEmbed Table 2 — context-extended models** (Avg. score %):

| Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
|---|---|---|---|---|---|---|---|---|---|
| E5Base+Tuning | 110M | 4,096 | 67.3 | 41.5 | 30.4 | 35.7 | 95.2 | 69.2 | 56.6 |
| E5-RoPEBase+SE | 110M | 4,096 | 73.5 | 53.5 | 32.3 | 39.1 | 91.9 | 74.6 | 60.8 |
| E5-Mistral+NTK | 7B | 32,768 | 93.8 | 66.8 | 49.8 | 49.2 | 97.1 | 95.2 | 75.3 |

Source: https://arxiv.org/html/2404.12096v3 (Table 2) · Fetch 2026-10-07 · **primary**

**A5. LongEmbed headline finding** — best model (E5-Mistral+NTK, 32K) reaches only 75.3 avg.
512-context models avg 33.9–41.0; native 8K models avg 56.8–58.9. Context extension
(NTK / SelfExtend) adds +10.9 to +20.3 points to 512-ctx models.
Source: https://arxiv.org/html/2404.12096v3 · Fetch 2026-10-07 · **primary**

**A6. RoPE > APE for context extension** — RoPE-based models (E5-Mistral, E5-RoPEBase) benefit
more from NTK/SelfExtend than APE-based (E5Base, GTEBase).
Source: https://arxiv.org/html/2404.12096v3 · Fetch 2026-10-07 · **primary**

**A7. LoCo benchmark limitation** — E5Base (512 ctx) achieves >85% nDCG on 3/8 LoCo tasks; the
benchmark's biased target-info distribution makes LoCo insufficient for long-context evaluation.
Source: https://arxiv.org/html/2404.12096v3 (Figure 2) · Fetch 2026-10-07 · **primary**

**A8. LongEmbed is in MTEB** since MTEB v1.6.22 (evaluable via the MTEB framework).
Source: https://huggingface.co/papers/2404.12096 · Fetch 2026-10-07 · **primary**

**A9. M2-BERT / LoCoV1** — M2-BERT-32k beats BM25 by 14.8 pts, E5-Mistral (truncation) by 23.3
pts, E5-Mistral (chunked) by 24.4 pts on LoCoV1 → long-context embedding beats chunking+pooling.
Source: https://arxiv.org/html/2402.07440v3 · Fetch 2026-10-07 · **primary**

**A10. Lost in the Middle** (Liu et al., 2023) — U-shaped performance curve; >30% drop when the
relevant information sits mid-context. Stated to apply to embedding models too.
Source: https://cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf · Fetch 2026-10-07 · **primary**

**A11. RULER** (Hsieh et al., 2024, COLM 2024) — 13 synthetic tasks; despite near-perfect NIAH,
almost all 17 tested LLMs degrade sharply as context grows; only half of 32K-claiming models hold
satisfactory performance at 32K.
Source: https://www.alphaxiv.org/abs/2404.06654 · Fetch 2026-10-07 · **primary**

**A12. Late chunking** (Jina AI, arXiv 2409.04701) — embed the full document with a long-context
model, then pool chunk embeddings *after* the transformer; chunk vectors retain full-document
context. Generic across long-context embedders; beats naive chunking on BEIR; gain correlates with
document length.
Source: https://arxiv.org/abs/2409.04701 · Fetch 2026-10-07 · **primary**

**A13. Late chunking tested models** — jina-embeddings-v2-small < nomic-v1 < jina-embeddings-v3.
Late chunking improves all three; sometimes it beats whole-document embedding, sometimes
whole-document is best when chunk ranking is not needed.
Source: https://jina.ai/news/what-late-chunking-really-is-and-what-its-not-part-ii · Fetch 2026-10-07 · **primary**

**A14. jina-embeddings-v3** — 570M params, 8192 tokens, RoPE, 24 layers, FlashAttention2, MRL
(1024→32d), task LoRA adapters, native `late_chunking` parameter (recommended for docs >8192
tokens). Reported "significant improvement" over other models on the 6 LongEmbed tasks, attributed
to RoPE vs BGE-M3 fixed PE and jina-v2 ALiBi.
Sources: https://arxiv.org/html/2409.10173v3 · https://jina.ai/models/jina-embeddings-v3 ·
https://jina.ai/news/jina-embeddings-v3-a-frontier-multilingual-embedding-model · Fetch 2026-10-07 · **primary**

**A15. jina-embeddings-v2-base-en** — 137M params, 8192 tokens, ALiBi, BERT-small backbone
(12 layers, 768 hidden).
Source: https://jina.ai/models/jina-embeddings-v2-base-en · Fetch 2026-10-07 · **primary**

**A16. nomic-embed-text-v1.5** — 137M params, claimed 8192 tokens, RoPE + flash-attn, SwiGLU, MRL
(768→64d). **Trained at 2048** sequence length; 8192 is reached by Dynamic NTK interpolation at
inference. At 8191 seq length it underperforms closed-source (Ada-002,
text-embedding-3-small/large) on LoCo tasks; text-embedding-3-large *decreases* from 512→8191.
Source: https://arxiv.org/html/2402.01613v2 · Fetch 2026-10-07 · **primary**

**A17. bge-m3** — 568M params, 8192 tokens, XLM-RoBERTa backbone, MCLS (Multiple CLS) for long
text, dense/sparse/multi-vector. LongEmbed avg 58.9 (see A3). Community discussion suggests
512-token chunks may still be optimal at 8K; MCLS was trained with 96 A100 GPUs.
Sources: https://zilliz.com/ai-models/bge-m3 · https://huggingface.co/BAAI/bge-m3/discussions/59 · Fetch 2026-10-07 · **primary (provenance caveat, see §Conflicting 7)**

**A18. bge-large-en-v1.5** — 512 tokens (BERT-era limit).
Source: https://huggingface.co/BAAI/bge-large-en-v1.5 · Fetch 2026-10-07 · **primary**

**A19. gte-Qwen2 series** — 32K context. 1.5B-instruct: 1536d; 7B-instruct: 3584d.
Source: https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct · Fetch 2026-10-07 · **primary**

**A20. gte-multilingual-base** — 305M params, 8192 tokens, 768d, 70+ languages.
Source: https://www.kaggle.com/refs/hf-model/Alibaba-NLP/gte-multilingual-base · Fetch 2026-10-07 · **primary (provenance caveat, see §Conflicting 7)**

**A21. Qwen3-Embedding series** — 32K context; 0.6B (28 layers, 1024d), 4B (36 layers, 2560d),
8B (36 layers, 4096d); MRL + instruction-aware. Published MTEB scores:

| Model | MTEB(eng,v2) | MMTEB | MTEB-R | MTEB-R(en) | MTEB-R(multi) | MTEB-P(code) | MTEB-P(en) | MTEB-P(multi) | MTEB-S(eng) | MTEB-S(multi) |
|---|---|---|---|---|---|---|---|---|---|---|
| 0.6B | 70.70 | 64.88 | 85.76 | 54.05 | 84.37 | 48.18 | 61.83 | 86.57 | 33.43 |
| 4B | 74.60 | 68.10 | 89.84 | 57.51 | 87.01 | 50.76 | 68.46 | 88.72 | 34.39 |
| 8B | 75.22 | 68.71 | 90.43 | 58.57 | 87.52 | 51.56 | 69.44 | 88.58 | 34.83 |

Source: https://github.com/QwenLM/Qwen3-Embedding · Fetch 2026-10-07 · **primary**

**A22. stella_en_1.5B_v5** — 1.5B params, **512 base context** (trained at max_length=512).
MRL dims 512/768/1024/2048/4096/6144/8192 (output dims, not input context). 1024d recommended.
Source: https://huggingface.co/NovaSearch/stella_en_1.5B_v5 · Fetch 2026-10-07 · **primary**

**A23. snowflake-arctic-embed** — 512 ctx standard; m-long variant 2048 without RPE, 8192 with
RPE; v2.0 multilingual 8192 tokens.
Source: https://huggingface.co/Snowflake/snowflake-arctic-embed-m · Fetch 2026-10-07 · **primary**

**A24. mxbai-embed-large-v1** — 512 tokens (BERT-era).
Source: https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1 · Fetch 2026-10-07 · **primary**

**A25. EmbeddingGemma** — 308M params, 2048 tokens max, 768d, 100+ languages, built from the
Gemma 3 encoder. Evaluated at 512 for most tasks, 1024/2048 for LongEmbed Passkey; no degradation
reported at 2048.
Source: https://arxiv.org/pdf/2509.20354 · Fetch 2026-10-07 · **primary**

**A26. granite-embedding r2** — english-r2 149M/768d/8192 tokens; small-english-r2 47M/384d/8192;
multilingual r2 97M/311M at 32,768 tokens.
Source: https://huggingface.co/ibm-granite/granite-embedding-english-r2 · Fetch 2026-10-07 · **primary**

**A27. Granite multilingual r2 context scaling** — performance improves monotonically with context:

| Model | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768 |
|---|---|---|---|---|---|---|---|
| gte-multilingual-base (max 8192) | 38.2 | 43.6 | 49.7 | 59.1 | 62.1 | — | — |
| granite-97m-multilingual-r2 | 39.1 | 46.4 | 52.9 | 59.0 | 62.9 | 64.3 | 65.5 |
| granite-311m-multilingual-r2 | 40.3 | 47.7 | 54.1 | 61.3 | 67.1 | 70.7 | 71.7 |

Source: https://arxiv.org/html/2605.13521v2 (Appendix D) · Fetch 2026-10-07 · **primary**

**A28. KaLM-Embedding-V2** — 512 tokens max input, 896d, MRL (896/512/256/128/64); V2.5 494M.
Source: https://arxiv.org/html/2506.20923v3 · Fetch 2026-10-07 · **primary**

**A29. LFM2.5-Embedding-350M** — 512 tokens per input (longer text must be split), 350M params.
Source: https://openrouter.ai/liquid/lfm-2.5-embedding-350m:free · Fetch 2026-10-07 · **primary (provenance caveat, see §Conflicting 7)**

**A30. e5 / multilingual-e5** — 512 tokens (BERT-era limit for base/large).
Source: https://huggingface.co/intfloat/e5-base-v2 · Fetch 2026-10-07 · **primary**

**A31. SFR-Embedding** — 512/4096 context (Mistral-based: 4096); SFR-Embedding-Mistral was MTEB #1
as of Feb 2024. Newer SFR-Embedding-2_R / Code context lengths unverified.
Source: https://www.salesforce.com/blog/sfr-embedding · Fetch 2026-10-07 · **primary**

**A32. voyage-3** — 32K tokens, 1024d, Matryoshka (2048/1024/512/256); claims +9.74% avg over
OpenAI-v3-large across 100 datasets. API-only.
Source: https://blog.voyageai.com/2025/01/07/voyage-3-large · Fetch 2026-10-07 · **primary**

**A33. Cohere embed v3/v4** — embed-multilingual-v3.0 = 512 tokens; embed v4 = 128K tokens, 1536d,
multimodal; Embed 5 = 128K, 2048d max. API-only.
Source: https://docs.cohere.com/docs/cohere-embed · Fetch 2026-10-07 · **primary**

### B. CPU inference reality (origin: F5)

**B1. Published CPU latency/throughput benchmarks** (hardware noted per row):

| Model | Hardware | Backend | SeqLen | Metric | Value | Source | Conf |
|---|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 (22.7M) | i7-13700K (16c/24t) | torch-fp32 | 256 | throughput | baseline 1x | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | primary |
| all-MiniLM-L6-v2 | i7-13700K | openvino-qint8 | 256 | speedup | ~2.5–3.5x | sbert.net | primary |
| all-MiniLM-L6-v2 | i7-13700K | onnx-qint8 (avx512_vnni) | 256 | speedup | ~2–3x | sbert.net | primary |
| all-MiniLM-L6-v2 | i7-13700K | llamacpp-Q4_K_M | 256 | speedup | ~2–4x | sbert.net | primary |
| bge-base-en-v1.5 (109M) | i7-13700K | torch-fp32 | 512 | throughput | baseline 1x | sbert.net | primary |
| bge-base-en-v1.5 | i7-13700K | openvino-qint8 | 512 | speedup | ~2.5–3.5x | sbert.net | primary |
| bge-base-en-v1.5 | i7-13700K | onnx-qint8 | 512 | speedup | ~2–3x | sbert.net | primary |
| mxbai-embed-large-v1 (335M) | i7-13700K | torch-fp32 | 512 | throughput | baseline 1x | sbert.net | primary |
| mxbai-embed-large-v1 | i7-13700K | openvino-qint8 | 512 | speedup | ~2–3x | sbert.net | primary |
| mxbai-embed-large-v1 | i7-13700K | onnx-qint8 | 512 | speedup | ~2–3x | sbert.net | primary |
| bge-m3 (567M) | i7-13700K | torch-fp32 | 8192 | throughput | baseline 1x | sbert.net | primary |
| bge-m3 | i7-13700K | openvino-qint8 | 8192 | speedup | ~2–3x | sbert.net | primary |
| bge-m3 | i7-13700K | onnx-qint8 | 8192 | speedup | ~2–3x | sbert.net | primary |
| bge-m3 | i7-13700K | llamacpp-Q4_K_M | 8192 | speedup | ~2–4x | sbert.net | primary |
| all-MiniLM-L6-v2 | HF cpu-upgrade (cloud) | llamacpp-Q4_K_M | 256 | speedup | leads over openvino-qint8 | sbert.net | primary |
| all-MiniLM-L6-v2 | Xeon E5-2620 v2 (12 logical) | ONNX Runtime | — | speedup | up to 17x (transformer models) | [medium.com/microsoft](https://medium.com/microsoft/accelerate-your-nlp-pipelines-using-hugging-face-transformers-and-onnx-runtime-2443578f4333) | primary |
| all-MiniLM-L6-v2 | 16-core server | ONNX Runtime (Manticore) | 256 | docs/sec | 70–230 | [manticoresearch.com](https://manticoresearch.com/blog/onnx-embeddings-speedup) | primary |
| all-MiniLM-L6-v2 | 16-core server | ONNX Runtime | 256 | single-insert latency | ~14 ms | manticoresearch.com | primary |
| all-MiniLM-L6-v2 | 16-core server | ONNX Runtime | 256 | latency @8 concurrent | ~56 ms | manticoresearch.com | primary |
| EmbeddingGemma-300M | CPU (model unspecified) | Mixed Precision (e4_a8_f4_p4) | 256 | init time | 17.6 ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 256 | inference | 66 ms | litert-community | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 512 | inference | 169 ms | litert-community | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1024 | inference | 549 ms | litert-community | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 2048 | inference | 2455 ms | litert-community | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 256 | RSS | 110 MB | litert-community | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 2048 | RSS | 196 MB | litert-community | primary |
| e5-small-v2 | Graviton3 (ARM) | INT8 | 512 | query inference | 2.5 ms | [blog.vespa.ai](https://blog.vespa.ai/embedding-tradeoffs-quantified) | secondary |
| bge-large-en-v1.5 | Graviton3 | INT8 | 512 | speedup | 2.7–3.4x vs fp32 | blog.vespa.ai | secondary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | float32 | 512 | retrieval speed | baseline 1x | [HF blog](https://huggingface.co/blog/embedding-quantization) | primary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | int8 | 512 | retrieval speed | 3.66x avg | HF blog | primary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | binary | 512 | retrieval speed | 24.76x avg | HF blog | primary |
| nomic-embed-text-v1.5 | CPU (unspecified) | F16 GGUF | 2048 | model size | 274 MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-nomic-embed-text/37026) | secondary |
| nomic-embed-text-v1.5 | CPU (unspecified) | Q8_0 GGUF | 2048 | model size | 146 MB | discuss.4d.com | secondary |
| Qwen3-Embedding-0.6B | L4 **GPU** | — | 32768 | latency p50 | 157 ms | [superlinked.com](https://superlinked.com/blog/qwen3-embedding-reranker-guide) | secondary |
| Qwen3-Embedding-0.6B | L4 GPU | — | 32768 | throughput | 12.3K tok/s | superlinked.com | secondary |
| Qwen3-Embedding-4B | L4 GPU | — | 32768 | latency p50 | 464 ms | superlinked.com | secondary |
| gte-Qwen2-1.5B | L4 GPU | — | 32768 | latency p50 | 261 ms | [superlinked.com](https://superlinked.com/models/alibaba-nlp-gte-qwen2-1-5b-instruct) | secondary |
| gte-Qwen2-1.5B | L4 GPU | — | 32768 | throughput | 12.3K tok/s | superlinked.com | secondary |

Hardware note (F5): i7-13700K is a 16c/24t desktop, materially faster than i5-1135G7 (4c/8t
laptop); F5 *estimated* ~3–5x slower throughput on the i5 (estimate — see §Conflicting 8). L4 rows
are GPU-only reference, not applicable to the CPU target. Graviton3 is ARM server.

**B2. fastembed shipped models** — 24 quantized ONNX text models, 0.067–2.24 GB:

| Model | Dim | Size (GB) |
|---|---|---|
| BAAI/bge-small-en-v1.5 | 384 | 0.067 |
| BAAI/bge-small-zh-v1.5 | 512 | 0.090 |
| snowflake/snowflake-arctic-embed-xs | 384 | 0.090 |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | 0.090 |
| jinaai/jina-embeddings-v2-small-en | 512 | 0.120 |
| BAAI/bge-small-en | 384 | 0.130 |
| snowflake/snowflake-arctic-embed-s | 384 | 0.130 |
| nomic-ai/nomic-embed-text-v1.5-Q | 768 | 0.130 |
| BAAI/bge-base-en-v1.5 | 768 | 0.210 |
| sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 | 384 | 0.220 |
| Qdrant/clip-ViT-B-32-text | 512 | 0.250 |
| jinaai/jina-embeddings-v2-base-de | 768 | 0.320 |
| BAAI/bge-base-en | 768 | 0.420 |
| snowflake/snowflake-arctic-embed-m | 768 | 0.430 |
| nomic-ai/nomic-embed-text-v1.5 | 768 | 0.520 |
| jinaai/jina-embeddings-v2-base-en | 768 | 0.520 |
| nomic-ai/nomic-embed-text-v1 | 768 | 0.520 |
| snowflake/snowflake-arctic-embed-m-long | 768 | 0.540 |
| mixedbread-ai/mxbai-embed-large-v1 | 1024 | 0.640 |
| jinaai/jina-embeddings-v2-base-code | 768 | 0.640 |
| sentence-transformers/paraphrase-multilingual-mpnet-base-v2 | 768 | 1.000 |
| snowflake/snowflake-arctic-embed-l | 1024 | 1.020 |
| thenlper/gte-large | 1024 | 1.200 |
| BAAI/bge-large-en-v1.5 | 1024 | 1.200 |
| intfloat/multilingual-e5-large | 1024 | 2.240 |

Source: https://qdrant.github.io/fastembed/examples/Supported_Models · Fetch 2026-10-07 · **primary**

**B3. fastembed operational facts** — all shipped models are quantized for CPU/Intel; default model
is BAAI/bge-small-en-v1.5 (384d, 0.067 GB); custom model registration accepts alternate
quantization levels (e.g. `onnx/model_O4.onnx`); backend is ONNX Runtime with CPUExecutionProvider.
Sources: https://qdrant.tech/articles/fastembed · https://github.com/qdrant/fastembed ·
https://qdrant.tech/documentation/fastembed · Fetch 2026-10-07 · **primary**
(omp uses fastembed + onnxruntime-node — repo brief, not a worker claim.)

**B4. Model memory footprint (shipped quantized sizes)** — actual quantized ONNX/GGUF sizes where
published: bge-small-en-v1.5 0.067 GB; bge-base-en-v1.5 0.210 GB; bge-large-en-v1.5 1.200 GB;
mxbai-embed-large-v1 0.640 GB; jina-embeddings-v2-base-en 0.520 GB;
snowflake-arctic-embed-m-long 0.540 GB; nomic-embed-text-v1.5 0.520 GB (Q8_0 GGUF 146 MB /
F16 GGUF 274 MB); multilingual-e5-large 2.240 GB; bge-m3 ~2.27 GB fp32 (model card);
EmbeddingGemma-300M sub-200 MB with quantization (Google blog), 196 MB RSS at 2048 per litert
benchmark; Qwen3-Embedding-0.6B 639 MB (ollama); KaLM-Embedding-Gemma3-12B 24 GB F16 (ollama).
Sources: https://qdrant.github.io/fastembed/examples/Supported_Models ·
https://huggingface.co/BAAI/bge-m3 · https://developers.googleblog.com/en/introducing-embeddinggemma ·
https://huggingface.co/litert-community/embeddinggemma-300m · https://ollama.com/library/qwen3-embedding:0.6b ·
https://ollama.com/frob/KaLM-Embedding-Gemma3-12B-2511:latest · Fetch 2026-10-07 · **primary**
(F5 also tabulated fp32/fp16/int8/q4 sizes **derived from parameter count**; those are arithmetic
estimates, not published measurements — see §Conflicting 8.)

**B5. Quantization quality cost — measured** (HF blog, MTEB retrieval nDCG@10):

| Model | fp32 | int8 | % fp32 | binary | % fp32 |
|---|---|---|---|---|---|
| mxbai-embed-large-v1 | 54.39 | 52.79 | 97% | 52.46 | 96.45% |
| e5-base-v2 | 50.77 | 47.54 | 94.68% | 37.96 | 74.77% |
| nomic-embed-text-v1.5 | 53.01 | — | — | 46.49 | 87.7% |
| all-MiniLM-L6-v2 | 41.66 | 37.82 | 90.79% | 39.07 | 93.79% |
| Cohere-embed-english-v3.0 | 55.0 | 55.0 | 100% | 52.3 | 94.6% |

Summary from the same source: int8 = 4x memory saving, up to 4x retrieval speed, ~99.3% of default
performance; binary = 32x memory, up to 45x speed, ~96% of default. int8 + rescoring recovers ~99%.
Source: https://huggingface.co/blog/embedding-quantization · Fetch 2026-10-07 · **primary**
**Key nuance:** quant cost is model-specific — e5-base-v2 binary loses 25 pts (74.77%), while
mxbai binary loses only 3.55 pts (96.45%).

**B6. Weight quantization backends** — ONNX dynamic int8: no calibration set, ~2–3x CPU speedup.
OpenVINO static int8: calibration set required, ~2.5–3.5x CPU speedup. OpenVINO INT8 performs best
on the local i7-13700K; llama.cpp leads on the cloud instance tested. Quality ratio for
OpenVINO/ONNX INT8 ~0.95–1.0 vs fp32 (read from sbert.net quality bars).
Source: https://sbert.net/docs/sentence_transformer/usage/efficiency.html · Fetch 2026-10-07 · **primary**

**B7. EmbeddingGemma quantization** — QAT with int4 for embeddings/FFN/projections and int8 for
attention (e4_a8_f4_p4); sub-200 MB RAM; performance "persists at 4-bit precision".
Sources: https://huggingface.co/litert-community/embeddinggemma-300m · https://developers.googleblog.com/en/introducing-embeddinggemma · https://arxiv.org/pdf/2509.20354 · Fetch 2026-10-07 · **primary**

**B8. Effectively GPU-only / impractical on 15 GB CPU**:
- **jina-embeddings-v3** — model card: "The model requires CUDA-capable GPU for production
  throughput"; architecture uses FlashAttention2.
  Source: https://jina.ai/models/jina-embeddings-v3 · Fetch 2026-10-07 · **primary**
- **Qwen3-Embedding-8B** — 8B params → ~32 GB fp32 / 16 GB fp16 / 8 GB int8 / 4 GB q4; impractical
  on 15 GB RAM. **Qwen3-Embedding-4B** — 4B → 16/8/4/2 GB; borderline.
  Source: https://github.com/QwenLM/Qwen3-Embedding · Fetch 2026-10-07 · **primary**
- **gte-Qwen2-7B** — 7B → 28/14/7/3.5 GB; impractical.
  Source: https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct · Fetch 2026-10-07 · **primary**
- **KaLM-Embedding-Gemma3-12B** — 11.8B → 47 GB fp32 / 24 GB F16; impossible.
  Source: https://ollama.com/frob/KaLM-Embedding-Gemma3-12B-2511:latest · Fetch 2026-10-07 · **primary**
- **bge-m3** — labelled "GPU only" in the sbert.net CPU benchmark section, but the same page
  benchmarks bge-m3 with openvino-qint8 / onnx-qint8 / llamacpp-Q4_K_M (see B1). Contradiction
  recorded in §Conflicting 2.
  Source: https://sbert.net/docs/sentence_transformer/usage/efficiency.html · Fetch 2026-10-07 · **primary**

**B9. CPU feasibility tiers (F5's own, with estimates marked)** — F5 ranked small (≤150M) as
~50–200 sentences/sec, medium (150–500M) ~10–50, large (500M–1.5B) ~5–20, XL (>1.5B) ~1–5, all
explicitly *estimated* by scaling i7-13700K numbers 3–5x down. RAM footprints: small 20–300 MB,
medium 100 MB–1.5 GB, large 500 MB–3 GB, XL 2–12 GB (q4).
Origin: F5 §6 · Confidence: **speculative** (no published 4-core-laptop benchmark exists; see §Gaps 1).

## Searches

From F3 (20 queries):
"LongEmbed arXiv 2404.12096 long context embedding benchmark"; "jina-embeddings-v3 max context
length 8192 ALiBi"; "nomic-embed-text-v1.5 8192 context length rotary flash attention"; "bge-m3
embedding 8192 context length BAAI model card"; "gte-Qwen2 gte-multilingual 32K 8192 context length
embedding"; "Qwen3-Embedding 32K context length 0.6B 4B 8B"; "stella_en_1.5B_v5 512 32K context
embedding"; "snowflake-arctic-embed mxbai-embed-large-v1 512 context length"; "EmbeddingGemma 2048
context length Gemma embedding model"; "granite-embedding 512 8192 context length IBM r2";
"KaLM-embedding LFM2-embedding context length max tokens"; "SFR-Embedding voyage-3 cohere embed v3
v4 context length 512 4096 32K 128K"; "LoCoV1 long context retrieval benchmark embedding models
results"; "late chunking jina embeddings long context arXiv 2409.10173"; "RULER benchmark long
context embedding retrieval evaluation"; "jina-embeddings-v3 late chunking results benchmark
retrieval improvement"; "BGE-M3 8K degradation long context retrieval quality loss"; "Lost in the
Middle embedding models long context positional bias retrieval"; "MTEB long context retrieval
benchmark LongEmbed subset evaluation"; "nomic-embed-text-v1.5 8192 degradation performance long
context".

From F5 (16 queries):
"ONNX Runtime CPU embedding model benchmark latency throughput sentence-transformers"; "fastembed
supported models list ONNX quantization qdrant"; "OpenVINO embedding model CPU benchmark
optimum-intel sentence-transformers"; "embedding quantization quality cost int8 q4 retrieval score
delta MTEB benchmark"; "llama.cpp embedding model CPU benchmark tokens per second GGUF"; "bge-m3
model size parameters CPU inference memory footprint"; "EmbeddingGemma 300M model card CPU inference
size quantization"; "Qwen3-Embedding-0.6B model card CPU inference requirements size";
"jina-embeddings-v3 model card CPU requirements flash attention"; "granite-embedding-107m 278m model
card IBM parameters size"; "snowflake-arctic-embed-m-l-v2 model card parameters size CPU"; "LFM2
embedding model HuggingFace size parameters"; "gte-Qwen2-1.5B 7B embedding model card size
parameters"; "KaLM embedding model Gemma3 parameters size HuggingFace"; "nomic-embed-text-v1.5 model
size parameters CPU inference"; "e5-small e5-base e5-large model size parameters dimensions".

## Conflicting evidence

**1. Long-context quality winner (F3) vs CPU feasibility gate (F5) — jina-embeddings-v3.**
F3: jina-v3 is the strongest long-context model tested, 8192 native RoPE, best late-chunking
results (A13, A14). F5: jina-v3's own model card states it "requires CUDA-capable GPU for
production throughput" and it needs FlashAttention2 (B8). **Both survive; conditions differ.**
For this cluster's CPU-only target the F5 feasibility gate wins: a model that cannot hit production
throughput on CPU is out regardless of LongEmbed quality. jina-v3 remains the quality reference
point, not a candidate.

**2. bge-m3 CPU capability — internal contradiction inside F5.**
sbert.net labels bge-m3 "GPU only" in its CPU benchmark section, yet the same page supplies
bge-m3 CPU benchmark rows (openvino-qint8 / onnx-qint8 / llamacpp-Q4_K_M at 8192, B1). F5 judged
the "GPU only" label a testing-scope limitation rather than a hardware requirement. **Unresolved.**
Winner: neither cleanly — the same source cannot be both. Lean F5's reading (scope label), but mark
bge-m3 CPU throughput as unverified pending a dedicated CPU benchmark.

**3. nomic-embed-text-v1.5 claimed 8192 vs effective context.**
Model card / general listing claims 8192; the technical report (arXiv 2402.01613v2) states training
at 2048 with Dynamic NTK interpolation to reach 8192, and shows underperformance vs closed-source at
8191. **Winner: the technical report** — primary arXiv paper beats a model-card claim; NTK
interpolation is extrapolation, not native long-context training. Treat nomic's effective context as
~2048.

**4. stella MRL dims (8192) vs input context (512).**
The model card lists MRL projection dims up to 8192, which can read as 8192-token context; training
detail and community reports fix input context at 512 (A22, F3 conflict 1). **Winner: 512 input
context** — MRL dims are *output embedding dimensions*, a different quantity from input context.
Definition confusion, not a genuine disagreement.

**5. EmbeddingGemma 2048: "no degradation" (F3) vs 2455 ms at 2048 (F5).**
F3: the EmbeddingGemma paper reports no quality degradation at 2048. F5: litert benchmark shows
66 ms @256 → 2455 ms @2048 (≈37x latency for 8x tokens). **Both survive; different axes** (quality
vs latency). The latency curve is roughly superlinear and makes 2048-token embedding of long docs
expensive on CPU. F5 also notes the benchmark hardware is unspecified and the e4_a8_f4_p4 format is
LiteRT-specific, so the x86/ONNX figure is unverified (F5 conflict 4).

**6. OpenVINO vs llama.cpp CPU ranking — internal to F5.**
sbert.net: OpenVINO INT8 best on the local i7-13700K; llama.cpp best on the cloud instance tested.
Ranking is hardware-dependent; the i5-1135G7 is neither. **Unresolved** — must be measured locally
if it matters.

**7. Provenance downgrades applied by this merge (F3).** F3 tagged several third-party directory /
mirror / router pages as `primary`: `zilliz.com/ai-models/bge-m3` (A17),
`kaggle.com/refs/hf-model/...` (A20), `openrouter.ai/...` (A29). These are vendor directories, not
the model authors' own cards. The underlying facts are corroborated elsewhere in F3 (bge-m3 8192/
568M also in A3 and B4), but the provenance label is wrong. **Merge verdict: treat those three as
`secondary`-in-practice.** No re-fetch performed (merger does not search).

**8. Derived and estimated numbers flagged as primary (F5).** F5's memory-footprint table computes
fp32/fp16/int8/q4 sizes from parameter count and sources them to model cards (labelled `primary`);
its feasibility tiers (B9) are scaled estimates. Both violate the cluster's "never estimate"
constraint and are marked **speculative/derived** by this merge. The honest surviving fact is the
gap itself: no published 4-core-laptop CPU benchmark exists (see §Gaps 1).

## Gaps

Union of F3 and F5 gaps; no gap was closed by merging (both angles are published-data-limited).

Long-context (F3):
1. No published jina-v3 per-context-length breakdown (512/1K/2K/4K/8K) — only aggregate LongEmbed
   "significant improvement".
2. No head-to-head CPU benchmark for any long-context embedding model (all LongEmbed/LoCo results
   are GPU-based).
3. No published late-chunking results for Qwen3-Embedding or gte-Qwen2 (late-chunking paper tests
   only jina-v2-small, nomic-v1, jina-v3).
4. No MTEB long-context subset scores for Qwen3-Embedding at 32K (paper reports MTEB but not
   broken down by context length).
5. No EmbeddingGemma 2048 vs chunking comparison.
6. SFR-Embedding-2_R / Code context lengths unverified.
7. Voyage-3 32K per-context breakdown absent (API-only, no self-hosting).
8. Cohere embed v4 128K text-only evaluation not published.
9. BGE-M3 8K vs 512-chunking: no definitive published comparison (F3 conflict 3).

CPU inference (F5):
10. **No official i5-1135G7 (4c/8t laptop) CPU benchmark exists for any embedding model.** All CPU
    data is i7-13700K (16c/24t desktop), Xeon E5-2620 v2, Graviton3 (ARM), or unspecified CPU.
    This is the single largest gap for this cluster's target hardware.
11. No published CPU latency/throughput for: bge-m3, Qwen3-Embedding-0.6B, gte-Qwen2-1.5B,
    KaLM-Embedding-Gemma3-12B, LFM2.5-Encoder/Embedding-350M, granite-embedding-107m/278m,
    snowflake-arctic-embed-l-v2.0, jina-embeddings-v3 (CUDA required for production),
    EmbeddingGemma-300M on x86.
12. No published int8-vs-fp32 quality delta for bge-small/base/large-en-v1.5, snowflake-arctic-embed,
    granite-embedding, Qwen3-Embedding, gte-Qwen2, KaLM, LFM2 (HF blog tested only mxbai,
    e5-base-v2, nomic, all-MiniLM-L6-v2, Cohere-v3).
13. No exact ONNX / OpenVINO / llama.cpp GGUF quantization quality deltas for retrieval — sbert.net
    shows quality bars only; exact numbers were not extractable.
14. fastembed's exact quantization level (int8 vs int4) per shipped model is not documented.

## Cluster verdict

1. Long-context quality past 512 is real but **concentrated in models the CPU target cannot run**:
   the LongEmbed leaders (E5-Mistral 7B 64.4, E5-Mistral+NTK 32K 75.3, jina-v3) need CUDA, flash-attn
   or >15 GB; jina-v3's own card says CUDA is required for production throughput.
2. The **CPU-feasible long-context survivors** are small/medium 8K models: jina-embeddings-v2-base-en
   (137M, 8K, LongEmbed avg 58.2, fastembed 0.52 GB), bge-m3 (568M, 8K, avg 58.9), granite-embedding-
   english-r2 (149M, 8K), snowflake-arctic-embed-m-long (137M, 0.54 GB); nomic-embed-text-v1.5 (137M)
   only counts as ~2048 effective (NTK extrapolation).
3. 512-token models average 34–41 on LongEmbed versus 57–59 for native 8K — so a 512-ctx model
   **mandates chunking**, and chunking+pooling loses to true long-context embedding (M2-BERT/LoCoV1,
   +14.8 over BM25).
4. CPU numbers must be read with a discount: **no 4-core-laptop benchmark exists**; published CPU
   data is 16c desktop or server. INT8 is cheap on quality (~97–99% of fp32, model-dependent —
   e5-base binary drops to 74.8%), and quantization quality must be checked per model, not assumed.
5. Practical conclusion: the defensible CPU path is a fastembed-shipped, INT8-quantized small/medium
   model (≤500M) — everything >1.5B (Qwen3-Embedding-4B/8B, gte-Qwen2-7B, KaLM-12B) is effectively
   GPU-only on this host.
