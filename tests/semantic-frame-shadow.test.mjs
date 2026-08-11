import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { askUnifiedJsonSchema } from "../app/lib/ai/ask-reasoning.ts";
import { resolveShadowEntities } from "../app/lib/intelligence/entities/resolve-entities.ts";
import { buildShadowSemanticAnalysis } from "../app/lib/intelligence/semantic-observability.ts";
import { extractProposedSemanticFrame } from "../app/lib/intelligence/semantic-frame/extract-frame.ts";
import { groundSemanticFrameEvidence } from "../app/lib/intelligence/semantic-frame/ground-evidence.ts";
import { proposedSemanticFrameJsonSchema } from "../app/lib/intelligence/semantic-frame/schema.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { validateSemanticFrameEvidence } from "../app/lib/intelligence/semantic-frame/validate-evidence.ts";

const pets = [
  { id: "pet-luna", name: "Luna", species: "dog", age_value: 5, age_unit: "years" },
  { id: "pet-milo", name: "Milo", species: "cat", age_value: 4, age_unit: "years" },
  { id: "pet-poppy", name: "Poppy", species: "dog", age_value: 8, age_unit: "months" },
];

const span = (message, quote) => {
  const start = message.indexOf(quote);
  assert.notEqual(start, -1, `Missing evidence quote: ${quote}`);
  return { surfaceText: quote };
};
const temporal = (surfaceText = null, precision = "unknown") => ({ occurredAt: null, validFrom: null, validTo: null, surfaceText, precision });
const uncertainty = (confidence = 0.96) => ({ confidence, reasons: [] });
const concept = (label, aliases = [], parentLabels = [], relatedLabels = []) => ({ label, definition: null, aliases, parentLabels, relatedLabels });
const mention = (message, localId, surface, coarseType, attributes = {}) => ({
  localId, surface, coarseType,
  attributes: { species: null, lifeStage: null, ownership: "unknown", ...attributes },
  evidence: [span(message, surface)], confidence: 0.98,
});
const common = (message, localId, kind, subjectRef, predicate, quote, persistenceHint) => ({
  localId, kind, subjectRef, predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
  temporal: temporal(), uncertainty: uncertainty(), evidence: [span(message, quote)], persistenceHint,
});
const eventClaim = (message, localId, subjectRef, predicate, quote, phase = "observed", resultingState = "historical") => ({
  ...common(message, localId, "event", subjectRef, predicate, quote, "history"),
  participants: subjectRef ? [{ role: "subject", entityRef: subjectRef }] : [],
  lifecycle: { phase, boundedInMessage: resultingState === "resolved", resultingState },
});
const assertionClaim = (message, localId, subjectRef, predicate, quote, value, persistenceHint = "pet_memory") => ({
  ...common(message, localId, "assertion", subjectRef, predicate, quote, persistenceHint),
  value, unit: null, durability: "durable",
});
const preferenceClaim = (message, localId, subjectRef, predicate, quote, preference, value, persistenceHint) => ({
  ...common(message, localId, "preference", subjectRef, predicate, quote, persistenceHint),
  preference, object: { concept: concept(predicate), value }, constraints: [],
});
const frame = (mentions, claims, discourseActs = [{ kind: "statement", confidence: 0.99 }], references = []) => ({
  schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1", discourseActs, mentions, references, claims,
  uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
});

function evaluationFrames() {
  const cases = [];
  {
    const message = "Luna ran away";
    cases.push({ message, expected: ["event"], frame: frame(
      [mention(message, "animal_1", "Luna", "animal")],
      [eventClaim(message, "claim_1", "animal_1", "missing pet incident", message, "started", "active")],
    ) });
  }
  {
    const message = "I found her";
    const found = {
      ...common(message, "claim_1", "state_transition", "animal_1", "pet returned home", message, "current_state"),
      transition: "resolved", fromState: "missing", toState: "safe at home", targetConcept: concept("missing pet incident"),
    };
    cases.push({ message, expected: ["state_transition"], frame: frame(
      [mention(message, "owner_1", "I", "person", { ownership: "owner" }), mention(message, "animal_1", "her", "animal")],
      [found], [{ kind: "statement", confidence: 0.99 }],
      [{ localId: "reference_1", surface: "her", kind: "pronoun", mentionRef: "animal_1", antecedentRefs: [], confidence: 0.95 }],
    ) });
  }
  {
    const message = "My cat is vomiting";
    cases.push({ message, expected: ["event"], frame: frame(
      [mention(message, "animal_1", "My cat", "animal", { species: "cat", ownership: "owner" })],
      [eventClaim(message, "claim_1", "animal_1", "vomiting", message, "started", "active")],
    ) });
  }
  {
    const message = "Actually Luna weighs 58 pounds";
    const weight = { ...assertionClaim(message, "claim_weight", "animal_1", "body weight", "Luna weighs 58 pounds", 58, "profile"), unit: "pounds" };
    const correction = {
      ...common(message, "claim_correction", "correction", "animal_1", "body weight", message, "profile"), operation: "replace",
      target: { claimRef: null, subjectRef: "animal_1", predicate: concept("body weight"), value: null }, replacementClaimRef: "claim_weight",
    };
    cases.push({ message, expected: ["assertion", "correction"], frame: frame([mention(message, "animal_1", "Luna", "animal")], [weight, correction], [{ kind: "correction", confidence: 0.99 }]) });
  }
  {
    const message = "She hates chicken treats";
    cases.push({ message, expected: ["preference"], frame: frame(
      [mention(message, "animal_1", "She", "animal")],
      [preferenceClaim(message, "claim_1", "animal_1", "chicken treats", message, "avoid", "chicken treats", "pet_memory")],
      undefined, [{ localId: "reference_1", surface: "She", kind: "pronoun", mentionRef: "animal_1", antecedentRefs: [], confidence: 0.9 }],
    ) });
  }
  {
    const message = "I changed her food yesterday";
    const claim = eventClaim(message, "claim_1", "animal_1", "food change", message, "completed", "historical");
    claim.temporal = temporal("yesterday", "day");
    cases.push({ message, expected: ["event"], frame: frame(
      [mention(message, "owner_1", "I", "person", { ownership: "owner" }), mention(message, "animal_1", "her", "animal")], [claim],
      undefined, [{ localId: "reference_1", surface: "her", kind: "pronoun", mentionRef: "animal_1", antecedentRefs: [], confidence: 0.9 }],
    ) });
  }
  {
    const message = "I don't want to spend more than $60 per month";
    const claim = preferenceClaim(message, "claim_1", "owner_1", "monthly pet spending", message, "limit", 60, "owner_memory");
    claim.constraints = [{ dimension: "cost", operator: "lte", value: 60, unit: "USD", period: "month" }];
    cases.push({ message, expected: ["preference"], frame: frame([mention(message, "owner_1", "I", "person", { ownership: "owner" })], [claim]) });
  }
  {
    const message = "My puppy got stuck under the porch but we got him out";
    cases.push({ message, expected: ["event"], frame: frame(
      [mention(message, "animal_1", "My puppy", "animal", { species: "dog", lifeStage: "puppy", ownership: "owner" })],
      [eventClaim(message, "claim_1", "animal_1", "temporary entrapment", message, "resolved", "resolved")],
    ) });
  }
  {
    const message = "My sister watches Luna on weekends";
    const relationship = {
      ...common(message, "claim_1", "relationship", "person_1", "pet caregiving", message, "relationship"),
      objectRef: "animal_1", qualifiers: [{ key: "schedule", value: "weekends" }],
    };
    cases.push({ message, expected: ["relationship"], frame: frame(
      [mention(message, "person_1", "My sister", "person", { ownership: "household" }), mention(message, "animal_1", "Luna", "animal")], [relationship],
    ) });
  }
  {
    const message = "Forget what I said about Walmart";
    const correction = {
      ...common(message, "claim_1", "correction", "owner_1", "retailer preference", message, "owner_memory"), operation: "forget",
      target: { claimRef: null, subjectRef: "owner_1", predicate: concept("retailer preference"), value: "Walmart" }, replacementClaimRef: null,
    };
    cases.push({ message, expected: ["correction"], frame: frame([mention(message, "owner_1", "I", "person", { ownership: "owner" })], [correction], [{ kind: "retraction", confidence: 0.99 }]) });
  }
  cases.push({ message: "That's a funny story", expected: [], frame: frame([], [], [{ kind: "acknowledgement", confidence: 0.9 }]) });
  return cases;
}

test("the versioned, open-concept frame accepts all evaluation shapes through one parser", () => {
  for (const fixture of evaluationFrames()) {
    const parsed = extractProposedSemanticFrame(fixture.frame);
    assert.ok(parsed, fixture.message);
    assert.deepEqual(parsed.claims.map((claim) => claim.kind), fixture.expected, fixture.message);
    const grounded = groundSemanticFrameEvidence(parsed, fixture.message);
    assert.equal(grounded.failures.length, 0, fixture.message);
    assert.deepEqual(validateSemanticFrameEvidence(grounded.frame, fixture.message), { valid: true, invalidMentionIds: [], invalidClaimIds: [] }, fixture.message);
  }
  assert.equal(proposedSemanticFrameJsonSchema.properties.claims.items.anyOf[0].properties.predicate.properties.label.enum, undefined);
});

test("shadow entity resolution uses explicit evidence before selected-pet context", () => {
  const catCase = evaluationFrames().find((item) => item.message === "My cat is vomiting");
  const catBinding = resolveShadowEntities({ frame: catCase.frame, ownerId: "owner-1", pets, recentPetIds: [], selectedPetId: "pet-luna" })[0];
  assert.equal(catBinding.status, "resolved");
  assert.equal(catBinding.entityId, "pet-milo");
  assert.equal(catBinding.candidates.find((candidate) => candidate.entityId === "pet-luna").score, 0);

  const puppyCase = evaluationFrames().find((item) => item.message.startsWith("My puppy"));
  const puppyBinding = resolveShadowEntities({ frame: puppyCase.frame, ownerId: "owner-1", pets, recentPetIds: [], selectedPetId: "pet-luna" })[0];
  assert.equal(puppyBinding.status, "resolved");
  assert.equal(puppyBinding.entityId, "pet-poppy");
});

test("pronouns use recent discourse and ambiguous species mentions fail closed", () => {
  const found = evaluationFrames().find((item) => item.message === "I found her");
  const resolved = resolveShadowEntities({ frame: found.frame, ownerId: "owner-1", pets, recentPetIds: ["pet-luna"], selectedPetId: "pet-milo" });
  assert.equal(resolved.find((item) => item.mentionId === "animal_1").entityId, "pet-luna");

  const message = "My dog is tired";
  const ambiguousFrame = frame([mention(message, "animal_1", "My dog", "animal", { species: "dog", ownership: "owner" })], [eventClaim(message, "claim_1", "animal_1", "fatigue", message)]);
  const ambiguous = resolveShadowEntities({ frame: ambiguousFrame, ownerId: "owner-1", pets, recentPetIds: [], selectedPetId: "pet-milo" })[0];
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.reasonCode, "ENTITY_AMBIGUOUS");
});

test("one frame retains independent pet facts, events, and owner preferences", () => {
  const message = "I changed Luna's food yesterday because chicken makes her itchy and I don't want to spend more than $60 a month.";
  const mentions = [mention(message, "owner_1", "I don't", "person", { ownership: "owner" }), mention(message, "animal_1", "Luna", "animal")];
  const food = eventClaim(message, "claim_food", "animal_1", "food change", "changed Luna's food yesterday", "completed", "historical");
  food.temporal = temporal("yesterday", "day");
  const itchy = assertionClaim(message, "claim_itch", "animal_1", "chicken sensitivity", "chicken makes her itchy", true, "pet_memory");
  const budget = preferenceClaim(message, "claim_budget", "owner_1", "monthly pet spending", "I don't want to spend more than $60 a month", "limit", 60, "owner_memory");
  budget.constraints = [{ dimension: "cost", operator: "lte", value: 60, unit: "USD", period: "month" }];
  const parsed = extractProposedSemanticFrame(frame(mentions, [food, itchy, budget]));
  assert.ok(parsed);
  assert.deepEqual(parsed.claims.map((claim) => claim.kind), ["event", "assertion", "preference"]);
  assert.deepEqual(parsed.claims.map((claim) => claim.persistenceHint), ["history", "pet_memory", "owner_memory"]);
  const grounded = groundSemanticFrameEvidence(parsed, message);
  assert.deepEqual(validateSemanticFrameEvidence(grounded.frame, message), { valid: true, invalidMentionIds: [], invalidClaimIds: [] });
});

test("shadow trace is privacy-limited, machine-queryable, and compares interpretations", () => {
  const fixture = evaluationFrames()[0];
  const analysis = buildShadowSemanticAnalysis({
    activeEpisodes: [], acceptedCareActions: [], acceptedLearnings: [], acceptedSemanticEvents: [], conversationTurns: [], eligiblePets: pets,
    frame: fixture.frame, message: fixture.message, ownerId: "owner-1", requestId: "trace-stable", selectedPetId: "pet-luna", sourceMessageId: "message-1",
    reasoning: { model: "shadow-test-v1", messageUnderstanding: { needsClarification: false } },
    recoveryAssessments: [{
      candidate: true, promoted: true, effectiveConfidence: 0.928, threshold: 0.92, reasons: ["RECOVERY_PROMOTED"],
      model: { status: "partial", confidence: 0.88, terminalSupport: 0 }, evidence: { grounded: true, score: 1 },
      subject: { authoritative: true, score: 0.99 }, lifecycle: { compatibleCandidateCount: 1, unique: true, matchScore: 1 },
      terminalSemantics: {
        grounded: true, score: 0.99, source: "recovery_evidence", outcome: "return_to_baseline", targetMatched: true,
      }, contradiction: { absent: true }, safety: { allowed: true },
    }],
  });
  assert.equal(analysis.trace.traceId, "trace-stable");
  assert.deepEqual(analysis.trace.claimKinds, ["event"]);
  assert.equal(analysis.trace.mentionSurfaces[0].redactedSurface, "[PET_NAME]");
  assert.equal(JSON.stringify(analysis.trace).includes("Luna ran away"), false);
  assert.equal(analysis.trace.governance[0].reasonCode, "CLAIM_ACCEPTED");
  assert.equal(analysis.trace.evidenceGrounding.grounded, 2);
  assert.equal(typeof analysis.trace.comparison.subjectDisagreement, "boolean");
  assert.equal(analysis.trace.persistence.status, "not_attempted");
  assert.deepEqual(analysis.trace.recoveryGovernance[0], {
    promoted: true, effectiveConfidence: 0.928, threshold: 0.92, reasons: ["RECOVERY_PROMOTED"],
    modelStatus: "partial", modelConfidence: 0.88, evidenceGrounded: true, authoritativeSubject: true,
    subjectConfidence: 0.99, compatibleEpisodeCount: 1, lifecycleMatchScore: 1, terminalSemanticsScore: 0.99,
    terminalSemanticsSource: "recovery_evidence", terminalSemanticsOutcome: "return_to_baseline", terminalTargetMatched: true,
    contradictionAbsent: true, safetyAllowed: true,
  });
});

test("frames cannot contain database IDs and unsupported evidence is rejected by shadow governance", () => {
  const fixture = evaluationFrames()[0];
  assert.equal(extractProposedSemanticFrame({ ...fixture.frame, frameLocalId: "03f71ca6-0954-4a88-8d0f-7fc79e474d45" }), null);
  const corrupted = structuredClone(fixture.frame);
  corrupted.claims[0].evidence[0].surfaceText = "not in the message";
  const analysis = buildShadowSemanticAnalysis({
    activeEpisodes: [], acceptedCareActions: [], acceptedLearnings: [], acceptedSemanticEvents: [], conversationTurns: [], eligiblePets: pets,
    frame: corrupted, message: fixture.message, ownerId: "owner-1", requestId: "trace-2", selectedPetId: "pet-luna", sourceMessageId: "message-2",
    reasoning: { model: "shadow-test-v1", messageUnderstanding: { needsClarification: false } },
  });
  assert.equal(analysis.trace.governance[0].reasonCode, "EVIDENCE_NOT_FOUND");
  assert.deepEqual(analysis.trace.shadowDestinations, []);
});

test("Ask requests the shadow frame in the existing structured call while production persistence stays authoritative", () => {
  assert.ok(askUnifiedJsonSchema.required.includes("semanticFrame"));
  assert.equal(askUnifiedJsonSchema.properties.semanticFrame, proposedSemanticFrameJsonSchema);
  const reasoningSource = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.match(reasoningSource, /local IDs/i);
  assert.match(reasoningSource, /never copy or invent any supplied database ID/i);
  const persistenceSource = readFileSync(new URL("../app/lib/intelligence/persist-learnings.ts", import.meta.url), "utf8");
  assert.doesNotMatch(persistenceSource, /semanticFrame/);
});
