import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Shop interpretation reuses the existing AI provider abstraction", () => {
  const provider = read("app/lib/ai/provider.ts");
  const openai = read("app/lib/ai/providers/openai.ts");

  assert.match(provider, /interpretShopQuery\(input: ShopQueryInterpretationInput\): Promise<ShopQueryInterpretation>/);
  assert.match(provider, /explainShopProductFit\(input: ShopProductFitExplanationInput\): Promise<ShopProductFitExplanation>/);
  assert.match(openai, /async interpretShopQuery\(input: ShopQueryInterpretationInput\)/);
  assert.match(openai, /async explainShopProductFit\(input: ShopProductFitExplanationInput\)/);
  assert.match(openai, /async answerShopProductQuestion\(input: ShopProductQuestionInput\)/);
  assert.match(openai, /shopQueryInterpretationSystemPrompt/);
  assert.match(openai, /shopQueryInterpretationJsonSchema/);
  assert.match(openai, /shopProductFitExplanationSystemPrompt/);
  assert.match(openai, /shopProductFitExplanationJsonSchema/);
  assert.match(openai, /validateShopQueryInterpretation/);
  assert.match(openai, /ShopQueryInterpretationValidationError/);
  assert.match(openai, /parseShopProductFitExplanation/);
  assert.match(openai, /this\.client\.responses\.create/);
});

test("Shop interpretation API route authenticates and loads pet memory server-side", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  const petMemory = read("app/lib/pet-memory.ts");

  assert.match(route, /Authentication required\./);
  assert.match(route, /supabase\.auth\.getUser\(token\)/);
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /petId,\s+supabase: context\.supabase,\s+userId: context\.userId/s);
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /getAiRuntimeDiagnostics/);
  assert.match(route, /logShopInterpretationDiagnostic/);
  assert.match(route, /classifyShopInterpretationFailure/);
  assert.match(route, /buildFallbackShopQueryInterpretation/);
  assert.match(route, /parseShopQueryInterpretation/);
  assert.match(route, /readCachedShopQueryInterpretation/);
  assert.match(route, /saveShopQueryInterpretationCache/);
  assert.match(route, /getRemainingAiCredits/);
  assert.match(route, /runWithAiCredit/);
  assert.match(route, /feature: "product_query"/);
  assert.match(route, /interpretationSource: "ai"/);
  assert.match(route, /interpretationSource: "cache"/);
  assert.match(route, /interpretationSource: "fallback"/);
  assert.match(route, /applyDeterministicInterpretationFloor/);
  assert.match(route, /hasShopGroomingSynonymIntent/);
  assert.match(route, /shouldApplyGroomingFloor/);
  assert.match(route, /normalizedSearchTerms = shouldApplyGroomingFloor/);
  assert.match(route, /!safetyFlags\.urgentCare/);
  assert.match(route, /!safetyFlags\.medicalTreatmentIntent/);
  assert.match(route, /avoidIngredients = uniqueStrings/);
  assert.match(petMemory, /\.eq\("id", petId\)/);
  assert.match(petMemory, /\.eq\("user_id", userId\)/);
});

test("Shop interpretation usage cap checks cache before spending a fresh AI search", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  const cacheHitBranch = route.slice(route.indexOf("if (cached?.source === \"ai\")"), route.indexOf("if (cached?.source === \"fallback\")"));
  const aiStart = route.indexOf("logShopInterpretationDiagnostic(\"calling AI provider\"");
  const aiBranch = route.slice(aiStart, route.indexOf("} catch (error)", aiStart));
  const fallbackBranch = route.slice(route.indexOf("} catch (error)", aiStart), route.indexOf("async function loadShopInterpretationRequestContext"));

  assert.match(cacheHitBranch, /cached: true/);
  assert.match(cacheHitBranch, /interpretationSource: "cache"/);
  assert.match(cacheHitBranch, /usage: null/);
  assert.doesNotMatch(cacheHitBranch, /createAiAnalysisProvider|runWithAiCredit/);
  assert.match(aiBranch, /runFeatureIntelligence/);
  assert.match(aiBranch, /runWithAiCredit/);
  assert.match(route, /cached: false/);
  assert.match(fallbackBranch, /source: "fallback"/);
  assert.match(fallbackBranch, /fallbackReason: failure\.reason/);
  assert.match(fallbackBranch, /interpretationSource: "fallback"/);
  assert.match(fallbackBranch, /usage/);
  assert.doesNotMatch(fallbackBranch, /completeAiCredit/);
});

test("Shop product fit explanation API authenticates and gates through deterministic filters", () => {
  const route = read("app/api/shop/explain-product-fit/route.ts");
  const productSearch = read("app/lib/shop/product-search.ts");
  const helper = read("app/lib/shop/product-fit-explanation.ts");

  assert.match(route, /Authentication required\./);
  assert.match(route, /supabase\.auth\.getUser\(token\)/);
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /filterAndRankShopProducts\(\{/);
  assert.match(route, /filtered\.products\.find\(\(item\) => item\.id === productId\)/);
  assert.match(route, /This product is no longer available for the selected pet context\./);
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /feature: "product_explanation"/);
  assert.match(route, /buildFallbackShopProductFitExplanation/);
  assert.match(productSearch, /passesShopIngredientVerification/);
  assert.match(helper, /buildVerifiedProductFields/);
});

test("Shop product search logs safe diagnostic counts without private data", () => {
  const productSearch = read("app/lib/shop/product-search.ts");

  assert.match(productSearch, /type ShopSearchDiagnostics/);
  for (const field of [
    "totalProductsLoaded",
    "runtimeSafeProductsCount",
    "selectedCountry",
    "productsAfterCountryFilter",
    "selectedSpecies",
    "productsAfterSpeciesFilter",
    "interpretationCategory",
    "productsAfterQueryMatch",
    "productsAfterAvoidIngredientFilter",
    "productsAfterIngredientsVerifiedFilter",
    "finalResultCount",
    "emptyStateReason",
  ]) {
    assert.match(productSearch, new RegExp(field));
  }
  assert.match(productSearch, /logShopProductSearchDiagnostics/);
  const logFunction = productSearch.slice(
    productSearch.indexOf("function logShopProductSearchDiagnostics"),
    productSearch.indexOf("function isIngestibleShopProduct"),
  );
  assert.doesNotMatch(logFunction, /userId|token|authorization|apiKey|petMemory|recentEntries|savedDetails/);
});

test("Shop page calls interpretation only after submit and keeps query-first rendering", () => {
  const page = read("app/shop/page.tsx");

  assert.match(page, /getCurrentAccessToken/);
  assert.match(page, /fetch\("\/api\/shop\/interpret-query"/);
  assert.match(page, /if \(nextQuery\.length < MIN_SHOP_QUERY_LENGTH \|\| !selectedPetId\) return/);
  assert.doesNotMatch(page, /if \(searchCapReached\) return/);
  assert.match(page, /setSubmittedQuery\(nextQuery\)/);
  assert.match(page, /disabled=\{!canSearch\}/);
  assert.match(page, /You’ve used all of your AI guidance for this month/);
  assert.match(page, /interpretationLoading/);
  assert.match(page, /fetch\("\/api\/shop\/catalog"/);
  assert.match(page, /searchShopProducts\(\{\s+interpretation: activeInterpretation,\s+productCountry,\s+products: catalogProducts/s);
  assert.match(page, /What are you looking for\?/);
});

test("Shop product fit explanation is click-only and cached per page session", () => {
  const page = read("app/shop/page.tsx");
  const submitSearch = page.slice(page.indexOf("function submitSearch"), page.indexOf("function resetInterpretation"));
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));
  const explainHandler = page.slice(page.indexOf("async function explainProductFit"), page.indexOf("async function interpretSubmittedQuery"));

  assert.equal((page.match(/\/api\/shop\/explain-product-fit/g) || []).length, 1);
  assert.doesNotMatch(submitSearch, /\/api\/shop\/explain-product-fit/);
  assert.doesNotMatch(productCard, /fetch\(/);
  assert.match(page, /Why this product\?/);
  assert.doesNotMatch(page, /Why this product may make sense/);
  assert.match(page, /Checking product fit/);
  assert.match(explainHandler, /if \(cached\?\.loading \|\| cached\?\.explanation\) return/);
  assert.match(submitSearch, /setFitExplanationCache\(\{\}\)/);
  assert.match(page, /setSelectedPetId\(event\.target\.value\);[\s\S]*resetInterpretation\(\)/);
  assert.match(page, /function resetInterpretation\(\)[\s\S]*setFitExplanationCache\(\{\}\)/);
  assert.match(page, /buildFitExplanationCacheKey\(\{[\s\S]*petId:[\s\S]*productId:[\s\S]*query/s);
});

test("Shop AI interpretation does not change Results or Ask Furvise product behavior", () => {
  const results = read("app/results/page.tsx");
  const askRoute = read("app/api/ask/route.ts");

  assert.doesNotMatch(results, /ProductCard|Curated product|Region-verified catalog match|Price not provided/);
  assert.doesNotMatch(askRoute, /interpretShopQuery|shopQueryInterpretation|interpret-query|explainShopProductFit|explain-product-fit|answerShopProductQuestion|product-question/);
});

test("Shop product explanation route gates eligibility before calling AI and never spends interpretation usage", () => {
  const route = read("app/api/shop/explain-product-fit/route.ts");
  const filtering = route.indexOf("const filtered = filterAndRankShopProducts");
  const productLookup = route.indexOf("const product = filtered.products.find", filtering);
  const unavailable = route.indexOf("This product is no longer available for the selected pet context", productLookup);
  const provider = route.indexOf("runFeatureIntelligence", unavailable);

  assert.ok(filtering > -1);
  assert.ok(productLookup > filtering);
  assert.ok(unavailable > productLookup);
  assert.ok(provider > unavailable);
  assert.doesNotMatch(route, /getProductAiUsageStatus|incrementProductAiUsage|product_ai_usage/);
});

test("Shop product explanation remains click-only from page source", () => {
  const page = read("app/shop/page.tsx");
  const shopResults = page.slice(page.indexOf("function ShopResults"), page.indexOf("function ProductCard"));
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));
  const explainHandler = page.slice(page.indexOf("async function explainProductFit"), page.indexOf("async function interpretSubmittedQuery"));

  assert.equal((page.match(/fetch\("\/api\/shop\/explain-product-fit"/g) || []).length, 1);
  assert.doesNotMatch(shopResults, /fetch\("\/api\/shop\/explain-product-fit"/);
  assert.doesNotMatch(productCard, /fetch\("\/api\/shop\/explain-product-fit"/);
  assert.match(productCard, /onClick=\{openWhyPanel\}/);
  assert.match(productCard, /function openWhyPanel\(\)[\s\S]*onExplain\(\);/);
  assert.match(explainHandler, /if \(cached\?\.loading \|\| cached\?\.explanation\) return/);
});
