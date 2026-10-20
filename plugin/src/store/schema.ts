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
      /** R1 — a retry key: a repeat with the same key returns THIS record instead of a new one. */
      idemKey?: string;
      /** R6 — the topic's status ledger, written by the agent that holds the topic's claim. */
      status?: StatusObject;
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
      /** R3 — the resources that must be free before this one may be claimed. */
      dependsOn?: string[];
      /**
       * R1 — the generation of this grant, per resource. It rises whenever OWNERSHIP changes, so a
       * holder whose lease was reclaimed can be told its token is stale. Kleppmann: "you need to
       * include a fencing token with every write request... the storage server remembers that it
       * has already processed a write with a higher token number".
       */
      gen?: number;
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
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "wait";
      id: string;
      from: string; // the waiter
      waited: "claim" | "agent" | "message";
      target: string; // the resource, the agent id(s), or the topic
      outcome: "event" | "timeout" | "aborted";
      enqueuedAt: number; // when the wait started — `ts` is when it resolved
    }
  | {
      v: 1;
      seq: number;
      ts: number;
      kind: "delivered";
      id: string;
      from: string; // the RECIPIENT
      deliveredSeq: number; // the seq of the record that was delivered
      tier: "T0" | "T1" | "T2";
    };

export type Performative =
  | "inform"
  | "request"
  | "propose"
  | "accept"
  | "reject"
  | "query"
  | "failure";

/**
 * R6 — one answer in the topic's status ledger: what it is, and why.
 *
 * Magentic-One's ledger is five keys, each `{reason, answer}` — the shape the report calls the
 * strongest single number in the corpus ("eliminating both ledgers... drops performance by 31%").
 */
export interface StatusAnswer {
  reason: string;
  answer: string;
}

/** The five keys. All five are required: a partial ledger is not a ledger. */
export interface StatusObject {
  is_request_satisfied: StatusAnswer;
  is_in_loop: StatusAnswer;
  is_progress_being_made: StatusAnswer;
  next_speaker: StatusAnswer;
  instruction_or_question: StatusAnswer;
}

/** The ledger's keys, in the order the schema checks them. */
export const STATUS_KEYS = [
  "is_request_satisfied",
  "is_in_loop",
  "is_progress_being_made",
  "next_speaker",
  "instruction_or_question",
] as const satisfies readonly (keyof StatusObject)[];

export type RecordKind = RoomRecord["kind"];

// §3.2 — the append input. The store mints v/seq/ts/id (§3.1 K15).
export type RoomRecordDraft =
  | Omit<Extract<RoomRecord, { kind: "msg" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "claim" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "release" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "note" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "member" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "gap" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "contended" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "wait" }>, "v" | "seq" | "ts" | "id">
  | Omit<Extract<RoomRecord, { kind: "delivered" }>, "v" | "seq" | "ts" | "id">;

// K11 — WaitOutcome is declared ONCE, in tools/wait-for-claim.ts (§22), and imported here for the
// `details` payloads; no redeclaration.

// §4.1 "board return shape" — the literal shapes the plan gives, named (they live inside `details`).
export interface ClaimRow {
  resource: string;
  holder: string;
  ttlMs: number;
  expiresAt: number;
  acquiredAt: number;
  /** R9 — the agent ids waiting for this resource (the old count, as names). */
  waiting: string[];
  /** R9 — the resources this claim waits on (its `dependsOn`). */
  dependsOn: string[];
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
  /** R5 — session-scoped delivery telemetry: what reached an agent at each tier. */
  deliveries: { T0: number; T1: number; T2: number };
}
