import * as fs from "node:fs";
import * as path from "node:path";

import { globalMap } from "../globals";

export interface TreeStore {
  getNode(lo: number, hi: number): string | null;
  putNode(lo: number, hi: number, summary: string): boolean;
  /**
   * OptMem `pending(d, T)` — every unbuilt block, smallest-first. The reference work list (the
   * tests build against it); the compactor uses `ready` (F13) so it never scans for work.
   */
  pending(limit?: number): Array<[number, number]>;
  /**
   * §3.6 the raw bisection tiling. Pure and spec-faithful — it may emit size-1 blocks, so it is NOT
   * the view (F5). The view is `viewTiling` / `loadView` below.
   */
  cover(T: number, budget: number): Array<[number, number]>;
  /**
   * §4 F13 — the ready queue: the nodes that can be built now, smallest-first, at most one per level
   * (the dense-prefix CAS lets only a level's head be written, and a merge needs both halves built).
   * Seeded from one `stat` per level and updated as nodes are built — never a scan over the blocks.
   */
  ready(limit?: number): Array<[number, number]>;
  /** [invented] the log length the tiling is computed against; refresh it as the log grows. */
  logLength: number;
}

export const TREE_REC = 512; // §2 — a dense paragraph; 128 was too short, 288 was untested
export const RAW_MAX = 16; // §3.6 merge shape
export const COVER_BUDGET_LINES = 96; // §5.2 (OptMem WAKE_LINES)

/** Bytes of summary text a record can hold (OptMem reserves the last byte for the newline). */
const SUMMARY_BYTES = TREE_REC - 1;

/** Level `size` holds blocks of `size` records; level 1 is the raw log, so the smallest is 2. */
const MIN_LEVEL = 2;

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** A block is an aligned power-of-two range — the only shape the offset math is valid for. */
function isBlock(lo: number, hi: number): boolean {
  const size = hi - lo;
  return (
    Number.isInteger(lo) && lo >= 0 && isPowerOfTwo(size) && size >= MIN_LEVEL && lo % size === 0
  );
}

/** One level's file: the fixed-width records for blocks of `size`. */
function levelPath(treePath: string, size: number): string {
  return path.join(treePath, String(size));
}

/** Whole records in a fixed-width file; a missing file is an empty level, not an error. */
function count(p: string): number {
  try {
    return Math.floor(fs.statSync(p).size / TREE_REC);
  } catch {
    return 0;
  }
}

/**
 * Drop a partial trailing record left by a crash (OptMem `repair`). Without it the next append
 * lands at a wrong offset and every later record in that level is misaligned.
 */
function repair(p: string): void {
  let n: number;
  try {
    n = fs.statSync(p).size;
  } catch {
    return;
  }
  if (n % TREE_REC !== 0) {
    const fd = fs.openSync(p, "r+");
    try {
      fs.ftruncateSync(fd, n - (n % TREE_REC));
    } finally {
      fs.closeSync(fd);
    }
  }
}

/**
 * Cut `text` to `maxBytes` UTF-8 bytes without splitting a code point. OptMem `die()`s on an
 * over-long summary (`memo:296-299`); the plan (T3) requires graceful truncation instead — the
 * tail is lost, the node stays usable.
 */
export function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf-8") <= maxBytes) return text;
  let bytes = 0;
  let out = "";
  for (const ch of text) {
    const n = Buffer.byteLength(ch, "utf-8");
    if (bytes + n > maxBytes) break;
    bytes += n;
    out += ch;
  }
  return out;
}

/**
 * Cut a summary at a WORD boundary, so the stored node never ends mid-word.
 *
 * A node's text is the INPUT of the next merge: the level-2 node above it is summarised again
 * into a level-4 node. A byte-exact cut leaves a half-word ("… - SQLite will"), and a model
 * summarising two such halves produced "- Weekday" — nine bytes that carried nothing. Cutting at
 * the last space keeps the merge input coherent.
 *
 * A text with no space in the cut region is cut at the byte limit as before (a single long word
 * has no boundary to cut at).
 */
export function trimToWordBoundary(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf-8") <= maxBytes) return text;
  const cut = truncateBytes(text, maxBytes);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace <= 0) return cut; // no word boundary to cut at
  return cut.slice(0, lastSpace).trimEnd();
}

/** One fixed-width record: text, space padding, then the newline in the last byte. */
function encodeRecord(summary: string): Buffer {
  // A record is one line: an embedded newline would shift every later record's offset.
  const flat = summary.replace(/[\r\n]+/g, " ");
  const text = Buffer.from(trimToWordBoundary(flat, SUMMARY_BYTES), "utf-8");
  const rec = Buffer.alloc(TREE_REC, 0x20);
  text.copy(rec, 0);
  rec[TREE_REC - 1] = 0x0a;
  return rec;
}

function decodeRecord(buf: Buffer): string | null {
  const text = buf.toString("utf-8").replace(/\s+$/, "");
  return text.length === 0 ? null : text;
}

// --- §4 F13 — the ready queue ----------------------------------------------
//
// `pending()` scans every level and every block position; over a long chat that is O(N²). The
// queue below holds only what can be built now: at most one block per level (the dense prefix lets
// only a level's head be written) whose children — for a merge — are both built. It is seeded from
// one `stat` per level (O(log T)) and updated as nodes land, never by walking the blocks.

interface ReadyQueue {
  T: number; // the log length the queue was seeded against
  built: Map<number, number>; // level size → how many blocks of that level are built (dense prefix)
  ready: Array<[number, number]>; // smallest-first (level asc, then lo asc)
}

const QUEUES = globalMap<string, ReadyQueue>("__roomTreeReady");

function queueFor(treePath: string): ReadyQueue {
  let q = QUEUES.get(treePath);
  if (q === undefined) {
    q = { T: -1, built: new Map(), ready: [] };
    QUEUES.set(treePath, q);
  }
  return q;
}

/** The buildable blocks for a given set of level counts: the head of each level whose children
 * (if it is a merge) are built, and whose range the log already covers. */
function computeReady(built: Map<number, number>, T: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let size = MIN_LEVEL; size <= T; size *= 2) {
    const k = built.get(size) ?? 0;
    const lo = k * size;
    const hi = lo + size;
    if (hi > T) continue; // the log does not reach this block yet
    if (size > MIN_LEVEL && (built.get(size / 2) ?? 0) < 2 * k + 2) continue; // a half is unbuilt
    out.push([lo, hi]);
  }
  return out;
}

/** Insert `block` keeping the queue smallest-first and deduped. */
function pushReady(q: ReadyQueue, block: [number, number]): void {
  const size = block[1] - block[0];
  if (q.ready.some(([a, b]) => a === block[0] && b === block[1])) return;
  const idx = q.ready.findIndex(([a, b]) => {
    const s = b - a;
    return s > size || (s === size && a > block[0]);
  });
  if (idx < 0) q.ready.push(block);
  else q.ready.splice(idx, 0, block);
}

/** Rebuild the queue from the level files — O(log T) stats, no block walk. */
function seedQueue(q: ReadyQueue, treePath: string, T: number): void {
  q.built.clear();
  for (let size = MIN_LEVEL; size <= Math.max(T, MIN_LEVEL); size *= 2) {
    q.built.set(size, count(levelPath(treePath, size)));
  }
  q.T = T;
  q.ready = computeReady(q.built, T);
}

/**
 * Record a node that was just written. Its parent becomes ready once both halves are built, and
 * the next block at its level becomes the new head — the two enqueues the spec names (§4).
 */
function markBuilt(q: ReadyQueue, lo: number, hi: number, T: number): void {
  const size = hi - lo;
  q.built.set(size, (q.built.get(size) ?? 0) + 1);
  q.ready = q.ready.filter(([a, b]) => a !== lo || b !== hi);

  const k = q.built.get(size) ?? 0;
  const nlo = k * size;
  const nhi = nlo + size;
  if (nhi <= T && (size === MIN_LEVEL || (q.built.get(size / 2) ?? 0) >= 2 * k + 2)) {
    pushReady(q, [nlo, nhi]);
  }

  const parentSize = size * 2;
  // The parent's index is the child's left edge over the parent size — floored, because a right
  // half (lo not a multiple of the parent size) still belongs to the parent below it.
  const parentK = Math.floor(lo / parentSize);
  const parentLo = parentK * parentSize;
  if (
    parentSize <= T &&
    parentLo + parentSize <= T &&
    (q.built.get(size) ?? 0) >= 2 * parentK + 2
  ) {
    pushReady(q, [parentLo, parentLo + parentSize]);
  }
}

// --- §3 F3 — the persisted view --------------------------------------------

/** The view lives beside the tree directory, so it travels with it (§3.2). */
export function viewPath(treePath: string): string {
  return path.join(path.dirname(treePath), "view.json");
}

/**
 * §3 F5 — the view: a tiling of [0,T) in which no block covers a single message, so the view never
 * holds a whole message (not even the last one). It is `cover` with a minimum block size of 2: the
 * finest level is a pair. A singleton is reached only by `zoom`, never by the view.
 */
export function viewTiling(T: number, budget: number): Array<[number, number]> {
  if (T <= 0) return [];
  if (T <= budget) {
    // Every block is a pair; an odd tail's last pair overshoots by one message, which is the only
    // way to keep the tiling aligned and gapless without a singleton.
    const out: Array<[number, number]> = [];
    for (let lo = 0; lo < T; lo += 2) out.push([lo, lo + 2]);
    return out;
  }

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (coverAt(T, mid, MIN_LEVEL).length > budget) lo = mid;
    else hi = mid;
  }
  const out = coverAt(T, hi, MIN_LEVEL);
  while (out.length < budget) {
    let pick = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i][1] - out[i][0] > MIN_LEVEL) pick = i;
    }
    if (pick < 0) break;
    const [a, b] = out[pick];
    const mid = (a + b) / 2;
    out.splice(pick, 1, [a, mid], [mid, b]);
  }
  return out;
}

/**
 * §3.2 — write the view. `[l, i]` pairs are the spec's node addresses: `node(l, i)` covers `2^l`
 * messages from `i·2^l`. Written to a temp file then renamed, so a crash never leaves a half-view;
 * a failed write is swallowed — the view is a cache, and a read must never break on it.
 */
export function saveView(
  treePath: string,
  T: number,
  blocks: ReadonlyArray<readonly [number, number]>,
): void {
  try {
    const p = viewPath(treePath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const nodes = blocks.map(([lo, hi]) => {
      const size = hi - lo;
      return [Math.round(Math.log2(size)), lo / size];
    });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, t: T, nodes }));
    fs.renameSync(tmp, p);
  } catch {
    // a corrupt or unwritable view is recomputed next time; never fatal
  }
}

/**
 * §3.2 — read the saved view, or `null` when it is absent, corrupt, or does not describe a valid
 * tiling of `T` (a stale log length, a non-block range, a gap, a size-1 block). Never throws.
 */
export function readView(treePath: string, T: number): Array<[number, number]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(viewPath(treePath), "utf-8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, t, nodes } = parsed as { v?: unknown; t?: unknown; nodes?: unknown };
  if (v !== 1 || t !== T || !Array.isArray(nodes)) return null;

  const blocks: Array<[number, number]> = [];
  let cursor = 0;
  for (const node of nodes) {
    if (!Array.isArray(node) || node.length !== 2) return null;
    const [l, i] = node as [unknown, unknown];
    if (!Number.isInteger(l) || !Number.isInteger(i)) return null;
    const size = 2 ** (l as number);
    const lo = (i as number) * size;
    const hi = lo + size;
    if (!isBlock(lo, hi)) return null; // size ≥ 2, power of two, aligned
    if (lo !== cursor) return null; // gapless and ordered from 0
    cursor = hi;
    blocks.push([lo, hi]);
  }
  if (blocks.length === 0) return T === 0 ? [] : null;
  if (cursor < T) return null; // does not cover the log
  return blocks;
}

/**
 * §3.2 — the view for `T`: the saved one when it is present and valid, otherwise recomputed (and
 * saved). The view is never rebuilt from the log while a valid one exists.
 */
export function loadView(treePath: string, T: number, budget: number): Array<[number, number]> {
  const loaded = readView(treePath, T);
  if (loaded !== null) return loaded;
  const computed = viewTiling(T, budget);
  saveView(treePath, T, computed);
  return computed;
}

/**
 * Drop every persisted summary and the saved view, and reset the in-memory ready queue.
 * Called by retention AFTER the head is pruned: tree positions are dense indices into
 * `store.records`, so a prune shifts every surviving record under its summary — a node built
 * over positions [0,2) would otherwise keep describing the pruned records. The compactor
 * rebuilds lazily from the new dense space; reads fall back to raw records meanwhile (T2/T3).
 * Never throws: a cache that can break pruning is worse than a stale one.
 */
export function invalidateTree(treePath: string): void {
  QUEUES.delete(treePath);
  try {
    fs.rmSync(treePath, { recursive: true, force: true });
  } catch {
    // Best-effort: the level files are a rebuildable cache.
  }
  try {
    fs.rmSync(viewPath(treePath), { force: true });
  } catch {
    // Best-effort: loadView recomputes a missing view.
  }
}

/**
 * `openTreeStore(treePath, logLength)` — a binary summary tree over the log.
 *
 * Layout (REPORT-v3 §1): one file per level, named by its block size. Block `[lo,hi)` at level
 * `size = hi-lo` lives at offset `(lo/size) * TREE_REC`. Each level is a dense prefix, so its
 * length says exactly how far that level got — O(1) lookup, one `stat` per level.
 */
export function openTreeStore(treePath: string, logLength = 0): TreeStore {
  const store: TreeStore = {
    logLength,

    getNode(lo: number, hi: number): string | null {
      if (!isBlock(lo, hi)) return null;
      const size = hi - lo;
      const p = levelPath(treePath, size);
      let fd: number;
      try {
        fd = fs.openSync(p, "r");
      } catch {
        return null; // not built yet; any other failure is real and must surface
      }
      try {
        const buf = Buffer.alloc(TREE_REC);
        const read = fs.readSync(fd, buf, 0, TREE_REC, (lo / size) * TREE_REC);
        if (read < TREE_REC) return null;
        return decodeRecord(buf);
      } finally {
        fs.closeSync(fd);
      }
    },

    putNode(lo: number, hi: number, summary: string): boolean {
      if (!isBlock(lo, hi)) return false;
      const size = hi - lo;
      const p = levelPath(treePath, size);
      fs.mkdirSync(treePath, { recursive: true });
      repair(p);
      // T4 — the dense-prefix CAS: a level is built strictly in order, so this is the whole
      // serialisation mechanism. Position IS identity, so a wrong offset is never written.
      if (count(p) !== lo / size) return false;
      // Seed the queue BEFORE the append, so its counts are the pre-build ones markBuilt extends.
      const q = queueFor(treePath);
      if (q.T !== store.logLength) seedQueue(q, treePath, store.logLength);
      fs.appendFileSync(p, encodeRecord(summary));
      markBuilt(q, lo, hi, store.logLength);
      return true;
    },

    ready(limit?: number): Array<[number, number]> {
      // §4 F13 — never scan for work. Seed once per log length; the queue is kept current by
      // markBuilt as nodes land.
      const q = queueFor(treePath);
      if (q.T !== store.logLength) seedQueue(q, treePath, store.logLength);
      const out = q.ready.slice();
      return limit && limit > 0 ? out.slice(0, limit) : out;
    },

    pending(limit?: number): Array<[number, number]> {
      // OptMem `pending(d, T)` — smallest first. A level file holds a dense prefix, so its length
      // says how far it got; `T` is a snapshot, so each level is clamped at zero.
      const todo: Array<[number, number]> = [];
      const T = store.logLength;
      for (let size = MIN_LEVEL; size <= T; size *= 2) {
        const have = count(levelPath(treePath, size));
        for (let k = have; k < Math.floor(T / size); k++) {
          todo.push([k * size, (k + 1) * size]);
          if (limit && todo.length >= limit) return todo; // OptMem: a limit of 0 means none
        }
      }
      return todo;
    },

    cover(T: number, budget: number): Array<[number, number]> {
      // OptMem `cover` (`memo:105-131`): at most `budget` blocks tiling [0,T), finest near T.
      // Detail decays with age, so recent records stay verbatim and ancient ones collapse.
      if (T <= 0) return [];
      if (T <= budget) return Array.from({ length: T }, (_, i) => [i, i + 1] as [number, number]);

      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (coverAt(T, mid).length > budget) lo = mid;
        else hi = mid;
      }
      const out = coverAt(T, hi);
      // Block sizes jump in powers of two, so alpha alone can undershoot the budget. Spend what
      // is left on the present, where detail is worth most.
      while (out.length < budget) {
        let pick = -1;
        for (let i = 0; i < out.length; i++) {
          if (out[i][1] - out[i][0] > 1) pick = i; // the largest remaining block is the last one
        }
        if (pick < 0) break;
        const [a, b] = out[pick];
        const mid = (a + b) / 2;
        out.splice(pick, 1, [a, mid], [mid, b]);
      }
      return out;
    },
  };

  return store;
}

/**
 * One alpha of `cover`'s bisection: keep a block whole iff its size is at most `alpha * age`. The
 * age is measured from the block's first message (`T - lo`) — inherited verbatim from OptMem, and
 * deliberately kept: `docs/research/optmem-2026-10-08/A-merge-order-verification.md` shows the
 * spec's `T - (hi-1)` would move our tiling away from push. `minSize` is 1 for `cover` and 2 for
 * the F5 view.
 */
function coverAt(T: number, alpha: number, minSize = 1): Array<[number, number]> {
  let root = 1;
  while (root < T) root *= 2;
  const out: Array<[number, number]> = [];
  const stack: Array<[number, number]> = [[0, root]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (lo >= T) continue;
    const size = hi - lo;
    if (size > minSize && (hi > T || size > alpha * (T - lo))) {
      const mid = (lo + hi) / 2;
      stack.push([mid, hi], [lo, mid]);
    } else {
      out.push([lo, hi]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/**
 * §4.1 `zoom` validation: `hi - lo` a power of two, `lo` aligned, `0 <= lo < hi <= n`. A singleton
 * has no children, so it is not a valid zoom target either.
 *
 * Each rejection mode carries its own string (not one shared "invalid zoom range"): F4's
 * agent-error corpus counts `fail()` strings to rank mis-call modes, so distinct strings are the
 * counting key. Keep the `invalid zoom range: ` prefix so old substring matches still hit.
 */
export function validateZoomRange(
  lo: number,
  hi: number,
  n: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(lo) || !Number.isInteger(hi))
    return { ok: false, error: "invalid zoom range: lo and hi must be integers" };
  if (!(lo >= 0 && lo < hi && hi <= n))
    return { ok: false, error: `invalid zoom range: need 0 <= lo < hi <= ${n} (got ${lo}, ${hi})` };
  const size = hi - lo;
  if (!isPowerOfTwo(size) || size < MIN_LEVEL)
    return {
      ok: false,
      error: `invalid zoom range: hi-lo must be a power of two >= 2 (got ${size})`,
    };
  if (lo % size !== 0)
    return {
      ok: false,
      error: `invalid zoom range: lo must be a multiple of hi-lo (lo=${lo}, size=${size})`,
    };
  return { ok: true };
}

/**
 * §4.1 `zoom` — descend one level. Each child is raw when it is a singleton, otherwise the stored
 * summary (empty when the node is not built yet; never a throw). `rawAt` supplies the raw text for
 * a size-1 child, which lives in the log, not the tree — the tree is a leaf module with no store.
 *
 * `zoom(lo, lo+2)` yields two raw singletons, so a caller still reaches one whole message even
 * though the F5 view never volunteers one.
 */
export function zoom(
  tree: TreeStore,
  lo: number,
  hi: number,
  rawAt?: (seq: number) => string,
): Array<{ lo: number; hi: number; size: number; raw: boolean; text: string }> {
  const mid = (lo + hi) / 2;
  return [
    [lo, mid],
    [mid, hi],
  ].map(([a, b]) => {
    const size = b - a;
    return size === 1
      ? { lo: a, hi: b, size, raw: true, text: rawAt?.(a) ?? "" }
      : { lo: a, hi: b, size, raw: false, text: tree.getNode(a, b) ?? "" };
  });
}
