import { test, expect } from "bun:test";
import { createRequire } from "node:module";
import { HOST_VERSION_PIN, assertHostVersion, DEEP_SPECIFIERS } from "../src/version";
import { resolveLocalRoot, resolveLocalUrlToPath } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import type { AgentStatus } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { escapeHarnessTags } from "@oh-my-pi/pi-coding-agent/session/harness-tags";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import type { CustomMessage } from "@oh-my-pi/pi-tui/chat/messages";
import { bottomBorder, dividerSplit, topBorderSplit } from "@oh-my-pi/pi-tui/chrome/overlay-box";
import { statusDot, statusGlyph, statusText } from "@oh-my-pi/pi-tui/overlays/agent-hub-renderer";
import { createCachedComponent } from "@oh-my-pi/pi-tui/render/render-utils";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import type { NativeToolView } from "@oh-my-pi/pi-tui/tools/renderer";

const require = createRequire(import.meta.url);

test("the installed host version equals HOST_VERSION_PIN (X6/R34)", () => {
  throw new Error("not implemented");
});

test("assertHostVersion throws on a mismatch and returns on a match", () => {
  throw new Error("not implemented");
});

test("every deep specifier in DEEP_SPECIFIERS resolves (D3)", () => {
  throw new Error("not implemented");
});

test("each deep specifier's named exports are non-undefined", () => {
  throw new Error("not implemented");
});
