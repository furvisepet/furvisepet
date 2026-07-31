import type { CareEpisode } from "../episodes/types.ts";

export type StateDomainValue = { status: string; confidence: number; lastObservedAt: string; sourceEventId: string };
export type CanonicalPetState = { wellbeing?: { overall: "normal" | "uncertain" | "monitoring" | "concerning" | "urgent" }; breathing?: StateDomainValue; energy?: StateDomainValue; appetite?: StateDomainValue; currentFood?: StateDomainValue; currentMedications?: Array<{ name: string; startedAt: string; sourceEventId: string }>; lastMeaningfulUpdateAt?: string };
export type PetCurrentStateRow = { pet_profile_id: string; user_id: string; state_version: number; state: CanonicalPetState; active_episode_ids: string[]; monitoring_episode_ids: string[]; source_event_ids: string[]; computed_at: string; valid_through: string | null; created_at: string; updated_at: string };
export type StateReduction = { state: CanonicalPetState; sourceEventIds: string[]; activeEpisodeIds: string[]; monitoringEpisodeIds: string[]; changedDomains: string[] };
export type StateEpisode = Pick<CareEpisode, "id" | "status" | "episode_type">;
