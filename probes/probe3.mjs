// PROBE 3 — the K1 finding: does a result WITHOUT `content` get coerced to isError?
// And does `loadMode: discoverable` mount under xd:// while `essential` stays top-level?
import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import * as fs from "node:fs"; import * as os from "node:os"; import * as path from "node:path";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe3-"));

function ext(pi) {
  // deliberately BAD shape (K1) — no content array
  pi.registerTool({ name: "probe_bad", label: "Bad", description: "bad shape",
    parameters: pi.zod.object({}), loadMode: "essential",
    async execute() { return { outcome: "event", ok: true }; } });
  pi.registerTool({ name: "probe_good", label: "Good", description: "good shape",
    parameters: pi.zod.object({}), loadMode: "essential",
    async execute() { return { content: [{ type: "text", text: "ok" }], details: { outcome: "event" } }; } });
  pi.registerTool({ name: "probe_disc", label: "Disc", description: "discoverable",
    parameters: pi.zod.object({}), loadMode: "discoverable",
    async execute() { return { content: [{ type: "text", text: "d" }], details: {} }; } });
}

const { session } = await createAgentSession({
  extensions: [ext], agentRegistry: new AgentRegistry(), agentId: "P",
  sessionManager: SessionManager.inMemory(root),
  localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "P" },
  disableExtensionDiscovery: true, enableMCP: false, enableLsp: false, hasUI: false,
});

const active = session.getActiveToolNames ? session.getActiveToolNames() : [];
console.log("active tools include probe_good:", active.includes("probe_good"));
console.log("active tools include probe_bad :", active.includes("probe_bad"));
console.log("active tools include probe_disc:", active.includes("probe_disc"), "(discoverable -> mounted under xd://)");

const bad = session.getToolByName("probe_bad");
if (bad) {
  const r = await bad.execute("c", {}, undefined, undefined);
  console.log("BAD-shape result content:", JSON.stringify(r.content));
  console.log("BAD-shape isError:", r.isError);
}
await session.dispose();
