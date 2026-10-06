# F13 Message Envelope + Addressing for Agent Chat

## Angle

How agent communication systems structure message envelopes: speech-act performatives, wire-level correlation fields, reply-expected semantics, and LLM multi-agent schemas. Goal: derive a candidate envelope for an omp room that supports reply-expected, correlation, and receipts over a shared channel. Every claim = source URL + fetch date + confidence. No code written.

## Claims

### 1. Speech-Act Theory (Philosophical Foundation)

- Austin (1962) distinguishes locutionary (meaningful utterance), illocutionary (what speaker does *in* saying it), and perlocutionary (effect on listener) acts. Performative utterances *do* something rather than describe. | https://pure.mpg.de/pubman/item/item_2271128/component/file_2271430/austin_1962_how-to-do-things-with-words.pdf | 2026-10-06 | primary
- Searle (1969) systematizes illocutionary acts with felicity conditions and propositional content rules. Chapter 3 sets out structure of illocutionary acts. | https://www.cambridge.org/core/books/speechacts/D2D7B03E472C8A390ED60B86E08640E7 | 2026-10-06 | primary

### 2. KQML (Knowledge Query and Manipulation Language)

- KQML performatives organized into 11 categories: basic informative (tell, deny, untell), database (insert, delete, update), basic responses (reply, sorry, error), basic query (evaluate, ask-if, ask-about, ask-one, ask-all), multi-response query (stream-in, stream-all), basic effector (achieve, unachieve), generator (standby, ready, next, rest, discard), capability-definition (advertise, subscribe, monitor), notification (tell, deny, untell), networking (register, unregister, forward, broadcast, route), facilitation (broker-one, broker-all, recommend-one, recommend-all, recruit-one, recruit-all). | https://research.cs.umbc.edu/kqml/kqmlspec/section3.7.html | 2026-10-06 | primary
- KQML reserved parameters: `:sender`, `:receiver`, `:reply-with`, `:in-reply-to`, `:content`, `:language`, `:ontology`, `:force`. | https://research.cs.umbc.edu/kqml/kqmlspec/section3.6.html | 2026-10-06 | primary
- KQML reply correlation: if `:reply-with` is `nil` or absent, sender does not expect reply. If `t`, sender expects reply. Otherwise, sender expects reply containing `:in-reply-to` with value identical to `:reply-with` expression. | https://research.cs.umbc.edu/kqml/kqmlspec/section3.6.html | 2026-10-06 | primary
- KQML `:force` parameter: `permanent` = sender guarantees never deny meaning; any other value = may deny in future. Default `tentative`. No FIPA-ACL equivalent. | https://research.cs.umbc.edu/kqml/kqmlspec/section3.6.html | 2026-10-06 | primary

### 3. FIPA-ACL (Foundation for Intelligent Physical Agents)

- FIPA-ACL defines 22 performatives: accept-proposal, agree, cancel, cfp, confirm, disconfirm, failure, inform, inform-if, inform-ref, not-understood, propagate, propose, proxy, query-if, query-ref, refuse, reject-proposal, request, request-when, request-whenever, subscribe. | https://github.com/amlhubs/fipa-acl/blob/feature/pm-app/README.md | 2026-10-06 | primary
- FIPA-ACL 13 envelope fields: `performative` (Symbol, only mandatory), `sender` (Agent-identifier), `receiver` (Set of Agent-identifiers), `reply-to` (Set of Agent-identifiers), `content` (Expression), `language` (Expression), `encoding` (Expression), `ontology` (Expression), `protocol` (Expression), `conversation-id` (Expression), `reply-with` (Expression), `in-reply-to` (Expression), `reply-by` (Date/time expression). | https://www.fipa.org/specs/fipa00061/ | 2026-10-06 | primary
- FIPA Request protocol: `request` → `agree` or `refuse`; if agreed, usually `inform` or `failure`. | https://www.fipa.org/specs/fipa00026/SC00026H.html | 2026-10-06 | primary
- FIPA Contract Net protocol: `cfp` → `propose` or `refuse` → `accept-proposal` or `reject-proposal` → typically `inform` or `failure`. | https://www.fipa.org/specs/fipa00029/SC00029H.html | 2026-10-06 | primary
- FIPA Subscribe protocol: `subscribe` → `agree` or `refuse`; after agreement, updates sent with `inform`. | https://www.fipa.org/specs/fipa00035/SC00035H.html | 2026-10-06 | primary
- FIPA `reply-by` field: latest time/date by which sender would like reply. Spec does NOT define automatic timeout event, mandatory failure reply, cancellation, or retransmission. Implementation/interaction-protocol decision. | https://www.fipa.org/specs/fipa00061/ | 2026-10-06 | primary

### 4. Email (RFC 5322, RFC 3834, RFC 8098)

- RFC 5322 `Message-ID`: single msg-id, globally unique, identifies particular version of particular message. Every message SHOULD have one. Syntax: `<id-left@id-right>`. | https://www.rfc-editor.org/rfc/rfc5322.html | 2026-10-06 | primary
- RFC 5322 `In-Reply-To`: 1+ msg-ids, identifies parent message(s) being replied to. For reply, normally contains parent's Message-ID. If no parent has Message-ID, omit field. | https://www.rfc-editor.org/rfc/rfc5322.html | 2026-10-06 | primary
- RFC 5322 `References`: 1+ msg-ids, records conversation's reference chain for threading. For reply: copy parent's References (if any), then append parent's Message-ID. | https://www.rfc-editor.org/rfc/rfc5322.html | 2026-10-06 | primary
- RFC 3834 `Auto-Submitted`: single occurrence per message. Values: `auto-replied` (direct response to another message), `auto-generated` (automatic but not direct reply), `no` (default when absent). Helps mail systems avoid loops. | https://www.rfc-editor.org/rfc/rfc3834.html | 2026-10-06 | primary
- RFC 8098 MDN request: `Disposition-Notification-To` requests MDN be sent to specified address(es). At most once. Only a request; recipient may ignore. | https://www.rfc-editor.org/rfc/rfc8098.html | 2026-10-06 | primary
- RFC 8098 MDN response: `Final-Recipient` (REQUIRED), `Original-Message-ID` (optional, identifies original message), `Disposition` (REQUIRED, format `<action-mode>/<sending-mode>; <disposition-type>[/<modifier>]`). Disposition types: displayed, dispatched, processed, deleted, denied. | https://www.rfc-editor.org/rfc/rfc8098.html | 2026-10-06 | primary

### 5. AMQP 0-9-1

- AMQP `reply-to` (shortstr): address (often reply queue name) where responses should be sent. Application-use property; protocol does not route replies automatically. | https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf | 2026-10-06 | primary
- AMQP `correlation-id` (shortstr): application-defined token to match reply to request. Copied unchanged by responder. | https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf | 2026-10-06 | primary
- AMQP `basic.ack`: acknowledges one or more messages previously delivered to consumer. Confirms consumer-side processing, NOT publisher acceptance. `multiple=0` ack single; `multiple=1` ack all outstanding up to and including delivery-tag. | https://github.com/rabbitmq/amqp-0.9.1-spec/blob/main/docs/amqp-0-9-1-reference.md | 2026-10-06 | primary
- AMQP `basic.nack`: negative acknowledgment; rejects one or more messages. | https://github.com/rabbitmq/amqp-0.9.1-spec/blob/main/docs/amqp-0-9-1-reference.md | 2026-10-06 | primary
- AMQP request/reply flow: requester sets `reply-to` to reply queue and unique `correlation-id`. Responder copies `correlation-id` into reply. Requester matches by `correlation-id`. | https://www.rabbitmq.com/resources/specs/amqp0-9-1.pdf | 2026-10-06 | primary

### 6. MQTT v5

- MQTT v5 `Response Topic` (property ID `0x08`, UTF-8 string): topic name where requester wants reply published. Must be valid UTF-8 Topic Name, must NOT contain wildcards. Presence marks PUBLISH as request. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary
- MQTT v5 `Correlation Data` (property ID `0x09`, binary data): opaque data for matching reply to request. Responder copies it unchanged. Optional. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary
- MQTT v5 request/response flow: requester subscribes to reply topic, publishes request with Response Topic + optional Correlation Data. Responder publishes reply to Response Topic, copying Correlation Data if present. Response does NOT include Response Topic property. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary
- MQTT v5 §4.10.1 (Request/Response) is explicitly non-normative. No deadline or required behavior when reply never arrives. Requester starts own timer; on expiry, decides what to do. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary
- MQTT v5 PUBACK (QoS 1, packet type `0x40`): acknowledges QoS 1 PUBLISH. Packet Identifier must match. Reason Code `0x00` = Success. Transport-level, NOT application-level read receipt. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary
- MQTT v5 PUBCOMP (QoS 2, packet type `0x70`): final response to PUBREL in QoS 2 exchange. Packet Identifier must match. Reason Code `0x00` = Success. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06 | primary

### 7. NATS

- NATS request-reply: requester creates temporary inbox subject `_INBOX.<unique-token>`, subscribes before publishing. Reply subject included in PUB protocol message; responder publishes response to this subject. | https://docs.nats.io/learn/core-nats/ | 2026-10-06 | primary

### 8. XMPP

- XEP-0184 Message Delivery Receipts: request = `<request xmlns='urn:xmpp:receipts'/>` element. Receipt = `<received xmlns='urn:xmpp:receipts' id='original-message-id'/>` echoes original message's `id` attribute. Signals delivery to client, NOT that human read/understood. Sender MUST put `id` on any message for which it requests receipt. Not recommended for groupchat. | https://xmpp.org/extensions/xep-0184.html | 2026-10-06 | primary
- XEP-0201 Best Practices for Message Threads: `<thread>thread-id</thread>` groups related messages. Recommended for `chat` and `groupchat` messages. Replies should reuse existing thread ID; new conversations get new one. Not a unique per-message ID. | https://xmpp.org/extensions/xep-0201.html | 2026-10-06 | primary
- XEP-0359 Unique and Stable Stanza IDs: `<origin-id id='...'/>` = originating client's ID. `<stanza-id id='...' by='entity'/>` = ID assigned by entity (account, MUC room). `by` attribute identifies assigning entity; `id` alone is not globally unique. Stable identification and deduplication. Currently Experimental status. | https://xmpp.org/extensions/xep-0359.html | 2026-10-06 | primary

### 9. Matrix

- Matrix `event_id` (`$localpart:server`): top-level event identifier, assigned when sent. | https://spec.matrix.org/v1.5/client-server-api/ | 2026-10-06 | primary
- Matrix threading: `m.relates_to.rel_type` = `"m.thread"` indicates threaded reply. `m.relates_to.event_id` = thread root event ID. `m.relates_to.m.in_reply_to.event_id` = specific event being replied to. | https://spec.matrix.org/v1.5/client-server-api/ | 2026-10-06 | primary
- Matrix read receipts: `POST /_matrix/client/v3/rooms/{roomId}/receipt/m.read/{eventId}`. `thread_id` in request body scopes receipt to a thread (`"main"` for main timeline). Receipt updates arrive as `m.receipt` ephemeral events in `/sync`. Content maps event ID to receipt type, user ID, and `ts` timestamp (milliseconds since Unix epoch). | https://spec.matrix.org/v1.7/client-server-api/ | 2026-10-06 | primary
- Matrix `m.fully_read` (private read marker), `m.read.private` (non-broadcasting receipt). | https://spec.matrix.org/v1.7/client-server-api/ | 2026-10-06 | primary

### 10. IRCv3

- IRCv3 message tags: `@tag1=value1;tag2=value2` prefix on IRC messages. Tags are key-value pairs; values are optional. | https://ircv3.net/specs/extensions/message-tags | 2026-10-06 | primary
- IRCv3 labeled-response: `label` tag = client-chosen request/response correlation ID. Client attaches to command; server repeats on corresponding response. Value is opaque, max 64 bytes. Capability negotiation required (depends on `batch`). For multi-message replies, groups in `BATCH` with label on batch opening command. No-reply commands: server sends labeled `ACK` with no parameters. | https://ircv3.github.io/specs/extensions/labeled-response.html | 2026-10-06 | primary
- IRCv3 message IDs: `msgid` tag = server-supplied identifier for a message/event. Should be attached to all `PRIVMSG` and `NOTICE` events when used. Distinction: `label` correlates command↔response; `msgid` identifies a message. NOT interchangeable. | https://ircv3.net/specs/extensions/message-ids | 2026-10-06 | primary

### 11. Slack

- Slack `thread_ts` (string): the `ts` of the parent message being replied to. Use parent's timestamp even when replying to a reply. Omit for top-level message. | https://api.slack.com/methods/chat.postMessage | 2026-10-06 | primary
- Slack `reply_broadcast` (boolean): used with `thread_ts`. `true` makes thread reply visible in main channel. Defaults to `false`. | https://api.slack.com/methods/chat.postMessage | 2026-10-06 | primary
- Slack `client_msg_id` (string): client-generated message identifier (typically UUID). Used for duplicate-message detection. NOT the thread ID or Slack's message timestamp. | https://api.slack.com/methods/chat.postMessage | 2026-10-06 | primary

### 12. Discord

- Discord `message_reference` object: `message_id` (snowflake string) = referenced message's snowflake ID. `channel_id` (snowflake string) = channel containing referenced message. `guild_id` (snowflake string) = guild containing referenced message. `type` (integer) = `0` (DEFAULT, typically reply) or `1` (FORWARD). `fail_if_not_exists` (boolean) = `true` (default) fails if referenced message not found; `false` sends without reply reference. | https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx | 2026-10-06 | primary
- Discord snowflake IDs: 64-bit integers. Should be handled as strings in JSON to avoid precision loss. | https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx | 2026-10-06 | primary

### 13. ROS 2

- ROS 2 services: client-side timeout on `wait_for_response()`. Service protocol does NOT define server-enforced deadline that automatically stops server's work. | https://design.ros2.org/articles/actions.html | 2026-10-06 | primary
- ROS 2 actions: three services (send-goal, cancel-goal, get-result) + two topics (status, feedback). Feedback published by server on feedback topic; server chooses publish frequency. | https://design.ros2.org/articles/actions.html | 2026-10-06 | primary
- ROS 2 action goal deadlines: action definition does NOT include standard goal-execution deadline field. Application must define and enforce one (e.g., include deadline in goal message as absolute ROS-time timestamp or duration; server checks while executing and aborts if expired). | https://design.ros2.org/articles/actions.html | 2026-10-06 | primary

### 14. LLM Multi-Agent Structured Envelopes

#### TalkHier (arXiv 2502.11098)

- TalkHier message schema = 3-field tuple: `M` (Message: instructions/clarifications from agent v_i to v_j), `B` (Background: task context for coherence), `I` (Intermediate output: sending agent's output for traceability). | https://arxiv.org/abs/2502.11098 | 2026-10-06 | primary
- Interaction context: sender v_i, recipient v_j, communication edge e_ij, time step t. Supervisor prompt output keys: `messages`, `background`, `intermediate_output`. | https://arxiv.org/abs/2502.11098 | 2026-10-06 | primary
- Hierarchy: messages flow along tree edges. Supervisor coordinates subordinates. | https://arxiv.org/abs/2502.11098 | 2026-10-06 | primary

#### AgentPrune (arXiv 2410.02506)

- AgentPrune has NO fixed message schema. Treats communication as message-passing graph: agents = nodes, messages = directed edges across rounds. Learns graph mask to prune less useful links (spatial: who communicates; temporal: when). | https://arxiv.org/abs/2410.02506 | 2026-10-06 | primary
- Integrates with AutoGen round-robin group chat and GPTSwarm edge-optimized mode. Message fields come from underlying framework, not defined by AgentPrune itself. | https://arxiv.org/abs/2410.02506 | 2026-10-06 | primary

#### MetaGPT (arXiv 2308.00352)

- MetaGPT message fields: `content` (string, human-readable text), `instruct_content` (structured Pydantic model, machine-readable typed payload), `role` (string, LLM role user/assistant, distinct from agent identity), `cause_by` (string, action that produced message), `sent_from` (string, sending agent/address), `send_to` (string, recipient address(es) for routing/broadcast), `id` (string, message identity), `metadata` (object, additional context). | https://arxiv.org/abs/2308.00352 | 2026-10-06 | primary
- SOP mechanism: SOPs define workflow (which role acts next, what artifact to produce). Messages carry outputs and routing metadata. Agents publish to shared pool; each role selects relevant messages. | https://arxiv.org/abs/2308.00352 | 2026-10-06 | primary

#### AutoGen (Official Docs)

- BaseChatMessage fields: `source` (string, required), `id` (string, optional), `models_usage` (RequestUsage | null, optional), `metadata` (dict[str,str], optional, default {}), `created_at` (datetime | null, optional). | https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.messages.html | 2026-10-06 | primary
- ChatMessage discriminated union (discriminator: `type`): TextMessage (`content: string`), MultiModalMessage (`content: list[string | Image]`), StopMessage (`content: string`), ToolCallSummaryMessage (`content: string`, `tool_calls: list[FunctionCall]`, `results: list[FunctionExecutionResult]`), HandoffMessage (`content: string`, `target: string`, `context: list[model messages]`). | https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.messages.html | 2026-10-06 | primary
- StructuredMessage (not in union): `content: <Pydantic.BaseModel>`, `format_string: string | null`. | https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.messages.html | 2026-10-06 | primary
- AgentEvent union (separate from chat): ToolCallRequestEvent, ToolCallExecutionEvent, MemoryQueryEvent, UserInputRequestedEvent, ModelClientStreamingChunkEvent, ThoughtEvent, SelectSpeakerEvent, CodeGenerationEvent, CodeExecutionEvent. | https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.messages.html | 2026-10-06 | primary

#### Google A2A (v1.0.1)

- Part schema (smallest content unit): `text` (string), `raw` (bytes, base64 in JSON), `url` (string), `data` (JSON value), `metadata` (object, optional), `filename` (string, optional), `mediaType` (string MIME, optional). Constraint: exactly one of `text`, `raw`, `url`, `data` must be present. | https://a2a-protocol.org/v1.0.1/specification/ | 2026-10-06 | primary
- Message: `role` ("user" | "agent") + `parts: list[Part]`. | https://a2a-protocol.org/v1.0.1/specification/ | 2026-10-06 | primary
- Task lifecycle: states = TASK_STATE_SUBMITTED, TASK_STATE_WORKING, TASK_STATE_COMPLETED, TASK_STATE_FAILED, TASK_STATE_CANCELED, TASK_STATE_REJECTED. Tasks are stateful, progress through defined lifecycle. Streaming via TaskStatusUpdateEvent and TaskArtifactUpdateEvent. | https://a2a-protocol.org/v1.0.1/specification/ | 2026-10-06 | primary

#### JADE (FIPA-ACL in Practice)

- JADE ACLMessage FIPA slots: `performative` (int, FIPA constant: REQUEST, INFORM, AGREE, etc.), `sender` (AID), `receiver` (AID, multiple), `reply-to` (AID, multiple), `content` (String), `language` (String), `encoding` (String), `ontology` (String), `protocol` (String), `conversation-id` (String), `reply-with` (String), `in-reply-to` (String), `reply-by` (Date). | https://jade-project.gitlab.io/API/jade/lang/acl/ACLMessage.html | 2026-10-06 | primary
- Also supports: user-defined parameters, byte-sequence content, attached Envelope, post-timestamp. Compliant with FIPA 2000 ACL Message Structure Specification (fipa000061). | https://jade-project.gitlab.io/API/jade/lang/acl/ACLMessage.html | 2026-10-06 | primary

## Searches

- "FIPA-ACL specification performative list envelope fields"
- "KQML specification performative parameters reply-with in-reply-to"
- "Austin How to Do Things with Words speech act theory"
- "Searle Speech Acts illocutionary acts"
- "RFC 5322 Message-ID In-Reply-To References"
- "RFC 3834 Auto-Submitted auto-replied"
- "RFC 8098 MDN Message Disposition Notification"
- "AMQP 0-9-1 reply-to correlation-id basic.ack"
- "MQTT v5 Response Topic Correlation Data request response"
- "NATS request-reply inbox subject"
- "XMPP XEP-0184 delivery receipts XEP-0201 threads XEP-0359 stanza-id"
- "Matrix event_id m.relates_to m.thread m.read receipts"
- "IRCv3 message tags labeled-response msgid"
- "Slack thread_ts client_msg_id reply_broadcast"
- "Discord message_reference snowflake"
- "ROS 2 service action feedback goal deadline"
- "TalkHier arXiv 2502.11098 structured message schema"
- "MetaGPT arXiv 2308.00352 structured output SOP"
- "AutoGen actor model AgentId TopicId GroupChat"
- "Google A2A message part schema"
- "JADE SPADE FIPA-ACL ACLMessage"
- "AgentPrune arXiv 2410.02506 communication graph pruning"
- "AutoGen BaseChatMessage discriminated union message types"
- "Google A2A v1.0.1 specification Part Message Task lifecycle"
- "JADE ACLMessage FIPA-ACL slots performative sender receiver"

## Conflicting evidence

- FIPA-ACL `reply-by` field: spec defines the field but does NOT specify automatic timeout behavior, mandatory failure reply, or retransmission. Different implementations may handle no-reply differently. | https://www.fipa.org/specs/fipa00061/ | 2026-10-06
- MQTT v5 §4.10.1 (Request/Response) is explicitly non-normative. No spec-defined RPC timeout. Implementations must define their own timeout behavior. | https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html | 2026-10-06
- XMPP XEP-0184: signals delivery to client, NOT that human read/understood. Not guaranteed delivery. Not recommended for groupchat. | https://xmpp.org/extensions/xep-0184.html | 2026-10-06
- XMPP XEP-0359: currently Experimental status. `id` alone is not globally unique; `by` attribute needed. | https://xmpp.org/extensions/xep-0359.html | 2026-10-06
- IRCv3: `label` correlates command↔response; `msgid` identifies a message. NOT interchangeable. Different purposes. | https://ircv3.net/specs/extensions/message-ids | 2026-10-06
- KQML `:force` parameter (permanent/tentative) has no direct FIPA-ACL equivalent. FIPA-ACL dropped this commitment-level distinction. | https://research.cs.umbc.edu/kqml/kqmlspec/section3.6.html | 2026-10-06
- ROS 2: action definition does NOT include standard goal-execution deadline field. Application must define and enforce one. | https://design.ros2.org/articles/actions.html | 2026-10-06

## Gaps

- LLM multi-agent frameworks (TalkHier, MetaGPT, AutoGen, Google A2A, JADE/SPADE) use heterogeneous message schemas. No standard envelope. Each framework has its own field names and semantics. Cross-framework interoperability requires mapping layer.
- No protocol provides exactly-once semantics. All are at-least-once with application-level dedup.
- Most protocols do not define server-enforced RPC timeouts. Client-side timeout is the common pattern.
- XMPP XEP-0184 not recommended for groupchat. Alternative receipt mechanism needed for room-based systems.
- IRCv3 labeled-response requires `batch` capability. Not all servers/clients support it.
- Matrix read receipts are server-initiated tracking, not sender-requested. Different model from MDN/XEP-0184.
- No protocol provides a first-class "claim" (reserve a task/item) primitive. Nearest equivalents: FIPA-ACL `cfp`/`propose`/`accept-proposal` (Contract Net), AutoGen `RequestToSpeak`.

## Candidate room envelope

### Field list

| Field | Type | Required | Description | Justification |
|---|---|---|---|---|
| `id` | string (UUID) | yes | Unique message identifier | RFC 5322 `Message-ID`, FIPA-ACL `reply-with`, XMPP `stanza-id`, Matrix `event_id`, IRCv3 `msgid`, Slack `client_msg_id`, Discord snowflake |
| `sender` | string (agent ID) | yes | Agent that sent the message | FIPA-ACL `sender`, KQML `:sender`, all protocols |
| `room` | string (room ID) | yes | Room/channel identifier | omp room context; IRCv3 channel, Matrix room_id, Slack channel, Discord channel_id |
| `to` | string (agent ID) or `"*"` | yes | Intended recipient(s); `"*"` = broadcast to all room members | FIPA-ACL `receiver` (Set), KQML `:receiver`, AMQP `reply-to`, MQTT `Response Topic` |
| `content` | string or object | yes | Message payload | FIPA-ACL `content`, KQML `:content`, all protocols |
| `performative` | string | yes | Speech-act type: `inform`, `request`, `agree`, `refuse`, `cfp`, `propose`, `accept-proposal`, `reject-proposal`, `subscribe`, `cancel`, `confirm`, `disconfirm`, `failure`, `not-understood`, `query-if`, `query-ref` | FIPA-ACL 22 performatives, KQML 30+ performatives |
| `reply-to` | string (message ID) | no | Message ID this message replies to (parent) | RFC 5322 `In-Reply-To`, FIPA-ACL `in-reply-to`, KQML `:in-reply-to`, XMPP `m.in_reply_to`, Matrix `m.relates_to.m.in_reply_to.event_id`, Slack `thread_ts`, Discord `message_reference.message_id` |
| `thread-root` | string (message ID) | no | Thread root message ID for threading | RFC 5322 `References`, XMPP `<thread>`, Matrix `m.relates_to.event_id` (m.thread) |
| `reply-with` | string (message ID) | no | Identifier sender assigns for response correlation | FIPA-ACL `reply-with`, KQML `:reply-with`, AMQP `correlation-id`, MQTT `Correlation Data`, IRCv3 `label` |
| `reply-by` | ISO 8601 datetime | no | Latest time by which sender would like reply | FIPA-ACL `reply-by` |
| `protocol` | string | no | Interaction protocol: `request`, `contract-net`, `subscribe`, `none` | FIPA-ACL `protocol` |
| `conversation-id` | string | no | Identifier for ongoing conversation | FIPA-ACL `conversation-id` |
| `language` | string | no | Content-language identifier (e.g., `en`, `fipa-sl`) | FIPA-ACL `language`, KQML `:language` |
| `ontology` | string | no | Ontology used to interpret content | FIPA-ACL `ontology`, KQML `:ontology` |
| `receipts` | array of objects | no | Read/delivery receipts: `[{type: "delivered"|"read", by: agent_id, at: timestamp}]` | RFC 8098 MDN, XMPP XEP-0184 `<received/>`, Matrix `m.read` receipts |
| `in-reply-to` | string (message ID) | no | Identifier of earlier message this message answers (echo of `reply-with`) | FIPA-ACL `in-reply-to`, KQML `:in-reply-to` |

### Reply-expected mechanics over shared channel

1. **Sender marks reply wanted**: set `reply-with` to unique ID, set `reply-by` to deadline, set `performative` to `request` (or other reply-expecting performative). `to` = target agent ID or `"*"`.

2. **Responder signals receipt**: send `inform` or `agree`/`refuse` message with `in-reply-to` = original `reply-with`. For read receipts, add to `receipts` array: `{type: "read", by: responder_id, at: timestamp}`.

3. **No reply by deadline**: sender's local timer expires. Sender may: (a) retry with new `reply-with`, (b) escalate to room broadcast (`to: "*"`), (c) mark conversation as failed. No server-enforced timeout (consistent with FIPA-ACL, MQTT v5, AMQP patterns).

4. **Multiple responders**: over shared channel (`to: "*"`), any agent may reply. Each reply has same `reply-to` (original message ID) but different `sender`. Sender collects all replies. No lock on who replies first (consistent with FIPA-ACL Contract Net: multiple `propose` responses to one `cfp`).

5. **Threading**: `thread-root` groups related messages. Replies inherit `thread-root` from parent. `reply-to` links specific parent. Both needed: `thread-root` for conversation context, `reply-to` for direct response chain.

### Mapping to omp room store record shape

```
{
  id: string (UUID),
  sender: string (agent ID),
  room: string (room ID),
  to: string (agent ID | "*"),
  content: string | object,
  performative: string,
  reply_to: string | null,
  thread_root: string | null,
  reply_with: string | null,
  reply_by: string | null (ISO 8601),
  protocol: string | null,
  conversation_id: string | null,
  language: string | null,
  ontology: string | null,
  receipts: Array<{type: string, by: string, at: string}>,
  in_reply_to: string | null,
  created_at: string (ISO 8601)
}
```

- `id`: primary key, globally unique
- `sender`, `room`, `to`, `content`, `performative`: required for all messages
- `reply_to`, `thread_root`, `reply_with`, `reply_by`, `protocol`, `conversation_id`, `language`, `ontology`, `receipts`, `in_reply_to`: optional, used when message is part of interaction protocol
- `created_at`: server-assigned timestamp for ordering
- `receipts`: appended by room members as they read/process message; supports both delivery and read receipts
