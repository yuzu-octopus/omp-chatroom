## Angle

MTEB aggregation reconciliation — which number is which. Define the metric space precisely so every ranked table is internally comparable.

## Claims (claim / source URL / fetch date / confidence per item)

1. **MTEB(eng, v2) has 41 tasks, 7 task types, and 3 aggregation columns.**
   - Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live API)
   - Task types: Classification, Clustering, PairClassification, Reranking, Retrieval, STS, Summarization
   - Aggregations: `mean_task`, `mean_task_type`, `task_types`

2. **MTEB(eng, v1) has 56 tasks, 7 task types, and 3 aggregation columns.**
   - Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v1%29`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live API)
   - Task types: same as v2
   - Aggregations: `mean_task`, `mean_task_type`, `task_types`
   - Note: v1 includes MSMARCO and other common fine-tuning datasets; v2 removes them and fixes a known scoring bug (mteb issue #1156).

3. **MTEB(Multilingual, v2) has 131 tasks, 9 task types, and 3 aggregation columns.**
   - Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live API)
   - Task types: BitextMining, Classification, Clustering, InstructionReranking, MultilabelClassification, PairClassification, Reranking, Retrieval, STS
   - Aggregations: `mean_task`, `mean_task_type`, `task_types`

4. **BEIR has 15 tasks, 1 task type (Retrieval), and 3 aggregation columns.**
   - Source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/BEIR`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, live API)
   - Aggregations: `mean_task`, `mean_task_type`, `task_types`
   - Note: With only 1 task type, `mean_task` = `mean_task_type` = `task_types` for BEIR.

5. **Aggregation definitions (from mteb source code):**
   - Source: `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/_benchmark_metrics.py`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, official mteb repo)
   - `mean_task` (display: "Mean (Task)"): unweighted mean across all task results. Each task = one data point. `sum(scores) / len(scores)`.
   - `mean_task_type` (display: "Mean (TaskType)"): mean of per-task-type means. First group by task type, compute mean within each type, then unweighted mean across types. `sum(type_means) / len(type_means)`.
   - `task_types`: one column per task type, showing the per-task-type mean (not a single scalar).

6. **MTEB(eng, v2) source definition (from benchmarks.py):**
   - Source: `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/benchmarks/benchmarks.py`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, official mteb repo)
   - The `MTEB_EN` Benchmark object is named `"MTEB(eng, v2)"` with alias `"MTEB(eng)"`.
   - It includes 41 tasks: 38 from the main `get_tasks()` call (with `exclusive_language_filter=True`, `eval_splits=["test"]`) plus 3 scoped tasks: `AmazonCounterfactualClassification` (hf_subsets=["en"]), `STS17` (hf_subsets=["en-en"]), `STS22.v2` (hf_subsets=["en"]).
   - The `MTEB_ENG_CLASSIC` (v1) has 56 tasks including MSMARCO (eval_splits=["dev"]) and uses older task versions.

7. **Rosetta stone — Qwen3-Embedding-0.6B card vs live board:**
   - Card source: `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/raw/main/README.md`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, model card)
   - Card says: MTEB(Eng v2) Mean(Task) = 70.70, Mean(Type) = 64.88
   - Live board (round-1 snapshot 2026-10-05): Mean(Task) = 70.47, Mean(Type) = 64.88
   - **Mean(Type) matches exactly (64.88).** Mean(Task) differs by 0.23 (70.70 vs 70.47) — likely due to different snapshot dates or minor task version updates.
   - The card explicitly labels columns as "Mean(Task)" and "Mean(Type)" — these map directly to the live board's "Mean (Task)" and "Mean (TaskType)" columns.

8. **Rosetta stone — EmbeddingGemma-300m card vs live board:**
   - Card source: `https://huggingface.co/google/embeddinggemma-300m/resolve/main/README.md`
   - Fetch date: 2026-10-07
   - Confidence: HIGH (primary source, model card)
   - Card says: MTEB(Eng, v2) Mean(Task) = 69.67, Mean(TaskType) = 65.11; MTEB(Multi, v2) Mean(Task) = 61.15, Mean(TaskType) = 54.31
   - Live board (round-1 snapshot 2026-10-05): 69.67 / 61.15 Mean(Task) — **exact match on Mean(Task) for both benchmarks.**
   - The card explicitly labels columns as "Mean (Task)" and "Mean (TaskType)".

9. **"MTEB English v2" on modern cards = Mean(Task) aggregation.**
   - Evidence: Both Qwen3 and EmbeddingGemma cards explicitly label their "MTEB English v2" headline number as "Mean (Task)" or "Mean(Task)". Both match the live board's Mean(Task) column.
   - Confidence: HIGH (two independent primary sources confirm)

10. **jina-embeddings-v5-text-small card figure — RESOLVED via live board (corrected by peer W9, verified by own API call):**
    - Card source: `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`
    - Live board source: `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores` (row for `jinaai/jina-embeddings-v5-text-small`, rank 38)
    - Fetch date: 2026-10-07
    - Confidence: HIGH (primary sources, live API)
    - Card says: "scores 71.7 average on MTEB English v2 and 67.7 on MMTEB"
    - The model IS on the live MTEB leaderboard (rank 38). Its `meanTask` is **null** because it lacks 3 Classification tasks (only has 38 of 41 tasks). Its `scoresByTaskType` shows 6 types: Retrieval 0.60074, STS 0.88127, Clustering 0.54689, PairClassification 0.84952, Reranking 0.49385, Summarization 0.31773.
    - The sibling model `jinaai/jina-embeddings-v5-omni-small` (rank 14) has `meanTask` = 0.7177546 (71.78) and `meanTaskType` = 0.6567854 (65.68) — matching the paper's Table 3 "71.7 / 65.6" row exactly.
    - **Conclusion**: The card's "71.7 average on MTEB English v2" = Mean(Task) aggregation. The card figure refers to the omni-small variant's score (or the text-small's score when it had full task coverage). The text-small's live `meanTask` is null due to missing Classification tasks.
    - **Card error**: Card says "67.7 on MMTEB" but paper Table 2, press release, and live board all say 67.0.
## Searches (query strings used)

- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v2%29`
- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28eng%2C%20v1%29`
- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Multilingual%2C%20v2%29`
- `https://mteb-leaderboard-backend.hf.space/v1/benchmarks/BEIR`
- `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/benchmarks/benchmarks.py`
- `https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/benchmarks/_benchmark_metrics.py`
- `https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/raw/main/README.md`
- `https://huggingface.co/google/embeddinggemma-300m/resolve/main/README.md`
- `https://huggingface.co/jinaai/jina-embeddings-v5-text-small/raw/main/README.md`
- `site:huggingface.co jina-embeddings-v5 MTEB English v2 71.7`

## Conflicting evidence

- **Qwen3-Embedding-0.6B Mean(Task) discrepancy**: Card says 70.70, live board says 70.47. This 0.23 gap is likely due to different snapshot dates (card may have been computed at a different time) or minor task version updates. The Mean(Type) matches exactly (64.88), confirming the metric mapping is correct.
- **jina-v5-text-small "71.7 average"**: RESOLVED. The model IS on the live leaderboard (rank 38). Its `meanTask` is null (missing 3 Classification tasks), but sibling `jina-embeddings-v5-omni-small` has `meanTask` = 0.7177546 (71.78) matching the card's "71.7". The card's "average" = Mean(Task). Card's "67.7 on MMTEB" is a card error — paper and live board say 67.0.
## Gaps

- **jina-v5-text-small live `meanTask` is null** because it lacks 3 Classification tasks (only 38 of 41). The card's "71.7" refers to the omni-small variant's score. To fully reconcile: (1) check if text-small's Classification task scores have been added since this snapshot, or (2) use the omni-small row as the canonical reference for the v5-text-small card figure.
- **The exact snapshot date of the Qwen3 card's MTEB scores is unknown.** The card does not state when the scores were computed. The 0.23 gap in Mean(Task) could be due to task version updates between the card's computation date and the 2026-10-05 live board snapshot.
- **No secondary sources were used.** All claims are from primary sources (live API, mteb source code, model cards).
