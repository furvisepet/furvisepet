import { selectionPublication } from "./selection-publication.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket, ReadPredicate } from "../furvise-brain/read-ticket.ts";
import type { ReadCoverage } from "../furvise-brain/lungs.ts";
import { careEvidenceId, type AskEvidenceContract } from "./ask-evidence.ts";

export type LabsList = {
  ticket: ReadTicket;
  records: Array<{ id: string; sourceId: string; petId: string; event_at: string; body: string; predicates_matched: readonly ReadPredicate[] }>;
  coverage: ReadCoverage;
  calculations: [];
  petNames?: Record<string, string>;
};
// A model field or a reloaded JSON object cannot mint this source snapshot.
const snapshots = new WeakMap<LabsList, string>();
export function buildLabsList(evidence: AskEvidenceContract | undefined, rows: CareEntryRow[]): LabsList | null {
  const request = evidence?.interpretation?.request, ticket = request?.readTicket;
  const coverage = evidence?.history?.ticketCoverage;
  if (ticket) console.info("[Ask Labs] dispatch", { operation: ticket.operation, completeness: ticket.outputs.completeness,
    mode: request?.mode, quantity: request?.quantity, outputFormat: request?.outputFormat,
    readOnly: evidence?.scope.readOnlyRecall, scope: evidence?.scope.status, coverage: coverage?.status, recordCount: rows.length });
  if (!evidence || !ticket || ticket.episode || !coverage || request?.mode !== "read" || request.writeJob || request.mutationIntent
    || !evidence.scope.readOnlyRecall || evidence.scope.status !== "resolved"
    || !["read", "read_since_event"].includes(ticket.operation)
    || !ticket.selection && ticket.outputs.completeness !== "exhaustive" && request.quantity !== "records") return null;
  // Selected reports do not fulfill a distinct count, comparison, aggregation,
  // navigation or formatted-export obligation. Those keep their own review.
  if (ticket.selection && (request.task || request.projection || request.evidenceNeeds?.length
    || !["records", "measurement"].includes(request.quantity || "")
    || !["recall", undefined].includes(evidence.interpretation?.readOperation ?? evidence.interpretation?.operation)
    || request.outputFormat && !["prose", "bullets"].includes(request.outputFormat))) return null;
  if (ticket.subjects.petIds.some(id => !evidence.scope.authorizedPetIds.includes(id))
    || rows.some(row => !ticket.subjects.petIds.includes(row.pet_profile_id) || row.deleted_at
      || !Number.isFinite(Date.parse(row.occurred_at)))
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("ASK_LABS_LIST_SOURCE_SCOPE");
  if (coverage.status === "complete" && !rows.length
    || ["complete_empty", "anchor_missing", "unavailable"].includes(coverage.status) && rows.length)
    throw new Error("ASK_LABS_LIST_COVERAGE_SHAPE");
  // Preserve organ order and exact bodies. With selection, publish only the
  // records its existing receipts certify; never select or match again here.
  const selection = selectionPublication(ticket, coverage, rows.map(row => ({ id: row.id, petId: row.pet_profile_id })));
  const publishable = selection ? rows.filter(row => selection.selectedEventIds.includes(row.id)) : rows;
  const petNames = ticket.selection ? Object.fromEntries(ticket.subjects.petIds.map(id => [id, evidence.petNames?.[id] || "this pet"])) : undefined;
  const labs: LabsList = structuredClone({ ticket, coverage, calculations: [], ...(petNames ? { petNames } : {}), records: publishable.map(row => ({
    id: row.id, sourceId: careEvidenceId(row.id, evidence.history), petId: row.pet_profile_id, event_at: row.occurred_at,
    body: row.note ?? row.title ?? "", predicates_matched: ticket.predicates,
  })) });
  snapshots.set(labs, JSON.stringify(labs));
  return labs;
}

export function labsTaskComplete(labs: LabsList): boolean {
  const selected = selectionPublication(labs.ticket, labs.coverage, labs.records);
  const historyComplete = ["complete", "complete_empty"].includes(labs.coverage.status);
  return selected ? selected.transportValid && selected.complete
    && (labs.ticket.outputs.completeness !== "exhaustive" || historyComplete) : historyComplete;
}

export function serializeLabsList(labs: LabsList): string {
  const selected = selectionPublication(labs.ticket, labs.coverage, labs.records);
  if (selected) {
    const parts = selected.certificates.map(certificate => {
      const subject = labs.petNames?.[certificate.subjectId] || "this pet";
      if (!certificate.certified) return `The requested selection for ${subject} could not be certified.`;
      const clause = labs.ticket.selection!.union[certificate.clauseId];
      const boundary = clause.orderBy[0].direction === "desc" ? "Latest" : "Earliest";
      const heading = `${boundary} matching records for ${subject} within the requested window:`;
      const rows = certificate.selectedEventIds.map(id => labs.records.find(row => row.id === id)!);
      return [heading, ...rows.map(row => `${row.event_at.slice(0, 10)} — ${JSON.stringify(row.body)}`),
        ...(!rows.length ? ["No matching records were found in this certified selection window."] : [])].join("\n");
    });
    if (labs.coverage.status === "partial") parts.push("The broader history was not exhaustively reviewed.");
    return parts.join("\n\n");
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

/** Compare the entire transport against the original returned labs, not just
 * individual supported lines. Eight valid rows out of twelve still fails. */
export function labsListReviewFailure(result: AskReasoningResult): string | null {
  const labs = result.labsList, evidence = result.evidenceContract;
  if (!labs || snapshots.get(labs) !== JSON.stringify(labs)) return "labs_source_snapshot_changed";
  if (JSON.stringify(labs.ticket) !== JSON.stringify(evidence?.interpretation?.request?.readTicket)
    || JSON.stringify(labs.coverage) !== JSON.stringify(evidence?.history?.ticketCoverage)
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
