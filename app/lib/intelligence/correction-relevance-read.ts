import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import { withExecutionDeadline } from "../ai/execution-deadline.ts";
import { readAttributedSourceSemantics, attributedCorrectionRelevance, type AttributedSourceSemantics, type CorrectionReadDomain } from "./correction-relevance.ts";

/** Reads persisted semantics only. No source prose enters target selection or relevance matching. */
export async function readCorrectionRelevance(input: {
  db: SupabaseClient; ownerId: string; petIds: string[]; candidates: CareEntryRow[];
  domain: Omit<CorrectionReadDomain, "ownerId" | "petId">; deadline: number;
}) {
  const bySource = new Map<string, AttributedSourceSemantics>();
  const sources = new Map<string, CareEntryRow>();
  const batches = Array.from({ length: Math.max(1, Math.ceil(input.candidates.length / 64)) },
    (_, i) => input.candidates.slice(i * 64, (i + 1) * 64).map(r => r.id));
  let queries = 0;
  const exactTargets: NonNullable<CorrectionReadDomain["exactTargets"]>[number][] = [];
  for (const ids of batches) {
    const remaining = input.deadline - Date.now();
    if (remaining <= 0) throw Error("source_semantics_deadline");
    queries++;
    const result = await withExecutionDeadline(signal => input.db.rpc("read_ask_source_semantics", {
      p_pet_ids: input.petIds, p_source_ids: ids,
    }).abortSignal(signal), remaining);
    const page = result.data;
    if (result.error || !page || page.complete !== true || page.limit !== 76
      || !Array.isArray(page.claims) || !Array.isArray(page.sources)
      || page.claims.length > 76 || page.sources.length > 76) throw Error("source_semantics_incomplete");
    if (page.sources.some((row: CareEntryRow) => row.user_id !== input.ownerId || !input.petIds.includes(row.pet_profile_id) || row.deleted_at))
      throw Error("source_semantics_scope");
    if (page.targets !== undefined) {
      if (!Array.isArray(page.targets) || page.targets.length > 76) throw Error("source_semantics_target_scope");
      for (const target of page.targets) {
        if (!target || !["source", "claim"].includes(target.kind) || typeof target.id !== "string"
          || target.ownerId !== input.ownerId || !input.petIds.includes(target.petId)
          || target.occurredAt !== null && (typeof target.occurredAt !== "string" || !Number.isFinite(Date.parse(target.occurredAt)))
          || target.conceptKey !== null && typeof target.conceptKey !== "string") throw Error("source_semantics_target_scope");
        const prior = exactTargets.find(t => t.kind === target.kind && t.id === target.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(target)) throw Error("source_semantics_changed_during_read");
        if (!prior) exactTargets.push(target);
      }
    }
    for (const source of page.sources as CareEntryRow[]) {
      const prior = sources.get(source.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(source)) throw Error("source_semantics_changed_during_read");
      sources.set(source.id, source);
    }
    for (const claim of page.claims as Record<string, unknown>[]) {
      const sourceId = claim.source_message_lineage_id;
      const value = readAttributedSourceSemantics(claim, typeof sourceId === "string" ? sources.get(sourceId) : undefined, input.ownerId);
      if (!value || claim.subject_id !== value.source.petId || !input.petIds.includes(value.source.petId))
        throw Error("source_semantics_source_deleted_or_changed");
      const prior = bySource.get(value.source.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(value)) throw Error("source_semantics_changed_during_read");
      bySource.set(value.source.id, value);
    }
    if (ids.some(id => !bySource.has(id))) throw Error("source_semantics_unclassified");
  }
  const unresolved = [...bySource.values()].filter(value =>
    attributedCorrectionRelevance(value, { ...input.domain, exactTargets, ownerId: input.ownerId, petId: value.source.petId }) !== "disjoint");
  return { bySource, unresolved, queries, exactTargets };
}
