import { revalidatePath } from "next/cache";

type AskStateInvalidator = (path: string) => void;

/**
 * Publish one scoped cache invalidation after a durable Ask state change.
 *
 * This intentionally excludes /ask itself. The active thread owns its local
 * request lifecycle; downstream views re-read the newly committed pet state.
 */
export function revalidateAskStateViews(
  petIds: string[],
  invalidate: AskStateInvalidator = revalidatePath,
) {
  for (const path of ["/dashboard", "/today", "/pets", "/history", "/care-log"]) {
    invalidate(path);
  }

  for (const petId of new Set(petIds.filter(Boolean))) {
    invalidate(`/pets/${petId}`);
    invalidate(`/pets/${petId}/care`);
    invalidate(`/pets/${petId}/memories`);
    invalidate(`/dogs/${petId}/care`);
    invalidate(`/dogs/${petId}/memories`);
  }
}
