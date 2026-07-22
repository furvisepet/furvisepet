import assert from "node:assert/strict";
import test from "node:test";
import {
  initialProfile,
  normalizeAvoidIngredientValues,
  productPassesAvoidIngredientFilter,
} from "../app/lib/petwise.ts";
import { buildDogProfilePayload } from "../app/lib/supabase.ts";
import { buildFallbackShopQueryInterpretation } from "../app/lib/shop-query.ts";
import {
  filterAndRankShopProducts,
  getNormalizedShopAvoidIngredients,
  passesShopIngredientVerification,
} from "../app/lib/shop/product-search.ts";

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

function memory(overrides = {}) {
  return {
    pet: {
      id: "rocky-id",
      name: "Rocky",
      species: "dog",
      breed: "Mixed",
      ageLabel: "4 years",
      weightLabel: "42 lb",
      mainConcern: "General wellness",
      currentFood: "Salmon kibble",
      avoidIngredients: [],
      monthlyBudget: "$80/month",
      wellnessGoal: null,
      importantNotes: [],
      ...(overrides.pet || {}),
    },
    timeline: {
      recentEntries: [],
      recallEntries: [],
      entriesLast7Days: [],
      entriesLast30Days: [],
    },
    savedDetails: [],
    productFeedback: [],
    derived: {
      recentChanges: [],
      recurringConcerns: [],
      knownAvoids: [],
      safetyFlags: [],
      missingContext: [],
      summaryBullets: [],
      ...(overrides.derived || {}),
    },
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
    tags: ["dental", "dog", "treat", "treats", "food", "chicken"],
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

function parseTypedAvoidInput(value) {
  return normalizeAvoidIngredientValues(value.split(","));
}

test("Shop avoid-ingredient normalization treats typed none values like the None known chip", () => {
  const cases = [
    { label: "chip selection", raw: "None known", selectedValues: [] },
    { label: "typed none", raw: "none" },
    { label: "typed None", raw: "None" },
    { label: "typed none known", raw: "none known" },
    { label: "typed no known allergies", raw: "no known allergies" },
    { label: "typed n/a", raw: "n/a" },
    { label: "typed na", raw: "na" },
    { label: "typed not sure", raw: "not sure" },
  ];

  for (const item of cases) {
    const selectedValues = item.selectedValues ?? [item.raw];
    const typedValues = item.selectedValues ?? parseTypedAvoidInput(item.raw);

    assert.deepEqual(normalizeAvoidIngredientValues(selectedValues), [], item.label);
    assert.deepEqual(typedValues, [], item.label);
    assert.equal(typedValues.includes("none"), false, item.label);
    assert.deepEqual(
      getNormalizedShopAvoidIngredients(profile({ avoidIngredients: selectedValues }), "dental treats", null),
      [],
      item.label,
    );
    assert.deepEqual(
      buildDogProfilePayload(profile({ avoidIngredients: selectedValues }), "user-1").avoid_ingredients,
      [],
      item.label,
    );

    const result = filterAndRankShopProducts({
      accountCountry: "US",
      products: [product()],
      query: "dental treats",
      selectedPet: profile({ avoidIngredients: selectedValues }),
    });
    assert.equal(result.emptyState, null, item.label);
    assert.deepEqual(result.products.map((candidate) => candidate.id), ["base-dental-treat"], item.label);
  }
});

test("Shop avoid-ingredient normalization preserves real ingredients while ignoring none tokens", () => {
  const cases = [
    ["chicken", ["chicken"]],
    ["beef", ["beef"]],
    ["chicken, none", ["chicken"]],
    ["none, chicken", ["chicken"]],
  ];

  for (const [raw, expected] of cases) {
    assert.deepEqual(parseTypedAvoidInput(raw), expected, raw);
    assert.deepEqual(
      buildDogProfilePayload(profile({ avoidIngredients: parseTypedAvoidInput(raw) }), "user-1").avoid_ingredients,
      expected,
      raw,
    );
  }

  const chickenResult = filterAndRankShopProducts({
    accountCountry: "US",
    products: [product()],
    query: "dental treats",
    selectedPet: profile({ avoidIngredients: parseTypedAvoidInput("none, chicken") }),
  });
  assert.equal(chickenResult.products.length, 0);
  assert.equal(chickenResult.avoidIngredientsRemovedMatches, true);
});

test("Shop avoid normalization only applies to user avoid inputs, not arbitrary product text", () => {
  const nonePhraseProduct = product({
    id: "none-word-product",
    name: "NoneSuch Dental Dog Treats",
    avoidIngredientKeywords: ["nonesuch extract"],
    ingredientHighlights: ["Nonesuch extract"],
  });

  assert.deepEqual(normalizeAvoidIngredientValues(["none"]), []);
  assert.equal(productPassesAvoidIngredientFilter(nonePhraseProduct, ["none"]), true);
  assert.equal(productPassesAvoidIngredientFilter(nonePhraseProduct, []), true);

  const result = filterAndRankShopProducts({
    accountCountry: "US",
    products: [nonePhraseProduct],
    query: "dental treats",
    selectedPet: profile({ avoidIngredients: ["none"] }),
  });
  assert.equal(result.emptyState, null);
  assert.deepEqual(result.products.map((candidate) => candidate.id), ["none-word-product"]);
});

test("Shop country filtering never falls back across US, CA, or invalid account countries", () => {
  const usOnly = product({ id: "us-only-dental", availableCountries: ["US"] });
  const caOnly = product({ id: "ca-only-dental", availableCountries: ["CA"], currency: "CAD" });

  const caAccount = filterAndRankShopProducts({
    accountCountry: "CA",
    products: [usOnly],
    query: "dental treats",
    selectedPet: profile(),
  });
  assert.equal(caAccount.emptyState, "region_empty");
  assert.deepEqual(caAccount.products, []);

  const usAccount = filterAndRankShopProducts({
    accountCountry: "US",
    products: [caOnly],
    query: "dental treats",
    selectedPet: profile(),
  });
  assert.equal(usAccount.emptyState, "region_empty");
  assert.deepEqual(usAccount.products, []);

  for (const accountCountry of ["GB", "", null, undefined]) {
    const invalid = filterAndRankShopProducts({
      accountCountry,
      products: [usOnly, caOnly],
      query: "dental treats",
      selectedPet: profile(),
    });
    assert.equal(invalid.emptyState, "region_empty", String(accountCountry));
    assert.deepEqual(invalid.products, [], String(accountCountry));
  }
});

test("Shop ingredient verification excludes unverified ingestible and allergy-sensitive products without fill-in fallback", () => {
  const verifiedFood = product({
    id: "verified-food",
    name: "Verified Sensitive Stomach Dog Food",
    category: "food",
    subcategory: "dry_food",
    tags: ["food", "sensitive stomach", "dog"],
    concernTags: ["sensitive_stomach"],
    ingredientsVerified: true,
    avoidIngredientKeywords: ["salmon"],
    ingredientHighlights: ["Salmon"],
  });
  const unverifiedFood = {
    ...verifiedFood,
    id: "unverified-food",
    name: "Unverified Sensitive Stomach Dog Food",
    ingredientsVerified: false,
  };
  const unverifiedTreats = product({
    id: "unverified-treats",
    name: "Unverified Dental Dog Treats",
    ingredientsVerified: false,
  });
  const unverifiedSupplement = product({
    id: "unverified-supplement",
    name: "Unverified Joint Dog Supplement",
    category: "health_essentials",
    subcategory: "supplement",
    tags: ["supplement", "dog"],
    ingredientsVerified: false,
  });
  const unverifiedShampoo = product({
    id: "unverified-sensitive-shampoo",
    name: "Unverified Sensitive Skin Dog Shampoo",
    category: "grooming",
    subcategory: "shampoo",
    tags: ["shampoo", "sensitive", "allergy", "dog"],
    concernTags: ["grooming", "sensitive_skin"],
    ingredientsVerified: false,
    ingredientHighlights: ["Oatmeal"],
  });

  for (const [candidate, query] of [
    [unverifiedFood, "food"],
    [unverifiedFood, "sensitive stomach food"],
    [unverifiedTreats, "treats"],
    [unverifiedTreats, "dental treats"],
    [unverifiedSupplement, "supplement"],
    [unverifiedShampoo, "allergy shampoo"],
  ]) {
    assert.equal(passesShopIngredientVerification(candidate, [], query), false, query);
  }

  const mixed = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: buildFallbackShopQueryInterpretation({
      memory: memory({ pet: { mainConcern: "Sensitive stomach" } }),
      productCountry: "US",
      query: "sensitive stomach food",
    }),
    products: [unverifiedFood, verifiedFood],
    query: "sensitive stomach food",
    selectedPet: profile({ mainConcern: "Sensitive stomach" }),
  });
  assert.deepEqual(mixed.products.map((candidate) => candidate.id), ["verified-food"]);

  const onlyUnverified = filterAndRankShopProducts({
    accountCountry: "US",
    products: [unverifiedFood],
    query: "food",
    selectedPet: profile(),
  });
  assert.equal(onlyUnverified.emptyState, "ingredient_verification_empty");
  assert.deepEqual(onlyUnverified.products, []);

  const savedAvoid = filterAndRankShopProducts({
    accountCountry: "US",
    products: [unverifiedTreats],
    query: "dental treats",
    selectedPet: profile({ avoidIngredients: ["chicken"] }),
  });
  assert.equal(savedAvoid.products.length, 0);
  assert.notEqual(savedAvoid.emptyState, null);
});
