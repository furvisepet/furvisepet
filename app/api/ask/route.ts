import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildPetMemoryContext,
  type PetMemoryContext,
} from "../../lib/pet-memory";
import {
  buildAskConversationResponse,
  buildAskSaveMetadata,
  parseAskResponse,
} from "../../lib/ask.mjs";
import { ASK_REQUEST_KEYS } from "../../lib/ask-request-contract";
import {
  AskPipelineError,
  getAskModelConfiguration,
  getAskProviderCooldown,
  type AskContextRecord,
  type AskProviderEvent,
} from "../../lib/ai/ask-reasoning";
import { orchestrateAskTurn } from "../../lib/ai/ask-orchestrator";
import { runAdmittedAiOperation } from "../../lib/ai/usage-guard/admission";
import { AiAdmissionError, aiAdmissionErrorResponse } from "../../lib/ai/usage-guard/errors";
import type { PendingUpdateSuggestion, PetConcern } from "../../lib/ai/concern-engine";
import {
  AiCreditLedgerError,
  buildDevelopmentAiCreditFallback,
  completeAiCredit,
  getAiCreditLedgerDiagnostic,
  getRemainingAiCredits,
  isMissingAiUsageTableError,
  releaseAiCredit,
  reserveAiCredit,
  type AiCreditStatus,
} from "../../lib/ai/usage-ledger";
import type {
  CareEntryRow,
  DogMemoryRow,
  DogProfileRow,
} from "../../lib/supabase";
import { FURVISE_SAFETY_LINE } from "../../lib/safety-copy";
import {
  FURVISE_ANSWER_UNAVAILABLE_MESSAGE,
  FURVISE_ASK_UNAVAILABLE_MESSAGE,
} from "../../lib/furvise-voice";
import {
  getPaidGateMessage,
  type PlanId,
} from "../../lib/billing/plan-limits";
import { resolveEffectiveEntitlements, type EffectiveEntitlements } from "../../lib/billing/entitlements";
import { deriveConversationTitle } from "../../lib/ask-conversations";
import {
  buildRecentAskUpdates,
  concernKeyToAskTags,
  evaluateAskSafetyContext,
  formatConcernTag,
} from "../../lib/ask-safety-context";
import {
  buildFurviseContext,
  FurviseContextError,
  persistIntelligenceLearnings,
  persistedLearningConfirmation,
  runFurviseIntelligence,
  logSemanticTrace,
  semanticTraceForStorage,
  withSemanticPersistenceOutcome,
  type FurviseIntelligenceResult,
  type FurviseLiveContext,
  type CarePersistenceResult,
  type IntelligencePersistenceSummary,
} from "../../lib/intelligence";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid as isSecurityUuid, readBoundedJson } from "../../lib/security/request";
import { RateLimitRejection, requireRateLimitedRequest } from "../../lib/security/rate-limit";
import { claimIdempotentOperation } from "../../lib/security/idempotency";
import { validateSensitiveRequestOriginResponse } from "../../lib/security/headers/origin-policy";

const friendlyAnswerFailure = FURVISE_ANSWER_UNAVAILABLE_MESSAGE;
const askRequestTimeoutMs = 50_000;

type AskFailureCode = "AUTH_REQUIRED" | "PET_NOT_FOUND" | "INVALID_MESSAGE" | "RATE_LIMITED" | "AI_RATE_LIMITED" | "AI_UNAVAILABLE" | "DATABASE_ERROR" | "UNKNOWN_ERROR";

type ConversationMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "furvise"; response: { directAnswer?: string; summary?: string; clarificationQuestion?: string; trackingPlan?: { observations?: string[] } } | null };
type PreparedAskRequest = {
  conversationId: string;
  userMessageId: string;
  userSequence: number;
};

class AskApiError extends Error {
  constructor(
    public code: AskFailureCode,
    message: string,
    public status: number,
    public stage: string,
    public databaseError?: unknown,
  ) {
    super(message);
  }
}

class AiCreditLimitError extends Error {
  constructor() {
    super("AI_CREDIT_LIMIT_REACHED");
    this.name = "AiCreditLimitError";
  }
}

export async function GET(request: Request) {
  const context = await loadAskRequestContext(request);
  if ("response" in context) return context.response;
  return Response.json({ usage: context.usage });
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof loadAskRequestContext>>;
  try {
    context = await loadAskRequestContext(request);
  } catch (error) {
    logAskServerError("authentication", error, {}, 500);
    return askFailure("UNKNOWN_ERROR", "Furvise could not start that answer. Please try again.", 500, {}, "authentication");
  }
  if ("response" in context) return context.response;
  const { capabilities, supabase, usage, userId } = context;

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(request, API_BODY_LIMITS.ask);
  } catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return askFailure("INVALID_MESSAGE", oversized ? "That message is too large." : "Send a valid request.", oversized ? 413 : 400, {}, "request_validation");
  }
  if (!hasOnlyKeys(rawBody, ASK_REQUEST_KEYS)) {
    return askFailure("INVALID_MESSAGE", "The request contains unsupported fields.", 400, {}, "request_validation");
  }
  const body = rawBody as {
    conversationId?: unknown;
    petId?: unknown;
    previousResponse?: unknown;
    message?: unknown;
    question?: unknown;
    requestId?: unknown;
    locale?: unknown;
  } | null;
  const question = typeof body?.message === "string" ? body.message.trim() : typeof body?.question === "string" ? body.question.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const requestId = typeof body?.requestId === "string" && isUuid(body.requestId) ? body.requestId : "";
  const previousResponse = body?.previousResponse ? parseAskResponse(body.previousResponse) : null;
  const locale = resolveAskLocale(body?.locale, request.headers.get("accept-language"));
  logAskStage("authentication succeeded", { requestId });

  if (!petId || (petId !== "all" && !isSecurityUuid(petId)) || (conversationId && !isSecurityUuid(conversationId))) {
    return askFailure("INVALID_MESSAGE", "Choose a pet before asking Furvise.", 400, {}, "request_validation");
  }

  const profileQuery = supabase.from("dog_profiles").select("*").eq("user_id", userId);
  const { data: profiles, error: profileError } =
    petId === "all"
      ? await profileQuery.returns<DogProfileRow[]>()
      : await profileQuery.eq("id", petId).returns<DogProfileRow[]>();
  if (profileError) {
    logAskServerError("pet_ownership", profileError, { requestId }, 503);
    return askFailure("DATABASE_ERROR", "Furvise could not load this pet's saved details. Please try again.", 503, {}, "pet_ownership");
  }
  if (!profiles?.length) {
    return askFailure("PET_NOT_FOUND", "That pet is no longer available. Choose another pet and try again.", 404, {}, "pet_ownership");
  }
  logAskStage("pet ownership succeeded", { requestId });

  if (!question || question.length > 1200 || !requestId) {
    return askFailure("INVALID_MESSAGE", "Choose a pet and enter a message before asking Furvise.", 400, {}, "request_validation");
  }
  if (body?.previousResponse && !previousResponse) {
    return askFailure("INVALID_MESSAGE", "The follow-up context is no longer available. Ask a new question.", 400, {}, "request_validation");
  }
  logAskStage("request validation succeeded", { requestId });
  const idempotency = await claimIdempotentOperation({
    candidateKey: requestId,
    leaseSeconds: 180,
    operationType: "ask.submit",
    payload: { conversationId, locale, petId, previousResponse, question },
    request,
    retention: "financial",
    supabase,
    userId,
  });
  if ("response" in idempotency) return idempotency.response;
  return idempotency.operation.execute(async () => {
  let preparedRequest: PreparedAskRequest;
  let retryReuse = false;
  try {
    const existingRequest = await loadPersistedRequest({ petId, requestId, supabase, userId });
    if (existingRequest?.assistantMessage?.response_data) {
      logAskStage("completed response replayed", { requestId });
      return completedResponseFromPersisted(existingRequest, usage);
    }
    if (existingRequest) {
      retryReuse = true;
      logAskStage("user message reused", { requestId, retryReuse: true });
    }
    preparedRequest = existingRequest || await ensureConversationAndUserMessage({
      conversationId,
      petId,
      petName: profiles[0].name || "your pet",
      question,
      requestId,
      supabase,
      userId,
    });
  } catch (error) {
    return handleAskApiError(error, requestId);
  }

  let liveContext;
  try {
    liveContext = await buildFurviseContext({
      conversationId: preparedRequest.conversationId,
      currentMessage: question,
      feature: "ask",
      locale,
      petId,
      supabase,
      userId,
    });
  } catch (error) {
    logAskServerError("context_loading", error, { petId, requestId }, 503);
    if (error instanceof FurviseContextError && (error.code === "PET_NOT_FOUND" || error.code === "CONVERSATION_NOT_FOUND")) {
      return askFailure("PET_NOT_FOUND", "That pet or conversation is no longer available.", 404, {}, "context_loading");
    }
    return askFailure("DATABASE_ERROR", "Furvise could not load the latest saved details. Please try again.", 503, {}, "context_loading");
  }

  const conversationMessages: ConversationMessage[] = liveContext.conversationTurns
    .filter((message) => message.id !== preparedRequest.userMessageId)
    .map((message) => message.role === "user"
      ? { id: message.id, role: "user", text: message.text }
      : { id: message.id, role: "furvise", response: { directAnswer: message.text } });
  const entries = liveContext.careEntries;
  const recentUpdates = buildRecentAskUpdates(entries);
  const memories = liveContext.legacyPetMemories;
  const feedback = liveContext.productFeedback;
  const concerns = liveContext.activeConcerns;
  const recentlyResolvedConcerns = liveContext.recentlyResolvedConcerns;
  const safetyContext = evaluateAskSafetyContext({
    activeCareNotes: memories.map((memory) => memory.text),
    authoritativeActiveConcernTags: petId === "all"
      ? undefined
      : concerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title)),
    currentMessage: question,
    recentConversationTurns: conversationMessages.map((message) => ({
      role: message.role,
      text: message.role === "user" ? message.text : message.response?.directAnswer || message.response?.summary || "",
    })),
    recentlyResolvedConcernTags: /\b(breath|tired|energy|symptom|normal|fine|good|worse|returned|again)\b/i.test(question)
      ? recentlyResolvedConcerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title))
      : [],
    recentUpdates,
  });
  const canonicalActiveConcernTags = concerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title));
  const messageDerivedSafetyTags = safetyContext.activeConcernTags.filter((tag) => !canonicalActiveConcernTags.includes(tag));
  const memoryContexts = [liveContext.pet].map((profile) => {
    const memory = buildPetMemoryContext({
      careEntries: entries.filter((entry) => entry.pet_profile_id === profile.id),
      productFeedback: feedback.filter((item) => item.dog_profile_id === profile.id),
      profile,
      savedMemories: memories.filter((savedMemory) => savedMemory.dog_profile_id === profile.id),
    });
    return {
      ...memory,
      derived: {
        ...memory.derived,
        safetyFlags: safetyContext.activeConcernTags.map(formatConcernTag),
      },
    };
  });
  logAskStage("context loaded", {
    activeConcerns: concerns.map((concern) => ({ id: concern.id, status: concern.status })),
    activeConcernTags: safetyContext.activeConcernTags,
    canonicalActiveConcernTags,
    messageDerivedSafetyTags,
    categories: [...new Set(recentUpdates.map((update) => update.category))],
    latestUpdateTimestamp: recentUpdates[0]?.occurredAt || null,
    petId,
    recentUpdateCount: recentUpdates.length,
    selectedHistoryCount: liveContext.selectedCareEntries.length,
    selectedMemoryCount: liveContext.memories.length + liveContext.legacyPetMemories.length,
    recentlyResolvedConcernIds: recentlyResolvedConcerns.map((concern) => concern.id),
    contextStateVersion: liveContext.currentState?.state_version || 0,
    activeEpisodeCount: liveContext.activeEpisodes.length,
    monitoringEpisodeCount: liveContext.monitoringEpisodes.length,
    stateDomainsUsed: Object.keys(liveContext.currentState?.state || {}),
    requestId,
    safetyLevel: safetyContext.safetyLevel,
  });

  const contextUsed = {
    petName: memoryContexts.length === 1 ? memoryContexts[0].pet.name : null,
    usedSources: buildUsedContextSummary(memoryContexts, entries, memories),
  };

  let orchestration;
  let creditReserved = false;
  let creditFinalState = "not_reserved";
  let providerCallCount = 0;
  let intelligenceResult: FurviseIntelligenceResult | null = null;
  const rateGateRef: { current: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null } = { current: null };
  const confirmedExistingCarePersistence = await findExistingCareEventForSaveRequest({
    context: liveContext, currentSourceMessageId: preparedRequest.userMessageId, message: question, petId, supabase, userId,
  });
  try {
    const generationInput = {
      careEntries: entries,
      concerns,
      conversationTurns: conversationMessages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.role === "user" ? message.text : message.response?.directAnswer || message.response?.summary || "",
      })),
      locale,
      memories,
      productFeedback: feedback,
      profiles,
      question,
      recentlyResolvedConcerns,
      recentUpdates,
      requestId,
      onProviderEvent: (event: AskProviderEvent) => {
        if (event.outcome === "started") providerCallCount += 1;
        logAskProviderEvent(event, {
          conversationId: preparedRequest.conversationId,
          petId,
          providerCallCount,
          requestId,
        });
      },
    };
    orchestration = confirmedExistingCarePersistence ? {
      aiResult: null,
      answer: { title: "Already in history", summary: `Yes, that improvement is already in ${profiles[0]?.name || "your pet"}'s history.`, sections: [], safetyNote: null },
      concern: null,
      handledWithoutAi: true,
      intent: "status_update" as const,
      safetyLevel: "monitor" as const,
      suggestion: null,
    } : await orchestrateAskTurn({
      concerns,
      generationInput,
      message: question,
      petName: profiles[0]?.name || "your pet",
      generate: async () => {
        rateGateRef.current ||= await requireRateLimitedRequest({
          idempotencyKey: requestId,
          payload: { conversationId: preparedRequest.conversationId, petId, question },
          policy: "ASK_AI",
          request,
          requestId,
          route: "/api/ask",
          userId,
        });
        const model = getAskModelConfiguration().primary;
        return runAdmittedAiOperation({
          feature: "ask", intendedModel: model,
          payload: { conversationId: preparedRequest.conversationId, petId, question }, requestId, userId,
        }, async () => {
          if (!usage.allowed) throw new AiCreditLimitError();
          const cooldown = getAskProviderCooldown(model);
          if (cooldown.active) {
            throw new AskPipelineError("primary_provider_failed", "Ask provider is cooling down.", {
              elapsedMs: 0,
              model,
              providerErrorCode: "rate_limit_exceeded",
              providerErrorType: "requests",
              providerStatus: 429,
              retryAfterMs: cooldown.retryAfterMs,
            });
          }
          if (usage.ledgerMode === "development_missing_migration") {
            logAskStage("AI credit persistence skipped", { reason: "development_missing_migration", requestId });
            intelligenceResult = await withTimeout(runFurviseIntelligence({
              context: liveContext,
              requestId,
              sourceMessageId: preparedRequest.userMessageId,
              onProviderEvent: generationInput.onProviderEvent,
            }), askRequestTimeoutMs);
            return intelligenceResult.reasoning;
          }
          const reservation = await reserveAiCredit({ feature: "ask", requestId, supabase });
          if (reservation.status === "limit_reached") throw new AiCreditLimitError();
          creditReserved = reservation.status === "reserved";
          creditFinalState = reservation.status;
          logAskStage("AI credit reserved", { creditReservationId: requestId, feature: "ask", requestId, retryReuse, status: reservation.status });
          intelligenceResult = await withTimeout(runFurviseIntelligence({
            context: liveContext,
            requestId,
            sourceMessageId: preparedRequest.userMessageId,
            onProviderEvent: generationInput.onProviderEvent,
          }), askRequestTimeoutMs);
          logAskStage("intelligence validated", {
            acceptedCareActions: intelligenceResult.acceptedCareActions.length,
            acceptedLearnings: intelligenceResult.acceptedLearnings.length,
            rejectedCareActions: intelligenceResult.rejectedCareActionCount,
            rejectedLearnings: intelligenceResult.rejectedLearningCount,
            requestId,
            safetyLevel: intelligenceResult.reasoning.intelligenceSafety.level,
            proposedActionCount: intelligenceResult.reasoning.careActions.length + intelligenceResult.reasoning.learnings.length,
            acceptedActionCount: intelligenceResult.acceptedCareActions.length + intelligenceResult.acceptedLearnings.length,
            rejectedActionCount: intelligenceResult.rejectedCareActionCount + intelligenceResult.rejectedLearningCount,
            deterministicRepairsApplied: intelligenceResult.answerValidation.repairs,
          });
          return intelligenceResult.reasoning;
        });
      },
    });
    logAskStage("turn orchestrated", {
      activeConcernCount: concerns.length,
      handledWithoutAi: orchestration.handledWithoutAi,
      intent: orchestration.intent,
      requestId,
      recentlyResolvedConcernIds: recentlyResolvedConcerns.map((concern) => concern.id),
      safetyLevel: orchestration.safetyLevel,
    });
  } catch (error) {
    if (creditReserved) {
      await safeReleaseAiCredit({ requestId, supabase });
      creditFinalState = "released";
    }
    logAskStage("Ask generation finalized", { creditFinalState, creditReservationId: requestId, providerCallCount, requestId, retryReuse });
    if (rateGateRef.current) await rateGateRef.current.release();
    if (error instanceof RateLimitRejection) return error.response;
    if (error instanceof AiAdmissionError) return aiAdmissionErrorResponse(error, requestId);
    if (error instanceof AiCreditLimitError) {
      return askFailure("RATE_LIMITED", "You have used this month's AI credits. Your pet profiles, history, saved details, and non-AI tools are still available.", 429, { usage }, "credit_limit");
    }
    if (error instanceof AiCreditLedgerError) {
      logAskServerError(error.stage, error, { conversationId: preparedRequest.conversationId, petId, requestId, userId }, 503);
      return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503);
    }
    const internalStage = error instanceof AskPipelineError ? error.stage : "primary_provider_failed";
    logAskServerError(internalStage, error, { conversationId: preparedRequest.conversationId, petId, requestId }, 503);
    if (error instanceof AskPipelineError && isProviderRateLimit(error)) {
      const retryAfterMs = error.diagnostics.retryAfterMs || 0;
      return askFailure(
        "AI_RATE_LIMITED",
        "Furvise is receiving a lot of questions right now. Your message is saved, and no AI credit was used. Try again in a moment.",
        429,
        { retryable: true, ...(retryAfterMs ? { retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } : {}) },
      );
    }
    return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503);
  }

  const reasoning = orchestration.aiResult;
  if (reasoning) contextUsed.usedSources = [...new Set(reasoning.referencedRecords.map(formatContextSourceLabel))].slice(0, 4);
  const safetyLevel = orchestration.safetyLevel;
  const plannedGate = reasoning && safetyLevel === "normal" && !reasoning.shoppingSuppressed
    ? buildPlannedCapabilityResponse(question, capabilities)
    : null;
  if (plannedGate) {
    const plannedResponse = buildAskConversationResponse(plannedGate, {
      intent: "general_pet_question",
      missingUsefulDetails: [],
      urgent: false,
      usedContextSummary: contextUsed.usedSources,
    });
    if (!plannedResponse) {
      if (creditReserved) await safeReleaseAiCredit({ requestId, supabase });
      if (rateGateRef.current) await rateGateRef.current.release();
      return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503, {}, "response_serialization");
    }
    return persistAssistantAnswer({
      creditReserved,
      contextUsed,
      handledWithoutAi: false,
      intelligenceResult,
      petId,
      preparedRequest,
      requestId,
      response: plannedResponse,
      saveMetadata: buildAskSaveMetadata(plannedGate, { cannotAnswerFromSavedData: true, intent: "general_pet_question", question, usedSavedFactsCount: 0 }),
      safetyLevel: "normal",
      shoppingSuppressed: false,
      supabase,
      usage,
      userId,
    }).finally(async () => { if (rateGateRef.current) await rateGateRef.current.release(); });
  }
  const conversationResponse = buildAskConversationResponse(orchestration.answer, {
    intent: reasoning?.userIntent || orchestration.intent,
    clarificationQuestion: reasoning?.responseMode === "clarification" ? reasoning.suggestedFollowUps[0] || null : null,
    missingUsefulDetails: [],
    suggestedQuestions: reasoning?.suggestedFollowUps || [],
    recentlyResolved: reasoning?.intelligenceSafety.level === "recently_resolved",
    monitoring: safetyLevel === "monitor",
    urgent: safetyLevel === "urgent",
    usedContextSummary: contextUsed.usedSources,
  });
  if (!conversationResponse) {
    if (creditReserved) await safeReleaseAiCredit({ requestId, supabase });
    if (rateGateRef.current) await rateGateRef.current.release();
    return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503, {}, "response_serialization");
  }

  return persistAssistantAnswer({
    concern: orchestration.concern,
    creditReserved,
    contextUsed,
    handledWithoutAi: orchestration.handledWithoutAi,
    intelligenceResult,
    preconfirmedCarePersistence: confirmedExistingCarePersistence,
    petId,
    preparedRequest,
    requestId,
    response: conversationResponse,
    saveMetadata: buildAskSaveMetadata(conversationResponse, { intent: reasoning?.userIntent || orchestration.intent, question }),
    safetyLevel,
    shoppingSuppressed: reasoning ? reasoning.shoppingSuppressed : safetyLevel === "urgent",
    suggestion: orchestration.suggestion,
    supabase,
    usage,
    userId,
  }).finally(async () => { if (rateGateRef.current) await rateGateRef.current.release(); });
  });
}

type CompletedAskResponse = NonNullable<ReturnType<typeof buildAskConversationResponse>>;
type PersistedAskMessageRow = {
  care_persistence?: CarePersistenceResult | null;
  context_used: unknown | null;
  conversation_id: string;
  id: string;
  request_id: string | null;
  role: "user" | "furvise";
  response_data: CompletedAskResponse | null;
  save_metadata: unknown | null;
  sequence_number: number;
  user_text: string | null;
};

type PersistedRequestState = PreparedAskRequest & {
  assistantMessage: PersistedAskMessageRow | null;
  userMessage: PersistedAskMessageRow;
};

async function findExistingCareEventForSaveRequest({ context, currentSourceMessageId, message, petId, supabase, userId }: {
  context: FurviseLiveContext;
  currentSourceMessageId: string;
  message: string;
  petId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<CarePersistenceResult | null> {
  if (!/\b(?:save|add|put|note)\b[\s\S]*\b(?:that|history|care)\b|\bcan (?:you|u) save\b/i.test(message)) return null;
  const priorRecovery = [...context.conversationTurns].reverse().find((turn) => turn.role === "user" && turn.id !== currentSourceMessageId
    && /\b(?:good|fine|normal|better|recovered)\b/i.test(turn.text));
  if (!priorRecovery) return null;
  const { data, error } = await supabase.from("pet_care_entries").select("id, concern_id")
    .eq("user_id", userId).eq("pet_profile_id", petId).eq("intelligence_source_message_id", priorRecovery.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; concern_id: string | null }>();
  if (error || !data) return null;
  return { status: "persisted", careEntryIds: [data.id], concernIds: data.concern_id ? [data.concern_id] : [], errorCode: null, currentSafetyState: "recently_resolved", alreadyPersisted: true };
}

async function ensureConversationAndUserMessage({
  conversationId,
  petId,
  petName,
  question,
  requestId,
  supabase,
  userId,
}: {
  conversationId: string;
  petId: string;
  petName: string;
  question: string;
  requestId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<PreparedAskRequest> {
  let activeConversationId = conversationId;
  let createdConversation = false;

  if (activeConversationId) {
    const { data, error } = await supabase
      .from("ask_conversations")
      .select("id")
      .eq("id", activeConversationId)
      .eq("pet_profile_id", petId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();
    if (error) throw new AskApiError("DATABASE_ERROR", "Furvise could not open this conversation.", 503, "conversation_find", error);
    if (!data) throw new AskApiError("PET_NOT_FOUND", "That conversation is not available for this pet.", 404, "conversation_find");
    logAskStage("conversation found", { requestId });
  } else {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("ask_conversations")
      .insert({
        last_activity_at: now,
        pet_profile_id: petId,
        preview: question.slice(0, 220),
        status: "active",
        title: deriveConversationTitle(question, petName),
        user_id: userId,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new AskApiError("DATABASE_ERROR", "Furvise could not start this conversation.", 503, "conversation_create", error);
    activeConversationId = data.id;
    createdConversation = true;
    logAskStage("conversation created", { requestId });
  }

  const { data: lastMessage, error: sequenceError } = await supabase
    .from("ask_conversation_messages")
    .select("sequence_number")
    .eq("conversation_id", activeConversationId)
    .eq("user_id", userId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ sequence_number: number }>();
  if (sequenceError) {
    if (createdConversation) await deleteEmptyConversation(supabase, activeConversationId, userId);
    throw new AskApiError("DATABASE_ERROR", "Furvise could not save this conversation.", 503, "persist_user_message", sequenceError);
  }

  const sequence = (lastMessage?.sequence_number || 0) + 1;
  const { data: userMessage, error: userMessageError } = await supabase
    .from("ask_conversation_messages")
    .insert({
      conversation_id: activeConversationId,
      request_id: requestId,
      role: "user",
      sequence_number: sequence,
      user_id: userId,
      user_text: question,
    })
    .select("id, sequence_number")
    .single<{ id: string; sequence_number: number }>();

  if (userMessageError || !userMessage) {
    const replay = await loadPersistedRequest({ petId, requestId, supabase, userId });
    if (replay) {
      if (createdConversation && replay.conversationId !== activeConversationId) {
        await deleteEmptyConversation(supabase, activeConversationId, userId);
      }
      logAskStage("user message reused", { requestId });
      return replay;
    }
    if (createdConversation) await deleteEmptyConversation(supabase, activeConversationId, userId);
    throw new AskApiError("DATABASE_ERROR", "Furvise could not save this conversation.", 503, "persist_user_message", userMessageError);
  }

  logAskStage("user message persisted", { requestId });
  return { conversationId: activeConversationId, userMessageId: userMessage.id, userSequence: userMessage.sequence_number };
}

async function persistAssistantAnswer({
  concern = null,
  creditReserved,
  contextUsed,
  handledWithoutAi,
  intelligenceResult = null,
  preconfirmedCarePersistence = null,
  petId,
  preparedRequest,
  requestId,
  response,
  saveMetadata,
  safetyLevel,
  shoppingSuppressed,
  suggestion = null,
  supabase,
  urgent,
  usage,
  userId,
}: {
  concern?: PetConcern | null;
  creditReserved: boolean;
  contextUsed: unknown;
  handledWithoutAi: boolean;
  intelligenceResult?: FurviseIntelligenceResult | null;
  preconfirmedCarePersistence?: CarePersistenceResult | null;
  petId: string;
  preparedRequest: PreparedAskRequest;
  requestId: string;
  response: CompletedAskResponse;
  saveMetadata: unknown;
  safetyLevel?: "normal" | "monitor" | "urgent";
  shoppingSuppressed?: boolean;
  suggestion?: PendingUpdateSuggestion | null;
  supabase: SupabaseClient;
  urgent?: boolean;
  usage: AiCreditStatus;
  userId: string;
}) {
  const { conversationId, userMessageId } = preparedRequest;
  const { data: lastMessage, error: sequenceError } = await supabase
    .from("ask_conversation_messages")
    .select("sequence_number")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ sequence_number: number }>();
  if (sequenceError) {
    logAskServerError("persist_assistant_message", sequenceError, { requestId }, 200);
    if (creditReserved) await safeReleaseAiCredit({ requestId, supabase });
    return successfulAnswerResponse({
      concern,
      creditsUsed: 0,
      contextUsed,
      conversationId,
      handledWithoutAi,
      persistenceWarning: "This answer could not be saved to conversation history.",
      requestId,
      response,
      saveMetadata,
      safetyLevel: safetyLevel || (urgent ? "urgent" : "normal"),
      saved: false,
      shoppingSuppressed: shoppingSuppressed ?? Boolean(urgent),
      suggestion: null,
      usage,
      userMessageId,
    });
  }

  let { data: assistantMessage, error: messageError } = await supabase
    .from("ask_conversation_messages")
    .insert({
      context_used: contextUsed,
      conversation_id: conversationId,
      request_id: requestId,
      response_data: response,
      intelligence_validation: intelligenceResult?.answerValidation || null,
      persistence_governance: intelligenceResult ? { ...intelligenceResult.governance, semanticTrace: semanticTraceForStorage(intelligenceResult.semanticTrace) } : null,
      role: "furvise",
      save_metadata: saveMetadata,
      sequence_number: (lastMessage?.sequence_number || preparedRequest.userSequence) + 1,
      user_id: userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (messageError || !assistantMessage) {
    const existing = await loadPersistedRequestByConversation({ conversationId, requestId, supabase, userId });
    if (existing?.assistantMessage?.response_data) {
      return completedResponseFromPersisted(existing, usage);
    }
    logAskServerError("persistence_failed", messageError, { conversationId, requestId }, 200);
    const retryResult = await supabase
      .from("ask_conversation_messages")
      .insert({
        context_used: contextUsed,
        conversation_id: conversationId,
        request_id: requestId,
        response_data: response,
        intelligence_validation: intelligenceResult?.answerValidation || null,
        persistence_governance: intelligenceResult ? { ...intelligenceResult.governance, semanticTrace: semanticTraceForStorage(intelligenceResult.semanticTrace) } : null,
        role: "furvise",
        save_metadata: saveMetadata,
        sequence_number: (lastMessage?.sequence_number || preparedRequest.userSequence) + 1,
        user_id: userId,
      })
      .select("id")
      .single<{ id: string }>();
    assistantMessage = retryResult.data;
    messageError = retryResult.error;
    if (!assistantMessage || messageError) {
      logAskServerError("persistence_failed", messageError, { conversationId, requestId }, 200);
      if (creditReserved) await safeReleaseAiCredit({ requestId, supabase });
      return successfulAnswerResponse({
        concern,
        creditsUsed: 0,
        contextUsed,
        conversationId,
        handledWithoutAi,
        persistenceWarning: "This answer could not be saved to conversation history.",
        requestId,
        response,
        saveMetadata,
        safetyLevel: safetyLevel || (urgent ? "urgent" : "normal"),
        saved: false,
        shoppingSuppressed: shoppingSuppressed ?? Boolean(urgent),
        suggestion: null,
        usage,
        userMessageId,
      });
    }
    logAskStage("assistant message persisted after idempotent retry", { requestId });
  }
  logAskStage("assistant message persisted", { requestId });

  const { error: conversationUpdateError } = await supabase
    .from("ask_conversations")
    .update({ last_activity_at: new Date().toISOString(), preview: response.directAnswer.slice(0, 220) })
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (conversationUpdateError) logAskServerError("conversation_metadata", conversationUpdateError, { requestId }, 200);

  let intelligencePersistence: IntelligencePersistenceSummary | null = null;
  let intelligencePersistenceWarning = "";
  let semanticTrace = intelligenceResult?.semanticTrace || null;
  if (intelligenceResult && (intelligenceResult.acceptedLearnings.length || intelligenceResult.acceptedCareActions.length || intelligenceResult.acceptedSemanticEvents.length)) {
    try {
      intelligencePersistence = await persistIntelligenceLearnings({
        careActions: intelligenceResult.acceptedCareActions,
        semanticEvents: intelligenceResult.acceptedSemanticEvents,
        learnings: intelligenceResult.acceptedLearnings,
        petId,
        sourceMessageId: userMessageId,
        supabase,
        userId,
      });
      logAskStage("intelligence learnings persisted", {
        careEntriesCreated: intelligencePersistence.careEntriesCreated,
        concernsResolved: intelligencePersistence.concernsResolved,
        memoriesCreated: intelligencePersistence.memoriesCreated,
        memoriesSuperseded: intelligencePersistence.memoriesSuperseded,
        requestId,
      });
      if (semanticTrace) {
        semanticTrace = withSemanticPersistenceOutcome(semanticTrace, {
          status: intelligencePersistence.carePersistence.status === "failed" ? "failed"
            : intelligencePersistence.carePersistence.status === "persisted" ? "persisted" : "skipped",
          errorCode: intelligencePersistence.carePersistence.errorCode,
          careEntryCount: intelligencePersistence.carePersistence.careEntryIds.length,
          memoryCount: intelligencePersistence.memoryIds.length,
        });
      }
    } catch (error) {
      intelligencePersistenceWarning = "Approved learnings could not be saved.";
      logAskServerError("learning_persistence_failed", error, { conversationId, petId, requestId }, 200);
      if (semanticTrace) semanticTrace = withSemanticPersistenceOutcome(semanticTrace, { status: "failed", errorCode: "INTELLIGENCE_PERSISTENCE_EXCEPTION", careEntryCount: 0, memoryCount: 0 });
    }
  }
  if (semanticTrace && !intelligencePersistence && !intelligencePersistenceWarning) {
    semanticTrace = withSemanticPersistenceOutcome(semanticTrace, { status: "skipped", errorCode: null, careEntryCount: 0, memoryCount: 0 });
  }
  if (semanticTrace) logSemanticTrace(semanticTrace);

  let nextUsage = usage;
  let creditsUsed = 0;
  if (creditReserved) {
    try {
      try {
        await completeAiCredit({ requestId, supabase });
      } catch {
        await completeAiCredit({ requestId, supabase });
      }
      nextUsage = await getRemainingAiCredits({ monthlyAiCredits: usage.limit, planId: usage.planId, supabase, userId });
      creditsUsed = 1;
      logAskStage("AI credit completed", { creditFinalState: "completed", creditReservationId: requestId, requestId });
    } catch (error) {
      logAskServerError("credit_completion_failed", error, { requestId }, 200);
      await safeReleaseAiCredit({ requestId, supabase });
    }
  }
  const confirmedCarePersistence = preconfirmedCarePersistence || intelligencePersistence?.carePersistence || null;
  const automaticCareAction = confirmedCarePersistence?.status === "persisted"
    && confirmedCarePersistence.careEntryIds.length > 0;
  const automaticCareFailure = intelligencePersistence?.carePersistence.status === "failed";
  const suggestionPersistence = !automaticCareAction && !automaticCareFailure && suggestion
    ? await persistPendingSuggestion({ assistantMessageId: assistantMessage.id, conversationId, petId, suggestion, supabase, userId })
    : { careEntryId: null, concernId: null, effectAlreadyPresent: false, suggestion: null };
  const savedSuggestion = suggestionPersistence.suggestion;
  const persistenceMode = automaticCareAction ? "automatic" : savedSuggestion ? "suggested" : "none";
  const carePersistence: CarePersistenceResult = automaticCareAction && confirmedCarePersistence
    ? confirmedCarePersistence
    : automaticCareFailure && intelligencePersistence
      ? intelligencePersistence.carePersistence
      : savedSuggestion
        ? { status: "suggested", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false, memoryIds: intelligencePersistence?.memoryIds || [] }
        : { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false, memoryIds: intelligencePersistence?.memoryIds || [] };
  const canonicalResponse = reconcileResponsePersistenceCopy(response, persistenceMode, automaticCareFailure || Boolean(savedSuggestion));
  const { error: responseUpdateError } = await supabase.from("ask_conversation_messages")
    .update({ care_persistence: carePersistence, response_data: canonicalResponse }).eq("id", assistantMessage.id).eq("user_id", userId);
  if (responseUpdateError) logAskServerError("response_state_reconciliation", responseUpdateError, { conversationId, requestId }, 200);
  return successfulAnswerResponse({
    assistantMessageId: assistantMessage.id,
    concern,
    creditsUsed,
    contextUsed,
    conversationId,
    handledWithoutAi,
    intelligencePersistence,
    intelligencePersistenceWarning,
    requestId,
    response: canonicalResponse,
    saveMetadata,
    safetyLevel: safetyLevel || (urgent ? "urgent" : "normal"),
    saved: true,
    shoppingSuppressed: shoppingSuppressed ?? Boolean(urgent),
    suggestion: savedSuggestion,
    carePersistence,
    persistenceMode,
    persistedCareAction: automaticCareAction && intelligencePersistence ? {
      careEntryId: intelligencePersistence.persistedCareEntryId,
      concernId: intelligencePersistence.persistedConcernId,
    } : null,
    usage: nextUsage,
    userMessageId,
  });
}

async function persistPendingSuggestion({
  assistantMessageId,
  conversationId,
  petId,
  suggestion,
  supabase,
  userId,
}: {
  assistantMessageId: string;
  conversationId: string;
  petId: string;
  suggestion: PendingUpdateSuggestion;
  supabase: SupabaseClient;
  userId: string;
}): Promise<{
  careEntryId?: string | null;
  concernId?: string | null;
  effectAlreadyPresent: boolean;
  suggestion: (PendingUpdateSuggestion & { id: string }) | null;
}> {
  if (suggestion.type === "concern_resolution" && suggestion.concernId) {
    const { data: pendingForConcern } = await supabase.from("ai_update_suggestions").select("id")
      .eq("user_id", userId).eq("type", suggestion.type).eq("concern_id", suggestion.concernId).eq("status", "pending")
      .limit(1).maybeSingle<{ id: string }>();
    if (pendingForConcern) return { effectAlreadyPresent: false, suggestion: null };
  }
  let existingQuery = supabase.from("ai_update_suggestions")
    .select("id").eq("user_id", userId).eq("source_message_id", assistantMessageId).eq("type", suggestion.type)
    .eq("status", "pending");
  existingQuery = suggestion.concernId ? existingQuery.eq("concern_id", suggestion.concernId) : existingQuery.is("concern_id", null);
  const { data: existing } = await existingQuery.maybeSingle<{ id: string }>();
  if (existing) return { effectAlreadyPresent: false, suggestion: { ...suggestion, id: existing.id } };
  const { data, error } = await supabase
    .from("ai_update_suggestions")
    .insert({
      concern_id: suggestion.concernId || null,
      conversation_id: conversationId,
      details: suggestion.details || null,
      payload: suggestion.payload,
      pet_profile_id: petId,
      source_message_id: assistantMessageId,
      status: "pending",
      title: suggestion.title,
      type: suggestion.type,
      user_id: userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    logAskServerError("suggestion_persistence_failed", error, { conversationId }, 200);
    if (error?.code === "23505") {
      const { data: duplicate } = await supabase.from("ai_update_suggestions").select("id")
        .eq("user_id", userId).eq("source_message_id", assistantMessageId).eq("type", suggestion.type)
        .eq("status", "pending").maybeSingle<{ id: string }>();
      if (duplicate) return { effectAlreadyPresent: false, suggestion: { ...suggestion, id: duplicate.id } };
    }
    return { effectAlreadyPresent: false, suggestion: null };
  }
  return { effectAlreadyPresent: false, suggestion: { ...suggestion, id: data.id } };
}

async function safeReleaseAiCredit({
  requestId,
  supabase,
}: {
  requestId: string;
  supabase: SupabaseClient;
}) {
  try {
    await releaseAiCredit({ requestId, supabase });
    logAskStage("AI credit released", { requestId });
  } catch (error) {
    logAskServerError("credit_release_failed", error, { requestId }, 200);
  }
}

function successfulAnswerResponse({
  assistantMessageId = "",
  concern = null,
  creditsUsed = 0,
  contextUsed,
  conversationId,
  handledWithoutAi = false,
  intelligencePersistence = null,
  intelligencePersistenceWarning = "",
  carePersistence = { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false },
  persistenceWarning,
  persistenceMode = "none",
  persistedCareAction = null,
  requestId,
  response,
  saved,
  saveMetadata,
  safetyLevel,
  usage,
  shoppingSuppressed,
  suggestion = null,
  userMessageId,
}: {
  assistantMessageId?: string;
  concern?: PetConcern | null;
  creditsUsed?: number;
  contextUsed: unknown;
  conversationId: string;
  handledWithoutAi?: boolean;
  intelligencePersistence?: IntelligencePersistenceSummary | null;
  intelligencePersistenceWarning?: string;
  carePersistence?: CarePersistenceResult;
  persistenceWarning?: string;
  persistenceMode?: "automatic" | "suggested" | "none";
  persistedCareAction?: { careEntryId?: string | null; concernId?: string | null } | null;
  requestId: string;
  response: CompletedAskResponse;
  saved: boolean;
  saveMetadata: unknown;
  safetyLevel: "normal" | "monitor" | "urgent";
  usage: AiCreditStatus;
  shoppingSuppressed: boolean;
  suggestion?: (PendingUpdateSuggestion & { id: string }) | null;
  userMessageId: string;
}) {
  logAskStage("final response serialized", { requestId, saved });
  return Response.json({
    answer: response.directAnswer,
    assistantMessageId,
    concern: concern ? { id: concern.id, status: concern.status, title: concern.title } : null,
    contextUsed,
    conversationId,
    creditsUsed,
    handledWithoutAi,
    automaticSaveConfirmation: carePersistence.status === "persisted" && carePersistence.careEntryIds.length > 0 ? "Added to care history" : persistedLearningConfirmation(intelligencePersistence),
    carePersistence,
    intelligencePersistence: {
      saved: !intelligencePersistenceWarning && carePersistence.status !== "failed",
      ...(intelligencePersistenceWarning ? { warning: intelligencePersistenceWarning } : {}),
    },
    remainingCredits: usage.remaining,
    persistence: {
      saved,
      ...(persistenceWarning ? { warning: persistenceWarning } : {}),
    },
    persistenceMode,
    persistedCareAction,
    proposedHistoryUpdate: suggestion ? {
      shouldOffer: true,
      category: textPayloadValue(suggestion.payload.category),
      title: textPayloadValue(suggestion.payload.title),
      details: suggestion.details || null,
      severity: textPayloadValue(suggestion.payload.severity),
      resolvesConcernId: suggestion.concernId || null,
    } : null,
    response,
    safety: { level: safetyLevel, shoppingSuppressed },
    saveMetadata,
    suggestion,
    success: true,
    userMessageId,
    usage,
  });
}

function textPayloadValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function reconcileResponsePersistenceCopy(response: CompletedAskResponse, persistenceMode: "automatic" | "suggested" | "none", stateUpdatePending = false) {
  let directAnswer = response.directAnswer;
  if (persistenceMode !== "automatic") {
    directAnswer = directAnswer
      .replace(/I(?:'ve| have)? (?:saved|added|recorded|noted) (?:that|this|the update)[^.]*\.?/gi, "You can save this update to care history.")
      .replace(/(?:that|this) (?:has been|is) (?:saved|added|recorded) (?:in|to) [^.]*\.?/gi, "You can save this update to care history.");
  }
  if (stateUpdatePending) {
    directAnswer = directAnswer
      .replace(/has now been marked resolved/gi, "sounds improved")
      .replace(/has been marked resolved/gi, "sounds improved")
      .replace(/(?:the )?episode has resolved(?: for now)?/gi, "the episode sounds improved for now")
      .replace(/marked resolved/gi, "reported as improved");
  }
  return directAnswer === response.directAnswer ? response : { ...response, directAnswer };
}

async function loadPersistedRequest({ petId, requestId, supabase, userId }: { petId: string; requestId: string; supabase: SupabaseClient; userId: string }): Promise<PersistedRequestState | null> {
  const { data: messages, error } = await supabase
    .from("ask_conversation_messages")
    .select("id, conversation_id, request_id, role, sequence_number, user_text, response_data, save_metadata, context_used, care_persistence")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .returns<PersistedAskMessageRow[]>();
  if (error) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this request.", 503, "request_lookup", error);
  if (!messages?.length) return null;
  const conversationId = messages[0].conversation_id;
  const { data: conversation, error: conversationError } = await supabase
    .from("ask_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();
  if (conversationError) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this conversation.", 503, "request_lookup", conversationError);
  if (!conversation) throw new AskApiError("PET_NOT_FOUND", "That conversation is not available for this pet.", 404, "request_lookup");
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find((message) => message.role === "furvise");
  if (!userMessage) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this request.", 503, "request_lookup");
  return { assistantMessage: assistantMessage || null, conversationId, userMessage, userMessageId: userMessage.id, userSequence: userMessage.sequence_number };
}

async function loadPersistedRequestByConversation({ conversationId, requestId, supabase, userId }: { conversationId: string; requestId: string; supabase: SupabaseClient; userId: string }) {
  const { data: messages, error } = await supabase
    .from("ask_conversation_messages")
    .select("id, conversation_id, request_id, role, sequence_number, user_text, response_data, save_metadata, context_used, care_persistence")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .returns<PersistedAskMessageRow[]>();
  if (error || !messages?.length) return null;
  const userMessage = messages.find((message) => message.role === "user");
  if (!userMessage) return null;
  return {
    assistantMessage: messages.find((message) => message.role === "furvise") || null,
    conversationId,
    userMessage,
    userMessageId: userMessage.id,
    userSequence: userMessage.sequence_number,
  } satisfies PersistedRequestState;
}

function completedResponseFromPersisted(state: PersistedRequestState, usage: AiCreditStatus) {
  const assistantMessage = state.assistantMessage;
  if (!assistantMessage?.response_data) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this answer.", 503, "request_lookup");
  const response = assistantMessage.response_data;
  return successfulAnswerResponse({
    assistantMessageId: assistantMessage.id,
    contextUsed: assistantMessage.context_used,
    carePersistence: assistantMessage.care_persistence || undefined,
    conversationId: state.conversationId,
    requestId: assistantMessage.request_id || "",
    response,
    saved: true,
    saveMetadata: assistantMessage.save_metadata,
    safetyLevel: response.urgency === "urgent" ? "urgent" : response.urgency === "monitor" || response.urgency === "resolved" ? "monitor" : "normal",
    shoppingSuppressed: response.urgency === "urgent",
    usage,
    userMessageId: state.userMessageId,
  });
}

async function deleteEmptyConversation(supabase: SupabaseClient, conversationId: string, userId: string) {
  await supabase.from("ask_conversations").delete().eq("id", conversationId).eq("user_id", userId);
}

function askFailure(code: AskFailureCode, message: string, status: number, extra: Record<string, unknown> = {}, debugStage = "") {
  void debugStage;
  return Response.json({
    code,
    message,
    success: false,
    ...extra,
  }, { status });
}

function handleAskApiError(error: unknown, requestId: string) {
  if (error instanceof AskApiError) {
    logAskServerError(error.stage, error.databaseError || error, { requestId }, error.status);
    return askFailure(error.code, error.message, error.status, {}, error.stage);
  }
  logAskServerError("unknown", error, { requestId }, 500);
  return askFailure("UNKNOWN_ERROR", "Furvise could not finish that answer. Please try again.", 500, {}, "unknown");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Ask request timed out.")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logAskStage(message: string, context: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[Ask API] ${message}`, context);
}

function logAskServerError(stage: string, error: unknown, context: Record<string, unknown>, httpStatus: number) {
  if (process.env.NODE_ENV === "production") return;
  const databaseDiagnostic = getAiCreditLedgerDiagnostic(error);
  const databaseError = error as { code?: string; details?: string; hint?: string; message?: string } | null;
  console.warn("[Ask API] request failed", {
    databaseCode: databaseDiagnostic.code || databaseError?.code || "",
    databaseDetails: databaseDiagnostic.details || databaseError?.details || "",
    databaseHint: databaseDiagnostic.hint || databaseError?.hint || "",
    databaseMessage: databaseDiagnostic.message || databaseError?.message || "",
    httpStatus,
    operation: databaseDiagnostic.operation,
    requestId: typeof context.requestId === "string" ? context.requestId : "",
    resource: databaseDiagnostic.resource,
    safeErrorCode: databaseDiagnostic.code || databaseError?.code || "",
    safeErrorMessage: databaseDiagnostic.message || databaseError?.message || (error instanceof Error ? error.message : "Unknown error"),
    stage,
    userIdPresent: Boolean(context.userId),
  });
}

function logAskProviderEvent(event: AskProviderEvent, context: { conversationId: string; petId: string; providerCallCount: number; requestId: string }) {
  const payload = {
    configuredOutputLimit: event.configuredOutputLimit ?? null,
    conversationId: context.conversationId,
    elapsedMs: event.elapsedMs,
    fallbackEligible: event.fallbackEligible ?? null,
    fallbackFrom: event.fallbackFrom || null,
    model: event.model,
    outcome: event.outcome,
    finishReason: event.finishReason || null,
    incompleteReason: event.incompleteReason || null,
    inputTokens: event.inputTokens ?? null,
    outputLimitReached: Boolean(event.outputLimitReached),
    outputTokens: event.outputTokens ?? null,
    parsingAttempted: event.parsingAttempted ?? null,
    petId: context.petId,
    providerCallCount: context.providerCallCount,
    providerErrorCode: event.providerErrorCode || null,
    providerErrorType: event.providerErrorType || null,
    providerStatus: event.providerStatus ?? null,
    requestId: context.requestId,
    retryAfterMs: event.retryAfterMs ?? null,
    rawOutputLength: event.rawOutputLength ?? null,
    stage: event.stage,
    timedOut: Boolean(event.timedOut),
    validationDetails: event.validationDetails || null,
  };
  if (event.outcome === "failed") console.warn("[Ask provider] stage failed", payload);
  else console.info("[Ask provider] stage", payload);
}

function isProviderRateLimit(error: AskPipelineError) {
  return error.diagnostics.providerStatus === 429 || error.diagnostics.providerErrorCode === "rate_limit_exceeded";
}

function buildUsedContextSummary(
  memoryContexts: PetMemoryContext[],
  entries: CareEntryRow[],
  memories: DogMemoryRow[],
) {
  const sources = memoryContexts.length === 1
    ? [`${memoryContexts[0].pet.name}'s profile`]
    : ["Your pets' profiles"];
  if (entries.length) sources.push("Recent care updates");
  if (memories.length) sources.push("Saved notes");
  return sources;
}

async function loadAskRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      capabilities: EffectiveEntitlements["capabilities"];
      supabase: SupabaseClient;
      usage: AiCreditStatus;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: askFailure("AUTH_REQUIRED", "Your session expired. Sign in again to continue.", 401, {}, "authentication") };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: askFailure("AI_UNAVAILABLE", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "authentication") };

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (!userData.user) {
    logAskServerError("authentication", authError, {}, 401);
    return { response: askFailure("AUTH_REQUIRED", "Your session expired. Sign in again to continue.", 401, {}, "authentication") };
  }
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };

  const entitlements = await resolveEffectiveEntitlements(supabase);
  const planId = entitlements.effectivePlan;
  let usage: AiCreditStatus;
  try {
    usage = await getRemainingAiCredits({
      planId,
      monthlyAiCredits: entitlements.limits.monthlyAiCredits,
      supabase,
      userId: userData.user.id,
    });
  } catch (error) {
    if (error instanceof AiCreditLedgerError) {
      logAskServerError("usage_lookup", error, { userId: userData.user.id }, 503);
      if (process.env.NODE_ENV === "development" && isMissingAiUsageTableError(error)) {
        console.warn("[Ask API] unified AI credit migration is missing; using an in-memory development allowance without persistence", {
          migration: "20260727020000_add_unified_ai_credits_and_care_state.sql",
          resource: "ai_usage_events",
          userIdPresent: true,
        });
        usage = buildDevelopmentAiCreditFallback(planId);
      } else {
        return {
          response: askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "usage_lookup"),
        };
      }
    } else throw error;
  }
  return { capabilities: entitlements.capabilities, planId, supabase, usage, userId: userData.user.id };
}

function resolveAskLocale(bodyLocale: unknown, acceptLanguage: string | null) {
  const candidate = typeof bodyLocale === "string" ? bodyLocale : acceptLanguage?.split(",")[0];
  const cleaned = String(candidate || "en-US").trim().slice(0, 35);
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(cleaned) ? cleaned : "en-US";
}

function formatContextSourceLabel(record: AskContextRecord) {
  return ({
    active_concern: "Active concerns",
    active_episode: "Current episodes",
    care_update: "Recent care updates",
    conversation_turn: "Recent conversation",
    profile: "Pet profile",
    product_context: "Product history",
    remembered_detail: "Remembered details",
    resolved_episode: "Recently resolved episodes",
  } satisfies Record<AskContextRecord["sourceType"], string>)[record.sourceType];
}

function buildPlannedCapabilityResponse(question: string, capabilities: EffectiveEntitlements["capabilities"]) {
  const normalized = question.toLowerCase();
  if (/\b(export|pdf|download|printable report|vet[- ]?prep report)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      capabilities.vetPrepExports
        ? "Exportable vet-prep reports are not built yet."
        : getPaidGateMessage("vetPrepExports"),
    );
  }
  if (/\b(long|older|all history|pattern|trend|over time|months?)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      capabilities.longHistoryPatternDetection
        ? "Longer-history pattern detection is not built yet."
        : getPaidGateMessage("longHistoryPatternDetection"),
    );
  }
  if (/\b(live product|research products|current price|chewy|amazon|walmart|retailer)\b/.test(normalized)) {
    return plannedCapabilityResponse(
      capabilities.liveProductResearch
        ? "Live product research is not built yet."
        : getPaidGateMessage("liveProductResearch"),
    );
  }
  return null;
}

function plannedCapabilityResponse(message: string) {
  return {
    title: "Planned Furvise Plus capability",
    summary: message,
    sections: [
      {
        heading: "Still available",
        items: [
          "Care log, Dashboard, pet profiles, Results, safety guidance, and curated static product suggestions remain available.",
        ],
      },
    ],
    safetyNote: FURVISE_SAFETY_LINE,
  };
}
