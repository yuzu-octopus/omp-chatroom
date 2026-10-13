# Plan 007: Give `/room claim`/`release`/`post` the delivery pass the tool path has

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/commands/room-command.ts plugin/src/tools/room.ts plugin/tests/room-command.test.ts plugin/tests/e2e-room.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/004-nan-ttl.md (it owns adjacent lines in the claim handler; run 004 first to avoid merge conflicts)
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

The human command path (`/room claim|release|post`) appends records directly
to the log but never runs the delivery pass — no `notifyRecipients`, no
`heldTopics` bookkeeping, no `lastMessageId`. Three concrete consequences:
(1) a `wait_for_claim` waiter is never woken by a `/room release` — the only
way it resolves is its own 60 s sweep timeout; (2) no agent is ever steered
or notified about a human's post/claim, so the room and the agents disagree
about what was announced; (3) `/room claim` never marks `heldTopics`, so the
human holder's own follow-up classification differs from a tool claim's. The
command path is a second, quieter writer to the same log, and every silent
write is a coordination miss the plugin exists to prevent.

## Current state

- `plugin/src/commands/room-command.ts:218-301` — the `claim`, `release`,
  and `post` handlers. Each appends (via `grant`/`release`/`store.append`)
  and reports; none notifies. Excerpt (`claim`, lines 231-246):

```ts
const result = grant(store, resource, agentId, ttlMs);
if (!result.ok) {
  report(ctx, pi, `room claim ${safe(resource)} → denied, held by ${safe(result.holder)}`, "warning");
  return;
}
report(ctx, pi, `room claim ${safe(resource)} → granted, expires in ${Math.round(ttlMs / 1000)}s`);
return;
```

- `plugin/src/tools/room.ts:318-382` — `notifyRecipients(pi, ctx, store,
  records, actorId)`, currently module-private (`async function`, not
  exported). The four tool call sites: post (`room.ts:598`), claim
  (`room.ts:629`), release-reclaim (`room.ts:660`), release (`room.ts:680`).
- `plugin/src/tools/room.ts:628` — `viewer.heldTopics.add(topic)` on tool
  claim; `room.ts:596-597` — `lastMessageId` + `topics.add` on tool post.
  The command path does post's bookkeeping partially (`room-command.ts:295-299`
  sets `lastMessageId`/`topics` only if the member exists) and claim's not at
  all.
- Type facts verified at plan time: `ExtensionCommandContext extends
  ExtensionContext` (host `types.ts:605`), so the command handler's `ctx can
  be passed wherever `notifyRecipients` wants an `ExtensionContext`.
  `notifyRecipients` also takes `pi: ExtensionAPI`, which the handler has.

Repo conventions: `notifyRecipients` never throws out of `execute` (failures
surface as `deliveryError`); the command path reports via
`report(ctx, pi, message, type)`. A delivery failure on the command path
should be a second `report(..., "warning")` line, never a throw.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(command): run the delivery pass on /room claim/release/post`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/e2e-room.test.ts`         | all pass, including 2 new tests  |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/tools/room.ts` (export `notifyRecipients` + `appendedSince`; no behavior change)
- `plugin/src/commands/room-command.ts` (`claim`, `release`, `post` handlers only)
- `plugin/tests/e2e-room.test.ts` (new tests; the file already drives multi-session flows)
- `plugin/tests/room-command.test.ts` (only if plan 004 created it and the new tests fit better there)

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/commands/room-command.ts` `board`/`join`/`config` handlers.
- `plugin/src/attention/*` — no governor change; this plan only calls the
  existing pass.
- Unifying the tool and command implementations into shared handlers — tempting,
  larger, riskier; explicitly deferred. This plan duplicates the three call
  sites (call, don't copy the pass itself).

## Git workflow

- Branch: `advisor/007-command-delivery`
- Two commits: (1) `refactor(room): export notifyRecipients for the command path` (2) `fix(command): run the delivery pass on /room claim/release/post`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export the delivery pass (no behavior change)

In `plugin/src/tools/room.ts`:

1. Change `async function notifyRecipients(` to `export async function notifyRecipients(`.
2. Change `function appendedSince(` to `export function appendedSince(`.
3. Add a one-line doc comment on `notifyRecipients` noting the command path
   is the second caller and the function must stay throw-free (the command
   handler has no `deliveryError` envelope; a throw would surface as an
   unhandled rejection in the TUI).

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0; then
`timeout 500 bun test tests/` → 213+ pass (proves the export alone changed
nothing).

### Step 2: Wire the three command handlers

In `plugin/src/commands/room-command.ts`, import both functions from
`../tools/room` and mirror the tool call sites:

- **claim** (after a successful `grant`, `room-command.ts:231`): capture
  `const before = store.seq` BEFORE `grant` (same as `room.ts:619-620`),
  then after success run
  `const failure = await notifyRecipients(pi, ctx, store, appendedSince(store, before), agentId);`
  and add `viewer.heldTopics.add(topic)` via the existing viewer lookup
  pattern (the post handler's `store.members.get(agentId)` guard at
  `room-command.ts:295` is the local exemplar — but note the tool path uses
  `viewerFor`, which creates the member; match the command file's existing
  guard style, do not import `viewerFor`). If `failure` is defined, add
  `report(ctx, pi, \`delivery: ${failure}\`, "warning")`.
- **release** (both the reclaim path at `:263` and the plain path at `:275`):
  same `before`/`appendedSince`/`notifyRecipients` shape, mirroring
  `room.ts:655-691`.
- **post** (after `store.append` at `:294`): notify with `[record]`,
  mirroring `room.ts:598`.

Keep every existing `report` line byte-identical; only ADD the delivery
call and the optional delivery-warning line.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 3: Add end-to-end regression tests

In `plugin/tests/e2e-room.test.ts` (model on the existing multi-session
wait tests with `createAgentSession` + `toolOf`):

1. `/room release` wakes a `wait_for_claim` waiter: session A claims via the
   tool; session B starts `wait_for_claim`; invoke the command handler with
   `release <topic> <key>` as A; assert B's wait resolves
   `{outcome:"event", acquired:true}` promptly (race against a 2 s sleep,
   same pattern as the existing claim/release wait tests).
2. `/room post` with a mention advances a `wait_for_message(mention:true)`
   waiter (or, if driving the handler plus a waiter in one test proves
   awkward, assert the recipient session received a `room:mention` custom
   message — model on the attention T0 tests).

To invoke the command handler in tests, capture it from a fake `pi` passed
to `registerRoomCommand` (it calls `pi.registerCommand(name, {handler})` —
record the handler). The handler's `ctx` needs `roomStoreFor(ctx)` to work:
`cwd`, `agent.id`, `localProtocolOptions` — model on `wait-tools.test.ts`'s
`newSession` fake or the e2e harness's session ctx, whichever fits.

**Verify**: `timeout 500 bun test tests/e2e-room.test.ts` → all pass.

### Step 4: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean.

## Test plan

- The two new tests in `plugin/tests/e2e-room.test.ts` (see Step 3).
- Structural pattern: the existing `wait_for_claim` event tests in the same
  file (two sessions, one waits, the other acts, race-against-sleep
  assertion).
- Step 1's full-suite run is the no-behavior-change proof for the export.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -n "notifyRecipients" plugin/src/commands/room-command.ts` returns ≥3 matches
- [ ] `grep -n "export async function notifyRecipients" plugin/src/tools/room.ts` returns 1 match
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `notifyRecipients`'s signature at `room.ts:318-324` doesn't match
  `(pi, ctx, store, records, actorId)` (drift — the wiring shape may be wrong).
- The command handler's `ctx` fails typecheck where an `ExtensionContext`
  is expected (the `extends` fact was verified at plan time against host
  18.8.6; a host bump may have changed it).
- Driving the command handler in tests requires host surface that doesn't
  exist headless (e.g. `ctx.ui` beyond `notify`) — report the blocker
  instead of inventing a parallel harness.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- The tool/command duplication this plan extends (three more parallel call
  sites) is tech debt with a name: if a fourth writer appears, unify behind
  one `performClaim`/`performRelease`/`performPost` module instead of adding
  a fourth copy. A reviewer should hold that line.
- The `heldTopics` asymmetry (plan 002 prunes on release) applies equally to
  the command path once this plan adds the bookkeeping — no extra work.
- Reviewer: scrutinize that the command path can never throw out of the
  delivery call (the handler has no result envelope; an unhandled rejection
  in a TUI command is silent).
