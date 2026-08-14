import type { CareEntryRow } from "./supabase";
import type { FurviseMemoryRow } from "./intelligence/types";
import { normalizeKnownPreferenceMemory } from "./intelligence/preference-semantics.ts";

export type HistoryProjectionMemory = Pick<FurviseMemoryRow,
  "category" | "fact_key" | "fact_value" | "id" | "pet_id" | "source_id" | "status" | "subject_type"
>;

/**
 * Projects Ask preference corrections as effective History without deleting
 * their source rows. Medical entries always remain chronological.
 */
export function projectEffectiveCareHistory<T extends CareEntryRow>(entries: readonly T[], memories: readonly HistoryProjectionMemory[]) {
  const memoriesBySource = new Map<string, HistoryProjectionMemory[]>();
  for (const memory of memories) {
    if (!memory.source_id) continue;
    const group = memoriesBySource.get(memory.source_id) || [];
    group.push(memory);
    memoriesBySource.set(memory.source_id, group);
  }

  return entries.filter((entry) => {
    if (isMedicalChronology(entry) || !entry.intelligence_source_message_id) return true;
    const linked = memoriesBySource.get(entry.intelligence_source_message_id) || [];
    if (!linked.length) return true;
    const preferences = linked.filter(isGovernedPreferenceMemory);
    if (!preferences.length) return true;
    const hasOtherEffectiveKnowledge = linked.some((memory) => !isGovernedPreferenceMemory(memory) && memory.status === "active");
    return hasOtherEffectiveKnowledge || preferences.some((memory) => memory.status === "active");
  });
}

function isGovernedPreferenceMemory(memory: HistoryProjectionMemory) {
  return Boolean(normalizeKnownPreferenceMemory({
    subjectType: memory.subject_type,
    subjectId: memory.subject_type === "pet" ? memory.pet_id : null,
    factKey: memory.fact_key,
    factValue: memory.fact_value,
  }));
}

function isMedicalChronology(entry: CareEntryRow) {
  return entry.category === "symptom"
    || entry.category === "medication"
    || entry.category === "vet_visit"
    || entry.state_action_type === "resolve_concern"
    || entry.state_action_type === "reopen_concern";
}
