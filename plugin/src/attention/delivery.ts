import { AgentRegistry, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { cardTypeFor } from "../cards/message-cards";
import { safeRoomText } from "../onboarding/escape";
import { bumpCursor, markDeliveredT0 } from "../store/cursors";
import { roomStoreFor } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import type { Tier } from "./tiers";

/**
 * The send-acceptance bound, in ms.
 *
 * The host's `sendCustomMessage` resolves when the TARGET'S WHOLE TURN ends, not when the message
 * is accepted: at an idle session both `deliverAs: "aside"` and `deliverAs: "steer"` +
 * `triggerTurn` go through `promptAgentInitiatedMessage`, which resolves only once the target's
 * turn — every one of its tool calls — is over. Awaiting that inside a delivery pass DEADLOCKS
 * the room: A's pass waits for B's turn, B's turn calls `room{op:"post"}`, and that post's pass
 * waits for A's pass. One stuck pass blocks every later post in the room, and the room root is
 * shared by the main session and every subagent — so it blocks the whole swarm.
 *
 * The plugin only needs the message ACCEPTED, and the host accepts it as soon as the message is
 * queued into the target's session. So the wait is bounded: 250 ms is long enough that a healthy
 * transport resolves well inside it (the send resolves on acceptance; only the TURN is slow) and
 * short enough that a post never stalls on a target's turn.
 */
export const SEND_ACCEPT_BOUND_MS = 250;

/** The outcome of a bounded send: accepted (or the bound expired) vs a transport failure. */
export type SendOutcome = { ok: true } | { ok: false; error: unknown };

/**
 * Await a send with a deadline, so a delivery pass never waits for the target's TURN.
 *
 * The send's rejection is ALWAYS observed: `settled` carries both handlers, so a rejection that
 * arrives AFTER the bound has expired is swallowed (never an unhandled rejection) instead of
 * escalating. A rejection that arrives inside the bound is returned to the caller, which rethrows
 * it so the delivery pass reports it as `deliveryError` — and the cursor stays where it was.
 */
export async function sendBounded(
  ctx: ExtensionContext,
  send: Promise<unknown>,
): Promise<SendOutcome> {
  const settled: Promise<SendOutcome> = send.then(
    () => ({ ok: true }),
    (error: unknown) => ({ ok: false, error }),
  );
  // A ctx without the host's timer API has no deadline — and a raw timer is forbidden (I4).
  // The host ALWAYS provides `ctx.setTimeout`; a test double that does not must not get the
  // unbounded wait either (that is the deadlock the bound exists to prevent), so the send is
  // issued and NOT awaited: the outcome is still observed (`settled` carries both handlers) but
  // the caller does not block on the target's turn.
  const timers = ctx as Partial<Pick<ExtensionContext, "setTimeout" | "clearTimer">>;
  const schedule = timers.setTimeout?.bind(ctx);
  if (schedule === undefined) {
    void settled;
    return { ok: true };
  }
  let timer: Timer | undefined;
  try {
    return await Promise.race([
      settled,
      new Promise<SendOutcome>((resolve) => {
        timer = schedule(() => resolve({ ok: true }), SEND_ACCEPT_BOUND_MS);
      }),
    ]);
  } finally {
    // The bound is a deadline, not a job: it is cleared on every path (I4).
    if (timer !== undefined) timers.clearTimer?.(timer);
  }
}

// §5.3 — verbatim, plus `extra` — the optional digest lines (the T2 coalescing digest) that ride
// the same message, so the digest never needs a timer or a second push channel (§5.2 N/T).
export async function deliver(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: string,
  record: RoomRecord,
  tier: Tier,
  extra: readonly string[] = [],
  cursorCap?: number,
): Promise<void> {
  const store = roomStoreFor(ctx);

  // The floor for this target's cursor: the seq just below the oldest record it still OWES (a T1
  // the K/B cap refused, or a T0 past the batch ceiling). NO cursor bump may cross it — not the
  // T0/T1 bump and not the T2 bump — otherwise a delivered record that sits ABOVE an owed one
  // pushes the cursor past it and `room{op:"read"}` (which starts at the cursor) could never
  // return the owed record. `bumpCursor` is monotonic, so a later capped bump cannot pull it back.
  const cap = cursorCap ?? record.seq;

  // M11 companion — never deliver an agent its own action back. A voluntary release has
  // `prevHolder === from === the releaser`, so `classify` returns T0 for it; an own `msg` on a
  // followed topic would otherwise echo back as T1. Actor kinds only: `note`/`gap` are
  // system-generated and their `from` is not an actor. Delivery-layer suppression only.
  const actorKind =
    record.kind === "msg" ||
    record.kind === "claim" ||
    record.kind === "release" ||
    record.kind === "member";
  if (actorKind && record.from === target) {
    bumpCursor(store, target, Math.min(record.seq, cap));
    return;
  }

  if (tier === "T2") {
    // pull-only: cursor only, never injected.
    //
    // The cursor must not advance past a record the target has NOT seen: a T1 record the K/B cap
    // refused, or a T0 record past the batch ceiling, still sits above the cursor and is still
    // readable. `cursorCap` is that floor (the seq just below the oldest owed record). Without it
    // a T2 delivery would skip the owed record and `room{op:"read"}` could never return it.
    bumpCursor(store, target, Math.min(record.seq, cap));
    return;
  }

  // Resolve the destination BEFORE deriving the payload: a parked/aborted ref is skipped, and the
  // skip must not depend on work (cardTypeFor/escaping) that a parked target cannot use.
  const ref = target === ctx.agent.id ? null : AgentRegistry.global().get(target);
  if (target !== ctx.agent.id && !ref?.session) {
    return; // parked/aborted → skip, do not throw
  }

  // K2 — dispatch on record.kind FIRST and derive the body per kind. `record.body` exists only on
  // `msg`/`note`; reading it before the dispatch is a runtime TypeError on exactly the T0 events
  // ("your claim was revoked"). Only the RESULTING string is escaped.
  const safeBody = escapeForDelivery(roomBodyOf(record));
  const line = renderLine(record, safeBody, tier); // K17 — from · topic · tier badge
  const content = [line, ...extra].join("\n");
  const payload = {
    customType: cardTypeFor(record),
    content,
    display: true,
    details: record,
  };
  // T0 must reach an agent whether it is streaming or idle. `deliverAs: "steer"` steers a running
  // agent — the host's steering queue, delivered at the target's next step boundary, the same
  // mechanism a parent's `agent://<id>` message uses (neither aborts the running tool call) — but,
  // per the host rule at agent-session.ts:8796-8798 ("Explicit `deliverAs` queues without starting a
  // turn in either state"), an explicit deliverAs at an IDLE session only appends — no turn. A
  // mention that does not wake the agent it names is a mention that does nothing, so T0 also sets
  // `triggerTurn`: the host checks it before the idle fallthrough (agent-session.ts:8758) and starts
  // a turn, while the streaming branch ignores it and steers.
  const options =
    tier === "T0"
      ? { deliverAs: "steer" as const, triggerTurn: true }
      : { deliverAs: "aside" as const };

  if (target === ctx.agent.id) {
    pi.sendMessage(payload, options);
    if (tier === "T0") markDeliveredT0(store.root, target, record.seq);
    bumpCursor(store, target, Math.min(record.seq, cap));
    return;
  }
  // The send resolves when the TARGET'S TURN ends — so it is bounded (see `sendBounded`). A
  // rejection inside the bound is a transport failure: it propagates to the delivery pass, which
  // reports it as `deliveryError`, and the cursor is NOT bumped (the record is still owed).
  const outcome = await sendBounded(
    ctx,
    Promise.resolve(ref!.session!.sendCustomMessage(payload, options)),
  );
  if (!outcome.ok) throw outcome.error;
  // A delivered T0 is remembered: while an older record is still owed the cursor cannot advance
  // past it, and without this the next pass would select and RE-SEND it (a wake+steer storm).
  if (tier === "T0") markDeliveredT0(store.root, target, record.seq);
  bumpCursor(store, target, Math.min(record.seq, cap));
}
export function roomBodyOf(record: RoomRecord): string {
  switch (record.kind) {
    case "msg":
    case "note":
      return record.body; // the only kinds with `body`
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
  // K22/S1 — the topic and the resource are room-authored (any agent picks them), so they go
  // through the escaper like the body: an unescaped `</room-authored>` in a topic name would
  // close the digest's own region and let a post forge a harness block in the recipient.
  const where =
    record.kind === "claim" || record.kind === "release"
      ? `resource:${safeRoomText(record.resource)}`
      : record.kind === "member"
        ? "presence"
        : record.kind === "gap"
          ? "retention"
          : `topic:${safeRoomText(record.topic)}`; // msg | note
  return `[${tier}] room ⟵ ${safeRoomText(record.from)} · ${where} · ${safeBody}`;
}

// §5.3 S1+S2 — delegates to the shared escaper so every room-facing surface is marker-safe.
export function escapeForDelivery(body: string): string {
  return safeRoomText(body);
}
