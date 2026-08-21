import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  completeAiCredit,
  hashAiCreditPayload,
  releaseAiCredit,
  reserveAiCredit,
  runWithAiCredit,
} from "../app/lib/ai/usage-ledger.ts";

const migrationPath = "supabase/migrations/20260818194748_secure_ai_credit_state_machine.sql";
const settlementMigrationPath = "supabase/migrations/20260819033443_enforce_ai_credit_settlement_disposition.sql";
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const requestId = "20000000-0000-4000-8000-000000000001";
const askPayload = { conversationId: "", locale: "en", petId: "30000000-0000-4000-8000-000000000001", previousResponse: null, question: "Is this normal?" };
const askHash = hashAiCreditPayload("ask", askPayload);

test("completed credits are terminal and repeated completion is exactly-once", async () => {
  const ledger = new AuthoritativeLedger();
  await reserve(ledger);
  const [first, second] = await Promise.all([complete(ledger), complete(ledger)]);
  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  await assert.rejects(release(ledger), hasCause("AI_CREDIT_DISPOSITION_CONFLICT"));
  assert.deepEqual(ledger.event(userA, "ask", requestId), { credits: 1, disposition: "complete", feature: "ask", logicalRequestId: requestId, payloadHash: askHash, status: "completed" });
});

test("released credits are terminal and repeated release cannot double-refund", async () => {
  const ledger = new AuthoritativeLedger();
  await reserve(ledger);
  const [first, second] = await Promise.all([release(ledger), release(ledger)]);
  assert.equal(first.status, "released");
  assert.equal(second.status, "released");
  await assert.rejects(complete(ledger), hasCause("AI_CREDIT_DISPOSITION_CONFLICT"));
  assert.deepEqual(ledger.event(userA, "ask", requestId), { credits: 0, disposition: "release", feature: "ask", logicalRequestId: requestId, payloadHash: askHash, status: "released" });
});

test("release racing completion has one immutable terminal winner", async () => {
  for (const operations of [["complete", "release"], ["release", "complete"]]) {
    const ledger = new AuthoritativeLedger();
    await reserve(ledger);
    const results = await Promise.allSettled(operations.map((operation) => operation === "complete" ? complete(ledger) : release(ledger)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const state = ledger.event(userA, "ask", requestId);
    assert.ok(state.status === "completed" || state.status === "released");
    assert.equal(state.credits, state.status === "completed" ? 1 : 0);
  }
});

test("provider and pre-completion persistence failures release a reservation", async () => {
  for (const failureAt of ["provider", "persistence"]) {
    const ledger = new AuthoritativeLedger();
    await assert.rejects(runWithAiCredit({
      beforeComplete: failureAt === "persistence" ? async () => { throw new Error("persistence failed"); } : undefined,
      feature: "ask",
      generate: async () => {
        if (failureAt === "provider") throw new Error("provider failed");
        return "answer";
      },
      ledgerClient: ledger,
      payload: askPayload,
      requestId,
      supabase: ledger,
      userId: userA,
    }), new RegExp(`${failureAt} failed`));
    assert.equal(ledger.event(userA, "ask", requestId).status, "released");
    assert.equal(ledger.calls.filter((call) => call.name === "reconcile_ai_credit").length, 1);
  }
});

test("successful persisted answer completes once and UI allowance remains correct", async () => {
  const ledger = new AuthoritativeLedger();
  let persisted = 0;
  const result = await runWithAiCredit({
    beforeComplete: async () => { persisted += 1; },
    feature: "ask",
    generate: async () => "answer",
    ledgerClient: ledger,
    payload: askPayload,
    requestId,
    supabase: ledger,
    userId: userA,
  });
  assert.equal(persisted, 1);
  assert.equal(result.creditsUsed, 1);
  assert.equal(result.usage.count, 1);
  assert.equal(result.usage.remaining, 14);
  assert.equal(ledger.calls.filter((call) => call.name === "complete_ai_credit").length, 1);
});

test("a completed replay never invokes the provider or charges again", async () => {
  const ledger = new AuthoritativeLedger();
  await reserve(ledger);
  await complete(ledger);
  let providerCalls = 0;
  await assert.rejects(runWithAiCredit({
    feature: "ask",
    generate: async () => { providerCalls += 1; return "second answer"; },
    ledgerClient: ledger,
    payload: askPayload,
    requestId,
    supabase: ledger,
    userId: userA,
  }), /AI_CREDIT_COMPLETED_REPLAY_REQUIRED/);
  assert.equal(providerCalls, 0);
  assert.equal(ledger.event(userA, "ask", requestId).credits, 1);
});

test("retry after a reservation timeout reuses one charge and completes normally", async () => {
  const ledger = new AuthoritativeLedger();
  await reserve(ledger);
  let providerCalls = 0;
  const result = await runWithAiCredit({
    feature: "ask",
    generate: async () => { providerCalls += 1; return "recovered answer"; },
    ledgerClient: ledger,
    payload: askPayload,
    requestId,
    supabase: ledger,
    userId: userA,
  });
  assert.equal(providerCalls, 1);
  assert.equal(result.creditsUsed, 1);
  assert.equal([...ledger.events.values()].filter((event) => event.status === "completed").length, 1);
});

test("an uncertain completion is retried but never followed by release", async () => {
  const ledger = new AuthoritativeLedger({ failCompletedResponses: 2 });
  await assert.rejects(runWithAiCredit({
    feature: "ask",
    generate: async () => "persisted answer",
    ledgerClient: ledger,
    payload: askPayload,
    requestId,
    supabase: ledger,
    userId: userA,
  }), hasCause("simulated completion response loss"));
  assert.equal(ledger.event(userA, "ask", requestId).status, "completed");
  assert.equal(ledger.calls.filter((call) => call.name === "release_ai_credit").length, 0);
});

test("feature, payload, and user are independent request-identity dimensions", async () => {
  const ledger = new AuthoritativeLedger();
  await reserve(ledger);
  await complete(ledger);

  const vetPayload = { petId: askPayload.petId, reasonForVisit: "checkup" };
  const vetHash = hashAiCreditPayload("vet_brief", vetPayload);
  const vetReservation = await reserveAiCredit({ feature: "vet_brief", ledgerClient: ledger, payloadHash: vetHash, requestId, userId: userA });
  assert.equal(vetReservation.status, "reserved", "the same UUID in another feature must create a charged operation");
  await completeAiCredit({ feature: "vet_brief", ledgerClient: ledger, payloadHash: vetHash, requestId, userId: userA });
  assert.equal(ledger.event(userA, "vet_brief", requestId).credits, 1);

  await assert.rejects(reserveAiCredit({
    feature: "ask",
    ledgerClient: ledger,
    payloadHash: hashAiCreditPayload("ask", { ...askPayload, question: "Different payload" }),
    requestId,
    userId: userA,
  }), hasCause("AI_REQUEST_IDENTITY_CONFLICT"));

  const otherUser = await reserveAiCredit({ feature: "ask", ledgerClient: ledger, payloadHash: askHash, requestId, userId: userB });
  assert.equal(otherUser.status, "reserved");
  assert.equal(ledger.event(userA, "ask", requestId).status, "completed");
  assert.equal(ledger.event(userB, "ask", requestId).status, "reserved");
});

test("migration removes client release authority and enforces database identity/state invariants", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const settlementSql = readFileSync(settlementMigrationPath, "utf8");
  const admin = readFileSync("app/lib/ai/usage-ledger-admin.ts", "utf8");
  const ledger = readFileSync("app/lib/ai/usage-ledger.ts", "utf8");
  const clientFiles = readFileSync("app/ask/page.tsx", "utf8");
  const askRoute = readFileSync("app/api/ask/route.ts", "utf8");
  assert.match(sql, /drop function public\.release_ai_credit\(uuid, integer\)/);
  assert.match(sql, /revoke all on function public\.release_ai_credit\(uuid, uuid, text, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.release_ai_credit\(uuid, uuid, text, text\) to service_role/);
  assert.match(sql, /old\.status = 'completed' and new\.status <> 'completed'/);
  assert.match(sql, /old\.status = 'released' and new\.status <> 'released'/);
  assert.match(sql, /ai_usage_events_user_feature_request_unique/);
  assert.match(sql, /case when p_feature = 'ask' then 'ask' else 'shared_non_ask' end/);
  assert.match(sql, /usage_event\.feature = p_feature[\s\S]*usage_event\.request_id = p_request_id/);
  assert.match(sql, /v_existing\.payload_hash <> p_payload_hash/);
  assert.match(admin, /import "server-only"/);
  assert.match(admin, /SUPABASE_SECRET_KEY \|\| process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(clientFiles, /release_ai_credit|releaseAiCredit/);
  assert.doesNotMatch(ledger, /auth\.uid\(\)/);
  assert.match(settlementSql, /settlement_disposition in \('complete', 'release'\)/);
  assert.match(settlementSql, /AI_CREDIT_DISPOSITION_IMMUTABLE/);
  assert.match(settlementSql, /status = 'completed'[\s\S]*settlement_disposition = 'complete'/);
  assert.match(settlementSql, /status = 'released'[\s\S]*settlement_disposition = 'release'/);
  assert.match(settlementSql, /settlement_disposition is not null[\s\S]*for update skip locked/);
  assert.match(settlementSql, /ai_credit_missing_disposition/);
  const claim = askRoute.indexOf("idempotency = await claimIdempotentOperation");
  const replay = askRoute.indexOf("completed response replayed after canonical identity validation");
  assert.ok(claim >= 0 && replay > claim, "persisted answers replay only after canonical payload claim");
  assert.doesNotMatch(askRoute.slice(askRoute.indexOf('logAskStage("assistant message persisted"'), askRoute.indexOf("async function persistPendingSuggestion")), /safeReleaseAiCredit/);
});

async function reserve(ledger) {
  return reserveAiCredit({ feature: "ask", ledgerClient: ledger, payloadHash: askHash, requestId, userId: userA });
}

async function complete(ledger) {
  return completeAiCredit({ feature: "ask", ledgerClient: ledger, payloadHash: askHash, requestId, userId: userA });
}

async function release(ledger) {
  return releaseAiCredit({ feature: "ask", ledgerClient: ledger, payloadHash: askHash, requestId, userId: userA });
}

class AuthoritativeLedger {
  constructor({ failCompletedResponses = 0, failDispositionResponses = 0, failReconciliationResponses = 0 } = {}) {
    this.calls = [];
    this.events = new Map();
    this.failCompletedResponses = failCompletedResponses;
    this.failDispositionResponses = failDispositionResponses;
    this.failReconciliationResponses = failReconciliationResponses;
  }

  event(userId, feature, operationId) {
    return this.events.get(`${userId}:${feature}:${operationId}`);
  }

  async rpc(name, args) {
    this.calls.push({ args, name });
    if (name === "get_my_ask_allowance_status") {
      const used = [...this.events.values()].filter((event) => event.feature === "ask" && event.status === "completed").length;
      return { data: [{ allowance: 15, billing_plan: "free", cancel_at_period_end: false, effective_plan: "free", period_end: "2026-09-01T00:00:00Z", period_start: "2026-08-01", remaining: 15 - used, subscription_status: "none", used }], error: null };
    }
    const key = `${args.p_user_id}:${args.p_feature}:${args.p_request_id}`;
    let event = this.events.get(key);
    if (name === "reserve_ai_credit") {
      if (event && (event.payloadHash !== args.p_payload_hash || event.logicalRequestId !== args.p_logical_request_id)) return failure("AI_REQUEST_IDENTITY_CONFLICT");
      if (!event) {
        event = { credits: 1, disposition: null, feature: args.p_feature, logicalRequestId: args.p_logical_request_id, payloadHash: args.p_payload_hash, status: "reserved" };
        this.events.set(key, event);
      }
      return success("reservation_status", event);
    }
    if (!event) return failure("AI_RESERVATION_NOT_FOUND");
    if (event.payloadHash !== args.p_payload_hash || event.logicalRequestId !== args.p_logical_request_id) return failure("AI_REQUEST_IDENTITY_CONFLICT");
    if (name === "set_ai_credit_disposition") {
      if (this.failDispositionResponses > 0) {
        this.failDispositionResponses -= 1;
        return failure("simulated disposition persistence failure");
      }
      if (event.disposition && event.disposition !== args.p_disposition) return failure("AI_CREDIT_DISPOSITION_CONFLICT");
      event.disposition = args.p_disposition;
      return success("event_status", event);
    }
    if (name === "complete_ai_credit") {
      if (event.disposition !== "complete") return failure("AI_CREDIT_DISPOSITION_CONFLICT");
      if (event.status === "released") return failure("AI_CREDIT_TERMINAL_CONFLICT");
      event.status = "completed";
      event.credits = 1;
      if (this.failCompletedResponses > 0) {
        this.failCompletedResponses -= 1;
        return failure("simulated completion response loss");
      }
      return success("event_status", event);
    }
    if (name === "release_ai_credit") {
      if (event.disposition !== "release") return failure("AI_CREDIT_DISPOSITION_CONFLICT");
      if (event.status === "completed") return failure("AI_CREDIT_TERMINAL_CONFLICT");
      event.status = "released";
      event.credits = 0;
      return success("event_status", event);
    }
    if (name === "reconcile_ai_credit") {
      if (!event.disposition) return failure("AI_CREDIT_DISPOSITION_REQUIRED");
      if (this.failReconciliationResponses > 0) {
        this.failReconciliationResponses -= 1;
        return failure("simulated reconciliation failure");
      }
      event.status = event.disposition === "complete" ? "completed" : "released";
      event.credits = event.disposition === "complete" ? 1 : 0;
      return success("event_status", event);
    }
    return failure("unexpected RPC");
  }
}

function success(statusKey, event) {
  return { data: [{ credits_used: event.credits, remaining: 14, settlement_disposition: event.disposition, [statusKey]: event.status }], error: null };
}

function failure(message) {
  return { data: null, error: { code: "TEST", message } };
}

function hasCause(message) {
  return (error) => error?.cause?.message === message;
}
