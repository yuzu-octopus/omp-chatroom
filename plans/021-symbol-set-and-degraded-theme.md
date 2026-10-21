# Plan 021: the plugin's glyphs follow the host's symbol set, and the degraded theme is the host's own

> **Executor instructions**: read this plan fully before starting. Run the verification commands and
> confirm the expected results. Update the status row in `plans/README.md` when an item lands, and
> add a dated addendum to `docs/research/omp-agent-chatroom/PLAN-build.md` for any change that
> supersedes the §7.3 spec (the plan body is a historical record).
>
> **Drift check (run first)**:
> `git diff --stat <commit>..HEAD -- plugin/src/panel/host-theme.ts plugin/src/panel/board-pane.ts`
> If those files changed since this plan was written, compare the "Current state" facts against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (the change is one theme shim plus the glyph call sites; the AUDIT round is what
  made it large)
- **Risk**: MEDIUM (the plugin shares the host's `pi-tui` instance in production, so publishing a
  theme into the host's singleton is a host-wide contract — see "The production topology")
- **Depends on**: none
- **Category**: rendering + host contract
- **Planned at**: 2026-10-21, host 18.12.3
- **Outcome**: DONE (`c9ebcd2` + `bb2a8c4`; 362 tests / 18 files green)

## The request

> "Update the `omp-chatroom` plugin so UI glyphs follow the user's configured symbol set (`unicode`,
> `nerd`, or `ascii`) while adding as little plugin code as possible and delegating symbol handling
> to the host/core."

The host ships three symbol sets (`@oh-my-pi/pi-tui/src/theme/symbols.ts`: `unicode`, `nerd`,
`ascii`) and publishes the one the user chose. The plugin painted its own hardcoded glyphs, so a
card drew a nerd-font shape on an ASCII terminal, or a box character where the user's set says
`[i]`. "As little plugin code as possible, delegate to the host" is the whole design instruction —
and the answer turned out to be bigger than the glyph call sites.

## What the host already owns (the lever)

- `Theme.symbol(key)` and `Theme.styledSymbol(key, color)` — the keyed lookups.
- The string-valued table getters: `status`, `nav`, `tree`, `sep`, `md`, `format`, `boxRound`,
  `boxSharp`, `icon`, `cmd`, `thinking`, `checkbox`, `radio`, `progress`, `boxDotted`.
- `@oh-my-pi/pi-tui/theme/active-symbols` — `activeThemeSymbol(key)`, the module's own mirror of the
  active theme's symbols (and `setActiveSymbolTheme`, its writer). The mirror is the SAME mechanism
  the host's own `assignTheme` drives, so the plugin can read it without a second source of truth.

So the plugin's own symbol tables were deletable: the host's lookup answers every key.

## The findings, in the order they were found

1. **The plugin painted its own glyphs** (cards, panel rows, the board's dashes). Fixed: every
   decorative glyph is a symbol KEY resolved through the theme.
2. **The fallback theme carried a private copy of the host's symbol tables.** Fixed: it reads the
   host's lookup, and answers from ONE snapshot taken when it is built — so a table member and
   `symbol()` can never disagree, and it never asks the mirror for a symbol.
3. **The mirror cycle (P1).** The host's publish path mirrors the published theme into
   `theme/active-symbols`, and a fallback that resolves through that mirror is a CYCLE: the fallback
   asks the mirror, the mirror asks the fallback, and the stack overflows
   (`Maximum call stack size exceeded`) — in the plugin's cards AND in the host's own `formatKeyHint`.
4. **The publish THREW (P1).** The host's `setThemeInstance` → `assignTheme` → `notifyThemeChange`
   runs the host's theme-change listener SYNCHRONOUSLY, and that listener reads
   `theme.getSymbolPreset()`, `theme.getBashModeBorderColor()` and `theme.getPythonModeBorderColor()`.
   The hand-rolled fallback had none of them, so the publish threw inside the panel's factory — the
   panel died with "Room panel unavailable" — and, the throw skipping the cleanup, the host's mirror
   was left on the fallback.
5. **The degraded path WIPED the user's symbol set (P1).** `ensureThemeSync()` → `configureTheme()`
   sets `currentSymbolPresetOverride = undefined`: the user's ascii/nerd choice was reset to the
   default "unicode" for the rest of the session, in exactly the case the ladder exists for. The
   fix is the host's own `initThemeSync(preset, colorBlindMode, …)` with the override read back from
   `getSymbolPresetOverride()`.
6. **The countdown floor (P1).** The board pane is narrower than the table's natural width, so the
   countdown ALWAYS sits at its floor. A floor of 3 painted the default 300 s lease as "30…" — ten
   times too small. The floor is 4.
7. **The board's cursor column was one cell wide**, so the ascii "->" was truncated by the host to
   its own ellipsis — the cursor became indistinguishable from a chopped cell. The column is now as
   wide as the glyph.
8. **The tests were preset-dependent** (a hardcoded "✉", a hardcoded quote border) and the
   source-scanning key collector had blind spots (a type annotation between a map's name and `=`;
   `theme.symbol(MAP.member)`). Both fixed; the collector now derives the read keys from `plugin/src/`.
9. **The ascii/nerd coverage was proven with a throwaway script that was then deleted.** The
   `symbol-sets` suite makes it permanent.

## The production topology (the thing the suite cannot prove)

**In production the plugin and the host share ONE `@oh-my-pi/pi-tui` module instance.** omp's
extension loader rewrites every `@oh-my-pi/pi-*` specifier an extension imports onto the host's
in-process modules (`@oh-my-pi/pi-coding-agent/src/extensibility/plugins/legacy-pi-compat.ts`:
`LEGACY_PI_SPECIFIER_FILTER`, and the comment at ~:811 — "`@oh-my-pi` is intentionally included so
direct canonical imports still pass through the same host-bundled package resolution path instead
of pulling a duplicate copy from plugin node_modules"). So the plugin's `theme` IS the host's
`theme`, the plugin's mirror IS the host's mirror, and `setThemeInstance` IS the host's publish path.

**`bun test tests/` does not reproduce that.** The suite resolves the plugin's OWN copy
(`plugin/node_modules/@oh-my-pi/pi-tui` — the same version, a different physical path), so the tests
run against a second, independent theme singleton with no host listener, no host status line and no
host chrome helpers. Consequences, recorded in `docs/research/omp-agent-notes/tests.md` §6.10:
a publish test proves the publish does not throw **in the plugin's copy**; the production failure
mode can only be SIMULATED (the fallback test registers a listener of the host's shape); and the
publish-is-a-contract rule — the fallback must answer every public member of the host's `Theme`,
because the host reads its own members off whatever was published — is the one thing the suite
checks by ENUMERATION (the member list is derived from `Theme.prototype` plus the instance fields,
and each table is compared with the host's own).

The production topology is a LIVE check.

## The verification

```sh
cd plugin
bun test tests/                          # 362 pass / 0 fail, 18 files
bun check                                # 0 type errors in 54 files
bunx --bun @biomejs/biome check src tests # clean
```

Every new test is mutation-checked: breaking the fix makes it fail, with the failure observed and
recorded. The mutations this round: the re-entrancy guard, the mirror restore, the unconditional
restore, the live-vs-snapshot lookup, a dropped `ensureThemeSync`, the missing `getSymbolPreset`,
the two-argument border-colour getters, the hardcoded card icon, the hardcoded envelope, the
hardcoded tier badge, the fixed one-cell cursor column, the countdown floor, the preset override, and
a scanner that finds nothing.

## Live checks (the human's)

The suite cannot stand in for the host, so these need a real terminal:

1. The panel under the user's own symbol set — `/room`, then switch the host's symbol preset
   (`/theme`) and re-open the panel: the glyphs must follow.
2. The degraded path: a host that hands a theme without `fg` (the 18.8.7 failure). The panel must
   open, and the host's own key hints must keep working.
3. The board's lease: a 300 s claim must read "300s", never "30…", at the real board widths.
