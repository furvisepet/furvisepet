import type { GovernedSemanticTurn } from "./types.ts";

export type V2ShadowObservation = {
  proposedClaimCount: number;
  governedClaimCount: number;
  rejectedClaimCount: number;
  subjectBindings: Array<{ claimKey: string; subjectType: string; status: "owned" | "external" }>;
  concepts: Array<{ claimKey: string; conceptKey: string; canonicalConceptKey: string | null; status: string; version: string }>;
  lifecycle: Array<{ claimKey: string; role: string | null; transition: string | null; episodeMatched: boolean }>;
  persistence: Array<{ claimKey: string; eligible: boolean; proposedDestination: string; governedDestination: string; disagrees: boolean }>;
  rejectionReasons: Partial<Record<string, number>>;
};

export function observeGovernedSemanticTurnV2(turn: GovernedSemanticTurn): V2ShadowObservation {
  return {
    proposedClaimCount: turn.frame.claims.length,
    governedClaimCount: turn.acceptedClaims.length,
    rejectedClaimCount: turn.rejectedClaims.length,
    subjectBindings: turn.acceptedClaims.map((claim) => ({
      claimKey: claim.sourceLocalClaimKey, subjectType: claim.subject.type, status: claim.subject.resolution,
    })),
    concepts: turn.acceptedClaims.map((claim) => ({
      claimKey: claim.sourceLocalClaimKey, conceptKey: claim.conceptKey, canonicalConceptKey: claim.canonicalConceptKey,
      status: claim.conceptResolutionStatus, version: claim.conceptVersion,
    })),
    lifecycle: turn.acceptedClaims.map((claim) => ({
      claimKey: claim.sourceLocalClaimKey, role: claim.lifecycleRole,
      transition: claim.lifecycleTransition, episodeMatched: Boolean(claim.serverEpisodeId),
    })),
    persistence: turn.acceptedClaims.map((claim) => ({
      claimKey: claim.sourceLocalClaimKey, eligible: claim.persistenceEligible,
      proposedDestination: claim.proposedPersistenceHint, governedDestination: claim.persistenceDestination,
      disagrees: claim.proposedPersistenceHint !== claim.persistenceDestination,
    })),
    rejectionReasons: turn.rejectedClaims.reduce<Partial<Record<string, number>>>((counts, claim) => {
      counts[claim.reason] = (counts[claim.reason] || 0) + 1;
      return counts;
    }, {}),
  };
}
