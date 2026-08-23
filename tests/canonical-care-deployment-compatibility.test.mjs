import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const phase1 = read("supabase/migrations/20260823232620_prepare_canonical_care_state_authority.sql");
const phase2 = read("supabase/migrations/20260823234226_enforce_canonical_care_state_authority.sql");

test("Phase 1 expands server authority without contracting the deployed browser contract", () => {
  for (const rpc of [
    "persist_furvise_server_semantic_event",
    "persist_furvise_server_care_event",
    "apply_furvise_server_state_suggestion",
  ]) {
    assert.match(phase1, new RegExp(`create or replace function public\\.${rpc}\\(`));
    assert.match(phase1, new RegExp(`grant execute on function public\\.${rpc}\\(`));
  }
  assert.match(phase1, /grant select, insert, update, delete\s+on table public\.pet_concerns, public\.ai_update_suggestions\s+to service_role;/);
  assert.doesNotMatch(phase1, /drop policy/);
  assert.doesNotMatch(phase1, /revoke all privileges\s+on table public\.pet_concerns/);
  assert.doesNotMatch(phase1, /revoke all on function public\.persist_furvise_(?:semantic|care)_event\(/);
  assert.doesNotMatch(phase1, /revoke all on function public\.apply_furvise_state_suggestion\(/);
});

test("Phase 2 performs only the final authority contraction", () => {
  assert.doesNotMatch(phase2, /create or replace function/);
  assert.match(phase2, /revoke all privileges\s+on table public\.pet_concerns, public\.ai_update_suggestions\s+from public, anon, authenticated;/);
  for (const policy of [
    "pet_concerns_insert_own",
    "pet_concerns_update_own",
    "pet_concerns_delete_own",
    "ai_update_suggestions_insert_own",
    "ai_update_suggestions_update_own",
    "ai_update_suggestions_delete_own",
  ]) assert.match(phase2, new RegExp(`drop policy if exists ${policy}`));
  for (const rpc of [
    "persist_furvise_semantic_event",
    "persist_furvise_semantic_event_exact_20260807",
    "persist_furvise_care_event",
    "persist_furvise_care_event_before_destination_routing",
    "persist_furvise_care_event_with_concern",
    "apply_furvise_state_suggestion",
    "resolve_concern_suggestion",
  ]) assert.match(phase2, new RegExp(`revoke all on function public\\.${rpc}\\(`));
});

test("every changed production caller uses the Phase 1 server boundary", () => {
  const callers = {
    "app/api/ask/route.ts": ["createCanonicalCareAuthorityClient", 'from("ai_update_suggestions")'],
    "app/api/ask/suggestions/[id]/route.ts": ["auth.authority", 'rpc("apply_furvise_server_state_suggestion"'],
    "app/lib/ask-conversation-server.ts": ["createCanonicalCareAuthorityClient", 'from("ai_update_suggestions")'],
    "app/lib/intelligence/persist-learnings.ts": ["createCanonicalCareAuthorityClient", 'rpc("persist_furvise_server_care_event"'],
    "app/lib/intelligence/semantic-event-persistence.ts": ['rpc("persist_furvise_server_semantic_event"'],
  };
  for (const [path, markers] of Object.entries(callers)) {
    const source = read(path);
    for (const marker of markers) assert.ok(source.includes(marker), `${path} is missing ${marker}`);
  }
});
