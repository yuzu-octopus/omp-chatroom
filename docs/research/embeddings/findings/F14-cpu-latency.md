# F14 — CPU inference latency for ~0.2–0.6B embedding models

All fetches **2026-10-07** unless noted. Target: **Intel i5-1135G7** (Tiger Lake, 4C/8T, 2× DDR4-3200 = 51.2 GB/s theoretical, 15 GB RAM, no CUDA).
Serving paths considered: llama.cpp/GGUF, ONNX Runtime (fastembed/optimum), TEI (Candle CPU).

---

## Angle

Round 1–2 established *which* models exist and how they score on MTEB. This round asks a different
question: **can any of them answer a single embedding call in under 1 s on a 4-core Tiger Lake
laptop, and at what input length does each cross that line?**

Three things had to be separated, because the literature conflates them:

1. **Batch throughput** (`llama-bench -p 512`, "sentences/s at batch 32") — what almost every
   published CPU number measures. It is *not* single-call latency and is 3–10× more favourable.
2. **Single-call latency at a stated input length** — what the user's budget is about. Almost
   nobody publishes this for these models on x86 CPUs.
3. **The runtime's own inefficiencies** — llama.cpp has two documented CPU-relevant defects that
   change the answer by 40 %+ (lm_head in embedding mode; TEI's missing CPU batching), so a
   benchmark of the *model* is not a benchmark of the *deployment*.

Where no published single-call number exists at the right length and hardware, a derivation is
given and labelled `[derived]`, with the arithmetic and the dominant uncertainty stated.

---

## Claims (claim / source URL / fetch date / hardware / confidence)

### A. Directly published CPU latency / throughput

| # | Claim | Source URL | Fetch date | Hardware + runtime | Conf. |
|---|---|---|---|---|---|
| A1 | `Qwen3-Embedding-0.6B` GGUF, prompt eval **59.46 ms / 409 tokens = 0.15 ms/token, 6878 t/s**; total 64.72 ms / 410 tokens. Compared against `jina_v3`/`bge-m3`/`snowflake-arctic-embed-l-v2.0` at 11.73 ms / 368 tokens = 31383 t/s | https://github.com/ggml-org/llama.cpp/issues/19933 | 2026-10-07 | **Hardware not stated** in the issue; the 5× gap to `jina_v3` at 31k t/s is only plausible on a GPU. Treat as **GPU-class, unverified** | low (hardware) |
| A2 | `Qwen3-Embedding-0.6B-Q8_0` GGUF, **llama.cpp pp512 = 627.86 ± 20.64 t/s** (→ 512 tok in **815 ms**) | https://github.com/ikawrakow/ik_llama.cpp/discussions/898 | 2026-10-07 | Dual Xeon E5-2696 v3, 36C/72T, Debian 12, `-t 72 -ub 4906`, `libggml-cpu-haswell` | high |
| A3 | Same model, **ik_llama.cpp pp512 = 1169.02 ± 54.91 t/s** (no BLAS) / 1143.57 ± 81.61 (BLAS) → 512 tok in **438 ms** | https://github.com/ikawrakow/ik_llama.cpp/discussions/898 | 2026-10-07 | Same dual Xeon, `-t 72` | high |
| A4 | Same model, **ik_llama.cpp pp512 = 3100 t/s @16 threads, 2980 @32 threads; llama.cpp = 1260 t/s** | https://github.com/ikawrakow/ik_llama.cpp/discussions/898 (maintainer reply) | 2026-10-07 | Ryzen 7950X (16C/32T) | high |
| A5 | **Hyper-threading "almost never helps"**; for dense Qwen3-0.6B on CPU the best performance is at **default batch/ubatch** (large ubatch advice is MoE/GPU-only) | https://github.com/ikawrakow/ik_llama.cpp/discussions/898 | 2026-10-07 | Ryzen 7950X / general | high (maintainer) |
| A6 | `embeddinggemma-300M` Q8_0 via llama.cpp, **short queries: 65 RPS max, p50 15.7 ms, p99 162.3 ms; paragraph-length: 4 RPS max, p50 193.9 ms, p99 210.7 ms** | https://paulw.tokyo/text-embedding-inference-cheap/ (summary: https://engineered.at/articles/text-embedding-inference-on-a-cheap-server) | 2026-10-07 | Netcup RS-2000-G9.5 VPS, **AMD EPYC 7702P, 6-core allocation**, `llama-server --embeddings -c 512 --mlock`, `wrk -t1 -c1` | high |
| A7 | Same bench: `granite-embedding-107m-multilingual` Q8_0 **300 RPS short / 35 RPS paragraph**; `granite-embedding-278m` Q5_K_M **70 RPS / 4 RPS** | https://engineered.at/articles/text-embedding-inference-on-a-cheap-server | 2026-10-07 | same VPS | high |
| A8 | Same bench, author's per-core estimate: **~50 rps/core @107M short queries, ~6 rps/core on "more substantial text chunks"** | https://engineered.at/articles/text-embedding-inference-on-a-cheap-server | 2026-10-07 | EPYC 7702P core | med (author estimate) |
| A9 | `embeddinggemma.c` CPU (Apple M5 Max), warmed median of full Q4_0 pipeline: **370 one-token req/s (≈2.7 ms), 1 051 tok/s @32 tokens (≈30.5 ms/req), 1 350 tok/s @2 048 tokens (≈1.52 s/req)** | https://github.com/QuixiAI/embeddinggemma.c | 2026-10-07 | Apple M5 Max CPU, Q4_0 GGUF (278 MB), custom C11 kernels — **not llama.cpp** | high |
| A10 | `EmbeddingGemma 300m` **CPU latency 200 ms average**, Samsung S26 Ultra, **4 threads** (UniversalSentenceEncoder 10 ms on same rig) | https://developers.google.com/edge/mediapipe/solutions/text/text_embedder (updated 2026-10-01) | 2026-10-07 | Samsung S26 Ultra (ARM), MediaPipe TextEmbedder, int4+int8 mixed | high |
| A11 | EmbeddingGemma 1 card: "**low latency: generative embeddings in less than 22 ms on EdgeTPU**" — **not a CPU number** | https://ai.google.dev/gemma/docs/embeddinggemma | 2026-10-07 | EdgeTPU | high (as a non-CPU claim) |
| A12 | EmbeddingGemma-2 text-only (270M) via **LiteRT-LM**, 128-token text signature, avg of 5 iters — **MacBook Pro M5 CPU 31.3 ms; Dell XPS 16 (Intel Core Ultra Series 3) CPU 71.7 ms; S26 Ultra CPU 27.1 ms; iPhone 18 Pro CPU 41.8 ms; Arm 2.3&2.8 GHz Linux CPU 105 ms; Raspberry Pi 5 CPU 161 ms; Jetson Orin Nano CPU 207 ms** | https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm and https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm | 2026-10-07 | Various; **int4 per-channel QAT weights, LiteRT runtime** | high |
| A13 | Same card, CPU memory: **MacBook Pro M5 165 MB, Dell XPS 16 211 MB, Linux Arm 310 MB, RPi5 282 MB** (text-only) | https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm | 2026-10-07 | as above | high |
| A14 | `embeddinggemma-300M` LiteRT "Mixed Precision" CPU inference: **66 ms @256 tok, 169 ms @512, 549 ms @1024, 2455 ms @2048**; RSS 110 MB @256 → 196 MB @2048; init 17.6 ms | https://huggingface.co/litert-community/embeddinggemma-300m (card is **gated**, HTTP 401 on direct fetch; numbers reproduced via search index and by sibling worker F5) | 2026-10-07 | **CPU model not stated on the card**; LiteRT, e4_a8_f4_p4 QAT | **med** (could not fetch page directly; two independent reads agree) |
| A15 | `bge-base-en-v1.5` (109M) **CPU 264.83 sentences/s**; `bge-large-en-v1.5` 80.94; `bge-m3` 80.63; `gte-base` 197.85; `all-MiniLM-L6-v2` 1739.31; `all-mpnet-base-v2` 270.40; **`jina-embeddings-v3` 0.55** | https://huggingface.co/blog/static-embeddings (source: https://github.com/huggingface/blog/blob/main/static-embeddings.md) | 2026-10-07 | **i7-13700K (16C/24T), 32 GB RAM**, Sentence-Transformers, GooAQ query embeddings, optimal batch size per model | high |
| A16 | `bge-base-en-v1.5` CPU: 16-core desktop 292.4 sent/s, 8-core mobile APU 170.3, 8-core desktop 146.2, 12-core mini PC 123.5, **6-core laptop 75.6**, **4-core mini PC 42.8**. `multilingual-e5-large` (560M): 114.3 / 66.8 / 57.1 / 48.3 / **29.5** / **16.7**. `all-MiniLM-L6-v2`: 847.3 … **123.7** | https://treeru.com/en/blog/cpu-embedding-benchmark-tool | 2026-10-07 | 8 CPUs, Sentence-Transformers, Python 3.11, **1 000 sentences ≈50 tokens, batch 32**, median of 3 | med (CPU models pseudonymised; methodology explicit) |
| A17 | `bge-base-en-v1.5` ONNX/CPU **5.8 emb/s**; `bge-small-en-v1.5` ONNX/CPU **15.8 emb/s**. Metal GPU for reference: EmbeddingGemma-300M Q8 33.5/s, Qwen3-0.6B Q8 12.5/s, Qwen3-0.6B Q4K 11.4/s | https://github.com/ghatdev/embedding-benchmark (docs/public_embedding_benchmark_report.md) | 2026-10-07 | **Apple M1 Max (64 GB)**, FastEmbed/ONNX Runtime CPU EP (no EP features) and MistralRS/Candle Metal | high |
| A18 | `BGE-M3` (568M) OpenVINO CPU: **FP32 23.5 samples/s (42.6 ms single), batch-16 27.0 samples/s (591.8 ms); INT8 82.9 samples/s (12.1 ms single), batch-16 128.3 samples/s (124.7 ms)** | https://github.com/Oaklight/openvino-meteor-lake-ai-inference/blob/main/docs/BENCHMARK_RESULTS.md | 2026-10-07 | **ThinkPad X1 Carbon Gen 12, Intel Core Ultra 7 155H** (Meteor Lake, 6P+8E+2LPE), OpenVINO via optimum-intel, 100 iters after 5 warmups | high |
| A19 | `multilingual-e5-large`, single query, CPU: **31 ms median** (and BGE-M3 / E5-large in the same ~31 ms cluster; LaBSE and mMPNet 16.6 ms). Includes embedding + FAISS retrieval | https://arxiv.org/abs/2605.23618 (+ https://arxiv.org/html/2605.23618v1 §IV-C, §V-C) | 2026-10-07 | **Apple M-series CPU**, 50 single-query runs, 5 warmups, no batching, median | high |
| A20 | `bge-small-en-v1.5` (33M) on Intel Xeon 6975P-C (16 vCPU, AVX-512+AMX), batch 16: **OpenVINO FP32 2795 texts/s, CTranslate2 INT8 2099, ONNX Runtime INT8 1070, FastEmbed 762, llama.cpp Q8_0 730**; best single-text latency **CTranslate2 1.56 ms**; RSS 129 MB (llama.cpp) – 1 261 MB (OpenVINO) | https://www.reddit.com/r/LLM/comments/1ry6ppb/cpuonly_inference_for_embeddingsrerankers/ | 2026-10-07 | Xeon 6975P-C (Sapphire Rapids), and M1 Max separately | **secondary** (Reddit post, self-reported) |
| A21 | `Qwen3-Embedding-0.6B` fp32, **CPU 18.9 samples/s (≈52.9 ms/sample), peak 0.21 GB**; GPU (RTX 4060 Laptop) 378.9/s | https://github.com/hrs19/qwen3-embedding-perftest | 2026-10-07 | Laptop: **RTX 4060 Laptop, 16 GB RAM**, PyTorch `transformers`, 500 samples from clinc_oos, single run | **secondary** (0-star repo, "directional, not authoritative" per its own README) |
| A22 | `Qwen3-Embedding-0.6B-Q8_0` GGUF via llama.cpp, per-query **p50 ≈ 283–400 ms, p95 399.8 ms** (vector mode) | https://github.com/gmickel/gno/blob/main/evals/fixtures/general-embedding-benchmark/2026-04-06-qwen3-embedding-0-6b.md | 2026-10-07 | **Hardware not stated**; latency includes retrieval, not just embedding | low |
| A23 | TEI CPU vs Sentence-Transformers, `bge-large-en-v1.5`: **TEI "consistently over 1 second" per request vs ~450 ms** for a naive ST+FastAPI server. Confirmed again 2026-01-25: "**sentence-transformers 2.4× faster than TEI**" | https://github.com/huggingface/text-embeddings-inference/issues/31 | 2026-10-07 | **Intel i9-10920X, 12C/24T**, `cpu-0.2.2` docker; and AMD/Intel reported later | high |
| A24 | TEI CPU thread-pool mis-detection: `paraphrase-multilingual-MiniLM-L12-v2`, 17 KB input — **no limit 16.87 req/s; `cpus=2` 1.82 req/s (6× worse); `cpus=2` + MKL/TOKIO/NUM_RAYON env vars 11.03 req/s** | https://github.com/huggingface/text-embeddings-inference/issues/170 | 2026-10-07 | **Intel i3-8300H (4C/8T)**, `ab -k -n24 -c4` | high |
| A25 | TEI does **not** publish a CPU benchmark; its README table is an **NVIDIA A10 GPU**. TEI does not batch on CPU (confirmed by maintainer in #31) | https://github.com/huggingface/text-embeddings-inference (README) + issue #31 | 2026-10-07 | — | high |
| A26 | llama.cpp `-embd 1` is the supported embedding benchmark mode; `llama-bench -m model.gguf -embd 1 -p 512 -n 0 -r 5` | https://github.com/ggml-org/llama.cpp/blob/master/tools/llama-bench/README.md | 2026-10-07 | — | high |
| A27 | `Qwen3-Embedding-0.6B-Q4_0` (751.63 M params incl. duplicated output tensor) on **Dimensity 9000+ phone, 4 threads**: pp512 **351.60 t/s** (b8056) → 161.30 t/s (b8057, SVE regression) → **406.30 t/s** with SVE disabled → 322.07 t/s with `-fa 0`; tg128 ~80 t/s | https://github.com/ggml-org/llama.cpp/issues/21854 | 2026-10-07 | **ARM Cortex-X2+3×A710, 4 threads**, llama.cpp CPU, `-ub 64`/`-ub 512` | high |

### B. Runtime-level facts that change the CPU number

| # | Claim | Source URL | Fetch date | Conf. |
|---|---|---|---|---|
| B1 | **llama.cpp runs `lm_head` in embedding mode for every architecture except `llama`**, then discards the logits. Skipping it: **median +59.8 % ROCm, +17.4 % CUDA, +9.9 % Metal; CPU (`-ngl 0`) `qwen2` +40.6 %**. Cost scales with vocab; logits readback ~1.2 GB/batch at pp2048 | https://github.com/ggml-org/llama.cpp/issues/24713 | 2026-10-07 | high |
| B2 | **Verified in source at master**: `src/models/qwen3.cpp` builds `build_lora_mm(model.output, cur)` unconditionally and sets `res->t_logits` — so **`Qwen3-Embedding-0.6B` and `jina-embeddings-v5-text-small` (arch `qwen3`) pay the wasted lm_head**. `src/models/gemma-embedding.cpp` sets only `res->t_embd` and **never builds lm_head** — so **`embeddinggemma-300m` / `embeddinggemma-2` do not** | https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/models/qwen3.cpp and .../gemma-embedding.cpp | 2026-10-07 | **high (direct source read)** |
| B3 | Issue #24713 was **closed without a merge** (labels `bug-unconfirmed, stale`; the auto-close bot fired). A standard llama.cpp build therefore still wastes the lm_head pass for `qwen3`-arch embedding models | https://github.com/ggml-org/llama.cpp/issues/24713 | 2026-10-07 | high |
| B4 | `Qwen3-Embedding-0.6B` + llama-server with **both `--reranking` and `--embedding` enabled returns all-zero embeddings**; with `--embedding` alone it is correct | https://github.com/ggml-org/llama.cpp/issues/20085 | 2026-10-07 | high (Metal/M4 repro; arch-independent code path) |
| B5 | Ollama's REST embedding path is **~2× slower than in-process Sentence-Transformers for the same model and vectors** (still open, assigned, labelled `performance`) | https://github.com/ollama/ollama/issues/7400 | 2026-10-07 | high (report); no root cause published |
| B6 | `jina-embeddings-v3` on **CPU = 0.55 sentences/s** vs `bge-base-en-v1.5` 264.83 — a ~480× gap on the same i7-13700K box and library | https://huggingface.co/blog/static-embeddings | 2026-10-07 | high |
| B7 | Jina's own GGUF guidance: GGUF embedding quality/speed numbers are **L4 GPU** (v4 3.09B: Q8_0 3 767 t/s with FA / 2 101 without); no CPU figure published. Optimal `-ub 512 -c 2048` → 4 143 t/s on L4 | https://jina.ai/news/optimizing-ggufs-for-decoder-only-embedding-models/ | 2026-10-07 | high |
| B8 | Jina on-prem catalog: `jina-embeddings-v5-text-small` and `-nano` both ship **CPU containers** (~3 GB / ~2 GB); nano is recommended as "first-time test / **latency-critical** … **CPU-friendly**" | https://github.com/jina-ai/jina-on-prem/blob/main/docs/Model-Catalog.md | 2026-10-07 | high |
| B9 | `jina-embeddings-v3` is documented by Jina as requiring "**CUDA-capable GPU for production throughput**" while jina-on-prem still lists a CPU container for it | https://jina.ai/models/jina-embeddings-v3 vs https://github.com/jina-ai/jina-on-prem/blob/main/docs/Model-Catalog.md | 2026-10-07 | high (both) — see Conflicting evidence |

### C. File sizes / quantisation actually shipped (for the footprint column)

| Model | File | Size | Source | Conf. |
|---|---|---|---|---|
| Qwen3-Embedding-0.6B | Q8_0 GGUF | **639 MB** | https://ollama.com/library/qwen3-embedding (via F5) + official GGUF repo lists only `q8_0`/`f16` | high |
| jina-v5-text-small | Q8_0 GGUF | **639 447 424 B (639 MB)** | https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-small-text-matching-GGUF?blobs=true | **high (API)** |
| jina-v5-text-small | Q4_K_M GGUF | **396 705 152 B (397 MB)** | same | **high (API)** |
| jina-v5-text-nano | Q8_0 GGUF | **232 883 776 B (233 MB)** | https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-nano-text-matching-GGUF?blobs=true | **high (API)** |
| jina-v5-text-nano | Q4_K_M GGUF | **156 966 976 B (157 MB)** | same | **high (API)** |
| embeddinggemma-2 text-270M | LiteRT CPU/GPU file | **165 MB**; CPU RSS 165–310 MB | https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm | high |
| embeddinggemma-2 740M (all modalities) | LiteRT CPU/GPU file | **485 MB** | https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm | high |
| bge-base-en-v1.5 | FP32 / INT8 | ~436 MB / ~109 MB; fastembed ONNX 210 MB | F5 (qdrant supported-models) | high |
| multilingual-e5-large | FP32 / INT8 | ~2.24 GB / ~560 MB | F5 | high |

---

## Derived estimates (clearly labelled, with arithmetic)

### Method

For each model I compute **FLOPs per token** from the published architecture (layer count, widths,
GQA layout, vocab) as `2 × MACs`, then divide by an assumed **achieved** x86 CPU rate.

**Peak rate of the i5-1135G7.** 4 cores, AVX2 + FMA, ~3.0 GHz sustained all-core
(i5-1135G7 all-core turbo is ~3.0–3.3 GHz on a 15 W part):

```
fp32 peak = 4 cores × 3.0e9 Hz × 2 FMA ports × 8 floats × 2 (FMA = 2 flop) = 384 GFLOP/s
```

Tiger Lake has **AVX2-VNNI** (`vpdpbusd`, 32 int8 MACs/instr) but **no AVX-512 and no AMX**, so its
int8 ceiling is ~4× the fp32 number (≈1 536 GOPS) against 16× on Sapphire Rapids (AMX) — one reason
the Intel VNNI speedups in §A18/A20 do not transfer to this part. I therefore use the fp32 peak as
the yardstick and let the calibration below absorb whatever int8 acceleration actually materialises.

**Efficiency calibration from published CPU numbers.** This is the step that keeps the estimate
honest rather than hand-waved:

```
Ryzen 7950X llama.cpp, Qwen3-Emb-0.6B pp512 = 1260 t/s
  → 512 tokens in 0.406 s
  → per-token FLOPs (see below) = 1.19 GFLOP  →  610 GFLOP / 0.406 s = 1501 GFLOP/s
  Ryzen 7950X fp32 peak = 16 cores × 5.0e9 Hz × 2 FMA ports × 8 floats × 2 = 2560 GFLOP/s
  → achieved 59 % of fp32 peak

Same model, ik_llama.cpp = 3100 t/s → 610 GFLOP / 0.165 s = 3693 GFLOP/s
  → 144 % of fp32 peak — only reachable because Q8_0 runs on the INT8 path
    (AVX2-VNNI `vpdpbusd` = 32 int8 MACs/instr, ~4× the fp32 MAC rate),
    so the fp32-peak yardstick *understates* the int8 ceiling by ~4×.

Dual Xeon E5-2696 v3 (A2) = 627.86 t/s → 610 / 0.815 = 748 GFLOP/s
  peak = 36 × 2.3e9 × 2 × 8 × 2 = 2650 GFLOP/s  →  28 % of fp32 peak

Cross-check with bge-base-en-v1.5 (independent model, independent blog):
  treeru 6-core laptop = 75.6 sent/s @ ~50 tok = 3780 tok/s × 0.17 GFLOP/tok = 643 GFLOP/s
  6-core modern laptop fp32 peak ≈ 6 × 4.5e9 × 2 × 8 × 2 = 864 GFLOP/s  →  74 % of peak (batch 32)
```

So the **observed spread across published x86 runs is 28 % – 144 % of fp32 peak**, the top end
reachable only because the INT8 path has ~4× the fp32 MAC rate. I use **30 % → 115 GFLOP/s**
(pessimistic) and **60 % → 230 GFLOP/s** (optimistic). The optimistic end is deliberately
**2.4× below the best published run**, because (a) that run used a 16-core desktop with a far deeper
memory system, (b) 4 cores cannot hide memory latency the way 16 can, and (c) both ends must
transfer to a 15 W laptop part. **This 2× band is the dominant uncertainty in every number below.**

**Per-token FLOPs (arithmetic shown once, for the largest model).**

`Qwen3-Embedding-0.6B` — `n_embd=1024, n_layer=28, n_ff=3072, n_head=16, n_head_kv=8, head_dim=128,
vocab=151 669`:

```
per layer, linear MACs/token
  q: 1024 × (128×16=2048)  = 2.10 M
  k: 1024 × (128×8 =1024)  = 1.05 M
  v: 1024 × 1024           = 1.05 M
  o: 2048 × 1024           = 2.10 M
  gate/up/down: 3 × 1024×3072 = 9.44 M
  ──────────────────────────────── 15.74 M MACs/layer
× 28 layers = 440.7 M MACs = 881 MFLOP/token  (the per-token, T-independent part)
attention: MACs/token = 2 × T × n_head × head_dim = 4096·T  → 0.35 % of the above at T=512, 1.4 % at T=2048
lm_head (still runs on master, see B1/B2): 1024 × 151669 × 2 = 311 MFLOP/token
```

**1.19 GFLOP/token with lm_head; 0.88 GFLOP/token without.** The lm_head is therefore **26 % of
all Qwen3-Embedding-0.6B CPU FLOPs** — a pure waste in embedding mode (B1/B2/B3).

### Derived single-call latency, i5-1135G7, llama.cpp/GGUF

All rows `[derived]`. Range = 115–230 GFLOP/s achieved. Weights fit in RAM in every case.

| Model (quant) | FLOP/token | 128 tok | 512 tok | 2048 tok |
|---|---|---|---|---|
| **Qwen3-Embedding-0.6B** Q8_0 | 1.19 GFLOP (with lm_head) | **0.66 – 1.32 s** | **2.7 – 5.3 s** | **11 – 21 s** |
| ↑ *with the #24713 lm_head skip* | 0.88 GFLOP | 0.49 – 0.98 s | 2.0 – 3.9 s | 7.8 – 15.7 s |
| **jina-v5-text-small** Q8_0 (677M, arch qwen3) | ≈ 1.33 GFLOP (677M/596M scale on the 440.7 M linear MACs → 500 M MACs → 1.00 GFLOP + 0.33 lm_head) | 0.74 – 1.48 s | **3.0 – 5.9 s** | **12 – 24 s** |
| **jina-v5-text-nano** Q8_0 (239M, arch eurobert, bidirectional) | ≈ 0.32 GFLOP (no tied lm_head in the eurobert graph) | 0.18 – 0.36 s | 0.71 – 1.42 s | 2.8 – 5.7 s |
| **embeddinggemma-300m** Q8_0 (308M, arch gemma-embedding, 24 L, d=768, ff=1152, vocab 262k, **no lm_head**) | ≈ 0.20 GFLOP | 0.11 – 0.22 s | **0.45 – 0.89 s** | 1.8 – 3.6 s |
| **embeddinggemma-2** text-270M (24 L, d=512, hidden=2048, **no lm_head**) | ≈ 0.19 GFLOP | 0.10 – 0.21 s | 0.42 – 0.84 s | 1.7 – 3.4 s |
| **bge-base-en-v1.5** INT8 ONNX (109M, 12 L, d=768, 512 ctx max) | ≈ 0.17 GFLOP | 0.09 – 0.19 s | 0.38 – 0.75 s | n/a (512 ctx) |
| **multilingual-e5-large** INT8 (560M, XLM-R large, 512 ctx max) | ≈ 0.86 GFLOP | 0.48 – 0.96 s | **1.9 – 3.8 s** | n/a (512 ctx) |

Worked example for the headline row, so the arithmetic is checkable:

```
Qwen3-Embedding-0.6B, 512 tokens, pessimistic 115 GFLOP/s:
  1.19 GFLOP/token × 512 tok = 610 GFLOP
  610 / 115 = 5.3 s   (pessimistic)
  610 / 230 = 2.7 s   (optimistic)
```

**Sanity checks against published numbers (all `[derived]` → published):**

- A2 (dual Xeon, 627.86 t/s) implies 610 GFLOP / 0.815 s = **748 GFLOP/s** = 28 % of that Xeon's
  2 650 GFLOP/s fp32 peak — the pessimistic anchor; the 72-thread run is also hyper-thread-degraded (A5).
- A4 (Ryzen 7950X, ik_llama 3 100 t/s) implies **3 693 GFLOP/s** = 144 % of fp32 peak, i.e. the
  INT8 path at ~36 % of its own ceiling. That is the optimistic anchor.
- A27 (Dimensity 9000+, 4 threads, Q4_0, **406 t/s with SVE off**) implies 512 tok in 1.26 s, i.e.
  **483 GFLOP/s** from 4 ARM cores. My 115–230 GFLOP/s band for 4 x86 cores at ~3 GHz is therefore
  **conservative by ~2–4×** versus a 2021 phone. The true answer is likely near the optimistic end;
  the band stays wide because the phone ran Q4_0 (cheaper dequant) with `-ub 512` and no other load.
- **Independent per-core de-rating (not FLOP-based).** Ryzen 7950X llama.cpp = 1 260 t/s over 16
  threads = 78.75 t/s/thread. Scaling to 4 cores and 3.0 vs 5.0 GHz:
  `78.75 × 4 × (3.0/5.0) ≈ 189 t/s` → 1 000 ms at **189 tokens**, 512 tokens in **2.7 s**. That
  lands exactly on the optimistic end of the FLOP route (193 tokens / 2.7 s), which is why the
  optimistic end is the one I would bet on for a well-cooled, idle laptop.

### Derived memory footprint (weights + KV)

`[derived]`, KV cache at f16 = `2 × n_layer × n_embd_kv_gqa × 2 bytes` per position.

```
Qwen3-Embedding-0.6B: 2 × 28 × 1024 × 2 = 114 688 B/pos = 112 KB/pos
   @512 tok = 57 MB · @2048 tok = 230 MB · @8192 tok = 918 MB   (weights 639 MB)
   → total @512 ≈ 0.70 GB; @8192 ≈ 1.6 GB
jina-v5-text-small (qwen3, same shape): identical KV, weights 639 MB (Q8_0) / 397 MB (Q4_K_M)
jina-v5-text-nano (eurobert, bidirectional, 8K ctx): weights 233 MB (Q8_0) / 157 MB (Q4_K_M);
   KV ≈ same order as its 212M base — well under 0.5 GB total at any supported length
embeddinggemma-300m: 24 L, GQA 2 KV heads × 128 dim → 2×24×256×2 = 24 576 B/pos = 24 KB/pos
   @2048 tok = 49 MB. LiteRT reports 110 MB RSS @256 / 196 MB @2048, consistent.
embeddinggemma-2 text-270M: LiteRT 165–310 MB CPU RSS (published, A13).
```

Every one of these fits the 15 GB budget with room to spare; **memory is not the binding constraint
— latency is.**

### i5-1135G7 memory bandwidth check (why the band is not bandwidth-limited)

```
2 × DDR4-3200 = 2 × 3200e6 × 8 B = 51.2 GB/s theoretical
realistic streaming achievable ≈ 60–80 % → 31–41 GB/s
single 512-token prefill reads 639 MB of weights once → 639 MB / 35 GB/s ≈ 18 ms
```

Prefill at these sizes is **compute-bound, not bandwidth-bound**; the DDR4 figure only matters if
you batch many sequences, which the user's single-call workload does not.

---

## Explicit answer: at what input length does each model exceed 1000 ms?

Scaling factor used and why: **per-token FLOPs are linear in input length** for the prefill path
(all layers are GEMMs over the sequence), and the attention term is genuinely negligible here —
for Qwen3-0.6B, attention MACs/token = `2 × T × n_head × head_dim` = `2 × T × 16 × 128` =
`4096·T`, i.e. **4.2 MFLOP/token at T=512 (0.35 % of 1.19 GFLOP), 16.8 MFLOP at T=2048 (1.4 %),
67 MFLOP at T=8192 (5 %)**. So linearity holds to within ~1 % across the 128–2048 range that
matters. The scaling from any published hardware to the i5-1135G7 is therefore a **single
throughput ratio**, taken from the efficiency calibration above (30–60 % of fp32 peak,
cross-checked against A2/A4/A27).

| Model | FLOP/token | Crosses 1 000 ms at | In-range verdict |
|---|---|---|---|
| **Qwen3-Embedding-0.6B** Q8_0 | 1.19 | **~100 – 190 tokens** | **over 1 s from ~128 tokens upward** — a 512-token call is 2.7–5.3 s |
| **jina-v5-text-small** Q8_0 | 1.33 | **~85 – 175 tokens** | worse than Qwen3-0.6B by the 677M/596M ratio |
| **jina-v5-text-nano** Q8_0 | 0.32 | **~360 – 720 tokens** | safe for chunks ≤512; over the line only on long documents |
| **embeddinggemma-300m** Q8_0 | 0.20 | **~575 – 1 150 tokens** | safe across most of its 2 K context; borderline only at the top |
| **embeddinggemma-2** text-270M | 0.19 | **~605 – 1 210 tokens** | same; the 8 K context is unreachable in <1 s past ~1 K |
| **bge-base-en-v1.5** INT8 | 0.17 | **never** (hard 512-token cap → 0.38–0.75 s at max) | safe by construction |
| **multilingual-e5-large** INT8 | 0.86 | **~135 – 270 tokens** | at its 512-token cap it is **2–4 s** — over budget |

Arithmetic for the first row, so the rest can be checked: `115 GFLOP/s ÷ 1.19 GFLOP/token ≈ 97
tokens`; `230 ÷ 1.19 ≈ 193 tokens`. The optimistic end is independently corroborated by
de-rating the Ryzen 7950X result per core and per GHz: `1260 t/s ÷ 16 threads = 78.75 t/s/thread
× 4 cores × (3.0/5.0 GHz) ≈ 189 t/s` → 1 000 ms at 189 tokens, 512 tokens in 2.7 s — the same
number the FLOP route gives.

**Bottom line for the user's budget (<1 s per call, i5-1135G7):** on the llama.cpp/GGUF path only
the **EmbeddingGemma family** (2 K / 8 K context) and **bge-base-en-v1.5** stay under 1 s across
their whole supported input range. The two 0.6B Qwen3-backbone models are **over 1 s from roughly
128 tokens upward** — i.e. they break the budget on an ordinary 256-token chunk, not just on extreme
inputs. `jina-v5-text-nano` is safe to ~512 tokens and the safe member of the jina family.

Three caveats on the verdict:
1. It is a **llama.cpp** verdict. ONNX Runtime and OpenVINO batched GEMM can reach the 60–75 %
   efficiency point rather than 30 % (A18, A20), which would roughly halve the Qwen3 numbers — but
   only in batched mode, and the user's workload is single-call. For single-call the 30 % end applies.
2. It assumes `-t 4` (physical cores). Leaving the default 8 threads on this 4-core part costs
   ~20–50 % (A5, and the hybrid-CPU measurements in the llama.cpp laptop study).
3. It assumes a stock llama.cpp build. A build carrying the #24713 lm_head skip (B1–B3) removes
   26 % of Qwen3-Embedding-0.6B's FLOPs and pulls its 1 s crossing out to ~150–260 tokens.

**Recommended verification before committing:** the band above is 2× wide because nobody has
published a 4-core Tiger Lake number for any of these models. A 10-minute local run settles it:

```bash
llama-bench -m Qwen3-Embedding-0.6B-Q8_0.gguf   -embd 1 -ngl 0 -t 4 -p 128,512,2048 -n 0 -r 5
llama-bench -m embeddinggemma-300M-Q8_0.gguf    -embd 1 -ngl 0 -t 4 -p 128,512,2048 -n 0 -r 5
llama-bench -m v5-nano-text-matching-Q8_0.gguf  -embd 1 -ngl 0 -t 4 -p 128,512,2048 -n 0 -r 5
```

`-t 4` (physical cores, not 8) is the correct setting on this part per A5. `-embd 1` is the
documented embedding mode per A26.

---

## Models where CPU inference is documented as impractical

| Model | Evidence | Source | Conf. |
|---|---|---|---|
| `jina-embeddings-v3` | **0.55 sentences/s on CPU** (i7-13700K) vs 264.83 for bge-base — a 480× gap; Jina's own model page says it "requires CUDA-capable GPU for production throughput"; the architecture needs FlashAttention2 | https://huggingface.co/blog/static-embeddings ; https://jina.ai/models/jina-embeddings-v3 ; https://arxiv.org/html/2409.10173v3 | high |
| `Qwen3-Embedding-4B` / `-8B` | 4B: 16 GB fp32 / 8 GB fp16 / 4 GB int8 / 2 GB Q4; 8B: 32/16/8/4 GB. 8B cannot fit 15 GB at fp16 | F5 (QwenLM) | high |
| TEI on CPU generally | No CPU batching (maintainer-confirmed), thread-pool mis-detection under cgroup limits, and 2.4× slower than Sentence-Transformers for the same model on the same host | A23, A24, A25 | high |

**Note on jina-v5 (the *v5* family, not v3):** the opposite is true — Jina explicitly ships CPU
containers for `jina-embeddings-v5-text-nano` and calls it "**CPU-friendly**" and appropriate for
"first-time test / **latency-critical**" use (B8). The v3 CUDA caveat does **not** carry over to v5.

---

## Searches (query strings used)

1. `"Qwen3-Embedding-0.6B" CPU latency ms benchmark ONNX llama.cpp`
2. `"jina-embeddings-v5" CPU latency benchmark tokens per second GGUF`
3. `"embeddinggemma" CPU latency benchmark tokens per second`
4. `llama.cpp embedding benchmark tokens per second CPU i5 i7`
5. `llama-bench embedding bge-base-en-v1.5 CPU pp512 tokens per second results`
6. `text-embeddings-inference benchmark latency CPU tokens per second gte bge`
7. `jina-embeddings-v3 CPU inference CUDA required impractical`
8. `onnxruntime embedding model CPU latency benchmark all-MiniLM bge tokens per second`
9. `"jina-embeddings-v5" llama-bench pp512 CPU t/s nano small`
10. `"i5-1135G7" OR "Tiger Lake" llama.cpp tokens per second benchmark embedding`
11. `"embeddinggemma-2" OR "EmbeddingGemma 2" CPU latency ms on-device benchmark laptop`
12. `ollama embeddinggemma CPU embeddings per second benchmark tokens`
13. `"Qwen3-Embedding-0.6B" ONNX Runtime CPU inference latency milliseconds fastembed`
14. `"multilingual-e5-large" CPU latency ms per sentence benchmark laptop`
15. `"embeddinggemma" llama.cpp CPU pp512 tokens per second benchmark laptop`
16. `llama.cpp "lm_head" embedding mode skip merged PR 2026 build_lm_head`
17. `"granite-embedding" OR "embeddinggemma" llama.cpp EPYC 7702P wrk RPS p50 blog September 2025`
18. `text-embeddings-inference CPU throughput "sentences/s" OR "sent/s" Xeon benchmark results issue`
19. `llama.cpp embeddinggemma gemma-embedding CPU pp512 benchmark slow discussion`

---

## Conflicting evidence

1. **`jina-embeddings-v3` on CPU — impossible vs supported.** Jina's model page says CUDA is required
   for production throughput, and the HF blog measures 0.55 sent/s; but jina-on-prem still ships a
   `jina-embeddings-v3` CPU container and lists it at ~3 GB. Resolution: *technically runnable,
   practically unusable* — 0.55 sent/s is ~1.8 s per sentence, over the user's whole budget for one
   call. The two sources disagree about *feasibility*, not about *speed*.
2. **TEI CPU vs Sentence-Transformers.** TEI is marketed as "blazing fast inference" but its only
   published benchmark is on an A10 GPU (A25); the CPU issues thread reports it being **2.4× slower**
   than a naive FastAPI + ST server on the same host (A23). Anyone reading the TEI README and
   planning a CPU deployment is being misled.
3. **"llama.cpp is memory-bandwidth-bound."** Widely repeated, and true for decode. It is **not**
   true for embedding prefill at these model sizes (639 MB weights read once ≈ 18 ms out of a
   1–5 s call). Claims that DDR4 bandwidth caps embedding throughput on this laptop are wrong by an
   order of magnitude.
4. **`llama.cpp` vs `ik_llama.cpp` on the same CPU.** 1 260 vs 3 100 t/s on a Ryzen 7950X for the
   same model and quant (A4) — a 2.46× spread *within the llama.cpp family*. Any single "llama.cpp
   CPU t/s" figure for these models carries that as irreducible spread.
5. **Sibling F5 finding vs this file on `jina-embeddings-v3`.** F5 records "CUDA required" as
   `primary` from jina.ai; this file records the same claim but adds the contradicting CPU container
   listing. Both are correct; the resolution is in item 1.
6. **`embeddinggemma-300M` LiteRT CPU numbers (A14) vs `embeddinggemma.c` M5 numbers (A9).** A14
   gives 169 ms @512 tokens; A9 gives 30.5 ms @32 tokens and 1.52 s @2 048 tokens on an M5 Max.
   These are different runtimes, different quantisations (int4 QAT vs Q4_0) and different hardware
   classes, so they do not directly conflict — but neither can be transferred to a Tiger Lake
   laptop without the derivation above.

---

## Gaps

1. **No published CPU benchmark exists for any of the three target models on any 4-core Intel
   laptop.** The nearest is `treeru`'s pseudonymised "6-core laptop" (A16) and "4-core mini PC".
   Every Qwen3-Embedding-0.6B CPU number in the wild is either a ≥16-core desktop (A2/A4), a phone
   (A27), or hardware-unstated (A1/A22).
2. **No single-call latency at a stated token length** is published for `Qwen3-Embedding-0.6B`,
   `jina-v5-text-small`, or `jina-v5-text-nano` on any x86 CPU. All Qwen3-Emb-0.6B CPU numbers are
   `pp512`-style batch throughput.
3. **`embeddinggemma-300m`'s LiteRT card is gated (HTTP 401).** The 66/169/549/2455 ms table is
   reproducible from two independent reads but I could not fetch the page to confirm the CPU model
   or the exact quantisation recipe first-hand. Marked `med` in A14.
4. **No CPU numbers at all for `embeddinggemma-2` under llama.cpp/GGUF.** The only published
   latency is LiteRT-LM at a 128-token signature (A12). The GGUF route (`ggml-org/embeddinggemma-2-GGUF`,
   arch `gemma-embedding2`) exists per F11 but has never been benchmarked on CPU publicly.
5. **`jina-v5-text-nano` uses arch `eurobert` with `attention.causal=0`.** llama.cpp has the arch
   registered (F11) but there is **no published `llama-bench -embd 1` result** for any eurobert
   model, so the derived 0.32 GFLOP/token cannot be cross-checked against a real run.
6. **Issue #24713's CPU gain was measured on `qwen2`, not `qwen3`.** The +40.6 % CPU figure is a
   proxy; the actual qwen3-arch gain is unpublished, though the source read (B2) confirms the same
   wasted matmul is present.
7. **No published measurement of `lm_head`-skipped Qwen3-Embedding-0.6B on CPU**, so the 26 %-of-FLOPs
   share in my derivation is arithmetic, not measurement.
8. **`jina-embeddings-v5-*` GGUF repos publish no `llama-bench` output**, despite the model card
   instructing users to build upstream llama.cpp and run `llama-embedding` (the card only shows the
   invocation, never a timing).
9. **No Intel AMX/VNNI-specific analysis for Tiger Lake.** Tiger Lake has AVX2-VNNI but not AVX-512
   or AMX; the only VNNI-aware Intel benchmarks found (A18, A20) are on Meteor Lake and Sapphire
   Rapids, which have AVX-512-VNNI and AMX respectively — so their INT8 speedups (3.5× and ~3.8×)
   do not transfer to Tiger Lake's narrower int8 path.
10. **No published measurement of the per-call overhead floor.** The QuixiAI numbers (A9) show
   32-token throughput *lower* than 2048-token throughput (1 051 vs 1 350 tok/s), implying a fixed
   per-request cost that dominates short inputs — but no one has quantified that floor for
   llama.cpp on x86, and it is what determines whether a 128-token call is 50 ms or 500 ms.
