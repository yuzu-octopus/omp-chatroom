# omp-agent-notes — docs slice

*Findings for the repo-root `AGENTS.md` ("Repository Guidelines"). Companion slices: `src.md`, `tests.md`,
`config.md`. Every claim carries a `file:line`.*

---

## 1. Corpus map

Three research trees under `docs/research/`. Read the small decision documents first; read the big
ones only via their `file:line` anchors below.

### `docs/research/omp-agent-chatroom/` — the design record

| File | Size / lines | Role |
|---|---|---|
| `PLAN-build.md` | 165.8 KB / 2527 lines | the build-ready plan. **The normative document.** |
| `SCAFFOLD.md` | 97.8 KB / 2368 lines | structural scaffold: every §2.1 file, exports as signatures, full import graph. Historical build input. |
| `REPORT.md` | 34.6 KB | R1 gap analysis. |
| `REPORT-v2-hybrid.md` | — | R2 hybrid design. |
| `REPORT-v3-tree.md` | 221 lines | R4 two-region tree design. |
| `HANDOFF.md` | 102 lines | the post-build handoff. **Current-state entry point.** |
| `brief.md` | 224 lines | the original research brief + Addendum A (hybrid) + Addendum B (tree). |
| `PROBES.md` | 1.6 KB | host-surface probe results. |
| `P6-swarm-verified.md` | 2.6 KB | live 3-gate verification of the built plugin. |
| `room-vs-native.md` | — | the room-vs-native-substrate comparison, written after the build. |
| `findings/F*.md` | — | per-angle evidence. |
| `findings/raw/M*.md` | — | raw worker probes behind the findings. |
| `review/` … `review6/`, `review8/` | — | 7 rounds of adversarial review. There is **no `review7/`** — do not cite it. |

### `docs/research/optmem-2026-10-08/` — the tree/summariser side-research

`CONCLUSION.md` (6.8 KB) is the entry point; `A-merge-order-verification.md` is the document that
stops a specific regression; `E-mistakes-crosscheck.md` is the cross-check of the other track's
mistakes; `optchat-2026-10-08.md` (474 lines) is the saved source spec (UniiChat, renamed from
OptChat) (`optmem-2026-10-08/C-spec-delta.md:1-5`).

### `docs/research/embeddings/` — the retrieval side-research

`CONCLUSION.md` (5.0 KB) is the entry point; `REPORT.md` (345 lines, 53 sources)
(`embeddings/CONCLUSION.md:93`); `brief.md`; `findings/E1`–`E7`, `F1`–`F15`.

---

## 2. Round structure

The corpus is **not linear** — it is research rounds interleaved with review rounds, plus two
side-research tracks that landed after the build. Chronology, with the artifact that closes each
round:

1. **R0 — brief** (`brief.md`, dated 2026-10-06, `brief.md:3`). Nine angles, three researcher
   managers (`brief.md:64-106`). Explicitly *not answerable*: "write the code" (`brief.md:29`).
2. **R1 — `REPORT.md`.** Verdict: build a **narrow claim board, not the room**; the native
   substrate already solves transport, addressing, presence, wake/interrupt semantics
   (`REPORT.md:3-6`, gap enumeration at `REPORT.md:111-133`). Considered-and-rejected table at
   `REPORT.md:96-107`. **Superseded in its recommendation** by R2.
3. **R2 — `REPORT-v2-hybrid.md`** (Addendum A, `brief.md:108-171`). User pushed back: IRC is
   channel **+** DM, not a replacement. Verdict: keep `agent://` intact, add room + board +
   blocking waits (`REPORT-v2-hybrid.md:3-6`). Delivered the routing rule (§A, `:182-215`), the
   three-tool wait surface (§B, `:216-262`), the envelope (§C, `:263-302`), and the attention
   model (§D, `:303-357`).
4. **R3 — `PLAN-build.md` + reviews 1–3 + `SCAFFOLD.md`.** The build-ready plan. Three adversarial
   review rounds hardened it (see §5). Addendum B (`brief.md:173-224`) added the tree and produced
   `REPORT-v3-tree.md`.
5. **R4 — `REPORT-v3-tree.md` + `review4/`.** The two-region store (raw tail R=50 + cold tree over
   `[0, N-R)`, `REPORT-v3-tree.md:3`, `:29-32`), plus eight round-4 lenses that found the
   design-breaking room-id defect and two of the orchestrator's own wrong fixes.
6. **Build — `plugin/**`.** Handoff: "Option B is built, tested, and verified live"
   (`HANDOFF.md:3`), with all gates green (`HANDOFF.md:24-38`).
7. **Post-build — `review5/`, `review6/`.** Implementation review and the wiring audit
   (`review5/CONSOLIDATED.md:1-4`; `review6/wiring.md`).
8. **Side tracks — `optmem-2026-10-08/` and `embeddings/`.** Landed 2026-10-07/09, *after* the
   build, and deliberately changed five constants in `plugin/src/**` (`PLAN-build.md:18-62`).

**Scope decision that is easy to miss:** the plan ships in two options — **Option A** (minimal:
store + claim board + `room` op + digest + routing rule + `wait_for_claim`, 16 source files) and
**Option B** (the full plan: all 12 deliverables, ~35 files), both bounded by the same kill
criteria (`PLAN-build.md:151-199`). **Option B was built** (`HANDOFF.md:42-43`). The user chose;
the plan explicitly left the choice open.

---

## 3. Which document is authoritative for WHAT

| Question | Authoritative source | Notes |
|---|---|---|
| The `room` op table (ops, args, `details` payloads) | `PLAN-build.md` §4.1, `:1152-1258` | 12 ops; the full `RoomParams` Zod shape and every `details` return shape is here |
| The caps / numbers | `PLAN-build.md` §5.2, `:1483-1543` | K, B, N, T, srTCM, retention, R, B, TREE_REC, JOBS, rate, sweep, body cap, digest cap |
| Store schema + log + claims + cursors | `PLAN-build.md` §3, `:549-1054` | §3.2 record schema, §3.4 claim arbiter, §3.5 cursors, §3.6 cold tree |
| Tool result contract (K1) and the rendered `content` line (K17) | `PLAN-build.md` §4.5 / §4.5.1, `:1334-1390` | "It is not advisory: the host validates it" (`:1337`) |
| Delivery + attention | `PLAN-build.md` §5, `:1391-1685` | §5.1 tier classification, §5.2 caps, §5.3 delivery adapter, §5.4 digest |
| Panel UI | `PLAN-build.md` §6, `:1687-1919` | incl. §6.0 the rationale for keeping the panel at all |
| Inline cards | `PLAN-build.md` §7, `:1921-2062` | §7.3 card set, §7.4 IRC-card anatomy |
| The routing rule shipped in the prompt | `PLAN-build.md` §8, `:2064-2108` | ordered, first-match-wins |
| Phases, stop conditions, kill criteria | `PLAN-build.md` §9, `:2110-2313` | §9.0 kill criteria at `:2116-2129` |
| Risks and fallbacks | `PLAN-build.md` §10, `:2315-2354` | R1–R34, each with an evidence line |
| Test plan | `PLAN-build.md` §11, `:2356-2513` | §11.1 harness, §11.2 what each assertion proves |
| Source index (which tag → which file) | `PLAN-build.md` §12, `:2515-2527` | the tag legend |
| **Current state of the build** | `HANDOFF.md` | gates, what runs, known limits, where the evidence is |
| Per-angle evidence | `findings/F*.md` | round 1/2 findings F0–F14; round 3 F15–F19; round 4 tree F20/F21 |
| Host-surface probes | `PROBES.md` | what was executed against the installed host, not just read |
| Decisions that were **rejected** or **refuted** | `review*/CONSOLIDATED.md` | each round keeps a "do NOT act on these" list — read it before re-fixing anything |
| Constants changed **after** the build | `PLAN-build.md:18-62` (dated addenda) + `optmem-2026-10-08/` | see §5 |

**Precedence rule when documents disagree:** the code is the ground truth for behaviour, the dated
addenda in `PLAN-build.md:8-62` are the ground truth for deliberate post-build changes, and the
plan body is a *historical build record* — its prose and line-number citations were correct when
written and are explicitly left untouched where superseded (`PLAN-build.md:60-62`).

---

## 4. Citation tag system

`PLAN-build.md:63-66` states the rule: *"Every non-obvious claim carries a source tag:
`[F15]`…`[F19]`, `[R2]`, `[F0]`, `[F1]`…, `[D5]`, `[D6]`, `[D8]`, or a direct `path:lines`
citation."* The full tag families, and how to trace each:

| Tag | Means | Where it is defined / traced to |
|---|---|---|
| `[F0]` | orchestrator primary verification of the native substrate | `findings/F0-omp-primary-verification.md` (read first by the orchestrator, `:3-6`) |
| `[F1]`–`[F14]` | round-1/round-2 per-angle findings | `PLAN-build.md:2527` maps the range; `findings/F1..F14` |
| `[F15]`–`[F19]` | round-3 findings (packaging, TUI, keybindings, store concurrency, inline rendering) | `PLAN-build.md:2517-2521` |
| `[F20]`, `[F21]` | round-4 tree findings (multi-writer compression; raw-tail/cold-tree boundary) | `findings/F20-multiwriter-compression.md:1-9`, `findings/F21-tree-boundary-cursors.md:1-7` |
| `F20-W1..W4`, `F21-W1..W5` | raw worker probes behind F20/F21 | `findings/raw/`, e.g. `F20-W1.md:1-5` |
| `[R2]`, `[R3]` | the round-2 and round-4 reports | `REPORT-v2-hybrid.md`, `REPORT-v3-tree.md` (`PLAN-build.md:2522-2523`) |
| `[D0]`–`[D8]` | round-4 lens reports | `review4/D1-meta-review.md` (X3/X4/X5, M11), `D2-host-integration.md` (X6), `D4-D7-lenses.md` (M6/M7/M8, M4/M5, M1–M3, M9/M10), `D8-alternatives.md` (X1, X7, M12), `D0-typecheck.md` — mapping at `PLAN-build.md:2524-2526` |
| `[C1]`–`[C9]` | round-3 lenses | `review3/CONSOLIDATED.md:1-5`, `C6-prompt-surface.md`, `C8-misuse.md`, `C9-scaffold-spec.md` |
| `[A1]`–`[A8]`, `[B1]`–`[B8]` | round-1 and round-2 lenses | `review/CONSOLIDATED.md`, `review2/CONSOLIDATED.md` |
| `K<n>` | a **round-3 binding decision** (K1–K22) | the decisions are in `review3/CONSOLIDATED.md:12-93`; the scaffold's conformance table is `SCAFFOLD.md §43` (`:2276-2279`) |
| `[V<n>]` | an **orchestrator-verified** round-3 item | `review3/ORCHESTRATOR-verification.md` (V6–V9, `:1-4`) |
| `X<n>` | a **round-4** critical finding or wrong fix | `review4/CONSOLIDATED.md:14-84` |
| `W<n>` | a finding inside a round-4 lens report | e.g. `review4/D1-meta-review.md:10-56`, `D8-alternatives.md:6-55` |
| `M<n>` | a round-4 scope/decision finding | `review4/D4-D7-lenses.md` (M6/M7/M8, M4/M5, M1–M3, M9/M10), `D1-meta-review.md` (M11) |
| `S1` / `S2` | the two security controls: harness-tag escaping, ANSI sanitisation | `review/CONSOLIDATED.md:18-19` (per `review3/C6-prompt-surface.md:331-334`); applied in `PLAN-build.md` §5.3 at `:1553-1558`, `:1606-1611` |
| `R<n>` | a plan-level risk | `PLAN-build.md` §10, `:2315-2354` (R28–R32 added in later rounds) |
| `[invented]`, `[calibrate]` | confidence markers on a constant: not derived from a source / derived from a measurement | used in `PLAN-build.md` §5.2, e.g. `:1501-1502` |
| `path:lines` | a direct host-source citation | e.g. `pi-agent-core/src/agent-loop.ts:540-562` in `review3/CONSOLIDATED.md:13-14` |

**Grading rule that governs every review round** (worth knowing before you trust a "refuted"
claim): *"A finding is CONFIRMED only if its evidence survives independent verification against
installed source … quote the plan line before refuting it, or it is not a finding"*
(`review2/CONSOLIDATED.md:54-56`; repeated at `review3/CONSOLIDATED.md:100-102`).

---

## 5. How to tell which is current

> ⚠️ **The addenda are themselves now one version behind the code.** `PLAN-build.md` still says
> the host is 18.8.0 and that the room root is `<project cwd>/.omp-room`. Both are superseded:
> the pin is now **18.12.3** and the room root is the **global omp session store**
> (`getSessionsDir()/rooms/<16 hex of the project path>`), with a temp-dir project staying
> project-local and a legacy project-local room migrated once. The plan was not re-edited; the
> **code** and the rewritten root `AGENTS.md` (`AGENTS.md:96-128`) are the authority. Do not quote
> the plan's room-root or host-version lines as current.

Three mechanisms, in order of authority:

1. **Dated addenda at the top of `PLAN-build.md`** (`:8-62`). These are declarations of deliberate
   post-build change and they name the code sites — but see the warning above, they have since
   been overtaken:
   - `:8-16` — **host moved 18.7.0 → 18.8.0**; `engines`/`peerDependencies`, `HOST_VERSION_PIN` and
     `tests/drift.test.ts` moved (commit `7e82134`). Since then the host moved again — twice —
     to **18.12.3**, and the pin moved with it (`AGENTS.md:160-170`).
   - `:18-62` — **five constants and one formula changed after the build**. A reader who trusts the
     body over the code on any of these will be wrong (`:20-21`):
     1. `TREE_REC` 288 → **512** (`plugin/src/store/tree-store.ts:29`)
     2. `COMPACT_MAX_RETRIES` 3 → **5**, with a byte ruler in the prompt
        (`plugin/src/store/compactor.ts:12`, `:20`, `:178`)
     3. the compactor no longer sends its own system prompt (`compactor.ts:26-28`, `:117-124`, `:176`)
     4. the room root is **not** the `local://` root — and is no longer `<project cwd>/.omp-room`
        either: it is the **global omp session store**, with a temp-dir exception and a one-time
        legacy migration (`plugin/src/store/room-root.ts:30-32, 54-57, 77-146`; the plan's
        `:46-49` describes the superseded intermediate state)
     5. the digest rides `BeforeAgentStartEventResult.message`, not the system prompt
        (`plugin/src/onboarding/hook.ts:41-48, 100-108`)
     6. merge age stays `T - lo` — the spec's fix was verified and **rejected** (§6.2)
   - `:55-62` — what was corrected **in place** versus what was left as historical record. The §5.2
     `TREE_REC` row now reads 512 (`:1500-1501`); the other superseded numbers (§3.6 `:571`,
     `:601`, `:883`, `maxTokens: 288` at `:941`, "retry up to 3 times" at `:958`) are body prose
     describing the build as it happened and were left untouched on purpose.
2. **Superseded-by markers inside tables.** The §5.2 caps table annotates the one row that moved
   ("*superseded from 288 by the 2026-10-09 addendum*", `:1500`) — a table reads as current state
   even inside a historical document, which is exactly why that row was fixed in place (`:55-58`).
3. **Review-round "refuted / wrong fix" lists.** If a change you are about to make is listed as
   refuted or wrong, stop and read the reason: `review/CONSOLIDATED.md:6-12` (3 refuted),
   `review2/CONSOLIDATED.md:50-52` (one false negative), `review4/CONSOLIDATED.md:47-67` (three of
   the orchestrator's *own* fixes were wrong: X3, X4, X5), and `optmem-2026-10-08/CONCLUSION.md:30-62`
   (the merge-age fix was rejected).

**Dates, as the fastest currency check:** R1/R2/R3 = 2026-10-06 (`REPORT.md:331`, `brief.md:3`);
round 4 = 2026-10-07 (`review4/CONSOLIDATED.md:3`); `HANDOFF.md` = 2026-10-07 (`:3`);
embeddings = 2026-10-07 (`embeddings/CONCLUSION.md:3`); optmem revision = 2026-10-09
(`optmem-2026-10-08/CONCLUSION.md:3`). The 2026-10-09 addendum (`PLAN-build.md:18`) was the last
substantive change **recorded in the plan** — it is **not** the last change to the delivered code.
Since then the plugin moved to host **18.12.3**, the room root moved into the **global omp
session store** (with a temp-dir exception and a one-time legacy migration), a **single-writer
lockfile** was added, every delivery send became **bounded** (250 ms) because the host's send
resolves at the end of the target's turn, a **cursor floor** was applied to every cursor bump, the
sweep's expiry notice was handed to a **notifier** the main session registers, and the tool's op
switch gained a throw-to-result guard. The rewritten root `AGENTS.md` records all of it
(`AGENTS.md:96-232`); the plan does not.

---

## 6. Two side-research conclusions an assistant MUST NOT contradict

### 6.1 Embeddings are **DEFERRED**, not rejected — with a stated trigger

`embeddings/CONCLUSION.md:7` — *"Defer embeddings. Not rejected — deferred, with the trigger
stated."* The trigger is explicit (`:34-35`):

> **Revisit trigger:** the log growing past ~10⁵ records, or observed "we discussed this but I cannot
> find it" failures in practice. Until one of those happens, regex + (if needed) BM25 is sufficient.

The reasoning an assistant must preserve if it touches retrieval:

- The room's retrieval needs are met by `recall` (~1.7 ms at the 5000-record cap), `zoom`
  (O(1)), `board` (O(1)) and the roster (O(1)) — `embeddings/CONCLUSION.md:11-21`.
- The corpus is tiny (5000 records ≈ 1.6 MiB) and identifier-heavy; dense retrievers lose to
  sparse/lexical on entity-rich queries, with a random-string passage pulled above the relevant
  one for up to 12.08% of questions at 100M docs (`:25-33`).
- If the trigger ever fires, the answer is already chosen: primary `google/embeddinggemma-300m`
  (Path 3, self-hosted OpenAI-compatible endpoint), quality fallback `Qwen/Qwen3-Embedding-0.6B`
  (`:39-45`). jina-v5 is excluded on licence grounds (`:47-48`).
- Constraints recorded for any future build: omp whitelists exactly 7 local models
  (`pi-mnemopi/src/core/embeddings.ts:325-333`, `:72-76`); compare on the live board's
  `Mean (Task)` (`:78-79`); CC-BY-NC models must never rank first (`:80-81`); self-reported card
  scores are not harness-verified scores (`:82-83`); and all latency figures are **derived**, not
  measured (`:84-86`).

**Do not** add an embedding dependency, an embedding-index, or a vector store to the room, and do
not "fix" the identifier-heavy finding by narrowing a regex — that is the stated sufficient path.

### 6.2 The merge-age formula change was verified and **REJECTED**

The UniiChat spec (2026-10-08 revision) says measuring a pair's age from its **first** message is
wrong and that first-based matching holds at only **481 of 20,001** steps. **We did not apply the
fix, because it would make our view worse.**

- The verdict and its reason: `optmem-2026-10-08/A-merge-order-verification.md:8-12` — *"do NOT
  apply the spec's `first` → `last` change. It would make our view worse. The spec is right about
  its own algorithm and wrong about ours."*
- The spec's counterexample is real and reproduces exactly (`:30-43`); the `481/20001` figure
  describes **the spec's own greedy "merge the most-due pair, repeat" loop**, not our `cover()`
  which bisects a single scalar `alpha` (`:46-61`).
- Measured on **our** procedure at the push-exact budget: first-based (what we have, `T - lo`)
  matches Taelin's `push` **140/400**; last-based (the spec's fix) matches **8/400** (`:63-75`).
- The two formulas *do* differ at our budget (5 of 9 sizes tested), so this was a real decision,
  not a no-op (`:63-64`).
- `coverAt` is byte-identical to OptMem's `_cover` (`/tmp/OptMemo/memo:95` per the doc; the plan
  cites `plugin/src/store/tree-store.ts:446`) — a faithful port, not an invention
  (`A-merge-order-verification.md` via `optmem-2026-10-08/CONCLUSION.md:60-62`).
- The plan records the same decision in its addendum, item 6 (`PLAN-build.md:53-60`), *"which
  exists precisely so nobody 'fixes' this again on the strength of the spec's `481/20001` claim"*.
- If merge *order* ever matters, the honest move is to adopt the spec's actual algorithm
  (most-due-pair merge with a persisted view), not to swap one term in a bisection
  (`A-merge-order-verification.md:85-90`).

**Do not** change `alpha * (T - lo)` in `plugin/src/store/tree-store.ts` to `T - (hi - 1)`.

Two further optmem conclusions an assistant should not contradict:

- The digest must not live in the system prompt — it invalidates the prompt-cache prefix every
  turn, and this was the most expensive finding of that round
  (`optmem-2026-10-08/B-cache-economics-multiwriter.md:9-11`; the fix is item 5 at
  `PLAN-build.md:50-52`).
- Constants that transfer from the spec and constants that do not are tabulated, so a constant is
  not "corrected" toward the spec without checking the table
  (`optmem-2026-10-08/D-constants-calibration.md:8-21`): node size 288→512 recalibrated;
  retries 3→5 recalibrated; tool-output clip needs a **separate** bound (8 KB is too small for
  tool output); the byte-based sawtooth does not transfer; JOBS=8 transfers; the compaction view,
  cache blocks and per-day log split are inapplicable.
---

## 7. The root `AGENTS.md` — what it used to say, and what it says now

> **This section is now a historical record.** The root file was *titled* "Repository Guidelines"
> (`AGENTS.md:1`) but was a **design summary** whose "current state" claims were false. It has
> since been **rewritten into a real guidelines document** (233 lines): it now carries the
> authority order, the development commands, the invariants I1-I11, the room-root rules, the
> single-writer lock, the host pin and a live-verification table (`AGENTS.md:1-232`). The table in
> §7.1 is kept as the record of **what was wrong**; the "Current truth" column is the code as it
> stands today, not the file as it stood then.

### 7.1 What it used to say that was false, and what is true now

| `AGENTS.md` claim (pre-rewrite) | Line (pre-rewrite) | Current truth |
|---|---|---|
| "**Current state: documentation only.** There is no `src/`, no `tests/`, no `package.json`, and no build." | `:15-17` | `plugin/src/**` exists — **35** `.ts` files across `store/`, `attention/`, `tools/`, `panel/`, `cards/`, `onboarding/`, `commands/` plus `index.ts`, `version.ts`, `globals.ts`, `ids.ts` — plus **15** test files. "Option B is built, tested, and verified live" (`HANDOFF.md:3`). |
| "Planned layout, from `PLAN-build.md` §2.1 — **none of it exists yet**." | `:73-75` | Same: the layout exists. |
| "**Host: omp 18.6.1**" | `:153` | Superseded three times: 18.7.0 (`PLAN-build.md:3`; the 18.6.1 label was a false claim, `review4/D2-host-integration.md:6-9`), then 18.8.0 (`PLAN-build.md:8-16`), and now the live host and the pin are **18.12.3** (`AGENTS.md:160-166`). |
| "There is no build, lint, or format step, and none is specified." | `:92-93` | `plugin/biome.json` exists and the gates run `bunx --bun @biomejs/biome check src tests` → clean (`AGENTS.md:74-82`). |
| "Framework: `bun:test`. **No linter or formatter is configured.**" | `:163` | Same contradiction. |
| "**State**: one module-level store keyed by the `local://` root" | `:122-123` | Superseded twice: first the room root became `<project cwd>/.omp-room`, then the **global omp session store** — `getSessionsDir()/rooms/<16 hex of the project path>` — with a temp-dir exception and a one-time legacy migration (`AGENTS.md:96-116`). |
| "**Path resolution**: `ctx.localProtocolOptions` when present, else derive from `sessionManager`." | `:126-127` | Superseded by the same change. The room is keyed on `ctx.cwd` and **stored** in the global store; the `local://` root is only the *artifacts* dir. |
| "**Not yet specified** in the plan: `engines`, `dependencies`, `scripts`, `tsconfig.json` contents, CI." | `:154-155` | Specified: manifest at `PLAN-build.md` §2.2 (`:439-519`), `tsconfig.json` at §2.3 (`:520-547`); `plugin/package.json` and `plugin/tsconfig.json` exist. |
| Verdict-history row for R3: "10 phases (P0–P8 + P1b)" | `:21-26` | The plan has **11** phases: P-1, P0, P1, P2, P1b, P3, P4, P5, P6, P7, P8 (`PLAN-build.md:2110-2313`). A8 audited exactly this mismatch (`review/A8-consistency.md:145-154`), and `review2/CONSOLIDATED.md:50-52` records a reviewer's false negative on the same point. |
| "Tool names … separate names, **not one op-dispatched tool**" | `:109-110` | Half-wrong: the three **wait** tools are separate precisely because they are not op-dispatched (`PLAN-build.md:1056-1059`); the **`room`** tool *is* op-dispatched over 12 ops (`PLAN-build.md:1152-1155`). |

### 7.2 What it got right, and what the rewrite carried forward

- The motivation paragraph and the mermaid data-flow diagram — an accurate one-screen summary of
  the architecture. Still in the file (`AGENTS.md:20-44`).
- The three-tier attention table and the caps line — matches `PLAN-build.md` §5.1/§5.2.
- The `customType` namespace, the `<topic>/<key>` resource form, `loadMode:"essential"`, the
  `interruptible` caveat, the `execute` signature, and the K1 result contract with `useless: true`
  — all still correct and operationally useful (`AGENTS.md:160-172`).
- **The probes gotcha and the K1-coercion limit.** This is the single most expensive-to-rediscover
  content in the repo and is not superseded by anything: the K1 coercion lives in the agent loop,
  so a probe that calls `execute()` directly cannot observe it (`PROBES.md:25-27`;
  `PLAN-build.md:2408-2411`).
- The "Open Questions" list — matches the corpus's own unmeasured list and was extended with the
  two optmem items (`optmem-2026-10-08/CONCLUSION.md:105-110`: whether the view should be
  byte-budgeted rather than line-budgeted, and whether a 30k-char tool-output bound is right).

### 7.3 The rewrite that has since happened

The root `AGENTS.md` today **is** a guidelines document — it answers "what do I do and not do
while editing this repo": commands, gates, file ownership, invariants, and a do-not-re-litigate
list (`AGENTS.md:1-232`). It carries the authority order (`AGENTS.md:11-15`), the working
commands (`AGENTS.md:74-82`), the invariants **I1-I11** in a table with enforcement sites
(`AGENTS.md:126-158`), the room-root rules including the temp-dir exception and the legacy
migration (`AGENTS.md:96-116`), the single-writer lock (`AGENTS.md:118-128`), the host pin and
the load-time drift warning (`AGENTS.md:160-170`), the four still-unverified items
(`AGENTS.md:196-199`) and a **live-verification table** against omp 18.12.3 (`AGENTS.md:204-232`).

What a future rewrite must still do:

1. Point at `HANDOFF.md` for current state instead of asserting it.
2. Point at `PLAN-build.md` §4.1 (`:1152-1258`) and §5.2 (`:1483-1543`) for the normative tables
   instead of restating numbers that will drift.
3. Carry a **"do not re-litigate"** list assembled from the review rounds' refuted/wrong-fix
   sections plus the two side-research conclusions in §6 above.
4. Keep the probes gotchas verbatim.
5. Be explicit that the plan body is a historical build record and that the dated addenda
   (`PLAN-build.md:8-62`) win where they conflict — **and** that the addenda themselves are now
   one version behind the code (§5).

---

## 8. Ordered facts for an assistant navigating this record

1. **Read order that avoids 500 KB:** `HANDOFF.md` (102 lines) → `PLAN-build.md:1-62` (the two
   dated addenda + the tag legend) → `PLAN-build.md:2515-2527` (source index) → the one section
   you need. Then `review*/CONSOLIDATED.md` for any decision you are about to change.
2. **Normative hierarchy:** code > dated addenda in the plan > plan body > scaffold > reviews >
   reports. Reviews are normative for *why a change was rejected*, which is what stops you
   re-introducing a fixed bug.
3. **`SCAFFOLD.md` is a build input, not an interface.** It self-describes as a structural
   scaffold with signatures only and `throw new Error("not implemented")` bodies
   (`SCAFFOLD.md:5-15`), derived from the plan at snapshot `[D629]` (`SCAFFOLD.md:5`). Its
   §43 (`:2276-2279`) is the round-3 conformance table. Note its own self-description is stale:
   `review3/C9-scaffold-spec.md:8` calls it "1677 lines"; the file is now 2368 lines after the
   round-4 fixes. Read the code, not the scaffold.
4. **`review6/wiring.md` is the caller table for every exported symbol** and its lesson is the
   one the test suite cannot learn: "a passing test proves a component works, not that anything
   calls it" (`HANDOFF.md:55-70`). Two fully implemented, fully tested components
   (`deliver()` in `attention/delivery.ts` and `startCompactor()` in `store/compactor.ts`) were
   called by nothing; both are now fixed (`HANDOFF.md:57-62`,
   `review6/wiring.md:523-533`, `review6/host.md:9-19`).
   The audit is dated 2026-10-07 (`review6/wiring.md:2`) and states it read "all 24 `.ts` files"
   (`review6/wiring.md:4`); `plugin/src/` now holds **35** `.ts` files, so treat the table as a
   dated snapshot and re-run it for anything added since.
5. **Every review round keeps a "do not act on these" list.** Before changing a design decision,
   check: `review/CONSOLIDATED.md:6-12` (3 refuted), `review4/CONSOLIDATED.md:47-67` (X3/X4/X5 —
   three of the orchestrator's own fixes were wrong), `optmem-2026-10-08/CONCLUSION.md:30-62`
   (the merge-age fix, rejected).
6. **`findings/raw/M*.md` are worker probes; the parent `F*.md` is the adjudicated merge.** Use the
   parent unless you need the raw probe detail (e.g. `findings/F20-multiwriter-compression.md:1-9`
   merges `F20-W1..W4`; `findings/F21-tree-boundary-cursors.md:1-7` merges `F21-W1..W5`).
7. **`PROBES.md` is the executed-evidence file**, separate from the reports: every panel primitive
   the plan names was probed and resolves (`PROBES.md:5-30`), and four host facts were carried
   forward from it (`PROBES.md:31-37`). `P6-swarm-verified.md` is the live three-gate verification
   of the built plugin: plugin loads with zero extension errors, a real claim handoff across two
   sessions in one process, and the drift gate (`P6-swarm-verified.md:5-38`).
8. **`review5/tests.md` is the mutation-testing record** — 12 mutations on the store core, 8
   caught, 5 named load-bearing tests confirmed non-vacuous, and two flakes fixed
   (`review5/tests.md:9-24`). Read it before claiming a test is meaningful.
9. **Kill criteria are decisions, not dashboards** (`PLAN-build.md:2116-2129`): A1 adoption
   (<50% of coordination artifacts to the room → stop the project), A2 wait usage (<50% resolve
   as `event` → cut the wait tools), A3 tree worth (<1 read per 10 sessions or >$5/day → cut the
   tree), A4 board value (no claim in a 20-subagent run → cut the board). A tripped criterion is
   recorded in the README's status section, not absorbed silently (`:2129`).
10. **Known limits that carry forward** (`HANDOFF.md:84-92`, plus what has since changed): mute and
    topic-follow are session-scoped and live only in `MemberState` (only the read cursor persists,
    via `pi.appendEntry`); the room is **one per project** and **one omp PROCESS per project** —
    a second process on the same project now fails loudly with `room file locked by pid N` rather
    than tearing lines (`AGENTS.md:118-128`; `plugin/src/store/log.ts:25-63`); `ctx.signal` does
    not exist, so the panel aborts on `session_shutdown`; the room is **not** a token-cost win —
    its value is correctness; and room message volume has no study behind it, so the design caps
    it rather than proving it helps.
11. **Host citations carry drift, not error.** The 18.7.0→18.8.0 move was verified: all ten deep
    specifiers resolve and the two `.d.ts` deltas are additive; the 18.7.0 citations remain valid
    as *line-number* evidence with +5..+10 drift (`PLAN-build.md:8-16`, and the same note in
    `SCAFFOLD.md:60-66`). Since then the host moved to **18.12.3** and the list shrank to **nine**
    deep specifiers (`plugin/src/version.ts:17-27` — `pi-tui/overlays/agent-hub-renderer` is no
    longer imported). Verify a cited line before relying on its number.
12. **Never present these as settled** (`AGENTS.md:196-201`,
    `optmem-2026-10-08/CONCLUSION.md:105-110`): room message volume as an independent variable,
    whether an agent uses a bounded blocking wait productively, whether a multi-writer log should be
    compressed hierarchically at all, byte- vs line-budgeting the view, and the 30k-char
    tool-output bound. The R1/R2/R3 reports all record the same gap: **no primary source studies
    this design** (`REPORT.md:309-327`, `REPORT-v2-hybrid.md:375-398`).

---

## 9. One-paragraph summary for the guidelines doc

The research record is a six-round build argument (brief → R1 gap analysis → R2 hybrid → R3 plan
hardened by three review rounds → R4 two-region tree with eight lens reviews → live build) plus
two post-build side-research tracks that each produced one binding conclusion. The plan
(`PLAN-build.md`) is normative for the tool surface and the numbers, but it is a **historical
build record** whose dated addenda at `:8-62` override it in six places — and those addenda are
themselves now one version behind the code (§5); the code is normative for behaviour. Review round
"refuted" lists and the two side conclusions — embeddings are **deferred** with a stated trigger
(`embeddings/CONCLUSION.md:7`, `:34-35`), and the spec's merge-age formula change was measured and
**rejected** (`optmem-2026-10-08/A-merge-order-verification.md:8-12`, recorded at
`PLAN-build.md:53-60`) — must not be re-litigated. The root `AGENTS.md` has since been **rewritten
into a real guidelines document** (233 lines): its "documentation only" state claim and its 18.6.1
host pin are gone, and it now carries the authority order, the working commands, the invariants
I1-I11, the **global** room root (with its temp-dir exception and one-time legacy migration), the
**single-writer lockfile**, the **18.12.3** host pin with its load-time warning, the four
still-unverified items, and a live-verification table (`AGENTS.md:1-232`). A future guidelines doc
should still point at `HANDOFF.md` for current state and at `PLAN-build.md` §4.1/§5.2 for the
normative tables rather than restate them.
