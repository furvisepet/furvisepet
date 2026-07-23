import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendations,
  initialProfile,
  mockProducts,
  PRODUCT_SOURCES,
  productPassesAvoidIngredientFilter,
} from "../app/lib/petwise.ts";
import {
  getConfiguredProductProvider,
  getActiveProductCountry,
  getDisplayProductPriceLabel,
  isProductEligibleForCountry,
  mockProvider,
  normalizeAvailableCountries,
  normalizeProductCountry,
  normalizeProductSource,
  resolveProductProviderMode,
  staticRealProvider,
} from "../app/lib/product-providers.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

function profile(overrides = {}) {
  return {
    ...initialProfile,
    name: "Rocky",
    species: "dog",
    breed: "German Shepherd",
    age: "5",
    weight: "70",
    currentFood: "Chicken kibble",
    mainConcern: "General wellness",
    monthlyBudget: "80",
    ...overrides,
  };
}

function withNodeEnv(value, callback) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return callback();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test("production always resolves static_real and never mock", () => {
  assert.equal(resolveProductProviderMode({ nodeEnv: "production", productProvider: "mock" }), "static_real");
  assert.equal(
    resolveProductProviderMode({
      nodeEnv: "production",
      productProvider: "unknown",
      nextPublicProductProvider: "mock",
    }),
    "static_real",
  );
  assert.equal(getConfiguredProductProvider("mock", "production").id, "static_real");
});

test("production filters mock and demo products out even if called directly", () => {
  withNodeEnv("production", () => {
    const mockCatalog = mockProvider.searchProducts({ profile: profile({ species: "dog" }) });
    assert.equal(mockCatalog.length, 0);

    const result = buildRecommendations(
      profile({ mainConcern: "General wellness" }),
      [],
      { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
      mockProducts,
    );
    assert.equal(result.recommendations.length, 0);
    assert.equal(result.emptyStateReason, "no_species_match");
  });
});

test("static_real catalog filters species and avoids ingredients before recommendations", () => {
  const dogCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "dog" }) });
  const catCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "cat" }) });
  const unknownCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "" }) });

  assert.ok(dogCatalog.every((product) => product.species === "dog"));
  assert.ok(catCatalog.every((product) => product.species === "cat"));
  assert.equal(unknownCatalog.length, 0);

  const chickenAvoid = ["CHICKEN"].map((item) => item.toLowerCase());
  assert.equal(
    productPassesAvoidIngredientFilter(
      dogCatalog.find((product) => /chicken/i.test(product.name)) ?? dogCatalog[0],
      chickenAvoid,
    ),
    false,
  );
  assert.equal(
    productPassesAvoidIngredientFilter(
      dogCatalog.find((product) => product.category === "grooming"),
      chickenAvoid,
    ),
    true,
  );

  const result = buildRecommendations(
    profile({ avoidIngredients: ["chicken"] }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    dogCatalog,
  );
  assert.ok(result.recommendations.every((item) => !/chicken|poultry/i.test(`${item.product?.name} ${item.product?.protein}`)));
});

test("static_real products declare valid country eligibility metadata", () => {
  for (const product of staticRealProducts) {
    assert.equal(product.source, "curated", `${product.id} has unexpected product source`);
    assert.ok(PRODUCT_SOURCES.includes(product.source), `${product.id} has invalid product source`);
    assert.equal(typeof product.ingredientsVerified, "boolean", `${product.id} missing ingredientsVerified`);
    assert.ok(Array.isArray(product.availableCountries), `${product.id} missing availableCountries`);
    assert.ok(product.availableCountries.length > 0, `${product.id} has empty availableCountries`);
    assert.deepEqual(normalizeAvailableCountries(product.availableCountries), product.availableCountries);
    assert.ok(product.availableCountries.every((country) => country === "US" || country === "CA"));
  }
});

test("static_real ingredient verification only marks structured ingredient metadata as verified", () => {
  const verifiedProductIds = new Set([
    "hills-science-diet-adult-dog-chicken-barley",
    "purina-cat-chow-complete-chicken",
    "hills-science-diet-adult-cat-chicken",
    "earthbath-oatmeal-aloe-shampoo",
    "greenies-original-regular-dog-dental-treats",
  ]);

  for (const product of staticRealProducts) {
    assert.equal(
      product.ingredientsVerified,
      verifiedProductIds.has(product.id),
      `${product.id} has unexpected ingredientsVerified default`,
    );
    if (product.ingredientsVerified) {
      assert.ok(product.verifiedIngredients?.length, `${product.id} missing verifiedIngredients`);
    }
  }
});

test("product provider defaults future feed ingredient verification conservatively", () => {
  assert.equal(normalizeProductSource("chewy_feed"), "chewy_feed");
  assert.equal(normalizeProductSource("ca_retailer_feed"), "ca_retailer_feed");
  assert.equal(normalizeProductSource("unknown"), null);
  assert.equal(normalizeProductSource(undefined), "curated");

  const normalized = mockProvider.normalizeProduct({
    id: "future-feed-food",
    name: "Future Feed Food",
    category: "food",
    species: "dog",
    source: "chewy_feed",
    protein: "Salmon",
    concernTags: ["general_wellness"],
    excludedIngredients: [],
    ingredientHighlights: ["Salmon"],
    availableCountries: ["US", "GB", "CA"],
    lifeStage: "adult",
  });

  assert.ok(normalized);
  assert.equal(normalized.source, "chewy_feed");
  assert.equal(normalized.ingredientsVerified, false);
  assert.deepEqual(normalized.availableCountries, ["US", "CA"]);
});

test("active product country resolves configured US and CA with temporary US fallback", () => {
  assert.equal(normalizeProductCountry("CA"), "CA");
  assert.equal(normalizeProductCountry("us"), "US");
  assert.equal(normalizeProductCountry("GB"), null);
  assert.equal(getActiveProductCountry({ productCountry: "CA" }), "CA");
  assert.equal(getActiveProductCountry({ productCountry: "US" }), "US");
  assert.equal(getActiveProductCountry({ accountCountry: "US", productCountry: "CA" }), "US");
  assert.equal(getActiveProductCountry({ productCountry: "GB", nextPublicProductCountry: "" }), "US");
});

test("static_real country filtering excludes non-eligible products", () => {
  const usOnly = { availableCountries: ["US"] };
  const caOnly = { availableCountries: ["CA"] };
  const both = { availableCountries: ["US", "CA"] };

  assert.equal(isProductEligibleForCountry(usOnly, "CA"), false);
  assert.equal(isProductEligibleForCountry(usOnly, "US"), true);
  assert.equal(isProductEligibleForCountry(caOnly, "US"), false);
  assert.equal(isProductEligibleForCountry(caOnly, "CA"), true);
  assert.equal(isProductEligibleForCountry(both, "US"), true);
  assert.equal(isProductEligibleForCountry(both, "CA"), true);

  const caCatalog = staticRealProvider.searchProducts({ productCountry: "CA", profile: profile({ species: "dog" }) });
  const usCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "dog" }) });

  assert.equal(caCatalog.length, 0);
  assert.ok(usCatalog.length > 0);
  assert.ok(usCatalog.every((product) => product.availableCountries?.includes("US")));

  const invalidAccountCountryCatalog = staticRealProvider.searchProducts({
    productCountry: getActiveProductCountry({
      accountCountry: "GB",
      nextPublicProductCountry: "",
      productCountry: "",
    }),
    profile: profile({ species: "dog" }),
  });
  assert.ok(invalidAccountCountryCatalog.length > 0);
  assert.ok(invalidAccountCountryCatalog.every((product) => product.availableCountries?.includes("US")));
});

test("product filtering reads account country before configured product country", () => {
  const accountCountryCatalog = staticRealProvider.searchProducts({
    productCountry: getActiveProductCountry({
      accountCountry: "US",
      nextPublicProductCountry: "",
      productCountry: "CA",
    }),
    profile: profile({ species: "dog" }),
  });

  assert.ok(accountCountryCatalog.length > 0);
  assert.ok(accountCountryCatalog.every((product) => product.availableCountries?.includes("US")));
});

test("country filtering combines with species and avoid ingredient filtering", () => {
  const usDogCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "dog" }) });
  const usCatCatalog = staticRealProvider.searchProducts({ productCountry: "US", profile: profile({ species: "cat" }) });
  const caDogCatalog = staticRealProvider.searchProducts({ productCountry: "CA", profile: profile({ species: "dog" }) });

  assert.ok(usDogCatalog.length > 0);
  assert.ok(usCatCatalog.length > 0);
  assert.ok(usDogCatalog.every((product) => product.species === "dog" && product.availableCountries?.includes("US")));
  assert.ok(usCatCatalog.every((product) => product.species === "cat" && product.availableCountries?.includes("US")));
  assert.equal(caDogCatalog.length, 0);

  const result = buildRecommendations(
    profile({ avoidIngredients: ["chicken"], species: "dog" }),
    [],
    { wellnessGoal: "nutrition", nutritionGoal: "lower_cost" },
    usDogCatalog,
  );
  assert.ok(result.recommendations.every((item) => !/chicken|poultry/i.test(`${item.product?.name} ${item.product?.protein} ${item.product?.cautions}`)));
});

test("avoid ingredient filtering excludes unverified ingestible products", () => {
  const unverifiedFeedFood = {
    ...staticRealProducts[0],
    id: "unverified-feed-food",
    name: "Unverified Feed Food",
    source: "chewy_feed",
    ingredientsVerified: false,
    protein: "Salmon",
    excludedIngredients: [],
    avoidIngredientKeywords: [],
    ingredientHighlights: ["Salmon"],
    cautions: "Feed-derived ingredients are not verified.",
  };

  assert.equal(productPassesAvoidIngredientFilter(unverifiedFeedFood, ["dairy"]), false);
});

test("production price labels never render demo or estimated prices", () => {
  assert.equal(
    getDisplayProductPriceLabel({
      currency: "USD",
      estimatedMonthlyCost: 50,
      price: 25,
    }),
    "Not provided",
  );
  assert.equal(
    getDisplayProductPriceLabel({
      currency: "USD",
      price: 25,
      priceVerifiedAt: "2026-07-13",
    }),
    "USD 25",
  );
});
