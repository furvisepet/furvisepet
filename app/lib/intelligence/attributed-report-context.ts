import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { AttributedReportContext } from "../furvise-brain/attributed-report-context.ts";
import { readCorrectionRelevance } from "./correction-relevance-read.ts";
import { attributedCorrectionRelevance, type AttributedSourceSemantics } from "./correction-relevance.ts";

export type AttributedReportResult = {
  ownerId: string; subjectIds: string[]; obligations: readonly AttributedReportContext[];
  groups: Array<{ obligation: number; subjectId: string; status: "complete" | "unavailable" | "partial";
    reason: string | null; records: AttributedSourceSemantics[] }>;
};
const issued = new WeakMap<AttributedReportResult, string>();
export function verifiedAttributedReports(result: AttributedReportResult | undefined, ticket: ReadTicket | null | undefined) {
  return result && ticket?.authority === "stored_report" && ticket.attributedContexts?.length
    && issued.get(result) === JSON.stringify(result)
    && JSON.stringify(result.obligations) === JSON.stringify(ticket.attributedContexts)
    && JSON.stringify(result.subjectIds) === JSON.stringify(ticket.subjects.petIds) ? result : null;
}
export function carryAttributedReports(source: AttributedReportResult | undefined, target: AttributedReportResult | undefined,
  ticket: ReadTicket | null | undefined) {
  if (!source && !target) return;
  if (!verifiedAttributedReports(source, ticket) || !target || JSON.stringify(source) !== JSON.stringify(target))
    throw Error("ATTRIBUTED_REPORT_SNAPSHOT_CHANGED");
  issued.set(target, JSON.stringify(target));
}
/** Persisted semantic attribution is context authority, never an effective edge.
 * This organ accepts no question text and never expands the primary result set. */
export async function retrieveAttributedReports(ticket: ReadTicket, input: {
  db: SupabaseClient; ownerId: string; ownedPetIds: readonly string[];
  from: string; to: string; deadline: number;
}): Promise<AttributedReportResult | undefined> {
  if (!ticket.attributedContexts?.length) return;
  if (ticket.authority !== "stored_report" || ticket.subjects.petIds.some(id => !input.ownedPetIds.includes(id)))
    throw Error("ATTRIBUTED_REPORT_SCOPE");
  const result: AttributedReportResult = { ownerId: input.ownerId, subjectIds: [...ticket.subjects.petIds],
    obligations: structuredClone(ticket.attributedContexts), groups: [] };
  for (const [index, obligation] of ticket.attributedContexts.entries()) {
    for (const petId of ticket.subjects.petIds) {
      const group: AttributedReportResult["groups"][number] = {
        obligation: index, subjectId: petId, status: "unavailable", reason: null, records: [] };
      result.groups.push(group);
      try {
        if ([obligation.recorded, obligation.target].some(w => Date.parse(w.from) < Date.parse(input.from)
          || Date.parse(w.to) > Date.parse(input.to))) throw Error("attributed_report_access_window");
        const page = await readCorrectionRelevance({ db: input.db, ownerId: input.ownerId, petIds: [petId],
          candidates: [], domain: obligation.target, deadline: input.deadline });
        group.status = "complete";
        for (const value of page.bySource.values()) {
          const source = value.source, at = Date.parse(source.createdAt);
          if (at < Date.parse(obligation.recorded.from) || at >= Date.parse(obligation.recorded.to)) continue;
          if (source.ownerId !== input.ownerId || source.petId !== petId
            || Date.parse(source.occurredAt) < Date.parse(input.from) || Date.parse(source.occurredAt) >= Date.parse(input.to))
            throw Error("attributed_report_source_scope");
          const relevance = attributedCorrectionRelevance(value, { ...obligation.target,
            ownerId: input.ownerId, petId, exactTargets: page.exactTargets });
          if (relevance === "disjoint") continue;
          if (relevance === "unknown" || value.classification !== "attributed_correction") {
            group.status = "partial"; group.reason = "attributed_target_unresolved"; continue;
          }
          group.records.push(value);
        }
        group.records.sort((a, b) => Date.parse(a.source.createdAt) - Date.parse(b.source.createdAt)
          || a.source.id.localeCompare(b.source.id));
      } catch {
        group.status = "unavailable"; group.reason = "attributed_reports_unavailable"; group.records = [];
      }
    }
  }
  issued.set(result, JSON.stringify(result));
  return result;
}
export function attributedReportSources(result: AttributedReportResult | null | undefined) {
  return [...new Map((result?.groups.flatMap(g => g.records) || []).map(value => [value.source.id, value])).values()]
    .map(value => ({ sourceId: "care:" + value.source.id, petId: value.source.petId, sourceType: "attributed_report",
      field: "value" as const, text: value.source.note, start: 0, end: value.source.note.length,
      occurredAt: value.source.occurredAt, recordedAt: value.source.createdAt }));
}
