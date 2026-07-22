import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPlanCapabilities } from "../app/lib/billing/plan-limits.ts";
import {
  getShopSearchUsageStatus,
  incrementShopSearchUsage,
  readShopSearchUsageCount,
} from "../app/lib/billing/shop-usage.ts";
import {
  hashShopInterpretationCacheKey,
  normalizeShopQueryForCache,
} from "../app/lib/shop/query-interpretation-cache.ts";
import { filterAndRankShopProducts } from "../app/lib/shop/product-search.ts";
import { initialProfile } from "../app/lib/petwise.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function createShopUsageSupabase(rows = []) {
  const store = rows.map((row) => ({ ...row }));
  return {
    store,
    from(table) {
      assert.equal(table, "shop_search_usage");
      return new Query(store);
    },
  };
}

class Query {
  constructor(store) {
    this.store = store;
    this.filters = [];
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  upsert(payload) {
    const existing = this.store.find(
      (row) => row.user_id === payload.user_id && row.month_key === payload.month_key,
    );
    if (existing) Object.assign(existing, payload);
    else this.store.push({ id: `usage-${this.store.length + 1}`, created_at: "2026-07-01T00:00:00Z", ...payload });
    return this;
  }

  maybeSingle() {
    const row = this.store.find((item) =>
      this.filters.every((filter) => item[filter.field] === filter.value),
    );
    return { data: row ? { ...row } : null, error: null };
  }

  single() {
    return { data: { ...this.store[this.store.length - 1] }, error: null };
  }
}

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

function product(overrides = {}) {
  return {
    id: "base-dental-treat",
    name: "Verified Dental Dog Treats",
    brand: "Care Brand",
    retailer: "Care Retailer",
    productUrl: "https://example.com/product",
    species: "dog",
    category: "health_essentials",
    subcategory: "dental_treat",
    recommendationKind: "product",
    protein: "Poultry",
    concernTags: ["dental_care", "general_wellness"],
    excludedIngredients: ["chicken", "poultry"],
    avoidIngredientKeywords: ["chicken", "poultry"],
    ingredientHighlights: ["Poultry"],
    lifeStage: "adult",
    tags: ["dental", "dog", "treat", "treats"],
    currency: "USD",
    active: true,
    source: "curated",
    ingredientsVerified: true,
    availableCountries: ["US"],
    evidenceType: "curated_static",
    sourceNote: "Curated test fixture.",
    whyItFits: "Routine dental care fixture.",
    whyCategoryFits: "Dental care fixture.",
    cautions: "Use carefully.",
    ...overrides,
  };
}

test("Shop search usage increments fresh AI interpretations only", async () => {
  const supabase = createShopUsageSupabase([{ user_id: "user-1", month_key: "2026-07", count: 4 }]);
  const status = await getShopSearchUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").shopSearchMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });

  assert.equal(status.count, 4);
  assert.equal(status.allowed, true);
  await incrementShopSearchUsage({ monthKey: "2026-07", previousCount: status.count, supabase, userId: "user-1" });
  assert.equal(await readShopSearchUsageCount({ monthKey: "2026-07", supabase, userId: "user-1" }), 5);
});

test("Shop interpretation cache normalization prevents duplicate spend for casing and whitespace variants", () => {
  const petContextHash = "pet-context-hash";
  const base = {
    petContextHash,
    petId: "rocky-id",
    schemaVersion: "schema-v1",
    userId: "user-1",
  };
  const queries = ["Dental treats", "  dental   treats  ", "DENTAL TREATS", "dental-treats"];
  const normalized = queries.map(normalizeShopQueryForCache);
  const hashes = normalized.map((normalizedQuery) => hashShopInterpretationCacheKey({ ...base, normalizedQuery }));

  assert.deepEqual([...new Set(normalized)], ["dental treats"]);
  assert.equal(new Set(hashes).size, 1);
});

test("Shop deterministic filtering and invalid query states do not touch usage", async () => {
  const supabase = createShopUsageSupabase([{ user_id: "user-1", month_key: "2026-07", count: 7 }]);

  filterAndRankShopProducts({
    accountCountry: "US",
    products: [product()],
    query: "dental treats",
    selectedPet: profile(),
  });
  filterAndRankShopProducts({
    accountCountry: "US",
    products: [product()],
    query: "",
    selectedPet: profile(),
  });
  filterAndRankShopProducts({
    accountCountry: "US",
    products: [product()],
    query: "ab",
    selectedPet: profile(),
  });

  assert.equal(await readShopSearchUsageCount({ monthKey: "2026-07", supabase, userId: "user-1" }), 7);
});

test("Shop search cap blocks fresh uncached queries while allowing cached interpretations", async () => {
  const supabase = createShopUsageSupabase([{ user_id: "user-1", month_key: "2026-07", count: 20 }]);
  const status = await getShopSearchUsageStatus({
    earlyAccessUnlocked: false,
    monthlyLimit: getPlanCapabilities("free").shopSearchMonthlyLimit,
    monthKey: "2026-07",
    planId: "free",
    supabase,
    userId: "user-1",
  });
  assert.equal(status.allowed, false);
  assert.equal(status.remaining, 0);
  assert.match(status.gate.message || "", /included Shop searches/);

  const route = read("app/api/shop/interpret-query/route.ts");
  const cacheRead = route.indexOf("const cached = await readCachedShopQueryInterpretation");
  const cacheReturn = route.indexOf("cached: true", cacheRead);
  const capCheck = route.indexOf("if (!context.usage.allowed)");
  const providerCreation = route.indexOf("const provider = createAiAnalysisProvider");
  const capBranch = route.slice(capCheck, providerCreation);

  assert.ok(cacheRead > -1);
  assert.ok(cacheReturn > cacheRead);
  assert.ok(capCheck > cacheRead);
  assert.ok(providerCreation > capCheck);
  assert.match(capBranch, /limitReached: true/);
  assert.match(capBranch, /status: 402/);
  assert.match(capBranch, /You've used your included Shop searches for this month\. You can still view saved pets and care history\./);
  assert.doesNotMatch(capBranch, /createAiAnalysisProvider|interpretShopQuery|incrementShopSearchUsage/);
});

test("Shop route never increments usage for invalid bodies, cached hits, fallback, or product explanation", () => {
  const interpretationRoute = read("app/api/shop/interpret-query/route.ts");
  const explanationRoute = read("app/api/shop/explain-product-fit/route.ts");
  const invalidBranch = interpretationRoute.slice(
    interpretationRoute.indexOf("if (!petId || query.length < MIN_SHOP_QUERY_LENGTH"),
    interpretationRoute.indexOf("let memory"),
  );
  const cacheHitBranch = interpretationRoute.slice(
    interpretationRoute.indexOf("if (cached?.source === \"ai\")"),
    interpretationRoute.indexOf("if (cached?.source === \"fallback\")"),
  );
  const aiStart = interpretationRoute.indexOf("logShopInterpretationDiagnostic(\"calling AI provider\"");
  const fallbackBranch = interpretationRoute.slice(
    interpretationRoute.indexOf("} catch (error)", aiStart),
    interpretationRoute.indexOf("async function loadShopInterpretationRequestContext"),
  );

  assert.doesNotMatch(invalidBranch, /incrementShopSearchUsage|createAiAnalysisProvider|interpretShopQuery/);
  assert.doesNotMatch(cacheHitBranch, /incrementShopSearchUsage|createAiAnalysisProvider|interpretShopQuery/);
  assert.doesNotMatch(fallbackBranch, /incrementShopSearchUsage/);
  assert.doesNotMatch(explanationRoute, /getShopSearchUsageStatus|incrementShopSearchUsage|shop_search_usage/);
});

test("Shop cap reached UI copy is visible and calm", () => {
  const page = read("app/shop/page.tsx");

  assert.match(page, /Monthly Shop search limit reached/);
  assert.match(page, /You've used your included Shop searches for this month\. You can still view saved pets and care history\./);
  assert.doesNotMatch(page, /paywall|upgrade now|locked forever|subscribe to continue/i);
});
