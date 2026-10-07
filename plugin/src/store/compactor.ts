import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { streamSimple } from "@oh-my-pi/pi-ai";       // root export, NOT a deep import (K21/F3)
import type { RoomStore } from "./room-store";
import { TREE_REC } from "./tree-store";
export const COMPACT_JOBS = 8;                    // §5.2 [invented]
export const COMPACT_MAX_CALLS_PER_DAY = 20_000;  // K4 — a RATE cap [calibrate]
export const SUMMARY_MAX_BYTES = 288;             // = TREE_REC
export const COMPACT_INTERVAL_MS = 5_000;         // [invented]
export const COMPACT_MAX_RETRIES = 3;             // §3.6 [invented]

export function withWriteMutex<T>(criticalSection: () => Promise<T>): Promise<T> {   // §3.6 verbatim
  throw new Error("not implemented");
}
export function startCompactor(store: RoomStore, ctx: ExtensionContext): void {
  throw new Error("not implemented");
}
export function stopCompactor(root: string): void {                        // [invented]
  throw new Error("not implemented");
}
export function compactionSpendToday(): number {                           // [invented] T5 cap probe
  throw new Error("not implemented");
}
export function compactOnce(store: RoomStore, ctx: ExtensionContext, block: [number, number]): Promise<boolean> {
  throw new Error("not implemented");
}
export function summarizeBlock(ctx: ExtensionContext, store: RoomStore, lo: number, hi: number): Promise<string> {  // [invented]
  throw new Error("not implemented");
}
