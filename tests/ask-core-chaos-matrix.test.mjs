import assert from "node:assert/strict";
import test from "node:test";
import { ASK_FAILURE_INJECTION_POINTS, assertAskCriticalityRegistry, runAskFailureInjection } from "../app/lib/ai/ask-reliability-harness.ts";

test("failure injection covers every named Ask subsystem seam", () => {
  assert.equal(ASK_FAILURE_INJECTION_POINTS.length, 20);
  assert.equal(assertAskCriticalityRegistry(), true);
});

test("optional subsystem failures never destroy a valid answer", () => {
  for (const point of ["optional_context_query", "subject_extraction", "invalid_auxiliary_field", "quality_normalization", "credit_completion", "history_proposal", "history_persistence", "memory_persistence", "semantic_persistence", "application_action_preparation", "suggestion_generation"]) {
    const result = runAskFailureInjection(point);
    assert.equal(result.success, true, point);
    assert.equal(result.userMessageCount, 1, point);
    assert.equal(result.assistantMessageCount, 1, point);
    assert.equal(result.finalStage, "COMPLETED", point);
    if (point === "quality_normalization") {
      assert.equal(result.providerCallCount, 1);
      assert.equal(result.creditState, "completed");
    }
  }
});

test("critical failures preserve persistence and credit invariants", () => {
  for (const point of ["critical_ownership_query", "provider_timeout", "provider_400", "malformed_provider_json", "repair_timeout", "credit_reservation", "credit_release", "assistant_persistence"]) {
    const result = runAskFailureInjection(point);
    assert.equal(result.success, false, point);
    assert.equal(result.userMessageCount, 1, point);
    assert.equal(result.assistantMessageCount, 0, point);
    assert.match(result.finalStage, /^FAILED_/, point);
    assert.notEqual(result.creditState, "completed", point);
  }
});

test("durable settlement intent is critical while terminal execution may retry", () => {
  const disposition = runAskFailureInjection("credit_disposition");
  assert.equal(disposition.success, false);
  assert.equal(disposition.assistantMessageCount, 1);
  assert.equal(disposition.creditState, "reserved");

  const completion = runAskFailureInjection("credit_completion");
  assert.equal(completion.success, true);
  assert.equal(completion.creditState, "completion_pending");
});
