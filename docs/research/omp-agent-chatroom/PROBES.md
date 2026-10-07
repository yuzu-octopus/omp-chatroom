# Probes — running the plan's assumptions against the real host

Date 2026-10-07. omp **18.7.0**, Bun 1.4.2, `tsc` 7.0.2.

Four rounds of review produced 60+ findings by *reading*. These probes **execute** the plan's
load-bearing assumptions against the installed host. Four probes, all run, all reproducible.

## How to run

```sh
# 1. a working host tree (the native addon must sit where the loader looks)
mkdir -p /tmp/roomprobe && cd /tmp/roomprobe
cp -r ~/.bun/install/global/node_modules/@oh-my-pi node_modules/@oh-my-pi
cp ~/.bun/install/global/node_modules/@oh-my-pi/pi-natives-linux-x64/*.node \
   node_modules/@oh-my-pi/pi-natives/native/
# 2. run any probe
bun probes/probe2.mjs
```

**Environment gotcha, recorded because it cost real time:** the native loader resolves the addon
relative to the module's own directory, and when the package is reached through Bun's cache the
path becomes `~/.bun/install/cache/@oh-my-pi/pi-natives@<v>@@@1/native/`. That cache directory
ships **without** the `.node` files, so a bare symlink to the global install fails with
`Failed to load pi_natives native addon`. Copying the platform `.node` files into the cache's
`native/` directory fixes it. Nothing about the plugin — a probe-harness issue only.

## Results

### P1 — the shared-root premise · **CONFIRMED**

```
rootA: /tmp/probe-XXXX/local
rootB: /tmp/probe-XXXX/local
SHARED ROOT (plan's premise): true
last segment: local
```

Two sessions with different ids resolve the **same** `local://` root. The entire design rests on
this and it holds.

Also confirmed in the same run — **X1 reproduced live**:

```
m1 id: 01a114ff-0266-73bf-...
m2 id: 01a114ff-0266-73c0-...
distinct session ids: true
=> roomIdFor(sessionId) would FRAGMENT: true
```

Two `SessionManager.inMemory` instances mint **distinct** ids, and `path.basename(root)` is always
`"local"`. Both original bugs — the session-id derivation and the last-segment rule — are now
reproduced rather than reasoned about.

### P2 — tool registration, blocking, and `pi.exec` · **ALL CONFIRMED**

```
probe_block registered: true
probe_exec  registered: true
blocked for: 1213 ms (asked 1200) -> held: true
result shape has content: true | details: {"ok":true,"slept":1200}
pi.exec stdout: "hello-from-exec" | code: 0
```

Three things the plan depends on, now proven:

1. **An extension can register a tool** with `loadMode: "essential"`, an `interruptible` own
   property, and a `pi.zod` schema.
2. **A tool can block for over a second** and hold — no global execute timeout cuts it. This is the
   premise of all three wait tools.
3. **`pi.exec` works** — an extension can spawn a process (`echo` → stdout, exit 0). This is the
   premise for hosting our own embedding endpoint later.

### P3 — `loadMode` and the K1 result shape · **CONFIRMED (with a correction to my own finding)**

```
active tools include probe_good: true
active tools include probe_bad : true
active tools include probe_disc: false   (discoverable -> mounted under xd://)
BAD-shape result content: undefined
BAD-shape isError: undefined
```

- **`loadMode: "essential"` keeps a tool top-level; `"discoverable"` does not.** Confirmed
  empirically — this is the K6/K18 fix, verified rather than inferred.
- **K1 needs a correction.** I claimed a `content`-less result is coerced to `isError: true`. That
  coercion lives in the **agent loop** (`coerceToolResult`), not at the `execute()` boundary — so a
  direct `execute()` call returns the raw object (`content: undefined, isError: undefined`). The
  finding stands for real agent turns but **cannot be observed by calling the tool directly**, which
  means the plan's §11.1 harness as written would **not** catch it. §11.2's row claiming
  "every result carries a `content` array (K1) proves the host does not coerce" is therefore
  **wrong as a test** — it asserts on a raw return value, not on the coerced one.

**Fix for the plan:** either assert the shape at the call site (which only proves the plugin
returned it, not that the host accepted it), or drive a real agent turn and assert the tool result
is not `isError`. The latter is the honest test.

## What these probes change

| Plan claim | Before | Now |
|---|---|---|
| Subagents share the `local://` root | inferred from source | **executed** |
| Session ids differ per manager (X1) | read in source | **executed** |
| A tool can block >1 s | inferred (no timeout found) | **executed** |
| `pi.exec` is available to extensions | read the signature | **executed** |
| `essential` is top-level, `discoverable` is not | read `xdev.ts`/`sdk.ts` | **executed** |
| K1 coercion catches a bad shape in §11.1 | assumed | **refuted** — needs a real turn |

## Next probes worth running (not yet done)

- Drive a **real agent turn** with a stub model to observe K1's coercion end to end.
- Two sessions + a real `wait_for_claim` across them (the §11.1 scenario, with bodies implemented).
- `ctx.ui.custom` overlay open/close and the `session_shutdown` abort path.
- `AgentRegistry.global()` `onChange` firing on a real spawn/park cycle.
