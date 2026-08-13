import { normalizeConceptLabel } from "../../concepts/normalize-concept.ts";
import type { IntelligenceLearning } from "../../types.ts";
import type { GovernedSemanticClaim, GovernedSemanticTurn } from "../types.ts";
import { deduplicateGovernedClaims } from "../governance/deduplicate.ts";

export type Phase3ClaimClass = "owner_preference" | "pet_preference" | "owner_fact" | "pet_fact" | "relationship";
export type Phase3ConceptPolicy = { conceptKind: string; lifecycleCapable: boolean };
export type Phase3CutoverDecision = {
  claim: GovernedSemanticClaim;
  claimClass: Phase3ClaimClass | null;
  eligible: boolean;
  reason: string;
};

export function decidePhase3LowRiskClaim(
  claim: GovernedSemanticClaim,
  conceptPolicies: ReadonlyMap<string, Phase3ConceptPolicy>,
): Phase3CutoverDecision {
  const reject = (reason: string): Phase3CutoverDecision => ({ claim, claimClass: null, eligible: false, reason });
  if (!claim.persistenceEligible || claim.operationType !== "assert") return reject("not_governed_for_assertion_persistence");
  if (claim.lifecycleRole || claim.lifecycleTransition || claim.serverEpisodeId) return reject("lifecycle_not_in_cutover");
  if (claim.safetyFloorMetadata.level === "urgent") return reject("safety_not_in_cutover");
  if (claim.subject.type !== "owner" && claim.subject.type !== "pet") return reject("subject_not_in_cutover");
  if (!claim.subject.id || claim.subject.resolution !== "owned") return reject("owned_subject_required");
  const expectedMemory = claim.subject.type === "owner" ? "owner_memory" : "pet_memory";

  if (claim.claimKind === "preference") {
    if (claim.persistenceDestination !== expectedMemory) return reject("preference_destination_mismatch");
    return allowed(claim, claim.subject.type === "owner" ? "owner_preference" : "pet_preference");
  }
  if (claim.claimKind === "relationship") {
    if (claim.persistenceDestination !== "relationship") return reject("relationship_destination_mismatch");
    return allowed(claim, "relationship");
  }
  if (claim.claimKind !== "assertion" || !["ongoing", "durable"].includes(claim.durability)) {
    return reject("claim_class_not_in_cutover");
  }
  if (claim.persistenceDestination !== expectedMemory) return reject("fact_destination_mismatch");
  if (claim.conceptResolutionStatus !== "canonical" || !claim.canonicalConceptKey) return reject("durable_fact_requires_canonical_concept");
  const concept = conceptPolicies.get(claim.canonicalConceptKey);
  if (!concept || concept.lifecycleCapable || !["profile", "care_fact"].includes(concept.conceptKind)) {
    return reject("durable_fact_concept_not_low_risk");
  }
  return allowed(claim, claim.subject.type === "owner" ? "owner_fact" : "pet_fact");
}

export function selectPhase3LowRiskTurn(input: {
  turn: GovernedSemanticTurn;
  conceptPolicies: ReadonlyMap<string, Phase3ConceptPolicy>;
  legacyLearnings: IntelligenceLearning[];
  selectedPetId: string;
}) {
  const decisions = input.turn.acceptedClaims.map((claim) => decidePhase3LowRiskClaim(claim, input.conceptPolicies));
  const matched = decisions.filter((decision) => decision.eligible && hasMatchingLegacyLearning(decision.claim, input.legacyLearnings, input.selectedPetId));
  const matchedKeys = new Set(matched.map((decision) => decision.claim.sourceLocalClaimKey));
  const deduplicated = deduplicateGovernedClaims(
    matched.map((decision) => decision.claim),
    input.turn.relations.filter((relation) => matchedKeys.has(relation.fromLocalClaimKey)
      && (!relation.toLocalClaimKey || matchedKeys.has(relation.toLocalClaimKey))),
  );
  const acceptedByOriginalKey = new Map(matched.map((decision) => [decision.claim.sourceLocalClaimKey, decision]));
  const accepted = deduplicated.claims.map((claim) => ({
    ...acceptedByOriginalKey.get(claim.sourceLocalClaimKey)!,
    claim,
  }));
  const acceptedOrCollapsedKeys = new Set([
    ...accepted.map((decision) => decision.claim.sourceLocalClaimKey),
    ...deduplicated.duplicates.flatMap((duplicate) => duplicate.collapsedSourceLocalClaimKeys),
  ]);
  return {
    accepted,
    rejected: decisions.filter((decision) => !acceptedOrCollapsedKeys.has(decision.claim.sourceLocalClaimKey)).map((decision) => ({
      ...decision,
      reason: decision.eligible ? "no_exact_legacy_learning_match" : decision.reason,
    })),
    deduplicated: deduplicated.duplicates,
    turn: {
      ...input.turn,
      acceptedClaims: deduplicated.claims,
      rejectedClaims: [],
      relations: deduplicated.relations,
    },
  };
}

function hasMatchingLegacyLearning(claim: GovernedSemanticClaim, learnings: IntelligenceLearning[], selectedPetId: string) {
  return learnings.some((learning) => {
    if (!["create", "confirm", "update"].includes(learning.action)) return false;
    if (normalizeConceptLabel(learning.canonicalConceptKey || learning.factKey) !== (claim.canonicalConceptKey || claim.conceptKey)) return false;
    if (learning.subjectType !== claim.subject.type) return false;
    const legacySubjectId = learning.subjectType === "owner" ? claim.subject.id : learning.subjectId || selectedPetId;
    return legacySubjectId === claim.subject.id;
  });
}

function allowed(claim: GovernedSemanticClaim, claimClass: Phase3ClaimClass): Phase3CutoverDecision {
  return { claim, claimClass, eligible: true, reason: "low_risk_cutover_allowed" };
}
