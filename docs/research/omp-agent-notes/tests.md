# Testing conventions & coverage — `plugin/tests/**`

Scope: the 15 test files under `plugin/tests/`. The last full-suite run (orchestrator-verified) was
**274 pass / 0 fail, 3398 assertions, 15 files**; the current tree declares **281** tests — the
suite is being edited concurrently, so treat 274 as the last *measured* run, not a current
invariant, and re-run `bun test tests/` for the live number. Purpose: how to add a test here
correctly, and what is still unverified. Every claim carries a `file:line`.
NOTE: this file was authored as `docs/research/omp-agent-notes/tests.md`; it now lives at that
repo path (refreshed 2026-10-20 — the counts, the suite table and the room-root facts below were
re-verified against the current tree).

> ⚠️ **Live-edit warning:** these files are being edited concurrently. During this investigation
> `onboarding.test.ts` gained/changed two header tests (now at `onboarding.test.ts:422` "the header
> stays one line and inside the token budget" and `onboarding.test.ts:437` "store.members is a
> lifetime counter and is not reported" — the header now carries ONE count, `N live`, and asserts
> `not.toContain("joined")`), and `store.test.ts` grew (F6 at `store.test.ts:620`, F12 at
> `store.test.ts:704`). Re-verify anchors before editing.

---

## 1. Framework and how tests are written

- **Runner:** `bun:test` (imported in every file, e.g. `store.test.ts:1`). Run with
  `cd plugin && bun test tests/` → 274 pass / 0 fail, 3398 assertions, 15 files.
- **No module mocking.** `tree.test.ts:78-83` states the rule: `mock.module` leaks across files in
  one `bun test` process, so the fake LLM seam is `registerCustomApi` instead
  (`tree.test.ts:6`, `tree.test.ts:120`).
- **Fixtures are real on-disk artifacts.** Every suite builds unique temp roots with
  `fs.mkdtempSync(path.join(os.tmpdir(), ...))` (`store.test.ts:45-48`, `room-tool.test.ts:34-36`,
  `attention.test.ts:46-49`, `panel.test.ts:50-53`, `onboarding.test.ts:61`, `tree.test.ts:41-44`,
  `e2e-room.test.ts:56-59`, `wait-tools.test.ts:67-70`). `store.test.ts:44` documents why: "A unique
  on-disk local:// root per test — never the fixed /tmp path the scaffold used."
- **The room root is derived, not literal:** most fixtures call
  `resolveLocalRoot({ getArtifactsDir, getSessionId })` to get the `local://` root
  (`store.test.ts:49`, `attention.test.ts:49`, `panel.test.ts:53`). That is the **artifacts** root,
  not the room root: the room root is now the **global omp session store** (§4, gotcha 1). The
  e2e/wait suites bypass the `local://` root because the room is keyed on `ctx.cwd` — see §3/§4.
- **Structural stores** for pure-logic tests, cast, never real files:
  `miniStore` (`attention.test.ts:56-64`), `cursorStore` (`store.test.ts:59-63`), `fakeStore`
  (`tree.test.ts:205-207`).
- **The tool-tests seam is `registerTool`, not a mock.** Suites hand `registerRoomTool` a fake `pi`
  whose `registerTool` captures the definition, then call `tool.execute(...)` directly
  (`room-tool.test.ts:360-395` `invokeRoom`, `attention.test.ts:609-634` `roomHarness`,
  `store.test.ts:403-444`). Note the hand-rolled `zod` stub repeated at
  `room-tool.test.ts:367-388` and `attention.test.ts:617-623` — copy it verbatim; `enum`/`string`/
  `number`/`array` each need a chainable `optional()`.
- **e2e suites use real host sessions:** `createAgentSession` + `SessionManager.inMemory(root)` +
  `extensions: [roomExtension]` + `hasUI: false` (`e2e-room.test.ts:29-49`, `wait-tools.test.ts:33-60`),
  then `session.getToolByName(name)` (`e2e-room.test.ts:51-55`, `wait-tools.test.ts:60-65`). Host
  generics are erased on `getToolByName`, so the K1 result envelope is restated locally
  (`e2e-room.test.ts:13-23`, `wait-tools.test.ts:10-27`).

## 2. Test-only seams

- **`__roomTest.store.reset()`** — exported from `plugin/src/index.ts:31-38`; delegates to
  `resetRoomStores()`. Used by `freshRoot()` in the two e2e suites
  (`e2e-room.test.ts:56-59`, `wait-tools.test.ts:67-70`) because real sessions hold their own
  process-wide store state.
- **`__compactTest`** — `{ resetSpend(), setSpendToday(n) }` from `plugin/src/store/compactor.ts:59-70`.
  Its own comment says "[invented] test seam (the `__roomTest` precedent, §2.1.1 M-4) … No
  production caller." It exists so the daily spend cap can be tested without 20 000 real calls; used
  throughout `tree.test.ts` (e.g. `tree.test.ts:310`, `:315`, `:343`, `:352`, `:376`, `:400`).
- **`AgentRegistry.resetGlobalForTests()`** — a host hook for the process-wide registry singleton;
  called in `onboarding.test.ts:59` and `:70` (both beforeEach and afterEach). Other suites register
  real agents into `AgentRegistry.global()` instead of stubbing it
  (`room-tool.test.ts:38-40`, `attention.test.ts:457-472` `registerSession`).
- **`registerCustomApi(FAKE_API, ...)`** — the fake LLM (`tree.test.ts:120-151`). It records
  `llmCalls`/`lastPrompt`/`lastSystemPrompt`/`lastMaxTokens`, and by default replies with a
  deterministic summary `S{lo}-{hi}` derived from the block named in the prompt, so a rebuild that
  reproduces the same prompt reproduces the same node (`tree.test.ts:145-148`). `replyFor` scripts
  per-call canned replies for the retry tests (`tree.test.ts:108-109`).

## 3. State reset between tests

- `resetRoomStores()` in `afterEach`: `room-tool.test.ts:44-46`, `attention.test.ts:41-44` (the
  afterEach also `splice`-cleans the `TMP` array and `rmSync`s every temp root).
- `onboarding.test.ts:58-72` does it both directions (`beforeEach` + `afterEach`) and re-seeds a
  fresh `artifactsDir` + store per test, plus `AgentRegistry.resetGlobalForTests()` on both sides.
- `tree.test.ts:76-78` cleans `TMP` only in `afterAll`; tests that mint stores call
  `resetRoomStores()` inline at the end (e.g. `tree.test.ts:515`, `:531`, `:546`).
- **`reset()` does NOT evict the registry entry** — pinned by
  `store.test.ts:257-270` ("reset() clears state without evicting the registry entry"). A store from
  a previous test is therefore cleared, not re-minted.
- `e2e-room.test.ts:57` / `wait-tools.test.ts:68` reset at the START of each test (inside
  `freshRoot()`), not in an `afterEach` — follow that shape for anything built on
  `createAgentSession`.
- Registering the tool repeatedly is safe: `invokeRoom` re-runs `registerRoomTool(pi)` per call
  (`room-tool.test.ts:363-395`).

## 4. The fake-ctx patterns and the gotchas that live there

Per-suite fake ctx builders: `room-tool.test.ts:321-341` (`fakeCtx`), `attention.test.ts:448-455`
(`fakeCtx`), `onboarding.test.ts:213-227` (`fakeCtx`), `tree.test.ts:172-205` (`fakeCtx` with the
interval recorder) and `tree.test.ts:483-501` (`sessionCtx`), `panel.test.ts:462-478`
(`tuiCtx` inside `captureTerminalInput`), `panel.test.ts:388-412` (the `/room` TUI ctx).

Gotchas (each one is a pinned regression):

1. **`cwd` must be the unique temp root.** The room root is derived from `ctx.cwd`, NOT from
   `localProtocolOptions` (which is per-session). `room-tool.test.ts:327-330`: "The room root is
   derived from `ctx.cwd` (one room per project, shared with subagents), so a test's isolated root
   must be its cwd — `localProtocolOptions` is per-session and no longer keys the room." The
   companion regression test `room-tool.test.ts:360-395` pins the real layout: main and a subagent
   with DIFFERENT artifacts dirs share ONE room, with the story of the bug in the comment at
   `:361-369`. Same lesson is re-asserted in e2e at `e2e-room.test.ts:23-27` and
   `e2e-room.test.ts:332-356`, and in the onboarding fixture at `onboarding.test.ts:62-65`.
   **What changed since:** the room is still keyed on `ctx.cwd`, but it is no longer *stored* in
   the project directory. `roomRootFor(ctx)` (`plugin/src/store/room-root.ts:54-57`) returns
   `<cwd>/.omp-room` for a project **under `os.tmpdir()`** and the **global** omp session store
   (`getSessionsDir()/rooms/<16 hex of the project path>`) for every other project. The temp-dir
   rule is what keeps the existing temp-root fixtures working — a test must never write into the
   user's real room store. A test that needs the **global** branch must use a project dir
   **outside** `os.tmpdir()` — that is what `room-root-e2e.test.ts` does.
2. **The fake `ui.custom` must hand the panel a real theme.** The pi-tui `theme` module export is
   `export var theme` and is `undefined` until `initTheme()`; the panel must use the theme the host
   injects as arg 2 of the overlay factory. `panel.test.ts:466-478` (factory passes `theme` from the
   import and captures the host close callback), with the explanation at `panel.test.ts:505-508`
   (`captureTerminalInput` calls `ensureThemeSync()` so a render-before-`beforeAll` doesn't crash).
   The class of bug this pins is documented at `panel.test.ts:244-247` (the half-built panel whose
   timer leaked when refresh threw on `theme.fg`).
3. **Destructuring a getter evaluates it early.** `captureTerminalInput`'s `handler` is a getter
   that throws while unset (`panel.test.ts:521-523`), so `const { handler } = captureTerminalInput()`
   explodes before `openRoomPanel` has run. Bind the helper object first and access `.handler`
   after — `panel.test.ts:566-568`.
4. **The fake ctx must complete the timer API** (`setInterval`/`clearTimer`): the real
   ExtensionContext schedules the store's background jobs, so a stub missing them either crashes or
   hides the main-only timer guard. `room-tool.test.ts:337-340`, `tree.test.ts:483-501`,
   `panel.test.ts:405-407` ("The real ExtensionContext schedules the store's background jobs (I4);
   the stub must too").
5. **`clearTimer`, not `clearInterval`** — the host method is `ctx.clearTimer(handle)`
   (`room-tool.test.ts:340`, `tree.test.ts:496-499`).

## 5. What each suite covers

| Suite | Tests | Covers |
|---|---|---|
| `store.test.ts` | 28 | The JSONL log and its neighbourhood: concurrent writers produce zero torn lines (`:73`), torn-line tolerance with a `gap` record (`:96`), replay rebuilds identical state (`:118`), a malformed mid-file record is skipped without shifting seq (`:159`), `roomIdFor` purity (`:180`), `logPathFor` single convention (`:202`), `resourceKey`/`newMessageId` (`:220`), `validateRecord` accept/reject (`:228`), `openRoomLog` error mapping without throwing (`:255`), close/reopen fd (`:274`), cursor init/monotonicity/clamping (`:290`, `:308`), `persistOwnCursor`/`restoreOwnCursor` via `appendEntry("chatroom:cursor")` (`:317`), config defaults/round-trip/persist-once (`:336`), room flags (`:354`), `enforceRetention` prune + gap (`:378`, `:502`), room tool registers the four card hooks (`:403`), `before_agent_start` cursor restore (`:446`), claim→`heldTopics`→T1 (`:531`), oversized-post truncation (`:620`), `appendLine` fsyncs (`:704`). |
| `room-tool.test.ts` | 67 | Claims semantics against a real store: first-writer-wins with no seq consumed (`:50`), release promotes the OLDEST waiter (`:76`), re-queue never fails (`:103`), `expireStale` TTL path (`:127`, `:152`), parked/aborted reclaim (`:161`, `:179`), append-only seq (`:193`), listeners (`:219`, `:232`), store registry/eviction/refcount (`:243`, `:344`, `:417`, `:430`, `:445`), main+sub one room (`:360`), main-only timers (`:398`), and then every op through `invokeRoom`: topics/mute/unmute (`:524`–`:594`), tree/zoom (`:615`–`:674`), recall (`:682`–`:711`), post tier (`:724`–`:739`), read budget (`:750`, `:773`), K1 content contract (`:800`, `:814`, `:827`), recall security (`:843`, `:853`), tree-through-tool (`:885`, `:905`), zoom singletons (`:922`). |
| `attention.test.ts` | 41 | The tier table across all 6 kinds × viewer states (`:143`, `:236`, `:253`), the M11 eviction regression (`:283`), injection caps K and B (`:303`, `:315`), T2 coalescing threshold (`:332`, `:346`), the srTCM bucket green/yellow/red + refill + per-agent (`:354`), T0 coalescing ceiling (`:372`), kind-first dispatch via a poisoned `.body` getter (`:389`), escaping (`:422`), deliver: parked-skip (`:475`), steer/aside/cursor routing + self-echo suppression (`:494`), mute/unread (`:536`), gap note (`:564`), oversize truncation (`:578`), and the whole post/claim/release delivery pass through the real room tool: T0 steer (`:641`), T1 aside (`:656`), T2 cursor-only (`:671`), release→prevHolder T0 (`:685`), transport failure survives with `deliveryError` (`:703`), T0 batching past 50 (`:718`), T2 digest riding a delivery (`:740`, `:758`, `:773`), explicit caps (`:799`). |
| `panel.test.ts` | 23 | Exact-width rows at 80/100/120 (`:113`), narrow fallback + Tab toggle (`:129`), chat pane windows 5000 records instead of materialising (`:164`), board pane claim row (`:183`), dispose idempotence (`:212`), hostile-refresh cleanup of timer + both listeners (`:243`), the 15-key map and editor/filter ownership (`:280`), chrome rows down to width 1 (`:321`), roster strip (`:335`), `openRoomPanel` degrades outside a TUI (`:353`), `/room` opens the overlay in TUI and degrades headless (`:389`), ANSI stripping in board (`:428`), chat (`:456`), roomId title (`:596`), `handleInput` boolean (`:480`), and the `onTerminalInput` lifecycle: register (`:556`), forward + `{consume:true}` (`:564`), close unsubscribes once (`:574`), unmapped not consumed (`:586`). |
| `cards.test.ts` | 11 | `bodyLines` collapsed 3 / expanded 12 + counter (`:142`), under-cap passthrough (`:166`), quote-border/indent/tab/width (`:176`), the collapsed `room:message` card anatomy (`:190`), forged `<irc>`/`</room-authored>` escaping in rendered rows (`:207`), renderer registry totality + no catch-all (`:232`), `cardTypeFor` mapping for all 7 records (`:255`), the three other cards' anatomy (`:271`), exact width for every card at 12/40/80/121 (`:303`), width through the registry (`:322`), details-absent fallback (`:336`). |
| `onboarding.test.ts` | 23 | Digest token budget (`:78`), truncation drops the backlog oldest-first and never the cursor line (`:92`), K22 escaping in the digest (`:125`), poisoned roomId from config (`:143`), routing rule in the system prompt in full (`:161`, `:340`), hook idempotence (`:229`), roster/claim caps (`:262`), `session_shutdown` disposes exactly once (`:298`), no uptime (`:331`), digest rides the message not the prompt (`:369`), header counts the live population (`:407`, `:422`, `:437`), and the append-only rendering block: idle transition changes exactly one line (`:483`), no roster reorder (`:517`), cap drops idle first without reordering (`:538`), TTL bucketed so renders are byte-identical (`:566`), backlog grows only at its end (`:593`), budget + rule measured separately (`:610`). |
| `tree.test.ts` | 24 | Dense-prefix CAS on `putNode` (`:207`), `cover()` tiling invariants (`:232`), TREE_REC truncation incl. multibyte safety (`:263`), write mutex ordering + rejection survival (`:280`), daily spend cap pauses on the synchronous path (`:305`), all-attempts-fail skips one node (`:347`), rebuildability = same tiling from the log (`:367`), zoom one level + range validation (`:408`), main-only compactor (`:437`), `roomStoreFor` starts the compactor — 3 ticks, probe adds 0 (`:503`), subagent starts none (`:520`), dispose clears exactly once (`:536`), length retry keeps the SHORTEST attempt, 9 messages (`:558`), first-attempt store (`:579`), TREE_REC ruler + no custom system prompt (`:598`), TREE_REC = 512 on-disk width (`:624`), `ready()` queue (`:646`, `:671`), persisted view load/validate/reject (`:697`), view holds no whole message (`:731`). |
| `config.test.ts` | 10 | `configPath` (`:30`), missing file → defaults (`:37`), round-trip (`:44`), unknown keys ignored (`:53`), wrong-typed values fall back (`:69`), `resolveRoomId` derives/persists (`:89`) and honours the override (`:99`). |
| `drift.test.ts` | 6 | Installed host version equals `HOST_VERSION_PIN` (`:11`), the **GLOBAL** host (production) matches it too, skipping gracefully when there is no global install (`:25-47`), `assertHostVersion` throw/match (`:49`), `DEEP_SPECIFIERS` list (`:55`), every Option A deep specifier exports something with no undefined members (`:63`), `escapeHarnessTags`/`resolveLocalRoot` shape (`:79`). |
| `e2e-room.test.ts` | 9 | Full `§11.1` flow through two real sessions: claim → wait → release → log (`:71`), waiter still pending pre-release (`:165`), event envelope (`:193`), durable log contents (`:220`), first-writer-wins across sessions (`:243`), K1 content on every result incl. the timeout (`:283`), non-last dispose keeps the fd (`:313`), cross-artifacts-dir shared room (`:332`), the real 5 s sweep expires a stale claim (`:359`). |
| `wait-tools.test.ts` | 12 | `wait_for_claim` event (`:74`), timeout as a normal outcome (`:117`), event/timeout/aborted all carry content (`:144`), forged-tag escaping in `read` + digest (`:187`), `wait_for_agent` requires an explicit agents list — schema + execute (`:233`), `wait_for_message` has no `irc` source (`:262`), `wait_for_agent` timeout (`:284`), `wait_for_message` timeout (`:307`), `wait_for_message` event + matched record (`:328`), both new waits settle on abort (`:358`). |
| `host-contract.test.ts` | 3 | The **version-independence** gate, not a version gate: every deep specifier the plugin imports resolves and exports its named member against the INSTALLED host (`:29-56`), the host theme exposes a working `fg` and string-valued `sep`/`nav`/`status` (`:58-70`), and the plugin loads against the installed host with **zero** extension errors and all four tools registered (`:72-95`). |
| `room-command.test.ts` | 6 | The `/room` slash-command path: a non-numeric TTL appends nothing and warns (`:65`), a numeric TTL grants with that lease (`:76`), `/room config` shows only live knobs — no inert line, no reserved flags (`:86`), `/room post` pushes to a follower (T1), not just to the log (`:131`), `/room claim` notifies a waiter on the resource (M-8 T1) (`:157`), `/room join` records membership even when the agent already has a cursor (`:184`). |
| `room-root.test.ts` | 16 | **NEW** — where the room lives, in unit form: a project outside the temp dir resolves to the global room store (`:27`), a project under the temp dir stays project-local (`:33`), two projects never share a room and one project always maps to the same room (`:38`), the global root sits under omp's session store with a hex leaf (`:45`), migration copies the legacy log and config and keeps the pinned room id (`:54`), migration never clobbers a room that already has a log (`:72`), migration of a legacy room without a config names the log after the target's id (`:86`), migration is a no-op without a legacy room and for an identical source and target (`:97`); then the F5 lock cases: migration skips a legacy room a **LIVE** process still holds (`:114`), migration does not copy into a target a **LIVE** process holds (`:129`), migration leaves no lock behind (`:141`); then the F6 cases: the copied log carries the id the **TARGET** resolves (`:157`), the target's minted id when the config pins none (`:176`), no arbitrary log is adopted when the pinned id matches none (`:191`); then an interrupted copy leaves the target with NO log so the next attempt retries (`:218`), and the room's lock covers the migration **and** the open, so a second writer is refused (`:250`). |
| `room-root-e2e.test.ts` | 2 | **NEW** — the same thing end to end, in a **child `bun` process**: a project outside the temp dir opens its room in the global omp session store, and a legacy project-local room is copied into the global room on the first open. **Why a child process:** `getSessionsDir()` resolves its XDG base **once, at module load** (pi-utils keeps a module-level `DirResolver` singleton), so a test process cannot point the global store at a temp directory by setting `process.env.XDG_DATA_HOME` — by the time the test runs the resolver already holds the real HOME, and other plugin test files import pi-utils first. The only honest way to exercise the global branch is a child with a fresh environment: `XDG_DATA_HOME=<temp>` **plus** a `<temp>/omp` app dir, because the host only honours the XDG base when that directory exists (`room-root-e2e.test.ts:9-21`). The child's project cwd must be **outside** `os.tmpdir()`, since temp-dir projects stay project-local on purpose. Both tests share ONE child run (the child costs ~10 s to start, because importing the store pulls in the whole host module tree) and carry an explicit 120 s timeout — the 5 s default would kill a working probe (`room-root-e2e.test.ts:96-118, 150-240`). |

## 6. What is NOT covered

**The four items that are still unverified** (the live-verified list is in
`docs/research/omp-agent-notes/src.md` §10 and `AGENTS.md:196-199`):

1. **Cards in a real transcript.** Renderers are invoked directly with hand-built `CustomMessage`s
   (`cards.test.ts:89-99`, `:303`). The "details absent" resume shape is tested
   (`cards.test.ts:336`) but not through the host's renderer pipeline, and no test renders a card
   that actually arrived via `deliver()`.
2. **A model choosing to use the room unprompted.** The e2e suites create REAL sessions, but every
   tool call is made programmatically with `execute(...)` (`e2e-room.test.ts:51-55`,
   `wait-tools.test.ts:60-65`). The room tool *was* exercised in a real model turn live (a model
   was driven to `join` → `post` → `claim`), but nothing verifies that a live model **chooses**
   `room{...}` at the right moments on its own; `e2e-room.test.ts:119-122` even flags that a
   direct `execute()` return proves only the plugin's shape, not the host's `coerceToolResult`
   behaviour ("a smoke check, not proof").
3. **The compactor summarising with a real model.** The LLM is a `registerCustomApi` fake returning
   deterministic text (`tree.test.ts:120-151`). Prompt FORMAT (ruler, untrusted prefix, no system
   prompt) is verified (`tree.test.ts:598-621`); real summarisation quality is not.
4. **`wait_for_agent`'s happy event path.** Only schema rejection (`:233`), timeout (`:284`) and
   abort (`:358`) are tested — the `outcome:"event"` branch is never exercised, unlike
   `wait_for_claim` (`:74`) and `wait_for_message` (`:328`).

**Also not covered, but lower-stakes:**

5. **The panel's *input handling* under real load.** The panel **was** verified live in a real
   pty (a raw `python pty.fork()` + `TIOCSWINSZ` 120x40 driver — `tmux` is not installed on this
   machine) and it rendered the live room, the held claim and the room id
   (`AGENTS.md:224`). What the suite still does not cover is the fake-vs-real gap: `tuiStub` is
   `{ requestRender, terminal: { rows } }` (`panel.test.ts:87-89`); `ui.custom`/`ui.onTerminalInput`
   are captured fakes (`panel.test.ts:462-478`), so repaint cadence and overlay lifetime are
   exercised in isolation, not in production.
6. **`replyTo` and `performative` post params.** The params exist (`plugin/src/tools/room.ts:76-77`)
   and `replyTo` appears in the tier test as a classify input (`attention.test.ts:149`, `:155`), but
   no test passes either through `room.execute` — the tool-level handling of both is unverified.
7. **Panel compose editor and filter.** Key ownership while the editor/filter is open is mapped
   (`panel.test.ts:311-315`), but no test types into the compose buffer or applies a filter, and the
   `onReleaseClaim` / `onFocusAgent` callbacks are no-op stubs that are never asserted
   (`panel.test.ts:99-100`).
8. **The claim sweep under load.** `e2e-room.test.ts:359-380` is a single 12-second wall-clock probe
   (the suite's only timing dependency, its comment says so) that proves the job is wired and fires;
   the deterministic logic proof lives in `room-tool.test.ts:127-149` with an injected clock. The
   sweep's **T0 expiry notice** is delivered by the notifier the main session registers
   (`plugin/src/onboarding/hook.ts:67-85`); that wiring is unit-tested, but a real "your lease
   expired" delivery to a live agent has not been observed end to end.
9. **The single-writer lockfile against a real second process.** `room-root.test.ts:250` proves a
   second writer is refused; the lock's *stale-pid reaping* and the "two real omp processes"
   scenario are not exercised by a test.

## 7. Known-bad patterns (present, and how to read them)

**Tests that assert wording** — all intentional pins of the model-facing contract (K1) or the
append-only rendering, but each breaks on a copy tweak:

- `room-tool.test.ts:800-811` asserts board content contains "build/parser", "AgentA", "left" AND
  that it is NOT the old count-only line; `:814-824` asserts the row cap via the literal
  "more claim(s)"; `:827-838` asserts topics/recall content carries the rows.
- `attention.test.ts:752` — `content.match(/room ⟵ 20 new message/g)` pins the exact digest line.
- `onboarding.test.ts:591`-ish — asserts the exact claim line `- build/step held by AgentB · 5m left
  (expires 12:05)`; plus "Your cursor:", "Caps:", "· cursor=", "held by", "record(s)" throughout.
- `cards.test.ts:157`-ish — "+17 more lines" / "+8 more lines".

**Weak or vacuous assertions** (still in the suite):

- `attention.test.ts:380-386` — `expect(over.injected.length + many.length).toBeGreaterThan(0)` is a
  tautology (both terms are ≥ the ceiling). The real assertions are the lines above it.
- `panel.test.ts:556-561` — "openRoomPanel registers an onTerminalInput handler": the comment
  admits "If we got here without throwing, the handler was registered." The actual assertion is the
  throwing getter in the helper (`panel.test.ts:521-523`) — one indirection away from being empty.
- The `settledEarly` microtask races — `e2e-room.test.ts:100-103`, `:179-182`,
  `wait-tools.test.ts:91-95` — prove only "not settled synchronously". The test comments say so
  themselves ("a broken implementation that resolves on the next macrotask would pass"); the 50 ms
  race window and the later 2 s resolution race are what make them meaningful.
- `config.test.ts:18-21` — `tempRoot()` hardcodes `path.join("/tmp", "omp-config-test-")` instead
  of `os.tmpdir()`, the outlier every other suite fixed. Latent portability wart, not a bug here.
- Temp-dir hygiene is inconsistent: `store.test.ts:51-53` and `attention.test.ts:41-44` clean up;
  `room-tool.test.ts` and `panel.test.ts` create `mkdtemp` roots that nothing removes.

**Tests that would pass if the plugin implementation were deleted:**

- None outright. Closest is the whole of `drift.test.ts` — it asserts the HOST package's shape
  (`drift.test.ts:63-77` enumerates the host module's exports), so it passes/fails independently of
  any plugin code. Treat it as a dependency gate, not behaviour coverage. `host-contract.test.ts`
  is a second such gate: it asserts the host's **contract** (deep specifiers resolve, the theme has
  a working `fg`, the plugin loads with zero extension errors) rather than the plugin's behaviour.
- `drift.test.ts:11` reads the installed host's `package.json` and pins the version string;
  `drift.test.ts:25-47` reads the **GLOBAL** host's manifest — the one that actually loads a
  linked plugin — and skips gracefully when there is no global install. Both detect host drift, not
  plugin defects.

## 8. Rules for adding a test here

1. `bun:test` only; no `mock.module` (use a `registerCustomApi` seam or a fake `pi` object).
2. Real temp root per test via `fs.mkdtempSync(path.join(os.tmpdir(), "room-<suite>-"))`; push it
   onto a `TMP` array and clean it in `afterAll`/`afterEach` (`store.test.ts:51-53`).
3. Reset store state: `resetRoomStores()` in `afterEach` for unit suites
   (`room-tool.test.ts:44-46`); `__roomTest.store.reset()` at the top of each `freshRoot()` for
   `createAgentSession` suites (`e2e-room.test.ts:56-59`); `AgentRegistry.resetGlobalForTests()`
   whenever you register agents into the global registry (`onboarding.test.ts:59`).
4. Fake ctx: `cwd` = the temp root, complete `localProtocolOptions`, `sessionManager.getEntries`,
   `setInterval`/`clearTimer` (`room-tool.test.ts:321-341`).
5. Assert the model-facing `content` array for anything the model reads — `details` never reaches
   it (the K1 block at `room-tool.test.ts:786-799` explains the defect that gap hid).
6. Prefer structural stores (`attention.test.ts:56-64`) for pure logic; use a real store over a real
   temp root when the JSONL, cursors or registry are under test.
7. Don't add wall-clock waits; if the job under test is a host-owned timer, the e2e sweep test is
   the precedent and should be the exception (`e2e-room.test.ts:359-380`).
8. **A test that needs the GLOBAL room store must run in a child `bun` process.**
   `getSessionsDir()` resolves its XDG base once, at module load (pi-utils keeps a module-level
   `DirResolver` singleton), so a test process cannot redirect the global store by setting
   `process.env.XDG_DATA_HOME` — and other plugin test files import pi-utils first, so the
   resolver already holds the real HOME. Spawn a child with a fresh env
   (`XDG_DATA_HOME=<temp>` **plus** a `<temp>/omp` app dir, because the host only honours the XDG
   base when that dir exists) and a project cwd **outside** `os.tmpdir()`. The precedent is
   `plugin/tests/room-root-e2e.test.ts` — one shared child run, an explicit 120 s timeout, and a
   marker line parsed out of stdout.
9. **Never point a test at the user's real room store.** A project under `os.tmpdir()` stays
   project-local on purpose (`plugin/src/store/room-root.ts:54-57`); a test with a non-temp cwd
   would write into `~/.omp/agent/sessions/rooms/<hash>` and pollute the user's own room.
