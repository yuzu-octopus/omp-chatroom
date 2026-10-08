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
  // `store.roomId` comes from `local://room/config.json` — a file any agent can write — so it is
  // room-authored data and must be escaped like everything else. It previously reached the system
  // prompt raw, outside the untrusted region.
  const header = [
    `Room ${room(store.roomId)} — ${store.members.size} member(s) · ${store.records.length} record(s)`,
  ];
  // Never truncated (§5.4 U8): the viewer's cursor + lag, and the active caps.
  const footer = [
    `Your cursor: ${cursor} · lag: ${lag}`,
    `Caps: roster=${ROSTER_CAP} claims=${DIGEST_CLAIMS_CAP} digestBudgetTokens=${budgetTokens}` +
      ` claimTtlMs=${DEFAULT_ROOM_CONFIG.claimTtlMs} maxBodyBytes=${DEFAULT_ROOM_CONFIG.maxBodyBytes}`,
  ];

  // Non-idle first so the roster truncation drops idle agents first (§5.4 U8).
  const roster = AgentRegistry.global()
    .list()
    .sort(
      (a, b) =>
        (a.status === "idle" ? 1 : 0) - (b.status === "idle" ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, ROSTER_CAP)
    .map(
      (ref) =>
        `- ${room(ref.id)} [${ref.status}] · cursor=${cursorFor(store, ref.id)} · lag=${lagFor(store, ref.id)}`,
    );

  // Highest remaining TTL first so the claims truncation drops the shortest-TTL claim first (§5.4 U8).
  const claims = [...store.claims.values()]
    .sort((a, b) => b.acquiredAt + b.ttlMs - (a.acquiredAt + a.ttlMs))
    .slice(0, DIGEST_CLAIMS_CAP)
    .map((claim) => {
      const left = Math.max(0, Math.round((claim.acquiredAt + claim.ttlMs - now) / 1000));
      return `- ${room(claim.resource)} held by ${room(claim.holder)} · ${left}s left`;
    });

  // Option A (§1.4): the raw tail is the whole backlog — there is no cold-tree item.
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
