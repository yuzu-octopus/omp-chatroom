import { test, expect } from "bun:test";
import { RAW_MAX, TREE_REC, openTreeStore, validateZoomRange, zoom } from "../src/store/tree-store";
import { COMPACT_MAX_CALLS_PER_DAY, compactOnce, withWriteMutex } from "../src/store/compactor";

test("cover(1000, 96) returns ≤ 96 blocks tiling [0,1000) with no gap or overlap", () => {
  throw new Error("not implemented");
});

test("putNode refuses an out-of-order write (count != lo//size → false)", () => {
  throw new Error("not implemented");
});

test("forget(lo, hi) truncates all level files from lo//size upward; the log is untouched", () => {
  throw new Error("not implemented");
});

test("zoom(lo, hi) returns two children (raw if size 1, summary otherwise)", () => {
  throw new Error("not implemented");
});

test("compactor builds a pending node via streamSimple with @smol (stream mocked)", () => {
  throw new Error("not implemented");
});

test("compaction spend cap is a daily RATE: after COMPACT_MAX_CALLS_PER_DAY calls the compactor pauses", () => {
  throw new Error("not implemented");
});

test("tree rebuild: build → forget → rebuild from log → identical", () => {
  throw new Error("not implemented");
});

test("a summary exceeding TREE_REC bytes is truncated, not fatal", () => {
  throw new Error("not implemented");
});
