import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAuthoritativeTurnSubject, resolveDeterministicTurnSubject } from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { evaluateLearningPolicy } from "../app/lib/intelligence/memory-policy.ts";
import { governCanonicalEvents } from "../app/lib/intelligence/semantic-events.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";

const luna = { id: "pet-luna", name: "Luna", species: "dog", age_value: 5, age_unit: "years" };
const mani = { id: "pet-mani", name: "Mani", species: "cat", age_value: 4, age_unit: "years" };

test("an explicitly named selected pet bypasses ambiguous outside-animal preflight", () => {
  const message = "Mani has been restless since the male cat started coming to our door. She keeps meowing at the door.";
  assert.deepEqual(resolveDeterministicTurnSubject({ message, pets: [luna, mani], recentConversation: [], selectedPetId: mani.id }), {
    status: "resolved", petId: mani.id, petIds: [mani.id], reasonCode: null,
    requiresClarification: false, explicitSubject: true, confidence: 0.99,
  });
});
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
  assert.deepEqual(maniResult, { status: "resolved", petId: mani.id, petIds: [mani.id], reasonCode: null, requiresClarification: false, explicitSubject: true, confidence: 0.99 });

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

test("a selected same-species pet disambiguates an explicit species reference", () => {
  for (const surface of ["my cat", "the cat"]) {
    const message = `${surface} is restless`;
    const result = resolveAuthoritativeTurnSubject({
      frame: subjectFrame(message, surface, { species: "cat", ownership: "owner" }, "restless"),
      message, ownerId: "owner-1", pets: [luna, mani, poppy], recentConversation: [], selectedPetId: mani.id,
    });
    assert.equal(result.status, "resolved");
    assert.equal(result.petId, mani.id);
    assert.equal(result.requiresClarification, false);
  }
});

test("an explicit pet name remains authoritative over selected context", () => {
  const result = resolveAuthoritativeTurnSubject({
    frame: subjectFrame("Poppy is restless", "Poppy", { species: "cat", ownership: "owner" }, "restless"),
    message: "Poppy is restless", ownerId: "owner-1", pets: [luna, mani, poppy], recentConversation: [], selectedPetId: mani.id,
  });
  assert.equal(result.petId, poppy.id);
});

test("multiple compatible owned pets fail closed with clarification", () => {
  const result = resolve("my cat is vomiting", subjectFrame("my cat is vomiting", "my cat", { species: "cat", ownership: "owner" }, "vomiting"), [luna, mani, poppy]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("an explicit species with no owned match never falls back to the selected pet", () => {
  const result = resolve("my cat is vomiting", subjectFrame("my cat is vomiting", "my cat", { species: "cat", ownership: "owner" }, "vomiting"), [luna]);
  assert.equal(result.status, "unresolved");
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("pronouns use the selected conversation pet unless recent discourse names another pet", () => {
  const frame = subjectFrame("she is tired", "she", {}, "fatigue");
  const noAntecedent = resolve("she is tired", frame);
  assert.equal(noAntecedent.petId, luna.id);
  assert.equal(noAntecedent.requiresClarification, false);

  const withAntecedent = resolve("she is tired", frame, [luna, mani], [{ role: "user", text: "Mani was restless earlier" }]);
  assert.equal(withAntecedent.petId, mani.id);
});

test("casual conversation keeps selected pet as context without creating an alternate binding", () => {
  const frame = { ...subjectFrame("good morning", "good", {}, "greeting"), mentions: [], claims: [] };
  const result = resolve("good morning", frame);
  assert.deepEqual(result, { status: "contextual", petId: luna.id, petIds: [luna.id], reasonCode: null, requiresClarification: false, explicitSubject: false, confidence: 0.84 });
});

test("cross-user collisions and deleted pets are never candidates", () => {
  const frame = subjectFrame("Maple is vomiting", "Maple", {}, "vomiting");
  const result = resolve("Maple is vomiting", frame, [luna, mani]);
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("an explicit owned species resolves even if the model omitted the animal mention", () => {
  const empty = {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }], mentions: [], references: [], claims: [],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
  const result = resolve("My cat is vomiting.", empty);
  assert.equal(result.petId, mani.id);
  assert.equal(result.explicitSubject, true);
});

test("My cat is gay resolves Mani without authorizing a durable identity claim", () => {
  const message = "My cat is gay";
  const frame = subjectFrame(message, "My cat", { species: "cat", ownership: "owner" }, "sexual orientation");
  frame.claims[0] = {
    ...frame.claims[0],
    value: "gay",
    durability: "durable",
    persistenceHint: "pet_memory",
  };
  const subject = resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets: [luna, mani, poppy], recentConversation: [], selectedPetId: mani.id,
  });
  assert.equal(subject.petId, mani.id);
  assert.equal(subject.requiresClarification, false);

  const learning = {
    subjectType: "pet", subjectId: mani.id, category: "identity", factKey: "sexual_orientation", factValue: "gay",
    confidence: 0.99, importance: "medium", durability: "durable", action: "create", sourceExcerpt: message,
  };
  const learningDecision = evaluateLearningPolicy([learning], message, [mani.id]);
  assert.equal(learningDecision.accepted.length, 0);
  assert.equal(learningDecision.rejected[0].reason, "unsupported_pet_identity_claim");

  const eventDecision = governCanonicalEvents({
    proposals: [{
      subject: { type: "pet", name: mani.name }, domain: "profile", topic: "sexual_orientation", eventTitle: "Pet identity",
      transition: "confirmed", state: "historical", temporal: { occurredAt: null, explicitTime: null }, importance: "routine",
      confidence: 0.99, sourceExcerpt: message,
    }],
    message, resolvedPetSubject: mani, activeEpisodes: [],
  });
  assert.equal(eventDecision.accepted.length, 0);
  assert.equal(eventDecision.rejected[0].reason, "unsupported_pet_identity");

  const governed = governSemanticTurnV2({
    frame, sourceMessage: message, sourceMessageId: "message-1", ownerId: "owner-1", pets: [mani], activeEpisodes: [],
  });
  assert.equal(governed.acceptedClaims.length, 1);
  assert.equal(governed.acceptedClaims[0].subject.id, mani.id);
  assert.equal(governed.acceptedClaims[0].persistenceEligible, false);
  assert.equal(governed.acceptedClaims[0].persistenceDestination, "none");
  assert.deepEqual(governed.acceptedClaims[0].persistencePolicyReasons, ["unsupported_pet_identity_claim"]);
});

test("two named owned pets retain independent claim subjects while a selected third pet remains context only", () => {
  const milo = { ...luna, id: "pet-milo", name: "Milo" };
  const selected = { ...luna, id: "pet-selected", name: "Luna" };
  const message = "Milo likes salmon and Mani likes chicken.";
  const frame = multiPreferenceFrame(message, milo, mani, "salmon", "chicken");
  const result = resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets: [selected, milo, mani], recentConversation: [], selectedPetId: selected.id,
  });
  assert.equal(result.status, "multi_subject");
  assert.deepEqual(new Set(result.petIds), new Set([milo.id, mani.id]));
  assert.equal(result.petIds.includes(selected.id), false);
});

test("two owned pets remain independently resolvable when the model marks the turn ambiguous or mislabels persistence", () => {
  const milo = { ...luna, id: "pet-milo", name: "Milo" };
  const message = "Milo likes salmon but Luna likes chicken.";
  const frame = multiPreferenceFrame(message, milo, luna, "salmon", "chicken");
  frame.uncertainty = { needsClarification: true, clarificationQuestion: "Which pet?", reasons: ["model_uncertain"] };
  frame.claims = frame.claims.map((claim) => ({ ...claim, persistenceHint: "none" }));
  const result = resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets: [mani, milo, luna], recentConversation: [], selectedPetId: mani.id,
  });
  assert.deepEqual(result, {
    status: "multi_subject", petId: milo.id, petIds: [milo.id, luna.id], reasonCode: null,
    requiresClarification: false, explicitSubject: true, confidence: 0.99,
  });
});

test("three named owned pets retain all independently grounded subjects", () => {
  const milo = { ...luna, id: "pet-milo", name: "Milo" };
  const coco = { ...luna, id: "pet-coco", name: "Coco" };
  const message = "Milo likes turkey, Luna likes tuna, and Coco likes lamb.";
  const frame = multiPreferenceFrame(message, milo, luna, "turkey", "tuna");
  frame.mentions.push({
    localId: "animal_3", surface: "Coco", coarseType: "animal", confidence: 0.99,
    attributes: { species: coco.species, lifeStage: null, ownership: "owner" }, evidence: [{ surfaceText: "Coco" }],
  });
  frame.claims.push({
    localId: "claim_3", kind: "preference", subjectRef: "animal_3", predicate: concept("food preference"),
    polarity: "affirmed", modality: "asserted", temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
    uncertainty: { confidence: 0.98, reasons: [] }, evidence: [{ surfaceText: "Coco likes lamb" }], persistenceHint: "pet_memory",
    preference: "prefer", object: { concept: concept("food"), value: "lamb" }, constraints: [],
  });
  const result = resolveAuthoritativeTurnSubject({ frame, message, ownerId: "owner-1", pets: [milo, luna, coco], recentConversation: [], selectedPetId: luna.id });
  assert.deepEqual(result.petIds, [milo.id, luna.id, coco.id]);
  assert.equal(result.status, "multi_subject");
});

test("a partially unresolved multi-pet turn fails closed instead of using the selected pet", () => {
  const milo = { ...luna, id: "pet-milo", name: "Milo" };
  const message = "Milo likes salmon and Unknown likes chicken.";
  const frame = multiPreferenceFrame(message, milo, { ...mani, name: "Unknown", id: "unknown" }, "salmon", "chicken");
  const result = resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets: [luna, milo, mani], recentConversation: [], selectedPetId: luna.id,
  });
  assert.equal(result.petId, null);
  assert.equal(result.requiresClarification, true);
});

test("Ask keeps conversation binding separate while using the resolved turn pet for context and persistence", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.match(route, /conversationPetId: petId[\s\S]*petId: turnPetId/);
  assert.match(route, /persistAssistantAnswer\(\{[\s\S]*petId: turnPetId/);
  assert.match(route, /authoritativeSemanticFrame: subjectFrame/);
  assert.match(route, /resolveAuthoritativeTurnSubject/);
  assert.match(route, /requiresClarification[\s\S]*buildSubjectClarificationOrchestration/);
});

function concept(label) {
  return { label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] };
}

function multiPreferenceFrame(message, firstPet, secondPet, firstFood, secondFood) {
  const mentions = [firstPet, secondPet].map((pet, index) => ({
    localId: `animal_${index + 1}`, surface: pet.name, coarseType: "animal", confidence: 0.99,
    attributes: { species: pet.species, lifeStage: null, ownership: "owner" }, evidence: [{ surfaceText: pet.name }],
  }));
  const claims = [[firstFood, 0], [secondFood, 1]].map(([food, index]) => ({
    localId: `claim_${index + 1}`, kind: "preference", subjectRef: `animal_${index + 1}`,
    predicate: concept("food preference"), polarity: "affirmed", modality: "asserted",
    temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
    uncertainty: { confidence: 0.98, reasons: [] }, evidence: [{ surfaceText: `${index === 0 ? firstPet.name : secondPet.name} likes ${food}` }],
    persistenceHint: "pet_memory", preference: "prefer", object: { concept: concept("food"), value: food }, constraints: [],
  }));
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }], mentions, references: [], claims,
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}
