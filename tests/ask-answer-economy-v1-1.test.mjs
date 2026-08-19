import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyAskAnswerEconomy,
  canonicalizeAnswerProse,
  hasEmbeddedListMarkers,
  measureAskAnswerEconomy,
  planAskAnswerDepth,
  semanticAnswerOverlap,
} from "../app/lib/ai/ask-answer-economy.ts";
import { normalizePetVisibleProse, removeUnsupportedGenderedPronouns } from "../app/lib/ask-safety-context.ts";
import { buildAskConversationResponse, parseAskConversationResponse } from "../app/lib/ask.mjs";

const mani = { name: "Mani", sex: "female", species: "cat" };

function shape(answer, message, previousAssistantText = "") {
  const personalized = {
    ...answer,
    summary: normalizePetVisibleProse(answer.summary, mani),
    sections: answer.sections.map((section) => ({
      heading: normalizePetVisibleProse(section.heading, mani),
      items: section.items.map((item) => normalizePetVisibleProse(item, mani)),
    })),
  };
  return applyAskAnswerEconomy(personalized, planAskAnswerDepth({
    message,
    recentConversation: previousAssistantText
      ? [{ role: "user", text: "Why does she do that?" }, { role: "furvise", text: previousAssistantText }]
      : [],
  }), { previousAssistantText });
}

test("practical biting answer removes section restatements after safe personalization", () => {
  const answer = shape({
    summary: "That usually means Mani's petting threshold is short, or Mani's getting overstimulated. Stop petting as soon as you see the first warning signs, like skin twitching, tail flicking, or her head turning toward your hand. Keep sessions brief and give Mani's a break before Mani starts biting. If this is new or getting worse, check with a vet because pain can make cats bite faster.",
    sections: [
      { heading: "What to do now", items: ["End the petting before Mani reaches the bite point.", "Try shorter touches with pauses in between."] },
      { heading: "Watch for", items: ["Look for early signs such as a flicking tail.", "Avoid areas Mani resists, and let Mani's choose when the interaction continues."] },
    ],
    safetyNote: null,
  }, "She keeps biting me when I pet her for more than a minute. What should I do?");
  const metrics = measureAskAnswerEconomy(answer, { petName: "Mani" });
  assert.ok(answer.sections.length <= 1);
  assert.equal(metrics.repeatedSemanticContent, 0);
  assert.ok(metrics.directSectionSemanticOverlap < 0.68);
  assert.equal(metrics.malformedPersonalizationCount, 0);
  assert.doesNotMatch(JSON.stringify(answer), /Mani['’]s\s+(?:choose|a\s+break)/i);
  assert.match(answer.summary, /her tolerance for petting/i);
});

test("long emotional concern keeps warmth without repeating its core recommendation", () => {
  const answer = shape({
    summary: "That sounds exhausting, especially when she asks for closeness and then bites. Stop before she reaches the bite point, keep contact brief, and let her decide whether she wants more. Watch for tail flicking or skin twitching. Your frustration does not mean you are doing anything wrong.",
    sections: [
      { heading: "What to do", items: ["Keep petting sessions short.", "End the interaction before she reaches her limit."] },
      { heading: "Avoid", items: ["Do not punish or hold her in place.", "Use play instead of hands when she is wound up."] },
    ],
    safetyNote: null,
  }, "I love her, but she follows me and then bites. I feel frustrated and guilty. How should I handle it?");
  const metrics = measureAskAnswerEconomy(answer, { petName: "Mani" });
  assert.match(answer.summary, /sounds exhausting/i);
  assert.equal(metrics.repeatedSemanticContent, 0);
  assert.ok(answer.sections.length <= 1);
  assert.match(JSON.stringify(answer), /Do not punish/i);
});

test("complex multi-symptom guidance preserves distinct monitoring and escalation structure", () => {
  const answer = shape({
    summary: "Eating less, drinking more, vomiting, and hiding after a medication change deserve a same-day call to the prescribing vet. The combination matters more than any one sign. Track when each change started, keep water available without forcing food, and have the medication package ready when you call.",
    sections: [
      { heading: "Track", items: ["Record the amount eaten and drunk, every vomiting episode, urine and stool output, and whether she comes out of hiding.", "Write down the medication name, dose, last dose time, and whether each symptom began before or after that dose."] },
      { heading: "While you wait", items: ["Keep her in a quiet, easy-to-observe room and offer small amounts of her usual tolerated food without forcing her.", "Do not give human medication, add supplements, or stop and repeat a prescribed dose unless the clinic directs you."] },
      { heading: "Go urgently if", items: ["Use emergency care if she cannot keep water down, collapses, has trouble breathing, cannot urinate, or becomes markedly weak.", "Pale or blue gums, a swollen painful abdomen, repeated vomiting, or becoming hard to wake also need urgent assessment."] },
    ],
    safetyNote: null,
  }, "She is eating less, drinking more, vomited twice, and is hiding after a medication change.");
  const metrics = measureAskAnswerEconomy(answer);
  assert.equal(planAskAnswerDepth({ message: "She is eating less, drinking more, vomited twice, and is hiding after a medication change." }).depth, 3);
  assert.equal(answer.sections.length, 3);
  assert.ok(metrics.bullets >= 5);
  assert.ok(metrics.words >= 140);
  assert.match(JSON.stringify(answer), /trouble breathing/);
  assert.ok(metrics.sectionNoveltyRate >= 0.8);
});

test("follow-up delta becomes prose without embedded pseudo-list markers", () => {
  const previous = "She may interrupt because your response has become part of her work-time routine.";
  const answer = shape({
    summary: "That new detail points to a desk-time habit. A few things can help: - Give Mani's a short play session first. - Set up a nearby resting spot. - Reward calm behavior there.",
    sections: [],
    safetyNote: null,
  }, "She only does it while I am working at my desk.", previous);
  assert.equal(answer.sections.length, 0);
  assert.equal(hasEmbeddedListMarkers(answer.summary), false);
  assert.doesNotMatch(answer.summary, /(?:^|\s)(?:[-•]|\d+[.)])\s+/);
  assert.match(answer.summary, /play session first; set up a nearby resting spot; and reward calm behavior/i);
});

test("semantic deduplication catches equivalent recommendations but preserves distinct safety advice", () => {
  const pairs = [
    ["Give her space when she gets overstimulated.", "Back off once she starts getting wound up."],
    ["Keep sessions short.", "End petting before she reaches her limit."],
    ["Watch for tail flicking.", "Look for early signs such as a flicking tail."],
  ];
  for (const [left, right] of pairs) assert.ok(semanticAnswerOverlap(left, right) >= 0.68, `${left} <> ${right}`);
  assert.ok(semanticAnswerOverlap("Watch for a flicking tail.", "Call the vet if she cannot keep water down.") < 0.68);
});

test("personalization fuzz preserves grammatical pronoun roles across pet names", () => {
  const phrases = ["pet her", "feed her", "let her choose", "watch her", "her food", "her behavior", "her litter box", "give her space", "when she chooses", "if she wants", "her tolerance", "I gave her food"];
  for (const name of ["Mani", "Luna", "Max", "Milo", "O’Malley"]) {
    const output = phrases.map((phrase) => removeUnsupportedGenderedPronouns(phrase, name));
    assert.equal(output[0], `pet ${name}`);
    assert.equal(output[2], `let ${name} choose`);
    assert.equal(output[4], `${name}’s food`);
    assert.equal(output[8], `when ${name} chooses`);
    assert.equal(output[11], `I gave ${name} food`);
    assert.doesNotMatch(output.join(" "), new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['’]s\\s+(?:choose|wants)`, "i"));
  }
  assert.equal(normalizePetVisibleProse("Pet her, then let her choose whether she wants more.", mani), "Pet her, then let her choose whether she wants more.");
  assert.equal(normalizePetVisibleProse("Mani's food is ready. Mani's getting hungry.", mani), "Her food is ready. She's getting hungry.");
  assert.equal(normalizePetVisibleProse("Pet him, then let him choose whether he wants more.", { name: "Max", sex: "male", species: "dog" }), "Pet him, then let him choose whether he wants more.");
  assert.equal(normalizePetVisibleProse("Pet them, then let them choose whether they want more.", { name: "Milo", pronouns: "they/them", species: "cat" }), "Pet them, then let them choose whether they want more.");
});

test("visible-prose normalization cannot mutate URLs, identifiers, enums, or markdown", () => {
  const prose = "See https://furvise.com/pets/Mani and action:pet.update_profile. Keep `READ_ONLY` exact; let Mani's choose.";
  const normalized = normalizePetVisibleProse(prose, mani);
  assert.match(normalized, /https:\/\/furvise\.com\/pets\/Mani/);
  assert.match(normalized, /action:pet\.update_profile/);
  assert.match(normalized, /`READ_ONLY`/);
  assert.match(normalized, /let her choose/);

  const response = buildAskConversationResponse({ title: "Furvise", summary: "Try these: • do one • do two • do three", sections: [], safetyNote: null }, {
    applicationActions: [{ id: "action:pet-update-profile:abc", kind: "pet.update_profile", petId: "pet-123", label: "Update profile", description: "Review the change", input: { field: "routine_note", value: "calm" }, safetyClass: "CONFIRMATION_REQUIRED", confirmationPolicy: "always", status: "confirmation_required" }],
  });
  assert.equal(response.applicationActions[0].id, "action:pet-update-profile:abc");
  assert.equal(response.applicationActions[0].kind, "pet.update_profile");
  assert.equal(hasEmbeddedListMarkers(response.directAnswer), false);
  assert.equal(parseAskConversationResponse(response).applicationActions[0].id, "action:pet-update-profile:abc");
});

test("renderer consumes structured items and never infers embedded list syntax", () => {
  const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  assert.match(page, /AdaptiveSections/);
  assert.match(page, /section\.items\.map/);
  assert.doesNotMatch(page, /split\([^\n]*(?:[-•]|\\d)/);
  assert.equal(canonicalizeAnswerProse("Try these: 1. do one 2. do two 3. do three"), "Try these: do one; do two; and do three.");
  const timeline = 'Recent "Jul 18, 2026 - behavior update: Too sad - been sitting whole day".';
  assert.equal(canonicalizeAnswerProse(timeline), timeline);
  assert.equal(parseAskConversationResponse({ title: "Furvise", summary: timeline, directAnswer: timeline, sections: [], safetyNote: null, answerType: "direct_answer", actions: ["copy"], urgency: "routine", interactionMode: "normal" }).directAnswer, timeline);
});
