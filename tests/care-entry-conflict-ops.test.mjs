import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isStaleCareEntryError } from "../app/lib/care-entry-conflict.mjs";

test("stale care edits are explicit non-retryable version conflicts", () => {
  assert.equal(isStaleCareEntryError({code:"40001",message:"CARE_ENTRY_STALE"}),true);
  assert.equal(isStaleCareEntryError({code:"40001",message:"other"}),false);
  assert.equal(isStaleCareEntryError({code:"23505",message:"CARE_ENTRY_STALE"}),false);
  assert.equal(isStaleCareEntryError(null),false);
  const source=readFileSync(new URL("../app/api/care-entries/[id]/route.ts",import.meta.url),"utf8");
  assert.match(source,/isStaleCareEntryError\(error\)/);
  assert.match(source,/CARE_ENTRY_CONFLICT.*retryable: false.*status: 409/);
  assert.match(source,/p_expected_updated_at: expectedUpdatedAt/);
});
test("draft CI stays cheap without removing the release full-suite gate",() => {
  const source=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
  assert.match(source,/cancel-in-progress: true/);
  assert.match(source,/ready_for_review/);
  assert.match(source,/full-tests:[\s\S]*Full tests \(release gate\)/);
  assert.match(source,/github\.event\.pull_request\.draft == false/);
  assert.match(source,/Unfiltered full tests\s+run: npm test/);
});
