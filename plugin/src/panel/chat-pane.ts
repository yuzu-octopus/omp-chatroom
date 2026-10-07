import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { LayoutRenderer, Theme } from "@oh-my-pi/pi-tui";
import type { MemberState } from "../store/room-store";
import type { RoomRecord } from "../store/schema";
import type { Tier } from "../attention/tiers";
export interface ChatRow {                                 // [invented]
  seq: number; ts: number; tier: Tier; author: string; topic: string;
  body: string; mention: boolean; unread: boolean; threadDepth: number;
}

export function projectChatRows(
  records: readonly RoomRecord[],
  viewer: MemberState,
  cursor: number,
): ChatRow[] {
  throw new Error("not implemented");
}

export function renderChatRows(rows: readonly ChatRow[], width: number, theme: Theme): string[] {
  throw new Error("not implemented");
}

export function createChatPane(getRows: () => readonly ChatRow[], height: number): LayoutRenderer {  // §6.2
  throw new Error("not implemented");
}
