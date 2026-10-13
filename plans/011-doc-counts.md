# Plan 011: Fix stale suite-size and host claims in AGENTS.md, README, HANDOFF

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- AGENTS.md plugin/README.md docs/research/omp-agent-chatroom/HANDOFF.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/010-host-repin.md (it owns the host-version line; run 010 first so this plan doesn't conflict on AGENTS.md)
- **Category**: docs
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

Three doc claims are stale by amounts that mislead: `AGENTS.md:63` says the
suite is "205 pass, 11 files" (it is 213 pass, 12 files);
`docs/research/omp-agent-chatroom/HANDOFF.md:29` says "186 pass / 0 fail,
1530 assertions, 11 files". An executor that reads the repo guide and then
sees 213 pass will wonder what changed — or worse, trust the doc and stop
investigating a real regression at 205. Stale counts are cheap to fix and
expensive to doubt. This plan also converts the counts to the self-updating
form where the file format allows it, so the fix sticks.

## Current state

- `AGENTS.md:63`: `` bun test tests/  # the whole suite (205 pass, 11 files) ``
- `docs/research/omp-agent-chatroom/HANDOFF.md:29`:
  `| \`bun test tests/\` | **186 pass / 0 fail**, 1530 assertions, 11 files |`
- Live truth at plan time: 213 pass, 0 fail, 3197 expect() calls, 12 files
  (re-verify in Step 1 — other plans land new tests).
- `plugin/README.md`: check for suite-size or host-version claims (the audit
  found none with the `18.x` grep, but re-grep for `pass`/`tests/`).

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. For a docs-only plan the gate is "suite still green + grep shows
no stale claim". Runtime is Bun; never node/npm/npx. Commit style:
conventional, e.g. `docs: refresh stale suite-size claims`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Truth     | `timeout 500 bun test tests/ 2>&1 \| tail -4`         | current pass/fail/file counts    |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `AGENTS.md`
- `plugin/README.md`
- `docs/research/omp-agent-chatroom/HANDOFF.md`

**Out of scope** (do NOT touch, even though they look related):
- Any other `docs/research/**` file — historical reports stay frozen.
- `AGENTS.md:129` host-version line — plan 010 owns it.
- `plugin/src/**`, `plugin/tests/**` — docs-only plan; no code.

## Git workflow

- Branch: `advisor/011-doc-counts`
- One commit: `docs: refresh stale suite-size claims`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the live truth

Run the suite once and record the exact `pass`, `fail`, `expect() calls`,
and file counts from the tail summary. These numbers are the replacement
values — do not copy the plan's 213/3197/12 blindly; other advisor plans may
have landed tests since.

**Verify**: you have four numbers written down.

### Step 2: Update the three claims

1. `AGENTS.md:63` — replace `(205 pass, 11 files)` with the live
   `(N pass, M files)`.
2. `HANDOFF.md:29` — replace the whole cell with the live
   `**N pass / 0 fail**, K assertions, M files`. If the row's date context
   makes a live number confusing (HANDOFF is dated 2026-10-07), add the
   as-of date in the cell, e.g. `**N pass / 0 fail** (as of 2026-10-13)`.
3. `plugin/README.md` — grep for `pass`, `tests/`, `18.`; update any stale
   claim found, or record "none found" in your report.

**Verify**: `grep -rn "205 pass\|186 pass\|1530 assertions" AGENTS.md plugin/README.md docs/research/omp-agent-chatroom/HANDOFF.md` → no matches.

### Step 3: Run the gate (docs-only, but prove nothing else broke)

**Verify**: `timeout 500 bun test tests/` → same pass count as Step 1, 0 fail.

## Test plan

- Docs-only plan: no new tests. The Step 1 suite run is the verification.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "205 pass\|186 pass\|1530 assertions" AGENTS.md plugin/README.md docs/research/omp-agent-chatroom/HANDOFF.md` returns no matches
- [ ] The AGENTS.md count matches the live suite tail from Step 1
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The live suite is red (fix the suite first — don't document a failing
  count; report instead).
- A "stale" claim turns out to be intentional (e.g. HANDOFF pins a
  historical milestone) — keep it, add the as-of date, and say so.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Counts rot. Whoever adds the next test file should update `AGENTS.md:63`
  in the same commit — consider adding that one-line instruction next to the
  count itself (in Step 2, if it fits naturally).
- Reviewer: confirm the HANDOFF edit preserves the document's historical
  voice (as-of dating, not silent rewriting).
