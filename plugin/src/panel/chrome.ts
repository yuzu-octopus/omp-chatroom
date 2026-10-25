import { Ellipsis, padding, type Theme, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import {
  bottomBorder,
  divider,
  dividerSplit,
  PanelRows,
  row,
  topBorder,
  topBorderSplit,
} from "@oh-my-pi/pi-tui/chrome/overlay-box";

/**
 * Pad or truncate to exactly `width` visible cells. The overlay-box helpers under-fill a row when
 * their inset budget collapses (a tiny terminal) and over-fill it when the box glyphs alone exceed
 * `width`, so every frame row passes through here.
 */
export function fitWidth(text: string, width: number): string {
  if (width <= 0) return "";
  const visible = visibleWidth(text);
  if (visible === width) return text;
  if (visible < width) return text + padding(width - visible);
  const cut = truncateToWidth(text, width);
  const cutWidth = visibleWidth(cut);
  return cutWidth < width ? cut + padding(width - cutWidth) : cut;
}

/**
 * Width guard for a frame row. Above 4 cells the row goes through `fitWidth` (pad short rows,
 * truncate long ones); at 4 or fewer cells the host's own `row()` helper over-fills unconditionally
 * (`│  │`), so the row is hard-truncated following the host's own idiom in `OverlayPanel.render`
 * (`overlay-box.ts:336-340`): fixed-width truncation with `Ellipsis.Omit` — there is no room for
 * an ellipsis.
 */
function frameGuard(text: string, width: number): string {
  if (width <= 0) return "";
  if (width <= 4) return truncateToWidth(text, width, Ellipsis.Omit);
  return fitWidth(text, width);
}

/**
 * Frame top border. `chatWidth` is the chat pane's content width; the `┬` sits over the split's
 * divider (which is `chatWidth + 1` columns in, after the leading `│`). A non-positive `chatWidth`
 * means the split is collapsed, so the title takes the whole rule (§6.2 narrow fallback).
 */
export function frameTopRow(width: number, title: string, chatWidth: number): string {
  return frameGuard(
    chatWidth > 2 ? topBorderSplit(width, title, chatWidth - 2) : topBorder(width, title),
    width,
  );
}

/** Section rule closing the pane area; split under the divider, full-width when collapsed. */
export function frameDividerRow(width: number, chatWidth: number): string {
  return frameGuard(chatWidth > 2 ? dividerSplit(width, chatWidth - 2) : divider(width), width);
}

export function frameBottomRow(width: number): string {
  return frameGuard(bottomBorder(width), width);
}

/** One bordered hint row (`│ esc close · j/k move │`) carrying the key map (§6.6). */
export function frameHintRow(width: number, hints: readonly string[], theme: Theme): string {
  return frameGuard(
    row(hints.map((hint) => theme.fg("dim", hint)).join(theme.sep.dot), width),
    width,
  );
}

/**
 * The four fixed-height frame rows as host `PanelRows` regions — the host's own split-frame
 * pattern (`hub-frame.ts:146-149`): top border, divider, hint, bottom, each pinned to exactly one
 * row via `setHeight(1)`. The split chrome the panel emits (`topBorderSplit`/`dividerSplit`) is
 * kept as the row content — the host's `OverlayPanel` never emits those, which is why full
 * `OverlayPanel` adoption was rejected.
 *
 * The regions render through the panel's `Stack` as `{ content, height: 1 }` children
 * (`hub-frame.ts:183-191`); the `Stack` re-asserts the pin per frame via `setHeight`, and pads or
 * clips every row to the exact width, so no hand-rolled `fitBlock` is needed.
 */
export class FrameChrome {
  readonly top = new PanelRows();
  readonly divider = new PanelRows();
  readonly hint = new PanelRows();
  readonly bottom = new PanelRows();

  constructor() {
    this.top.setHeight(1);
    this.divider.setHeight(1);
    this.hint.setHeight(1);
    this.bottom.setHeight(1);
  }

  /** Refresh the four rows — the `setLines` half of the host pattern (`hub-frame.ts:354-357`). */
  update(
    width: number,
    title: string,
    chatWidth: number,
    hints: readonly string[],
    theme: Theme,
  ): void {
    this.top.setLines([frameTopRow(width, title, chatWidth)]);
    this.divider.setLines([frameDividerRow(width, chatWidth)]);
    this.hint.setLines([frameHintRow(width, hints, theme)]);
    this.bottom.setLines([frameBottomRow(width)]);
  }
}
