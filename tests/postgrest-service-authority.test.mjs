import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REQUIRED_SECURITY_MIGRATION_NAMES,
  schemaReadinessFailures,
} from "../app/lib/operations/readiness.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260825002500_harden_postgrest_service_authority.sql");
const volatilityMigration = source("supabase/migrations/20260825004500_correct_postgrest_service_authority_volatility.sql");
const fixture = source("supabase/tests/postgrest_service_authority.sql");

test("service authority follows the PostgREST request role and bridges legacy claim guards only after validation", () => {
  assert.match(migration, /private\.require_service_role_request/);
  assert.match(migration, /current_setting\('role', true\)/);
  assert.match(migration, /request\.jwt\.claims/);
  assert.match(migration, /request\.jwt\.claim\.role/);
  assert.match(migration, /SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /set_config\(\s*'request\.jwt\.claims'/);
  assert.match(migration, /jsonb_build_object\('role', 'service_role'\)/);
  assert.match(migration, /set_config\('request\.jwt\.claim\.role', 'service_role'/);
  assert.match(migration, /security invoker[\s\S]*private\.require_service_role_request/);
  assert.match(
    volatilityMigration,
    /alter function private\.require_service_role_request\(\)[\s\S]*volatile;/,
  );
});

test("idempotency and billing keep their public signatures while proven implementations become private", () => {
  for (const name of [
    "claim_idempotency_operation",
    "complete_idempotency_operation",
    "fail_idempotency_operation",
    "abandon_idempotency_operation",
    "cleanup_expired_idempotency_operations",
    "claim_billing_checkout_single_flight",
    "claim_billing_checkout_single_flight_v2",
    "complete_billing_checkout_single_flight",
    "abandon_billing_checkout_single_flight",
    "reset_billing_checkout_single_flight",
  ]) {
    assert.match(migration, new RegExp(`alter function public\\.${name}`), name);
    assert.match(migration, new RegExp(`create function public\\.${name}`), name);
    assert.match(migration, new RegExp(`${name}_pre_postgrest_service_authority`), name);
  }
  assert.match(migration, /perform private\.require_service_role_request\(\)/);
  assert.match(migration, /grant execute on function public\.claim_idempotency_operation[\s\S]*to service_role/);
  assert.match(migration, /grant execute on function public\.claim_billing_checkout_single_flight_v2[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.claim_idempotency_operation[\s\S]*from public, anon, authenticated, service_role/);
});

test("readiness replaces obsolete billing guard regexes with request-role-aware semantic authority", () => {
  assert.match(migration, /furvise_security_compatibility_snapshot_v2_pre_postgrest_service_authority/);
  assert.match(migration, /array_remove[\s\S]*billing_checkout_authority/);
  assert.match(migration, /array_remove[\s\S]*billing_checkout_currency_authority/);
  assert.match(migration, /service_request_authority/);
  assert.match(migration, /private\.billing_checkout_single_flights/);
  assert.match(migration, /not pg_catalog\.has_function_privilege\('authenticated'/);
  assert.match(migration, /not pg_catalog\.has_table_privilege\('service_role', v_relation, 'UPDATE'\)/);
  assert.ok(REQUIRED_SECURITY_MIGRATION_NAMES.includes("harden_postgrest_service_authority"));
  assert.deepEqual(
    schemaReadinessFailures({
      billingAccountsError: null,
      deletionTombstonesError: null,
      latestMigration: "20260825002500",
      securityCompatibility: { contract_version: 2, failed_checks: ["service_request_authority"] },
      securityCompatibilityError: null,
    }),
    ["service_request_authority"],
  );
});

test("SQL fixture covers opaque-secret role behavior and browser denial", () => {
  assert.match(fixture, /set local role service_role/);
  assert.match(fixture, /set_config\('request\.jwt\.claims', '', true\)/);
  assert.match(fixture, /claim_idempotency_operation/);
  assert.match(fixture, /claim_billing_checkout_single_flight_v2/);
  assert.match(fixture, /furvise_security_compatibility_snapshot_v2/);
  assert.match(fixture, /harden_postgrest_service_authority/);
  assert.match(fixture, /set local role authenticated/);
  assert.match(fixture, /when insufficient_privilege then null/);
  assert.match(fixture, /rollback;/);
});
