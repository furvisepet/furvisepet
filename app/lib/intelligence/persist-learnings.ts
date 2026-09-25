import "server-only";
import { normalizeMemoryValue } from "./memory-policy";
import type { IntelligenceLearning } from "./types";
import { prepareTypedMemoryCandidate } from "./memory-integrity.ts";

export class IntelligencePersistenceError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "IntelligencePersistenceError";
  }
}

export function prepareAskMemoryAuthorityLearnings({ authorizedPetIds, currentMessage, learnings }: {
  authorizedPetIds: string[];
  currentMessage: string | null;
  learnings: IntelligenceLearning[];
}) {
  return learnings.flatMap((learning) => {
    // Ordinary Ask cannot derive owner singleton mutations from narrative learnings.
    // Source-bound field jobs use the existing capability boundary instead.
    if (learning.subjectType === "owner") return [];
    const decision = prepareTypedMemoryCandidate(learning, currentMessage || learning.sourceExcerpt, authorizedPetIds);
    return decision.accepted ? [{
      ...decision.learning,
      normalizedValue: normalizeMemoryValue(decision.learning.factValue),
    }] : [];
  });
}
