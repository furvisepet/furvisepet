import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAskConversationResponse, isDraftableSuggestedQuestion, normalizeSuggestedQuestion } from "../app/lib/ask.mjs";
import { getAskCareHistoryState } from "../app/lib/ask-care-history-state.ts";
import { buildSemanticEventReviewSuggestion } from "../app/lib/ai/concern-engine.ts";
import { semanticEventRpcArguments } from "../app/lib/intelligence/semantic-event-persistence.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const askRoute = read("app/api/ask/route.ts");
const askPage = read("app/ask/page.tsx");
const suggestionRoute = read("app/api/ask/suggestions/[id]/route.ts");

function semanticEvent(overrides = {}) {
  return {
    destination: "care_event",
    destinations: ["care_event", "episode_current_state"],
    event: {
      subject: { type: "pet", id: "380211f7-4b9a-4690-ad68-35b141ec14a6", name: "Mani" },
      domain: "health",
      topic: "limping",
      normalizedTopic: "limping",
      eventTitle: "Mani started limping",
      transition: "started",
      state: "active",
      temporal: { occurredAt: null, explicitTime: "right now" },
      importance: "important",
      confidence: 0.98,
      sourceExcerpt: "mani is limping rn",
      references: { priorEventIds: [], episodeId: null, concernId: null },
      ...overrides,
    },
  };
}

test("semantic persistence keeps the exact grounded excerpt while the review proposal is standalone", () => {
  const event = semanticEvent();
  const rpc = semanticEventRpcArguments({
    event,
    fallbackPetId: event.event.subject.id,
    sourceMessageId: "57ea6160-e6b8-4a2a-8424-64fa8d3faa36",
    userId: "e8f8c860-895b-4115-8000-000000000001",
  });
  assert.equal(rpc.p_event.sourceExcerpt, "mani is limping rn");
  assert.equal(rpc.p_event.eventTitle, "Mani started limping");

  const suggestion = buildSemanticEventReviewSuggestion({ event });
  assert.equal(suggestion.payload.semanticDomain, "health");
  assert.equal(suggestion.payload.semanticTopic, "limping");
  assert.equal(suggestion.payload.semanticTransition, "started");
  assert.match(suggestion.details, /^Owner reported that Mani is limping rn\.$/);
  assert.notEqual(suggestion.payload.title, suggestion.details);
  assert.doesNotMatch(suggestion.details, /^(?:and|but|so|then)\b/i);
});
test("Ask uses four truthful care-history states and never turns an auxiliary failure into answer failure", () => {
  assert.equal(getAskCareHistoryState({ carePersistence: { status: "skipped", careEntryIds: [] } }), "NO_HISTORY_VALUE");
  assert.equal(getAskCareHistoryState({ suggestion: { status: "pending" } }), "SUGGESTION_AVAILABLE");
  assert.equal(getAskCareHistoryState({ carePersistence: { status: "persisted", careEntryIds: ["entry"] } }), "SAVED");
  assert.equal(getAskCareHistoryState({ carePersistence: { status: "failed", careEntryIds: [] }, suggestion: { status: "pending" } }), "SAVE_FAILED");
  assert.match(askRoute, /historyReviewRequired \? \[\] : intelligenceResult\.acceptedSemanticEvents/);
  assert.match(askRoute, /automaticCareFailure[\s\S]*persistPendingSuggestion/);
  assert.match(askRoute, /HISTORY_SUGGESTION_PERSISTENCE_FAILED/);
  assert.match(askRoute, /return successfulAnswerResponse\(/);
  assert.doesNotMatch(askRoute.slice(askRoute.indexOf("const automaticCareFailure"), askRoute.indexOf("async function persistPendingSuggestion")), /return askFailure\(/);
});

test("a resolved semantic update reconciles the pending event instead of inserting a noisy duplicate", () => {
  const started = buildSemanticEventReviewSuggestion({ event: semanticEvent() });
  const resolved = buildSemanticEventReviewSuggestion({ event: semanticEvent({
    eventTitle: "Mani's limp resolved",
    transition: "resolved",
    state: "resolved",
    sourceExcerpt: "mani is normal now",
  }) });
  assert.equal(started.payload.semanticTopic, resolved.payload.semanticTopic);
  assert.equal(resolved.title, "Save this improvement");
  assert.match(askRoute, /\["improved", "resolved", "corrected"\]\.includes/);
  assert.match(askRoute, /\.contains\("payload", \{ semanticDomain, semanticTopic \}\)/);
  assert.match(askRoute, /\.update\(\{[\s\S]*source_message_id: assistantMessageId/);
  assert.match(askRoute, /return \{ effectAlreadyPresent: false, errorCode: null, suggestion: \{ \.\.\.suggestion, id: prior\.id \} \}/);
});

test("history suggestion save and retry are idempotent and never spend another Ask credit", () => {
  assert.match(suggestionRoute, /beginIdempotentRateLimitedOperation/);
  assert.match(suggestionRoute, /apply_furvise_state_suggestion/);
  assert.match(suggestionRoute, /apply_status === "already_applied"/);
  assert.doesNotMatch(suggestionRoute, /reserveAiCredit|completeAiCredit|releaseAiCredit|admitAiOperation|generateAsk/);
  assert.match(askPage, /uiStatus === "failed" \? "Try again"/);
  assert.match(askPage, /This update has not been saved/);
  assert.doesNotMatch(askPage, /This update could not be added to care history\. Ask Furvise to save it/);
});

test("all assistant modes use one canonical primary Furvise identity", () => {
  const renderer = askPage.slice(askPage.indexOf("function FurviseMessage"), askPage.indexOf("function StateUpdateSuggestion"));
  assert.match(renderer, /data-ui="furvise-assistant-identity"><BrandMark showName=\{false\} size=\{24\}/);
  assert.equal((renderer.match(/data-ui="furvise-assistant-identity"/g) || []).length, 1);
  assert.doesNotMatch(renderer, /nav-ask-v1|<Image|presentation === "casual"[^\n]*BrandMark/);
  assert.doesNotMatch(renderer, /urgent[^\n]*emote|grief[^\n]*emote/);
});

test("provider follow-ups are transformed only into valid user drafts or discarded", () => {
  const cases = new Map([
    ["If you want, I can turn this into a vet checklist.", "Can you turn this into a vet checklist?"],
    ["I can also summarize the last few days.", "Can you summarize the last few days?"],
    ["Would you like me to explain what to watch?", "Can you explain what to watch?"],
    ["What should I watch tonight?", "What should I watch tonight?"],
  ]);
  for (const [provider, expected] of cases) {
    const normalized = normalizeSuggestedQuestion(provider);
    assert.equal(normalized, expected);
    assert.equal(isDraftableSuggestedQuestion(normalized), true);
    assert.doesNotMatch(normalized, /\b(?:If you want|I can|I can also|Would you like me)\b/i);
  }
  for (const malformed of ["Mani should rest tonight.", "Tell me more.", "I can...", "Anything else?"]) {
    assert.equal(normalizeSuggestedQuestion(malformed), "", malformed);
  }
});

test("suggestions are optional, deduplicated, bounded, and suppressed for quiet modes", () => {
  const answer = { title: "Furvise", summary: "Mani sounds settled now.", sections: [], safetyNote: null };
  const normal = buildAskConversationResponse(answer, {
    suggestedQuestions: ["What should I watch tonight?", "What should I watch tonight?", "Can you summarize the last few days?"],
  });
  assert.deepEqual(normal.suggestedQuestions, ["What should I watch tonight?", "Can you summarize the last few days?"]);
  for (const interactionMode of ["casual", "urgent", "grief"]) {
    const quiet = buildAskConversationResponse(answer, { interactionMode, suggestedQuestions: ["What should I ask next?"] });
    assert.equal(quiet.suggestedQuestions, undefined, interactionMode);
  }
  assert.equal(buildAskConversationResponse(answer, { suggestedQuestions: ["Tell me more."] }).suggestedQuestions, undefined);
});
