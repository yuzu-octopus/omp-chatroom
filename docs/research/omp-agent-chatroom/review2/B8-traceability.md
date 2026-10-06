# B8 — Requirements traceability review

Date: 2026-10-06
Scope: `brief.md` Addenda A + B, user goals across four rounds, tree tool surface, `@smol` invocation, contradicted requirements.
Method: every requirement traced to a plan section; gaps identified with minimum addition.

---

## 1. Addendum A (hybrid round) — 4 decisions

| # | Decision | Answered? | Plan location | Gap |
|---|---|---|---|---|
| A-a | Room-vs-DM routing | **YES** | §8 Routing rule (lines ~900–950) | None. Ordered 10-clause rule with first-match-wins, correction asymmetry, claim-before-work. |
| A-b | Wait/blocking tool surface | **YES** | §4.2–4.4 (lines ~500–600) | None. Three tools with exact param schemas, defaults, bounds, `interruptible` flags, `outcome` discrimination. |
| A-c | Envelope + addressing | **YES** | §3.2 Log record schema (lines ~350–380) | None. RoomRecord union with msg/claim/release/note/member/gap kinds; performative enum; replyTo/threadRoot/replyWith/replyBy fields. |
| A-d | Attention/backpressure | **YES** | §5.1–5.2 (lines ~650–750) | None. Three tiers (T0/T1/T2), per-agent cursors, injection cap (K=10, B=2048), token bucket (CIR=1/2s, CBS=10), coalesce (N=20, T=5min), mute rules, gap notices. |

**Verdict: all 4 Addendum A decisions are answered in the plan.**

---

## 2. Addendum B (tree round) — 6 decisions

| # | Decision | Answered? | Plan location | Gap |
|---|---|---|---|---|
| B-a | Store layout + node format | **YES** | §3.1 TreeStore interface, §3.6 (lines ~300–400) | None. Fixed-width TREE_REC=288 bytes, position IS identity, dense prefix per level, `tree/<size>` files. |
| B-b | Who compacts + serialisation | **YES** | §3.6 Compaction (lines ~400–450) | None. Background job in main session via `ctx.setInterval`, `@smol` via `streamSimple`, JOBS=8, write mutex for check+write atomicity, max spend 1000 calls/day. |
| B-c | Boundary rule + cursor mapping | **YES** | §3.5 Cursors, §3.6 Boundary rule (lines ~380–420) | None. Raw tail = last R=50 messages, cold tree = [0, N-R), cursor = log seq, sliding window recomputed on every read. |
| B-d | `zoom` semantics + addressing | **YES** | §4.1 room op table (lines ~550–580) | None. `zoom(lo, hi)` exclusive range, aligned power-of-two, returns two children (raw if size 1, summary otherwise). |
| B-e | Invalidation | **YES** | §3.6 Invalidation (lines ~420–450) | None. `forget(lo, hi)` truncates every level file from `lo//size` upward, log never touched, rebuild by re-running compaction. |
| B-f | Failure modes | **YES** | §3.6, §5.2, §10 (various) | None. Cursor below raw tail → gap + raw-log fallback; crashed compactor → tree is rebuildable cache; divergent node → single-writer compaction eliminates divergence by construction; TREE_REC overflow → truncate; compaction lag → agents read raw tail without waiting. |

**Verdict: all 6 Addendum B decisions are answered in the plan.**

---

## 3. User goals — 9 goals across four rounds

| # | User goal | Delivered? | Plan location | Gap |
|---|---|---|---|---|
| G1 | Make collaboration easier than IRC/`agent://` | **YES** | §1 Goal, §8 routing rule, §4 tool surface | None. Routing rule makes the room the default for collaboration; claim board + wait tools + tree inspection remove frictions. |
| G2 | A beautiful panel | **YES** | §6 Panel UI (lines ~700–850) | None. Layout A with SplitPane, chat pane, board pane, roster strip, chrome, theme tokens, key map, input model, lifecycle. |
| G3 | Beautiful inline cards | **YES** | §7 Inline transcript rendering (lines ~850–950) | None. Four card types (`room:message`, `room:mention`, `room:claim`, `room:board-delta`) with collapsed/expanded shapes matching native IRC card anatomy. |
| G4 | A claim/status board | **YES** | §3.4 Claim arbiter, §4.1 board op, §6.4 Board pane | None. Claim arbiter with TTL, reclaim, contention; board op returns claims + roster + lag; board pane renders claims with TTL colors. |
| G5 | Blocking wait tools | **YES** | §4.2–4.4 | None. Three tools with exact schemas. |
| G6 | Tree compression | **YES** | §3.6 Cold tree | None. Binary summary tree with two-region design. |
| G7 | Tree inspection tools | **YES** | §4.1 room op table (`tree`, `zoom`, `recall`) | None. `tree` (cover tiling), `zoom` (descend), `recall` (regex search). |
| G8 | `@smol` summarisation | **YES** | §3.6 Compaction | None. `@smol` via `streamSimple` specified as the compaction model. |
| G9 | 2-input-1-output merges | **YES** | §3.6 Merge shape | None. Block [lo,hi) = merge of [lo,mid) and [mid,hi). RAW_MAX=16. |

**Verdict: all 9 user goals are delivered in the plan.**

---

## 4. Tree tool surface — exact param schemas?

| Op | Params | Returns | Specified? |
|---|---|---|---|
| `tree` | none | `[{lo, hi, size, raw, summary?}]` | **YES** — §4.1 op table |
| `zoom` | `lo: number, hi: number` | `[{lo, hi, size, raw, text}]` | **YES** — §4.1 op table |
| `recall` | `pattern: string` | `{ matches: [{seq, record}] }` | **YES** — §4.1 op table |

**Verdict: all three tree ops have exact param schemas in the plan.**

---

## 5. `@smol` invocation — exact call specified?

**PARTIAL.** The plan specifies:
- §3.6: "Model = `@smol` via `streamSimple` (deep import from `@oh-my-pi/pi-ai`, not public API)"
- §10 R23: "`streamSimple` from `@oh-my-pi/pi-ai` is a deep import, not public API"
- §11 P1b: "compactor job (`ctx.setInterval` + `streamSimple` with `@smol`)"

**Missing from the plan:**
1. How to resolve `@smol` (the tree report says `ctx.models.resolve("@smol")` — plan omits this)
2. The exact `streamSimple` signature (the tree report says `streamSimple(model, context, options)` — plan omits this)
3. What context/prompt to pass to the compactor
4. Error handling when `streamSimple` fails (retry? skip? pause?)

**Minimum addition:** Add a code block to §3.6 showing the exact `streamSimple` call:
```ts
import { streamSimple } from "@oh-my-pi/pi-ai";
const model = ctx.models.resolve("@smol");
const summary = await streamSimple(model, {
  messages: [{ role: "user", content: compactionPrompt(block) }],
}, { maxTokens: 280 });
```

---

## 6. Contradicted requirements — silently dropped?

| Check | Result |
|---|---|
| Tree tools vs. user request | **NOT CONTRADICTED.** User asked for tree inspection tools; plan delivers `tree`/`zoom`/`recall`. |
| Panel panes vs. user request | **NOT CONTRADICTED.** User asked for a beautiful panel; plan delivers Layout A with chat + board + roster. |
| Routing rule vs. user request | **NOT CONTRADICTED.** User asked for room-vs-DM routing; plan delivers §8. |
| Wait tools vs. user request | **NOT CONTRADICTED.** User asked for blocking wait tools; plan delivers three. |
| Claim board vs. user request | **NOT CONTRADICTED.** User asked for a claim/status board; plan delivers it. |
| `@smol` vs. user request | **NOT CONTRADICTED.** User asked for `@smol` summarisation; plan specifies it. |
| Tree compression vs. user request | **NOT CONTRADICTED.** User asked for tree compression; plan delivers it. |

**Verdict: no later round silently dropped an earlier user request.**

---

## 7. Gaps found

### Gap 1: `@smol` invocation not fully specified (MEDIUM)
**What:** The plan says "Model = `@smol` via `streamSimple`" but does not show the exact call.
**Missing:** How to resolve `@smol`, the exact `streamSimple` signature, what context/prompt to pass, error handling.
**Minimum addition:** Add a code block to §3.6 showing the exact `streamSimple` call with model resolution, context construction, and try/catch fallback to `runEphemeralTurn`.

### Gap 2: `room{op:"read"}` tree interaction not specified (MEDIUM)
**What:** The op table says `read` returns "records after the cursor, bounded" but does not specify what happens when `since` falls in a compressed node.
**Missing:** The tree report (R3) says "When `since` falls in a compressed node, returns the node's summary + a `zoom` hint." The plan omits this.
**Minimum addition:** Add a row to the §4.1 op table or a note after it: "When `since` falls in a compressed node, `read` returns the node's summary + a `zoom` hint. When `since` falls in the raw tail, returns raw messages."

### Gap 3: `note` and `leave` kinds have no ops (LOW)
**What:** The schema (§3.2) has `note` kind and `member` kind with `action: "join" | "leave"`, but there are no ops to create them.
**Missing:** Either remove `note` and `leave` from the schema, or add ops for them, or explain how they are system-generated.
**Minimum addition:** Add a note to §3.2: "`note` is system-generated (e.g. retention notices). `member{action:"leave"}` is auto-appended on `session_shutdown`."

### Gap 4: `to` field in schema but not in `post` op (LOW)
**What:** The schema has `to?: string` on `msg`, but the `post` op does not expose it.
**Missing:** Either remove `to` from the schema, or explain its use (e.g. "reserved for future DM-within-room").
**Minimum addition:** Remove `to` from the schema or add a comment: "`to` is reserved for future use; addressing is via `mention`."

### Gap 5: Compactor error handling not specified (LOW)
**What:** The plan mentions "wrap in try/catch" in R23 but does not specify what happens when `streamSimple` fails.
**Missing:** Retry policy, skip policy, pause policy.
**Minimum addition:** Add to §3.6: "On `streamSimple` failure: log the error, skip the node, and retry on the next interval. After 3 consecutive failures, pause compaction for 5 minutes."

### Gap 6: `room{op:"tree"}` return shape ambiguity (LOW)
**What:** The `raw` field in the `tree` op return is ambiguous — does it mean "this node is raw (not compressed)" or "this range is in the raw tail"?
**Missing:** Clarification that `tree` shows only the cold tree tiling, not the raw tail.
**Minimum addition:** Add a note to §4.1: "`tree` returns the cold tree tiling only. The raw tail is always read via `read`."

### Gap 7: `room{op:"zoom"}` validation not specified (LOW)
**What:** The plan does not specify what happens if `zoom` is called on a non-aligned range or a range not in the tree.
**Missing:** Validation rules and error returns.
**Minimum addition:** Add to §4.1: "`zoom` requires `hi - lo` to be a power of two and `lo % (hi - lo) == 0`. Returns `{ok:false, error:"unaligned range"}` otherwise."

### Gap 8: `room{op:"board"}` return shape not specified (LOW)
**What:** The op table says `board` returns "compact view" but does not specify the exact shape.
**Missing:** Exact return type.
**Minimum addition:** Add to §4.1: "`board` returns `{ claims: [{resource, holder, expiresAt, contended}], roster: [{id, status, lag}], topics: [{topic, unread}] }`."

### Gap 9: `room{op:"join"}` idempotency not specified (LOW)
**What:** The plan does not specify what happens if `join` is called when the agent is already a member.
**Missing:** Idempotency guarantee.
**Minimum addition:** Add to §4.1: "`join` is idempotent — a second call returns the existing cursor without resetting it."

### Gap 10: `room{op:"release"}` error cases not specified (LOW)
**What:** The plan does not specify what happens if `release` is called on a resource the caller does not hold, or on an expired claim.
**Missing:** Error returns.
**Minimum addition:** Add to §4.1: "`release` returns `{ok:false, error:"not holder"}` if the caller does not hold the claim, `{ok:false, error:"expired"}` if the claim has expired."

---

## 8. What I checked and found correct

1. **Addendum A (a) routing rule** — §8 is a complete, ordered, first-match-wins rule with correction asymmetry and claim-before-work. Correct.
2. **Addendum A (b) wait tools** — §4.2–4.4 specify three tools with exact param schemas, defaults, bounds, `interruptible` flags, and `outcome` discrimination. Correct.
3. **Addendum A (c) envelope** — §3.2 RoomRecord union covers all kinds with performative enum and reply fields. Correct.
4. **Addendum A (d) attention** — §5.1–5.2 specify three tiers, cursors, caps, token bucket, coalesce, mute, gaps. Correct.
5. **Addendum B (a) store layout** — §3.1 TreeStore interface with fixed-width nodes, dense prefix, position IS identity. Correct.
6. **Addendum B (b) compaction** — §3.6 specifies background job, `@smol`, JOBS=8, write mutex, max spend. Correct.
7. **Addendum B (c) boundary** — §3.5–3.6 specify raw tail R=50, cold tree [0,N-R), cursor = log seq. Correct.
8. **Addendum B (d) zoom** — §4.1 specifies `zoom(lo, hi)` exclusive range, aligned power-of-two, returns two children. Correct.
9. **Addendum B (e) invalidation** — §3.6 specifies `forget(lo, hi)` truncates level files, log untouched. Correct.
10. **Addendum B (f) failure modes** — §3.6, §5.2, §10 cover cursor below raw tail, crashed compactor, divergent node, TREE_REC overflow, compaction lag. Correct.
11. **User goal G1 (collaboration easier)** — §1 + §8 + §4 deliver routing rule, claim board, wait tools, tree. Correct.
12. **User goal G2 (beautiful panel)** — §6 delivers Layout A with SplitPane, chat pane, board pane, roster strip, chrome, theme tokens. Correct.
13. **User goal G3 (beautiful inline cards)** — §7 delivers four card types with collapsed/expanded shapes matching native IRC card anatomy. Correct.
14. **User goal G4 (claim/status board)** — §3.4 + §4.1 + §6.4 deliver claim arbiter, board op, board pane. Correct.
15. **User goal G5 (blocking wait tools)** — §4.2–4.4 deliver three tools. Correct.
16. **User goal G6 (tree compression)** — §3.6 delivers binary summary tree with two-region design. Correct.
17. **User goal G7 (tree inspection tools)** — §4.1 delivers `tree`/`zoom`/`recall` ops. Correct.
18. **User goal G8 (@smol)** — §3.6 specifies `@smol` via `streamSimple`. Correct.
19. **User goal G9 (2-input-1-output merges)** — §3.6 specifies merge shape with RAW_MAX=16. Correct.
20. **Tree tool param schemas** — §4.1 op table specifies exact params for `tree`, `zoom`, `recall`. Correct.
21. **No contradicted requirements** — No later round silently dropped an earlier user request. Correct.
22. **First-pass fixes applied** — All 22 confirmed findings from `review/CONSOLIDATED.md` are addressed in the plan (S1–S7, C1–C3, T1–T3, U1–U8, N1–N7, I1, P1–P8). Correct.

---

## 9. Summary

- **Addendum A:** 4/4 decisions answered.
- **Addendum B:** 6/6 decisions answered.
- **User goals:** 9/9 goals delivered.
- **Tree tool surface:** 3/3 ops have exact param schemas.
- **`@smol` invocation:** PARTIAL — model specified, exact call not shown.
- **Contradicted requirements:** None found.
- **Gaps:** 10 total (1 MEDIUM, 9 LOW). The MEDIUM gap (Gap 1: `@smol` invocation) is the only one that would block implementation; the rest are clarifications.
