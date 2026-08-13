import { normalizeConceptLabel } from "../../concepts/normalize-concept.ts";
import type { GroundedSemanticEvidence, ProposedSemanticFrame } from "../../semantic-frame/types.ts";
import type { GovernedConceptIdentity, ProposedSemanticClaim } from "../types.ts";

export const V2_PROVISIONAL_CONCEPT_VERSION = "ask_v2.concepts.provisional.v1" as const;

export type V2ConceptNormalization = {
  key: string;
  canonicalKey: string | null;
  version: string;
  status: "provisional" | "canonical";
  authority: "provisional_normalizer" | "governed_registry";
  source: "predicate" | "transition_target";
  conceptKind: GovernedConceptIdentity["conceptKind"] | null;
  lifecycleCapable: boolean | null;
  resolutionMethod: "exact_registry_key" | "semantic_signature" | "provisional" | "ambiguous";
  candidateKeys: string[];
};

export function resolveClaimConceptV2(
  claim: ProposedSemanticClaim,
  canonicalConcepts: readonly GovernedConceptIdentity[] = [],
  context?: { frame: ProposedSemanticFrame; groundedEvidence: GroundedSemanticEvidence[] },
): V2ConceptNormalization | null {
  const concept = claim.kind === "state_transition" ? claim.targetConcept : claim.predicate;
  const key = normalizeConceptLabel(concept.label);
  if (!key || key.length > 120) return null;
  const exact = canonicalConcepts.find((candidate) => candidate.key === key);
  const compatible = exact || !context ? [] : compatibleRegistryConcepts(claim, canonicalConcepts, context);
  const canonical = exact || (compatible.length === 1 ? compatible[0] : undefined);
  const ambiguous = !exact && compatible.length > 1;
  return {
    key,
    canonicalKey: canonical?.key || null,
    version: canonical?.version || V2_PROVISIONAL_CONCEPT_VERSION,
    status: canonical ? "canonical" : "provisional",
    authority: canonical ? "governed_registry" : "provisional_normalizer",
    source: claim.kind === "state_transition" ? "transition_target" : "predicate",
    conceptKind: canonical?.conceptKind || null,
    lifecycleCapable: canonical ? canonical.lifecycleCapable === true : null,
    resolutionMethod: exact ? "exact_registry_key" : canonical ? "semantic_signature" : ambiguous ? "ambiguous" : "provisional",
    candidateKeys: compatible.map((candidate) => candidate.key).sort(),
  };
}

function compatibleRegistryConcepts(
  claim: ProposedSemanticClaim,
  concepts: readonly GovernedConceptIdentity[],
  context: { frame: ProposedSemanticFrame; groundedEvidence: GroundedSemanticEvidence[] },
) {
  const signature = inferClaimSignature(claim, context);
  return concepts.filter((candidate) => candidate.selectionAuthority === "semantic_signature"
    && candidate.semanticRole
    && signature.roles.has(candidate.semanticRole));
}

function inferClaimSignature(
  claim: ProposedSemanticClaim,
  context: { frame: ProposedSemanticFrame; groundedEvidence: GroundedSemanticEvidence[] },
) {
  const evidence = context.groundedEvidence.map((item) => item.quote).join(" ");
  const subjectMention = claim.subjectRef
    ? context.frame.mentions.find((mention) => mention.localId === claim.subjectRef)
    : null;
  const firstPerson = /\b(?:i|me|my|mine)\b/i.test(evidence);
  const preferenceShape = claim.kind === "preference";
  const explicitPreferenceAssertion = claim.kind === "assertion"
    && /\b(?:likes?|prefers?|doesn't like|does not like|dislikes?|avoids?)\b/i.test(evidence);
  const externalValueMention = context.frame.mentions.some((mention) =>
    ["organization", "place", "product"].includes(mention.coarseType)
    && context.groundedEvidence.some((span) => span.quote.includes(mention.surface)));
  const weightMeasurement = claim.kind === "assertion"
    && typeof claim.unit === "string"
    && /^(?:lb|lbs|pound|pounds|kg|kgs|kilogram|kilograms|g|gram|grams|oz|ounce|ounces)$/i.test(claim.unit.trim());
  const relationshipShape = claim.kind === "relationship"
    && subjectMention?.coarseType === "person"
    && context.frame.mentions.some((mention) => mention.localId === claim.objectRef && mention.coarseType === "animal");
  const petHolder = subjectMention?.coarseType === "animal";
  const roles = new Set<NonNullable<GovernedConceptIdentity["semanticRole"]>>();
  if (firstPerson && externalValueMention && (preferenceShape || claim.kind === "assertion")) roles.add("retailer_preference");
  if ((preferenceShape || explicitPreferenceAssertion) && petHolder) roles.add("food_preference");
  if (weightMeasurement && petHolder) roles.add("weight_measurement");
  if (relationshipShape) roles.add("caregiver_relationship");
  return { roles };
}
