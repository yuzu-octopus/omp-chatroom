import { bottomBorder, divider, dividerSplit, row, topBorder, topBorderSplit }
  from "@oh-my-pi/pi-tui/chrome/overlay-box";
import { padding, truncateToWidth, visibleWidth, type Theme } from "@oh-my-pi/pi-tui";

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

/** Pad/trim a block to exactly `size` rows of exactly `width` cells — the frame stays rectangular. */
export function fitBlock(lines: readonly string[], size: number, width: number): string[] {
  const out = lines.slice(0, size).map(line => fitWidth(line, width));
  const blank = padding(width);
  while (out.length < size) out.push(blank);
  return out;
}

/**
 * Frame top border. `chatWidth` is the chat pane's content width; the `┬` sits over the split's
 * divider (which is `chatWidth + 1` columns in, after the leading `│`). A non-positive `chatWidth`
 * means the split is collapsed, so the title takes the whole rule (§6.2 narrow fallback).
 */
export function frameTopRow(width: number, title: string, chatWidth: number): string {
  return fitWidth(chatWidth > 2 ? topBorderSplit(width, title, chatWidth - 2) : topBorder(width, title), width);
}

/** Section rule closing the pane area; split under the divider, full-width when collapsed. */
export function frameDividerRow(width: number, chatWidth: number): string {
  return fitWidth(chatWidth > 2 ? dividerSplit(width, chatWidth - 2) : divider(width), width);
}

export function frameBottomRow(width: number): string {
  return fitWidth(bottomBorder(width), width);
}

/** One bordered hint row (`│ esc close · j/k move │`) carrying the key map (§6.6). */
export function frameHintRow(width: number, hints: readonly string[], theme: Theme): string {
  return fitWidth(row(hints.map(hint => theme.fg("dim", hint)).join(theme.sep.dot), width), width);
}

/**
 * The four chrome rows in render order. The panel interleaves the pane body between `[0]` and
 * `[1]` (§6.2: top border → split → divider → footer → bottom border).
 */
export function frameRows(
  width: number,
  title: string,
  chatWidth: number,
  hints: readonly string[],
  theme: Theme,
): string[] {
  return [
    frameTopRow(width, title, chatWidth),
    frameDividerRow(width, chatWidth),
    frameHintRow(width, hints, theme),
    frameBottomRow(width),
  ];
}
