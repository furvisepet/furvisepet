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
  assert.match(openai, /shopQueryInterpretationSystemPrompt/);
  assert.match(openai, /shopQueryInterpretationJsonSchema/);
  assert.match(openai, /shopProductFitExplanationSystemPrompt/);
  assert.match(openai, /shopProductFitExplanationJsonSchema/);
  assert.match(openai, /parseShopQueryInterpretation/);
  assert.match(openai, /parseShopProductFitExplanation/);
  assert.match(openai, /this\.client\.responses\.create/);
});

test("Shop interpretation API route authenticates and loads pet memory server-side", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  const petMemory = read("app/lib/pet-memory.ts");

  assert.match(route, /Authentication required\./);
  assert.match(route, /supabase\.auth\.getUser\(token\)/);
  assert.match(route, /loadPetMemoryContext\(\{/);
  assert.match(route, /petId,\s+supabase: context\.supabase,\s+userId: context\.userId/s);
  assert.match(route, /createAiAnalysisProvider\(\)/);
  assert.match(route, /buildFallbackShopQueryInterpretation/);
  assert.match(route, /parseShopQueryInterpretation/);
  assert.match(route, /readCachedShopQueryInterpretation/);
  assert.match(route, /saveShopQueryInterpretationCache/);
  assert.match(route, /getShopSearchUsageStatus/);
  assert.match(route, /incrementShopSearchUsage/);
  assert.match(route, /limitReached: true/);
  assert.match(petMemory, /\.eq\("id", petId\)/);
  assert.match(petMemory, /\.eq\("user_id", userId\)/);
});

test("Shop interpretation usage cap checks cache before spending a fresh AI search", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  const cacheHitBranch = route.slice(route.indexOf("const cached = await readCachedShopQueryInterpretation"), route.indexOf("if (!context.usage.allowed)"));
  const aiBranch = route.slice(route.indexOf("const provider = createAiAnalysisProvider"), route.indexOf("} catch (error)"));
  const fallbackBranch = route.slice(route.indexOf("} catch (error)"), route.indexOf("async function loadShopInterpretationRequestContext"));

  assert.match(cacheHitBranch, /cached: true/);
  assert.match(cacheHitBranch, /usage: context\.usage/);
  assert.doesNotMatch(cacheHitBranch, /createAiAnalysisProvider|incrementShopSearchUsage/);
  assert.match(aiBranch, /provider\.interpretShopQuery/);
  assert.match(aiBranch, /incrementShopSearchUsage/);
  assert.match(aiBranch, /cached: false/);
  assert.match(fallbackBranch, /source: "fallback"/);
  assert.match(fallbackBranch, /usage: context\.usage/);
  assert.doesNotMatch(fallbackBranch, /incrementShopSearchUsage/);
});

test("Shop product fit explanation API authenticates and gates through deterministic filters", () => {
  const route = read("app/api/shop/explain-product-fit/route.ts");
  const productSearch = read("app/lib/shop/product-search.ts");
  const helper = read("app/lib/shop/product-fit-explanation.ts");

  assert.match(route, /Authentication required\./);
  assert.match(route, /supabase\.auth\.getUser\(token\)/);
  assert.match(route, /loadPetMemoryContext\(\{/);
  assert.match(route, /filterAndRankShopProducts\(\{/);
  assert.match(route, /filtered\.products\.find\(\(item\) => item\.id === productId\)/);
  assert.match(route, /This product is no longer available for the selected pet context\./);
  assert.match(route, /createAiAnalysisProvider\(\)/);
  assert.match(route, /explainShopProductFit/);
  assert.match(route, /buildFallbackShopProductFitExplanation/);
  assert.match(productSearch, /passesShopIngredientVerification/);
  assert.match(helper, /buildVerifiedProductFields/);
});

test("Shop page calls interpretation only after submit and keeps query-first rendering", () => {
  const page = read("app/shop/page.tsx");

  assert.match(page, /getCurrentAccessToken/);
  assert.match(page, /fetch\("\/api\/shop\/interpret-query"/);
  assert.match(page, /if \(nextQuery\.length < MIN_SHOP_QUERY_LENGTH \|\| !selectedPetId\) return/);
  assert.match(page, /setSubmittedQuery\(nextQuery\)/);
  assert.match(page, /Shop searches: \{usage\.count\} \/ \{usage\.limit\} used this month/);
  assert.match(page, /Monthly Shop search limit reached/);
  assert.match(page, /interpretationLoading/);
  assert.match(page, /searchStaticRealShopProducts\(\{\s+interpretation: activeInterpretation/s);
  assert.match(page, /What are you shopping for\?/);
});

test("Shop product fit explanation is click-only and cached per page session", () => {
  const page = read("app/shop/page.tsx");
  const submitSearch = page.slice(page.indexOf("function submitSearch"), page.indexOf("function resetInterpretation"));
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));
  const explainHandler = page.slice(page.indexOf("async function explainProductFit"), page.indexOf("async function interpretSubmittedQuery"));

  assert.equal((page.match(/\/api\/shop\/explain-product-fit/g) || []).length, 1);
  assert.doesNotMatch(submitSearch, /\/api\/shop\/explain-product-fit/);
  assert.doesNotMatch(productCard, /fetch\(/);
  assert.match(page, /Why this may fit/);
  assert.match(page, /Checking saved context/);
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
  assert.doesNotMatch(askRoute, /interpretShopQuery|shopQueryInterpretation|interpret-query|explainShopProductFit|explain-product-fit/);
});

test("Shop product explanation route gates eligibility before calling AI and never spends interpretation usage", () => {
  const route = read("app/api/shop/explain-product-fit/route.ts");
  const filtering = route.indexOf("const filtered = filterAndRankShopProducts");
  const productLookup = route.indexOf("const product = filtered.products.find", filtering);
  const unavailable = route.indexOf("This product is no longer available for the selected pet context", productLookup);
  const provider = route.indexOf("const provider = createAiAnalysisProvider", unavailable);

  assert.ok(filtering > -1);
  assert.ok(productLookup > filtering);
  assert.ok(unavailable > productLookup);
  assert.ok(provider > unavailable);
  assert.doesNotMatch(route, /getShopSearchUsageStatus|incrementShopSearchUsage|shop_search_usage/);
});

test("Shop product explanation remains click-only from page source", () => {
  const page = read("app/shop/page.tsx");
  const shopResults = page.slice(page.indexOf("function ShopResults"), page.indexOf("function ProductCard"));
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));
  const explainHandler = page.slice(page.indexOf("async function explainProductFit"), page.indexOf("async function interpretSubmittedQuery"));

  assert.equal((page.match(/fetch\("\/api\/shop\/explain-product-fit"/g) || []).length, 1);
  assert.doesNotMatch(shopResults, /fetch\("\/api\/shop\/explain-product-fit"/);
  assert.doesNotMatch(productCard, /fetch\("\/api\/shop\/explain-product-fit"/);
  assert.match(productCard, /onClick=\{onExplain\}/);
  assert.match(explainHandler, /if \(cached\?\.loading \|\| cached\?\.explanation\) return/);
});
