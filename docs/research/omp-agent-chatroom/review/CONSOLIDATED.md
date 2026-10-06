# Consolidated adversarial review — omp-agent-chatroom

Date 2026-10-06. 8 lenses (A1-A8). Every finding adjudicated against installed omp 18.6.1 source.
**Verdict: 3 refuted, 22 confirmed, applied below.**

## Refuted (do NOT act on these)

| # | Lens | Claim | Why refuted |
|---|---|---|---|
| X1 | A5-4.3 | "`interruptible` is never read by the agent loop" | Lens grepped only `pi-coding-agent/src`. The loop is in `pi-agent-core`: `agent-loop.ts:3269` reads `tool?.interruptible`, resolves boolean-or-fn at `3271-3281`, selects the signal at `3287-3288`. A1 independently confirmed the same path. |
| X2 | A1-R1 | "Plan claims a subagent's shutdown kills a parent's timer" | Plan R11 says the opposite verbatim (`PLAN-build.md:1105`). Lens misread. |
| X3 | A1-R2 | "`handle.get(pi.pi.settings)` conflates Settings with the registry" | Plan imports `lookup` from `config/registry` and passes Settings as the *scope* (`:165-168`), which is the documented contract. The lens's proposed fix (`pi.pi.settings.get("id")`) does not exist — `Settings` has no such method. |

## Confirmed — security (A7)

| # | Sev | Defect | Fix |
|---|---|---|---|
| S1 | critical | `deliver()` sends `record.body` verbatim; no `escapeHarnessTags` | Escape on delivery + per rendered line. Native: `irc-bridge.ts:189`, `harness-tags.ts:14-16`. |
| S2 | high | Rendered body not ANSI-sanitised | `sanitizeText()` from `@oh-my-pi/pi-utils` (`sanitize-text.ts:23-38`) on every rendered line. |
| S3 | high | Log records not validated on read | Validate against the `RoomRecord` schema on replay; quarantine with a `gap` record. |
| S4 | high | `from` derivation not stated | State: `from` is always `ctx.agent.id`, never a tool parameter. |
| S5 | high | Retention settings exist but no pruning job | Specify the pruning job + interval; cap the in-memory array. |
| S6 | medium | Summaries are advisory, not marked so | Document; record the covered seq range on every tree node. |
| S7 | low | `wait_for_claim` livelock | Document; consider `maxWaitMs`. |

Defended already: path traversal (`local-resolve` guards), `wait_for_message` `irc` consumption (R8).

## Confirmed — concurrency/lifecycle (A2)

| # | Sev | Defect | Fix |
|---|---|---|---|
| C1 | major | "Stop at first failure" **contradicts its own cited precedent** | `blob-broker/savings.ts:95-103` uses `continue` — skip malformed lines and keep parsing. Adopt that; a torn line must not drop all later records. |
| C2 | major | Atomicity claim overstated for multi-KB records | Scope the claim to "single-threaded JS, single process"; a cross-process writer can tear a partial-write loop. |
| C3 | major | No test for torn-line-then-valid-records | Add it to §11. |

## Confirmed — tree (A4)

| # | Sev | Defect | Fix |
|---|---|---|---|
| T1 | blocker | "OptMem's `cover()` is two-region" is **false** | Verified: `cover(T,budget)` tiles `[0,T)` as ONE list of aligned power-of-two blocks; raw and compressed interleave. The plan's raw-tail+cold-tree split is a **new adaptation**, not a copy. Correct the wording and justify it. |
| T2 | major | Dense-prefix CAS is not atomic with the write | `streamSimple` awaits between the check and the write. Add an explicit write mutex so check+write are atomic. |
| T3 | major | `TREE_REC=288` overflow unhandled | OptMem `die()`s (`memo:296-299`). Specify truncation. |

## Confirmed — tools/UX (A5)

| # | Sev | Defect | Fix |
|---|---|---|---|
| U1 | blocker | BM25 justification is stale | BM25 was removed (`settings.ts:3173-3176`). Correct statement: `essential` → top-level; `discoverable` → mounted under `xd://` (`xdev.ts:79-82`, `sdk.ts:4019-4029`). |
| U2 | major | `setActiveTools` fallback clobbers the user's tool set | Drop it. |
| U3 | major | `wait_for_agent` `agents` optional = footgun | Make it required. |
| U4 | major | `wait_for_message` `source:"irc"` | Remove `"irc"` from the v1 enum. |
| U5 | major | No progress/cancel path for a long block | 500 ms `onUpdate` heartbeat; abort returns `{outcome:"aborted"}`. |
| U6 | major | Missing/unwritable/corrupt room file: no user-visible error | Specify all three. |
| U7 | major | Routing clause 10 unexecutable; clauses 1/6 and 3/5 conflict | Delete 10; add the correction clause; merge 7/8. |
| U8 | minor | `outcome` not host-read; `ttl` unit; digest truncation order; op cheat-sheet | Document each. |

## Confirmed — attention (A3)

| # | Sev | Defect | Fix |
|---|---|---|---|
| N1 | blocker | Tier classification not total ("participated in" undefined for reply-to-reply) | Define membership explicitly; default T2. |
| N2 | blocker | `deliverAs:"aside"` when **idle** starts a full turn | Verified at `agent-session.ts:8446+`. T1 must not claim step-boundary-only for idle targets. |
| N3 | blocker | T0 `steer` when idle also starts a turn | State it. |
| N4 | major | T0 "1 pending" bound not in source (`#interrupts` unbounded) | Mark as plugin-imposed, not inherited. |
| N5 | major | T0 rate-limit exemption is a DM flood bypass | Bound it. |
| N6 | major | `threadRoot` semantics undefined | Define. |
| N7 | major | Single message > B=2048 unhandled | Define truncation. |

## Confirmed — UI (A6)

| # | Sev | Defect | Fix |
|---|---|---|---|
| I1 | blocker | `ctx.signal` does not exist on `ExtensionContext` | Verified: absent from `types.ts:485-603`. Remove; abort via `session_shutdown` → `done()`. |

Note: A6's output degenerated (one finding repeated 10×). Its "checked and found correct" list is
still useful and is preserved in `A6-ui-feasibility.md`.

## Confirmed — consistency (A8)

| # | Sev | Defect | Fix |
|---|---|---|---|
| P1 | major | `ttl` ms vs seconds across PLAN/R2/F12 (1000×) | Standardise on ms everywhere. |
| P2 | major | `JOBS=4` contradicts F21-W5 saturation analysis | Raise to 8 and note the basis. |
| P3 | major | AGENTS.md says "9 phases"; §9 has 10 (P0,P1,P1b,P2..P8) | Fix AGENTS.md. |
| P4 | major | §1.1 says 8 room ops; §4.1 says 12 | Reconcile. |
| P5 | major | `source:"irc"` contradicts §1.2 out-of-scope | Resolved by U4 (remove `irc`). |
| P6 | major | ~20 numeric constants uncited | Mark `[invented]` / `[calibrate]`. |
| P7 | major | Test-plan gaps (delivery adapter, wait_for_agent, rate limit, cursors, tree rebuild, no-UI, 3 card types) | Add to §11. |
| P8 | minor | §1.3 missing 6 assumptions | Add them. |
