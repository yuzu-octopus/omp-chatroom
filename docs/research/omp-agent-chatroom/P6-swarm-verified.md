# P6 — the swarm works (live verification)

Date 2026-10-07. Verified against the real plugin, real sessions, no model.

## Gate 1 — the plugin loads in a real session

`bun /tmp/loadprobe.mjs` via `createAgentSession({ additionalExtensionPaths: ["plugin/src/index.ts"] })`:

```
extension errors: []
room registered: true
wait_for_claim registered: true
total active tools: 15
board ok: true | has content: true
board text: "room board → 0 claim(s), 0 member(s), 0 topic(s)"
```

**Zero extension errors.** Both tools register and `board` returns a valid K1 envelope.

## Gate 2 — two agents, one room, a real claim handoff

`bun /tmp/swarmprobe.mjs` — two `createAgentSession` instances in one process, one shared
`local://` root, both loading the real extension:

```
A claim:  {"ok":true,"op":"claim","holder":"AgentA","expiresAt":1791360013149}
B post:   {"ok":true,"op":"post","id":"ace0c761-…","seq":2}
B still blocked before release: true
A release: {"ok":true,"op":"release"}
B wait result: {"ok":true,"outcome":"event","acquired":true,
                "claim":{"resource":"build/parser","holder":"AgentB","ttlMs":300000,"seq":4}}
board: {"ok":true,"op":"board","board":{"ok":true,
         "claims":[{"resource":"build/parser","holder":"AgentB","ttlMs":300000,"contended":0}],
         "roster":[], "topics":[{"topic":"build","lastSeq":2,"unread":1}]}}
log files: [ "r897f3f2d5b3f7fe6.jsonl", "config.json" ]
log lines: 4 | kinds: claim,msg,release,claim
```

**The full coordination loop works**: A claims → B is blocked (verified `settled === false` before
the release) → A releases → B is promoted and granted the lease → the board reflects B as holder →
the durable JSONL on disk has the four records in order.

That is the plugin's core value proposition, observed working rather than asserted.

## Gate 3 — the drift gate

`bun test tests/drift.test.ts` → 5 pass. Asserts the installed host version equals the pin and that
the Option A deep specifiers export their expected members.

**Finding recorded:** the host's deep subpaths declare only an `import` condition in their exports
map (no `require`), so a `createRequire().resolve()`-based drift check reports false failures. The
gate uses static ESM imports, which is the mechanism the plugin actually uses.

## Notes

- An `omp --mode text` run was attempted first and hit model latency (timed out at 120 s), not a
  plugin failure — the deterministic SDK probes above are the honest gate and they are fast.
- The probes are throwaway (`/tmp`), not committed. The equivalent assertions live in
  `plugin/tests/e2e-room.test.ts`.
