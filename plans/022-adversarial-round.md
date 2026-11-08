# 022 — Adversarial round: five audits, six fix waves

Round after the host re-pin to 18.18.1. Five read-only audits ran in parallel (functional,
UI/TUI, Bun-perf, docs-truth, security); every finding below was re-verified by the orchestrator
against the code or the host source before a fix wave was dispatched, and each fix lands with a
test whose assertion fails when the fix is reverted.

## Findings that were real, and what changed

| # | Audit | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | functional | The host resolves `false` after **queueing** a message into a running turn (`agent-session.ts:10499-10541`), but `sendBounded` mapped `false` to "declined": every mention to a streaming agent was reported as `deliveryError`, left un-given, and re-steered on the next pass | P1 | Any resolution is acceptance; only a rejection or a send-less session means nothing was issued (I11) |
| 2 | functional | An uncertain send (the routine outcome for a live idle recipient, since the host resolves at the END of the target's turn) left T1/T2 owed forever, pinning the owed floor and starving the T1 window | P1 | Issued-but-unconfirmed is GIVEN for every tier: the floor skips it, the cursor does not move, `read` still returns it (I9/I12) |
| 3 | functional | The sweep's promoted `claim` was appended outside any op's batch, so no delivery pass carried it — T1 for followers, delivered to nobody, pinning their cursors (the retention `gap`'s sibling producer) | P1 | The sweep hands the notifier every record it appended; the notifier runs one pass (I13) |
| 4 | functional | Past the T0 ceiling the batch summary was sent but the seqs were not recorded, so the next pass injected all 50+ individually on the serialized delivery chain | P2 | The batched seqs are recorded as given once the summary is issued |
| 5 | functional | `read` spends the per-turn T1 budget, so a second `read` in one turn returns zero records and a `since` hint that cannot work | P2 | queued in the next wave (room.ts owner had it) |
| 6 | functional | The `gen` fence only consults claims the poster still holds, so a reclaimed holder's late write is accepted | P2 | queued in the next wave |
| 7 | functional | `recipients()` keeps parked refs (`session: null`), so each post scans the log for recipients that are then skipped | P2 | queued in the next wave |
| 8 | UI | The chat pane stops following the tail: the clamped selection falls behind and the window pins to it, so newer rows never appear | P1 | follow-tail state, cleared by scrolling away |
| 9 | UI | Narrow layout: `#focus` and `#narrowOpen` disagree, so `r` acts on a hidden board or does nothing | P2 | one source of truth for the rendered pane |
| 10 | UI | The board selection is an index into a re-sorted list: a second `r` can release a claim the user never selected | P2 | selection anchored to the claim's `resource` |
| 11 | UI | `wait_for_claim` registered no card hooks while its summary branch existed — the only wait tool with the host's generic card | P2 | the shared Wait pair is attached |
| 12 | UI | Delivered content (T2 digest line, T0-ceiling/T1-overflow notices) was never rendered — cards only read `details` | P2 | the no-record branch renders the payload body, escaped |
| 13 | UI | On native (TSP) terminals the result facts were dropped by the host merge (`head: callView.head ?? resultView.head`) | P2 | facts ride `tool.meta`/`tool.note`, which the merge spreads |
| 14 | UI | Every successful card printed its summary twice (status line + body row) | P3 | one place only |
| 15 | UI | Card icons were the only unstyled tool icons (`symbol()` instead of `styledSymbol(key, "accent")`) | P3 | styled at every call site |
| 16 | UI | The topic cap counted UTF-16 units, so a wide-character topic passed the cap and could split a surrogate pair | P3 | capped by cells with `truncateToWidth` |
| 17 | UI | The waiter count was the first thing tail truncation ate — the board's whole "who is waiting" signal | P2 | count leads the holder cell |
| 18 | UI | Long leases rendered as a smaller number (`1800 s` → `180…`) | P3 | host `formatDuration` + wider floor |
| 19 | perf | The delivery pass re-filters the whole log per recipient — measured 4.7 ms of synchronous CPU per post at the 5000-record cap with 32 recipients (my own re-measure: 11× on a smaller fixture) | P2 | queued: index the scan from the cursor |
| 20 | perf | `coalescePending` re-scans from seq 0 per recipient — measured 4.4 ms/post | P2 | queued with 19 |
| 21 | perf | `refresh()` projects every record per store event — 2.1 ms at 5000 records, 8.6 ms at max body, against <0.001 ms for just the new rows | P2 | bounded-tail projection (the pane renders a tail) |
| 22 | security | `recall` runs a model-supplied regex on the host's JS thread; the guard misses `(a|aa)+x` and the deadline is checked only between records — **measured 2222 ms for one `test`** on an 8 KB body | P1 | conservative shape filter + bounded per-test slice + deadline before and after each test |
| 23 | security | `read.since` is unbounded and monotonic — one huge value deafens a recipient permanently, survives restart via the persisted cursor | P2 | clamp to `store.seq` |
| 24 | security | The lock reaper treats an empty lock file (another opener mid-create) as stale, so two processes can both become the writer | P2 | atomic create-with-content; mid-create is retried, not reaped |
| 25 | security | For a temp-dir project the write paths follow symlinks (`config.json`, `.lock`, the log) — the delete paths already refuse them | P2 | chain verification + `O_NOFOLLOW` + temp-file rename |
| 26 | security | Cards interpolate `from`/`prevHolder` raw: a log line can paint an OSC sequence in the terminal | P2 | escaped like every neighbouring field, with a hostile-record guard test |
| 27 | security | Replay accepts values the write path clamps (`ttlMs: 1e18` ⇒ a claim that never expires and cannot be released) | P3 | the write-path bounds move into `validateRecord` |
| 28 | security | Only `body` is size-capped; `topic`/`idemKey`/`mention`/`status` are unbounded, and the token budget charges the body only | P3 | per-field caps at write time; budget charges the rendered line |
| 29 | docs | 29 verified-false claims across the six docs (362-test figures, host 18.12.3, nine drifted invariant anchors, two wrong tier tables, a non-existent config layer, a dead doc path) | P2 | all 29 corrected |

## Not fixed here

- Cross-process rooms stay unsupported by design (the single-writer lock refuses the second
  writer); a worker-thread agent is refused with the setting that fixes it.
- The transcript-presenter hook (`pi.registerTranscriptPresenter`, 18.17.0) is available and
  deliberately unused: it is off by default in the host (`extensionRenderers.transcriptPresenters`),
  so adopting it would be inert for most users while changing card rendering.
- Live-only checks stay in `HANDOFF.md` (the 9-agent worker boundary, the chord-conflict notice,
  and the five from earlier rounds).
