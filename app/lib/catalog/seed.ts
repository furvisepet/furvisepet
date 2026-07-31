import type { SupabaseClient } from "@supabase/supabase-js";
import type { MockProduct } from "../petwise";
import { staticRealProducts } from "../products/static-products.ts";

type SeedProduct = {
  brandSlug: string;
  categorySlug: string;
  product: MockProduct;
  productSlug: string;
  retailerSlug: string;
};

export type CatalogSeedPlan = {
  brands: { name: string; slug: string; website_url: string | null }[];
  products: SeedProduct[];
  retailers: { name: string; slug: string; website_url: string }[];
};

export function buildCuratedCatalogSeedPlan(products: MockProduct[] = staticRealProducts): CatalogSeedPlan {
  const brandMap = new Map<string, CatalogSeedPlan["brands"][number]>();
  const retailerMap = new Map<string, CatalogSeedPlan["retailers"][number]>();
  const plannedProducts = products.map((product) => {
    const productUrl = getDestinationUrl(product);
    const brandName = normalizeName(product.brand || product.retailer || "Independent");
    const retailerName = normalizeName(product.retailer || product.brand || "Manufacturer");
    const brandSlug = slugify(brandName);
    const retailerSlug = slugify(retailerName);
    brandMap.set(brandSlug, { name: brandName, slug: brandSlug, website_url: originOf(productUrl) });
    retailerMap.set(retailerSlug, {
      name: retailerName,
      slug: retailerSlug,
      website_url: originOf(productUrl) || productUrl,
    });
    return {
      brandSlug,
      categorySlug: categorySlugFor(product.category),
      product,
      productSlug: slugify(product.id || product.name),
      retailerSlug,
    };
  });

  return {
    brands: [...brandMap.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    products: plannedProducts.sort((a, b) => a.productSlug.localeCompare(b.productSlug)),
    retailers: [...retailerMap.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

export async function seedCuratedCatalog(
  supabase: SupabaseClient,
  products: MockProduct[] = staticRealProducts,
) {
  const plan = buildCuratedCatalogSeedPlan(products);
  const brands = new Map<string, string>();
  const categories = new Map<string, string>();
  const retailers = new Map<string, string>();
  const species = new Map<string, string>();

  for (const brand of plan.brands) {
    const row = await upsertOne(supabase, "product_brands", { ...brand, is_active: true }, "slug", "id, slug");
    brands.set(String(row.slug), String(row.id));
  }
  for (const retailer of plan.retailers) {
    const row = await upsertOne(supabase, "retailers", { ...retailer, is_active: true }, "slug", "id, slug");
    retailers.set(String(row.slug), String(row.id));
  }

  const categorySlugs = [...new Set(plan.products.map((item) => item.categorySlug))];
  const { data: categoryRows, error: categoryError } = await supabase
    .from("product_categories")
    .select("id, slug")
    .in("slug", categorySlugs);
  throwIfError(categoryError, "load product categories");
  for (const row of categoryRows || []) categories.set(String(row.slug), String(row.id));

  const speciesCodes = [...new Set(plan.products.flatMap((item) => item.product.species))];
  const { data: speciesRows, error: speciesError } = await supabase.from("species").select("id, code").in("code", speciesCodes);
  throwIfError(speciesError, "load species");
  for (const row of speciesRows || []) species.set(String(row.code), String(row.id));

  let seededProducts = 0;
  for (const planned of plan.products) {
    const product = planned.product;
    const brandId = requiredMapValue(brands, planned.brandSlug, "brand");
    const categoryId = requiredMapValue(categories, planned.categorySlug, "category");
    const destinationUrl = getDestinationUrl(product);
    const productRow = await upsertOne(supabase, "products", {
      advisor_summary: product.whyItFits,
      brand_id: brandId,
      category_id: categoryId,
      category_rationale: product.whyCategoryFits,
      cautions: product.cautions,
      concern_tags: product.concernTags,
      default_image_url: product.imageUrl || null,
      description: product.verifiedDescription || product.shortDescription || null,
      ingredient_list_complete: product.ingredientsVerified,
      is_active: product.active !== false,
      life_stage: product.lifeStage,
      name: product.name,
      primary_protein: product.protein || null,
      product_type: product.subcategory || product.productTypeLabel || product.category,
      search_tags: product.tags || [],
      short_description: product.shortDescription || product.verifiedDescription || null,
      slug: planned.productSlug,
      status: product.active === false ? "inactive" : "active",
    }, "slug", "id, slug");
    const productId = String(productRow.id);

    const source = await upsertOne(supabase, "product_sources", {
      external_id: product.id,
      fetched_at: product.lastVerifiedAt || null,
      product_id: productId,
      provider: "internal_curated",
      raw_payload: product,
      source_type: "manual",
      source_url: product.sourceUrl || product.verifiedProductPageUrl || destinationUrl,
      trust_level: "reviewed",
    }, "provider,source_type,external_id", "id");
    const sourceId = String(source.id);

    const variant = await upsertOne(supabase, "product_variants", {
      is_active: product.active !== false,
      is_default: true,
      name: "Default",
      product_id: productId,
      source_id: sourceId,
    }, "product_id,name", "id");
    const variantId = String(variant.id);

    await upsertMany(supabase, "product_species", product.species.map((code) => ({
      product_id: productId,
      species_id: requiredMapValue(species, code, "species"),
      source_id: sourceId,
      suitability_type: "intended",
    })), "product_id,species_id");

    await upsertMany(supabase, "product_markets", product.availableCountries.map((countryCode) => ({
      country_code: countryCode,
      first_seen_at: product.lastVerifiedAt || null,
      last_verified_at: product.lastVerifiedAt || null,
      product_id: productId,
      source_id: sourceId,
      status: "available",
    })), "product_id,country_code");

    for (const table of ["product_images", "product_ingredients", "product_warnings", "product_directions"] as const) {
      const { error } = await supabase.from(table).delete().eq("product_id", productId).eq("source_id", sourceId);
      throwIfError(error, `refresh ${table}`);
    }

    if (product.imageUrl) {
      await insertMany(supabase, "product_images", [{
        alt_text: product.name,
        image_url: product.imageUrl,
        is_primary: true,
        position: 0,
        product_id: productId,
        source_id: sourceId,
        variant_id: variantId,
      }]);
    }
    await insertMany(supabase, "product_ingredients", (product.verifiedIngredients || []).map((labelName, position) => ({
      ingredient_id: null,
      label_name: labelName,
      position,
      product_id: productId,
      source_id: sourceId,
      variant_id: variantId,
    })));
    await insertMany(supabase, "product_warnings", (product.verifiedWarnings || []).map((text) => ({
      product_id: productId,
      source_id: sourceId,
      text,
      variant_id: variantId,
      warning_type: "manufacturer",
    })));
    if (product.verifiedDirections) {
      await insertMany(supabase, "product_directions", [{
        direction_type: "manufacturer",
        product_id: productId,
        source_id: sourceId,
        text: product.verifiedDirections,
        variant_id: variantId,
      }]);
    }

    const retailerId = requiredMapValue(retailers, planned.retailerSlug, "retailer");
    await upsertMany(supabase, "product_offers", product.availableCountries.map((countryCode) => ({
      affiliate_url: product.affiliateUrl || null,
      availability_status: "unknown",
      country_code: countryCode,
      currency_code: product.currency || (countryCode === "CA" ? "CAD" : "USD"),
      destination_url: destinationUrl,
      external_product_id: product.id,
      is_active: product.active !== false,
      last_checked_at: product.priceVerifiedAt || product.lastVerifiedAt || null,
      price_amount: moneyString(product.price ?? product.bagPrice),
      product_id: productId,
      retailer_id: retailerId,
      source_id: sourceId,
      variant_id: variantId,
    })), "product_id,variant_id,retailer_id,country_code");
    seededProducts += 1;
  }

  return { brands: plan.brands.length, products: seededProducts, retailers: plan.retailers.length };
}

function getDestinationUrl(product: MockProduct) {
  const value = product.productPageUrl || product.verifiedProductPageUrl || product.retailerUrl || product.productUrl || product.sourceUrl;
  if (!value || !/^https?:\/\//i.test(value)) throw new Error(`Curated product ${product.id} needs a valid destination URL.`);
  return value;
}

function categorySlugFor(category: MockProduct["category"]) {
  return category === "health_essentials" ? "health-essentials" : category;
}

function normalizeName(value: string) { return value.trim().replace(/\s+/g, " "); }
function slugify(value: string) { return value.normalize("NFKD").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function originOf(value: string) { try { return new URL(value).origin; } catch { return null; } }
function moneyString(value: number | undefined) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toFixed(2) : null; }
function requiredMapValue(map: Map<string, string>, key: string, label: string) { const value = map.get(key); if (!value) throw new Error(`Missing catalog ${label}: ${key}`); return value; }

async function upsertOne(supabase: SupabaseClient, table: string, row: Record<string, unknown>, onConflict: string, select: string) {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select(select).single();
  throwIfError(error, `upsert ${table}`);
  return data as unknown as Record<string, unknown>;
}

async function upsertMany(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  throwIfError(error, `upsert ${table}`);
}

async function insertMany(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  throwIfError(error, `insert ${table}`);
}

function throwIfError(error: unknown, action: string): asserts error is null {
  if (error) throw new Error(`Could not ${action}: ${formatError(error)}`);
}

function formatError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}
