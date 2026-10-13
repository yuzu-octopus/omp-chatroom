# Plan 017: Spike — replace the single-writer assumption with a cross-process story

> **Executor instructions**: This is a SPIKE, not a build plan. Timebox the
> investigation to ~2 hours. Follow the steps, answer the open questions with
> evidence, and end with a build/no-build recommendation — do not implement
> locking, watching, or merging. If anything in the "STOP conditions" section
> occurs, stop and report. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/log.ts plugin/src/store/room-store.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S (spike only)
- **Risk**: LOW (throwaway probes in /tmp; no production change)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

The room's durability story assumes one writer: `appendLine` relies on
`O_APPEND` atomicity within a process, `store.seq` is an in-memory counter,
and the projection (`records`, `claims`, `cursors`) lives in `globalThis`
maps. Two `omp` processes on the same project directory — the documented
"large agent swarm" future, and today's reality whenever a user opens a
second session — will interleave appends with colliding seqs, and neither
process will see the other's records until restart (no re-read path exists).
The failure mode is silent divergence, not an error. Before any swarm story
is credible, the cross-process behavior needs a decision: lock it (second
writer fails loudly), watch it (re-read on change), or merge it (seqs become
content-addressed). A spike with a colliding-writers probe grounds that
decision.

## Current state

- `plugin/src/store/log.ts:27-41` — `appendLine`: `O_APPEND` + `fsyncSync`;
  comment claims atomicity, correctly for bytes, not for seqs.
- `plugin/src/store/room-store.ts:127-144` — `append()`: `seq = store.seq +
  1` minted in memory, then written. No inter-process coordination.
- `plugin/src/store/room-store.ts:180-191` — replay runs ONCE at
  `createStore`; no code path re-reads the log for records appended by
  another process.
- `plugin/src/store/log.ts:43-55` — `readAllLines` reads the whole file;
  usable as a re-read primitive, but nothing calls it post-open.
- Stated-but-undelivered signal: the product direction is "large agent
  swarms" (repo brief); the architecture section of AGENTS.md documents the
  store as authoritative with no cross-process story.

Repo verification commands (for probes only): `bunx --bun tsc --noEmit -p
tsconfig.json`, `bun test tests/`, all from `plugin/`. Runtime is Bun; never
node/npm/npx.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Probe     | `timeout 120 bun /tmp/collide-probe.ts`               | colliding-seqs demonstration (see Step 1) |
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0 (spike must not break it) |

Run from `plugin/` so `@oh-my-pi/*` resolves.

## Scope

**In scope** (investigate; throwaway probes in /tmp only):
- `plugin/src/store/log.ts`, `plugin/src/store/room-store.ts` (read-only)
- Host primitives for file watching or locking, if any (grep the installed
  host for `watch`, `flock`, `lockfile` — read-only)

**Out of scope**:
- Implementing any locking/watching/merging.
- Changing the log format or seq semantics.
- Any `src/` or `tests/` modification.

## Git workflow

- Branch: `advisor/017-multiprocess-spike`
- No commit expected. Report only.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Answer Q1 — demonstrate the collision (probe, /tmp only)

Write `/tmp/collide-probe.ts` (must NOT be committed) that:

1. Creates one temp root.
2. Opens TWO stores on it in separate `bun` processes (spawn with
   `Bun.spawn`, or simulate with two `storeFor` calls after
   `resetRoomStores` — but processes are the honest version; do processes).
3. Has each process append 20 records.
4. Prints: seqs per process, duplicate seqs in the merged log, and whether
   either process's in-memory projection contains the other's records.

Expected outcome: duplicate seqs and mutually invisible records. If the
outcome differs (e.g. Bun dedupes the fd, or something re-reads), that IS
the finding — record the mechanism with evidence.

**Verify**: probe output recorded (duplicate seqs: yes/no + counts).

### Step 2: Answer Q2 — lock, watch, or merge?

Evaluate three options against the probe evidence, one paragraph each with a
rough effort (S/M/L) and the failure mode it leaves:

- **Lock**: second `roomLogFd` opener fails loudly (lockfile or `flock`).
  Check: does Bun/Node expose `flock` on Linux here? Is there an existing
  dep for lockfiles, or is it ~20 lines on `O_CREAT|O_EXCL`? What breaks for
  the legitimate second session (read-only observer mode?).
- **Watch**: re-read the log on change (`fs.watch` + `readAllLines` delta)
  and merge into the projection. Check: who owns seq minting then (max-seen
  + 1 per append? a lock around mint?). What happens to in-flight waiters
  when foreign records arrive?
- **Merge**: seqs become per-process-unique (e.g. `seq` stays local, log
  order becomes the identity). Check: how many `seq` consumers assume
  density (`zoom` bounds? cursor arithmetic? `cover`?). Count them with grep
  — that count IS the cost estimate.

**Verify**: three paragraphs, each with effort + residual failure mode.

### Step 3: Write the recommendation

One of: (a) implement option X first (name it, with the minimal scope);
(b) document single-writer as a hard constraint (where: AGENTS.md +
  `roomLogFd` comment + a loud error on second open — note this is still a
  small build); (c) leave as-is (state the holding reason, e.g. "swarms run
  in one process for the foreseeable future"). Report to the reviewer;
update the plan row to DONE with the letter in one line.

**Verify**: recommendation letter + ≤10-line rationale in the report.

## Test plan

- Spike: no tests. Verification is an untouched tree (`git status` clean
  apart from the status row) and the probe output in the report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Q1/Q2 answered in the report with probe output + file:line evidence
- [ ] Recommendation letter (a/b/c) recorded
- [ ] Probe lived in /tmp and was not committed
- [ ] No repo modifications outside `plans/README.md` (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The probe shows NO collision (something already coordinates writers) —
  that contradicts the audit's core premise; report the mechanism with
  evidence and stop.
- Evaluating an option requires designing a log-format migration — that's
  an L-spike on its own; name it and stop rather than half-designing it.
- The 2-hour timebox expires — report partial answers with what's missing.

## Maintenance notes

- If the maintainer picks (b) (document + loud error), the follow-up is an
  S plan: the error must name the competing root and suggest the read-only
  alternative — a bare "already open" will confuse.
- Reviewer: weight this against the product direction honestly. If swarms
  stay single-process for a year, (c) with a dated revisit note beats (a).
  The spike's job is to make that call explicit, not to sell (a).
- Whatever is picked, the `O_APPEND`-atomicity comment in `log.ts` should
  gain one sentence on what it does and doesn't cover (bytes vs seqs) —
  fold that into the follow-up, not this spike.
