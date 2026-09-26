import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const { normalizeFurviseAuthoredText, containsFurviseImplementationTrace } = await import("../app/lib/ask-mouth.ts");

test("Furvise-authored prose contains no em dashes", () => {
  const parsed = normalizeFurviseAuthoredText("Aster is stable — keep watching appetite.");
  assert.doesNotMatch(parsed, /—/);
  assert.match(parsed, /stable, keep watching/);
});

test("literal quoted owner wording is preserved while surrounding Furvise prose is normalized", () => {
  const parsed = normalizeFurviseAuthoredText('Saved wording — "owner wrote — exactly this".');
  assert.doesNotMatch(parsed.replace('"owner wrote — exactly this"', ""), /—/);
  assert.match(parsed, /"owner wrote — exactly this"/);
});

test("implementation traces cannot cross the Mouth boundary", () => {
  for (const text of [
    "The AI could not answer that.",
    "The provider call failed.",
    "The model response was incomplete.",
    "The token budget was exceeded.",
    "The semantic contract was rejected.",
    "The system prompt says otherwise.",
  ]) {
    assert.equal(containsFurviseImplementationTrace(text), true, text);
  }
});

test("quoted owner text does not become an implementation leak", () => {
  const quoted = 'You wrote "AI can be useful".';
  assert.equal(containsFurviseImplementationTrace(quoted), false);
  assert.equal(normalizeFurviseAuthoredText(quoted), quoted);
});

test("Ask footer names Furvise, not AI", () => {
  const notice = readFileSync(new URL("../app/components/beta-feedback-notice.tsx", import.meta.url), "utf8");
  assert.match(notice, /Furvise can make mistakes/);
  assert.doesNotMatch(notice, /AI can make mistakes/);
});

test("action receipts cross the Mouth boundary too", async () => {
  const { buildAskConversationResponse } = await import("../app/lib/ask.mjs");
  const response = buildAskConversationResponse(
    { title: "Furvise", summary: "Done — saved.", sections: [], safetyNote: null },
    { intent: "status_update", missingUsefulDetails: [], usedContextSummary: [], applicationActions: [{
      id: "action:1", kind: "care_history.add", petId: "pet", sourceMessageId: "source",
      safetyClass: "LOW_RISK_REVERSIBLE", mutationClass: "mutation", confirmationPolicy: "explicit_intent",
      authorizationScope: "owned_pet", explicitIntent: true, status: "succeeded",
      input: { field: null, value: null, title: "Owner note", detail: null, category: "general", target: "specified" },
      evidence: "saved", label: "Saved — care history", description: "The update — is saved.",
      href: null, resultMessage: "Saved — successfully.", errorMessage: null,
    }] },
  );
  assert.ok(response);
  assert.doesNotMatch(response.summary, /—/);
  assert.doesNotMatch(response.applicationActions[0].label, /—/);
  assert.doesNotMatch(response.applicationActions[0].description, /—/);
  assert.doesNotMatch(response.applicationActions[0].resultMessage, /—/);

  const blocked = buildAskConversationResponse(
    { title: "Furvise", summary: "Done.", sections: [], safetyNote: null },
    { intent: "status_update", missingUsefulDetails: [], usedContextSummary: [], applicationActions: [{
      id: "action:2", kind: "care_history.add", petId: "pet", sourceMessageId: "source",
      safetyClass: "LOW_RISK_REVERSIBLE", mutationClass: "mutation", confirmationPolicy: "explicit_intent",
      authorizationScope: "owned_pet", explicitIntent: true, status: "failed",
      input: { field: null, value: null, title: "Owner note", detail: null, category: "general", target: "specified" },
      evidence: "saved", label: "Save", description: "The provider call failed.",
      href: null, resultMessage: null, errorMessage: "The model response failed.",
    }] },
  );
  assert.ok(blocked);
  assert.deepEqual(blocked.applicationActions || [], []);
});
