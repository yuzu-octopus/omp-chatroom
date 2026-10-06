# Hierarchical compression for the room log — two-region design

**Answer:** Build the two-region store. Raw tail (last R messages) read verbatim by all agents; cold tree (binary summary tree over `[0, N-R)`) read as a bounded view by late joiners and on `zoom`. The tree is a rebuildable cache, never on the critical path. Compaction runs in a background job using `@smol` via `streamSimple` (deep import, not public API). Single-writer is incidental to the concept but the one-node-per-range invariant is mandatory — copy OptMem's ordered append + dense-prefix CAS. No system anywhere compresses a shared multi-agent log hierarchically; this is new.

**Confidence:** High on the design (OptMem already implements two-region + multi-writer). Medium on the `@smol` invocation path (deep import, not public API). Low on cost calibration (no measurement exists).

---

## Why

### The design the user described is already half-built

OptMem's `cover(T, budget)` is a two-region tiling: raw singletons near T, compressed blocks far from T, all-raw when `T <= budget` (`/tmp/OptMem/memo:105-131`). `wake` renders it directly — size-1 blocks print raw via `log_get`, larger blocks print summaries via `tree_get` (`memo:604-628`). This is exactly "raw hot tail + compressed cold tail" in the existing tool. [F20.1–F20.5]

The two-region design inverts round 1's objection. Round 1 rejected "tree as the room log" because OptChat's view never holds a whole message (gist §5.1). The two-region design keeps raw messages in the hot tail — agents read raw normally. The tree only compresses the cold backlog. A late joiner gets a bounded view instead of a `gap` hole. [F21.72–F21.74]

### Who compacts

**Recommendation: a background job in the main session, using `@smol`.**

OptMem is already multi-writer: per-operation `flock` + `tree_put`'s dense-prefix length check (`count != lo//size → False`) serialises node identity, not the writer (`memo:302-369`). 16-process concurrent test passes (`test.py:450-466`). [F20.19–F20.24]

But OptMem's compaction is lazy and blocking-on-read: `wake` refuses with exit 1 when a block is unbuilt (`memo:609-622`). OptChat's is background with `settle()` blocking the turn loop (gist §6). For a room, neither is right: agents must not block on compaction, and the compactor must not be the agent itself (subagent rule: cannot judge what is already known). [F20.28–F20.30]

The right shape: a `ctx.setInterval` job in the main session that calls `streamSimple` with `@smol` to build pending nodes. Agents read raw tail without waiting. Late joiners read the cold tree; if a node is unbuilt, they get a `gap` record + raw-log fallback. [F21.74]

**Serialisation:** copy OptMem's ordered append. Each tree level is a dense prefix; `tree_put` refuses unless `count == lo//size`. This is a CAS on a dense prefix — no lock needed in-process (single-threaded JS). [F20.22–F20.24]

### Boundary rule

**Raw tail = last R messages (R = 50, matching PLAN §3.5 join cursor). Cold tree = `[0, N-R)`.**

The boundary is a sliding window recomputed on every read. OptMem's `cover(T, WAKE_LINES)` recomputes the tiling from scratch each call (`memo:105-131`). The raw tail converges to ~16 messages at large T with budget 96 (computed from `cover()` re-implementation). [F21.7–F21.9]

For the room: R = 50 raw messages (one screen, matching join cursor). The cold tree covers `[0, N-R)`. A late joiner reads: raw tail (50 messages) + cold tree tiled at B lines (B = 96, matching OptMem's WAKE_LINES). Total view = R + min(B, N-R) lines, constant once N-R ≥ B. [F21.72]

### Cursor mapping

**Cursor = log sequence number (unchanged from PLAN §3.5).** The cursor maps onto a tree node positionally: node `[lo,hi)` contains seq S iff `lo <= S < hi`. The cursor must NOT be a tree node ID because the tree is derived and rebuildable while the cursor must survive tree rebuilds. [F21.24]

When a member's cursor is inside a compressed node: the agent can `zoom` to descend, or read raw from the log. The cursor is not forced forward — it stays at the log seq. The agent chooses to zoom or not. [F21.24, F21.41]

### `zoom(lo,hi)` semantics

**Signature: `zoom(lo: number, hi: number)` where `[lo,hi)` is an aligned power-of-two range.**

OptMem: `memo zoom <lo>-<hi>` — inclusive both ends, parsed to exclusive, validated (`n >= 2`, power of two, `lo % n == 0`). Opens exactly one level: returns two halves, each raw (if size 1) or summary (if larger). Docstring: "the navigating intelligence is the agent's; the tool only reads." (`memo:762-782`) [F20.15, F21.33–F21.36]

OptChat: `zoom(id, n)` — `id` = first message, `n` = span = `2^l`. Returns `n == 1` → whole message; `n > 1` → two children lines. (gist §7.1) [F21.37–F21.39]

**Recommendation: `zoom(lo, hi)` with exclusive range.** Returns two children (one level). Each child is raw (if size 1) or a summary (if larger). The agent calls `zoom` repeatedly to descend. `zoom` is a pure read — does not modify the view or tree. [F21.41]

**Addressing:** `lo` = first seq in the node, `hi` = last seq + 1 (exclusive). Both must satisfy: `hi - lo` is a power of two, `lo % (hi - lo) == 0`. This matches OptMem's `block_id` validation. [F21.33]

### Invalidation

**A node can be wrong (LLM output is non-deterministic).** OptMem `forget <lo>-<hi>` → `tree_drop`: truncates every level file from `lo//size` upward, dropping the target and all ancestors. The log is never touched. (`memo:372-389`) [F20.16–F20.18]

**Neither OptMem nor OptChat is content-addressed.** OptMem: "position IS identity" (offset in fixed-width file). OptChat: node named `(l,i)` / `id+n`. No hash of children. [F21.49]

**LLM summarisation is non-deterministic** (OpenAI: "not guaranteed" even with fixed seed). Two honest compactors given identical children produce different text and different hashes. A hash difference carries no signal about which is right. [F20.52–F20.53]

**Recommendation: do NOT content-address the tree.** Instead: (1) single-writer compaction (one background job) eliminates divergence by construction; (2) `forget` + rebuild handles bad nodes; (3) the raw log stays authoritative — the tree is a cache. If divergence is detected (e.g. two processes somehow wrote), rebuild the tree from the log. [F21.55]

### Cost budget

**OptMem: one LLM call per block (nap), performed by the agent itself.** Total blocks over N memories ≤ 2N. Input ≤ 16 raw memories or 2 summaries; output ≤ 280 bytes. [F20.57]

**OptChat: ~2 compactor calls per message amortised** (one compress + one merge). Each call carries ~64k tokens of cached `<chat>` context; output ≤ 512 bytes. JOBS=8 concurrent. Free nodes cost nothing. [F21.59–F21.61]

**No max-spend cap in any of the three systems** (OptMem, OptChat, omp). [F21.64]

**Recommendation:**
- Compaction model: `@smol` (fast/cheap). Precedent: omp routes memory/tiny summarisation to smol (`model-resolver.ts:1165`, `DEFAULT_PREWALK_TARGET = "@smol"`).
- Concurrency: JOBS = 4 (conservative; room has fewer messages than OptChat's single chat).
- Batch: one node per call, no batching (each node is a separate LLM call).
- Max spend: cap total compaction calls per day (e.g. 1000 calls/day). When cap hit, compaction pauses until next day. This is a new invariant not in any prior system.
- When compaction lags: agents read raw tail without waiting. Late joiners get `gap` + raw-log fallback. [F21.74]

**Invocation path:** `ctx.models.resolve("@smol")` returns a `Model<Api>` (`model-api.ts:31-35`). But `runEphemeralTurn` uses `this.model` (session model), NOT a chosen model (`agent-session.ts:10426`). The direct path is `streamSimple` from `@oh-my-pi/pi-ai` (deep import, not public API). Signature: `streamSimple(model, context, options)`. This is the recommended path — it is what `bench-cli.ts` and `dry-balance-cli.ts` use. [F20, Main requirement 2]

**Risk:** `streamSimple` is a deep import (`@oh-my-pi/pi-ai`), not public API. If it changes, the plugin breaks. Mitigation: wrap in a try/catch; fall back to `runEphemeralTurn` with the session model (slower but works).

### Invariants

1. **Tree rebuildable from log.** OptMem: "The tree is a cache in principle (rebuildable from the log)" (gist §2). `forget` + `nap` rebuilds. [F21.67]
2. **Raw log stays authoritative.** "Never edit or delete anything in these files. The log is history." (gist §2) [F21.68]
3. **No agent blocked on compaction.** Raw tail is always readable. Cold tree may have unbuilt nodes → `gap` + raw-log fallback. [F21.74]
4. **Gap semantics with a tree present.** A `gap` record `{kind:"gap", skipped:N, reason:"retention"}` preserves the fact of the hole. A tree node whose source range was dropped is invalidated and rebuilt from the remaining log. [F21.69]
5. **One node per range.** The tree is a dense prefix per level. `tree_put` refuses unless `count == lo//size`. This is the serialisation mechanism. [F20.22]
6. **Max spend cap.** Compaction calls are bounded per day. When cap hit, compaction pauses. [F21.64, recommendation]

### Does any multi-agent system already do this?

**No.** Across AutoGen, LangGraph, CrewAI, CAMEL, MetaGPT, AgentVerse, ChatDev, Agno, Letta, OpenAI Swarm, Mem0, Zep/Graphiti, and MAS-memory papers (G-Memory, MIRIX, HMARS, DeALOG, DeLM, Agentsensus, AOI, Ensemble QSP, AutoWorldBuilder), every deployed shared log is either unbounded, bounded by flat rolling/one-shot summarisation, or compressed non-hierarchically. [F20.31]

The only hierarchical summary tree over a transcript found anywhere is OptChat/OptMem, and it is single-writer/single-agent/single-chat. [F20.46]

18 public OptChat replications exist, all single-user. [F20.47]

A 2026 survey of 89 LLM-agent papers on collective memory: "Convergence does not transfer without an equality relation over natural-language state; commutative merge fails separately because semantic summarization is order-dependent and non-associative." Global scope in 0/89 papers. [F20.49–F20.50]

**This is new.** The two-region design for a shared multi-agent log has no prior art.

---

## What would change this

- If `streamSimple` is unreachable from an extension (deep import blocked), the `@smol` path fails. Fallback: `runEphemeralTurn` with session model (slower, but works).
- If the room's message rate exceeds compaction throughput (e.g. 100 agents posting rapidly), the cold tree falls behind. Mitigation: `gap` + raw-log fallback. But if this is chronic, the tree provides no value — the raw log is the only readable region.
- If a hash-pinned tree were required (for audit), the non-determinism of LLM output makes it useless without a deterministic selection rule (which reintroduces single-writer semantics). [F20.53]

## Considered and rejected

- **Content-addressed tree (hash of children).** Rejected: LLM output is non-deterministic, so two honest compactors hash differently. A hash difference carries no signal about which is right. [F20.52–F20.53]
- **OptChat's `settle()` (block turn until all view parts built).** Rejected: agents must not block on compaction. The two-region design's raw tail is always readable. [F21.74]
- **OptMem's lazy nap (agent compacts on read).** Rejected: subagent rule (cannot judge what is already known) + agents should not pay compaction cost. [F20.28]
- **Single-writer process lock (OptChat's Unix socket).** Rejected: OptMem's per-operation flock + dense-prefix CAS is sufficient and simpler. [F20.19–F20.24]
- **CRDT merge of concurrent summaries.** Rejected: LLM summarisation is order-dependent and non-associative, so CRDT merge has no equality relation. [F20.49]
- **Variable-length nodes.** Rejected: fixed-width nodes (OptMem `TREE_REC=288`, OptChat 512 B) give O(1) lookup by seeking. Variable-length requires an index. [F20, F21]

---

## Findings

### 1. Store layout

```
room/
  <roomId>.jsonl          # raw log (append-only, authoritative)
  tree/
    2                     # level 1: blocks of 2 messages
    4                     # level 2: blocks of 4 messages
    8                     # level 3: blocks of 8 messages
    ...
```

Each tree file is a fixed-width dense prefix. Block `[lo,hi)` at level `size = hi-lo` lives at offset `(lo/size) * TREE_REC` in `tree/<size>`. [F20.1, F20.22]

**Node format:** fixed-width, `TREE_REC = 288` bytes (matching OptMem). Each record: `<summary text>`. Position IS identity. [F20.1]

**Merge shape:** 2 inputs → 1 output. Block `[lo,hi)` = merge of `[lo,mid)` and `[mid,hi)`. `RAW_MAX = 16`: blocks ≤ 16 compress from raw log; larger blocks compress from two halves' summaries. [F20.6–F20.7]

**Fixed-width vs variable-length:** fixed-width. O(1) lookup by seeking. No index file. Padding costs ~2x on disk, buys O(1) everywhere. [F20, F21]

### 2. Boundary rule

- **Raw tail:** last R = 50 messages. All agents read verbatim. No tree needed.
- **Cold tree:** covers `[0, N-R)`. Tiled at B = 96 lines (matching OptMem's WAKE_LINES).
- **Boundary movement:** recomputed on every read. As N grows, the raw tail stays at 50, the cold tree grows. [F21.7–F21.9]

### 3. Who compacts

- **Background job** in the main session, via `ctx.setInterval`.
- **Model:** `@smol` via `streamSimple` (deep import from `@oh-my-pi/pi-ai`).
- **Concurrency:** JOBS = 4.
- **Serialisation:** ordered append + dense-prefix CAS (copy OptMem's `tree_put`).
- **Max spend:** 1000 calls/day cap. [F20, F21, recommendation]

### 4. Tool surface

**One tool with ops** (matching PLAN §4.1's op-dispatched `room` tool). New ops:

```
room{op:"tree"}           # show current cover() tiling: which nodes, which seq ranges, raw vs compressed
room{op:"zoom", lo, hi}   # descend into a node's two children (or a range) down to raw messages
room{op:"read", since}    # extended: since=<seq> transparently descends a compressed node
room{op:"recall", pattern} # regex search over raw log (OptMem's recall <regex>)
```

**`room{op:"tree"}` params:** none. Returns: list of `{lo, hi, size, raw: boolean, summary?: string}`.

**`room{op:"zoom"}` params:** `lo: number, hi: number` (exclusive range, aligned power-of-two). Returns: two children `{lo, hi, size, raw: boolean, text: string}`.

**`room{op:"read"}` params:** `since?: number, limit?: number`. When `since` falls in a compressed node, returns the node's summary + a `zoom` hint. When `since` falls in the raw tail, returns raw messages.

**`room{op:"recall"}` params:** `pattern: string` (regex). Returns: matching raw log entries, newest first, capped at 100.

**Separate tools vs ops:** ops (one `room` tool). Rationale: BM25 discovery favours separate names for distinct intents, but the tree ops are all "inspect the tree" — one tool with ops is simpler and the ops are self-describing. [Main requirement 1]

### 5. Why this makes collaboration the path of least resistance

Today: IRC + `agent://` is hierarchical. Parent steers child. Child cannot easily collaborate with siblings. The room changes this:

- **Claim board** makes coordination explicit: claim/release with TTL. Agents see who is doing what. No duplicate work.
- **Wait tools** let agents block on coordination instead of polling. `wait_for_claim`, `wait_for_message`, `wait_for_agent`.
- **Tree** makes the backlog readable: a late joiner gets a bounded view, not a hole. `zoom` descends to raw. `recall` searches.
- **Two-region** keeps raw messages in the hot tail: agents read raw normally, no `settle()` block.
- **@smol compaction** keeps cost cheap: the tree builds in the background, agents never pay.

The room makes collaboration easier to do correctly than the status quo: claim before work, release when done, wait instead of poll, read the backlog with `zoom`/`recall`. Each feature removes a friction that today pushes agents toward hierarchical steering.

---

## Open questions

- **No cost measurement for OptMem/OptChat with real LLMs.** "~2 calls per message" is a spec figure. Free nodes make the true count lower and unquantified. [F21, F20]
- **No multi-agent OptMem/OptChat testing.** Both are single-writer designs; a shared-room summary tree is untested anywhere. [F20, F21]
- **No formula for JOBS from message rate.** `JOBS >= rate × latency` is uncalibrated. [F21.71]
- **Gap-record ↔ cold-tree interaction is inferred, not specified.** PLAN says append a `gap` record but not what happens to cold nodes whose source range was dropped. [F21.69]
- **No semantic validation of summaries anywhere.** Content-addressing would detect change, not quality. [F21.51]
- **`streamSimple` is a deep import, not public API.** If it changes, the plugin breaks. Mitigation: try/catch + fallback to `runEphemeralTurn`. [Main requirement 2]

---

## Sources

- `/tmp/OptMem/memo` (859 lines) — OptMem source, read directly. `cover()` at :82-131, `wake` at :584-651, `nap` at :463-494, `zoom` at :762-782, `forget` at :718-728, `tree_put` at :353-369, `tree_drop` at :372-389, `locked` at :302-332, `pending` at :437-449, `RAW_MAX` at :65, subagent rule at :536-541.
- `/tmp/OptMem/README.md` — OptMem README, read directly.
- `/tmp/OptMem/test.py` — OptMem test suite, read directly. 16-process concurrent test at :450-466, `tree_put` CAS test at :362-373.
- `https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449` — OptChat spec (798 lines), read directly. `fit()` at §5.2, `settle()` at §6, `zoom` at §7.1, JOBS=8 at §1, free nodes at §3, mistake list at §11.
- `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/model-api.ts` — `ctx.models.resolve("@smol")` at :31-35.
- `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/session/agent-session.ts:10425-10426` — `runEphemeralTurn` uses `this.model` (session model).
- `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/config/model-resolver.ts:1165` — `DEFAULT_PREWALK_TARGET = "@smol"`.
- `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/cli/bench-cli.ts:14` — `streamSimple` import from `@oh-my-pi/pi-ai`.
- `omp://compaction.md` — omp compaction stack.
- `findings/F20-multiwriter-compression.md` — merged findings from M1.
- `findings/F21-tree-boundary-cursors.md` — merged findings from M2.
- `findings/F7-bounded-context-compression.md` — OptMem/OptChat deep dive.
- `findings/F14-attention-backpressure.md` — Kafka/NATS/Redis cursor semantics.
- `PLAN-build.md` — current build plan, §3.5 cursors, §5.2 retention, §5.4 digest.
