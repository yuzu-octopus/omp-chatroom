# Plan 016: Spike — a harness that proves a real model reaches for the room unprompted

> **Executor instructions**: This is a SPIKE, not a build plan. Timebox the
> investigation to ~2 hours. Follow the steps, answer the open questions with
> evidence, and end with a build/no-build recommendation — do not build the
> harness. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/tools/room.ts plugin/tests/e2e-room.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S (spike only)
- **Risk**: LOW (no production change; may spend model budget on probes — see Step 2 cap)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

Every verification so far proves the room works WHEN CALLED — tool results,
delivery, panel rendering, wait semantics. Nobody has proven a real model
with no room instruction will REACH for `room{op:"claim"}` when a task
mentions a shared file. The tool description was rewritten around discovery
vocabulary ("before editing a shared file, check the board and claim"),
but whether BM25-over-description actually selects it is untested belief.
If models don't discover the room, the product is a library nobody imports.
A repeatable harness (prompt → run → assert `room` called with `op:claim`
before the first edit) turns the core product bet into a measured number.

## Current state

- `plugin/src/tools/room.ts:41-55` — `ROOM_DESCRIPTION`, rewritten for
  discovery ("Triggers: before editing a shared file or step check the
  board, then claim the resource…").
- `plugin/src/tools/room.ts:56` — `ROOM_LOAD_MODE = "essential"` (RISK R3).
- `plugin/tests/e2e-room.test.ts` — multi-session harness via the host's
  `createAgentSession`, but every test drives tools DIRECTLY
  (`toolOf(a, "room").execute(...)`) — no test lets a model choose.
- Claimed-but-unverified in prior session notes: "a real model choosing to
  call the room unprompted" is on the known-unverified list.
- Blocker at audit time: no API key in this environment
  (`omp --mode text` failed with "Could not restore model"). The spike must
  establish whether a keyed model is even reachable before designing anything.

Repo verification commands (for probes only): `bunx --bun tsc --noEmit -p
tsconfig.json`, `bun test tests/`, all from `plugin/`. Runtime is Bun; never
node/npm/npx.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Key check | `timeout 120 omp --mode text "reply with exactly: pong" 2>&1 \| tail -3` | model reply (or the key error, recorded) |
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0 (spike must not break it) |

Run from anywhere for the key check, from `plugin/` for the typecheck.

## Scope

**In scope** (investigate; throwaway probes in /tmp only):
- Host model-driving surface: `createAgentSession` prompt options,
  `registerCustomApi` (the fake-LLM seam the tests use), tool-call
  observability (how to assert WHICH tool a model turn called).
- `plugin/tests/e2e-room.test.ts` harness shape (read-only).

**Out of scope**:
- Building the harness (the spike recommends; a follow-up plan builds).
- Any `src/` or `tests/` modification.
- Prompt-engineering the room description (that's what the harness would
  MEASURE; don't pre-optimize blind).

## Git workflow

- Branch: `advisor/016-discovery-spike`
- No commit expected. Report only.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Answer Q1 — is a keyed model reachable, and which one?

Run the key check. Record: exact command, exact output tail, exit code, and
which model answered (or the exact key error). If no model is reachable,
SKIP Step 2 (no spend without a model), answer Q2 from code reading only,
and make the recommendation conditional ("blocked on /login; design is
ready").

**Verify**: reachability verdict + evidence recorded.

### Step 2: Answer Q2 — what is the minimal harness shape? (spend-capped)

Budget: at most ~5 model turns. Design (don't build) the minimal loop:

1. Temp project dir with a shared file.
2. Prompt mentioning the shared file, with NO room instruction and no room
   vocabulary (the prompt must not say "claim"/"board"/"coordinate" — else
   the test measures prompt-following, not discovery).
3. Run a real model turn with the room tool registered.
4. Assert from the turn transcript: `room` called with `op:"claim"` naming
   the shared file BEFORE any edit tool touched it.

Answer from code reading (+ at most 2 probe turns if a model is reachable):
(a) which host API surfaces the turn's tool calls for assertion
(`createAgentSession` return? session transcript entries?); (b) whether the
fake-LLM seam (`registerCustomApi`) can script a deterministic "model" that
calls `room` (useful for CI) vs. needing a live model (useful for truth);
(c) where the harness would live (`tests/` with a live-model gate env var?
a separate `scripts/` probe?).

**Verify**: three sub-answers (a/b/c) with file:line or API evidence.

### Step 3: Answer Q3 — what does the harness decide?

Define the decision the harness output drives: e.g. "if <50% of N=10
discovery trials claim before editing, the description/tool-shape needs work
before any agent-UX feature; if >80%, discovery is solved and effort moves
to coordination semantics." Pick concrete thresholds and trial counts with
cost notes (N live turns ≈ $X at current pricing — estimate coarsely or say
unknown).

**Verify**: thresholds + trial count + cost note recorded.

### Step 4: Write the recommendation

One of: (a) build the harness (scope: which of unit-scripted vs live-model
first, rough M estimate); (b) don't build (state the holding reason, e.g.
"discovery will be measured in production via claim-rate logging instead" —
only if you ground that alternative); (c) blocked on model access (report
the blocker, keep the design). Report to the reviewer; update the plan row
to DONE with the letter in one line.

**Verify**: recommendation letter + ≤10-line rationale in the report.

## Test plan

- Spike: no tests. Verification is an untouched tree (`git status` clean
  apart from the status row).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Q1/Q2/Q3 answered in the report with evidence
- [ ] Recommendation letter (a/b/c) recorded
- [ ] Model spend ≤5 turns (report the actual count, even if 0)
- [ ] No repo modifications outside `plans/README.md` (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The key check reveals model access but each turn costs far beyond a
  spike budget (record the pricing signal, stop spending, answer Q2 from
  code alone).
- The host offers no programmatic access to a turn's tool calls (the
  harness may be unbuildable as specified — report with the API evidence).
- The 2-hour timebox expires — report partial answers with what's missing.

## Maintenance notes

- If the maintainer picks (a), the follow-up build plan must include a
  prompt-frozen golden file: the discovery prompt is the instrument and must
  not drift between runs, or the metric is meaningless.
- Reviewer: the spike's most valuable output may be Q2(b) — a deterministic
  scripted-model harness that runs in CI would subsume several e2e timing
  tests over time. Weigh that in the build decision.
- Never record API keys, tokens, or model credentials anywhere in the
  report — reachability verdicts only.
