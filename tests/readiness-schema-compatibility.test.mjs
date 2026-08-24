import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REQUIRED_SECURITY_MIGRATION_NAMES,
  SECURITY_SCHEMA_CONTRACT_VERSION,
  requiredSchemaIsReady,
  schemaReadinessFailures,
} from "../app/lib/operations/readiness.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compatible = { contract_version: SECURITY_SCHEMA_CONTRACT_VERSION, failed_checks: [] };
const valid = {
  billingAccountsError: null,
  deletionTombstonesError: null,
  latestMigration: "20260824002000",
  securityCompatibility: compatible,
  securityCompatibilityError: null,
};

test("current security compatibility V2 contract is ready", () => {
  assert.equal(SECURITY_SCHEMA_CONTRACT_VERSION, 2);
  assert.equal(requiredSchemaIsReady(valid), true);
  assert.deepEqual(schemaReadinessFailures(valid), []);
});

test("each security capability failure fails closed", () => {
  for (const failure of [
    "canonical_memory_authority",
    "action_capability_authority",
    "care_history_write_authority",
    "entitlement_pet_boundary",
    "permanent_delete_authority",
    "ai_credit_authority",
    "canonical_care_state_authority",
  ]) {
    assert.deepEqual(schemaReadinessFailures({ ...valid, securityCompatibility: { ...compatible, failed_checks: [failure] } }), [failure]);
  }
});

test("missing, failed, or malformed compatibility results fail closed", () => {
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibilityError: new Error("connection") }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: null }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: { contract_version: 1, failed_checks: [] } }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: { contract_version: 2, failed_checks: "none" } }), false);
  assert.deepEqual(schemaReadinessFailures({ ...valid, securityCompatibility: { contract_version: 2, failed_checks: ["unsafe\nlog"] } }), ["compatibility_result_invalid"]);
  assert.equal(requiredSchemaIsReady({ ...valid, latestMigration: undefined }), false);
});

test("required migration identities are stable names rather than deployment timestamps", () => {
  for (const name of [
    "authorize_ask_memory_persistence",
    "harden_ask_action_capability_targets_freshness_expiry",
    "add_controlled_care_entry_update_boundary",
    "restrict_authenticated_care_entry_writes",
    "prepare_canonical_care_state_authority",
    "enforce_canonical_care_state_authority",
    "security_compatibility_contract_v2",
  ]) assert.ok(REQUIRED_SECURITY_MIGRATION_NAMES.includes(name), name);
  assert.equal(REQUIRED_SECURITY_MIGRATION_NAMES.some((name) => /^20260823\d{6}$/.test(name)), false);
});

test("route performs bounded V2 semantic checks and exposes only generic component state", () => {
  const route = source("app/api/readiness/route.ts");
  assert.match(route, /furvise_security_compatibility_snapshot_v2/);
  assert.match(route, /p_required_migration_names: \[\.\.\.REQUIRED_SECURITY_MIGRATION_NAMES\]/);
  assert.match(route, /SCHEMA_COMPATIBILITY:\$\{failure\}/);
  assert.match(route, /Response\.json\(\{ components, status:/);
  assert.doesNotMatch(route, /Response\.json\(\{[^}]*failures/);
  assert.doesNotMatch(route, /failed_checks.*Response/);
});

test("V2 RPC is service-only, read-only, name-based, and covers canonical care authority", () => {
  const migration = source("supabase/migrations/20260824002000_security_compatibility_contract_v2.sql");
  assert.match(migration, /security definer[\s\S]*request\.jwt\.claim\.role[\s\S]*service_role/);
  assert.match(migration, /schema_migrations migration[\s\S]*migration\.name = v_name/);
  assert.match(migration, /revoke all on function public\.furvise_security_compatibility_snapshot_v2\(text\[\]\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.furvise_security_compatibility_snapshot_v2\(text\[\]\)[\s\S]*to service_role/);
  assert.match(migration, /canonical_care_state_authority/);
  for (const signature of [
    "persist_furvise_semantic_event",
    "persist_furvise_care_event_before_destination_routing",
    "persist_furvise_server_semantic_event",
    "persist_furvise_server_care_event",
    "apply_furvise_server_state_suggestion",
    "set_furvise_server_actor",
  ]) assert.match(migration, new RegExp(signature));
  for (const table of ["pet_concerns", "ai_update_suggestions"]) assert.match(migration, new RegExp(table));
});
