import type { FurviseApplicationAction } from "../application-actions/types.ts";
import type { ObligationCompletion } from "./history-obligations.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";

type Receipt = { actions?: FurviseApplicationAction[]; signature: string; text: string; sourceIds: string[]; proseText?: string; sourceReports?: string[]; sourceContent?: string[]; completion?: ObligationCompletion[] };
const reviewed = new WeakMap<AskReasoningResult, Receipt>();
export const historyReviewSignature = (result: AskReasoningResult) => JSON.stringify({ labsList: result.labsList, labsAnswer: result.labsList ? result.answer : undefined, labsSourceIds: result.labsList ? result.relevantContextIds : undefined, actions: result.applicationActions, evidence: result.evidenceContract, draft: result.historyNarrative, result: result.historicalResult, plainAnswer: result.historyNarrativeDeclined ? result.answer.summary : undefined, sourceHints: result.historyNarrativeDeclined ? result.relevantContextIds : undefined });
export function clearHistoryReview(result: AskReasoningResult) { reviewed.delete(result); }
/** Internal server capability: called only after successful source-scoped review. */
export function recordHistoryReview(result: AskReasoningResult, receipt: Receipt) { reviewed.set(result, structuredClone(receipt)); }
/** A model field, clone, reload or changed evidence cannot forge this receipt. */
export function readReviewedHistoryAnswer(result: AskReasoningResult): Omit<Receipt, "signature"> | null {
  const receipt = reviewed.get(result);
  if (!receipt || receipt.signature !== historyReviewSignature(result)) return null;
  return { ...(receipt.actions ? { actions: structuredClone(receipt.actions) } : {}), ...(receipt.completion ? { completion: structuredClone(receipt.completion) } : {}), text: receipt.text, sourceIds: [...receipt.sourceIds], ...(receipt.proseText !== undefined ? { proseText: receipt.proseText } : {}), ...(receipt.sourceReports ? { sourceReports: [...receipt.sourceReports] } : {}), ...(receipt.sourceContent ? { sourceContent: [...receipt.sourceContent] } : {}) };
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
