import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { MemberState } from "../store/room-store";
import type { RoomStore } from "../store/room-store";
import { cursorFor, lagFor } from "../store/cursors";
export const DIGEST_BUDGET_TOKENS = 2_500;  // K5 [calibrate] — the routing rule is NOT counted
export const ROSTER_CAP = 32;               // §5.4
export const DIGEST_CLAIMS_CAP = 10;        // §5.4

// §5.4 items 1-6 ONLY. The routing rule is appended separately by the hook (K5), so the budget
// never truncates it. Every room-authored string entering the digest is escaped (K22).
export function buildDigest(store: RoomStore, viewer: MemberState, budgetTokens = DIGEST_BUDGET_TOKENS): string {
  throw new Error("not implemented");
}

export const DIGEST_TRUNCATION_ORDER: readonly ["cold-tree", "raw-tail", "claims", "roster"] =
  ["cold-tree", "raw-tail", "claims", "roster"];   // §5.4 U8
