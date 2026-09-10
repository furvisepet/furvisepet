import type { ProposedConcept } from "./semantic-frame/types.ts";

export function normalizeConceptLabel(value: string) {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

export function conceptTokens(value: string) {
  return [...new Set(normalizeConceptLabel(value).split("_").map(normalizeToken).filter((token) => token.length > 1))];
}

export function lexicalConceptSignature(value: string) {
  return [...conceptTokens(value)].sort().join("|");
}

export function conceptTokenSimilarity(left: string, right: string) {
  const leftTokens = conceptTokens(left);
  const rightTokens = conceptTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap / (leftTokens.length + rightTokens.length - overlap);
}

function normalizeToken(token: string) {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return restoreTerminalE(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ed")) return restoreTerminalE(token.slice(0, -2));
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function restoreTerminalE(value: string) {
  return /(?:chang|improv|resolv|recurr|observ|continu)$/.test(value) ? `${value}e` : value.replace(/([b-df-hj-np-rt-vz])\1$/i, "$1");
}

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
