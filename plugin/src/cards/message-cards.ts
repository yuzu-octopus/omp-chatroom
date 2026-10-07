import type { ExtensionAPI, MessageRenderOptions, MessageRenderer } from "@oh-my-pi/pi-coding-agent";
import { Ellipsis, truncateToWidth, type Component, type Theme } from "@oh-my-pi/pi-tui";
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import type { CustomMessage } from "@oh-my-pi/pi-tui/chat/messages";
import { formatAge } from "@oh-my-pi/pi-utils";
import { bodyLines, COLLAPSED_QUOTE_LINES } from "./body-lines";
import type { RoomRecord } from "../store/schema";
export type CardType = "room:message" | "room:mention" | "room:claim" | "room:board-delta";   // §7.3
export const CARD_TYPES: readonly CardType[] =
  ["room:message", "room:mention", "room:claim", "room:board-delta"];   // §7.3

export function cardTypeFor(record: RoomRecord): CardType {      // §5.3 uses this
  throw new Error("not implemented");
}
export function registerMessageRenderers(pi: ExtensionAPI): void {  // §2.1.1
  throw new Error("not implemented");
}

// §11.3 "Card tests" — exported so each card is testable without the renderer registry.
export function renderMessageCard(message: CustomMessage, options: MessageRenderOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
export function renderMentionCard(message: CustomMessage, options: MessageRenderOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
export function renderClaimCard(message: CustomMessage, options: MessageRenderOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
export function renderBoardDeltaCard(message: CustomMessage, options: MessageRenderOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
