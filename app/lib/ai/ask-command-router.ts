import type { AskOrchestratorResult } from "./ask-orchestrator.ts";


function deterministicResult(title: string, summary: string, intent: "preference" | "question"): AskOrchestratorResult {
  return {
    aiResult: null,
    answer: { title, summary, sections: [], safetyNote: null },
    concern: null,
    handledWithoutAi: true,
    intent,
    safetyLevel: "normal",
    suggestion: null,
  };
}

/** Existing action presentation shared by semantic and legacy callers. */
export function careHistoryCorrectionOrchestration(petName: string) {
  return deterministicResult("Care history", `Review the correction to ${petName}'s latest care-history note below.`, "question");
}
