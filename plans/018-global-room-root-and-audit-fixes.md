# Plan 018: Re-pin the host to 18.12.3, move the room root into the global session store, and land the audit fixes

> **Executor instructions**: This round is **DONE** (commits `3ae3a0a`, `1171efe`, `8e0719a`,
> 2026-10-19, plus `6054dd7`, `bef5775` and `d859250` on 2026-10-20). The plan is kept in the
> index as the record of what changed and which test pins each item. Anyone re-running part of it
> must run every verification command and confirm the expected result, and must update the status
> row for this plan in `plans/README.md`.
>
> **This round continued after the first pass.** The first pass (items 1–3) landed on 2026-10-19
> against host 18.12.2. A hostile audit of those three commits then found a **P0 deadlock** in the
> delivery serialisation (item 4) and four further audit findings (item 5); the live host moved
> to 18.12.3 mid-round, so the pin moved with it (item 1).
>
> **Drift check (run first)**: `git diff --stat 3ae3a0a^..HEAD -- plugin/src/store/room-root.ts plugin/src/version.ts plugin/package.json`
> If any of those files changed since this plan was written, compare the "Current state" facts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (the room root moves — a wrong root orphans an existing room)
- **Depends on**: none
- **Category**: migration + hardening
- **Planned at**: 2026-10-19, host 18.12.2 (the pin moved again to **18.12.3** mid-round; see item 1)

## Why this matters

Three separate problems were live at once — and two more surfaced after the first pass landed:

1. **The host pin had drifted.** The plugin pinned omp 18.10.3 while the installed global host had
   moved on. Every deep subpath the plugin imports (`DEEP_SPECIFIERS`, nine of them) is
   wildcard-only, not public API, so a host bump can move or delete one with no semver signal.
   The plugin also imported `@oh-my-pi/pi-utils` from eight source files while the package was
   **not declared at all**.
2. **The room lived in the user's project tree.** `<cwd>/.omp-room` put a runtime directory in
   every project — it has to be gitignored, it collides with a user's own `.omp-room`, and it is
   not where the host keeps anything else. The room belongs in the global omp session store.
3. **A read-only review of `plugin/src` found a dozen defects** — unescaped room-authored strings
   reaching the model, a tool that could throw, a cursor that could skip an unseen record, and two
   pieces of process-global state (the compactor's spend cap and its write mutex) that should have
   been per room root.
4. **The delivery serialisation introduced a P0 deadlock.** The host's `sendCustomMessage` resolves
   when the **target's entire turn** ends, so awaiting it inside a delivery pass waited for the
   recipient's whole turn — and the recipient's turn posts to the room, whose pass waits for the
   first pass. One stuck pass hung every agent in the tree (item 4).
5. **Four more audit findings** — a notifier that could swallow a batch, a migration with no lock
   discipline, a copied log that could be orphaned by a pinned id, and a broken room that degraded
   silently (item 5).

## Current state (before this round)

Verified at plan time; re-verify each fact against the live tree before touching anything.

1. `plugin/src/version.ts:4`: `export const HOST_VERSION_PIN = "18.10.3";`
2. `plugin/package.json`: `@oh-my-pi/pi-coding-agent`, `pi-tui`, `pi-ai` at `18.10.3` in both
   `peerDependencies` and `devDependencies`; **no `pi-utils` entry at all**.
3. The room root was `<cwd>/.omp-room`, resolved by `rootOf()` in `plugin/src/store/room-store.ts`.
4. `plugin/src/store/compactor.ts` held the daily spend counter and the write mutex as **module
   variables** — one budget and one mutex for every room in the process.
5. `plugin/src/attention/delivery.ts` `renderLine()` interpolated `record.from`, `record.topic`
   and `record.resource` into the model-facing line **unescaped**.
6. `plugin/src/tools/room.ts` `execute()` ran the op switch with no `try`/`catch`, so a throwing
   mutation escaped the tool; its `fail()` interpolated the caller's resource and holder
   unescaped.
7. `plugin/src/onboarding/hook.ts` built the digest **before** injecting the routing rule, so a
   broken room cost the turn its instructions.
8. `plugin/src/store/claims.ts` `reclaimIfStale()` returned the promoted claim or `null`, so a
   successful reclaim was indistinguishable from "not stale" and was reported to the agent as
   `denied — not holder`.
9. The claim-expiry sweep ran in the store layer, which cannot import the delivery layer, so the
   promised T0 expiry notice was never delivered.
10. `deliver()` bumped the cursor to `record.seq` for a T2 record, which could advance it past a
    record the recipient had not seen.
11. `notifyRecipients()` ran one delivery pass per post with no serialisation, so two posts in
    the same tick could reach a recipient out of seq order.
12. `recall` only checked its 1 s scan deadline *between* records, so a catastrophic-backtracking
    pattern (`(a+)+`) could hang the tool for minutes.

Repo verification commands: `bunx --bun tsc --noEmit -p tsconfig.json`, `bun test tests/`,
`bunx --bun @biomejs/biome check src tests`, all from `plugin/`. Runtime is Bun; never
node/npm/npx.

## Scope

**In scope** (the only files this round changed):

- `plugin/package.json`, `plugin/bun.lock`, `plugin/src/version.ts`, `plugin/src/index.ts`
- `plugin/src/ids.ts`, `plugin/src/store/room-root.ts` (new), `plugin/src/store/room-store.ts`
- `plugin/src/attention/delivery.ts`, `plugin/src/tools/room.ts`,
  `plugin/src/tools/wait-for-claim.ts`, `plugin/src/tools/wait-for-message.ts`,
  `plugin/src/commands/room-command.ts`, `plugin/src/onboarding/hook.ts`,
  `plugin/src/store/claims.ts`, `plugin/src/store/compactor.ts`
- `plugin/tests/room-root.test.ts` (new), `plugin/tests/attention.test.ts`,
  `plugin/tests/room-tool.test.ts`, `plugin/tests/tree.test.ts`
- `plugin/tests/room-root-e2e.test.ts` (new), `plugin/tests/onboarding.test.ts` — added with
  items 4 and 5
- `AGENTS.md`, `docs/research/omp-agent-chatroom/HANDOFF.md`, `plans/README.md`, this plan

**Out of scope**:

- Any change to the room's log format, seq semantics, or the attention tiers.
- The panel, the cards, and the wait tools' behaviour (only their escaping helper was unified).
- `docs/research/**` beyond `HANDOFF.md` — the rest is a historical record.

## Item 1 — the host re-pin (18.10.3 → 18.12.2, then → 18.12.3)

**Files touched**

| File | Change |
|---|---|
| `plugin/package.json` | `peerDependencies` + `devDependencies`: `pi-coding-agent`, `pi-tui`, `pi-ai` → `18.12.2`; **`@oh-my-pi/pi-utils` added to both blocks at `18.12.2`** (it was imported by eight source files while undeclared) |
| `plugin/bun.lock` | regenerated by `bun install` (never hand-edited) |
| `plugin/src/version.ts` | `HOST_VERSION_PIN = "18.12.2"` |
| `plugin/src/index.ts` | new `warnOnHostDrift(pi)` — reads the host's own `VERSION` export and `pi.logger.warn`s when it differs from the pin. It **warns; it does not throw** (a room that still works beats a plugin that refuses to load, and the deep imports are wildcard-only) |

**Test that pins it**: `plugin/tests/drift.test.ts` — "the installed host version equals
HOST_VERSION_PIN (X6/R34)" and "the GLOBAL host (production) matches HOST_VERSION_PIN when one is
installed" (skips gracefully where no global install exists). The load-time warning itself is
**not** test-pinned — it is a code-only change.

### The second bump — 18.12.2 → 18.12.3

The live host moved to **18.12.3** during the round, so the pin moved with it. The drift gate
caught the move: its production leg (the global install) failed loudly, which is exactly what it
is there for.

**Files touched**

| File | Change |
|---|---|
| `plugin/package.json` | `peerDependencies` + `devDependencies`: all four `@oh-my-pi/*` packages → `18.12.3` |
| `plugin/bun.lock` | regenerated by `bun install` (never hand-edited) |
| `plugin/src/version.ts` | `HOST_VERSION_PIN = "18.12.3"` |

**Test that pins it**: the same `plugin/tests/drift.test.ts` — the pin and the global install are
asserted against the same constant, so the second bump is covered by the same test.

**The gate is green on 18.12.3**: `tsc` 0 errors, `biome` clean over 51 files, and
`bun test tests/` → 274 pass / 0 fail / 3398 assertions / 15 files.

## Item 2 — the room root moves into the global omp session store

**Files touched**

| File | Change |
|---|---|
| `plugin/src/store/room-root.ts` (new) | `legacyRoomRoot(cwd)` = `<cwd>/.omp-room`; `globalRoomRoot(cwd)` = `getSessionsDir()/rooms/<16 hex of the project path>`; `roomRootFor(ctx)` picks between them; `migrateLegacyRoom(legacyRoot, targetRoot)` copies a legacy room in once |
| `plugin/src/ids.ts` | new `roomDirNameFor(cwd)` — the 16-hex directory leaf, derived from the **project path** |
| `plugin/src/store/room-store.ts` | `rootOf()` now returns `roomRootFor(ctx)`; `roomStoreFor()` runs `migrateLegacyRoom()` on the first open of a root |

**The rules the code implements**

- The room lives at `getSessionsDir()/rooms/<16 hex of the project path>` — `~/.omp/agent/sessions`
  (or `$XDG_DATA_HOME/omp/sessions`) — so it never lands in the user's working tree.
- **A project under the system temp dir stays project-local** (`<cwd>/.omp-room`): a test, a
  scratch task or a throwaway worktree must never write into the user's real room store.
- **A legacy `<cwd>/.omp-room` is copied into the global store once**, on the first open of the
  target root. The legacy `config.json` travels with the log, so the pinned `roomId` survives the
  move; a legacy room with no config has its log renamed to the id the target would mint. The
  migration never clobbers a target that already holds a log, and the old directory is left in
  place (inert). The copy takes **both** rooms' locks and names the copied log after the id the
  **target** resolves — both hardened in item 5.
- The **directory leaf is a hash of the project path**, while the **room id is minted from the
  room root** (`ids.ts` `roomIdFor`). They differ by design and never have to agree.

**Test that pins it**: `plugin/tests/room-root.test.ts` (new, 13 tests — the five lock and naming
tests arrive with item 5) — a project outside the temp dir resolves to the global store; a project
under the temp dir stays project-local; two projects never share a room and one project always
maps to the same room; the global root sits under omp's session store and its leaf is a hex hash;
the migration copies the log and the config and keeps the pinned room id; the migration never
clobbers an existing log; a legacy room without a config is renamed to the target's id; the
migration is a no-op without a legacy room and for an identical source and target; the migration
skips a legacy room a live process still holds; it does not copy into a target a live process
holds; it leaves no lock behind; and it names the copied log after the id the target resolves.

**End-to-end**: `plugin/tests/room-root-e2e.test.ts` (new) — see the test plan for what it proves
and why it needs a child process.

## Item 3 — the audit fixes

Every item below is a defect from the read-only review of `plugin/src`. "Files touched" lists the
source files; "Test that pins it" names the test — where no test exists, the item is marked
**code-only** and must not be described as verified.

| # | Fix | Files touched | Test that pins it |
|---|---|---|---|
| a | The delivery line escapes `record.from`, `record.topic` and `record.resource` — a topic name could otherwise close the digest's harness region and forge a block in the recipient | `plugin/src/attention/delivery.ts` (`renderLine`) | `plugin/tests/attention.test.ts` — "the delivery line escapes a hostile topic name (K22/S1)", "the delivery line escapes a hostile resource name" |
| b | The tool's failure text escapes the caller's resource and holder | `plugin/src/tools/room.ts` (`fail`) | **code-only** |
| c | The whole op switch is wrapped: a throwing mutation returns `{ok:false}` instead of throwing out of `execute` | `plugin/src/tools/room.ts` (`execute`) | `plugin/tests/room-tool.test.ts` — "a throwing mutation is a result, never a throw out of the tool" |
| d | The routing rule is injected **unconditionally and first**; a broken room degrades to a rule-only turn (it never costs the turn its instructions) | `plugin/src/onboarding/hook.ts` | `plugin/tests/onboarding.test.ts` — "the routing rule is present in full in the system prompt regardless of digest size", "the routing rule stays in the system prompt exactly once" (the degraded path itself is **code-only**) |
| e | The compactor's daily spend cap **and** its write mutex are keyed per room root, not per process — a busy room could starve another room's budget and block its writes | `plugin/src/store/compactor.ts` (`SPEND`, `MUTEX`, `compactionSpendToday(root)`, `withWriteMutex(root, …)`) | `plugin/tests/tree.test.ts` — "the write mutex is per room root (I2): one room's queue never blocks another's" |
| f | The compactor's interval callback **returns** its promise, so the host's ManagedTimers isolates a rejection instead of letting it escape unhandled | `plugin/src/store/compactor.ts` (`startCompactor`) | **code-only** |
| g | `reclaimIfStale()` returns `{reclaimed, holder, prevHolder}`, so a successful reclaim is no longer reported to the agent as `denied — not holder` | `plugin/src/store/claims.ts`, `plugin/src/commands/room-command.ts` | `plugin/tests/room-tool.test.ts` — "a release of a stale claim held by someone else reports the reclaim, not a denial" |
| h | The claim-expiry sweep hands the expiry to a registered notifier, which the main session registers to deliver the promised T0 notice | `plugin/src/store/room-store.ts` (`registerSweepNotifier`), `plugin/src/store/claims.ts` (`expireStale` now returns the record), `plugin/src/onboarding/hook.ts` | `plugin/tests/room-tool.test.ts` — "the claim sweep hands the expiry to the registered notifier" |
| i | A recipient's cursor never advances past a record it has not seen — the owed floor is computed in the delivery pass (`deliverPass`, run by `notifyRecipients`) and passed to `deliver()` | `plugin/src/attention/delivery.ts` (`deliver(…, cursorCap)`), `plugin/src/tools/room.ts` (`owedFloor`) | `plugin/tests/attention.test.ts` — "the cursor never advances past a record the recipient has not seen" |
| j | Delivery is serialised per room root, so two concurrent posts reach a recipient in seq order | `plugin/src/tools/room.ts` (`DELIVERY_CHAIN`) | `plugin/tests/attention.test.ts` — "two posts deliver in seq order to the same recipient" |
| k | `recall` refuses a pattern with a quantifier over a quantified group (`(a+)+`) instead of relying on the between-records scan deadline | `plugin/src/tools/room.ts` (`NESTED_QUANTIFIER`) | `plugin/tests/room-tool.test.ts` — "recall: a catastrophic regex is refused up front, never run", "recall: an ordinary pattern still scans the log" |
| l | The two wait tools use the shared `safeRoomText` escaper instead of their own copies | `plugin/src/tools/wait-for-claim.ts`, `plugin/src/tools/wait-for-message.ts` | covered by the existing escaping suites; the consolidation itself is **code-only** |

## Item 4 — the P0 delivery deadlock

A hostile audit of the three commits above found a **P0 DEADLOCK** in the delivery serialisation
(item 3j). The host's `session.sendCustomMessage` resolves when the **target's entire turn** ends
— the host's own doc says "explicit `deliverAs` queues without starting a turn in either state;
`aside` at an idle session instead starts a turn" — so `await sendCustomMessage(...)` inside a
delivery pass waited for the recipient's whole turn. The recipient's turn calls
`room{op:"post"}`, whose own pass waited for the first pass. That cycle hung every agent in the
tree, because the room root is shared by the main session and every subagent it spawns.

| # | Fix | Files touched | Test that pins it |
|---|---|---|---|
| a | **The send is bounded.** `sendBounded(ctx, send)` races the send against a `ctx.setTimeout` deadline (`SEND_ACCEPT_BOUND_MS = 250`) — the plugin only needs the message *accepted*, and the host accepts it as soon as it is queued into the target's session. A rejection **inside** the bound still propagates and surfaces as the tool result's `deliveryError` (the cursor is left alone, so the record stays owed); when the bound expires the message counts as accepted and the cursor advances. The bound is a deadline, not a job: it is cleared on every path (a raw timer is forbidden, I4), and a rejection that arrives *after* the bound is swallowed — never an unhandled rejection | `plugin/src/attention/delivery.ts` (`SEND_ACCEPT_BOUND_MS`, `sendBounded`, `deliver`), `plugin/src/tools/room.ts` (`notice`) | `plugin/tests/attention.test.ts` — "a post to an idle recipient does not wait for the target's turn", "a fast send rejection surfaces as deliveryError and leaves the record owed", "a send that rejects after the bound is swallowed, never an unhandled rejection" |
| b | **The per-recipient deliveries run concurrently.** Each recipient still gets its records in seq order, inside its own task, so one slow recipient cannot hold up the others. The per-root serialisation of *passes* (the `DELIVERY_CHAIN`) is untouched, and the store's cursor map is mutated synchronously, so the concurrent tasks never race on shared state | `plugin/src/tools/room.ts` (`deliverPass`, `deliverToTarget`) | `plugin/tests/attention.test.ts` — "a post to an idle recipient does not wait for the target's turn", "two posts deliver in seq order to the same recipient" |
| c | **The cursor floor applies to EVERY cursor bump** in `deliver()`, not only the T2 branch: no bump may cross the oldest record a recipient still OWES (a T1 the K/B cap refused, or a T0 past the batch ceiling), because `room{op:"read"}` starts at the cursor and could never return that record | `plugin/src/attention/delivery.ts` (`deliver(…, cursorCap)`), `plugin/src/tools/room.ts` (`owedFloor`, `cursorCap`) | `plugin/tests/attention.test.ts` — "a T0 delivery never pushes the cursor past a record the recipient still owes", "the cursor never advances past a record the recipient has not seen" |

## Item 5 — the four follow-up audit fixes

Four further findings from the same audit, all fixed.

| # | Fix | Files touched | Test that pins it |
|---|---|---|---|
| a | **The expiry notifier is per-item.** Each expired claim is delivered inside its own `try`/`catch`, so one failing transport can no longer swallow the rest of the batch, and the failure is logged instead of vanishing. The notifier is also unregistered on `session_shutdown`, so a dead session's notifier never fires later through a disposed session | `plugin/src/onboarding/hook.ts` (the sweep notifier, the `session_shutdown` handler), `plugin/src/store/room-store.ts` (`unregisterSweepNotifier`) | `plugin/tests/onboarding.test.ts` — "the expiry notifier delivers the whole batch when one delivery fails (F4)", "the expiry notifier is unregistered when the session shuts down (F4)" |
| b | **The migration takes BOTH locks.** The legacy room's lock says whether a live process still owns it — that room belongs to that process, so the migration is skipped and the legacy room is left alone. The target's lock keeps two omp processes from copying into the same room. Both locks are released again, so no stale pid is left in the user's project tree (a lock left behind would block a later downgrade to the project-local room) | `plugin/src/store/room-root.ts` (`migrateLegacyRoom`) | `plugin/tests/room-root.test.ts` — "migration skips a legacy room that a LIVE process still holds (F5)", "migration does not copy into a target that a LIVE process holds (F5)", "migration leaves no lock behind: the project tree is clean and the target opens (F5)" |
| c | **The copied log is named after the id the TARGET resolves** — the legacy config's `roomId` when it is a valid non-empty id, else the id minted from the target root. A log named after a different id would be copied into a file the target never reads, and the migrated history would be invisible | `plugin/src/store/room-root.ts` (`migrateLegacyRoom`) | `plugin/tests/room-root.test.ts` — "migration names the copied log after the id the TARGET resolves (F6)", "migration names the copied log after the target's minted id when the config pins none (F6)" |
| d | **The hook logs a broken room.** An agent that cannot see the room behaves as if it were alone in it, so the degradation is no longer silent: the failure is logged with `pi.logger.warn` and the error that caused it | `plugin/src/onboarding/hook.ts` | `plugin/tests/onboarding.test.ts` — "the hook logs a broken room instead of silently dropping the digest (F7)" |

## Test plan

- `bun test tests/` — **274 pass / 0 fail, 3398 assertions, 15 files** (was 233 / 13 before this
  round; the new files are `plugin/tests/room-root.test.ts` and `plugin/tests/room-root-e2e.test.ts`).
- `bunx --bun tsc --noEmit -p tsconfig.json` — 0 errors.
- `bunx --bun @biomejs/biome check src tests` — clean.
- `plugin/tests/drift.test.ts` — the pin, the global install and every deep specifier.
- `plugin/tests/room-root-e2e.test.ts` (new) — the global room root and the legacy migration, end
  to end. It spawns a **child bun process** with a fresh `XDG_DATA_HOME`, because
  `getSessionsDir()` resolves its XDG base **once, at module load** (pi-utils keeps a module-level
  `DirResolver` singleton): a test process cannot point the global store at a temp directory by
  setting `process.env.XDG_DATA_HOME`, because by the time the test runs the resolver already holds
  the real HOME — and other plugin test files import pi-utils first. The child also needs
  `$XDG_DATA_HOME/omp` to **exist**, because the host only honours the XDG base when that
  directory is there, and its project cwd must be **outside `os.tmpdir()`**, because the plugin
  deliberately keeps temp-dir projects project-local. The child proves that the room lands under
  `<XDG>/omp/sessions/rooms/<16 hex>/` and **not** in the project, and that a legacy project-local
  room is copied into the global room with the **same** room id. Its two tests share **one** child
  run, because importing the store pulls in the whole host module tree (~10 s of transpiling).

## Done criteria

- [x] `HOST_VERSION_PIN`, `package.json` (peer + dev) and `bun.lock` all name 18.12.3, and
      `@oh-my-pi/pi-utils` is declared in both dependency blocks.
- [x] The room root resolves to the global session store, with the temp-dir exception and the
      one-time legacy migration.
- [x] Every audit fix above is in the tree, and the ones with a test are named by it.
- [x] The P0 delivery deadlock is fixed: every send is bounded (250 ms), the per-recipient
      deliveries run concurrently, and the cursor floor applies to every cursor bump.
- [x] The four follow-up audit fixes are in the tree, each with its test.
- [x] `bun test tests/` → 274 pass / 0 fail / 3398 assertions / 15 files; `tsc` 0 errors;
      `biome` clean.
- [x] `AGENTS.md`, `docs/research/omp-agent-chatroom/HANDOFF.md` and `plans/README.md` state the
      new pin, the new room root, the new counts and what is still unverified.
- [x] The global room root and the legacy migration are **verified live** — a real omp session
      created, migrated into and used a room under `getSessionsDir()/rooms/<hash>` against host
      18.12.2 (see "Live verification (2026-10-20)" in `AGENTS.md` and `HANDOFF.md`).
- [ ] **Not done — a live run of the deadlock fix on 18.12.3.** The live verification above ran
      against 18.12.2, *before* the bounded send landed; the P0 fix and the 18.12.3 pin have not
      been re-verified in a real session.

## STOP conditions

- If the live host moves again before the re-pin lands, re-read the version facts first
  (the host has moved three minors in days).
- If a deep subpath fails to resolve at 18.12.3, **stop** — that is a migration, not a re-pin.
- If the legacy migration would clobber an existing global room, **stop**; the migration is
  required to be a no-op in that case.

## Maintenance notes

- The room id is minted from the **room root**, the directory leaf from the **project path**. If
  the root ever moves again, the id changes with it — a project that has been migrated once keeps
  its pinned id only because its `config.json` travels with the log.
- The temp-dir exception is a safety valve, not a preference: any test that creates a store
  outside `os.tmpdir()` will write into the user's real room store.
- The drift check warns, it does not throw. A future host bump should therefore be caught by
  `tests/drift.test.ts` (and by a human reading the warning), not by the plugin refusing to load.
- Every new piece of shared state must be keyed by the room root (I2 in `AGENTS.md`) — the
  compactor's spend cap, the compactor's write mutex and the delivery chain are the three that
  exist today.
- **Never `await` a host send without a deadline.** The host's `sendCustomMessage` resolves when
  the *target's turn* ends, not when the message is accepted, so an unbounded await inside a
  delivery pass deadlocks the room. Every send goes through `sendBounded` (250 ms).
- A send that resolves is **not** a delivery proof: the bound only proves the message was queued.
  The record is still in the log, and the recipient's cursor is what makes it visible.
- The migration's two locks are **released on every path**, including the early returns — a lock
  left behind in the user's project tree would block a later downgrade to the project-local room.
