import { normalizeConceptLabel } from "../../concepts/normalize-concept.ts";
import type { ProposedSemanticClaim } from "../types.ts";

export const V2_CONCEPT_VERSION = "ask_v2.concepts.v1" as const;

export type V2ConceptNormalization = {
  key: string;
  version: typeof V2_CONCEPT_VERSION;
  source: "predicate" | "transition_target";
};

export function normalizeClaimConceptV2(claim: ProposedSemanticClaim): V2ConceptNormalization | null {
  const concept = claim.kind === "state_transition" ? claim.targetConcept : claim.predicate;
  const key = normalizeConceptLabel(concept.label);
  if (!key || key.length > 120) return null;
  return { key, version: V2_CONCEPT_VERSION, source: claim.kind === "state_transition" ? "transition_target" : "predicate" };
}

