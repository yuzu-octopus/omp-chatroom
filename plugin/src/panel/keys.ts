export type PanelAction =                                  // §6.6 — verbatim key list
  | "close" | "toggle-narrow" | "up" | "down" | "top" | "bottom"
  | "detail" | "focus-agent" | "release-claim" | "compose" | "filter"
  | "focus-chat" | "focus-board";

export const PANEL_KEY_MAP: Readonly<Record<string, PanelAction>> = {
  "escape": "close", "tab": "toggle-narrow", "j": "down", "down": "down", "k": "up", "up": "up",
  "g": "top", "G": "bottom", "enter": "detail", "o": "focus-agent", "r": "release-claim",
  "p": "compose", "/": "filter", "1": "focus-chat", "2": "focus-board",
};   // [invented] — the §6.6 key table, as data

export function actionFor(
  data: string,
  state: { splitMode: "split" | "narrow"; editorEmpty: boolean; filterOpen: boolean },
): PanelAction | null {                                    // [invented]
  throw new Error("not implemented");
}
