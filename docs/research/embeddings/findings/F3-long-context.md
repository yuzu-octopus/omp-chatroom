# F3 — Long-Context Embeddings

## Angle
Which embedding models keep retrieval quality past 512 tokens for long documents (room logs, compressed tree summaries).

## Claims

### LongEmbed Benchmark (arXiv 2404.12096, EMNLP 2024)

1. **LongEmbed benchmark**: 6 retrieval tasks — 4 real (NarrativeQA, QMSum, 2WikiMultihopQA, SummScreenFD) + 2 synthetic (Passkey, Needle). Context range 256–32,768 tokens. Documents avg 5,582–50,474 words.
   - Source: https://arxiv.org/html/2404.12096v3
   - Fetch date: 2026-10-07
   - Confidence: primary

2. **LongEmbed Table 2 — 512-context models** (Avg. score %):
   | Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
   |---|---|---|---|---|---|---|---|---|---|
   | E5Base | 110M | 512 | 38.0 | 28.5 | 25.3 | 23.8 | 74.7 | 55.8 | 41.0 |
   | E5-RoPEBase | 110M | 512 | 38.5 | 31.5 | 24.6 | 23.2 | 66.6 | 58.8 | 40.5 |
   | GTEBase | 110M | 512 | 31.0 | 24.5 | 28.6 | 21.8 | 55.8 | 47.3 | 34.8 |
   | BGEBase | 110M | 512 | 18.0 | 25.3 | 25.6 | 22.4 | 60.3 | 51.7 | 33.9 |
   | Contriever | 110M | 512 | 38.5 | 29.0 | 26.7 | 25.5 | 73.5 | 47.3 | 40.1 |
   | GTRBase | 110M | 512 | 38.5 | 26.3 | 26.5 | 18.3 | 63.7 | 52.2 | 36.5 |
   - Source: https://arxiv.org/html/2404.12096v3 (Table 2)
   - Fetch date: 2026-10-07
   - Confidence: primary

3. **LongEmbed Table 2 — ≥4k-context models** (Avg. score %):
   | Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
   |---|---|---|---|---|---|---|---|---|---|
   | E5-Mistral | 7B | 4,096 | 71.0 | 48.3 | 44.6 | 43.6 | 96.8 | 82.0 | 64.4 |
   | Jina-V2 | 137M | 8,192 | 50.3 | 54.5 | 37.9 | 38.9 | 93.5 | 74.0 | 58.2 |
   | Nomic-V1 | 137M | 8,192 | 60.7 | 39.5 | 41.2 | 36.7 | 93.0 | 73.8 | 57.5 |
   | BGE-M3 | 568M | 8,192 | 59.3 | 40.5 | 45.8 | 35.5 | 94.0 | 78.0 | 58.9 |
   | OpenAI-Ada-002 | — | — | 50.8 | 36.8 | 41.1 | 40.0 | 91.8 | 80.1 | 56.8 |
   - Source: https://arxiv.org/html/2404.12096v3 (Table 2)
   - Fetch date: 2026-10-07
   - Confidence: primary

4. **LongEmbed Table 2 — Extended models** (Avg. score %):
   | Model | Param | CTX | Passkey | Needle | NQA | QMS | SFD | WQA | Avg |
   |---|---|---|---|---|---|---|---|---|---|
   | E5Base+Tuning | 110M | 4,096 | 67.3 | 41.5 | 30.4 | 35.7 | 95.2 | 69.2 | 56.6 |
   | E5-RoPEBase+SE | 110M | 4,096 | 73.5 | 53.5 | 32.3 | 39.1 | 91.9 | 74.6 | 60.8 |
   | E5-Mistral+NTK | 7B | 32,768 | 93.8 | 66.8 | 49.8 | 49.2 | 97.1 | 95.2 | 75.3 |
   - Source: https://arxiv.org/html/2404.12096v3 (Table 2)
   - Fetch date: 2026-10-07
   - Confidence: primary

5. **Key finding**: Even best model (E5-Mistral+NTK, 32K) only 75.3 avg. Huge room for improvement. 512-context models avg 33.9–41.0. Long-context models (8K) avg 56.8–58.9. Context extension (NTK/SelfExtend) adds +10.9 to +20.3 points.
   - Source: https://arxiv.org/html/2404.12096v3
   - Fetch date: 2026-10-07
   - Confidence: primary

6. **RoPE superiority**: RoPE-based models (E5-Mistral, E5-RoPEBase) benefit more from NTK/SelfExtend than APE-based (E5Base, GTEBase). RoPE > APE for context extension.
   - Source: https://arxiv.org/html/2404.12096v3
   - Fetch date: 2026-10-07
   - Confidence: primary

7. **LoCo benchmark limitation**: E5Base (512 ctx) achieves >85% nDCG on 3/8 LoCo tasks — biased target info distribution makes LoCo insufficient for long-context eval.
   - Source: https://arxiv.org/html/2404.12096v3 (Figure 2)
   - Fetch date: 2026-10-07
   - Confidence: primary

### Model Context Lengths (Claimed)

8. **jina-embeddings-v3**: 570M params, 8192 tokens, RoPE, 24 layers, FlashAttention2, MRL (1024→32d), task LoRA adapters, late chunking support.
   - Source: https://arxiv.org/html/2409.10173v3
   - Fetch date: 2026-10-07
   - Confidence: primary

9. **jina-embeddings-v2-base-en**: 137M params, 8192 tokens, ALiBi, BERT-small backbone (12 layers, 768 hidden).
   - Source: https://jina.ai/models/jina-embeddings-v2-base-en
   - Fetch date: 2026-10-07
   - Confidence: primary

10. **nomic-embed-text-v1.5**: 137M params, 8192 tokens, RoPE + flash-attn, SwiGLU, MRL (768→64d). Trained at 2048 seq length, Dynamic NTK interpolation at inference for 8192.
    - Source: https://arxiv.org/html/2402.01613v2
    - Fetch date: 2026-10-07
    - Confidence: primary

11. **bge-m3**: 568M params, 8192 tokens, XLM-RoBERTa backbone, MCLS (Multiple CLS) for long text, multi-functionality (dense/sparse/multi-vector).
    - Source: https://zilliz.com/ai-models/bge-m3
    - Fetch date: 2026-10-07
    - Confidence: primary

12. **bge-large-en-v1.5**: 512 tokens (BERT-era limit).
    - Source: https://huggingface.co/BAAI/bge-large-en-v1.5 (model card)
    - Fetch date: 2026-10-07
    - Confidence: primary

13. **gte-Qwen2 series**: 32K context. gte-Qwen2-1.5B-instruct: 1.5B params, 1536d, 32K. gte-Qwen2-7B-instruct: 7B params, 3584d, 32K.
    - Source: https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct
    - Fetch date: 2026-10-07
    - Confidence: primary

14. **gte-multilingual-base**: 305M params, 8192 tokens, 768d, 70+ languages.
    - Source: https://www.kaggle.com/refs/hf-model/Alibaba-NLP/gte-multilingual-base
    - Fetch date: 2026-10-07
    - Confidence: primary

15. **Qwen3-Embedding series**: 32K context. 0.6B (28 layers, 1024d), 4B (36 layers, 2560d), 8B (36 layers, 4096d). MRL support, instruction-aware.
    - Source: https://github.com/QwenLM/Qwen3-Embedding
    - Fetch date: 2026-10-07
    - Confidence: primary

16. **Qwen3-Embedding MTEB scores** (from GitHub README):
    | Model | MTEB(eng,v2) | MMTEB | MTEB-R | MTEB-R(en) | MTEB-R(multi) | MTEB-P(code) | MTEB-P(en) | MTEB-P(multi) | MTEB-S(eng) | MTEB-S(multi) |
    |---|---|---|---|---|---|---|---|---|---|---|
    | 0.6B | 70.70 | 64.88 | 85.76 | 54.05 | 84.37 | 48.18 | 61.83 | 86.57 | 33.43 |
    | 4B | 74.60 | 68.10 | 89.84 | 57.51 | 87.01 | 50.76 | 68.46 | 88.72 | 34.39 |
    | 8B | 75.22 | 68.71 | 90.43 | 58.57 | 87.52 | 51.56 | 69.44 | 88.58 | 34.83 |
    - Source: https://github.com/QwenLM/Qwen3-Embedding
    - Fetch date: 2026-10-07
    - Confidence: primary

17. **stella_en_1.5B_v5**: 1.5B params, 512 base context (trained at max_length=512). MRL dims: 512, 768, 1024, 2048, 4096, 6144, 8192. 1024d recommended. Community reports max_length<1024 suitable.
    - Source: https://huggingface.co/NovaSearch/stella_en_1.5B_v5
    - Fetch date: 2026-10-07
    - Confidence: primary

18. **snowflake-arctic-embed**: 512 context (standard variants). m-long variant: 2048 without RPE, 8192 with RPE. v2.0 multilingual: 8192 tokens.
    - Source: https://huggingface.co/Snowflake/snowflake-arctic-embed-m
    - Fetch date: 2026-10-07
    - Confidence: primary

19. **mxbai-embed-large-v1**: 512 tokens (BERT-era).
    - Source: https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1 (model card)
    - Fetch date: 2026-10-07
    - Confidence: primary

20. **EmbeddingGemma**: 308M params, 2048 tokens, 768d, 100+ languages. Built from Gemma 3 encoder.
    - Source: https://arxiv.org/pdf/2509.20354
    - Fetch date: 2026-10-07
    - Confidence: primary

21. **granite-embedding-english-r2**: 149M params, 8192 tokens, 768d. small-english-r2: 47M, 8192 tokens, 384d. Multilingual r2: 97M/311M, 32,768 tokens.
    - Source: https://huggingface.co/ibm-granite/granite-embedding-english-r2
    - Fetch date: 2026-10-07
    - Confidence: primary

22. **KaLM-Embedding-V2**: 512 tokens max input. 896d, MRL (896/512/256/128/64). V2.5: 494M params.
    - Source: https://arxiv.org/html/2506.20923v3
    - Fetch date: 2026-10-07
    - Confidence: primary

23. **LFM2.5-Embedding-350M**: 512 tokens per input (longer text must be split). 350M params.
    - Source: https://openrouter.ai/liquid/lfm-2.5-embedding-350m:free
    - Fetch date: 2026-10-07
    - Confidence: primary

24. **e5 / multilingual-e5**: 512 tokens (BERT-era limit for base/large).
    - Source: https://huggingface.co/intfloat/e5-base-v2 (model card)
    - Fetch date: 2026-10-07
    - Confidence: primary

25. **SFR-Embedding**: 512/4096 context (Mistral-based: 4096). SFR-Embedding-Mistral was MTEB #1 as of Feb 2024.
    - Source: https://www.salesforce.com/blog/sfr-embedding
    - Fetch date: 2026-10-07
    - Confidence: primary

26. **voyage-3**: 32K tokens, 1024d, Matryoshka (2048/1024/512/256). Outperforms OpenAI-v3-large by 9.74% avg across 100 datasets.
    - Source: https://blog.voyageai.com/2025/01/07/voyage-3-large
    - Fetch date: 2026-10-07
    - Confidence: primary

27. **cohere embed v3**: 512 tokens (embed-multilingual-v3.0). **cohere embed v4**: 128K tokens, 1536d, multimodal. **Embed 5**: 128K tokens, 2048d max.
    - Source: https://docs.cohere.com/docs/cohere-embed
    - Fetch date: 2026-10-07
    - Confidence: primary

### Degradation Curves & Positional Effects

28. **Lost in the Middle** (Liu et al., 2023): LLMs show U-shaped performance curve — highest at beginning/end of context, significant degradation in middle. >30% performance drop when relevant info shifts to middle. Applies to embedding models too.
    - Source: https://cs.stanford.edu/~nfliu/papers/lost-in-the-middle.arxiv2023.pdf
    - Fetch date: 2026-10-07
    - Confidence: primary

29. **RULER** (Hsieh et al., 2024, COLM 2024): 13 synthetic tasks across retrieval/multi-hop/aggregation/QA. Despite near-perfect NIAH, almost all 17 tested LLMs show large performance drops as context increases. Only half of 32K-claiming models maintain satisfactory performance at 32K.
    - Source: https://www.alphaxiv.org/abs/2404.06654
    - Fetch date: 2026-10-07
    - Confidence: primary

30. **BGE-M3 8K behavior**: BGE-M3 uses MCLS (Multiple CLS) to enhance long-text ability without additional fine-tuning. Community discussion suggests 512-token chunks may still be optimal even with 8K context. BGE-M3 trained with 96 A100 GPUs for 8K context.
    - Source: https://huggingface.co/BAAI/bge-m3/discussions/59
    - Fetch date: 2026-10-07
    - Confidence: primary

31. **Nomic 8192 degradation**: Nomic technical report shows nomic-embed-text-v1 underperforms closed-source (Ada-002, text-embedding-3-small/large) at 8191 sequence length on LoCo tasks. text-embedding-3-large performance *decreases* from 512→8191 while text-embedding-3-small and Ada-002 improve.
    - Source: https://arxiv.org/html/2402.01613v2
    - Fetch date: 2026-10-07
    - Confidence: primary

32. **Stella 512 base limitation**: Stella trained at max_length=512. Community reports max_length<1024 suitable. MRL projection heads up to 8192d but input context remains 512.
    - Source: https://huggingface.co/NovaSearch/stella_en_1.5B_v5/discussions/8
    - Fetch date: 2026-10-07
    - Confidence: primary

33. **Granite multilingual r2 context scaling**: Performance improves monotonically with context length:
    | Model | 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768 |
    |---|---|---|---|---|---|---|---|
    | gte-multilingual-base (max 8192) | 38.2 | 43.6 | 49.7 | 59.1 | 62.1 | — | — |
    | granite-97m-multilingual-r2 | 39.1 | 46.4 | 52.9 | 59.0 | 62.9 | 64.3 | 65.5 |
    | granite-311m-multilingual-r2 | 40.3 | 47.7 | 54.1 | 61.3 | 67.1 | 70.7 | 71.7 |
    - Source: https://arxiv.org/html/2605.13521v2 (Appendix D)
    - Fetch date: 2026-10-07
    - Confidence: primary

### Chunking vs Long-Context Tradeoff

34. **Late Chunking** (arXiv 2409.04701, Jina AI): Embed full long document with long-context model, then chunk embeddings after transformer (before mean pooling). Chunk embeddings capture full contextual info. Generic — works with any long-context embedding model. Outperforms naive chunking on BEIR tasks. Improvement correlates with document length.
    - Source: https://arxiv.org/abs/2409.04701
    - Fetch date: 2026-10-07
    - Confidence: primary

35. **Late chunking models tested**: jina-embeddings-v2-small, nomic-v1, jina-embeddings-v3. Ranking: jina-embeddings-v2-small < nomic-v1 < jina-embeddings-v3. Late chunking improves all. Sometimes outperforms whole-document embedding; sometimes no-chunking is best (when chunk ranking not needed).
    - Source: https://jina.ai/news/what-late-chunking-really-is-and-what-its-not-part-ii
    - Fetch date: 2026-10-07
    - Confidence: primary

36. **jina-embeddings-v3 late chunking**: Native support via `late_chunking` parameter. Recommended for documents exceeding 8192 tokens. Combined with task LoRA and MRL.
    - Source: https://jina.ai/models/jina-embeddings-v3
    - Fetch date: 2026-10-07
    - Confidence: primary

37. **jina-v3 LongEmbed performance**: jina-embeddings-v3 shows "significant improvement" over other models on 6 LongEmbed tasks. Outperforms BGE-M3 (fixed PE) and jina-v2 (ALiBi) due to RoPE.
    - Source: https://jina.ai/news/jina-embeddings-v3-a-frontier-multilingual-embedding-model
    - Fetch date: 2026-10-07
    - Confidence: primary

38. **M2-BERT / LoCoV1** (Saad-Falcon et al., 2024): M2-BERT-32k outperforms BM25 by 14.8 points, E5-Mistral (truncation) by 23.3 points, E5-Mistral (chunked) by 24.4 points on LoCoV1. Shows long-context embedding > chunking+pooling.
    - Source: https://arxiv.org/html/2402.07440v3
    - Fetch date: 2026-10-07
    - Confidence: primary

39. **EmbeddingGemma context**: 2048 tokens max. Evaluated at 512 for most tasks, 1024/2048 for LongEmbed Passkey. No degradation reported at 2048.
    - Source: https://arxiv.org/pdf/2509.20354
    - Fetch date: 2026-10-07
    - Confidence: primary

### MTEB Integration

40. **LongEmbed in MTEB**: Incorporated since MTEB v1.6.22. Can evaluate via MTEB framework.
    - Source: https://huggingface.co/papers/2404.12096
    - Fetch date: 2026-10-07
    - Confidence: primary

## Searches
- "LongEmbed arXiv 2404.12096 long context embedding benchmark"
- "jina-embeddings-v3 max context length 8192 ALiBi"
- "nomic-embed-text-v1.5 8192 context length rotary flash attention"
- "bge-m3 embedding 8192 context length BAAI model card"
- "gte-Qwen2 gte-multilingual 32K 8192 context length embedding"
- "Qwen3-Embedding 32K context length 0.6B 4B 8B"
- "stella_en_1.5B_v5 512 32K context embedding"
- "snowflake-arctic-embed mxbai-embed-large-v1 512 context length"
- "EmbeddingGemma 2048 context length Gemma embedding model"
- "granite-embedding 512 8192 context length IBM r2"
- "KaLM-embedding LFM2-embedding context length max tokens"
- "SFR-Embedding voyage-3 cohere embed v3 v4 context length 512 4096 32K 128K"
- "LoCoV1 long context retrieval benchmark embedding models results"
- "late chunking jina embeddings long context arXiv 2409.10173"
- "RULER benchmark long context embedding retrieval evaluation"
- "jina-embeddings-v3 late chunking results benchmark retrieval improvement"
- "BGE-M3 8K degradation long context retrieval quality loss"
- "Lost in the Middle embedding models long context positional bias retrieval"
- "MTEB long context retrieval benchmark LongEmbed subset evaluation"
- "nomic-embed-text-v1.5 8192 degradation performance long context"

## Conflicting Evidence

1. **Stella context length**: Model card says MRL dims up to 8192, but input context is 512. Community confirms max_length<1024 suitable. MRL projection heads ≠ context extension.
   - Winner: Community evidence + model card training detail (trained at 512). MRL dims are output embedding dimensions, not input context.

2. **Nomic 8192 effectiveness**: Model card claims 8192 context. Technical report shows nomic underperforms closed-source at 8191 on LoCo. Trained at 2048, uses Dynamic NTK for 8192 extrapolation — effective context may be lower than claimed.
   - Winner: Technical report (arXiv 2402.01613) — trained at 2048, NTK interpolation to 8192 is extrapolation, not native training.

3. **BGE-M3 8K vs chunking**: Model card promotes 8192 context. Community discussion suggests 512-token chunks may still be optimal. MCLS helps but may not match native long-context training.
   - Winner: No definitive published evidence either way. BGE-M3 paper (arXiv 2402.03216) shows MCLS improves long text but no direct comparison vs chunking at 8K.

4. **Cohere embed v3 vs v4 context**: v3 is 512 tokens, v4 is 128K. Massive jump. v4 is multimodal (text+images) — text-only evaluation may not show same benefit.
   - Winner: Cohere docs (primary). v4 128K is for API; self-hosting not available.

## Gaps

1. **No published degradation curve for jina-v3 at 8K**: jina-v3 paper shows LongEmbed improvement but no per-context-length breakdown (512/1K/2K/4K/8K).
2. **No head-to-head CPU benchmark**: All LongEmbed/LoCo results are GPU-based. No published CPU-only (i5-1135G7) retrieval quality/speed numbers.
3. **No published late chunking + Qwen3-Embedding or gte-Qwen2 results**: Late chunking paper only tests jina-v2-small, nomic-v1, jina-v3.
4. **No MTEB long-context subset scores for Qwen3-Embedding at 32K**: Qwen3 paper shows MTEB scores but not broken down by context length.
5. **EmbeddingGemma 2048 effectiveness**: No published comparison vs chunking at 2048 tokens.
6. **No published SFR-Embedding-2_R or SFR-Embedding-Code context length**: SFR blog mentions 512/4096 but newer models unclear.
7. **Voyage-3 32K effectiveness**: No published per-context-length breakdown. API-only, no self-hosting.
8. **Cohere embed v4 128K text-only evaluation**: No published text-only retrieval scores at 128K context.
