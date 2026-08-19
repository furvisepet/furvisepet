import assert from "node:assert/strict";
import test from "node:test";
import { AskTurnLifecycle, ASK_SUBSYSTEM_CRITICALITY, deriveAskAttemptId, runOptionalAskSubsystem } from "../app/lib/ai/ask-turn-model.ts";

const logical = "10000000-0000-4000-8000-000000000001";

test("canonical Ask state transitions are monotonic and completed is terminal", () => {
  const turn = new AskTurnLifecycle(logical, deriveAskAttemptId(logical, "attempt"));
  for (const stage of ["VALIDATED", "ROUTED", "CONTEXT_READY", "AI_ADMITTED", "GENERATING", "ANSWER_VALIDATED", "ANSWER_PERSISTED", "COMPLETED"]) turn.transition(stage);
  assert.equal(turn.snapshot().finalStage, "COMPLETED");
  assert.throws(() => turn.fail("late_failure", true), /COMPLETED_CANNOT_FAIL/);
  assert.throws(() => turn.transition("ANSWER_PERSISTED"), /TERMINAL/);
});

test("a retry changes attempt identity without changing logical identity", () => {
  const first = new AskTurnLifecycle(logical, deriveAskAttemptId(logical, "one")).snapshot();
  const retry = new AskTurnLifecycle(logical, deriveAskAttemptId(logical, "two")).snapshot();
  assert.equal(first.logicalTurnId, retry.logicalTurnId);
  assert.notEqual(first.attemptId, retry.attemptId);
});

test("optional boundaries degrade and critical boundaries cannot be mislabeled optional", async () => {
  const fallback = await runOptionalAskSubsystem({ component: "context_memory", fallback: [], operation: async () => { throw new Error("down"); } });
  assert.deepEqual(fallback, []);
  await assert.rejects(() => runOptionalAskSubsystem({ component: "assistant_persistence", fallback: null, operation: async () => null }), /OPTIONAL_BOUNDARY/);
  assert.equal(ASK_SUBSYSTEM_CRITICALITY.assistant_persistence, "ANSWER_CRITICAL");
  assert.equal(ASK_SUBSYSTEM_CRITICALITY.credit_disposition, "ANSWER_CRITICAL");
  assert.equal(ASK_SUBSYSTEM_CRITICALITY.credit_completion, "OPTIONAL");
  assert.equal(ASK_SUBSYSTEM_CRITICALITY.credit_release, "OPTIONAL");
  assert.equal(ASK_SUBSYSTEM_CRITICALITY.memory_persistence, "OPTIONAL");
});

test("privacy-safe trace contains metadata but no message or model output field", () => {
  const trace = new AskTurnLifecycle(logical, deriveAskAttemptId(logical, "safe")).route("pet_care", "ai").subject("recent_chain", 1).snapshot();
  assert.equal("message" in trace, false);
  assert.equal("rawOutput" in trace, false);
  assert.equal(trace.subjectCandidateCount, 1);
  assert.equal(trace.creditDisposition, "missing");
  assert.equal(trace.settlementState, "not_required");
});
