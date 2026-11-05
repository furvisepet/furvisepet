import type { AskEvidenceContract } from "./ask-evidence.ts";
import { getScopedReportSidecar, type ScopedReportProof } from "./scoped-stored-report.ts";

/** A source quotation is not result-set, completion, correction or fact authority. */
export function scopedReportPublication(evidence: AskEvidenceContract | undefined,
  rows: readonly { id: string; petId: string; body: string; event_at: string; sourceId?: string }[]): ScopedReportProof | null {
  const request = evidence?.interpretation?.request, ticket = request?.readTicket;
  if (!evidence || !request || !ticket || evidence.history?.ticketCoverage?.status !== "partial"
    || evidence.scope.status !== "resolved" || !evidence.scope.readOnlyRecall
    || request.mode !== "read" || request.evidenceBasis !== "saved_history" || request.quantity !== null
    || !evidence.scope.authorizedPetIds.includes(ticket.subjects.petIds[0])
    || rows.length !== 1) return null;
  const proof = getScopedReportSidecar(evidence.history, request, evidence.scope.requestText);
  const row = rows[0];
  if (!proof || row.id !== proof.sourceId || row.petId !== proof.petId || row.body !== proof.body
    || row.event_at !== proof.occurredAt || row.sourceId !== undefined && row.sourceId !== "care:" + proof.sourceId)
    return null;
  return proof;
}
