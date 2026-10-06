# A8 — Requirements + Consistency Audit

**Date:** 2026-10-06
**Scope:** `PLAN-build.md`, `REPORT.md`, `REPORT-v2-hybrid.md`, `REPORT-v3-tree.md`, `brief.md` (incl. Addenda A and B), `AGENTS.md`
**Method:** Cross-document grep for specific claims, phase-by-phase coverage check, numeric constant provenance table.

---

## 1. Cross-document contradictions

### 1.1 `wait_for_claim` `ttl` unit ambiguity (ms vs seconds)

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §4.4:521 | `ttl: z.number().optional(), // lease ms granted if free; default 300000` |
| `PLAN-build.md` | §3.4:338 | `Every claim carries ttlMs (default settings.claimTtlMs = 300 000 ms)` |
| `REPORT-v2-hybrid.md` | §B:228 | `ttl?: number (lease seconds; default 300)` |
| `findings/F12` | :429 | `"ttl?": number // seconds; lease length if acquired; default 300` |

**Severity:** major
**Contradiction:** PLAN says `ttl` is in milliseconds (default 300000); REPORT-v2 and F12 say seconds (default 300). The PLAN's §3.4 text says `ttlMs` but the §4.4 schema comment says `lease ms` — internally consistent within PLAN but contradicts R2/F12.
**Fix:** Standardise on milliseconds everywhere. Change R2 §B and F12 to `default 300000` with `// lease ms`. The PLAN is the build-ready document and its choice (ms) is correct because `settings.claimTtlMs` is in ms.

### 1.2 `wait_for_message` `source` parameter — PLAN adds, R2 does not mention

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §4.3:500 | `source: z.enum(["room","irc","any"]).optional(), // default "room" (see RISK R8)` |
| `REPORT-v2-hybrid.md` | §B:227 | `from?: string, mention?: boolean (default false), timeout?: number (default 30, max 1800)` — no `source` param |

**Severity:** minor
**Contradiction:** PLAN adds a `source` parameter not present in R2's tool surface. This is a PLAN revision (R8 risk mitigation), not a contradiction, but R2 is not updated to reflect it.
**Fix:** Add a note to R2 §B or a changelog entry: "PLAN §4.3 adds `source` param to mitigate R8."

### 1.3 `room` tool ops — PLAN adds `unmute`, `tree`, `zoom`, `recall`

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §1.1:30 | `One op-dispatched room tool (join/read/post/claim/release/board/topics/mute)` |
| `PLAN-build.md` | §4.1:445 | `op: z.enum(["join","read","post","claim","release","board","topics","mute","unmute","tree","zoom","recall"])` |
| `REPORT-v2-hybrid.md` | §Blueprint:428 | `join, read, post, claim, release, board` — 6 ops |
| `REPORT.md` | §C:197 | `join, read, post, claim, release, board` — 6 ops |

**Severity:** minor
**Contradiction:** §1.1 lists 8 ops (missing `unmute`, `tree`, `zoom`, `recall`); §4.1 lists 12 ops. R1/R2 list 6 ops. The PLAN internally contradicts itself between §1.1 and §4.1.
**Fix:** Update §1.1 to list all 12 ops: `join/read/post/claim/release/board/topics/mute/unmute/tree/zoom/recall`.

### 1.4 `loadMode` — R1/R2 say `discoverable`, PLAN says `essential`

| Document | Line | Claim |
|---|---|---|
| `REPORT.md` | §C:195 | `loadMode: "discoverable"` |
| `REPORT-v2-hybrid.md` | §Blueprint:425 | `loadMode: "discoverable"` |
| `PLAN-build.md` | §4.0:417 | `loadMode: "essential"` |
| `PLAN-build.md` | §4.0:435-438 | RISK R3: discoverable tools are NOT active; probe confirmed |

**Severity:** minor (revision, not contradiction)
**Contradiction:** PLAN revises R1/R2's `discoverable` to `essential` based on probe evidence. R1/R2 are not updated to reflect this.
**Fix:** Add a note to R1/R2: "PLAN §4.0 revises loadMode to essential based on probe evidence (RISK R3)."

### 1.5 `JOBS=4` vs findings that say `JOBS=8` needed

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §3.6:378 | `Concurrency = JOBS = 4` |
| `PLAN-build.md` | §5.2:580 | `Compaction concurrency (JOBS) = 4` |
| `REPORT-v3-tree.md` | §3:75 | `Concurrency: JOBS = 4` |
| `findings/F21-W5.md` | :50 | `For 10 agents in one room: JOBS=8 is still adequate` |
| `findings/F21-W5.md` | :52 | `For 100 agents: JOBS=8 is insufficient` |
| `findings/F21-W5.md` | :54 | `JOBS >= message_rate × avg_compactor_latency` |

**Severity:** major
**Contradiction:** PLAN/R3 fix JOBS=4, but F21-W5's own analysis says JOBS=8 saturates at 10 agents posting at the PLAN's rate limit (1 post/2s per agent). JOBS=4 would saturate at 5 agents.
**Fix:** Either (a) increase JOBS to 8 in PLAN §3.6 and §5.2, or (b) add a note that JOBS must be tuned based on agent count and message rate, with a formula reference to F21-W5.

### 1.6 `wait_for_agent` default timeout — PLAN says 30s, R2 says 30s, F12 says 30s

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §4.2:482 | `timeout: z.number().optional(), // seconds; default 30, min 1, max 1800` |
| `REPORT-v2-hybrid.md` | §B:226 | `timeout?: number (s; default 30, min 1, max 1800)` |
| `findings/F12` | :394 | `timeout?: number // seconds; default 30, min 1, max 1800` |

**Severity:** none — CONSISTENT

### 1.7 `wait_for_claim` default timeout — PLAN says 20s, R2 says 20s, F12 says 20s

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §4.4:520 | `timeout: z.number().optional(), // seconds; default 20, min 1, max 300` |
| `REPORT-v2-hybrid.md` | §B:228 | `timeout?: number (default 20, max 300)` |
| `findings/F12` | :428 | `timeout?: number // seconds; default 20, min 1, max 300` |

**Severity:** none — CONSISTENT

### 1.8 `content-address` — PLAN and R3 agree: do NOT content-address

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §10 R25:1119 | `do NOT content-address the tree (hash difference carries no signal about which is right)` |
| `REPORT-v3-tree.md` | §Invalidation:63 | `Recommendation: do NOT content-address the tree` |

**Severity:** none — CONSISTENT

### 1.9 `R=50` raw tail — PLAN and R3 agree

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §3.1:215 | `raw tail (last R=50 messages)` |
| `REPORT-v3-tree.md` | §2:31 | `Raw tail = last R messages (R = 50, matching PLAN §3.5 join cursor)` |

**Severity:** none — CONSISTENT

### 1.10 `TREE_REC=288` — PLAN and R3 agree

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §3.1:206 | `TREE_REC = 288 bytes (matching OptMem)` |
| `REPORT-v3-tree.md` | §1:140 | `TREE_REC = 288 bytes (matching OptMem)` |

**Severity:** none — CONSISTENT

### 1.11 `WAKE_LINES=96` — PLAN and R3 agree

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §5.2:578 | `Cold tree budget (B) = 96 lines` |
| `REPORT-v3-tree.md` | §2:35 | `B = 96, matching OptMem's WAKE_LINES` |

**Severity:** none — CONSISTENT

### 1.12 `1000 calls/day` cap — PLAN and R3 agree

| Document | Line | Claim |
|---|---|---|
| `PLAN-build.md` | §3.6:379 | `Max spend = 1000 calls/day cap` |
| `REPORT-v3-tree.md` | §3:77 | `Max spend: cap total compaction calls per day (e.g. 1000 calls/day)` |

**Severity:** none — CONSISTENT

---

## 2. Plan vs AGENTS.md

### 2.1 Phase count

| Source | Claim |
|---|---|
| `AGENTS.md` | `9 phases` |
| `PLAN-build.md` §9 | P0, P1, P1b, P2, P3, P4, P5, P6, P7, P8 = **10 phases** |

**Severity:** major
**Contradiction:** AGENTS.md says 9 phases; PLAN has 10 (P0 through P8, plus P1b).
**Fix:** Update AGENTS.md to say "10 phases (P0–P8 + P1b)".

### 2.2 Caps and constants

| AGENTS.md | PLAN-build.md | Match? |
|---|---|---|
| K=10 T1/turn | §5.2:568 `K = 10` | yes |
| B=2048 tokens/turn | §5.2:569 `B = 2048` | yes |
| N=20 T2 coalesce count | §5.2:570 `N = 20` | yes |
| T=5 min coalesce lag | §5.2:571 `T = 5 min` | yes |
| srTCM 1 post/2 s | §5.2:572 `1 post / 2 s` | yes |
| burst 10 | §5.2:573 `CBS = 10` | yes |
| log retention 5000 records / 7 days | §5.2:576 `5000 records or 7 days` | yes |

**Severity:** none — CONSISTENT

### 2.3 Tool names and interruptibility

| AGENTS.md | PLAN-build.md | Match? |
|---|---|---|
| `room`, `wait_for_agent`, `wait_for_message`, `wait_for_claim` | §4.1-4.4 | yes |
| `interruptible: true` for wait_for_agent / wait_for_message | §4.2:489, §4.3 | yes |
| `interruptible: false` for wait_for_claim | §4.4 | yes |
| `loadMode: "essential"` required | §4.0:417 | yes |
| `execute` signature `(toolCallId, params, signal, onUpdate, ctx)` | §4.0:420 | yes |
| Result contract `{ outcome: "event" \| "timeout" \| "aborted", ... }` | §4.5 | yes |
| `useless: true` on non-event paths | §4.5 | yes |

**Severity:** none — CONSISTENT

### 2.4 State and paths

| AGENTS.md | PLAN-build.md | Match? |
|---|---|---|
| One module-level store keyed by `local://` root | §3.1 | yes |
| Cursors persist via `appendEntry` | §3.5 | yes |
| Synchronous `O_APPEND` writes, no lock, no `fsync` | §3.3 | yes |
| `ctx.localProtocolOptions` when present, else derive from `sessionManager` | §3.3 | yes |
| Resource form `<topic>/<key>` | §4.1 | yes |
| `customType` namespace `room:message`, `room:mention`, `room:claim`, `room:board-delta` | §7.3 | yes |

**Severity:** none — CONSISTENT

### 2.5 Panel

| AGENTS.md | PLAN-build.md | Match? |
|---|---|---|
| Opened from slash command | §6.1 | yes |
| Guarded by `hasUI` and `ctx.mode === "tui"` | §6.8 | yes |
| Keys live in `handleInput` | §6.6 | yes |
| `dispose` must be idempotent | §6.8 | yes |

**Severity:** none — CONSISTENT

### 2.6 Invariants

| AGENTS.md | PLAN-build.md | Match? |
|---|---|---|
| I1–I6 listed | §3.1:233-238 | yes |

**Severity:** none — CONSISTENT

### 2.7 AGENTS.md "Open Questions" section

AGENTS.md lists:
- Room message volume has no study behind it
- Whether an agent given a bounded blocking wait uses it productively is untested
- No primary source studies hierarchical compression for a multi-writer agent log
- The routing-rule thresholds and the coalesce/rate-limit constants are proposals, not measured values

**Severity:** none — CONSISTENT with PLAN's own hedging

---

## 3. Brief coverage

### Addendum A — hybrid design round

| Question | Answered by | Status |
|---|---|---|
| (a) when a message should go to the room vs stay a direct `agent://` message | R2 §A (routing rule, 10 clauses) | answered |
| (b) the exact wait/blocking tool surface and its interrupt semantics | R2 §B (three tools, bounds, interruptible) | answered |
| (c) the message envelope and addressing model for agent chat | R2 §C (13-field envelope) | answered |
| (d) the attention/backpressure model that stops a high-volume room from drowning its members | R2 §D (three tiers, caps, coalesce, mute) | answered |

**Severity:** none — all Addendum A questions answered

### Addendum B — hierarchical log compression

| Question | Answered by | Status |
|---|---|---|
| (a) the store layout and node format | R3 §1 (fixed-width, TREE_REC=288, dense prefix) | answered |
| (b) who runs compaction in a multi-writer system and how concurrent compaction is serialised | R3 §3 (background job, @smol, dense-prefix CAS) | answered |
| (c) the boundary rule (raw vs compressed) and how a cursor maps onto it | R3 §2 (R=50 raw tail, cold tree over [0,N-R)) | answered |
| (d) `zoom` semantics and addressing when a node covers N messages | R3 §4 (exclusive range, power-of-two, two children) | answered |
| (e) what happens when a compressed node must be invalidated | R3 §4 (forget + rebuild, log untouched) | answered |
| (f) failure modes — a member whose cursor falls below the raw tail, a crashed compactor, a divergent node | R3 §5 (gap + raw-log fallback, rebuild from log, no divergence detection) | answered |

**Severity:** none — all Addendum B questions answered

---

## 4. Phase completeness

### 4.1 Deliverable → Phase mapping

| # | Deliverable (§1.1) | Phase | Acceptance check |
|---|---|---|---|
| 1 | Room store: append-only JSONL + in-memory projection | P0 | `bun test tests/store.test.ts` — 3 interleaved writers × 200 lines, 600 parseable lines, zero torn lines; `readSince(seq)` returns exactly records after `seq`; replay reconstructs cursors and seq; `resolveLocalUrlToPath` points inside `resolveLocalRoot` |
| 2 | One op-dispatched `room` tool | P1 | Direct `execute()` calls — claim/release/board/expired-TTL reclaim |
| 3 | Three blocking wait tools | P2 | B's `wait_for_claim` starts first, resolves only after A claims; `wait_for_message` resolves on A's post with mention; each returns `outcome:"timeout"` when nothing happens |
| 4 | Claim arbiter with mandatory TTL + explicit reclaim | P1 | (same as #2) |
| 5 | Attention governor: 3 tiers, caps, coalesce, mute, gap notices | P3 | `classify()` table test for 12 trigger cases; 25 T2 → one digest line; 11 T1 → 10 + one summary; token bucket green/yellow/red; muted topic → zero unread; forced retention → one gap record |
| 6 | Onboarding: `before_agent_start` digest + routing rule prompt block | P4 | Spawned subagent's prompt contains digest + routing rule; digest ≤ 800 tokens; hook idempotent; `session_shutdown` < 2 s |
| 7 | Panel: `/room` overlay (Layout A) | P5 | `/room` opens fullscreen overlay; Esc closes; new post appears without keypress; 80 cols Tab toggles; p opens composer; dispose idempotent |
| 8 | Inline cards: `room:message`, `room:mention`, `room:claim`, `room:board-delta` + tool cards | P6 | Card renders with IRC-card shape; ctrl+o re-invokes with expanded:true; survives resume; throwing renderer falls back; tool cards render via both renderCall/renderResult and describeCall/describeResult |
| 9 | Slash command `/room`, optional key, settings schema, bundled skill | P7 | `omp plugin link .` creates symlink; new session loads extension; disabling panel feature removes panel but keeps room tool |
| 10 | Multi-agent integration test (one process) | P8 | §11 test green end-to-end |
| 11 | Cold tree + background compactor + `tree`/`zoom`/`recall` ops | P1b | `cover(1000, 96)` returns ≤ 96 blocks; `putNode` refuses out-of-order; `forget` truncates all level files; `zoom` returns two children; compactor builds pending node via streamSimple; max spend cap pauses after 1000 calls |

**Severity:** none — every deliverable maps to a phase; every phase has a verifiable acceptance check

### 4.2 Phase → Deliverable reverse mapping

| Phase | Deliverable(s) |
|---|---|
| P0 | #1 (store) |
| P1 | #2 (room tool), #4 (claim arbiter) |
| P1b | #11 (cold tree) |
| P2 | #3 (wait tools) |
| P3 | #5 (attention governor) |
| P4 | #6 (onboarding) |
| P5 | #7 (panel) |
| P6 | #8 (inline cards) |
| P7 | #9 (slash command, settings, skill) |
| P8 | #10 (integration test) |

**Severity:** none — every phase has at least one deliverable; no orphan deliverables

---

## 5. Risk completeness

### 5.1 Risks with concrete, testable fallbacks

| # | Risk | Fallback | Testable? |
|---|---|---|---|
| R1 | `ctx.localProtocolOptions` may be undefined | Derive from `sessionManager` | yes — test with undefined options |
| R2 | Deep subpath imports not public API | Prefer `pi.pi`; pin host version; smoke test | yes — import smoke test |
| R3 | `loadMode:"discoverable"` leaves tool inactive | Register `"essential"`; else `setActiveTools` | yes — probe already done |
| R4 | `ctrl+s` unwinnable | Use non-reserved key; default `panelKey:""` | yes — keybinding test |
| R5 | `ctx.ui.custom` unsupported in RPC | Guard + try/catch → `ctx.ui.notify` | yes — mode fallback test |
| R6 | `ExtensionAPI` has no `settings` | Registry via subpath; fall back to `local://room/config.json` | yes — settings test |
| R7 | `hello.ts` param order misleading | Follow wrapper | yes — code review |
| R8 | `IrcBus.wait` consumes message | Ship `source:"room"` default; `"irc"` opt-in | yes — wait_for_message test |
| R9 | `interruptible` not in typed `ToolDefinition` | Declare on literal + cast; observe `signal` directly | yes — abort test |
| R10 | Module singleton leaks across tests | `reset()` seam + key by root | yes — test isolation |
| R11 | `session_shutdown` clears timers | Refcount per live session | yes — lifecycle test |
| R12 | `session_shutdown` 2 s budget | Sync mutations only; no flush | yes — shutdown test |
| R13 | Late-loaded plugin no shortcut wiring | Slash command primary; key best-effort | yes — loading test |
| R14 | Extension shortcuts dead while overlay focused | All keys in `handleInput` | yes — panel test |
| R15 | No hot-reload | Edit → new session | documented |
| R16 | Per-frame component churn | Windowed plain-string rows | yes — perf test |
| R17 | Restricted children never receive extension tools | Room unavailable there by design | documented |
| R18 | No plugin API for keybinding action | Raw `registerShortcut`; no remapping | documented |
| R19 | Second process writing same log | In-process by scope; `withFileLockSync` if needed | documented |
| R20 | `registerMessageRenderer` never runs without UI | Keep renderers pure; state in tool path | yes — no-UI test |
| R21 | Native IRC card body helper private | Ship `src/cards/body-lines.ts` | yes — card test |
| R22 | `pi-tui` subpath imports deep | Prefer root exports; pin; smoke test | yes — import test |
| R23 | `streamSimple` deep import | Wrap in try/catch; fall back to `runEphemeralTurn` | yes — import test |
| R24 | Compaction cost unbounded | 1000 calls/day cap | yes — P1b test (f) |
| R25 | LLM summarisation non-deterministic | Single-writer; do NOT content-address | documented |
| R26 | Cold tree falls behind | Raw tail without waiting; gap + fallback | yes — P1b test |
| R27 | `forget` + rebuild expensive | Rebuild lazily; batch; consider incremental | documented |
| R28 | `ctx.setInterval` auto-cleared on shutdown | Run compactor from main session only; refcount | yes — lifecycle test |

**Severity:** none — all 28 risks have concrete fallbacks; none are "consider" or "monitor" only

---

## 6. Test plan adequacy

### 6.1 Claims with tests

| Claim | Test |
|---|---|
| O_APPEND atomicity | P0 (a): 3 interleaved writers × 200 lines → 600 parseable lines |
| `readSince(seq)` correctness | P0 (b) |
| Replay reconstructs cursors | P0 (c) |
| `resolveLocalUrlToPath` | P0 (d) |
| Claim arbiter first-writer-wins | P1 |
| Expired-TTL reclaim | P1 |
| `wait_for_claim` cross-session | P2 |
| `wait_for_message` mention | P2 |
| Timeout is normal outcome | P2 |
| Abort rejects cleanly | P2 |
| Tier classification (12 cases) | P3 |
| Injection cap (K=10) | P3 |
| Token bucket green/yellow/red | P3 |
| Mute rules | P3 |
| Gap record on retention | P3 |
| Digest ≤ 800 tokens | P4 |
| Hook idempotent | P4 |
| Panel open/close/refresh | P5 |
| Card render + expand + resume | P6 |
| Throwing renderer fallback | P6 |
| Tool cards render | P6 |
| `omp plugin link` | P7 |
| Feature gating | P7 |
| `cover()` tiling | P1b (a) |
| `putNode` out-of-order refusal | P1b (b) |
| `forget` truncation | P1b (c) |
| `zoom` two children | P1b (d) |
| Compactor builds node | P1b (e) |
| Max spend cap | P1b (f) |

### 6.2 Claims with NO test

| Claim | Location | Gap |
|---|---|---|
| `wait_for_agent` resolves from `AgentRegistry.global().onChange` | §4.2 | No test for `wait_for_agent` in P2 acceptance |
| `wait_for_message` `source:"irc"` mode | §4.3 | No test for `source:"irc"` (opt-in) |
| `wait_for_message` `source:"any"` mode | §4.3 | No test for `source:"any"` |
| `room{op:"read"}` with `since` + `limit` | §4.1 | No test for read with cursor |
| `room{op:"topics"}` | §4.1 | No test for topics op |
| `room{op:"mute"}` / `unmute` | §4.1 | No test for mute/unmute ops (only in P3 attention test) |
| `room{op:"tree"}` | §4.1 | No test for tree op (only `cover()` in P1b) |
| `room{op:"recall"}` | §4.1 | No test for recall op |
| Cursor persistence via `appendEntry` | §3.5 | No test for cursor persistence across resume |
| Per-agent lag metric | §3.5 | No test for lag exposure |
| Delivery adapter `sendCustomMessage` | §5.3 | No test for delivery to sibling session |
| Delivery adapter `pi.sendMessage` | §5.3 | No test for delivery to calling session |
| `deliverAs: "steer"` for T0 | §5.3 | No test for steer delivery |
| `deliverAs: "aside"` for T1 | §5.3 | No test for aside delivery |
| T2 never injected | §5.1 | No test for T2 non-injection |
| Rate limit srTCM | §5.2 | No test for rate limiting |
| Drop-oldest for log tail | §5.2 | No test for drop policy |
| Over-quota producers get drop-newest | §5.2 | No test for drop-newest |
| Auto-unmute on participation | §5.2 | No test for auto-unmute |
| Panel narrow-terminal fallback | §6.2 | No test for narrow mode |
| Panel composer | §6.7 | No test for composer |
| Panel live refresh | §6.8 | No test for live refresh |
| Card `room:mention` | §7.3 | No test for mention card |
| Card `room:claim` | §7.3 | No test for claim card |
| Card `room:board-delta` | §7.3 | No test for board-delta card |
| Tool cards `describeCall`/`describeResult` | §7.7 | No test for describe path |
| No-UI fallback | §7.6 | No test for headless mode |
| Routing rule prompt block | §8 | No test for routing rule content |
| `before_agent_start` hook | §6.1 (PLAN) | P4 tests digest presence, not hook mechanics |
| `session_shutdown` prune | §6.1 (PLAN) | P4 tests shutdown < 2 s, not prune |
| Compaction concurrency JOBS=4 | §3.6 | No test for concurrent compaction |
| Compaction max spend 1000/day | §3.6 | P1b (f) tests pause, not recovery |
| Tree rebuild from log | §3.6 T1 | No test for rebuild after forget |
| Raw log stays authoritative | §3.6 T2 | No test for authority |
| No agent blocked on compaction | §3.6 T3 | No test for non-blocking |
| `streamSimple` with `@smol` | §3.6 | P1b (e) mocks stream, doesn't test real call |
| `runEphemeralTurn` fallback | R23 | No test for fallback path |
| `withFileLockSync` fallback | R19 | No test for file lock |

**Severity:** major
**Contradiction:** The test plan covers the happy path for most components but leaves significant gaps:
1. `wait_for_agent` has no test at all in P2
2. Delivery adapter (§5.3) has no tests — the most critical integration point
3. Rate limiting (srTCM) has no test
4. Cursor persistence across resume has no test
5. Panel narrow mode, composer, live refresh have no tests
6. Three of four card types have no tests
7. Tool card `describe` path has no test
8. No-UI fallback has no test
9. Compaction concurrency and recovery have no tests
10. Tree rebuild from log has no test

**Fix:** Add acceptance criteria to P2-P6 for the missing tests, or explicitly mark them as "manual verification" with a checklist.

---

## 7. Unstated assumptions

### 7.1 Single-threaded event loop

**Assumption:** The PLAN relies on JS single-threaded execution for atomicity (I1: "the JS thread makes a sync critical section atomic"). This is stated in I1 but not called out as an assumption that could break if omp ever uses worker threads for tool execution.

**Severity:** minor
**Fix:** Add to §1.3: "4. Tool execution is single-threaded within a process (JS event loop). If omp ever uses worker threads for parallel tool execution, the sync atomicity guarantee breaks."

### 7.2 One process

**Assumption:** The room is in-process only (§1.2). But the PLAN does not state what happens if a second omp process starts with the same `local://` root. R19 mentions this as a risk but the fallback (`withFileLockSync`) is not designed into the store.

**Severity:** minor
**Fix:** Add to §1.3: "5. Only one omp process writes to a given `local://` root at a time. A second process would tear the log."

### 7.3 Stable agent ids

**Assumption:** Agent ids are stable across revival (mentioned in R2 §2 table: "Revival | parked agents revived on demand; same id"). But the PLAN does not state what happens if an agent id changes (e.g., after a session resume with a different id).

**Severity:** minor
**Fix:** Add to §1.3: "6. Agent ids are stable across park/revive cycles. If an id changes, the room treats it as a new member."

### 7.4 Room file surviving

**Assumption:** The room log file at `<root>/room/<roomId>.jsonl` survives across sessions. The PLAN does not address what happens if the file is deleted or corrupted.

**Severity:** minor
**Fix:** Add to §1.3: "7. The room log file is durable. If it is deleted, the room starts empty (no recovery). If it is corrupted, malformed lines are ignored (house precedent)."

### 7.5 `local://` root persistence

**Assumption:** The `local://` root (artifacts dir or tmpdir) persists across sessions. The PLAN does not address what happens if the root is cleaned up between sessions.

**Severity:** minor
**Fix:** Add to §1.3: "8. The `local://` root persists across sessions. If it is cleaned up, the room starts empty."

### 7.6 `AgentRegistry.global()` availability

**Assumption:** `AgentRegistry.global()` is always available when the room tool executes. The PLAN does not address what happens if the registry is not yet populated or has been cleared.

**Severity:** minor
**Fix:** Add to §1.3: "9. `AgentRegistry.global()` is available when the room tool executes. If it is empty, the room has no members."

### 7.7 `ctx.agent.id` stability

**Assumption:** `ctx.agent.id` is stable for the lifetime of a tool call. The PLAN does not address what happens if the agent id changes mid-call.

**Severity:** nit
**Fix:** No action needed — this is a reasonable assumption.

---

## 8. Out-of-scope leakage

### 8.1 §1.2 declares cross-process out of scope; R19 mentions it

**Contradiction:** §1.2 says "Cross-process rooms" are out of scope. R19 says "A second process writing the same room log breaks the in-process atomicity assumption" with fallback `withFileLockSync`.

**Severity:** minor
**Fix:** R19 is a risk acknowledgment, not a design requirement. No fix needed, but could add "R19 is a risk acknowledgment only; cross-process is out of scope per §1.2."

### 8.2 §1.2 declares restricted children out of scope; R17 mentions them

**Contradiction:** §1.2 says "Restricted / plan-mode children" are out of scope. R17 says "Restricted / plan-mode children never receive extension tools."

**Severity:** none — R17 is a risk acknowledgment, not a design requirement

### 8.3 §1.2 declares intercepting native `agent://` out of scope; §4.3 `source:"irc"` uses `IrcBus.wait`

**Contradiction:** §1.2 says "Intercepting native `agent://` traffic" is out of scope. §4.3 `source:"irc"` uses `IrcBus.wait` which consumes a message from the bus — this is intercepting native traffic.

**Severity:** major
**Fix:** Either (a) remove `source:"irc"` from the v1 enum, or (b) add a note to §1.2: "`source:"irc"` in `wait_for_message` is not interception — it is a blocking wait on the bus, not a tap on the message flow."

### 8.4 §1.2 declares "being the system of record" out of scope; §3.3 says "the file is the durable log"

**Contradiction:** §1.2 says "Being the system of record" is out of scope. §3.3 says "the file is the durable log and `seq` is the cursor unit."

**Severity:** minor
**Fix:** Clarify §1.2: "The room is not the system of record for artifacts; it is the system of record for room messages and claims."

---

## 9. Numbers with no source

### 9.1 Grounded numbers (cited source)

| Constant | Value | Source |
|---|---|---|
| `WAIT_MAX_MS` | 30 min | `src/tools/wait.ts:25` |
| `MAILBOX_CAP` | 100 | `src/irc/bus.ts` |
| `DEFAULT_PEER_ROSTER_LIMIT` | 32 | `src/prompts/system/subagent-system-prompt.md` |
| `TREE_REC` | 288 bytes | OptMem `memo:73` |
| `WAKE_LINES` | 96 | OptMem `memo:50-56` |
| `RAW_MAX` | 16 | OptMem `memo:65` |
| `LOG_REC` | 320 bytes | OptMem `memo:72` |
| `ENTRY_CHARS` | 280 | OptMem `memo:50-65` |
| `retention.ms` | 604800000 (7 days) | Kafka docs |
| `cleanup.policy` | delete | Kafka docs |
| `MaxAckPending` | 1000 | NATS JetStream docs |
| `WaitTimeSeconds` | 20 max | AWS SQS docs |
| `DEFAULT_WAIT_TIMEOUT_MS` | 30000 | Codex `multi_agents_common.rs:23` |
| `MAX_WAIT_TIMEOUT_MS` | 3600000 | Codex `config/mod.rs:265` |
| `summaryInjectionTokenLimit` | 5000 | `omp://memory.md` |
| `SESSION_SHUTDOWN_HANDLER_TIMEOUT_MS` | 2000 | `runner.ts:154` |
| `PROGRESS_INTERVAL_MS` | 500 | `src/tools/wait.ts:26` |
| `STEERING_INTERRUPT_POLL_MS` | 250 | `agent-loop.ts` |
| `idle TTL` | 420000 ms | `omp://tools/task.md` |
| `GET /messages` | 1000 rec / 5000 max | Zulip API |
| `chat.postMessage` | ~1/s/channel | Slack API |
| `log.retention.check.interval.ms` | 300000 | Kafka docs |
| `segment.ms` | 604800000 | Kafka docs |
| `segment.bytes` | 1073741824 | Kafka docs |
| `MaxNumberOfMessages` | 1 | AWS SQS |
| `VisibilityTimeout` | 30 s default / 12 h max | AWS SQS |
| `AckWait` | 30 s | NATS JetStream |
| `lockDuration` | (lease) | BullMQ |
| `JOBS` (OptChat) | 8 | OptChat gist §1 |
| `TRIES` (OptChat) | 5 | OptChat gist §1 |
| `RETRY` (OptChat) | 10 s | OptChat gist §1 |
| `VIEW` (OptChat) | 128000 bytes | OptChat gist §1 |
| `NODE` (OptChat) | 512 bytes | OptChat gist §1 |
| `CAP` (OptChat) | 30000 chars | OptChat gist §1 |

### 9.2 Invented numbers (no cited source)

| Constant | Value | Location | Issue |
|---|---|---|---|
| `maxT1PerTurn` (K) | 10 | §5.2:568 | Anchor: `[F14 §3]`, `[R2 §D]` — but F14 §3 does not cite a specific source for 10; it is a proposal |
| `maxT1Tokens` (B) | 2048 | §5.2:569 | Anchor: `[F14 §3]`, `[R2 §D]` — same; no specific source |
| `coalesceCount` (N) | 20 | §5.2:570 | Anchor: `Zulip/Slack/Mailman precedent` — but no specific source for 20 |
| `coalesceMs` (T) | 300000 (5 min) | §5.2:571 | Anchor: `[F14 §5]` — no specific source |
| `postsPerWindow` (CIR) | 1 post / 2 s | §5.2:572 | Anchor: `RFC 1459 §8.10; Slack 1/s/channel` — RFC 1459 says "1 message every 2 seconds" but this is IRC flood control, not a room post limit; Slack is 1/s not 1/2s |
| `burstPosts` (CBS) | 10 | §5.2:573 | Anchor: `Slack's documented burst tolerance` — no specific source for 10 |
| `claimTtlMs` | 300000 (5 min) | §2.2:155 | No source; invented |
| `logMaxRecords` | 5000 | §2.2:156 | Anchor: Kafka/NATS — but Kafka uses time/size, not count; no source for 5000 |
| `logMaxAgeMs` | 604800000 (7 days) | §2.2:157 | Anchor: Kafka `retention.ms` — grounded |
| `maxT1PerTurn` max | 50 | §2.2:148 | Invented |
| `maxT1Tokens` max | 16384 | §2.2:149 | Invented |
| `coalesceCount` max | 500 | §2.2:150 | Invented |
| `coalesceMs` min | 5000 | §2.2:151 | Invented |
| `postsPerWindow` max | 20 | §2.2:152 | Invented |
| `burstPosts` max | 100 | §2.2:153 | Invented |
| `claimTtlMs` min | 5000 | §2.2:155 | Invented |
| `logMaxRecords` min | 100 | §2.2:156 | Invented |
| `logMaxAgeMs` min | 60000 | §2.2:157 | Invented |
| `JOBS` | 4 | §3.6:378 | Anchor: `Conservative; room has fewer messages than OptChat` — invented; F21-W5 says 8 needed for 10 agents |
| Compaction max spend | 1000 calls/day | §3.6:379 | Anchor: `New invariant (no prior system has one)` — invented |
| Digest token budget | 800 | §5.4 | Anchor: `memory.summaryInjectionTokenLimit = 5000 and the 32-peer roster cap` — 800 is invented (5000 is the native cap, 800 is not derived) |
| Roster cap in digest | 32 | §5.4 | Anchor: `DEFAULT_PEER_ROSTER_LIMIT = 32` — grounded |
| Open claims in digest | top 10 | §5.4 | Invented |
| `splitAt` | 88 | §6.2 | Invented |
| `leftSize` ratio | 0.62 | §6.2 | Invented |
| `rightMinWidth` | 30 | §6.2 | Invented |
| `collapsedLines` | 3 | §7.4 | Invented |
| `expandedLines` | 12 | §7.4 | Invented |
| `line cap` | 100 chars | §7.4 | Invented |
| `recall` cap | 100 | §4.1 | Invented |
| `read` default limit | 100 | §4.1 | Invented |
| `read` max limit | 1000 | §4.1 | Anchor: `Zulip's cap` — grounded (Zulip 1000 rec) |

**Severity:** major
**Contradiction:** Many numeric constants in the settings schema (§2.2) and caps table (§5.2) are invented without cited sources. The PLAN's own AGENTS.md admits: "The routing-rule thresholds and the coalesce/rate-limit constants are proposals, not measured values."
**Fix:** Mark all invented numbers as `[invented]` in the PLAN, or remove them from the settings schema and hardcode them as constants with a comment.

---

## 10. What I checked and found correct

### 10.1 Cross-document consistency

- `R=50` raw tail: PLAN §3.1, §3.6, §5.2, §5.4 all consistent
- `TREE_REC=288`: PLAN §3.1, §3.6, §5.2 consistent
- `WAKE_LINES=96`: PLAN §5.2, §5.4 consistent
- `1000 calls/day`: PLAN §3.6, §5.2, R24 consistent
- `JOBS=4`: PLAN §3.6, §5.2, R3 consistent (but see §1.5 above)
- `content-address`: PLAN R25, R3 §Invalidation consistent (both say do NOT)
- `wait_for_agent` default 30 s: PLAN §4.2, R2 §B, F12 consistent
- `wait_for_message` default 30 s: PLAN §4.3, R2 §B, F12 consistent
- `wait_for_claim` default 20 s: PLAN §4.4, R2 §B, F12 consistent
- `wait_for_claim` max 300 s: PLAN §4.4, R2 §B, F12 consistent
- `interruptible` flags: PLAN §4.2-4.4, AGENTS.md consistent
- `loadMode: "essential"`: PLAN §4.0, AGENTS.md consistent
- `execute` signature: PLAN §4.0, AGENTS.md consistent
- Result contract: PLAN §4.5, AGENTS.md consistent
- Invariants I1-I6: PLAN §3.1, AGENTS.md consistent
- Caps K/B/N/T: PLAN §5.2, AGENTS.md consistent
- Log retention 5000/7 days: PLAN §5.2, AGENTS.md consistent
- Rate limit 1 post/2 s, burst 10: PLAN §5.2, AGENTS.md consistent

### 10.2 Phase coverage

- All 11 deliverables map to phases
- All 10 phases have acceptance checks
- No orphan deliverables
- No empty phases

### 10.3 Risk coverage

- All 28 risks have concrete fallbacks
- No "consider" or "monitor" only fallbacks
- R1-R28 all have evidence citations

### 10.4 Brief coverage

- All Addendum A questions answered by R2
- All Addendum B questions answered by R3

### 10.5 AGENTS.md accuracy

- Caps and constants match PLAN
- Tool names and interruptibility match PLAN
- Invariants match PLAN
- State and paths match PLAN
- Panel description matches PLAN
- Only error: phase count (9 vs 10)

---

## 11. Summary of findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1.1 | major | `wait_for_claim` `ttl` unit: PLAN says ms, R2/F12 say seconds | Standardise on ms; update R2/F12 |
| 1.2 | minor | `wait_for_message` `source` param in PLAN not in R2 | Add note to R2 |
| 1.3 | minor | `room` tool ops: §1.1 lists 8, §4.1 lists 12 | Update §1.1 to list all 12 |
| 1.4 | minor | `loadMode`: R1/R2 say discoverable, PLAN says essential | Add note to R1/R2 |
| 1.5 | major | `JOBS=4` vs F21-W5 says 8 needed for 10 agents | Increase to 8 or add tuning note |
| 2.1 | major | AGENTS.md says 9 phases; PLAN has 10 | Update AGENTS.md |
| 6.2 | major | Test plan gaps: `wait_for_agent`, delivery adapter, rate limiting, cursor persistence, panel narrow/composer/refresh, 3 card types, tool card describe, no-UI fallback, compaction concurrency/recovery, tree rebuild | Add acceptance criteria or manual checklist |
| 8.3 | major | §1.2 says intercepting `agent://` out of scope; §4.3 `source:"irc"` uses `IrcBus.wait` | Remove `source:"irc"` or add note to §1.2 |
| 9.2 | major | Many numeric constants invented without cited sources | Mark as `[invented]` or remove from settings |
| 7.1 | minor | Unstated assumption: single-threaded event loop | Add to §1.3 |
| 7.2 | minor | Unstated assumption: one process | Add to §1.3 |
| 7.3 | minor | Unstated assumption: stable agent ids | Add to §1.3 |
| 7.4 | minor | Unstated assumption: room file surviving | Add to §1.3 |
| 7.5 | minor | Unstated assumption: `local://` root persistence | Add to §1.3 |
| 7.6 | minor | Unstated assumption: `AgentRegistry.global()` availability | Add to §1.3 |
| 8.1 | minor | R19 mentions cross-process despite §1.2 out of scope | Add note to R19 |
| 8.4 | minor | §3.3 says "durable log" despite §1.2 "not system of record" | Clarify §1.2 |

---

## 12. Verdict

The corpus is **largely consistent** across rounds. The major findings are:

1. **`wait_for_claim` `ttl` unit ambiguity** (ms vs seconds) — must fix before build
2. **`JOBS=4` too low** per F21-W5's own analysis — must fix before build
3. **AGENTS.md phase count wrong** (9 vs 10) — must fix before build
4. **Test plan gaps** — delivery adapter, `wait_for_agent`, rate limiting, cursor persistence untested
5. **`source:"irc"` out-of-scope leakage** — must resolve before build
6. **Many invented numeric constants** — should mark or remove

The minor findings (§1.1 op list, §1.3 assumptions, R19 cross-process note) can be fixed in a follow-up pass.

**Overall correctness:** incorrect (6 major findings must be fixed before build)
**Confidence:** 0.92
