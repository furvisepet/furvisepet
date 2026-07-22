import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAiRuntimeDiagnostics } from "../../../lib/ai/config";
import { createAiAnalysisProvider } from "../../../lib/ai/provider";
import {
  formatShopSearchUsageStatus,
  getShopSearchUsageStatus,
  incrementShopSearchUsage,
  logShopSearchUsageError,
  ShopSearchUsageReadError,
  type ShopSearchUsageStatus,
  type SupabaseLike as ShopSearchUsageSupabaseLike,
} from "../../../lib/billing/shop-usage";
import {
  getPlanCapabilities,
  getUserPlan,
  isEarlyAccessFreeUnlockEnabled,
  type PlanId,
} from "../../../lib/billing/plan-limits";
import { loadPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { normalizeProductCountry } from "../../../lib/product-providers";
import { MIN_SHOP_QUERY_LENGTH } from "../../../lib/shop";
import {
  ShopQueryInterpretationValidationError,
  buildFallbackShopQueryInterpretation,
  parseShopQueryInterpretation,
  type ShopQueryInterpretation,
} from "../../../lib/shop-query";
import {
  calculatePetContextHash,
  hashShopInterpretationCacheKey,
  normalizeShopQueryForCache,
  readCachedShopQueryInterpretation,
  saveShopQueryInterpretationCache,
  SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
  type SupabaseCacheLike,
} from "../../../lib/shop/query-interpretation-cache";

const maxShopQueryLength = 240;

type InterpretShopQueryBody = {
  petId?: unknown;
  productCountry?: unknown;
  query?: unknown;
};

export async function GET(request: Request) {
  const context = await loadShopInterpretationRequestContext(request);
  if ("response" in context) return context.response;
  return Response.json({ usage: context.usage });
}

export async function POST(request: Request) {
  const context = await loadShopInterpretationRequestContext(request);
  if ("response" in context) return context.response;

  const body = (await request.json().catch(() => null)) as InterpretShopQueryBody | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productCountry =
    typeof body?.productCountry === "string" ? normalizeProductCountry(body.productCountry) : null;
  const normalizedQuery = normalizeShopQueryForCache(query);
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

  if (!petId || query.length < MIN_SHOP_QUERY_LENGTH || query.length > maxShopQueryLength) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: "invalid_request",
      queryLength: query.length,
      queryTooLong: query.length > maxShopQueryLength,
      queryTooShort: query.length < MIN_SHOP_QUERY_LENGTH,
      petIdPresent: Boolean(petId),
    });
    return Response.json({ error: "Choose a pet and enter a shorter shopping query.", usage: context.usage }, { status: 400 });
  }

  let memory: PetMemoryContext;
  try {
    memory = await loadPetMemoryContext({
      petId,
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch (error) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "auth/pet ownership failure",
      error: normalizeDiagnosticError(error),
      petIdHash: safeDiagnosticHash(petId),
      reason: "pet_memory_context_unavailable",
      userIdHash: safeDiagnosticHash(context.userId),
    });
    return Response.json({ error: "No matching pet profile was found.", usage: context.usage }, { status: 404 });
  }

  logShopInterpretationDiagnostic("pet memory context built", {
    petIdHash: safeDiagnosticHash(petId),
    hasCareContext: memory.timeline.recentEntries.length > 0 || memory.savedDetails.length > 0 || memory.derived.summaryBullets.length > 0,
    petMemoryContextBuilt: true,
    savedDetailCount: memory.savedDetails.length,
    timelineEntryCount: memory.timeline.recentEntries.length,
    userIdHash: safeDiagnosticHash(context.userId),
  });

  const petContextHash = calculatePetContextHash(memory);
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
      interpretation: cached.interpretation,
      interpretationSource: "cache",
      usage: context.usage,
    });
  }

  if (cached?.source === "fallback") {
    logShopInterpretationDiagnostic("cached fallback found", {
      cachedSource: cached.source,
      interpretationSource: "cache",
      queryHash: queryHashForLogs,
      reason: context.usage.allowed ? "retrying_ai_because_usage_allows" : "usage_blocked_returning_cached_fallback",
    });
  }

  if (!context.usage.allowed) {
    logShopInterpretationDiagnostic("AI not called", {
      category: "code path never calling AI",
      reason: cached?.source === "fallback" ? "usage_limit_returning_cached_fallback" : "usage_limit_reached",
      usageCount: context.usage.count,
      usageLimit: context.usage.limit,
    });
    if (cached?.source === "fallback") {
      return Response.json({
        cached: true,
        cachedSource: cached.source,
        fallback: true,
        interpretation: cached.interpretation,
        interpretationSource: "cache",
        usage: context.usage,
      });
    }
    return Response.json(
      {
        error: "You've used your included Shop searches for this month. You can still view saved pets and care history.",
        limitReached: true,
        usage: context.usage,
      },
      { status: 402 },
    );
  }

  const fallback = () => buildFallbackShopQueryInterpretation({ memory, productCountry, query });

  try {
    logShopInterpretationDiagnostic("calling AI provider", {
      ...runtimeDiagnostics,
      queryHash: queryHashForLogs,
    });
    const provider = createAiAnalysisProvider();
    const interpreted = await provider.interpretShopQuery({ memory, productCountry, query });
    const normalized = parseShopQueryInterpretation(interpreted);
    if (!normalized) {
      throw new ShopQueryInterpretationValidationError(["provider returned an object that failed local route validation"], interpreted);
    }
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
    const interpretation = applyDeterministicInterpretationFloor(normalized, fallback());
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
    let nextUsage = context.usage;
    try {
      const updatedUsage = await incrementShopSearchUsage({
        monthKey: context.usage.monthKey,
        previousCount: context.usage.count,
        supabase: context.supabase as unknown as ShopSearchUsageSupabaseLike,
        userId: context.userId,
      });
      nextUsage = formatShopSearchUsageStatus({
        ...context.usage,
        count: updatedUsage.count,
      });
    } catch (usageError) {
      logShopSearchUsageError("incrementShopSearchUsage", usageError);
    }
    return Response.json({
      cached: false,
      fallback: false,
      interpretation,
      interpretationSource: "ai",
      usage: nextUsage,
    });
  } catch (error) {
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
      usage: context.usage,
    });
  }
}

async function loadShopInterpretationRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      supabase: SupabaseClient;
      usage: ShopSearchUsageStatus;
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
    return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };
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

  const planId = await getUserPlan(userData.user.id);
  const plan = getPlanCapabilities(planId);
  const earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled();
  let usage: ShopSearchUsageStatus;
  try {
    usage = await getShopSearchUsageStatus({
      earlyAccessUnlocked,
      monthlyLimit: plan.shopSearchMonthlyLimit,
      planId,
      supabase: supabase as unknown as ShopSearchUsageSupabaseLike,
      userId: userData.user.id,
    });
  } catch (error) {
    if (error instanceof ShopSearchUsageReadError) {
      logShopInterpretationDiagnostic("AI not called", {
        category: "code path never calling AI",
        error: normalizeDiagnosticError(error.cause),
        reason: "shop_usage_persistence_unavailable",
        table: "shop_search_usage",
      }, "error");
      return {
        response: Response.json(
          {
            error: "Furvise could not load Shop search usage. Shop usage setup may be incomplete.",
          },
          { status: 503 },
        ),
      };
    }
    throw error;
  }

  return { planId, supabase, usage, userId: userData.user.id };
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

  return {
    ...interpretation,
    category: fallback.category !== "Other" ? fallback.category : interpretation.category,
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
    normalizedSearchTerms: interpretation.normalizedSearchTerms.length
      ? interpretation.normalizedSearchTerms
      : fallback.normalizedSearchTerms,
    safetyFlags: {
      urgentCare: interpretation.safetyFlags.urgentCare || fallback.safetyFlags.urgentCare,
      medicalTreatmentIntent:
        interpretation.safetyFlags.medicalTreatmentIntent || fallback.safetyFlags.medicalTreatmentIntent,
    },
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