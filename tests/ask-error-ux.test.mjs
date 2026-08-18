import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getAskErrorPresentation, requiresFreshAskRequestId } from "../app/lib/ask-client-errors.ts";

test("daily platform protection is an expected limit with usable saved-data navigation", () => {
  const state = getAskErrorPresentation("AI_DAILY_CAP_REACHED");
  assert.equal(state.title, "You've reached today's AI limit");
  assert.match(state.message, /pet profiles, history, and saved information are still available/i);
  assert.equal(state.retryable, false);
  assert.equal(state.recommendedAction, "saved_data");
  assert.doesNotMatch(`${state.title} ${state.message}`, /couldn't answer/i);
});

test("temporary provider failures retain a safe canonical retry", () => {
  for (const code of ["AI_TEMPORARILY_UNAVAILABLE", "AI_UNAVAILABLE", "AI_FEATURE_UNAVAILABLE"]) {
    const state = getAskErrorPresentation(code);
    assert.equal(state.title, "Furvise is temporarily unavailable");
    assert.equal(state.message, "Your question has been saved. Try again in a moment.");
    assert.equal(state.retryable, true);
    assert.equal(state.recommendedAction, "retry");
  }
});

test("an in-progress request tells the user to wait and never recommends duplicate submission", () => {
  for (const code of ["REQUEST_IN_PROGRESS", "AI_REQUEST_ALREADY_ACTIVE"]) {
    const state = getAskErrorPresentation(code, 3);
    assert.equal(state.title, "Furvise is still working on this question");
    assert.equal(state.retryable, false);
    assert.equal(state.recommendedAction, "wait");
  }
});

test("rate limiting and plan credits remain distinct product states", () => {
  const rate = getAskErrorPresentation("RATE_LIMITED", 12);
  assert.equal(rate.title, "You're sending questions a little too quickly");
  assert.match(rate.message, /12 seconds/);
  assert.equal(rate.retryable, true);

  const credits = getAskErrorPresentation("AI_CREDITS_EXHAUSTED");
  assert.equal(credits.title, "You've reached your Ask plan limit");
  assert.equal(credits.retryable, false);
  assert.doesNotMatch(credits.message, /daily AI limit/i);
});

test("permanent validation errors request editing and unknown failures keep a safe fallback", () => {
  assert.equal(getAskErrorPresentation("INVALID_MESSAGE").recommendedAction, "edit");
  const unknown = getAskErrorPresentation("UNKNOWN_ERROR");
  assert.equal(unknown.title, "Furvise couldn't answer just now");
  assert.equal(unknown.retryable, true);
  assert.doesNotMatch(unknown.message, /edit|rewrite/i);
});

test("Edit this question is exclusive to the current malformed-message contract", () => {
  for (const code of [
    "AI_OPERATION_CONFLICT", "IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_INVALID",
    "AI_UNAVAILABLE", "AI_RATE_LIMITED", "AI_CREDITS_EXHAUSTED", "DATABASE_ERROR", "UNKNOWN_ERROR",
  ]) {
    const state = getAskErrorPresentation(code);
    assert.notEqual(state.title, "Edit this question", code);
    assert.notEqual(state.recommendedAction, "edit", code);
  }
  assert.equal(requiresFreshAskRequestId("IDEMPOTENCY_CONFLICT"), true);
  assert.equal(requiresFreshAskRequestId("IDEMPOTENCY_KEY_INVALID"), true);
  assert.equal(requiresFreshAskRequestId("AI_UNAVAILABLE"), false);
});

test("Ask API preserves public admission codes and distinguishes plan credits", async () => {
  const [route, admission] = await Promise.all([
    readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/ai/usage-guard/errors.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admission, /AI_DAILY_CAP_REACHED/);
  assert.match(admission, /AI_TEMPORARILY_UNAVAILABLE/);
  assert.match(route, /askFailure\("AI_CREDITS_EXHAUSTED"/);
  assert.match(route, /askFailure\("IDEMPOTENCY_CONFLICT"[\s\S]*different question/);
});
