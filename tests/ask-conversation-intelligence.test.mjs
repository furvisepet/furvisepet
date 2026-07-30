import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASK_CONVERSATION_INTENTS,
  buildContextLabels,
  buildConversationDecision,
  classifyConversationIntent,
  resolveConversationReferences,
} from "../app/lib/ask-conversation-intelligence.mjs";
import { buildAskConversationResponse, parseAskConversationResponse } from "../app/lib/ask.mjs";
import { buildPetMemoryContext, answerPetMemoryQuestion } from "../app/lib/pet-memory.ts";
import { askConversationFixtures } from "./fixtures/ask-conversation-evaluations.mjs";

function profile(overrides = {}) {
  return { id: "pet-rocky", user_id: "user-1", name: "Rocky", species: "dog", breed: "Shepherd", age_value: 5, age_unit: "years", weight_value: 70, weight_unit: "lb", current_food: "Salmon food", main_concern: null, wellness_goal: "comfort", avoid_ingredients: [], monthly_budget: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z", ...overrides };
}
function care(id, category, title, note, date = "2026-07-20T12:00:00Z") {
  return { id, user_id: "user-1", pet_profile_id: "pet-rocky", category, title, note, severity: null, occurred_at: date, created_at: date, updated_at: date };
}
function memory(overrides = {}) {
  return buildPetMemoryContext({
    now: new Date("2026-07-24T12:00:00Z"),
    profile: profile(overrides.profile),
    careEntries: overrides.careEntries || [
      care("itch", "symptom", "Scratching after dinner", "Owner noticed more scratching after chicken food."),
      care("dental", "routine", "Brushed teeth", "Accepted brushing for thirty seconds."),
    ],
    savedMemories: overrides.savedMemories || [],
  });
}

test("conversation decision supports the complete practical intent vocabulary", () => {
  assert.deepEqual(ASK_CONVERSATION_INTENTS, ["general_care", "symptom_or_change", "food_or_diet", "grooming", "routine", "behavior", "product_question", "tracking", "care_history_summary", "vet_preparation", "medication_or_supplement", "clarification", "conversational_follow_up", "unrelated"]);
  for (const fixture of askConversationFixtures) assert.equal(classifyConversationIntent(fixture.question), fixture.intent, fixture.name);
});

test("multi-turn references resolve from the thread and ambiguous references ask once", () => {
  const one = resolveConversationReferences("Should I stop it?", [{ role: "user", text: "The new shampoo made him itchy." }]);
  assert.deepEqual(one, { resolved: ["grooming"], unresolved: [] });
  const ambiguous = buildConversationDecision({ memory: memory(), question: "Should I stop it?", messages: [{ role: "user", text: "We changed his food and used a new shampoo." }] });
  assert.equal(ambiguous.clarificationNeeded, true);
  assert.match(ambiguous.clarificationQuestion, /food.*grooming|grooming.*food/i);
  assert.equal((ambiguous.clarificationQuestion.match(/\?/g) || []).length, 1);
});

test("corrections override temporary thread assumptions without becoming diagnoses", () => {
  const decision = buildConversationDecision({ memory: memory(), question: "Actually, it was salmon food, not chicken.", messages: [{ role: "user", text: "Chicken might be the problem." }] });
  assert.match(decision.ownerReportedFacts[0], /salmon food, not chicken/i);
  assert.doesNotMatch(JSON.stringify(decision), /salmon allergy|chicken allergy/i);
});

test("new conversations do not inherit unsaved thread assumptions", () => {
  const clean = buildConversationDecision({ memory: memory(), question: "Should I stop it?", messages: [] });
  const continued = buildConversationDecision({ memory: memory(), question: "Should I stop it?", messages: [{ role: "user", text: "I tried a new shampoo." }] });
  assert.deepEqual(clean.unresolvedReferences, ["it"]);
  assert.deepEqual(continued.resolvedReferences, ["grooming"]);
});

test("context selection excludes unrelated history and labels only selected sources", () => {
  const decision = buildConversationDecision({ memory: memory(), question: "How can I make tooth brushing easier?" });
  assert.ok(decision.selectedContext.careEntries.some((entry) => /brushed teeth/i.test(entry.title)));
  assert.equal(decision.selectedContext.careEntries.some((entry) => /scratching/i.test(entry.title)), false);
  assert.deepEqual(buildContextLabels(memory(), decision, true), ["Rocky's profile", "Recent care updates", "This conversation"]);
});

test("memory candidates stay attributed, require confirmation, and suppress duplicates", () => {
  const question = "Rocky seemed itchier after switching to chicken-based food.";
  const candidate = buildConversationDecision({ memory: memory(), question }).memoryCandidates[0];
  assert.equal(candidate.requiresConfirmation, true);
  assert.equal(candidate.attribution, "Owner reported");
  assert.doesNotMatch(candidate.statement, /allergy/i);
  const duplicateMemory = memory({ savedMemories: [{ id: "m1", user_id: "user-1", dog_profile_id: "pet-rocky", type: "Food response", text: question, source: "owner", created_at: "2026-07-22T00:00:00Z" }] });
  assert.deepEqual(buildConversationDecision({ memory: duplicateMemory, question }).memoryCandidates, []);
});

test("tracking plans are bounded and relevant", () => {
  const decision = buildConversationDecision({ memory: memory(), question: "Rocky is scratching more after dinner." });
  assert.ok(decision.trackingPlan);
  assert.ok(decision.trackingPlan.observations.length <= 5);
  assert.match(decision.trackingPlan.duration, /3 to 5 days/);
  assert.ok(decision.trackingPlan.seekCareSoonerIf.length <= 3);
  assert.equal(buildConversationDecision({ memory: memory(), question: "How often should I brush his teeth?" }).trackingPlan, null);
});

test("prior tracking is available to a related follow-up and stays out of unrelated topics", () => {
  const prior = [{ role: "furvise", response: { directAnswer: "Watch Rocky's scratching for a few days.", trackingPlan: { observations: ["scratching", "paw redness"] } } }];
  const related = buildConversationDecision({ memory: memory(), question: "The same problem got worse yesterday.", messages: prior });
  assert.deepEqual(related.resolvedReferences, ["symptom"]);
  const unrelated = buildConversationDecision({ memory: memory(), question: "How often should I brush his teeth?", messages: prior });
  assert.equal(unrelated.intent, "routine");
  assert.equal(unrelated.trackingPlan, null);
  assert.doesNotMatch(unrelated.recommendedNextAction, /scratch|paw/i);
});

test("urgent guidance remains deterministic and action-first", () => {
  const result = answerPetMemoryQuestion(memory({ careEntries: [] }), "Rocky keeps vomiting and cannot keep water down.");
  assert.equal(result.urgent, true);
  assert.match(result.response.summary, /^This sounds urgent\. Contact a veterinarian or emergency clinic now\./);
  assert.equal(result.response.sections.some((section) => /possibilities|potential factors/i.test(section.heading)), false);
});

test("public response accepts useful presentation fields but drops the internal plan", () => {
  const decision = buildConversationDecision({ memory: memory(), question: "Rocky seemed itchier after chicken food." });
  const response = buildAskConversationResponse({ title: "Tracking Rocky's scratching", summary: "Keep the routine steady and note whether the scratching improves, stays the same, or worsens.", sections: [], safetyNote: null }, { intent: "symptom_notes", saveSuggestions: decision.memoryCandidates, trackingPlan: decision.trackingPlan, vetBriefRelevant: false, suggestedQuestions: ["What should I watch next?"] });
  const parsed = parseAskConversationResponse(response);
  assert.ok(parsed);
  assert.equal(parsed.saveSuggestions[0].requiresConfirmation, true);
  assert.equal("relevantContextKeys" in parsed, false);
  assert.equal("ownerReportedFacts" in parsed, false);
  assert.equal("confidence" in parsed.saveSuggestions[0], false);
});

test("user-facing Ask output rejects templated internal language in regression fixtures", () => {
  const forbidden = /based on the provided|available data|saved context includes|records indicate|the model|\bAI\b|generated response|confidence score|Furvise cannot determine|several considerations|potential factors include|if you want, I can|—/i;
  const outputs = askConversationFixtures.map((fixture) => {
    const decision = buildConversationDecision({ memory: memory(), question: fixture.question, urgent: fixture.urgent });
    return [decision.recommendedNextAction, decision.clarificationQuestion, ...(decision.trackingPlan?.observations || [])].filter(Boolean).join(" ");
  });
  outputs.push(JSON.stringify(answerPetMemoryQuestion(memory({ careEntries: [] }), "What should I track before Rocky's vet visit?").response));
  for (const output of outputs) assert.doesNotMatch(output, forbidden);
});

test("route keeps continuity owner-scoped, does not persist plans, and charges after validation", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const messagesRoute = readFileSync(new URL("../app/api/ask/conversations/[id]/messages/route.ts", import.meta.url), "utf8");
  assert.match(route, /eq\("pet_profile_id", petId\)[\s\S]*eq\("user_id", userId\)/);
  assert.ok(route.indexOf("buildAskConversationResponse") < route.indexOf("completeAiCredit"));
  assert.match(route, /reserveAiCredit\(\{ feature: "ask"/);
  assert.doesNotMatch(messagesRoute, /conversationDecision|relevantContextKeys|full_prompt|chain.of.thought/i);
});

test("analytics contract has lifecycle events and cannot accept private text", () => {
  const analytics = readFileSync(new URL("../app/lib/ask-analytics.ts", import.meta.url), "utf8");
  for (const event of ["conversation_started", "conversation_reopened", "question_submitted", "follow_up_submitted", "clarification_requested", "suggestion_selected", "tracking_started", "memory_save_suggested", "memory_saved", "vet_brief_started", "urgent_guidance_shown", "answer_failed"]) assert.match(analytics, new RegExp(event));
  assert.doesNotMatch(analytics, /question\?:|responseText\?:|symptom\?:|productName\?:|ownerNote\?:|memoryStatement\?:/);
});
