import { parseKey } from "@oh-my-pi/pi-tui";

export type PanelAction =
  // §6.6 — only the actions the panel implements. `detail`/`compose`/`filter` were bound but
  // never built (their dispatch arms were no-ops); unbound rather than advertised-and-dead.
  | "close"
  | "toggle-narrow"
  | "up"
  | "down"
  | "top"
  | "bottom"
  | "focus-agent"
  | "release-claim"
  | "focus-chat"
  | "focus-board";

/** §6.6 key table as data, keyed by the canonical key name `parseKey` returns. */
export const PANEL_KEY_MAP: Readonly<Record<string, PanelAction>> = {
  escape: "close",
  tab: "toggle-narrow",
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  g: "top",
  G: "bottom",
  o: "focus-agent",
  r: "release-claim",
  "1": "focus-chat",
  "2": "focus-board",
};
/** What the panel must know before a key can be mapped (§6.6 + §6.7). */
export interface PanelKeyState {
  splitMode: "split" | "narrow";
  /** §6.7 — "once the reader starts typing, the editor owns every key". */
  editorEmpty: boolean;
}

/**
 * §6.6 — resolve a raw terminal chunk to an action, or `null` when the key is not bound.
 *
 * A `null` is the no-op: an unknown key, an empty chunk, a keystroke the editor owns, or `Tab`
 * when the split is not collapsed (the narrow toggle only exists below the threshold).
 */
export function actionFor(data: string, state: PanelKeyState): PanelAction | null {
  if (data === "") return null;
  if (!state.editorEmpty) return null;
  const action = PANEL_KEY_MAP[parseKey(data) ?? ""];
  if (action === undefined) return null;
  if (action === "toggle-narrow" && state.splitMode !== "narrow") return null;
  return action;
}
