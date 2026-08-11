import { classifyUserTurn } from "../ai/turn-classifier.ts";
import type { IntelligenceMessageUnderstanding } from "./types";

export function classifyMessageDeterministically(message: string, hasActiveConcern: boolean): IntelligenceMessageUnderstanding {
  const turn = classifyUserTurn(message, { hasActiveConcern });
  const primaryIntent = ({
    casual: "general_conversation", correction: "correction", new_observation: "update",
    preference: "pet_preference", product_question: "product", question: "question",
    resolution: "concern_resolution", status_update: "update", vet_preparation: "vet_preparation", unknown: "unknown",
  } as const)[turn.intent];
  return {
    primaryIntent,
    secondaryIntents: [],
    userIsAskingQuestion: turn.intent === "question" || turn.intent === "product_question" || turn.intent === "vet_preparation",
    userIsProvidingUpdate: turn.intent === "new_observation" || turn.intent === "status_update" || turn.intent === "resolution",
    userIsCorrectingPriorInformation: turn.intent === "correction",
    userIsResolvingConcern: turn.intent === "resolution",
    userIsProvidingPreference: turn.intent === "preference",
    userIsMakingSmallTalk: turn.intent === "casual",
    recoveryStatus: turn.concernState === "resolved" ? "terminal" : turn.concernState === "improved" ? "partial" : turn.concernState === "unclear" ? "uncertain" : "none",
    recoveryConfidence: turn.concernState === "resolved" || turn.concernState === "improved" ? 0.99 : turn.concernState === "unclear" ? 0.5 : 1,
    recoveryEvidence: {
      outcome: turn.concernState === "resolved" ? "return_to_baseline" : turn.concernState === "improved" ? "partial_improvement" : turn.concernState === "unclear" ? "uncertain" : "none",
      surfaceText: turn.concernState === "unrelated" ? null : message.trim() || null,
      targetConcept: null,
      confidence: turn.concernState === "resolved" || turn.concernState === "improved" ? 0.99 : turn.concernState === "unclear" ? 0.5 : 1,
    },
    requestedTopic: null,
    referencedPet: null,
    safetyRelevance: turn.immediateEmergency ? "direct" : turn.concernState === "unrelated" ? "none" : "possible",
    needsClarification: turn.concernState === "unclear" && hasActiveConcern,
    canAnswerDirectly: Boolean(message.trim()),
  };
}
