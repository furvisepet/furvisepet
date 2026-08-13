import { groundSemanticFrameEvidence } from "./ground-evidence.ts";
import { extractProposedSemanticFrame, type SemanticFrameValidationReason } from "./extract-frame.ts";
import { normalizeClaimKind } from "./normalize-claim-kind.ts";
import type { ProposedSemanticFrame } from "./types.ts";
import { resolveClaimConceptV2 } from "../v2/concepts/normalize.ts";
import type { GovernedConceptIdentity } from "../v2/types.ts";

export type SemanticFrameRecoveryReason =
  | "NOT_ATTEMPTED_FRAME_VALID"
  | "NOT_ATTEMPTED_NO_CANDIDATE"
  | "NOT_ATTEMPTED_RECOVERY_DISABLED"
  | "NOT_ATTEMPTED_NON_RECOVERABLE_VALIDATION_ERROR"
  | "RECOVERY_PRECONDITION_FAILED"
  | "RECOVERY_REVALIDATION_FAILED"
  | "RECOVERED_OWNER_PREFERENCE";

export type SemanticFrameRecoveryTelemetry = {
  applied: boolean;
  reason: SemanticFrameRecoveryReason;
  validationReason: SemanticFrameValidationReason | null;
};

export type OwnerPreferenceRecoveryContext = {
  sourceMessage: string;
  ownerIdentityVerified: boolean;
  canonicalConcepts: readonly GovernedConceptIdentity[];
  safetyLevel: "routine" | "caution" | "urgent";
};

export type OwnerPreferenceRecovery = {
  frame: ProposedSemanticFrame | null;
  telemetry: SemanticFrameRecoveryTelemetry;
};

/**
 * Repairs one narrow model referential-integrity error that JSON Schema cannot
 * express: a first-person owner preference may name an owner local ID without
 * emitting the corresponding mention. Subject identity remains server-owned.
 */
export function recoverOwnerPreferenceFrame(
  candidate: Record<string, unknown>,
  validationReason: SemanticFrameValidationReason,
  context: OwnerPreferenceRecoveryContext,
): OwnerPreferenceRecovery {
  const failed = (reason: SemanticFrameRecoveryReason): OwnerPreferenceRecovery => ({
    frame: null,
    telemetry: { applied: false, reason, validationReason },
  });
  if (validationReason !== "CLAIM_SUBJECT_REF_UNKNOWN") {
    return failed("NOT_ATTEMPTED_NON_RECOVERABLE_VALIDATION_ERROR");
  }
  if (!context.ownerIdentityVerified || context.safetyLevel !== "routine") {
    return failed("RECOVERY_PRECONDITION_FAILED");
  }

  if (!Array.isArray(candidate.claims) || candidate.claims.length !== 1) return failed("RECOVERY_PRECONDITION_FAILED");
  if (!Array.isArray(candidate.mentions) || !Array.isArray(candidate.references)) return failed("RECOVERY_PRECONDITION_FAILED");
  const uncertainty = candidate.uncertainty as Record<string, unknown> | null;
  if (!uncertainty || uncertainty.needsClarification !== false) return failed("RECOVERY_PRECONDITION_FAILED");

  const claim = candidate.claims[0] as Record<string, unknown> | null;
  if (!claim || !["assertion", "preference"].includes(String(claim.kind))) return failed("RECOVERY_PRECONDITION_FAILED");
  if (claim.persistenceHint !== "owner_memory" || claim.modality !== "asserted") return failed("RECOVERY_PRECONDITION_FAILED");
  if (typeof claim.subjectRef !== "string") return failed("RECOVERY_PRECONDITION_FAILED");
  const mentionIds = new Set(candidate.mentions.flatMap((mention) => {
    if (!mention || typeof mention !== "object") return [];
    const localId = (mention as Record<string, unknown>).localId;
    return typeof localId === "string" ? [localId] : [];
  }));
  if (mentionIds.has(claim.subjectRef)) return failed("RECOVERY_PRECONDITION_FAILED");

  const repaired = structuredClone(candidate);
  (repaired.claims as Array<Record<string, unknown>>)[0].subjectRef = null;
  const frame = extractProposedSemanticFrame(repaired);
  if (!frame) return failed("RECOVERY_REVALIDATION_FAILED");

  const grounding = groundSemanticFrameEvidence(frame, context.sourceMessage);
  if (grounding.failures.length || grounding.totalEvidence === 0 || grounding.exactEvidence !== grounding.totalEvidence) return failed("RECOVERY_PRECONDITION_FAILED");
  const groundedClaim = grounding.frame.claims[0];
  const groundedEvidence = grounding.frame.claims[0].evidence.flatMap((item) =>
    "alignment" in item ? [item] : []);
  const evidenceText = groundedEvidence.map((item) => item.quote).join(" ");
  if (!explicitFirstPersonPreferenceHolder(evidenceText)) return failed("RECOVERY_PRECONDITION_FAILED");
  if (grounding.frame.mentions.some((mention) =>
    mention.coarseType === "person" && mention.attributes.ownership !== "owner")) return failed("RECOVERY_PRECONDITION_FAILED");

  const concept = resolveClaimConceptV2(groundedClaim, context.canonicalConcepts, {
    frame: grounding.frame,
    groundedEvidence,
  });
  if (!concept || concept.status !== "canonical" || concept.conceptKind !== "preference" || concept.lifecycleCapable !== false) return failed("RECOVERY_PRECONDITION_FAILED");
  const authority = context.canonicalConcepts.find((item) => item.key === concept.canonicalKey);
  if (authority?.semanticRole !== "retailer_preference") return failed("RECOVERY_PRECONDITION_FAILED");
  const kind = normalizeClaimKind(groundedClaim, { conceptKind: concept.conceptKind, preferenceHolderSupported: true });
  if (!kind.consistent || kind.structuralKind !== "preference") return failed("RECOVERY_PRECONDITION_FAILED");

  return {
    frame,
    telemetry: { applied: true, reason: "RECOVERED_OWNER_PREFERENCE", validationReason },
  };
}

function explicitFirstPersonPreferenceHolder(value: string) {
  return /(?:^|[.!?]\s+)i\s+(?:(?:really|usually|generally|personally|would)\s+){0,2}(?:prefer|like|love|dislike|avoid|require|need|want)\b/i.test(value)
    || /\bmy\s+(?:favorite|favourite|preferred)\b/i.test(value);
}
