import type { ProductProviderMode } from "../product-providers";
import {
  isProductAllowedForRuntime,
  isProductEligibleForCountry,
  normalizeProductCountry,
} from "../product-providers";
import {
  type DogProfile,
  type InternalConcernTag,
  type MockProduct,
  type ProductCategory,
  PRODUCT_SOURCES,
  normalizeAvoidIngredientValues,
  normalizeIngredient,
  productPassesAvoidIngredientFilter,
} from "../petwise";
import type { ShopQueryCategory, ShopQueryInterpretation, ShopQuerySpecies } from "../shop-query";
import {
  getShopAvoidIngredientsFromInterpretation,
  getShopSearchTextFromInterpretation,
} from "../shop-query";

export const MIN_SHOP_QUERY_LENGTH = 3;

export type ShopSearchEmptyState =
  | "missing_pet"
  | "no_query"
  | "query_too_short"
  | "urgent"
  | "shop_limit"
  | "medical_intent"
  | "species_conflict"
  | "ingredient_verification_empty"
  | "no_match"
  | "region_empty";

export type ShopSearchResult = {
  avoidIngredientsRemovedMatches: boolean;
  emptyState: ShopSearchEmptyState | null;
  ingredientVerificationRemovedMatches: boolean;
  products: MockProduct[];
};

export type FilterAndRankShopProductsInput = {
  accountCountry: string | null | undefined;
  interpretation?: ShopQueryInterpretation | null;
  nodeEnv?: typeof process.env.NODE_ENV;
  products: MockProduct[];
  providerMode?: ProductProviderMode;
  query: string;
  selectedPet: DogProfile | null;
};

type RankedProduct = {
  product: MockProduct;
  ranking: number[];
};

const sourcePriority = {
  curated: 3,
  chewy_feed: 2,
  ca_retailer_feed: 1,
} satisfies Record<(typeof PRODUCT_SOURCES)[number], number>;

export function filterAndRankShopProducts({
  accountCountry,
  interpretation = null,
  nodeEnv = process.env.NODE_ENV,
  products,
  providerMode = "static_real",
  query,
  selectedPet,
}: FilterAndRankShopProductsInput): ShopSearchResult {
  const normalizedQuery = normalizeShopQuery(query);
  const interpretedSearchText = normalizeShopQuery(
    getShopSearchTextFromInterpretation(interpretation, query),
  );

  if (!selectedPet) {
    return emptyResult("missing_pet");
  }

  if (!normalizedQuery) {
    return emptyResult("no_query");
  }

  if (normalizedQuery.length < MIN_SHOP_QUERY_LENGTH) {
    return emptyResult("query_too_short");
  }

  if (interpretation?.safetyFlags.urgentCare) {
    return emptyResult("urgent");
  }

  if (interpretation?.safetyFlags.medicalTreatmentIntent) {
    return emptyResult("medical_intent");
  }

  if (hasQuerySpeciesConflict(selectedPet.species, query, interpretation)) {
    return emptyResult("species_conflict");
  }

  const runtimeSafeProducts = products.filter((product) =>
    isShopRuntimeSafeProduct(product, providerMode, nodeEnv),
  );
  const speciesCompatibleProducts = runtimeSafeProducts.filter((product) =>
    isShopSpeciesCompatibleProduct(product, selectedPet.species),
  );
  const queryMatches = speciesCompatibleProducts.filter((product) =>
    productMatchesShopQuery(product, interpretedSearchText || normalizedQuery),
  );
  const avoidIngredients = getNormalizedShopAvoidIngredients(selectedPet, normalizedQuery, interpretation);
  const avoidFiltered = queryMatches.filter((product) =>
    productPassesAvoidIngredientFilter(product, avoidIngredients),
  );
  const country = normalizeProductCountry(accountCountry);
  const countryFiltered = country
    ? avoidFiltered.filter((product) => isProductEligibleForCountry(product, country))
    : [];
  const ingredientVerified = countryFiltered.filter((product) =>
    passesShopIngredientVerification(product, avoidIngredients, interpretedSearchText || normalizedQuery),
  );

  if (ingredientVerified.length > 0) {
    return {
      avoidIngredientsRemovedMatches: queryMatches.length > avoidFiltered.length,
      emptyState: null,
      ingredientVerificationRemovedMatches: countryFiltered.length > ingredientVerified.length,
      products: rankShopProducts({
        interpretation,
        products: ingredientVerified,
        query: interpretedSearchText || normalizedQuery,
        selectedPet,
      }),
    };
  }

  return {
    avoidIngredientsRemovedMatches: queryMatches.length > avoidFiltered.length,
    emptyState:
      queryMatches.length === 0
        ? "no_match"
        : avoidFiltered.length === 0
          ? "no_match"
          : countryFiltered.length === 0
            ? "region_empty"
            : "ingredient_verification_empty",
    ingredientVerificationRemovedMatches: countryFiltered.length > ingredientVerified.length,
    products: [],
  };
}

export function productMatchesShopQuery(product: MockProduct, query: string) {
  const queryTerms = tokenizeForSearch(query);
  if (queryTerms.length === 0) return false;

  const haystack = tokenizeForSearch(getProductSearchText(product));
  const haystackSet = new Set(haystack);

  return queryTerms.every((term) => haystackSet.has(term));
}

export function getNormalizedShopAvoidIngredients(
  selectedPet: Pick<DogProfile, "avoidIngredients">,
  query: string,
  interpretation: ShopQueryInterpretation | null,
) {
  return normalizeAvoidIngredientValues([
    ...selectedPet.avoidIngredients,
    ...getQueryAvoidIngredients(query),
    ...getShopAvoidIngredientsFromInterpretation(interpretation),
  ]).map(normalizeIngredient);
}

export function passesShopIngredientVerification(
  product: MockProduct,
  avoidIngredients: string[] = [],
  query = "",
) {
  if (product.ingredientsVerified) return true;
  if (isIngestibleShopProduct(product)) return false;
  if (isTopicalIngredientSensitiveProduct(product, avoidIngredients, query)) return false;
  return true;
}

export function isShopSpeciesCompatibleProduct(
  product: Pick<MockProduct, "species">,
  species: DogProfile["species"] | null | undefined,
) {
  if (!species) return false;
  return product.species === species || product.species === "all";
}

function emptyResult(emptyState: ShopSearchEmptyState): ShopSearchResult {
  return {
    avoidIngredientsRemovedMatches: false,
    emptyState,
    ingredientVerificationRemovedMatches: false,
    products: [],
  };
}

function isShopRuntimeSafeProduct(
  product: MockProduct,
  providerMode: ProductProviderMode,
  nodeEnv: typeof process.env.NODE_ENV,
) {
  if (product.active === false) return false;
  if (!PRODUCT_SOURCES.includes(product.source)) return false;
  if (providerMode === "static_real" && product.evidenceType === "demo") return false;
  return isProductAllowedForRuntime(product, providerMode, nodeEnv);
}

function hasQuerySpeciesConflict(
  selectedSpecies: DogProfile["species"] | null | undefined,
  query: string,
  interpretation: ShopQueryInterpretation | null,
) {
  if (!selectedSpecies) return false;
  const querySpecies =
    interpretation?.species && interpretation.species !== "unknown"
      ? interpretation.species
      : inferExplicitQuerySpecies(query);
  return Boolean(querySpecies && querySpecies !== selectedSpecies);
}

function inferExplicitQuerySpecies(query: string): Exclude<ShopQuerySpecies, "unknown"> | null {
  const normalized = normalizeShopQuery(query);
  if (/\b(cat|cats|kitten|kittens|feline)\b/.test(normalized)) return "cat";
  if (/\b(dog|dogs|puppy|puppies|canine)\b/.test(normalized)) return "dog";
  return null;
}

function rankShopProducts({
  interpretation,
  products,
  query,
  selectedPet,
}: {
  interpretation: ShopQueryInterpretation | null;
  products: MockProduct[];
  query: string;
  selectedPet: DogProfile;
}) {
  return products
    .map((product) => ({
      product,
      ranking: buildProductRanking(product, query, selectedPet, interpretation),
    }))
    .sort(compareRankedProducts)
    .map((item) => item.product);
}

function buildProductRanking(
  product: MockProduct,
  query: string,
  selectedPet: DogProfile,
  interpretation: ShopQueryInterpretation | null,
) {
  return [
    scoreCategoryMatch(product, query, interpretation),
    scoreQueryMatch(product, query),
    product.species === selectedPet.species ? 2 : product.species === "all" ? 1 : 0,
    product.ingredientsVerified ? 1 : 0,
    sourcePriority[product.source] || 0,
    scoreSecondarySignals(product),
  ];
}

function compareRankedProducts(left: RankedProduct, right: RankedProduct) {
  for (let index = 0; index < left.ranking.length; index += 1) {
    const diff = right.ranking[index] - left.ranking[index];
    if (diff !== 0) return diff;
  }
  return left.product.name.localeCompare(right.product.name) || left.product.id.localeCompare(right.product.id);
}

function scoreCategoryMatch(
  product: MockProduct,
  query: string,
  interpretation: ShopQueryInterpretation | null,
) {
  const category = interpretation?.category || "Other";
  const categoryTags = concernTagsForCategory(category);
  const exactProductCategory = productCategoryForShopCategory(category);
  const queryTerms = new Set(tokenizeForSearch(query));
  const productTags = new Set([
    product.category,
    product.subcategory || "",
    ...product.concernTags,
    ...(product.tags || []),
  ].flatMap(tokenizeForSearch));

  return (
    (exactProductCategory && product.category === exactProductCategory ? 80 : 0) +
    (categoryTags.some((tag) => product.concernTags.includes(tag)) ? 65 : 0) +
    ([...queryTerms].some((term) => productTags.has(term)) ? 35 : 0)
  );
}

function scoreQueryMatch(product: MockProduct, query: string) {
  const exactQuery = normalizeShopQuery(query);
  const name = normalizeShopQuery(product.name);
  const tags = normalizeShopQuery((product.tags || []).join(" "));
  const category = normalizeShopQuery(`${product.category} ${product.subcategory || ""}`);
  const productTokens = tokenizeForSearch(getProductSearchText(product));

  return (
    (name.includes(exactQuery) ? 30 : 0) +
    (tags.includes(exactQuery) ? 20 : 0) +
    (category.includes(exactQuery) ? 12 : 0) +
    tokenizeForSearch(query).filter((term) => productTokens.includes(term)).length * 4
  );
}

function scoreSecondarySignals(product: MockProduct) {
  const rating = (product as MockProduct & { rating?: unknown }).rating;
  const manualScore = (product as MockProduct & { curatedScore?: unknown; retailerConfidence?: unknown }).curatedScore;
  const retailerConfidence = (product as MockProduct & { retailerConfidence?: unknown }).retailerConfidence;
  const numericRating = typeof rating === "number" && Number.isFinite(rating) ? rating : 0;
  const numericManualScore = typeof manualScore === "number" && Number.isFinite(manualScore) ? manualScore : 0;
  const numericRetailerConfidence =
    typeof retailerConfidence === "number" && Number.isFinite(retailerConfidence) ? retailerConfidence : 0;

  return (
    (product.evidenceType === "curated_static" ? 10 : 0) +
    numericRating +
    numericManualScore +
    numericRetailerConfidence
  );
}

function productCategoryForShopCategory(category: ShopQueryCategory): ProductCategory | null {
  if (category === "Grooming" || category === "Itchy skin") return "grooming";
  if (
    category === "Sensitive stomach" ||
    category === "Picky eating" ||
    category === "Weight management"
  ) {
    return "food";
  }
  return null;
}

function concernTagsForCategory(category: ShopQueryCategory): InternalConcernTag[] {
  if (category === "Itchy skin") return ["itchy_skin", "sensitive_skin", "paw_care"];
  if (category === "Sensitive stomach") return ["sensitive_stomach"];
  if (category === "Picky eating") return ["picky_eating"];
  if (category === "Weight management") return ["weight_management"];
  if (category === "Grooming") return ["grooming"];
  if (category === "General wellness") return ["general_wellness", "dental_care"];
  return [];
}

function isIngestibleShopProduct(product: MockProduct) {
  const text = normalizeShopQuery(`${product.category} ${product.subcategory || ""} ${product.tags?.join(" ") || ""}`);
  return /\b(food|treat|treats|chew|chews|dental treat|dental treats|supplement|supplements|edible|nutrition|kibble)\b/.test(
    text,
  );
}

function isTopicalIngredientSensitiveProduct(product: MockProduct, avoidIngredients: string[], query: string) {
  const text = normalizeShopQuery(`${product.name} ${product.category} ${product.subcategory || ""} ${product.tags?.join(" ") || ""}`);
  const topical = /\b(shampoo|wipe|wipes|balm|cleaner|topical|coat|skin)\b/.test(text);
  if (!topical) return false;
  if (avoidIngredients.length > 0) return true;
  if (product.ingredientHighlights?.length) return true;
  return /\b(allerg|ingredient|sensitive|fragrance|oatmeal|aloe|chicken free|free)\b/.test(query);
}

function getProductSearchText(product: MockProduct) {
  return [
    product.name,
    product.brand,
    product.retailer,
    product.category,
    product.subcategory,
    product.sourceNote,
    product.whyItFits,
    product.whyCategoryFits,
    product.cautions,
    ...(product.tags || []),
    ...product.concernTags,
  ]
    .filter(Boolean)
    .join(" ");
}

function getQueryAvoidIngredients(query: string) {
  const matches = [...query.matchAll(/\b([a-z][a-z\s]{1,28}?)[-\s]?free\b/g)];
  const namedAvoids = ["chicken", "beef", "dairy", "egg", "eggs", "grain", "grains", "fish"].filter(
    (ingredient) => new RegExp(`\\b(no|avoid|without)\\s+${ingredient}\\b`, "i").test(query),
  );
  return [...matches.map((match) => match[1].trim()), ...namedAvoids].filter(Boolean);
}

function normalizeShopQuery(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function tokenizeForSearch(value: string) {
  return normalizeShopQuery(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stemSearchToken)
    .filter((term) => term.length > 1 && !["for", "free", "my", "something", "the", "with"].includes(term));
}

function stemSearchToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && value.length > 3) return value.slice(0, -1);
  return value;
}
