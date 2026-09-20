import type { AskRequestContract } from "../intelligence/ask-request-contract.ts";
import type { FurviseMemoryNeed, FurviseTurnAuthority, FurviseTurnIntent } from "./turn-authority.ts";
import { setFurviseMemoryAuthority } from "./turn-authority.ts";

type SemanticRequestEnvelope = AskRequestContract & {
  operation?: "recall" | "overview" | "comparison" | "status" | "count" | "episode" | "general" | "navigate" | "clarify";
  from?: string | null;
  to?: string | null;
};

function intentForRequest(request: AskRequestContract): FurviseTurnIntent {
  const semantic = request as SemanticRequestEnvelope;
  if (request.mode === "clarify" || semantic.operation === "clarify") return "clarify";
  if (semantic.operation === "navigate") return "navigate";
  if (request.mutationIntent === "correct_record") return "correct";
  if (request.task?.intent === "save" || request.task?.intent === "resume") return request.mode === "mixed" ? "question" : "record";
  if (request.mode === "read" || request.mode === "mixed") return "question";
  return "conversation";
}

function memoryNeedForRequest(request: AskRequestContract): FurviseMemoryNeed {
  if (request.readTicket?.episode && request.mode === "clarify") return "none";
  if (request.evidenceBasis === "saved_history") {
    const ticket = request.readTicket;
    return ticket && ticket.temporal.from === null && ticket.temporal.to === null
      && ticket.outputs.completeness === "exhaustive" ? "lifetime" : "targeted";
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
  input: { readPetIds?: readonly string[] } = {},
): FurviseTurnAuthority {
  const need = memoryNeedForRequest(request);
  const memoryPetIds = need === "none" ? [] : input.readPetIds || turn.subject.petIds;
  const withMemory = setFurviseMemoryAuthority(turn, { need, petIds: memoryPetIds });
  return Object.freeze({
    ...withMemory,
    intent: intentForRequest(request),
    referenceTurnIds: Object.freeze([...new Set(request.referenceTurnIds.filter(Boolean))]),
  });
}
