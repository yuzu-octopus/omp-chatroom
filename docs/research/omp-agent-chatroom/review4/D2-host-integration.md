# D2 — Host integration reality (round 4)

Reviewer: D2 lens. Full detail at `agent://D2HostIntegration`.
**Orchestrator adjudication below; the version finding is independently verified.**

## V-HOST — the target version label is stale · CONFIRMED

| Artifact | Says | Installed |
|---|---|---|
| `PLAN-build.md:3` | `Target host: omp 18.6.1` | **18.7.0** |
| `SCAFFOLD.md:3` | `Host omp 18.6.1` | **18.7.0** |
| `SCAFFOLD.md:28` | "all verified against installed 18.6.1 source" | **18.7.0** |

Verified: `pi-coding-agent/package.json` → `18.7.0`; `pi-ai` → `18.7.0`; changelog
`## [18.7.0] - 2026-10-06`.

**Impact: traceability, not correctness.** The reviewer sampled the cited line numbers against the
installed tree and they still land on the same declarations (consistent +5..+10 drift, e.g.
`ExtensionContext` cited `:477` → actual `:485`). So all four rounds' evidence is from effectively
the same source; only the *label* is wrong.

**Fix:** relabel both artifacts to 18.7.0, and add an `engines`/`peerDependencies` pin so the
claim is checkable rather than asserted. This also matters for D3: every "not public API" finding
was measured against 18.7.0 and should say so.

## Host import resolution — verified

Every host specifier in the scaffold resolves, either through an explicit export key or the
`"./*"` wildcard. Named exports checked against declarations:

| Import | Verdict |
|---|---|
| `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext` | verified |
| `BeforeAgentStartEvent`, `BeforeAgentStartEventResult` | verified |
| `ToolDefinition`, `ToolRenderResultOptions`, `AgentToolResult` | verified |
| `MessageRenderer`, `MessageRenderOptions` | verified |
| `AgentRef`, `AgentRegistry`, `SessionManager`, `createAgentSession` | verified |
| Deep: `internal-urls/local-protocol`, `session/harness-tags`, `registry/agent-registry`, `utils/event-bus` | verified (all via wildcard) |
| `streamSimple` from `@oh-my-pi/pi-ai` | verified — root export (`src/index.ts` `export * from "./stream"`), confirming K21 |

## Limitation
The reviewer could not run `bun` import probes (no shell device in its session). Resolution was
verified by reading the declarative `exports` maps, which is sound for resolution but would not
catch a runtime-only failure. Items needing execution are marked unverifiable in the full report.

## Orchestrator note
The stale version label is exactly the kind of defect the meta-review predicted: not a wrong
*decision*, but a wrong *claim about the evidence*. It does not invalidate the work — the cited
lines still resolve — but it must be corrected before anyone builds against it.
