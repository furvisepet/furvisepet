import { normalizeConceptLabel } from "../../concepts/normalize-concept.ts";
import type { GovernedConceptIdentity, ProposedSemanticClaim } from "../types.ts";

export const V2_PROVISIONAL_CONCEPT_VERSION = "ask_v2.concepts.provisional.v1" as const;

export type V2ConceptNormalization = {
  key: string;
  canonicalKey: string | null;
  version: string;
  status: "provisional" | "canonical";
  authority: "provisional_normalizer" | "governed_registry";
  source: "predicate" | "transition_target";
};

export function resolveClaimConceptV2(
  claim: ProposedSemanticClaim,
  canonicalConcepts: readonly GovernedConceptIdentity[] = [],
): V2ConceptNormalization | null {
  const concept = claim.kind === "state_transition" ? claim.targetConcept : claim.predicate;
  const key = normalizeConceptLabel(concept.label);
  if (!key || key.length > 120) return null;
  const canonical = canonicalConcepts.find((candidate) => candidate.key === key);
  return {
    key,
    canonicalKey: canonical?.key || null,
    version: canonical?.version || V2_PROVISIONAL_CONCEPT_VERSION,
    status: canonical ? "canonical" : "provisional",
    authority: canonical ? "governed_registry" : "provisional_normalizer",
    source: claim.kind === "state_transition" ? "transition_target" : "predicate",
  };
}
