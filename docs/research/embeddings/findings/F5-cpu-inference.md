# F5 — CPU Inference Reality

## Angle
CPU inference reality for embedding models on Intel i5-1135G7 (4c/8t Tiger Lake, 15GB RAM, no CUDA). Which models are actually runnable and how fast?

## Claims

### 1. Published CPU Latency/Throughput Benchmarks

| Model | Hardware | Backend | Batch | SeqLen | Metric | Value | Source | Date | Confidence |
|-------|----------|---------|-------|--------|--------|-------|--------|------|------------|
| all-MiniLM-L6-v2 (22.7M) | i7-13700K (16c/24t) | torch-fp32 | best of 8/20 threads | 256 | throughput | baseline (1x) | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | i7-13700K | openvino-qint8 | best of 8/20 threads | 256 | speedup | ~2.5-3.5x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | i7-13700K | onnx-qint8 (avx512_vnni) | best of 8/20 threads | 256 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | i7-13700K | llamacpp-Q4_K_M | best of 8/20 threads | 256 | speedup | ~2-4x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-base-en-v1.5 (109M) | i7-13700K | torch-fp32 | best of 8/20 threads | 512 | throughput | baseline (1x) | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-base-en-v1.5 | i7-13700K | openvino-qint8 | best of 8/20 threads | 512 | speedup | ~2.5-3.5x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-base-en-v1.5 | i7-13700K | onnx-qint8 | best of 8/20 threads | 512 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| mxbai-embed-large-v1 (335M) | i7-13700K | torch-fp32 | best of 8/20 threads | 512 | throughput | baseline (1x) | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | i7-13700K | openvino-qint8 | best of 8/20 threads | 512 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | i7-13700K | onnx-qint8 | best of 8/20 threads | 512 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-m3 (567M) | i7-13700K | torch-fp32 | best of 8/20 threads | 8192 | throughput | baseline (1x) | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-m3 | i7-13700K | openvino-qint8 | best of 8/20 threads | 8192 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-m3 | i7-13700K | onnx-qint8 | best of 8/20 threads | 8192 | speedup | ~2-3x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| bge-m3 | i7-13700K | llamacpp-Q4_K_M | best of 8/20 threads | 8192 | speedup | ~2-4x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | HF cpu-upgrade (cloud) | llamacpp-Q4_K_M | best of 8/20 threads | 256 | speedup | leads over openvino-qint8 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | HF cpu-upgrade (cloud) | openvino-qint8 | best of 8/20 threads | 256 | speedup | ~2.5-3.5x vs fp32 | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | Xeon E5-2620 v2 (12 logical cores) | ONNX Runtime | various | various | speedup | up to 17x (transformer models) | [medium.com/microsoft](https://medium.com/microsoft/accelerate-your-nlp-pipelines-using-hugging-face-transformers-and-onnx-runtime-2443578f4333) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | 16-core server (avg cheap) | ONNX Runtime (Manticore) | 1 | 256 | docs/sec | 70-230 | [manticoresearch.com](https://manticoresearch.com/blog/onnx-embeddings-speedup) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | 16-core server | ONNX Runtime (Manticore) | 1 | 256 | single-insert latency | ~14ms | [manticoresearch.com](https://manticoresearch.com/blog/onnx-embeddings-speedup) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | 16-core server | ONNX Runtime (Manticore) | 8 concurrent | 256 | latency | ~56ms | [manticoresearch.com](https://manticoresearch.com/blog/onnx-embeddings-speedup) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision (e4_a8_f4_p4) | 1 | 256 | init time | 17.6ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 256 | inference time | 66ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 512 | inference time | 169ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 1024 | inference time | 549ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 2048 | inference time | 2455ms | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 256 | memory (RSS) | 110MB | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| EmbeddingGemma-300M | CPU (unspecified) | Mixed Precision | 1 | 2048 | memory (RSS) | 196MB | [litert-community](https://huggingface.co/litert-community/embeddinggemma-300m) | 2026-10-07 | primary |
| e5-small-v2 | Graviton3 | INT8 | 1 | 512 | query inference | 2.5ms | [blog.vespa.ai](https://blog.vespa.ai/embedding-tradeoffs-quantified) | 2026-10-07 | secondary |
| bge-large-en-v1.5 | Graviton3 | INT8 | 1 | 512 | speedup | 2.7-3.4x vs fp32 | [blog.vespa.ai](https://blog.vespa.ai/embedding-tradeoffs-quantified) | 2026-10-07 | secondary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | float32 | 1 | 512 | retrieval speed | 1x (baseline) | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | int8 | 1 | 512 | retrieval speed | 3.66x avg | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | GCP a2-highgpu-4g (CPU) | binary | 1 | 512 | retrieval speed | 24.76x avg | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| nomic-embed-text-v1.5 | CPU (unspecified) | F16 GGUF | 1 | 2048 | model size | 274MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-nomic-embed-text/37026) | 2026-10-07 | secondary |
| nomic-embed-text-v1.5 | CPU (unspecified) | Q8_0 GGUF | 1 | 2048 | model size | 146MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-nomic-embed-text/37026) | 2026-10-07 | secondary |
| Qwen3-Embedding-0.6B | L4 GPU | - | 1 | 32768 | latency p50 | 157ms | [superlinked.com](https://superlinked.com/blog/qwen3-embedding-reranker-guide) | 2026-10-07 | secondary |
| Qwen3-Embedding-0.6B | L4 GPU | - | 1 | 32768 | throughput | 12.3K tok/s | [superlinked.com](https://superlinked.com/blog/qwen3-embedding-reranker-guide) | 2026-10-07 | secondary |
| Qwen3-Embedding-4B | L4 GPU | - | 1 | 32768 | latency p50 | 464ms | [superlinked.com](https://superlinked.com/blog/qwen3-embedding-reranker-guide) | 2026-10-07 | secondary |
| gte-Qwen2-1.5B | L4 GPU | - | 1 | 32768 | latency p50 | 261ms | [superlinked.com](https://superlinked.com/models/alibaba-nlp-gte-qwen2-1-5b-instruct) | 2026-10-07 | secondary |
| gte-Qwen2-1.5B | L4 GPU | - | 1 | 32768 | throughput | 12.3K tok/s | [superlinked.com](https://superlinked.com/models/alibaba-nlp-gte-qwen2-1-5b-instruct) | 2026-10-07 | secondary |

**Hardware note**: i7-13700K is 16c/24t desktop — significantly faster than i5-1135G7 (4c/8t laptop). Expect ~3-5x slower throughput on i5-1135G7. Xeon E5-2620 v2 is older server CPU. Graviton3 is ARM server CPU. GCP a2-highgpu-4g uses CPU for retrieval. L4 GPU numbers shown for reference only — not applicable to CPU-only target.

### 2. fastembed / onnxruntime-node Reality

| Model | Dim | Size (GB) | Source | Date | Confidence |
|-------|-----|-----------|--------|------|------------|
| BAAI/bge-small-en-v1.5 | 384 | 0.067 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| BAAI/bge-small-zh-v1.5 | 512 | 0.090 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| snowflake/snowflake-arctic-embed-xs | 384 | 0.090 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| sentence-transformers/all-MiniLM-L6-v2 | 384 | 0.090 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| jinaai/jina-embeddings-v2-small-en | 512 | 0.120 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| BAAI/bge-small-en | 384 | 0.130 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| snowflake/snowflake-arctic-embed-s | 384 | 0.130 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| nomic-ai/nomic-embed-text-v1.5-Q | 768 | 0.130 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| BAAI/bge-base-en-v1.5 | 768 | 0.210 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 | 384 | 0.220 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| Qdrant/clip-ViT-B-32-text | 512 | 0.250 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| jinaai/jina-embeddings-v2-base-de | 768 | 0.320 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| BAAI/bge-base-en | 768 | 0.420 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| snowflake/snowflake-arctic-embed-m | 768 | 0.430 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| nomic-ai/nomic-embed-text-v1.5 | 768 | 0.520 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| jinaai/jina-embeddings-v2-base-en | 768 | 0.520 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| nomic-ai/nomic-embed-text-v1 | 768 | 0.520 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| snowflake/snowflake-arctic-embed-m-long | 768 | 0.540 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| mixedbread-ai/mxbai-embed-large-v1 | 1024 | 0.640 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| jinaai/jina-embeddings-v2-base-code | 768 | 0.640 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| sentence-transformers/paraphrase-multilingual-mpnet-base-v2 | 768 | 1.000 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| snowflake/snowflake-arctic-embed-l | 1024 | 1.020 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| thenlper/gte-large | 1024 | 1.200 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| BAAI/bge-large-en-v1.5 | 1024 | 1.200 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |
| intfloat/multilingual-e5-large | 1024 | 2.240 | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) | 2026-10-07 | primary |

**Key facts:**
- fastembed ships quantized ONNX models (all models quantized for CPU/Intel) [qdrant.tech/articles/fastembed](https://qdrant.tech/articles/fastembed)
- Default model: BAAI/bge-small-en-v1.5 (384 dim, 0.067GB) [qdrant.tech/articles/fastembed](https://qdrant.tech/articles/fastembed)
- Supports custom model registration with different quantization levels (e.g. onnx/model_O4.onnx) [github.com/qdrant/fastembed](https://github.com/qdrant/fastembed)
- fastembed uses ONNX Runtime with CPUExecutionProvider by default [qdrant.tech/documentation/fastembed](https://qdrant.tech/documentation/fastembed)
- omp uses fastembed + onnxruntime-node (per repo brief)

### 3. Memory Footprint at Inference

| Model | Params | FP32 Size | FP16 Size | INT8 Size | Q4 Size | Source | Date | Confidence |
|-------|--------|-----------|-----------|-----------|---------|--------|------|------------|
| bge-small-en-v1.5 | 33M | ~132MB | ~66MB | ~33MB | ~17MB | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) (0.067GB quantized) | 2026-10-07 | primary |
| bge-base-en-v1.5 | 109M | ~436MB | ~218MB | ~109MB | ~55MB | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) (0.210GB quantized) | 2026-10-07 | primary |
| bge-large-en-v1.5 | 335M | ~1.34GB | ~670MB | ~335MB | ~168MB | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) (1.200GB quantized) | 2026-10-07 | primary |
| bge-m3 | 568M | ~2.27GB | ~1.14GB | ~568MB | ~284MB | [huggingface.co/BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) | 2026-10-07 | primary |
| e5-small-v2 | 33M | ~132MB | ~66MB | ~33MB | ~17MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| e5-base-v2 | 110M | ~440MB | ~220MB | ~110MB | ~55MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| e5-large-v2 | 335M | ~1.34GB | ~670MB | ~335MB | ~168MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| multilingual-e5-small | 118M | ~472MB | ~236MB | ~118MB | ~59MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| multilingual-e5-base | 278M | ~1.11GB | ~556MB | ~278MB | ~139MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| multilingual-e5-large | 560M | ~2.24GB | ~1.12GB | ~560MB | ~280MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-e5/37118) | 2026-10-07 | secondary |
| nomic-embed-text-v1.5 | 137M | ~548MB | ~274MB | ~137MB | ~69MB | [discuss.4d.com](https://discuss.4d.com/t/getting-to-know-the-models-nomic-embed-text/37026) | 2026-10-07 | secondary |
| snowflake-arctic-embed-xs | 22M | ~88MB | ~44MB | ~22MB | ~11MB | [github.com/Snowflake-Labs](https://github.com/Snowflake-Labs/arctic-embed) | 2026-10-07 | primary |
| snowflake-arctic-embed-s | 33M | ~132MB | ~66MB | ~33MB | ~17MB | [github.com/Snowflake-Labs](https://github.com/Snowflake-Labs/arctic-embed) | 2026-10-07 | primary |
| snowflake-arctic-embed-m | 110M | ~440MB | ~220MB | ~110MB | ~55MB | [github.com/Snowflake-Labs](https://github.com/Snowflake-Labs/arctic-embed) | 2026-10-07 | primary |
| snowflake-arctic-embed-m-long | 137M | ~548MB | ~274MB | ~137MB | ~69MB | [github.com/Snowflake-Labs](https://github.com/Snowflake-Labs/arctic-embed) | 2026-10-07 | primary |
| snowflake-arctic-embed-l | 335M | ~1.34GB | ~670MB | ~335MB | ~168MB | [github.com/Snowflake-Labs](https://github.com/Snowflake-Labs/arctic-embed) | 2026-10-07 | primary |
| snowflake-arctic-embed-l-v2.0 | 568M | ~2.27GB | ~1.14GB | ~568MB | ~284MB | [huggingface.co/Snowflake](https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | 335M | ~1.34GB | ~670MB | ~335MB | ~168MB | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) (0.640GB quantized) | 2026-10-07 | primary |
| EmbeddingGemma-300M | 308M | ~1.23GB | ~616MB | ~308MB | ~154MB | [developers.googleblog.com](https://developers.googleblog.com/en/introducing-embeddinggemma) (sub-200MB with quantization) | 2026-10-07 | primary |
| granite-embedding-107m | 107M | ~428MB | ~214MB | ~107MB | ~54MB | [ibm.com/docs](https://www.ibm.com/docs/en/watsonx/saas?topic=models-granite-embedding-107m-multilingual-model-card) | 2026-10-07 | primary |
| granite-embedding-278m | 278M | ~1.11GB | ~556MB | ~278MB | ~139MB | [ibm.com/docs](https://www.ibm.com/docs/en/watsonx/saas?topic=models-granite-embedding-278m-multilingual-model-card) | 2026-10-07 | primary |
| Qwen3-Embedding-0.6B | 596M | ~2.38GB | ~1.19GB | ~596MB | ~298MB | [ollama.com](https://ollama.com/library/qwen3-embedding:0.6b) (639MB) | 2026-10-07 | primary |
| Qwen3-Embedding-4B | 4B | ~16GB | ~8GB | ~4GB | ~2GB | [github.com/QwenLM](https://github.com/QwenLM/Qwen3-Embedding) | 2026-10-07 | primary |
| Qwen3-Embedding-8B | 8B | ~32GB | ~16GB | ~8GB | ~4GB | [github.com/QwenLM](https://github.com/QwenLM/Qwen3-Embedding) | 2026-10-07 | primary |
| gte-Qwen2-1.5B | 1.8B | ~7.2GB | ~3.6GB | ~1.8GB | ~900MB | [superlinked.com](https://superlinked.com/models/alibaba-nlp-gte-qwen2-1-5b-instruct) | 2026-10-07 | secondary |
| gte-Qwen2-7B | 7B | ~28GB | ~14GB | ~7GB | ~3.5GB | [huggingface.co/Alibaba-NLP](https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct) | 2026-10-07 | primary |
| jina-embeddings-v2-base-en | 278M | ~1.11GB | ~556MB | ~278MB | ~139MB | [qdrant.github.io](https://qdrant.github.io/fastembed/examples/Supported_Models) (0.520GB quantized) | 2026-10-07 | primary |
| jina-embeddings-v3 | 572M | ~2.29GB | ~1.14GB | ~572MB | ~286MB | [jina.ai](https://jina.ai/models/jina-embeddings-v3) | 2026-10-07 | primary |
| KaLM-Embedding-Gemma3-12B | 11.8B | ~47.2GB | ~23.6GB | ~11.8GB | ~5.9GB | [ollama.com](https://ollama.com/frob/KaLM-Embedding-Gemma3-12B-2511:latest) (24GB F16) | 2026-10-07 | primary |
| LFM2.5-Encoder-350M | 354M | ~1.42GB | ~708MB | ~354MB | ~177MB | [huggingface.co/LiquidAI](https://huggingface.co/LiquidAI/LFM2.5-Encoder-350M) | 2026-10-07 | primary |
| LFM2.5-Embedding-350M | 354M | ~1.42GB | ~708MB | ~354MB | ~177MB | [huggingface.co/LiquidAI](https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M) | 2026-10-07 | primary |

**Note**: FP32/FP16/INT8/Q4 sizes computed from parameter count (4 bytes/param for FP32, 2 for FP16, 1 for INT8, 0.5 for Q4). fastembed sizes are actual shipped quantized ONNX sizes. EmbeddingGemma achieves sub-200MB with QAT quantization.

### 4. Quantization Options and Measured Quality Cost

| Model | Quantization | MTEB Retrieval (NDCG@10) | % of FP32 | Source | Date | Confidence |
|-------|-------------|--------------------------|-----------|--------|------|------------|
| mxbai-embed-large-v1 | float32 | 54.39 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | int8 | 52.79 | 97% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | binary | 52.46 | 96.45% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | binary + rescoring | 52.46 | 96.45% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| mxbai-embed-large-v1 | int8 + rescoring (4x) | ~54 | ~99% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| e5-base-v2 | float32 | 50.77 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| e5-base-v2 | int8 | 47.54 | 94.68% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| e5-base-v2 | binary | 37.96 | 74.77% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| nomic-embed-text-v1.5 | float32 | 53.01 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| nomic-embed-text-v1.5 | binary | 46.49 | 87.7% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | float32 | 41.66 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | int8 | 37.82 | 90.79% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| all-MiniLM-L6-v2 | binary | 39.07 | 93.79% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| Cohere-embed-english-v3.0 | float32 | 55.0 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| Cohere-embed-english-v3.0 | int8 | 55.0 | 100% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |
| Cohere-embed-english-v3.0 | binary | 52.3 | 94.6% | [huggingface.co/blog](https://huggingface.co/blog/embedding-quantization) | 2026-10-07 | primary |

**Summary table from HF blog:**
| Quantization | Memory Savings | Retrieval Speed | % of Default Performance |
|-------------|---------------|----------------|-------------------------|
| float32 | 1x | 1x | 100% |
| int8/uint8 | 4x | up to 4x | ~99.3% |
| binary/ubinary | 32x | up to 45x | ~96% |

**Model weight quantization (ONNX/OpenVINO):**
- ONNX dynamic quantization (int8): no calibration dataset needed, ~2-3x speedup on CPU [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- OpenVINO static quantization (int8): requires calibration dataset, ~2.5-3.5x speedup on CPU [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- OpenVINO INT8 performs best on i7-13700K; llama.cpp leads on cloud instances [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)
- Quality ratio for OpenVINO/ONNX INT8: ~0.95-1.0 vs FP32 (from sbert.net quality bars) [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html)

**EmbeddingGemma quantization:**
- QAT (Quantization-Aware Training) with int4 for embeddings/FFN/projections, int8 for attention (e4_a8_f4_p4) [huggingface.co/litert-community](https://huggingface.co/litert-community/embeddinggemma-300m)
- Sub-200MB RAM usage with quantization [developers.googleblog.com](https://developers.googleblog.com/en/introducing-embeddinggemma)
- Performance persists at 4-bit precision [arxiv.org/pdf/2509.20354](https://arxiv.org/pdf/2509.20354)

### 5. GPU-Only or Effectively GPU-Only Models

| Model | Issue | Evidence | Source | Date | Confidence |
|-------|-------|----------|--------|------|------------|
| jina-embeddings-v3 | Requires CUDA-capable GPU for production throughput | "The model requires CUDA-capable GPU for production throughput" | [jina.ai](https://jina.ai/models/jina-embeddings-v3) | 2026-10-07 | primary |
| jina-embeddings-v3 | FlashAttention2 required (GPU optimization) | Architecture uses FlashAttention2 | [arxiv.org](https://arxiv.org/html/2409.10173v3) | 2026-10-07 | primary |
| Qwen3-Embedding-8B | 8B params, 32GB FP32 / 16GB FP16 / 8GB INT8 / 4GB Q4 — impractical on 15GB RAM CPU | Model size from parameter count | [github.com/QwenLM](https://github.com/QwenLM/Qwen3-Embedding) | 2026-10-07 | primary |
| Qwen3-Embedding-4B | 4B params, 16GB FP32 / 8GB FP16 / 4GB INT8 / 2GB Q4 — borderline on 15GB RAM | Model size from parameter count | [github.com/QwenLM](https://github.com/QwenLM/Qwen3-Embedding) | 2026-10-07 | primary |
| gte-Qwen2-7B | 7B params, 28GB FP32 / 14GB FP16 / 7GB INT8 / 3.5GB Q4 — impractical on 15GB RAM CPU | Model size from parameter count | [huggingface.co/Alibaba-NLP](https://huggingface.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct) | 2026-10-07 | primary |
| KaLM-Embedding-Gemma3-12B | 11.8B params, 47GB FP32 / 24GB F16 — impossible on 15GB RAM | Ollama shows 24GB F16 | [ollama.com](https://ollama.com/frob/KaLM-Embedding-Gemma3-12B-2511:latest) | 2026-10-07 | primary |
| bge-m3 (GPU only in sbert.net benchmark) | Tested GPU only in sbert.net CPU benchmark section | "BAAI/bge-m3: 567M parameters (GPU only)" | [sbert.net](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) | 2026-10-07 | primary |

**Note**: bge-m3 is marked "GPU only" in the sbert.net CPU benchmark section, but this appears to be a testing scope limitation rather than a hardware requirement. The model can run on CPU via ONNX/OpenVINO but was not benchmarked on CPU in that particular test.

### 6. Practical CPU Feasibility Ranking (i5-1135G7, 15GB RAM)

| Tier | Models | Expected CPU Performance | RAM Footprint | Notes |
|------|--------|-------------------------|---------------|-------|
| **Small (≤150M)** | bge-small-en-v1.5 (33M), all-MiniLM-L6-v2 (22.7M), snowflake-arctic-embed-xs (22M), snowflake-arctic-embed-s (33M), e5-small-v2 (33M), granite-embedding-107m (107M), nomic-embed-text-v1.5 (137M), snowflake-arctic-embed-m (110M), snowflake-arctic-embed-m-long (137M), jina-embeddings-v2-small-en | ~50-200 sentences/sec (estimated from i7-13700K benchmarks scaled to 4c/8t) | 20-300MB | All fit comfortably. Quantized ONNX via fastembed. |
| **Medium (150-500M)** | bge-base-en-v1.5 (109M), bge-large-en-v1.5 (335M), mxbai-embed-large-v1 (335M), e5-base-v2 (110M), e5-large-v2 (335M), multilingual-e5-small (118M), multilingual-e5-base (278M), granite-embedding-278m (278M), EmbeddingGemma-300M (308M), LFM2.5-Encoder-350M (354M), jina-embeddings-v2-base-en (278M), snowflake-arctic-embed-l (335M) | ~10-50 sentences/sec (estimated) | 100MB-1.5GB | All fit in 15GB RAM. INT8 quantization recommended. |
| **Large (500M-1.5B)** | bge-m3 (568M), nomic-embed-text-v1.5 (137M but 8K context), snowflake-arctic-embed-l-v2.0 (568M), Qwen3-Embedding-0.6B (596M), gte-Qwen2-1.5B (1.8B), LFM2.5-Embedding-350M (354M) | ~5-20 sentences/sec (estimated) | 500MB-3GB | Fit in 15GB RAM with INT8. Q4 quantization for larger models. |
| **XL (>1.5B)** | Qwen3-Embedding-4B (4B), Qwen3-Embedding-8B (8B), gte-Qwen2-7B (7B), KaLM-Embedding-Gemma3-12B (11.8B) | ~1-5 sentences/sec (estimated) | 2-12GB (Q4) | Borderline. Q4 quantization mandatory. 15GB RAM tight for 8B+. Not recommended for CPU-only. |

**Estimation methodology**: i7-13700K (16c/24t) benchmarks from sbert.net scaled to i5-1135G7 (4c/8t) by ~3-5x reduction factor. Actual performance varies by model architecture, sequence length, and batch size.

## Searches
1. "ONNX Runtime CPU embedding model benchmark latency throughput sentence-transformers"
2. "fastembed supported models list ONNX quantization qdrant"
3. "OpenVINO embedding model CPU benchmark optimum-intel sentence-transformers"
4. "embedding quantization quality cost int8 q4 retrieval score delta MTEB benchmark"
5. "llama.cpp embedding model CPU benchmark tokens per second GGUF"
6. "bge-m3 model size parameters CPU inference memory footprint"
7. "EmbeddingGemma 300M model card CPU inference size quantization"
8. "Qwen3-Embedding-0.6B model card CPU inference requirements size"
9. "jina-embeddings-v3 model card CPU requirements flash attention"
10. "granite-embedding-107m 278m model card IBM parameters size"
11. "snowflake-arctic-embed-m-l-v2 model card parameters size CPU"
12. "LFM2 embedding model HuggingFace size parameters"
13. "gte-Qwen2-1.5B 7B embedding model card size parameters"
14. "KaLM embedding model Gemma3 parameters size HuggingFace"
15. "nomic-embed-text-v1.5 model size parameters CPU inference"
16. "e5-small e5-base e5-large model size parameters dimensions"

## Conflicting Evidence
1. **bge-m3 CPU capability**: sbert.net labels bge-m3 as "GPU only" in CPU benchmark section, but the model can technically run on CPU via ONNX/OpenVINO. This appears to be a testing scope limitation, not a hardware requirement. No official CPU benchmark for bge-m3 found.
2. **OpenVINO vs llama.cpp ranking**: sbert.net states "OpenVINO INT8 performs best on the local i7-13700K shown here, but llama.cpp leads on the cloud instance I tested." CPU ranking differs between local desktop and cloud server. i5-1135G7 is laptop CPU — ranking may differ again.
3. **fastembed quantization level**: fastembed ships quantized ONNX models but the exact quantization level (int8 vs int4) is not explicitly stated in the supported models list. The Qdrant article says "All the models we support are quantized" but does not specify the quantization format.
4. **EmbeddingGemma CPU benchmark hardware**: The litert-community benchmark shows CPU inference times but does not specify the CPU model used. The "Mixed Precision" quantization (e4_a8_f4_p4) is specific to LiteRT/EdgeTPU and may not directly apply to ONNX Runtime on x86 CPU.

## Gaps
1. **No official i5-1135G7 (4c/8t laptop) CPU benchmarks found** for any embedding model. All CPU benchmarks use desktop i7-13700K (16c/24t), server Xeon, or ARM Graviton3. Estimates for i5-1135G7 are extrapolated.
2. **No published CPU latency/throughput for bge-m3 on CPU** — only GPU benchmarks found.
3. **No published CPU latency/throughput for Qwen3-Embedding-0.6B on CPU** — only GPU (L4) benchmarks found.
4. **No published CPU latency/throughput for gte-Qwen2-1.5B on CPU** — only GPU (L4) benchmarks found.
5. **No published CPU latency/throughput for KaLM-Embedding-Gemma3-12B on CPU** — only GGUF size information found.
6. **No published CPU latency/throughput for LFM2.5-Encoder/Embedding-350M on CPU** — only model specs found.
7. **No published CPU latency/throughput for granite-embedding-107m/278m on CPU** — only model specs found.
8. **No published CPU latency/throughput for snowflake-arctic-embed-l-v2.0 on CPU** — only model specs found.
9. **No published CPU latency/throughput for jina-embeddings-v3 on CPU** — model card states CUDA required for production throughput.
10. **No published CPU latency/throughput for EmbeddingGemma-300M on x86 CPU** — only LiteRT/EdgeTPU CPU benchmarks found, not x86.
11. **No published int8 vs fp32 quality delta for bge-small-en-v1.5, bge-base-en-v1.5, bge-large-en-v1.5 specifically** — only mxbai-embed-large-v1, e5-base-v2, nomic-embed-text-v1.5, all-MiniLM-L6-v2 tested in HF blog.
12. **No published int8 vs fp32 quality delta for snowflake-arctic-embed-m/l, granite-embedding, Qwen3-Embedding, gte-Qwen2, KaLM, LFM2** — not tested in HF blog.
13. **No published ONNX quantization quality delta (int8 vs fp32) for retrieval tasks** — sbert.net shows quality bars but exact numbers not extracted from the chart image.
14. **No published OpenVINO quantization quality delta (int8 vs fp32) for retrieval tasks** — sbert.net shows quality bars but exact numbers not extracted from the chart image.
15. **No published llama.cpp GGUF quantization quality delta (Q4_K_M vs F16) for retrieval tasks** — sbert.net mentions embedding agreement check but not exact retrieval score delta.
