import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAiAnalysisProvider } from "../../../lib/ai/provider";
import { loadPetMemoryContext, type PetMemoryContext } from "../../../lib/pet-memory";
import { initialProfile, type DogProfile, type MockProduct } from "../../../lib/petwise";
import { staticRealProvider } from "../../../lib/product-providers";
import {
  buildFallbackShopProductFitExplanation,
  parseShopProductFitExplanation,
} from "../../../lib/shop/product-fit-explanation";
import { filterAndRankShopProducts } from "../../../lib/shop/product-search";
import { parseShopQueryInterpretation } from "../../../lib/shop-query";
import { staticRealProducts } from "../../../lib/products/static-products";

const maxShopQueryLength = 240;

type ExplainProductFitBody = {
  interpretation?: unknown;
  petId?: unknown;
  productCountry?: unknown;
  productId?: unknown;
  query?: unknown;
};

export async function POST(request: Request) {
  const context = await loadShopExplanationRequestContext(request);
  if ("response" in context) return context.response;

  const body = (await request.json().catch(() => null)) as ExplainProductFitBody | null;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const productCountry = typeof body?.productCountry === "string" ? body.productCountry : null;
  const interpretation = body?.interpretation ? parseShopQueryInterpretation(body.interpretation) : null;

  if (!petId || !productId || !query || query.length > maxShopQueryLength) {
    return Response.json({ error: "Choose a pet, product, and shorter shopping query." }, { status: 400 });
  }
  if (body?.interpretation && !interpretation) {
    return Response.json({ error: "The shopping query context is no longer valid." }, { status: 400 });
  }

  let memory: PetMemoryContext;
  try {
    memory = await loadPetMemoryContext({
      petId,
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    return Response.json({ error: "No matching pet profile was found." }, { status: 404 });
  }

  if (memory.derived.safetyFlags.length > 0 || interpretation?.safetyFlags.urgentCare) {
    return Response.json({ error: "This product is no longer available for the selected pet context." }, { status: 409 });
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
    return Response.json({ error: "This product is no longer available for the selected pet context." }, { status: 409 });
  }

  const fallback = () => buildFallbackShopProductFitExplanation({ interpretation, memory, product, query });

  try {
    const provider = createAiAnalysisProvider();
    const explanation = await provider.explainShopProductFit({ interpretation, memory, product, query });
    const normalized = parseShopProductFitExplanation(explanation, memory.pet.name || "this pet");
    if (!normalized) throw new Error("Invalid Shop product fit explanation.");
    return Response.json({ explanation: normalized, fallback: false });
  } catch (error) {
    logShopProductFitFallback(error);
    return Response.json({ explanation: fallback(), fallback: true });
  }
}

async function loadShopExplanationRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      supabase: SupabaseClient;
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

  return { supabase, userId: userData.user.id };
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

function logShopProductFitFallback(error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise shop] product fit explanation fallback", {
    message: error instanceof Error ? error.message : "Unknown Shop product fit explanation error",
  });
}
