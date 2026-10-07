# D1 — Meta-review (round 4)

Reviewer: D1 lens. Target: the three prior rounds' fixes and the current plan.
Full detail at `agent://D1MetaReview`. **Orchestrator adjudication: all three sampled claims verified.**

**Verdict: the process worked at the individual-fix level, but has a systematic blind spot —
it checks each fix against the plan, never the plan against itself.** 6 wrong fixes and 5
internal contradictions remain.

## W1 — K5's replacement cap is still below the measured band · **CONFIRMED (mine, wrong)**

Plan `:1346-1349` says verbatim: *"Hard cap: **2500 tokens** `[calibrate]` … 2500 sits inside the
measured band."* But the same paragraph records the measured band as **≈2,700–3,650 tokens**.
2500 < 2700. The fix raised the cap and then asserted a false relationship to the measurement.

**Fix:** set the cap from the measurement, not below it — 3800 `[calibrate]` (band max + margin),
or reduce the digest content so the band itself fits under 2500. Do not claim "inside the band"
for a value outside it.

## W2 — K4's cap still cannot keep the tree current · **CONFIRMED (mine, wrong)**

Plan `:717` says: *"20 000/day ≈ 2× the per-window demand, so one full rebuild per day is
possible, and the tree lags by design."*

The arithmetic is internally consistent but the conclusion is misleading. At 5 posts/s the
retention window turns over **~86×/day** (86400 s ÷ 1000 s per window). Keeping the tree current
needs 10,000 calls × 86 ≈ **860,000 calls/day**. The 20,000 cap permits **2 rebuilds/day** — the
tree is permanently **~43× behind**, not "lagging by design".

**Fix:** either (a) state plainly that the tree covers only the *oldest* retained region and will
never track the tail — with the raw tail as the real fallback; or (b) drop the tree from v1
(which D5's economics independently recommend: it is the only component with real LLM cost).
Do not describe a 43× shortfall as a design choice.

## W3 — K7's config override is dead code · **CONFIRMED**

Plan `:240-245`: *"A manifest/config override (settings.roomId, §2.2) wins when non-empty."*
But §2.2 and R6 (both corrected in round 2) state the 11 manifest settings are **unreachable from
extension code**. The override path cannot read them. A mechanism was added that the plan's own
finding says cannot work.

**Fix:** delete the manifest override from `roomIdFor`; if an override is wanted it must come from
the plugin-owned `local://room/config.json` (the R6 path), not the manifest.

## W4 — K12's T0 notice cannot be targeted · **CONFIRMED**

Plan §5.1's release case returns T0 when `record.from === viewer.agentId` or
`reason ∈ {reclaimed, expired}`. But the `release` record (`:454`) carries `from` = **the agent
who released**, and has **no previous-holder field**. So when B reclaims A's claim:
- `from` is B → B gets T0 (wrong: B lost nothing);
- `reason === "reclaimed"` → *everyone* gets T0 (wrong: unfiltered broadcast);
- the actual previous holder A gets T0 only by accident.

**Fix:** add `prevHolder: string` to the `release` record (set by the arbiter/sweep), and classify
on `record.prevHolder === viewer.agentId` for the eviction notice. Keep `reason` out of the tier
predicate.

## Prediction (D1's, carried)

The 3 most likely remaining defects, with location:
1. the digest path will read `record.body` on non-`msg` records (the K2 fix landed in `deliver`
   but the digest has its own body access);
2. the claim-sweep's `release` record will carry the wrong `from` (W4);
3. the test harness will call `execute()` with 4 args instead of 5 (the real signature is
   `(toolCallId, params, signal, onUpdate, ctx)`).

## Other reported (unverified by the orchestrator; carried)
K15 store↔sweep cycle risk; and 5 plan-internal contradictions listed in the full report.

## The systematic finding
Every round so far audited *fixes against the plan*. None audited *the plan against itself*.
D1 is the first lens to do that, and it found 3 wrong fixes immediately. **This is the lens to
keep running.**
