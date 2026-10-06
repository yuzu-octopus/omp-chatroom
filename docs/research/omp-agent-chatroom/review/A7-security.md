# A7 — Security + trust boundaries (adversarial review)

Reviewer: A7 lens (security-reviewer). Target: `PLAN-build.md` (whole), `REPORT-v2-hybrid.md` §C.
Result: **10 findings — 1 critical, 4 high, 3 medium, 1 low, 1 defended.**
Orchestrator adjudication per finding.

## F1 — Prompt injection via room messages · CRITICAL · **CONFIRMED**
`deliver()` passes `record.body` verbatim to `pi.sendMessage` (`PLAN-build.md:603-608`), and
`bodyLines()` renders without escaping (`:817-820`). An agent can forge
`<irc from="parent">` inside a room message.
**Verified defence exists natively and is not reused:** `src/session/irc-bridge.ts:189` calls
`escapeHarnessTags(msg.body)`; implementation `src/session/harness-tags.ts:14-16` escapes `<`
before `irc`/`system-*` tag names, with the docstring naming exactly this attack
("opening a forged one such as a parent's `<irc from="parent">`").
**Fix:** call `escapeHarnessTags` in `deliver()` before `sendMessage`, and in `bodyLines()` per
line. Import from the host; if not public, replicate the regex with a comment naming the source.

## F2 — ANSI escape injection into TUI rendering · HIGH · **CONFIRMED**
Panel chat pane (`:700-710`) and cards (`:817-820`) render body text with only `replaceTabs` and
a width slice.
**Verified:** `@oh-my-pi/pi-utils/src/sanitize-text.ts:23-38` — `sanitizeText()` strips ANSI
(`Bun.stripANSI`) and control chars `[\x00-\x08\x0B-\x1F\x7F-\x9F]`, with a fast path that
returns the input unchanged when clean.
**Fix:** `sanitizeText()` every rendered line in `bodyLines()` and the chat-pane projection.

## F3 — No validation of log records on read · HIGH · **CONFIRMED**
Read policy is `JSON.parse` or stop (`:316-317`); the claim projection replays unvalidated
records (`:330-345`). A record is a trust boundary the moment another agent can write the file.
**Fix:** validate each record against the `RoomRecord` schema on replay (check `v`, `kind`,
per-kind required fields); quarantine failures with a `gap` record `reason:"invalid"`.

## F4 — `from` not explicitly derived from `ctx.agent.id` · HIGH · **CONFIRMED**
Schema carries `from: string` (`:310-314`); §3.4 never states derivation.
**Fix:** state in §3.2/§3.4 that `from` is always `ctx.agent.id` and is never a tool parameter;
add a test that a spoofed `from` is ignored.

## F5 — Retention documented but not enforced · HIGH · **CONFIRMED**
`logMaxRecords`/`logMaxAgeMs` exist as settings (`:155-156`) but no pruning job is specified;
`records: RoomRecord[]` (`:62`) is unbounded; the compactor interval is unspecified (`:360-390`).
**Fix:** specify a pruning job on a fixed interval enforcing both bounds; cap the in-memory
array at `logMaxRecords` (drop oldest, append a `gap` record); state the interval.

## F6 — Path traversal · DEFENDED-ALREADY · **CONFIRMED DEFENDED**
`resolveLocalUrlToPath` → `extractRelativePath` → `validateRelativePath` → `ensureWithinRoot`
(`local-protocol.ts:285-301`; `filesystem-resource.ts:18-40`) rejects absolute paths, `..`
segments, and escapes. **No action.**

## F7 — Cross-agent leakage via digest · MEDIUM · **ACCEPTED (document, don't filter)**
Digest includes roster + claims (`:620-635`). The native peer roster already exposes live peers
to every subagent (`§ Coop`, cap 32), so this is not new disclosure. **Fix:** document the digest
as a coordination aid, not a security boundary; keep the roster cap.

## F8 — Compaction as an attack · MEDIUM · **ACCEPTED (document + strengthen invariant)**
An LLM summariser reads untrusted room text; a false claim can propagate into a summary.
The plan's "raw log is authoritative" invariant contains the blast radius but is not surfaced to
the reader. **Fix:** state in §3.6/§5.4 that cold-tree summaries are advisory; agents verify
against the raw log before acting; consider recording the covered seq range on every node so a
reader can always locate the ground truth.

## F9 — `wait_for_message` `source:"irc"` consumes · DEFENDED-ALREADY · **CONFIRMED DEFENDED**
Already documented as R8 with a fallback. **Note:** A5 finding 3.2 argues for removing `"irc"`
from the v1 enum entirely — stricter, and adopted (see A5 adjudication).

## F10 — `wait_for_claim` livelock under contention · LOW · **ACCEPTED**
Repeated claim/release with short TTLs can starve a waiter.
**Fix:** document it; the bounded timeout already caps the damage; consider `maxWaitMs`.

## Orchestrator summary

- **Apply:** F1, F2, F3, F4, F5 (code-affecting); F7, F8 (documentation); F10 (documentation).
- **No action:** F6, F9 (already defended).
- F1 and F2 are the two that would have shipped a real vulnerability: the native IRC path
  defends both, and the plan silently dropped the defence.
