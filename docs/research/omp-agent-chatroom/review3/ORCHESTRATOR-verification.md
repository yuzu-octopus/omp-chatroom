# Orchestrator verification — round 3 (extended)

Adds to the earlier round-3 notes. All three below are **verified against installed source** and
are the highest-severity findings across all three rounds.

## V6 — The tool result contract is invalid · CRITICAL · CONFIRMED

**Plan text** (`PLAN-build.md` §4.5, verbatim):
> ```ts
> { outcome: "event" | "timeout" | "aborted", ... }
> ```
> **`outcome` is self-describing** (U8): the host does NOT read it — the agent discriminates on it.
> The host only sees the tool result as opaque data.

**Source** (`pi-agent-core/src/agent-loop.ts:540-562`), verbatim:
```ts
if (!Array.isArray(rawContent)) {
    return {
        result: {
            content: [{ type: "text", text: "Tool returned an invalid result: missing content array." }],
            details,
            isError: true,
        },
        malformed: true,
    };
}
```

**Consequence:** any `execute()` return without a `content` array is coerced to
`isError: true` with the text *"Tool returned an invalid result: missing content array."* Every
shape the plan specifies in §3.3, §4.1, §4.2–§4.5 — including successful ones — would reach the
model as an **error**. The plan's claim that the host sees the result "as opaque data" is false:
the host classifies on `content`, `details`, `isError`, `useless` before the model ever sees it.

**Fix:** every tool must return `{ content: [{type:"text", text}], details: {...}, isError?, useless? }`.
Put `outcome` and all structured payload **inside `details`**; put a human/model-readable summary
in `content`. Correct §4.5 and every tool's return shape, and fix the false sentence.

## V7 — Claim expiry has no producer · CRITICAL · CONFIRMED

Verified by grep: the plan defines exactly **two** `ctx.setInterval` jobs — the pruning job
(`:599`) and the compactor (`:540`). Neither sweeps claims. `reclaimIfStale` is declared
(`:485`) and the staleness rule stated (`:493`), but nothing invokes it on a timer, so:
- `release{reason:"expired"}` (`:374`) is **unreachable**;
- `wait_for_claim`'s "resolved on release/reclaim/expiry" (`:798`) has no expiry producer;
- a long-TTL claim can be squatted indefinitely — the board is deniable.

**Fix:** one refcounted `ctx.setInterval` sweep (5–10 s) in the main session that calls
`reclaimIfStale` over all claims, appends `release{reason:"expired"}`, promotes the oldest
waiter, and fires the T0 notice.

## V8 — Compaction budget makes the tree unbuildable · CRITICAL · CONFIRMED

Plan: `1000 calls/day` (`:349`, `:546`, `:876`); `JOBS=8` (`:542`, `:875`); retention
`logMaxRecords=5000` (`:250`).

Arithmetic: building the tree once over one retention window is ≈2N ≈ 10,000 calls. The cap
allows 1,000/day, so one window takes ~10 days — while the window itself turns over in
**16.7 min** at the documented rate limit (10 agents × 1 post/2 s → 5 posts/s → 5000 records).
The tree can never be built at the design's own advertised rate.

Two further confirmations:
- **Retention caps memory, not the file.** `:598-599` — "It caps the in-memory `records` array
  and appends a `gap` record on drop." The JSONL file is never truncated, so replay cost grows
  without bound (measured ~10.7 ms per 5000 records → seconds at ~10⁶ records).
- **No per-record body cap exists.** Grep for `maxBody`/`body cap` returns nothing, so
  `logMaxRecords` bounds record *count* while record *size* is unbounded.

**Fix:** scope the cap to the window (2N calls *once*), or raise it; state whether retention
truncates the file or only memory; add `maxBodyBytes` (default 8 KiB, `[calibrate]`).

## V9 — Scaffold symbol orphans · MAJOR · CONFIRMED

C2 verified: `bodyLines`, `MemberState`, `bumpCursor`, `cardTypeFor`, `escapeHarnessTags`, and
`Tier` are referenced by the plan but **assigned to no file in §2.1**. Also `tests/tree.test.ts`
is required by P1b but absent from §2.1's `tests/` block. The scaffold spec (C9) must assign
every one of these or the scaffold will not close.
