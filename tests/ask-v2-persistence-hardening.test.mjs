import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateGovernedClaims } from "../app/lib/intelligence/v2/governance/deduplicate.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const lunaId = "10000000-0000-4000-8000-000000000011";
const miloId = "10000000-0000-4000-8000-000000000012";
const sourceMessageId = "20000000-0000-4000-8000-000000000001";
const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" };

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

test("Good morning produces no governed or persistent claims", () => {
  const message = "Good morning";
  const turn = govern(message, []);
  assert.equal(turn.acceptedClaims.length, 0);
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
