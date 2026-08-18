import type { AskReasoningResult, GenerateAskReasoningInput } from "./ask-reasoning.ts";
import type { PetConcern, PendingUpdateSuggestion } from "./concern-engine.ts";
import { buildConcernOpeningSuggestion, buildMemorySuggestion, buildObservationSuggestion, buildResolutionSuggestion, getCurrentConcern } from "./concern-engine.ts";
import { decideWhetherAiGenerationIsNeeded } from "./response-planner.ts";
import { classifyUserTurn, type TurnIntent } from "./turn-classifier.ts";
import { evaluateCareHistorySaveWorthiness } from "../intelligence/care-history-policy.ts";

export type AskOrchestratorResult = {
  aiResult: AskReasoningResult | null;
  answer: AskReasoningResult["answer"];
  concern: PetConcern | null;
  handledWithoutAi: boolean;
  intent: TurnIntent;
  safetyLevel: "normal" | "monitor" | "urgent";
  suggestion: PendingUpdateSuggestion | null;
};

export async function orchestrateAskTurn({
  concerns,
  generate,
  generationInput,
  message,
  petName,
}: {
  concerns: PetConcern[];
  generate: (input: GenerateAskReasoningInput) => Promise<AskReasoningResult>;
  generationInput: GenerateAskReasoningInput;
  message: string;
  petName: string;
}): Promise<AskOrchestratorResult> {
  const concern = getCurrentConcern(concerns);
  const turn = classifyUserTurn(message, { hasActiveConcern: Boolean(concern) });
  const deterministic = decideWhetherAiGenerationIsNeeded({ concern, petName, turn });
  if (deterministic) {
    return {
      aiResult: null,
      answer: {
        title: deterministic.safetyLevel === "urgent"
          ? concern?.normalized_key === "breathing" ? `${petName}'s breathing still needs urgent attention` : "This still needs prompt attention"
          : "Furvise",
        summary: deterministic.answer,
        sections: [],
        safetyNote: null,
      },
      concern,
      handledWithoutAi: true,
      intent: turn.intent,
      safetyLevel: deterministic.safetyLevel,
      suggestion: deterministic.suggestion,
    };
  }

  const aiResult = await generate({ ...generationInput, concernStateHint: turn.concernState });
  const proposed = aiResult.proposedHistoryUpdate;
  const hasMemoryApplicationAction = (aiResult.applicationActions || []).some((action) => action.kind.startsWith("memory."));
  const improvementSuggestion = concern && (turn.concernState === "improved" || turn.concernState === "resolved")
    ? buildResolutionSuggestion({ concern, message, petName })
    : null;
  const modelSuggestion: PendingUpdateSuggestion | null = turn.intent !== "casual" && proposed.shouldOffer && proposed.details
    ? {
        type: proposed.resolvesConcernId ? "concern_resolution" : "history",
        title: proposed.resolvesConcernId ? "Save this improvement" : "Save this update?",
        details: proposed.details,
        concernId: proposed.resolvesConcernId || undefined,
        payload: {
          category: proposed.category || "general",
          concernId: proposed.resolvesConcernId,
          note: proposed.details,
          resolutionNote: proposed.resolvesConcernId ? proposed.details : null,
          severity: proposed.severity || "mild",
          title: proposed.title || "Care update",
        },
      }
    : null;
  const candidateSuggestion = improvementSuggestion || modelSuggestion || (!hasMemoryApplicationAction && (turn.intent === "preference" || turn.intent === "correction")
    ? buildMemorySuggestion({ message, petName })
    : turn.intent === "new_observation"
      ? buildConcernOpeningSuggestion({ message, petName }) || buildObservationSuggestion({ message, petName })
      : null);
  const suggestion = candidateSuggestion?.type === "history" && !evaluateCareHistorySaveWorthiness({
    category: typeof candidateSuggestion.payload.category === "string" ? candidateSuggestion.payload.category : undefined,
    title: typeof candidateSuggestion.payload.title === "string" ? candidateSuggestion.payload.title : candidateSuggestion.title,
    details: candidateSuggestion.details,
    sourceMessage: message,
  }).eligible ? null : candidateSuggestion;
  return {
    aiResult,
    answer: aiResult.answer,
    concern,
    handledWithoutAi: false,
    intent: turn.intent,
    safetyLevel: aiResult.safetyLevel,
    suggestion,
  };
}
