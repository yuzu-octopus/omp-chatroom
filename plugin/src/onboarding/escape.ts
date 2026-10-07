import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { sanitizeText } from "@oh-my-pi/pi-utils";

/**
 * The ONE escaper for room-authored text that reaches the model.
 *
 * `escapeHarnessTags` covers `irc` and `system-*` tags but NOT `room-authored`, so the digest's own
 * region marker could be closed from inside a room message. Folding the marker into the same pass
 * means every room-facing surface is marker-safe, not just the digest — a surface that forgets the
 * extra pass cannot reopen the hole.
 */
const ROOM_MARKER_RE = /<(?=\/?room-authored)/gi;

export function safeRoomText(text: string): string {
  return escapeHarnessTags(sanitizeText(text)).replace(ROOM_MARKER_RE, "&lt;");
}
