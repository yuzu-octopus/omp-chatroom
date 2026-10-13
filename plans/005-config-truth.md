# Plan 005: Tell the truth in `/room config` — most knobs are live

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/commands/room-command.ts plugin/tests/room-command.test.ts plugin/tests/onboarding.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 006 will move one knob between the two lists; run this first, then 006 updates its line)
- **Category**: docs
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`/room config` prints a banner reading `inert under Option A (present in the
file, read by nothing)` over twelve knobs. This codebase IS Option B, and
nine of the twelve are live: `maxT1PerTurn`, `maxT1Tokens`, `coalesceCount`,
`coalesceMs`, `postsPerWindow`, `burstPosts`, `claimSweepMs`, `logMaxRecords`,
`logMaxAgeMs` are all read on hot paths. Only three are genuinely inert
(`compactionCallsPerDay` — the compactor hardcodes its constant;
`coldTreeEnabled`; `panelKey`), plus the two reserved flags. An operator
tuning the governor reads this banner, concludes the knobs do nothing, and
either gives up or edits the file blind. Telling the truth is a dozen lines.

## Current state

- `plugin/src/commands/room-command.ts:141-158` — `configLines()`, source of
  the banner. Excerpt:

```ts
function configLines(pi: ExtensionAPI, store: RoomStore): string[] {
  const config = resolveRoomConfig(pi, store.root);
  return [
    `room config — ${safe(configPath(store.root))}`,
    `live: roomId=${safe(config.roomId)} · claimTtlMs=${config.claimTtlMs}` +
      ` · maxBodyBytes=${config.maxBodyBytes} · digestBudgetTokens=${config.digestBudgetTokens}`,
    // §1.4 — Option A dropped the governor, the panel and the cold tree; the retention and sweep
    // intervals are module constants, not config reads. Say so instead of echoing dead knobs.
    `inert under Option A (present in the file, read by nothing): maxT1PerTurn=${config.maxT1PerTurn}` +
      ...
```

- Evidence the nine are live (verify each with grep before editing):
  - `maxT1PerTurn`, `maxT1Tokens` → `attention/governor.ts:169,172` (`selectT1`).
  - `coalesceCount`, `coalesceMs` → `attention/governor.ts:217` (`coalescePending`).
  - `postsPerWindow`, `burstPosts` → `attention/governor.ts:84-94` (srTCM buckets).
  - `claimSweepMs` → `store/room-store.ts:300` (sweep interval).
  - `logMaxRecords`, `logMaxAgeMs` → `store/room-store.ts:264,268` (retention).
- Evidence the three are inert:
  - `compactionCallsPerDay` → only declaration/default/echo sites; the
    compactor reads the `COMPACT_MAX_CALLS_PER_DAY` constant
    (`store/compactor.ts:10,55`). Plan 006 wires it; until then it stays in
    the inert list.
  - `coldTreeEnabled` → only declaration/default/echo sites.
  - `panelKey` → config field unread; the live knob is the `room-panel-key`
    *flag* (`panel/panel.ts:469`), which the flags line already shows.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `docs(command): /room config tells the truth about live knobs`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 300 bun test tests/room-command.test.ts` (or `tests/onboarding.test.ts` if that file holds the config tests — check first) | all pass, including 1 new test |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/commands/room-command.ts`
- The one test file that covers `configLines` output (find it by grepping
  for `inert under Option A` in `tests/`; if none exists, add the test to the
  command test file from plan 004, or `tests/room-command.test.ts` new)

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/store/config.ts` — no schema change; the knobs already exist.
- `plugin/src/store/compactor.ts` — plan 006 wires `compactionCallsPerDay`;
  this plan only labels it honestly as inert *today*.
- Any other "Option A" comment in `src/` — plan 013 sweeps those; this plan
  owns only the user-facing banner (and its comment, since they are adjacent).

## Git workflow

- Branch: `advisor/005-config-truth`
- One commit: `docs(command): /room config tells the truth about live knobs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify the live/inert split with grep

Before editing, confirm each knob's status has not changed since the audit:

```sh
for k in maxT1PerTurn maxT1Tokens coalesceCount coalesceMs postsPerWindow burstPosts claimSweepMs logMaxRecords logMaxAgeMs; do echo "== $k"; grep -rn "caps\.$k\|config\.$k" src/ --include=*.ts | grep -v "config.ts\|room-command.ts:1[4-5][0-9]\|interface" | head -2; done
for k in compactionCallsPerDay coldTreeEnabled panelKey; do echo "== $k"; grep -rn "$k" src/ --include=*.ts | grep -v "config.ts\|room-command.ts:1[4-5][0-9]\|interface\|DEFAULT_" | head -2; done
```

Expected: every knob in the first list shows ≥1 read site outside the
declaration/echo; every knob in the second shows none. If any knob moved
lists, STOP and report (the split in Step 2 would be wrong).

**Verify**: the grep output matches the split above.

### Step 2: Rewrite the banner

In `configLines()` (`room-command.ts:141-158`):

1. Extend the `live:` line (or add a second `live:` line if it gets too long
   — keep each rendered line under ~120 chars) to include the nine live
   knobs with their values: `maxT1PerTurn`, `maxT1Tokens`, `coalesceCount`,
   `coalesceMs`, `postsPerWindow`, `burstPosts`, `claimSweepMs`,
   `logMaxRecords`, `logMaxAgeMs`.
2. Replace the `inert under Option A …` line with an honest inert line naming
   only `compactionCallsPerDay`, `coldTreeEnabled`, `panelKey`, e.g.
   `` `inert (present in the file, read by nothing yet): compactionCallsPerDay=…` ``.
3. Update the adjacent comment (the `§1.4 — Option A dropped …` block) to
   state the Option B reality in one line and point at plan 006 for
   `compactionCallsPerDay`.
4. Fix the flags line's `(both reserved, no effect yet)`: `room-panel-key`
   HAS an effect (it registers the shortcut, `panel/panel.ts:469-471`).
   Reword to name which flag does what, e.g.
   `` `flags: --room-panel-key="…" (opens the panel; empty = disabled) · --room-cold-tree=… (reserved, no effect yet)` ``.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 3: Add a banner regression test

In the command test file (see Scope), add one test: build `configLines`
against a temp-root store and assert the joined output contains
`maxT1PerTurn=` on a `live` line and does NOT contain `inert under Option
A`. This pins the banner to the truth so the next knob addition updates it.

**Verify**: the new test passes; then the full gate
(`timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean).

## Test plan

- The one banner test from Step 3.
- Structural pattern: whatever test file covers the command handlers today
  (grep `registerRoomCommand` in `tests/`); if none, follow the Step 2
  fallback shape from plan 004.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -rn "inert under Option A" plugin/src/` returns no matches
- [ ] `grep -rn "both reserved, no effect yet" plugin/src/` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 1 grep shows a knob moved lists (a "live" knob lost its readers
  or an "inert" one gained one).
- `configLines` at `room-command.ts:141-158` doesn't match the excerpt (drift).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Every future knob addition must update BOTH the `RoomConfig` interface and
  this banner's live/inert split — the Step 3 test enforces the banner half.
- Plan 006 moves `compactionCallsPerDay` from the inert line to the live
  line; it depends on this plan's rewritten banner.
- Reviewer: verify the flags-line rewording against `panel/panel.ts:469-471`
  (panel-key effect) and confirm `room-cold-tree` is still unread anywhere.
