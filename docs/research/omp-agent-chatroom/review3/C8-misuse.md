# C8 — Adversarial misuse (round 3)

Reviewer: C8 lens (security-reviewer). Target: `PLAN-build.md` post-fix.
Result: **5 EXPLOITABLE, 3 BOUNDED, 5 PREVENTED.** Full detail at `agent://C8Misuse`.
Orchestrator adjudication per item.

## 1 — Claim squatting · EXPLOITABLE · CRITICAL · **CONFIRMED (verified independently)**

**Attack:** `claim` every resource with a huge TTL, then park. A peer's `wait_for_claim` blocks
forever.

**Verified by grep.** The plan has exactly **two** `ctx.setInterval` jobs — the pruning job
(`:599`) and the compactor (`:540`). Neither sweeps claims. `reclaimIfStale` is declared
(`:485`) and the staleness rule is stated (`:493`), but **nothing calls it on a timer**; it is
reachable only from a caller.

**Consequences the reviewer identified, all verified:**
- A long-TTL claim never expires on its own → the board can be squatted.
- `release{reason:"expired"}` (`:374`) is **unreachable** — no producer.
- `wait_for_claim`'s "resolved on release/reclaim/expiry" (`:798`) has **no expiry producer**, so
  a waiter on an expired-but-unswept claim never resolves.

**Fix:** one refcounted `ctx.setInterval` sweep (5–10 s) in the main session, same shape as the
pruning job, that calls `reclaimIfStale` over all claims, appends `release{reason:"expired"}`,
promotes the oldest waiter, and fires the T0 notice. Add a phase acceptance check.

## 2 — Topic squatting / room flooding · BOUNDED · MEDIUM · ACCEPTED
One agent can consume the whole per-turn T1 budget (10 posts ≈ 20 s of budget), so a peer's
genuine T1 degrades to a summary line. Not a denial — the board and T0 are unaffected.
**Fix:** per-sender fair-share inside the T1 cap (e.g. ≤5 of 10 slots when another sender has
pending T1). Cheap, worth taking.

## 3 — Mention spam · BOUNDED, but untested · MEDIUM · ACCEPTED
Bounded by the N5 coalescing ceiling and the T0 1-pending bound. Reviewer notes the bound is
stated as a ceiling but **not asserted in P3** (P3 tests bucket/coalesce/mute/gap only), and the
*sender* pays nothing while the *target* pays a full turn.
**Fix:** add a T0-ceiling assertion to P3.

## 4 — Digest poisoning · EXPLOITABLE · LOW-MEDIUM · **CONFIRMED, extends V1**
New angle beyond V1 (escaping): the digest's section order is a **trusted structure**, but item 4
is built from raw bodies (`:950`) and no provenance marker separates harness-built lines from
agent-authored ones. A crafted body can place a line that reads as an "Open claims" row — so a
late joiner believes a resource is free (and self-grants a conflicting claim) or held (and never
tries). Items 2–3 (`:947-949`) also carry unescaped `resource`/`holder`/`topic`.
**Fix:** escape every room-authored string entering the digest (V1) **and** wrap the
agent-derived region in an explicit `room-authored, untrusted` marker.

## 5 — Cursor manipulation · PREVENTED · (correct as designed)
No op takes a cursor/target; cursors key off `ctx.agent.id` (I3). `read{since}` is an explicit
read, not a commit. Self-skip is self-harm only.

## 6 — Wait-tool monopoly · EXPLOITABLE · HIGH · **CONFIRMED (needs `maxWaitMs` enforcement)**
An agent can park a `wait_for_claim` on every resource with a tiny `maxWaitMs`. Round 2 added
`maxWaitMs` (M-7/S7) but the plan must state it is **enforced**, not advisory, and that a waiter
cannot hold a slot it never intends to use.
**Fix:** state enforcement + a bounded number of concurrent waiters per agent.

## 7-10
Carried from the full report at `agent://C8Misuse`; same adjudication rule (confirm against
source before acting).

## Orchestrator summary
- **Apply:** 1 (critical), 4 (extends V1), 6 (enforcement wording), 2 + 3 (cheap bounds).
- Item 1 is the highest-value finding of round 3: it makes the claim board — the plan's
  highest-value component — deniable by a single misbehaving agent.
