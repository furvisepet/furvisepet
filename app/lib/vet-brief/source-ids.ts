import type { SupabaseClient } from '@supabase/supabase-js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function vetBriefClaimSourceIds(values: unknown[]) {
  return [...new Set(values.flatMap(value => {
    if (typeof value !== 'string') return [];
    const id = value.startsWith('claim-') ? value.slice(6) : value;
    return uuid.test(id) ? [id] : [];
  }))].slice(0, 300);
}
/** Claims have no direct authenticated table SELECT. Use the existing scoped
 * read RPC; never broaden privileges to persist a provenance reference. */
export async function verifyVetBriefClaimSources(db: SupabaseClient, values: unknown[], ownerId: string, petId: string) {
  const ids = vetBriefClaimSourceIds(values); const verified: string[] = [];
  for (let index = 0; index < ids.length; index += 64) {
    const requested = ids.slice(index, index + 64);
    const result = await db.rpc('read_ask_history_correction_page', { p_care_ids: [], p_claim_ids: requested, p_seed_pet_ids: [], p_event_from: null, p_event_to: null, p_terms: [] }).abortSignal(AbortSignal.timeout(5000));
    if (result.error || !result.data || result.data.truncated || !Array.isArray(result.data.claims)) throw new Error('vet_brief_source_verification_unavailable');
    for (const claim of result.data.claims) if (requested.includes(claim.id) && claim.user_id === ownerId && claim.subject_id === petId && claim.persistence_destination === 'history' && claim.knowledge_status === 'effective') verified.push(claim.id);
  }
  return [...new Set(verified)];
}
