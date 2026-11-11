# Plan 023: Fix replay double-projection, hydrate release pruning, and reset() leaks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/store/room-store.ts plugin/src/store/claims.ts plugin/tests/store.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

Opening a room replays the log through `project()` (which rebuilds claims, generations, heldTopics, and the idempotency index) and then calls `hydrateClaims()`, which re-applies every claim/release a second time. Renewals bump the fencing generation once per renewal on replay, so live generations diverge from a fresh projection and the R1 fence can refuse a current holder or admit a stale one. The replayed `release` arm also skips `heldTopics` pruning, so a released topic keeps classifying T1 and the board shows a held topic with no live claim. Separately, `reset()` clears records/claims/cursors/members/waiters but keeps `claimGens` and `idemKeys`, so a re-grant after reset reuses a generation (defeating the zombie fence) and a retried idemKey can double-post. All three corrupt the claim board's core promise.

## Current state

- `plugin/src/store/room-store.ts` — owns `project()` (claim/release projection, lines 127–171), `pruneHeldTopic()` (lines 178–183), `createStore()` with the replay loop + `hydrateClaims()` call (lines 263–271), and `reset()` (lines 252–260).
- `plugin/src/store/claims.ts` — owns `hydrateClaims()` (lines 236–259: claim arm recomputes generations, release arm only deletes the map entry).
- Excerpts (at `efc5211`):

```ts
// room-store.ts:263-271
const { records } = replay(fd);
for (const record of records) {
  store.records.push(record);
  store.byId.set(record.id, record);
  if (record.seq > store.seq) store.seq = record.seq;
  project(store, record);
}
hydrateClaims(store, records);
```

```ts
// claims.ts:255-257
} else if (record.kind === "release") {
  store.claims.delete(record.resource);
}
```

```ts
// room-store.ts:252-260
reset(): void {
  store.records.length = 0;
  store.byId.clear();
  store.claims.clear();
  store.cursors.clear();
  store.members.clear();
  store.waiters.clear();
  store.seq = 0;
},
```

- Conventions: `bun:test`, no `mock.module`; fake ctx builders set `cwd` to a temp root and complete the timer API; assert model-facing `content` arrays where relevant. Gate commands: `cd plugin && bun check`, `bun run typecheck`, `bunx --bun @biomejs/biome check src tests`, `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/store.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/store/room-store.ts`
- `plugin/src/store/claims.ts`
- `plugin/tests/store.test.ts`

**Out of scope** (do NOT touch):
- `plugin/src/tools/room.ts` — delivery/idempotency paths are plan 025's job.
- `plugin/src/store/tree-store.ts`, `plugin/src/store/compactor.ts` — unrelated caches.
- Any change to the fencing-token contract itself (opt-in `gen`, R1 rule) — only the replay/reset application of it.

## Git workflow

- Branch: `advisor/023-replay-reset-claims`
- Commit per step; message style: conventional commits, e.g. `fix(store): single replay projection for claims` (see `git log --oneline`).
- Do NOT push or open a PR.

## Steps

### Step 1: Remove the double claim projection on open

Decide ONE projection path for open: either the replay loop calls `project()` for claim/release records and `hydrateClaims()` is deleted, or the replay loop skips claim/release in `project()` and `hydrateClaims()` handles them. Prefer deleting the `hydrateClaims()` call and keeping the single `project()` funnel (it already handles claims, releases with `pruneHeldTopic`, and the idempotency index). Remove the now-dead `hydrateClaims` export only if no other caller exists (check with grep first).

**Verify**: `cd plugin && grep -rn "hydrateClaims" src tests` → no matches outside the deleted definition (or only the surviving single call site, depending on the chosen direction).

### Step 2: Prune heldTopics on replayed releases

Ensure whichever single path survives applies `pruneHeldTopic(store, record.prevHolder, topicOf(record.resource))` for every `release` record, including expiry (`from: "system"`) and reclaim records. The live `project()` already does this — confirm the surviving path keeps it.

**Verify**: `cd plugin && bun test tests/store.test.ts` → all pass (existing heldTopics tests still green).

### Step 3: Clear generations and idempotency keys in reset()

Add `store.claimGens.clear()` and `store.idemKeys.clear()` to `reset()`.

**Verify**: `cd plugin && bun check && bun run typecheck` → both clean.

### Step 4: Add regression tests

In `plugin/tests/store.test.ts`, model after the existing `enforceRetention` and claim tests:
1. Double-projection: append claim → renew (same holder) → renew again, capture live `claimGens`; rebuild an equivalent store by replaying the same records through a fresh store (or re-open path the existing tests use) and assert generations match (no extra bump per renewal).
2. Release prune on replay: grant claim on `t/k`, release it, rebuild via the open path, assert the holder's `heldTopics` no longer contains `t` and the board/topics view shows no held topic.
3. Reset: grant a claim (note gen), reset, re-grant same resource and assert the generation restarts at 1; append a msg with `idemKey`, reset, re-post the same key and assert it appends fresh (no stale duplicate suppression) — and conversely that without reset the duplicate is still suppressed.

**Verify**: `cd plugin && bun test tests/store.test.ts` → all pass, including the 3 new tests. Mutation check: revert each fix in turn and confirm the corresponding new test fails.

## Test plan

- New tests listed in Step 4, in `plugin/tests/store.test.ts`.
- Structural pattern: the existing retention/claim tests in the same file (temp root via `fs.mkdtempSync`, fake ctx with `cwd` + timer API).
- Verification: `bun test tests/store.test.ts` → all pass; `bun test tests/room-tool.test.ts tests/attention.test.ts` → all pass (no regressions in claim/delivery behavior).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check` exits 0 with no errors
- [ ] `bun run typecheck` exits 0
- [ ] `bunx --bun @biomejs/biome check src tests` exits 0
- [ ] `bun test tests/store.test.ts` exits 0; the 3 new tests exist and pass
- [ ] `bun test tests/room-tool.test.ts tests/attention.test.ts` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The replay loop, `hydrateClaims`, or `reset()` at the cited locations doesn't match the excerpts (codebase drifted).
- `hydrateClaims` has callers beyond `createStore` that require keeping it (change of approach needed).
- Any step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `tools/room.ts` or changing the R1 fencing contract.

## Maintenance notes

- Future claim-record changes must update exactly ONE projection path now; a reviewer should reject any PR that re-introduces a second claim-application loop on open.
- If a new record kind gains projection state, it must be cleared in `reset()` too — check `reset()` covers every map on the store.
- The fencing-token contract (opt-in `gen`, R1) is unchanged; this plan only fixes its application on replay/reset.
