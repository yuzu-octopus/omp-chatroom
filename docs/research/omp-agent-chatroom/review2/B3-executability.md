# B3 — Phase executability (adversarial review, round 2)

Reviewer: B3 lens. Target: `PLAN-build.md` §2, §3, §9 P0/P1, §11.1.
Result: blockers found. **Orchestrator adjudication below, with independent verification.**

## Blockers (reviewer-reported)

| id | Blocker | Plan line | Fix |
|---|---|---|---|
| B1 | `tsconfig.json` contents unspecified | §2.1:79 | Add a §2.3 with exact compiler options |
| B2 | `__roomTest` imported but never defined | §11.1:1257,1271 | Specify the export shape in `src/index.ts` |
| B3 | `src/index.ts` factory behaviour unspecified ("wires everything") | §2.1:80 | Specify what the factory registers |
| B4 | `src/ids.ts` three functions unspecified | §2.1:81 | Give signatures + implementations |
| B5 | Settings registration unspecified | §2.2 | See adjudication — worse than reported |

## Orchestrator adjudication

**B5 — CONFIRMED, and upgraded.** Verified in installed source:
- `PluginManifest.settings` is real (`plugins/types.ts:47-48`).
- It is read **only by the CLI**: `cli/plugin-cli.ts:898,899,933,934,953,1020,1021`.
- The reader is `getPluginSettings(pluginName, cwd)` — a **loader function**
  (`plugins/loader.ts:482`), reachable from the CLI, **not from `ExtensionAPI`**.
- `extensions/loader.ts` contains no settings plumbing (`:620` mentions settings only in a
  comment about process-global CLI state).

**Consequence the reviewer understated:** the plan's 11 manifest settings are
**unreachable from extension code at runtime**. `lookup(id)` resolves *omp core* setting ids from
`config/registry` — it does not resolve a plugin's own manifest settings. So §2.2's settings
block currently configures nothing the plugin can read.

**Two viable fixes; the plan must pick one:**
1. **Register as core settings** — declare ids in `config/registry` (not possible from a plugin;
   would need core support) → **not available**.
2. **Own config file** — read/write `local://room/config.json` the plugin owns, exposed via a
   `/room config` subcommand, with `registerFlag` for per-launch overrides and the manifest
   `env` field as a fallback. This is what R6 originally proposed before it was "corrected".

So R6's original fallback was right, and the correction I applied earlier this session
(asserting `lookup()` reaches plugin settings) was wrong. **Revert that correction**: the
registry route works for *core* ids, not plugin settings.

**B1-B4 — ACCEPTED.** All four are genuine P0/P1 blockers: a builder cannot write
`tsconfig.json`, `src/index.ts`, `src/ids.ts`, or the test harness without guessing.

**B2 note:** `__roomTest` is a test-only seam. It must be specified as a named export from
`src/index.ts`, and it must not ship behaviour that changes production semantics.

## What the reviewer checked and found correct
(From its report; not independently re-verified here — carried as reported.)
Manifest field names and `features` shape; `extensions` entry resolution; the `"./*"` export
resolution for the specifiers the plan uses.
