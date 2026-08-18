import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAiRuntimeDiagnostics } from "../../../lib/ai/config";
import { getAskModelConfiguration } from "../../../lib/ai/ask-reasoning";
import { loadShopCatalogProductById } from "../../../lib/catalog/compatibility";
import { AiCreditLedgerError, getRemainingAiCredits, runWithAiCredit, type AiCreditStatus } from "../../../lib/ai/usage-ledger";
import { runAdmittedAiOperation } from "../../../lib/ai/usage-guard/admission";
import { AiAdmissionError } from "../../../lib/ai/usage-guard/errors";
import type { PlanId } from "../../../lib/billing/plan-limits";
import { resolveEffectiveEntitlements } from "../../../lib/billing/entitlements";
import { buildPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { initialProfile, type DogProfile, type MockProduct } from "../../../lib/petwise";
import { normalizeProductCountry } from "../../../lib/product-providers";
import {
  FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
  FURVISE_PRODUCT_USAGE_CAP_MESSAGE,
} from "../../../lib/furvise-voice";
import {
  buildOffTopicShopProductQuestionAnswer,
  buildFallbackShopProductQuestionAnswer,
  buildShopProductQuestionPromptInput,
  classifyShopProductQuestionIntent,
  parseShopProductQuestionAnswer,
  type ShopProductQuestionAnswer,
} from "../../../lib/shop/product-question";
import { filterAndRankShopProducts } from "../../../lib/shop/product-search";
import { parseShopQueryInterpretation } from "../../../lib/shop-query";
import {
  buildFurviseContext,
  persistFeatureIntelligenceLearnings,
  resolveProductSafety,
  runFeatureIntelligence,
  type FeatureIntelligenceResult,
} from "../../../lib/intelligence";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid as isSecurityUuid, readBoundedJson } from "../../../lib/security/request";
import { RateLimitRejection, requireRateLimitedRequest } from "../../../lib/security/rate-limit";
import { validateSensitiveRequestOriginResponse } from "../../../lib/security/headers/origin-policy";
import { claimIdempotentOperation } from "../../../lib/security/idempotency";

const maxShopQueryLength = 240;
const maxProductQuestionLength = 320;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type ProductQuestionBody = {
  interpretation?: unknown;
  petId?: unknown;
  productCountry?: unknown;
  productId?: unknown;
  query?: unknown;
  question?: unknown;
  requestId?: unknown;
};

export async function GET(request: Request) {
  const context = await loadProductQuestionRequestContext(request);
  if ("response" in context) return context.response;
  return Response.json({
    usage: context.usage,
    usageUnavailable: context.usageUnavailable,
  });
}

export async function POST(request: Request) {
  const context = await loadProductQuestionRequestContext(request);
  if ("response" in context) return context.response;

  logProductQuestionDiagnostic("route called", { finalResponseSource: null });
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.productAi); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "The product request is too large." : "Send a valid product request.", usage: context.usage }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["interpretation", "petId", "productCountry", "productId", "query", "question", "requestId"])) return Response.json({ error: "The product request contains unsupported fields.", usage: context.usage }, { status: 400 });
  const body = rawBody as ProductQuestionBody;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const productCountry = typeof body?.productCountry === "string" ? body.productCountry : null;
  const interpretation = body?.interpretation ? parseShopQueryInterpretation(body.interpretation) : null;
  const requestId = typeof body?.requestId === "string" && isUuid(body.requestId) ? body.requestId : randomUUID();

  if (!petId || !productId || !query || query.length > maxShopQueryLength || !question || question.length > maxProductQuestionLength) {
    logProductQuestionDiagnostic("request rejected", {
      failureCategory: "missing key",
      petIdPresent: Boolean(petId),
      productIdPresent: Boolean(productId),
    });
    return Response.json({
      error: "Choose a pet, product, and shorter product question.",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    }, { status: 400 });
  }
  if (!isSecurityUuid(petId) || !isSecurityUuid(productId)) {
    return Response.json({
      error: "Choose a valid pet and product.",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    }, { status: 400 });
  }
  if (body?.interpretation && !interpretation) {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "schema validation rejection" });
    return Response.json({
      error: "The product question context is no longer valid.",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    }, { status: 400 });
  }

  let memory: PetMemoryContext;
  let liveContext: Awaited<ReturnType<typeof buildFurviseContext>>;
  try {
    liveContext = await buildFurviseContext({
      currentMessage: question, feature: "product_question", locale: request.headers.get("accept-language")?.split(",")[0] || "en",
      petId, supabase: context.supabase, userId: context.userId,
    });
    memory = buildPetMemoryContext({
      careEntries: liveContext.careEntries,
      productFeedback: liveContext.productFeedback,
      profile: liveContext.pet,
      savedMemories: liveContext.legacyPetMemories,
    });
  } catch {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "pet ownership/auth issue", petIdPresent: Boolean(petId) });
    return Response.json({ error: "No matching pet profile was found.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 404 });
  }

  const sharedSafety = resolveProductSafety(liveContext);
  if (sharedSafety.shoppingSuppressed) {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "product filter rejection", petIdPresent: true, productIdPresent: Boolean(productId) });
    return Response.json({ error: "This product is no longer available for the selected pet context.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 409 });
  }

  const selectedPet = buildShopSearchPet(memory);
  const countryCode = normalizeProductCountry(productCountry);
  if (!countryCode || (selectedPet.species !== "dog" && selectedPet.species !== "cat")) {
    return Response.json({ error: "This product is no longer available for the selected pet context.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 409 });
  }
  const catalogResult = await loadShopCatalogProductById(context.supabase, productId, {
    countryCode,
    speciesCode: selectedPet.species,
  });
  const filtered = filterAndRankShopProducts({
    accountCountry: productCountry,
    interpretation,
    products: catalogResult.product ? [catalogResult.product] : [],
    query,
    selectedPet,
  });
  const product = filtered.products.find((item) => item.id === productId) || null;
  if (!product) {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "product not found", petIdPresent: true, productIdPresent: Boolean(productId) });
    return Response.json({ error: "This product is no longer available for the selected pet context.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 409 });
  }

  const questionIntent = classifyShopProductQuestionIntent(question);
  const questionCategory = detectProductQuestionCategory(question, product, questionIntent.intent);
  logProductQuestionDiagnostic("request classified", {
    petIdPresent: true,
    productIdPresent: true,
    productQuestionIntent: questionIntent.intent,
    productQuestionCategory: questionCategory,
  });

  if (questionIntent.intent === "clearly_off_topic") {
    logProductQuestionDiagnostic("guarded response", {
      aiAttempted: false,
      failureCategory: "off-topic guard",
      finalResponseSource: "guarded",
      productQuestionIntent: questionIntent.intent,
      productQuestionCategory: questionCategory,
    });
    return Response.json({
      answer: buildOffTopicShopProductQuestionAnswer({ memory }),
      fallback: true,
      responseSource: "guarded",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    });
  }

  if (!context.usage.allowed) {
    logProductQuestionDiagnostic("request rejected", {
      aiAttempted: false,
      failureCategory: "cap reached",
      finalResponseSource: null,
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
    });
    return Response.json(
      {
        error: FURVISE_PRODUCT_USAGE_CAP_MESSAGE,
        limitReached: true,
        usage: context.usage,
        usageUnavailable: context.usageUnavailable,
      },
      { status: 402 },
    );
  }

  const fallback = () => buildFallbackShopProductQuestionAnswer({ interpretation, memory, product, query, question });

  let rateGate: Awaited<ReturnType<typeof requireRateLimitedRequest>> | null = null;
  const idempotency = await claimIdempotentOperation({ candidateKey: requestId, leaseSeconds: 180, operationType: "product.question", payload: { interpretation, petId, productCountry, productId, query, question }, request, retention: "financial", supabase: context.supabase, userId: context.userId });
  if ("response" in idempotency) return idempotency.response;
  return idempotency.operation.execute(async () => { try {
    rateGate = await requireRateLimitedRequest({
      idempotencyKey: requestId,
      payload: { interpretation, petId, productCountry, productId, query, question },
      policy: "PRODUCT_GUIDANCE_AI",
      request,
      requestId,
      route: "/api/shop/product-question",
      userId: context.userId,
    });
    const runtimeDiagnostics = getAiRuntimeDiagnostics();
    logProductQuestionDiagnostic("provider selected", {
      aiAttempted: true,
      model: runtimeDiagnostics.model,
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
      provider: runtimeDiagnostics.provider,
    });
    logProductQuestionDiagnostic("AI request attempted", {
      aiAttempted: true,
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
    });
    let persistenceWarning = "";
    const generated = await runAdmittedAiOperation({
      feature: "product_question", intendedModel: getAskModelConfiguration().primary,
      payload: { interpretation, petId, productCountry, productId, query, question }, requestId, userId: context.userId,
    }, () => runWithAiCredit<FeatureIntelligenceResult<ShopProductQuestionAnswer>>({
      feature: "product_question",
      monthlyAiCredits: context.monthlyAiCredits,
      payload: { interpretation, petId, productCountry, productId, query, question },
      planId: context.planId,
      requestId,
      supabase: context.supabase,
      userId: context.userId,
      generate: async () => runFeatureIntelligence({
        context: liveContext,
        feature: "product_question",
        featureInput: buildShopProductQuestionPromptInput({ interpretation, memory, product, query, question }),
        maxOutputTokens: 650,
        parseValue: (value) => parseShopProductQuestionAnswer(value, memory.pet.name || "this pet"),
      }),
      beforeComplete: async (result) => {
        if (!result.acceptedLearnings.length) return;
        try {
          await persistFeatureIntelligenceLearnings({
            careActions: [], feature: "product_question", learnings: result.acceptedLearnings,
            petId, requestId, supabase: context.supabase,
          });
        } catch (error) {
          persistenceWarning = "Approved preferences could not be saved.";
          logProductQuestionFallback(error);
        }
      },
    }));
    const normalized = generated.value.value;

    logProductQuestionDiagnostic("final response", {
      aiSucceeded: true,
      finalResponseSource: "ai",
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
    });
    return Response.json({ answer: normalized, fallback: false, responseSource: "ai", usage: generated.usage, usageUnavailable: false, ...(persistenceWarning ? { persistenceWarning } : {}) });
  } catch (error) {
    if (error instanceof RateLimitRejection) return error.response;
    const admissionCode = error instanceof AiAdmissionError
      ? (error.code === "AI_PROVIDER_BUDGET_EXHAUSTED" ? "AI_TEMPORARILY_UNAVAILABLE" : error.code)
      : undefined;
    const failure = classifyProductQuestionFailure(error);
    logProductQuestionFallback(error, failure);
    logProductQuestionDiagnostic("final response", {
      aiSucceeded: false,
      failureCategory: failure.category,
      fallbackReason: failure.reason,
      ...(admissionCode ? { aiUnavailable: true, code: admissionCode } : {}),
      finalResponseSource: "fallback",
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
      schemaValidationErrors: failure.validationErrors,
    });
    return Response.json({
      answer: fallback(),
      fallback: true,
      fallbackReason: failure.reason,
      responseSource: "fallback",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    });
  } finally {
    if (rateGate) await rateGate.release();
  } });
}

async function loadProductQuestionRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      monthlyAiCredits: number;
      supabase: SupabaseClient;
      usage: AiCreditStatus;
      usageUnavailable: boolean;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE }, { status: 503 }) };

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };

  const entitlements = await resolveEffectiveEntitlements(supabase);
  const planId = entitlements.effectivePlan;
  const monthlyAiCredits = entitlements.limits.monthlyAiCredits;
  let usage: AiCreditStatus;
  try {
    usage = await getRemainingAiCredits({
      planId,
      monthlyAiCredits,
      supabase,
      userId: userData.user.id,
    });
    logProductQuestionDiagnostic("Product AI usage loaded", {
      helper: "getRemainingAiCredits",
      table: "ai_usage_events",
      usageLoadSucceeded: true,
      userIdPresent: Boolean(userData.user.id),
    });
  } catch (error) {
    if (error instanceof AiCreditLedgerError) {
      logProductQuestionDiagnostic("Product AI usage unavailable", {
        aiAttempted: false,
        failureCategory: "provider/network error",
        fallbackReason: "product_ai_usage_unavailable",
        helper: "getRemainingAiCredits",
        schemaValidationErrors: [normalizeProductAiUsageError(error.cause)],
        table: "ai_usage_events",
        usageLoadSucceeded: false,
        userIdPresent: Boolean(userData.user.id),
      });
      return { response: Response.json({ error: FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE }, { status: 503 }) };
    }
    throw error;
  }

  return { monthlyAiCredits, planId, supabase, usage, usageUnavailable: false, userId: userData.user.id };
}

function normalizeProductAiUsageError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "unknown";
  const message = typeof value.message === "string" ? value.message : "Unknown Product AI usage error";
  return `${code}: ${message}`;
}

function buildShopSearchPet(memory: PetMemoryContext): DogProfile {
  return {
    ...initialProfile,
    name: memory.pet.name,
    species: memory.pet.species || "",
    currentFood: memory.pet.currentFood || "",
    currentFoodUnknown: !memory.pet.currentFood,
    mainConcern: memory.pet.mainConcern === "Itchy skin" ||
      memory.pet.mainConcern === "Sensitive stomach" ||
      memory.pet.mainConcern === "Picky eating" ||
      memory.pet.mainConcern === "Weight management" ||
      memory.pet.mainConcern === "General wellness" ||
      memory.pet.mainConcern === "Grooming" ||
      memory.pet.mainConcern === "Other"
      ? memory.pet.mainConcern
      : "",
    avoidIngredients: memory.pet.avoidIngredients,
  };
}

class ProductQuestionRouteError extends Error {
  constructor(
    public reason: ProductQuestionFailureReason,
    public category: ProductQuestionFailureCategory,
    public validationErrors: string[] = [],
  ) {
    super(reason);
  }
}

type ProductQuestionFailureCategory =
  | "missing key"
  | "provider/network error"
  | "schema validation rejection"
  | "off-topic guard"
  | "cap reached"
  | "product not found"
  | "pet ownership/auth issue"
  | "product filter rejection";

type ProductQuestionFailureReason =
  | "missing_key"
  | "provider_or_network_error"
  | "schema_validation_failed"
  | "off_topic_guard"
  | "cap_reached"
  | "product_not_found"
  | "pet_ownership_or_auth_issue"
  | "product_filter_rejection"
  | "missing_provider_key"
  | "product_ai_usage_unavailable";

type ProductQuestionDiagnostic = {
  aiAttempted?: boolean;
  aiSucceeded?: boolean;
  failureCategory?: ProductQuestionFailureCategory;
  fallbackReason?: ProductQuestionFailureReason;
  finalResponseSource?: "ai" | "fallback" | "guarded" | null;
  helper?: string;
  model?: string;
  petIdPresent?: boolean;
  productIdPresent?: boolean;
  productQuestionCategory?: string;
  productQuestionIntent?: string;
  provider?: string;
  schemaValidationErrors?: string[];
  table?: string;
  usageLoadSucceeded?: boolean;
  userIdPresent?: boolean;
};

function detectProductQuestionCategory(question: string, product: MockProduct, intent: string) {
  const normalized = question.toLowerCase();
  const productText = [product.category, product.subcategory, ...(product.tags || [])].join(" ").toLowerCase();
  if (intent === "clearly_off_topic") return "off_topic";
  if (intent === "product_adjacent") return "product_adjacent";
  if (/\b(ingredient|ingredients|contains|label|allerg|allergy)\b/.test(normalized)) return "ingredients";
  if (/\b(taste|flavor|flavour|like it|eat it|picky|texture|smell)\b/.test(normalized)) return "taste";
  if (/\b(use|using|used|give|serve|serving|direction|directions|how|often|water|dry|introduce|mix|transition|daily|night)\b/.test(normalized)) return "use";
  if (/\b(watch|warning|avoid|problem|irritation|worse|worsen)\b/.test(normalized)) return "warnings";
  if (/\b(size|weight|calorie|calories|age|puppy|adult|senior|too small|too hard)\b/.test(normalized)) return "size";
  if (/\b(compare|better than|instead of|should i buy|worth buying)\b/.test(normalized)) return "compare";
  if (product.category === "food") return "food";
  if (productText.includes("dental")) return "dental";
  if (product.category === "grooming") return "grooming";
  return "general_product";
}

function classifyProductQuestionFailure(error: unknown): {
  category: ProductQuestionFailureCategory;
  reason: ProductQuestionFailureReason;
  validationErrors?: string[];
} {
  if (error instanceof ProductQuestionRouteError) {
    return { category: error.category, reason: error.reason, validationErrors: error.validationErrors };
  }
  const message = error instanceof Error ? error.message : "";
  if (/api key|OPENAI_API_KEY|key/i.test(message)) {
    return { category: "provider/network error", reason: "missing_provider_key" };
  }
  return { category: "provider/network error", reason: "provider_or_network_error" };
}

function logProductQuestionDiagnostic(message: string, diagnostic: ProductQuestionDiagnostic) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[Furvise products] product question diagnostic", {
    message,
    ...diagnostic,
  });
}

function logProductQuestionFallback(
  error: unknown,
  failure = classifyProductQuestionFailure(error),
) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise products] product question fallback", {
    failureCategory: failure.category,
    fallbackReason: failure.reason,
    message: error instanceof Error ? error.message : "Unknown product question error",
    validationErrors: failure.validationErrors,
  });
}
