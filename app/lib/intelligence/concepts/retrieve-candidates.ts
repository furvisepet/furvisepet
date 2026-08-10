import type { ProposedConcept } from "../semantic-frame/types.ts";
import { conceptTokenSimilarity, lexicalConceptSignature, normalizeConceptLabel } from "./normalize-concept.ts";

export type SemanticConceptRecord = {
  key: string;
  label: string;
  aliases: string[];
  source: "production_event" | "production_action" | "production_learning" | "active_episode";
};
export type ConceptRelation = "identity" | "parent" | "related";
export type ConceptCandidate = {
  key: string;
  relation: ConceptRelation;
  score: number;
  basis: "exact" | "lexical_equivalence" | "declared_alias" | "declared_parent" | "declared_related" | "token_similarity";
  source: SemanticConceptRecord["source"];
};

export function retrieveConceptCandidates(concept: ProposedConcept, records: SemanticConceptRecord[]): ConceptCandidate[] {
  const label = normalizeConceptLabel(concept.label);
  const aliases = new Set(concept.aliases.map(normalizeConceptLabel).filter(Boolean));
  const parents = new Set(concept.parentLabels.map(normalizeConceptLabel).filter(Boolean));
  const related = new Set(concept.relatedLabels.map(normalizeConceptLabel).filter(Boolean));
  const candidates = records.map((record) => {
    const key = normalizeConceptLabel(record.key || record.label);
    const recordAliases = new Set(record.aliases.map(normalizeConceptLabel).filter(Boolean));
    if (label && label === key) return candidate(record, "identity", 1, "exact");
    if (lexicalConceptSignature(label) && lexicalConceptSignature(label) === lexicalConceptSignature(key)) {
      return candidate(record, "identity", 0.96, "lexical_equivalence");
    }
    if (aliases.has(key) || recordAliases.has(label)) return candidate(record, "identity", 0.95, "declared_alias");
    if (parents.has(key)) return candidate(record, "parent", 0.9, "declared_parent");
    if (related.has(key)) return candidate(record, "related", 0.86, "declared_related");
    const similarity = conceptTokenSimilarity(label, key);
    return similarity > 0 ? candidate(record, "related", Math.min(0.79, 0.45 + similarity * 0.34), "token_similarity") : null;
  }).filter((item): item is ConceptCandidate => Boolean(item));
  const unique = new Map<string, ConceptCandidate>();
  for (const item of candidates) {
    const identity = `${item.key}:${item.relation}`;
    const existing = unique.get(identity);
    if (!existing || item.score > existing.score || item.score === existing.score && item.source === "active_episode") unique.set(identity, item);
  }
  return [...unique.values()].sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
}

function candidate(record: SemanticConceptRecord, relation: ConceptRelation, score: number, basis: ConceptCandidate["basis"]): ConceptCandidate {
  return { key: normalizeConceptLabel(record.key || record.label), relation, score, basis, source: record.source };
}
