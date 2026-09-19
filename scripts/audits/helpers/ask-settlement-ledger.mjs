import assert from 'node:assert/strict';
const userId = 'synthetic-owner', logicalTurnId = 'production-logical-turn', payloadHash = 'production-payload';
export class SettlementLedger {
  constructor({ dispositionFailures = 0, reconcileFailures = 0 } = {}) {
    this.calls = [];
    this.dispositionFailures = dispositionFailures;
    this.events = new Map();
    this.reconcileFailures = reconcileFailures;
  }

  event(requestId) { return this.events.get(requestId); }
  completedCount() { return [...this.events.values()].filter((event) => event.status === "completed").length; }
  releasedCount() { return [...this.events.values()].filter((event) => event.status === "released").length; }
  reservedCount() { return [...this.events.values()].filter((event) => event.status === "reserved").length; }

  seed(requestId, disposition) {
    this.events.set(requestId, { credits: 1, disposition, feature: "ask", logicalRequestId: logicalTurnId, payloadHash, requestId, status: "reserved", userId });
  }

  cleanup() {
    let completed = 0; let missing = 0; let released = 0;
    for (const event of this.events.values()) {
      if (event.status !== "reserved") continue;
      if (event.disposition === "complete") { event.status = "completed"; event.credits = 1; completed += 1; }
      else if (event.disposition === "release") { event.status = "released"; event.credits = 0; released += 1; }
      else missing += 1;
    }
    return { completed, missing, released };
  }

  from(table) {
    assert.equal(table, "ai_usage_events");
    return new SettlementQuery(this);
  }

  async rpc(name, args) {
    this.calls.push({ args, name });
    const event = this.events.get(args.p_request_id);
    if (name === "reserve_ai_credit") {
      if (event) {
        if (!sameIdentity(event, args)) return failure("AI_REQUEST_IDENTITY_CONFLICT", "23505");
        return success("reservation_status", event);
      }
      const logical = [...this.events.values()].filter((item) => item.userId === args.p_user_id && item.feature === args.p_feature && item.logicalRequestId === args.p_logical_request_id);
      if (logical.some((item) => item.payloadHash !== args.p_payload_hash)) return failure("AI_REQUEST_IDENTITY_CONFLICT", "23505");
      if (logical.some((item) => item.status === "reserved" && item.disposition === null)) return failure("AI_CREDIT_DISPOSITION_REQUIRED", "23514");
      if (logical.some((item) => item.disposition === "complete")) return failure("AI_LOGICAL_TURN_ALREADY_CHARGEABLE", "23514");
      for (const item of logical) if (item.status === "reserved" && item.disposition === "release") { item.status = "released"; item.credits = 0; }
      const created = { credits: 1, disposition: null, feature: args.p_feature, logicalRequestId: args.p_logical_request_id, payloadHash: args.p_payload_hash, requestId: args.p_request_id, status: "reserved", userId: args.p_user_id };
      this.events.set(args.p_request_id, created);
      return success("reservation_status", created);
    }
    if (!event) return failure("AI_RESERVATION_NOT_FOUND");
    if (!sameIdentity(event, args)) return failure("AI_REQUEST_IDENTITY_CONFLICT", "23505");
    if (name === "set_ai_credit_disposition") {
      if (this.dispositionFailures > 0) { this.dispositionFailures -= 1; return failure("simulated disposition persistence failure"); }
      if (event.disposition && event.disposition !== args.p_disposition) return failure("AI_CREDIT_DISPOSITION_CONFLICT", "23514");
      if (args.p_disposition === "complete" && [...this.events.values()].some((item) => item !== event && item.logicalRequestId === event.logicalRequestId && item.disposition === "complete")) return failure("AI_CREDIT_DISPOSITION_CONFLICT", "23505");
      event.disposition = args.p_disposition;
      return success("event_status", event);
    }
    if (["reconcile_ai_credit", "complete_ai_credit", "release_ai_credit"].includes(name)) {
      if (!event.disposition) return failure("AI_CREDIT_DISPOSITION_REQUIRED", "23514");
      if (this.reconcileFailures > 0) { this.reconcileFailures -= 1; return failure("simulated reconciliation failure"); }
      event.status = event.disposition === "complete" ? "completed" : "released";
      event.credits = event.disposition === "complete" ? 1 : 0;
      return success("event_status", event);
    }
    return failure("unexpected RPC");
  }
}

class SettlementQuery {
  constructor(ledger) { this.ledger = ledger; this.filters = new Map(); }
  select() { return this; }
  eq(column, value) { this.filters.set(column, value); return this; }
  order() { return this; }
  returns() { return this; }
  then(resolve, reject) {
    try {
      const rows = [...this.ledger.events.values()].filter((event) => {
        for (const [column, value] of this.filters) if (databaseValue(event, column) !== value) return false;
        return true;
      }).map((event) => ({
        logical_request_id: event.logicalRequestId,
        payload_hash: event.payloadHash,
        request_id: event.requestId,
        settlement_disposition: event.disposition,
        status: event.status,
      }));
      return Promise.resolve(resolve({ data: rows, error: null }));
    } catch (error) { return reject?.(error); }
  }
}

function sameIdentity(event, args) {
  return event.userId === args.p_user_id && event.feature === args.p_feature && event.requestId === args.p_request_id
    && event.logicalRequestId === args.p_logical_request_id && event.payloadHash === args.p_payload_hash;
}

function databaseValue(event, column) {
  return { feature: event.feature, logical_request_id: event.logicalRequestId, user_id: event.userId }[column];
}

function success(statusKey, event) {
  return { data: [{ credits_used: event.credits, remaining: 7, settlement_disposition: event.disposition, [statusKey]: event.status }], error: null };
}

function failure(message, code = "TEST") { return { data: null, error: { code, message } }; }
