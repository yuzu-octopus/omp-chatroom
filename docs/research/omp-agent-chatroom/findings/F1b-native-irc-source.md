# F1b native IRC / `agent://` peer messaging — primary-source extraction

## Angle

Angle 1 (native substrate, exact semantics). Read-only extraction from the installed omp
18.6.1 source at `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/` plus
sibling packages (`pi-agent-core`, `pi-tui`) and first-party docs (`omp://agent-hub.md`,
`omp://tools/wait.md`). Every claim cites the file + line range actually read.

Format per item: **claim** | `source:lines` | confidence. `NOT FOUND` marks anything not
located in the installed source (never guessed). Fetch date 2026-10-06.

---

## 1. IRC message transport — how `write agent://<id>` delivers

- **The `write` tool routes `agent://` through a protocol handler, not a file write.** `AgentProtocolHandler` declares `write: { via: "handler", payload: "verbatim", scope: "coordination", tier: () => "read" }`. | `src/internal-urls/agent-protocol.ts:142-150` | primary
- **Handler `write()` validates and forwards to `executeSend`.** Requires a tool session, `session.agentRegistry`, `session.getAgentId()`, `session.enableIrc !== false`, and `isIrcEnabled(...)`; else throws `"Peer messaging is unavailable in this session."`. Rejects JSON-path suffix on a message target and empty content. | `src/internal-urls/agent-protocol.ts:172-206` | primary
- **`executeSend` expands the target set and fans out.** `const targets = isBroadcast ? registry.listVisibleTo(senderId).map(ref => ref.id) : [to];` then `Promise.all(targets.map(target => bus.send({from, to, body}, {suppressRelay})))`. | `src/irc/messaging.ts:44-104` (broadcast at `:63-69`) | primary
- **The bus is a process-global singleton.** `IrcBus.global()` memoizes `#global`; the file header states "Process-global mailbox bus for agent-to-agent messaging." | `src/irc/bus.ts:1-9,27-40` | primary
- **`send()` mints id+timestamp, delivers, records last-sent.** `id: Snowflake.next()`, `ts: Date.now()`; on non-failed receipt records `#lastSent[from][to]` used by `sentSince()`. | `src/irc/bus.ts:73-96` | primary
- **Delivery path (`#deliver`)**: registry lookup → reject unknown/aborted/advisor → lifecycle gate (revive parked via `AgentLifecycleManager.ensureLive`) → pending waiter wins → else `session.deliverIrcMessage(message)`. | `src/irc/bus.ts:97-191` | primary
- **Queue/backlog**: only a *failed* live hand-off is buffered (`#enqueue`), because a successful injection/wake already put the body into the recipient's context. | `src/irc/bus.ts:62-66,175-190,279-294` | primary
- **In-process only.** The bus holds `#mailboxes`/`#waiters`/`#lastSent` Maps in memory; every consumer uses `IrcBus.global()` in-process (`src/irc/messaging.ts:66`, `src/tools/wait.ts:35,117`, `src/task/executor.ts:2867,3182`, `src/modes/agent-hub-runtime.ts:53`). No socket, no IPC, no file transport exists for IRC. | `src/irc/bus.ts:41-47` + grep of `IrcBus.global()` call sites | primary
- **Cross-process peer messaging does NOT exist in 18.6.1.** The only cross-process agent surface is Collab (WebSocket relay, AES-256-GCM), which mirrors agent *snapshots* and forwards host-side `agent-cmd` `chat`/`kill`/`revive` — a hub topology where "guests never peer" and commands execute on the host's own `IrcBus`/registry. It is not an IRC transport. | `src/collab/protocol.ts:1-7`; `src/collab/host.ts:1040-1067,1077-1135` | primary

## 2. Recipient set — what `agent://all` reaches

- **`all` = `registry.listVisibleTo(senderId)`.** | `src/irc/messaging.ts:63-64` | primary
- **`listVisibleTo` is flat and live-only**: every ref except self, except `advisor` kind, with `status === "running" || status === "idle"`. Parked and aborted are excluded; no parent/child or depth scoping. Doc comment: "Flat namespace: every other agent is visible." | `src/registry/agent-registry.ts:322-331` | primary
- **Advisor refs are never peers** (observability-only transcripts). | `src/registry/agent-registry.ts:24-31`; `src/irc/bus.ts:113-120` | primary
- **Main is a normal peer** with id `"Main"`. | `pi-tui/src/overlays/agent-hub-types.ts:4-5`; `src/registry/agent-registry.ts:1-11` | primary
- **Direct send requires the id to resolve**; unknown → `failed` ("check the subagent roster or read history:// for known peers"). Aborted → `failed` and unrevivable. | `src/irc/bus.ts:98-120` | primary
- **The child *prompt* roster is narrower than broadcast**: `collectIrcPeerRoster` renders live peers (running before idle, newest-activity first) bounded at `DEFAULT_PEER_ROSTER_LIMIT = 32`, counts only parked refs belonging to the caller's root session file, and omits parked identities entirely. Broadcast itself is not root-scoped. | `src/task/executor.ts:339-372`; `pi-tui/src/tools/irc.ts:1-4`; `src/registry/persisted-agents.ts:487-502` | primary
- **Broadcast relay suppression**: when Main is among the targets, the display-only main-UI relay is suppressed for all legs (avoids duplicate card). | `src/irc/messaging.ts:65`; `src/irc/bus.ts:60-69,332-334` | primary

## 3. Delivery semantics — how an inbound peer message reaches the loop

- **`IrcBridge.deliver(msg)`** branches on recipient state | `src/session/irc-bridge.ts:175-241` | primary
  - **streaming + sender is the recipient's parent** → `this.#host.agent.steer({role:"user", content: parentIrcSteerTemplate, steering:true})` — a real steer that interrupts the current run's remaining tools. | `:212-220`; template `src/prompts/steering/parent-irc.md:1-3` | primary
  - **streaming, any other sender** → pushed to `#interrupts`, injected at the next step boundary (non-interrupting aside). | `:221-223` | primary
  - **idle + plan mode** → `agent.appendMessage(record)` + `sessionManager.appendCustomMessageEntry(...)`; **no turn started**. | `:227-238` | primary
  - **idle otherwise** → `wakeForIrc([record])`: a real autonomous turn. | `:239-240` | primary
- **Mechanism names**: it does **not** use `sendMessage`/`followUp`/`aside` APIs; it uses raw `agent.steer()` for the parent case and the session's own IRC queue (`#interrupts`/`#asides`/`#deferredWakes`) plus `wakeForIrc` → `agent.prompt(records)`. | `src/session/irc-bridge.ts:26-33,175-241`; `src/session/agent-session.ts:1206-1300` | primary
- **Asides reach the loop via the aside-message provider**: `agent.setAsideMessageProvider(() => this.#irc.drainPending().map(record => () => record) ...)`, and `agent.hasIrcInterrupts = () => this.#irc.hasInterrupts()`. The core loop drains asides at step boundaries and at the stop boundary. | `src/session/agent-session.ts:1805-1821`; `pi-agent-core/src/agent-loop.ts:1771-1778,1798-1805` | primary
- **`irc_message` event payload**: `{ type: "irc_message"; message: CustomMessage }`. | `src/session/agent-session-events.ts:73`; wire shape `src/modes/rpc/wire/rpc-wire.generated.ts:866-869` | primary
- **The `CustomMessage` record** has `role:"custom"`, `customType:"irc:incoming"`, rendered `content` from `irc-incoming.md`, `display:true`, `attribution:"agent"`, and `details = { id, from, message (raw body), replyTo?, wakeRelay?, fromParent? }`. | `src/session/irc-bridge.ts:186-211`; template `src/prompts/system/irc-incoming.md:1-9` | primary
- **Wake relay back to the sender**: an idle subagent's wake turn is monitored; on settle `relayWakeTurnOutput` sends a `wakeRelay:true` message back to each distinct waker (deduped by `sentSince`, skipped if already answered), including on failure/abort. | `src/task/executor.ts:2849-2891,2824-2836,2983-3200` | primary
- **Can it wake an idle agent?** Yes — `wakeForIrc` runs `agent.prompt(records)`; the prompt messages are emitted (`message_start`/`message_end`) and persist. | `src/session/agent-session.ts:1206-1300`; `pi-agent-core/src/agent-loop.ts:1121-1125,1216` | primary
- **Can it interrupt a running turn?** Only a *parent* sender hard-steers; any other peer lands as a step-boundary aside. Interruptible wait-like tools are cut short (see §5). | `src/session/irc-bridge.ts:212-223`; `pi-agent-core/src/agent-loop.ts:3312-3336` | primary
- **Stranded asides** (arriving after the loop's last aside poll) trigger `#resumeStrandedIrcAsides`: wake for peer IRC; fold-into-context for extension asides and in plan mode. | `src/session/agent-session.ts:1119-1182` | primary
- **`wait` consumes directly**: a pending waiter is resolved by `#deliver` and the message never hits inbox or injection. `WaitTool` parks `IrcBus.wait(senderId, {}, 0, ...)` (no timeout, aborted when the wait settles) racing owned jobs/services; a peer IRC or steer returns `"Wait interrupted by message."` with `details.interrupted=true`. | `src/irc/bus.ts:155-163`; `src/tools/wait.ts:100-189` (cap `WAIT_MAX_MS = 30*60_000` at `:25`) | primary

## 4. Unread counts / acks

- **Tracked as mailbox length**: `unreadCount(agentId) { return this.#mailboxes.get(agentId)?.length ?? 0; }`. | `src/irc/bus.ts:274-277` | primary
- **Read by the Agent Hub roster** through `IrcBusLike` (`pi-tui`): badges `"{n} unread"`, `"⧉ {n}"` in row label/inspector. | `pi-tui/src/overlays/agent-hub-types.ts:71-74`; `pi-tui/src/overlays/agent-hub.ts:917-919,1225-1227,2148-2152` | primary
- **Wired in-process**: `createAgentHubRuntime({ ..., irc: options.irc ?? IrcBus.global() })`. | `src/modes/agent-hub-runtime.ts:35-60` | primary
- **Crucial consequence**: because a *delivered* message is never buffered (§1), the unread count only ever reflects messages whose live hand-off FAILED — it is not a read/unread tracker for normal traffic. | `src/irc/bus.ts:62-66,175-190` | primary
- **No ack / read-receipt exists.** `IrcDeliveryReceipt` carries only the delivery outcome (`injected | woken | revived | failed`); grep for `readReceipt|markRead|seenBy|"ack"` in `src/irc` and `src/registry` returns nothing. Consumption = `wait`/`take`/`drainInboxMessages` removing from the mailbox. | `pi-tui/src/tools/irc.ts` (receipt type); `src/irc/bus.ts:195-277`; `src/session/irc-bridge.ts:120-173` | primary

## 5. Abort / steer signal folding — CONFIRMED

- **Interruptible tools observe a combined external+steering+IRC signal.** In `executeToolCalls`:
  `nonInterruptibleSignal = signal ?? new AbortController().signal;`
  `interruptibleSignal = AbortSignal.any([signal, steeringAbortController.signal, ircAbortController.signal])`.
  Each record gets `signal: interruptible ? interruptibleSignal : nonInterruptibleSignal`. | `pi-agent-core/src/agent-loop.ts:3237-3252,3287-3288` | primary
- **IRC interrupt raises the IRC abort + the cooperative signal**: `checkAsideInterrupts` sets `source="irc"` from `hasIrcInterrupts()`, then `ircAbortController.abort(TOOL_INTERRUPT_ABORT_REASON)`; and `if (source !== "background" && softInterrupts) steeringSoftController.abort();`. | `pi-agent-core/src/agent-loop.ts:3312-3336` | primary
- **Steering raises its own abort + soft signal**: `steeringAbortController.abort(TOOL_INTERRUPT_ABORT_REASON); if (softInterrupts) steeringSoftController.abort();`. | `pi-agent-core/src/agent-loop.ts:3340-3379` | primary
- **Side-effecting foreground tools get ONLY the cooperative `steeringSignal`**, exposed on the tool-call context (`steeringSignal: steeringSoftController.signal`); it "NEVER kills the tool", tools MAY observe it to finish early/background themselves. | `pi-agent-core/src/agent-loop.ts:3556-3558`; `pi-agent-core/src/types.ts:562-567,644-649` | primary
- **Tool `execute` receives `record.signal`** (the interruptible or non-interruptible one), so a `readonly interruptible = true` tool (e.g. `wait`) sees IRC/steering aborts; `bash`/`eval` observe only `ctx?.toolCall?.steeringSignal` for graceful auto-backgrounding. | `pi-agent-core/src/agent-loop.ts:3572-3575`; `src/tools/wait.ts:49-59,160-168`; `src/tools/bash.ts:1174-1179`; `src/tools/eval.ts:697-698` | primary
- **Background-completion asides never raise the soft signal** (deliberate: avoids cascading auto-background chains). | `pi-agent-core/src/agent-loop.ts:3327-3336`; `pi-agent-core/src/types.ts:319-329` | primary
- **Refuted sub-claim**: there is no separate "IRC abort signal" reaching arbitrary tools — the folding is exactly `[external, steering, irc]` for interruptible tools, `[external]` for others, plus the cooperative soft signal. | `pi-agent-core/src/agent-loop.ts:3237-3252` | primary

## 6. Identity — how an agent id is minted and stays stable

- **Task `name` is the id source**: "Stable agent name; becomes the registry/IRC id. Default = generated AdjectiveNoun." | `pi-tui/src/tools/task.ts:2146-2147`; prompt `src/prompts/tools/task.md:13` (`CamelCase ≤32, auto-generated if omitted`) | primary
- **Allocation**: `agentId = await this.#outputManager().allocate(spawn.name?.trim() || generateTaskName())`. | `src/task/index.ts:792` | primary
- **`AgentOutputManager` uniquifies per session**: first use keeps the name, repeats get `-2`, `-3`, … (`#allocateUnique`); it seeds from on-disk `.md`/`.jsonl` stems on resume (`#seedFromDisk`) and reserves `__advisor` + the pinned-HUD toggle id. With a parent prefix, ids nest as `Parent.Child`. | `src/task/output-manager.ts:24-118` | primary
- **Generated fallback** = random `AdjectiveNoun` (e.g. `SwiftFalcon`) with a numeric suffix after exhaustion. | `src/task/name-generator.ts:1533-1560` | primary
- **Label sanitization** for structured/eval spawns: strip to `[A-Za-z0-9_-]`, cap 48 chars. | `src/task/structured-subagent.ts:230-233,556-559` | primary
- **Session-side id resolution**: `resolvedAgentId = options.agentId ?? options.parentTaskPrefix ?? MAIN_AGENT_ID`; the executor passes `agentId: id` and `parentTaskPrefix: id`; the session's `AgentOutputManager` is built with `{ parentPrefix: options.parentTaskPrefix }`. | `src/sdk.ts:2134-2136,2398-2401`; `src/task/executor.ts:4221-4225` | primary
- **Registration**: `AgentRegistry.register({id, displayName, kind, parentId, session, sessionFile, ...})`; `registerIfAvailable` is a CAS that only claims an id that is absent or the exact detached `parked` ref a revival was authorized for. | `src/registry/agent-registry.ts:139-170,3973-4002` | primary
- **Stability across revive**: `AgentLifecycleManager.ensureLive(id)` revives the *same* ref; the persisted reviver reopens the ref's `sessionFile` and rebuilds the session with `agentId: ref.id`, `parentTaskPrefix: ref.id`, `parentAgentId: ref.parentId` — so the id is the persisted transcript stem, not a fresh allocation. Parked refs restored from disk take `id = <basename minus .jsonl>` with `displayName: id`. | `src/registry/agent-lifecycle.ts:341`; `src/task/persisted-revive.ts:64-79,158-215`; `src/registry/persisted-agents.ts:748,795-800`; reviver factory installed at `src/main.ts:2424-2440` | primary
- **Advisor transcripts** use the reserved stem `__advisor` and are never messageable/revivable. | `src/advisor/transcript-recorder.ts:12-16`; `src/irc/bus.ts:113-120` | primary

## 7. Persistence — is IRC traffic stored?

- **Inbound IRC is persisted into the recipient's session JSONL as a `custom_message` entry** with `customType: "irc:incoming"` and the full details blob. Path: `message_end` → `#persistMessageEnd` → `sessionManager.appendCustomMessageEntry(customType, content, display, details, attribution, timestamp)`. | `src/session/agent-session.ts:3372-3399`; `src/session/irc-bridge.ts:248-252` | primary
- **Entry shape**: `CustomMessageEntry { type: "custom_message", customType, content, details?, display, attribution? }`. | `src/session/session-entries.ts:280-292` | primary
- **Plan-mode delivery persists synchronously** via `appendCustomMessageEntry` (same entry). | `src/session/irc-bridge.ts:227-238` | primary
- **Wake delivery persists via the normal prompt pipeline** (prompt messages are emitted and stored). | `pi-agent-core/src/agent-loop.ts:1121-1125,1216`; `src/session/agent-session.ts:1206-1300` | primary
- **Late joiner can read history**: `history://<id>` renders a concise transcript for live OR parked agents, falling back to on-disk `<id>.jsonl`; the bare `history://` index lists registered + on-disk agents. So an agent that joins later can read another agent's received-message transcript if it knows the id. | `src/internal-urls/history-protocol.ts:1-19,60-64` | primary
- **But there is no room/channel log.** Messages are stored per-recipient, per-session; `agent://all` produces N independent transcript entries and no shared history. A late joiner cannot reconstruct a broadcast it did not receive. | `src/irc/messaging.ts:63-69`; `src/session/irc-bridge.ts:186-211` | primary
- **Relay cards are NOT persisted**: `irc:relay` observations go through `emitSessionEvent` only (`emitRelayObservation` → `{type:"irc_message"}`), with no `appendCustomMessageEntry`. | `src/irc/bus.ts:332-351`; `src/session/irc-bridge.ts:242-245` | primary
- **No artifact/jsonl channel store for IRC**: grep of `src/irc` shows no filesystem writes; the only artifacts are agent outputs/transcripts. | `src/irc/` (2 files) | primary

## 8. Config / gating — what enables or disables IRC

- **`isIrcEnabled(settings, taskDepth)`**: any subagent (depth > 0) → true; a top-level session → only if it can spawn peers at its depth (`canSpawnAtDepth(cfgTaskMaxRecursionDepth, taskDepth)`). | `src/irc/messaging.ts:16-21`; `src/task/types.ts:234-236`; `cfgTaskMaxRecursionDepth` default `2` (`src/task/settings.ts:271-275`) | primary
- **Send gate** (runtime refusal): `!registry || !senderId || session.enableIrc === false || !isIrcEnabled(...)` → `"Peer messaging is unavailable in this session."`. | `src/internal-urls/agent-protocol.ts:178-184` | primary
- **`enableIrc` option**: "Whether this invocation may expose IRC. `false` removes it even for subagents." **Forced `false` whenever `restrictToolNames`** (`enableIrc: restrictToolNames ? false : options.enableIrc`). | `src/sdk.ts:724-725,2198` | primary
- **Child executor gate**: `ircEnabled = options.enableIrc !== false && isIrcEnabled(subagentSettings, childDepth) && (toolNames === undefined || toolNames.includes("write"))` — inbound steering works without `write`, but outbound needs the `write` tool. | `src/task/executor.ts:3855-3859` | primary
- **Plan mode**: `enableIrc: !planMode && (...)` for structured subagents, and `restrictToolNames = policy.planMode || ...`. | `src/task/structured-subagent.ts:502-506,603-605` | primary
- **Explicit `enableIrc: false` sessions**: security coordinator (`src/security/coordinator.ts:259-267`, with `restrictToolNames:true` and a read-only tool list `SECURITY_SESSION_TOOLS` at `:48`); compress session (`src/compress/session.ts:50-68`); cleanse checker-discovery subagent (`src/cleanse/agent.ts:140-141`); cold-revive of a restricted persisted contract (`src/task/persisted-revive.ts:210-216`). | primary
- **No user-facing setting and no env var.** Grep of `src/config` and all `register({id: ...})` for `irc`/`peer` returns nothing; no `PI_IRC`/`OMP_IRC`. IRC is on/off purely from depth + `enableIrc` + `write` + `restrictToolNames`. | grep `id: "*irc*"` in `src/` | primary
- **Why restricted/plan/security sessions disable it**: restricted sessions cannot reach the registry/messaging surface by construction (`restrictToolNames` drops extension tools and forces `enableIrc:false`; plan-mode children are read-only planners). The compress session documents the intent explicitly: "no extensions, no MCP, no IRC, no LSP … so nothing outside the source text can influence the output." | `src/compress/session.ts:3-6`; `src/sdk.ts:2198`; `src/task/structured-subagent.ts:502-506` | primary
- **An explicit design-rationale comment for `security_scan`'s IRC-off is NOT FOUND**; the observable reason is only that it is a `restrictToolNames` read-only session with a fixed tool list. | `src/security/coordinator.ts:48,259-267` | `NOT FOUND` (rationale)

## 9. Limits — size cap, rate limit, queue depth, drop policy

- **Mailbox cap**: `MAILBOX_CAP = 100` per agent; overflow drops the OLDEST with a debug log. Applies only to the failed-delivery backlog. | `src/irc/bus.ts:24-25,279-294` | primary
- **No message-body size cap in the IRC layer**: the only check is non-empty content. | `src/internal-urls/agent-protocol.ts:190` | primary (`NOT FOUND` for a cap)
- **No rate limit / throttle**: grep `rate|limit|throttle|cap` in `src/irc` returns only `MAILBOX_CAP` and the `limit: 1` inbox-drain option. | `src/irc/bus.ts:24-25`; `src/irc/messaging.ts:29-34` | primary (`NOT FOUND` for rate limiting)
- **Queue depth is unbounded** for the session's `#interrupts` / `#asides` / `#deferredWakes` arrays. | `src/session/irc-bridge.ts:26-33` | primary
- **Broadcast fan-out is unbounded by count** (one send per visible peer); only the prompt roster is bounded at 32. | `src/irc/messaging.ts:63-69`; `pi-tui/src/tools/irc.ts:1-4` | primary
- **Waiters**: one per `wait` call, matched oldest-first and removed on settle; no cap. | `src/irc/bus.ts:195-268,297-313` | primary
- **`wait` safety cap** 30 min; job progress every 500 ms. | `src/tools/wait.ts:25-26` | primary
- **UI-only caps**: live IRC cards max 4 with a 10 s visible TTL, oldest retired first. | `src/modes/controllers/event-controller.ts:77-87,1227-1262` | primary
- **Doc/code divergence**: `omp://tools/wait.md` describes a message-only wait ladder of 5/10/30/60/300 s with a 60 s reset; the installed `src/tools/wait.ts` implements only the 30 min cap plus the bus leg. Flag as doc-vs-18.6.1 divergence. | `omp://tools/wait.md` vs `src/tools/wait.ts:100-189` | primary (doc) / unverified in code

## 10. What a plugin CAN and CANNOT reach

**CAN — seams that see the same traffic or an equivalent one**

- **Inject into a session with `sendMessage` / `sendUserMessage`** and `deliverAs: "steer" | "followUp" | "nextTurn" | "aside"`. `aside` rides the *same* step-boundary aside poll as IRC (`#irc.queueAside`) and starts a turn when idle; plan mode folds it into context. | `src/extensibility/extensions/types.ts:1592-1600`; `src/session/agent-session.ts:8275-8283,8404-8411,8446-8465` | primary
- **Observe resulting messages**: `message_start` / `message_update` / `message_end` extension events fire for messages entering agent state (including custom/IRC records that reach state), with `tool_call`, `tool_result`, `turn_start/end`, `agent_start/end`, `session_stop`, `input`, `before_agent_start`, `before_subagent_spawn`, `mcp_notification`, `user_bash`, `user_python`, `context`, provider hooks, etc. | `src/extensibility/extensions/types.ts:1381-1449` | primary
- **Reach every session in one process**: extension factories are rebound per subagent session (own `ExtensionAPI`) while module state stays shared, and the same `EventBus` is passed to child sessions. | `src/extensibility/extensions/loader.ts:485-520`; `src/sdk.ts:2573-2590,2228-2230`; `src/task/structured-subagent.ts:652-655` | primary
- **Register tools/commands/UI**: `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`, `registerMessageRenderer`, `registerComposerShape`, `registerFileWriteFallback`, `registerFileDeleteFallback`; `ctx.setInterval/setTimeout`, `ctx.runEphemeralTurn`, `ctx.agent` identity, `appendEntry` durable per-session state, `getAsyncJobSnapshot`, `pi.events`. | `src/extensibility/extensions/types.ts:1449-1695,485-560` | primary
- **Delegate to a native built-in** from a re-registered tool via `ctx.invokeTool` (same-tool only). | `src/extensibility/extensions/types.ts:565-579` | primary
- **A plugin can carry its own bus traffic** on `pi.events` (channel + payload) and get a room-like fan-out in-process, because the bus is shared with children. | `src/utils/event-bus.ts:1-33`; `src/extensibility/extensions/types.ts:1695` | primary

**CANNOT — seams it cannot reach**

- **No `irc_message` extension event.** `irc_message` is an `AgentSessionEvent`; `extensionEventFromSessionEvent` has no case for it and returns `null` for unknown types, so extensions never see IRC traffic directly (they only see the underlying `message_start`/`message_end` when the record enters state). | `src/session/agent-session-events.ts:73`; `src/extensibility/extensions/lifecycle-mirror.ts:119-235`; `src/session/agent-session.ts:4812-4831` | primary
- **No hook between `IrcBridge.deliver` and agent state**: there is no extension callback in the delivery path (bus → `session.deliverIrcMessage` → bridge), so inbound peer messages cannot be intercepted, filtered, or rewritten. | `src/irc/bus.ts:165-191`; `src/session/irc-bridge.ts:175-241` | primary
- **Cannot register an internal URL scheme.** `InternalUrlRouter.register` is process-global code; the constructor registers a fixed builtin list and `isBuiltin()` marks them reserved (RPC host URIs explicitly refuse reserved schemes). No `registerProtocol` exists on `ExtensionAPI`. A plugin cannot add `room://`. | `src/internal-urls/router.ts:99-127,170-173`; `src/modes/rpc/host-uris.ts:105-108`; `src/extensibility/extensions/types.ts:1357-1696` | primary
- **Cannot swap the `IrcBus`**: it is a private-singleton module (`IrcBus.#global`) with no injection point from `ExtensionAPI`; only the Agent Hub runtime and SDK internals construct it. | `src/irc/bus.ts:27-40`; `src/modes/agent-hub-runtime.ts:53` | primary
- **Cannot reach the display-only relay**: `irc:relay` cards are emitted on `AgentSessionEvent` only; no extension event carries them. | `src/irc/bus.ts:332-351` | primary
- **Restricted children lose extension tools entirely** (plan mode / `restrictToolNames`): `registeredTools = restrictToolNames ? [] : extensionRunner.getAllRegisteredTools()` and custom tool paths are dropped, though prepared extension hooks still forward. | `src/sdk.ts:3281-3286,2573-2590`; `src/task/structured-subagent.ts:603-605,673-677` | primary
- **Importing `@oh-my-pi/pi-coding-agent/irc/bus` from a plugin is possible but unsupported**: the legacy specifier shim remaps the `@oh-my-pi` scope to the host's bundled copy (single module registry), so `IrcBus.global()` would be the same instance — but this bypasses the documented extension surface and is not an advertised API. | `src/extensibility/plugins/legacy-pi-compat.ts:802-814,1102-1123,2702-2815` | `[INFERENCE]`

---

## Load-bearing facts for the report (3-5)

1. **IRC is a process-global in-memory bus, not a channel.** `IrcBus.global()` + `AgentRegistry.global()`; messages fan out per-recipient, are stored (if at all) only in each recipient's own session JSONL, and there is no room log a late joiner can read. Cross-process does not exist outside Collab.
2. **Delivery is state-dependent and asymmetric**: streaming+parent → hard `steer`; streaming+peer → step-boundary aside; idle → autonomous wake turn with a relayed answer; plan mode → context fold with no turn. Only *parent* messages can interrupt a running turn.
3. **`agent://all` is a flat, live-only broadcast** to `running|idle` non-advisor refs — no rooms, no membership, no subscription, no read receipts; unread counts only ever reflect *failed* hand-offs.
4. **Interrupt folding is exactly `[external, steering, irc]` for interruptible wait-like tools; side-effecting foreground tools get only a cooperative `steeringSignal`** — so any plugin that wants to interrupt work must go through steering or accept step-boundary asides.
5. **A plugin cannot hook IRC**: no `irc_message` extension event, no delivery-path callback, no URL-scheme registration, no bus injection. Its only native seams are `sendMessage`/`deliverAs`, the shared `EventBus`, the standard lifecycle events, and the message events produced once a record enters agent state.
