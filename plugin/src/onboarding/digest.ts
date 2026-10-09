import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_ROOM_CONFIG } from "../store/config";
import { cursorFor, lagFor } from "../store/cursors";
import type { MemberState, RoomStore } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import { safeRoomText } from "./escape";
export const DIGEST_BUDGET_TOKENS = 3_800; // K5/X3 — measured band max + margin; rule NOT counted
export const ROSTER_CAP = 32; // §5.4
export const DIGEST_CLAIMS_CAP = 10; // §5.4
export const RAW_TAIL_R = 50; // §5.4/§3.5 — Option A's only backlog item is the raw tail
const BACKLOG_BODY_CHARS = 240; // [invented] — one record must never eat the whole budget

// §3.3 — the claim TTL is rendered as a coarse bucket, never a per-second countdown: a countdown
// made every render of an unchanged room differ, so no turn's digest was a prefix of the next.
// The spec fixes no width; a whole minute is the coarsest bucket that still orders the truncation
// (§5.4 U8 drops the shortest remaining TTL first).
const TTL_BUCKET_MS = 60_000; // [invented]

// §5.4 — the untrusted-region marker every agent-derived digest string is rendered inside (K22).
export const UNTRUSTED_OPEN = '<room-authored untrusted="true">';
export const UNTRUSTED_CLOSE = "</room-authored>";

// K5 — the budget is enforced against a cheap estimate, not a real tokenizer: the host exposes no
// public counter, and 4 chars/token is the standard approximation the §5.4 band was measured with.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// K22/V1 — the digest reaches the SYSTEM PROMPT, so every room-authored string goes through the
// shared escaper (`./escape`). It also covers the `<room-authored>` marker itself, so room text can
// never close its own region.
const room = safeRoomText;

// K2 — the model-facing body of a record, derived per kind (not every kind carries `body`).
function recordLine(record: RoomRecord): string {
  switch (record.kind) {
    case "msg":
      return `${record.from} → ${record.topic}: ${oneLine(record.body)}`;
    case "note":
      return `note ${record.from} → ${record.topic}: ${oneLine(record.body)}`;
    case "claim":
      return `claim ${record.from} → ${record.resource}`;
    case "release":
      return `release ${record.from} → ${record.resource} (${record.reason})`;
    case "member":
      return `member ${record.from} ${record.action}`;
    case "gap":
      return `gap ${record.from} skipped ${record.skipped} (${record.reason})`;
  }
}

function oneLine(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > BACKLOG_BODY_CHARS ? `${flat.slice(0, BACKLOG_BODY_CHARS)}…` : flat;
}

// §5.4 items 1-6 ONLY. The routing rule is appended separately by the hook (K5), so the budget
// never truncates it. Every room-authored string entering the digest is escaped (K22).
export function buildDigest(
  store: RoomStore,
  viewer: MemberState,
  budgetTokens = DIGEST_BUDGET_TOKENS,
): string {
  const now = Date.now();
  const cursor = cursorFor(store, viewer.agentId);
  const lag = lagFor(store, viewer.agentId);

  // F10 — no uptime: it is wall-clock state that changes every second, pure noise that made the
  // digest different on every turn for no informational gain. (The digest no longer reaches the
  // system prompt at all, but the field was worthless wherever it lived.)

  // §3.3 — the digest is per-turn state, so it must render APPEND-ONLY: a turn's digest is a prefix
  // of the next turn's. The roster's render order is therefore keyed on the agent id alone, the one
  // thing that cannot change under an agent. Sorting idle agents last (as this did) put a status
  // in the order key, so a single running→idle transition moved that agent to the end of the list
  // and rewrote every line below it.
  //
  // §5.4 U8 survives: idle agents are still the first to be cut when ROSTER_CAP bites — but that is
  // a SELECTION pass, resolved before the render, so it decides who is dropped without reordering
  // who stays. (`list()` returns a fresh array, so both sorts are on a private copy.)
  const roster = AgentRegistry.global()
    .list()
    .sort(
      (a, b) =>
        (a.status === "idle" ? 1 : 0) - (b.status === "idle" ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, ROSTER_CAP)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (ref) =>
        `- ${room(ref.id)} [${ref.status}] · cursor=${cursorFor(store, ref.id)} · lag=${lagFor(store, ref.id)}`,
    );

  // Two counts, named distinctly: `joined` is the room's member set (agents that sent
  // member{join}); `live` is the registry population the roster below prints (roster-capped).
  // They are different sets — an agent can be live without having joined — so reporting only one
  // beside the other's list read as a contradiction ("0 member(s)" above a full roster). Both
  // Both numbers are derived, not room-authored, so neither needs `room()` escaping.
  // `store.roomId` comes from `local://room/config.json` — a file any agent can write — so it IS
  // room-authored data and stays escaped here.
  const header = [
    `Room ${room(store.roomId)} — ${store.members.size} joined · ${roster.length} live · ${store.records.length} record(s)`,
  ];
  // Never truncated (§5.4 U8): the viewer's cursor + lag, and the active caps.
  const footer = [
    `Your cursor: ${cursor} · lag: ${lag}`,
    `Caps: roster=${ROSTER_CAP} claims=${DIGEST_CLAIMS_CAP} digestBudgetTokens=${budgetTokens}` +
      ` claimTtlMs=${DEFAULT_ROOM_CONFIG.claimTtlMs} maxBodyBytes=${DEFAULT_ROOM_CONFIG.maxBodyBytes}`,
  ];

  // Highest expiry first, so the claims truncation drops the shortest-TTL claim first (§5.4 U8).
  // The key is `acquiredAt + ttlMs` — a fixed value per claim — so the order never moves as the
  // clock advances (unlike a remaining-TTL countdown, which changes every second).
  //
  // §3.3 — what the line RENDERS is coarse: the remaining time is a whole-minute bucket, so it only
  // changes when it crosses a minute boundary, and the claim's absolute expiry (a fixed timestamp,
  // so it is byte-identical on every render) carries the rest. A per-second "Ns left" countdown
  // made every render of an unchanged room differ, so no turn's digest was a prefix of the next.
  const claims = [...store.claims.values()]
    .sort((a, b) => b.acquiredAt + b.ttlMs - (a.acquiredAt + a.ttlMs))
    .slice(0, DIGEST_CLAIMS_CAP)
    .map((claim) => {
      const expiresAt = claim.acquiredAt + claim.ttlMs;
      const remainingMs = expiresAt - now;
      const left = remainingMs <= 0 ? "expired" : `${Math.ceil(remainingMs / TTL_BUCKET_MS)}m left`;
      const at = new Date(expiresAt);
      const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
      return `- ${room(claim.resource)} held by ${room(claim.holder)} · ${left} (expires ${clock})`;
    });

  // Option A (§1.4): the raw tail is the whole backlog — there is no cold-tree item.
  //
  // §3.3 — this section is the digest's tail, so it must be append-only: each line is derived from
  // its own record alone, so a record that is still inside the window renders byte-identically on
  // every later turn, and new records only ever append at the end. Only log events can remove a
  // line from its front: the log outgrowing the R=50 window, and retention pruning the head (§3.6,
  // which appends its own `gap` record). Nothing here re-derives or re-orders a surviving line.
  const backlog = store.records.slice(-RAW_TAIL_R).map((r) => `[${r.seq}] ${room(recordLine(r))}`);

  const render = (rosterCount: number, claimCount: number, backlogDropped: number): string => {
    const lines = [...header, UNTRUSTED_OPEN];
    if (rosterCount > 0) lines.push("Roster:", ...roster.slice(0, rosterCount));
    if (claimCount > 0) lines.push("Open claims:", ...claims.slice(0, claimCount));
    if (backlogDropped < backlog.length) lines.push("Recent:", ...backlog.slice(backlogDropped));
    lines.push(UNTRUSTED_CLOSE, ...footer);
    return lines.join("\n");
  };

  let rosterCount = roster.length;
  let claimCount = claims.length;
  let backlogDropped = 0;
  let out = render(rosterCount, claimCount, backlogDropped);
  // §5.4 U8 truncation order: oldest backlog records → shortest-TTL claims → idle roster.
  while (estimateTokens(out) > budgetTokens) {
    if (backlogDropped < backlog.length) backlogDropped += 1;
    else if (claimCount > 0) claimCount -= 1;
    else if (rosterCount > 0) rosterCount -= 1;
    else break; // the untruncatable floor alone exceeds the budget — keep the floor
    out = render(rosterCount, claimCount, backlogDropped);
  }
  return out;
}
