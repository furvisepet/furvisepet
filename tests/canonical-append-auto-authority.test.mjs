import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260926035500_enable_canonical_append_auto_authority.sql", import.meta.url), "utf8");
const finalExecutor = readFileSync(new URL("../supabase/migrations/20260923231742_canonical_pet_remove_receipt_survival.sql", import.meta.url), "utf8");

test("canonical append auto authority changes only the stale append mode guard", () => {
  assert.match(finalExecutor, /if p_mode <> 'confirm' or v\.explicit_intent/);
  assert.match(migration, /p_mode not in \(''confirm'',''auto''\)/);
  assert.match(migration, /LOW_RISK_REVERSIBLE \+ explicit_intent policy \+ explicit_intent=true/);
  assert.doesNotMatch(migration, /currentMessage|question|includes\(|like '%|regexp_matches/);
});

test("shared executor still owns auto authorization before canonical append", () => {
  assert.match(finalExecutor, /p_mode = 'auto' and not \([\s\S]*v\.safety_class = 'LOW_RISK_REVERSIBLE'[\s\S]*v\.confirmation_policy = 'explicit_intent'[\s\S]*v\.explicit_intent/);
  assert.match(migration, /pg_get_functiondef\([\s\S]*private\.execute_ask_action_capability/);
  assert.match(migration, /revoke all on function private\.execute_ask_action_capability/);
});
