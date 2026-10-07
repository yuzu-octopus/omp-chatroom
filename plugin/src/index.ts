import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerRoomTool } from "./tools/room";
import { registerWaitForClaim } from "./tools/wait-for-claim";
import { registerHooks } from "./onboarding/hook";
import { registerRoomFlags } from "./store/config";
import { resetRoomStores } from "./store/room-store";

/**
 * Option A wiring (PLAN §1.4): store + claim board + `room` op + digest + routing rule +
 * `wait_for_claim`. No panel, no cards, no cold tree, no attention governor.
 */
export default function roomExtension(pi: ExtensionAPI): void {
  registerRoomFlags(pi);
  registerRoomTool(pi);
  registerWaitForClaim(pi);
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
