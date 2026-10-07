import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerRoomTool } from "./tools/room";
import { registerWaitForClaim } from "./tools/wait-for-claim";
import { registerWaitForAgent } from "./tools/wait-for-agent";
import { registerWaitForMessage } from "./tools/wait-for-message";
import { registerRoomCommand } from "./commands/room-command";
import { registerMessageRenderers } from "./cards/message-cards";
import { registerHooks } from "./onboarding/hook";
import { registerPanel } from "./panel/panel";
import { registerRoomFlags } from "./store/config";
import { resetRoomStores } from "./store/room-store";

/**
 * Full wiring (PLAN §1.1, Option B): store + claim board + `room` + all three wait tools +
 * attention governor + cold tree + panel + inline cards + digest + routing rule.
 */
export default function roomExtension(pi: ExtensionAPI): void {
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

/** Test-only seam (§2.1.1 M-4). Clears the in-memory store between tests. */
export const __roomTest: { store: { reset(): void } } = {
  store: {
    reset(): void {
      resetRoomStores();
    },
  },
};
