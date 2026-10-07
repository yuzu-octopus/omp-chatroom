# Brief: embedding models for a local, text-only retrieval layer

Date: 2026-10-07. Depth: **deep**.

## Question

Which embedding models are suitable for a **local, CPU-only, text-only** retrieval layer, and how
do they compare on published benchmarks?

Two jobs, in order:

1. **Landscape** — enumerate the serious text embedding models (open weights and API) and compare
   them on published benchmark results.
2. **Application** — map the findings onto this repo's use case: semantic retrieval over an
   agent-room log and its compressed tree summaries (see
   `docs/research/omp-agent-chatroom/PLAN-build.md` §3.6, §4.1 `recall`, §5.4).

## Decision this informs

Whether to add embeddings to the room's retrieval path, and if so which model — given that the
host (omp) **already ships a local embedding pipeline** and the target machine is CPU-only.

## Hard constraints (user-set)

- **Deployment: local CPU only.** No API models as the primary recommendation. Target hardware:
  Intel i5-1135G7 (4c/8t, Tiger Lake), **15 GB RAM**, Intel Iris Xe, **no CUDA**. Any model must
  be runnable on CPU.
- **Text-only.** For multimodal models (EmbeddingGemma, and any vision/audio-capable model),
  evaluate **only the text encoder**. Report parameter count and size **excluding** the non-text
  layers where that is separable; where it is not separable, say so explicitly and report both
  the total and the text-only estimate.
- **Published benchmarks only. No local evaluation.** Do not propose or run our own benchmark.
  Report what is already published, with sources.
- **No size cap** — report the tradeoff curve (quality vs size vs CPU speed) and let the reader
  choose. Do include latency/throughput figures where published for CPU.

## Existing context to build on (verified — do not redo)

- omp already runs local embeddings: `fastembed` + `onnxruntime-node` in a dedicated worker
  (`@oh-my-pi/pi-coding-agent/src/mnemopi/embed-worker.ts`). Settings exist for
  `mnemopi.embeddingVariant` (`en` / `multilingual`), `mnemopi.embeddingModel` (explicit override),
  `mnemopi.embeddingApiUrl` + `embeddingApiKey` (OpenAI-compatible endpoint), and an FTS-only
  escape hatch. So the integration point already exists.
- OptMem has **no** embeddings — its `recall` is a literal regex scan over the log
  (`github.com/VictorTaelin/OptMem`, `memo:731-756`). So this is an addition, not a port.
- The room's retrieval needs: (a) find past messages semantically, (b) route/classify a message to
  a topic or tree node, (c) dedup near-identical posts. Note that (b) and (c) may favour different
  models than (a).

## Angles

1. **Landscape enumeration** — every serious text embedding model family: open-weights
   (BGE/M3, GTE/Qwen3-Embedding, E5, Nomic, Jina, Stella, Snowflake Arctic, mxbai, EmbeddingGemma,
   Granite, KaLM, LFM2, Voyage/open, IBM Granite, SFR, Cohere open) and notable API-only
   (Voyage, Cohere, OpenAI, Gemini, Jina v5 API) for completeness.
2. **MTEB results** — retrieval, classification, clustering, STS subsets. Report actual scores
   with the leaderboard snapshot date.
3. **Long-context embeddings** — LongEmbed and similar; the room log and its summaries are long
   documents. Which models keep quality past 512 tokens?
4. **Multilingual / MMTEB** — relevant if the room ever holds non-English text; report separately.
5. **CPU inference reality** — published latency/throughput for CPU (ONNX, GGUF, llama.cpp),
   memory footprint at inference, quantization options and their quality cost.
6. **Text-only suitability for multimodal models** — for EmbeddingGemma and any other multimodal
   model, isolate the text encoder: params, size, and text-benchmark scores.
7. **Retrieval vs classification suitability** — which models win at short-text classification and
   dedup versus long-text retrieval. This decides the room's architecture (one model or two).
8. **Counter-angle** — evidence *against* embeddings for this use case: where lexical/FTS+BM25
   beats dense retrieval, hybrid retrieval evidence, and the failure modes (domain shift, exact
   identifiers, code). The room's content is agent chatter full of identifiers and file paths.

## Answer form

A comparison report: a ranked table per job (retrieval / classification) with model, params,
text-only size, dim, max context, key MTEB scores, CPU feasibility, and licence; then a
recommendation with the tradeoff curve, and an explicit statement of what would change it.

## Out of scope

Running our own benchmark. Training or fine-tuning. Vision/audio capability except as noted.
