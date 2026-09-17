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

test("reviewed Ask effects remain ordered before the Brain tail handoff", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
  const delegate = finalizer.indexOf("return finalizeAskPostReview({");
  assert.ok(delegate > 0);
  const prepared = finalizer.slice(0, delegate);
  const stages = [
    "completeAskConversationTurn({",
    "createActionCapabilities({",
    "persistIntelligenceLearnings({",
    "executeActionCapability({",
    "resolveAutomaticCareHistoryPresentation({",
    "assessTaskExecution({",
  ];
  let previous = -1;
  for (const stage of stages) {
    const index = prepared.indexOf(stage);
    assert.ok(index > previous, `${stage} follows the previous reviewed effect`);
    previous = index;
  }
});

test("Brain executive control owns settlement through final publication", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
  assert.match(route, /from "\.\.\/\.\.\/lib\/furvise-brain\/post-review-finalizer\.ts"/);
  const delegateStart = finalizer.indexOf("return finalizeAskPostReview({");
  assert.ok(delegateStart > 0);
  assert.equal(finalizer.split("return finalizeAskPostReview({").length - 1, 1, "there is exactly one Brain terminal handoff");
  assert.doesNotMatch(finalizer.slice(0, delegateStart), /turnLifecycle\.transition\("COMPLETED"\)/, "route cannot complete before Brain handoff");
  assert.doesNotMatch(finalizer.slice(0, delegateStart), /buildSuccessfulAskResponse\(/, "route cannot publish success before Brain handoff");
  const delegate = finalizer.slice(delegateStart);
  const stages = [
    "persistReviewedAnswer:",
    "mintActionCapabilities:",
    "persistAuthorizedIntelligence:",
    "executeAuthorizedActions:",
    "resolveCarePresentation:",
    "assessTaskCompletion:",
    "settleCreditDisposition:",
    "finalizeDurableAnswer:",
    "invalidateCommittedState:",
    "publishSuccess:",
  ];
  let previous = -1;
  for (const stage of stages) {
    const index = delegate.indexOf(stage);
    assert.ok(index > previous, `${stage} follows the previous Brain stage`);
    previous = index;
  }
  assert.match(delegate, /settleCreditDisposition:[\s\S]*setAiCreditDisposition\(/);
  assert.match(delegate, /finalizeDurableAnswer:[\s\S]*finalizePersistedAskAnswer\(/);
  assert.match(delegate, /invalidateCommittedState:[\s\S]*revalidateAskStateViews\(/);
  assert.match(delegate, /publishSuccess:[\s\S]*buildSuccessfulAskResponse\(/);
});

test("durable replay is handed back to Brain before a second publication", () => {
  const finalizer = functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse");
  const delegate = finalizer.slice(finalizer.indexOf("return finalizeAskPostReview({"));
  const durable = delegate.indexOf("finalizeDurableAnswer:");
  const replay = delegate.indexOf('kind: "replay"', durable);
  const invalidate = delegate.indexOf("invalidateCommittedState:", replay);
  const publish = delegate.indexOf("publishSuccess:", invalidate);
  assert.ok(durable >= 0 && replay > durable && invalidate > replay && publish > invalidate);
  assert.match(delegate.slice(durable, invalidate), /completedResponseFromPersisted\(/);
});
