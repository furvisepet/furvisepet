import assert from "node:assert/strict";
import test from "node:test";

import { parseUnifiedResponse } from "../app/lib/ai/ask-reasoning.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { attachRegistryConceptPolicy } from "../app/lib/intelligence/v2/concepts/registry-policy.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const sourceMessageId = "20000000-0000-4000-8000-000000000001";
const preferredRetailer = attachRegistryConceptPolicy({
  key: "preferred_retailer", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
});
const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" };

function danglingOwnerPreference(message) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions: [{
      localId: "organization_1", surface: "Chewy", coarseType: "organization",
      attributes: { species: null, lifeStage: null, ownership: "unknown" },
      evidence: [{ surfaceText: "Chewy" }], confidence: 0.98,
    }],
    references: [],
    claims: [{
      localId: "claim_1", kind: "preference", subjectRef: "owner_1",
      predicate: concept("shopping preference"), polarity: "affirmed", modality: "asserted", temporal,
      uncertainty: { confidence: 0.97, reasons: [] }, evidence: [{ surfaceText: message }],
      persistenceHint: "owner_memory", preference: "prefer",
      object: { concept: concept("retailer"), value: "Chewy" }, constraints: [],
    }],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function unifiedRaw(semanticFrame) {
  return JSON.stringify({
    answer: "Understood.", safetyLevel: "normal", suggestedFollowUps: [],
    proposedHistoryUpdate: {
      shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null,
    },
    shoppingSuppressed: false, responseMode: "conversational", userIntent: "share preference", relevantContextIds: [],
    messageUnderstanding: {
      primaryIntent: "owner_preference", secondaryIntents: [], userIsAskingQuestion: false,
      userIsProvidingUpdate: true, userIsCorrectingPriorInformation: false, userIsResolvingConcern: false,
      userIsProvidingPreference: true, userIsMakingSmallTalk: false, recoveryStatus: "none", recoveryConfidence: 1,
      recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 },
      requestedTopic: "shopping preference", referencedPet: null, safetyRelevance: "none",
      needsClarification: false, canAnswerDirectly: true,
    },
    intelligenceSafety: {
      level: "routine", reason: "No current safety issue.", requiresImmediateAction: false, shoppingSuppressed: false,
    },
    learnings: [], careActions: [], semanticEvents: [], semanticFrame,
  });
}

function recoveryContext(message, overrides = {}) {
  return {
    sourceMessage: message, ownerIdentityVerified: true, canonicalConcepts: [preferredRetailer],
    safetyLevel: "routine", ...overrides,
  };
}

function parse(message, frame, context = recoveryContext(message)) {
  return parseUnifiedResponse(unifiedRaw(frame), [], context);
}

function govern(message, frame) {
  return governSemanticTurnV2({
    frame, sourceMessage: message, sourceMessageId, ownerId,
    pets: [], activeEpisodes: [], canonicalConcepts: [preferredRetailer],
  });
}

test("raw unified JSON retains a dangling-owner candidate through recovery and strict revalidation", () => {
  const message = "I prefer shopping at Chewy.";
  const parsed = parse(message, danglingOwnerPreference(message));
  assert.equal(parsed.semanticFrameValid, true);
  assert.deepEqual(parsed.semanticFrameRecovery, {
    applied: true, reason: "RECOVERED_OWNER_PREFERENCE", validationReason: "CLAIM_SUBJECT_REF_UNKNOWN",
  });
  assert.equal(parsed.semanticFrame.claims[0].subjectRef, null);
});

test("the same parsed candidate remains invalid when recovery is disabled", () => {
  const message = "I prefer shopping at Chewy.";
  const parsed = parseUnifiedResponse(unifiedRaw(danglingOwnerPreference(message)), []);
  assert.equal(parsed.semanticFrameValid, false);
  assert.equal(parsed.semanticFrame.claims.length, 0);
  assert.deepEqual(parsed.semanticFrameRecovery, {
    applied: false, reason: "NOT_ATTEMPTED_RECOVERY_DISABLED", validationReason: "CLAIM_SUBJECT_REF_UNKNOWN",
  });
});

test("a rejected candidate is not collapsed before recovery diagnostics", () => {
  const message = "I prefer shopping at Chewy.";
  const parsed = parse(message, danglingOwnerPreference(message));
  assert.equal(parsed.semanticFrameRecovery.validationReason, "CLAIM_SUBJECT_REF_UNKNOWN");
  assert.equal(parsed.semanticFrameRecovery.applied, true);
});

test("an invalid frame with another defect is not recoverable and reports a non-null reason", () => {
  const message = "I prefer shopping at Chewy.";
  const malformed = danglingOwnerPreference(message);
  malformed.claims[0].object = null;
  const parsed = parse(message, malformed);
  assert.equal(parsed.semanticFrameValid, false);
  assert.deepEqual(parsed.semanticFrameRecovery, {
    applied: false,
    reason: "NOT_ATTEMPTED_NON_RECOVERABLE_VALIDATION_ERROR",
    validationReason: "NON_RECOVERABLE_VALIDATION_ERROR",
  });
});

test("a missing provider candidate reports why recovery was not attempted", () => {
  const parsed = parse("Good morning", null);
  assert.equal(parsed.semanticFrameValid, false);
  assert.deepEqual(parsed.semanticFrameRecovery, {
    applied: false, reason: "NOT_ATTEMPTED_NO_CANDIDATE", validationReason: "NO_CANDIDATE",
  });
});

test("medical and lifecycle malformed frames remain fail closed", () => {
  const medicalMessage = "I think Luna is vomiting.";
  const medical = danglingOwnerPreference(medicalMessage);
  medical.claims[0] = {
    ...medical.claims[0], kind: "assertion", predicate: concept("vomiting"), value: true, unit: null,
    durability: "temporary", persistenceHint: "current_state",
  };
  const medicalParsed = parse(medicalMessage, medical, recoveryContext(medicalMessage, { safetyLevel: "urgent" }));
  assert.equal(medicalParsed.semanticFrameValid, false);
  assert.equal(medicalParsed.semanticFrameRecovery.applied, false);
  assert.equal(medicalParsed.semanticFrameRecovery.reason, "RECOVERY_PRECONDITION_FAILED");

  const lifecycleMessage = "I found Luna.";
  const lifecycle = danglingOwnerPreference(lifecycleMessage);
  lifecycle.claims[0] = {
    ...lifecycle.claims[0], kind: "state_transition", predicate: concept("found"),
    transition: "resolved", fromState: "missing", toState: "home", targetConcept: concept("missing pet"),
    persistenceHint: "current_state",
  };
  const lifecycleParsed = parse(lifecycleMessage, lifecycle);
  assert.equal(lifecycleParsed.semanticFrameValid, false);
  assert.equal(lifecycleParsed.semanticFrameRecovery.applied, false);
});

test("Good morning remains a valid zero-claim casual frame", () => {
  const greeting = {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_greeting",
    discourseActs: [{ kind: "acknowledgement", confidence: 0.99 }], mentions: [], references: [], claims: [],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
  const parsed = parse("Good morning", greeting);
  assert.equal(parsed.semanticFrameValid, true);
  assert.equal(parsed.semanticFrame.claims.length, 0);
  assert.deepEqual(parsed.semanticFrameRecovery, {
    applied: false, reason: "NOT_ATTEMPTED_FRAME_VALID", validationReason: null,
  });
});

test("the full recovered Chewy fixture governs one canonical persistence-eligible owner preference", () => {
  const message = "I prefer shopping at Chewy.";
  const parsed = parse(message, danglingOwnerPreference(message));
  const governed = govern(message, parsed.semanticFrame);
  assert.equal(governed.acceptedClaims.length, 1);
  assert.equal(governed.rejectedClaims.length, 0);
  assert.equal(governed.acceptedClaims[0].subject.type, "owner");
  assert.equal(governed.acceptedClaims[0].canonicalConceptKey, "preferred_retailer");
  assert.equal(governed.acceptedClaims[0].claimKind, "preference");
  assert.equal(governed.acceptedClaims[0].persistenceEligible, true);
});
