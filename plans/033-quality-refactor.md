# Plan 033: Quality refactor — bounded state, one wait kernel, safe delivery, deterministic gates

> Executor note: this record documents the orchestrated rewrite round at base `e4c1044`.
> It is a status/verification record, not a work order; the dispatch contracts carried the
> exact code changes. Orchestrator verifies all gates once on the integrated tree.

## Status

- Priority: P1
- Effort: L
- Risk: MED (durability, delivery, and public tool contracts)
- Category: bug + perf + tech-debt + tests
- Planned at: commit `e4c1044`, 2026-11-18

## Vetted findings and slices

1. Storage — bounded replay drops durable claim generations / idempotency keys /
   membership / cursor facts once their records leave the tail. Slice: append a compact
   projection snapshot through the existing write path; replay the snapshot as data through
   `project()`; old logs keep working. Owner: `RewriteReplayState`.
2. Waits — `wait_for_claim` ignores the authoritative grant after a foreign winner releases;
   OR waits/refill cycle checks false-positive on diamonds; store failures were inconsistently
   reported. Slice: settle on own-name grants, OR-safe cycle mode, uniform `isError` for genuine
   store failures; keep `wait_for_agent`'s documented registry-only degradation. Owners:
   `FixClaimWaits`, `RewriteWaits`.
3. Compaction — an in-flight summary could republish a node after retention invalidation.
   Slice: generation-fence tree handles. Owner: `RewriteCompactionSafety`.
4. Delivery — replay gaps reuse an anchor `seq`, but seq was used as record identity in
   `classBySeq`, admitted/batch/floor sets. Retention's own appended gap can keep the
   projection one over the cap, self-perpetuating notices. Slice: key classification by
   `record.id`; include the gap in the prune budget. Orchestrator-owned corrective wave
   after `RewriteHumanModelParity` releases `tools/room.ts`.
5. Human/model parity — duplicate claim/post mutation paths in `/room` vs tool. Slice:
   one internal helper; viewer creation, field caps, and contended-record accounting fixed.
   Owner: `RewriteHumanModelParity`.
6. Cards — raw room-authored `holder` / `error` / `claim.resource` reached ANSI and native
   cards. Slice: escape once in result summaries. Owner: `RewriteCards`.
7. Gates/release — unpinned `bunx tsc`/biome, MIT text absent from the installed plugin,
   misleading e2e test name, duplicate `omp.version`. Slice: pin exact tools via local bins,
   ship LICENSE, real-loop test or honest rename, one version field. Owner: `RewritePackaging`.

## Explicitly not in scope

- Cross-process / worker-thread room redesign (architectural; documented limit).
- Changing room ops, wait outcomes, log record shape for existing records, host pin, or theme.
- New dependencies except exact `typescript` for the typecheck gate.
- Live omp/model/TUI probes (human-only per AGENTS.md).

## Verification gates

- `cd plugin && bun ci --frozen-lockfile` (lockfile drift)
- `bun check` — 0 errors
- `bun run typecheck` — 0 errors using the pinned local compiler
- `bun run lint` — clean using the pinned local biome
- `bun run test:halves-a` and `bun run test:halves-b` (never concurrent)
- Fresh independent reviewers on the integrated diff before push
- Marketplace catalog `version` matches the plugin package version after release

## Status log

- 2026-11-18: six audits, 10 rewrite/repair waves, and three independent reviewers complete.
  Gates green: `bun check` 0, `bun run typecheck` 0, `bun run lint` clean,
  halves-a 302 pass / 1 skip, halves-b 387 pass, 19 files total; committed as `8410ede`.
