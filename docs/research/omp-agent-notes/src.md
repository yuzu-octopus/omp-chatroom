# `plugin/src/**` — architecture, data flow, conventions

Slice: everything under `plugin/src/`. Companion: `local://config.md` (build/config surface).

> **Delivery note.** This subagent has no filesystem write device (`write` accepts only `xd://`
> devices and `local://` scratch), so this file is `local://src.md`, not
> `docs/research/omp-agent-notes/src.md`. The main agent must move it into place.
>
> **Verification note.** No local shell device was available (the only bash tool was a remote
> Composio sandbox that cannot see this filesystem). Every claim comes from reading the source;
> orchestrator-supplied pass counts are marked as such.

---

## 1. Module layout

```
plugin/src/
  index.ts            default-export extension factory: 9 registerX calls
  version.ts          HOST_VERSION_PIN, DEEP_SPECIFIERS, assertHostVersion
  globals.ts          globalMap<K,V>(key) — the globalThis anchor for every process-wide registry
  ids.ts              roomIdFor / logPathFor / resourceKey / newMessageId
  env.d.ts            ambient declarations
  store/              room-store, log, claims, config, cursors, schema, tree-store, compactor
  attention/          tiers (classify), governor (caps/budgets/coalescing), delivery (deliver)
  cards/              message-cards, tool-cards, body-lines — transcript renderers
  panel/              panel, board-pane, chat-pane, roster-strip, chrome, keys — TUI overlay
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
export default function roomExtension(pi: ExtensionAPI): void {   // index.ts:17
  registerRoomFlags(pi);        // store/config.ts   — --room-panel-key, --room-cold-tree
  registerRoomTool(pi);         // tools/room.ts     — the `room` tool, 11 ops
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

(exact call list: `plugin/src/index.ts:18-27`)

- Order matters only in that flags are registered first so config resolution sees them.
- `index.ts:31-38` exports `__roomTest.store.reset()` — the **test-only seam**; it calls
  `resetRoomStores()`. Never call it from production code.
- The room tool is `loadMode: "essential"` (`tools/room.ts:50`) so it stays top-level in the model's
  tool array; the three wait tools are likewise `"essential"` (`wait-for-claim.ts:221`,
  `wait-for-agent.ts:227`, `wait-for-message.ts:219`).

## 3. Store data model

`RoomStore` interface: `plugin/src/store/room-store.ts:27-57`.

### 3.1 The append-only JSONL log

- One file per room: `<root>/room/<roomId>.jsonl` (`plugin/src/ids.ts:6-9`, `K14`).
- `roomId` is `"r" + sha256(root)[0..16]` — **root-stable, never a session id**
  (`plugin/src/ids.ts:2-5`, `K7/X1`). Re-resolved at open from config override first
  (`store/config.ts:85-90`).
- File descriptors are held open per log path, `O_RDWR|O_CREAT|O_APPEND|O_CLOEXEC`
  (`plugin/src/store/log.ts:20-27`).
- Every write is a **synchronous** `fs.writeSync` loop followed by `fs.fsyncSync`
  (`plugin/src/store/log.ts:30-42`). The comment states why: "O_APPEND makes the write atomic,
  but only fsync makes it durable … I5 claims each append survives one."
- `replay()` skips malformed/torn lines and **continues** (`plugin/src/store/log.ts:60-64`) — a torn
  line emits one `gap` record whose `seq` is the preceding record's seq, so it never consumes a
  number and cannot shift later cursors (`M-2`).
- The log file is **never truncated**; retention prunes the in-memory projection only.

### 3.2 The in-memory projection

- `records: RoomRecord[]` + `byId: Map<string, RoomRecord>`; `seq` is the highest seq written or
  replayed, the next append mints `seq + 1` (`room-store.ts:32-34`, `:129-130`).
- `project(store, record)` (`room-store.ts:78-96`) folds each record into `members` / `claims` and
  runs **before** listeners fire, deliberately: "a listener woken by a promotion sees the grant it
  is reacting to". The `member` kind updates the roster map; `claim`/`release` update the claim map.
- Claim *arbiter rules* (TTL, staleness, waiter promotion) live in `store/claims.ts`, not in the
  projection.
- On first open the projection and claim state are rebuilt by replaying the whole log
  (`room-store.ts:191-199`, incl. `hydrateClaims(store, records)`).
- Retention: `logMaxRecords = 5 000`, `logMaxAgeMs = 604 800 000` (7 d)
  (`attention/governor.ts:25-26`).

### 3.3 Refcounted per-root registry + `globalMap`

Three registries, all anchored on `globalThis` via `globalMap`
(`room-store.ts:58-65`; `globalMap` itself is `plugin/src/globals.ts:4-8`):

| Registry | Key | Purpose |
|---|---|---|
| `__roomStores` | absolute root | one `RoomStore` per room root |
| `__roomStoreRefs` | root | one ref per **live session**, not per call |
| `__roomSessions` | root | `Set<agentId>` that already hold a ref |

- `roomStoreFor(ctx)` dedupes by agent id — "One ref per session: a repeat call from the same agent
  must not bump the refcount again" (`room-store.ts:225-229`).
- `dispose()` decrements; on the last ref it stops the timers, stops the compactor, closes the
  shared fd, and evicts the root (`room-store.ts:160-172`). `session_shutdown` calls
  `disposeRoomSession(ctx)`, never `store.dispose()` directly
  (`onboarding/hook.ts:73-78`).
- The same `globalMap` pattern backs other process-wide state: `__roomLogFds`
  (`store/log.ts:11`), `__roomCompactors` (`store/compactor.ts:255`), `__roomTreeReady`
  (`store/tree-store.ts:133`), `__roomTimers` (`room-store.ts:287`).
- Background jobs run **from the main session only** — a tick scheduled on a subagent dies with
  that subagent's `session_shutdown` (`room-store.ts:230-233`, `compactor.ts:257-268`).

### 3.4 The room root is `ctx.cwd + "/.omp-room"` — NOT `local://`

`room-store.ts:213-217`:

```ts
function rootOf(ctx: ExtensionContext): string {
  // … `ctx.cwd` is the project directory and is inherited by subagents, so it is the only stable
  // per-tree key. The `local://` protocol root is deliberately NOT used for the room.
  return `${ctx.cwd}/.omp-room`;
}
```

The reason is spelled out in the comment (`room-store.ts:205-212`): `ctx.localProtocolOptions` is
per-*session*, so deriving the room from it gave every agent a private room — verified live, main
resolved `<session>/local` while its subagent resolved `<session>/Task1/local`.

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

`deliver(pi, ctx, target, record, tier, extra)` (`attention/delivery.ts:11-79`):

1. Actor-kind self-suppression: if `record.from === target`, bump the cursor and return — an agent
   never gets its own action back (`:33-40`).
2. T2 is pull-only: cursor bump, return, never injected (`:42-47`).
3. Resolve the destination **before** deriving the payload; a parked/aborted ref is skipped without
   throwing (`:49-54`). Remote refs come from `AgentRegistry.global().get(target)` — a
   **process-wide singleton** (`:51`).
4. Dispatch on `record.kind` **first** and derive the body per kind (`roomBodyOf`, `:80-93`) —
   reading `record.body` before the dispatch is a runtime TypeError on exactly the T0 events
   ("your claim was revoked"), because `body` exists only on `msg`/`note` (`K2`, `:56-59`).
5. `renderLine()` (`:105-119`) builds `[T0] room ⟵ from · where · body`; content is escaped through
   `safeRoomText` → `escapeHarnessTags` (`:74`, `:122-124`).
6. T0 → `deliverAs: "steer"` (interrupt); T1 → `deliverAs: "aside"` (`:72`). Cursor is bumped after
   the send.

### 4.4 How `room{op:"post"}` reaches `notifyRecipients`

`tools/room.ts:508-545`:

```
room{op:"post"}
 → validate topic/body; K19 body cap checked BEFORE drafting (never truncated silently)  (:510-521)
 → N7 truncateOversized for the T1 token budget → head + read handle                 (:522-526)
 → store.append({kind:"msg", ...})   ← the ONE write path; durable before anything else   (:527)
 → notifyRecipients(pi, ctx, store, [record], agentId)                                  (:533)
 → okWithDelivery({ok:true, op:"post", ...}, failure?)                                   (:534)
```

`notifyRecipients` (`tools/room.ts:312-375`, comment at `:302-310`) runs **after** the synchronous
append — "I1/I5: the log is already durable, so a delivery failure can only be reported, never
corrupt the record or throw out of `execute`". Per recipient it does
`classify → mute check → rate limit → deliver` (`:353`, `:366`) inside a try/catch that reports the
first failure as `deliveryError` on `details`.

**`deliver()` is called only from `tools/room.ts`** — the two call sites are `room.ts:353` (T0/T1
path) and `room.ts:366` (T2 path). Verified by grep over `plugin/src` for `deliver(`: the only
other hit is the declaration `attention/delivery.ts:11`. Everything else subscribes to the log via
`store.addListener`.

`notifyRecipients` itself has exactly three callers, all in `tools/room.ts`: `post` (`:533`),
`claim` (`:564`), and `release` (`:615`).

## 5. Invariants I1–I6 (enforcement sites)

| # | Invariant | Enforced at |
|---|---|---|
| **I1** | mutations are synchronous — mint, write, project, notify with **no await between** | `store/room-store.ts:127-146` (comment: "I1 — synchronous critical section"); `store/log.ts:30-42` (`writeSync` + `fsyncSync`) |
| **I2** | no session-scoped module state | state is keyed by root/agent inside `globalThis`-anchored maps: `room-store.ts:58-65`, `log.ts:11`, `compactor.ts:255`, `tree-store.ts:133`, `room-store.ts:287` |
| **I3** | key by `ctx.agent.id` | `room-store.ts:224-229`, `onboarding/hook.ts:39`, `panel/panel.ts:34` ("its cursor drives unread marks (I3)") |
| **I4** | refcounted `ctx.setInterval`; never a raw timer | `compactor.ts:259-270` ("never a raw timer, whose throw would be process-fatal"; `if (clearTimer === undefined) return`), `room-store.ts:281-292`; timers registry `room-store.ts:287` |
| **I5** | synchronous append survives a crash | `log.ts:30-42` (`fsyncSync`, explicitly justified by I5); `onboarding/hook.ts:73-76` |
| **I6** | every wait promise settles | `tools/wait-for-claim.ts:96-100` ("Never throws and always settles (I6): signal, timeout and every promotion path call `finish`"), `wait-for-agent.ts:100-103`, `wait-for-message.ts:98-101` (all release in `finally`) |

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
- **Room failures are normal results, not throws.** `execute` wraps `roomStoreFor` in try/catch and
  returns `fail(msg)` — "U6 — a missing/unwritable/corrupt room file returns a normal result, never
  a throw" (`tools/room.ts:442-447`). Unknown/missing args return `fail("post requires a topic")`
  etc. (`:510`, `:512`, `:549-551`, `:585-587`, `:718`, `:741-742`).
- Delivery failure surfaces as `deliveryError` on `details`, never as a throw
  (`tools/room.ts:302-310, 368-370`).
- `approval: "read"` and `strict: true` on all four tool registrations
  (`tools/room.ts:430-433`, and each wait tool).
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
11. **Test seam**: `__roomTest.store.reset()` (`index.ts:31-38`) — call it between tests, never in
     production.
12. **Deep host imports are the exception.** Prefer root exports; `src/store/compactor.ts:2` even
     carries the comment "root export, NOT a deep import (K21/F3)". The two highest-risk deep
     specifiers are `pi-tui/overlays/agent-hub-renderer` (the whole `overlays/` tree is
     wildcard-only) and `pi-coding-agent/session/harness-tags` (security-critical escaping)
     (`src/version.ts:5-8`). `bun test tests/drift.test.ts` is the gate — see
     `local://config.md` §4.

## 8. The `room` tool's 11 ops

`RoomOp` (`tools/room.ts:52-53`), dispatched on `p.op` at `tools/room.ts:448`:
`join`, `read`, `post`, `claim`, `release`, `board`, `topics`, `mute`, `unmute`, `tree`, `zoom`,
`recall`.

Two subtleties worth knowing before editing:

- `join` idempotency requires the membership check **before** `viewerFor`, because `viewerFor`
  registers a fresh member as a side effect — checking after it is always false, so no
  `member{join}` record would ever be appended and the roster would stay empty forever
  (`tools/room.ts:449-453`).
- `read` shares the per-turn K/B budget with injection (`selectT1(..., {spend: true})`,
  `tools/room.ts:476-479`), so a `limit: 200` request can come back capped with `more: true` and
  the cursor advancing only over the records actually returned — nothing is skipped
  (`:481-505`, `K20`).

## 9. Hooks

`registerHooks` (`onboarding/hook.ts:32-95`) registers three:

| Hook | Effect |
|---|---|
| `before_agent_start` | init/restore the cursor, inject the **static** routing rule into the system prompt (idempotent per agent — replaced, never appended), attach the volatile digest as a `room:digest` message **after** the cached prefix so it stays out of prompt cache, persist the cursor via `appendEntry` |
| `session_shutdown` | `disposeRoomSession(ctx)` — unsubscribe + drop this session's ref; last ref closes the fd and evicts the root |
| `turn_start` | `resetTurnBudget(...)` — refills the per-turn K/B ledger |

The split is deliberate: the routing rule is byte-identical every turn so it stays in the prompt
cache; the digest is per-turn state (`hook.ts:55-58`, `hook.ts:70-75`).
