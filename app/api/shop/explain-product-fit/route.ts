import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadShopCatalogProductById } from "../../../lib/catalog/compatibility";
import { buildPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { initialProfile, type DogProfile } from "../../../lib/petwise";
import { normalizeProductCountry } from "../../../lib/product-providers";
import { FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE } from "../../../lib/furvise-voice";
import {
  buildFallbackShopProductFitExplanation,
  buildShopProductFitPromptInput,
  parseShopProductFitExplanation,
  type ShopProductFitExplanation,
} from "../../../lib/shop/product-fit-explanation";
import { filterAndRankShopProducts } from "../../../lib/shop/product-search";
import { parseShopQueryInterpretation } from "../../../lib/shop-query";
import { AiCreditLimitReachedError, getRemainingAiCredits, runWithAiCredit, type AiCreditStatus } from "../../../lib/ai/usage-ledger";
import { getUserPlan, type PlanId } from "../../../lib/billing/plan-limits";
import { buildFurviseContext, resolveProductSafety, runFeatureIntelligence, type FeatureIntelligenceResult } from "../../../lib/intelligence";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid as isSecurityUuid, readBoundedJson } from "../../../lib/security/request";

const maxShopQueryLength = 240;

type ExplainProductFitBody = {
  interpretation?: unknown;
  petId?: unknown;
  productCountry?: unknown;
  productId?: unknown;
  query?: unknown;
  requestId?: unknown;
};

export async function POST(request: Request) {
  const context = await loadShopExplanationRequestContext(request);
  if ("response" in context) return context.response;

  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.productAi); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "The product request is too large." : "Send a valid product request." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["interpretation", "petId", "productCountry", "productId", "query", "requestId"])) return Response.json({ error: "The product request contains unsupported fields." }, { status: 400 });
  const body = rawBody as ExplainProductFitBody;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const productCountry = typeof body?.productCountry === "string" ? body.productCountry : null;
  const interpretation = body?.interpretation ? parseShopQueryInterpretation(body.interpretation) : null;
  const requestId = typeof body?.requestId === "string" && isUuid(body.requestId) ? body.requestId : randomUUID();

  if (!isSecurityUuid(petId) || !isSecurityUuid(productId) || !query || query.length > maxShopQueryLength) {
    return Response.json({ error: "Choose a pet, product, and shorter shopping query." }, { status: 400 });
  }
  if (body?.interpretation && !interpretation) {
    return Response.json({ error: "The shopping query context is no longer valid." }, { status: 400 });
  }

  let memory: PetMemoryContext;
  let liveContext: Awaited<ReturnType<typeof buildFurviseContext>>;
  try {
    liveContext = await buildFurviseContext({
      currentMessage: query, feature: "product_explanation", locale: request.headers.get("accept-language")?.split(",")[0] || "en",
      petId, supabase: context.supabase, userId: context.userId,
    });
    memory = buildPetMemoryContext({
      careEntries: liveContext.careEntries,
      productFeedback: liveContext.productFeedback,
      profile: liveContext.pet,
      savedMemories: liveContext.legacyPetMemories,
    });
  } catch {
    return Response.json({ error: "No matching pet profile was found." }, { status: 404 });
  }

  if (resolveProductSafety(liveContext).shoppingSuppressed) {
    return Response.json({ error: "This product is no longer available for the selected pet context." }, { status: 409 });
  }

  const selectedPet = buildShopSearchPet(memory);
  const countryCode = normalizeProductCountry(productCountry);
  if (!countryCode || (selectedPet.species !== "dog" && selectedPet.species !== "cat")) {
    return Response.json({ error: "This product is no longer available for the selected pet context." }, { status: 409 });
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
    return Response.json({ error: "This product is no longer available for the selected pet context." }, { status: 409 });
  }

  const fallback = () => buildFallbackShopProductFitExplanation({ interpretation, memory, product, query });

  try {
    const generated = await runWithAiCredit<FeatureIntelligenceResult<ShopProductFitExplanation>>({
      feature: "product_explanation",
      planId: context.planId,
      requestId,
      supabase: context.supabase,
      userId: context.userId,
      generate: async () => runFeatureIntelligence({
        context: liveContext, feature: "product_explanation",
        featureInput: buildShopProductFitPromptInput({ interpretation, memory, product, query }),
        maxOutputTokens: 360,
        parseValue: (value) => parseShopProductFitExplanation(value, memory.pet.name || "this pet"),
      }),
    });
    return Response.json({ explanation: generated.value.value, fallback: false, usage: generated.usage });
  } catch (error) {
    if (error instanceof AiCreditLimitReachedError) return Response.json({ error: "You have used this month's AI credits.", limitReached: true, usage: context.usage }, { status: 402 });
    logShopProductFitFallback(error);
    return Response.json({ explanation: fallback(), fallback: true });
  }
}

async function loadShopExplanationRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      supabase: SupabaseClient;
      planId: PlanId;
      usage: AiCreditStatus;
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

  const planId = await getUserPlan(userData.user.id);
  try {
    const usage = await getRemainingAiCredits({ planId, supabase, userId: userData.user.id });
    return { planId, supabase, usage, userId: userData.user.id };
  } catch {
    return { response: Response.json({ error: FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE }, { status: 503 }) };
  }
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

function logShopProductFitFallback(error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise shop] product fit explanation fallback", {
    message: error instanceof Error ? error.message : "Unknown Shop product fit explanation error",
  });
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
