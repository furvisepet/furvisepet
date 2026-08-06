import type { SupabaseClient } from "@supabase/supabase-js";
import type { MockProduct, ProductCountry } from "../petwise";
import { isProductEligibleForCountry, isSpeciesCompatibleProduct, staticRealProvider } from "../product-providers";
import { staticRealProducts } from "../products/static-products";
import { catalogProductToLegacyProduct } from "./mappers";
import { getCatalogProductById, getCatalogProductDetailsForCompatibility } from "./queries";

type ShopCatalogContext = {
  countryCode: ProductCountry;
  speciesCode: "dog" | "cat";
};

export async function loadShopCatalogProducts(
  supabase: SupabaseClient,
  context: ShopCatalogContext & { limit?: number; textQuery?: string | null },
): Promise<{ fallback: boolean; products: MockProduct[] }> {
  const page = await getCatalogProductDetailsForCompatibility(supabase, {
    countryCode: context.countryCode,
    limit: context.limit,
    speciesCode: context.speciesCode,
    textQuery: context.textQuery,
  });
  return {
    fallback: false,
    products: page.items.map((product) => catalogProductToLegacyProduct(product, context.countryCode)),
  };
}

export async function loadShopCatalogProductById(
  supabase: SupabaseClient,
  productId: string,
  context: ShopCatalogContext,
): Promise<{ fallback: boolean; product: MockProduct | null }> {
  try {
    const product = await getCatalogProductById(supabase, productId, context);
    return {
      fallback: false,
      product: product ? catalogProductToLegacyProduct(product, context.countryCode) : null,
    };
  } catch (error) {
    logCatalogFallback(error);
    return {
      fallback: true,
      product: loadStaticFallback(context).find((product) => product.id === productId) || null,
    };
  }
}

function loadStaticFallback(context: ShopCatalogContext) {
  return staticRealProducts
    .map((product) => staticRealProvider.normalizeProduct(product))
    .filter((product): product is MockProduct => Boolean(product))
    .filter((product) => product.active !== false)
    .filter((product) => isSpeciesCompatibleProduct(product, context.speciesCode))
    .filter((product) => isProductEligibleForCountry(product, context.countryCode))
    .slice(0, 60);
}

function logCatalogFallback(error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[Furvise catalog] temporary curated fallback", {
    message: error instanceof Error ? error.message : String(error),
  });
}
