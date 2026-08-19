import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyAskAnswerEconomy,
  measureAskAnswerEconomy,
  planAskAnswerDepth,
} from "../app/lib/ai/ask-answer-economy.ts";
import {
  buildImmediateEmergencyGuidance,
  normalizePetVisibleAnswer,
  normalizePetVisibleProse,
} from "../app/lib/ask-safety-context.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";
import { runAskFailureInjection } from "../app/lib/ai/ask-reliability-harness.ts";

const mani = { name: "Mani", sex: "female", species: "cat" };
const forbiddenMani = /(?:Mani['’]s\s+(?:choose|initiate|in\s+place)|holding\s+Mani['’]s|give\s+Mani['’]s\s+space|pet\s+Mani['’]s|Mani['’]ll)/i;

function finalize(answer, message, minimumSafetyLevel = "normal") {
  const economy = applyAskAnswerEconomy(answer, planAskAnswerDepth({ message, minimumSafetyLevel }));
  return normalizePetVisibleAnswer(economy, mani, { reduceNameOveruse: true });
}

function assertNatural(answer, required = []) {
  const rendered = [answer.summary, ...answer.sections.flatMap((section) => section.items)].join(" ");
  const metrics = measureAskAnswerEconomy(answer, { petName: "Mani" });
  assert.doesNotMatch(rendered, forbiddenMani);
  assert.equal(metrics.malformedPersonalizationCount, 0);
  assert.equal(metrics.petNameContractionCount, 0);
  assert.equal(metrics.petNameOveruseFlag, false);
  assert.equal(metrics.pseudoListCount, 0);
  assert.equal(metrics.bulletIntegrityViolationCount, 0);
  for (const pattern of required) assert.match(rendered, pattern);
  return metrics;
}

test("exact production Test B repairs object possessives without losing practical guidance", () => {
  const answer = finalize({
    summary: "That usually means Mani’s had enough petting and is trying to end the interaction. Stop petting as soon as Mani starts tensing up, tail flicking, skin rippling, turning Mani's head toward your hand, or giving small nips. Keep sessions short, pet only the spots Mani clearly likes, and let Mani's initiate more contact. If Mani bites hard, seems suddenly more touch-sensitive than usual, or this is a new change, it’s worth checking for pain or skin irritation with a vet.",
    sections: [{ heading: "What to do next", items: ["Use brief strokes on the areas Mani prefers, and avoid holding Mani's in place.", "Reward calm contact, then give Mani's space when Mani starts signaling Mani’s done.", "If Mani's tolerance dropped suddenly, watch for signs of soreness, itching, or pain when touched."] }],
    safetyNote: null,
  }, "She keeps biting me when I pet her for more than a minute. What should I do?");
  const metrics = assertNatural(answer, [/keep sessions short/i, /pain or skin irritation/i, /give her space/i]);
  assert.ok(metrics.petNameUseCount <= 2);
});

test("exact production Test C preserves acknowledgement while repairing pet references", () => {
  const answer = finalize({
    summary: "That sounds frustrating, and the guilt part is real. The safest move is to stop petting as soon as Mani starts showing the pattern, give Mani's a little space, and only pet Mani's in short sessions when Mani chooses to come to you. Cats that follow closely and then bite while being petted are often saying, “enough for now,” so it helps to end the interaction before Mani escalates. Watch for the spots and timing that trigger it, like belly rubs, long strokes, or petting after Mani’s already wound up. Try shorter, calmer contact and reward the moments where Mani stays relaxed. If this is new or it’s getting more frequent, or if Mani seems sore, jumpy, or avoids being touched in a usual place, it’s worth checking with a vet because discomfort can make petting intolerance worse.",
    sections: [{ heading: "What to do now", items: ["Pause petting at the first sign of tail flicking, skin twitching, head turn, or a quick nip.", "Avoid petting the common trigger areas for a few days and see whether the biting drops off."] }],
    safetyNote: null,
  }, "I love her but lately she keeps following me around and then biting when I pet her. I’m getting frustrated and feel guilty about being annoyed. How should I handle it?");
  const metrics = assertNatural(answer, [/sounds frustrating/i, /give her a little space/i, /checking with a vet/i]);
  assert.ok(metrics.petNameUseCount <= 2);
});

test("exact production Test D preserves distinct complex guidance and splits the overloaded bullet", () => {
  const answer = finalize({
    summary: "This is worth a vet call soon, ideally today or within 24 hours, because the combo of eating less, drinking more, hiding more, and vomiting over a week can point to something that needs a checkup rather than just a food adjustment. For now, keep Mani's on one diet and one feeding schedule, offer water, and watch for any worsening.",
    sections: [
      { heading: "What to track", items: ["How much Mani eats at each meal, and whether Mani skips meals entirely", "How much Mani drinks, if it seems clearly more than usual, and whether Mani’s urinating more or less", "Any vomiting details: how often, what it looks like, and whether it’s after eating or random", "Energy and hiding: whether Mani’s still moving around normally or seems more withdrawn than before"] },
      { heading: "What to do now", items: ["Don’t keep changing the food or schedule again right now if you can avoid it, so you can tell what’s helping or making things worse", "Write down the vomiting times and save a photo if it happens again"] },
      { heading: "Call the vet sooner if", items: ["Mani vomits again, especially more than once in a day", "If Mani’ll eat, offer small amounts of Mani's usual food and avoid rich treats or sudden diet changes. Make sure fresh water is available and check that Mani’s using the litter box normally. Mani stops eating for a full day, or barely eats at all. Mani seems weak, hides much more, or won’t come out to interact. Mani can’t keep water down, has diarrhea, or seems painful or dehydrated."] },
    ],
    safetyNote: null,
  }, "Over the last week she’s been eating less, drinking more, hiding more, and has vomited twice. We also switched her food and changed her feeding schedule. What should I track, what can I do now, and when should I call the vet?", "monitor");
  const metrics = assertNatural(answer, [/vet call soon/i, /how much .* eats/i, /stops eating/i, /can’t keep water down/i]);
  assert.ok(answer.sections.length >= 2);
  assert.ok(metrics.bullets >= 6);
  assert.ok(answer.sections.every((section) => section.items.every((item) => item.split(/[.!?]+/).filter(Boolean).length <= 2)));
});

test("exact production follow-up remains desk-specific and uses a true list", () => {
  const answer = finalize({
    summary: "That makes sense. If Mani mostly does it when you’re at your desk, it may be Mani's way of saying Mani’s done with petting or wants your attention on something else. Try keeping desk-time contact very brief, watching for the first signs of irritation, and giving Mani's an easier option like a nearby bed, perch, or toy before Mani starts nipping.",
    sections: [{ heading: "What to try at your desk", items: ["Pet Mani's only for a few seconds at a time, then pause before Mani gets restless.", "End the interaction at the first tail flick, tense body, head turn, or skin ripple.", "Offer a toy, treat, or a spot near your desk so Mani can stay close without being handled.", "If Mani’s biting more than usual or seems sensitive to touch in general, that points more toward discomfort than just being overstimulated."] }],
    safetyNote: null,
  }, "She mostly does it while I’m working at my desk.");
  const metrics = assertNatural(answer, [/desk/i, /nearby bed, perch, or toy/i]);
  assert.equal(answer.sections.length, 1);
  assert.ok(metrics.bullets <= 4);
});

test("pet-reference fuzz preserves natural grammar for known and unknown pronouns", () => {
  const phrases = ["pet her", "give her space", "let her choose", "if she’ll eat", "when she’s ready", "her food", "her litter box", "watch her closely", "hold her", "feed her", "she’s done", "she’ll come back"];
  const profiles = [
    ...["Mani", "Luna", "O’Malley", "Mr. Pickles", "JoJo", "Nala"].map((name) => ({ name, sex: "female", species: "cat" })),
    ...["Max", "Milo"].map((name) => ({ name, sex: "male", species: "dog" })),
    { name: "Milo", pronouns: "they/them", species: "cat" },
  ];
  for (const profile of profiles) {
    for (const phrase of phrases) {
      const output = normalizePetVisibleProse(phrase, profile);
      assert.doesNotMatch(output, new RegExp(`${profile.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['’](?:ll|re|ve|d)`, "iu"));
      assert.doesNotMatch(output, /(?:pet|give|let|hold|feed)\s+[^ ]+['’]s\b/iu);
    }
  }
  const unknown = { name: "JoJo", sex: "not_sure", species: "cat" };
  for (const phrase of phrases) {
    const output = normalizePetVisibleProse(phrase, unknown);
    assert.doesNotMatch(output, /JoJo['’](?:ll|re|ve|d)\b/u);
    assert.doesNotMatch(output, /(?:pet|give|let|hold|feed)\s+JoJo['’]s\b/u);
  }
});

test("broken provider output is repaired dynamically for varied pet names", () => {
  const cases = [
    [{ name: "Luna", sex: "female" }, "pet Luna’s", "pet her"],
    [{ name: "Max", sex: "male" }, "give Max’s space", "give him space"],
    [{ name: "Milo", pronouns: "they/them" }, "let Milo’s choose", "let them choose"],
    [{ name: "Nala", sex: "female" }, "If Nala’ll eat", "If she'll eat"],
    [{ name: "O’Malley", sex: "male" }, "O’Malley’s wants food", "He wants food"],
  ];
  for (const [profile, input, expected] of cases) {
    assert.equal(normalizePetVisibleProse(input, { ...profile, species: "cat" }), expected);
  }
});

test("multi-pet mode preserves explicit names while repairing malformed forms", () => {
  const input = "Mani stopped eating, but Coco is normal. Mani follows Coco and Coco watches Mani.";
  const output = normalizePetVisibleProse(input, mani, { reduceNameOveruse: false });
  assert.equal(output, input);
  assert.equal(normalizePetVisibleProse("Give Mani's space while Coco eats.", mani, { reduceNameOveruse: false }), "Give Mani space while Coco eats.");
});

test("name-density metrics flag production-scale repetition without penalizing sparse complex clarity", () => {
  const excessive = measureAskAnswerEconomy({
    summary: Array.from({ length: 12 }, (_value, index) => `Mani has signal ${index + 1}.`).join(" "),
    sections: [],
    safetyNote: null,
  }, { petName: "Mani" });
  assert.equal(excessive.petNameUseCount, 12);
  assert.equal(excessive.petNameOveruseFlag, true);

  const sparse = measureAskAnswerEconomy({
    summary: "Mani has several changes worth tracking. She is eating less and drinking more. Her energy is also lower.",
    sections: [{ heading: "Call the vet", items: ["Tell them when Mani first changed.", "Mention whether she can keep water down."] }],
    safetyNote: null,
  }, { petName: "Mani" });
  assert.equal(sparse.petNameUseCount, 2);
  assert.equal(sparse.petNameOveruseFlag, false);
});

test("visible normalization leaves machine data and emergency copy unchanged", () => {
  const answer = normalizePetVisibleAnswer({
    summary: "Give Mani's space.",
    sections: [],
    safetyNote: null,
    applicationActions: [{ id: "action:pet-update-profile:abc", kind: "pet.update_profile" }],
  }, mani);
  assert.equal(answer.summary, "Give her space.");
  assert.deepEqual(answer.applicationActions, [{ id: "action:pet-update-profile:abc", kind: "pet.update_profile" }]);

  const emergency = buildImmediateEmergencyGuidance({ tags: ["breathing_difficulty"] });
  assert.deepEqual(applyAskAnswerEconomy(emergency, planAskAnswerDepth({ message: "She can't breathe.", minimumSafetyLevel: "urgent" })), emergency);
});

test("the final validator repairs visible prose without recreating possessive corruption", () => {
  const result = validateGeneratedAnswer({
    answer: {
      title: "Answer",
      summary: "Give Mani's space, pet Mani's briefly, and let Mani's choose when Mani'll return.",
      sections: [{ heading: "Watch", items: ["Avoid holding Mani's in place."] }],
      safetyNote: null,
    },
    userIntent: "question",
    relevantContextIds: [],
    referencedRecords: [],
    safetyLevel: "normal",
    shoppingSuppressed: false,
    suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    responseMode: "conversational",
    model: "test",
    messageUnderstanding: {},
    intelligenceSafety: { level: "routine", reason: "", requiresImmediateAction: false, shoppingSuppressed: false },
    learnings: [],
    careActions: [],
    semanticEvents: [],
    intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: false, usedMemories: false },
  }, {
    currentMessage: "How should I pet her?",
    pet: { id: "pet", name: "Mani", sex: "female", species: "cat" },
    eligiblePets: [{ id: "pet", name: "Mani", sex: "female", species: "cat" }],
    memories: [],
    careEntries: [],
  }, "routine", ["pet"]);

  assert.equal(result.valid, true);
  assert.equal(result.response.answer.summary, "Give her space, pet her briefly, and let her choose when she'll return.");
  assert.deepEqual(result.response.answer.sections[0].items, ["Avoid holding her in place."]);

  const validator = readFileSync(new URL("../app/lib/intelligence/validation/validate-answer.ts", import.meta.url), "utf8");
  assert.match(validator, /normalizePetVisibleAnswer/);
  assert.doesNotMatch(validator, /replace\(\/\\b\(\?:her\|his\)/);
  assert.match(validator, /qualityWarnings/);
  assert.doesNotMatch(validator, /errors\.push\("(?:malformed_pet_reference|mixed_purpose_bullet)/);
});

test("quality defects degrade locally across answer modes without changing turn or credit outcome", () => {
  const cases = [
    {
      label: "simple",
      answer: { title: "Answer", summary: "Pet Mani's gently and give Mani's space.", sections: [], safetyNote: null },
      context: validationContext({ sex: "female" }),
      safety: "routine",
      authoritativePetIds: ["pet"],
      required: [/pet her gently/i, /give her space/i],
    },
    {
      label: "practical",
      answer: { title: "Answer", summary: "Let Mani's choose when Mani'll return.", sections: [{ heading: "Try", items: ["Keep sessions short. Watch for a tail flick. Call the vet if touch suddenly seems painful."] }], safetyNote: null },
      context: validationContext({ sex: "female" }),
      safety: "routine",
      authoritativePetIds: ["pet"],
      required: [/let her choose/i, /she'll return/i, /painful/i],
    },
    {
      label: "complex",
      answer: { title: "Answer", summary: "Track Mani's appetite and drinking.", sections: [{ heading: "Next steps", items: ["Offer water. Record each vomiting episode. Call the vet today if Mani's cannot keep water down."] }], safetyNote: null },
      context: validationContext({ sex: "female" }),
      safety: "caution",
      authoritativePetIds: ["pet"],
      required: [/appetite/i, /record each vomiting episode/i, /cannot keep water down/i],
    },
    {
      label: "urgent",
      answer: { title: "Urgent guidance", summary: "If Mani'll stop breathing, call an emergency veterinarian immediately and start traveling now.", sections: [{ heading: "Do now", items: ["Keep Mani's still. Avoid food or medication."] }], safetyNote: "Do not wait for another symptom." },
      context: validationContext({ sex: "female", message: "She is struggling to breathe." }),
      safety: "emergency",
      authoritativePetIds: ["pet"],
      required: [/stop breathing/i, /emergency veterinarian immediately/i, /do not wait/i],
    },
    {
      label: "multi-pet",
      answer: { title: "Answer", summary: "Give Mani's space while Coco eats, then watch Coco closely.", sections: [], safetyNote: null },
      context: validationContext({ sex: "female", eligiblePets: [{ id: "pet", name: "Mani", sex: "female", species: "cat" }, { id: "coco", name: "Coco", sex: "male", species: "cat" }] }),
      safety: "routine",
      authoritativePetIds: ["pet", "coco"],
      required: [/give Mani space/i, /Coco eats/i],
    },
    {
      label: "unknown-pronouns",
      answer: { title: "Answer", summary: "Give JoJo's space and ask JoJo's to move when JoJo'll come back.", sections: [], safetyNote: null },
      context: validationContext({ id: "jojo", name: "JoJo", sex: null }),
      safety: "routine",
      authoritativePetIds: ["jojo"],
      required: [/give JoJo space/i, /ask JoJo to move/i, /JoJo will come back/i],
    },
  ];

  for (const item of cases) {
    const result = validateGeneratedAnswer(validationReasoning(item.answer, item.safety), item.context, item.safety, item.authoritativePetIds);
    const visible = [result.response.answer.summary, ...result.response.answer.sections.flatMap((section) => section.items), result.response.answer.safetyNote || ""].join(" ");
    assert.equal(result.valid, true, item.label);
    assert.deepEqual(result.errors, [], item.label);
    assert.deepEqual(result.response.applicationActions, [{ id: "action:pet-update-profile:abc", kind: "pet.update_profile" }], item.label);
    assert.ok(result.repairs.some((repair) => /pet_reference|mixed_purpose_bullet/.test(repair)), item.label);
    for (const required of item.required) assert.match(visible, required, item.label);
    const metrics = measureAskAnswerEconomy(result.response.answer, { petName: item.context.pet.name });
    assert.equal(metrics.malformedPersonalizationCount, 0, item.label);
    assert.equal(metrics.petNameContractionCount, 0, item.label);
    assert.equal(metrics.bulletIntegrityViolationCount, 0, item.label);
  }

  const turn = runAskFailureInjection("quality_normalization");
  assert.equal(turn.success, true);
  assert.equal(turn.publicError, null);
  assert.equal(turn.providerCallCount, 1);
  assert.equal(turn.userMessageCount, 1);
  assert.equal(turn.assistantMessageCount, 1);
  assert.equal(turn.creditState, "completed");
  assert.equal(turn.finalStage, "COMPLETED");
});

test("quality normalization is degradable while core-invalid output still fails closed", () => {
  const repetitive = validateGeneratedAnswer(validationReasoning({
    title: "Answer",
    summary: "Mani: Keep sessions short. Mani: Offer a pause. Mani: Watch the tail. Mani: Give space. Mani: Let contact end.",
    sections: [],
    safetyNote: null,
  }, "routine"), validationContext({ sex: "female" }), "routine", ["pet"]);
  assert.equal(repetitive.valid, true);
  assert.deepEqual(repetitive.errors, []);
  assert.ok(repetitive.qualityWarnings.includes("pet_name_overuse_remaining"));

  const coreInvalid = validateGeneratedAnswer(validationReasoning({
    title: "Answer",
    summary: "I saved that.",
    sections: [],
    safetyNote: null,
  }, "routine"), validationContext({ sex: "female" }), "routine", ["pet"]);
  assert.equal(coreInvalid.valid, false);
  assert.ok(coreInvalid.errors.includes("empty_after_grounding_repair"));

  const validator = readFileSync(new URL("../app/lib/intelligence/validation/validate-answer.ts", import.meta.url), "utf8");
  const intelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
  const reasoningSource = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.doesNotMatch(validator, /errors\.push\("(?:malformed_pet_reference|mixed_purpose_bullet)/);
  assert.match(validator, /qualityWarnings\.push\("personalization_defect_remaining"\)/);
  assert.match(intelligence, /if \(!answerValidation\.valid\) throw/);
  assert.doesNotMatch(reasoningSource, /personalization_defect_remaining|pet_name_overuse_remaining|mixed_purpose_bullet_remaining/);
});

function validationReasoning(answer, safety) {
  const urgent = safety === "urgent" || safety === "emergency";
  return {
    answer,
    userIntent: "question",
    relevantContextIds: [],
    referencedRecords: [],
    safetyLevel: urgent ? "urgent" : safety === "caution" ? "monitor" : "normal",
    shoppingSuppressed: urgent,
    suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    responseMode: urgent ? "urgent_safety" : "conversational",
    model: "test",
    messageUnderstanding: {},
    intelligenceSafety: { level: safety, reason: "", requiresImmediateAction: urgent, shoppingSuppressed: urgent },
    learnings: [],
    careActions: [],
    semanticEvents: [],
    intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: false, usedMemories: false },
    applicationActions: [{ id: "action:pet-update-profile:abc", kind: "pet.update_profile" }],
  };
}

function validationContext(overrides = {}) {
  const pet = {
    id: overrides.id || "pet",
    name: overrides.name || "Mani",
    sex: overrides.sex,
    species: "cat",
  };
  return {
    currentMessage: overrides.message || "What should I do?",
    pet,
    eligiblePets: overrides.eligiblePets || [pet],
    memories: [],
    careEntries: [],
  };
}
