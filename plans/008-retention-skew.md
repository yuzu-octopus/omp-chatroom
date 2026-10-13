# Plan 008: Investigate whether retention skews `tree`/`zoom`/recall addressing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/room-store.ts plugin/src/store/tree-store.ts plugin/src/tools/room.ts`
> This is an investigate plan: read-only unless the investigation confirms a
> defect. If any in-scope file changed since this plan was written, re-verify
> the "Current state" facts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S (investigation) — M only if it confirms a defect and you proceed to fix
- **Risk**: LOW (read-only by default)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

Three addressing schemes meet in the cold-tree path and may disagree after
retention prunes the in-memory head: `tree` tiles `[0, n)` where
`n = store.records.length` (an INDEX bound); tree files are keyed by block
position over the same index space; but every record carries a `seq` that
survives pruning (seqs never reset). If `enforceRetention` drops the first K
records, `store.records[i]` is suddenly seq `K+i+1`, while the tree files
still address position `i` as seq `i`. The question this plan answers: after
a prune, does `zoom` return the wrong records, do `tree` summaries attach to
the wrong ranges, and does recall's `seq` still match `record.seq`? If yes,
the fix is a recorded base offset; if no (e.g. seqs are dense from 1 and the
tree is rebuilt), close this plan with the evidence.

## Current state

Facts verified at plan time (re-verify each — this plan stands or falls on them):

1. `enforceRetention` (`room-store.ts:263-277`) `shift()`s the in-memory
   head past `logMaxRecords`/age and appends a `gap{reason:"retention"}`
   record. The JSONL file is never truncated (K19).

   ```ts
   while (
     store.records.length > 0 &&
     (store.records.length > store.config.logMaxRecords || store.records[0].ts < cutoff)
   ) {
     const record = store.records.shift()!;
     store.byId.delete(record.id);
     dropped++;
   }
   ```

2. The `tree` op (`room.ts:756-778`) sets `n = store.records.length` and
   tiles `[0, n)`; block summaries come from `tree.getNode(lo, hi)`.
3. The `zoom` op (`room.ts:780-802`) validates `hi <= n` ($n$ = length) and
   resolves singletons via `store.records[seq]` — **indexing by seq**,
   correct only while `seq === index + 1` for every record.
4. `recall` (`room.ts:816-824`) iterates `store.records` and reports both
   `record.seq` and the record — self-consistent regardless of pruning.
5. No `baseSeq`/`seqOffset` bookkeeping exists anywhere in `src/` (grep at
   plan time found only the retention `store.records[0]` read).
6. The compactor slices `store.records.slice(lo, hi)` with tree-space
   coordinates (`compactor.ts:157`) and opens the tree with
   `store.records.length` (`compactor.ts:162,214,236`).

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/tree.test.ts`             | all pass                         |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (read everything; modify only if the investigation confirms a defect):
- `plugin/src/store/room-store.ts`
- `plugin/src/store/tree-store.ts`
- `plugin/src/tools/room.ts` (`tree`/`zoom` ops only)
- `plugin/tests/tree.test.ts` (new tests only if confirming the defect)

**Out of scope** (do NOT touch):
- `plugin/src/store/compactor.ts` — even if skewed, its fix is a separate
  plan; report the finding, don't expand scope.
- Any change to the tree file format — if the fix needs one, STOP and report
  (format migration is an L effort, not an S follow-up).

## Git workflow

- Branch: `advisor/008-retention-skew`
- If NO defect: no commit; update `plans/README.md` row to REJECTED with the
  one-line evidence (e.g. "tree rebuilt from log on open; index space always dense").
- If defect confirmed: one commit describing the finding only, e.g.
  `docs(advisor): confirm retention skews tree addressing (see plan 008)` —
  do NOT fix in this plan; write the fix as a follow-up plan or report back.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify the six facts

Grep and read each Current-state fact against the live code. Pay special
attention to fact 5 (an offset may have been added since the audit) and fact
3 (the `store.records[seq]` line). Record the live line numbers in your report.

**Verify**: each fact confirmed or corrected in writing (your report to the
reviewer, not a file).

### Step 2: Build the skew probe (throwaway script, do not commit)

Write `/tmp/skew-probe.ts` (NOT in the repo — it must not survive into a
commit) that:

1. Creates a temp-root store with `logMaxRecords` small (e.g. 100).
2. Appends 150 `msg` records (seqs 1..150).
3. Calls `enforceRetention(store, Date.now())` — expect it to drop the head
   and append a `gap` record.
4. Prints: `store.records.length`, `store.records[0].seq`, and what the
   `tree` op would tile (`n`, first block), plus `store.records[0]` vs
   "the record with seq 1" (gone).
5. If a tree node exists for a low range (build one via `putNode` BEFORE the
   prune, or run the compactor path), prints whether `getNode(0, 2)` still
   describes records `[0, 2)` after the prune.

Run with `timeout 120 bun /tmp/skew-probe.ts` from `plugin/` (so
`@oh-my-pi/*` resolves).

**Verify**: the probe runs to completion and prints the addressing state.

### Step 3: Render the verdict

- If the probe shows `store.records[seq]` (zoom singletons), `tree` block
  ranges, or compactor slices addressing the wrong records after a prune:
  defect CONFIRMED. Write up: which ops skew, the exact divergence (index vs
  seq, with the probe output), and the smallest fix shape (expected: record
  a `baseSeq` at prune time and translate at the three use sites — but do
  NOT implement it here).
- If the probe shows no skew (e.g. because the tree is keyed by something
  seq-stable you find in Step 1, or retention never fires in practice due to
  a guard you find): defect REJECTED. Write up the mechanism that prevents
  it, with file:line evidence.

**Verify**: verdict written in the report; `git status` shows no repo
modifications (probe lived in /tmp).

### Step 4 (only if CONFIRMED): pin the defect with a failing test

Add ONE test to `plugin/tests/tree.test.ts` that reproduces the skew
(prune, then assert the zoom/tree addressing) and fails on current code.
This is the handoff artifact for the fix plan — do not fix here.

**Verify**: the new test fails; the rest of `tree.test.ts` passes.

## Test plan

- Investigate plan: no new tests unless Step 4 triggers (one failing test
  pinning the confirmed defect).
- The probe is throwaway (`/tmp/skew-probe.ts`); it must not be committed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Investigation verdict (CONFIRMED with failing test, or REJECTED with
  mechanism + evidence) reported to the reviewer
- [ ] If REJECTED: `git status` clean (no repo modifications) and
  `plans/README.md` row set to REJECTED with the one-line rationale
- [ ] If CONFIRMED: exactly one new failing test exists in
  `plugin/tests/tree.test.ts`; everything else passes
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The six Current-state facts don't match live code in a way that dissolves
  the question (e.g. retention was removed or the tree was rekeyed).
- The probe needs host surface that doesn't work headless — simplify the
  probe to store-level calls (`storeFor`, `enforceRetention`, `openTreeStore`
  directly) instead.
- You find the skew extends into the compactor's summary content (wrong text
  persisted, not just wrong addressing) — report immediately; that upgrades
  severity and needs a re-scope, not a quiet fix.

## Maintenance notes

- Whoever fixes a confirmed skew must also audit `compactor.ts:157`
  (`records.slice(lo, hi)`) — it shares the index-space assumption and is
  deliberately out of scope here.
- The deeper fix direction is seq-stable tree keys; the minimal fix direction
  is a `baseSeq` offset recorded at prune time. The investigation report
  should recommend one with the probe evidence.
