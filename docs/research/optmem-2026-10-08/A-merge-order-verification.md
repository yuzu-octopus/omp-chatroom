# A — Merge-order verification: is our `cover()` wrong?

**Date:** 2026-10-09
**Source spec:** `docs/research/optmem-2026-10-08/optchat-2026-10-08.md` §3.1–3.2
**Our code:** `plugin/src/store/tree-store.ts` (`cover`, `coverAt`)
**Primary source:** `/tmp/OptMem/memo:82-102` (OptMem's `_cover`)

## Verdict: **do NOT apply the spec's `first` → `last` change.** It would make our view worse.

The spec is right about its own algorithm and wrong about ours. The two are not the same
procedure, and the fix does not transfer.

## 1. What our code implements

`plugin/src/store/tree-store.ts:205`:

```ts
if (size > 1 && (hi > T || size > alpha * (T - lo))) {
```

That is **byte-identical to OptMem's `_cover`** (`/tmp/OptMem/memo:95`):

```python
if size > 1 and (hi > T or size > alpha * (T - lo)):
```

`T - lo` is the age from the block's **first** message. We inherited it verbatim from OptMem, which
is the source we read on 2026-10-06 — so this is not an untested invention, it is a faithful port.

## 2. The spec's counterexample is real, and reproduces exactly

Spec §3.2: at T=10 with the view `0+4, 4+4, 8+1, 9+1`, the last-based `due` merges `8-9` while the
first-based merges `0-7`. Reproduced (`/tmp/mergeorder2.mjs`):

```
last-based  most due: merge 8-9 (due 1)
first-based most due: merge 0-7 (due 2.5)
```

Both match the spec. **The spec's claim about the *merge-priority rule* is correct.**

Note the reading that matters: the pair's "last" is its last **message** (`hi - 1`), not the
exclusive bound `hi`. My first probe used `hi` and failed to reproduce anything; with `hi - 1` the
counterexample lands. That was my error, not the spec's.

## 3. But the spec's `481/20001` does NOT reproduce under our procedure

The spec says first-based "matches push at only 481 of 20,001 steps". That figure is about **its**
merge procedure (repeatedly merge the most-due pair), not the bisection `cover()` we use.

Under our procedure — bisect `alpha` to fit the budget, then split the largest block toward the
present — the ranking **inverts**:

| Procedure | first-based | last-based |
|---|---|---|
| Budget = push's own list length, T = 1…400 | **140/400 match push** | 8/400 match push |
| Our budget (96 lines), block overlap with push | 0.001 | 0.001 |

`/tmp/decisive.mjs`. At the budget where push is exactly reproducible, **first-based reproduces it
17× more often than last-based**. Applying the spec's fix would move our tiling *away* from push,
not toward it.

## 4. The formulas do differ at our budget — so this is not a no-op

`/tmp/practical.mjs`, at `COVER_BUDGET_LINES = 96`:

| T | identical? |
|---|---|
| 97, 128, 500, 50000 | yes |
| 200, 1000, 2000, 5000, 10000 | **no** |

At T=200 the two tilings share 90 of 96 blocks but disagree at 6: first keeps `8+8` and `104+4`;
last keeps `8+4`, `12+4`, `104+2`, `106+2`. So the choice is observable — it is simply not the
choice the spec thinks it is.

## 5. Why the spec's reasoning does not carry over

The spec derives the merge *order* from Taelin's rollback `push` and then implements it as an
explicit "merge the most-due pair, repeat" loop. Our `cover()` never does that: it bisects a single
scalar `alpha` against a target line count. A different search procedure has a different optimum;
the predicate that is optimal for a greedy most-due loop is not automatically optimal for a
bisection. The spec's own §3.2 caveat — "with a bigger budget it keeps the same order and more
lines per level" — describes its loop, and our budget (96) is far larger than push's (~log₂T ≈ 20).

## 6. What would actually be worth doing

Not the formula swap. If the merge *order* matters to us, the honest move is to adopt the spec's
actual algorithm — the most-due-pair merge loop with a persisted view — rather than to change one
term in a bisection that is solving a different problem. That is a larger change and is **not**
justified by the evidence here; it would need its own probe against our cache and cost goals.

## 7. Confidence

| Claim | Confidence | Evidence |
|---|---|---|
| Our `coverAt` uses `T - lo`, identical to OptMem `_cover` | **high** | quoted lines both sides |
| The spec's T=10 counterexample is correct for the merge-priority rule | **high** | reproduced exactly |
| The `481/20001` figure does not apply to our procedure | **high** | our procedure inverts the ranking (140 vs 8) |
| Changing `T - lo` → `T - (hi-1)` would worsen our view | **medium-high** | measured on our procedure at the push-exact budget; the overlap metric at budget 96 is inconclusive for both |
| Our 288 → 512 node-size change was independent and correct | **high** | separate finding (D, E) |

**Action taken: none.** `coverAt` is left exactly as it is. This file exists so the next reader does
not apply the spec's fix on the strength of its 481/20001 claim.
