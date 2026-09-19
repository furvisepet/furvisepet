import type { AskRequestContract } from "../intelligence/ask-request-contract.ts";
import type { AskInterpretation } from "../intelligence/interpret-ask.ts";
import type { FurviseMemoryNeed, FurviseTurnAuthority, FurviseTurnIntent } from "./turn-authority.ts";
import { setFurviseMemoryAuthority } from "./turn-authority.ts";

export type FurviseInterpretationSemantics = {
  operation?: AskInterpretation["operation"] | "navigate";
  /** Validated retrieval bounds; null/null means search may span the lifetime.
   * Omission is a legacy caller with unknown bounds, never proof of coverage. */
  historyWindow?: { from: string | null; to: string | null } | null;
  readPetIds?: readonly string[];
};

function intentForRequest(request: AskRequestContract, semantic: FurviseInterpretationSemantics): FurviseTurnIntent {
  if (request.mode === "clarify" || semantic.operation === "clarify") return "clarify";
  if (semantic.operation === "navigate") return "navigate";
  if (request.mutationIntent === "correct_record") return "correct";
  if (request.task?.intent === "save" || request.task?.intent === "resume") return request.mode === "mixed" ? "question" : "record";
  if (request.mode === "read" || request.mode === "mixed") return "question";
  return "conversation";
}

function memoryNeedForRequest(request: AskRequestContract, semantic: FurviseInterpretationSemantics): FurviseMemoryNeed {
  if (request.evidenceBasis === "saved_history") {
    const window = semantic.historyWindow;
    return window && window.from === null && window.to === null ? "lifetime" : "targeted";
  }
  if (request.evidenceBasis === "saved_profile") return "targeted";
  return "working";
}

/**
 * Convert validated semantic planning into brain-owned cognitive fields.
 * Subject identity and mutation authority remain untouched. The caller supplies
 * the already server-resolved read pet ids; the model never invents database ids.
 */
export function applyAskInterpretation(
  turn: FurviseTurnAuthority,
  request: AskRequestContract,
  input: FurviseInterpretationSemantics = {},
): FurviseTurnAuthority {
  const need = memoryNeedForRequest(request, input);
  const memoryPetIds = need === "none" ? [] : input.readPetIds || turn.subject.petIds;
  const withMemory = setFurviseMemoryAuthority(turn, { need, petIds: memoryPetIds });
  return Object.freeze({
    ...withMemory,
    intent: intentForRequest(request, input),
    referenceTurnIds: Object.freeze([...new Set(request.referenceTurnIds.filter(Boolean))]),
  });
}
