import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyFurviseCapabilityQuestion, sanitizeInternalProductMetadataFromCareAnswer } from "../app/lib/ai/ask-internal-product-policy.ts";
import { resolveDeterministicTurnSubject } from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { buildRecentSubjectState, resolveRecentPronoun } from "../app/lib/intelligence/entities/recent-subject-state.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";

const mani = { id: "pet-mani", name: "Mani", species: "cat", sex: "female", age_value: 5, age_unit: "years" };
const coco = { id: "pet-coco", name: "Coco", species: "cat", sex: "male", age_value: 3, age_unit: "years" };

function resolve(message, recentConversation = [], pets = [mani]) {
  return resolveDeterministicTurnSubject({ message, pets, recentConversation, selectedPetId: mani.id });
}

test("a recent explicit sister becomes discourse focus instead of the selected female pet", () => {
  const result = resolve("She thinks something is wrong.", [
    { role: "user", text: "Mani is asleep now." },
    { role: "user", text: "My sister came over and she looks upset." },
  ]);
  assert.equal(result?.petId, mani.id);
  assert.deepEqual(result?.petIds, []);
  assert.equal(result?.discourseFocus?.kind, "person");
  assert.match(result?.discourseFocus?.label || "", /sister/i);
  assert.equal(result?.requiresClarification, false);
});

test("same-turn female vet pronouns resolve to the vet while Mani remains safe context", () => {
  const result = resolve("The vet examined Mani. She said the bloodwork looked okay.");
  assert.equal(result?.discourseFocus?.kind, "person");
  assert.match(result?.discourseFocus?.label || "", /vet/i);
  assert.deepEqual(result?.petIds, []);
});

test("an explicit return to Mani replaces a recent human focus", () => {
  const result = resolve("Mani woke up and she started meowing.", [
    { role: "user", text: "My sister came over. She looked upset." },
  ]);
  assert.equal(result?.petId, mani.id);
  assert.deepEqual(result?.petIds, [mani.id]);
  assert.equal(result?.discourseFocus, undefined);
});

test("grammatical subject continuity keeps girlfriend distinct from pet object pronouns", () => {
  const result = resolve("My girlfriend picked her up and she started crying.");
  assert.equal(result?.discourseFocus?.kind, "person");
  assert.match(result?.discourseFocus?.label || "", /girlfriend/i);
});

test("two female humans and Mani remain genuinely ambiguous", () => {
  const state = buildRecentSubjectState({
    pets: [mani], selectedPetId: mani.id,
    recentConversation: [{ role: "user", text: "My sister and my girlfriend came over." }],
  });
  assert.equal(resolveRecentPronoun(state, "she").status, "ambiguous");
  assert.equal(resolve("She looks upset.", [{ role: "user", text: "My sister and my girlfriend came over." }]), null);
});

test("outside animal, human, and selected pet retain separate discourse entities", () => {
  const state = buildRecentSubjectState({
    pets: [mani, coco], selectedPetId: mani.id,
    recentConversation: [
      { role: "user", text: "The outside male cat came back." },
      { role: "user", text: "My sister went to look. She is worried about him." },
    ],
  });
  assert.ok(state.entities.some((entity) => entity.kind === "external_animal"));
  assert.ok(state.entities.some((entity) => entity.kind === "person"));
  assert.equal(resolveRecentPronoun(state, "she").entity?.kind, "person");
  assert.equal(resolveRecentPronoun(state, "him").entity?.kind, "external_animal");
});

test("lifecycle turns do not own later feminine pronouns after a human topic shift", () => {
  const result = resolve("She says she needs some space.", [
    { role: "user", text: "She's gone." },
    { role: "user", text: "No, Mani is alive. That report was wrong." },
    { role: "user", text: "A woman came to the door. She looks shaken." },
  ]);
  assert.equal(result?.discourseFocus?.kind, "person");
  assert.match(result?.discourseFocus?.label || "", /woman/i);
});

test("medical time-course language never routes to internal capability copy", () => {
  assert.equal(classifyFurviseCapabilityQuestion("Her symptoms have changed over time and the pattern is getting worse."), null);
  assert.equal(classifyFurviseCapabilityQuestion("She has vomited for months. What should the vet know?"), null);
  assert.equal(classifyFurviseCapabilityQuestion("Can Furvise Plus detect patterns over time in all her history?"), "long_history_patterns");
  assert.equal(classifyFurviseCapabilityQuestion("Can I export a Vet Prep PDF from Furvise?"), "vet_prep_exports");
  assert.equal(classifyFurviseCapabilityQuestion("Can Furvise research current product prices?"), "live_product_research");
});

test("the visible-prose guard strips internal metadata without destroying medical guidance", () => {
  const original = {
    title: "Planned Furvise Plus capability",
    summary: "Call your vet today because eating less and drinking more together matter. Longer-history pattern detection is not built yet.",
    sections: [
      { heading: "What to do", items: ["Track food, water, vomiting, and litter-box changes."] },
      { heading: "Roadmap", items: ["This experimental Furvise feature is planned for a later rollout."] },
    ],
    safetyNote: "Go urgently if she cannot keep water down.",
  };
  const guarded = sanitizeInternalProductMetadataFromCareAnswer(original);
  assert.ok(guarded.removedCount >= 3);
  assert.doesNotMatch(JSON.stringify(guarded.answer), /planned|roadmap|rollout|not built yet/i);
  assert.match(guarded.answer.summary, /Call your vet today/i);
  assert.match(guarded.answer.safetyNote || "", /urgently/i);
});

test("internal product metadata is a degradable answer repair, not a failed Ask turn", () => {
  const result = validateGeneratedAnswer(reasoning({
    title: "Answer",
    summary: "Keep monitoring her appetite. Longer-history pattern detection is not built yet.",
    sections: [],
    safetyNote: null,
  }), context("She is eating less over time."), "monitor", [mani.id]);
  assert.equal(result.valid, true);
  assert.ok(result.repairs.includes("removed_internal_product_metadata"));
  assert.match(result.response.answer.summary, /monitoring her appetite/i);
  assert.doesNotMatch(result.response.answer.summary, /pattern detection|not built/i);
});

test("the live route gates capability copy by explicit product intent and passes discourse focus to reasoning", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.match(route, /classifyFurviseCapabilityQuestion\(question\)/);
  assert.match(route, /discourseFocus: subjectResolution\.discourseFocus/);
  assert.match(route, /proposals: turnAuthoritativePetIds\.length \? reasoning\.applicationActions : \[\]/);
  assert.match(route, /suggestion: turnAuthoritativePetIds\.length \? orchestration\.suggestion : null/);
  assert.doesNotMatch(route, /function buildPlannedCapabilityResponse\(question/);
});

function reasoning(answer) {
  return {
    answer, userIntent: "question", relevantContextIds: [], referencedRecords: [], safetyLevel: "monitor",
    shoppingSuppressed: false, suggestedFollowUps: [], responseMode: "practical_guidance", model: "test",
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    messageUnderstanding: {}, intelligenceSafety: { level: "monitor", reason: "", requiresImmediateAction: false, shoppingSuppressed: false },
    learnings: [], careActions: [], semanticEvents: [],
    intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: false, usedMemories: false },
  };
}

function context(currentMessage) {
  return {
    currentMessage, pet: mani, eligiblePets: [mani], memories: [], careEntries: [],
    currentState: { state: { breathing: { status: "unknown" } } },
  };
}
