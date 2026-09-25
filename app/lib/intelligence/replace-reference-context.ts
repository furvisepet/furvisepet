import "server-only";
import { randomUUID } from "node:crypto";
import type { ReplaceReference } from "../furvise-brain/replace-job.ts";
import { createCanonicalCareAuthorityClient } from "./care-authority-client.ts";

/** Bounded mutation-target catalog. It grants no read/publication completeness. */
export async function loadReplaceReferences(ownerId: string, petIds: string[], asOf: string): Promise<ReplaceReference[]> {
  try {
    const { data, error } = await createCanonicalCareAuthorityClient().rpc("list_ask_replace_targets", {
      p_user_id: ownerId, p_pet_ids: petIds, p_as_of: asOf,
    });
    if (error || !Array.isArray(data)) return [];
    return data.filter(r => r.user_id === ownerId && petIds.includes(r.pet_profile_id)).map(r => ({
      ref: randomUUID(), recordId: r.id, ownerId, petId: r.pet_profile_id,
      updatedAt: r.updated_at, createdAt: r.created_at, body: r.note, eventAt: r.occurred_at,
    }));
  } catch { return []; } // No catalog means no exact-record handles, never a guessed target.
}
