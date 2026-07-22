import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackShopProductFitExplanation,
  buildProductFitSafetyLine,
  buildShopProductFitPromptInput,
  buildVerifiedProductFields,
  parseShopProductFitExplanation,
  shopProductFitExplanationSystemPrompt,
} from "../app/lib/shop/product-fit-explanation.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

function memory(overrides = {}) {
  return {
    pet: {
      id: "rocky-id",
      name: "Rocky",
      species: "dog",
      breed: "Mixed",
      ageLabel: "4 years",
      weightLabel: "42 lb",
      mainConcern: "Grooming",
      currentFood: "Salmon kibble",
      avoidIngredients: ["chicken"],
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
      recurringConcerns: ["Skin or paw irritation appears more than once."],
      knownAvoids: ["chicken"],
      safetyFlags: [],
      missingContext: [],
      summaryBullets: [],
      ...(overrides.derived || {}),
    },
  };
}

function validExplanation(overrides = {}) {
  return {
    summary: "Rocky's saved profile and this product share dog grooming context.",
    matchedSavedFacts: ["Rocky is saved as a dog."],
    productSignalsUsed: ["Product category: grooming."],
    cautions: ["Ingredient details are limited."],
    confidence: "medium",
    safetyLine: buildProductFitSafetyLine("Rocky"),
    ...overrides,
  };
}

test("product fit explanation schema validates required fields and exact safety line", () => {
  assert.equal(parseShopProductFitExplanation(validExplanation(), "Rocky")?.confidence, "medium");
  assert.equal(parseShopProductFitExplanation(validExplanation({ confidence: "certain" }), "Rocky"), null);
  assert.equal(parseShopProductFitExplanation(validExplanation({ safetyLine: "Wrong line" }), "Rocky"), null);
  const missing = validExplanation();
  delete missing.productSignalsUsed;
  assert.equal(parseShopProductFitExplanation(missing, "Rocky"), null);
});

test("product fit prompt restricts the model to grounded verified fields", () => {
  assert.match(shopProductFitExplanationSystemPrompt, /Use only the pet facts and verified product fields provided/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Do not introduce outside facts/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Do not infer ingredients unless ingredientsVerified is true/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Return only valid JSON/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Never say safe for the pet/i);
});

test("verified product payload includes ingredients only when ingredientsVerified is true", () => {
  const verified = staticRealProducts.find((product) => product.id === "greenies-original-regular-dog-dental-treats");
  const unverified = staticRealProducts.find((product) => product.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(verified);
  assert.ok(unverified);

  const verifiedFields = buildVerifiedProductFields(verified);
  const unverifiedFields = buildVerifiedProductFields(unverified);

  assert.equal(verifiedFields.ingredientsVerified, true);
  assert.ok(verifiedFields.ingredientHighlights.length > 0);
  assert.ok(verifiedFields.avoidIngredientKeywords.length > 0);
  assert.equal(unverifiedFields.ingredientsVerified, false);
  assert.deepEqual(unverifiedFields.ingredientHighlights, []);
  assert.deepEqual(unverifiedFields.avoidIngredientKeywords, []);
  assert.equal("cautions" in unverifiedFields, false);
  assert.equal("whyItFits" in unverifiedFields, false);
  assert.equal("retailer" in unverifiedFields, false);
  assert.equal("price" in unverifiedFields, false);
});

test("product fit fallback stays grounded and cautious without product endorsement language", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);
  const explanation = buildFallbackShopProductFitExplanation({
    memory: memory(),
    product,
    query: "shampoo",
  });
  const text = JSON.stringify(explanation);

  assert.match(explanation.safetyLine, /not a substitute for vet or professional advice/);
  assert.ok(explanation.matchedSavedFacts.some((fact) => /Rocky is saved as a dog/.test(fact)));
  assert.ok(explanation.productSignalsUsed.some((signal) => /Ingredients verified: no/.test(signal)));
  assert.ok(explanation.cautions.some((caution) => /Ingredient details are not fully verified/.test(caution)));
  assert.equal(explanation.confidence, "low");
  assert.doesNotMatch(text, /best|guaranteed|vet-approved|cure|treatment|safe for Rocky/i);
});

test("product fit prompt input includes saved context and no unverified ingredient claims", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);
  const promptInput = buildShopProductFitPromptInput({
    memory: memory(),
    product,
    query: "shampoo",
  });

  assert.equal(promptInput.requiredSafetyLine, buildProductFitSafetyLine("Rocky"));
  assert.equal(promptInput.selectedPet.name, "Rocky");
  assert.deepEqual(promptInput.selectedPet.avoidIngredients, ["chicken"]);
  assert.equal(promptInput.product.ingredientsVerified, false);
  assert.deepEqual(promptInput.product.ingredientHighlights, []);
});

test("product fit explanations use the exact safety line and do not confirm unverified ingredients", () => {
  const unverified = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  const verified = staticRealProducts.find((item) => item.id === "greenies-original-regular-dog-dental-treats");
  assert.ok(unverified);
  assert.ok(verified);

  assert.equal(
    buildProductFitSafetyLine("Rocky"),
    "Based on what you've saved about Rocky — not a substitute for vet or professional advice",
  );

  const unverifiedInput = buildShopProductFitPromptInput({
    memory: memory(),
    product: unverified,
    query: "shampoo",
  });
  const verifiedInput = buildShopProductFitPromptInput({
    memory: memory(),
    product: verified,
    query: "dental treats",
  });

  assert.equal(unverifiedInput.product.ingredientsVerified, false);
  assert.deepEqual(unverifiedInput.product.ingredientHighlights, []);
  assert.deepEqual(unverifiedInput.product.avoidIngredientKeywords, []);
  assert.equal(verifiedInput.product.ingredientsVerified, true);
  assert.ok(verifiedInput.product.ingredientHighlights.length > 0);
  assert.ok(verifiedInput.product.avoidIngredientKeywords.length > 0);

  const fallback = buildFallbackShopProductFitExplanation({
    memory: memory(),
    product: unverified,
    query: "shampoo",
  });
  const fallbackText = JSON.stringify(fallback);
  assert.equal(fallback.safetyLine, buildProductFitSafetyLine("Rocky"));
  assert.doesNotMatch(fallbackText, /confirmed ingredients|ingredients are confirmed|verified ingredients include/i);
});
