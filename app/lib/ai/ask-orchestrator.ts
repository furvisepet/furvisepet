import type { AskReasoningResult } from "./ask-reasoning.ts";
import type { PetConcern, PendingUpdateSuggestion } from "./concern-engine.ts";
import { buildConcernOpeningSuggestion, buildMemorySuggestion, buildObservationSuggestion, buildResolutionSuggestion, getCurrentConcern, isPendingUpdateSuggestionGrounded, isRecoveryGroundedForConcern } from "./concern-engine.ts";
import { isPetObservationEvidence, petObservationSpans } from "./recovery-subject.ts";
import { decideWhetherAiGenerationIsNeeded } from "./response-planner.ts";
import { classifyUserTurn, type TurnIntent } from "./turn-classifier.ts";
import { evaluateCareHistorySaveWorthiness } from "../intelligence/care-history-policy.ts";
import { planAskAnswerDepth } from "./ask-answer-economy.ts";

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
  message,
  petName,
}: {
  concerns: PetConcern[];
  // Generation owns its evidence input; orchestration supplies only turn classification.
  generate: (turn: { concernStateHint: ReturnType<typeof classifyUserTurn>["concernState"] }) => Promise<AskReasoningResult>;
  message: string;
  petName: string;
}): Promise<AskOrchestratorResult> {
  const providerIndependent = planProviderIndependentAskTurn({ concerns, message, petName });
  if (providerIndependent) return providerIndependent;
  const concern = getCurrentConcern(concerns);
  const turn = classifyUserTurn(message, { hasActiveConcern: Boolean(concern) });

  const aiResult = await generate({ concernStateHint: turn.concernState });
  return finishGeneratedTurn({ aiResult, concern, concerns, message, petName, turn });
}

export function planProviderIndependentAskTurn({
  concerns,
  message,
  petName,
}: {
  concerns: PetConcern[];
  message: string;
  petName: string;
}): AskOrchestratorResult | null {
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
  return null;
}

function finishGeneratedTurn({ aiResult, concern, concerns, message, petName, turn }: {
  aiResult: AskReasoningResult;
  concern: PetConcern | null;
  concerns: PetConcern[];
  message: string;
  petName: string;
  turn: ReturnType<typeof classifyUserTurn>;
}): AskOrchestratorResult {
  const proposed = aiResult.proposedHistoryUpdate;
  const answerDepth = aiResult.answerDepth || planAskAnswerDepth({
    intent: turn.intent,
    message,
    minimumSafetyLevel: aiResult.safetyLevel,
    responseMode: aiResult.responseMode,
  });
  const hasMemoryApplicationAction = (aiResult.applicationActions || []).some((action) => action.kind.startsWith("memory."));
  const recoveryConcerns = concerns.filter((target) => isRecoveryGroundedForConcern({ activeConcerns: concerns, concern: target, message, petId: target.pet_profile_id, petName }));
  const improvementSuggestion = recoveryConcerns.length === 1
    ? buildResolutionSuggestion({ concern: recoveryConcerns[0], message, petName })
    : null;
  const modelSuggestion: PendingUpdateSuggestion | null = turn.intent !== "casual" && proposed.shouldOffer
    && proposed.details
    && answerDepth.allowsAutomaticHistory
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
  const suggestionConcern = candidateSuggestion?.type === "concern_resolution" && candidateSuggestion.concernId
    ? concerns.find((item) => item.id === candidateSuggestion.concernId) || null
    : null;
  let suggestion = aiResult.responseMode === "grief_support"
    ? null
    : candidateSuggestion && !isPendingUpdateSuggestionGrounded({
        suggestion: candidateSuggestion,
        message,
        hasActiveConcern: Boolean(concern),
        concern: suggestionConcern,
        activeConcerns: concerns,
        petId: suggestionConcern?.pet_profile_id,
        petName,
      })
      ? null
    : (candidateSuggestion?.type === "history" || candidateSuggestion?.type === "concern_opening") && (!answerDepth.allowsAutomaticHistory || !evaluateCareHistorySaveWorthiness({
      category: typeof candidateSuggestion.payload.category === "string" ? candidateSuggestion.payload.category : undefined,
      title: typeof candidateSuggestion.payload.title === "string" ? candidateSuggestion.payload.title : candidateSuggestion.title,
      details: candidateSuggestion.details,
      sourceMessage: message,
    }).eligible) ? null : candidateSuggestion;
  // A rejected terminal proposal can still contain a useful qualified report.
  // Retain the owner's entire supported observation, never the model's recovery
  // title/note or a raw outside-animal message under the selected pet.
  if (!suggestion && aiResult.responseMode !== "grief_support" && answerDepth.allowsAutomaticHistory
    && isPetObservationEvidence(message, message, petName)) {
    const observation = buildObservationSuggestion({ message, petName });
    if (isPendingUpdateSuggestionGrounded({ suggestion: observation, message, petName })) suggestion = observation;
  }
  if (!suggestion && aiResult.responseMode !== "grief_support" && answerDepth.allowsAutomaticHistory) {
    const spans = petObservationSpans(message, petName);
    // Do not sever the qualifier of an uncertain clause; the whole-source path
    // above preserves those. Independently certain observations can stand alone.
    const note = spans.filter((span) => span.isCertain).map((span) => span.text).join(" ");
    if (note && isPetObservationEvidence(message, note, petName)) {
      const observation = buildObservationSuggestion({ message: note, petName });
      if (isPendingUpdateSuggestionGrounded({ suggestion: observation, message, petName })) suggestion = observation;
    }
  }
  if (suggestion?.type === "concern_resolution") {
    const targetId = suggestion.concernId;
    const target = concerns.find((item) => item.id === targetId);
    if (target) suggestion = buildResolutionSuggestion({ concern: target, message, petName });
  }
  return {
    aiResult,
    answer: aiResult.answer,
    concern,
    handledWithoutAi: false,
    intent: turn.intent,
    safetyLevel: aiResult.safetyLevel,
    suggestion: aiResult.evidenceContract?.scope.readOnlyRecall ? null : suggestion,
  };
}
