import { renderTableRow, type LayoutRenderer, type TableColumn, type Theme } from "@oh-my-pi/pi-tui";
import type { ClaimRow } from "../store/schema";
export type BoardRow = ClaimRow & { state: "held" | "expired" | "released" };   // [invented] — §6.4 dimming

export function projectClaims(rows: readonly BoardRow[], width: number, theme: Theme): string[] {   // §6.4
  throw new Error("not implemented");
}
export function createBoardPane(getRows: () => readonly BoardRow[], width: number): LayoutRenderer {
  throw new Error("not implemented");
}
export const BOARD_COLUMNS: readonly TableColumn[] = undefined as never;  // [placeholder] // §6.4
