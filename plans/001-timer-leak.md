# Plan 001: Stop the managed-timer leak in `roomTimers.stop`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/room-store.ts plugin/tests/store.test.ts`
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

`roomTimers.stop()` clears host-scheduled timers with the bare global
`clearInterval` instead of `ctx.clearTimer`. The host's `ManagedTimers.clear()`
does two things: it removes the handle from its internal `#timers` set AND
calls the global clear. Calling only the global stops the callback but leaves
a dead handle in the host's set forever — one entry per room root per timer
(prune + claim sweep), never released, even after the store is evicted. This
is the only place in `src/` that clears a managed timer incorrectly; the
compactor (`compactor.ts:251`) and every wait tool already use the captured
`clearTimer` pattern this plan copies.

## Current state

- `plugin/src/store/room-store.ts` — owns the refcounted store, the
  `roomTimers` registry, and the retention/sweep jobs (lines 279–309).
- `plugin/tests/store.test.ts` — store tests; model new tests on its timer
  tests if any, else on `tests/wait-tools.test.ts` fake-ctx style.

Excerpts (live code at `room-store.ts:287-308`):

```ts
const TIMERS = globalMap<string, Timer[]>("__roomTimers");

export const roomTimers: RoomTimerRegistry = {
  start(root: string, ctx: ExtensionContext): void {
    if (TIMERS.has(root)) return;
    const store = STORES.get(root);
    if (store === undefined) return;
    TIMERS.set(root, [
      ctx.setInterval(() => {
        enforceRetention(store, Date.now());
      }, PRUNE_INTERVAL_MS),
      ctx.setInterval(() => {
        expireStale(store, Date.now());
      }, store.config.claimSweepMs),
    ]);
  },
  stop(root: string): void {
    const handles = TIMERS.get(root);
    if (handles === undefined) return;
    for (const handle of handles) clearInterval(handle);  // <-- BUG: bare global, leaves host set entry
    TIMERS.delete(root);
  },
};
```

The host contract (`node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/managed-timers.ts`,
`clear()`):

```ts
clear(timer: Timer): void {
  if (!this.#timers.delete(timer)) return;
  clearInterval(timer);
  clearTimeout(timer);
}
```

The repo convention is the compactor's captured-clearer pattern: capture
`ctx.clearTimer?.bind(ctx)` at `start` and call it at `stop`, because holding
the `ctx` and calling `ctx.clearTimer` later is unsafe (`stop` can fire after
the owning session is gone and the ctx's timer API is torn down). Exemplar:
`plugin/src/store/compactor.ts:243-281`. Match it.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json` (exit 0),
`bun test tests/` (all pass), `bunx --bun @biomejs/biome check src tests` (clean).
Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(panel): publish the injected theme to the host chrome modules`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/store.test.ts`            | all pass, including 2 new tests  |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/store/room-store.ts`
- `plugin/tests/store.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/store/compactor.ts` — already correct; reference only.
- Any other timer call site — all already use `ctx.clearTimer`.
- `plugin/src/store/room-store.ts` dispose/refcount logic beyond the timer entry shape.

## Git workflow

- Branch: `advisor/001-timer-leak`
- One commit: `fix(store): clear room timers through the host's clearTimer, not the bare global`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the timer entry to capture the clearer

In `plugin/src/store/room-store.ts`, change `TIMERS` from
`globalMap<string, Timer[]>` to an entry holding the captured clearer plus
handles, following `compactor.ts:243-255` exactly:

```ts
interface RoomTimerEntry {
  clearTimer: (handle: Timer) => void;
  handles: Timer[];
}
const TIMERS = globalMap<string, RoomTimerEntry>("__roomTimers");
```

In `start()`: capture `const clearTimer = ctx.clearTimer?.bind(ctx);` and
return early (no timers) if it is `undefined`, mirroring
`compactor.ts:267-268` (`if (clearTimer === undefined) return;`). Store
`TIMERS.set(root, { clearTimer, handles: [...] })`.

In `stop()`: delete the entry FIRST (a throwing clearer must not strand it —
same ordering as `compactor.ts:279`), then call
`entry.clearTimer(handle)` for each handle.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Add regression tests

In `plugin/tests/store.test.ts`, add two tests:

1. `roomTimers.stop` calls the captured `clearTimer` once per handle. Drive
   with a fake ctx whose `setInterval` returns distinct sentinel handles and
   whose `clearTimer` records its arguments. Call `roomTimers.start(root,
   fakeCtx)`, then `roomTimers.stop(root)`, and assert both sentinels were
   passed to `clearTimer`. Must clean up the global registry in `finally`
   (`roomTimers.stop(root)` again is a safe no-op).
2. `roomTimers.start` with a ctx lacking `clearTimer` schedules nothing and
   does not throw (the I4 rule: never a raw timer; no timer API → no job).

**Verify**: `timeout 500 bun test tests/store.test.ts` → all pass.

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean.

## Test plan

- The two new tests in `plugin/tests/store.test.ts` (see Step 2).
- No new test files. The existing suite is the regression net; it runs the
  real `start`/`stop` paths through `roomStoreFor`/`disposeRoomSession` in
  `store.test.ts` and `e2e-room.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -rn "clearInterval(" plugin/src/` returns no matches (use `grep -rn "clearInterval" plugin/src/store/room-store.ts` → empty)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `room-store.ts:287-308` doesn't match the excerpt (drift).
- The host's `ManagedTimers.clear()` in the installed
  `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/managed-timers.ts`
  no longer deletes from `#timers` before clearing (assumption broken — the
  leak may already be fixed upstream).
- `ctx.clearTimer` is absent on the real host `ExtensionContext` type (the
  `?.bind` guard then schedules no timers at all in production).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a third background job is ever added to `roomTimers.start`, it inherits
  the captured clearer automatically — no change needed.
- Reviewer: scrutinize that `stop()` deletes before clearing (a throwing
  clearer must not strand the entry) and that `start()` with no timer API
  leaves no entry in `TIMERS` (otherwise `stop` is a no-op against a phantom
  entry while the caller assumes jobs run).
- Deferred: the same `TIMERS`-style registry could be unified with
  `COMPACTORS`, but that merge is cosmetic and out of scope here.
