import "server-only";

import type { AskProviderEvent, AskReasoningResult } from "../ai/ask-reasoning";
import { generateContextAwareAskResponse } from "../ai/ask-reasoning";
import { isAiMemoryExtractionEnabled } from "../ai/usage-guard/config.ts";
import { buildRecentAskUpdates } from "../ask-safety-context";
import { classifyMessageDeterministically } from "./classify-message";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "./memory-policy";
import { applySafetyFloor, resolveSafetyState } from "./safety-state";
import type { FurviseLiveContext } from "./types";
import { calculateMemoryFreshness } from "./memory-freshness/calculate-memory-freshness.ts";
import { authorizeProposedActions, type GovernanceResult } from "./governance/index.ts";
import { validateGeneratedAnswer, type AnswerValidationResult } from "./validation/index.ts";
import { resolveRecoverySubject } from "./episodes/resolve-recovery-subject.ts";
import { routePersistenceDestinations } from "./persistence-destination.ts";

export type FurviseIntelligenceResult = {
  reasoning: AskReasoningResult;
  deterministicUnderstanding: ReturnType<typeof classifyMessageDeterministically>;
  safety: ReturnType<typeof resolveSafetyState>;
  acceptedLearnings: AskReasoningResult["learnings"];
  rejectedLearningCount: number;
  acceptedCareActions: AskReasoningResult["careActions"];
  rejectedCareActionCount: number;
  governance: GovernanceResult;
  answerValidation: Omit<AnswerValidationResult, "response">;
};

export async function runFurviseIntelligence({
  context,
  requestId,
  sourceMessageId,
  onProviderEvent,
}: {
  context: FurviseLiveContext;
  requestId: string;
  sourceMessageId: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
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
    profiles: [context.pet],
    question: context.currentMessage,
    recentUpdates: buildRecentAskUpdates(context.selectedCareEntries),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns,
    requestId,
    concernStateHint: safety.concernMessageState,
    onProviderEvent,
  });

  const proposedResolutionPolicy = evaluateCareActionPolicy({
    actions: reasoning.careActions,
    currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding,
    safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
  });
  const modelGroundedResolution = reasoning.intelligenceSafety.level === "recently_resolved"
    && !["worsening", "recurrence", "still_active"].includes(safety.concernMessageState)
    && proposedResolutionPolicy.accepted.some((action) => action.action === "resolve_concern");
  reasoning.intelligenceSafety.level = modelGroundedResolution
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
    ? evaluateLearningPolicy(reasoning.learnings, context.currentMessage, context.pet.id)
    : { accepted: [], rejected: reasoning.learnings.map((learning) => ({ learning, reason: "global_memory_extraction_disabled" })) };
  const carePolicy = modelGroundedResolution ? proposedResolutionPolicy : evaluateCareActionPolicy({
    actions: reasoning.careActions, currentMessage: context.currentMessage,
    understanding: reasoning.messageUnderstanding, safetyLevel: reasoning.intelligenceSafety.level,
    activeConcernIds: safety.activeConcernIds,
  });
  const deterministicStateAction = buildClearResolutionAction(context, safety) || buildRecurrenceAction(context, safety);
  const proposedCareActions = deterministicStateAction ? [deterministicStateAction] : carePolicy.accepted;
  const governance = authorizeProposedActions({ message: context.currentMessage, petId: context.pet.id, careActions: proposedCareActions, memories: learningPolicy.accepted });
  const governedCareActions = governance.careActions.filter((decision) => decision.decision === "accepted").map((decision) => decision.proposal);
  const governedLearnings = governance.memories.filter((decision) => decision.decision === "accepted").map((decision) => decision.proposal);
  const routedPersistence = routePersistenceDestinations({ message: context.currentMessage, petId: context.pet.id, careActions: governedCareActions, learnings: governedLearnings });
  const acceptedCareActions = routedPersistence.careActions;
  const acceptedLearnings = routedPersistence.learnings;
  const answerValidation = validateGeneratedAnswer(reasoning, context, reasoning.intelligenceSafety.level);
  if (!answerValidation.valid) throw new Error(`FURVISE_ANSWER_VALIDATION_FAILED:${answerValidation.errors.join(",")}`);
  Object.assign(reasoning, answerValidation.response);
  return {
    reasoning,
    deterministicUnderstanding,
    safety,
    acceptedLearnings,
    rejectedLearningCount: learningPolicy.rejected.length,
    acceptedCareActions,
    rejectedCareActionCount: carePolicy.rejected.length,
    governance,
    answerValidation: { valid: answerValidation.valid, repairs: answerValidation.repairs, errors: answerValidation.errors },
  };
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
  if (safety.level !== "recently_resolved" || !["improved", "resolved"].includes(safety.concernMessageState)) return null;
  const subject = resolveRecoverySubject({
    message: context.currentMessage,
    recentConversation: context.conversationTurns.slice(-6).map((turn) => turn.text),
    activeEpisodes: context.activeEpisodes,
    activeConcerns: context.activeConcerns,
  });
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
