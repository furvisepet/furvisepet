import { dependsOnStoredState, factualLimitationFailure, FACTUAL_UNAVAILABLE, FACTUAL_LIMITATION } from "./factual-dispatch.ts";

import type { AskReasoningResult, AskProviderEvent } from "../ai/ask-reasoning.ts";
import type { GovernedAskExecutionPlan } from "./ask-execution-plan.ts";
import { isStoredRead, storedReadPublicationFailure, storedReadPublishedResult } from "./stored-read-publication.ts";
import { unsupportedProfilePresentation, profilePresentationLimitationFailure, PROFILE_PRESENTATION_UNAVAILABLE } from "./profile-presentation-limitation.ts";
import { profileFieldLabsReviewFailure, profileFieldSourceIds } from "./profile-field-labs.ts";
import { profileFieldValue } from "./profile-field-authority.ts";
import { labsListReviewFailure } from "./labs-list.ts";
import { requiresHistoryPublicationAuthority } from "./publication-authority.ts";
import { historyLabsAuthorityFailure, historyLimitationFailure } from "./ordinary-history-publication.ts";
import { clearHistoryReview, recordHistoryReview, historyReviewSignature as signature, recordHistoryReviewDiagnostic } from "./history-review-state.ts";
export { readReviewedHistoryAnswer } from "./history-review-state.ts";
/** Historical review verifies server authority only. It never invokes a provider. */
export async function reviewHistoricalAnswer({ result, client, onProviderEvent, repairAttempted = false, executionPlan }: {
  executionPlan?: GovernedAskExecutionPlan;
  result: AskReasoningResult;
  repairAttempted?: boolean;
  client?: { responses: { create: (request: Record<string, unknown>, options?: { signal: AbortSignal }) => Promise<Record<string, unknown>> } };
  onProviderEvent?: (event: AskProviderEvent) => void;
}): Promise<boolean> {
  clearHistoryReview(result);
  const decline = (reason: string) => { recordHistoryReviewDiagnostic(result, "declined", reason); return false; };
  recordHistoryReviewDiagnostic(result, "declined", "review_not_completed");
  const evidence = result.evidenceContract;
  if (result.model === FACTUAL_UNAVAILABLE) {
    const failure = factualLimitationFailure(result);
    if (failure) return decline(failure);
    if (executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length)) return decline("factual_limitation_has_pending_write");
    recordHistoryReview(result,{signature:signature(result),text:FACTUAL_LIMITATION,sourceIds:[],sourceContent:[]});
    recordHistoryReviewDiagnostic(result,"approved","deterministic_factual_limitation");return true;
  }
  if (isStoredRead(evidence)) {
    const failure=storedReadPublicationFailure(result);
    if(failure)return decline(failure);
    if(executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length))return decline("stored_read_has_pending_write");
    recordHistoryReview(result,{signature:signature(result),text:result.answer.summary,sourceIds:[...result.relevantContextIds],sourceContent:storedReadPublishedResult(evidence)?.records.map(r=>r.text)||[]});
    recordHistoryReviewDiagnostic(result,"approved","deterministic_stored_read_verified");return true;
  }
  if (unsupportedProfilePresentation(evidence) || result.model === PROFILE_PRESENTATION_UNAVAILABLE) {
    const failure = profilePresentationLimitationFailure(result);
    if (failure) return decline(failure);
    if (executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length))
      return decline("profile_presentation_has_pending_write");
    recordHistoryReview(result, { signature: signature(result), text: result.answer.summary, sourceIds: [], sourceContent: [] });
    recordHistoryReviewDiagnostic(result, "approved", "profile_presentation_unavailable");
    return true;
  }
  if (requiresHistoryPublicationAuthority(evidence)) {
    const failure = result.labsList ? historyLabsAuthorityFailure(result) : historyLimitationFailure(result);
    if (failure) return decline(failure);
    if (executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length))
      return decline("history_publication_has_pending_write");
    recordHistoryReview(result, { signature: signature(result), text: result.answer.summary,
      sourceIds: [...result.relevantContextIds], sourceContent: result.labsList?.records.map(row => row.body) || [] });
    recordHistoryReviewDiagnostic(result, "approved", result.labsList ? "deterministic_labs_list_verified" : "history_publication_unavailable");
    return true;
  }
  if (result.profileFieldLabs) {
    const failure = profileFieldLabsReviewFailure(result);
    if (failure) return decline(failure);
    if (executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length))
      return decline("profile_labs_has_pending_write");
    recordHistoryReview(result, { signature: signature(result), text: result.answer.summary,
      sourceIds: profileFieldSourceIds(result.profileFieldLabs),
      sourceContent: result.profileFieldLabs.projection.fields.filter(f => f.state !== "unavailable").map(profileFieldValue) });
    recordHistoryReviewDiagnostic(result, "approved", "deterministic_profile_fields_verified");
    return true;
  }
  if (result.labsList) {
    const failure = labsListReviewFailure(result);
    if (failure) {
      console.info("[Ask Labs] list rejected", { reason: failure, safetyLevel: result.safetyLevel });
      return decline(failure);
    }
    if (executionPlan && (executionPlan.semanticEvents.length || executionPlan.careActions.length))
      return decline("labs_list_has_pending_write");
    recordHistoryReview(result, { signature: signature(result), text: result.answer.summary,
      sourceIds: [...result.relevantContextIds], sourceContent: result.labsList.records.map(row => row.body) });
    recordHistoryReviewDiagnostic(result, "approved", "deterministic_labs_list_verified");
    console.info("[Ask Labs] list review", JSON.stringify({ coverage: result.labsList.coverage.status,
      recordIds: result.labsList.records.map(row => row.id), emittedCount: result.labsList.records.length,
      bodyCharacters: result.answer.summary.length, review: "exact_records_dates_bodies_order" }));
    return true;
  }
  return decline(dependsOnStoredState(evidence) ? "canonical_factual_publication_required" : "no_stored_factual_review");
}
