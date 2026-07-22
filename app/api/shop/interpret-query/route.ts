import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

  if (!petId || query.length < MIN_SHOP_QUERY_LENGTH || query.length > maxShopQueryLength) {
    return Response.json({ error: "Choose a pet and enter a shorter shopping query.", usage: context.usage }, { status: 400 });
  }

  let memory: PetMemoryContext;
  try {
    memory = await loadPetMemoryContext({
      petId,
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    return Response.json({ error: "No matching pet profile was found.", usage: context.usage }, { status: 404 });
  }

  const normalizedQuery = normalizeShopQueryForCache(query);
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
  if (cached) {
    return Response.json({
      cached: true,
      fallback: cached.source === "fallback",
      interpretation: cached.interpretation,
      usage: context.usage,
    });
  }

  if (!context.usage.allowed) {
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
    const provider = createAiAnalysisProvider();
    const interpreted = await provider.interpretShopQuery({ memory, productCountry, query });
    const normalized = parseShopQueryInterpretation(interpreted);
    if (!normalized) throw new Error("Invalid Shop query interpretation.");
    const interpretation = applyDeterministicSafetyFloor(normalized, fallback());
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
      usage: nextUsage,
    });
  } catch (error) {
    logShopInterpretationFallback(error);
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
      interpretation: fallbackInterpretation,
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

function applyDeterministicSafetyFloor(
  interpretation: ShopQueryInterpretation,
  fallback: ShopQueryInterpretation,
): ShopQueryInterpretation {
  return {
    ...interpretation,
    safetyFlags: {
      urgentCare: interpretation.safetyFlags.urgentCare || fallback.safetyFlags.urgentCare,
      medicalTreatmentIntent:
        interpretation.safetyFlags.medicalTreatmentIntent || fallback.safetyFlags.medicalTreatmentIntent,
    },
  };
}

function logShopInterpretationFallback(error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise shop] query interpretation fallback", {
    message: error instanceof Error ? error.message : "Unknown Shop query interpretation error",
  });
}
