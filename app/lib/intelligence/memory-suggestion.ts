import type { IntelligenceLearning } from "./types.ts";
import { isEligibleLegacyMemory, prepareTypedMemoryCandidate } from "./memory-integrity.ts";

/** Validate the exact reviewed note; do not infer a clinical fact or a replacement target. */
export function prepareMemorySuggestion(suggestion: {
  id: string; pet_profile_id: string; details: string | null; payload: Record<string, unknown>;
}) {
  const note = suggestion.details || (typeof suggestion.payload.note === "string" ? suggestion.payload.note.trim() : "");
  const memoryType = (typeof suggestion.payload.memoryType === "string" ? suggestion.payload.memoryType.trim() : "") || "preference";
  if (!note || note.trim().length < 2 || note.length > 1000 || memoryType.length > 80
    || !isEligibleLegacyMemory({ type: memoryType, text: note })) return null;
  const learning: IntelligenceLearning = {
    subjectType: "pet", subjectId: suggestion.pet_profile_id, category: memoryType,
    factKey: "remembered_detail_" + suggestion.id.replaceAll("-", ""),
    factValue: note, confidence: 1, importance: "high", durability: "durable", action: "create", sourceExcerpt: note,
  };
  const decision = prepareTypedMemoryCandidate(learning, "Remember this: " + note, [suggestion.pet_profile_id]);
  return decision.accepted ? { note, memoryType } : null;
}
