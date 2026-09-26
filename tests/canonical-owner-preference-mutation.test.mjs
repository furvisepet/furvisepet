import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260926044500_canonical_owner_preference_mutation.sql", import.meta.url), "utf8");

test("owner preference capability execution stays USER-scoped and source-bound", () => {
  assert.match(migration, /fieldMutationJob,domain}'' is distinct from ''owner_preference''/);
  assert.match(migration, /fieldMutationJob,ownerId}'' is distinct from v\.user_id::text/);
  assert.match(migration, /fieldMutationJob,sourceMessageId}'' is distinct from v\.source_message_id::text/);
  assert.match(migration, /user_id,pet_id,subject_type,category,fact_key/);
  assert.match(migration, /v\.user_id,null,''owner'',''communication_preference''/);
  assert.match(migration, /''ask_message'',v\.source_message_id/);
  assert.match(migration, /fieldMutationJob,instruction,text/);
});

test("preference set uses existing semantic validator and singleton supersession table", () => {
  assert.match(migration, /public\.is_valid_furvise_preference/);
  assert.match(migration, /insert into public\.furvise_memories/);
  for (const field of ["preferred_language","preferred_units","communication_style"]) assert.match(migration,new RegExp(field));
});

test("preference forget uses canonical rejected terminal state", () => {
  assert.match(migration, /status=''rejected''/);
  assert.match(migration, /public\.normalize_furvise_preference_key/);
  assert.doesNotMatch(migration, /currentMessage|question|includes\(|like '%|regexp_matches/);
});

test("preference clear accepts typed JSON null value fields", () => {
  assert.match(migration, /jsonb_typeof\(v\.action_payload#>''\{fieldMutationJob,value\}''\) is distinct from ''null''/);
  assert.match(migration, /jsonb_typeof\(v\.action_payload#>''\{fieldMutationJob,valueSource\}''\) is distinct from ''null''/);
  assert.doesNotMatch(migration, /fieldMutationJob,value\}'' is not null/);
});
