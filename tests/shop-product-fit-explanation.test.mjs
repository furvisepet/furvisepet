import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

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
    bodyParagraphs: [
      "Earthbath Oatmeal & Aloe Fragrance Free Pet Shampoo is a dog grooming shampoo aimed at gentle bath support.",
      "The ingredient details are not fully verified in Furvise yet, so review the label before using it.",
    ],
    confidence: "medium",
    safetyLine: buildProductFitSafetyLine("Rocky"),
    ...overrides,
  };
}

function visibleExplanationText(explanation) {
  return [
    ...explanation.bodyParagraphs,
    explanation.safetyLine,
  ].join(" ");
}

function countOccurrences(value, pattern) {
  return (value.match(pattern) || []).length;
}

test("product fit explanation schema validates sales-copy fields and exact safety line", () => {
  assert.equal(parseShopProductFitExplanation(validExplanation(), "Rocky")?.confidence, "medium");
  assert.equal(parseShopProductFitExplanation(validExplanation({ confidence: "certain" }), "Rocky"), null);
  assert.equal(parseShopProductFitExplanation(validExplanation({ safetyLine: "Wrong line" }), "Rocky"), null);
  const missing = validExplanation();
  delete missing.bodyParagraphs;
  assert.equal(parseShopProductFitExplanation(missing, "Rocky"), null);
});

test("product fit prompt asks for benefit-focused copy without audit wording", () => {
  assert.match(shopProductFitExplanationSystemPrompt, /product advisor copy/i);
  assert.match(shopProductFitExplanationSystemPrompt, /benefit-focused/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Do not infer ingredients unless ingredientsVerified is true/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Never say safe for the pet/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Do not use bullets, section labels, or internal reasoning language/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Do not include assistant-style follow-up offers/i);
  assert.match(shopProductFitExplanationSystemPrompt, /If you want, I can, I can help, ask me, or let me know/i);
  assert.match(shopProductFitExplanationSystemPrompt, /If ingredientsVerified is false, do not repeat a full missing-ingredient warning/i);
  assert.match(shopProductFitExplanationSystemPrompt, /Use one brief label-review sentence/i);
});

test("verified product payload includes ingredients only when ingredientsVerified is true", () => {
  const verified = staticRealProducts.find((product) => product.id === "greenies-original-regular-dog-dental-treats");
  const unverified = staticRealProducts.find((product) => product.id === "furminator-cat-deshedding-tool");
  assert.ok(verified);
  assert.ok(unverified);

  const verifiedFields = buildVerifiedProductFields(verified);
  const unverifiedFields = buildVerifiedProductFields(unverified);

  assert.equal(verifiedFields.ingredientsVerified, true);
  assert.ok(verifiedFields.ingredientHighlights.length > 0);
  assert.ok(verifiedFields.avoidIngredientKeywords.length > 0);
  assert.equal(unverifiedFields.ingredientsVerified, false);
  assert.equal(unverifiedFields.ingredientStatus, "not fully verified");
  assert.deepEqual(unverifiedFields.ingredientHighlights, []);
  assert.deepEqual(unverifiedFields.avoidIngredientKeywords, []);
  assert.equal("cautions" in unverifiedFields, false);
  assert.equal("whyItFits" in unverifiedFields, false);
  assert.equal("retailer" in unverifiedFields, false);
  assert.equal("price" in unverifiedFields, false);
});

test("fallback explanation reads like concise product advisor copy", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);
  const explanation = buildFallbackShopProductFitExplanation({
    memory: memory(),
    product,
    query: "itchy paws shampoo",
  });
  const renderedText = visibleExplanationText(explanation);

  assert.equal(explanation.bodyParagraphs.length, 2);
  assert.equal(
    explanation.bodyParagraphs[0],
    "Earthbath Oatmeal & Aloe Fragrance Free Pet Shampoo may make sense for Rocky because it is a dog shampoo for routine bathing and gentle coat cleaning. It is a better fit for grooming questions than dental, food, or flea concerns.",
  );
  assert.equal(
    explanation.bodyParagraphs[1],
    "Review the label before using it, especially if Rocky has sensitive skin or has reacted to shampoos before. Stop using it if irritation appears or worsens.",
  );
  assert.doesNotMatch(renderedText, /helps itchy paws|good for sensitive dogs|for skin irritation/i);
  assert.doesNotMatch(renderedText, /dilute|massage|rinse|Purified water|Colloidal oatmeal|Aloe vera|verifiedIngredients|verifiedDirections/i);
  assert.doesNotMatch(explanation.bodyParagraphs.join(" "), /full verified ingredient list/i);
  assert.ok((renderedText.match(/\bingredient/i) || []).length <= 1);
  assert.ok(renderedText.split(/\s+/).length <= 110);
  assert.equal(explanation.safetyLine, "Based on what you've saved about Rocky. Not a substitute for vet or professional advice.");
  assert.equal(explanation.confidence, "medium");
  assert.doesNotMatch(renderedText, /Product fit|Good for|Keep in mind|Pet context used|Saved context matched|Product signals Furvise used|Cautions/);
  assert.doesNotMatch(renderedText, /catalog tags|catalog search|provided product data|positioned for|signals|\bAI\b|matched because|evidence is limited|available in the US/i);
  assert.doesNotMatch(renderedText, /owner_observation|itchy_skin|sensitive_skin|ingredientsVerified/i);
  assert.doesNotMatch(renderedText, /If you want|I can help|ask me|let me know/i);
  assert.doesNotMatch(renderedText, /\u2014/);
  assert.doesNotMatch(renderedText, /\b(best|guaranteed|safe|vet-approved|cure)\b/i);
});

test("product fit prompt input includes no unverified ingredient claims", () => {
  const product = staticRealProducts.find((item) => item.id === "furminator-cat-deshedding-tool");
  assert.ok(product);
  const promptInput = buildShopProductFitPromptInput({
    memory: memory(),
    product,
    query: "brush",
  });

  assert.equal(promptInput.requiredSafetyLine, buildProductFitSafetyLine("Rocky"));
  assert.equal(promptInput.selectedPet.name, "Rocky");
  assert.equal(promptInput.selectedPet.species, "dog");
  assert.equal(promptInput.product.ingredientsVerified, false);
  assert.equal(promptInput.product.ingredientStatus, "not fully verified");
  assert.deepEqual(promptInput.product.ingredientHighlights, []);
});

test("parser strips audit wording and raw internal fields from visible paragraphs", () => {
  const explanation = parseShopProductFitExplanation(
    validExplanation({
      bodyParagraphs: [
        "This provided product data includes concern tags: itchy_skin, sensitive_skin. If you want, I can help compare it with other dog shampoos.",
        "ingredientsVerified: false",
        "A third paragraph should not render.",
      ],
    }),
    "Rocky",
  );
  assert.ok(explanation);
  assert.equal(explanation.bodyParagraphs.length, 2);

  const renderedText = visibleExplanationText(explanation);
  assert.doesNotMatch(renderedText, /owner_observation|itchy_skin|sensitive_skin|ingredientsVerified/i);
  assert.doesNotMatch(renderedText, /provided product data|catalog tags|signals|\bAI\b/i);
  assert.doesNotMatch(renderedText, /If you want|I can help|ask me|let me know/i);
  assert.doesNotMatch(renderedText, /\u2014/);
});

test("parser removes assistant offers and blocks unsafe product claims", () => {
  const explanation = parseShopProductFitExplanation(
    validExplanation({
      bodyParagraphs: [
        "Earthbath Oatmeal & Aloe Fragrance Free Pet Shampoo is a dog grooming shampoo for routine bathing. If you want, I can help compare it with other dog shampoos.",
        "Furvise does not have the full verified ingredient list yet, so check the label before using it. Let me know if you want more options.",
      ],
    }),
    "Rocky",
  );
  assert.ok(explanation);
  const renderedText = visibleExplanationText(explanation);
  assert.match(renderedText, /routine bathing/);
  assert.match(renderedText, /Review the label before using\./);
  assert.doesNotMatch(renderedText, /full verified ingredient list/i);
  assert.doesNotMatch(renderedText, /If you want|I can help|ask me|let me know/i);
  assert.doesNotMatch(renderedText, /\u2014/);

  for (const claim of ["This is the best product.", "This is guaranteed safe.", "This is vet-approved.", "This can cure itchy skin."]) {
    assert.equal(parseShopProductFitExplanation(validExplanation({ bodyParagraphs: [claim] }), "Rocky"), null);
  }
});

test("parser keeps product fit safety line only once at the bottom", () => {
  const explanation = parseShopProductFitExplanation(
    validExplanation({
      bodyParagraphs: [
        "Earthbath Oatmeal & Aloe Fragrance Free Pet Shampoo is a dog shampoo for routine bathing. Based on what you've saved about Rocky. Not a substitute for vet or professional advice.",
        "Review the label before using it.",
      ],
    }),
    "Rocky",
  );
  assert.ok(explanation);

  const renderedText = visibleExplanationText(explanation);
  assert.doesNotMatch(explanation.bodyParagraphs.join(" "), /Based on what you've saved about Rocky/i);
  assert.equal(
    countOccurrences(renderedText, /Based on what you've saved about Rocky\. Not a substitute for vet or professional advice\./g),
    1,
  );
});

test("product fit explanation panel renders only sales-style paragraphs", () => {
  const page = read("app/shop/page.tsx");
  const panel = page.slice(page.indexOf("function ProductFitExplanationPanel"), page.indexOf("function EmptyState"));
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));

  assert.match(productCard, /Why this product\?/);
  assert.doesNotMatch(productCard, /Why this product may make sense/);
  assert.match(panel, /Why this product\?/);
  assert.match(panel, /bodyParagraphs\.map/);
  assert.match(panel, /min-w-0 max-w-full/);
  assert.match(panel, /\[overflow-wrap:anywhere\]/);
  assert.doesNotMatch(panel, /\{children\}/);
  assert.doesNotMatch(panel, /Why this may be a good option/);
  assert.doesNotMatch(panel, /Product fit|Good for|Keep in mind|Pet context used|Saved context matched|Product signals Furvise used|Cautions/);
  assert.doesNotMatch(panel, /line-clamp|truncate|max-h-|overflow-hidden/);
});

test("product UI copy contains no em dash", () => {
  const page = read("app/shop/page.tsx");
  const helper = read("app/lib/shop/product-fit-explanation.ts");

  assert.doesNotMatch(page, /â€”|\\u2014/);
  assert.doesNotMatch(helper, /â€”/);
  assert.match(helper, /Based on what you've saved about \$\{petName \|\| "this pet"\}\. Not a substitute for vet or professional advice\./);
});


