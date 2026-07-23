import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAiRuntimeDiagnostics } from "../../../lib/ai/config";
import { createAiAnalysisProvider } from "../../../lib/ai/provider";
import {
  ProductAiUsageReadError,
  buildProductAiUsageUnavailableStatus,
  formatProductAiUsageStatus,
  getProductAiUsageStatus,
  incrementProductAiUsage,
  logProductAiUsageError,
  type ProductAiUsageStatus,
  type SupabaseLike as ProductAiUsageSupabaseLike,
} from "../../../lib/billing/shop-usage";
import {
  getPlanCapabilities,
  getUserPlan,
  isEarlyAccessFreeUnlockEnabled,
  type PlanId,
} from "../../../lib/billing/plan-limits";
import { loadPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { initialProfile, type DogProfile, type MockProduct } from "../../../lib/petwise";
import { staticRealProvider } from "../../../lib/product-providers";
import {
  buildOffTopicShopProductQuestionAnswer,
  buildFallbackShopProductQuestionAnswer,
  classifyShopProductQuestionIntent,
  parseShopProductQuestionAnswer,
} from "../../../lib/shop/product-question";
import { filterAndRankShopProducts } from "../../../lib/shop/product-search";
import { parseShopQueryInterpretation } from "../../../lib/shop-query";
import { staticRealProducts } from "../../../lib/products/static-products";

const maxShopQueryLength = 240;
const maxProductQuestionLength = 320;

type ProductQuestionBody = {
  interpretation?: unknown;
  petId?: unknown;
  productCountry?: unknown;
  productId?: unknown;
  query?: unknown;
  question?: unknown;
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
  const body = (await request.json().catch(() => null)) as ProductQuestionBody | null;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const productCountry = typeof body?.productCountry === "string" ? body.productCountry : null;
  const interpretation = body?.interpretation ? parseShopQueryInterpretation(body.interpretation) : null;

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
  if (body?.interpretation && !interpretation) {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "schema validation rejection" });
    return Response.json({
      error: "The product question context is no longer valid.",
      usage: context.usage,
      usageUnavailable: context.usageUnavailable,
    }, { status: 400 });
  }

  let memory: PetMemoryContext;
  try {
    memory = await loadPetMemoryContext({
      petId,
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "pet ownership/auth issue", petIdPresent: Boolean(petId) });
    return Response.json({ error: "No matching pet profile was found.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 404 });
  }

  if (memory.derived.safetyFlags.length > 0 || interpretation?.safetyFlags.urgentCare) {
    logProductQuestionDiagnostic("request rejected", { failureCategory: "product filter rejection", petIdPresent: true, productIdPresent: Boolean(productId) });
    return Response.json({ error: "This product is no longer available for the selected pet context.", usage: context.usage, usageUnavailable: context.usageUnavailable }, { status: 409 });
  }

  const products = getStaticRealShopCatalog();
  const selectedPet = buildShopSearchPet(memory);
  const filtered = filterAndRankShopProducts({
    accountCountry: productCountry,
    interpretation,
    products,
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
        error: "You've used your included Product AI for this month.",
        limitReached: true,
        usage: context.usage,
        usageUnavailable: context.usageUnavailable,
      },
      { status: 402 },
    );
  }

  const fallback = () => buildFallbackShopProductQuestionAnswer({ interpretation, memory, product, query, question });

  try {
    const runtimeDiagnostics = getAiRuntimeDiagnostics();
    logProductQuestionDiagnostic("provider selected", {
      aiAttempted: true,
      model: runtimeDiagnostics.model,
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
      provider: runtimeDiagnostics.provider,
    });
    const provider = createAiAnalysisProvider();
    logProductQuestionDiagnostic("AI request attempted", {
      aiAttempted: true,
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
    });
    const answer = await provider.answerShopProductQuestion({ interpretation, memory, product, query, question });
    const normalized = parseShopProductQuestionAnswer(answer, memory.pet.name || "this pet");
    if (!normalized) {
      logProductQuestionDiagnostic("AI response rejected", {
        aiSucceeded: true,
        fallbackReason: "schema_validation_failed",
        failureCategory: "schema validation rejection",
        productQuestionCategory: questionCategory,
        productQuestionIntent: questionIntent.intent,
        schemaValidationErrors: ["product question answer failed local parser"],
      });
      throw new ProductQuestionRouteError("schema_validation_failed", "schema validation rejection");
    }

    let nextUsage = context.usage;
    if (!context.usageUnavailable) {
      try {
        const updatedUsage = await incrementProductAiUsage({
          monthKey: context.usage.monthKey,
          previousCount: context.usage.count,
          supabase: context.supabase as unknown as ProductAiUsageSupabaseLike,
          userId: context.userId,
        });
        nextUsage = formatProductAiUsageStatus({
          ...context.usage,
          count: updatedUsage.count,
        });
      } catch (usageError) {
        logProductAiUsageError("incrementProductAiUsage", usageError);
      }
    }

    logProductQuestionDiagnostic("final response", {
      aiSucceeded: true,
      finalResponseSource: "ai",
      productQuestionCategory: questionCategory,
      productQuestionIntent: questionIntent.intent,
    });
    return Response.json({ answer: normalized, fallback: false, responseSource: "ai", usage: nextUsage, usageUnavailable: context.usageUnavailable });
  } catch (error) {
    const failure = classifyProductQuestionFailure(error);
    logProductQuestionFallback(error, failure);
    logProductQuestionDiagnostic("final response", {
      aiSucceeded: false,
      failureCategory: failure.category,
      fallbackReason: failure.reason,
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
  }
}

async function loadProductQuestionRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      planId: PlanId;
      supabase: SupabaseClient;
      usage: ProductAiUsageStatus;
      usageUnavailable: boolean;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };

  const planId = await getUserPlan(userData.user.id);
  const plan = getPlanCapabilities(planId);
  const earlyAccessUnlocked = isEarlyAccessFreeUnlockEnabled();
  let usage: ProductAiUsageStatus;
  try {
    usage = await getProductAiUsageStatus({
      earlyAccessUnlocked,
      monthlyLimit: plan.productsAiMonthlyLimit,
      planId,
      supabase: supabase as unknown as ProductAiUsageSupabaseLike,
      userId: userData.user.id,
    });
    logProductQuestionDiagnostic("Product AI usage loaded", {
      helper: "getProductAiUsageStatus",
      table: "product_ai_usage",
      usageLoadSucceeded: true,
      userIdPresent: Boolean(userData.user.id),
    });
  } catch (error) {
    if (error instanceof ProductAiUsageReadError) {
      logProductQuestionDiagnostic("Product AI usage unavailable", {
        aiAttempted: false,
        failureCategory: "provider/network error",
        fallbackReason: "product_ai_usage_unavailable",
        helper: "getProductAiUsageStatus",
        schemaValidationErrors: [normalizeProductAiUsageError(error.cause)],
        table: "product_ai_usage",
        usageLoadSucceeded: false,
        userIdPresent: Boolean(userData.user.id),
      });
      usage = buildProductAiUsageUnavailableStatus({
        earlyAccessUnlocked,
        monthlyLimit: plan.productsAiMonthlyLimit,
        planId,
      });
      return { planId, supabase, usage, usageUnavailable: true, userId: userData.user.id };
    }
    throw error;
  }

  return { planId, supabase, usage, usageUnavailable: false, userId: userData.user.id };
}

function normalizeProductAiUsageError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "unknown";
  const message = typeof value.message === "string" ? value.message : "Unknown Product AI usage error";
  return `${code}: ${message}`;
}

function getStaticRealShopCatalog() {
  return staticRealProducts
    .map((product) => staticRealProvider.normalizeProduct(product))
    .filter((product): product is MockProduct => Boolean(product));
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
