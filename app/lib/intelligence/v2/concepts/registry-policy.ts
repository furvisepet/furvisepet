import type { GovernedConceptIdentity } from "../types.ts";

export type GovernedConceptSemanticRole =
  | "retailer_preference"
  | "food_preference"
  | "weight_measurement"
  | "caregiver_relationship"
  | "strict_medical";

type RegistryConceptPolicy = {
  semanticRole: GovernedConceptSemanticRole;
  selectionAuthority: "semantic_signature" | "exact_only";
};

// These policies describe stable server-owned registry concepts, not user
// phrases or model-proposed aliases. A policy has authority only when the
// corresponding concept is present in the active registry query.
const registryPolicies: Readonly<Record<string, RegistryConceptPolicy>> = {
  caregiver_relationship: { semanticRole: "caregiver_relationship", selectionAuthority: "semantic_signature" },
  food_preference: { semanticRole: "food_preference", selectionAuthority: "semantic_signature" },
  preferred_retailer: { semanticRole: "retailer_preference", selectionAuthority: "semantic_signature" },
  vomiting: { semanticRole: "strict_medical", selectionAuthority: "exact_only" },
  weight: { semanticRole: "weight_measurement", selectionAuthority: "semantic_signature" },
};

export function attachRegistryConceptPolicy(concept: GovernedConceptIdentity): GovernedConceptIdentity {
  const policy = registryPolicies[concept.key];
  return policy ? { ...concept, ...policy } : concept;
}
