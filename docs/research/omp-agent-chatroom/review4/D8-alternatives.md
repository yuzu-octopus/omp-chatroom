# D8 — Alternatives steelman (round 4)

Reviewer: D8 lens. Full per-alternative case/objection/verdict at `agent://D8Alternatives`.
**Orchestrator adjudication: the room-id finding is verified and is a design-breaking defect.**

## W5 — K7's room-id rule fragments one tree into N rooms · **CONFIRMED — design-breaking**

**Plan text** (§2.1.2, my K7 fix): the room id derives from `ctx.sessionManager.getSessionId()`,
justified as *"stable per tree and unique per tree."*

**Verified false.** Each subagent is built with its **own `SessionManager`**:
`task/executor.ts:4181` (`SessionManager.open(sessionFile, …)`) and `:4186`
(`SessionManager.inMemory(effectiveCwd)`). `getSessionId()` returns that manager's own
`#sessionId` (`session-manager.ts:2989`), minted fresh (`:129` `Bun.randomUUIDv7()`).

**Consequence:** `roomIdFor(parent) !== roomIdFor(child)`, so the parent and every child resolve a
**different** `<root>/room/<id>.jsonl`. The plugin creates one room *per agent*, not one per tree —
exactly the fragmentation K7 was written to prevent, reintroduced one level down.

**And it makes the plan's own gate unreachable:** §11.1 asserts
`expect(logPathA).toBe(logPathB)` (`PLAN-build.md:1952-1954`) after building both paths from
`roomIdFor("AgentA")` and `roomIdFor("AgentB")`. Those ids differ by construction, so **P8 can
never go green**.

**Correct fix:** derive the room id from something stable across the whole tree. The `local://`
root is already shared by subagents (that is the premise of the whole design), so the room id must
come from a **root-stable** value — the owner session of the root, or a constant, or a value
written into the root on first use. Do NOT use `getSessionId()`.

## W6 — the motivation rests on one anecdote whose recorded cause is different · CONFIRMED

`REPORT.md:100` rejects "do nothing" using a single Anthropic anecdote (a subagent on the 2021
chip crisis while two covered 2025 supply chains). But `findings/F10-failure-modes-costs.md:69`
records the cause as **"vague task descriptions."** Vague delegation is a brief-quality failure,
not a transport failure — an agent that does not know what to do cannot usefully decide what to
claim, so a claim board does not address the cited harm.

**Fix:** restate the motivation as the **verifiable** one — no lock/claim/reserve primitive exists
in omp (`tools/builtin-names.ts` has none). That is checkable and strong enough alone. Keep the
anecdote as illustration, not as the load-bearing argument.

## W7 — the plan ships 11 deliverables where the evidence supports ~1 · CONFIRMED

| Layer | Evidence |
|---|---|
| **Claim/status board** | the only layer with measured support AND a verified gap (no claim primitive in omp) |
| Chat log | inference; R1 measured evidence is *against* unbounded shared context |
| Panel | no rationale in §1.1 (D4 agrees) |
| Inline cards | scope preference |
| Cold tree | inference; ~400 lines + the only real LLM cost (D5 agrees) |
| 2 of 3 wait tools | inference; R2 recorded the wait-usage assumption as untested (D6 agrees) |

**Recommendation:** cut v1 to store + claim board + `room` op + digest + routing rule +
`wait_for_claim`. **~7 files against 35.** The dropped layers are exactly where the risk table
concentrates, and D5 independently found the same cut is the only zero-LLM-cost variant.

## Orchestrator verdict on the round
D8 and D6 and D5 converge on the same conclusion from three directions: **the plan is over-built
relative to its evidence.** That is a scope decision for the user, not a defect to patch — but the
room-id defect (W5) and the two wrong fixes (W1, W2) must be corrected regardless.
