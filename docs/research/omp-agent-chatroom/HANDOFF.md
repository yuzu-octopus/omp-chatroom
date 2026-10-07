# omp-agent-chatroom — build handoff

Date 2026-10-07. **Option A is built, tested, and verified live.**

## What to run

```sh
cd /home/yuzu/projects/omp-chatroom

# the plugin loads as a PROJECT extension — no install step needed
omp                    # from this directory; .omp/extensions/chatroom.ts is picked up

# then, inside omp:
#   /room board        — claims, roster, topics
#   /room claim build parser 300000
#   /room config       — show the active knobs
#   ask the agent to use the room tool
```

The `.omp/extensions/chatroom.ts` shim re-exports `plugin/src/index.ts`, so edits to the plugin are
picked up on the next session (no hot reload — restart omp).

## Gates (all green)

| Gate | Result |
|---|---|
| `bunx --bun tsc --noEmit -p tsconfig.json` | **0 errors** |
| `bun test tests/` | **63 pass / 0 fail**, 380 assertions, 6 files |
| Remaining `not implemented` stubs | **0** |
| Plugin loads in a real session | **0 extension errors**, both tools registered |
| Two-agent swarm | claim → block → release → promote, verified live |
| Mutation testing | 8/12 store mutations caught; 5 load-bearing tests non-vacuous |

## What it does

**Option A scope** (PLAN §1.4) — store + claim board + `room` op + digest + routing rule +
`wait_for_claim`. No panel, no inline cards, no cold tree, no attention governor.

- **`room` tool**, ops: `join` · `read` · `post` · `claim` · `release` · `board`
- **`wait_for_claim`** — blocks until the lease is acquired or times out (default 20 s, max 300 s)
- **Onboarding** — a bounded digest + the routing rule appended to the system prompt
- **`/room`** — slash command with completions, headless-safe
- **Config** — `local://room/config.json`, editable via `/room config`

Verified live (two real sessions, one process, one shared room):

```
A claim:  {"ok":true,"op":"claim","holder":"AgentA"}
B post:   {"ok":true,"op":"post","seq":2}
B still blocked before release: true
A release: {"ok":true,"op":"release"}
B wait:   {"ok":true,"outcome":"event","acquired":true,"claim":{"holder":"AgentB",...}}
log:      claim,msg,release,claim
```

## Real bugs found during the build

Not one was caught by the tests that existed at the time.

| Bug | How it was found |
|---|---|
| **`member{join}` unreachable** — the hook pre-mints cursors, so `join`'s cursor guard was always false; the roster stayed empty forever | adversarial code review |
| **Digest header injected `roomId` raw**, outside the untrusted region — a config file any agent can write reached the system prompt | adversarial code review |
| **Refcount inflation** — `roomStoreFor` was per-call, so `dispose()` never reached zero and the fd/store teardown was unreachable | a peer implementer reading another's file |
| **Promotion-ordering race** — `resolveWaiters` appended the claim before `store.claims` was set, so a waiter never saw its grant | implementer, during TDD |
| **Expiry sweep had no caller** — `release{reason:"expired"}` was unreachable | implementer, during TDD |
| **`MemberState.status` invented** — not in the spec | implementer |
| **Two inert flags** — a panel key and a cold-tree toggle that toggled nothing | packaging agent |
| **Manifest named 3 wait tools**, only 1 ships | packaging agent |
| **Flaky TTL test** + **microtask-only "still blocked"** in two files | mutation testing |

## Known limits (documented, not hidden)

- **In-process only.** No cross-process or cross-harness room.
- **Restricted/plan-mode children get no extension tools** — a hard host limit, so the room cannot
  serve them.
- **`read` has no byte budget** (`READ_LIMIT_MAX 200` × `maxBodyBytes 8192` worst case ≈ 400k
  tokens). Option A ships no governor, so nothing bounds it. Worth a byte cap before heavy use.
- **`wait_for_claim`'s timeout is a managed timer**; a `session_shutdown` during a wait may leave
  the promise unsettled. Unprobed.
- **Test isolation**: `room-tool.test.ts` registers into `AgentRegistry.global()` without resetting
  it; isolation currently depends on file order.
- **Deep host imports** are wildcard-only, not public API. `tests/drift.test.ts` is the guard.
- **Embeddings deliberately deferred** — see `docs/research/embeddings/CONCLUSION.md`.

## Layout

```
.omp/extensions/chatroom.ts      project loader shim (re-exports the plugin)
plugin/
  src/
    index.ts                     Option A wiring + __roomTest seam
    ids.ts  version.ts           root-stable ids; host drift pin
    store/                       schema, log, room-store, claims, cursors, config
    tools/                       room.ts, wait-for-claim.ts
    onboarding/                  digest.ts, escape.ts, hook.ts, routing-rule.md
    commands/room-command.ts     /room
  tests/                         6 files, 63 tests
  skills/omp-agent-chatroom/     bundled skill
probes/                          host probes (probe0-3.mjs)
docs/research/omp-agent-chatroom/  the plan, scaffold, reviews, PROBES.md
docs/research/embeddings/          the deferred embedding research
```

## Next, if you want to continue

1. **Probe the two open risks**: the `session_shutdown`-during-wait path, and a byte cap on `read`.
2. **Option B** — the panel, inline cards, cold tree, and the other two wait tools are all fully
   specified in `PLAN-build.md` and can be added without re-planning.
3. **A real swarm test** — run several actual agents with the task tool and watch them use the room
   under load, which is the one thing that cannot be tested deterministically.
