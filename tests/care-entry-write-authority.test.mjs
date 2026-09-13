import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const boundary = read("supabase/migrations/20260823120001_add_controlled_care_entry_update_boundary.sql");
const privileges = read("supabase/migrations/20260823120002_restrict_authenticated_care_entry_writes.sql");
const route = read("app/api/care-entries/[id]/route.ts");
const browser = read("app/lib/supabase.ts");
const executor = read("app/lib/application-actions/executor.ts");

test("care-entry edit authority is user, pet, record, and freshness bound", () => {
  assert.match(boundary, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(boundary, /entry\.id = p_entry_id[\s\S]*entry\.user_id = v_user_id[\s\S]*entry\.pet_profile_id = p_pet_profile_id/);
  assert.match(boundary, /entry\.updated_at = p_expected_updated_at/);
  assert.match(boundary, /for update/);
  assert.match(boundary, /security definer[\s\S]*set search_path = ''/);
  assert.match(boundary, /revoke all on function public\.update_my_care_entry[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(boundary, /grant execute on function public\.update_my_care_entry[\s\S]*to authenticated/);
});

test("authenticated Data API UPDATE is removed and INSERT is an explicit allowlist", () => {
  assert.match(privileges, /revoke update on table public\.pet_care_entries from public, anon, authenticated/);
  assert.match(privileges, /drop policy if exists "Users can update their care entries"/);
  assert.match(privileges, /grant insert \([\s\S]*user_id, pet_profile_id, category, title, note, severity, occurred_at,[\s\S]*idempotency_key[\s\S]*\) on table public\.pet_care_entries to authenticated/);
  assert.doesNotMatch(privileges, /grant (?:all|update)\b[^;]*pet_care_entries[^;]*authenticated/i);
});

test("all application care-entry edit paths call the controlled RPC", () => {
  for (const source of [route, browser, executor]) {
    assert.match(source, /rpc\("update_my_care_entry"/);
    assert.doesNotMatch(source, /from\("pet_care_entries"\)[\s\S]{0,160}\.update\(/);
  }
  assert.match(route, /const expectedUpdatedAt = entryResult\.data\.updated_at/);
  assert.match(route, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(route, /\.eq\("pet_profile_id", input\.petProfileId\)/);
  assert.match(executor, /care_history\.add[\s\S]*persist_furvise_intelligence/);
  assert.doesNotMatch(executor, /from\("pet_care_entries"\)[\s\S]{0,160}\.insert\(/);
});
