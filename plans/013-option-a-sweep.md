# Plan 013: Sweep the stale "Option A" comments from `src/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/tools/room.ts plugin/src/onboarding/digest.ts plugin/src/commands/room-command.ts plugin/src/version.ts plugin/src/panel/panel.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-config-truth.md (it owns the `room-command.ts` banner comment; run 005 first)
- **Category**: docs
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

Eight "Option A" references survive in `src/` comments, in a codebase that
IS Option B (HANDOFF: "Option B is built, tested, and verified live"). Most
are harmless history, but two actively mislead: `room.ts:158` says record
lines are "tier-free (Option A has no governor)" above a function used by
the governed push path, and `version.ts:10` says "Option A only imports the
first four" about a list that has since dropped an entry. A reader trusts
comments; wrong ones cost more than none. This plan rewrites each to describe
the code as it is, keeping one honest history pointer where the past matters.

## Current state

Live sites at plan time (re-grep in Step 1 — plans 005/007 may have touched
adjacent lines):

| File:line | Text | Verdict |
|---|---|---|
| `tools/room.ts:158` | `One model-facing line per record, tier-free (Option A has no governor) — §4.5.1 K17.` | WRONG — rewrite: the line shape is tier-free by format (no badge field), while tiering lives in `classify`/`renderLine`. Drop the Option A clause. |
| `onboarding/digest.ts:10` | `Option A's only backlog item is the raw tail` | STALE — rewrite: the raw tail is the whole backlog (no cold-tree digest item exists). |
| `onboarding/digest.ts:132` | `Option A (§1.4): the raw tail is the whole backlog — there is no cold-tree item.` | STALE — same rewrite, keep the "no cold-tree item" half (still true). |
| `commands/room-command.ts:21` | `Option A (§1.4) subcommand set: exactly the shipped room ops…` | STALE — rewrite: the subcommand set mirrors the shipped `room` ops, plus `config`. |
| `commands/room-command.ts:147-148` | `§1.4 — Option A dropped the governor…` | OWNED BY PLAN 005 — do not touch; verify 005 landed. |
| `version.ts:10` | `Option A only imports the first four; the rest are listed so a future Option B phase fails loudly…` | STALE — rewrite: the first four are the store-critical surface; the rest fail loudly on drift. Keep the intent, drop the phase fiction. |
| `panel/panel.ts:315-319` | `its roster strip from agent-hub-renderer` | STALE (not Option-A text, but the same drift class — the roster no longer uses it; `roster-strip.ts:49` says so). Rewrite to name only the chrome helpers. Included here because it's one comment, same review. |
| `tests/drift.test.ts` (2 sites) + `host-contract.test.ts` (1 site) | `Option A four` / `Option A deep specifier` | Test names — out of scope (renaming tests churns nothing of value); leave them. |

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Comment-only plan: the gate proves nothing broke. Runtime is Bun;
never node/npm/npx. Commit style: conventional,
e.g. `docs: sweep stale Option A comments from src`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Sweep check | `grep -rn "Option A" plugin/src/`                   | only the sites this plan keeps (none — see Done criteria) |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from the repo root for grep, from `plugin/` for the gate.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/tools/room.ts` (one comment)
- `plugin/src/onboarding/digest.ts` (two comments)
- `plugin/src/commands/room-command.ts` (one comment — NOT the plan-005 banner)
- `plugin/src/version.ts` (one comment)
- `plugin/src/panel/panel.ts` (one comment)

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/commands/room-command.ts:147-148` — plan 005 owns it.
- `plugin/tests/**` — test names stay.
- `docs/research/**` — historical record; "Option A" there is history, correctly.
- Any code (non-comment) change — comment-only plan. If a comment can't be
  fixed without a code change, STOP and report that site.

## Git workflow

- Branch: `advisor/013-option-a-sweep`
- One commit: `docs: sweep stale Option A comments from src`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-grep and confirm the site list

Run `grep -rn "Option A" plugin/src/` from the repo root. Confirm the five
sites above (plus the plan-005-owned banner) and no new ones. Confirm plan
005 landed (the banner comment is gone or rewritten). Also confirm
`panel.ts` still names `agent-hub-renderer` in `resolveTheme`'s comment.

**Verify**: site list matches the table (modulo line drift).

### Step 2: Rewrite the six comments

Apply the Verdict column verbatim in spirit (exact wording is yours, but
each rewrite must: describe the code as it IS, keep any still-true half of
the old comment, and keep the `§`/`K` spec pointers). Rules:

- Never delete information: `digest.ts:132`'s "there is no cold-tree item"
  stays; only the "Option A" framing goes.
- The `panel.ts` rewrite must match `host-theme.ts`'s corrected header
  (post-fix, it names only `chrome/overlay-box` helpers) — read that header
  first and mirror its phrasing.
- Keep line width ≤100 (biome `lineWidth`).

**Verify**: `grep -rn "Option A" plugin/src/` → no matches;
`grep -n "agent-hub-renderer" plugin/src/panel/panel.ts` → no matches;
`bunx --bun @biomejs/biome check src tests` → clean (comment reflow can
break formatting).

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail (comment-only;
this proves nothing else moved).

## Test plan

- Comment-only plan: no new tests. The full gate is the verification.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "Option A" plugin/src/` returns no matches
- [ ] `grep -n "agent-hub-renderer" plugin/src/panel/panel.ts` returns no matches
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `git diff --stat` shows only the five in-scope files, comment lines only
      (verify with `git diff -U0 | grep "^[+-]" | grep -v "^[+-][+-]" | grep -v "^[+-]\s*\(\*\|//\)"` → empty)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 005 has not landed (its banner lines overlap your grep; coordinate).
- Any site's code changed so the prescribed rewrite no longer describes it
  (re-derive the rewrite from the live code, or STOP if the code change
  implies a behavior question).
- The `git diff` comment-only check fails (you changed code — revert and redo).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The durable rule: comments describe the code as it is; history lives in
  git log and `docs/research`, not in `src/` headers. A reviewer should push
  back on new "used to be X" comments that restate log archaeology.
- Exception kept deliberately: `version.ts`'s `agent-hub-renderer` removal
  note stays (it explains why a specifier is ABSENT, which git log can't
  show at the read site). Presence-notes rot; absence-notes pay rent.
