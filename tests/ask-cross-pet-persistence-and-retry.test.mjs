import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260810170000_allow_owned_cross_pet_ask_persistence.sql");
const authorityMigration = read("supabase/migrations/20260823062212_authorize_ask_memory_persistence.sql");
const askPage = read("app/ask/page.tsx");
const suggestionRoute = read("app/api/ask/suggestions/[id]/route.ts");

test("owned source messages and resolved pets are authorized independently", () => {
  assert.match(migration, /persist_furvise_semantic_event_exact_20260807/);
  assert.match(migration, /persist_furvise_care_event_with_concern/);
  assert.match(migration, /persist_furvise_intelligence/);
  assert.match(migration, /conversation_row\\\.pet_profile_id = p_pet_id/);
  assert.match(migration, /v_guard_count <> 1/);
  assert.match(migration, /ASK_PERSISTENCE_SOURCE_GUARD_UNEXPECTED/);
});

test("cross-pet support remains but final Ask memory persistence is service-only", () => {
  assert.match(migration, /revoke all on function public\.persist_furvise_semantic_event_exact_20260807[\s\S]*authenticated/);
  assert.match(migration, /revoke all on function public\.persist_furvise_care_event_with_concern[\s\S]*authenticated/);
  assert.match(authorityMigration, /p_authorized_pet_ids uuid\[\]/);
  assert.match(authorityMigration, /p_pet_id <> all\(p_authorized_pet_ids\)/);
  assert.match(authorityMigration, /revoke all on function public\.persist_furvise_intelligence[\s\S]*public, anon, authenticated, service_role/);
  assert.match(authorityMigration, /grant execute on function public\.persist_furvise_ask_intelligence[\s\S]*to service_role/);
});

test("suggestion writes use a stable canonical idempotency identity", () => {
  const helper = askPage.slice(askPage.indexOf("async function suggestionJson"), askPage.indexOf("function getFriendlySuggestionError"));
  assert.match(helper, /idempotentClientFetch/);
  assert.match(helper, /`suggestion:\$\{method\}:\$\{url\}`/);
  assert.doesNotMatch(helper, /const response = await fetch\(url/);
  assert.match(suggestionRoute, /beginIdempotentRateLimitedOperation/);
  assert.match(suggestionRoute, /\.eq\("id", id\)\s*\.eq\("user_id", auth\.userId\)/);
});
