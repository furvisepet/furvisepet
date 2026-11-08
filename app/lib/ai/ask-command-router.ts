import type { AskOrchestratorResult } from "./ask-orchestrator.ts";


/** Existing action presentation shared by semantic and legacy callers. */
export function careHistoryCorrectionOrchestration(petName: string) {
  return {
    aiResult: null,
    answer: { title: "Care history", summary: `Review the care-history correction for ${petName} below.`, sections: [], safetyNote: null },
    concern: null,
    handledWithoutAi: true,
    intent: "question",
    safetyLevel: "normal",
    suggestion: null,
  } satisfies AskOrchestratorResult;
}
