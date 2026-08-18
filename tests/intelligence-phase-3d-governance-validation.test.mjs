import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeProposedActions } from "../app/lib/intelligence/governance/authorize-actions.ts";
import { validateGeneratedAnswer } from "../app/lib/intelligence/validation/validate-answer.ts";

const care = (overrides = {}) => ({ action: "resolve_concern", category: "symptom", title: "Breathing returned to normal", details: "Owner reports Mani breathing is normal", severity: "routine", confidence: 0.99, relatedRecordId: "c", ...overrides });
const memory = (overrides = {}) => ({ subjectType: "pet", subjectId: "pet", category: "preference", factKey: "grooming", factValue: "brush", confidence: 0.95, importance: "medium", durability: "ongoing", action: "create", sourceExcerpt: "likes the brush", ...overrides });
const reasoning = (summary, overrides = {}) => ({ answer: { title: "Answer", summary, sections: [], safetyNote: null }, userIntent: "question", relevantContextIds: [], referencedRecords: [], safetyLevel: "normal", shoppingSuppressed: false, suggestedFollowUps: [], proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null }, responseMode: "conversational", model: "test", messageUnderstanding: {}, intelligenceSafety: { level: "routine", reason: "", requiresImmediateAction: false, shoppingSuppressed: false }, learnings: [], careActions: [], semanticEvents: [], intelligenceMetadata: { confidence: "high", usedPetContext: true, usedCareHistory: true, usedMemories: false }, ...overrides });
const context = (message, memories = []) => ({ currentMessage: message, pet: { id: "pet", name: "Mani" }, memories, careEntries: [], currentState: { state: { breathing: { status: "normal" } } } });

test("model proposal alone cannot write and explicit care evidence is accepted only by governance", () => {
  const result = authorizeProposedActions({ message: "Mani breathing is normal", petId: "pet", careActions: [care()], memories: [] });
  assert.equal(result.careActions[0].decision, "accepted");
});
test("unsupported diagnosis and medication dosage are rejected", () => {
  const result = authorizeProposedActions({ message: "she seems tired", petId: "pet", careActions: [care({ title: "Diagnosed infection", details: "Give 20 mg medication" })], memories: [] });
  assert.equal(result.careActions[0].reason, "unsupported_diagnosis");
});
test("ambiguous protected profile change is deferred", () => {
  const result = authorizeProposedActions({ message: "maybe Mani is female", petId: "pet", careActions: [], memories: [], profileChanges: [{ field: "sex", value: "female", confidence: 0.9, sourceExcerpt: "Mani is female" }] });
  assert.equal(result.profileChanges[0].decision, "deferred");
});
test("explicit low risk preference is accepted", () => assert.equal(authorizeProposedActions({ message: "Mani likes the brush", petId: "pet", careActions: [], memories: [memory()] }).memories[0].decision, "accepted"));
test("duplicate proposals are deduplicated", () => assert.equal(authorizeProposedActions({ message: "Mani breathing is normal", petId: "pet", careActions: [care(), care()], memories: [] }).careActions.length, 1));
test("wrong pet memory is rejected", () => assert.equal(authorizeProposedActions({ message: "likes the brush", petId: "pet", careActions: [], memories: [memory({ subjectId: "other" })] }).memories[0].reason, "wrong_pet"));
test("response subject validation rejects an owned pet outside the authoritative subject set", () => {
  const liveContext = { ...context("My cat is vomiting"), eligiblePets: [
    { id: "pet", name: "Mani" }, { id: "dog", name: "Milo" },
  ] };
  const invalid = validateGeneratedAnswer(reasoning("Urgent guidance for Milo."), liveContext, "urgent", ["pet"]);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, ["response_subject_disagreement"]);
  const explicitMulti = validateGeneratedAnswer(reasoning("Milo prefers salmon and Mani prefers chicken."), liveContext, "routine", ["pet", "dog"]);
  assert.equal(explicitMulti.valid, true);
});
test("answer validator removes persistence claims diagnostics and em dashes", () => {
  const result = validateGeneratedAnswer(reasoning("I saved that. requestId was internal — okay."), context("save it"), "routine");
  assert.doesNotMatch(result.response.answer.summary, /saved|requestId|—/i); assert.ok(result.repairs.length >= 2);
});
test("adaptive answer sections receive the same governance repairs as the summary", () => {
  const result = validateGeneratedAnswer(reasoning("Keep the routine steady.", {
    answer: {
      title: "Answer",
      summary: "Keep the routine steady.",
      sections: [{
        heading: "What I saved",
        items: ["I saved that. requestId was internal — okay.", "She is diagnosed with an infection."],
      }],
      safetyNote: null,
    },
  }), context("Mani seems restless"), "routine");
  assert.equal(result.valid, true);
  assert.deepEqual(result.response.answer.sections, []);
  assert.doesNotMatch(JSON.stringify(result.response.answer), /I saved|requestId|—|diagnosed with|\bshe\b/i);
});
test("unknown pronouns are neutralized and known pronouns are preserved", () => {
  assert.match(validateGeneratedAnswer(reasoning("She likes her brush."), context("grooming"), "routine").response.answer.summary, /Mani/);
  assert.match(validateGeneratedAnswer(reasoning("She likes her brush."), context("grooming", [{ fact_key: "pronouns" }]), "routine").response.answer.summary, /She/);
});
test("resolved breathing history does not dominate grooming", () => assert.doesNotMatch(validateGeneratedAnswer(reasoning("Mani's breathing was a concern. Brush gently."), context("What grooming brush?"), "routine").response.answer.summary, /breathing/i));
test("current urgent state forces urgent safety handling", () => assert.equal(validateGeneratedAnswer(reasoning("Call a vet now."), context("cannot breathe"), "urgent").response.safetyLevel, "urgent"));
test("governed recovery removes only stale unconditional escalation and retains return precautions", () => {
  const result = validateGeneratedAnswer(reasoning(
    "Contact an emergency veterinarian now. That's a good sign. If symptoms return, seek urgent care.",
    {
      answer: { title: "Urgent guidance for Mani", summary: "Contact an emergency veterinarian now. That's a good sign. If symptoms return, seek urgent care.", sections: [], safetyNote: null },
      safetyLevel: "urgent",
      shoppingSuppressed: true,
      responseMode: "urgent_safety",
      intelligenceSafety: { level: "recently_resolved", reason: "", requiresImmediateAction: true, shoppingSuppressed: true },
    },
  ), context("Mani seems normal now"), "recently_resolved");
  assert.equal(result.response.answer.summary, "That's a good sign. If symptoms return, seek urgent care.");
  assert.equal(result.response.answer.title, "It sounds like Mani is improving");
  assert.equal(result.response.safetyLevel, "monitor");
  assert.equal(result.response.responseMode, "practical_guidance");
  assert.equal(result.response.shoppingSuppressed, false);
  assert.equal(result.response.intelligenceSafety.requiresImmediateAction, false);
  assert.ok(result.repairs.includes("removed_stale_emergency_directive"));
});
test("governed recovery also removes stale unconditional escalation from adaptive sections", () => {
  const result = validateGeneratedAnswer(reasoning("That's a good sign.", {
    answer: {
      title: "It sounds like Mani is improving",
      summary: "That's a good sign.",
      sections: [{ heading: "What to do", items: ["Contact an emergency veterinarian now.", "Watch for symptoms returning."] }],
      safetyNote: null,
    },
  }), context("Mani seems normal now"), "recently_resolved");
  assert.deepEqual(result.response.answer.sections, [{ heading: "What to do", items: ["Watch for symptoms returning."] }]);
  assert.ok(result.repairs.includes("removed_stale_emergency_directive"));
});
test("emergency safety floors retain unconditional immediate escalation", () => {
  const result = validateGeneratedAnswer(reasoning("Contact an emergency veterinarian now. Keep Mani still."), context("Mani cannot breathe"), "emergency");
  assert.match(result.response.answer.summary, /^Contact an emergency veterinarian now\./);
  assert.equal(result.response.safetyLevel, "urgent");
});
test("unrecoverable empty answer fails validation and route releases credit", () => {
  assert.equal(validateGeneratedAnswer(reasoning("I saved that."), context("save"), "routine").valid, false);
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(creditReserved\) await safeReleaseAiCredit/);
});
test("governance metadata and service-only diagnostics are persisted securely", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260728110000_add_intelligence_governance.sql", import.meta.url), "utf8");
  assert.match(sql, /persistence_governance jsonb/); assert.match(sql, /INTEGRITY_DIAGNOSTIC_FORBIDDEN/);
  assert.match(sql, /grant execute on function public\.diagnose_furvise_integrity\(uuid\) to service_role/);
});
