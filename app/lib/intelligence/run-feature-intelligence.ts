import "server-only";

import { generateStructuredFeatureResponse, type AskProviderEvent } from "../ai/ask-reasoning";
import { isAiMemoryExtractionEnabled } from "../ai/usage-guard/config.ts";
import { FURVISE_CORE_PROMPT_RULES, FURVISE_SHARED_PROMPT_RULES } from "../furvise-voice";
import { getIntelligenceFeatureMode } from "./feature-modes";
import { logIntelligenceEvent } from "./logging";
import { evaluateCareActionPolicy, evaluateLearningPolicy } from "./memory-policy";
import { isIntelligenceCareAction, isIntelligenceLearning, withIntelligenceLearningsSchema } from "./schemas";
import { resolveSafetyState } from "./safety-state";
import type { FurviseLiveContext, IntelligenceCareAction, IntelligenceFeature, IntelligenceLearning } from "./types";

export type FeatureIntelligenceResult<T> = {
  value: T;
  raw: Record<string, unknown>;
  safety: ReturnType<typeof resolveSafetyState>;
  acceptedLearnings: IntelligenceLearning[];
  acceptedCareActions: IntelligenceCareAction[];
  rejectedLearningCount: number;
  rejectedCareActionCount: number;
};

export async function runFeatureIntelligence<T>({
  context,
  feature,
  featureInput,
  maxOutputTokens,
  onProviderEvent,
  parseValue,
}: {
  context: FurviseLiveContext;
  feature: IntelligenceFeature;
  featureInput: unknown;
  maxOutputTokens?: number;
  onProviderEvent?: (event: AskProviderEvent) => void;
  parseValue: (value: unknown) => T | null;
}): Promise<FeatureIntelligenceResult<T>> {
  const mode = getIntelligenceFeatureMode(feature);
  if (!mode.responseSchema) throw new Error(`No structured response schema is configured for ${feature}.`);
  const safety = resolveSafetyState(context);
  const startedAt = Date.now();
  logIntelligenceEvent("feature model call started", {
    feature, petId: context.pet.id, selectedCareEventCount: context.selectedCareEntries.length,
    selectedMemoryCount: context.memories.length + context.legacyPetMemories.length,
    safetyLevel: safety.level,
  });
  const schema = withIntelligenceLearningsSchema(mode.responseSchema);
  const voiceRules = feature === "product_query_interpretation" || feature === "vet_brief"
    ? FURVISE_CORE_PROMPT_RULES
    : FURVISE_SHARED_PROMPT_RULES;
  const raw = await generateStructuredFeatureResponse<Record<string, unknown>>({
    input: {
      featureInput,
      liveContext: serializeContext(context),
      authoritativeSafety: safety,
    },
    instructions: [
      ...voiceRules,
      ...mode.promptInstructions,
      "Return only the required structured JSON.",
      "Learning sourceExcerpt must be a short exact excerpt from the current user input.",
      mode.persistencePolicy.allowMemories
        ? "Propose memories only for explicit useful ongoing preferences or facts. Never save recommendations as facts."
        : "Return an empty learnings array.",
      mode.persistencePolicy.allowCareActions
        ? "Propose care actions only for explicit high-confidence time-bound updates."
        : "Return an empty careActions array.",
    ].join("\n"),
    maxOutputTokens,
    onProviderEvent,
    parse: (value) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null,
    schema,
    schemaName: mode.responseSchemaName,
  });
  const value = parseValue(raw);
  if (!value) throw new Error(`${mode.responseSchemaName} failed compatibility validation.`);
  const proposedLearnings = Array.isArray(raw.learnings) ? raw.learnings.filter(isIntelligenceLearning) : [];
  const proposedCareActions = Array.isArray(raw.careActions) ? raw.careActions.filter(isIntelligenceCareAction) : [];
  const memoryExtractionEnabled = isAiMemoryExtractionEnabled();
  const learningPolicy = mode.persistencePolicy.allowMemories && memoryExtractionEnabled
    ? evaluateLearningPolicy(proposedLearnings, context.currentMessage, [context.pet.id])
    : { accepted: [], rejected: proposedLearnings.map((learning) => ({ learning, reason: memoryExtractionEnabled ? "feature_memory_disabled" : "global_memory_extraction_disabled" })) };
  const carePolicy = mode.persistencePolicy.allowCareActions
    ? evaluateCareActionPolicy({
      actions: proposedCareActions, currentMessage: context.currentMessage,
      understanding: inferUnderstanding(raw), safetyLevel: safety.level,
      activeConcernIds: safety.activeConcernIds,
    })
    : { accepted: [], rejected: proposedCareActions.map((action) => ({ action, reason: "feature_care_actions_disabled" })) };
  logIntelligenceEvent("feature model call completed", {
    acceptedCareActionCount: carePolicy.accepted.length,
    acceptedLearningCount: learningPolicy.accepted.length,
    elapsedMs: Date.now() - startedAt, feature, safetyLevel: safety.level,
  });
  return {
    value, raw, safety,
    acceptedLearnings: learningPolicy.accepted,
    acceptedCareActions: carePolicy.accepted,
    rejectedLearningCount: learningPolicy.rejected.length,
    rejectedCareActionCount: carePolicy.rejected.length,
  };
}

function serializeContext(context: FurviseLiveContext) {
  return {
    timestamp: context.currentTimestamp,
    locale: context.locale,
    currentMessage: context.currentMessage,
    pet: context.pet,
    ownerCountry: context.owner.profile?.country || null,
    activeConcerns: context.activeConcerns.map((item) => ({ id: item.id, title: item.title, type: item.normalized_key, severity: item.severity, status: item.status, openedAt: item.opened_at })),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns.map((item) => ({ id: item.id, title: item.title, type: item.normalized_key, resolvedAt: item.resolved_at, resolutionNote: item.resolution_note })),
    careEvents: context.selectedCareEntries.map((item) => ({ id: item.id, category: item.category, title: item.title, details: item.note, severity: item.severity, occurredAt: item.occurred_at, createdAt: item.created_at })),
    memories: [
      ...context.memories.slice(0, 8).map((item) => ({ id: item.id, sourceType: "furvise_memory", subjectType: item.subject_type, category: item.category, key: item.fact_key, value: item.fact_value, confidence: item.confidence })),
      ...context.legacyPetMemories.slice(0, 8).map((item) => ({ id: item.id, sourceType: "legacy_memory", subjectType: "pet", category: item.type, value: item.text, confidence: item.confidence })),
    ],
    conversation: context.conversationTurns.slice(-6),
  };
}

function inferUnderstanding(raw: Record<string, unknown>) {
  const careActions = Array.isArray(raw.careActions) ? raw.careActions : [];
  const hasResolution = careActions.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).action === "resolve_concern");
  return {
    primaryIntent: hasResolution ? "concern_resolution" as const : "update" as const,
    secondaryIntents: [], userIsAskingQuestion: false, userIsProvidingUpdate: careActions.length > 0,
    userIsCorrectingPriorInformation: false, userIsResolvingConcern: hasResolution,
    userIsProvidingPreference: false, userIsMakingSmallTalk: false,
    recoveryStatus: hasResolution ? "terminal" as const : "none" as const,
    recoveryConfidence: 1,
    recoveryEvidence: { outcome: hasResolution ? "problem_ended" as const : "none" as const, surfaceText: null, targetConcept: null, confidence: hasResolution ? 1 : 0 },
    requestedTopic: null, referencedPet: null, safetyRelevance: "none" as const,
    needsClarification: false, canAnswerDirectly: true,
  };
}
