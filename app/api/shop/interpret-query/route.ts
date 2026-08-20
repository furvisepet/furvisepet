import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAiRuntimeDiagnostics } from "../../../lib/ai/config";
import { getAskModelConfiguration } from "../../../lib/ai/ask-reasoning";
import { AiCreditLedgerError, getRemainingAiCredits, runWithAiCredit, type AiCreditStatus } from "../../../lib/ai/usage-ledger";
import { runAdmittedAiOperation } from "../../../lib/ai/usage-guard/admission";
import { AiAdmissionError } from "../../../lib/ai/usage-guard/errors";
import type { PlanId } from "../../../lib/billing/plan-limits";
import { resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { buildPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { normalizeProductCountry } from "../../../lib/product-providers";
import {
  FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
  FURVISE_SEARCH_FALLBACK_MESSAGE,
} from "../../../lib/furvise-voice";
import { MIN_SHOP_QUERY_LENGTH } from "../../../lib/shop";
import {
  ShopQueryInterpretationValidationError,
  buildFallbackShopQueryInterpretation,
  buildShopInterpretationPromptInput,
  classifyShopQueryCapability,
  hasShopGroomingSynonymIntent,
  isVagueShopQueryWithoutSignal,
  parseShopQueryInterpretation,
  type ShopQueryInterpretation,
} from "../../../lib/shop-query";
import {
  buildFurviseContext,
  persistFeatureIntelligenceLearnings,
  resolveProductSafety,
  runFeatureIntelligence,
  type FeatureIntelligenceResult,
} from "../../../lib/intelligence";
import {
  calculatePetContextHash,
  hashShopInterpretationCacheKey,
  normalizeShopQueryForCache,
  readCachedShopQueryInterpretation,
  saveShopQueryInterpretationCache,
  SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
  type SupabaseCacheLike,
} from "../../../lib/shop/query-interpretation-cache";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid as isSecurityUuid, readBoundedJson } from "../../../lib/security/request";
import { RateLimitRejection, requireRateLimitedRequest } from "../../../lib/security/rate-limit";
import { validateSensitiveRequestOriginResponse } from "../../../lib/security/headers/origin-policy";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";

const maxShopQueryLength = 240;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type InterpretShopQueryBody = {
  petId?: unknown;
  productCountry?: unknown;
  query?: unknown;
  requestId?: unknown;
};

export async function GET(request: Request) {
  const context = await loadShopInterpretationRequestContext(request);
  if ("response" in context) return context.response;
  const usage = await loadShopUsage(context).catch(() => null);
  if (!usage) return Response.json({ error: FURVISE_SEARCH_FALLBACK_MESSAGE, productAiUnavailable: true }, { status: 503 });
  return Response.json({ usage });
}

export async function POST(request: Request) {
  const context = await loadShopInterpretationRequestContext(request);
  if ("response" in context) return context.response;

  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.productAi); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "The product request is too large." : "Send a valid product request.", usage: null }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["petId", "productCountry", "query", "requestId"])) return Response.json({ error: "The product request contains unsupported fields.", usage: null }, { status: 400 });
  const body = rawBody as InterpretShopQueryBody;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productCountry =
    typeof body?.productCountry === "string" ? normalizeProductCountry(body.productCountry) : null;
  const normalizedQuery = normalizeShopQueryForCache(query);
  const requestId = typeof body?.requestId === "string" && isUuid(body.requestId) ? body.requestId : randomUUID();
  const queryHashForLogs = normalizedQuery ? safeDiagnosticHash(normalizedQuery) : "";
  const runtimeDiagnostics = getAiRuntimeDiagnostics();

  logShopInterpretationDiagnostic("request started", {
    ...runtimeDiagnostics,
    normalizedQuery,
    petIdHash: petId ? safeDiagnosticHash(petId) : null,
    petIdPresent: Boolean(petId),
    productCountry,
    queryHash: queryHashForLogs,
    routeCalled: true,
    userIdHash: safeDiagnosticHash(context.userId),
    userIdPresent: Boolean(context.userId),
  });

  if (!isSecurityUuid(petId) || query.length < MIN_SHOP_QUERY_LENGTH || query.length > maxShopQueryLength) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: "invalid_request",
      queryLength: query.length,
      queryTooLong: query.length > maxShopQueryLength,
      queryTooShort: query.length < MIN_SHOP_QUERY_LENGTH,
      petIdPresent: Boolean(petId),
    });
    return Response.json({ error: "Choose a pet and enter a shorter shopping query.", usage: null }, { status: 400 });
  }

  if (isVagueShopQueryWithoutSignal(query)) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: "vague_query_without_signal",
      queryLength: query.length,
      petIdPresent: Boolean(petId),
    });
    return Response.json(
      {
        error: "Try a specific product type like shampoo, dental treats, grooming wipes, flea comb, or chicken-free food.",
        vagueQuery: true,
        usage: null,
      },
      { status: 400 },
    );
  }

  let memory: PetMemoryContext;
  let liveContext: Awaited<ReturnType<typeof buildFurviseContext>>;
  try {
    liveContext = await buildFurviseContext({
      currentMessage: query, feature: "product_query_interpretation", locale: request.headers.get("accept-language")?.split(",")[0] || "en",
      petId, supabase: context.supabase, userId: context.userId,
    });
    memory = buildPetMemoryContext({
      careEntries: liveContext.careEntries,
      productFeedback: liveContext.productFeedback,
      profile: liveContext.pet,
      savedMemories: liveContext.legacyPetMemories,
    });
  } catch (error) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "auth/pet ownership failure",
      error: normalizeDiagnosticError(error),
      petIdHash: safeDiagnosticHash(petId),
      reason: "pet_memory_context_unavailable",
      userIdHash: safeDiagnosticHash(context.userId),
    });
    return Response.json({ error: "No matching pet profile was found.", usage: null }, { status: 404 });
  }

  logShopInterpretationDiagnostic("pet memory context built", {
    petIdHash: safeDiagnosticHash(petId),
    hasCareContext: memory.timeline.recentEntries.length > 0 || memory.savedDetails.length > 0 || memory.derived.summaryBullets.length > 0,
    petMemoryContextBuilt: true,
    savedDetailCount: memory.savedDetails.length,
    timelineEntryCount: memory.timeline.recentEntries.length,
    userIdHash: safeDiagnosticHash(context.userId),
  });
  const productSafety = resolveProductSafety(liveContext);

  const petContextHash = calculatePetContextHash(memory, liveContext.memories);
  const queryHash = hashShopInterpretationCacheKey({
    normalizedQuery,
    petContextHash,
    petId,
    schemaVersion: SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
    userId: context.userId,
  });
  const cached = await readCachedShopQueryInterpretation({
    petContextHash,
    petId,
    queryHash,
    schemaVersion: SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
    supabase: context.supabase as unknown as SupabaseCacheLike,
    userId: context.userId,
  });
  if (productSafety.shoppingSuppressed) {
    const interpretation = buildFallbackShopQueryInterpretation({ memory, productCountry, query });
    return Response.json({
      cached: false, fallback: true, mode: "deterministic", aiRequired: false, creditsExhausted: false, productSafety,
      interpretation: { ...interpretation, safetyFlags: { ...interpretation.safetyFlags, urgentCare: true } },
      interpretationSource: "fallback", safetySuppressed: true, usage: null,
    });
  }
  if (cached?.source === "ai") {
    logShopInterpretationDiagnostic("cache hit", {
      cachedSource: cached.source,
      interpretationSource: "cache",
      queryHash: queryHashForLogs,
    });
    return Response.json({
      cached: true,
      cachedSource: cached.source,
      fallback: false,
      interpretation: { ...cached.interpretation, safetyFlags: { ...cached.interpretation.safetyFlags, urgentCare: false } },
      interpretationSource: "cache",
      productSafety,
      mode: "ai", aiRequired: false, creditsExhausted: false, usage: null,
    });
  }

  if (cached?.source === "fallback") {
    logShopInterpretationDiagnostic("cached fallback found", {
      cachedSource: cached.source,
      interpretationSource: "cache",
      queryHash: queryHashForLogs,
      reason: "cached_fallback_requires_capability_check",
    });
  }

  const fallback = () => {
    const value = buildFallbackShopQueryInterpretation({ memory, productCountry, query });
    return { ...value, safetyFlags: { ...value.safetyFlags, urgentCare: productSafety.shoppingSuppressed } };
  };
  const capability = classifyShopQueryCapability(query);
  if (capability === "deterministic") {
    return Response.json({
      cached: false, deterministic: true, fallback: true, mode: "deterministic", aiRequired: false, creditsExhausted: false, productSafety,
      interpretation: fallback(), interpretationSource: "fallback", usage: null,
    });
  }

  let usage: AiCreditStatus;
  try {
    usage = await loadShopUsage(context);
  } catch (error) {
    logShopInterpretationFallback(error, { category: "code path never calling AI", reason: "shop_usage_persistence_unavailable" });
    return Response.json({
      cached: false, fallback: true, mode: "deterministic", aiRequired: true, aiUnavailable: true, creditsExhausted: false,
      interpretation: fallback(), interpretationSource: "fallback", productSafety, usage: null,
      message: "AI guidance is unavailable right now, but these products match the filters we could identify.",
    });
  }

  if (!usage.allowed) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: cached?.source === "fallback" ? "usage_limit_returning_cached_fallback" : "usage_limit_reached",
      usageCount: usage.count,
      usageLimit: usage.limit,
    });
    if (cached?.source === "fallback") {
      return Response.json({
        cached: true,
        cachedSource: cached.source,
        fallback: true,
        interpretation: { ...cached.interpretation, safetyFlags: { ...cached.interpretation.safetyFlags, urgentCare: false } },
        interpretationSource: "cache",
        productSafety,
        mode: "deterministic", aiRequired: true, creditsExhausted: true, usage,
      });
    }
    return Response.json({
      cached: false,
      fallback: true,
      mode: "deterministic",
      aiRequired: true,
      creditsExhausted: true,
      interpretation: fallback(),
      interpretationSource: "fallback",
      limitReached: true,
      message: "You can still browse products directly by category or keyword.",
      productSafety,
      usage,
    });
  }

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  const idempotency = await claimIdempotentOperation({ candidateKey: requestId, leaseSeconds: 180, operationType: "product.interpret", payload: { petId, productCountry, query }, request, retention: "financial", supabase: context.supabase, userId: context.userId });
  if ("response" in idempotency) return idempotency.response;
  return idempotency.operation.execute(async () => { try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { petId, productCountry, query },
      policy: "PRODUCT_GUIDANCE_AI",
      request,
      requestId,
      route: "/api/shop/interpret-query",
      userId: context.userId,
    });
    logShopInterpretationDiagnostic("calling AI provider", {
      ...runtimeDiagnostics,
      queryHash: queryHashForLogs,
    });
    let persistenceWarning = "";
    const generated = await runAdmittedAiOperation({
      feature: "product_query", intendedModel: getAskModelConfiguration().primary,
      payload: { petId, productCountry, query }, requestId, userId: context.userId,
    }, () => runWithAiCredit<FeatureIntelligenceResult<ShopQueryInterpretation>>({
      feature: "product_query",
      monthlyAiCredits: context.monthlyAiCredits,
      payload: { petId, productCountry, query },
      planId: context.planId,
      requestId,
      supabase: context.supabase,
      userId: context.userId,
      generate: async () => runFeatureIntelligence({
        context: liveContext,
        feature: "product_query_interpretation",
        featureInput: buildShopInterpretationPromptInput({ memory, productCountry, query }),
        maxOutputTokens: 520,
        parseValue: parseShopQueryInterpretation,
      }),
      beforeComplete: async (result) => {
        if (!result.acceptedLearnings.length) return;
        try {
          await persistFeatureIntelligenceLearnings({
            careActions: [], feature: "product_query", learnings: result.acceptedLearnings,
            operationOwnerToken: idempotency.operation.ownerToken, payloadHash: idempotency.operation.payloadHash,
            petId, requestId, sourceInput: query, supabase: context.supabase, userId: context.userId,
          });
        } catch (error) {
          persistenceWarning = "Approved preferences could not be saved.";
          logShopInterpretationFallback(error, classifyShopInterpretationFailure(error, runtimeDiagnostics));
        }
      },
    }));
    const normalized = generated.value.value;
    logShopInterpretationDiagnostic("AI interpretation succeeded", {
      category: normalized.category,
      confidence: normalized.confidence,
      explicitConstraintCount:
        normalized.explicitConstraints.avoidIngredients.length + normalized.explicitConstraints.requiredIngredients.length,
      interpretationSource: "ai",
      queryHash: queryHashForLogs,
      species: normalized.species,
      urgentCare: normalized.safetyFlags.urgentCare,
    });
    const floored = applyDeterministicInterpretationFloor(normalized, fallback());
    const interpretation = { ...floored, safetyFlags: { ...floored.safetyFlags, urgentCare: productSafety.shoppingSuppressed } };
    await saveShopQueryInterpretationCache({
      interpretation,
      normalizedQuery,
      petContextHash,
      petId,
      queryHash,
      schemaVersion: SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
      source: "ai",
      supabase: context.supabase as unknown as SupabaseCacheLike,
      userId: context.userId,
    });
    return Response.json({
      cached: false,
      fallback: false,
      interpretation,
      interpretationSource: "ai",
      productSafety,
      ...(persistenceWarning ? { persistenceWarning } : {}),
      usage: generated.usage,
      mode: "ai", aiRequired: true, creditsExhausted: false,
    });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    const admissionCode = error instanceof AiAdmissionError
      ? (error.code === "AI_PROVIDER_BUDGET_EXHAUSTED" ? "AI_TEMPORARILY_UNAVAILABLE" : error.code)
      : undefined;
    const failure = classifyShopInterpretationFailure(error, runtimeDiagnostics);
    logShopInterpretationFallback(error, failure);
    const fallbackInterpretation = fallback();
    await saveShopQueryInterpretationCache({
      interpretation: fallbackInterpretation,
      normalizedQuery,
      petContextHash,
      petId,
      queryHash,
      schemaVersion: SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
      source: "fallback",
      supabase: context.supabase as unknown as SupabaseCacheLike,
      userId: context.userId,
    });
    return Response.json({
      cached: false,
      fallback: true,
      fallbackReason: failure.reason,
      interpretation: fallbackInterpretation,
      interpretationSource: "fallback",
      productSafety,
      mode: "deterministic", aiRequired: true, aiUnavailable: true, creditsExhausted: false,
      message: "AI guidance is unavailable right now, but these products match the filters we could identify.",
      ...(admissionCode ? { code: admissionCode } : {}),
      usage,
    });
  } finally {
    if (rateGate) await rateGate.release();
  } });
}

async function loadShopInterpretationRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      monthlyAiCredits: number;
      supabase: SupabaseClient;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  logShopInterpretationDiagnostic("route context loading", {
    ...getAiRuntimeDiagnostics(),
    authHeaderPresent: Boolean(token),
    routeCalled: true,
  });
  if (!token) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "auth/pet ownership failure",
      reason: "missing_auth_token",
    });
    return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: "supabase_not_configured",
      supabaseKeyPresent: Boolean(key),
      supabaseUrlPresent: Boolean(url),
    });
    return { response: Response.json({ error: FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE }, { status: 503 }) };
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "auth/pet ownership failure",
      reason: "session_expired_or_invalid",
    });
    return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };
  }
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };

  const entitlements = await resolveEffectiveEntitlements(supabase);
  return { monthlyAiCredits: entitlements.limits.monthlyAiCredits, planId: entitlements.effectivePlan, supabase, userId: userData.user.id };
}

async function loadShopUsage(context: { monthlyAiCredits: number; planId: PlanId; supabase: SupabaseClient; userId: string }) {
  try {
    const usage = await getRemainingAiCredits({ monthlyAiCredits: context.monthlyAiCredits, planId: context.planId, supabase: context.supabase, userId: context.userId });
    logShopInterpretationDiagnostic("Product AI usage loaded", { helper: "getRemainingAiCredits", table: "ai_usage_events", usageLoadSucceeded: true, userIdPresent: true });
    return usage;
  } catch (error) {
    if (error instanceof AiCreditLedgerError) logShopInterpretationDiagnostic("AI not called", { category: "code path never calling AI", error: normalizeDiagnosticError(error.cause), reason: "shop_usage_persistence_unavailable", aiSkippedBecauseUsageFailed: true, helper: "getRemainingAiCredits", table: "ai_usage_events", usageLoadSucceeded: false }, "error");
    throw error;
  }
}

function applyDeterministicInterpretationFloor(
  interpretation: ShopQueryInterpretation,
  fallback: ShopQueryInterpretation,
): ShopQueryInterpretation {
  const avoidIngredients = uniqueStrings([
    ...interpretation.explicitConstraints.avoidIngredients,
    ...fallback.explicitConstraints.avoidIngredients,
  ]);
  const requiredIngredients = uniqueStrings([
    ...interpretation.explicitConstraints.requiredIngredients,
    ...fallback.explicitConstraints.requiredIngredients,
  ]);

  const safetyFlags = {
    urgentCare: interpretation.safetyFlags.urgentCare || fallback.safetyFlags.urgentCare,
    medicalTreatmentIntent:
      interpretation.safetyFlags.medicalTreatmentIntent || fallback.safetyFlags.medicalTreatmentIntent,
  };
  const shouldApplyGroomingFloor =
    hasShopGroomingSynonymIntent(fallback.queryText) &&
    !safetyFlags.urgentCare &&
    !safetyFlags.medicalTreatmentIntent;
  const normalizedSearchTerms = shouldApplyGroomingFloor
    ? uniqueStrings([...interpretation.normalizedSearchTerms, ...fallback.normalizedSearchTerms]).slice(0, 12)
    : interpretation.normalizedSearchTerms.length
      ? interpretation.normalizedSearchTerms
      : fallback.normalizedSearchTerms;

  return {
    ...interpretation,
    category: shouldApplyGroomingFloor
      ? "Grooming"
      : fallback.category !== "Other"
        ? fallback.category
        : interpretation.category,
    explicitConstraints: {
      ...interpretation.explicitConstraints,
      avoidIngredients,
      requiredIngredients,
      brand: interpretation.explicitConstraints.brand || fallback.explicitConstraints.brand,
      budget: interpretation.explicitConstraints.budget || fallback.explicitConstraints.budget,
      country: interpretation.explicitConstraints.country || fallback.explicitConstraints.country,
      lifeStage: interpretation.explicitConstraints.lifeStage || fallback.explicitConstraints.lifeStage,
      productForm: interpretation.explicitConstraints.productForm || fallback.explicitConstraints.productForm,
    },
    normalizedSearchTerms,
    safetyFlags,
    species: interpretation.species === "unknown" && fallback.species !== "unknown" ? fallback.species : interpretation.species,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

type ShopInterpretationFailureCategory =
  | "missing/invalid key"
  | "network/timeout/provider failure"
  | "strict schema validation rejection"
  | "auth/pet ownership failure"
  | "code path never calling AI"
  | "provider disabled/config issue";

type ShopInterpretationFailure = {
  category: ShopInterpretationFailureCategory;
  reason: string;
  validationErrors?: string[];
};

function classifyShopInterpretationFailure(
  error: unknown,
  runtimeDiagnostics: ReturnType<typeof getAiRuntimeDiagnostics>,
): ShopInterpretationFailure {
  const diagnosticError = normalizeDiagnosticError(error);
  const message = typeof diagnosticError.message === "string" ? diagnosticError.message : "";
  if (!runtimeDiagnostics.keyPresent || !runtimeDiagnostics.keyNonEmpty || /api key|unauthorized|invalid api key/i.test(message)) {
    return { category: "missing/invalid key", reason: "openai_key_missing_or_rejected" };
  }
  if (!runtimeDiagnostics.providerSupported || /unsupported ai provider/i.test(message)) {
    return { category: "provider disabled/config issue", reason: "provider_disabled_or_unsupported" };
  }
  if (error instanceof ShopQueryInterpretationValidationError) {
    return {
      category: "strict schema validation rejection",
      reason: "schema_validation_failed",
      validationErrors: error.errors,
    };
  }
  return { category: "network/timeout/provider failure", reason: "provider_request_failed" };
}

function logShopInterpretationFallback(error: unknown, failure: ShopInterpretationFailure) {
  logShopInterpretationDiagnostic("fallback used", {
    category: failure.category,
    error: normalizeDiagnosticError(error),
    fallbackReason: failure.reason,
    validationErrors: failure.validationErrors,
  }, "warn");
}

function logShopInterpretationDiagnostic(
  message: string,
  details: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
) {
  if (process.env.NODE_ENV === "production" && process.env.SHOP_AI_DIAGNOSTICS !== "true") return;
  console[level]("[Furvise shop AI]", { message, ...details });
}

function normalizeDiagnosticError(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error) };
  const record = error as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    code: record.code,
    message: error instanceof Error ? error.message : record.message,
    name: error instanceof Error ? error.name : record.name,
    status: record.status,
    type: record.type,
  };
  if (error instanceof ShopQueryInterpretationValidationError) {
    normalized.validationErrors = error.errors;
  }
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    normalized.stack = error.stack;
  }
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function safeDiagnosticHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
