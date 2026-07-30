import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reducePetState } from "../app/lib/intelligence/pet-state/reduce-events.ts";

const sql = readFileSync(new URL("../supabase/migrations/20260728090000_add_pet_current_state.sql", import.meta.url), "utf8");
const entry = (id, at, action, title, severity = null) => ({ id, user_id: "u", pet_profile_id: "p", category: "symptom", title, note: title, severity, occurred_at: at, created_at: at, updated_at: at, state_action_type: action, intelligence_confidence: 0.99 });
const urgent = entry("e1", "2026-01-01T01:00:00Z", "create_entry", "Breathing difficult", "severe");
const recovered = entry("e2", "2026-01-01T02:00:00Z", "resolve_concern", "Breathing returned to normal");
const recurred = entry("e3", "2026-01-01T03:00:00Z", "reopen_concern", "Breathing concern recurred", "severe");
const recoveredAgain = entry("e4", "2026-01-01T04:00:00Z", "resolve_concern", "Breathing returned to normal");

test("urgent recovery recurrence recovery reduces chronologically", () => {
  assert.equal(reducePetState([urgent], []).state.breathing.status, "abnormal");
  assert.equal(reducePetState([urgent, recovered], []).state.breathing.status, "normal");
  assert.equal(reducePetState([urgent, recovered, recurred], []).state.breathing.status, "abnormal");
  assert.equal(reducePetState([urgent, recovered, recurred, recoveredAgain], []).state.breathing.status, "normal");
});
test("historical urgent events cannot override newer recovery", () => assert.equal(reducePetState([recoveredAgain, urgent], []).state.wellbeing.overall, "monitoring"));
test("unknown state domains remain absent", () => assert.equal(reducePetState([], []).state.appetite, undefined));
test("state source ids point to canonical immutable events", () => assert.deepEqual(reducePetState([urgent, recovered], []).sourceEventIds, ["e1", "e2"]));
test("active and monitoring episode ids stay normalized", () => {
  const result = reducePetState([], [{ id: "a", status: "active" }, { id: "m", status: "monitoring" }, { id: "r", status: "resolved" }]);
  assert.deepEqual(result.activeEpisodeIds, ["a"]); assert.deepEqual(result.monitoringEpisodeIds, ["m"]);
});
test("incremental and full recomputation share deterministic rules", () => {
  const once = reducePetState([urgent, recovered, recurred, recoveredAgain], []);
  const incremental = [urgent, recovered, recurred, recoveredAgain].reduce((state, event) => reducePetState([event], [], state.state), reducePetState([], []));
  assert.deepEqual(incremental.state, once.state);
  assert.match(sql, /recompute_pet_current_state/);
});
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
