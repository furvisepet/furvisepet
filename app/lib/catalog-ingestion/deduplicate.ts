import type {
  DuplicateCandidate,
  DuplicateDetectionResult,
  NormalizedIngestionProduct,
} from "./types";

export function detectProductDuplicate({
  candidates,
  normalizedHash,
  previousNormalizedHash = null,
  product,
  provider,
}: {
  candidates: DuplicateCandidate[];
  normalizedHash: string;
  previousNormalizedHash?: string | null;
  product: NormalizedIngestionProduct;
  provider: string;
}): DuplicateDetectionResult {
  if (previousNormalizedHash && previousNormalizedHash === normalizedHash) {
    return { candidateProductId: null, matchType: "exact", proposedAction: "skip", reasons: ["unchanged_normalized_hash"] };
  }
  const incomingGtins = new Set([product.gtin, ...product.variants.map((variant) => variant.gtin)].filter(isString));
  for (const candidate of candidates) {
    if ([...incomingGtins].some((gtin) => candidate.gtins.includes(gtin))) return exact(candidate.id, "gtin");
    if (product.externalId && candidate.sourceExternalIds.some((source) => source.provider === provider && source.externalId === product.externalId)) return exact(candidate.id, "provider_external_id");
    if (product.manufacturerProductCode && normalize(candidate.brandName) === normalize(product.brandName) && candidate.manufacturerProductCode === product.manufacturerProductCode) return exact(candidate.id, "manufacturer_product_code");
    if (product.offers.some((offer) => offer.externalProductId && candidate.offerExternalIds.some((existing) => existing.externalId === offer.externalProductId && normalize(existing.retailerName) === normalize(offer.retailerName)))) return exact(candidate.id, "retailer_external_id");
  }

  for (const candidate of candidates) {
    const sameBrandAndName = normalize(candidate.brandName) === normalize(product.brandName) && normalize(candidate.name) === normalize(product.productName);
    const incomingSizes = product.variants.map(variantSize).filter(isString);
    if (sameBrandAndName && incomingSizes.some((size) => candidate.variantSizes.includes(size))) {
      return { candidateProductId: candidate.id, matchType: "probable", proposedAction: "manual_review", reasons: ["brand_name_variant_size"] };
    }
    if (sameBrandAndName) return possible(candidate.id, "brand_and_product_name");
    if (slugSimilarity(candidate.productSlug, product.productSlug) >= 0.9) return possible(candidate.id, "similar_slug");
    if (product.sourceUrl && candidate.sourceUrls.includes(product.sourceUrl)) return possible(candidate.id, "source_url");
    if (product.images.some((image) => image.imageUrl === candidate.defaultImageUrl) && normalize(candidate.name) === normalize(product.productName)) return possible(candidate.id, "image_and_product_name");
  }
  return { candidateProductId: null, matchType: "none", proposedAction: "create", reasons: [] };
}

function exact(id: string, reason: string): DuplicateDetectionResult { return { candidateProductId: id, matchType: "exact", proposedAction: "update", reasons: [reason] }; }
function possible(id: string, reason: string): DuplicateDetectionResult { return { candidateProductId: id, matchType: "possible", proposedAction: "manual_review", reasons: [reason] }; }
function normalize(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
function variantSize(variant: NormalizedIngestionProduct["variants"][number]) { return variant.sizeValue && variant.sizeUnit ? `${variant.sizeValue} ${variant.sizeUnit}` : null; }
function isString(value: string | null): value is string { return Boolean(value); }

function slugSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}
