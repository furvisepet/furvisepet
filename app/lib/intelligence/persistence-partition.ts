import type { IntelligenceLearning } from "./types.ts";

export function groupLearningsByPersistencePet<T extends IntelligenceLearning>(learnings: T[], fallbackPetId: string) {
  const groups = new Map<string, T[]>();
  for (const learning of learnings) {
    const targetPetId = learning.subjectType === "pet" ? learning.subjectId : fallbackPetId;
    if (!targetPetId) continue;
    groups.set(targetPetId, [...(groups.get(targetPetId) || []), learning]);
  }
  return [...groups.entries()];
}
