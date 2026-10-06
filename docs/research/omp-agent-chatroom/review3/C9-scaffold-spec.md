# C9 — scaffold-spec pass (round 3)

Lens: **structural closure.** Build `SCAFFOLD.md` — every §2.1 file, every export as a signature, every
import resolved, no bodies. Where the plan cannot be turned into a closed scaffold, that gap *is* the
finding. Deliverable: `docs/research/omp-agent-chatroom/SCAFFOLD.md` (1677 lines).

Evidence base: installed omp 18.6.1 under
`/home/yuzu/.bun/install/global/node_modules/@oh-my-pi/{pi-coding-agent,pi-ai,pi-tui,pi-utils}/src`.
Every host symbol in the scaffold was verified by reading its declaration; all 15 deep specifiers were
`Bun.resolveSync`-probed and resolve.

Result: **1 critical, 4 major, 3 minor.**

---

## CRITICAL

### F1 — `pi.enabledFeatures` does not exist, and feature gating is a no-op by construction

**Plan line (§2.1.1:135-137), verbatim:**
```ts
export default function roomExtension(pi: ExtensionAPI): void {
  const features = pi.enabledFeatures;   // null = use defaults
  const has = (f: string) => features === null || features.has(f);
```

**Evidence.**
- `ExtensionAPI` is `extensibility/extensions/types.ts:1357-1696`. It has no `enabledFeatures`, no
  index signature, and no such member anywhere in the interface body. Confirmed by grep over the whole
  `src/` tree: the only `enabledFeatures` symbols are `PluginRuntimeState.enabledFeatures`
  (`extensibility/plugins/types.ts:116`, `:132`) and the loader/CLI/manager consumers
  (`plugins/loader.ts:207,214,377-395`; `cli/plugin-cli.ts:534,675,681,835`;
  `plugins/manager.ts:280,290,484,646-674,930-941,971-997`).
- The concrete instance is `class ConcreteExtensionAPI implements ExtensionAPI`
  (`extensibility/extensions/loader.ts:179-190`): its members are `logger`, `typebox`, `arktype`,
  `zod`, `flagValues`, `pendingProviderRegistrations`, `pi`, `extension`, `runtime`, `cwd`, `events`.
  No feature set is threaded in.
- Gating happens at **entry-point resolution**, before the factory runs: `resolvePluginManifestEntries`
  (`plugins/loader.ts:376-395`) selects `feat.extensions` for enabled features only. It then feeds
  `discoverExtensionPaths`, which **dedupes by resolved path** (`loader.ts:586-592`: `const seen = new
  Set<string>(); const addPath = extPath => { const resolved = path.resolve(extPath); if
  (!seen.has(resolved)) … }`).

**Why it is critical.** §2.2 gives all three features the *same* `extensions` array —
`["./src/index.ts"]`. Every enabled feature therefore resolves to the identical file, and the dedupe
collapses them to one entry. The extension always loads regardless of which features are enabled, so:
1. the runtime `has()` guard the plan relies on reads a property that does not exist, and
2. the P7 acceptance — *"disabling the `panel` feature removes the panel but keeps the room tool"*
   (§9 P7) — is **unimplementable with this manifest**.

**Fix (either).**
- **(a) Honest runtime gate.** Drop the feature gate from `index.ts` and add a `registerFlag`-backed
  config gate (`--no-room-panel`), read via `pi.getFlag`; or
- **(b) Honest manifest gate.** Split the entry points: `room` → `./src/room-entry.ts`,
  `wait-tools` → `./src/wait-entry.ts`, `panel` → `./src/panel-entry.ts`, each a distinct factory that
  calls the shared `register*` functions. Distinct paths survive the dedupe; then the loader's feature
  filter actually does something. (a) is the smaller diff and matches R6's own "settings are
  unreachable" conclusion.

**Scaffold handling.** §6 of `SCAFFOLD.md` keeps the defensive cast
(`(pi as ExtensionAPI & { enabledFeatures?: Set<string> | null })`) so the file compiles, and documents
F1 in place.

---

## MAJOR

### F2 — §2.1's file list is not closed over the plan's own prose

**Plan line (§2.1:76-123)** presents the repo layout as "exact files". The prose requires four more:

| Missing file | Required by | Quote |
|---|---|---|
| `src/cards/body-lines.ts` | §7.4 RISK R21 | *"The room ships its own `src/cards/body-lines.ts`"* — §2.1's `cards/` block lists only `message-cards.ts` and `tool-cards.ts` |
| `tests/tree.test.ts` | §9 P1b, §11.3 | *"`bun test tests/tree.test.ts` green"* — §2.1's `tests/` block lists three files, not four |
| a config module | §10 R6 | *"Plugin owns `local://room/config.json` (read/write via the store), exposed via a `/room config` subcommand"* — no file owns it |
| an ambient `.md` declaration | §8 | *"imported with `with { type: "text" }`"* — no `.d.ts` declares `*.md` anywhere in the plan |

**Why major.** The acceptance criterion for this pass is "a reader could create every file and have it
typecheck". Without the `.md` declaration, `hook.ts` does not typecheck; without `tree.test.ts`, P1b has
no file; without a config module, R6 has no implementation site.

**Fix.** Add the four entries to §2.1 (the scaffold supplies `src/env.d.ts`, `src/store/config.ts`,
`src/cards/body-lines.ts`, `tests/tree.test.ts`).

### F4 — §3.1's `RoomStore` has no mutation method, so the store↔claims cycle cannot be broken

**Plan lines (§3.1:308-323)** — the full interface, verbatim field list:
```ts
interface RoomStore {
  root: string; logPath: string; treePath: string;
  records: RoomRecord[]; byId: Map<string, RoomRecord>;
  claims: Map<string, ClaimState>; cursors: Map<string, number>;
  members: Map<string, MemberState>; listeners: Set<(r: RoomRecord) => void>;
  seq: number; tree: TreeStore; reset(): void;
}
```
**And (§3.4:495):** *"Reclaim is explicit and logged — appends `release{reason:"reclaimed"}` then
`claim`"*; **and (§3.4:497):** *"Claim state is rebuilt by replaying the log on first open (§3.3)"*.

**Evidence / why major.** The arbiter's signatures (`grant(store, …)`, `release(store, …)`) must append
records. There is no `append` on the interface, so `claims.ts` must import a module-level append
function from `room-store.ts` at runtime. `room-store.ts` must, in turn, import `hydrateClaims` from
`claims.ts` at runtime to satisfy §3.4's replay requirement. That is a **runtime import cycle**. It is
survivable in Bun/ESM for function declarations, but it makes initialization order load-bearing and is
exactly the class of hazard the plan's own invariant I1 ("every mutation is synchronous") is meant to
avoid.

**Fix.** Add `append(draft: RoomRecordDraft): RoomRecord` to `RoomStore`. Then every writer depends on
the interface type only, and only `room-store.ts` imports `claims.ts` for hydration — one directed
edge, no cycle. The scaffold adds it (§13) and marks the direction.

### F6 — `roomIdFor(root)` collapses every session tree onto the id `"local"`

**Plan line (§2.1.2:203-206), verbatim:**
> **`roomIdFor` derivation rule**: the room id is the last segment of the `local://` root path,
> lowercased and stripped of non-alphanumeric characters. This gives a stable, human-readable id that
> matches the session tree.

**Evidence.** §3.3:397 binds `root = resolveLocalRoot(opts)`. That function
(`internal-urls/local-protocol.ts:229-240`):
```ts
const artifactsDir = options.getArtifactsDir?.();
if (artifactsDir) {
  const candidate = path.resolve(artifactsDir, "local");
  …
  return candidate;
}
return path.join(os.tmpdir(), "omp-local", safeSessionId(options));
```
When an artifacts dir exists — the normal case, and the one §11.1 sets up with
`getArtifactsDir: () => root` — the returned path ends in the literal segment `"local"`. So
`roomIdFor` returns `"local"` for **every** session tree in **every** project, contradicting §1.3
assumption 1: *"one room per session tree, room id = the `local://` root's owner session."*

The plan's own example — `"/tmp/omp-local/abc123 → \"abc123\""` (§2.1.2:179) — exercises only the
tmpdir fallback branch, which is unreachable when an artifacts dir is configured.

**Fix.** Derive the id from `ctx.sessionManager.getSessionId()` (the owner session, which §3.5 already
trusts for cursor persistence), not from the resolved root path; or make the rule "the last segment
of the root **above** `local`". Update the §2.1.2 example accordingly.

### F7 — three different log filenames; §11.1 reads a file the store never writes

**Plan lines, verbatim:**
- §3.1:312 — `logPath: string;  // <root>/room/<roomId>.jsonl`
- §3.3:398 — ``const logPath = resolveLocalUrlToPath(`local://room/${roomId}.jsonl`, opts);``
- §11.1:1525-1527 —
  ```ts
  const logPathA = resolveLocalUrlToPath("local://room/room.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentA" });
  const logPathB = resolveLocalUrlToPath("local://room/room.jsonl", { getArtifactsDir: () => root, getSessionId: () => "AgentB" });
  expect(logPathA).toBe(logPathB);
  ```

**Evidence.** With F6's rule the store writes `<root>/room/local.jsonl`; with F6's fix it writes
`<root>/room/<sessionId>.jsonl`. Either way §11.1 opens `<root>/room/room.jsonl` — a different file.
The test's final assertions (`lines.map(l => l.kind)).toContain("claim")`, §11.1:1529) would read an
empty or absent file and fail, or worse, pass against a stale file from a previous run.

**Fix.** §11.1 must build the path with the same helper the store uses (export
`logPathFor(root, roomId)` from `store/room-store.ts`), and assert the round-trip
`logPathFor(root, roomId) === resolveLocalUrlToPath(\`local://room/${roomId}.jsonl\`, opts)`.

---

## MINOR

### F3 — `streamSimple` is a root export, not a deep import

**Plan lines (§3.6:540-542), verbatim:** *"Model = `@smol` via `streamSimple` (deep import from
`@oh-my-pi/pi-ai`, not public API)"*; **and R23:1459:** *"`streamSimple` from `@oh-my-pi/pi-ai` is a
deep import, not public API."*

**Evidence.** `pi-ai/src/index.ts:43` is `export * from "./stream";` and `stream.ts:1307` is
`export function streamSimple<TApi extends Api>(model, context, options?):
AssistantMessageEventStream`. The specifier `@oh-my-pi/pi-ai` is a documented root export in its
`exports` map. (Contrast R22's genuinely deep `pi-tui` subpaths, which are wildcard-only.)

**Fix.** Drop `streamSimple` from R23's deep-import risk; keep R23's *substantive* point (it is
undocumented as a stability contract) but re-file it as "documented export, no stability promise".

### F5 — `MemberState`, `Tier`, `WaitOutcome` are used as named types but never declared

**Plan lines:** §3.1:318 `members: Map<string, MemberState>`; §5.1:856
`export function classify(record: RoomRecord, viewer: MemberState)`; §5.3:907
`deliver(…, tier: Tier)`; §4.5:807-808 `{ outcome: "event" | "timeout" | "aborted", … }`.

**Evidence.** None of the three appears in any plan `type`/`interface` block. §5.1 and §5.2 also give
`classify` a `"T0" | "T1" | "T2"` return *inline* while §5.3 names it `Tier`.

**Fix.** Declare all three (scaffold: `MemberState` in `store/schema.ts`, `Tier` in
`attention/tiers.ts`, `WaitOutcome` in `store/schema.ts`) and use the name in §5.1's signature.

### F8 — §3.3's "never a throw" policy contradicts §3.3's own `openRoomLog` body

**Plan line (§3.3:473-475), verbatim:** *"missing / unwritable / corrupt room file each returns a
normal tool result `{ok:false, error}` — never a throw."*
**Plan line (§3.3:418-421), verbatim:**
```ts
export function openRoomLog(path: string): number {
  fs.mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  return fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND);
}
```
**Evidence.** `fs.mkdirSync` throws `EACCES`/`EROFS`/`ENOSPC`; `fs.openSync` throws `ENOENT` (if the
parent vanished), `EACCES`, `EROFS`, `EMFILE`. Neither call is guarded, and the policy covers only
"missing / unwritable / corrupt" *after* a handle exists.

**Fix.** Wrap the first open in the store (`openRoomStore`), map `ENOENT`/`EACCES`/`EROFS` to the U6
result, and keep `appendLine`'s short-write `throw` (a programmer error, not a file state). Document
that U6's three strings are the *steady-state* errors, distinct from open-time errno mapping.

---

## What the scaffold pass CONFIRMED as correct

- **Every one of the 15 deep specifiers resolves.** `Bun.resolveSync` from the repo root: all OK —
  `pi-coding-agent/{internal-urls/local-protocol,session/harness-tags,utils/event-bus,registry/agent-registry}`,
  `pi-tui/{chrome/overlay-box,render/render-utils,render/status-line,theme/tui-adapters,chat/messages,tools/renderer,overlays/agent-hub-renderer}`.
  R2/R22's "pin the host version + smoke test" advice is sufficient; no specifier is unreachable.
- **The §4.1 op table, §3.2 record union, §3.4 arbiter signatures, §3.6 `TreeStore`, §4.2-4.4 wait
  params, §5.1 `classify`, §5.4 `buildDigest` all transcribe cleanly** into closed TypeScript. No
  further type holes beyond F5.
- **The type-only back-edges are safe.** `claims.ts → room-store.ts` and `tool-cards.ts →
  tools/room.ts` can both be written `import type` and are erased; only F4's missing `append` forces a
  runtime cycle.
- **The three test files in §2.1 exist and are nameable**; §11.1's harness imports
  (`createAgentSession`, `SessionManager.inMemory`, `AgentRegistry`, `EventBus`,
  `resolveLocalUrlToPath`) all resolve to verified declarations (`sdk.ts:1618`,
  `session-manager.ts:4150`, `sdk.ts:898`, `utils/event-bus.ts:3`, `local-protocol.ts:285`).
