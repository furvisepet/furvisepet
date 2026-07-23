import test from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_CONCERN_OPTIONS,
  buildRecommendations,
  initialProfile,
  normalizeAvoidIngredientValues,
  normalizeOnboardingMode,
  hasSpeciesCompatibleFoodProducts,
  isSpeciesCompatibleProduct,
  mockProducts,
  selectedConcern,
} from "../app/lib/petwise.ts";
import { getFinishProfileItemsFromDraft } from "../app/lib/finish-profile.ts";
import {
  disabledLiveProvider,
  getConfiguredProductProvider,
  getProductLinkInfo,
  mockProvider,
  resolveProductProviderMode,
  staticRealProvider,
} from "../app/lib/product-providers.ts";
import { buildDogProfilePayload, dogProfileRowToDraft } from "../app/lib/supabase.ts";
import { parseAnalysis, validateDogProfileInput } from "../app/lib/ai-analysis.ts";
import { buildDraftProfileCompleteness } from "../app/lib/profile-completeness.ts";

test("normalizeOnboardingMode normalizes valid and invalid values", () => {
  assert.equal(normalizeOnboardingMode("new"), "new");
  assert.equal(normalizeOnboardingMode("edit"), "edit");
  assert.equal(normalizeOnboardingMode("recommend_existing"), "recommend_existing");
  assert.equal(normalizeOnboardingMode("stale"), "new");
  assert.equal(normalizeOnboardingMode(null), "new");
  assert.equal(normalizeOnboardingMode(undefined), "new");
});

test("main concern options are a non-empty runtime array", () => {
  assert.ok(Array.isArray(MAIN_CONCERN_OPTIONS));
  assert.ok(MAIN_CONCERN_OPTIONS.length > 0);
  assert.deepEqual(
    MAIN_CONCERN_OPTIONS,
    [
      "Itchy skin",
      "Sensitive stomach",
      "Picky eating",
      "Weight management",
      "General wellness",
      "Grooming",
      "Other",
    ],
  );
});

test("custom main concerns remain supported", () => {
  const profile = {
    ...initialProfile,
    mainConcern: "Other",
    otherConcern: "vomiting",
  };

  assert.equal(selectedConcern(profile), "vomiting");
});

test("avoid ingredient normalization treats typed none values like None known", () => {
  assert.deepEqual(normalizeAvoidIngredientValues(["none"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["None"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["none known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["None known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no known"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no known allergies"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["no allergies"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["n/a"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["na"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["not sure"]), []);
  assert.deepEqual(normalizeAvoidIngredientValues(["chicken", "none"]), ["chicken"]);
  assert.deepEqual(normalizeAvoidIngredientValues(["no chicken"]), ["chicken"]);
});

function filledProfile(overrides = {}) {
  return {
    ...initialProfile,
    name: "Mani",
    species: "dog",
    breed: "Mixed / unknown",
    age: "4",
    weight: "42",
    currentFood: "Known kibble",
    mainConcern: "Grooming",
    monthlyBudget: "80",
    ...overrides,
  };
}

test("recommendations are hard-gated when species is absent", () => {
  const result = buildRecommendations(filledProfile({ species: "" }));
  assert.equal(result.speciesGate, true);
  assert.equal(result.recommendations.length, 0);
});

test("dog and cat contexts remain explicit and distinct", () => {
  const dog = buildRecommendations(filledProfile({ species: "dog" }), [], {
    wellnessGoal: "nutrition",
    nutritionGoal: "lower_cost",
  });
  const cat = buildRecommendations(filledProfile({ species: "cat" }), [], {
    wellnessGoal: "nutrition",
    nutritionGoal: "lower_cost",
  });
  assert.equal(dog.speciesGate, false);
  assert.equal(cat.speciesGate, false);
  assert.ok(dog.recommendations.every((item) => item.product?.species === "dog"));
  assert.ok(cat.recommendations.every((item) => item.product?.species === "cat"));
});

test("dog never receives cat products and cat never receives dog products", () => {
  const dog = buildRecommendations(
    filledProfile({ species: "dog", mainConcern: "General wellness" }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    staticRealProvider.searchProducts({ productCountry: "US", profile: filledProfile({ species: "dog" }) }),
  );
  const cat = buildRecommendations(
    filledProfile({ species: "cat", mainConcern: "General wellness" }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    staticRealProvider.searchProducts({ productCountry: "US", profile: filledProfile({ species: "cat" }) }),
  );

  assert.ok(dog.recommendations.length > 0);
  assert.ok(cat.recommendations.length > 0);
  assert.ok(dog.recommendations.every((item) => item.product?.species === "dog"));
  assert.ok(cat.recommendations.every((item) => item.product?.species === "cat"));
});

test("general wellness asks for a focused goal instead of broad products", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "General wellness" }));
  assert.equal(result.generalWellnessNeedsFocus, true);
  assert.equal(result.recommendations.length, 0);
});

test("flea and tick reminders are not rendered as products", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "Other", otherConcern: "flea tick reminder" }));
  assert.equal(result.recommendations[0].kind, "reminder");
  assert.equal(result.recommendations[0].product, null);
});

test("established food without nutrition concern does not trigger food recommendations", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "Grooming" }));
  assert.equal(result.establishedFoodWithoutNutritionConcern, true);
  assert.ok(result.recommendations.every((item) => item.product?.category !== "food"));
});

test("dental wellness goal filters to dental recommendations", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "General wellness" }), [], {
    wellnessGoal: "dental_care",
  });
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((item) => item.product?.concernTags.includes("dental_care")));
});

test("grooming wellness goal filters to grooming recommendations", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "General wellness" }), [], {
    wellnessGoal: "grooming",
  });
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations.every((item) => item.product?.category === "grooming"));
});

test("reminders wellness goal renders non-product cards", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "General wellness" }), [], {
    wellnessGoal: "reminders",
  });
  assert.equal(result.recommendations[0].kind, "reminder");
  assert.equal(result.recommendations[0].product, null);
});

test("nutrition goal asks for a nutrition focus before switching established food", () => {
  const result = buildRecommendations(filledProfile({ mainConcern: "General wellness" }), [], {
    wellnessGoal: "nutrition",
  });
  assert.equal(result.nutritionFollowUpNeeded, true);
  assert.equal(result.recommendations.length, 0);

  const lowerCost = buildRecommendations(filledProfile({ mainConcern: "General wellness" }), [], {
    wellnessGoal: "nutrition",
    nutritionGoal: "lower_cost",
  });
  assert.ok(lowerCost.recommendations.every((item) => item.product?.category === "food"));
  assert.ok(lowerCost.recommendations.every((item) => item.product?.species === "dog"));

  const catLowerCost = buildRecommendations(
    filledProfile({ species: "cat", mainConcern: "General wellness" }),
    [],
    {
      wellnessGoal: "nutrition",
      nutritionGoal: "lower_cost",
    },
  );
  assert.ok(catLowerCost.recommendations.every((item) => item.product?.species === "cat"));
});

test("unknown product species is excluded from food matching", () => {
  assert.equal(
    isSpeciesCompatibleProduct(
      { category: "food", species: undefined },
      "cat",
    ),
    false,
  );
});

test("no cat products falls back to no products instead of dog food", () => {
  const catFoodCatalog = mockProducts.filter((product) => product.species !== "cat");
  assert.equal(hasSpeciesCompatibleFoodProducts("cat", catFoodCatalog), false);
});

test("mock provider normalizes and filters species-compatible demo products", () => {
  const normalized = mockProvider.normalizeProduct({
    id: "cat-demo",
    name: "Whisker Bowl Salmon",
    category: "food",
    species: "cat",
    protein: "Salmon",
    bagPrice: 27,
    concernTags: ["general_wellness"],
    excludedIngredients: [],
    lifeStage: "adult",
  });

  assert.ok(normalized);
  assert.equal(normalized.brand, "Whisker Bowl");
  assert.equal(normalized.active, true);
  assert.equal(normalized.recommendationKind, "product");
  assert.equal(normalized.price, 27);
  assert.equal(normalized.estimatedMonthlyCost, 27);
  assert.equal(normalized.species, "cat");

  const catalog = mockProvider.searchProducts({ profile: filledProfile({ species: "cat" }) });
  assert.ok(catalog.length > 0);
  assert.ok(catalog.every((product) => isSpeciesCompatibleProduct(product, "cat")));
  assert.ok(catalog.every((product) => product.category !== "food" || product.species === "cat"));

  const dogCatalog = mockProvider.searchProducts({ profile: filledProfile({ species: "dog" }) });
  assert.ok(dogCatalog.length > 0);
  assert.ok(dogCatalog.every((product) => isSpeciesCompatibleProduct(product, "dog")));
  assert.ok(dogCatalog.every((product) => product.category !== "food" || product.species === "dog"));
});

test("disabled live provider is safe to call and returns no results", () => {
  assert.equal(disabledLiveProvider.enabled, false);
  assert.equal(disabledLiveProvider.id, "disabled_live");
  assert.deepEqual(disabledLiveProvider.searchProducts({ profile: filledProfile() }), []);
  assert.deepEqual(disabledLiveProvider.rankProducts([], { profile: filledProfile() }), []);
  assert.equal(disabledLiveProvider.normalizeProduct({ id: "x" }), null);
});

test("static real provider returns curated species-compatible products", () => {
  assert.equal(getConfiguredProductProvider("static_real").id, "static_real");
  assert.equal(getConfiguredProductProvider("mock").id, "mock");
  assert.equal(getConfiguredProductProvider("unknown").id, "static_real");
  assert.equal(resolveProductProviderMode({ productProvider: "unknown", nodeEnv: "test" }), "static_real");
  assert.equal(resolveProductProviderMode({ productProvider: "mock", nodeEnv: "production" }), "static_real");
  assert.equal(getConfiguredProductProvider("mock", "production").id, "static_real");

  const catCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: filledProfile({ species: "cat" }) });
  const dogCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: filledProfile({ species: "dog" }) });

  assert.ok(catCatalog.length > 0);
  assert.ok(dogCatalog.length > 0);
  assert.ok(catCatalog.every((product) => isSpeciesCompatibleProduct(product, "cat")));
  assert.ok(dogCatalog.every((product) => isSpeciesCompatibleProduct(product, "dog")));
  assert.ok(catCatalog.every((product) => product.category !== "food" || product.species === "cat"));
  assert.ok(dogCatalog.every((product) => product.category !== "food" || product.species === "dog"));
  assert.ok(catCatalog.some((product) => product.productUrl && product.evidenceType === "curated_static"));

  const catNutrition = buildRecommendations(
    filledProfile({ species: "cat", mainConcern: "General wellness" }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    catCatalog,
  );
  assert.ok(catNutrition.recommendations.length > 0);
  assert.ok(catNutrition.recommendations.every((item) => item.product?.species === "cat"));
});

test("product link info distinguishes live links from demo products", () => {
  assert.deepEqual(getProductLinkInfo({
    evidenceType: "curated_static",
    productUrl: "https://earthbath.com/products/hypoallergenic-shampoo",
  }), {
    href: "https://earthbath.com/products/hypoallergenic-shampoo",
    label: "View product",
    rel: "noopener noreferrer",
    target: "_blank",
    variant: "link",
  });
  assert.deepEqual(getProductLinkInfo({ evidenceType: "demo", productUrl: undefined }), {
    href: null,
    label: "Product reference",
    variant: "demo",
  });
  assert.equal(getProductLinkInfo({ evidenceType: "curated_static", productUrl: undefined }), null);
  assert.equal(
    getProductLinkInfo({ evidenceType: "curated_static", productUrl: "https://example.com/demo" }),
    null,
  );
});

test("profile fields are not suggested as saved details", () => {
  const analysis = parseAnalysis({
    confirmedFacts: [],
    ownerReportedObservations: [],
    possibleFactors: [],
    missingInformation: [],
    recommendedConcernTags: [],
    temporaryAvoidIngredients: [],
    vetAttention: { needed: false, urgency: "none", reason: "" },
    confidence: "moderate",
    memorySuggestions: [
      { type: "profile_fact", text: "Species is cat", confidence: "owner_reported" },
      { type: "preference", text: "Dislikes nail trimming", confidence: "owner_reported" },
    ],
    summary: "Summary",
  });
  assert.deepEqual(analysis?.memorySuggestions.map((item) => item.text), ["Dislikes nail trimming"]);
});

test("unknown weight produces limited guidance readiness", () => {
  const readiness = buildDraftProfileCompleteness(filledProfile({ weight: "", weightUnknown: true }));
  assert.equal(readiness.setupCompletion, "Ready for guidance");
  assert.equal(readiness.guidanceReadiness, "Limited context");
});

test("saved profile rows round-trip into the draft with the returned profile id preserved", () => {
  const row = {
    id: "pet-123",
    user_id: "user-1",
    name: "Mani",
    species: "cat",
    breed: "Siamese",
    age_value: 3,
    age_unit: "years",
    weight_value: 10,
    weight_unit: "lb",
    current_food: "Wet food",
    main_concern: "General wellness",
    wellness_goal: "nutrition",
    avoid_ingredients: ["Chicken"],
    monthly_budget: 45,
    created_at: "2026-06-25T12:00:00Z",
    updated_at: "2026-06-25T12:00:00Z",
  };

  const draft = dogProfileRowToDraft(row);
  assert.equal(draft.name, "Mani");
  assert.equal(draft.species, "cat");
  assert.equal(draft.currentFood, "Wet food");
  assert.equal(draft.currentFoodUnknown, false);
  assert.equal(draft.age, "3");
  assert.equal(draft.weight, "10");
  assert.equal(draft.wellnessGoal, "nutrition");
  const payload = buildDogProfilePayload(draft, "user-1");
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.current_food, "Wet food");
  assert.equal(payload.wellness_goal, "nutrition");
});

test("payload builder only includes database columns and persists wellness goal when present", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Mani",
      species: "dog",
      breed: "Mixed / unknown",
      age: "4",
      ageUnit: "years",
      weight: "42",
      weightUnit: "lb",
      currentFood: "Kibble",
      mainConcern: "General wellness",
      avoidIngredients: ["Chicken"],
      monthlyBudget: "50",
      wellnessGoal: "preventive_care",
    },
    "user-1",
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    "age_unit",
    "age_value",
    "avoid_ingredients",
    "breed",
    "current_food",
    "main_concern",
    "monthly_budget",
    "name",
    "species",
    "updated_at",
    "user_id",
    "weight_unit",
    "weight_value",
    "wellness_goal",
  ]);
  assert.equal(payload.wellness_goal, "preventive_care");
  assert.equal(payload.species, "dog");
});

test("profile payload drops typed none avoid values before saving", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Rocky",
      species: "dog",
      age: "4",
      mainConcern: "General wellness",
      avoidIngredients: ["Chicken", "none", "no known allergies"],
    },
    "user-1",
  );

  assert.deepEqual(payload.avoid_ingredients, ["Chicken"]);
});

test("thin first-result profiles save optional fields as database-safe empty values", () => {
  const payload = buildDogProfilePayload(
    {
      ...initialProfile,
      name: "Rocky",
      species: "dog",
      age: "4",
      ageUnit: "years",
      mainConcern: "Itching",
    },
    "user-1",
  );

  assert.equal(payload.name, "Rocky");
  assert.equal(payload.species, "dog");
  assert.equal(payload.age_value, 4);
  assert.equal(payload.main_concern, "Itching");
  assert.equal(payload.breed, null);
  assert.equal(payload.weight_value, null);
  assert.equal(payload.current_food, null);
  assert.deepEqual(payload.avoid_ingredients, []);
  assert.equal(payload.monthly_budget, null);
  assert.equal(validateDogProfileInput({ ...initialProfile, name: "Rocky", species: "dog", age: "4", mainConcern: "Itching" }).ok, true);
});

test("thin first-result profiles show all useful finish-profile prompts", () => {
  const prompts = getFinishProfileItemsFromDraft({
    ...initialProfile,
    name: "Rocky",
    species: "dog",
    age: "4",
    ageUnit: "years",
    mainConcern: "Itchy skin",
  }).map((item) => item.label);

  assert.deepEqual(prompts, [
    "Add breed",
    "Add current food",
    "Add avoid ingredients",
    "Add weight",
    "Add monthly care budget",
  ]);
});

test("chicken avoid blocks chicken food and treats", () => {
  const result = buildRecommendations(
    filledProfile({
      avoidIngredients: ["chicken"],
      mainConcern: "General wellness",
      species: "dog",
    }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    [
      ...staticRealProvider.searchProducts({ productCountry: "US", profile: filledProfile({ species: "dog" }) }),
      {
        id: "test-chicken-treat",
        name: "Chicken Training Treat",
        category: "health_essentials",
        species: "dog",
        protein: "Chicken",
        concernTags: ["general_wellness"],
        excludedIngredients: ["chicken"],
        lifeStage: "all",
        bagPrice: 12,
        estimatedMonthlyCost: 12,
        evidenceType: "curated_static",
        productUrl: "https://example.com/chicken-treat",
        whyItFits: "Test chicken treat.",
        whyCategoryFits: "Test treat.",
        cautions: "Contains chicken.",
      },
    ].filter(Boolean),
  );

  assert.ok(result.recommendations.every((item) => !/chicken|poultry/i.test(`${item.product?.name} ${item.product?.protein} ${item.product?.cautions}`)));
});

test("lower-cost nutrition keeps over-budget catalog matches out of best-match labeling", () => {
  const result = buildRecommendations(
    filledProfile({
      species: "cat",
      monthlyBudget: "40",
      currentFood: "Wet food",
    }),
    [],
    {
      wellnessGoal: "nutrition",
      nutritionGoal: "lower_cost",
    },
  );

  const productRecommendations = result.recommendations.filter((item) => item.product);
  assert.ok(productRecommendations.length > 0);

  const recommendationCosts = productRecommendations.map(
    (item) => item.product?.estimatedMonthlyCost ?? item.product?.price ?? item.product?.bagPrice ?? Number.POSITIVE_INFINITY,
  );
  const withinBudgetCount = recommendationCosts.filter((cost) => cost <= 40).length;

  if (withinBudgetCount > 0) {
    assert.ok(recommendationCosts[0] <= 40);
  } else {
    assert.equal(productRecommendations[0].label, "Closest option");
    assert.ok(productRecommendations.every((item) => item.label !== "Best match"));
  }
});

test("legacy dog profile rows with null species remain loadable", () => {
  const draft = dogProfileRowToDraft({
    id: "legacy-pet",
    user_id: "user-1",
    name: "Legacy",
    species: null,
    breed: null,
    age_value: null,
    age_unit: null,
    weight_value: null,
    weight_unit: null,
    current_food: null,
    main_concern: null,
    wellness_goal: null,
    avoid_ingredients: null,
    monthly_budget: null,
    created_at: "2026-06-25T12:00:00Z",
    updated_at: "2026-06-25T12:00:00Z",
  });

  assert.equal(draft.species, "");
  assert.equal(draft.name, "Legacy");
});
