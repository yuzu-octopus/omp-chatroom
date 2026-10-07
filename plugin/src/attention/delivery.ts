import { AgentRegistry, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { cardTypeFor } from "../cards/message-cards";
import { bumpCursor } from "../store/cursors";
import { roomStoreFor } from "../store/room-store";
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
  const store = roomStoreFor(ctx);

  // M11 companion — never deliver an agent its own action back. A voluntary release has
  // `prevHolder === from === the releaser`, so `classify` returns T0 for it; an own `msg` on a
  // followed topic would otherwise echo back as T1. Actor kinds only: `note`/`gap` are
  // system-generated and their `from` is not an actor. Delivery-layer suppression only.
  const actorKind = record.kind === "msg" || record.kind === "claim"
    || record.kind === "release" || record.kind === "member";
  if (actorKind && record.from === target) {
    bumpCursor(store, target, record.seq);
    return;
  }

  if (tier === "T2") {                                   // pull-only: cursor only, never injected
    bumpCursor(store, target, record.seq);
    return;
  }

  // Resolve the destination BEFORE deriving the payload: a parked/aborted ref is skipped, and the
  // skip must not depend on work (cardTypeFor/escaping) that a parked target cannot use.
  const ref = target === ctx.agent.id ? null : AgentRegistry.global().get(target);
  if (target !== ctx.agent.id && !ref?.session) {
    return;                                              // parked/aborted → skip, do not throw
  }

  // K2 — dispatch on record.kind FIRST and derive the body per kind. `record.body` exists only on
  // `msg`/`note`; reading it before the dispatch is a runtime TypeError on exactly the T0 events
  // ("your claim was revoked"). Only the RESULTING string is escaped.
  const safeBody = escapeForDelivery(roomBodyOf(record));
  const line = renderLine(record, safeBody, tier);       // K17 — from · topic · tier badge
  const payload = { customType: cardTypeFor(record), content: line, display: true, details: record };
  const options = { deliverAs: tier === "T0" ? ("steer" as const) : ("aside" as const) };

  if (target === ctx.agent.id) {
    pi.sendMessage(payload, options);
    bumpCursor(store, target, record.seq);
    return;
  }
  await ref!.session!.sendCustomMessage(payload, options);
  bumpCursor(store, target, record.seq);
}
export function roomBodyOf(record: RoomRecord): string {
  switch (record.kind) {
    case "msg":
    case "note":
      return record.body;                                // the only kinds with `body`
    case "claim":
      return `${record.from} claimed ${record.resource} (ttl ${Math.round(record.ttlMs / 1000)}s)`;
    case "release":
      return `${record.from} released ${record.resource} — ${record.reason}`;
    case "member":
      return `${record.from} ${record.action === "join" ? "joined" : "left"} the room`;
    case "gap":
      return `${record.skipped} record(s) skipped (${record.reason})`;
  }
}

// K17 — the model-facing line: tier badge · from · topic|resource · escaped body.
export function renderLine(record: RoomRecord, safeBody: string, tier: Tier): string {
  const where = record.kind === "claim" || record.kind === "release" ? `resource:${record.resource}`
    : record.kind === "member" ? "presence"
    : record.kind === "gap" ? "retention"
    : `topic:${record.topic}`;                           // msg | note
  return `[${tier}] room ⟵ ${record.from} · ${where} · ${safeBody}`;
}

// §5.3 S1+S2 — the sanitising pair used on every delivery and every rendered line. Folds in the
// `room-authored` marker, which `escapeHarnessTags` alone does not cover (onboarding/escape.ts).
const ROOM_MARKER_RE = /<(?=\/?room-authored)/gi;
export function escapeForDelivery(body: string): string {
  return escapeHarnessTags(sanitizeText(body)).replace(ROOM_MARKER_RE, "&lt;");
}
