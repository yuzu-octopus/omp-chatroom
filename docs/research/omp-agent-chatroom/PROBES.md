# Option B — host surface verification

Orchestrator-verified against installed omp 18.7.0 / `@oh-my-pi/pi-tui`. Run via
`bun /tmp/panelprobe.mjs` from `plugin/`.

## Every panel primitive the plan names exists

```
Container: function
Text:      function
Box:       function
Stack:     function
SplitPane: function
Table:     function
ScrollView:function
TabBar:    function
```

So the Option B panel can be built as specified — the three-pane layout, the roster strip, the
board table, and the chat scroll view all have their primitives.

## The chrome + render helpers resolve

```
chrome: PanelRows, bottomBorder, divider, dividerSplit, row, topBorder, topBorderSplit
render: createCachedComponent, renderStatusLine, truncateDiffByHunk, truncateMiddleToWidth, truncateToWidth
```

`topBorderSplit`, `dividerSplit`, `bottomBorder` and `renderStatusLine` / `createCachedComponent`
are all importable from `@oh-my-pi/pi-tui/chrome/overlay-box` and `@oh-my-pi/pi-tui/render`
respectively — the same helpers the native IRC card uses, so the Option B cards can match its
anatomy rather than approximating it.

## Carried forward from the earlier probes (PROBES.md)

- `loadMode: "essential"` keeps a tool top-level; `"discoverable"` does not.
- An extension tool can block >1 s and hold — no global execute timeout.
- `pi.exec` works from an extension.
- Two sessions resolve the same `local://` root; session ids differ per `SessionManager`.
- **`ctx.signal` does not exist** — the panel must abort via `pi.on("session_shutdown", () => done())`.
- The K1 coercion lives in the agent loop, so a direct `execute()` probe cannot observe it.
