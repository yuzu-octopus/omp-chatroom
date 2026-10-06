# F1 Native IRC Substrate (omp 18.6.1)

## Angle
What omp 18.6.1 already gives an agent chatroom: `write agent://<id>` / `agent://all` semantics, steering paths (parent steer vs sibling `#interrupts` vs aside queue vs deferred wake), `wait`, Agent Hub, `history://` roster discovery, `agent://<id>` read = artifact. Second half: precise enumeration of what is NOT provided (no shared room, no multi-party thread, no claim/lock, no durable shared board, no topic-addressed message). Every code claim quotes repo path:line. Nothing implemented.

Source of truth = installed package at `/home/yuzu/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent` (package.json:3 `"version": "18.6.1"`) + embedded docs served via `omp://`.

## Claims

### IrcBus — process-global mailbox bus

- `IrcBus` is a process-global singleton (`IrcBus.global()`) holding three in-memory maps: `#mailboxes` (agentId → IrcMessage[], cap 100, oldest dropped), `#waiters` (agentId → parked wait resolvers), `#lastSent` (from → to → ts) | `src/irc/bus.ts:27-48` | fetch date 2026-10-06 | confidence: primary
- `MAILBOX_CAP = 100` per agent; oldest messages dropped beyond cap | `src/irc/bus.ts:25` | fetch date 2026-10-06 | confidence: primary
- `send()` is fire-and-forget: never blocks on recipient generating anything; receipt reports delivery mode (injected/woken/revived/failed), not what recipient did with it | `src/irc/bus.ts:56-85` | fetch date 2026-10-06 | confidence: primary
- A successfully delivered message never lingers in recipient's mailbox — injection/wake puts full body into context; only failed live hand-off is buffered for later drain | `src/irc/bus.ts:62-66` | fetch date 2026-10-06 | confidence: primary
- `unreadCount(agentId)` returns mailbox length for Agent Hub overlay | `src/irc/bus.ts:275-277` | fetch date 2026-10-06 | confidence: primary
- `sentSince(from, to, sinceTs)` tracks latest successful send timestamp per from→to pair; wake-turn relay uses it to skip agents that already answered their waker | `src/irc/bus.ts:88-95` | fetch date 2026-10-06 | confidence: primary

### Delivery outcomes — 4-valued receipt

- Receipt outcomes: `injected` (waiter consumed or session injection), `woken` (idle agent started a turn), `revived` (parked agent was revived), `failed` (unknown/aborted/advisor/no-session/handoff-error) | `src/irc/bus.ts:97-186` | fetch date 2026-10-06 | confidence: primary
- Unknown agent → `failed` with error "Unknown agent ... check the subagent roster or read history:// for known peers" | `src/irc/bus.ts:99-104` | fetch date 2026-10-06 | confidence: primary
- Aborted agent → `failed` with "was hard-aborted and cannot be messaged or revived" | `src/irc/bus.ts:106-112` | fetch date 2026-10-06 | confidence: primary
- Advisor ref → `failed` with "read-only advisor transcript and cannot be messaged" | `src/irc/bus.ts:113-120` | fetch date 2026-10-06 | confidence: primary
- Parked recipient always needs lifecycle to revive; `ensureLive()` called; `revived = !priorSession || liveSession !== priorSession` | `src/irc/bus.ts:122-153` | fetch date 2026-10-06 | confidence: primary
- Pending `wait` from recipient consumes message directly — returned from their irc tool call, never hits inbox or session injection | `src/irc/bus.ts:155-163` | fetch date 2026-10-06 | confidence: primary
- Live hand-off failure (recipient disposed mid-shutdown) → message buffered in mailbox, receipt stays `failed` | `src/irc/bus.ts:174-185` | fetch date 2026-10-06 | confidence: primary

### Visibility — listVisibleTo

- `listVisibleTo(id)` returns every alive agent (running | idle) except the caller, excluding advisors — flat namespace, no tree scoping | `src/registry/agent-registry.ts:322-327` | fetch date 2026-10-06 | confidence: primary
- Broadcast (`agent://all`) targets = `listVisibleTo(senderId).map(ref => ref.id)` | `src/irc/messaging.ts:64` | fetch date 2026-10-06 | confidence: primary
- `suppressRelay` skips display-only main-UI relay for broadcast legs when main agent is also a target | `src/irc/messaging.ts:65-66` | fetch date 2026-10-06 | confidence: primary

### IrcBridge — session-side queues

- `IrcBridge` owns four queues: `#interrupts` (peer IRC while streaming), `#asides` (non-interrupting step-boundary injection), `#deferredWakes` (parked while pooled yield contract owns worker), `#pendingReplies` (in-flight wake-turn relays) | `src/session/irc-bridge.ts:24-33` | fetch date 2026-10-06 | confidence: primary
- `drainPending()` returns interrupts before asides (interrupt-before-aside order) | `src/session/irc-bridge.ts:62-68` | fetch date 2026-10-06 | confidence: primary
- `flushPending()` persists queued IRC records that missed their step-boundary injection | `src/session/irc-bridge.ts:248-253` | fetch date 2026-10-06 | confidence: primary
- `clearPending()` + `restorePending()` snapshot/restore queues across session-boundary transitions (new/switch) | `src/session/irc-bridge.ts:70-98` | fetch date 2026-10-06 | confidence: primary

### Steering paths — parent vs sibling

- Parent→child while streaming: `agent.steer()` with parent-IRC template (not interrupt queue) | `src/session/irc-bridge.ts:213-221` | fetch date 2026-10-06 | confidence: primary
- Sibling→child while streaming: pushed to `#interrupts` queue (non-interrupting for tool batch, but can cut an interruptible wait) | `src/session/irc-bridge.ts:222-224` | fetch date 2026-10-06 | confidence: primary
- Any sender→idle child (not plan mode): `wakeForIrc([record])` starts a monitored wake turn | `src/session/irc-bridge.ts:238-239` | fetch date 2026-10-06 | confidence: primary
- Plan mode idle: message folded into context via `appendMessage` + `appendCustomMessageEntry`, no turn started | `src/session/irc-bridge.ts:227-237` | fetch date 2026-10-06 | confidence: primary
- `relayOnStop` = true only for idle subagents (not main, not plan mode, not already wake relay) — child told its final yield will be relayed to sender | `src/session/irc-bridge.ts:184` | fetch date 2026-10-06 | confidence: primary
- IRC bodies escaped with `escapeHarnessTags()` before rendering — prevents forged harness tags from peer content | `src/session/irc-bridge.ts:189` | fetch date 2026-10-06 | confidence: parent

### wait tool

- `WAIT_MAX_MS = 30 * 60_000` (30-minute safety cap) | `src/tools/wait.ts:25` | fetch date 2026-10-06 | confidence: primary
- `wait` returns on first settled caller-owned job or incoming peer message; job results consumed so no duplicate async-result follows | `src/tools/wait.ts:49-98` | fetch date 2026-10-06 | confidence: primary
- Steering/tool interrupt returns "Wait interrupted by message." with `details.interrupted=true` | `src/tools/wait.ts:164-169` | fetch date 2026-10-06 | confidence: primary
- If no owned job/service running and no queued message: throws "Nothing to wait for" — peer-sustained wait ladder (5/10/30/60/300s) documented in `omp://tools/wait.md` does NOT exist in 18.6.1 source | `src/tools/wait.ts:92-96` | fetch date 2026-10-06 | confidence: primary | **CONFLICT**: `omp://tools/wait.md` documents "If only running peers can wake it, a message-only window returns control after 5, 10, 30, 60, then 300 seconds" — no such ladder exists in code
- Queued peer messages checked first; already-settled undelivered owned jobs returned without another wait | `src/tools/wait.ts:74-90` | fetch date 2026-10-06 | confidence: primary
- Job waits emit progress snapshots every 500ms when update callback present | `src/tools/wait.ts:26,134` | fetch date 2026-10-06 | confidence: primary
- Results and peer messages auto-deliver without calling `wait` — "Continue useful work instead of polling" | `omp://tools/wait.md` | fetch date 2026-10-06 | confidence: primary

### Agent Registry

- `AgentRegistry` is process-global singleton keyed by stable id | `src/registry/agent-registry.ts:112-120` | fetch date 2026-10-06 | confidence: primary
- `AgentRef` fields: `id`, `displayName`, `kind` (main|sub|advisor), `parentId?`, `status` (running|idle|parked|aborted), `session`, `sessionFile`, `createdAt`, `lastActivity`, `activity?`, `history?`, `lifecycle?` | `src/registry/agent-registry.ts:63-80` | fetch date 2026-10-06 | confidence: primary
- `aborted` is terminal: delayed progress/revival work must never transition tombstone back to live status | `src/registry/agent-registry.ts:192-194` | fetch date 2026-10-06 | confidence: primary
- `markResultAccepted` records responseAt/acceptedAt milestones; terminalizes ref when no turn in flight | `src/registry/agent-registry.ts:230-245` | fetch date 2026-10-06 | confidence: primary
- `staleAcceptedRuns()` returns accepted-but-running refs (lifecycle leak detection for parent) | `src/registry/agent-registry.ts:253-257` | fetch date 2026-10-06 | confidence: primary
- `setActivity` records short activity gist for work-aware roster; only for running agents; normalized to one bounded line | `src/registry/agent-registry.ts:273-281` | fetch date 2026-10-06 | confidence: primary

### Agent Lifecycle Manager

- `AgentLifecycleManager` owns idle→parked→revived lifecycle of adopted subagents | `src/registry/agent-lifecycle.ts:1-21` | fetch date 2026-10-06 | confidence: primary
- `adopt(id, opts)` arms TTL timer; parks on expiry (disposes live session, keeps AgentRef + sessionFile) | `src/registry/agent-lifecycle.ts:174-191` | fetch date 2026-10-06 | confidence: primary
- `park()` detaches session + sets `parked` BEFORE `session.dispose()` so concurrent ensureLive/peer sends never observe disposing session | `src/registry/agent-lifecycle.ts:267-331` | fetch date 2026-10-06 | confidence: primary
- `ensureLive(id)` revives from sessionFile; concurrent calls coalesce per id; never returns mid-dispose session | `src/registry/agent-lifecycle.ts:341-380` | fetch date 2026-10-06 | confidence: primary
- Cold revival: `PersistedSubagentReviverFactory` builds reviver for parked refs restored from disk (Agent Hub scan, collab mirror, resumed process) | `src/registry/agent-lifecycle.ts:389-426` | fetch date 2026-10-06 | confidence: primary
- `release(id, {tombstone:true})` keeps aborted row registered (not removed) so later discovery skips it | `src/registry/agent-lifecycle.ts:441-504` | fetch date 2026-10-06 | confidence: primary

### agent:// protocol

- `agent://<id>` read = output artifact (`<id>.md`), NOT transcript; before publish resolves to progress view (status + yield sections + latest assistant text) | `src/internal-urls/agent-protocol.ts:207-347` | fetch date 2026-10-06 | confidence: primary
- `agent://all` is write-only (broadcast); read throws "agent://all is write-only" | `src/internal-urls/agent-protocol.ts:209` | fetch date 2026-10-06 | confidence: primary
- `write agent://<id>` calls `executeSend()` → `IrcBus.send()`; requires non-empty content, no JSON-path suffix | `src/internal-urls/agent-protocol.ts:172-205` | fetch date 2026-10-06 | confidence: primary
- Write requires live session with `enableIrc !== false` and `isIrcEnabled(settings, taskDepth)` | `src/internal-urls/agent-protocol.ts:177-184` | fetch date 2026-10-06 | confidence: primary
- `isIrcEnabled`: true for subagents (taskDepth > 0); for top-level, checks `canSpawnAtDepth(maxDepth, taskDepth)` | `src/irc/messaging.ts:17-21` | fetch date 2026-10-06 | confidence: primary

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

### What the model sees vs what the human sees

- Model sees: IRC incoming template (from, message, replyTo, interrupting, relayOnStop) + `read history://` roster + `read proc://` running agents + `agent://<id>` output/progress | `src/prompts/system/irc-incoming.md:1-9`, `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Human sees: Agent Hub TUI with full roster, inspector, activity log, unread counts, cost/tokens | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary
- Model does NOT see: unread counts, cost, tokens, activity gist, parent/child tree view, other agents' transcripts (unless explicitly read) | [INFERENCE] | fetch date 2026-10-06 | confidence: speculative

## What is NOT provided (explicit enumeration)

1. **No shared room** — `agent://all` is a client-side fan-out of N separate 1:1 sends; no shared conversation context | `src/irc/messaging.ts:64-69` | fetch date 2026-10-06 | confidence: primary
2. **No multi-party thread** — each message is from one agent to one agent (or broadcast); no thread groups multiple agents around a topic | `src/irc/bus.ts:73-85` | fetch date 2026-10-06 | confidence: primary
3. **No claim/lock** — no mechanism for an agent to claim exclusive ownership of a task/resource; no mutex, no lease, no claim board | `src/irc/bus.ts` (absent) | fetch date 2026-10-06 | confidence: primary
4. **No durable shared board** — IrcBus is in-memory only; no persistent shared state between agents beyond per-agent session files | `src/irc/bus.ts:44-47` | fetch date 2026-10-06 | confidence: primary
5. **No topic-addressed message** — messages addressed to agent IDs only; no channel/topic/room concept | `src/irc/bus.ts:73-85` | fetch date 2026-10-06 | confidence: primary
6. **No message history in bus** — mailbox is transient (cap 100, dropped on overflow); no durable message log | `src/irc/bus.ts:25,279-294` | fetch date 2026-10-06 | confidence: primary
7. **No cross-process messaging** — IrcBus is process-global singleton; no IPC, no socket, no network transport | `src/irc/bus.ts:28-35` | fetch date 2026-10-06 | confidence: primary
8. **No peer-sustained wait ladder** — documented 5/10/30/60/300s ladder does not exist in 18.6.1; `wait` throws "Nothing to wait for" when no owned job/service | `src/tools/wait.ts:92-96` vs `omp://tools/wait.md` | fetch date 2026-10-06 | confidence: primary | **CONFLICT**
9. **Peer roster IS pushed into subagent system prompt** — `§ Coop` / `# Peers` block rendered from `src/prompts/system/subagent-system-prompt.md:18-49` (gated on `ircSelfId`), listing each live peer as `` - `id` — displayName (kind, status): activity ``, plus parked/omitted counts. Roster built by `collectIrcPeerRoster` in `src/task/executor.ts:330-371`, sorted running-before-idle then newest-activity, capped at `DEFAULT_PEER_ROSTER_LIMIT = 32` (`@oh-my-pi/pi-tui/src/tools/irc.ts:4`), injected via `buildSubagentSessionOptions`'s `systemPrompt` builder (`src/task/executor.ts:3580-3614`). Roster placed after trailing `<project-context>` block for prompt-cache prefix sharing. **Nuance**: roster is a start-time snapshot, not live — `read history://` remains the pull-based refresh | `src/prompts/system/subagent-system-prompt.md:18-49`, `src/task/executor.ts:330-371,3580-3614` | fetch date 2026-10-06 | confidence: primary
10. **No shared unread count across agents** — unread count is per-agent mailbox length; no global "room unread" | `src/irc/bus.ts:275-277` | fetch date 2026-10-06 | confidence: primary
11. **No message ordering guarantee across agents** — each agent's mailbox is independent; no global ordering | `src/irc/bus.ts:44` | fetch date 2026-10-06 | confidence: primary
12. **No delivery confirmation to sender** — receipt reports delivery mode only; no read receipt, no "seen" | `src/irc/bus.ts:56-85` | fetch date 2026-10-06 | confidence: primary
13. **No native group chat UI** — Agent Hub shows flat roster or parent/child tree; no group chat view | `omp://agent-hub.md` | fetch date 2026-10-06 | confidence: primary

## Searches
- Read: `src/irc/bus.ts`, `src/irc/messaging.ts`, `src/session/irc-bridge.ts`, `src/internal-urls/agent-protocol.ts`, `src/internal-urls/history-protocol.ts`, `src/registry/agent-registry.ts`, `src/registry/agent-lifecycle.ts`, `src/registry/agent-tombstone.ts`, `src/registry/persisted-agents.ts`, `src/tools/wait.ts`, `src/prompts/system/irc-incoming.md`, `src/prompts/steering/parent-irc.md`, `src/tools/wait.ts`
- Read docs: `omp://agent-hub.md`, `omp://tools/wait.md`, `omp://tools/task.md`, `omp://task-agent-discovery.md`, `omp://session.md`, `omp://compaction.md`, `omp://collab.md`

## Conflicting evidence
- `omp://tools/wait.md` documents "If only running peers can wake it, a message-only window returns control after 5, 10, 30, 60, then 300 seconds on consecutive waits. A gap of at least 60 seconds resets the ladder." — NO such ladder exists in `src/tools/wait.ts:49-190`. The code throws "Nothing to wait for" when no caller-owned job/service is running. This is a documented-vs-implemented conflict.

## Gaps
- Did not read `pi-tui/src/tools/irc.ts` or `pi-tui/src/overlays/agent-hub*.ts` directly (worker read them but I did not verify)
- Did not read `pi-agent-core/src/agent-loop.ts` interrupt handling directly
- Did not read `task/executor.ts` IRC regions directly
- Agent Hub TUI rendering details (colors, layout) not researched — out of scope
