# Plan 004: Reject non-numeric TTL in `/room claim` before it becomes a NaN lease

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/commands/room-command.ts plugin/tests/room-tool.test.ts plugin/tests/onboarding.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`/room claim <topic> <key> <garbage>` computes
`Math.min(MAX, Math.max(MIN, Math.trunc(Number("garbage"))))`, which is NaN —
`Math.max`/`Math.min` propagate NaN instead of clamping it. The NaN lease is
appended to the durable log, where `JSON.stringify` silently persists it as
`ttlMs: null`. On the next session open, `validateRecord` (`log.ts:173`,
`kind === "claim" && !Number.isFinite(value.ttlMs)` → null) quarantines the
line as a `gap{reason:"invalid"}` — so a typo'd TTL doesn't just misbehave,
it permanently converts a claim record into a gap and the lease silently
never existed after a restart. The model-facing `room{op:"claim"}` path
can't produce this (zod coerces/validates the number first); only the human
command path parses with a bare `Number()`.

## Current state

- `plugin/src/commands/room-command.ts:224-231` — the vulnerable clamp.
- `plugin/src/store/log.ts:173` — replay rejects non-finite `ttlMs` (the
  quarantine that makes this permanent, not transient).
- `plugin/src/tools/room.ts:618` — the tool path's `clamp(p.ttl ?? …)`,
  which receives a zod-validated number and is not affected.

Excerpt (live code at `room-command.ts:224-231`):

```ts
const resource = resourceKey(topic, key);
const requested =
  ttlArg === undefined ? resolveRoomConfig(pi, store.root).claimTtlMs : Number(ttlArg);
const ttlMs = Math.min(
  CLAIM_TTL_MAX_MS,
  Math.max(CLAIM_TTL_MIN_MS, Math.trunc(requested)),
);
const result = grant(store, resource, agentId, ttlMs);
```

Repo convention: the command path reports user errors with
`report(ctx, pi, message, "warning")` and returns early — see the
`"claim requires <topic> <key> [ttlMs]"` guard two lines above. Match it.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(command): reject non-numeric TTL in /room claim`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 300 bun test tests/room-tool.test.ts`        | all pass                         |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/commands/room-command.ts`
- `plugin/tests/room-tool.test.ts` (or a new `plugin/tests/room-command.test.ts` if no command test file exists — check first)

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/tools/room.ts` — the tool path is safe via zod; leave it.
- `plugin/src/store/log.ts` — the quarantine is correct behavior; the fix is
  to never write the poison, not to accept it on replay.
- Any migration/repair of logs that already contain `ttlMs: null` — out of
  scope; note it in your report if you suspect one exists (check: grep the
  local `.omp-room` log, read-only).

## Git workflow

- Branch: `advisor/004-nan-ttl`
- One commit: `fix(command): reject non-numeric TTL in /room claim`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the TTL parse

In `plugin/src/commands/room-command.ts`, between the `requested` computation
and the clamp, reject non-finite input with the file's own warning pattern:

```ts
const requested =
  ttlArg === undefined ? resolveRoomConfig(pi, store.root).claimTtlMs : Number(ttlArg);
if (!Number.isFinite(requested)) {
  report(ctx, pi, `claim: bad ttlMs "${ttlArg}" — expected a number of milliseconds`, "warning");
  return;
}
```

Note: check `requested`, not `ttlMs` — after the clamp the NaN is already
baked in. `Number.isFinite` rejects NaN, ±Infinity, and (via `Number()`)
empty-string edge cases in one predicate. No record is appended on this path.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Add a regression test

Find or create the command test file: if `plugin/tests/` has no test that
drives `registerRoomCommand`'s handler, create
`plugin/tests/room-command.test.ts` modeled on the handler's existing test
coverage if any (grep for `registerRoomCommand` in `tests/` first). The test:

1. Register the command on a fake `pi` (capture the handler), invoke
   `handler("claim build step notanumber", fakeCtx)` against a temp-root
   store, and assert: no `claim` record was appended
   (`store.records.filter(r => r.kind === "claim")` is empty) and the report
   channel received a warning mentioning ttl.
2. Positive control in the same file: `handler("claim build step 60000", …)`
   grants with `ttlMs: 60000`.

If the fake-ctx/handler harness proves awkward (the handler needs a full
`ExtensionCommandContext`), the acceptable fallback is a unit test on an
extracted pure helper: extract the `ttlArg → ttlMs | null` computation into
an exported-for-test function in `room-command.ts` and test the function
directly. Do not contort the production code to fit the test — pick whichever
shape tests cleanly.

**Verify**: the new tests pass.

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean.

## Test plan

- The two new tests from Step 2 (rejection + positive control).
- Structural pattern: existing handler tests if they exist (grep
  `registerRoomCommand` in `tests/`); otherwise the `coerceSetting` unit-test
  style — small pure function, table of inputs.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -n "Number.isFinite(requested)" plugin/src/commands/room-command.ts` returns ≥1 match
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The claim handler at `room-command.ts:218-247` doesn't match the excerpt
  (drift — e.g. plan 007 already restructured it; coordinate instead).
- There is an existing TTL-validation helper you find by grep that this plan
  missed — use it instead of adding a second check, and say so in the report.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- The general lesson: every `Number(userText)` in a command handler needs a
  finiteness check before it touches the log. A reviewer should grep for bare
  `Number(` in `room-command.ts` on any future handler addition.
- If a poisoned `ttlMs: null` line already exists in a real room log, replay
  quarantines it as `gap{reason:"invalid"}` and the lease is lost — there is
  no repair path, by design (torn lines never drop later records). That is
  acceptable; do not build one in this plan.
