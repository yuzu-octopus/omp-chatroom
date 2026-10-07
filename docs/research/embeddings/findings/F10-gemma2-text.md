# F10 — EmbeddingGemma-2 Text Encoder (Text-Only Rule)

## Angle

Investigate `google/embeddinggemma-2` text encoder for local CPU-only retrieval. Determine if MTEB scores exist, reconcile benchmark variants, check live leaderboard, find text-only artifacts, and assess GGUF viability for Path 3.

## Claims

### 1. Model Card Numbers (Confirmed)

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| 740M total = 270M text (130M transformer + 140M embedder) + 170M vision + 300M audio | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| Dim 768 (MRL 128/256/512) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| Context 8192 | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| Apache-2.0 license | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| Text-only load via `config_kwargs={"vision_config": None, "audio_config": None}` | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Multilingual v2) 61.36 at 768d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Eng v2) 68.46 at 768d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Code v1) 78.68 at 768d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Multilingual v2) 57.89 at 128d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Eng v2) 65.68 at 128d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| MTEB(Code v1) 71.41 at 128d | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| Must NOT run float16 (use bfloat16/float32) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |

**Table caption (verbatim):** "EmbeddingGemma 2 was evaluated across text, code, vision, visual document, video, and audio embedding benchmarks. All results reported below use the full-precision checkpoint."

**Snapshot date:** Not explicitly stated on card. Model created 2026-09-14, announced 2026-10-06.

### 2. MTEB Variant Reconciliation

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| 61.36 is on MTEB(Multilingual, v2) — NOT MTEB(eng, v2) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| 68.46 is on MTEB(eng, v2) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |
| 78.68 is on MTEB(Code, v1) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | High |

**Truncation table caption (verbatim):** "MTEB *(multilingual, v2) Mean(Task)*", "MTEB *(eng, v2) Mean(Task)*", "MTEB *(code, v1) Mean(Task)*"

**Reconciliation:** The card uses full benchmark names. 61.36 is on the Multilingual variant (131 tasks), NOT the English variant (41 tasks). This is the same pattern as jina-v5 — the card publishes MTEB(Multilingual, v2) as the headline number, not MTEB(eng, v2). The English score (68.46) is published separately in the truncation table.

### 3. Live MTEB Leaderboard Backend

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| No `embeddinggemma-2` rows in MTEB(eng, v2) live backend | https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores | 2026-10-07 | High |
| No `embeddinggemma-2` rows in MTEB(Multilingual, v2) live backend | https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29/scores | 2026-10-07 | High |
| Only `google/embeddinggemma-300m` (v1) appears on live leaderboard | https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores | 2026-10-07 | High |

**Implication:** The card's MTEB scores are self-reported by Google, not independently verified by the MTEB backend. The live leaderboard has not yet integrated embeddinggemma-2.

### 4. Text-Only Artifacts

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| `litert-community/embeddinggemma-2-text-270m-litert-lm` exists (created 2026-09-29, modified 2026-10-06) | https://huggingface.co/api/models/litert-community/embeddinggemma-2-text-270m-litert-lm | 2026-10-07 | High |
| `jayyun98/embeddinggemma-2-text-270m` exists (created 2026-10-06) — sentence-transformers compatible | https://huggingface.co/api/models/jayyun98/embeddinggemma-2-text-270m | 2026-10-07 | High |
| jayyun98 text-only: 271,002,624 params, 768d, 8192 context, Apache-2.0, BF16, 542.06 MB | https://huggingface.co/jayyun98/embeddinggemma-2-text-270m/raw/main/README.md | 2026-10-07 | High |
| jayyun98 text-only: exact tensor equality with source checkpoint verified | https://huggingface.co/jayyun98/embeddinggemma-2-text-270m/raw/main/README.md | 2026-10-07 | High |
| jayyun98 text-only: "No benchmark suite or hardware speedup was measured" | https://huggingface.co/jayyun98/embeddinggemma-2-text-270m/raw/main/README.md | 2026-10-07 | High |

**Additional text-only variants found:**
- `jayyun98/embeddinggemma-2-text-270m-bf16`
- `jayyun98/embeddinggemma-2-text-270m-fp32`
- `jayyun98/embeddinggemma-2-text-270m-mlx-bf16`
- `jayyun98/embeddinggemma-2-text-270m-mlx-fp32`

### 5. GGUF Availability

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| `ggml-org/embeddinggemma-2-GGUF` created 2026-10-06 | https://huggingface.co/api/models/ggml-org/embeddinggemma-2-GGUF | 2026-10-07 | High |
| ggml-org files: `embeddinggemma-2-BF16.gguf`, `embeddinggemma-2-Q8_0.gguf`, `mmproj-embeddinggemma-2-BF16.gguf`, `mmproj-embeddinggemma-2-Q8_0.gguf` | https://huggingface.co/api/models/ggml-org/embeddinggemma-2-GGUF | 2026-10-07 | High |
| `unsloth/embeddinggemma-2-GGUF` created 2026-10-06 | https://huggingface.co/api/models/unsloth/embeddinggemma-2-GGUF | 2026-10-07 | High |
| unsloth files: `embeddinggemma-2-BF16.gguf`, `embeddinggemma-2-F16.gguf`, `embeddinggemma-2-Q8_0.gguf`, `embeddinggemma-2-UD-Q4_K_XL.gguf`, `embeddinggemma-2-UD-Q5_K_XL.gguf`, `embeddinggemma-2-UD-Q6_K_XL.gguf`, `mmproj-BF16.gguf`, `mmproj-F16.gguf`, `mmproj-Q8_0.gguf` | https://huggingface.co/api/models/unsloth/embeddinggemma-2-GGUF | 2026-10-07 | High |
| Both GGUF repos are MULTIMODAL builds (contain mmproj vision projection files) | https://huggingface.co/api/models/ggml-org/embeddinggemma-2-GGUF | 2026-10-07 | High |
| No text-only GGUF exists for embeddinggemma-2 | https://huggingface.co/api/models?search=embeddinggemma-2-GGUF | 2026-10-07 | High |

**Path 3 viability:** GGUF builds are multimodal (include mmproj). Running text-only via GGUF would require stripping mmproj or finding a text-only GGUF. The `ggml-org` README says "Run with https://llama.app" and "llama serve -hf ggml-org/embeddinggemma-2-GGUF" — this is a full multimodal server, not text-only. Path 3 is technically possible but requires running the full 740M model (or manually stripping mmproj).

### 6. MTEB Scores for 270M Text Layer Specifically

| Claim | Source URL | Fetch Date | Confidence |
|---|---|---|---|
| No MTEB scores published for the 270M text layer as a standalone artifact | https://huggingface.co/jayyun98/embeddinggemma-2-text-270m/raw/main/README.md | 2026-10-07 | High |
| Card MTEB scores are for the full model (text encoder active, but benchmarked as part of the full checkpoint) | https://huggingface.co/google/embeddinggemma-2/raw/main/README.md | 2026-10-07 | Medium |

**What would resolve it:** Run MTEB(eng, v2) and MTEB(Multilingual, v2) on the `jayyun98/embeddinggemma-2-text-270m` export using the `mteb` Python library. The jayyun98 card explicitly states "No benchmark suite or hardware speedup was measured."

## Searches

- `https://huggingface.co/google/embeddinggemma-2/raw/main/README.md`
- `https://ai.google.dev/gemma/docs/embeddinggemma`
- `https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2`
- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`
- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29/scores`
- `https://huggingface.co/api/models/litert-community/embeddinggemma-2-text-270m-litert-lm`
- `https://huggingface.co/api/models/jayyun98/embeddinggemma-2-text-270m`
- `https://huggingface.co/api/models/ggml-org/embeddinggemma-2-GGUF`
- `https://huggingface.co/api/models/unsloth/embeddinggemma-2-GGUF`
- `https://huggingface.co/api/models?search=embeddinggemma-2-text&limit=20`
- `https://huggingface.co/api/models?search=embeddinggemma-2-GGUF`

## Conflicting Evidence

- **Card vs. live leaderboard:** The card publishes MTEB scores (61.36/68.46/78.68) but the live MTEB backend has zero rows for `embeddinggemma-2`. This means the scores are self-reported by Google and not yet independently verified by the MTEB evaluation harness.
- **Text-only export vs. full model scores:** The jayyun98 text-only export claims exact tensor equality with the source checkpoint, but the card's MTEB scores were presumably run on the full model (with vision/audio encoders loaded but not used for text tasks). It is unclear if the text-only export would achieve identical MTEB scores, though the tensor equality suggests it should.

## Gaps

- No independent MTEB evaluation of embeddinggemma-2 exists (live leaderboard has no rows).
- No MTEB scores for the 270M text layer as a standalone artifact.
- No text-only GGUF exists — only multimodal GGUF builds with mmproj.
- The card does not state a snapshot date for the benchmark results.
- The Google docs page (`ai.google.dev/gemma/docs/embeddinggemma`) does not contain the MTEB benchmark table — it only appears on the HF model card and unsloth README.
- The blog post (`blog.google/...embeddinggemma-2`) does not mention MTEB scores.
