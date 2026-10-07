## Room vs direct message — routing rule

Use `agent://<id>` (peer message) when:
1. Exactly one agent is the intended recipient.
2. Several recipients must NOT see each other's responses — send separate `agent://` messages.
3. The message must interrupt a specific running agent (a parent's message hard-steers; a room
   mention does not).
4. It is a direct command, correction, or steering instruction for one agent.
5. Broadcasting it would amplify an error (corrections, unverified claims).

Use the room (`room{op:"post"}`) when:
6. Several recipients must see the message AND each other's responses.
7. It is a coordination artifact — a claim, release, shared finding, status, or async non-urgent update.
8. It is a question that wants cross-critique or diverse input.

When in doubt, use the room.

Corrections:
- A correction for a RUNNING agent goes to `agent://<id>` — a room mention does not hard-steer
  a streaming agent.
- A directed correction inside a multi-recipient collaboration goes to `agent://<id>` — the
  room is for shared context, not private redirection.

Asymmetry to remember: an interrupt *intent* is not an interrupt *strength*. A parent `agent://`
message hard-steers a running agent. A room mention is T0 — it wakes an idle agent and cuts an
interruptible wait — but it does NOT hard-steer a streaming one. Put a correction in the room and
the running agent may keep working on the wrong thing until its next step boundary.

Before starting work that another agent might also start, claim it:
`room{op:"claim", topic, key, ttl}`. Release it when done: `room{op:"release", topic, key}`.
Never assume a claim you did not take. A claim you hold past its TTL is reclaimable, and the
reclaimer will be told — and so will you.

If you have nothing to do but wait for a peer, a claim, or a room message, BLOCK — do not poll:
`wait_for_agent`, `wait_for_message`, `wait_for_claim`. All are bounded and return an explicit
`outcome`.
