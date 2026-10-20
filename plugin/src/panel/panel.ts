import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { type Component, SplitPane, Stack, type Theme, type TUI } from "@oh-my-pi/pi-tui";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { contended, reclaimIfStale, release } from "../store/claims";
import { cursorFor } from "../store/cursors";
import { type MemberState, type RoomStore, roomStoreFor } from "../store/room-store";
import type { ClaimRow } from "../store/schema";
import { appendedSince, notifyRecipients } from "../tools/room";
import { type BoardRow, createBoardPane, sortBoardRows } from "./board-pane";
import { type ChatRow, createChatPane, projectChatRows } from "./chat-pane";
import { fitBlock, frameRows } from "./chrome";
import { adoptHostTheme, uncolouredTheme } from "./host-theme";
import { actionFor } from "./keys";
import { renderRosterStrip } from "./roster-strip";

export interface RoomPanelOptions {
  // [invented]
  roomId: string;
  store: RoomStore;
  tui: TUI;
  done: () => void;
  onReleaseClaim: (resource: string) => void; // §6.6 `r`
  onFocusAgent: (agentId: string) => void; // §6.6 `o`
  /** The session that owns the panel; its cursor drives unread marks (I3). */
  selfId: string;
  /**
   * The theme the host hands the `ctx.ui.custom` factory. The pi-tui `theme` module export is
   * `export var theme: Theme` — undefined until `initTheme()` runs — so reading the singleton at
   * panel-render time throws `undefined is not an object (evaluating 'theme.fg')`. Always use the
   * injected instance.
   */
  theme: Theme;
  /** Injected in tests; production reads `AgentRegistry.global()` (assumption 9). */
  registry?: Pick<AgentRegistry, "list" | "onChange">;
  /** Injected in tests; production uses `ctx.setInterval`/`ctx.clearTimer` (I4). */
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export const PANEL_SPLIT_AT = 88; // §6.2
export const PANEL_LEFT_RATIO = 0.62; // §6.2
export const PANEL_RIGHT_MIN_WIDTH = 30; // §6.2
/** §6.8 — the slow relative-age repaint cadence. */
export const PANEL_AGE_INTERVAL_MS = 5_000;

// §6.6 — only the keys the panel actually acts on; the full key map is in `keys.ts`.
const HINTS = [
  "esc close",
  "tab narrow",
  "j/k move",
  "g/G ends",
  "o jump",
  "r release",
  "1/2 pane",
];

const BORDER = "│";

/** How many log records the board scans for the claims that just ended. */
const PANEL_RELEASED_TAIL = 200;

/**
 * §6.2 Layout A — frame top, `chat | board` split, divider, hint row, frame bottom. Only the visible
 * window is rendered (plain styled string rows via the pane projections), never one component per
 * message (§6.2 perf rule).
 */
export class RoomPanel implements Component {
  readonly #options: RoomPanelOptions;
  readonly #registry: Pick<AgentRegistry, "list" | "onChange">;
  readonly #split: SplitPane;
  readonly #stack: Stack;
  #rows: ChatRow[] = [];
  #board: BoardRow[] = [];
  #roster = "";
  // One selection PER PANE. A single shared index was the bug the live pty run found: it was
  // clamped by the FOCUSED pane's row count but applied to the BOARD's rows, so `r` in chat focus
  // released an arbitrary claim the user had never selected.
  // The chat cursor starts on the NEWEST row (the pane shows the tail of the log, so row 0 would
  // be off-window and the marker invisible).
  #chatSelected = Number.MAX_SAFE_INTEGER;
  #boardSelected = 0;
  #focus: "chat" | "board" = "chat";
  #narrowOpen = false;
  #disposed = false;
  #offStore: (() => void) | undefined;
  #offRegistry: (() => void) | undefined;
  #ageTimer: unknown;
  #width = 0;
  #frame: readonly string[] = [];
  #lastRender: readonly string[] = [];

  constructor(options: RoomPanelOptions) {
    trace(
      `RoomPanel ctor: theme=${options.theme === undefined ? "undefined" : typeof options.theme}` +
        ` fg=${options.theme !== undefined && options.theme !== null ? typeof (options.theme as { fg?: unknown }).fg : "n/a"}`,
    );
    this.#options = options;
    this.#registry = options.registry ?? AgentRegistry.global();
    const registry = this.#registry;
    const store = options.store;

    this.#split = new SplitPane({
      left: createChatPane(
        () => this.#rows,
        0,
        this.#options.theme,
        () => this.#chatSelected,
      ),
      right: createBoardPane(
        () => this.#board,
        0,
        this.#options.theme,
        () => this.#boardSelected,
      ),
      leftSize: { ratio: PANEL_LEFT_RATIO, min: 40 },
      rightMinWidth: PANEL_RIGHT_MIN_WIDTH,
      splitAt: PANEL_SPLIT_AT,
      narrowPane: "left",
      prefix: BORDER,
      divider: BORDER,
      suffix: BORDER,
    });

    this.#stack = new Stack({
      children: [
        { content: () => [this.#frame[0] ?? ""], grow: 0 },
        { content: this.#split, grow: 1 },
        { content: () => [this.#frame[1] ?? ""], grow: 0 },
        { content: () => [this.#frame[2] ?? ""], grow: 0 },
        { content: () => [this.#frame[3] ?? ""], grow: 0 },
      ],
    });

    // §6.8/K10 — per-mount unsubscribes, both released in dispose(); a repeat mount must not
    // accumulate listeners.
    this.#offStore = store.addListener(() => this.refresh());
    this.#offRegistry = registry.onChange(() => this.refresh());
    // §6.8 — a slow unref'd timer for relative-age text. The host clears it on session_shutdown;
    // dispose() clears it explicitly (the host never calls dispose for a hidden overlay).
    this.#ageTimer = (options.setInterval ?? (() => undefined))(() => {
      if (!this.#disposed) this.refresh();
    }, PANEL_AGE_INTERVAL_MS);
    // A throw in the first refresh must not leave the timer and both listeners live: the factory
    // never receives a panel to dispose, so nothing would ever release them and the age timer would
    // keep firing into a half-built panel ("Extension \"<timer>\" error" every 5 s).
    try {
      this.refresh();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Re-project store + registry into rows, then ask the TUI for a repaint (§6.8). */
  refresh(): void {
    if (this.#disposed) return;
    const store = this.#options.store;
    this.#rows = projectChatRows(
      store.records,
      this.#viewer(store),
      cursorFor(store, this.#options.selfId),
    );
    this.#board = this.#projectBoard(store);
    this.#roster = renderRosterStrip(this.#registry.list(), this.#options.theme);
    this.#clampSelection();
    this.#options.tui?.requestRender?.();
  }

  render(width: number): readonly string[] {
    if (this.#disposed) return this.#lastRender;
    this.#width = width;
    // Measure BEFORE rendering: the split's children render during `Stack.render`, but the top
    // border's `┬` must already sit over the divider (and the first frame after a resize must not
    // use the previous width's mode).
    const geometry = this.#split.measure(width);
    const narrow = geometry.mode !== "split";
    this.#split.setNarrowPane(this.#narrowOpen && narrow ? "right" : "left");
    const chatWidth = narrow ? 0 : (geometry.left?.width ?? 0);
    this.#frame = frameRows(width, this.#titleFor(narrow), chatWidth, HINTS, this.#options.theme);
    const height = Math.max(4, this.#options.tui?.terminal?.rows || 30);
    this.#stack.setHeight(height);
    this.#lastRender = fitBlock(this.#stack.render(width), height, width);
    return this.#lastRender;
  }

  handleInput(data: string): boolean {
    if (this.#disposed) return false;
    // editorEmpty: true — the overlay owns the keyboard; the editor is not visible.
    const action = actionFor(data, {
      splitMode: this.#split.measure(this.#width).mode,
      editorEmpty: true,
    });
    if (action === null) return false;
    switch (action) {
      case "close":
        this.#options.done();
        return true;
      case "toggle-narrow":
        this.#narrowOpen = !this.#narrowOpen;
        break;
      case "down":
        this.#moveSelection(1);
        break;
      case "up":
        this.#moveSelection(-1);
        break;
      case "top":
        this.#setSelection(0);
        break;
      case "bottom":
        this.#setSelection(Number.MAX_SAFE_INTEGER);
        break;
      case "focus-chat":
        this.#focus = "chat";
        break;
      case "focus-board":
        this.#focus = "board";
        break;
      case "release-claim": {
        // The board is the only pane with claims: `r` acts on the BOARD's own selection, and only
        // while the board has the focus. In chat focus it releases nothing — the user has not
        // selected a claim, and the old shared index released an arbitrary one.
        if (this.#focus !== "board") break;
        const row = this.#boardAt(this.#boardSelected);
        // An ended claim (expired or already released) is on the board for context, not to be
        // released again.
        if (row !== undefined && row.state === "held") this.#options.onReleaseClaim(row.resource);
        break;
      }
      case "focus-agent": {
        if (this.#focus !== "board") break;
        const row = this.#boardAt(this.#boardSelected);
        if (row !== undefined) this.#options.onFocusAgent(row.holder);
        break;
      }
      // No default: PanelAction is total over the implemented actions, so an unhandled case is a
      // type error, not a silent no-op. (detail/compose/filter were removed, not stubbed.)
    }
    this.#clampSelection();
    this.refresh();
    return true;
  }

  /**
   * §6.8/K10 — idempotent: the host never calls `dispose()` for a hidden overlay, so a second call
   * must not double-unsubscribe or double-clear.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#offStore?.();
    this.#offRegistry?.();
    this.#offStore = undefined;
    this.#offRegistry = undefined;
    if (this.#ageTimer !== undefined) {
      this.#options.clearTimer?.(this.#ageTimer);
      this.#ageTimer = undefined;
    }
  }

  // --- projections --------------------------------------------------------

  #viewer(store: RoomStore): MemberState {
    const existing = store.members.get(this.#options.selfId);
    if (existing !== undefined) return existing;
    return {
      agentId: this.#options.selfId,
      joinedAtSeq: 0,
      topics: new Set<string>(),
      muted: new Set<string>(),
      threadRoots: new Set<string>(),
      heldTopics: new Set<string>(),
    };
  }

  /**
   * §6.4 — the board's rows: live leases oldest first, plus the ones that just ENDED.
   *
   * A claim whose TTL has passed is marked `expired` rather than shown as held, and a claim that
   * was released stays on the board, dimmed: §6.4's rule is that a row moves to the bottom rather
   * than vanishing mid-frame — a board whose claims blink out as they expire is unreadable.
   */
  #projectBoard(store: RoomStore): BoardRow[] {
    const now = Date.now();
    const rows: BoardRow[] = [];
    const live = new Set<string>();
    for (const claim of store.claims.values()) {
      live.add(claim.resource);
      const row: ClaimRow = {
        resource: claim.resource,
        holder: claim.holder,
        ttlMs: claim.ttlMs,
        expiresAt: claim.acquiredAt + claim.ttlMs,
        acquiredAt: claim.acquiredAt,
        contended: contended(store, claim.resource).length,
      };
      rows.push({ ...row, state: claim.acquiredAt + claim.ttlMs <= now ? "expired" : "held" });
    }
    // The recently ended claims, from the log's tail. The store's claim map only holds live leases,
    // so this is where a release (by anyone) becomes visible.
    const released = new Map<string, { holder: string; ts: number }>();
    for (const record of store.records.slice(-PANEL_RELEASED_TAIL)) {
      if (record.kind !== "release") continue;
      if (live.has(record.resource)) continue;
      released.set(record.resource, { holder: record.prevHolder, ts: record.ts });
    }
    for (const [resource, ended] of released) {
      rows.push({
        resource,
        holder: ended.holder,
        ttlMs: 0,
        expiresAt: 0,
        acquiredAt: ended.ts,
        contended: 0,
        state: "released",
      });
    }
    rows.sort((a, b) => a.acquiredAt - b.acquiredAt);
    return rows;
  }

  #clampSelection(): void {
    this.#chatSelected = this.#clamp(this.#chatSelected, this.#rows.length);
    this.#boardSelected = this.#clamp(this.#boardSelected, this.#board.length);
  }

  #clamp(value: number, count: number): number {
    const last = Math.max(0, count - 1);
    if (value > last) return last;
    if (value < 0) return 0;
    return value;
  }

  /** The focused pane's selection moves; the other pane keeps its own. */
  #moveSelection(delta: number): void {
    if (this.#focus === "chat") this.#chatSelected += delta;
    else this.#boardSelected += delta;
  }

  #setSelection(value: number): void {
    if (this.#focus === "chat") this.#chatSelected = value;
    else this.#boardSelected = value;
  }

  /**
   * The board row at a selection index, in DISPLAY order (`held` first, finished rows last) —
   * the same order the pane renders, so `r` acts on the row the user can see.
   */
  #boardAt(index: number): BoardRow | undefined {
    return sortBoardRows(this.#board)[index];
  }

  // --- chrome -------------------------------------------------------------

  #titleFor(narrow: boolean): string {
    // The focused pane is marked: `1`/`2` used to change nothing on screen, so the key looked
    // broken. In the narrow layout only one pane is visible, so the mark names the visible one.
    const pane = narrow
      ? this.#narrowOpen
        ? "[board]"
        : "[chat]"
      : this.#focus === "chat"
        ? "[chat]|board"
        : "chat|[board]";
    return `Room #${sanitizeText(this.#options.roomId)} · ${pane} · ${this.#roster}`;
  }
}

/**
 * One `session_shutdown` handler per extension, closing whichever overlay is open. `pi.on` returns
 * `void` (verified 18.7.0) and handlers are never removed by the host, so registering per open would
 * accumulate one stale handler per panel.
 */
const ACTIVE_PANEL = new WeakMap<ExtensionAPI, () => void>();

/**
 * The host injects its `Theme` as the factory's 2nd arg, but on 18.8.7 that object arrives WITHOUT
 * `fg` (and possibly the rest), so every `theme.fg(...)` throws "undefined is not an object
 * (evaluating 'theme.fg')" and the panel dies before it renders. `ensureThemeSync()` populates the
 * pi-tui module singleton, which is the same object the host passes — so either the host now hands a
 * partially-built theme, or it hands one whose `fg` is a lazy getter that has not resolved.
 *
 * 17 call sites, resolve the theme ONCE here: prefer the injected one, fall back to
 * the pi-tui singleton after ensuring it, and last-ditch to a minimal shim so the panel renders
 * uncoloured rather than not at all.
 */

/** A theme with a working `fg` — the only member any panel code actually calls. */
type UsableTheme = Theme & { fg: (tone: string, text: string) => string };
function resolveTheme(injected: Theme | undefined): Theme {
  const usable = (t: Theme | undefined): t is UsableTheme =>
    t !== undefined && t !== null && typeof t === "object" && typeof t.fg === "function";
  if (usable(injected)) {
    // ALWAYS publish whatever usable theme we are given to the host modules, even when the injected
    // theme is fine. The panel's frame rows come from `pi-tui/chrome/overlay-box`, whose
    // `topBorderSplit`/`divider`/`bottomBorder` read the host `theme` singleton rather than the
    // theme the factory handed us — under the plugin that singleton is uninitialised, so every one
    // of them throws `undefined is not an object (evaluating 'theme.boxRound')` and takes the panel
    // with it. (The roster strip paints from the handed theme; see host-theme.ts.)
    adoptHostTheme(injected);
    return injected;
  }
  trace(
    `resolveTheme: injected theme unusable (fg=${typeof (injected as { fg?: unknown } | undefined)?.fg})`,
  );
  // One object for both readers. The panel and the host's chrome helpers are two different readers of
  // the same theme, so the fallback is published to the singleton AND returned — a theme that only
  // satisfies the panel is the second half of the boxRound bug, not the fix for it.
  trace("resolveTheme: publishing an uncoloured theme to the host and the panel");
  const shim = uncolouredTheme();
  adoptHostTheme(shim);
  return shim as unknown as Theme;
}

/**
 * Debug breadcrumbs, written to a file so a failure inside `ctx.ui.custom` — where the host swallows
 * everything into a one-line notify — is diagnosable from outside the TUI. Never throws; a logger
 * that can break the feature it is logging is worse than no logger.
 */
function trace(label: string, extra?: unknown): void {
  try {
    const file = path.join(os.tmpdir(), "omp-room-panel-debug.log");
    const stamp = new Date().toISOString();
    let body = `${stamp} ${label}`;
    if (extra !== undefined) body += ` ${String(extra)}`;
    const err = extra instanceof Error ? extra : undefined;
    if (err !== undefined) body += `\n  stack: ${err.stack ?? "none"}`;
    fs.appendFileSync(file, `${body}\n`);
  } catch {
    // A logger must never break the feature.
  }
}

/**
 * §6.1/§6.8 — open the overlay. Guarded for non-TUI modes (RPC `custom` returns `undefined as never`)
 * and wrapped in try/catch (R5: `hasUI === true` does not guarantee `custom` works). NEVER passes
 * `signal: ctx.signal` — `ExtensionContext` has no `signal`; abort comes from `session_shutdown`.
 */
export async function openRoomPanel(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify("Room panel needs the TUI", "info");
    return;
  }
  let store: RoomStore;
  try {
    store = roomStoreFor(ctx);
  } catch (error) {
    ctx.ui.notify(
      `room unavailable: ${error instanceof Error ? error.message : "corrupt log"}`,
      "error",
    );
    return;
  }

  try {
    trace("openRoomPanel: calling ctx.ui.custom");
    await ctx.ui.custom<void>(
      (tui, theme, _keybindings, done) => {
        const t = theme as unknown as Record<string, unknown> | undefined;
        trace(
          `factory: tui=${tui === undefined ? "undefined" : typeof tui}` +
            ` theme=${theme === undefined ? "undefined" : typeof theme}` +
            ` fg=${typeof t?.fg} bold=${typeof t?.bold} sep=${typeof t?.sep}` +
            ` status=${typeof t?.status} nav=${typeof t?.nav} tree=${typeof t?.tree}` +
            ` boxRound=${typeof t?.boxRound} boxRoundTopLeft=${JSON.stringify(t?.boxRoundTopLeft)}`,
        );
        let unsubscribe: () => void = () => {};
        let closed = false;
        // Idempotent: `handleInput` may fire `done` more than once (a second `esc`, a key arriving
        // during teardown), and the host's overlay teardown calls it again. Without the guard the
        // unsubscribe and `done` run twice, which double-releases the terminal-input listener.
        const close = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          done();
        };
        trace("factory: constructing RoomPanel");
        const panel = new RoomPanel({
          roomId: store.roomId,
          store,
          tui,
          done: close,
          selfId: ctx.agent.id,
          theme: resolveTheme(theme),
          onReleaseClaim: (resource: string) => {
            const held = store.claims.get(resource);
            if (held === undefined) {
              panel.refresh();
              return;
            }
            // Route through the arbiter like the tool path (room.ts release): a direct append
            // would skip waiter promotion, use the wrong reason, and notify nobody. Holder
            // releasing their own lease → "released"; anyone else → explicit reclaim-if-stale.
            const before = store.seq;
            if (held.holder === ctx.agent.id) {
              release(store, resource, ctx.agent.id, "released");
            } else {
              reclaimIfStale(store, resource, Date.now());
            }
            // The push is async but key handling is sync: float it with a contained catch that
            // surfaces via notify (a floating rejection here would be process-level noise).
            notifyRecipients(pi, ctx, store, appendedSince(store, before), ctx.agent.id).then(
              (failure) => {
                if (failure !== undefined) ctx.ui.notify(`delivery: ${failure}`, "warning");
              },
              (error: unknown) =>
                ctx.ui.notify(
                  `delivery: ${error instanceof Error ? error.message : "failed"}`,
                  "warning",
                ),
            );
            panel.refresh();
          },
          onFocusAgent: (agentId: string) => {
            // No extension-facing focus action exists on `ExtensionAPI` (verified 18.7.0); the overlay
            // can only name the agent and let the human jump via the agent hub.
            ctx.ui.notify(`agent ${agentId} — use the agent hub to focus its session`, "info");
          },
          setInterval: (callback: () => void, ms: number) => ctx.setInterval(callback, ms),
          clearTimer: (timer: unknown) =>
            ctx.clearTimer(timer as Parameters<typeof ctx.clearTimer>[0]),
        });
        unsubscribe = ctx.ui.onTerminalInput((data) => {
          if (panel.handleInput(data)) {
            return { consume: true };
          }
          return undefined;
        });
        ACTIVE_PANEL.set(pi, close);
        return panel;
      },
      {
        overlay: true,
        overlayOptions: {
          fullscreen: true,
          anchor: "bottom-center",
          width: "100%",
          maxHeight: "100%",
          margin: 0,
        },
      },
    );
  } catch (error) {
    trace("openRoomPanel FAILED", error);
    ctx.ui.notify(
      `Room panel unavailable: ${error instanceof Error ? error.message : "unknown"}`,
      "warning",
    );
  } finally {
    ACTIVE_PANEL.delete(pi);
  }
}

/**
 * §2.1.1 — registration. `pi.registerFlag` lives in `store/config.ts` (K6, one site); the panel's
 * own contribution is the optional `--room-panel-key` shortcut (R4: default `""` disables it) and
 * the single `session_shutdown` closer.
 */
export function registerPanel(pi: ExtensionAPI): void {
  pi.on("session_shutdown", () => {
    ACTIVE_PANEL.get(pi)?.();
    ACTIVE_PANEL.delete(pi);
  });
  const key = pi.getFlag("room-panel-key");
  if (typeof key !== "string" || key === "") return;
  pi.registerShortcut(key as Parameters<typeof pi.registerShortcut>[0], {
    description: "Open the agent chatroom panel",
    handler: async (ctx: ExtensionContext) => {
      await openRoomPanel(pi, ctx);
    },
  });
}
