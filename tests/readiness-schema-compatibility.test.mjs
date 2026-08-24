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
  latestMigration: "20260824014500",
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

test("required migration identities match clean Supabase ledger names", () => {
  for (const name of [
    "enforce_furvise_memory_semantic_integrity",
    "authorize_ask_memory_persistence",
    "harden_ask_action_capability_targets_freshness_expiry",
    "add_controlled_care_entry_update_boundary",
    "restrict_authenticated_care_entry_writes",
    "prepare_canonical_care_state_authority",
    "enforce_canonical_care_state_authority",
    "security_compatibility_contract_v2",
    "harden_security_compatibility_contract_v2",
  ]) assert.ok(REQUIRED_SECURITY_MIGRATION_NAMES.includes(name), name);
  assert.equal(REQUIRED_SECURITY_MIGRATION_NAMES.includes("20260820010000_enforce_furvise_memory_semantic_integrity"), false);
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

test("hardened V2 contract detects effective privilege and overload drift", () => {
  const migration = source("supabase/migrations/20260824014500_harden_security_compatibility_contract_v2.sql");
  assert.match(migration, /create or replace function public\.furvise_security_compatibility_snapshot_v2/);
  assert.match(migration, /security definer[\s\S]*request\.jwt\.claim\.role[\s\S]*service_role/);
  assert.match(migration, /schema_migrations migration[\s\S]*migration\.name = v_name/);
  assert.match(migration, /pg_catalog\.pg_proc[\s\S]*proc\.proname::text = any/);
  assert.match(migration, /persist_furvise_semantic_event/);
  assert.match(migration, /persist_furvise_server_care_event/);
  assert.match(migration, /care_event_metadata/);
  assert.match(migration, /has_column_privilege\('authenticated', v_relation, v_column, 'INSERT'\)/);
  assert.match(migration, /care_history_write_authority/);
  assert.match(migration, /canonical_care_state_authority/);
  assert.match(migration, /revoke all on function public\.furvise_security_compatibility_snapshot_v2\(text\[\]\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.furvise_security_compatibility_snapshot_v2\(text\[\]\)[\s\S]*to service_role/);
  assert.match(migration, /return query select 2, array\(/);
  assert.doesNotMatch(migration, /pg_catalog\.array\(/);
});

test("SQL drift fixture covers the two launch-gate reproductions", () => {
  const sql = source("supabase/tests/security_schema_compatibility_readiness.sql");
  assert.match(sql, /grant insert \(care_event_metadata\) on table public\.pet_care_entries to authenticated/);
  assert.match(sql, /create function public\.persist_furvise_semantic_event\(text\)/);
  assert.match(sql, /required_migration_name:enforce_furvise_memory_semantic_integrity/);
  assert.match(sql, /harden_security_compatibility_contract_v2/);
});
