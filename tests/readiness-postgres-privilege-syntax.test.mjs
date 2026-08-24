import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260824023000_harden_security_compatibility_protected_authority_families.sql",
    import.meta.url,
  ),
  "utf8",
);

test("readiness uses only PostgreSQL-supported column privilege types", () => {
  assert.doesNotMatch(migration, /has_column_privilege\([^\n]*'DELETE'\)/);
  assert.match(migration, /has_table_privilege\('service_role', v_relation, 'DELETE'\)/);
});
