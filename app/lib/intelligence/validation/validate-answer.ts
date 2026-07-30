import type { AskReasoningResult } from "../../ai/ask-reasoning.ts";
import type { FurviseLiveContext, IntelligenceSafetyLevel } from "../types.ts";

export type AnswerValidationResult = { response: AskReasoningResult; valid: boolean; repairs: string[]; errors: string[] };
export function validateGeneratedAnswer(result: AskReasoningResult, context: FurviseLiveContext, canonicalSafety: IntelligenceSafetyLevel): AnswerValidationResult {
  const repairs: string[] = []; const errors: string[] = [];
  const response = structuredClone(result);
  let text = response.answer.summary;
  const replace = (pattern: RegExp, value: string, repair: string) => { const next = text.replace(pattern, value); if (next !== text) { text = next; repairs.push(repair); } };
  replace(/\bI(?:'ve| have)? (?:saved|added|recorded|updated|marked)[^.]*\.?/gi, "", "removed_false_persistence_claim");
  replace(/\b(?:RPC|database error|stack trace|requestId|Supabase)\b[^.]*\.?/gi, "", "removed_internal_diagnostic");
  replace(/\u2014/g, "-", "removed_em_dash");
  const knownPronouns = context.memories.some((memory) => /^(?:sex|gender|pronouns?)$/i.test(memory.fact_key));
  if (!knownPronouns) {
    replace(/\b(?:she|he)\b/gi, context.pet.name, "neutralized_pronoun");
    replace(/\b(?:her|his)\b/gi, `${context.pet.name}'s`, "neutralized_pronoun");
  }
  const contextText = `${context.currentMessage} ${context.careEntries.map((entry) => `${entry.title || ""} ${entry.note}`).join(" ")} ${context.memories.map((memory) => `${memory.fact_key} ${JSON.stringify(memory.fact_value)}`).join(" ")}`;
  if (/\b(?:has|is|was) (?:diagnosed with|suffering from)\b/i.test(text) && !/diagnos/i.test(contextText)) {
    replace(/[^.]*\b(?:diagnosed with|suffering from)\b[^.]*\.?/gi, "", "removed_unsupported_diagnosis");
  }
  const unrelatedResolved = context.currentState?.state.breathing?.status === "normal" && !/breath|breathing/i.test(context.currentMessage);
  if (unrelatedResolved && /groom|brush|coat|fur|bath|nail/i.test(context.currentMessage) && /breath|breathing/i.test(text))
    replace(/[^.]*\bbreath(?:ing)?\b[^.]*\.?/gi, "", "removed_irrelevant_resolved_warning");
  response.answer.summary = text.replace(/\s+/g, " ").trim();
  if (canonicalSafety === "urgent" || canonicalSafety === "emergency") { response.safetyLevel = "urgent"; response.shoppingSuppressed = true; }
  else if (response.safetyLevel === "urgent" && canonicalSafety === "routine") { response.safetyLevel = "normal"; repairs.push("aligned_safety_to_current_state"); }
  if (!response.answer.summary) errors.push("empty_after_grounding_repair");
  if (/\b(?:I saved|I added|stack trace|requestId)\b/i.test(response.answer.summary)) errors.push("unsafe_content_remaining");
  return { response, valid: errors.length === 0, repairs: [...new Set(repairs)], errors };
}
