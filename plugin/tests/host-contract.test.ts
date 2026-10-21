/**
 * The version pin in version.ts is a dev-time cross-check, and nothing in production calls it — the
 * plugin is version-independent by design and runs against whatever host loads it.
 *
 * What actually breaks across a host bump is not the deep-specifier imports (those all survive; every
 * one has been verified on 18.8.6, 18.8.7 and 18.8.0 in turn) but two host SEMANTICS:
 *
 *  1. **The theme.** On 18.8.7 the host began handing `ctx.ui.custom` a Theme whose `fg` was
 *     undefined, which killed the panel outright ("undefined is not an object (evaluating 'theme.fg')").
 *     A pin never sees it; only exercising the real thing does.
 *  2. **The delivery rule.** The host's own doc comment (agent-session.ts:8796-8798) — "an explicit
 *     deliverAs queues without starting a turn in either state" — is what made T0 fail to wake an
 *     idle agent. Room T0 now sends triggerTurn to compensate; if the host changes that rule again,
 *     only a test that reads the rule from a live session catches it.
 *
 * This suite therefore asserts the CONTRACT with the installed host rather than its version string.
 * It is the version-independence gate.
 */
import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";
import { ensureThemeSync, theme } from "@oh-my-pi/pi-tui";
import roomExtension from "../src/index";

test("the installed host carries the deep specifiers the plugin imports, with exports", async () => {
  // These are wildcard-only subpath imports (not public API); the plugin's runtime dependency on
  // them is the reason a pin exists at all. Each must resolve AND provide its named member. The
  // list here is the gate: a host bump that moves one of these subpaths fails HERE, naming the
  // specifier, rather than at first use inside a panel.
  const specs: ReadonlyArray<readonly [spec: string, member: string | null]> = [
    ["@oh-my-pi/pi-coding-agent/internal-urls/local-protocol", "resolveLocalRoot"],
    ["@oh-my-pi/pi-coding-agent/registry/agent-registry", "AgentRegistry"],
    ["@oh-my-pi/pi-coding-agent/session/harness-tags", "escapeHarnessTags"],
    ["@oh-my-pi/pi-coding-agent/utils/event-bus", "EventBus"],
    ["@oh-my-pi/pi-ai", "streamSimple"],
    // Type-only imports: they have no runtime members, so they only have to RESOLVE.
    ["@oh-my-pi/pi-tui/chat/messages", null], // CustomMessage
    ["@oh-my-pi/pi-tui/tools/renderer", null], // NativeToolView
    ["@oh-my-pi/pi-tui/chrome/overlay-box", "topBorder"],
    ["@oh-my-pi/pi-tui/render/render-utils", "createCachedComponent"],
    ["@oh-my-pi/pi-tui/render/status-line", "renderStatusLine"],
    ["@oh-my-pi/pi-tui/theme/active-symbols", "activeThemeSymbol"],
    ["@oh-my-pi/pi-utils", "formatAge"],
    ["@oh-my-pi/pi-utils", "sanitizeText"],
  ];
  for (const [spec, member] of specs) {
    const mod: Record<string, unknown> = await import(spec);
    if (member === null) continue; // resolved is the whole contract for a type-only module
    expect(typeof mod[member], `${spec} must export ${member}`).toBe("function");
  }
});

test("the host theme exposes a working fg and string-valued sep/nav/status", () => {
  // Straight from the 18.8.7 breakage. `resolveTheme` can paper over a broken theme, but the panel
  // renders colourless if it has to, so the shape is worth asserting here where a failure names it.
  ensureThemeSync();
  expect(theme).toBeDefined();
  expect(typeof theme.fg).toBe("function");
  expect(typeof theme.fg("dim", "text")).toBe("string");
  // These are string-valued getters in the host Theme; consumers INTERPOLATE them, so a function
  // here would render "(text) => text" into the panel.
  expect(typeof theme.sep.dot).toBe("string");
  expect(typeof theme.nav.cursor).toBe("string");
  expect(typeof theme.status.error).toBe("string");
});

// A real session against the installed host takes ~5 s on its own, which is exactly bun's
// default per-test budget — so this test only failed when another file was loading the machine.
// The budget is widened to the repo's own convention for tests that touch the real host.
const HOST_CONTRACT_TIMEOUT_MS = 30_000;

test(
  "the plugin loads against the installed host with no extension errors",
  async () => {
    // The one that would have caught theme.fg from outside the TUI: a real session, no model, no UI.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-host-contract-"));
    const { session, extensionsResult } = await createAgentSession({
      agentId: "HostContract",
      sessionManager: SessionManager.inMemory(root),
      localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "HostContract" },
      extensions: [roomExtension],
      disableExtensionDiscovery: true,
      enableMCP: false,
      enableLsp: false,
      hasUI: false,
    });
    try {
      expect(extensionsResult?.errors ?? []).toEqual([]);
      for (const name of ["room", "wait_for_claim", "wait_for_agent", "wait_for_message"]) {
        expect(session.getToolByName(name), `${name} must register`).toBeDefined();
      }
    } finally {
      await session.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  HOST_CONTRACT_TIMEOUT_MS,
);
