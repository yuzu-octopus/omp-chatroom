# Plan 027: Use the store config instead of re-reading it from disk per op

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/store/config.ts plugin/src/tools/room.ts plugin/src/store/room-store.ts plugin/src/commands/room-command.ts plugin/tests/config.test.ts plugin/tests/room-tool.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (coordinate with plan 024: it also touches `coerceConfig`/`coerceSetting` — if both run, land 024's clamp table first, then rebase this plan's small config-surface change onto it)
- **Category**: perf
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

Every tool op and every delivery pass re-reads `config.json` from disk (`readFileSync` + `JSON.parse` plus symlink checks) even though the open store already holds the parsed config in `store.config`. At swarm cadence a post pays the disk read twice (once for the op, once for the fan-out pass) plus once per `read`/`board`/`topics`/`recall` — synchronous I/O on the host thread beside the fsync path. Using the in-memory config with reload only on config-writing paths removes per-op disk I/O with no behavior change.

## Current state

- `plugin/src/store/config.ts:147-149` — `resolveRoomConfig(_pi, root)` just calls `loadRoomConfig(root)` (disk read + parse + `assertRoomWritePath` checks).
- `plugin/src/tools/room.ts:553` — `deliverPass` calls `resolveRoomConfig(pi, store.root)` per pass; the op path calls it per execute (find the `resolveRoomConfig` call in the op dispatcher — grep first).
- `plugin/src/store/room-store.ts:186` — `createStore` loads the config ONCE into `store.config`; `saveRoomConfig` is the only writer.
- Conventions: `bun:test`, no mocks; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/config.test.ts tests/room-tool.test.ts tests/attention.test.ts tests/e2e-room.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/store/config.ts` (resolve path + reload-on-save only)
- `plugin/src/tools/room.ts` (use `store.config` in `deliverPass` + op path only)
- `plugin/src/commands/room-command.ts` (`/room config set` refresh of the live store only)
- `plugin/tests/config.test.ts` (new tests)

**Out of scope** (do NOT touch):
- Default values, coercion rules, validation (plan 024 owns floors).
- The on-disk format, paths, symlink guards, migration.
- Delivery selection logic, digest, governor caps consumption (they read the passed `config` object — unchanged).

## Git workflow

- Branch: `advisor/027-store-config-live`
- Commit per step; conventional commits, e.g. `perf(config): use in-memory store config per op`.
- Do NOT push or open a PR.

## Steps

### Step 1: Make the store config the live value

Change `deliverPass` and the op dispatcher in `tools/room.ts` to use `store.config` directly instead of `resolveRoomConfig(pi, store.root)`. Keep `resolveRoomConfig` exported (tests and the command path reference it) but make it the fallback/reload entry: after any `saveRoomConfig` (i.e. `/room config set`), reload into `store.config` so the live value follows the file. Simplest shape: in the `config set` handler, after saving, assign `store.config = loadRoomConfig(store.root)`.

**Verify**: `cd plugin && bun check && bun test tests/room-tool.test.ts tests/attention.test.ts` → all pass.

### Step 2: Prove the disk read is gone

Add a test in `tests/config.test.ts`: spy on `fs.readFileSync` (or count `loadRoomConfig` calls via a counter the test injects — check existing config tests for the established seam first) and assert a post + delivery pass performs zero config-file reads after open, while `/room config set` still changes the effective value for the next op.

**Verify**: `cd plugin && bun test tests/config.test.ts` → all pass including the new test. Mutation check: temporarily restore the `resolveRoomConfig` call in `deliverPass` → the zero-read test fails.

## Test plan

- One new test in `tests/config.test.ts` per Step 2 (zero disk reads per op/pass; set-still-applies).
- Structural pattern: existing config tests in the same file (temp root, `saveRoomConfig`, fake ctx).
- Verification: `bun test tests/config.test.ts tests/room-tool.test.ts tests/e2e-room.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] Zero-config-read test exists and passes
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- Any caller depends on live file re-reads between ops (e.g. hand-edited config mid-session) — report it instead of silently changing the semantic; the plan assumes save-path reload is the only mutation route.
- Plan 024 changed the same functions incompatibly — rebase onto it first; if the combination is unclear, stop and report.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `store.config` is now the live value; any future config mutation must go through the save path that refreshes it.
- A hand-edited `config.json` takes effect on next session open (unchanged from today — the file was already only read at open/op time, never watched).
