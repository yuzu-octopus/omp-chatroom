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
   temp-dir project (which *is* project-local by rule) or an inert legacy directory that was
   already copied into the global store.
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
| `cd plugin && bun test tests/` | `bun test` over the 11 files in `plugin/tests/` | Framework is `bun:test` (`plugin/tests/drift.test.ts:1`). Orchestrator-verified: **202 pass / 0 fail, 11 files**. |
| `cd plugin && bun run typecheck` | `bunx --bun tsc --noEmit -p tsconfig.json` | `--bun` forces the local tsc through Bun. Orchestrator-verified: **0 errors**. |
| `cd plugin && bun run lint` | `bunx --bun @biomejs/biome check src tests` | Lint + format check + import organisation in one pass. Orchestrator-verified: **0 errors, 0 warnings**. |
| `cd plugin && bun run lint:fix` | same, with `--write` | Applies safe fixes **and** formats. Run before committing. |

5. There is **no `build` script and no build step at all** — `plugin/README.md:139-141` ("There is
   no build step"). Bun executes the TypeScript directly; the plugin is imported as a `.ts` module
   in-process by the host.
6. The three `@oh-my-pi/*` packages appear in **both** `peerDependencies` and `devDependencies`
   (`plugin/package.json:38-48`), so the workspace is self-installable while still declaring the
   host contract. `@types/bun` is dev-only (`plugin/package.json:48`).
7. Runtime floor: `engines.bun = ">=1.3.14"` (`plugin/package.json:35-37`). Verified present in
   this environment: Bun **1.4.2**.

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
| `room` | `RoomStore`, claim board, and the `room` tool (11 ops) |
| `wait-tools` | the three blocking tools `wait_for_claim`, `wait_for_agent`, `wait_for_message` |
| `panel` | the TUI `/room` overlay, its subcommands, and the board view |

11. All three are `"default": true` (`plugin/package.json:20,25,30`), so an install with
    `enabledFeatures: null` activates all of them.
12. **There is deliberately no `settings` block.** The plugin owns a real config file instead —
    `plugin/README.md:250-253`: even a declared setting is "CLI-facing validation only … read by
    `omp plugin config`, and `ExtensionAPI` has no `settings` property". Config surface is
    `<cwd>/.omp-room/room/config.json` plus the registered flags (`--room-panel-key`,
    `--room-cold-tree`), load order *registered flags → config file → built-in defaults*
    (`plugin/README.md:261-269`).
13. **No `skills` field either** — `PluginManifest` has none. The bundled skill
    (`plugin/skills/omp-agent-chatroom/SKILL.md`) is found by the plugin provider's conventional
    `skills/` directory scan (`plugin/package.json:43` ships it via `files`).
14. `files: ["src", "skills", "README.md"]` (`plugin/package.json:43`) — publish surface only.
    `tests/`, `biome.json`, `tsconfig.json` are **not** published; that is fine because
    `omp plugin link .` symlinks the source directory rather than copying it.
15. `type: "module"` (`plugin/package.json:5`) — ESM only.

## 4. peerDependencies vs devDependencies, and the host pin

16. Pin value in both blocks is **`18.8.6`**, exact, no range operators
    (`plugin/package.json:39-41, 45-47`).
17. **⚠️ The brief this investigation was given says "the plugin pins `18.8.7`" — that is wrong.**
    The repo pins `18.8.6`. Evidence, all read:
    - `plugin/package.json:39-41` and `:45-47` → `18.8.6`
    - `plugin/bun.lock:11-18` → workspace `devDependencies` + `peerDependencies` both `18.8.6`
    - `plugin/src/version.ts:3` → `export const HOST_VERSION_PIN = "18.8.6";`
    - installed: `plugin/node_modules/@oh-my-pi/pi-coding-agent/package.json:3` → `"version": "18.8.6"`
    - installed: `plugin/node_modules/@oh-my-pi/pi-tui/package.json:4` → `"version": "18.8.6"`
    - every `@oh-my-pi/*` entry in the `plugin/bun.lock` `packages` block resolves at `18.8.6`
    Any agent-notes doc that says 18.8.7 should be corrected to 18.8.6.
18. **Why the pin exists.** The plugin depends on **wildcard-only subpath imports** — specifiers
    that resolve through the host's `"./*"` export wildcard and are **not public API**
    (`plugin/src/version.ts:22-31` lists all ten; `AGENTS.md:156-158` states the risk). A host
    version bump can move or remove one with no semver signal on the plugin's side. Three defences:
    1. the exact pin (peer + dev, above);
    2. `plugin/src/version.ts:33-46` `assertHostVersion()`, which throws on mismatch and names
       `DEEP_SPECIFIERS.length` in the message; and
    3. `plugin/tests/drift.test.ts` — a **drift smoke test** that (a) reads the installed host
       `package.json` as text and asserts `version === HOST_VERSION_PIN`
       (`drift.test.ts:13-25`), (b) statically ESM-imports each deep specifier and asserts it
       resolves with no undefined members (`drift.test.ts:5-8, 35-55`), and (c) asserts named
       exports/arity for the two load-bearing ones, `escapeHarnessTags` and `resolveLocalRoot`
       (`drift.test.ts:57-62`).
19. The drift test uses **static ESM imports on purpose** — the host's deep subpaths declare only
    an `import` condition (no `require`), so a `createRequire().resolve()` gate reports false
    failures (`plugin/tests/drift.test.ts:2-4`; same finding at
    `docs/research/omp-agent-chatroom/P6-swarm-verified.md:50-52`). Do not "fix" this to a
    require-based check.
20. Convention in source: deep host imports are the exception, not the pattern.
    `plugin/src/store/compactor.ts:2` imports `streamSimple` from the **root** of
    `@oh-my-pi/pi-ai` with the comment "root export, NOT a deep import (K21/F3)" — treat
    root-first as the rule and deep-only as documented, gate-covered necessity.
21. Bumping the host therefore means: bump `package.json` peer+dev, bump `HOST_VERSION_PIN`, and let
    `bun test tests/drift.test.ts` tell you which specifier moved.

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
    used deliberately after a guarded check (e.g. `plugin/src/attention/delivery.ts:79`,
    `plugin/src/store/room-store.ts:225`). Do not "fix" `!` into an `if`/`as` when linting.
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
| 17-18 | `# Room runtime state …` / `.omp-room/` | **the room's runtime state** |

31. **`.omp-room/` is the excluded runtime state** (`.gitignore:17-18`). It is per-project working
    data (the JSONL log, the cold tree, `config.json`), never source.
32. `.gitignore` is a **pattern**, not a directory list — it matches at any depth. That is why
    `plugin/.omp-room/`, the root `.omp-room/`, and `plugin/undefined/.omp-room/` are all excluded
    by the single rule. Observed on disk: root `.omp-room/room/{config.json, <roomId>.jsonl}`,
    `plugin/.omp-room/room/{config.json, r3276b1a86d09ca82.jsonl}`.
33. `plugin/.gitignore` holds only `node_modules/` (`plugin/.gitignore:1`) — everything else comes
    from the root file.
34. Room id/root derivation is `r` + first 16 hex of sha256(root)
    (`plugin/src/ids.ts:2-5`), and the log path is `<root>/room/<roomId>.jsonl`
    (`plugin/src/ids.ts:6-9`). **The room root is `ctx.cwd + "/.omp-room"` — NOT the `local://`
    protocol root** (`plugin/src/store/room-store.ts:213-217`, with the explanatory comment
    "`ctx.cwd` is the project directory and is inherited by subagents … The `local://` protocol
    root is deliberately NOT used for the room"). Rationale in `plugin/README.md:271-276`:
    `ctx.localProtocolOptions` is per-*session*, so keying there gave every agent a private room.
    Consequence to know: **one omp process per project directory**, no cross-process locking.

## 8. The two load routes

35. **Project extension shim** — the route this repo actually uses.
    `.omp/extensions/chatroom.ts` is one line:

    ```ts
    export { default } from "../../plugin/src/index.ts";
    ```

    (`plugin/src/index.ts:17` is the `export default function roomExtension(pi: ExtensionAPI)`.)
    omp discovers project `.omp/extensions/*.ts` automatically, so a session started anywhere in
    this repository loads the room with no install (`plugin/README.md:33-40`).
36. **`omp plugin link .`** — the packaged route: `cd plugin && omp plugin link .` symlinks the
    directory into `~/.omp/plugins/node_modules/omp-agent-chatroom` and the manifest's
    `omp.extensions` entry is loaded at next session start (`plugin/README.md:20-26`). Use it when
    the room should be present in *every* project, not just this one.
37. **No build step either way** — the symlink points at the source directory; Bun imports TS
    natively.
38. **No hot reload.** Extension code is loaded once per session tree; editing plugin source needs
    a new session (or a session switch) before the change is live
    (`plugin/README.md:294-296`; mechanism at
    `docs/research/omp-agent-chatroom/findings/F15-plugin-packaging-devtooling.md` §Q2 —
    `loadExtensions()` binds factories once; `clearPluginRootsAndCaches()` only on session
    switch/resume).
39. **`omp plugin doctor`** is the verification command for the link route
    (`plugin/README.md:24`). Per F15 Q2/Q3 it is the read-only health check over the linked
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
    config belongs in `.omp-room/room/config.json`.
45. **Do not convert the deep imports to root imports blindly, and do not convert the drift test to
    `require`.** §18-20.
46. **`probes/` is outside every gate** — not in `tsconfig.include`, not in
    `biome.files.includes`, not in `files`. A probe can break unnoticed.
47. **Root `AGENTS.md` is stale on exactly this slice.** It says the host is "omp 18.6.1", that
    `engines`/`dependencies`/`scripts`/`tsconfig.json` are "**Not yet specified** in the plan", and
    that "**No linter or formatter is configured**" (`AGENTS.md:143-147`, `AGENTS.md:150-151`) —
    all four are now false. It also still describes state as "one module-level store keyed by the
    `local://` root" (`AGENTS.md:132-133`), which `plugin/src/store/room-store.ts:213-217`
    contradicts. `plugin/README.md` is the current authority for the dev-tooling surface; note it
    too is one version stale — `plugin/README.md` says the deep imports are "pinned to host
    `18.8.0`", while the actual pin is `18.8.6` (§17).
48. **Untracked directories on disk that you must not commit**: `.omp-room/`,
    `plugin/.omp-room/`, `plugin/undefined/`, `.tmp-swarm/`, `probes/` (untracked, unclassified).
    `.tmp-swarm/` is not in `.gitignore` — check `git status` before staging anything.

## 10. Cheat sheet

```sh
# everything, from the repo's only package:
cd plugin

bun test tests/                                    # 202 pass / 0 fail, 11 files (orchestrator-verified)
bunx --bun tsc --noEmit -p tsconfig.json           # 0 errors (orchestrator-verified)
bunx --bun @biomejs/biome check src tests          # lint+format check, 0 errors (orchestrator-verified)
bunx --bun @biomejs/biome check src tests --write  # autofix + format

# load it in every project (packaged route):
omp plugin link .
omp plugin doctor

# or rely on the project shim this repo already ships:
#   .omp/extensions/chatroom.ts -> ../../plugin/src/index.ts

# room runtime state lives here and is gitignored:
#   <project cwd>/.omp-room/room/<roomId>.jsonl
```
