import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAuthoritativeTurnSubject } from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const luna = { id: "pet-luna", name: "Luna", species: "dog", age_value: 5, age_unit: "years" };
const mani = { id: "pet-mani", name: "Mani", species: "cat", age_value: 4, age_unit: "years" };
const poppy = { id: "pet-poppy", name: "Poppy", species: "cat", age_value: 2, age_unit: "years" };

function subjectFrame(message, surface, attributes = {}, predicate = "symptom") {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions: [{
      localId: "animal_1", surface, coarseType: "animal", confidence: 0.98,
      attributes: { species: null, lifeStage: null, ownership: "unknown", ...attributes },
      evidence: [{ surfaceText: surface }],
    }],
    references: [],
    claims: [{
      localId: "claim_1", kind: "assertion", subjectRef: "animal_1",
      predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
      temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
      uncertainty: { confidence: 0.97, reasons: [] }, evidence: [{ surfaceText: message }],
      persistenceHint: "current_state", value: true, unit: null, durability: "temporary",
    }],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function resolve(message, frame, pets = [luna, mani], recentConversation = []) {
  return resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets, recentConversation, selectedPetId: luna.id,
  });
}

test("explicit unique names select an owned per-turn subject independently of the selected pet", () => {
  const maniResult = resolve("Mani is vomiting", subjectFrame("Mani is vomiting", "Mani", {}, "vomiting"));
  assert.deepEqual(maniResult, { status: "resolved", petId: mani.id, reasonCode: null, requiresClarification: false, explicitSubject: true, confidence: 0.99 });

  const lunaResult = resolveAuthoritativeTurnSubject({
    frame: subjectFrame("Luna is limping", "Luna", {}, "limping"), message: "Luna is limping", ownerId: "owner-1",
    pets: [luna, mani], recentConversation: [], selectedPetId: mani.id,
  });
  assert.equal(lunaResult.petId, luna.id);
});

test("a unique owned species excludes an incompatible selected pet", () => {
  const result = resolve("my cat is vomiting", subjectFrame("my cat is vomiting", "my cat", { species: "cat", ownership: "owner" }, "vomiting"));
  assert.equal(result.status, "resolved");
  assert.equal(result.petId, mani.id);
  assert.notEqual(result.petId, luna.id);
});

test("multiple compatible owned pets fail closed with clarification", () => {
  const result = resolve("my cat is vomiting", subjectFrame("my cat is vomiting", "my cat", { species: "cat", ownership: "owner" }, "vomiting"), [luna, mani, poppy]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("pronouns require discourse evidence and do not invent another pet", () => {
  const frame = subjectFrame("she is tired", "she", {}, "fatigue");
  const noAntecedent = resolve("she is tired", frame);
  assert.equal(noAntecedent.petId, null);
  assert.equal(noAntecedent.requiresClarification, true);

  const withAntecedent = resolve("she is tired", frame, [luna, mani], [{ role: "user", text: "Mani was restless earlier" }]);
  assert.equal(withAntecedent.petId, mani.id);
});

test("casual conversation keeps selected pet as context without creating an alternate binding", () => {
  const frame = { ...subjectFrame("good morning", "good", {}, "greeting"), mentions: [], claims: [] };
  const result = resolve("good morning", frame);
  assert.deepEqual(result, { status: "contextual", petId: luna.id, reasonCode: null, requiresClarification: false, explicitSubject: false, confidence: 0.84 });
});

test("cross-user collisions and deleted pets are never candidates", () => {
  const frame = subjectFrame("Maple is vomiting", "Maple", {}, "vomiting");
  const result = resolve("Maple is vomiting", frame, [luna, mani]);
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("Ask keeps conversation binding separate while using the resolved turn pet for context and persistence", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.match(route, /conversationPetId: petId[\s\S]*petId: turnPetId/);
  assert.match(route, /persistAssistantAnswer\(\{[\s\S]*petId: turnPetId/);
  assert.match(route, /resolveAuthoritativeTurnSubject/);
  assert.match(route, /requiresClarification[\s\S]*buildSubjectClarificationOrchestration/);
});

function concept(label) {
  return { label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] };
}
