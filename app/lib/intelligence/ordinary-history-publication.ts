import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import { derivePublicationAuthority, supportedHistoryPublication } from "./publication-authority.ts";
import { labsListReviewFailure, labsListSourceIds } from "./labs-list.ts";

/** No new receipt: publication verifies the existing Labs snapshot and organ authority. */
export function historyLabsAuthorityFailure(result: AskReasoningResult): string | null {
  const failure = labsListReviewFailure(result);
  if (failure) return failure;
  const authority = derivePublicationAuthority(result.evidenceContract, result.labsList!.records);
  if (!authority || !result.labsList || !supportedHistoryPublication(result.evidenceContract!))
    return "history_publication_unsupported";
  if (!authority.transportValid) return "history_publication_transport_invalid";
  const ids = labsListSourceIds(result.labsList);
  if (ids.some(id => !authority.authorizedSourceIds.includes(id))
    || authority.authorizedSourceIds.some(id => !ids.includes(id)))
    return "history_publication_source_outside_authority";
  return null;
}

/** An operational limitation about this requested result, never an absence claim. */
export function historyPublicationLimitation(evidence: AskEvidenceContract): string {
  const authority = derivePublicationAuthority(evidence);
  return authority?.obligations.some(o => o.status === "unsupported")
    ? "The requested history operation is not supported by certified publication yet. I can’t provide a verified result for it."
    : "I couldn’t certify the requested history result from the available evidence. This does not establish that matching records are absent.";
}

export function historyLimitationFailure(result: AskReasoningResult): string | null {
  const evidence = result.evidenceContract;
  if (!evidence || result.model !== "server-history-unavailable" || result.labsList || result.profileFieldLabs
    || result.answer.title !== "Furvise" || result.answer.summary !== historyPublicationLimitation(evidence)
    || result.answer.sections.length || result.answer.safetyNote || result.suggestedFollowUps.length
    || result.historyNarrative || result.relevantContextIds.length || result.referencedRecords?.length
    || result.applicationActions.length || result.careActions.length || result.semanticEvents?.length
    || result.learnings.length || result.proposedHistoryUpdate.shouldOffer)
    return "history_publication_authority_required";
  return null;
}
