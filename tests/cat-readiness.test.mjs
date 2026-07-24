import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getLifeStage, initialProfile } from "../app/lib/petwise.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy profile storage supports cats without introducing duplicate core tables", () => {
  const schema = read("supabase/schema.sql");
  const speciesMigration = read("supabase/migrations/20260626000000_add_species_to_dog_profiles.sql");

  assert.match(schema + speciesMigration, /species is null or species in \('dog', 'cat'\)/);
  assert.match(schema, /pet_profile_id uuid not null references public\.dog_profiles\(id\)/);
  assert.doesNotMatch(schema, /create table if not exists public\.(cats|cat_profiles|cat_memories|cat_care_entries)/i);
});

test("application profile model and onboarding are species-ready", () => {
  const model = read("app/lib/petwise.ts");
  const onboarding = read("app/onboarding/page.tsx");
  const providerPrompt = read("app/lib/ai/providers/openai.ts");

  assert.match(model, /export type PetProfile =/);
  assert.match(model, /export type DogProfile = PetProfile/);
  assert.match(onboarding, /Is your pet a dog or a cat\?/);
  assert.match(onboarding, /\["dog", "cat"\] as const/);
  assert.doesNotMatch(onboarding, /e\.g\. Rocky/);
  assert.match(providerPrompt, /suitable for display to a pet owner/);
  assert.doesNotMatch(providerPrompt, /suitable for display to a dog owner/);
});

test("young dog and cat profiles use species-aware life stages", () => {
  assert.equal(
    getLifeStage({ ...initialProfile, age: "6", ageUnit: "months", species: "dog" }),
    "puppy",
  );
  assert.equal(
    getLifeStage({ ...initialProfile, age: "6", ageUnit: "months", species: "cat" }),
    "kitten",
  );
});

test("generic pet routes reuse compatibility implementations", () => {
  for (const suffix of ["edit", "memories", "feedback", "care"]) {
    assert.equal(existsSync(new URL(`../app/pets/[id]/${suffix}/page.tsx`, import.meta.url)), true);
  }

  const petList = read("app/pets/page.tsx");
  const petProfile = read("app/pets/[id]/page.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const results = read("app/results/page.tsx");
  assert.doesNotMatch(petList + petProfile + dashboard + results, /`\/dogs\/\$\{/);
  assert.match(petList + petProfile + dashboard + results, /`\/pets\/\$\{/);
});

test("user-facing cat-ready changes contain no em dash", () => {
  const sources = [
    "app/onboarding/page.tsx",
    "app/shop/page.tsx",
    "app/lib/ai/providers/openai.ts",
    "app/lib/shop/product-question.ts",
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /\u2014/);
});
