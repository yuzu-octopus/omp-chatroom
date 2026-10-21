# Plan 020: the effectiveness round — what the research says, and what we change

> **Executor instructions**: read this plan fully before starting. Run the verification commands and
> confirm the expected results. Update the status row in `plans/README.md` when an item lands, and
> add a dated addendum to `docs/research/omp-agent-chatroom/PLAN-build.md` for any change that
> supersedes the §7.3 spec or a §5.2 cap (the plan body is a historical record).
>
> **Drift check (run first)**:
> `git diff --stat <commit>..HEAD -- plugin/src/store/claims.ts plugin/src/store/schema.ts plugin/src/tools/room.ts`
> If those files changed since this plan was written, compare the "Current state" facts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (several items; each lands separately)
- **Risk**: MEDIUM (schema and log-format changes; the log reader must stay compatible with rooms
  written by older builds)
- **Depends on**: none (the research round, `docs/research/large-swarm-coordination/`)
- **Category**: mechanics + measurement + guidance
- **Planned at**: 2026-10-20, host 18.12.3

## Why this matters

The plugin's primitives are the right shape, and the room works. What it does not do is make a swarm
coordinate *well*. The research round (`docs/research/large-swarm-coordination/REPORT.md`) looked for
what other systems and the literature do about that, with primary sources only. Three conclusions
came out of it that change what we build:

1. **Guidance changes process and cost, not outcome.** The strongest evidence (Collaboration Tax)
   is that one system-prompt clause per cascade stage closes ~38 % of the coordination tax at zero
   mechanical cost — but it is **dyadic (N=2)** and the authors say N≥3 is unstudied. Guidance
   reliably cuts wall-clock and token cost (24–29 %, blind test-suite runs 3.67 → 1.67) and
   reliably does **not** improve correctness ("Evaluating AGENTS.md": no success gain, **+20 % cost**).
   So: ship guidance in the *disciplined* shape (on-demand, focused, procedural, curated —
   SkillsBench's **+16.6 pp**; self-generated skills give no benefit) and never duplicate it into
   an always-on prompt block.
2. **Runtime retrieval of coordination literature: NO.** Zero primary sources support it, and the
   evidence against is specific — retrieval amplifies distractor errors, IR over 43 k tools
   degrades task pass rate, agents score **9.39 %** on deep literature discovery, and Anthropic's
   own guidance is "runtime exploration is slower than retrieving pre-computed data". The winning
   pattern is **accumulate-and-distill**. *This answers the "should the agents read papers?" question
   from the brief: no tool — distill the protocol into the shipped skill.*
3. **The plugin currently cannot observe its own coordination.** Contention is structurally
   invisible (a denied claim appends nothing), waits are not logged, deliveries are not logged with
   their tier, and a member never leaves. Any claim that a change made the swarm better is
   unmeasurable until those exist. And the honest bar is high: **7 of the 10 published
   coordination gains sit inside a noise floor of roughly [−3, +18] pp**, so a future gain claim
   needs a paired noise floor and a **≥15–20 pp** detectable effect.

Two more findings shape the ordering rather than the item list:

- **A flat shared store is the wrong shape.** Two independent primary papers say a single flat
  shared store (a) under-performs *no memory* and (b) homogenizes roles (noise accumulation).
  A per-agent private layer plus gated promotion (CoMem: private **and** collective both beats
  either alone — 88.31 vs 85.07 collective-only vs 83.58 private-only; DecentMem's dual pool
  wins 14 of 15 cells) is the most concrete mechanics change the literature supports.
- **Our board is an efficiency lock, not a correctness lock.** `post` is unconditional, so a
  reclaimed holder can still write into a resource it no longer owns. Kleppmann's split is
  exactly this: an efficiency lock prevents duplicated work; a correctness lock also prevents
  stale writes.

## Current state (verified in the code on 2026-10-20, not taken from the research)

| Gap | Verified where |
|---|---|
| No lease renewal — `grant()` refuses when a claim exists, **including the same holder's**, so a slow agent loses its lease at the 300 s TTL | `store/claims.ts:37-49` |
| No fencing token — `ClaimState` carries no epoch, so a reclaimed holder cannot be told at a write path | `store/claims.ts:6-12` |
| Contention is invisible — a denied claim appends nothing | `store/claims.ts:32-36` (the comment says so) |
| No `wait`, `contended` or `delivered` record kinds | `store/schema.ts` (six kinds only) |
| `member{leave}` is defined but never appended | `store/schema.ts:58`, `onboarding/digest.ts:97` |
| No idempotency key on `post` | `tools/room.ts` (no dedupe on append) |
| The always-on routing rule duplicates the on-demand skill | `onboarding/routing-rule.md` + `skills/omp-agent-chatroom/SKILL.md` |
| Cursors **are** durable per session (`pi.appendEntry("chatroom:cursor")` + restore on resume) — the research's "cursors are not durable" is wrong in this respect | `store/cursors.ts` (`persistOwnCursor`, `restoreOwnCursor`) |

## Items

The report's ranked list (ranked by (evidence strength × failure prevented) ÷ cost) is the input.
Status as of 2026-10-20:

| # | Item | Cost | Status |
|---|---|---|---|
| R1 | A **generation token** on the claim, enforced on the room's write path | medium | **DONE** (and, per the report's prediction 2, the claim is now explicitly documented as a signal plus a room-level fence, NOT a filesystem lock: the plugin cannot fence a file write, so it must not be advertised as a correctness mechanism — `553fc5f`) — a per-resource generation that rises when ownership changes (a renewal keeps it), carried on the claim record and returned by the claim op. A claim presenting a stale generation is refused, and so is a post into a topic the poster claims when the generation is behind. The room fences its OWN operations; it cannot fence a raw `edit` on a file, so this is the enforcement point, not a complete one |
| R2 | **Claim renewal**, and self-fencing on loss | low | **DONE** (`2a607e5`) — as renew-on-re-claim, not a separate op: the report records that shape as sound (it removes an op and keeps the TTL guess honest) |
| R3 | **Dependency ordering between claims**, enforced by the claim primitive | medium | **DONE** (`da0f8da`) — a claim may carry `dependsOn`; while one of them is held the claim is REFUSED and the refusal names the resource and its holder. The shape Claude Code's shipped agent teams use ("a pending task with unresolved dependencies cannot be claimed") |
| R4 | **Cycle detection over a wait-for graph** spanning all three wait mechanisms | medium | **DONE** (`198ca28`) — a wait that would close a cycle is refused, with the cycle named in the error and in `details.cycle` |
| R5 | **Four record kinds** so the room can be measured at all: `contended`, `delivered`+tier, `wait`+outcome, `member{leave}` | low-to-medium | **PARTLY DONE, and `member{leave}` is DECIDED OUT** (`c4be806`, `900a561`) — `contended`, `wait` and `delivered` are in. `delivered` deviates from the report on evidence: a log record per delivery was **measured at 3.3 ms per append** on the room store's filesystem (the fsync), so the tier counts live in memory and only the T0 — the interruption budget, and rare — is logged. `member{leave}` is **deferred**: an agent parked between turns is alive, and a leave on park would churn the roster; the report's own metric table calls that one `Y*` (computable from today's records) with the leave record only making it exact. **Decided out**: an agent parked between turns is alive, so a leave on park would churn the roster, and a leave on abort loses the member's roster entry for a session that may come back. The metric is computable without it |
| R6 | A **status ledger** on the shared record | high | **DONE** (`3de9b7f`) — Magentic-One's five keys, each `{reason, answer}`, written on a `post` by the agent **holding the topic's claim** (in a flat room that is the coordination role, without a hierarchy). A ledger that says the topic is looping **interrupts the topic's followers** — MAST's largest failure mode is step repetition (15.7 %). The report calls this the least validated item; it is built in the report's own shape |
| R7 | **Idempotency keys on `post`** | low | **DONE** (`ecfb583`) — a repeat with the same key returns the first post (nothing is appended); a key reused for different parameters is an error. Stripe's contract, copyable |
| R8 | **Guidance**: keep the Skill, demote the always-on duplicate, add the four missing procedures | low | **DONE** (`3a88b4a`, `3de9b7f`, `75f7a59`) — the Skill is four procedural modules plus a "when NOT to use the room" gate, the always-on rule is trimmed to its load-bearing parts (45 → 34 lines) and now points at the Skill for the procedure. **Needs the human's discovery re-measurement**: the baseline is 75–86 % over 16 trials, and the always-on rule is the discovery surface |
| R9 | A **"who is blocked on what"** view (board pane + a queryable structure) | low for the pane, medium for the structure | TODO — depends on R3/R4 for the structure |
| R10 | **Not now**: runtime retrieval of coordination literature | zero | **DECIDED** — a decision *not* to build. Zero supporting primaries; the evidence against is specific. If retrieval is wanted later, index the room's **own log**, not the literature |

### Build order, and why

**R5 first**, then **R7**, then **R4**, then **R3**, then **R1**, then **R9**, then **R6**.

R5 is first because the report's measurement section is blunt: a denied claim appends nothing, so
contention, duplicate work, tier distribution, findings-read and wait productivity are all
unmeasurable today — and 7 of the 10 published coordination gains sit inside a noise floor of
roughly [−3, +18] pp. Without the records, no later item can be shown to help, so every later
change would be another unfalsifiable claim. R7 and R4 are cheap and independent. R3 and R1 are
schema changes and come after the log format has moved once (R5), so the log format changes in one
round rather than two. R6 is last: it is the least validated item and the most likely to be wrong.

### The one measurement that changes everything

The report's noise-floor protocol: any future claim that a change made the swarm better must be
reported against a **paired noise floor of roughly [−3, +18] pp**, with a **≥15–20 pp** detectable
effect. In practice that means the plugin must be able to compute a **coordination-active subset**
(the records where coordination actually happened) — which R5 is what makes possible.

### The adversarial review round

A reviewer read the last six commits (which turned out to be ~45) adversarially and returned seven
findings. All seven are fixed; each fix is mutation-checked (the test fails without it).

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | The T1 window admits the OLDEST pending records, but a delivery pass only ever tried to deliver the CURRENT batch's — so a recipient whose backlog exceeded the window never had its own record admitted, its cursor never moved, and the overflow hint was computed and thrown away. The push channel was dead, silently. | P1 | The window is computed once per target and its summary line is delivered, even when nothing was admitted — exactly the starved case. The floor is unchanged: the owed records stay readable. `966de15` |
| 2 | `sendBounded` mapped every resolution to "delivered", but the host resolves `false` when its preflight declines to start a turn. A declined T0 was marked given and pushed below the cursor: a mention lost for good. | P2 | The send outcome has three states — accepted, uncertain (the bound expired), failed. A declined send is a failure (the record stays owed); an uncertain one is remembered as given but does not advance the cursor. `966de15` |
| 3 | The compactor's merge floor was computed from the INPUT SUMMARIES — the thing that may be degenerate — and a summary under the floor was rejected SILENTLY, so the same answer came back five times and the node was never built (leaving everything above it unbuildable). | P2 | The floor is a fraction of the block's RAW size, capped below the ruler's length; a rejection now tells the model what it produced and what the floor is. `137570c` |
| 4 | The migration copied the tree cache (dense positions into the legacy's array ≠ the target's replayed array) and overwrote the target's config. | P3 | The tree is not copied (a cold cache costs one rebuild, a wrong one costs the truth); the target's config wins and is never clobbered. `49cece8` |
| 5 | The legacy lock was released BEFORE the removal, so another process could append to the legacy room in that window and have its records deleted. | P3 | The removal happens while the lock is still held. `ca0d6dd` |
| 6 | The delivered-T0 registry was never forgotten (a `globalThis` key per project, for the life of the process), and the sweep's notice bypassed it — so a T0 could interrupt twice. | P3 | The registry is forgotten with the room; the sweep checks it first. `ca0d6dd` |
| 7 | The sweep's notice could jump the cursor past an uncarried gap (the owed floor excludes gaps, but the sweep is not a delivery pass, so nothing carries them). | P3 | The floor takes a flag, and the sweep counts the gaps. `ca0d6dd` |

The review also reported the classes it checked and found clean: escaping, I1 (no `await` in the
mutation path), I4 (no raw timers), I6 (no unhandled rejections), the per-recipient concurrency, the
migration's atomicity and containment, and the panel's selection mapping.

### Live checks the human still owns

The repo cannot run these: the first four need a real terminal and a real model, and the last
costs one live model turn per trial. They are listed here so they are not lost.

- **The card header** (plan 019): post into a named topic and confirm the card reads
  `room ⟵ <author> · <topic> · <age>` — and, with a `performative`, `… · request · <age>`.
- **Lease renewal**: claim a resource, work past the TTL with a claim in between, and confirm the
  expiry moved and no peer was told "denied — held by <you>".
- **The status ledger** (R6): claim `build/parser`, then post with a `status`; confirm a second
  agent without the claim is refused, and that `is_in_loop: "yes"` interrupts the topic's followers.
- **The cycle refusal** (R4): have two agents wait for each other's claims; the second must be
  refused with the cycle named in `details.cycle`.
- **The panel** (the host-convention pass): open `/room` and look at the board — the dependency and
  the waiter count must survive in a real pane, the state word must not be chopped, `j` must keep
  the cursor visible, and the presence strip in the frame title must not lose its `aborted` count.
  The chat row's clock must match the host transcript's time for the same message.
- **R8's always-on trim**: re-measure the unprompted discovery rate against the 75–86 % baseline.
  The harness is in the repo — `plugin/scripts/discovery-probe.sh` (exit 0 = the model claimed
  before touching the shared file, 1 = it edited without claiming, 2 = harness error). Run it 16
  times to match the baseline's sample. The prompt (`discovery-prompt.txt`) must not drift between
  runs: it carries no room vocabulary, or the trial measures prompt-following instead of discovery.
  If the rate drops, the trim is one commit to revert (`75f7a59`).


## Verification

```sh
cd plugin
bunx --bun @biomejs/biome check src tests    # exit 0 over 51 files
bun check                                     # 0 type errors in 50 files
bun test tests/                               # every count green
```

Every item lands with a test that fails without the fix.
