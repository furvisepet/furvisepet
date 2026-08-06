import type { SupabaseClient } from "@supabase/supabase-js";
import type { MockProduct, ProductCountry } from "../petwise";

export async function resolveOrganicProductDestinations(
  supabase: SupabaseClient,
  input: { countryCode: ProductCountry; productIds: string[]; speciesCode: "dog" | "cat" },
) {
  const result = new Map<string, string>();
  const productIds = [...new Set(input.productIds)].slice(0, 60);
  if (!productIds.length) return result;
  const { data, error } = await supabase.rpc("resolve_organic_product_destinations", {
    p_country_code: input.countryCode,
    p_product_ids: productIds,
    p_species_code: input.speciesCode,
  });
  if (error) throw new Error("Organic product destinations could not be loaded.");
  for (const value of Array.isArray(data) ? data : []) {
    const row = record(value);
    if (!row || typeof row.product_id !== "string" || !productIds.includes(row.product_id) || result.has(row.product_id)) continue;
    if (typeof row.validated_destination_url !== "string") continue;
    result.set(row.product_id, row.validated_destination_url);
  }
  return result;
}

export function attachOrganicProductDestinations(products: MockProduct[], destinations: ReadonlyMap<string, string>) {
  return products.map((product) => {
    const destination = !product.productPageUrl ? destinations.get(product.id) : null;
    return destination ? { ...product, productPageUrl: destination, verifiedProductPageUrl: destination } : product;
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
