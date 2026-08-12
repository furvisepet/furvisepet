import assert from "node:assert/strict";
import test from "node:test";
import { extractProposedSemanticFrame } from "../app/lib/intelligence/semantic-frame/extract-frame.ts";
import { recoverOwnerPreferenceFrame } from "../app/lib/intelligence/semantic-frame/recover-owner-preference.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { attachRegistryConceptPolicy } from "../app/lib/intelligence/v2/concepts/registry-policy.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const sourceMessageId = "20000000-0000-4000-8000-000000000001";
const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" };
const preferredRetailer = attachRegistryConceptPolicy({
  key: "preferred_retailer", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
});
const recoveryContext = (message, overrides = {}) => ({
  sourceMessage: message, ownerIdentityVerified: true, canonicalConcepts: [preferredRetailer], safetyLevel: "routine", ...overrides,
});

function frame(message, claim, mentions = [organizationMention(message)]) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions,
    references: [],
    claims: [claim],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function organizationMention(message, surface = "Chewy") {
  return {
    localId: "organization_1", surface, coarseType: "organization",
    attributes: { species: null, lifeStage: null, ownership: "unknown" },
    evidence: [{ surfaceText: surface }], confidence: 0.98,
  };
}

function commonClaim(message, kind = "preference") {
  return {
    localId: "claim_1", kind, subjectRef: "owner_1", predicate: concept("shopping preference"),
    polarity: "affirmed", modality: "asserted", temporal,
    uncertainty: { confidence: 0.97, reasons: [] }, evidence: [{ surfaceText: message }], persistenceHint: "owner_memory",
  };
}

function preferenceClaim(message) {
  return {
    ...commonClaim(message), preference: "prefer",
    object: { concept: concept("retailer"), value: "Chewy" }, constraints: [],
  };
}

function assertionClaim(message) {
  return { ...commonClaim(message, "assertion"), value: "Chewy", unit: null, durability: "durable" };
}

function govern(message, semanticFrame) {
  return governSemanticTurnV2({
    frame: semanticFrame, sourceMessage: message, sourceMessageId, ownerId,
    pets: [], activeEpisodes: [], canonicalConcepts: [preferredRetailer],
  });
}

test("a simple first-person owner preference recovers one valid canonical governed claim", () => {
  const message = "I prefer shopping at Chewy.";
  const proposed = frame(message, preferenceClaim(message));
  assert.equal(extractProposedSemanticFrame(proposed), null, "dangling owner_1 must remain invalid at the strict parser");
  const recovery = recoverOwnerPreferenceFrame(proposed, recoveryContext(message));
  assert.ok(recovery);
  assert.equal(recovery.reason, "CLAIM_SUBJECT_REF_UNKNOWN");
  assert.equal(recovery.frame.claims[0].subjectRef, null);
  const governed = govern(message, recovery.frame);
  assert.equal(governed.rejectedClaims.length, 0);
  assert.equal(governed.acceptedClaims.length, 1);
  assert.equal(governed.acceptedClaims[0].subject.type, "owner");
  assert.equal(governed.acceptedClaims[0].subject.id, ownerId);
  assert.equal(governed.acceptedClaims[0].canonicalConceptKey, "preferred_retailer");
  assert.equal(governed.acceptedClaims[0].claimKind, "preference");
});

test("equivalent preference and durable assertion model shapes recover through governed concept authority", () => {
  const message = "I prefer shopping at Chewy.";
  for (const claim of [preferenceClaim(message), assertionClaim(message)]) {
    const recovery = recoverOwnerPreferenceFrame(frame(message, claim), recoveryContext(message));
    assert.ok(recovery);
    const governed = govern(message, recovery.frame);
    assert.equal(governed.acceptedClaims[0].claimKind, "preference");
    assert.equal(governed.acceptedClaims[0].structuredValue.object.value, "Chewy");
    assert.equal(governed.acceptedClaims[0].governanceMetadata.claimKindAuthority,
      claim.kind === "assertion" ? "governed_concept" : "model_structure");
  }
});

test("malformed preference payloads and non-exact evidence remain invalid", () => {
  const message = "I prefer shopping at Chewy.";
  const malformed = frame(message, { ...preferenceClaim(message), object: null });
  assert.equal(recoverOwnerPreferenceFrame(malformed, recoveryContext(message)), null);
  const paraphrased = frame(message, { ...preferenceClaim(message), evidence: [{ surfaceText: "I like Chewy" }] });
  assert.equal(recoverOwnerPreferenceFrame(paraphrased, recoveryContext(message)), null);
  assert.equal(recoverOwnerPreferenceFrame(frame(message, preferenceClaim(message)), recoveryContext(message, { ownerIdentityVerified: false })), null);
});

test("an unrelated organization assertion cannot recover as an owner preference", () => {
  const message = "Acme operates warehouses.";
  const claim = {
    ...commonClaim(message, "assertion"), predicate: concept("organization profile"),
    value: "warehouses", unit: null, durability: "durable",
  };
  const proposed = frame(message, claim, [organizationMention(message, "Acme")]);
  assert.equal(recoverOwnerPreferenceFrame(proposed, recoveryContext(message)), null);

  const reportedMessage = "I heard Acme prefers wholesale orders.";
  const reported = frame(reportedMessage, {
    ...commonClaim(reportedMessage), object: { concept: concept("ordering preference"), value: "wholesale" }, constraints: [],
  }, [organizationMention(reportedMessage, "Acme")]);
  assert.equal(recoverOwnerPreferenceFrame(reported, recoveryContext(reportedMessage)), null);
});

test("medical and lifecycle malformed frames remain fail closed", () => {
  const medicalMessage = "I think Luna is vomiting.";
  const medical = frame(medicalMessage, {
    ...commonClaim(medicalMessage, "assertion"), predicate: concept("vomiting"),
    value: true, unit: null, durability: "temporary", persistenceHint: "current_state",
  }, [{
    localId: "animal_1", surface: "Luna", coarseType: "animal",
    attributes: { species: null, lifeStage: null, ownership: "owner" },
    evidence: [{ surfaceText: "Luna" }], confidence: 0.98,
  }]);
  assert.equal(recoverOwnerPreferenceFrame(medical, recoveryContext(medicalMessage, { safetyLevel: "urgent" })), null);

  const lifecycleMessage = "I found Luna.";
  const lifecycle = frame(lifecycleMessage, {
    ...commonClaim(lifecycleMessage, "state_transition"), transition: "resolved", fromState: "missing",
    toState: "home", targetConcept: concept("missing pet"), persistenceHint: "current_state",
  }, []);
  assert.equal(recoverOwnerPreferenceFrame(lifecycle, recoveryContext(lifecycleMessage)), null);
});

test("Good morning remains a valid frame with zero governed claims", () => {
  const message = "Good morning";
  const greeting = {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
    discourseActs: [{ kind: "acknowledgement", confidence: 0.99 }], mentions: [], references: [], claims: [],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
  const parsed = extractProposedSemanticFrame(greeting);
  assert.ok(parsed);
  assert.equal(recoverOwnerPreferenceFrame(greeting, recoveryContext(message)), null);
  assert.equal(govern(message, parsed).acceptedClaims.length, 0);
});
