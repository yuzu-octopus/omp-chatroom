// PROBE 2 — can an extension register a tool, and does a blocking execute hold?
// This tests the plan's core mechanism: a wait tool that blocks without a global timeout.
import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import * as fs from "node:fs"; import * as os from "node:os"; import * as path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe2-"));
let execResult = null, toolRegistered = false;

function ext(pi) {
  pi.registerTool({
    name: "probe_block",
    label: "Probe Block",
    description: "blocks for N ms",
    parameters: pi.zod.object({ ms: pi.zod.number() }),
    loadMode: "essential",
    interruptible: true,
    async execute(id, params, signal, onUpdate, ctx) {
      await Bun.sleep(params.ms);
      return { content: [{ type: "text", text: `slept ${params.ms}` }],
               details: { ok: true, slept: params.ms } };
    },
  });
  pi.registerTool({
    name: "probe_exec",
    label: "Probe Exec",
    description: "runs pi.exec",
    parameters: pi.zod.object({}),
    loadMode: "essential",
    async execute(id, params, signal, onUpdate, ctx) {
      const r = await pi.exec("echo", ["hello-from-exec"]);
      return { content: [{ type: "text", text: r.stdout.trim() }], details: { ok: true, code: r.code } };
    },
  });
}

const { session } = await createAgentSession({
  eventBus: undefined, extensions: [ext],
  agentRegistry: new AgentRegistry(), agentId: "Probe",
  sessionManager: SessionManager.inMemory(root), localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => "Probe" },
  disableExtensionDiscovery: true, enableMCP: false, enableLsp: false, hasUI: false,
});

const t1 = session.getToolByName("probe_block");
const t2 = session.getToolByName("probe_exec");
console.log("probe_block registered:", !!t1);
console.log("probe_exec  registered:", !!t2);

if (t1) {
  const start = Date.now();
  const r = await t1.execute("c1", { ms: 1200 }, undefined, undefined);
  const elapsed = Date.now() - start;
  console.log("blocked for:", elapsed, "ms (asked 1200) -> held:", elapsed >= 1150);
  console.log("result shape has content:", Array.isArray(r.content), "| details:", JSON.stringify(r.details));
}
if (t2) {
  const r = await t2.execute("c2", {}, undefined, undefined);
  console.log("pi.exec stdout:", JSON.stringify(r.content[0].text), "| code:", r.details.code);
}
await session.dispose();
