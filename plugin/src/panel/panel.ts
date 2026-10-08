import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { type Component, SplitPane, Stack, type Theme, type TUI } from "@oh-my-pi/pi-tui";
import { contended } from "../store/claims";
import { cursorFor } from "../store/cursors";
import { type MemberState, type RoomStore, roomStoreFor } from "../store/room-store";
import type { ClaimRow } from "../store/schema";
import { type BoardRow, createBoardPane } from "./board-pane";
import { type ChatRow, createChatPane, projectChatRows } from "./chat-pane";
import { fitBlock, frameRows } from "./chrome";
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

// §6.6 — only the keys the panel actually acts on; the full key map is in `keys.ts` (`p`/`/`/Enter`
// are mapped but the composer/filter are not built yet, so they are not advertised here).
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
  #selected = 0;
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
    this.#options = options;
    this.#registry = options.registry ?? AgentRegistry.global();
    const registry = this.#registry;
    const store = options.store;

    this.#split = new SplitPane({
      left: createChatPane(() => this.#rows, 0, this.#options.theme),
      right: createBoardPane(() => this.#board, 0, this.#options.theme),
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

  handleInput(data: string): void {
    if (this.#disposed) return;
    const action = actionFor(data, {
      splitMode: this.#split.measure(this.#width).mode,
      editorEmpty: true,
      filterOpen: false,
    });
    if (action === null) return;
    switch (action) {
      case "close":
        this.#options.done();
        return;
      case "toggle-narrow":
        this.#narrowOpen = !this.#narrowOpen;
        break;
      case "down":
        this.#selected += 1;
        break;
      case "up":
        this.#selected -= 1;
        break;
      case "top":
        this.#selected = 0;
        break;
      case "bottom":
        this.#selected = Number.MAX_SAFE_INTEGER;
        break;
      case "focus-chat":
        this.#focus = "chat";
        break;
      case "focus-board":
        this.#focus = "board";
        break;
      case "release-claim": {
        const row = this.#board[this.#selected];
        if (row !== undefined) this.#options.onReleaseClaim(row.resource);
        break;
      }
      case "focus-agent": {
        const row = this.#board[this.#selected];
        if (row !== undefined) this.#options.onFocusAgent(row.holder);
        break;
      }
      case "detail":
      case "compose":
      case "filter":
        break;
    }
    this.#clampSelection();
    this.refresh();
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

  /** §6.4 — live leases, oldest first. Expired/released rows are the store's concern, not the pane's. */
  #projectBoard(store: RoomStore): BoardRow[] {
    const rows: BoardRow[] = [];
    for (const claim of store.claims.values()) {
      const row: ClaimRow = {
        resource: claim.resource,
        holder: claim.holder,
        ttlMs: claim.ttlMs,
        expiresAt: claim.acquiredAt + claim.ttlMs,
        acquiredAt: claim.acquiredAt,
        contended: contended(store, claim.resource).length,
      };
      rows.push({ ...row, state: "held" });
    }
    rows.sort((a, b) => a.acquiredAt - b.acquiredAt);
    return rows;
  }

  #clampSelection(): void {
    const count = this.#focus === "chat" ? this.#rows.length : this.#board.length;
    const last = Math.max(0, count - 1);
    if (this.#selected > last) this.#selected = last;
    if (this.#selected < 0) this.#selected = 0;
  }

  // --- chrome -------------------------------------------------------------

  #titleFor(narrow: boolean): string {
    const pane = narrow ? (this.#narrowOpen ? "board" : "chat") : "chat|board";
    return `Room #${this.#options.roomId} · ${pane} · ${this.#roster}`;
  }
}

/**
 * One `session_shutdown` handler per extension, closing whichever overlay is open. `pi.on` returns
 * `void` (verified 18.7.0) and handlers are never removed by the host, so registering per open would
 * accumulate one stale handler per panel.
 */
const ACTIVE_PANEL = new WeakMap<ExtensionAPI, () => void>();

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
    await ctx.ui.custom<void>(
      (tui, theme, _keybindings, done) => {
        ACTIVE_PANEL.set(pi, done);
        const panel = new RoomPanel({
          roomId: store.roomId,
          store,
          tui,
          done,
          selfId: ctx.agent.id,
          theme,
          onReleaseClaim: (resource: string) => {
            const held = store.claims.get(resource);
            if (held !== undefined) {
              store.append({
                kind: "release",
                from: ctx.agent.id,
                resource,
                reason: "reclaimed",
                prevHolder: held.holder,
              });
            }
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
