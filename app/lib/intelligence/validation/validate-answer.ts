import type { AskReasoningResult } from "../../ai/ask-reasoning.ts";
import { countAskVisibleProseSanityDefects, measureAskAnswerEconomy, normalizeAskListIntegrity, normalizeAskVisibleProseSanity } from "../../ai/ask-answer-economy.ts";
import { sanitizeInternalProductMetadataFromCareAnswer } from "../../ai/ask-internal-product-policy.ts";
import { neutralizeMalformedPetReferences, normalizePetVisibleAnswer } from "../../ask-safety-context.ts";
import type { FurviseLiveContext, IntelligenceSafetyLevel } from "../types.ts";
import { memoryDisplayContent } from "../memory-integrity.ts";
import { evidenceAnswerPolicy, resolutionStatusAnswer } from "../ask-evidence.ts";
import { sourceNoteAnswer } from "../source-note-recall.ts";
import { episodeAnswer } from "../episode-contract.ts";

export type AnswerValidationResult = {
  response: AskReasoningResult;
  valid: boolean;
  repairs: string[];
  errors: string[];
  qualityWarnings: string[];
};
export function validateGeneratedAnswer(
  result: AskReasoningResult,
  context: FurviseLiveContext,
  canonicalSafety: IntelligenceSafetyLevel,
  authoritativePetIds: readonly string[] = [context.pet.id],
): AnswerValidationResult {
  const repairs: string[] = []; const errors: string[] = []; const qualityWarnings: string[] = [];
  const response = structuredClone(result);
  const sourceNote = response.evidenceContract?.scope.requestKind === "record_lookup" && response.evidenceContract.scope.status === "resolved"
    ? sourceNoteAnswer(response.evidenceContract) : null;
  const urgent = canonicalSafety === "urgent" || canonicalSafety === "emergency";
  const scopedAnswer = response.evidenceContract ? evidenceAnswerPolicy(response.evidenceContract, response.historySynthesis) : null;
  const hasSourceQuote = Boolean(sourceNote?.sourceIds.length && scopedAnswer === sourceNote.text);
  if (scopedAnswer) {
    // Only assistant-authored prose goes through prose rewriting. The complete
    // server-grounded source quotation is composed after that processing.
    const prose = hasSourceQuote ? "This reports a historical note, not a verified current medical status." : scopedAnswer;
    response.answer = { title: "Furvise", summary: `${urgent ? "Contact an emergency veterinarian now. " : ""}${prose}`, sections: [], safetyNote: null };
    response.suggestedFollowUps = [];
    const sourceIds = hasSourceQuote ? sourceNote!.sourceIds : response.evidenceContract?.interpretation
      ? response.evidenceContract.answerSourceIds || [] : [];
    response.relevantContextIds = sourceIds;
    response.referencedRecords = sourceIds.flatMap(id => {
      const span = response.evidenceContract?.represented.find(span => span.sourceId === id);
      return span ? [{ id, sourceType: "care_update" as const, petId: span.petId,
        petName: context.eligiblePets.find(pet => pet.id === span.petId)?.name || context.pet.name,
        kind: "recorded_note", value: span.text, occurredAt: null, createdAt: null, status: null, priority: null,
        metadata: { evidenceField: span.field, start: span.start, end: span.end } }] : [];
    });
    repairs.push("applied_scoped_evidence_policy");
  }
  const contextText = `${context.currentMessage} ${context.careEntries.map((entry) => `${entry.title || ""} ${entry.note}`).join(" ")} ${context.memories.map((memory) => `${memory.fact_key} ${memoryDisplayContent(memory)}`).join(" ")}`;
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
  const productMetadataGuard = sanitizeInternalProductMetadataFromCareAnswer(response.answer);
  response.answer = productMetadataGuard.answer;
  if (productMetadataGuard.removedCount > 0) repairs.push("removed_internal_product_metadata");
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
  const savedPronouns = savedPetPronouns(context);
  const petReference = {
    name: context.pet.name,
    pronouns: savedPronouns.value,
    sex: context.pet.sex,
    species: context.pet.species,
  };
  try {
    const beforeQuality = measureAskAnswerEconomy(response.answer, { petName: context.pet.name });
    response.answer = normalizeAskListIntegrity(response.answer);
    response.answer = savedPronouns.presentWithoutValue
      ? neutralizeMalformedPetReferences(response.answer, petReference)
      : normalizePetVisibleAnswer(response.answer, petReference, { reduceNameOveruse: authoritativePetIds.length === 1 });
    response.answer = neutralizeMalformedPetReferences(response.answer, petReference);
    const proseDefectsBefore = countAskVisibleProseSanityDefects(response.answer);
    response.answer = normalizeAskVisibleProseSanity(response.answer);
    const proseDefectsAfter = countAskVisibleProseSanityDefects(response.answer);
    const visibleQuality = measureAskAnswerEconomy(response.answer, { petName: context.pet.name });
    if (beforeQuality.malformedPersonalizationCount > visibleQuality.malformedPersonalizationCount
      || beforeQuality.petNameContractionCount > visibleQuality.petNameContractionCount) {
      repairs.push("neutralized_malformed_pet_reference");
    }
    if (beforeQuality.bulletIntegrityViolationCount > visibleQuality.bulletIntegrityViolationCount) {
      repairs.push("split_mixed_purpose_bullet");
    }
    if (visibleQuality.malformedPersonalizationCount > 0 || visibleQuality.petNameContractionCount > 0) {
      qualityWarnings.push("personalization_defect_remaining");
    }
    if (visibleQuality.petNameOveruseFlag) qualityWarnings.push("pet_name_overuse_remaining");
    if (visibleQuality.bulletIntegrityViolationCount > 0) qualityWarnings.push("mixed_purpose_bullet_remaining");
    if (proseDefectsBefore > proseDefectsAfter) repairs.push("repaired_visible_prose_syntax");
    if (proseDefectsAfter > 0) qualityWarnings.push("visible_prose_sanity_remaining");
  } catch {
    qualityWarnings.push("quality_normalization_failed");
  }
  const assistantProse = JSON.stringify(response.answer);
  if (hasSourceQuote && sourceNote) {
    response.answer.summary = `${urgent ? "Contact an emergency veterinarian now. " : ""}${sourceNote.text}`;
  }
  const resolution = response.evidenceContract ? resolutionStatusAnswer(response.evidenceContract, response.historySynthesis) : null;
  if (resolution) {
    // Final authority is the provider-independent contract AFTER budgeting.
    response.answer = { title: "Furvise", summary: resolution, sections: [], safetyNote: urgent ? "Contact an emergency veterinarian now." : null };
    response.suggestedFollowUps = [];
    if (!response.evidenceContract?.interpretation) { response.relevantContextIds = []; response.referencedRecords = []; }
    repairs.push("applied_server_resolution_status");
  } else if (context.episodeResult) {
    // Compose after all prose transforms. A model count/list or a prose normalizer
    // cannot change the server's count, displayed ordering or stable identities.
    const authoritative = episodeAnswer(context.episodeResult);
    response.answer = {title:"Furvise",...authoritative,safetyNote:urgent ? "Contact an emergency veterinarian now." : null};
    response.suggestedFollowUps=[];
    response.relevantContextIds=context.episodeResult.items.map(i=>i.sourceId);
    response.referencedRecords=[];
    repairs.push("applied_server_episode_result");
  }
  if (!resolution && !context.episodeResult && scopedAnswer && response.evidenceContract?.interpretation) {
    // Restore complete attributed source text after prose rewriting, retaining
    // the independent safety directive. Never reuse rejected model prose.
    response.answer = { title: "Furvise", summary: scopedAnswer, sections: [], safetyNote: urgent ? "Contact an emergency veterinarian now." : null };
    repairs.push("grounded_history_in_source_reports");
  }
  let answerText = JSON.stringify(response.answer);
  if (response.evidenceContract?.interpretation && scopedAnswer) {
    // A full attributed correction may name the former pet. Check surrounding
    // assistant prose, without treating that source quotation as subject drift.
    for (const content of response.evidenceContract.answerContent || []) {
      answerText = answerText.replace(JSON.stringify(content).slice(1, -1), "");
    }
  }
  const unauthorizedPetNamed = (context.eligiblePets || []).some((pet) => pet.name
    && !authoritativePetIds.includes(pet.id)
    && new RegExp(`\\b${escapeRegex(pet.name)}\\b`, "i").test(answerText));
  if (unauthorizedPetNamed) errors.push("response_subject_disagreement");
  if (!response.answer.summary) errors.push("empty_after_grounding_repair");
  if (/\b(?:I saved|I added|stack trace|requestId|Supabase|context id|internal classifier)\b/i.test(assistantProse)) errors.push("unsafe_content_remaining");
  return {
    response,
    valid: errors.length === 0,
    repairs: [...new Set(repairs)],
    errors,
    qualityWarnings: [...new Set(qualityWarnings)],
  };
}

function savedPetPronouns(context: FurviseLiveContext) {
  const memory = context.memories.find((candidate) => /^(?:pronouns?)$/i.test(candidate.fact_key));
  return {
    value: typeof memory?.fact_value === "string" ? memory.fact_value : null,
    presentWithoutValue: Boolean(memory) && typeof memory?.fact_value !== "string",
  };
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
