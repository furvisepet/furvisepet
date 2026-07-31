import type { SupabaseClient } from "@supabase/supabase-js";
import { safeDatabaseMessage } from "./audit.ts";
import type { DuplicateCandidate, NormalizedIngestionProduct } from "./types";

export async function loadCatalogDuplicateCandidates(
  supabase: SupabaseClient,
  product: NormalizedIngestionProduct,
  provider: string,
) {
  const ids = new Set<string>();
  if (product.externalId) {
    const { data, error } = await supabase.from("product_sources").select("product_id")
      .eq("provider", provider).eq("external_id", product.externalId).limit(20);
    throwIfError(error);
    data?.forEach((row) => { if (row.product_id) ids.add(row.product_id); });
  }
  const gtins = [product.gtin, ...product.variants.map((variant) => variant.gtin)].filter((value): value is string => Boolean(value));
  if (gtins.length) {
    const [{ data: variants, error: variantError }, { data: products, error: productError }] = await Promise.all([
      supabase.from("product_variants").select("product_id").in("gtin", gtins).limit(50),
      supabase.from("products").select("id").in("global_trade_item_number", gtins).limit(50),
    ]);
    throwIfError(variantError || productError);
    variants?.forEach((row) => ids.add(row.product_id));
    products?.forEach((row) => ids.add(row.id));
  }
  const { data: brands, error: brandError } = await supabase.from("product_brands").select("id")
    .ilike("name", product.brandName).limit(10);
  throwIfError(brandError);
  if (brands?.length) {
    const { data, error } = await supabase.from("products").select("id")
      .in("brand_id", brands.map((brand) => brand.id))
      .ilike("name", product.productName)
      .limit(50);
    throwIfError(error);
    data?.forEach((row) => ids.add(row.id));
  }
  if (product.manufacturerProductCode) {
    const { data, error } = await supabase.from("products").select("id")
      .eq("manufacturer_product_code", product.manufacturerProductCode).limit(50);
    throwIfError(error);
    data?.forEach((row) => ids.add(row.id));
  }
  if (product.sourceUrl) {
    const { data, error } = await supabase.from("product_sources").select("product_id")
      .eq("source_url", product.sourceUrl).limit(50);
    throwIfError(error);
    data?.forEach((row) => { if (row.product_id) ids.add(row.product_id); });
  }
  for (const offer of product.offers) {
    if (!offer.externalProductId) continue;
    const { data, error } = await supabase.from("product_offers").select("product_id")
      .eq("external_product_id", offer.externalProductId).limit(20);
    throwIfError(error);
    data?.forEach((row) => ids.add(row.product_id));
  }
  if (!ids.size) return [];
  const { data, error } = await supabase.from("products").select(`
    id, name, slug, manufacturer_product_code, global_trade_item_number, default_image_url,
    product_brands(name),
    product_variants(gtin, size_value, size_unit),
    product_sources(provider, external_id, source_url),
    product_offers(external_product_id, retailers(name))
  `).in("id", [...ids].slice(0, 100));
  throwIfError(error);
  return (data || []).map(mapCandidate);
}

function mapCandidate(row: Record<string, unknown>): DuplicateCandidate {
  const brand = one(row.product_brands);
  const variants = rows(row.product_variants);
  const sources = rows(row.product_sources);
  const offers = rows(row.product_offers);
  return {
    brandName: string(brand.name),
    defaultImageUrl: nullableString(row.default_image_url),
    gtins: [nullableString(row.global_trade_item_number), ...variants.map((variant) => nullableString(variant.gtin))].filter(isString),
    id: string(row.id),
    manufacturerProductCode: nullableString(row.manufacturer_product_code),
    name: string(row.name),
    offerExternalIds: offers.flatMap((offer) => {
      const externalId = nullableString(offer.external_product_id);
      const retailer = one(offer.retailers);
      return externalId ? [{ externalId, retailerName: string(retailer.name) }] : [];
    }),
    productSlug: string(row.slug),
    sourceExternalIds: sources.flatMap((source) => {
      const externalId = nullableString(source.external_id);
      return externalId ? [{ externalId, provider: string(source.provider) }] : [];
    }),
    sourceUrls: sources.map((source) => nullableString(source.source_url)).filter(isString),
    variantSizes: variants.flatMap((variant) => {
      const value = nullableString(variant.size_value);
      const unit = nullableString(variant.size_unit);
      return value && unit ? [`${value} ${unit}`] : [];
    }),
  };
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function one(value: unknown): Record<string, unknown> { return Array.isArray(value) ? (isRecord(value[0]) ? value[0] : {}) : isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function string(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown) { return typeof value === "string" && value ? value : null; }
function isString(value: string | null): value is string { return Boolean(value); }
function throwIfError(error: unknown) { if (error) throw new Error(`Could not inspect duplicate candidates: ${safeDatabaseMessage(error)}`); }
