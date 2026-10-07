# F13 — MTEB(Code, v1) — code-retrieval quality for the three CPU candidates

## Angle

MTEB(Code, v1) benchmark scores for EmbeddingGemma-2, Qwen3-Embedding-0.6B, jina-v5-text-small, and jina-v5-text-nano. Verification of EmbeddingGemma-2's self-reported 78.68, contextualisation against known code-retrieval leaders, and benchmark definition.

## Claims

### 1. EmbeddingGemma-2 MTEB(Code, v1) = 78.68 (self-reported)

- **Claim**: EmbeddingGemma-2's model card reports MTEB(Code, v1) = 78.68 at 768d, with metric "Mean(Task), NDCG@10". At 128d the score is 71.41. The table caption is "Overall Evaluation Results (768d)". The column label is "Massive Text Embedding Benchmark (MTEB, code, v1)" with sub-label "Mean(Task), NDCG@10". This is **self-reported** — the live MTEB leaderboard backend has zero `embeddinggemma-2` rows (confirmed: the MTEB(Code, v1) scores endpoint returns only task metadata with `numModels: 0` for all 12 tasks; no model scores exist on the live board for this model).
- **Source**: https://huggingface.co/google/embeddinggemma-2/raw/main/README.md
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, directly quoted)

### 2. MTEB(Code, v1) benchmark definition

- **Claim**: MTEB(Code, v1) consists of **12 tasks**, all of type **Retrieval**. The main score for every task is **nDCG@10**. It is a **pure retrieval benchmark** (no classification, clustering, or STS). The 12 tasks are: CodeTransOceanContest, CodeTransOceanDL, AppsRetrieval, StackOverflowQA, CodeEditSearchRetrieval, CodeFeedbackMT, CodeFeedbackST, CodeSearchNetRetrieval, CodeSearchNetCCRetrieval, CosQA, SyntheticText2SQL, COIRCodeSearchNetRetrieval.
- **Source**: https://mteb-leaderboard-backend.hf.space/v1/benchmarks/MTEB%28Code%2C%20v1%29/scores
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, official MTEB backend)

### 3. Qwen3-Embedding-0.6B MTEB(Code, v1) = 75.41

- **Claim**: The Qwen3-Embedding paper (arXiv 2506.05176) reports Qwen3-Embedding-0.6B at **75.41** on MTEB(Code) in Table 3 (Performance on MTEB English, MTEB Chinese, MTEB Code). The paper states the code evaluation comprises "12 code retrieval tasks for MTEB (Code)". The same 75.41 appears in Table 5 (ablation) labelled "MTEB (Code, v1)". The live MTEB leaderboard shows Qwen3-Embedding-8B at 80.69 and Qwen3-Embedding-4B at 80.07, but **no 0.6B row** on the Code board (consistent with round 2 finding).
- **Source**: https://arxiv.org/abs/2506.05176 (Table 3 and Table 5)
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, paper directly quoted)

### 4. Qwen3-Embedding-8B MTEB(Code, v1) = 80.68 (paper) / 80.69 (live board)

- **Claim**: The Qwen3-Embedding paper reports Qwen3-Embedding-8B at **80.68** on MTEB(Code) in Table 3. The live MTEB leaderboard shows **80.69** (web search, secondary). The paper abstract states "80.68 on the MTEB Code benchmark".
- **Source**: https://arxiv.org/abs/2506.05176 (Table 3); https://mteb-leaderboard.hf.space/benchmark/MTEB%28Code%2C%20v1%29 (secondary)
- **Fetch date**: 2026-10-07
- **Confidence**: High (paper primary; live board secondary)

### 5. Qwen3-Embedding-4B MTEB(Code, v1) = 80.06 (paper) / 80.07 (live board)

- **Claim**: The Qwen3-Embedding paper reports Qwen3-Embedding-4B at **80.06** on MTEB(Code) in Table 3. The live MTEB leaderboard shows **80.07** (web search, secondary).
- **Source**: https://arxiv.org/abs/2506.05176 (Table 3); https://mteb-leaderboard.hf.space/benchmark/MTEB%28Code%2C%20v1%29 (secondary)
- **Fetch date**: 2026-10-07
- **Confidence**: High (paper primary; live board secondary)

### 6. jina-v5-text-small and jina-v5-text-nano: no MTEB(Code, v1) score

- **Claim**: The jina-v5 paper (arXiv 2602.15547) does **not** report any MTEB(Code, v1) score. The paper evaluates on MTEB(Multilingual, v2), MTEB(eng, v2), RTEB, BEIR, and LongEmbed — but no code-specific benchmark. The live MTEB leaderboard also has no jina-v5 code scores. No CoIR, CodeRAG-Bench, or CodeSearchNet scores are reported in the paper for these models.
- **Source**: https://arxiv.org/abs/2602.15547 (Tables 2, 3, 4 — no code benchmark present)
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, exhaustive table review)

### 7. Gemini Embedding MTEB(Code) = 74.66 (from Qwen3 paper)

- **Claim**: The Qwen3-Embedding paper Table 3 lists Gemini Embedding at **74.66** on MTEB(Code), cited from Lee et al. 2025b. This is a commercial API model.
- **Source**: https://arxiv.org/abs/2506.05176 (Table 3, footnote γ)
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, directly quoted)

### 8. GritLM-7B MTEB(Code) = 73.6 (from Qwen3 paper)

- **Claim**: The Qwen3-Embedding paper Table 3 lists GritLM-7B at **73.6** on MTEB(Code), cited from Enevoldsen et al. 2025.
- **Source**: https://arxiv.org/abs/2506.05176 (Table 3, footnote α)
- **Fetch date**: 2026-10-07
- **Confidence**: High (primary source, directly quoted)

### 9. jina-code-embeddings-0.5b MTEB(Code) = 78.72 (vendor-reported, secondary)

- **Claim**: Jina's website reports jina-code-embeddings-0.5b at **78.72** on MTEB Code. This is a **vendor-reported figure** (secondary source), not independently verified on the live MTEB leaderboard. Note: this is a different model from jina-v5-text-small/nano.
- **Source**: https://jina.ai/en-US/models/jina-code-embeddings-0.5b/ (secondary, vendor page)
- **Fetch date**: 2026-10-07
- **Confidence**: Medium (secondary source, vendor self-report)

### 10. EmbeddingGemma-2 78.68 is leader-class for MTEB(Code, v1)

- **Claim**: 78.68 is a **leader-class** figure for MTEB(Code, v1). It exceeds Qwen3-Embedding-0.6B (75.41), Gemini Embedding (74.66), and GritLM-7B (73.6). It is close to jina-code-0.5B (78.72, vendor-reported). It is below Qwen3-Embedding-8B (80.68) and Qwen3-Embedding-4B (80.06). A 270M text encoder reaching 78.68 is **notable but not implausible** — the model uses Matryoshka Representation Learning, task-steered instruction prefixes (including a dedicated `CodeRetrieval` prefix), and was trained on code data. However, the score is **self-reported** and has **not been independently verified** on the live MTEB leaderboard (zero rows). The ~14% improvement over EmbeddingGemma-1 (68.76) is consistent with the model card's claim of "~14% improvement on code tasks relative to its predecessor."
- **Source**: Comparison of claims 1, 3, 4, 5, 7, 8, 9 above
- **Fetch date**: 2026-10-07
- **Confidence**: High (multiple primary sources compared)

## Searches

- `MTEB Code v1 leaderboard scores Voyage-Code SFR-Embedding-Code jina-code Qwen3-Embedding` (web_search)
- `jina-embeddings-v5-text-small nano MTEB Code benchmark score` (web_search)
- `embeddinggemma-2 MTEB Code v1 leaderboard score huggingface` (web_search)
- MTEB backend API: `/v1/benchmarks/MTEB%28Code%2C%20v1%29/scores`
- MTEB backend API: `/v1/benchmarks/CoIR/scores`
- MTEB backend API: `/v1/benchmarks/MTEB%28eng%2C%20v2%29/scores`

## Conflicting evidence

- **EmbeddingGemma-2 78.68 vs live board absence**: The model card reports 78.68, but the live MTEB leaderboard has zero `embeddinggemma-2` rows. This is not a conflict per se — the score is self-reported and the model has not been submitted to the live board. However, it means the 78.68 cannot be independently verified via the harness.
- **Qwen3-Embedding-0.6B 75.41 (paper) vs live board absence**: The paper reports 75.41, but the live Code board has no 0.6B row. The paper's number is the only available figure.
- **jina-code 78.72 (vendor) vs no live board presence**: The jina-code-embeddings-0.5B model's 78.72 is vendor-reported and not verified on the live MTEB leaderboard.

## Gaps

- **No live MTEB(Code, v1) scores for any of the three CPU candidates**: EmbeddingGemma-2, Qwen3-Embedding-0.6B, jina-v5-text-small, and jina-v5-text-nano all lack live-board verification on the Code benchmark. All numbers are self-reported (model cards or papers).
- **No code-specific proxy for jina-v5-text-small/nano**: The jina-v5 paper does not report any code-retrieval benchmark (no CoIR, no CodeRAG-Bench, no CodeSearchNet). No proxy is available from primary sources.
- **Voyage-Code and SFR-Embedding-Code scores not verified**: The web search could not confirm live-board MTEB(Code, v1) scores for Voyage-Code or SFR-Embedding-Code-2B_R. These would strengthen the comparison but are not available from primary sources.
- **EmbeddingGemma-1 baseline**: The model card reports EmbeddingGemma-1 at 68.76 on MTEB(Code, v1), but this is also self-reported and not on the live board.
