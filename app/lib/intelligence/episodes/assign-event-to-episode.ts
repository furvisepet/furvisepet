import { normalizeEpisodeKey } from "./normalize-episode-key.ts";
import type { CareEpisode, EpisodeAssignment, EpisodeEvent } from "./types.ts";

export function assignEventToEpisode(event: EpisodeEvent, episodes: CareEpisode[]): EpisodeAssignment {
  const normalizedKey = normalizeEpisodeKey(event);
  const episodeType = episodeTypeFor(event.category);
  if (!normalizedKey || !episodeType) return { relation: "none", normalizedKey, episodeType, targetEpisodeId: null, recurrenceOf: null };
  const matching = episodes.filter((episode) => episode.normalized_key === normalizedKey).sort((a, b) => b.sequence_number - a.sequence_number);
  const active = matching.find((episode) => episode.status === "active" || episode.status === "monitoring") || null;
  const latest = matching[0] || null;
  if (event.action === "resolve_concern" || /normal now|normal again|returned to normal|finished|completed/i.test(`${event.title || ""} ${event.note}`))
    return { relation: "resolution", normalizedKey, episodeType, targetEpisodeId: active?.id || latest?.id || null, recurrenceOf: null };
  if (event.action === "reopen_concern" || (!active && /again|recurred|problem is back|returned/i.test(`${event.title || ""} ${event.note}`)))
    return { relation: "recurrence", normalizedKey, episodeType, targetEpisodeId: null, recurrenceOf: latest?.id || null };
  if (active) return { relation: "continuation", normalizedKey, episodeType, targetEpisodeId: active.id, recurrenceOf: null };
  return { relation: "new", normalizedKey, episodeType, targetEpisodeId: null, recurrenceOf: null };
}

function episodeTypeFor(category: string) { return ({ symptom: "symptom", medication: "medication_course", food: "food_transition", behavior: "behavior_change", vet_visit: "vet_visit" } as Record<string, string>)[category] || null; }
