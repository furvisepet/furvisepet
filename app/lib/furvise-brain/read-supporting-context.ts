import { allocateSupportingContext, contextSignalsFromTicket } from "../intelligence/supporting-context.ts";
import type { ReadTicket } from "./read-ticket.ts";
import type { ReadResult, ReadScope, ReadStore } from "./lungs.ts";

export type ReadSupportingContext = ReturnType<typeof allocateSupportingContext>["supporting"];
/** Protected compatibility operators retain their existing execution in this cut. */
export const separatesReadHints = (ticket: ReadTicket) => !ticket.temporal.calendar && !ticket.episode
  && !ticket.needs?.length && (!ticket.outputs.strategy || ticket.outputs.strategy === "chronological");

/** Hints never reach ordinary factual acquisition, selection or certification.
 * Observe only effective snapshots already acquired by that execution. No extra
 * query, inferred predicate, fallback scan, or combined factual/source collection.
 */
export async function readWithSupportingContext(ticket: ReadTicket, scope: ReadScope, store: ReadStore,
  limits: { records: number; chars: number },
  execute: (ticket: ReadTicket, scope: ReadScope, store: ReadStore) => Promise<ReadResult>): Promise<ReadResult> {
  if (!ticket.searchHints?.length || !separatesReadHints(ticket)) return execute(ticket, scope, store);
  type Snapshot = { records: ReadResult["records"]; reliable: boolean; sourceLineage?: { eventId: string }[] };
  const snapshots = new Map<string, Snapshot>();
  const observed: ReadStore = { ...store, effective: async rows => {
    snapshots.clear();
    const result = await store.effective(rows);
    // Each effective call supersedes earlier snapshots; never union stale truth.
    for (const petId of ticket.subjects.petIds) snapshots.set(petId, { ...result,
      records: result.records.filter(r => r.pet_profile_id === petId) });
    return result;
  } };
  if (store.effectiveWindow) observed.effectiveWindow = async input => {
    snapshots.delete(input.petId);
    const result = await store.effectiveWindow!(input);
    snapshots.set(input.petId, { records: result.records, sourceLineage: result.sourceLineage,
      reliable: result.lineageClosed && result.replacementSeedsExhausted });
    return result;
  };
  const result = await execute(Object.freeze({ ...ticket, searchHints: Object.freeze([]) }), scope, observed);
  // No resolved scope means no optional context; missing anchors never widen.
  if (result.coverage.windows.length !== ticket.subjects.petIds.length
    || result.coverage.windows.some(w => Date.parse(w.from) >= Date.parse(w.to))) return result;
  const contextScope = { userId: scope.userId, windows: result.coverage.windows };
  const records = [...snapshots.values()].flatMap(s => s.records).filter(row =>
    !result.coverage.windows.some(w => w.petId === row.pet_profile_id && w.relation === "after"
      && result.coverage.anchors.some(a => a.petId === row.pet_profile_id && Date.parse(a.eventAt) === Date.parse(row.occurred_at))));
  const sourceLineage = [...snapshots.values()].flatMap(s => s.sourceLineage || []);
  const allocation = allocateSupportingContext({ scope: contextScope, authoritativeRecords: result.records,
    effective: { records, reliable: true, sourceLineage }, signals: contextSignalsFromTicket(ticket, contextScope),
    budget: { records: limits.records, chars: limits.chars }, ordering: ticket.outputs.ordering,
    acquisition: ticket.subjects.petIds.map(petId => ({ petId,
      state: !snapshots.get(petId)?.reliable ? "unavailable" as const
        : result.coverage.continuation.some(c => c.petId === petId) ? "partial" as const : "available" as const })) });
  // Only support is attached. Its representation loss cannot change the organ's
  // records, proof, obligation authority or independently certified publication.
  return { ...result, supportingContext: allocation.supporting };
}
