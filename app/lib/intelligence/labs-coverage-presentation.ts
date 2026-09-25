import type { ReadCoverage } from "../furvise-brain/lungs.ts";
// Presentation of existing failures only; never creates or upgrades certificates.
export function selectionLimitation(subjectId: string, subject: string, direction: "asc" | "desc", count: number,
  coverage: ReadCoverage, blockingReasons: readonly string[]): string {
  const group = coverage.groups?.find(group => group.petId === subjectId);
  const reasons = new Set([...(group ? group.reasons : coverage.reasons), ...blockingReasons]);
  const ids = group?.selectedIds || [];
  if (coverage.sourceLineage?.some(source => ids.includes(source.eventId))) reasons.add("unresolved_source_lineage");
  const requested = `the ${count === 1 ? "" : count + " "}${direction === "desc" ? "latest" : "earliest"} matching record${count === 1 ? "" : "s"}`;
  let cause: string;
  if (reasons.has("anchor_ambiguous")) cause = "more than one event could define the requested time window";
  else if (coverage.status === "anchor_missing" || reasons.has("anchor_not_found"))
    cause = "I couldn't find the event needed to define the requested time window";
  else if (reasons.has("anchor_search_not_exhausted")) cause = "the event defining the requested time window could not be fully checked";
  else if (coverage.status === "unavailable" || group?.status === "unavailable")
    cause = "the relevant records could not be retrieved";
  else if (reasons.has("anchor_lineage_unresolved") || reasons.has("unresolved_source_lineage") || reasons.has("lineage_not_closed"))
    cause = "corrections or deletions affecting the relevant records could not be fully checked";
  else if (reasons.has("calendar_search_not_exhausted")) cause = "the requested calendar window could not be fully checked";
  else if (reasons.has("subject_scan_not_exhausted") || reasons.has("no_cross_query_snapshot"))
    cause = "part of the relevant history could not be fully checked";
  else cause = "the supporting evidence could not be verified";
  return `I couldn't verify ${requested} for ${subject} because ${cause}.`;
}
export function exhaustiveSelectionLimitation(exhaustive: boolean, coverage: ReadCoverage): string[] {
  return exhaustive && coverage.status === "partial"
    ? ["I couldn't verify the full requested history, so these results cannot establish an exhaustive list or that no other matching records exist."]
    : [];
}
