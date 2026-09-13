import type { FurviseApplicationAction } from "../application-actions/types.ts";
import type { ObligationCompletion } from "./history-obligations.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";

type Receipt = { actions?: FurviseApplicationAction[]; signature: string; text: string; sourceIds: string[]; proseText?: string; sourceReports?: string[]; sourceContent?: string[]; completion?: ObligationCompletion[] };
const reviewed = new WeakMap<AskReasoningResult, Receipt>();
export const historyReviewSignature = (result: AskReasoningResult) => JSON.stringify({ actions: result.applicationActions, evidence: result.evidenceContract, draft: result.historyNarrative, result: result.historicalResult, plainAnswer: result.historyNarrativeDeclined ? result.answer.summary : undefined, sourceHints: result.historyNarrativeDeclined ? result.relevantContextIds : undefined });
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
export function recordHistoryReviewDiagnostic(result: AskReasoningResult, status: HistoryReviewDiagnostic["status"], reason: string) {
  diagnostics.set(result, { status, reason });
}
export function readHistoryReviewDiagnostic(result: AskReasoningResult) {
  const value = diagnostics.get(result); return value ? { ...value } : null;
}
