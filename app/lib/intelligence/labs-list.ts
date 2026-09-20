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
    || ticket.outputs.completeness !== "exhaustive" && request.quantity !== "records") return null;
  if (ticket.subjects.petIds.some(id => !evidence.scope.authorizedPetIds.includes(id))
    || rows.some(row => !ticket.subjects.petIds.includes(row.pet_profile_id) || row.deleted_at
      || !Number.isFinite(Date.parse(row.occurred_at)))
    || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("ASK_LABS_LIST_SOURCE_SCOPE");
  if (coverage.status === "complete" && !rows.length
    || ["complete_empty", "anchor_missing", "unavailable"].includes(coverage.status) && rows.length)
    throw new Error("ASK_LABS_LIST_COVERAGE_SHAPE");
  // Lungs already bounds and orders this array. Do not rank, slice, summarize,
  // or re-run predicate matching in the publication layer.
  const labs: LabsList = structuredClone({ ticket, coverage, calculations: [], records: rows.map(row => ({
    id: row.id, sourceId: careEvidenceId(row.id, evidence.history), petId: row.pet_profile_id, event_at: row.occurred_at,
    body: row.note ?? row.title ?? "", predicates_matched: ticket.predicates,
  })) });
  snapshots.set(labs, JSON.stringify(labs));
  return labs;
}

export function serializeLabsList(labs: LabsList): string {
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
