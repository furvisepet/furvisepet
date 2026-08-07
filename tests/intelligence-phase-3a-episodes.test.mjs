import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assignEventToEpisode } from "../app/lib/intelligence/episodes/assign-event-to-episode.ts";

const sql = readFileSync(new URL("../supabase/migrations/20260728080000_add_pet_care_episodes.sql", import.meta.url), "utf8");
const active = { id: "ep1", pet_profile_id: "pet", normalized_key: "breathing", episode_type: "symptom", status: "active", sequence_number: 1, recurrence_of: null, started_at: "2026-01-01", last_event_at: "2026-01-01", resolved_at: null };
const resolved = { ...active, status: "resolved", resolved_at: "2026-01-02" };
const event = (action, title, category = "symptom") => ({ action, category, title, note: title, occurred_at: "2026-01-03" });

test("new symptom creates episode one", () => assert.equal(assignEventToEpisode(event("create_entry", "Breathing is difficult"), []).relation, "new"));
test("continued symptom attaches to active episode", () => assert.equal(assignEventToEpisode(event("create_entry", "Breathing is still difficult"), [active]).targetEpisodeId, "ep1"));
test("clear recovery resolves active episode", () => assert.deepEqual(assignEventToEpisode(event("resolve_concern", "Breathing returned to normal"), [active]).relation, "resolution"));
test("later recurrence creates a recurrence episode", () => assert.deepEqual(assignEventToEpisode(event("reopen_concern", "Breathing problem recurred"), [resolved]).recurrenceOf, "ep1"));
test("episode migration preserves immutable events and recurrence links", () => {
  assert.match(sql, /recurrence_of uuid references public\.pet_care_episodes/);
  assert.match(sql, /add column if not exists episode_id/);
  assert.doesNotMatch(sql, /delete from public\.pet_care_entries/);
});
test("medication start and completion share deterministic episode key", () => {
  const medication = { ...active, id: "med1", normalized_key: "antibiotics", episode_type: "medication_course" };
  assert.equal(assignEventToEpisode(event("create_entry", "Started antibiotics", "medication"), []).relation, "new");
  assert.equal(assignEventToEpisode(event("resolve_concern", "Finished antibiotics", "medication"), [medication]).relation, "resolution");
});
test("food transition is separate from symptoms", () => assert.equal(assignEventToEpisode(event("create_entry", "Changed to salmon food", "food"), []).episodeType, "food_transition"));
test("backfill is dry-run, service-only, and idempotent", () => {
  assert.match(sql, /p_dry_run boolean default true/);
  assert.match(sql, /EPISODE_BACKFILL_FORBIDDEN/);
  assert.match(sql, /already_assigned/);
  assert.match(sql, /grant execute on function public\.backfill_pet_care_episodes\(uuid, boolean\) to service_role/);
});
test("ambiguous general observations are not assigned", () => assert.equal(assignEventToEpisode(event(null, "Had a nice day", "general"), []).relation, "none"));
test("episode retrieval is bounded and avoids N plus one queries", () => {
  const source = readFileSync(new URL("../app/lib/intelligence/retrieve-context.ts", import.meta.url), "utf8");
  assert.match(source, /episodesQuery/);
  assert.match(source, /\.limit\(20\)/);
  assert.match(source, /Promise\.all/);
});
