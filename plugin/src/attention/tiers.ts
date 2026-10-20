import { topicOf } from "../ids";
import type { MemberState } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
// K11 — Tier is declared ONCE, here; imported by delivery.ts, tools/room.ts, panel/chat-pane.ts.
export type Tier = "T0" | "T1" | "T2";

// K12 — TOTAL over all 6 RoomRecord kinds (switch with no default). `gap` → T1 (a promised notify);
// `release{reason:"released"}` has its own arm; every arm returns.
//
// M11 — a `release` is classified on `prevHolder`, NEVER on `from` (on a reclaim `from` is the NEW
// claimant, the agent that lost nothing) and NEVER on `reason` (`reason:"reclaimed"` is one record
// that cannot be targeted to a single viewer, so it used to fire T0 for everyone). Self-authored
// suppression is a DELIVERY-layer concern (§5.3), not a tier predicate.
export function classify(record: RoomRecord, viewer: MemberState): Tier {
  switch (record.kind) {
    case "msg":
      if (record.mention?.includes(viewer.agentId)) return "T0"; // @mention → T0
      if (record.replyTo !== undefined && record.replyTo === viewer.lastMessageId) return "T0";
      if (viewer.heldTopics.has(record.topic)) return "T1"; // claim held on topic
      if (viewer.topics.has(record.topic)) return "T1"; // followed topic
      if (record.threadRoot !== undefined && viewer.threadRoots.has(record.threadRoot)) return "T1";
      return "T2";
    case "claim":
      if (record.resource === viewer.waitedResource) return "T1"; // M-8 waiter
      if (viewer.topics.has(topicOf(record.resource))) return "T1";
      return "T2";
    case "release":
      if (record.prevHolder === viewer.agentId) return "T0"; // your lease was revoked/expired
      if (record.resource === viewer.waitedResource) return "T1"; // wait_for_claim waiter
      if (record.reason === "released" && viewer.topics.has(topicOf(record.resource))) return "T1";
      return "T2";
    case "note": // system-generated only
      return viewer.topics.has(record.topic) ? "T1" : "T2";
    case "member": // join/leave
      return "T2";
    case "gap":
      return "T1"; // K12 — a promised notify
    case "contended":
      // Bookkeeping: a claim attempt that lost. The loser already knows it lost, and the holder
      // does not need an interrupt for it — the record is for the LOG (contention is measurable),
      // not for anyone's context.
      return "T2";
  }
}
