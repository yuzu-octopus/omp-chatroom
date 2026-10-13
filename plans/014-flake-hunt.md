# Plan 014: Hunt the one transient suite failure (unreproduced since)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/tests/wait-tools.test.ts plugin/tests/e2e-room.test.ts`
> If either file changed since this plan was written, re-verify the "Current
> state" line numbers against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S (investigation; M only if it becomes a fix)
- **Risk**: LOW (read-only unless it confirms a defect)
- **Depends on**: none (run AFTER plans 001–009 if convenient — fewer moving parts — but no hard dependency)
- **Category**: tests
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

During the audit the full suite failed once (`1 fail` / 213) and passed on
every subsequent run — five consecutive green runs since (two focused on
`wait-tools` + `e2e-room`, three full). The failing test's name was not
captured (the follow-up grep found no `(fail)` marker). An unreproduced
transient in a suite this timing-sensitive (real `Bun.sleep` windows of
50–80 ms asserting non-settlement) is either load flake or a genuine race —
either way it must be identified before it starts failing CI (plan 012)
nightly. This plan is a hunt with a verdict, not a fix.

## Current state

- Suite: `timeout 500 bun test tests/` from `plugin/` — 213 pass, 12 files,
  ~20–40 s per run.
- Prime suspects (the tightest real-timer margins in the suite):
  - `tests/wait-tools.test.ts:100` — `Bun.sleep(50)` vs `waitP` race,
    expects `settledEarly === false`.
  - `tests/wait-tools.test.ts:336` — `Bun.sleep(80)` variant of the same.
  - `tests/e2e-room.test.ts:101` — `Bun.sleep(50)` variant.
  - `tests/e2e-room.test.ts:372-375` — 12 s poll loop for the claim-sweep
    expiry (`claimSweepMs` default 5000) — generous, unlikely.
- Repro attempts at plan time: 2× focused
  (`bun test tests/wait-tools.test.ts tests/e2e-room.test.ts`, 21 pass each)
  + 3× full (213 pass each). Zero failures.
- The suite runs files in one process (`bun test`), so cross-file timing
  interaction (GC, event-loop lag under parallel file runs) is plausible.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Hunt      | `for i in 1 2 3 4 5; do timeout 500 bun test tests/ > /tmp/hunt-$i.txt 2>&1; echo "run $i exit $?"; done; grep -l "(fail)" /tmp/hunt-*.txt` | either a failing run captured or 5 more green runs |
| Stress    | `timeout 500 bun test tests/wait-tools.test.ts tests/e2e-room.test.ts --rerun-each 5` (if supported; else loop 5×) | pass/fail per iteration |

Run all commands from `plugin/`.

## Scope

**In scope** (read everything; modify only to INSTRUMENT, then revert):
- `plugin/tests/wait-tools.test.ts`
- `plugin/tests/e2e-room.test.ts`

**Out of scope** (do NOT touch):
- `plugin/src/**` — no production change on a hunt.
- Widening the sleep windows as a "fix" — if the hunt concludes the margins
  are too tight, the fix is deterministic synchronization (a hook, not a
  longer sleep), and that's a separate plan. Report, don't pad.
- Committing any instrumentation — all probes are reverted before finishing.

## Git workflow

- Branch: `advisor/014-flake-hunt`
- If NO repro: no commit; update `plans/README.md` row to REJECTED with the
  run count (e.g. "10 consecutive green runs; transient not reproduced").
- If repro: one commit with the captured failure log excerpt in the message
  body + a follow-up fix plan reference; the fix itself is out of scope here.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Run the hunt loop

From `plugin/`, run the full suite 5 more times (10 total with the audit's
5), capturing each run's full output to a separate file:

```sh
for i in 6 7 8 9 10; do timeout 500 bun test tests/ > /tmp/hunt-$i.txt 2>&1; echo "run $i exit $?"; done
grep -l "(fail)" /tmp/hunt-*.txt || echo "NO FAILURES IN 10 RUNS"
```

While the loop runs, ALSO stress the two suspect files in isolation (serially
after, not in parallel — parallel load invalidates the timing evidence):

```sh
for i in 1 2 3; do timeout 500 bun test tests/wait-tools.test.ts tests/e2e-room.test.ts > /tmp/stress-$i.txt 2>&1; echo "stress $i exit $?"; done
```

**Verify**: you have 8+ run outputs on disk with exit codes recorded.

### Step 2: Render the verdict

- If any run failed: extract the `(fail)` test name, the assertion, and the
  surrounding 20 lines. Classify: (a) sleep-margin race (settledEarly-style),
  (b) sweep/poll timeout, (c) cross-file interference (passes in isolation),
  (d) genuine product race. Write the classification + evidence in your
  report and STOP (the fix is a follow-up plan, not this one).
- If all green (10 full + 3 stress): verdict is "transient not reproduced in
  N runs". Check system load during the audit's failing run only if logs
  exist (they don't — note that); do not invent an explanation. Report the
  run count and close.

**Verify**: verdict written; no repo modifications (`git status` clean of
instrumentation).

### Step 3 (only if reproduced AND the fix is a test-only deterministic sync)

If the failure is a sleep-margin race AND you can replace the racy sleep
with a deterministic signal that already exists in the code (e.g. awaiting a
store listener instead of sleeping), you MAY fix it in this plan — test file
only, no `src/` change. If the fix needs production hooks, STOP and report
(the follow-up plan, not this one).

**Verify**: the previously failing test passes 5× consecutively after the fix.

## Test plan

- Hunt plan: no new tests by default. Step 3 optionally converts the repro
  into a deterministic test (same file, same test, no new cases).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] ≥8 suite runs recorded with exit codes (5 full + 3 stress minimum, plus the audit's 5)
- [ ] Verdict reported: REPRODUCED (with test name + classification) or NOT REPRODUCED (with run count)
- [ ] If NOT REPRODUCED: `git status` clean, `plans/README.md` row REJECTED with the run count
- [ ] If REPRODUCED: failure evidence in the report; no `src/` modifications
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A run HANGS past the 500 s timeout (that's a deadlock, not a flake —
  capture which file, kill it, report immediately; severity upgrade).
- The failure reproduces but points at `src/` behavior (a product race, not
  a test race) — report with evidence; do not fix here.
- You are tempted to widen a sleep window to make the failure go away — that
  is explicitly out of scope; report instead.

## Maintenance notes

- If CI (plan 012) lands first, its nightly/weekly full-suite history is a
  better hunt instrument than local loops — re-run this plan's verdict
  against a month of CI data before closing permanently.
- The 50/80 ms `settledEarly` windows are the suite's tightest margins by
  design (they assert genuine blocking, not polling). Any future timing
  assertion should copy their race-against-sleep shape, not a bare sleep.
- Reviewer: a NOT-REPRODUCED verdict with 10+ green runs is a valid close —
  do not hold the plan open indefinitely. Reopen only on a fresh failure
  with a captured test name.
