# Plan 002: Prune `heldTopics` so released claims stop promoting topics to T1 forever

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/claims.ts plugin/src/store/room-store.ts plugin/src/attention/tiers.ts plugin/tests/attention.test.ts plugin/tests/room-tool.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`MemberState.heldTopics` is documented as "topics with a claim held within
1 h" (`room-store.ts:20`), but nothing ever removes an entry: `claim` adds
(`room.ts:628`), and no release path, expiry path, or timer deletes. Worse,
the "1 h" window has no implementation anywhere — the set is a permanent
record of every topic the agent ever claimed. `classify()` (`tiers.ts:24`)
returns T1 for any message on a held topic, so a busy agent permanently
escalates an ever-growing topic set from cursor-only T2 to interrupt-class
T1. The fix is cheap: drop the topic when its last claim by that holder ends,
and correct the comment to describe the real rule.

## Current state

- `plugin/src/store/room-store.ts:20` — `heldTopics: Set<string>` with the
  fictional "within 1 h" comment.
- `plugin/src/tools/room.ts:628` — the only writer: `viewer.heldTopics.add(topic)`.
- `plugin/src/store/claims.ts:49-62` — `release()` appends the record and
  promotes waiters; touches no viewer state.
- `plugin/src/attention/tiers.ts:24` — `if (viewer.heldTopics.has(record.topic)) return "T1";`
- `plugin/tests/attention.test.ts:245-246` — a test comment asserts "the
  window has already pruned `heldTopics`", which no code does; the test only
  passes because it constructs the pruned set by hand.

Excerpts:

```ts
// room-store.ts:20
heldTopics: Set<string>; // topics with a claim held within 1 h (§5.1 N1)
```

```ts
// claims.ts:49-62
export function release(
  store: RoomStore,
  resource: string,
  holder: string,
  reason: ReleaseReason,
  prevHolder: string = holder,
): boolean {
  const existing = store.claims.get(resource);
  if (existing === undefined || existing.holder !== holder) return false;
  store.append({ kind: "release", from: holder, resource, reason, prevHolder });
  resolveWaiters(store, resource, existing.ttlMs);
  return true;
}
```

Note the constraint this plan must respect: `claims.ts` imports `RoomStore`
type-only ("breaks the runtime cycle", `claims.ts:2`). Any new helper that
touches `store.members` must either live in `room-store.ts` or accept the
member map as a parameter. Keep the cycle broken.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(attention): prune heldTopics when a holder's last claim on a topic ends`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/attention.test.ts tests/room-tool.test.ts` | all pass, including 3 new tests |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/store/claims.ts`
- `plugin/src/store/room-store.ts`
- `plugin/src/attention/tiers.ts` (comment only, if the rule text is restated there)
- `plugin/tests/attention.test.ts`
- `plugin/tests/room-tool.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/tools/room.ts` claim/release handlers — no call-site change needed.
- `plugin/src/commands/room-command.ts` — plan 007 covers the command path.
- Any time-based windowing implementation — explicitly rejected below; the
  rule is claim-liveness, not wall-clock.

## Git workflow

- Branch: `advisor/002-held-topics`
- One commit: `fix(attention): prune heldTopics when a holder's last claim on a topic ends`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prune on release inside the arbiter

The rule: when a claim on `"<topic>/<key>"` ends (release, expiry, reclaim —
all three funnel through a `release` projection), remove `topic` from the
holder's `heldTopics` **iff the holder holds no other live claim whose
resource starts with `"<topic>/"`**.

Concretely:

1. In `room-store.ts`, add an exported helper next to `project()` (it must
   live here or take the member map as a param — never import `room-store.ts`
   at runtime from `claims.ts`):

   ```ts
   export function pruneHeldTopic(store: RoomStore, holder: string, topic: string): void {
     for (const claim of store.claims.values()) {
       if (claim.holder === holder && claim.resource.startsWith(`${topic}/`)) return;
     }
     store.members.get(holder)?.heldTopics.delete(topic);
   }
   ```

   Note `project()` in `room-store.ts` already handles `release` records
   (deleting from `store.claims`); call `pruneHeldTopic` from the `release`
   arm of `project()` AFTER the delete, deriving `topic` from the record's
   `resource` up to the first `/` (same split as `topicOf` in `tiers.ts`).
   Placing it in the projection covers `release()`, `expireStale()`, AND
   `reclaimIfStale()` (all append `release` records) with one call site.

2. Change the `heldTopics` comment at `room-store.ts:20` to describe the real
   rule, e.g. `topics on which this agent holds a live claim (§5.1 N1)`.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Add regression tests

In `plugin/tests/room-tool.test.ts` (model on the existing claim/release
tests using `grant`/`release` against a temp-root store):

1. `release` removes the topic from the holder's `heldTopics` when it was
   their last claim on that topic.
2. `release` keeps the topic when the holder still holds another claim on
   the same topic (`build/a` released, `build/b` held → still T1).
3. Expiry path: a claim dropped by `expireStale` also prunes (call
   `expireStale(store, now + ttl + 1)` with no waiters, then assert the prune).

In `plugin/tests/attention.test.ts`, fix the misleading comment at
`attention.test.ts:245` ("the window has already pruned") to reference the
liveness rule.

**Verify**: `timeout 500 bun test tests/attention.test.ts tests/room-tool.test.ts` → all pass.

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean.

## Test plan

- The three new tests in `plugin/tests/room-tool.test.ts` (see Step 2).
- Structural pattern: the existing `expireStale`/`reclaimIfStale` tests in
  `room-tool.test.ts` (direct arbiter calls against a `storeFor` temp-root
  store, `Date.now()`-based TTL math).
- The misleading `attention.test.ts:245` comment corrected to the liveness rule.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -rn "within 1 h" plugin/src/` returns no matches
- [ ] `grep -rn "heldTopics.delete\|heldTopics.clear" plugin/src/` returns ≥1 match
- [ ] `grep -n "^import" plugin/src/store/claims.ts` shows no runtime import of `./room-store` (type-only only)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `project()` release arm in `room-store.ts` doesn't delete from
  `store.claims` before any post-processing point you can hook (the
  "no other live claim" check would then see the just-released claim).
- Any caller constructs a `release` record WITHOUT going through `project()`
  (e.g. direct `store.claims.delete`) — the prune would miss a path and the
  rule needs re-scoping.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Future claim-lifecycle changes (new release reasons, lease transfer) get
  the prune for free as long as they append a `release` record — that is the
  invariant to preserve. A reviewer should reject any new path that mutates
  `store.claims` without appending.
- Explicitly deferred: a time-based "recently held" window. The spec text
  ("within 1 h") suggests one, but no consumer needs recency — T1 promotion
  while holding is the documented intent (§5.1 N1: "claim held on topic"),
  and a window would need a sweeper nobody wants to own. If recency is ever
  wanted, it belongs on `expireStale`'s sweep, not here.
