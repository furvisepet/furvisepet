import type { CareEntryRow } from "../supabase.ts";
import type { DbClaim } from "./history-retrieval.ts";

export type Membership = { id: string; user_id: string; pet_profile_id: string; episode_id: string;
  care_entry_id: string | null; claim_id: string | null; event_ordinal: number; event_role: string;
  occurred_at: string; created_at: string; source_issue: string | null };
export type EpisodeSource = CareEntryRow & { episode_id?: string | null; content_omitted?: boolean; claim?: DbClaim; evidenceId?: string };
type Episode = { id: string; user_id: string; pet_profile_id: string; normalized_key: string; missing_source_event_ids?: string[] };
const roles = ["opening", "continuation", "worsening", "improvement", "resolution", "recurrence"];

/** Membership establishes an edge, never a complete lifetime inventory or a
 * semantic boundary. Preserve every edge for hashing, including invalid ones. */
export function episodeMembershipSources(data: { membership_contract?: string; memberships?: Membership[]; claims?: DbClaim[] },
  episodes: Episode[], care: EpisodeSource[], owner: string, pet: string) {
  const invalid = new Set<string>();
  if (data.membership_contract === undefined) return { sources: care, invalid, memberships: null };
  if (data.membership_contract !== "ask-episode-membership.v1" || !Array.isArray(data.memberships)
    || !Array.isArray(data.claims) || data.memberships.length > 72 || data.claims.length > 72)
    throw new Error("episode_membership_read_unavailable");
  const memberships = data.memberships;
  if (new Set(memberships.map(m => m.id)).size !== memberships.length || new Set(data.claims.map(c => c.id)).size !== data.claims.length)
    throw new Error("episode_membership_duplicate_identity");
  const sources: EpisodeSource[] = [];
  for (const ep of episodes) {
    const group = memberships.filter(m => m.episode_id === ep.id);
    if (!group.length || group.length > 8 || ep.missing_source_event_ids?.length) invalid.add(ep.id);
  }
  for (const m of memberships) {
    const ep = episodes.find(e => e.id === m.episode_id);
    if (!ep || m.user_id !== owner || m.pet_profile_id !== pet) throw new Error("episode_membership_scope_mismatch");
    if (m.source_issue !== null || !m.id || !Number.isSafeInteger(m.event_ordinal) || m.event_ordinal < 1 || !roles.includes(m.event_role)
      || Boolean(m.care_entry_id) === Boolean(m.claim_id)) { invalid.add(ep.id); continue; }
    if (m.care_entry_id) {
      const s = care.find(s => s.id === m.care_entry_id);
      if (!s || s.episode_id !== ep.id || s.user_id !== owner || s.pet_profile_id !== pet
        || s.deleted_at || s.content_omitted || typeof s.note !== "string" || s.occurred_at !== m.occurred_at) invalid.add(ep.id);
      else sources.push(s);
    } else {
      const c = data.claims.find(c => c.id === m.claim_id);
      const v = c?.structured_value as { note?: unknown; title?: unknown; severity?: unknown } | null;
      if (!c || c.content_omitted || c.user_id !== owner || c.subject_id !== pet || c.subject_type !== "pet"
        || c.canonical_concept_key !== ep.normalized_key || c.concept_key !== ep.normalized_key
        || c.concept_resolution_status !== "canonical" || c.concept_authority !== "governed_registry"
        || !["event", "state_transition"].includes(String(c.claim_kind)) || c.lifecycle_role !== m.event_role
        || c.persistence_destination !== "history" || c.knowledge_status !== "effective"
        || c.polarity !== "affirmed" || !["asserted", "reported"].includes(String(c.modality))
        || !["assert", "confirm"].includes(String(c.operation_type))
        || typeof c.occurred_at !== "string" || c.occurred_at !== m.occurred_at || !Number.isFinite(Date.parse(c.occurred_at))
        || typeof c.recorded_at !== "string" || !v || typeof v.note !== "string" || v.note.length > 2000
        || (v.title != null && (typeof v.title !== "string" || v.title.length > 200))) { invalid.add(ep.id); continue; }
      sources.push({ id: `claim-${c.id}`, evidenceId: `claim:${c.id}`, claim: c, user_id: owner, pet_profile_id: pet,
        episode_id: ep.id, category: "general", title: typeof v.title === "string" ? v.title : null, note: v.note,
        severity: null, occurred_at: c.occurred_at, created_at: c.recorded_at, updated_at: c.recorded_at, deleted_at: null });
    }
  }
  return { sources, invalid, memberships };
}
