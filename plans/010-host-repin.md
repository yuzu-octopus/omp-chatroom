# Plan 010: Reconcile the three-way host version drift (pin 18.8.6, docs 18.8.7, live 18.10.3)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/version.ts plugin/package.json plugin/bun.lock AGENTS.md plugin/README.md plugin/tests/drift.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" facts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

Three version claims disagree: `HOST_VERSION_PIN` and the lockfile say
18.8.6, `AGENTS.md` says 18.8.7, and the actually-installed global host is
18.10.3 — and the linked plugin resolves the host's modules at runtime, so
the deep-subpath imports the plugin depends on are served by 18.10.3, not by
the pinned 18.8.6 the tests verify. All nine deep specifiers still resolve
on 18.10.3 (verified at plan time), so this is drift, not breakage — but the
drift gate (`drift.test.ts`) asserts the pin against the dev install, which
no longer represents production. Until the three agree, nobody can tell
whether a future host bump breaks the plugin without running it live.

## Current state

Facts verified at plan time (re-verify each in Step 1 — versions move):

1. `plugin/src/version.ts:3`: `export const HOST_VERSION_PIN = "18.8.6";`
2. `plugin/package.json` `peerDependencies` + `devDependencies`: all
   `@oh-my-pi/*` at `18.8.6`; `plugin/bun.lock` resolves 18.8.6.
3. `AGENTS.md:129`: "**Host: omp 18.8.7.** The plugin pins it exactly…".
4. Live host: `omp --version` → `omp/18.10.3`;
   `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json`
   → `18.10.3`.
5. The linked install (`~/.omp/plugins/node_modules/omp-agent-chatroom` →
   symlink to `/home/yuzu/projects/omp-chatroom/plugin`) has no bundled
   `@oh-my-pi/*`; the plugin's deep imports resolve against the global host
   at runtime.
6. All nine `DEEP_SPECIFIERS` paths exist as `.ts` sources under BOTH
   `plugin/node_modules/@oh-my-pi/*/src/` (18.8.6) and the global 18.10.3
   tree (checked file-by-file at plan time).
7. `plugin/tests/drift.test.ts` asserts installed dev-host version equals
   `HOST_VERSION_PIN` and ESM-imports the four Option A specifiers.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `chore(deps): re-pin host to 18.10.3 and reconcile the version docs`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 500 bun test tests/drift.test.ts tests/host-contract.test.ts` | all pass                 |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |
| Install   | `bun install` (from `plugin/`)                        | exit 0, lockfile updated         |

Run all commands from `plugin/` unless noted.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/version.ts`
- `plugin/package.json`
- `plugin/bun.lock` (via `bun install` only — never hand-edit)
- `AGENTS.md`
- `plugin/README.md` (only if it names a host version — check first)
- `plugin/tests/drift.test.ts` (only if the gate needs a production leg; see Step 3)

**Out of scope** (do NOT touch, even though they look related):
- Any `src/` behavior file — this is a re-pin + docs, not a migration.
- `~/.omp/plugins/` or the global install — read-only inspection only.
- `docs/research/**` — historical record; leave version mentions there alone.

## Git workflow

- Branch: `advisor/010-host-repin`
- Two commits: (1) `chore(deps): re-pin host to <live version>` (package.json
  + lock + HOST_VERSION_PIN) (2) `docs: reconcile host version claims`
  (AGENTS.md + README if needed)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify the three versions

Run and record:

```sh
timeout 60 omp --version
grep -m1 '"version"' ~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json
grep -m1 '"version"' node_modules/@oh-my-pi/pi-coding-agent/package.json
grep -n "HOST_VERSION_PIN =" src/version.ts
grep -n "Host: omp" ../../AGENTS.md
```

If the live host moved again since the audit (it went 18.8.6 → 18.8.7 →
18.10.3 in days), target the NEW live version throughout — the goal is
pin == docs == live, whatever the number.

**Verify**: you have three version strings written down; proceed with the live one as target.

### Step 2: Re-pin the dev install to the live host

1. In `plugin/package.json`, set all `@oh-my-pi/*` entries in
   `peerDependencies` AND `devDependencies` to the exact live version
   (keep them exact — the pin-by-exact-version policy stays).
2. In `plugin/src/version.ts`, set `HOST_VERSION_PIN` to the live version
   and update the `// X6 — the installed host is …` comment to match.
3. Run `bun install` from `plugin/` and confirm `bun.lock` resolves the new
   version (`grep -m3 "<new-version>" bun.lock`).
4. Run the typecheck + full gate. If a deep import moved between 18.8.6 and
   the live version, the drift test or tsc WILL fail here — that failure is
   the gate working. STOP and report (do not shim around a moved subpath).

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0;
`timeout 500 bun test tests/` → 213+ pass, 0 fail.

### Step 3: Strengthen the drift gate with a production leg (only if cheap)

`drift.test.ts` asserts the DEV install equals the pin. Add a second test
that asserts the GLOBAL install (`~/.bun/install/global/node_modules/
@oh-my-pi/pi-coding-agent/package.json`, resolved via `Bun.which("omp")`'s
prefix — NOT a hardcoded home path) also equals the pin, SKIPPED gracefully
(`test.skip` with a logged reason) when no global install is found (CI has
none). If resolving the global prefix robustly takes more than ~20 lines,
skip this step and note it in the report — the re-pin is the fix; this is
early warning.

**Verify**: `timeout 500 bun test tests/drift.test.ts` → all pass (or pass + 1 skip on machines without a global install).

### Step 4: Reconcile the docs

Update `AGENTS.md:129` (`Host: omp …`) to the new pin, and fix the
`tests/drift.test.ts asserts …` clause if Step 3 changed it. Check
`plugin/README.md` for any host version mention and update it the same way.
Also fix the stale suite-size claims found in the audit while here ONLY if
they are on lines you already touch — otherwise leave them for plan 011
(one plan, one diff).

**Verify**: `grep -rn "18\.8\.[67]" AGENTS.md plugin/README.md plugin/src/version.ts` →
no matches (all three agree on the new version).

## Test plan

- No new behavior tests. The drift suite (`drift.test.ts`,
  `host-contract.test.ts`) IS the test plan: it must pass against the new
  pin, proving every deep specifier still resolves.
- Step 3 optionally adds one production-leg test (pass-or-skip).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `HOST_VERSION_PIN`, `package.json` `@oh-my-pi/*` entries, `bun.lock`,
  and `AGENTS.md` all name the same version, equal to `omp --version`
- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The full gate fails after the re-pin (a deep subpath moved — the migration
  is bigger than a re-pin; report which specifier and stop).
- `bun install` wants to change unrelated packages (lockfile churn beyond
  the `@oh-my-pi/*` entries — report the diff, don't commit it blind).
- The live host moved AGAIN between Step 1 and Step 2 (hit it once; if it
  moves twice in one session, the pin policy itself needs rethinking — stop).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The host moves fast (three minors in days). Whoever bumps the global omp
  must re-run this plan's Step 1–2 — consider adding that sentence to
  `AGENTS.md` near the pin (one line, in Step 4).
- Reviewer: the `bun.lock` diff must touch ONLY `@oh-my-pi/*` entries and
  their transitive fallout — any unrelated churn is a reject-and-redo.
- If Step 3 was skipped as too costly, the production leg stays missing:
  the next host bump will again be caught only by running live. Say so in
  the report so it can be re-planned.
