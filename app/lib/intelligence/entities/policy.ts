export const SHADOW_ENTITY_RESOLUTION_POLICY = {
  automaticThreshold: 0.84,
  winningMargin: 0.12,
  exactNameScore: 0.99,
  speciesScore: 0.84,
  lifeStageScore: 0.1,
  lifeStageConflictPenalty: 0.35,
  ownershipScore: 0.06,
  selectedPetPrior: 0.06,
  recentDiscourseScore: 0.9,
} as const;

export type SemanticReasonCode =
  | "ENTITY_SPECIES_CONFLICT"
  | "ENTITY_AMBIGUOUS"
  | "ENTITY_NO_MATCH"
  | "REFERENCE_AMBIGUOUS"
  | "REFERENCE_NO_MATCH"
  | "CONCEPT_AMBIGUOUS"
  | "EVIDENCE_UNSUPPORTED"
  | "CLAIM_LOW_CONFIDENCE"
  | "CLAIM_ACCEPTED"
  | "CLAIM_NO_PERSISTENCE"
  | "TRANSITION_INCOMPATIBLE"
  | "SHADOW_FRAME_INVALID";

export type EntityScoreBand = "strong" | "likely" | "weak" | "none";

export function entityScoreBand(score: number): EntityScoreBand {
  if (score >= 0.95) return "strong";
  if (score >= SHADOW_ENTITY_RESOLUTION_POLICY.automaticThreshold) return "likely";
  if (score >= 0.5) return "weak";
  return "none";
}
