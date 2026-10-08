# D: Constants calibration — OptChat spec vs our room

**Date:** 2026-10-08
**Source spec:** `docs/research/optmem-2026-10-08/optchat-2026-10-08.md`
**Our code:** `plugin/src/store/tree-store.ts`, `plugin/src/store/compactor.ts`, `plugin/src/attention/governor.ts`, `plugin/src/store/config.ts`
**Prior analysis:** `docs/research/omp-agent-chatroom/findings/F21-W5.md`

## Verdict table

| Constant | Spec value | Our value | Verdict | One-line reason |
|---|---|---|---|---|
| Node size | **512 bytes** | **288 bytes** (`TREE_REC`) | **recalibrate to 512** | Spec tested 128 and found it useless; 288 is ~36 words, too short for a "dense paragraph." Our 288 was inherited from OptMem untested. |
| View sawtooth | **64 KB → 128 KB**, batch-merge to 64 KB | **96 lines** (`COVER_BUDGET_LINES`) | **recalibrate to byte-based sawtooth** | Byte-based bounds token cost directly; line count doesn't account for variable line lengths. Sawtooth batch-merges are cache-friendly. |
| Compaction view | **16–32 KB** | **none** | **inapplicable** | Our compactor builds nodes bottom-up from raw/children; it has no separate "compaction view" turn context. |
| Concurrency (JOBS) | **8** | **8** (`COMPACT_JOBS`) | **transfer unchanged** | Spec's 8 is for one writer; our room's rate is bounded by srTCM (1 post/2s/agent). 10 agents → 5 posts/s → ~10 calls/s at 1–2s latency. JOBS=8 is borderline but adequate because the tree is advisory (T3) and never blocks readers. |
| Compaction retries | **5**, keep shortest | **3** (`COMPACT_MAX_RETRIES`) | **recalibrate to 5** | Spec's 5-with-keep-shortest is strictly better: more chances, keeps the best result. Our 3 was `[invented]` without strong justification. |
| Message-node trigger | **< 8 lines unbuilt before it** | **none** (FIFO queue) | **inapplicable** | Our compactor processes `tree.pending()` smallest-first; no per-message trigger needed. The spec's trigger is for eager per-message building. |
| Tool output clip | **30,000 chars** head+tail | **8,192 bytes** (`maxBodyBytes`) | **recalibrate to separate tool-output bound** | Tool output is structured data (JSON, listings) where head+tail are most informative. 8 KB is too small for tool output; 30k chars is a reasonable separate bound. |
| Cache blocks | **4 lines** per block | **none** | **inapplicable** (for now) | Our `streamSimple` doesn't expose `cache_control`. Spec's cache marking is an Anthropic API feature. Potential optimization, not a constant. |
| Log split | **by day** | **single file** | **inapplicable** | Our retention is 5000 records / 7 days; a single append-only file is fine. Spec's day-split is for years-long chats. |
| Compactor model | **Haiku @ xhigh** | **@smol** | **transfer unchanged** | Both are cheap models for background compaction. The principle is the same; the specific model is deployment-dependent. |

## Detailed analysis

### 1. Node size: 512 vs 288

**Our code:** `plugin/src/store/tree-store.ts:15`
```ts
export const TREE_REC = 288; // §5.2
```

**Our justification (PLAN §5.2):** "Tree node size (**TREE_REC**) | **288 bytes** | OptMem `TREE_REC=288`"

We inherited 288 from OptMem without testing. The spec (§2) argues:

> Why 512: at 128 the model couldn't write useful lines. 512 bytes is a dense paragraph.

288 bytes ≈ 36 words ≈ 2–3 sentences. That is a telegram, not a paragraph. The spec explicitly tested smaller sizes and found them inadequate. Their 512 is a reasoned floor; our 288 is an untested inheritance.

**Verdict: recalibrate to 512.** The spec's argument is decisive. A 288-byte summary of a room message loses too much context — agent names, file paths, decisions. 512 bytes (~70 words) is the minimum for a useful summary line.

### 2. View sawtooth: 64–128 KB vs 96 lines

**Our code:** `plugin/src/store/tree-store.ts:17`
```ts
export const COVER_BUDGET_LINES = 96; // §5.2 (OptMem WAKE_LINES)
```

**Our cover():** `plugin/src/store/tree-store.ts:163-190` — uses a line budget (96 blocks), not byte-based.

The spec (§3.2) uses a byte-based sawtooth:

> Once the view passes 128,000 bytes, one batch merges the most due pairs until it is at most 64,000 bytes.

Byte-based is more principled: it directly bounds the token cost of the view. Our line budget doesn't account for variable line lengths — 96 lines × 288 bytes = 27,648 bytes max, but actual usage varies. The spec's sawtooth (grow to 128 KB, batch-merge to 64 KB) is also cache-friendly: batch merges rewrite ~2 lines/message vs ~53 for per-message merges.

**Verdict: recalibrate to byte-based sawtooth (64–128 KB).** The spec's approach directly bounds token cost and is cache-optimal. Our line budget is a proxy that doesn't account for variable line lengths.

### 3. Compaction view: 16–32 KB vs none

**Our compactor:** `plugin/src/store/compactor.ts:121-149` — `summarizeBlock()` reads raw records or children's summaries directly. No separate "compaction view."

The spec (§4) gives compactions a separate, smaller view (16–32 KB) merged from the main view, so the compaction model has context to resolve references like "do it" or "that file."

Our compactor doesn't need this: it builds nodes bottom-up from raw data or children's summaries. The compaction call's input is the block's source text, not a view of the whole chat.

**Verdict: inapplicable.** Our architecture doesn't have a "compaction view" concept. The spec's 16–32 KB view is for a system where compaction calls need whole-chat context; ours gets context from the block's source directly.

### 4. Concurrency JOBS=8: transfer unchanged

**Our code:** `plugin/src/store/compactor.ts:9`
```ts
export const COMPACT_JOBS = 8; // §5.2 [invented]
```

**Our justification (PLAN §5.2):** "F21-W5 saturation analysis — 8 parallel streams saturate LLM throughput"

F21-W5 §Q5 (`findings/F21-W5.md:47-53`) already analyzed this:

> **The right concurrency depends on message rate, not agent count.** The formula is: `JOBS ≥ message_rate × avg_compactor_latency`. At 1 post/2s per agent with 1s latency, JOBS ≥ 0.5 × agent_count. For 10 agents: JOBS ≥ 5. For 100 agents: JOBS ≥ 50.

The new spec's JOBS=8 is for a single writer on a single chat. It doesn't change the multi-agent analysis. Our room's message rate is bounded by srTCM (1 post/2s per agent, `config.ts:32`). With 10 agents at max rate: 5 posts/s → ~10 compactor calls/s at 1–2s latency. JOBS=8 is borderline but adequate because:

1. The tree is **advisory** (T3, `PLAN:1004`) — agents never block on compaction.
2. The raw tail (last 50 messages) is the fallback.
3. The daily rate cap (`compactionCallsPerDay = 20000`) bounds total spend.

**Verdict: transfer unchanged (8).** The spec doesn't add new information. JOBS=8 is adequate for ≤10 agents; for 100 agents it would need to scale, but that's a future concern.

### 5. Compaction retries: 5 vs 3

**Our code:** `plugin/src/store/compactor.ts:12`
```ts
export const COMPACT_MAX_RETRIES = 3; // §3.6 [invented]
```

**Spec (§4):**

> Try at most 5 times, and keep the shortest line. A few bytes over is fine, because the view measures real sizes.

The spec's strategy is strictly better: 5 attempts with "keep the shortest" gives the model more chances to produce a good summary, and keeping the shortest avoids the "a few bytes over" problem. Our 3 was `[invented]` without strong justification.

**Verdict: recalibrate to 5.** The spec's 5-with-keep-shortest is a better strategy.

### 6. Message-node trigger: < 8 lines unbuilt vs none

**Our code:** `plugin/src/store/compactor.ts:178-186` — `runJobs()` processes `tree.pending(COMPACT_JOBS)` smallest-first. No per-message trigger.

**Spec (§4):**

> A message's node starts once fewer than 8 lines before it are still unbuilt.

This trigger ensures that a message's node is built eagerly, so the view never has a gap. Our compactor builds nodes in FIFO order (smallest first) and doesn't need this trigger — the tree is advisory and readers fall back to the raw log.

**Verdict: inapplicable.** Our architecture doesn't use per-message triggers. The spec's trigger is for a system that builds nodes eagerly per message; ours is a background job that processes the pending queue.

### 7. Tool output clip: 30,000 chars vs 8,192 bytes

**Our code:** `plugin/src/store/config.ts:36`
```ts
maxBodyBytes: 8192,
```

**Our enforcement:** `plugin/src/attention/governor.ts:279-287` — `truncateOversized()` truncates to `tokenBudget * 4` chars (head only, no tail).

**Spec (§1):**

> A tool's output is clipped to its head and tail, 30,000 characters in all.

Tool output is qualitatively different from chat messages:
- It's structured data (JSON, file listings, command output) where the head and tail are the most informative parts.
- It's often long (a `ls -la` of a large directory, a JSON API response).
- Losing the middle is usually fine; losing the head (which contains the command/context) or the tail (which contains the result) is not.

Our 8 KB cap is too small for tool output. A 30k char bound (~7.5k tokens) for tool output vs 8 KB for chat messages is reasonable.

**Verdict: recalibrate to a separate tool-output bound (30k chars head+tail).** Tool output needs a larger, head+tail clip. Chat messages stay at 8 KB.

### 8. Cache blocks: 4 lines vs none

**Our code:** No cache marking anywhere. `streamSimple` from `@oh-my-pi/pi-ai` doesn't expose `cache_control`. Grep for `cache_control|ephemeral|cacheControl` returns no matches.

**Spec (§3.3):**

> The view goes in blocks of 4 lines. One cache mark sits on the last whole block and one on the request's end.

This is an Anthropic API feature (`cache_control: { type: "ephemeral" }`). Our `streamSimple` abstraction doesn't expose it.

**Verdict: inapplicable (for now).** Cache marking is a potential optimization, not a constant to calibrate. It would require dropping `streamSimple` for direct Anthropic API calls with `cache_control` blocks. This is a v2 concern.

### 9. Log split: by day vs single file

**Our code:** Single JSONL file per room (`<root>/room/<roomId>.jsonl`), never truncated (`PLAN:789`).

**Spec (§1):**

> Files split by day only to stay small.

Our retention is 5000 records or 7 days (`config.ts:37-38`). A single file is fine for this scale. The spec's day-based splitting is for a system that runs for years.

**Verdict: inapplicable.** Our retention bound makes day-splitting unnecessary.

### 10. Compactor model: Haiku @ xhigh vs @smol

**Our code:** `plugin/src/store/compactor.ts:2` — `import { streamSimple } from "@oh-my-pi/pi-ai"`, model resolved via `ctx.models.resolve("@smol")`.

**Spec (§4):**

> **The model:** a cheap one. UniiChat uses Claude Haiku at xhigh effort.

Both are cheap models for background compaction. The principle is the same: use a cheap model for compaction, a better model for turns. The specific model is deployment-dependent.

**Verdict: transfer unchanged.** `@smol` is our cheap model. The spec's "Haiku at xhigh" is their choice.

## Summary

| Verdict | Count | Constants |
|---|---|---|
| **recalibrate** | 4 | Node size (512), view sawtooth (64–128 KB), retries (5), tool output clip (30k) |
| **transfer unchanged** | 2 | JOBS (8), compactor model (@smol) |
| **inapplicable** | 4 | Compaction view, message-node trigger, cache blocks, log split |

The spec's most decisive contribution is the **node size argument**: 288 bytes is too short for a useful summary. The spec tested smaller sizes and found them inadequate; 512 bytes is a reasoned floor. We should recalibrate.

The second most useful contribution is the **byte-based sawtooth**: it directly bounds token cost and is cache-friendly, unlike our line budget.

The **tool output clip** is a new concept we should adopt: tool output is qualitatively different from chat messages and deserves a separate, larger bound.

The **retry increase** (3 → 5) is a minor improvement we should adopt.

The rest either don't apply to our architecture or are already correct.
