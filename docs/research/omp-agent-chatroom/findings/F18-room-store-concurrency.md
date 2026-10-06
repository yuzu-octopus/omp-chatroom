# F18 — Room store: local:// root, atomic JSONL, import surface, hazards, test

## Angle
Everything needed to implement and test ONE in-process room store shared by N omp sessions:
(1) exact `local://` root resolution from inside an extension + subagent sharing; (2) a safe
atomic-append primitive for a multi-writer JSONL room log, with the omp house pattern;
(3) the importable host surface (exact specifiers, typed methods, `onChange`, sibling push);
(4) reentrancy/shutdown/timer/in-flight-tool hazards with mitigations; (5) a runnable
multi-agent acceptance check. Claims are from the installed omp 18.6.1 source, from the
round-3 worker files, or from probes I ran personally (`/tmp/roomprobe/`, 2026-10-06).

Worker raw files: `raw/M4-W1-local-root.md`, `raw/M4-W2-jsonl-atomicity.md`,
`raw/M4-W3-import-surface.md`, `raw/M4-W4-reentrancy-hazards.md`, `raw/M4-W5-test-harness.md`.

---

## Claims

### 1. Shared `local://` root from inside an extension

- `resolveLocalRoot(options: LocalProtocolOptions, platform: NodeJS.Platform = process.platform): string` — `src/internal-urls/local-protocol.ts:229-240` (fetch 2026-10-06) — confidence: primary
- `resolveLocalUrlToPath(input: string | InternalUrl, options: LocalProtocolOptions, platform: NodeJS.Platform = process.platform): string` — `src/internal-urls/local-protocol.ts:285-301` (fetch 2026-10-06) — confidence: primary
- `export interface LocalProtocolOptions { getArtifactsDir?: () => string | null; getSessionId?: () => string | null; }` — `src/internal-urls/local-protocol.ts:27-30` (fetch 2026-10-06) — confidence: primary
- Branch A (artifacts dir non-null): `path.resolve(artifactsDir, "local")`; branch B (null): `path.join(os.tmpdir(), "omp-local", safeSessionId(options))` where `safeSessionId` = `raw.replace(/[^a-zA-Z0-9_.-]/g, "_")` — `src/internal-urls/local-protocol.ts:229-240,34-38` (fetch 2026-10-06) — confidence: primary
- The extension surface is `ctx.localProtocolOptions?: LocalProtocolOptions` — `src/extensibility/extensions/types.ts:504-505`, wired `localProtocolOptions: this.localProtocolOptions` — `src/extensibility/extensions/runner.ts:1415` (fetch 2026-10-06) — confidence: primary

**Exact call an extension makes** (import specifier without `src/`, see §3):

```ts
import { resolveLocalRoot, resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
// inside a tool execute() or event handler:
const opts = ctx.localProtocolOptions;            // may be undefined — null-check
const root = resolveLocalRoot(opts);              // absolute dir
const logPath = resolveLocalUrlToPath("local://room/room.jsonl", opts); // absolute file path
```
— `src/internal-urls/local-protocol.ts:229-240,285-301`, `src/extensibility/extensions/types.ts:505` (fetch 2026-10-06) — confidence: primary

**Concrete absolute paths (probe-verified, 2026-10-06):**
- File-backed session (`SessionManager.create(cwd, dir)`): `sessionFile=/tmp/sess-4tgkXH/2026-10-06T07-31-32-434Z_<uuid>.jsonl` → `getArtifactsDir()` = same minus `.jsonl` → `resolveLocalRoot` = `/tmp/sess-4tgkXH/2026-10-06T07-31-32-434Z_<uuid>/local` — probe `/tmp/roomprobe/pathprobe.mjs` (2026-10-06) — confidence: primary; mechanism `artifactsDirectoryFor(sessionFile) = sessionFile.slice(0, -".jsonl".length)` — `src/session/session-manager.ts:150-153,3011-3013` (fetch 2026-10-06) — confidence: primary
- In-memory session (`SessionManager.inMemory()`): `getArtifactsDir()` returns `null` → `resolveLocalRoot` = `/tmp/omp-local/<sessionId>` (probe: `/tmp/omp-local/01a1101f-f865-…`) — probe `/tmp/roomprobe/pathprobe.mjs` (2026-10-06) — confidence: primary
- `resolveLocalUrlToPath("local://claims/board.json", opts)` → `<root>/claims/board.json` (probe: `/tmp/artifacts-…/local/claims/board.json`) — probe `/tmp/roomprobe/probe2.mjs` (2026-10-06) — confidence: primary

- **Subagents share the parent's root.** `sessionLocalProtocolOptions(session: ToolSession): LocalProtocolOptions` returns `session.localProtocolOptions ?? { getArtifactsDir: () => session.getArtifactsDir?.() ?? null, getSessionId: () => session.getSessionId?.() ?? null }`; doc comment: "subagents and multi-session hosts pin a parent/foreign root" — `src/internal-urls/context.ts:13-26` (fetch 2026-10-06) — confidence: primary
- Mechanism: `buildExecutorOptions` computes `const localProtocolOptions = sessionLocalProtocolOptions(session)` and passes it as `localProtocolOptions` into `ExecutorOptions`; comment on the field: "Override local:// protocol options for subagent local:// sharing" — `src/task/structured-subagent.ts:603,677`, `src/task/executor.ts:531-532` — forwarded to the child session spec at `src/task/executor.ts:4233` (fetch 2026-10-06) — confidence: primary
- So the child ToolSession holds the PARENT's options OBJECT; `resolveLocalRoot` in the child returns the parent's absolute root. A room store opened with the parent's root is visible to every nested subagent. — `src/internal-urls/context.ts:19-26` (fetch 2026-10-06) — confidence: primary
- Without `ctx`: `LocalProtocolHandler.resolveOptions(context?)` falls back to (2) process-global `setOverride` then (3) first `main`-kind ref in `AgentRegistry.global()` — `src/internal-urls/local-protocol.ts:440-474` (fetch 2026-10-06) — confidence: primary. **RISK**: branch (3) picks the wrong session in a multi-session host; fallback = capture `ctx.localProtocolOptions` from the first tool/handler call and store it (module scope is safe for this, it is not session-scoped identity).
- `ctx.localProtocolOptions` is optional and can be `undefined` (when the session has neither pinned options nor `getArtifactsDir` — `src/internal-urls/context.ts:33-36`) — so the room MUST null-check; fallback to `resolveLocalRoot({ getArtifactsDir: () => ctx.sessionManager.getArtifactsDir(), getSessionId: () => ctx.sessionManager.getSessionId() })` (`ReadonlySessionManager` exposes both — `src/session/session-manager.ts:652-679`) (fetch 2026-10-06) — confidence: primary

### 2. Atomic append + read for a multi-session JSONL room log

**House pattern (omp's own session transcript):** held fd opened once with `O_APPEND`, one sync `fs.writeSync` loop per whole line, no fsync.

- `const SESSION_WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT;` and `this.#fd = openCloexecSync(fpath, SESSION_WRITE_FLAGS | (flags === "w" ? fs.constants.O_TRUNC : fs.constants.O_APPEND));` — `src/session/session-storage.ts:24,244-247` (fetch 2026-10-06) — confidence: primary
- `const written = fs.writeSync(this.#fd, buf, offset, buf.length - offset);` inside `#writeNow(line, originalSize)` with a `written === 0 → throw "Short write"` guard — `src/session/session-storage.ts:307-318` (fetch 2026-10-06) — confidence: primary
- Deliberately synchronous, in-body: "Write in-body so software crash after the call still sees the entry." — `src/session/session-storage.ts:350-359` (fetch 2026-10-06) — confidence: primary
- Line contract: "`line` MUST include the trailing newline." — `src/session/session-storage.ts:43` (fetch 2026-10-06) — confidence: primary
- No fsync anywhere on the transcript path: "No `fsync` — power loss may still drop the last page." / "flush/flushSync remain no-op drains (no fsync)." — `src/session/session-storage.ts:39-40,54-57,356` (fetch 2026-10-06) — confidence: primary
- On write failure the writer rolls back with `fs.ftruncateSync(this.#fd, originalSize)` so a failed append leaves no partial bytes — `src/session/session-storage.ts:319-347` (fetch 2026-10-06) — confidence: primary

**Chosen primitive (recommended for the room log):**
```ts
import * as fs from "node:fs";
const fd = fs.openSync(roomLogPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND);
function appendLine(line: string): void {          // line MUST end with "\n"
  const buf = Buffer.from(line, "utf-8");
  let off = 0;
  while (off < buf.length) {
    const w = fs.writeSync(fd, buf, off, buf.length - off);
    if (w === 0) throw new Error("Short write");
    off += w;
  }
}
```
— pattern cited from `src/session/session-storage.ts:244-247,307-318` (fetch 2026-10-06) — confidence: primary

- Atomicity basis: Linux `write(2)`: "If the file was open(2)ed with O_APPEND, the file offset is first set to the end of the file before writing. The adjustment of the file offset and the write operation are performed as an atomic step." — https://man7.org/linux/man-pages/man2/write.2.html (fetch 2026-10-06) — confidence: primary
- Single-threaded JS: two sessions in one process can never interleave bytes inside a sync `fs.writeSync`; the hazard is only async writers (`fs.promises.appendFile`, `Bun.write`, FileSink auto-flush) — https://nodejs.org/api/fs.html (promise API "not synchronized or threadsafe… data corruption may occur") (fetch 2026-10-06) — confidence: primary
- Probe: 2 concurrent async writers × 500 lines (200 B pad) with `fs.writeSync` on a held `O_APPEND` fd → `lines=1000 bad=0 trailingNewline=true`; 5 writers × 400 lines (4 KiB pad) via `fs.appendFileSync(path,…)` → `2000/2000 bad=0`; 4 writers × 6 lines (1 MiB pad) via `fs.promises.appendFile(path,…)` → `24/24 bad=0` — probes `/tmp/roomprobe/probe2.mjs`, `/tmp/roomprobe/stress.mjs`, `/tmp/roomprobe/probe3.mjs` (2026-10-06) — confidence: primary. (Sync remains the recommendation: it removes the async window entirely and matches the house pattern.)
- `Bun.write(destination, data)` is NOT an append API (overwrites/truncates); `Bun.file(path).writer()` (`FileSink`) documents only `write/flush/end/start/ref/unref` and a `highWaterMark` option — no append/open flag — https://bun.sh/reference/bun/write, https://bun.sh/docs/runtime/file-io (fetch 2026-10-06) — confidence: secondary. **RISK** (no positive "cannot append" statement) → fallback: `node:fs` O_APPEND fd (Bun implements `node:fs` compat).
- **Partial-line policy:** reader splits on `\n`, `JSON.parse` each complete line, and on the FIRST failure stops at the last valid line (house precedent: "Aggregate the durable journal in one linear scan; malformed lines are ignored." — `src/blob-broker/savings.ts:91-92`). A torn FINAL line is possible only on process kill / ENOSPC between a short write and its retry — `src/session/session-storage.ts:311-318` (fetch 2026-10-06) — confidence: primary
- **fsync policy:** NO fsync (matches omp). Durability = OS page cache. If required, `fs.fsyncSync(fd)` after each record — https://nodejs.org/api/fs.html (fetch 2026-10-06) — confidence: primary
- **Locking verdict:** NO in-process lock needed — sync writes are serialized by the event loop and O_APPEND makes each `write(2)` atomic. `node:fs` exposes NO `flock`/`fcntl`; the only OS-backed lock omp has is `@oh-my-pi/pi-natives` `FileLock` (abstract socket on Linux / named mutex on Windows / flock sidecar elsewhere), wrapped by `tryAcquireFileLock`/`withFileLockSync` — `src/session/session-storage.ts:5,545-561`, `@oh-my-pi/pi-utils/src/file-lock.ts:43-44,91-98` (fetch 2026-10-06) — confidence: primary. A cross-process lock is needed ONLY if a second PROCESS writes the room log.
- **Notification verdict:** use a module-level listener set in the extension module (shared across the session tree, `omp://extensions.md` Runtime model) plus `AgentRegistry.global().onChange` (process-global — `src/registry/agent-registry.ts:348-351`). Do NOT rely on `pi.events` (per-session `EventBus`, `src/sdk.ts:1632`) and do NOT use `fs.watch` (omp uses it only for debounced config-dir reload — `src/config/settings.ts:1149-1196`). `fs.watch` DOES work for a same-process append (probe: `WATCH event change big.jsonl` on the file, `DIRWATCH change big.jsonl` on the dir — `/tmp/roomprobe/probe3.mjs`, 2026-10-06) — confidence: primary — but it adds inotify latency/coalescing and is only needed to observe a second process.

### 3. What an extension can import — import table

- Exports block (verbatim excerpt): `"." → {types: ./dist/types/index.d.ts, import: ./src/index.ts}`, `"./*" → {types: ./dist/types/*.d.ts, import: ./src/*.ts}`, `"./registry/*" → ./src/registry/*.ts`, `"./session/*" → ./src/session/*.ts`, `"./internal-urls" → ./src/internal-urls/index.ts`, `"./internal-urls/*" → ./src/internal-urls/*.ts`, `"./utils/*" → ./src/utils/*.ts`, `"./task" → ./src/task/index.ts`, `"./tools" → ./src/tools/index.ts` — `package.json:56-527` (fetch 2026-10-06) — confidence: primary
- **Probe (decisive):** subpaths WITHOUT a `src/` segment resolve; subpaths WITH `src/` FAIL. `Bun.resolveSync("@oh-my-pi/pi-coding-agent/registry/agent-registry")` → `…/src/registry/agent-registry.ts`; `…/src/registry/agent-registry` → FAIL; same pattern for `sdk`, `utils/event-bus`, `session/agent-session`, `session/agent-session-types`, `task`, `tools`, `internal-urls/local-protocol` — probe `/tmp/roomprobe/spec.mjs` (2026-10-06) — confidence: primary
- Extension modules are loaded through a Bun resolve shim that rewrites every `@(oh-my-pi|mariozechner|earendil-works)/pi-*` specifier to the HOST copy, so a plugin's imports of these subpaths land on the running host module graph — `src/extensibility/plugins/legacy-pi-compat.ts:805-857,1077-1088,2745-2795` (fetch 2026-10-06) — confidence: primary

| Import specifier | What it gives | Primary source | RISK |
|---|---|---|---|
| `pi.pi` (on `ExtensionAPI`) | namespace of ALL root exports: `AgentRegistry`, `AgentRef`, `AgentSession`, `MAIN_AGENT_ID`, `SessionManager`, `Settings`, `ToolSession`, tool classes | `src/extensibility/extensions/types.ts:1375`, `src/extensibility/extensions/loader.ts:192` | none — prefer this |
| `@oh-my-pi/pi-coding-agent` | same root exports (665 keys probe-verified; `AgentRegistry.global` present; `MAIN_AGENT_ID === "Main"`) | `src/index.ts:1-82`, probe `/tmp/roomprobe/probe5.mjs` | none |
| `@oh-my-pi/pi-coding-agent/internal-urls/local-protocol` | `resolveLocalRoot`, `resolveLocalUrlToPath`, `buildEvalUrlRoots`, `copyLocalArtifacts`, `LocalProtocolHandler`, `LocalProtocolOptions` | `src/internal-urls/local-protocol.ts:229,285,312,249,409,27`, probe `/tmp/roomprobe/probe4.mjs` | none (deep, covered) |
| `@oh-my-pi/pi-coding-agent/registry/agent-registry` | `AgentRegistry`, `AgentRef`, `RegistryEvent`, `MAIN_AGENT_ID`, `AgentKind`, `AgentStatus` | `src/registry/agent-registry.ts:63-96,115,17`, probe | none |
| `@oh-my-pi/pi-coding-agent/utils/event-bus` | `EventBus` class (NOT a root export) | `src/utils/event-bus.ts:3`, probe `/tmp/roomprobe/probe5.mjs` | deep only — or use `pi.events` |
| `pi.events` (on `ExtensionAPI`) | the session's `EventBus` instance | `src/extensibility/extensions/types.ts:1695`, `loader.ts:196` | per-session instance, not process-global |
| `@oh-my-pi/pi-coding-agent/session/agent-session` | `AgentSession` class | `src/session/agent-session.ts:662` | none |
| `@oh-my-pi/pi-coding-agent/session/agent-session-types` | `SteerOptions`, `FollowUpOptions`, `SendUserMessageOptions` | `src/session/agent-session-types.ts:429-451` | none |
| `@oh-my-pi/pi-coding-agent/task` | `AgentOutputManager`, agent discovery | `src/task/index.ts:134-138` | deep only |
| `@oh-my-pi/pi-utils/file-lock` | `tryAcquireFileLock`, `acquireFileLock`, `withFileLock`, `withFileLockSync` | `pi-utils/src/file-lock.ts:43,48,77,91`, probe `/tmp/roomprobe/probe4.mjs` | only if a 2nd process writes |

- `AgentRegistry` is a public root export: `export { type AgentRef, AgentRegistry, MAIN_AGENT_ID } from "./registry/agent-registry";` — `src/sdk.ts:898`, re-exported `src/index.ts:40` (fetch 2026-10-06) — confidence: primary
- `static global(): AgentRegistry` (lazy singleton) — `src/registry/agent-registry.ts:115-120` (fetch 2026-10-06) — confidence: primary
- `AgentRef` verbatim: `session: AgentSession | null;` with comment "Null exactly when parked/aborted." — `src/registry/agent-registry.ts:63-80` (fetch 2026-10-06) — confidence: primary. So `session` is typed `AgentSession` and NULLABLE, not optional — a room push MUST null-check.
- `onChange(listener: RegistryListener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }` with `type RegistryListener = (event: RegistryEvent) => void` and `RegistryEvent = {type:"registered"|"status_changed"|"metadata_changed"|"removed"; ref: AgentRef}` — `src/registry/agent-registry.ts:84-90,348-351` (fetch 2026-10-06) — confidence: primary
- Sibling-session push (verbatim signatures):
  - `async sendCustomMessage<T = unknown>(message: CustomMessagePayload<T>, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" | "aside"; queueChipText?: string; acceptTerminalEmptyStop?: boolean; }): Promise<boolean>` — `src/session/agent-session.ts:8324-8334` (fetch 2026-10-06) — confidence: primary
  - `async steer(text: string, images?: ImageContent[], options?: SteerOptions): Promise<void>` — `src/session/agent-session.ts:7829` — confidence: primary
  - `async followUp(text: string, images?: ImageContent[], options?: FollowUpOptions): Promise<void>` — `src/session/agent-session.ts:7852` — confidence: primary
  - `async sendUserMessage(content: string | (TextContent | ImageContent)[], options?: SendUserMessageOptions): Promise<void>` — `src/session/agent-session.ts:8518-8521` — confidence: primary
  - `deliverIrcMessage(msg: IrcMessage): Promise<"injected" | "woken">` / `drainPendingIrcInboxMessages(agentId: string, opts?): IrcMessage[]` — `src/session/agent-session.ts:10386-10388,10381-10383` — confidence: primary
- **Probe (decisive for sibling push):** two `createAgentSession` sessions A and B in one process, shared private `AgentRegistry`; `registry.get("B").session.sendCustomMessage({customType:"room:test", content:"hello B from A", display:true}, {})` returned `false` (queued, no turn) and B's `message_start` handler observed `{agent:"B", role:"custom", customType:"room:test"}` — probe `/tmp/roomprobe/sibprobe.mjs` (2026-10-06) — confidence: primary. So a plugin CAN push into a sibling's context; `false` means "no turn started", not "not delivered".
- `pi.pi` is the entire package namespace bound at construction: `constructor(public readonly pi: typeof PiCodingAgent, …)` with `import * as PiCodingAgent from "../../index"` — `src/extensibility/extensions/loader.ts:29,192` (fetch 2026-10-06) — confidence: primary

### 4. Reentrancy / hazard analysis

- **Factory rebind, shared module graph.** Module imported once (`importExtensionModule`), then `bindPreparedExtensions` creates `const runtime = new ExtensionRuntime()` and re-runs each factory with a NEW per-session API: `const api = new ConcreteExtensionAPI(PiCodingAgent, extension, runtime, cwd, eventBus); await withHostGuard(() => runExtensionFactory(factory, api, runtime));` — `src/extensibility/extensions/loader.ts:486-502,451-452` (fetch 2026-10-06) — confidence: primary. Doc: "child sessions reuse imported factories but bind fresh APIs and extension registrations; module-level variables remain shared across those sessions" — `omp://extensions.md` (Runtime model) (fetch 2026-10-06) — confidence: primary
- **Probe:** at factory time the API has NO `agent`/`ctx` (`factory: has agent=false, has ctx=false`); `ctx.agent` exists only inside handlers/tool execute — probe `/tmp/roomprobe/hazardprobe4.mjs` (2026-10-06) — confidence: primary. Hazard (a): storing `ctx`/`api` at module scope routes delivery to whichever session bound last (`initialize()` overwrites the shared runtime's action slots: `this.runtime.sendMessage = actions.sendMessage;` — `src/extensibility/extensions/runner.ts:776`). **Mitigation:** take `ctx` per call (5th arg of `execute` — `types.ts:707-713`) and key all shared structures by `ctx.agent.id`.
- Hazard (b): `pi.sendMessage` bound to the last-bound session, or `ExtensionRuntimeNotInitializedError` if called before that session's `initialize()` — `src/extensibility/extensions/loader.ts:113-115,296-301` (fetch 2026-10-06) — confidence: primary. **Mitigation:** deliver through the CURRENT `ctx`, or push point-to-point via `AgentRef.session.sendCustomMessage` (§3).
- Hazard (c): a shared timer handle at module scope leaks earlier handles and `ctx.clearTimer` clears only the last. Raw `setInterval` throw → process-fatal `uncaughtException` — `src/extensibility/extensions/managed-timers.ts:4-8` (fetch 2026-10-06) — confidence: primary. **Mitigation:** `ctx.setInterval`/`setTimeout`/`clearTimer` only, handle in the factory closure.
- Hazard (d): a session's `session_shutdown` clears THAT runner's timers — `clearManagedTimers(): void { this.#managedTimers.clearAll(); }` — `src/extensibility/extensions/runner.ts:1449-1451`, `managed-timers.ts:58-64` (fetch 2026-10-06) — confidence: primary. **Probe:** after `session.dispose()` the managed interval stopped permanently (`ticks 0 → 0`, frozen) — `/tmp/roomprobe/hazardprobe5.mjs` (2026-10-06) — confidence: primary. If the room's tick was scheduled on a session that then shuts down (subagent done, `/tan` clone, session switch), the tick dies. **Mitigation:** refcount room background work per live session; clear only when the count hits zero; or run the tick from the main session only.
- Hazard (e): module-level Map growth without a session key → unbounded growth, cross-session wake, retained `ctx` graphs. **Mitigation:** key by `ctx.agent.id`, keep a per-session owned-key `Set`, prune in `session_shutdown`. Precedent: `disposeFileFallbacks()` runs in the `emitSessionShutdownEvent` `finally` — `src/extensibility/extensions/runner.ts:441-450` (fetch 2026-10-06) — confidence: primary
- **`session_shutdown` 2-second budget.** `export const SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS = 2_000;` — `src/extensibility/extensions/runner.ts:154` (fetch 2026-10-06) — confidence: primary. Rationale: fire-and-forget teardown; "A hung handler … MUST NOT hold Ctrl+C / `/exit` hostage" — `runner.ts:145-153`. Dispatch: all shutdown handlers are pushed as promises and awaited together under the 2s cap — `runner.ts:1585-1597` — confidence: primary. On timeout the handler's signal aborts, the promise is given one macrotask of grace then abandoned (`await Promise.race([workPromise.then(()=>undefined,()=>undefined), Bun.sleep(0)])` — `runner.ts:354-363`), and the runner logs+emits an error without rethrowing — `runner.ts:1548-1560` (fetch 2026-10-06) — confidence: primary. After the emit, dispose bounds the run drain at `POST_PROMPT_DRAIN_TIMEOUT_MS = 5_000` — `src/session/agent-session.ts:501,5430-5437` — confidence: primary. **Probe:** a shutdown handler sleeping 5 s did NOT delay dispose past ~2.0 s (`shutdown start t=981`, `dispose returned t=2999`) — `/tmp/roomprobe/hazardprobe5.mjs` (2026-10-06) — confidence: primary. **What MUST finish inside 2 s:** only synchronous work, or a sync flush. Design: append synchronously per mutation (no shutdown flush needed), or a sync `flushSync()`-style write in the handler — never an awaited async flush.
- **Managed timers.** `setInterval`/`setTimeout` `unref?.()` and register; `clear` deletes+clears; `clearAll` clears everything; `#run` catches sync throws and `.catch`es returned promises — `src/extensibility/extensions/managed-timers.ts:28-82`; wired as `setInterval: (callback, ms, ...args) => this.#managedTimers.setInterval(...)` etc. — `src/extensibility/extensions/runner.ts:1417-1419`; per-runner instance at `runner.ts:556-558` (fetch 2026-10-06) — confidence: primary
- **In-flight blocking tool teardown.** The loop awaits `await tool.execute(toolCall.id, executionArgs, record.signal, …)` unboundedly — `@oh-my-pi/pi-agent-core/src/agent-loop.ts:3572-3586` (fetch 2026-10-06) — confidence: primary. Dispose calls `this.agent.abort()` → `abort(reason) { this.#abortController?.abort(reason); }` — `src/session/agent-session.ts:5358`, `pi-agent-core/src/agent.ts:1448-1450` — confidence: primary. The loop signal is composed into every tool's per-call signal (`nonInterruptibleSignal = signal ?? …`) — `agent-loop.ts:3249-3252,3288` — confidence: primary. **Probe:** a tool blocking on a 120 s promise with an `abort` listener had its signal fire on `session.dispose()`, threw, ran `finally`, and dispose returned in 42 ms (`disposeMs: 42 sawAbort: true`) — `/tmp/roomprobe/teardown2.mjs` (2026-10-06) — confidence: primary. So the abort signal DOES fire; a tool that ignores it is abandoned after the 5 s drain (dispose logs "Active agent run still settling at dispose deadline") — `src/session/agent-session.ts:5430-5441` — confidence: primary. Reference implementation for a teardown-safe blocking tool: `src/tools/wait.ts:121-151` (abort listener + `Promise.race` with a timeout + `finally` cleanup) and `wait.ts:160-172` (distinguish `TOOL_INTERRUPT_ABORT_REASON` from a real abort) — confidence: primary. **MUST:** listen to `signal`, bound the wait, remove the waiter in `finally`, `unref` any timer, clear that session's waiters on `session_shutdown`.
- **Probe:** disposing ONE session fires `session_shutdown` only for that session's runner and emits registry `removed:<id>`; the shared `EventBus` instance stays alive and still delivers for the surviving session — `/tmp/roomprobe/hazardprobe.mjs` (2026-10-06) — confidence: primary
- **Recommended invariants:** I1 all room mutations synchronous (no `await` between read and write of cursor/claim maps — the JS thread makes a sync critical section atomic); I2 no session-scoped value at module scope; I3 key every shared structure by `ctx.agent.id` and prune on `session_shutdown`; I4 timers via `ctx.setInterval` only, refcounted; I5 sync append per mutation (no awaited shutdown flush); I6 every `wait_for_*` promise settles (signal + timeout + `finally`).

### 5. How to test — runnable acceptance check

- `createAgentSession(options?): Promise<CreateAgentSessionResult>` with `{ session, extensionsResult, eventBus, … }` — `src/sdk.ts:1618,847-866` (fetch 2026-10-06) — confidence: primary
- Shared bus: `const eventBus = options.eventBus ?? new EventBus();` — `src/sdk.ts:1632`; shared `local://`: `localProtocolOptions?: LocalProtocolOptions` on the options and `toolSession.localProtocolOptions = localProtocolOptions` — `src/sdk.ts:790-791,2389-2397`; distinct identity: `const resolvedAgentId = options.agentId ?? options.parentTaskPrefix ?? MAIN_AGENT_ID;` — `src/sdk.ts:2135` (fetch 2026-10-06) — confidence: primary
- Inline extension factory: `extensions?: ExtensionFactory[]` — `src/sdk.ts:629-630`; `export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>` — `src/extensibility/extensions/types.ts:1780` (fetch 2026-10-06) — confidence: primary
- Extension tools are auto-activated UNLESS `hidden`/`defaultInactive`; `loadMode: "essential"` keeps them top-level — `src/sdk.ts:3956-3967,3931-3936`, `src/extensibility/extensions/types.ts:683-684` (fetch 2026-10-06) — confidence: primary. **Probe:** with no `loadMode`, `session.getActiveToolNames().includes("room_probe") === false`; with `loadMode: "essential"` it is `true` — `/tmp/roomprobe/hazardprobe2.mjs` vs `hazardprobe3.mjs` (2026-10-06) — confidence: primary
- **Deterministic (no model) harness:** drive the tool directly — `session.getToolByName("room")` (`src/session/agent-session.ts:5897`) then `tool.execute(toolCallId, params, signal, onUpdate)`; the wrapper binds the session's real `ExtensionContext` — `src/extensibility/extensions/wrapper.ts:103-128` (fetch 2026-10-06) — confidence: primary
- **Full end-to-end probe (ran green, 2026-10-06):** room extension with a module-level store; two sessions Alpha/Beta sharing one `EventBus`, one private `AgentRegistry`, one `localProtocolOptions`; Alpha prompted to call `room{op:"claim",claimId:"src/auth.ts"}`, Beta prompted to call `room{op:"wait_claim",claimId:"src/auth.ts"}`. Result: Beta's blocking tool resolved with owner `Alpha`; on-disk log `<artifactsDir>/local/room.jsonl` = 1 line `{"op":"claim","from":"Alpha","claimId":"src/auth.ts","ts":…}` — `/tmp/roomprobe/e2e/run.mjs` + `e2e/room-ext.mjs` (2026-10-06) — confidence: primary

Minimal acceptance check (deterministic variant; `room` op names/record shape are the planned Round-2 surface = `[SPEC]`):

```ts
import { test, expect } from "bun:test";
import * as fs from "node:fs"; import * as os from "node:os"; import * as path from "node:path";
import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import roomExtension, { __roomTest } from "../src/extension"; // module-level store lives here

async function newSession(bus: EventBus, registry: AgentRegistry, root: string, id: string) {
  const localProtocolOptions = { getArtifactsDir: () => root, getSessionId: () => id };
  const { session } = await createAgentSession({
    eventBus: bus, localProtocolOptions, extensions: [roomExtension],
    agentRegistry: registry, agentId: id, sessionManager: SessionManager.inMemory(),
    disableExtensionDiscovery: true, enableMCP: false, enableLsp: false, hasUI: false,
  });
  return session;
}

test("room: post -> read -> wait_for_claim", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-"));
  __roomTest.store.reset();                                   // process-wide singleton
  const bus = new EventBus(); const registry = new AgentRegistry();
  const a = await newSession(bus, registry, root, "AgentA");
  const b = await newSession(bus, registry, root, "AgentB");
  const roomA = a.getToolByName("room")!, roomB = b.getToolByName("room")!;

  // A3: B's blocking wait starts FIRST and must resolve only after A posts.
  const waitP = roomB.execute("c-wait", { op: "wait_claim", claimId: "build" }, undefined, undefined);
  let done = false; waitP.then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);                                   // still blocked

  // A1: A claims; B reads it back.
  await roomA.execute("c-claim", { op: "claim", claimId: "build", text: "I own the build" }, undefined, undefined);
  const readB = await roomB.execute("c-read", { op: "read" }, undefined, undefined);
  expect((readB.details as any).messages.some((m: any) => m.from === "AgentA" && m.claimId === "build")).toBe(true);

  const winner = await Promise.race([waitP, Bun.sleep(1000).then(() => "TIMEOUT")]);
  expect(winner).not.toBe("TIMEOUT");                          // A3

  // A2: durable JSONL has exactly the expected lines.
  const logPath = resolveLocalUrlToPath("local://room.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentA" });
  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ op: "claim", from: "AgentA", claimId: "build" });

  await a.dispose(); await b.dispose();
});
```

- Asserts: **A1** cross-session read returns A's claim (proves the shared module store); **A3** a blocking `wait_claim` in a DIFFERENT session resolves only after A posts (proves cross-session notification, no polling); **A2** the on-disk JSONL has exactly the expected lines (proves the append pattern). Output that proves the room works = the resolved `wait_claim` result naming A + the parsed log line — matches the probe in `/tmp/roomprobe/e2e/run.mjs` (2026-10-06) — confidence: primary
- Prompt-level variant (needs a model; `modelRegistry.getAvailable()` returned 47 models in this environment, probe `/tmp/roomprobe/modelprobe.mjs`, 2026-10-06): replace the direct `execute()` calls with `session.prompt(...)` on two sessions and assert the final assistant text + the log. Probe used `opencode-go/deepseek-v4-flash`.
- `task`-tool path: a test can call `session.getToolByName("task")!.execute(...)` — `src/task/index.ts:844-849` — confidence: primary; children register in `AgentRegistry.global()` (no `agentRegistry` forwarded — `src/task/executor.ts:4178-4235`, default `src/sdk.ts:2134`) and are readable at `agent://<id>` / `history://<id>` (`src/internal-urls/agent-protocol.ts:218`, `history-protocol.ts:285-334`) — confidence: primary. But a child needs a model turn to yield.
- Eval path: `agent()`/`workpool` spawn through the same host bridge (`runStructuredSubagent`, `keepAlive: true`) into the same process + `AgentRegistry.global()` — `src/eval/agent-bridge.ts:216-243`, `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary. The eval CELL runs in a subprocess kernel, so a room test must use the host bridge, not import the module inside the cell.

---

## Risks

- **RISK — deep subpath imports.** `"./*"` is documented and probe-verified, but it is a deep import into `src/*.ts`. Fallback: use `pi.pi` (root namespace) for everything it exports; only `EventBus` (deep `utils/event-bus`) and `file-lock` genuinely need a subpath. Verified resolving: `internal-urls/local-protocol`, `internal-urls`, `registry/agent-registry`, `utils/event-bus`, `session/agent-session`, `session/agent-session-types`, `task`, `tools` (probe 2026-10-06). A `src/`-prefixed specifier does NOT resolve.
- **RISK — `EventBus` is not a root export.** `pi.events` is a per-session instance; two independently created sessions do NOT share it unless the embedder passes the same instance (`src/sdk.ts:1632`). Fallback for the room: module-level listener set + `AgentRegistry.global().onChange`; use `pi.events` only for same-session signalling.
- **RISK — `Bun.write`/`FileSink` have no documented append mode.** Fallback: `node:fs` O_APPEND fd + `fs.writeSync` (Bun implements `node:fs` compat).
- **RISK — a second PROCESS writing the room log** breaks the single-process atomicity assumption. Fallback: `@oh-my-pi/pi-utils/file-lock` (`tryAcquireFileLock`/`withFileLockSync`) or `@oh-my-pi/pi-natives` `FileLock` around appends; or an O_APPEND-only design with reader torn-line tolerance.
- **RISK — `interruptible` is not on the typed `ToolDefinition`** (`src/extensibility/extensions/types.ts:669-744`); the loop reads `tool.interruptible` (`pi-agent-core/src/agent-loop.ts:3269-3282`) and `applyToolProxy` forwards own keys (`src/extensibility/tool-proxy.ts:16-31`). Fallback: do NOT rely on it; a room wait tool observes `signal` directly + bounds its own timeout.
- **RISK — extension tool activation.** A `discoverable`-mode tool is not in the active set; a test (or the room itself) must set `loadMode: "essential"` or call `setActiveToolsByName`. Fallback: register the room tool with `loadMode: "essential"`.
- **RISK — module singleton leaks across tests** in one process. Fallback: `reset()` on the store in `beforeEach`, or key the store by the `local://` root.
- **RISK — no SDK `streamFn` seam** (`CreateAgentSessionOptions` exposes `getApiKey` but no transport override — `src/sdk.ts:534`), so a full prompt-level test needs a live/keyless model. Fallback: the deterministic `getToolByName(...).execute(...)` harness above.
- **RISK — `ctx.localProtocolOptions` may be `undefined`** (session with neither pinned options nor artifacts dir — `src/internal-urls/context.ts:33-36`). Fallback: derive from `ctx.sessionManager.getArtifactsDir()/getSessionId()`.
- **RISK — `AgentRef.session` is `null` when parked/aborted** (`src/registry/agent-registry.ts:70`). Fallback: skip/report; a parked agent is revived by a `write agent://<id>`.

## Searches
- Read: `src/internal-urls/local-protocol.ts`, `src/internal-urls/context.ts`, `src/extensibility/extensions/types.ts`, `runner.ts`, `loader.ts`, `managed-timers.ts`, `wrapper.ts`, `src/extensibility/tool-proxy.ts`, `src/registry/agent-registry.ts`, `src/session/agent-session.ts`, `session-storage.ts`, `session-manager.ts`, `src/utils/event-bus.ts`, `src/tools/wait.ts`, `src/task/structured-subagent.ts`, `src/task/executor.ts`, `src/sdk.ts`, `src/index.ts`, `src/eval/agent-bridge.ts`, `src/extensibility/plugins/legacy-pi-compat.ts`, `pi-agent-core/src/agent-loop.ts`, `pi-agent-core/src/agent.ts`, `pi-utils/src/file-lock.ts`, `pi-natives/native/loader-state.js`, `package.json` exports.
- Docs: `omp://extensions.md`, `omp://sdk.md`, `omp://tools/task.md`, `omp://tools/eval.md`, `xd://eval/agents`.
- Probes (2026-10-06, `/tmp/roomprobe/`): `probe2.mjs`, `probe3.mjs`, `probe4.mjs`, `probe5.mjs`, `spec.mjs`, `stress.mjs`, `pathprobe.mjs`, `sibprobe.mjs`, `hazardprobe.mjs`, `hazardprobe2/3/4/5.mjs`, `teardown2.mjs`, `modelprobe.mjs`, `e2e/run.mjs`.

## Conflicting evidence
- `history-protocol.ts:7-11` doc-comment claims the eval `agent()` bridge is one-shot (`keepAlive: false`); the code sets `keepAlive: true` (`src/eval/agent-bridge.ts:237`) and `omp://tools/eval.md` says eval subagents are kept alive. Trust code + doc.
- `history://` hard-codes `AgentRegistry.global()` (`history-protocol.ts:319,343`) while `agent://` prefers `context?.agentRegistry ?? global` (`agent-protocol.ts:218`). A room test that passes a PRIVATE registry sees `agent://` follow the session but `history://` follow the global → keep the global registry + distinct `agentId` in tests.
- `subagentEventBus` is forwarded to child sessions; `eventBus` is NOT (`src/task/executor.ts:4216-4219`). A room built on a shared `eventBus` cannot rely on the bus reaching task-path subagents — the module singleton + `AgentRegistry.global()` are the real shared channels.
- F0/Round-2 said `ctrl+s`-style reservations etc. — unrelated; no conflict here.

## Gaps
- Process-exit guarantee after a 2 s shutdown timeout was not traced end-to-end (bounds confirmed: 2 s handler + 5 s run drain + second Ctrl+C hard abort). Probe confirmed dispose returns ≈2 s after a 5 s handler starts.
- `@oh-my-pi/pi-natives` native lock source not audited (packaged binary only); behavior taken from house comments.
- `Bun.write`/append durability under hard SIGKILL untested — only graceful-exit durability bounded; sync append per mutation is the design that survives `process.exit`.
- Whether `session_shutdown` fires for EVERY subagent session was inferred (each session builds its own `ExtensionRunner`; probe confirmed one emit for one disposed session). Design the room to be correct either way (prune by `ctx.agent.id`, refcount timers).
- Exact `PromptOptions` fields for a prompt-level test variant not read.
- `[SPEC]` room op names (`post`/`read`/`claim`/`wait_claim`) and the JSONL record shape are the planned Round-2 surface; the cited APIs (sessions, bus, local root, `getToolByName`, `execute`, `AgentRegistry.onChange`) are all real today.
