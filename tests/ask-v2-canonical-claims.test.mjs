import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";
import { serializeGovernedSemanticTurnV2 } from "../app/lib/intelligence/v2/persistence/serialize.ts";
import { persistGovernedSemanticTurnV2Shadow } from "../app/lib/intelligence/v2/persistence/persist.ts";
import { verifyV2PersistenceUser } from "../app/lib/intelligence/v2/persistence/server-identity-core.ts";
import { selectPhase3LowRiskTurn } from "../app/lib/intelligence/v2/phase3/cutover-policy.ts";
import { planV2ProjectionRebuild, V2_PROJECTION_VERSIONS } from "../app/lib/intelligence/v2/projections/contracts.ts";
import { attachRegistryConceptPolicy } from "../app/lib/intelligence/v2/concepts/registry-policy.ts";
import { buildShadowSemanticAnalysis } from "../app/lib/intelligence/semantic-observability.ts";
import { projectGovernedPreferencesToLegacyMemories } from "../app/lib/intelligence/v2/projections/legacy-memory.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const pets = [
  { id: "10000000-0000-4000-8000-000000000011", name: "Luna", species: "dog", age_value: 5, age_unit: "years" },
  { id: "10000000-0000-4000-8000-000000000012", name: "Milo", species: "cat", age_value: 4, age_unit: "years" },
  { id: "10000000-0000-4000-8000-000000000013", name: "Poppy", species: "dog", age_value: 3, age_unit: "years" },
];

const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = (occurredAt = null, precision = "unknown") => ({ occurredAt, validFrom: null, validTo: null, surfaceText: null, precision });
const evidence = (surfaceText) => [{ surfaceText }];
const mention = (localId, surface, coarseType, attributes = {}) => ({
  localId, surface, coarseType,
  attributes: { species: null, lifeStage: null, ownership: "unknown", ...attributes },
  evidence: evidence(surface), confidence: 0.98,
});
const base = (localId, kind, subjectRef, predicate, surfaceText, persistenceHint) => ({
  localId, kind, subjectRef, predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
  temporal: temporal(), uncertainty: { confidence: 0.96, reasons: [] }, evidence: evidence(surfaceText), persistenceHint,
});
const preference = (localId, subjectRef, predicate, surfaceText, value, hint) => ({
  ...base(localId, "preference", subjectRef, predicate, surfaceText, hint), preference: "prefer",
  object: { concept: concept(predicate), value }, constraints: [],
});
const assertion = (localId, subjectRef, predicate, surfaceText, value, hint = "owner_memory") => ({
  ...base(localId, "assertion", subjectRef, predicate, surfaceText, hint),
  value, unit: null, durability: "durable",
});
const event = (localId, subjectRef, predicate, surfaceText, phase = "started", resultingState = "active") => ({
  ...base(localId, "event", subjectRef, predicate, surfaceText, "history"),
  participants: [{ role: "subject", entityRef: subjectRef }], lifecycle: { phase, boundedInMessage: false, resultingState },
});
const frame = (mentions, claims, references = [], uncertainty = { needsClarification: false, clarificationQuestion: null, reasons: [] }) => ({
  schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
  discourseActs: [{ kind: "statement", confidence: 0.99 }], mentions, references, claims, uncertainty,
});
const govern = (message, semanticFrame, options = {}) => governSemanticTurnV2({
  frame: semanticFrame, sourceMessage: message, sourceMessageId: "20000000-0000-4000-8000-000000000001",
  ownerId, pets, activeEpisodes: [], ...options,
});
const registryConcept = (key, conceptKind, lifecycleCapable = false) => attachRegistryConceptPolicy({
  key, version: "furvise.core.v1", conceptKind, lifecycleCapable,
});

test("v2 governs a multi-claim turn without legacy intelligence outputs", () => {
  const message = "Luna likes salmon and I prefer local stores";
  const result = govern(message, frame([
    mention("pet_1", "Luna", "animal"), mention("owner_1", "I", "person", { ownership: "owner" }),
  ], [
    preference("claim_pet", "pet_1", "salmon food", "Luna likes salmon", "salmon", "pet_memory"),
    preference("claim_owner", "owner_1", "retailer locality", "I prefer local stores", "local", "owner_memory"),
  ]));
  assert.equal(result.acceptedClaims.length, 2);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.type), ["pet", "owner"]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.conceptKey), ["salmon_food", "retailer_locality"]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.canonicalConceptKey), [null, null]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.conceptResolutionStatus), ["provisional", "provisional"]);
});

test("v2 resolves independent claims in a multi-pet turn", () => {
  const message = "Luna is limping and Milo prefers wet food";
  const result = govern(message, frame([
    mention("luna", "Luna", "animal"), mention("milo", "Milo", "animal"),
  ], [
    event("claim_luna", "luna", "limping", "Luna is limping"),
    preference("claim_milo", "milo", "wet food", "Milo prefers wet food", "wet", "pet_memory"),
  ]));
  assert.equal(result.acceptedClaims.length, 2);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.id), [pets[0].id, pets[1].id]);
});

test("multi-pet food preferences remain claim-local through governance and legacy projection", () => {
  const message = "Milo likes salmon and Luna likes chicken.";
  const result = govern(message, frame([
    mention("milo", "Milo", "animal"), mention("luna", "Luna", "animal"),
  ], [
    preference("claim_milo", "milo", "food preference", "Milo likes salmon", "salmon", "pet_memory"),
    preference("claim_luna", "luna", "food preference", "Luna likes chicken", "chicken", "pet_memory"),
  ]), {
    canonicalConcepts: [registryConcept("food_preference", "preference")],
  });
  const projected = projectGovernedPreferencesToLegacyMemories(result);
  assert.equal(result.rejectedClaims.length, 0);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.id), [pets[1].id, pets[0].id]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.groundedEvidence[0].quote), ["Milo likes salmon", "Luna likes chicken"]);
  assert.deepEqual(projected.map((learning) => learning.subjectId), [pets[1].id, pets[0].id]);
  assert.equal(projected.some((learning) => learning.subjectId === pets[2].id), false);
  assert.deepEqual(projected.map((learning) => learning.canonicalConceptKey), ["food_preference", "food_preference"]);
});

test("preference deduplication never merges distinct pet subjects or distinct food objects", () => {
  const sameFood = govern("Milo likes salmon and Luna likes salmon.", frame([
    mention("milo", "Milo", "animal"), mention("luna", "Luna", "animal"),
  ], [
    preference("milo_salmon", "milo", "food preference", "Milo likes salmon", "salmon", "pet_memory"),
    preference("luna_salmon", "luna", "food preference", "Luna likes salmon", "salmon", "pet_memory"),
  ]), { canonicalConcepts: [registryConcept("food_preference", "preference")] });
  const twoFoods = govern("Milo likes salmon and chicken.", frame([mention("milo", "Milo", "animal")], [
    preference("milo_salmon", "milo", "food preference", "Milo likes salmon", "salmon", "pet_memory"),
    preference("milo_chicken", "milo", "food preference", "chicken", "chicken", "pet_memory"),
  ]), { canonicalConcepts: [registryConcept("food_preference", "preference")] });
  assert.equal(projectGovernedPreferencesToLegacyMemories(sameFood).length, 2);
  assert.equal(projectGovernedPreferencesToLegacyMemories(twoFoods).length, 2);
  assert.notEqual(
    projectGovernedPreferencesToLegacyMemories(twoFoods)[0].factKey,
    projectGovernedPreferencesToLegacyMemories(twoFoods)[1].factKey,
  );
});

test("an unresolved named pet claim is rejected and never rebound to a selected pet", () => {
  const message = "Milo likes salmon and Mani likes chicken.";
  const result = govern(message, frame([
    mention("milo", "Milo", "animal"), mention("mani", "Mani", "animal"),
  ], [
    preference("milo_food", "milo", "food preference", "Milo likes salmon", "salmon", "pet_memory"),
    preference("mani_food", "mani", "food preference", "Mani likes chicken", "chicken", "pet_memory"),
  ]), { canonicalConcepts: [registryConcept("food_preference", "preference")] });
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.id), [pets[1].id]);
  assert.equal(result.rejectedClaims.length, 1);
  assert.equal(projectGovernedPreferencesToLegacyMemories(result).some((learning) => learning.subjectId === pets[0].id), false);
});

test("v2 supports owner preferences, pet preferences, and external relationships", () => {
  const message = "I prefer local stores, Luna avoids chicken, and my sister watches Luna";
  const relationship = {
    ...base("claim_relationship", "relationship", "sister", "pet caregiving", "my sister watches Luna", "relationship"),
    objectRef: "luna", qualifiers: [{ key: "role", value: "caregiver" }],
  };
  const result = govern(message, frame([
    mention("owner", "I", "person", { ownership: "owner" }), mention("luna", "Luna", "animal"),
    mention("sister", "my sister", "person", { ownership: "household" }),
  ], [
    preference("claim_owner", "owner", "retailer locality", "I prefer local stores", "local", "owner_memory"),
    { ...preference("claim_pet", "luna", "chicken", "Luna avoids chicken", "chicken", "pet_memory"), preference: "avoid" },
    relationship,
  ]));
  assert.equal(result.rejectedClaims.length, 0);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.claimKind), ["preference", "preference", "relationship"]);
  assert.equal(result.acceptedClaims[2].subject.resolution, "external");
  assert.deepEqual(result.acceptedClaims[2].resolvedEntities.map((entity) => entity.entityId), [pets[0].id]);
});

test("first-person preference roles bind the verified owner while arbitrary stores remain values", () => {
  for (const [message, store] of [
    ["I prefer shopping at Chewy.", "Chewy"],
    ["I prefer shopping at PetSmart.", "PetSmart"],
    ["My favorite store is X.", "X"],
  ]) {
    const storeMention = mention("store", store, "organization");
    const claim = preference("claim_store", "store", "preferred retailer", message, store, "owner_memory");
    const result = govern(message, frame([storeMention], [claim]), {
      canonicalConcepts: [{ key: "preferred_retailer", version: "furvise.core.v1" }],
    });
    assert.equal(result.rejectedClaims.length, 0);
    assert.equal(result.acceptedClaims[0].subject.type, "owner");
    assert.equal(result.acceptedClaims[0].subject.id, ownerId);
    assert.equal(result.acceptedClaims[0].structuredValue.object.value, store);
    assert.equal(result.acceptedClaims[0].groundedEvidence[0].quote, message);
    assert.equal(result.acceptedClaims[0].persistenceDestination, "owner_memory");
    const cutover = selectPhase3LowRiskTurn({
      turn: result,
      conceptPolicies: new Map([["preferred_retailer", { conceptKind: "preference", lifecycleCapable: false }]]),
      legacyLearnings: [{
        subjectType: "owner", subjectId: null, category: "preference", factKey: "preferred_retailer", factValue: store,
        confidence: 0.96, importance: "medium", durability: "durable", action: "create", sourceExcerpt: message,
      }],
      selectedPetId: pets[0].id,
    });
    assert.equal(cutover.accepted[0].claimClass, "owner_preference");
  }
});

test("governed preference concepts normalize model assertions before subject governance", () => {
  const ownerMessage = "I prefer shopping at Market Moon.";
  const ownerResult = govern(ownerMessage, frame([
    mention("store", "Market Moon", "organization"),
  ], [
    assertion("claim_owner_store", "store", "preferred retailer", ownerMessage, "Market Moon"),
  ]), {
    canonicalConcepts: [{
      key: "preferred_retailer", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
    }],
  });
  assert.equal(ownerResult.rejectedClaims.length, 0);
  assert.equal(ownerResult.acceptedClaims[0].proposed.kind, "assertion");
  assert.equal(ownerResult.acceptedClaims[0].claimKind, "preference");
  assert.equal(ownerResult.acceptedClaims[0].subject.type, "owner");
  assert.equal(ownerResult.acceptedClaims[0].subject.id, ownerId);
  assert.equal(ownerResult.acceptedClaims[0].structuredValue.object.value, "Market Moon");
  assert.equal(ownerResult.acceptedClaims[0].canonicalConceptKey, "preferred_retailer");
  assert.equal(ownerResult.acceptedClaims[0].persistenceDestination, "owner_memory");
  assert.equal(ownerResult.acceptedClaims[0].governanceMetadata.claimKindAuthority, "governed_concept");

  const petMessage = "Luna prefers bison food.";
  const petResult = govern(petMessage, frame([mention("luna", "Luna", "animal")], [
    assertion("claim_pet_food", "luna", "food preference", petMessage, "bison", "pet_memory"),
  ]), {
    canonicalConcepts: [{
      key: "food_preference", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
    }],
  });
  assert.equal(petResult.acceptedClaims[0].proposed.kind, "assertion");
  assert.equal(petResult.acceptedClaims[0].claimKind, "preference");
  assert.equal(petResult.acceptedClaims[0].subject.type, "pet");
  assert.equal(petResult.acceptedClaims[0].subject.id, pets[0].id);
  assert.equal(petResult.acceptedClaims[0].structuredValue.object.value, "bison");
  assert.equal(petResult.acceptedClaims[0].persistenceDestination, "pet_memory");

  const cutover = selectPhase3LowRiskTurn({
    turn: ownerResult,
    conceptPolicies: new Map([["preferred_retailer", { conceptKind: "preference", lifecycleCapable: false }]]),
    legacyLearnings: [{
      subjectType: "owner", subjectId: null, category: "preference", factKey: "preferred_retailer", factValue: "Market Moon",
      confidence: 0.96, importance: "medium", durability: "durable", action: "create", sourceExcerpt: ownerMessage,
    }],
    selectedPetId: pets[2].id,
  });
  assert.equal(cutover.accepted[0].claimClass, "owner_preference");
  assert.equal(cutover.accepted[0].claim.subject.id, ownerId);
});

test("registry semantic signatures canonicalize retailer wording independently of model labels", () => {
  const variations = [
    ["I prefer shopping at Chewy.", "Chewy", "prefer shopping at"],
    ["I normally buy from PetSmart.", "PetSmart", "normal purchase source"],
    ["My go-to store is ExampleStore.", "ExampleStore", "go to place"],
    ["I usually order from ExampleMerchant.", "ExampleMerchant", "ordering source"],
  ];
  for (const [message, merchant, proposedLabel] of variations) {
    const result = govern(message, frame([mention("merchant", merchant, "organization")], [
      assertion("claim_retailer", "merchant", proposedLabel, message, merchant),
    ]), {
      canonicalConcepts: [
        registryConcept("preferred_retailer", "preference"),
        registryConcept("food_preference", "preference"),
        registryConcept("weight", "profile"),
      ],
    });
    assert.equal(result.rejectedClaims.length, 0, message);
    const claim = result.acceptedClaims[0];
    assert.equal(claim.conceptKey, proposedLabel.replaceAll(" ", "_"), message);
    assert.equal(claim.canonicalConceptKey, "preferred_retailer", message);
    assert.equal(claim.conceptResolutionStatus, "canonical", message);
    assert.equal(claim.governanceMetadata.conceptResolutionMethod, "semantic_signature", message);
    assert.equal(claim.subject.type, "owner", message);
    assert.equal(claim.subject.id, ownerId, message);
    assert.equal(claim.claimKind, "preference", message);
    assert.equal(claim.structuredValue.object.value, merchant, message);
    assert.equal(claim.persistenceDestination, "owner_memory", message);
    const cutover = selectPhase3LowRiskTurn({
      turn: result,
      conceptPolicies: new Map([["preferred_retailer", { conceptKind: "preference", lifecycleCapable: false }]]),
      legacyLearnings: [{
        subjectType: "owner", subjectId: null, category: "preference", factKey: "preferred_retailer", factValue: merchant,
        confidence: 0.96, importance: "medium", durability: "durable", action: "create", sourceExcerpt: message,
      }],
      selectedPetId: pets[2].id,
    });
    assert.equal(cutover.accepted[0].claimClass, "owner_preference", message);
  }
});

test("registry signatures canonicalize pet food preferences and weight without crossing classes", () => {
  const foodMessage = "Luna prefers chicken food.";
  const food = govern(foodMessage, frame([mention("luna", "Luna", "animal")], [
    preference("claim_food", "luna", "favorite meals", foodMessage, "chicken", "pet_memory"),
  ]), { canonicalConcepts: [registryConcept("preferred_retailer", "preference"), registryConcept("food_preference", "preference")] });
  assert.equal(food.acceptedClaims[0].canonicalConceptKey, "food_preference");
  assert.equal(food.acceptedClaims[0].claimKind, "preference");
  assert.equal(food.acceptedClaims[0].subject.id, pets[0].id);

  const weightMessage = "Luna weighs 22 pounds.";
  const weightClaim = assertion("claim_weight", "luna", "body measurement", weightMessage, 22, "profile");
  weightClaim.unit = "pounds";
  const weight = govern(weightMessage, frame([mention("luna", "Luna", "animal")], [weightClaim]), {
    canonicalConcepts: [registryConcept("food_preference", "preference"), registryConcept("weight", "profile")],
  });
  assert.equal(weight.acceptedClaims[0].canonicalConceptKey, "weight");
  assert.equal(weight.acceptedClaims[0].claimKind, "assertion");
});

test("ambiguous registry signatures fail closed and medical concepts remain exact-only", () => {
  const message = "I usually order from Market Moon.";
  const ambiguous = govern(message, frame([mention("merchant", "Market Moon", "organization")], [
    assertion("claim_ambiguous", "merchant", "purchase habit", message, "Market Moon"),
  ]), {
    canonicalConcepts: [
      registryConcept("preferred_retailer", "preference"),
      {
        key: "preferred_marketplace", version: "test.v1", conceptKind: "preference", lifecycleCapable: false,
        semanticRole: "retailer_preference", selectionAuthority: "semantic_signature",
      },
    ],
  });
  assert.equal(ambiguous.acceptedClaims.length, 0);
  assert.equal(ambiguous.rejectedClaims[0].reason, "CONCEPT_AMBIGUOUS");

  const symptomMessage = "Luna is throwing up.";
  const symptom = govern(symptomMessage, frame([mention("luna", "Luna", "animal")], [
    assertion("claim_symptom", "luna", "throwing up", symptomMessage, true, "current_state"),
  ]), { canonicalConcepts: [registryConcept("vomiting", "symptom", true)] });
  assert.equal(symptom.acceptedClaims[0].canonicalConceptKey, null);
  assert.equal(symptom.acceptedClaims[0].conceptResolutionStatus, "provisional");
  assert.equal(symptom.acceptedClaims[0].claimKind, "assertion");
});

test("concept normalization does not turn organization facts or symptoms into preferences", () => {
  const organizationMessage = "Acme operates warehouses.";
  const organization = govern(organizationMessage, frame([mention("acme", "Acme", "organization")], [
    assertion("claim_org", "acme", "organization profile", organizationMessage, "warehouses"),
  ]), {
    canonicalConcepts: [{ key: "organization_profile", version: "test.v1", conceptKind: "profile", lifecycleCapable: false }],
  });
  assert.equal(organization.acceptedClaims[0].claimKind, "assertion");
  assert.equal(organization.acceptedClaims[0].subject.type, "organization");
  assert.equal(organization.acceptedClaims[0].persistenceEligible, false);

  const symptomMessage = "Luna is vomiting.";
  const symptom = govern(symptomMessage, frame([mention("luna", "Luna", "animal")], [
    assertion("claim_symptom", "luna", "vomiting", symptomMessage, true, "current_state"),
  ]), {
    canonicalConcepts: [{ key: "vomiting", version: "furvise.core.v1", conceptKind: "symptom", lifecycleCapable: true }],
  });
  assert.equal(symptom.acceptedClaims[0].claimKind, "assertion");
  assert.equal(symptom.acceptedClaims[0].governanceMetadata.claimKindAuthority, "model_structure");
});

test("semantic role repair does not hijack pet preferences, relationships, or third-party facts", () => {
  const message = "Luna prefers chicken food. My sister helps take care of Luna. Acme prefers wholesale orders.";
  const relationship = {
    ...base("claim_relationship", "relationship", "sister", "caregiver relationship", "My sister helps take care of Luna", "relationship"),
    objectRef: "luna", qualifiers: [{ key: "role", value: "caregiver" }],
  };
  const thirdParty = preference("claim_acme", "acme", "ordering preference", "Acme prefers wholesale orders", "wholesale", "owner_memory");
  const result = govern(message, frame([
    mention("luna", "Luna", "animal"),
    mention("sister", "My sister", "person", { ownership: "household" }),
    mention("acme", "Acme", "organization"),
  ], [
    preference("claim_luna", "luna", "food preference", "Luna prefers chicken food", "chicken", "pet_memory"),
    relationship,
    thirdParty,
  ]));
  assert.equal(result.acceptedClaims[0].subject.type, "pet");
  assert.equal(result.acceptedClaims[0].subject.id, pets[0].id);
  assert.equal(result.acceptedClaims[1].claimKind, "relationship");
  assert.equal(result.acceptedClaims[1].subject.type, "person");
  assert.equal(result.acceptedClaims[2].subject.type, "organization");
  assert.equal(result.acceptedClaims[2].subject.id, null);
  assert.equal(result.acceptedClaims[2].persistenceEligible, false);
});

test("v2 creates explicit correction and retraction relations", () => {
  const message = "I prefer local stores; actually online stores; forget that preference";
  const original = preference("claim_original", "owner", "retailer locality", "I prefer local stores", "local", "owner_memory");
  const replacement = preference("claim_replacement", "owner", "retailer locality", "actually online stores", "online", "owner_memory");
  const correction = {
    ...base("claim_correct", "correction", "owner", "retailer locality", "actually online stores", "owner_memory"),
    operation: "replace", target: { claimRef: "claim_original", subjectRef: "owner", predicate: concept("retailer locality"), value: "local" },
    replacementClaimRef: "claim_replacement",
  };
  const retraction = {
    ...base("claim_retract", "correction", "owner", "retailer locality", "forget that preference", "owner_memory"),
    operation: "retract", target: { claimRef: "claim_replacement", subjectRef: "owner", predicate: concept("retailer locality"), value: "online" },
    replacementClaimRef: null,
  };
  const result = govern(message, frame([mention("owner", "I", "person", { ownership: "owner" })], [original, replacement, correction, retraction]));
  assert.equal(result.acceptedClaims.length, 4);
  assert.deepEqual(result.acceptedClaims.slice(2).map((claim) => claim.operationType), ["correct", "retract"]);
  assert.deepEqual(result.relations.map((relation) => ({ from: relation.fromLocalClaimKey, to: relation.toLocalClaimKey, type: relation.relationType })), [
    { from: "claim_correct", to: "claim_original", type: "corrects" },
    { from: "claim_retract", to: "claim_replacement", type: "retracts" },
  ]);
});

test("v2 resolves prior-claim corrections only through server-owned targets", () => {
  const message = "Actually I prefer online stores";
  const correction = {
    ...base("claim_correct", "correction", "owner", "retailer locality", message, "history"),
    operation: "replace", target: { claimRef: "prior_pref", subjectRef: "owner", predicate: concept("retailer locality"), value: "local" },
    replacementClaimRef: null,
  };
  const unresolved = govern(message, frame([mention("owner", "I", "person", { ownership: "owner" })], [correction]));
  assert.equal(unresolved.rejectedClaims[0].reason, "CORRECTION_TARGET_UNRESOLVED");
  const governed = govern(message, frame([mention("owner", "I", "person", { ownership: "owner" })], [correction]), {
    previousClaimTargets: { prior_pref: { claimId: "60000000-0000-4000-8000-000000000001", subjectId: ownerId, conceptKey: "retailer_locality" } },
  });
  assert.equal(governed.relations[0].toLocalClaimKey, null);
  assert.equal(governed.relations[0].toClaimId, "60000000-0000-4000-8000-000000000001");
});

test("v2 requires exact governed concept identity for terminal lifecycle binding", () => {
  const openingMessage = "Luna started limping";
  const opening = govern(openingMessage, frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", openingMessage)]));
  assert.equal(opening.acceptedClaims[0].lifecycleRole, "opening");
  assert.equal(opening.acceptedClaims[0].serverEpisodeId, null);

  const recoveryMessage = "Luna is no longer limping";
  const recoveryClaim = {
    ...base("claim_recovery", "state_transition", "luna", "limping", recoveryMessage, "current_state"),
    transition: "resolved", fromState: "active", toState: "resolved", targetConcept: concept("limping"),
  };
  const activeEpisode = {
    id: "30000000-0000-4000-8000-000000000001", pet_profile_id: pets[0].id, normalized_key: "health_limping",
    episode_type: "symptom", status: "active", sequence_number: 1, recurrence_of: null,
    started_at: "2026-08-10T00:00:00.000Z", last_event_at: "2026-08-10T00:00:00.000Z", resolved_at: null,
  };
  const lexicalOnly = govern(recoveryMessage, frame([mention("luna", "Luna", "animal")], [recoveryClaim]), { activeEpisodes: [activeEpisode] });
  assert.equal(lexicalOnly.rejectedClaims[0].reason, "LIFECYCLE_INCOMPATIBLE");

  const recovery = govern(recoveryMessage, frame([mention("luna", "Luna", "animal")], [recoveryClaim]), {
    activeEpisodes: [{ ...activeEpisode, normalized_key: "limping" }],
    canonicalConcepts: [{ key: "limping", version: "health-concepts.v1" }],
    episodeConcepts: [{ episodeId: activeEpisode.id, key: "limping", version: "health-concepts.v1", status: "canonical" }],
  });
  assert.equal(recovery.rejectedClaims.length, 0);
  assert.equal(recovery.acceptedClaims[0].lifecycleRole, "resolution");
  assert.equal(recovery.acceptedClaims[0].serverEpisodeId, activeEpisode.id);
});

test("deterministic persistence ignores model hints and reports disagreements", () => {
  const message = "Luna likes salmon and I prefer local stores";
  const result = govern(message, frame([
    mention("luna", "Luna", "animal"), mention("owner", "I", "person", { ownership: "owner" }),
  ], [
    preference("pet_pref", "luna", "salmon", "Luna likes salmon", "salmon", "none"),
    preference("owner_pref", "owner", "retailer locality", "I prefer local stores", "local", "history"),
  ]));
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.persistenceDestination), ["pet_memory", "owner_memory"]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.proposedPersistenceHint), ["none", "history"]);
});

test("server identity verification and service RPC invocation use distinct authority", async () => {
  const calls = [];
  const verifier = { auth: { getUser: async (token) => {
    calls.push(["verify", token]);
    return { data: { user: token === "valid-access-token" ? { id: ownerId } : null }, error: null };
  } } };
  const verifiedUserId = await verifyV2PersistenceUser("valid-access-token", verifier);
  const governed = govern("Luna likes salmon", frame([mention("luna", "Luna", "animal")], [
    preference("claim_1", "luna", "salmon", "Luna likes salmon", "salmon", "none"),
  ]));
  const serviceClient = { rpc: async (name, args) => { calls.push([name, args]); return { data: { ok: true }, error: null }; } };
  await persistGovernedSemanticTurnV2Shadow({
    serviceClient, verifiedUserId, turn: governed, sourceMessage: "Luna likes salmon",
    idempotencyKey: "40000000-0000-4000-8000-000000000001",
  });
  assert.equal(calls[1][0], "persist_governed_semantic_turn_v2");
  assert.equal(calls[1][1].p_verified_user_id, ownerId);
  assert.equal("user_id" in calls[1][1].p_governed_turn, false);
  await assert.rejects(() => verifyV2PersistenceUser("bad-token", verifier), /V2_AUTH_INVALID/);
});

test("v2 fails closed for ambiguous pets even when one is selected elsewhere", () => {
  const message = "My dog is tired";
  const result = govern(message, frame([
    mention("dog", "My dog", "animal", { species: "dog", ownership: "owner" }),
  ], [event("claim_1", "dog", "fatigue", message)]));
  assert.equal(result.acceptedClaims.length, 0);
  assert.equal(result.rejectedClaims[0].reason, "ENTITY_AMBIGUOUS");
  assert.equal(result.needsClarification, true);
});

test("v2 cannot bind a claim to a pet outside the owned candidate set", () => {
  const message = "Private pet is tired";
  const result = govern(message, frame([
    mention("private_pet", "Private pet", "animal"),
  ], [event("claim_private", "private_pet", "fatigue", message)]));
  assert.equal(result.acceptedClaims.length, 0);
  assert.equal(result.rejectedClaims[0].reason, "ENTITY_UNRESOLVED");
});

test("v2 rejects evidence tampering and serializes trusted fields only", () => {
  const message = "Luna likes salmon";
  const semanticFrame = frame([mention("luna", "Luna", "animal")], [
    preference("claim_1", "luna", "salmon", "invented excerpt", "salmon", "pet_memory"),
  ]);
  const rejected = govern(message, semanticFrame);
  assert.equal(rejected.rejectedClaims[0].reason, "EVIDENCE_NOT_FOUND");

  semanticFrame.claims[0].evidence = evidence(message);
  const accepted = govern(message, semanticFrame);
  const payload = serializeGovernedSemanticTurnV2(accepted, message);
  assert.equal(payload.claims[0].subject_id, pets[0].id);
  assert.equal("user_id" in payload.claims[0], false);
  assert.deepEqual(payload.claims[0].grounded_evidence[0], { start: 0, end: message.length, excerpt: message, alignment: "exact" });
});

test("persistence evidence offsets use Unicode scalar positions", () => {
  const message = "🐾 Luna likes salmon";
  const governed = govern(message, frame([mention("luna", "Luna", "animal")], [
    preference("claim_1", "luna", "salmon", "Luna likes salmon", "salmon", "pet_memory"),
  ]));
  const payload = serializeGovernedSemanticTurnV2(governed, message);
  assert.deepEqual(payload.claims[0].grounded_evidence[0], {
    start: 2, end: 19, excerpt: "Luna likes salmon", alignment: "exact",
  });
});

test("projection plans are deterministic and explicitly versioned", () => {
  const message = "Luna started limping";
  const governed = govern(message, frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", message)]));
  const first = planV2ProjectionRebuild(governed.acceptedClaims);
  const second = planV2ProjectionRebuild([...governed.acceptedClaims].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.bundleVersion, V2_PROJECTION_VERSIONS.bundle);
  assert.deepEqual(first.records.map((record) => record.projection), ["history", "episodes", "concerns", "currentState"]);
});

test("shadow observability compares legacy and v2 without retaining message reasoning", () => {
  const message = "Luna started limping";
  const semanticFrame = frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", message)]);
  const analysis = buildShadowSemanticAnalysis({
    activeEpisodes: [], acceptedCareActions: [], acceptedLearnings: [], acceptedSemanticEvents: [],
    conversationTurns: [], eligiblePets: pets, frame: semanticFrame, message, ownerId,
    requestId: "v2-observation", selectedPetId: pets[1].id,
    sourceMessageId: "20000000-0000-4000-8000-000000000001",
    reasoning: { model: "test", semanticFrameValid: true, messageUnderstanding: { needsClarification: false } },
  });
  assert.equal(analysis.trace.v2.status, "governed");
  assert.equal(analysis.trace.v2.observation.proposedClaimCount, 1);
  assert.equal(analysis.trace.v2.observation.governedClaimCount, 1);
  assert.equal(analysis.trace.v2.observation.lifecycle[0].role, "opening");
  assert.equal(analysis.trace.v2.legacyComparison.claimCountDelta, 1);
  assert.equal(analysis.trace.subjectIntegrity.agrees, false);
  assert.deepEqual(analysis.trace.subjectIntegrity.reasonCodes, ["V2_SUBJECT_DISAGREEMENT"]);
  assert.equal(JSON.stringify(analysis.trace.v2).includes(message), false);
  assert.equal(JSON.stringify(analysis.trace.v2).toLowerCase().includes("chain-of-thought"), false);
});

test("Phase 1 does not wire v2 persistence into production Ask", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /persistGovernedSemanticTurnV2Shadow|persist_governed_semantic_turn_v2/);
  const runIntelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runIntelligence, /persistGovernedSemanticTurnV2Shadow|persist_governed_semantic_turn_v2/);
});

test("migration establishes append-only, service-only, same-tenant claim persistence", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260811150000_add_ask_v2_semantic_claims_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.semantic_claims/);
  assert.match(sql, /create table if not exists public\.semantic_claim_relations/);
  assert.match(sql, /foreign key \(from_claim_id, user_id\)[\s\S]*foreign key \(to_claim_id, user_id\)/);
  assert.match(sql, /add column if not exists claim_id uuid/);
  assert.match(sql, /num_nonnulls\(care_entry_id, claim_id\) = 1/);
  assert.match(sql, /create or replace function public\.persist_governed_semantic_turn_v2/);
  assert.match(sql, /p_verified_user_id uuid[\s\S]*v_user_id uuid := p_verified_user_id/);
  assert.doesNotMatch(sql, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /message_row\.user_id = v_user_id[\s\S]*message_row\.role = 'user'/);
  assert.match(sql, /pet\.id = v_subject_id and pet\.user_id = v_user_id/);
  assert.match(sql, /Grounded evidence does not match source message/);
  assert.match(sql, /source_message_id uuid references public\.ask_conversation_messages\(id\) on delete set null/);
  assert.match(sql, /source_message_lineage_id uuid not null/);
  assert.match(sql, /concept_resolution_status[\s\S]*provisional[\s\S]*canonical/);
  assert.match(sql, /prevent_semantic_claim_relation_cycle/);
  assert.doesNotMatch(sql, /\.endsWith|ends_with/i);
  assert.match(sql, /octet_length\(p_governed_turn::text\) > 131072/);
  assert.match(sql, /v_claim_count > 32/);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*turn_payload_hash/);
  assert.match(sql, /grant execute on function public\.persist_governed_semantic_turn_v2[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.persist_governed_semantic_turn_v2[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*semantic_claims.*authenticated/i);
  assert.doesNotMatch(sql, /insert into public\.semantic_claims[\s\S]*select .*pet_care_entries/i);
});
