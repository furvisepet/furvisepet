import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only"
    ? { url: "data:text/javascript,export {};", format: "module", shortCircuit: true }
    : next(specifier, context);
} });

const { profileMutationValue } = await import("../app/lib/furvise-brain/field-mutation-job.ts");
const migration = readFileSync(new URL("../supabase/migrations/20260926043000_canonical_profile_field_mutation.sql", import.meta.url), "utf8");
const capabilities = readFileSync(new URL("../app/lib/application-actions/capabilities.ts", import.meta.url), "utf8");

test("profile field jobs carry server-verified explicit intent into canonical capabilities", () => {
  assert.match(capabilities, /Boolean\(action\.appendJob \|\| action\.replaceJob \|\| action\.fieldMutationJob \|\| action\.stateTransitionJob\)/);
});

test("profile text values share the UI storage bound for short profile fields", () => {
  assert.doesNotThrow(() => profileMutationValue("name", "Aster"));
  assert.throws(() => profileMutationValue("name", "x".repeat(301)), /ASK_REQUEST_INVALID:profile_mutation/);
  assert.doesNotThrow(() => profileMutationValue("routine_note", "x".repeat(500)));
});

test("canonical profile mutation snapshots freshness and executes only typed fields", () => {
  assert.match(migration, /new\.action_kind = ''pet\.update_profile''[\s\S]*new\.target_updated_at := v_pet\.updated_at/);
  assert.match(migration, /v\.target_updated_at is null or v_pet\.updated_at is distinct from v\.target_updated_at/);
  assert.match(migration, /fieldMutationJob,domain/);
  assert.match(migration, /fieldMutationJob,sourceMessageId/);
  for (const field of ["weight","sex","name","breed","current_food","routine_note"]) assert.match(migration, new RegExp(field));
  assert.doesNotMatch(migration, /currentMessage|question|includes\(|like '%|regexp_matches/);
});

test("profile capability version binding requires exactly one freshness snapshot", () => {
  assert.match(migration, /drop constraint if exists ask_action_capabilities_version_binding_check/);
  assert.match(migration, /pet\.update_profile'[\s\S]*target_updated_at is not null/);
  assert.match(migration, /action_kind not in \('care_history\.edit','care_history\.remove','care_state\.resolve','care_state\.reopen','pet\.update_profile'\)[\s\S]*target_updated_at is null/);
});
