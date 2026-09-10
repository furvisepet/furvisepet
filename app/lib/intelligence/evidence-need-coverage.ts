import type { AskEvidenceContract } from "./ask-evidence.ts";
export type NeedCoverage = { needId: string; semanticSupport: "unverified";
  pets: Array<{ petId: string; candidateSourceIds: string[]; representedSourceIds: string[];
    state: "candidates_available" | "query_unavailable" | "not_represented" | "not_queried" | "no_candidate_match"; reasons: string[] }> };
/** Rebuilt from the final represented sources after EVERY prompt-budget change.
 * A lexical hit is a candidate, never proof that an obligation was answered. */
export function buildEvidenceNeedCoverage(evidence: AskEvidenceContract): NeedCoverage[] {
  return (evidence.interpretation?.request?.evidenceNeeds || []).map(need => ({
    needId: need.id, semanticSupport: "unverified",
    pets: evidence.scope.authorizedPetIds.filter(petId => !need.petIds || need.petIds.includes(petId)).map(petId => {
      const queries = (evidence.history?.needs || []).filter(query => query.petId === petId && query.needId === need.id);
      const candidateSourceIds = [...new Set(queries.flatMap(query => query.candidateIds))];
      const matching = evidence.represented.filter(span => span.petId === petId && span.sourceType === "care_update"
        && span.start === 0 && span.end === span.text.length && span.text.trim()
        && (candidateSourceIds.includes(span.sourceId) || need.terms.some(term => span.text.toLowerCase().includes(term.toLowerCase())))
        && !evidence.losses.some(loss => loss.sourceId === span.sourceId)
        && evidence.sources.some(source => source.petId === petId && source.loadedIds.includes(span.sourceId) && !["unavailable", "not_loaded"].includes(source.status))
        && !evidence.history?.provenance.some(source => source.sourceId === span.sourceId
          && !["effective_linked", "effective_replacement", "unverified_legacy", "unlinked_correction_uncertain"].includes(source.status)))
        ;
      const dated = matching.filter(span => span.occurredAt && Number.isFinite(Date.parse(span.occurredAt)));
      const boundary = need.order === "earliest" ? Math.min(...dated.map(span => Date.parse(span.occurredAt!)))
        : need.order === "latest" ? Math.max(...dated.map(span => Date.parse(span.occurredAt!))) : null;
      const representedSourceIds = (boundary !== null && dated.length
        ? matching.filter(span => span.occurredAt && Date.parse(span.occurredAt) === boundary) : matching).map(span => span.sourceId);
      const reasons = [...new Set([
        ...queries.flatMap(query => query.reason ? [query.reason] : []),
        ...candidateSourceIds.filter(id => !matching.some(span => span.sourceId === id)).map(() => "candidate_not_in_final_evidence"),
        ...evidence.losses.filter(loss => candidateSourceIds.includes(loss.sourceId)).map(loss => loss.reason),
        ...(queries.some(query => !query.exhausted) ? ["bounded_search_not_exhaustive"] : []),
        ...(evidence.interpretation?.request?.evidenceNeedIssues || []),
      ])];
      const state = representedSourceIds.length ? "candidates_available" : queries.some(query => query.status === "unavailable") ? "query_unavailable"
        : candidateSourceIds.length ? "not_represented" : !queries.length || queries.every(query => query.reason === "need_query_budget") ? "not_queried" : "no_candidate_match";
      return { petId, candidateSourceIds, representedSourceIds, state, reasons };
    }),
  }));
}
/** Count requested groups that would lose their last represented candidate.
 * The caller still enforces the hard budget when no zero-loss removal exists. */
export function evidenceRemovalCost(evidence: AskEvidenceContract, sourceId: string): number {
  const needs = (evidence.needCoverage || []).flatMap(need => need.pets.map(pet => pet.representedSourceIds));
  const dates = (evidence.history?.targets || []).map(target => evidence.represented
    .filter(span => span.sourceType === "care_update" && span.petId === target.petId && span.occurredAt?.slice(0, 10) === target.day)
    .map(span => span.sourceId));
  return [...needs, ...dates].filter(ids => ids.length === 1 && ids[0] === sourceId).length;
}
