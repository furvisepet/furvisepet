import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("results loads saved profileId from Supabase before local draft fallback", () => {
  const source = read("app/results/page.tsx");
  const routeBranch = source.slice(
    source.indexOf("if (profileIdFromRoute)"),
    source.indexOf("const stored = window.localStorage.getItem(STORAGE_KEY)"),
  );

  assert.match(source, /loadDogProfileWithMemoriesForUser\(profileIdFromRoute, user\)/);
  assert.match(source, /dogProfileRowToDraft\(row\)/);
  assert.match(source, /setLoadError\("Furvise could not load this pet profile\."\)/);
  assert.match(source, /Furvise could not load product options\./);
  assert.match(source, /storedProfileIdBeforeLoad === row\.id/);
  assert.match(routeBranch, /window\.localStorage\.setItem\(PROFILE_ID_STORAGE_KEY, profileIdFromRoute\)/);
  assert.doesNotMatch(routeBranch, /window\.localStorage\.getItem\(STORAGE_KEY\)/);
});

test("results shows a friendly error for a missing or unauthorized route profileId", () => {
  const source = read("app/results/page.tsx");
  const routeBranch = source.slice(
    source.indexOf("if (profileIdFromRoute)"),
    source.indexOf("const stored = window.localStorage.getItem(STORAGE_KEY)"),
  );

  assert.match(routeBranch, /catch \(error\)/);
  assert.match(routeBranch, /logResultsLoadFailure\(profileIdFromRoute, error\)/);
  assert.match(routeBranch, /setProfile\(initialProfile\)/);
  assert.match(routeBranch, /setLoadError\("Furvise could not load this pet profile\."\)/);
  assert.match(source, /\{loadError\}/);
});

test("pet profile recommendation links carry profileId instead of relying on localStorage", () => {
  const source = read("app/pets/[id]/page.tsx");

  assert.match(source, /const productsHref = `\/results\?profileId=\$\{encodeURIComponent\(profile\.id\)\}`;/);
  assert.match(source, /href=\{`\/results\?profileId=\$\{encodeURIComponent\(petId\)\}`\}/);
  assert.match(source, /href=\{`\/results\?profileId=\$\{encodeURIComponent\(profile\.id\)\}`\}/);
});

test("core Supabase migration enforces ownership RLS for profiles, care, memories, and feedback", () => {
  const migration = read("supabase/migrations/20260712000000_core_loop_schema_rls.sql");

  for (const table of ["dog_profiles", "pet_care_entries", "dog_memories", "dog_product_feedback"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(migration, /with check \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /where dog_profiles\.id = pet_care_entries\.pet_profile_id\s+and dog_profiles\.user_id = auth\.uid\(\)/);
  assert.match(migration, /where dog_profiles\.id = dog_memories\.dog_profile_id\s+and dog_profiles\.user_id = auth\.uid\(\)/);
  assert.match(migration, /where dog_profiles\.id = dog_product_feedback\.dog_profile_id\s+and dog_profiles\.user_id = auth\.uid\(\)/);
  assert.match(migration, /species is null or species in \('dog', 'cat'\)/);
  assert.match(migration, /create unique index if not exists dog_product_feedback_unique_type_idx/);
});

test("Ask Furvise uses required friendly failure messages", () => {
  const page = read("app/ask/page.tsx");
  const route = read("app/api/ask/route.ts");

  assert.match(page, /Furvise could not answer right now\. Please try again\./);
  assert.match(page, /Furvise could not save this update\./);
  assert.match(route, /Furvise could not answer right now\. Please try again\./);
});

test("Ask Furvise usage migration tracks monthly counts with owner RLS", () => {
  const migration = read("supabase/migrations/20260713000000_add_ask_furvise_usage.sql");

  assert.match(migration, /create table if not exists public\.ask_furvise_usage/);
  assert.match(migration, /month_key text not null/);
  assert.match(migration, /count integer not null default 0/);
  assert.match(migration, /unique\(user_id, month_key\)/);
  assert.match(migration, /alter table public\.ask_furvise_usage enable row level security/);
  assert.match(migration, /for select\s+using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /for insert\s+with check \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /for update\s+using \(user_id = auth\.uid\(\)\)\s+with check \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /ask_furvise_usage_touch_updated_at/);
});

test("Ask Furvise route keeps usage tracking from masking successful answers", () => {
  const route = read("app/api/ask/route.ts");
  const answerStart = route.indexOf("let response;");
  const answerFailure = route.indexOf("friendlyAnswerFailure", answerStart);
  const usageStart = route.indexOf("let nextUsage = usage", answerStart);
  const increment = route.indexOf("incrementAskUsage", usageStart);

  assert.ok(answerStart > -1);
  assert.ok(answerFailure > answerStart);
  assert.ok(usageStart > answerFailure);
  assert.ok(increment > usageStart);
  assert.match(route, /Ask usage setup may be incomplete/);
  assert.match(route, /logAskUsageError\("incrementAskUsage", error\)/);
});

test("Ask Furvise route keeps grounded LLM fallback behind general answer success", () => {
  const route = read("app/api/ask/route.ts");
  const singlePetAnswer = route.indexOf("async function answerSinglePetMemoryQuestion");
  const deterministicAnswer = route.indexOf("const deterministicAnswer = answerPetMemoryQuestion", singlePetAnswer);
  const guard = route.indexOf("shouldUseGroundedAskFallback", deterministicAnswer);
  const configured = route.indexOf("isGroundedAskFallbackConfigured", guard);
  const fallback = route.indexOf("generateGroundedAskAnswer", configured);

  assert.ok(singlePetAnswer > -1);
  assert.ok(deterministicAnswer > singlePetAnswer);
  assert.ok(guard > deterministicAnswer);
  assert.ok(configured > guard);
  assert.ok(fallback > configured);
  assert.equal(route.match(/await incrementAskUsage/g)?.length, 1);
});
