# Plan 006: Wire `compactionCallsPerDay` through to the compactor's rate cap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/compactor.ts plugin/src/commands/room-command.ts plugin/tests/tree.test.ts plugin/tests/config.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-config-truth.md (it owns the banner lines this plan edits)
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`compactionCallsPerDay` is a documented config knob (present in
`DEFAULT_ROOM_CONFIG`, editable via `/room config set`, echoed in the config
banner) that nothing reads. The compactor's daily rate cap is the hardcoded
constant `COMPACT_MAX_CALLS_PER_DAY = 20_000` (`compactor.ts:10,55`). An
operator who sets the knob to 200 to contain summarizer spend gets no effect
— the knob is a lie with a billing consequence. The fix threads the configured
value into `atCap()` with the constant as fallback, so behavior is identical
when the knob is at its default.

## Current state

- `plugin/src/store/compactor.ts:10` —
  `export const COMPACT_MAX_CALLS_PER_DAY = 20_000; // K4 — a RATE cap [calibrate]`
- `plugin/src/store/compactor.ts:53-56`:

```ts
function atCap(): boolean {
  rollSpendDay();
  return spendToday >= COMPACT_MAX_CALLS_PER_DAY;
}
```

- Callers of `atCap()`: `compactOnce` (`compactor.ts:216,219`) and `runJobs`
  (`compactor.ts:238`). Both have the `store` in scope, hence
  `store.config.compactionCallsPerDay`.
- `plugin/src/commands/room-command.ts` — the banner this plan updates (owned
  by plan 005; this plan moves one knob from its inert line to its live line).
- `plugin/tests/tree.test.ts` — compactor/tree tests; model new tests on the
  existing cap tests using the `__compactTest` seam.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(compactor): honor compactionCallsPerDay instead of the hardcoded cap`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/tree.test.ts tests/config.test.ts` | all pass, including 2 new tests |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/store/compactor.ts`
- `plugin/src/commands/room-command.ts` (banner lines only — move the knob)
- `plugin/tests/tree.test.ts`
- `plugin/tests/config.test.ts` (only if a coercion test is needed; prefer tree.test.ts)

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/store/config.ts` — the schema already has the knob; no change.
- `coldTreeEnabled` / `room-cold-tree` — genuinely unimplemented features,
  not miswired knobs; plan 015 covers direction, not this fix.
- The spend-ledger mechanics (`rollSpendDay`, `__compactTest`) — untouched.

## Git workflow

- Branch: `advisor/006-compactor-cap`
- One commit: `fix(compactor): honor compactionCallsPerDay instead of the hardcoded cap`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Thread the configured cap into `atCap()`

Change `atCap()` to take the cap as a parameter with the constant as the
default, keeping the constant as the documented fallback:

```ts
function atCap(limit: number = COMPACT_MAX_CALLS_PER_DAY): boolean {
  rollSpendDay();
  return spendToday >= limit;
}
```

Update the three call sites:

- `compactOnce` (`compactor.ts:216,219`): pass `store.config.compactionCallsPerDay`.
- `runJobs` (`compactor.ts:238`): pass `store.config.compactionCallsPerDay`.

Guard the configured value: `coerceConfig` accepts any finite number,
including 0 and negatives. Clamp with `Math.max(1, Math.trunc(...))` at the
call sites (or in one tiny helper next to `atCap`). A knob set to 0 must
mean "at most ~nothing" (cap 1, effectively compacting one node then
stopping), never "unlimited" and never a crash. Document the clamp in a
one-line comment.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Move the knob in the `/room config` banner

In `room-command.ts` `configLines()` (rewritten by plan 005): remove
`compactionCallsPerDay` from the inert line and add it to a live line.
Adjust the banner regression test from plan 005 if it pins the inert list
verbatim.

**Verify**: `timeout 300 bun test tests/config.test.ts` (or the command test
file) → all pass.

### Step 3: Add regression tests

In `plugin/tests/tree.test.ts`, using the existing `__compactTest` seam and
temp-root stores:

1. A store whose config sets `compactionCallsPerDay: 1`, with spend preset
   to 1 via `__compactTest.setSpendToday(1)`, makes `compactOnce` return
   `false` without calling the summarizer (assert via a counting stub or via
   `compactionSpendToday()` not advancing — model on the existing cap tests).
2. Default config (20_000) with spend 0 still compacts (positive control
   that the default path is unchanged).

**Verify**: `timeout 500 bun test tests/tree.test.ts tests/config.test.ts` → all pass; then the full gate.

## Test plan

- The two new tests in `plugin/tests/tree.test.ts` (see Step 3).
- Structural pattern: the existing `__compactTest` cap tests in the same
  file (preset spend, attempt compaction, assert skip/proceed).
- The plan-005 banner test updated, not duplicated.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -n "store.config.compactionCallsPerDay" plugin/src/store/compactor.ts` returns ≥2 matches
- [ ] `grep -n "compactionCallsPerDay" plugin/src/commands/room-command.ts` shows it on a live line, not the inert line
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `atCap()` at `compactor.ts:53-56` has more callers than the three listed
  (grep `atCap()` first; a fourth caller needs the same treatment — report
  rather than silently extending scope).
- The `__compactTest` seam is gone or renamed (the test strategy needs a rethink).
- Plan 005 has not landed (its banner lines are this plan's edit base).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any future rate knob follows the same shape: parameterize the predicate,
  clamp at the call site, keep the constant as default. A reviewer should
  reject new `COMPACT_*` constants read directly in predicates.
- The clamp floor (1, not 0) is deliberate: 0 would make `atCap()` true
  before any spend, which reads as "disabled" but behaves as "compact
  nothing, silently". If a real disable switch is wanted, that is
  `coldTreeEnabled`'s job (plan 015), not this knob's.
