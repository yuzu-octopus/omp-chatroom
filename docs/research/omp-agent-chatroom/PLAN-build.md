# PLAN-build.md — omp agent-chatroom plugin, build-ready implementation plan

Date: 2026-10-06 · Target host: omp 18.6.1 (`@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`)
Evidence base: `findings/F15..F19` (round 3) + `REPORT-v2-hybrid.md` (round 2) + `REPORT.md` (round 1).
Every non-obvious claim carries a source tag: `[F15]`…`[F19]`, `[R2]`, `[F0]`, `[F1]`…, or a direct
`path:lines` citation.

---

## 1. Goal + scope

**Goal.** Ship a hybrid coordination layer for one omp process:

- **Native `agent://` stays untouched** — point-to-point steering, hard interrupts, idle wake, revival.
- **The plugin adds a room** whose value rides on a **structured claim/status board**, not a chat backlog.
- **Three blocking wait tools** so an agent can block on coordination instead of polling.
- **A human-facing panel** (chat stream + claim board + presence) in Agent Hub's visual language.
- **Inline transcript cards** so room traffic renders in the scrollback like native IRC cards.

**Why hybrid, not either/or** — channel + DM coexist in every mature system (IRC `PRIVMSG` vs `#chan`;
Slack/Discord/Zulip) and the queue-vs-pub-sub split is the systems form of the same rule `[R2 §1]`.
Round 1's rejection of a *full unbounded room* stands; a room with per-agent cursors, caps, and
pull-only T2 is a different object `[R2 §Round 1 revised]`.

### 1.1 What ships in v1 (in scope)

| # | Deliverable | Source of truth |
|---|---|---|
| 1 | Room store: append-only JSONL under the shared `local://` root + in-memory projection | `F18 §1–2` |
| 2 | One op-dispatched `room` tool (join/read/post/claim/release/board/topics/mute/unmute/tree/zoom/recall) | `R2 §Tool surface` |
| 3 | Three blocking wait tools: `wait_for_agent`, `wait_for_message`, `wait_for_claim` | `R2 §B` |
| 4 | Claim arbiter with mandatory TTL + explicit reclaim | `R2 §Components 4` |
| 5 | Attention governor: 3 tiers, per-agent cursors, injection cap, token bucket, coalesce, mute, gap notices | `R2 §D`, `F14 §Candidate` |
| 6 | Onboarding: `before_agent_start` digest + routing rule prompt block | `R2 §Components 7`, `F3` |
| 7 | Panel: `/room` overlay (Layout A) | `F16 §4` |
| 8 | Inline cards: `room:message`, `room:mention`, `room:claim`, `room:board-delta` + tool cards | `F19 §9,14` |
| 9 | Slash command `/room`, optional configurable key, plugin settings schema, bundled skill | `F15 §Q1,Q4`, `F17 §4` |
| 10 | Multi-agent integration test (one process) | `F18 §5` |
| 11 | Cold tree: binary summary tree over `[0, N-R)` + background compactor (`@smol` via `streamSimple`) + `tree`/`zoom`/`recall` ops | `R3 §1–§6` |

### 1.2 Explicitly out of scope (v1)

- **Cross-process rooms.** `EventBus` is per-session-tree, `AgentRegistry.global()` is per-process;
  Collab mirrors a session to a human, not agent-to-agent `[F0 §gap]`. The room is in-process only.
- **Restricted / plan-mode children.** Extension tools are never admitted to `restrictToolNames`
  sessions, including late registrations `[F2 §Restricted]`, `[F0]`. The room degrades to "not a member".
- **Intercepting native `agent://` traffic.** `IrcBus` is not a root export; the plugin can only
  observe traffic *in its own session* via `message_start`/`message_end` custom-role filtering `[F0 Add.1]`.
- **Being the system of record.** Bulk artifacts stay on `local://` / `artifact://` `[R2 §Components]`.
- **Enforcing reply deadlines server-side.** No surveyed protocol does; the plugin runs its own timer `[R2 §C]`.

### 1.3 Assumptions (written, non-blocking)

1. Single omp process; one room per session tree, room id = the `local://` root's owner session.
2. Normal `task` subagents are **not** restricted by default (`restrictToolNames = policy.planMode ||
   session.restrictToolNames === true`) `[F0 §plugin]` — so they do get the room tool.
3. Bun is the runtime and the package manager (`node:fs` compat is available) `[F18 §2]`.
4. Single-threaded JS execution — no true parallelism within the process; `fs.writeSync` is atomic
   against other JS threads `[F18 §2]`.
5. One process per `local://` root — no cross-process writers (§1.2 out-of-scope).
6. Stable agent ids across revive — `AgentRegistry` re-registers the same `agentId` after a
   parked agent is revived `[F18 §3]`.
7. The room log file survives sessions — it lives under the `local://` root, not in ephemeral
   storage `[F18 §1]`.
8. The `local://` root persists across resumes — artifacts dir is stable per session tree
   `[F18 §1]`.
9. `AgentRegistry.global()` is available at tool execution time — the registry is a module-level
   singleton populated before any tool runs `[F18 §3]`.

---

## 2. Manifest + repo layout

### 2.1 Repo layout (exact files)

```
omp-chatroom/
├── package.json                        # plugin manifest (§2.2)
├── tsconfig.json                       # typecheck only; Bun runs TS directly
├── README.md
├── src/
│   ├── index.ts                        # default-export ExtensionFactory: wires everything
│   ├── ids.ts                          # roomIdFor(root), resourceKey(), newMessageId()
│   ├── store/
│   │   ├── schema.ts                   # RoomRecord union + envelope types (§3.2)
│   │   ├── log.ts                      # openRoomLog / appendLine / readSince / replay (§3.3)
│   │   ├── room-store.ts               # RoomStore singleton: state + change listeners (§3.1)
│   │   ├── claims.ts                   # claim arbiter: grant/release/reclaim/expire (§3.4)
│   │   ├── cursors.ts                  # per-agent cursor map + persistence (§3.5)
│   │   ├── tree-store.ts               # binary summary tree: getNode/putNode/forget/cover (§3.6)
│   │   └── compactor.ts                # background job: ctx.setInterval + streamSimple(@smol) (§3.6)
│   ├── attention/
│   │   ├── tiers.ts                    # classify(record, viewer) → "T0"|"T1"|"T2" (§5.1)
│   │   ├── governor.ts                 # injection cap, coalesce, token bucket, mute, gaps (§5.2)
│   │   └── delivery.ts                 # deliverT0/T1/T2 via ctx or AgentRef.session (§5.3)
│   ├── tools/
│   │   ├── room.ts                     # the op-dispatched `room` tool (§4.1)
│   │   ├── wait-for-agent.ts           # §4.2
│   │   ├── wait-for-message.ts         # §4.3
│   │   └── wait-for-claim.ts           # §4.4
│   ├── onboarding/
│   │   ├── digest.ts                   # buildDigest(store, viewer, budget) → string (§5.4)
│   │   ├── routing-rule.md             # the prompt block (§8), imported as text
│   │   └── hook.ts                     # before_agent_start append + session_shutdown prune
│   ├── panel/
│   │   ├── panel.ts                    # RoomPanel component (§6.2)
│   │   ├── chat-pane.ts                # row projection → string[] (§6.3)
│   │   ├── board-pane.ts               # claim rows (§6.4)
│   │   ├── roster-strip.ts             # one-line presence (§6.5)
│   │   ├── chrome.ts                   # frame rows via topBorderSplit/dividerSplit/bottomBorder
│   │   └── keys.ts                     # key map (§6.6)
│   ├── cards/
│   │   ├── message-cards.ts            # registerMessageRenderer ×4 (§7.2)
│   │   └── tool-cards.ts               # renderCall/renderResult/describeCall/describeResult (§7.5)
│   └── commands/
│       └── room-command.ts             # `/room` slash command (§6.1)
├── skills/
│   └── omp-agent-chatroom/SKILL.md     # discovered by directory scan, NOT by the manifest [F15 Q1]
└── tests/
    ├── store.test.ts                   # append/read/replay/cursor/claim
    ├── attention.test.ts               # tier classify + caps + coalesce
    └── e2e-room.test.ts                # multi-agent in-process acceptance (§11)
```

### 2.1.1 `src/index.ts` — ExtensionFactory + `__roomTest` (M-4, M-5)

The default export is an `ExtensionFactory` — a function `(pi: ExtensionAPI) => void` that
registers everything the plugin provides. It is called once per session tree by
`bindPreparedExtensions` `[F0 Add.2.1]`.

**What it registers** (gated by manifest features):
```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function roomExtension(pi: ExtensionAPI): void {
  const features = pi.enabledFeatures;   // null = use defaults
  const has = (f: string) => features === null || features.has(f);

  if (has("room")) {
    registerRoomTool(pi);               // §4.1 — the op-dispatched `room` tool
    registerRoomCommand(pi);            // §6.1 — `/room` slash command
    registerMessageRenderers(pi);       // §7.2 — room:message, room:mention, room:claim, room:board-delta
    registerHooks(pi);                  // §5.4 — before_agent_start + session_shutdown
  }
  if (has("wait-tools")) {
    registerWaitForAgent(pi);            // §4.2
    registerWaitForMessage(pi);          // §4.3
    registerWaitForClaim(pi);            // §4.4
  }
  if (has("panel")) {
    registerPanel(pi);                  // §6.2 — RoomPanel component
  }
}
```

**`__roomTest` named export** (M-4): a test-only seam for deterministic multi-agent
testing. It does NOT change production behaviour — it is a plain object with a `reset()`
method that clears the in-memory store between tests:
```ts
export const __roomTest = {
  store: {
    reset(): void {
      // clears RoomStore singleton: records, claims, cursors, members, seq
    }
  }
};
```
The test harness calls `__roomTest.store.reset()` before each test to get a clean slate.
In production, `__roomTest` is never imported — it is tree-shaken or ignored.

### 2.1.2 `src/ids.ts` — id derivation (M-6)

```ts
import * as crypto from "node:crypto";

/**
 * Derive the room id from the local:// root path.
 * Rule: take the last path segment of the root, strip non-alphanumeric chars, lowercase.
 * Example: /tmp/omp-local/abc123 → "abc123"
 * If the root is empty or "/", fall back to "room".
 */
export function roomIdFor(root: string): string {
  const seg = root.split("/").filter(Boolean).pop() ?? "";
  const id = seg.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return id || "room";
}

/**
 * Canonical resource key: "<topic>/<key>"
 */
export function resourceKey(topic: string, key: string): string {
  return `${topic}/${key}`;
}

/**
 * Unique message id (UUID v4).
 */
export function newMessageId(): string {
  return crypto.randomUUID();
}
```

**`roomIdFor` derivation rule**: the room id is the last segment of the `local://` root
path, lowercased and stripped of non-alphanumeric characters. This gives a stable,
human-readable id that matches the session tree. If the root is `/` or empty, the
fallback is `"room"`.

### 2.2 `package.json` — verbatim manifest shape

`PluginManifest` is `src/extensibility/plugins/types.ts:27-49`; resolution order is
`package.json#omp` → `package.json#pi` → `{version}` `[F15 §Q1]`.

```json
{
  "name": "omp-agent-chatroom",
  "version": "0.1.0",
  "description": "In-process multi-agent chatroom: claim board, bounded chat, blocking waits",
  "type": "module",
  "omp": {
    "name": "Agent Chatroom",
    "version": "0.1.0",
    "description": "In-process multi-agent chatroom: claim board, bounded chat, blocking waits",
    "extensions": ["./src/index.ts"],
    "features": {
      "room": {
        "description": "Room store, claim board, and the room tool",
        "default": true,
        "extensions": ["./src/index.ts"]
      },
      "wait-tools": {
        "description": "Blocking wait tools (wait_for_agent / wait_for_message / wait_for_claim)",
        "default": true,
        "extensions": ["./src/index.ts"]
      },
      "panel": {
        "description": "Interactive /room TUI panel",
        "default": true,
        "extensions": ["./src/index.ts"]
      }
    },
    "settings": {
      "roomId":         { "type": "string",  "description": "Room id; defaults to the session-tree root", "default": "" },
      "maxT1PerTurn":   { "type": "number",  "description": "T1 messages injected per turn", "default": 10, "min": 1, "max": 50 },
      "maxT1Tokens":    { "type": "number",  "description": "T1 token budget per turn", "default": 2048, "min": 256, "max": 16384 },
      "coalesceCount":  { "type": "number",  "description": "Pending T2 count that triggers a digest", "default": 20, "min": 1, "max": 500 },
      "coalesceMs":     { "type": "number",  "description": "T2 lag that triggers a digest (ms)", "default": 300000, "min": 5000 },
      "postsPerWindow": { "type": "number",  "description": "Room posts allowed per 2s window (CIR)", "default": 1, "min": 1, "max": 20 },
      "burstPosts":     { "type": "number",  "description": "Token-bucket burst capacity (CBS)", "default": 10, "min": 1, "max": 100 },
      "claimTtlMs":     { "type": "number",  "description": "Default claim lease (ms)", "default": 300000, "min": 5000 },
      "logMaxRecords":  { "type": "number",  "description": "Room log retention by count", "default": 5000, "min": 100 },
      "logMaxAgeMs":    { "type": "number",  "description": "Room log retention by age (ms)", "default": 604800000, "min": 60000 },
      "panelKey":       { "type": "string",  "description": "KeyId for the panel shortcut; empty disables", "default": "" }
    }
  }
}
```

**Constraints verified:**
- There is **no `keybindings` field** and **no `skills` field** in `PluginManifest` `[F15 §Q1]`.
  Keybindings register at runtime via `registerShortcut`; skills are found by conventional
  `skills/` directory scan `[F15 §Q1]`.
- **`ExtensionAPI` has no `settings` property**, and the manifest `settings` field is
  **CLI-facing documentation/validation only** — it is read by `cli/plugin-cli.ts:898+`
  for `omp plugin validate` and `omp plugin info`, NOT by the extension at runtime.
  `getPluginSettings` is a loader function (`plugins/loader.ts:482`), not on `ExtensionAPI`.
  `lookup(id)` resolves *core* registry ids from `config/registry`, not plugin manifest settings.
  **The 11 manifest settings are unreachable from extension code.** The plugin owns
  `local://room/config.json` (read/write via the store), exposed via a `/room config` subcommand,
  with `registerFlag` for per-launch overrides and the manifest `env` field as a fallback.
  See §10 R6.
- `enabledFeatures: null` means "use `default: true` features"; project overrides win
  `[F15 §Q3]`.

### 2.3 `tsconfig.json` — P0 deliverable (M-3)

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src", "tests"]
}
```

**Why these options**: `target: ESNext` + `module: Preserve` + `moduleResolution: bundler`
match Bun's native TS support (Bun reads TS directly, no transpile step). `noEmit: true`
because Bun does the execution; `tsc` is only for typechecking. `skipLibCheck: true`
skips `.d.ts` checking (the host's types are not fully resolvable in a plugin context).
`types: ["bun"]` adds Bun's global types. `include: ["src", "tests"]` covers the
implementation and test files.

---

## 3. Room store

### 3.1 Store shape

One module-level singleton per extension module. Child sessions do not re-import the module —
`bindPreparedExtensions` re-runs the *same factory function object* with a fresh `ExtensionAPI`
`[F0 Add.2.1]`, `[F18 §4]`. So the store is shared across the whole session tree.

```ts
// src/store/room-store.ts
interface RoomStore {
  root: string;                        // absolute local:// root (§3.3)
  logPath: string;                     // <root>/room/<roomId>.jsonl
  treePath: string;                    // <root>/room/tree/ (cold tree, §3.6)
  records: RoomRecord[];               // in-memory projection, seq-ordered
  byId: Map<string, RoomRecord>;
  claims: Map<string, ClaimState>;     // resource → holder/ttl/seq
  cursors: Map<string, number>;        // agentId → last delivered seq
  members: Map<string, MemberState>;   // agentId → {joinedAtSeq, topics:Set, muted:Set}
  listeners: Set<(r: RoomRecord) => void>;
  seq: number;
  tree: TreeStore;                     // cold tree: binary summary tree over [0, N-R)
  reset(): void;                       // test seam
}

// src/store/tree-store.ts
interface TreeStore {
  // Fixed-width dense prefix per level. Block [lo,hi) at level size=hi-lo
  // lives at offset (lo/size)*TREE_REC in tree/<size>. Position IS identity.
  // TREE_REC = 288 bytes (matching OptMem). Padding costs ~2x on disk, buys O(1).
  getNode(lo: number, hi: number): string | null;      // null = not built yet
  putNode(lo: number, hi: number, summary: string): boolean;  // false = out of order
  forget(lo: number, hi: number): void;                // drop node + all ancestors
  pending(limit?: number): Array<[number, number]>;    // blocks that can be built
  cover(T: number, budget: number): Array<[number, number]>;  // tiling for a view
}
```

**Two-region design** `[R3 §1, R3 §2]`: raw tail (last R=50 messages) read verbatim by all
agents; cold tree (binary summary tree over [0, N-R)) read as a bounded view by late joiners
and on `zoom`. The tree is a rebuildable cache, never on the critical path. The raw log
stays authoritative.

**Tree invariants** `[R3 §1, R3 §6]`:
- **T1** the tree is rebuildable from the log — `forget` + rebuild from raw log.
- **T2** the raw log stays authoritative — tree files are never read for correctness.
- **T3** no agent blocked on compaction — raw tail is always readable; cold tree may have
  unbuilt nodes → `gap` + raw-log fallback.
- **T4** one node per range — `putNode` refuses unless `count == lo//size` (dense prefix).
- **T5** max spend cap — compaction calls bounded per day (default 1000). When cap hit,
  compaction pauses until next day.

**Merge shape** `[R3 §1]`: 2 inputs → 1 output. Block [lo,hi) = merge of [lo,mid) and
[mid,hi). RAW_MAX=16: blocks ≤ 16 compress from raw log; larger blocks compress from two
halves' summaries. Fixed-width nodes (TREE_REC=288) give O(1) lookup by seeking.

**Invariants** `[F18 §4 I1–I6]`:
- **I1** every mutation is synchronous — no `await` between reading and writing `claims`/`cursors`
  (the JS thread makes a sync critical section atomic).
- **I2** no session-scoped value at module scope; take `ctx` per call (5th arg of `execute`).
- **I3** key every shared structure by `ctx.agent.id`; prune in `session_shutdown`.
- **I4** timers via `ctx.setInterval` only, refcounted.
- **I5** sync append per mutation (no awaited shutdown flush).
- **I6** every `wait_for_*` promise settles (signal + timeout + `finally`).

### 3.2 Log record schema

```ts
// src/store/schema.ts
type RoomRecord =
  | { v: 1; seq: number; ts: number; kind: "msg";     id: string; from: string; topic: string;
      body: string; to?: string; mention?: string[]; replyTo?: string; threadRoot?: string;
      performative?: Performative; replyWith?: string; replyBy?: string }
  | { v: 1; seq: number; ts: number; kind: "claim";   id: string; from: string; resource: string; ttlMs: number }
  | { v: 1; seq: number; ts: number; kind: "release"; id: string; from: string; resource: string; reason: "released" | "expired" | "reclaimed" | "aborted" }
  | { v: 1; seq: number; ts: number; kind: "note";    id: string; from: string; topic: string; body: string }
  | { v: 1; seq: number; ts: number; kind: "member";  id: string; from: string; action: "join" | "leave" }
  | { v: 1; seq: number; ts: number; kind: "gap";     id: string; from: string; skipped: number; reason: "retention" | "invalid" | "corrupt" };

type Performative = "inform" | "request" | "propose" | "accept" | "reject" | "query" | "failure";
```

Envelope fields are the round-2 §C set reduced to what a v1 store needs `[R2 §C]`.
`seq` is a monotonic counter minted by the store; **the file is the durable log and `seq` is the
cursor unit** `[R2 §Components 1]`. One JSON object per line, `\n`-terminated.

### 3.3 Path resolution + atomic append

**Root resolution** — inside any tool `execute()` or event handler:

```ts
import { resolveLocalRoot, resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";

const opts = ctx.localProtocolOptions ?? {
  getArtifactsDir: () => ctx.sessionManager.getArtifactsDir(),
  getSessionId:    () => ctx.sessionManager.getSessionId(),
};
const root    = resolveLocalRoot(opts);                                  // absolute dir
const logPath = resolveLocalUrlToPath(`local://room/${roomId}.jsonl`, opts);
```

- `resolveLocalRoot(options: LocalProtocolOptions, platform = process.platform): string` —
  `src/internal-urls/local-protocol.ts:229-240`; artifacts branch = `path.resolve(artifactsDir,"local")`,
  else `path.join(os.tmpdir(),"omp-local", safeSessionId(options))` `[F18 §1]`.
- `resolveLocalUrlToPath(input, options, platform?)` — `local-protocol.ts:285-301` `[F18 §1]`.
- **Subagents share the parent's root**: `sessionLocalProtocolOptions()` pins parent options and
  `buildExecutorOptions` forwards them into `ExecutorOptions` `[F18 §1]`.
- **RISK R1** — `ctx.localProtocolOptions` is optional (`types.ts:504-505`) `[F18 §1]`; the
  `??` fallback above is mandatory. `ReadonlySessionManager` exposes both getters
  (`session-manager.ts:652-679`) `[F18 §1]`.

**Append primitive** — the omp house pattern, held `O_APPEND` fd + one sync write loop per line,
no fsync `[F18 §2]`:

```ts
// src/store/log.ts
import * as fs from "node:fs";

export function openRoomLog(path: string): number {
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  return fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND);
}

export function appendLine(fd: number, line: string): void {   // line MUST end with "\n"
  const buf = Buffer.from(line, "utf-8");
  let off = 0;
  while (off < buf.length) {
    const w = fs.writeSync(fd, buf, off, buf.length - off);
    if (w === 0) throw new Error("Short write");
    off += w;
  }
}
```

Atomicity basis: `write(2)` with `O_APPEND` performs the offset adjustment and the write as an
atomic step (man7.org, fetch 2026-10-06) `[F18 §2]`. Single-threaded JS means two sessions in one
process cannot interleave bytes inside a sync `fs.writeSync` `[F18 §2]`.
**No lock is needed in-process**; `node:fs` exposes no `flock` `[F18 §2]`.
**Scope**: this atomicity guarantee holds for single-threaded JS in a single process. A cross-process
writer can tear a multi-`write(2)` record (partial-write loop) — see RISK R19.

**Read + partial-line policy**: split on `\n`, `JSON.parse` each complete line, **skip malformed
lines and continue** (house precedent: `blob-broker/savings.ts:95-103` uses `continue` to skip
malformed lines and keep parsing) `[F18 §2]`. A torn line must not drop all later records.
Emit a `gap` record noting the skipped count.

**Record validation on replay** (S3): validate each parsed record against the `RoomRecord` schema
(§3.2) — check `v`, `kind`, and per-kind required fields. Quarantine failures with a `gap` record
`reason:"invalid"`.

**`seq` assignment** (M-2): only a **successfully parsed** record consumes a `seq`.
A skipped or malformed line does NOT consume a `seq` — the `gap` record receives the next
available `seq`. This prevents a skip from shifting later cursors: if a malformed line
consumed a `seq`, every subsequent record would have a `seq` off by one, and `read since=<cursor>`
would return wrong results. The `gap` record is a first-class record with its own `seq`.

**Per-kind required fields** (S3): validation checks these fields on replay:
| kind | required fields |
|---|---|
| `msg` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `topic`, `body` |
| `claim` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `resource`, `ttlMs` |
| `release` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `resource`, `reason` |
| `note` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `topic`, `body` |
| `member` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `action` |
| `gap` | `v`, `seq`, `ts`, `kind`, `id`, `from`, `skipped`, `reason` |
Any missing field or wrong type → quarantine with `gap{reason:"invalid"}`.

**`from` derivation** (S4): `from` is ALWAYS `ctx.agent.id` — it is never a tool parameter.
A spoofed `from` in a tool call is ignored; the store overwrites it with the authenticated caller id.

**RISK R2** — `Bun.write` is not an append API and `FileSink` has no documented append mode
`[F18 §2]`; fallback is the `node:fs` O_APPEND fd above (Bun implements `node:fs`).

**User-visible errors** (U6): missing / unwritable / corrupt room file each returns a normal tool
result `{ok:false, error}` — never a throw. Missing file → `{ok:false, error:"room file not found"}`;
unwritable → `{ok:false, error:"room file unwritable"}`; corrupt → `{ok:false, error:"room file corrupt"}`.

### 3.4 Claim arbiter

```ts
// src/store/claims.ts
interface ClaimState { resource: string; holder: string; ttlMs: number; acquiredAt: number; seq: number; }

grant(store, resource, holder, ttlMs): { ok: true; claim: ClaimState } | { ok: false; holder: string; expiresAt: number }
release(store, resource, holder, reason): boolean
reclaimIfStale(store, resource, now): ClaimState | null   // TTL expired OR holder parked/aborted
contended(store, resource): string[]                       // agents that asked and lost
```

Rules `[R2 §Components 4]`:
- **First-writer-wins** on `resource`; a grant appends a `claim` record; a loss returns the current
  holder and expiry (no record appended — a loss is not state).
- **TTL is mandatory.** Every claim carries `ttlMs` (default `settings.claimTtlMs` = 300 000 ms).
- **Staleness** = TTL expired **or** holder status ∈ `{parked, aborted}` (`AgentRef.status`
  `[F3 §AgentRef]`) **or** holder idle past `ttlMs`.
- **Reclaim is explicit and logged** — appends `release{reason:"reclaimed"}` then `claim`, and
  notifies the previous holder at **T0** `[R2 §Components 4]`. Never silent.
- Claim state is **rebuilt by replaying the log** on first open (§3.3), so it survives a process
  restart and cold revival of a parked agent `[F18 §5]`.

### 3.5 Cursors

- One monotonic cursor **per agent**, not one shared pointer `[R2 §D]`, `[F14 §2]`.
- **Advance on delivery into context**, not on send and not on read (Kafka `enable.auto.commit`
  semantics) — omp has no read receipts `[F14 §2]`.
- A joining agent starts at `logEnd - 50` (one screen); a rejoining agent resumes its stored cursor
  `[F14 §2]`.
- Persistence: the session's own cursor goes through `pi.appendEntry("chatroom:cursor", { roomId, seq })`
  so it survives resume `[F2 §State durability]`; sibling cursors live in the shared store and are
  rebuilt from the log's `member`/delivery records on cold start.
- A per-agent **lag** metric (`logEnd - cursor`) is exposed by `room{op:"board"}` `[F14 §2]`.

### 3.6 Cold tree (binary summary tree)

**Raw-tail + cold-tree split** `[R3 §1, R3 §2]`: raw tail (last R=50 messages) read verbatim by all
agents; cold tree (binary summary tree over `[0, N-R)`) read as a bounded view by late joiners
and on `zoom`. The tree is a rebuildable cache, never on the critical path. The raw log
stays authoritative.

**New adaptation** (T1): this is NOT a copy of OptMem's `cover()`. OptMem's `cover(T,budget)`
tiles `[0,T)` as ONE list of aligned power-of-two blocks with raw and compressed interleaved
(`/tmp/optmem-verify2/memo:105-131`). The raw-tail + cold-tree split is a **new adaptation**
for a multi-writer room: late joiners need a bounded view without waiting for compaction;
agents read the raw tail without blocking on tree builds. OptMem's single-list tiling assumes
a single writer; a room has concurrent posters.

**Node format:** fixed-width, `TREE_REC = 288` bytes (matching OptMem). Each record is a
one-line summary. Position IS identity: block `[lo,hi)` at level `size = hi-lo` lives at
offset `(lo/size) * TREE_REC` in `tree/<size>`. O(1) lookup by seeking. `[R3 §1]`
**TREE_REC overflow** (T3): if a summary exceeds TREE_REC bytes, OptMem `die()`s
(`memo:296-299`). Truncate the summary to TREE_REC bytes; quality degrades gracefully
(the tail of the summary is lost, but the node remains usable).

**Merge shape:** 2 inputs → 1 output. Block `[lo,hi)` = merge of `[lo,mid)` and `[mid,hi)`.
`RAW_MAX = 16`: blocks ≤ 16 compress from raw log; larger blocks compress from two halves'
summaries. `[R3 §1]`

**Boundary rule** `[R3 §2]`: raw tail = last R = 50 messages (matching §3.5 join cursor).
Cold tree covers `[0, N-R)`. The boundary is a sliding window recomputed on every read.

**Compaction** `[R3 §3]`: background job in the main session via `ctx.setInterval`. Model =
`@smol` via `streamSimple` (deep import from `@oh-my-pi/pi-ai`, not public API). Concurrency
= JOBS = 8 `[invented]` (basis: F21-W5 saturation analysis — 8 parallel compaction streams
saturate the LLM throughput without exceeding rate limits). Serialisation = ordered append +
dense-prefix CAS (copy OptMem's `tree_put`: refuses unless `count == lo//size`). The CAS
check and the write MUST be in the same synchronous section — `streamSimple` awaits between
check and write, so an explicit **write mutex** serialises them. Max spend = 1000 calls/day cap. `[R3 §3]`

**Write mutex across `await`** (T2): the mutex is a promise chain, not a lock:
```ts
let queue: Promise<void> = Promise.resolve();
function withWriteMutex<T>(criticalSection: () => Promise<T>): Promise<T> {
  const result = queue.then(criticalSection);
  queue = result.then(() => undefined, () => undefined);  // keep chain alive on error
  return result;
}
```
This protects the CAS-check-then-write sequence: `withWriteMutex(async () => {
  if (count !== lo//size) return false;       // CAS check
  const summary = await streamSimple(...);    // await inside the mutex
  writeNode(lo, hi, summary);                // write
  return true;
})`. No two compaction streams can interleave their check-and-write.

**`@smol` invocation** (minor): the compactor resolves the model via
`ctx.models.resolve("@smol")` (the model registry is on `ExtensionContext`, not a global).
It calls `streamSimple(model, context, options)` where `context` is a
`{ messages: [{ role: "user", content: prompt }] }` shape and `options` carries
`{ maxTokens: 288 }` (one TREE_REC worth of summary). The prompt is:
`"Summarize the following room messages in ≤288 bytes. Cover: who, what, decisions, open questions."`
followed by the raw records for the block. **Error policy**: retry up to 3 times
`[invented]`; if all retries fail, skip the node (leave it unbuilt) and continue
to the next pending block — do NOT pause the whole tree. A skipped node is simply
absent; readers fall back to the raw log (T3).

**Cost** `[R3 §5]`: one LLM call per block. Total blocks over N messages ≤ 2N. Free nodes
(source already fits TREE_REC) cost nothing. When compaction lags: agents read raw tail
without waiting; late joiners get `gap` + raw-log fallback. `[R3 §5]`

**Advisory nature** (S6): cold-tree summaries are ADVISORY. Agents verify against the raw log
before acting. Every tree node records its covered `[lo,hi)` seq range so the agent knows
exactly what the summary represents.

**Invalidation** `[R3 §4]`: `forget(lo, hi)` truncates every level file from `lo//size`
upward, dropping the target and all ancestors. The log is never touched. Rebuild by
re-running compaction. `[R3 §4]`

**Why v1 ships the cold tree anyway** (M-13): the cold tree costs ~400 lines, a background
job, a write mutex, and a deep import for an advisory, non-critical-path feature. A raw tail
plus `read since=` already serves late joiners. **Decision: ship it in v1.** The user asked for
it explicitly; late joiners get a bounded 96-line view instead of a `gap` record and a raw-log
scavenger hunt; and the tree is the only way to answer "what happened in the last week?" without
reading 5000 lines. The cost is contained: the tree is rebuildable (T1), never blocks readers (T3),
and the raw log stays authoritative (T2). If the compactor ever becomes a maintenance burden,
the fallback is to gate it behind a `coldTreeEnabled` flag and ship the raw-tail + `read since=`
path only — but that is a v2 decision, not a v1 blocker.

**Pruning job** (S5): a background job (interval: 60000 ms `[invented]`) enforces both
`logMaxRecords` and `logMaxAgeMs`. It caps the in-memory `records` array and appends a `gap`
record on drop. The job runs in the main session via `ctx.setInterval`.

**Invariants** `[R3 §6]`:
- **T1** the tree is rebuildable from the log.
- **T2** the raw log stays authoritative.
- **T3** no agent blocked on compaction.
- **T4** one node per range (dense prefix).
- **T5** max spend cap (1000 calls/day).

---

## 4. Tool surface

Four tools total: one op-dispatched `room` tool + three wait tools. (Four wait tools would be
wrong: three distinct intents must not hide behind one name, and `interruptible` is per-tool
`[R2 §B]`.)

### 4.0 Registration skeleton (all five tools share this)

```ts
// src/tools/room.ts
import type { ExtensionAPI, ToolDefinition } from "@oh-my-pi/pi-coding-agent";

export function registerRoomTool(pi: ExtensionAPI): void {
  const z = pi.zod;                                  // injected schema builder [F15 §Q5, hello.ts:9]
  const tool: ToolDefinition = {
    name: "room",
    label: "Room",
    description: ROOM_DESCRIPTION,                   // §8 routing rule + op docs
    parameters: z.object({ /* §4.1 */ }),
    loadMode: "essential",                           // RISK R3: discoverable tools are NOT active [F18 §5]
    approval: "read",                                // matches native wait.ts:57
    strict: true,
    async execute(toolCallId, params, signal, onUpdate, ctx) { /* … */ },
    renderCall:   renderRoomCall,                    // §7.5
    renderResult: renderRoomResult,
    describeCall: describeRoomCall,
    describeResult: describeRoomResult,
  };
  pi.registerTool(tool);
}
```

**Exact `execute` argument order is `(toolCallId, params, signal, onUpdate, ctx)`** —
`wrapper.ts:116-127` calls `definition.execute(toolCallId, params, signal, onUpdate, ctx)`
`[F19 §14]`. (`examples/extensions/hello.ts:18` names the 3rd–5th params `_onUpdate, _ctx, _signal`,
which is **misleading**; follow the wrapper. RISK R7.)

**RISK R3 — `loadMode`.** Extension tools default to `"discoverable"`, which mounts them under
the `xd://` device transport instead of the top-level tool array (`tools/xdev.ts:79-82`,
`sdk.ts:4019-4029`, `session-tools.ts:1068-1077`). `loadMode:"essential"` keeps the tool
top-level. The room and wait tools are registered `"essential"` because agents must call them
directly. If `essential` is ever refused, **fail loudly at registration** — do NOT fall back
to `pi.setActiveTools([...])` (that replaces the user's whole active set, `session-tools.ts:1734-1744`).

### 4.1 `room` — op-dispatched

```ts
z.object({
  op: z.enum(["join","read","post","claim","release","board","topics","mute","unmute","tree","zoom","recall"]),
  topic:    z.string().optional(),        // post/note/mute target
  body:     z.string().optional(),        // post
  mention:  z.array(z.string()).optional(),// post — agent ids → T0
  replyTo:  z.string().optional(),        // post — message id (thread)
  performative: z.enum(["inform","request","propose","accept","reject","query","failure"]).optional(),
  key:      z.string().optional(),        // claim/release — resource key within the topic
  ttl:      z.number().optional(),        // claim — lease ms; defaults to settings.claimTtlMs
  since:    z.number().optional(),        // read — seq cursor; defaults to the caller's cursor
  limit:    z.number().optional(),        // read — default 100, max 1000 (Zulip's cap) [F14 §5]
  lo:       z.number().optional(),        // zoom — first seq in node (exclusive range)
  hi:       z.number().optional(),        // zoom — last seq + 1 (exclusive range)
  pattern:  z.string().optional(),        // recall — regex over raw log
})
```

| op | required args | effect | returns |
|---|---|---|---|
| `join` | — | register membership, mint a cursor at `logEnd-50` | digest (§5.4) + `cursor` |
| `read` | `since?`, `limit?` | records after the cursor, bounded | `{ records, cursor, more }` |
| `post` | `topic`, `body`, `mention?`, `replyTo?`, `performative?` | append `msg`; push only on mention | `{ id, seq, tier }` |
| `claim` | `topic`, `key`, `ttl?` | grant or return holder | `{ ok, holder?, expiresAt? }` |
| `release` | `topic`, `key` | drop a claim the caller holds | `{ ok }` |
| `board` | — | current claims + roster + per-agent lag | compact view |
| `topics` | — | topic list with unread counts | `{ topics: [{topic, unread, lastSeq}] }` |
| `mute`/`unmute` | `topic?` (omit = whole room) | per-agent mute set | `{ ok }` |
| `tree` | — | show current `cover()` tiling: which nodes, which seq ranges, raw vs compressed | `[{lo, hi, size, raw, summary?}]` |
| `zoom` | `lo`, `hi` | descend into a node's two children (one level); each child raw (size 1) or summary | `[{lo, hi, size, raw, text}]` |
| `recall` | `pattern` | regex search over raw log (newest first, cap 100) | `{ matches: [{seq, record}] }` |

`resource` canonical form is `"<topic>/<key>"` — the same string `wait_for_claim` takes (§4.4).

**`read` + compressed node** (minor): when `since` lands inside a compressed (cold-tree)
node, `read` returns the node's summary text plus a `zoom` hint:
`{ records: [{ v:1, seq:<nodeLo>, kind:"note", body:"<summary>", _zoomHint:{lo,hi} }], cursor, more }`.
The agent then calls `room{op:"zoom", lo, hi}` to descend. The raw records are never
materialized by `read` — the summary is the bounded view.

**`note` and `member{action:"leave"}`** (minor): both are **system-generated only**.
The store emits `note` for gap notices and compaction events; it emits
`member{action:"leave"}` when a session shuts down. There is no `op:"note"` or
`op:"leave"` — callers cannot create these records. `member{action:"join"}` is
created by `join`.

**`to` field** (minor): the `msg` schema's `to?` field is **reserved for v2**
(directed room messages). v1 always leaves it `undefined`; `post` does not accept
it. The field exists so the schema does not need a breaking change when directed
messages land.

**`tree`'s `raw` field** (minor): the `raw` boolean in `tree`'s return is `true`
only for blocks in the **cold-tree tiling** that are ≤ RAW_MAX=16 and have not yet
been compressed. It does **not** include the raw tail (the last R=50 records) —
the raw tail is always readable via `read` and is not part of the tree. `raw:true`
means "this block's summary is the raw text, not a compression."

**`zoom` validation** (minor): `lo` and `hi` must satisfy:
- `hi - lo` is a power of two (the tree is binary),
- `lo` is aligned: `lo % (hi - lo) === 0`,
- `0 <= lo < hi <= N` (within the log).
If any check fails, return `{ ok:false, error:"invalid zoom range" }` — never throw.

**`board` return shape** (minor):
```ts
{
  claims: Array<{ resource: string; holder: string; ttlMs: number; expiresAt: number;
                  acquiredAt: number; contended: number }>;
  roster: Array<{ agentId: string; status: string; cursor: number; lag: number;
                  topics: string[] }>;
  topics: Array<{ topic: string; lastSeq: number; unread: number }>;
}
```

**`join` idempotency** (minor): calling `join` twice for the same agent is a no-op
after the first call — it returns the same digest and cursor without appending a
second `member{action:"join"}` record.

**`release` error cases** (minor):
- Caller is not the holder → `{ ok:false, error:"not holder", holder:<currentHolder> }`.
- Resource is unknown (no claim exists) → `{ ok:false, error:"unknown resource" }`.
Both return normally; neither throws.

### 4.2 `wait_for_agent`

```ts
z.object({
  agents:  z.array(z.string()),               // REQUIRED — enumerate explicitly
  timeout: z.number().optional(),            // ms; default 30000, min 1000, max 1800000
  require: z.enum(["any","all"]).optional(), // default "any"
})
```

- Blocks in-tool; **1800000 ms = omp's `WAIT_MAX_MS = 30 * 60_000`** `[wait.ts:25]`; 30000 ms default =
  Codex's `DEFAULT_WAIT_TIMEOUT_MS` `[R2 §B]`.
- `interruptible: true` — a T0 event cuts it `[R2 §B]`.
- Resolves from `AgentRegistry.global().onChange` on the matching `status_changed`/`removed` events
  `[F18 §3]`; `require:"all"` waits for every named agent to leave `running`.
- **To wait on any agent**, the caller enumerates `AgentRegistry.global().list().map(r => r.id)` explicitly.
- **Progress heartbeat** (U5): `onUpdate` fires every 500 ms `[invented]` with a `renderCall` showing
  `"Waiting for … (elapsed Ns)"`.
- **Abort** (U5): returns `{outcome:"aborted", useless:true}` and never throws.
- Result: `{ outcome: "event" | "timeout" | "aborted", agents: [{id, status, activity?}] }`.

### 4.3 `wait_for_message`

```ts
z.object({
  from:    z.string().optional(),
  mention: z.boolean().optional(),           // default false — only T0 mentions
  source:  z.enum(["room"]).optional(),      // v1 ships only source:"room" (U4)
  timeout: z.number().optional(),            // ms; default 30000, max 1800000
})
```

- Default `source:"room"` waits on the **room store's** change listener for a new `msg` record
  matching `from`/`mention`. This is the plugin's own store, so there is no double-delivery risk.
- **v1 ships only `source:"room"`** (U4). The `"irc"` mode is out of scope (§1.2).
- **Progress heartbeat** (U5): `onUpdate` fires every 500 ms `[invented]` with a `renderCall` showing
  `"Waiting for … (elapsed Ns)"`.
- **Abort** (U5): returns `{outcome:"aborted", useless:true}` and never throws.
- Result: `{ outcome: "event" | "timeout" | "aborted", message?: RoomRecord }`.

### 4.4 `wait_for_claim`

```ts
z.object({
  resource: z.string(),                      // "<topic>/<key>"
  timeout:  z.number().optional(),           // ms; default 20000, min 1000, max 300000
  ttl:      z.number().optional(),           // lease ms granted if free; default 300000
  maxWaitMs: z.number().optional(),         // optional livelock guard (S7)
})
```

- **20000 ms default = SQS's hard maximum long poll**, the largest wait any well-behaved request/reply
  primitive in the survey holds `[R2 §B]`.
- `interruptible: false` on purpose — aborting a claim wait on unrelated T2 chatter would drop the
  waiter's queue position and can livelock a hot claim `[R2 §B]`.
- **Livelock risk** (S7): a hot claim can livelock if the waiter's queue position is repeatedly
  dropped. Add optional `maxWaitMs` to bound the wait.
- Timeout is a **normal outcome, not an error** (`{ outcome: "timeout", acquired: false }`), the SQS
  empty-list / Redis nil shape `[R2 §B]`.
- Implementation: in-store condition variable; on `release`/`reclaim`/expiry, the oldest waiter for
  that resource is resolved **and granted the lease** with its `ttl` →
  `{ outcome: "event", acquired: true, claim: { resource, holder: <waiterAgentId>, ttlMs, expiresAt } }`.
  If another agent takes the resource first (race between the release and a concurrent claim),
  the waiter is **re-queued** (moved to the back of the wait queue) — it does NOT fail and does
  NOT resolve with `acquired:false`. The waiter only resolves with `acquired:false` on timeout.

### 4.5 Shared result contract

```ts
{ outcome: "event" | "timeout" | "aborted", ... }
```

Discriminate on explicit `outcome`, never on field presence `[R2 §B]`. Set
`useless: true` on both non-event paths so compaction can elide them (native `wait` sets it on
abort only — `wait.ts:164-169`) `[R2 §B]`.
**`outcome` is self-describing** (U8): the host does NOT read it — the agent discriminates on it.
The host only sees the tool result as opaque data.

---

## 5. Delivery + attention

### 5.1 Three tiers — concrete classification

| Tier | Trigger (evaluated in order) | Delivery | Wakes? |
|---|---|---|---|
| **T0 interrupt** | direct `agent://` DM to you; `@mention` of you; reply with `replyTo` = your message id; your claim revoked/contended; a task you own failed | interrupt queue; cuts an interruptible wait | yes — idle ⇒ wake, streaming ⇒ step-boundary interrupt |
| **T1 step boundary** | room post on a topic you follow; status change on a claim you hold; unaddressed reply in a thread you participated in | `deliverAs:"aside"` at the next step boundary | only if idle |
| **T2 pull only** | general chatter, presence, progress, unaddressed broadcasts | per-agent cursor only; never injected | never |

**Tier predicate is TOTAL** (N1): T1 iff you follow the topic OR you hold/held a claim on it
(within the last 1 h `[invented]`) OR you posted any message in that thread (`threadRoot`) OR
you are currently waiting on this resource (a `wait_for_claim` waiter — see M-8).
Everything unmatched defaults to **T2**.

**Ambiguous cases** (explicit rows):
| Case | Classification | Reason |
|---|---|---|
| Reply-to-reply in a thread you did not start | T1 | You posted in that thread (`threadRoot` match) |
| Topic you follow but no claim, no post | T1 | You follow the topic |
| Topic you do not follow, no claim, no post | T2 | No membership signal |
| Claim expired > 1 h ago, topic not followed | T2 | "held" is bounded by the 1 h window now in the predicate (M-1) |
| You are waiting on a resource you do not hold | T1 | Active `wait_for_claim` waiter — gets claim/release events (M-8) |

**Idle-target behavior** (N2): when the target is IDLE, both `deliverAs:"aside"` and `"steer"`
start a real turn (verified `agent-session.ts:8446+`). T1 waking an idle agent is intended;
state it rather than implying aside is step-boundary-only.

**`threadRoot` semantics** (N6): `threadRoot` is set by the store on `post` — it is the message id
of the thread's root message. A reply-to-reply inherits the root from its parent. The store sets
it, not the caller; a spoofed `threadRoot` is ignored.

Maps onto omp's existing three delivery classes: `irc-bridge.ts:222-239` interrupt/aside/mailbox;
`hasInterrupts()` cuts only T0 `[F14 §1]`, `[F0]`.

```ts
// src/attention/tiers.ts
export function classify(record: RoomRecord, viewer: MemberState): "T0" | "T1" | "T2";
```

### 5.2 Caps — the numbers

| Knob | Value | Anchor |
|---|---|---|
| T1 per turn (**K**) | **10** | `[F14 §3]`, `[R2 §D]` |
| T1 tokens per turn (**B**) | **2048** | `[F14 §3]`, `[R2 §D]` |
| T2 coalesce at **N** pending | **20** | Zulip/Slack/Mailman precedent `[F14 §5]` |
| T2 coalesce at **T** lag | **5 min** | `[F14 §5]` |
| Post rate limit (srTCM CIR) | **1 post / 2 s** | RFC 1459 §8.10; Slack 1/s/channel `[F14 §4]` |
| Burst capacity (CBS) | **10** | Slack's documented burst tolerance `[F14 §4]` |
| T0 pending interrupts | **1**, then queue-depth notice — **plugin-imposed**, NOT inherited (`IrcBridge.#interrupts` is unbounded) | `[F14 §3]` |
| Log retention | **5000 records or 7 days**, never below `min(cursor)` | Kafka `retention.ms`/`cleanup.policy`, NATS `MaxMsgs`+`MaxAge` `[F14 §6]` |
| Mailbox cap | native `MAILBOX_CAP = 100`, made **tier-aware** | `[F14 §6]`, `[F0]` |
| Cold tree raw tail (**R**) | **50 messages** | Matches §3.5 join cursor `[R3 §2]` |
| Cold tree budget (**B**) | **96 lines** | OptMem `WAKE_LINES=96` `[R3 §2]` |
| Tree node size (**TREE_REC**) | **288 bytes** | OptMem `TREE_REC=288` `[R3 §1]` |
| Compaction concurrency (**JOBS**) | **8** `[invented]` | F21-W5 saturation analysis — 8 parallel streams saturate LLM throughput `[R3 §3]` |
| Compaction max spend | **1000 calls/day** | New invariant (no prior system has one) `[R3 §3]` |

**Injection cap** — oldest-first, then one summary line:
`+N more room messages (M mention you) — read with room{op:"read", since:<cursor>}` `[F14 §3]`.
T0 is exempt from the cap but carries its own 1-pending bound `[F14 §3]`.
**Oversized message** (N7): a single message exceeding B=2048 tokens is truncated to a head +
read handle (`… truncated, read with room{op:"read", since:<seq>}`). The full body is
never lost from the log — `read since=<seq>` returns the complete record. A `local://`
handle is also returned so the agent can read the raw file if needed.

**Rate limit** — RFC 2697 srTCM, per agent, **room posts only**; T0 DMs are exempt (MQTT v5 exempts
non-PUBLISH control packets; Slack exempts event delivery from write limits) `[F14 §4]`.
**T0 rate-limit exemption is a DM flood bypass** (N5): bound T0 too (higher ceiling `[invented]`,
coalesce rather than drop; never drop T0). The ceiling is a **coalescing** threshold: when
T0 interrupts exceed the ceiling (default 50 `[invented]`), batch them into one digest
interrupt rather than dropping any. The batch is delivered as a single T0 with a summary
count. This is NOT a drop — every interrupt is eventually delivered.
Green = post; yellow = post marked burst; red = coalesce into the next digest.

**Drop policy** — drop-oldest for the log tail; **never silently below the minimum live cursor** —
when retention must pass it, append a `gap` record and notify affected agents `[F14 §6]`.
Over-quota producers get **drop-newest** (coalesce the new post) rather than evicting history `[F14 §6]`.

**Mute rules** — per-agent mute over topics and agents plus a whole-room mute; a muted topic never
wakes, never injects, and **never contributes to unread counts** — except an explicit mention, which
promotes to T0. Auto-unmute on participation (Zulip verbatim) `[F14 §7]`.

### 5.3 Delivery adapter

```ts
// src/attention/delivery.ts
export async function deliver(pi: ExtensionAPI, ctx: ExtensionContext, target: string, record: RoomRecord, tier: Tier) {
  if (tier === "T2") { bumpCursor(target, record.seq); return; }        // never injected
  const safeBody = escapeHarnessTags(sanitizeText(record.body));         // S1 + S2
  if (target === ctx.agent.id) {
    pi.sendMessage({ customType: cardTypeFor(record), content: safeBody,
                     display: true, details: record }, { deliverAs: tier === "T0" ? "steer" : "aside" });
    return;
  }
  const ref = AgentRegistry.global().get(target);
  if (!ref?.session) return;                                            // parked/aborted → skip
  await ref.session.sendCustomMessage(
    { customType: cardTypeFor(record), content: safeBody, display: true, details: record },
    { deliverAs: tier === "T0" ? "steer" : "aside" },
  );
}
```

- `AgentRef.session: AgentSession | null` — "Null exactly when parked/aborted"
  `agent-registry.ts:63-80` `[F18 §3]`; a push MUST null-check.
- `sendCustomMessage(...)` returns `Promise<boolean>`; `false` means **"no turn started", not
  "not delivered"** — verified by probe `[F18 §3]`.
- Skip `advisor` kind and `aborted` refs `[F0]`.
- Never pass `triggerTurn` for T2 — idle + `display:true` renders without starting a turn
  `types.ts:1576-1591` `[F19 §10]`.
- **T0 `steer` when idle** (N3): starts a turn, not just a wake. Same as T1 aside when idle (N2).
- **Harness-tag escaping** (S1): `escapeHarnessTags()` on the body before it reaches `sendMessage`
  and on each rendered line. Native precedent: `src/session/irc-bridge.ts:189`,
  `src/session/harness-tags.ts:14-16`.
- **ANSI sanitisation** (S2): `sanitizeText()` from `@oh-my-pi/pi-utils` (`sanitize-text.ts:23-38`)
  on every rendered line.

### 5.4 Join digest (bounded)

```ts
// src/onboarding/digest.ts
export function buildDigest(store: RoomStore, viewer: MemberState, budgetTokens = 800): string;
```

Content order `[R2 §Components 7]`, `[F8]`:
1. Room identity — id, member count, uptime.
2. Roster — live members from `AgentRegistry.global().list()` with status (cap 32, mirroring the
   native `DEFAULT_PEER_ROSTER_LIMIT = 32` `[F3]`).
3. Open claims — resource, holder, remaining TTL (top 10).
4. Bounded backlog — two-region view `[R3 §2]`: raw tail (last R=50 records, T0/T1 first) + cold tree tiled at B=96 lines. If a cold node is unbuilt, show `gap` + raw-log fallback.
5. Your cursor + lag.
6. The routing rule block (§8).
7. Config — the active caps so the agent knows the budget.

Hard cap: **800 tokens** for the digest (native anchors: `memory.summaryInjectionTokenLimit = 5000`
and the 32-peer roster cap `[R2 §D]`).

**Digest truncation order** (U8): if the digest exceeds the budget, truncate in this order:
1. Cold-tree backlog (drop oldest nodes first)
2. Raw-tail backlog (drop oldest records first)
3. Open claims (drop lowest-TTL first)
4. Roster (drop idle agents first)
Never truncate the routing rule block or the cursor/lag line.

**Room op cheat-sheet** (U8):
| Op | Use when |
|---|---|
| `join` | First call — mints a cursor at `logEnd-50` |
| `read` | Pull records after your cursor |
| `post` | Send a message to a topic |
| `claim` | Take exclusive ownership of a resource |
| `release` | Drop a claim you hold |
| `board` | See current claims + roster + lag |
| `topics` | List topics with unread counts |
| `mute`/`unmute` | Suppress a topic or agent |
| `tree` | See the cold-tree tiling |
| `zoom` | Descend into a tree node |
| `recall` | Regex search over the raw log |

---

## 6. Panel UI

### 6.1 Open path

`ctx.ui.custom()` **blocks until `done(result)`** — the controller builds
`Promise.withResolvers<T>()` and resolves only from `close(result)`
`types.ts:312-321`, `extension-ui-controller.ts:1135-1204` `[F16 §9]`.

**Therefore the panel is opened from a slash command**, whose handler is a natural long-lived frame
with no 30 s budget `[F16 §9]`:

```ts
// src/commands/room-command.ts
pi.registerCommand("room", {
  description: "Open the agent chatroom panel, or run a room subcommand",
  getArgumentCompletions: prefix => /* ["board","join","leave","mute"] filtered */ null,
  async handler(args, ctx) {
    const sub = args.trim();
    if (sub === "" || sub === "board") {
      if (!ctx.hasUI || ctx.mode !== "tui") return;              // §6.8
      await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
        const panel = new RoomPanel(/* … */);
        pi.on("session_shutdown", () => done());   // I1: no signal on ExtensionContext; abort via session_shutdown
        return panel;
      }, {
        overlay: true,
        overlayOptions: { fullscreen: true, anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: 0 },
        onHandle: h => { /* keep handle for hide() */ },
      });
      return;
    }
    // join / leave / mute → call the room ops directly, then ctx.ui.notify(...)
  },
});
```

- Secondary route: `registerFlag("room-panel-key", {type:"string"})` + `registerShortcut(key, …)`.
  **RISK R4** — `ctrl+s` is unwinnable (see §10). Default the flag to `""` (disabled).
- `registerCommand` handler signature: `(args: string, ctx: ExtensionCommandContext) => Promise<void>|void`;
  args are the **raw** remainder string, not parsed `[F17 §4]`.

### 6.2 Component tree — Layout A (recommended)

```
RoomPanel implements Component            // only render(width) is required [F16 §1]
└─ Stack                                  // components/layout/stack.ts:76
   ├─ frameTop     : PanelRows (1)        // topBorderSplit(width, "Room #<id>", chatWidth)
   ├─ SplitPane    : grow                 // components/layout/split-pane.ts:80
   │   ├─ left  (ratio .62, min 40) : ChatPane   (LayoutRenderer → string[])
   │   └─ right (rightMinWidth 30)  : BoardPane  (LayoutRenderer → string[])
   ├─ frameDivider : PanelRows (1)        // dividerSplit(width, chatWidth)
   ├─ frameFooter  : PanelRows (1)        // hint row
   └─ frameBottom  : PanelRows (1)        // bottomBorder(width)
```

Options used: `leftSize:{ratio:.62,min:40}`, `rightMinWidth:30`, `splitAt:88`, `narrowPane:"left"`
`[F16 §3, §4]`. Below `splitAt` (88 cols here) `SplitPane` drops to single-pane mode and
`setNarrowPane()` selects which side is shown.

**Narrow-terminal fallback** (mirrors `agent-hub.ts:1762-1790,2374-2440`): when
`split.mode !== "split"`, `Tab` toggles `narrowOpen` and calls
`split.setNarrowPane(narrowOpen ? "right" : "left")`; the title gains the selected context; `Esc`
unwinds filter → narrow → close `[F16 §3]`.

**Imports for the panel** (all verified to resolve, 2026-10-06). Root exports from
`@oh-my-pi/pi-tui`: `Stack`, `SplitPane`, `ScrollView`, `Table`, `Box`, `Text`, `Markdown`,
`Spacer`, `Input`, `Editor`, `TabBar`, `SelectList`, `KeyValueList`, `Ellipsis`,
`truncateToWidth`, `visibleWidth`, `isFocusable`, the `theme` live singleton, the `Theme` type.
Subpath imports: `PanelRows`, `topBorderSplit`, `dividerSplit`, `bottomBorder`, `row`,
`OverlayPanel` from `@oh-my-pi/pi-tui/chrome/overlay-box`; `renderTableRow` from
`@oh-my-pi/pi-tui/components/table`; `getMarkdownTheme`, `getEditorTheme`, `getSelectListTheme`
from `@oh-my-pi/pi-tui/theme/tui-adapters`.

**Alternatives considered** `[F16 §4]`: Layout B (3-pane via `HubFrame`) costs ~50 chat columns at
100 cols; Layout C (TabBar chat|board|roster) loses at-a-glance simultaneity but is the narrow mode.

**Perf rule**: render only the visible window with plain styled string rows + a `hitRows` map; do
**not** build one component per message `[F16 §5]`, `[F16 R11]`.

### 6.3 Chat pane

Row: `[unread][tier badge][time] author › topic · body(first line)`, continuation indented
(precedent: `#formatActivityRow`, `agent-hub.ts:1745-1761`) `[F16 §5]`.

- time → `theme.fg("dim", …)`; author → `theme.bold(agent)`; separator → `theme.sep.dot`.
- **Tier badge**: `theme.status.error` T0, `theme.status.warning` T1, `theme.status.info`/muted T2
  (`theme-class.ts:485-500`) `[F16 §5]`.
- **Mention**: `theme.fg("accent", …)` + bold, plus a `theme.nav.cursor`-style marker in the gutter.
- **Thread indent**: `theme.tree.vertical` / `branch` / `last` glyphs.
- **Scrolling**: `ScrollView` with `followTail:true`; `setFollowTail` driven by
  `getScrollOffset() >= getMaxScrollOffset()` (`scroll-view.ts:134-160`, `transcript-browser.ts:233-254`).
Long/rich body: `Markdown` only for the selected row (materialize lazily) `[F16 §5]`.
**ANSI sanitisation** (S2): apply `sanitizeText()` from `@oh-my-pi/pi-utils` (`sanitize-text.ts:23-38`)
to every rendered line in the chat-pane projection.

### 6.4 Board pane

- `resource · holder · TTL/expiry · state`; use `renderTableRow(cells, columns, maxWidth?, options?)`
  composed into a manual window (the `Table` class has 0 in-tree callers) `[F16 §6]`.
- `TableColumn { width, align, overflow:"truncate", priority }` so the holder column shrinks before
  the resource column `[F16 §6]`.
- TTL colour escalates: `theme.fg("warning", …)` under 25% remaining, `error` when expired
  `[F16 §6]`.
- Contended rows: contended glyph + `theme.status.warning` + `+N waiting`.
- Expired/released rows move to the bottom dimmed rather than vanishing mid-frame.
- The pane is a **pure projection** `#projectClaims(rows) → string[]` — unit-testable without a TUI.

### 6.5 Roster

- Source: `AgentRegistry.global().list()`; fields already available in `AgentRecordLike`
  (`agent-hub-types.ts:35-59`) `[F16 §7]`.
- Reuse `statusGlyph`/`statusText`/`statusDot` from `agent-hub-renderer.ts:64-100`.
- What the room **adds**: room cursor position, subscribed topics, unread count.
- Layout A renders this as a **one-line presence strip** in the frame header:
  `● 3 running · ○ 2 idle · ⏸ 1 parked` using `#statusCounts` (`agent-hub.ts:363-365`) `[F16 §7]`.

### 6.6 Key map

| Key | Action |
|---|---|
| `Esc` | unwind: clear filter → close narrow → close panel (`done()`) |
| `Tab` | toggle narrow pane (only when `split.mode !== "split"`) |
| `j` / `↓`, `k` / `↑` | move selection |
| `g` / `G` | top / bottom |
| `Enter` | open detail for the selected row |
| `o` | jump to the selected agent (`focusAgent`) |
| `r` | release the selected claim |
| `p` | open the composer (§6.7) |
| `/` | filter |
| `1` / `2` | chat / board focus |

Handled entirely in `handleInput(data)` — **extension shortcuts are dead while an overlay has
focus** `[F16 R3]`, `[F17 §2]`.

### 6.7 Input model

**Read-only panel with actions, plus a composer only when the human presses `p`** `[F16 §8]`:
Agent Hub's table is actions-only and only its nested transcript viewer owns an `Editor`
(`agent-hub.ts:2374-2471`, `agent-transcript-viewer.ts:210-230`) `[F16 §8]`.

Composer: `new Editor(getEditorTheme())` + `setMaxHeight(4)` + `onSubmit`; rule copied from the
transcript viewer — **"once the reader starts typing, the editor owns every key"** (check
`editorEmpty` before consuming scroll keys) `[F16 §8]`. Posting goes through the room store, not a
new message path.

### 6.8 Lifecycle + live refresh

- **Mount**: `ctx.ui.custom(factory, {overlay:true, overlayOptions:{fullscreen:true, …}})`; the
  controller forwards `overlayOptions` verbatim and calls `onHandle(handle)`
  `[F16 §9]`. `showOverlay` sets focus automatically and returns
  `OverlayHandle { hide(); setHidden(hidden); isHidden() }` (`tui.ts:1217-1266`).
- **Refresh**: three sources, matching agent-hub — (1) `registry.onChange` + the room store's
  module-level listener set, coalesced through a debounce; (2) a slow unref'd `ctx.setInterval`
  for relative-age text; (3) `requestRender()` after any local mutation
  (`agent-hub.ts:496-504,1499-1511`) `[F16 §9]`. `requestRender(force?, options?)` is coalesced via
  `#renderRequested`; `requestComponentRender(component)` is the scoped variant
  (`tui.ts:2525-2572`).
- **Close**: `Esc` → `done(result)` → controller calls `component.dispose?.()`, hides the overlay,
  restores the editor, refocuses it, resolves the promise
  (`extension-ui-controller.ts:1144-1155,1198-1204`) `[F16 §9]`.
- **Disposal is explicit**: `showOverlay().hide()` and `TUI.stop()` never call `dispose()`
  `[F16 §9]`; make `dispose()` idempotent and clear timers + unsubscribe there.
- **Mode fallback**: `custom` is unsupported in RPC (returns `undefined as never`) and a no-op
  without a UI context `[F16 §11]`. Guard with `if (!ctx.hasUI || ctx.mode !== "tui") return;`.
  **RISK R5** — `hasUI === true` does not guarantee `custom` works `[F16 §11]`; wrap in try/catch and
  fall back to `ctx.ui.notify("Room panel needs the TUI")`.

### 6.9 Theme + mouse

- The factory's 2nd arg is `theme: Theme`; the live singleton is exported as `theme` and is
  re-exported from `pi-tui` root — **read the live binding inside `render()`**, never retain it
  `[F16 §10]`.
- Use chrome tokens (`theme.boxRound.*`, `theme.sep.dot`, `theme.nav.cursor`, `theme.status.*`,
  `theme.tree.*`), not raw colours `[F16 §10]`.
- Never exceed `width`; measure with `visibleWidth()`, truncate with `truncateToWidth()`, sanitize
  with `replaceTabs()` `[F16 §10]`.
- **Mouse is off** for a default overlay; enable with `overlayOptions:{fullscreen:true}` and route
  with `routeSgrMouseInput` + `SplitPane.locate(line,col)` `[F16 §10]`, `[F16 R4]`.

---

## 7. Inline transcript rendering

### 7.1 Why

The room's traffic must also render in the main scrollback, the way native IRC cards do
(`irc:incoming`, `irc:relay`) — otherwise the human sees raw text and the room reads as noise.

### 7.2 Renderer registration

```ts
registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
// types.ts:1559; loader.ts:269-271 [F19 §1]

export type MessageRenderer<T = unknown> = (
  message: CustomMessage<T>,
  options: MessageRenderOptions,      // { expanded: boolean }
  theme: Theme,
) => Component | undefined;
// pi-tui/src/chat/extension-types.ts:11-19 [F19 §2-3]
```

Invocation conditions `[F19 §5]`:
1. `message.display === true` — otherwise skipped entirely (`chat-transcript-builder.ts:564`).
2. `role` is `"custom"` or `"hookMessage"`.
3. The `customType` does **not** match a built-in (built-ins are dispatched first, so `room:*` cannot
   collide with `irc:*`/`advisor`/`async-result`) `[F19 §5]`.
4. `getMessageRenderer(customType)` returns the registered renderer (`runner.ts:1280-1288`).

Expand/collapse: ctrl+o → `ChatTranscriptBuilder.setExpanded()` → each tracked component's
`setExpanded()` → `FramedMessageComponent.#rebuild()` re-invokes the renderer with the new
`expanded` value (`message-frame.ts:77-81,139-150`; `chat-transcript-builder.ts:143-146`) `[F19 §6]`.

Failure is safe: a throwing renderer is caught and the default card is used; returning `undefined`
falls back to the default card (type tag + markdown body) `[F19 §7]`.

### 7.3 Card set

| customType | Collapsed | Expanded |
|---|---|---|
| `room:message` | `✉ room ⟵ author · 2m ago` + 3 quote-bordered lines | 12 lines, full body, reply indicator |
| `room:mention` | `✉ room ⟵ author ➤ me · reply · 2m ago` + 3 lines | full body + parent ref |
| `room:claim` | `⚑ room claim: agent-1 → src/auth.ts · 4m left` | full claim detail + queue |
| `room:board-delta` | `▦ room board: +2 claims, −1 released` | per-claim delta table |

### 7.4 Card anatomy (match the native IRC bar)

Native card = `createIrcMessageCard` (`pi-tui/src/tools/wait.ts:519-580`) `[F19 §8]`:

```
✉ IRC ⟵ alice · reply · 2m ago     ← renderStatusLine: icon + title + dim dot-separated meta
  ▏ body line 1                    ← quote border (md.quoteBorder) + 2-space indent + toolOutput tone
  ▏ … +5 more lines                ← collapsed indicator (3 collapsed, 12 expanded, 100-col cap)
```

**Helper availability — verified.** Only some of the native card's internals are reachable:

| Helper | Status | Import |
|---|---|---|
| `renderStatusLine(options, theme)` | **exported** | `@oh-my-pi/pi-tui/render/status-line` (re-exported by `render/index.ts`) |
| `createCachedComponent(getExpanded, render, {paddingX})` | **exported** | `@oh-my-pi/pi-tui/render/render-utils` |
| `truncateToWidth(text, width, Ellipsis)` | **exported** | `@oh-my-pi/pi-tui` (root) |
| `Ellipsis` | **exported** | `@oh-my-pi/pi-tui` (root; re-exported from `@oh-my-pi/pi-natives`) |
| `PanelRows`, `topBorderSplit`, `dividerSplit`, `bottomBorder`, `row` | **exported** | `@oh-my-pi/pi-tui/chrome/overlay-box` |
| `bodyLines`, `ircGlyph`, `messageAge`, `BODY_LINES_*` | **NOT exported** — module-private in `tools/wait.ts` | reimplement (~20 lines) |
| `formatAge` | **exported** | `@oh-my-pi/pi-utils` |
| `cardNode`/`span`/`md`/`row`/`elapsed`/`compact` (TSP describe) | **exported** | `@oh-my-pi/pi-tui` root (`native/describe.ts` re-export) |

**RISK R21** — the native IRC card's body helper is private. The room ships its own
`src/cards/body-lines.ts` reproducing the documented behaviour: quote border
`theme.fg("dim", theme.md.quoteBorder)`, 2-space indent, `replaceTabs()`, 100-char line cap,
3 collapsed / 12 expanded lines, and a dim `… +N more line(s)` tail `[F19 §8]`.

```ts
// src/cards/body-lines.ts   (local copy; the native one is not exported)
export function bodyLines(body: string, expanded: boolean, theme: Theme,
                          opts: { indent: string; collapsedLines: number }): string[] {
  const cap = expanded ? 12 : opts.collapsedLines;
  const quote = theme.fg("dim", theme.md.quoteBorder);
  const all = body.replace(/\r/g, "").split("\n").map(l => `${opts.indent}${quote} ${theme.fg("toolOutput", escapeHarnessTags(sanitizeText(replaceTabs(l))).slice(0, 100))}`);   // S1 + S2
  if (all.length <= cap) return all;
  return [...all.slice(0, cap), `${opts.indent}${quote} ${theme.fg("dim", `… +${all.length - cap} more lines`)}`];
}
```

```ts
// src/cards/message-cards.ts
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import { Ellipsis, truncateToWidth } from "@oh-my-pi/pi-tui";
import { formatAge } from "@oh-my-pi/pi-utils";

pi.registerMessageRenderer("room:message", (message, options, theme) => {
  const d = message.details as Extract<RoomRecord, { kind: "msg" }>;
  const title = `room ${theme.nav.back} ${d.from}`;
  const meta = [d.replyTo ? "reply" : null,
                formatAge(Math.max(1, Math.round((Date.now() - message.timestamp) / 1000)))]
               .filter((x): x is string => !!x);
  return createCachedComponent(options.expanded, (width, expanded) => {
    const lines = [renderStatusLine(
      { iconOverride: theme.styledSymbol("tool.irc", "accent"), title, meta }, theme)];
    if (d.body.trim()) lines.push(...bodyLines(d.body, expanded, theme, { indent: "  ", collapsedLines: 3 }));
    return lines.map(l => truncateToWidth(l, width, Ellipsis.Unicode));
  }, { paddingX: 1 });
});
```

### 7.5 Delivery + persistence

- **Emit into the calling session's transcript**: `pi.sendMessage({customType, content, display:true,
  details, attribution:"agent"})` `[F19 §10]`.
- **Emit into a sibling's transcript**: `ref.session.sendCustomMessage({customType, content,
  display:true, details}, {deliverAs})` `[F19 §10]`, `[F18 §3]`.
- **Persistence**: both `display:true` and `display:false` entries persist as
  `CustomMessageEntry { type:"custom_message", customType, content, details, display, attribution }`
  in the session JSONL and survive resume; on resume `customMessageEntryMessage()` restores them with
  the original `display` value `[F19 §11-12]`.
- `appendEntry` writes a `type:"custom"` entry that is **not** rendered and **not** sent to the LLM —
  use it for cursor/state persistence only `[F19 §10]`.

### 7.6 No-UI fallback

The renderer is registered in every mode (extensions load in print/RPC/ACP) but **never invoked**
without a `FramedMessageComponent`; custom messages degrade to `customOneLiner()`
(`session-history-format.ts:407-441`) or JSON events `[F19 §13]`. Add `room:*` cases to the room's own
tool `description` so a headless reader still sees structured text; the plugin cannot extend
`customOneLiner` `[F19 §13]`.

### 7.7 Tool cards for `room` and the wait tools

```ts
renderCall?:   (args, options: ToolRenderResultOptions, theme) => Component;      // types.ts:725
renderResult?: (result, options, theme, args?) => Component;                      // types.ts:728-733
describeCall?: (args, options) => NativeToolView | undefined;                     // types.ts:736
describeResult?: (result, options, args?) => NativeToolView | undefined;          // types.ts:739-743
```

`ToolRenderResultOptions = { expanded, isPartial, spinnerFrame? }` (`types.ts:638-646`); at runtime
the TUI's superset `RenderResultOptions` is passed, so `argsComplete`/`executionStarted` are also
available `[F19 §14]`. `describeCall`/`describeResult` are the native (TSP) counterparts — implement
them so the tool cards look native in both renderers `[F19 §14]`, `[F16 §11]`.

---

## 8. Routing rule (the prompt block)

Shipped as `src/onboarding/routing-rule.md`, imported with `with { type: "text" }` and appended by
the `before_agent_start` hook after the digest. Ordered — **first match wins** `[R2 §A]`:

```markdown
## Room vs direct message — routing rule

Use `agent://<id>` (peer message) when:
1. Exactly one agent is the intended recipient.
2. Several recipients must NOT see each other's responses — send separate `agent://` messages.
3. The message must interrupt a specific running agent (a parent's message hard-steers; a room
   mention does not).
4. It is a direct command, correction, or steering instruction for one agent.
5. Broadcasting it would amplify an error (corrections, unverified claims).

Use the room (`room{op:"post"}`) when:
6. Several recipients must see the message AND each other's responses.
7. It is a coordination artifact — a claim, release, shared finding, status, or async non-urgent update.
8. It is a question that wants cross-critique or diverse input.

When in doubt, use the room.

Corrections:
- A correction for a RUNNING agent goes to `agent://<id>` — a room mention does not hard-steer
  a streaming agent.
- A directed correction inside a multi-recipient collaboration goes to `agent://<id>` — the
  room is for shared context, not private redirection.

Asymmetry to remember: an interrupt *intent* is not an interrupt *strength*. A parent `agent://`
message hard-steers a running agent. A room mention is T0 — it wakes an idle agent and cuts an
interruptible wait — but it does NOT hard-steer a streaming one. Put a correction in the room and
the running agent may keep working on the wrong thing until its next step boundary.

Before starting work that another agent might also start, claim it:
`room{op:"claim", topic, key, ttl}`. Release it when done: `room{op:"release", topic, key}`.
Never assume a claim you did not take. A claim you hold past its TTL is reclaimable, and the
reclaimer will be told — and so will you.

If you have nothing to do but wait for a peer, a claim, or a room message, BLOCK — do not poll:
`wait_for_agent`, `wait_for_message`, `wait_for_claim`. All are bounded and return an explicit
`outcome`.
```

---

## 9. Ordered phases

Each phase ends with an acceptance check that a later implementer runs before moving on.

### P0 — Scaffolding, manifest, store core
**Files**: `package.json`, `tsconfig.json`, `src/index.ts`, `src/store/{schema,log,room-store,cursors}.ts`, `tests/store.test.ts`.
**Work**: manifest §2.2; `tsconfig.json` §2.3; `openRoomLog`/`appendLine` §3.3; record schema §3.2; replay → in-memory projection; cursor map.
**Accept**: `bun test tests/store.test.ts` green —
(a) 3 interleaved writers × 200 lines on one fd produce 600 parseable lines with zero torn lines;
(b) `readSince(seq)` returns exactly the records after `seq`; (c) replay reconstructs `cursors` and `seq`;
(d) `resolveLocalUrlToPath("local://room/r.jsonl", opts)` points inside `resolveLocalRoot(opts)`.

### P1 — `room` tool + claim arbiter
**Files**: `src/tools/room.ts`, `src/store/claims.ts`, `src/ids.ts`.
**Work**: §4.1 ops; §3.4 arbiter; `loadMode:"essential"`.
**Accept**: direct `session.getToolByName("room")!.execute(...)` calls —
`claim(a,res)` grants; `claim(b,res)` returns `{ok:false, holder:a}`; `release(a,res)` then `claim(b,res)` grants;
an expired-TTL claim is reclaimable and appends `release{reason:"reclaimed"}`; `board` shows holder+expiry;
the JSONL contains exactly the expected `claim`/`release` lines.

### P1b — Cold tree (binary summary tree)
**Files**: `src/store/tree-store.ts`, `src/store/compactor.ts`, `tests/tree.test.ts`.
**Work**: §3.6 tree store; `cover()` tiling; `getNode`/`putNode`/`forget`/`pending`; compactor job (`ctx.setInterval` + `streamSimple` with `@smol`); `room{op:"tree"}`, `room{op:"zoom"}`, `room{op:"recall"}` ops.
**Accept**: `bun test tests/tree.test.ts` green —
(a) `cover(1000, 96)` returns ≤ 96 blocks tiling `[0,1000)` with no gap or overlap;
(b) `putNode` refuses out-of-order write (`count != lo//size` → `false`);
(c) `forget(lo, hi)` truncates all level files from `lo//size` upward, log untouched;
(d) `zoom(lo, hi)` returns two children (raw if size 1, summary otherwise);
(e) compactor builds a pending node via `streamSimple` with `@smol` (mock the stream, assert called);
(f) max spend cap: after 1000 calls, compactor pauses.

### P2 — Wait tools
**Files**: `src/tools/wait-for-{agent,message,claim}.ts`.
**Work**: §4.2–4.4; `interruptible` declared at runtime (RISK R9); `outcome` discrimination; `useless` on non-event paths.
**Accept**: in two sessions — B's `wait_for_claim` starts first and resolves **only after** A claims;
`wait_for_message` resolves on A's `post` with `mention:true`; each tool returns `outcome:"timeout"`
(not an error) when nothing happens inside a 1 s test timeout; aborting the session rejects cleanly
and the promise settles.

### P3 — Attention governor
**Files**: `src/attention/{tiers,governor,delivery}.ts`, `tests/attention.test.ts`.
**Work**: §5.1 classification; §5.2 caps; srTCM; coalesce; mute; gap records.
**Accept**: `classify()` table test for all 12 trigger cases; 25 T2 records produce exactly one digest
line; 11 T1 records inject 10 + one summary line; the token bucket emits green/yellow/red in order;
a muted topic produces zero unread; a forced retention pass appends one `gap` record and notifies.

### P4 — Onboarding
**Files**: `src/onboarding/{digest,routing-rule.md,hook}.ts`.
**Work**: §5.4 digest; §8 prompt block; `before_agent_start` append; `session_shutdown` prune.
**Accept**: a spawned subagent's effective prompt contains the digest + the routing rule; the digest is
≤ 800 tokens (assert by counting); the hook is idempotent per agent (a second `before_agent_start` for
the same agent does not duplicate); `session_shutdown` completes well inside the 2 s budget.

### P5 — Panel
**Files**: `src/panel/*.ts`, `src/commands/room-command.ts`.
**Work**: §6.2–6.9.
**Accept**: `/room` opens a fullscreen overlay; `Esc` closes and the promise resolves; a new room post
appears without a keypress (live refresh); at 80 cols `Tab` toggles chat↔board; `p` opens the composer
and typing does not move the selection; `dispose()` is idempotent (call twice, no throw).

### P6 — Inline cards + tool cards
**Files**: `src/cards/{message-cards,tool-cards}.ts`.
**Work**: §7.2–7.7.
**Accept**: a `room:message` card renders with the IRC-card shape; ctrl+o re-invokes the renderer with
`expanded:true` and shows more lines; the card survives a session resume; a deliberately throwing
renderer falls back to the default card without hiding the message; `room`/wait tool cards render via
both `renderCall/renderResult` and `describeCall/describeResult`.

### P7 — Packaging polish
**Files**: `skills/omp-agent-chatroom/SKILL.md`, README, `src/index.ts` feature gating.
**Work**: `omp plugin link` instructions; feature flags; settings surface; `registerFlag("room-panel-key")`.
**Accept**: `omp plugin link .` creates the symlink at `~/.omp/plugins/node_modules/omp-agent-chatroom`
and a new session loads the extension; disabling the `panel` feature removes the panel but keeps the room tool.

### P8 — Integration + docs
**Files**: `tests/e2e-room.test.ts`, README.
**Work**: §11 harness; document the caps, the routing rule, and every RISK/fallback from §10.
**Accept**: the §11 test is green end-to-end.

---

## 10. Risks + fallbacks

| # | Risk | Evidence | Fallback |
|---|---|---|---|
| **R1** | `ctx.localProtocolOptions` may be `undefined` | `types.ts:504-505`, `internal-urls/context.ts:33-36` `[F18 §1]` | Derive from `ctx.sessionManager.getArtifactsDir()/getSessionId()` (§3.3) |
| **R2** | Deep subpath imports (`/internal-urls/local-protocol`, `/registry/agent-registry`, `/irc/bus`, `/utils/event-bus`) are not public API | `package.json` `"./*"`; probe-verified resolving; a `src/`-prefixed specifier does NOT resolve `[F18 §3]` | Prefer `pi.pi` (the whole root namespace) for everything it exports; only `local-protocol`, `EventBus` and `IrcBus` genuinely need a subpath. Pin the host version; add a smoke test that imports each specifier |
| **R3** | `loadMode:"discoverable"` (the extension default) mounts the tool under `xd://` instead of top-level | `tools/xdev.ts:79-82`, `sdk.ts:4019-4029`, `session-tools.ts:1068-1077` `[F18 §5]` | Register `"essential"`; if refused, fail loudly at registration — do NOT fall back to `setActiveTools` (replaces user's whole set) |
| **R4** | `ctrl+s` is unwinnable — the built-in `app.session.observe` handler overwrites the extension handler (last `Map.set` wins, no layering) | executed simulation `[F17 §1]` | Use a non-reserved key; default `panelKey:""`; document that the user must clear `app.session.observe` in `keybindings.yml` for a `ctrl+s` binding |
| **R5** | `ctx.ui.custom` is unsupported in RPC and a no-op without a UI context; `hasUI===true` does not guarantee it works | `extension-ui-controller.ts`, `omp://extensions.md` `[F16 §11]` | Guard `if (!ctx.hasUI \|\| ctx.mode !== "tui") return;` + try/catch → `ctx.ui.notify` |
| **R6** | `ExtensionAPI` has no `settings` property; manifest `settings` is CLI-facing only | `types.ts:1357-1696` has no `settings`; `PluginManifest.settings` is read only by `cli/plugin-cli.ts:898+`; `getPluginSettings` is a loader function (`plugins/loader.ts:482`), not on `ExtensionAPI`; `lookup(id)` resolves *core* registry ids, not plugin settings | Plugin owns `local://room/config.json` (read/write via the store), exposed via a `/room config` subcommand, with `registerFlag` for per-launch overrides and the manifest `env` field as a fallback |
| **R7** | `hello.ts` names the `execute` params `(_onUpdate, _ctx, _signal)`, which contradicts the wrapper | `hello.ts:18` vs `wrapper.ts:116-127` `[F19 §14]` | Follow the wrapper: `(toolCallId, params, signal, onUpdate, ctx)` |
| **R8** | `IrcBus.wait` consumes the message (never reaches the inbox) and resolves the OLDEST waiter | `bus.ts:155-163,296-304` `[F0]`, `[F18 §3]` | v1 ships only `source:"room"`; `"irc"` is out of scope (§1.2) |
| **R9** | `interruptible` is not in the typed `ToolDefinition` | `types.ts:669-744` has no `interruptible`; the loop reads `tool?.interruptible`; `applyToolProxy` copies own keys `[F18 §5]`, `[F0]` | Declare it on the object literal and cast; **do not rely on it for correctness** — every wait tool also observes `signal` directly and bounds its own timeout |
| **R10** | Module-level singleton leaks across tests / across independent top-level sessions | `[F18 §5]` | `reset()` seam + key the store by the `local://` root; a store per root, not a bare global |
| **R11** | A session's `session_shutdown` clears that runner's timers — a room tick scheduled on a subagent dies when it finishes | probe: managed interval froze after `dispose()` `[F18 §4 d]` | Refcount background work per live session; clear only at zero; or run the tick from the main session only |
| **R12** | `session_shutdown` handlers have a **2 s** budget, run concurrently, and are abandoned after a macrotask of grace | `SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS = 2_000` `[F18 §4]` | All room mutations are synchronous (I1/I5), so shutdown only unsubscribes + clears timers — no flush |
| **R13** | A late-loaded plugin has no shortcut wiring until the editor is rebuilt | `setupKeyHandlers()` runs only at init and after `setEditorComponent` `[F17 §2]` | Slash command is the primary route; treat the key as best-effort |
| **R14** | Extension shortcuts are unreachable while an overlay or a draft editor holds focus | `[F16 R3]`, `[F17 §2]` | All panel keys live in `handleInput`; `ctx.ui.onTerminalInput` is the only true global hook |
| **R15** | No hot-reload of extension code within a session | `[F15 §Q2]` | Edit → start a new session (or switch/resume) to clear `enabledPluginsCache`; use `getToolByName().execute()` in tests for a fast loop |
| **R16** | Per-frame component churn in the panel | `[F16 R11]` | Windowed plain-string rows + `hitRows`; materialize `Markdown` only for the selected row |
| **R17** | Restricted / plan-mode children never receive extension tools | `[F2 §Restricted]`, `[F0]` | Room tool is unavailable there by design; the digest says "not a member"; do not design around it |
| **R18** | No plugin API to register a keybinding *action* (compile-time declaration merge only) | `[F17 §3]` | Raw `registerShortcut` on a non-reserved key; accept no user remapping / no `/hotkeys` integration |
| **R19** | A second **process** writing the same room log breaks the in-process atomicity assumption | `[F18 §2]` | Room is in-process by scope; if ever needed, wrap appends in `@oh-my-pi/pi-utils/file-lock` (`withFileLockSync`) or tolerate torn lines |
| **R20** | `registerMessageRenderer` never runs without a UI, so renderer side effects are lost | `[F19 §13]` | Keep renderers pure; put all state mutation in the tool/command path |
| **R21** | The native IRC card's body helper (`bodyLines`), glyph (`ircGlyph`) and age (`messageAge`) are **module-private** in `pi-tui/src/tools/wait.ts:474,478,487` | verified by export grep 2026-10-06 | Ship `src/cards/body-lines.ts` reproducing the documented behaviour (§7.4); use the exported `formatAge` from `@oh-my-pi/pi-utils` for age |
| **R22** | `pi-tui` and `pi-coding-agent` subpath imports (`/chrome/overlay-box`, `/render/render-utils`, `/tools/wait`) are covered only by the `"./*"` wildcard export — deep, not public API | `pi-tui/package.json` exports map; all six specifiers probe-resolve 2026-10-06 | Prefer root exports (`@oh-my-pi/pi-tui` re-exports every component, `MouseRoutable`, `Ellipsis`, `truncateToWidth`); pin the host version and add an import smoke test |
| **R23** | `streamSimple` from `@oh-my-pi/pi-ai` is a deep import, not public API | `bench-cli.ts:14`, `dry-balance-cli.ts:14` import it; no `omp://` doc lists it as stable | Wrap in try/catch; fall back to `runEphemeralTurn` with session model (slower but works); pin host version; add import smoke test |
| **R24** | Compaction cost is unbounded without a cap | No max-spend cap in OptMem, OptChat, or omp `[F21.64]` | 1000 calls/day cap (§3.6 T5); when hit, compaction pauses until next day; expose cap in settings |
| **R25** | LLM summarisation is non-deterministic — two honest compactors produce different text | OpenAI: "not guaranteed" even with fixed seed `[F20.52]` | Single-writer compaction (one background job) eliminates divergence by construction; do NOT content-address the tree (hash difference carries no signal about which is right) |
| **R26** | Cold tree falls behind under high message rate | No formula for JOBS from message rate; `JOBS >= rate × latency` is uncalibrated `[F21.71]` | Agents read raw tail without waiting; late joiners get `gap` + raw-log fallback; monitor compaction lag via `room{op:"board"}` |
| **R27** | `forget` + rebuild is expensive for large trees | `tree_drop` truncates all level files from `lo//size` upward; rebuild requires re-running compaction for all affected nodes `[F20.16]` | Rebuild lazily (only when a node is read); batch `forget` calls; consider incremental rebuild (only affected branches) |
| **R28** | `ctx.setInterval` auto-cleared on `session_shutdown` (2s budget) | `[F18 §4 d]` probe: managed interval froze after `dispose()` | Run compactor from the main session only; refcount per live session; clear only at zero (same as R11) |
| **R29** | Harness-tag injection via room message body | `deliver()` passes `record.body` verbatim; no `escapeHarnessTags` | Apply `escapeHarnessTags()` on delivery + per rendered line (§5.3, §7.4). Native: `irc-bridge.ts:189`, `harness-tags.ts:14-16` |
| **R30** | ANSI escape injection via room message body | Rendered lines not sanitised | Apply `sanitizeText()` from `@oh-my-pi/pi-utils` on every rendered line (§5.3, §6.3, §7.4) |

---

## 11. Test plan

### 11.1 Deterministic multi-agent harness (no model)

Drive the tools directly — `session.getToolByName("room")!.execute(toolCallId, params, signal, onUpdate)`
binds the session's real `ExtensionContext` (`wrapper.ts:103-128`) `[F18 §5]`.

```ts
// tests/e2e-room.test.ts
import { test, expect } from "bun:test";
import * as fs from "node:fs"; import * as os from "node:os"; import * as path from "node:path";
import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import roomExtension, { __roomTest } from "../src/index";

async function newSession(bus: EventBus, registry: AgentRegistry, root: string, id: string) {
  const localProtocolOptions = { getArtifactsDir: () => root, getSessionId: () => id };
  const { session } = await createAgentSession({
    eventBus: bus, localProtocolOptions, extensions: [roomExtension],
    agentRegistry: registry, agentId: id, sessionManager: SessionManager.inMemory(),
    disableExtensionDiscovery: true, enableMCP: false, enableLsp: false, hasUI: false,
  });
  return session;
}

test("room: claim → wait_for_claim → durable log", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-"));
  __roomTest.store.reset();
  const bus = new EventBus(); const registry = new AgentRegistry();
  const a = await newSession(bus, registry, root, "AgentA");
  const b = await newSession(bus, registry, root, "AgentB");
  const roomA = a.getToolByName("room")!, roomB = b.getToolByName("room")!;
  const waitClaimB = b.getToolByName("wait_for_claim")!;

  // A claims first
  await roomA.execute("c-claim", { op: "claim", topic: "build", key: "step", ttl: 300000 }, undefined, undefined);

  // B waits for the claim to be released — still blocked
  const waitP = waitClaimB.execute("c-wait", { resource: "build/step", ttl: 300000 }, undefined, undefined);
  let done = false; waitP.then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);                                    // still blocked

  // A releases → B's waiter is resolved AND granted the lease
  await roomA.execute("c-release", { op: "release", topic: "build", key: "step" }, undefined, undefined);
  const winner = await Promise.race([waitP, Bun.sleep(1000).then(() => "TIMEOUT")]);
  expect(winner).not.toBe("TIMEOUT");                          // cross-session notification, no polling
  expect(winner).toMatchObject({ outcome: "event", acquired: true, claim: { holder: "AgentB" } });

  // First-writer-wins: A's re-claim loses (B now holds it)
  const second = await roomA.execute("c-claim2", { op: "claim", topic: "build", key: "step", ttl: 300000 }, undefined, undefined);
  expect(second).toMatchObject({ ok: false, holder: "AgentB" });

  // Root sharing: same file read from B's root options
  const logPathA = resolveLocalUrlToPath("local://room/room.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentA" });
  const logPathB = resolveLocalUrlToPath("local://room/room.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentB" });
  expect(logPathA).toBe(logPathB);
  const lines = fs.readFileSync(logPathA, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
  expect(lines.map(l => l.kind)).toContain("claim");
  expect(lines.find(l => l.kind === "claim")).toMatchObject({ from: "AgentA", resource: "build/step" });

  await a.dispose(); await b.dispose();
});
```

### 11.2 What each assertion proves

| Assertion | Proves |
|---|---|
| B's `wait_for_claim` is still pending before A releases | the wait actually blocks (no busy-poll) |
| It resolves with `{outcome:"event", acquired:true, claim:{holder:"AgentB"}}` after A's release | cross-session notification + auto-grant of the lease |
| The JSONL contains the `claim` line | the O_APPEND append pattern works and is durable |
| A second `claim` from A returns `{ok:false, holder:"AgentB"}` | first-writer-wins |
| The same file read from B's root options is identical | subagents share the parent's `local://` root |

### 11.3 Additional suites

- `tests/store.test.ts` — P0 acceptance (concurrent writers, torn-line tolerance, replay, cursors).
- `tests/attention.test.ts` — P3 acceptance (tier table, caps, bucket, coalesce, mute, gaps).
- **Prompt-level variant** (needs a live model; `modelRegistry.getAvailable()` returned 47 models in
  this environment `[F18 §5]`): replace direct `execute()` with `session.prompt(...)` on two sessions
  and assert the final assistant text + the log.
- **`task`-tool path**: `session.getToolByName("task")!.execute(...)`; children register in
  `AgentRegistry.global()` and are readable at `agent://<id>` `[F18 §5]`. Note the conflict: `agent://`
  follows the session's registry while `history://` hard-codes the global one — use the **global**
  registry with distinct `agentId`s in tests `[F18 §Conflicting]`.
- **Eval path**: `agent()`/`workpool` spawn through the same host bridge into the same process and
  `AgentRegistry.global()` `[F18 §5]`; the eval cell runs in a subprocess kernel, so use the host
  bridge, not an in-cell import.
- **Delivery adapter tests** (P7): all four paths — T2 (cursor bump only), T1 self (aside),
  T1 sibling (aside), T0 sibling (steer). Assert `sendMessage`/`sendCustomMessage` called with
  correct `deliverAs` and sanitised body.
- **`wait_for_agent` test** (P7): spawn two agents, call `wait_for_agent` on one, assert it
  resolves when the other changes status.
- **Rate limiting test** (P7): srTCM — assert green/yellow/red transitions at the configured
  CIR/CBS values.
- **Cursor persistence test** (P7): `appendEntry("chatroom:cursor", ...)` — assert the cursor
  survives a session resume.
- **Tree rebuild test** (P7): write N records, build tree, `forget` a node, rebuild from log,
  assert the tree is identical.
- **No-UI fallback test** (P7): register renderers, assert they degrade gracefully when
  `FramedMessageComponent` is absent.
- **Card tests** (P7): `room:mention`, `room:claim`, `room:board-delta` — assert each renders
  with the correct collapsed/expanded shape.
- **Torn-line test** (C3): 100 valid lines, one torn line, 100 more valid lines → all 200 valid
  records survive; the torn line is skipped and a `gap` record is emitted.
- **Spoofed `from` test** (S4): post with a spoofed `from` → assert the stored record has
  `from = ctx.agent.id`.

---

## 12. Source index

- **F15** `findings/F15-plugin-packaging-devtooling.md` — manifest, `omp plugin link`, load modes, settings, examples.
- **F16** `findings/F16-tui-panel-surface.md` — Component contract, pi-tui signatures, agent-hub reference, layouts, lifecycle, TUI limits.
- **F17** `findings/F17-keybindings-commands.md` — keypress→handler path, ctrl+s precedence, no action API, `registerCommand`, mode degradation.
- **F18** `findings/F18-room-store-concurrency.md` — `local://` root, atomic JSONL, import table, hazards, test harness.
- **F19** `findings/F19-inline-rendering.md` — `registerMessageRenderer`, IRC card anatomy, room cards, persistence, no-UI fallback, tool cards.
- **R2** `REPORT-v2-hybrid.md` — hybrid decision, wait surface, envelope, attention model, routing rule.
- **R1** `REPORT.md` — gap analysis, claim-board rationale.
- **F0–F14** prior-round findings (native substrate, plugin surface, onboarding, protocol prior art, attention/backpressure).
