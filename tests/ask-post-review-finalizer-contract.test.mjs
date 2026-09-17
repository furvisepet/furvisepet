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
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
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
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
  const completed = finalizer.indexOf('turnLifecycle.transition("COMPLETED")');
  const durable = finalizer.indexOf("finalizePersistedAskAnswer({");
  const publish = finalizer.indexOf("buildSuccessfulAskResponse({");
  assert.ok(completed >= 0 && durable > completed && publish > durable);
});

test("lost finalization acknowledgement refreshes durable state then replays without rerunning effects", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
  assert.match(finalizer, /if \(durableFallback\) return completedResponseFromPersisted/);
  const durable = finalizer.indexOf("finalizePersistedAskAnswer({");
  const freshness = finalizer.indexOf("revalidateAskStateViews(", durable);
  const readback = finalizer.indexOf("if (durableFallback)");
  assert.ok(durable >= 0 && freshness > durable && readback > freshness);
  assert.doesNotMatch(finalizer.slice(readback), /executeActionCapability\(|persistIntelligenceLearnings\(/);
});
