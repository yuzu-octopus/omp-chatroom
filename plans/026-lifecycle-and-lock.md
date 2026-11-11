# Plan 026: Lifecycle and lock integrity (dispose scope, global registries, lock liveness)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/store/room-store.ts plugin/src/store/log.ts plugin/src/store/compactor.ts plugin/src/store/tree-store.ts plugin/src/onboarding/digest.ts plugin/src/tools/room.ts plugin/tests/store.test.ts plugin/tests/room-root.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (lock path is subtle — keep changes minimal and well-tested)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

`disposeRoomSession` unconditionally forgets the delivered-T0 registry and wait edges even when `dispose()` early-returned because other sessions still hold refs — the first session to leave wipes GIVEN marks (next pass re-sends T0s as a wake+steer storm) and blinds cycle detection for still-waiting peers. Five per-root global registries (`DELIVERY_CHAIN`, compactor `SPEND`/`MUTEX`, tree `QUEUES`, digest `PREV_DIGESTS`) are never evicted, leaking one entry per root for process life. The lock treats any `process.kill(pid,0)` throw other than the two lock messages as death — EPERM (another user's live pid) reaps a live lock — and reaps stale locks with a plain `rmSync` that can unlink a live lock created in the window, letting two processes mint colliding seqs.

## Current state

- `plugin/src/store/room-store.ts:332-343` — `disposeRoomSession` deletes the session id, calls `STORES.get(root)?.dispose()` (which early-returns when refs remain), then unconditionally calls `forgetDeliveredT0(root)` + `forgetWaitEdges(root)`. `resetRoomStores` (`:345-357`) clears STORES/REFS/SESSIONS plus the two forgets, but not the other per-root maps.
- `plugin/src/tools/room.ts:544` `DELIVERY_CHAIN`, `plugin/src/store/compactor.ts:43` `SPEND` + `:111` `MUTEX`, `plugin/src/store/tree-store.ts:152` `QUEUES`, `plugin/src/onboarding/digest.ts:237` `PREV_DIGESTS` — globalMap entries keyed by root, never deleted.
- `plugin/src/store/log.ts:219-254` — lock liveness: `process.kill(found.owner, 0)` in try; the catch rethrows only the two lock messages and otherwise falls through to reap; stale reap is `fs.rmSync(lockPath, {force:true, recursive:true})` with no identity re-check.
- Conventions: `bun:test`, no mocks; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/store.test.ts tests/room-root.test.ts tests/tree.test.ts tests/onboarding.test.ts tests/wait-tools.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/store/room-store.ts` (dispose/reset only)
- `plugin/src/store/log.ts` (lock liveness + stale reap only)
- `plugin/src/tools/room.ts` (DELIVERY_CHAIN eviction helper only — one small exported or store-owned function, no dispatch changes)
- `plugin/src/store/compactor.ts` (SPEND/MUTEX eviction only)
- `plugin/src/store/tree-store.ts` (QUEUES eviction only)
- `plugin/src/onboarding/digest.ts` (PREV_DIGESTS eviction only)
- `plugin/tests/store.test.ts`, `plugin/tests/room-root.test.ts` (new tests)

**Out of scope** (do NOT touch):
- The single-writer lock design, the lockfile format, or the worker-thread refusal — only liveness discrimination and reap safety.
- Retention, replay, delivery, digest rendering, compactor scheduling.
- `tests/room-root-e2e.test.ts` (child-process e2e — do not extend; unit tests suffice).

## Git workflow

- Branch: `advisor/026-lifecycle-and-lock`
- Commit per step; conventional commits, e.g. `fix(store): scope registry cleanup to last session`.
- Do NOT push or open a PR.

## Steps

### Step 1: Scope dispose cleanup to the last session

Only call `forgetDeliveredT0`/`forgetWaitEdges` (and the Step 2 evictions) when the dispose actually evicted the root: i.e. when `SESSIONS` no longer has the root AND the refcount reached zero. Simplest shape: have `dispose()` return whether it evicted, or check `STORES.has(root)` after the call. Keep the early-return path (unknown session id) as a no-op.

**Verify**: `cd plugin && bun test tests/store.test.ts tests/wait-tools.test.ts` → all pass.

### Step 2: Evict the remaining per-root global registries

On last-session dispose and in `resetRoomStores`, delete the root's entries from `DELIVERY_CHAIN` (room.ts), compactor `SPEND` + `MUTEX`, tree `QUEUES`, and digest `PREV_DIGESTS`. Each map needs a tiny eviction entry point owned by its module (e.g. `forgetRootRegistries(root)` per module, called from room-store) — do not reach into another module's map directly. `resetDigestTurns` already exists for digests; reuse or extend it.

**Verify**: `cd plugin && grep -rn "delete\|forget" plugin/src/store/compactor.ts plugin/src/store/tree-store.ts plugin/src/onboarding/digest.ts | head` → eviction points exist; `bun check` clean.

### Step 3: Harden lock liveness and the stale reap

In `acquireRoomLock`: only treat ESRCH as death (fall through to reap); on EPERM (or any other error from `kill`) treat the pid as LIVE and throw `room file locked by pid N`. Before the stale `rmSync`, re-inspect the lock (re-read owner + age) and only unlink when it still names the same dead owner; if it changed, loop back to the top instead of unlinking. Keep all existing error strings byte-identical (tests pin them).

**Verify**: `cd plugin && bun test tests/room-root.test.ts tests/store.test.ts` → all pass.

### Step 4: Add regression tests

1. Multi-session dispose: two fake sessions on one root, dispose the first, assert the second's delivered marks and wait edges survive (e.g. mark a T0 given, dispose session one, assert `deliveredT0s` still has it and a cycle check still sees an edge).
2. Last-session dispose: dispose the final session, assert all per-root registries are gone (delivered, wait edges, delivery chain entry, compactor spend/mutex, tree queue, prev digest).
3. Lock: a lock file naming a pid that `kill` rejects with EPERM is NOT reaped (simulate by stubbing `process.kill` — check how existing lock tests fake pids first and follow that pattern); a stale lock whose file changes identity between inspect and reap is not unlinked.

**Verify**: targeted suites green; revert each fix → corresponding test fails.

## Test plan

- New tests in `tests/store.test.ts` (dispose scope, registry eviction) and `tests/room-root.test.ts` (lock liveness/reap), following existing fake-ctx and lock-test patterns in those files.
- Verification: `bun test tests/store.test.ts tests/room-root.test.ts tests/wait-tools.test.ts tests/tree.test.ts tests/onboarding.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] New dispose/lock tests exist and pass
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] Lock error strings unchanged (`grep -n "room file locked by pid" plugin/src/store/log.ts` + tests pinning them still pass)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- `process.kill` stubbing proves unworkable in the test env — report the obstacle and the alternative tried instead of weakening the test to a no-op.
- The reap re-check races the existing mid-create window logic — do not change mid-create timing; report the interaction.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Any NEW per-root global map must register its eviction in the dispose/reset path from day one — reviewers should treat a new `globalMap` without eviction as a defect.
- The lock path stays minimal by design; future hardening (start-time tokens) needs its own plan with live two-process verification by the human.
- `resetRoomStores` is the test seam — it must evict everything dispose evicts, or tests leak state between files.
