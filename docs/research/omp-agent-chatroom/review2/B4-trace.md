# B4 — End-to-end trace (adversarial review, round 2)

Reviewer: B4 lens. Target: `PLAN-build.md` (post-fix). Five scenarios traced step by step.
Full trace at `agent://B4Trace`. Orchestrator adjudication below.

## Verdict per scenario (reviewer)

| Scenario | Result |
|---|---|
| S1 — two agents race for one resource | 2 BREAKs (auto-acquire semantics; tier for non-holders) |
| S2 — late joiner with a compressed backlog | see full trace |
| S3 — correction while target is mid-turn | see full trace |
| S4 — session switch while the panel is open | see full trace |
| S5 — subagent finishes then is revived | see full trace |

## BREAKs reported

### S1-1 — `wait_for_claim` auto-acquisition unspecified · MAJOR
Plan §4.4 says the oldest waiter "is resolved" on release/reclaim/expiry, and the `ttl` param is
documented as "lease ms granted if free". It never states whether resolution means *notified*
(`{outcome:"event", acquired:false}`) or *auto-acquired* (`{outcome:"event", acquired:true,
claim}`). Two implementers produce different tools.
**Fix:** state it explicitly, plus the re-queue case if another agent takes it first.

### S1-2 — tier classification of `claim`/`release` for non-holders unspecified · MAJOR
§5.1's T1 triggers cover "status change on a claim you hold" but never say what tier a claim
record is for an agent who is neither holder nor contender. Given N1 made the predicate total,
an unmatched record defaults to T2 — but that means contenders can miss the very event they are
waiting for.
**Fix:** classify `claim` records for a *waiter* on that resource as T1.

## Orchestrator adjudication

**S1-1 — CONFIRMED.** The plan's `ttl` wording ("granted if free") implies acquisition while the
resolution text implies notification. Genuine ambiguity; a builder must guess. Accept the fix.

**S1-2 — CONFIRMED and it interacts with the N1 fix.** Making the predicate total (N1) resolved
the *ambiguity* but not the *correctness*: defaulting an unmatched claim record to T2 means a
blocked contender gets no push. The predicate must add "you are waiting on this resource" as an
explicit T1 membership signal. Accept the fix.

**S2-S5** — read the full trace at `agent://B4Trace` for step-level detail; BREAKs there are
carried into the fix list with the same adjudication rule (confirm against source before acting).
