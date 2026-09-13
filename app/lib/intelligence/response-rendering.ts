import type { IntelligencePersistenceSummary, IntelligenceSafetyLevel } from "./types";

export function toAskSafetyLevel(level: IntelligenceSafetyLevel): "normal" | "monitor" | "urgent" {
  if (level === "urgent" || level === "emergency") return "urgent";
  if (level === "monitor" || level === "recently_resolved") return "monitor";
  return "normal";
}

export function persistedLearningConfirmation(summary: IntelligencePersistenceSummary | null) {
  if (!summary) return null;
  if (summary.carePersistence.status === "persisted" && summary.carePersistence.careEntryIds.length > 0) return "Added to care history";
  if (summary.memoryIds.length > 0) return "Remembered for future questions";
  return null;
}
