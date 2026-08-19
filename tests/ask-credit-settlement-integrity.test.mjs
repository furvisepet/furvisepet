import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hashAiCreditPayload,
  reconcileAiCredit,
  reconcileAiCreditLogicalRequest,
  reserveAiCredit,
  setAiCreditDisposition,
} from "../app/lib/ai/usage-ledger.ts";

const userId = "10000000-0000-4000-8000-000000000001";
const logicalTurnId = "20000000-0000-4000-8000-000000000001";
const attemptA = "30000000-0000-4000-8000-000000000001";
const attemptB = "30000000-0000-4000-8000-000000000002";
const petId = "40000000-0000-4000-8000-000000000001";
const payload = { conversationId: "50000000-0000-4000-8000-000000000001", locale: "en", petId, question: "Is she okay?" };
const payloadHash = hashAiCreditPayload("ask", payload);

test("persisted chargeable answer survives terminal RPC failure because MUST_COMPLETE is durable", async () => {
  const ledger = new SettlementLedger({ reconcileFailures: 1 });
  await reserve(ledger, attemptA);
  const assistantMessages = [{ id: "assistant-1", persisted: true }];
  await decide(ledger, attemptA, "complete");

  await assert.rejects(reconcile(ledger, attemptA), hasCause("simulated reconciliation failure"));
  assert.equal(assistantMessages.length, 1);
  assert.equal(ledger.event(attemptA).disposition, "complete");
  assert.equal(ledger.event(attemptA).status, "reserved");

  await reconcileLogical(ledger);
  ledger.cleanup();
  assert.equal(ledger.completedCount(), 1);
  assert.equal(ledger.releasedCount(), 0);
});

test("clarification release failure can only reconcile toward MUST_RELEASE", async () => {
  const ledger = new SettlementLedger({ reconcileFailures: 1 });
  await reserve(ledger, attemptA);
  await decide(ledger, attemptA, "release");
  await assert.rejects(reconcile(ledger, attemptA), hasCause("simulated reconciliation failure"));

  await reconcileLogical(ledger);
  assert.equal(ledger.completedCount(), 0);
  assert.equal(ledger.releasedCount(), 1);
  await assert.rejects(decide(ledger, attemptA, "complete"), hasCause("AI_CREDIT_DISPOSITION_CONFLICT"));
});

test("provider failure plus release failure is reconciled before a retry reserves again", async () => {
  const ledger = new SettlementLedger({ reconcileFailures: 1 });
  await reserve(ledger, attemptA);
  await decide(ledger, attemptA, "release");
  await assert.rejects(reconcile(ledger, attemptA), hasCause("simulated reconciliation failure"));

  await reserve(ledger, attemptB);
  assert.equal(ledger.event(attemptA).status, "released", "new reservation reconciles prior durable release intent");
  await decide(ledger, attemptB, "complete");
  await reconcile(ledger, attemptB);
  assert.equal(ledger.completedCount(), 1);
  assert.equal(ledger.releasedCount(), 1);
  assert.equal(ledger.reservedCount(), 0);
});

test("cleanup follows disposition and never guesses for an unknown reservation", () => {
  const ledger = new SettlementLedger();
  ledger.seed(attemptA, "complete");
  ledger.seed(attemptB, "release");
  const unknown = "30000000-0000-4000-8000-000000000003";
  ledger.seed(unknown, null);

  const result = ledger.cleanup();
  assert.deepEqual(result, { completed: 1, missing: 1, released: 1 });
  assert.equal(ledger.event(attemptA).status, "completed");
  assert.equal(ledger.event(attemptB).status, "released");
  assert.equal(ledger.event(unknown).status, "reserved");
});

test("disposition, foreground settlement, replay, and cleanup races have one compatible winner", async () => {
  const dispositionRace = new SettlementLedger();
  await reserve(dispositionRace, attemptA);
  const decisions = await Promise.allSettled([decide(dispositionRace, attemptA, "complete"), decide(dispositionRace, attemptA, "release")]);
  assert.equal(decisions.filter((result) => result.status === "fulfilled").length, 1);
  await reconcile(dispositionRace, attemptA);
  const terminal = dispositionRace.event(attemptA);
  assert.equal(terminal.status, terminal.disposition === "complete" ? "completed" : "released");

  for (const order of ["replay-first", "cleanup-first"]) {
    const ledger = new SettlementLedger();
    await reserve(ledger, attemptA);
    await decide(ledger, attemptA, "complete");
    if (order === "replay-first") await Promise.all([reconcileLogical(ledger), Promise.resolve().then(() => ledger.cleanup())]);
    else await Promise.all([Promise.resolve().then(() => ledger.cleanup()), reconcileLogical(ledger)]);
    assert.equal(ledger.completedCount(), 1, order);
    assert.equal(ledger.releasedCount(), 0, order);
  }
});

test("canonical replay identity changes for every protected payload field and replay stays behind claim", () => {
  for (const changed of [
    { ...payload, conversationId: "50000000-0000-4000-8000-000000000002" },
    { ...payload, locale: "fr" },
    { ...payload, petId: "40000000-0000-4000-8000-000000000002" },
    { ...payload, question: "Changed question" },
  ]) assert.notEqual(hashAiCreditPayload("ask", changed), payloadHash);

  const route = readFileSync("app/api/ask/route.ts", "utf8");
  const claim = route.indexOf("idempotency = await claimIdempotentOperation");
  const replay = route.indexOf("completed response replayed after canonical identity validation");
  assert.ok(claim >= 0 && replay > claim);
  assert.doesNotMatch(route.slice(0, claim), /return completedResponseFromPersisted/);
  assert.match(route, /AI_REQUEST_IDENTITY_CONFLICT[\s\S]*IDEMPOTENCY_CONFLICT/);
});

test("durable disposition persistence failure is answer-critical", async () => {
  const ledger = new SettlementLedger({ dispositionFailures: 1 });
  await reserve(ledger, attemptA);
  await assert.rejects(decide(ledger, attemptA, "complete"), (error) => error?.stage === "disposition_failed");
  assert.equal(ledger.event(attemptA).disposition, null);
  await assert.rejects(reserve(ledger, attemptB), hasCause("AI_CREDIT_DISPOSITION_REQUIRED"));
});

test("forward migration preserves legacy terminal rows and leaves ambiguous reservations undecided", () => {
  const sql = readFileSync("supabase/migrations/20260819033443_enforce_ai_credit_settlement_disposition.sql", "utf8");
  assert.match(sql, /^--[\s\S]*\nbegin;/);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /when status = 'completed' then 'complete'/);
  assert.match(sql, /when status = 'released' then 'release'/);
  assert.match(sql, /else settlement_disposition/);
  assert.doesNotMatch(sql, /when status = 'reserved' then '(?:complete|release)'/);
  assert.match(sql, /status = 'reserved'[\s\S]*settlement_disposition is null[\s\S]*AI_CREDIT_DISPOSITION_REQUIRED/);
  assert.match(sql, /drop function public\.reserve_ai_credit\(uuid, uuid, text, text\)/);
  for (const signature of [
    "reserve_ai_credit\\(uuid, uuid, uuid, text, text\\)",
    "set_ai_credit_disposition\\(uuid, uuid, uuid, text, text, text\\)",
    "reconcile_ai_credit\\(uuid, uuid, uuid, text, text\\)",
    "complete_ai_credit\\(uuid, uuid, uuid, text, text\\)",
    "release_ai_credit\\(uuid, uuid, uuid, text, text\\)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.match(sql, /status = case usage_event\.settlement_disposition when 'complete' then 'completed' else 'released' end/);
  assert.match(sql, /settlement_disposition is not null[\s\S]*for update skip locked/);
  assert.match(sql, /ai_credit_missing_disposition/);
  for (const preservedDiagnostic of [
    "duplicate_active_medication_state",
    "provider_usage_reconciliation_required",
    "migration_version_mismatch",
  ]) assert.match(sql, new RegExp(preservedDiagnostic));
});

async function reserve(ledger, requestId) {
  return reserveAiCredit({ feature: "ask", ledgerClient: ledger, logicalRequestId: logicalTurnId, payloadHash, requestId, userId });
}

async function decide(ledger, requestId, disposition) {
  return setAiCreditDisposition({ disposition, feature: "ask", ledgerClient: ledger, logicalRequestId: logicalTurnId, payloadHash, requestId, userId });
}

async function reconcile(ledger, requestId) {
  return reconcileAiCredit({ feature: "ask", ledgerClient: ledger, logicalRequestId: logicalTurnId, payloadHash, requestId, userId });
}

async function reconcileLogical(ledger) {
  return reconcileAiCreditLogicalRequest({ feature: "ask", ledgerClient: ledger, logicalRequestId: logicalTurnId, payloadHash, supabase: ledger, userId });
}

class SettlementLedger {
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
    if (name === "reconcile_ai_credit") {
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
function hasCause(message) { return (error) => error?.cause?.message === message; }
