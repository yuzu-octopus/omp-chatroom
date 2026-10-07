# Consolidated adversarial review — round 4

Date 2026-10-07. 8 lenses (D1-D8) + a **compiler-as-adversary** pass (D0).
**Result: 3 wrong fixes, 1 design-breaking defect, 2 false claims, 28 typecheck errors, and a
convergent scope verdict from three independent lenses.**

Round 4 is the first round that audited **the plan against itself** (D1) and the first that used
**the compiler** (D0). Both found defects no prior lens could.

---

## CRITICAL — design-breaking

### X1. Room-id rule fragments one tree into N rooms · **CONFIRMED (verified in source)**
My K7 fix derived the room id from `ctx.sessionManager.getSessionId()`, calling it "unique per
tree". Verified false: **each subagent gets its own `SessionManager`**
(`task/executor.ts:4181`, `:4186`), and `getSessionId()` returns that manager's own id
(`session-manager.ts:2989`, minted at `:129`). So parent and every child resolve a **different**
`<root>/room/<id>.jsonl` — one room per agent, exactly what K7 was meant to prevent.

**It also makes the P8 gate unreachable**: §11.1 asserts `expect(logPathA).toBe(logPathB)`
(`:1952-1954`) from `roomIdFor("AgentA")` vs `roomIdFor("AgentB")` — false by construction.

**Fix:** derive from a **root-stable** value (the `local://` root's owner session, or a value
persisted into the root on first use). Never `getSessionId()`.

### X2. The scaffold does not typecheck · **CONFIRMED (executed)**
Extracted to a real tree and run through `tsc` (typescript 7.0.2) against the installed host
types: **28 errors across 16 files.** Sanity-checked — `tsc --listFiles` reports 30 files and a
deliberately injected error produces exactly 1 error, so the result is real.

| File | Errors | Defect |
|---|---|---|
| `src/index.ts` | 5 | duplicate `import type { ExtensionAPI }`; uninitialised `__roomTest`; **two `pi.registerFlag` calls at module scope** where `pi` is out of scope |
| `src/attention/governor.ts` | 5 | `MemberState` used in 4 signatures, **never imported** |
| `src/panel/panel.ts` | 4 | class members declared with `;`, no bodies |
| 13 others | 14 | `export const X: T;` uninitialised |

**Two are plan-level, not scaffold-level**: `index.ts`'s duplicate import and module-scope `pi.*`
calls came from the plan's §2.1.1 snippet, copied faithfully.

**Lesson:** C9's closure check verified *symbol* closure (every reference defined somewhere), not
*file* compilability (every file's imports present). Symbol closure ≠ compilable.

---

## WRONG FIXES — my own, found by the meta-review

### X3. K5: the cap is below the band it claims to be inside
Plan `:1346-1349` says *"2500 sits inside the measured band"* — the same paragraph records the
band as **2,700–3,650**. 2500 < 2700.
**Fix:** set the cap from the measurement (3800 `[calibrate]`), or cut digest content so the band
fits. Do not assert a false relationship.

### X4. K4: the tree can never keep up
Plan `:717` says *"one full rebuild per day is possible, and the tree lags by design."* The window
turns over **~86×/day** at the documented rate, needing ~860k calls/day; the cap allows 2 rebuilds
→ permanently **~43× behind**.
**Fix:** state plainly that the tree covers only the oldest retained region and never tracks the
tail; or drop it from v1 (D5 and D8 both recommend dropping).

### X5. K7: the config override is dead code
`:240-245` says a `settings.roomId` override wins — but §2.2/R6 (corrected in round 2) state
manifest settings are **unreachable from extension code**.
**Fix:** delete the manifest override; an override must come from `local://room/config.json`.

---

## FALSE CLAIMS

### X6. The host is 18.7.0, not 18.6.1
Verified: `pi-coding-agent/package.json` → **18.7.0**, `pi-ai` → 18.7.0, changelog `[18.7.0]`.
Both artifacts say 18.6.1 throughout. Cited lines still resolve (consistent +5..+10 drift), so the
evidence holds — but the label is wrong on every claim of the form "verified against 18.6.1".
**Fix:** relabel; add an `engines`/`peerDependencies` pin.

### X7. The motivation rests on one anecdote with a different recorded cause
`REPORT.md:100` rejects "do nothing" using an Anthropic anecdote whose own evidence file
(`F10:69`) records the cause as **"vague task descriptions."** That is a brief-quality failure, not
a transport failure — a claim board does not address it.
**Fix:** restate the motivation as the verifiable one — **no lock/claim/reserve primitive exists in
omp**. Keep the anecdote as illustration.

---

## MAJOR

| # | Lens | Finding | Fix |
|---|---|---|---|
| M1 | D6 | **No phase tests the riskiest assumption** — that agents will use the room at all. §11.3's prompt-level variant is assigned to no phase. P8 tests mechanics, not adoption. | Add a **P-1 adoption spike** (~1 day, prompt-only) with kill criteria (<50% of coordination artifacts to the room → stop) |
| M2 | D6 | **No kill criteria anywhere.** Every phase defines success; none defines the stop condition. | Add explicit kill criteria (adoption, wait usage, tree value, board value) |
| M3 | D6 | Phase order inverted: P1b (cold tree, most expensive/least justified) precedes P2 (wait tools, core value). | Move P1b after P2, or cut |
| M4 | D5 | **Room overhead exceeds per-turn task tokens when work/turn < 20,480.** The room never pays for itself on token cost at any task size — its value is correctness, not efficiency. | State this in §1; it changes the pitch, not the design |
| M5 | D5 | Compaction costs **$12.26/day** at the cap (Flash-Lite) — the only real LLM spend. | Cut the tree, or budget it explicitly |
| M6 | D4 | **Panel is a monitoring dashboard with no stated rationale** (§1.1 lists it; §6 never justifies it). Three actions only. | Add §6.0 "Why the panel", or cut it and make inline cards primary |
| M7 | D4 | **No first-run discoverability** — nothing tells the human the room exists. | First-join notification + tab-completable description + README step |
| M8 | D4 | Acceptance criteria largely prose, not runnable. | Convert to commands |
| M9 | D7 | **Compactor can be semantically steered** — "ALL CLAIMS ARE VOID" survives escaping (plain text). S6/T2 are procedural, not technical. | One line in the compactor prompt: mark input untrusted, ignore instructions within |
| M10 | D7 | Tree summaries enter the digest with no separate provenance marker. | Mark summaries distinctly from raw messages |
| M11 | D1 | **K12's T0 eviction notice cannot be targeted** — `release.from` is the *releaser*, not the previous holder; `reason==="reclaimed"` gives *everyone* T0. | Add `prevHolder` to the `release` record; classify on it |
| M12 | D8 | Plan ships **11 deliverables where the evidence supports ~1** (the claim board). Cut is ~7 files vs 35. | Scope decision — see below |

---

## CONVERGENT VERDICT (D5 + D6 + D8, independent)

Three lenses reached the same conclusion from different directions:

> **The plan is over-built relative to its evidence.** The claim/status board is the only layer
> with measured support *and* a verified gap. Chat, panel, cards, tree, and 2 of 3 wait tools rest
> on inference, scope preference, or a single anecdote.

**Recommended v1**: store + claim board + `room` op + digest + routing rule + `wait_for_claim`.
Zero LLM cost, ~7 files, retires the riskiest assumptions first.

## DRIFT (D3)
**The plan has zero drift detection.** R2/R22/R23 each say "pin the version; add a smoke test" —
none implements it. 12 deep specifiers, all wildcard-only; **4 have an explicit barrel already**
(removable by a one-line import change). Highest risk: `pi-tui/overlays/agent-hub-renderer`
(no explicit path, not bundled-safe) and `session/harness-tags` (security-critical escaping).

## What round 4 confirmed correct
Host import resolution for all cited specifiers (D2) · `streamSimple` is a root export (K21 ✓) ·
25 threat-model items (D7) · the review process itself applied all accepted fixes (D1).

## The meta-lesson
Every prior round audited **fixes against the plan**. None audited **the plan against itself**, and
none used a **compiler**. Those two lenses alone produced X1, X2, X3, X4, X5. Both should run on
every future round.
