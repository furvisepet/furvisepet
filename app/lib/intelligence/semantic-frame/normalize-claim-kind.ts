import type { ProposedSemanticClaim, SemanticClaimKind } from "./types.ts";

export type ClaimKindNormalization = {
  claimId: string;
  declaredKind: SemanticClaimKind;
  structuralKind: SemanticClaimKind;
  consistent: boolean;
};

/** Structural normalization only. It deliberately contains no vocabulary rules. */
export function normalizeClaimKind(claim: ProposedSemanticClaim): ClaimKindNormalization {
  const item = claim as ProposedSemanticClaim & Record<string, unknown>;
  const structuralKind: SemanticClaimKind = "operation" in item && "target" in item ? "correction"
    : "objectRef" in item && "qualifiers" in item ? "relationship"
      : "preference" in item && "constraints" in item ? "preference"
        : "transition" in item && "targetConcept" in item ? "state_transition"
          : "lifecycle" in item && "participants" in item ? "event"
            : "assertion";
  return { claimId: claim.localId, declaredKind: claim.kind, structuralKind, consistent: claim.kind === structuralKind };
}
