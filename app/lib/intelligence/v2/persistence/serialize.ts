import { evidenceForPersistence } from "../governance/evidence.ts";
import type { GovernedSemanticClaim, GovernedSemanticTurn } from "../types.ts";

export type PersistGovernedSemanticTurnV2Args = {
  p_verified_user_id: string;
  p_source_message_id: string;
  p_idempotency_key: string;
  p_frame_schema_version: string;
  p_governance_policy_version: string;
  p_governed_turn: ReturnType<typeof serializeGovernedSemanticTurnV2>;
};

export function serializeGovernedSemanticTurnV2(turn: GovernedSemanticTurn, sourceMessage: string) {
  const eligibleKeys = new Set(turn.acceptedClaims.filter((claim) => claim.persistenceEligible).map((claim) => claim.sourceLocalClaimKey));
  return {
    claims: turn.acceptedClaims.filter((claim) => claim.persistenceEligible).map((claim) => serializeClaim(claim, sourceMessage)),
    relations: turn.relations.filter((relation) => eligibleKeys.has(relation.fromLocalClaimKey)
      && (!relation.toLocalClaimKey || eligibleKeys.has(relation.toLocalClaimKey))).map((relation) => ({
      source_local_relation_key: relation.sourceLocalRelationKey,
      from_local_claim_key: relation.fromLocalClaimKey,
      to_local_claim_key: relation.toLocalClaimKey,
      to_claim_id: relation.toClaimId,
      relation_type: relation.relationType,
      metadata: relation.metadata,
    })),
  };
}

function serializeClaim(claim: GovernedSemanticClaim, sourceMessage: string) {
  return {
    source_local_claim_key: claim.sourceLocalClaimKey,
    subject_type: claim.subject.type,
    subject_id: claim.subject.id,
    resolved_entities: claim.resolvedEntities.map((entity) => ({ entity_type: entity.entityType, entity_id: entity.entityId })),
    claim_kind: claim.claimKind,
    operation_type: claim.operationType,
    concept_key: claim.conceptKey,
    canonical_concept_key: claim.canonicalConceptKey,
    concept_resolution_status: claim.conceptResolutionStatus,
    concept_authority: claim.conceptAuthority,
    concept_version: claim.conceptVersion,
    predicate: claim.proposed.predicate,
    structured_value: claim.structuredValue,
    unit: claim.unit,
    polarity: claim.proposed.polarity,
    modality: claim.proposed.modality,
    durability: claim.durability,
    occurred_at: claim.temporal.occurredAt,
    valid_from: claim.temporal.validFrom,
    valid_to: claim.temporal.validTo,
    temporal_precision: claim.temporal.precision,
    grounded_evidence: evidenceForPersistence(sourceMessage, claim.groundedEvidence),
    extraction_confidence: claim.extractionConfidence,
    governed_confidence: claim.governedConfidence,
    lifecycle_role: claim.lifecycleRole,
    lifecycle_transition: claim.lifecycleTransition,
    server_episode_id: claim.serverEpisodeId,
    persistence_destination: claim.persistenceDestination,
    safety_floor_metadata: claim.safetyFloorMetadata,
    governance_metadata: claim.governanceMetadata,
  };
}
