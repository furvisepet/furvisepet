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
  assert.match(getAskErrorPresentation("TEMPORARY_DATABASE_FAILURE").title, /cleanly/i);
  assert.equal(getAskErrorPresentation("REQUEST_IN_PROGRESS").recommendedAction, "wait");
});

test("an active answer never presents the remaining lease as a mandatory cooldown", () => {
  const presentation = getAskErrorPresentation(publicAskFailureCode("answer_already_active"), 82);
  assert.equal(presentation.retryable, true);
  assert.equal(presentation.recommendedAction, "retry");
  assert.equal(presentation.retryAfterSeconds, undefined);
  assert.doesNotMatch(presentation.message + presentation.title, /82|too quickly|seconds/);
  assert.match(presentation.message, /question is kept/);
  assert.equal(getAskErrorPresentation("RATE_LIMIT", 82).retryAfterSeconds, 82);
});

 test("daily service cap does not invite retry, editing, or a plan upgrade", () => {
  const code = publicAskFailureCode("service_daily_limit");
  assert.equal(code, "SERVICE_DAILY_LIMIT");
  const presentation = getAskErrorPresentation(code);
  assert.equal(presentation.retryable, false);
  assert.equal(presentation.recommendedAction, "saved_data");
  assert.match(presentation.message, /(?:today.*limit|service limit).*daily reset/i);
  assert.match(presentation.message, /saved pet information and care history are still available/i);
  assert.doesNotMatch(presentation.message, /try again|upgrade|your.*plan limit/i);
  assert.equal(getAskErrorPresentation("TEMPORARY_PROVIDER_FAILURE").retryable, true);
});


test("identity conflicts preserve the question through edit instead of repeating the same failed retry", () => {
  const state = getAskErrorPresentation(publicAskFailureCode("request_identity_changed"));
  assert.equal(state.retryable, false);
  assert.equal(state.recommendedAction, "edit");
  assert.match(state.message, /text is still here/);
});

test("retryable failures give a human recovery path", () => {
  for (const code of ["TEMPORARY_PROVIDER_FAILURE","TEMPORARY_DATABASE_FAILURE","ANSWER_RETRYABLE"]) {
    const state=getAskErrorPresentation(code);
    assert.match(state.message,/question is still here/i);
    assert.match(state.message,/screenshot/i);
    assert.match(state.message,/Contact Us/i);
  }
});

test("a started or exhausted read-only turn requires explicit review instead of a futile retry",()=>{
 const code=publicAskFailureCode("answer_not_completed");
 assert.equal(code,"ANSWER_NOT_COMPLETED");
 const state=getAskErrorPresentation(code);
 assert.equal(state.retryable,false);assert.equal(state.recommendedAction,"edit");
 assert.match(state.message,/question is saved/);assert.match(state.message,/Review your question before sending a new one/);
 assert.doesNotMatch(state.message,/credit|charged|budget|provider|Try again/i);
});
