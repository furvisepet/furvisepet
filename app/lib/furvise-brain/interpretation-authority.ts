import type { AskRequestContract } from "../intelligence/ask-request-contract.ts";
import type { FurviseMemoryNeed, FurviseTurnAuthority, FurviseTurnIntent } from "./turn-authority.ts";

function intentForRequest(request: AskRequestContract): FurviseTurnIntent {
  if (request.mode === "clarify" || request.operation === "clarify") return "clarify";
  if (request.operation === "navigate") return "navigate";
  if (request.mutationIntent === "correct_record") return "correct";
  if (request.task?.intent === "save" || request.task?.intent === "resume") return request.mode === "mixed" ? "question" : "record";
  if (request.mode === "read" || request.mode === "mixed") return "question";
  return "conversation";
}

function memoryNeedForRequest(request: AskRequestContract): FurviseMemoryNeed {
  if (request.evidenceBasis === "saved_history") {
    const unbounded = request.from == null && request.to == null;
    const lifetimeLanguage = /\b(?:ever|lifetime|entire\s+(?:life|history)|all\s+(?:history|records?))\b/i.test(request.question);
    return unbounded && lifetimeLanguage ? "lifetime" : "targeted";
  }
  if (request.evidenceBasis === "saved_profile") return "targeted";
  return "working";
}

/**
 * Convert the validated semantic request into brain-owned cognitive fields.
 *
 * Deliberately preserves subject and mutation authority. The interpretation
 * organ can describe intent, memory depth and references, but cannot decide who
 * is authoritative or open a write capability.
 */
export function applyAskInterpretation(
  turn: FurviseTurnAuthority,
  request: AskRequestContract,
): FurviseTurnAuthority {
  return Object.freeze({
    ...turn,
    intent: intentForRequest(request),
    memoryNeed: memoryNeedForRequest(request),
    referenceTurnIds: Object.freeze([...new Set(request.referenceTurnIds.filter(Boolean))]),
  });
}
