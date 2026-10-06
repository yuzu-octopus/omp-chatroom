# A1 — omp API fidelity (adversarial review)

Reviewer: A1 lens. Target: `PLAN-build.md` §2, §4, §5.3, §7 + `[F15..F19]` citations.
Result: **2 REFUTED claims reported, 1 UNVERIFIABLE, 60+ CONFIRMED.**
**Orchestrator adjudication: both "refutations" are misreadings of the plan. 0 real defects from
this lens; the confirmations are the value.**

## Reported refutations

### R1 — "plan claims a subagent's shutdown kills a timer started in the parent"
- **Reviewer verdict:** FALSE. `clearAll()` is per-runner; each session owns its own
  `ManagedTimers` (`runner.ts:556-558`, `managed-timers.ts:58-64`). The real hazard is the
  reverse: a timer started *in* a subagent dies when that subagent finishes.
- **Orchestrator adjudication: REFUTED — the reviewer misread the plan.** Plan R11 reads
  verbatim: *"A session's `session_shutdown` clears that runner's timers — a room tick scheduled
  on a subagent dies when it finishes"* (`PLAN-build.md:1105`). That is exactly the reviewer's
  stated "reality". No plan text claims a subagent kills a parent's timer.
- **Action:** none. Plan R11 and R28 stand. Independently confirmed:
  `runner.ts:556` (`#managedTimers = new ManagedTimers(...)` per runner),
  `runner.ts:1449-1451` (`clearManagedTimers()` → `clearAll()`).

### R2 — "`handle.get(pi.pi.settings)` conflates the Settings instance with the registry lookup"
- **Reviewer verdict:** FALSE. `pi.pi.settings` is the `Settings` proxy (`settings.ts:3978`),
  not the registry; `lookup()` is a function in `./config/registry` (`registry.ts:823`). Fix
  suggested: `pi.pi.settings.get("room.maxT1PerTurn")` directly.
- **Orchestrator adjudication: REFUTED — the reviewer misread the plan, and its suggested fix is
  itself wrong.** Plan §2.2 says: *"`lookup(id)` from the exported
  `@oh-my-pi/pi-coding-agent/config/registry` subpath … used as `handle.get(pi.pi.settings)`"*
  (`PLAN-build.md:165-168`). The plan imports `lookup` separately and passes the Settings
  instance as the *scope* — which is the documented contract
  (`omp://extensions.md`: `lookup(id)` then `handle.get(pi.pi.settings)`). Verified:
  `registry.ts:258` `get(scope: ScopeLike)`, `registry.ts:823` `lookup(id: string)`.
  The reviewer's alternative is wrong: `Settings` has no `get(id: string)` method
  (`settings.ts:565+`; the proxy only forwards existing properties).
- **Action:** none. Plan §2.2 and R6 stand as corrected earlier this session.

## UNVERIFIABLE

### U1 — `streamSimple` call shape not shown
- Plan §3.6 says the compactor uses `@smol` via `streamSimple` but never shows the exact call
  (Model + Context construction). **Accepted:** a real gap in the plan's concreteness.
  `pi-ai/src/stream.ts:1307-1310`.
- **Action:** add the concrete call shape to §3.6 during Phase 3.

## Confirmed (reviewer's list, verbatim)

All `ExtensionAPI` method signatures · all `ToolDefinition` fields · `interruptible` read path
and wrapper pass-through · `ctx.ui.custom()` signature + blocking semantics +
`ExtensionCustomOptions` · `registerMessageRenderer` invocation conditions and fallback ·
`AgentRegistry` export path, `AgentRef.session` type, `sendCustomMessage`/`steer`/`followUp`
signatures · `before_agent_start` and `session_compacting` event/result types · `streamSimple`
export and signature · `resolveLocalRoot`/`resolveLocalUrlToPath` signatures and
`LocalProtocolOptions` · `createAgentSession` return shape · `getToolByName` · `wrapper.ts`
context binding · `registerCommand`/`registerFlag` signatures · `PluginManifest` shape ·
`omp plugin link` symlink layout · extension code not hot-reloadable · `session_shutdown` 2s
budget.

**Note on the reviewer's own evidence:** this lens independently confirmed the `interruptible`
read path — which is the claim A5 wrongly marked a blocker. A1's confirmation is correct
(`pi-agent-core/src/agent-loop.ts:3269`).

## Orchestrator note on review quality

A1's value is its 60+ confirmations, not its two refutations. Both refutations were produced by
attributing to the plan a claim the plan does not make, and one of them proposed a replacement
API that does not exist. Lesson for Phase 2: **grade every refutation against the plan's actual
text before acting on it.**
