import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentRegistry, SessionManager, createAgentSession } from "@oh-my-pi/pi-coding-agent";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { logPathFor, roomIdFor } from "../src/ids";
import roomExtension, { __roomTest } from "../src/index";

// K14 — the harness derives the path from the same helpers the store uses.
// X1 — ROOT-STABLE: the id comes from the resolved root (shared by the parent and every subagent),
// never from a session id (`task/executor.ts:4181,4186`).
const ROOM_ID = (root: string): string => roomIdFor(root);
const logPath = (root: string): string => logPathFor(root, ROOM_ID(root));

async function newSession(bus: EventBus, registry: AgentRegistry, root: string, id: string) {
  throw new Error("not implemented");
}

test("room: claim → wait_for_claim → durable log (§11.1)", () => {
  throw new Error("not implemented");
});

test("B's wait_for_claim is still pending before A releases", () => {
  throw new Error("not implemented");
});

test("it resolves details:{ok:true, outcome:'event', acquired:true, claim:{holder:'AgentB'}} after A's release", () => {
  throw new Error("not implemented");
});

test("the JSONL at logPathFor(root, roomId) contains the claim line with from:'AgentA', resource:'build/step'", () => {
  throw new Error("not implemented");
});

test("a second claim from A returns details:{ok:false, holder:'AgentB'} (first-writer-wins)", () => {
  throw new Error("not implemented");
});

test("every tool result carries a non-empty content array (K1 — never {outcome} alone)", () => {
  throw new Error("not implemented");
});

test("a non-last session's dispose leaves the fd open; the last one closes it (K8/K9)", () => {
  throw new Error("not implemented");
});

test("a claimed resource past its TTL is swept by the 5 s job and appends release{reason:'expired'} (K3)", () => {
  throw new Error("not implemented");
});


test("the same file read from B's root options is identical (subagents share the parent root)", () => {
  throw new Error("not implemented");
});

test("wait_for_message resolves on A's post with mention:true", () => {
  throw new Error("not implemented");
});

test("each wait tool returns outcome:'timeout' (not an error) inside a 1 s test timeout", () => {
  throw new Error("not implemented");
});

test("aborting the session rejects cleanly and the promise settles", () => {
  throw new Error("not implemented");
});

test("delivery adapter: T2 bump / T1 self aside / T1 sibling aside / T0 sibling steer", () => {
  throw new Error("not implemented");
});

test("wait_for_agent resolves when the target changes status", () => {
  throw new Error("not implemented");
});

test("no-UI fallback: renderers degrade gracefully when FramedMessageComponent is absent", () => {
  throw new Error("not implemented");
});

test("a deliberately throwing renderer falls back to the default card", () => {
  throw new Error("not implemented");
});
