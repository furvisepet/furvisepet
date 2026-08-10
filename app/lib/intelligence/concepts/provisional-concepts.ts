import type { ProposedConcept } from "../semantic-frame/types.ts";
import { normalizeConceptLabel } from "./normalize-concept.ts";
import { retrieveConceptCandidates, type ConceptCandidate, type ConceptRelation, type SemanticConceptRecord } from "./retrieve-candidates.ts";

export const SHADOW_CONCEPT_POLICY = { identityThreshold: 0.92, winningMargin: 0.12 } as const;

export type ShadowConceptResolution = {
  proposedKey: string;
  status: "resolved" | "ambiguous" | "provisional";
  canonicalKey: string | null;
  relation: ConceptRelation | "provisional";
  confidence: number;
  candidates: ConceptCandidate[];
};

export function resolveProvisionalConcept(concept: ProposedConcept, records: SemanticConceptRecord[]): ShadowConceptResolution {
  const candidates = retrieveConceptCandidates(concept, records);
  const identities = candidates.filter((item) => item.relation === "identity" && item.score >= SHADOW_CONCEPT_POLICY.identityThreshold);
  const top = identities[0];
  const second = identities[1];
  if (top && (!second || top.score - second.score >= SHADOW_CONCEPT_POLICY.winningMargin)) {
    return { proposedKey: normalizeConceptLabel(concept.label), status: "resolved", canonicalKey: top.key, relation: "identity", confidence: top.score, candidates };
  }
  if (top) return { proposedKey: normalizeConceptLabel(concept.label), status: "ambiguous", canonicalKey: null, relation: "provisional", confidence: top.score, candidates };
  const relation = candidates.find((item) => item.relation !== "identity");
  return {
    proposedKey: normalizeConceptLabel(concept.label), status: "provisional", canonicalKey: null,
    relation: relation?.relation || "provisional", confidence: relation?.score || 0, candidates,
  };
}

export function uniqueProposedConcepts(concepts: ProposedConcept[]) {
  const seen = new Set<string>();
  return concepts.filter((concept) => {
    const key = normalizeConceptLabel(concept.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
