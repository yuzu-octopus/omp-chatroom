import { type ExtensionAPI, VERSION } from "@oh-my-pi/pi-coding-agent";
import { registerMessageRenderers } from "./cards/message-cards";
import { registerRoomCommand } from "./commands/room-command";
import { registerHooks } from "./onboarding/hook";
import { registerPanel } from "./panel/panel";
import { registerRoomFlags } from "./store/config";
import { resetRoomStores } from "./store/room-store";
import { registerRoomTool } from "./tools/room";
import { registerWaitForAgent } from "./tools/wait-for-agent";
import { registerWaitForClaim } from "./tools/wait-for-claim";
import { registerWaitForMessage } from "./tools/wait-for-message";
import { DEEP_SPECIFIERS, HOST_VERSION_PIN } from "./version";

/**
 * Full wiring (PLAN §1.1, Option B): store + claim board + `room` + all three wait tools +
 * attention governor + cold tree + panel + inline cards + digest + routing rule.
 */
export default function roomExtension(pi: ExtensionAPI): void {
  warnOnHostDrift(pi);
  registerRoomFlags(pi);
  registerRoomTool(pi);
  registerWaitForClaim(pi);
  registerWaitForAgent(pi);
  registerWaitForMessage(pi);
  registerRoomCommand(pi);
  registerMessageRenderers(pi);
  registerPanel(pi);
  registerHooks(pi);
}

/**
 * X6 — a load-time drift warning.
 *
 * The pin is enforced by the test gate, which only sees the plugin's own `node_modules`; the
 * host that actually loads the plugin is the global install. `VERSION` is the host's own version
 * string, so a mismatch is visible at load. It WARNS rather than throws: the plugin's deep
 * imports are wildcard-only, so a host bump can break them — but a room that still works is
 * worth more than a plugin that refuses to load, and the warning says exactly what to check.
 */
function warnOnHostDrift(pi: ExtensionAPI): void {
  if (typeof VERSION !== "string" || VERSION === HOST_VERSION_PIN) return;
  pi.logger.warn(
    `omp-agent-chatroom: host ${VERSION} differs from the pinned ${HOST_VERSION_PIN}. The plugin ` +
      `imports ${DEEP_SPECIFIERS.length} wildcard-only subpaths (${DEEP_SPECIFIERS.join(", ")}); ` +
      `a host bump can move or remove one. Re-verify them and re-pin if the room misbehaves.`,
  );
}

/** Test-only seam (§2.1.1 M-4). Clears the in-memory store between tests. */
export const __roomTest: { store: { reset(): void } } = {
  store: {
    reset(): void {
      resetRoomStores();
    },
  },
};
