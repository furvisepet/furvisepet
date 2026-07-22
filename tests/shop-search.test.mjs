import assert from "node:assert/strict";
import test from "node:test";
import {
  initialProfile,
} from "../app/lib/petwise.ts";
import {
  MIN_SHOP_QUERY_LENGTH,
  productMatchesShopQuery,
  searchStaticRealShopProducts,
  shouldHideShopProductsForUrgentCare,
} from "../app/lib/shop.ts";
import { buildFallbackShopQueryInterpretation } from "../app/lib/shop-query.ts";
import {
  filterAndRankShopProducts,
  getNormalizedShopAvoidIngredients,
  passesShopIngredientVerification,
} from "../app/lib/shop/product-search.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

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

test("shop search requires a pet and a specific query before returning products", () => {
  assert.equal(MIN_SHOP_QUERY_LENGTH, 3);
  assert.deepEqual(
    searchStaticRealShopProducts({ productCountry: "US", profile: null, query: "shampoo" }),
    {
      avoidIngredientsRemovedMatches: false,
      emptyState: "missing_pet",
      ingredientVerificationRemovedMatches: false,
      products: [],
    },
  );
  assert.deepEqual(
    searchStaticRealShopProducts({ productCountry: "US", profile: profile(), query: "" }),
    {
      avoidIngredientsRemovedMatches: false,
      emptyState: "no_query",
      ingredientVerificationRemovedMatches: false,
      products: [],
    },
  );
  assert.deepEqual(
    searchStaticRealShopProducts({ productCountry: "US", profile: profile(), query: "ab" }),
    {
      avoidIngredientsRemovedMatches: false,
      emptyState: "query_too_short",
      ingredientVerificationRemovedMatches: false,
      products: [],
    },
  );
});

test("shop query matching covers product names, categories, tags, concerns, brand, retailer, and source notes", () => {
  const shampoo = staticRealProducts.find((product) => product.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(shampoo);
  assert.equal(productMatchesShopQuery(shampoo, "sensitive skin shampoo"), true);
  assert.equal(productMatchesShopQuery(shampoo, "Earthbath shampoo"), true);
  assert.equal(productMatchesShopQuery(shampoo, "official shampoo"), true);
});

test("shop search returns dog grooming products for shampoo queries", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "shampoo",
  });

  assert.equal(result.emptyState, "ingredient_verification_empty");
  assert.equal(result.products.length, 0);
  assert.equal(result.ingredientVerificationRemovedMatches, true);
});

test("shop search returns dental products for dental treats and keeps species filtering", () => {
  const dogResult = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "dental treats",
  });
  const catResult = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "cat" }),
    query: "dental treats",
  });

  assert.equal(dogResult.emptyState, null);
  assert.ok(dogResult.products.some((product) => /dental/i.test(product.name)));
  assert.ok(dogResult.products.every((product) => product.species === "dog"));
  assert.equal(catResult.products.length, 0);
  assert.equal(catResult.emptyState, "no_match");
});

test("shop search applies account country filtering and reports region-empty matches", () => {
  const usResult = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "dental treats",
  });
  const caResult = searchStaticRealShopProducts({
    productCountry: "CA",
    profile: profile({ species: "dog" }),
    query: "dental treats",
  });

  assert.equal(usResult.emptyState, null);
  assert.ok(usResult.products.length > 0);
  assert.ok(usResult.products.every((product) => product.availableCountries.includes("US")));
  assert.equal(caResult.products.length, 0);
  assert.equal(caResult.emptyState, "region_empty");
});

test("shop search applies saved avoid ingredients before showing product matches", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ avoidIngredients: ["chicken"], species: "dog" }),
    query: "dental treats",
  });

  assert.equal(result.products.length, 0);
  assert.equal(result.emptyState, "no_match");
  assert.equal(result.avoidIngredientsRemovedMatches, true);
});

test("shop search treats chicken-free food as a careful ingredient intent", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "chicken-free food",
  });

  assert.equal(result.products.length, 0);
  assert.equal(result.avoidIngredientsRemovedMatches, true);
});

test("shop interpretation cannot bypass deterministic species, region, or avoid filters", () => {
  const catInterpretation = buildFallbackShopQueryInterpretation({
    memory: memory({ pet: { species: "dog" } }),
    productCountry: "US",
    query: "cat shampoo",
  });
  const speciesResult = searchStaticRealShopProducts({
    interpretation: catInterpretation,
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "cat shampoo",
  });
  assert.equal(speciesResult.products.length, 0);
  assert.equal(speciesResult.emptyState, "species_conflict");

  const regionResult = searchStaticRealShopProducts({
    interpretation: buildFallbackShopQueryInterpretation({
      memory: memory(),
      productCountry: "US",
      query: "shampoo",
    }),
    productCountry: "CA",
    profile: profile({ species: "dog" }),
    query: "shampoo",
  });
  assert.equal(regionResult.products.length, 0);
  assert.equal(regionResult.emptyState, "region_empty");

  const avoidResult = searchStaticRealShopProducts({
    interpretation: buildFallbackShopQueryInterpretation({
      memory: memory(),
      productCountry: "US",
      query: "chicken-free food",
    }),
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "chicken-free food",
  });
  assert.equal(avoidResult.products.length, 0);
  assert.equal(avoidResult.avoidIngredientsRemovedMatches, true);
});

test("shop filtering fails closed for invalid country and never falls back across countries", () => {
  const result = filterAndRankShopProducts({
    accountCountry: "GB",
    products: staticRealProducts,
    query: "dental treats",
    selectedPet: profile({ species: "dog" }),
  });

  assert.equal(result.products.length, 0);
  assert.equal(result.emptyState, "region_empty");
});

test("shop ingredient verification excludes sensitive unverified products but allows non-ingestible tools", () => {
  const verifiedFood = {
    ...staticRealProducts[0],
    id: "verified-sensitive-food",
    name: "Verified Sensitive Stomach Food",
    tags: ["food", "sensitive stomach"],
    concernTags: ["sensitive_stomach"],
    ingredientsVerified: true,
  };
  const unverifiedFood = {
    ...verifiedFood,
    id: "unverified-sensitive-food",
    name: "Unverified Sensitive Stomach Food",
    ingredientsVerified: false,
  };
  const unverifiedBrush = {
    ...staticRealProducts.find((product) => product.id === "furminator-cat-deshedding-tool"),
    id: "unverified-dog-brush",
    name: "Unverified Dog Brush",
    species: "dog",
    tags: ["grooming", "brush", "dog"],
    ingredientsVerified: false,
  };

  assert.equal(passesShopIngredientVerification(unverifiedFood, [], "sensitive stomach food"), false);
  assert.equal(passesShopIngredientVerification(unverifiedBrush, [], "brush"), true);

  const result = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: buildFallbackShopQueryInterpretation({
      memory: memory({ pet: { mainConcern: "Sensitive stomach" } }),
      productCountry: "US",
      query: "sensitive stomach food",
    }),
    products: [unverifiedFood, verifiedFood],
    query: "sensitive stomach food",
    selectedPet: profile({ species: "dog" }),
  });

  assert.deepEqual(result.products.map((product) => product.id), ["verified-sensitive-food"]);
});

test("shop ranking is deterministic by category, species specificity, ingredient verification, source, secondary signal, and name", () => {
  const base = {
    ...staticRealProducts[0],
    active: true,
    availableCountries: ["US"],
    category: "grooming",
    concernTags: ["grooming"],
    evidenceType: "curated_static",
    ingredientsVerified: true,
    productUrl: "https://example.com/product",
    subcategory: "brush",
    tags: ["grooming", "brush"],
  };
  const products = [
    { ...base, id: "z-feed", name: "Z Feed Brush", source: "chewy_feed", curatedScore: 9 },
    { ...base, id: "a-curated", name: "A Curated Brush", source: "curated" },
    { ...base, id: "b-all", name: "B Broad Brush", source: "curated", species: "all" },
    { ...base, id: "c-unverified", name: "C Unverified Brush", ingredientsVerified: false, source: "curated" },
    { ...base, id: "d-loose", name: "D Loose Brush", concernTags: ["general_wellness"], category: "health_essentials", source: "curated" },
    { ...base, id: "e-ca-feed", name: "E CA Feed Brush", source: "ca_retailer_feed" },
  ];

  const result = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: buildFallbackShopQueryInterpretation({
      memory: memory({ pet: { mainConcern: "Grooming" } }),
      productCountry: "US",
      query: "grooming brush",
    }),
    products,
    query: "grooming brush",
    selectedPet: profile({ species: "dog" }),
  });

  assert.deepEqual(result.products.map((product) => product.id), [
    "a-curated",
    "z-feed",
    "e-ca-feed",
    "c-unverified",
    "b-all",
    "d-loose",
  ]);

  const stable = filterAndRankShopProducts({
    accountCountry: "US",
    products: [
      { ...base, id: "b", name: "Same Brush", source: "curated" },
      { ...base, id: "a", name: "Same Brush", source: "curated" },
    ],
    query: "brush",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(stable.products.map((product) => product.id), ["a", "b"]);
});

test("shop avoid ingredient normalization treats typed none like the None known chip", () => {
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: ["none"] }), "food", null), []);
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: ["None"] }), "food", null), []);
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: ["none known"] }), "food", null), []);
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: [] }), "food", null), []);
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: ["chicken", "none"] }), "food", null), ["chicken"]);
  assert.deepEqual(getNormalizedShopAvoidIngredients(profile({ avoidIngredients: ["no chicken"] }), "food", null), ["chicken"]);
});

test("shop safety and medical intent empty states suppress products deterministically", () => {
  const urgent = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: {
      ...buildFallbackShopQueryInterpretation({
        memory: memory(),
        productCountry: "US",
        query: "my dog is struggling to breathe what should I buy",
      }),
      safetyFlags: { medicalTreatmentIntent: false, urgentCare: true },
    },
    products: staticRealProducts,
    query: "dental treats",
    selectedPet: profile({ species: "dog" }),
  });
  const medical = filterAndRankShopProducts({
    accountCountry: "US",
    interpretation: {
      ...buildFallbackShopQueryInterpretation({
        memory: memory(),
        productCountry: "US",
        query: "product to cure diarrhea",
      }),
      safetyFlags: { medicalTreatmentIntent: true, urgentCare: false },
    },
    products: staticRealProducts,
    query: "dental treats",
    selectedPet: profile({ species: "dog" }),
  });

  assert.equal(urgent.emptyState, "urgent");
  assert.equal(urgent.products.length, 0);
  assert.equal(medical.emptyState, "medical_intent");
  assert.equal(medical.products.length, 0);
});

test("urgent care signs suppress normal shop product results", () => {
  assert.equal(
    shouldHideShopProductsForUrgentCare({
      entries: [],
      guidance: {
        vetAttention: {
          needed: true,
          reason: "Emergency signs were reported.",
          urgency: "urgent",
        },
      },
    }),
    true,
  );
  assert.equal(
    shouldHideShopProductsForUrgentCare({
      entries: [
        {
          category: "symptom",
          occurred_at: "2026-07-20T12:00:00Z",
          severity: "severe",
        },
      ],
      now: new Date("2026-07-21T12:00:00Z"),
    }),
    true,
  );
});
