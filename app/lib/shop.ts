import type { PetWiseAnalysis } from "./ai-analysis";
import type { ShopQueryInterpretation } from "./shop-query";
import type { CareEntryRow } from "./supabase";
import {
  type DogProfile,
  type MockProduct,
  type ProductCountry,
} from "./petwise";
import { staticRealProvider } from "./product-providers";
import {
  filterAndRankShopProducts,
  MIN_SHOP_QUERY_LENGTH,
  productMatchesShopQuery,
  type ShopSearchEmptyState,
  type ShopSearchResult,
} from "./shop/product-search";
import { staticRealProducts } from "./products/static-products";

export { MIN_SHOP_QUERY_LENGTH, productMatchesShopQuery };
export type { ShopSearchEmptyState, ShopSearchResult };

export function searchStaticRealShopProducts({
  includeDiagnostics = false,
  productCountry,
  profile,
  query,
  interpretation = null,
}: {
  includeDiagnostics?: boolean;
  interpretation?: ShopQueryInterpretation | null;
  productCountry: ProductCountry;
  profile: DogProfile | null;
  query: string;
}): ShopSearchResult {
  return filterAndRankShopProducts({
    accountCountry: productCountry,
    includeDiagnostics,
    interpretation,
    products: getStaticRealShopCatalog(),
    query,
    selectedPet: profile,
  });
}

export function shouldHideShopProductsForUrgentCare({
  entries,
  guidance,
  now = new Date(),
}: {
  entries?: Pick<CareEntryRow, "category" | "occurred_at" | "severity">[];
  guidance?: Pick<PetWiseAnalysis, "vetAttention"> | null;
  now?: Date;
}) {
  if (guidance?.vetAttention.needed && guidance.vetAttention.urgency === "urgent") return true;
  return Boolean(
    entries?.some(
      (entry) =>
        entry.category === "symptom" &&
        entry.severity === "severe" &&
        isWithinDays(entry.occurred_at, now, 14),
    ),
  );
}

function getStaticRealShopCatalog() {
  return staticRealProducts
    .map((product) => staticRealProvider.normalizeProduct(product))
    .filter((product): product is MockProduct => Boolean(product));
}

function isWithinDays(value: string, now: Date, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}
