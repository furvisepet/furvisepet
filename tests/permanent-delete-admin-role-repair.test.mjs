import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260821050646_repair_permanent_pet_delete_admin_role.sql",
  "utf8",
);

test("permanent delete repair uses the canonical Supabase role helper", () => {
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.doesNotMatch(migration, /current_setting\('request\.jwt\.claim\.role'/);
  assert.match(migration, /raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED'/);
});

test("permanent delete repair preserves the privileged function boundary", () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.delete_pet_profile_for_user\(uuid, uuid\)\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.delete_pet_profile_for_user\(uuid, uuid\)\s+to service_role/i);
  assert.match(migration, /where id = p_pet_id and user_id = p_user_id/);
  assert.match(migration, /if p_user_id is null or p_pet_id is null/);
});

test("repair does not alter direct table privileges or lifecycle and entitlement boundaries", () => {
  assert.doesNotMatch(migration, /grant\s+(?:delete|update|insert)\s+on\s+(?:table\s+)?public\.dog_profiles/i);
  assert.doesNotMatch(migration, /vet_visit_briefs|has_vet_brief_entitlement|execute_ask_action_capability/i);
  assert.doesNotMatch(migration, /\b(?:begin|commit|rollback|start\s+transaction)\s*;/i);
});
