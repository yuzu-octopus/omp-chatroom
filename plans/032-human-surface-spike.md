# Plan 032: Human surface gaps (recall/tree for operators, recallMiss aggregate)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/commands/room-command.ts plugin/src/tools/room.ts plugin/tests/room-command.test.ts plugin/tests/room-tool.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (spike/prototype — see below)
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

`RoomOp` ships 12 ops but `/room` exposes only board/join/claim/release/post/config — read/topics/mute/tree/zoom/recall have no human surface, so the R10-deferred retrieval story is model-only and undiscoverable for operators. Separately, `recallMiss:true` on zero-match recalls feeds the agreed embeddings revisit trigger (`~1e5` records or cannot-find-it failures), yet no op, board column, or command aggregates the miss rate — the trigger is unreadable without hand-scanning JSONL.

## Current state

- `plugin/src/commands/room-command.ts:26` — `ROOM_SUBCOMMANDS = ["board","join","claim","release","post","config"]`; each subcommand reuses the `report()` output channel (`:67-75`, no-op notify outside a UI).
- `plugin/src/tools/room.ts:82-94` — 12 ops incl. `read`/`topics`/`mute`/`tree`/`zoom`/`recall`; `recallMiss` declared at `room.ts:163`, counted at `:1492-1501`.
- `docs/research/embeddings/CONCLUSION.md:35`, `AGENTS.md:275` — the revisit trigger both this plan and executors must honor: embeddings stay deferred unless the trigger fires.
- Conventions: `bun:test`, no mocks; `/room` output goes through `report()`; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/room-command.test.ts tests/room-tool.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/commands/room-command.ts` (prototype passthroughs ONLY for recall + tree/zoom read paths + `config reset`; see Step 1)
- `plugin/src/tools/room.ts` (read-only aggregate for recallMiss rate ONLY — a pure function over the log, no new op unless the spike justifies it)
- `plugin/tests/room-command.test.ts`, `plugin/tests/room-tool.test.ts` (spike tests)

**Out of scope** (do NOT touch):
- Building the full deferred retrieval tool (R10 stays deferred — this is a read-only spike).
- Write paths from the human surface beyond `config reset` (no human post/claim/release changes).
- Mute/tree/zoom interactive UX (list the open questions, don't design them here).
- Changing the embeddings trigger or conclusion.

## Git workflow

- Branch: `advisor/032-human-surface-spike`
- Commit per step; conventional commits, e.g. `spike(room): prototype recall passthrough for operators`.
- Do NOT push or open a PR.

## Steps

### Step 1: Prototype read-only passthroughs (recall + tree/zoom + config reset)

Add `/room recall <pattern>`, `/room tree`, `/room zoom <lo> <hi>`, and `/room config reset` reusing the existing `report()` channel and the tool path's validation/bounds (recall pattern caps, zoom range validation). List the mute/tree/zoom UX open questions in the plan file as comments (e.g. how mute state displays, whether zoom needs paging) WITHOUT answering them. `config reset` restores defaults for the room (via the save path, so the live store refreshes — coordinate with plan 027 if it landed).

**Verify**: `cd plugin && bun test tests/room-command.test.ts` → all pass.

### Step 2: Prototype the recallMiss aggregate (read-only)

Write a pure function (e.g. `recallMissRate(store, window)`) returning miss rate over non-empty-log recalls with window + gap handling noted (retention gaps shift the denominator — document the choice, don't solve it perfectly). Expose it on the `/room recall` output footer or the board — one line, read-only. This is a SPIKE: if the window/gap semantics prove too murky, record the open questions and stop — do not invent semantics.

**Verify**: `cd plugin && bun test tests/room-tool.test.ts` → all pass; new aggregate test with a mixed hit/miss recall history asserts the rate.

## Test plan

- Spike tests: recall passthrough (pattern validation + bounded output), tree/zoom passthrough (valid + invalid ranges), config reset (effective values back to defaults), miss-rate aggregate (mixed history → expected rate).
- Structural patterns: existing `/room` command tests in `tests/room-command.test.ts`.
- Verification: `bun test tests/room-command.test.ts tests/room-tool.test.ts` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check`, `bun run typecheck`, `biome check src tests` exit 0
- [ ] Prototype passthroughs work and are tested (recall, tree, zoom, config reset)
- [ ] Miss-rate aggregate exists as a pure function with a test, OR the murkiness is documented with open questions and the aggregate is marked deferred
- [ ] Mute/tree/zoom UX open questions listed, not designed
- [ ] `bun test tests/` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Cited code doesn't match excerpts (drifted).
- The recall/tree/zoom tool paths can't be reused from the command context without threading session state the command doesn't have — report the shape mismatch instead of duplicating the logic.
- The miss-rate window/gap semantics have no clean answer — document and defer, don't invent.
- This starts growing beyond a spike (new UX, write paths, retrieval tool) — stop, report scope pressure, and mark what remains for a follow-up plan.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If the spike is adopted, the follow-up plan must answer the listed UX questions with the human's input (mute display, zoom paging, recall output caps).
- The miss-rate aggregate is the embeddings trigger's instrument — if it ever fires per the agreed trigger, the embeddings conclusion gets revisited through its stated process, not through this spike.
- R10 stays deferred regardless of this spike's outcome.
