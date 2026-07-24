import type { ProductProviderMode } from "../product-providers";
import {
  isProductAllowedForRuntime,
  isProductEligibleForCountry,
  normalizeProductCountry,
} from "../product-providers";
import {
  type PetProfile,
  type InternalConcernTag,
  type MockProduct,
  type ProductCategory,
  PRODUCT_SOURCES,
  isSharedSpeciesProduct,
  normalizeAvoidIngredientValues,
  normalizeIngredient,
  productPassesAvoidIngredientFilter,
} from "../petwise";
import type { ShopQueryCategory, ShopQueryInterpretation, ShopQuerySpecies } from "../shop-query";
import {
  getShopAvoidIngredientsFromInterpretation,
  getShopGroomingSynonymSearchTerms,
  getShopSearchTextFromInterpretation,
  hasShopGroomingSynonymIntent,
  isVagueShopQueryWithoutSignal,
} from "../shop-query";

export const MIN_SHOP_QUERY_LENGTH = 3;

export type ShopSearchEmptyState =
  | "missing_pet"
  | "no_query"
  | "query_too_short"
  | "vague_query"
  | "urgent"
  | "shop_limit"
  | "medical_intent"
  | "species_conflict"
  | "ingredient_verification_empty"
  | "no_match"
  | "region_empty";

export type ShopSearchEmptyStateReason =
  | "missing_pet"
  | "no_query"
  | "query_too_short"
  | "vague_query_without_signal"
  | "urgent"
  | "medical_intent"
  | "species_conflict"
  | "no_products_in_catalog"
  | "no_runtime_safe_products"
  | "no_product_for_selected_country"
  | "no_species_match"
  | "no_query_match"
  | "avoid_ingredient_filter_removed_all"
  | "no_ingredient_verified_match"
  | "matched";

export type ShopSearchDiagnostics = {
  avoidIngredientCount: number;
  emptyStateReason: ShopSearchEmptyStateReason;
  expandedSearchTerms: string[];
  finalResultCount: number;
  ingredientSensitiveQuery: boolean;
  interpretationCategory: ShopQueryCategory | null;
  interpretedSearchTerms: string[];
  productsAfterAvoidIngredientFilter: number;
  productsAfterCountryFilter: number;
  productsAfterIngredientsVerifiedFilter: number;
  productsAfterQueryMatch: number;
  productsAfterSpeciesFilter: number;
  rawQueryTerms: string[];
  runtimeSafeProductsCount: number;
  selectedCountry: string | null;
  selectedSpecies: string | null;
  totalProductsLoaded: number;
};

export type ShopSearchResult = {
  avoidIngredientsRemovedMatches: boolean;
  diagnostics?: ShopSearchDiagnostics;
  emptyState: ShopSearchEmptyState | null;
  ingredientVerificationRemovedMatches: boolean;
  products: MockProduct[];
};

export type FilterAndRankShopProductsInput = {
  accountCountry: string | null | undefined;
  interpretation?: ShopQueryInterpretation | null;
  includeDiagnostics?: boolean;
  nodeEnv?: typeof process.env.NODE_ENV;
  products: MockProduct[];
  providerMode?: ProductProviderMode;
  query: string;
  selectedPet: PetProfile | null;
};

type RankedProduct = {
  product: MockProduct;
  ranking: number[];
};

type ShopSearchSignals = {
  expandedTerms: string[];
  interpretedTerms: string[];
  rawTerms: string[];
};

const sourcePriority = {
  curated: 3,
  chewy_feed: 2,
  ca_retailer_feed: 1,
} satisfies Record<(typeof PRODUCT_SOURCES)[number], number>;

const shopSearchSynonymTermsByToken: Record<string, string[]> = {
  breath: ["dental", "oral", "teeth", "tooth"],
  dental: ["dental", "oral", "teeth", "tooth", "treat", "chew"],
  flea: ["flea", "comb", "grooming"],
  itch: ["itchy", "skin", "sensitive", "grooming", "shampoo"],
  itche: ["itchy", "skin", "sensitive", "grooming", "shampoo"],
  itching: ["itchy", "skin", "sensitive", "grooming", "shampoo"],
  itchy: ["itch", "skin", "sensitive", "grooming", "shampoo"],
  oral: ["dental", "teeth", "tooth", "breath"],
  paw: ["skin", "sensitive", "grooming", "shampoo", "wipes", "balm"],
  smell: ["shampoo", "wipes"],
  teeth: ["dental", "oral", "tooth", "breath"],
  tooth: ["dental", "oral", "teeth", "breath"],
};

export function filterAndRankShopProducts({
  accountCountry,
  interpretation = null,
  includeDiagnostics = false,
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
  const productMatchText = hasShopGroomingSynonymIntent(normalizedQuery)
    ? normalizedQuery
    : interpretedSearchText || normalizedQuery;
  const country = normalizeProductCountry(accountCountry);
  const searchSignals = buildShopSearchSignals({
    interpretation,
    interpretedSearchText,
    query: normalizedQuery,
  });
  const baseDiagnostics = {
    avoidIngredientCount: 0,
    expandedSearchTerms: searchSignals.expandedTerms,
    ingredientSensitiveQuery: isIngredientSensitiveShopQuery(normalizedQuery),
    interpretationCategory: interpretation?.category || null,
    interpretedSearchTerms: interpretation ? tokenizeForSearch(interpretedSearchText) : [],
    rawQueryTerms: searchSignals.rawTerms,
    selectedCountry: country,
    selectedSpecies: selectedPet?.species || null,
    totalProductsLoaded: products.length,
  };

  if (!selectedPet) {
    return finalizeShopSearchResult(
      emptyResult("missing_pet"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "missing_pet",
      }),
      includeDiagnostics,
    );
  }

  if (!normalizedQuery) {
    return finalizeShopSearchResult(
      emptyResult("no_query"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "no_query",
      }),
      includeDiagnostics,
    );
  }

  if (normalizedQuery.length < MIN_SHOP_QUERY_LENGTH) {
    return finalizeShopSearchResult(
      emptyResult("query_too_short"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "query_too_short",
      }),
      includeDiagnostics,
    );
  }

  if (isVagueShopQueryWithoutSignal(normalizedQuery)) {
    return finalizeShopSearchResult(
      emptyResult("vague_query"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "vague_query_without_signal",
      }),
      includeDiagnostics,
    );
  }

  if (interpretation?.safetyFlags.urgentCare) {
    return finalizeShopSearchResult(
      emptyResult("urgent"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "urgent",
      }),
      includeDiagnostics,
    );
  }

  if (interpretation?.safetyFlags.medicalTreatmentIntent) {
    return finalizeShopSearchResult(
      emptyResult("medical_intent"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "medical_intent",
      }),
      includeDiagnostics,
    );
  }

  if (hasQuerySpeciesConflict(selectedPet.species, query, interpretation)) {
    return finalizeShopSearchResult(
      emptyResult("species_conflict"),
      emptyDiagnostics({
        ...baseDiagnostics,
        emptyStateReason: "species_conflict",
      }),
      includeDiagnostics,
    );
  }

  const runtimeSafeProducts = products.filter((product) =>
    isShopRuntimeSafeProduct(product, providerMode, nodeEnv),
  );
  const countryFiltered = country
    ? runtimeSafeProducts.filter((product) => isProductEligibleForCountry(product, country))
    : [];
  const speciesCompatibleProducts = countryFiltered.filter((product) =>
    isShopSpeciesCompatibleProduct(product, selectedPet.species),
  );
  const queryMatches = speciesCompatibleProducts.filter((product) =>
    productMatchesShopSignals(product, searchSignals) || productMatchesShopQuery(product, productMatchText),
  );
  const avoidIngredients = getNormalizedShopAvoidIngredients(selectedPet, normalizedQuery, interpretation);
  const avoidFiltered = queryMatches.filter((product) =>
    productPassesAvoidIngredientFilter(product, avoidIngredients),
  );
  const ingredientVerified = avoidFiltered.filter((product) =>
    passesShopIngredientVerification(product, avoidIngredients, productMatchText),
  );
  const diagnosticsBase = {
    ...baseDiagnostics,
    avoidIngredientCount: avoidIngredients.length,
    productsAfterAvoidIngredientFilter: avoidFiltered.length,
    productsAfterCountryFilter: countryFiltered.length,
    productsAfterIngredientsVerifiedFilter: ingredientVerified.length,
    productsAfterQueryMatch: queryMatches.length,
    productsAfterSpeciesFilter: speciesCompatibleProducts.length,
    runtimeSafeProductsCount: runtimeSafeProducts.length,
  };

  if (ingredientVerified.length > 0) {
    const rankedProducts = rankShopProducts({
      interpretation,
      products: ingredientVerified,
      query: productMatchText,
      selectedPet,
    });
    return finalizeShopSearchResult({
      avoidIngredientsRemovedMatches: queryMatches.length > avoidFiltered.length,
      emptyState: null,
      ingredientVerificationRemovedMatches: avoidFiltered.length > ingredientVerified.length,
      products: rankedProducts,
    }, {
      ...diagnosticsBase,
      emptyStateReason: "matched",
      finalResultCount: rankedProducts.length,
    }, includeDiagnostics);
  }

  const emptyState =
    products.length > 0 && runtimeSafeProducts.length > 0 && countryFiltered.length === 0
      ? "region_empty"
      : "no_match";
  const effectiveEmptyState =
    products.length > 0 &&
    runtimeSafeProducts.length > 0 &&
    countryFiltered.length > 0 &&
    speciesCompatibleProducts.length > 0 &&
    queryMatches.length > 0 &&
    avoidFiltered.length > 0
      ? "ingredient_verification_empty"
      : emptyState;
  const emptyStateReason = getShopEmptyStateReason({
    avoidFilteredCount: avoidFiltered.length,
    countryFilteredCount: countryFiltered.length,
    ingredientVerifiedCount: ingredientVerified.length,
    productsCount: products.length,
    queryMatchesCount: queryMatches.length,
    runtimeSafeProductsCount: runtimeSafeProducts.length,
    speciesCompatibleProductsCount: speciesCompatibleProducts.length,
  });

  return finalizeShopSearchResult({
    avoidIngredientsRemovedMatches: queryMatches.length > avoidFiltered.length,
    emptyState: effectiveEmptyState,
    ingredientVerificationRemovedMatches: avoidFiltered.length > ingredientVerified.length,
    products: [],
  }, {
    ...diagnosticsBase,
    emptyStateReason,
    finalResultCount: 0,
  }, includeDiagnostics);
}

export function productMatchesShopQuery(product: MockProduct, query: string) {
  const queryTerms = tokenizeForSearch(query);
  if (queryTerms.length === 0) return false;

  const haystack = tokenizeForSearch(getProductSearchText(product));
  const haystackSet = new Set(haystack);

  return queryTerms.every((term) => {
    if (matchesSpeciesSearchTerm(product, term)) return true;
    return getShopSearchTokenAlternatives(term).some((alternative) => haystackSet.has(alternative));
  });
}

export function getNormalizedShopAvoidIngredients(
  selectedPet: Pick<PetProfile, "avoidIngredients">,
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
  species: PetProfile["species"] | null | undefined,
) {
  if (!species) return false;
  return product.species.includes(species);
}

function buildShopSearchSignals({
  interpretation,
  interpretedSearchText,
  query,
}: {
  interpretation: ShopQueryInterpretation | null;
  interpretedSearchText: string;
  query: string;
}): ShopSearchSignals {
  const avoidSearchTerms = new Set(getQueryAvoidIngredients(query).flatMap(tokenizeForSearch));
  const rawTerms = tokenizeForSearch(query).filter((term) => !avoidSearchTerms.has(term));
  const interpretedTerms = tokenizeForSearch(interpretedSearchText);
  const categoryTerms = interpretation ? searchTermsForCategory(interpretation.category) : inferSearchTermsForQuery(query);
  const expandedTerms = uniqueSearchTokens([
    ...rawTerms,
    ...interpretedTerms,
    ...categoryTerms,
    ...rawTerms.flatMap(getShopSearchTokenAlternatives),
    ...interpretedTerms.flatMap(getShopSearchTokenAlternatives),
  ]);

  return {
    expandedTerms,
    interpretedTerms,
    rawTerms,
  };
}

function productMatchesShopSignals(product: MockProduct, signals: ShopSearchSignals) {
  const queryTerms = signals.rawTerms.length > 0 ? signals.rawTerms : signals.interpretedTerms;
  if (queryTerms.length === 0) return false;

  const haystack = tokenizeForSearch(getProductSearchText(product));
  const haystackSet = new Set(haystack);

  return queryTerms.every((term) => {
    if (matchesSpeciesSearchTerm(product, term)) return true;
    return getShopSearchTokenAlternatives(term).some((alternative) => haystackSet.has(alternative));
  });
}

function getShopSearchTokenAlternatives(term: string) {
  const normalized = stemSearchToken(term.toLowerCase());
  const alternatives = [
    term,
    ...getShopGroomingSynonymSearchTerms(term),
    ...(shopSearchSynonymTermsByToken[normalized] || []),
  ];
  return uniqueSearchTokens(alternatives);
}

function matchesSpeciesSearchTerm(product: Pick<MockProduct, "species">, term: string) {
  if (term === "dog" || term === "canine") return product.species.includes("dog");
  if (term === "cat" || term === "feline") return product.species.includes("cat");
  return false;
}

function uniqueSearchTokens(values: string[]) {
  return [...new Set(values.map(stemSearchToken).filter(Boolean))];
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
  selectedSpecies: PetProfile["species"] | null | undefined,
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
  selectedPet: PetProfile;
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
  selectedPet: PetProfile,
  interpretation: ShopQueryInterpretation | null,
) {
  return [
    scoreCategoryMatch(product, query, interpretation),
    scoreQueryMatch(product, query),
    selectedPet.species && product.species.length === 1 && product.species.includes(selectedPet.species)
      ? 2
      : isSharedSpeciesProduct(product)
        ? 1
        : 0,
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
    ...product.species,
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

function searchTermsForCategory(category: ShopQueryCategory) {
  if (category === "Itchy skin") return ["itchy", "skin", "sensitive", "paw", "grooming", "shampoo"];
  if (category === "Grooming") return ["grooming", "shampoo", "wipes", "brush", "comb", "coat"];
  if (category === "General wellness") return ["dental", "teeth", "breath", "oral"];
  if (category === "Sensitive stomach") return ["sensitive", "stomach", "food", "digest"];
  if (category === "Picky eating") return ["picky", "eating", "food"];
  if (category === "Weight management") return ["weight", "management", "food"];
  return [];
}

function inferSearchTermsForQuery(query: string) {
  const normalized = normalizeShopQuery(query);
  const terms: string[] = [];
  if (/\b(itch|itchy|itches|itching|skin|paw|paws|licking|rash|redness)\b/.test(normalized)) {
    terms.push(...searchTermsForCategory("Itchy skin"));
  }
  if (/\b(groom|grooming|shampoo|wipe|wipes|brush|comb|coat|fur|hair|bath|wash|smell|smells)\b/.test(normalized)) {
    terms.push(...searchTermsForCategory("Grooming"));
  }
  if (/\b(dental|teeth|tooth|breath|oral)\b/.test(normalized)) {
    terms.push(...searchTermsForCategory("General wellness"));
  }
  if (/\b(sensitive stomach|stomach|digest|digestion|food)\b/.test(normalized)) {
    terms.push("food");
  }
  return terms;
}

function getShopEmptyStateReason({
  avoidFilteredCount,
  countryFilteredCount,
  ingredientVerifiedCount,
  productsCount,
  queryMatchesCount,
  runtimeSafeProductsCount,
  speciesCompatibleProductsCount,
}: {
  avoidFilteredCount: number;
  countryFilteredCount: number;
  ingredientVerifiedCount: number;
  productsCount: number;
  queryMatchesCount: number;
  runtimeSafeProductsCount: number;
  speciesCompatibleProductsCount: number;
}): ShopSearchEmptyStateReason {
  if (productsCount === 0) return "no_products_in_catalog";
  if (runtimeSafeProductsCount === 0) return "no_runtime_safe_products";
  if (countryFilteredCount === 0) return "no_product_for_selected_country";
  if (speciesCompatibleProductsCount === 0) return "no_species_match";
  if (queryMatchesCount === 0) return "no_query_match";
  if (avoidFilteredCount === 0) return "avoid_ingredient_filter_removed_all";
  if (ingredientVerifiedCount === 0) return "no_ingredient_verified_match";
  return "matched";
}

function finalizeShopSearchResult(
  result: ShopSearchResult,
  diagnostics: ShopSearchDiagnostics,
  includeDiagnostics: boolean,
): ShopSearchResult {
  logShopProductSearchDiagnostics(diagnostics);
  return includeDiagnostics ? { ...result, diagnostics } : result;
}

function emptyDiagnostics(
  diagnostics: Pick<
    ShopSearchDiagnostics,
    | "avoidIngredientCount"
    | "emptyStateReason"
    | "expandedSearchTerms"
    | "ingredientSensitiveQuery"
    | "interpretationCategory"
    | "interpretedSearchTerms"
    | "rawQueryTerms"
    | "selectedCountry"
    | "selectedSpecies"
    | "totalProductsLoaded"
  >,
): ShopSearchDiagnostics {
  return {
    ...diagnostics,
    finalResultCount: 0,
    productsAfterAvoidIngredientFilter: 0,
    productsAfterCountryFilter: 0,
    productsAfterIngredientsVerifiedFilter: 0,
    productsAfterQueryMatch: 0,
    productsAfterSpeciesFilter: 0,
    runtimeSafeProductsCount: 0,
  };
}

function logShopProductSearchDiagnostics(diagnostics: ShopSearchDiagnostics) {
  if (process.env.SHOP_SEARCH_DIAGNOSTICS !== "true" && process.env.NODE_ENV !== "development") return;
  console.info("[Furvise shop search]", diagnostics);
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
  return isIngredientSensitiveShopQuery(query);
}

function isIngredientSensitiveShopQuery(query: string) {
  return /\b(allerg\w*|ingredient|ingredients|fragrance|oatmeal|aloe|chicken free|free|without|avoid)\b/.test(
    normalizeShopQuery(query),
  );
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
    ...(product.ingredientHighlights || []),
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
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "anything",
    "bit",
    "but",
    "for",
    "free",
    "get",
    "is",
    "item",
    "items",
    "my",
    "need",
    "needs",
    "nothing",
    "on",
    "product",
    "products",
    "seriou",
    "serious",
    "so",
    "something",
    "stuff",
    "that",
    "the",
    "thing",
    "things",
    "to",
    "want",
    "wants",
    "with",
  ]);
  return normalizeShopQuery(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stemSearchToken)
    .filter((term) => term.length > 1 && !stopWords.has(term));
}

function stemSearchToken(value: string) {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && value.length > 3) return value.slice(0, -1);
  return value;
}
