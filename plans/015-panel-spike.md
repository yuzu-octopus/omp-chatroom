# Plan 015: Spike — resolve the panel's three dead keys (Enter/`p`/`/`) and the two inert flags

> **Executor instructions**: This is a SPIKE, not a build plan. Timebox the
> investigation to ~2 hours. Follow the steps, answer the open questions with
> evidence, and end with a build/no-build recommendation — do not implement
> the feature. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d4643a6..HEAD -- plugin/src/panel/ plugin/src/store/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S (spike only)
- **Risk**: LOW (no production change; worst case is a docs touch)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `d4643a6`, 2026-10-13

## Why this matters

The panel maps three keys to deliberate no-ops (`panel.ts:215-218`:
`Detail`/`compose`/`filter` hit `break`), and two config surfaces go
nowhere (`coldTreeEnabled` config + `room-cold-tree` flag unread anywhere;
`panelKey` config unread — only the `room-panel-key` flag works). Each is a
small, self-contained feature with the keybinding, state plumbing
(`editorEmpty`/`filterOpen` in `keys.ts:39-45`), and help-text slots already
in place. The question is which (if any) earns its implementation cost, and
what the minimal honest version of each is. A spike answers that with
evidence instead of enthusiasm.

## Current state

- `plugin/src/panel/keys.ts:20-36` — `PANEL_KEY_MAP`: `enter → detail`,
  `p → compose`, `/ → filter` are bound.
- `plugin/src/panel/panel.ts:215-218` — all three are `break` (no-op);
  `panel.ts:49-50` documents "the composer/filter are not built yet, so they
  are not advertised here" (HINTS omits them — honest today).
- `plugin/src/panel/keys.ts:39-45` — `PanelKeyState` already carries
  `editorEmpty`/`filterOpen` ("once the reader starts typing, the editor owns
  every key", §6.7) — the state machine anticipates the features.
- `plugin/src/store/config.ts:101-112` — `room-panel-key` flag (LIVE,
  `panel.ts:469-471` registers the shortcut) vs `room-cold-tree` flag
  (registered, read only by the config echo) vs `coldTreeEnabled`/`panelKey`
  config fields (unread anywhere).
- `plugin/src/commands/room-command.ts` config banner (post-plan-005):
  `coldTreeEnabled`/`panelKey` honestly listed as inert.

Repo verification commands (for the spike's probes only):
`bunx --bun tsc --noEmit -p tsconfig.json`, `bun test tests/`, all from
`plugin/`. Runtime is Bun; never node/npm/npx.

## Commands you will need

| Purpose   | Command                                               | Expected on success              |
|-----------|-------------------------------------------------------|----------------------------------|
| Typecheck | `bunx --bun tsc --noEmit -p tsconfig.json`            | exit 0 (spike must not break it) |
| Tests     | `timeout 500 bun test tests/panel.test.ts`            | all pass                         |

Run all commands from `plugin/`.

## Scope

**In scope** (investigate; modify only for throwaway probes, reverted after):
- `plugin/src/panel/*`
- `plugin/src/store/config.ts`
- Host `pi-tui` input/editor components (read-only, to answer Q2)

**Out of scope**:
- Implementing any of the three keys or wiring either flag.
- `plugin/tests/**` changes (spike produces a report, not tests).
- Any `plans/` file other than this plan's status row.

## Git workflow

- Branch: `advisor/015-panel-spike`
- No commit expected. If the spike concludes "remove the dead bindings," do
  NOT remove them here — write that as the recommendation and let the
  maintainer decide (key removal is a UX decision, not a cleanup).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Answer Q1 — what would each key minimally do?

For `Enter` (detail), `p` (compose), `/` (filter), write one paragraph each:
the minimal honest behavior (e.g. detail = expand the selected row's full
body in place; compose = focus the host composer with `room{op:"post"}` …
— but VERIFY whether the host exposes composer focus to extensions; if not,
say so and downgrade compose to "not feasible without host API"), and the
rough touch surface (files + new state). Ground each in the existing
`handleInput` switch and `PanelKeyState`.

**Verify**: three paragraphs, each naming the host API it needs (or "none").

### Step 2: Answer Q2 — does the host give us an input/editor component?

Grep the installed host (`plugin/node_modules/@oh-my-pi/pi-tui/src/`) for an
embeddable single-line input or editor component usable inside
`ctx.ui.custom`. Record: component name + import path, or "none found" with
the closest alternative (e.g. host composer focus action, `registerShortcut`
with editor takeover). This single answer decides compose/filter feasibility.

**Verify**: component path or a documented negative with the grep evidence.

### Step 3: Answer Q3 — what SHOULD the two inert surfaces become?

- `coldTreeEnabled` + `room-cold-tree`: the panel has no cold-tree view;
  the `tree`/`zoom` ops exist as tools. Options: (a) wire the flag to a
  third panel pane (cost?), (b) delete both surfaces. Recommend one with the
  rough cost of (a).
- `panelKey` config vs `room-panel-key` flag: two surfaces, one works.
  Recommend: delete the config field (flag wins — it's live and host-native)
  or wire the field as fallback. Note the `/room config set panelKey=`
  path that would break under deletion.

**Verify**: two recommendations, each ≤5 lines with cost + breakage noted.

### Step 4: Write the recommendation

One of: (a) build key X first (name it, with the minimal scope from Step 1);
(b) remove the dead bindings + inert surfaces (list the exact lines);
(c) leave as-is (state the holding reason, e.g. "panel is human-chrome;
agent tools are the product"). Report to the reviewer; update the plan row
to DONE with the recommendation letter in one line.

**Verify**: recommendation letter + ≤10-line rationale in the report.

## Test plan

- Spike: no tests. The only verification is that the tree is untouched
  (`git status` clean apart from the status row) and the existing panel
  tests still pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Q1/Q2/Q3 answered in the report with file:line evidence
- [ ] Recommendation letter (a/b/c) recorded
- [ ] `timeout 500 bun test tests/panel.test.ts` exits 0 (nothing broke)
- [ ] No repo modifications outside `plans/README.md` (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The host `pi-tui` tree has no readable sources (can't answer Q2 — report
  with the `ls` evidence).
- Answering Q1 requires deciding product priorities you can't ground
  (e.g. "should the panel exist at all") — scope back to the three keys and
  say so.
- The 2-hour timebox expires — report partial answers with what's missing.

## Maintenance notes

- If the maintainer picks (b) (removal), the follow-up is an S plan: unbind
  the three keys, delete the two inert surfaces, update the banner + HINTS
  comment. If (a), each key is its own M plan — don't bundle them.
- Reviewer: the value of this spike is the documented negative if Q2 is
  "none found" — that closes the compose/filter question permanently.
