import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  prepareFurviseApplicationActions,
  resolveFurviseActionTargetBindings,
} from "../app/lib/application-actions/planner.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const capability = read("app/lib/application-actions/capabilities.ts");
const reasoning = read("app/lib/ai/ask-reasoning.ts");
const route = read("app/api/ask/route.ts");
const conversation = read("app/lib/ask-conversation-server.ts");
const migration = read("supabase/migrations/20260823120000_harden_ask_action_capability_targets_freshness_expiry.sql");

const petId = "11000000-0000-4000-8000-000000000011";
const exactEntryId = "11000000-0000-4000-8000-000000000101";
const newerEntryId = "11000000-0000-4000-8000-000000000102";

function targetAction(kind = "care_history.remove", target = "specified") {
  return prepareFurviseApplicationActions({
    petId,
    petName: "Maple",
    requestId: "11000000-0000-4000-8000-000000000201",
    proposals: [{
      kind,
      explicitIntent: true,
      evidence: "remove the vomiting update",
      input: {
        field: null,
        value: null,
        title: null,
        detail: kind === "care_history.edit" ? "Maple vomited once before breakfast." : null,
        category: null,
        target,
      },
    }],
  })[0];
}

test("exact discussed record binding never substitutes a different newer record", () => {
  const action = targetAction();
  const bindings = resolveFurviseActionTargetBindings({
    actions: [action],
    referencedRecords: [{ id: `care:${exactEntryId}`, petId, sourceType: "care_update" }],
  });
  assert.equal(bindings[action.id], exactEntryId);
  assert.notEqual(bindings[action.id], newerEntryId);
  assert.match(capability, /eq\("id", targetId\)/);
  assert.doesNotMatch(capability, /order\("occurred_at"|order\("updated_at"/);
});

test("missing, ambiguous, malformed, and cross-pet references fail closed", () => {
  const action = targetAction();
  const resolve = (referencedRecords) => resolveFurviseActionTargetBindings({ actions: [action], referencedRecords });
  assert.deepEqual(resolve([]), {});
  assert.deepEqual(resolve([
    { id: `care:${exactEntryId}`, petId, sourceType: "care_update" },
    { id: `care:${newerEntryId}`, petId, sourceType: "care_update" },
  ]), {});
  assert.deepEqual(resolve([{ id: "care:not-a-uuid", petId, sourceType: "care_update" }]), {});
  assert.deepEqual(resolve([{ id: `care:${exactEntryId}`, petId: "22000000-0000-4000-8000-000000000022", sourceType: "care_update" }]), {});
  assert.match(capability, /requiresBoundTarget\(authoritativeAction\) && !targetId/);
});

test("positional latest/last target proposals are no longer eligible authority", () => {
  assert.equal(targetAction("care_history.remove", "last"), undefined);
  assert.match(reasoning, /never target the last, latest, recent, or merely eligible record/);
  assert.match(route, /resolveFurviseActionTargetBindings/);
  assert.match(route, /targetBindings: actionTargetBindings/);
});

test("care edits, removals, and concern transitions all bind target freshness", () => {
  assert.match(migration, /pet_care_entries_touch_updated_at[\s\S]*clock_timestamp\(\)/);
  assert.match(migration, /pet_concerns_touch_updated_at[\s\S]*clock_timestamp\(\)/);
  assert.match(migration, /action_kind in \('care_history\.edit', 'care_history\.remove', 'care_state\.resolve', 'care_state\.reopen'\)[\s\S]*target_updated_at is not null/);
  assert.match(migration, /new\.target_updated_at := v_entry\.updated_at/);
  assert.match(migration, /new\.target_updated_at := v_concern\.updated_at/);
  assert.match(migration, /v_entry\.updated_at is distinct from v\.target_updated_at/);
  assert.match(migration, /v_concern\.updated_at is distinct from v\.target_updated_at/);
  assert.match(migration, /That history update changed after this action was prepared/);
  assert.match(migration, /That concern changed after this action was prepared/);
});

test("database-authored expiry is immutable, narrow, and checked under the execution lock", () => {
  assert.match(migration, /expires_at = created_at \+ interval '15 minutes'/);
  assert.match(migration, /new\.expires_at := new\.created_at \+ interval '15 minutes'/);
  assert.match(migration, /new\.expires_at is distinct from old\.expires_at/);
  assert.match(migration, /where id = p_capability_id[\s\S]*for update[\s\S]*v_now >= v\.expires_at/);
  assert.match(migration, /That action expired before it was confirmed/);
  assert.match(capability, /Date\.parse\(row\.expires_at\) <= Date\.now\(\)/);
  assert.match(conversation, /Date\.parse\(row\.expires_at\) <= Date\.now\(\)/);
});

test("terminal receipts retain stable replay and concurrent single-consumer semantics", () => {
  assert.match(migration, /if v\.status <> 'pending'[\s\S]*return query select v\.receipt, false/);
  assert.match(migration, /from private\.execute_ask_action_capability/);
  assert.match(migration, /status = 'failed', receipt = v_action, terminal_at = v_now/);
  assert.match(migration, /revoke all on function private\.execute_ask_action_capability[\s\S]*service_role/);
});

test("the forward migration invalidates legacy unversioned pending targets", () => {
  assert.match(migration, /where status = 'pending'[\s\S]*care_history\.remove[\s\S]*care_state\.resolve[\s\S]*care_state\.reopen/);
  assert.match(migration, /That action must be prepared again/);
});
