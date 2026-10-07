// §3.6 — verbatim
export interface TreeStore {
  getNode(lo: number, hi: number): string | null;
  putNode(lo: number, hi: number, summary: string): boolean;
  forget(lo: number, hi: number): void;
  pending(limit?: number): Array<[number, number]>;
  cover(T: number, budget: number): Array<[number, number]>;
}

export const TREE_REC = 288;        // §5.2
export const RAW_MAX = 16;          // §3.6 merge shape
export const COVER_BUDGET_LINES = 96;   // §5.2 (OptMem WAKE_LINES)
export const RAW_TAIL_R = 50;           // §5.2 (matches §3.5 join cursor)

export function openTreeStore(treePath: string): TreeStore {
  throw new Error("not implemented");
}
export function zoom(tree: TreeStore, lo: number, hi: number): Array<{ lo: number; hi: number; size: number; raw: boolean; text: string }> {  // §4.1
  throw new Error("not implemented");
}
export function validateZoomRange(lo: number, hi: number, n: number): { ok: true } | { ok: false; error: string } {  // §4.1
  throw new Error("not implemented");
}
