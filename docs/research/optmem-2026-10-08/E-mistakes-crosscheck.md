# E — Mistakes cross-check: OptChat §7 vs our implementation

**Date:** 2026-10-08
**Source spec:** `docs/research/optmem-2026-10-08/optchat-2026-10-08.md` §7 (13 mistakes) + §4 (compactions)
**Implementation:** `plugin/src/store/tree-store.ts`, `plugin/src/store/compactor.ts`, `plugin/src/onboarding/hook.ts`, `plugin/src/onboarding/digest.ts`, `plugin/src/store/log.ts`, `plugin/src/attention/delivery.ts`, `plugin/src/tools/room.ts`

## Summary table

| # | Mistake | Make it? | Evidence (file:line) | Fix |
|---|---------|----------|----------------------|-----|
| 1 | Age from first message | **YES** | `tree-store.ts:206` — `size > alpha * (T - lo)` uses `lo` (first msg) | Change to `T - hi` (age from last message) per spec §3.2 |
| 2 | Merging at every message | No | `compactor.ts:11` — `COMPACT_INTERVAL_MS = 5_000` (timer, not per-message) | Already batched by time; spec's 128→64 KB byte-trigger is a refinement |
| 3 | Rebuilding the view | **YES** | `room.ts:679` — `tree.cover(...)` called fresh each `room tree` call; no `view.json` | Persist tiling to `view.json`; load at start; update incrementally |
| 4 | K lines per level | No | `tree-store.ts:17` — `COVER_BUDGET_LINES = 96` is total budget, not per-level | Already correct |
| 5 | Whole messages in view | **YES** | `room.ts:682` — `raw = size <= RAW_MAX` shows raw singletons; spec: "never a whole message" | Force minimum block size ≥ 2 in `cover`, or always show summaries |
| 6 | Compaction with own system prompt | **YES** | `compactor.ts:19-22` — `UNTRUSTED_PROMPT_PREFIX` is a custom system prompt | Use the same system prompt as turns; only the task differs |
| 7 | Trusting model to count bytes | **YES** | `compactor.ts:140` — prompt says "≤288 bytes" but no ruler, no cut, no length retry | Add ruler (dashes), add length-check + cut retry loop |
| 8 | Lines under 512 bytes | **YES** | `tree-store.ts:15` — `TREE_REC = 288`; spec says 512 | Increase `TREE_REC` to 512 |
| 9 | Logging thoughts | No | `digest.ts:29-43` — `recordLine` has no "thought" kind | Already correct |
| 10 | Dates/state in system prompt | **YES** | `digest.ts:67-75` — digest contains roster, lag, caps, uptime in system prompt | Move digest to user-turn injection or tool result, not system prompt |
| 11 | Carrying conversation across turns | No | Room is stateless per turn; no conversation state carried | Already correct |
| 12 | Two writers / no flush | **PARTIAL** | `log.ts:27-36` — `appendLine` uses `O_APPEND` (atomic) but no `fsync`; multi-writer by design | Add `fsync` after each append; document single-process assumption |
| 13 | Scanning tree for work | **YES** | `tree-store.ts:148-161` — `pending()` iterates all levels/blocks every call | Maintain a ready-queue; enqueue nodes as their dependencies complete |

## Prioritized real findings (most severe first)

### 1. **#10 — State in the system prompt** (severity: high)
**Evidence:** `digest.ts:67-75` injects roster, lag, caps, and uptime into the system prompt via `hook.ts:46` (`buildPromptBlock(buildDigest(store, viewer))`).

The spec §3.3 is explicit: "Tools and system prompt never change: no dates, no state. They are cached across all calls." Our digest changes every turn (roster shifts, lag changes, uptime increments), which **invalidates the prompt cache** on every turn. This is the most expensive mistake — it destroys the cache benefit the entire design is built on.

**Fix:** Move the digest out of the system prompt. Inject it as a user-turn prefix or a tool result. The system prompt should contain only the static routing rule.

### 2. **#3 — Rebuilding the view** (severity: high)
**Evidence:** `room.ts:679` — `const tiling = tree.cover(store.records.length, COVER_BUDGET_LINES)` is called every time the `room tree` tool runs. There is no `view.json` persistence (grep for `view.json|saveView|loadView` returns nothing).

The spec §3.2: "Save the view to `view.json` and load it at start. Never rebuild it from the log: the rebuilt view differs from the live one, and every cache entry dies."

**Fix:** Persist the tiling to `view.json`. Load it at startup. Update incrementally as new nodes are built (append new lines, merge when passing the byte threshold).

### 3. **#6 — Compaction with its own system prompt** (severity: high)
**Evidence:** `compactor.ts:19-22` — `UNTRUSTED_PROMPT_PREFIX` is a custom system prompt prepended to every compaction call.

The spec §4: "A compaction without context, or with its own system prompt (loses the turns' cache)." The compaction should use the **same system prompt and tools** as turns, so it reads them from the turns' cache entry.

**Fix:** Remove `UNTRUSTED_PROMPT_PREFIX` from the compaction prompt. Use the turn's system prompt + tools, with only the compaction task differing.

### 4. **#1 — Age from first message** (severity: medium)
**Evidence:** `tree-store.ts:206` — `size > alpha * (T - lo)` measures age from `lo` (the block's first message).

The spec §3.2: "Measuring from a pair's **first** message, `(T - first) / 2^l`, is wrong. Near ties it merges old pairs and rewrites old lines that push keeps."

**Fix:** Change `T - lo` to `T - hi` (age from the block's last message) in `coverAt`.

### 5. **#13 — Scanning the tree for work** (severity: medium)
**Evidence:** `tree-store.ts:148-161` — `pending()` iterates every level and every block position on each call.

The spec §4: "Keep the nodes that are ready to build in queues. Never scan the tree for work: over a long chat, that is O(N²)."

**Fix:** Maintain a persistent ready-queue. When a node is built, enqueue its parent if both children are now built. When a new message is appended, enqueue its singleton.

### 6. **#5 — Whole messages in the view** (severity: medium)
**Evidence:** `room.ts:682` — `const raw = size <= RAW_MAX` causes singletons (size-1 blocks) to be shown raw. The spec §3: "The view holds only summaries, never a whole message, not even the last one."

**Fix:** Force a minimum block size of 2 in `cover`, or always render summaries (falling back to raw only when the summary is unbuilt).

### 7. **#7 — Trusting the model to count bytes** (severity: medium)
**Evidence:** `compactor.ts:140` — the prompt says "≤288 bytes" but there is no ruler, no cut, no length-check retry.

The spec §4: "Models can't count bytes, so the ruler shows the length. If the reply is over 512 bytes, send this in the same conversation: 'Too long: your line is {N} bytes...'"

**Fix:** Add a ruler of dashes to the prompt. After the response, check byte length; if over limit, send the cut message and retry (up to 5 times, keeping the shortest).

### 8. **#8 — Lines under 512 bytes** (severity: low)
**Evidence:** `tree-store.ts:15` — `TREE_REC = 288`; spec §2 says 512.

**Fix:** Increase `TREE_REC` to 512. This doubles disk usage but matches the spec's measured sweet spot.

### 9. **#12 — Writes without a flush** (severity: low, but real)
**Evidence:** `log.ts:27-36` — `appendLine` uses `fs.writeSync` with `O_APPEND` (atomic per write) but never calls `fsync`.

The spec §1: "Only append, and flush each write."

The multi-writer concern is mitigated by the documented single-process assumption (`PLAN-build.md` §1.3 assumption 5: "One process per `local://` root — no cross-process writers"). But the missing `fsync` means a crash can lose the last write.

**Fix:** Add `fs.fsyncSync(fd)` after each `appendLine` call, or at minimum before closing the fd.

## Non-mistakes (confirmed clean)

- **#2** — Compactor runs on a 5-second timer, not per-message. The spec's 128→64 KB byte-trigger is a refinement we haven't implemented, but we don't merge at every message.
- **#4** — Budget is 96 total lines, not K per level.
- **#9** — No "thought" kind exists in `recordLine`.
- **#11** — Room is stateless per turn; no conversation carries across.
