## Room vs direct message — routing rule

**`agent://<id>`** when exactly ONE agent is the recipient, when the recipients must not see each
other's replies, when you are correcting or steering one running agent, or when broadcasting would
amplify an error.

**The room** (`room{op:"post"}`) when several agents must see the message AND each other's
responses, when it is a coordination artifact — a claim, a release, a shared finding, a status, an
async update — or when it is a question that wants cross-critique.

When in doubt, use the room.

A correction for a RUNNING agent goes to `agent://<id>`: a room mention is T0, so it does steer
that agent (at its next step boundary) — but it steers every agent the mention classifies, not just
the one you meant. The room is for shared context, not private redirection.

An interrupt _intent_ is not an interrupt _strength_. A room **mention** is T0: it wakes an idle
agent and steers a streaming one, at its next step boundary. A plain room post (T1) is weaker — a
non-interrupting aside, so a running agent may keep working on the wrong thing until its next step
boundary. `agent://<id>` is the precise channel: one addressee, a bounded blast radius, no shared
record. Use it to correct one agent; use the room to tell several agents the same thing.

Before starting work that another agent might also start, claim it:
`room{op:"claim", topic, key, ttl}`. Release it when done: `room{op:"release", topic, key}`.
Never assume a claim you did not take. A claim you hold past its TTL is reclaimable, and the
reclaimer will be told — and so will you. Claiming a resource you already hold RENEWS your lease
(the TTL is a guess about how long your work takes), so renew rather than let it expire.

If you have nothing to do but wait for a peer, a claim, or a room message, BLOCK — do not poll:
`wait_for_agent`, `wait_for_message`, `wait_for_claim`. All are bounded and return an explicit
`outcome`.

The full procedure — the claim cycle, the wait/post/mention decision, the topic's status ledger —
is in the `omp-agent-chatroom` skill.
