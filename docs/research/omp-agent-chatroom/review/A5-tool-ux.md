# A5 — Tool surface + agent UX (adversarial review)

Reviewer: A5 lens. Target: `PLAN-build.md` §4, §5.4, §8; `REPORT-v2-hybrid.md` §B/§C.
Every finding below carries the reviewer's evidence; **orchestrator adjudication** is marked
separately and overrides where it contradicts.

## Findings

| id | sev | claim | plan line | evidence | fix |
|---|---|---|---|---|---|
| 1.1 | blocker→**corrected** | BM25 tool discovery was removed in 18.6.1 | §4.0 R3, §4 intro | `settings.ts:3173-3176` deletes `tools.discoveryMode`/`tools.essentialOverride` | Replace the BM25 justification (see adjudication — the *conclusion* differs) |
| 1.2 | major | `setActiveTools` fallback would clobber the user's tool selection | §4.0 R3 fallback | `session-tools.ts:1734-1744` replaces the whole active set; `agent-session.ts:1522-1523` `restoreNonMCPToolPresentation` exists to undo it | Drop the fallback; fail loudly at registration if `essential` is refused |
| 2.1 | none | `useless` is real and honoured | §4.5 | `tool-result.ts:85-88`, `session-maintenance.ts:676`, `context-settings.ts:290-293` | — |
| 2.2 | minor | `outcome` is a plugin convention; the host never reads it | §4.5 | no reader in `pi-coding-agent/src`; native `wait` uses `details.interrupted` | State it is self-describing, not host-consumed |
| 3.1 | major | `wait_for_agent` with `agents` omitted = every live agent is a footgun | §4.2 | `agent-registry.ts:254-256` returns all refs; 12 finishing agents resolve on the first event | Make `agents` required |
| 3.2 | major | `wait_for_message` `source:"irc"` consumes from the mailbox | §4.3 | `bus.ts:195-262` | Remove `"irc"` from the v1 enum |
| 3.3 | minor | `ttl` unit ambiguity (ms vs seconds) | §4.4 | plan body says ms, schema comment says seconds | Standardise on milliseconds |
| 4.1 | none | No global tool timeout for extension tools | §4.2 | `tool-timeouts.ts:10-21` covers nine builtins only | — |
| 4.2 | major | A 1800 s block has no cancel path and no progress | §4.2-§4.4 | `wrapper.ts:116-127` provides `signal`+`onUpdate`; native `wait` uses `PROGRESS_INTERVAL_MS=500` | Specify 500 ms heartbeat, a waiting card, and abort → `{outcome:"aborted", useless:true}`, never throw |
| 4.3 | ~~major~~ **REFUTED** | "`interruptible` is never read by the agent loop" | §4.2, §4.4, R9 | reviewer grepped only `pi-coding-agent/src` | **See adjudication — claim is false** |
| 5.1 | major | Missing room file has no user-visible error | §3.3, §4.1 | `local-protocol.ts:337-339` throws on ENOENT | Wrap in try/catch, return a normal tool result |
| 5.2 | minor | Corrupt file: policy stated, error surface not | §3.3 | — | Return records up to failure + a `gap` record + a warning |
| 5.3 | major | Unwritable file has no handling | §3.3 | `appendLine` uses `fs.writeSync`, which throws | Wrap; return `{ok:false, error}` |
| 6.1 | major | Routing clauses 1 and 6 conflict | §8 | — | Add the "directed correction inside a multi-recipient collaboration" clause |
| 6.2 | minor | Clauses 8 and 9 do not discriminate | §8 | — | Add "a question needing a same-turn answer is not async" |
| 6.3 | minor | Clauses 7 and 8 overlap | §8 | — | Merge |
| 6.4 | major | Clause 10 tie-break is unexecutable | §8 | — | Delete; replace with "when in doubt, use the room" |
| 6.5 | major | Asymmetry note contradicts clauses 3+5 | §8 | — | Add an explicit correction clause |
| 7.1 | none | 800 tokens is sufficient for the digest | §5.4 | ~400-500 tokens of content | Specify truncation order |
| 7.2 | minor | Digest regeneration unspecified | §5.4, P4 | `before_agent_start` fires per start | State: regenerated per start, idempotent |
| 8.1 | minor | Room costs one extra tool call per post | §4, §8 | — | Acknowledge in the plan |
| 8.2 | major | Nothing requires an agent to post | §8 | — | Acknowledge: the routing rule is a nudge, not enforcement |
| 8.3 | minor | 12-op `room` tool is unfamiliar; digest lacks an op cheat-sheet | §4.1, §5.4 | — | Add a compact op table to the digest |

## Orchestrator adjudication

**1.1 — CONFIRMED in evidence, CORRECTED in conclusion.**
BM25 removal is real (`settings.ts:3173-3176`). But the reviewer's fix is wrong. Verified:
`loadMode:"discoverable"` does not make a tool unreachable — it **mounts the tool under the
`xd://` device transport** instead of the top-level list. Evidence:
`tools/xdev.ts:79-82` (`isMountableUnderXdev` returns true iff `loadMode === "discoverable"`),
`sdk.ts:4019-4029` (demotion into `toolSession.xdev.mountedNames` at session build),
`session-tools.ts:1068-1077` (same on rebuild). So: `essential` → top-level; `discoverable` →
`xd://`. The plan's stale BM25 sentence must be replaced, and the `setActiveTools` fallback
(1.2) dropped — but the tool is not "unmounted from the callable schema" as the reviewer wrote.

**4.3 — REFUTED.** The reviewer searched `pi-coding-agent/src` only. The agent loop is in
`pi-agent-core`. Verified: `pi-agent-core/src/agent-loop.ts:3269` reads `tool?.interruptible`,
resolves boolean-or-function at `3271-3281`, and selects `interruptibleSignal` vs
`nonInterruptibleSignal` at `3287-3288`. The plan's §4.2/§4.4 usage and R9 stand. The
reviewer's *advice* ("wait tools must observe `signal` directly and not depend on
`interruptible`") is still sound defence-in-depth and is already R9.

**3.1, 3.2, 4.2, 5.1, 5.3, 6.4 — ACCEPTED**, apply fixes.

**2.2, 3.3, 5.2, 6.1-6.3, 6.5, 7.1, 7.2, 8.1-8.3 — ACCEPTED**, apply fixes.
