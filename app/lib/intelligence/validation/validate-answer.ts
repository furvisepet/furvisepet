import type { AskReasoningResult } from "../../ai/ask-reasoning.ts";
import type { FurviseLiveContext, IntelligenceSafetyLevel } from "../types.ts";

export type AnswerValidationResult = { response: AskReasoningResult; valid: boolean; repairs: string[]; errors: string[] };
export function validateGeneratedAnswer(
  result: AskReasoningResult,
  context: FurviseLiveContext,
  canonicalSafety: IntelligenceSafetyLevel,
  authoritativePetIds: readonly string[] = [context.pet.id],
): AnswerValidationResult {
  const repairs: string[] = []; const errors: string[] = [];
  const response = structuredClone(result);
  const knownPronouns = context.memories.some((memory) => /^(?:sex|gender|pronouns?)$/i.test(memory.fact_key));
  const contextText = `${context.currentMessage} ${context.careEntries.map((entry) => `${entry.title || ""} ${entry.note}`).join(" ")} ${context.memories.map((memory) => `${memory.fact_key} ${JSON.stringify(memory.fact_value)}`).join(" ")}`;
  const unrelatedResolved = context.currentState?.state.breathing?.status === "normal" && !/breath|breathing/i.test(context.currentMessage);
  const sanitize = (source: string) => {
    let text = source;
    const replace = (pattern: RegExp, value: string, repair: string) => {
      const next = text.replace(pattern, value);
      if (next !== text) { text = next; repairs.push(repair); }
    };
    replace(/\bI(?:'ve| have)? (?:saved|added|recorded|updated|marked)[^.]*\.?/gi, "", "removed_false_persistence_claim");
    replace(/\b(?:RPC|database error|stack trace|requestId|Supabase|context id|internal classifier)\b[^.]*\.?/gi, "", "removed_internal_diagnostic");
    replace(/\u2014/g, "-", "removed_em_dash");
    if (!knownPronouns) {
      replace(/\b(?:she|he)\b/gi, context.pet.name, "neutralized_pronoun");
      replace(/\b(?:her|his)\b/gi, `${context.pet.name}'s`, "neutralized_pronoun");
    }
    if (/\b(?:has|is|was) (?:diagnosed with|suffering from)\b/i.test(text) && !/diagnos/i.test(contextText)) {
      replace(/[^.]*\b(?:diagnosed with|suffering from)\b[^.]*\.?/gi, "", "removed_unsupported_diagnosis");
    }
    if (unrelatedResolved && /groom|brush|coat|fur|bath|nail/i.test(context.currentMessage) && /breath|breathing/i.test(text)) {
      replace(/[^.]*\bbreath(?:ing)?\b[^.]*\.?/gi, "", "removed_irrelevant_resolved_warning");
    }
    return text.replace(/\s+/g, " ").trim();
  };
  response.answer.title = sanitize(response.answer.title);
  response.answer.summary = sanitize(response.answer.summary);
  response.answer.sections = response.answer.sections.map((section) => ({
    heading: sanitize(section.heading),
    items: section.items.map(sanitize).filter(Boolean),
  })).filter((section) => section.heading && section.items.length > 0);
  if (response.answer.safetyNote) response.answer.safetyNote = sanitize(response.answer.safetyNote) || null;
  if (canonicalSafety === "urgent" || canonicalSafety === "emergency") { response.safetyLevel = "urgent"; response.shoppingSuppressed = true; }
  else if (canonicalSafety === "recently_resolved") {
    const reconcile = (value: string) => {
      const next = value.replace(/^Contact an emergency veterinarian now\.\s*/i, "").trim();
      if (next !== value) repairs.push("removed_stale_emergency_directive");
      return next;
    };
    response.answer.summary = reconcile(response.answer.summary);
    response.answer.sections = response.answer.sections.map((section) => ({
      ...section,
      items: section.items.map(reconcile).filter(Boolean),
    })).filter((section) => section.items.length > 0);
    if (/^Urgent guidance for\b/i.test(response.answer.title)) response.answer.title = `It sounds like ${context.pet.name} is improving`;
    response.safetyLevel = "monitor";
    response.shoppingSuppressed = false;
    response.intelligenceSafety.level = "recently_resolved";
    response.intelligenceSafety.requiresImmediateAction = false;
    response.intelligenceSafety.shoppingSuppressed = false;
    if (response.responseMode === "urgent_safety") response.responseMode = "practical_guidance";
  }
  else if (response.safetyLevel === "urgent" && canonicalSafety === "routine") { response.safetyLevel = "normal"; repairs.push("aligned_safety_to_current_state"); }
  const answerText = JSON.stringify(response.answer);
  const unauthorizedPetNamed = (context.eligiblePets || []).some((pet) => pet.name
    && !authoritativePetIds.includes(pet.id)
    && new RegExp(`\\b${escapeRegex(pet.name)}\\b`, "i").test(answerText));
  if (unauthorizedPetNamed) errors.push("response_subject_disagreement");
  if (!response.answer.summary) errors.push("empty_after_grounding_repair");
  if (/\b(?:I saved|I added|stack trace|requestId|Supabase|context id|internal classifier)\b/i.test(answerText)) errors.push("unsafe_content_remaining");
  return { response, valid: errors.length === 0, repairs: [...new Set(repairs)], errors };
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
