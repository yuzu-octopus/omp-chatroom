# B: Cache economics in a multi-writer room

**Question:** Does the prompt-cache economics in the UniiChat spec (§3.3) transfer to our multi-writer room? Is our digest-in-system-prompt design cache-hostile?

**Date:** 2026-10-08

---

## Answer

**Yes, the digest-in-system-prompt design is cache-hostile.** The digest changes every turn (uptime every second, record count on every event, TTL countdowns every second), and because it lives in the system prompt, it invalidates the system-prompt cache prefix for that agent. The spec's cache argument rests on the system prompt never changing — our design violates this.

**The spec's cache numbers are mostly current**, but the "4-line blocks" claim is the spec's own design, not Anthropic's mechanism. Anthropic uses content-block-level breakpoints, not fixed 4-line intervals.

**The cache is per-agent, not shared.** Each agent's digest contains per-agent cursor/lag values, making each agent's system prompt unique. Even with a static digest, agents would not share cache entries.

**A cache-friendly restructure exists:** move the digest out of the system prompt into the user message, per the spec's own §6 rule: "Per-turn state goes AFTER the view, never in the system prompt."

---

## 1. Why the digest-in-system-prompt is cache-hostile

### 1.1 The spec's cache argument

The spec (§3.3) says:

> "Tools and system prompt never change: no dates, no state. They are cached across all calls, turns and compactions alike."

> "Between batches, the view only grows at its end. The last call's whole view is a prefix of the next call's view, so each turn reads it from the cache."

The cache prefix ends at the first changed byte. If the system prompt changes, the entire system-prompt prefix is invalidated — every subsequent token in the input is a cache miss.

### 1.2 How our digest is built

`buildDigest(store, viewer)` (`plugin/src/onboarding/digest.ts:53-125`) is called **every turn** in the `before_agent_start` hook (`plugin/src/onboarding/hook.ts:29-56`):

```typescript
const block = buildPromptBlock(buildDigest(store, viewer));
const systemPrompt = event.systemPrompt.slice();
const injected = systemPrompt.findIndex((part) => part.includes(RULE_HEADING));
if (injected >= 0) systemPrompt[injected] = block;
else systemPrompt.push(block);
```

There is **no caching or memoization** of the digest. It is rebuilt from scratch every turn.

### 1.3 Per-part volatility analysis

| Digest part | Source | Change frequency | Per-agent? |
|---|---|---|---|
| **Header** (`records.length`) | `store.records.length` | On **every** record append | Shared |
| **Header** (`uptimeSec`) | `Math.round((now - first.ts) / 1000)` | **Every second** | Shared |
| **Roster** (`status`) | `ref.status` | On agent state transitions | Shared |
| **Roster** (`cursor`/`lag`) | `cursorFor(store, ref.id)` | On cursor advance | **Per-agent** |
| **Claims** (`left`) | `Math.round((acquiredAt + ttlMs - now) / 1000)` | **Every second** | Shared |
| **Backlog** | `store.records.slice(-50)` | On every record append | Shared |
| **Footer** (`cursor`/`lag`) | `cursorFor(store, viewer.agentId)` | On cursor advance | **Per-agent** |

**Key findings:**

1. **The digest changes every second** — `uptimeSec` and claim TTL countdowns are wall-clock dependent.
2. **The digest changes on every event** — `records.length` and the backlog change on every msg/claim/release/gap.
3. **The digest is per-agent** — the footer contains the viewer's own cursor and lag, making each agent's digest different from every other agent's.
4. **The digest is NOT append-only** — it is a snapshot of current state, not a growing view. The roster re-sorts, claims expire, the backlog slides.

### 1.4 Why this kills the cache

The spec's cache model requires:
1. Static system prompt → **violated** (digest changes every turn)
2. View that grows at its end → **violated** (digest is a snapshot, not append-only)
3. Single writer → **violated** (N agents each have their own cursor and context)

Because the digest is in the system prompt and changes every turn, the system-prompt cache prefix is invalidated for that agent on every turn. The agent pays full price (1.25x) to rewrite the system prompt prefix every turn, instead of reading it from cache (0.1x).

---

## 2. Is the cache shared across agents?

### 2.1 Anthropic's cache model

Anthropic's prompt cache is keyed by content prefix, shared across calls. From the official docs [1]:

> "Cache prefixes are created in the following order: `tools`, `system`, then `messages`."

> "Cache writes happen only at your breakpoint. Marking a block with `cache_control` writes exactly one cache entry: a hash of the prefix ending at that block."

The cache is a hash of the prefix. If two calls have identical prefixes up to a breakpoint, they share a cache entry.

### 2.2 Why agents don't share cache entries

Even if the digest were static, agents would not share system-prompt cache entries because:

1. **The footer is per-agent** — `cursorFor(store, viewer.agentId)` and `lagFor(store, viewer.agentId)` produce different values for each agent.
2. **The roster contains per-agent cursor/lag** — every agent's roster line shows that agent's own cursor and lag.
3. **The backlog may differ** — the backlog is the last 50 records, but the viewer's cursor determines which are "new" (though the digest itself shows the raw backlog, not filtered by cursor).

Each agent's system prompt is unique → each agent's cache entry is unique → no sharing.

### 2.3 The spec's "shared prefix" assumption

The spec assumes a single writer with a single prefix:

> "Every call resends its whole input. The prompt cache charges about 0.1x for a prefix it has seen and 1.25x to write a new one."

In a multi-writer room, there is no single shared prefix. Each agent's context is its own. The spec's cache economics apply per-agent, not globally.

---

## 3. Spec cache numbers: verification against Anthropic's docs

Verified against Anthropic's official prompt caching documentation [1] and Claude Code docs [2], fetched 2026-10-08.

| Spec claim | Status | Anthropic actual | Source |
|---|---|---|---|
| Cache marks in 4-line blocks | **Misleading** | Anthropic uses content-block-level breakpoints (`tools`, `system`, `messages`), not fixed 4-line intervals. The "4-line blocks" is the spec's own design for placing `cache_control` markers. | [1] |
| 20-block lookback | **Confirmed** | "The lookback window is 20 blocks. The system checks at most 20 positions per breakpoint, counting the breakpoint itself as the first." | [1] |
| 5-minute TTL | **Confirmed** | "By default, the cache has a 5-minute lifetime. The cache is refreshed for no additional cost each time the cached content is used." | [1] |
| 0.1x cached / 1.25x new | **Confirmed** | "Cache read tokens are 0.1 times the base input tokens price." "5-minute cache write tokens are 1.25 times the base input tokens price." | [1] |
| 1-hour entries cost 2x | **Confirmed** | "1-hour cache write tokens are 2 times the base input tokens price." | [1] |
| Cache keyed by content prefix | **Confirmed** | "Cache writes happen only at your breakpoint. Marking a block with `cache_control` writes exactly one cache entry: a hash of the prefix ending at that block." | [1] |
| Claude Code uses 1-hour TTL | **Confirmed** | "Claude Code requests the one-hour TTL only on a Claude subscription within your plan's included usage." | [2] |

**Note on pricing:** Some newer models have different cache read multipliers (0.025x on Fable 5.1/Mythos 5.1, 0.05x on Opus 5.5/Sonnet 5.5), but 0.1x is the standard [1].

**Key correction:** The spec's "4-line blocks" is NOT Anthropic's mechanism. The spec conflates its own design decision (how to structure the view content and where to place `cache_control` markers) with Anthropic's cache behavior. Anthropic places breakpoints at content-block level, not at fixed line intervals.

---

## 4. Cache-friendly restructure

### 4.1 The spec's own rule

The spec (§6) says:

> "Per-turn state (date, open devices) goes after the view, never in the system prompt."

Our digest is per-turn state. It should not be in the system prompt.

### 4.2 Concrete restructure

**Move the digest from the system prompt to the user message.**

Current structure:
```
[tools] [system prompt + digest + routing rule] [user message]
```

Proposed structure:
```
[tools] [system prompt + routing rule] [digest] [user message]
```

This way:
- The system prompt (tools + routing rule) is static → cached across all turns.
- The digest is in the user message → it can grow at its end (if designed as append-only) or at least doesn't invalidate the system-prompt cache.
- The user message is per-turn state, exactly where the spec says it belongs.

### 4.3 Additional optimizations

1. **Split the digest into static + volatile parts:**
   - Static: room ID, member count, caps → could go in the system prompt (but member count changes on join/leave, so maybe not).
   - Volatile: uptime, records.length, roster, claims, backlog, cursor/lag → user message.

2. **Make the digest append-only:** Instead of a snapshot that re-sorts and slides, structure it as a growing log that only appends. This matches the spec's "view only grows at its end" requirement.

3. **Remove wall-clock dependencies from the cacheable prefix:** Uptime and TTL countdowns change every second. If they must be in the digest, put them at the END of the user message, after the cacheable prefix.

4. **Per-agent cache isolation is fine:** Each agent's cache entry is independent. The cost is that agents don't share cache entries, but that's inherent to multi-writer. The win is that each agent's own cache entry is stable across turns.

### 4.4 What would NOT work

- **Keeping the digest in the system prompt but making it static:** The digest's purpose is to inform the agent of room state. A static digest defeats the purpose.
- **Caching the digest in the plugin:** The plugin runs in the host process, not in the model's cache. Caching the digest string doesn't help — the model's prompt cache is keyed by content prefix, and if the content changes, the cache misses.

---

## 5. Multi-writer vs. single-writer cache economics

### 5.1 The spec's single-writer assumption

The spec assumes one writer (the user) and one reader (the agent). The view is the only continuity between turns. The cache works because:

1. The system prompt never changes.
2. The view only grows at its end.
3. There is one shared prefix.

### 5.2 Multi-writer reality

In our room:
- N agents each have their own cursor and their own delivered context.
- `notifyRecipients` delivers T0/T1 into each recipient's session via `sendCustomMessage` (`plugin/src/attention/delivery.ts:67`).
- The digest is appended to the system prompt per agent (`plugin/src/onboarding/hook.ts:46-52`).
- There is no single shared prefix.

### 5.3 What transfers and what doesn't

| Spec claim | Transfers? | Why |
|---|---|---|
| Cache prefix ends at first changed byte | **Yes** | Fundamental to Anthropic's cache |
| System prompt should be static | **Yes** | But our digest violates it |
| View should grow at its end | **No** | Our digest is a snapshot, not append-only |
| Single shared prefix | **No** | Each agent has its own context |
| 0.1x/1.25x pricing | **Yes** | Current Anthropic pricing |
| 5-min TTL | **Yes** | Current Anthropic TTL |
| 20-block lookback | **Yes** | Current Anthropic lookback |

---

## 6. Conclusion

1. **The digest-in-system-prompt design is cache-hostile.** The digest changes every turn (uptime every second, record count on every event, TTL countdowns every second), invalidating the system-prompt cache prefix.

2. **The cache is per-agent, not shared.** Each agent's digest contains per-agent cursor/lag values, making each agent's system prompt unique.

3. **The spec's cache numbers are mostly current**, but the "4-line blocks" claim is the spec's own design, not Anthropic's mechanism.

4. **A cache-friendly restructure exists:** move the digest out of the system prompt into the user message, per the spec's own §6 rule.

5. **The spec's cache economics do not directly transfer to a multi-writer room** because the spec assumes a single writer with a single shared prefix. Our room has N agents each with their own context. The per-agent cache economics still apply (each agent's cache can be stable if the system prompt is static), but the global cache sharing the spec assumes does not exist.

---

## Sources

[1] Anthropic, "Prompt caching," https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching, fetched 2026-10-08. [primary]

[2] Anthropic, "Claude Code prompt caching," https://code.claude.com/docs/en/prompt-caching, fetched 2026-10-08. [primary]

[3] `docs/research/optmem-2026-10-08/optchat-2026-10-08.md` §3.3, §6, fetched 2026-10-08. [spec]

[4] `plugin/src/onboarding/digest.ts:53-125`, fetched 2026-10-08. [code]

[5] `plugin/src/onboarding/hook.ts:29-56`, fetched 2026-10-08. [code]

[6] `plugin/src/attention/delivery.ts:43-69`, fetched 2026-10-08. [code]

[7] `plugin/src/store/cursors.ts:1-58`, fetched 2026-10-08. [code]

[8] `plugin/src/store/room-store.ts:14-53,103-189`, fetched 2026-10-08. [code]
