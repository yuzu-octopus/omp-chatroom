# M4-W5 — How to test a multi-agent room end-to-end in ONE process

## Angle

Three paths for an in-process room test: (1) SDK `createAgentSession` sessions, (2) the
`task` tool spawning real subagents, (3) the `eval` kernel's `agent()`/`workpool()` bridge.
For each: does it run in the same process + same `AgentRegistry`, what bootstrap API it needs,
and what a room assertion looks like. Then a concrete minimal acceptance skeleton and the
blocker (live model vs deterministic substitute).

---

## Claims

### 1. SDK PATH — bootstrap

- `export async function createAgentSession(options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult>` — `src/sdk.ts:1618` (fetch 2026-10-06) — confidence: primary
- `export interface CreateAgentSessionResult { session: AgentSession; extensionsResult: LoadExtensionsResult; setToolUIContext: (uiContext: ExtensionUIContext, hasUI: boolean) => void; mcpManager?: MCPManager; modelFallbackMessage?: string; lspServers?: LspStartupServerInfo[]; startBackgroundModelDiscovery?: () => Promise<void>; eventBus: EventBus; subagentEventBus?: EventBus; }` — `src/sdk.ts:847-866` (fetch 2026-10-06) — confidence: primary
- Minimal real example (smallest in `examples/sdk/`): `const { session } = await createAgentSession();` then `session.subscribe(...)`; `await session.prompt("What files are in the current directory?");` — `examples/sdk/01-minimal.ts:7-20` (fetch 2026-10-06) — confidence: primary
- Minimal prompt+await: `async prompt(text: string, options?: PromptOptions): Promise<boolean>` — `src/session/agent-session.ts:6888` (fetch 2026-10-06) — confidence: primary
- `subscribe(listener: AgentSessionEventListener): () => void` — `src/session/agent-session.ts:4838` (fetch 2026-10-06) — confidence: primary
- `dispose(options: AgentSessionDisposeOptions = {}): Promise<void>` — `src/session/agent-session.ts:5201` (fetch 2026-10-06) — confidence: primary
- `createAgentSession()` "Session construction can succeed without an available model, but prompting cannot." — `omp://sdk.md` (fetch 2026-10-06) — confidence: primary

### 2. SDK PATH — two sessions do NOT share an `EventBus` by default

- `const eventBus = options.eventBus ?? new EventBus();` — `src/sdk.ts:1632` (fetch 2026-10-06) — confidence: primary
- `const subagentEventBus = options.subagentEventBus ?? new EventBus();` — `src/sdk.ts:1633` (fetch 2026-10-06) — confidence: primary
- Shared-bus option: `/** Shared event bus for tool/extension communication. Default: creates new bus. */ eventBus?: EventBus;` — `src/sdk.ts:688-689` (fetch 2026-10-06) — confidence: primary
- So the exact fix is: construct ONE `new EventBus()` and pass the SAME instance as `eventBus` to every `createAgentSession({...})`. `EventBus` is not re-exported from the package root or `sdk.ts`; deep-import it: `import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";` (wildcard `"./*"` export → `./src/*.ts`, `package.json:61-64`; `export class EventBus` — `src/utils/event-bus.ts:3`) (fetch 2026-10-06) — confidence: primary
- `class EventBus { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void; clear(): void }` — `src/utils/event-bus.ts:3-33` (fetch 2026-10-06) — confidence: primary
- Extensions reach the bus as `events: EventBus;` on `ExtensionAPI` — `src/extensibility/extensions/types.ts:1695`; wired from the session's `eventBus` at `src/extensibility/extensions/loader.ts:196` (`ConcreteExtensionAPI` ctor param), and `loadExtensionFromFactory(factory, cwd, eventBus, runtime, name)` — `src/extensibility/extensions/loader.ts:464-475` (fetch 2026-10-06) — confidence: primary
- Child sessions inherit ONLY the observability bus, not `eventBus`: subagent session options forward `subagentEventBus: options.subagentEventBus` and no `eventBus` — `src/task/executor.ts:4216-4219` (fetch 2026-10-06) — confidence: primary

### 3. SDK PATH — loading the room extension in a test

- `/** Inline extensions (merged with discovery). */ extensions?: ExtensionFactory[];` — `src/sdk.ts:629-630` (fetch 2026-10-06) — confidence: primary
- `/** Additional extension paths to load (merged with discovery). */ additionalExtensionPaths?: string[];` — `src/sdk.ts:631-632` (fetch 2026-10-06) — confidence: primary
- `export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;` — `src/extensibility/extensions/types.ts:1780` (fetch 2026-10-06) — confidence: primary
- Inline factories are rebound per session and recorded in `preparedExtensions` so child sessions reload the same factory: `const loaded = await loadExtensionFromFactory(factory, cwd, eventBus, extensionsResult.runtime, sourceId);` and push `{ path: sourceId, resolvedPath: sourceId, factory, error: null }` — `src/sdk.ts:2634-2649` (fetch 2026-10-06) — confidence: primary
- Extension-contributed tools are always activated (unless `hidden`/`defaultInactive`): `alwaysInclude = [...sdkCustomTools..., ...registeredTools.map(t => t.definition.name), ...]` then pushed into `initialToolNames` — `src/sdk.ts:3956-3967`; registry insert `toolRegistry.set(tool.name, tool)` — `src/sdk.ts:3331` (fetch 2026-10-06) — confidence: primary
- `registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: ToolDefinition<TParams, TDetails>): void;` — `src/extensibility/extensions/types.ts:1456` (fetch 2026-10-06) — confidence: primary
- `ToolDefinition.execute(toolCallId: string, params: Static<TParams>, signal: AbortSignal | undefined, onUpdate: AgentToolUpdateCallback<TDetails> | undefined, ctx: ExtensionContext): Promise<AgentToolResult<TDetails>>` — `src/extensibility/extensions/types.ts:707-713` (fetch 2026-10-06) — confidence: primary
- The extension `ctx` is built by the runner, not the caller: `RegisteredToolAdapter.execute` calls `this.registeredTool.definition.execute(toolCallId, params, signal, onUpdate, this.runner.createContext(undefined, { toolName, context, signal, onUpdate }))` — `src/extensibility/extensions/wrapper.ts:103-128`; `createContext(...)` returns `{ ui: this.#uiContext, mode, cwd, sessionManager, modelRegistry, ..., localProtocolOptions: this.localProtocolOptions, ... }` — `src/extensibility/extensions/runner.ts:1354-1433` (fetch 2026-10-06) — confidence: primary
- `runner` has a no-op UI context by default: `this.#uiContext = noOpUIContext;` — `src/extensibility/extensions/runner.ts:453,724` (fetch 2026-10-06) — confidence: primary

### 4. SDK PATH — two top-level sessions in one process need distinct identities

- "For multiple concurrent top-level sessions in one process, pass a private `AgentRegistry` to each session. The default process-global registry admits only one `"Main"` identity per generation." — `omp://sdk.md` (fetch 2026-10-06) — confidence: primary
- `agentId?: string;` — `src/sdk.ts:758-759`; `agentDisplayName?: string;` — `src/sdk.ts:760-761` (fetch 2026-10-06) — confidence: primary
- `const resolvedAgentId = options.agentId ?? options.parentTaskPrefix ?? MAIN_AGENT_ID;` — `src/sdk.ts:2135` (fetch 2026-10-06) — confidence: primary
- `export const MAIN_AGENT_ID = "Main";` — `@oh-my-pi/pi-tui/src/overlays/agent-hub-types.ts:5` (re-exported `src/registry/agent-registry.ts:16-17`) (fetch 2026-10-06) — confidence: primary
- Two sessions with distinct `agentId` ("AgentA"/"AgentB") both register as `kind: "main"` in the SAME `AgentRegistry.global()` (register is by id): `register(input: RegisterInput): AgentRef` sets `this.#refs.set(ref.id, ref)` — `src/registry/agent-registry.ts:139-158`; `static global(): AgentRegistry` — `src/registry/agent-registry.ts:115-120` (fetch 2026-10-06) — confidence: primary
- `agentRegistry?: AgentRegistry;` (default `AgentRegistry.global()`) — `src/sdk.ts:767-768`, `const agentRegistry = options.agentRegistry ?? AgentRegistry.global();` — `src/sdk.ts:2134` (fetch 2026-10-06) — confidence: primary

### 5. SDK PATH — shared temp `local://` root across two sessions

- `export interface LocalProtocolOptions { getArtifactsDir?: () => string | null; getSessionId?: () => string | null; }` — `src/internal-urls/local-protocol.ts:27-30` (fetch 2026-10-06) — confidence: primary
- `localProtocolOptions?: LocalProtocolOptions;` on `CreateAgentSessionOptions` — `src/sdk.ts:790-791` (fetch 2026-10-06) — confidence: primary
- `const localProtocolOptions = options.localProtocolOptions ?? { getArtifactsDir, getSessionId: () => sessionManager.getSessionId?.() ?? null };` then `toolSession.localProtocolOptions = localProtocolOptions;` — `src/sdk.ts:2389-2397` (fetch 2026-10-06) — confidence: primary
- `LocalProtocolHandler.setOverride(options.localProtocolOptions)` is process-global and only the LAST top-level session wins — `src/sdk.ts:2393-2394` (fetch 2026-10-06) — confidence: primary
- Per-session pinning beats the global override: `sessionLocalProtocolOptions(session)` prefers `session.localProtocolOptions` — `src/internal-urls/context.ts:19-26`; `resolveOptions` order is (1) `context.localProtocolOptions`, (2) `LocalProtocolHandler.#override`, (3) first `main`-kind ref — `src/internal-urls/local-protocol.ts:460-474` (fetch 2026-10-06) — confidence: primary
- Pass the SAME `localProtocolOptions` object (a `getArtifactsDir` pointing at one temp dir) to BOTH sessions → both resolve `local://` to `<tmp>/local`: `resolveLocalRoot` returns `path.resolve(artifactsDir, "local")` when `getArtifactsDir()` is non-null — `src/internal-urls/local-protocol.ts:229-240` (fetch 2026-10-06) — confidence: primary
- Resolve a `local://` URL to an absolute path: `resolveLocalUrlToPath(input: string | InternalUrl, options: LocalProtocolOptions, platform: NodeJS.Platform = process.platform): string` — `src/internal-urls/local-protocol.ts:285-301` (fetch 2026-10-06) — confidence: primary
- Also accessible on the built `ctx`: `ctx.localProtocolOptions?: LocalProtocolOptions` — `src/extensibility/extensions/types.ts:504-505`, wired `localProtocolOptions: this.localProtocolOptions` — `src/extensibility/extensions/runner.ts:1415` (fetch 2026-10-06) — confidence: primary

### 6. SDK PATH — reaching a session's tools and JSONL

- `getToolByName(name: string): AgentTool | undefined` — `src/session/agent-session.ts:5897` (fetch 2026-10-06) — confidence: primary
- `getAgentId(): string | undefined` — `src/session/agent-session.ts:2423` (fetch 2026-10-06) — confidence: primary
- In-memory (no file): `static inMemory(cwd: string = getProjectDir(), storage: SessionStorage = new MemorySessionStorage()): SessionManager` — `src/session/session-manager.ts:4150-4153`; file-backed: `static create(cwd: string, sessionDir?: string, storage: SessionStorage = new FileSessionStorage()): SessionManager` — `src/session/session-manager.ts:3780-3785` (fetch 2026-10-06) — confidence: primary
- For a room JSONL on disk, the room store's own log path is the assertion target (not the session JSONL). House append pattern = held `O_WRONLY|O_CREAT|O_APPEND` fd + one `fs.writeSync` per whole line; no fsync; reader tolerates a torn final line — `src/session/session-storage.ts:24,244-247,307-318,356` (fetch 2026-10-06) — confidence: primary (see `M4-W2-jsonl-atomicity.md`)

### 7. TASK-TOOL PATH — can a test drive real subagents in-process?

- `task` is a normal tool; a test can (a) ask the main session to call it via `session.prompt(...)` — needs a model — or (b) call it directly: `session.getToolByName("task")!.execute(toolCallId, rawParams, signal, onUpdate)` — `src/task/index.ts:844-849` (fetch 2026-10-06) — confidence: primary
- `export class TaskTool implements AgentTool<TaskToolSchemaInstance, TaskToolDetails, Theme>` — `src/task/index.ts:563` (fetch 2026-10-06) — confidence: primary
- Each spawn creates a real child `AgentSession` via `createAgentSession(buildSubagentSessionOptions(...))` — `src/task/executor.ts:4258-4260`, `3580-3625` (fetch 2026-10-06) — confidence: primary
- Child sessions register in the SAME global registry (no `agentRegistry` is forwarded in child options — `src/task/executor.ts:4178-4235`; default is `AgentRegistry.global()`) — `src/sdk.ts:2134` (fetch 2026-10-06) — confidence: primary
- Child ids: `agentId: id` — `src/task/executor.ts:4224`; allocated by `AgentOutputManager` (name-based, `Task`/`Task-2`) — `omp://tools/task.md` (fetch 2026-10-06) — confidence: primary
- Assertion surface 1: `agent://<id>` resolves the saved `<id>.md` output; resolver is `AgentProtocolHandler`, registry-aware (`context?.agentRegistry ?? AgentRegistry.global()`) — `src/internal-urls/agent-protocol.ts:218` (fetch 2026-10-06) — confidence: primary
- Assertion surface 2: `history://<id>` renders the concise transcript; "Resolves agent ids against the global AgentRegistry, then falls back to on-disk `.jsonl` transcripts, serving read-only history for live, parked, and unregistered agents alike." — `src/internal-urls/history-protocol.ts:285-288`, `318-334` (fetch 2026-10-06) — confidence: primary
- Programmatic read of either: `InternalUrlRouter.instance().resolve(url, sessionResolveContext(session, { signal }))` — `src/tools/read.ts:2596`; `InternalUrlRouter.instance()` — `src/internal-urls/router.ts:130-133`, `async resolve(input: string, context?: ResolveContext): Promise<InternalResource>` — `src/internal-urls/router.ts:482` (fetch 2026-10-06) — confidence: primary
- Concrete assertion for the task path: `const out = await InternalUrlRouter.instance().resolve(\`agent://${agentId}\`, sessionResolveContext(session));` then match `out.content` — `src/tools/read.ts:2596` + `src/internal-urls/agent-protocol.ts:218` (fetch 2026-10-06) — confidence: primary
- **Blocker inside the task path:** the child must run a model turn to produce output. `runSubprocess` calls `createAgentSession` then prompts the child; with no credentials the child cannot yield. `omp://sdk.md`: prompting needs a model. — confidence: primary (see Gaps/RISK)
- `keepAlive` defaults true for task spawns: `keepAlive: options.keepAlive !== false` — `src/task/executor.ts:4537` (fetch 2026-10-06) — confidence: primary

### 8. EVAL PATH — do eval-spawned agents share the process + registry?

- `eval`'s `agent()` is a HOST bridge: `runEvalAgent(args, options)` runs in the session's process (`src/eval/agent-bridge.ts:176`), and spawns via `runStructuredSubagent({ session: options.session, invocationKind: "eval", ..., keepAlive: true, retainArtifacts: true })` — `src/eval/agent-bridge.ts:225-243` (fetch 2026-10-06) — confidence: primary
- `runStructuredSubagent` → `runSubprocess` → `createAgentSession` — `src/task/structured-subagent.ts:41,869` (fetch 2026-10-06) — confidence: primary
- No `agentRegistry` override is passed on that path, so the eval-spawned agent registers in `AgentRegistry.global()` of the SAME process — `src/sdk.ts:2134` + `src/task/executor.ts:4178-4235` (fetch 2026-10-06) — confidence: primary
- Eval agent id allocation: `const id = await reserveStructuredSubagentId(options.session, { label: parsed.label });` and job owner `const ownerId = options.session.getAgentId?.() ?? MAIN_AGENT_ID;` — `src/eval/agent-bridge.ts:216-218` (fetch 2026-10-06) — confidence: primary
- **Same process, but a different EXECUTOR:** "Every agent session, including `task`, `agent()`, workpool, and vibe subagents, owns a private eval executor id; subagents never inherit their parent's kernels or VM state." — `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary
- Eval subagents are keep-alive: "Eval subagents are kept alive (message with `write agent://<id>`, read transcripts at `history://<id>`)" — `omp://tools/eval.md`; and `keepAlive: true` — `src/eval/agent-bridge.ts:237` (fetch 2026-10-06) — confidence: primary
- Eval agent handle surface: `.id`, `.agent`, `.handle` (`agent://<id>`), `.status`, `.done()`, `.wait(timeout?)`, `.send(message)`, `.cancel()`, `.output()` — `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary
- `workpool(agent=None, name=None, context=None, tools=None, model=None)` — same host-bridge spawn path; pool workers are keep-alive registered agents — `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary
- Verdict: an eval-spawned agent CAN be a room member in a room test — it registers in the same `AgentRegistry.global()`, gets an `agentId`, is reachable at `agent://<id>`/`history://<id>`, and the room extension is rebound into its session (extension factories are rebound per session) — `src/eval/agent-bridge.ts:216-256`, `src/sdk.ts:2634-2649` (fetch 2026-10-06) — confidence: primary
- **Blocker inside the eval path:** the spawned agent still needs a model to run its turn; `agent()` only allocates the job/handle. — confidence: primary

### 9. EVAL PATH — same-process, same registry, but the eval *cell* runs in a subprocess kernel

- Python uses "a retained subprocess kernel speaking framed local IPC. JavaScript uses an isolated subprocess, with a Bun Worker fallback" — `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary
- So the eval cell code does NOT share JS globals with the session; only the bridge calls (`agent()`, `tool.*`, `read`/`write`) execute host-side in the session process — `omp://tools/eval.md` (fetch 2026-10-06) — confidence: primary
- Consequence: a room test cannot import the room extension module inside an eval cell and expect the same module instance. Use the host bridge (`agent()`) or SDK sessions instead. — confidence: primary

### 10. CONCRETE MINIMAL ACCEPTANCE CHECK (deterministic, no model)

Named assertions:
- **A1** — A posts a claim via `room`; B reads it via `room` op → B's read returns A's claim payload.
- **A2** — The room JSONL on disk has exactly the expected lines (count + per-line `type`/`author`/`text`).
- **A3** — `wait_for_claim` in B resolves after A posts (resolve ordering, no polling).

Each step's API:

| Step | API | Source |
|---|---|---|
| shared bus | `new EventBus()` (deep import) | `src/utils/event-bus.ts:3` |
| shared local root | `localProtocolOptions = { getArtifactsDir: () => tmpDir, getSessionId: () => "roomtest" }` | `src/internal-urls/local-protocol.ts:27-30`, `src/sdk.ts:791` |
| load room extension | `createAgentSession({ extensions: [roomExtension], eventBus, localProtocolOptions, agentId: "AgentA", sessionManager: SessionManager.inMemory() })` | `src/sdk.ts:630,689,759,788,791` |
| get room tool | `session.getToolByName("room")` | `src/session/agent-session.ts:5897` |
| drive a tool without a model | `tool.execute(toolCallId, params, signal, onUpdate)` | `src/extensibility/extensions/types.ts:707-713`, `src/task/index.ts:844` |
| resolve local path | `resolveLocalUrlToPath("local://room/log.jsonl", opts)` | `src/internal-urls/local-protocol.ts:285` |

Skeleton (`bun test`, spec for the future implementation; room API names are the planned
surface from Round-2 decisions — treat room-tool shape as `[SPEC]` until implemented):

```ts
// test/room.acceptance.test.ts
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls";
import { roomExtension } from "../src/extension"; // module-level store lives here

async function newSession(bus: EventBus, root: string, agentId: string) {
  const localProtocolOptions = { getArtifactsDir: () => root, getSessionId: () => agentId };
  const { session } = await createAgentSession({
    eventBus: bus,                       // SHARED bus  (sdk.ts:689,1632)
    localProtocolOptions,                // SHARED local:// root (sdk.ts:791,2389)
    extensions: [roomExtension],         // inline factory (sdk.ts:630)
    agentId,                             // distinct id, avoids "Main" collision (sdk.ts:759,2135)
    sessionManager: SessionManager.inMemory(), // no disk session needed (session-manager.ts:4150)
    disableExtensionDiscovery: true,
    enableMCP: false,
  });
  return session;
}

test("room: post -> read -> wait_for_claim", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-"));
  const bus = new EventBus();
  const a = await newSession(bus, root, "AgentA");
  const b = await newSession(bus, root, "AgentB");

  const roomA = a.getToolByName("room")!;   // (agent-session.ts:5897)
  const roomB = b.getToolByName("room")!;

  // --- A3: start B's blocking wait FIRST, then assert it resolves after A posts ---
  const waitPromise = roomB.execute("c-wait", { op: "wait_for_claim", name: "build" }, undefined, undefined);
  let waitResolved = false;
  waitPromise.then(() => { waitResolved = true; });
  await Promise.resolve();                   // let the wait register
  expect(waitResolved).toBe(false);          // still blocked

  // --- A1: A posts, B reads ---
  await roomA.execute("c-post", { op: "post_claim", name: "build", text: "I own the build" }, undefined, undefined);
  const readB = await roomB.execute("c-read", { op: "read", since: 0 }, undefined, undefined);
  const claims = (readB.details as any).claims;
  expect(claims.some((c: any) => c.author === "AgentA" && c.text === "I own the build")).toBe(true);

  const resolved = await Promise.race([waitPromise, new Promise(r => setTimeout(() => r("TIMEOUT"), 1000))]);
  expect(resolved).not.toBe("TIMEOUT");      // A3: wait resolved after A posted

  // --- A2: JSONL on disk has exactly the expected lines ---
  const logPath = resolveLocalUrlToPath("local://room/log.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentA" });
  const lines = fs.readFileSync(logPath, "utf8").trimEnd().split("\n").map(l => JSON.parse(l));
  expect(lines).toHaveLength(1);             // exactly the one claim (no join digest yet)
  expect(lines[0]).toMatchObject({ type: "claim", author: "AgentA", name: "build" });

  await a.dispose(); await b.dispose();
});
```

What proves the room works: **A1** (cross-session read returns A's claim), **A3** (a blocking
`wait_for_claim` in a DIFFERENT session resolves only after A's post), **A2** (the on-disk JSONL
has the exact expected lines). A1+A3 prove the shared store + shared notification are real; A2
proves durability. The tool is obtained with `session.getToolByName("room")` and driven through
`execute()`, which the wrapper binds to the session's real `ExtensionContext`
(`src/extensibility/extensions/wrapper.ts:116-127`) — no fake ctx needed, no model needed.

### 11. Why this skeleton needs no model

- Session construction works without a model; only `prompt()` needs one — `omp://sdk.md` (fetch 2026-10-06) — confidence: primary
- `session.getToolByName("room")!.execute(...)` runs the extension tool's `execute` directly; the agent loop is not involved, so no provider request is made — `src/extensibility/extensions/wrapper.ts:103-128` (fetch 2026-10-06) — confidence: primary
- The room store's shared state comes from the extension module being imported once and the factory rebound per session — `src/sdk.ts:2634-2649` (fetch 2026-10-06) — confidence: primary
- Two sessions with distinct `agentId` coexist in `AgentRegistry.global()` — `src/sdk.ts:2135`, `src/registry/agent-registry.ts:139-158` (fetch 2026-10-06) — confidence: primary

### 12. Fallback if even session construction is undesirable: pure tool-level harness

- Build the store + the `room`/`wait_for_claim` `ToolDefinition`s directly, then call
  `definition.execute(toolCallId, params, signal, onUpdate, fakeCtx)` with a hand-rolled
  `ExtensionContext` (needs only `{ ui, mode, cwd, sessionManager, modelRegistry, agent, ... }` —
  `src/extensibility/extensions/types.ts:485-595`) and two `ToolSession`-shaped objects sharing
  one store. Minimal `ToolSession` fields a tool reads: `cwd`, `hasUI`, `settings`,
  `getSessionFile`, `getSessionSpawns` — `src/cli/read-cli.ts:58-64`; full interface
  `src/tools/index.ts:208-555` (fetch 2026-10-06) — confidence: primary
- This is the closest deterministic substitute if `createAgentSession` is too heavy. It tests
  the store + tool contract but NOT the extension-loading/rebinding path, so prefer §10.

---

## Searches

- `read omp://sdk.md` — bootstrap, options, eventBus default, multi-session registry note.
- `read omp://tools/task.md` — task tool flow, child session creation, `agent://`/`history://` artifacts, keepAlive/lifecycle.
- `read omp://tools/eval.md` — eval `agent()`/`workpool()` host bridges, keep-alive, executor isolation.
- `read omp://tools/wait.md` — `wait` semantics (pull-only, no peer selection).
- `read omp://providers.md:1-60` — keyless providers (ollama/lm-studio/llama.cpp/Apple FM).
- `glob examples/sdk/` + `read examples/sdk/01-minimal.ts`, `02-custom-model.ts`, `06-extensions.ts`, `11-sessions.ts`, `README.md`.
- `grep eventBus|additionalExtensionPaths|extensions?|preloadedExtensions src/sdk.ts` → 629-696, 1632-1633, 2389-2397.
- `grep registerTool|registerShortcut|ExtensionAPI src/extensibility/extensions/types.ts` → 1357,1456,1695,1780.
- `grep AgentRegistry|register src/eval/agent-bridge.ts` → 216-218, 237.
- `grep AgentRegistry|registry.register|adopt src/task/executor.ts` → 59,3238,3328,3597,4537.
- `grep localRoot|registerLocal src/internal-urls/` → local-protocol.ts:27-45,229-240,285-301,423-474; context.ts:19-36.
- `grep agentRegistry src/sdk.ts` → 767-768, 2134-2135, 3983-4003.
- `grep getToolByName|prompt(|subscribe(|dispose( src/session/agent-session.ts` → 4838,5201,5897,6888.
- `grep createTools src/tools/index.ts` → 840; `grep getToolByName src/session/session-tools.ts` → 600.
- `read src/extensibility/extensions/wrapper.ts:62-136` — RegisteredToolAdapter ctx binding.
- `read src/extensibility/extensions/runner.ts:453,724,1354-1433` — noOpUIContext + createContext.
- `read src/utils/event-bus.ts:1-49` — EventBus + emitSubagentFrame aliasing.
- `read src/registry/agent-registry.ts:99-170,283-295` — register/attachSession/global.
- `read src/task/executor.ts:4178-4235,4537` — child session options, keepAlive.
- `read src/internal-urls/agent-protocol.ts:218`, `history-protocol.ts:285-334` — read surfaces.

## Conflicting evidence

- **`keepAlive` for the eval `agent()` bridge.** `src/internal-urls/history-protocol.ts:7-11` claims one-shot helpers are "unregistered after `finalizeSubagentLifecycle` (`keepAlive: false`, e.g. the `eval` `agent()` bridge)". The actual bridge sets `keepAlive: true` — `src/eval/agent-bridge.ts:237`, and `omp://tools/eval.md` says eval subagents "are kept alive". The doc-comment is stale; trust the code + eval.md. Impact: eval-spawned agents ARE reachable at `agent://<id>`/`history://<id>` while alive.
- **`agent://`/`history://` registry choice.** `history-protocol.ts` hard-codes `AgentRegistry.global()` (`:319,343`), while `agent-protocol.ts` prefers `context?.agentRegistry ?? AgentRegistry.global()` (`:218`). A room test that passes a PRIVATE `AgentRegistry` to sessions would see `agent://` follow the session but `history://` follow the global. Keep the global registry + distinct `agentId` in tests to avoid this.
- **`subagentEventBus` is forwarded to children; `eventBus` is NOT** (`src/task/executor.ts:4216-4219`). So a room built on the shared `eventBus` must NOT rely on the bus reaching subagent sessions through the task path — the room store (module singleton) + `AgentRegistry.global()` are the shared channels; the shared `EventBus` only reaches sessions you construct yourself with the same instance.

## Gaps

- **RISK: real multi-agent prompting needs a live model/API key.** `task`, eval `agent()`, and `session.prompt()` all run a provider turn; `CreateAgentSessionOptions` exposes `getApiKey` (`src/sdk.ts:534`) but NO `streamFn`/transport override (only internal wiring at `src/sdk.ts:4273`). So there is no SDK seam to inject a fake model stream. **Fallbacks, in order:** (1) §10 — drive `room`/`wait_for_claim` `execute()` directly on real sessions; no model, deterministic, tests extension loading + shared store; (2) a keyless local provider (`ollama`/`lm-studio`/`llama.cpp`, or a custom provider with `auth: none`) — `omp://providers.md` — for a full prompt-level smoke test; (3) CI with a real API key for the end-to-end prompt test only.
- **RISK: `session.getToolByName("room")` depends on the extension tool being ACTIVE.** Extension tools are auto-activated unless `hidden`/`defaultInactive` — `src/sdk.ts:3956-3967,3931-3936`. If the room tool declares `hidden: true` or `defaultInactive: true`, the test must `await session.setActiveToolsByName([...session.getActiveToolNames(), "room"])` (`src/session/agent-session.ts:6052`). Fallback: register the room tool without those flags, or activate explicitly.
- **RISK: module-singleton store leaks across tests.** The room store lives in the extension module and is shared process-wide; two `bun test` files in one process share it. Fallback: give the store a `reset()` and call it in `beforeEach`, or key the store by the `local://` root so each test's temp dir gets its own store.
- **RISK: `wait_for_claim` needs interruptible/abort-clean semantics.** No global tool-execute timeout exists (verified prior round), but a blocking `execute()` promise in a test must be abortable; pass an `AbortSignal` and assert cleanup. Fallback: use `Promise.race` with a timeout in the test (as in §10) and abort the wait at teardown.
- Not verified: whether `createAgentSession` with `disableExtensionDiscovery: true` + inline `extensions` still loads bundled extensions (autoresearch is "unconditionally loaded" per `src/sdk.ts:3224-3226`); a test should not assume a clean extension set.
- Not verified: exact `PromptOptions` fields for a future prompt-level variant (`src/session/agent-session-types.ts:374`); not needed for the deterministic skeleton.
- `[SPEC]` The room tool's `op` names (`post_claim`, `read`, `wait_for_claim`) and the JSONL record shape (`type`/`author`/`name`) are the planned Round-2 surface, not yet implemented. The skeleton is a spec; the cited APIs (sessions, bus, local root, `getToolByName`, `execute`) are all real today.
