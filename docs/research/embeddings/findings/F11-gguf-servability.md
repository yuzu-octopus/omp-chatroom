# F11 — CPU-servable build availability (the Path-3 gate)

All fetches on **2026-10-07** unless stated. "Path-3" = a model is servable locally behind an
OpenAI-compatible `POST /v1/embeddings` **without patching the host**, because a GGUF (llama.cpp),
ONNX (fastembed / optimum / Infinity), or TEI-compatible build exists.

Method note: every GGUF below was verified by **parsing the actual GGUF header bytes** (HTTP Range
request on `resolve/main/<file>.gguf`, reading `general.architecture`, `<arch>.pooling_type`,
`<arch>.attention.causal`). This is direct evidence, not repo description. `pooling_type` codes:
`0=none 1=mean 2=cls 3=last 4=rank` (`include/llama.h`, enum `llama_pooling_type`).

## Angle

For each candidate embedding model, establish (a) GGUF repo + quant levels, (b) ONNX build,
(c) Ollama library membership, (d) TEI / Infinity / vLLM support, (e) llama.cpp architecture
support at the current `master`, and (f) a Path-3 verdict. Verified against primary sources:
the llama.cpp source tree, the TEI source tree + HF docs, the vLLM docs, the Ollama registry API
(`registry.ollama.ai`) and `ollama.com/library`, and the fastembed source tree (main + `v0.8.1` tag).

## Claims

### Infrastructure claims (the gate itself)

| # | Claim | Source URL | Fetch date | Confidence |
|---|---|---|---|---|
| I1 | `llama-server` exposes `POST /embedding` (legacy), `POST /embeddings`, and `POST /v1/embeddings` (OpenAI-compatible); `--embedding`/`--embeddings` restricts the server to embedding use; `--pooling {none,mean,cls,last,rank}` and `--embd-normalize` (default 2 = L2) control output | https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/server.cpp (routes) + https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md | 2026-10-07 | high |
| I2 | llama.cpp `master` registers 158 architectures; embedding-relevant ones present: `bert`, `modern-bert`, `nomic-bert`, `nomic-bert-moe`, `neo-bert`, `jina-bert-v2`, `jina-bert-v3`, `eurobert`, `gemma-embedding`, `gemma-embedding2`, `qwen3`, `arctic`, `lfm2`, `lfm2moe`, `t5encoder`, `llama-embed`, `pangu-embedded`. **No** `xlmr`, `new`/`gte`, `stella`, `voyage` arch exists | https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp (`LLM_ARCH_NAMES`) + https://raw.githubusercontent.com/ggml-org/llama.cpp/master/gguf-py/gguf/constants.py (`class MODEL_ARCH`, 156 entries) | 2026-10-07 | high |
| I3 | llama.cpp HF converter (`convert_hf_to_gguf.py` → `conversion/`) registers: `BertModel`, `XLMRobertaModel`→BERT arch, `ModernBertModel`, `NomicBertModel`, `JinaBertModel`, `EuroBertModel`+`JinaEmbeddingsV5Model`, `Lfm2Model`/`Lfm2BidirectionalModel`, `Gemma3TextModel`→`EmbeddingGemma`, `EmbeddingGemma2Model`→`EmbeddingGemma2Model`, `Qwen3ForCausalLM`/`Qwen3Model`. **No** converter registers `NewModel`/`GteNew`/`Stella`/`Voyage` (verified by grepping all 98 files in `conversion/`) | https://raw.githubusercontent.com/ggml-org/llama.cpp/master/conversion/bert.py, gemma.py, lfm2.py, qwen.py | 2026-10-07 | high |
| I4 | TEI supports (embeddings) Nomic, BERT, CamemBERT, XLM-RoBERTa (absolute pos), JinaBERT (alibi), Mistral, Alibaba GTE, Qwen2, MPNet, ModernBERT, Qwen3, Gemma3. Source `enum Config` confirms `model_type` keys: `bert`(+jina variants), `deberta-v2`, `camembert`, `distilbert`, `gemma3_text`, `new`(→Gte), `mpnet`, `mistral`, `modernbert`, `nomic_bert`, `qwen2`, `qwen3`, `bidirectional_pplx_qwen3`, `roberta`, `xlm-roberta`, `llama_bidirec`. TEI serves `POST /v1/embeddings` and `/embeddings` | https://huggingface.co/docs/text-embeddings-inference/supported_models + https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/backends/candle/src/lib.rs (`enum Config`) + https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/router/src/http/server.rs | 2026-10-07 | high |
| I5 | TEI explicitly lists as example embedding models: `Qwen/Qwen3-Embedding-8B`, `-4B`, `-0.6B`; `google/embeddinggemma-300m` (gated); `Snowflake/snowflake-arctic-embed-l-v2.0`; `Snowflake/snowflake-arctic-embed-m-v2.0`; `nomic-ai/nomic-embed-text-v1.5`; `sentence-transformers/all-mpnet-base-v2`; `voyageai/voyage-4-nano` (340M, Qwen3); `jinaai/jina-embeddings-v2-base-en` (JinaBERT). CPU image `cpu-1.9` (x86_64) exists | https://huggingface.co/docs/text-embeddings-inference/supported_models | 2026-10-07 | high |
| I6 | vLLM pooling/embed bi-encoder support table lists `BertModel`, `BgeM3EmbeddingModel` (BAAI/bge-m3), `Gemma3TextModel` (google/embeddinggemma-300m), `ModernBertModel`, `NomicBertModel` (nomic-v1.5, arctic-m-long), `Qwen3Model`/`Qwen3ForCausalLM` (Qwen/Qwen3-Embedding-0.6B), `VoyageQwen3BidirectionalEmbedModel` (voyageai/voyage-4-nano), `JinaEmbeddingsV5Model` (jina v5 small+nano), `XLMRobertaModel` (bge-m3, multilingual-e5-base). No LFM2/Gemma4/`new` embedding entry; unlisted archs fall back to `as_embedding_model` auto-conversion | https://docs.vllm.ai/en/latest/models/pooling_models/scoring/ + https://docs.vllm.ai/en/latest/models/pooling_models/embed/ | 2026-10-07 | high |
| I7 | Ollama serves embeddings via `POST /api/embed`; OpenAI-compat `/v1/embeddings` is provided by the Ollama OpenAI layer | https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md (POST /api/embed) | 2026-10-07 | high (api.md); med (the `/v1/embeddings` compat claim — `docs/openai.md` did not resolve on this fetch) |
| I8 | fastembed `main` ships **39** text-embedding model IDs across 6 files (`onnx_embedding.py` 18, `pooled_normalized_embedding.py` 10, `pooled_embedding.py` 6, `last_token_normalized_embedding.py` 2, `builtin_sentence_embedding.py` 2, `multitask_embedding.py` 1). Newest additions (present on `main`, absent from the `v0.8.1` tag): `Qdrant/constella-zero`, `Qdrant/stella-en-400M-v5-doc-onnx`; `Qwen/Qwen3-Embedding-0.6B`(+`-Q`), `google/embeddinggemma-300m`, `ibm-granite/granite-embedding-small-english-r2` are on `main` and in `v0.8.1` | https://raw.githubusercontent.com/qdrant/fastembed/main/fastembed/text/*.py + https://raw.githubusercontent.com/qdrant/fastembed/v0.8.1/fastembed/text/*.py | 2026-10-07 | high |
| I9 | fastembed latest release on PyPI = **0.8.1** (2026-09-22); previous 0.8.0 (2026-03-23), 0.7.4 (2025-12-05) | https://pypi.org/pypi/fastembed/json + https://api.github.com/repos/qdrant/fastembed/releases | 2026-10-07 | high |
| I10 | The **published** fastembed docs page lists only **25** text models and omits Qwen3-Embedding-0.6B, embeddinggemma-300m, granite-embedding-small-english-r2, stella, constella, gte-base, jina-v2-base-zh/es, potion — i.e. it is **stale** vs `main` source | https://qdrant.github.io/fastembed/examples/Supported_Models/ | 2026-10-07 | high |
| I11 | Infinity supports CPU via `--engine torch` (any Sentence-Transformers/AutoModel model) or `--engine optimum` (needs an ONNX file); `latest-cpu` image exists; tested models include BAAI/bge-base-en-v1.5, all-MiniLM-L6-v2, multilingual-e5-large(-instruct), jina-embeddings-v3, BAAI/bge-m3 (no sparse), nomic-embed-text-v1.5, mixedbread-ai/mxbai-embed-large-v1. `--engine ctranslate2` is BERT-only | https://raw.githubusercontent.com/michaelfeil/infinity/main/README.md | 2026-10-07 | high |

### Per-model claims (GGUF arch verified by header parse unless noted)

| # | Claim | Source URL | Fetch date | Confidence |
|---|---|---|---|---|
| C1 | `Qwen/Qwen3-Embedding-0.6B-GGUF` exists (official): files `Qwen3-Embedding-0.6B-Q8_0.gguf`, `Qwen3-Embedding-0.6B-f16.gguf` (2 quants). Parsed header: arch `qwen3`, `pooling_type=3` (last), 310 tensors | https://huggingface.co/api/models/Qwen/Qwen3-Embedding-0.6B-GGUF + header parse of `.../resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf` | 2026-10-07 | high |
| C2 | `Qwen/Qwen3-Embedding-4B-GGUF` and `-8B-GGUF` exist (official), each with `Q4_K_M,Q5_0,Q5_K_M,Q6_K,Q8_0,f16` (6 quants). Parsed: 4B-Q8_0 and 8B-Q8_0 both arch `qwen3`, `pooling_type=3` | https://huggingface.co/api/models/Qwen/Qwen3-Embedding-4B-GGUF, .../Qwen3-Embedding-8B-GGUF + header parse | 2026-10-07 | high |
| C3 | `ggml-org/embeddinggemma-300M-GGUF` exists (official ggml-org), single file `embeddinggemma-300M-Q8_0.gguf`. Card shows the canonical `llama-server -hf ... --embeddings` recipe and `POST /embedding` usage. Parsed: arch `gemma-embedding`, `pooling_type=1` (mean), 316 tensors. Also `ggml-org/embeddinggemma-300m-qat-q8_0-GGUF` and `-qat-q4_0-GGUF` | https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF (README) + header parse | 2026-10-07 | high |
| C4 | `google/embeddinggemma-2` GGUF: `ggml-org/embeddinggemma-2-GGUF` (BF16, Q8_0 + matching mmproj) created 2026-10-06, and `unsloth/embeddinggemma-2-GGUF` (BF16,F16,Q8_0,UD-Q4_K_XL/Q5_K_XL/Q6_K_XL + mmproj). Parsed ggml-org Q8_0: arch `gemma-embedding2`, `pooling_type=1`, 413 tensors. Convert log confirms `EmbeddingGemma2Model` | https://huggingface.co/api/models/ggml-org/embeddinggemma-2-GGUF, unsloth/embeddinggemma-2-GGUF + header parse + convert.log | 2026-10-07 | high |
| C5 | `BAAI/bge-m3` GGUF: `gpustack/bge-m3-GGUF` (FP16,Q2_K,Q3_K,Q4_0,Q4_K_M,Q5_0,Q5_K_M,Q6_K,Q8_0), `ggml-org/bge-m3-Q8_0-GGUF` (official Q8_0), `lm-kit/bge-m3-gguf` (13 quants incl. Q2_K…F16), `cstr/bge-m3-GGUF` (iq4_xs,q4_k,q8_0,f32). Parsed gpustack-Q8_0 and ggml-org-Q8_0: arch `bert`, `pooling_type=2` (cls) | https://huggingface.co/api/models/gpustack/bge-m3-GGUF, ggml-org/bge-m3-Q8_0-GGUF + header parse | 2026-10-07 | high |
| C6 | `BAAI/bge-base-en-v1.5` GGUF: `CompendiumLabs/bge-base-en-v1.5-gguf` (f16,f32,q4_k_m,q8_0), `cstr/`, `mradermacher/`, `nesall/`. Parsed CompendiumLabs q8_0: arch `bert`, `pooling_type=2` | https://huggingface.co/api/models/CompendiumLabs/bge-base-en-v1.5-gguf + header parse | 2026-10-07 | high |
| C7 | `BAAI/bge-small-en-v1.5` GGUF: `unsloth/bge-small-en-v1.5-GGUF` (f16 only), `CompendiumLabs/bge-small-en-v1.5-gguf` (f16,f32,q4_k_m,q8_0), `ggml-org/bge-small-en-v1.5-Q8_0-GGUF`. Parsed unsloth f16: arch `bert`, `pooling_type=2`, 197 tensors | https://huggingface.co/api/models/unsloth/bge-small-en-v1.5-GGUF + header parse | 2026-10-07 | high |
| C8 | `intfloat/multilingual-e5-large` GGUF: `phate334/multilingual-e5-large-gguf` (f16,q4_k_m), `tatsuyaaaaaaa/multilingual-e5-large-gguf` (Q4_0…Q8_0,bf16), `cstr/multilingual-e5-large-GGUF`. **Arch split**: phate334/tatsuyaaaaaaa parse as arch `bert`, `pooling_type=1` (llama.cpp-loadable); `cstr/` parses as arch **`xlmr`** — NOT in llama.cpp's arch list (its card says it targets CrispEmbed, not llama.cpp) | https://huggingface.co/api/models/phate334/multilingual-e5-large-gguf + header parse of phate334 f16, tatsuyaaaaaaa Q8_0, cstr q8_0/q4_k | 2026-10-07 | high |
| C9 | `sentence-transformers/all-MiniLM-L6-v2` GGUF: `leliuga/all-MiniLM-L6-v2-GGUF`, `second-state/All-MiniLM-L6-v2-Embedding-GGUF`. Parsed second-state Q8_0: arch `bert`, `pooling_type=1` (mean) | https://huggingface.co/api/models/second-state/All-MiniLM-L6-v2-Embedding-GGUF + header parse | 2026-10-07 | high |
| C10 | `ibm-granite/granite-embedding-english-r2` GGUF: `mradermacher/granite-embedding-english-r2-GGUF` (IQ4_XS,Q2_K…Q8_0,f16). Parsed Q8_0: arch `modern-bert`, `pooling_type=2`, 134 tensors. (`granite-embedding-small-english-r2` also has `mradermacher/…-GGUF`.) | https://huggingface.co/api/models/mradermacher/granite-embedding-english-r2-GGUF + header parse | 2026-10-07 | high |
| C11 | `ibm-granite/granite-embedding-311m-multilingual-r2` GGUF: `mykor/…-GGUF` (BF16,Q3_K_L,Q4_K_M,Q5_K_M,Q6_K,Q8_0), `cstr/`, `SandLogicTechnologies/`, `fisher046/` etc. Parsed mykor Q8_0: arch `modern-bert`, `pooling_type=2`, 134 tensors | https://huggingface.co/api/models/mykor/granite-embedding-311m-multilingual-r2-GGUF + header parse | 2026-10-07 | high |
| C12 | `Snowflake/snowflake-arctic-embed-l-v2.0` GGUF: `Casual-Autopsy/snowflake-arctic-embed-l-v2.0-gguf` (bf16,f16,f32,iq4_nl,iq4_xs,q4_k_l/m/s,q5_k_l/m/s,q6_k,q6_k_l,q8_0). Parsed q8_0: arch `bert`, `pooling_type=2`, 389 tensors (HF config is `xlm-roberta`, which llama.cpp maps to BERT arch) | https://huggingface.co/api/models/Casual-Autopsy/snowflake-arctic-embed-l-v2.0-gguf + header parse | 2026-10-07 | high |
| C13 | `Snowflake/snowflake-arctic-embed-m-long` GGUF: `mradermacher/…-GGUF` (IQ4_XS,Q2_K…Q8_0,f16), `Volium/…-q8_0.GGUF`. Parsed Volium q8_0: arch `nomic-bert`, `pooling_type=2`, 112 tensors | https://huggingface.co/api/models/Volium/snowflake-arctic-embed-m-long-q8_0.GGUF + header parse | 2026-10-07 | high |
| C14 | `jinaai/jina-embeddings-v2-base-en` GGUF: `second-state/…-GGUF`, `gaianet/…`, `gpustack/…`, `ggml-org/jina-embeddings-v2-base-en-Q8_0-GGUF`. Parsed ggml-org Q8_0: arch `jina-bert-v2`, `pooling_type=1`, 196 tensors | https://huggingface.co/api/models/ggml-org/jina-embeddings-v2-base-en-Q8_0-GGUF + header parse | 2026-10-07 | high |
| C15 | `jinaai/jina-embeddings-v5-text-small` GGUF: **official** `jinaai/jina-embeddings-v5-text-small-retrieval-GGUF` (F16,IQ1_S…Q8_0 = 16 quants) + per-task siblings (`-text-matching-`,`-classification-`,`-clustering-`). Card gives upstream llama.cpp build + `llama-embedding --pooling last`. Parsed Q8_0: arch `qwen3`, `pooling_type=3` | https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-small-retrieval-GGUF + README + header parse | 2026-10-07 | high |
| C16 | `jinaai/jina-embeddings-v5-text-nano` GGUF: **official** `jinaai/jina-embeddings-v5-text-nano-retrieval-GGUF` (F16 + 15 quants). Parsed Q8_0: arch `eurobert`, `pooling_type=3`, `attention.causal=0` | https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-nano-retrieval-GGUF + header parse | 2026-10-07 | high |
| C17 | `NovaSearch/stella_en_400M_v5`: **no usable GGUF**. Only `anuna-mbrown/stella_en_400M_v5_gguf` exists and it is **not** a GGUF (it is a directory of safetensors mislabelled, 0 downloads). HF config is `model_type:"new"` / `architectures:["NewModel"]` with `auto_map` → `trust_remote_code`; llama.cpp has no `new`/`NewModel` arch or converter | https://huggingface.co/api/models/anuna-mbrown/stella_en_400M_v5_gguf + https://huggingface.co/NovaSearch/stella_en_400M_v5/raw/main/config.json + llama.cpp arch list | 2026-10-07 | high |
| C18 | `nomic-ai/nomic-embed-text-v1.5` GGUF: **official** `nomic-ai/nomic-embed-text-v1.5-GGUF` (Q2_K…Q8_0, f16, f32). Parsed Q8_0: arch `nomic-bert`, `pooling_type=1`, 112 tensors | https://huggingface.co/api/models/nomic-ai/nomic-embed-text-v1.5-GGUF + header parse | 2026-10-07 | high |
| C19 | `LiquidAI/LFM2.5-Embedding-350M` GGUF: **official** `LiquidAI/LFM2.5-Embedding-350M-GGUF` (BF16,F16,Q4_0,Q4_K_M,Q5_K_M,Q6_K,Q8_0). Card gives `llama-server -hf … --embeddings` + `POST /v1/embeddings` usage. Parsed Q8_0: arch `lfm2`, `pooling_type=2`, `attention.causal=0`, 148 tensors | https://huggingface.co/api/models/LiquidAI/LFM2.5-Embedding-350M-GGUF + README + header parse | 2026-10-07 | high |
| C20 | `voyageai/voyage-4-nano` GGUF: **community-only** `jsonMartin/voyage-4-nano-gguf` (f16, q8_0 + required `voyage-4-nano-linear.pt` projection to reach the 2048-d output). Parsed q8_0: arch `qwen3`, `pooling_type=1`. Not official (Voyage ships no GGUF) | https://huggingface.co/api/models/jsonMartin/voyage-4-nano-gguf + README + header parse | 2026-10-07 | high |
| C21 | ONNX availability: `Qwen3-Embedding-0.6B` → `onnx-community/Qwen3-Embedding-0.6B-ONNX` (fp32/fp16/int8/q4/q4f16/uint8/bnb4) and `Qdrant/Qwen3-Embedding-0.6B-onnx`; `embeddinggemma-300m` → `onnx-community/embeddinggemma-300m-ONNX` (q4/q4f16/fp16/quantized/no_gather_q4); `embeddinggemma-2` → `onnx-community/embeddinggemma-2-ONNX` (new, ~0 downloads); `bge-m3` → official `onnx/model.onnx` + `onnx-community/bge-m3-ONNX`; `bge-base/small-en-v1.5` → official `onnx/model.onnx`; `multilingual-e5-large` → official ONNX + `Qdrant/multilingual-e5-large-onnx`; `all-MiniLM-L6-v2` → official ONNX (O1–O4, qint8, quint8) + OpenVINO; `granite-embedding-english-r2` → `onnx-community/…-ONNX`; `granite-311m-multilingual-r2` → official ONNX + OpenVINO + `onnx-community/`; `arctic-embed-l-v2.0` → official ONNX (int8/q4/q4f16/fp16/bnb4/uint8); `arctic-embed-m-long` → official ONNX (int8/q4/fp16/…); `jina-v2-base-en` → official `model.onnx` + `model-w-mean-pooling.onnx`; `nomic-embed-text-v1.5` → official ONNX (int8/q4/fp16/…); `voyage-4-nano` → `onnx-community/voyage-4-nano-ONNX`; `LFM2.5-Embedding-350M` → `dsaad68/…-ONNX-int8/fp16` (community) + `litert-community/LFM2.5-Embedding-350M`; `stella_en_400M_v5` → `Qdrant/stella-en-400M-v5-doc-onnx` (doc encoder only); jina v5 small/nano → `cstr/jina-embeddings-v5-text-small-retrieval-onnx-{fp16,int8}`, `opticsWolf/…-onnx-fp16`, `onnx-community/jina-embeddings-v5-omni-nano-ONNX` | HF `/api/models/<repo>` listings for each repo | 2026-10-07 | high |
| C22 | Ollama library (verified via `registry.ollama.ai` manifests + `/library/<name>`): **present** — `nomic-embed-text` (137m-v1.5-fp16, v1.5), `mxbai-embed-large` (335m), `bge-m3` (567m), `snowflake-arctic-embed` (v1: 22m/33m/110m/137m/335m), `snowflake-arctic-embed2` (568m), `all-minilm` (22m/33m), `paraphrase-multilingual` (278m), `bge-large` (335m), `nomic-embed-text-v2-moe`, `granite-embedding` (**v1 30m/278m only**, not r2), `embeddinggemma` (300m), `qwen3-embedding` (0.6b/4b/8b), `embeddinggemma-2` (270m/440m/570m/740m, safetensors + nvfp4, `requires 0.36.0`). **Absent** (404): bge-base, bge-small, granite r2 variants, multilingual-e5-large, jina (any), stella, voyage-4-nano, LFM2.5-Embedding | registry manifest HEAD + `/library/<name>` pages | 2026-10-07 | high |
| C23 | TEI per-model: explicitly listed → Qwen3-Embedding-0.6B/4B/8B ✓, embeddinggemma-300m ✓, arctic-embed-l-v2.0 ✓, nomic-v1.5 ✓, jina-v2-base-en ✓, voyage-4-nano ✓. Arch-supported but not listed → bge-m3 (XLM-R) ✓, bge-base/small-en-v1.5 (BERT) ✓, all-MiniLM-L6-v2 (BERT) ✓, multilingual-e5-large (XLM-R) ✓, granite r2 (ModernBERT) ✓, arctic-embed-m-long (nomic_bert) ✓. **Not supported by TEI**: embeddinggemma-2 (`embedding_gemma2`/Gemma4 — no gemma4 in `enum Config`), jina-v5-text-nano (`eurobert`), LFM2.5-Embedding (`lfm2`). jina-v5-text-small (Qwen3-based) and stella (`new`→Gte) are plausible but unverified | TEI docs + `enum Config` in lib.rs | 2026-10-07 | high (explicit/absent); **low** for jina-v5-small & stella via TEI |
| C24 | fastembed ships (Path-3 out of the box, ONNX): bge-small-en-v1.5, bge-small-zh-v1.5, bge-small-en, bge-base-en-v1.5, bge-base-en, bge-large-en-v1.5, mxbai-embed-large-v1, arctic-embed-xs/s/m/m-long/l, all-MiniLM-L6-v2, jina-embeddings-v2-base-en/small-en/base-de/base-code/base-zh/base-es, gte-base, gte-large, nomic-embed-text-v1.5(+Q)/v1, paraphrase-multilingual-MiniLM-L12/mpnet, multilingual-e5-large, jina-embeddings-v3, **Qwen/Qwen3-Embedding-0.6B(+Q)** (v0.8.1), **google/embeddinggemma-300m** (v0.8.1), **ibm-granite/granite-embedding-small-english-r2** (v0.8.1), jina-clip-v1, potion-*, siglip2, clip-ViT-B-32-text; `main`-only: Qdrant/constella-zero/nano, Qdrant/stella-en-400M-v5-doc-onnx. **Not shipped**: bge-m3, embeddinggemma-2, granite r2 (english/311m), arctic-embed-l-v2.0, jina-v5-*, voyage-4-nano, LFM2.5-Embedding | https://raw.githubusercontent.com/qdrant/fastembed/main/fastembed/text/*.py (and v0.8.1) | 2026-10-07 | high |

## Per-model table

Path-3 verdict: **works today** = drop-in build exists + server path verified (GGUF in llama.cpp, or
ONNX in fastembed/Infinity, or TEI/vLLM arch support). **needs conversion** = no ready build, but the
architecture is llama.cpp-supported so conversion is mechanical. **no CPU build** = no GGUF/ONNX and
arch unsupported.

| Model | GGUF repo id | ONNX build | Ollama | TEI / Infinity / vLLM | llama.cpp-supported arch | Path-3 verdict |
|---|---|---|---|---|---|---|
| Qwen/Qwen3-Embedding-0.6B | `Qwen/Qwen3-Embedding-0.6B-GGUF` (Q8_0,f16) | `onnx-community/…-ONNX`, `Qdrant/…-onnx` | ✓ `qwen3-embedding:0.6b` | TEI ✓ (listed) / Infinity ✓ (torch) / vLLM ✓ | `qwen3` ✓ | **works today** |
| Qwen3-Embedding-4B / -8B | `Qwen/Qwen3-Embedding-{4B,8B}-GGUF` (6 quants) | onnx-community (0.6B only) | ✓ `:4b`,`:8b` | TEI ✓ (listed) / vLLM ✓ | `qwen3` ✓ | **works today** (CPU-slow) |
| google/embeddinggemma-300m | `ggml-org/embeddinggemma-300M-GGUF` (Q8_0); +qat-q8_0/q4_0 | `onnx-community/embeddinggemma-300m-ONNX`; fastembed | ✓ `embeddinggemma:300m` | TEI ✓ (listed, gated) / Infinity ✓ / vLLM ✓ | `gemma-embedding` ✓ | **works today** |
| google/embeddinggemma-2 | `ggml-org/embeddinggemma-2-GGUF` (BF16,Q8_0); `unsloth/…` (6 quants) | `onnx-community/embeddinggemma-2-ONNX` (new) | ✓ `embeddinggemma-2` (270m–740m) | TEI ✗ / Infinity ✓ (torch) / vLLM ✗ | `gemma-embedding2` ✓ | **works today** (llama.cpp/Ollama); TEI+vLLM no |
| BAAI/bge-m3 | `gpustack/bge-m3-GGUF` (9 quants), `ggml-org/bge-m3-Q8_0-GGUF`, `lm-kit/…` | official `onnx/model.onnx`; `onnx-community/bge-m3-ONNX` | ✓ `bge-m3:567m` | TEI ✓ (XLM-R) / Infinity ✓ / vLLM ✓ (`BgeM3EmbeddingModel`) | `bert` ✓ | **works today** |
| BAAI/bge-base-en-v1.5 | `CompendiumLabs/bge-base-en-v1.5-gguf` (4 quants) | official `onnx/model.onnx`; fastembed | ✗ | TEI ✓ / Infinity ✓ / vLLM ✓ | `bert` ✓ | **works today** (already fastembed) |
| BAAI/bge-small-en-v1.5 | `unsloth/…-GGUF`, `CompendiumLabs/…`, `ggml-org/…-Q8_0-GGUF` | official `onnx/model.onnx`; fastembed | ✗ | TEI ✓ / Infinity ✓ / vLLM ✓ | `bert` ✓ | **works today** (already fastembed) |
| intfloat/multilingual-e5-large | `phate334/…-gguf`, `tatsuyaaaaaaa/…-gguf` (bert arch); `cstr/` = arch `xlmr` ⚠ | official ONNX; `Qdrant/multilingual-e5-large-onnx`; fastembed | ✗ | TEI ✓ (XLM-R) / Infinity ✓ / vLLM ✓ | `bert` ✓ (use phate334/tatsuyaaaaaaa, **not** cstr) | **works today** (already fastembed) |
| sentence-transformers/all-MiniLM-L6-v2 | `second-state/…-Embedding-GGUF`, `leliuga/…-GGUF` | official ONNX; fastembed | ✓ `all-minilm:22m/33m` | TEI ✓ / Infinity ✓ / vLLM ✓ | `bert` ✓ | **works today** (already fastembed) |
| ibm-granite/granite-embedding-english-r2 | `mradermacher/…-GGUF` (13 quants) | `onnx-community/…-ONNX` | ✗ (Ollama `granite-embedding` = v1 only) | TEI ✓ (ModernBERT) / Infinity ✓ / vLLM ✓ | `modern-bert` ✓ | **works today** |
| ibm-granite/granite-embedding-311m-multilingual-r2 | `mykor/…-GGUF` (6 quants), `cstr/`, etc. | official ONNX + OpenVINO; `onnx-community/` | ✗ | TEI ✓ (ModernBERT) / vLLM ✓ | `modern-bert` ✓ | **works today** |
| Snowflake/snowflake-arctic-embed-l-v2.0 | `Casual-Autopsy/…-gguf` (15 quants) | official ONNX (10 variants) | ✗ (`-embed2` is the m-v2.0 568m, different) | TEI ✓ (listed) / Infinity ✓ / vLLM ✓ | `bert` ✓ | **works today** |
| Snowflake/snowflake-arctic-embed-m-long | `mradermacher/…-GGUF`, `Volium/…` | official ONNX; fastembed | ✗ | TEI ✓ (nomic_bert) / vLLM ✓ | `nomic-bert` ✓ | **works today** (already fastembed) |
| jinaai/jina-embeddings-v2-base-en | `ggml-org/…-Q8_0-GGUF`, `second-state/…`, `gaianet/…` | official ONNX; fastembed | ✗ | TEI ✓ (listed) / Infinity ✓ / vLLM ✓ | `jina-bert-v2` ✓ | **works today** (already fastembed) |
| jinaai/jina-embeddings-v5-text-small | `jinaai/…-text-small-retrieval-GGUF` (16 quants, official) | `cstr/…-onnx-fp16/int8`, `opticsWolf/…` | ✗ | TEI ~ (Qwen3-based, LoRA-merge caveat) / vLLM ✓ / Infinity ~ | `qwen3` ✓ | **works today** (llama.cpp GGUF, official) |
| jinaai/jina-embeddings-v5-text-nano | `jinaai/…-text-nano-retrieval-GGUF` (16 quants, official) | `onnx-community/jina-embeddings-v5-omni-nano-ONNX` (omni) | ✗ | TEI ✗ / vLLM ✓ / Infinity ~ | `eurobert` ✓ | **works today** (llama.cpp GGUF, official) |
| NovaSearch/stella_en_400M_v5 | ✗ (no real GGUF) | `Qdrant/stella-en-400M-v5-doc-onnx` (doc encoder only, research preview) | ✗ | TEI ~ (`new`→Gte, unverified) / vLLM ~ (auto-convert) / Infinity ~ | ✗ (`new`/`NewModel` unsupported) | **no CPU GGUF**; ONNX doc-encoder only |
| nomic-ai/nomic-embed-text-v1.5 | `nomic-ai/nomic-embed-text-v1.5-GGUF` (15 files, official) | official ONNX; fastembed | ✓ `nomic-embed-text:v1.5` | TEI ✓ (listed) / Infinity ✓ / vLLM ✓ | `nomic-bert` ✓ | **works today** |
| LiquidAI/LFM2.5-Embedding-350M | `LiquidAI/LFM2.5-Embedding-350M-GGUF` (7 quants, official) | `dsaad68/…-ONNX-int8/fp16` (community); LiteRT | ✗ | TEI ✗ / vLLM ✗ / Infinity ~ (torch) | `lfm2` ✓ | **works today** (llama.cpp GGUF, official) |
| voyageai/voyage-4-nano | `jsonMartin/voyage-4-nano-gguf` (f16,q8_0 + linear.pt, **community**) | `onnx-community/voyage-4-nano-ONNX` | ✗ | TEI ✓ (listed) / vLLM ✓ / Infinity ✓ | `qwen3` ✓ (via community GGUF) | **works today** (community GGUF / official ONNX) |

## Searches

Query strings used (HF API `/api/models?search=…` and `web_search`):

- `Qwen3-Embedding-0.6B GGUF huggingface`; `embeddinggemma-300m GGUF huggingface`; `bge-m3 GGUF huggingface`; `granite-embedding GGUF huggingface`
- HF API `?filter=gguf&sort=downloads` for: `stella_en_400M_v5 gguf`, `LFM2.5-Embedding-350M GGUF`, `voyage-4-nano GGUF`, `granite-embedding-english-r2 GGUF`, `granite-embedding-311m-multilingual-r2 GGUF`, `snowflake-arctic-embed-l-v2.0 GGUF`, `jina-embeddings-v5 GGUF`, `nomic-embed-text-v1.5 GGUF`, `bge-m3 GGUF`, `jina-embeddings-v2-base-en GGUF`, `multilingual-e5-large GGUF`, `all-MiniLM-L6-v2 GGUF`, `bge-small-en-v1.5 GGUF`, `bge-base-en-v1.5 GGUF`, `bge-small-en GGUF`, `bge-small-zh-v1.5 GGUF`, `bge-base-en GGUF`, `granite-embedding-small-english-r2 GGUF`, `embeddinggemma-2 GGUF`, `stella gguf`
- HF API `?search=` for ONNX: `Qwen3-Embedding-0.6B onnx`, `embeddinggemma onnx`, `embeddinggemma-2 onnx`, `stella_en_400M_v5`, `voyage-4-nano onnx`, `LFM2.5-Embedding onnx`, `jina-embeddings-v5 onnx`, `granite-embedding-english-r2 onnx`, `granite-embedding-311m-multilingual-r2 onnx`, `bge-m3 onnx`, `snowflake-arctic-embed-l-v2.0 onnx`, `snowflake arctic embed onnx`, `multilingual-e5-large onnx`, `nomic-embed-text-v1.5 onnx`, `bge-small-en-v1.5 onnx`, `bge-base-en-v1.5 onnx`, `jina-embeddings-v2-base-en onnx`, `litert embeddinggemma`, `litert-community embedding`
- `vLLM supported embedding models list BERT Qwen3-Embedding`; `michaelfeil infinity embedding server supported model architectures`
- Ollama registry API: `GET/HEAD /v2/library/{name}/manifests/{tag}`, `GET /v2/library/{name}/blobs/{config.digest}`, `/library/{name}` pages for 20+ names
- Source-tree fetches: llama.cpp `src/llama-arch.cpp`, `gguf-py/gguf/constants.py`, `conversion/*.py` (all 98), `tools/server/server.cpp`, `common/arg.cpp`, `include/llama.h`; TEI `backends/candle/src/lib.rs`, `models/` listing, `router/src/http/server.rs`; fastembed `fastembed/text/*.py` @ `main` and `v0.8.1`; Infinity `README.md`

## Conflicting evidence

1. **`cstr/multilingual-e5-large-GGUF` is not llama.cpp-loadable.** Its GGUF header declares
   `general.architecture = "xlmr"`, which does not exist in llama.cpp's arch table (I2); the card
   targets CrispEmbed. The `phate334/` and `tatsuyaaaaaaa/` e5 GGUFs declare `bert` and do load.
   → Cite the `bert`-arch repos for llama.cpp; do not cite `cstr/` for Path-3.
2. **fastembed published docs vs source.** The published page (fetched 2026-10-07) lists 25 text
   models and omits Qwen3-Embedding-0.6B, embeddinggemma-300m, granite-embedding-small-english-r2,
   stella, constella; `main` source contains 39. The docs page is stale (mkdocs build predates the
   newer entries). → Treat the source tree (`main`/`v0.8.1`) as authoritative, per the brief.
3. **Ollama `granite-embedding` ≠ r2.** Ollama's `granite-embedding` tags are `30m`/`278m` (Granite
   Embedding **v1**), while the candidates are the **r2** generation. Don't count Ollama as r2 support.
4. **Ollama `snowflake-arctic-embed2` ≠ `arctic-embed-l-v2.0`.** The Ollama blob config reports
   `model_family: bert, model_type 566.70M` and the page tags `568m`; the candidate
   `Snowflake/snowflake-arctic-embed-l-v2.0` is 568M but Ollama does not publish it under that name.
   → Ollama's entry is a distinct/derived package; treat `arctic-embed-l-v2.0` as **not** in Ollama.
5. **embeddinggemma-2 GGUF freshness.** `ggml-org/embeddinggemma-2-GGUF` was created 2026-10-06
   (downloads=0 at fetch), one day before this audit; llama.cpp gained `EmbeddingGemma2Model` in
   commit "model: support embeddinggemma2 (text+vision+audio) (#30054)" dated 2026-10-06. The build
   exists and the arch is registered, but it is brand-new — pin the llama.cpp commit.
6. **voyage-4-nano GGUF is unofficial.** `jsonMartin/voyage-4-nano-gguf` is community; it also needs
   an out-of-graph `voyage-4-nano-linear.pt` projection to match the official 2048-d output, so the
   served embedding is not drop-in identical. TEI's official support (`voyage-4-nano`, listed) is the
   safer Path-3 route.
7. **jina-v5 LoRA caveat.** vLLM notes jina-v5 ships four task-specific LoRA adapters and merges the
   selected one at load; TEI's Qwen3 path has no such LoRA merge, so TEI support for
   `jina-embeddings-v5-text-small` is doubtful despite the Qwen3 arch match.

## Gaps

- **TEI `new`→Gte path for stella**: TEI's `Gte` config (`model_type` alias `new`) field set
  (position_embedding_type, logn_attention_scale/clip1) matches stella's `config.json`, suggesting
  TEI *might* load `NovaSearch/stella_en_400M_v5`. Not confirmed by a TEI model-list entry or a
  served example → unverified, low confidence.
- **vLLM auto-conversion for stella / embeddinggemma-2**: vLLM's `as_embedding_model` fallback could
  accept `NewModel` / `EmbeddingGemma2Model`, but neither appears in the supported table; unverified.
- **`onnx-community/embeddinggemma-2-ONNX`**: repo exists but shows ~0 downloads and no README;
  usability (graph completeness, pooling) unverified.
- **LFM2.5-Embedding ONNX/TEI**: `dsaad68/…-ONNX-int8/fp16` are community, ~22/10 downloads, no
  README; correctness unverified. TEI/vLLM have no LFM2 embedding arch.
- **Quant-file completeness**: for several community repos (e.g. `mradermacher/*`) only the file list
  was checked, not per-file header parsing of every quant; the named quant in each row was parsed.
- **Infinity per-model validation**: Infinity's tested-model list is a README enumeration; a given
  checkpoint's ONNX must exist for the `optimum` engine, or match Sentence-Transformers for `torch`.
  Not exercised per model here.
- **Ollama OpenAI-compat endpoint**: `docs/openai.md` did not resolve on fetch; the `/v1/embeddings`
  claim rests on the Ollama OpenAI-compatibility layer generally, not a fetched primary doc line.
