import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackShopQueryInterpretation,
  getShopGroomingSynonymSearchTerms,
  getShopSkinGroomingSearchTerms,
  isVagueShopQueryWithoutSignal,
  parseShopQueryInterpretation,
  shopQueryInterpretationJsonSchema,
  validateShopQueryInterpretation,
  shopQueryInterpretationSystemPrompt,
} from "../app/lib/shop-query.ts";

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

function validInterpretation(overrides = {}) {
  return {
    category: "Grooming",
    species: "dog",
    queryText: "shampoo",
    normalizedSearchTerms: ["shampoo"],
    explicitConstraints: {
      avoidIngredients: [],
      requiredIngredients: [],
      lifeStage: null,
      productForm: "shampoo",
      brand: null,
      budget: null,
      country: "US",
    },
    safetyFlags: {
      urgentCare: false,
      medicalTreatmentIntent: false,
    },
    confidence: "high",
    ...overrides,
  };
}

test("Shop query interpretation schema uses strict bounded enums", () => {
  assert.deepEqual(shopQueryInterpretationJsonSchema.properties.category.enum, [
    "Itchy skin",
    "Sensitive stomach",
    "Picky eating",
    "Weight management",
    "General wellness",
    "Grooming",
    "Other",
  ]);
  assert.deepEqual(shopQueryInterpretationJsonSchema.properties.species.enum, ["dog", "cat", "unknown"]);
  assert.deepEqual(shopQueryInterpretationJsonSchema.properties.confidence.enum, ["low", "medium", "high"]);

  assert.equal(parseShopQueryInterpretation(validInterpretation())?.category, "Grooming");
  assert.equal(parseShopQueryInterpretation(validInterpretation({ category: "Skin care" })), null);
  assert.equal(parseShopQueryInterpretation(validInterpretation({ species: "horse" })), null);
  assert.equal(parseShopQueryInterpretation(validInterpretation({ confidence: "certain" })), null);
  const missingFields = validInterpretation();
  delete missingFields.safetyFlags;
  assert.equal(parseShopQueryInterpretation(missingFields), null);

  const validation = validateShopQueryInterpretation({
    ...validInterpretation(),
    category: "Skin care",
    explicitConstraints: {
      ...validInterpretation().explicitConstraints,
      productForm: undefined,
    },
  });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /category must be one of/);
  assert.match(validation.errors.join("\n"), /explicitConstraints\.productForm must be null or a string/);
});

test("Shop query prompt is interpretation-only and forbids product claims", () => {
  assert.match(shopQueryInterpretationSystemPrompt, /interpret only/i);
  assert.match(shopQueryInterpretationSystemPrompt, /Do not recommend products/i);
  assert.match(shopQueryInterpretationSystemPrompt, /Do not claim any catalog product exists/i);
  assert.match(shopQueryInterpretationSystemPrompt, /suitable, safe, available/i);
  assert.match(shopQueryInterpretationSystemPrompt, /No best product/i);
  assert.doesNotMatch(JSON.stringify(validInterpretation()), /best product|suitable|safe for your pet|catalog product exists/i);
});

test("fallback classifies common Shop queries without recommending products", () => {
  const itchyShampoo = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "shampoo for itchy paws",
  });
  assert.ok(["Itchy skin", "Grooming"].includes(itchyShampoo.category));
  assert.ok(itchyShampoo.normalizedSearchTerms.includes("shampoo"));
  assert.ok(itchyShampoo.normalizedSearchTerms.includes("itchy"));
  assert.ok(itchyShampoo.normalizedSearchTerms.includes("paws"));

  const dentalTreats = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "dental treats",
  });
  assert.ok(["General wellness", "Other"].includes(dentalTreats.category));
  assert.ok(dentalTreats.normalizedSearchTerms.includes("dental"));
  assert.ok(dentalTreats.normalizedSearchTerms.includes("treats"));
  assert.equal(dentalTreats.safetyFlags.medicalTreatmentIntent, false);

  const chickenFree = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "chicken-free food",
  });
  assert.ok(chickenFree.explicitConstraints.avoidIngredients.includes("chicken"));

  assert.equal(buildFallbackShopQueryInterpretation({ memory: memory(), query: "food for sensitive stomach" }).category, "Sensitive stomach");
  assert.equal(buildFallbackShopQueryInterpretation({ memory: memory(), query: "weight management food" }).category, "Weight management");
  assert.equal(buildFallbackShopQueryInterpretation({ memory: memory(), query: "grooming wipes" }).category, "Grooming");
});

test("fallback handles explicit species conflict and urgent shopping intent safely", () => {
  const catQueryForDog = buildFallbackShopQueryInterpretation({
    memory: memory({ pet: { species: "dog" } }),
    productCountry: "US",
    query: "cat shampoo",
  });
  assert.equal(catQueryForDog.species, "cat");
  assert.equal(catQueryForDog.explicitConstraints.productForm, "shampoo");

  const urgent = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "my dog is struggling to breathe, what product should I buy?",
  });
  assert.equal(urgent.safetyFlags.urgentCare, true);
  assert.equal(urgent.confidence, "medium");
});

test("fallback maps vague grooming and fur language to Grooming search terms", () => {
  const hairs = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "something for hairs",
  });
  assert.equal(hairs.category, "Grooming");
  assert.ok(hairs.normalizedSearchTerms.includes("grooming"));
  assert.ok(hairs.normalizedSearchTerms.includes("brush"));
  assert.ok(hairs.normalizedSearchTerms.includes("comb"));

  const fur = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "fur",
  });
  assert.equal(fur.category, "Grooming");
  assert.ok(fur.normalizedSearchTerms.includes("grooming"));

  const bathTerms = getShopGroomingSynonymSearchTerms("bath");
  assert.ok(bathTerms.includes("shampoo"));
  assert.ok(bathTerms.includes("wash"));

  const smells = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "dog smells",
  });
  assert.equal(smells.category, "Grooming");
  assert.ok(smells.normalizedSearchTerms.includes("shampoo"));
  assert.ok(smells.normalizedSearchTerms.includes("wipes"));
});

test("urgent or medical safety intent overrides grooming synonym category floor", () => {
  const urgent = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "fur emergency",
  });
  assert.equal(urgent.safetyFlags.urgentCare, true);
  assert.notEqual(urgent.category, "Grooming");

  const medical = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "wash to cure infection",
  });
  assert.equal(medical.safetyFlags.medicalTreatmentIntent, true);
  assert.notEqual(medical.category, "Grooming");
});

test("vague Shop query pre-validation blocks only queries without shopping signals", () => {
  for (const query of [
    "anything",
    "something",
    "stuff",
    "things",
    "product",
    "products",
    "help",
    "item",
    "items",
    "idk",
    "i don't know",
    "not sure",
  ]) {
    assert.equal(isVagueShopQueryWithoutSignal(query), true, `${query} should be blocked as vague`);
  }

  for (const query of [
    "shampoo",
    "sensitive skin shampoo",
    "dental treats",
    "chicken-free food",
    "grooming wipes",
    "flea comb",
    "something for hair",
    "something for fur",
    "dog smells",
    "itchy paws shampoo",
  ]) {
    assert.equal(isVagueShopQueryWithoutSignal(query), false, `${query} should be allowed`);
  }
});

test("fallback maps something for itching paws to skin and grooming search signals", () => {
  assert.equal(isVagueShopQueryWithoutSignal("something for itching paws"), false);

  const interpretation = buildFallbackShopQueryInterpretation({
    memory: memory(),
    productCountry: "US",
    query: "something for itching paws",
  });
  assert.equal(interpretation.category, "Itchy skin");
  for (const term of ["itchy", "skin", "grooming", "shampoo", "sensitive skin shampoo", "paw"]) {
    assert.ok(interpretation.normalizedSearchTerms.includes(term), term);
  }
  assert.deepEqual(getShopSkinGroomingSearchTerms("something for itching paws"), [
    "itchy",
    "skin",
    "grooming",
    "shampoo",
    "sensitive skin shampoo",
    "paw",
  ]);
});
