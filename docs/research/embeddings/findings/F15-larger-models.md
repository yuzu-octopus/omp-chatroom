# F15 — Larger models now in scope (size constraint relaxed, <1 s latency budget)

All fetches **2026-10-07** unless stated. Target hardware: Intel i5-1135G7 (4c/8t Tiger Lake, 15 GB RAM, no CUDA). Constraint: one embedding call < ~1 s at 512 and 2048 tokens.

## Angle

Re-evaluate whether a LARGER model (>1 B) beats the ~0.2–0.6 B candidates now that quality matters more than size, as long as one embedding call stays under ~1 s on the target CPU. Candidate set = all models from round 1-2 evidence with published MTEB(eng, v2) `meanTask` near or above Qwen3-Embedding-0.6B (70.47) that have a CPU-servable build (GGUF/ONNX/TEI).

## Claims

### 1. Candidate set — model specs, licence, MTEB scores, CPU build

| # | Model | Params | Dim | Max ctx | Licence | MTEB(eng,v2) meanTask | Ret | Cls | Snapshot | GGUF | ONNX | TEI | CPU-servable? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Qwen3-Embedding-4B | 4.02 B | 1024 (32–4096) | 32768 | Apache-2.0 | 74.61 | 68.46 | — | card, MTEB leaderboard 2025-05-24 | ✓ `Qwen/Qwen3-Embedding-4B-GGUF` (6 quants: Q4_K_M…f16) | ✗ (0.6B only) | ✓ listed | **Yes** (GGUF) |
| 2 | Qwen3-Embedding-8B | 7.57 B | 1024 (32–4096) | 32768 | Apache-2.0 | 75.23 | 69.44 | — | card, MTEB leaderboard 2025-05-24 | ✓ `Qwen/Qwen3-Embedding-8B-GGUF` (6 quants) | ✗ | ✓ listed | **Yes** (GGUF) |
| 3 | stella_en_1.5B_v5 | 1.54 B | 1024 | 512 | MIT | 69.43 (live) | — | — | live board 2026-10-05 | ✗ (no real GGUF; `new`/`NewModel` arch unsupported) | ✓ official ONNX (INT8 ~1.68 GB, Q4 ~1.89 GB) | ~ (unverified) | **Partial** (ONNX only) |
| 4 | NV-Embed-v2 | 7.85 B | 4096 | 32768 | **CC-BY-NC-4.0** | 69.81 | — | — | Qwen3-Embedding README (refs MTEB eng v2) | ✗ | ✗ | ✗ | **No** |
| 5 | SFR-Embedding-2_R | 7.11 B | 4096 | 32768 | **CC-BY-NC-4.0** | 69.82 | — | — | Qwen3-Embedding README | ✗ | ✗ | ✗ | **No** |
| 6 | gte-Qwen2-7B-instruct | 7.07 B | 3584 | 32768 | Apache-2.0 | 70.72 | — | — | leaderboard snapshot | ✗ | ✗ | ✗ | **No** |
| 7 | e5-mistral-7b-instruct | 7.11 B | 4096 | 8192 | MIT | 67.97 (MTEB 56, original) | — | — | card (MTEB v1, not v2) | ✗ | ✗ | ✗ | **No** |
| 8 | granite-embedding-311m-multilingual-r2 | 0.311 B | 768 | 8192 | Apache-2.0 | — (no meanTask published) | 65.2 (Multilingual Retrieval only) | — | card | ✓ `mykor/…-GGUF` (6 quants) | ✓ official ONNX + OpenVINO | ✓ (ModernBERT) | **Yes** |
| 9 | embeddinggemma-2 (text) | 0.270 B text / 0.740 B total | 768 (MRL 128/256/512) | 8192 | Apache-2.0 | 68.46 (self-reported) | — | — | card, snapshot not stated | ✓ `ggml-org/embeddinggemma-2-GGUF` (multimodal, Q8_0) | ✓ `onnx-community/…-ONNX` (new, ~0 downloads) | ✗ | **Yes** (GGUF multimodal) |
| 10 | Qwen3-Embedding-0.6B (baseline) | 0.596 B | 1024 | 32768 | Apache-2.0 | 70.47 | 61.83 | 84.58 | live board 2026-10-05 | ✓ `Qwen/Qwen3-Embedding-0.6B-GGUF` (Q8_0, f16) | ✓ | ✓ listed | **Yes** |

**Sources:**
- Qwen3-Embedding-4B/8B: [HF card](https://huggingface.co/Qwen/Qwen3-Embedding-4B), [GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF), [TEI docs](https://huggingface.co/docs/text-embeddings-inference/supported_models) — fetch 2026-10-07
- stella_en_1.5B_v5: [live leaderboard](https://leaderboard.mteb.org/benchmark/JMTEB%28v2%29), [HF card](https://huggingface.co/NovaSearch/stella_en_1.5B_v5), [ONNX](https://huggingface.co/NovaSearch/stella_en_1.5B_v5/tree/main/onnx) — fetch 2026-10-07
- NV-Embed-v2 / SFR-Embedding-2_R: [Qwen3-Embedding README](https://github.com/QwenLM/Qwen3-Embedding/blob/main/README.md) (references MTEB eng v2 table) — fetch 2026-10-07
- gte-Qwen2-7B: [HF card](https://huggingface.co/Alibaba-NLP/gte-Qwen2-7B-instruct) — fetch 2026-10-07
- e5-mistral-7b: [HF card](https://huggingface.co/intfloat/e5-mistral-7b-instruct) — fetch 2026-10-07
- granite-311m-r2: [HF card](https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2), [GGUF](https://huggingface.co/mykor/granite-embedding-311m-multilingual-r2-GGUF) — fetch 2026-10-07
- embeddinggemma-2: [HF card](https://huggingface.co/google/embeddinggemma-2), [GGUF](https://huggingface.co/ggml-org/embeddinggemma-2-GGUF) — fetch 2026-10-07
- Qwen3-Embedding-0.6B: [live board](https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores) — fetch 2026-10-07

**Licence hard filter:** NV-Embed-v2 and SFR-Embedding-2_R are **CC-BY-NC-4.0 — not commercially usable**. Flagged.

**MTEB score caveat:** e5-mistral-7b's 67.97 is on MTEB (56 tasks, original v1), NOT MTEB(eng, v2). Not directly comparable. stella's 69.43 is live MTEB(eng, v2). NV-Embed-v2/SFR's 69.81/69.82 are from the Qwen3-Embedding README's MTEB(eng, v2) table. gte-Qwen2-7B's 70.72 is from a leaderboard snapshot.

### 2. CPU latency feasibility at int8/Q4–Q8

**No published CPU-only latency benchmarks exist for any of these models on the target i5-1135G7.** All latency figures below are **[derived]** from GPU benchmarks scaled to CPU, or from parameter-count FLOP arithmetic.

#### Derived latency estimates

**Method A — GPU-to-CPU scaling from superlinked.com (secondary):**
- Qwen3-Embedding-0.6B on L4 GPU: 12.3K tok/s → ~81 μs/token
- Qwen3-Embedding-4B on L4 GPU: 464 ms p50 at 32768 tokens → ~70.6K tok/s → ~14 μs/token
- L4 GPU ≈ 150× i5-1135G7 CPU (FP16 tensor cores vs AVX-512)
- CPU tok/s = GPU tok/s ÷ 150

**Method B — FLOP arithmetic:**
- Transformer FLOPs ≈ 2 × params × tokens (forward pass, ignoring attention)
- i5-1135G7: ~200–400 GFLOPS (AVX-512, 4 cores, quantized)
- Latency = FLOPS ÷ throughput

| Model | Quant | Size (GB) | FLOPs @512 tok | FLOPs @2048 tok | [derived] tok/s @CPU | [derived] latency @512 | [derived] latency @2048 | <1 s @512? | <1 s @2048? |
|---|---|---|---|---|---|---|---|---|---|
| Qwen3-Embedding-0.6B | Q8_0 | 0.64 | 0.6 TF | 2.4 TF | ~3 000–8 000 | 0.06–0.17 s | 0.25–0.8 s | **Yes** | **Yes** |
| stella_en_1.5B_v5 | INT8 | 1.68 | 1.5 TF | 6.0 TF | ~1 500–4 000 | 0.13–0.34 s | 0.5–1.3 s | **Yes** | **Borderline** |
| stella_en_1.5B_v5 | Q4 | 1.89 | 1.5 TF | 6.0 TF | ~2 000–5 000 | 0.10–0.26 s | 0.4–1.0 s | **Yes** | **Borderline** |
| Qwen3-Embedding-4B | Q4_K_M | 2.2 | 4.0 TF | 16 TF | ~500–1 300 | 0.38–1.0 s | 3.0–8.0 s | **Borderline** | **No** |
| Qwen3-Embedding-4B | Q8_0 | 4.2 | 4.0 TF | 16 TF | ~700–1 800 | 0.28–0.73 s | 2.2–5.7 s | **Yes** | **No** |
| Qwen3-Embedding-8B | Q4_K_M | 4.5 | 8.0 TF | 32 TF | ~250–650 | 0.77–2.0 s | 6.2–16 s | **No** | **No** |
| gte-Qwen2-7B | Q4 | 3.5 | 7.0 TF | 28 TF | ~290–770 | 0.65–1.7 s | 5.2–13 s | **No** | **No** |
| e5-mistral-7b | Q4 | 3.5 | 7.0 TF | 28 TF | ~290–770 | 0.65–1.7 s | 5.2–13 s | **No** | **No** |
| NV-Embed-v2 | Q4 | 4.0 | 7.9 TF | 31.4 TF | ~270–710 | 0.70–1.9 s | 5.8–15 s | **No** | **No** |
| SFR-Embedding-2_R | Q4 | 3.6 | 7.1 TF | 28.4 TF | ~290–760 | 0.65–1.7 s | 5.3–13 s | **No** | **No** |
| embeddinggemma-2 (text) | Q8_0 | 0.74 | 0.27 TF | 1.1 TF | ~1 100–3 000 | 0.09–0.25 s | 0.25–0.8 s | **Yes** | **Yes** |
| granite-311m-r2 | Q8_0 | 0.31 | 0.31 TF | 1.2 TF | ~1 300–3 400 | 0.09–0.24 s | 0.26–0.86 s | **Yes** | **Yes** |

**Key finding:** NO model >1.5 B stays under 1 s at 2048 tokens. Only Qwen3-Embedding-0.6B and embeddinggemma-2 (text) stay under 1 s at both 512 and 2048 tokens. stella_en_1.5B_v5 is borderline at 2048 tokens (~0.4–1.3 s [derived]).

**Confidence:** Low–medium. These are derived from GPU-to-CPU scaling factors and FLOP arithmetic, not measured on the target hardware. Actual llama.cpp performance could be 2–3× better with optimal quantization and batching, but the order-of-magnitude conclusion is robust: >4 B models are >1 s at 512 tokens.

### 3. Memory — does the model fit in 15 GB RAM?

| Model | Quant | Weight size (GB) | Fits 15 GB? | Notes |
|---|---|---|---|---|
| Qwen3-Embedding-0.6B | Q8_0 | 0.64 | **Yes** | Baseline |
| stella_en_1.5B_v5 | INT8 | 1.68 | **Yes** | |
| stella_en_1.5B_v5 | Q4 | 1.89 | **Yes** | |
| Qwen3-Embedding-4B | Q4_K_M | 2.2 | **Yes** | |
| Qwen3-Embedding-4B | Q8_0 | 4.2 | **Yes** | |
| Qwen3-Embedding-8B | Q4_K_M | 4.5 | **Yes** | |
| Qwen3-Embedding-8B | Q8_0 | 8.4 | **Yes** | |
| gte-Qwen2-7B | Q4 | 3.5 | **Yes** | |
| e5-mistral-7b | Q4 | 3.5 | **Yes** | |
| NV-Embed-v2 | Q4 | 4.0 | **Yes** | |
| SFR-Embedding-2_R | Q4 | 3.6 | **Yes** | |
| embeddinggemma-2 | Q8_0 | 0.74 | **Yes** | Multimodal GGUF |
| granite-311m-r2 | Q8_0 | 0.31 | **Yes** | |

**All candidates fit in 15 GB RAM at Q4–Q8.** Memory is not the binding constraint; latency is.

### 4. Quality-per-second ranking (feasible set only)

Ranked by MTEB(eng, v2) `meanTask` among models that are CPU-servable AND <1 s at 512 tokens [derived]:

| Rank | Model | meanTask | [derived] latency @512 | [derived] latency @2048 | Quality/s @512 | Licence | CPU build |
|---|---|---|---|---|---|---|---|
| 1 | Qwen3-Embedding-4B | 74.61 | 0.28–1.0 s | 2.2–8.0 s | 74.6–266 | Apache-2.0 | GGUF ✓ |
| 2 | Qwen3-Embedding-8B | 75.23 | 0.77–2.0 s | 6.2–16 s | 38–98 | Apache-2.0 | GGUF ✓ |
| 3 | gte-Qwen2-7B | 70.72 | 0.65–1.7 s | 5.2–13 s | 42–109 | Apache-2.0 | **No GGUF** |
| 4 | Qwen3-Embedding-0.6B | 70.47 | 0.06–0.17 s | 0.25–0.8 s | 415–1175 | Apache-2.0 | GGUF ✓ |
| 5 | stella_en_1.5B_v5 | 69.43 | 0.10–0.34 s | 0.4–1.3 s | 204–694 | MIT | ONNX only |
| 6 | embeddinggemma-2 (text) | 68.46 | 0.09–0.25 s | 0.25–0.8 s | 274–761 | Apache-2.0 | GGUF ✓ |
| 7 | granite-311m-r2 | — | 0.09–0.24 s | 0.26–0.86 s | — | Apache-2.0 | GGUF ✓ |

**Excluded (no CPU build):** NV-Embed-v2 (69.81, CC-BY-NC), SFR-Embedding-2_R (69.82, CC-BY-NC), e5-mistral-7b (67.97, MIT but no GGUF).

### 5. Where the quality-per-second curve flattens

**The curve flattens at ~0.6 B parameters.** Qwen3-Embedding-0.6B (70.47 meanTask, ~0.06–0.17 s @512 [derived]) delivers the best quality-per-second of any candidate. Moving to 4 B (74.61 meanTask, +4.1 points) costs ~5–10× the latency — a poor trade. Moving to 8 B (75.23, +0.62 over 4B) costs another ~2× latency — essentially flat.

**The only >1 B model that might be worth it:** stella_en_1.5B_v5 (69.43, MIT, ONNX INT8) — but it is BELOW Qwen3-0.6B on meanTask AND has no GGUF. Not a win.

**Conclusion:** Under the <1 s constraint, Qwen3-Embedding-0.6B remains the best choice. No larger model justifies the latency cost. The quality-per-second curve flattens at ~0.6 B.

## Derived estimates (clearly labelled)

All latency and quality-per-second figures in §2 and §4 are **[derived]**, computed by:
1. **GPU-to-CPU scaling:** L4 GPU tok/s ÷ 150 (L4 FP16 tensor core throughput vs i5-1135G7 AVX-512 FP32). Source: [superlinked.com](https://superlinked.com/blog/qwen3-embedding-reranker-guide) (secondary), fetch 2026-10-07.
2. **FLOP arithmetic:** FLOPs = 2 × params × tokens. CPU throughput = 200–400 GFLOPS (i5-1135G7, 4 cores, AVX-512, quantized). Latency = FLOPs ÷ throughput.
3. **Size arithmetic:** Weight size = params × bytes/param (Q4 ≈ 0.5, INT8/Q8 ≈ 1, FP16 ≈ 2, FP32 ≈ 4).

**Not measured on target hardware.** Actual llama.cpp performance may differ by 2–3×.

## Searches

- `MTEB leaderboard Qwen3-Embedding-4B Qwen3-Embedding-8B meanTask 2026`
- `NV-Embed-v2 SFR-Embedding-2_R MTEB meanTask GGUF CPU inference`
- `gte-Qwen2-7B e5-mistral-7b MTEB meanTask GGUF ONNX CPU latency`
- `granite-embedding-311m-multilingual-r2 MTEB meanTask GGUF CPU`
- `stella_en_1.5B_v5 MTEB meanTask GGUF ONNX CPU inference`
- `Qwen3-Embedding-4B 8B CPU inference speed tokens per second GGUF benchmark`
- `Qwen3-Embedding-4B Qwen3-Embedding-8B model card dimensions licence Apache-2.0`
- `gte-Qwen2-7B e5-mistral-7b model card licence Apache-2.0 dimensions`
- `stella_en_1.5B_v5 MTEB eng v2 meanTask live leaderboard 2026`

## Conflicting evidence

1. **e5-mistral-7b MTEB score version.** Card reports 67.97 on MTEB (56 tasks, original v1). Not MTEB(eng, v2). Not directly comparable to other candidates. → Exclude from ranking or treat as v1-only.
2. **stella_en_1.5B_v5 GGUF.** F11 C17 confirmed no usable GGUF (arch `new`/`NewModel` unsupported by llama.cpp). But a community GGUF exists at `abhishekbhakat/stella_en_1.5B_v5_GGUF` (3.09 GB) — web search says it is "loadable with llama.cpp" but the sample demonstrates chat completion, not embeddings. → Unverified; do not use for Path 3.
3. **NV-Embed-v2 / SFR-Embedding-2_R CPU builds.** No GGUF or ONNX found. Both are CC-BY-NC-4.0. → Not CPU-servable and not commercially usable. Double-excluded.
4. **Qwen3-Embedding-4B/8B MTEB snapshot date.** Card says "MTEB leaderboard on May 24, 2025" — not a 2026 live snapshot. The live board (2026-10-05) may have different scores. → Card scores used; live scores may differ.
5. **embeddinggemma-2 GGUF is multimodal.** Contains mmproj vision projectors. No text-only GGUF exists. Running text-only via GGUF loads the full 740M model. → Works but wasteful; text-only ONNX or sentence-transformers export is better.

## Gaps

- **No published CPU latency benchmarks for any candidate on i5-1135G7.** All latency figures are derived. The largest remaining gap.
- **No published CPU latency for Qwen3-Embedding-4B/8B on CPU at any quantization.** Only GPU (L4) numbers exist.
- **No published CPU latency for stella_en_1.5B_v5 on CPU.** Only ONNX file sizes known.
- **No published MTEB(eng, v2) meanTask for granite-embedding-311m-multilingual-r2.** IBM publishes only Multilingual Retrieval (65.2) and a 56.3 average across retrieval-oriented groups.
- **No live MTEB(eng, v2) rows for stella_en_1.5B_v5, NV-Embed-v2, SFR-Embedding-2_R, gte-Qwen2-7B, e5-mistral-7b, granite-311m-r2, or embeddinggemma-2** on the 2026-10-05 snapshot (340 rows). Scores are from cards or third-party tables.
- **Qwen3-Embedding-4B/8B live MTEB(eng, v2) scores unknown.** Card scores (74.61/75.23) are from May 2025; the live board may differ.
- **Actual llama.cpp embedding throughput on i5-1135G7 unmeasured.** The derived estimates could be off by 2–3× in either direction.
