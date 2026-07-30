import type { CareEntryRow } from "../../supabase.ts";
import { classifyCareEvent } from "../concern-chronology.ts";
import type { CanonicalPetState, StateEpisode, StateReduction } from "./types.ts";

export function reducePetState(events: CareEntryRow[], episodes: StateEpisode[], previous: CanonicalPetState = {}): StateReduction {
  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const state: CanonicalPetState = structuredClone(previous);
  const changed = new Set<string>();
  for (const event of ordered) {
    const text = `${event.title || ""} ${event.note}`;
    if (/breath|breathing/i.test(text)) {
      const type = classifyCareEvent(event);
      const status = type === "recovery" ? "normal" : type === "urgent" || type === "recurrence" ? "abnormal" : "uncertain";
      state.breathing = { status, confidence: event.intelligence_confidence ?? 1, lastObservedAt: event.occurred_at, sourceEventId: event.id };
      state.lastMeaningfulUpdateAt = event.occurred_at;
      changed.add("breathing");
    }
    if (event.category === "medication") {
      const update = medicationUpdate(text);
      if (!update) continue;
      const medications = [...(state.currentMedications || [])].filter((item) => item.name.toLowerCase() !== update.name.toLowerCase());
      if (update.operation === "start") medications.push({ name: update.name, startedAt: event.occurred_at, sourceEventId: event.id });
      state.currentMedications = medications;
      state.lastMeaningfulUpdateAt = event.occurred_at;
      changed.add("currentMedications");
    }
  }
  const activeEpisodeIds = episodes.filter((episode) => episode.status === "active").map((episode) => episode.id);
  const monitoringEpisodeIds = episodes.filter((episode) => episode.status === "monitoring").map((episode) => episode.id);
  const hasActiveSafetyEpisode = episodes.some((episode) => episode.status === "active" && episode.episode_type === "symptom");
  const overall = state.breathing?.status === "abnormal" || hasActiveSafetyEpisode ? "urgent" : state.breathing?.status === "normal" ? "monitoring" : "uncertain";
  state.wellbeing = { overall };
  return { state, sourceEventIds: ordered.map((event) => event.id), activeEpisodeIds, monitoringEpisodeIds, changedDomains: [...changed] };
}
function eventTime(event: CareEntryRow) { return Date.parse(event.occurred_at) || Date.parse(event.created_at) || 0; }
function medicationUpdate(text: string) {
  const match = /\b(started|finished|completed|stopped)\s+([A-Za-z][A-Za-z0-9-]{2,})\b/i.exec(text);
  if (!match || /^(?:a|an|the|some|medication|medicine)$/i.test(match[2])) return null;
  return { name: match[2], operation: /^(?:finished|completed|stopped)$/i.test(match[1]) ? "complete" as const : "start" as const };
}
