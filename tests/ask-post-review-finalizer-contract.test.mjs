import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");

function functionSlice(name, nextName) {
  const start = route.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  const end = nextName ? route.indexOf(nextName, start) : route.length;
  assert.ok(end > start, `${name} has an end boundary`);
  return route.slice(start, end);
}

test("post-review Ask finalization has one ordered effect pipeline", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "async function safeReleaseAiCredit");
  const stages = [
    "completeAskConversationTurn({",
    "createActionCapabilities({",
    "persistIntelligenceLearnings({",
    "executeActionCapability({",
    "resolveAutomaticCareHistoryPresentation({",
    "assessTaskExecution({",
    "setAiCreditDisposition({",
    "finalizePersistedAskAnswer({",
    "buildSuccessfulAskResponse({",
  ];
  let previous = -1;
  for (const stage of stages) {
    const index = finalizer.indexOf(stage);
    assert.ok(index > previous, `${stage} follows the previous finalization stage`);
    previous = index;
  }
});

test("post-review publication happens only after the turn reaches COMPLETED", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "async function safeReleaseAiCredit");
  const completed = finalizer.indexOf('turnLifecycle.transition("COMPLETED")');
  const durable = finalizer.indexOf("finalizePersistedAskAnswer({");
  const publish = finalizer.indexOf("buildSuccessfulAskResponse({");
  assert.ok(completed >= 0 && durable > completed && publish > durable);
});

test("lost finalization acknowledgement replays durable state instead of rerunning effects", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "async function safeReleaseAiCredit");
  assert.match(finalizer, /if \(durableFallback\) return completedResponseFromPersisted/);
  const readback = finalizer.indexOf("if (durableFallback)");
  assert.ok(readback > finalizer.indexOf("finalizePersistedAskAnswer({"));
  assert.doesNotMatch(finalizer.slice(readback), /executeActionCapability\(|persistIntelligenceLearnings\(/);
});
