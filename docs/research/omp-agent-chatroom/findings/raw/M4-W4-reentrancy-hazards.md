# M4-W4: Re-entrancy Hazards of a Module-Level Room Store

Scope note: paths under `src/…` are the omp coding-agent root `@oh-my-pi/pi-coding-agent/src`; `pi-agent-core/src/…` is the sibling package `@oh-my-pi/pi-agent-core/src`; `pi-utils/src/…` is `@oh-my-pi/pi-utils/src`. All under `~/.bun/install/global/node_modules/`.

## Angle

One module-level room store (claims, cursors, waiters, log) shared by N sessions in one process. Enumerate concrete breakages: shared module state rebound per session, the 2s `session_shutdown` budget, managed-timer teardown, and in-flight blocking-tool abort. Every hazard gets symptom + mitigation.

## Claims

### 1. Module-level state is shared; the factory is re-invoked per session with a fresh API

- Module import is the dominant cold-start cost and runs **once** per path; factory binding then runs per session: `const preparedExtensions = await Promise.all(paths.map(extPath => importExtensionModule(extPath, cwd))); return bindPreparedExtensions(preparedExtensions, cwd, eventBus);` — `src/extensibility/extensions/loader.ts:486-487` (fetch 2026-10-06) — confidence: primary
- `bindPreparedExtensions` creates a **fresh runtime per bind** and re-runs each factory: `const runtime = new ExtensionRuntime();` then `const { extension, error } = await bindExtension(prepared.path, prepared, cwd, resolvedEventBus, runtime);` — `src/extensibility/extensions/loader.ts:499-502` (fetch 2026-10-06) — confidence: primary
- `bindExtension` constructs a new per-session `ConcreteExtensionAPI` and awaits the factory again: `const api = new ConcreteExtensionAPI(PiCodingAgent, extension, runtime, cwd, eventBus); await withHostGuard(() => runExtensionFactory(factory, api, runtime));` — `src/extensibility/extensions/loader.ts:451-452` (fetch 2026-10-06) — confidence: primary
- `runExtensionFactory` just calls `await factory(api)` — `src/extensibility/extensions/loader.ts:397-414` (fetch 2026-10-06) — confidence: primary
- The import is `import(`${entrySpecifier}?mtime=${nextLegacyPiLoadTag()}`)`; the cache-bust tag is consumed once per load, and subagents rebind **without re-importing** (`preloadedPreparedExtensions` → `bindPreparedExtensions`) — `src/extensibility/plugins/legacy-pi-compat.ts:2718`, `src/sdk.ts:2584-2595`, `src/task/structured-subagent.ts:674-675` (fetch 2026-10-06) — confidence: primary
- Official statement of the contract: "child sessions reuse imported factories but bind fresh APIs and extension registrations; module-level variables remain shared across those sessions" — `omp://extensions.md:67` (fetch 2026-10-06) — confidence: primary
- Official mitigation guidance: "Module globals are shared by parent/child bindings. Keep session-specific state in the factory closure or persisted session entries." — `omp://extensions.md:1048` (fetch 2026-10-06) — confidence: primary
- Reusing a bound `Extension` across sessions is explicitly forbidden: "NEVER pass this across session boundaries (e.g. parent → subagent). `Extension` instances close over a parent-bound `ExtensionAPI` (cwd, eventBus, runtime), and reusing them would route tools/handlers/commands back through the parent." — `src/sdk.ts:649-653` (fetch 2026-10-06) — confidence: primary
- Each session gets its own `ExtensionRunner` (own `#managedTimers`, own `runtime`): `const extensionRunner: ExtensionRunner = new ExtensionRunner(extensionsResult.extensions, extensionsResult.runtime, cwd, ...)` — `src/sdk.ts:3227-3244` (fetch 2026-10-06) — confidence: primary

#### Hazard (a) — per-session `ctx`/`api` captured in a shared module closure

- Symptom: factory run for session N overwrites module-level `let api` / `let ctx`; a tool call dispatched by session A then routes `pi.sendMessage`/`ctx.abort`/`ctx.ui` to whichever session bound **last**. There is no `ctx` at factory time — only `api` — and `api.sendMessage` closes over that bind's `runtime`: `sendMessage<T = unknown>(message, options): void { this.runtime.sendMessage(message, options); }` — `src/extensibility/extensions/loader.ts:296-301` (fetch 2026-10-06) — confidence: primary
- `initialize()` overwrites the shared runtime's action slots on each session init: `this.runtime.sendMessage = actions.sendMessage;` — `src/extensibility/extensions/runner.ts:776` (fetch 2026-10-06) — confidence: primary
- The identity that disambiguates is available per call: `ctx.agent: ExtensionAgentIdentity` with `{ kind: "main" | "sub"; id: string; name: string; depth: number; parentId?: string }` — `src/extensibility/extensions/types.ts:466-483,518-519` (fetch 2026-10-06) — confidence: primary
- Mitigation: never store `ctx`/`api` at module scope; take `ctx` as the **tool/handler argument** on every call (`execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext)` — `src/extensibility/extensions/types.ts:707-713` (fetch 2026-10-06) — confidence: primary). Key every per-session structure by `ctx.agent.id`.

#### Hazard (b) — `pi.sendMessage` bound to the LAST-bound session

- Symptom: module-level `api` captured once (e.g. in the first factory run) or overwritten; `pi.sendMessage` delivers to the wrong session's transcript, or throws `ExtensionRuntimeNotInitializedError` if called before that session's `initialize()`: `sendMessage(): void { throw new ExtensionRuntimeNotInitializedError(); }` — `src/extensibility/extensions/loader.ts:113-115` (fetch 2026-10-06) — confidence: primary
- Mitigation: resolve the destination per delivery from the **current** `ctx` (deliver through the calling session's own `ctx`), or route point-to-point via the native `agent://`/`IrcBus` addressed path rather than a captured `api`. `sendMessage` is reachable only through a bound `ExtensionAPI`/`ExtensionContext`, so there is no session-agnostic global send — `src/extensibility/extensions/loader.ts:296-301`, `src/extensibility/extensions/types.ts:1592-1595` (fetch 2026-10-06) — confidence: primary

#### Hazard (c) — a shared timer

- Symptom: module-level `let timer` overwritten by each session's factory; earlier handles leak, and `ctx.clearTimer(timer)` clears only the last one. Raw module-level `setInterval` is worse: a throw in the callback escapes to the process `uncaughtException` handler, which the global postmortem treats as fatal — `src/extensibility/extensions/managed-timers.ts:4-8` (fetch 2026-10-06) — confidence: primary
- Mitigation: use the sanctioned per-runner `ctx.setInterval`/`ctx.setTimeout`/`ctx.clearTimer` (`src/extensibility/extensions/types.ts:549-557`), keep the handle in the **factory closure** (per-session), not module scope, and let each session own its own timer. Do not share one timer handle across sessions.

#### Hazard (d) — one session's `session_shutdown` clearing a process-wide timer

- Symptom: `clearManagedTimers()` calls `this.#managedTimers.clearAll()`, which clears **that runner's** timers — `src/extensibility/extensions/runner.ts:1449-1451`, `src/extensibility/extensions/managed-timers.ts:58-64` (fetch 2026-10-06) — confidence: primary. If the room's background tick was scheduled via `ctx.setInterval` on a session that then shuts down (e.g. a subagent completing, a `/tan` clone, a session switch), the tick dies while other sessions still need the room. If the module instead guards "already scheduled" and schedules once from the first bind, that session's shutdown kills the room's only tick.
- Mitigation: refcount the room's background work per live session (schedule from the main session only, or hold a refcounted owner); on `session_shutdown` decrement and clear only when the count reaches zero. Do not let a single session's `clearTimer` cancel shared work.

#### Hazard (e) — module-level Map growth without a session key

- Symptom: cursors/waiters stored in a Map keyed by nothing (single slot) or never deleted on session end → unbounded growth across session lifetimes; cross-session wake (session A's waiter resolved by session B's message); stale `ctx` retained (memory leak of a whole session graph).
- Mitigation: key by `ctx.agent.id`; delete that session's entries in a `session_shutdown` handler; keep a per-session `Set` of owned keys so shutdown can prune exactly. Precedent for process-wide registries that explicitly clean up on shutdown: `disposeFileFallbacks()` is called in the `emitSessionShutdownEvent` `finally` — `src/extensibility/extensions/runner.ts:448-449,1459-1461` (fetch 2026-10-06) — confidence: primary

### 2. Shutdown budget: `SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS = 2_000`

- `export const SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS = 2_000;` — `src/extensibility/extensions/runner.ts:154` (fetch 2026-10-06) — confidence: primary
- Rationale in source: "`session_shutdown` is fire-and-forget teardown — extensions receive no result and the user has already asked to leave. A hung handler … MUST NOT hold Ctrl+C / `/exit` hostage for the full window." — `src/extensibility/extensions/runner.ts:145-153` (fetch 2026-10-06) — confidence: primary
- Per-event budget selection: `function handlerTimeoutForEvent(eventType: string): number { return eventType === "session_shutdown" ? sessionShutdownHandlerTimeoutMs : extensionHandlerTimeoutMs; }` — `src/extensibility/extensions/runner.ts:163-165` (fetch 2026-10-06) — confidence: primary
- **Exact dispatch code** (all handlers run concurrently under the 2s cap, then awaited):
```ts
if (this.#isSessionShutdownEvent(event)) {
    const timeoutMs = handlerTimeoutForEvent(event.type);
    const promises: Promise<unknown>[] = [];
    for (const ext of this.extensions) {
        const handlers = ext.handlers.get(event.type);
        if (!handlers || handlers.length === 0) continue;
        ctx ??= this.createContext();
        for (const handler of handlers) {
            promises.push(this.#runHandlerWithTimeout(handler, event, ctx, ext, timeoutMs));
        }
    }
    if (promises.length > 0) await Promise.all(promises);
    return result as RunnerEmitResult<TEvent>;
}
```
— `src/extensibility/extensions/runner.ts:1585-1597` (fetch 2026-10-06) — confidence: primary
- The whole shutdown emit is itself skipped when the extension registered no `session_shutdown` handler: `if (!extensionRunner.hasHandlers("session_shutdown")) return false;` — `src/extensibility/extensions/runner.ts:442` (fetch 2026-10-06) — confidence: primary
- Official doc: "Most dispatched handlers have a 30-second budget; `session_shutdown` handlers run concurrently with a 2-second budget. Timing out stops waiting and cancels handler UI, but cannot undo arbitrary extension side effects." — `omp://extensions.md:1045` (fetch 2026-10-06) — confidence: primary

**What MUST finish inside 2s:** only work the handler completes before the race expires. The timeout aborts the handler's signal and resolves `EXTENSION_HANDLER_TIMEOUT`; the handler promise is then given **one macrotask** of grace and abandoned:
```ts
if (result === EXTENSION_HANDLER_TIMEOUT) {
    await Promise.race([
        workPromise.then(() => undefined, () => undefined),
        Bun.sleep(0),
    ]);
}
return result;
```
— `src/extensibility/extensions/runner.ts:354-363` (fetch 2026-10-06) — confidence: primary
- On timeout the runner logs and emits an error but does **not** rethrow: `const error = \`handler timed out after ${timeoutMs}ms\`; … this.emitError({...}); return onFailure?.("timeout", error);` — `src/extensibility/extensions/runner.ts:1548-1560` (fetch 2026-10-06) — confidence: primary
- So: an **awaited async flush is NOT guaranteed**; a handler parked on IPC/disk is abandoned after 2s (plus one tick). The process exits anyway — TUI Ctrl+C path: a second Ctrl+C while `isShuttingDown` calls `postmortem.exitProcess(130)` — `src/modes/controllers/input-controller.ts:1504-1515` (fetch 2026-10-06) — confidence: primary
- After the shutdown emit, dispose continues synchronously-ish and then bounds the run drain at 5s: `const POST_PROMPT_DRAIN_TIMEOUT_MS = 5_000;` and `await withTimeout((async () => { await this.agent.waitForIdle(); await this.#drainInFlightEventHandlers(); })(), options.drainTimeoutMs ?? POST_PROMPT_DRAIN_TIMEOUT_MS, "Timed out waiting for the active agent run to settle during dispose")` — `src/session/agent-session.ts:501,5430-5437` (fetch 2026-10-06) — confidence: primary
- `emitSessionShutdownEvent` always runs `disposeFileFallbacks()` + `clearManagedTimers()` in `finally`, even when no handler exists or a handler fails — `src/extensibility/extensions/runner.ts:441-450` (fetch 2026-10-06) — confidence: primary

**Correct shutdown-flush design:** use a **synchronous append** (no `await`) for the final room-log flush inside the `session_shutdown` handler, OR append synchronously per mutation so no shutdown flush is needed. A fire-and-forget async flush is not durable under a hard exit (the 2s cap abandons it, and a second Ctrl+C / SIGTERM exits immediately). Precedent for sync flush on the hard path: `this.ctx.sessionManager.flushSync();` in `handleCtrlC()` — `src/modes/controllers/input-controller.ts:1491-1502` (fetch 2026-10-06) — confidence: primary; `flushSync(): void { … this.#writer?.flushSync?.(); … }` — `src/session/session-manager.ts:2666-2674` (fetch 2026-10-06) — confidence: primary

### 3. Managed timers: `unref`, clear-on-shutdown, throw containment

- Full class `ManagedTimers` — `src/extensibility/extensions/managed-timers.ts:22-83` (fetch 2026-10-06) — confidence: primary
- `setInterval` unrefs and registers: `const timer = setInterval(() => this.#run("interval", callback, args), ms, ...args); timer.unref?.(); this.#timers.add(timer);` — `src/extensibility/extensions/managed-timers.ts:28-33` (fetch 2026-10-06) — confidence: primary
- `setTimeout` unregisters after firing: `const timer = setTimeout(() => { this.#timers.delete(timer); this.#run("timeout", callback, args); }, ms, ...args); timer.unref?.(); this.#timers.add(timer);` — `src/extensibility/extensions/managed-timers.ts:36-48` (fetch 2026-10-06) — confidence: primary
- `clear`: `if (!this.#timers.delete(timer)) return; clearInterval(timer); clearTimeout(timer);` — `src/extensibility/extensions/managed-timers.ts:51-55` (fetch 2026-10-06) — confidence: primary
- `clearAll` (called on session teardown): `for (const timer of this.#timers) { clearInterval(timer); clearTimeout(timer); } this.#timers.clear();` — `src/extensibility/extensions/managed-timers.ts:58-64` (fetch 2026-10-06) — confidence: primary
- Throw containment: `#run` catches sync throws and attaches `.catch` to returned promises; `#report` logs and routes through `onError` — `src/extensibility/extensions/managed-timers.ts:66-82` (fetch 2026-10-06) — confidence: primary
- Wiring: `setInterval: (callback, ms, ...args) => this.#managedTimers.setInterval(callback, ms, ...args), setTimeout: …, clearTimer: timer => this.#managedTimers.clear(timer)` — `src/extensibility/extensions/runner.ts:1417-1419` (fetch 2026-10-06) — confidence: primary
- Per-runner instance: `#managedTimers = new ManagedTimers((event, error, stack) => this.emitError({ extensionPath: "<timer>", event, error, stack }));` — `src/extensibility/extensions/runner.ts:556-558` (fetch 2026-10-06) — confidence: primary
- Cleared on shutdown via `emitSessionShutdownEvent` `finally` — `src/extensibility/extensions/runner.ts:448-449` (fetch 2026-10-06) — confidence: primary
- Fallback timers (when no runner) cleared separately in dispose: `this.#fallbackExtensionTimers?.clearAll();` — `src/session/agent-session.ts:5353-5354` (fetch 2026-10-06) — confidence: primary
- **What happens when the owning session shuts down while OTHER sessions need the room:** managed timers are per-`ExtensionRunner` (per session). The shutting session's `clearManagedTimers()` clears only its own runner's timers — `src/extensibility/extensions/runner.ts:1449-1451` (fetch 2026-10-06) — confidence: primary. But if the room scheduled its tick through that session's `ctx.setInterval`, the tick is gone; if the room used a module-level single-timer guard, the room's only tick dies. Also note `unref` means a managed timer never keeps the process alive, so an abandoned room tick silently stops firing rather than blocking exit.
- **Mitigation:** refcounted background work (schedule per live session, clear only when the last owner shuts down), or schedule the room tick from the main session only and treat its shutdown as room shutdown. Prefer `ctx.setInterval` (unref + contained throws) over raw `setInterval` (throw → process-fatal `uncaughtException`).

### 4. In-flight blocking `wait_for_*` tool teardown

- Extension tools receive the loop abort signal as the 3rd `execute` arg: `execute(toolCallId: string, params: Static<TParams>, signal: AbortSignal | undefined, onUpdate: …, ctx: ExtensionContext): Promise<AgentToolResult<TDetails>>` — `src/extensibility/extensions/types.ts:707-713` (fetch 2026-10-06) — confidence: primary
- The adapter forwards it verbatim: `return this.registeredTool.definition.execute(toolCallId, params, signal, onUpdate, this.runner.createContext(undefined, { toolName: …, context, signal, onUpdate }));` — `src/extensibility/extensions/wrapper.ts:116-127` (fetch 2026-10-06) — confidence: primary
- The agent loop awaits the tool promise **unboundedly**: `rawResult = await tool.execute(toolCall.id, executionArgs, record.signal, partialResult => {…}, toolContext);` — `pi-agent-core/src/agent-loop.ts:3572-3586` (fetch 2026-10-06) — confidence: primary
- Session dispose aborts the loop signal: `this.agent.abort();` → `abort(reason?: unknown) { this.#abortController?.abort(reason); }` — `src/session/agent-session.ts:5358`, `pi-agent-core/src/agent.ts:1448-1450` (fetch 2026-10-06) — confidence: primary
- The loop signal is composed into the per-call signal for **every** tool, interruptible or not: `const nonInterruptibleSignal: AbortSignal = signal ?? new AbortController().signal; const interruptibleSignal: AbortSignal = signal ? AbortSignal.any([signal, steeringAbortController.signal, ircAbortController.signal]) : …;` and `signal: interruptible ? interruptibleSignal : nonInterruptibleSignal` — `pi-agent-core/src/agent-loop.ts:3249-3252,3288` (fetch 2026-10-06) — confidence: primary
- So on dispose the abort signal **does fire** (it is the loop signal). A tool that ignores it leaves its promise unresolved.
- **Does an unresolved tool promise hang shutdown?** No — it is bounded. `waitForIdle()` returns the running-prompt promise: `waitForIdle(): Promise<void> { return this.#runningPrompt ?? Promise.resolve(); }` — `pi-agent-core/src/agent.ts:1452-1454` (fetch 2026-10-06) — confidence: primary; dispose wraps it in a 5s timeout (`POST_PROMPT_DRAIN_TIMEOUT_MS = 5_000`, `src/session/agent-session.ts:501,5430-5437`), logs `"Active agent run still settling at dispose deadline"`, and proceeds — `src/session/agent-session.ts:5439-5441` (fetch 2026-10-06) — confidence: primary. With `drained === false` a **fire-and-forget** deferred finalizer is scheduled (not awaited by dispose) — `src/session/agent-session.ts:5472-5477` (fetch 2026-10-06) — confidence: primary. Net: shutdown stalls ≤5s, then exits; the orphan tool promise and its waiters persist.
- **Tool promise rejection surfaces as a tool result**, not an unhandled rejection: `try { … } catch (err) { executionError = …; result = { content: [{ type: "text", text: executionError.message }], details: undefined }; }` — `src/extensibility/extensions/wrapper.ts:435-451` (fetch 2026-10-06) — confidence: primary; the loop also catches and converts: `catch (e) { caughtError = e; result = { content: [{ type: "text", text: … }], details: {}, }; isError = true; }` — `pi-agent-core/src/agent-loop.ts:3595-3602` (fetch 2026-10-06) — confidence: primary. An **unhandled** rejection would be process-fatal: postmortem `on("unhandledRejection", …)` → `exitAfterFatal(…, Reason.UNHANDLED_REJECTION)` — `pi-utils/src/postmortem.ts:616-638` (fetch 2026-10-06) — confidence: primary.
- `throwIfAborted(signal)` exists for consistent abort error types: `export function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) { … throw … new ToolAbortError(undefined, { cause: signal.reason }); } }` — `src/tools/tool-errors.ts:26-31` (fetch 2026-10-06) — confidence: primary
- **Reference implementation** (native `wait`) — how a blocking tool stays teardown-safe: it registers an abort listener, races a timeout, and cleans up in `finally`:
```ts
const { promise: timeout, resolve: timedOut } = Promise.withResolvers<void>();
const timer = setTimeout(timedOut, WAIT_MAX_MS);
const abort = Promise.withResolvers<void>();
const onAbort = () => abort.resolve();
if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
}
…
try {
    wake = await Promise.race([ … , timeout.then(() => "timeout" as const), abort.promise.then(() => "abort" as const)]);
} finally {
    clearTimeout(timer);
    clearInterval(progressTimer);
    busAbort.abort();
    serviceAbort.abort();
    signal?.removeEventListener("abort", onAbort);
}
```
— `src/tools/wait.ts:121-151` (fetch 2026-10-06) — confidence: primary
- It also distinguishes the designed interrupt from a real abort and re-throws on a genuine abort: `if (signal.reason === TOOL_INTERRUPT_ABORT_REASON) { return { … interrupted: true, useless: true }; } throwIfAborted(signal);` — `src/tools/wait.ts:160-172` (fetch 2026-10-06) — confidence: primary; `TOOL_INTERRUPT_ABORT_REASON = Symbol.for("pi-agent-core.tool-interrupt")` — `pi-agent-core/src/agent-loop.ts:189` (fetch 2026-10-06) — confidence: primary
- **MUST a blocking room tool do:** (1) add an `abort` listener on `signal` that resolves/rejects the wait; (2) bound the wait with its own timeout (mirror `WAIT_MAX_MS = 30 * 60_000`, `src/tools/wait.ts:25`); (3) remove the waiter from the room's waiter set in `finally`; (4) `unref` any timer it arms; (5) clear/park that session's waiters on `session_shutdown`. Otherwise the promise outlives the session (≤5s dispose stall, then orphan) and its waiter entry leaks into the shared store.
- **RISK (interruptible is not in the typed extension tool surface):** `ToolDefinition` has **no** `interruptible` field — `src/extensibility/extensions/types.ts:669-744` (fetch 2026-10-06) — confidence: primary. The loop reads `tool.interruptible` — `pi-agent-core/src/agent-loop.ts:3269-3282` (fetch 2026-10-06) — confidence: primary — and `applyToolProxy` forwards any **own** key of the underlying definition onto the adapter (`get() { const value = (tool as …)[key]; if (typeof value !== "function") return value; … }`) — `src/extensibility/extensions/tool-proxy.ts:16-31`, applied at `src/extensibility/extensions/wrapper.ts:77` (fetch 2026-10-06) — confidence: primary. So setting an untyped extra `interruptible: true` on the definition object would be forwarded at runtime, but it is undocumented and not type-checked. Fallback: do **not** rely on it — have the room wait tool observe `signal` directly and additionally expose a bounded poll/`wait_for_message` with its own timeout so a queued message can be picked up at the next boundary.

### 5. Recommended invariants for the room-store implementer

- **I1 — All room mutations are synchronous.** Never `await` between reading and writing the cursor/waiter map; an `await` yields the event loop and lets another session's handler interleave a read-modify-write. Make every room op a plain sync function. (Node/Bun is single-threaded, so a sync critical section is atomic.)
- **I2 — No session-scoped value at module scope.** Never store `ctx`, `api`, a per-session `AbortController`, or a single timer handle in a module-level variable. Capture `ctx` per call (tool/handler argument) and keep per-session handles in the factory closure — `omp://extensions.md:67,1048`, `src/extensibility/extensions/loader.ts:451-452` (fetch 2026-10-06) — confidence: primary.
- **I3 — Key every shared structure by `ctx.agent.id`**, and prune that session's keys in a `session_shutdown` handler. Store a per-session owned-key `Set` so shutdown can delete exactly what it added.
- **I4 — Timers via `ctx.setInterval`/`ctx.setTimeout` only, refcounted.** Managed timers are `unref`'d and throw-contained; raw `setInterval` throws are process-fatal. Clear only when the last owning session shuts down.
- **I5 — Final room-log flush is synchronous (no `await`) inside `session_shutdown`**, or append synchronously per mutation. An awaited async flush can be abandoned at the 2s cap — `src/extensibility/extensions/runner.ts:154,1585-1597,354-363` (fetch 2026-10-06) — confidence: primary.
- **I6 — Every blocking `wait_for_*` promise settles.** Listen to `signal`, bound the wait with a timeout, remove the waiter in `finally`, and clear the session's waiters on `session_shutdown`. An unresolved promise stalls dispose up to 5s and then orphans — `src/tools/wait.ts:121-151`, `src/session/agent-session.ts:501,5430-5441` (fetch 2026-10-06) — confidence: primary.

## Searches

- `read src/extensibility/extensions/loader.ts:397-520` — import vs bind, fresh API per bind
- `read src/extensibility/extensions/managed-timers.ts:1-83` — full file
- `read src/extensibility/extensions/runner.ts:140-175,260-368,425-565,700-820,1340-1475,1488-1620` — budget, race, dispatch, ctx, managed timers, clear
- `read src/extensibility/extensions/types.ts:459-560,649-793,1139-1176,1342-1344,1587-1595,1858-1890` — identity, ToolDefinition, ctx, events
- `read src/extensibility/extensions/wrapper.ts:55-143,194-263,419-475` — adapter forwarding, error conversion
- `read src/extensibility/tool-proxy.ts:1-35` — full file
- `read src/tools/wait.ts:1-190` — native blocking-tool abort/cleanup reference
- `read src/tools/tool-errors.ts:1-45` — throwIfAborted
- `read pi-agent-core/src/agent-loop.ts:151-191,3229-3303,3539-3602` — signals, interruptible, tool await/catch
- `read pi-agent-core/src/agent.ts:1444-1485,1660-1675,2065-2077` — abort, waitForIdle
- `read src/session/agent-session.ts:500-504,5195-5248,5331-5480` — dispose sequence, drain timeouts
- `read src/sdk.ts:640-690,2522-2603,3214-3263,3353-3392` — per-session runner, rebinding paths
- `read src/modes/session-teardown.ts:1-82` — idempotent teardown
- `read src/modes/controllers/input-controller.ts:1490-1533` — Ctrl+C sync flush + hard-abort ladder
- `read src/modes/interactive-mode.ts:1458-1481,6753-6803` — shutdown state machine
- `read pi-utils/src/postmortem.ts:563-658` — unhandledRejection fatal
- `read src/internal-urls/local-protocol.ts` (via M4-W1) — n/a
- `read omp://extensions.md:60-70,1044-1049` — module-globals contract, budgets
- `read omp://hooks.md:120-132` — session_shutdown event list
- `grep interruptible src/**` — only native `wait`/`vibe`; no extension tool field
- `grep bindPreparedExtensions|preloadedPreparedExtensions src/**` — subagent rebind path
- `grep clearManagedTimers|session_shutdown src/**` — teardown wiring

## Conflicting evidence

None. All sources agree: the factory rebinds per session, module-level variables are shared, the shutdown budget is 2s and abandons hung handlers, managed timers are per-runner and cleared on shutdown, and the loop signal fires on dispose while the run drain is bounded at 5s.

## Gaps

- **Exact process-exit guarantee after a 2s shutdown timeout** is spread across `interactive-mode.shutdown()` → `#teardown()` → `session.dispose()` → mode-controller exit; not traced end-to-end here. Confirmed bound: 2s per shutdown handler + 5s run drain + a second Ctrl+C hard-abort at `postmortem.exitProcess(130)`. If a room handler starts a **raw** (non-unref) interval/timer, that handle can keep the process alive past the abandon — managed timers (`unref`) cannot.
- **`interruptible` for extension tools is unverified in practice.** The typed `ToolDefinition` has no such field; the `applyToolProxy` forwarding of an untyped own key is inferred from code, not from a test or doc. Treat as RISK; fallback is direct `signal` observation + bounded timeout.
- **Whether `session_shutdown` fires for every subagent session** is inferred: each session constructs its own `ExtensionRunner` (`src/sdk.ts:3227`) and dispose emits for its runner (`src/session/agent-session.ts:5348`); the subagent release/dispose path was not read line-by-line. Design the room to be correct whether or not a subagent emits it (prune by `ctx.agent.id`, refcount timers).
- **`Bun.write`/append durability under a hard SIGKILL** not tested; the 2s + 5s bounds only guarantee graceful-exit durability. Sync append per mutation is the only design that survives an immediate `process.exit`.
