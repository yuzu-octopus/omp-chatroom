# Consolidated adversarial review — round 2

Date 2026-10-06. 8 new lenses (B1-B8) on the post-fix `PLAN-build.md`.
**Result: 30 of 33 round-1 fixes verified correct; 12 new defects found (2 critical, 6 major, 4 minor).**

Round 2 deliberately used different lenses from round 1 (fix-regression, first-principles rebuild,
phase executability, end-to-end trace, ops reality, test validity, fix re-verification, requirements
traceability) so it would not simply re-derive known ground.

## CRITICAL

| # | Lens | Defect | Evidence | Fix |
|---|---|---|---|---|
| C-1 | B1, B5 | `gap.reason` union is `"retention"` only, but the S3 fix emits `reason:"invalid"` — the schema rejects its own validation path. TypeScript error. | `PLAN-build.md:265` vs `:336` | Widen to `"retention" \| "invalid" \| "corrupt"` |
| C-2 | B3 | The 11 manifest settings are **unreachable from extension code**. `PluginManifest.settings` is real (`plugins/types.ts:47-48`) but read only by the CLI (`plugin-cli.ts:898+`); the reader `getPluginSettings` is a loader function (`plugins/loader.ts:482`), not on `ExtensionAPI`. `lookup()` resolves *core* ids, not plugin settings. | verified in source | Revert my earlier R6 "correction": plugin settings need an owned `local://room/config.json` + `/room config` + `registerFlag` fallback |

## MAJOR

| # | Lens | Defect | Fix |
|---|---|---|---|
| M-1 | B1 | §5.1's predicate says "hold/held a claim" with no time bound; the ambiguous-case table introduces a 1 h window. Contradiction. | Add the window to the predicate, or drop it from the case table |
| M-2 | B1, B5 | Read policy does not specify `seq` assignment for a skipped line, nor for the `gap` record. A skip can desynchronise every later `seq` → cursor corruption. | Specify: only successfully parsed records consume a `seq`; the `gap` record gets the next available |
| M-3 | B3 | `tsconfig.json` contents unspecified — P0 blocker | Add §2.3 with exact options |
| M-4 | B3 | `__roomTest` imported in §11.1 but never defined — P0/P8 blocker | Specify the export in `src/index.ts` |
| M-5 | B3 | `src/index.ts` factory behaviour unspecified ("wires everything") | Specify what it registers |
| M-6 | B3 | `src/ids.ts` three functions unspecified | Give signatures + impls |
| M-7 | B4 | `wait_for_claim` auto-acquire semantics unspecified: "resolved" vs "granted the lease" | State it + the re-queue case |
| M-8 | B4 | `claim` record tier for a *non-holder waiter* unspecified → defaults to T2 → a blocked contender gets no push | Add "you are waiting on this resource" as a T1 signal |
| M-9 | B6 | §11.2 claims 5 assertions; §11.1 makes 3. `expect(winner).not.toBe("TIMEOUT")` passes even when the resolution value is wrong. First-writer-wins and root-sharing claimed but not asserted. | Make the test assert the §11.2 table |
| M-10 | B7 | 6 round-1 fixes present but **insufficient**: S3 (no per-kind required-field list), C1 (seq), T2 (mutex across `await`), N5, N7 | See below |
| M-11 | B7 | N5: "never drop T0" + a ceiling is contradictory without saying what gives | Define the backpressure behaviour |
| M-12 | B7 | N7: oversize message truncated to a head with no way to retrieve the tail | Add the retrieval path |
| M-13 | B2 | The cold tree is ~400 lines + a background job + a mutex + a deep import for an **advisory, non-critical-path** feature. A raw tail + `read since=` already serves late joiners. | Defer the tree past v1, or justify the cost explicitly |

## MINOR (B8, all documentation)
Exact `@smol` call not shown · `read` interaction with a compressed node · `note`/`leave` kinds
have no creating op · `to` field not exposed by `post` · compactor error policy · `tree` op's
`raw` field ambiguous · `zoom` validation rules · `board` return shape · `join` idempotency ·
`release` error cases.

## What round 2 confirmed as CORRECT
- **B2**: the JSONL-under-`local://` log is the simplest correct mechanism (no existing primitive
  provides a shared append-only log); the delivery adapter is minimal and correct; `sendCustomMessage`
  null-check, `Promise<boolean>` semantics, and the T0→steer / T1→aside mapping all verified.
- **B7**: 30 of 33 round-1 fixes correct and sufficient.
- **B8**: all 4 Addendum A decisions, all 6 Addendum B decisions, and all 9 user goals are answered
  in the plan. No later round silently dropped an earlier request.
- **B6**: the security fixes are present but untested (that is M-9's neighbour).

## Orchestrator note
B7 reported P3 (AGENTS.md phase count) as "not found in repo" — a false negative; it looked in the
wrong directory. That fix is already applied and verified (`AGENTS.md:25`).

## Grading rule
A finding is CONFIRMED only if its evidence survives independent verification against installed
source. Round 1's lesson held: quote the plan line before refuting it, or it is not a finding.
