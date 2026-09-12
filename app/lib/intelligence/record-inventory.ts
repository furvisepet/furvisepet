import { historyQueryTerms } from "./history-query-relevance.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext } from "./types.ts";
import { clipHistoryPlan } from "./history-access.ts";

export type RecordInventory = { petId: string; count: number; from: string; to: string; checkedAt: string };
/** Count physical, active notes in one database statement per owned pet.
 * This is deliberately separate from clinical extraction and episode grouping. */
export async function readRecordInventory(context: FurviseLiveContext, db: SupabaseClient): Promise<RecordInventory[]> {
  const interpretation = context.askInterpretation, request = interpretation?.request;
  if (!interpretation?.readOnly || request?.quantity !== "records" || !interpretation.history
    || historyQueryTerms(interpretation.history.terms.filter(term => !/^(?:care|care history|care-history|entries|database notes|database|total|count)$/i.test(term)), context.eligiblePets.map(pet => pet.name || "")).length || !/\b(?:how many|count|number of|total)\b/i.test(context.currentMessage)
    || !/\b(?:care[- ]history entries|database notes|saved (?:care )?(?:notes|entries|records))\b/i.test(context.currentMessage)) return [];
  const plan = clipHistoryPlan(interpretation.history, context.historyAccess);
  if (!plan.from || !plan.to || !Number.isFinite(Date.parse(plan.from)) || !Number.isFinite(Date.parse(plan.to))
    || Date.parse(plan.from) >= Date.parse(plan.to)) return [];
  const owned = new Set(context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => pet.id));
  const result: RecordInventory[] = [];
  for (const petId of [...new Set(interpretation.petIds)].filter(id => owned.has(id)).slice(0,3)) {
    try {
      const { count, error } = await db.from("pet_care_entries").select("id", { count: "exact", head: true })
        .eq("user_id", context.owner.userId).eq("pet_profile_id", petId).is("deleted_at", null)
        .gte("occurred_at", plan.from).lt("occurred_at", plan.to).abortSignal(AbortSignal.timeout(4000));
      if (!error && Number.isSafeInteger(count) && count! >= 0) result.push({ petId, count: count!, from: plan.from, to: plan.to, checkedAt: new Date().toISOString() });
    } catch { /* No aggregate evidence is issued on unavailable database reads. */ }
  }
  return result;
}
export function recordInventoryEvidence(items: readonly RecordInventory[]) {
  return items.map(item => ({ sourceId: `record-inventory:${item.petId}`, petId: item.petId, occurredAt: null,
    text: `Database count checked at ${item.checkedAt}: exactly ${item.count} active saved care-history entries with recorded dates from ${item.from} inclusive to ${item.to} exclusive. This counts database notes, not episodes or events described within notes. It covers only this accessible date interval, not later dates or excluded history.`,
  }));
}
