import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRememberedDetails, isVisibleCanonicalMemory } from "../app/lib/remembered-details.ts";

const now = new Date("2026-07-28T20:00:00.000Z");
function memory(overrides = {}) {
  return {
    id: "memory-1", user_id: "user-1", pet_id: "pet-1", subject_type: "pet", category: "preference",
    fact_key: "prefersdentalchewtexture", fact_value: "softer dental chews", normalized_value: "softer dental chews",
    confidence: 0.98, importance: "medium", durability: "ongoing", status: "active", source_type: "ask_message",
    source_id: "message-1", source_excerpt: "explicit user evidence", first_observed_at: "2026-07-27T20:00:00.000Z",
    last_confirmed_at: "2026-07-27T20:00:00.000Z", superseded_by: null, created_at: "2026-07-27T20:00:00.000Z",
    updated_at: "2026-07-27T20:00:00.000Z", observed_at: "2026-07-27T20:00:00.000Z", expires_at: "2027-01-23T20:00:00.000Z",
    freshness_class: "medium_lived", base_confidence: 0.98, current_confidence: 0.98, decay_policy: "linear",
    confirmation_required_after: "2026-10-25T20:00:00.000Z", stale_at: "2026-10-25T20:00:00.000Z", ...overrides,
  };
}

test("active automatic pet memory appears once under the pet", () => {
  const details = buildRememberedDetails({ canonical: [memory()], petName: "Maple", now });
  assert.equal(details.pet.length, 1);
  assert.equal(details.pet[0].fact, "Maple prefers soft dental chews");
  assert.equal(details.owner.length, 0);
});

test("active owner memories are grouped as Your preferences and not pet facts", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "costco", pet_id: null, subject_type: "owner", category: "shopping", fact_key: "preferredstore", fact_value: "Costco" }),
    memory({ id: "budget", pet_id: null, subject_type: "owner", category: "shopping", fact_key: "productbudgetpreference", fact_value: "under $30 unless there is a much better option" }),
  ], petName: "Maple", now });
  assert.deepEqual(details.owner.map((item) => item.fact), ["You usually shop at Costco", "You prefer products under $30 unless there is a clearly better option"]);
  assert.equal(details.pet.length, 0);
});

test("automatic approval does not require a manual-save source", () => {
  assert.equal(isVisibleCanonicalMemory(memory({ source_type: "ask_message" }), now), true);
});

test("temporary symptom and completed medication memories are excluded", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "symptom", category: "symptom", durability: "temporary", freshness_class: "short_lived" }),
    memory({ id: "medication", category: "medication", status: "resolved" }),
  ], petName: "Maple", now });
  assert.equal(details.all.length, 0);
});

test("expired, rejected, superseded, and unconfirmed memories are excluded", () => {
  for (const candidate of [
    memory({ id: "expired", expires_at: "2026-07-27T00:00:00.000Z" }),
    memory({ id: "rejected", status: "rejected" }),
    memory({ id: "superseded", status: "superseded" }),
    memory({ id: "unconfirmed", status: "unconfirmed" }),
  ]) assert.equal(isVisibleCanonicalMemory(candidate, now), false);
});

test("stale memory is visible with Needs confirmation", () => {
  const details = buildRememberedDetails({ canonical: [memory({ last_confirmed_at: "2026-03-01T00:00:00.000Z", expires_at: "2026-09-01T00:00:00.000Z", stale_at: "2026-06-01T00:00:00.000Z", confirmation_required_after: "2026-06-01T00:00:00.000Z" })], petName: "Maple", now });
  assert.equal(details.all[0].freshness, "stale");
  assert.equal(details.all[0].needsConfirmation, true);
});

test("legacy compatibility is deduplicated behind canonical memory", () => {
  const legacy = [{ id: "legacy", user_id: "user-1", dog_profile_id: "pet-1", type: "preference", text: "Maple prefers soft dental chews", confidence: "confirmed", source: "legacy", created_at: "2026-07-01T00:00:00.000Z" }];
  const details = buildRememberedDetails({ canonical: [memory()], legacy, petName: "Maple", now });
  assert.equal(details.all.length, 1);
  assert.equal(details.all[0].source, "canonical");
});

test("legacy nonmedical memory remains available when no canonical equivalent exists", () => {
  const legacy = [{ id: "legacy", user_id: "user-1", dog_profile_id: "pet-1", type: "routine", text: "Maple likes an evening walk", confidence: "confirmed", source: "legacy", created_at: "2026-07-01T00:00:00.000Z" }];
  assert.equal(buildRememberedDetails({ canonical: [], legacy, petName: "Maple", now }).pet[0].fact, "Maple likes an evening walk");
});

test("corrected food preferences project only effective knowledge without hiding unrelated routines", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "old-chicken", fact_key: "likesfood", fact_value: "chicken", last_confirmed_at: "2026-07-20T00:00:00.000Z" }),
    memory({ id: "chicken-dislike", fact_key: "food_preference_chicken", fact_value: { preference: "avoid", value: "chicken", conceptKey: "food_preference" }, source_excerpt: "Actually, Milo doesn't like chicken.", last_confirmed_at: "2026-07-27T20:00:00.000Z" }),
    memory({ id: "salmon", fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon", conceptKey: "food_preference" }, source_excerpt: "He prefers salmon.", last_confirmed_at: "2026-07-27T19:59:59.000Z" }),
    memory({ id: "crate", category: "routine", fact_key: "sleepingarrangement", fact_value: "crate at night", last_confirmed_at: "2026-07-19T00:00:00.000Z" }),
  ], petName: "Milo", now });
  assert.deepEqual(new Set(details.pet.map((item) => item.fact)), new Set([
    "Milo dislikes chicken.",
    "Milo prefers salmon.",
    "Milo sleeps in a crate at night.",
  ]));
  assert.equal(details.pet.some((item) => /likesfood|dislikesfood|sleepingarrangement/i.test(item.fact)), false);
});

test("explicit replacement suppresses only the replaced preference target", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "chicken", fact_key: "food_preference_chicken", fact_value: { preference: "prefer", value: "chicken" }, last_confirmed_at: "2026-07-20T00:00:00.000Z" }),
    memory({ id: "beef", fact_key: "food_preference_beef", fact_value: { preference: "prefer", value: "beef" }, last_confirmed_at: "2026-07-21T00:00:00.000Z" }),
    memory({ id: "salmon", fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon" }, source_excerpt: "Actually, Milo prefers salmon instead of chicken.", last_confirmed_at: "2026-07-27T00:00:00.000Z" }),
  ], petName: "Milo", now });
  assert.deepEqual(new Set(details.pet.map((item) => item.fact)), new Set(["Milo prefers salmon.", "Milo prefers beef."]));
});

test("repeated equivalent assertions collapse to one active remembered detail", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "older", fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon" }, last_confirmed_at: "2026-07-20T00:00:00.000Z" }),
    memory({ id: "newer", fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon" }, last_confirmed_at: "2026-07-27T00:00:00.000Z" }),
  ], petName: "Milo", now });
  assert.deepEqual(details.pet.map((item) => item.fact), ["Milo prefers salmon."]);
});

test("pet-local food preferences remain isolated in Remembered Details", () => {
  const milo = memory({ id: "milo-salmon", pet_id: "pet-milo", fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon" } });
  const luna = memory({ id: "luna-chicken", pet_id: "pet-luna", fact_key: "food_preference_chicken", fact_value: { preference: "prefer", value: "chicken" } });
  assert.deepEqual(buildRememberedDetails({ canonical: [milo], petName: "Milo", now }).pet.map((item) => item.fact), ["Milo prefers salmon."]);
  assert.deepEqual(buildRememberedDetails({ canonical: [luna], petName: "Luna", now }).pet.map((item) => item.fact), ["Luna prefers chicken."]);
});

test("legacy malformed owner pet-food keys project to the named pet and never leak internal keys", () => {
  const details = buildRememberedDetails({ canonical: [
    memory({ id: "milo-food", pet_id: null, subject_type: "owner", fact_key: "petfoodpreferencemilo", fact_value: "salmon" }),
    memory({ id: "mani-food", pet_id: null, subject_type: "owner", fact_key: "petfoodpreferencemani", fact_value: "chicken" }),
    memory({ id: "chewy", pet_id: null, subject_type: "owner", category: "shopping", fact_key: "preferred_retailer", fact_value: "Chewy" }),
  ], petName: "Milo", now });
  assert.deepEqual(details.pet.map((item) => item.fact), ["Milo prefers salmon."]);
  assert.deepEqual(details.owner.map((item) => item.fact), ["You usually shop at Chewy"]);
  assert.equal(details.all.some((item) => /petfoodpreference/i.test(item.fact)), false);
});

test("Remembered Details and profile summary query furvise_memories and use the shared adapter", async () => {
  const [supabase, page, profile] = await Promise.all([
    readFile(new URL("../app/lib/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dogs/[id]/memories/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(supabase, /from\("furvise_memories"\)/);
  assert.match(page, /loadCanonicalRememberedDetailsForUser/);
  assert.match(profile, /loadCanonicalRememberedDetailsForUser/);
  assert.match(page, /Useful details Furvise learns from your conversations/);
  assert.match(profile, /details\.all\.length/);
  assert.match(profile, /slice\(0, 2\)/);
});

test("memory controls preserve lifecycle and enforce authenticated ownership", async () => {
  const [migration, route] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260728124000_add_memory_lifecycle_controls.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/memories/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /where id = p_memory_id and user_id = v_user_id for update/i);
  assert.match(migration, /status = 'superseded'/);
  assert.match(migration, /superseded_by = v_new_id/);
  assert.match(migration, /status = 'rejected'/);
  assert.doesNotMatch(migration, /delete from public\.furvise_memories/i);
  assert.match(migration, /last_confirmed_at = now\(\)/);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.match(migration, /revoke all .* from public, anon/i);
  assert.match(route, /auth\.getUser\(token\)/);
});

test("empty state is conditional on the combined visible canonical and legacy set", async () => {
  const page = await readFile(new URL("../app/dogs/[id]/memories/page.tsx", import.meta.url), "utf8");
  assert.match(page, /details\.all\.length/);
  assert.match(page, /No remembered details yet/);
  assert.match(page, /Useful preferences and routines Furvise learns over time/);
});
