import { labsListReviewFailure, carryLabsListSnapshot } from "../labs-list.ts";
import { readPartialHistoryReview } from "../history-review-state.ts";
import { historyCompletionLimits, UNVERIFIED_EVENT_LIMITATION } from "../evidence-need-coverage.ts";
import { recordHistoryReview, historyReviewSignature } from "../history-review-state.ts";
import { rememberReviewedTaskPresentation } from "../ask-evidence-presentation.ts";
import {
  historyFallbackPresentation,
  recoveryUpdateTitle,
  mapAskProse,
  askProseOnly,
  preserveReviewedLayout,
} from "../../furvise-output.ts";
import { buildHistoryObligations, historyTaskCompleted, type ObligationCompletion } from "../history-obligations.ts";
import { createAnswerAssessment, type AnswerAssessment } from "../answer-assessment.ts";
import { readHistoryReviewDiagnostic } from "../history-review-state.ts";
import { preserveFictionalDialogueQuotes, stripOptionalAssistantOffers } from "../../application-actions/state-claims.ts";
import { safetyTemporalScope } from "../../ai/safety-temporal-scope.ts";
import { buildImmediateEmergencyGuidance, detectAskConcernTags, detectImmediateAskEmergency } from "../../ask-safety-context.ts";
import { readReviewedHistoryAnswer } from "../history-review-state.ts";
import type { AskReasoningResult } from "../../ai/ask-reasoning.ts";
import { countAskVisibleProseSanityDefects, measureAskAnswerEconomy, normalizeAskListIntegrity, normalizeAskVisibleProseSanity } from "../../ai/ask-answer-economy.ts";
import { sanitizeInternalProductMetadataFromCareAnswer } from "../../ai/ask-internal-product-policy.ts";
import { neutralizeMalformedPetReferences, normalizePetVisibleAnswer } from "../../ask-safety-context.ts";
import type { FurviseLiveContext, IntelligenceSafetyLevel } from "../types.ts";
import { memoryDisplayContent } from "../memory-integrity.ts";
import { attributedHistoryAnswer, evidenceAnswerPolicy, resolutionStatusAnswer, eligibleAnswerSources } from "../ask-evidence.ts";
import { sourceNoteAnswer } from "../source-note-recall.ts";
import { episodeAnswer } from "../episode-contract.ts";
import { verifiedCalculationQuantities } from "../history-calculation.ts";
import { matchesHistoryOutputFormat } from "../historical-read-response.ts";

export type AnswerValidationResult = {
  response: AskReasoningResult;
  valid: boolean;
  repairs: string[];
  errors: string[];
  qualityWarnings: string[];
  completion?: ObligationCompletion[];
  /** valid means safe to deliver; assessment establishes completeness. */
  assessment: AnswerAssessment;
};
export function validateGeneratedAnswer(
  result: AskReasoningResult,
  context: FurviseLiveContext,
  canonicalSafety: IntelligenceSafetyLevel,
  authoritativePetIds: readonly string[] = [context.pet.id],
): AnswerValidationResult {
  const repairs: string[] = []; const errors: string[] = []; const qualityWarnings: string[] = [];
  const urgent = canonicalSafety === "urgent" || canonicalSafety === "emergency";
  const currentSafetyText = safetyTemporalScope(context.currentMessage).currentText;
  const currentEmergency = urgent && Boolean(detectAskConcernTags(currentSafetyText).length || detectImmediateAskEmergency(currentSafetyText));
  const reviewedHistory = currentEmergency ? null : readReviewedHistoryAnswer(result);
  const partialHistory = currentEmergency || reviewedHistory ? null : readPartialHistoryReview(result);
  const partialText = partialHistory ? partialHistory.text : null;
  const response = structuredClone(result);
  if (result.labsList && !currentEmergency) {
    const failure = !reviewedHistory ? "labs_list_review_required" : labsListReviewFailure(result);
    const scopeFailure = result.labsList.ticket.subjects.petIds.some(id => !authoritativePetIds.includes(id));
    const errors = [...(failure ? [failure] : []), ...(scopeFailure ? ["labs_list_subject_scope"] : [])];
    const complete = ["complete", "complete_empty"].includes(result.labsList.coverage.status);
    if (!errors.length && reviewedHistory) {
      carryLabsListSnapshot(result, response);
      if (response.evidenceContract) {
        response.evidenceContract.answerSourceIds = [...reviewedHistory.sourceIds];
        response.evidenceContract.answerContent = [...(reviewedHistory.sourceContent || [])];
      }
      recordHistoryReview(response, { ...reviewedHistory, signature: historyReviewSignature(response) });
      rememberReviewedTaskPresentation(response.evidenceContract, response.answer, []);
    }
    const assessment = createAnswerAssessment({ body: response.answer, evidence: response.evidenceContract || null,
      unsafe: !!errors.length, reasons: [...errors, ...(complete ? [] : ["labs_coverage_" + result.labsList.coverage.status])],
      checks: { structuralValidity: errors.length ? "failed" : "passed", evidenceSupport: errors.length ? "failed" : "passed",
        subjectDateCorrectness: errors.length ? "failed" : "passed", calculationCorrectness: "not_applicable",
        taskCompletion: complete && !errors.length ? "passed" : "failed" } });
    return { response, assessment, valid: !errors.length, repairs: [], errors, qualityWarnings: [] };
  }
  const conversationOnly = result.evidenceContract?.interpretation?.conversationOnly === true;
  const preserveFormat = Boolean(result.evidenceContract?.interpretation?.request?.outputFormat);
  const projectionText = result.model === "server-read-projection" && result.historyNarrative
    ? result.historyNarrative.sentences.map(sentence => sentence.text).join("\n") : null;
  const projectionSources = response.evidenceContract ? eligibleAnswerSources(response.evidenceContract) : [];
  const projectionSourceIds = projectionText && result.historyNarrative
    ? [...new Set(result.historyNarrative.sentences.flatMap(sentence => sentence.sourceIds))] : [];
  const projectionSourcesValid = Boolean(projectionText && response.evidenceContract?.scope.readOnlyRecall
    && projectionSourceIds.length
    && projectionSourceIds.every(id => {
      const spans = projectionSources.filter(source => source.sourceId === id);
      return spans.length > 0 && spans.every(source => authoritativePetIds.includes(source.petId));
    }));
  const projectionCalculationsValid = Boolean(projectionText && result.historyNarrative
    && result.historyNarrative.sentences.every(sentence =>
      verifiedCalculationQuantities(sentence.calculations || [], projectionSources) !== null));
  const projectionFormatValid = Boolean(projectionText
    && matchesHistoryOutputFormat(projectionText, response.evidenceContract?.interpretation?.request?.outputFormat));
  const trustedServerProjection = Boolean(projectionText
    && result.model === "server-read-projection"
    && response.answer.summary === projectionText
    && response.answer.sections.length === 0
    && !response.answer.safetyNote
    && projectionSourcesValid
    && projectionCalculationsValid
    && projectionFormatValid
    && !historyCompletionLimits(response.evidenceContract).length);
  if (trustedServerProjection && response.evidenceContract) {
    response.evidenceContract.answerSourceIds = projectionSourceIds;
    response.evidenceContract.answerContent = [];
  }
  if (currentEmergency && (response.evidenceContract || context.episodeResult)) {
    response.answer = buildImmediateEmergencyGuidance(detectImmediateAskEmergency(currentSafetyText) || { tags: [] });
    response.suggestedFollowUps = [];
    repairs.push("preserved_current_emergency_priority");
  }
  if (reviewedHistory && response.evidenceContract) {
    response.evidenceContract.answerSourceIds = reviewedHistory.sourceIds;
    response.evidenceContract.answerContent = reviewedHistory.sourceContent || [];
  }
  if (partialHistory && response.evidenceContract) {
    response.evidenceContract.answerSourceIds = [...partialHistory.sourceIds];
    response.evidenceContract.answerContent = [];
  }
  const sourceNote = response.evidenceContract?.scope.requestKind === "record_lookup" && response.evidenceContract.scope.status === "resolved"
    ? sourceNoteAnswer(response.evidenceContract) : null;
  const scopedAnswer = currentEmergency ? null : trustedServerProjection ? projectionText
    : (reviewedHistory?.proseText || reviewedHistory?.text) || partialText || (response.evidenceContract ? evidenceAnswerPolicy(response.evidenceContract, response.historySynthesis) : null);
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
  const sanitize = (source: string) => mapAskProse(source, outer => preserveFictionalDialogueQuotes(outer, prose => {
    let text = prose;
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
    return text.replace(/[^\S\r\n]+/g, " ").trim();
  }));
  // A review receipt binds the complete wording to evidence. Style rewriting
  // must not remove clauses, alter quotations or damage structured values.
  // Unsafe content in a reviewed answer is rejected, never silently edited.
  const immutableHistory = Boolean((reviewedHistory || partialHistory || trustedServerProjection) && result.evidenceContract?.interpretation?.request);
  if (!immutableHistory) {
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
  }
  if (conversationOnly && repairs.includes("removed_false_persistence_claim")) {
    // Read-only scope has no action receipt. Replace a rejected claim with a
    // coherent truthful boundary, never a fragment left by regex deletion.
    response.answer = { title: "Furvise", summary: "I haven’t performed that action. No requested action was completed.", sections: [], safetyNote: response.answer.safetyNote };
    repairs.push("replaced_unverified_action_claim");
  }
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
    if (/^Urgent guidance for\b/i.test(response.answer.title)) response.answer.title = recoveryUpdateTitle(context.pet.name);
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
    if (!immutableHistory && !conversationOnly && !preserveFormat) {
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
  }
  } catch {
    qualityWarnings.push("quality_normalization_failed");
  }
  if (reviewedHistory) {
    const reviewedText = `${urgent ? "Contact an emergency veterinarian now. " : ""}${reviewedHistory.proseText || reviewedHistory.text}`;
    response.answer.summary = preserveReviewedLayout(reviewedText, response.answer.summary);
  }
  if (conversationOnly) {
    // Remove optional offers before approving the canonical body. The final
    // integrity gate still rejects lost facts, uncertainty and mutation claims.
    response.answer.summary = stripOptionalAssistantOffers(response.answer.summary) || "I could not produce a substantive answer to that request. Please rephrase it.";
    response.answer.sections = response.answer.sections.map(section => ({ ...section,
      items: section.items.map(stripOptionalAssistantOffers).filter(Boolean) })).filter(section => section.items.length);
    if (response.answer.safetyNote) response.answer.safetyNote = stripOptionalAssistantOffers(response.answer.safetyNote) || null;
  }
  const assistantProse = askProseOnly([response.answer.title, response.answer.summary, ...response.answer.sections.flatMap(s => [s.heading, ...s.items]), response.answer.safetyNote || ""].join("\n"));
  if (hasSourceQuote && sourceNote) {
    response.answer.summary = `${urgent ? "Contact an emergency veterinarian now. " : ""}${sourceNote.text}`;
  }
  const resolution = !currentEmergency && !reviewedHistory && response.evidenceContract && !response.evidenceContract.interpretation?.request ? resolutionStatusAnswer(response.evidenceContract, response.historySynthesis) : null;
  if (resolution) {
    // Final authority is the provider-independent contract AFTER budgeting.
    response.answer = { title: "Furvise", summary: resolution, sections: [], safetyNote: urgent ? "Contact an emergency veterinarian now." : null };
    response.suggestedFollowUps = [];
    if (!response.evidenceContract?.interpretation) { response.relevantContextIds = []; response.referencedRecords = []; }
    repairs.push("applied_server_resolution_status");
  } else if (!currentEmergency && !reviewedHistory && context.episodeResult) {
    // Compose after all prose transforms. A model count/list or a prose normalizer
    // cannot change the server's count, displayed ordering or stable identities.
    const authoritative = episodeAnswer(context.episodeResult);
    response.answer = {title:"Furvise",...authoritative,safetyNote:urgent ? "Contact an emergency veterinarian now." : null};
    response.suggestedFollowUps=[];
    response.relevantContextIds=context.episodeResult.items.map(i=>i.sourceId);
    response.referencedRecords=[];
    repairs.push("applied_server_episode_result");
  }
  if (!trustedServerProjection && !reviewedHistory && !resolution && !context.episodeResult && scopedAnswer && response.evidenceContract?.interpretation) {
    // Restore complete attributed source text after prose rewriting, retaining
    // the independent safety directive. Never reuse rejected model prose.
    response.answer = { title: "Furvise", ...(partialText ? { summary: partialText, sections: [] } : historyFallbackPresentation(response.evidenceContract, scopedAnswer)), safetyNote: urgent ? "Contact an emergency veterinarian now." : null };
    repairs.push("grounded_history_in_source_reports");
  }
  if (reviewedHistory?.sourceReports?.length) {
    // Server-attributed source reports are composed after all prose transforms.
    // The unforgeable review receipt binds them to unchanged scoped evidence.
    response.answer.summary = [response.answer.summary, ...reviewedHistory.sourceReports].join("\n\n");
    repairs.push("preserved_review_source_supplements");
  }
  // If prose cleanup removed every substantive reviewed sentence, use the
  // existing source-attributed fallback, never rejected model text.
  if (!currentEmergency && reviewedHistory && response.evidenceContract?.history
    && /^This covers the matching saved notes I could verify, not necessarily every event in their life[.!]?$/i.test(response.answer.summary.trim())
    && !response.answer.sections.length) {
    response.answer.summary = attributedHistoryAnswer(response.evidenceContract);
    response.relevantContextIds = [...(response.evidenceContract.answerSourceIds || [])];
    response.referencedRecords = response.referencedRecords.filter(record => response.relevantContextIds.includes(record.id));
    repairs.push("replaced_disclaimer_only_history_with_sources");
  }
  if (!currentEmergency && historyCompletionLimits(response.evidenceContract).includes("requested_transition_not_retrieved")) {
    // A positive review cannot turn topic-only observations into evidence of
    // an event. Describe this answer's verification limit, never semantic
    // absence from the pet's entire history. This also removes dangling partial
    // references to a rejected event claim, without another provider call.
    response.answer = { title: "Furvise", summary: UNVERIFIED_EVENT_LIMITATION,
      sections: [], safetyNote: urgent ? "Contact an emergency veterinarian now." : null };
    response.suggestedFollowUps = [];
    response.relevantContextIds = [];
    response.referencedRecords = [];
    response.applicationActions = [];
    repairs.push("withheld_unverified_event_interpretation");
  }
  let answerText = JSON.stringify(response.answer);
  if (response.evidenceContract?.interpretation && scopedAnswer) {
    // A full attributed correction may name the former pet. Check surrounding
    // assistant prose, without treating that source quotation as subject drift.
    for (const content of response.evidenceContract.answerContent || []) {
      answerText = answerText.replace(JSON.stringify(content).slice(1, -1), "");
    }
  }
  const eligibleReviewedSources = response.evidenceContract ? eligibleAnswerSources(response.evidenceContract) : [];
  const reviewedSources = reviewedHistory?.sourceIds.map(id =>
    eligibleReviewedSources.filter(span => span.sourceId === id)) || [];
  const scopedReview = reviewedSources.length > 0 && reviewedSources.every(spans => spans.length > 0
    && spans.every(span => authoritativePetIds.includes(span.petId)));
  const unauthorizedPetNamed = !conversationOnly && (context.eligiblePets || []).some((pet) => {
    if (!pet.name || authoritativePetIds.includes(pet.id)) return false;
    const named = new RegExp(`\\b${escapeRegex(pet.name)}\\b`, "i");
    let unchecked = answerText;
    // A reviewed note may mention another animal without reading that animal's
    // records. Exempt only immutable reviewed prose, backed by cited sources
    // belonging to the authorized subject. Other generated prose stays checked.
    if (scopedReview && reviewedSources.some(spans => spans.some(span => span.sourceType === "care_update" && named.test(span.text)))) {
      const prose = reviewedHistory?.proseText || reviewedHistory?.text;
      if (prose) unchecked = unchecked.replace(JSON.stringify(prose).slice(1, -1), "");
    }
    return named.test(unchecked);
  });
  if (unauthorizedPetNamed) errors.push("response_subject_disagreement");
  if (!response.answer.summary) errors.push("empty_after_grounding_repair");
  preserveFictionalDialogueQuotes(assistantProse, prose => {
    if (/\b(?:I saved|I added|stack trace|requestId|Supabase|context id|internal classifier)\b/i.test(prose)) errors.push("unsafe_content_remaining");
    return prose;
  });
  const finalReviewMatches = Boolean(reviewedHistory && response.answer.summary === (reviewedHistory.proseText || reviewedHistory.text)
    && response.answer.sections.length === 0 && !response.answer.safetyNote && !reviewedHistory.sourceReports?.length);
  const finalGroundingMatches = finalReviewMatches || trustedServerProjection;
  if (finalReviewMatches && reviewedHistory?.actions) rememberReviewedTaskPresentation(response.evidenceContract, response.answer, reviewedHistory.actions);
  if (finalReviewMatches && reviewedHistory) recordHistoryReview(response, { ...reviewedHistory, signature: historyReviewSignature(response) });
  const obligationChecks = finalReviewMatches ? reviewedHistory?.completion : undefined;
  const historyTask = Boolean(response.evidenceContract?.interpretation?.request && response.evidenceContract.history && !currentEmergency);
  const fallbackUsed = historyTask && repairs.includes("grounded_history_in_source_reports") && !finalGroundingMatches;
  const diagnostic = trustedServerProjection ? null : readHistoryReviewDiagnostic(result);
  const assessment = createAnswerAssessment({
    body: response.answer, evidence: response.evidenceContract || null, unsafe: errors.length > 0,
    reasons: [...errors, ...historyCompletionLimits(response.evidenceContract), ...(diagnostic ? [diagnostic.reason] : []),
      ...(fallbackUsed ? [partialHistory ? "independent_parts_do_not_certify_task_completion" : "source_fallback_does_not_certify_task_completion"] : []),
      ...(reviewedHistory && !finalReviewMatches ? ["reviewed_body_changed"] : [])],
    checks: {
      structuralValidity: response.answer.summary ? "passed" : "failed",
      evidenceSupport: finalGroundingMatches ? "passed" : conversationOnly ? "not_applicable" : "not_evaluated",
      subjectDateCorrectness: unauthorizedPetNamed ? "failed" : finalGroundingMatches ? "passed" : conversationOnly ? "not_applicable" : "not_evaluated",
      calculationCorrectness: finalGroundingMatches ? "passed" : "not_evaluated",
      taskCompletion: historyCompletionLimits(response.evidenceContract).length ? "failed" : trustedServerProjection ? "passed"
        : obligationChecks?.length ? historyTaskCompleted(obligationChecks) ? "passed" : "failed"
        : fallbackUsed ? "failed" : "not_evaluated",
    },
  });
  const completion = obligationChecks || (fallbackUsed && response.evidenceContract
    ? buildHistoryObligations(response.evidenceContract).map(o => ({ index: o.index, ...(o.petId ? {petId:o.petId} : {}),
      status: "missing" as const, sentenceIndexes: [], sourceIds: [] })) : undefined);
  return {
    response, assessment,
    ...(completion ? {completion: structuredClone(completion)} : {}),
    valid: errors.length === 0 && assessment.outcome !== "failed",
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
