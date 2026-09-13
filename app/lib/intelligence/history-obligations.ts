import type { AskEvidenceContract } from "./ask-evidence.ts";
import { buildEvidenceNeedCoverage } from "./evidence-need-coverage.ts";
import type { TaskObligationReview } from "./history-review-selection.ts";
import { withinEvidenceNeedWindow, type EvidenceNeedWindow } from "./history-dates.ts";
export type HistoryObligation = { index: number; text: string; needId?: string; petId?: string;
  window?: EvidenceNeedWindow; availability?: string; representedSourceIds?: string[] };
export type ObligationCompletion = { index: number; needId?: string; petId?: string; window?: EvidenceNeedWindow;
  status: TaskObligationReview["status"]; sentenceIndexes: number[]; sourceIds: string[]; actionIndexes?: number[] };
/** Whole-task review determines fulfillment. An explicitly explained unknown
 * may fulfill a comparison while its clinical evidence remains limited. Never
 * promote a limited whole task, missing clause or pending mutation to success. */
export function historyTaskCompleted(completion: readonly ObligationCompletion[]): boolean {
  const whole = completion.find(item => item.index === 0);
  return !!whole && ["answered", "refused"].includes(whole.status)
    && completion.every(item => ["answered", "refused", ...(item.index > 0 ? ["limited"] : [])].includes(item.status));
}
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
  sources: readonly { sourceId: string; petId: string; occurredAt?: string | null; sourceType?: string;
    lookupScope?: { needId: string; window?: EvidenceNeedWindow } }[], completedEmptyNeedKeys: readonly string[] = [], inventories: readonly import("./record-inventory.ts").RecordInventory[] = []) {
  const failures: string[] = [], completion: ObligationCompletion[] = [];
  for (const obligation of obligations) {
    const review = reviews.find(item => item.index === obligation.index);
    if (!review) { failures.push("obligation_review_missing:" + obligation.index); continue; }
    const cited = new Set(review.sentenceIndexes.flatMap(index => sentences[index]?.sourceIds || []));
    const matching = sources.filter(source => cited.has(source.sourceId)
      && (!obligation.petId || source.petId === obligation.petId)
      && (withinEvidenceNeedWindow(source.occurredAt, obligation.window)
        // Search receipts describe an exact lookup scope, not an observation
        // timestamp. They can ground its bounded no-match explanation only.
        || source.sourceType === "lookup_receipt" && obligation.availability === "no_candidate_match"
          && source.sourceId === `lookup:${obligation.needId}:${obligation.petId}`
          && source.lookupScope?.needId === obligation.needId
          && JSON.stringify(source.lookupScope?.window || null) === JSON.stringify(obligation.window || null)
        || !!obligation.window && inventories.some(item => source.sourceId === `record-inventory:${item.petId}`
          && source.petId === item.petId && Date.parse(item.from) <= Date.parse(obligation.window!.from)
          && Date.parse(item.to) >= Date.parse(obligation.window!.to))));
    const completedEmptyExport = obligation.needId && obligation.petId && obligation.availability === "no_candidate_match"
      && completedEmptyNeedKeys.includes(JSON.stringify([obligation.needId, obligation.petId]));
    if (review.status === "answered" && obligation.petId && !matching.length && !completedEmptyExport)
      failures.push("obligation_evidence_scope:" + obligation.index);
    completion.push({ index: obligation.index, ...(obligation.needId ? { needId: obligation.needId } : {}),
      ...(obligation.petId ? { petId: obligation.petId } : {}), ...(obligation.window ? { window: obligation.window } : {}),
      status: review.status, ...(review.actionIndexes ? { actionIndexes: [...review.actionIndexes] } : {}), sentenceIndexes: [...review.sentenceIndexes], sourceIds: matching.map(source => source.sourceId) });
  }
  return { failures, completion };
}
