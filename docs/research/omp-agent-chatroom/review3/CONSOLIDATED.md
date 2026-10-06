# Consolidated adversarial review — round 3

Date 2026-10-06. 9 agents: 8 new lenses (C1-C8) + a scaffold spec (C9).
**Result: the plan does not compile and would not work if it did. 6 critical, ~20 major.**

Rounds 1-2 fixed 34 defects. Round 3 found defects of a different class: the plan was
*internally consistent* but *not executable* — types that do not compile, a tool result the host
rejects, a timer that does not exist, and a budget that cannot be met.

## CRITICAL — the binding decisions

### K1. Tool result shape is invalid — every result would be an error
**Evidence:** `pi-agent-core/src/agent-loop.ts:540-562` — any `execute()` return without a
`content` array is coerced to `isError:true` with *"Tool returned an invalid result: missing
content array."* Plan §4.5 specifies `{ outcome, ... }` with no `content`, and claims the host
sees it "as opaque data" — false; the host classifies on `content`/`details`/`isError`/`useless`.

**DECISION — the uniform contract for every tool:**
```ts
{ content: [{ type: "text", text: <model-facing summary> }],
  details: { ok: boolean; outcome?: "event"|"timeout"|"aborted"; ...structured payload },
  isError?: boolean, useless?: boolean }
```
- `content` — the model-facing line. Always present.
- `details` — all structured payload; the agent discriminates here.
- Failures return `content` + `details.ok:false`; never throw from `execute`.
- `useless:true` on non-event paths.
Delete the false sentence in §4.5.

### K2. `deliver()` reads `record.body` on records that have no `body`
**Evidence:** §5.3 line 909 computes `escapeHarnessTags(sanitizeText(record.body))` **before**
the kind dispatch. `claim`/`release`/`note`/`member`/`gap` have no `body` field (§3.2), so this
is `TS2339` and a runtime `TypeError` on exactly the T0 events ("your claim revoked/contended").
Confirmed independently by C1 and C6.
**DECISION:** dispatch on `record.kind` first; derive the body per kind
(`msg`/`note` → `body`; `claim`/`release` → a rendered sentence; `member`/`gap` → a status line);
escape only the string that results.

### K3. Claim expiry has no producer
**Evidence:** only two `ctx.setInterval` jobs exist (pruning `:599`, compactor `:540`); nothing
calls `reclaimIfStale` on a timer. `release{reason:"expired"}` is unreachable and a long-TTL
claim can be squatted forever.
**DECISION:** add a third refcounted `ctx.setInterval` sweep (5 s `[invented]`) in the main
session: `reclaimIfStale` over all claims → append `release{reason:"expired"}` → promote the
oldest waiter → fire the T0 notice.

### K4. The compaction budget makes the tree unbuildable
**Evidence:** building one retention window ≈ 2N ≈ 10,000 calls; the cap is 1,000/day; the window
turns over in 16.7 min at the documented rate limit.
**DECISION:** the cap is a **rate**, not a total. Set `compactionCallsPerDay = 20000`
`[calibrate]` (≈2× the per-window demand, so one full rebuild/day is possible), and state that
the tree lags by design and the raw tail covers the gap.

### K5. Digest 800-token cap is unsatisfiable
**Evidence:** C6 measured the specified content at ~2,700–3,650 tokens; the plan's truncation
order bottoms out at a 665-token floor of untruncatable boilerplate.
**DECISION:** raise the cap to **2500 tokens** `[calibrate]` and make the routing rule
**excluded** from the cap (it is appended separately — resolve the §5.4 vs §9 P4 contradiction by
stating the hook appends `routing-rule.md` after the digest). Keep the truncation order.

### K6. `pi.enabledFeatures` does not exist — the feature gate is dead code
**Evidence:** absent from `ExtensionAPI` (`types.ts:1357-1696`); only `PluginRuntimeState` has
`enabledFeatures`, consumed by the plugin loader, not by extension code. All three features point
at the same `./src/index.ts`, so "disabling panel removes the panel" is unimplementable.
**DECISION:** drop the runtime gate. Use `registerFlag`/`getFlag` for runtime toggles and state
that manifest `features` only gates *which entry files load* — so either split the entries or
document that features do not gate runtime behaviour.

### K7. `roomIdFor(root)` collapses every tree onto `"local"`
**Evidence:** `resolveLocalRoot` returns `path.resolve(artifactsDir, "local")`
(`local-protocol.ts:229-240`), so the last path segment is always `"local"`.
**DECISION:** derive the room id from `ctx.sessionManager.getSessionId()` (stable, unique per
tree), not from the root path. Update §1.3 assumption 1 and §2.1.2.

## MAJOR — decisions

| # | Defect | Decision |
|---|---|---|
| K8 | Log fd has **no close path** (`grep closeSync` → nothing) | One fd per process keyed by `logPath` in a `globalThis` registry; close in the last live session's `session_shutdown`; use `O_CLOEXEC` semantics |
| K9 | Store singleton never evicted; `reset()` is test-only | Evict a root's store when its last session disposes; registry on `globalThis` |
| K10 | `AgentRegistry.onChange` + store listeners never unsubscribed | Add `addListener`/`removeListener` to `RoomStore`; capture and call the unsubscribe in `finally`/`dispose` |
| K11 | `MemberState`, `Tier`, `WaitOutcome` used but never declared | Declare each once (`MemberState` in `room-store.ts`, `Tier` in `tiers.ts`, `WaitOutcome` in `wait-for-agent.ts`) |
| K12 | `classify` not total: `gap` → T2 despite a promised notify; `release{reason:"released"}` has no tier | Make the switch exhaustive over all 6 kinds; `gap` → T1; add the missing release case |
| K13 | `const tool: ToolDefinition = {...}` erases `TParams` → `params.op` is `unknown` | Type each tool's params explicitly; avoid the bare `ToolDefinition` annotation |
| K14 | Three different log filenames (`<roomId>.jsonl` vs `local://room/${roomId}.jsonl` vs test's `room.jsonl`) | Export `logPathFor(root, roomId)`; §11.1 uses it |
| K15 | `RoomStore` has no `append` method — store↔claims mutual import | Add `append(draft): RoomRecord` to `RoomStore`; claims calls it |
| K16 | No tool has a model-facing `description` | Write one per tool; make `wait_for_claim`/`wait_for_message`/`wait_for_agent` distinguishable from the descriptions alone; counter the native `wait` text "NEVER wait on other agents" |
| K17 | The model sees a bare body — no sender/topic/tier | `content` = rendered line with `from`, `topic`, tier badge, escaped body |
| K18 | §2.1 not closed: `body-lines.ts`, `tree.test.ts`, `config.ts`, `env.d.ts` required by prose but unlisted | Add all four to §2.1 |
| K19 | Retention caps memory, not the file | State whether retention truncates the file; add `maxBodyBytes` (8 KiB `[calibrate]`) |
| K20 | `read` limit=1000 → ~97k tokens, 47× the T1 budget | Lower the max or route `read` through the injection budget |
| K21 | `streamSimple` is a **root** export, not a deep import | Re-file R23 |
| K22 | Digest content not escaped (V1) — system-prompt injection | Escape every room-authored string entering the digest; wrap the agent-derived region in a `room-authored, untrusted` marker |

## What round 3 confirmed correct
50 type/interface claims (C1) · all 35 §2.1 files map to a phase (C2) · the scaffold closes with
zero dangling imports across 184 symbols (C9) · path traversal defended · `Component` contract
satisfiable · `loadMode` semantics · `AgentRef.session` null path.

## Grading rule
Every refutation must quote the plan line verbatim. Round 1 and 2 each produced refutations that
were misreadings; round 3's are all quoted and independently re-verified by the orchestrator.
