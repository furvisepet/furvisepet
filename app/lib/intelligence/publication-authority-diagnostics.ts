import { createHash } from "node:crypto";
import { careEvidenceId, eligibleAnswerSources, type AskEvidenceContract } from "./ask-evidence.ts";
import { selectionPublication } from "./selection-publication.ts";
import { buildHistoryObligations, type HistoryObligation, type ObligationCompletion } from "./history-obligations.ts";

type Row = { id: string; petId: string };
type Source = { sourceId: string; petId: string; sourceType?: string };
// Diagnostic-only observers. Their results never participate in authorization,
// dispatch, source selection, review policy or response construction.
function observe(phase: string, collect: () => unknown) {
  try { console.info("[Ask publication authority]", JSON.stringify({ phase, ...collect() as object })); }
  catch { /* Observability failure must not alter the existing request path. */ }
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const unique = (ids: string[]) => [...new Set(ids)];
const kind = (source?: Source) => source?.sourceType === "profile" ? "profile"
  : ["care_update", "episode_result"].includes(source?.sourceType || "") ? "history" : "other";
function authority(evidence: AskEvidenceContract, rows?: readonly Row[]) {
  const ticket = evidence.interpretation?.request?.readTicket, coverage = evidence.history?.ticketCoverage;
  const representedRows = coverage?.groups?.flatMap(group => group.selectedIds.flatMap(id =>
    evidence.represented.some(span => span.petId === group.petId && span.sourceId === careEvidenceId(id, evidence.history))
      ? [{ id, petId: group.petId }] : [])) || [];
  const selection = ticket && coverage ? selectionPublication(ticket, coverage, rows || representedRows) : null;
  return { ticket, coverage, selection };
}
export function logLabsEligibility(evidence: AskEvidenceContract | undefined, rows: readonly Row[]) {
  if (!evidence?.interpretation?.request?.readTicket) return;
  observe("labs_eligibility", () => {
    const request = evidence.interpretation!.request!, interpretation = evidence.interpretation!;
    const { ticket, coverage, selection } = authority(evidence, rows);
    const rejectedBy = [
      !coverage && "coverage.absent", ticket!.episode && "ticket.episode.present",
      request.mode !== "read" && "request.mode.not_read", request.writeJob && "request.writeJob.present",
      request.mutationIntent && "request.mutationIntent.present",
      !evidence.scope.readOnlyRecall && "scope.readOnlyRecall.false",
      evidence.scope.status !== "resolved" && "scope.status.not_resolved",
      !["read", "read_since_event"].includes(ticket!.operation) && "ticket.operation.unsupported",
      !ticket!.selection && ticket!.outputs.completeness !== "exhaustive" && request.quantity !== "records"
        && "legacy.non_exhaustive_non_records",
      ticket!.selection && request.task && "selection.request.task.present",
      ticket!.selection && request.projection && "selection.request.projection.present",
      ticket!.selection && request.evidenceNeeds?.length && "selection.request.evidenceNeeds.nonempty",
      ticket!.selection && !["records", "measurement"].includes(request.quantity || "") && "selection.request.quantity.unsupported",
      ticket!.selection && !["recall", undefined].includes(interpretation.readOperation ?? interpretation.operation)
        && "selection.interpretation.operation.unsupported",
    ].filter((value): value is string => typeof value === "string");
    return { eligible: rejectedBy.length === 0, rejectedBy,
      // These are pre-source-validation eligibility gates, not a publication approval.
      stage: "pre_source_validation", selectionPresent: !!ticket!.selection,
      mode: request.mode, writeJobPresent: !!request.writeJob, mutationIntent: request.mutationIntent ?? null,
      episodePresent: !!ticket!.episode, ticketOperation: ticket!.operation,
      readOnlyRecall: evidence.scope.readOnlyRecall, scopeStatus: evidence.scope.status,
      task: request.task ? { present: true, intent: request.task.intent } : null,
      projection: request.projection ? { present: true, quantity: request.projection.quantity,
        unit: request.projection.unit, order: request.projection.order, headersRedacted: true } : null,
      evidenceNeeds: { count: request.evidenceNeeds?.length || 0, obligations: request.evidenceNeeds?.map((need, index) => ({
        id: "need_" + index, originalIdHash: digest(need.id), type: "retrieval_probe",
        order: need.order || null, petIds: need.petIds || [], windowPresent: !!need.window })) || [] },
      quantity: request.quantity, readOperation: interpretation.readOperation ?? null, operation: interpretation.operation,
      outputFormat: request.outputFormat ?? null, completeness: ticket!.outputs.completeness,
      subjectScope: ticket!.subjectScope, subjectIds: ticket!.subjects.petIds,
      referenceTurnCount: request.referenceTurnIds?.length || 0, requirementCount: request.requirements?.length || 0,
      certificateCount: selection?.certificates.length || 0, certificates: selection?.certificates || [],
      selectedEventIds: selection?.selectedEventIds || [], transportValid: selection?.transportValid ?? null,
      effectiveStream: coverage?.effectiveStream?.map(stream => ({ petId: stream.petId,
        lineageClosed: stream.lineageClosed, replacementSeedsExhausted: stream.replacementSeedsExhausted,
        certifiedSelectedIds: stream.certifiedSelectedIds })) || [],
      coverage: coverage?.status ?? null, representation: evidence.representation,
    };
  });
}
function obligationAuthority(evidence: AskEvidenceContract, obligation: HistoryObligation, rows?: readonly Row[]) {
  const { ticket, selection } = authority(evidence, rows);
  const sources = eligibleAnswerSources(evidence);
  const certificates = selection?.certificates.filter(c => !obligation.petId || c.subjectId === obligation.petId) || [];
  const eventIds = unique(certificates.filter(c => c.certified).flatMap(c => c.selectedEventIds));
  // Certificates describe the selected component, never additional prose/need obligations.
  const mapsToSelection = obligation.index === 0 && !obligation.needId;
  return { obligationId: "obligation_" + obligation.index, needIdHash: obligation.needId ? digest(obligation.needId) : null,
    subjectId: obligation.petId || null, semanticRequirement: {
      kind: mapsToSelection && ticket?.selection ? "selected_records" : obligation.needId ? "retrieval_probe" : "additional_obligation",
      operation: ticket?.operation ?? null, completeness: ticket?.outputs.completeness ?? null,
      selection: ticket?.selection || null, predicateKinds: ticket?.predicates.map(p => p.kind) || [],
      anchored: !!ticket?.temporal.anchor, explicitWindow: !!(ticket?.temporal.from || ticket?.temporal.to) },
    mapping: mapsToSelection ? "selected_component_only" : "no_certificate_binding",
    certificateAuthorizedEventIds: mapsToSelection ? eventIds : [],
    certificateAuthorizedSourceIds: mapsToSelection ? eventIds.map(id => careEvidenceId(id, evidence.history)) : [],
    selectionComponentCertified: mapsToSelection && !!selection?.transportValid && certificates.length > 0 && certificates.every(c => c.certified),
    availableProfileSourceIds: sources.filter(s => s.sourceType === "profile" && (!obligation.petId || s.petId === obligation.petId)).map(s => s.sourceId),
  };
}
export function logPublicationDispatch(evidence: AskEvidenceContract | undefined, rows: readonly Row[],
  path: "labs" | "legacy_projection" | "model", minimumSafetyLevel: string) {
  if (!evidence?.interpretation?.request?.readTicket) return;
  observe("obligation_dispatch", () => {
    const { ticket, coverage, selection } = authority(evidence, rows);
    const historyComplete = ["complete", "complete_empty"].includes(coverage?.status || "");
    const labsComplete = path !== "labs" ? null : selection ? selection.transportValid && selection.complete
      && (ticket!.outputs.completeness !== "exhaustive" || historyComplete) : historyComplete;
    return { path, minimumSafetyLevel, sentToModelGeneration: path === "model",
    labsClaimsTaskSatisfied: labsComplete,
    obligations: buildHistoryObligations(evidence).map(obligation => ({
      ...obligationAuthority(evidence, obligation, rows), labsClaimsObligationSatisfied:
        path === "labs" && obligation.index === 0 ? labsComplete : null })),
    };
  });
}
export function logReviewAuthority(evidence: AskEvidenceContract, obligations: readonly HistoryObligation[],
  sources: readonly Source[], completion?: readonly ObligationCompletion[], reviewerApproved?: boolean,
  publicationAccepted?: boolean, repairAttempted = false) {
  if (!evidence.interpretation?.request?.readTicket) return;
  observe(completion ? "review_support" : "review_input", () => ({
    reviewerApproved: reviewerApproved ?? null, publicationAccepted: publicationAccepted ?? null, repairAttempted,
    obligations: obligations.map(obligation => {
      const mapping = obligationAuthority(evidence, obligation);
      const accepted = completion?.find(item => item.index === obligation.index);
      return { ...mapping, reviewStatus: accepted?.status ?? null,
        suppliedSourceIds: sources.map(s => s.sourceId),
        acceptedSources: (accepted?.sourceIds || []).map(sourceId => ({
          sourceId, kind: kind(sources.find(s => s.sourceId === sourceId)),
          certificateAuthorized: mapping.certificateAuthorizedSourceIds.includes(sourceId) })) };
    }),
  }));
}
