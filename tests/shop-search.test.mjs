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

test("shop search returns multiple dog grooming products for shampoo queries", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "shampoo",
  });

  assert.equal(result.emptyState, null);
  assert.ok(result.products.some((product) => product.id === "earthbath-oatmeal-aloe-shampoo"));
  assert.ok(result.products.some((product) => product.id === "earthbath-hypoallergenic-shampoo"));
  assert.ok(result.products.length >= 2);
  assert.ok(result.products.every((product) => product.species === "dog"));
  assert.ok(result.products.every((product) => product.availableCountries.includes("US")));
  assert.equal(result.ingredientVerificationRemovedMatches, false);
});

test("Shop static curated catalog is loaded and reports careful shampoo diagnostics", () => {
  const result = searchStaticRealShopProducts({
    includeDiagnostics: true,
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "shampoo",
  });

  assert.ok(staticRealProducts.length > 0);
  assert.equal(result.emptyState, null);
  assert.ok(result.diagnostics);
  assert.equal(result.diagnostics.totalProductsLoaded, staticRealProducts.length);
  assert.equal(result.diagnostics.runtimeSafeProductsCount, staticRealProducts.length);
  assert.equal(result.diagnostics.selectedCountry, "US");
  assert.equal(result.diagnostics.productsAfterCountryFilter, staticRealProducts.length);
  assert.equal(result.diagnostics.selectedSpecies, "dog");
  assert.equal(result.diagnostics.productsAfterSpeciesFilter, 17);
  assert.equal(result.diagnostics.productsAfterQueryMatch, 2);
  assert.equal(result.diagnostics.productsAfterAvoidIngredientFilter, 2);
  assert.equal(result.diagnostics.productsAfterIngredientsVerifiedFilter, 2);
  assert.equal(result.diagnostics.finalResultCount, 2);
  assert.equal(result.diagnostics.emptyStateReason, "matched");
});

test("Shop obvious US curated searches match existing catalog products when present", () => {
  for (const query of ["shampoo", "sensitive skin shampoo", "itchy paws shampoo"]) {
    const result = searchStaticRealShopProducts({
      productCountry: "US",
      profile: profile({ species: "dog" }),
      query,
    });
    assert.equal(result.emptyState, null, query);
    assert.ok(result.products.some((product) => product.id === "earthbath-oatmeal-aloe-shampoo"), query);
  }

  for (const query of ["dental treats", "teeth", "breath", "dental", "oral"]) {
    const result = searchStaticRealShopProducts({
      productCountry: "US",
      profile: profile({ species: "dog" }),
      query,
    });
    assert.equal(result.emptyState, null, query);
    assert.ok(result.products.some((product) => product.id === "greenies-original-regular-dog-dental-treats"), query);
  }

  const conversationalItch = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "so my dog is itching a bit on paws nothing serious but need something for that",
  });
  assert.equal(conversationalItch.emptyState, null);
  assert.ok(conversationalItch.products.some((product) => product.id === "earthbath-oatmeal-aloe-shampoo"));
});

test("Shop search returns grooming wipes and reports no match for a missing flea comb", () => {
  const wipes = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "grooming wipes",
  });
  assert.equal(wipes.emptyState, null);
  assert.ok(wipes.products.length >= 3);
  assert.ok(wipes.products.every((product) => product.subcategory === "wipes"));

  for (const query of ["flea comb"]) {
    const result = searchStaticRealShopProducts({
      includeDiagnostics: true,
      productCountry: "US",
      profile: profile({ species: "dog" }),
      query,
    });
    assert.equal(result.emptyState, "no_match", query);
    assert.equal(result.diagnostics?.emptyStateReason, "no_query_match", query);
    assert.deepEqual(result.products, [], query);
  }
});

test("Shop matching keeps raw query terms when AI interpretation terms are too broad", () => {
  const interpretation = {
    ...buildFallbackShopQueryInterpretation({
      memory: memory(),
      productCountry: "US",
      query: "dental treats",
    }),
    normalizedSearchTerms: ["oral hygiene"],
  };
  const result = searchStaticRealShopProducts({
    interpretation,
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "dental treats",
  });

  assert.equal(result.emptyState, null);
  assert.ok(result.products.some((product) => product.id === "greenies-original-regular-dog-dental-treats"));
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
  assert.ok(dogResult.products.length >= 3);
  assert.ok(dogResult.products.every((product) => product.species === "dog"));
  assert.equal(catResult.products.length, 0);
  assert.equal(catResult.emptyState, "no_match");
});

test("shop search never crosses selected species for obvious dog and cat queries", () => {
  const catForDogQuery = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "cat" }),
    query: "dog shampoo",
  });
  assert.equal(catForDogQuery.products.length, 0);
  assert.equal(catForDogQuery.emptyState, "species_conflict");

  const dogForCatOnlyProduct = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "cat brush",
  });
  assert.equal(dogForCatOnlyProduct.products.length, 0);
  assert.equal(dogForCatOnlyProduct.emptyState, "species_conflict");
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

  assert.deepEqual(result.products.map((product) => product.id), ["greenies-fresh-regular-dog-dental-treats"]);
  assert.equal(result.emptyState, null);
  assert.equal(result.avoidIngredientsRemovedMatches, true);
});

test("shop search treats chicken-free food as a careful ingredient intent", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "chicken-free food",
  });

  assert.deepEqual(result.products.map((product) => product.id), [
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-wet",
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
  ]);
  assert.equal(result.avoidIngredientsRemovedMatches, true);
});

test("shop food search returns verified food products including sensitive stomach options", () => {
  const result = searchStaticRealShopProducts({
    productCountry: "US",
    profile: profile({ species: "dog" }),
    query: "food",
  });

  assert.equal(result.emptyState, null);
  assert.ok(result.products.length >= 3);
  assert.ok(result.products.every((product) => product.category === "food"));
  assert.ok(result.products.some((product) => product.concernTags.includes("sensitive_stomach")));
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
  assert.equal(avoidResult.products.length, 2);
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

function groomingFixture(overrides = {}) {
  return {
    ...staticRealProducts[0],
    id: "verified-dog-grooming-fixture",
    name: "Verified Dog Grooming Fixture",
    brand: "Care Brand",
    retailer: "Care Retailer",
    productUrl: "https://example.com/grooming",
    species: "dog",
    category: "grooming",
    subcategory: "brush",
    recommendationKind: "product",
    protein: "Not applicable",
    concernTags: ["grooming"],
    excludedIngredients: [],
    avoidIngredientKeywords: [],
    ingredientHighlights: [],
    lifeStage: "all",
    tags: ["grooming", "brush", "dog"],
    currency: "USD",
    active: true,
    source: "curated",
    ingredientsVerified: true,
    availableCountries: ["US"],
    evidenceType: "curated_static",
    sourceNote: "Curated grooming fixture.",
    whyItFits: "Routine grooming fixture.",
    whyCategoryFits: "Grooming fixture.",
    cautions: "Use gently.",
    ...overrides,
  };
}

test("shop search maps vague hair, fur, bath, smell, and shedding queries to grooming signals", () => {
  const brush = groomingFixture({
    id: "verified-dog-coat-brush",
    name: "Verified Dog Coat Brush",
    tags: ["grooming", "brush", "comb", "dog", "coat"],
  });
  const shampoo = groomingFixture({
    id: "verified-dog-shampoo",
    name: "Verified Dog Shampoo",
    subcategory: "shampoo",
    tags: ["grooming", "shampoo", "wash", "dog"],
  });
  const wipes = groomingFixture({
    id: "verified-dog-wipes",
    name: "Verified Dog Wipes",
    subcategory: "wipes",
    tags: ["grooming", "wipes", "dog"],
  });

  const hairs = filterAndRankShopProducts({
    accountCountry: "US",
    products: [brush],
    query: "something for hairs",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(hairs.products.map((product) => product.id), ["verified-dog-coat-brush"]);

  const fur = filterAndRankShopProducts({
    accountCountry: "US",
    products: [brush],
    query: "for fur",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(fur.products.map((product) => product.id), ["verified-dog-coat-brush"]);

  const bath = filterAndRankShopProducts({
    accountCountry: "US",
    products: [shampoo],
    query: "bath",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(bath.products.map((product) => product.id), ["verified-dog-shampoo"]);

  const smells = filterAndRankShopProducts({
    accountCountry: "US",
    products: [brush, wipes],
    query: "dog smells",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(smells.products.map((product) => product.id), ["verified-dog-wipes"]);

  const shedding = filterAndRankShopProducts({
    accountCountry: "US",
    products: [brush, shampoo],
    query: "shedding",
    selectedPet: profile({ species: "dog" }),
  });
  assert.deepEqual(shedding.products.map((product) => product.id), ["verified-dog-coat-brush"]);
});

test("shop grooming synonyms keep country, species, and ingredient verification filters strict", () => {
  const usOnlyBrush = groomingFixture({ id: "us-only-dog-brush", availableCountries: ["US"] });
  const catBrush = groomingFixture({ id: "cat-brush", name: "Verified Cat Brush", species: "cat", tags: ["grooming", "brush", "cat"] });
  const unverifiedSensitiveShampoo = groomingFixture({
    id: "unverified-sensitive-shampoo",
    name: "Unverified Sensitive Shampoo",
    subcategory: "shampoo",
    tags: ["grooming", "shampoo", "dog", "sensitive"],
    ingredientsVerified: false,
    ingredientHighlights: ["Fragrance"],
  });

  const country = filterAndRankShopProducts({
    accountCountry: "CA",
    products: [usOnlyBrush],
    query: "fur",
    selectedPet: profile({ species: "dog" }),
  });
  assert.equal(country.emptyState, "region_empty");
  assert.equal(country.products.length, 0);

  const species = filterAndRankShopProducts({
    accountCountry: "US",
    products: [catBrush],
    query: "fur",
    selectedPet: profile({ species: "dog" }),
  });
  assert.equal(species.emptyState, "no_match");
  assert.equal(species.products.length, 0);

  const ingredientVerification = filterAndRankShopProducts({
    accountCountry: "US",
    products: [unverifiedSensitiveShampoo],
    query: "dirty fragrance",
    selectedPet: profile({ species: "dog" }),
  });
  assert.equal(ingredientVerification.emptyState, "ingredient_verification_empty");
  assert.equal(ingredientVerification.ingredientVerificationRemovedMatches, true);
  assert.equal(ingredientVerification.products.length, 0);
});

test("shop search returns specificity state for vague queries without showing products", () => {
  const result = filterAndRankShopProducts({
    accountCountry: "US",
    products: [groomingFixture()],
    query: "anything",
    selectedPet: profile({ species: "dog" }),
  });

  assert.equal(result.emptyState, "vague_query");
  assert.deepEqual(result.products, []);
});
