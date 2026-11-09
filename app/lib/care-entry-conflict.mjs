/** A stale optimistic-concurrency token is a conflict, not a transient outage. */
export function isStaleCareEntryError(error) {
  return error != null && error.code === "40001" &&
    typeof error.message === "string" && /\bCARE_ENTRY_STALE\b/.test(error.message);
}
