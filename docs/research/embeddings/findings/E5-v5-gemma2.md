# E5 — Round-2 merge: jina-v5, EmbeddingGemma-2 text encoder, Path-3 servability, metric-scale reconciliation

Merged 2026-10-07 from round-2 worker findings:
- `F9-jina-v5.md` (jina-v5 scale reconciliation + full evaluation; 34 sources)
- `F10-gemma2-text.md` (EmbeddingGemma-2 text encoder; 12 sources)
- `F11-gguf-servability.md` (CPU-servable build audit; 24 sources)
- `F12-scale-reconcile.md` (MTEB aggregation reconciliation; 10 sources)

Merge rule: every claim traces to one of those files. All fetch dates 2026-10-07. No independent
search by this merge except the direct live-leaderboard reads noted in §B, which were performed by
the orchestrator against the same primary endpoint.

## Angle

Fix two round-1 defects: (1) jina-embeddings-v5 was omitted from the ranked tables although it is
a serious CPU-feasible candidate; (2) EmbeddingGemma-2 was dismissed as "no MTEB scores" without
checking. Both required first reconciling the MTEB metric scales, because round 1 placed card
figures beside live-leaderboard figures without proving they were the same metric.

## Claims

### A. Metric-scale reconciliation (the blocker, now resolved)

- **`MTEB(eng, v2)` = 41 tasks, 7 task types; `MTEB(eng, v1)` = 56; `MTEB(Multilingual, v2)` =
  131, 9 task types; `BEIR` = 15, 1 task type.** Each exposes three aggregations: `mean_task`
  ("Mean (Task)"), `mean_task_type` ("Mean (TaskType)"), and per-type columns. `mean_task` is the
  unweighted mean over all tasks; `mean_task_type` is the mean of per-type means. / live backend
  `/v1/benchmarks/...` + `mteb/benchmarks/_benchmark_metrics.py` / 2026-10-07 / **primary**
- **A modern card's "MTEB English v2 N.N" = live `meanTask`.** Two independent Rosetta stones:
  Qwen3-Embedding-0.6B card "Mean(Task) 70.70 / Mean(Type) 64.88" vs live 70.47 / 64.88;
  EmbeddingGemma-300m card "Mean(Task) 69.67" and "MMTEB Mean(Task) 61.15" vs live 69.67 / 61.15
  (exact). / HF cards + live backend / 2026-10-07 / **primary**
- **jina-v5's "71.7 on MTEB English v2" IS `meanTask`** — the paper's Table 3 is captioned
  "MTEB(eng, v2) Evaluation Results" with columns `Avg Tasks` / `Avg Type`, and the live board's
  omni-small row (identical text embeddings) gives `meanTask = 0.7177546` → 71.78. So round 1's
  omission of jina-v5 was an omission, **not** a metric-scale error. / arXiv 2602.15547v1 + live
  backend / 2026-10-07 / **primary**
- **Round-1/F12 claim "jina-v5 is not on the live leaderboard" was wrong** — the rows are in
  `/v1/benchmarks/<b>/scores`; the 404 came from a non-existent route
  (`/v1/benchmarks/<b>/models/<name>`). / F9 §Conflicting / 2026-10-07 / **primary**
- **Safe comparison rule:** card "Mean (Task)" → live "Mean (Task)" column; card "Mean (Type)" →
  live "Mean (TaskType)" column; never mix the two, never mix suites. jina-v5-text-small's own
  live `meanTask` is `null` (3 missing Classification tasks); the omni-small row supplies the
  proxy 71.78. / F12 / 2026-10-07 / **primary**

### B. jina-embeddings-v5 — the omitted family (all four repos `cc-by-nc-4.0`)

Live MTEB(eng, v2), snapshot 2026-10-05 (refetched 2026-10-07, values identical):

| Model | Rank | Mean(Task) | Mean(Type) | Ret | Cls | Clu | STS | Pair | dim | ctx | params | licence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| jina-v5-omni-small | 14 | **71.78** | 65.68 | 60.07 | 90.75 | 54.69 | 88.13 | 84.95 | 1024 | 32768 | 1.626B | cc-by-nc-4.0 |
| jina-v5-text-nano | 18 | **71.11** | 65.22 | 58.80 | 90.07 | 53.49 | 88.28 | 84.74 | 768 | 8192 | 0.212B | cc-by-nc-4.0 |
| jina-v5-omni-nano | 18 | 71.11 | 65.22 | 58.80 | 90.07 | 53.49 | 88.28 | 84.74 | 768 | 8192 | 0.986B | cc-by-nc-4.0 |
| jina-v5-text-small | 38 | null (38/41) | null | 60.07 | — | 54.69 | 88.13 | 84.95 | 1024 | 32768 | 0.596B | cc-by-nc-4.0 |
| Qwen3-Embedding-0.6B (ref) | 26 | 70.47 | 64.72 | 61.83 | 84.58 | 54.05 | 86.57 | 84.37 | 1024 | 32768 | 0.596B | apache-2.0 |

/ live backend + F9 / 2026-10-07 / **primary**

- **The nano is the striking result:** 212M params, 8K ctx, Mean(Task) 71.11 — beats
  Qwen3-0.6B (70.47) overall and by 5.5 on Classification at ~1/3 the parameters. But it **loses
  Retrieval** (58.80 vs 61.83) and its context is 8K vs 32K. / F9 claims 2–4 / **primary**
- **Params reconciliation:** card 677M = 596M base + 4×20.2M LoRA (all four adapters loaded);
  card 239M = 212M base + 4×6.7M LoRA. HF `safetensors.total` reports base only. Live board
  reports base (`totalParamsB 0.596` / `0.212`). / F9 claims 8–10 / **primary**
- **omni text encoders are the v5-text backbones verbatim** — `text_config` identical, and the
  per-task cells match to floating-point noise (nano bit-identical). Text-only load via
  `model_kwargs={"modality": "text"}`. / F9 claims 11–12 / **primary**
- **nano context is 8192, not 32K** — spec table, `config.json`, press release, and live board all
  say 8192; the card prose and paper Table 1's 32K are the anomaly (RoPE θ 1M vs small's 3.5M;
  long-context training stage ran on small only). / F9 claim 14 + conflict / **primary**
- **Card's "67.7 MMTEB" for text-small is a card error** — paper 67.0, press release 67.0, live
  board 67.00. Nano's 65.5 is consistent everywhere. / F9 claim 5 + conflict / **primary**
- **Licence is machine-readable `cc-by-nc-4.0`** on all four repos and their GGUF repos; cards
  state "For commercial use, please contact us". The Apache-2.0 base licences do not propagate.
  **Not commercially usable.** / F9 claims 17–18 / **primary**

### C. EmbeddingGemma-2 — text encoder (text-only rule)

- **740M total = 270M text (130M transformer + 140M embedder) + 170M vision + 300M audio;**
  dim 768 (MRL 128/256/512); context 8192; **Apache-2.0**; text-only load via
  `config_kwargs={"vision_config": None, "audio_config": None}`. / HF card / 2026-10-07 / **primary**
- **Card scores (Mean(Task)): MTEB(eng, v2) 68.46, MTEB(Multilingual, v2) 61.36, MTEB(Code, v1)
  78.68** at 768d; 65.68 / 57.89 / 71.41 at 128d. Truncation-table caption confirms the variant
  per column. Snapshot date **not stated** on the card. / HF card / 2026-10-07 / **primary**
- **These are self-reported by Google — the live MTEB backend has zero `embeddinggemma-2` rows.**
  Only `embeddinggemma-300m` (v1) is on the board. / live backend + F10 §3 / 2026-10-07 / **primary**
- **Text-only artifact exists:** `jayyun98/embeddinggemma-2-text-270m` (271,002,624 params, 768d,
  8192 ctx, Apache-2.0, BF16, 542 MB) with **exact tensor equality** to the source checkpoint
  verified by the uploader; also `litert-community/embeddinggemma-2-text-270m-litert-lm`. **No
  benchmark was run on the standalone text export** — the card's scores are for the full
  checkpoint with the text path active. / F10 §4 / 2026-10-07 / **primary**
- **GGUF exists but is multimodal-only:** `ggml-org/embeddinggemma-2-GGUF` and
  `unsloth/embeddinggemma-2-GGUF` (both 2026-10-06) ship `mmproj-*` vision projectors; no
  text-only GGUF exists. llama.cpp arch `gemma-embedding2` is registered (commit 2026-10-06) —
  **brand-new, pin the commit.** / F10 §5 + F11 C4 / 2026-10-07 / **primary**
- **Must not run in float16** (activations exceed fp16 range) — use bfloat16 or float32. / card /
  **primary**

### D. Path-3 (self-hosted OpenAI-compatible) gate — GGUF/ONNX/TEI per candidate

Method: GGUF headers parsed byte-wise (`general.architecture`, `pooling_type`) — direct evidence.

- **Works today (GGUF/ONNX/listed):** Qwen3-Embedding-0.6B (`Qwen/Qwen3-Embedding-0.6B-GGUF`,
  arch `qwen3`, pooling last; also ONNX + TEI-listed + Ollama `qwen3-embedding:0.6b`);
  embeddinggemma-300m (`ggml-org/embeddinggemma-300M-GGUF`, arch `gemma-embedding`, pooling mean;
  ONNX; fastembed v0.8.1; Ollama); bge-m3 (`bert`, cls); bge-base/small-en-v1.5 (fastembed);
  multilingual-e5-large (fastembed — but `cstr/` GGUF is arch `xlmr`, **not llama.cpp-loadable**;
  use `phate334/`/`tatsuyaaaaaaa/` which are `bert`); all-MiniLM-L6-v2 (fastembed + Ollama);
  granite-embedding-english-r2 and -311m-multilingual-r2 (`modern-bert`); arctic-embed-l-v2.0
  (`bert`) and -m-long (`nomic-bert`); jina-v2-base-en (`jina-bert-v2`); nomic-v1.5 (`nomic-bert`);
  LFM2.5-Embedding-350M (`lfm2`, official GGUF, card documents `llama-server --embeddings`);
  jina-v5-text-small and -nano (**official GGUF**, 16 quants each, arch `qwen3` / `eurobert`);
  voyage-4-nano (community GGUF + official ONNX + TEI-listed). / F11 per-model table / **primary**
- **No usable CPU GGUF:** `NovaSearch/stella_en_400M_v5` — HF config `model_type:"new"` /
  `NewModel` with `auto_map`; llama.cpp has no `new` arch or converter. Only a mislabelled
  non-GGUF repo exists. ONNX is a doc-encoder-only research preview. / F11 C17 / **primary**
- **TEI gaps:** embeddinggemma-2 (no `gemma4`/`embedding_gemma2` in TEI's `enum Config`),
  jina-v5-text-nano (`eurobert`), LFM2.5 (`lfm2`) are **not TEI-supported**. jina-v5-text-small
  (Qwen3 arch) is plausible but doubtful because vLLM merges the task LoRA at load and TEI's
  Qwen3 path has no LoRA merge. / F11 C23 + conflict 7 / **primary (absence), medium (jina-small)**
- **fastembed published docs are stale** — the page lists 25 text models; `main` source contains
  39, including Qwen3-Embedding-0.6B, embeddinggemma-300m, granite-embedding-small-english-r2
  (all present in the v0.8.1 release, 2026-09-22). / F11 I8–I10 / **primary**

### E. Direct orchestrator reads (primary, live backend, 2026-10-07)

- MTEB(eng, v2) `/scores`: 340 rows. jina-v5 rows present (ranks 14/18/38); `embeddinggemma-2`
  absent; `LiquidAI/LFM2.5-Embedding-350M` and `voyageai/voyage-4-nano` absent.
- MTEB(Multilingual, v2) `/scores`: 131 tasks. jina-v5-text-nano `meanTask` 0.6552; omni-small
  0.67; text-small null (128/131); Qwen3-0.6B 0.6434; embeddinggemma-300m 0.6115; bge-m3 null.
- BEIR `/scores`: 15 tasks. jina-v5 `meanTask` null for all rows (board missing
  `CQADupstackRetrieval`); Qwen3-0.6B 55.52.
- MTEB(eng, v1) `/scores`: 56 tasks. Qwen3-0.6B `meanTask` 0.6705.
- **Correction to round 1:** the whitelisted model is `intfloat/multilingual-e5-large`, which on
  eng-v2 has partial coverage — Ret 51.53, Clu 42.07, STS 81.39, Pair 84.75, **no Mean(Task) or
  Classification cell**. Round 1's row quoted the *-instruct* variant's numbers (Ret 53.47 /
  Cls 75.71 / STS 84.72) under the non-instruct name. / orchestrator / **primary**

## Searches

Union of F9/F10/F11/F12 `## Searches`. Key endpoints: HF API `/api/models/{id}?full=true|?blobs=true`
for jina-v5 (4 repos + 4 GGUF repos + merged task repos), embeddinggemma-2 (+text exports, +GGUF),
and ~20 other candidates; live MTEB backend `/v1/benchmarks/{MTEB(eng,v2),MTEB(Multilingual,v2),BEIR,
MTEB(eng,v1)}/scores` and `/v1/models?name=…`; `mteb` source (`benchmarks.py`,
`_benchmark_metrics.py`); llama.cpp source (`llama-arch.cpp`, `llama-model.cpp`, `llama.h`,
`conversion/*.py` — all 98, `tools/server/server.cpp`); TEI source (`backends/candle/src/lib.rs`,
`enum Config`) + HF docs; vLLM pooling/embed docs; fastembed `fastembed/text/*.py` @ `main` and
`v0.8.1`; Infinity README; Ollama registry (`registry.ollama.ai` manifests, `ollama.com/library`);
arXiv 2602.15547 (jina-v5 text), 2605.08384 (jina-v5 omni/GELATO). GGUF headers read by HTTP Range.

## Conflicting evidence

1. **jina-v5-text-small card "67.7 MMTEB" vs paper/press/live "67.0".** 3 of 4 primary sources say
   67.0. **Winner: 67.0** (card error). Round-1 F1 propagated 67.7 — corrected.
2. **jina-v5-text-nano context 8192 vs 32K.** Four sources say 8192 (spec table, `config.json`,
   press release, live board); card prose and paper Table 1 say 32K but are internally inconsistent.
   **Winner: 8192.**
3. **jina-v5 params 677M/596M and 239M/212M.** Not a conflict — all-adapters-loaded vs base-only.
   Report both.
4. **F12 "jina-v5 not on the leaderboard" vs F9 "it is".** F12 used a non-existent route.
   **Winner: F9** — rows are present; `meanTask` for text-small is null due to 3 missing tasks, and
   omni-small supplies 71.78.
5. **`cstr/multilingual-e5-large-GGUF` arch `xlmr` vs llama.cpp arch list.** Not loadable by
   llama.cpp; the card targets CrispEmbed. **Winner: use `phate334/`/`tatsuyaaaaaaa/` (`bert`).**
6. **fastembed published docs (25 models) vs `main` source (39).** Docs are stale.
   **Winner: source tree.**
7. **Ollama `granite-embedding` (v1 30m/278m) vs granite r2 candidates.** Different generation —
   Ollama is not r2 support.
8. **EmbeddingGemma-2 card scores vs live board.** Card self-reported; board has zero rows.
   **Not a conflict** — card is the only source; marked self-reported, not independently verified.
9. **EmbeddingGemma-2 GGUF is multimodal (mmproj) — no text-only GGUF.** Path 3 works but loads the
   full model unless mmproj is stripped.
10. **Round-1 `multilingual-e5-large` row carried the `-instruct` variant's scores.** Corrected
    (see §E).

## Gaps

- No independent (MTEB-harness) evaluation of `embeddinggemma-2` or its 270M text export.
- jina-v5-text-small's own live `meanTask` is null (3 missing Classification cells); the omni-small
  proxy is used. BEIR `meanTask` null for all jina-v5 rows (missing `CQADupstackRetrieval`).
- No text-only GGUF for embeddinggemma-2.
- TEI support for jina-v5-text-small and stella unverified (arch-based inference only).
- GGUF numerics not validated against the transformers path for jina-v5 (headers read, no embedding
  computed).
- **No CPU throughput on the target i5-1135G7 for any of these models** — unchanged from round 1;
  the largest remaining gap.
- The MTEB(eng, v2) rank column is not monotone in `meanTask`; exact rank formula undocumented.

## Verdict

- Scale reconciled: modern card "MTEB English v2" = live `Mean (Task)`. jina-v5's 71.7 is the same
  metric as Qwen3-0.6B's 70.47 — round 1's omission was a coverage gap, not a metric error.
- jina-v5-text-nano (212M, 8K) **wins on quality-per-parameter** (Mean(Task) 71.11 vs 70.47;
  Classification 90.07 vs 84.58) but **loses the room's primary job, Retrieval** (58.80 vs 61.83)
  and is **CC-BY-NC-4.0 — not commercially usable**. It is a Path-3 model (official GGUF,
  Q4_K_M 157 MB).
- EmbeddingGemma-2's 270M text encoder (Apache-2.0, 8192 ctx, card 68.46 Eng-v2) is the best
  permissive small option on paper but is **self-reported only** and has no text-only GGUF.
- Licence is now a load-bearing column: jina-v5 (all four), NV-Embed-v2, SFR-Embedding-2_R, and
  jina-v3 are non-commercial.
- **Primary recommendation confirmed, not revised:** Qwen3-Embedding-0.6B (Apache-2.0, Path 3,
  best CPU-feasible Retrieval at 61.83, 32K ctx). The non-commercial alternative that would win on
  overall/classification quality is jina-v5-text-nano — blocked by licence.
