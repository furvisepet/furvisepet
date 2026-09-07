import type { AskEvidenceContract } from "./ask-evidence.ts";

/** Reading a correction's wording does not apply a correction edge or reassign
 * an event. Return complete validated text with the unresolved-link limitation. */
export function correctionReportAnswer(contract: AskEvidenceContract): string | null {
  if (contract.history?.corrections === "unavailable" || !contract.interpretation
    || !(/\b(?:correct\w*|retract\w*|supersed\w*)\b/i.test(contract.scope.requestText) || contract.interpretation.history?.from)) return null;
  const asksForCorrection = /\b(?:correct\w*|retract\w*|supersed\w*)\b/i.test(contract.scope.requestText);
  const terms = contract.interpretation.history?.terms || [];
  const corrections = contract.represented.filter(span => span.sourceType === "care_update"
    && (asksForCorrection || terms.some(term => span.text.toLowerCase().includes(term.toLowerCase())))
    && contract.scope.authorizedPetIds.includes(span.petId)
    && contract.history?.provenance.some(source => source.sourceId === span.sourceId && source.status === "unlinked_correction_uncertain")
    && span.start === 0 && span.end === span.text.length && span.text.trim()
    && !contract.losses.some(loss => loss.sourceId === span.sourceId)
    && contract.sources.some(source => source.petId === span.petId && source.status === "loaded" && source.loadedIds.includes(span.sourceId)));
  if (!corrections.length) return null;
  contract.answerSourceIds = corrections.map(span => span.sourceId);
  contract.answerContent = corrections.map(span =>
    "The correction note dated " + (span.occurredAt?.slice(0, 10) || "unknown") + " says: " + JSON.stringify(span.text));
  return contract.answerContent.join("\n\n") + "\n\nI can read what the correction says, but its link to the original report has not been verified. I would not treat the disputed report as confirmed symptom history.";
}
