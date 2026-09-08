import { correctionReportAnswer } from "./correction-report.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { evidenceAnswerPolicy, type AskEvidenceContract } from "./ask-evidence.ts";
import { requestedHistoryTimelineDays } from "./requested-history-timeline.ts";

/** A literal event list or qualified correction with complete sources can skip generation.
 * This is a read composer; normal downstream safety and write governance still run. */
export function directHistoryTimelineAnswer(contract: AskEvidenceContract): string | null {
  const plan = contract.interpretation;
  const q = contract.scope.requestText;
  if (!plan?.readOnly || plan.clarification || !plan.history || !contract.history
    || contract.scope.status !== "resolved" || !contract.scope.readOnlyRecall
    || contract.scope.authorizedPetIds.length !== 1 || plan.petIds.length !== 1
    || plan.petIds[0] !== contract.scope.authorizedPetIds[0]
    || contract.history.corrections === "unavailable" || contract.episodes
    || analyzeOwnerAssertions(q).hasOwnerAssertion) return null;
  // A complete, qualified correction quotation already has server authority.
  // Do not wait for a model to produce prose that final validation will replace.
  const correction = correctionReportAnswer(contract);
  if (correction) return correction;
  const days = requestedHistoryTimelineDays(q, new Date().getUTCFullYear());
  const name = contract.petNames?.[plan.petIds[0]];
  if (!days || !name) return null;
  const withoutName = q.replaceAll(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"giu"),"");
  const wording = withoutName.replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b/gi,"");
  const allowed = new Set("for list show what happened on and in chronological order please events the".split(" "));
  if ((wording.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).some(word=>!allowed.has(word))) return null;
  const usable = contract.represented.filter(span => span.petId === plan.petIds[0] && span.sourceType === "care_update"
    && span.start === 0 && span.end === span.text.length && span.text.trim()
    && !contract.losses.some(loss=>loss.sourceId===span.sourceId)
    && contract.sources.some(source=>source.petId===span.petId && source.loadedIds.includes(span.sourceId) && !["unavailable","not_loaded"].includes(source.status)));
  if (days.some(day=>!usable.some(span=>span.occurredAt?.slice(0,10)===day))) return null;
  return evidenceAnswerPolicy(contract);
}
