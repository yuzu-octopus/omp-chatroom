import { createAgentSession, SessionManager, AgentRegistry } from "@oh-my-pi/pi-coding-agent";
console.log("imports OK");
console.log("createAgentSession:", typeof createAgentSession);
console.log("SessionManager.inMemory:", typeof SessionManager.inMemory);
console.log("AgentRegistry:", typeof AgentRegistry);
console.log("AgentRegistry.global:", typeof AgentRegistry.global);
