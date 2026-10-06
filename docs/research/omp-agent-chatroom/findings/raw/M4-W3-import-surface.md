# M4-W3: Import Surface for Room Plugin

## Angle
Verify every import specifier a room plugin needs against the actual `exports` block in `@oh-my-pi/pi-coding-agent@18.6.1` package.json. Quote exact signatures from source.

## Claims

### 1. Package exports block (verbatim)

```json
"exports": {
    ".": {
        "types": "./dist/types/index.d.ts",
        "import": "./src/index.ts"
    },
    "./*": {
        "types": "./dist/types/*.d.ts",
        "import": "./src/*.ts"
    },
    "./async": { "types": "./dist/types/async/index.d.ts", "import": "./src/async/index.ts" },
    "./async/*": { "types": "./dist/types/async/*.d.ts", "import": "./src/async/*.ts" },
    "./autoresearch": { "types": "./dist/types/autoresearch/index.d.ts", "import": "./src/autoresearch/index.ts" },
    "./autoresearch/*": { "types": "./dist/types/autoresearch/*.d.ts", "import": "./src/autoresearch/*.ts" },
    "./autoresearch/tools/*": { "types": "./dist/types/autoresearch/tools/*.d.ts", "import": "./src/autoresearch/tools/*.ts" },
    "./capability": { "types": "./dist/types/capability/index.d.ts", "import": "./src/capability/index.ts" },
    "./capability/*": { "types": "./dist/types/capability/*.d.ts", "import": "./src/capability/*.ts" },
    "./cli/*": { "types": "./dist/types/cli/*.d.ts", "import": "./src/cli/*.ts" },
    "./cli/gallery-fixtures": { "types": "./dist/types/cli/gallery-fixtures/index.d.ts", "import": "./src/cli/gallery-fixtures/index.ts" },
    "./cli/gallery-fixtures/*": { "types": "./dist/types/cli/gallery-fixtures/*.d.ts", "import": "./src/cli/gallery-fixtures/*.ts" },
    "./cli/commands/*": { "types": "./dist/types/cli/commands/*.d.ts", "import": "./src/cli/commands/*.ts" },
    "./commands/*": { "types": "./dist/types/commands/*.d.ts", "import": "./src/commands/*.ts" },
    "./commit": { "types": "./dist/types/commit/index.d.ts", "import": "./src/commit/index.ts" },
    "./commit/*": { "types": "./dist/types/commit/*.d.ts", "import": "./src/commit/*.ts" },
    "./commit/agentic": { "types": "./dist/types/commit/agentic/index.d.ts", "import": "./src/commit/agentic/index.ts" },
    "./commit/agentic/*": { "types": "./dist/types/commit/agentic/*.d.ts", "import": "./src/commit/agentic/*.ts" },
    "./commit/agentic/tools": { "types": "./dist/types/commit/agentic/tools/index.d.ts", "import": "./src/commit/agentic/tools/index.ts" },
    "./commit/agentic/tools/*": { "types": "./dist/types/commit/agentic/tools/*.d.ts", "import": "./src/commit/agentic/tools/*.ts" },
    "./commit/analysis": { "types": "./dist/types/commit/analysis/index.d.ts", "import": "./src/commit/analysis/index.ts" },
    "./commit/analysis/*": { "types": "./dist/types/commit/analysis/*.d.ts", "import": "./src/commit/analysis/*.ts" },
    "./commit/changelog": { "types": "./dist/types/commit/changelog/index.d.ts", "import": "./src/commit/changelog/index.ts" },
    "./commit/changelog/*": { "types": "./dist/types/commit/changelog/*.d.ts", "import": "./src/commit/changelog/*.ts" },
    "./commit/conventional": { "types": "./dist/types/commit/conventional/index.d.ts", "import": "./src/commit/conventional/index.ts" },
    "./commit/conventional/*": { "types": "./dist/types/commit/conventional/*.d.ts", "import": "./src/commit/conventional/*.ts" },
    "./commit/git/*": { "types": "./dist/types/commit/git/*.d.ts", "import": "./src/commit/git/*.ts" },
    "./commit/utils/*": { "types": "./dist/types/commit/utils/*.d.ts", "import": "./src/commit/utils/*.ts" },
    "./config/*": { "types": "./dist/types/config/*.d.ts", "import": "./src/config/*.ts" },
    "./dap": { "types": "./dist/types/dap/index.d.ts", "import": "./src/dap/index.ts" },
    "./dap/*": { "types": "./dist/types/dap/*.d.ts", "import": "./src/dap/*.ts" },
    "./debug": { "types": "./dist/types/debug/index.d.ts", "import": "./src/debug/index.ts" },
    "./debug/*": { "types": "./dist/types/debug/*.d.ts", "import": "./src/debug/*.ts" },
    "./discovery": { "types": "./dist/types/discovery/index.d.ts", "import": "./src/discovery/index.ts" },
    "./discovery/*": { "types": "./dist/types/discovery/*.d.ts", "import": "./src/discovery/*.ts" },
    "./edit": { "types": "./dist/types/edit/index.d.ts", "import": "./src/edit/index.ts" },
    "./edit/*": { "types": "./dist/types/edit/*.d.ts", "import": "./src/edit/*.ts" },
    "./exa": { "types": "./dist/types/exa/index.d.ts", "import": "./src/exa/index.ts" },
    "./exa/*": { "types": "./dist/types/exa/*.d.ts", "import": "./src/exa/*.ts" },
    "./exec/*": { "types": "./dist/types/exec/*.d.ts", "import": "./src/exec/*.ts" },
    "./export/*": { "types": "./dist/types/export/*.d.ts", "import": "./src/export/*.ts" },
    "./export/html": { "types": "./dist/types/export/html/index.d.ts", "import": "./src/export/html/index.ts" },
    "./export/html/*": { "types": "./dist/types/export/html/*.d.ts", "import": "./src/export/html/*.ts" },
    "./extensibility/*": { "types": "./dist/types/extensibility/*.d.ts", "import": "./src/extensibility/*.ts" },
    "./extensibility/custom-commands": { "types": "./dist/types/extensibility/custom-commands/index.d.ts", "import": "./src/extensibility/custom-commands/index.ts" },
    "./extensibility/custom-commands/*": { "types": "./dist/types/extensibility/custom-commands/*.d.ts", "import": "./src/extensibility/custom-commands/*.ts" },
    "./extensibility/custom-commands/bundled/ci-green": { "types": "./dist/types/extensibility/custom-commands/bundled/ci-green/index.d.ts", "import": "./src/extensibility/custom-commands/bundled/ci-green/index.ts" },
    "./extensibility/custom-commands/bundled/review": { "types": "./dist/types/extensibility/custom-commands/bundled/review/index.d.ts", "import": "./src/extensibility/custom-commands/bundled/review/index.ts" },
    "./extensibility/custom-commands/bundled/annotate": { "types": "./dist/types/extensibility/custom-commands/bundled/annotate/index.d.ts", "import": "./src/extensibility/custom-commands/bundled/annotate/index.ts" },
    "./extensibility/custom-tools": { "types": "./dist/types/extensibility/custom-tools/index.d.ts", "import": "./src/extensibility/custom-tools/index.ts" },
    "./extensibility/custom-tools/*": { "types": "./dist/types/extensibility/custom-tools/*.d.ts", "import": "./src/extensibility/custom-tools/*.ts" },
    "./extensibility/extensions": { "types": "./dist/types/extensibility/extensions/index.d.ts", "import": "./src/extensibility/extensions/index.ts" },
    "./extensibility/extensions/*": { "types": "./dist/types/extensibility/extensions/*.d.ts", "import": "./src/extensibility/extensions/*.ts" },
    "./extensibility/hooks": { "types": "./dist/types/extensibility/hooks/index.d.ts", "import": "./src/extensibility/hooks/index.ts" },
    "./extensibility/hooks/*": { "types": "./dist/types/extensibility/hooks/*.d.ts", "import": "./src/extensibility/hooks/*.ts" },
    "./extensibility/plugins": { "types": "./dist/types/extensibility/plugins/index.d.ts", "import": "./src/extensibility/plugins/index.ts" },
    "./extensibility/plugins/*": { "types": "./dist/types/extensibility/plugins/*.d.ts", "import": "./src/extensibility/plugins/*.ts" },
    "./extensibility/plugins/marketplace": { "types": "./dist/types/extensibility/plugins/marketplace/index.d.ts", "import": "./src/extensibility/plugins/marketplace/index.ts" },
    "./extensibility/plugins/marketplace/*": { "types": "./dist/types/extensibility/plugins/marketplace/*.d.ts", "import": "./src/extensibility/plugins/marketplace/*.ts" },
    "./ida": { "types": "./dist/types/ida/index.d.ts", "import": "./src/ida/index.ts" },
    "./ida/*": { "types": "./dist/types/ida/*.d.ts", "import": "./src/ida/*.ts" },
    "./internal-urls": { "types": "./dist/types/internal-urls/index.d.ts", "import": "./src/internal-urls/index.ts" },
    "./internal-urls/*": { "types": "./dist/types/internal-urls/*.d.ts", "import": "./src/internal-urls/*.ts" },
    "./eval": { "types": "./dist/types/eval/index.d.ts", "import": "./src/eval/index.ts" },
    "./if-bench": { "types": "./dist/types/if-bench/index.d.ts", "import": "./src/if-bench/index.ts" },
    "./if-bench/*": { "types": "./dist/types/if-bench/*.d.ts", "import": "./src/if-bench/*.ts" },
    "./eval/js/*": { "types": "./dist/types/eval/js/*.d.ts", "import": "./src/eval/js/*.ts" },
    "./eval/py/*": { "types": "./dist/types/eval/py/*.d.ts", "import": "./src/eval/py/*.ts" },
    "./lsp": { "types": "./dist/types/lsp/index.d.ts", "import": "./src/lsp/index.ts" },
    "./lsp/*": { "types": "./dist/types/lsp/*.d.ts", "import": "./src/lsp/*.ts" },
    "./lsp/clients": { "types": "./dist/types/lsp/clients/index.d.ts", "import": "./src/lsp/clients/index.ts" },
    "./lsp/clients/*": { "types": "./dist/types/lsp/clients/*.d.ts", "import": "./src/lsp/clients/*.ts" },
    "./judgment": { "types": "./dist/types/judgment/index.d.ts", "import": "./src/judgment/index.ts" },
    "./markit": { "types": "./dist/types/markit/index.d.ts", "import": "./src/markit/index.ts" },
    "./markit/*": { "types": "./dist/types/markit/*.d.ts", "import": "./src/markit/*.ts" },
    "./mcp": { "types": "./dist/types/mcp/index.d.ts", "import": "./src/mcp/index.ts" },
    "./mcp/*": { "types": "./dist/types/mcp/*.d.ts", "import": "./src/mcp/*.ts" },
    "./mcp/transports": { "types": "./dist/types/mcp/transports/index.d.ts", "import": "./src/mcp/transports/index.ts" },
    "./mcp/transports/*": { "types": "./dist/types/mcp/transports/*.d.ts", "import": "./src/mcp/transports/*.ts" },
    "./memories": { "types": "./dist/types/memories/index.d.ts", "import": "./src/memories/index.ts" },
    "./memories/*": { "types": "./dist/types/memories/*.d.ts", "import": "./src/memories/*.ts" },
    "./memory-backend": { "types": "./dist/types/memory-backend/index.d.ts", "import": "./src/memory-backend/index.ts" },
    "./memory-backend/*": { "types": "./dist/types/memory-backend/*.d.ts", "import": "./src/memory-backend/*.ts" },
    "./hindsight": { "types": "./dist/types/hindsight/index.d.ts", "import": "./src/hindsight/index.ts" },
    "./hindsight/*": { "types": "./dist/types/hindsight/*.d.ts", "import": "./src/hindsight/*.ts" },
    "./modes": { "types": "./dist/types/modes/index.d.ts", "import": "./src/modes/index.ts" },
    "./modes/*": { "types": "./dist/types/modes/*.d.ts", "import": "./src/modes/*.ts" },
    "./modes/acp": { "types": "./dist/types/modes/acp/index.d.ts", "import": "./src/modes/acp/index.ts" },
    "./modes/acp/*": { "types": "./dist/types/modes/acp/*.d.ts", "import": "./src/modes/acp/*.ts" },
    "./modes/components": { "types": "./dist/types/modes/components/index.d.ts", "import": "./src/modes/components/index.ts" },
    "./modes/components/*": { "types": "./dist/types/modes/components/*.d.ts", "import": "./src/modes/components/*.ts" },
    "./modes/components/extensions/*": { "types": "./dist/types/modes/components/extensions/*.d.ts", "import": "./src/modes/components/extensions/*.ts" },
    "./modes/controllers/*": { "types": "./dist/types/modes/controllers/*.d.ts", "import": "./src/modes/controllers/*.ts" },
    "./modes/rpc/*": { "types": "./dist/types/modes/rpc/*.d.ts", "import": "./src/modes/rpc/*.ts" },
    "./modes/utils/*": { "types": "./dist/types/modes/utils/*.d.ts", "import": "./src/modes/utils/*.ts" },
    "./plan-mode/*": { "types": "./dist/types/plan-mode/*.d.ts", "import": "./src/plan-mode/*.ts" },
    "./registry/*": { "types": "./dist/types/registry/*.d.ts", "import": "./src/registry/*.ts" },
    "./secrets": { "types": "./dist/types/secrets/index.d.ts", "import": "./src/secrets/index.ts" },
    "./secrets/*": { "types": "./dist/types/secrets/*.d.ts", "import": "./src/secrets/*.ts" },
    "./session/*": { "types": "./dist/types/session/*.d.ts", "import": "./src/session/*.ts" },
    "./slash-commands/*": { "types": "./dist/types/slash-commands/*.d.ts", "import": "./src/slash-commands/*.ts" },
    "./ssh/*": { "types": "./dist/types/ssh/*.d.ts", "import": "./src/ssh/*.ts" },
    "./stt": { "types": "./dist/types/stt/index.d.ts", "import": "./src/stt/index.ts" },
    "./stt/*": { "types": "./dist/types/stt/*.d.ts", "import": "./src/stt/*.ts" },
    "./task": { "types": "./dist/types/task/index.d.ts", "import": "./src/task/index.ts" },
    "./task/*": { "types": "./dist/types/task/*.d.ts", "import": "./src/task/*.ts" },
    "./tools": { "types": "./dist/types/tools/index.d.ts", "import": "./src/tools/index.ts" },
    "./tools/jfind": { "types": "./dist/types/tools/jfind/index.d.ts", "import": "./src/tools/jfind/index.ts" },
    "./tools/jfind/*": { "types": "./dist/types/tools/jfind/*.d.ts", "import": "./src/tools/jfind/*.ts" },
    "./tools/*": { "types": "./dist/types/tools/*.d.ts", "import": "./src/tools/*.ts" },
    "./utils/*": { "types": "./dist/types/utils/*.d.ts", "import": "./src/utils/*.ts" },
    "./web/*": { "types": "./dist/types/web/*.d.ts", "import": "./src/web/*.ts" },
    "./web/scrapers": { "types": "./dist/types/web/scrapers/index.d.ts", "import": "./src/web/scrapers/index.ts" },
    "./web/scrapers/*": { "types": "./dist/types/web/scrapers/*.d.ts", "import": "./src/web/scrapers/*.ts" },
    "./web/search": { "types": "./dist/types/web/search/index.d.ts", "import": "./src/web/search/index.ts" },
    "./web/search/*": { "types": "./dist/types/web/search/*.d.ts", "import": "./src/web/search/*.ts" },
    "./web/search/providers/*": { "types": "./dist/types/web/search/providers/*.d.ts", "import": "./src/web/search/providers/*.ts" },
    "./prompts/*": "./src/prompts/*.md",
    "./*.js": "./src/*.ts"
}
```
— `package.json:56-527` (fetch 2026-10-06) — confidence: primary

### 2. Import specifier resolution

- `@oh-my-pi/pi-coding-agent` → `import` → `./src/index.ts` — `package.json:57-60` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent/src/sdk` → `"./*"` → `./src/*.ts` → `./src/sdk.ts` — `package.json:61-64` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent/src/registry/agent-registry` → `"./registry/*"` → `./src/registry/*.ts` → `./src/registry/agent-registry.ts` — `package.json:441-444` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent/src/session/agent-session` → `"./session/*"` → `./src/session/*.ts` → `./src/session/agent-session.ts` — `package.json:453-456` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent/src/utils/event-bus` → `"./utils/*"` → `./src/utils/*.ts` → `./src/utils/event-bus.ts` — `package.json:497-500` (fetch 2026-10-06) — confidence: primary
- `@oh-my-pi/pi-coding-agent/src/task` → `"./task"` → `./src/task/index.ts` — `package.json:473-476` (fetch 2026-10-06) — confidence: primary

### 3. AgentRegistry

- `AgentRegistry` is a root export: `export * from "./sdk"` re-exports it via `src/sdk.ts:898`: `export { type AgentRef, AgentRegistry, MAIN_AGENT_ID } from "./registry/agent-registry";` — `src/sdk.ts:898` (fetch 2026-10-06) — confidence: primary
- `AgentRegistry.global()` signature: `static global(): AgentRegistry { if (!AgentRegistry.#global) { AgentRegistry.#global = new AgentRegistry(); } return AgentRegistry.#global; }` — `src/registry/agent-registry.ts:115-120` (fetch 2026-10-06) — confidence: primary
- `AgentRegistry` class methods: `register(input: RegisterInput): AgentRef`, `registerIfAvailable(input: RegisterInput, expected: AgentRef | null): AgentRef | undefined`, `setHistory(id: string, history: AgentHistorySummary, expectedSessionFile?: string): boolean`, `setStatus(id: string, status: AgentStatus, expected?: AgentRefExpectation): boolean`, `markResultAccepted(id: string, expected?: AgentRefExpectation, responseAt?: number): boolean`, `staleAcceptedRuns(): AgentRef[]`, `setActivity(id: string, activity: string): void`, `attachSession(id: string, session: AgentSession, sessionFile?: string | null, expected?: AgentRefExpectation): boolean`, `detachSession(id: string, expected?: AgentRefExpectation): boolean`, `unregister(id: string, expected?: AgentRefExpectation): boolean`, `get(id: string): AgentRef | undefined`, `list(): AgentRef[]`, `listVisibleTo(id: string): AgentRef[]`, `isRunning(ref: AgentRef): boolean`, `syncSessionStatus(id: string, session: AgentSession): () => void`, `onChange(listener: RegistryListener): () => void` — `src/registry/agent-registry.ts:112-362` (fetch 2026-10-06) — confidence: primary

### 4. AgentRef interface (verbatim)

```typescript
export interface AgentRef {
    id: string;
    displayName: string;
    kind: AgentKind;
    parentId?: string;
    status: AgentStatus;
    /** Null exactly when parked/aborted. */
    session: AgentSession | null;
    sessionFile: string | null;
    createdAt: number;
    lastActivity: number;
    /** Short gist of what the agent is currently doing (latest intent or tool), for the work-aware roster. Display-only. */
    activity?: string;
    /** Persisted identity and telemetry restored after the live observer is gone. */
    history?: AgentHistorySummary;
    /** Run lifecycle milestones (launch is {@link createdAt}). */
    lifecycle?: AgentRunLifecycle;
}
```
— `src/registry/agent-registry.ts:63-80` (fetch 2026-10-06) — confidence: primary

- `session` is typed `AgentSession | null` — nullable, not optional. Comment: "Null exactly when parked/aborted." — `src/registry/agent-registry.ts:70` (fetch 2026-10-06) — confidence: primary
- `AgentSession` is a root export: `export * from "./session/agent-session"` — `src/index.ts:41` (fetch 2026-10-06) — confidence: primary
- `AgentSession` class declaration: `export class AgentSession implements SettingsScope {` — `src/session/agent-session.ts:662` (fetch 2026-10-06) — confidence: primary

### 5. AgentRef.session methods on a sibling

- `async steer(text: string, images?: ImageContent[], options?: SteerOptions): Promise<void>` — `src/session/agent-session.ts:7829` (fetch 2026-10-06) — confidence: primary
- `async followUp(text: string, images?: ImageContent[], options?: FollowUpOptions): Promise<void>` — `src/session/agent-session.ts:7852` (fetch 2026-10-06) — confidence: primary
- `async sendCustomMessage<T = unknown>(message: CustomMessagePayload<T>, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" | "aside"; queueChipText?: string; acceptTerminalEmptyStop?: boolean; }): Promise<boolean>` — `src/session/agent-session.ts:8324-8334` (fetch 2026-10-06) — confidence: primary
- `async sendUserMessage(content: string | (TextContent | ImageContent)[], options?: SendUserMessageOptions): Promise<void>` — `src/session/agent-session.ts:8518-8521` (fetch 2026-10-06) — confidence: primary
- `drainPendingIrcInboxMessages(agentId: string, opts?: { from?: string; limit?: number }): IrcMessage[]` — `src/session/agent-session.ts:10381-10383` (fetch 2026-10-06) — confidence: primary
- `deliverIrcMessage(msg: IrcMessage): Promise<"injected" | "woken">` — `src/session/agent-session.ts:10386-10388` (fetch 2026-10-06) — confidence: primary

- `SteerOptions`: `export interface SteerOptions { attribution?: MessageAttribution; }` — `src/session/agent-session-types.ts:440-443` (fetch 2026-10-06) — confidence: primary
- `FollowUpOptions`: `export interface FollowUpOptions { synthetic?: boolean; expandPromptTemplates?: boolean; attribution?: MessageAttribution; }` — `src/session/agent-session-types.ts:430-437` (fetch 2026-10-06) — confidence: primary
- `SendUserMessageOptions`: `export interface SendUserMessageOptions { deliverAs?: "steer" | "followUp" | "aside"; attribution?: MessageAttribution; }` — `src/session/agent-session-types.ts:446-451` (fetch 2026-10-06) — confidence: primary
- `CustomMessagePayload<T = unknown> = string | Partial<Pick<CustomMessage<T>, "customType" | "content" | "display" | "details" | "attribution">>` — `@oh-my-pi/pi-tui/src/chat/messages.ts:42-44` (fetch 2026-10-06) — confidence: primary
- `IrcMessage`: `export interface IrcMessage { id: string; from: string; to: string; body: string; ts: number; replyTo?: string; wakeRelay?: boolean; }` — `@oh-my-pi/pi-tui/src/tools/irc.ts:7-24` (fetch 2026-10-06) — confidence: primary

- `sendCustomMessage` returns `Promise<boolean>` — `true` when admitted, `false` when rejected (disposed session, command rejected, etc.) — `src/session/agent-session.ts:8332-8334` (fetch 2026-10-06) — confidence: primary
- `steer`/`followUp`/`sendUserMessage` return `Promise<void>` — no boolean; they queue and return — `src/session/agent-session.ts:7829,7852,8518` (fetch 2026-10-06) — confidence: primary
- `deliverIrcMessage` returns `Promise<"injected" | "woken">` — `"injected"` = queued into session inbox, `"woken"` = agent was idle and woken — `src/session/agent-session.ts:10386-10388` (fetch 2026-10-06) — confidence: primary
- `drainPendingIrcInboxMessages` returns `IrcMessage[]` — drains and returns pending messages for an agent — `src/session/agent-session.ts:10381-10383` (fetch 2026-10-06) — confidence: primary

### 6. onChange subscription

- `onChange(listener: RegistryListener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }` — `src/registry/agent-registry.ts:348-351` (fetch 2026-10-06) — confidence: primary
- `type RegistryListener = (event: RegistryEvent) => void;` — `src/registry/agent-registry.ts:90` (fetch 2026-10-06) — confidence: primary
- `export type RegistryEvent = | { type: "registered"; ref: AgentRef } | { type: "status_changed"; ref: AgentRef } | { type: "metadata_changed"; ref: AgentRef } | { type: "removed"; ref: AgentRef };` — `src/registry/agent-registry.ts:84-88` (fetch 2026-10-06) — confidence: primary
- Unsubscribe: call the returned function from `onChange()` — `src/registry/agent-registry.ts:350` (fetch 2026-10-06) — confidence: primary

### 7. MAIN_AGENT_ID

- `export const MAIN_AGENT_ID = "Main";` — `@oh-my-pi/pi-tui/src/overlays/agent-hub-types.ts:5` (fetch 2026-10-06) — confidence: primary
- Re-exported from `src/registry/agent-registry.ts:17`: `export { MAIN_AGENT_ID };` — `src/registry/agent-registry.ts:17` (fetch 2026-10-06) — confidence: primary
- Re-exported from `src/sdk.ts:898`: `export { type AgentRef, AgentRegistry, MAIN_AGENT_ID } from "./registry/agent-registry";` — `src/sdk.ts:898` (fetch 2026-10-06) — confidence: primary
- Available from root `@oh-my-pi/pi-coding-agent` via `export * from "./sdk"` — `src/index.ts:40` (fetch 2026-10-06) — confidence: primary

### 8. ExtensionAPI.pi field

- `pi: typeof PiCodingAgent;` where `import type * as PiCodingAgent from "../../index";` — `src/extensibility/extensions/types.ts:79,1375` (fetch 2026-10-06) — confidence: primary
- Bound in `ConcreteExtensionAPI` constructor: `constructor(public readonly pi: typeof PiCodingAgent, ...)` — `src/extensibility/extensions/loader.ts:192` (fetch 2026-10-06) — confidence: primary
- `pi` gives access to all root exports: `AgentRegistry`, `AgentRef`, `AgentSession`, `MAIN_AGENT_ID`, `SessionManager`, `ToolSession`, etc. — `src/extensibility/extensions/types.ts:1375` (fetch 2026-10-06) — confidence: primary

### 9. EventBus

- `export class EventBus { ... }` — `src/utils/event-bus.ts:3` (fetch 2026-10-06) — confidence: primary
- NOT re-exported from root `src/index.ts` — no `export.*EventBus` or `export.*event-bus` found — `src/index.ts` (fetch 2026-10-06) — confidence: primary
- Deep import `@oh-my-pi/pi-coding-agent/src/utils/event-bus` IS covered by `"./utils/*"` export — `package.json:497-500` (fetch 2026-10-06) — confidence: primary
- RISK: Not available from root. Fallback: use `pi.pi` to access root exports, but `EventBus` is not a root export. Must use deep import `@oh-my-pi/pi-coding-agent/src/utils/event-bus` or access via `pi.events` (the `events` field on `ConcreteExtensionAPI` is `public readonly events: EventBus` — `src/extensibility/extensions/loader.ts:196`) — confidence: primary

### 10. SessionManager

- `export class SessionManager { ... }` — `src/session/session-manager.ts:786` (fetch 2026-10-06) — confidence: primary
- Root export: `export * from "./session/session-manager"` — `src/index.ts:52` (fetch 2026-10-06) — confidence: primary
- Available from `@oh-my-pi/pi-coding-agent` root — confidence: primary

### 11. ToolSession

- `export interface ToolSession { ... }` — `src/tools/index.ts:208` (fetch 2026-10-06) — confidence: primary
- Root export: `export * from "./tools"` — `src/index.ts:75` (fetch 2026-10-06) — confidence: primary
- Available from `@oh-my-pi/pi-coding-agent` root — confidence: primary

### 12. AgentOutputManager

- `export class AgentOutputManager { ... }` — `src/task/output-manager.ts:24` (fetch 2026-10-06) — confidence: primary
- Re-exported from `src/task/index.ts:135`: `export { AgentOutputManager } from "./output-manager";` — `src/task/index.ts:135` (fetch 2026-10-06) — confidence: primary
- NOT re-exported from root `src/index.ts` (root has `export * from "./task/executor"` but not `export * from "./task"`) — `src/index.ts:56` (fetch 2026-10-06) — confidence: primary
- Deep import `@oh-my-pi/pi-coding-agent/src/task` IS covered by `"./task"` export → `./src/task/index.ts` — `package.json:473-476` (fetch 2026-10-06) — confidence: primary
- RISK: Not available from root. Fallback: deep import `@oh-my-pi/pi-coding-agent/src/task` — confidence: primary

### 13. Import table

| Import specifier | What it gives | Primary source | RISK? |
|---|---|---|---|
| `@oh-my-pi/pi-coding-agent` | Root: `AgentRegistry`, `AgentRef`, `AgentSession`, `MAIN_AGENT_ID`, `SessionManager`, `ToolSession`, `Settings`, `logger`, `VERSION`, all extension types, all tool types | `src/index.ts:1-82` | No |
| `@oh-my-pi/pi-coding-agent/src/sdk` | SDK re-exports: `AgentRegistry`, `AgentRef`, `MAIN_AGENT_ID`, `ToolSession`, `Settings`, tool classes | `src/sdk.ts:884-917` | No |
| `@oh-my-pi/pi-coding-agent/src/registry/agent-registry` | `AgentRegistry`, `AgentRef`, `AgentRefExpectation`, `RegistryEvent`, `RegisterInput`, `AgentRunLifecycle`, `AgentHistorySummary`, `AgentKind`, `AgentStatus`, `AgentMetricsSummary`, `MAIN_AGENT_ID` | `src/registry/agent-registry.ts:1-362` | No |
| `@oh-my-pi/pi-coding-agent/src/session/agent-session` | `AgentSession` class | `src/session/agent-session.ts:662` | No |
| `@oh-my-pi/pi-coding-agent/src/session/agent-session-types` | `SteerOptions`, `FollowUpOptions`, `SendUserMessageOptions`, `HandoffResult`, `SessionHandoffOptions` | `src/session/agent-session-types.ts:429-463` | No |
| `@oh-my-pi/pi-coding-agent/src/session/session-manager` | `SessionManager` class | `src/session/session-manager.ts:786` | No |
| `@oh-my-pi/pi-coding-agent/src/tools` | `ToolSession`, `ToolFactory`, `BUILTIN_TOOLS`, `createTools`, tool classes | `src/tools/index.ts:208,557,840` | No |
| `@oh-my-pi/pi-coding-agent/src/task` | `AgentOutputManager`, `discoverAgents`, `getAgent`, task types | `src/task/index.ts:134-138` | No |
| `@oh-my-pi/pi-coding-agent/src/utils/event-bus` | `EventBus` class | `src/utils/event-bus.ts:3` | No (deep import, but covered by `./utils/*`) |
| `pi.pi` (via ExtensionAPI) | All root exports as namespace object | `src/extensibility/extensions/types.ts:1375`, `src/extensibility/extensions/loader.ts:192` | No |

### 14. Recommended plugin import strategy

- Use `pi.pi` (the `pi` field on `ExtensionAPI`) to access `AgentRegistry`, `AgentRef`, `AgentSession`, `MAIN_AGENT_ID`, `SessionManager`, `ToolSession` — all available as root exports — `src/extensibility/extensions/types.ts:1375` (fetch 2026-10-06) — confidence: primary
- For `EventBus`: use `pi.events` (the `events` field on the extension API instance, typed `public readonly events: EventBus`) — `src/extensibility/extensions/loader.ts:196` (fetch 2026-10-06) — confidence: primary
- For `AgentOutputManager`: deep import `@oh-my-pi/pi-coding-agent/src/task` (covered by exports) — `package.json:473-476` (fetch 2026-10-06) — confidence: primary
- All deep imports used are covered by the `exports` block — no runtime resolution failures expected under Bun — confidence: primary

## Searches
- `package.json` exports block: `package.json:56-527`
- `src/index.ts` root exports: `src/index.ts:1-82`
- `src/sdk.ts` re-exports: `src/sdk.ts:884-917`
- `src/registry/agent-registry.ts`: `src/registry/agent-registry.ts:1-362`
- `src/session/agent-session.ts`: `src/session/agent-session.ts:662,7829,7852,8324-8334,8518-8521,10381-10388`
- `src/session/agent-session-types.ts`: `src/session/agent-session-types.ts:429-463`
- `src/session/session-manager.ts`: `src/session/session-manager.ts:786`
- `src/tools/index.ts`: `src/tools/index.ts:208,557,840`
- `src/task/index.ts`: `src/task/index.ts:134-138`
- `src/task/output-manager.ts`: `src/task/output-manager.ts:24`
- `src/utils/event-bus.ts`: `src/utils/event-bus.ts:3`
- `src/extensibility/extensions/types.ts`: `src/extensibility/extensions/types.ts:79,1375`
- `src/extensibility/extensions/loader.ts`: `src/extensibility/extensions/loader.ts:34,192,196`
- `@oh-my-pi/pi-tui/src/overlays/agent-hub-types.ts`: `@oh-my-pi/pi-tui/src/overlays/agent-hub-types.ts:5`
- `@oh-my-pi/pi-tui/src/tools/irc.ts`: `@oh-my-pi/pi-tui/src/tools/irc.ts:7-24`
- `@oh-my-pi/pi-tui/src/chat/messages.ts`: `@oh-my-pi/pi-tui/src/chat/messages.ts:42-44`

## Conflicting evidence
- None found. All deep imports verified against exports block. All signatures quoted from source.

## Gaps
- `EventBus` is not a root export but is accessible via `pi.events` on the extension API instance. This is the intended path for extensions.
- `AgentOutputManager` is not a root export but is accessible via deep import `@oh-my-pi/pi-coding-agent/src/task`. Low risk since exports cover it.
- `CustomMessagePayload` and `IrcMessage` types come from `@oh-my-pi/pi-tui`, not `@oh-my-pi/pi-coding-agent`. They are re-exported through `src/session/agent-session.ts` imports but not directly from root. Access via `pi.pi` or deep import.
