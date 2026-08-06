import { isSafeHttpUrl } from "./validate.ts";
import type { NormalizedIngestionProduct } from "./types";

export type ProductSafetyClass = "ingestible" | "topical" | "accessory" | "other";

export function requiresLaunchSafetyGate(product: NormalizedIngestionProduct) {
  return product.sourceMetadata.ingestionMode === "organic_curated"
    || product.sourceMetadata.providerId === "purina_ca_official_manual";
}

export function classifyProductSafety(product: NormalizedIngestionProduct): ProductSafetyClass {
  const value = `${product.category.categorySlug || ""} ${product.category.subcategorySlug || ""} ${product.productType}`.toLowerCase();
  if (/\b(food|treat|chew|supplement|vitamin|probiotic|edible|nutrition)\b/.test(value)) return "ingestible";
  if (/\b(topical|shampoo|conditioner|wipe|balm|spray|ointment|skin|grooming)\b/.test(value)) return "topical";
  if (/\b(accessor|toy|collar|leash|harness|bed|bowl|carrier|crate|brush|comb|litter)\b/.test(value)) return "accessory";
  return "other";
}

export function productSafetyFailures(product: NormalizedIngestionProduct) {
  const failures: { code: string; message: string }[] = [];
  const classification = classifyProductSafety(product);
  const hasIdentity = Boolean(product.brandName && product.productName);
  const hasMarket = product.countryCodes.length > 0 && product.countryCodes.every((country) => country === "CA" || country === "US");
  const hasProductUrl = isSafeHttpUrl(product.sourceUrl) || product.offers.some((offer) => isSafeHttpUrl(offer.destinationUrl));
  if (!hasIdentity) add("product_identity_incomplete", "Brand and exact product name are required.");
  if (!product.speciesCodes.length) add("species_missing", "Species compatibility is required.");
  if (!hasMarket) add("market_not_supported", "A CA or US market is required.");
  if (!product.category.categorySlug) add("category_unmapped", "A mapped category is required.");
  if (!hasProductUrl) add("product_url_missing", "A valid official or retailer product URL is required.");
  if (classification === "ingestible" && (!product.ingredients.length || product.sourceMetadata.ingredientsComplete !== true)) {
    add("complete_ingredients_required", "Ingestible products require a complete ingredient list.");
  }
  if (classification === "topical" && product.sourceMetadata.ingredientSensitiveMatching === true && (!product.ingredients.length || product.sourceMetadata.ingredientsComplete !== true)) {
    add("topical_ingredients_required", "Ingredient-sensitive topical products require a complete ingredient list.");
  }
  if (classification === "topical" && product.sourceMetadata.warningsApplicable === true && !product.warnings.length) {
    add("topical_warnings_required", "Applicable topical cautions or warnings are required.");
  }
  return failures;

  function add(code: string, message: string) { failures.push({ code, message }); }
}
