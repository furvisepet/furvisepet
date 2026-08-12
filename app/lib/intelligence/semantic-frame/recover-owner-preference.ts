import { groundSemanticFrameEvidence } from "./ground-evidence.ts";
import { extractProposedSemanticFrame } from "./extract-frame.ts";
import { normalizeClaimKind } from "./normalize-claim-kind.ts";
import type { ProposedSemanticFrame } from "./types.ts";
import { resolveClaimConceptV2 } from "../v2/concepts/normalize.ts";
import type { GovernedConceptIdentity } from "../v2/types.ts";

export const OWNER_PREFERENCE_RECOVERY_REASON = "CLAIM_SUBJECT_REF_UNKNOWN" as const;

export type OwnerPreferenceRecoveryContext = {
  sourceMessage: string;
  ownerIdentityVerified: boolean;
  canonicalConcepts: readonly GovernedConceptIdentity[];
  safetyLevel: "routine" | "caution" | "urgent";
};

export type OwnerPreferenceRecovery = {
  frame: ProposedSemanticFrame;
  reason: typeof OWNER_PREFERENCE_RECOVERY_REASON;
};

/**
 * Repairs one narrow model referential-integrity error that JSON Schema cannot
 * express: a first-person owner preference may name an owner local ID without
 * emitting the corresponding mention. Subject identity remains server-owned.
 */
export function recoverOwnerPreferenceFrame(
  value: unknown,
  context: OwnerPreferenceRecoveryContext,
): OwnerPreferenceRecovery | null {
  if (!context.ownerIdentityVerified || context.safetyLevel !== "routine") return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.claims) || candidate.claims.length !== 1) return null;
  if (!Array.isArray(candidate.mentions) || !Array.isArray(candidate.references)) return null;
  const uncertainty = candidate.uncertainty as Record<string, unknown> | null;
  if (!uncertainty || uncertainty.needsClarification !== false) return null;

  const claim = candidate.claims[0] as Record<string, unknown> | null;
  if (!claim || !["assertion", "preference"].includes(String(claim.kind))) return null;
  if (claim.persistenceHint !== "owner_memory" || claim.modality !== "asserted") return null;
  if (typeof claim.subjectRef !== "string") return null;
  const mentionIds = new Set(candidate.mentions.flatMap((mention) => {
    if (!mention || typeof mention !== "object") return [];
    const localId = (mention as Record<string, unknown>).localId;
    return typeof localId === "string" ? [localId] : [];
  }));
  if (mentionIds.has(claim.subjectRef)) return null;

  const repaired = structuredClone(candidate);
  (repaired.claims as Array<Record<string, unknown>>)[0].subjectRef = null;
  const frame = extractProposedSemanticFrame(repaired);
  if (!frame) return null;

  const grounding = groundSemanticFrameEvidence(frame, context.sourceMessage);
  if (grounding.failures.length || grounding.totalEvidence === 0 || grounding.exactEvidence !== grounding.totalEvidence) return null;
  const groundedClaim = grounding.frame.claims[0];
  const groundedEvidence = grounding.frame.claims[0].evidence.flatMap((item) =>
    "alignment" in item ? [item] : []);
  const evidenceText = groundedEvidence.map((item) => item.quote).join(" ");
  if (!explicitFirstPersonPreferenceHolder(evidenceText)) return null;
  if (grounding.frame.mentions.some((mention) =>
    mention.coarseType === "person" && mention.attributes.ownership !== "owner")) return null;

  const concept = resolveClaimConceptV2(groundedClaim, context.canonicalConcepts, {
    frame: grounding.frame,
    groundedEvidence,
  });
  if (!concept || concept.status !== "canonical" || concept.conceptKind !== "preference" || concept.lifecycleCapable !== false) return null;
  const authority = context.canonicalConcepts.find((item) => item.key === concept.canonicalKey);
  if (authority?.semanticRole !== "retailer_preference") return null;
  const kind = normalizeClaimKind(groundedClaim, { conceptKind: concept.conceptKind, preferenceHolderSupported: true });
  if (!kind.consistent || kind.structuralKind !== "preference") return null;

  return { frame, reason: OWNER_PREFERENCE_RECOVERY_REASON };
}

function explicitFirstPersonPreferenceHolder(value: string) {
  return /(?:^|[.!?]\s+)i\s+(?:(?:really|usually|generally|personally|would)\s+){0,2}(?:prefer|like|love|dislike|avoid|require|need|want)\b/i.test(value)
    || /\bmy\s+(?:favorite|favourite|preferred)\b/i.test(value);
}
