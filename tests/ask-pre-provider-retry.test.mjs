import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { deriveAiGuardOperationId } from "../app/lib/ai/usage-guard/operation-identity.ts";

const requestId = "69b6a0a6-01e0-466c-8b3a-9552c0fa256f";
const userId = "bd23dda6-b423-443a-9081-89b47955ca39";
const secret = "usage-guard-test-secret-at-least-32-characters";

function reservation(operationId, index) {
  return {
    callId: `${operationId}:${index}`, callLimit: 100, costLimitMicrodollars: 100_000, day: "2026-08-13",
    feature: "ask", maximumOperationCalls: 3, operationCallTtlSeconds: 90 * 24 * 60 * 60, operationId, reservedCostMicrodollars: 100, ttlSeconds: 3_600,
  };
}

test("initial and shared retry phases cap one canonical Ask request at six provider calls", async () => {
  const store = new MemoryAiGuardTestStore();
  const initialId = deriveAiGuardOperationId({ executionPhase: "initial", requestId, secret, userId });
  const firstRetryId = deriveAiGuardOperationId({ executionPhase: "retry", requestId, secret, userId });
  const laterRetryId = deriveAiGuardOperationId({ executionPhase: "retry", requestId, secret, userId });
  assert.notEqual(firstRetryId, initialId);
  assert.equal(laterRetryId, firstRetryId, "all retry leases must share one guard identity");
  for (let index = 1; index <= 3; index += 1) {
    const input = reservation(initialId, index);
    assert.equal((await store.reserveCall(input)).allowed, true);
    await store.markCallStarted({ callId: input.callId });
    await store.reconcileCall({ actualCostMicrodollars: 50, callId: input.callId });
  }
  const exhaustedInitial = await store.reserveCall(reservation(initialId, 4));
  assert.deepEqual({ allowed: exhaustedInitial.allowed, reason: exhaustedInitial.reason }, { allowed: false, reason: "operation_call_limit" });

  for (let index = 1; index <= 3; index += 1) {
    const input = reservation(firstRetryId, index);
    assert.equal((await store.reserveCall(input)).allowed, true, `retry call ${index} must be available`);
    await store.markCallStarted({ callId: input.callId });
    await store.reconcileCall({ actualCostMicrodollars: 50, callId: input.callId });
  }
  const exhaustedSharedRetry = await store.reserveCall(reservation(laterRetryId, 4));
  assert.deepEqual({ allowed: exhaustedSharedRetry.allowed, reason: exhaustedSharedRetry.reason }, { allowed: false, reason: "operation_call_limit" });
  assert.equal(store.getSnapshot("2026-08-13").calls, 6, "daily accounting remains cumulative across both phases");
});

test("daily limits remain fail-closed independently of the two phase budgets", async () => {
  const store = new MemoryAiGuardTestStore();
  const initialId = deriveAiGuardOperationId({ executionPhase: "initial", requestId, secret, userId });
  assert.equal((await store.reserveCall({ ...reservation(initialId, 1), callLimit: 1 })).allowed, true);
  const otherRequestId = deriveAiGuardOperationId({ executionPhase: "initial", requestId: "79b6a0a6-01e0-466c-8b3a-9552c0fa256f", secret, userId });
  const denied = await store.reserveCall({ ...reservation(otherRequestId, 1), callLimit: 1 });
  assert.deepEqual({ allowed: denied.allowed, reason: denied.reason }, { allowed: false, reason: "daily_call_limit" });
});

test("Ask keeps canonical dedupe, persistence, credit, and rate-limit identity stable across retry", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  const idempotencySql = readFileSync(new URL("../supabase/migrations/20260730010000_add_canonical_idempotency_operations.sql", import.meta.url), "utf8");
  const messageSql = readFileSync(new URL("../supabase/migrations/20260727010000_add_ask_request_idempotency.sql", import.meta.url), "utf8");
  assert.match(route, /executionPhase: idempotency\.operation\.claimOutcome === "new" \? "initial" : "retry"/);
  assert.match(route, /operationTtlSeconds: askGuardOperationTtlSeconds/);
  assert.doesNotMatch(route, /execution(?:AttemptId|Phase): idempotency\.operation\.ownerToken/);
  assert.match(route, /idempotencyState: idempotency\.operation\.claimOutcome/);
  for (const reason of ["IDEMPOTENCY_FAILED_STATE_REPLAY", "CREDIT_RESERVATION_FAILED", "AI_ADMISSION_DENIED", "PROVIDER_CONFIG_UNAVAILABLE", "PRE_PROVIDER_VALIDATION_FAILED", "UNKNOWN_PRE_PROVIDER_FAILURE"]) {
    assert.match(route, new RegExp(reason));
  }
  assert.match(route, /providerCallAttempted: false/);
  assert.match(route, /creditReservationDisposition/);
  assert.doesNotMatch(route, /pre-provider 503[\s\S]{0,1000}ownerToken/);
  assert.match(route, /reserveAiCredit\(\{ feature: "ask", requestId, supabase \}\)/);
  assert.match(route, /request_id: requestId/);
  assert.match(route, /loadPersistedRequest\(\{ petId, requestId, supabase, userId \}\)/);
  assert.match(route, /idempotencyKey: requestId[\s\S]*policy: "ASK_AI"/);
  assert.match(client, /const requestId = retry\?\.requestId \|\| getOrCreateClientMutationKey/);
  assert.match(client, /if \(!retry\) setThread/);
  assert.match(idempotencySql, /status = case when p_retryable then 'failed_retryable'/);
  assert.match(messageSql, /unique index[\s\S]*\(user_id, request_id, role\)/);
});

test("permanent admission and budget denials remain fail-closed", () => {
  const admission = readFileSync(new URL("../app/lib/ai/usage-guard/admission.ts", import.meta.url), "utf8");
  for (const reason of ["global_disabled", "daily_guard_not_configured", "unknown_model_pricing", "guard_store_unavailable", "emergency_disabled", "operation_payload_conflict", "daily_guard_store_unavailable"]) {
    assert.match(admission, new RegExp(reason));
  }
  assert.match(admission, /throw new AiAdmissionError\("AI_PROVIDER_BUDGET_EXHAUSTED", result\.reason\)/);
});

test("successful retry persistence, completed replay, and concurrent duplicates remain idempotent", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const operation = readFileSync(new URL("../app/lib/security/idempotency/operation.ts", import.meta.url), "utf8");
  const completed = operation.indexOf('claim.claim_outcome === "completed"');
  const inProgress = operation.indexOf('claim.claim_outcome === "in_progress"');
  const ownerRequired = operation.indexOf("if (!claim.owner_token)");
  const callback = operation.indexOf("response = await callback()");
  assert.ok(completed >= 0 && completed < callback);
  assert.ok(inProgress >= 0 && inProgress < callback);
  assert.ok(ownerRequired >= 0 && ownerRequired < callback);
  assert.match(route, /existingRequest\?\.assistantMessage\?\.response_data[\s\S]*completedResponseFromPersisted/);
  assert.match(route, /ask_conversation_messages[\s\S]*request_id: requestId/);
  assert.match(route, /persistAskV2Phase3LowRisk\([\s\S]*requestId/);
});
