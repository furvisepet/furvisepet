import { calculationPublicationFailure, carryCalculationLabs, CALCULATION_LABS, CALCULATION_UNAVAILABLE } from "../calculation-labs.ts";
import type { ResolvedSafetyState } from "../safety-state.ts";
import { storedEmergencyApplies, storedEmergencySafetyFailure, storedEmergencyInputFailure, replaceStoredPublicationWithEmergency, STORED_EMERGENCY_REASON } from "../stored-emergency-publication.ts";
import { dependsOnStoredState, factualLimitationFailure, FACTUAL_UNAVAILABLE, languageOnlyEvidence } from "../factual-dispatch.ts";
import { isStoredRead, storedReadPublicationFailure, storedReadPublishedResult, carryStoredReadEvidence } from "../stored-read-publication.ts";
import { unsupportedProfilePresentation, profilePresentationLimitationFailure, PROFILE_PRESENTATION_UNAVAILABLE } from "../profile-presentation-limitation.ts";
import { carryProfileFieldProjection } from "../profile-field-authority.ts";
import { profileFieldLabsReviewFailure, carryProfileFieldLabs } from "../profile-field-labs.ts";
import { labsListReviewFailure, carryLabsListSnapshot, labsTaskComplete } from "../labs-list.ts";
import { requiresHistoryPublicationAuthority } from "../publication-authority.ts";
import { historyLabsAuthorityFailure, historyLimitationFailure } from "../ordinary-history-publication.ts";
import { recordHistoryReview, historyReviewSignature } from "../history-review-state.ts";
import { rememberReviewedTaskPresentation } from "../ask-evidence-presentation.ts";
import {
  recoveryUpdateTitle,
  mapAskProse,
  askProseOnly,
} from "../../furvise-output.ts";
import type { ObligationCompletion } from "../history-obligations.ts";
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
  resolvedSafety?: ResolvedSafetyState,
): AnswerValidationResult {
  const repairs: string[] = []; const errors: string[] = []; const qualityWarnings: string[] = [];
  const urgent = canonicalSafety === "urgent" || canonicalSafety === "emergency";
  const currentSafetyText = dependsOnStoredState(result.evidenceContract) ? "" : safetyTemporalScope(context.currentMessage).currentText;
  const currentEmergency = dependsOnStoredState(result.evidenceContract) ? resolvedSafety?.currentMessageEmergency === true : urgent && Boolean(detectAskConcernTags(currentSafetyText).length || detectImmediateAskEmergency(currentSafetyText));
  const reviewedHistory = currentEmergency ? null : readReviewedHistoryAnswer(result);
  const response = structuredClone(result);
  if (storedEmergencyApplies(result.evidenceContract, resolvedSafety)) {
    const failure = storedEmergencySafetyFailure(resolvedSafety) || storedEmergencyInputFailure(result, context, authoritativePetIds);
    if (!failure) replaceStoredPublicationWithEmergency(response, resolvedSafety!);
    const errors = failure ? [failure] : [];
    const assessment = createAnswerAssessment({ body: response.answer, evidence: response.evidenceContract,
      unsafe: !!failure, reasons: [...errors, STORED_EMERGENCY_REASON],
      checks: { structuralValidity: failure ? "failed" : "passed", evidenceSupport: failure ? "failed" : "passed",
        subjectDateCorrectness: failure ? "failed" : "passed", calculationCorrectness: "not_applicable", taskCompletion: "failed" } });
    return { response, assessment, valid: !failure, errors, repairs: failure ? [] : ["preserved_current_emergency_priority"], qualityWarnings: [] };
  }
  if(result.evidenceContract?.interpretation?.request?.calculatePlan || [CALCULATION_LABS,CALCULATION_UNAVAILABLE].includes(result.model)){
    const failure=calculationPublicationFailure(result);
    const scopeFailure=result.evidenceContract?.scope.authorizedPetIds.some(id=>!authoritativePetIds.includes(id));
    const errors=[...(failure?[failure]:[]),...(scopeFailure?["calculation_scope"]:[]),...(!reviewedHistory?["calculation_review_required"]:[])];
    if(!errors.length&&reviewedHistory){
      carryCalculationLabs(result,response);
      response.evidenceContract!.answerSourceIds=[...reviewedHistory.sourceIds];response.evidenceContract!.answerContent=[];
      recordHistoryReview(response,{...reviewedHistory,signature:historyReviewSignature(response)});
      rememberReviewedTaskPresentation(response.evidenceContract,response.answer,[]);
    }
    const complete=result.model===CALCULATION_LABS&&!errors.length;
    const assessment=createAnswerAssessment({body:response.answer,evidence:response.evidenceContract,unsafe:!!errors.length,
      reasons:[...errors,...(complete?[]:["calculation_unavailable"])],checks:{structuralValidity:errors.length?"failed":"passed",
      evidenceSupport:errors.length?"failed":"passed",subjectDateCorrectness:errors.length?"failed":"passed",
      calculationCorrectness:complete?"passed":"not_applicable",taskCompletion:complete?"passed":"failed"}});
    return {response,assessment,valid:!errors.length,repairs:[],errors,qualityWarnings:[]};
  }
  if(result.model===FACTUAL_UNAVAILABLE){
    const failure=factualLimitationFailure(result);
    const scopeFailure=result.evidenceContract?.scope.authorizedPetIds.some(id=>!authoritativePetIds.includes(id));
    const errors=[...(failure?[failure]:[]),...(scopeFailure?["factual_limitation_scope"]:[]),...(!reviewedHistory?["factual_limitation_review_required"]:[])];
    if(!errors.length && reviewedHistory){
      recordHistoryReview(response,{...reviewedHistory,signature:historyReviewSignature(response)});
      rememberReviewedTaskPresentation(response.evidenceContract,response.answer,[]);
    }
    const assessment=createAnswerAssessment({body:response.answer,evidence:response.evidenceContract,unsafe:!!errors.length,
      reasons:[...errors,"stored_publication_unsupported"],checks:{structuralValidity:errors.length?"failed":"passed",
      evidenceSupport:errors.length?"failed":"passed",subjectDateCorrectness:errors.length?"failed":"passed",
      calculationCorrectness:"not_applicable",taskCompletion:"failed"}});
    return {response,assessment,valid:!errors.length,repairs:[],errors,qualityWarnings:[]};
  }
  if(isStoredRead(result.evidenceContract)) {
    const failure=storedReadPublicationFailure(result);
    const scopeFailure=result.evidenceContract!.interpretation!.request!.storedRead!.ownerId!==context.owner.userId
      || result.evidenceContract!.scope.authorizedPetIds.some(id=>!authoritativePetIds.includes(id));
    const errors=[...(failure?[failure]:[]),...(scopeFailure?["stored_read_scope_changed"]:[]),...(!reviewedHistory?["stored_read_review_required"]:[])];
    const complete=!!storedReadPublishedResult(result.evidenceContract);
    if(!errors.length && reviewedHistory){carryStoredReadEvidence(result.evidenceContract!,response.evidenceContract!);
      response.evidenceContract!.answerSourceIds=[...reviewedHistory.sourceIds];
      recordHistoryReview(response,{...reviewedHistory,signature:historyReviewSignature(response)});
      rememberReviewedTaskPresentation(response.evidenceContract,response.answer,[]);}
    const assessment=createAnswerAssessment({body:response.answer,evidence:response.evidenceContract,unsafe:!!errors.length,
      reasons:[...errors,...(complete?[]:["stored_read_limited"])],checks:{structuralValidity:errors.length?"failed":"passed",
      evidenceSupport:errors.length?"failed":"passed",subjectDateCorrectness:errors.length?"failed":"passed",calculationCorrectness:"not_applicable",
      taskCompletion:complete&&!errors.length?"passed":"failed"}});
    return {response,assessment,valid:!errors.length,repairs:[],errors,qualityWarnings:[]};
  }
  if (unsupportedProfilePresentation(result.evidenceContract) || result.model === PROFILE_PRESENTATION_UNAVAILABLE) {
    const failure = profilePresentationLimitationFailure(result);
    const scopeFailure = result.evidenceContract?.scope.authorizedPetIds.some(id => !authoritativePetIds.includes(id));
    const errors = [...(failure ? [failure] : []), ...(scopeFailure ? ["profile_presentation_subject_scope"] : []),
      ...(!reviewedHistory ? ["profile_presentation_review_required"] : [])];
    if (!errors.length && reviewedHistory) {
      carryProfileFieldProjection(result.evidenceContract!, response.evidenceContract!);
      response.evidenceContract!.answerSourceIds = [];
      response.evidenceContract!.answerContent = [];
      recordHistoryReview(response, { ...reviewedHistory, signature: historyReviewSignature(response) });
      rememberReviewedTaskPresentation(response.evidenceContract, response.answer, []);
    }
    const assessment = createAnswerAssessment({ body: response.answer, evidence: response.evidenceContract,
      unsafe: !!errors.length, reasons: [...errors, "profile_presentation_unsupported"],
      checks: { structuralValidity: errors.length ? "failed" : "passed", evidenceSupport: errors.length ? "failed" : "passed",
        subjectDateCorrectness: errors.length ? "failed" : "passed", calculationCorrectness: "not_applicable",
        taskCompletion: "failed" } });
    return { response, assessment, valid: !errors.length, repairs: [], errors, qualityWarnings: [] };
  }
  if (requiresHistoryPublicationAuthority(result.evidenceContract)) {
    // An ordinary history answer never enters the factual fallback/repair code below.
    const failure = result.labsList ? historyLabsAuthorityFailure(result) : historyLimitationFailure(result);
    const scopeFailure = result.evidenceContract!.scope.authorizedPetIds.some(id => !authoritativePetIds.includes(id));
    const errors = [...(failure ? [failure] : []), ...(scopeFailure ? ["history_publication_subject_scope"] : []),
      ...(!reviewedHistory ? ["history_publication_review_required"] : [])];
    const complete = !!result.labsList && labsTaskComplete(result.labsList);
    if (!errors.length && reviewedHistory) {
      if (result.labsList) carryLabsListSnapshot(result, response);
      response.evidenceContract!.answerSourceIds = [...reviewedHistory.sourceIds];
      response.evidenceContract!.answerContent = [...(reviewedHistory.sourceContent || [])];
      recordHistoryReview(response, { ...reviewedHistory, signature: historyReviewSignature(response) });
      rememberReviewedTaskPresentation(response.evidenceContract, response.answer, []);
    }
    const assessment = createAnswerAssessment({ body: response.answer, evidence: response.evidenceContract,
      unsafe: !!errors.length, reasons: [...errors, ...(complete ? [] : ["history_publication_limited"])],
      checks: { structuralValidity: errors.length ? "failed" : "passed", evidenceSupport: errors.length ? "failed" : "passed",
        subjectDateCorrectness: errors.length ? "failed" : "passed", calculationCorrectness: "not_applicable",
        taskCompletion: complete && !errors.length ? "passed" : "failed" } });
    return { response, assessment, valid: !errors.length, repairs: [], errors, qualityWarnings: [] };
  }
  if (result.profileFieldLabs && !currentEmergency) {
    const failure = !reviewedHistory ? "profile_labs_review_required" : profileFieldLabsReviewFailure(result);
    const scopeFailure = result.profileFieldLabs.projection.subjectIds.some(id => !authoritativePetIds.includes(id));
    const errors = [...(failure ? [failure] : []), ...(scopeFailure ? ["profile_labs_subject_scope"] : [])];
    const complete = result.profileFieldLabs.projection.fields.every(f => f.state !== "unavailable");
    if (!errors.length && reviewedHistory) {
      carryProfileFieldLabs(result, response);
      response.evidenceContract!.answerSourceIds = [...reviewedHistory.sourceIds];
      response.evidenceContract!.answerContent = [...(reviewedHistory.sourceContent || [])];
      recordHistoryReview(response, { ...reviewedHistory, signature: historyReviewSignature(response) });
      rememberReviewedTaskPresentation(response.evidenceContract, response.answer, []);
    }
    const assessment = createAnswerAssessment({ body: response.answer, evidence: response.evidenceContract || null,
      unsafe: !!errors.length, reasons: [...errors, ...(complete ? [] : ["profile_field_unavailable"])],
      checks: { structuralValidity: errors.length ? "failed" : "passed", evidenceSupport: errors.length ? "failed" : "passed",
        subjectDateCorrectness: errors.length ? "failed" : "passed", calculationCorrectness: "not_applicable",
        taskCompletion: complete && !errors.length ? "passed" : "failed" } });
    return { response, assessment, valid: !errors.length, repairs: [], errors, qualityWarnings: [] };
  }
  if (result.labsList && !currentEmergency) {
    const failure = !reviewedHistory ? readHistoryReviewDiagnostic(result)?.reason || "labs_list_review_required" : labsListReviewFailure(result);
    const scopeFailure = result.labsList.ticket.subjects.petIds.some(id => !authoritativePetIds.includes(id));
    const errors = [...(failure ? [failure] : []), ...(scopeFailure ? ["labs_list_subject_scope"] : [])];
    const complete = labsTaskComplete(result.labsList);
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
  if(dependsOnStoredState(result.evidenceContract)){
    const errors=["canonical_factual_publication_required"];
    const assessment=createAnswerAssessment({body:response.answer,evidence:response.evidenceContract,unsafe:true,reasons:errors,
      checks:{structuralValidity:"passed",evidenceSupport:"failed",subjectDateCorrectness:"failed",calculationCorrectness:"not_applicable",taskCompletion:"failed"}});
    return {response,assessment,valid:false,repairs:[],errors,qualityWarnings:[]};
  }
  if (result.historyNarrative || result.historicalResult || result.historySynthesis?.length
    || result.relevantContextIds.length || result.referencedRecords?.length || reviewedHistory?.sourceIds.length) {
    const errors = ["language_answer_contains_stored_authority"];
    return {response,valid:false,repairs:[],errors,qualityWarnings:[],
      assessment:createAnswerAssessment({body:response.answer,evidence:response.evidenceContract,unsafe:true,reasons:errors,
        checks:{structuralValidity:"passed",evidenceSupport:"failed",subjectDateCorrectness:"failed",calculationCorrectness:"not_applicable",taskCompletion:"failed"}})};
  }
  if(response.evidenceContract)response.evidenceContract=languageOnlyEvidence(response.evidenceContract);
  const conversationOnly = result.evidenceContract?.interpretation?.conversationOnly === true;
  const preserveFormat = Boolean(result.evidenceContract?.interpretation?.request?.outputFormat);
  if (currentEmergency && (response.evidenceContract || context.episodeResult)) {
    response.answer = buildImmediateEmergencyGuidance(detectImmediateAskEmergency(currentSafetyText) || { tags: [] });
    response.suggestedFollowUps = [];
    repairs.push("preserved_current_emergency_priority");
  }
  const contextText = context.currentMessage;
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
  // Stored publication terminated above. This path contains general language only.
  const immutableHistory = false;
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
  if (conversationOnly) {
    // Remove optional offers before approving the canonical body. The final
    // integrity gate still rejects lost facts, uncertainty and mutation claims.
    response.answer.summary = stripOptionalAssistantOffers(response.answer.summary) || "I could not produce a substantive answer to that request. Please rephrase it.";
    response.answer.sections = response.answer.sections.map(section => ({ ...section,
      items: section.items.map(stripOptionalAssistantOffers).filter(Boolean) })).filter(section => section.items.length);
    if (response.answer.safetyNote) response.answer.safetyNote = stripOptionalAssistantOffers(response.answer.safetyNote) || null;
  }
  const assistantProse = askProseOnly([response.answer.title, response.answer.summary, ...response.answer.sections.flatMap(s => [s.heading, ...s.items]), response.answer.safetyNote || ""].join("\n"));
  let answerText = JSON.stringify(response.answer);
  const unauthorizedPetNamed = !conversationOnly && (context.eligiblePets || []).some(pet => {
    if (!pet.name || authoritativePetIds.includes(pet.id)) return false;
    return new RegExp("\\b" + escapeRegex(pet.name) + "\\b", "i").test(answerText);
  });
  if (unauthorizedPetNamed) errors.push("response_subject_disagreement");
  if (!response.answer.summary) errors.push("empty_after_grounding_repair");
  preserveFictionalDialogueQuotes(assistantProse, prose => {
    if (/\b(?:I saved|I added|stack trace|requestId|Supabase|context id|internal classifier)\b/i.test(prose)) errors.push("unsafe_content_remaining");
    return prose;
  });
  const assessment = createAnswerAssessment({
    body: response.answer, evidence: response.evidenceContract || null, unsafe: errors.length > 0, reasons: errors,
    checks: { structuralValidity: response.answer.summary ? "passed" : "failed",
      evidenceSupport: conversationOnly ? "not_applicable" : "not_evaluated",
      subjectDateCorrectness: unauthorizedPetNamed ? "failed" : conversationOnly ? "not_applicable" : "not_evaluated",
      calculationCorrectness: "not_evaluated", taskCompletion: "not_evaluated" },
  });
  return {response, assessment, valid: !errors.length && assessment.outcome !== "failed",
    repairs: [...new Set(repairs)], errors, qualityWarnings: [...new Set(qualityWarnings)] };
}

function savedPetPronouns(context: FurviseLiveContext) {
  const memory = context.memories.find((candidate) => /^(?:pronouns?)$/i.test(candidate.fact_key));
  return {
    value: typeof memory?.fact_value === "string" ? memory.fact_value : null,
    presentWithoutValue: Boolean(memory) && typeof memory?.fact_value !== "string",
  };
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
