import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clampCatalogResultLimit,
  normalizeCatalogCountryCode,
  normalizeCatalogCursor,
  normalizeCatalogSpeciesCode,
} from "./constants.ts";
import { mapCatalogProductRow, toCatalogProductSummary } from "./mappers.ts";
import type {
  CatalogOffer,
  CatalogProductDetail,
  CatalogProductPage,
  GetCatalogProductsInput,
} from "./types";

const CATALOG_PRODUCT_SUMMARY_SELECT = `
  id,
  name,
  slug,
  short_description,
  product_type,
  status,
  default_image_url,
  life_stage,
  primary_protein,
  search_tags,
  concern_tags,
  ingredient_list_complete,
  advisor_summary,
  category_rationale,
  cautions,
  product_brands!inner(id, name, slug),
  product_categories!inner(id, parent_id, name, slug),
  product_species(suitability_type, species(id, code, name)),
  product_markets(country_code, status, last_verified_at),
  product_offers(
    id,
    variant_id,
    country_code,
    destination_url,
    affiliate_url,
    currency_code,
    price_amount,
    original_price_amount,
    availability_status,
    is_active,
    retailers(id, name, slug)
  )
`;

const CATALOG_PRODUCT_DETAIL_SELECT = `
  id,
  name,
  slug,
  short_description,
  description,
  product_type,
  status,
  default_image_url,
  life_stage,
  primary_protein,
  search_tags,
  concern_tags,
  ingredient_list_complete,
  advisor_summary,
  category_rationale,
  cautions,
  product_brands!inner(id, name, slug),
  product_categories!inner(id, parent_id, name, slug),
  product_species(suitability_type, species(id, code, name)),
  product_markets(country_code, status, last_verified_at),
  product_variants(id, name, sku, gtin, size_value, size_unit, flavor, package_quantity, is_default, is_active),
  product_images(id, variant_id, image_url, alt_text, position, is_primary),
  product_ingredients(id, variant_id, label_name, position, is_active_ingredient, ingredients(canonical_name)),
  product_warnings(id, variant_id, warning_type, text),
  product_directions(id, variant_id, direction_type, text),
  product_offers(
    id,
    variant_id,
    country_code,
    destination_url,
    affiliate_url,
    currency_code,
    price_amount,
    original_price_amount,
    availability_status,
    is_active,
    retailers(id, name, slug)
  )
`;

export class CatalogQueryError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "CatalogQueryError";
  }
}

export async function getCatalogProducts(
  supabase: SupabaseClient,
  input: GetCatalogProductsInput,
): Promise<CatalogProductPage> {
  const page = await loadCatalogProductPage(supabase, input, CATALOG_PRODUCT_SUMMARY_SELECT);
  return { items: page.items.map(toCatalogProductSummary), nextCursor: page.nextCursor };
}

/** Temporary adapter for the existing product-card model. Remove with MockProduct. */
export async function getCatalogProductDetailsForCompatibility(
  supabase: SupabaseClient,
  input: GetCatalogProductsInput,
): Promise<{ items: CatalogProductDetail[]; nextCursor: string | null }> {
  return loadCatalogProductPage(supabase, input, CATALOG_PRODUCT_DETAIL_SELECT);
}

async function loadCatalogProductPage(
  supabase: SupabaseClient,
  input: GetCatalogProductsInput,
  select: string,
): Promise<{ items: CatalogProductDetail[]; nextCursor: string | null }> {
  const countryCode = normalizeCatalogCountryCode(input.countryCode);
  const speciesCode = normalizeCatalogSpeciesCode(input.speciesCode);
  if (!countryCode || !speciesCode || input.active === false) return { items: [], nextCursor: null };

  const limit = clampCatalogResultLimit(input.limit);
  const cursor = normalizeCatalogCursor(input.cursor);
  const { data: idsData, error: idsError } = await supabase.rpc("search_catalog_product_ids", {
    p_after_slug: cursor,
    p_category_slug: input.category?.trim() || null,
    p_country_code: countryCode,
    p_limit: limit + 1,
    p_species_code: speciesCode,
    p_text_query: input.textQuery?.trim() || null,
  });
  if (idsError) throw new CatalogQueryError("Catalog search failed.", idsError);

  const idRows = Array.isArray(idsData) ? idsData : [];
  const pageRows = idRows.slice(0, limit);
  const ids = pageRows
    .map((row) => (isRecord(row) && typeof row.product_id === "string" ? row.product_id : null))
    .filter((id): id is string => Boolean(id));
  if (!ids.length) return { items: [], nextCursor: null };

  const details = await loadCatalogProductsByIds(supabase, ids, select);
  const byId = new Map(details.map((product) => [product.id, product]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((product): product is CatalogProductDetail => Boolean(product))
    .filter((product) => isCatalogProductSafeForContext(product, speciesCode, countryCode))
    .map((product) => ({
      ...product,
      markets: product.markets.filter((market) => market.countryCode === countryCode && market.status === "available"),
      offers: product.offers.filter((offer) => offer.countryCode === countryCode && offer.isActive),
    }));

  return {
    items: ordered,
    nextCursor: idRows.length > limit ? ordered.at(-1)?.slug || null : null,
  };
}

export async function getCatalogProductBySlug(
  supabase: SupabaseClient,
  slug: string,
  context: Pick<GetCatalogProductsInput, "countryCode" | "speciesCode">,
) {
  return getCatalogProduct(supabase, "slug", slug, context);
}

export async function getCatalogProductById(
  supabase: SupabaseClient,
  id: string,
  context: Pick<GetCatalogProductsInput, "countryCode" | "speciesCode">,
) {
  return getCatalogProduct(supabase, "id", id, context);
}

export async function getProductDetails(
  supabase: SupabaseClient,
  id: string,
  context: Pick<GetCatalogProductsInput, "countryCode" | "speciesCode">,
) {
  return getCatalogProductById(supabase, id, context);
}

export async function getProductOffers(
  supabase: SupabaseClient,
  productId: string,
  context: Pick<GetCatalogProductsInput, "countryCode" | "speciesCode">,
): Promise<CatalogOffer[]> {
  const product = await getCatalogProductById(supabase, productId, context);
  return product?.offers || [];
}

async function getCatalogProduct(
  supabase: SupabaseClient,
  column: "id" | "slug",
  value: string,
  context: Pick<GetCatalogProductsInput, "countryCode" | "speciesCode">,
) {
  const countryCode = normalizeCatalogCountryCode(context.countryCode);
  const speciesCode = normalizeCatalogSpeciesCode(context.speciesCode);
  if (!countryCode || !speciesCode) return null;

  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_PRODUCT_DETAIL_SELECT)
    .eq(column, value)
    .eq("status", "active")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new CatalogQueryError("Product details could not be loaded.", error);
  if (!data) return null;
  const product = mapCatalogProductRow(data as unknown as Record<string, unknown>);
  if (!isCatalogProductSafeForContext(product, speciesCode, countryCode)) return null;
  return {
    ...product,
    markets: product.markets.filter((market) => market.countryCode === countryCode && market.status === "available"),
    offers: product.offers.filter((offer) => offer.countryCode === countryCode && offer.isActive),
  };
}

async function loadCatalogProductsByIds(supabase: SupabaseClient, ids: string[], select: string) {
  const { data, error } = await supabase
    .from("products")
    .select(select)
    .in("id", ids)
    .eq("status", "active")
    .eq("is_active", true);
  if (error) throw new CatalogQueryError("Catalog products could not be loaded.", error);
  return (Array.isArray(data) ? data : []).map((row) =>
    mapCatalogProductRow(row as unknown as Record<string, unknown>),
  );
}

export function isCatalogProductSafeForContext(product: CatalogProductDetail, speciesCode: string, countryCode: string) {
  return product.status === "active"
    && product.species.some((item) => item.code === speciesCode && item.suitabilityType !== "restricted")
    && product.markets.some((market) => market.countryCode === countryCode && market.status === "available");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
