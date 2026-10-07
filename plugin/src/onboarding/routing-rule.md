## Room vs direct message — routing rule

Use `agent://<id>` (peer message) when:
1. Exactly one agent is the intended recipient.
… (rules 1-5)

Use the room (`room{op:"post"}`) when:
6. Several recipients must see the message AND each other's responses.
… (rules 6-8)

When in doubt, use the room.

Corrections: …
Asymmetry to remember: …
Before starting work that another agent might also start, claim it: …
If you have nothing to do but wait for a peer, a claim, or a room message, BLOCK — do not poll: …
