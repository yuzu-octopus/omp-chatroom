# Round 4 — scaffold typecheck: final verified state

Date 2026-10-07. Orchestrator-verified, reproducible.

## Result

`SCAFFOLD.md` extracted to a real tree and typechecked with `tsc` (typescript 7.0.2) against the
installed omp **18.7.0** host types.

| State | Errors |
|---|---|
| Round-4 scaffold **before** the fix pass | 28 |
| Round-4 scaffold **after** the fix pass | **7** |

Sanity: `tsc --listFiles` reports 36 repo files in the program; a deliberately injected
`export const bad: number = "string"` produces exactly 1 error, so a clean count is meaningful.

## The 7 remaining errors — all one defect class

```
src/attention/governor.ts(24,17)  TS2389: Function implementation name must be 'selectT1'
src/attention/governor.ts(48,17)  TS2391: Function implementation is missing
src/panel/keys.ts(12,17)          TS2391: Function implementation is missing
src/store/claims.ts(36,17)        TS2389: Function implementation name must be 'expireStale'
src/store/log.ts(15,17)           TS2389: Function implementation name must be 'replay'
src/store/tree-store.ts(18,17)    TS2391: Function implementation is missing
src/store/tree-store.ts(19,17)    TS2391: Function implementation is missing
```

**Root cause — one pattern, seven times.** A declaration-only signature ends with `};` **followed
by a trailing comment**, e.g. `SCAFFOLD.md` §9:

```ts
export function replay(fd: number): { records: RoomRecord[]; skipped: number };   // §3.3
export function closeRoomLog(root: string, roomId: string): void {  // K8 — last live session only
```

The body-stub pass inserts `{ throw … }` at the terminating `;`, which lands **after** the
trailing comment, so the brace opens inside the comment. The fix is mechanical: put the body
before the comment, or move the comment above the signature.

**These 7 are real scaffold defects, not tooling artefacts** — the surrounding code is valid
TypeScript (verified: the 28 pre-existing errors were fixed with proper bodies; no stubbing is
applied in the final run).

## What was fixed in this pass (28 → 7)

| Group | Fix |
|---|---|
| `src/index.ts` (5) | duplicate `ExtensionAPI` import removed; `__roomTest` initialised; the two module-scope `pi.registerFlag` calls moved into the factory |
| `src/attention/governor.ts` (5) | `MemberState` import added |
| `src/panel/panel.ts` (4) | constructor + method bodies |
| 14 `export const X: T;` | given real literal initialisers |
| `src/store/compactor.ts` (1) | declaration/implementation name unified on `withWriteMutex` |
| X1 | `roomIdFor(root)` — root-stable (sha256), with the why-not-session-id note |
| X6 | host relabelled 18.6.1 → **18.7.0**; `engines` + `peerDependencies` pin added |
| M11 | `prevHolder: string` added to the `release` record |
| D3 | `src/version.ts` + `tests/drift.test.ts` added |

## Tooling note (mine, worth recording)

Writing the body-stub pass cost several iterations because the naive regex matched **nested** `;`
inside return types (`{ records: RoomRecord[]; skipped: number }`) and inside multi-line
signatures. A brace/paren-depth-aware scan is required. Recorded so the next pass does not repeat
it. The final run applies **no** stubbing — the 7 errors are what the file actually produces.

## Verdict

The scaffold went from **not compiling at all** (28 errors) to **7 mechanical defects**. It is
close to a valid compile target and the remaining fix is one pattern applied seven times.
