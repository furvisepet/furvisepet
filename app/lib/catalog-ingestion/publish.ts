import type { SupabaseClient } from "@supabase/supabase-js";
import { recordIngestionEvent, safeDatabaseMessage } from "./audit.ts";
import { refreshBatchCounts, updateBatchStatus } from "./batches.ts";
import { evaluatePublicationGate } from "./publication-gate.ts";
import { assessIngestionQuality } from "./quality.ts";
import { stableContentHash } from "./hashing.ts";
import {
  buildNonDestructiveProductPatch,
  canSourceWriteField,
  resolveSourceTrustTier,
} from "./trust-policy.ts";
import type { ClaimFlag, DuplicateDetectionResult, NormalizedIngestionProduct, QualityAssessment } from "./types";
import { validateNormalizedProduct } from "./validate.ts";
import { isOrganicCuratedProduct } from "./providers/organic-curated.ts";

type IngestionRecordRow = {
  attempt_count: number;
  batch_id: string;
  duplicate_product_id: string | null;
  id: string;
  claim_flags: ClaimFlag[];
  normalized_hash: string;
  normalized_payload: unknown;
  proposed_action: string;
  publication_gate: unknown;
  quality_assessment: QualityAssessment;
  reviewer_approved_at: string | null;
  raw_payload: Record<string, unknown>;
  status: string;
};

type IngestionBatchRow = {
  id: string;
  provider: string;
  source_type: string;
  source_url: string | null;
  status: string;
};

export async function publishApprovedBatch(supabase: SupabaseClient, batchId: string, actorId?: string | null) {
  const batch = await loadBatch(supabase, batchId);
  if (batch.status !== "approved" && batch.status !== "failed") throw new Error("The batch must be approved before publication.");
  const { data, error } = await supabase.from("product_ingestion_records").select("*")
    .eq("batch_id", batchId).eq("status", "approved").order("row_number").limit(5_000);
  if (error) throw new Error(`Could not load approved records: ${safeDatabaseMessage(error)}`);
  await updateBatchStatus(supabase, batchId, "publishing");
  await recordIngestionEvent(supabase, { actorId, batchId, eventType: "publish_started", metadata: { approvedRecords: data?.length || 0 } });
  const results: { ok: boolean }[] = [];
  for (const rawRecord of data || []) {
    const result = await publishApprovedRecord(supabase, batch, rawRecord as IngestionRecordRow, actorId);
    results.push(result);
  }
  const { failed, published, status } = summarizePublicationResults(results);
  await refreshBatchCounts(supabase, batchId);
  await updateBatchStatus(supabase, batchId, status, {
    completed_at: new Date().toISOString(),
  });
  await recordIngestionEvent(supabase, {
    actorId,
    batchId,
    eventType: failed ? "publish_failed" : "batch_published",
    metadata: { failedRecords: failed, publishedRecords: published },
  });
  return { failed, published };
}

export function summarizePublicationResults(results: { ok: boolean }[]) {
  const failed = results.filter((result) => !result.ok).length;
  const published = results.length - failed;
  return { failed, published, status: failed ? "failed" as const : "published" as const };
}

export async function publishApprovedRecord(
  supabase: SupabaseClient,
  batch: IngestionBatchRow,
  record: IngestionRecordRow,
  actorId?: string | null,
): Promise<{ ok: boolean; productId: string | null }> {
  if (record.status !== "approved") throw new Error("Only approved ingestion records can be published.");
  try {
    const product = parseNormalizedProduct(record.normalized_payload);
    const validation = validateNormalizedProduct(product);
    if (!validation.publishable) throw new Error("Approved record no longer passes validation.");
    if (!product.category.categorySlug) throw new Error("Category mapping must be resolved before publication.");
    const duplicate: DuplicateDetectionResult = {
      candidateProductId: record.duplicate_product_id,
      matchType: "none" as const,
      proposedAction: record.proposed_action === "update" || record.proposed_action === "skip" ? record.proposed_action : "create",
      reasons: [],
    };
    const claims = Array.isArray(record.claim_flags) ? record.claim_flags : [];
    const quality = assessIngestionQuality(product, duplicate, claims);
    const gate = evaluatePublicationGate({ claims, duplicate, product, quality, reviewerApproved: Boolean(record.reviewer_approved_at) });
    if (!gate.allowed) throw new Error(`Publication gate failed: ${gate.reasons.map((reason) => reason.code).join(", ")}`);
    if (record.proposed_action === "skip") {
      const productId = record.duplicate_product_id;
      await markPublished(supabase, record, productId);
      return { ok: true, productId };
    }

    const tier = resolveSourceTrustTier(batch.provider, batch.source_type);
    const category = await resolveCategory(supabase, product.category.subcategorySlug || product.category.categorySlug);
    const brand = await upsertOne(supabase, "product_brands", {
      is_active: true,
      name: product.brandName,
      slug: product.brandSlug,
      website_url: origin(product.sourceUrl),
    }, "slug", "id");
    const existingProductId = record.proposed_action === "update" ? record.duplicate_product_id : null;
    const existing = existingProductId ? await loadProductCore(supabase, existingProductId) : null;
    const merged = buildNonDestructiveProductPatch(existing ? {
      brandName: product.brandName,
      category: product.category,
      description: nullableString(existing.description),
      productName: string(existing.name),
      productType: string(existing.product_type),
      shortDescription: nullableString(existing.short_description),
    } : {}, product, tier);
    const productFields: Record<string, unknown> = {
      brand_id: existing && !canSourceWriteField(tier, "official_product") ? existing.brand_id : brand.id,
      category_id: existing && !canSourceWriteField(tier, "classification") ? existing.category_id : category.id,
      default_image_url: existing?.default_image_url || product.images[0]?.imageUrl || null,
      description: merged.description,
      global_trade_item_number: product.gtin || existing?.global_trade_item_number || null,
      ingredient_list_complete: existing?.ingredient_list_complete === true || product.sourceMetadata.ingredientsComplete === true,
      is_active: existing ? existing.is_active !== false : false,
      manufacturer_product_code: product.manufacturerProductCode || existing?.manufacturer_product_code || null,
      name: merged.productName,
      product_type: merged.productType,
      short_description: merged.shortDescription,
      slug: existing ? existing.slug : product.productSlug,
      status: existing ? existing.status : "draft",
    };
    const productRow = existing
      ? await updateOne(supabase, "products", existingProductId!, productFields, "id")
      : await insertOne(supabase, "products", productFields, "id");
    const productId = string(productRow.id);
    const sourceExternalId = product.externalId || product.sourceUrl || product.productSlug;
    const source = await upsertOne(supabase, "product_sources", {
      content_hash: record.normalized_hash || stableContentHash(product),
      external_id: sourceExternalId,
      fetched_at: verifiedSourceDate(product) || new Date().toISOString(),
      product_id: productId,
      provider: batch.provider,
      raw_payload: sourcePayload(record.raw_payload, product),
      source_type: batch.source_type,
      source_url: product.sourceUrl || batch.source_url,
      trust_level: tier,
    }, "provider,source_type,external_id", "id");
    const sourceId = string(source.id);

    await publishSpecies(supabase, productId, sourceId, product.speciesCodes);
    await publishMarkets(supabase, productId, sourceId, product.countryCodes);
    const variants = await publishVariants(supabase, productId, sourceId, product);
    await publishImages(supabase, productId, sourceId, product, variants);
    if (canSourceWriteField(tier, "label")) {
      await publishTextFacts(supabase, productId, sourceId, product, variants);
    }
    await publishOffers(supabase, batch, record, productId, sourceId, product, variants, actorId);
    await updateOne(supabase, "products", productId, { is_active: true, status: "active" }, "id");
    await markPublished(supabase, record, productId);
    await recordIngestionEvent(supabase, {
      actorId,
      batchId: batch.id,
      eventType: existing ? "product_updated" : "product_created",
      metadata: { productId },
      recordId: record.id,
    });
    return { ok: true, productId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publication failed.";
    await supabase.from("product_ingestion_records").update({
      attempt_count: (record.attempt_count || 0) + 1,
      last_error: { code: "publish_failed", message },
      status: "failed",
    }).eq("id", record.id);
    await recordIngestionEvent(supabase, {
      actorId,
      batchId: batch.id,
      eventType: "publish_failed",
      message,
      recordId: record.id,
    });
    return { ok: false, productId: null };
  }
}

export async function retryFailedRecords(supabase: SupabaseClient, batchId: string, actorId?: string | null) {
  const { error } = await supabase.from("product_ingestion_records").update({ last_error: null, status: "approved" })
    .eq("batch_id", batchId).eq("status", "failed");
  if (error) throw new Error(`Could not prepare failed records: ${safeDatabaseMessage(error)}`);
  await recordIngestionEvent(supabase, { actorId, batchId, eventType: "retry_started" });
  return publishApprovedBatch(supabase, batchId, actorId);
}

async function publishSpecies(supabase: SupabaseClient, productId: string, sourceId: string, codes: string[]) {
  const { data, error } = await supabase.from("species").select("id, code").in("code", codes).eq("is_active", true);
  throwDb(error, "resolve species");
  if ((data || []).length !== codes.length) throw new Error("One or more species codes are not configured.");
  await upsertMany(supabase, "product_species", (data || []).map((species) => ({ product_id: productId, source_id: sourceId, species_id: species.id, suitability_type: "intended" })), "product_id,species_id");
}

async function publishMarkets(supabase: SupabaseClient, productId: string, sourceId: string, countryCodes: string[]) {
  await upsertMany(supabase, "product_markets", countryCodes.map((countryCode) => ({
    country_code: countryCode,
    first_seen_at: new Date().toISOString(),
    product_id: productId,
    source_id: sourceId,
    status: "available",
  })), "product_id,country_code");
}

async function publishVariants(supabase: SupabaseClient, productId: string, sourceId: string, product: NormalizedIngestionProduct) {
  const variants = product.variants.length ? product.variants : [{ flavor: null, gtin: product.gtin, name: "Default", originalSizeText: null, packageQuantity: null, sizeUnit: null, sizeValue: null, sku: null }];
  const result = new Map<string, string>();
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    const row = await upsertOne(supabase, "product_variants", {
      flavor: variant.flavor,
      gtin: variant.gtin,
      is_active: true,
      is_default: index === 0,
      name: variant.name,
      package_quantity: variant.packageQuantity,
      product_id: productId,
      size_unit: variant.sizeUnit,
      size_value: variant.sizeValue,
      sku: variant.sku,
      source_id: sourceId,
    }, "product_id,name", "id");
    for (const key of [variant.name, variant.sku, variant.gtin].filter(isString)) result.set(key.toLowerCase(), string(row.id));
    if (index === 0) result.set("__default__", string(row.id));
  }
  return result;
}

async function publishImages(supabase: SupabaseClient, productId: string, sourceId: string, product: NormalizedIngestionProduct, variants: Map<string, string>) {
  const { data: existing, error } = await supabase.from("product_images").select("image_url, is_primary").eq("product_id", productId);
  throwDb(error, "load images");
  const urls = new Set((existing || []).map((image) => image.image_url));
  let hasPrimary = (existing || []).some((image) => image.is_primary);
  for (let index = 0; index < product.images.length; index += 1) {
    const image = product.images[index];
    if (urls.has(image.imageUrl)) continue;
    const primary = !hasPrimary && (image.isPrimary || index === 0);
    await insertOne(supabase, "product_images", {
      alt_text: image.altText,
      image_url: image.imageUrl,
      is_primary: primary,
      position: (existing || []).length + index,
      product_id: productId,
      source_id: sourceId,
      variant_id: resolveVariant(variants, image.variantIdentifier),
    }, "id");
    if (primary) hasPrimary = true;
  }
}

async function publishTextFacts(supabase: SupabaseClient, productId: string, sourceId: string, product: NormalizedIngestionProduct, variants: Map<string, string>) {
  const variantId = variants.get("__default__") || null;
  await insertMissingTextRows(supabase, "product_ingredients", "label_name", productId, product.ingredients, (text, position) => ({ ingredient_id: null, label_name: text, position, product_id: productId, source_id: sourceId, variant_id: variantId }));
  await insertMissingTextRows(supabase, "product_warnings", "text", productId, product.warnings, (text) => ({ product_id: productId, source_id: sourceId, text, variant_id: variantId, warning_type: "source" }));
  await insertMissingTextRows(supabase, "product_directions", "text", productId, product.directions, (text) => ({ direction_type: "source", product_id: productId, source_id: sourceId, text, variant_id: variantId }));
}

async function publishOffers(supabase: SupabaseClient, batch: IngestionBatchRow, record: IngestionRecordRow, productId: string, sourceId: string, product: NormalizedIngestionProduct, variants: Map<string, string>, actorId?: string | null) {
  const organic = isOrganicCuratedProduct(product);
  for (const offer of product.offers) {
    const retailer = await upsertOne(supabase, "retailers", { is_active: true, name: offer.retailerName, slug: offer.retailerSlug, website_url: origin(offer.destinationUrl) || offer.destinationUrl }, "slug", "id");
    const variantId = resolveVariant(variants, offer.variantIdentifier) || variants.get("__default__") || null;
    const { data: existing, error } = await supabase.from("product_offers").select("*")
      .eq("product_id", productId).eq("variant_id", variantId).eq("retailer_id", retailer.id).eq("country_code", offer.countryCode).maybeSingle();
    throwDb(error, "load offer");
    const stale = offer.freshnessStatus === "stale";
    const authorizedContent = authorizedContentTypes(product);
    const pricePermitted = !organic && (!authorizedContent || authorizedContent.has("prices"));
    const affiliatePermitted = !organic && (!authorizedContent || authorizedContent.has("affiliate_links"));
    const nextPrice = stale || !pricePermitted ? null : offer.priceAmount ?? existing?.price_amount ?? null;
    const nextOriginalPrice = stale || !pricePermitted ? null : offer.originalPriceAmount ?? existing?.original_price_amount ?? null;
    const nextAvailability = organic ? "unknown" : stale ? "unknown" : offer.availabilityStatus === "unknown" && existing?.availability_status
      ? existing.availability_status
      : offer.availabilityStatus;
    await upsertOne(supabase, "product_offers", {
      affiliate_url: affiliatePermitted ? offer.affiliateUrl || existing?.affiliate_url || null : null,
      availability_status: nextAvailability,
      country_code: offer.countryCode,
      currency_code: offer.currencyCode,
      destination_url: offer.destinationUrl,
      external_product_id: offer.externalProductId,
      fetched_at: offer.fetchedAt,
      freshness_status: offer.freshnessStatus,
      is_active: true,
      last_checked_at: offer.lastCheckedAt || new Date().toISOString(),
      original_price_amount: nextOriginalPrice,
      price_amount: nextPrice,
      product_id: productId,
      retailer_id: retailer.id,
      source_id: sourceId,
      source_content_hash: offer.sourceContentHash,
      source_export_date: offer.sourceExportDate,
      source_feed_version: offer.feedVersion,
      stale_after: staleAfter(offer.lastCheckedAt || offer.fetchedAt || offer.sourceExportDate, offer.staleThresholdHours),
      variant_id: variantId,
    }, "product_id,variant_id,retailer_id,country_code", "id");
    if (existing?.price_amount != null && offer.priceAmount != null && String(existing.price_amount) !== offer.priceAmount) {
      await recordIngestionEvent(supabase, { actorId, batchId: batch.id, eventType: "offer_price_changed", metadata: { newPrice: offer.priceAmount, oldPrice: String(existing.price_amount), productId }, recordId: record.id });
    }
  }
}

function staleAfter(value: string | null, hours: number | null) {
  if (!value || hours === null) return null;
  return new Date(Date.parse(value) + hours * 60 * 60 * 1_000).toISOString();
}

function verifiedSourceDate(product: NormalizedIngestionProduct) {
  if (!isOrganicCuratedProduct(product)) return null;
  const value = product.sourceMetadata.verificationDate;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function sourcePayload(raw: Record<string, unknown>, product: NormalizedIngestionProduct) {
  if (!isOrganicCuratedProduct(product)) return raw;
  return { ...raw, _furvisePermissionSnapshot: product.sourceMetadata.permissionSnapshot };
}

function authorizedContentTypes(product: NormalizedIngestionProduct) {
  if (product.sourceMetadata.providerContractRequired !== true) return null;
  const snapshot = product.sourceMetadata.permissionSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return new Set<string>();
  const contentTypes = (snapshot as Record<string, unknown>).permittedContentTypes;
  return new Set(Array.isArray(contentTypes) ? contentTypes.filter((value): value is string => typeof value === "string") : []);
}

async function insertMissingTextRows(supabase: SupabaseClient, table: string, column: string, productId: string, values: string[], row: (value: string, index: number) => Record<string, unknown>) {
  if (!values.length) return;
  const { data, error } = await supabase.from(table).select(column).eq("product_id", productId);
  throwDb(error, `load ${table}`);
  const existing = new Set((data || []).map((item) => String((item as unknown as Record<string, unknown>)[column]).trim().toLowerCase()));
  const missing = values.filter((value) => !existing.has(value.trim().toLowerCase())).map(row);
  if (missing.length) {
    const { error: insertError } = await supabase.from(table).insert(missing);
    throwDb(insertError, `insert ${table}`);
  }
}

async function markPublished(supabase: SupabaseClient, record: IngestionRecordRow, productId: string | null) {
  const { error } = await supabase.from("product_ingestion_records").update({
    attempt_count: (record.attempt_count || 0) + 1,
    last_error: null,
    published_product_id: productId,
    status: "published",
  }).eq("id", record.id).eq("status", "approved");
  throwDb(error, "mark record published");
}

async function loadBatch(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("product_ingestion_batches").select("id, provider, source_type, source_url, status").eq("id", id).single();
  if (error || !data) throw new Error(`Could not load ingestion batch: ${safeDatabaseMessage(error)}`);
  return data as IngestionBatchRow;
}

async function resolveCategory(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase.from("product_categories").select("id, slug").eq("slug", slug).eq("is_active", true).single();
  if (error || !data) throw new Error(`Category ${slug} is not configured.`);
  return data;
}

async function loadProductCore(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Existing product could not be loaded.");
  return data as Record<string, unknown>;
}

async function upsertOne(supabase: SupabaseClient, table: string, values: Record<string, unknown>, onConflict: string, select: string) {
  const { data, error } = await supabase.from(table).upsert(values, { onConflict }).select(select).single();
  throwDb(error, `upsert ${table}`);
  return data as unknown as Record<string, unknown>;
}
async function upsertMany(supabase: SupabaseClient, table: string, values: Record<string, unknown>[], onConflict: string) { const { error } = await supabase.from(table).upsert(values, { onConflict }); throwDb(error, `upsert ${table}`); }
async function insertOne(supabase: SupabaseClient, table: string, values: Record<string, unknown>, select: string) { const { data, error } = await supabase.from(table).insert(values).select(select).single(); throwDb(error, `insert ${table}`); return data as unknown as Record<string, unknown>; }
async function updateOne(supabase: SupabaseClient, table: string, id: string, values: Record<string, unknown>, select: string) { const { data, error } = await supabase.from(table).update(values).eq("id", id).select(select).single(); throwDb(error, `update ${table}`); return data as unknown as Record<string, unknown>; }
function throwDb(error: unknown, action: string) { if (error) throw new Error(`Could not ${action}: ${safeDatabaseMessage(error)}`); }
function origin(value: string | null) { if (!value) return null; try { return new URL(value).origin; } catch { return null; } }
function resolveVariant(variants: Map<string, string>, value: string | null) { return value ? variants.get(value.toLowerCase()) || null : null; }
function parseNormalizedProduct(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Normalized payload is invalid."); return value as NormalizedIngestionProduct; }
function string(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableString(value: unknown) { return typeof value === "string" && value ? value : null; }
function isString(value: string | null): value is string { return Boolean(value); }
