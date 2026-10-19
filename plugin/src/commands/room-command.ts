import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { resourceKey } from "../ids";
import { openRoomPanel } from "../panel/panel";
import { contended, grant, reclaimIfStale, release } from "../store/claims";
import {
  configPath,
  DEFAULT_ROOM_CONFIG,
  loadRoomConfig,
  type RoomConfig,
  resolveRoomConfig,
  saveRoomConfig,
} from "../store/config";
import { cursorFor, initCursor, lagFor } from "../store/cursors";
import { type RoomStore, roomStoreFor } from "../store/room-store";
import { appendedSince, notifyRecipients } from "../tools/room";

export const ROOM_COMMAND_NAME = "room";

// Subcommand set: exactly the shipped `room` ops, plus `config` (P7/R6 — the
// manifest settings are unreachable from extension code, so the command is the human surface).
export const ROOM_SUBCOMMANDS = ["board", "join", "claim", "release", "post", "config"] as const;
export type RoomSubcommand = (typeof ROOM_SUBCOMMANDS)[number];

/** Structural subset of the host's `AutocompleteItem` (value/label/description are what it renders). */
export interface RoomCompletion {
  value: string;
  label: string;
  description?: string;
}

const SUBCOMMAND_HELP: Readonly<Record<RoomSubcommand, string>> = {
  board: "claims, roster and per-agent lag",
  join: "join the room and mint your cursor",
  claim: "claim <topic> <key> [ttlMs] — take exclusive ownership",
  release: "release <topic> <key> — drop a claim you hold",
  post: "post <topic> <body> — append a message",
  config: "show the resolved config; `config set <key>=<value>` writes it",
};

const USAGE = `usage: /room [<${ROOM_SUBCOMMANDS.join("|")}>]`;

// §3.4 — the `room` tool clamps with these bounds; the command must not accept a wider lease.
const CLAIM_TTL_MIN_MS = 1_000;
const CLAIM_TTL_MAX_MS = 86_400_000;

/** K22/S1 — the same escaping pair the tool uses; room text is untrusted wherever it is rendered. */
function safe(text: string): string {
  return escapeHarnessTags(sanitizeText(text));
}

/**
 * M7/§6.10 — tab-completable. Returns the subcommands filtered by prefix; ALWAYS an array
 * (never `null`) so the dropdown is driven by this list and not by the host's fallback.
 */
export function roomCompletions(prefix: string): RoomCompletion[] {
  const lower = prefix.trim().toLowerCase();
  return ROOM_SUBCOMMANDS.filter((sub) => sub.startsWith(lower)).map((sub) => ({
    value: sub,
    label: sub,
    description: SUBCOMMAND_HELP[sub],
  }));
}

/**
 * The command's only output channel. `notify` is a no-op without a UI, so a headless session
 * (print/RPC) still runs every op and still records its result in the host log (§6.8 R5).
 */
function report(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
  else pi.logger.info(`[room] ${message}`);
}

/** §4.1 board return shape, rendered for a human instead of for `details`. */
function boardLines(store: RoomStore, viewerId: string): string[] {
  const registry = AgentRegistry.global();
  const lines = [
    `room ${safe(store.roomId)} — ${store.members.size} member(s) · ${store.claims.size} claim(s) · ${store.records.length} record(s)`,
  ];

  if (store.claims.size === 0) lines.push("claims: none");
  for (const claim of store.claims.values()) {
    const left = Math.max(0, Math.round((claim.acquiredAt + claim.ttlMs - Date.now()) / 1000));
    const waiting = contended(store, claim.resource).length;
    lines.push(
      `claim ${safe(claim.resource)} · holder ${safe(claim.holder)} · ${left}s left` +
        (waiting > 0 ? ` · ${waiting} waiting` : ""),
    );
  }

  if (store.members.size === 0) lines.push("roster: empty");
  for (const member of store.members.values()) {
    const status = registry.get(member.agentId)?.status ?? "unknown";
    lines.push(
      `member ${safe(member.agentId)} [${status}] · cursor ${cursorFor(store, member.agentId)}` +
        ` · lag ${lagFor(store, member.agentId)}`,
    );
  }

  const cursor = cursorFor(store, viewerId);
  const topics = new Map<string, { lastSeq: number; unread: number }>();
  for (const record of store.records) {
    if (record.kind !== "msg" && record.kind !== "note") continue;
    let row = topics.get(record.topic);
    if (!row) {
      row = { lastSeq: record.seq, unread: 0 };
      topics.set(record.topic, row);
    }
    row.lastSeq = record.seq;
    if (record.seq > cursor) row.unread += 1;
  }
  if (topics.size === 0) lines.push("topics: none");
  for (const [topic, row] of topics) {
    lines.push(`topic ${safe(topic)} · last seq ${row.lastSeq} · unread ${row.unread}`);
  }
  return lines;
}

/** One `key=value` pair from `config set`; `null` = unknown key or unparseable value. */
function coerceSetting(key: string, raw: string): string | number | boolean | null {
  const current = (DEFAULT_ROOM_CONFIG as unknown as Record<string, unknown>)[key];
  if (current === undefined) return null;
  if (typeof current === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof current === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  }
  return raw;
}

function configLines(pi: ExtensionAPI, store: RoomStore): string[] {
  const config = resolveRoomConfig(pi, store.root);
  return [
    `room config — ${safe(configPath(store.root))}`,
    `live: roomId=${safe(config.roomId)} · claimTtlMs=${config.claimTtlMs}` +
      ` · maxBodyBytes=${config.maxBodyBytes} · digestBudgetTokens=${config.digestBudgetTokens}`,
    `live (governor): maxT1PerTurn=${config.maxT1PerTurn} · maxT1Tokens=${config.maxT1Tokens}` +
      ` · coalesceCount=${config.coalesceCount} · coalesceMs=${config.coalesceMs}` +
      ` · postsPerWindow=${config.postsPerWindow} · burstPosts=${config.burstPosts}`,
    `live (retention/sweep): logMaxRecords=${config.logMaxRecords} · logMaxAgeMs=${config.logMaxAgeMs}` +
      ` · claimSweepMs=${config.claimSweepMs} · compactionCallsPerDay=${config.compactionCallsPerDay}`,
    `flags: --room-panel-key="${String(pi.getFlag("room-panel-key") ?? "")}" (opens the panel; empty = disabled)`,
  ];
}

export function registerRoomCommand(pi: ExtensionAPI): void {
  // §6.1
  pi.registerCommand(ROOM_COMMAND_NAME, {
    description: "Open the agent chatroom panel, or run a room subcommand",
    getArgumentCompletions: (prefix: string) => roomCompletions(prefix),
    handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      const raw = args.trim();
      const gap = raw.search(/\s/);
      const sub = (gap < 0 ? raw : raw.slice(0, gap)).toLowerCase();
      const rest = gap < 0 ? "" : raw.slice(gap + 1).trim();

      // §6.1 — bare `/room` opens the panel. `openRoomPanel` degrades (notify / no-op) without a
      // TUI, so a headless caller never throws; the subcommands below stay unchanged.
      if (sub === "") {
        await openRoomPanel(pi, ctx);
        return;
      }
      if (!(ROOM_SUBCOMMANDS as readonly string[]).includes(sub)) {
        report(ctx, pi, `unknown subcommand "${safe(sub)}" — ${USAGE}`, "warning");
        return;
      }

      // U6 — a missing/unwritable/corrupt room file is reported, never thrown at the command layer.
      let store: RoomStore;
      try {
        store = roomStoreFor(ctx);
      } catch (error) {
        report(
          ctx,
          pi,
          `room unavailable: ${error instanceof Error ? error.message : "corrupt log"}`,
          "error",
        );
        return;
      }
      const agentId = ctx.agent.id;

      switch (sub as RoomSubcommand) {
        case "board": {
          for (const line of boardLines(store, agentId)) report(ctx, pi, line);
          return;
        }

        case "join": {
          // §4.1 join idempotency — a second join is a no-op: no second member record.
          if (!store.cursors.has(agentId)) {
            store.append({ kind: "member", from: agentId, action: "join" });
            initCursor(store, agentId);
          }
          report(
            ctx,
            pi,
            `room join → ${safe(store.roomId)} · ${store.claims.size} claim(s) · ${store.members.size} member(s)` +
              ` · cursor ${cursorFor(store, agentId)}`,
          );
          return;
        }

        case "claim": {
          const [topic, key, ttlArg] = rest.split(/\s+/).filter(Boolean);
          if (!topic || !key) {
            report(ctx, pi, "claim requires <topic> <key> [ttlMs]", "warning");
            return;
          }
          const resource = resourceKey(topic, key);
          const requested =
            ttlArg === undefined ? resolveRoomConfig(pi, store.root).claimTtlMs : Number(ttlArg);
          // Math.max/Math.min propagate NaN instead of clamping it: without this guard a typo'd
          // TTL appends a NaN lease, which JSON persists as ttlMs:null and replay quarantines as
          // gap{reason:"invalid"} — the claim silently never existed after a restart.
          if (!Number.isFinite(requested)) {
            report(
              ctx,
              pi,
              `claim: bad ttlMs "${ttlArg}" — expected a number of milliseconds`,
              "warning",
            );
            return;
          }
          const ttlMs = Math.min(
            CLAIM_TTL_MAX_MS,
            Math.max(CLAIM_TTL_MIN_MS, Math.trunc(requested)),
          );
          const before = store.seq;
          const result = grant(store, resource, agentId, ttlMs);
          if (!result.ok) {
            report(
              ctx,
              pi,
              `room claim ${safe(resource)} → denied, held by ${safe(result.holder)}`,
              "warning",
            );
            return;
          }
          // Same delivery pass as the tool path (room.ts claim): waiters wake, recipients notify.
          store.members.get(agentId)?.heldTopics.add(topic);
          const failure = await notifyRecipients(
            pi,
            ctx,
            store,
            appendedSince(store, before),
            agentId,
          );
          report(
            ctx,
            pi,
            `room claim ${safe(resource)} → granted, expires in ${Math.round(ttlMs / 1000)}s`,
          );
          if (failure !== undefined) report(ctx, pi, `delivery: ${safe(failure)}`, "warning");
          return;
        }

        case "release": {
          const [topic, key] = rest.split(/\s+/).filter(Boolean);
          if (!topic || !key) {
            report(ctx, pi, "release requires <topic> <key>", "warning");
            return;
          }
          const resource = resourceKey(topic, key);
          const held = store.claims.get(resource);
          if (!held) {
            report(ctx, pi, `room release ${safe(resource)} → unknown resource`, "warning");
            return;
          }
          const before = store.seq;
          if (held.holder !== agentId) {
            // §4.1 — a reclaim against a stale claim is explicit, never silent.
            const outcome = reclaimIfStale(store, resource, Date.now());
            if (outcome.reclaimed) {
              const failure = await notifyRecipients(
                pi,
                ctx,
                store,
                appendedSince(store, before),
                agentId,
              );
              const successor =
                outcome.holder === null ? " (lease dropped)" : ` → ${safe(outcome.holder)}`;
              report(ctx, pi, `room release ${safe(resource)} → reclaimed (was stale)${successor}`);
              if (failure !== undefined) report(ctx, pi, `delivery: ${safe(failure)}`, "warning");
              return;
            }
            report(
              ctx,
              pi,
              `room release ${safe(resource)} → denied, held by ${safe(held.holder)}`,
              "warning",
            );
            return;
          }
          release(store, resource, agentId, "released");
          const failure = await notifyRecipients(
            pi,
            ctx,
            store,
            appendedSince(store, before),
            agentId,
          );
          report(ctx, pi, `room release ${safe(resource)} → released`);
          if (failure !== undefined) report(ctx, pi, `delivery: ${safe(failure)}`, "warning");
          return;
        }

        case "post": {
          const bodyGap = rest.search(/\s/);
          const topic = bodyGap < 0 ? rest : rest.slice(0, bodyGap);
          const body = bodyGap < 0 ? "" : rest.slice(bodyGap + 1);
          if (!topic || body === "") {
            report(ctx, pi, "post requires <topic> <body>", "warning");
            return;
          }
          // K19 — the cap is enforced before the record is drafted; never truncated silently.
          const maxBodyBytes = resolveRoomConfig(pi, store.root).maxBodyBytes;
          if (Buffer.byteLength(body, "utf-8") > maxBodyBytes) {
            report(ctx, pi, `body exceeds maxBodyBytes (${maxBodyBytes})`, "error");
            return;
          }
          const record = store.append({ kind: "msg", from: agentId, topic, body });
          const member = store.members.get(agentId);
          if (member) {
            member.lastMessageId = record.id;
            member.topics.add(topic);
          }
          const failure = await notifyRecipients(pi, ctx, store, [record], agentId);
          report(ctx, pi, `room post → ${safe(topic)} · seq ${record.seq}`);
          if (failure !== undefined) report(ctx, pi, `delivery: ${safe(failure)}`, "warning");
          return;
        }

        case "config": {
          const [action, assignment] = rest.split(/\s+/).filter(Boolean);
          if (action !== "set") {
            for (const line of configLines(pi, store)) report(ctx, pi, line);
            return;
          }
          if (!assignment) {
            report(ctx, pi, "config set requires <key>=<value>", "warning");
            return;
          }
          const eq = assignment.indexOf("=");
          const key = eq < 0 ? assignment : assignment.slice(0, eq);
          const value = eq < 0 ? "" : assignment.slice(eq + 1);
          const coerced = coerceSetting(key, value);
          if (coerced === null) {
            report(ctx, pi, `config: unknown key or bad value for "${safe(key)}"`, "warning");
            return;
          }
          const next: RoomConfig = { ...loadRoomConfig(store.root) };
          (next as unknown as Record<string, string | number | boolean>)[key] = coerced;
          saveRoomConfig(store.root, next);
          report(
            ctx,
            pi,
            `room config → ${safe(key)}=${safe(String(coerced))} written to ${safe(configPath(store.root))}`,
          );
          return;
        }
      }
    },
  });
}
