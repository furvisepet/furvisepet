import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("pet profile is a single authorized facts surface with a Vet Brief handoff", () => {
  const source = read("app/pets/[id]/page.tsx");

  assert.match(source, /loadDogProfileForUser\(params\.id, user\)/);
  assert.match(source, /buildPetProfileFactRows\(profile\)/);
  assert.match(source, /const petId = encodeURIComponent\(profile\.id\)/);
  assert.match(source, /href=\{`\/pets\/\$\{petId\}\/edit`\}/);
  assert.match(source, /href=\{`\/vet-brief\?pet=\$\{petId\}&source=pet-profile`\}/);
  assert.doesNotMatch(source, /loadCanonicalRememberedDetailsForUser|listRecentCareEntriesForPet|\/today\?pet=|\/ask\?pet=|\/results\?|\/shop\?petId=|Products for/);
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
  const voice = read("app/lib/furvise-output.ts");

  assert.match(page, /getAskErrorPresentation/);
  assert.match(voice, /Furvise couldn't answer just now\. Your question has not been lost\./);
  assert.match(page, /I couldn't save that detail\. You can try again\./);
  assert.match(route, /FURVISE_ANSWER_UNAVAILABLE_MESSAGE/);
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
  const answerStart = route.indexOf("await orchestrateAskTurn");
  const answerFailure = route.indexOf('askFailure("AI_UNAVAILABLE", friendlyAnswerFailure', answerStart);
  const usageStart = route.indexOf("let nextUsage = usage", answerStart);
  const increment = route.indexOf("completeAiCredit", usageStart);

  assert.ok(answerStart > -1);
  assert.ok(answerFailure > answerStart);
  assert.ok(usageStart > answerFailure);
  assert.ok(increment > usageStart);
  assert.match(route, /friendlyAnswerFailure/);
  assert.doesNotMatch(route, /setup may be incomplete/);
  assert.match(route, /optionalFailure\("credit_completion"/);
});

test("Ask Furvise route uses context planning before response persistence", () => {
  const route = read("app/api/ask/route.ts");
  const contextLoad = route.indexOf("await buildFurviseContext");
  const pipeline = route.indexOf("orchestrateAskTurn", contextLoad);
  const persistence = route.indexOf("persistAssistantAnswer({", pipeline);

  assert.ok(contextLoad > -1);
  assert.ok(pipeline > contextLoad);
  assert.ok(persistence > pipeline);
  assert.doesNotMatch(route, /generateGroundedAskAnswer|answerSinglePetMemoryQuestion/);
  assert.equal(route.match(/await completeAiCredit/g)?.length, 2, "foreground completion is retried once");
  assert.match(route, /getAiCreditEventsForLogicalRequest[\s\S]*await reconcileAiCredit/);
});
