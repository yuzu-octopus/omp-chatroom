// PROBE 1 — the plan's central claim: two sessions in one process share a local:// root,
// and each subagent has its OWN SessionManager (the X1 finding).
import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import * as fs from "node:fs"; import * as os from "node:os"; import * as path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
const opts = (id) => ({ getArtifactsDir: () => root, getSessionId: () => id });

const rA = resolveLocalRoot(opts("AgentA"));
const rB = resolveLocalRoot(opts("AgentB"));
console.log("rootA:", rA);
console.log("rootB:", rB);
console.log("SHARED ROOT (plan's premise):", rA === rB);
console.log("last segment:", path.basename(rA));

// X1: are session ids distinct per manager?
const m1 = SessionManager.inMemory(root);
const m2 = SessionManager.inMemory(root);
console.log("m1 id:", m1.getSessionId());
console.log("m2 id:", m2.getSessionId());
console.log("distinct session ids:", m1.getSessionId() !== m2.getSessionId());
console.log("=> roomIdFor(sessionId) would FRAGMENT:", m1.getSessionId() !== m2.getSessionId());
