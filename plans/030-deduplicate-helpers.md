# Plan 030: Deduplicate formatters, helpers, and constants

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/tools/room.ts plugin/src/commands/room-command.ts plugin/src/attention/delivery.ts plugin/src/attention/governor.ts plugin/src/onboarding/digest.ts plugin/src/tools/wait-for-agent.ts plugin/src/tools/wait-for-claim.ts plugin/src/tools/wait-for-message.ts plugin/src/store/config.ts plugin/src/cards/tool-cards.ts plugin/tests/room-command.test.ts plugin/tests/room-tool.test.ts plugin/tests/wait-tools.test.ts plugin/tests/config.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
- **Status note (2026-11-11)**: Step 1 LANDED as `45adb41` + `59293f2` (approved partial — one `buildBoard` scan, `claimLine`/`rosterLine`/`topicLine` shared row helpers, byte-stable human output). Step 2 STOPPED correctly: `renderLine` bakes in the K17 `[Tn] room ⟵` badge and requires a tier the recall/zoom/read call sites don't have, so no byte-identical wrapper exists — verified by live probe over all 9 record kinds against pinned tests in room-tool/onboarding/tree suites. STEPS 2–5 BELOW ARE SUPERSEDED by the revised Step 2R (field-selection switch) + deferred Steps 3–5 (see Status section).
- **Category**: tech-debt
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

The same logic lives in 2–4 places and the copies have already drifted: the human `/room board` vs the model `board` lines differ (contended-count vs waiting-list, uncapped vs capped); three record-line formatters (`recordLine` ×2, `renderLine`, `roomBodyOf` uses) must all change for one new record kind; four `clamp` copies, three timeout-constant schemes, two config-coercion policies, and a panel that imports from the 1520-line dispatch module. Every duplicated rule is a future bug where one copy is fixed and the others aren't (the escape audit already proved this class bites).

## Current state

- `plugin/src/commands/room-command.ts:78-120` `boardLines` (human: counts, `contended().length`, uncapped) vs `plugin/src/tools/room.ts:366-395` `boardLines` (model: waiting lists, dependsOn, capped at `DIGEST_CLAIMS_CAP`/`ROSTER_CAP`).
- `plugin/src/tools/room.ts:336` `recordLine`, `plugin/src/attention/delivery.ts:377` `renderLine`, `plugin/src/onboarding/digest.ts` backlog rendering, `plugin/src/store/compactor.ts:129` `recordLine` — four kind-switches over the same records.
- `clamp` copies in `room.ts:443`, `wait-for-agent.ts:61`, and siblings; `WAIT_*` (agent/message, 30s default) vs `CLAIM_WAIT_*` (claim, 20s default) in `wait-for-claim.ts:35-37`; `coerceSetting` (room-command.ts:123) vs `coerceConfig` (config.ts:52).
- `plugin/src/panel/panel.ts:21`, `room-command.ts:20`, `hook.ts:27` import `appendedSince`/`notifyRecipients` from `tools/room.ts`.
- Conventions: `bun:test`, no mocks; K11 (declared-once helpers); gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/room-command.test.ts tests/room-tool.test.ts tests/wait-tools.test.ts tests/config.test.ts tests/cards.test.ts tests/panel.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/commands/room-command.ts` (boardLines wrapper + coerceSetting only)
- `plugin/src/tools/room.ts` (canonical boardLines/recordLine/clamp exports only — no dispatch changes)
- `plugin/src/attention/delivery.ts` (renderLine/roomBodyOf only)
- `plugin/src/attention/governor.ts` (only if selectT1 needs the shared line helper)
- `plugin/src/onboarding/digest.ts` (backlog line helper only)
- `plugin/src/store/compactor.ts` (recordLine only)
- `plugin/src/store/config.ts` (shared coerce helper only — coordinate with plan 024's clamp table)
- `plugin/src/tools/wait-for-agent.ts`, `wait-for-claim.ts`, `wait-for-message.ts` (timeout constants only)
- `plugin/src/cards/tool-cards.ts` (only if it duplicates a clamp/format helper)
- New shared module ONLY if no existing home fits (prefer `store/` or `attention/` ownership per K11; justify the location in one line)
- The listed test files (convergence tests)

**Out of scope** (do NOT touch):
- Splitting `room.ts` itself (explicitly rejected as too risky — extract helpers, don't restructure the dispatcher).
- Panel's import of `tools/room.ts` internals beyond moving the shared helpers it uses into the new home (panel keeps working through re-exports if needed — no behavior change).
- Timeout DEFAULT values (20s claim vs 30s agent/message are contract — unify names/scheme, not values).
- Board content differences that are deliberate (human uncapped vs model capped stays; only the row SHAPE converges).

## Git workflow

- Branch: `advisor/030-deduplicate-helpers`
- Commit per step; conventional commits, e.g. `refactor(board): single boardLines with human/model wrappers`.
- Do NOT push or open a PR.

## Steps

### Step 1: Converge boardLines (one canonical + thin wrappers)

Keep the tool-path `boardLines(board)` canonical (it carries caps + waiting/dependsOn). Rebuild the command path as a thin wrapper: `buildBoard(store, viewer)` → canonical lines, with the human additions (header counts, `contended` count) that don't change the model shape. Human output keeps its header; model output keeps its caps. No row-shape divergence beyond the deliberate header/cap difference.

**Verify**: `cd plugin && bun test tests/room-command.test.ts tests/room-tool.test.ts` → all pass.

### Step 2: Converge the record-line formatters

One kind-switch: keep `renderLine(record, safeBody, tier)` + `roomBodyOf(record)` in `delivery.ts` canonical; reimplement `recordLine` (room.ts), the digest backlog line, and the compactor `recordLine` as thin wrappers over the same two functions. New-kind coverage follows automatically. Byte-identical output on all existing tests is the gate.

**Verify**: `cd plugin && bun test tests/room-tool.test.ts tests/attention.test.ts tests/onboarding.test.ts tests/tree.test.ts tests/cards.test.ts` → all pass.

### Step 3: Unify clamp, timeouts, and config coercion

One `clamp(value, lo, hi)` (keep `room.ts`'s as canonical, others import it). One timeout scheme: shared `clampTimeout` + naming with explicit `CLAIM_WAIT_DEFAULT_TIMEOUT_MS` alias preserving the 20s value, `WAIT_DEFAULT_TIMEOUT_MS` preserving 30s. One `coerceValue(key, raw)` in `store/config` used by both `coerceConfig` and `coerceSetting` (coordinate with plan 024's floors — the shared helper applies the shared table).

**Verify**: `cd plugin && bun test tests/config.test.ts tests/room-command.test.ts tests/wait-tools.test.ts` → all pass; `grep -rn "const clamp" plugin/src` → exactly one definition.

### Step 4: Move shared delivery helpers out of tools/room.ts

Move `appendedSince`, `owedFloorFor`, `viewerStateFor`/`viewerFor`, and the `RecordLine`-level helpers into `store/` or `attention/` (K11 home TBD by the executor — one line of justification), re-exported from `tools/room.ts` if external importers need them. Panel/hook/command imports switch to the new home. No behavior change; the dispatcher stays whole.

**Verify**: `cd plugin && bun test tests/panel.test.ts tests/room-command.test.ts tests/onboarding.test.ts` → all pass; `grep -n "from \"../tools/room\"\|from \"./room\"" plugin/src/panel/panel.ts plugin/src/commands/room-command.ts plugin/src/onboarding/hook.ts` → no hits (or only re-export hits).

### Step 5: Add convergence tests

For each converged helper: a test asserting both call sites produce the same output for the same input (board lines for a fixed store; record lines for every record kind incl. gap/delivered/contended/wait; clamp/timeout/coerce vectors). These fail if a copy is reintroduced.

**Verify**: full `bun test tests/` green; revert one convergence (restore one local copy) → its test fails.

## Test plan

- Convergence tests per Step 5 in the existing test files for each surface (board → room-command/room-tool tests; lines → attention/cards tests; clamp/timeout/coerce → config/wait tests).
- Structural patterns: existing tests in each file; assertion style from the efc5211 forged-marker tests.
- Verification: targeted suites + full suite green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] Exactly one `clamp`, one board-line canonical, one record-line switch (`grep` checks in plan)
- [ ] Convergence tests exist and pass
- [ ] Timeout default VALUES unchanged (20s claim / 30s others — assert in tests)
- [ ] `bun test tests/` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- Any output byte changes (board text, record lines, clamped values) vs base — behavior change is a STOP; report the divergence.
- Plan 024 changed the same helpers incompatibly — rebase onto it first; if unclear, stop and report.
- Moving a helper creates a runtime import cycle (room-store ↔ tools/room is a known cycle boundary) — stop and report the cycle instead of working around it with lazy imports.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- K11 (declared once) now covers these helpers — reviewers should reject new local copies on sight.
- The dispatcher stays whole deliberately; revisit a split only with a dedicated plan and the suite as oracle.
- New record kinds get exactly one new switch arm (delivery.ts) — the wrappers follow for free.
