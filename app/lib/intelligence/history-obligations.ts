import type { AskEvidenceContract } from "./ask-evidence.ts";
import { buildEvidenceNeedCoverage } from "./evidence-need-coverage.ts";
import type { TaskObligationReview } from "./history-review-selection.ts";
import { withinEvidenceNeedWindow, type EvidenceNeedWindow } from "./history-dates.ts";
export type HistoryObligation = { index: number; text: string; needId?: string; petId?: string;
  window?: EvidenceNeedWindow; availability?: string; representedSourceIds?: string[] };
export type ObligationCompletion = { index: number; needId?: string; petId?: string; window?: EvidenceNeedWindow;
  status: "answered" | "limited" | "missing"; sentenceIndexes: number[]; sourceIds: string[] };
/** One whole-question obligation plus one for each requested fact/owned pet.
 * Decomposition is advisory; retaining the whole question prevents silent loss. */
export function buildHistoryObligations(evidence: AskEvidenceContract): HistoryObligation[] {
  const obligations: HistoryObligation[] = [{ index: 0, text: evidence.scope.requestText }];
  const coverage = buildEvidenceNeedCoverage(evidence);
  for (const need of evidence.interpretation?.request?.evidenceNeeds || []) {
    for (const pet of coverage.find(item => item.needId === need.id)?.pets || []) {
      obligations.push({ index: obligations.length, text: need.quote, needId: need.id, petId: pet.petId,
        ...(need.window ? { window: need.window } : {}), availability: pet.state,
        representedSourceIds: pet.representedSourceIds });
    }
  }
  // Larger cohorts still need per-pet completion when decomposition is absent
  // or covers only part of the requested group.
  if (evidence.scope.authorizedPetIds.length > 3) for (const petId of evidence.scope.authorizedPetIds) {
    if (obligations.some(item => item.petId === petId)) continue;
    obligations.push({ index: obligations.length, text: evidence.scope.requestText, petId,
      representedSourceIds: evidence.represented.filter(span => span.petId === petId && span.sourceType === "care_update")
        .map(span => span.sourceId) });
  }
  return obligations;
}
/** Semantic review remains model-assisted. This verifies its completion claims
 * have cited evidence for the assigned subject and interval, not merely a
 * syntactically valid sentence index pointing at another pet's answer. */
export function reviewObligationCompletion(obligations: readonly HistoryObligation[], reviews: readonly TaskObligationReview[],
  sentences: readonly { sourceIds: string[] }[],
  sources: readonly { sourceId: string; petId: string; occurredAt?: string | null }[]) {
  const failures: string[] = [], completion: ObligationCompletion[] = [];
  for (const obligation of obligations) {
    const review = reviews.find(item => item.index === obligation.index);
    if (!review) { failures.push("obligation_review_missing:" + obligation.index); continue; }
    const cited = new Set(review.sentenceIndexes.flatMap(index => sentences[index]?.sourceIds || []));
    const matching = sources.filter(source => cited.has(source.sourceId)
      && (!obligation.petId || source.petId === obligation.petId)
      && withinEvidenceNeedWindow(source.occurredAt, obligation.window));
    if (review.status === "answered" && obligation.petId && !matching.length)
      failures.push("obligation_evidence_scope:" + obligation.index);
    completion.push({ index: obligation.index, ...(obligation.needId ? { needId: obligation.needId } : {}),
      ...(obligation.petId ? { petId: obligation.petId } : {}), ...(obligation.window ? { window: obligation.window } : {}),
      status: review.status, sentenceIndexes: [...review.sentenceIndexes], sourceIds: matching.map(source => source.sourceId) });
  }
  return { failures, completion };
}
