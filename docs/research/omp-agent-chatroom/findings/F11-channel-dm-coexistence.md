# F11 Channel/DM coexistence + high-volume room mechanics

## Angle
How canonical chat systems (IRC, Slack, Discord, Zulip) model the channel-vs-DM distinction, what mechanics make a high-volume room useful rather than noise, and what multi-agent / distributed-systems literature says about broadcast vs point-to-point. Goal = a concrete routing rule for an omp agent: when to post to a room vs send `agent://<id>`.

## Claims

### A. IRC — canonical channel-vs-DM model (RFC 1459, RFC 2812, RFC 1855, IRCv3)

- IRC uses a single `PRIVMSG` command for both channel broadcast and direct-to-user messaging, distinguished by the `msgtarget` parameter: if it starts with `#`, `+`, `&`, or `!` it is a channel; otherwise it is a user nickname | https://www.rfc-editor.org/rfc/rfc1459 §4.4.1 ; https://www.rfc-editor.org/rfc/rfc2812 §3.3.1 | 2026-10-06 | primary
- RFC 2812 refines the BNF: `msgto = channel / ( user [ "%" host ] "@" servername ) / ( user "%" host ) / targetmask / nickname / ( nickname "!" user "@" host )` — channel prefixes are `#` (standard), `&` (local), `+` (no modes), `!` (safe) | https://www.rfc-editor.org/rfc/rfc2812 §3.3.1 | 2026-10-06 | primary
- Channel membership is dynamic: JOIN creates the channel if it does not exist; the channel is destroyed when the last user PARTs | https://www.rfc-editor.org/rfc/rfc1459 §4.2.1-4.2.2 | 2026-10-06 | primary
- Channel modes: `o` (operator), `v` (voice), `p` (private), `s` (secret), `n` (no external messages), `t` (topic settable only by ops), `i` (invite-only), `m` (moderated), `l` (user limit), `b` (ban mask), `k` (key/password) | https://www.rfc-editor.org/rfc/rfc1459 §4.2.3 | 2026-10-06 | primary
- Channel operator (marked `@` in NAMES/WHO) has exclusive powers: KICK, MODE, INVITE, TOPIC — the only role-based privilege system in base IRC | https://www.rfc-editor.org/rfc/rfc1459 §4.2.3 | 2026-10-06 | primary
- Presence discovery: NAMES lists users in a channel; WHO queries user info by mask — both are the canonical "who is here" primitives | https://www.rfc-editor.org/rfc/rfc1459 §4.2.4, §4.5.1 | 2026-10-06 | primary
- TOPIC is a per-channel single string, settable only by channel operators — the only "shared state" primitive in base IRC | https://www.rfc-editor.org/rfc/rfc1459 §4.3.2 | 2026-10-06 | primary
- NICK is the user's identity on the server; it is the addressing target for DMs | https://www.rfc-editor.org/rfc/rfc1459 §4.1.2 | 2026-10-06 | primary
- RFC 1855 §2.0 (one-to-one): private messages are for "personal, private, or sensitive" communication; §3.0 (one-to-many): channels are for "public discussion" — the netiquette rule is: if it concerns only one person, use DM; if it concerns the group, use channel | https://www.rfc-editor.org/rfc/rfc1855 §2.0, §3.0 | 2026-10-06 | primary
- IRCv3 message-tags: extends message format with `@tags` prefix — foundation for account-tag, server-time, batch, and client-only tags (`+reply`, `+react`, `+typing`, `+channel-context`) | https://ircv3.net/specs/extensions/message-tags | 2026-10-06 | primary
- IRCv3 batch: adds BATCH verb for grouping related messages — enables atomic delivery of multiline messages and labeled responses | https://ircv3.net/specs/extensions/batch | 2026-10-06 | primary
- IRCv3 labeled-response: adds label tag to correlate client requests with server responses — enables echo-message correlation | https://ircv3.net/specs/extensions/labeled-response | 2026-10-06 | primary
- IRCv3 account-tag: adds account message tag to all commands from a user, identifying their services account | https://ircv3.net/specs/extensions/account-tag | 2026-10-06 | primary
- IRCv3 away-notify: adds AWAY message notifications to clients sharing a channel — replaces WHO polling for away state tracking | https://ircv3.net/specs/extensions/away-notify | 2026-10-06 | primary
- IRCv3 chathistory: adds replay of channel history on JOIN — the only persistence primitive in IRCv3 | https://ircv3.net/specs/extensions/chathistory | 2026-10-06 | primary
- IRCv3 echo-message: adds echo of sent messages back to sender — the only delivery-confirmation primitive in IRCv3 | https://ircv3.net/specs/extensions/echo-message | 2026-10-06 | primary

### B. Slack — first-party docs

- `thread_ts`: provide parent message's `ts` to reply in thread; avoid using a reply's `ts` — use its parent | https://docs.slack.dev/reference/methods/chat.postMessage/ | 2026-10-06 | primary
- `reply_broadcast`: sparingly set `true` if reply is important enough for everyone in channel to receive; defaults to `false` — puts reply in channel feed but does NOT guarantee push notifications | https://docs.slack.dev/reference/methods/chat.postMessage/ | 2026-10-06 | primary
- Rate limit: ~1 msg/sec per channel with workspace-level burst; text truncation at 40K chars (recommend 4K) | https://docs.slack.dev/reference/methods/chat.postMessage/ | 2026-10-06 | primary
- `conversations.replies`: retrieve thread by channel+ts; returns `reply_count`, `subscribed`, `last_read`, `unread_count` per message; rate limited to 1 req/min for new non-Marketplace apps | https://docs.slack.dev/reference/methods/conversations.replies/ | 2026-10-06 | primary
- `conversations.list`: `types` param mixes `public_channel`/`private_channel`/`mpim`/`im`; returns `is_channel`/`is_group`/`is_im`/`is_mpim` flags; `unread_count` only for DM conversations | https://docs.slack.dev/reference/methods/conversations.list/ | 2026-10-06 | primary
- `conversations.open`: `users` param takes 1-8 user IDs (1=DM, 2-8=MPIM); `prevent_creation` flag to check existence | https://docs.slack.dev/reference/methods/conversations.open/ | 2026-10-06 | primary
- `chat.postEphemeral`: send user-visible-only message in a channel; requires user to be active and channel member; not persisted across sessions | https://docs.slack.dev/reference/methods/chat.postEphemeral/ | 2026-10-06 | primary
- Notification management: "Just mentions" = notify only on @mentions; "Mute" = silence everything including mentions — key distinction for high-volume rooms | https://slack.com/help/articles/360056534254 | 2026-10-06 | primary
- Mute channels/DMs: turns off all notifications for that conversation; muted channels still show in sidebar | https://slack.com/help/articles/204411433 | 2026-10-06 | primary
- Mark-as-read: per-conversation, all unreads, Activity badge — unread count management | https://slack.com/help/articles/360043037853 | 2026-10-06 | primary
- Huddles (Calls API): register call with `external_unique_id` + `join_url`; supports `desktop_app_join_url` for deep linking | https://docs.slack.dev/reference/methods/calls.add/ | 2026-10-06 | primary
- Channel canvases: per-channel rich documents (1 MiB limit); access tied to channel membership | https://docs.slack.dev/reference/methods/conversations.canvases.create/ | 2026-10-06 | primary
- Socket Mode: WebSocket-based event delivery; up to 10 concurrent connections; events distributed across connections | https://docs.slack.dev/apis/events-api/using-socket-mode/ | 2026-10-06 | primary

### C. Discord — first-party docs

- Threads: temporary sub-channels for organizing busy channels; public (from message) and private (invite-only, like Group DM); auto-archive after inactivity (1h/24h/3d/1d); archived threads not synced via gateway | https://docs.discord.com/developers/topics/threads | 2026-10-06 | primary
- Thread permissions: `SEND_MESSAGES_IN_THREADS` required (`SEND_MESSAGES` has no effect); 4 permissions total (`SEND_MESSAGES_IN_THREADS`, `CREATE_PUBLIC_THREADS`, `CREATE_PRIVATE_THREADS`, `MANAGE_THREADS`) | https://docs.discord.com/developers/topics/threads | 2026-10-06 | primary
- Forum channels (type 15): persistent channels organized as titled posts with tags for filtering; `REQUIRE_TAG` flag; `available_tags`, `default_sort_order`, `default_forum_layout` | https://docs.discord.com/developers/resources/channel | 2026-10-06 | primary
- Channel types: `GUILD_TEXT`(0), `DM`(1), `GUILD_VOICE`(2), `GROUP_DM`(3), `GUILD_CATEGORY`(4), `GUILD_ANNOUNCEMENT`(5), `ANNOUNCEMENT_THREAD`(10), `PUBLIC_THREAD`(11), `PRIVATE_THREAD`(12), `GUILD_STAGE_VOICE`(13), `GUILD_DIRECTORY`(14), `GUILD_FORUM`(15), `GUILD_MEDIA`(16) | https://docs.discord.com/developers/resources/channel | 2026-10-06 | primary
- Rate limits: per-route (`X-RateLimit-Bucket` for shared limits); global 50 req/sec per bot; invalid request limit 10,000 per 10 min for 401/403/429; `rate_limit_per_user`: 0-21600s, bots and `BYPASS_SLOWMODE` unaffected | https://docs.discord.com/developers/topics/rate-limits | 2026-10-06 | primary
- Stage channels: Community servers only; speaker/audience/moderator roles; audience muted by default; audio-only: unlimited speakers + 10K audience; request-to-speak queue | https://support.discord.com/hc/en-us/articles/1500005513722 | 2026-10-06 | primary
- Notification settings: "Only @mentions" still includes @everyone/@here; separate "Suppress @everyone and @here" toggle needed | https://support.discord.com/hc/en-us/articles/215253258 | 2026-10-06 | primary
- Forum channels FAQ: hide after inactivity (1h/24h/3d/1w default 3d); list/gallery view layouts; one pinned post; AutoMod support; slow mode available; forums are persistent channels vs threads are temporary | https://support.discord.com/hc/en-us/articles/6208479917079 | 2026-10-06 | primary
- Threads FAQ: max 1000 members per thread; role mentions add members (max 10 roles, <100 members each); threads have own notification settings | https://support.discord.com/hc/en-us/articles/4403205878423 | 2026-10-06 | primary

### D. Zulip — first-party docs

- Stream + topic model: channels define *who* sees messages, topics define *what* the conversation is about; topics are label-based (not anchored to a first message), persist over hours/days, and can be searched | https://zulip.com/help/introduction-to-topics | 2026-10-06 | primary
- Zulip channels: organize by who needs to see messages (e.g., per team); topics further organize within channels so no need for project-specific channels; subscribing controls inbox/feed/sidebar visibility and @-mention notifications | https://zulip.com/help/introduction-to-channels | 2026-10-06 | primary
- Mute topic: suppresses notifications, excludes from unread counts, messages still viewable, mentions still notify; search filter `is:muted` | https://zulip.com/help/mute-a-topic | 2026-10-06 | primary
- Mute channel: quiets all topics; can still follow/unmute individual topics within muted channel; auto-unmute on participation | https://zulip.com/help/mute-a-channel | 2026-10-06 | primary
- Follow topic: track specific topics across channels; Inbox "Followed topics" filter; desktop badge can count only followed topics | https://zulip.com/help/follow-a-topic | 2026-10-06 | primary
- Topic notifications: configure per-topic notification triggers in Personal settings | https://zulip.com/help/topic-notifications | 2026-10-06 | primary
- Unread counts: per-channel numbers/dots, home view total, mark topic/channel read; muted topics excluded from counts | https://zulip.com/help/configure-unread-message-counters | 2026-10-06 | primary
- Inbox (Shift+I): unified view of unread conversations; Recent conversations (T) for catch-up | https://zulip.com/help/inbox | 2026-10-06 | primary
- Digest emails: beta feature, weekly emails to users inactive 5+ days; includes new channels + traffic highlights; org-admin enabled; individual opt-out | https://zulip.com/help/digest-emails | 2026-10-06 | primary
- Email notifications: DMs, mentions, alerts, channel messages, followed topics; delayed and combined; cancelled if read before send | https://zulip.com/help/email-notifications | 2026-10-06 | primary
- Zulip DMs: 1:1 and small group conversations outside channels; private to participants; guidance: if frequently conversing with same people, create private channel for topic organization and subscription management | https://zulip.com/help/direct-messages | 2026-10-06 | primary
- Combined feed: all unmuted messages (channels + DMs) in one view; configurable as home view | https://zulip.com/help/combined-feed | 2026-10-06 | primary
- Resolve topics: mark resolved with checkmark; triggers Notification Bot; `is:resolved`/`-is:resolved` search filters; useful for support/issues/workflow tracking | https://zulip.com/help/resolve-a-topic | 2026-10-06 | primary
- Channel permissions: private (invited-only, shared/protected history), public (all members), web-public (anyone on internet); configurable: who can administer/subscribe/post/start topics/move messages/resolve/delete; topics can be required | https://zulip.com/help/channel-permissions | 2026-10-06 | primary
- Zulip value proposition: topic-based threading enables organized communication, read one conversation at a time, async participation without missing context, no need to create new channels for busy topics, reduces meetings, chat history as knowledge base | https://zulip.com/why-zulip/ | 2026-10-06 | primary

### E. Multi-agent / distributed-systems literature — broadcast vs point-to-point

- TalkHier (arXiv 2502.11098): hierarchical communication protocol for LLM multi-agent systems; supervisor agents select who speaks, aggregate feedback, enforce quality thresholds; member→supervisor edges carry less background info than supervisor→member (asymmetric directed edges); surpasses o1-preview, AgentVerse, majority voting on MMLU (88.38% vs 87.56%) | https://arxiv.org/abs/2502.11098 | 2026-10-06 | primary
- Google "Towards a Science of Scaling Agent Systems" (arXiv 2512.08296): 260 configurations, 5 architectures (Single, Independent, Centralized, Decentralized, Hybrid), 3 LLM families, 6 benchmarks; centralized best for decomposable financial reasoning (+80.8% over single-agent); decentralized best for dynamic web navigation (+9.2% vs +0.2% centralized); ALL multi-agent variants worse on sequential planning (-39% to -70%) | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary
- Google error amplification: independent systems propagate errors through unchecked cascades; centralized contains errors via validation bottlenecks (reduces error amplification from 1.0 to ~0.3) | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary
- Google capability ceiling: when single-agent >45% accuracy, multi-agent hurts | https://arxiv.org/abs/2512.08296 | 2026-10-06 | primary
- Anthropic multi-agent Research system: hub-and-spoke (star) topology with orchestrator-worker pattern; subagents do NOT coordinate directly; 90.2% improvement over single-agent on internal research eval; token usage 4x more than single-agent chat, 15x more than regular chat; subagents act as "intelligent filters" with separate context windows; parallel tool calling cut research time by up to 90% | https://anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Anthropic: domains requiring shared context or many inter-agent dependencies are NOT good fits for multi-agent; subagent outputs to filesystem to minimize "game of telephone" — direct artifact sharing bypasses coordinator | https://anthropic.com/engineering/multi-agent-research-system | 2026-10-06 | primary
- Corkill 1991 "Blackboard Systems": blackboard = shared global database + independent knowledge sources (KSs) + control component; KSs are independent, large-grained modules; event-based activation (KSs triggered by blackboard changes, not direct messages); control component selects among triggered KSs using quality/cost estimates; best for diverse representations, integration frameworks, uncertain knowledge, multilevel reasoning, dynamic control; NOT for simple problems, familiar frameworks, static control needs | https://dancorkill.com/pubs/ai-expert.pdf | 2026-10-06 | primary
- Li et al. EMNLP 2024 Findings "Improving Multi-Agent Debate with Sparse Communication Topology": fully-connected (D=1) vs neighbor-connected (D=2/5) topologies; MATH: fully-connected 64.0% → sparse 66.0% (+2.0) with 41.5% cost reduction; GSM8K: fully-connected 84.5% → sparse 84.5% (same) with 43.6% cost reduction; MathVista: sparse +1.2% over fully-connected with 33.1% cost reduction; not "sparser is always better" — moderately sparse (D=3/5) sometimes worse than both extremes | https://aclanthology.org/2024.findings-emnlp.427.pdf | 2026-10-06 | primary
- Jiang et al. ACL 2026 "Dynamic Generation of Multi-LLM Agents Communication Topologies with Graph Diffusion Models": static/hand-crafted topologies fail to adapt to diverse task requirements; generated sparse topologies significantly outperform existing methods; on GSM8K: >94% accuracy with 4.8M tokens vs LLM-Debate using >5x as many tokens | https://arxiv.org/abs/2510.07799 | 2026-10-06 | primary
- "The Hallucination Snowball" (arXiv 2608.14588): injected 346 hallucinations into 4-stage financial pipeline; for GPT-4o, detection fell from 72.0% at Stage 1 to 50.9% at Stage 4; 23.7% of injected hallucinations survived to final output undetected; verification at handoffs reduced survival substantially vs checking only at end | https://arxiv.org/abs/2608.14588 | 2026-10-06 | primary
- "From Spark to Fire" (arXiv 2603.04474): studies cascade amplification, topology sensitivity, and consensus inertia across six frameworks; interaction topology, handoff verification, agent independence, and debate protocol determine whether errors spread, get corrected, or change form | https://arxiv.org/abs/2603.04474 | 2026-10-06 | primary
- "Revisiting Gossip Protocols" (arXiv 2508.01531): gossip as decentralized complement to structured agent-to-agent communication; each agent periodically exchanges selected messages with a few peers; avoids central bottleneck, tolerates disconnections; but creates delays and duplicates; bad/outdated information can spread; needs provenance, bounded message size, rate limits, trust/reputation controls, explicit expiry | https://arxiv.org/abs/2508.01531 | 2026-10-06 | primary
- Azure Service Bus: "Use a queue to distribute work; use pub-sub to distribute information" — queue = one worker should perform task, competing workers, clear owner/retry/ack; pub-sub = multiple systems independently react, producer doesn't know subscribers, independent processing rates/backlogs | https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions | 2026-10-06 | primary

### F. High-volume room mechanics — evidence

- Zulip topics: most granular model — per-topic mute/follow + unread counts; topics persist over hours/days for async participation | https://zulip.com/help/introduction-to-topics | 2026-10-06 | primary
- Discord forum channels: titled posts with tags for organization/filtering; `REQUIRE_TAG` flag; closest Discord equivalent to topic segmentation | https://support.discord.com/hc/en-us/articles/6208479917079 | 2026-10-06 | primary
- Slack threads: reply in thread, optional "Also send to channel" broadcast; thread replies are grouped under parent message | https://slack.com/help/articles/115000769927 | 2026-10-06 | primary
- Slack notification management: "Just mentions" = notify only on @mentions; "Mute" = silence everything including mentions — key distinction for high-volume rooms | https://slack.com/help/articles/360056534254 | 2026-10-06 | primary
- Discord threads: auto-archive durations 1hr/24hr/3days(default)/1week; archived threads can be reopened | https://support.discord.com/hc/en-us/articles/4403205878423 | 2026-10-06 | primary
- IRC /IGNORE: filter by nick/host mask and message type (MSGS, NOTICES, PUBLIC, CTCP, ALL); client-specific, not protocol-standardized | https://www.irchelp.org/clients/unix/ircii/commands/irciihelp/ignore.html | 2026-10-06 | primary
- Matrix MSC3440: `m.thread` relation; thread root linked via relation; added in Matrix v1.4 | https://spec.matrix.org/latest/client-server-api/#threading | 2026-10-06 | primary
- Mattermost threads: start, open, follow, manage; enabled by default for new deployments | https://docs.mattermost.com/end-user-guide/collaborate/organize-conversations | 2026-10-06 | primary
- Academic: "Information Overload and the Message Dynamics of Online Interaction Spaces" — foundational study on coping with overload in group discussion | https://pubsonline.informs.org/doi/10.1287/isre.1040.0023 | 2026-10-06 | primary
- Academic: "Information Overload in Group Communication: From Conversation to Cacophony in the Twitch Chat" — quantitative study of overload in large-scale chat | https://arxiv.org/abs/1610.06497 | 2026-10-06 | primary
- Academic: Smith et al. CHI 2000 "Conversation trees and threaded chats" — threaded chat did NOT significantly improve task performance vs standard chat in lab study | https://www.researchgate.net/publication/220879435_Conversation_trees_and_threaded_chats | 2026-10-06 | primary
- Academic: Aragón et al. ICWSM 2017 — shift to threaded discussion increased reciprocal exchanges in online discussion | https://ojs.aaai.org/index.php/ICWSM/article/view/14880 | 2026-10-06 | primary
- Academic: Nelimarkka et al. 2015 — 65% of messages in event chats belonged to topic-focused threads even without technical threading support | https://www.sciencedirect.com/science/article/abs/pii/S0747563215300224 | 2026-10-06 | primary

## Candidate routing rule

Ordered decision rule for an omp agent: *when do I post to the room vs send `agent://<id>`?*

1. **Recipient count = 1 → DM.** If the message is for exactly one agent, send `agent://<id>`. Rationale: RFC 1459 PRIVMSG model — channel vs user distinction is fundamental; Azure Service Bus "use a queue to distribute work" (one owner). | https://www.rfc-editor.org/rfc/rfc1459 §4.4.1 ; https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions

2. **Recipient count > 1, no shared visibility needed → DM each.** If multiple agents need the message but they don't need to see each other's responses, send separate DMs. Rationale: Anthropic hub-and-spoke — subagents do NOT coordinate directly; Google centralized — decomposable tasks best with directed communication. | https://anthropic.com/engineering/multi-agent-research-system ; https://arxiv.org/abs/2512.08296

3. **Recipient count > 1, shared visibility needed → room.** If multiple agents need to see the message AND each other's responses, post to room. Rationale: RFC 1855 §3.0 — channels for "public discussion"; Zulip channel = who sees; Azure pub-sub "distribute information" (multiple consumers react independently). | https://www.rfc-editor.org/rfc/rfc1855 §3.0 ; https://zulip.com/help/introduction-to-channels ; https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-queues-topics-subscriptions

4. **Interrupt intended → DM.** If the message should interrupt a running agent (steering, correction, urgent), send `agent://<id>`. Rationale: omp IrcBridge #interrupts queue — sibling→child while streaming pushes to #interrupts; Google error amplification — directed communication contains errors via validation bottlenecks. | [primary, aggregated] F1 `src/session/irc-bridge.ts:222-224` ; https://arxiv.org/abs/2512.08296

5. **Async status / non-urgent → room.** If the message is a status update, claim, or shared finding that doesn't require immediate attention, post to room. Rationale: Zulip topics persist over hours/days for async participation; Slack "Just mentions" — notify only on @mentions, not all messages. | https://zulip.com/help/introduction-to-topics ; https://slack.com/help/articles/360056534254

6. **Coordination artifact → room.** If the content is a coordination artifact (task claim, shared finding, blackboard update), post to room. Rationale: Corkill 1991 blackboard — shared global database + event-based activation; Akashik protocol — shared memory with append-only event log. | https://dancorkill.com/pubs/ai-expert.pdf ; [primary, aggregated] F5 Akashik

7. **Steering instruction → DM.** If the content is a direct command, correction, or steering instruction for a specific agent, send `agent://<id>`. Rationale: Anthropic — subagents act as "intelligent filters" with separate context windows; TalkHier — supervisor→member directed edges carry full context. | https://anthropic.com/engineering/multi-agent-research-system ; https://arxiv.org/abs/2502.11098

8. **Error-sensitive content → DM.** If the content contains corrections or errors that could amplify if broadcast, send `agent://<id>`. Rationale: Google error amplification — independent systems propagate errors through unchecked cascades (1.0→0.3 with centralized validation); "Hallucination Snowball" — 23.7% of injected hallucinations survived to final output undetected. | https://arxiv.org/abs/2512.08296 ; https://arxiv.org/abs/2608.14588

9. **Cross-critique needed → room.** If the content benefits from cross-critique or diverse perspectives, post to room. Rationale: Li et al. EMNLP 2024 — sparse topology matches/beats fully-connected with 40% less cost; Google decentralized — best for dynamic web navigation (+9.2%). | https://aclanthology.org/2024.findings-emnlp.427.pdf ; https://arxiv.org/abs/2512.08296

10. **Token budget constrained → DM.** If broadcast would cost 15x tokens and the task is not decomposable, prefer DM. Rationale: Anthropic — 15x more tokens than regular chat; Google — ALL multi-agent variants worse on sequential planning (-39% to -70%). | https://anthropic.com/engineering/multi-agent-research-system ; https://arxiv.org/abs/2512.08296

## Searches

- `site:rfc-editor.org RFC 1459 2812 1855 IRC PRIVMSG channel`
- `ircv3.net specs extensions message-tags batch multiline labeled-response`
- `docs.slack.dev chat.postMessage thread_ts reply_broadcast conversations.replies`
- `support.discord.com threads forum channels notification settings`
- `zulip.com help introduction-to-topics mute-a-topic follow-a-topic digest-emails`
- `arxiv.org 2502.11098 TalkHier hierarchical communication multi-agent`
- `arxiv.org 2512.08296 "Towards a Science of Scaling Agent Systems" centralized decentralized`
- `anthropic.com engineering multi-agent research system hub-and-spoke`
- `Corkill 1991 blackboard systems AI Expert`
- `aclanthology.org 2024.findings-emnlp.427 sparse communication topology multi-agent debate`
- `learn.microsoft.com azure service bus queues topics subscriptions`
- `irchelp.org ircii ignore command`
- `spec.matrix.org MSC3440 threading`
- Direct fetches: rfc-editor.org RFC 1459/2812/1855 full text; ircv3.net specs index + message-tags/batch/labeled-response/multiline/account-tag/away-notify/chathistory/echo-message; docs.slack.dev chat.postMessage/conversations.replies/conversations.list/conversations.open/chat.postEphemeral/calls.add/conversations.canvases.create/Socket Mode; support.discord.com Threads/Forum/Stage FAQs + notification settings; docs.discord.com threads/channel/rate-limits/stage-instance/voice; zulip.com help introduction-to-topics/introduction-to-channels/mute-a-topic/mute-a-channel/follow-a-topic/topic-notifications/configure-unread-message-counters/inbox/digest-emails/email-notifications/direct-messages/combined-feed/resolve-a-topic/channel-permissions/reading-strategies/channel-feed + why-zulip; arxiv.org 2502.11098/2512.08296/2510.07799/2608.14588/2603.04474/2508.01531; anthropic.com/engineering/multi-agent-research-system; dancorkill.com/pubs/ai-expert.pdf; aclanthology.org/2024.findings-emnlp.427.pdf; learn.microsoft.com service-bus-queues-topics-subscriptions; irchelp.org ircii ignore; spec.matrix.org MSC3440; docs.mattermost.com threads; pubsonline.informs.org information overload; arxiv.org 1610.06497 Twitch chat overload; researchgate.net Smith CHI 2000 threaded chats; ojs.aaai.org Aragón ICWSM 2017 threaded discussion; sciencedirect.com Nelimarkka 2015 event chats

## Conflicting evidence

- **Threading effectiveness**: Smith et al. CHI 2000 found threaded chat did NOT significantly improve task performance vs standard chat in lab study; Aragón et al. ICWSM 2017 found shift to threaded discussion increased reciprocal exchanges. Nelimarkka et al. 2015 found 65% of messages in event chats belonged to topic-focused threads even without technical threading support. → Threading helps organization but not necessarily task performance; the benefit is in reduced overload, not faster completion.
- **Broadcast vs directed**: Google (arXiv 2512.08296) found centralized best for decomposable tasks (+80.8%) but decentralized best for dynamic web navigation (+9.2% vs +0.2%); ALL multi-agent variants worse on sequential planning (-39% to -70%). Anthropic found hub-and-spoke best for research (90.2% improvement) but 15x token cost. → No universal winner; topology must match task structure.
- **Sparse topology**: Li et al. EMNLP 2024 found sparse matches/beats fully-connected with 40% less cost, but "not sparser is always better" — moderately sparse (D=3/5) sometimes worse than both extremes. → Sparsity helps but requires tuning.
- **IRCv3 adoption**: IRCv3 specs are extensions, not universally adopted; many IRC clients and servers do not implement all specs. → The rich semantics (message-tags, batch, chathistory) are available but not guaranteed.

## Gaps

- Did not read RFC 2811 (Channel Management) or RFC 2813 (Server Protocol) — may contain additional channel mechanics
- Did not read IRCv3 chathistory or echo-message spec pages in full — only confirmed existence and purpose from specs index
- Did not read Zulip's internal architecture docs or source code — only first-party help docs
- Did not read Discord's full rate-limit documentation — only the developer docs overview
- Did not read Slack's full notification settings documentation — only the help articles
- Did not read the full text of arXiv 2512.08296 (Google scaling) — only the abstract and key findings
- Did not read the full text of arXiv 2502.11098 (TalkHier) — only the abstract and key findings
- Did not read the full text of Anthropic's multi-agent blog — only the public engineering post
- Did not read Corkill 1991 in full — only the AI Expert article summary
- Did not read Li et al. EMNLP 2024 in full — only the abstract and key findings
- Did not investigate Mattermost's full feature set — only confirmed threads exist
- Did not investigate Element/Matrix client implementation — only confirmed MSC3440 exists
- Did not investigate IRC bouncer or server implementation details — only client-side specs
