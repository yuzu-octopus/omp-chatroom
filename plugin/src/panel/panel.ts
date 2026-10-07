import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { SplitPane, Stack, type Component, type TUI } from "@oh-my-pi/pi-tui";
import { createChatPane } from "./chat-pane";
import { createBoardPane } from "./board-pane";
import { renderRosterStrip } from "./roster-strip";
import { frameBottomRow, frameDividerRow, frameHintRow, frameTopRow } from "./chrome";
import { actionFor } from "./keys";
import type { RoomStore } from "../store/room-store";
export interface RoomPanelOptions {                       // [invented]
  roomId: string;
  store: RoomStore;
  tui: TUI;
  done: () => void;
  onReleaseClaim: (resource: string) => void;             // §6.6 `r`
  onFocusAgent: (agentId: string) => void;                // §6.6 `o`
}

export class RoomPanel implements Component {             // §2.1
  constructor(options: RoomPanelOptions) {
    throw new Error("not implemented");
  }
  render(width: number): readonly string[] {               // only required member (§6.2)
    throw new Error("not implemented");
  }
  handleInput(data: string): void {                        // §6.6
    throw new Error("not implemented");
  }
  dispose(): void {                                        // §6.8 — idempotent
    throw new Error("not implemented");
  }
}

export function registerPanel(pi: ExtensionAPI): void {    // §2.1.1
  throw new Error("not implemented");
}
export const PANEL_SPLIT_AT = 88;                         // §6.2
export const PANEL_LEFT_RATIO = 0.62;                     // §6.2
export const PANEL_RIGHT_MIN_WIDTH = 30;                  // §6.2
