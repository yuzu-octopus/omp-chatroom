import { AgentRegistry, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { IrcBus, type IrcBusApi } from "@oh-my-pi/pi-coding-agent/irc/bus";
import type { IrcMessage } from "@oh-my-pi/pi-tui/tools/irc";
import { cardTypeFor } from "../cards/message-cards";
import { safeRoomText } from "../onboarding/escape";
import { bumpCursor, markDeliveredT0 } from "../store/cursors";
import { type RoomStore, roomStoreFor } from "../store/room-store";
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
 * The plugin only needs the message ISSUED. So the wait is bounded: 250 ms is short enough that a
 * post never stalls on a target's turn — and it expires ROUTINELY, because a live recipient's send
 * resolves at the end of ITS turn. The expiry is the steady state, not an error: it is handled as
 * "issued, unconfirmed" (see `SendOutcome`), never as a failure.
 */
export const SEND_ACCEPT_BOUND_MS = 250;

/**
 * The outcome of a bounded send.
 *
 * Three states, and the third one matters:
 * - **accepted** — the host took the message. `sendCustomMessage` resolves `true` when it started
 *   a turn, and `false` when it did not: in the STREAMING branch every `deliverAs` arm
 *   (`steer`/`aside`/`followUp`/`nextTurn`) queues the message into the running turn and
 *   `return false` (agent-session.ts:10499-10541). So `false` means "no turn was started", NOT
 *   "declined": the message IS in the target's session, and whether a turn started is the host's
 *   business. A streaming T0/T1 is the common case, and its `false` is the steady state. The one
 *   `false` that is a genuine drop — the `aside` arm's `#sessionGenerationChanged` guard, which
 *   returns before queueing — is indistinguishable from a queue at this boundary (and rare); the
 *   alternative, calling every streaming `false` a failure, is the re-steer storm this fixed.
 * - **uncertain** — the bound expired before the host answered. The send WAS issued; its fate is
 *   unknown, so `deliver` records it as GIVEN but does not move the cursor (the record stays
 *   readable).
 * - **failed** — the send was rejected, or the target exposes no send capability at all
 *   (`sendToTarget`'s own `ok:false`): nothing was issued, so the record stays owed.
 *
 * A `false` resolution is NOT a failure: mapping it to `ok:false` reported `deliveryError` for a
 * queued message and left the record un-given, so the next pass re-steered the same mention.
 */
export type SendOutcome = { ok: true; accepted: boolean } | { ok: false; error: unknown };

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
    // ANY resolution is acceptance. The host resolves `false` for a QUEUED message — every
    // streaming `deliverAs` arm returns false after queueing it into the running turn
    // (agent-session.ts:10499-10541) — so `false` says "no turn was started", not "declined".
    // Only a rejection (or the no-capability arm in `sendToTarget`) means nothing was issued.
    () => ({ ok: true, accepted: true }),
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
    // No timer, so the send is not even awaited: its fate is unknown.
    return { ok: true, accepted: false };
  }
  let timer: Timer | undefined;
  try {
    return await Promise.race([
      settled,
      new Promise<SendOutcome>((resolve) => {
        // The bound expired: the send was issued, but the host has not answered. UNCERTAIN.
        timer = schedule(() => resolve({ ok: true, accepted: false }), SEND_ACCEPT_BOUND_MS);
      }),
    ]);
  } finally {
    // The bound is a deadline, not a job: it is cleared on every path (I4).
    if (timer !== undefined) timers.clearTimer?.(timer);
  }
}

/**
 * The subset of a target session this module needs, expressed structurally.
 *
 * 18.18.1 split the session surface: `AgentSessionHandle` (what `AgentRegistry.get().session`
 * is typed as) no longer declares `sendCustomMessage`, and a worker-thread peer session exposes
 * `deliverIrcMessage` INSTEAD of it. A room whose mentions only worked on the main thread would
 * be a room that dies at `task.workerThreads` scale (host default: workers from the 9th
 * concurrent subagent), so the send is capability-dispatched rather than assumed.
 */
type CustomSendCapable = {
  sendCustomMessage: (payload: unknown, options: unknown) => Promise<boolean>;
};
type IrcDeliverCapable = {
  deliverIrcMessage: (msg: IrcMessage) => Promise<"injected" | "woken">;
};

/**
 * Deliver one room message to `target`'s session, bounded.
 *
 * Two paths, in capability order:
 * 1. `sendCustomMessage` — the main-thread host session. Carries our card (`customType` +
 *    `details`), so the recipient sees the room's own block, and honours `deliverAs`/`triggerTurn`.
 * 2. `deliverIrcMessage` — a worker-thread peer session, the host's own cross-agent channel. The
 *    body is the same rendered line; the card is the host's IRC block, which is what a peer can
 *    actually receive. Returns `injected` (queued into a running turn) or `woken` (started one):
 *    both are deliveries — as is `sendCustomMessage`'s `false`, which says the same thing (queued
 *    into the running turn; no turn started).
 *
 * Both are awaited through {@link sendBounded}: the host resolves a send when the target's TURN
 * ends, and awaiting that from inside a delivery pass deadlocks the room (see the bound's note).
 */
export async function sendToTarget(
  ctx: ExtensionContext,
  session: unknown,
  target: string,
  message: { from: string; content: string; payload: Record<string, unknown>; options: unknown },
): Promise<SendOutcome> {
  const custom = session as Partial<CustomSendCapable>;
  if (typeof custom?.sendCustomMessage === "function") {
    return await sendBounded(
      ctx,
      Promise.resolve(custom.sendCustomMessage(message.payload, message.options)),
    );
  }
  const irc = session as Partial<IrcDeliverCapable>;
  if (typeof irc?.deliverIrcMessage === "function") {
    const msg: IrcMessage = {
      id: `${message.from}:${target}:${Date.now()}`, // room-local id: the host only carries it
      from: message.from,
      to: target,
      body: message.content,
      ts: Date.now(),
    };
    return await sendBounded(ctx, Promise.resolve(irc.deliverIrcMessage(msg)));
  }
  // Neither capability: nothing was issued, and saying "delivered" would be a lie.
  return { ok: false, error: new Error("the target session accepts no agent message") };
}

/**
 * Send one room message to a peer whose ref has NO live session — a parked (kept-alive but
 * detached) or aborted subagent.
 *
 * The host's own `agent://<id>` path reaches those peers by REVIVING them from their transcript,
 * and that revival lives in `IrcBus.#deliver` (`lifecycle.ensureLive` for a `parked`/`aborted`
 * ref), not in the session handle we otherwise use: a parked ref has no session to call. Without
 * this edge a mention to a parked peer was skipped in silence — the common case in a long-running
 * swarm, where every idle worker is parked and only the busy ones have a session.
 *
 * The receipt is the host's own verdict: `revived`, `injected` and `woken` all mean the message
 * reached the peer (a revival starts a turn); `failed` means it did not, and names why (an
 * unknown id, a read-only advisor, a revive that could not be rebuilt) — which must surface as a
 * `deliveryError` rather than a quiet drop.
 */
export async function sendToParkedPeer(
  ctx: ExtensionContext,
  from: string,
  to: string,
  content: string,
): Promise<SendOutcome> {
  const bus = (IrcBus as { global?: () => IrcBusApi }).global?.();
  if (bus === undefined) {
    return {
      ok: false,
      error: new Error("no IRC bus is installed, so a parked peer cannot be reached"),
    };
  }
  const settled = Promise.resolve(bus.send({ from, to, body: content, broadcast: false })).then(
    (receipt) =>
      receipt.outcome === "failed"
        ? {
            ok: false as const,
            error: new Error(receipt.error ?? "the host could not reach the peer"),
          }
        : { ok: true as const, accepted: true },
    (error: unknown) => ({ ok: false as const, error }),
  );
  return await sendBounded(ctx, settled);
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
  // the K/B cap refused; a T0 batch only until its ONE summary is issued, and a GIVEN record not
  // at all — cursors.ts). NO cursor bump may cross it — not the T0/T1 bump and not the T2 bump —
  // otherwise a delivered record that sits ABOVE an owed one pushes the cursor past it and
  // `room{op:"read"}` (which starts at the cursor) could never return the owed record.
  // `bumpCursor` is monotonic, so a later capped bump cannot pull it back.
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
    //
    // R5 — the record IS consumed (the cursor moves past it, so it will never be pushed), so it
    // counts as a T2 delivery even though nothing was injected: the tier distribution is the
    // share of the room's traffic that each tier carries.
    store.deliveries.T2++;
    bumpCursor(store, target, Math.min(record.seq, cap));
    return;
  }

  // Resolve the destination BEFORE deriving the payload: an advisor or an unknown id is skipped or
  // reported, and that decision must not depend on work (cardTypeFor/escaping) it cannot use.
  const ref = target === ctx.agent.id ? null : AgentRegistry.global().get(target);
  // A peer with NO session is parked (kept-alive, detached) or aborted — not gone. The host's IRC
  // bus revives exactly those from their transcript (`lifecycle.ensureLive` in `IrcBus.#deliver`),
  // which is why a mention reaches them through the bus and not through a session handle. Skipping
  // them silently was the bug: in a long-running swarm every idle worker is parked, so the mention
  // that matters most — to the agent that is not busy yet — was the one that vanished.
  // Reviving a peer costs a transcript load and a turn, so only a DELIBERATE interrupt pays for it:
  // a T0 (a mention of it, or its own lease being revoked). Topic chatter (T1) and the T2 pass
  // never revive anyone — the record waits above the cursor until the peer is live again, which
  // is what `room{op:"read"}` and the join backlog are for.
  const needsBus = target !== ctx.agent.id && tier === "T0" && ref != null && ref.session == null;
  if (target !== ctx.agent.id && ref == null) {
    // Not a registry id at all: no session to send to and no transcript to revive. A mention that
    // reaches nobody is worse than no mention — the poster believes it notified someone — so this
    // is reported as a delivery failure (the pass collects it into `deliveryError`) instead of a
    // quiet skip.
    throw new Error(`mention ${target} is not a known agent, so nothing was delivered to it`);
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
    recordDelivery(store, target, record, tier);
    bumpCursor(store, target, Math.min(record.seq, cap));
    return;
  }
  // The send resolves when the TARGET'S TURN ends — so it is bounded (see `sendBounded`). A
  // rejection inside the bound is a transport failure: it propagates to the delivery pass, which
  // reports it as `deliveryError`, and the cursor is NOT bumped (the record is still owed). The
  // host's `false` is NOT a failure: it queued the message into a streaming turn and started no
  // turn (agent-session.ts:10499-10541), which is acceptance.
  const outcome = needsBus
    ? await sendToParkedPeer(ctx, ctx.agent.id, target, content)
    : await sendToTarget(ctx, ref!.session, target, {
        from: ctx.agent.id,
        content,
        payload,
        options,
      });
  if (!outcome.ok) throw outcome.error;
  if (!outcome.accepted) {
    // UNCERTAIN: the send was issued, but the host never answered inside the bound — the steady
    // state for a live recipient, whose send resolves at the END of its turn. Record it as GIVEN
    // (the next pass must not storm the target with duplicates, and the owed floor must not pin
    // the cursor at seq-1 for good) but do NOT advance the cursor: it was never confirmed, so
    // the record stays above the cursor and `room{op:"read"}` can still return it.
    markDeliveredT0(store.root, target, record.seq);
    return;
  }
  recordDelivery(store, target, record, tier);
  bumpCursor(store, target, Math.min(record.seq, cap));
}

/**
 * R5 — the delivery, recorded as telemetry.
 *
 * The tier count is in memory: a log record per delivery would cost one fsync each (measured:
 * 3.3 ms on the room store's filesystem), and a post that reaches ten agents would cost the
 * delivery path 33 ms of pure fsync. A **T0** is also logged: it is rare, its cost is noise next
 * to the send it precedes, and it is the interruption budget — the number nobody else publishes.
 */
function recordDelivery(store: RoomStore, target: string, record: RoomRecord, tier: Tier): void {
  store.deliveries[tier]++;
  if (tier === "T0") {
    // A delivered T0 is remembered: while an older record is still owed the cursor cannot advance
    // past it, and without this the next pass would select and RE-SEND it (a wake+steer storm).
    // The registry also keeps the given seq out of the owed floor — a delivered T0 owes nothing,
    // so it must not pin the cursor cap at seq-1 for every later delivery (cursors.ts).
    markDeliveredT0(store.root, target, record.seq);
    store.append({
      kind: "delivered",
      from: target,
      deliveredSeq: record.seq,
      tier,
    });
  }
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
    case "contended":
      return `${record.from} wanted ${record.resource} — held by ${record.holder}`;
    case "wait":
      return `${record.from} waited for ${record.target} — ${record.outcome}`;
    case "delivered":
      return `${record.from} got seq ${record.deliveredSeq} at ${record.tier}`;
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
          : record.kind === "contended"
            ? `resource:${safeRoomText(record.resource)}`
            : record.kind === "wait"
              ? `wait:${safeRoomText(record.target)}`
              : record.kind === "delivered"
                ? `tier:${record.tier}`
                : `topic:${safeRoomText(record.topic)}`; // msg | note
  return `[${tier}] room ⟵ ${safeRoomText(record.from)} · ${where} · ${safeBody}`;
}

// §5.3 S1+S2 — delegates to the shared escaper so every room-facing surface is marker-safe.
export function escapeForDelivery(body: string): string {
  return safeRoomText(body);
}
