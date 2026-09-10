import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/migrations/20260728090000_add_pet_current_state.sql", import.meta.url), "utf8");
test("state updates are versioned and duplicate source events are guarded", () => {
  assert.match(sql, /state_version = public\.pet_current_state\.state_version \+ 1/);
  assert.match(sql, /new\.id = any\(public\.pet_current_state\.source_event_ids\)/);
});
test("state recomputation is locked and service-role only", () => {
  assert.match(sql, /pg_advisory_xact_lock/); assert.match(sql, /PET_STATE_RECOMPUTE_FORBIDDEN/);
  assert.match(sql, /grant execute on function public\.recompute_pet_current_state\(uuid, boolean\) to service_role/);
});
test("Ask context loads current state and supporting source ids", () => {
  const retrieval = readFileSync(new URL("../app/lib/intelligence/retrieve-context.ts", import.meta.url), "utf8");
  const run = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
  assert.match(retrieval, /currentStateQuery/); assert.match(run, /Supported by care events/);
});
