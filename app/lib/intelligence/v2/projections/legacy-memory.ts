import type { IntelligenceLearning } from "../../types.ts";
import type { GovernedSemanticClaim, GovernedSemanticTurn } from "../types.ts";

/**
 * Projects only already-governed, non-lifecycle owner/pet preferences into the
 * legacy memory contract. This preserves legacy write authority while making
 * the server-resolved per-claim subject authoritative over model learning IDs.
 */
export function projectGovernedPreferencesToLegacyMemories(
  turn: GovernedSemanticTurn,
): IntelligenceLearning[] {
  return turn.acceptedClaims.flatMap((claim) => {
    if (!eligiblePreference(claim)) return [];
    const value = preferenceValue(claim);
    if (value === null || value === undefined || String(value).trim() === "") return [];
    const conceptKey = claim.canonicalConceptKey || claim.conceptKey;
    const factKey = claim.subject.type === "owner"
      ? conceptKey
      : qualifiedPetPreferenceKey(conceptKey, claim, value);
    const subjectType = claim.subject.type as "pet" | "owner";
    return [{
      subjectType,
      subjectId: claim.subject.id,
      category: "preference",
      factKey,
      canonicalConceptKey: conceptKey,
      factValue: {
        preference: preferenceOperation(claim),
        value,
        conceptKey,
      },
      confidence: claim.governedConfidence,
      importance: "medium",
      durability: "ongoing",
      action: "create",
      sourceExcerpt: claim.groundedEvidence.map((item) => item.quote).join(" "),
    } satisfies IntelligenceLearning];
  });
}

function eligiblePreference(claim: GovernedSemanticClaim) {
  return claim.claimKind === "preference"
    && claim.operationType === "assert"
    && !claim.lifecycleRole
    && !claim.lifecycleTransition
    && claim.safetyFloorMetadata.level === "routine"
    && (claim.subject.type === "pet" || claim.subject.type === "owner")
    && Boolean(claim.subject.id)
    && claim.subject.resolution === "owned"
    && claim.persistenceEligible
    && claim.persistenceDestination === (claim.subject.type === "pet" ? "pet_memory" : "owner_memory");
}

function preferenceValue(claim: GovernedSemanticClaim) {
  const structured = claim.structuredValue as { object?: { value?: unknown } } | null;
  return structured?.object?.value;
}

function qualifiedPetPreferenceKey(conceptKey: string, _claim: GovernedSemanticClaim, value: unknown) {
  return [conceptKey, normalize(String(value))]
    .filter(Boolean).join("_").slice(0, 100);
}

function preferenceOperation(claim: GovernedSemanticClaim) {
  const structured = claim.structuredValue as { preference?: unknown } | null;
  return structured?.preference === "avoid" ? "avoid" : "prefer";
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
