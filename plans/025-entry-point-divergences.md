# Plan 025: Stop entry-point and lookup divergences (claim deps, idempotency, wait edges)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/commands/room-command.ts plugin/src/tools/room.ts plugin/src/store/wait-graph.ts plugin/src/store/cursors.ts plugin/tests/room-command.test.ts plugin/tests/room-tool.test.ts plugin/tests/wait-tools.test.ts`
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

Four paths that must agree don't. The `/room claim` command path ignores `dependsOn` while the tool path enforces dependency refusal, so a command-created claim silently violates the ordering the board displays. The idempotency lookup is an O(N) `store.records.find` and, when the referenced record was pruned, falls through to a duplicate post that double-wakes mentioned peers — the exact failure R7 exists to prevent. The wait cycle check returns null when no edge map exists for the root (first waiter can never detect a cycle it closes) and `wait_for_message` records no edge for filterless waits, so topic/mention waits are invisible to later cycle checks. A `persistOwnCursor` entry with NaN, negative, or far-future seq is accepted and bumps the live cursor past owed records or into arithmetic poison.

## Current state

- `plugin/src/commands/room-command.ts:213-276` — `case "claim"` parses `topic key [ttlMs]` and calls `grant(store, resource, agentId, ttlMs)` with no dependency list; compare `plugin/src/tools/room.ts:1191-1208`, which validates `p.dependsOn` via `overListCap` and passes it to `grant()`.
- `plugin/src/tools/room.ts:1125-1150` — idempotency block: `store.idemKeys.get(...)` → `store.records.find((r) => r.seq === priorSeq)`; on dangle it falls through to append. Should use `store.byId` (keyed by record id) or keep a seq→record index; on a dangling reference it must NOT append a same-key duplicate silently.
- `plugin/src/store/wait-graph.ts:67-74` — `findWaitCycle` returns null when `WAIT_EDGES.get(root)` is undefined. `plugin/src/tools/wait-for-message.ts:224` — `setWaitEdges` only when `from !== undefined`.
- `plugin/src/store/cursors.ts:115-136` — `isCursorData` checks only `typeof seq === "number"`; `plugin/src/onboarding/hook.ts:117-120` bumps the cursor to any higher persisted value.
- Conventions: `bun:test`, no mocks; fake ctx with `cwd` + timer API; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/room-command.test.ts tests/room-tool.test.ts tests/wait-tools.test.ts tests/store.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/commands/room-command.ts` (claim path only)
- `plugin/src/tools/room.ts` (idempotency lookup only)
- `plugin/src/store/room-store.ts` (only if a seq→record index is needed — prefer `byId`-based fix inside room.ts)
- `plugin/src/store/wait-graph.ts`
- `plugin/src/tools/wait-for-message.ts` (edge recording only)
- `plugin/src/store/cursors.ts` (isCursorData only)
- `plugin/src/onboarding/hook.ts` (only the resume-bump guard, if needed — prefer fixing in isCursorData)
- `plugin/tests/room-command.test.ts`, `plugin/tests/room-tool.test.ts`, `plugin/tests/wait-tools.test.ts`, `plugin/tests/store.test.ts` (new tests)

**Out of scope** (do NOT touch):
- The R3 dependency rule, R7 contract, or R4 graph semantics — only their application at these sites.
- Delivery, digest, panel, compactor, tree.
- Changing the `wait_for_message` match semantics (from/topic/mention filters stay as-is).

## Git workflow

- Branch: `advisor/025-entry-point-divergences`
- Commit per step; conventional commits, e.g. `fix(room): command claim path enforces dependencies`.
- Do NOT push or open a PR.

## Steps

### Step 1: Enforce claim dependencies on the /room command path

Extend `/room claim` parsing to accept an optional dependency list (e.g. `claim <topic> <key> [ttlMs] [dependsOn...]` — check the command's existing arg style first and match it), validate with the same `overListCap` rule the tool path uses, pass it to `grant()`, and surface the same refusal (naming blocker + holder) plus the same `contended` measurement record on loss. Document the syntax in the command help text.

**Verify**: `cd plugin && bun test tests/room-command.test.ts` → all pass.

### Step 2: Make the idempotency lookup index-based and dangle-safe

Replace the `store.records.find((r) => r.seq === priorSeq)` linear scan with an O(1) lookup. Simplest correct shape: keep `idemKeys` mapping to the record's `id` (or add a seq→record map maintained in `append`/projection and cleared on retention prune/reset). On a dangling reference (key present, record gone — pruned by retention), do NOT silently append a duplicate: return `{ok:false}` with an error naming the key (the retry must mint a fresh key), matching the existing "key reused for different parameters" error style. Update `reset()`/retention handling consistently (plan 023 owns `reset()` clearing — coordinate: if plan 023 already landed, build on it; if not, keep this plan's change local and note the interaction).

**Verify**: `cd plugin && bun test tests/room-tool.test.ts` → all pass.

### Step 3: Fix first-waiter and filterless cycle detection

In `findWaitCycle`, treat a missing edge map as an empty map (continue the walk from the requester's own targets) instead of returning null. In `wait-for-message.ts`, record an edge for filterless waits too (`{ kind: "message" }` with no `from` — check `candidatesOf` handles a `message` target with no `from` first; if it doesn't, extend it so a filterless wait is satisfiable by any message sender, and add the edge only in that consistent form).

**Verify**: `cd plugin && bun test tests/wait-tools.test.ts` → all pass.

### Step 4: Bound the persisted cursor resume

Harden `isCursorData` to require a finite, non-negative integer within a sane range (e.g. `Number.isInteger(seq) && seq >= 0`), so NaN/negative/far-future-hostile values are ignored. The hook then needs no change (it only bumps on `persisted > cursorFor`, and a hostile far-future value is still a concern — cap the bump at `store.seq`, i.e. never resume past the log head).

**Verify**: `cd plugin && bun test tests/onboarding.test.ts tests/store.test.ts` → all pass.

### Step 5: Add regression tests

1. Command deps: `/room claim` with an unmet dependency is refused naming blocker+holder; with deps free it grants. Mutation: drop the `dependsOn` argument → test fails.
2. Idempotency: retry with same key + same params returns the original (existing tests cover); prune the original via retention, retry, and assert `{ok:false}` naming the key instead of a duplicate append. Assert no O(N) scan remains (grep the lookup path — a reviewer check, not a test).
3. Cycle: first-waiter cycle detected (two agents, first wait closes the loop via holder graph); filterless `wait_for_message` participates in a later cycle check.
4. Cursor: hostile persisted entries (NaN, -5, 1e15) are ignored on resume; a persisted value above `store.seq` caps at the head.

**Verify**: targeted suites green; each new test fails when its fix is reverted.

## Test plan

- New tests per Step 5 in the four listed test files, following existing patterns in each (fake ctx, temp roots, real timers where the wait tests use them).
- Verification: `bun test tests/room-command.test.ts tests/room-tool.test.ts tests/wait-tools.test.ts tests/store.test.ts tests/onboarding.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` all exit 0
- [ ] The 4 groups of new tests exist and pass
- [ ] `grep -n "records.find((r) => r.seq" plugin/src/tools/room.ts` → no matches (index-based lookup)
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited code doesn't match the excerpts (drifted).
- `candidatesOf` cannot express a filterless message target without semantic changes — stop and report the shape instead of redefining match semantics.
- The idempotency fix requires changing the R7 contract (e.g. touching `hydrateClaims` beyond plan 023) — coordinate/report rather than duplicate plan 023.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The command and tool claim paths must stay in lockstep: any new claim option must land on both, with refusal text identical.
- The idem index must be maintained everywhere records leave the projection (retention prune, reset) — reviewers should check both on any projection change.
- Wait-edge recording is part of adding any new wait flavor: no edge, no cycle detection.
