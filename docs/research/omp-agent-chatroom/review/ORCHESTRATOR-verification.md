# Orchestrator verification notes — adversarial round (2026-10-06)

Independent checks I ran against installed omp 18.6.1 source, to adjudicate the 8 review lenses.
These are the facts findings get graded against.

## V1 — `loadMode` semantics (A5 claimed BM25 removal = blocker)

**Verified.** BM25 tool discovery WAS removed in 18.6.1:
`src/config/settings.ts:3173-3176` deletes `tools.discoveryMode` / `tools.essentialOverride` /
`mcp.discoveryMode` / `mcp.discoveryDefaultServers` as dead keys.

**But A5's conclusion is imprecise.** `loadMode: "discoverable"` does NOT make a tool
unreachable — it **mounts the tool under the `xd://` device transport** instead of the top-level
tool list:

- `src/tools/xdev.ts:79-82` — `isMountableUnderXdev(tool)` returns true iff
  `tool.loadMode === "discoverable"` (and it is not a transport/pinned name).
- `src/sdk.ts:4019-4029` — at session build, every enabled tool that `isMountableUnderXdev`
  (and is not explicitly requested) is moved from `initialToolNames` into
  `toolSession.xdev.mountedNames`; the transport is activated by pushing `write` when
  `deviceTransportNeeded`.
- `src/session/session-tools.ts:1068-1077` — the same demotion runs on every tool-set rebuild.
- Consequence: a discoverable tool is invoked as `write xd://<name>`, documented via
  `read xd://<name>`; `essential` keeps it top-level.

**So the plan's R3 fallback ("else `pi.setActiveTools([...])`") is the wrong fix**, and the
justification text ("discovery is BM25 over name+description") is stale. Correct statement:
essential → top-level; discoverable → `xd://` device. Choose based on how the agent should call it.

Also verified: `defaultLoadModeForToolName` (`src/tools/essential-tools.ts:45-48`) — a declared
`loadMode` always wins; otherwise builtin-name membership decides, else `discoverable`.

## V2 — `useless` field (A5 said CONFIRMED)

**Verified real and honoured.** `src/tools/tool-result.ts:85-88` (`useless(value = true)`),
`src/session/session-maintenance.ts:676` (`pruneUseless`), `src/session/context-settings.ts:290-293`
(`dropUseless` defaults true), native `wait` sets it on abort (`src/tools/wait.ts:167-168`).

## V3 — `interruptible` IS read (A5 finding 4.3 claimed otherwise)

**A5's claim is REFUTED.** `pi-agent-core/src/agent-loop.ts:3269` reads `tool?.interruptible`
and resolves boolean-or-function at `3271-3281`; the resolved flag selects
`interruptibleSignal` vs `nonInterruptibleSignal` at `3287-3288`. The plan's §4.2/§4.4 usage and
R9 are correct as written.

## V4 — no global tool-execute timeout (A5 said CONFIRMED)

**Verified.** `src/tools/tool-timeouts.ts:10-21` enumerates bash/eval/browser/computer/ssh/fetch/
lsp/debug/ida only; no extension-tool entry, and the global cap applies only to those nine.

## V5 — native IRC escapes harness tags (A7 finding F1)

**Verified.** `src/session/irc-bridge.ts:189` calls `escapeHarnessTags(msg.body)`;
implementation at `src/session/harness-tags.ts:14-16` escapes `<` before harness tag names.
The plan's `deliver()` passing `record.body` verbatim has no equivalent — a real gap.

## Grading rule for Phase 2

- A finding is CONFIRMED only if its evidence survives the notes above.
- A5 findings 1.1 and 4.3 are downgraded/corrected per V1 and V3.
- Findings that merely restate an already-documented §10 risk are ACCEPTED TRADEOFF, not new.
