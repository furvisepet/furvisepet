import type { AskEvidenceContract } from "./ask-evidence.ts";

/** Derived execution classification, never a new source of factual authority.
 * Coverage is produced by common organs; a proposal alone is not entry proof.
 * Compatibility must already have replaced legacy strategy with the SAME ticket
 * carried into evidence. Separate callers and protected shapes keep their policy.
 */
export function commonHistoryPathEntered(evidence: AskEvidenceContract): boolean {
  const request = evidence.interpretation?.request, ticket = request?.readTicket;
  if (request?.mode !== "read" || request.evidenceBasis !== "saved_history"
    || evidence.completedOwnerNote || !ticket || !evidence.history?.ticketCoverage
    || ticket.outputs.strategy != null || ticket.temporal.calendar || ticket.episode) return false;
  // Envelope-only legacy obligations have not migrated. The common probe path
  // carries the same server-grounded IDs in the envelope and bound needs.
  return (request.evidenceNeeds || []).every(need => ticket.needs?.some(bound => bound.id === need.id));
}
