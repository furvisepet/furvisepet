import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveAskAttemptId } from "../app/lib/ai/ask-turn-model.ts";

const logicalTurnId = "69b6a0a6-01e0-466c-8b3a-9552c0fa256f";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a retry keeps logical identity and receives a distinct safe attempt identity", () => {
  const first = deriveAskAttemptId(logicalTurnId, "lease-one");
  const second = deriveAskAttemptId(logicalTurnId, "lease-two");
  assert.notEqual(first, logicalTurnId);
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f-]{36}$/);
});

test("Ask admits at most two provider calls per attempt", () => {
  assert.match(read("app/lib/ai/usage-guard/features.ts"), /ask: policy\([^\n]+, 2\)/);
});

test("logical turn, attempt, persisted message, and financial identities are explicit", () => {
  const route = read("app/api/ask/route.ts");
  assert.match(route, /const logicalTurnId =/);
  assert.match(route, /const attemptId = deriveAskAttemptId\(logicalTurnId, idempotency\.operation\.ownerToken\)/);
  assert.match(route, /candidateKey: requestId/);
  assert.match(route, /request_id: requestId/);
  assert.match(route, /requestId: creditRequestId/);
  assert.match(route, /requestId: attemptId/);
});

test("persisted answer replay only degrades terminal execution after durable identity and disposition validation", () => {
  const route = read("app/api/ask/route.ts");
  assert.match(route, /optional_credit_reconciliation/);
  assert.match(route, /return usage;/);
  assert.match(route, /const states = await getAiCreditEventsForLogicalRequest/);
  assert.match(route, /states\.some\(\(state\) => state\.disposition === null\)/);
  assert.match(route, /if \(isAiCreditIntegrityError\(error\)\) throw error/);
  assert.match(route, /setAiCreditDisposition\([\s\S]*disposition: "complete"[\s\S]*completeAiCredit/);
});

test("AI admission closes only after durable answer persistence", () => {
  const route = read("app/api/ask/route.ts");
  const persist = route.indexOf("const persistedResponse = await persistAssistantAnswer");
  const complete = route.indexOf("finalizeAiAdmissionAfterPersistence", persist);
  assert.ok(persist >= 0 && complete > persist);
});
