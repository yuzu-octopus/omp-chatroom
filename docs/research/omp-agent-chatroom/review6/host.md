# RevBHost — host contract + behaviour, Option B

Adversarial review of `src/panel/**`, `src/cards/**`, `src/attention/delivery.ts`,
`src/store/compactor.ts`. Every item below quotes real code. Verdict per item.

## CRITICAL

### F1 — `startCompactor` / `stopCompactor` are never called from production

`plugin/src/store/compactor.ts:194-207`

```ts
export function startCompactor(store: RoomStore, ctx: ExtensionContext): void { ... }
export function stopCompactor(root: string): void { ... }
```

`grep -rn "startCompactor" plugin/src/` returns **only the definition**. The compactor is fully
implemented, mutation-tested 12/12, and reached by 10 passing tests — and started by nothing. So
`putNode` is never called in a real session and the cold tree is never built.

Same class of defect as the separately-fixed `deliver()`-never-called bug.

**Fix:** wire it the way the other two background jobs are wired — `startPruneJob` and
`startClaimSweep` are reached through `roomTimers.start(root, ctx)` at
`src/store/room-store.ts:218`, under `ctx.agent.kind === "main"`. Start the compactor there and stop
it on the same last-dispose path. → dispatched as `WireCompactor`.

## INFO — verified correct

| # | Item | Evidence |
|---|---|---|
| F2 | `ctx.ui.custom` factory's 4th arg is `done` | `panel.ts:270-290` — signature matches host |
| F3 | `dispose()` reached on every close path | `panel.ts:155-165` |
| F4 | `session_shutdown` closer registered once | `panel.ts:327-331` — WeakMap, not per-open |
| F5 | `Component.render(width)` rows exactly `width` cells | `chrome.ts:14-22`, tested at 1/6/20/80/100/120 |
| F6 | Narrow fallback threshold reachable | `panel.ts:26` `PANEL_SPLIT_AT=88` |
| F7 | `registerMessageRenderer` shape correct | `message-cards.ts:145-150` |
| F8 | `sendCustomMessage` null-checks `AgentRef.session` | `delivery.ts:36-38` — parked ref skipped, not thrown |
| F9 | `streamSimple` call shape correct | `compactor.ts:82-84` |
| F10 | Mutex does not deadlock when the summarizer throws | `compactor.ts:60-64` |
| F11 | Daily cap enforced on the synchronous path | `compactor.ts:140-155` — capped call never queues |
| F12 | Timers cleared on shutdown | `panel.ts:88-92` |

## Note

The reviewer could not write this file itself (write tool rejected the path); the orchestrator wrote
it from the returned findings.
