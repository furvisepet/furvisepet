import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import type { HistoryCoverage } from "./history-retrieval.ts";

/** Discover possible correction prose; never infer a correction edge, event
 * date, or a replacement pet from text. All accepted rows still pass the shared
 * current-source/lineage validation before becoming model evidence. */
export async function discoverDatedCorrectionNotes(originals: CareEntryRow[], petIds: string[], userId: string,
  db: SupabaseClient, coverage: HistoryCoverage, deadline: number): Promise<CareEntryRow[]> {
  if (!coverage.plan.from || !petIds.length) return [];
  const year = coverage.plan.from.slice(0, 4);
  const ids = new Set(originals.map(row => row.id));
  const notes: CareEntryRow[] = [];
  const limit = Math.floor(12 / petIds.length);
  const terms = ["correct", "retract", "supersed"];
  coverage.reasons.push("unlinked_correction_discovery_bounded_not_complete");
  for (const petId of petIds) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("correction_discovery_deadline");
      coverage.queryCount++;
      const result = await db.rpc("read_ask_history_candidates", { p_pet_id: petId, p_terms: terms,
        p_from: null, p_to: null, p_after_time: null, p_after_id: null, p_limit: limit }).abortSignal(AbortSignal.timeout(remaining));
      if (result.error || !Array.isArray(result.data) || result.data.length > limit) throw new Error("correction_discovery_unavailable");
      const rows = result.data as CareEntryRow[];
      // Reject a malformed/foreign page as a whole; do not retain a prefix.
      if (rows.some(row => row.user_id !== userId || row.pet_profile_id !== petId || row.deleted_at
        || typeof row.note !== "string" || !/^[a-zA-Z0-9_-]+$/.test(row.id)
        || !row.occurred_at || !Number.isFinite(Date.parse(row.occurred_at)))) throw new Error("correction_discovery_scope");
      for (const row of rows) {
        const text = `${row.title || ""} ${row.note}`;
        // An explicit matching year is a locator only. A different topic/month
        // can still be unrelated; retain qualification instead of claiming a link.
        const previousDay = new Date(Date.parse(row.occurred_at) - 86400000).toISOString().slice(0, 10);
        const refersToPreviousDay = /\byesterday(?:['’]s)?\b/i.test(text)
          && (originals.some(original => original.pet_profile_id === petId && original.occurred_at.slice(0, 10) === previousDay)
            || !!coverage.plan.to && previousDay >= coverage.plan.from!.slice(0, 10) && previousDay < coverage.plan.to.slice(0, 10));
        if (!ids.has(row.id) && (new RegExp(`\\b${year}\\b`).test(text) || refersToPreviousDay)
          && /\b(?:correct\w*|retract\w*|supersed\w*)\b/i.test(text)) {
          ids.add(row.id); notes.push(row);
        }
      }
      if (rows.length === limit) {
        if (coverage.corrections !== "unavailable") coverage.corrections = "partial";
        coverage.reasons.push("unlinked_correction_discovery_cap");
      }
    } catch {
      coverage.corrections = "unavailable";
      coverage.reasons.push("unlinked_correction_discovery_unavailable");
    }
  }
  return notes;
}
