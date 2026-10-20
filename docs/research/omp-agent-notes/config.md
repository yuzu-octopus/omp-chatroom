# Build / config surface — findings for repo-root `AGENTS.md`

Slice: `plugin/package.json`, `plugin/tsconfig.json`, `plugin/biome.json`, `plugin/bun.lock`,
`.gitignore`, `.omp/extensions/chatroom.ts`, repo root listing.

> **Verification note (refreshed 2026-10-20).** The original investigation had **no local shell
> device** — the only bash tool available was a remote Composio sandbox that cannot see this
> filesystem (`cd /home/yuzu/projects/omp-chatroom` → *No such file or directory*). Every claim
> below was therefore derived by **reading the files**. This refresh re-checked every version,
> path, flag and count against the current tree with a local shell. The current gate numbers are
> **274 pass / 0 fail, 15 files** (`bun test tests/`), **0 tsc errors**
> (`bunx --bun tsc --noEmit -p tsconfig.json`) and a clean Biome pass over **51 files**
> (`bunx --bun @biomejs/biome check src tests`) — orchestrator-verified, not re-run here. The
> *script bodies* are quoted verbatim from `plugin/package.json:6-11`.
>
> **Delivery note.** The file now lives at `docs/research/omp-agent-notes/config.md` (it was
> originally authored as `local://config.md` and moved into place).

---

## 1. There is no root `package.json` — this is not a workspace

1. The repository root contains **no `package.json`**, no lockfile, no workspace config, and no
   root `tsconfig.json`/`biome.json`. Directory listing of `/home/yuzu/projects/omp-chatroom`
   shows only: `.github/`, `.git/`, `.gitignore`, `.omp/`, `.omp-room/`, `.tmp-swarm/`,
   `AGENTS.md`, `docs/`, `plans/`, `plugin/`, `probes/`.
2. **The root `.omp-room/` is now LEGACY, not the live room.** The room's working data lives in
   the global omp session store (§7); a `.omp-room/` left in a project tree is either a
   temp-dir project (which *is* project-local by rule) or a legacy directory the migration has
   not removed yet — the migration removes it once it has copied it into the global store, and a
   skipped migration leaves it byte-for-byte intact.
3. **Therefore every command must be run from `plugin/`.** Running `bun test` at the repo root
   fails — there is no manifest there to define the script or resolve the workspace.
4. The single lockfile is `plugin/bun.lock` (`plugin/bun.lock:1-8`): `lockfileVersion: 2`,
   `configVersion: 1`, one workspace named `omp-agent-chatroom`.
5. `probes/*.mjs` are standalone host probes — **not** part of the package, not covered by any
   script, not listed in `files`.

## 2. The exact runnable commands

Verbatim from `plugin/package.json:6-11`:

```json
"scripts": {
  "test": "bun test tests/",
  "typecheck": "bunx --bun tsc --noEmit -p tsconfig.json",
  "lint": "bunx --bun @biomejs/biome check src tests",
  "lint:fix": "bunx --bun @biomejs/biome check src tests --write"
}
```

| Command | What it runs | Notes |
|---|---|---|
| `cd plugin && bun test tests/` | `bun test` over the 15 files in `plugin/tests/` | Framework is `bun:test` (`plugin/tests/drift.test.ts:1`). Orchestrator-verified: **274 pass / 0 fail, 3398 assertions, 15 files**. |
| `cd plugin && bun run typecheck` | `bunx --bun tsc --noEmit -p tsconfig.json` | `--bun` forces the local tsc through Bun. Orchestrator-verified: **0 errors**. |
| `cd plugin && bun run lint` | `bunx --bun @biomejs/biome check src tests` | Lint + format check + import organisation in one pass. Orchestrator-verified: **clean over 51 files**. |
| `cd plugin && bun run lint:fix` | same, with `--write` | Applies safe fixes **and** formats. Run before committing. |

5. There is **no `build` script and no build step at all** — `plugin/README.md:63` ("There is no
   build step") and `plugin/README.md:215`. Bun executes the TypeScript directly; the plugin is
   imported as a `.ts` module in-process by the host.
6. The **four** `@oh-my-pi/*` packages appear in **both** `peerDependencies` and `devDependencies`
   (`plugin/package.json:38-43` and `:45-51`), so the workspace is self-installable while still
   declaring the host contract. The four are `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`,
   `@oh-my-pi/pi-ai` and **`@oh-my-pi/pi-utils`** — the last was imported by **eight** source
   files (`grep -rn '@oh-my-pi/pi-utils' plugin/src` → `store/room-root.ts:5`,
   `tools/wait-for-agent.ts:11`, `onboarding/escape.ts:2`, `commands/room-command.ts:4`,
   `panel/chat-pane.ts:8`, `panel/board-pane.ts:8`, `panel/panel.ts:7`,
   `cards/message-cards.ts:10`) while it was **undeclared**. It is now declared in both blocks.
   `@types/bun` is dev-only (`plugin/package.json:50`).
7. Runtime floor: `engines.bun = ">=1.3.14"` (`plugin/package.json:35-37`). Verified present in
   this environment: Bun **1.4.3**.

## 3. The `omp` manifest block

`plugin/package.json:12-34`. Shape follows the host `PluginManifest`/`PluginFeature` types
(`plugin/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/plugins/types.ts:9-22, 27-49`,
quoted in `docs/research/omp-agent-chatroom/findings/F15-plugin-packaging-devtooling.md`):

```json
"omp": {
  "name": "Agent Chatroom",
  "version": "0.1.0",
  "description": "...",
  "extensions": ["./src/index.ts"],
  "features": {
    "room":        { "default": true, "extensions": ["./src/index.ts"] },
    "wait-tools":  { "default": true, "extensions": ["./src/index.ts"] },
    "panel":       { "default": true, "extensions": ["./src/index.ts"] }
  }
}
```

8. `omp.name` is the **display name** (`"Agent Chatroom"`); the **npm/package name** is
   `omp-agent-chatroom` (`plugin/package.json:2`) and is what `omp plugin link .` registers under.
9. `omp.version` duplicates `version` (`plugin/package.json:3,14`) — the host overwrites
   `manifest.version` from `package.json#version` on load, so the field is redundant but harmless.
10. **Every entry point is the same file, `./src/index.ts`.** `omp.extensions` and every feature's
    `extensions` all point at it (`plugin/package.json:16,21,26,31`). The features are therefore
    **declarative membership labels only** — they do not split the bundle. Selecting/deselecting a
    feature changes which capabilities are *advertised*, not which code is loaded.

| Feature | What it actually enables (all from `src/index.ts`) |
|---|---|
| `room` | `RoomStore`, claim board, and the `room` tool (12 ops) |
| `wait-tools` | the three blocking tools `wait_for_claim`, `wait_for_agent`, `wait_for_message` |
| `panel` | the TUI `/room` overlay, its subcommands, and the board view |

11. All three are `"default": true` (`plugin/package.json:20,25,30`), so an install with
    `enabledFeatures: null` activates all of them.
12. **There is deliberately no `settings` block.** The plugin owns a real config file instead —
    `plugin/README.md:166-173`: even a declared setting is "CLI-facing validation only … read by
    `omp plugin config`, and `ExtensionAPI` has no `settings` property". The config surface is
    **`<room root>/room/config.json`** (`plugin/src/store/config.ts:53-56`, `configPath(root)`) plus
    the registered flags — and there is now exactly **one** flag, `--room-panel-key`
    (`plugin/src/store/config.ts:114-120`). Load order *registered flags → config file → built-in
    defaults* (`plugin/README.md:174-175`). The room root is the **global omp session store**, not
    the project directory (§7). **Do not assume `--room-cold-tree` still exists: it was removed**
    (registered but never read) — `plugin/src/store/config.ts:110-113` says so verbatim.
13. **No `skills` field either** — `PluginManifest` has none. The bundled skill
    (`plugin/skills/omp-agent-chatroom/SKILL.md`) is found by the plugin provider's conventional
    `skills/` directory scan (`plugin/package.json:44` ships it via `files`).
14. `files: ["src", "skills", "README.md"]` (`plugin/package.json:44`) — publish surface only.
    `tests/`, `biome.json`, `tsconfig.json` are **not** published; that is fine because
    `omp plugin link .` symlinks the source directory rather than copying it.
15. `type: "module"` (`plugin/package.json:5`) — ESM only.

## 4. peerDependencies vs devDependencies, and the host pin

16. Pin value in both blocks is **`18.12.3`**, exact, no range operators
    (`plugin/package.json:38-43` and `:45-51`).
17. **⚠️ Any note that says the plugin pins `18.8.6`, `18.8.7`, `18.8.0` or `18.10.3` is
    wrong.** The repo pins **`18.12.3`**, and the live global host is the same version. Evidence,
    all re-read 2026-10-20:
    - `plugin/package.json:39-42` (peer) and `:46-49` (dev) → `18.12.3` for all four packages
      (`pi-coding-agent`, `pi-tui`, `pi-ai`, `pi-utils`)
    - `plugin/bun.lock:8-18` → workspace `peerDependencies` + `devDependencies` both `18.12.3`
    - `plugin/bun.lock:99, 121, 123` → every `@oh-my-pi/*` package entry resolves at `18.12.3`
    - `plugin/src/version.ts:3` → `export const HOST_VERSION_PIN = "18.12.3";`
    - installed: `plugin/node_modules/@oh-my-pi/{pi-coding-agent,pi-tui,pi-ai,pi-utils}/package.json`
      → `"version": "18.12.3"` (all four)
    - live global host: `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json`
      → `"version": "18.12.3"`
18. **Why the pin exists.** The plugin depends on **wildcard-only subpath imports** — specifiers
    that resolve through the host's `"./*"` export wildcard and are **not public API**
    (`plugin/src/version.ts:17-27` lists all **nine**; `AGENTS.md:160-166` states the risk). A host
    version bump can move or remove one with no semver signal on the plugin's side. Four defences:
    1. the exact pin (peer + dev, above);
    2. `plugin/src/version.ts:38-51` `assertHostVersion()`, which throws on mismatch and names
       `DEEP_SPECIFIERS.length` in the message;
    3. `plugin/tests/drift.test.ts` — a **drift smoke test** that (a) reads the installed host
       `package.json` as text and asserts `version === HOST_VERSION_PIN`
       (`drift.test.ts:11-23`), (b) reads the **GLOBAL** host's `package.json` — the one that
       actually loads a linked plugin — and asserts it matches too, skipping gracefully when no
       global install exists (`drift.test.ts:25-47`), (c) statically ESM-imports each deep
       specifier and asserts it resolves with no undefined members (`drift.test.ts:63-77`), and
       (d) asserts named exports/arity for the two load-bearing ones, `escapeHarnessTags` and
       `resolveLocalRoot` (`drift.test.ts:79-83`); and
    4. a **load-time warning** in `plugin/src/index.ts:40-47` (`warnOnHostDrift`): it reads the
       host's own `VERSION` export and logs through `pi.logger.warn`. It **never throws** — "a
       room that still works is worth more than a plugin that refuses to load"
       (`plugin/src/index.ts:31-39`).
19. The drift test uses **static ESM imports on purpose** — the host's deep subpaths declare only
    an `import` condition (no `require`), so a `createRequire().resolve()` gate reports false
    failures (`plugin/tests/drift.test.ts:2-4`; same finding at
    `docs/research/omp-agent-chatroom/P6-swarm-verified.md:50-52`). Do not "fix" this to a
    require-based check.
20. Convention in source: deep host imports are the exception, not the pattern.
    `plugin/src/store/compactor.ts:2` imports `streamSimple` from the **root** of
    `@oh-my-pi/pi-ai` with the comment "root export, NOT a deep import (K21/F3)" — treat
    root-first as the rule and deep-only as documented, gate-covered necessity.
21. Bumping the host therefore means: bump `package.json` peer+dev **and** `bun.lock`, bump
    `HOST_VERSION_PIN`, and let `bun test tests/drift.test.ts` tell you which specifier moved.
    **The live host moves faster than the repo:** during the 18.12.x round the global host moved
    to 18.12.3 mid-round, the production leg of the drift test caught it, and the pin moved with
    it (`AGENTS.md:212-214`). Whoever bumps the global omp must re-pin.

## 5. `tsconfig.json`

`plugin/tsconfig.json` in full:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"],
    "allowImportingTsExtensions": true,
    "allowArbitraryExtensions": true
  },
  "include": ["src", "tests"]
}
```

22. `noEmit: true` — typecheck only; no compiler output ever exists.
23. `types: ["bun"]` restricts ambient types to Bun's (which transitively brings `@types/node`);
    `skipLibCheck: true` keeps it fast.
24. `moduleResolution: "bundler"` + `allowImportingTsExtensions` is what lets source import
    `./index.ts` style paths (e.g. the shim `.omp/extensions/chatroom.ts:1`).
25. `include: ["src", "tests"]` — **`probes/` is not typechecked.** A broken probe passes CI.

## 6. `biome.json` (Biome 2.x)

`plugin/biome.json` in full:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "files": { "includes": ["src/**", "tests/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": { "enabled": true, "rules": { "recommended": true,
              "style": { "noNonNullAssertion": "off" } } }
}
```

26. `indentStyle: "space"`, `indentWidth: 2`, **`lineWidth: 100`**. The source is formatted at 100
    columns — do not reflow to 80.
27. **`noNonNullAssertion` is off** — the `!` non-null assertion is allowed style here, and it is
    used deliberately after a guarded check (e.g. `plugin/src/attention/delivery.ts:152`,
    `plugin/src/store/room-store.ts:247`). Do not "fix" `!` into an `if`/`as` when linting.
28. `files.includes` is exactly `src/**` + `tests/**`. `probes/`, `docs/`, and the root are **not**
    linted or formatted — their formatting (e.g. `probes/*.mjs`) is unreviewed by CI.
29. `organizeImports: "on"` means `biome check --write` also sorts imports; run `lint:fix` rather
    than hand-sorting.
30. `recommended: true` — everything else recommended stays on. Biome is the only linter; there is
    no ESLint config anywhere in the repo.

## 7. `.gitignore` and runtime state

`.gitignore` (line-by-line):

| Line | Entry | Meaning |
|---|---|---|
| 1 | `node_modules/` | deps |
| 2-3 | `dist/`, `build/` | no build step exists, but kept |
| 4 | `*.tsbuildinfo` | tsc incremental |
| 5-6 | `.omp/plugins/`, `.omp/cache/` | host-managed plugin dir + cache |
| 7-9 | `.env`, `.env.*`, `!.env.example` | secrets; keep a template |
| 10-11 | `.DS_Store`, `Thumbs.db` | OS noise |
| 12 | `*.log` | logs |
| 13-15 | `coverage/`, `.idea/`, `.vscode/` | coverage + IDE |
| 17-19 | `# Room runtime state needs no entry: the room lives in the global omp session store …` | explains why there is no `.omp-room/` entry any more |

31. **The live room is NOT in the project tree any more.** The room's working data (the JSONL log,
    the cold tree, `config.json`, the lockfile) lives in the **global omp session store**:
    `<sessions>/rooms/<16 hex chars of the project path>/room/`, where `<sessions>` is
    `getSessionsDir()` from `@oh-my-pi/pi-utils` — `~/.omp/agent/sessions`, or
    `$XDG_DATA_HOME/omp/sessions` when `XDG_DATA_HOME` is set **and** `$XDG_DATA_HOME/omp`
    exists (`plugin/src/store/room-root.ts:30-32`; the XDG rule is the host's
    `node_modules/@oh-my-pi/pi-utils/src/dirs.ts:389-403, 429-434`). The root `.gitignore` has
    **no `.omp-room/` entry** any more: the room is not in the project tree, and a legacy
    project-local room is MOVED into the global store, so nothing is left to ignore (§7, item 35).
32. `.gitignore` is a **pattern**, not a directory list — it matches at any depth. The only case
    where a `.omp-room/` still belongs in a project tree is a **temp-dir** project, which stays
    project-local by rule (§7, item 35); such a project, if it is itself a git checkout, may want
    its own `.omp-room/` ignore entry. The root `.omp-room/` observed on disk is a **legacy** room:
    the migration copies it into the global store and then REMOVES it, and a skipped migration
    leaves it byte-for-byte intact — the current room for this project is under the global store.
33. `plugin/.gitignore` holds only `node_modules/` (`plugin/.gitignore:1`) — everything else comes
    from the root file.
34. Room id/root derivation is `r` + first 16 hex of sha256(root)
    (`plugin/src/ids.ts:2-5`), and the log path is `<root>/room/<roomId>.jsonl`
    (`plugin/src/ids.ts:11-14`). The **directory leaf** is a different hash — the first 16 hex of
    sha256(**project path**) (`plugin/src/ids.ts:6-10`, `roomDirNameFor`) — so the leaf and the
    room id differ **by design**; do not assume they match.
35. **The room root is `roomRootFor(ctx)` (`plugin/src/store/room-root.ts:54-57`), not
    `ctx.cwd + "/.omp-room"`.** Two locations, by rule:
    - a project under the system temp dir stays **project-local** (`<cwd>/.omp-room`) — "a test, a
      scratch task or a throwaway worktree must never write into the user's real room store"
      (`plugin/src/store/room-root.ts:50-53`); a temp-dir project that is itself a git checkout may
      want its own `.omp-room/` ignore entry; every other project uses the **global store**
      (`plugin/src/store/room-root.ts:30-32`);
    - a **legacy** project-local room is MOVED into the global store **once**, on first open
      (`migrateLegacyRoom`, `plugin/src/store/room-root.ts:77-146`; called from
      `plugin/src/store/room-store.ts:243`). The copy takes **BOTH** locks: a legacy room held by a
      **LIVE** process is left alone (that room belongs to that process), and the target's lock
      keeps two omp processes from copying into the same room. The copied log is named after the
      id the **TARGET** resolves, so the pinned `roomId` survives the move; once the copy is
      verified, the legacy room is **REMOVED** — the copied files, the legacy `room/` directory and
      the empty legacy root — so the project tree keeps no `.omp-room` at all. A **skipped**
      migration (the legacy room is held by a live omp process, the pinned room id matches no log,
      or the target already has a room) removes NOTHING and leaves the legacy room byte-for-byte
      intact.
    The `ctx.cwd` key itself has NOT changed: `ctx.localProtocolOptions` is per-*session*, so
    keying there gave every agent a private room (`plugin/src/store/room-root.ts:41-49`).
36. **A single-writer lockfile now exists** — `<room root>/room/.lock`
    (`lockPathFor`, `plugin/src/store/log.ts:13-15`), holding the owner's pid, created with
    `O_CREAT|O_EXCL` and reaped when the owner is dead (`acquireRoomLock`,
    `plugin/src/store/log.ts:25-54`). A **second omp process on the same project fails loudly**
    with `room file locked by pid N` (`plugin/src/store/log.ts:44`; the open path maps it to
    `room file locked by another session`, `plugin/src/store/log.ts:264-273`). Why: two writers
    were **measured** minting 10 duplicate seqs over 40 records without ever seeing each other's
    records — silent divergence, not an error. A swarm of subagents is unaffected: subagents run
    **in the same process**, so they share one room and one lock.

## 8. The two load routes

35. **Project extension shim** — the route this repo actually uses.
    `.omp/extensions/chatroom.ts` is one line:

    ```ts
    export { default } from "../../plugin/src/index.ts";
    ```

    (`plugin/src/index.ts:18` is the `export default function roomExtension(pi: ExtensionAPI)`.)
    omp discovers project `.omp/extensions/*.ts` automatically, so a session started anywhere in
    this repository loads the room with no install (`plugin/README.md:66-69`).
36. **`omp plugin link .`** — the packaged route: `cd plugin && omp plugin link .` symlinks the
    directory into `~/.omp/plugins/node_modules/omp-agent-chatroom` and the manifest's
    `omp.extensions` entry is loaded at next session start (`plugin/README.md:55-63`). Use it when
    the room should be present in *every* project, not just this one. It is **live-verified**: the
    link is present at `~/.omp/plugins/node_modules/omp-agent-chatroom ->
    /home/yuzu/projects/omp-chatroom/plugin` and `omp plugin list` shows
    `omp-agent-chatroom@0.1.0  Available: [room, wait-tools, panel]` (`AGENTS.md:206-211`).
37. **No build step either way** — the symlink points at the source directory; Bun imports TS
    natively.
38. **No hot reload.** Extension code is loaded once per session tree; editing plugin source needs
    a new session (or a session switch) before the change is live
    (`plugin/README.md:232-233`; mechanism at
    `docs/research/omp-agent-chatroom/findings/F15-plugin-packaging-devtooling.md` §Q2 —
    `loadExtensions()` binds factories once; `clearPluginRootsAndCaches()` only on session
    switch/resume).
39. **`omp plugin doctor`** is the verification command for the link route
    (`plugin/README.md:62-63`). Per F15 Q2/Q3 it is the read-only health check over the linked
    package: that the lockfile entry exists and is `enabled: true`, that the symlink target
    resolves, that `package.json.omp` parses and `manifest.version` matches `package.version`, and
    — with `enabledFeatures: null` — which declared features (`room`, `wait-tools`, `panel`, all
    `default: true`) are activated. It does **not** import the extension or prove the code
    loads; the drift smoke test (`bun test tests/drift.test.ts`) is what proves the import surface.
40. Note on trust: `omp plugin link <path>` does not restrict the source to cwd — the symlinked
    code runs **in-process with no sandbox** (F15 pitfalls table).

## 9. What an assistant gets wrong here

41. **No root `package.json` / no workspace.** Run everything from `plugin/`. Do not add a root
    manifest to "make scripts work at the root".
42. **Bun only. Never `node`, `npm`, `npx`, `yarn`, `pnpm`.** The package is ESM TypeScript
    executed by Bun; `@types/bun` is the ambient type set (`plugin/tsconfig.json:9`). The scripts
    themselves already use `bunx --bun` rather than `npx` (`plugin/package.json:8-10`).
43. **No build step.** Do not add `tsc`, `tsup`, `esbuild`, `dist/` output, or a `build` script.
44. **Do not add a `settings` block to the manifest.** It is unreachable at runtime (§12) and
    config belongs in **`<room root>/room/config.json`** — where the room root is the global omp
    session store, not the project directory (§7, items 31-35). Unknown config keys are ignored,
    so an old file carrying `coldTreeEnabled` needs **no migration**
    (`plugin/src/store/config.ts:22-24, 59-80`).
45. **Do not convert the deep imports to root imports blindly, and do not convert the drift test to
    `require`.** §18-20.
46. **`probes/` is outside every gate** — not in `tsconfig.include`, not in
    `biome.files.includes`, not in `files`. A probe can break unnoticed.
47. **Do not assume the room is in the project directory, and do not assume two omp processes can
    share one.** The room lives in the global session store (§7) and takes a **single-writer
    lockfile** (§7, item 36): a second omp process on the same project fails loudly with
    `room file locked by pid N`. Subagents in the same process are fine.
48. **Root `AGENTS.md` is no longer stale on this slice.** It has since been rewritten into a real
    guidelines document (233 lines): it states the host as "**omp 18.12.3**"
    (`AGENTS.md:160-166`), the global room root and its two exceptions
    (`AGENTS.md:96-116`), the single-writer lock (`AGENTS.md:118-128`), the invariants I1-I11
    (`AGENTS.md:126-158`) and the live-verification table (`AGENTS.md:204-232`). The **older**
    claims in this file's history ("omp 18.6.1", "Not yet specified in the plan", "No linter or
    formatter is configured", "one module-level store keyed by the `local://` root") were all
    false and have been fixed there. `plugin/README.md` is likewise current: the room root
    (§"The room is one per project", `plugin/README.md:184-197`), the lockfile
    (`plugin/README.md:199-203`) and the 274-test count (`plugin/README.md:205-217`) all match the
    code. The **plan** (`PLAN-build.md`) is the thing that is still version-stale — see
    `docs.md` §5.
49. **Untracked directories on disk that you must not commit**: the root `.omp-room/` (a **legacy**
    room — the migration copies it into the global store and then removes it; until it has run, or
    if it is skipped, the directory stays untracked and there is no `.omp-room/` ignore entry any
    more), `.tmp-swarm/`, `probes/` (untracked, unclassified), `plans/`. `.tmp-swarm/` is not in
    `.gitignore` — check `git status` before staging anything. `plugin/.omp-room/` and
    `plugin/undefined/` no longer exist.

## 10. Cheat sheet

```sh
# everything, from the repo's only package:
cd plugin

bun test tests/                                    # 274 pass / 0 fail, 3398 assertions, 15 files (orchestrator-verified)
bunx --bun tsc --noEmit -p tsconfig.json           # 0 errors (orchestrator-verified)
bunx --bun @biomejs/biome check src tests          # lint+format check, clean over 51 files (orchestrator-verified)
bunx --bun @biomejs/biome check src tests --write  # autofix + format

# load it in every project (packaged route):
omp plugin link .
omp plugin doctor

# or rely on the project shim this repo already ships:
#   .omp/extensions/chatroom.ts -> ../../plugin/src/index.ts

# the room's runtime state lives in the GLOBAL omp session store (not in the repo):
#   <sessions>/rooms/<16 hex of the project path>/room/{config.json,<roomId>.jsonl,.lock}
#   <sessions> = getSessionsDir() = ~/.omp/agent/sessions  (or $XDG_DATA_HOME/omp/sessions)
# a project under os.tmpdir() stays project-local: <cwd>/.omp-room/room/…
# a legacy project-local room is copied into the global store once, then removed from the project
```
