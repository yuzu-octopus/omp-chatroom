# `plugin/src/**` — architecture, data flow, conventions

Slice: everything under `plugin/src/`. Companion: `docs/research/omp-agent-notes/config.md`
(build/config surface).

> **Delivery note.** The file now lives at `docs/research/omp-agent-notes/src.md` (it was
> originally authored as `local://src.md` and moved into place). Companion:
> `docs/research/omp-agent-notes/config.md` (build/config surface).
>
> **Verification note (refreshed 2026-10-20).** The original investigation had no local shell
> device (the only bash tool was a remote Composio sandbox that cannot see this filesystem), so
> every claim came from reading the source. This refresh re-checked every file:line anchor and
> every count against the current tree. The current gate numbers are **274 pass / 0 fail, 3398
> assertions, 15 files**, 0 tsc errors and a clean Biome pass over 51 files — orchestrator-verified,
> not re-run here. `plugin/src/**` now holds **35** `.ts` files.

---

## 1. Module layout

```
plugin/src/                      (35 .ts files)
  index.ts            default-export extension factory: 9 registerX calls + warnOnHostDrift
  version.ts          HOST_VERSION_PIN ("18.12.3"), DEEP_SPECIFIERS (9), assertHostVersion
  globals.ts          globalMap<K,V>(key) — the globalThis anchor for every process-wide registry
  ids.ts              roomIdFor / roomDirNameFor / logPathFor / resourceKey / newMessageId
  env.d.ts            ambient declarations
  store/              room-store, room-root, log, claims, config, cursors, schema, tree-store, compactor
  attention/          tiers (classify), governor (caps/budgets/coalescing), delivery (deliver, sendBounded)
  cards/              message-cards, tool-cards, body-lines — transcript renderers
  panel/              panel, board-pane, chat-pane, roster-strip, chrome, host-theme, keys — TUI overlay
  commands/           room-command — the /room slash command
  tools/              room, wait-for-claim, wait-for-agent, wait-for-message
  onboarding/         digest, hook, escape, routing-rule.md
```

Cross-module identity rules that the code states explicitly:

- `MemberState` and `Tier` are each **declared once** and imported everywhere —
  `MemberState` in `plugin/src/store/room-store.ts:13-25` (comment: "K11 — MemberState is declared
  ONCE, here (the store owns it)"), `Tier` in `plugin/src/attention/tiers.ts:4` (comment: "K11 —
  Tier is declared ONCE, here"). Never redeclare either.
- Runtime cycles are broken with **type-only imports**: `store/claims.ts:2` imports
  `RoomStore` as type-only with the comment "type-only — breaks the runtime cycle"; the same
  pattern is in `store/cursors.ts:2`, `store/compactor.ts:5`, `attention/governor.ts:2`,
  `panel/chat-pane.ts:10`, `panel/panel.ts:16`.

## 2. Entry point

`plugin/src/index.ts` — a single default-export factory called by the host:

```ts
export default function roomExtension(pi: ExtensionAPI): void {   // index.ts:18
  warnOnHostDrift(pi);       // version.ts gate — WARNS, never throws (index.ts:40-47)
  registerRoomFlags(pi);        // store/config.ts   — --room-panel-key (the ONLY flag)
  registerRoomTool(pi);         // tools/room.ts     — the `room` tool, 12 ops
  registerWaitForClaim(pi);     // tools/wait-for-claim.ts
  registerWaitForAgent(pi);     // tools/wait-for-agent.ts
  registerWaitForMessage(pi);   // tools/wait-for-message.ts
  registerRoomCommand(pi);      // commands/room-command.ts — /room + subcommands
  registerMessageRenderers(pi); // cards/message-cards.ts  — registerMessageRenderer
  registerPanel(pi);            // panel/panel.ts           — shortcut + overlay
  registerHooks(pi);            // onboarding/hook.ts       — before_agent_start,
                                //                             session_shutdown, turn_start
}
```

(exact call list: `plugin/src/index.ts:18-29`)

- Order matters only in that flags are registered first so config resolution sees them.
- **`--room-cold-tree` is GONE.** It was registered but never read; `registerRoomFlags`
  (`plugin/src/store/config.ts:114-120`) now registers only `room-panel-key`. `coerceConfig`
  ignores unknown config keys, so an old `config.json` carrying `coldTreeEnabled` needs no
  migration (`plugin/src/store/config.ts:22-24, 59-80`).
- **`warnOnHostDrift` warns, never throws** (`plugin/src/index.ts:31-47`): it compares the host's
  own `VERSION` export against `HOST_VERSION_PIN` and calls `pi.logger.warn` on a mismatch —
  "a room that still works is worth more than a plugin that refuses to load". Do not "fix" it into
  a throw.
- `index.ts:49-56` exports `__roomTest.store.reset()` — the **test-only seam**; it calls
  `resetRoomStores()`. Never call it from production code.
- The room tool is `loadMode: "essential"` (`tools/room.ts:57, 639`) so it stays top-level in the
  model's tool array; the three wait tools are likewise `"essential"` (`wait-for-claim.ts:218`,
  `wait-for-agent.ts:227`, `wait-for-message.ts:218`).

## 3. Store data model

`RoomStore` interface: `plugin/src/store/room-store.ts:27-57`.

### 3.1 The append-only JSONL log

- One file per room: `<root>/room/<roomId>.jsonl` (`plugin/src/ids.ts:11-14`, `K14`).
- `roomId` is `"r" + sha256(root)[0..16]` — **root-stable, never a session id**
  (`plugin/src/ids.ts:2-5`, `K7/X1`). Re-resolved at open from the config override first
  (`store/config.ts:99-110`).
- File descriptors are held open per log path, `O_RDWR|O_CREAT|O_APPEND|O_CLOEXEC`
  (`plugin/src/store/log.ts:132-148`).
- Every write is a **synchronous** `fs.writeSync` loop followed by `fs.fsyncSync`
  (`plugin/src/store/log.ts:81-95`). The comment states why: "O_APPEND makes the write atomic,
  but only fsync makes it durable … I5 claims each append survives one."
- `replay()` skips malformed/torn lines and **continues** (`plugin/src/store/log.ts:114-138`) — a torn
  line emits one `gap` record whose `seq` is the preceding record's seq, so it never consumes a
  number and cannot shift later cursors (`M-2`).
- The log file is **never truncated**; retention prunes the in-memory projection only.
- **The fd open takes the single-writer lock** (`plugin/src/store/log.ts:66-79` → `acquireRoomLock`,
  `log.ts:25-54`). A second omp process on the same root gets
  `room file locked by pid N`, mapped by `openRoomLog` to `room file locked by another session`
  (`log.ts:264-273`) — a normal result, never a crash.

### 3.2 The in-memory projection

- `records: RoomRecord[]` + `byId: Map<string, RoomRecord>`; `seq` is the highest seq written or
  replayed, the next append mints `seq + 1` (`room-store.ts:32-35`, `:149-151`).
- `project(store, record)` (`room-store.ts:84-118`) folds each record into `members` / `claims` and
  runs **before** listeners fire, deliberately: "a listener woken by a promotion sees the grant it
  is reacting to". The `member` kind updates the roster map; `claim`/`release` update the claim map.
- Claim *arbiter rules* (TTL, staleness, waiter promotion) live in `store/claims.ts`, not in the
  projection.
- On first open the projection and claim state are rebuilt by replaying the whole log
  (`room-store.ts:202-211`, incl. `hydrateClaims(store, records)`).
- Retention: `logMaxRecords = 5 000`, `logMaxAgeMs = 604 800 000` (7 d)
  (`attention/governor.ts:32-33`).

### 3.3 Refcounted per-root registry + `globalMap`

Registries, all anchored on `globalThis` via `globalMap`
(`room-store.ts:60-67`; `globalMap` itself is `plugin/src/globals.ts:4-8`):

| Registry | Key | Purpose |
|---|---|---|
| `__roomStores` | absolute root | one `RoomStore` per room root (`room-store.ts:60`) |
| `__roomStoreRefs` | root | one ref per **live session**, not per call (`room-store.ts:66`) |
| `__roomSessions` | root | `Set<agentId>` that already hold a ref (`room-store.ts:67`) |
| `__roomSweepNotifiers` | root | the expiry notifier the main session registers (`room-store.ts:303`) |
| `__roomTimers` | root | the refcounted timer registry (`room-store.ts:355`) |

- `roomStoreFor(ctx)` dedupes by agent id — "One ref per session: a repeat call from the same agent
  must not bump the refcount again" (`room-store.ts:245-250`).
- `dispose()` decrements; on the last ref it stops the timers, stops the compactor, closes the
  shared fd, and evicts the root (`room-store.ts:180-190`). `session_shutdown` calls
  `disposeRoomSession(ctx)`, never `store.dispose()` directly
  (`onboarding/hook.ts:112-118`).
- The same `globalMap` pattern backs other process-wide state: `__roomLogFds`
  (`store/log.ts:11`), `__roomCompactors` (`store/compactor.ts:295`), `__roomCompactionSpend` and
  `__roomCompactionMutex` (`store/compactor.ts:43, 111`), `__roomTreeReady`
  (`store/tree-store.ts:133`), and `__roomDeliveryChain` (`tools/room.ts:383`).
- **Every one of these is keyed by the room ROOT, not by a process-wide constant.** The
  compactor's daily spend cap and its write mutex are **per room root**
  (`plugin/src/store/compactor.ts:36-52, 106-122`) — a busy room must not starve another room's
  budget, and two rooms must not share one mutex (invariant I7, `AGENTS.md:139`).
- Background jobs run **from the main session only** — a tick scheduled on a subagent dies with
  that subagent's `session_shutdown` (`room-store.ts:251-254`, `compactor.ts:300-317`).

### 3.4 The room root is the GLOBAL omp session store — not the project directory, not `local://`

`plugin/src/store/room-root.ts` owns this. `rootOf(ctx)` (`room-store.ts:228-235`) is now a
one-liner that delegates to `roomRootFor(ctx)` (`room-root.ts:54-57`):

```ts
export function roomRootFor(ctx: ExtensionContext): string {
  const cwd = ctx.cwd;
  if (isUnderTemp(cwd)) return legacyRoomRoot(cwd);   // temp-dir project → project-local
  return globalRoomRoot(cwd);                          // everything else → global store
}
```

- **Global root** = `getSessionsDir()/rooms/<16 hex of sha256(project path)>`
  (`room-root.ts:30-32`; the leaf is `roomDirNameFor`, `plugin/src/ids.ts:6-10`). `getSessionsDir()`
  is `~/.omp/agent/sessions`, or `$XDG_DATA_HOME/omp/sessions` when `XDG_DATA_HOME` is set **and**
  `$XDG_DATA_HOME/omp` exists (host rule: `plugin/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:389-403,
  429-434`).
- **The directory leaf is NOT the room id.** The id is minted from the room **ROOT**
  (`roomIdFor`, `plugin/src/ids.ts:2-5`); the leaf is a hash of the **project path**. The two
  differ by design — do not assume they match (`room-root.ts:26-29`).
- **Exception 1 — a project under `os.tmpdir()` stays project-local** (`<cwd>/.omp-room`):
  "a test, a scratch task or a throwaway worktree must never write into the user's real room
  store" (`room-root.ts:50-53`).
- **Exception 2 — a legacy project-local room is migrated once**, on the first open of the target
  root (`migrateLegacyRoom`, `room-root.ts:77-146`, called from `room-store.ts:243`). It takes
  **BOTH** locks: a legacy room held by a **LIVE** process is left alone (that room belongs to
  that process), and the target's lock keeps two omp processes from copying into the same room.
  The copied log is named after the id the **TARGET** resolves, so a pinned `roomId` survives the
  move; the legacy directory is left in place and is **inert**.
- The reason the room is keyed on `ctx.cwd` at all has NOT changed: `ctx.localProtocolOptions` is
  per-*session*, so keying on it gave every agent a private room — "Verified live: main resolved
  `<session>/local` while its subagent resolved `<session>/Task1/local`"
  (`room-root.ts:41-49`).
- **A single-writer lockfile guards the root** — `<root>/room/.lock`, the owner's pid, created
  `O_CREAT|O_EXCL`, stale pids reaped (`plugin/src/store/log.ts:13-15, 25-63`). A second omp
  process on the same project fails loudly with `room file locked by pid N`; the open path maps
  it to `room file locked by another session` (`log.ts:264-273`). Subagents in the same process
  share one room and one lock.

## 4. Attention pipeline

### 4.1 `tiers.ts` — classification

`classify(record, viewer): "T0" | "T1" | "T2"` (`attention/tiers.ts:18`). Total over all six record
kinds, switch with no default (`K12`). Highlights:

- `msg`: `@mention` → T0; `replyTo === viewer.lastMessageId` → T0; held topic / followed topic /
  own thread root → T1; else T2 (`tiers.ts:22-31`).
- `release` is classified on **`prevHolder`**, never on `from` and never on `reason` — the `M11`
  rule; on a reclaim `from` is the *new* claimant, and `reason:"reclaimed"` is one record that
  cannot be targeted to a single viewer (`tiers.ts:8-16`, `:43`).
- Self-authored suppression is a **delivery-layer** concern, not a tier predicate (`tiers.ts:15`).
- `gap` → T1 always (a promised notify, `tiers.ts:52`).

### 4.2 `governor.ts` — caps, budgets, coalescing

`attention/governor.ts`:

- `Caps` / `DEFAULT_CAPS` (`:9-35`): `maxT1PerTurn 10`, `maxT1Tokens 2048`, `coalesceCount 20`,
  `coalesceMs 300 000`, `postsPerWindow 1`, `burstPosts 10`, `claimTtlMs 300 000`,
  `claimSweepMs 5 000`, `logMaxRecords 5 000`, `logMaxAgeMs 604 800 000`, `maxBodyBytes 8 192`,
  `compactionCallsPerDay 20 000`.
- `admitPost()` is an **srTCM** two-token-bucket per `(room, agent)` over a 2 s window, refilled at
  CIR (`:34-105`). `red` means coalesce the post, never drop it. Room posts only — T0 DMs are
  exempt (`:97`).
- `selectT1()` (`:145-193`) admits oldest-first up to K records **and** B tokens, then emits one
  `moreLine(...)` summary naming the resume point. The **first record is always admitted**
  (progress over a stall).
- `selectT0()` (`:38-51`) — T0 is never dropped: under `T0_COALESCE_CEILING = 50` every interrupt
  is injected; past it they batch into one digest interrupt carrying the count (`:30-34`).
- `coalescePending()` (`:203-218`) — one digest line once N T2 records are pending **or** the oldest
  has lagged T. No separate T2 timer.
- `isMuted()` (`:230-236`) — a muted topic never wakes/injects/counts as unread, **except** an
  explicit mention (which promotes to T0 and is therefore never muted). Sentinel `""` mutes the
  whole room.
- Per-turn K/B ledger is a `WeakMap<RoomStore, Map<string, TurnBudget>>` refilled by
  `resetTurnBudget()` from the `turn_start` hook (`:117-142`).

### 4.3 `delivery.ts` — the push path

`deliver(pi, ctx, target, record, tier, extra, cursorCap?)` (`attention/delivery.ts:67-156`):

1. **The cursor floor is computed first.** `const cap = cursorCap ?? record.seq`
   (`delivery.ts:83`) — the seq just below the oldest record this target still **OWES** (a T1 the
   K/B cap refused, or a T0 past the batch ceiling). **Every** cursor bump in `deliver()` is
   clamped to it: the T0/T1 path (`delivery.ts:144, 155`), the T2 path (`delivery.ts:106`) and the
   self-suppression path (`delivery.ts:95`). Without the floor a delivered record that sits ABOVE
   an owed one pushes the cursor past it, and `room{op:"read"}` (which starts at the cursor) could
   never return the owed record. `bumpCursor` is monotonic, so a later capped bump cannot pull the
   cursor back. This is invariant **I9** (`AGENTS.md:146`).
2. Actor-kind self-suppression: if `record.from === target`, bump the cursor (clamped) and return —
   an agent never gets its own action back (`delivery.ts:88-96`).
3. T2 is pull-only: cursor bump (clamped), return, never injected (`delivery.ts:98-108`).
4. Resolve the destination **before** deriving the payload; a parked/aborted ref is skipped without
   throwing (`delivery.ts:110-115`). Remote refs come from `AgentRegistry.global().get(target)` — a
   **process-wide singleton** (`delivery.ts:111`).
5. Dispatch on `record.kind` **first** and derive the body per kind (`roomBodyOf`, `:157-172`) —
   reading `record.body` before the dispatch is a runtime TypeError on exactly the T0 events
   ("your claim was revoked"), because `body` exists only on `msg`/`note` (`K2`, `:118-119`).
6. `renderLine()` (`:174-188`) builds `[T0] room ⟵ from · where · body`; content is escaped through
   `safeRoomText` → `escapeHarnessTags` (`:120`, `:190-192`).
7. T0 → `deliverAs: "steer"` **plus `triggerTurn: true`**; T1 → `deliverAs: "aside"`
   (`delivery.ts:129-140`). The `triggerTurn` is required: per the host rule at
   `agent-session.ts:8796-8798` ("Explicit `deliverAs` queues without starting a turn in either
   state"), an explicit `deliverAs` at an **IDLE** session only appends — no turn. The host checks
   `triggerTurn` before the idle fallthrough (`agent-session.ts:8758`) and starts a turn; the
   streaming branch ignores it and steers. A mention that does not wake the agent it names is a
   mention that does nothing.
8. **The send is BOUNDED, and that is load-bearing** (`delivery.ts:145-155` → `sendBounded`,
   `delivery.ts:38-64`, bound `SEND_ACCEPT_BOUND_MS = 250` at `delivery.ts:25`). The host's
   `sendCustomMessage` resolves when the **target's WHOLE TURN** ends, not when the message is
   accepted: at an idle session both `aside` and `steer` + `triggerTurn` go through
   `promptAgentInitiatedMessage`, which resolves only once the target's turn — every one of its
   tool calls — is over. Awaiting that inside a delivery pass **DEADLOCKS the room**: A's pass
   waits for B's turn, B's turn posts and waits for A's pass. The plugin only needs the message
   **accepted**, so the wait is bounded at 250 ms. The same bound applies to the board-delta
   `notice()` path (`tools/room.ts:333-337`).
   - A rejection **inside** the bound is returned to the caller, which rethrows it so the delivery
     pass reports it as `deliveryError` — and the cursor is NOT bumped (the record is still owed).
   - A rejection **after** the bound is swallowed (never an unhandled rejection).
   - A ctx without `ctx.setTimeout` gets the unbounded wait (a test double, not the host). A raw
     timer is forbidden (I4): the bound is cleared on every path.

### 4.3.1 The room mention IS a T0 that steers a running agent

The model-facing routing rule (`plugin/src/onboarding/routing-rule.md`) and the bundled skill
(`plugin/skills/omp-agent-chatroom/SKILL.md`) were both **corrected**: the stale claim that a room
mention does NOT steer a running agent was pushing directed corrections toward `agent://`. The
current rule states it plainly: "A **room mention is T0**: it wakes an idle agent (a real turn
starts) and steers a streaming one — the same steering queue a parent's `agent://<id>` message
uses, so neither aborts the running tool call; both land at the target's next step boundary."
The advantage of `agent://<id>` is **precision**, not strength. Do not "restore" the old wording.

### 4.4 How `room{op:"post"}` reaches `notifyRecipients`

`tools/room.ts:682-728`:

```
room{op:"post"}
 → validate topic/body; K19 body cap checked BEFORE drafting (never truncated silently)  (:683-688)
 → N7 truncateOversized for the T1 token budget → head + read handle                 (:689-698)
 → store.append({kind:"msg", ...})   ← the ONE write path; durable before anything else   (:701-711)
 → notifyRecipients(pi, ctx, store, [record], agentId)                                  (:713)
 → okWithDelivery({ok:true, op:"post", ...}, failure?)                                   (:714-721)
```

`notifyRecipients` (`tools/room.ts:358-382`) runs **after** the synchronous
append — "I1/I5: the log is already durable, so a delivery failure can only be reported, never
corrupt the record or throw out of `execute`". It **serialises PASSES per room root** through a
`globalThis` promise chain (`__roomDeliveryChain`, `tools/room.ts:365-382, 383`) so two agents
posting in the same tick cannot interleave their awaits (invariant **I8**,
`AGENTS.md:145`). Inside a pass, the **per-recipient deliveries run CONCURRENTLY**
(`Promise.all`, `tools/room.ts:398-408`): the recipients are independent of each other, so one
slow (or busy) recipient must not hold up the others, while the per-root order of passes and the
per-recipient order within a task are both preserved. Failures are reported in **recipient
order** (`tools/room.ts:409-415`) so the reported one does not depend on which transport lost the
race. Per recipient it does `classify → mute check → rate limit → deliver` inside a try/catch
that reports the first failure as `deliveryError` on `details`.

**`deliver()` has three call sites, not two**: `room.ts:465` (T0/T1 path), `room.ts:479` (T2
path) and **`onboarding/hook.ts:75`** — the sweep's promised T0 "your lease expired" notice.
Verified by grep over `plugin/src` for `deliver(`; the only other hits are the declaration
`attention/delivery.ts:67` and the imports. Everything else subscribes to the log via
`store.addListener`.

`notifyRecipients` has **nine** callers, not three: four in `tools/room.ts` (`post` `:713`,
`claim` `:744`, `release` `:775` and `:798`), four in `commands/room-command.ts` (`:253`, `:286`,
`:308`, `:340`) and one in `panel/panel.ts:421` (a fire-and-forget `.then()`). The command and
panel paths have **no `deliveryError` envelope**, which is why `notifyRecipients` must stay
throw-free — a throw there would surface as an unhandled rejection in the TUI
(`tools/room.ts:349-356`).

## 5. Invariants I1–I11 (enforcement sites)

| # | Invariant | Enforced at |
|---|---|---|
| **I1** | mutations are synchronous — mint, write, project, notify with **no await between** | `store/room-store.ts:149-168` (comment: "I1 — synchronous critical section"); `store/log.ts:81-95` (`writeSync` + `fsyncSync`) |
| **I2** | no session-scoped module state | state is keyed by root/agent inside `globalThis`-anchored maps: `room-store.ts:60-67, 303, 355`, `log.ts:11`, `compactor.ts:43, 111, 295`, `tree-store.ts:133`, `tools/room.ts:383` |
| **I3** | key by `ctx.agent.id` | `room-store.ts:245-250`, `onboarding/hook.ts:64`, `panel/panel.ts:29` ("its cursor drives unread marks (I3)") |
| **I4** | refcounted `ctx.setInterval`; never a raw timer | `compactor.ts:300-317` ("never a raw timer, whose throw would be process-fatal"; `if (clearTimer === undefined) return`), `room-store.ts:357-389`; timers registry `room-store.ts:355`. The delivery bound also uses `ctx.setTimeout`/`ctx.clearTimer`, never a raw timer (`delivery.ts:47-62`) |
| **I5** | synchronous append survives a crash | `log.ts:81-95` (`fsyncSync`, explicitly justified by I5); `onboarding/hook.ts:112-118` |
| **I6** | every wait promise settles | `tools/wait-for-claim.ts:147-190` ("Never throws and always settles (I6): signal, timeout and every promotion path call `finish`"), `wait-for-agent.ts`, `wait-for-message.ts` (all release in `finally`) |
| **I7** | the compactor's **daily spend cap and write mutex are per room root** — never process-global, or a busy room starves the other | `store/compactor.ts:36-52` (`__roomCompactionSpend`), `:106-122` (`__roomCompactionMutex`) |
| **I8** | delivery is **serialised per room root** — two concurrent posts reach a recipient in seq order | `tools/room.ts:358-382` (`__roomDeliveryChain`) |
| **I9** | a recipient's cursor **never advances past a record it has not seen** — the owed floor is applied to **every** cursor bump, not only the T2 one | `attention/delivery.ts:78-83, 95, 106, 144, 155`; the floor is computed in `tools/room.ts:450-457` |
| **I10** | the load-time host-drift check **warns**, it never throws — a working room beats a plugin that refuses to load | `index.ts:31-47` (`warnOnHostDrift`) |
| **I11** | a delivery never waits for the recipient's whole **turn** — the host's send resolves at the end of the *target's* turn, so every send is bounded (250 ms) | `attention/delivery.ts:25` (`SEND_ACCEPT_BOUND_MS`), `:38-64` (`sendBounded`), `:145-153`; `tools/room.ts:333-337` (the board-delta `notice`) |

## 6. Error handling and result contracts (K1)

- **Uniform result shape.** `content: [{type:"text", text}]` is **always** present — a result
  without it is coerced to an error by the host — plus `details` carrying `ok` and the structured
  payload. Typed as `RoomToolDetails` in `tools/room.ts:85-88` (comment: "K1 — the `details`
  payload. `ok` is always present; `outcome` only on the wait tools").
- **Payload lives in `details`, never as a bare top-level object** —
  `tools/wait-for-claim.ts:44-51`, `wait-for-message.ts:41-47` (comment: "K1 — payload inside
  `details`; `useless:true` sits on the result, not in `details`").
- **Timeouts are normal outcomes, not errors**: `details: { ok: true, outcome: "timeout", … }`
  paired with `useless: true` so compaction may elide them —
  `wait-for-claim.ts:74-86`, `wait-for-agent.ts:78-85, 88-94`, `wait-for-message.ts:78-85, 88-93`.
  `outcome` ∈ `"event" | "timeout" | "aborted"`.
- **Room failures are normal results, not throws.** Two guards, both needed:
  1. `execute` wraps `roomStoreFor` in try/catch and returns `fail(msg)` — "U6 — a
     missing/unwritable/corrupt room file returns a normal result, never a throw"
     (`tools/room.ts:648-652`; `fail` at `tools/room.ts:142-151`);
  2. **the WHOLE op switch is wrapped** in a try/catch that returns
     `fail(error.message ?? "room operation failed")` — "U6/K1 — a mutation that throws (the log
     write on a full disk, a corrupt tree) is a RESULT, never a throw out of `execute`: the host
     coerces a throwing tool into an error, and the room contract is a normal `{ok:false}`"
     (`tools/room.ts:961-966`). **Any new op inherits this guard — do not add a second escape
     path.**
  Unknown/missing args return `fail("post requires a topic")` etc. (`:683-684`, `:730-731`,
  `:766-767`).
- Delivery failure surfaces as `deliveryError` on `details`, never as a throw
  (`tools/room.ts:349-356, 495-499`). A rejection inside the 250 ms send bound is rethrown by
  `deliver()` and caught by the per-recipient try/catch; a rejection after the bound is swallowed
  inside `sendBounded` (`attention/delivery.ts:38-64`).
- `approval: "read"` and `strict: true` on all four tool registrations
  (`tools/room.ts:640-641`, and each wait tool).
- `interruptible` is **not** part of the typed `ToolDefinition`; it is declared on the literal, and
  the wait never relies on it for correctness — it observes `signal` and bounds its own timeout
  (`wait-for-claim.ts:224-226`, `wait-for-agent.ts:230-232`, `wait-for-message.ts:222-224`).
  Note the asymmetry: `wait_for_claim` is `interruptible: false`; the other two are `true`.

## 7. Conventions an editor must keep

7. **Never import `store/room-store` at runtime from a writer module** — that closes a cycle. Use
    the `append(draft)` method that is on the `RoomStore` interface (`room-store.ts:50-52`, `K15`).
8. **Every listener subscription must be unsubscribed in `finally`/`dispose`** — `addListener`
    returns the unsubscribe function (`room-store.ts:148-151`, comment `K10`).
9. **Never add a second escape path.** `src/onboarding/escape.ts` is "the ONE escaper for
    room-authored text that reaches the model" (`escape.ts:1-4`); `delivery.ts:122-124` delegates to
    it via `safeRoomText`, and `cards/message-cards.ts` escapes every rendered row. A body must not
    be able to forge a system tag.
10. **Panel `dispose()` must be idempotent**, opened from a slash command, guarded by `hasUI` and
     `ctx.mode === "tui"`; the `session_shutdown` closer is registered once per extension, not per
     open. `openRoomPanel` also works headlessly — with no UI it notifies or logs instead of
     opening, and never throws.
11. **Test seam**: `__roomTest.store.reset()` (`index.ts:49-56`) — call it between tests, never in
    production.
12. **Deep host imports are the exception.** Prefer root exports; `src/store/compactor.ts:2` even
    carries the comment "root export, NOT a deep import (K21/F3)". `DEEP_SPECIFIERS` lists **nine**
    wildcard-only subpaths (`src/version.ts:17-27`). The highest-risk one that is still imported
    is `pi-coding-agent/session/harness-tags` (security-critical escaping);
    `pi-tui/overlays/agent-hub-renderer` used to be listed but is **no longer imported** — it read
    the host `theme` singleton and took the panel down with it, so the roster strip now paints
    from the theme it is handed (`src/version.ts:10-16`). Do not re-add it. The pin is
    **`18.12.3`** (`src/version.ts:3`); `bun test tests/drift.test.ts` is the gate — see
    `docs/research/omp-agent-notes/config.md` §4.

## 8. The `room` tool's 12 ops

`RoomOp` (`tools/room.ts:60-72`), dispatched on `p.op` at `tools/room.ts:657`:
`join`, `read`, `post`, `claim`, `release`, `board`, `topics`, `mute`, `unmute`, `tree`, `zoom`,
`recall`.

Two subtleties worth knowing before editing:

- `join` idempotency requires the membership check **before** `viewerFor`, because `viewerFor`
  registers a fresh member as a side effect — checking after it is always false, so no
  `member{join}` record would ever be appended and the roster would stay empty forever
  (`tools/room.ts:658-664`).
- `read` shares the per-turn K/B budget with injection (`selectT1(..., {spend: true})`,
  `tools/room.ts:677-680`), so a `limit: 200` request can come back capped with `more: true` and
  the cursor advancing only over the records actually returned — nothing is skipped
  (`tools/room.ts:681-706`, `K20`).

## 9. Hooks

`registerHooks` (`onboarding/hook.ts:36-129`) registers three:

| Hook | Effect |
|---|---|
| `before_agent_start` | init/restore the cursor, inject the **static** routing rule into the system prompt (idempotent per agent — replaced, never appended), attach the volatile digest as a `room:digest` message **after** the cached prefix so it stays out of prompt cache, persist the cursor via `appendEntry` |
| `session_shutdown` | `unregisterSweepNotifier(roomRootFor(ctx))` (main sessions only) + `disposeRoomSession(ctx)` — unsubscribe + drop this session's ref; last ref closes the fd and evicts the root |
| `turn_start` | `resetTurnBudget(...)` — refills the per-turn K/B ledger |

The split is deliberate: the routing rule is byte-identical every turn so it stays in the prompt
cache; the digest is per-turn state (`hook.ts:41-48`, `:100-108`).

### 9.1 The routing rule is injected UNCONDITIONALLY, and the turn degrades to rule-only

`hook.ts:41-48` injects the rule **first and unconditionally** — "a broken room must never cost the
turn its instructions, only its digest". If `roomStoreFor(ctx)` throws (unwritable or corrupt
log), the hook logs it through `pi.logger.warn` ("F7 — the degradation must not be SILENT: an
agent that cannot see the room behaves as if it were alone in it") and returns
`{ systemPrompt }` with **no message** (`hook.ts:50-62`). So a broken room yields a **rule-only
turn**, not a failed one.

### 9.2 The expiry notice is handed to a notifier the main session registers

The claim sweep lives in the **store** layer, which cannot import the **delivery** layer (that
would close a cycle). So the sweep hands the expiry to a notifier:

- `SweepNotifier` / `ExpiredClaim` and the per-root registry `__roomSweepNotifiers`
  (`store/room-store.ts:294-317`), registered by `registerSweepNotifier(root, notifier)` and
  dropped by `unregisterSweepNotifier(root)`.
- The **main** session registers it in `before_agent_start`
  (`onboarding/hook.ts:67-85`): only the main session runs the sweep, so only the main session
  registers. The notifier delivers the promised T0 notice ("your lease expired") to the
  **displaced holder**, one claim at a time, each inside its own try/catch — "one dead target (a
  disposed session, a transport rejection) must not swallow the rest of the batch" (F4).
- The sweep timer returns the notifier's promise so the host's ManagedTimers isolates a rejection
  (`store/room-store.ts:373-380`).
- `session_shutdown` unregisters it (`hook.ts:115-117`) — "a dead session's notifier must not
  fire later: the sweep would deliver the T0 notice through a disposed session".

## 10. What is verified live against the host, and what is NOT

Verified live on **omp 18.12.3** (the pinned host) — the evidence table is
`AGENTS.md:204-232`:

- the plugin loads with **zero** plugin errors / warnings;
- the `room` tool works in a **real model turn** (`join` → `post` (`t1 · seq 2`) → `claim` → granted);
- the room data lands in the **global** store at `<sessions>/rooms/<16 hex of the project path>/room/`
  and **never** in the project directory;
- the legacy migration keeps the **room id** (the legacy record is preserved as seq 1, the legacy
  directory is left in place and inert);
- the `/room` panel **renders in a real pty** — `tmux` is **not** installed on this machine, so a
  raw `python pty.fork()` + `TIOCSWINSZ` driver was used (120x40);
- the XDG branch of `getSessionsDir()`: with `XDG_DATA_HOME` set **and** `$XDG_DATA_HOME/omp`
  existing it resolves to `$XDG_DATA_HOME/omp/sessions`; without that app dir it falls back to
  `~/.omp/agent/sessions`.

**Still NOT verified — do not claim otherwise:**

1. the **inline message cards in a real transcript**;
2. a **real model choosing to call the room unprompted** (a real turn was driven, but the model
   did not decide on its own to use the room);
3. **real-model summarisation quality** in the compactor (the suite uses a deterministic fake LLM);
4. **`wait_for_agent`'s happy `event` path** (only the schema rejection, the timeout and the abort
   are exercised).

The same four are listed in `docs/research/omp-agent-notes/tests.md` §6 and in `AGENTS.md:196-199`.
