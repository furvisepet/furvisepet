import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getSafeNextPath } from "../app/lib/auth-routing.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("critical AI routes authenticate and enforce owner-scoped identifiers", () => {
  const ask = read("app/api/ask/route.ts");
  const conversations = read("app/api/ask/conversations/[id]/route.ts");
  const memory = read("app/api/memories/[id]/route.ts");
  const suggestion = read("app/api/ask/suggestions/[id]/route.ts");
  const vet = read("app/api/vet-briefs/draft/route.ts");
  const product = read("app/api/shop/product-question/route.ts");
  assert.match(ask, /if \(!token\).*AUTH_REQUIRED/);
  assert.match(ask, /\.eq\("user_id", userId\)/);
  assert.match(conversations, /\.eq\("id", id\)[\s\S]*\.eq\("user_id", context\.userId\)/);
  assert.match(memory, /auth\.supabase\.rpc\("manage_furvise_memory"/);
  assert.match(suggestion, /\.eq\("id", id\)[\s\S]*\.eq\("user_id", auth\.userId\)/);
  assert.match(vet, /petId, supabase: auth\.supabase, userId: auth\.userId/);
  assert.match(product, /petId, supabase: context\.supabase, userId: context\.userId/);
});

test("critical request bodies, UUIDs, arrays, dates, and text are bounded", () => {
  const boundary = read("app/lib/security/request.ts");
  const ask = read("app/api/ask/route.ts");
  const product = read("app/api/shop/product-question/route.ts");
  const vetDraft = read("app/api/vet-briefs/draft/route.ts");
  const vetSave = read("app/api/vet-briefs/route.ts");
  assert.match(boundary, /ask: 64 \* 1024/);
  assert.match(boundary, /conversation: 384 \* 1024/);
  assert.match(boundary, /bytesRead > maxBytes/);
  assert.match(ask, /question\.length > 1200/);
  assert.match(ask, /hasOnlyKeys\(rawBody/);
  assert.match(product, /maxProductQuestionLength = 320/);
  assert.match(product, /isSecurityUuid\(petId\)/);
  assert.match(vetDraft, /MAX_VET_BRIEF_RANGE_DAYS = 730/);
  assert.match(vetDraft, /MAX_REASON_FOR_VISIT_LENGTH = 1_200/);
  assert.match(vetSave, /filter\(isUuid\)\.slice\(0, 300\)/);
  for (const path of [
    "app/api/ask/conversations/route.ts",
    "app/api/ask/conversations/[id]/route.ts",
    "app/api/ask/conversations/[id]/messages/route.ts",
    "app/api/shop/catalog/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /readBoundedJson\(/);
    assert.match(source, /hasOnlyKeys\(/);
    assert.doesNotMatch(source, /request\.json\(/);
  }
  for (const path of [
    "app/api/ask/conversations/[id]/route.ts",
    "app/api/ask/conversations/[id]/messages/route.ts",
    "app/api/vet-briefs/[id]/route.ts",
    "app/api/vet-briefs/[id]/pdf/route.ts",
  ]) assert.match(read(path), /isUuid\(id\)/);
});

test("provider calls have canonical output and execution limits", () => {
  const config = read("app/lib/ai/config.ts");
  const provider = read("app/lib/ai/providers/openai.ts");
  const askReasoning = read("app/lib/ai/ask-reasoning.ts");
  assert.match(config, /OPENAI_PROVIDER_TIMEOUT_MS = 25_000/);
  assert.equal((provider.match(/max_output_tokens:\s*OPENAI_OUTPUT_LIMITS\./g) || []).length, 5);
  assert.equal((provider.match(/this\.client\.responses\.create/g) || []).length, 1);
  assert.equal((provider.match(/AbortSignal\.timeout\(OPENAI_PROVIDER_TIMEOUT_MS\)/g) || []).length, 1);
  assert.match(askReasoning, /timeoutMs: 25_000/);
  assert.match(askReasoning, /max_output_tokens:/);
});

test("auth redirects remain local", () => {
  assert.equal(getSafeNextPath("https://evil.example/x", "/dashboard"), "/dashboard");
  assert.equal(getSafeNextPath("//evil.example/x", "/dashboard"), "/dashboard");
  assert.equal(getSafeNextPath("/\\evil.example/x", "/dashboard"), "/dashboard");
  assert.equal(getSafeNextPath("/pets?id=1", "/dashboard"), "/pets?id=1");
});

test("logs centralize credential and private-content redaction", () => {
  const logging = read("app/lib/security/logging.ts");
  const intelligence = read("app/lib/intelligence/logging.ts");
  const suggestion = read("app/api/ask/suggestions/[id]/route.ts");
  assert.match(logging, /authorization\|cookie\|password\|secret\|token\|api\.\?key/);
  assert.match(logging, /"\[REDACTED\]"/);
  assert.match(intelligence, /safeErrorForLog/);
  assert.doesNotMatch(suggestion, /databaseDetails:|databaseHint:|databaseMessage:/);
  assert.doesNotMatch(read("app/lib/intelligence/persist-learnings.ts"), /databaseMessage:|databaseDetails:/);
  assert.doesNotMatch(read("app/lib/ai/providers/openai.ts"), /rawStructuredResponse:\s*raw/);
  assert.match(read("app/api/analyze/route.ts"), /safeErrorForLog\(error\)/);
});

test("client bundles have no direct provider or service-role secret reference", () => {
  for (const path of ["app/ask/page.tsx", "app/shop/page.tsx", "app/results/page.tsx", "app/lib/supabase.ts"]) {
    const source = read(path);
    assert.doesNotMatch(source, /process\.env\.(OPENAI_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/);
  }
  assert.match(read("app/lib/ai/providers/openai.ts"), /import "server-only"/);
});

test("database migrations bind RPC identity and revoke repair execution", () => {
  const suggestion = read("supabase/migrations/20260728060000_idempotent_state_suggestions.sql");
  const repair = read("supabase/migrations/20260729011000_fix_service_memory_repair_authorization.sql");
  const credits = read("supabase/migrations/20260728020000_fix_ai_credit_rpc_ambiguity.sql");
  assert.match(suggestion, /p_user_id <> v_auth_user_id/);
  assert.match(repair, /revoke all on function public\.repair_pet_memory_lifecycle[\s\S]*from public, anon, authenticated/);
  assert.match(repair, /grant execute[\s\S]*to service_role/);
  assert.match(credits, /pg_advisory_xact_lock/);
  assert.match(credits, /where usage_event\.user_id = v_user_id[\s\S]*usage_event\.request_id = p_request_id/);
});

test("the linked-database authorization suite covers every priority owner resource", () => {
  const sql = read("supabase/tests/security_phase_s1_authorization.sql");
  for (const resource of [
    "dog_profiles", "pet_care_entries", "pet_care_episodes", "pet_current_state", "pet_concerns",
    "furvise_memories", "ask_conversations", "ask_conversation_messages", "ai_usage_events",
    "ai_update_suggestions", "vet_visit_briefs", "dog_product_feedback",
  ]) assert.match(sql, new RegExp(`public\\.${resource}`));
  assert.match(sql, /client-supplied user_id bypassed auth\.uid\(\)/);
  assert.match(sql, /duplicate request charged more than once/);
  assert.match(sql, /failed request did not release credit/);
});
