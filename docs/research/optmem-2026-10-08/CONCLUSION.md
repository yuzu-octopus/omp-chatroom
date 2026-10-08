# OptMem / UniiChat — 2026-10-08 revision: what we found and what we changed

Date 2026-10-09. Five parallel investigations against the spec Victor Taelin updated on 2026-10-08
(`optchat.md`, renamed **UniiChat**), diffed against our 2026-10-06 findings (F20/F21/F7) and our
implementation.

Source saved at `optchat-2026-10-08.md`. Reports: `A`–`E` beside this file.

## The headline

Our earlier OptMem research was against the **2026-10-06** revision. The gist was updated
**2026-10-08** and is a substantial rewrite — 1232 diff lines, renamed, and it now *derives* the
merge order from Taelin's rollback-netcode `push` instead of asserting it.

Five findings were worth acting on. **One was not**, and it is the one that looked most authoritative.

## Changed (verified, committed)

| # | Finding | Fix | Commit |
|---|---|---|---|
| 6 | The compactor sent its **own system prompt**, forfeiting the turns' prompt-cache entry | Sends none; the M9 untrusted-input warning moved into the task text | `988afc5` |
| 7 | The model was **trusted to count bytes** | A ruler of exactly `TREE_REC` dashes in the prompt, and the reply measured: over the limit it retries in-conversation, max 5, keeping the shortest | `988afc5` |
| 8 | `TREE_REC = 288` — inherited from OptMem **untested** | 512. The spec tested 128 and found it useless; 512 bytes is a dense paragraph | `988afc5` |
| 10 | The digest (roster, lag, caps, uptime) sat in the **system prompt**, invalidating the cache prefix every turn | Moved to `BeforeAgentStartEventResult.message` — the host's own idiom, used by `DateCwdReminderInjector` with the source comment *"Keep per-request volatility out of the system prompt … (#7404)"*. `uptime` dropped | `6ba0d46` |
| 12 | `appendLine` never **fsynced**, so a crash could lose the last write while I5 claims durability | `fsyncSync` in the one append path | `6ba0d46` |

Still open at the time of writing: view persistence (#3), no-whole-message view (#5), ready-queue
instead of rescanning (#13) — one agent, same file.

## Rejected — and this is the important one

**The spec's `first` → `last` merge-age fix. We did not apply it, because it would make our view
worse.** Full reasoning in `A-merge-order-verification.md`.

The spec's §3.2 says measuring a pair's age from its **first** message is wrong, and that the
first-based form matches Taelin's `push` at only **481 of 20,001** steps.

Its counterexample is real and I reproduced it exactly: at T=10 with the view `0+4, 4+4, 8+1, 9+1`,
last-based merges `8-9` (matching push) while first-based merges `0-7`.

But the 481/20001 figure describes **the spec's own procedure** — a greedy "merge the most-due pair,
repeat" loop. Our `cover()` never does that: it bisects a single scalar `alpha` against a target line
count. A different search procedure has a different optimum, and the predicate that is optimal for a
greedy loop is not automatically optimal for a bisection. Measured on **our** procedure, at the
budget where push is exactly reproducible (T = 1…400):

| Formula | Matches push |
|---|---|
| first-based (`T - lo`, **what we have**) | **140 / 400** |
| last-based (`T - (hi-1)`, the spec's fix) | 8 / 400 |

Applying the fix would move our tiling *away* from push, not toward it. Our `coverAt` is also
byte-identical to OptMem's `_cover` (`/tmp/OptMem/memo:95`) — a faithful port, not an invention.

The formulas **do** differ at our budget (5 of 9 sizes tested), so this was a real decision, not a
no-op. If the merge *order* ever matters to us, the honest move is to adopt the spec's actual
algorithm — most-due-pair merge with a persisted view — rather than swap one term in a bisection
solving a different problem. That needs its own evidence and is not justified yet.

**Two probe errors of mine, both worth recording:** I first read a pair's "last" as the exclusive
bound `hi` instead of the last message `hi - 1`, which made the spec look wrong when it was right.
Then I applied the spec's 481/20001 figure to a procedure it does not describe. Both are the same
mistake in different clothes: testing my model of the spec rather than the spec's own claim.

## Constants: what transfers and what does not

`D-constants-calibration.md`. The spec is single-writer on one endless chat; we are multi-writer on a
room.

| Constant | Spec | Ours | Verdict |
|---|---|---|---|
| Node size | 512 B | 288 → **512** | recalibrated |
| Compaction retries | 5, keep shortest | 3 → **5** | recalibrated |
| Tool-output clip | 30,000 chars head+tail | 8192 B (`maxBodyBytes`) | needs a **separate** bound — 8 KB is too small for tool output |
| View sawtooth | 64→128 KB byte-based | 96 lines | byte-based bounds token cost directly; a line count does not |
| JOBS | 8 | 8 | transfers — our rate is bounded by srTCM |
| Compaction view | 16–32 KB | none | inapplicable — we build bottom-up, no separate turn context |
| Cache blocks | 4 lines | none | inapplicable — `streamSimple` exposes no `cache_control` |
| Log split | by day | single file | inapplicable — we retain 5000 records / 7 days |

## The cache question for a multi-writer room

`B-cache-economics-multiwriter.md`. The spec's cache argument (98.6% of a turn's prefix read from
cache) rests on **one** writer with **one** stable prefix. Our room has N agents, each with its own
context, and a digest that changed every turn — which is exactly why finding #10 was the most
expensive one. Now fixed: the system prompt carries only the static routing rule, and the volatile
digest rides the turn as a custom message.

## What our 2026-10-06 findings already covered

`C-spec-delta.md` maps it section by section. Summary: 18 new-spec sections were already covered by
F20/F21/F7 (14 areas), 10 were genuinely new, 10 were corrections of the old revision. The rename
OptChat → UniiChat is cosmetic; the rollback-push derivation, the sawtooth, view persistence, and the
cache analysis are new.

## Confidence

| Claim | Confidence |
|---|---|
| The five applied fixes are correct | **high** — each has a RED-first test and a green suite |
| Rejecting the merge-age fix is correct | **high** for the measurement, **medium-high** for the generalisation (measured at the push-exact budget; the budget-96 overlap metric was inconclusive for both formulas) |
| The spec's 481/20001 is inapplicable to us | **high** — our procedure inverts the ranking |
| The remaining three tree fixes are needed | **medium** — they are spec claims, not measured against our workload |

## What is still unmeasured

- Whether the view should be byte-budgeted (the sawtooth) rather than line-budgeted. The spec's
  argument is sound but our budget of 96 lines is far below its 64–128 KB regime.
- Whether a 30k-char tool-output bound is right for our records. No measurement.
- The ready-queue's actual win. O(N²) is real in principle; our retention cap is 5000 records, where
  it may never bite.
