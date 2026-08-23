import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REQUIRED_SECURITY_MIGRATIONS,
  SECURITY_SCHEMA_CONTRACT_VERSION,
  requiredSchemaIsReady,
  schemaReadinessFailures,
} from "../app/lib/operations/readiness.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compatible = { contract_version: SECURITY_SCHEMA_CONTRACT_VERSION, failed_checks: [] };
const valid = {
  billingAccountsError: null,
  deletionTombstonesError: null,
  latestMigration: REQUIRED_SECURITY_MIGRATIONS.at(-1),
  securityCompatibility: compatible,
  securityCompatibilityError: null,
};

test("current security compatibility contract is ready", () => {
  assert.equal(requiredSchemaIsReady(valid), true);
  assert.deepEqual(schemaReadinessFailures(valid), []);
});

test("old migration floor and each security capability failure fail closed", () => {
  assert.equal(requiredSchemaIsReady({
    ...valid,
    latestMigration: "20260818084249",
    securityCompatibility: { ...compatible, failed_checks: ["required_migration:20260823120002"] },
  }), false);
  for (const failure of [
    "canonical_memory_authority",
    "action_capability_authority",
    "care_history_write_authority",
    "entitlement_pet_boundary",
    "permanent_delete_authority",
    "ai_credit_authority",
  ]) {
    assert.deepEqual(schemaReadinessFailures({ ...valid, securityCompatibility: { ...compatible, failed_checks: [failure] } }), [failure]);
  }
});

test("missing, failed, or malformed compatibility results fail closed", () => {
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibilityError: new Error("connection") }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: null }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: { contract_version: 2, failed_checks: [] } }), false);
  assert.equal(requiredSchemaIsReady({ ...valid, securityCompatibility: { contract_version: 1, failed_checks: "none" } }), false);
  assert.deepEqual(schemaReadinessFailures({ ...valid, securityCompatibility: { contract_version: 1, failed_checks: ["unsafe\nlog"] } }), ["compatibility_result_invalid"]);
  assert.equal(requiredSchemaIsReady({ ...valid, latestMigration: undefined }), false);
});

test("required set is explicit and does not fail solely for an unrelated later migration", () => {
  assert.ok(REQUIRED_SECURITY_MIGRATIONS.includes("20260823062212"));
  assert.ok(REQUIRED_SECURITY_MIGRATIONS.includes("20260823120002"));
  assert.equal(REQUIRED_SECURITY_MIGRATIONS.includes("20260821062935"), false);
  assert.equal(requiredSchemaIsReady(valid), true);
});

test("route performs a bounded semantic check and exposes only generic component state", () => {
  const route = source("app/api/readiness/route.ts");
  assert.match(route, /furvise_security_compatibility_snapshot/);
  assert.match(route, /p_required_migrations: \[\.\.\.REQUIRED_SECURITY_MIGRATIONS\]/);
  assert.match(route, /SCHEMA_COMPATIBILITY:\$\{failure\}/);
  assert.match(route, /Response\.json\(\{ components, status:/);
  assert.doesNotMatch(route, /Response\.json\(\{[^}]*failures/);
  assert.doesNotMatch(route, /failed_checks.*Response/);
});

test("compatibility RPC is service-only, read-only, and uses stable failure codes", () => {
  const migration = source("supabase/migrations/20260823120003_add_security_schema_compatibility_readiness.sql");
  assert.match(migration, /security definer[\s\S]*request\.jwt\.claim\.role[\s\S]*service_role/);
  assert.match(migration, /revoke all on function public\.furvise_security_compatibility_snapshot\(text\[\]\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.furvise_security_compatibility_snapshot\(text\[\]\)[\s\S]*to service_role/);
  const body = migration.slice(migration.indexOf("as $$"), migration.indexOf("$$;", migration.indexOf("as $$")));
  assert.doesNotMatch(body, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s+table|create\s+(?:table|function)|drop\s+)\b/i);
  for (const code of ["canonical_memory_authority", "action_capability_authority", "care_history_write_authority", "entitlement_pet_boundary"]) {
    assert.match(body, new RegExp(`'${code}'`));
  }
});
