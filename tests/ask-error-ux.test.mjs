import assert from "node:assert/strict";
import test from "node:test";
import { getAskErrorPresentation, publicAskFailureCode } from "../app/lib/furvise-output.ts";

test("public failures have one truthful canonical taxonomy", () => {
  assert.equal(publicAskFailureCode("provider_failure"), "TEMPORARY_PROVIDER_FAILURE");
  assert.equal(publicAskFailureCode("database_failure"), "TEMPORARY_DATABASE_FAILURE");
  assert.equal(publicAskFailureCode("invalid_input"), "INVALID_CURRENT_INPUT");
  assert.equal(publicAskFailureCode("clarification_required"), "CLARIFICATION_REQUIRED");
});

test("only malformed current input recommends editing", () => {
  assert.equal(getAskErrorPresentation("INVALID_CURRENT_INPUT").recommendedAction, "edit");
  for (const code of ["TEMPORARY_PROVIDER_FAILURE", "TEMPORARY_DATABASE_FAILURE", "PLAN_LIMIT", "RATE_LIMIT", "ANSWER_RETRYABLE"]) {
    assert.notEqual(getAskErrorPresentation(code).recommendedAction, "edit", code);
  }
});

test("rate, plan, provider, database, and in-progress states remain distinct", () => {
  assert.match(getAskErrorPresentation("RATE_LIMIT", 12).message, /12 seconds/);
  assert.equal(getAskErrorPresentation("PLAN_LIMIT").retryable, false);
  assert.equal(getAskErrorPresentation("TEMPORARY_PROVIDER_FAILURE").retryable, true);
  assert.match(getAskErrorPresentation("TEMPORARY_DATABASE_FAILURE").title, /finish/i);
  assert.equal(getAskErrorPresentation("REQUEST_IN_PROGRESS").recommendedAction, "wait");
});

 test("daily service cap does not invite retry, editing, or a plan upgrade", () => {
  const code = publicAskFailureCode("service_daily_limit");
  assert.equal(code, "SERVICE_DAILY_LIMIT");
  const presentation = getAskErrorPresentation(code);
  assert.equal(presentation.retryable, false);
  assert.equal(presentation.recommendedAction, "saved_data");
  assert.match(presentation.message, /daily.*limit.*reset/i);
  assert.match(presentation.message, /saved pet information and history remain available/i);
  assert.doesNotMatch(presentation.message, /try again|upgrade|your.*plan limit/i);
  assert.equal(getAskErrorPresentation("TEMPORARY_PROVIDER_FAILURE").retryable, true);
});
