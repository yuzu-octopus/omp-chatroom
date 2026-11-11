# Plan 024: Escape room-authored text on every model/TUI surface and clamp config floors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat efc5211..HEAD -- plugin/src/cards/tool-cards.ts plugin/src/cards/message-cards.ts plugin/src/panel/board-pane.ts plugin/src/panel/chat-pane.ts plugin/src/panel/panel.ts plugin/src/store/compactor.ts plugin/src/store/config.ts plugin/src/commands/room-command.ts plugin/tests/cards.test.ts plugin/tests/panel.test.ts plugin/tests/config.test.ts plugin/tests/room-command.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `efc5211`, 2026-11-11

## Why this matters

Three model- or transcript-reachable surfaces render room-authored strings without the shared `safeRoomText` escaper: the tool-call cards (`roomCallSummary`/`waitCallSummary` join raw topic/key/resource/from text that persists into transcripts a resumed session replays into context), the panel rows (harness tags and the `<room-authored>` region marker render raw in the human TUI), and the compactor's summarizer input (`recordLine` interpolates raw from/topic/body into the `@smol` summarizer context). Separately, numeric room config accepts any finite number with no floor, so `logMaxRecords=0`, `maxBodyBytes=0`, or negative sweep windows persist as a room-wide denial of service. Each fix is small and display/config-only.

## Current state

- `plugin/src/onboarding/escape.ts` — the ONE escaper: `safeRoomText()` = `escapeHarnessTags(sanitizeText(text))` plus the `<room-authored>` marker fold. Precedent: `tools/room.ts`, `attention/delivery.ts`, `onboarding/digest.ts`, and (at `efc5211`) `commands/room-command.ts` and `tools/wait-for-agent.ts` all use it.
- `plugin/src/cards/tool-cards.ts:55-66` (`roomCallSummary`) and `:76-93` (`waitCallSummary`) join raw args with no escaping; the file has zero `safeRoomText` imports. `plugin/src/cards/message-cards.ts:88` already documents the transcript-replayable shape.
- `plugin/src/panel/chat-pane.ts:96-100` (author/topic/body), `:351-353` (status answers), `plugin/src/panel/board-pane.ts:177-183` (resource text), `plugin/src/panel/panel.ts:520` (roomId) call raw `sanitizeText`, bypassing harness-tag and region-marker neutralisation.
- `plugin/src/store/compactor.ts:129-150` `recordLine` interpolates raw record fields into the summarizer task body (only the `UNTRUSTED_TASK_PREFIX` framing stands between a forged harness block and the shared system-prompt cache entry).
- `plugin/src/store/config.ts:52-70` `coerceConfig` and `plugin/src/commands/room-command.ts:123-131` `coerceSetting` accept any finite number per key with no range floor.
- Conventions: plain `bun:test`, no mocks; assert model-facing `content` arrays; gates `bun check` / `bun run typecheck` / `biome check src tests` / `bun test tests/<file>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (fast) | `cd plugin && bun check` | `No type errors` |
| Typecheck (authority) | `cd plugin && bun run typecheck` | exit 0 |
| Lint | `cd plugin && bunx --bun @biomejs/biome check src tests` | exit 0 |
| Targeted tests | `cd plugin && bun test tests/cards.test.ts tests/panel.test.ts tests/config.test.ts` | all pass |

## Scope

**In scope**:
- `plugin/src/cards/tool-cards.ts`
- `plugin/src/cards/message-cards.ts` (only if it shares the raw-join pattern — read first)
- `plugin/src/panel/board-pane.ts`
- `plugin/src/panel/chat-pane.ts`
- `plugin/src/panel/panel.ts`
- `plugin/src/store/compactor.ts`
- `plugin/src/store/config.ts`
- `plugin/src/commands/room-command.ts` (coerceSetting only)
- `plugin/tests/cards.test.ts`, `plugin/tests/panel.test.ts`, `plugin/tests/config.test.ts`, `plugin/tests/room-command.test.ts` (new tests)

**Out of scope** (do NOT touch):
- `plugin/src/onboarding/escape.ts` — the escaper itself is correct; only call sites change.
- Any change to what the cards/panel DISPLAY (same text, escaped rendering only).
- The summarizer retry/length-floor logic — escape the input lines, keep raw bytes for the length floor.

## Git workflow

- Branch: `advisor/024-escape-and-config-floors`
- Commit per step; conventional commits, e.g. `fix(cards): escape room-authored text in tool call summaries`.
- Do NOT push or open a PR.

## Steps

### Step 1: Escape tool-card call summaries

Import `safeRoomText` in `plugin/src/cards/tool-cards.ts` and apply it to every room-authored arg in `roomCallSummary` (op, topic, key, limit label) and `waitCallSummary` (agent ids, resource, from, mention flag label). Keep the join structure identical.

**Verify**: `cd plugin && grep -n "safeRoomText" src/cards/tool-cards.ts` → import + usages present; `bun check` → clean.

### Step 2: Route panel room text through safeRoomText

Replace `sanitizeText` with `safeRoomText` for room-authored panel fields: `board-pane.ts` resource rows, `chat-pane.ts` author/topic/body/status rows, `panel.ts` roomId. Keep `sanitizeText` only where the value is host-owned (theme-provided labels, not room data) — read each call site before changing it.

**Verify**: `cd plugin && grep -n "sanitizeText" src/panel/*.ts` → only host-owned sites remain; `bun check` → clean.

### Step 3: Escape compactor summarizer input

Run the compactor's block lines through `escapeHarnessTags` (not the full `safeRoomText`, which would alter measured bytes — keep raw bytes for the 5%-floor length check) before task assembly in `compactor.ts`. The summaries themselves stay as the model wrote them.

**Verify**: `cd plugin && bun test tests/tree.test.ts` → all pass (compactor behavior unchanged on benign input).

### Step 4: Clamp numeric config to sane floors

Add a per-key min/max table in `plugin/src/store/config.ts` (counts ≥ 1, ms windows ≥ a sane floor, e.g. sweep ≥ 1000, TTL within the existing 1s–24h clamp, token budgets ≥ 1) applied in `coerceConfig`, and mirror it in `room-command.ts coerceSetting` for `config set`. Log or report which field was clamped (a `pi.logger.warn` in coerceConfig, a warning line in `config set` output). Document the floors in `plugin/README.md`'s config table.

**Verify**: `cd plugin && bun test tests/config.test.ts tests/room-command.test.ts` → all pass.

### Step 5: Add regression tests

1. `tests/cards.test.ts`: a call summary with topic/key containing `<room-authored` and harness-like tags renders escaped (assert raw marker absent, `&lt;` present).
2. `tests/panel.test.ts`: a chat/board row with a forged author/topic renders escaped.
3. `tests/config.test.ts`: `logMaxRecords: 0`, `maxBodyBytes: 0`, negative `claimSweepMs` all clamp to floors (assert effective values, not defaults confusion).
4. Compactor: a block containing harness-like text still summarizes (assert summary exists and input framing intact) — model after existing compactor tests using the test seam.

**Verify**: `cd plugin && bun test tests/cards.test.ts tests/panel.test.ts tests/config.test.ts tests/tree.test.ts` → all pass including new tests. Mutation check: restore one raw call site / remove one clamp and confirm the corresponding test fails.

## Test plan

- New tests listed in Step 5 across `tests/cards.test.ts`, `tests/panel.test.ts`, `tests/config.test.ts`, `tests/tree.test.ts` (compactor input case).
- Structural patterns: the existing forged-marker board test in `tests/room-command.test.ts` (efc5211) for assertion style (`not.toContain('<room-authored')` + `toContain('&lt;room-authored')`).
- Verification: targeted suites green; full `bun test tests/` green at the end.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check` exits 0, `bun run typecheck` exits 0, `biome check src tests` exits 0
- [ ] New escape tests exist in cards + panel suites and pass
- [ ] New config-floor tests exist and pass
- [ ] Compactor test with adversarial input passes
- [ ] `bun test tests/` exits 0 (full suite)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any cited call site doesn't match the excerpts (drifted).
- A panel `sanitizeText` site turns out to be host-owned data where `safeRoomText` would double-escape — keep `sanitizeText` there and note it.
- Escaping changes a snapshot/pinned rendering the suite asserts — read the failing test before touching it; if the pinned text is the unescaped form, the test needs updating to the escaped form (say so in the report).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Every NEW model- or transcript-reachable surface must use `safeRoomText` from day one; reviewers should grep for bare `sanitizeText` on room-authored data in PRs.
- The compactor escape uses `escapeHarnessTags` deliberately (byte measurement); if the length floor ever changes to measured-escaped bytes, revisit.
- Config floors live in one table — a new numeric key must add its row there and in the README table.
