import assert from "node:assert/strict";
import test from "node:test";
import { initialProfile } from "../app/lib/petwise.ts";
import { buildFallbackShopQueryInterpretation } from "../app/lib/shop-query.ts";
import { shouldHideShopProductsForUrgentCare } from "../app/lib/shop.ts";
import { filterAndRankShopProducts } from "../app/lib/shop/product-search.ts";

function profile(overrides = {}) {
  return {
    ...initialProfile,
    name: "Rocky",
    species: "dog",
    breed: "Mixed",
    age: "4",
    weight: "42",
    currentFood: "Salmon kibble",
    mainConcern: "General wellness",
    avoidIngredients: [],
    monthlyBudget: "80",
    ...overrides,
  };
}

function memory() {
  return {
    pet: { id: "rocky-id", name: "Rocky", species: "dog", breed: "Mixed", ageLabel: "4 years", weightLabel: "42 lb", mainConcern: "General wellness", currentFood: "Salmon kibble", avoidIngredients: [], monthlyBudget: "$80/month", wellnessGoal: null, importantNotes: [] },
    timeline: { recentEntries: [], recallEntries: [], entriesLast7Days: [], entriesLast30Days: [] },
    savedDetails: [], productFeedback: [],
    derived: { recentChanges: [], recurringConcerns: [], knownAvoids: [], safetyFlags: [], missingContext: [], summaryBullets: [] },
  };
}

function product(overrides = {}) {
  return {
    id: "base-dental-treat",
    name: "Verified Dental Dog Treats",
    brand: "Care Brand",
    retailer: "Care Retailer",
    productUrl: "https://example.com/product",
    species: "dog",
    category: "health_essentials",
    subcategory: "dental_treat",
    recommendationKind: "product",
    protein: "Poultry",
    concernTags: ["dental_care", "general_wellness"],
    excludedIngredients: ["chicken", "poultry"],
    avoidIngredientKeywords: ["chicken", "poultry"],
    ingredientHighlights: ["Poultry"],
    lifeStage: "adult",
    tags: ["dental", "dog", "treat", "treats"],
    currency: "USD",
    active: true,
    source: "curated",
    ingredientsVerified: true,
    availableCountries: ["US"],
    evidenceType: "curated_static",
    sourceNote: "Curated test fixture.",
    whyItFits: "Routine dental care fixture.",
    whyCategoryFits: "Dental care fixture.",
    cautions: "Use carefully.",
    ...overrides,
  };
}

test("Shop empty state shows no careful match when no catalog item matches deterministically", () => {
  const result = filterAndRankShopProducts({
    accountCountry: "US",
    includeDiagnostics: true,
    products: [product()],
    query: "spacesuit",
    selectedPet: profile(),
  });

  assert.equal(result.emptyState, "no_match");
  assert.equal(result.diagnostics?.emptyStateReason, "no_query_match");
  assert.deepEqual(result.products, []);
});

test("Shop empty state shows region message when country filtering removes every match", () => {
  const result = filterAndRankShopProducts({
    accountCountry: "CA",
    includeDiagnostics: true,
    products: [product({ availableCountries: ["US"] })],
    query: "dental treats",
    selectedPet: profile(),
  });

  assert.equal(result.emptyState, "region_empty");
  assert.equal(result.diagnostics?.emptyStateReason, "no_product_for_selected_country");
  assert.deepEqual(result.products, []);
});

test("Shop empty state shows ingredient-verification message when every candidate is unverified", () => {
  const result = filterAndRankShopProducts({
    accountCountry: "US",
    includeDiagnostics: true,
    products: [
      product({
        id: "unverified-food",
        name: "Unverified Dog Food",
        category: "food",
        subcategory: "dry_food",
        tags: ["food", "dog"],
        ingredientsVerified: false,
      }),
    ],
    query: "food",
    selectedPet: profile(),
  });

  assert.equal(result.emptyState, "ingredient_verification_empty");
  assert.equal(result.diagnostics?.emptyStateReason, "no_ingredient_verified_match");
  assert.equal(result.ingredientVerificationRemovedMatches, true);
  assert.deepEqual(result.products, []);
});

test("deterministic Shop filtering still rejects avoided ingredients", () => {
  const result = filterAndRankShopProducts({ accountCountry: "US", products: [product()], query: "dental treats", selectedPet: profile({ avoidIngredients: ["chicken"] }) });
  assert.equal(result.emptyState, "no_match");
  assert.equal(result.avoidIngredientsRemovedMatches, true);
  assert.deepEqual(result.products, []);
});

test("deterministic Shop safety still suppresses urgent queries and saved context", () => {
  const urgentQuery = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: { ...buildFallbackShopQueryInterpretation({ memory: memory(), productCountry: "US", query: "dog cannot breathe what product should I buy" }), safetyFlags: { medicalTreatmentIntent: false, urgentCare: true } },
    products: [product()], query: "dental treats", selectedPet: profile(),
  });
  assert.equal(urgentQuery.emptyState, "urgent");
  assert.deepEqual(urgentQuery.products, []);
  assert.equal(shouldHideShopProductsForUrgentCare({ entries: [{ category: "symptom", occurred_at: "2026-07-20T12:00:00Z", severity: "severe" }], now: new Date("2026-07-21T12:00:00Z") }), true);
});

test("deterministic Shop filtering still rejects explicit species conflicts", () => {
  const result = filterAndRankShopProducts({ accountCountry: "US", products: [product({ id: "cat-shampoo", name: "Cat Shampoo", species: "cat", tags: ["cat", "shampoo"] })], query: "cat shampoo", selectedPet: profile({ species: "dog" }) });
  assert.equal(result.emptyState, "species_conflict");
  assert.deepEqual(result.products, []);
});
