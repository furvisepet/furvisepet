import { revalidatePath } from "next/cache";

/**
 * Publish one scoped cache invalidation after a durable Ask state change.
 *
 * This intentionally excludes /ask itself. The active thread owns its local
 * request lifecycle; downstream views re-read the newly committed pet state.
 */
export function revalidateAskStateViews(petIds: string[]) {
  for (const path of ["/dashboard", "/today", "/pets", "/history", "/care-log"]) {
    revalidatePath(path);
  }

  for (const petId of new Set(petIds.filter(Boolean))) {
    revalidatePath(`/pets/${petId}`);
    revalidatePath(`/pets/${petId}/care`);
    revalidatePath(`/pets/${petId}/memories`);
    revalidatePath(`/dogs/${petId}/care`);
    revalidatePath(`/dogs/${petId}/memories`);
  }
}
