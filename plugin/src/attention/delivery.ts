import { AgentRegistry, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { cardTypeFor } from "../cards/message-cards";
import { bumpCursor } from "../store/cursors";
import type { RoomRecord } from "../store/schema";
import type { Tier } from "./tiers";
// §5.3 — verbatim.
export async function deliver(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: string,
  record: RoomRecord,
  tier: Tier,
): Promise<void> {
  throw new Error("not implemented");
}

// K2 — dispatch on record.kind FIRST; never touch a field the kind does not have. The `body` field
// exists only on msg/note, so `deliver` must derive the body per kind before escaping anything.
export function roomBodyOf(record: RoomRecord): string {      // [invented]
  throw new Error("not implemented");
}

// K17 — the model-facing line: tier badge · from · topic|resource · escaped body.
export function renderLine(record: RoomRecord, safeBody: string, tier: Tier): string {   // [invented]
  throw new Error("not implemented");
}

// §5.3 S1+S2 — the sanitising pair used on every delivery and every rendered line.
export function escapeForDelivery(body: string): string {     // [invented name]
  throw new Error("not implemented");
}
