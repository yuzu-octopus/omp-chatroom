import { bottomBorder, dividerSplit, topBorderSplit } from "@oh-my-pi/pi-tui/chrome/overlay-box";
import { truncateToWidth, visibleWidth, type Theme } from "@oh-my-pi/pi-tui";
export function frameTopRow(width: number, title: string, chatWidth: number): string {      // [invented]
  throw new Error("not implemented");
}
export function frameDividerRow(width: number, chatWidth: number): string {                 // [invented]
  throw new Error("not implemented");
}
export function frameBottomRow(width: number): string {                                     // [invented]
  throw new Error("not implemented");
}
export function frameHintRow(width: number, hints: readonly string[], theme: Theme): string {  // [invented]
  throw new Error("not implemented");
}
export function frameRows(width: number, title: string, chatWidth: number,
                          hints: readonly string[], theme: Theme): string[] {               // [invented]
  throw new Error("not implemented");
}
