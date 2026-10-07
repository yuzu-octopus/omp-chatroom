# Round 4 — scaffold typecheck: FINAL

Date 2026-10-07. Orchestrator-verified, reproducible, **non-vacuous**.

## Result: the scaffold now typechecks clean

| State | Errors |
|---|---|
| Round-4 scaffold, before the fix pass | 28 |
| After the fix pass | 7 |
| **After fixing the 7 (trailing-comment pattern)** | **0** |

**Non-vacuity proof** (I was burned by a vacuous 0 earlier — an empty tree also reports 0):

| Check | Result |
|---|---|
| `tsc --listFiles` repo files | **36** |
| Total TypeScript bytes extracted | **57,298** |
| Files under 1 KB (i.e. empty) | **0** |
| Deliberately injected `export const probe: number = "str"` | **1 error** (detected) |

So a clean run is meaningful: the compiler read 36 real files and would have reported a defect.

## The 7 fixes — one pattern

Every remaining error was a declaration-only signature whose terminating `;` was followed by a
**trailing comment**, so an inserted `{ throw … }` landed after the comment:

```ts
// before
export function replay(fd: number): { records: RoomRecord[]; skipped: number };   // §3.3
// after
export function replay(fd: number): { records: RoomRecord[]; skipped: number } {   // §3.3
  throw new Error("not implemented");
}
```

Fixed at all 7 sites: `replay`, `expireStale`, `zoom`, `validateZoomRange`, `selectT1`,
`truncateOversized`, `actionFor`.

## Reproduce

```sh
# 1. extract: split SCAFFOLD.md on '^## N. `path`', take fenced blocks whose language matches
#    the path extension, order .ts blocks imports-first, write to path
# 2. link host types
ln -sfn ~/.bun/install/global/node_modules/@oh-my-pi node_modules/@oh-my-pi
bun add -d @types/bun
# 3. typecheck
bunx --bun tsc --noEmit -p tsconfig.json
```

## Why this matters

This is the check that no review lens could perform. Rounds 1-4 read prose; the compiler read
code and found 28 defects — including a duplicated import and two calls to an out-of-scope `pi`
that every lens had walked past. The scaffold is now a **valid compile target**, which is the
precondition for starting P0.

## Note on the extraction tooling

Two bugs in my extractor cost real time and are recorded so they are not repeated:
- `os.path.splitext(p)[1]` returns `".ts"` **with the dot**; a `{'ts': …}` map yields `None`,
  silently falling back to one block and dropping the import block.
- `open(p,'w').write(stub(open(p).read()))` **truncates before reading** → 0-byte files.

A naive regex body-stub also corrupts nested `;` inside return types
(`{ records: RoomRecord[]; skipped: number }`); a paren/brace-depth-aware scan is required.
