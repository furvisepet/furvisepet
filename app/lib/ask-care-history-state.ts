export type AskCareHistoryState = "NO_HISTORY_VALUE" | "SUGGESTION_AVAILABLE" | "SAVE_PENDING" | "SAVED" | "SAVE_FAILED";

export function getAskCareHistoryState(input: {
  carePersistence?: { status?: string; careEntryIds?: string[] } | null;
  suggestion?: { status?: string; applyStatus?: string; uiStatus?: string } | null;
}): AskCareHistoryState {
  const persistence = input.carePersistence;
  const suggestion = input.suggestion;
  if (persistence?.status === "persisted" && Boolean(persistence.careEntryIds?.length)) return "SAVED";
  if (suggestion?.status === "saved" || suggestion?.applyStatus === "applied" || suggestion?.applyStatus === "already_applied") return "SAVED";
  if (persistence?.status === "failed" || suggestion?.uiStatus === "failed") return "SAVE_FAILED";
  if (suggestion?.uiStatus === "saving") return "SAVE_PENDING";
  if (suggestion && suggestion.status !== "dismissed") return "SUGGESTION_AVAILABLE";
  return "NO_HISTORY_VALUE";
}
