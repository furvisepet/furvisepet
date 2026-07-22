import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePetContextHash,
  hashShopInterpretationCacheKey,
  normalizeShopQueryForCache,
  readCachedShopQueryInterpretation,
  saveShopQueryInterpretationCache,
  SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
} from "../app/lib/shop/query-interpretation-cache.ts";

const baseInterpretation = {
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
    country: null,
  },
  safetyFlags: {
    urgentCare: false,
    medicalTreatmentIntent: false,
  },
  confidence: "medium",
};

function buildMemory(overrides = {}) {
  return {
    pet: {
      id: "pet-1",
      name: "Rocky",
      species: "dog",
      breed: null,
      ageLabel: null,
      weightLabel: null,
      mainConcern: "Itchy skin",
      currentFood: null,
      avoidIngredients: [],
      monthlyBudget: null,
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
      summaryBullets: ["Rocky's saved profile is available."],
      ...(overrides.derived || {}),
    },
  };
}

function createCacheSupabase(rows = []) {
  const store = rows.map((row) => ({ ...row }));
  return {
    store,
    from(table) {
      assert.equal(table, "shop_query_interpretations");
      return new CacheQuery(store);
    },
  };
}

class CacheQuery {
  constructor(store) {
    this.store = store;
    this.filters = [];
    this.payload = null;
    this.updatePayload = null;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  update(payload) {
    this.updatePayload = payload;
    return this;
  }

  upsert(payload) {
    this.payload = payload;
    const existing = this.store.find(
      (row) =>
        row.user_id === payload.user_id &&
        row.pet_id === payload.pet_id &&
        row.query_hash === payload.query_hash &&
        row.pet_context_hash === payload.pet_context_hash &&
        row.schema_version === payload.schema_version,
    );
    if (existing) Object.assign(existing, payload);
    else this.store.push({ id: `cache-${this.store.length + 1}`, created_at: "2026-07-22T00:00:00Z", ...payload });
    return { data: null, error: null };
  }

  maybeSingle() {
    const row = this.store.find((item) =>
      this.filters.every((filter) => item[filter.field] === filter.value),
    );
    return { data: row ? { ...row } : null, error: null };
  }

  then(resolve) {
    if (this.updatePayload) {
      const row = this.store.find((item) =>
        this.filters.every((filter) => item[filter.field] === filter.value),
      );
      if (row) Object.assign(row, this.updatePayload);
    }
    return Promise.resolve({ data: null, error: null }).then(resolve);
  }
}

test("Shop cache query normalization covers casing, whitespace, and simple punctuation", () => {
  assert.equal(normalizeShopQueryForCache(" Shampoo "), "shampoo");
  assert.equal(normalizeShopQueryForCache("SHAMPOO   "), "shampoo");
  assert.equal(normalizeShopQueryForCache("chicken-free food"), "chicken free food");
  assert.equal(normalizeShopQueryForCache("chicken free food"), "chicken free food");
});

test("Shop interpretation cache key separates pet, context hash, and schema version", () => {
  const memory = buildMemory();
  const changedMemory = buildMemory({ pet: { avoidIngredients: ["chicken"] } });
  const normalizedQuery = normalizeShopQueryForCache("shampoo");
  const contextHash = calculatePetContextHash(memory);
  const changedContextHash = calculatePetContextHash(changedMemory);

  assert.notEqual(contextHash, changedContextHash);
  assert.equal(
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", userId: "user-1" }),
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", userId: "user-1" }),
  );
  assert.notEqual(
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", userId: "user-1" }),
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-2", userId: "user-1" }),
  );
  assert.notEqual(
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", userId: "user-1" }),
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: changedContextHash, petId: "pet-1", userId: "user-1" }),
  );
  assert.notEqual(
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", schemaVersion: "future", userId: "user-1" }),
    hashShopInterpretationCacheKey({ normalizedQuery, petContextHash: contextHash, petId: "pet-1", userId: "user-1" }),
  );
});

test("Shop interpretation cache returns strict schema rows and ignores malformed rows", async () => {
  const memory = buildMemory();
  const normalizedQuery = normalizeShopQueryForCache(" Shampoo ");
  const petContextHash = calculatePetContextHash(memory);
  const queryHash = hashShopInterpretationCacheKey({
    normalizedQuery,
    petContextHash,
    petId: "pet-1",
    schemaVersion: SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
    userId: "user-1",
  });
  const supabase = createCacheSupabase();

  await saveShopQueryInterpretationCache({
    interpretation: baseInterpretation,
    normalizedQuery,
    petContextHash,
    petId: "pet-1",
    queryHash,
    source: "ai",
    supabase,
    userId: "user-1",
  });

  const hit = await readCachedShopQueryInterpretation({
    petContextHash,
    petId: "pet-1",
    queryHash,
    supabase,
    userId: "user-1",
  });
  assert.equal(hit?.source, "ai");
  assert.equal(hit?.interpretation.category, "Grooming");
  assert.equal(supabase.store[0].hit_count, 1);

  supabase.store[0].interpretation_json = { category: "Not real" };
  const malformed = await readCachedShopQueryInterpretation({
    petContextHash,
    petId: "pet-1",
    queryHash,
    supabase,
    userId: "user-1",
  });
  assert.equal(malformed, null);
});
