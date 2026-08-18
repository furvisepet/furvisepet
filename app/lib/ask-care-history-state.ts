export type AskCareHistoryState = "none" | "suggestion_available" | "saved" | "save_failed";

export function getAskCareHistoryState(input: {
  carePersistence?: { status?: string; careEntryIds?: string[] } | null;
  suggestion?: { status?: string; applyStatus?: string; uiStatus?: string } | null;
}): AskCareHistoryState {
  const persistence = input.carePersistence;
  const suggestion = input.suggestion;
  if (persistence?.status === "persisted" && Boolean(persistence.careEntryIds?.length)) return "saved";
  if (suggestion?.status === "saved" || suggestion?.applyStatus === "applied" || suggestion?.applyStatus === "already_applied") return "saved";
  if (persistence?.status === "failed" || suggestion?.uiStatus === "failed") return "save_failed";
  if (suggestion && suggestion.status !== "dismissed") return "suggestion_available";
  return "none";
}
