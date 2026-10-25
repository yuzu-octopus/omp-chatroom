# How should a multi-agent group chat coordinate effectively with cache-stable, bounded, shared context?

**Answer:** Keep the room's core architecture — static routing rule in the system prompt plus the volatile digest as a tail message, the claim board, and tiered attention — because it already implements the cache-stability tail rule the literature prescribes [1][29][39]. The evidence-backed changes are small and ranked below: per-op preconditions in the tool schema, join-first and when-NOT-to-use lines in the tool description, and shrinking the always-broadcast raw tail in favor of the status ledger. Typed intent/status fields and cross-agent cache sharing are YAGNI at current scale.

**Confidence:** high on cache mechanics and share-minimal (multiple independent primaries [1][2][3][7][8][15]); medium on the tool-schema fixes (authoritative plugin source [38][40][41], but no measured mis-call corpus); low on absolute cost numbers (single-source vendor figures, no same-task multi-vs-single benchmark [7][16][32]).

## Why

- Prefix-match caching makes render order destiny: order is `tools → system → messages`, and any byte change at position N invalidates everything after it [1][2]. The fix is stable-first/volatile-last with breakpoints at stability boundaries [3].
- The room already conforms by construction: the ONLY thing in the system prompt is the static routing rule [39], while the per-turn digest rides a `before_agent_start` result message (`customType: "room:digest"`) [39] — exactly the tail slot the literature prescribes for volatile/live state [29][30].
- The digest mutates essentially every turn (roster/cursor/lag/claims/50-record tail rebuilt live [39]), so its own mutation rate (~1.0) sits above the do-not-cache crossover (~0.67 for 5-min TTL [single source] [27]) — but the crossover governs *where to put the breakpoint*, not whether the design is wrong: the static prefix still hits, only the tail misses (reconciliation a) [27][3][39].
- Sharing rule from four independent vendors is framing-yes/trace-minimal: fan-out results distill to ~1–2k tokens [single source] [8], zero-shared-context reviewers catch ~2 bugs/PR (~58% severe) [single source] [15], attention degrades with length [18][8]. The digest's truncation order (oldest backlog → shortest-TTL claims → idle roster) already sheds exhaust before ledger [39] (reconciliation b).
- Broadcast is cheap-for-reader/expensive-system-wide [7][16]: right for parallel breadth-first work with discardable contexts, wrong for tightly-coupled chains where a single loop with progressive disclosure wins [9]. Fan-out is budgeted (1 / 2–4 / 10+ agents by query complexity) [7] (reconciliation c).
- Routing needs structure but not much of it: `recipient_ids`/`intent`/`status`/`thread_id` separate from transcript text is the spec pattern [20][21]; `body`+`topic` covers the small centrally-dispatched case, and typed fields earn their keep only past ~5–8 agents or peer-to-peer negotiation (reconciliation d).
- Presence-with-staleness (`cursor`/`lag`, status ordering) is coordination machinery; reactions/read-receipts/typing indicators are human polish no agent spec requires [19][39] (reconciliation f).

## What would change this

- Host prompt logs showing the `room:digest` message does NOT land after the cached prefix (all tail-rule conformance rests on code comments; host attach details are unconfirmed [39]) — would force rethinking injection position.
- Measured misroute rate (posts acted on by the wrong agent) rising with agent count — would promote typed `intent`/`status` from YAGNI to required (reconciliation d).
- Digest-cost instrumentation showing the 50-record tail dominates tokens at real cadence — would force tail caps or artifact-reference passing [7].
- A controlled same-task multi-vs-single token benchmark contradicting the 15×-vs-chat figure [7] — would reset the cost framing entirely.

## Considered and rejected

- **Caching the digest / breakpoint after it.** Mutation ~1.0 exceeds the ~0.67 crossover [single source] [27]; paying rewrites every turn loses. Cache the static prefix, expect tail misses.
- **Share-everything full log.** Loses to share-minimal on four vendor sources [8][10][13][15]; context rot is measured [18]. The ledger stays, the exhaust gets truncated first [39].
- **Typed `intent`/`status`/`reply_to` fields now.** Genuinely missing vs the A2A pattern [20], but YAGNI under manager-dispatch at small scale; `replyTo` unknown-IDs are silently ignored today [38]. Revisit on misroute evidence.
- **Reactions / read receipts / typing indicators.** No primary spec requires them for agent correctness [19]; TUI glyphs/colors are explicitly not model context [39].
- **Cross-agent shared prefix cache.** Caches are isolated by workspace/org with exact-byte-match [1]; agents have different histories by construction, so cross-agent sharing is a non-goal (reconciliation e).
- **Splitting the 12-op monolith.** Matches the native 9-op `todo` pattern [40]; F4's own verdict is docs/schema-only, no behaviour change [38].
- **Moving the digest into the system prompt.** Directly violates the tail rule [29][30]; the static-rule-only prompt is what keeps the prefix byte-identical [39].

## Findings

### Coverage map (brief facet → findings → weight)

| Brief facet | Covered by | Weight |
|---|---|---|
| Message format | F3 (routing fields, envelope, tool-mediated [20][21][26]) + F4 (room schema gaps, ranked fixes [38][40][41]) | solid (2+ independent) |
| Context management | F2 (isolation, distill 1–2k, compaction vs retrieval, rot [7][8][10][13][15][18]) | solid (4 vendors) |
| Cache stability | F1 (mechanics, tail rule, crossover [1][2][3][27]) + F5 (injection path [39]) | solid |
| Group-chat UX for agents | F3 (threads, turn ownership, no-receipt-machinery [19][22]) | medium (2 primaries, contested threading [22], no UX outcome data) |
| Comparison vs IRC/Slack/Discord | F3 (IRCv3 tags [23], Slack agent design [19], OpenFloor [25]) | thin on Discord (no Discord primary in files) |
| Justification vs native `agent://` | F4 (redirect/NOT-to-use lines [38][41]) + F5 (board/tiers/sweep [39]) + host `agent://` semantics (fan-out [42], no peer wait [43], revive-into-queue [44]) | medium (host-verified mechanics, head-to-head unmeasured) |

### Cache stability: mechanics + where the room stands (F1, F5; reconciliations a, e)

- Prefix caching is byte-exact: tools+system+messages order fixed; up to 4 breakpoints; default 5-min TTL refreshed free on hit, optional 1h at 2× write cost; reads cost 0.1× base (0.05×/0.025× on some models) [1]. OpenAI mirrors it: prefix reuse with exact rendered-prefix match, up to 4 cache writes per request on GPT-5.6+ explicit mode (earlier models implicit-only); model/tool/schema/parallel_tool_calls/format/reasoning/verbosity/compaction changes break prefix [2].
- Stability discipline: classify inputs (never-change → per-session → per-turn → per-request), volatile values to the very end, breakpoint at the end of the shared portion — never cache whole-prompt when only a prefix is shared [3]. Tool definitions must stay identical across turns [2][6].
- Volatile shared state rides the tail: live state moves out of the system prompt into end-of-request messages [29]; A2A/volatile context routes through a runtime-context message, never the system prompt ahead of history [30]; history stays append-only [31].
- (a) The digest is above the mutation crossover — rebuilt every turn, mutation ≈1.0 vs ~0.67 crossover (1h TTL crossover ~0.21) [single source] [27] — so the digest segment itself should not be expected to hit cache. This does not condemn the design: the crossover decides breakpoint placement, and the digest rides the tail after the cached prefix [3][39]. To decide fully, measure: per-turn digest byte-change rate by field, prefix-hit rate with/without a post-digest breakpoint, and token cost at observed cadence vs 5-min TTL.
- (e) Position satisfies the tail rule by design: render order is tools → system (static rule only) → messages/history + digest-as-message [1][39]. Same-agent view: static prefix stays byte-identical, only the tail mutates — prefix hits, tail misses, matching "breakpoint at end of shared portion" [3]. Cross-agent view: isolation + exact-byte-match [1] plus per-agent histories make cross-agent sharing a non-goal — no cross-agent invalidation is introduced. Unconfirmed: exact host attach order of the `before_agent_start` message; needs host prompt/cache logs [39].
### Context sizing: how much each agent should see (F2; reconciliations b, c)

- Subagents run in isolated windows everywhere: Claude Code (own prompt/tools, summary returns; keep `description` fields short, ~15k tokens triggers a warning) [10]; Cursor (clean context, ~10 parallel Explore searches, model routing) [13]; Anthropic research (lead + parallel explorers + grounding citation agent) [7]; Devin (manager/child, state communicated deliberately, never assumed) [15].
- Right size is brief-in/distill-out: 1–2k-token summaries from tens of thousands explored [single source] [8]; briefs need objective + format + boundaries (vague briefs duplicate work) [7]; effort budgets 1 / 2–4 / 10+ agents [7]. Cursor's planner/worker split keeps each side's context narrow [single source] [16].
- Fresh beats big: measured context rot across 18 LLMs [single source] [18]; attention-budget gradient, smallest-high-signal-set rule [8]; anti-bloat hygiene on both platforms (mention only known files, rules <500 lines, `/clear` on task switch, on-demand skills/MCP) [11][12][14].
- Compaction vs retrieval vs distill: auto-compact with disk re-injection [11]; recall-first then precision, cheapest form is tool-result clearing [8]; just-in-time retrieval with lightweight identifiers [8]; filesystem artifacts + references beat telephone-game handoffs [7]; compaction for back-and-forth, notes for milestones, multi-agent for parallel research [8]. Single loop with progressive disclosure beats orchestrator-subagent for tightly-coupled chains — keep subagents only for (a) measured bloat degradation, (b) discardable parallel work, (c) tool/instruction conflicts [single source] [9].
- Coordination costs are real: synchronous orchestrator-worker blocks on the slowest subagent [7]; multi-agent ≈15× chat tokens (vs chat, NOT vs single-agent — do not cite as multi-vs-single) and single ≈4× chat [single source] [7]; token use explains ~80% of task variance [7]; verifier re-reads reasoning (communication tax) [33]; coding runs vary up to 30× on the same task with input tokens driving cost [single source] [32].
- (b) Boundary: share coordination state, isolate working trace. F2's own resolution is "share task framing broadly, share working trace minimally" [15]; full-context fork fits same-problem consultation, distillation fits fan-out results [15]. Mapped: roster/claims/cursor = ledger (keep), raw 50-record tail = exhaust (shed first) — and the truncation order already does exactly that [39]. Caveat: broadcast-to-every-agent-every-turn is only F2-compatible while the tail stays expendable exhaust, never a distillation substitute.
- (c) CAMEL-0.33×/Jarvis-0.36× figures appear in NEITHER F2 nor F6 — premise unsupported, dropped from this report. What the files do support: the digest is the cheap-reader/expensive-system pattern (lead context stays clean, total tokens rise) [7][16]. Choose by shape: budgeted fan-out for parallel discardable work; single loop for coupled chains [7][9].

### Message format + group-chat UX (F3, F4; reconciliations d, f)

- Explicit routing over @-parsing: `recipient_ids` + `intent` (handoff/assignment/question/decision) + `status` (queued/in_progress/awaiting_response/completed/blocked) + `thread_id`/`reply_to`; transcript is "what was said", fields are "who acts/what/done" [20][21].
- Threads + visible turn ownership: subproblems in threads, goal/decisions/status in main; show who is responding and why [19][22]. Threading-forcing is contested (always-thread vs main-summary-plus-artifacts) [22]; orchestration style is a determinism/flexibility trade (round-robin vs selector vs coordinator vs peer mentions) [21][22].
- Envelope hygiene: stable IDs, idempotency, expiry; routing separate from content; no secrets in chat [23][24]. Floor/mediation/delegation model fits agent turn-taking [25]. Tool-mediated comm (all inter-agent messages via tools) buys auditability but requires teaching the system prompt [26].
- (d) `body`+`topic` does NOT satisfy explicit routing — `intent`, per-post `status`, and working `reply_to` are genuinely missing [20][38] — but YAGNI holds under manager-dispatch at small scale, where the dispatcher (not the schema) routes. Equivalents already present: `topic`≈thread/channel, claim `topic/key`≈ownership, wait tools≈awaiting/blocked, T0 mention≈`recipient_ids` steering [38][39]. The fields start paying past ~5–8 concurrent agents or under peer-to-peer negotiation [speculative threshold, needs measurement]. Deciding datum: misroute rate vs agent count in real room logs.
- (f) `cursor`/`lag` + status ordering are staleness/ownership signals (who has seen record N, who is live/stale) — directly load-bearing given no versioned shared-context protocol exists in the primaries (F2 Gaps). T0 steering, claim-expiry sweep with dedup, and tiered bounded delivery are ownership/delivery machinery [39]. Droppable: reactions/receipts/typing [19], TUI glyphs/colors/thread badges (not model context) [39]. Boundary: staleness/ownership (keep) vs acknowledgment/decoration (drop).

### Cost and token economics (F6; reconciliation c)

- No clean same-task multi-vs-single token benchmark exists in the files; the SWE-bench dollar figures are unverified secondary [34] (F6 Gaps). Treat all multipliers as directional.
- Planner/worker economics cut both ways and both are true at different levels: isolating the reader is cheap per-agent while worker exploration raises system totals [7][16]. Cursor's numbers: planner tokens small but ~2/3 of cost on Opus 4.8, workers most tokens at 1/3 cost; hybrid fleets $1,339 vs single-model $10,565 at similar quality [single source] [16]. Harness hygiene (66% sysprompt trim §Trimming, tool offload −60% static/−46.9% MCP §Loading, explicit breakpoints −20% cold miss §Cache-reuse, line-nos every 10th −1.6% §Compressing) cut user tokens 7% with no quality loss (lede) [single source] [17].
- Cache pricing recap: Anthropic 5-min write 1.25×/read 0.1× (1h write 2×), refresh free on hit [1]; 5-min breaks even after one read, 1h needs two [secondary] [36]; OpenAI reused prefix discounted up to 95%, per-model rate on the pricing page (GPT-4o 50% verified on the 2024 announcement), hit not guaranteed [2][4]. Default-TTL silently changed 1h→5min in Mar 2026 — cost assumptions must use 5-min [secondary] [37].

### Ranked improvements (concrete; docs/schema unless noted)

1. Per-op precondition line in the `op` describe (`join first; post needs topic+body; claim/release need topic+key; zoom needs lo+hi from tree; recall needs pattern`) — kills first-call failures at schema-read time instead of execute-fail time [38].
2. `join first` sequencing sentence in `ROOM_DESCRIPTION` (first call registers you and mints your cursor; board/read before join see empty state) — today only in code comments + SKILL.md [38][41].
3. When-NOT-to-use two-liner in `ROOM_DESCRIPTION` (no one-step/strictly-sequential work; no bulk output — artifact + id instead) — cost guard for an always-loaded (`essential`) tool [38][41].
4. Shrink the always-broadcast raw tail: lower the 50-record tail, summarize-once, or push bulk payloads to artifact references [7][39]. Nothing here changes the ledger-first truncation order [39].
5. `key`/`since`/`gen`/`recall` describe cross-refs (wait_for_claim string parity; cursor-advance on read; gen opt-in fence; tree-first/recall-budget cues) [38].
6. Instrument before optimizing: log digest byte-change rate by field, prefix-hit rate, and which `fail()` strings fire most — today's ranking is by reasoning about failure cost, not a mis-call corpus (F4 Gaps) [38].

### Do not change

- The 12-op monolith (matches native 9-op `todo` shape [40]); description + schema stay tight because `essential` load taxes every turn [38].
- Static-rule-only system prompt + digest-as-tail-message [39]; never-throw/content-always-present contract [38].
- Claim board first-writer-wins + mandatory TTL + expiry sweep with waiter promotion and T0 notice [39].
- T0/T1/T2 classification, bounded delivery with coalescing, turn budgets, cursor persistence [39].
- `cursor`/`lag`/status presence in the digest [39]; idempotent join/claim-renew, post `idemKey` [38].

### README justification narrative (room vs `agent://` 1:1 and vs IRC-style)

- Vs 1:1 DMs: the room is a coordination artifact, not a chat — exclusive ownership with TTL, one durable replayable record a late joiner can read, tiered attention with bounded waits, and a cold-summary tree have no 1:1 equivalent in the host: `agent://all` is a fan-out of independent 1:1 `bus.send` calls with per-target receipts and no shared record [42]; no native exclusive-ownership-with-TTL primitive exists [44-grep]; native `wait` refuses peer-only waits ("Nothing to wait for") [43]; parked-agent mail revives through the lifecycle into the session IRC queue while the bus mailbox holds only failed live hand-offs (`MAILBOX_CAP = 100`) [44]. The plugin's own rule routes private redirection to `agent://` and shared work to the room [38][41][39]. Head-to-head measurement vs host `agent://` does not exist in these findings — say so in the README, don't overclaim.
- Vs IRC-style: IRC gives tags/threads without agent identity or ownership [23]; Slack's agent guidance wants streaming, threading, and confirmations, not receipts [19]; A2A/AutoGen want machine-readable routing over prose mentions [20][21]. The room keeps the IRC shape agents already parse (topics, tail, mentions) and adds exactly the three things chat lacks: ownership (claims), staleness (cursor/lag), and steering (T0/T1/T2 + waits) [39].

## Open questions

- **Host `agent://` semantics — RESOLVED (host-source read).** `agent://all` = fan-out of independent 1:1 `bus.send` calls, no shared object (`pi-coding-agent/src/irc/messaging.ts:64-74` [42]); no native exclusive-ownership-with-TTL primitive (no `claim|lease|ttl|mutex|exclusive` agent-visible primitive in `src/irc/*`, `tools/wait.ts`, `tools/irc.ts`, `registry/agent-registry.ts` [44-grep]); native `wait` refuses peer-only waits — a peer owes no message, "Nothing to wait for" (`pi-coding-agent/src/tools/wait.ts:83-89,141-153` [43]); parked-agent mail revives through the lifecycle into the session's IRC queue while the bus mailbox holds ONLY failed live hand-offs (`pi-coding-agent/src/irc/bus.ts:153-217` + `session/irc-bridge.ts:191-260`, `MAILBOX_CAP = 100` [44]).
- **Digest cost at real cadence — RESOLVED-with-harness (collection exists; cadence numbers pending).** The gauge is `digestStats(store, prev, next)` in `plugin/src/onboarding/digest.ts` (tests in `plugin/tests/onboarding.test.ts` §12): per-render bytes/estTokens, common-prefix length vs the previous render, `changedBytes` after the prefix, and `truncated` (any rendered section shorter than what the store holds, within caps). The per-turn collection harness is `recordDigestTurn` (`plugin/src/onboarding/digest.ts`, hook-only emission in `plugin/src/onboarding/hook.ts`, tests §13): with `OMP_ROOM_DIGEST_STATS=1` the hook appends one JSONL line per turn (`{room, seq, at, bytes, estTokens, changedBytes, commonPrefix, truncated}`) to `$OMP_ROOM_DIGEST_STATS_PATH` (default `$(mktemp -d)/stats.jsonl` — under `os.tmpdir()`, never the repo/session store). Live run: `OMP_ROOM_DIGEST_STATS=1 OMP_ROOM_DIGEST_STATS_PATH=$(mktemp -d)/stats.jsonl <session>; tail -n N <path>` — read the JSONL. Still unmeasured: the N-turn numbers themselves, plus the per-field byte-change split the gauge does not do. (F6 Gaps) [39].
- **Misroute rate vs agent count.** Would decide typed-intent timing (reconciliation d) and validate the ~5–8-agent boundary [speculative].
- **Same-task multi-vs-single benchmark.** None found; SWE-bench figures unverified [34] (F6 Gaps).
- **Communication-tax share — RESOLVED (full-PDF pins; single source).** Def (§3.3, p.5): planner output reformulated as reasoner input + reasoning results re-appearing in verifier input; duplicate = token in ≥2 LLM calls (Table 1, p.1). Headlines: duplication up to 86% (CAMEL/math; MetaGPT/code 72%, AgentVerse/reasoning 53%) (Table 1, p.1); verifier share where explicit verification exists 72-78% (MetaGPT) / 63-65% (AgentVerse FED/MGSM) / 0% CAMEL (Table 2, p.8); input:output 2:1-3:1 (Finding 3, p.8); verifier tokens reprocess reasoning not novel checks — 20% reinvested (MetaGPT 2048), MGSM share garbled in extract ("5-%") (Finding 6, p.9); linear < hierarchical verifier tax, trading adaptability (Findings 8-9, p.9) [33]. Design note (ONE sentence): since the paper's verifier cost is recycled reasoning rather than new signal, it directly supports the ledger-first/exhaust-first truncation order — rebroadcasting raw reasoning to every agent is exactly the tax. OpenAI caching half unchanged [2][4].
- **Vendor internals.** Devin/Cursor budgets and summarisation thresholds, per-turn sizing optimum (1–2k is observed norm, not A/B optimum), compaction fidelity, shared-context versioning protocol — all unspecified in primaries (F2 Gaps) [10][13][8].
- **UX evidence.** No outcome data on reactions/receipts/typing for agents, no verbose-vs-structured format cost comparison, human+agent mixing underexplored (F3 Gaps) [19]; Discord-specific guidance missing from files.
- **Cache-provider unknowns.** Multi-agent hit-rate benchmarks, cross-provider coherence, long-session eviction vs compaction, provider routing internals (F1 Gaps) [1][2].
- **Schema unknowns — RESOLVED (both host-verified).** (a) `prompt.render` (Handlebars) works on ANY string, not just `.md` files (`pi-utils/src/prompt.ts:533-548`); `todo.ts:726-727` renders with empty context, `read.ts:1031-1035` with a real context — ROOM_DESCRIPTION through `prompt.render` follows the host pattern. (b) Agents see BOTH tool-level `description` AND per-param `describe` on every normal request (`pi-agent-core/src/agent-loop.ts:1028-1054` `normalizeTools`); prune path `stripSchemaDescriptions` only under opt-in `pruneToolDescriptions` (`pi-ai/src/utils/schema/wire.ts:582-608/645-675`). Still OPEN: no error corpus to reorder fixes (F4 Gaps); exact host cache boundaries for the digest message [39].

## Sources

Provider docs & API references [primary]:
1. Anthropic prompt caching (prefix match, render order, TTL, breakpoints, pricing) — https://platform.claude.com/docs/en/build-with-claude/prompt-caching — 2026-10-26 [primary]
2. OpenAI prompt caching guide (prefix reuse, explicit mode, 4-write cap, prefix-breaking changes) — https://developers.openai.com/api/docs/guides/prompt-caching — 2026-10-26 [primary]
3. Anthropic API prompt-caching skill (stability classes, breakpoints at boundaries, shared-prefix rule) — https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md — 2026-10-26 [primary]
4. OpenAI prompt-caching announcement (discount schedule, prefix-only) — https://openai.com/index/api-prompt-caching/ — 2026-10-26 [primary]
5. AWS Bedrock prompt caching (TTL behavior) — https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html — 2026-10-26 [primary]
6. OpenAI forum: caching not applied when schema changes (tool-definition stability) — https://community.openai.com/t/prompt-caching-not-applied-when-schema-changes/967577 — 2026-10-26 [primary]

Vendor engineering (multi-agent context & cost) [primary]:
7. Anthropic: multi-agent research system (orchestrator/worker, effort budgets, 15×-vs-chat, token-variance factors) — https://www.anthropic.com/engineering/multi-agent-research-system — 2026-10-26 [primary]
8. Anthropic: effective context engineering (attention budget, 1–2k distill, JIT retrieval, notes vs compaction vs multi-agent) — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — 2026-10-26 [primary]
9. Anthropic: fold subagents into the main loop (single-loop wins for coupled chains; three keep-subagent conditions) — https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop — 2026-10-26 [primary]
10. Claude Code sub-agents docs (isolated windows, description budget) — https://code.claude.com/docs/en/sub-agents — 2026-10-26 [primary]
11. Claude Code context window (auto-compact, re-injection set, controls) — https://code.claude.com/docs/en/context-window.md — 2026-10-26 [primary]
12. Claude Code how-it-works (tool-result clearing economics) — https://code.claude.com/docs/en/how-claude-code-works.md — 2026-10-26 [primary]
13. Cursor subagents docs (clean context, Explore/Search roles) — https://cursor.com/docs/subagents — 2026-10-26 [primary]
14. Cursor prompting + rules (anti-bloat: @-mention discipline, <500-line rules, context ring) — https://cursor.com/docs/agent/prompting ; https://cursor.com/docs/rules — 2026-10-26 [primary]
15. Cognition: multi-agents working (manager/child, clean-context reviewers, divide-by-context, smart-friend fork) — https://cognition.com/blog/multi-agents-working — 2026-10-26 [primary]
16. Cursor: agent swarms and the new model economics (planner/worker cost split, fleet pricing) — https://cursor.com/blog/agent-swarm-model-economics — 2026-07-20, read 2026-10-26 [primary]
17. Cursor: improved token efficiency (sysprompt trim, tool offload, breakpoints, 7% saving) — https://cursor.com/blog/improved-token-efficiency — 2026-09-23, read 2026-10-26 [primary]
18. Chroma: context rot (length-driven degradation, 18 LLMs) — https://www.trychroma.com/research/context-rot — 2026-10-26 [primary]
19. Slack agent design concepts (threads, streaming, confirmations; no receipt machinery) — https://docs.slack.dev/concepts/agent-design — 2026-10-26 [primary]

Protocols & specs [primary]:
20. A2A specification (recipient_ids, intent, status, thread/reply routing) — https://github.com/a2aproject/A2A/blob/main/docs/specification.md — 2026-10-26 [primary]
21. AutoGen selector group chat (model-based speaker selection) — https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/selector-group-chat.html — 2026-10-26 [primary]
22. AutoGen conversation patterns (threads, turn ownership) — https://autogenhub.github.io/autogen/docs/tutorial/conversation-patterns/ — 2026-10-26 [primary]
23. IRCv3 message tags (envelope: IDs, idempotency, expiry) — https://ircv3.github.io/specs/extensions/message-tags.html — 2026-10-26 [primary]
24. Agent Communication Protocol core v1.0 (routing/content split, no-secrets) — https://github.com/Kickflip73/agent-communication-protocol/blob/main/spec/core-v1.0.md — 2026-10-26 [primary]
25. OpenFloor inter-agent message (floor/mediation/delegation) — https://openfloor.dev/protocol/specifications/inter-agent-message — 2026-10-26 [primary]
26. Open-managed-agents IM design (tool-mediated communication) — https://github.com/openma-ai/open-managed-agents/blob/main/docs/agent-im-design.md — 2026-10-26 [primary]

Implementation evidence (PRs/issues) [primary]:
27. claude-cookbooks PR #707 (shared-state mutation crossover ~0.67 / ~0.21) — https://github.com/anthropics/claude-cookbooks/pull/707 — 2026-10-26 [primary] [single source]
28. claude-cookbooks #596 comment (externalize-to-retrieval vs prefix currency) — https://github.com/anthropics/claude-cookbooks/issues/596#issuecomment-2966806244 — 2026-10-26 [primary]
29. bridgic-agent PR #11 (volatile state to tail/runtime_state) — https://github.com/bitsky-tech/bridgic-agent/pull/11 — 2026-10-26 [primary]
30. openclaw #112986 (volatile A2A context via tail message) — https://github.com/openclaw/openclaw/issues/112986 — 2026-10-26 [primary]
31. hermes-agent #13631 (append-only history, no mid-reloads) — https://github.com/NousResearch/hermes-agent/issues/13631 — 2026-10-26 [primary]

Research & quantitative [primary unless noted]:
32. Stanford Digital Economy Lab working paper 2026-04-14 (1000× coding-vs-chat, 30× same-task variance; arXiv 2604.22750) — https://digitaleconomy.stanford.edu — read 2026-10-26 [primary] [single source]
33. AgentTaxo full PDF (26pp, ICLR 2025 FM-Wild workshop; OpenReview PDF `https://openreview.net/pdf?id=0iLbiYYIpC` mirrored at `https://lacuna.tiptreesystems.com/pdf/art_d529552aa46f6c9576a28ea506676d49` — OpenReview direct fetch bot-walled at read time; abstract at https://mlanthology.org/iclrw/2025/wang2025iclrw-agenttaxo/) — read 2026-10-26 [primary] [single source; MGSM verifier-recycling figure garbled "5-%" in extract]
34. ANYMAC, EMNLP 2025 (ANYMAC-Eff 5× fewer prompt tokens vs G-Designer on GSM8K, exact quote §5.4 p.11561; full ANYMAC 95.66 vs G-Designer 95.07 Table 1 p.11560; within-multi-agent, NOT vs single-agent; limitation §Limitations p.11562: HumanEval below SOTA from overly long contexts, 1k RL samples) — https://aclanthology.org/2025.emnlp-main.584 — full PDF read 2026-10-26 [primary]

Secondary:
35. ax0x: prompt cache is architecture (identical-prefix fan-out) — https://blog.ax0x.ai/prompt-cache-is-architecture — 2026-10-26 [secondary]
36. Technspire: Anthropic cache pricing break-even (1 read / 2 reads) — https://technspire.com/en/blog/anthropic-prompt-caching-pricing-mechanics — 2026-10-26 [secondary]
37. dev.to: default-TTL 1h→5min change note — https://dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao — 2026-10-26 [secondary]

Plugin & host source (local paths, primary to implementation):
38. `plugin/src/tools/room.ts` (12-op enum, ROOM_DESCRIPTION, schema, execute/fail paths, loadMode) — 2026-10-26 [primary]
39. `plugin/src/onboarding/{hook,digest,escape}.ts`, `routing-rule.md`; `plugin/src/attention/{tiers,delivery}.ts`; `plugin/src/panel/chat-pane.ts` (digest-as-message, static rule, T0/T1/T2, sweep, presence) — 2026-10-26 [primary]
40. `plugin/node_modules/@oh-my-pi/pi-coding-agent/src/tools/todo.ts`, `src/prompts/tools/todo.md` (9-op monolith, .md prompt-file pattern, repair-oriented errors) — 2026-10-26 [primary]
41. `plugin/skills/omp-agent-chatroom/SKILL.md` (claim cycle, cheat-sheet, NOT-to-use clause) — 2026-10-26 [primary]
42. `plugin/node_modules/@oh-my-pi/pi-coding-agent/src/irc/messaging.ts:64-74` (`agent://all` fan-out of independent 1:1 `bus.send` calls, per-target receipts, no shared object) — 2026-10-26 [primary]
43. `plugin/node_modules/@oh-my-pi/pi-coding-agent/src/tools/wait.ts:83-89,141-153` (peer owes no message; peer-only wait refused, "Nothing to wait for") — 2026-10-26 [primary]
44. `plugin/node_modules/@oh-my-pi/pi-coding-agent/src/irc/bus.ts:153-217` + `src/session/irc-bridge.ts:191-260` (parked-agent mail revives through lifecycle into session IRC queue; bus mailbox = failed-live-handoff fallback only, `MAILBOX_CAP = 100`); no-lease grep: no `claim|lease|ttl|mutex|exclusive` agent-visible primitive in `src/irc/*`, `tools/wait.ts`, `tools/irc.ts`, `registry/agent-registry.ts` — 2026-10-26 [primary]
