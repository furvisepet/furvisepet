import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { emitOperationalEvent } from "../../lib/operations/events";
import {
  buildPetMemoryContext,
  type PetMemoryContext,
} from "../../lib/pet-memory";
import {
  buildAskConversationResponse,
  buildAskSaveMetadata,
} from "../../lib/ask.mjs";
import { ASK_REQUEST_KEYS } from "../../lib/ask-request-contract";
import {
  AskPipelineError,
  getAskModelConfiguration,
  getAskProviderCooldown,
  type AskContextRecord,
  type AskProviderEvent,
} from "../../lib/ai/ask-reasoning";
import { AskTurnLifecycle, deriveAskAttemptId, runOptionalAskSubsystem, type AskSubsystem, type AskTurnTrace } from "../../lib/ai/ask-turn-model";
import { orchestrateAskTurn, planProviderIndependentAskTurn } from "../../lib/ai/ask-orchestrator";
import { planDeterministicAskCommand } from "../../lib/ai/ask-command-router";
import { admitAiOperation, type AiOperationAdmission } from "../../lib/ai/usage-guard/admission";
import { AiAdmissionError } from "../../lib/ai/usage-guard/errors";
import { buildSemanticEventReviewSuggestion, type PendingUpdateSuggestion, type PetConcern } from "../../lib/ai/concern-engine";
import {
  AiCreditLedgerError,
  buildDevelopmentAiCreditFallback,
  completeAiCredit,
  getAiCreditEventsForLogicalRequest,
  getAiCreditLedgerDiagnostic,
  getRemainingAiCredits,
  hashAiCreditPayload,
  isAiCreditIntegrityError,
  isMissingAiUsageTableError,
  reconcileAiCredit,
  reserveAiCredit,
  setAiCreditDisposition,
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
  buildFurviseClarification,
} from "../../lib/furvise-voice";
import {
  getPaidGateMessage,
  type PlanId,
} from "../../lib/billing/plan-limits";
import { resolveEffectiveEntitlements, type EffectiveEntitlements } from "../../lib/billing/entitlements";
import { deriveConversationTitle } from "../../lib/ask-conversations";
import {
  buildImmediateEmergencyGuidance,
  buildRecentAskUpdates,
  concernKeyToAskTags,
  detectImmediateAskEmergency,
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
import { extractTurnSubjectFrame } from "../../lib/intelligence/semantic-frame/extract-turn-subject";
import type { ProposedSemanticFrame } from "../../lib/intelligence/semantic-frame/types";
import {
  resolveAskTurnSubject,
} from "../../lib/intelligence/entities/resolve-turn-subject";
import {
  persistAskV2Phase3LowRisk,
  prepareAskV2Phase3,
  type AskV2Phase3Runtime,
} from "../../lib/intelligence/v2/phase3/runtime";
import {
  enforceVerifiedStateClaims,
  executeFurviseApplicationAction,
  parseStoredApplicationActions,
  prepareFurviseApplicationActions,
  shouldAutoExecuteAction,
  type FurviseApplicationAction,
} from "../../lib/application-actions/index.ts";
import {
  buildGriefResponseFallback,
  buildUnavailableConfirmedLossAction,
  classifyCurrentPetLoss,
  ensureConfirmedLossAction,
  resolveProviderIndependentLossSubject,
  type ProviderIndependentLossSubject,
} from "../../lib/ai/pet-loss.ts";
import {
  derivePendingLifecycleAssertion,
  requiresLivingPet,
  resolveDurableLifecycleCorrection,
  resolvePendingLifecycleTurn,
  type PendingLifecycleAssertion,
  type PendingLifecycleTurnResolution,
} from "../../lib/ai/pending-lifecycle.ts";
import { getPetLifecycleStatus } from "../../lib/pet-lifecycle.ts";
import { isExplicitCareHistorySaveRequest, resolveAutomaticCareHistoryPresentation } from "../../lib/intelligence/care-history-policy.ts";
import { publicAskFailureCode, type AskInternalFailure } from "../../lib/ask-errors.ts";

const friendlyAnswerFailure = FURVISE_ANSWER_UNAVAILABLE_MESSAGE;
const askRequestTimeoutMs = 50_000;
const askGuardOperationTtlSeconds = 90 * 24 * 60 * 60;

type InternalAskFailureCode = "AUTH_REQUIRED" | "PET_NOT_FOUND" | "INVALID_MESSAGE" | "IDEMPOTENCY_CONFLICT" | "REQUEST_IN_PROGRESS" | "RATE_LIMITED" | "AI_RATE_LIMITED" | "AI_CREDITS_EXHAUSTED" | "AI_UNAVAILABLE" | "DATABASE_ERROR" | "UNKNOWN_ERROR";

type ConversationMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "furvise"; response: { directAnswer?: string; summary?: string; clarificationQuestion?: string; trackingPlan?: { observations?: string[] }; applicationActions?: FurviseApplicationAction[] } | null };
type PreparedAskRequest = {
  conversationId: string;
  userMessageId: string;
  userSequence: number;
};

class AskApiError extends Error {
  constructor(
    public code: InternalAskFailureCode,
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
  let authentication: Awaited<ReturnType<typeof loadAskAuthenticationContext>>;
  try {
    authentication = await loadAskAuthenticationContext(request);
  } catch (error) {
    logAskServerError("authentication", error, {}, 500);
    return askFailure("UNKNOWN_ERROR", "Furvise could not start that answer. Please try again.", 500, {}, "authentication");
  }
  if ("response" in authentication) return authentication.response;
  const { accessToken, supabase, userId } = authentication;

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
    message?: unknown;
    logicalTurnId?: unknown;
    locale?: unknown;
  } | null;
  const question = typeof body?.message === "string" ? body.message.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const logicalTurnId = typeof body?.logicalTurnId === "string" && isUuid(body.logicalTurnId) ? body.logicalTurnId : "";
  const requestId = logicalTurnId;
  const locale = resolveAskLocale(body?.locale, request.headers.get("accept-language"));
  const aiCreditPayload = { conversationId, locale, petId, question };
  const aiCreditPayloadHash = hashAiCreditPayload("ask", aiCreditPayload);
  logAskStage("authentication succeeded", { requestId });

  if (!question || question.length > 1200 || !requestId) {
    return askFailure("INVALID_MESSAGE", "Choose a pet and enter a message before asking Furvise.", 400, {}, "request_validation");
  }

  const currentLoss = classifyCurrentPetLoss(question);
  const immediateEmergency = currentLoss === "confirmed_current" ? null : detectImmediateAskEmergency(question);
  if (immediateEmergency) {
    const emergencyTurn = new AskTurnLifecycle(logicalTurnId, deriveAskAttemptId(logicalTurnId, "provider-independent-emergency"));
    emergencyTurn.transition("VALIDATED").transition("ROUTED").route("emergency", "deterministic");
    const response = buildAskConversationResponse(buildImmediateEmergencyGuidance(immediateEmergency), {
      intent: "general_pet_question",
      missingUsefulDetails: [],
      urgent: true,
      usedContextSummary: [],
    });
    if (!response) return askFailure("UNKNOWN_ERROR", "Contact an emergency veterinarian or clinic now.", 500, {}, "emergency_preflight");
    logAskStage("provider-independent emergency preflight handled", { emergencyTags: immediateEmergency.tags, requestId });
    emergencyTurn.transition("ANSWER_VALIDATED").transition("COMPLETED");
    emitAskTurnTrace(emergencyTurn.snapshot(), userId, petId);
    return standaloneEmergencyResponse({
      contextUsed: { petName: null, usedSources: [] },
      requestId,
      response,
      turn: emergencyTurn.snapshot(),
    });
  }

  let context: Awaited<ReturnType<typeof loadAskEntitlementContext>>;
  try {
    context = await loadAskEntitlementContext(authentication);
  } catch (error) {
    logAskServerError("entitlement_lookup", error, { requestId, userId }, 503);
    return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "entitlement_lookup");
  }
  if ("response" in context) return context.response;
  const { capabilities, usage } = context;

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

  logAskStage("request validation succeeded", { requestId });
  let persistedBeforeClaim: PersistedRequestState | null = null;
  try {
    persistedBeforeClaim = await loadPersistedRequest({ petId, requestId, supabase, userId });
  } catch (error) {
    return handleAskApiError(error, requestId);
  }
  let idempotency: Awaited<ReturnType<typeof claimIdempotentOperation>>;
  try {
    idempotency = await claimIdempotentOperation({
      candidateKey: requestId,
      leaseSeconds: 180,
      operationType: "ask.submit.persisted_answer_v2",
      payload: aiCreditPayload,
      preserveResponseOnCompletionFailure: true,
      reconcilePersistedReplay: async ({ claimOutcome }) => {
        const persisted = persistedBeforeClaim || await loadPersistedRequest({ petId, requestId, supabase, userId });
        if (!persisted?.assistantMessage?.response_data) {
          if (claimOutcome === "completed") {
            throw new AskApiError("DATABASE_ERROR", "Furvise could not load this answer.", 503, "request_lookup");
          }
          return null;
        }
        assertPersistedReplayIdentity({ conversationId, question, state: persisted });
        const replayUsage = await reconcilePersistedAskCredit({
          logicalRequestId: logicalTurnId,
          payloadHash: aiCreditPayloadHash,
          supabase,
          usage,
          userId,
        });
        logAskStage("completed response replayed after canonical identity validation", { requestId });
        return completedResponseFromPersisted(persisted, replayUsage);
      },
      request,
      retention: "financial",
      supabase,
      userId,
    });
  } catch (error) {
    return handleAskApiError(error, requestId);
  }
  if ("response" in idempotency) return canonicalizeAskInfrastructureResponse(idempotency.response);
  return idempotency.operation.execute(async () => {
  const attemptId = deriveAskAttemptId(logicalTurnId, idempotency.operation.ownerToken);
  const turnLifecycle = new AskTurnLifecycle(logicalTurnId, attemptId);
  turnLifecycle.transition("VALIDATED");
  let preparedRequest: PreparedAskRequest;
  let retryReuse = false;
  try {
    const existingRequest = persistedBeforeClaim || await loadPersistedRequest({ petId, requestId, supabase, userId });
    if (existingRequest?.assistantMessage?.response_data) {
      assertPersistedReplayIdentity({ conversationId, question, state: existingRequest });
      const replayUsage = await reconcilePersistedAskCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, supabase, usage, userId });
      logAskStage("completed response replayed", { requestId });
      return completedResponseFromPersisted(existingRequest, replayUsage);
    }
    if (existingRequest) {
      assertPersistedReplayIdentity({ conversationId, question, state: existingRequest });
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
    turnLifecycle.fail("persistence_prepare", true);
    emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
    return handleAskApiError(error, requestId);
  }
  turnLifecycle.transition("ROUTED");

  const creditRequestId = attemptId;

  let liveContext: FurviseLiveContext;
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
      turnLifecycle.fail("pet_unavailable", false);
      emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("PET_NOT_FOUND", "That pet or conversation is no longer available.", 404, {}, "context_loading");
    }
    turnLifecycle.fail("context_loading", true);
    emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
    return askFailure("DATABASE_ERROR", "Furvise could not load the latest saved details. Please try again.", 503, {}, "context_loading");
  }
  reportOptionalContextRecovery(liveContext, requestId);
  recordContextRecoveryOnTurn(liveContext, turnLifecycle);
  turnLifecycle.transition("CONTEXT_READY");

  let phase3Runtime: AskV2Phase3Runtime | null = null;

  const pendingLifecycle = derivePendingLifecycleAssertion({
    turns: liveContext.conversationTurns,
    pets: liveContext.eligiblePets,
  });
  const pendingLifecycleResolution = pendingLifecycle
    ? resolvePendingLifecycleTurn({ assertion: pendingLifecycle, message: question, pets: liveContext.eligiblePets })
    : null;
  const durableLifecycleStatus = getPetLifecycleStatus(liveContext.pet);
  const durableLifecycleCorrection = resolveDurableLifecycleCorrection({
    message: question,
    status: durableLifecycleStatus,
  });
  const durableLifecycleResolution = durableLifecycleStatus !== "active" && requiresLivingPet(question)
    ? durableLifecycleStatus
    : null;
  let turnPetId = petId;
  let turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question, requestId });
  let contextUsed = turnView.contextUsed;

  let orchestration;
  let creditReserved = false;
  let creditFinalState = "not_reserved";
  let providerCallCount = 0;
  let intelligenceResult: FurviseIntelligenceResult | null = null;
  let aiAdmission: AiOperationAdmission | null = null;
  let aiAdmissionFinalized = false;
  const rateGateRef: { current: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null } = { current: null };
  let confirmedExistingCarePersistence: CarePersistenceResult | null = null;
  let deterministicApplicationActions: FurviseApplicationAction[] = [];
  let deterministicLossInteraction = false;
  let deferHighImpactLifecyclePersistence = classifyCurrentPetLoss(question) === "confirmed_current"
    || pendingLifecycle?.kind === "reported_deceased";
  const onProviderEvent = (event: AskProviderEvent) => {
    if (event.outcome === "started") {
      providerCallCount += 1;
      turnLifecycle.providerCall();
    }
    if (event.outcome === "failed") turnLifecycle.providerFailure(event.providerErrorCode || event.stage);
    logAskProviderEvent(event, {
      conversationId: preparedRequest.conversationId,
      petId: turnPetId,
      providerCallCount,
      requestId,
    });
  };
  try {
    confirmedExistingCarePersistence = await runOptionalAskSubsystem({
      component: "history_persistence",
      fallback: null,
      operation: () => findExistingCareEventForSaveRequest({
        context: liveContext, currentSourceMessageId: preparedRequest.userMessageId, message: question, petId, supabase, userId,
      }),
      onFailure: (component, error) => {
        turnLifecycle.optionalFailure(component);
        logAskServerError("optional_history_lookup", error, { conversationId: preparedRequest.conversationId, petId, requestId }, 200);
      },
    });
    const preconfirmedOrchestration = confirmedExistingCarePersistence ? buildAlreadyPersistedOrchestration(liveContext.pet.name || "your pet")
      : null;
    if (preconfirmedOrchestration) {
      turnLifecycle.route("application_action", "deterministic");
      orchestration = preconfirmedOrchestration;
    } else if (pendingLifecycle && pendingLifecycleResolution && pendingLifecycleResolution.kind !== "continuation") {
      turnLifecycle.route("lifecycle", "deterministic");
      orchestration = buildPendingLifecycleOrchestration(pendingLifecycle, pendingLifecycleResolution);
      if (pendingLifecycleResolution.kind === "contradiction" || pendingLifecycleResolution.kind === "alternate_pet") {
        deterministicApplicationActions = [pendingLifecycle.action];
      } else if (pendingLifecycleResolution.kind === "correction") {
        deterministicApplicationActions = [cancelledPendingLifecycleAction(pendingLifecycle.action)];
      } else if (pendingLifecycleResolution.kind === "reassigned_death") {
        turnPetId = pendingLifecycleResolution.petId;
        const reassignedActions = prepareFurviseApplicationActions({
          proposals: [{
            kind: "pet.mark_deceased",
            input: { field: null, value: null, title: null, detail: null, category: null, target: "specified" },
            evidence: question.slice(0, 240),
            explicitIntent: false,
          }],
          petId: pendingLifecycleResolution.petId,
          petName: pendingLifecycleResolution.petName,
          requestId,
        }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
        deterministicApplicationActions = [cancelledPendingLifecycleAction(pendingLifecycle.action), ...reassignedActions];
        deferHighImpactLifecyclePersistence = true;
      }
    } else if (durableLifecycleCorrection) {
      turnLifecycle.route("lifecycle", "deterministic");
      deferHighImpactLifecyclePersistence = true;
      orchestration = buildDurableLifecycleCorrectionOrchestration(
        liveContext.pet.name || "your pet",
        durableLifecycleCorrection.fromStatus,
      );
      deterministicApplicationActions = prepareFurviseApplicationActions({
        proposals: [{
          kind: "pet.mark_active",
          input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
          evidence: question.slice(0, 240),
          explicitIntent: true,
        }],
        petId: turnPetId,
        petName: liveContext.pet.name || "your pet",
        requestId,
        lifecycleStatus: durableLifecycleStatus,
      }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
    } else if (currentLoss === "confirmed_current") {
      turnLifecycle.route("lifecycle", "deterministic");
      const recentConversation = liveContext.conversationTurns.filter((turn) => turn.id !== preparedRequest.userMessageId);
      const pendingPet = pendingLifecycle && pendingLifecycleResolution?.kind === "continuation"
        ? liveContext.eligiblePets.find((pet) => pet.id === pendingLifecycle.petId)
        : null;
      const lossSubject: ProviderIndependentLossSubject = pendingPet
        ? {
            kind: "resolved",
            petId: pendingPet.id,
            petName: pendingLifecycle!.petName,
            lifecycleStatus: pendingPet.lifecycle_status || "active",
          }
        : resolveProviderIndependentLossSubject({
            message: question,
            pets: liveContext.eligiblePets,
            recentConversation,
            selectedPetId: petId,
          }) || { kind: "clarification", candidateNames: [] };
      deterministicLossInteraction = true;
      deferHighImpactLifecyclePersistence = true;

      if (lossSubject.kind === "resolved") {
        turnPetId = lossSubject.petId;
        if (turnPetId !== petId) {
          liveContext = await buildFurviseContext({
            conversationId: preparedRequest.conversationId,
            conversationPetId: petId,
            currentMessage: question,
            feature: "ask",
            locale,
            petId: turnPetId,
            supabase,
            userId,
          });
          turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question, requestId });
          contextUsed = turnView.contextUsed;
        }
        orchestration = buildConfirmedLossOrchestration(lossSubject.petName, lossSubject.lifecycleStatus !== "active");
        if (lossSubject.lifecycleStatus === "active") {
          const existingPendingAction = pendingLifecycle?.petId === turnPetId ? pendingLifecycle.action : null;
          const preparedLossAction = existingPendingAction ? [existingPendingAction] : prepareFurviseApplicationActions({
            proposals: ensureConfirmedLossAction([], question, { exclusive: true }).map((proposal) => ({
              ...proposal,
              input: { ...proposal.input, target: turnPetId === petId ? "selected" as const : "specified" as const },
            })),
            petId: turnPetId,
            petName: lossSubject.petName,
            requestId,
            lifecycleStatus: lossSubject.lifecycleStatus,
          }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
          const unavailableAction = buildUnavailableConfirmedLossAction({
            message: question,
            petId: turnPetId,
            petName: lossSubject.petName,
            requestId,
          });
          deterministicApplicationActions = preparedLossAction.length
            ? preparedLossAction
            : unavailableAction ? [{ ...unavailableAction, sourceMessageId: preparedRequest.userMessageId }] : [];
        }
      } else if (lossSubject.kind === "external_subject") {
        contextUsed = { petName: null, usedSources: [] };
        orchestration = buildExternalLossOrchestration();
      } else {
        contextUsed = { petName: null, usedSources: [] };
        orchestration = buildConfirmedLossClarificationOrchestration(lossSubject.candidateNames);
      }
    } else if (durableLifecycleResolution) {
      turnLifecycle.route("lifecycle", "deterministic");
      orchestration = buildDurableLifecycleContradictionOrchestration(
        liveContext.pet.name || "your pet",
        durableLifecycleResolution,
      );
    } else {
    const deterministicCommand = planDeterministicAskCommand(question, liveContext.pet.name || "your pet");
    const providerIndependent = planProviderIndependentAskTurn({
      concerns: turnView.concerns,
      message: question,
      petName: liveContext.pet.name || "your pet",
    });
    if (deterministicCommand) {
      turnLifecycle.route(deterministicCommand.routeType, "deterministic");
      deterministicApplicationActions = prepareFurviseApplicationActions({
        proposals: deterministicCommand.proposals,
        petId: turnPetId,
        petName: liveContext.pet.name || "your pet",
        requestId,
        lifecycleStatus: durableLifecycleStatus,
      }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
      orchestration = deterministicCommand.orchestration;
    } else if (providerIndependent) {
      turnLifecycle.route("acknowledgement", "deterministic");
      orchestration = providerIndependent;
    } else {
    turnLifecycle.route("pet_care", "ai");
    phase3Runtime = await runOptionalAskSubsystem({
      component: "context_semantic_state",
      fallback: null,
      operation: () => prepareAskV2Phase3({ accessToken, context: liveContext, requestId, verifiedUserId: userId }),
      onFailure: (component, error) => {
        turnLifecycle.optionalFailure(component);
        logAskServerError("optional_phase3_context", error, { conversationId: preparedRequest.conversationId, petId, requestId }, 200);
      },
    });
    rateGateRef.current = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { conversationId: preparedRequest.conversationId, petId, question },
      policy: "ASK_AI",
      request,
      requestId,
      route: "/api/ask",
      userId,
    });
    if (!usage.allowed) throw new AiCreditLimitError();
    const model = getAskModelConfiguration().primary;
    const cooldown = getAskProviderCooldown(model);
    if (cooldown.active) {
      throw new AskPipelineError("primary_provider_failed", "Ask provider is cooling down.", {
        elapsedMs: 0, model, providerErrorCode: "rate_limit_exceeded", providerErrorType: "requests",
        providerStatus: 429, retryAfterMs: cooldown.retryAfterMs,
      });
    }
    aiAdmission = await admitAiOperation({
      feature: "ask", intendedModel: model,
      operationTtlSeconds: askGuardOperationTtlSeconds,
      payload: { conversationId: preparedRequest.conversationId, petId, question }, requestId: attemptId, userId,
    });
    turnLifecycle.transition("AI_ADMITTED");
    orchestration = await withTimeout(aiAdmission.run(async () => {
      turnLifecycle.transition("GENERATING");
      if (usage.ledgerMode === "development_missing_migration") {
        logAskStage("AI credit persistence skipped", { reason: "development_missing_migration", requestId });
      } else {
        const reservation = await reserveAiCredit({
          feature: "ask",
          logicalRequestId: logicalTurnId,
          payloadHash: aiCreditPayloadHash,
          requestId: creditRequestId,
          userId,
        });
        if (reservation.status === "limit_reached") throw new AiCreditLimitError();
        if (reservation.status !== "reserved") {
          throw new AiCreditLedgerError("reservation_failed", new Error(`AI_CREDIT_${reservation.status.toUpperCase()}_REPLAY_REQUIRED`), "reserve_ai_credit", "rpc");
        }
        creditReserved = reservation.status === "reserved";
        creditFinalState = reservation.status;
        logAskStage("AI credit reserved", { creditReservationId: creditRequestId, feature: "ask", requestId, retryReuse, status: reservation.status });
      }
      const recentConversation = liveContext.conversationTurns.filter((turn) => turn.id !== preparedRequest.userMessageId);
      let subjectDecision: Awaited<ReturnType<typeof resolveAskTurnSubject>>;
      try {
        subjectDecision = await resolveAskTurnSubject({
          extractFrame: async () => await extractTurnSubjectFrame({ message: question, model, onProviderEvent, recentConversation }),
          message: question,
          ownerId: userId,
          pets: liveContext.eligiblePets,
          recentConversation,
          selectedPetId: petId,
        });
      } catch (error) {
        turnLifecycle.optionalFailure("subject_extraction").providerFailure(error instanceof AskPipelineError ? error.stage : "subject_extraction_failed");
        if (creditReserved) {
          const released = await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
          creditReserved = false;
          creditFinalState = released ? "released" : "release_pending";
          turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
        }
        contextUsed = { petName: null, usedSources: [] };
        const candidateNames = liveContext.eligiblePets.length >= 2
          ? liveContext.eligiblePets.map((pet) => pet.name).filter(Boolean)
          : [];
        return buildSubjectClarificationOrchestration(question, candidateNames);
      }
      const subjectFrame = subjectDecision.frame;
      const subjectResolution = subjectDecision.resolution;
      logAskStage("turn subject resolved", {
        explicitSubject: subjectResolution.explicitSubject,
        reasonCode: subjectResolution.reasonCode,
        requestId,
        resolutionStatus: subjectResolution.status,
        resolvedAlternatePet: Boolean(subjectResolution.petId && subjectResolution.petId !== petId),
        subjectCount: subjectResolution.petIds.length,
      });
      turnLifecycle.subject(subjectResolution.reasonCode || subjectResolution.status, subjectResolution.candidatePetIds?.length || subjectResolution.petIds.length);
      if (subjectResolution.requiresClarification || !subjectResolution.petId) {
        turnLifecycle.route("clarification", "deterministic");
        if (creditReserved) {
          const released = await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
          creditReserved = false;
          creditFinalState = released ? "released" : "release_pending";
          turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
        }
        intelligenceResult = null;
        contextUsed = { petName: null, usedSources: [] };
        const candidateNames = (subjectResolution.candidatePetIds || [])
          .map((candidateId) => liveContext.eligiblePets.find((pet) => pet.id === candidateId)?.name)
          .filter((name): name is string => Boolean(name));
        return buildSubjectClarificationOrchestration(question, candidateNames);
      }

      turnPetId = subjectResolution.petId;
      if (turnPetId !== petId) {
        liveContext = await buildFurviseContext({
          conversationId: preparedRequest.conversationId,
          conversationPetId: petId,
          currentMessage: question,
          feature: "ask",
          locale,
          petId: turnPetId,
          supabase,
          userId,
        });
        reportOptionalContextRecovery(liveContext, requestId);
        recordContextRecoveryOnTurn(liveContext, turnLifecycle);
        phase3Runtime = await runOptionalAskSubsystem({
          component: "context_semantic_state",
          fallback: null,
          operation: () => prepareAskV2Phase3({ accessToken, context: liveContext, requestId, verifiedUserId: userId }),
          onFailure: (component, error) => {
            turnLifecycle.optionalFailure(component);
            logAskServerError("optional_phase3_context", error, { conversationId: preparedRequest.conversationId, petId: turnPetId, requestId }, 200);
          },
        });
      }
      turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question, requestId });
      contextUsed = turnView.contextUsed;
      confirmedExistingCarePersistence = await runOptionalAskSubsystem({
        component: "history_persistence",
        fallback: null,
        operation: () => findExistingCareEventForSaveRequest({
          context: liveContext, currentSourceMessageId: preparedRequest.userMessageId, message: question, petId: turnPetId, supabase, userId,
        }),
        onFailure: (component, error) => {
          turnLifecycle.optionalFailure(component);
          logAskServerError("optional_history_lookup", error, { conversationId: preparedRequest.conversationId, petId: turnPetId, requestId }, 200);
        },
      });
      if (confirmedExistingCarePersistence) return buildAlreadyPersistedOrchestration(liveContext.pet.name || "your pet");

      const generationInput = buildTurnGenerationInput({
        authoritativePetIds: subjectResolution.petIds,
        locale, onProviderEvent, question, requestId, turnSemanticFrame: subjectFrame, turnView, liveContext,
      });
      return await orchestrateAskTurn({
        concerns: turnView.concerns,
        generationInput,
        message: question,
        petName: liveContext.pet.name || "your pet",
        generate: async () => {
          intelligenceResult = await runFurviseIntelligence({
            context: liveContext,
            requestId,
            sourceMessageId: preparedRequest.userMessageId,
            onProviderEvent,
            subjectConfidence: subjectResolution.confidence,
            authoritativePetIds: subjectResolution.petIds,
            authoritativeSemanticFrame: subjectFrame,
            canonicalConcepts: phase3Runtime?.canonicalConcepts || [],
          });
          logValidatedIntelligence(intelligenceResult, requestId);
          return intelligenceResult.reasoning;
        },
      });
    }), askRequestTimeoutMs);
    }
    }
    logAskStage("turn orchestrated", {
      activeConcernCount: turnView.concerns.length,
      handledWithoutAi: orchestration.handledWithoutAi,
      intent: orchestration.intent,
      requestId,
      recentlyResolvedConcernIds: turnView.recentlyResolvedConcerns.map((concern) => concern.id),
      safetyLevel: orchestration.safetyLevel,
    });
    if (orchestration.handledWithoutAi) turnLifecycle.credit("not_required");
  } catch (error) {
    await failAiAdmission(aiAdmission, error, aiAdmissionFinalized, requestId);
    aiAdmissionFinalized = Boolean(aiAdmission);
    if (creditReserved) {
      try {
        const released = await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
        creditFinalState = released ? "released" : "release_pending";
        turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
      } catch (settlementError) {
        creditFinalState = "release_pending";
        turnLifecycle.credit("release_pending").settlement("missing", "conflict").fail("credit_disposition", true);
        emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
        if (rateGateRef.current) await rateGateRef.current.release();
        return handleAskApiError(settlementError, requestId);
      }
    }
    logAskStage("Ask generation finalized", { creditFinalState, creditReservationId: creditRequestId, providerCallCount, requestId, retryReuse });
    if (rateGateRef.current) await rateGateRef.current.release();
    if (error instanceof RateLimitRejection) {
      turnLifecycle.fail("rate_limit", true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("RATE_LIMITED", "Wait a moment, then try again.", error.response.status, {}, "rate_limit");
    }
    if (error instanceof AiAdmissionError) {
      if (providerCallCount === 0) logAskPreProvider503({
        creditReservationState: creditFinalState,
        error,
        idempotencyState: idempotency.operation.claimOutcome,
        providerCallAttempted: false,
        requestId,
      });
      turnLifecycle.fail(error.reason, true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, error.status, {}, error.reason);
    }
    if (error instanceof AiCreditLimitError) {
      turnLifecycle.credit("limit_reached").fail("plan_limit", false); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("AI_CREDITS_EXHAUSTED", "Your Ask plan allowance has been reached. Your saved information remains available.", 429, { usage }, "credit_limit");
    }
    if (error instanceof AiCreditLedgerError) {
      if (providerCallCount === 0) logAskPreProvider503({
        creditReservationState: creditFinalState,
        error,
        idempotencyState: idempotency.operation.claimOutcome,
        providerCallAttempted: false,
        requestId,
      });
      logAskServerError(error.stage, error, { conversationId: preparedRequest.conversationId, petId, requestId, userId }, 503);
      turnLifecycle.fail(error.stage, true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503);
    }
    const internalStage = error instanceof AskPipelineError ? error.stage : "primary_provider_failed";
    logAskServerError(internalStage, error, { conversationId: preparedRequest.conversationId, petId, requestId }, 503);
    if (error instanceof AskPipelineError && isProviderRateLimit(error)) {
      const retryAfterMs = error.diagnostics.retryAfterMs || 0;
      turnLifecycle.fail("provider_rate_limit", true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure(
        "AI_RATE_LIMITED",
        "Furvise is receiving a lot of questions right now. Your message is saved, and no AI credit was used. Try again in a moment.",
        429,
        { retryable: true, ...(retryAfterMs ? { retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } : {}) },
      );
    }
    if (providerCallCount === 0) logAskPreProvider503({
      creditReservationState: creditFinalState,
      error,
      idempotencyState: idempotency.operation.claimOutcome,
      providerCallAttempted: false,
      requestId,
    });
    turnLifecycle.fail(internalStage, true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
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
      await failAiAdmission(aiAdmission, new Error("ASK_RESPONSE_SERIALIZATION_FAILED"), aiAdmissionFinalized, requestId);
      aiAdmissionFinalized = Boolean(aiAdmission);
      logAskServerError("response_serialization", new Error("ASK_RESPONSE_SERIALIZATION_FAILED"), {
        conversationId: preparedRequest.conversationId,
        petId: turnPetId,
        requestId,
      }, 503);
      if (creditReserved) {
        try {
          await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
        } catch (settlementError) {
          if (rateGateRef.current) await rateGateRef.current.release();
          return handleAskApiError(settlementError, requestId);
        }
      }
      if (rateGateRef.current) await rateGateRef.current.release();
      return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503, {}, "response_serialization");
    }
    turnLifecycle.transition("ANSWER_VALIDATED");
    try {
      const persistedResponse = await persistAssistantAnswer({
        creditRequestId,
        creditReserved,
        contextUsed,
        handledWithoutAi: false,
        intelligenceResult,
        phase3Runtime,
        payloadHash: aiCreditPayloadHash,
        petId: turnPetId,
        preparedRequest,
        requestId,
        recentCareEntries: liveContext.careEntries,
        response: plannedResponse,
        sourceMessage: question,
        saveMetadata: buildAskSaveMetadata(plannedGate, { cannotAnswerFromSavedData: true, intent: "general_pet_question", question, usedSavedFactsCount: 0 }),
        safetyLevel: "normal",
        shoppingSuppressed: false,
        supabase,
        usage,
        userId,
        turnLifecycle,
      }).finally(async () => { if (rateGateRef.current) await rateGateRef.current.release(); });
      await finalizeAiAdmissionAfterPersistence({ admission: aiAdmission, alreadyFinalized: aiAdmissionFinalized, requestId, response: persistedResponse });
      return persistedResponse;
    } catch (error) {
      await failAiAdmission(aiAdmission, error, aiAdmissionFinalized, requestId);
      return handleAskApiError(error, requestId);
    }
  }
  let preparedApplicationActions: FurviseApplicationAction[] = [];
  if (deterministicApplicationActions.length) preparedApplicationActions = deterministicApplicationActions;
  if (reasoning) {
    try {
      preparedApplicationActions = prepareFurviseApplicationActions({
        proposals: reasoning.applicationActions,
        petId: turnPetId,
        petName: liveContext.pet.name || "your pet",
        requestId,
        lifecycleStatus: getPetLifecycleStatus(liveContext.pet),
      }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
    } catch (error) {
      const lossEvidence = classifyCurrentPetLoss(question) === "confirmed_current" ? question : null;
      const unavailableLossAction = buildUnavailableConfirmedLossAction({
        message: lossEvidence || question,
        petId: turnPetId,
        petName: liveContext.pet.name || "your pet",
        requestId,
      });
      if (unavailableLossAction) preparedApplicationActions = [{ ...unavailableLossAction, sourceMessageId: preparedRequest.userMessageId }];
      emitOperationalEvent({
        errorCode: "ASK_ACTION_PREPARATION_FAILED",
        eventType: "application_error",
        feature: "ask_application_action",
        metadata: { actionFailureClass: "optional", lifecycleActionUnavailable: Boolean(unavailableLossAction) },
        operationId: requestId,
        requestId,
        resourceId: turnPetId,
        route: "/api/ask",
        severity: "warning",
      });
      logAskServerError("application_action_preparation", error, {
        actionFailureClass: "optional",
        conversationId: preparedRequest.conversationId,
        petId: turnPetId,
        requestId,
      }, 200);
    }
  }
  if (pendingLifecycle && pendingLifecycleResolution?.kind === "continuation"
    && !preparedApplicationActions.some((action) => action.kind === pendingLifecycle.action.kind && action.petId === pendingLifecycle.petId)) {
    preparedApplicationActions = [pendingLifecycle.action, ...preparedApplicationActions].slice(0, 4);
  }
  let governedAnswer = enforceAnswerStateClaims(orchestration.answer);
  if (reasoning?.responseMode === "grief_support"
    && governedAnswer.summary === "I can help with that.") {
    governedAnswer = { ...governedAnswer, summary: buildGriefResponseFallback(liveContext.pet.name || "your pet") };
  }
  const conversationResponse = buildAskConversationResponse(governedAnswer, {
    intent: reasoning?.userIntent || orchestration.intent,
    clarificationQuestion: reasoning?.responseMode === "clarification"
      ? reasoning.suggestedFollowUps[0] || null
      : "clarificationQuestion" in orchestration ? orchestration.clarificationQuestion : null,
    missingUsefulDetails: [],
    suggestedQuestions: reasoning?.suggestedFollowUps || [],
    applicationActions: preparedApplicationActions,
    interactionMode: deterministicLossInteraction || reasoning?.responseMode === "grief_support" || pendingLifecycleResolution?.kind === "reassigned_death"
      ? "grief"
      : durableLifecycleCorrection || pendingLifecycleResolution?.kind === "contradiction" || pendingLifecycleResolution?.kind === "alternate_pet"
        ? "action_confirmation"
        : orchestration.intent === "casual" ? "casual" : undefined,
    recentlyResolved: reasoning?.intelligenceSafety.level === "recently_resolved",
    monitoring: safetyLevel === "monitor",
    urgent: safetyLevel === "urgent",
    usedContextSummary: contextUsed.usedSources,
  });
  if (!conversationResponse) {
    await failAiAdmission(aiAdmission, new Error("ASK_RESPONSE_SERIALIZATION_FAILED"), aiAdmissionFinalized, requestId);
    aiAdmissionFinalized = Boolean(aiAdmission);
    logAskServerError("response_serialization", new Error("ASK_RESPONSE_SERIALIZATION_FAILED"), {
      conversationId: preparedRequest.conversationId,
      petId: turnPetId,
      requestId,
    }, 503);
    if (creditReserved) {
      try {
        await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
      } catch (settlementError) {
        if (rateGateRef.current) await rateGateRef.current.release();
        return handleAskApiError(settlementError, requestId);
      }
    }
    if (rateGateRef.current) await rateGateRef.current.release();
    return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503, {}, "response_serialization");
  }
  turnLifecycle.transition("ANSWER_VALIDATED");

  try {
    const persistedResponse = await persistAssistantAnswer({
      concern: orchestration.concern,
      creditRequestId,
      creditReserved,
      contextUsed,
      handledWithoutAi: orchestration.handledWithoutAi,
      deferHighImpactLifecyclePersistence,
      historyReviewRequired: orchestration.intent === "new_observation"
        && classifyCurrentPetLoss(question) !== "confirmed_current"
        && !isExplicitCareHistorySaveRequest(question),
      intelligenceResult,
      phase3Runtime,
      payloadHash: aiCreditPayloadHash,
      preconfirmedCarePersistence: confirmedExistingCarePersistence,
      petId: turnPetId,
      preparedRequest,
      requestId,
      recentCareEntries: liveContext.careEntries,
      response: conversationResponse,
      sourceMessage: question,
      saveMetadata: buildAskSaveMetadata(conversationResponse, { intent: reasoning?.userIntent || orchestration.intent, question }),
      safetyLevel,
      shoppingSuppressed: reasoning ? reasoning.shoppingSuppressed : safetyLevel === "urgent",
      suggestion: orchestration.suggestion,
      supabase,
      usage,
      userId,
      turnLifecycle,
    }).finally(async () => { if (rateGateRef.current) await rateGateRef.current.release(); });
    await finalizeAiAdmissionAfterPersistence({ admission: aiAdmission, alreadyFinalized: aiAdmissionFinalized, requestId, response: persistedResponse });
    return persistedResponse;
  } catch (error) {
    await failAiAdmission(aiAdmission, error, aiAdmissionFinalized, requestId);
    return handleAskApiError(error, requestId);
  }
  });
}

function deriveAskTurnView({ currentSourceMessageId, liveContext, question, requestId }: {
  currentSourceMessageId: string;
  liveContext: FurviseLiveContext;
  question: string;
  requestId: string;
}) {
  const conversationMessages: ConversationMessage[] = liveContext.conversationTurns
    .filter((message) => message.id !== currentSourceMessageId)
    .map((message) => message.role === "user"
      ? { id: message.id, role: "user", text: message.text }
      : { id: message.id, role: "furvise", response: { directAnswer: message.text, applicationActions: message.applicationActions } });
  const entries = liveContext.careEntries;
  const recentUpdates = buildRecentAskUpdates(entries);
  const memories = liveContext.legacyPetMemories;
  const feedback = liveContext.productFeedback;
  const concerns = liveContext.activeConcerns;
  const recentlyResolvedConcerns = liveContext.recentlyResolvedConcerns;
  const safetyContext = evaluateAskSafetyContext({
    activeCareNotes: memories.map((memory) => memory.text),
    authoritativeActiveConcernTags: concerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title)),
    currentMessage: question,
    recentConversationTurns: conversationMessages.map((message) => ({
      role: message.role,
      text: message.role === "user" ? message.text : message.response?.directAnswer || message.response?.summary || "",
      ...(message.role === "furvise" ? { applicationActions: message.response?.applicationActions } : {}),
    })),
    recentlyResolvedConcernTags: /\b(breath|tired|energy|symptom|normal|fine|good|worse|returned|again)\b/i.test(question)
      ? recentlyResolvedConcerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title))
      : [],
    recentUpdates,
  });
  const canonicalActiveConcernTags = concerns.flatMap((concern) => concernKeyToAskTags(concern.normalized_key, concern.title));
  const memoryContexts = [liveContext.pet].map((profile) => {
    const memory = buildPetMemoryContext({
      careEntries: entries.filter((entry) => entry.pet_profile_id === profile.id),
      productFeedback: feedback.filter((item) => item.dog_profile_id === profile.id),
      profile,
      savedMemories: memories.filter((savedMemory) => savedMemory.dog_profile_id === profile.id),
    });
    return { ...memory, derived: { ...memory.derived, safetyFlags: safetyContext.activeConcernTags.map(formatConcernTag) } };
  });
  logAskStage("context loaded", {
    activeConcerns: concerns.map((concern) => ({ id: concern.id, status: concern.status })),
    activeConcernTags: safetyContext.activeConcernTags,
    canonicalActiveConcernTags,
    messageDerivedSafetyTags: safetyContext.activeConcernTags.filter((tag) => !canonicalActiveConcernTags.includes(tag)),
    categories: [...new Set(recentUpdates.map((update) => update.category))],
    latestUpdateTimestamp: recentUpdates[0]?.occurredAt || null,
    petId: liveContext.pet.id,
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
  return {
    concerns,
    contextUsed: { petName: memoryContexts[0]?.pet.name || null, usedSources: buildUsedContextSummary(memoryContexts, entries, memories) },
    conversationMessages,
    entries,
    feedback,
    memories,
    recentlyResolvedConcerns,
    recentUpdates,
  };
}

function buildTurnGenerationInput({ authoritativePetIds, locale, liveContext, onProviderEvent, question, requestId, turnSemanticFrame, turnView }: {
  authoritativePetIds: string[];
  locale: string;
  liveContext: FurviseLiveContext;
  onProviderEvent: (event: AskProviderEvent) => void;
  question: string;
  requestId: string;
  turnSemanticFrame?: ProposedSemanticFrame;
  turnView: ReturnType<typeof deriveAskTurnView>;
}) {
  return {
    careEntries: turnView.entries,
    concerns: turnView.concerns,
    conversationTurns: turnView.conversationMessages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.role === "user" ? message.text : message.response?.directAnswer || message.response?.summary || "",
    })),
    locale,
    memories: turnView.memories,
    productFeedback: turnView.feedback,
    profiles: liveContext.eligiblePets.filter((pet) => authoritativePetIds.includes(pet.id)),
    question,
    recentlyResolvedConcerns: turnView.recentlyResolvedConcerns,
    recentUpdates: turnView.recentUpdates,
    requestId,
    turnSemanticFrame,
    onProviderEvent,
  };
}

function buildSubjectClarificationOrchestration(message: string, candidateNames: string[] = []) {
  const safety = evaluateAskSafetyContext({
    activeCareNotes: [],
    currentMessage: message,
    recentConversationTurns: [],
    recentlyResolvedConcernTags: [],
    recentUpdates: [],
  });
  const urgent = safety.safetyLevel === "urgent";
  const clarificationQuestion = buildFurviseClarification(candidateNames);
  return {
    aiResult: null,
    answer: {
      title: urgent ? "Urgent guidance while we identify the pet" : clarificationQuestion,
      summary: urgent
        ? "If the pet is in immediate distress, seems weak, collapses, or is having trouble breathing, contact a veterinarian or emergency clinic now. Which pet is this about? I will not use a pet's history or save the update until the subject is clear."
        : "Before I use pet-specific history or save anything, I need to know which pet or animal you mean.",
      sections: [],
      safetyNote: null,
    },
    concern: null,
    clarificationQuestion,
    handledWithoutAi: false,
    intent: "unknown" as const,
    safetyLevel: urgent ? "urgent" as const : "normal" as const,
    suggestion: null,
  };
}

function buildPendingLifecycleOrchestration(
  assertion: PendingLifecycleAssertion,
  resolution: PendingLifecycleTurnResolution,
) {
  const reportedState = assertion.kind === "reported_deceased" ? "died" : "should be archived";
  const pendingReport = assertion.kind === "reported_deceased"
    ? `the pending report that ${assertion.petName} died`
    : `the pending request to archive ${assertion.petName}`;
  if (resolution.kind === "correction") {
    return deterministicLifecycleOrchestration(
      "Correction noted",
      `Thanks for correcting that. ${capitalize(pendingReport)} was cleared. ${assertion.petName}'s profile, history, and memories were not changed by that report.`,
      "correction",
    );
  }
  if (resolution.kind === "reassigned_death") {
    return deterministicLifecycleOrchestration(
      "I'm sorry for your loss",
      `I'm so sorry. I cleared ${pendingReport} and prepared a separate confirmation for ${resolution.petName}. Nothing was added to either pet's durable history or memory yet.`,
      "correction",
    );
  }
  if (resolution.kind === "alternate_pet") {
    return deterministicLifecycleOrchestration(
      `Let's clarify which pet you mean`,
      `I understand that you mean ${resolution.petName}. The report that ${assertion.petName} ${reportedState} is still awaiting confirmation. Please ask the care question again with ${resolution.petName}'s name so I don't mix their histories.`,
      "unknown",
    );
  }
  return deterministicLifecycleOrchestration(
    "Let's clarify before continuing",
    `You just told me ${assertion.petName} ${reportedState}, and that report is still awaiting confirmation. Are you asking about another pet, or correcting what you said about ${assertion.petName}?`,
    "unknown",
  );
}

function buildConfirmedLossOrchestration(petName: string, alreadyConfirmed: boolean) {
  const pet = cleanLifecyclePetName(petName);
  return deterministicLifecycleOrchestration(
    "I'm sorry for your loss",
    alreadyConfirmed
      ? `I'm so sorry. ${pet} is already marked as passed away, and ${pet}'s history remains available in Furvise.`
      : buildGriefResponseFallback(pet),
    "status_update",
  );
}

function buildConfirmedLossClarificationOrchestration(candidateNames: string[]) {
  const candidates = candidateNames.length ? ` Was this ${formatPetChoiceList(candidateNames)}?` : " Which saved pet do you mean?";
  return deterministicLifecycleOrchestration(
    "I'm sorry. Which pet passed away?",
    `I don't want to attach this loss to the wrong profile.${candidates} Nothing has been changed or added to history yet.`,
    "unknown",
  );
}

function buildExternalLossOrchestration() {
  return deterministicLifecycleOrchestration(
    "I'm sorry for your loss",
    "I'm so sorry. I won't change any saved pet profile because you described an animal outside your Furvise pets. Nothing was added to a profile, history, or memory.",
    "status_update",
  );
}

function formatPetChoiceList(names: string[]) {
  const clean = [...new Set(names.map(cleanLifecyclePetName))];
  if (clean.length <= 1) return clean[0] || "one of your saved pets";
  if (clean.length === 2) return `${clean[0]} or ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, or ${clean.at(-1)}`;
}

function cleanLifecyclePetName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "your pet";
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function deterministicLifecycleOrchestration(title: string, summary: string, intent: "unknown" | "correction" | "status_update") {
  return {
    aiResult: null,
    answer: { title, summary, sections: [], safetyNote: null },
    concern: null,
    handledWithoutAi: true,
    intent,
    safetyLevel: "normal" as const,
    suggestion: null,
  };
}

function buildDurableLifecycleContradictionOrchestration(petName: string, status: "deceased" | "archived") {
  const state = status === "deceased" ? "marked as passed away" : "archived";
  return deterministicLifecycleOrchestration(
    "Let's clarify which pet you mean",
    `${petName}'s profile is ${state}, so I won't give active-care advice for ${petName}. Are you asking about another pet, or do you need to correct ${petName}'s lifecycle state?`,
    "unknown",
  );
}

function buildDurableLifecycleCorrectionOrchestration(petName: string, status: "deceased" | "archived") {
  const state = status === "deceased" ? "marked as passed away" : "archived";
  return deterministicLifecycleOrchestration(
    "Review the profile correction",
    `${petName}'s profile is currently ${state}. You can review marking ${petName} as active below. Nothing has changed yet, and earlier history will remain available.`,
    "correction",
  );
}

function cancelledPendingLifecycleAction(action: FurviseApplicationAction): FurviseApplicationAction {
  return {
    ...action,
    status: "cancelled",
    resultMessage: "The unconfirmed lifecycle report was cleared. The saved profile was not changed.",
    errorMessage: null,
  };
}

function buildAlreadyPersistedOrchestration(petName: string) {
  return {
    aiResult: null,
    answer: { title: "Already in history", summary: `Yes, that improvement is already in ${petName}'s history.`, sections: [], safetyNote: null },
    concern: null,
    handledWithoutAi: true,
    intent: "status_update" as const,
    safetyLevel: "monitor" as const,
    suggestion: null,
  };
}

function enforceAnswerStateClaims(answer: { title: string; summary: string; sections: { heading: string; items: string[] }[]; safetyNote: string | null }) {
  return {
    ...answer,
    title: enforceVerifiedStateClaims(answer.title, false),
    summary: enforceVerifiedStateClaims(answer.summary, false),
    sections: answer.sections.map((section) => ({
      heading: enforceVerifiedStateClaims(section.heading, false),
      items: section.items.map((item) => enforceVerifiedStateClaims(item, false)),
    })),
    safetyNote: answer.safetyNote ? enforceVerifiedStateClaims(answer.safetyNote, false) : null,
  };
}

function logValidatedIntelligence(result: FurviseIntelligenceResult, requestId: string) {
  logAskStage("intelligence validated", {
    acceptedCareActions: result.acceptedCareActions.length,
    acceptedLearnings: result.acceptedLearnings.length,
    rejectedCareActions: result.rejectedCareActionCount,
    rejectedLearnings: result.rejectedLearningCount,
    requestId,
    safetyLevel: result.reasoning.intelligenceSafety.level,
    proposedActionCount: result.reasoning.careActions.length + result.reasoning.learnings.length,
    acceptedActionCount: result.acceptedCareActions.length + result.acceptedLearnings.length,
    rejectedActionCount: result.rejectedCareActionCount + result.rejectedLearningCount,
    deterministicRepairsApplied: result.answerValidation.repairs,
    qualityWarnings: result.answerValidation.qualityWarnings,
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
  response_data: (CompletedAskResponse & { turn?: AskTurnTrace }) | null;
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
  creditRequestId,
  creditReserved,
  contextUsed,
  deferHighImpactLifecyclePersistence = false,
  handledWithoutAi,
  historyReviewRequired = false,
  intelligenceResult = null,
  phase3Runtime,
  payloadHash,
  preconfirmedCarePersistence = null,
  petId,
  preparedRequest,
  requestId,
  recentCareEntries,
  response,
  sourceMessage,
  saveMetadata,
  safetyLevel,
  shoppingSuppressed,
  suggestion = null,
  supabase,
  urgent,
  usage,
  userId,
  turnLifecycle,
}: {
  concern?: PetConcern | null;
  creditRequestId: string;
  creditReserved: boolean;
  contextUsed: unknown;
  handledWithoutAi: boolean;
  deferHighImpactLifecyclePersistence?: boolean;
  historyReviewRequired?: boolean;
  intelligenceResult?: FurviseIntelligenceResult | null;
  phase3Runtime: AskV2Phase3Runtime | null;
  payloadHash: string;
  preconfirmedCarePersistence?: CarePersistenceResult | null;
  petId: string;
  preparedRequest: PreparedAskRequest;
  requestId: string;
  recentCareEntries: FurviseLiveContext["careEntries"];
  response: CompletedAskResponse;
  sourceMessage: string;
  saveMetadata: unknown;
  safetyLevel?: "normal" | "monitor" | "urgent";
  shoppingSuppressed?: boolean;
  suggestion?: PendingUpdateSuggestion | null;
  supabase: SupabaseClient;
  urgent?: boolean;
  usage: AiCreditStatus;
  userId: string;
  turnLifecycle: AskTurnLifecycle;
}) {
  const { conversationId, userMessageId } = preparedRequest;
  const responseWithTurn = { ...response, turn: turnLifecycle.snapshot() };
  const optionalFailure = (component: AskSubsystem, error: unknown) => {
    turnLifecycle.optionalFailure(component);
    logAskServerError(`optional_${component}`, error, { conversationId, petId, requestId }, 200);
  };
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
    const released = creditReserved
      ? await safeReleaseAiCredit({ logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId })
      : false;
    turnLifecycle.credit(creditReserved ? released ? "released" : "release_pending" : "not_required");
    if (creditReserved) turnLifecycle.settlement("release", released ? "reconciled" : "pending");
    turnLifecycle.fail("assistant_persistence", true);
    emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
    return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "persist_assistant_message");
  }

  let { data: assistantMessage, error: messageError } = await supabase
    .from("ask_conversation_messages")
    .insert({
      context_used: contextUsed,
      conversation_id: conversationId,
      request_id: requestId,
      response_data: responseWithTurn,
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
      if (creditReserved) {
        await setAiCreditDisposition({
          disposition: "complete",
          feature: "ask",
          logicalRequestId: requestId,
          payloadHash,
          requestId: creditRequestId,
          userId,
        });
        turnLifecycle.credit("completion_pending").settlement("complete", "pending");
      }
      const replayUsage = await reconcilePersistedAskCredit({ logicalRequestId: requestId, payloadHash, supabase, usage, userId });
      return completedResponseFromPersisted(existing, replayUsage);
    }
    logAskServerError("persistence_failed", messageError, { conversationId, requestId }, 200);
    const retryResult = await supabase
      .from("ask_conversation_messages")
      .insert({
        context_used: contextUsed,
        conversation_id: conversationId,
        request_id: requestId,
        response_data: responseWithTurn,
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
      const released = creditReserved
        ? await safeReleaseAiCredit({ logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId })
        : false;
      turnLifecycle.credit(creditReserved ? released ? "released" : "release_pending" : "not_required");
      if (creditReserved) turnLifecycle.settlement("release", released ? "reconciled" : "pending");
      turnLifecycle.fail("assistant_persistence", true);
      emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "persistence_failed");
    }
    logAskStage("assistant message persisted after idempotent retry", { requestId });
  }
  logAskStage("assistant message persisted", { requestId });
  turnLifecycle.transition("ANSWER_PERSISTED");

  let nextUsage = usage;
  let creditsUsed = 0;
  if (creditReserved) {
    await setAiCreditDisposition({
      disposition: "complete",
      feature: "ask",
      logicalRequestId: requestId,
      payloadHash,
      requestId: creditRequestId,
      userId,
    });
    creditsUsed = 1;
    turnLifecycle.settlement("complete", "pending");
    try {
      try {
        await completeAiCredit({ feature: "ask", logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId });
      } catch {
        await completeAiCredit({ feature: "ask", logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId });
      }
      turnLifecycle.credit("completed").settlement("complete", "reconciled");
      logAskStage("AI credit completed", { creditFinalState: "completed", creditReservationId: creditRequestId, requestId });
    } catch (error) {
      if (isAiCreditIntegrityError(error)) throw error;
      turnLifecycle.credit("completion_pending").settlement("complete", "pending");
      optionalFailure("credit_completion", error);
    }
    nextUsage = await runOptionalAskSubsystem({
      component: "conversation_metadata",
      fallback: usage,
      operation: () => getRemainingAiCredits({ feature: "ask", monthlyAiCredits: usage.limit, planId: usage.planId, supabase, userId }),
      onFailure: optionalFailure,
    });
  }

  await runOptionalAskSubsystem({
    component: "conversation_metadata",
    fallback: null,
    operation: async () => {
      const { error } = await supabase.from("ask_conversations")
        .update({ last_activity_at: new Date().toISOString(), preview: response.directAnswer.slice(0, 220) })
        .eq("id", conversationId).eq("user_id", userId);
      if (error) throw error;
      return null;
    },
    onFailure: optionalFailure,
  });

  let intelligencePersistence: IntelligencePersistenceSummary | null = null;
  let intelligencePersistenceWarning = "";
  let semanticTrace = intelligenceResult?.semanticTrace || null;
  const reviewableSemanticEvent = deferHighImpactLifecyclePersistence ? null
    : intelligenceResult?.acceptedSemanticEvents.find((item) => item.destinations.some((destination) => destination === "care_event" || destination === "episode_current_state" || destination === "state_only")) || null;
  if (!deferHighImpactLifecyclePersistence && intelligenceResult && (intelligenceResult.acceptedLearnings.length || intelligenceResult.acceptedCareActions.length || intelligenceResult.acceptedSemanticEvents.length)) {
    try {
      intelligencePersistence = await persistIntelligenceLearnings({
        careActions: historyReviewRequired ? [] : intelligenceResult.acceptedCareActions,
        semanticEvents: historyReviewRequired ? [] : intelligenceResult.acceptedSemanticEvents,
        learnings: intelligenceResult.acceptedLearnings,
        petId,
        recentCareEntries,
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
      turnLifecycle.optionalFailure("memory_persistence");
      turnLifecycle.optionalFailure("history_persistence");
      logAskServerError("learning_persistence_failed", error, { conversationId, petId, requestId }, 200);
      if (semanticTrace) semanticTrace = withSemanticPersistenceOutcome(semanticTrace, { status: "failed", errorCode: "INTELLIGENCE_PERSISTENCE_EXCEPTION", careEntryCount: 0, memoryCount: 0 });
    }
  }
  if (semanticTrace && !intelligencePersistence && !intelligencePersistenceWarning) {
    semanticTrace = withSemanticPersistenceOutcome(semanticTrace, { status: "skipped", errorCode: null, careEntryCount: 0, memoryCount: 0 });
  }
  if (semanticTrace) logSemanticTrace(semanticTrace);

  let applicationActions = parseStoredApplicationActions((response as { applicationActions?: unknown }).applicationActions);
  let applicationStateChanged = false;
  if (applicationActions.length) {
    const executed: FurviseApplicationAction[] = [];
    for (const action of applicationActions) {
      if (!shouldAutoExecuteAction(action)) {
        executed.push(action);
        continue;
      }
      const execution = await runOptionalAskSubsystem({
        component: "application_action_preparation",
        fallback: null,
        operation: () => executeFurviseApplicationAction({ action, confirmed: false, sourceMessageId: userMessageId, supabase, userId }),
        onFailure: optionalFailure,
      });
      if (!execution) { executed.push({ ...action, status: "failed", errorMessage: "That action could not be prepared. Your answer is still available." }); continue; }
      applicationStateChanged ||= execution.changed;
      executed.push(execution.action);
      emitOperationalEvent({
        actorId: userId,
        errorCode: execution.audit.outcome === "failed" ? "ASK_ACTION_FAILED" : undefined,
        eventType: execution.audit.outcome === "failed" ? "application_error" : "application_action",
        feature: "ask_application_action",
        metadata: { actionKind: execution.audit.actionKind, authorization: execution.audit.authorization, outcome: execution.audit.outcome },
        operationId: action.id,
        requestId,
        resourceId: petId,
        route: "/api/ask",
        severity: execution.audit.outcome === "failed" ? "warning" : "info",
      });
    }
    applicationActions = executed;
  }

  if (!deferHighImpactLifecyclePersistence && phase3Runtime) {
    await runOptionalAskSubsystem({
      component: "semantic_persistence",
      fallback: undefined,
      operation: () => persistAskV2Phase3LowRisk({
        runtime: phase3Runtime!, turn: intelligenceResult?.v2GovernedTurn || null,
        legacyLearnings: intelligenceResult?.acceptedLearnings || [], legacyPersistence: intelligencePersistence,
        requestId, selectedPetId: petId, sourceMessage, verifiedUserId: userId,
      }),
      onFailure: optionalFailure,
    });
  }

  const confirmedCarePersistence = preconfirmedCarePersistence || intelligencePersistence?.carePersistence || null;
  const automaticCareAction = confirmedCarePersistence?.status === "persisted"
    && confirmedCarePersistence.careEntryIds.length > 0;
  const automaticCareFailure = intelligencePersistence?.carePersistence.status === "failed";
  const semanticReviewSuggestion = reviewableSemanticEvent ? buildSemanticEventReviewSuggestion({ event: reviewableSemanticEvent }) : null;
  const reviewSuggestion = !automaticCareAction
    ? (historyReviewRequired || automaticCareFailure) && semanticReviewSuggestion
      ? semanticReviewSuggestion
      : suggestion || semanticReviewSuggestion
    : null;
  const suggestionPersistence = reviewSuggestion
    ? await runOptionalAskSubsystem({
      component: "history_proposal",
      fallback: { careEntryId: null, concernId: null, effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_UNAVAILABLE", suggestion: null },
      operation: () => persistPendingSuggestion({ assistantMessageId: assistantMessage.id, conversationId, petId, suggestion: reviewSuggestion, supabase, userId }),
      onFailure: optionalFailure,
    })
    : { careEntryId: null, concernId: null, effectAlreadyPresent: false, errorCode: null, suggestion: null };
  const savedSuggestion = suggestionPersistence.suggestion;
  const persistenceMode = automaticCareAction ? "automatic" : savedSuggestion ? "suggested" : "none";
  const carePersistence = resolveAutomaticCareHistoryPresentation({
    confirmedPersistence: confirmedCarePersistence,
    hasSavedSuggestion: Boolean(savedSuggestion),
    memoryIds: intelligencePersistence?.memoryIds || [],
  });
  const reconciledResponse = reconcileResponsePersistenceCopy(response, persistenceMode, automaticCareFailure || Boolean(savedSuggestion));
  turnLifecycle.actions(applicationActions.length);
  turnLifecycle.transition("COMPLETED");
  const canonicalResponse = {
    ...(applicationActions.length ? { ...reconciledResponse, applicationActions } : reconciledResponse),
    turn: turnLifecycle.snapshot(),
  };
  await runOptionalAskSubsystem({
    component: "conversation_metadata",
    fallback: null,
    operation: async () => {
      const { error } = await supabase.from("ask_conversation_messages")
        .update({ care_persistence: carePersistence, response_data: canonicalResponse }).eq("id", assistantMessage.id).eq("user_id", userId);
      if (error) throw error;
      return null;
    },
    onFailure: optionalFailure,
  });
  if (didPersistEffectiveState(intelligencePersistence, carePersistence)) {
    revalidateAskStateViews([
      petId,
      ...(intelligenceResult?.acceptedLearnings.flatMap((learning) => learning.subjectType === "pet" && learning.subjectId ? [learning.subjectId] : []) || []),
    ]);
  }
  if (applicationStateChanged) revalidateAskStateViews([petId]);
  emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
  return successfulAnswerResponse({
    assistantMessageId: assistantMessage.id,
    applicationStateChanged,
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
    turn: turnLifecycle.snapshot(),
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
  errorCode: string | null;
  suggestion: (PendingUpdateSuggestion & { id: string }) | null;
}> {
  if (suggestion.type === "concern_resolution" && suggestion.concernId) {
    const { data: pendingForConcern } = await supabase.from("ai_update_suggestions").select("id")
      .eq("user_id", userId).eq("type", suggestion.type).eq("concern_id", suggestion.concernId).eq("status", "pending")
      .limit(1).maybeSingle<{ id: string }>();
    if (pendingForConcern) return { effectAlreadyPresent: false, errorCode: null, suggestion: null };
  }
  const semanticTopic = textPayloadValue(suggestion.payload.semanticTopic);
  const semanticDomain = textPayloadValue(suggestion.payload.semanticDomain);
  const semanticTransition = textPayloadValue(suggestion.payload.semanticTransition);
  if (suggestion.type === "history" && semanticTopic && semanticDomain
    && ["improved", "resolved", "corrected"].includes(semanticTransition || "")) {
    const { data: prior, error: priorError } = await supabase.from("ai_update_suggestions")
      .select("id,title,details,payload").eq("user_id", userId).eq("pet_profile_id", petId).eq("conversation_id", conversationId)
      .eq("type", "history").eq("status", "pending")
      .contains("payload", { semanticDomain, semanticTopic })
      .order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string; title: string; details: string | null; payload: Record<string, unknown> }>();
    if (priorError) logAskServerError("suggestion_reconciliation_lookup", priorError, { conversationId, requestId: assistantMessageId }, 200);
    if (prior) {
      const { error: updateError } = await supabase.from("ai_update_suggestions").update({
        details: suggestion.details || null,
        payload: suggestion.payload,
        source_message_id: assistantMessageId,
        title: suggestion.title,
      }).eq("id", prior.id).eq("user_id", userId).eq("status", "pending");
      if (updateError) {
        logAskServerError("suggestion_reconciliation_update", updateError, { conversationId, requestId: assistantMessageId }, 200);
        return { effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_RECONCILIATION_FAILED", suggestion: {
          ...suggestion, id: prior.id, title: prior.title, details: prior.details || undefined, payload: prior.payload,
        } };
      }
      return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: prior.id } };
    }
  }
  let existingQuery = supabase.from("ai_update_suggestions")
    .select("id").eq("user_id", userId).eq("source_message_id", assistantMessageId).eq("type", suggestion.type)
    .eq("status", "pending");
  existingQuery = suggestion.concernId ? existingQuery.eq("concern_id", suggestion.concernId) : existingQuery.is("concern_id", null);
  const { data: existing } = await existingQuery.maybeSingle<{ id: string }>();
  if (existing) return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: existing.id } };
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
      if (duplicate) return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: duplicate.id } };
    }
    return { effectAlreadyPresent: false, errorCode: "HISTORY_SUGGESTION_PERSISTENCE_FAILED", suggestion: null };
  }
  return { effectAlreadyPresent: false, errorCode: null, suggestion: { ...suggestion, id: data.id } };
}

async function safeReleaseAiCredit({
  logicalRequestId,
  payloadHash,
  requestId,
  userId,
}: {
  logicalRequestId: string;
  payloadHash: string;
  requestId: string;
  userId: string;
}) {
  await setAiCreditDisposition({
    disposition: "release",
    feature: "ask",
    logicalRequestId,
    payloadHash,
    requestId,
    userId,
  });
  try {
    await reconcileAiCredit({ feature: "ask", logicalRequestId, payloadHash, requestId, userId });
    logAskStage("AI credit released", { requestId });
    return true;
  } catch (error) {
    if (isAiCreditIntegrityError(error)) throw error;
    logAskServerError("credit_release_failed", error, { requestId }, 200);
    return false;
  }
}

async function reconcilePersistedAskCredit({
  logicalRequestId,
  payloadHash,
  supabase,
  usage,
  userId,
}: {
  logicalRequestId: string;
  payloadHash: string;
  supabase: SupabaseClient;
  usage: AiCreditStatus;
  userId: string;
}) {
  if (usage.ledgerMode === "development_missing_migration") return usage;
  const states = await getAiCreditEventsForLogicalRequest({ feature: "ask", logicalRequestId, payloadHash, supabase, userId });
  if (states.some((state) => state.disposition === null)) {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_DISPOSITION_REQUIRED"), "ai_usage_events", "select");
  }
  if (states.filter((state) => state.disposition === "complete").length > 1) {
    throw new AiCreditLedgerError("reconciliation_failed", new Error("AI_CREDIT_DISPOSITION_CONFLICT"), "ai_usage_events", "select");
  }
  try {
    for (const state of states) {
      if (state.status !== "reserved") continue;
      await reconcileAiCredit({
        feature: "ask",
        logicalRequestId,
        payloadHash,
        requestId: state.requestId,
        userId,
      });
    }
    return await getRemainingAiCredits({ feature: "ask", monthlyAiCredits: usage.limit, planId: usage.planId, supabase, userId });
  } catch (error) {
    if (isAiCreditIntegrityError(error)) throw error;
    // Terminal RPC execution may degrade only after every attempt has durable,
    // compatible disposition. Identity and missing-disposition checks happen
    // above and remain answer-critical.
    logAskServerError("optional_credit_reconciliation", error, { requestId: logicalRequestId }, 200);
    return usage;
  }
}

function successfulAnswerResponse({
  assistantMessageId = "",
  applicationStateChanged = false,
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
  turn = null,
  userMessageId,
}: {
  assistantMessageId?: string;
  applicationStateChanged?: boolean;
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
  turn?: AskTurnTrace | null;
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
    dataChanged: applicationStateChanged || didPersistEffectiveState(intelligencePersistence, carePersistence),
    automaticSaveConfirmation: carePersistence.status === "persisted" && carePersistence.careEntryIds.length > 0 ? "Added to care history" : persistedLearningConfirmation(intelligencePersistence),
    carePersistence,
    intelligencePersistence: {
      saved: !intelligencePersistenceWarning && intelligencePersistence?.carePersistence.status !== "failed",
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
    turn,
    userMessageId,
    usage,
  });
}

function standaloneEmergencyResponse({
  contextUsed,
  requestId,
  response,
  turn,
}: {
  contextUsed: unknown;
  requestId: string;
  response: CompletedAskResponse;
  turn: AskTurnTrace;
}) {
  logAskStage("standalone emergency response serialized", { requestId });
  return Response.json({
    answer: response.directAnswer,
    concern: null,
    contextUsed,
    creditsUsed: 0,
    handledWithoutAi: true,
    dataChanged: false,
    carePersistence: { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false },
    persistence: { saved: false, warning: "Emergency guidance was not saved to history." },
    persistenceMode: "none",
    proposedHistoryUpdate: null,
    response,
    safety: { level: "urgent", shoppingSuppressed: true },
    saveMetadata: { answerType: "urgent_guidance", persistenceEligible: false, reason: "deterministic_emergency_preflight" },
    success: true,
    turn,
  });
}

function didPersistEffectiveState(intelligencePersistence: IntelligencePersistenceSummary | null, carePersistence: CarePersistenceResult) {
  return Boolean(
    intelligencePersistence?.memoriesCreated
    || intelligencePersistence?.memoriesSuperseded
    || intelligencePersistence?.memoryIds.length
    || intelligencePersistence?.concernsResolved
    || carePersistence.status === "persisted" && (carePersistence.careEntryIds.length || carePersistence.concernIds.length)
  );
}

function revalidateAskStateViews(petIds: string[]) {
  for (const path of ["/dashboard", "/today", "/pets", "/care-log"]) revalidatePath(path);
  for (const petId of new Set(petIds.filter(Boolean))) {
    revalidatePath(`/pets/${petId}`);
    revalidatePath(`/pets/${petId}/care`);
    revalidatePath(`/pets/${petId}/memories`);
    revalidatePath(`/dogs/${petId}/care`);
    revalidatePath(`/dogs/${petId}/memories`);
  }
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

function assertPersistedReplayIdentity({
  conversationId,
  question,
  state,
}: {
  conversationId: string;
  question: string;
  state: PersistedRequestState;
}) {
  if (state.userMessage.user_text !== question || (conversationId && state.conversationId !== conversationId)) {
    throw new AskApiError(
      "IDEMPOTENCY_CONFLICT",
      "This question could not be reused because its details changed.",
      409,
      "idempotency_conflict",
    );
  }
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
    turn: response.turn || null,
  });
}

async function deleteEmptyConversation(supabase: SupabaseClient, conversationId: string, userId: string) {
  await supabase.from("ask_conversations").delete().eq("id", conversationId).eq("user_id", userId);
}

function askFailure(code: InternalAskFailureCode, message: string, status: number, extra: Record<string, unknown> = {}, debugStage = "") {
  void debugStage;
  return Response.json({
    code: publicAskFailureCode(internalFailureClass(code)),
    message,
    success: false,
    ...extra,
  }, { status });
}

function internalFailureClass(code: InternalAskFailureCode): AskInternalFailure {
  if (code === "AUTH_REQUIRED") return "auth_required";
  if (code === "PET_NOT_FOUND") return "pet_unavailable";
  if (code === "INVALID_MESSAGE") return "invalid_input";
  if (code === "AI_CREDITS_EXHAUSTED") return "plan_limit";
  if (code === "RATE_LIMITED") return "rate_limit";
  if (code === "REQUEST_IN_PROGRESS") return "request_in_progress";
  if (code === "AI_RATE_LIMITED" || code === "AI_UNAVAILABLE") return "provider_failure";
  if (code === "DATABASE_ERROR") return "database_failure";
  return "answer_retryable";
}

async function canonicalizeAskInfrastructureResponse(response: Response) {
  if (response.ok) return response;
  const payload = await response.clone().json().catch(() => null) as { code?: string; error?: string; message?: string; retryAfterSeconds?: number } | null;
  if (payload?.code === "REQUEST_IN_PROGRESS") {
    return Response.json({
      code: publicAskFailureCode("request_in_progress"),
      message: payload.error || payload.message || "Furvise is still working on this question.",
      retryAfterSeconds: payload.retryAfterSeconds,
      success: false,
    }, { status: response.status });
  }
  return askFailure("IDEMPOTENCY_CONFLICT", payload?.error || payload?.message || "This question can be retried safely.", response.status, payload?.retryAfterSeconds ? { retryAfterSeconds: payload.retryAfterSeconds } : {}, "idempotency");
}

function handleAskApiError(error: unknown, requestId: string) {
  if (error instanceof AskApiError) {
    logAskServerError(error.stage, error.databaseError || error, { requestId }, error.status);
    return askFailure(error.code, error.message, error.status, {}, error.stage);
  }
  if (error instanceof AiCreditLedgerError) {
    const diagnostic = getAiCreditLedgerDiagnostic(error);
    const detail = `${diagnostic.message} ${diagnostic.details} ${diagnostic.hint}`;
    if (/AI_REQUEST_IDENTITY_CONFLICT/.test(detail)) {
      logAskServerError("idempotency_conflict", error, { requestId }, 409);
      return askFailure("IDEMPOTENCY_CONFLICT", "This question could not be reused because its details changed.", 409, {}, "idempotency_conflict");
    }
    logAskServerError(error.stage, error, { requestId }, 503);
    return askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, error.stage);
  }
  logAskServerError("unknown", error, { requestId }, 500);
  return askFailure("UNKNOWN_ERROR", "Furvise could not finish that answer. Please try again.", 500, {}, "unknown");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function failAiAdmission(
  admission: AiOperationAdmission | null,
  error: unknown,
  alreadyFinalized: boolean,
  requestId: string,
) {
  if (!admission || alreadyFinalized) return;
  try {
    await admission.fail(error);
  } catch (admissionError) {
    logAskServerError("ai_operation_failure_recording", admissionError, { requestId }, 200);
  }
}

async function finalizeAiAdmissionAfterPersistence({
  admission,
  alreadyFinalized,
  requestId,
  response,
}: {
  admission: AiOperationAdmission | null;
  alreadyFinalized: boolean;
  requestId: string;
  response: Response;
}) {
  if (!admission || alreadyFinalized) return;
  if (!response.ok) {
    await failAiAdmission(admission, new Error("ASK_ANSWER_NOT_PERSISTED"), false, requestId);
    return;
  }
  try {
    await admission.complete();
  } catch (error) {
    // The answer is already durable. A guard bookkeeping failure must not replace it.
    logAskServerError("ai_operation_completion", error, { requestId }, 200);
  }
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

function emitAskTurnTrace(trace: AskTurnTrace, userId: string, petId: string) {
  emitOperationalEvent({
    actorId: userId,
    eventType: "ask_turn",
    feature: "ask",
    metadata: {
      actionCount: trace.actionCount,
      candidateCount: trace.subjectCandidateCount,
      creditDisposition: trace.creditDisposition,
      creditState: trace.creditState,
      executionMode: trace.executionMode,
      finalErrorClass: trace.finalErrorClass,
      finalOutcome: trace.finalStage === "COMPLETED" ? "success" : trace.finalStage,
      finalStage: trace.finalStage,
      optionalFailureCount: trace.optionalFailures.length,
      optionalFailures: trace.optionalFailures.join("|"),
      providerCallCount: trace.providerCallCount,
      providerFailureClass: trace.providerFailureClass,
      routeType: trace.routeType,
      settlementState: trace.settlementState,
      subjectResolutionStrategy: trace.subjectResolutionStrategy,
    },
    operationId: trace.attemptId,
    requestId: trace.logicalTurnId,
    resourceId: petId,
    route: "/api/ask",
    severity: trace.finalErrorClass ? "warning" : "info",
  });
}

function reportOptionalContextRecovery(context: FurviseLiveContext, requestId: string) {
  if (!context.contextRecovery.unavailableSources.length) return;
  emitOperationalEvent({
    errorCode: "ASK_OPTIONAL_CONTEXT_UNAVAILABLE",
    eventType: "application_error",
    feature: "ask_context",
    metadata: { unavailableSources: context.contextRecovery.unavailableSources },
    operationId: requestId,
    requestId,
    route: "/api/ask",
    severity: "warning",
  });
}

function recordContextRecoveryOnTurn(context: FurviseLiveContext, turn: AskTurnLifecycle) {
  for (const source of context.contextRecovery.unavailableSources) {
    if (/care|concern|episode/.test(source)) turn.optionalFailure("context_care_history");
    else if (/memor|owner_profile/.test(source)) turn.optionalFailure("context_memory");
    else if (/product_feedback/.test(source)) turn.optionalFailure("context_product_feedback");
    else turn.optionalFailure("context_semantic_state");
  }
}

function logAskServerError(stage: string, error: unknown, context: Record<string, unknown>, httpStatus: number) {
  const databaseDiagnostic = getAiCreditLedgerDiagnostic(error);
  const databaseError = error as { code?: string; details?: string; hint?: string; message?: string } | null;
  const requestId = typeof context.requestId === "string" ? context.requestId : crypto.randomUUID();
  if (httpStatus >= 500 || /persistence|reconciliation|credit_(?:completion|release)/.test(stage)) {
    emitOperationalEvent({
      errorCode: safeAskOperationalCode(databaseDiagnostic.code || databaseError?.code || stage),
      eventType: "application_error", feature: "ask", operationId: requestId,
      requestId, route: "/api/ask", severity: "high",
    });
  }
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Ask API] request failed", {
    databaseCode: databaseDiagnostic.code || databaseError?.code || "",
    databaseDetails: databaseDiagnostic.details || databaseError?.details || "",
    databaseHint: databaseDiagnostic.hint || databaseError?.hint || "",
    databaseMessage: databaseDiagnostic.message || databaseError?.message || "",
    httpStatus,
    operation: databaseDiagnostic.operation,
    requestId,
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
  if (event.outcome === "failed") {
    emitOperationalEvent({
      errorCode: safeAskOperationalCode(event.providerErrorCode || event.stage), eventType: "provider_failure",
      feature: "ask", operationId: context.requestId, requestId: context.requestId,
      route: "/api/ask", severity: "high",
    });
    console.warn("[Ask provider] stage failed", payload);
  }
  else console.info("[Ask provider] stage", payload);
}

function safeAskOperationalCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 120);
  return normalized || "ASK_FAILURE";
}

type AskPreProvider503Reason = "AI_ADMISSION_DENIED" | "CREDIT_RESERVATION_FAILED" | "IDEMPOTENCY_FAILED_STATE_REPLAY" | "PRE_PROVIDER_VALIDATION_FAILED" | "PROVIDER_CONFIG_UNAVAILABLE" | "UNKNOWN_PRE_PROVIDER_FAILURE";

function logAskPreProvider503(input: {
  creditReservationState: string;
  error: unknown;
  idempotencyState: "new" | "retry";
  providerCallAttempted: boolean;
  requestId: string;
}) {
  const internalReason = input.error instanceof AiAdmissionError ? input.error.reason
    : input.error instanceof AiCreditLedgerError ? input.error.stage
    : input.error instanceof AskPipelineError ? input.error.stage : "unknown";
  const configReasons = new Set(["daily_guard_not_configured", "global_disabled", "guard_store_unavailable", "identity_secret_unavailable", "unknown_model_pricing"]);
  const reason: AskPreProvider503Reason = input.error instanceof AiCreditLedgerError ? "CREDIT_RESERVATION_FAILED"
    : internalReason === "operation_call_limit" && input.idempotencyState === "retry" ? "IDEMPOTENCY_FAILED_STATE_REPLAY"
    : configReasons.has(internalReason) ? "PROVIDER_CONFIG_UNAVAILABLE"
    : input.error instanceof AskPipelineError && input.error.stage === "configuration_failed" ? "PROVIDER_CONFIG_UNAVAILABLE"
    : input.error instanceof AskPipelineError ? "PRE_PROVIDER_VALIDATION_FAILED"
    : input.error instanceof AiAdmissionError ? "AI_ADMISSION_DENIED" : "UNKNOWN_PRE_PROVIDER_FAILURE";
  console.warn("[Ask API] pre-provider 503", {
    creditReservationDisposition: input.creditReservationState === "completed" ? "reused"
      : input.creditReservationState === "released" ? "released"
      : input.creditReservationState === "reserved" && input.idempotencyState === "retry" ? "recreated"
      : input.creditReservationState === "reserved" ? "created" : "not_attempted",
    creditReservationState: input.creditReservationState,
    executionDisposition: input.idempotencyState === "retry" ? "reentered" : "new",
    guardReason: internalReason,
    idempotencyState: input.idempotencyState,
    preProvider503Reason: reason,
    providerCallAttempted: input.providerCallAttempted,
    requestId: input.requestId,
  });
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
      accessToken: string;
      supabase: SupabaseClient;
      usage: AiCreditStatus;
      userId: string;
    }
> {
  const authentication = await loadAskAuthenticationContext(request);
  if ("response" in authentication) return authentication;
  return loadAskEntitlementContext(authentication);
}

async function loadAskAuthenticationContext(request: Request): Promise<
  | { response: Response }
  | { accessToken: string; supabase: SupabaseClient; userId: string }
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

  return { accessToken: token, supabase, userId: userData.user.id };
}

async function loadAskEntitlementContext(authentication: {
  accessToken: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      capabilities: EffectiveEntitlements["capabilities"];
      accessToken: string;
      supabase: SupabaseClient;
      usage: AiCreditStatus;
      userId: string;
    }
> {
  const { accessToken, supabase, userId } = authentication;
  const entitlements = await resolveEffectiveEntitlements(supabase);
  const planId = entitlements.effectivePlan;
  let usage: AiCreditStatus;
  try {
    usage = await getRemainingAiCredits({
      feature: "ask",
      planId,
      monthlyAiCredits: entitlements.limits.monthlyAiCredits,
      supabase,
      userId,
    });
  } catch (error) {
    if (error instanceof AiCreditLedgerError) {
      logAskServerError("usage_lookup", error, { userId }, 503);
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
  return { accessToken, capabilities: entitlements.capabilities, planId, supabase, usage, userId };
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
