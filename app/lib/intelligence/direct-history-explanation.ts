import type { AskEvidenceContract } from "./ask-evidence.ts";

/** Small source-attributed answers for two bounded logical questions.
 * Never infer diagnoses, current recovery, a correction edge, or causation. */
export function directHistoryExplanation(contract: AskEvidenceContract): string | null {
  const q = contract.scope.requestText;
  if (!contract.interpretation?.readOnly || !contract.history || contract.scope.status !== "resolved"
    || contract.scope.authorizedPetIds.length !== 1 || contract.history.corrections === "unavailable"
    || contract.history.reasons.includes("unlinked_correction_uncertain")
    || /\b(?:quote|verbatim|exact wording)\b/i.test(q)) return null;
  const period = contract.interpretation.history;
  const notes = contract.represented.filter(span => span.sourceType === "care_update"
    && span.petId === contract.scope.authorizedPetIds[0] && span.start === 0 && span.end === span.text.length
    && !!span.occurredAt && Number.isFinite(Date.parse(span.occurredAt)) && Date.parse(span.occurredAt) <= Date.now()
    && (!period?.from || span.occurredAt >= period.from && span.occurredAt < period.to!)
    && !contract.losses.some(loss => loss.sourceId === span.sourceId)
    && contract.sources.some(source => source.petId === span.petId && source.loadedIds.includes(span.sourceId)
      && !["unavailable", "not_loaded"].includes(source.status))
    && contract.history!.provenance.some(source => source.sourceId === span.sourceId
      && ["effective_linked", "effective_replacement", "unverified_legacy"].includes(source.status)));
  const finish = (answer: string, sources: typeof notes) => {
    contract.answerSourceIds = sources.map(source => source.sourceId);
    contract.answerContent = [answer];
    return answer;
  };
  // Only an explicit joint intervention supports this explanation. A temporal
  // association alone never proves that either change caused an outcome.
  if (/\baccidents?\b/i.test(q) && /\b(?:prove|proof)\b/i.test(q) && /\bcaus(?:e|ed)\b/i.test(q)) {
    const joint = notes.find(note => /\b(?:litter|tray)\b/i.test(q) && /\blitter\b/i.test(note.text)
      && /\b(?:moved|relocated)\b/i.test(note.text) && /\b(?:changed|switched|returned)\b/i.test(note.text)
      && /\b(?:same day|both things together|both changes together)\b/i.test(note.text)
      && !/\b(?:not|never|might|maybe|possibly|if|unless)\b/i.test(note.text));
    if (joint) return finish("No. The note dated " + joint.occurredAt!.slice(0, 10)
      + " records the tray location and litter changing together: " + JSON.stringify(joint.text)
      + " Changing both together does not isolate which change, if either, caused the accidents.", [joint]);
  }
  if (/\bnever\b/i.test(q) && /\b(?:again|recurred|returned)\b/i.test(q)
    && /\bstiff(?:ness)?\b/i.test(q) && /\b(?:medication|course)\b/i.test(q)) {
    const completions = notes.filter(note => /\bfinished\b[^.!?]{0,60}\b(?:medication|course)\b/i.test(note.text)
      && !/\b(?:not|never|might|maybe|if)\b/i.test(note.text));
    if (completions.length !== 1) return null;
    const recurrence = notes.filter(note => note.occurredAt! > completions[0].occurredAt!
      && /\b(?:stiff again|stiffness (?:came back|returned|recurred))\b/i.test(note.text)
      && !/\b(?:not|never|might|maybe|if|unless)\b/i.test(note.text))
      .sort((a, b) => a.occurredAt!.localeCompare(b.occurredAt!))[0];
    if (recurrence) return finish("No. A later note, dated " + recurrence.occurredAt!.slice(0, 10)
      + ", reports stiffness again after the recorded course completion on " + completions[0].occurredAt!.slice(0, 10)
      + ": " + JSON.stringify(recurrence.text)
      + " This establishes a reported recurrence, not the current condition.", [completions[0], recurrence]);
  }
  return null;
}
