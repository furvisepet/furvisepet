import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOffTopicShopProductQuestionAnswer,
  buildFallbackShopProductQuestionAnswer,
  buildProductQuestionSafetyNote,
  buildShopProductQuestionPromptInput,
  classifyShopProductQuestionIntent,
  hasForbiddenProductQuestionCopy,
  isOffTopicShopProductQuestion,
  parseShopProductQuestionAnswer,
  shopProductQuestionSystemPrompt,
} from "../app/lib/shop/product-question.ts";
import {
  buildProductQuestionUsageUnavailableStatus,
  getProductQuestionUsageStatus,
  incrementProductQuestionUsage,
  readProductQuestionUsageCount,
} from "../app/lib/billing/product-question-usage.ts";
import { getPlanCapabilities } from "../app/lib/billing/plan-limits.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function createUsageSupabase(rows = []) {
  return {
    store: rows.map((row) => ({ ...row })),
    from(table) {
      assert.equal(table, "product_ai_usage");
      return new UsageQuery(this.store);
    },
  };
}

class UsageQuery {
  constructor(store) {
    this.store = store;
    this.filters = {};
    this.payload = null;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters[field] = value;
    return this;
  }

  maybeSingle() {
    const row = this.store.find((item) =>
      Object.entries(this.filters).every(([field, value]) => item[field] === value),
    );
    return { data: row ? { used_count: row.used_count } : null, error: null };
  }

  upsert(payload) {
    this.payload = payload;
    return this;
  }

  single() {
    const index = this.store.findIndex((item) => item.user_id === this.payload.user_id && item.month_key === this.payload.month_key);
    if (index >= 0) this.store[index] = { ...this.store[index], ...this.payload };
    else this.store.push({ id: `usage-${this.store.length + 1}`, created_at: "2026-07-01T00:00:00Z", ...this.payload });
    return { data: this.payload, error: null };
  }
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
      recurringConcerns: [],
      knownAvoids: ["chicken"],
      safetyFlags: [],
      missingContext: [],
      summaryBullets: [],
      ...(overrides.derived || {}),
    },
  };
}

test("product question prompt uses a direct, human store-advisor voice", () => {
  assert.match(shopProductQuestionSystemPrompt, /knowledgeable Furvise store advisor/);
  assert.match(shopProductQuestionSystemPrompt, /Assume the question is about this product/);
  assert.match(shopProductQuestionSystemPrompt, /Answer the person's actual question immediately/);
  assert.match(shopProductQuestionSystemPrompt, /Do not use general internet knowledge/);
  assert.match(shopProductQuestionSystemPrompt, /Never invent ingredients, directions, warnings, size, price, availability/);
  assert.match(shopProductQuestionSystemPrompt, /detail needed for the answer is unavailable/);
  assert.match(shopProductQuestionSystemPrompt, /Return sections for schema compatibility/);
  assert.match(shopProductQuestionSystemPrompt, /make directAnswer the only shopper-facing answer/);
  assert.match(shopProductQuestionSystemPrompt, /Keep a routine product answer under 120 words when practical/);
  assert.match(shopProductQuestionSystemPrompt, /multi-part or safety-sensitive question needs it for a sound decision/);
  assert.match(shopProductQuestionSystemPrompt, /safetyNote must exactly match the requiredSafetyNote/);
  assert.doesNotMatch(shopProductQuestionSystemPrompt, /provided data|catalog signals|verified fields|ingredientsVerified|If you want, I can/i);
});

test("product question fallback states missing ingredient certainty honestly", () => {
  const product = staticRealProducts.find((item) => item.id === "furminator-cat-deshedding-tool");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "cat brush",
    question: "What should I check on the label?",
  });

  assert.match(answer.answer, /full ingredient list/i);
  assert.match(answer.answer, /check the package before buying/i);
  assert.match(answer.sections.directAnswer, /full ingredient list/i);
  assert.deepEqual(answer.sections.checkBeforeBuying.slice(0, 3), [
    "Full ingredient list",
    "Directions for how often to use it",
    "Warnings about irritated or broken skin",
  ]);
  assert.match(answer.sections.howToUse, /Follow the label directions/i);
  assert.match(answer.sections.whenToAskVet, /Discontinue use if redness or irritation appears/i);
  assert.match(answer.sections.bottomLine, /Bottom line:/);
  assert.match(answer.whatIsMissing.join(" "), /Full ingredient list/);
  assert.doesNotMatch(answer.whatIsMissing.join(" "), /Directions for use/);
  assert.doesNotMatch(answer.whatIsMissing.join(" "), /Warnings from the product label/);
  assert.equal(answer.confidence, "low");
  assert.equal(answer.safetyNote, "Based on what you've saved about Rocky. Not a substitute for veterinary or professional advice.");
  assert.doesNotMatch(answer.answer, /fragrance|essential oils|dyes|oatmeal|aloe/i);
  assert.doesNotMatch(answer.answer, /What Furvise knows|What is missing|provided data|signals|catalog tags|ingredientsVerified|\bAI\b/i);
  assert.doesNotMatch(answer.answer, /\u2014|guaranteed|safe|best|vet-approved|cure/i);
});

test("product question watch fallback uses verified warnings when present", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "itchy paws shampoo",
    question: "What should I watch for?",
  });

  assert.match(answer.answer, /I would watch for label warnings/i);
  assert.match(answer.sections.directAnswer, /watch for label warnings/i);
  assert.match(answer.sections.howToUse, /90 seconds/);
  assert.match(answer.sections.whenToAskVet, /open sores|worsening irritation/i);
  assert.match(answer.sections.bottomLine, /Bottom line:/);
  assert.match(answer.answer, /Use only on coat and skin/);
  assert.match(answer.answer, /eye contact/);
  assert.deepEqual(answer.whatIsMissing, []);
  assert.doesNotMatch(answer.answer, /What Furvise knows|What is missing|provided data|signals|catalog tags|ingredientsVerified|\bAI\b/i);
  assert.doesNotMatch(answer.answer, /\u2014|guaranteed|safe|best|vet-approved|cure/i);
});

test("product question fallback gives rich itchy paws buyer guidance", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "sensitive skin shampoo",
    question: "is this good if my dog has itchy paws",
  });

  assert.match(answer.sections.directAnswer, /worth considering as a gentle bath-time option/i);
  assert.match(answer.sections.directAnswer, /itchy paws/i);
  assert.match(answer.sections.directAnswer, /Some pets can still react to shampoos/i);
  assert.match(answer.sections.directAnswer, /more red, itchy, or uncomfortable/i);
  assert.doesNotMatch(answer.sections.directAnswer, /Probably yes|should be fine|should be okay|helps itchy paws|safe for itchy paws|product data|verified fields/i);
  assert.match(answer.sections.whyItMayFit, /dirt, dryness, or general coat and skin irritation/i);
  assert.match(answer.sections.whyItMayFit, /allergies, fleas, infection, pain, or a food reaction/i);
  assert.deepEqual(answer.sections.checkBeforeBuying.slice(0, 3), [
    "Listed ingredients: Purified water, Renewable plant-derived and coconut-based cleansers, Colloidal oatmeal, Aloe vera, Vitamins A, B, D, and E, and Panthenol",
    "Directions for how often to use it",
    "Warnings about irritated or broken skin",
  ]);
  assert.match(answer.sections.howToUse, /90 seconds/);
  assert.match(answer.sections.whenToAskVet, /open sores, swelling, bleeding, strong odor, constant licking, pain, or worsening irritation/i);
  assert.match(answer.sections.bottomLine, /mild itchy-paw grooming support/i);
  assert.equal(answer.safetyNote, "Based on what you've saved about Rocky. Not a substitute for veterinary or professional advice.");
  assert.ok(answer.answer.split(/\s+/).length <= 70);
  const visibleAnswerCopy = [
    answer.answer,
    answer.sections.directAnswer,
    answer.sections.whyItMayFit,
    answer.sections.checkBeforeBuying.join(" "),
    answer.sections.howToUse,
    answer.sections.whenToAskVet,
    answer.sections.bottomLine,
    answer.safetyNote,
    answer.whatFurviseKnows.join(" "),
    answer.whatIsMissing.join(" "),
  ].join(" ");
  assert.doesNotMatch(
    visibleAnswerCopy,
    /\u2014|catalog match|region verified|curated|signals|ingredientsVerified|\bAI\b|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i,
  );
});

test("product question fallback preserves uncertainty for dental product and itchy paws", () => {
  const product = staticRealProducts.find((item) => item.id === "greenies-original-regular-dog-dental-treats");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "dental treats",
    question: "If I give this to my dog who has itchy paws, will it make it worse or is it just good for dental?",
  });

  assert.match(answer.sections.directAnswer, /No, not for itchy paws/i);
  assert.match(answer.sections.directAnswer, /dental treat/i);
  assert.match(answer.sections.directAnswer, /meant for chewing and dental care, not skin or paw irritation/i);
  assert.match(answer.sections.directAnswer, /grooming, allergy, flea, or vet-care options/i);
  assert.ok(answer.sections.directAnswer.split(/\s+/).length <= 90);
  assert.doesNotMatch(answer.sections.directAnswer, /should be fine|should be okay|will not make/i);
  assert.doesNotMatch(answer.sections.directAnswer, /Feed one dental treat|provide fresh drinking water|Regular-size adult dog dental treat/i);
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback answers shampoo and sensitive teeth casually", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "is this product suitable for washing my dog if he has sensitive teeth",
  });

  assert.match(answer.sections.directAnswer, /^Yes, as a shampoo\./);
  assert.match(answer.sections.directAnswer, /will not help sensitive teeth because it is not a dental product/i);
  assert.match(answer.sections.directAnswer, /I'd treat it as a grooming product only/i);
  assert.match(answer.sections.directAnswer, /keep it away from the mouth and eyes/i);
  assert.doesNotMatch(answer.sections.directAnswer, /even if he has no teeth/i);
  assert.doesNotMatch(answer.sections.directAnswer, /Probably yes|product data|verified fields|Furvise cannot determine/i);
});

test("product question fallback answers shampoo and no-teeth questions without extra weird phrasing", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "is this good for dog with no teeths or i should not use it",
  });

  assert.match(answer.sections.directAnswer, /^Yes, as a shampoo\./);
  assert.match(answer.sections.directAnswer, /Teeth do not really matter here because this is used on the coat and skin, not chewed or eaten\./);
  assert.match(answer.sections.directAnswer, /Keep it away from the eyes and mouth, rinse well, and stop using it if irritation appears\./);
  assert.doesNotMatch(answer.sections.directAnswer, /sensitive teeth|even if he has no teeth|will not help/i);
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback can show ingredient details when asked", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "What ingredients are in this?",
  });

  assert.match(answer.sections.directAnswer, /listed ingredients/i);
  assert.match(answer.sections.directAnswer, /Purified water/i);
  assert.match(answer.sections.directAnswer, /Colloidal oatmeal/i);
  assert.match(answer.sections.directAnswer, /Aloe vera/i);
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback answers food without-water questions safely", () => {
  const product = staticRealProducts.find((item) => item.id === "hills-science-diet-adult-dog-chicken-barley");
  assert.ok(product);
  assert.equal(isOffTopicShopProductQuestion("can i give it without water"), false);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "food",
    question: "can i give it without water",
  });

  assert.match(answer.sections.directAnswer, /serve dry pet food dry/i);
  assert.match(answer.sections.directAnswer, /should not replace water/i);
  assert.match(answer.sections.directAnswer, /Keep fresh water available for Rocky whenever eating/i);
  assert.match(answer.sections.directAnswer, /package directions/i);
  assert.match(answer.sections.directAnswer, /transition gradually/i);
  assert.match(answer.sections.directAnswer, /trouble chewing, swallowing, vomiting, or a medical diet plan/i);
  assert.equal(answer.safetyNote, "Based on what you've saved about Rocky. Not a substitute for veterinary or professional advice.");
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question classifier accepts broad buyer doubts", () => {
  assert.equal(classifyShopProductQuestionIntent("will my dog like it or taste will be weird to him").intent, "product_related");
  assert.equal(isOffTopicShopProductQuestion("will my dog like it or taste will be weird to him"), false);
  assert.equal(classifyShopProductQuestionIntent("can i give it without water").intent, "product_related");
  assert.equal(classifyShopProductQuestionIntent("can German Shepherd use this").intent, "product_adjacent");
  assert.equal(classifyShopProductQuestionIntent("is Rocky too small for this").intent, "product_adjacent");
  assert.equal(classifyShopProductQuestionIntent("is this better than his current food").intent, "product_related");
  assert.equal(classifyShopProductQuestionIntent("will this make itching worse").intent, "product_related");
  assert.equal(classifyShopProductQuestionIntent("my rocky hates lamb").intent, "product_related");
  assert.equal(classifyShopProductQuestionIntent("taste will be weird").intent, "product_related");
  assert.equal(classifyShopProductQuestionIntent("with food or without food").intent, "product_related");

  const mixed = classifyShopProductQuestionIntent("is rocky good boy and can he eat this");
  assert.equal(mixed.intent, "product_adjacent");
  assert.equal(mixed.hasOffTopicPart, true);
  assert.equal(isOffTopicShopProductQuestion("is rocky good boy and can he eat this"), false);

  assert.equal(classifyShopProductQuestionIntent("is Rocky a good dog").intent, "clearly_off_topic");
  assert.equal(classifyShopProductQuestionIntent("tell me a joke").intent, "clearly_off_topic");
  assert.equal(classifyShopProductQuestionIntent("what is the weather").intent, "clearly_off_topic");
  assert.equal(classifyShopProductQuestionIntent("write me a resume").intent, "clearly_off_topic");
});

test("product question fallback answers taste and like-it doubts", () => {
  const product = staticRealProducts.find((item) => item.id === "hills-science-diet-adult-dog-chicken-barley");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "food",
    question: "will my dog like it or taste will be weird to him",
  });

  assert.match(answer.sections.directAnswer, /Rocky may or may not like it/i);
  assert.match(answer.sections.directAnswer, /taste depends on what Rocky is used to eating/i);
  assert.match(answer.sections.directAnswer, /small amount mixed into the current food/i);
  assert.match(answer.sections.directAnswer, /eats normally, picks around it, or gets an upset stomach/i);
  assert.doesNotMatch(answer.sections.directAnswer, /cannot answer|could not answer|Probably yes|provided data|schema|signals|verified fields/i);
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback answers messy ingredient preference doubts", () => {
  const product = staticRealProducts.find((item) => item.id === "hills-science-diet-adult-dog-chicken-barley");
  assert.ok(product);

  const lambAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "food",
    question: "my rocky hates lamb",
  });
  assert.match(lambAnswer.sections.directAnswer, /I do not see lamb in the listed ingredients/i);
  assert.match(lambAnswer.sections.directAnswer, /check the current label before buying/i);
  assert.match(lambAnswer.sections.directAnswer, /may still dislike the taste/i);

  const chickenAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "food",
    question: "he hates chicken",
  });
  assert.match(chickenAnswer.sections.directAnswer, /already avoids chicken/i);
  assert.match(chickenAnswer.sections.directAnswer, /listed ingredients include chicken/i);
  assert.match(chickenAnswer.sections.directAnswer, /compare a different option/i);

  const combined = `${lambAnswer.sections.directAnswer} ${chickenAnswer.sections.directAnswer}`;
  assert.doesNotMatch(combined, /cannot answer|could not answer|Probably yes|provided data|schema|signals|verified fields/i);
  assert.doesNotMatch(combined, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback bridges mixed off-topic and product questions", () => {
  const product = staticRealProducts.find((item) => item.id === "hills-science-diet-adult-dog-chicken-barley");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "food",
    question: "is rocky good boy and can he eat this",
  });

  assert.match(answer.sections.directAnswer, /I can't judge whether Rocky is a good dog from here/i);
  assert.match(answer.sections.directAnswer, /for the product part: this is dog food/i);
  assert.match(answer.sections.directAnswer, /check the label, introduce it slowly/i);
  assert.match(answer.sections.directAnswer, /stomach upset or itching/i);
  assert.doesNotMatch(answer.sections.directAnswer, /cannot answer|could not answer|Probably yes|provided data|schema|signals|verified fields/i);
  assert.doesNotMatch(answer.sections.directAnswer, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback answers size age compare and symptom doubts", () => {
  const food = staticRealProducts.find((item) => item.id === "hills-science-diet-adult-dog-chicken-barley");
  const dental = staticRealProducts.find((item) => item.id === "greenies-original-regular-dog-dental-treats");
  assert.ok(food);
  assert.ok(dental);

  const sizeAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: dental,
    query: "dental treats",
    question: "is Rocky too small for this",
  });
  assert.match(sizeAnswer.sections.directAnswer, /Check the size and weight range first/i);
  assert.match(sizeAnswer.sections.directAnswer, /25 to 50 lb/i);
  assert.match(sizeAnswer.sections.directAnswer, /Supervise chewing/i);

  const ageAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: food,
    query: "food",
    question: "is this okay for senior dog",
  });
  assert.match(ageAnswer.sections.directAnswer, /life-stage and feeding directions/i);
  assert.match(ageAnswer.sections.directAnswer, /listed for adult pets/i);
  assert.match(ageAnswer.sections.directAnswer, /age, weight, and health context/i);

  const compareAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: food,
    query: "food",
    question: "is this better than his current food",
  });
  assert.match(compareAnswer.sections.directAnswer, /may be worth comparing/i);
  assert.match(compareAnswer.sections.directAnswer, /ingredients, calories, feeding directions, transition guidance/i);
  assert.match(compareAnswer.sections.directAnswer, /anything Rocky should avoid/i);

  const symptomAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: food,
    query: "food",
    question: "will this make itching worse",
  });
  assert.match(symptomAnswer.sections.directAnswer, /can't know whether Rocky will react/i);
  assert.match(symptomAnswer.sections.directAnswer, /Check the ingredients/i);
  assert.match(symptomAnswer.sections.directAnswer, /vomiting, diarrhea, stool changes, itching, scratching, or licking/i);

  const combined = [
    sizeAnswer.sections.directAnswer,
    ageAnswer.sections.directAnswer,
    compareAnswer.sections.directAnswer,
    symptomAnswer.sections.directAnswer,
  ].join(" ");
  assert.doesNotMatch(combined, /cannot answer|could not answer|Probably yes|provided data|schema|signals|verified fields/i);
  assert.doesNotMatch(combined, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback answers category use questions safely", () => {
  const shampoo = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  const dental = staticRealProducts.find((item) => item.id === "greenies-original-regular-dog-dental-treats");
  assert.ok(shampoo);
  assert.ok(dental);

  const shampooAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: shampoo,
    query: "shampoo",
    question: "How do I use it?",
  });
  assert.match(shampooAnswer.sections.directAnswer, /Use it on the coat and skin/i);
  assert.match(shampooAnswer.sections.directAnswer, /keep it away from the eyes and mouth/i);
  assert.match(shampooAnswer.sections.directAnswer, /rinse well/i);
  assert.match(shampooAnswer.sections.directAnswer, /stop using it if irritation appears/i);

  const dentalAnswer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: dental,
    query: "dental treats",
    question: "How often should I use it?",
  });
  assert.match(dentalAnswer.sections.directAnswer, /Feed one dental treat per day/i);
  assert.match(dentalAnswer.sections.directAnswer, /Supervise chewing/i);
  assert.match(dentalAnswer.sections.directAnswer, /correct size or weight range/i);
  assert.match(dentalAnswer.sections.directAnswer, /fresh water/i);
  assert.match(dentalAnswer.sections.directAnswer, /not use it as a replacement for professional dental care/i);
  assert.doesNotMatch(`${shampooAnswer.sections.directAnswer} ${dentalAnswer.sections.directAnswer}`, /\u2014|guaranteed|\bsafe\b|best|vet-approved|\bcure\b/i);
});

test("product question fallback avoids verification language for broad fit questions", () => {
  const product = staticRealProducts.find((item) => item.id === "furminator-cat-deshedding-tool");
  assert.ok(product);
  assert.equal(product.ingredientsVerified, false);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory({ pet: { species: "cat" } }),
    product,
    query: "cat brush",
    question: "Is this a good grooming option?",
  });

  assert.doesNotMatch(answer.answer, /verified ingredient|full verified ingredient|ingredient details|ingredientsVerified/i);
  assert.doesNotMatch(answer.answer, /region-verified|curated|catalog match|matches species and search|price not provided/i);
  assert.match(answer.sections.directAnswer, /grooming brush/i);
  assert.match(answer.sections.checkBeforeBuying.join(" "), /Full ingredient list/);
});

test("product question fallback answers breed suitability naturally", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory({ pet: { breed: "German Shepherd" } }),
    product,
    query: "dog shampoo",
    question: "Can this be used on a German Shepherd?",
  });

  assert.match(answer.answer, /listed for dogs/i);
  assert.match(answer.answer, /Check the label before use and stop if irritation appears\./);
  assert.match(answer.sections.directAnswer, /listed for dogs/i);
  assert.match(answer.sections.whenToAskVet, /open sores|worsening irritation/i);
  assert.doesNotMatch(answer.answer, /Because ingredient details|ingredient details are fully verified|region-verified|curated|catalog match|matches species and search|price not provided/i);
});
test("product question parser blocks unsafe or internal copy", () => {
  const valid = {
    answer: "Furvise does not have the full verified ingredient list for this product yet. Review the label before using it.",
    sections: {
      directAnswer: "Furvise does not have the full verified ingredient list for this product yet. Review the label before using it.",
      whyItMayFit: "It may fit a grooming search when the label directions fit Rocky.",
      checkBeforeBuying: ["Full ingredient list", "Directions for how often to use it", "Warnings about irritated or broken skin"],
      howToUse: "Furvise does not have verified label directions yet, so follow the package directions.",
      whenToAskVet: "Ask a veterinarian if symptoms are severe, worsening, painful, recurring, or do not improve with routine care.",
      bottomLine: "Bottom line: compare this product only after checking the label.",
    },
    whatFurviseKnows: ["Listed as a grooming shampoo."],
    whatIsMissing: ["Full verified ingredient list"],
    safetyNote: buildProductQuestionSafetyNote("Rocky"),
    confidence: "low",
  };

  assert.ok(parseShopProductQuestionAnswer(valid, "Rocky"));
  assert.equal(parseShopProductQuestionAnswer({ ...valid, answer: "This is guaranteed safe." }, "Rocky"), null);
  assert.equal(parseShopProductQuestionAnswer({ ...valid, answer: "These catalog signals include itchy_skin." }, "Rocky"), null);
  assert.equal(parseShopProductQuestionAnswer({ ...valid, answer: "The provided data has catalog tags." }, "Rocky"), null);
  assert.equal(parseShopProductQuestionAnswer({ ...valid, answer: "ingredientsVerified is false." }, "Rocky"), null);
  assert.equal(parseShopProductQuestionAnswer({ ...valid, answer: "AI found this." }, "Rocky"), null);
  assert.equal(parseShopProductQuestionAnswer({ ...valid, safetyNote: "Wrong" }, "Rocky"), null);
  assert.equal(hasForbiddenProductQuestionCopy("This is the best option."), true);
});

test("product question parser keeps direct default answer compact", () => {
  const longDirectAnswer = Array.from({ length: 12 }, () =>
    "This product may be compared only after checking the label and watching how Rocky tolerates it.",
  ).join(" ");
  const parsed = parseShopProductQuestionAnswer(
    {
      answer: longDirectAnswer,
      sections: {
        directAnswer: longDirectAnswer,
        whyItMayFit: "It may fit when the product type matches the shopping need.",
        checkBeforeBuying: ["Full ingredient list", "Directions for how often to use it"],
        howToUse: "Follow the package directions.",
        whenToAskVet: "Ask a veterinarian if symptoms are severe, worsening, painful, recurring, or do not improve with routine care.",
        bottomLine: "Bottom line: compare this product only after checking the label.",
      },
      whatFurviseKnows: ["Listed as a product."],
      whatIsMissing: ["Full verified ingredient list"],
      safetyNote: buildProductQuestionSafetyNote("Rocky"),
      confidence: "low",
    },
    "Rocky",
  );

  assert.ok(parsed);
  assert.ok(parsed.sections.directAnswer.split(/\s+/).length <= 90);
});

test("product question parser accepts useful minimal fallback-shaped answers", () => {
  const parsed = parseShopProductQuestionAnswer(
    {
      answer: "Follow the package directions. Keep fresh water available whenever Rocky eats.",
      safetyNote: buildProductQuestionSafetyNote("Rocky"),
    },
    "Rocky",
  );

  assert.ok(parsed);
  assert.equal(parsed.sections.directAnswer, "Follow the package directions. Keep fresh water available whenever Rocky eats.");
  assert.deepEqual(parsed.whatFurviseKnows, []);
  assert.deepEqual(parsed.whatIsMissing, []);
  assert.equal(parsed.confidence, "low");
});

test("product question prompt input does not expose unverified ingredients as verified", () => {
  const product = staticRealProducts.find((item) => item.id === "furminator-cat-deshedding-tool");
  assert.ok(product);
  assert.equal(product.ingredientsVerified, false);
  assert.equal(product.sourceUrl, "https://www.furminator.com/products/tools/deshedding-tools/undercoat-deshedding-tool-small-cat-short-hair");
  assert.equal(product.verificationSource, "brand_page");
  assert.equal(product.enrichmentStatus, "partial");
  assert.equal(product.verifiedIngredients, undefined);

  const promptInput = buildShopProductQuestionPromptInput({
    memory: memory(),
    product,
    query: "shampoo",
    question: "Is this a good grooming option?",
  });

  assert.equal(promptInput.requiredSafetyNote, buildProductQuestionSafetyNote("Rocky"));
  assert.equal(promptInput.product.fullIngredientListAvailable, false);
  assert.equal("ingredientsVerified" in promptInput.product, false);
  assert.deepEqual(promptInput.product.ingredients, []);
  assert.equal(promptInput.product.enrichmentStatus, "partial");
  assert.ok(promptInput.product.productPageUrl);
  assert.ok(promptInput.product.directions);
  assert.ok(promptInput.product.warnings.length > 0);
});


test("product question fallback uses verified directions only when present", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const withDirections = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "How would I use this?",
  });
  assert.match(withDirections.sections.directAnswer, /label directions/i);
  assert.match(withDirections.sections.howToUse, /Follow the label directions/i);
  assert.match(withDirections.answer, /90 seconds/);

  const withoutDirections = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: { ...product, verifiedDirections: undefined },
    query: "shampoo",
    question: "How would I use this?",
  });
  assert.match(withoutDirections.sections.directAnswer, /Follow the package directions/i);
  assert.match(withoutDirections.sections.directAnswer, /Use this shampoo on the coat and skin/i);
  assert.match(withoutDirections.sections.howToUse, /label directions are not available yet, so follow the directions on the package/i);
  assert.doesNotMatch(withoutDirections.answer, /90 seconds/);
});

test("product question fallback uses verified warnings only when present", () => {
  const product = staticRealProducts.find((item) => item.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(product);

  const withWarnings = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "shampoo",
    question: "What should I watch for?",
  });
  assert.match(withWarnings.answer, /watch for label warnings/i);
  assert.match(withWarnings.answer, /Use only on coat and skin/);

  const withoutWarnings = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product: { ...product, verifiedWarnings: undefined },
    query: "shampoo",
    question: "What should I watch for?",
  });
  assert.match(withoutWarnings.answer, /I do not have label warnings/i);
  assert.doesNotMatch(withoutWarnings.answer, /Use only on coat and skin|redness|extra itching/);
});

test("product question fallback does not claim full verification when enrichment is partial", () => {
  const product = staticRealProducts.find((item) => item.id === "furminator-cat-deshedding-tool");
  assert.ok(product);
  assert.equal(product.enrichmentStatus, "partial");

  const answer = buildFallbackShopProductQuestionAnswer({
    memory: memory(),
    product,
    query: "cat brush",
    question: "What info is missing?",
  });

  assert.match(answer.sections.directAnswer, /full product details are not available/i);
  assert.match(answer.whatIsMissing.join(" "), /Full ingredient list/);
  assert.doesNotMatch(answer.answer, /key verified label details|Ingredient details verified|full verification/i);
});

test("product question off-topic guard redirects non-product questions without product advice", () => {
  assert.equal(isOffTopicShopProductQuestion("is Rocky a good dog"), true);
  assert.equal(isOffTopicShopProductQuestion("tell me a joke"), true);
  assert.equal(isOffTopicShopProductQuestion("what is the weather"), true);
  assert.equal(isOffTopicShopProductQuestion("is this good for itchy paws"), false);
  assert.equal(isOffTopicShopProductQuestion("can I use this on my German Shepherd"), false);
  assert.equal(isOffTopicShopProductQuestion("what ingredients are in this"), false);
  assert.equal(isOffTopicShopProductQuestion("will my dog like it or taste will be weird to him"), false);

  const answer = buildOffTopicShopProductQuestionAnswer({ memory: memory() });
  assert.equal(
    answer.sections.directAnswer,
    "This space is for questions about this product, including ingredients, directions, warnings, taste, size, or whether it may fit Rocky.",
  );
  assert.equal(answer.answer, answer.sections.directAnswer);
  assert.deepEqual(answer.whatFurviseKnows, []);
  assert.deepEqual(answer.whatIsMissing, []);
  assert.doesNotMatch(answer.answer, /itchy paws|dental care|shampoo|follow the label directions|medical care/i);
});

test("legacy product question helper mirrors the shared 50-credit allowance", async () => {
  const supabase = createUsageSupabase([{ user_id: "user-1", month_key: "2026-07", used_count: 49 }]);
  const status = await getProductQuestionUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").productsAiMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });

  assert.equal(status.allowed, true);
  assert.equal(status.remaining, 1);
  await incrementProductQuestionUsage({ monthKey: "2026-07", previousCount: status.count, supabase, userId: "user-1" });
  assert.equal(await readProductQuestionUsageCount({ monthKey: "2026-07", supabase, userId: "user-1" }), 50);

  const blocked = await getProductQuestionUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").productsAiMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.match(blocked.gate.message || "", /AI credits/);
});

test("product question route only completes a shared credit after valid AI output", () => {
  const route = read("app/api/shop/product-question/route.ts");
  const explanationRoute = read("app/api/shop/explain-product-fit/route.ts");
  const invalidBranch = route.slice(
    route.indexOf("if (!petId || !productId || !query"),
    route.indexOf("if (body?.interpretation && !interpretation)"),
  );
  const capBranch = route.slice(
    route.indexOf("if (!context.usage.allowed)"),
    route.indexOf("const fallback = ()"),
  );
  const offTopicGuard = route.indexOf('if (questionIntent.intent === "clearly_off_topic")');
  const capCheck = route.indexOf("if (!context.usage.allowed)");
  const providerCall = route.indexOf("runFeatureIntelligence", capCheck);
  const admission = route.indexOf("const generated = await runAdmittedAiOperation", capCheck);
  const usageCompletion = route.indexOf("runWithAiCredit<FeatureIntelligenceResult", admission);

  assert.match(invalidBranch, /Choose a pet, product, and shorter product question/);
  assert.doesNotMatch(invalidBranch, /runWithAiCredit|answerShopProductQuestion|createAiAnalysisProvider/);
  assert.ok(offTopicGuard > -1);
  assert.ok(capCheck > offTopicGuard);
  assert.ok(providerCall > capCheck);
  assert.ok(admission > capCheck && usageCompletion > admission && usageCompletion < providerCall);
  assert.match(route.slice(offTopicGuard, capCheck), /buildOffTopicShopProductQuestionAnswer\(\{ memory \}\)/);
  assert.doesNotMatch(route.slice(offTopicGuard, capCheck), /answerShopProductQuestion|runWithAiCredit/);
  assert.match(capBranch, /status: 402/);
  assert.match(capBranch, /FURVISE_PRODUCT_USAGE_CAP_MESSAGE/);
  assert.doesNotMatch(capBranch, /answerShopProductQuestion|runWithAiCredit/);
  assert.match(explanationRoute, /feature: "product_explanation"/);
});

test("product question usage read errors fall back to honest unavailable state", () => {
  const status = buildProductQuestionUsageUnavailableStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").productsAiMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
  });

  assert.equal(status.allowed, true);
  assert.equal(status.count, 0);
  assert.equal(status.limit, 50);
  assert.equal(status.remaining, 50);
});

test("product question backend retains authentication, filtering, and unified-credit boundaries", () => {
  const route = read("app/api/shop/product-question/route.ts");
  const provider = read("app/lib/ai/provider.ts");
  const openai = read("app/lib/ai/providers/openai.ts");
  const usage = read("app/lib/ai/usage-ledger.ts");
  const migration = read("supabase/migrations/20260727020000_add_unified_ai_credits_and_care_state.sql");

  for (const pattern of [
    /Authentication required\./, /supabase\.auth\.getUser\(token\)/, /buildFurviseContext\(\{/,
    /filterAndRankShopProducts\(\{/, /filtered\.products\.find/, /classifyShopProductQuestionIntent\(question\)/,
    /questionIntent\.intent === "clearly_off_topic"/, /getRemainingAiCredits/, /runWithAiCredit/,
    /feature: "product_question"/, /runFeatureIntelligence/, /buildFallbackShopProductQuestionAnswer/,
  ]) assert.match(route, pattern);
  assert.match(provider, /answerShopProductQuestion\(input: ShopProductQuestionInput\): Promise<ShopProductQuestionAnswer>/);
  assert.match(openai, /async answerShopProductQuestion\(input: ShopProductQuestionInput\)/);
  assert.match(usage, /ai_usage_events/);
  assert.match(migration, /create table if not exists public\.ai_usage_events/);
});
