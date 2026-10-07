import type { MemberState } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
// K11 — Tier is declared ONCE, here; imported by delivery.ts, tools/room.ts, panel/chat-pane.ts.
export type Tier = "T0" | "T1" | "T2";

// K12 — TOTAL over all 6 RoomRecord kinds (switch with no default). `gap` → T1 (a promised notify);
// `release{reason:"released"}` has its own arm; every arm returns.
export function classify(record: RoomRecord, viewer: MemberState): Tier {
  throw new Error("not implemented");
}

export const HELD_CLAIM_WINDOW_MS = 3_600_000;   // §5.1 1 h window [invented value]
