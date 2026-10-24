import "server-only";
import type { CareEntryRow } from "./supabase";
import { sourceSemanticsDigest, sourceSemanticsSnapshot } from "./intelligence/correction-relevance";
import { measurementCandidates } from "./furvise-brain/measurement-candidates";
import { units } from "./furvise-brain/calculation-units";

export const SOURCE_METADATA_SPAN_LIMIT = 32;
const instant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
/** Observation of saved contents only. This is neither a numeric-premise proof nor factual certification. */
export function historySourceMetadata(row: CareEntryRow, scope: { ownerId: string; subjectId: string; recordId: string },
  expectation: { revision?: string; bodySHA256?: string } = {}, now = new Date()) {
  if (row.user_id !== scope.ownerId || row.pet_profile_id !== scope.subjectId || row.id !== scope.recordId || row.deleted_at)
    throw new Error("SOURCE_METADATA_SCOPE");
  if (!instant(row.updated_at) || !instant(row.created_at) || !instant(row.occurred_at)
    || !(row.note === null || typeof row.note === "string") || !(row.title == null || typeof row.title === "string"))
    throw new Error("SOURCE_METADATA_VERSION");
  const body = row.note ?? row.title ?? "";
  if (body.length > 16000) throw new Error("SOURCE_METADATA_BOUND");
  const dimensions = [...new Set(Object.values(units).map(u => u.dimension))];
  const candidates = dimensions.flatMap(dimension => measurementCandidates(body, dimension))
    .sort((a,b) => a.sourceSpan.start - b.sourceSpan.start);
  const bodySHA256 = sourceSemanticsDigest(body);
  return {
    kind: "history-source-observation.v1" as const,
    authority: "attributed_saved_contents_only" as const, numericPremiseCertified: false as const,
    observedAt: now.toISOString(), freshness: "point_in_time_read_source_may_change" as const,
    recordId: row.id, subjectId: row.pet_profile_id, revision: row.updated_at,
    eventAt: row.occurred_at, recordedAt: row.created_at,
    bodySHA256,
    snapshotSHA256: sourceSemanticsDigest(JSON.stringify({ ...sourceSemanticsSnapshot(row), category: row.category ?? null, deletedAt: row.deleted_at ?? null })),
    matchesExpectedRevision: expectation.revision === undefined ? null : expectation.revision === row.updated_at,
    matchesExpectedBody: expectation.bodySHA256 === undefined ? null : expectation.bodySHA256 === bodySHA256,
    numericSpans: candidates.slice(0, SOURCE_METADATA_SPAN_LIMIT).map(c => ({
      start: c.sourceSpan.start, end: c.sourceSpan.end, quote: c.literal, numericText: c.numericText,
      sourceUnit: c.sourceUnit, unit: c.unit, dimension: c.dimension,
    })),
    spanCoverage: { limit: SOURCE_METADATA_SPAN_LIMIT, candidateCount: candidates.length,
      complete: candidates.length <= SOURCE_METADATA_SPAN_LIMIT, offsets: "UTF-16_half_open" as const,
      interpretation: "lexical_candidates_not_selection_or_calculation_eligibility" as const },
  };
}
export type HistorySourceMetadata = ReturnType<typeof historySourceMetadata>;
