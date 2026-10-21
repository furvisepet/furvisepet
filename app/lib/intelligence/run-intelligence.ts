import type { RecordedCalculationContext } from "../furvise-brain/muscle.ts";
import { readHistoryReviewAudit, type HistoryReviewAudit } from "./history-review-state.ts";
import { enforceAskHistoryAccess } from "./history-access.ts";
import { safetyTemporalScope } from "../ai/safety-temporal-scope.ts";
import { scopeConversationContext } from "./conversation-scope.ts";
import { finalizeAskAnswer } from "./finalize-ask-answer.ts";
import { withoutLegacyConcernTransitions, buildGovernedAskExecutionPlan, assertGovernedAskExecutionPlan, type GovernedAskExecutionPlan } from "./ask-execution-plan.ts";
import "server-only";

import type { AskProviderEvent, AskReasoningResult } from "../ai/ask-reasoning";
import { generateContextAwareAskResponse } from "../ai/ask-reasoning";
import { isAiMemoryExtractionEnabled } from "../ai/usage-guard/config.ts";
import { buildRecentAskUpdates } from "../ask-safety-context";
import { classifyMessageDeterministically } from "./classify-message";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "./memory-policy";
import { allowsAcceptedRecoverySafetyReconciliation, allowsProposedRecoveryPresentation, applySafetyFloor, resolveSafetyState } from "./safety-state";
import type { FurviseLiveContext } from "./types";
import { calculateMemoryFreshness } from "./memory-freshness.ts";
import { authorizeProposedActions, type GovernanceResult } from "./governance/index.ts";
import type { AnswerValidationResult } from "./validation/index.ts";
import { routePersistenceDestinations } from "./persistence-destination.ts";
import { governCanonicalEvents, governCanonicalEventsForOwnedPets, learningFromSemanticEvent } from "./semantic-events.ts";
import { buildShadowSemanticAnalysis, logSemanticTrace, type SemanticTrace } from "./semantic-observability.ts";
import type { GovernedConceptIdentity, GovernedSemanticTurn } from "./v2/types.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";
import { governSemanticTurnV2 } from "./v2/governance/govern-turn.ts";
import { projectGovernedPreferencesToLegacyMemories } from "./v2/projections/legacy-memory.ts";
import { memoryDisplayContent } from "./memory-integrity.ts";
import { normalizeKnownPreferenceMemory, preferenceSemanticIdentity } from "./preference-semantics.ts";
import { buildExplicitCareHistoryAction, isExplicitCareHistorySaveRequest, omitGovernedCareSaveDuplicates, prepareGovernedCareHistoryAction } from "./care-history-policy.ts";
import { resolvePetLossContext } from "../ai/pet-loss.ts";
import { isRecoveryGroundedForConcern } from "../ai/concern-engine.ts";
import { createAskEvidenceContract, type AskEvidenceContract } from "./ask-evidence.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import { explicitOwnerNote } from "./explicit-owner-note.ts";

export type FurviseIntelligenceResult = {
  executionPlan: GovernedAskExecutionPlan;
  reasoning: AskReasoningResult;
  deterministicUnderstanding: ReturnType<typeof classifyMessageDeterministically>;
  safety: ReturnType<typeof resolveSafetyState>;
  acceptedLearnings: AskReasoningResult["learnings"];
  rejectedLearningCount: number;
  acceptedCareActions: AskReasoningResult["careActions"];
  acceptedSemanticEvents: ReturnType<typeof governCanonicalEvents>["accepted"];
  rejectedCareActionCount: number;
  governance: GovernanceResult;
  answerValidation: Omit<AnswerValidationResult, "response"> & { historyReviewAudit?: HistoryReviewAudit[] };
  semanticTrace: SemanticTrace;
  v2GovernedTurn: GovernedSemanticTurn;
};

export async function runFurviseIntelligence({
  context,
  requestId,
  sourceMessageId,
  onProviderEvent,
  subjectConfidence = 1,
  canonicalConcepts = [],
  authoritativePetIds = [context.pet.id],
  authoritativeSemanticFrame,
  discourseFocus,
  evidenceContract,
  recordedCalculation,
}: {
  context: FurviseLiveContext;
  requestId: string;
  sourceMessageId: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  subjectConfidence?: number;
  canonicalConcepts?: GovernedConceptIdentity[];
  authoritativePetIds?: string[];
  authoritativeSemanticFrame?: ProposedSemanticFrame;
  discourseFocus?: import("./entities/resolve-turn-subject.ts").AskDiscourseFocus;
  evidenceContract?: AskEvidenceContract;
  recordedCalculation?: RecordedCalculationContext;
}): Promise<FurviseIntelligenceResult> {
  if (context.askInterpretation?.request?.stateTransitionJob) throw Error("STATE_TRANSITION_REQUIRES_CAPABILITY");
  if (context.askInterpretation?.request?.appendJob) throw Error("APPEND_REQUIRES_CONFIRMATION_CAPABILITY");
  let readPetIds = context.askInterpretation?.readPetIds || authoritativePetIds;
  if (context.historyAccess) {
    context = enforceAskHistoryAccess(context);
    evidenceContract = createAskEvidenceContract(context, readPetIds);
  }
  if (context.askInterpretation?.conversationOnly) {
    context = scopeConversationContext(context);
    authoritativePetIds = [];
    readPetIds = [];
    authoritativeSemanticFrame = undefined;
    evidenceContract = createAskEvidenceContract(context, []);
  }
  const separateDialogue = Boolean(context.askHistory || context.askInterpretation?.conversationOnly);
  const safety = resolveSafetyState(context);
  const deterministicUnderstanding = classifyMessageDeterministically(context.currentMessage, context.activeConcerns.length > 0);
  const reasoning = await generateContextAwareAskResponse({
    recordedCalculation,
    evidenceContract: evidenceContract || createAskEvidenceContract(context, readPetIds),
    careEntries: context.askHistory?.entries || context.selectedCareEntries,
    concerns: context.activeConcerns,
    dialogueContext: separateDialogue ? context.conversationTurns.filter(turn => turn.id !== sourceMessageId).map(turn => ({ id: turn.id, role: turn.role, text: turn.text, createdAt: turn.createdAt })) : undefined,
    conversationTurns: separateDialogue ? [] : context.conversationTurns.filter((turn) => turn.id !== sourceMessageId).map((turn) => ({
      id: turn.id, role: turn.role, text: turn.text, createdAt: turn.createdAt, applicationActions: turn.applicationActions,
    })),
    locale: context.locale,
    timeZone: context.timeZone,
    memories: context.askHistory ? [] : [
      ...context.legacyPetMemories,
      ...ownerProfileMemories(context),
      ...currentStateMemories(context),
      ...context.memories.map((memory) => ({
        id: memory.id, user_id: memory.user_id, dog_profile_id: memory.pet_id || context.pet.id,
        type: `${memory.subject_type}:${memory.category}`, text: memoryText(memory), confidence: String(memory.confidence),
        source: memory.source_type, created_at: memory.created_at,
      })),
    ],
    productFeedback: context.productFeedback,
    profiles: context.eligiblePets.filter((pet) => readPetIds.includes(pet.id)),
    question: context.currentMessage,
    recentUpdates: context.askHistory ? [] : buildRecentAskUpdates(context.selectedCareEntries),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns,
    activeEpisodes: context.askHistory ? [] : [...context.activeEpisodes, ...context.monitoringEpisodes],
    recentlyResolvedEpisodes: context.askHistory ? [] : context.recentlyResolvedEpisodes,
    requestId,
    concernStateHint: safety.concernMessageState,
    onProviderEvent,
    semanticFrameRecovery: {
      ownerIdentityVerified: Boolean(context.owner.userId),
      canonicalConcepts,
    },
    discourseFocus,
  });
  // Recall remains read-only even when model classifications propose writes.
  // Mixed owner observations and explicit saves are not question-only recall.
  let readOnlyRecall = Boolean(context.ownerNoteAlreadySaved || context.askInterpretation?.readOnly || reasoning.evidenceContract?.scope.readOnlyRecall);
  const suppressPersistence = () => {
    reasoning.learnings = [];
    reasoning.careActions = [];
    reasoning.semanticEvents = [];
    reasoning.applicationActions = reasoning.applicationActions.filter(action => action.kind.startsWith("navigation.") || ["pet.read", "memory.list", "care_history.query"].includes(action.kind));
    reasoning.proposedHistoryUpdate = { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null };
    reasoning.semanticFrame = emptyProposedSemanticFrame();
    authoritativeSemanticFrame = undefined;
    reasoning.messageUnderstanding = { ...reasoning.messageUnderstanding, primaryIntent: "question", secondaryIntents: [], userIsAskingQuestion: true,
      userIsProvidingUpdate: false, userIsResolvingConcern: false, userIsCorrectingPriorInformation: false,
      userIsProvidingPreference: false, userIsMakingSmallTalk: false,
      recoveryStatus: "none", recoveryConfidence: 1,
      recoveryEvidence: { outcome: "none", surfaceText: null, targetConcept: null, confidence: 1 } };
  };
  if (readOnlyRecall) suppressPersistence();
  const ownerNote = !readOnlyRecall && authoritativePetIds.length === 1
    && authoritativePetIds[0] === context.pet.id
    && context.eligiblePets.some(pet => pet.id === context.pet.id && pet.user_id === context.owner.userId)
    && ["update", "mixed"].includes(context.askInterpretation?.request?.mode || "")
    ? explicitOwnerNote({ message: context.currentMessage, pet: context.pet, pets: context.eligiblePets, timeZone: context.timeZone }) : null;
  if (ownerNote) {
    // A note-only instruction authorizes one verbatim record. Optional model
    // interpretations cannot add diagnoses, resolve episodes or veto the note.
    suppressPersistence();
    reasoning.semanticEvents = [ownerNote];
  }
  // A record edit is a distinct operation from an observed care transition.
  // Remove only the duplicated correction proposal when the typed edit channel
  // is present; the action still needs an owned binding and confirmation.
  if (!readOnlyRecall && context.askInterpretation?.request?.mutationIntent === "correct_record"
    && reasoning.applicationActions.some(action => action.kind === "care_history.edit" && action.input.target === "specified")) {
    reasoning.semanticEvents = reasoning.semanticEvents.filter(event => event.transition !== "corrected");
  }
  const lossContext = context.askInterpretation?.conversationOnly ? "none" : resolvePetLossContext({
    message: context.currentMessage,
    recentConversation: context.conversationTurns.filter((turn) => turn.id !== sourceMessageId),
    lifecycleStatus: context.pet.lifecycle_status,
    petName: context.pet.name,
  });
  const multiPetTurn = authoritativePetIds.length > 1;
  const hasOwnedPetSubject = authoritativePetIds.length > 0;
  const semanticGovernanceInput = {
    activeConcerns: context.activeConcerns,
    proposals: reasoning.semanticEvents,
    message: context.currentMessage,
    activeEpisodes: [...context.activeEpisodes, ...context.monitoringEpisodes],
    recoveryAssessment: {
      status: reasoning.messageUnderstanding.recoveryStatus,
      confidence: reasoning.messageUnderstanding.recoveryConfidence,
      evidence: reasoning.messageUnderstanding.recoveryEvidence,
    },
    allowTerminalResolution: allowsAcceptedRecoverySafetyReconciliation(safety),
    subjectConfidence,
  };
  const semanticGovernance = !hasOwnedPetSubject
    ? governCanonicalEvents({ ...semanticGovernanceInput, resolvedPetSubject: undefined })
    : multiPetTurn
    ? governCanonicalEventsForOwnedPets({
      ...semanticGovernanceInput,
      pets: context.eligiblePets.filter((pet) => authoritativePetIds.includes(pet.id)),
    })
    : governCanonicalEvents({
      ...semanticGovernanceInput,
      resolvedPetSubject: { id: context.pet.id, name: context.pet.name },
    });

  if (reasoning.semanticEvents.length && semanticGovernance.rejected.length) console.info("[Ask semantic governance] rejected", {
    requestId, proposalCount: reasoning.semanticEvents.length, acceptedCount: semanticGovernance.accepted.length,
    rejections: semanticGovernance.rejected.map(item => ({ reason: item.reason, transition: item.proposal.transition,
      state: item.proposal.state, confidence: item.proposal.confidence })),
    recoveryReasons: semanticGovernance.recoveryAssessments.flatMap(item => item.reasons),
    activeEpisodeCount: semanticGovernanceInput.activeEpisodes.length,
    resolutionSafetyAllowed: semanticGovernanceInput.allowTerminalResolution,
  });

  if (semanticGovernance.rejected.length) {
    // Optional extraction cannot veto an independently reviewed answer. Drop
    // ALL persistence channels, including legacy fallbacks and the V2 frame.
    // Explicit writes and identity/episode integrity failures still fail closed.
    const optionalObservation = context.askInterpretation?.request?.mode === "mixed"
      && !context.askInterpretation.request.mutationIntent
      && !isExplicitCareHistorySaveRequest(context.currentMessage)
      && semanticGovernance.rejected.every(item => ["low_confidence", "not_save_worthy", "invalid_transition"].includes(item.reason));
    if (!optionalObservation) throw Object.assign(
      new Error("FURVISE_SEMANTIC_WRITE_REJECTED"), { code: "ASK_SEMANTIC_WRITE_REJECTED" });
    readOnlyRecall = true;
    suppressPersistence();
    semanticGovernance.accepted = [];
    console.info("[Ask semantic governance] optional persistence suppressed", { requestId });
  }

  const proposedResolutionPolicy = evaluateCareActionPolicy({
    actions: hasOwnedPetSubject ? reasoning.careActions : [],
    currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding,
    safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
    activeConcerns: context.activeConcerns,
    petId: context.pet.id,
    petName: context.pet.name,
  });
  const modelRecoveryPresentation = allowsAcceptedRecoverySafetyReconciliation(safety)
    && safety.concernMessageState === "resolved"
    && reasoning.intelligenceSafety.level === "recently_resolved"
    && !["worsening", "recurrence", "still_active"].includes(safety.concernMessageState)
    && proposedResolutionPolicy.accepted.some((action) => action.action === "resolve_concern");
  const semanticGroundedResolution = allowsAcceptedRecoverySafetyReconciliation(safety)
    && semanticGovernance.accepted.some(({ event }) =>
      event.transition === "resolved" && event.state === "resolved" && Boolean(event.references.episodeId));
  const proposedRecoveryConcern = context.activeConcerns.find((concern) => concern.id === reasoning.proposedHistoryUpdate.resolvesConcernId) || null;
  const hasSourceGroundedRecovery = hasOwnedPetSubject && context.activeConcerns.some((concern) => isRecoveryGroundedForConcern({
    activeConcerns: context.activeConcerns, concern, message: context.currentMessage,
    petId: context.pet.id, petName: context.pet.name,
  }));
  if (reasoning.intelligenceSafety.level === "recently_resolved" && !hasSourceGroundedRecovery && !semanticGroundedResolution) {
    reasoning.intelligenceSafety.level = safety.level;
  }
  const proposedRecoveryPresentation = hasOwnedPetSubject && Boolean(proposedRecoveryConcern && isRecoveryGroundedForConcern({
    activeConcerns: context.activeConcerns,
    concern: proposedRecoveryConcern,
    message: context.currentMessage,
    petId: context.pet.id,
    petName: context.pet.name,
  })) && allowsProposedRecoveryPresentation({
    activeConcernIds: safety.activeConcernIds,
    confidence: reasoning.intelligenceMetadata.confidence,
    resolvesConcernId: reasoning.proposedHistoryUpdate.resolvesConcernId,
    safety,
    shouldOffer: reasoning.proposedHistoryUpdate.shouldOffer,
    userIsResolvingConcern: reasoning.messageUnderstanding.userIsResolvingConcern,
  });
  if (safetyTemporalScope(context.currentMessage).hasNonCurrentContext && safety.level === "routine"
    && !reasoning.intelligenceSafety.requiresImmediateAction) reasoning.intelligenceSafety.level = "routine";
  reasoning.intelligenceSafety.level = lossContext === "confirmed_current" || lossContext === "continuation"
    ? "routine"
    : modelRecoveryPresentation || semanticGroundedResolution
      ? "recently_resolved"
      : applySafetyFloor(reasoning.intelligenceSafety.level, safety);
  if (lossContext === "confirmed_current" || lossContext === "continuation") {
    reasoning.responseMode = "grief_support";
    reasoning.suggestedFollowUps = [];
    reasoning.shoppingSuppressed = true;
    reasoning.intelligenceSafety.requiresImmediateAction = false;
    reasoning.intelligenceSafety.shoppingSuppressed = true;
  }
  if (safety.shoppingSuppressed) {
    reasoning.shoppingSuppressed = true;
    reasoning.intelligenceSafety.shoppingSuppressed = true;
  }
  if (reasoning.intelligenceSafety.level === "emergency" || reasoning.intelligenceSafety.level === "urgent") reasoning.safetyLevel = "urgent";
  else if (reasoning.intelligenceSafety.level === "monitor" || reasoning.intelligenceSafety.level === "recently_resolved") reasoning.safetyLevel = "monitor";
  else reasoning.safetyLevel = "normal";

  const memoryExtractionEnabled = isAiMemoryExtractionEnabled();
  const learningPolicy = memoryExtractionEnabled
    ? evaluateLearningPolicy(reasoning.learnings, context.currentMessage, authoritativePetIds)
    : { accepted: [], rejected: reasoning.learnings.map((learning) => ({ learning, reason: "global_memory_extraction_disabled" })) };
  const carePolicy = modelRecoveryPresentation ? proposedResolutionPolicy : evaluateCareActionPolicy({
    actions: reasoning.careActions, currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding, safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
    activeConcerns: context.activeConcerns, petId: context.pet.id, petName: context.pet.name,
  });
  // Recovery classification is presentation/safety only. Canonical transitions use capabilities.
  const proposedCareActions = !hasOwnedPetSubject || multiPetTurn ? []
    : withoutLegacyConcernTransitions({ careActions: carePolicy.accepted, semanticEvents: [] }).careActions;
  const governance = authorizeProposedActions({
    message: context.currentMessage, petId: context.pet.id, authorizedPetIds: authoritativePetIds,
    careActions: proposedCareActions, memories: learningPolicy.accepted,
  });
  const governedCareActions = governance.careActions
    .filter((decision) => decision.decision === "accepted")
    .map((decision) => prepareGovernedCareHistoryAction({
      action: decision.proposal,
      petName: context.pet.name,
      sourceMessage: context.currentMessage,
    }));
  const explicitCareHistoryAction = readOnlyRecall || !hasOwnedPetSubject || multiPetTurn ? null : buildExplicitCareHistoryAction({
    currentMessage: context.currentMessage,
    conversationTurns: context.conversationTurns.filter((turn) => turn.id !== sourceMessageId),
    pet: context.pet,
  });
  const governedLearnings = governance.memories.filter((decision) => decision.decision === "accepted").map((decision) => decision.proposal);
  const semanticLearnings = semanticGovernance.accepted.map(learningFromSemanticEvent).filter((item): item is NonNullable<typeof item> => Boolean(item));
  let governedV2Turn: GovernedSemanticTurn | null = null;
  try {
    governedV2Turn = governSemanticTurnV2({
      frame: authoritativeSemanticFrame || reasoning.semanticFrame,
      sourceMessage: context.currentMessage,
      sourceMessageId,
      ownerId: context.owner.userId,
      pets: context.eligiblePets.filter((pet) => authoritativePetIds.includes(pet.id)),
      conversationTurns: context.conversationTurns.filter((turn) => turn.id !== sourceMessageId),
      activeEpisodes: [...context.activeEpisodes, ...context.monitoringEpisodes],
      canonicalConcepts,
      safetyFloor: {
        level: reasoning.safetyLevel === "normal" ? "routine" : reasoning.safetyLevel === "monitor" ? "caution" : "urgent",
        reasonCodes: reasoning.safetyLevel === "normal" ? [] : ["current_turn_safety"],
      },
    });
  } catch {
    // V2 reconciliation is fail-open; legacy generation and governance remain authoritative.
  }
  const projectedPreferences = governedV2Turn ? projectGovernedPreferencesToLegacyMemories(governedV2Turn) : [];
  const routedPersistence = routePersistenceDestinations({
    message: context.currentMessage,
    petId: context.pet.id,
    authorizedPetIds: authoritativePetIds,
    careActions: governedCareActions,
    learnings: dedupeLearnings([...governedLearnings, ...semanticLearnings]),
  });
  // Lifecycle plans prepare confirmed capabilities outside factual generation.
  // Raw loss wording cannot fabricate a history event here.
  const acceptedCareActions = readOnlyRecall || !hasOwnedPetSubject ? []
    : explicitCareHistoryAction ? [explicitCareHistoryAction] : routedPersistence.careActions;
  const acceptedSemanticEvents = readOnlyRecall || !hasOwnedPetSubject ? []
    : withoutLegacyConcernTransitions({ careActions: [], semanticEvents: semanticGovernance.accepted }).semanticEvents;
  const projectedPreferenceIdentities = new Set(projectedPreferences.map(learningPreferenceIdentity).filter(Boolean));
  const acceptedLearnings = readOnlyRecall || !hasOwnedPetSubject ? [] : dedupeLearnings([
    ...routedPersistence.learnings.filter((item) =>
      !(multiPetTurn && isPreferenceLearning(item))
      && (!projectedPreferenceIdentities.has(learningPreferenceIdentity(item)) || !isPreferenceLearning(item))),
    ...projectedPreferences,
  ]);
  if (hasOwnedPetSubject && authoritativePetIds.length === 1) reasoning.applicationActions = omitGovernedCareSaveDuplicates({
    actions: reasoning.applicationActions, events: acceptedSemanticEvents, message: context.currentMessage, petId: authoritativePetIds[0],
  });
  let executionPlan = buildGovernedAskExecutionPlan({ sourceMessageId, petId: context.pet.id,
    careActions: acceptedCareActions, semanticEvents: acceptedSemanticEvents, learnings: acceptedLearnings });
  // Presentation-only reconciliation happens after persistence governance and routing.
  if (proposedRecoveryPresentation) reasoning.intelligenceSafety.level = "recently_resolved";
  const { validation: answerValidation, suppressWrites: failedAnswer } = await finalizeAskAnswer({
    recordedCalculation,
    reasoning, safety, context, requestId, onProviderEvent, executionPlan,
    authoritativePetIds: readPetIds.length ? readPetIds : [context.pet.id],
  });
  if (failedAnswer) {
    acceptedCareActions.length = 0;
    acceptedSemanticEvents.length = 0;
    acceptedLearnings.length = 0;
    governedV2Turn = null;
    executionPlan = buildGovernedAskExecutionPlan({ sourceMessageId, petId: context.pet.id,
      careActions: [], semanticEvents: [], learnings: [] });
  }
  assertGovernedAskExecutionPlan(executionPlan);
  if (failedAnswer) suppressPersistence();
  const shadow = buildShadowSemanticAnalysis({
    activeEpisodes: [...context.activeEpisodes, ...context.monitoringEpisodes],
    acceptedCareActions,
    acceptedLearnings,
    acceptedSemanticEvents,
    conversationTurns: context.conversationTurns.filter((turn) => turn.id !== sourceMessageId),
    eligiblePets: context.eligiblePets,
    frame: reasoning.semanticFrame,
    message: context.currentMessage,
    ownerId: context.owner.userId,
    reasoning,
    requestId,
    recoveryAssessments: semanticGovernance.recoveryAssessments,
    selectedPetId: context.pet.id,
    sourceMessageId,
    canonicalConcepts,
    safetyFloor: {
      level: safety.level === "urgent" || safety.level === "emergency" ? "urgent"
        : safety.level === "monitor" ? "caution" : "routine",
      reasonCodes: safety.activeConcernIds.length ? ["active_concern"] : [],
    },
    authoritativePetIds,
    ...(governedV2Turn ? { governedV2Turn } : {}),
  });
  logSemanticTrace(shadow.trace);
  return {
    executionPlan,
    reasoning,
    deterministicUnderstanding,
    safety,
    acceptedLearnings,
    rejectedLearningCount: learningPolicy.rejected.length,
    acceptedCareActions,
    acceptedSemanticEvents,
    rejectedCareActionCount: carePolicy.rejected.length,
    governance,
    answerValidation: {
      ...(readHistoryReviewAudit(reasoning).length ? { historyReviewAudit: readHistoryReviewAudit(reasoning) } : {}),
      valid: answerValidation.valid,
      assessment: answerValidation.assessment,
      repairs: answerValidation.repairs,
      errors: answerValidation.errors,
      qualityWarnings: answerValidation.qualityWarnings,
      ...(answerValidation.completion ? { completion: answerValidation.completion } : {}),
    },
    semanticTrace: shadow.trace,
    v2GovernedTurn: shadow.v2Turn,
  };
}

function dedupeLearnings<T extends { subjectType: string; subjectId: string | null; factKey: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = `${item.subjectType}:${item.subjectId || ""}:${item.factKey}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function isPreferenceLearning(learning: AskReasoningResult["learnings"][number]) {
  return /prefer|shopping|food/i.test(`${learning.category} ${learning.factKey}`);
}

function learningPreferenceIdentity(learning: AskReasoningResult["learnings"][number]) {
  const semantic = normalizeKnownPreferenceMemory({
    subjectType: learning.subjectType, subjectId: learning.subjectId, factKey: learning.factKey,
    factValue: learning.factValue, canonicalConceptKey: learning.canonicalConceptKey,
  });
  return semantic ? preferenceSemanticIdentity(semantic) : "";
}

function currentStateMemories(context: FurviseLiveContext) {
  if (!context.currentState) return [];
  return [{
    id: `pet-current-state-${context.currentState.state_version}`,
    user_id: context.owner.userId,
    dog_profile_id: context.pet.id,
    type: "canonical:current_state",
    text: `Current pet state: ${JSON.stringify(context.currentState.state)}. Supported by care events: ${context.currentState.source_event_ids.join(", ")}.`,
    confidence: "1",
    source: "pet_current_state",
    created_at: context.currentState.computed_at,
  }];
}

function memoryText(memory: FurviseLiveContext["memories"][number]) {
  const value = memoryDisplayContent(memory);
  const freshness = calculateMemoryFreshness(memory, new Date());
  const qualifier = freshness.needsConfirmation ? " This may be outdated; confirm it only if relevant to the current question." : "";
  return `${memory.fact_key}: ${value}. Freshness: ${freshness.freshnessStatus}; effective confidence: ${freshness.effectiveConfidence.toFixed(2)}.${qualifier}`;
}

function ownerProfileMemories(context: FurviseLiveContext) {
  const country = context.owner.profile?.country;
  if (!country) return [];
  return [{
    id: `owner-profile-country-${country}`,
    user_id: context.owner.userId,
    dog_profile_id: context.pet.id,
    type: "owner:country",
    text: `Owner country: ${country}`,
    confidence: "1",
    source: "user_profile",
    created_at: context.owner.profile?.country_updated_at || context.owner.profile?.created_at || context.currentTimestamp,
  }];
}
