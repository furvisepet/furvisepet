import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20260728080000_add_pet_care_episodes.sql", import.meta.url), "utf8");
test("episode migration preserves immutable events and recurrence links", () => {
  assert.match(sql, /recurrence_of uuid references public\.pet_care_episodes/);
  assert.match(sql, /add column if not exists episode_id/);
  assert.doesNotMatch(sql, /delete from public\.pet_care_entries/);
});
test("backfill is dry-run, service-only, and idempotent", () => {
  assert.match(sql, /p_dry_run boolean default true/);
  assert.match(sql, /EPISODE_BACKFILL_FORBIDDEN/);
  assert.match(sql, /already_assigned/);
  assert.match(sql, /grant execute on function public\.backfill_pet_care_episodes\(uuid, boolean\) to service_role/);
});
test("episode retrieval is bounded and avoids N plus one queries", () => {
  const source = readFileSync(new URL("../app/lib/intelligence/retrieve-context.ts", import.meta.url), "utf8");
  assert.match(source, /episodesQuery/);
  assert.match(source, /\.limit\(20\)/);
  assert.match(source, /Promise\.all/);
});
