import type { CareEpisode } from "../../episodes/types.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "../../entities/candidate-retrieval.ts";
import { normalizeClaimKind, type ClaimKindNormalization } from "../../semantic-frame/normalize-claim-kind.ts";
import type { ProposedSemanticClaim, ProposedSemanticFrame } from "../../semantic-frame/types.ts";
import { resolveClaimConceptV2 } from "../concepts/normalize.ts";
import { evaluateLifecycleCompatibilityV2 } from "../lifecycle/compatibility.ts";
import type {
  ClaimOperation,
  GovernedClaimRelation,
  GovernedSemanticClaim,
  GovernedSemanticTurn,
  RejectedSemanticClaim,
  ResolvedEntity,
  SafetyFloorMetadata,
  GovernedConceptIdentity,
  GovernedEpisodeConceptIdentity,
  PreviousClaimTarget,
  V2RejectionReason,
} from "../types.ts";
import { groundV2Evidence } from "./evidence.ts";
import { resolveV2ClaimSubject, resolveV2Entities } from "./entities.ts";
import { normalizeTemporalSemanticsV2 } from "./temporal.ts";
import { decidePersistenceV2 } from "./persistence.ts";

export const V2_GOVERNANCE_POLICY_VERSION = "ask_v2.governance.shadow.v1" as const;
export const V2_MINIMUM_CLAIM_CONFIDENCE = 0.8;

export function governSemanticTurnV2(input: {
  frame: ProposedSemanticFrame;
  sourceMessage: string;
  sourceMessageId: string;
  ownerId: string;
  pets: EligibleSemanticPet[];
  conversationTurns?: Array<{ text: string; role?: string }>;
  activeEpisodes?: CareEpisode[];
  canonicalConcepts?: GovernedConceptIdentity[];
  episodeConcepts?: GovernedEpisodeConceptIdentity[];
  previousClaimTargets?: Record<string, PreviousClaimTarget>;
  safetyFloor?: Omit<SafetyFloorMetadata, "policyVersion">;
}): GovernedSemanticTurn {
  const evidence = groundV2Evidence(input.frame, input.sourceMessage);
  const recentPetIds = buildRecentPetIds(input.pets, input.conversationTurns || []);
  const entities = resolveV2Entities({ frame: evidence.frame, ownerId: input.ownerId, pets: input.pets, recentPetIds });
  const acceptedClaims: GovernedSemanticClaim[] = [];
  const rejectedClaims: RejectedSemanticClaim[] = [];
  const relations: GovernedClaimRelation[] = [];
  const safetyFloor: SafetyFloorMetadata = {
    level: input.safetyFloor?.level || "routine",
    reasonCodes: [...(input.safetyFloor?.reasonCodes || [])],
    policyVersion: V2_GOVERNANCE_POLICY_VERSION,
  };

  for (const claim of evidence.frame.claims) {
    const rejection = governOneClaim({ claim, evidence, entities, input, safetyFloor });
    if ("reason" in rejection) rejectedClaims.push(rejection);
    else {
      acceptedClaims.push(rejection);
      relations.push(...relationsForClaim(rejection, evidence.frame.claims, input.previousClaimTargets || {}));
    }
  }
  const acceptedKeys = new Set(acceptedClaims.map((claim) => claim.sourceLocalClaimKey));
  const validRelations = relations.filter((relation) => acceptedKeys.has(relation.fromLocalClaimKey)
    && (!relation.toLocalClaimKey || acceptedKeys.has(relation.toLocalClaimKey)));

  return {
    frame: evidence.frame,
    sourceMessageId: input.sourceMessageId,
    frameSchemaVersion: input.frame.schemaVersion,
    governancePolicyVersion: V2_GOVERNANCE_POLICY_VERSION,
    acceptedClaims,
    rejectedClaims,
    relations: validRelations,
    needsClarification: input.frame.uncertainty.needsClarification || rejectedClaims.some((item) => item.retryable),
    safetyFloor,
    mode: "shadow_only",
  };
}

function governOneClaim(input: {
  claim: ProposedSemanticClaim;
  evidence: ReturnType<typeof groundV2Evidence>;
  entities: ReturnType<typeof resolveV2Entities>;
  input: Parameters<typeof governSemanticTurnV2>[0];
  safetyFloor: SafetyFloorMetadata;
}): GovernedSemanticClaim | RejectedSemanticClaim {
  const { claim } = input;
  const reject = (reason: V2RejectionReason, stage: RejectedSemanticClaim["stage"], retryable = false): RejectedSemanticClaim => ({
    sourceLocalClaimKey: claim.localId, proposed: claim, reason, stage, retryable,
  });
  const evidenceFailure = input.evidence.rejectedByClaim.get(claim.localId);
  if (evidenceFailure) return reject(evidenceFailure, "evidence");
  if (claim.uncertainty.confidence < V2_MINIMUM_CLAIM_CONFIDENCE) return reject("CLAIM_LOW_CONFIDENCE", "confidence");
  const groundedEvidence = input.evidence.groundedByClaim.get(claim.localId) || [];
  const concept = resolveClaimConceptV2(claim, input.input.canonicalConcepts);
  if (!concept) return reject("CONCEPT_INVALID", "concept");
  const kind = normalizeClaimKind(claim, {
    conceptKind: concept.conceptKind,
    preferenceHolderSupported: preferenceHolderSupported(claim, input.evidence.frame, groundedEvidence),
  });
  if (!kind.consistent) return reject("CLAIM_KIND_INCONSISTENT", "confidence");
  const governedClaim = materializeGovernedStructure(claim, kind);
  const subject = resolveV2ClaimSubject({
    claim: governedClaim,
    entities: input.entities,
    frame: input.evidence.frame,
    groundedEvidence,
    ownerId: input.input.ownerId,
  });
  if (!subject) {
    const reason = claim.subjectRef ? input.entities.failuresByMention.get(claim.subjectRef) : "ENTITY_UNRESOLVED";
    return reject(reason || "ENTITY_UNRESOLVED", "entity", true);
  }
  const temporal = normalizeTemporalSemanticsV2(governedClaim.temporal);
  if (!temporal) return reject("TEMPORAL_INVALID", "temporal");
  const lifecycle = evaluateLifecycleCompatibilityV2({
    claim: governedClaim, concept, subjectId: subject.id, activeEpisodes: input.input.activeEpisodes || [],
    episodeConcepts: input.input.episodeConcepts || [],
  });
  if (!lifecycle.compatible) return reject("LIFECYCLE_INCOMPATIBLE", "lifecycle", true);

  const relatedMentionIds = governedClaim.kind === "relationship" ? [governedClaim.objectRef]
    : governedClaim.kind === "event" ? governedClaim.participants.map((item) => item.entityRef) : [];
  const resolvedEntities = uniqueEntities([
    ...(subject.id && subject.sourceMentionId && (subject.type === "owner" || subject.type === "pet")
      ? [{ entityType: subject.type, entityId: subject.id, sourceMentionId: subject.sourceMentionId, confidence: subject.confidence } satisfies ResolvedEntity]
      : []),
    ...relatedMentionIds.map((id) => input.entities.resolvedEntitiesByMention.get(id)),
  ].filter((item): item is ResolvedEntity => Boolean(item)));
  if (governedClaim.kind === "relationship" && !input.entities.subjectsByMention.has(governedClaim.objectRef)) {
    return reject(input.entities.failuresByMention.get(governedClaim.objectRef) || "ENTITY_UNRESOLVED", "entity", true);
  }
  const operationType = operationForClaim(governedClaim);
  const correctionTargetResolved = governedClaim.kind !== "correction" || Boolean(resolveCorrectionTarget(governedClaim, input.evidence.frame.claims, input.input.previousClaimTargets || {}));
  if (!correctionTargetResolved) return reject("CORRECTION_TARGET_UNRESOLVED", "permission", true);
  const governedConfidence = Math.min(claim.uncertainty.confidence, subject.confidence);
  const durability = governedClaim.kind === "assertion" ? governedClaim.durability : "unknown";
  const persistence = decidePersistenceV2({
    subjectType: subject.type, claimKind: governedClaim.kind, operation: operationType, durability, temporal,
    lifecycleRole: lifecycle.role, governedConfidence, modality: governedClaim.modality,
    correctionTargetResolved, safetyFloor: input.safetyFloor,
  });
  return {
    sourceLocalClaimKey: claim.localId,
    proposed: claim,
    subject,
    resolvedEntities,
    groundedEvidence,
    temporal,
    extractionConfidence: claim.uncertainty.confidence,
    conceptKey: concept.key,
    canonicalConceptKey: concept.canonicalKey,
    conceptVersion: concept.version,
    conceptResolutionStatus: concept.status,
    conceptAuthority: concept.authority,
    claimKind: governedClaim.kind,
    operationType,
    structuredValue: structuredValue(governedClaim),
    unit: governedClaim.kind === "assertion" ? governedClaim.unit : null,
    durability,
    lifecycleRole: lifecycle.role,
    lifecycleTransition: lifecycle.transition,
    serverEpisodeId: lifecycle.serverEpisodeId,
    governedConfidence,
    persistenceDestination: persistence.destination,
    persistenceEligible: persistence.eligible,
    proposedPersistenceHint: claim.persistenceHint,
    persistencePolicyReasons: persistence.reasons,
    persistencePermission: "shadow_only",
    provenanceClassification: "ask_v2_shadow",
    governanceMetadata: {
      conceptSource: concept.source,
      declaredClaimKind: claim.kind,
      structuralClaimKind: governedClaim.kind,
      claimKindAuthority: kind.authority,
      lifecycleReason: lifecycle.reason,
      persistenceReasons: persistence.reasons,
    },
    safetyFloorMetadata: input.safetyFloor,
  };
}

function preferenceHolderSupported(
  claim: ProposedSemanticClaim,
  frame: ProposedSemanticFrame,
  evidence: Array<{ quote: string }>,
) {
  if (claim.kind !== "assertion") return false;
  if (/\b(?:i|me|my|mine)\b/i.test(evidence.map((item) => item.quote).join(" "))) return true;
  const subjectMention = claim.subjectRef ? frame.mentions.find((mention) => mention.localId === claim.subjectRef) : null;
  return subjectMention?.coarseType === "animal";
}

function materializeGovernedStructure(
  claim: ProposedSemanticClaim,
  normalization: ClaimKindNormalization,
): ProposedSemanticClaim {
  if (normalization.structuralKind !== "preference" || claim.kind !== "assertion") return claim;
  return {
    ...claim,
    kind: "preference",
    preference: claim.polarity === "negated" ? "avoid" : "prefer",
    object: { concept: claim.predicate, value: Array.isArray(claim.value) ? claim.value[0] ?? null : claim.value },
    constraints: [],
  };
}

function operationForClaim(claim: ProposedSemanticClaim): ClaimOperation {
  if (claim.kind !== "correction") return "assert";
  if (claim.operation === "retract") return "retract";
  if (claim.operation === "replace") return "correct";
  if (claim.operation === "confirm") return "confirm";
  if (claim.operation === "forget") return "forget";
  return "correct";
}

function structuredValue(claim: ProposedSemanticClaim): unknown {
  if (claim.kind === "assertion") return { value: claim.value };
  if (claim.kind === "event") return { participants: claim.participants, lifecycle: claim.lifecycle };
  if (claim.kind === "state_transition") return { fromState: claim.fromState, toState: claim.toState };
  if (claim.kind === "preference") return { preference: claim.preference, object: claim.object, constraints: claim.constraints };
  if (claim.kind === "relationship") return { objectRef: claim.objectRef, qualifiers: claim.qualifiers };
  return { operation: claim.operation, target: claim.target, replacementClaimRef: claim.replacementClaimRef };
}

function relationsForClaim(
  claim: GovernedSemanticClaim,
  allClaims: ProposedSemanticClaim[],
  previousClaimTargets: Record<string, PreviousClaimTarget>,
): GovernedClaimRelation[] {
  if (claim.proposed.kind !== "correction") return [];
  const proposed = claim.proposed;
  const targetLocal = proposed.target.claimRef && allClaims.some((item) => item.localId === proposed.target.claimRef)
    ? proposed.target.claimRef : null;
  const replacementLocal = proposed.replacementClaimRef && allClaims.some((item) => item.localId === proposed.replacementClaimRef)
    ? proposed.replacementClaimRef : null;
  const relationType = proposed.operation === "retract" || proposed.operation === "forget" ? "retracts"
    : proposed.operation === "confirm" ? "confirms" : "corrects";
  const target = targetLocal || replacementLocal;
  const previous = proposed.target.claimRef ? previousClaimTargets[proposed.target.claimRef] : undefined;
  if ((!target && !previous) || target === claim.sourceLocalClaimKey) return [];
  return [{
    sourceLocalRelationKey: `relation_${claim.sourceLocalClaimKey}`,
    fromLocalClaimKey: claim.sourceLocalClaimKey,
    toLocalClaimKey: target || null,
    toClaimId: target ? null : previous?.claimId || null,
    relationType,
    metadata: { operation: proposed.operation },
  }];
}

function resolveCorrectionTarget(
  claim: Extract<ProposedSemanticClaim, { kind: "correction" }>,
  allClaims: ProposedSemanticClaim[],
  previousClaimTargets: Record<string, PreviousClaimTarget>,
) {
  const claimRef = claim.target.claimRef;
  if (!claimRef || claimRef === claim.localId) return null;
  return allClaims.find((candidate) => candidate.localId === claimRef) || previousClaimTargets[claimRef] || null;
}

function uniqueEntities(entities: ResolvedEntity[]) {
  return entities.filter((entity, index) => entities.findIndex((candidate) =>
    candidate.entityType === entity.entityType && candidate.entityId === entity.entityId) === index);
}
