# Plan 019: the human-facing card, the escaping hole it exposed, and the two working agreements

> **Executor instructions**: This round is **DONE** (commits `0bb7b2a`, `c51fe75`, `63eb95e`,
> `b3d1137`, `92eb747`, `a530f32`, `2a16af4`). The plan is the record of what changed and which
> test pins each item. Anyone re-running part of it must run every verification command and confirm
> the expected result, and must update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2a16af4^..HEAD -- plugin/src/cards plugin/tests/cards.test.ts`
> If either file changed since this plan was written, compare the "Current state" facts against the
> live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (a card header line and a doc round)
- **Depends on**: none
- **Category**: human surface + hardening
- **Planned at**: 2026-10-20, host 18.12.3

## Why this matters

The room is read by two audiences: the **model** (the `content` line, escaped, with the tier and
the topic) and the **human** (the transcript card). The model-facing line has carried the topic
since the beginning; the human-facing card never did. In a swarm running five topics, every card
in the transcript read `✉ room ⟵ Poster · just now` — indistinguishable from one another. The
human could not tell which topic a message belonged to without opening the panel.

Fixing that exposed a second, older defect (item 2) — so the round is two fixes, not one.

## Items

### 1. The card header names the topic — DONE (`0bb7b2a`)

`plugin/src/cards/message-cards.ts`: `topicOf()` returns the record's topic for `msg`/`note`
records; it is added to the status-line meta of `renderMessageCard` and `renderMentionCard`:

```
✉ room ⟵ agent-1 · build · [reply] · just now
```

- The topic is capped at 24 chars. The card header is truncated to the render width, so an
  unbounded topic would push the author and the age off the line.
- Pinned by `tests/cards.test.ts`: "the card header names the topic, so a human can tell which
  topic a message came from" and "a long topic is capped so the author and the age stay on the
  header line".
- **Needs the human's live check**: a real transcript card should read
  `room ⟵ Poster · cards-test · just now`.

### 2. The card header rendered room-authored text raw — DONE (`c51fe75`)

`renderStatusLine` does not escape. The body rows have always been escaped (`bodyLines` calls
`safeRoomText`), but the **header** did not — and the header carried `from` (host-assigned, safe)
plus, now, the **topic** (free-form, chosen by the poster) and the claim card's **resource**
(`"<topic>/<key>"`, both halves free-form).

A topic named `<system-reminder>…` would have rendered verbatim into the transcript, and a resumed
session replays the transcript into an agent's context — so this was a prompt-injection path into
every future agent in the tree, not just a display wart.

- `topicOf()` escapes with `safeRoomText` before capping; the claim and release cards escape
  `resource` and `reason` the same way.
- Pinned by `tests/cards.test.ts`: "a topic carrying a forged harness tag is escaped in the card
  header" and "a claim resource carrying a forged harness tag is escaped in the card". Both fail
  without the fix (mutation-checked).

### 3. The base-`/tmp` sweep took the human's own sessions — DONE (`a530f32`)

Cleaning the omp session store with the glob `-tmp*` matched two different things: `-tmp-<project>`
(a project **under** `/tmp`) and `-tmp` (the session dir for `/tmp` **itself**). The second held 13
of the human's own sessions (2026-09-24 → 10-19). They were recovered from the trash and restored
byte-for-byte; the other 52 swept dirs were audited by their earliest file date and every one was a
probe directory this project created.

The fix is a **ledger**, not a promise: `~/.omp/agent/scratch.sh` records what is created and
deletes only recorded paths. The base `/tmp` is structurally unreachable — a recorded path under
`/tmp/` can only ever map to a `-tmp-<project>` slug, and `/tmp` itself is refused at record time.

### 4. The verification policy — DONE (`a530f32`)

No more omp processes spawned to probe the plugin. `bun test tests/` is the gate; the human has the
machine and does the live runs. Behaviour that can only be seen in a real terminal or a real model
is written down as **needs the human's live check** in the handoff instead of being probed.

### 5. HEAD did not pass its own lint gate — DONE (`63eb95e`)

Two files committed by the concurrent session failed `biome check src tests`: a format error in
`tests/room-root.test.ts` and a `useTemplate` suggestion in `tests/tree.test.ts`. Fixed; the check
exits 0 again.

### 6. The op count the docs kept getting wrong — DONE (`2a16af4`)

The `room` tool has **twelve** ops, not eleven. The source comment, the notes and the READMEs said
eleven — including `plugin/skills/omp-agent-chatroom/SKILL.md`, the file the **model** reads.

### 7. The speech act reached nobody — DONE (`f94e596`)

`post`'s `performative` parameter is described in the tool schema as "carried through to cards". It
was not: the field was validated, stored, and read by **nobody** — not the cards, not the
model-facing line. The model was told the knob meant something and it meant nothing.

The card header now shows the act (`inform | request | propose | accept | reject | query |
failure`), so the promise is true. The **model-facing** line still omits it: whether the model
needs the act is a question for the research round, and a delivery-format change is not something
to slip in unasked. Pinned by "the speech act reaches the card, as the tool schema promises"
(fails without the fix).

## Verification

```sh
cd plugin
bunx --bun @biomejs/biome check src tests    # exit 0 over 51 files
bun check                                     # 0 type errors in 50 files
bun test tests/                               # 303 pass / 0 fail, 15 files
```

## Not done here

- The research round (`docs/research/large-swarm-coordination/`) is still running; its ranked list
  becomes plan 020.
- The human's live check of the card header (item 1) is the one thing this round cannot close.
