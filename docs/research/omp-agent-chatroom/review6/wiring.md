# Wiring Audit — `plugin/src/**` (Option B)

**Date:** 2026-10-07
**Scope:** Every exported symbol in `plugin/src/**` — is it reachable from a production path?
**Method:** Full source read of all 24 `.ts` files; grep for every exported symbol across `src/` and `tests/`; trace from `index.ts` forward.

---

## 1. Caller table — exported symbols and their production callers

### `index.ts`
| Symbol | Production callers |
|---|---|
| `roomExtension` (default) | Extension host (external) |
| `__roomTest` | Test-only seam (exported for tests) |

### `store/room-store.ts`
| Symbol | Production callers |
|---|---|
| `roomStoreFor` | `tools/room.ts`, `tools/wait-for-message.ts`, `tools/wait-for-claim.ts`, `commands/room-command.ts`, `onboarding/hook.ts`, `attention/delivery.ts` |
| `storeFor` | `roomStoreFor` (internal) |
| `disposeRoomSession` | `onboarding/hook.ts` (session_shutdown) |
| `resetRoomStores` | `__roomTest` (test seam) |
| `enforceRetention` | `roomTimers.start` (interval), `startPruneJob` (dead) |
| `startPruneJob` | **NONE** |
| `startClaimSweep` | **NONE** |
| `roomTimers` | `roomStoreFor`, `dispose`, `resetRoomStores` |
| `claimSweeper` | `dispose`, `resetRoomStores` (stop only); **start never called** |
| `LOG_MAX_RECORDS` | `enforceRetention` |
| `LOG_MAX_AGE_MS` | `enforceRetention` |
| `PRUNE_INTERVAL_MS` | `roomTimers.start`, `startPruneJob` (dead) |
| `CLAIM_SWEEP_INTERVAL_MS` | `roomTimers.start`, `startClaimSweep` (dead), `claimSweeper.start` (dead) |
| `RoomStoreOptions` | **NONE** (exported, never imported) |

### `store/compactor.ts`
| Symbol | Production callers |
|---|---|
| `startCompactor` | `roomStoreFor` (room-store.ts:222) |
| `stopCompactor` | `dispose`, `resetRoomStores` |
| `compactOnce` | `runJobs` (internal) |
| `summarizeBlock` | `compactOnce` (internal) |
| `withWriteMutex` | `compactOnce` (internal) |
| `compactionSpendToday` | **NONE** (test seam only) |
| `__compactTest` | Test-only seam |
| `COMPACT_JOBS` | `runJobs` (internal) |
| `COMPACT_MAX_CALLS_PER_DAY` | `atCap` (internal) |
| `SUMMARY_MAX_BYTES` | **NONE** (exported, never used) |
| `COMPACT_INTERVAL_MS` | `startCompactor` |
| `COMPACT_MAX_RETRIES` | `summarizeBlock` (internal) |

### `store/tree-store.ts`
| Symbol | Production callers |
|---|---|
| `openTreeStore` | `compactor.ts` (internal) |
| `validateZoomRange` | **NONE** (test only) |
| `zoom` | **NONE** (test only) |
| `TREE_REC` | `compactor.ts` |
| `RAW_MAX` | `compactor.ts` |
| `COVER_BUDGET_LINES` | **NONE** (exported, never used) |
| `RAW_TAIL_R` | **NONE** (exported, never used) |

### `store/claims.ts`
| Symbol | Production callers |
|---|---|
| `grant` | `tools/room.ts`, `commands/room-command.ts` |
| `release` | `tools/room.ts`, `commands/room-command.ts` |
| `reclaimIfStale` | `tools/room.ts`, `commands/room-command.ts` |
| `contended` | `tools/room.ts`, `commands/room-command.ts`, `panel/board-pane.ts` |
| `expireStale` | `roomTimers.start`, `claimSweeper.start` (dead), `startClaimSweep` (dead) |
| `hydrateClaims` | `createStore` (internal) |
| `enqueueWaiter` | `tools/wait-for-claim.ts` |
| `dequeueWaiter` | `tools/wait-for-claim.ts` |
| `requeueWaiter` | `tools/wait-for-claim.ts` |
| `resolveWaiters` | `tools/wait-for-claim.ts`, `claims.ts` (internal) |

### `store/cursors.ts`
| Symbol | Production callers |
|---|---|
| `initCursor` | `onboarding/hook.ts`, `tools/room.ts`, `commands/room-command.ts` |
| `cursorFor` | `tools/room.ts`, `commands/room-command.ts`, `panel/board-pane.ts`, `panel/chat-pane.ts`, `onboarding/digest.ts`, `attention/governor.ts` |
| `bumpCursor` | `tools/room.ts`, `attention/delivery.ts` |
| `lagFor` | `tools/room.ts`, `commands/room-command.ts`, `onboarding/digest.ts` |
| `persistOwnCursor` | `onboarding/hook.ts` |
| `restoreOwnCursor` | **NONE** (test only) |
| `JOIN_BACKLOG` | `initCursor` |
| `OWN_CURSOR_ENTRY_TYPE` | `persistOwnCursor` |

### `store/log.ts`
| Symbol | Production callers |
|---|---|
| `roomLogFd` | `openRoomLog` (internal) |
| `appendLine` | `room-store.ts` (append) |
| `readSince` | **NONE** (test only) |
| `replay` | `createStore` (internal) |
| `closeRoomLog` | `dispose`, `resetRoomStores` |
| `validateRecord` | `replay` (internal) |
| `openRoomLog` | `createStore` (internal) |
| `LOG_VALIDATION_FIELDS` | `validateRecord` (internal) |

### `store/config.ts`
| Symbol | Production callers |
|---|---|
| `registerRoomFlags` | `index.ts` (no-op by design) |
| `resolveRoomConfig` | `tools/room.ts`, `tools/wait-for-claim.ts`, `commands/room-command.ts` |
| `loadRoomConfig` | `resolveRoomConfig`, `resolveRoomId`, `commands/room-command.ts` |
| `saveRoomConfig` | `resolveRoomId`, `commands/room-command.ts` |
| `resolveRoomId` | `room-store.ts` (internal) |
| `configPath` | `loadRoomConfig`, `saveRoomConfig`, `commands/room-command.ts` |
| `DEFAULT_ROOM_CONFIG` | `coerceConfig`, `onboarding/digest.ts` |

### `store/schema.ts`
| Symbol | Production callers |
|---|---|
| All types | Used across the plugin (type-only) |

### `attention/tiers.ts`
| Symbol | Production callers |
|---|---|
| `classify` | `tools/room.ts`, `attention/governor.ts`, `panel/chat-pane.ts` |
| `HELD_CLAIM_WINDOW_MS` | **NONE** (test only) |

### `attention/governor.ts`
| Symbol | Production callers |
|---|---|
| `selectT0` | **NONE** (test only) |
| `admitPost` | `tools/room.ts` (notifyRecipients) |
| `selectT1` | `tools/room.ts` (t1Admitted) |
| `coalescePending` | **NONE** (test only) |
| `isMuted` | `tools/room.ts`, `attention/governor.ts` (internal) |
| `muteTopic` | **NONE** (test only) |
| `unmuteTopic` | **NONE** (test only) |
| `muteRoom` | **NONE** (test only) |
| `unmuteRoom` | **NONE** (test only) |
| `unreadCounts` | **NONE** (test only) |
| `noteGap` | **NONE** (test only) |
| `truncateOversized` | **NONE** (test only) |
| `DEFAULT_CAPS` | `attention/governor.ts` (internal) |
| `T0_COALESCE_CEILING` | `selectT0` (internal) |

### `attention/delivery.ts`
| Symbol | Production callers |
|---|---|
| `deliver` | `tools/room.ts` (notifyRecipients) |
| `roomBodyOf` | `attention/governor.ts` (internal) |
| `renderLine` | `deliver` (internal) |
| `escapeForDelivery` | `deliver` (internal) |

### `tools/room.ts`
| Symbol | Production callers |
|---|---|
| `registerRoomTool` | `index.ts` |
| `ROOM_TOOL_NAME` | Internal |
| `ROOM_DESCRIPTION` | Internal |
| `ROOM_LOAD_MODE` | Internal |
| `READ_LIMIT_DEFAULT` | Internal |
| `READ_LIMIT_MAX` | Internal |
| `RECALL_LIMIT_MAX` | **NONE** (exported, never used) |

### `tools/wait-for-agent.ts`
| Symbol | Production callers |
|---|---|
| `registerWaitForAgent` | `index.ts` |
| `WAIT_FOR_AGENT_NAME` | Internal |
| `WAIT_FOR_AGENT_DESCRIPTION` | Internal |
| `WAIT_DEFAULT_TIMEOUT_MS` | Internal |
| `WAIT_MAX_MS` | Internal |
| `WAIT_MIN_MS` | Internal |
| `WAIT_HEARTBEAT_MS` | Internal |

### `tools/wait-for-message.ts`
| Symbol | Production callers |
|---|---|
| `registerWaitForMessage` | `index.ts` |
| `WAIT_FOR_MESSAGE_NAME` | Internal |
| `WAIT_FOR_MESSAGE_DESCRIPTION` | Internal |

### `tools/wait-for-claim.ts`
| Symbol | Production callers |
|---|---|
| `registerWaitForClaim` | `index.ts` |
| `WAIT_FOR_CLAIM_NAME` | Internal |
| `WAIT_FOR_CLAIM_DESCRIPTION` | Internal |
| `CLAIM_WAIT_DEFAULT_TIMEOUT_MS` | Internal |
| `CLAIM_WAIT_MIN_MS` | Internal |
| `CLAIM_WAIT_MAX_MS` | Internal |
| `WaitOutcome` | `schema.ts`, `tiers.ts`, `governor.ts`, `delivery.ts` (type re-export) |

### `cards/tool-cards.ts`
| Symbol | Production callers |
|---|---|
| `renderRoomCall` | `tools/room.ts` (registerTool) |
| `renderRoomResult` | `tools/room.ts` (registerTool) |
| `describeRoomCall` | `tools/room.ts` (registerTool) |
| `describeRoomResult` | `tools/room.ts` (registerTool) |
| `renderWaitCall` | `tools/wait-for-agent.ts`, `tools/wait-for-message.ts` |
| `renderWaitResult` | `tools/wait-for-agent.ts`, `tools/wait-for-message.ts` |
| `describeWaitCall` | `tools/wait-for-agent.ts`, `tools/wait-for-message.ts` |
| `describeWaitResult` | `tools/wait-for-agent.ts`, `tools/wait-for-message.ts` |
| `WaitDetails` | Internal type |

### `cards/message-cards.ts`
| Symbol | Production callers |
|---|---|
| `registerMessageRenderers` | `index.ts` |
| `cardTypeFor` | `attention/delivery.ts` |
| `renderMessageCard` | `registerMessageRenderers` (internal) |
| `renderMentionCard` | `registerMessageRenderers` (internal) |
| `renderClaimCard` | `registerMessageRenderers` (internal) |
| `renderBoardDeltaCard` | `registerMessageRenderers` (internal) |
| `CARD_TYPES` | **NONE** (test only) |
| `CardType` | Internal type |

### `cards/body-lines.ts`
| Symbol | Production callers |
|---|---|
| `bodyLines` | `cards/message-cards.ts` |
| `COLLAPSED_QUOTE_LINES` | `cards/message-cards.ts` |
| `EXPANDED_BODY_LINES` | **NONE** (test only) |
| `BODY_LINE_CHARS` | `bodyLines` (internal) |

### `panel/panel.ts`
| Symbol | Production callers |
|---|---|
| `registerPanel` | `index.ts` |
| `openRoomPanel` | `commands/room-command.ts` (bare `/room`) |
| `RoomPanel` | `openRoomPanel` (internal) |
| `PANEL_SPLIT_AT` | Internal |
| `PANEL_LEFT_RATIO` | Internal |
| `PANEL_RIGHT_MIN_WIDTH` | Internal |
| `PANEL_AGE_INTERVAL_MS` | Internal |

### `panel/chrome.ts`
| Symbol | Production callers |
|---|---|
| `fitWidth` | `panel/board-pane.ts`, `panel/chat-pane.ts`, `panel/roster-strip.ts` |
| `fitBlock` | `panel/panel.ts` |
| `frameTopRow` | `panel/panel.ts` (via frameRows) |
| `frameDividerRow` | `panel/panel.ts` (via frameRows) |
| `frameBottomRow` | `panel/panel.ts` (via frameRows) |
| `frameHintRow` | `panel/panel.ts` (via frameRows) |
| `frameRows` | `panel/panel.ts` |

### `panel/board-pane.ts`
| Symbol | Production callers |
|---|---|
| `projectClaims` | `createBoardPane` (internal) |
| `createBoardPane` | `panel/panel.ts` |
| `BOARD_COLUMNS` | Internal |
| `BoardRow` | Internal type |

### `panel/chat-pane.ts`
| Symbol | Production callers |
|---|---|
| `projectChatRows` | `panel/panel.ts` |
| `renderChatRows` | `createChatPane` (internal) |
| `createChatPane` | `panel/panel.ts` |
| `ChatRow` | Internal type |

### `panel/roster-strip.ts`
| Symbol | Production callers |
|---|---|
| `statusCounts` | `renderRosterStrip` (internal) |
| `renderRosterStrip` | `panel/panel.ts` |
| `StatusCounts` | Internal type |

### `panel/keys.ts`
| Symbol | Production callers |
|---|---|
| `actionFor` | `panel/panel.ts` |
| `PANEL_KEY_MAP` | `actionFor` (internal) |
| `PanelAction` | Internal type |
| `PanelKeyState` | Internal type |

### `commands/room-command.ts`
| Symbol | Production callers |
|---|---|
| `registerRoomCommand` | `index.ts` |
| `ROOM_COMMAND_NAME` | Internal |
| `ROOM_SUBCOMMANDS` | Internal |
| `roomCompletions` | `registerRoomCommand` (internal) |

### `onboarding/hook.ts`
| Symbol | Production callers |
|---|---|
| `registerHooks` | `index.ts` |
| `buildPromptBlock` | `registerHooks` (internal) |
| `HOOK_CURSOR_ENTRY_TYPE` | Internal |

### `onboarding/digest.ts`
| Symbol | Production callers |
|---|---|
| `buildDigest` | `onboarding/hook.ts`, `tools/room.ts` |
| `estimateTokens` | `attention/governor.ts` |
| `DIGEST_BUDGET_TOKENS` | Internal |
| `ROSTER_CAP` | Internal |
| `DIGEST_CLAIMS_CAP` | Internal |
| `RAW_TAIL_R` | Internal |
| `UNTRUSTED_OPEN` | Internal |
| `UNTRUSTED_CLOSE` | Internal |
| `DIGEST_TRUNCATION_ORDER` | **NONE** (exported, never used) |

### `onboarding/escape.ts`
| Symbol | Production callers |
|---|---|
| `safeRoomText` | `tools/room.ts`, `cards/body-lines.ts`, `onboarding/digest.ts` |

### `ids.ts`
| Symbol | Production callers |
|---|---|
| `roomIdFor` | `store/config.ts` |
| `logPathFor` | `store/log.ts`, `store/room-store.ts` |
| `resourceKey` | `commands/room-command.ts` |
| `newMessageId` | `store/log.ts`, `store/room-store.ts` |

### `version.ts`
| Symbol | Production callers |
|---|---|
| `HOST_VERSION_PIN` | `assertHostVersion` (internal), `tests/drift.test.ts` |
| `DEEP_SPECIFIERS` | `assertHostVersion` (internal), `tests/drift.test.ts` |
| `assertHostVersion` | **NONE** (test only — called from drift.test.ts) |

---

## 2. Unwired / unreachable code

### CRITICAL — implemented but never called in production

#### F1. `startPruneJob` — dead standalone pruning starter
- **File:** `src/store/room-store.ts:267`
- **Severity:** Medium (redundant code, not a bug — the pruning IS started via `roomTimers.start`)
- **Evidence:** `startPruneJob` is exported but has zero callers in `src/`. The pruning interval is already started by `roomTimers.start` (line 294), which is called from `roomStoreFor` (line 221). `startPruneJob` duplicates this with a raw `ctx.setInterval` that is never registered in the timer registry, so it would leak on session_shutdown.
- **Fix:** Delete `startPruneJob`. The pruning job is correctly started via `roomTimers.start`.
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F2. `startClaimSweep` — dead standalone claim sweep starter
- **File:** `src/store/room-store.ts:274`
- **Severity:** Medium (redundant code, not a bug — the sweep IS started via `roomTimers.start`)
- **Evidence:** `startClaimSweep` is exported but has zero callers in `src/`. The claim sweep interval is already started by `roomTimers.start` (line 295), which is called from `roomStoreFor` (line 221). `startClaimSweep` duplicates this with a raw `ctx.setInterval` that is never registered in the timer registry.
- **Fix:** Delete `startClaimSweep`. The sweep is correctly started via `roomTimers.start`.
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F3. `claimSweeper.start` — never called (only `stop` is)
- **File:** `src/store/room-store.ts:317`
- **Severity:** Medium (the `claimSweeper` object is half-wired: `stop` is called from `dispose` and `resetRoomStores`, but `start` is never called from production)
- **Evidence:** `claimSweeper.start` has zero callers in `src/`. The claim sweep is started via `roomTimers.start` instead. The `claimSweeper` object exists as a "named lifecycle object" but only its `stop` method is reachable.
- **Fix:** Either call `claimSweeper.start` from `roomStoreFor` (and remove the duplicate from `roomTimers.start`), or delete the `claimSweeper` object and rely solely on `roomTimers`.
- **Suite catches deletion?** NO — no test references `claimSweeper.start`. **Suite stays green on deletion.**

#### F4. `noteGap` — test-only helper
- **File:** `src/attention/governor.ts:181`
- **Severity:** Low (dead code)
- **Evidence:** `noteGap` is exported but only called from `tests/attention.test.ts:441`. In production, gap records are appended directly via `store.append({ kind: "gap", ... })` in `enforceRetention` (room-store.ts:259) and `replay` (log.ts:89,95).
- **Fix:** Delete `noteGap`, or use it in `enforceRetention` and `replay` for consistency.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion** (compile error in test import).

#### F5. `restoreOwnCursor` — test-only helper
- **File:** `src/store/cursors.ts:40`
- **Severity:** Low (dead code)
- **Evidence:** `restoreOwnCursor` is exported but only called from `tests/store.test.ts:295-310`. In production, the cursor is initialized via `initCursor` (which starts at `logEnd - JOIN_BACKLOG`), not restored from a persisted entry. `persistOwnCursor` is called in `hook.ts`, but the restore path is never wired.
- **Fix:** Delete `restoreOwnCursor`, or wire it into `initCursor` / `before_agent_start` to resume from a persisted cursor.
- **Suite catches deletion?** YES — `store.test.ts` imports it. **Suite goes red on deletion.**

#### F6. `readSince` — test-only helper
- **File:** `src/store/log.ts:50`
- **Severity:** Low (dead code)
- **Evidence:** `readSince` is exported but only called from `tests/store.test.ts:209-221`. In production, reads come from `store.records` (in-memory), not from the file. `replay` is used at store creation, but `readSince` is never used.
- **Fix:** Delete `readSince`, or use it in the `room` tool's `read` op for incremental file-based reads.
- **Suite catches deletion?** YES — `store.test.ts` imports it. **Suite goes red on deletion.**

#### F7. `validateZoomRange` and `zoom` — test-only (dropped ops)
- **File:** `src/store/tree-store.ts:256,271`
- **Severity:** Low (dead code — the `zoom` op was dropped from Option A)
- **Evidence:** Both are exported but only called from `tests/tree.test.ts:392-417`. The `room` tool's op set is `join/read/post/claim/release/board` (room.ts:23); `zoom` is explicitly listed as a dropped row (room.ts:24 comment).
- **Fix:** Delete both, or re-add the `zoom` op to the room tool.
- **Suite catches deletion?** YES — `tree.test.ts` imports them. **Suite goes red on deletion.**

#### F8. `compactionSpendToday` — test seam only
- **File:** `src/store/compactor.ts:41`
- **Severity:** Low (test seam, not called in production)
- **Evidence:** Exported but only called from `tests/tree.test.ts:303`. The `atCap()` function uses the internal `spendToday` variable directly.
- **Fix:** Keep as a test seam (it's a deliberate `__compactTest` precedent), or delete if the T5 cap test is removed.
- **Suite catches deletion?** YES — `tree.test.ts` imports it. **Suite goes red on deletion.**

#### F9. `selectT0` — test-only (T0 pull path not implemented)
- **File:** `src/attention/governor.ts:31`
- **Severity:** Medium (the T0 pull-path batching is implemented but never invoked)
- **Evidence:** `selectT0` is exported but only called from `tests/attention.test.ts:269-277`. In production, T0 records are delivered immediately via `deliver` in `notifyRecipients` (room.ts:208). The `selectT0` ceiling-batching path is never reached.
- **Fix:** Wire `selectT0` into the digest/pull path, or delete it if the pull path is not planned.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion.**

#### F10. `coalescePending` — test-only (T2 digest not implemented)
- **File:** `src/attention/governor.ts:112`
- **Severity:** Medium (the T2 coalescing digest is implemented but never invoked)
- **Evidence:** `coalescePending` is exported but only called from `tests/attention.test.ts:234-244`. In production, T2 records are cursor-only (deliver bumps the cursor and returns). The digest line that `coalescePending` would produce is never injected.
- **Fix:** Wire `coalescePending` into the digest/pull path, or delete it.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion.**

#### F11. `unreadCounts` — test-only
- **File:** `src/attention/governor.ts:167`
- **Severity:** Low (dead code)
- **Evidence:** Exported but only called from `tests/attention.test.ts:418-433`. Not called from any production file.
- **Fix:** Delete, or wire into the panel or digest.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion.**

#### F12. `muteTopic` / `unmuteTopic` / `muteRoom` / `unmuteRoom` — test-only
- **File:** `src/attention/governor.ts:137-151`
- **Severity:** Low (dead code — the mute ops were dropped from Option A)
- **Evidence:** All four are exported but only called from `tests/attention.test.ts:417-433`. The `room` tool's op set does not include `mute`/`unmute` (room.ts:23).
- **Fix:** Delete all four, or re-add the mute ops to the room tool.
- **Suite catches deletion?** YES — `attention.test.ts` imports them. **Suite goes red on deletion.**

#### F13. `truncateOversized` — test-only
- **File:** `src/attention/governor.ts:188`
- **Severity:** Low (dead code)
- **Evidence:** Exported but only called from `tests/attention.test.ts:452-461`. In production, the body cap is enforced by a simple length check in `room.ts:296-298` that rejects the post outright, not by truncating.
- **Fix:** Delete, or wire into the post path as a truncation-instead-of-reject policy.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion.**

#### F14. `assertHostVersion` — test-only
- **File:** `src/version.ts:34`
- **Severity:** Low (dead code in production — called only from drift.test.ts)
- **Evidence:** Exported but only called from `tests/drift.test.ts:28-30`. The comment says "also safe to call at extension load if a future phase wants a runtime guard" — it is not called.
- **Fix:** Call from `roomExtension` (index.ts) as a runtime guard, or delete.
- **Suite catches deletion?** YES — `drift.test.ts` imports it. **Suite goes red on deletion.**

### LOW — exported but never used (no production or test caller)

#### F15. `SUMMARY_MAX_BYTES` — never used
- **File:** `src/store/compactor.ts:10`
- **Severity:** Trivial
- **Fix:** Delete (the internal `SUMMARY_MAX_TOKENS` is used instead).
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F16. `RoomStoreOptions` — never used
- **File:** `src/store/room-store.ts:54`
- **Severity:** Trivial
- **Fix:** Delete.
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F17. `COVER_BUDGET_LINES` — never used
- **File:** `src/store/tree-store.ts:14`
- **Severity:** Trivial
- **Fix:** Delete.
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F18. `RAW_TAIL_R` (tree-store) — never used
- **File:** `src/store/tree-store.ts:15`
- **Severity:** Trivial
- **Fix:** Delete (note: `RAW_TAIL_R` in `digest.ts` is a separate constant that IS used).
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F19. `DIGEST_TRUNCATION_ORDER` — never used
- **File:** `src/onboarding/digest.ts:112`
- **Severity:** Trivial
- **Fix:** Delete.
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F20. `CARD_TYPES` — test-only
- **File:** `src/cards/message-cards.ts:11`
- **Severity:** Trivial
- **Fix:** Delete, or use in `registerMessageRenderers` to drive the registration loop.
- **Suite catches deletion?** YES — `cards.test.ts` imports it. **Suite goes red on deletion.**

#### F21. `EXPANDED_BODY_LINES` — test-only
- **File:** `src/cards/body-lines.ts:22`
- **Severity:** Trivial
- **Fix:** Delete, or use in `bodyLines` to avoid the hardcoded `12`.
- **Suite catches deletion?** YES — `cards.test.ts` imports it. **Suite goes red on deletion.**

#### F22. `RECALL_LIMIT_MAX` — never used
- **File:** `src/tools/room.ts:28`
- **Severity:** Trivial
- **Fix:** Delete (the `recall` op was dropped from Option A).
- **Suite catches deletion?** NO — no test references it. **Suite stays green on deletion.**

#### F23. `HELD_CLAIM_WINDOW_MS` — test-only
- **File:** `src/attention/tiers.ts:4`
- **Severity:** Trivial
- **Fix:** Delete, or wire into a held-topics pruning path.
- **Suite catches deletion?** YES — `attention.test.ts` imports it. **Suite goes red on deletion.**

---

## 3. Specific questions answered

| Question | Answer |
|---|---|
| Is the compactor ever started? | **YES** — `startCompactor` is called from `roomStoreFor` (room-store.ts:222) under `ctx.agent.kind === "main"`. Correctly wired. |
| Is the pruning job started? | **YES** — via `roomTimers.start` (room-store.ts:294), called from `roomStoreFor` (line 221). But `startPruneJob` (the standalone function) is dead code. |
| Is the claim sweep started? | **YES** — via `roomTimers.start` (room-store.ts:295), called from `roomStoreFor` (line 221). But `startClaimSweep` and `claimSweeper.start` are dead code. |
| Is `registerMessageRenderers` reaching the registry? | **YES** — called from `index.ts:24`. Registers four renderers. Verified by `cards.test.ts:141-146`. |
| Does `registerPanel`'s shortcut ever fire? | **YES** — `registerPanel` is called from `index.ts:23`. The shortcut is registered when `--room-panel-key` is non-empty. The `session_shutdown` closer is always registered. |
| Is `noteGap` called? | **NO** — test only. |
| Is `enforceRetention` called? | **YES** — via `roomTimers.start` interval. |

---

## 4. Correctly wired — verified

The following are correctly wired from `index.ts` through to production:

1. **`roomExtension`** → `registerRoomFlags` (no-op by design), `registerRoomTool`, `registerWaitForClaim`, `registerWaitForAgent`, `registerWaitForMessage`, `registerRoomCommand`, `registerMessageRenderers`, `registerPanel`, `registerHooks`
2. **`registerRoomTool`** → `roomStoreFor` → `roomTimers.start` (prune + sweep) + `startCompactor` → `notifyRecipients` → `deliver` → `pi.sendMessage` / `ref.session.sendCustomMessage`
3. **`registerWaitForClaim`** → `roomStoreFor` → `enqueueWaiter` / `resolveWaiters` / `requeueWaiter` / `dequeueWaiter`
4. **`registerWaitForMessage`** → `roomStoreFor` → `store.addListener`
5. **`registerWaitForAgent`** → `AgentRegistry.global().onChange`
6. **`registerRoomCommand`** → `roomStoreFor` → `grant` / `release` / `reclaimIfStale` / `contended`; bare `/room` → `openRoomPanel` → `RoomPanel`
7. **`registerMessageRenderers`** → four `pi.registerMessageRenderer` calls
8. **`registerPanel`** → `session_shutdown` closer + optional `--room-panel-key` shortcut → `openRoomPanel`
9. **`registerHooks`** → `before_agent_start` → `roomStoreFor` → `initCursor` → `buildDigest` → `buildPromptBlock` → `persistOwnCursor`; `session_shutdown` → `disposeRoomSession`
10. **`deliver`** → called from `notifyRecipients` in `room.ts:208` (the known fix is in place)
11. **`classify`** → called from `room.ts`, `governor.ts`, `chat-pane.ts`
12. **`admitPost`** → called from `room.ts:199`
13. **`selectT1`** → called from `room.ts:174`
14. **`isMuted`** → called from `room.ts:172,205`
15. **`cardTypeFor`** → called from `delivery.ts:47`
16. **`bodyLines`** → called from `message-cards.ts`
17. **`openRoomPanel`** → called from `room-command.ts` (bare `/room`)
18. **`buildDigest`** → called from `hook.ts` and `room.ts`
19. **`safeRoomText`** → called from `room.ts`, `body-lines.ts`, `digest.ts`
20. **`estimateTokens`** → called from `governor.ts`

---

## 5. Summary

| Severity | Count | Description |
|---|---|---|
| Critical | 0 | No production-breaking unwired code (the `deliver` fix is in place) |
| Medium | 6 | F1, F2, F3, F9, F10, F14 — implemented features with no production caller |
| Low | 8 | F4, F5, F6, F7, F8, F11, F12, F13 — test-only helpers |
| Trivial | 9 | F15–F23 — exported but never used |

**The pattern:** Option B implemented a full feature surface (governor, compactor, tree, panel, cards) but the `room` tool's op set was kept at the Option A six (`join/read/post/claim/release/board`). The governor functions that support the dropped ops (`selectT0`, `coalescePending`, `mute*`, `unreadCounts`, `truncateOversized`) are therefore unreachable in production. The tree functions (`zoom`, `validateZoomRange`) are likewise unreachable because the `zoom` op was dropped. The standalone job starters (`startPruneJob`, `startClaimSweep`, `claimSweeper.start`) are redundant with `roomTimers.start`.

**Highest-value finding:** F9 (`selectT0`) and F10 (`coalescePending`) — these implement the T0 ceiling-batching and T2 coalescing digest, which are the core of the attention governor's pull path. They are fully implemented and tested but never invoked, meaning the governor's pull-based delivery (as opposed to the push-based `notifyRecipients`) is entirely absent from production.

---

**Note:** The `write` tool is restricted to `xd://` device paths and cannot write to the filesystem. This report should be saved to `docs/research/omp-agent-chatroom/review6/wiring.md` by the main agent.