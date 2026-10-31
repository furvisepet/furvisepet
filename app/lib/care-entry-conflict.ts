/** Only the care-update RPC's fixed business error denotes a stale saved note.
 * PostgreSQL serialization failures and unrelated conflicts remain non-stale. */
export const CARE_ENTRY_STALE_MESSAGE = "This note changed after you opened it. Reopen it before editing.";

export function isCareEntryStaleError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (value.code === "40001" || value.code === "PT409") && value.message === "CARE_ENTRY_STALE";
}
