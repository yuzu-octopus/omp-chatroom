# Plan 028: Single-pass delivery fan-out and board scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/tools/room.ts plugin/src/attention/governor.ts plugin/tests/attention.test.ts plugin/tests/room-tool.test.ts plugin/tests/e2e-room.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (delivery selection is load-bearing — keep admitted sets byte-identical)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

`deliverToTarget` walks `store.records` up to six times per recipient (`pending`, `t0Pending`, `t1Pending`, `owedOthers`, `gaps`, `owed`), each invoking `classify()` + `isMuted()` per record, plus `coalescePending` rescans and `selectT1` re-scans. With 5000 records and 32 recipients one post walks ~1M record-classifications. `buildBoard` and `topics`/`unreadCounts` each walk the whole log independently. A single forward pass that classifies once per record per viewer and partitions into buckets removes the repeated scans with identical admitted sets.

## Current state

- `plugin/src/tools/room.ts:596-683` — `deliverToTarget`: `pending` filter (classify + isMuted per record), then `t0Pending`, `t1Pending` (classify again + gap/mute checks), `owedOthers`, `gaps`, `owed` filters; `coalescePending` (governor) rescans; `selectT1` re-scans `t1Pending`.
- `plugin/src/tools/room.ts:403-440` — `buildBoard`: claims map, roster map, then a full-record scan for topics; `topics` op + `governor.ts unreadCounts` scan again.
- `plugin/src/attention/governor.ts:169-215` `selectT1`, `:220-241` `coalescePending`, `plugin/src/attention/tiers.ts` `classify`.
- Conventions: `bun:test`, no mocks; the suite is the oracle for I8/I9/I12 ordering; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/attention.test.ts tests/room-tool.test.ts tests/e2e-room.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/tools/room.ts` (`deliverToTarget`, `buildBoard`, topics-op scan only)
- `plugin/src/attention/governor.ts` (only if `selectT1`/`coalescePending` need a pre-classified input form — prefer thin overloads, no signature breaks for other callers)
- `plugin/tests/attention.test.ts` (equivalence tests)

**Out of scope** (do NOT touch):
- Tier rules, K/B caps, batching ceilings, gap-carry semantics — bucketing only, identical admitted sets.
- Cursor floors, GIVEN registry, delivery transports.
- Digest, tree, compactor, config.
- The fsync cadence (deliberate I5 — untouched).

## Git workflow

- Branch: `advisor/028-single-pass-delivery`
- Commit per step; conventional commits, e.g. `perf(delivery): single-pass recipient bucketing`.
- Do NOT push or open a PR.

## Steps

### Step 1: Bucket once per recipient in deliverToTarget

Replace the stacked filters with one forward pass over `store.records` (above the cursor) that computes `tier = classify(r, viewer)` and `muted = isMuted(...)` ONCE per record and partitions into the existing buckets (t0Pending, t1Pending, gaps, owedOthers, owed). Keep `coalescePending`'s inputs equivalent — if it needs its own scan, feed it the pre-partitioned T2 slice. Do not change the order records are admitted or delivered.

**Verify**: `cd plugin && bun test tests/attention.test.ts tests/room-tool.test.ts tests/e2e-room.test.ts` → all pass.

### Step 2: Add an admitted-set equivalence test

In `tests/attention.test.ts`: build a mixed backlog (T0 mentions, T1 topic posts, T2 chatter, gaps, muted topics, a GIVEN seq) and run the pass; assert the exact admitted seqs, the summary lines, and the cursor caps match the pre-change behavior. The strongest form: capture admitted sets before the refactor (run the test on the base commit, record the sets as literals in the test) and assert equality after. At minimum assert the pinned observable outcomes (which seqs delivered at which tier, cursor position, summary-line counts).

**Verify**: `cd plugin && bun test tests/attention.test.ts` → all pass; temporarily restore one duplicate filter → test still passes (behavior identical) but a scan-counter assertion (if added) fails — behavior, not counters, is the contract.

### Step 3: Single-pass board/topics/unread

Merge `buildBoard`'s topic scan with the topics op and `unreadCounts` so one pass serves all three (share the per-topic `{lastSeq, unread}` computation for the viewer). Keep `BoardResult` shape and caps byte-identical.

**Verify**: `cd plugin && bun test tests/room-tool.test.ts tests/room-command.test.ts` → all pass (board/topics assertions unchanged).

## Test plan

- Equivalence test in `tests/attention.test.ts` (Step 2) + existing board/topics tests as the regression net.
- Structural pattern: existing delivery-selection tests in `tests/attention.test.ts` (fake pi/ctx, temp roots).
- Verification: attention + room-tool + e2e suites green; full suite green at the end.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] Equivalence test exists and passes
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] No more than one full-log scan per recipient per pass in `deliverToTarget` (reviewer check via reading the function — the filters are gone, replaced by bucketing)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- Any admitted set, summary line, or cursor cap changes vs base — behavior change is a STOP, not a tweak; report the divergence.
- `selectT1`/`coalescePending` would need semantic changes to accept pre-classified input — stop and report the shape mismatch.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The bucketing must stay in lockstep with `classify`/`isMuted`: a new tier or mute rule needs a bucket here — reviewers should check this function on any attention-rule PR.
- Perf claims need measurement, not assertion: the plan's value is proven by the equivalence test + suite time, not by micro-benchmarks in the executor env.
