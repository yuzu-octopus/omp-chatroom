# F21 — Raw-tail + cold-tree boundary and cursor semantics

**Angle 15.** Where does the raw region end and the compressed tree begin? How does a per-agent
cursor map onto tree nodes? What are the exact `zoom` addressing and return semantics? Can a node
be wrong, and how is that detected? What bounds compaction cost, and which invariants hold when a
tree exists alongside an authoritative log? Finally: **can a late joiner be guaranteed a bounded
view?**

**Design under evaluation (brief):** agents read RAW messages normally; a binary tree compresses
only the BACKLOG (cold tail); a late joiner gets a bounded view instead of a `gap` hole. Two
regions: raw hot tail + compressed cold tail + `zoom` to descend.

Fetch date for all items: **2026-10-06** unless stated. Worker raw files:
`findings/F21-W1.md`, `F21-W2.md`, `F21-W3.md`, `F21-W4.md`, `F21-W5.md`.

---

## Angle

Six questions, answered from primary sources only:

1. **Boundary** — what separates raw from compressed, and how does it move? (OptMem source,
   Kafka/NATS retention, omp compaction, PLAN §5.2)
2. **Cursor** — how does a log-sequence cursor map onto a node that covers N messages? (PLAN §3.5,
   OptMem, OptChat, Kafka `__consumer_offsets`)
3. **Zoom** — exact signature, return value, and interaction with the raw tail (OptMem source,
   OptChat gist §7.1)
4. **Invalidation** — can a node be wrong, is the tree content-addressed, how is divergence
   detected? (OptMem `forget` source, Merkle/CRDT literature)
5. **Cost** — how many LLM calls, at what concurrency, and what happens when compaction lags?
6. **Guarantee** — is a late joiner's view provably bounded, and under what invariants?

---

## Claims

### A. Raw-tail boundary — what separates raw from compressed

- **[F21.1]** `RAW_MAX = 16` is **the compression-prompt threshold, not the read boundary.**
  It appears only in `nap_prompt()`, deciding whether a block's *compression prompt* is rendered
  from raw log lines (`log_slice`) or from two half-summaries (`tree_get`). | `/tmp/OptMem/memo:65,464` | primary
- **[F21.2]** In `wake` (the read path) the raw/compressed boundary is **block size 1**. `cmd_wake`
  iterates `cover(T, WAKE_LINES)` and renders `log_get` only when `hi - lo == 1`; every larger
  block renders a tree summary. `RAW_MAX` does not appear in `wake` at all. | `/tmp/OptMem/memo:604-606` | primary
- **[F21.3]** `_cover(T, alpha)` tiles `[0,T)` with aligned power-of-two blocks, keeping a block
  whole iff `size <= alpha * (T - lo)` (its age). Larger alpha = coarser = fewer lines. | `/tmp/OptMem/memo:82-102` | primary
- **[F21.4]** `cover(T, budget)` binary-searches alpha (60 iterations) for the smallest alpha whose
  tiling has ≤ `budget` blocks, then spends leftover budget by repeatedly splitting the **largest
  remaining block** (most recent detail). | `/tmp/OptMem/memo:105-131` | primary
- **[F21.5]** If `T <= budget`, **nothing is compressed** — every memory is a size-1 block. | `/tmp/OptMem/memo:112-113` | primary
- **[F21.6]** `WAKE_LINES = 96` default; `ENTRY_CHARS = 280`; the comment states 96 lines ≈ 8k tokens
  of dense text. | `/tmp/OptMem/memo:50-56` | primary
- **[F21.7]** **Exact tilings computed by running the source algorithm** (`cover(T, 96)`), closing
  the W1 gap:
  | T | blocks | raw singletons (trailing raw tail) | block-size histogram |
  |---|---|---|---|
  | 96 | 96 | 96 | all size 1 |
  | 100 | 96 | 92 | 1×92, 2×4 |
  | 200 | 96 | 50 | 1×50, 2×21, 4×23, 8×2 |
  | 1000 | 96 | 28 | 1×28 … 64×2 |
  | 5000 | 96 | 20 | 1×20, 2×10, 4×10, 8×9, 16×9, 32×9, 64×9, 128×10, 256×10 |
  | 100 000 | 96 | 16 | 1×16 … 8192×6 |
  | 1 000 000 | 96 | 10 | 1×10 … 131072×2 |
  | `eval` re-implementation of `/tmp/OptMem/memo:82-131` | 2026-10-06 | primary |
- **[F21.8]** The **raw tail converges to ~16 messages** at large T with budget 96 (10–16 across
  20k–1M). It is *not* a fixed window: it is whatever the alpha search leaves as singletons. | computed, F21.7 | primary
- **[F21.9]** The boundary is a **sliding window recomputed on every read**: `wake` calls
  `cover(T, WAKE_LINES)` with `T = log_len(d)`, so the tiling (and every threshold) moves as the log
  grows. | `/tmp/OptMem/memo:105-131,584-604` | primary
- **[F21.10]** Kafka retention is time/size based and **ignores consumer position**: `retention.ms`
  default 604800000 (7 d), `retention.bytes` default −1, `cleanup.policy` default `delete`;
  enforced at **whole-segment** granularity (`segment.ms` 604800000, `segment.bytes` 1073741824). | https://kafka.apache.org/42/configuration/topic-configs/ | primary
- **[F21.11]** When a committed offset falls below the partition's log-start-offset (segments
  deleted), the offset is **out of range**; `auto.offset.reset` decides: `earliest` (earliest
  *retained*), `latest` (log end), `none` (throw `OffsetOutOfRangeException`). **Default is
  `latest`.** | https://kafka.apache.org/42/configuration/consumer-configs/ | primary
- **[F21.12]** The Kafka boundary advances in **segment-sized steps**, driven by the log cleaner
  every `log.retention.check.interval.ms` (default 300000 = 5 min), not per message. | https://kafka.apache.org/42/configuration/broker-configs/ | primary
- **[F21.13]** Kafka **does not pin retention to slow consumers**; a committed offset below the
  log-start-offset simply loses those records. The commit and the log-start-offset are independent
  numbers. | https://kafka.apache.org/42/configuration/consumer-configs/ | primary
- **[F21.14]** NATS JetStream: `MaxMsgs`, `MaxBytes`, `MaxAge` all active at once — "whichever one is
  reached first triggers a discard"; `DiscardOld` (default) evicts oldest, `DiscardNew` rejects. | https://docs.nats.io/learn/jetstream/shaping-the-stream | primary
- **[F21.15]** NATS retention policies `Limits` (default), `Interest`, `WorkQueue` — **even Interest
  and WorkQueue still enforce stream limits**, so messages can be removed before acknowledgment. The
  **ack floor tracks progress, it does not pin messages**. | https://docs.nats.io/learn/jetstream/retention-policies | primary
- **[F21.16]** NATS boundary moves **per message** once `MaxMsgs` is reached (`DiscardOld`), or as
  `MaxAge` expires; manual `rmm`/`purge` leave sequence gaps that consumers skip. | https://docs.nats.io/learn/jetstream/altering-stream-state | primary
- **[F21.17]** PLAN §5.2: retention = **5000 records or 7 days, never below `min(cursor)`**; when
  retention must pass the minimum live cursor, append a `gap` record and notify affected agents;
  drop-oldest for the log tail, drop-newest (coalesce) for over-quota producers. | `PLAN-build.md:496,507-509` | primary
- **[F21.18]** omp's compaction boundary is `firstKeptEntryId`: the LLM sees a summary of entries
  before it plus raw entries from it onward. The display transcript keeps every entry; only the LLM
  context resets. | `omp://compaction.md` | primary
- **[F21.19]** `compaction.keepRecentTokens = 20000`; `compaction.reserveTokens` unset by default,
  effective `max(floor(contextWindow × 0.15), 16384)`. | `omp://compaction.md` | primary

### B. Cursor mapping onto tree nodes

- **[F21.20]** PLAN §3.5 defines the cursor as a **log sequence number**, not a tree node ID: "One
  monotonic cursor per agent"; `seq` is "a monotonic counter minted by the store; the file is the
  durable log and `seq` is the cursor unit". | `PLAN-build.md:311-321,225-226` | primary
- **[F21.21]** Cursor **advances on delivery into context**, not on send and not on read — explicitly
  Kafka `enable.auto.commit` semantics; omp has no read receipts. | `PLAN-build.md:314-315` | primary
- **[F21.22]** A **joining** agent starts at `logEnd - 50` (one screen); a **rejoining** agent resumes
  its stored cursor. Session cursor persists via `pi.appendEntry("chatroom:cursor", …)`; sibling
  cursors live in the shared store and are rebuilt from `member`/delivery records on cold start. | `PLAN-build.md:316-320` | primary
- **[F21.23]** Per-agent **lag** = `logEnd - cursor`, exposed by `room{op:"board"}`. | `PLAN-build.md:321` | primary
- **[F21.24]** Cursor → tree node mapping is positional: node `[lo,hi)` contains seq `S` iff
  `lo <= S < hi`. The cursor must **not** be a tree node ID because the tree is derived and
  rebuildable while the cursor must survive tree rebuilds. | [INFERENCE] from F21.20 + OptMem block structure | high
- **[F21.25]** **OptMem has no cursor concept.** `wake` always tiles `[0, T)` from the beginning;
  there is no "read since" parameter. The `T` in `wake [part [T]]` is a **snapshot** parameter
  (render as of T), defaulting to `log_len(d)`. | `/tmp/OptMem/memo:584-596` | primary
- **[F21.26]** OptMem's `cover` **re-tiles from scratch every call** — a full tiling, not a delta.
  OptChat rejected exactly this for cache reasons (§5.3). | `/tmp/OptMem/memo:105-131`; OptChat gist §5.3 | primary
- **[F21.27]** **OptChat has no cursor and no late joiner.** The view is global; at load it is folded
  from message 0 by replaying `append + fit` for every message in order (2,300 messages: 20 ms). A
  **subagent** gets the view at spawn time (after `settle`), as *context only*. | OptChat gist §5.2, §9 | primary
- **[F21.28]** Kafka: a group's committed offset lives as a keyed record in `__consumer_offsets`,
  key = `(group.id, topic, partition)`, value = next offset to read; the coordinator serves reads
  from an in-memory cache rebuilt from the offsets-topic partition. | https://kafka.apache.org/43/implementation/distribution/ | primary
- **[F21.29]** Kafka's offset→data mapping is **two-level**: logical offset → segment (base-offset
  range) → offset index → scan forward to the first record ≥ offset. Offsets are **never renumbered
  or reused**, even after compaction. | https://kafka.apache.org/26/implementation/log/ ; https://kafka.apache.org/41/design/design/ | primary
- **[F21.30]** The chatroom analogue is the same two-level shape: seq → tree node `[lo,hi)` →
  resolution within the node. | [INFERENCE] from F21.24 + F21.29 | medium
- **[F21.31]** Zulip **removed** the global pointer cursor (`last_read_message_id`) in Zulip 3.0
  (feature level 23) in favour of per-message read flags; `anchor=first_unread` is a fetch
  convenience, not a global read cursor. A single monotonic per-user pointer is a design the largest
  production chat system abandoned. | https://docs.zulip.com/api/changelog ; https://dev.zulip.com/api/get-messages | primary
- **[F21.32]** PLAN does **not** specify what happens when a cursor points to a record evicted by
  retention (gap-record interaction), nor a `zoom` op in the `room` op enum
  (`join/read/post/claim/release/board/topics/mute/unmute`). | `PLAN-build.md:371-382,496` | primary

### C. `zoom(lo,hi)` semantics and addressing

- **[F21.33]** **OptMem:** `memo zoom <lo>-<hi>` — one string arg, **inclusive both ends**.
  `block_id()` converts to exclusive (`hi = int(hi)+1`) and validates: `n >= 2`, `n` a power of two,
  `lo % n == 0`. | `/tmp/OptMem/memo:407-418,762-769` | primary
- **[F21.34]** OptMem zoom **opens exactly one level** — a node into its two halves. It does **not**
  recurse. Docstring: "the navigating intelligence is the agent's; the tool only reads." | `/tmp/OptMem/memo:762-765` | primary
- **[F21.35]** OptMem zoom returns two lines: for each half `(a,b)`, if `b-a == 1` the **raw log
  entry** (`#id date text`), else the **tree summary** (`#a-(b-1) summary`) or
  `"not compressed yet"`. | `/tmp/OptMem/memo:774-782` | primary
- **[F21.36]** OptMem zoom boundary handling: `lo >= T` → die "beyond the memory"; a half starting
  `a >= T` is silently skipped ("the future: no memories there yet"). | `/tmp/OptMem/memo:770-777` | primary
- **[F21.37]** **OptChat:** `zoom(id, n)` — two args; `id` = first message (must satisfy `id % n == 0`),
  `n` = span = `2^l` (power of two), `id + n <= T`. | OptChat gist §7.1 | primary
- **[F21.38]** OptChat zoom returns: `n == 1` → the **whole message** `id+0|kind: text` (newlines
  kept); `n > 1` → the **two children lines** `id+n|text`; invalid → `"No line id+n."`. | OptChat gist §7.1 | primary
- **[F21.39]** Children always exist at zoom time because a parent is built only after its children
  (compactor ordering rule 2). Zooming to a raw message takes `log2(n)` calls; "in practice the agent
  finds things in 3-5". | OptChat gist §7.1, §4.1 | primary
- **[F21.40]** **Neither system returns a sub-tree** — both return exactly one level. This preserves
  the agent's choice of branch and bounds the output. | [INFERENCE] from F21.34 + F21.38 | high
- **[F21.41]** `zoom` is a **pure read** in both systems: it does not re-run `cover`/`wake` (OptMem)
  or `fit` (OptChat), and does not modify the view. | `/tmp/OptMem/memo:762-782`; OptChat gist §5.2, §7.1 | primary
- **[F21.42]** `(lo,hi)` and `(id,n)` are **equivalent** (`lo = id`, `hi = id+n`); both require
  alignment validation. OptMem's form matches its `#lo-hi` wake output; OptChat's `id+n` matches its
  rendered view. | [INFERENCE] from F21.33 + F21.37 | high
- **[F21.43]** Zoom **can mix raw and compressed in one call**: a size->2 block's two halves may be
  one raw singleton and one summary; each half is checked independently. | `/tmp/OptMem/memo:775-782`; OptChat gist §7.1 | primary
- **[F21.44]** Zoom on an **unbuilt** node: OptMem prints `"not compressed yet"` (agent must `nap`);
  OptChat cannot happen by construction (a parent enters the view only once built). | `/tmp/OptMem/memo:781-782`; OptChat gist §5.2 | primary
- **[F21.45]** OptMem **cannot zoom a single memory** (`block_id` requires `n >= 2`); OptChat
  `zoom(id,1)` **is** the raw-message case and the most common target. | `/tmp/OptMem/memo:411-417`; OptChat gist §7.1 | primary

### D. Invalidation and divergence

- **[F21.46]** OptMem `forget <lo>-<hi>` → `tree_drop`: iterate `size` from `hi-lo` upward while
  `size <= log_len(d)`, truncating `TREE/<size>` at `k * TREE_REC` where `k = lo // size`. This drops
  the target block **and every block built from it** at all higher levels. | `/tmp/OptMem/memo:372-389,718-728` | primary
- **[F21.47]** **The log is never touched by `forget`** — "The log is untouched, so nothing is ever
  actually lost." Rebuild is by `nap`, in order, smallest first (`pending()` walks sizes 2,4,8…). | `/tmp/OptMem/memo:373-375,437-449,727-728` | primary
- **[F21.48]** `tree_put` refuses an out-of-order write: it returns `False` if
  `count(p, TREE_REC) != lo // size`, i.e. blocks must be built as a dense prefix per level. | `/tmp/OptMem/memo:353-369` | primary
- **[F21.49]** **Neither system is content-addressed.** OptMem: "position IS identity" (offset in a
  fixed-width file); OptChat: node named `(l,i)` / `id+n`. No hash of children anywhere. | `/tmp/OptMem/memo:68-73,279-292`; OptChat gist §3 | primary
- **[F21.50]** **Neither system detects divergence.** OptMem serializes all writes with a lock
  (`fcntl.flock` / `msvcrt.locking`) but performs no validation that a summary is correct; OptChat
  has a single-writer process lock ("two processes on the same chat would corrupt it") and a `busy`
  set preventing concurrent builds of the same node. | `/tmp/OptMem/memo:302-332`; OptChat gist §2, §4.1 | primary
- **[F21.51]** The only validation present: OptMem treats a **blank** summary record as corrupt
  ("The summary of #lo-hi is corrupt. Run: memo forget") and detects a missing child at build time;
  OptChat validates **size only** (TRIES=5 to get under NODE=512, keep shortest try). Neither
  validates semantic faithfulness. | `/tmp/OptMem/memo:288-292,469-475`; OptChat gist §4.3 | primary
- **[F21.52]** Merkle trees **detect where** replicas differ (root hash → descend mismatching
  branches → skip matching subtrees) but do **not** resolve: resolution needs a separate conflict
  policy (LWW, version vectors, CRDT merge, manual). The DAG supplies neither causality nor a merge
  rule. | https://arxiv.org/abs/2004.00107 ; https://people.eecs.berkeley.edu/~kubitron/courses/cs262a-F21/handouts/papers/decandia07dynamo.pdf | primary
- **[F21.53]** CRDT guidance for concurrent compaction: give nodes **stable IDs**, track causality
  (version vectors/dots), treat compaction as a **representation rewrite** that preserves logical
  identity, and reclaim history only against a **stable frontier/epoch** acknowledged by every
  replica still allowed to write. A deterministic merge does not prove semantic compatibility. | https://github.com/marcschier/crdt/blob/main/docs/architecture.md ; https://github.com/anyproto/any-sync-sdk/blob/main/docs/crdt-spec.md | primary
- **[F21.54]** An offline replica that may return indefinitely makes safe reclamation impossible
  without a bound (lease, epoch, or explicit resync). | https://yorkie.dev/docs/internals/crdt-concepts | primary
- **[F21.55]** **Single-writer compaction eliminates divergence by construction.** OptMem already
  forbids subagents from running `memo` ("it cannot judge what is already known"); a room with one
  compaction service and read-only agents has exactly one writer of tree nodes. | `/tmp/OptMem/memo:536-541` + [INFERENCE] | medium
- **[F21.56]** **OptChat has no `forget` equivalent** — no documented way to invalidate a bad node
  short of manual file editing. | OptChat gist (whole spec) | primary

### E. Cost budget and invariants

- **[F21.57]** OptMem: **one LLM call per block (nap)**, performed by the agent itself; nothing runs
  in the background. Total blocks over N memories ≤ 2N (binary tree over N leaves has N−1 internal
  nodes). Input ≤ ~16 raw memories or 2 summaries; output ≤ 280 bytes. | `/tmp/OptMem/memo:463-494,666-692` | primary
- **[F21.58]** OptMem compaction is **on the agent's critical path**: `note` and `wake` print the nap
  prompt, and the template says do it "before your next action". | `/tmp/OptMem/memo:523,654-663` | primary
- **[F21.59]** OptChat: **~2 compactor calls per message amortized** (one compress + one merge);
  each call carries ~64k tokens of **cached** `<chat>` context; output ≤ 512 bytes. Reference uses a
  cheap model (Claude Sonnet, medium effort). | OptChat gist §4.2, §10 | primary
- **[F21.60]** OptChat **free nodes** cost nothing: if the source already fits NODE bytes it *is* the
  node (level 0 short message verbatim; level > 0 if `childA + "\n" + childB` fits). | OptChat gist §3 | primary
- **[F21.61]** OptChat `JOBS = 8` concurrent compactors; `TRIES = 5`; `RETRY = 10 s` with retry
  forever, first failure reported once. No exponential backoff, because the next turn waits. | OptChat gist §1, §4.1 | primary
- **[F21.62]** **Degradation when compaction lags:** OptMem `wake` **exits 1** ("Cannot wake: the
  memory context needs #lo-hi, which is not compressed yet") and prints the nap prompt; OptChat
  `settle()` **blocks the turn loop** until every view part is built (cancelable). Both refuse to
  show partial text: "Never show cut text." | `/tmp/OptMem/memo:609-622`; OptChat gist §5.3, §6 | primary
- **[F21.63]** OptChat's view may **temporarily exceed** VIEW bytes when no parent is built
  (`fit()` breaks); in practice the compactor keeps up in seconds. | OptChat gist §5.2 | primary
- **[F21.64]** **No max-spend cap in any of the three systems** (OptMem, OptChat, omp). Bounds are
  structural only: WAKE_LINES/ENTRY_CHARS (OptMem), VIEW/NODE/JOBS (OptChat), reserveTokens/
  keepRecentTokens/methodOrder (omp). | `/tmp/OptMem/memo:50-65`; OptChat gist §1; `omp://compaction.md` | primary
- **[F21.65]** omp tries cheapest methods first: `["remote","snapcompact","handoff","shake","soft"]`;
  snapcompact (deterministic PNG archival) and shake (artifact references) cost **no LLM call**. | `omp://compaction.md` | primary
- **[F21.66]** omp hides compaction latency with **speculative async compaction** in the
  pre-threshold band `[threshold − lead, threshold)`, `lead = clamp(threshold × 0.125, 8192, 32000)`;
  the armed result commits instantly when the threshold is crossed. | `omp://compaction.md` | primary
- **[F21.67]** **Invariant: the tree is rebuildable from the log.** OptMem: "The tree is a cache in
  principle (rebuildable from the log), but it costs model calls to rebuild, so it is stored and
  never recomputed." | OptChat gist §2 | primary
- **[F21.68]** **Invariant: the raw log stays authoritative.** "Never edit or delete anything in
  these files. The log is history." `tree_drop` truncates tree files only. | OptChat gist §2; `/tmp/OptMem/memo:372-389` | primary
- **[F21.69]** **Gap semantics with a tree present** (PLAN): a `gap` record
  `{kind:"gap", skipped:N, reason:"retention"}` preserves the fact of the hole. A tree node whose
  source range was dropped is invalidated and rebuilt from the remaining log; the gap is a **cache
  miss on the log**, not data loss. | `PLAN-build.md:219,496,507-509` + [INFERENCE] | medium
- **[F21.70]** omp has **no explicit gap record** — the compaction summary *is* the record
  (`CompactionEntry` with `firstKeptEntryId`, `tokensBefore`, `tokensAfter`). | `omp://compaction.md` | primary
- **[F21.71]** Right concurrency (inference): `JOBS >= message_rate × avg_compactor_latency`.
  At PLAN's 1 post / 2 s per agent, 10 agents ≈ 5 posts/s ≈ 10 calls/s, which **saturates JOBS=8**
  at 1–2 s per call; 100 agents need ≈ 50 jobs. JOBS depends on message rate, not agent count. | [INFERENCE] from OptChat gist §1, §4.1 + `PLAN-build.md:493` | medium

### F. Synthesis — is the late joiner's view guaranteed bounded?

- **[F21.72]** **Yes, structurally, independent of log length.** With a raw region of R messages and
  a cold tree tiled at B lines, the view is `R + min(B, N−R)` lines. Verified by running `cover()`
  over cold ranges:
  | R | B | N=100 | N=5 000 | N=100 000 | N=1 000 000 |
  |---|---|---|---|---|---|
  | 16 | 96 | 100 | 112 | 112 | 112 |
  | 50 | 96 | 100 | 146 | 146 | 146 |
  The count is **constant once N−R ≥ B**; it never grows with history. | computed, `eval` re-implementation of `/tmp/OptMem/memo:105-131` | primary
- **[F21.73]** OptMem's own `cover` gives the same guarantee in the single-region form: 96 blocks at
  T=5000, T=100 000, and T=1 000 000 alike (F21.7). | computed | primary
- **[F21.74]** **The raw region needs no tree, so the two-region design escapes OptChat's `settle()`
  block.** In OptChat every turn waits for all view parts; in the two-region design an agent reading
  the raw tail never waits for a compactor, so "no agent blocked on compaction" holds for the hot
  path. Only the *cold* view (a late joiner's backlog, or an explicit `zoom` into cold) depends on
  the tree, and a gap/partial view there is acceptable. | [INFERENCE] from OptChat gist §6 + brief | medium
- **[F21.75]** **The two-region design deliberately does what OptChat lists as mistake #2**
  ("Showing recent messages whole ... breaks everything"). OptChat's reasoning: a message can be any
  size, so one 30 KB tool output in the view forces dozens of merges among old lines that are never
  split back, permanently erasing old detail. **Resolution:** the raw tail is a *separate region*,
  sized in **messages** (R), not part of `fit()`'s byte budget; `fit()` runs only over the cold
  region `[0, N−R)`. A big raw message therefore cannot force a cold merge *while it is raw*; it
  only enters the cold tree once it ages past R, at which point the damage is bounded to the aging
  window rather than being able to reach arbitrarily far back. This is a real structural difference
  from OptChat's single byte-budgeted view, but it is a **mitigation, not a proof** — a run of large
  messages crossing the R boundary still forces cold merges. | OptChat gist §5.3 + [INFERENCE] | medium
- **[F21.76]** **The bounded view requires the cold tree to be built ahead of the joiner.** If the
  cold tree has unbuilt nodes in the tiling, the joiner sees `(not summarized yet)` / a nap prompt
  (OptMem) or waits (OptChat). The guarantee is therefore *conditional* on the compactor keeping
  pace; the fallback that makes it unconditional is the **gap record + raw-log read**, which the
  PLAN already specifies. | `/tmp/OptMem/memo:609-622`; OptChat gist §6; `PLAN-build.md:219` | medium

---

## Searches

- `Kafka log retention consumer offset out of range deleted segment auto.offset.reset`
- `Kafka consumer group offset deleted segment log retention offset out of range`
- `Kafka consumer group offset log segment mapping __consumer_offsets committed offset resolution`
- `Kafka log compaction tombstone delete semantics offset preserved null value`
- `NATS JetStream message retention MaxMsgs MaxAge consumer ack floor deleted messages`
- `NATS JetStream MaxMsgs MaxAge consumer ack floor below retained window behavior`
- `Zulip read state last_read_message_id unread pointer API semantics`
- `CRDT tree structure invalidation divergence detection multi-writer concurrent compaction`
- `Merkle tree content-addressed hash children divergence detection resolution`
- `Merkle tree divergence detection resolution distributed systems`
- `CRDT tree concurrent compaction conflict resolution last-writer-wins version vector`
- `content-addressed Merkle tree hash children divergence detection git IPLD`
- `VictorTaelin OptChat gist zoom id n tree view`
- Read: `/tmp/OptMem/memo` (859 lines, complete source), `/tmp/OptMem/README.md`,
  `https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449` (798 lines, complete spec),
  `omp://compaction.md`, `PLAN-build.md`, `brief.md`, `findings/F7`, `F10`, `F13`, `F18`.
- `eval`: re-implementation of `_cover`/`cover` from `/tmp/OptMem/memo:82-131`; ran exact tilings at
  T ∈ {96, 97, 100, 200, 500, 1000, 2000, 4096, 4097, 5000, 8000, 20 000, 50 000, 100 000, 1 000 000}
  and two-region `R + cover(N−R, B)` for R ∈ {16, 50}, B ∈ {64, 96}.

---

## Conflicting evidence

1. **`RAW_MAX = 16` is widely described as the raw/compressed boundary; it is not.**
   It governs only the *compression prompt* (what the LLM sees when building a node). The *read*
   boundary in `wake` is block size 1, and it varies with T (F21.1, F21.2, F21.8). Any design that
   sets the raw tail to "16 messages" by citing RAW_MAX is citing the wrong constant.

2. **OptMem's raw tail is not a fixed window.** It is ~92 at T=100, 28 at T=1000, 20 at T=5000,
   16 at T=100 000, 10 at T=1M (budget 96). A design that wants a *stable* R must fix R explicitly
   rather than inherit `cover`'s alpha-search output (F21.7, F21.8).

3. **OptMem blocks the agent on compaction; OptChat blocks the turn loop; the two-region design
   blocks neither** for hot reads (F21.62, F21.74). This is the strongest argument for the
   two-region shape and the clearest departure from both prior systems.

4. **OptChat explicitly rejects "showing recent messages whole" (mistake #2); the design under
   evaluation does exactly that.** Resolution proposed in F21.75: size the raw region in messages,
   not bytes, and keep it out of `fit()`'s budget. Recorded as a live tension, not smoothed over.

5. **Kafka `auto.offset.reset` defaults to `latest`; the PLAN's rule is the opposite.**
   `latest` means a late joiner silently skips retained backlog. PLAN's "never below `min(cursor)`"
   + gap record is a deliberate departure (F21.11, F21.17).

6. **NATS `LimitsPolicy` (default) does not protect slow consumers** — the ack floor does not pin
   messages. PLAN's "never silently below the minimum live cursor" is a layer *above* NATS-style
   retention, not a NATS feature (F21.15, F21.17).

7. **Zulip abandoned the single monotonic read pointer** in favour of per-message flags (F21.31).
   PLAN's per-agent monotonic cursor is the simpler design but is the one the largest production
   chat system moved away from — worth noting because PLAN cites Zulip elsewhere for caps.

8. **OptChat "never recomputes" the tree; OptMem's `forget`+`nap` is a routine rebuild path.**
   Resolution: OptMem's summaries are cheap (small input, 280-byte output); OptChat's are expensive
   (64k-token cached context per call). Rebuild cost, not correctness, drives the difference
   (F21.48, F21.56, F21.59).

9. **"Nothing is ever deleted" (OptMem X post) vs the `forget` command.** Resolution: the **log** is
   never deleted; only summaries. Summaries are a rebuildable cache (F21.47, F21.68).

10. **Kafka offsets are never renumbered after compaction** (tombstones preserve position, leaving
    gaps) — a useful precedent for the PLAN's `skipped: N` gap record, which likewise preserves
    sequence identity across a hole (F21.29, F21.69).

---

## Gaps

1. **No primary source measures OptMem `cover()` output at any T** — the tilings in F21.7 are from a
   faithful re-implementation of the algorithm, not from running the shipped tool on a real log.
2. **No cost measurement for OptMem/OptChat with real LLMs.** "~2 calls per message" is a spec
   figure, not a benchmark; free nodes make the true count lower and unquantified.
3. **No multi-agent OptMem/OptChat testing.** Both are single-writer designs; a shared-room
   summary tree is untested anywhere (also F21.55, F21.56).
4. **No formula for `JOBS` from message rate.** F21.71's `JOBS >= rate × latency` is an inference
   with no empirical calibration, and no measurement of compaction latency's effect on a room's
   real-time expectations.
5. **Gap-record ↔ tree interaction is inferred, not specified.** PLAN says to append a `gap` record;
   it does not say what happens to cold-tree nodes whose source range was dropped (F21.69).
6. **PLAN specifies no `zoom` op** and no retention-eviction behaviour for a cursor pointing into a
   dropped range (F21.32). The whole cold-tree read surface is undesigned.
7. **PLAN does not specify how the chatroom's tree is built** (lazy nap vs background compactor) nor
   the late joiner's initial *tree* view (`logEnd-50` is a log seq; its tiling depends on tree state).
8. **No max-spend cap in any system** (F21.64). A room running for days accumulates unbounded
   compaction cost.
9. **No semantic validation of summaries anywhere.** A hallucinating or over-lossy summary is
   indistinguishable from a good one without external judgment (F21.51). Content-addressing would
   detect *change*, not *quality* (F21.52).
10. **CRDT/Merkle literature does not cover summary trees.** CRDTs address concurrent edits to a
    document, not concurrent *compaction* (a many-to-one merge). No primary source exists for
    multi-agent summary-tree divergence — an open research question (F21.52–F21.54).
11. **`RAW_MAX=16` and `WAKE_LINES=96` have no documented rationale** for the ratio; the source has
    no comment explaining either value.
12. **The two-region view bound (F21.72) assumes the cold tree is fully built.** Under lag the
    guarantee degrades to a nap prompt (OptMem), a wait (OptChat), or a gap record (PLAN) — the
    unconditional fallback path is specified but untested.
