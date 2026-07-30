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
    requestedTopic: null,
    referencedPet: null,
    safetyRelevance: turn.immediateEmergency ? "direct" : turn.concernState === "unrelated" ? "none" : "possible",
    needsClarification: turn.concernState === "unclear" && hasActiveConcern,
    canAnswerDirectly: Boolean(message.trim()),
  };
}
