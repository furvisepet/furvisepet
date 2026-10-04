import { assertCatalogPermit, type CatalogPermit } from "./catalog-intent.ts";
import "server-only";
import { randomUUID } from "node:crypto";
import type { ReplaceReference } from "../furvise-brain/replace-job.ts";
import { createCanonicalCareAuthorityClient } from "./care-authority-client.ts";

/** Bounded mutation-target catalog. It grants no read/publication completeness. */
export async function loadReplaceReferences(permit: CatalogPermit): Promise<ReplaceReference[]> {
  assertCatalogPermit(permit, permit.purpose, "hydrating");
  if (permit.purpose !== "replace" && permit.purpose !== "remove") throw Error("ASK_CATALOG_INVALID:purpose");
  const { ownerId, subjectIds: petIds, cutoff: asOf } = permit;
  try {
    const { data, error } = await createCanonicalCareAuthorityClient().rpc("list_ask_replace_targets", {
      p_user_id: ownerId, p_pet_ids: petIds, p_as_of: asOf,
    });
    if (error || !Array.isArray(data) || data.length > permit.maxRows) throw Error("ASK_CATALOG_UNAVAILABLE");
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > permit.maxBytes) throw Error("ASK_CATALOG_LIMIT");
    return data.filter(r => r.user_id === ownerId && petIds.includes(r.pet_profile_id)).map(r => ({
      ref: randomUUID(), recordId: r.id, ownerId, petId: r.pet_profile_id,
      updatedAt: r.updated_at, createdAt: r.created_at, body: r.note, eventAt: r.occurred_at,
    }));
  } catch { throw Error("ASK_CATALOG_UNAVAILABLE"); }
}
