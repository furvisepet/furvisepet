import {resolveRemovePlan} from "../../lib/furvise-brain/remove-job.ts";
import {prepareBoundRemoveAction} from "../../lib/application-actions/planner.ts";
import { prepareBoundReplaceAction } from "../../lib/application-actions/planner.ts";
import { buildFurvisePlanningContext } from "../../lib/intelligence/planning-context.ts";
import { isOrdinarySavedHistoryRequest } from "../../lib/intelligence/publication-authority.ts";
import { prepareAppendTurn } from "../../lib/intelligence/append-turn.ts";
import { resolveReplaceJob } from "../../lib/furvise-brain/replace-job.ts";
import { careHistoryCorrectionOrchestration } from "../../lib/ai/ask-command-router.ts";
import { isDeepStrictEqual } from "node:util";
import { exceedsSelectedPetRead } from "../../lib/intelligence/selected-pet-read.ts";
import { assessTaskExecution } from "../../lib/intelligence/task-execution-contract.ts";
import { resolveAskTimeZone } from "../../lib/ask-time-zone.ts";
import { eligibleAnswerSources } from "../../lib/intelligence/ask-evidence.ts";
import { recoverTransientRead } from "../../lib/security/read-recovery.ts";
import { OperationDeadline } from "../../lib/ai/execution-deadline.ts";
import { ASK_OPERATION_TIMEOUT_MS, ASK_MAX_QUESTION_CHARACTERS } from "../../lib/ai/ask-execution-limits.ts";
import { createAskAdmissionSettlement } from "../../lib/ai/ask-admission-settlement.ts";
import { createAskCreditSettlement } from "../../lib/ai/ask-credit-settlement.ts";
import { resolveAskHistoryAccess } from "../../lib/intelligence/history-access.ts";
import { persistCanonicalSuggestions } from "../../lib/intelligence/canonical-suggestion-continuation.ts";
import { generateAskHistoryAnswer } from "../../lib/intelligence/generate-ask-history.ts";
import { interpretAskQuestion, readInterpretationSubject } from "../../lib/intelligence/interpret-ask.ts";
import type { NeedCoverage } from "../../lib/intelligence/evidence-need-coverage.ts";
import type { EvidenceNeed } from "../../lib/intelligence/evidence-needs.ts";
import { inspectAskPublication } from "../../lib/intelligence/inspect-ask-publication.ts";
import { buildSuccessfulAskResponse, didPersistEffectiveAskState } from "../../lib/intelligence/finalize-ask-publication.ts";
import { revalidateAskStateViews } from "../../lib/intelligence/revalidate-ask-state.ts";
import { finalizeDurableAskAnswer } from "../../lib/furvise-brain/durable-answer-finalization.ts";
import { finalizeAskPostReview } from "../../lib/furvise-brain/post-review-finalizer.ts";
import { attachEpisodeReferences } from "../../lib/intelligence/episode-history.ts";
import type { HistoryCoverage } from "../../lib/intelligence/history-retrieval.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalCareAuthorityClient } from "../../lib/intelligence/care-authority-client";
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
import { orchestrateAskTurn } from "../../lib/ai/ask-orchestrator";
import { classifyFurviseCapabilityQuestion, buildFurviseCapabilityResponse } from "../../lib/ai/ask-internal-product-policy";
import { safeAskDiagnosticStage } from "../../lib/ai/ask-error-diagnostic.ts";
import { admitAiOperation, type AiOperationAdmission } from "../../lib/ai/usage-guard/admission";
import { AiAdmissionError } from "../../lib/ai/usage-guard/errors";
import { type PendingUpdateSuggestion, type PetConcern } from "../../lib/ai/concern-engine";
import {
  AiCreditLedgerError,
  buildDevelopmentAiCreditFallback,
  completeAiCredit,
  getAiCreditLedgerDiagnostic,
  getRemainingAiCredits,
  hashAiCreditPayload,
  isAiCreditIntegrityError,
  isMissingAiUsageTableError,
  reserveAiCredit,
  setAiCreditDisposition,
  type AiCreditStatus,
} from "../../lib/ai/usage-ledger";
import type {
  CareEntryRow,
  DogMemoryRow,
  DogProfileRow,
} from "../../lib/supabase";
import {
  FURVISE_ANSWER_UNAVAILABLE_MESSAGE,
  FURVISE_ASK_UNAVAILABLE_MESSAGE,
  buildFurviseClarification,
} from "../../lib/furvise-output";
import {
  type PlanId,
} from "../../lib/billing/plan-limits";
import { resolveEffectiveEntitlements, type EffectiveEntitlements } from "../../lib/billing/entitlements";
import { deriveConversationTitle } from "../../lib/ask-conversations";
import {
  buildImmediateEmergencyGuidance,
  buildRecentAskUpdates,
  concernKeyToAskTags,
  conditionalEmergencyGuidance,
  detectImmediateAskEmergency,
  evaluateAskSafetyContext,
  formatConcernTag,
} from "../../lib/ask-safety-context";
import {
  buildFurviseContext,
  FurviseContextError,
  prepareAskMemoryAuthorityLearnings,
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
import { claimWithRestoredAskOrigin } from "../../lib/ask-restored-retry";
import { validateSensitiveRequestOriginResponse } from "../../lib/security/headers/origin-policy";
import {
  explicitlyNamedOwnedPets,
} from "../../lib/intelligence/entities/resolve-turn-subject";
import {
  enforceVerifiedStateClaims,
  parseStoredApplicationActions,
  prepareFurviseApplicationActions,
  resolveFurviseActionTargetBindings,
  shouldAutoExecuteAction,
  type FurviseApplicationAction,
} from "../../lib/application-actions/index.ts";
import { prepareFieldMutationTurn } from "../../lib/intelligence/field-mutation-turn.ts";
import { cancelActionCapability, createActionCapabilities, executeActionCapability } from "../../lib/application-actions/capabilities.ts";
import {
  buildGriefResponseFallback,
  classifyCurrentPetLoss,
} from "../../lib/ai/pet-loss.ts";

import { getPetLifecycleStatus } from "../../lib/pet-lifecycle.ts";
import { prepareStateTransitionTurn } from "../../lib/intelligence/state-transition-turn.ts";
import { continueLifecyclePlan, lifecyclePlanOrchestration } from "../../lib/intelligence/lifecycle-turn.ts";
import {
  beginAskConversationTurn,
  completeAskConversationTurn,
  finalizeAskAssistantResponse,
  updateAskAssistantResponse,
} from "../../lib/ask-conversation-authority.ts";
import { isExplicitCareHistorySaveRequest, resolveAutomaticCareHistoryPresentation } from "../../lib/intelligence/care-history-policy.ts";
import { publicAskFailureCode, type AskInternalFailure } from "../../lib/furvise-output.ts";
import { readAskProfiles, classifyAskDatabaseFailure } from "../../lib/ask-profile-read.ts";

const friendlyAnswerFailure = FURVISE_ANSWER_UNAVAILABLE_MESSAGE;
export const maxDuration = 210;
const askRequestTimeoutMs = ASK_OPERATION_TIMEOUT_MS;
const askGuardOperationTtlSeconds = 90 * 24 * 60 * 60;

type InternalAskFailureCode = "AI_DAILY_CAP_REACHED" | "AUTH_REQUIRED" | "PET_NOT_FOUND" | "INVALID_MESSAGE" | "IDEMPOTENCY_CONFLICT" | "REQUEST_IN_PROGRESS" | "RATE_LIMITED" | "AI_RATE_LIMITED" | "AI_CREDITS_EXHAUSTED" | "AI_UNAVAILABLE" | "DATABASE_ERROR" | "UNKNOWN_ERROR";

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
  const params = new URL(request.url).searchParams;
  if (params.has("requestId")) {
    const requestId = params.get("requestId") || "", petId = params.get("petId") || "";
    if (!isUuid(requestId) || !isUuid(petId)) return askFailure("INVALID_MESSAGE", "Choose a valid request and pet.", 400);
    try {
      // Read-only recovery: no generation, write execution, credit reservation
      // or reconciliation. Reuse the owned/pet-scoped persistence lookup.
      const state = await loadPersistedRequest({ requestId, petId, supabase: context.supabase, userId: context.userId });
      const response = state?.assistantMessage?.response_data?.turn?.finalStage === "COMPLETED"
        ? completedResponseFromPersisted(state, context.usage)
        : Response.json({ success: false, code: "ANSWER_ALREADY_ACTIVE",
            ...(state ? { conversationId: state.conversationId, userMessageId: state.userMessageId, requestId } : {}) }, { status: 202 });
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    } catch (error) { return handleAskApiError(error, requestId); }
  }
  return Response.json({ usage: context.usage });
}

type AskRequestExecution = { deadline: OperationDeadline; durable?: { conversationId: string; userMessageId: string; logicalTurnId: string } };
export async function POST(request: Request) {
  const execution: AskRequestExecution = { deadline: new OperationDeadline(ASK_OPERATION_TIMEOUT_MS) };
  let response: Response;
  try { response = await executeAskRequest(request, execution); }
  catch (error) {
    return handleAskApiError(error, "");
  }
  if (response.ok || !execution.durable) return response;
  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return Response.json({ ...body, ...execution.durable, turnDisposition: "answer_unavailable" },
    { status: response.status, headers });
}

async function executeAskRequest(request: Request, execution: AskRequestExecution) {
  let authentication: Awaited<ReturnType<typeof loadAskAuthenticationContext>>;
  try {
    authentication = await loadAskAuthenticationContext(request);
  } catch (error) {
    logAskServerError("authentication", error, {}, 500);
    return askFailure("UNKNOWN_ERROR", "Furvise could not start that answer. Please try again.", 500, {}, "authentication");
  }
  if ("response" in authentication) return authentication.response;
  const { supabase, userId } = authentication;

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
    timeZone?: unknown;
    mode?: unknown;
  } | null;
  if (body?.mode !== undefined && body.mode !== "note") return askFailure("INVALID_MESSAGE", "Choose a valid submission mode.", 400);
  const noteMode = body?.mode === "note" ? "note" as const : undefined;
  const question = typeof body?.message === "string" ? body.message.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const logicalTurnId = typeof body?.logicalTurnId === "string" && isUuid(body.logicalTurnId) ? body.logicalTurnId : "";
  const requestId = logicalTurnId;
  const locale = resolveAskLocale(body?.locale, request.headers.get("accept-language"));
  let aiCreditPayload = { conversationId, locale, petId, question, ...(noteMode ? { mode: noteMode } : {}), ...(body?.timeZone ? { timeZone: resolveAskTimeZone(body.timeZone) } : {}) };
  let aiCreditPayloadHash = hashAiCreditPayload("ask", aiCreditPayload);
  logAskStage("authentication succeeded", { requestId });

  if (!question || !requestId) {
    return askFailure("INVALID_MESSAGE", "Choose a pet and enter a message before asking Furvise.", 400, {}, "request_validation");
  }

  if (question.length > ASK_MAX_QUESTION_CHARACTERS) {
    return askFailure("INVALID_MESSAGE", `Shorten your message to ${ASK_MAX_QUESTION_CHARACTERS.toLocaleString("en-US")} characters or fewer. Your text has not been submitted.`, 400, {}, "request_validation");
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
  const { usage } = context;
  const historyAccess = resolveAskHistoryAccess(context.planId);

  if (!petId || (petId !== "all" && !isSecurityUuid(petId)) || (conversationId && !isSecurityUuid(conversationId))) {
    return askFailure("INVALID_MESSAGE", "Choose a pet before asking Furvise.", 400, {}, "request_validation");
  }

  const { data: profiles, error: profileError, diagnostic: profileDiagnostic } = await readAskProfiles<DogProfileRow[]>((signal) => {
    const profileQuery = supabase.from("dog_profiles").select("id,user_id,name,species,lifecycle_status,sex").eq("user_id", userId).neq("lifecycle_status", "archived").retry(false).abortSignal(signal);
    return petId === "all" ? profileQuery.returns<DogProfileRow[]>() : profileQuery.eq("id", petId).returns<DogProfileRow[]>();
  }, { signal: request.signal });
  // Fixed enums/numbers only: never log profile data, SQL text, tokens, or raw SDK errors.
  if (profileError) console.warn("[Ask database] profile read", { requestId, ...profileDiagnostic });
  else if (profileDiagnostic.recovered) console.info("[Ask database] profile read recovered", { requestId, ...profileDiagnostic });
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
    idempotency = await claimWithRestoredAskOrigin({
      payload: aiCreditPayload,
      persisted: persistedBeforeClaim ? {
        conversationId: persistedBeforeClaim.conversationId,
        question: persistedBeforeClaim.userMessage.user_text,
        userSequence: persistedBeforeClaim.userSequence,
      } : null,
      claim: async (canonicalPayload) => {
        aiCreditPayload = canonicalPayload;
        aiCreditPayloadHash = hashAiCreditPayload("ask", canonicalPayload);
        return claimIdempotentOperation({
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
      },
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
  execution.durable = { conversationId: preparedRequest.conversationId, userMessageId: preparedRequest.userMessageId, logicalTurnId };
  turnLifecycle.transition("ROUTED");

  const ownerNotePersistence: CarePersistenceResult | null = null;
  const creditRequestId = attemptId;
  const reasoningQuestion = question;
  let completedContinuation: (() => Promise<Response>) | null = null;

  let liveContext: FurviseLiveContext;
  try {
    liveContext = await buildFurvisePlanningContext({
      conversationId: preparedRequest.conversationId, sourceMessageId: preparedRequest.userMessageId,
      currentMessage: question, locale, petId, supabase, userId, timeZone: resolveAskTimeZone(aiCreditPayload.timeZone),
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

  let turnPetId = petId;
  let turnAuthoritativePetIds = [petId];
  let turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question: reasoningQuestion, requestId });
  let contextUsed: typeof turnView.contextUsed & { evidenceNeeds?: EvidenceNeed[]; needCoverage?: NeedCoverage[]; historyCoverage?: Pick<HistoryCoverage, "retrieval" | "corrections" | "continuation" | "reasons" | "consistency" | "perPet"> } = turnView.contextUsed;

  let orchestration;
  let creditReserved = false;
  let creditFinalState = "not_reserved";
  let providerCallCount = 0;
  let generationStage = "generation_preparation";
  let intelligenceResult: FurviseIntelligenceResult | null = null;
  const getAnswerAssessment = () => intelligenceResult?.answerValidation?.assessment ?? null;
  let aiAdmission: AiOperationAdmission | null = null;
  let aiAdmissionFinalized = false;
  const rateGateRef: { current: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null } = { current: null };
  const confirmedExistingCarePersistence: CarePersistenceResult | null = null;
  let deterministicApplicationActions: FurviseApplicationAction[] = [];
  let plannedReplaceTarget: { id: string; petId: string; sourceType: "care_update" } | null = null;
  let deterministicLossInteraction = false;
  let deferHighImpactLifecyclePersistence = currentLoss === "confirmed_current";
  const onProviderEvent = (event: AskProviderEvent) => {
    turnLifecycle.providerEvent(event);
    providerCallCount = turnLifecycle.snapshot().providerCallCount;
    logAskProviderEvent(event, {
      conversationId: preparedRequest.conversationId,
      petId: turnPetId,
      providerCallCount,
      requestId,
    });
  };
  try {
    turnLifecycle.route("pet_care", "ai");
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
      feature: "ask", intendedModel: model, deadline: execution.deadline,
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
      generationStage = "interpretation";
      const interpretation = await interpretAskQuestion({ context: { ...liveContext, conversationTurns: recentConversation }, model, onProviderEvent });
      if (exceedsSelectedPetRead(interpretation, petId, liveContext.eligiblePets?.map(pet => pet.id) || [petId],
        explicitlyNamedOwnedPets(question, liveContext.eligiblePets || []).map(pet => pet.id))) {
        if (creditReserved) {
          const released = await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
          creditReserved = false;
          creditFinalState = released ? "released" : "release_pending";
          turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
        }
        turnLifecycle.route("clarification", "deterministic");
        turnAuthoritativePetIds = [];
        contextUsed = { petName: null, usedSources: [] };
        const reply = buildSubjectClarificationOrchestration(question);
        reply.answer = { title: "One pet at a time", summary: `I can read only ${liveContext.pet.name || "the selected pet"}'s records in this conversation. Ask about this pet, or switch pets to read another pet's history.`, sections: [], safetyNote: null };
        reply.clarificationQuestion = "";
        return reply;
      }
      if (interpretation.request?.appendJob) {
        const plannedContext = liveContext;
        completedContinuation = () => prepareAppendTurn({ context: plannedContext, interpretation,
          requestId, userMessageId: preparedRequest.userMessageId, conversationId: preparedRequest.conversationId, supabase, usage, turnLifecycle });
        if (creditReserved) {
          const released = await safeReleaseAiCredit({ logicalRequestId: logicalTurnId, payloadHash: aiCreditPayloadHash, requestId: creditRequestId, userId });
          creditReserved = false; creditFinalState = released ? "released" : "release_pending";
          turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
        }
        return buildSubjectClarificationOrchestration(question);
      }
      // Legacy save tasks are not an executable Ask authority path. They must
      // be proposed as source-bound append capabilities by the single planner.
      if (interpretation.request?.task) return buildSubjectClarificationOrchestration(question);
      liveContext = { ...liveContext, askInterpretation: interpretation };
      // Safety may veto execution, but never choose a lifecycle operation or subject.
      if (!isOrdinarySavedHistoryRequest(interpretation.request) && !interpretation.request?.writeJob
        && !interpretation.clarification && !interpretation.conversationOnly) {
        const conditionalSafety = conditionalEmergencyGuidance(question);
        if (conditionalSafety) {
          turnLifecycle.route("clarification", "deterministic");
          turnAuthoritativePetIds = [];
          contextUsed = { petName: null, usedSources: [] };
          return { ...buildSubjectClarificationOrchestration(question), answer: conditionalSafety,
            clarificationQuestion: null, handledWithoutAi: true };
        }
      }
      const lifecycleOutcome = await continueLifecyclePlan({ plan: interpretation.request?.lifecyclePlan,
        context: liveContext, requestId, cancel: cancelActionCapability });
      if (lifecycleOutcome) {
        turnLifecycle.route("lifecycle", "deterministic");
        turnAuthoritativePetIds = interpretation.petIds;
        turnPetId = lifecycleOutcome.plan.transition?.petId || lifecycleOutcome.plan.pendingAction?.petId || turnPetId;
        deterministicApplicationActions = lifecycleOutcome.actions;
        deterministicLossInteraction = lifecycleOutcome.plan.transition?.toState === "deceased";
        deferHighImpactLifecyclePersistence = true;
        contextUsed = { petName: lifecycleOutcome.plan.transition?.petName || null, usedSources: [] };
        return lifecyclePlanOrchestration(lifecycleOutcome);
      }
      if (interpretation.request?.stateTransitionJob) {
        const prepared = prepareStateTransitionTurn(interpretation.request.stateTransitionJob, liveContext, requestId);
        turnLifecycle.route("pet_care", "deterministic");
        turnAuthoritativePetIds = [prepared.action.petId];
        turnPetId = prepared.action.petId;
        deterministicApplicationActions = [prepared.action];
        contextUsed = { petName: null, usedSources: [] };
        return prepared.orchestration;
      }
      if (interpretation.request?.fieldMutationJob) {
        const prepared = prepareFieldMutationTurn(interpretation.request.fieldMutationJob, liveContext, requestId);
        turnLifecycle.route("pet_care", "deterministic");
        turnAuthoritativePetIds = [prepared.action.petId];
        turnPetId = prepared.action.petId;
        deterministicApplicationActions = [prepared.action];
        contextUsed = { petName: null, usedSources: [] };
        return prepared.orchestration;
      }
      if (interpretation.request?.removeJob) {
        const job=await resolveRemovePlan(interpretation.request.removeJob,supabase,userId);
        turnLifecycle.route("pet_care","deterministic");
        turnAuthoritativePetIds=[job.petId];turnPetId=job.petId;
        plannedReplaceTarget={id:"care:"+job.resolvedTarget.recordId,petId:job.petId,sourceType:"care_update"};
        deterministicApplicationActions=[prepareBoundRemoveAction(job,requestId)];
        contextUsed={petName:null,usedSources:[]};
        return {aiResult:null,handledWithoutAi:true,intent:"status_update" as const,safetyLevel:"normal" as const,concern:null,suggestion:null,
          answer:{title:"Review history removal",summary:"A care-history removal is ready for confirmation. No record has been removed.",sections:[],safetyNote:null}};
      }
      // A validated ticket precedes every factual context read. Invalid plans
      // never enter this loader. Emergency copy is the documented exception above.
      const planningSource = liveContext.currentTurn;
      if (!interpretation.conversationOnly && !interpretation.clarification) liveContext = await buildFurviseContext({ historyAccess, conversationId: preparedRequest.conversationId,
        currentMessage: reasoningQuestion, feature: "ask", locale, petId, supabase, userId,
        timeZone: resolveAskTimeZone(aiCreditPayload.timeZone) });
      liveContext = { ...liveContext, currentTurn: planningSource, askInterpretation: interpretation };
      turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question, requestId });
      contextUsed = turnView.contextUsed;
      const replaceJob = interpretation.request?.writeJob;
      if (replaceJob) {
        // Typed write jobs stop before history generation/review. Publication
        // mints the existing capability; only its normal gate may execute it.
        const resolved = await resolveReplaceJob(replaceJob, supabase, userId);
        turnPetId = replaceJob.petId;
        turnAuthoritativePetIds = [turnPetId];
        const subject = liveContext.eligiblePets.find(pet => pet.id === turnPetId)!;
        if (liveContext.pet.id !== turnPetId) {
          liveContext = await buildFurviseContext({ historyAccess, conversationId: preparedRequest.conversationId,
            conversationPetId: petId, currentMessage: question, feature: "ask", timeZone: liveContext.timeZone,
            locale, petId: turnPetId, supabase, userId });
        }
        contextUsed = { petName: subject.name, usedSources: [] };
        turnLifecycle.subject("semantic_replace", 1);
        plannedReplaceTarget = resolved.target;
        deterministicApplicationActions = [prepareBoundReplaceAction(replaceJob, resolved.target, subject.name || "your pet", requestId)];
        if (deterministicApplicationActions.length !== 1) throw new Error("REPLACE_ACTION_INVALID");
        console.info("[Ask Heart] ticket prepared", { requestId, sourceMessageId: replaceJob.sourceMessageId,
          operation: replaceJob.operation, petId: turnPetId, targetId: resolved.target.id,
          bodyStart: replaceJob.body.start, bodyEnd: replaceJob.body.end });
        return { ...careHistoryCorrectionOrchestration(subject.name || "your pet"), handledWithoutAi: false };
      }
      generationStage = "subject_resolution";
      let subjectDecision: ReturnType<typeof readInterpretationSubject>;
      try {
        subjectDecision = readInterpretationSubject(interpretation, petId, {
          ownerId: userId, pets: liveContext.eligiblePets,
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
      turnAuthoritativePetIds = subjectResolution.petIds;
      logAskStage("turn subject resolved", {
        explicitSubject: subjectResolution.explicitSubject,
        reasonCode: subjectResolution.reasonCode,
        requestId,
        resolutionStatus: subjectResolution.status,
        resolvedAlternatePet: Boolean(subjectResolution.petId && subjectResolution.petId !== petId),
        subjectCount: subjectResolution.petIds.length,
      });
      turnLifecycle.subject(
        subjectResolution.reasonCode || subjectResolution.discourseFocus?.kind || subjectResolution.status,
        subjectResolution.candidateLabels?.length || subjectResolution.candidatePetIds?.length || subjectResolution.petIds.length,
      );
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
        const candidateNames = subjectResolution.candidateLabels || (subjectResolution.candidatePetIds || [])
          .map((candidateId) => liveContext.eligiblePets.find((pet) => pet.id === candidateId)?.name)
          .filter((name): name is string => Boolean(name));
        return buildSubjectClarificationOrchestration(question, candidateNames);
      }

      turnPetId = subjectResolution.petId;
      if (turnPetId !== petId) {
        generationStage = "context_loading";
        liveContext = await buildFurviseContext({
          historyAccess,
          conversationId: preparedRequest.conversationId,
          conversationPetId: petId,
          currentMessage: question,
          feature: "ask",
          timeZone: resolveAskTimeZone(aiCreditPayload.timeZone),
          locale,
          petId: turnPetId,
          supabase,
          userId,
        });
        reportOptionalContextRecovery(liveContext, requestId);
        recordContextRecoveryOnTurn(liveContext, turnLifecycle);
      }
      liveContext = { ...liveContext, askInterpretation: interpretation };
      turnView = deriveAskTurnView({ currentSourceMessageId: preparedRequest.userMessageId, liveContext, question, requestId });
      contextUsed = turnView.contextUsed;
      if (subjectResolution.discourseFocus && subjectResolution.discourseFocus.kind !== "pet") {
        contextUsed = { petName: null, usedSources: contextUsed.usedSources };
      }
      generationStage = "orchestration";
      return await orchestrateAskTurn({
        concerns: turnView.concerns,
        message: reasoningQuestion,
        petName: liveContext.pet.name || "your pet",
        generate: async () => {
          const generated = await generateAskHistoryAnswer({
            onStage: stage => { generationStage = stage; },
            supabase,
            context: liveContext,
            requestId,
            sourceMessageId: preparedRequest.userMessageId,
            onProviderEvent,
            subjectConfidence: subjectResolution.confidence,
            authoritativePetIds: subjectResolution.petIds,
            authoritativeSemanticFrame: subjectFrame,
            discourseFocus: subjectResolution.discourseFocus,
            canonicalConcepts: [],
          });
          liveContext = generated.context;
          intelligenceResult = generated.intelligenceResult;
          logValidatedIntelligence(intelligenceResult, requestId);
          return intelligenceResult.reasoning;
        },
      });
    }), execution.deadline.allocate("answer_generation", askRequestTimeoutMs, 4_000));
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
      const rejection = await error.response.clone().json().catch(() => null) as { code?: string } | null;
      if (rejection?.code === "AI_REQUEST_ALREADY_ACTIVE") {
        turnLifecycle.fail("request_in_progress", true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
        return Response.json({ code: publicAskFailureCode("answer_already_active"),
          message: "Another answer is still finishing. Try again shortly.", success: false }, { status: 409 });
      }
      turnLifecycle.fail("rate_limit", true); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      const retryAfterSeconds = Number(error.response.headers.get("Retry-After") || 0);
      return askFailure("RATE_LIMITED", "Wait a moment, then try again.", error.response.status,
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? { retryAfterSeconds: Math.ceil(retryAfterSeconds) } : {}, "rate_limit");
    }
    if (error instanceof AiAdmissionError) {
      if (providerCallCount === 0) logAskPreProvider503({
        creditReservationState: creditFinalState,
        error,
        idempotencyState: idempotency.operation.claimOutcome,
        providerCallAttempted: false,
        requestId,
      });
      const dailyCapReached = error.code === "AI_DAILY_CAP_REACHED";
      turnLifecycle.fail(error.reason, !dailyCapReached); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      if (dailyCapReached) return askFailure("AI_DAILY_CAP_REACHED", "Furvise has reached its daily AI limit. Please return after the daily limit resets.", error.status, { retryable: false }, error.reason);
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
    const internalStage = error instanceof AskPipelineError ? error.stage : generationStage;
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
    return askFailure("AI_UNAVAILABLE", friendlyAnswerFailure, 503, { requestId }, internalStage);
  }

  if (completedContinuation) {
    try {
      const result = await (completedContinuation as () => Promise<Response>)();
      try { await aiAdmission?.complete(); } catch (error) { logAskServerError("ai_operation_completion", error, { requestId }, 200); }
      return result;
    } catch (error) {
      await failAiAdmission(aiAdmission, error, aiAdmissionFinalized, requestId);
      throw error;
    } finally {
      try { await rateGateRef.current?.release(); } catch (error) { logAskServerError("rate_gate_release", error, { requestId }, 200); }
    }
  }

  const reasoning = orchestration.aiResult;
  const historyCoverage = reasoning?.evidenceContract?.history;
  if (historyCoverage) {
    const { retrieval, corrections, continuation, reasons, consistency, perPet } = historyCoverage;
    contextUsed.historyCoverage = { retrieval, corrections, continuation, reasons, consistency, perPet };
  }
  if (reasoning?.evidenceContract?.needCoverage?.length) {
    contextUsed.evidenceNeeds = reasoning.evidenceContract.interpretation?.request?.evidenceNeeds;
    contextUsed.needCoverage = reasoning.evidenceContract.needCoverage;
  }
  if (reasoning) contextUsed.usedSources = [...new Set(reasoning.referencedRecords.map(formatContextSourceLabel))].slice(0, 4);
  const safetyLevel = orchestration.safetyLevel;
  const plannedCapabilityIntent = classifyFurviseCapabilityQuestion(question);
  const plannedGate = reasoning && !reasoning.evidenceContract?.interpretation?.request && plannedCapabilityIntent && safetyLevel === "normal" && !reasoning.shoppingSuppressed
    ? buildFurviseCapabilityResponse(plannedCapabilityIntent)
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
        authorizedPetIds: turnAuthoritativePetIds,
        creditRequestId,
        creditReserved,
        contextUsed,
        handledWithoutAi: false,
        intelligenceResult,

        payloadHash: aiCreditPayloadHash,
        operationPayloadHash: idempotency.operation.payloadHash,
        operationOwnerToken: idempotency.operation.ownerToken,
        petId: turnPetId,
        petName: liveContext.pet.name,
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
      // This capability response replaces the generated body, so its assessment cannot transfer.
      await finalizeAiAdmissionAfterPersistence({ admission: aiAdmission, alreadyFinalized: aiAdmissionFinalized, assessment: null, requestId, response: persistedResponse });
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
        proposals: turnAuthoritativePetIds.length ? reasoning.applicationActions.filter(action =>
          !["pet.update_profile", "memory.set_preference", "memory.forget_preference", "pet.mark_deceased", "pet.mark_active", "pet.archive"].includes(action.kind)) : [],
        petId: turnPetId,
        petName: liveContext.pet.name || "your pet",
        requestId,
        sourceMessage: question,
        lifecycleStatus: getPetLifecycleStatus(liveContext.pet),
      }).map((action) => ({ ...action, sourceMessageId: preparedRequest.userMessageId }));
    } catch (error) {
      emitOperationalEvent({
        errorCode: "ASK_ACTION_PREPARATION_FAILED",
        eventType: "application_error",
        feature: "ask_application_action",
        metadata: { actionFailureClass: "optional", lifecycleActionUnavailable: false },
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
    interactionMode: deterministicLossInteraction || reasoning?.responseMode === "grief_support"
      ? "grief" : orchestration.intent === "casual" ? "casual" : undefined,
    recentlyResolved: reasoning?.intelligenceSafety.level === "recently_resolved",
    monitoring: safetyLevel === "monitor",
    urgent: safetyLevel === "urgent",
    usedContextSummary: contextUsed.usedSources,
  });
  const publication = inspectAskPublication(orchestration.answer, conversationResponse, liveContext.askInterpretation?.readOnly === true,
    reasoning?.evidenceContract, liveContext.episodeResult);
  if (conversationResponse && publication.response) Object.assign(conversationResponse, publication.response);
  const integrityFailure = publication.failure;
  if (!conversationResponse || integrityFailure) {
    console.info("[Ask publication] rejected", {
      requestId, failure: integrityFailure || "serialization",
      titlePresent: Boolean(governedAnswer.title.trim()),
      summaryPresent: Boolean(governedAnswer.summary.trim()),
      sectionCount: governedAnswer.sections.length,
      preparedActionCount: preparedApplicationActions.length,
      displayedActionCount: publication.displayed?.applicationActions?.length || 0,
    });
    await failAiAdmission(aiAdmission, new Error(integrityFailure ? "ASK_ANSWER_INTEGRITY_FAILED" : "ASK_RESPONSE_SERIALIZATION_FAILED"), aiAdmissionFinalized, requestId);
    aiAdmissionFinalized = Boolean(aiAdmission);
    logAskServerError("response_serialization", new Error(integrityFailure ? "ASK_ANSWER_INTEGRITY_FAILED" : "ASK_RESPONSE_SERIALIZATION_FAILED"), {
      integrityFailure,
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
  const actionTargetBindings = resolveFurviseActionTargetBindings({
    actions: preparedApplicationActions,
    referencedRecords: reasoning?.referencedRecords || [],
    targetRecords: [
      ...(reasoning?.evidenceContract ? eligibleAnswerSources(reasoning.evidenceContract).map(source => ({
        id: source.sourceId, petId: source.petId, sourceType: source.sourceType,
      })) : reasoning?.referencedRecords || []),
      ...(reasoning?.referencedRecords.filter(record => record.sourceType === "active_concern") || []),
      ...(plannedReplaceTarget ? [plannedReplaceTarget] : []),
    ],
  });

  try {
    const persistedResponse = await persistAssistantAnswer({
      authorizedPetIds: turnAuthoritativePetIds,
      concern: orchestration.concern,
      creditRequestId,
      creditReserved,
      contextUsed,
      handledWithoutAi: orchestration.handledWithoutAi,
      deferHighImpactLifecyclePersistence,
      historyReviewRequired: turnAuthoritativePetIds.length > 0 && orchestration.intent === "new_observation"
        && classifyCurrentPetLoss(question) !== "confirmed_current"
        && !isExplicitCareHistorySaveRequest(question),
      intelligenceResult,

      payloadHash: aiCreditPayloadHash,
      operationPayloadHash: idempotency.operation.payloadHash,
      operationOwnerToken: idempotency.operation.ownerToken,
      preconfirmedCarePersistence: ownerNotePersistence || confirmedExistingCarePersistence,
      petId: turnPetId,
      petName: liveContext.pet.name,
      preparedRequest,
      requestId,
      recentCareEntries: liveContext.careEntries,
      response: conversationResponse,
      actionTargetBindings,
      sourceMessage: question,
      saveMetadata: buildAskSaveMetadata(conversationResponse, { intent: reasoning?.userIntent || orchestration.intent, question }),
      safetyLevel,
      shoppingSuppressed: reasoning ? reasoning.shoppingSuppressed : safetyLevel === "urgent",
      suggestion: turnAuthoritativePetIds.length ? orchestration.suggestion : null,
      supabase,
      usage,
      userId,
      turnLifecycle,
    }).finally(async () => { if (rateGateRef.current) await rateGateRef.current.release(); });
    await finalizeAiAdmissionAfterPersistence({ admission: aiAdmission, alreadyFinalized: aiAdmissionFinalized, assessment: getAnswerAssessment(), requestId, response: persistedResponse });
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

  if (activeConversationId) {
    const { data, error } = await supabase
      .from("ask_conversations")
      .select("id, pet_profile_id")
      .eq("id", activeConversationId)
      .eq("user_id", userId)
      .maybeSingle<{ id: string; pet_profile_id: string }>();
    if (error) throw new AskApiError("DATABASE_ERROR", "Furvise could not open this conversation.", 503, "conversation_find", error);
    if (!data) {
      // A browser tab can outlive a conversation that was deleted from another tab,
      // account cleanup, or an internal QA reset. Treat that stale URL as a new
      // conversation instead of failing the user's next Ask turn.
      activeConversationId = "";
      logAskStage("stale conversation reset", { requestId });
    } else {
      if (data.pet_profile_id !== petId) {
        throw new AskApiError("PET_NOT_FOUND", "That conversation is not available for this pet.", 404, "conversation_find");
      }
      logAskStage("conversation found", { requestId });
    }
  }

  const { data, error } = await beginAskConversationTurn({
    conversationId: activeConversationId || null,
    petId,
    preview: question.slice(0, 220),
    requestId,
    title: deriveConversationTitle(question, petName),
    userId,
    userText: question,
  });
  const prepared = Array.isArray(data) && data.length === 1 ? data[0] as Record<string, unknown> : null;
  if (error || !prepared || typeof prepared.conversation_id !== "string"
    || typeof prepared.user_message_id !== "string" || !Number.isInteger(prepared.user_sequence_number)) {
    const replay = await loadPersistedRequest({ petId, requestId, supabase, userId });
    if (replay) {
      logAskStage("user message reused", { requestId });
      return replay;
    }
    throw new AskApiError("DATABASE_ERROR", activeConversationId
      ? "Furvise could not save this conversation."
      : "Furvise could not start this conversation.", 503, activeConversationId ? "persist_user_message" : "conversation_create", error);
  }

  activeConversationId = prepared.conversation_id;
  if (!conversationId) logAskStage("conversation created", { requestId });
  logAskStage("user message persisted", { requestId });
  return {
    conversationId: activeConversationId,
    userMessageId: prepared.user_message_id,
    userSequence: prepared.user_sequence_number as number,
  };
}

async function persistAssistantAnswer({
  actionTargetBindings = {},
  authorizedPetIds,
  concern = null,
  creditRequestId,
  creditReserved,
  contextUsed,
  deferHighImpactLifecyclePersistence = false,
  handledWithoutAi,
  historyReviewRequired = false,
  intelligenceResult = null,

  payloadHash,
  preconfirmedCarePersistence = null,
  petId,
  petName,
  preparedRequest,
  requestId,
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
  actionTargetBindings?: Record<string, string>;
  authorizedPetIds: string[];
  concern?: PetConcern | null;
  creditRequestId: string;
  creditReserved: boolean;
  contextUsed: unknown;
  handledWithoutAi: boolean;
  deferHighImpactLifecyclePersistence?: boolean;
  historyReviewRequired?: boolean;
  intelligenceResult?: FurviseIntelligenceResult | null;
  operationPayloadHash: string;
  operationOwnerToken: string;

  payloadHash: string;
  preconfirmedCarePersistence?: CarePersistenceResult | null;
  petId: string;
  petName: string;
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
  const persistenceGovernance = intelligenceResult ? {
    ...intelligenceResult.governance,
    authorizedLearnings: prepareAskMemoryAuthorityLearnings({
      authorizedPetIds,
      currentMessage: sourceMessage,
      learnings: intelligenceResult.executionPlan.learnings,
    }),
    semanticTrace: semanticTraceForStorage(intelligenceResult.semanticTrace),
  } : null;
  response = attachEpisodeReferences(response, intelligenceResult?.reasoning.evidenceContract?.episodes);
  let responseWithTurn = { ...response, turn: turnLifecycle.snapshot() };
  const optionalFailure = (component: AskSubsystem, error: unknown) => {
    turnLifecycle.optionalFailure(component);
    logAskServerError(`optional_${component}`, error, { conversationId, petId, requestId }, 200);
  };
  // Furvise Brain now owns the entire reviewed post-review lifecycle, including
  // exactly-once assistant persistence and persistence-stage replay short-circuiting.
  return finalizeAskPostReview({
    persistReviewedAnswer: async () => {
      let completion = await completeAskConversationTurn({
        contextUsed,
        conversationId,
        intelligenceValidation: intelligenceResult?.answerValidation || null,
        persistenceGovernance,
        preview: response.directAnswer.slice(0, 220),
        requestId,
        responseData: responseWithTurn,
        saveMetadata,
        userId,
        userMessageId,
      });
      let completionRow = validAssistantCompletionRow(completion.data);
      let assistantMessage = completionRow ? { id: completionRow.assistant_message_id } : null;
      let messageError = completion.error;

      if (messageError || !assistantMessage) {
        const existing = await loadPersistedRequestByConversation({ conversationId, requestId, supabase, userId });
        if (existing?.assistantMessage?.response_data) {
          if (existing.assistantMessage.response_data.turn?.finalStage === "COMPLETED") {
            // A finalized result replays its ledger decision; message existence must
            // never create a new completion disposition.
            const replayUsage = await reconcilePersistedAskCredit({ logicalRequestId: requestId, payloadHash, supabase, usage, userId });
            return { kind: "early_response" as const, response: completedResponseFromPersisted(existing, replayUsage) };
          }
          const { turn: storedTurn, ...storedBody } = existing.assistantMessage.response_data;
          const { turn: proposedTurn, ...proposedBody } = responseWithTurn;
          void storedTurn; void proposedTurn;
          if (!isDeepStrictEqual(storedBody, JSON.parse(JSON.stringify(proposedBody)))) {
            throw new AskApiError("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, "persistence_failed");
          }
          // The insertion committed but its acknowledgment was lost. Continue the
          // same reviewed execution, under the existing operation lease and keys.
          assistantMessage = { id: existing.assistantMessage.id };
          messageError = null;
        } else {
          logAskServerError("persistence_failed", messageError, { conversationId, requestId }, 200);
          completion = await completeAskConversationTurn({
            contextUsed,
            conversationId,
            intelligenceValidation: intelligenceResult?.answerValidation || null,
            persistenceGovernance,
            preview: response.directAnswer.slice(0, 220),
            requestId,
            responseData: responseWithTurn,
            saveMetadata,
            userId,
            userMessageId,
          });
          completionRow = validAssistantCompletionRow(completion.data);
          assistantMessage = completionRow ? { id: completionRow.assistant_message_id } : null;
          messageError = completion.error;
          if (!assistantMessage || messageError) {
            logAskServerError("persistence_failed", messageError, { conversationId, requestId }, 200);
            const released = creditReserved
              ? await safeReleaseAiCredit({ logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId })
              : false;
            turnLifecycle.credit(creditReserved ? released ? "released" : "release_pending" : "not_required");
            if (creditReserved) turnLifecycle.settlement("release", released ? "reconciled" : "pending");
            turnLifecycle.fail("assistant_persistence", true);
            emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
            return { kind: "early_response" as const, response: askFailure("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, {}, "persistence_failed") };
          }
          logAskStage("assistant message persisted after idempotent retry", { requestId });
        }
      }
      logAskStage("assistant message persisted", { requestId });
      turnLifecycle.transition("ANSWER_PERSISTED");

      return assistantMessage;
    },
    mintActionCapabilities: async (persisted) => {
      // Persist immutable capability authority before exposing display action ids.
      // The presentation row remains non-executable and is updated only by the API.
      const proposedActions = parseStoredApplicationActions(response.applicationActions);
      if (proposedActions.length) {
        try {
          const capabilityActions = await createActionCapabilities({
            actions: proposedActions,
            assistantMessageId: persisted.id,
            sourceMessageId: userMessageId,
            supabase,
            targetBindings: actionTargetBindings,
            userId,
          });
          response = { ...response, applicationActions: capabilityActions };
          responseWithTurn = { ...response, turn: turnLifecycle.snapshot() };
          const presentationUpdate = await updateAskAssistantResponse({ messageId: persisted.id, responseData: responseWithTurn, userId });
          if (presentationUpdate.error || presentationUpdate.data !== true) throw new Error("ACTION_CAPABILITY_PRESENTATION_UPDATE_FAILED");
        } catch (error) {
          // Fail closed: a response-data proposal is never executable without its capability.
          const unavailableActions = proposedActions.map((action) => ({ ...action, status: "failed" as const, resultMessage: null, errorMessage: "That action could not be prepared safely." }));
          response = { ...response, applicationActions: unavailableActions };
          responseWithTurn = { ...response, turn: turnLifecycle.snapshot() };
          await updateAskAssistantResponse({ messageId: persisted.id, responseData: responseWithTurn, userId });
          logAskServerError("action_capability_creation", error, { conversationId, petId, requestId }, 200);
        }
      }
      return proposedActions;
    },
    persistAuthorizedIntelligence: async () : Promise<{ intelligencePersistence: IntelligencePersistenceSummary | null; intelligencePersistenceWarning: string }> => {
      const intelligencePersistence: IntelligencePersistenceSummary | null = null;
      const intelligencePersistenceWarning = "";
      let semanticTrace = intelligenceResult?.semanticTrace || null;
      // Ask publishes proposed actions; only confirmed capabilities write.
      // Semantic extraction is evidence, never independent persistence authority.
      if (semanticTrace && !intelligencePersistence && !intelligencePersistenceWarning) {
        semanticTrace = withSemanticPersistenceOutcome(semanticTrace, { status: "skipped", errorCode: null, careEntryCount: 0, memoryCount: 0 });
      }
      if (semanticTrace) logSemanticTrace(semanticTrace);
      return { intelligencePersistence, intelligencePersistenceWarning };
    },
    executeAuthorizedActions: async ({ persisted }) => {
      let applicationActions = parseStoredApplicationActions((response as { applicationActions?: unknown }).applicationActions);
      let applicationStateChanged = false;
      if (applicationActions.length) {
        const executed: FurviseApplicationAction[] = [];
        for (const action of applicationActions) {
          if (action.kind === "care_history.add" || !shouldAutoExecuteAction(action)) {
            executed.push(action);
            continue;
          }
          const execution = await runOptionalAskSubsystem({
            component: "application_action_preparation",
            fallback: null,
            operation: async () => {
              if (!isSecurityUuid(action.id)) return { action: { ...action, status: "failed" as const, errorMessage: "That action could not be prepared safely." }, changed: false, audit: { actionKind: action.kind, authorization: "allowed" as const, mutationClass: action.mutationClass, outcome: "failed" as const, petIdPresent: Boolean(action.petId) } };
              const executed = await executeActionCapability({ capabilityId: action.id, assistantMessageId: persisted.id, userId, mode: "auto" });
              return executed ? { action: executed.action, changed: executed.changed, audit: { actionKind: executed.action.kind, authorization: "allowed" as const, mutationClass: executed.action.mutationClass, outcome: executed.action.status === "succeeded" ? "succeeded" as const : "failed" as const, petIdPresent: Boolean(executed.action.petId) } } : null;
            },
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
      return { applicationActions, applicationStateChanged };
    },
    resolveCarePresentation: async ({ intelligence, actions }) => {
      const confirmedCarePersistence = preconfirmedCarePersistence || intelligence.intelligencePersistence?.carePersistence || null;
      const automaticCareAction = confirmedCarePersistence?.status === "persisted"
        && confirmedCarePersistence.careEntryIds.length > 0;
      const canonicalSuggestions = actions.applicationActions.length ? await persistCanonicalSuggestions({
        authority: createCanonicalCareAuthorityClient(), userId, actions: actions.applicationActions,
      }) : [];
      const row = canonicalSuggestions.find(item => item.status === "pending");
      const savedSuggestion = row ? { id: row.id, type: row.type, title: row.title,
        details: row.details || undefined, concernId: row.concern_id || undefined, payload: {} } : null;
      const persistenceMode: "automatic" | "suggested" | "none" = automaticCareAction ? "automatic" : savedSuggestion ? "suggested" : "none";
      const carePersistence = resolveAutomaticCareHistoryPresentation({
        confirmedPersistence: confirmedCarePersistence,
        hasSavedSuggestion: Boolean(savedSuggestion),
        memoryIds: intelligence.intelligencePersistence?.memoryIds || [],
      });
      return { automaticCareAction, carePersistence, persistenceMode, savedSuggestion };
    },
    assessTaskCompletion: ({ actions, care, intelligence }) => {
      // The reviewed answer body is immutable. Persistence outcomes belong in
      // receipts/cards, never in a second unreviewed prose rewrite.
      turnLifecycle.actions(actions.applicationActions.length);
      const reviewedCompletion = intelligenceResult?.answerValidation.completion || [];
      const reviewedCareWrite = reviewedCompletion.some(item => item.status === "action_ready"
        && (item.actionIndexes || []).some(index => index >= actions.applicationActions.length));
      const explicitHistoryWrite = (reviewedCareWrite || isExplicitCareHistorySaveRequest(sourceMessage))
        && reviewedCompletion.find(item => item.index === 0)?.status !== "refused";
      const taskExecution = assessTaskExecution({
        assessment: intelligenceResult?.answerValidation.assessment || null,
        completion: reviewedCompletion,
        responseMode: intelligenceResult?.reasoning.responseMode || null,
        actions: actions.applicationActions,
        careWriteRequired: explicitHistoryWrite,
        minimumCareEntries: 1,
        careReceipt: care.carePersistence,
        careExecutionFailed: Boolean(intelligence.intelligencePersistenceWarning),
      });
      turnLifecycle.outcomes(taskExecution.answerOutcome, taskExecution.mutationOutcome, taskExecution.readyForExecution);
      // The reviewed effects above are already complete. From settlement onward,
      // the Furvise Brain owns irreversible ordering and the only success exit.
      return taskExecution;
    },
    settleCreditDisposition: async ({ assessment: taskExecution }) => {
      let nextUsage = usage;
      let creditsUsed = 0;
      const incompleteTask = taskExecution.creditDisposition === "release";
      if (creditReserved && incompleteTask) {
        const released = await safeReleaseAiCredit({ logicalRequestId: requestId, payloadHash, requestId: creditRequestId, userId });
        turnLifecycle.credit(released ? "released" : "release_pending").settlement("release", released ? "reconciled" : "pending");
        nextUsage = await runOptionalAskSubsystem({
          component: "conversation_metadata", fallback: usage,
          operation: () => getRemainingAiCredits({ feature: "ask", monthlyAiCredits: usage.limit, planId: usage.planId, supabase, userId }),
          onFailure: optionalFailure,
        });
      } else if (creditReserved) {
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
      return { creditsUsed, nextUsage };
    },
    finalizeDurableAnswer: async ({ persisted, actions, care, settlement }) => {
      turnLifecycle.transition("COMPLETED");
      const canonicalResponse = {
        ...attachEpisodeReferences(actions.applicationActions.length ? { ...response, applicationActions: actions.applicationActions } : response, intelligenceResult?.reasoning.evidenceContract?.episodes, intelligenceResult?.reasoning),
        turn: turnLifecycle.snapshot(),
      };
      const durableFallback = await finalizePersistedAskAnswer({
        carePersistence: care.carePersistence, conversationId, messageId: persisted.id,
        responseData: canonicalResponse, requestId, supabase, userId,
      });
      if (durableFallback) {
        return {
          kind: "replay" as const,
          response: completedResponseFromPersisted(
            durableFallback,
            settlement.nextUsage,
            "Your answer is saved. Reopen the conversation to check the latest update and action status.",
          ),
        };
      }
      return { kind: "committed" as const, receipt: { canonicalResponse } };
    },
    invalidateCommittedState: ({ intelligence, actions, care }) => {
      if (didPersistEffectiveAskState(intelligence.intelligencePersistence, care.carePersistence)) {
        revalidateAskStateViews([
          petId,
          ...(intelligenceResult?.executionPlan.learnings.flatMap((learning) => learning.subjectType === "pet" && learning.subjectId ? [learning.subjectId] : []) || []),
        ]);
      }
      if (actions.applicationStateChanged) revalidateAskStateViews([petId]);
      emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
    },
    publishSuccess: ({ persisted, intelligence, actions, care, durableReceipt, settlement }) => buildSuccessfulAskResponse({
      assistantMessageId: persisted.id,
      applicationStateChanged: actions.applicationStateChanged,
      concern,
      creditsUsed: settlement.creditsUsed,
      contextUsed,
      conversationId,
      handledWithoutAi,
      intelligencePersistence: intelligence.intelligencePersistence,
      intelligencePersistenceWarning: intelligence.intelligencePersistenceWarning,
      requestId,
      response: durableReceipt.canonicalResponse,
      saveMetadata,
      safetyLevel: safetyLevel || (urgent ? "urgent" : "normal"),
      saved: true,
      shoppingSuppressed: shoppingSuppressed ?? Boolean(urgent),
      suggestion: care.savedSuggestion,
      carePersistence: care.carePersistence,
      persistenceMode: care.persistenceMode,
      persistedCareAction: care.automaticCareAction && intelligence.intelligencePersistence ? {
        careEntryId: intelligence.intelligencePersistence.persistedCareEntryId,
        concernId: intelligence.intelligencePersistence.persistedConcernId,
      } : null,
      usage: settlement.nextUsage,
      userMessageId,
      turn: turnLifecycle.snapshot(),
    }),
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

async function loadPersistedRequest({ petId, requestId, supabase, userId }: { petId: string; requestId: string; supabase: SupabaseClient; userId: string }): Promise<PersistedRequestState | null> {
  const { data: messages, error } = await recoverTransientRead(signal => supabase
    .from("ask_conversation_messages")
    .select("id, conversation_id, request_id, role, sequence_number, user_text, response_data, save_metadata, context_used, care_persistence")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .abortSignal(signal).returns<PersistedAskMessageRow[]>(), { attemptTimeoutMs: 3_000 })
    .catch(error => ({ data: null, error }));
  if (error) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this request.", 503, "request_lookup", error);
  if (!messages?.length) return null;
  const conversationId = messages[0].conversation_id;
  const { data: conversation, error: conversationError } = await recoverTransientRead(signal => supabase
    .from("ask_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .abortSignal(signal).maybeSingle<{ id: string }>(), { attemptTimeoutMs: 3_000 })
    .catch(error => ({ data: null, error }));
  if (conversationError) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this conversation.", 503, "request_lookup", conversationError);
  if (!conversation) throw new AskApiError("PET_NOT_FOUND", "That conversation is not available for this pet.", 404, "request_lookup");
  const userMessage = messages.find((message) => message.role === "user");
  const assistantMessage = messages.find((message) => message.role === "furvise");
  if (!userMessage) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this request.", 503, "request_lookup");
  return { assistantMessage: assistantMessage || null, conversationId, userMessage, userMessageId: userMessage.id, userSequence: userMessage.sequence_number };
}

async function loadPersistedRequestByConversation({ conversationId, requestId, supabase, userId }: { conversationId: string; requestId: string; supabase: SupabaseClient; userId: string }) {
  const { data: messages, error } = await recoverTransientRead(signal => supabase
    .from("ask_conversation_messages")
    .select("id, conversation_id, request_id, role, sequence_number, user_text, response_data, save_metadata, context_used, care_persistence")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .abortSignal(signal).returns<PersistedAskMessageRow[]>(), { attemptTimeoutMs: 3_000 })
    .catch(error => ({ data: null, error }));
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

async function finalizePersistedAskAnswer(input: {
  carePersistence: CarePersistenceResult; conversationId: string; messageId: string;
  responseData: CompletedAskResponse; requestId: string; supabase: SupabaseClient; userId: string;
}): Promise<PersistedRequestState | null> {
  const result = await finalizeDurableAskAnswer<PersistedRequestState>({
    attemptFinalize: async () => {
      const finalized = await finalizeAskAssistantResponse(input);
      if (!finalized.error && finalized.data === true) return true;
      throw finalized.error || new Error("ASK_RESPONSE_FINALIZE_FAILED");
    },
    createFailure: (failure) => new AskApiError("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, "persistence_failed", failure),
    isMatchingReadback: (durable) => Boolean(
      durable?.assistantMessage?.response_data && durable.assistantMessage.id === input.messageId
    ),
    onRecoveredReadback: (failure) => {
      logAskServerError("response_finalization_readback", failure, { requestId: input.requestId }, 200);
    },
    readback: () => loadPersistedRequestByConversation(input),
  });
  return result.kind === "replay" ? result.state : null;
}

function completedResponseFromPersisted(state: PersistedRequestState, usage: AiCreditStatus, persistenceWarning?: string) {
  const assistantMessage = state.assistantMessage;
  if (!assistantMessage?.response_data) throw new AskApiError("DATABASE_ERROR", "Furvise could not load this answer.", 503, "request_lookup");
  const storedResponse = assistantMessage.response_data;
  const unfinished = Boolean(storedResponse.turn && storedResponse.turn.finalStage !== "COMPLETED");
  const response = unfinished ? { ...storedResponse, turn: { ...storedResponse.turn!, taskOutcome: "limited" as const } } : storedResponse;
  if (unfinished) persistenceWarning = "The earlier attempt did not finish. Any requested changes are not confirmed.";
  return buildSuccessfulAskResponse({
    assistantMessageId: assistantMessage.id,
    contextUsed: assistantMessage.context_used,
    carePersistence: assistantMessage.care_persistence || undefined,
    conversationId: state.conversationId,
    requestId: assistantMessage.request_id || "",
    response,
    saved: true,
    persistenceWarning,
    saveMetadata: assistantMessage.save_metadata,
    safetyLevel: response.urgency === "urgent" ? "urgent" : response.urgency === "monitor" || response.urgency === "resolved" ? "monitor" : "normal",
    shoppingSuppressed: response.urgency === "urgent",
    usage,
    userMessageId: state.userMessageId,
    turn: response.turn || null,
  });
}

function validAssistantCompletionRow(value: unknown): { assistant_message_id: string } | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = value[0] as Record<string, unknown>;
  return typeof row?.assistant_message_id === "string"
    ? { assistant_message_id: row.assistant_message_id }
    : null;
}

function askFailure(code: InternalAskFailureCode, message: string, status: number, extra: Record<string, unknown> = {}, debugStage = "") {
  const diagnosticCode = safeAskDiagnosticStage(debugStage);
  return Response.json({
    code: publicAskFailureCode(internalFailureClass(code)),
    ...(diagnosticCode ? { diagnosticCode } : {}),
    message,
    success: false,
    ...extra,
  }, { status });
}

function internalFailureClass(code: InternalAskFailureCode): AskInternalFailure {
  if (code === "AI_DAILY_CAP_REACHED") return "service_daily_limit";
  if (code === "AUTH_REQUIRED") return "auth_required";
  if (code === "PET_NOT_FOUND") return "pet_unavailable";
  if (code === "INVALID_MESSAGE") return "invalid_input";
  if (code === "IDEMPOTENCY_CONFLICT") return "request_identity_changed";
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
  // A failed idempotency backend lookup establishes no identity conflict.
  // Keep the same retryable request rather than asking the owner to edit it.
  if (response.status >= 500) return askFailure("DATABASE_ERROR", "Furvise could not finish that answer. Please try again.", response.status, {}, "idempotency_backend");
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

const { failAiAdmission, finalizeAiAdmissionAfterPersistence } = createAskAdmissionSettlement(logAskServerError);
const { reconcilePersistedAskCredit, safeReleaseAiCredit } = createAskCreditSettlement({ logAskServerError, logAskStage });

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
      finalOutcome: trace.finalStage === "COMPLETED" ? trace.taskOutcome || "delivered" : trace.finalStage,
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
      errorCode: safeAskOperationalCode((error instanceof AskPipelineError ? error.diagnostics.providerErrorCode : null) || databaseDiagnostic.code || databaseError?.code || stage),
      eventType: "application_error", feature: "ask", operationId: requestId,
      requestId, route: "/api/ask", severity: "high",
      metadata: { component: stage, finalErrorClass: classifyAskDatabaseFailure(error, 0) },
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
    ticketArrived: event.ticketArrived ?? null,
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
    record_inventory: "Saved note count",
    operation_receipt: "Verified operation status",
    episode_result: "Verified episode result",
    active_concern: "Active concerns",
    active_episode: "Current episodes",
    care_update: "Recent care updates",
    conversation_turn: "Recent conversation",
    profile: "Pet profile",
    product_context: "Product history",
    remembered_detail: "Remembered details",
    resolved_episode: "Recently resolved episodes",
    episode_evidence: "Source-linked episode history",
  } satisfies Record<AskContextRecord["sourceType"], string>)[record.sourceType];
}
