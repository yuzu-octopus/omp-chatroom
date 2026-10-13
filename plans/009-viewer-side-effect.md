# Plan 009: Stop auto-creating roster members on every read/board/topics call

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/tools/room.ts plugin/tests/room-tool.test.ts plugin/tests/e2e-room.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`viewerFor()` (`room.ts:143-156`) inserts a fresh `MemberState` into
`store.members` as a side effect whenever the caller has no entry — and it
is called at the top of nearly every op (`read`, `board`, `topics`, `claim`,
`post`, `mute`, …). So any agent that runs `room{op:"board"}` once, without
ever joining, permanently appears in the roster, the digest's member count,
and `notifyRecipients`' recipient set. The roster is supposed to answer "who
is in the room"; today it answers "who ever touched the room". The `join` op
goes out of its way to check membership BEFORE calling `viewerFor`
(`room.ts:515-523`, with a comment explaining why) — this plan extends that
discipline to the read paths: viewing state for classification is fine, but
it must not mint roster membership.

## Current state

- `plugin/src/tools/room.ts:143-156`:

```ts
export function viewerFor(store: RoomStore, agentId: string): MemberState {
  const existing = store.members.get(agentId);
  if (existing) return existing;
  const fresh: MemberState = {
    agentId,
    joinedAtSeq: store.seq,
    topics: new Set(),
    muted: new Set(),
    threadRoots: new Set(),
    heldTopics: new Set(),
  };
  store.members.set(agentId, fresh);  // <-- the side effect
  return fresh;
}
```

- Callers (grep `viewerFor` in `src/`): `room.ts` read/board/topics/claim/
  post/mute/unmute handlers, `notifyRecipients` (`room.ts:337`),
  `wait-for-claim.ts:142` (sets `waitedResource` — NEEDS the write),
  panel `#viewer` has its own copy (no store write — the good pattern).
- The `join` guard (`room.ts:515-524`): `const isNewMember =
  !store.members.has(agentId); const viewer = viewerFor(...); if (isNewMember)
  store.append({kind:"member",...})` — the one call site that reasons about
  the side effect explicitly.
- `digest.ts:95-99` documents that `store.members` is a monotonic lifetime
  counter nothing prunes; the digest header deliberately reports the live
  registry count instead. This plan shrinks the counter's growth; it does not
  change the digest.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(room): read ops no longer mint roster membership`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/room-tool.test.ts tests/e2e-room.test.ts` | all pass, including 3 new tests |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/tools/room.ts`
- `plugin/tests/room-tool.test.ts`
- `plugin/tests/e2e-room.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/tools/wait-for-claim.ts` — its `viewerFor` call legitimately
  needs the write (`waitedResource` must persist); leave it.
- `plugin/src/store/room-store.ts` member map or `project()` — no schema change.
- Pruning `store.members` on leave/expiry — a separate lifecycle question;
  this plan only stops the creation side.
- `plugin/src/commands/room-command.ts` — it doesn't call `viewerFor`; leave it.

## Git workflow

- Branch: `advisor/009-viewer-side-effect`
- Two commits: (1) `refactor(room): split viewerFor into lookup and ensure`
  (2) `fix(room): read ops no longer mint roster membership`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split lookup from creation

In `plugin/src/tools/room.ts`:

1. Add a pure lookup next to `viewerFor`:

   ```ts
   /** Read-only viewer state for classification; never mints membership. */
   export function viewerStateFor(store: RoomStore, agentId: string): MemberState {
     return (
       store.members.get(agentId) ?? {
         agentId,
         joinedAtSeq: store.seq,
         topics: new Set(),
         muted: new Set(),
         threadRoots: new Set(),
         heldTopics: new Set(),
       }
     );
   }
   ```

   (Same fresh-state shape as `viewerFor` today — copy it exactly.)

2. Keep `viewerFor` (create-if-absent) for the writers: `join`, `claim`
   (needs `heldTopics.add` to persist), `post` (needs `lastMessageId`/
   `topics.add` to persist), and the existing `wait-for-claim.ts` caller.

3. Switch the pure readers to `viewerStateFor`: `read`, `board`, `topics`,
   `mute`, `unmute` handlers. For `mute`/`unmute`: they call
   `muteTopic(store, agentId, …)` → `memberFor(store, agentId)` in
   `governor.ts:251-264` — check what `memberFor` does for a missing member
   FIRST (grep it). If `memberFor` also mints, route mute/unmute through the
   same decision: muting without joining should either create the member
   (a mute IS state worth keeping — defensible) or no-op with a hint to
   join. Pick "create" (a stored mute is harmless and unsurprising) and say
   so in the commit message — but do NOT change `governor.ts`; only decide
   the `room.ts` call path.

4. `notifyRecipients` (`room.ts:337`): `viewerFor(store, target)` runs per
   recipient per post. Switch to `viewerStateFor` — delivery classification
   must not mint members for every registry ref that was never in the room.
   (This is the highest-volume mint site: the recipient set includes every
   live registry ref.)

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Add regression tests

In `plugin/tests/room-tool.test.ts` (model on the existing op tests driving
the tool `execute` or the store directly — use whichever the file's `read`
tests use):

1. `board` by a never-joined agent does not add to `store.members`
   (assert `store.members.has("ghost") === false` after the call).
2. `read` by a never-joined agent does not add to `store.members`, and still
   returns records (viewing works; membership doesn't mint).
3. `post` by a never-joined agent DOES create the member (writers keep the
   ensure behavior — pins the split, not just the read half).

**Verify**: `timeout 500 bun test tests/room-tool.test.ts tests/e2e-room.test.ts` → all pass.

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean. Expect some existing
tests to need fixture updates if they asserted member counts after read-only
ops — update the FIXTURE (join first), never weaken the assertion.

## Test plan

- The three new tests from Step 2.
- Structural pattern: the existing `room-tool.test.ts` op tests (temp-root
  store, drive `execute`, assert on `store.members`/`details`).
- Existing-test fallout is EXPECTED here (fixtures that relied on the mint);
  each fix must make the fixture join explicitly, matching production's
  intended flow.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -n "viewerStateFor" plugin/src/tools/room.ts` returns ≥5 matches (def + read call sites + notifyRecipients)
- [ ] `grep -n "viewerFor(store" plugin/src/tools/room.ts` shows only `join`/`claim`/`post` (+ the def)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `memberFor` in `governor.ts` mints members AND mute/unmute tests depend on
  post-mute membership in a way the "create" decision breaks — report the
  interaction instead of changing `governor.ts` (out of scope).
- More than ~5 existing tests fail after the split (the mint may be load-
  bearing somewhere unexpected — report the list, don't bulldoze).
- `wait-for-claim.ts`'s `viewerFor` import breaks (it must keep working —
  you didn't change the export, but verify).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The rule going forward: `viewerStateFor` for classification, `viewerFor`
  for mutation. A reviewer should reject new `viewerFor` call sites that
  never write to the returned member.
- This plan shrinks `store.members` growth but doesn't prune it — the digest
  comment (`digest.ts:95-99`) about the monotonic counter stays true, just
  slower. Member lifecycle (leave/expiry pruning) is still open; see plan 015.
- If a future op needs "ensure member AND know if it was new" (like `join`),
  copy the `join` guard shape (`has` check before ensure), don't re-derive it.
