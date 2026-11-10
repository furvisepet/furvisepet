import {PUBLIC_V1_CAPABILITIES} from '../app/lib/public-v1-capabilities.ts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("pet profile is a single authorized facts surface with public generation disabled", () => {
  const source = read("app/pets/[id]/page.tsx");

  assert.match(source, /loadDogProfileForUser\(params\.id, user\)/);
  assert.match(source, /buildPetProfileFactRows\(profile\)/);
  assert.match(source, /const petId = encodeURIComponent\(profile\.id\)/);
  assert.match(source, /href=\{`\/pets\/\$\{petId\}\/edit`\}/);
  assert.equal(PUBLIC_V1_CAPABILITIES.vetBriefGeneration,false);assert.doesNotMatch(source, /VET BRIEF/);assert.equal(source.includes("/vet-brief"),false);
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

test("durable read-only answers survive settlement outages without reporting a completed charge",async()=>{
 const {readOnlyPublicationFixture}=await import("./helpers/ask-read-only-publication.mjs");
 for(const options of [{failDisposition:true},{failCredit:true}]){
  const f=await readOnlyPublicationFixture(options),response=await f.run(),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.success,true);assert.equal(body.persistence.saved,true);
  assert.equal(f.state.row.response_data.turn.finalStage,"COMPLETED");
  assert.equal(body.turn.creditState,"completion_pending");assert.equal(body.turn.settlementState,"pending");
  assert.equal(f.state.credits,0);assert.equal(f.calls,2);assert.equal(f.events.at(-1),"lease:release");
  assert.equal(f.events.filter(e=>e==="assistant:terminal").length,1);
 }
 assert.doesNotMatch(read("app/api/ask/route.ts"),/setup may be incomplete/);
});

test("public Ask binds context before read-only generation and durable publication",async()=>{
 const route=read("app/api/ask/route.ts"),creditSettlement=read("app/lib/ai/ask-credit-settlement.ts");
 const start=route.indexOf("async function executeAskRequest");
 const contextLoad=route.indexOf("loadReadOnlyContext(",start);
 const pipeline=route.indexOf("runReadOnlyAsk({",contextLoad);
 const reviewed=route.indexOf("buildReadOnlyPublication(",pipeline);
 const persistence=route.indexOf("persistReadOnlyAnswer({",reviewed);
 assert.ok(start>=0&&contextLoad>start&&pipeline>contextLoad&&reviewed>pipeline&&persistence>reviewed);
 assert.doesNotMatch(route,/generateGroundedAskAnswer|answerSinglePetMemoryQuestion|prepareAppendTurn|executeActionCapability/);
 assert.match(route,/createAskCreditSettlement/);
 assert.match(creditSettlement,/getEvents: getAiCreditEventsForLogicalRequest/);
 assert.match(creditSettlement,/await ledger\.reconcile/);
 const {readOnlyPublicationFixture}=await import("./helpers/ask-read-only-publication.mjs");
 const f=await readOnlyPublicationFixture(),response=await f.run();
 assert.equal(response.status,200);assert.equal(f.state.credits,1);assert.equal(f.calls,2);
 assert.ok(f.events.indexOf("assistant:terminal")<f.events.indexOf("credit:complete"));
});
