import type { ClassifiedTurn } from "./turn-classifier.ts";
import type { PetConcern, PendingUpdateSuggestion } from "./concern-engine.ts";

export type DeterministicTurnPlan = {
  answer: string;
  handledWithoutAi: boolean;
  safetyLevel: "normal" | "monitor" | "urgent";
  suggestion: PendingUpdateSuggestion | null;
};

export function decideWhetherAiGenerationIsNeeded({
  concern,
  petName,
  turn,
}: {
  concern: PetConcern | null;
  petName: string;
  turn: ClassifiedTurn;
}): DeterministicTurnPlan | null {
  if (turn.immediateEmergency) {
    const concernName = concern?.title.trim().toLowerCase() || "urgent symptoms";
    const breathingConcern = concern?.normalized_key === "breathing" || /breath/i.test(`${concernName} ${turn.normalizedMessage}`);
    return {
      answer: breathingConcern
        ? `Before deciding about anything else, how is ${petName} breathing right now? If deep, difficult, or open-mouth breathing is still happening, or ${petName} seems weak or cannot settle, contact a veterinarian or emergency clinic now. Do not force food while breathing is abnormal.`
        : `Before deciding about anything else, is ${concernName} still happening right now? If it is continuing, worsening, or ${petName} seems weak or distressed, contact a veterinarian or emergency clinic now.`,
      handledWithoutAi: true,
      safetyLevel: "urgent",
      suggestion: null,
    };
  }
  if (turn.isLowValueAcknowledgement && turn.concernState === "unrelated") {
    return {
      answer: concern
        ? `Got it. I'll keep ${concern.title.toLowerCase()} in view while it is still being monitored.`
        : `Got it. I'm here whenever you want to add something about ${petName}.`,
      handledWithoutAi: true,
      safetyLevel: concern?.severity === "urgent" ? "monitor" : "normal",
      suggestion: null,
    };
  }
  return null;
}
