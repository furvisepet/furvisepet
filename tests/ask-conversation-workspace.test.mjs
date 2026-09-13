import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASK_ANSWER_TYPES,
  buildAskConversationResponse,
  parseAskConversationResponse,
} from "../app/lib/ask.mjs";

const baseResponse = {
  title: "A practical answer",
  summary: "Track appetite and energy before Rocky's visit.",
  sections: [{ heading: "What to track", items: ["Note changes once each day."] }],
  safetyNote: null,
};

test("Ask conversation contract supports every adaptive answer type", () => {
  assert.deepEqual(ASK_ANSWER_TYPES, [
    "direct_answer",
    "care_plan",
    "tracking_plan",
    "vet_prep",
    "history_summary",
    "product_guidance",
    "clarification",
    "urgent_guidance",
  ]);
  const cases = [
    ["general_pet_question", false, "direct_answer"],
    ["symptom_notes", false, "tracking_plan"],
    ["vet_prep", false, "vet_prep"],
    ["recent_summary", false, "history_summary"],
    ["food_notes", false, "product_guidance"],
    ["general_pet_question", true, "urgent_guidance"],
  ];
  for (const [intent, urgent, expected] of cases) {
    const response = buildAskConversationResponse(baseResponse, { intent, urgent });
    assert.equal(response.answerType, expected);
    assert.equal(response.directAnswer, baseResponse.summary);
    assert.ok(parseAskConversationResponse(response));
  }
  assert.equal(
    buildAskConversationResponse({ ...baseResponse, summary: "Here is a short routine plan." }, { intent: "general_pet_question" }).answerType,
    "care_plan",
  );
  assert.equal(
    buildAskConversationResponse({ ...baseResponse, summary: "Saved history does not show recent notes." }, { intent: "general_pet_question" }).answerType,
    "clarification",
  );
});
test("Ask conversation contract drops invalid auxiliary actions without dropping the answer", () => {
  const response = buildAskConversationResponse(baseResponse, { intent: "vet_prep" });
  assert.ok(response);
  assert.deepEqual(parseAskConversationResponse({ ...response, actions: ["delete_history"] }).actions, []);
  assert.equal(parseAskConversationResponse({ ...response, urgency: "maybe" }).urgency, "routine");
  assert.ok(parseAskConversationResponse({ ...response, suggestedQuestions: ["1", "2", "3", "4"] }));
  assert.deepEqual(parseAskConversationResponse({ ...response, suggestedQuestions: ["1", "2", "3", "4", "5"] }).suggestedQuestions, []);
});

test("Ask workspace keeps one composer, chronological thread, compact pet selection, and one general disclaimer", () => {
  const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  const disclaimer = "Furvise helps keep your pet&apos;s story together. It does not replace veterinary care.";
  assert.match(page, /thread\.map/);
  assert.match(page, /role: "user"/);
  assert.match(page, /role: "furvise"/);
  assert.match(page, /<Composer/);
  assert.match(page, /CompactPetSelector/);
  assert.doesNotMatch(page, /PetContextRail|ContextDisclosure/);
  assert.match(page, /RecentConversations/);
  assert.equal(page.split(disclaimer).length - 1, 1);
  assert.doesNotMatch(page, /One follow-up question|profileCount|savedDetailCount|confidence score|raw memories/);
});

test("Ask analytics accepts only privacy-safe metadata", () => {
  const analytics = readFileSync(new URL("../app/lib/ask-analytics.ts", import.meta.url), "utf8");
  for (const event of [
    "ask_furvise_question",
    "ask_furvise_follow_up",
    "suggested_question_selected",
    "answer_action_selected",
    "answer_saved",
    "vet_note_created",
    "missing_detail_added",
    "urgent_guidance_shown",
    "answer_error",
  ]) assert.match(analytics, new RegExp(event));
  assert.doesNotMatch(analytics, /question\?:|answer\?:|concern\?:|petName\?:/);
});
