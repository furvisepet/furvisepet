import "server-only";

import type { AskProviderEvent, AskReasoningResult } from "../ai/ask-reasoning";
import { generateContextAwareAskResponse } from "../ai/ask-reasoning";
import { isAiMemoryExtractionEnabled } from "../ai/usage-guard/config.ts";
import { buildRecentAskUpdates } from "../ask-safety-context";
import { classifyMessageDeterministically } from "./classify-message";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "./memory-policy";
import { allowsAcceptedRecoverySafetyReconciliation, allowsProposedRecoveryPresentation, applySafetyFloor, resolveSafetyState } from "./safety-state";
import type { FurviseLiveContext } from "./types";
import { calculateMemoryFreshness } from "./memory-freshness/calculate-memory-freshness.ts";
import { authorizeProposedActions, type GovernanceResult } from "./governance/index.ts";
import { validateGeneratedAnswer, type AnswerValidationResult } from "./validation/index.ts";
import { resolveRecoverySubject } from "./episodes/resolve-recovery-subject.ts";
import { routePersistenceDestinations } from "./persistence-destination.ts";
import { governCanonicalEvents, governCanonicalEventsForOwnedPets, learningFromSemanticEvent } from "./semantic-events.ts";
import { buildShadowSemanticAnalysis, logSemanticTrace, type SemanticTrace } from "./semantic-observability.ts";
import type { GovernedConceptIdentity, GovernedSemanticTurn } from "./v2/types.ts";
import type { ProposedSemanticFrame } from "./semantic-frame/types.ts";
import { governSemanticTurnV2 } from "./v2/governance/govern-turn.ts";
import { projectGovernedPreferencesToLegacyMemories } from "./v2/projections/legacy-memory.ts";
import { normalizeKnownPreferenceMemory, preferenceSemanticIdentity } from "./preference-semantics.ts";

export type FurviseIntelligenceResult = {
  reasoning: AskReasoningResult;
  deterministicUnderstanding: ReturnType<typeof classifyMessageDeterministically>;
  safety: ReturnType<typeof resolveSafetyState>;
  acceptedLearnings: AskReasoningResult["learnings"];
  rejectedLearningCount: number;
  acceptedCareActions: AskReasoningResult["careActions"];
  acceptedSemanticEvents: ReturnType<typeof governCanonicalEvents>["accepted"];
  rejectedCareActionCount: number;
  governance: GovernanceResult;
  answerValidation: Omit<AnswerValidationResult, "response">;
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
}: {
  context: FurviseLiveContext;
  requestId: string;
  sourceMessageId: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  subjectConfidence?: number;
  canonicalConcepts?: GovernedConceptIdentity[];
  authoritativePetIds?: string[];
  authoritativeSemanticFrame?: ProposedSemanticFrame;
}): Promise<FurviseIntelligenceResult> {
  const safety = resolveSafetyState(context);
  const deterministicUnderstanding = classifyMessageDeterministically(context.currentMessage, context.activeConcerns.length > 0);
  const reasoning = await generateContextAwareAskResponse({
    careEntries: context.selectedCareEntries,
    concerns: context.activeConcerns,
    conversationTurns: context.conversationTurns.filter((turn) => turn.id !== sourceMessageId).map((turn) => ({
      id: turn.id, role: turn.role, text: turn.text, createdAt: turn.createdAt,
    })),
    locale: context.locale,
    memories: [
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
    profiles: context.eligiblePets.filter((pet) => authoritativePetIds.includes(pet.id)),
    question: context.currentMessage,
    recentUpdates: buildRecentAskUpdates(context.selectedCareEntries),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns,
    activeEpisodes: [...context.activeEpisodes, ...context.monitoringEpisodes],
    recentlyResolvedEpisodes: context.recentlyResolvedEpisodes,
    requestId,
    concernStateHint: safety.concernMessageState,
    onProviderEvent,
    semanticFrameRecovery: {
      ownerIdentityVerified: Boolean(context.owner.userId),
      canonicalConcepts,
    },
  });
  const multiPetTurn = authoritativePetIds.length > 1;
  const semanticGovernanceInput = {
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
  const semanticGovernance = multiPetTurn
    ? governCanonicalEventsForOwnedPets({
      ...semanticGovernanceInput,
      pets: context.eligiblePets.filter((pet) => authoritativePetIds.includes(pet.id)),
    })
    : governCanonicalEvents({
      ...semanticGovernanceInput,
      resolvedPetSubject: { id: context.pet.id, name: context.pet.name },
    });

  const proposedResolutionPolicy = evaluateCareActionPolicy({
    actions: reasoning.careActions,
    currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding,
    safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
  });
  const modelGroundedResolution = allowsAcceptedRecoverySafetyReconciliation(safety)
    && safety.concernMessageState === "resolved"
    && reasoning.intelligenceSafety.level === "recently_resolved"
    && !["worsening", "recurrence", "still_active"].includes(safety.concernMessageState)
    && proposedResolutionPolicy.accepted.some((action) => action.action === "resolve_concern");
  const semanticGroundedResolution = allowsAcceptedRecoverySafetyReconciliation(safety)
    && semanticGovernance.accepted.some(({ event }) =>
      event.transition === "resolved" && event.state === "resolved" && Boolean(event.references.episodeId));
  const proposedRecoveryPresentation = allowsProposedRecoveryPresentation({
    activeConcernIds: safety.activeConcernIds,
    confidence: reasoning.intelligenceMetadata.confidence,
    resolvesConcernId: reasoning.proposedHistoryUpdate.resolvesConcernId,
    safety,
    shouldOffer: reasoning.proposedHistoryUpdate.shouldOffer,
    userIsResolvingConcern: reasoning.messageUnderstanding.userIsResolvingConcern,
  });
  reasoning.intelligenceSafety.level = modelGroundedResolution || semanticGroundedResolution
    ? "recently_resolved"
    : applySafetyFloor(reasoning.intelligenceSafety.level, safety);
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
  const carePolicy = modelGroundedResolution ? proposedResolutionPolicy : evaluateCareActionPolicy({
    actions: reasoning.careActions, currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding, safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
  });
  const deterministicStateAction = buildClearResolutionAction(context, safety) || buildRecurrenceAction(context, safety);
  const proposedCareActions = multiPetTurn ? [] : deterministicStateAction ? [deterministicStateAction] : carePolicy.accepted;
  const governance = authorizeProposedActions({
    message: context.currentMessage, petId: context.pet.id, authorizedPetIds: authoritativePetIds,
    careActions: proposedCareActions, memories: learningPolicy.accepted,
  });
  const governedCareActions = governance.careActions.filter((decision) => decision.decision === "accepted").map((decision) => decision.proposal);
  const governedLearnings = governance.memories.filter((decision) => decision.decision === "accepted").map((decision) => decision.proposal);
  const semanticLearnings = semanticGovernance.accepted.map(learningFromSemanticEvent).filter((item): item is NonNullable<typeof item> => Boolean(item));
  let governedV2Turn: GovernedSemanticTurn | null = null;
  try {
    governedV2Turn = governSemanticTurnV2({
      frame: authoritativeSemanticFrame || reasoning.semanticFrame,
      sourceMessage: context.currentMessage,
      sourceMessageId,
      ownerId: context.owner.userId,
      pets: context.eligiblePets,
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
  const acceptedCareActions = routedPersistence.careActions;
  const projectedPreferenceIdentities = new Set(projectedPreferences.map(learningPreferenceIdentity).filter(Boolean));
  const acceptedLearnings = dedupeLearnings([
    ...routedPersistence.learnings.filter((item) =>
      !(multiPetTurn && isPreferenceLearning(item))
      && (!projectedPreferenceIdentities.has(learningPreferenceIdentity(item)) || !isPreferenceLearning(item))),
    ...projectedPreferences,
  ]);
  // Presentation-only reconciliation happens after persistence governance and routing.
  if (proposedRecoveryPresentation) reasoning.intelligenceSafety.level = "recently_resolved";
  const answerValidation = validateGeneratedAnswer(reasoning, context, reasoning.intelligenceSafety.level, authoritativePetIds);
  if (!answerValidation.valid) throw new Error(`FURVISE_ANSWER_VALIDATION_FAILED:${answerValidation.errors.join(",")}`);
  Object.assign(reasoning, answerValidation.response);
  const shadow = buildShadowSemanticAnalysis({
    activeEpisodes: [...context.activeEpisodes, ...context.monitoringEpisodes],
    acceptedCareActions,
    acceptedLearnings,
    acceptedSemanticEvents: semanticGovernance.accepted,
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
    reasoning,
    deterministicUnderstanding,
    safety,
    acceptedLearnings,
    rejectedLearningCount: learningPolicy.rejected.length,
    acceptedCareActions,
    acceptedSemanticEvents: semanticGovernance.accepted,
    rejectedCareActionCount: carePolicy.rejected.length,
    governance,
    answerValidation: { valid: answerValidation.valid, repairs: answerValidation.repairs, errors: answerValidation.errors },
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

function buildRecurrenceAction(
  context: FurviseLiveContext,
  safety: ReturnType<typeof resolveSafetyState>,
): AskReasoningResult["careActions"][number] | null {
  if (safety.concernMessageState !== "recurrence" || context.activeConcerns.length || !context.recentlyResolvedConcerns.length) return null;
  const concern = context.recentlyResolvedConcerns[0];
  const label = concern.normalized_key.replace(/_/g, " ");
  return {
    action: "reopen_concern",
    category: "symptom",
    title: `${label.charAt(0).toUpperCase()}${label.slice(1)} problem recurred`,
    details: `Owner reported that ${context.pet.name}'s ${label} problem returned. ${context.currentMessage.trim()}`.slice(0, 800),
    severity: "urgent",
    confidence: 0.99,
    relatedRecordId: concern.id,
  };
}

function buildClearResolutionAction(
  context: FurviseLiveContext,
  safety: ReturnType<typeof resolveSafetyState>,
): AskReasoningResult["careActions"][number] | null {
  if (safety.level !== "recently_resolved" || safety.concernMessageState !== "resolved") return null;
  const subject = resolveRecoverySubject({
    message: context.currentMessage,
    recentConversation: context.conversationTurns.slice(-6).map((turn) => turn.text),
    activeEpisodes: context.activeEpisodes,
    activeConcerns: context.activeConcerns,
  });
  if (!subject.concernId) return null;
  return {
    action: "resolve_concern",
    category: "symptom",
    title: subject.title,
    details: `Owner reported that ${context.pet.name} returned to normal. ${context.currentMessage.trim()}`.slice(0, 800),
    severity: "routine",
    confidence: 0.99,
    relatedRecordId: subject.concernId,
  };
}

function memoryText(memory: FurviseLiveContext["memories"][number]) {
  const value = typeof memory.fact_value === "string" ? memory.fact_value : JSON.stringify(memory.fact_value);
  const freshness = calculateMemoryFreshness(memory, new Date());
  const qualifier = freshness.needsConfirmation ? " This may be outdated; confirm it only if relevant to the current question." : "";
  return `${memory.fact_key}: ${value}. Freshness: ${freshness.freshnessStatus}; effective confidence: ${freshness.effectiveConfidence.toFixed(2)}.${qualifier}`.slice(0, 600);
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
