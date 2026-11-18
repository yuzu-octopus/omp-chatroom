import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AgentRegistry,
  type AgentSession,
  createAgentSession,
  SessionManager,
} from "@oh-my-pi/pi-coding-agent";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { logPathFor, roomIdFor } from "../src/ids";
import roomExtension from "../src/index";
import {
  clearWaitEdges,
  findWaitCycle,
  setWaitEdges,
  type WaitTarget,
} from "../src/store/wait-graph";

type Session = AgentSession;

interface ToolResultEnvelope {
  content: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
  useless?: boolean;
}
interface ToolCall {
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<ToolResultEnvelope>;
}

async function newSession(
  bus: EventBus,
  registry: AgentRegistry,
  root: string,
  id: string,
): Promise<Session> {
  const { session } = await createAgentSession({
    eventBus: bus,
    sessionManager: SessionManager.inMemory(root),
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => id },
    extensions: [roomExtension],
    agentRegistry: registry,
    agentId: id,
    taskDepth: 1,
    disableExtensionDiscovery: true,
    enableMCP: false,
    enableLsp: false,
    hasUI: false,
  });
  return session;
}

function toolOf(session: Session, name: string): ToolCall {
  const t = session.getToolByName(name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t as unknown as ToolCall;
}

function freshRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-wait-regression-"));
}

const WAIT_TIMEOUT_MS = 60_000;

test(
  "claim waiter settles on the release-driven promotion after a foreign win, recording one wait",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    const c = await newSession(bus, registry, root, "AgentC");
    try {
      const roomA = toolOf(a, "room");
      const roomB = toolOf(b, "room");
      await roomA.execute("reg-hold", {
        op: "claim",
        topic: "reg",
        key: "res",
        ttl: 300_000,
      });

      // C is the oldest queued waiter; B queues behind it. A's release promotes C, whose
      // own-name claim record is a foreign win that must requeue B without settling it.
      // The board is the observable queue, so no sleep is needed to order the waiters.
      const waitCP = toolOf(c, "wait_for_claim").execute("reg-wc", {
        resource: "reg/res",
        timeout: 10_000,
      });
      const waitBP = toolOf(b, "wait_for_claim").execute("reg-wb", {
        resource: "reg/res",
        timeout: 10_000,
      });
      const queue = (await roomA.execute("reg-board-1", { op: "board" })).details as {
        board: { claims: Array<{ resource: string; holder: string; waiting: string[] }> };
      };
      expect(queue.board.claims.find((claim) => claim.resource === "reg/res")?.waiting).toEqual([
        "AgentC",
        "AgentB",
      ]);

      await roomA.execute("reg-release-a", { op: "release", topic: "reg", key: "res" });
      const winnerC = await waitCP;
      expect(winnerC.details).toMatchObject({
        ok: true,
        outcome: "event",
        acquired: true,
        claim: { holder: "AgentC" },
      });
      const afterWin = (await roomA.execute("reg-board-2", { op: "board" })).details as {
        board: { claims: Array<{ resource: string; holder: string; waiting: string[] }> };
      };
      const held = afterWin.board.claims.find((claim) => claim.resource === "reg/res");
      expect(held?.holder).toBe("AgentC");
      expect(held?.waiting).toEqual(["AgentB"]);

      // C's release makes resolveWaiters append an own-name claim for B. That grant record —
      // not the release record — settles the wait before its timeout.
      const roomC = toolOf(c, "room");
      await roomC.execute("reg-release-c", { op: "release", topic: "reg", key: "res" });
      const winnerB = await waitBP;
      expect(winnerB.details).toMatchObject({
        ok: true,
        outcome: "event",
        acquired: true,
        claim: { holder: "AgentB" },
      });

      // A renewal after settlement is another own-name claim record; it must not write a
      // second wait record (I12).
      await roomB.execute("reg-renew", { op: "claim", topic: "reg", key: "res", ttl: 300_000 });
      // Temp-root projects keep their room beside the project; the id is minted from that root.
      const roomRoot = path.join(root, ".omp-room");
      const log = fs.readFileSync(logPathFor(roomRoot, roomIdFor(roomRoot)), "utf8");
      const waits = log
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { kind?: string; from?: string; outcome?: string })
        .filter((record) => record.kind === "wait" && record.from === "AgentB");
      expect(waits).toHaveLength(1);
      expect(waits[0].outcome).toBe("event");
    } finally {
      await a.dispose();
      await b.dispose();
      await c.dispose();
    }
  },
  WAIT_TIMEOUT_MS,
);

test("R4 OR mode: one cyclic candidate and one free candidate is not a deadlock", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-or-cycle-"));
  try {
    // B waits for A (a cycle with A's proposed wait), while C waits for D, which is unblocked.
    setWaitEdges(root, "B", [{ kind: "agent", agentId: "A" }]);
    setWaitEdges(root, "C", [{ kind: "agent", agentId: "D" }]);
    const targets: WaitTarget[] = [
      { kind: "agent", agentId: "B" },
      { kind: "agent", agentId: "C" },
    ];
    // Default ("all") stays conservative and refuses; "any" only refuses when every
    // satisfier is blocked and leads back, so this wait can proceed.
    expect(findWaitCycle(root, "A", targets, () => undefined)).not.toBeNull();
    expect(findWaitCycle(root, "A", targets, () => undefined, "any")).toBeNull();
  } finally {
    clearWaitEdges(root, "B");
    clearWaitEdges(root, "C");
  }
});

test("R4 OR mode: a cycle is still refused when every candidate leads back", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-or-cycle-"));
  try {
    setWaitEdges(root, "B", [{ kind: "agent", agentId: "A" }]);
    setWaitEdges(root, "C", [{ kind: "agent", agentId: "A" }]);
    const targets: WaitTarget[] = [
      { kind: "agent", agentId: "B" },
      { kind: "agent", agentId: "C" },
    ];
    const cycle = findWaitCycle(root, "A", targets, () => undefined, "any");
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe("A");
    expect(cycle).toContain("B");
    expect(cycle).toContain("A");
  } finally {
    clearWaitEdges(root, "B");
    clearWaitEdges(root, "C");
  }
});

test("R4 OR mode: filterless message waits need every blocked sender to lead back", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-or-message-"));
  try {
    setWaitEdges(root, "B", [{ kind: "agent", agentId: "A" }]);
    setWaitEdges(root, "C", [{ kind: "agent", agentId: "D" }]);
    const targets: WaitTarget[] = [{ kind: "message" }];
    expect(findWaitCycle(root, "A", targets, () => undefined, "any")).toBeNull();

    setWaitEdges(root, "C", [{ kind: "agent", agentId: "A" }]);
    const cycle = findWaitCycle(root, "A", targets, () => undefined, "any");
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe("A");
  } finally {
    clearWaitEdges(root, "B");
    clearWaitEdges(root, "C");
  }
});

test("R4 default mode keeps the single-target claim cycle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "room-or-claim-"));
  try {
    setWaitEdges(root, "B", [{ kind: "agent", agentId: "A" }]);
    const cycle = findWaitCycle(
      root,
      "A",
      [{ kind: "resource", resource: "build/one" }],
      (resource) => (resource === "build/one" ? "B" : undefined),
    );
    expect(cycle).toEqual(["A", "B", "A"]);
  } finally {
    clearWaitEdges(root, "B");
  }
});
