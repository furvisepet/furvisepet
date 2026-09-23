import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import { isTypedProfileRead, profileFieldProjection } from "./profile-field-authority.ts";
import { labsPresentation } from "./labs-presentation.ts";

export const PROFILE_PRESENTATION_UNAVAILABLE = "server-profile-presentation-unavailable";
export const PROFILE_PRESENTATION_LIMITATION = "The requested profile output format is not supported by certified publication yet.";
export function unsupportedProfilePresentation(evidence: AskEvidenceContract | undefined): boolean {
  return isTypedProfileRead(evidence) && labsPresentation(evidence?.interpretation?.request?.outputFormat) === null;
}
/** Exact operational limitation only; the underlying factual projection remains authoritative. */
export function profilePresentationLimitationFailure(result: AskReasoningResult): string | null {
  const evidence = result.evidenceContract;
  if (!unsupportedProfilePresentation(evidence) || result.model !== PROFILE_PRESENTATION_UNAVAILABLE)
    return "profile_presentation_limitation_required";
  try {
    if (!profileFieldProjection(evidence)) return "profile_presentation_authority_missing";
  } catch { return "profile_presentation_snapshot_changed"; }
  if (result.profileFieldLabs || result.labsList || result.historyNarrative || result.historicalResult
    || result.answer.title !== "Furvise" || result.answer.summary !== PROFILE_PRESENTATION_LIMITATION
    || result.answer.sections.length || result.answer.safetyNote || result.suggestedFollowUps.length
    || result.relevantContextIds.length || result.referencedRecords?.length
    || result.applicationActions.length || result.careActions.length || result.semanticEvents.length
    || result.learnings.length || result.proposedHistoryUpdate.shouldOffer
    || Object.entries(result.proposedHistoryUpdate).some(([key, value]) => key !== "shouldOffer" && value !== null)
    || evidence?.answerSourceIds?.length || evidence?.answerContent?.length)
    return "profile_presentation_limitation_changed";
  return null;
}
