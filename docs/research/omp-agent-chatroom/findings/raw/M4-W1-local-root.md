# M4-W1: Local Root Resolution

## Angle
How an extension resolves the shared `local://` root to an absolute filesystem path, the concrete path shape, subagent root sharing, and whether a `ctx` is required.

## Claims

### 1. Exact call to resolve `local://` → absolute path

- `resolveLocalUrlToPath(input: string | InternalUrl, options: LocalProtocolOptions, platform: NodeJS.Platform = process.platform): string` — `src/internal-urls/local-protocol.ts:285-301` (fetch 2026-10-06) — confidence: primary
- `resolveLocalRoot(options: LocalProtocolOptions, platform: NodeJS.Platform = process.platform): string` — `src/internal-urls/local-protocol.ts:229-240` (fetch 2026-10-06) — confidence: primary
- `buildEvalUrlRoots(options: LocalProtocolOptions): Record<string, string>` returns `{ local: resolveLocalRoot(options) }` — `src/internal-urls/local-protocol.ts:312-314` (fetch 2026-10-06) — confidence: primary
- `LocalProtocolOptions` interface: `{ getArtifactsDir?: () => string | null; getSessionId?: () => string | null }` — `src/internal-urls/local-protocol.ts:27-30` (fetch 2026-10-06) — confidence: primary
- Extension accesses options via `ctx.localProtocolOptions?: LocalProtocolOptions` — `src/extensibility/extensions/types.ts:504-505` (fetch 2026-10-06) — confidence: primary
- Wired into ctx at `localProtocolOptions: this.localProtocolOptions` — `src/extensibility/extensions/runner.ts:1415` (fetch 2026-10-06) — confidence: primary

**The exact call an extension makes:**
```ts
import { resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
const absPath = resolveLocalUrlToPath("local://claims/board.json", ctx.localProtocolOptions!);
```

### 2. Concrete absolute path shape

- `resolveLocalRoot` logic: if `options.getArtifactsDir?.()` returns non-null → `path.resolve(artifactsDir, "local")`; else → `path.join(os.tmpdir(), "omp-local", safeSessionId(options))` — `src/internal-urls/local-protocol.ts:229-240` (fetch 2026-10-06) — confidence: primary
- `safeSessionId`: `raw.replace(/[^a-zA-Z0-9_.-]/g, "_")`, fallback `"session"` — `src/internal-urls/local-protocol.ts:34-38` (fetch 2026-10-06) — confidence: primary
- `getArtifactsDir()` on SessionManager: returns `artifactsDirectoryFor(this.#sessionFile)` which is `sessionFile.slice(0, -5)` (strips `.jsonl`) — `src/session/session-manager.ts:3011-3013,150-153` (fetch 2026-10-06) — confidence: primary
- `getSessionId()` on SessionManager: returns `this.#sessionId` — `src/session/session-manager.ts:2988-2990` (fetch 2026-10-06) — confidence: primary
- AgentSession's `#localProtocolOptions()` wires `getArtifactsDir: () => this.sessionManager.getArtifactsDir()` and `getSessionId: () => this.sessionManager.getSessionId()` — `src/session/agent-session.ts:4680-4685` (fetch 2026-10-06) — confidence: primary

**Concrete path examples:**
- **Non-null artifactsDir** (normal session with JSONL on disk): `<artifactsDir>/local` e.g. `/home/yuzu/.omp/sessions/2026-10-06T12-00-00-000Z-abc123/local`
- **Null artifactsDir** (no session file yet): `$TMPDIR/omp-local/<safeSessionId>` e.g. `/tmp/omp-local/2026-10-06T12-00-00-000Z-abc123`
- **Windows long-path fallback**: `shortLocalRoot(options)` → `path.join(os.tmpdir(), "omp-local", safeSessionId(options))` — `src/internal-urls/local-protocol.ts:40-45` (fetch 2026-10-06) — confidence: primary

### 3. Subagents share the parent's root

- `sessionLocalProtocolOptions(session: ToolSession): LocalProtocolOptions` returns `session.localProtocolOptions ?? { getArtifactsDir: () => session.getArtifactsDir?.() ?? null, getSessionId: () => session.getSessionId?.() ?? null }` — `src/internal-urls/context.ts:19-26` (fetch 2026-10-06) — confidence: primary
- Doc comment: "subagents and multi-session hosts pin a parent/foreign root" — `src/internal-urls/context.ts:13-18` (fetch 2026-10-06) — confidence: primary
- `buildExecutorOptions` calls `sessionLocalProtocolOptions(session)` and passes result as `localProtocolOptions` in ExecutorOptions — `src/task/structured-subagent.ts:603,677` (fetch 2026-10-06) — confidence: primary
- ExecutorOptions field: `localProtocolOptions?: LocalProtocolOptions` with comment "Override local:// protocol options so subagent shares parent's local:// root" — `src/task/executor.ts:531-532` (fetch 2026-10-06) — confidence: primary
- Forwarded into SubagentSessionSpec options: `localProtocolOptions: options.localProtocolOptions` — `src/task/executor.ts:4233` (fetch 2026-10-06) — confidence: primary

**Mechanism:** Child ToolSession pins the parent's `LocalProtocolOptions` object reference. The child's `session.localProtocolOptions` is the parent's options object, so `resolveLocalRoot` in the child resolves to the same absolute path as the parent.

### 4. Resolving without `ctx` (module scope)

- `LocalProtocolHandler.resolveOptions(context?: ResolveContext): LocalProtocolOptions | undefined` — `src/internal-urls/local-protocol.ts:460-474` (fetch 2026-10-06) — confidence: primary
- Resolution order: (1) `context?.localProtocolOptions`, (2) `LocalProtocolHandler.#override` (process-global via `setOverride`), (3) first `main`-kind session in `AgentRegistry.global()` — `src/internal-urls/local-protocol.ts:440-474` (fetch 2026-10-06) — confidence: primary
- `LocalProtocolHandler.setOverride(value: LocalProtocolOptions | undefined): void` — `src/internal-urls/local-protocol.ts:431-433` (fetch 2026-10-06) — confidence: primary
- **RISK**: Without ctx, resolution falls to process-global override or first main session — NOT guaranteed to be the correct session in multi-session hosts. Fallback: capture `ctx.localProtocolOptions` from the first handler/tool call and store it in module scope.

### 5. Import specifier

- Package exports `"./*"` → `"./src/*.ts"` — `package.json:61-64` (fetch 2026-10-06) — confidence: primary
- `internal-urls/index.ts` re-exports `* from "./local-protocol"` — `src/internal-urls/index.ts:19` (fetch 2026-10-06) — confidence: primary
- **Allowed import specifiers:**
  ```ts
  import { resolveLocalUrlToPath, resolveLocalRoot, LocalProtocolOptions } from "@oh-my-pi/pi-coding-agent/internal-urls";
  // or
  import { resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
  ```
  Both resolve under the `"./*"` export wildcard.

## Searches
- `read src/internal-urls/local-protocol.ts:1-527` — full file
- `read src/internal-urls/context.ts:1-72` — full file
- `read src/internal-urls/index.ts:1-32` — full file
- `read src/extensibility/extensions/types.ts:489-533` — ctx type
- `read src/extensibility/extensions/runner.ts:1400-1433` — ctx wiring
- `read src/session/agent-session.ts:4660-4700` — #localProtocolOptions
- `read src/session/session-manager.ts:140-175,2995-3025` — artifacts dir + getSessionId
- `read src/task/structured-subagent.ts:590-695` — buildExecutorOptions
- `read src/task/executor.ts:520-545,4220-4245` — ExecutorOptions + forwarding
- `read package.json:56-527` — exports map
- `grep getSessionId() src/session/session-manager.ts` — confirmed at :2988

## Conflicting evidence
None. All sources agree.

## Gaps
- `LocalProtocolHandler.setOverride` is marked "Used by top-level SDK consumers" — no evidence of it being called in the extension runner path. Extensions should NOT rely on it being set.
- The `contextLocalProtocolOptions` function returns `undefined` when session has neither pinned options nor `getArtifactsDir` — `src/internal-urls/context.ts:33-36`. This means `ctx.localProtocolOptions` can be `undefined` in edge cases. Extension must null-check.
