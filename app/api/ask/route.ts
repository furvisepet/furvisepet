import { isDeepStrictEqual } from "node:util";
import { resolveAskHistoryAccess } from "../../lib/intelligence/history-access.ts";
import type { DogProfileRow } from "../../lib/supabase.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildAskConversationResponse } from "../../lib/ask.mjs";
import { ASK_REQUEST_KEYS, parseConfirmedTemporalScope } from "../../lib/ask-request-contract.ts";
import { resolveAskTimeZone } from "../../lib/ask-time-zone.ts";
import { runReadOnlyAsk } from "../../lib/ask-read-only/core.mjs";
import { loadReadOnlyContext } from "../../lib/ask-read-only/context.ts";
import { readOnlyProvider } from "../../lib/ask-read-only/provider.ts";
import { createReadOnlyDataAccess } from "../../lib/ask-read-only/data.ts";
import { buildReadOnlyPublication } from "../../lib/ask-read-only/publication.ts";
import { OperationDeadline } from "../../lib/ai/execution-deadline.ts";
import { ASK_OPERATION_TIMEOUT_MS, ASK_MAX_QUESTION_CHARACTERS } from "../../lib/ai/ask-execution-limits.ts";
import { createAskAdmissionSettlement } from "../../lib/ai/ask-admission-settlement.ts";
import { createAskCreditSettlement } from "../../lib/ai/ask-credit-settlement.ts";
import { AskPipelineError, getAskModelConfiguration, getAskProviderCooldown, type AskProviderEvent } from "../../lib/ai/ask-reasoning.ts";
import { AskTurnLifecycle, deriveAskAttemptId, type AskTurnTrace } from "../../lib/ai/ask-turn-model.ts";
import { safeAskDiagnosticStage } from "../../lib/ai/ask-error-diagnostic.ts";
import { safeAskProviderErrorDiagnostic } from "../../lib/ai/ask-provider-error-diagnostic.ts";
import { admitAiOperation, type AiOperationAdmission } from "../../lib/ai/usage-guard/admission.ts";
import { AiAdmissionError } from "../../lib/ai/usage-guard/errors.ts";
import { AiCreditLedgerError, buildDevelopmentAiCreditFallback, completeAiCredit, getAiCreditLedgerDiagnostic, getRemainingAiCredits,
 hashAiCreditPayload, isAiCreditIntegrityError, isMissingAiUsageTableError, reserveAiCredit, setAiCreditDisposition, type AiCreditStatus } from "../../lib/ai/usage-ledger.ts";
import { emitOperationalEvent } from "../../lib/operations/events";
import { FURVISE_ANSWER_UNAVAILABLE_MESSAGE, FURVISE_ASK_UNAVAILABLE_MESSAGE, publicAskFailureCode, type AskInternalFailure } from "../../lib/furvise-output.ts";
import { type PlanId } from "../../lib/billing/plan-limits.ts";
import { resolveEffectiveEntitlements, type EffectiveEntitlements } from "../../lib/billing/entitlements.ts";
import { deriveConversationTitle } from "../../lib/ask-conversations.ts";
import { buildImmediateEmergencyGuidance, detectImmediateAskEmergency } from "../../lib/ask-safety-context.ts";
import { classifyCurrentPetLoss } from "../../lib/ai/pet-loss.ts";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid as isSecurityUuid, readBoundedJson } from "../../lib/security/request.ts";
import { RateLimitRejection, requireRateLimitedRequest } from "../../lib/security/rate-limit";
import { claimIdempotentOperation } from "../../lib/security/idempotency";
import { claimWithRestoredAskOrigin } from "../../lib/ask-restored-retry.ts";
import { validateSensitiveRequestOriginResponse } from "../../lib/security/headers/origin-policy.ts";
import { recoverTransientRead } from "../../lib/security/read-recovery.ts";
import { readAskProfiles, classifyAskDatabaseFailure } from "../../lib/ask-profile-read.ts";
import { beginAskConversationTurn, completeAskConversationTurn, finalizeAskAssistantResponse } from "../../lib/ask-conversation-authority.ts";
import { finalizeDurableAskAnswer } from "../../lib/furvise-brain/durable-answer-finalization.ts";
import { buildSuccessfulAskResponse } from "../../lib/intelligence/finalize-ask-publication.ts";
import type { CarePersistenceResult } from "../../lib/intelligence/types.ts";

const friendlyAnswerFailure = FURVISE_ANSWER_UNAVAILABLE_MESSAGE;
export const maxDuration = 210;
const askRequestTimeoutMs = ASK_OPERATION_TIMEOUT_MS;
const askGuardOperationTtlSeconds = 90 * 24 * 60 * 60;

type InternalAskFailureCode = "ANSWER_NOT_COMPLETED" | "AI_DAILY_CAP_REACHED" | "AUTH_REQUIRED" | "PET_NOT_FOUND" | "INVALID_MESSAGE" | "IDEMPOTENCY_CONFLICT" | "REQUEST_IN_PROGRESS" | "RATE_LIMITED" | "AI_RATE_LIMITED" | "AI_CREDITS_EXHAUSTED" | "AI_UNAVAILABLE" | "DATABASE_ERROR" | "UNKNOWN_ERROR";

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
    confirmedTemporalScope?: unknown;
    mode?: unknown;
  } | null;
  if (body?.mode !== undefined) return askFailure("INVALID_MESSAGE", "Choose a valid submission mode.", 400);
  const noteMode = body?.mode === "note" ? "note" as const : undefined;
  let confirmedTemporalScope;
  try { confirmedTemporalScope = parseConfirmedTemporalScope(body?.confirmedTemporalScope); }
  catch { return askFailure("INVALID_MESSAGE", "Choose a valid date scope.", 400, {}, "request_validation"); }

  const question = typeof body?.message === "string" ? body.message.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const logicalTurnId = typeof body?.logicalTurnId === "string" && isUuid(body.logicalTurnId) ? body.logicalTurnId : "";
  const requestId = logicalTurnId;
  const locale = resolveAskLocale(body?.locale, request.headers.get("accept-language"));
  let aiCreditPayload = { conversationId, locale, petId, question, ...(noteMode ? { mode: noteMode } : {}), ...(body?.timeZone ? { timeZone: resolveAskTimeZone(body.timeZone) } : {}), ...(confirmedTemporalScope ? { confirmedTemporalScope } : {}) };
  let aiCreditPayloadHash = hashAiCreditPayload("ask", aiCreditPayload);
  // Persisted turns do not retain this scope. Never execute a scoped request
  // until durable identity/reconstruction and interpretation binding exist.
  if (confirmedTemporalScope) return askFailure("INVALID_MESSAGE", "Date-scoped questions are not available yet.", 400, {}, "request_validation");

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
    const profileQuery = supabase.from("dog_profiles").select("id,user_id,name,species,sex").eq("user_id", userId).neq("lifecycle_status", "archived").retry(false).abortSignal(signal);
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


  const creditRequestId=attemptId;
  let creditReserved=false,creditFinalState="not_reserved",providerCallCount=0;
  let generationStage="read_only_context";
  let aiAdmission:AiOperationAdmission|null=null;
  let aiAdmissionFinalized=false;
  const rateGateRef:{current:Awaited<ReturnType<typeof requireRateLimitedRequest>>|null}={current:null};
  const onProviderEvent=(event:AskProviderEvent)=>{
   turnLifecycle.providerEvent(event);providerCallCount=turnLifecycle.snapshot().providerCallCount;
   logAskProviderEvent(event,{conversationId:preparedRequest.conversationId,petId,providerCallCount,requestId});
  };
  let readResult:Awaited<ReturnType<typeof runReadOnlyAsk>>;
  try {
   const readContext=await loadReadOnlyContext(supabase,userId,petId,preparedRequest.conversationId,preparedRequest.userMessageId,question);
   turnLifecycle.transition("CONTEXT_READY").route("pet_care","ai");
   rateGateRef.current=await requireRateLimitedRequest({idempotencyKey:requestId,payload:{conversationId:preparedRequest.conversationId,petId,question},
    policy: "ASK_AI",request,requestId,route:"/api/ask",userId});
   if(!usage.allowed)throw new AiCreditLimitError();
   const model=getAskModelConfiguration().primary;
   const cooldown=getAskProviderCooldown(model);
   if(cooldown.active)throw new AskPipelineError("primary_provider_failed","Ask provider is cooling down.",{elapsedMs:0,model,providerStatus:429,retryAfterMs:cooldown.retryAfterMs});
   aiAdmission = await admitAiOperation({feature:"ask",intendedModel:model,deadline:execution.deadline,operationTtlSeconds:askGuardOperationTtlSeconds,
    payload:{conversationId:preparedRequest.conversationId,petId,question},requestId:logicalTurnId,userId});
   turnLifecycle.transition("AI_ADMITTED");
   readResult=await withTimeout(aiAdmission.run(async()=>{
    turnLifecycle.transition("GENERATING");
    if(usage.ledgerMode!=="development_missing_migration"){
     const reservation=await reserveAiCredit({feature:"ask",logicalRequestId:logicalTurnId,payloadHash:aiCreditPayloadHash,requestId:creditRequestId,userId});
     if(reservation.status==="limit_reached")throw new AiCreditLimitError();
     if(reservation.status!=="reserved")throw new AiCreditLedgerError("reservation_failed",new Error("AI_CREDIT_REPLAY_REQUIRED"),"reserve_ai_credit","rpc");
     creditReserved=true;creditFinalState="reserved";
    }
    generationStage="read_only_answer";
    return runReadOnlyAsk({ownerId:userId,selectedPetId:petId,question,now:new Date().toISOString(),
     timeZone:resolveAskTimeZone(aiCreditPayload.timeZone),...readContext},{
      onAnswerBoundary:(details:Record<string,unknown>)=>console.info("[Ask read-only] answer boundary",{requestId,...details}),
      onSelectionRejected:(details:Record<string,unknown>)=>console.warn("[Ask read-only] selection rejected",{requestId,...details}),
      provider:readOnlyProvider(model,onProviderEvent),read:createReadOnlyDataAccess(supabase,userId,resolveAskTimeZone(aiCreditPayload.timeZone),historyAccess,details=>console.info("[Ask read-only] retrieval",{requestId,selectedHandle:"p"+(readContext.pets.findIndex(p=>p.id===petId)+1),...details}))
     });
   }),execution.deadline.allocate("answer_generation",askRequestTimeoutMs,4000));
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
    // This path needs both selection and independent grounded answer/review.
    // After a started call, restarting that pipeline cannot fit the same turn's
    // durable two-call budget. Keep identity/accounting intact and require an
    // explicit reviewed new question; never offer a futile same-turn retry.
    // Zero-call infrastructure failures and durable answer GET recovery retain
    // their existing retry behavior.
    if (providerCallCount > 0 || (error instanceof AiAdmissionError && error.code === "AI_PROVIDER_BUDGET_EXHAUSTED")) {
      const stage = error instanceof AskPipelineError ? error.stage : /^ASK_READ_(?:INTERNAL_ID|ANSWER|QUOTE|CALC|CLINICAL)/.test((error as {code?:string})?.code??"") ? "read_contract" : generationStage;
      logAskServerError(stage, error, { conversationId: preparedRequest.conversationId, petId, requestId }, 503);
      turnLifecycle.fail(stage, false); emitAskTurnTrace(turnLifecycle.snapshot(), userId, petId);
      return askFailure("ANSWER_NOT_COMPLETED", "Your question is saved. Review it before sending a new question.", 503, { retryable: false, requestId }, stage);
    }
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


  try {
  console.info("[Ask read-only] completed", {requestId,providerCallCount,sources:readResult.sources.length,readTools:readResult.coverage.length,limited:readResult.answer.limited});
  const {response,contextUsed,limited}=buildReadOnlyPublication(readResult,userId,profiles[0].name);
  turnLifecycle.transition("ANSWER_VALIDATED").actions(0).outcomes(limited?"limited":"complete","not_requested",false);
  const saveMetadata={answerType:response.answerType,persistenceEligible:false,reason:"read_only_ask"};
   const result=await persistReadOnlyAnswer({supabase,userId,petId,requestId,preparedRequest,response,contextUsed,saveMetadata,turnLifecycle,
    usage,creditReserved,creditRequestId,payloadHash:aiCreditPayloadHash,limited});
   await finalizeAiAdmissionAfterPersistence({admission:aiAdmission,alreadyFinalized:aiAdmissionFinalized,
    assessment:{outcome:limited?"limited":"complete"} as never,requestId,response:result});
   return result;
  } catch(error) {
   await failAiAdmission(aiAdmission,error,aiAdmissionFinalized,requestId);
   if(creditReserved && !isAiCreditIntegrityError(error))await safeReleaseAiCredit({logicalRequestId:requestId,payloadHash:aiCreditPayloadHash,requestId:creditRequestId,userId}).catch(()=>false);
   return handleAskApiError(error,requestId);
  } finally {await rateGateRef.current?.release();}
  });
}

async function persistReadOnlyAnswer(input:{
 supabase:SupabaseClient;userId:string;petId:string;requestId:string;preparedRequest:PreparedAskRequest;response:CompletedAskResponse;
 contextUsed:unknown;saveMetadata:unknown;turnLifecycle:AskTurnLifecycle;usage:AiCreditStatus;creditReserved:boolean;creditRequestId:string;payloadHash:string;limited:boolean;
}){
 const {supabase,userId,petId,requestId,preparedRequest,response,contextUsed,saveMetadata,turnLifecycle,creditRequestId,payloadHash}=input;
 const {conversationId,userMessageId}=preparedRequest;
 const completion=await completeAskConversationTurn({contextUsed,conversationId,intelligenceValidation:null,persistenceGovernance:null,
  preview:response.directAnswer.slice(0,220).replace(/[\uD800-\uDBFF]$/,""),requestId,responseData:{...response,turn:turnLifecycle.snapshot()},saveMetadata,userId,userMessageId});
 let row=validAssistantCompletionRow(completion.data);
 if(!row) {
  const previous=await loadPersistedRequestByConversation({conversationId,requestId,supabase,userId});
  if(previous?.assistantMessage?.response_data?.turn?.finalStage==="COMPLETED")return completedResponseFromPersisted(previous,input.usage);
  if(previous?.assistantMessage){
   const {turn:storedTurn,...storedBody}=previous.assistantMessage.response_data??{};
   void storedTurn;
   if(!isDeepStrictEqual(storedBody,JSON.parse(JSON.stringify(response))))throw new AskApiError("DATABASE_ERROR",FURVISE_ASK_UNAVAILABLE_MESSAGE,503,"persistence_failed");
   row={assistant_message_id:previous.assistantMessage.id};
  }
 }
 if(completion.error&&!row||!row)throw new AskApiError("DATABASE_ERROR",FURVISE_ASK_UNAVAILABLE_MESSAGE,503,"assistant_persistence",completion.error);
 turnLifecycle.transition("ANSWER_PERSISTED");
 // The immutable answer must be recoverable before an irreversible credit
 // decision. Pending settlement is already a supported durable turn state.
 if(input.creditReserved)turnLifecycle.credit(input.limited?"release_pending":"completion_pending").settlement(input.limited?"release":"complete","pending");
 else turnLifecycle.credit("not_required");
 turnLifecycle.transition("COMPLETED");
 const carePersistence:CarePersistenceResult={status:"skipped",careEntryIds:[],concernIds:[],errorCode:null,currentSafetyState:null,alreadyPersisted:false};
 await finalizePersistedAskAnswer({carePersistence,conversationId,messageId:row.assistant_message_id,
  responseData:{...response,turn:turnLifecycle.snapshot()},requestId,supabase,userId});
 let creditsUsed=0,usage=input.usage;
 if(input.creditReserved) {
  if(input.limited){
   try {
    const released=await safeReleaseAiCredit({logicalRequestId:requestId,payloadHash,requestId:creditRequestId,userId});
    turnLifecycle.credit(released?"released":"release_pending").settlement("release",released?"reconciled":"pending");
   }catch(error){
    if(isAiCreditIntegrityError(error))throw error;
    turnLifecycle.credit("release_pending").settlement("release","pending");
    logAskServerError("credit_release_pending",error,{requestId},200);
   }
  }else{
   creditsUsed=1;
   try {
    await setAiCreditDisposition({disposition:"complete",feature:"ask",logicalRequestId:requestId,payloadHash,requestId:creditRequestId,userId});
    await completeAiCredit({feature:"ask",logicalRequestId:requestId,payloadHash,requestId:creditRequestId,userId});
    turnLifecycle.credit("completed").settlement("complete","reconciled");
   }catch(error){
    if(isAiCreditIntegrityError(error))throw error;
    // Keep the already durable answer available. Its recorded completion
    // state remains pending; replay trusts the separate ledger disposition,
    // never this message as billing authority.
    turnLifecycle.credit("completion_pending");
    logAskServerError("credit_completion",error,{requestId},200);
   }
  }
  usage=await getRemainingAiCredits({feature:"ask",monthlyAiCredits:usage.limit,planId:usage.planId,supabase,userId}).catch(()=>usage);
 }
 const canonicalResponse={...response,turn:turnLifecycle.snapshot()};
 emitAskTurnTrace(turnLifecycle.snapshot(),userId,petId);
 return buildSuccessfulAskResponse({assistantMessageId:row.assistant_message_id,contextUsed,conversationId,creditsUsed,requestId,response:canonicalResponse,
  saved:true,saveMetadata,safetyLevel:"normal",shoppingSuppressed:false,usage,userMessageId,turn:turnLifecycle.snapshot()});
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
      durable?.assistantMessage?.response_data?.turn?.finalStage === "COMPLETED"
      && durable.assistantMessage.id === input.messageId
      && isDeepStrictEqual(JSON.parse(JSON.stringify(durable.assistantMessage.response_data)), JSON.parse(JSON.stringify(input.responseData)))
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
  if (code === "ANSWER_NOT_COMPLETED") return "answer_not_completed";
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

function logAskServerError(stage: string, error: unknown, context: Record<string, unknown>, httpStatus: number) {
  const databaseDiagnostic = getAiCreditLedgerDiagnostic(error);
  const databaseError = error as { code?: string; details?: string; hint?: string; message?: string } | null;
  const requestId = typeof context.requestId === "string" ? context.requestId : crypto.randomUUID();
  if (httpStatus >= 500 || /persistence|reconciliation|credit_(?:completion|release)/.test(stage)) {
    emitOperationalEvent({
      errorCode: safeAskOperationalCode((error instanceof AskPipelineError ? error.diagnostics.providerErrorCode : null) || databaseDiagnostic.code || databaseError?.code || stage),
      eventType: "application_error", feature: "ask", operationId: requestId,
      requestId, route: "/api/ask", severity: "high",
      metadata: { component: stage, finalErrorClass: error instanceof AskPipelineError ? "provider" : /^ASK_READ_(?:QUOTE|CALC|TOOL|ANSWER|INTERNAL_ID|PET|SOURCE|CLINICAL)/.test(databaseError?.code || databaseError?.message || "") ? "read_contract" : classifyAskDatabaseFailure(error, 0) },
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
    providerEnvelope: event.providerEnvelope ?? null,
    providerError: event.providerError ? safeAskProviderErrorDiagnostic(event.providerError) : null,
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
  if (!userData.user.email_confirmed_at || userData.user.is_anonymous) return { response: askFailure("AUTH_REQUIRED", "Verify your email before using Ask.", 403, {}, "authentication") };
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
