// §3.2 — verbatim
export type RoomRecord =
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "msg";
      id: string;
      from: string;
      topic: string;
      body: string;
      to?: string;
      mention?: string[];
      replyTo?: string;
      threadRoot?: string;
      performative?: Performative;
      replyWith?: string;
      replyBy?: string;
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "claim";
      id: string;
      from: string;
      resource: string;
      ttlMs: number;
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "release";
      id: string;
      from: string;
      resource: string;
      reason: "released" | "expired" | "reclaimed" | "aborted";
      prevHolder: string;
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "note";
      id: string;
      from: string;
      topic: string;
      body: string;
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "member";
      id: string;
      from: string;
      action: "join" | "leave";
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "gap";
      id: string;
      from: string;
      skipped: number;
      reason: "retention" | "invalid" | "corrupt";
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "contended";
      id: string;
      from: string; // the agent that LOST the claim
      resource: string;
      holder: string; // the agent that holds it
    };

export type Performative =
  | "inform"
  | "request"
  | "propose"
  | "accept"
  | "reject"
  | "query"
  | "failure";

export type RecordKind = RoomRecord["kind"];

// §3.2 — the append input. The store mints v/seq/ts/id (§3.1 K15).
export type RoomRecordDraft =
  | Omit<Extract<RoomRecord, { kind: "msg" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "claim" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "release" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "note" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "member" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "gap" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "contended" }>, "v" | "seq" | "ts" | "id">;

// K11 — WaitOutcome is declared ONCE, in tools/wait-for-claim.ts (§22), and imported here for the
// `details` payloads; no redeclaration.

// §4.1 "board return shape" — the literal shapes the plan gives, named (they live inside `details`).
export interface ClaimRow {
  resource: string;
  holder: string;
  ttlMs: number;
  expiresAt: number;
  acquiredAt: number;
  contended: number;
}
export interface RosterRow {
  agentId: string;
  status: string;
  cursor: number;
  lag: number;
  topics: string[];
}
export interface TopicRow {
  topic: string;
  lastSeq: number;
  unread: number;
}
export interface BoardResult {
  ok: true;
  claims: ClaimRow[];
  roster: RosterRow[];
  topics: TopicRow[];
}
