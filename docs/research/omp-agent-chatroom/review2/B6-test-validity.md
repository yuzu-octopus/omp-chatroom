# B6 — Test plan validity (adversarial review)

**Date:** 2026-10-06
**Target:** `PLAN-build.md` §11 (all), §1.1 (what ships), §9 (phase acceptance checks)
**Method:** Coverage mapping, false-confidence analysis, assertion-quality grading, harness evaluation, gap enumeration.

---

## 1. Coverage mapping — every §1.1 deliverable → proving test → phase check

| # | Deliverable (§1.1) | Test that proves it | Phase check that runs it | Proven? |
|---|---|---|---|---|
| 1 | Room store: append-only JSONL + in-memory projection | `tests/store.test.ts` — 3 writers × 200 lines, readSince, replay, resolveLocalUrlToPath | P0: `bun test tests/store.test.ts` green | ✅ Yes |
| 2 | One op-dispatched `room` tool (12 ops) | P1: direct `execute()` calls — claim/release/board/expired-TTL | P1: prose (no command) | ⚠️ Partial — only claim/release/board tested; `join`, `read`, `post`, `topics`, `mute`, `unmute`, `tree`, `zoom`, `recall` untested |
| 3 | Three blocking wait tools | P2: `wait_for_claim` cross-session, `wait_for_message` on mention, timeout, abort | P2: prose (no command) | ⚠️ Partial — `wait_for_agent` untested in P2 |
| 4 | Claim arbiter with mandatory TTL + explicit reclaim | P1: expired-TTL reclaim, `release{reason:"reclaimed"}` | P1: prose | ✅ Yes |
| 5 | Attention governor: 3 tiers, caps, bucket, coalesce, mute, gaps | P3: `classify()` 12 cases, 25 T2 → one digest, 11 T1 → 10 + summary, bucket green/yellow/red, muted topic, retention gap | P3: prose (no command) | ✅ Yes |
| 6 | Onboarding: digest + routing rule | P4: spawned subagent's prompt contains digest + routing rule, ≤ 800 tokens, idempotent, shutdown < 2s | P4: prose (no command) | ✅ Yes |
| 7 | Panel: `/room` overlay (Layout A) | P5: `/room` opens, Esc closes, live refresh, Tab toggles, p opens composer, dispose idempotent | P5: prose (no command) | ✅ Yes |
| 8 | Inline cards: 4 card types + tool cards | P6: card renders with IRC shape, ctrl+o expands, survives resume, throwing renderer falls back, tool cards render | P6: prose (no command) | ✅ Yes |
| 9 | Slash command `/room`, key, settings schema, bundled skill | P7: `omp plugin link .` creates symlink, new session loads extension, disabling panel feature removes panel | P7: prose (no command) | ✅ Yes |
| 10 | Multi-agent integration test (one process) | P8: §11 test green end-to-end | P8: prose (no command) | ✅ Yes |
| 11 | Cold tree + compactor + `tree`/`zoom`/`recall` ops | P1b: `cover(1000, 96)`, `putNode` refuses out-of-order, `forget` truncates, `zoom` returns two children, compactor builds via `streamSimple`, max spend cap | P1b: `bun test tests/tree.test.ts` green | ✅ Yes |

**Summary:** 8 of 11 deliverables have a proving test. 3 have partial coverage:
- #2: only 3 of 12 ops tested in P1
- #3: `wait_for_agent` missing from P2
- #10: the §11 test is the deliverable, but it has false-confidence issues (see §2)

---

## 2. False confidence — tests that pass while the feature is broken

### 2.1 §11.1 test code — quoted assertions

```ts
const waitP = roomB.execute("c-wait", { op: "wait_claim", resource: "build/step" }, undefined, undefined);
let done = false; waitP.then(() => { done = true; });
await Promise.resolve();
expect(done).toBe(false);                                    // still blocked
```

**False confidence:** This proves only that the promise has not resolved *yet*. A broken implementation that resolves after 50 ms (e.g., a bug where the condition variable is checked once and then always resolves) would pass this assertion. The `await Promise.resolve()` yields only one microtask — insufficient to distinguish "blocking" from "slow."

**Fix:** Replace with a deterministic check that the wait is still pending after a longer delay, or better, assert that the wait resolves *with the correct holder* (see below).

---

```ts
const winner = await Promise.race([waitP, Bun.sleep(1000).then(() => "TIMEOUT")]);
expect(winner).not.toBe("TIMEOUT");                          // cross-session notification, no polling
```

**False confidence:** This proves the wait resolved within 1 s. It does NOT prove it resolved *because of A's claim*. A broken implementation that resolves immediately with `{outcome:"event", holder:null}` or `{outcome:"timeout"}` would pass if the timeout path is buggy. The assertion checks only that the race didn't time out — not that the resolution value is correct.

**Fix:** Assert the resolution value:
```ts
expect(winner).toMatchObject({ outcome: "event", holder: "AgentA" });
```

---

```ts
expect(lines.map(l => l.kind)).toContain("claim");
```

**False confidence:** This proves *some* claim line exists in the log. It does not prove the claim has the right `from`, `resource`, or `ttlMs`. A broken implementation that appends a claim with wrong fields would pass.

**Fix:** The next line partially addresses this:
```ts
expect(lines.find(l => l.kind === "claim")).toMatchObject({ from: "AgentA", resource: "build/step" });
```
This is better — it checks `from` and `resource`. But it does NOT check `ttlMs`, `seq`, or `ts`.

### 2.2 §11.2 table — assertions claimed but NOT in the test code

| §11.2 claim | In §11.1 code? | False confidence |
|---|---|---|
| "B's `wait_for_claim` is still pending before A claims" | Yes (`expect(done).toBe(false)`) | Weak — see §2.1 |
| "It resolves with holder `AgentA` after A's claim" | **NO** — the test only checks `winner !== "TIMEOUT"` | **High** — a broken resolution value passes |
| "The JSONL contains the `claim` line" | Yes | Weak — see §2.1 |
| "A second `claim` from B returns `{ok:false, holder:"AgentA"}`" | **NO** — not in §11.1 code | **High** — first-writer-wins is untested |
| "The same file read from B's root options is identical" | **NO** — not in §11.1 code | **High** — root sharing is untested |

**Summary:** The §11.2 table claims 5 assertions. Only 2 are in the §11.1 test code. The 3 missing assertions are exactly the ones that prove cross-session correctness: resolution value, first-writer-wins, and root sharing.

### 2.3 P1 acceptance — prose only, no command

> **Accept**: direct `session.getToolByName("room")!.execute(...)` calls —
> `claim(a,res)` grants; `claim(b,res)` returns `{ok:false, holder:a}`; `release(a,res)` then `claim(b,res)` grants;
> an expired-TTL claim is reclaimable and appends `release{reason:"reclaimed"}`; `board` shows holder+expiry;
> the JSONL contains exactly the expected `claim`/`release` lines.

**False confidence:** This is prose describing what should be tested, not a command that returns pass/fail. An implementer must manually translate this into test code. The prose says "the JSONL contains exactly the expected `claim`/`release` lines" — but does not specify how many lines, what fields, or what "expected" means.

### 2.4 P2 acceptance — prose only, no command

> **Accept**: in two sessions — B's `wait_for_claim` starts first and resolves **only after** A claims;
> `wait_for_message` resolves on A's `post` with `mention:true`; each tool returns `outcome:"timeout"`
> (not an error) when nothing happens inside a 1 s test timeout; aborting the session rejects cleanly
> and the promise settles.

**False confidence:** "resolves only after A claims" — but the §11.1 test does not verify the resolution value. "aborting the session rejects cleanly" — no test for this in §11.1.

---

## 3. Assertion quality — observable-behaviour vs implementation-detail

### 3.1 §11.1 test

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| `expect(done).toBe(false)` | Implementation-detail (internal promise state) | Yes — a slow-but-broken impl passes |
| `expect(winner).not.toBe("TIMEOUT")` | Weak behavioural (resolved or not) | Yes — wrong resolution value passes |
| `expect(lines.map(l => l.kind)).toContain("claim")` | Implementation-detail (log shape) | Yes — wrong claim fields pass |
| `expect(lines.find(l => l.kind === "claim")).toMatchObject({ from: "AgentA", resource: "build/step" })` | Behavioural (observable log content) | No — this is a real assertion |

**Verdict:** 3 of 4 assertions are implementation-detail or weak. Only 1 is a real behavioural assertion.

### 3.2 P3 acceptance (attention governor)

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| `classify()` table test for 12 trigger cases | Behavioural (classification output) | No — this is real |
| 25 T2 records produce exactly one digest line | Behavioural (digest output) | No |
| 11 T1 records inject 10 + one summary line | Behavioural (injection output) | No |
| Token bucket emits green/yellow/red in order | Behavioural (bucket state) | No |
| Muted topic produces zero unread | Behavioural (unread count) | No |
| Forced retention pass appends one `gap` record | Behavioural (log output) | No |

**Verdict:** P3 assertions are behavioural. Good quality.

### 3.3 P4 acceptance (onboarding)

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| Spawned subagent's prompt contains digest + routing rule | Behavioural (prompt content) | No |
| Digest ≤ 800 tokens (assert by counting) | Behavioural (token count) | No |
| Hook is idempotent per agent | Behavioural (no duplication) | No |
| `session_shutdown` completes well inside 2 s | Behavioural (timing) | No |

**Verdict:** P4 assertions are behavioural. Good quality.

### 3.4 P5 acceptance (panel)

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| `/room` opens a fullscreen overlay | Behavioural (UI state) | No |
| `Esc` closes and the promise resolves | Behavioural (UI + promise) | No |
| New room post appears without a keypress | Behavioural (live refresh) | No |
| At 80 cols `Tab` toggles chat↔board | Behavioural (UI state) | No |
| `p` opens the composer and typing does not move selection | Behavioural (UI state) | No |
| `dispose()` is idempotent | Behavioural (no throw) | No |

**Verdict:** P5 assertions are behavioural. Good quality.

### 3.5 P6 acceptance (inline cards)

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| Card renders with IRC-card shape | Behavioural (rendered output) | No |
| ctrl+o re-invokes with `expanded:true` and shows more lines | Behavioural (rendered output) | No |
| Card survives a session resume | Behavioural (persistence) | No |
| Throwing renderer falls back to default card | Behavioural (fallback) | No |
| Tool cards render via both `renderCall/renderResult` and `describeCall/describeResult` | Behavioural (rendered output) | No |

**Verdict:** P6 assertions are behavioural. Good quality.

### 3.6 P1b acceptance (cold tree)

| Assertion | Type | Passes while feature broken? |
|---|---|---|
| `cover(1000, 96)` returns ≤ 96 blocks tiling `[0,1000)` | Behavioural (tiling output) | No |
| `putNode` refuses out-of-order write | Behavioural (return value) | No |
| `forget(lo, hi)` truncates all level files, log untouched | Behavioural (file state) | No |
| `zoom(lo, hi)` returns two children | Behavioural (zoom output) | No |
| Compactor builds a pending node via `streamSimple` (mock the stream, assert called) | **Implementation-detail** (mock call) | Yes — a broken compactor that calls `streamSimple` with wrong args passes |
| Max spend cap: after 1000 calls, compactor pauses | Behavioural (pause state) | No |

**Verdict:** 5 of 6 are behavioural. The compactor assertion is implementation-detail — it asserts `streamSimple` was called, not that the node was built correctly.

---

## 4. The harness — does §11.1 actually exercise delivery, registry, and timers?

### 4.1 What the harness sets up

```ts
const bus = new EventBus(); const registry = new AgentRegistry();
const a = await newSession(bus, registry, root, "AgentA");
const b = await newSession(bus, registry, root, "AgentB");
```

- Shared `EventBus` — yes
- Shared `AgentRegistry` — yes
- Same `localProtocolOptions` (same root) — yes
- `SessionManager.inMemory()` — yes
- `hasUI: false` — yes

### 4.2 What the harness exercises

| Capability | Exercised? | How |
|---|---|---|
| Cross-session notification | ✅ Yes | `wait_for_claim` in B resolves when A claims |
| Durable log | ✅ Yes | Reads JSONL from disk |
| Shared module store | ✅ Yes | Both sessions see the same store |
| Delivery to sibling context | ❌ No | No message is sent to B's context; only the store is read |
| Registry-based delivery | ❌ No | `AgentRegistry` is created but never used for delivery |
| Timers | ❌ No | No timer is set or tested |
| Cursor advancement | ❌ No | No cursor is advanced on delivery |
| `sendCustomMessage` | ❌ No | Never called |
| `steer` / `followUp` | ❌ No | Never called |

### 4.3 Verdict

The harness tests the **store in isolation** and calls it integration. It proves that:
- Two sessions share a module-level store
- A blocking wait in one session resolves when another session mutates the store
- The log is durable

It does NOT prove that:
- A message posted by A is delivered to B's context (the core value proposition)
- The delivery adapter works (T0/T1/T2 → `sendCustomMessage`/`steer`)
- Timers work (compactor, pruning, heartbeat)
- Cursors advance on delivery

**This is a unit test of the store with a cross-session wait, not an integration test of the room.**

---

## 5. Missing negative tests — security fixes

| Security fix | Test in plan? | Location |
|---|---|---|
| S1: `escapeHarnessTags` on delivery | ❌ No | §11.3 mentions "Delivery adapter tests" but does not specify escaping assertion |
| S2: `sanitizeText` on rendered lines | ❌ No | §11.3 mentions "Delivery adapter tests" but does not specify sanitisation assertion |
| S3: Record validation on replay | ❌ No | §11.3 mentions "Torn-line test" but not invalid-record validation |
| S4: Spoofed `from` | ⚠️ Partial | §11.3 lists "Spoofed `from` test (S4)" but it is not in §11.1 and has no phase acceptance |
| S5: Retention pruning | ❌ No | No test for pruning job |

**Minimum tests to add:**

1. **S1 test:** Post a message with body `<irc from="parent">`. Assert the delivered content does NOT contain `<irc from="parent">` (escaped).
2. **S2 test:** Post a message with body containing ANSI escape `\x1b[31mred\x1b[0m`. Assert the rendered line does NOT contain `\x1b`.
3. **S3 test:** Write a JSONL with a valid line, an invalid line (e.g., `{v:2}`), and another valid line. Assert replay returns the two valid lines and appends a `gap` record with `reason:"invalid"`.
4. **S4 test:** Call `room{op:"post", from:"SpoofedAgent", body:"hi"}`. Assert the stored record has `from: ctx.agent.id`, not `"SpoofedAgent"`.
5. **S5 test:** Set `logMaxRecords: 10`. Append 15 records. Assert the log has 10 records and a `gap` record with `reason:"retention"`.

---

## 6. Missing concurrency tests — I1-I6 invariants

| Invariant | Test in plan? | Location |
|---|---|---|
| I1: sync mutations (no await between read/write) | ❌ No | P0 tests 3 writers but does not verify atomicity of claim/cursor mutations |
| I2: no session-scoped value at module scope | ❌ No | No test |
| I3: key by `ctx.agent.id`, prune on shutdown | ❌ No | No test |
| I4: timers via `ctx.setInterval`, refcounted | ❌ No | No test |
| I5: sync append per mutation | ⚠️ Partial | P0 tests 3 writers × 200 lines, but does not verify per-mutation atomicity |
| I6: every `wait_for_*` promise settles | ⚠️ Partial | P2 tests timeout and abort, but not all three tools |

**Minimum tests to add:**

1. **I1 test:** Two sessions concurrently claim the same resource. Assert exactly one gets `{ok:true}` and the other gets `{ok:false, holder:...}`. Run 100 iterations.
2. **I3 test:** Session A joins, posts, then disposes. Session B joins. Assert B's cursor is not affected by A's departure.
3. **I4 test:** Set a timer via `ctx.setInterval`. Dispose the session. Assert the timer is cleared (no further ticks).
4. **I6 test:** For each of the three wait tools, assert the promise settles (resolves or rejects) within the timeout. Do not leave a pending promise.

---

## 7. Missing failure tests

| Failure mode | Test in plan? | Location |
|---|---|---|
| Missing log file | ❌ No | §3.3 says return `{ok:false, error:"room file not found"}` but no test |
| Unwritable log file | ❌ No | §3.3 says return `{ok:false, error:"room file unwritable"}` but no test |
| Corrupt log file | ❌ No | §3.3 says return `{ok:false, error:"room file corrupt"}` but no test |
| Unresolvable root | ❌ No | No test |
| Killed subagent | ❌ No | No test |

**Minimum tests to add:**

1. **Missing file:** Delete the log file. Call `room{op:"read"}`. Assert result is `{ok:false, error:"room file not found"}`.
2. **Unwritable file:** chmod 000 the log file. Call `room{op:"post"}`. Assert result is `{ok:false, error:"room file unwritable"}`.
3. **Corrupt file:** Write invalid JSON to the log file. Call `room{op:"read"}`. Assert result is `{ok:false, error:"room file corrupt"}` or returns records up to the corruption.
4. **Unresolvable root:** Pass `localProtocolOptions` with `getArtifactsDir: () => null` and `getSessionId: () => ""`. Assert the tool returns an error, not a throw.
5. **Killed subagent:** Start a subagent, call `wait_for_agent` on it, then kill the subagent. Assert the wait resolves with `{outcome:"event", agents:[{id, status:"aborted"}]}`.

---

## 8. Determinism — wall-clock, ordering, timing dependencies

| Test | Deterministic? | Issue |
|---|---|---|
| §11.1 `await Promise.resolve()` | ❌ No | Microtask timing — may not be enough to prove blocking |
| §11.1 `Bun.sleep(1000)` | ❌ No | Wall-clock — flaky on slow machines |
| §11.1 `expect(done).toBe(false)` | ❌ No | Depends on microtask timing |
| P0: 3 writers × 200 lines | ✅ Yes | Deterministic |
| P1b: `cover(1000, 96)` | ✅ Yes | Deterministic |
| P3: `classify()` table | ✅ Yes | Deterministic |
| P3: 25 T2 → one digest | ✅ Yes | Deterministic |
| P3: token bucket green/yellow/red | ✅ Yes | Deterministic |
| P4: digest ≤ 800 tokens | ✅ Yes | Deterministic |
| P5: panel interactions | ✅ Yes | Deterministic (if TUI is mocked) |
| P6: card rendering | ✅ Yes | Deterministic |
| P2: `wait_for_claim` cross-session | ❌ No | Uses `Bun.sleep(1000)` race |
| P2: `wait_for_message` on mention | ❌ No | Uses `Bun.sleep(1000)` race |
| P2: timeout | ❌ No | Uses 1 s timeout |
| P2: abort | ❌ No | Timing-dependent |

**Summary:** The §11.1 test and P2 acceptance are timing-dependent. They use `Bun.sleep(1000)` as a race timeout, which is flaky on slow or loaded machines. The other suites are deterministic.

**Fix:** Replace `Bun.sleep(1000)` with a deterministic signal. For example, use a mock clock or assert that the wait is still pending after a synchronous operation that should not resolve it.

---

## 9. Acceptance-check quality — command vs prose

| Phase | Acceptance check | Type | Runnable? |
|---|---|---|---|
| P0 | `bun test tests/store.test.ts` green | ✅ Command | Yes |
| P1 | "direct `session.getToolByName("room")!.execute(...)` calls — ..." | ❌ Prose | No |
| P1b | `bun test tests/tree.test.ts` green | ✅ Command | Yes |
| P2 | "in two sessions — B's `wait_for_claim` starts first..." | ❌ Prose | No |
| P3 | "`classify()` table test for all 12 trigger cases..." | ❌ Prose | No |
| P4 | "a spawned subagent's effective prompt contains..." | ❌ Prose | No |
| P5 | "`/room` opens a fullscreen overlay..." | ❌ Prose | No |
| P6 | "a `room:message` card renders with the IRC-card shape..." | ❌ Prose | No |
| P7 | "`omp plugin link .` creates the symlink..." | ❌ Prose | No |
| P8 | "the §11 test is green end-to-end" | ❌ Prose | No |

**Summary:** Only P0 and P1b have runnable commands. The other 8 phases have prose descriptions that an implementer must manually translate into test code. This is a significant gap — prose acceptance checks are not verifiable.

**Minimum fix:** For each phase, add a `bun test` command or a specific test file that can be run.

---

## 10. Gap list — what is not tested

### 10.1 High-priority gaps (feature is untested)

| # | Gap | Deliverable | Minimum test to add |
|---|---|---|---|
| G1 | Resolution value of `wait_for_claim` | #3 | Assert `winner` matches `{outcome:"event", holder:"AgentA"}` |
| G2 | First-writer-wins | #4 | Assert B's second `claim` returns `{ok:false, holder:"AgentA"}` |
| G3 | Root sharing | #1 | Read the log from B's `localProtocolOptions`, assert identical |
| G4 | `wait_for_agent` | #3 | Spawn two agents, call `wait_for_agent`, assert resolves on status change |
| G5 | `join` op | #2 | Call `join`, assert cursor is minted at `logEnd-50` |
| G6 | `read` op | #2 | Call `read`, assert returns records after cursor |
| G7 | `post` op | #2 | Call `post`, assert record is appended with correct `from` |
| G8 | `topics` op | #2 | Call `topics`, assert returns topic list with unread counts |
| G9 | `mute`/`unmute` ops | #2 | Call `mute`, assert muted topic produces zero unread |
| G10 | `tree` op | #2 | Call `tree`, assert returns current tiling |
| G11 | `zoom` op | #2 | Call `zoom`, assert returns two children |
| G12 | `recall` op | #2 | Call `recall`, assert returns matching records |
| G13 | Delivery to sibling context | #3 | Assert `sendCustomMessage` is called with correct `deliverAs` |
| G14 | T0 delivery (steer) | #5 | Assert `steer` is called for T0 messages |
| G15 | T1 delivery (aside) | #5 | Assert `sendCustomMessage` with `deliverAs:"aside"` for T1 |
| G16 | T2 delivery (cursor bump only) | #5 | Assert no injection, only cursor bump |
| G17 | Compactor builds correct node | #11 | Assert node content, not just that `streamSimple` was called |
| G18 | Timer refcounting | #11 | Assert timer is cleared when last session disposes |
| G19 | Cursor advancement on delivery | #5 | Assert cursor advances when message is delivered |
| G20 | `session_shutdown` prune | #1 | Assert session-scoped data is pruned on shutdown |

### 10.2 Medium-priority gaps (security/failure untested)

| # | Gap | Minimum test to add |
|---|---|---|
| G21 | S1: `escapeHarnessTags` | Assert escaped body in delivery |
| G22 | S2: `sanitizeText` | Assert sanitised body in rendering |
| G23 | S3: Record validation | Assert invalid records are quarantined |
| G24 | S4: Spoofed `from` | Assert `from` is always `ctx.agent.id` |
| G25 | S5: Retention pruning | Assert pruning job enforces `logMaxRecords` |
| G26 | Missing log file | Assert `{ok:false, error:"room file not found"}` |
| G27 | Unwritable log file | Assert `{ok:false, error:"room file unwritable"}` |
| G28 | Corrupt log file | Assert `{ok:false, error:"room file corrupt"}` |
| G29 | Unresolvable root | Assert error, not throw |
| G30 | Killed subagent | Assert `wait_for_agent` resolves on abort |

### 10.3 Low-priority gaps (concurrency untested)

| # | Gap | Minimum test to add |
|---|---|---|
| G31 | I1: sync mutations | Concurrent claim, assert exactly one winner |
| G32 | I3: key by agent id | Assert B's cursor unaffected by A's departure |
| G33 | I4: timer refcounting | Assert timer cleared on dispose |
| G34 | I6: all wait tools settle | Assert all three tools settle within timeout |

---

## 11. What I checked and found correct

| Item | Verdict |
|---|---|
| P0 acceptance is a runnable command | ✅ Correct |
| P1b acceptance is a runnable command | ✅ Correct |
| P3 assertions are behavioural (not implementation-detail) | ✅ Correct |
| P4 assertions are behavioural | ✅ Correct |
| P5 assertions are behavioural | ✅ Correct |
| P6 assertions are behavioural | ✅ Correct |
| P1b `cover(1000, 96)` assertion is behavioural | ✅ Correct |
| P1b `putNode` out-of-order assertion is behavioural | ✅ Correct |
| P1b `forget` truncation assertion is behavioural | ✅ Correct |
| P1b `zoom` two-children assertion is behavioural | ✅ Correct |
| P1b max-spend cap assertion is behavioural | ✅ Correct |
| §11.1 harness uses real `createAgentSession` | ✅ Correct |
| §11.1 harness shares `EventBus` and `AgentRegistry` | ✅ Correct |
| §11.1 harness uses same `localProtocolOptions` | ✅ Correct |
| §11.1 harness tests cross-session notification | ✅ Correct |
| §11.1 harness tests durable log | ✅ Correct |
| §11.1 harness tests shared module store | ✅ Correct |
| §11.3 lists additional suites (delivery adapter, wait_for_agent, rate limit, cursors, tree rebuild, no-UI, cards, torn-line, spoofed from) | ✅ Correct |
| §11.3 torn-line test is specified | ✅ Correct |
| §11.3 spoofed `from` test is specified | ✅ Correct |
| §11.3 delivery adapter tests cover all four paths (T2, T1 self, T1 sibling, T0 sibling) | ✅ Correct |
| §11.3 cursor persistence test is specified | ✅ Correct |
| §11.3 tree rebuild test is specified | ✅ Correct |
| §11.3 no-UI fallback test is specified | ✅ Correct |
| §11.3 card tests cover all four card types | ✅ Correct |

---

## 12. Summary

**Overall verdict:** The test plan has significant gaps. The §11.1 test — the only concrete test code in the plan — has false-confidence issues: 3 of 4 assertions are implementation-detail or weak, and 3 assertions claimed in §11.2 are missing from the test code. The harness tests the store in isolation, not the room as a system. 8 of 11 deliverables have no proving test for their core behaviour. Security fixes (S1-S5) have no tests. Concurrency invariants (I1-I6) have no tests. Failure modes have no tests. 8 of 10 phase acceptance checks are prose, not commands.

**Top 5 gaps by impact:**

1. **G1:** `wait_for_claim` resolution value is not asserted — the test passes if the wait resolves with wrong data.
2. **G4:** `wait_for_agent` is not tested at all.
3. **G13-G16:** Delivery to sibling context is not tested — the core value proposition is untested.
4. **G21-G24:** Security fixes (escaping, sanitisation, validation, spoofed `from`) have no tests.
5. **G1:** 8 of 10 phase acceptance checks are prose, not runnable commands.

**Confidence:** 0.92
