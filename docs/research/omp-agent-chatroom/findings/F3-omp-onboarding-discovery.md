# F3 omp Onboarding/Discovery

## Angle
How a fresh subagent learns about peers, how parked agents are revived, what identity/presence data exists, what the model sees vs the human in Agent Hub, and how `history://` / `agent://` work for roster discovery and output reading.

## Claims

### Child system prompt / peer awareness

- The child IRC incoming template renders only the immediate message: sender id, body, replyTo, interrupting flag, and relay instructions — no peer roster in the incoming envelope | `src/prompts/system/irc-incoming.md:1-9` | fetch date 2026-10-06 | confidence: primary
- The child system prompt DOES carry a `§ Coop` / `# Peers` block (gated on `ircSelfId`), listing each live peer as `` - `id` — displayName (kind, status): activity ``, plus parked/omitted counts | `src/prompts/system/subagent-system-prompt.md:18-49` | fetch date 2026-10-06 | confidence: primary
- Roster built by `collectIrcPeerRoster` in `src/task/executor.ts:330-371`, sorted running-before-idle then newest-activity, capped at `DEFAULT_PEER_ROSTER_LIMIT = 32` (`@oh-my-pi/pi-tui/src/tools/irc.ts:4`) | `src/task/executor.ts:330-371` | fetch date 2026-10-06 | confidence: primary
- Roster injected via `buildSubagentSessionOptions`'s `systemPrompt` builder (`src/task/executor.ts:3580-3614`); placed after trailing `<project-context>` block for prompt-cache prefix sharing | `src/task/executor.ts:3580-3614` | fetch date 2026-10-06 | confidence: primary
- Roster is a start-time snapshot, not live — `read history://` remains the pull-based refresh | `src/prompts/system/subagent-system-prompt.md:45` | fetch date 2026-10-06 | confidence: primary
- `listVisibleTo(id)` returns every running/idle agent except the caller, excluding advisors — flat namespace, no tree scoping | `src/registry/agent-registry.ts:322-327` | fetch date 2026-10-06 | confidence: primary
- The IRC bridge renders the incoming template with `from`, `message`, `replyTo`, `interrupting`, and `relayOnStop` — the child model sees only these fields in the envelope | `src/session/irc-bridge.ts:193-199` | fetch date 2026-10-06 | confidence: primary
- `relayOnStop` is true only for idle subagents (not main agent, not plan mode, not already a wake relay) — the child is told its final yield will be relayed to the sender | `src/session/irc-bridge.ts:184` | fetch date 2026-10-06 | confidence: primary
- Parent messages to a streaming child use `steer()` (parent-IRC template), not the interrupt queue — different code path than peer messages | `src/session/irc-bridge.ts:213-221` | fetch date 2026-10-06 | confidence: primary
- IRC message bodies are escaped with `escapeHarnessTags()` before rendering into the harness envelope — prevents forged harness tags from peer content | `src/session/irc-bridge.ts:189` | fetch date 2026-10-06 | confidence: primary

### Parked agent revival

- `AgentLifecycleManager` owns idle→parked→revived lifecycle of adopted subagents | `src/registry/agent-lifecycle.ts:1-21` | fetch date 2026-10-06 | confidence: primary
- `adopt(id, opts)` arms TTL timer; parks on expiry (disposes live session, keeps AgentRef + sessionFile) | `src/registry/agent-lifecycle.ts:174-191` | fetch date 2026-10-06 | confidence: primary
- `park()` detaches session + sets `parked` BEFORE `session.dispose()` so concurrent ensureLive/peer sends never observe disposing session | `src/registry/agent-lifecycle.ts:267-331` | fetch date 2026-10-06 | confidence: primary
- `ensureLive(id)` revives from sessionFile; concurrent calls coalesce per id; never returns mid-dispose session | `src/registry/agent-lifecycle.ts:341-380` | fetch date 2026-10-06 | confidence: primary
- Cold revival: `PersistedSubagentReviverFactory` builds reviver for parked refs restored from disk (Agent Hub scan, collab mirror, resumed process) | `src/registry/agent-lifecycle.ts:389-426` | fetch date 2026-10-06 | confidence: primary
- On revival, the agent's session is rebuilt from its sessionFile — it knows its own transcript but NOT the current live peer roster (that was a spawn-time snapshot) | [INFERENCE] | fetch date 2026-10-06 | confidence: speculative
- `release(id, {tombstone:true})` keeps aborted row registered (not removed) so later discovery skips it | `src/registry/agent-lifecycle.ts:441-504` | fetch date 2026-10-06 | confidence: primary

### AgentRef identity/presence data

- `AgentRef` fields: `id`, `displayName`, `kind` (main|sub|advisor), `parentId?`, `status` (running|idle|parked|aborted), `session`, `sessionFile`, `createdAt`, `lastActivity`, `activity?`, `history?`, `lifecycle?` | `src/registry/agent-registry.ts:63-80` | fetch date 2026-10-06 | confidence: primary
- `aborted` is terminal: delayed progress/revival work must never transition tombstone back to live status | `src/registry/agent-registry.ts:192-194` | fetch date 2026-10-06 | confidence: primary
- `markResultAccepted` records responseAt/acceptedAt milestones; terminalizes ref when no turn in flight | `src/registry/agent-registry.ts:230-245` | fetch date 2026-10-06 | confidence: primary
- `staleAcceptedRuns()` returns accepted-but-running refs (lifecycle leak detection for parent) | `src/registry/agent-registry.ts:253-257` | fetch date 2026-10-06 | confidence: primary
- `setActivity` records short activity gist for work-aware roster; only for running agents; normalized to one bounded line via `oneLineLabel` | `src/registry/agent-registry.ts:273-281` | fetch date 2026-10-06 | confidence: primary
- `AgentHistorySummary` fields: `agent?`, `modelRole?`, `resolvedModel?`, `resolvedModelIsFallback?`, `metrics?`, `readOnly?`, `outputPath?`, `patchPath?`, `branchName?`, `nestedPatchPaths?` | `src/registry/agent-registry.ts:44-61` | fetch date 2026-10-06 | confidence: primary
- `AgentRunLifecycle` fields: `responseAt?`, `acceptedAt?`, `terminalAt?` — run-scoped milestones cleared when ref re-enters running | `src/registry/agent-registry.ts:35-42` | fetch date 2026-10-06 | confidence: primary

### agent:// protocol

- `agent://<id>` read = output artifact (`<id>.md`), NOT transcript; before publish resolves to progress view (status + yield sections + latest assistant text) | `src/internal-urls/agent-protocol.ts:207-347` | fetch date 2026-10-06 | confidence: primary
- `agent://all` is write-only (broadcast); read throws "agent://all is write-only" | `src/internal-urls/agent-protocol.ts:209` | fetch date 2026-10-06 | confidence: primary
- `write agent://<id>` calls `executeSend()` → `IrcBus.send()`; requires non-empty content, no JSON-path suffix | `src/internal-urls/agent-protocol.ts:172-205` | fetch date 2026-10-06 | confidence: primary
- Write requires live session with `enableIrc !== false` and `isIrcEnabled(settings, taskDepth)` | `src/internal-urls/agent-protocol.ts:177-184` | fetch date 2026-10-06 | confidence: primary
- `isIrcEnabled`: true for subagents (taskDepth > 0); for top-level, checks `canSpawnAtDepth(maxDepth, taskDepth)` | `src/irc/messaging.ts:17-21` | fetch date 2026-10-06 | confidence: primary
- Progress view includes: `id`, `status`, `sections` (accepted yield results), `lastText` (latest assistant text), `empty` flag | `src/internal-urls/agent-protocol.ts:315-347` | fetch date 2026-10-06 | confidence: primary

### history:// protocol

- `read history://` lists registered agents and retained on-disk transcripts; refreshes caller root's persisted roster first | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- `history://<id>` gives concise transcript for live/parked subagent or retained on-disk transcript | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Advisor rows excluded from agent-facing peer roster, `history://` index, and `agent://` messaging | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary

### Agent Hub (human surface)

- Agent Hub = interactive TUI for watching/controlling subagents: roster (status, identity, parent, unread IRC count, model, activity, cost, tokens), inspector (tool/args/intent/retry/context/lineage/paths), activity log, steer/revive/kill | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Roster updates from session's agent registry and progress events | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Only `parked` agents can be revived; `x` is immediate kill+release | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Main agent NOT listed (its conversation is ambient session view) | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Hub discovers parked subagents from persisted artifacts on session resume; advisor transcript files appear as read-only rows | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Collab guests can use Agent Hub against host's subagents: live table, progress, chat, kill, revive, transcript viewing | `omp://collab.md` | fetch date 2026-10-06 | confidence: primary

### session_init — cold revival contract

- `session_init` entry in JSONL is the cold-subagent revival contract: `systemPrompt`, `task`, `tools`, `outputSchema`, `outputSchemaMode`, `restrictToolNames`, `spawns`, `readSummarize`, `readOnly`, `advisor`, `compactionThreshold`, `isolated` | `omp://session.md` § "session_init" | fetch date 2026-10-06 | confidence: primary
- `isolated: true` marks an isolation-worktree child that cannot be cold-revived | `omp://session.md` § "session_init" | fetch date 2026-10-06 | confidence: primary
- `extractSessionInit()` and read-only `peekSessionInit()` expose this contract | `omp://session.md` § "session_init" | fetch date 2026-10-06 | confidence: primary

### Task agent discovery

- Task agents discovered from `~/.omp/agent/agents/*.md`, `.omp/agents/*.md`, extension roots, Claude marketplace plugins, then bundled | `omp://task-agent-discovery.md` § "Discovery inputs and precedence" | fetch date 2026-10-06 | confidence: priority
- Bundled agents: `scout`, `reviewer`, `security-reviewer`, `task`, `sonic` | `omp://task-agent-discovery.md` § "Bundled agents" | fetch date 2026-10-06 | confidence: primary
- Agent definition shape: required `name`, `description`, `systemPrompt`; optional `tools`, `spawns`, `model`, `thinkingLevel`, `output`, `blocking`, `autoloadSkills`, `readSummarize`, `prewalk`, `advisor` | `omp://task-agent-discovery.md` § "Agent definition shape" | fetch date 2026-10-06 | confidence: primary
- `spawns` accepts `*`, CSV, or array; `*` allows any agent; CSV restricts to listed names | `omp://task-agent-discovery.md` § "Agent definition shape" | fetch date 2026-10-06 | confidence: primary
- `task.maxRecursionDepth` defaults to 2; negative disables cap | `omp://task-agent-discovery.md` § "Recursion-depth gating" | fetch date 2026-10-06 | confidence: primary
- Plan mode restricts subagent tools to `read`, `grep`, `glob`, `web_search` (+ `ast_grep` if declared), clears child spawns and prewalk | `omp://task-agent-discovery.md` § "Plan mode behavior" | fetch date 2026-10-06 | confidence: primary

### What the model sees vs what the human sees

- Model sees: `§ Coop` / `# Peers` roster snapshot (up to 32 peers) + IRC incoming envelope (from, message, replyTo, interrupting, relayOnStop) + `read history://` roster + `read proc://` running agents + `agent://<id>` output/progress | `src/prompts/system/subagent-system-prompt.md:18-49`, `src/prompts/system/irc-incoming.md:1-9` | fetch date 2026-10-06 | confidence: primary
- Human sees: Agent Hub TUI with full roster, inspector, activity log, unread counts, cost/tokens | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Model does NOT see: unread counts, cost, tokens, parent/child tree view, other agents' transcripts (unless explicitly read) | [INFERENCE] | fetch date 2026-10-06 | confidence: speculative
- Model sees roster as start-time snapshot; human sees live updating roster | `src/prompts/system/subagent-system-prompt.md:45`, `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary

## Searches
- Read: `src/prompts/system/subagent-system-prompt.md`, `src/prompts/system/irc-incoming.md`, `src/registry/agent-registry.ts`, `src/registry/agent-lifecycle.ts`, `src/session/irc-bridge.ts`, `src/internal-urls/agent-protocol.ts`, `src/task/executor.ts:330-371,3580-3614`
- Read docs: `omp://agent-hub.md`, `omp://task-agent-discovery.md`, `omp://session.md`, `omp://collab.md`

## Conflicting evidence
- None found

## Gaps
- Did not read `src/registry/persisted-agents.ts` directly
- Did not read `src/registry/agent-tombstone.ts` directly
- Did not verify `DEFAULT_PEER_ROSTER_LIMIT` value directly in `@oh-my-pi/pi-tui/src/tools/irc.ts` (cited by worker)
- Did not read `src/task/executor.ts:3580-3614` full context (only the systemPrompt builder section)
- Agent Hub TUI rendering details (colors, layout) not researched — out of scope
