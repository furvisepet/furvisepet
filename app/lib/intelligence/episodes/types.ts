export type EpisodeStatus = "active" | "monitoring" | "resolved" | "superseded" | "archived";
export type EpisodeRelation = "new" | "continuation" | "recurrence" | "resolution" | "none";
export type CareEpisode = { id: string; pet_profile_id: string; normalized_key: string; episode_type: string; title?: string; linked_concern_id?: string | null; severity?: string; summary?: Record<string, unknown>; status: EpisodeStatus; sequence_number: number; recurrence_of: string | null; started_at: string; last_event_at: string; resolved_at: string | null };
export type EpisodeEvent = { action?: string | null; category: string; title?: string | null; note: string; occurred_at: string; concern_id?: string | null };
export type EpisodeAssignment = { relation: EpisodeRelation; normalizedKey: string | null; episodeType: string | null; targetEpisodeId: string | null; recurrenceOf: string | null };
