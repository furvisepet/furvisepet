import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateMemoryFreshness } from "../app/lib/intelligence/memory-freshness/calculate-memory-freshness.ts";
import { selectFreshRelevantMemories } from "../app/lib/intelligence/memory-freshness/select-fresh-memories.ts";

const now = new Date("2026-07-28T12:00:00Z");
const memory = (freshness_class, confirmed, overrides = {}) => ({ id: "m", user_id: "u", pet_id: "p", subject_type: "pet", category: "preference", fact_key: "current_food", fact_value: "Kirkland", normalized_value: "kirkland", confidence: 0.95, importance: "medium", durability: "ongoing", status: "active", source_type: "user_confirmed", source_id: null, source_excerpt: null, first_observed_at: confirmed, last_confirmed_at: confirmed, superseded_by: null, created_at: confirmed, updated_at: confirmed, freshness_class, base_confidence: 0.95, ...overrides });
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();

test("permanent memory remains fresh", () => assert.equal(calculateMemoryFreshness(memory("permanent", daysAgo(2000)), now).freshnessStatus, "fresh"));
test("medium lived current food ages and becomes stale", () => {
  assert.equal(calculateMemoryFreshness(memory("medium_lived", daysAgo(60)), now).freshnessStatus, "aging");
  assert.equal(calculateMemoryFreshness(memory("medium_lived", daysAgo(100)), now).freshnessStatus, "stale");
});
test("short lived medication expires", () => assert.equal(calculateMemoryFreshness(memory("short_lived", daysAgo(15)), now).freshnessStatus, "expired"));
test("confirmation restores freshness", () => assert.equal(calculateMemoryFreshness(memory("medium_lived", daysAgo(0)), now).freshnessStatus, "fresh"));
test("stale memory cannot be a hard fact", () => assert.equal(calculateMemoryFreshness(memory("medium_lived", daysAgo(100)), now).usableAsHardConstraint, false));
test("relevant stale memory remains available for natural confirmation", () => {
  const selected = selectFreshRelevantMemories([memory("medium_lived", daysAgo(100))], "Is the current food still Kirkland?", now);
  assert.equal(selected[0].freshness.needsConfirmation, true);
});
test("irrelevant stale memory does not outrank a relevant fresh fact", () => {
  const stale = memory("medium_lived", daysAgo(100));
  const fresh = memory("long_lived", daysAgo(1), { id: "g", fact_key: "grooming_preference", fact_value: "brush" });
  assert.equal(selectFreshRelevantMemories([stale, fresh], "grooming brush", now)[0].memory.id, "g");
});
test("confirmed allergy does not decay", () => assert.equal(calculateMemoryFreshness(memory("permanent", daysAgo(5000), { category: "allergy", fact_key: "allergy" }), now).effectiveConfidence, 0.95));
test("episode-bound memory expires with its short policy", () => assert.equal(calculateMemoryFreshness(memory("episode_bound", daysAgo(8)), now).freshnessStatus, "expired"));
test("freshness durations and database indexes are centralized", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260728100000_add_memory_freshness.sql", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../app/lib/intelligence/memory-freshness/policy.ts", import.meta.url), "utf8");
  assert.match(sql, /furvise_memories_freshness_idx/); assert.match(sql, /furvise_memories_subject_fact_idx/);
  assert.match(policy, /medium_lived/); assert.match(policy, /episode_bound/);
});
