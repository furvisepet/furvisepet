import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeConceptLabel } from "../app/lib/intelligence/concepts/normalize-concept.ts";
import { resolveProvisionalConcept } from "../app/lib/intelligence/concepts/provisional-concepts.ts";
import { buildShadowSemanticAnalysis } from "../app/lib/intelligence/semantic-observability.ts";
import { alignEvidenceFragments } from "../app/lib/intelligence/semantic-frame/ground-evidence.ts";
import { normalizeClaimKind } from "../app/lib/intelligence/semantic-frame/normalize-claim-kind.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const pets = [
  { id: "pet-luna", name: "Luna", species: "dog", age_value: 5, age_unit: "years" },
  { id: "pet-poppy", name: "Poppy", species: "dog", age_value: 8, age_unit: "months" },
];
const concept = (label, aliases = [], parentLabels = [], relatedLabels = []) => ({ label, definition: null, aliases, parentLabels, relatedLabels });
const evidence = (surfaceText) => [{ surfaceText }];
const temporal = (surfaceText = null, precision = "unknown") => ({ occurredAt: null, validFrom: null, validTo: null, surfaceText, precision });
const uncertainty = { confidence: 0.97, reasons: [] };
const mention = (localId, surface, coarseType, attributes = {}) => ({
  localId, surface, coarseType, attributes: { species: null, lifeStage: null, ownership: "unknown", ...attributes }, evidence: evidence(surface), confidence: 0.98,
});
const base = (localId, kind, subjectRef, predicate, surfaceText, persistenceHint) => ({
  localId, kind, subjectRef, predicate, polarity: "affirmed", modality: "asserted", temporal: temporal(), uncertainty, evidence: evidence(surfaceText), persistenceHint,
});
const event = (localId, subjectRef, predicate, surfaceText, phase = "observed", resultingState = "historical") => ({
  ...base(localId, "event", subjectRef, predicate, surfaceText, "history"), participants: subjectRef ? [{ role: "subject", entityRef: subjectRef }] : [],
  lifecycle: { phase, boundedInMessage: resultingState === "resolved", resultingState },
});
const assertion = (localId, subjectRef, predicate, surfaceText, value, persistenceHint = "pet_memory") => ({
  ...base(localId, "assertion", subjectRef, predicate, surfaceText, persistenceHint), value, unit: null, durability: "durable",
});
const preference = (localId, subjectRef, predicate, surfaceText, value, persistenceHint) => ({
  ...base(localId, "preference", subjectRef, predicate, surfaceText, persistenceHint), preference: "limit", object: { concept: predicate, value }, constraints: [],
});
const frame = (mentions, claims, references = [], discourseActs = [{ kind: "statement", confidence: 0.99 }]) => ({
  schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1", discourseActs, mentions, references, claims,
  uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
});
const reference = (localId, surface, mentionRef) => ({ localId, surface, kind: "pronoun", mentionRef, antecedentRefs: [], confidence: 0.95 });
const activeMissingEpisode = {
  id: "episode-1", normalized_key: "safety_missing_pet", status: "active", summary: { semanticTopic: "missing_pet", semanticDomain: "safety" },
  last_event_at: "2026-08-10T00:00:00.000Z", linked_concern_id: null,
};

function analyze(message, semanticFrame, options = {}) {
  return buildShadowSemanticAnalysis({
    activeEpisodes: options.activeEpisodes || [], acceptedCareActions: options.acceptedCareActions || [], acceptedLearnings: options.acceptedLearnings || [],
    acceptedSemanticEvents: options.acceptedSemanticEvents || [], conversationTurns: options.conversationTurns || [], eligiblePets: pets, frame: semanticFrame,
    message, ownerId: "owner-1", requestId: `trace-${options.trace || "fixture"}`, selectedPetId: options.selectedPetId || "pet-luna",
    sourceMessageId: "message-1", reasoning: { model: "fixture", semanticFrameValid: true, messageUnderstanding: { needsClarification: false } },
  });
}

test("server grounding owns offsets and supports safe normalization, repeats, and multiple spans", () => {
  const source = "Café\tfood — changed yesterday; itchy today, itchy yesterday.";
  const normalized = alignEvidenceFragments([{ surfaceText: "Cafe\u0301 food changed yesterday" }], source);
  assert.equal(normalized.failures.length, 0);
  assert.equal(normalized.grounded[0].alignment, "normalized");
  assert.equal(source.slice(normalized.grounded[0].start, normalized.grounded[0].end), normalized.grounded[0].quote);

  const repeated = alignEvidenceFragments([{ surfaceText: "itchy" }, { surfaceText: "itchy" }], source);
  assert.equal(repeated.failures.length, 0);
  assert.deepEqual(repeated.grounded.map((item) => item.quote), ["itchy", "itchy"]);
  assert.equal(alignEvidenceFragments([{ surfaceText: "itchy" }], source).failures[0].reason, "EVIDENCE_AMBIGUOUS");

  const multiple = alignEvidenceFragments([{ surfaceText: "Café" }, { surfaceText: "today" }], source);
  assert.equal(multiple.grounded.filter(Boolean).length, 2);
  assert.equal(alignEvidenceFragments([{ surfaceText: "not present" }], source).failures[0].reason, "EVIDENCE_NOT_FOUND");
});

test("claim kinds are normalized by structure and the prompt defines the generic distinctions", () => {
  const message = "Something happened";
  const claims = [
    assertion("claim_assertion", null, concept("measurement"), message, 1),
    event("claim_event", null, concept("occurrence"), message),
    { ...base("claim_transition", "state_transition", null, concept("recovery"), message, "current_state"), transition: "resolved", fromState: "active", toState: "resolved", targetConcept: concept("prior state") },
    preference("claim_preference", null, concept("budget"), message, 60, "owner_memory"),
    { ...base("claim_relationship", "relationship", "person_1", concept("caregiving"), message, "relationship"), objectRef: "animal_1", qualifiers: [] },
    { ...base("claim_correction", "correction", null, concept("correction"), message, "none"), operation: "retract", target: { claimRef: null, subjectRef: null, predicate: concept("prior fact"), value: null }, replacementClaimRef: null },
  ];
  assert.deepEqual(claims.map((claim) => normalizeClaimKind(claim).structuralKind), ["assertion", "event", "state_transition", "preference", "relationship", "correction"]);
  assert.ok(claims.every((claim) => normalizeClaimKind(claim).consistent));
  const source = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.match(source, /Choose SemanticFrame claim kinds by structure, not keywords/);
  assert.doesNotMatch(source, /if .*runaway|if .*vomit|if .*good morning/i);
});

test("concept identity requires lexical or declared alias evidence plus threshold and margin", () => {
  const records = [{ key: "missing_pet", label: "missing pet", aliases: [], source: "active_episode" }];
  const resolved = resolveProvisionalConcept(concept("ran away", ["missing pet"]), records);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.canonicalKey, "missing_pet");
  const related = resolveProvisionalConcept(concept("food reaction"), [{ key: "food_sensitivity", label: "food sensitivity", aliases: [], source: "production_event" }]);
  assert.equal(related.status, "provisional");
  assert.equal(related.relation, "related");
  const ambiguous = resolveProvisionalConcept(concept("pet escaped", ["missing pet", "escaped pet"]), [
    ...records, { key: "escaped_pet", label: "escaped pet", aliases: [], source: "production_event" },
  ]);
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(normalizeConceptLabel("Food—Changed"), "food_changed");
});

test("comparison telemetry resolves semantic identity while retaining legacy exact-key diagnostics", () => {
  const message = "Luna ran away";
  const claim = event("claim_1", "animal_1", concept("ran away", ["missing pet"]), message, "started", "active");
  claim.persistenceHint = "current_state";
  const productionEvent = {
    event: {
      subject: { type: "pet", name: "Luna", id: "pet-luna" }, domain: "safety", topic: "missing_pet", normalizedTopic: "missing_pet",
      eventTitle: "Luna ran away", transition: "started", state: "active", temporal: { occurredAt: null, explicitTime: null }, importance: "urgent",
      confidence: 0.99, sourceExcerpt: message, references: { priorEventIds: [], episodeId: null, concernId: null },
    },
    destination: "episode_current_state", destinations: ["care_event", "episode_current_state"],
  };
  const result = analyze(message, frame([mention("animal_1", "Luna", "animal")], [claim]), { acceptedSemanticEvents: [productionEvent] });
  assert.equal(result.trace.comparison.conceptDisagreement, true);
  assert.equal(result.trace.comparison.resolvedConceptAgreement, true);
  assert.equal(result.trace.comparison.semanticRelationAgreement, true);
  assert.equal(result.trace.comparison.claimKindAgreement, true);
  assert.equal(result.trace.comparison.subjectBindingAgreement, true);
  assert.equal(result.trace.comparison.proposedDestinationAgreement, true);
  assert.equal(result.trace.comparison.productionSemanticOutputCount, 1);
  assert.equal(result.trace.comparison.shadowAcceptedClaimCount, 1);
  assert.deepEqual(result.trace.comparison.rejectedClaimCountsByReason, {});
});

test("explicit species contradictions fail closed even when the dog is selected", () => {
  const message = "My cat is vomiting";
  const semanticFrame = frame(
    [mention("animal_1", "My cat", "animal", { species: "cat", ownership: "owner" })],
    [event("claim_1", "animal_1", concept("vomiting"), message, "started", "active")],
  );
  const result = analyze(message, semanticFrame);
  assert.equal(result.trace.entityBindings[0].reasonCode, "ENTITY_SPECIES_CONFLICT");
  assert.equal(result.trace.clarification.shadow, true);
  assert.deepEqual(result.trace.shadowDestinations, []);
  assert.equal(result.trace.evidenceGrounding.grounded, 2);
});

test("pronouns require a recent user antecedent and can resolve a compatible active transition", () => {
  const message = "I found her";
  const transition = {
    ...base("claim_1", "state_transition", "animal_1", concept("returned home", ["missing pet"]), message, "current_state"),
    transition: "resolved", fromState: "missing", toState: "safe", targetConcept: concept("returned home", ["missing pet"]),
  };
  const semanticFrame = frame(
    [mention("owner_1", "I", "person", { ownership: "owner" }), mention("animal_1", "her", "animal")], [transition], [reference("reference_1", "her", "animal_1")],
  );
  const noAntecedent = analyze(message, semanticFrame, { activeEpisodes: [activeMissingEpisode], selectedPetId: "pet-poppy" });
  assert.equal(noAntecedent.trace.clarification.shadow, true);
  assert.deepEqual(noAntecedent.trace.shadowDestinations, []);
  const withAntecedent = analyze(message, semanticFrame, {
    activeEpisodes: [activeMissingEpisode], selectedPetId: "pet-poppy", conversationTurns: [
      { role: "furvise", text: "Luna may need help" }, { role: "user", text: "Luna ran away" },
    ],
  });
  assert.equal(withAntecedent.trace.entityBindings.find((item) => item.mentionId === "animal_1").binding.startsWith("pet:"), true);
  assert.equal(withAntecedent.trace.clarification.shadow, false);
  assert.deepEqual(withAntecedent.trace.shadowDestinations, ["care_event", "episode_current_state"]);
});

test("casual conversation does not inherit an unrelated active medical event", () => {
  const message = "good morning";
  const semanticFrame = frame([], [], [], [{ kind: "acknowledgement", confidence: 0.99 }]);
  const result = analyze(message, semanticFrame, { activeEpisodes: [{ ...activeMissingEpisode, normalized_key: "health_vomiting", summary: { semanticTopic: "vomiting", semanticDomain: "health" } }] });
  assert.equal(result.trace.comparison.shadowProposedClaimCount, 0);
  assert.deepEqual(result.trace.shadowDestinations, []);
  assert.equal(result.trace.clarification.shadow, false);
});

test("valid multi-claim evidence survives grounding with separate destinations", () => {
  const message = "I changed Luna's food yesterday because chicken makes her itchy and I don't want to spend more than $60 a month.";
  const food = event("claim_food", "animal_1", concept("food change", ["food changed"]), "changed Luna's food yesterday", "completed", "historical");
  food.temporal = temporal("yesterday", "day");
  const itchy = assertion("claim_itch", "animal_1", concept("chicken sensitivity", [], ["food sensitivity"]), "chicken makes her itchy", true, "pet_memory");
  const budget = preference("claim_budget", "owner_1", concept("monthly pet spending"), "I don't want to spend more than $60 a month", 60, "owner_memory");
  budget.constraints = [{ dimension: "cost", operator: "lte", value: 60, unit: "USD", period: "month" }];
  const semanticFrame = frame([
    mention("owner_1", "I don't", "person", { ownership: "owner" }), mention("animal_1", "Luna", "animal"),
  ], [food, itchy, budget]);
  const result = analyze(message, semanticFrame);
  assert.deepEqual(result.trace.evidenceGrounding, { total: 5, grounded: 5, exact: 5, normalized: 0, failuresByReason: {} });
  assert.equal(result.trace.comparison.shadowProposedClaimCount, 3);
  assert.equal(result.trace.comparison.shadowAcceptedClaimCount, 3);
  assert.equal(result.trace.comparison.shadowRejectedClaimCount, 0);
  assert.deepEqual(result.trace.shadowDestinations.sort(), ["care_event", "owner_memory", "pet_memory"]);
});

test("the labeled twelve-case replay has complete grounding and no false persistence proposals", () => {
  const fixtures = twelveCaseReplay();
  const results = fixtures.map((fixture) => ({ fixture, analysis: analyze(fixture.message, fixture.frame, fixture.options) }));
  const totalEvidence = results.reduce((sum, item) => sum + item.analysis.trace.evidenceGrounding.total, 0);
  const groundedEvidence = results.reduce((sum, item) => sum + item.analysis.trace.evidenceGrounding.grounded, 0);
  assert.equal(results.length, 12);
  assert.equal(groundedEvidence, totalEvidence);
  assert.ok(results.every((item) => item.analysis.trace.frameStatus === "valid"));
  assert.ok(results.every((item) => item.analysis.trace.comparison.shadowProposedClaimCount === item.fixture.expectedClaims));
  assert.ok(results.every((item) => assertEntityLabels(item.analysis.trace.entityBindings, item.fixture.expectedEntities)));
  assert.ok(results.filter((item) => !item.fixture.shouldPersist).every((item) => item.analysis.trace.shadowDestinations.length === 0));
  assert.ok(results.every((item) => item.analysis.trace.clarification.shadow === item.fixture.shouldClarify));
});

function twelveCaseReplay() {
  const runaway = "Luna ran away";
  const found = "I found her";
  const cat = "My cat is vomiting";
  const weight = "Actually Luna weighs 58 pounds";
  const dislike = "She hates chicken treats";
  const food = "I changed her food yesterday";
  const budget = "I don't want to spend more than $60 per month";
  const stuck = "My puppy got stuck under the porch but we got him out";
  const sister = "My sister watches Luna on weekends";
  const forget = "Forget what I said about Walmart";
  const casual = "That's a funny story";
  const multi = "I changed Luna's food yesterday because chicken makes her itchy and I don't want to spend more than $60 a month.";
  const foundTransition = { ...base("claim_1", "state_transition", "animal_1", concept("returned home", ["missing pet"]), found, "current_state"), transition: "resolved", fromState: "missing", toState: "safe", targetConcept: concept("returned home", ["missing pet"]) };
  const weightAssertion = { ...assertion("claim_weight", "animal_1", concept("body weight"), "Luna weighs 58 pounds", 58, "profile"), unit: "pounds" };
  const correction = { ...base("claim_correction", "correction", "animal_1", concept("body weight"), weight, "profile"), operation: "replace", target: { claimRef: null, subjectRef: "animal_1", predicate: concept("body weight"), value: null }, replacementClaimRef: "claim_weight" };
  const foodEvent = event("claim_food", "animal_1", concept("food change"), "changed Luna's food yesterday", "completed", "historical");
  const multiBudget = preference("claim_budget", "owner_1", concept("monthly pet spending"), "I don't want to spend more than $60 a month", 60, "owner_memory");
  return [
    { message: runaway, frame: frame([mention("animal_1", "Luna", "animal")], [event("claim_1", "animal_1", concept("ran away", ["missing pet"]), runaway, "started", "active")]), expectedClaims: 1, expectedEntities: ["selected_pet"], shouldPersist: true, shouldClarify: false },
    { message: found, frame: frame([mention("owner_1", "I", "person", { ownership: "owner" }), mention("animal_1", "her", "animal")], [foundTransition], [reference("reference_1", "her", "animal_1")]), options: { activeEpisodes: [activeMissingEpisode], conversationTurns: [{ role: "user", text: runaway }] }, expectedClaims: 1, expectedEntities: ["authenticated_owner", "selected_pet"], shouldPersist: true, shouldClarify: false },
    { message: cat, frame: frame([mention("animal_1", "My cat", "animal", { species: "cat", ownership: "owner" })], [event("claim_1", "animal_1", concept("vomiting"), cat, "started", "active")]), expectedClaims: 1, expectedEntities: ["ENTITY_SPECIES_CONFLICT"], shouldPersist: false, shouldClarify: true },
    { message: weight, frame: frame([mention("animal_1", "Luna", "animal")], [weightAssertion, correction], [], [{ kind: "correction", confidence: 0.99 }]), expectedClaims: 2, expectedEntities: ["selected_pet"], shouldPersist: true, shouldClarify: false },
    { message: dislike, frame: frame([mention("animal_1", "She", "animal")], [{ ...preference("claim_1", "animal_1", concept("chicken treats"), dislike, "chicken treats", "pet_memory"), preference: "avoid" }], [reference("reference_1", "She", "animal_1")]), options: { conversationTurns: [{ role: "user", text: "Luna likes walks" }] }, expectedClaims: 1, expectedEntities: ["selected_pet"], shouldPersist: true, shouldClarify: false },
    { message: food, frame: frame([mention("owner_1", "I", "person", { ownership: "owner" }), mention("animal_1", "her", "animal")], [event("claim_1", "animal_1", concept("food change"), food, "completed", "historical")], [reference("reference_1", "her", "animal_1")]), options: { conversationTurns: [{ role: "user", text: "Luna needed a new food" }] }, expectedClaims: 1, expectedEntities: ["authenticated_owner", "selected_pet"], shouldPersist: true, shouldClarify: false },
    { message: budget, frame: frame([mention("owner_1", "I", "person", { ownership: "owner" })], [preference("claim_1", "owner_1", concept("monthly pet spending"), budget, 60, "owner_memory")]), expectedClaims: 1, expectedEntities: ["authenticated_owner"], shouldPersist: true, shouldClarify: false },
    { message: stuck, frame: frame([mention("animal_1", "My puppy", "animal", { species: "dog", lifeStage: "puppy", ownership: "owner" })], [event("claim_1", "animal_1", concept("temporary entrapment"), stuck, "resolved", "resolved")]), expectedClaims: 1, expectedEntities: ["other_pet"], shouldPersist: true, shouldClarify: false },
    { message: sister, frame: frame([mention("person_1", "My sister", "person", { ownership: "household" }), mention("animal_1", "Luna", "animal")], [{ ...base("claim_1", "relationship", "person_1", concept("pet caregiving"), sister, "relationship"), objectRef: "animal_1", qualifiers: [{ key: "schedule", value: "weekends" }] }]), expectedClaims: 1, expectedEntities: ["ENTITY_NO_MATCH", "selected_pet"], shouldPersist: false, shouldClarify: true },
    { message: forget, frame: frame([mention("owner_1", "I", "person", { ownership: "owner" })], [{ ...base("claim_1", "correction", "owner_1", concept("retailer preference"), forget, "owner_memory"), operation: "forget", target: { claimRef: null, subjectRef: "owner_1", predicate: concept("retailer preference"), value: "Walmart" }, replacementClaimRef: null }], [], [{ kind: "retraction", confidence: 0.99 }]), expectedClaims: 1, expectedEntities: ["authenticated_owner"], shouldPersist: true, shouldClarify: false },
    { message: casual, frame: frame([], [], [], [{ kind: "acknowledgement", confidence: 0.99 }]), expectedClaims: 0, expectedEntities: [], shouldPersist: false, shouldClarify: false },
    { message: multi, frame: frame([mention("owner_1", "I don't", "person", { ownership: "owner" }), mention("animal_1", "Luna", "animal")], [foodEvent, assertion("claim_itch", "animal_1", concept("chicken sensitivity"), "chicken makes her itchy", true, "pet_memory"), multiBudget]), expectedClaims: 3, expectedEntities: ["authenticated_owner", "selected_pet"], shouldPersist: true, shouldClarify: false },
  ];
}

function assertEntityLabels(bindings, expected) {
  const actual = bindings.map((binding) => binding.reasonCode || binding.binding === "selected_pet" || binding.binding === "authenticated_owner"
    ? binding.reasonCode || binding.binding
    : binding.binding?.startsWith("pet:") ? "other_pet" : binding.result);
  assert.deepEqual(actual, expected);
  return true;
}
