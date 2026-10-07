# E6 — CPU latency on the target i5-1135G7 (round-3 merge)

Merged 2026-10-07 from:
- `F14-cpu-latency.md` (46 sources) — CPU latency for ~0.2–0.6B models
- `F15-larger-models.md` (14 sources) — larger models under the relaxed size constraint

Plus direct orchestrator reads of the live MTEB boards (noted inline).

## Angle

Round 1–2 had **no CPU latency data for Qwen3-Embedding-0.6B or jina-v5 at all** — the only Qwen3-0.6B
figures were L4 GPU. The user relaxed size but kept a **<1 s per embedding call** budget. This file
establishes what is actually published, what must be derived, and where each model crosses 1 s.

## Claims

### A. Published CPU latency/throughput (F14 §A)

| Model | Runtime / hardware | Figure | Conf. |
|---|---|---|---|
| Qwen3-Embedding-0.6B Q8_0 | llama.cpp, dual Xeon E5-2696 v3 (36C/72T) | **pp512 627.86 t/s** → 512 tok in 815 ms | high |
| Qwen3-Embedding-0.6B Q8_0 | ik_llama.cpp, same Xeon | pp512 1169 t/s → 512 tok in 438 ms | high |
| Qwen3-Embedding-0.6B Q8_0 | llama.cpp, Ryzen 7950X (16C/32T) | pp512 1260 t/s; ik_llama 3100 t/s | high |
| Qwen3-Embedding-0.6B Q4_0 | llama.cpp, Dimensity 9000+ phone, **4 threads** | **pp512 406.30 t/s** → 512 tok in **1.26 s** | high |
| Qwen3-Embedding-0.6B fp32 | PyTorch, RTX 4060 laptop | 18.9 samples/s (≈52.9 ms) | secondary |
| embeddinggemma-300M Q8_0 | llama-server, EPYC 7702P (6-core alloc) | short: p50 **15.7 ms**, 65 RPS; paragraph: p50 **193.9 ms**, 4 RPS | high |
| embeddinggemma-300M | LiteRT, CPU (model unstated) | 66 ms @256 / 169 @512 / 549 @1024 / 2455 @2048 | med (card gated) |
| embeddinggemma-2 text-270M | LiteRT-LM, Intel Core Ultra Series 3 laptop | **71.7 ms** @128 tok | high |
| embeddinggemma-2 text-270M | LiteRT-LM, various CPUs | M5 31.3 ms · RPi5 161 ms · Orin 207 ms @128 tok | high |
| bge-base-en-v1.5 | Sentence-Transformers, i7-13700K | 264.83 sent/s | high |
| bge-base-en-v1.5 | Sentence-Transformers, **6-core laptop / 4-core mini PC** | **75.6 / 42.8 sent/s** | med (hw pseudonymised) |
| multilingual-e5-large | same 6-core laptop / 4-core mini PC | **29.5 / 16.7 sent/s** | med |
| bge-m3 | OpenVINO, Core Ultra 7 155H (Meteor Lake) | INT8 82.9 samples/s, 12.1 ms single | high |
| jina-embeddings-v3 | Sentence-Transformers, i7-13700K | **0.55 sent/s** (480× slower than bge-base) | high |

### B. Runtime facts that change the answer (F14 §B)

- **llama.cpp runs `lm_head` in embedding mode for `qwen3`-arch models, then discards the logits.**
  Verified in source at master: `src/models/qwen3.cpp` builds `build_lora_mm(model.output, cur)`
  unconditionally → **Qwen3-Embedding-0.6B and jina-v5-text-small pay a wasted pass** worth **26 %
  of all CPU FLOPs**. `src/models/gemma-embedding.cpp` never builds lm_head → **EmbeddingGemma
  family does not pay it**. The fix (issue #24713) was **closed without merging**. / primary
  (direct source read)
- **TEI has no CPU batching** (maintainer-confirmed) and is **2.4× slower than a naive
  Sentence-Transformers server** for the same model on the same host. Its only published benchmark
  is an A10 GPU. / high
- **`-t 4` (physical cores), not 8** — hyper-threading "almost never helps" on this workload. / high
- **llama.cpp vs ik_llama.cpp spread is 2.46×** on identical hardware and model (1260 vs 3100 t/s).

### C. Derived single-call latency, i5-1135G7 (F14 §Derived — the operative table)

Method: per-token FLOPs from published architecture; achieved rate calibrated against real CPU
llama.cpp runs (A2 Xeon = 28 % of fp32 peak; A4 Ryzen ik_llama = 144 %, i.e. the INT8 path), giving
a **115–230 GFLOP/s** band. Cross-checked by per-core de-rating of the Ryzen result.

| Model (quant) | FLOP/token | 128 tok | 512 tok | 2048 tok | Crosses 1 s at |
|---|---|---|---|---|---|
| **Qwen3-Embedding-0.6B** Q8_0 | 1.19 GFLOP | 0.66–1.32 s | **2.7–5.3 s** | 11–21 s | **~100–190 tok** |
| ↑ with the #24713 lm_head skip | 0.88 GFLOP | 0.49–0.98 s | 2.0–3.9 s | 7.8–15.7 s | ~150–260 tok |
| **jina-v5-text-small** Q8_0 | ~1.33 GFLOP | 0.74–1.48 s | 3.0–5.9 s | 12–24 s | ~85–175 tok |
| **jina-v5-text-nano** Q8_0 | ~0.32 GFLOP | 0.18–0.36 s | **0.71–1.42 s** | 2.8–5.7 s | ~360–720 tok |
| **embeddinggemma-300m** Q8_0 | ~0.20 GFLOP | 0.11–0.22 s | **0.45–0.89 s** | 1.8–3.6 s | ~575–1150 tok |
| **embeddinggemma-2** text-270M | ~0.19 GFLOP | 0.10–0.21 s | 0.42–0.84 s | 1.7–3.4 s | ~605–1210 tok |
| bge-base-en-v1.5 INT8 | ~0.17 GFLOP | 0.09–0.19 s | 0.38–0.75 s | n/a (512 cap) | never |
| multilingual-e5-large INT8 | ~0.86 GFLOP | 0.48–0.96 s | **1.9–3.8 s** | n/a (512 cap) | ~135–270 tok |

**All rows `[derived]`.** The band is 2× wide and is the dominant uncertainty.

**Independent corroboration of the optimistic end:** the Dimensity 9000+ phone (4 ARM threads,
Q4_0) does 512 tokens in **1.26 s** — so F14's 115–230 GFLOP/s band for 4 x86 cores at ~3 GHz is
**conservative by ~2–4× versus a 2021 phone**; F14 states "the true answer is likely near the
optimistic end".

### D. Larger models under the relaxed constraint (F15)

- **All candidates fit 15 GB RAM at Q4–Q8.** Memory is not binding; latency is.
- **No model >1.5 B stays under 1 s at 2048 tokens** (derived). Qwen3-4B: 0.28–1.0 s @512,
  2.2–8.0 s @2048. Qwen3-8B: 0.77–2.0 s @512. gte-Qwen2-7B / e5-mistral-7B / NV-Embed-v2 /
  SFR-2_R: 0.65–2.0 s @512 and worse at 2048.
- **Quality-per-second flattens at ~0.6 B.** Qwen3-0.6B has the best quality-per-second of the set.
- NV-Embed-v2 and SFR-Embedding-2_R have **no GGUF/ONNX/TEI build** and are CC-BY-NC — double-excluded.
- stella_en_1.5B_v5: MIT, 1.54 B, ONNX-only (no llama.cpp arch) — and **below** Qwen3-0.6B on meanTask.

### E. F14 vs F15 conflict — resolved (see §Conflicting)

F15 estimated Qwen3-0.6B @512 at **0.06–0.17 s**; F14 estimates **2.7–5.3 s** — a ~20× gap.
**F14 wins**: F15 scaled L4 *GPU* throughput by a flat ÷150, while F14 calibrates against actual
*CPU* llama.cpp runs on three independent machines and cross-checks with a phone. F15's method
treats a tensor-core GPU/CPU ratio as a linear throughput divisor, which is not valid for a
compute-bound prefill. F15's own caveat ("could be off by 2–3×") understates it by an order.

### F. Direct orchestrator reads (primary, 2026-10-07)

- MTEB(Code, v1) `/scores`: 12 tasks, all Retrieval, nDCG@10. Qwen3-Embedding-0.6B rank 24,
  **meanTask 75.42**; google/embeddinggemma-300m rank 32, **68.76**; all four jina-v5 rows
  `meanTask` null (2/12 tasks). 51 of 257 rows have a full meanTask.
- CoIR `/scores`: 10 tasks. Qwen3-0.6B **74.96**; embeddinggemma-300m **67.29**.
- **New code-specialised candidates (missed in rounds 1–2):** `codefuse-ai/F2LLM-v2-0.6B`
  (0.596 B, Apache-2.0, Code **77.41**, eng-v2 meanTask 69.97 / Ret 54.31 / Cls 90.54) and
  `F2LLM-v2-1.7B` (1.721 B, Apache-2.0, Code **78.76**, eng-v2 meanTask 71.63 / Ret 56.65 /
  Cls 91.39). Both have community GGUF repos (`mradermacher/…`). `perplexity-ai/pplx-embed-v1-0.6b`
  (MIT, Code 75.85, MMTEB Ret 65.41) also has GGUF repos.

## Conflicting evidence

1. **F14 vs F15 on Qwen3-0.6B @512 (2.7–5.3 s vs 0.06–0.17 s).** **Winner: F14** — calibrated
   against real CPU runs; F15 used an invalid GPU÷150 divisor.
2. **`jina-embeddings-v3` CPU: impossible vs supported.** jina.ai says CUDA required; jina-on-prem
   ships a CPU container. Both true — *technically runnable, practically unusable* at 0.55 sent/s
   (≈1.8 s/call). **Winner: the measured 0.55 sent/s.**
3. **TEI marketed "blazing fast" vs 2.4× slower than a naive ST server on CPU.** TEI's only
   published benchmark is an A10 GPU. **Winner: the CPU issue thread (measured).**
4. **"llama.cpp is memory-bandwidth-bound."** True for decode, **false for embedding prefill** at
   these sizes (639 MB weights read once ≈ 18 ms of a 1–5 s call). **Winner: F14's arithmetic.**
5. **embeddinggemma-300M LiteRT 169 ms @512 vs embeddinggemma.c M5 1.52 s @2048.** Different
   runtimes, quants and hardware — not a direct conflict; neither transfers to Tiger Lake.

## Gaps

- **No published CPU benchmark for any target model on any 4-core Intel laptop.** Nearest is a
  pseudonymised 6-core laptop / 4-core mini PC (treeru).
- **No single-call latency at a stated token length** for Qwen3-0.6B, jina-v5-small or -nano on any
  x86 CPU — all Qwen3 CPU numbers are `pp512` batch throughput.
- `embeddinggemma-300m`'s LiteRT card is gated (HTTP 401); the 66/169/549/2455 ms table is
  reproducible from two independent reads but the CPU model is unconfirmed.
- No CPU numbers for embeddinggemma-2 under llama.cpp/GGUF (only LiteRT at 128 tok).
- No `llama-bench -embd 1` result for any `eurobert` model, so jina-v5-nano's 0.32 GFLOP/token is
  uncross-checkable.
- No published per-call overhead floor for llama.cpp embedding mode on x86.
- **The 2× band is irreducible without a local run** (a 10-minute `llama-bench -embd 1 -ngl 0 -t 4`
  run would settle it).

## Verdict

- Qwen3-Embedding-0.6B and jina-v5-text-small **likely exceed 1 s from roughly 128–190 tokens**
  upward on the target CPU (derived, 2× band). At 512 tokens they are 2.7–5.9 s.
- The **EmbeddingGemma family stays under 1 s across its supported range** (0.45–0.89 s @512) — and
  is structurally faster because its llama.cpp graph skips the wasted lm_head that the qwen3-arch
  models pay (26 % of FLOPs).
- jina-v5-text-nano is safe to ~512 tokens (0.71–1.42 s), i.e. the safe member of the jina family.
- **No model >1.5 B meets the budget at 2048 tokens**, and Qwen3-4B is borderline even at 512.
- **The user's <1 s budget is the binding constraint, and it changes the pick** — see E7.
