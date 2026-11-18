import { globalMap } from "../globals";

/**
 * R4 — the wait-for graph, and the cycle check that no single wait mechanism can do alone.
 *
 * A wait edge is "agent X is blocked on T", where T is a resource, an agent, or a message from
 * an agent. A **holder** edge is "agent Y holds resource R". A cycle in the union is a deadlock:
 * every agent in it is waiting for something another one of them is holding, so nothing will
 * ever unblock it — and nothing says so. The report's evidence is a bug in this same product
 * family: "the graph is maintained on every wait() and consumed on every matching send(), but
 * never inspected for cycles", and the group "stalls for the entire wait timeout with no
 * indication anything is wrong; the status line shows every agent as 'running'".
 *
 * A cycle can span more than one wait mechanism — an agent waiting for a claim while another
 * waits for a message from the first — so the graph is kept per ROOM ROOT, not per mechanism.
 *
 * The state is keyed by root (I2: no session-scoped module state) and is in memory: the waits
 * themselves are in-memory too (a promise, not a record), so the graph is the same lifetime.
 */

export type WaitTarget =
  | { kind: "resource"; resource: string }
  | { kind: "agent"; agentId: string }
  | { kind: "message"; from?: string };

/** How a wait interprets several satisfiers; see `findWaitCycle`. */
export type WaitCycleMode = "all" | "any";

/** The agents this target can be satisfied by. A resource is satisfied by its holder. */
function candidatesOf(
  target: WaitTarget,
  holderOf: (resource: string) => string | undefined,
  requester: string,
  blockedAgents: readonly string[],
): string[] {
  switch (target.kind) {
    case "resource": {
      const holder = holderOf(target.resource);
      return holder === undefined ? [] : [holder];
    }
    case "agent":
      return [target.agentId];
    case "message":
      if (target.from !== undefined) return [target.from];
      // A filterless wait matches any sender, so any OTHER blocked agent keeps it deadlocked;
      // an unblocked agent will act. The requester is itself blocked, never its own satisfier.
      return blockedAgents.filter((id) => id !== requester);
  }
}

/** root → agent id → what it is blocked on (several targets when the wait accepts any of them). */
const WAIT_EDGES = globalMap<string, Map<string, WaitTarget[]>>("__roomWaitEdges");

export function setWaitEdges(root: string, agentId: string, targets: readonly WaitTarget[]): void {
  let edges = WAIT_EDGES.get(root);
  if (edges === undefined) {
    edges = new Map();
    WAIT_EDGES.set(root, edges);
  }
  edges.set(agentId, [...targets]);
}

export function clearWaitEdges(root: string, agentId: string): void {
  WAIT_EDGES.get(root)?.delete(agentId);
}

/**
 * The cycle a new wait would close, or null.
 *
 * `holderOf` resolves a resource to its current holder — the caller passes the room's claim map,
 * so this module does not depend on the store (claims.ts and room-store.ts both import this one).
 *
 * `mode` defaults to "all": one candidate path back to the requester closes a cycle, which is
 * correct when every target is required (require:"all") and for single-target claim/message waits.
 * Pass "any" when one satisfier resolves the wait (require:"any" agent waits, filterless message
 * waits): only refuse when EVERY candidate is blocked and has a path back to the requester.
 *
 * The returned array names the agents in the cycle, in order, with the requester first.
 */
export function findWaitCycle(
  root: string,
  agentId: string,
  targets: readonly WaitTarget[],
  holderOf: (resource: string) => string | undefined,
  mode: WaitCycleMode = "all",
): string[] | null {
  // A missing edge map is an empty one: the requester's own targets are still walked, so the
  // first waiter can detect a cycle it closes (e.g. waiting on itself) without prior edges.
  const edges = WAIT_EDGES.get(root);
  const blockedAgents = edges === undefined ? [] : [...edges.keys()];

  if (mode === "any") {
    // A path that reaches the requester closes a cycle. `from` identifies the agent whose wait
    // is being walked, so a nested filterless message excludes that agent, not the requester.
    const pathBackTo = (
      from: string,
      pending: readonly WaitTarget[],
      seen: Set<string>,
      path: string[],
    ): string[] | null => {
      for (const target of pending) {
        for (const next of candidatesOf(target, holderOf, from, blockedAgents)) {
          if (next === agentId) return [...path, next];
          if (seen.has(next)) continue;
          const nextTargets = edges?.get(next);
          if (nextTargets === undefined) continue;
          seen.add(next);
          path.push(next);
          const found = pathBackTo(next, nextTargets, seen, path);
          path.pop();
          seen.delete(next);
          if (found !== null) return found;
        }
      }
      return null;
    };

    let cyclePath: string[] | null = null;
    for (const target of targets) {
      const candidates = candidatesOf(target, holderOf, agentId, blockedAgents);
      // No blocked satisfier is no evidence of a deadlock — an unblocked agent can act.
      if (candidates.length === 0) return null;
      for (const next of candidates) {
        if (next === agentId) {
          cyclePath ??= [agentId];
          continue;
        }
        const nextTargets = edges?.get(next);
        if (nextTargets === undefined) return null;
        const path = pathBackTo(next, nextTargets, new Set([agentId, next]), [next]);
        if (path === null) return null;
        cyclePath ??= path;
      }
    }
    return cyclePath === null ? null : [agentId, ...cyclePath];
  }

  const seen = new Set<string>();
  const path: string[] = [];
  /** Walk one step: follow what an agent waits for to the agents that could satisfy it. */
  const step = (pending: readonly WaitTarget[]): string[] | null => {
    for (const target of pending) {
      for (const next of candidatesOf(target, holderOf, agentId, blockedAgents)) {
        if (next === agentId) return [...path, next];
        if (seen.has(next)) continue;
        seen.add(next);
        const nextTargets = edges?.get(next);
        if (nextTargets === undefined) continue;
        path.push(next);
        const found = step(nextTargets);
        path.pop();
        if (found !== null) return found;
      }
    }
    return null;
  };
  const found = step(targets);
  return found === null ? null : [agentId, ...found];
}

/** Forget a room's wait edges (the room was disposed). */
export function forgetWaitEdges(root: string): void {
  WAIT_EDGES.delete(root);
}
