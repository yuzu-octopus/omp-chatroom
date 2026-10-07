import * as fs from "node:fs";
import * as path from "node:path";

// §3.6 — verbatim, plus `logLength`: OptMem passes the log length `T` to `pending(d, T)` on every
// call; here the store carries it, because the interface the plan fixes has no `T` parameter.
export interface TreeStore {
  getNode(lo: number, hi: number): string | null;
  putNode(lo: number, hi: number, summary: string): boolean;
  forget(lo: number, hi: number): void;
  pending(limit?: number): Array<[number, number]>;
  cover(T: number, budget: number): Array<[number, number]>;
  /** [invented] the log length the tiling is computed against; refresh it as the log grows. */
  logLength: number;
}

export const TREE_REC = 288; // §5.2
export const RAW_MAX = 16; // §3.6 merge shape
export const COVER_BUDGET_LINES = 96; // §5.2 (OptMem WAKE_LINES)
export const RAW_TAIL_R = 50; // §5.2 (matches §3.5 join cursor)

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

function truncateTo(p: string, bytes: number): void {
  const fd = fs.openSync(p, "r+");
  try {
    fs.ftruncateSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Cut `text` to `maxBytes` UTF-8 bytes without splitting a code point. OptMem `die()`s on an
 * over-long summary (`memo:296-299`); the plan (T3) requires graceful truncation instead — the
 * tail is lost, the node stays usable.
 */
function truncateBytes(text: string, maxBytes: number): string {
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

/** One fixed-width record: text, space padding, then the newline in the last byte. */
function encodeRecord(summary: string): Buffer {
  // A record is one line: an embedded newline would shift every later record's offset.
  const flat = summary.replace(/[\r\n]+/g, " ");
  const text = Buffer.from(truncateBytes(flat, SUMMARY_BYTES), "utf-8");
  const rec = Buffer.alloc(TREE_REC, 0x20);
  text.copy(rec, 0);
  rec[TREE_REC - 1] = 0x0a;
  return rec;
}

function decodeRecord(buf: Buffer): string | null {
  const text = buf.toString("utf-8").replace(/\s+$/, "");
  return text.length === 0 ? null : text;
}

/**
 * `openTreeStore(treePath, logLength)` — a binary summary tree over the log.
 *
 * Layout (REPORT-v3 §1): one file per level, named by its block size. Block `[lo,hi)` at level
 * `size = hi-lo` lives at offset `(lo/size) * TREE_REC`. Each level is a dense prefix, so its
 * length says exactly how far that level got — O(1) lookup, one `stat` per level.
 */
export function openTreeStore(treePath: string, logLength = 0): TreeStore {
  const levelPath = (size: number): string => path.join(treePath, String(size));

  /** Existing level files, ascending — used by `forget` so it needs no log length. */
  const levels = (): number[] => {
    let names: string[];
    try {
      names = fs.readdirSync(treePath);
    } catch {
      return [];
    }
    return names
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= MIN_LEVEL)
      .sort((a, b) => a - b);
  };

  const store: TreeStore = {
    logLength,

    getNode(lo: number, hi: number): string | null {
      if (!isBlock(lo, hi)) return null;
      const size = hi - lo;
      const p = levelPath(size);
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
      const p = levelPath(size);
      fs.mkdirSync(treePath, { recursive: true });
      repair(p);
      // T4 — the dense-prefix CAS: a level is built strictly in order, so this is the whole
      // serialisation mechanism. Position IS identity, so a wrong offset is never written.
      if (count(p) !== lo / size) return false;
      fs.appendFileSync(p, encodeRecord(summary));
      return true;
    },

    forget(lo: number, hi: number): void {
      if (!isBlock(lo, hi)) return;
      const size0 = hi - lo;
      // §3.6 invalidation — truncate every level from `lo//size` upward, dropping the target and
      // all ancestors. Later blocks at those levels go too and are rebuilt; the log is untouched.
      for (const size of levels()) {
        if (size < size0) continue;
        const p = levelPath(size);
        const k = Math.floor(lo / size);
        if (count(p) > k) truncateTo(p, k * TREE_REC);
      }
    },

    pending(limit?: number): Array<[number, number]> {
      // OptMem `pending(d, T)` — smallest first. A level file holds a dense prefix, so its length
      // says how far it got; `T` is a snapshot, so each level is clamped at zero.
      const todo: Array<[number, number]> = [];
      const T = store.logLength;
      for (let size = MIN_LEVEL; size <= T; size *= 2) {
        const have = count(levelPath(size));
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

/** One alpha of `cover`'s bisection: keep a block whole iff its size is at most `alpha * age`. */
function coverAt(T: number, alpha: number): Array<[number, number]> {
  let root = 1;
  while (root < T) root *= 2;
  const out: Array<[number, number]> = [];
  const stack: Array<[number, number]> = [[0, root]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (lo >= T) continue;
    const size = hi - lo;
    if (size > 1 && (hi > T || size > alpha * (T - lo))) {
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
 */
export function validateZoomRange(
  lo: number,
  hi: number,
  n: number,
): { ok: true } | { ok: false; error: string } {
  const invalid = { ok: false, error: "invalid zoom range" } as const;
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return invalid;
  if (!(lo >= 0 && lo < hi && hi <= n)) return invalid;
  const size = hi - lo;
  if (!isPowerOfTwo(size) || size < MIN_LEVEL) return invalid;
  if (lo % size !== 0) return invalid;
  return { ok: true };
}

/**
 * §4.1 `zoom` — descend one level. Each child is raw when it is a singleton, otherwise the stored
 * summary (empty when the node is not built yet; never a throw). `rawAt` supplies the raw text for
 * a size-1 child, which lives in the log, not the tree — the tree is a leaf module with no store.
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
