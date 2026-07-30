import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadShopCatalogProducts } from "../../../lib/catalog/compatibility";
import { loadPetMemoryContext } from "../../../lib/pet-memory";
import { normalizeProductCountry } from "../../../lib/product-providers";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../lib/security/request";

const MAX_QUERY_LENGTH = 240;

type CatalogBody = {
  petId?: unknown;
  productCountry?: unknown;
  query?: unknown;
};

export async function POST(request: Request) {
  const context = await loadRequestContext(request);
  if ("response" in context) return context.response;

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(request, API_BODY_LIMITS.productAi);
  } catch (error) {
    return Response.json(
      { error: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "That product search is too large." : "Send a valid product search." },
      { status: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400 },
    );
  }
  if (!hasOnlyKeys(rawBody, ["petId", "productCountry", "query"])) {
    return Response.json({ error: "The product search contains unsupported fields." }, { status: 400 });
  }
  const body = rawBody as CatalogBody;
  const petId = typeof body?.petId === "string" ? body.petId.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const countryCode = normalizeProductCountry(typeof body?.productCountry === "string" ? body.productCountry : null);
  if (!isUuid(petId) || !countryCode || !query || query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: "Choose a pet and enter a shorter product search." }, { status: 400 });
  }

  try {
    const memory = await loadPetMemoryContext({ petId, supabase: context.supabase, userId: context.userId });
    if (memory.pet.species !== "dog" && memory.pet.species !== "cat") {
      return Response.json({ products: [] });
    }
    const result = await loadShopCatalogProducts(context.supabase, {
      countryCode,
      limit: 60,
      speciesCode: memory.pet.species,
      textQuery: query,
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Product guidance is temporarily unavailable, but you can still try again shortly." }, { status: 503 });
  }
}

async function loadRequestContext(request: Request): Promise<
  { response: Response } | { supabase: SupabaseClient; userId: string }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Product guidance is temporarily unavailable." }, { status: 503 }) };
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };
  return { supabase, userId: data.user.id };
}
