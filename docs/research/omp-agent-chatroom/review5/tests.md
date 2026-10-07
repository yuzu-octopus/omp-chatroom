# Review 5 — test validity (mutation testing)

Date 2026-10-07. Lens: can the suite actually catch a regression?

**Method:** the reviewer copied `plugin/` to `/tmp` and applied mutations to each source file,
running the suite after each. A mutation that survives is a test gap.

## Mutation score

12 mutations on the store core, 8 caught. The 4 survivors are validator-leniency edge cases, not
broken core paths. Full table in the agent's report.

**Caught (proof the tests are load-bearing):**
- `clm-07` LIFO promotion instead of FIFO → caught
- `clm-06` non-idempotent promotion → caught
- `clm-05` duplicate-waiter dedupe removed → caught
- `clm-14` wrong `release.reason` → caught
- `clm-02` aborted-holder staleness → caught
- `rst-05/06/07/08` refcount drop/bump/dedupe, main-only timers → all caught
- `cfg-01..08` config override, mint-persist, coercion, precedence, path → all caught
- `dig-02/03/04/06/07/09/10` truncation order, caps, sort direction, body cap, markers, escaping → all caught
- `hok-01/02/03` hook idempotence, heading probe, ordering → all caught
- `rt-14` removing `escapeHarnessTags` from the tool's `safe()` → caught by both paths
- `ver-01` `assertHostVersion` empty-string guard → caught

**Non-vacuity of the 5 named load-bearing tests** (first-writer-wins, waiter promotion, escaping,
refcount, expiry): each **fails** when its target behaviour is broken. No vacuous test among them.

## Flakes — both fixed

### F1 MAJOR — the TTL-sweep test depended on the real 5 s timer
`e2e-room.test.ts:320` polled `Bun.sleep(250)` against a 12 s deadline with a 20 s test timeout.
On a loaded machine the sweep tick or the deadline can be exceeded. It was the suite's only
wall-clock dependency.

**Fixed:** the test is now explicitly labelled the **integration** variant with a named justification
(the thing under test *is* the host-owned `ctx.setInterval` job, which a fake clock cannot advance —
`ts-no-test-timers` allows this exception), the deterministic proof stays in
`tests/room-tool.test.ts` via `expireStale(store, now)` with an injected clock, and the assertion
now carries a failure message naming the 12 s window.

### F2 MINOR — "still blocked" was proved by a single microtask
`e2e-room.test.ts:94` and `wait-tools.test.ts:87` used
`Promise.race([waitP.then(() => true), Promise.resolve(false)])`, which proves only that the promise
did not settle *synchronously*. A broken implementation resolving one macrotask later would pass.

**Fixed:** both now race against a bounded `Bun.sleep(50)` settle window, so a next-macrotask
resolve is caught.

### F3 MINOR — global `AgentRegistry` reset in one file only
`room-tool.test.ts` registers agents into `AgentRegistry.global()` but its `afterEach` only calls
`resetRoomStores()`; `onboarding.test.ts` resets the registry. The current file order is safe, so the
isolation depends on ordering rather than on each file owning its state. **Not fixed** — a real
isolation weakness, noted rather than papered over.

## Process note

The mutation run is the strongest evidence yet that the suite is real: it independently confirms the
five load-bearing behaviours are genuinely asserted, and it found the one flake by *executing*
rather than reading. Combined with review 5's `member{join}` bug — which shipped through a fully
green suite — the picture is clear: **green means the tests pass, not that the feature works.** TDD
plus an adversarial lens plus mutation testing is the combination that finds these.
