import type { ProposedSemanticClaim, SemanticClaimKind } from "./types.ts";

export type ClaimKindNormalization = {
  claimId: string;
  declaredKind: SemanticClaimKind;
  structuralKind: SemanticClaimKind;
  consistent: boolean;
  authority: "model_structure" | "governed_concept";
};

/** Structural normalization uses shape plus optional server-owned concept authority. */
export function normalizeClaimKind(claim: ProposedSemanticClaim, authority: {
  conceptKind?: string | null;
  preferenceHolderSupported?: boolean;
} = {}): ClaimKindNormalization {
  const item = claim as ProposedSemanticClaim & Record<string, unknown>;
  const shapeKind: SemanticClaimKind = "operation" in item && "target" in item ? "correction"
    : "objectRef" in item && "qualifiers" in item ? "relationship"
      : "preference" in item && "constraints" in item ? "preference"
        : "transition" in item && "targetConcept" in item ? "state_transition"
          : "lifecycle" in item && "participants" in item ? "event"
            : "assertion";
  const governedPreference = authority.conceptKind === "preference"
    && authority.preferenceHolderSupported === true
    && shapeKind === "assertion";
  const structuralKind = governedPreference ? "preference" : shapeKind;
  return {
    claimId: claim.localId,
    declaredKind: claim.kind,
    structuralKind,
    consistent: governedPreference || claim.kind === shapeKind,
    authority: governedPreference ? "governed_concept" : "model_structure",
  };
}
