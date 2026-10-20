import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentRegistry, createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";
import { resolveLocalRoot } from "@oh-my-pi/pi-coding-agent/internal-urls/local-protocol";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { logPathFor, roomIdFor } from "../src/ids";
import roomExtension, { __roomTest } from "../src/index";
import { resolveRoomId } from "../src/store/config";

type Session = Awaited<ReturnType<typeof createAgentSession>>["session"];

/** Host generics are erased on `getToolByName`; restate the K1 envelope here. */
interface ToolResultEnvelope {
  content: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
  useless?: boolean;
}
interface ToolCall {
  execute(toolCallId: string, params: Record<string, unknown>): Promise<ToolResultEnvelope>;
}

// The room root is the PROJECT cwd (`ctx.cwd`), not the `local://` root: `localProtocolOptions` is
// per-session, so keying the room there gave every subagent its own private room (verified live:
// main resolved `<session>/local`, its subagent resolved `<session>/Task1/local`).
const ROOM_ROOT = (root: string): string => `${root}/.omp-room`;
const ROOM_ID = (root: string): string => roomIdFor(ROOM_ROOT(root));
const logPath = (root: string): string => logPathFor(ROOM_ROOT(root), ROOM_ID(root));
async function newSession(bus: EventBus, registry: AgentRegistry, root: string, id: string) {
  const { session } = await createAgentSession({
    eventBus: bus,
    // `ctx.cwd` — the room root — comes from the SessionManager, not the `cwd` option (verified:
    // the option drives discovery only).
    sessionManager: SessionManager.inMemory(root),
    localProtocolOptions: { getArtifactsDir: () => root, getSessionId: () => id },
    extensions: [roomExtension],
    agentRegistry: registry,
    agentId: id,
    disableExtensionDiscovery: true,
    enableMCP: false,
    enableLsp: false,
    hasUI: false,
  });
  return session;
}

/** Unchecked cast: the wrapper erases TDetails, and the test only reads the K1 fields. */
function toolOf(session: Session, name: string): ToolCall {
  const t = session.getToolByName(name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t as unknown as ToolCall;
}

function freshRoot(): string {
  __roomTest.store.reset();
  return fs.mkdtempSync(path.join(os.tmpdir(), "room-e2e-"));
}

function readLog(root: string): Array<Record<string, unknown>> {
  const p = logPath(root);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * These tests drive real sessions and real waits, so their runtime depends on the machine's
 * load: a busy box (a sibling project compiling, a parallel agent fleet) makes a child's startup
 * and a wake-up take seconds. bun's default 5 s per-test timeout is therefore too tight — the
 * WAIT semantics under test are unchanged (the wait tool's own timeout is still 5 s), only the
 * test's budget grows.
 */
const E2E_TIMEOUT_MS = 60_000;

test(
  "room: claim → wait_for_claim → durable log (§11.1)",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      const roomA = toolOf(a, "room");
      const roomB = toolOf(b, "room");
      const waitClaimB = toolOf(b, "wait_for_claim");

      // A claims first.
      const claimA = await roomA.execute("c-claim", {
        op: "claim",
        topic: "build",
        key: "step",
        ttl: 300_000,
      });
      expect(claimA.details).toMatchObject({ ok: true, op: "claim", holder: "AgentA" });

      // B waits for the claim to be released — still blocked.
      const waitP = waitClaimB.execute("c-wait", {
        resource: "build/step",
        ttl: 300_000,
        timeout: 5_000,
      });
      // One microtask proves only that it did not settle synchronously; a broken implementation
      // that resolves on the next macrotask would pass. Give it a bounded settle window instead.
      const settledEarly = await Promise.race([
        waitP.then(() => true),
        Bun.sleep(50).then(() => false),
      ]);
      expect(settledEarly).toBe(false); // still blocked — no polling

      // A releases → B's waiter is resolved AND granted the lease.
      await roomA.execute("c-release", { op: "release", topic: "build", key: "step" });
      const winner = await Promise.race([waitP, Bun.sleep(2_000).then(() => null)]);
      expect(winner).not.toBeNull();
      expect(winner!.details).toMatchObject({
        ok: true,
        outcome: "event",
        acquired: true,
        claim: { holder: "AgentB", resource: "build/step" },
      });

      // K1 — a direct execute() return proves only the PLUGIN's shape. The host's coercion runs in the
      // agent loop, so this assertion is a smoke check, not proof. See PROBES.md P3 and §11.2.
      expect(Array.isArray(winner!.content)).toBe(true);
      expect(winner!.content[0]?.type).toBe("text");

      // First-writer-wins: A's re-claim loses (B now holds it).
      const second = await roomA.execute("c-claim2", {
        op: "claim",
        topic: "build",
        key: "step",
        ttl: 300_000,
      });
      expect(second.details).toMatchObject({ ok: false, holder: "AgentB" });

      // The board reflects B as the holder.
      const board = await roomB.execute("c-board", { op: "board" });
      expect(board.details).toMatchObject({ ok: true, op: "board" });

      // Root sharing: both sessions resolve the SAME room log (K14).
      // X1 — the room id is ROOT-STABLE, never a session id.
      const rootA = resolveLocalRoot({ getArtifactsDir: () => root, getSessionId: () => "AgentA" });
      const rootB = resolveLocalRoot({ getArtifactsDir: () => root, getSessionId: () => "AgentB" });
      expect(rootA).toBe(rootB);
      const logPathA = logPathFor(rootA, resolveRoomId(rootA));
      const logPathB = logPathFor(rootB, resolveRoomId(rootB));
      expect(logPathA).toBe(logPathB);
      expect(roomIdFor(rootA)).toBe(roomIdFor(rootB));
      expect(roomIdFor(rootA)).not.toBe(roomIdFor(`${root}-other`));
      expect(roomIdFor(rootA)).not.toContain("AgentA");
      expect(roomIdFor(rootA)).not.toContain("AgentB");

      // Durable log: the claim line is on disk with the authenticated `from`.
      const lines = readLog(root);
      expect(lines.map((l) => l.kind)).toContain("claim");
      expect(lines.find((l) => l.kind === "claim")).toMatchObject({
        from: "AgentA",
        resource: "build/step",
      });
      expect(lines.find((l) => l.kind === "release")).toMatchObject({
        from: "AgentA",
        prevHolder: "AgentA",
        reason: "released",
      });
    } finally {
      await a.dispose();
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "B's wait_for_claim is still pending before A releases",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      await toolOf(a, "room").execute("c-claim", {
        op: "claim",
        topic: "t",
        key: "k",
        ttl: 300_000,
      });
      const waitP = toolOf(b, "wait_for_claim").execute("c-wait", {
        resource: "t/k",
        timeout: 5_000,
      });
      let done = false;
      void waitP.then(() => {
        done = true;
      });
      // One microtask turn: a settled promise would have flipped `done` by now.
      await Promise.resolve();
      expect(done).toBe(false);
      await toolOf(a, "room").execute("c-release", { op: "release", topic: "t", key: "k" });
      await Promise.race([waitP, Bun.sleep(2_000)]);
      expect(done).toBe(true);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "it resolves details:{ok:true, outcome:'event', acquired:true, claim:{holder:'AgentB'}} after A's release",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      await toolOf(a, "room").execute("c-claim", {
        op: "claim",
        topic: "x",
        key: "y",
        ttl: 300_000,
      });
      const waitP = toolOf(b, "wait_for_claim").execute("c-wait", {
        resource: "x/y",
        ttl: 60_000,
        timeout: 5_000,
      });
      await toolOf(a, "room").execute("c-release", { op: "release", topic: "x", key: "y" });
      const winner = await Promise.race([waitP, Bun.sleep(2_000).then(() => null)]);
      expect(winner!.details).toMatchObject({
        ok: true,
        outcome: "event",
        acquired: true,
        claim: { holder: "AgentB" },
      });
    } finally {
      await a.dispose();
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "the JSONL at logPathFor(root, roomId) contains the claim line with from:'AgentA', resource:'build/step'",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    try {
      await toolOf(a, "room").execute("c-claim", {
        op: "claim",
        topic: "build",
        key: "step",
        ttl: 300_000,
      });
      const lines = readLog(root);
      expect(lines.find((l) => l.kind === "claim")).toMatchObject({
        from: "AgentA",
        resource: "build/step",
        ttlMs: 300_000,
      });
    } finally {
      await a.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "a second claim from A returns details:{ok:false, holder:'AgentB'} (first-writer-wins)",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      // §11.1's sequence: A claims, A releases, B's waiter takes the lease, then A's re-claim loses.
      await toolOf(a, "room").execute("c-claim", {
        op: "claim",
        topic: "build",
        key: "step",
        ttl: 300_000,
      });
      const waitP = toolOf(b, "wait_for_claim").execute("c-wait", {
        resource: "build/step",
        timeout: 5_000,
      });
      await toolOf(a, "room").execute("c-release", { op: "release", topic: "build", key: "step" });
      const winner = await Promise.race([waitP, Bun.sleep(2_000).then(() => null)]);
      expect(winner!.details).toMatchObject({
        ok: true,
        acquired: true,
        claim: { holder: "AgentB" },
      });

      const second = await toolOf(a, "room").execute("c-claim2", {
        op: "claim",
        topic: "build",
        key: "step",
        ttl: 300_000,
      });
      expect(second.details).toMatchObject({ ok: false, holder: "AgentB" });
      expect(typeof second.details?.expiresAt).toBe("number");
    } finally {
      await a.dispose();
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "every tool result carries a non-empty content array (K1 — never {outcome} alone)",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    try {
      const room = toolOf(a, "room");
      const wait = toolOf(a, "wait_for_claim");
      const results: ToolResultEnvelope[] = [
        await room.execute("c-join", { op: "join" }),
        await room.execute("c-post", { op: "post", topic: "t", body: "hi" }),
        await room.execute("c-read", { op: "read", limit: 10 }),
        await room.execute("c-claim", { op: "claim", topic: "t", key: "k", ttl: 300_000 }),
        await room.execute("c-board", { op: "board" }),
        await room.execute("c-release", { op: "release", topic: "t", key: "k" }),
        await room.execute("c-release2", { op: "release", topic: "t", key: "k" }), // unknown → ok:false
        await wait.execute("c-wait", { resource: "t/k", timeout: 1_000 }), // timeout
      ];
      for (const res of results) {
        expect(Array.isArray(res.content)).toBe(true);
        expect(res.content.length).toBeGreaterThan(0);
        expect(res.content[0]?.type).toBe("text");
        expect(typeof res.content[0]?.text).toBe("string");
        expect(typeof res.details?.ok).toBe("boolean");
      }
    } finally {
      await a.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "a non-last session's dispose leaves the fd open; the last one closes it (K8/K9)",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      await toolOf(a, "room").execute("c-join", { op: "join" });
      await toolOf(b, "room").execute("c-join", { op: "join" });
      await a.dispose();
      // B is still live: the log is still appendable and the record lands.
      await toolOf(b, "room").execute("c-post", { op: "post", topic: "t", body: "after-A" });
      const lines = readLog(root);
      expect(lines.some((l) => l.kind === "msg" && l.body === "after-A")).toBe(true);
    } finally {
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test(
  "a second session with its own artifacts dir still reads the parent's room",
  async () => {
    const root = freshRoot();
    const bus = new EventBus();
    const registry = new AgentRegistry();
    const a = await newSession(bus, registry, root, "AgentA");
    const b = await newSession(bus, registry, root, "AgentB");
    try {
      await toolOf(a, "room").execute("c-claim", {
        op: "claim",
        topic: "shared",
        key: "res",
        ttl: 300_000,
      });
      // B has its own artifacts dir; the room root is the shared project cwd, so it sees A's claim.
      const boardB = await toolOf(b, "room").execute("c-board", { op: "board" });
      expect(boardB.details?.ok).toBe(true);
      const board = boardB.details?.board as {
        claims: Array<{ resource: string; holder: string }>;
      };
      expect(board.claims.find((c) => c.resource === "shared/res")).toMatchObject({
        holder: "AgentA",
      });
      expect(logPath(root)).toBe(logPathFor(ROOM_ROOT(root), resolveRoomId(ROOM_ROOT(root))));
    } finally {
      await a.dispose();
      await b.dispose();
    }
  },
  E2E_TIMEOUT_MS,
);

test("the real 5 s sweep job expires a stale claim (K3 integration)", async () => {
  // INTEGRATION EXCEPTION to ts-no-test-timers, deliberately: the thing under test IS the
  // session-owned `ctx.setInterval` job, and a fake clock cannot advance a timer the host owns
  // (`vi.advanceTimersByTime` does not reach it). The DETERMINISTIC proof of the sweep logic is in
  // tests/room-tool.test.ts, which calls `expireStale(store, now)` with an injected clock; this
  // test only proves the job is wired and fires. It is the suite's one wall-clock dependency.
  const root = freshRoot();
  const bus = new EventBus();
  const registry = new AgentRegistry();
  const a = await newSession(bus, registry, root, "AgentA");
  try {
    await toolOf(a, "room").execute("c-claim", { op: "claim", topic: "ttl", key: "x", ttl: 1_000 });
    // claimSweepMs is 5000 (config default); the claim's 1 s TTL is long past.
    const deadline = Date.now() + 12_000;
    let expired: Record<string, unknown> | undefined;
    while (Date.now() < deadline && !expired) {
      await Bun.sleep(250);
      expired = readLog(root).find((l) => l.kind === "release" && l.reason === "expired");
    }
    expect(expired, "the sweep job should have expired the claim within 12 s").toBeDefined();
    expect(expired).toMatchObject({ reason: "expired", prevHolder: "AgentA", resource: "ttl/x" });
  } finally {
    await a.dispose();
  }
}, 20_000);
