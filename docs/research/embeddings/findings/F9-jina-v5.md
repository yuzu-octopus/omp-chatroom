# F9 — jina-embeddings-v5: metric-scale reconciliation + full evaluation

Fetch date for all rows: **2026-10-07** unless a row states otherwise.

## Angle

The round-1 report compared the jina-v5 card figure "MTEB English v2 71.7" against
live-leaderboard numbers (Qwen3-Embedding-0.6B Mean(Task) 70.47 / Retrieval 61.83)
without establishing that both are the same metric, and F12 concluded the jina-v5 models
were **absent** from the live MTEB board. Both are now resolved:

1. The 71.7 / 71.0 figures **are** MTEB(eng, v2) Mean(Task) over the same 41 tasks —
   confirmed by both the paper's table and the live board.
2. The jina-v5 models **are** on the live MTEB board. The round-1/F12 "Not Found" was a
   wrong route (`/v1/benchmarks/<b>/models/<name>`, which 404s); the correct routes are
   `/v1/benchmarks/<b>/scores` (rows) and `/v1/models?name=<name>`.

Also covers: params (card-stated vs HF safetensors), dim/MRL, max context (spec table vs
prose vs config vs paper), licence, release date, base model, and CPU-servable
builds (GGUF / ONNX / TEI / llama.cpp / Ollama / vLLM).

## Claims (claim / source URL / fetch date / confidence per item)

### A. Metric reconciliation — the headline finding

1. **The card's "71.7 on MTEB English v2" for jina-v5-text-small IS MTEB(eng, v2)
   Mean(Task) over 41 tasks — the same metric as the live board's `meanTask` column
   and the same metric round-1 quoted for Qwen3-0.6B.**
   - Paper Table 3 is captioned verbatim: `*Table 3: MTEB(eng, v2) Evaluation Results*`,
     and its columns are `Avg Tasks` (= Mean(Task)) and `Avg Type` (= Mean(TaskType)).
     j-v5-text-small row: `71.7 | 65.6 | 90.4 | 54.7 | 85.0 | 49.4 | 60.1 | 88.1 | 31.8`
     (Avg Tasks 71.7, Avg Type 65.6; Cls/Clu/Pair/RR/Ret/STS/Sum).
   - Source: `https://arxiv.org/html/2602.15547v1` (§5.1, Table 3)
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, paper table)

2. **The live MTEB(eng, v2) board carries the jina-v5 rows, and the numbers land on the
   card figures.** Row `jinaai/jina-embeddings-v5-omni-small`:
   `meanTask = 0.7177546` → **71.78 ≈ 71.7**; `meanTaskType = 0.6567854` → **65.68 ≈ 65.6**;
   Retrieval 0.60074 → 60.07; Classification 0.90751 → 90.75; Clustering 0.54689 → 54.69;
   STS 0.88127 → 88.13; PairClassification 0.84952 → 84.95; Reranking 0.49385 → 49.39;
   Summarization 0.31773 → 31.77. Rank 14.
   - Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live leaderboard backend API)

3. **The v5-text-small row itself exists but reports `meanTask: null`**, because the board
   is missing 3 of the 41 tasks for that repo (`MassiveIntentClassification`,
   `MTOPDomainClassification`, `AmazonCounterfactualClassification` — all Classification).
   It carries 38/41 per-task scores and therefore no `scoresByTaskType.Classification`.
   The omni-small row (identical text embeddings — see claim 8) fills those 3 cells and
   produces the 71.78 that matches the card.
   - Source: same `/scores` endpoint as claim 2; also `/v1/models?name=jina-embeddings-v5-text-small`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live API)

4. **"71.0 on MTEB English v2" for nano IS Mean(Task) over 41 tasks.** Live row
   `jinaai/jina-embeddings-v5-text-nano`: `meanTask = 0.7111338` → **71.11 ≈ 71.0**;
   `meanTaskType = 0.6522176` → 65.22; Retrieval 0.58800 → 58.80; Classification
   0.90071 → 90.07; Clustering 0.53492 → 53.49; STS 0.88282 → 88.28;
   PairClassification 0.84737 → 84.74; Reranking 0.49226 → 49.23;
   Summarization 0.31945 → 31.95. Rank 18, all 41 tasks present.
   Paper Table 3 nano row: `71.0 | 65.2 | 89.7 | 53.5 | 84.7 | 49.2 | 58.8 | 88.3 | 31.9`.
   - Sources: `/scores` endpoint above; `https://arxiv.org/html/2602.15547v1` Table 3
   - Fetch date: 2026-10-07
   - Confidence: HIGH (two independent primary sources agree)

5. **"67.7 on MMTEB" (small) is NOT reproduced by any other primary source — treat as a
   card anomaly.** The paper's Table 2 (`*Table 2: MTEB (Multilingual, v2) Evaluation Results*`)
   gives j-v5-text-small `Avg Tasks = 67.0`; the Jina press release gives 67.0; the live
   MTEB(Multilingual, v2) board gives `meanTask = 0.6699977` → **67.00**. The card says 67.7.
   The nano figure is consistent everywhere: card 65.5, paper Table 2 65.5, press release
   65.5, live board `meanTask = 0.6552339` → **65.52**.
   - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`;
     `https://arxiv.org/html/2602.15547v1` Table 2;
     `https://jina.ai/news/jina-embeddings-v5-text-distilling-4b-quality-into-sub-1b-multilingual-embeddings/`;
     `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29/scores`
   - Fetch date: 2026-10-07
   - Confidence: HIGH that the conflict exists; the correct value is **67.0** (3 of 4 sources)

6. **Paper's stated leaderboard retrieval dates (verbatim).**
   - §5 note: "Scores published here come from the relevant MTEB learderboards⁵
     <https://huggingface.co/spaces/mteb/leaderboard> (Last Access: 02/09/2026) or our own
     evaluation if not published elsewhere." [sic: "learderboards" in original]
   - Appendix A.2 note: "The following evaluations are computed using the default metrics on
     the MTEB(eng, v2) benchmark. We either report results that are stated on the MTEB
     leaderboard¹¹ <https://huggingface.co/spaces/mteb/leaderboard> (Last Access: 02/02/2026)
     or self-evaluate them using the mteb package¹² <https://github.com/embeddings-benchmark/mteb>
     (Last Access: 02/02/2026)."
   - §5 also defines metrics: "All retrieval tasks were evaluated using nDCG@10, except for
     Passkey and Needle, which used nDCG@1. For semantic textual similarity (STS) and
     summarization tasks, we calculated the Spearman correlation coefficient. For clustering
     tasks, we used the V-measure… Classification and reranking tasks were evaluated using
     accuracy and precision metrics."
   - Table 3 marks "(partially) self-evaluated" with †; j-v5-text-small and j-v5-text-nano
     carry **no †** on the Avg Tasks column (their comparison baselines do).
   - Source: `https://arxiv.org/html/2602.15547v1`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source)

7. **Metric mapping is now triple-confirmed for this family.** Card "MTEB English v2 N.N"
   = live `meanTask`; card "MMTEB N.N" = live MTEB(Multilingual, v2) `meanTask`. Paper
   columns `Avg Tasks` / `Avg Type` = live `meanTask` / `meanTaskType`. Therefore the
   round-1 table that put jina-v5 71.7 beside Qwen3-0.6B 70.47 was **comparing like with
   like** — the round-1 report's omission of jina-v5 from the ranked tables was not a
   metric-scale error, it was an omission.

### B. Per-category cells on the live board (snapshot 2026-10-07)

| Model | Board | Rank | Mean(Task) | Mean(Type) | Ret | Cls | Clu | STS | Pair | RR | Sum |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jina-embeddings-v5-omni-small | MTEB(eng, v2) | 14 | **71.78** | 65.68 | 60.07 | 90.75 | 54.69 | 88.13 | 84.95 | 49.39 | 31.77 |
| jina-embeddings-v5-omni-nano | MTEB(eng, v2) | 18 | **71.11** | 65.22 | 58.80 | 90.07 | 53.49 | 88.28 | 84.74 | 49.23 | 31.95 |
| jina-embeddings-v5-text-nano | MTEB(eng, v2) | 18 | **71.11** | 65.22 | 58.80 | 90.07 | 53.49 | 88.28 | 84.74 | 49.23 | 31.95 |
| jina-embeddings-v5-text-small | MTEB(eng, v2) | 38 | **null** (38/41) | null | 60.07 | — | 54.69 | 88.13 | 84.95 | 49.39 | 31.77 |
| Qwen3-Embedding-0.6B (ref) | MTEB(eng, v2) | 26 | 70.47 | 64.72 | 61.83 | 84.58 | 54.05 | 86.57 | 84.37 | 48.18 | 33.43 |

- Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`
- Fetch date: 2026-10-07
- Confidence: HIGH (primary source, live API). Values are the raw `meanTask` /
  `meanTaskType` / `scoresByTaskType` fields × 100, rounded to 2 dp.
- Note: `scoresByTaskType.Classification` is genuinely absent on the text-small row
  (3 tasks missing), so its Cls cell is blank, not zero.

MTEB(Multilingual, v2), 131 tasks, snapshot 2026-10-07:

| Model | Rank | Mean(Task) | Mean(Type) | Ret | Cls | Clu | STS | Pair | RR | InstrRR | BM | MLC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| jina-v5-omni-small | 14 | **67.00** | 58.90 | 64.88 | 71.32 | 53.41 | 78.85 | 82.93 | 65.66 | 1.35 | 69.71 | 41.97 |
| jina-v5-text-small | 15 | **null** (128/131) | null | 64.88 | — | 53.41 | 78.85 | — | 65.66 | 1.35 | 69.71 | 41.97 |
| jina-v5-text-nano | 21 | **65.52** | 57.66 | 63.26 | 69.18 | 52.73 | 78.17 | 81.94 | 64.63 | 0.05 | 67.70 | 41.31 |
| jina-v5-omni-nano | 22 | **65.52** | 57.66 | 63.26 | 69.18 | 52.73 | 78.17 | 81.94 | 64.63 | 0.05 | 67.70 | 41.31 |

- Missing 3 tasks on the text-small row: `AmazonCounterfactualClassification`,
  `MassiveIntentClassification`, `PawsXPairClassification` (hence no Cls/Pair cells).
- Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29/scores`
- Fetch date: 2026-10-07
- Confidence: HIGH (primary source, live API)

BEIR (15 tasks), snapshot 2026-10-07:

| Model | Rank | Mean(Task) | tasks present | per-task mean |
|---|---|---|---|---|
| jina-v5-text-small | 42 | **null** | 14/15 (missing `CQADupstackRetrieval`) | 57.38 |
| jina-v5-omni-small | 42 | **null** | 14/15 (missing `CQADupstackRetrieval`) | 57.38 |
| jina-v5-text-nano | 52 | **null** | 14/15 | 56.87 |
| jina-v5-omni-nano | 52 | **null** | 14/15 | 56.87 |
| Qwen3-Embedding-0.6B (ref) | 51 | 55.52 | 15/15 | 55.52 |

- Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/BEIR/scores`
- Fetch date: 2026-10-07
- Confidence: HIGH (primary source, live API)
- **BEIR has no usable `meanTask` for any jina-v5 model** — the board itself has the
  `CQADupstackRetrieval` cell missing, so the aggregate is null. The 57.38 / 56.87 above
  is my own unweighted mean of the 14 present cells, labelled as such (not a board figure).
  The paper's Table 4 BEIR column (56.67 small / 56.06 nano) is the authors' own figure on
  the full 15-task BEIR.

### C. Parameters — the 677M/596M gap is explained

8. **677M = 596M base + 4 × 20.2M LoRA adapters (all four loaded at once).**
   - Card states `Parameters | 677M`.
   - HF API `safetensors.total = 596,049,920` for the base repo.
   - Paper Table 1: `j-v5-text-small | 596M | 4×20.2M | 3.5M | 32K | 1024`
     (Base | LoRA | RoPE θ | Max Tokens | Emb. Dim).
   - Each `adapters/*/adapter_model.safetensors` is ~40.4 MB (bf16 → ≈20.2M params);
     4 adapters ≈ 80.8M; 596 + 80.8 = **677M**. Arithmetic closes exactly.
   - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`;
     `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-small`;
     `https://arxiv.org/html/2602.15547v1` Table 1
   - Fetch date: 2026-10-07
   - Confidence: HIGH (three primary sources, arithmetic reconciles)

9. **239M = 212M base + 4 × 6.7M LoRA adapters.**
   - Card states `Parameters | 239M`; HF `safetensors.total = 211,766,016` (212M);
     paper Table 1: `j-v5-text-nano | 212M | 4×6.7M | 1M | 32K | 768`.
   - Adapters are ~13.6 MB each (bf16 → ≈6.8M); 4 × 6.7 = 26.8; 212 + 26.8 = **238.8 ≈ 239M**.
   - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-nano/raw/main/README.md`;
     `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-nano`;
     `https://arxiv.org/html/2602.15547v1` Table 1
   - Fetch date: 2026-10-07
   - Confidence: HIGH

10. **Live board reports only the base weights, not the LoRA.** text-small:
    `totalParamsB = 0.596`, `activeParamsB = 0.44`; text-nano: `totalParamsB = 0.212`,
    `activeParamsB = 0.113`; omni-small `0.986`/`0.887`; omni-nano `0.986`/`0.887`.
    - Source: `/v1/models?name=jina-embeddings-v5-text-small` and the `/scores` rows
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source)

11. **omni-small / omni-nano text encoders are the v5-text backbones verbatim.**
    `text_config` for omni-small = `hidden_size 1024, num_hidden_layers 28,
    max_position_embeddings 32768` — identical to v5-text-small's config. omni-nano
    `text_config` = `768 / 12 / 8192` — identical to v5-text-nano.
    Paper 2605.08384 abstract: "the language model remains effectively unaltered, producing
    exactly the same embeddings for text inputs as the Jina Embeddings v5 Text models",
    and only 0.35% of total weights were trained.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/config.json`;
      `https://huggingface.co/jinaai/jina-embeddings-v5-omni-nano/raw/main/config.json`;
      `https://arxiv.org/abs/2605.08384`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary sources)

12. **Empirically confirmed: omni-small and text-small produce identical per-task cells**
    on MTEB(eng, v2) for all 38 shared tasks, and identical on all 128 shared MMTEB tasks,
    to within floating-point noise. The only differing eng cell is
    `MassiveScenarioClassification` (text 0.920410 vs omni 0.920545, Δ = 1.35e-4).
    omni-nano and text-nano are **bit-identical** across all 41 eng-v2 tasks (diff of the
    two `scoresByTask` maps is empty).
    - Source: computed from `/scores` for `MTEB%28eng%2C%20v2%29` and `MTEB%28Multilingual%2C%20v2%29`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (direct comparison of live API payloads)
    - **Text-only parameter cost of the omni repos, if you load them at all:**
      omni-small `safetensors.total = 1,626,268,672` (~1.63B) vs text-small 596M;
      omni-nano `985,984,512` (~986M) vs text-nano 212M. The card's "~1.74B" (small) /
      "~1.04B" (nano) are the full multimodal totals. The **text-only** portion is the
      v5-text model. Both cards document selective loading:
      `model_kwargs={"modality": "text"}` loads text only.
    - Sources: `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-omni-small?full=true`;
      `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-omni-nano`;
      `https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/README.md`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary sources)

### D. Dim, MRL, context, licence, dates, base model

13. **v5-text-small** — params 677M stated (596M HF safetensors; 596M base + 4×20.2M LoRA) ·
    dim **1024**, MRL `32, 64, 128, 256, 512, 768, 1024` · max context **32768**
    (card spec table, `config.json:max_position_embeddings`, paper Table 1, live board
    `maxTokens 32768.0` — all four agree) · licence **`cc-by-nc-4.0`** · release **2026-02-18**
    per card (HF `createdAt` 2026-01-22; paper arXiv 2026-02-17; press release 2026-02-19;
    live board `releaseDate 2026-02-17`) · base model **Qwen/Qwen3-0.6B-Base** ·
    last-token pooling · 4 LoRA adapters (retrieval, text-matching, clustering, classification).
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`;
      `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/config.json`;
      `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-small`;
      `https://arxiv.org/abs/2602.15547`; `/v1/models?name=jina-embeddings-v5-text-small`
    - Fetch date: 2026-10-07
    - Confidence: HIGH

14. **v5-text-nano** — params 239M stated (211,766,016 HF safetensors; 212M base + 4×6.7M) ·
    dim **768**, MRL `32, 64, 128, 256, 512, 768` · max context **8192** in the spec table,
    in `config.json:max_position_embeddings`, in the press-release table, and on the live
    board (`maxTokens 8192.0`) — but **the card prose says "up to 32K tokens" and the paper's
    Table 1 lists Max Tokens 32K for nano** (see §Conflicting evidence) · licence
    **`cc-by-nc-4.0`** · release **2026-02-18** per card (HF `createdAt` 2026-01-22; live
    board `releaseDate 2026-02-17`) · base model **EuroBERT/EuroBERT-210m** · last-token
    pooling.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-nano/raw/main/README.md`;
      `.../config.json`; `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-nano`;
      `https://arxiv.org/html/2602.15547v1` Table 1
    - Fetch date: 2026-10-07
    - Confidence: HIGH on 8192 (4 sources); the 32K prose/Table-1 claims are the anomaly

15. **v5-omni-small** — card `Parameters ~1.74B`; HF `safetensors.total = 1,626,268,672`
    (~1.63B); board `totalParamsB 1.626` / `activeParamsB 1.471` · dim **1024**,
    MRL `32…1024` · max context **32768** · licence **`cc-by-nc-4.0`** · HF `createdAt`
    2026-04-01, board `releaseDate 2026-04-01`, omni paper arXiv 2026-05-08, Jina omni blog
    2026-05-12 · text encoder = v5-text-small (see claim 11) · inputs text/image/video/audio.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/README.md`;
      `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-omni-small?full=true`;
      `https://arxiv.org/abs/2605.08384`
    - Fetch date: 2026-10-07
    - Confidence: HIGH

16. **v5-omni-nano** — card `Parameters ~1.04B`; HF `safetensors.total = 985,984,512`
    (~986M) · dim **768**, MRL `32…768` · max context **8192** · licence **`cc-by-nc-4.0`** ·
    HF `createdAt` 2026-04-01 · text encoder = v5-text-nano.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-omni-nano/raw/main/README.md`;
      `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-omni-nano`
    - Fetch date: 2026-10-07
    - Confidence: HIGH

17. **Licence is `cc-by-nc-4.0` on all four repos, and it is the HF `license` field, not
    just card prose.** `cardData.license = "cc-by-nc-4.0"` on
    `jina-embeddings-v5-text-small`, `-text-nano`, `-omni-small`, `-omni-nano`, and on
    every merged task repo and every official GGUF repo checked
    (`-text-small-retrieval-GGUF`, `-text-nano-retrieval-GGUF`,
    `-omni-small-retrieval-GGUF`, `-omni-nano-retrieval-GGUF`). The live MTEB board also
    records `license: "cc-by-nc-4.0"` for all four.
    - Sources: `https://huggingface.co/api/models/<repo>` `cardData.license`; `/scores` rows
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source, machine-readable field)

18. **Plainly: jina-embeddings-v5 (text and omni, small and nano) is NOT commercially
    usable.** CC BY-NC 4.0 forbids commercial use. All four cards state verbatim:
    "jina-embeddings-v5-text-small is licensed under CC BY-NC 4.0. For commercial use,
    please contact us [mailto:sales@jina.ai]." The Apache-2.0 licence of the *base* models
    (Qwen/Qwen3-0.6B-Base, EuroBERT/EuroBERT-210m — both verified `apache-2.0`) does not
    propagate to the fine-tuned v5 weights.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`
      §License; `https://huggingface.co/api/models/Qwen/Qwen3-0.6B-Base`;
      `https://huggingface.co/api/models/EuroBERT/EuroBERT-210m`
    - Fetch date: 2026-10-07
    - Confidence: HIGH

19. **EuroBERT-210m HF `safetensors.total` is 310,266,624 (310M), not 210M.** The "210m"
    in the name and in the paper's Table 1 refers to the non-embedding/encoder parameter
    count; the checkpoint includes a large multilingual embedding matrix. Relevant because
    the nano checkpoint (212M safetensors) is *smaller* than its nominal base.
    - Source: `https://huggingface.co/api/models/EuroBERT/EuroBERT-210m`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source) / the "non-embedding" reading is [INFERENCE]

### E. CPU-servable builds (Path 3 / Path 4)

20. **GGUF: YES, official, with CPU-viable quantizations.** Jina publishes 14 GGUF quants
    per task repo (F16, Q8_0, Q6_K, Q5_K_M, Q5_K_S, Q4_K_M, Q3_K_M, Q2_K, IQ4_XS, IQ4_NL,
    IQ2_M, IQ2_XXS, IQ1_M, IQ1_S). Sizes (retrieval adapter):
    - text-small-retrieval: F16 1,198,182,464 B (1.20 GB) · Q8_0 639,447,424 (639 MB) ·
      Q4_K_M 396,705,152 (**397 MB**) · IQ1_S 208,015,744 (208 MB)
    - text-nano-retrieval: F16 431,396,128 (431 MB) · Q8_0 232,883,776 (233 MB) ·
      Q4_K_M 156,966,976 (**157 MB**) · IQ1_S 99,436,096 (99 MB)
    - Repos: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small-retrieval-GGUF`
      (created 2026-02-18), `.../jina-embeddings-v5-text-nano-retrieval-GGUF`,
      `.../jina-embeddings-v5-omni-small-retrieval-GGUF` (also ships
      `*-vision-mmproj-F16.gguf` and `*-audio-mmproj-F16.gguf`), and the same for omni-nano.
    - Also available on the **merged** repos directly, e.g.
      `https://huggingface.co/jinaai/jina-embeddings-v5-text-small-retrieval` contains both
      `onnx/` and all 14 `.gguf` files.
    - Source: `https://huggingface.co/api/models/<repo>?blobs=true`; `.../raw/main/README.md`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source)

21. **GGUF architectures are the base archs and are both in upstream llama.cpp.**
    Read the GGUF header of `v5-small-retrieval-Q4_K_M.gguf` → `general.architecture =
    qwen3`; `v5-nano-retrieval-Q4_K_M.gguf` → `general.architecture = eurobert`.
    `llama-arch.cpp` has `LLM_ARCH_QWEN3 "qwen3"` and `LLM_ARCH_EUROBERT "eurobert"`, and
    `llama-model.cpp` constructs `llama_model_eurobert` for `LLM_ARCH_EUROBERT`.
    `llama.h` defines `LLAMA_POOLING_TYPE_LAST = 3`, which is what these models need
    (last-token pooling).
    - Sources: GGUF headers via HF `resolve/main` byte-range; 
      `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp`;
      `.../src/llama-model.cpp`; `.../include/llama.h`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source, upstream repo)

22. **The card's documented CPU/llama.cpp invocation works on the merged repo.**
    `llama-server -hf jinaai/jina-embeddings-v5-text-small-retrieval:F16 --embedding
    --pooling last -ub 32768` (from the merged repo README), and
    `llama-server -hf jinaai/jina-embeddings-v5-text-small-retrieval-GGUF:Q4_K_M
    --embedding --pooling last -ub 32768` (from the release note). It is an
    OpenAI-compatible `/v1/embeddings` endpoint with `Query: ` / `Document: ` prefixes.
    This is exactly **Path 3**.
    - Sources: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small-retrieval/raw/main/README.md`;
      `https://jina.ai/news/jina-embeddings-v5-text-distilling-4b-quality-into-sub-1b-multilingual-embeddings/`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source)

23. **ONNX: YES.** `onnx/model.onnx` + `model.onnx_data` live inside every merged task repo
    (small-retrieval, small-text-matching, nano-retrieval, nano-text-matching, …), with
    nano additionally shipping `model_fp16`, `model_q4`, `model_q4f16`, `model_quantized`.
    Community ONNX: `onnx-community/jina-embeddings-v5-omni-nano-ONNX` (text/vision/audio
    towers, fp16 and q4f16). This is Optimum/ONNX Runtime CPU-capable.
    - Sources: `https://huggingface.co/api/models/jinaai/jina-embeddings-v5-text-nano-retrieval`;
      `https://huggingface.co/api/models/onnx-community/jina-embeddings-v5-omni-nano-ONNX`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source)

24. **TEI: card claims support, but upstream TEI does not appear to support EuroBERT — so
    the nano path is questionable.** The card's TEI section says the per-task merged repos
    "enable simpler compatibility with Text Embeddings Inference". Upstream TEI's README
    lists supported families as "Nomic, BERT, CamemBERT, XLM-RoBERTa …, JinaBERT …,
    Mistral, Alibaba GTE, Qwen2 …, MPNet, ModernBERT, Qwen3, and Gemma3" — **EuroBERT is
    not listed**, and `backends/candle/src/lib.rs` contains **zero** occurrences of
    "eurobert" while `Qwen3Config`/`Qwen3Model` are present. So: text-small (Qwen3 arch)
    should work under TEI; text-nano (EuroBERT arch) is unverified and likely unsupported.
    - Sources: `https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/README.md`;
      `https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/backends/candle/src/lib.rs`
    - Fetch date: 2026-10-07
    - Confidence: MEDIUM (primary source code, but I did not build/run TEI; the card's claim
      was not verified against a TEI release)

25. **Ollama: no official library model.** `https://ollama.com/library/jina-embeddings-v5-text-small`
    → HTTP 404; `registry.ollama.ai/v2/library/jina-embeddings-v5-text-small/tags/list` → 404.
    Only community uploads exist (`ollama.com/corvojaeger/jina-embeddings-v5-text-small`,
    HTTP 200; `ollama.com/tutorify/jina-embeddings-v5-omni-small-retrieval`). Ollama's own
    search lists jina v2 models and `jina/jina-embeddings-v2-*` as the only jina library
    entries. **Treat Ollama as unsupported-official for v5.**
    - Sources: `https://ollama.com/library/...`, `https://registry.ollama.ai/v2/library/...`,
      `https://ollama.com/search?q=jina-embeddings-v5`
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary source, live registry)

26. **vLLM: YES** (card documents `hf_overrides={"task": "retrieval"}` / `JINA_V5_TASK`,
    and `runner="pooling"`). Not CPU-relevant for this project but confirms Path-3 server
    viability on the same weights.
    - Source: `https://huggingface.co/jinaai/jina-embeddings-v5-omni-small/raw/main/README.md`
    - Fetch date: 2026-10-07
    - Confidence: HIGH

27. **Path classification for omp.** jina-v5-text-small / -nano are **not** in the
    7-model omp whitelist, so they are not Path 1. They are not API-only (weights are
    open), so not Path 2. With official GGUF + ONNX + a documented llama.cpp
    OpenAI-compatible invocation, they are cleanly **Path 3**. Path 4 (patching
    `KNOWN_MODEL_NAMES`) is unnecessary given the GGUF route.
    - Confidence: HIGH (derived from claims 20–26) / [INFERENCE] on the omp-path label

### F. Verdict on the round-1 omission

28. **The round-1 ranked tables should have included jina-v5 — on the same scale.** The
    card 71.7 (text-small) is Mean(Task) on MTEB(eng, v2), directly comparable to
    Qwen3-0.6B's 70.47. Because the live board cannot compute text-small's own Mean(Task)
    (3 missing Classification cells), the correct board-side proxy is the **omni-small**
    row at **71.78**, which is text-small's embeddings plus the 3 missing cells. On
    Retrieval specifically the ordering reverses: Qwen3-0.6B 61.83 > jina-v5-small 60.07.
    On Classification jina-v5-small 90.75 ≫ Qwen3-0.6B 84.58.
    - Sources: claims 1–4
    - Fetch date: 2026-10-07
    - Confidence: HIGH

## Searches (query strings used)

- HF API model metadata: `https://huggingface.co/api/models/{id}` and `?full=true` /
  `?blobs=true` for `jinaai/jina-embeddings-v5-text-small`, `-text-nano`, `-omni-small`,
  `-omni-nano`, `-text-small-retrieval`, `-text-small-text-matching`, `-text-nano-retrieval`,
  `-text-small-retrieval-GGUF`, `-text-nano-retrieval-GGUF`, `-omni-small-retrieval-GGUF`,
  `-omni-nano-retrieval-GGUF`, `mradermacher/jina-embeddings-v5-text-small-retrieval-GGUF`,
  `onnx-community/jina-embeddings-v5-omni-nano-ONNX`,
  `cstr/jina-embeddings-v5-text-small-retrieval-onnx-int8`,
  `Qwen/Qwen3-0.6B-Base`, `EuroBERT/EuroBERT-210m`. 2026-10-07.
- HF API discovery: `https://huggingface.co/api/models?search=jina-embeddings-v5&limit=100`;
  `?search=jina-embeddings-v5&author=ggml-org` (empty); `?author=unsloth` (empty). 2026-10-07.
- Raw model cards: `.../jinaai/jina-embeddings-v5-{text-small,text-nano,omni-small,omni-nano}/raw/main/README.md`;
  `.../jinaai/jina-embeddings-v5-text-small-retrieval/raw/main/README.md`;
  `.../jinaai/jina-embeddings-v5-text-small-retrieval-GGUF/raw/main/README.md`. 2026-10-07.
- Raw configs: `.../jinaai/jina-embeddings-v5-{text-small,text-nano,omni-small,omni-nano}/raw/main/config.json`;
  `.../jinaai/jina-embeddings-v5-text-{small,nano}-retrieval/raw/main/{config.json,1_Pooling/config.json,modules.json}`;
  `.../jinaai/jina-embeddings-v5-text-nano/raw/main/config_sentence_transformers.json`. 2026-10-07.
- Live MTEB leaderboard backend:
  `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`,
  `.../MTEB%28Multilingual%2C%20v2%29/scores`, `.../BEIR/scores`, `.../v1/benchmarks`,
  `.../v1/models?name=jina-embeddings-v5-text-small`. Also probed
  `.../v1/benchmarks/MTEB%28eng%2C%20v2%29/models/jinaai%2Fjina-embeddings-v5-text-small`
  → HTTP 404 (this is the route round-1/F12 used; it does not exist). 2026-10-07.
- Paper: `https://arxiv.org/abs/2602.15547` and `https://arxiv.org/html/2602.15547v1`
  (Tables 1, 2, 3, 4, A1, A2, A6, A7, A8, A9, A10, A11; §5 notes and footnotes 5, 11, 12).
  `https://arxiv.org/abs/2605.08384` (omni/GELATO abstract). 2026-10-07.
- Jina primary pages: `https://jina.ai/news/jina-embeddings-v5-text-distilling-4b-quality-into-sub-1b-multilingual-embeddings/`;
  `https://jina.ai/news/optimizing-ggufs-for-decoder-only-embedding-models/`. 2026-10-07.
- Upstream source code: `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-arch.cpp`,
  `.../src/llama-model.cpp`, `.../include/llama.h`;
  `https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/README.md`,
  `.../main/backends/candle/src/lib.rs`. 2026-10-07.
- GGUF architecture sniff: byte-range read of
  `https://huggingface.co/jinaai/jina-embeddings-v5-text-{small,nano}-retrieval-GGUF/resolve/main/v5-{small,nano}-retrieval-Q4_K_M.gguf`. 2026-10-07.
- Ollama registry: `https://ollama.com/library/jina-embeddings-v5-text-small`,
  `https://registry.ollama.ai/v2/library/{jina-embeddings-v5-text-small,jina-embeddings-v5-omni-small-retrieval,jina/jina-embeddings-v5-text-small}/tags/list`,
  `https://ollama.com/search?q=jina-embeddings-v5`. 2026-10-07.
- Web discovery: `arXiv 2602.15547 jina-embeddings-v5`;
  `jinaai jina-embeddings-v5-text-small model card huggingface`;
  `jinaai jina-embeddings-v5-text-nano model card huggingface`. 2026-10-07.

## Conflicting evidence

- **jina-v5-text-small MMTEB: card 67.7 vs paper 67.0 vs press release 67.0 vs live board
  67.00.** Three of four primary sources agree on 67.0. The card's "67.7" is unexplained;
  no snapshot at which it was true was found. **Use 67.0.** Round-1 F1 propagated the card's
  67.7 — that row should be corrected. Nano's 65.5 is consistent everywhere.
- **jina-v5-text-nano context: 8192 vs 32K.** The card spec table says `Max Sequence Length
  | 8192`; `config.json:max_position_embeddings = 8192`; the press-release table says
  "Context Length 8,192"; the live board says `maxTokens 8192.0`. But the card *prose*
  says "supports multilingual text up to 32K tokens", and the **paper's own Table 1 lists
  Max Tokens = 32K for j-v5-text-nano** while listing its base EuroBERT-210M as 8K. The
  32K figures are internally inconsistent (nano's RoPE θ is 1M vs small's 3.5M; the
  paper's own §4.1.3 long-context training stage was run on **small only**). **8192 is the
  operative value**; the 32K claims appear to be copy errors inherited from the small model's
  paragraph and row. Round-1 F1 flagged this; this file confirms 8192 across four sources.
- **jina-v5-text-small params: 677M (card) vs 596M (HF safetensors) vs 596M (paper Table 1)
  vs 0.596B (live board).** Resolved, not a conflict: 677M = 596M base + 4×20.2M adapters.
  Same for nano: 239M = 212M + 4×6.7M. The three figures measure different things
  (all-adapters-loaded vs base-weights-only).
- **omni-small params: card "~1.74B" vs HF safetensors 1.626B vs board 1.626B.**
  Card's 1.74B likely counts the merged/padded model; HF and the board both say 1.626B.
  Same pattern for omni-nano: card "~1.04B" vs HF/board 0.986B. Neither affects the
  text-only footprint (claims 11–12).
- **Round-1/F12 "jina-v5 is not on the live MTEB leaderboard" is WRONG.** F12 (fetched
  2026-10-07) states "The model is NOT on the live MTEB leaderboard (API returns Not Found
  for all attempted paths)". The rows are present in `/v1/benchmarks/<b>/scores` and the
  model index is queryable at `/v1/models?name=…`. The 404 came from the
  `/v1/benchmarks/<b>/models/<name>` route, which is not a valid endpoint for any model
  (verified: it 404s for arbitrary names too). F12's consequence — "cannot map 71.7 to a
  live-board column" — is therefore superseded: it maps to `meanTask`, and the omni-small
  row (identical text embeddings) supplies the exact 71.78.
- **Card release date "February 18, 2026" vs arXiv 2026-02-17 vs HF `createdAt` 2026-01-22
  vs live board `releaseDate` 2026-02-17 vs press release 2026-02-19.** Five different dates
  for the same release; all are "the release" under different definitions (repo created /
  paper posted / card's stated release / board's recorded date / announcement). Not a
  data conflict, but the card's 2026-02-18 is the authors' own claim.
- **TEI compatibility: card asserts it, upstream code does not list EuroBERT.** The card's
  TEI section is generic boilerplate pointing at merged repos; upstream TEI's supported-model
  list and its candle backend contain no EuroBERT. text-small (Qwen3) is plausible;
  text-nano is unverified-to-likely-unsupported. Flagged MEDIUM, not resolved.

## Gaps

- **No first-party jina-v5 per-task-type table on the card itself.** The card gives only
  two scalars (71.7, 67.7) with no per-type breakdown, so the card alone cannot be mapped
  to a column — the mapping in this file rests on the paper's Table 2/Table 3 column labels
  (`Avg Tasks`/`Avg Type`) plus the live-board arithmetic. Both are primary, so confidence
  is HIGH, but there is no *single* document that states "71.7 = Mean(Task) over 41 tasks".
  The press release is the closest: "`v5-text-small` leads all sub-1B multilingual models
  with **71.7** (averaged across 41 tasks in 7 task types)".
- **BEIR meanTask is null for every jina-v5 model on the live board** because the board
  itself lacks the `CQADupstackRetrieval` cell for these repos. The 57.38 / 56.87 figures
  here are my own unweighted means over the 14 present cells and are labelled as such; the
  paper's Table 4 BEIR column (56.67 small / 56.06 nano) is the authors' full-15-task figure.
  No board-side BEIR number exists to cross-check against.
- **The 3 missing MTEB(eng, v2) Classification cells for text-small and the 3 missing
  MTEB(Multilingual, v2) cells (incl. `PawsXPairClassification`) were not explained.**
  Whether they are pending evaluation runs, licence-blocked datasets, or board ingestion
  gaps is unknown. `zeroShotPct = -1` on all jina-v5 rows (unknown), whereas Qwen3-0.6B
  has a computed value.
- **No official Ollama library entry** — only community uploads
  (`corvojaeger/…`, `tutorify/…`), whose provenance, quantization and prompt handling were
  not audited. Do not rely on them.
- **TEI support for the EuroBERT-arch nano model was not empirically tested** — determined
  only by absence from TEI's supported-model list and its candle backend source. A live
  `docker run ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 --model-id
  jinaai/jina-embeddings-v5-text-nano-retrieval` would settle it. Not run here.
- **GGUF numerics were not validated.** The architecture tags (`qwen3`, `eurobert`) and
  file sizes were read from the published GGUF headers; no embedding was computed, so
  agreement between the GGUF path and the `transformers` path is unverified. Jina's own
  GGUF blog documents that prefixes (`Query: ` / `Document: `) must be applied manually and
  that llama.cpp's embedding support historically lagged decoder-only architectures.
- **CPU throughput of the GGUF builds on the target i5-1135G7 was not measured.** Only
  file sizes and the upstream `--pooling last` flag are established; no tokens/sec figure
  exists from any primary source for this hardware. Round-1's CPU-inference angle (F5)
  is the place for that, not here.
- **MMTEB 67.7 on the card remains unexplained** — no snapshot, paper version, or press
  release reproduces it. Recorded as a card error pending author comment.
- **No local evaluation was performed** (per the round constraints). Every number here is
  either a published figure or a direct read of a live API payload; the two places where I
  computed an aggregate myself (BEIR 14-task means, and the omni-vs-text per-task diffs)
  are explicitly labelled.
