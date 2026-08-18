import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildUrgentAskResponse } from "../app/lib/ask.mjs";
import { groundedAskSystemPrompt } from "../app/lib/ai/ask-furvise.ts";
import {
  buildFurviseSafetyLine,
  buildMissingSavedInformationMessage,
  buildNoSafeProductMatchMessage,
  FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE,
  FURVISE_MISSING_INGREDIENTS_MESSAGE,
  FURVISE_MISSING_PRICE_MESSAGE,
  FURVISE_MISSING_AVAILABILITY_MESSAGE,
  FURVISE_MISSING_RETAILER_LINK_MESSAGE,
  FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
  FURVISE_PRODUCT_USAGE_CAP_MESSAGE,
  FURVISE_SEARCH_FALLBACK_MESSAGE,
  FURVISE_CORE_PROMPT_RULES,
  FURVISE_RESPONSE_DEPTH_RULES,
  FURVISE_SHARED_PROMPT_RULES,
  FURVISE_URGENT_SAFETY_MESSAGE,
  FURVISE_WRITING_PRINCIPLES,
} from "../app/lib/furvise-voice.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";
import {
  buildFallbackShopProductFitExplanation,
  shopProductFitExplanationSystemPrompt,
} from "../app/lib/shop/product-fit-explanation.ts";
import {
  buildFallbackShopProductQuestionAnswer,
  shopProductQuestionSystemPrompt,
} from "../app/lib/shop/product-question.ts";

function memory() {
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
    },
    timeline: { recentEntries: [], recallEntries: [], entriesLast7Days: [], entriesLast30Days: [] },
    savedDetails: [],
    productFeedback: [],
    derived: {
      recentChanges: [],
      recurringConcerns: [],
      knownAvoids: ["chicken"],
      safetyFlags: [],
      missingContext: [],
      summaryBullets: [],
    },
  };
}

test("central voice module defines and shares the Furvise writing principles", () => {
  for (const principle of ["Direct first", "Efficient, not merely short", "Pet-aware", "Context-aware", "Uncertainty-preserving", "Practical", "Relevance-aware", "Calm", "Human", "Structure when useful", "No internal machinery", "No empty follow-up offers", "No generic safety footer spam", "No em dashes"]) {
    assert.ok(FURVISE_WRITING_PRINCIPLES.some((item) => item.startsWith(`${principle}:`)));
  }
  assert.ok(FURVISE_CORE_PROMPT_RULES.length >= 8);
  assert.ok(FURVISE_RESPONSE_DEPTH_RULES.length >= 5);
  assert.ok(FURVISE_SHARED_PROMPT_RULES.length >= 15);
  assert.equal(buildFurviseSafetyLine("Rocky"), "Based on what you've saved about Rocky. Not a substitute for veterinary or professional advice.");
  assert.equal(buildMissingSavedInformationMessage("Rocky"), "You have not saved anything about that for Rocky yet.");
  assert.equal(buildNoSafeProductMatchMessage("Rocky"), "I could not find a product that fits this search, Rocky's details, and your product country.");
  assert.equal(FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE, "The full product details are not available yet, so check the label before buying or using it.");
  assert.equal(FURVISE_MISSING_INGREDIENTS_MESSAGE, "The full ingredient list is not available yet, so check the package before buying.");
  assert.equal(FURVISE_MISSING_PRICE_MESSAGE, "Check the retailer for the latest price.");
  assert.equal(FURVISE_MISSING_AVAILABILITY_MESSAGE, "Check the retailer for current availability.");
  assert.equal(FURVISE_MISSING_RETAILER_LINK_MESSAGE, "A current retailer link is not available yet.");
  assert.equal(FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE, "Product guidance is temporarily unavailable, but you can still search the catalog.");
  assert.equal(FURVISE_PRODUCT_USAGE_CAP_MESSAGE, "You have used this month's AI credits. Product browsing and matching are still available.");
  assert.equal(FURVISE_SEARCH_FALLBACK_MESSAGE, "I could not fully understand that search, so I looked through the catalog using the words you typed.");
});

test("advisor prompts lead directly, adapt depth, preserve entities, and hide internal terminology", () => {
  const prompts = [groundedAskSystemPrompt, shopProductQuestionSystemPrompt, shopProductFitExplanationSystemPrompt];
  assert.match(groundedAskSystemPrompt, /Answer the person's actual question immediately/);
  assert.match(shopProductQuestionSystemPrompt, /Answer the person's actual question immediately/);
  assert.match(shopProductFitExplanationSystemPrompt, /Start by saying what the product is/);
  assert.match(prompts.join("\n"), /Level 1 is for a simple factual or low-context question/);
  assert.match(prompts.join("\n"), /Level 3 is for a complex, multi-factor, history-aware/);
  assert.match(prompts.join("\n"), /Do not map every animal reference to the selected pet/);
  assert.match(prompts.join("\n"), /remains suspected or uncertain, never confirmed/);
  assert.match(prompts.join("\n"), /use a short direct opening followed by compact sections or bullets/);
  assert.doesNotMatch(prompts.join("\n"), /Keep normal answers to one or two short paragraphs|Avoid headings, lists, and report-style sections/);
  assert.doesNotMatch(
    prompts.join("\n"),
    /provided data|provided context|catalog signals|verified fields|ingredientsVerified|Furvise cannot determine|If you want, I can/i,
  );
});

test("product prompts compose the central voice once and keep product safety local", () => {
  const centralRule = "Preserve epistemic status exactly";
  for (const prompt of [shopProductQuestionSystemPrompt, shopProductFitExplanationSystemPrompt]) {
    assert.equal(prompt.split(centralRule).length - 1, 1);
    assert.match(prompt, /Never promise suitability|Do not claim the product is ideal/);
    assert.match(prompt, /Do not diagnose/);
    assert.doesNotMatch(prompt, /best product|guaranteed suitable|buy now/i);
  }
  const featureRunner = readFileSync(new URL("../app/lib/intelligence/run-feature-intelligence.ts", import.meta.url), "utf8");
  assert.match(featureRunner, /feature === "product_query_interpretation" \|\| feature === "vet_brief"/);
  assert.match(featureRunner, /\? FURVISE_CORE_PROMPT_RULES\s*: FURVISE_SHARED_PROMPT_RULES/);
});

test("messy product questions get a useful answer with honest uncertainty", () => {
  const food = staticRealProducts.find((product) => product.category === "food" && product.ingredientsVerified);
  assert.ok(food);

  const preference = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: food,
    query: "dog food",
    question: "my Rocky hates lamb",
  });
  assert.match(preference.answer, /lamb|listed ingredients|check the current label/i);

  const reaction = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: food,
    query: "dog food",
    question: "will this make him react or worse maybe",
  });
  assert.match(reaction.answer, /^I can't know whether Rocky will react to it\./);
  assert.match(reaction.answer, /Check the ingredients/);
  assert.doesNotMatch(reaction.answer, /probably yes|should be fine|guaranteed/i);
});

test("Why this product remains a short explanation rather than a buying report", () => {
  const shampoo = staticRealProducts.find((product) => product.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(shampoo);
  const explanation = buildFallbackShopProductFitExplanation({
    memory: memory(),
    product: shampoo,
    query: "itchy paws shampoo",
  });
  assert.ok(explanation.bodyParagraphs.length <= 2);
  assert.ok(explanation.bodyParagraphs.join(" ").split(/\s+/).length <= 70);
  assert.match(explanation.bodyParagraphs[0], /is a dog shampoo/i);
  assert.doesNotMatch(explanation.bodyParagraphs.join(" "), /Product fit|Good for|Keep in mind|Saved context|signals/i);
});

test("urgent wording is first and normal product answers avoid unsafe claims", () => {
  const urgent = buildUrgentAskResponse();
  assert.equal(urgent.summary, FURVISE_URGENT_SAFETY_MESSAGE);
  assert.match(urgent.summary, /^This sounds more important than choosing a product\./);

  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);
  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "is this good if Rocky has itchy paws",
  });
  assert.doesNotMatch(answer.answer, /\b(diagnos(?:e|is)|cure|guaranteed|best|vet-approved)\b/i);
});

test("user-facing app and prompt files contain no em dash character", () => {
  const sourceFiles = listSourceFiles(fileURLToPath(new URL("../app", import.meta.url)));
  for (const file of sourceFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\u2014/, file);
  }
});

function listSourceFiles(root) {
  const files = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...listSourceFiles(path));
    else if (/\.(?:mjs|ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}
