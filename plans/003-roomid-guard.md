# Plan 003: Validate `roomId` before it becomes a filename

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/store/config.ts plugin/tests/config.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

`config.roomId` flows unsanitized into a filesystem path:
`logPathFor(root, roomId)` returns `` `${root}/room/${roomId}.jsonl` `` and
`roomLogFd` opens it with `O_CREAT`. The room id is settable at runtime via
`/room config set roomId=<anything>` (`room-command.ts:304-324`), whose string
branch accepts any value with no `..`/separator guard, and by editing
`config.json` directly (which `coerceConfig` passes through as a plain
string). A value like `../../x` redirects the append-only log outside the
room directory. Trust context: the writers are the local TUI user and local
agents with filesystem access, not remote attackers — so this is hardening a
trust boundary (config-file input must never escape its directory), not an
active vulnerability. But the codebase's own convention is "field-by-field
coercion… it is still on-disk input" (`config.ts:50-51`), and this one field
skips validation while becoming a path.

## Current state

- `plugin/src/store/config.ts:52-69` — `coerceConfig` type-checks each field
  against the default's type; strings pass through verbatim.
- `plugin/src/store/config.ts:86-93` — `resolveRoomId`: config override wins,
  else mint via `roomIdFor(root)` (a `r + sha256[:16]` hex string).
- `plugin/src/ids.ts` — `logPathFor(root, roomId)` is `` `${root}/room/${roomId}.jsonl` ``.
- `plugin/src/store/log.ts:13-25` — `roomLogFd` mkdirs and opens with
  `O_CREAT`; no containment check.
- `plugin/tests/config.test.ts:101` — an existing test persists
  `roomId: "custom-room"`, proving overrides are a supported feature worth
  keeping (validate, don't remove).

Excerpts:

```ts
// config.ts:60-61
if (typeof current === "string" && typeof value === "string") {
  target[key] = value;
}
```

```ts
// config.ts:86-93
export function resolveRoomId(root: string): string {
  const config = loadRoomConfig(root);
  if (config.roomId !== "") return config.roomId;
  const roomId = roomIdFor(root);
  saveRoomConfig(root, { ...config, roomId });
  return roomId;
}
```

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`,
`bun test tests/`, `bunx --bun @biomejs/biome check src tests`, all from
`plugin/`. Runtime is Bun; never node/npm/npx. Commit style: conventional,
e.g. `fix(security): validate roomId before it becomes a filename`.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0, no `error TS` lines      |
| Tests     | `timeout 300 bun test tests/config.test.ts`           | all pass, including 3 new tests  |
| Full gate | `timeout 500 bun test tests/`                         | 213+ pass, 0 fail                |
| Lint      | `bunx --bun @biomejs/biome check src tests`           | `No fixes applied`, no errors    |

Run all commands from `plugin/`.

## Scope

**In scope** (the only files you should modify):
- `plugin/src/store/config.ts`
- `plugin/tests/config.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `plugin/src/ids.ts` — keep `logPathFor` dumb; the boundary is the resolver.
- `plugin/src/commands/room-command.ts` — the command path inherits the fix
  via `loadRoomConfig`; no call-site change.
- `plugin/src/store/log.ts` — do not add a second containment check there;
  one boundary (this plan) is the whole point.

## Git workflow

- Branch: `advisor/003-roomid-guard`
- One commit: `fix(security): validate roomId before it becomes a filename`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Constrain `roomId` to a safe alphabet at the coercion boundary

Add an exported predicate in `config.ts` next to `coerceConfig`:

```ts
const ROOM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function isValidRoomId(value: string): boolean {
  return ROOM_ID_RE.test(value);
}
```

This admits the minted form (`r` + 16 hex), the documented custom form
(`"custom-room"`), and nothing containing `/`, `\`, `..`-as-path, or control
characters. Max length 64 keeps filenames sane.

Apply it in BOTH places a `roomId` enters:

1. `coerceConfig`: after the generic loop, `if (!isValidRoomId(config.roomId)
   && config.roomId !== "") config.roomId = "";` — an invalid stored value
   falls back to "mint from the root", exactly like a wrong-typed value
   falls back to its default today. `""` stays legal (it means "mint").
2. `resolveRoomId`: `if (config.roomId !== "" && isValidRoomId(config.roomId))
   return config.roomId;` — defense in depth for callers that construct a
   config without going through `coerceConfig`.

Keep `/room config set roomId=…` working for valid ids and make invalid ones
a no-op-with-warning at the NEXT read (the value is stored, then ignored and
re-minted on resolve — no throw, matching the file's "falls back to its
default" convention). Do NOT throw from either function: both are called on
the tool hot path and the file's contract is total functions.

**Verify**: `bunx --bun tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Add regression tests

In `plugin/tests/config.test.ts` (model on the existing round-trip tests):

1. A stored `roomId` of `"../../evil"` resolves to the minted id, and no file
   is created outside the root (assert via `resolveRoomId` + `logPathFor`
   staying under `${root}/room/`).
2. `"custom-room"` still round-trips (the supported override keeps working).
3. `coerceConfig`-level: loading a config with `roomId: "a/b"` yields
   `roomId: ""`.

**Verify**: `timeout 300 bun test tests/config.test.ts` → all pass.

### Step 3: Run the full gate

**Verify**: `timeout 500 bun test tests/` → 213+ pass, 0 fail;
`bunx --bun @biomejs/biome check src tests` → clean.

## Test plan

- The three new tests in `plugin/tests/config.test.ts` (see Step 2).
- Structural pattern: the existing `saveRoomConfig`/`loadRoomConfig`
  round-trip tests in the same file (temp root, write, read back, assert).
- No new test files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bunx --bun tsc --noEmit -p tsconfig.json` exits 0
- [ ] `timeout 500 bun test tests/` exits 0 with 0 fail
- [ ] `bunx --bun @biomejs/biome check src tests` reports no errors
- [ ] `grep -rn "isValidRoomId" plugin/src/store/config.ts` returns ≥3 matches (def + 2 uses)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated
- [ ] No secret values anywhere in the plan's test fixtures (N/A — none involved)

## STOP conditions

Stop and report back (do not improvise) if:

- `resolveRoomId` has callers that depend on verbatim passthrough of exotic
  ids (e.g. tests asserting `"a/b"` round-trips — the drift check should have
  caught this; treat as STOP, not as license to change those tests' intent).
- The host gives `roomId` a second consumer you find by grep that this plan's
  two application points don't cover.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Any future string-typed config field that becomes a path, URL, or shell
  argument needs the same treatment at `coerceConfig` — that function is the
  codebase's declared input boundary ("it is still on-disk input").
- Reviewer: check the regex admits every id the codebase itself mints
  (`roomIdFor` output must match `isValidRoomId` — add an assertion if you
  want it pinned) and that `""` still means "mint".
- Never reproduce any real config file contents in findings or tests beyond
  synthetic temp-root fixtures.
