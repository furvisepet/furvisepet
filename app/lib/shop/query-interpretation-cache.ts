import { createHash } from "node:crypto";
import type { PetMemoryContext } from "../pet-memory";
import { parseShopQueryInterpretation, type ShopQueryInterpretation } from "../shop-query";

export const SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION = "2026-07-22-v1";

const SHOP_QUERY_INTERPRETATIONS_TABLE = "shop_query_interpretations";

export type ShopQueryInterpretationCacheSource = "ai" | "fallback";

export type ShopQueryInterpretationCacheRow = {
  created_at?: string;
  hit_count: number;
  id: string;
  interpretation_json: unknown;
  last_used_at?: string;
  normalized_query: string;
  pet_context_hash: string;
  pet_id: string;
  query_hash: string;
  schema_version: string;
  source: ShopQueryInterpretationCacheSource;
  updated_at?: string;
  user_id: string;
};

export type ShopQueryInterpretationCacheHit = {
  interpretation: ShopQueryInterpretation;
  source: ShopQueryInterpretationCacheSource;
};

export type ShopInterpretationCacheLookup = {
  petContextHash: string;
  petId: string;
  queryHash: string;
  schemaVersion?: string;
  supabase: SupabaseCacheLike;
  userId: string;
};

export type SupabaseCacheLike = {
  from: (table: string) => {
    select: (columns?: string) => CacheQueryLike;
    update?: (payload: unknown) => CacheQueryLike;
    upsert?: (payload: unknown, options?: unknown) => CacheQueryLike;
  };
};

type CacheQueryLike = PromiseLike<{ data?: unknown; error: unknown | null }> & {
  eq: (field: string, value: unknown) => CacheQueryLike;
  maybeSingle?: <T>() => PromiseLike<{ data: T | null; error: unknown | null }> | { data: unknown | null; error: unknown | null };
  select?: (columns?: string) => CacheQueryLike;
  single?: <T>() => PromiseLike<{ data: T | null; error: unknown | null }> | { data: unknown | null; error: unknown | null };
};

export function normalizeShopQueryForCache(query: string) {
  return query
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculatePetContextHash(memory: PetMemoryContext) {
  const relevantContext = {
    derived: {
      knownAvoids: memory.derived.knownAvoids,
      recurringConcerns: memory.derived.recurringConcerns,
      recentChanges: memory.derived.recentChanges,
      safetyFlags: memory.derived.safetyFlags,
      summaryBullets: memory.derived.summaryBullets,
    },
    pet: {
      avoidIngredients: memory.pet.avoidIngredients,
      currentFood: memory.pet.currentFood,
      id: memory.pet.id,
      mainConcern: memory.pet.mainConcern,
      species: memory.pet.species,
      wellnessGoal: memory.pet.wellnessGoal,
    },
    savedDetails: memory.savedDetails.map((detail) => ({
      createdAt: detail.createdAt,
      id: detail.id,
      label: detail.label,
      source: detail.source,
      value: detail.value,
    })),
    timeline: memory.timeline.recentEntries.map((entry) => ({
      category: entry.category,
      date: entry.date,
      detail: entry.detail,
      id: entry.id,
      source: entry.source,
      title: entry.title,
    })),
  };
  return sha256(stableStringify(relevantContext));
}

export function hashShopInterpretationCacheKey({
  normalizedQuery,
  petContextHash,
  petId,
  schemaVersion = SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
  userId,
}: {
  normalizedQuery: string;
  petContextHash: string;
  petId: string;
  schemaVersion?: string;
  userId: string;
}) {
  return sha256(stableStringify({ normalizedQuery, petContextHash, petId, schemaVersion, userId }));
}

export async function readCachedShopQueryInterpretation({
  petContextHash,
  petId,
  queryHash,
  schemaVersion = SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
  supabase,
  userId,
}: ShopInterpretationCacheLookup): Promise<ShopQueryInterpretationCacheHit | null> {
  try {
    const query = supabase
      .from(SHOP_QUERY_INTERPRETATIONS_TABLE)
      .select("id,interpretation_json,source,hit_count")
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .eq("query_hash", queryHash)
      .eq("pet_context_hash", petContextHash)
      .eq("schema_version", schemaVersion);
    const result = await query.maybeSingle?.<Pick<ShopQueryInterpretationCacheRow, "hit_count" | "id" | "interpretation_json" | "source">>() as
      | { data: Pick<ShopQueryInterpretationCacheRow, "hit_count" | "id" | "interpretation_json" | "source"> | null; error: unknown | null }
      | undefined;
    if (!result || result.error || !result.data) return null;

    const interpretation = parseShopQueryInterpretation(result.data.interpretation_json);
    if (!interpretation || !isCacheSource(result.data.source)) return null;
    void updateShopInterpretationCacheHit({ hitCount: result.data.hit_count, id: result.data.id, supabase });
    return { interpretation, source: result.data.source };
  } catch {
    return null;
  }
}

export async function saveShopQueryInterpretationCache({
  interpretation,
  normalizedQuery,
  petContextHash,
  petId,
  queryHash,
  schemaVersion = SHOP_QUERY_INTERPRETATION_SCHEMA_VERSION,
  source,
  supabase,
  userId,
}: {
  interpretation: ShopQueryInterpretation;
  normalizedQuery: string;
  petContextHash: string;
  petId: string;
  queryHash: string;
  schemaVersion?: string;
  source: ShopQueryInterpretationCacheSource;
  supabase: SupabaseCacheLike;
  userId: string;
}) {
  try {
    const result = await supabase
      .from(SHOP_QUERY_INTERPRETATIONS_TABLE)
      .upsert?.(
        {
          hit_count: 0,
          interpretation_json: interpretation,
          last_used_at: new Date().toISOString(),
          normalized_query: normalizedQuery,
          pet_context_hash: petContextHash,
          pet_id: petId,
          query_hash: queryHash,
          schema_version: schemaVersion,
          source,
          updated_at: new Date().toISOString(),
          user_id: userId,
        },
        { onConflict: "user_id,pet_id,query_hash,pet_context_hash,schema_version" },
      );
    return !(result && "error" in result && result.error);
  } catch {
    return false;
  }
}

async function updateShopInterpretationCacheHit({
  hitCount,
  id,
  supabase,
}: {
  hitCount: number;
  id: string;
  supabase: SupabaseCacheLike;
}) {
  try {
    const result = await supabase
      .from(SHOP_QUERY_INTERPRETATIONS_TABLE)
      .update?.({
        hit_count: hitCount + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", id);
    return !(result && "error" in result && result.error);
  } catch {
    return false;
  }
}

function isCacheSource(value: unknown): value is ShopQueryInterpretationCacheSource {
  return value === "ai" || value === "fallback";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
