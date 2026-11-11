# Plan 029: Settle the deferred storage costs (digest cache, append batching decision, replay bound, tree fds)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/onboarding/digest.ts plugin/src/store/log.ts plugin/src/store/room-store.ts plugin/src/store/tree-store.ts plugin/tests/onboarding.test.ts plugin/tests/store.test.ts plugin/tests/tree.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches durability-adjacent paths — measure, don't guess; I5 is non-negotiable)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

Four deferred costs share one theme — work that scales with log or turn count instead of with change. The digest rebuilds fully every turn (roster sorts, backlog escaping, up to ~90 full re-renders in the truncation loop). Every T0 fan-out appends a `delivered` marker through the fsync path, so one mention to 32 recipients pays 33 fsyncs. Replay reads the entire JSONL (never truncated per deliberate K19) at open, so open cost grows with lifetime bytes. `getNode` opens/reads/closes a level file per call, ~96 open-close pairs per tree op. Each needs a decision with measurement, and the fsync one needs an explicit keep-or-change verdict since I5 durability is settled.

## Current state

- `plugin/src/onboarding/digest.ts:69-173` — `buildDigest`: roster double-sort + per-member cursor/lag, claims sort, 50-line backlog with `safeRoomText` escapes, then `while (estimateTokens(out) > budget)` re-render loop (up to ~90 iterations).
- `plugin/src/store/log.ts:336-350` — `appendLine`: write loop + `fsyncSync` per record; `recordDelivery` appends a `delivered` marker per T0 through the same path.
- `plugin/src/store/log.ts:352-396` — `readAllLines` (fstat + full read + split) + `replay` (JSON.parse every line at open).
- `plugin/src/store/tree-store.ts:373-395` — `getNode` open/read/close per call; tree op maps up to `COVER_BUDGET_LINES` blocks through it.
- `plugin/src/store/room-store.ts:359-440` — retention prunes the projection; tree positions are dense indices, so `invalidateTree` rm-rfs on every prune.
- Conventions: `bun:test`, no mocks; I5 (fsync per append) and K19 (JSONL never truncated) are settled — this plan optimizes around them, never weakens them.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/onboarding.test.ts tests/store.test.ts tests/tree.test.ts tests/attention.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/onboarding/digest.ts` (truncation loop + optional watermark cache)
- `plugin/src/store/log.ts` (replay bound + delivered-marker handling ONLY if the verdict keeps I5 intact)
- `plugin/src/store/tree-store.ts` (per-op fd reuse in `tree`/`zoom` paths; retention/tree-offset interaction as investigate-first)
- `plugin/tests/onboarding.test.ts`, `plugin/tests/store.test.ts`, `plugin/tests/tree.test.ts` (new tests)

**Out of scope** (do NOT touch):
- Weakening I5 (every user-record append stays fsync-durable) or K19 (the JSONL stays append-only).
- Summary quality, truncation order, merge floors (all pinned by existing tests — keep byte-identical).
- Compactor scheduling/rate caps.

## Git workflow

- Branch: `advisor/029-deferred-storage-costs`
- Commit per step; conventional commits, e.g. `perf(digest): linearize truncation without re-render`.
- Do NOT push or open a PR.

## Steps

### Step 1: Linearize digest truncation (no re-render loop)

Precompute per-section line sizes (measure each roster/claim/backlog line once with `estimateTokens`), then drop from the tail in bulk (backlog oldest-first, then shortest-TTL claims, then idle roster — the pinned §5.4 U8 order) and render ONCE. Assert byte-identical output vs the loop version on the existing truncation tests before deleting the loop.

**Verify**: `cd plugin && bun test tests/onboarding.test.ts` → all pass, truncation-order tests unchanged.

### Step 2: Watermark the per-turn digest (only if unchanged rooms re-render)

If `store.seq`, claims, roster, and caps are unchanged since the last build for the same viewer, return the cached render. Key the cache per (root, viewer, watermark) and invalidate on any append/claim/release/member change. This is an optimization — correctness first: any staleness fails the suite.

**Verify**: `cd plugin && bun test tests/onboarding.test.ts` → all pass; a new test asserts two consecutive builds on an unchanged room return identical strings with the second served from cache (observable via a counter the test injects, or simply assert equality + no recompute — pick the seam the code allows).

### Step 3: Verdict on delivered-marker fsyncs (measure, then decide)

Measure: count fsync syscalls per T0 fan-out (e.g. strace-style counting via a test seam, or reason from `appendLine` call sites — `recordDelivery` per T0 + the post). Options: (a) keep per-record fsync (I5 covers markers too) and record the measured cost as accepted; (b) batch markers per pass with ONE fsync while keeping every user record fsync'd, proving crash-safety of the batch in a test. Do NOT weaken user-record durability under any option. Default to (a) unless (b) is provably safe — "not worth doing" with numbers is a valid verdict.

**Verify**: decision recorded in the plan file + tests; `bun test tests/attention.test.ts` green either way.

### Step 4: Bound replay cost without truncating history

Replay from a bounded tail + leading `gap` instead of the whole file: read the last N bytes/lines sufficient to cover `logMaxRecords` plus margin, parse only those, and prepend a `gap{reason:"retention"}`-style marker for the skipped prefix when the file is longer. The JSONL stays append-only (K19 intact); only the in-memory projection is bounded. Fall back to full replay when the file is small.

**Verify**: `cd plugin && bun test tests/store.test.ts` → all pass; new test with a fixture log longer than the bound asserts the projection holds the tail + a gap and open succeeds without reading the whole file (assert via a read-size seam or record count, not wall-clock).

### Step 5: Reuse tree level fds per op (investigate-first)

Measure `getNode` open/close pairs per `tree`/`zoom` call. If material: open each level once per op and batch reads (or cache read-only fds with close-on-invalidate). If the win is noise at real op sizes, record "not worth doing" with the numbers and skip. The retention/tree-offset interaction (dense indices vs prune) is investigate-only in this plan: document whether offset translation is feasible without risking summary misalignment; do NOT change invalidation behavior here.

**Verify**: `cd plugin && bun test tests/tree.test.ts` → all pass; decision + numbers recorded.

## Test plan

- Digest: truncation-order tests stay green (byte-identical); new cache test (Step 2).
- Log: new bounded-replay test (Step 4); fsync verdict recorded (Step 3).
- Tree: fd-reuse decision with numbers; existing tree tests green.
- Structural patterns: existing onboarding/store/tree tests (temp roots, real filesystem).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] Digest output byte-identical on all existing truncation tests
- [ ] New cache + bounded-replay tests exist and pass
- [ ] fsync + tree-fd verdicts recorded with numbers (done or explicitly not-worth-doing)
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] No files outside the in-scope list are modified
- [ ] I5 and K19 intact (user-record fsync per append; JSONL never truncated)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- Any digest byte changes vs the loop version — behavior change is a STOP.
- The bounded-replay tail bound interacts with retention gaps or cursor resume — report the interaction instead of guessing.
- The fsync batching option cannot be proven crash-safe — take verdict (a) and move on.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The digest cache key must include everything the render reads (seq, claims, roster, caps, budget); a new digest input must join the key.
- Replay bound and `logMaxRecords` must stay consistent: the bound covers the cap plus margin, or retention and open disagree about the head.
- Tree fd handling must close on `invalidateTree` — leaked read fds across a prune are worse than the open/close pairs.
