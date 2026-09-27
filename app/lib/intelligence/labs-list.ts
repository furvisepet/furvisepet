import { supportedPlainResultSetRead } from "./publication-authority.ts";
import { certifiedResultSetMatches, resultSetSnapshotMatches } from "./result-set-publication.ts";
import { selectionPublication } from "./selection-publication.ts";
import { logLabsEligibility } from "./publication-authority-diagnostics.ts";
import { selectionLimitation, exhaustiveSelectionLimitation } from "./labs-coverage-presentation.ts";
import { escapeLabsText, labsPresentation, renderCertifiedLabs, type LabsPresentation } from "./labs-presentation.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket, ReadPredicate } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";
import { careEvidenceId, type AskEvidenceContract } from "./ask-evidence.ts";

export type LabsList = {
  ticket: ReadTicket;
  records: Array<{ id: string; sourceId: string; petId: string; event_at: string; recorded_at?: string; body: string; predicates_matched: readonly ReadPredicate[] }>;
  coverage: ReadCoverage;
  calculations: [];
  /** Completion metadata only; never consulted for factual source authority. */
  residualRequirementCount?: number;
  petNames?: Record<string, string>;
  presentation?: LabsPresentation;
};
// A model field or a reloaded JSON object cannot mint this source snapshot.
const snapshots = new WeakMap<LabsList, string>();
export const readLabsSnapshotMatches = (labs: LabsList) => snapshots.get(labs) === JSON.stringify(labs);
export function carryReadLabsSnapshot(source: LabsList, target: LabsList) {
 if (!readLabsSnapshotMatches(source) || JSON.stringify(source)!==JSON.stringify(target)) throw Error("ASK_LABS_LIST_CLONE_CHANGED");
 snapshots.set(target, snapshots.get(source)!);
}
export function buildLabsList(evidence: AskEvidenceContract | undefined, rows: CareEntryRow[], calculationOperands = false): LabsList | null {
  const request = evidence?.interpretation?.request, ticket = request?.readTicket;
  const coverage = evidence?.history?.ticketCoverage;
  const operandTransport = calculationOperands && !!request?.calculatePlan;
  if (operandTransport && ticket?.authority === "stored_report") return null;
  if (request?.calculatePlan && !operandTransport) return null;
  const presentation = operandTransport ? "prose" : labsPresentation(request?.outputFormat);
  // Result-set serialization currently supports prose only.
  if (!presentation || !ticket?.selection && presentation !== "prose") return null;
  logLabsEligibility(evidence, rows.map(row => ({ id: row.id, petId: row.pet_profile_id })));
  if (ticket) console.info("[Ask Labs] dispatch", { operation: ticket.operation, completeness: ticket.outputs.completeness,
    mode: request?.mode, quantity: request?.quantity, outputFormat: request?.outputFormat,
    readOnly: evidence?.scope.readOnlyRecall, scope: evidence?.scope.status, coverage: coverage?.status, recordCount: rows.length });
  if (!evidence || !ticket || ticket.episode || !coverage || request?.mode !== "read" || request.writeJob || request.mutationIntent
    || !evidence.scope.readOnlyRecall || evidence.scope.status !== "resolved"
    || !["read", "read_since_event"].includes(ticket.operation)) return null;
  if (!ticket.selection && !operandTransport && !supportedPlainResultSetRead(evidence)) return null;
  // Selected reports do not fulfill a distinct count, comparison, aggregation,
  // navigation obligation. Those keep their own review. Format is not authority.
  if (ticket.selection && !operandTransport && (request.task || request.projection || request.evidenceNeeds?.length
    || !["records", "measurement"].includes(request.quantity || "")
    || !["recall", undefined].includes(evidence.interpretation?.readOperation ?? evidence.interpretation?.operation))) return null;
  if (ticket.subjects.petIds.some(id => !evidence.scope.authorizedPetIds.includes(id))
    || rows.some(row => !ticket.subjects.petIds.includes(row.pet_profile_id) || row.deleted_at
      || !Number.isFinite(Date.parse(row.occurred_at))
      || ticket.authority === "stored_report" && !Number.isFinite(Date.parse(row.created_at)))
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("ASK_LABS_LIST_SOURCE_SCOPE");
  if (coverage.status === "complete" && !rows.length
    || ["complete_empty", "anchor_missing", "unavailable"].includes(coverage.status) && rows.length)
    throw new Error("ASK_LABS_LIST_COVERAGE_SHAPE");
  if (!resultSetSnapshotMatches(ticket, coverage, rows.map(row => ({ id: row.id, petId: row.pet_profile_id }))))
    throw new Error("ASK_LABS_RESULT_SET_SNAPSHOT");
  if (!ticket.selection && !operandTransport
    && !certifiedResultSetMatches(ticket, coverage, rows.map(row => ({ id: row.id, petId: row.pet_profile_id })))) return null;
  // Preserve organ order and exact bodies. With selection, publish only the
  // records its existing receipts certify; never select or match again here.
  const selection = selectionPublication(ticket, coverage, rows.map(row => ({ id: row.id, petId: row.pet_profile_id })));
  // An empty candidate search without common proof is a reference/discovery
  // limitation, including when the legacy envelope asks to display records.
  if (!rows.length && evidence.history?.eventCandidateIds?.length === 0
    && !selection?.complete && !coverage.resultSet?.certified) return null;
  // Exhausting text matches is not proof that an unrecognized concept is absent.
  // An empty effective scope is stronger: no surviving row can be a missed match.
  // Keep lexical-empty searches on the existing no-fact limitation path; do not
  // alter their organ receipts or manufacture a semantic absence certificate.
  if (!rows.length && ticket.predicates.length && (selection?.complete || coverage.resultSet?.certified)
    && !ticket.subjects.petIds.every(petId => {
      const streams = coverage.effectiveStream?.filter(stream => stream.petId === petId) || [];
      return streams.length === 1 && streams[0].lineageClosed && streams[0].replacementSeedsExhausted
        && streams[0].effectiveIds.length === 0;
    })) return null;
  const publishable = selection ? rows.filter(row => selection.selectedEventIds.includes(row.id)) : rows;
  const petNames = ticket.selection || ticket.authority === "stored_report" ? Object.fromEntries(ticket.subjects.petIds.map(id => [id, evidence.petNames?.[id] || "this pet"])) : undefined;
  const labs: LabsList = structuredClone({ ticket, coverage, calculations: [],
    ...(request.requirements?.length ? { residualRequirementCount: request.requirements.length } : {}), ...(petNames ? { petNames, presentation } : {}), records: publishable.map(row => ({
    id: row.id, sourceId: careEvidenceId(row.id, evidence.history), petId: row.pet_profile_id, event_at: row.occurred_at,
    ...(ticket.authority === "stored_report" ? { recorded_at: row.created_at } : {}),
    body: row.note ?? row.title ?? "", predicates_matched: ticket.predicates,
  })) });
  snapshots.set(labs, JSON.stringify(labs));
  return labs;
}

export function labsTaskComplete(labs: LabsList): boolean {
  return labsFactualComponentComplete(labs) && !labs.residualRequirementCount;
}

export function labsFactualComponentComplete(labs: LabsList): boolean {
  const selected = selectionPublication(labs.ticket, labs.coverage, labs.records);
  const historyComplete = ["complete", "complete_empty"].includes(labs.coverage.status);
  return selected ? selected.transportValid && selected.complete
    && (labs.ticket.outputs.completeness !== "exhaustive" || historyComplete) : historyComplete;
}

export function serializeLabsList(labs: LabsList): string {
  if (labs.ticket.authority === "stored_report") return serializeStoredReports(labs);
  const selected = selectionPublication(labs.ticket, labs.coverage, labs.records);
  if (selected) {
    const groups = selected.certificates.map(certificate => {
      const subject = labs.petNames?.[certificate.subjectId] || "this pet";
      const clause = labs.ticket.selection!.union[certificate.clauseId];
      if (!certificate.certified) return { subject, heading: selectionLimitation(certificate.subjectId, subject,
        clause.orderBy[0].direction, clause.take.count, labs.coverage, certificate.blockingReasons), rows: [] };
      const boundary = clause.orderBy[0].direction === "desc" ? "Latest" : "Earliest";
      return { subject, heading: `${boundary} matching records for ${subject} within the requested window:`,
        rows: certificate.selectedEventIds.map(id => labs.records.find(row => row.id === id)!),
        notice: "No matching records were found in this certified selection window." };
    });
    return renderCertifiedLabs(groups, labs.presentation === undefined ? "prose" : labs.presentation,
      exhaustiveSelectionLimitation(labs.ticket.outputs.completeness === "exhaustive", labs.coverage));
  }
  const list = labs.records.map(row => `${row.event_at.slice(0, 10)} — ${JSON.stringify(row.body)}`).join("\n\n");
  const notice = {
    complete: "", complete_empty: "No matching notes were found in the checked history window.",
    partial: "These are partial results; the history search is incomplete.",
    anchor_missing: "I couldn’t identify the event needed to define this history window.",
    unavailable: "I couldn’t retrieve this history window.",
  }[labs.coverage.status];
  return [list, notice].filter(Boolean).join("\n\n");
}

/** Exact quotations with attribution, never an effective-fact sentence. */
function serializeStoredReports(labs: LabsList): string {
  const selected = selectionPublication(labs.ticket, labs.coverage, labs.records);
  const rows = labs.records.map(row => ({
    subject: escapeLabsText(labs.petNames?.[row.petId] || row.petId), source: escapeLabsText(row.sourceId),
    recorded: escapeLabsText(row.recorded_at!), event: escapeLabsText(row.event_at), wording: escapeLabsText(JSON.stringify(row.body)),
  }));
  const notice = [
    "Stored reports only: these quotations do not establish current or corrected facts, or which report supersedes another.",
    ...(labs.coverage.sourceLineage?.length ? ["Some reports have unresolved correction lineage; no supersession is certified."] : []),
    ...(labs.coverage.reasons.includes("no_cross_query_snapshot") ? ["These records were checked across separate reads, not one database snapshot."] : []),
    ...(!labsFactualComponentComplete(labs) ? ["The requested record selection is incomplete."] : []),
    ...(!rows.length ? ["No report wording is certified for this selection."] : []),
    ...(selected?.certificates.filter(c => !c.certified).map(c => "No report selection is certified for " + (labs.petNames?.[c.subjectId] || c.subjectId) + ".") || []),
  ].join(" ");
  if (labs.presentation === "table") return [
    "| Subject | Source | Recorded at | Stored event time | Exact stored wording |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(r => "| " + [r.subject, r.source, r.recorded, r.event, r.wording].join(" | ") + " |"),
    "", notice,
  ].join("\n");
  return [...rows.map(r => (labs.presentation === "list" ? "- " : "") + r.subject + " [" + r.source
    + "] recorded at " + r.recorded + "; stored event time " + r.event + ": " + r.wording), notice].join("\n\n");
}

/** Compare the entire transport against the original returned labs, not just
 * individual supported lines. Eight valid rows out of twelve still fails. */
export function labsListReviewFailure(result: AskReasoningResult): string | null {
  const labs = result.labsList, evidence = result.evidenceContract;
  if (!labs || snapshots.get(labs) !== JSON.stringify(labs)) return "labs_source_snapshot_changed";
  if (JSON.stringify(labs.ticket) !== JSON.stringify(evidence?.interpretation?.request?.readTicket)
    || JSON.stringify(labs.coverage) !== JSON.stringify(evidence?.history?.ticketCoverage)
    || (labs.residualRequirementCount || 0) !== (evidence?.interpretation?.request?.requirements?.length || 0)
    || evidence?.interpretation?.request?.mode !== "read" || !evidence.scope.readOnlyRecall
    || evidence.interpretation.request.writeJob || evidence.interpretation.request.mutationIntent
    || labs.records.some(row => !evidence.scope.authorizedPetIds.includes(row.petId))) return "labs_ticket_or_coverage_changed";
  if (labs.ticket.selection) {
    const selection = selectionPublication(labs.ticket, labs.coverage, labs.records)!;
    if (!selection.transportValid || labs.records.some(row => !selection.selectedEventIds.includes(row.id)))
      return "labs_selected_evidence_missing";
    if (Object.entries(labs.petNames || {}).some(([id, name]) => name !== (evidence?.petNames?.[id] || "this pet")))
      return "labs_subject_attribution_changed";
  }
  if (result.applicationActions.length || result.careActions.length || result.semanticEvents.length || result.learnings.length
    || result.proposedHistoryUpdate.shouldOffer) return "labs_list_has_write";
  if (result.safetyLevel === "urgent" || result.responseMode === "grief_support") return "labs_list_safety_path";
  if (result.answer.summary !== serializeLabsList(labs) || result.answer.sections.length || result.answer.safetyNote || result.answer.title !== "Furvise" || result.suggestedFollowUps.length
    || JSON.stringify(result.relevantContextIds) !== JSON.stringify(labs.records.map(row => row.sourceId))) return "labs_list_omitted_or_changed";
  return null;
}

/** Carry the canonical snapshot only across a successfully checked server clone. */
export function carryLabsListSnapshot(source: AskReasoningResult, target: AskReasoningResult) {
  if (labsListReviewFailure(source) || !source.labsList || !target.labsList
    || JSON.stringify(source.labsList) !== JSON.stringify(target.labsList)) throw new Error("ASK_LABS_LIST_CLONE_CHANGED");
  snapshots.set(target.labsList, snapshots.get(source.labsList)!);
}
