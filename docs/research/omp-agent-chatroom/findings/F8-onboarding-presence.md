# F8 Room Onboarding, Presence, and Backpressure

## Angle
How do real multi-agent and chat protocols handle join/presence/identity, backlog replay, and backpressure — and what should a room-join digest contain for an omp plugin?

## Claims

### Protocol Join/Presence/Identity Semantics

- **IRC (RFC 1459/2812)**: Channel created implicitly on first JOIN, destroyed when last client leaves. On successful JOIN, server sends: (1) JOIN confirmation to joiner, (2) JOIN broadcast to all channel members, (3) `RPL_TOPIC` (channel topic), (4) `RPL_NAMREPLY` + `RPL_ENDOFNAMES` (full member list including joiner). No history replay — IRC is pure presence + live messages. | https://www.rfc-editor.org/rfc/rfc2812 | fetch date 2026-10-06 | confidence: primary | notes: §3.2.1 Join message, §5.1 Command responses. The joiner gets topic + roster but zero backlog.

- **XMPP MUC (XEP-0045)**: Join = directed presence to `<room@service/nick>` (no `type` attribute). On entry, service sends: (1) presence broadcast to all occupants, (2) room subject to new occupant, (3) **history** — limited number of message stanzas sent to new occupant for context. Room config via `muc#roomconfig` data form. Roles (moderator/participant/visitor) are session-scoped; affiliations (owner/admin/member/outcast) persist across visits. | https://xmpp.org/extensions/xep-0045.html | fetch date 2026-10-06 | confidence: primary | notes: §4.1 History definition, §5 Roles/Affiliations, §6 Entering a Room. History depth is room-configurable.

- **Matrix (Client-Server API)**: Sync via `GET /_matrix/client/v3/sync?since=<token>`. Server returns room state (membership, events) + timeline (messages) since token. Read receipts via `POST /rooms/{roomId}/receipt/{receiptType}/{eventId}` — single read marker per room per user. `m.receipt` events delivered in `/sync` ephemeral array. No built-in "join digest" — client reconstructs from sync response. | https://spec.matrix.org/v1.9/client-server-api/#syncing | fetch date 2026-10-06 | confidence: primary | notes: Sync is incremental; `next_batch` token enables resume. Read receipts are explicit, not implicit.

- **NNTP (RFC 3977)**: `GROUP <name>` selects newsgroup, returns article count + first/last article numbers. `ARTICLE <msgid>` retrieves specific article. `LISTGROUP` returns all article IDs in group. `OVER` returns overview (headers) for range. No presence concept — purely pull-based article retrieval. Client tracks last-read article ID as cursor. | https://www.rfc-editor.org/rfc/rfc3977 | fetch date 2026-10-06 | confidence: primary | notes: §6.1.1 GROUP, §6.2.1 ARTICLE, §8.3 OVER. No join/presence — stateless article access.

- **Zulip**: `POST /register` creates event queue, returns `queue_id` + `last_event_id`. Client specifies `event_types` filter (e.g. `["message"]`). Response includes `unread_msgs` with per-topic unread counts. Long-polling via `GET /events?queue_id=...&last_event_id=...`. Topic-based streams; unread counts per stream+topic. `idle_queue_timeout_secs` controls queue lifetime. | https://zulip.com/api/register-queue | fetch date 2026-10-06 | confidence: primary | notes: Register returns full state snapshot; subsequent calls are incremental. Unread counts are server-computed.

- **Slack**: `conversations.join` adds user to channel. `conversations.history` paginates with `cursor` + `oldest`/`latest` timestamps + `limit` (default 100, max 999). `conversations.mark` sets read cursor. No server-side join digest — client fetches history explicitly. `channel_join` message event sent to channel. | https://docs.slack.dev/reference/methods/conversations.history | fetch date 2026-10-06 | confidence: primary | notes: History is pull-based with cursor pagination. Read state is client-managed via `conversations.mark`.

- **Discord**: Gateway WebSocket with `GUILD_CREATE` event on join (lazy-load for unavailable guilds). `GUILD_MEMBER_ADD` fires when user joins. `REQUEST_GUILD_MEMBERS` opcode fetches member list (up to 1000 per chunk). `large_threshold` (default 50) controls whether offline members are sent. Resume via `RESUME` opcode with `session_id` + `seq`. | https://docs.discord.com/developers/events/gateway-events | fetch date 2026-10-06 | confidence: primary | notes: Guild = server. Channels are guild sub-resources. Presence is implicit via gateway connection.

### Agent Framework Onboarding

- **A2A Agent Card**: JSON at `/.well-known/agent-card.json` with `name`, `description`, `url`, `capabilities` (streaming, pushNotifications, stateTransitionHistory), `authentication`, `defaultInputModes`/`defaultOutputModes`, `skills[]`. Discovery = HTTP GET. No presence/room concept — purely capability advertisement. | https://agent2agent.info/docs/concepts/agentcard | fetch date 2026-10-06 | confidence: primary | notes: Agent Card is the identity + capability declaration for A2A agents.

- **AutoGen**: Agents are `ConversableAgent` instances with `name`, `llm_config`, `system_message`. Group chat via `GroupChat` manager with `agents[]` list + `messages[]` buffer. Agent registration = adding to `GroupChat.agents`. No built-in presence — agents are either in the conversation or not. `register_reply()` adds auto-reply handlers. | https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat | fetch date 2026-10-06 | confidence: primary | notes: GroupChat manager broadcasts messages; speaker selection via LLM or round-robin.

- **LangGraph**: State = typed channels (dict-like). `thread_id` isolates conversations. Checkpoints = state snapshots at points in time. `get_state_history()` returns checkpoint sequence. No presence concept — state is the source of truth. Multi-agent = graph nodes reading/writing shared channels. | https://langchain-ai.github.io/langgraph/concepts/persistence/ | fetch date 2026-10-06 | confidence: primary | notes: Checkpoint = snapshot of channel values + version tracking. Thread = sequence of checkpoints.

### omp-Specific Conventions

- **omp `task` tool**: `context` param (batch mode) = shared background rendered into every subagent's system prompt `CONTEXT` section. Flat mode: shared background written to `local://` file, referenced in each spawn's `task`. Subagents share parent's `local://` root. Agent registry: process-global `AgentRegistry` with states `running | idle | parked | aborted`. `agent://<id>` resolves to subagent output. `history://<id>` renders transcript. | https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md | fetch date 2026-10-06 | confidence: primary | notes: `context` is the onboarding digest equivalent — it's what a fresh subagent reads first.

- **AGENTS.md / CLAUDE.md**: Convention for agent onboarding files. `AGENTS.md` (OpenAI Codex, with S) vs `CLAUDE.md` (Claude Code) vs `GEMINI.md` (Gemini CLI). Content: setup commands, build steps, code conventions, testing workflows. Auto-loaded by agent harnesses. Nested `AGENTS.md` in subdirectories for scoped conventions. | https://pnote.eu/notes/agents-md | fetch date 2026-10-06 | confidence: secondary | notes: AGENTS.md is becoming the cross-tool standard. Path-scoped rules load on demand.

### Backpressure Patterns

- **Drop-oldest**: When queue full, discard oldest messages. Suitable for metrics/telemetry where only latest matters. | https://clearmeasure.com/backpressure-in-message-based-systems | fetch date 2026-10-06 | confidence: secondary | notes: Weather station example — only current data matters.

- **Load shedding**: Drop non-critical requests beyond threshold. Priority-based: high-priority processed first. | https://dev.to/devcorner/effective-backpressure-handling-in-distributed-systems-techniques-implementations-and-workflows-16lm | fetch date 2026-10-06 | confidence: secondary | notes: Threshold-based shedding with priority handling.

- **Rate limiting + dynamic adjustment**: Reject excess requests with error, signal clients to retry with exponential backoff. | https://www.architecture-weekly.com/p/architecture-weekly-190-queuing-backpressure | fetch date 2026-10-06 | confidence: secondary | notes: Client-side backoff on 429/503.

- **Coalescing**: Merge multiple rapid updates into single digest. Zulip's `unread_msgs` is a coalesced count, not individual messages. | https://zulip.com/api/register-queue | fetch date 2026-10-06 | confidence: primary | notes: Server coalesces unread into per-topic counts.

### Room-Join Digest — Synthesized Requirements

[INFERENCE] A room-join digest for an omp chatroom plugin should contain:
1. **Identity**: Agent name, role, capabilities (from Agent Card or AGENTS.md)
2. **Roster**: Current occupants with roles/affiliations (IRC NAMES, XMPP MUC presence, Discord GUILD_MEMBERS)
3. **Topic/Purpose**: Room subject (IRC RPL_TOPIC, XMPP MUC subject, Slack purpose)
4. **Backlog**: Last-N messages or summary (XMPP MUC history, Slack conversations.history, Matrix /sync since-token)
5. **Unread cursor**: Last-read position (Matrix read receipts, Zulip last_event_id, NNTP last article ID)
6. **Pinned/Important**: Pinned messages or backlog highlights (Slack pin_count, Zulip unread_msgs)
7. **Room config**: Moderation status, member list, room type (XMPP MUC muc#roomconfig, Discord guild features)

## Searches
- "A2A Agent Card specification identity capabilities discovery"
- "XEP-0045 MUC multi-user chat join history stanza roomconfig"
- "Matrix client-server API sync since token room state read receipts"
- "IRC RFC 1459 JOIN NAMES TOPIC channel join semantics"
- "NNTP RFC 3977 group join article history"
- "Zulip API topic stream unread counts register queue"
- "Slack conversations.join history API channel join"
- "Discord gateway GUILD_CREATE join guild channels"
- "AutoGen agent registration multi-agent conversation"
- "LangGraph state channels multi-agent checkpoint"
- "AGENTS.md CLAUDE.md agent onboarding conventions handoff notes"
- "message queue backpressure drop oldest coalesce digest summary"
- "omp coding agent context param local shared root"

## Conflicting Evidence
- IRC provides zero history on join (pure presence), while XMPP MUC provides configurable history. Matrix provides full state via sync but no "digest" abstraction. These are design choices, not conflicts — but they show no universal standard for join digests.
- A2A Agent Cards have no room/presence concept at all — they are purely capability advertisements. This is a gap if A2A agents need to join rooms.

## Gaps
- No primary source found for "digest-on-join" as a formal protocol feature. XMPP MUC history is closest but is just "last N messages," not a structured digest. [INFERENCE] The digest concept is a higher-level abstraction that protocols leave to clients.
- omp's `context` param is the closest existing analog to a join digest, but it's a system-prompt injection, not a structured room state object. No formal spec for what it contains.
- Backpressure in agent-specific contexts (e.g., what happens when a subagent's output queue is full) is not documented in AutoGen/LangGraph — they rely on framework-level flow control.
