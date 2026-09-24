import { calculationPublicationFailure, CALCULATION_LABS, CALCULATION_UNAVAILABLE } from "./calculation-labs.ts";
import { factualLimitationFailure, FACTUAL_UNAVAILABLE, FACTUAL_LIMITATION } from "./factual-dispatch.ts";
import { isStoredRead, storedReadPublicationFailure, storedReadPublishedResult } from "./stored-read-publication.ts";
import { historyLimitationFailure, historyPublicationLimitation } from "./ordinary-history-publication.ts";
import { unsupportedProfilePresentation, profilePresentationLimitationFailure, PROFILE_PRESENTATION_UNAVAILABLE, PROFILE_PRESENTATION_LIMITATION } from "./profile-presentation-limitation.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";
import type { ObligationCompletion } from "./history-obligations.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import { derivePublicationAuthority, requiresHistoryPublicationAuthority, publicationClaimFailures, type PublicationAuthorityClaim } from "./publication-authority.ts";

type Receipt = { authorityClaims?: PublicationAuthorityClaim[]; actions?: FurviseApplicationAction[]; signature: string; text: string; sourceIds: string[]; proseText?: string; sourceReports?: string[]; sourceContent?: string[]; completion?: ObligationCompletion[] };
const reviewed = new WeakMap<AskReasoningResult, Receipt>();
export const historyReviewSignature = (result: AskReasoningResult) => JSON.stringify({ calculationLabs:result.calculationLabs, calculationAnswer:result.evidenceContract?.interpretation?.request?.calculatePlan ? {answer:result.answer,ids:result.relevantContextIds}:undefined, storedReadAnswer:isStoredRead(result.evidenceContract)?{answer:result.answer,ids:result.relevantContextIds}:undefined, profileFieldLabs: result.profileFieldLabs, labsList: result.labsList, labsAnswer: result.labsList || result.profileFieldLabs ? result.answer : undefined, labsSourceIds: result.labsList || result.profileFieldLabs ? result.relevantContextIds : undefined, actions: result.applicationActions, evidence: result.evidenceContract, draft: result.historyNarrative, result: result.historicalResult, plainAnswer: result.historyNarrativeDeclined ? result.answer.summary : undefined, sourceHints: result.historyNarrativeDeclined ? result.relevantContextIds : undefined });
export function clearHistoryReview(result: AskReasoningResult) { reviewed.delete(result); }
/** Internal server capability: called only after successful source-scoped review. */
export function recordHistoryReview(result: AskReasoningResult, receipt: Receipt) { reviewed.set(result, structuredClone(receipt)); }
/** A model field, clone, reload or changed evidence cannot forge this receipt. */
export function readReviewedHistoryAnswer(result: AskReasoningResult): Omit<Receipt, "signature"> | null {
  const receipt = reviewed.get(result);
  if (!receipt || receipt.signature !== historyReviewSignature(result)) return null;
  if(result.evidenceContract?.interpretation?.request?.calculatePlan || [CALCULATION_LABS,CALCULATION_UNAVAILABLE].includes(result.model)){
    if(calculationPublicationFailure(result)||receipt.text!==result.answer.summary
      ||JSON.stringify(receipt.sourceIds)!==JSON.stringify(result.relevantContextIds)
      ||receipt.sourceContent?.length||receipt.sourceReports?.length||receipt.proseText!==undefined
      ||receipt.actions?.length||receipt.authorityClaims?.length||receipt.completion?.length)return null;
    return {text:receipt.text,sourceIds:[...receipt.sourceIds],sourceContent:[]};
  }
  if(result.model===FACTUAL_UNAVAILABLE){
    if(factualLimitationFailure(result)||receipt.text!==FACTUAL_LIMITATION||receipt.sourceIds.length
      ||receipt.sourceContent?.length||receipt.sourceReports?.length||receipt.proseText!==undefined
      ||receipt.actions?.length||receipt.authorityClaims?.length||receipt.completion?.length)return null;
    return {text:receipt.text,sourceIds:[],sourceContent:[]};
  }
  if (isStoredRead(result.evidenceContract)) {
    if(storedReadPublicationFailure(result) || receipt.text!==result.answer.summary
      || JSON.stringify(receipt.sourceIds)!==JSON.stringify(result.relevantContextIds)
      || JSON.stringify(receipt.sourceContent || [])!==JSON.stringify(storedReadPublishedResult(result.evidenceContract)?.records.map(r=>r.text)||[])
      || receipt.actions?.length || receipt.authorityClaims?.length || receipt.completion?.length)return null;
    return {text:receipt.text,sourceIds:[...receipt.sourceIds],sourceContent:receipt.sourceContent?.slice()};
  }
  const profileLimitation = unsupportedProfilePresentation(result.evidenceContract) || result.model === PROFILE_PRESENTATION_UNAVAILABLE;
  const historyLimitation = requiresHistoryPublicationAuthority(result.evidenceContract)
    && result.model === "server-history-unavailable";
  // Only these exact server-owned no-fact contracts bypass factual claims.
  // Certified empty factual results retain the ordinary claim checks below.
  if (profileLimitation || historyLimitation) {
    const failure = profileLimitation ? profilePresentationLimitationFailure(result) : historyLimitationFailure(result);
    const text = profileLimitation ? PROFILE_PRESENTATION_LIMITATION : historyPublicationLimitation(result.evidenceContract!);
    if (failure || receipt.text !== text || receipt.sourceIds.length
      || receipt.authorityClaims?.length || receipt.actions?.length || receipt.completion?.length
      || receipt.sourceContent?.length || receipt.sourceReports?.length || receipt.proseText !== undefined) return null;
  }
  const authority = profileLimitation || historyLimitation || result.labsList || result.profileFieldLabs
    ? null : derivePublicationAuthority(result.evidenceContract);
  if (authority) {
    const claims = receipt.authorityClaims || [];
    // Unavailable is an explicit no-fact outcome, not a certified empty result.
    // The same receipt can cover it without inventing a factual authority claim.
    const claimBearing = authority.obligations.filter(o => o.authority !== "unavailable");
    const unavailable = authority.obligations.filter(o => o.authority === "unavailable");
    if (claimBearing.some(o => !claims.some(c => c.obligationId === o.obligationId))
      || unavailable.some(o => o.authorizedSourceIds.length || claims.some(c => c.obligationId === o.obligationId))
      || receipt.sourceIds.some(id => !claimBearing.some(o => o.authorizedSourceIds.includes(id)))
      || publicationClaimFailures(result.evidenceContract!, claims).length) return null;
  }
  return { ...(receipt.authorityClaims ? { authorityClaims: structuredClone(receipt.authorityClaims) } : {}), ...(receipt.actions ? { actions: structuredClone(receipt.actions) } : {}), ...(receipt.completion ? { completion: structuredClone(receipt.completion) } : {}), text: receipt.text, sourceIds: [...receipt.sourceIds], ...(receipt.proseText !== undefined ? { proseText: receipt.proseText } : {}), ...(receipt.sourceReports ? { sourceReports: [...receipt.sourceReports] } : {}), ...(receipt.sourceContent ? { sourceContent: [...receipt.sourceContent] } : {}) };
}

export type HistoryReviewDiagnostic = { status: "approved" | "declined"; reason: string };
const diagnostics = new WeakMap<AskReasoningResult, HistoryReviewDiagnostic>();
export type HistoryReviewAudit = {
  repairAttempted: boolean;
  rejectionReason?: string;
  reviewContractFailure?: {code: string; shape: string};
  anchorFailures?: Array<{index: number; reasons: string[]}>;
  dateBindings: Array<{index: number; citedSourceIds: string[]; candidates: Array<{anchor: string; sourceIds: string[]}>}>;
};
const audits = new WeakMap<AskReasoningResult, HistoryReviewAudit[]>();
/** Private persisted validation metadata only. Never log these source bindings
 * or present them as an answer, source of facts, or approval capability. */
export function recordHistoryReviewAudit(result: AskReasoningResult, audit: HistoryReviewAudit) {
  audits.set(result, [...(audits.get(result) || []).filter(item => item.repairAttempted !== audit.repairAttempted),
    structuredClone({...audit, rejectionReason: audit.rejectionReason?.slice(0,1600)})].slice(-2));
}
export function readHistoryReviewAudit(result: AskReasoningResult): HistoryReviewAudit[] {
  return structuredClone(audits.get(result) || []);
}
export function recordHistoryReviewDiagnostic(result: AskReasoningResult, status: HistoryReviewDiagnostic["status"], reason: string) {
  diagnostics.set(result, { status, reason });
}
export function readHistoryReviewDiagnostic(result: AskReasoningResult) {
  const value = diagnostics.get(result); return value ? { ...value } : null;
}

// Independently verified prose can survive whole-task rejection. This receipt
// never grants task completion or mutation authority, and is bound to the same
// evidence/draft identity as complete reviews.
type PartialReceipt = { signature: string; text: string; sourceIds: string[] };
const partialReviews = new WeakMap<AskReasoningResult, PartialReceipt>();
export function recordPartialHistoryReview(result: AskReasoningResult, receipt: PartialReceipt) {
  partialReviews.set(result, structuredClone(receipt));
}
export function readPartialHistoryReview(result: AskReasoningResult) {
  const receipt = partialReviews.get(result);
  return receipt && receipt.signature === historyReviewSignature(result) ? structuredClone(receipt) : null;
}
