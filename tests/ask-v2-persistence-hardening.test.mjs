import assert from "node:assert/strict";
import test from "node:test";
import { attachRegistryConceptPolicy } from "../app/lib/intelligence/v2/concepts/registry-policy.ts";
import { deduplicateGovernedClaims } from "../app/lib/intelligence/v2/governance/deduplicate.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";
import { serializeGovernedSemanticTurnV2 } from "../app/lib/intelligence/v2/persistence/serialize.ts";
import { persistGovernedSemanticTurnV2Shadow } from "../app/lib/intelligence/v2/persistence/persist.ts";
import { selectPhase3LowRiskTurn } from "../app/lib/intelligence/v2/phase3/cutover-policy.ts";
import { observeGovernedSemanticTurnV2 } from "../app/lib/intelligence/v2/observability.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const lunaId = "10000000-0000-4000-8000-000000000011";
const miloId = "10000000-0000-4000-8000-000000000012";
const sourceMessageId = "20000000-0000-4000-8000-000000000001";
const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" };

function proposedPreference(localId, predicate, message, value, subjectRef = "store") {
  return {
    localId, kind: "preference", subjectRef, predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
    temporal, uncertainty: { confidence: 0.97, reasons: [] }, evidence: [{ surfaceText: message }], persistenceHint: "owner_memory",
    preference: "prefer", object: { concept: concept(predicate), value }, constraints: [],
  };
}

function proposedAssertion(localId, predicate, message, value, subjectRef = "store") {
  return {
    localId, kind: "assertion", subjectRef, predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
    temporal, uncertainty: { confidence: 0.96, reasons: [] }, evidence: [{ surfaceText: message }], persistenceHint: "owner_memory",
    value, unit: null, durability: "durable",
  };
}

function semanticFrame(message, claims, mentions = [{
  localId: "store", surface: "Chewy", coarseType: "organization",
  attributes: { species: null, lifeStage: null, ownership: "unknown" },
  evidence: [{ surfaceText: message }], confidence: 0.98,
}]) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
    discourseActs: claims.length ? [{ kind: "statement", confidence: 0.99 }] : [{ kind: "acknowledgement", confidence: 0.99 }],
    mentions, references: [], claims,
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function govern(message, claims, options = {}) {
  return governSemanticTurnV2({
    frame: semanticFrame(message, claims, options.mentions), sourceMessage: message, sourceMessageId, ownerId,
    pets: [{ id: lunaId, name: "Luna", species: "dog" }, { id: miloId, name: "Milo", species: "cat" }],
    canonicalConcepts: options.canonicalConcepts, activeEpisodes: [],
  });
}

const preferredRetailer = attachRegistryConceptPolicy({
  key: "preferred_retailer", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
});

test("canonical persistence uses registry identity while retaining the model proposal as metadata", () => {
  const message = "I prefer shopping at Chewy.";
  for (const proposedKey of ["prefer shopping at", "preferred retailer"]) {
    const turn = govern(message, [proposedPreference("claim_1", proposedKey, message, "Chewy")], {
      canonicalConcepts: [preferredRetailer],
    });
    const claim = turn.acceptedClaims[0];
    const payload = serializeGovernedSemanticTurnV2(turn, message).claims[0];
    assert.equal(claim.conceptKey, proposedKey.replaceAll(" ", "_"));
    assert.equal(claim.canonicalConceptKey, "preferred_retailer");
    assert.equal(payload.concept_key, "preferred_retailer");
    assert.equal(payload.canonical_concept_key, "preferred_retailer");
    assert.equal(payload.concept_authority, "governed_registry");
    assert.equal(payload.governance_metadata.proposedConceptKey, claim.conceptKey);
    assert.equal(payload.governance_metadata.persistedConceptKey, "preferred_retailer");
  }
});

test("provisional persistence representation remains provisional", () => {
  const message = "I prefer nearby shops.";
  const turn = govern(message, [proposedPreference("claim_1", "nearby shops", message, "nearby")]);
  const payload = serializeGovernedSemanticTurnV2(turn, message).claims[0];
  assert.equal(payload.concept_key, "nearby_shops");
  assert.equal(payload.canonical_concept_key, null);
  assert.equal(payload.concept_resolution_status, "provisional");
  assert.equal(payload.concept_authority, "provisional_normalizer");
});

test("equivalent assertion and preference proposals collapse to one governed claim", () => {
  const message = "I prefer shopping at Chewy.";
  const turn = govern(message, [
    proposedPreference("claim_preference", "prefer shopping at", message, "Chewy"),
    proposedAssertion("claim_assertion", "prefer shopping at", message, "Chewy"),
  ], { canonicalConcepts: [preferredRetailer] });
  assert.equal(turn.acceptedClaims.length, 1);
  assert.equal(turn.acceptedClaims[0].canonicalConceptKey, "preferred_retailer");
  assert.equal(turn.acceptedClaims[0].governanceMetadata.deduplicatedClaimCount, 2);
  assert.deepEqual(
    turn.acceptedClaims[0].governanceMetadata.deduplicatedModelProposals.map((proposal) => proposal.declaredClaimKind).sort(),
    ["assertion", "preference"],
  );
  assert.equal(observeGovernedSemanticTurnV2(turn).deduplication[0].proposalCount, 2);
  assert.equal(serializeGovernedSemanticTurnV2(turn, message).claims.length, 1);
});

test("the persistence boundary independently collapses equivalent governed claims", () => {
  const first = manualClaim({
    sourceLocalClaimKey: "claim_a",
    governanceMetadata: {
      deduplicatedClaimCount: 2,
      deduplicatedModelProposals: [
        { sourceLocalClaimKey: "claim_a", declaredClaimKind: "preference", proposedConceptKey: "model_proposal" },
        { sourceLocalClaimKey: "claim_prior", declaredClaimKind: "assertion", proposedConceptKey: "model_proposal" },
      ],
    },
  });
  const duplicate = manualClaim({ sourceLocalClaimKey: "claim_b" });
  const turn = manualTurn([first, duplicate]);
  const payload = serializeGovernedSemanticTurnV2(turn, "evidence");
  assert.equal(payload.claims.length, 1);
  assert.equal(payload.claims[0].source_local_claim_key, "claim_a");
  assert.equal(payload.claims[0].governance_metadata.deduplicatedClaimCount, 3);
  assert.deepEqual(
    payload.claims[0].governance_metadata.deduplicatedModelProposals.map((proposal) => proposal.sourceLocalClaimKey),
    ["claim_a", "claim_prior", "claim_b"],
  );
});

test("material semantic differences are not collapsed", () => {
  const base = manualClaim();
  const differentValue = { ...manualClaim({ sourceLocalClaimKey: "claim_value" }), structuredValue: {
    preference: "prefer", object: { concept: concept("preferred retailer"), value: "PetSmart" }, constraints: [],
  } };
  const differentPet = manualClaim({ sourceLocalClaimKey: "claim_pet", subjectType: "pet", subjectId: lunaId });
  const otherPet = manualClaim({ sourceLocalClaimKey: "claim_other_pet", subjectType: "pet", subjectId: miloId });
  assert.equal(deduplicateGovernedClaims([base, differentValue], []).claims.length, 2);
  assert.equal(deduplicateGovernedClaims([differentPet, otherPet], []).claims.length, 2);

  const started = manualClaim({ sourceLocalClaimKey: "claim_started", claimKind: "event", lifecycleRole: "opening", lifecycleTransition: "started" });
  const resolved = manualClaim({ sourceLocalClaimKey: "claim_resolved", claimKind: "event", lifecycleRole: "resolution", lifecycleTransition: "resolved" });
  assert.equal(deduplicateGovernedClaims([started, resolved], []).claims.length, 2);
});

test("relations are deterministically remapped after duplicate claim collapse", () => {
  const first = manualClaim({ sourceLocalClaimKey: "claim_a" });
  const duplicate = manualClaim({ sourceLocalClaimKey: "claim_b" });
  const source = manualClaim({ sourceLocalClaimKey: "claim_c", structuredValue: { value: "different" } });
  const relation = {
    sourceLocalRelationKey: "relation_c_b", fromLocalClaimKey: "claim_c", toLocalClaimKey: "claim_b",
    toClaimId: null, relationType: "confirms", metadata: {},
  };
  const normal = deduplicateGovernedClaims([first, duplicate, source], [relation]);
  const reversed = deduplicateGovernedClaims([source, duplicate, first], [relation]);
  assert.equal(normal.claims.length, 2);
  assert.equal(normal.relations[0].toLocalClaimKey, "claim_a");
  assert.deepEqual(normal, reversed);
});

test("Phase 3 Chewy selection emits one canonical RPC claim and retry payload is stable", async () => {
  const message = "I prefer shopping at Chewy.";
  const governed = govern(message, [
    proposedPreference("claim_preference", "prefer shopping at", message, "Chewy"),
    proposedAssertion("claim_assertion", "prefer shopping at", message, "Chewy"),
  ], { canonicalConcepts: [preferredRetailer] });
  const selection = selectPhase3LowRiskTurn({
    turn: governed,
    conceptPolicies: new Map([["preferred_retailer", { conceptKind: "preference", lifecycleCapable: false }]]),
    legacyLearnings: [{
      subjectType: "owner", subjectId: null, category: "preference", factKey: "preferred_retailer", factValue: "Chewy",
      confidence: 0.97, importance: "medium", durability: "durable", action: "create", sourceExcerpt: message,
    }],
    selectedPetId: lunaId,
  });
  assert.equal(selection.accepted.length, 1);
  assert.equal(selection.turn.acceptedClaims.length, 1);
  const calls = [];
  const serviceClient = { rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: [{ already_persisted: calls.length > 1 }], error: null };
  } };
  const input = {
    serviceClient, verifiedUserId: ownerId, turn: selection.turn, sourceMessage: message,
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
  };
  await persistGovernedSemanticTurnV2Shadow(input);
  await persistGovernedSemanticTurnV2Shadow(input);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_governed_turn.claims.length, 1);
  assert.deepEqual(calls[0].args, calls[1].args);
  assert.equal(calls[0].args.p_governed_turn.claims[0].concept_key, "preferred_retailer");
});

test("Good morning produces no governed or persistent claims", () => {
  const message = "Good morning";
  const turn = govern(message, []);
  const selection = selectPhase3LowRiskTurn({
    turn, conceptPolicies: new Map(), legacyLearnings: [], selectedPetId: lunaId,
  });
  assert.equal(turn.acceptedClaims.length, 0);
  assert.equal(selection.accepted.length, 0);
  assert.equal(serializeGovernedSemanticTurnV2(turn, message).claims.length, 0);
});

function manualClaim(overrides = {}) {
  const subjectType = overrides.subjectType || "owner";
  const subjectId = overrides.subjectId || ownerId;
  const claimKind = overrides.claimKind || "preference";
  const sourceLocalClaimKey = overrides.sourceLocalClaimKey || "claim_base";
  return {
    sourceLocalClaimKey,
    proposed: {
      localId: sourceLocalClaimKey, kind: claimKind, subjectRef: "subject", predicate: concept("model proposal"),
      polarity: "affirmed", modality: "asserted", temporal, uncertainty: { confidence: 0.95, reasons: [] },
      evidence: [{ surfaceText: "evidence" }], persistenceHint: "owner_memory",
    },
    subject: { type: subjectType, id: subjectId, sourceMentionId: "subject", resolution: "owned", confidence: 1 },
    resolvedEntities: [{ entityType: subjectType, entityId: subjectId, sourceMentionId: "subject", confidence: 1 }],
    groundedEvidence: [{ surfaceText: "evidence", start: 0, end: 8, quote: "evidence", alignment: "exact" }],
    temporal: { occurredAt: null, validFrom: null, validTo: null, precision: "unknown" }, extractionConfidence: 0.95,
    conceptKey: "model_proposal", canonicalConceptKey: "preferred_retailer", conceptVersion: "furvise.core.v1",
    conceptResolutionStatus: "canonical", conceptAuthority: "governed_registry", claimKind, operationType: "assert",
    structuredValue: { preference: "prefer", object: { concept: concept("model proposal"), value: "Chewy" }, constraints: [] },
    unit: null, durability: "unknown", lifecycleRole: overrides.lifecycleRole || null,
    lifecycleTransition: overrides.lifecycleTransition || null, serverEpisodeId: null, governedConfidence: 0.95,
    persistenceDestination: "owner_memory", persistenceEligible: true, proposedPersistenceHint: "owner_memory",
    persistencePolicyReasons: [], persistencePermission: "shadow_only", provenanceClassification: "ask_v2_shadow",
    governanceMetadata: {}, safetyFloorMetadata: { level: "routine", reasonCodes: [], policyVersion: "v1" },
    ...overrides,
  };
}

function manualTurn(claims, relations = []) {
  return {
    frame: semanticFrame("evidence", []), sourceMessageId, frameSchemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    governancePolicyVersion: "v1", acceptedClaims: claims, rejectedClaims: [], relations,
    needsClarification: false, safetyFloor: { level: "routine", reasonCodes: [], policyVersion: "v1" }, mode: "shadow_only",
  };
}
