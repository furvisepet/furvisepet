import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260823062212_authorize_ask_memory_persistence.sql");
const persistence = read("app/lib/intelligence/persist-learnings.ts");
const route = read("app/api/ask/route.ts");
const sqlVerification = read("supabase/tests/ask_memory_authority_verification.sql");

test("legacy Ask intelligence persistence is no longer a client authority", () => {
  assert.match(migration, /revoke all on function public\.persist_furvise_intelligence\(uuid, uuid, jsonb, jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.persist_furvise_intelligence/);
  assert.match(migration, /has_function_privilege\('authenticated', 'public\.persist_furvise_intelligence/);
  assert.match(sqlVerification, /authenticated executed legacy Ask memory persistence/);
  assert.match(sqlVerification, /anon executed legacy Ask memory persistence/);
});

test("Ask uses a service-only lease and provenance-bound RPC", () => {
  assert.match(persistence, /createOperationsAdminClient\(\)\.rpc\("persist_furvise_ask_intelligence"/);
  for (const binding of [
    "p_user_id: userId",
    "p_pet_id: targetPetId",
    "p_authorized_pet_ids: authorizedPetIds",
    "p_source_message_id: sourceMessageId",
    "p_assistant_message_id: assistantMessageId",
    "p_request_id: requestId",
    "p_payload_hash: payloadHash",
    "p_operation_owner_token: operationOwnerToken",
  ]) assert.match(persistence, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(route, /operationOwnerToken: idempotency\.operation\.ownerToken/);
  assert.match(route, /operationPayloadHash: idempotency\.operation\.payloadHash/);
  assert.match(route, /payloadHash: operationPayloadHash/);
  assert.match(route, /authorizedPetIds: turnAuthoritativePetIds/);
  assert.match(migration, /operation_row\.operation_type = 'ask\.submit\.persisted_answer_v2'/);
  assert.match(migration, /operation_row\.owner_token = p_operation_owner_token/);
  assert.match(migration, /operation_row\.lease_expires_at > pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /assistant_message\.sequence_number = source_message\.sequence_number \+ 1/);
  assert.match(migration, /assistant_message\.intelligence_validation->>'valid' = 'true'/);
});

test("new database boundary enforces scope, grounding, bounds, and idempotency", () => {
  assert.match(migration, /p_pet_id <> all\(p_authorized_pet_ids\)/);
  assert.match(migration, /pet_row\.id = authorized_pet\.id and pet_row\.user_id = p_user_id/);
  assert.match(migration, /coalesce\(v_learning->>'subjectId', ''\) <> p_pet_id::text/);
  assert.match(migration, /v_learning->'subjectId' is not null[\s\S]*jsonb_typeof\(v_learning->'subjectId'\) <> 'null'/);
  assert.match(migration, /jsonb_array_length\(coalesce\(p_learnings/);
  assert.match(migration, /octet_length\(coalesce\(p_learnings,[\s\S]*> 32768/);
  assert.match(migration, /v_learning - array\[/);
  assert.match(migration, /char_length\(v_fact_value\) not between 2 and 500/);
  assert.match(migration, /v_grounded_term_count < least\(2, v_fact_term_count\)/);
  assert.match(migration, /on conflict \(dedupe_key\) do nothing/);
  for (const proof of [
    "wrong owned pet was accepted",
    "cross-user source message was accepted",
    "unsupported fact was accepted",
    "oversized learning array was accepted",
    "oversized learning string was accepted",
    "oversized extra learning field was accepted",
    "legitimate server persistence failed",
    "owner/pet memory subject isolation failed",
    "duplicate persistence was not idempotent",
    "authorized cross-pet persistence failed",
    "correction/supersession semantics changed",
    "canonical memory visibility filters changed",
  ]) assert.match(sqlVerification, new RegExp(proof.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("app-first compatibility is narrow and cannot bypass a deployed authority boundary", () => {
  const fallback = persistence.slice(persistence.indexOf("const authorized ="), persistence.indexOf("const { data, error } = result"));
  assert.match(fallback, /isMissingAskMemoryAuthorityRpc\(authorized\.error\)/);
  assert.match(persistence, /error\.code === "PGRST202"/);
  assert.match(persistence, /persist_furvise_ask_intelligence/i);
  assert.match(fallback, /supabase\.rpc\("persist_furvise_intelligence"/);
  assert.doesNotMatch(fallback, /authorized\.error\s*\?/);
});

test("RLS, canonical visibility, triggers, and feature persistence remain unchanged", () => {
  assert.doesNotMatch(migration, /(?:alter table|drop trigger|drop policy|create policy)[^;]*furvise_memories/i);
  assert.doesNotMatch(migration, /(?:grant|revoke)[^;]*table public\.furvise_memories/i);
  assert.match(migration, /relation\.relrowsecurity and relation\.relforcerowsecurity/);
  assert.match(migration, /FEATURE_INTELLIGENCE_RPC_PRIVILEGE_CONTRACT_CHANGED/);
  assert.match(sqlVerification, /feature-intelligence authority changed/);
  assert.match(sqlVerification, /canonical memory visibility\/RLS contract changed/);
});
