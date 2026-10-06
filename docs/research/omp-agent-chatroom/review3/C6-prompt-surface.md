# C6 — prompt-surface audit (round 3)

Lens: **what the model actually reads.** Every string the plugin puts in front of the model:
the join digest, the routing rule, the four tool descriptions, the op cheat-sheet, the injected
aside/steer content, and the card text.

Evidence base: installed omp 18.6.1 under
`/home/yuzu/.bun/install/global/node_modules/@oh-my-pi/{pi-coding-agent,pi-agent-core,pi-tui,pi-utils,omptype}/src`.
Token counts computed with `tiktoken` `cl100k_base` (BPE, the conservative estimator for the
Claude/GPT families omp drives) against the **verbatim** plan text; omp's own estimator
(`memories/index.ts:1248`, `truncateByApproxTokens`, 4 chars/token) is reported alongside.

Result: **2 critical, 5 major, 5 minor.**

---

## 1. Digest budget arithmetic — the cap is unsatisfiable at any useful fidelity

**Plan lines, verbatim (`PLAN-build.md:955-963`):**
> Hard cap: **800 tokens** for the digest (native anchors: `memory.summaryInjectionTokenLimit = 5000`
> and the 32-peer roster cap `[R2 §D]`).
>
> **Digest truncation order** (U8): if the digest exceeds the budget, truncate in this order:
> 1. Cold-tree backlog (drop oldest nodes first)
> 2. Raw-tail backlog (drop oldest records first)
> 3. Open claims (drop lowest-TTL first)
> 4. Roster (drop idle agents first)
> Never truncate the routing rule block or the cursor/lag line.

**Content list, verbatim (`:945-953`):** 1 room identity · 2 roster cap 32 · 3 claims top 10 ·
4 raw tail (last R=50) + cold tree at B=96 lines · 5 cursor + lag · 6 the routing rule block ·
7 config.

### 1.1 Measured count

Every non-verbatim item is rendered at its *leanest defensible* form (one short line per roster
row, one short line per claim, one short line per record); the routing rule and cheat-sheet are
the plan's own verbatim text.

| # | Item | Lean tok | Rich tok |
|---|---|---|---|
| 1 | room identity | 12 | 12 |
| 2 | roster, cap 32 | 191 | 543 |
| 3 | open claims, top 10 | 179 | 199 |
| 4a | raw tail, R=50 | 599 | 799 |
| 4b | cold tree, 96 lines | 1055 | 1439 |
| 5 | cursor + lag | 9 | 9 |
| 6 | routing rule (§8 verbatim) | 471 | 471 |
| 7 | config caps | 38 | 38 |
| — | op cheat-sheet (§5.4 verbatim) | 135 | 135 |
| | **TOTAL** | **2689** | **3645** |
| | vs budget 800 | **3.36x** | **4.56x** |
| | omp's 4-chars/token estimator | 1964 | 3296 |

**Actual token count of the digest as specified: ~2,700 tokens (lean) to ~3,650 tokens (rich),
against a stated hard cap of 800.** At omp's own estimator it is still ~1,964 — 2.5x the cap.

### 1.2 The truncation order cannot rescue it

Applying the plan's order to the lean rendering:

```
2689  start
-1055  drop cold tree          -> 1634
- 599  drop raw tail           -> 1035
- 179  drop claims             ->  856
- 191  drop roster             ->  665   <= fits, only now
```

The untruncatable floor is **665 tokens**:

```
routing rule 471 + cheat-sheet 135 + config 38 + identity 12 + cursor 9 = 665
```

So the cap is met **only after 100% of the four truncatable regions are deleted**. The surviving
"digest" is routing rule + cheat-sheet + config + one identity line + one cursor line — i.e. zero
roster, zero claims, zero backlog. The cap and the content list are mutually unsatisfiable at any
useful fidelity: 76% of the budget (471 + 135 = 606) is static boilerplate that the plan forbids
truncating, leaving **135 tokens** for up to 32 roster rows + 10 claims + 50 raw records + 96 tree
lines.

### 1.3 The plan does not say whether the routing rule is inside the cap

- `:952` — "6. The routing rule block (§8)." -> inside the digest, counted against 800.
- `:1308-1309` — "Shipped as `src/onboarding/routing-rule.md`, ... **appended by the
  `before_agent_start` hook after the digest**." -> outside the digest.

Both cannot hold. If it is outside, the cap covers only items 1-5+7 (2,218 lean) and the routing
rule adds an unbudgeted 471 on top of the per-turn prompt.

### 1.4 Truncation order is also self-defeating at the top of the list

Item 4's whole purpose is the "bounded backlog" for late joiners, and item 2 exists to mirror the
native roster. The order deletes the cold tree first — the only mechanism (§1.1 deliverable 11,
the entire cold-tree feature) that justifies P1b's ~400 lines and a background job. Under the
plan's own numbers the tree is dropped from the digest before any raw record is.

**Fix (pick one):**
1. Re-derive the budget: state the cap as **2,000 tokens** and say it covers items 1-7 *including*
   the routing rule; then the lean rendering still does not fit (2,689) — so also:
2. Split the routing rule out of the digest entirely (it is static; append it once) and cap the
   dynamic digest at 800; and
3. Re-derive the truncation order to drop the **cheat-sheet** and **config** first (both are
   static and belong in the tool description, not the per-turn digest), then roster, then claims,
   then backlog. As written the order protects the wrong things.

---

## 2. Routing rule — executability, five concrete messages

Read `:1312-1347` as a literal instruction set. New cases (round 1's five were: clause 10
unexecutable; 1/6 conflict; 3/5 conflict; 7/8 overlap; 8/9 non-discriminating — the plan deleted
clause 10, merged 7/8, and added the corrections block; those fixes hold).

| # | Message | Plan's answer | Why it is wrong/ambiguous |
|---|---|---|---|
| 1 | Parent -> one running child: "stop, the schema is wrong, use `z.array`" | clause 3 + Corrections => `agent://` | **Correct** — but only if the model knows the *call*, see case 3. |
| 2 | Agent A -> agents B, C, D: "I'm taking `src/auth.ts`" | clause 7 => room `post` | **Wrong as written.** `:1322` gives `room{op:"post"}` with no args; the claim path (`:1340-1341`) is the correct one for a *resource*, and A must also `claim` or the routing rule's own "Never assume a claim you did not take" (`:1342`) is violated. Two clauses answer the same message differently. |
| 3 | Any of the above | `agent://<id>` | **Not executable.** `:1314` says "Use `agent://<id>` (peer message)". `agent://` is an **internal URL**, and the callable instruction in this host is `write` with `path: "agent://<id>"` (`subagent-system-prompt.md:29`; Internal URLs: "`agent://<id>`: output (status + progress while unpublished); write = message"). The string `write` appears **nowhere** in `:1312-1347` (grep: 0 hits). A model that reads "Use `agent://<id>`" has no tool to call. |
| 4 | Agent posts a finding that two peers must not see each other's responses to | clause 2 => "send separate `agent://` messages" | **Ambiguous.** "Separate messages" means N tool calls; the routing rule does not say whether the peer replies go back to A or to each other, and clause 2's stated goal ("must NOT see each other's responses") is defeated the moment A relays both replies into the room under clause 6. No tie-break. |
| 5 | Agent has a room post that *is* a correction, unaddressed, on a topic a running peer follows | Corrections => "goes to `agent://<id>`" | **Ambiguous.** The Corrections block keys on "for a RUNNING agent" and "inside a multi-recipient collaboration" — this message is both (it is a correction, and it is multi-recipient). First-match-wins cannot resolve it because both bullets are in the same section, not the numbered list. |

Two structural defects behind cases 3-5:
- **No `mention` guidance.** The word "mention" appears in `:1312-1347` only in *negative* clauses
  (`:1317-1318`, `:1330-1331`, `:1335-1337` — "a room mention does not hard-steer"). The T0 tier
  (`:824`), the injection-cap summary line (`:879`, "M mention you"), and the whole
  `wait_for_message{mention:true}` path (`:765`) all depend on the model passing
  `mention: [...]` to `post` — which the routing rule never tells it to do, and which the schema
  (`:660`) cannot be guessed.
- **The Corrections block is not in the ordered list.** `:1309` says "Ordered — **first match
  wins**"; the numbered clauses 1-8 are ordered, the Corrections bullets are not, and they
  override clauses 4/7 without a precedence rule.

**Fix:** replace `agent://<id>` with `` `write` (`path: "agent://<id>"`, `content: "..."`) ``;
add a `post` example carrying `mention`; fold the Corrections bullets into the numbered list as
clauses 3a/3b so first-match-wins is total.

---

## 3. Tool descriptions — quoted, and mostly absent

§4.0 is the only place a `description` appears:

> `PLAN-build.md:627` — `description: ROOM_DESCRIPTION,                   // §8 routing rule + op docs`

**`ROOM_DESCRIPTION` is never defined.** grep for the identifier: **1 hit** (line 627, the
reference). There is no `const ROOM_DESCRIPTION`, no template file, no §8 pointer beyond the
comment. The wait tools have **no `description` at all** — §4.2 (`:739-758`), §4.3
(`:760-777`), §4.4 (`:779-815`) give `z.object({...})` blocks, prose bullets, and result shapes,
but the string `description` does not appear in any of them (grep for `description:` outside
`package.json`: 2 hits — line 627 and the slash-command description at `:996`).

So of the four tools the plan ships (`:612`), **zero have a model-facing description.**

### 3.1 Can a model distinguish the three wait tools from descriptions alone?

It cannot, because there are none. From the names alone:

- `wait_for_agent` — plausible reading: "wait until *I* am needed" (i.e. block until someone
  messages me), which is what `wait_for_message` does. The plan's own §4.2 notes the ambiguity and
  pushes it onto the caller: `:754` — "**To wait on any agent**, the caller enumerates
  `AgentRegistry.global().list().map(r => r.id)` explicitly." A model that cannot enumerate ids
  (no `board` call yet) will omit the required `agents` array and get a schema error.
- `wait_for_message` — indistinguishable from `wait_for_agent` without a description.
- `wait_for_claim` — the only one whose name is self-describing.

### 3.2 The native `wait` description actively forbids two of them

**Verbatim, `pi-coding-agent/src/prompts/tools/wait.md:3`:**
> `Nothing you started running? Errors; NEVER wait on other agents.`

and `:1` — "Wait only when blocked with nothing else to do." This text is in the model's tool list
**every turn**, unconditionally (`tools/wait.ts:53`, `loadMode = "essential"`). The plugin adds
`wait_for_agent` and `wait_for_claim`, which do exactly what the native text forbids, and the plan
supplies no counter-description. The §8 routing rule's last paragraph (`:1345-1347`, "BLOCK — do
not poll: `wait_for_agent`, `wait_for_message`, `wait_for_claim`") is the only counter-text, and
it is 471 tokens away from the tool list, in the digest.

**Fix:** define `ROOM_DESCRIPTION` verbatim in the plan; give each wait tool a one-line description
that names its distinct intent and explicitly carves out the native prohibition
("`wait_for_agent`: block until a named peer leaves `running`. This is not the native `wait` — the
peer owes no message; enumerate ids from `room{op:"board"}`."). If the description is to carry the
routing rule, do not also append it to the prompt (§5.3 below).

---

## 4. Op cheat-sheet — units, required params, and one capability that does not exist

§5.4:965-977 lists 11 rows covering all 12 ops. Completeness against §4.1:658-671 (12 ops) is
**correct**. Consistency is not.

1. **`mute`/`unmute` promises a capability the schema cannot express.**
   `:975` — "| `mute`/`unmute` | Suppress a topic or agent |". The `room` schema has exactly one
   mute parameter: `:683` — "| `mute`/`unmute` | `topic?` (omit = whole room) | per-agent mute set
   | `{ ok }` |", and `:658-671` contains `topic: z.string().optional()` and **no agent field**.
   §5.2:899 reinforces the promise ("per-agent mute over topics and agents plus a whole-room
   mute"). A model told it can mute an agent will call `room{op:"mute", topic:"agent-3"}`, which
   mutes the *topic* named `agent-3`. Silent wrong behaviour.
2. **No units anywhere.** `ttl`, `since`, `lo`, `hi`, `limit`, `timeout` are all `z.number()` with
   the unit in a `//` comment (`:663` "claim — lease ms", `:766` "ms; default 30000, max 1800000").
   Round 1's P1 standardised the *plan* on ms; the model still cannot see it.
3. **No required params.** `:666` marks `lo`/`hi` "zoom — first seq in node (exclusive range)" and
   §4.1's table (`:685`) says zoom requires `lo`, `hi`, but the cheat-sheet's `zoom` row (`:976`)
   says only "Descend into a tree node". Same for `claim` (needs `topic` **and** `key`), `release`,
   `recall` (needs `pattern`), `post` (needs `topic` and `body`).
4. **`join` is described as an op the agent must call first**, `:967` — "First call — mints a
   cursor at `logEnd-50`" — but `join`'s only documented caller is the digest path itself
   (`:676`, "register membership, mint a cursor at `logEnd-50` | digest (§5.4) + `cursor`") and
   §5.4 has no "call join" instruction. A model reading "First call" will issue
   `room{op:"join"}` at the start of every turn.
5. **`tree`'s row omits the one thing that makes it usable.** `:976` — "See the cold-tree tiling";
   §4.1's `tree` row (`:684`) returns `[{lo, hi, size, raw, summary?}]` and the `raw` semantics
   (`:708-711`) say the raw tail is *not* in the tree. A model that calls `tree` and reads
   `raw:true` blocks has no way to learn it must `zoom` for a summary.

**Fix:** put the unit and the required args into the cheat-sheet row (`claim topic,key[,ttl ms]`),
and either add an `agent?` field to the mute schema or narrow the text to "Suppress a topic (or the
whole room)". Everything in this table is model-facing prose — it must not describe an API the
schema rejects.

---

## 5. Injection cost — the cap is not visible, and the digest is per-turn

### 5.1 The caps are not in the digest

`:953` — "7. Config — the active caps so the agent knows the budget." This is the *only* promise
that the model learns its own injection budget, and it is a section *label*: no format, no field
list, no unit. The numbers live in §5.2's table (`:863-877`) and in `package.json`
(`:243-252`), neither of which the model reads.

The one model-visible cap is the injection-cap tail, `:878-879`:
> `+N more room messages (M mention you) — read with room{op:"read", since:<cursor>}`

— a fixed string with `N`/`M` interpolated. It reports *what was dropped*, never the cap that
dropped it.

### 5.2 There is no aggregate per-turn budget

§5.2 caps T1 at K=10 messages / B=2048 tokens per turn (`:863-864`) and T0 at a 1-pending bound
plus a 50-interrupt coalescing ceiling (`:876`, `:887-892`). Nothing sums them. The digest (§5.4,
up to 800 by its own cap — 2,689 as specified, §1 above) plus T0 interrupts plus T1 (2,048) plus
the four tool descriptions is the real per-turn room cost, and the plan never states it. The
"oversized message" rule (`:881-884`) bounds a *single* message at B=2048 but says nothing about
the batch.

### 5.3 The digest is re-injected per turn, not once at join

§5.4 calls it the "**Join** digest" (`:938`) and its content list starts with "uptime"
(`:946`) — both implying a one-shot. But §9 P4's acceptance is the opposite:

> `:1402` — "the hook is idempotent per agent (a second `before_agent_start` for the same agent
> does not duplicate)"

`before_agent_start` is not a join event. Verified:
`agent-session.ts:7362` calls `emitBeforeAgentStart` from `#prepareAgentStart`, which runs per
prompt (`:7323`, `:7548`); the event's own doc says "Fired after user submits a prompt but before
the agent loop starts" (`types.ts:282-283`) and "Fired before an ordinary prompt or an actually
dequeued user-containing batch reaches the provider" (`types.ts:845-846`). Round 1's fix for this
(A5 7.2, "State: regenerated per start, idempotent") is self-contradictory and was carried into
the plan verbatim.

Two consequences:
- If "idempotent per agent" wins, the roster, claims, cursor+lag and uptime are frozen at the first
  turn and are wrong from turn 2 onward — in a document whose section 5 is literally "Your cursor +
  lag".
- If "regenerated per start" wins, the digest is an 800-to-2,689-token injection **every turn**,
  and the routing rule (471) plus the cheat-sheet (135) are re-sent unchanged every turn.

**Fix:** state the per-turn injection budget as a single number in the digest ("injected per turn:
<=10 msgs / 2048 tok; this digest <=N tok"); pick one regeneration policy; if per-turn, hoist the
static blocks (routing rule, cheat-sheet, config) into the tool description / system prompt where
they are cacheable, and keep the dynamic digest to roster+claims+cursor.

---

## 6. Card text — the model sees `content` only, and `content` is a bare body

**Plan lines, verbatim (`:907-919`):**
```ts
export async function deliver(pi: ExtensionAPI, ctx: ExtensionContext, target: string, record: RoomRecord, tier: Tier) {
  if (tier === "T2") { bumpCursor(target, record.seq); return; }        // never injected
  const safeBody = escapeHarnessTags(sanitizeText(record.body));         // S1 + S2
  if (target === ctx.agent.id) {
    pi.sendMessage({ customType: cardTypeFor(record), content: safeBody,
                     display: true, details: record }, { deliverAs: tier === "T0" ? "steer" : "aside" });
```

**Does the model see `details` or `content`? `content` only.** Verified:
`pi-agent-core/src/compaction/messages.ts:216-227` converts `custom`/`hookMessage` to a
`role:"developer"` message built from `message.content` alone; `details` is never read on the LLM
path. (`details` is transcript-only: `customOneLiner`, `session-history-format.ts:407-441`.)

So the model's entire view of an injected room message is `safeBody` — the raw `record.body`, with
**no sender, no topic, no tier, no timestamp, and no reply instruction.** §7.3's cards
(`:1202-1205`, "room <- author · 2m ago") are the *human* view; the model gets strictly less.

The native precedent does the opposite. Verbatim,
`pi-coding-agent/src/prompts/system/irc-incoming.md`:
```
<irc>
Incoming IRC message from agent `{{from}}`{{#if replyTo}} (reply to {{replyTo}}){{/if}}:

{{message}}
...
If response expected, reply via `write` (`path: "agent://{{from}}"`, `content: "..."`)...
</irc>
```
and `irc-bridge.ts:186-198` renders the body *through* that template, escaping only the inner body.
The room's `deliver()` has no envelope, so an injected message is indistinguishable from harness
text and the recipient cannot tell who to answer.

**Also: `content: safeBody` throws for every non-`msg` record.** The T0 row (`:824`) fires on "your
claim revoked/contended", i.e. `kind:"claim"` / `kind:"release"` records — and the schema
(`:373-374`) gives those no `body` field. `sanitizeText(text: string)` calls `text.toWellFormed()`
(`pi-utils/src/sanitize-text.ts:23`) and `escapeHarnessTags(text)` calls `text.replace(...)`
(`session/harness-tags.ts:15`); both throw `TypeError` on `undefined`. So the single most
important T0 event in the design crashes the delivery adapter. `cardTypeFor(record)` exists for
`room:claim` (`:1204`) precisely because non-`msg` records are meant to be delivered.

**Fix:** build `content` from a per-kind template (`{ from, topic, tier, body }`), and escape the
*body field only* — as the native bridge does. Never pass `record.body` where the record kind may
not have one.

---

## 7. Prompt-injection surface

**Already covered — do not re-report.** The digest's unescaped backlog is V1
(`review3/ORCHESTRATOR-verification.md:8-24`, CRITICAL) and C8 item 4
(`review3/C8-misuse.md:39-46`, provenance marker). S1/S2 (`review/CONSOLIDATED.md:18-19`) cover
`deliver()` and the rendered lines. Verified: `escapeHarnessTags`/`sanitizeText` appear at exactly
two sites in the plan (`:909`, `:1241`) and the digest is neither.

**One surface V1 and C8 do not name:** §5.4's **claim rows** (`:949`, "resource, holder, remaining
TTL") carry `resource` and `holder` straight from the log into the digest. `resource` is
caller-supplied (`:663` "claim — lease ms"; `:666`/`:667` "key — resource key within the topic")
and `holder` is an agent id, but neither is escaped by any rule the plan states — V1's fix text
names "backlog bodies, claim resources, holder ids, topic names", so this is *inside* V1's fix
scope. Recording it only so the implementer does not apply V1 to `body` alone.

---

## 8. Tone / format vs the host's own register

The host states its own convention in the system prompt's first line:

> `pi-coding-agent/src/prompts/system/system-prompt.md:1` — "RFC 2119 keywords: MUST, REQUIRED,
> SHOULD, RECOMMENDED, MAY, OPTIONAL. `NEVER` = `MUST NOT`; `AVOID` = `SHOULD NOT`."

Native tool prose follows it (`wait.md:1-4`: "Wait only when blocked with nothing else to do.";
"NEVER wait on other agents."; "NEVER poll while work remains.").

§8 uses **none** of it. Verbatim from `:1312-1347`:

> "When in doubt, use the room."
> "Corrections:"
> "Asymmetry to remember: an interrupt *intent* is not an interrupt *strength*."
> "Never assume a claim you did not take."
> "If you have nothing to do but wait for a peer, a claim, or a room message, BLOCK — do not poll"

The last is the clearest deviation: `BLOCK` is an ad-hoc all-caps directive where the host's
vocabulary reserves caps for RFC 2119 keywords, and "do not poll" is a `SHOULD NOT` written as
prose. The rest is essayistic ("Asymmetry to remember", "the reclaimer will be told — and so will
you") where the host's register is terse and imperative. §8 is 317 words; `wait.md` is 4 lines.

Also non-native: §8 opens with a `## ` (h2) heading; every host prompt block opens at `# ` (h1)
(`system-prompt.md`, `subagent-system-prompt.md`, all 94 files in `prompts/system/`), and the only
markdown table in the host's prompt corpus is `prompts/agents/reviewer.md` — the digest's
cheat-sheet table has no host precedent.

**Fix:** rewrite §8 in the host register: `MUST`/`NEVER`/`SHOULD`, h1 heading, no essayistic
asides, and fold the digest's cheat-sheet into a bullet list (also 135 -> ~60 tokens, helping §1).

---

## Findings

| # | Sev | Plan line(s) | Defect | Fix |
|---|---|---|---|---|
| C6-1 | **P0** | `:907-909` | `deliver()` passes `record.body` to `sanitizeText`/`escapeHarnessTags` for every record kind; `claim`/`release`/`note`/`member`/`gap` have no `body` (`:369-376`), so the T0 "your claim revoked/contended" path (`:824`) throws `TypeError`. | Switch on `record.kind`; build `content` per kind; escape the body field only. |
| C6-2 | **P0** | `:955-963` | The 800-token cap is unsatisfiable: measured 2,689 (lean) / 3,645 (rich) = 3.4-4.6x; the untruncatable floor is 665, so the cap is met only by deleting 100% of roster+claims+backlog. Plan also contradicts itself on whether the 471-token routing rule is inside the cap (`:952` vs `:1308-1309`). | Re-derive the cap (~2,000 incl. routing rule) or move static blocks out; reorder truncation to drop cheat-sheet+config first. |
| C6-3 | **P1** | `:945-953`, `:1402` | Digest content is time-varying (uptime, roster, claims, cursor+lag) but P4 requires per-agent idempotency; `before_agent_start` fires per prompt (`agent-session.ts:7362`), so either the content is stale from turn 2 or 2,689 tokens are re-injected every turn. | Pick one policy; hoist static blocks; state the per-turn budget. |
| C6-4 | **P1** | `:612-627`, `:739-779` | `ROOM_DESCRIPTION` is referenced once and never defined (1 grep hit); none of the four tools has a `description`; native `wait.md:3` says "NEVER wait on other agents", which the two new wait tools contradict with no counter-text. | Define `ROOM_DESCRIPTION`; add a per-tool description that carves out the native prohibition. |
| C6-5 | **P1** | `:658-671`, `:742-746`, `:763-768`, `:781-786` | Every unit, default, bound and required-arg note is a `//` comment. Comments never reach the model; only `.describe()` emits JSON Schema (`omptype/src/ir.ts:59-60`). The plan has **0** `.describe()` calls; native tools have 169. | `.describe()` every parameter; move units into the digest cheat-sheet. |
| C6-6 | **P1** | `:683`, `:975`, `:899` | Cheat-sheet and §5.2 promise `mute`/`unmute` of "a topic **or agent**"; the schema has only `topic?: string` — no agent target. Model mutes the wrong thing silently. | Add `agent?` (or a `target` enum) or narrow the text. |
| C6-7 | **P2** | `:660`, `:879`, `:1322-1325` | The T0 mechanism (`mention`) is never taught. "mention" appears in §8 only in negative clauses; the digest's own drop-summary counts "M mention you"; `post`'s `mention` param is unguessable. | Add a `post` example with `mention:[...]` to the routing rule and cheat-sheet. |
| C6-8 | **P2** | `:1314` | "Use `agent://<id>` (peer message)" is not a callable instruction — `agent://` is an internal URL; the host's instruction is `write` with `path: "agent://<id>"` (`subagent-system-prompt.md:29`). `write` appears 0 times in §8. | Name the tool and the `path` argument. |
| C6-9 | **P2** | `:907-919` | Injected `content` is the bare body: no sender, topic, tier, or reply instruction. `details` never reaches the LLM (`pi-agent-core/compaction/messages.ts:216-227`), so the model sees less than §7.3's human card. | Render `content` from a template with from/topic/tier + the reply line, as `irc-incoming.md` does. |
| C6-10 | **P2** | `:993-1012`, `:699`, `:1442` | The command advertises `leave` in completions and in the "join / leave / mute" branch, but §4.1 states "There is no `op:\"leave\"`"; R6's promised `/room config` has no branch. | Replace `leave` with real ops; add the config branch. |
| C6-11 | **P3** | `:1237-1243`, `:1263` | `bodyLines` is claimed to reproduce the native card but diverges: native collapsed is **2** (`tools/wait.ts:470`), the copy defaults to 3; native filters blank lines and uses `cappedHeadLines` + `trim` + `truncateToWidth` (`wait.ts:493-503`), the copy uses a raw `.slice(0,100)`. | Match the constants, or state the deviation as intentional. |
| C6-12 | **P3** | `:997` | `getArgumentCompletions: prefix => /* ["board","join","leave","mute"] filtered */ null` returns `null` unconditionally — the arrow body is `null`. Completions never render. | Implement the filter, or delete the option. |

---

## What I checked and found CORRECT

- **Cheat-sheet op coverage.** 11 rows cover all 12 ops of `:658` (`mute`/`unmute` merged).
  Round 1's P4 (8 vs 12 ops) is fixed at `:30`.
- **Routing rule fixes from round 1 hold.** Clause 10 is gone; clauses 7/8 are merged; the
  Corrections block exists; "When in doubt, use the room." replaced the unexecutable tie-break.
- **`agent://` vs room precedence for a running agent.** Clause 3 (`:1317`) and the Corrections
  block (`:1330-1331`) agree with `irc-bridge.ts:214-224` (a parent steer is a real `agent.steer`;
  a non-parent gets `#interrupts.push`, i.e. an aside that does not hard-steer). The plan's
  "interrupt intent is not interrupt strength" claim is **accurate**.
- **T0 cut semantics.** "cuts an interruptible wait" (`:1336`) matches
  `pi-agent-core/src/agent-loop.ts:3325` (`ircAbortController.abort(TOOL_INTERRUPT_ABORT_REASON)`).
- **Digest roster cap.** 32 mirrors `DEFAULT_PEER_ROSTER_LIMIT = 32`
  (`pi-tui/src/tools/irc.ts:4`), and `AgentRegistry.list()` (`agent-registry.ts:319-321`) is the
  correct source for "live members with status".
- **Card renderer plumbing.** §7.2's four invocation conditions, the `details` cast in the
  `room:message` renderer (`:1255`), and the `createCachedComponent(options.expanded, ...)` shape
  (`:1260`) all match `pi-tui` source; `room:*` cannot collide with built-ins.
- **`useless` on non-event paths** (`:812`) is real (`agent-loop.ts:554`).
- **`ttl` is milliseconds everywhere in the plan** (round 1's P1 fix holds).
- **`display:true` + no `triggerTurn` for T2** (`:922`) matches `types.ts:1576-1591`.
