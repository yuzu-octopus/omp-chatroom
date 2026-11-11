import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { recordLine } from "../attention/delivery";
import { resourceKey } from "../ids";
import { safeRoomText } from "../onboarding/escape";
import { openRoomPanel } from "../panel/panel";
import { grant, reclaimIfStale, release, renew } from "../store/claims";
import {
  coerceConfigValue,
  configPath,
  DEFAULT_ROOM_CONFIG,
  loadRoomConfig,
  type RoomConfig,
  saveRoomConfig,
} from "../store/config";
import { cursorFor, initCursor } from "../store/cursors";
// §3.4 — the canonical lease bounds, shared with the tool and with replay, so a widened command
// cannot mint a lease the log validator would quarantine on the next open.
import { CLAIM_TTL_MAX_MS, CLAIM_TTL_MIN_MS } from "../store/log";
import { appendedSince, type RoomStore, roomStoreFor, viewerStateFor } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import {
  COVER_BUDGET_LINES,
  loadView,
  openTreeStore,
  RAW_MAX,
  validateZoomRange,
  zoom,
} from "../store/tree-store";
import {
  buildBoard,
  DEPENDS_ON_MAX_BYTES,
  notifyRecipients,
  overListCap,
  RECALL_LIMIT_MAX,
  RECALL_PATTERN_MAX,
  recallMissRate,
  recallRefusal,
} from "../tools/room";

export const ROOM_COMMAND_NAME = "room";

// Subcommand set: exactly the shipped `room` ops, plus `config` (P7/R6 — the
// manifest settings are unreachable from extension code, so the command is the human surface).
// `read`/`topics`/`mute` stay model-only (they shape attention, not content); `recall`, `tree`
// and `zoom` are exposed read-only (plan 032) because operators need the same retrieval the
// models get. Mute/tree/zoom UX open questions (listed in plans/032): how mute state displays,
// whether zoom needs paging, recall output caps — asked, not answered, by this spike.
export const ROOM_SUBCOMMANDS = [
  "board",
  "join",
  "claim",
  "release",
  "post",
  "config",
  "recall",
  "tree",
  "zoom",
] as const;
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
  claim: "claim <topic> <key> [ttlMs] [dependsOn...] — take exclusive ownership",
  release: "release <topic> <key> — drop a claim you hold",
  post: "post <topic> <body> — append a message",
  config:
    "show the resolved config; `config set <key>=<value>` writes it; `config reset` restores defaults",
  recall: "recall <pattern> — regex search over the raw log (same bounds as the tool op)",
  tree: "show the cold-tree tiling (which seq ranges are raw or summarised)",
  zoom: "zoom <lo> <hi> — descend into a tree node",
};

const USAGE = `usage: /room [<${ROOM_SUBCOMMANDS.join("|")}>]`;

/** K22/S1 — the shared escaper; room text is untrusted wherever it is rendered. */
const safe = safeRoomText;

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
  // The DATA is canonical (tools/room.ts `buildBoard`): one claim/roster/topic scan for both
  // surfaces, so a new field lands in both. Only the RENDERING differs — the human header and
  // the uncapped per-row countdown/counts vs the model's capped waiting/dependsOn lists.
  const viewer = viewerStateFor(store, viewerId);
  const board = buildBoard(store, viewer);
  const lines = [
    `room ${safe(store.roomId)} — ${store.members.size} member(s) · ${store.claims.size} claim(s) · ${store.records.length} record(s)`,
  ];

  if (board.claims.length === 0) lines.push("claims: none");
  for (const claim of board.claims) {
    const left = Math.max(0, Math.round((claim.expiresAt - Date.now()) / 1000));
    lines.push(
      `claim ${safe(claim.resource)} · holder ${safe(claim.holder)} · ${left}s left` +
        (claim.waiting.length > 0 ? ` · ${claim.waiting.length} waiting` : ""),
    );
  }

  if (board.roster.length === 0) lines.push("roster: empty");
  for (const member of board.roster) {
    lines.push(
      `member ${safe(member.agentId)} [${member.status}] · cursor ${member.cursor}` +
        ` · lag ${member.lag}`,
    );
  }

  if (board.topics.length === 0) lines.push("topics: none");
  // Human answer to "muted topics on the board" (asked 2026-11-11): dim, not hidden — a muted
  // topic still exists and still accrues unreads the model path won't push; the marker says why
  // the board is quiet about it. Muted-whole-room ("") dims every topic row.
  for (const row of board.topics) {
    const dimmed = viewer.muted.has("") || viewer.muted.has(row.topic);
    lines.push(
      `topic ${safe(row.topic)} · last seq ${row.lastSeq} · unread ${row.unread}${dimmed ? " · muted" : ""}`,
    );
  }
  return lines;
}

/** One `key=value` pair from `config set`; `null` = unknown key or unparseable value. */
function coerceSetting(
  key: string,
  raw: string,
): { value: string | number; clampedFrom: number | null } | null {
  const current = (DEFAULT_ROOM_CONFIG as unknown as Record<string, unknown>)[key];
  if (current === undefined) return null;
  if (typeof current === "number") {
    // A blank value is not zero: `Number("")` is 0, and a 0 cap (maxBodyBytes,
    // claimTtlMs, …) silently breaks the room. Refuse it like garbage.
    if (raw.trim() === "") return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    // The parse is the only CLI-specific part: the unknown-key check, the type check and the
    // clamp live in the shared `coerceConfigValue`, so the two paths cannot drift.
    const coerced = coerceConfigValue(key, parsed);
    if (coerced === null) return null;
    return { value: coerced.value, clampedFrom: coerced.clamped ? parsed : null };
  }
  return { value: raw, clampedFrom: null };
}

function configLines(pi: ExtensionAPI, store: RoomStore): string[] {
  // 027 — display the live value: the save path refreshes `store.config`, so no re-read is needed.
  const config = store.config;
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
          // The membership check must be on MEMBERS, not on the cursor: the hook's
          // `initCursor` runs for every agent at turn start, so a cursor-keyed check never
          // fires and the agent never gets a `member{join}` record — it stays out of the
          // board roster and out of the log. The tool path checks membership (tools/room.ts).
          if (!store.members.has(agentId)) {
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
          const [topic, key, ttlArg, ...dependsOn] = rest.split(/\s+/).filter(Boolean);
          if (!topic || !key) {
            report(ctx, pi, "claim requires <topic> <key> [ttlMs] [dependsOn...]", "warning");
            return;
          }
          // Dependencies ride after the lease (the tool path's `dependsOn: string[]`, same rule).
          const dependsError =
            dependsOn.length > 0 ? overListCap("dependsOn", dependsOn, DEPENDS_ON_MAX_BYTES) : null;
          if (dependsError !== null) {
            report(ctx, pi, `claim: ${dependsError}`, "warning");
            return;
          }
          const resource = resourceKey(topic, key);
          const requested = ttlArg === undefined ? store.config.claimTtlMs : Number(ttlArg);
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
          const result = grant(store, resource, agentId, ttlMs, dependsOn);
          if (!result.ok) {
            if (result.holder === agentId) {
              const renewed = renew(store, resource, agentId, ttlMs);
              if (renewed.ok) {
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
                  `room claim ${safe(resource)} → renewed, expires in ${Math.round(ttlMs / 1000)}s`,
                );
                if (failure !== undefined) report(ctx, pi, `delivery: ${safe(failure)}`, "warning");
                return;
              }
            }
            // R5 — a lost claim is a measurement, not a silent no-op.
            store.append({
              kind: "contended",
              from: agentId,
              resource,
              holder: result.holder,
            });
            // R3 — the same refusal as the tool path: name every blocker and its holder.
            if ("blockedBy" in result && result.blockedBy.length > 0) {
              const blockers = result.blockedBy
                .map((b) => `${b.resource} (held by ${b.holder})`)
                .join(", ");
              report(
                ctx,
                pi,
                `room claim ${safe(resource)} → blocked — depends on ${safe(blockers)}`,
                "warning",
              );
              return;
            }
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
          // 027 — the live value: `/room config set` refreshes `store.config` below.
          const maxBodyBytes = store.config.maxBodyBytes;
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
          if (action === "reset") {
            // Through the save path (027): the file and the live store agree afterwards.
            saveRoomConfig(store.root, { ...DEFAULT_ROOM_CONFIG, roomId: store.config.roomId });
            store.config = loadRoomConfig(store.root);
            report(ctx, pi, `room config → reset to defaults (roomId kept)`);
            return;
          }
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
          (next as unknown as Record<string, string | number>)[key] = coerced.value;
          saveRoomConfig(store.root, next);
          if (coerced.clampedFrom !== null) {
            report(
              ctx,
              pi,
              `config: ${safe(key)}=${safe(String(coerced.clampedFrom))} out of range, clamped to ${safe(String(coerced.value))}`,
              "warning",
            );
          }
          // The live value follows the file: reload through the coercion path so the next
          // op and pass see the written value (and never a hand-rolled object).
          store.config = loadRoomConfig(store.root);
          report(
            ctx,
            pi,
            `room config → ${safe(key)}=${safe(String(coerced.value))} written to ${safe(configPath(store.root))}`,
          );
          return;
        }

        case "recall": {
          const pattern = rest.trim() === "" ? undefined : rest.trim();
          if (pattern === undefined) {
            report(ctx, pi, "recall requires <pattern>", "warning");
            return;
          }
          // Same bounds as the tool op (same constants, same refusal text): a human pattern
          // must never do what a model pattern cannot.
          if (pattern.length > RECALL_PATTERN_MAX) {
            report(ctx, pi, `pattern too long (max ${RECALL_PATTERN_MAX} chars)`, "warning");
            return;
          }
          const refusal = recallRefusal(pattern);
          if (refusal !== null) {
            report(ctx, pi, refusal, "warning");
            return;
          }
          let regex: RegExp;
          try {
            regex = new RegExp(pattern);
          } catch {
            report(ctx, pi, "invalid regex pattern", "warning");
            return;
          }
          // Same newest-first scan and slice as the tool op (no deadline: human cadence is one
          // recall per command, and the 512-char slice bounds the cost exactly like the tool path).
          const matched: RoomRecord[] = [];
          for (let i = store.records.length - 1; i >= 0; i--) {
            const record = store.records[i]!;
            const line = recordLine(record);
            const probe = line.length > 512 ? line.slice(0, 512) : line;
            if (regex.test(probe)) {
              matched.push(record);
              if (matched.length >= RECALL_LIMIT_MAX) break;
            }
          }
          store.recallStats.recalls += 1;
          const miss = matched.length === 0 && store.records.length > 0;
          if (miss) store.recallStats.misses += 1;
          const missLine = recallMissRate(store);
          report(
            ctx,
            pi,
            `room recall → ${matched.length} match(es)` +
              (missLine === null
                ? ""
                : ` · miss rate ${(missLine.rate * 100).toFixed(1)}% (${missLine.misses}/${missLine.recalls} since open)`),
          );
          for (const record of matched.slice(0, 20)) report(ctx, pi, recordLine(record));
          if (matched.length > 20) {
            report(ctx, pi, `… +${matched.length - 20} more (tool op caps at ${RECALL_LIMIT_MAX})`);
          }
          return;
        }

        case "tree": {
          const n = store.records.length;
          const tiling = loadView(store.treePath, n, COVER_BUDGET_LINES);
          report(ctx, pi, `room tree → ${tiling.length} block(s) over ${n} record(s)`);
          for (const [lo, hi] of tiling) {
            const size = hi - lo;
            report(ctx, pi, `[${lo},${hi}) size ${size} ${size <= RAW_MAX ? "raw" : "summary"}`);
          }
          return;
        }

        case "zoom": {
          const [loRaw, hiRaw] = rest.split(/\s+/).filter(Boolean);
          const lo = loRaw === undefined ? NaN : Number(loRaw);
          const hi = hiRaw === undefined ? NaN : Number(hiRaw);
          if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
            report(ctx, pi, "zoom requires <lo> <hi> (integers)", "warning");
            return;
          }
          const n = store.records.length;
          const validation = validateZoomRange(lo, hi, n);
          if (!validation.ok) {
            report(ctx, pi, validation.error, "warning");
            return;
          }
          const tree = openTreeStore(store.treePath, n);
          const children = zoom(tree, lo, hi, (seq) => {
            const record = store.records[seq];
            return record !== undefined ? recordLine(record) : "";
          });
          // Human answer to "zoom paging" (asked 2026-11-11): cap at 20 rows like the recall
          // cap, with a narrow-the-range hint — a summary block can span hundreds of records.
          report(ctx, pi, `room zoom → ${children.length} child(ren)`);
          for (const c of children.slice(0, 20)) {
            report(
              ctx,
              pi,
              `[${c.lo},${c.hi}) size ${c.size} ${c.raw ? "raw" : "summary"} · ${safe(c.text)}`,
            );
          }
          if (children.length > 20) {
            report(ctx, pi, `… +${children.length - 20} more — narrow lo/hi to page`);
          }
          return;
        }
      }
    },
  });
}
