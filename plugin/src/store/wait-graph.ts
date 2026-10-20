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

/** The agents this target can be satisfied by. A resource is satisfied by its holder. */
function candidatesOf(
  target: WaitTarget,
  holderOf: (resource: string) => string | undefined,
): string[] {
  switch (target.kind) {
    case "resource": {
      const holder = holderOf(target.resource);
      return holder === undefined ? [] : [holder];
    }
    case "agent":
      return [target.agentId];
    case "message":
      return target.from === undefined ? [] : [target.from];
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
 * The returned array names the agents in the cycle, in order, with the requester first.
 */
export function findWaitCycle(
  root: string,
  agentId: string,
  targets: readonly WaitTarget[],
  holderOf: (resource: string) => string | undefined,
): string[] | null {
  const edges = WAIT_EDGES.get(root);
  if (edges === undefined) return null;

  const seen = new Set<string>();
  const path: string[] = [];

  /** Walk one step: follow what an agent waits for to the agents that could satisfy it. */
  const step = (pending: readonly WaitTarget[]): string[] | null => {
    for (const target of pending) {
      for (const next of candidatesOf(target, holderOf)) {
        if (next === agentId) return [...path, next];
        if (seen.has(next)) continue;
        seen.add(next);
        const nextTargets = edges.get(next);
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
