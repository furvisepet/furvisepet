import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Stage 2 actual historical retrieval/generation/validation regressions', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--test', 'scripts/audits/ask-history-stage-2.cases.mjs'],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.match(result.stdout, /tests [1-9]/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('prepared SQL boundary is owner-scoped, bounded, read-only to authenticated callers', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260905045120_ask_history_scoped_read.sql', import.meta.url), 'utf8');
  assert.match(sql, /owner_id uuid := auth.uid\(\)/);
  assert.match(sql, /owner_id is null then raise exception/);
  for (const alias of ['c', 'r', 'l', 'e', 'm']) assert.ok(sql.includes(`${alias}.user_id = owner_id`));
  assert.match(sql, /cardinality\(p_care_ids\).* > 64/);
  assert.match(sql, /revoke all on function public.read_ask_history_correction_page/);
  assert.match(sql, /grant execute on function public.read_ask_history_correction_page.*to authenticated/);
  assert.match(sql, /before delete or update on public.semantic_claim_relations/);
  assert.match(sql, /force row level security/);
  // Regression also exercised against real PostgreSQL with pg_trgm in public:
  // CREATE EXTENSION IF NOT EXISTS does not relocate an existing extension.
  assert.match(sql, /n\.oid = e\.extnamespace/);
  assert.match(sql, /%I\.gin_trgm_ops/);
  assert.doesNotMatch(sql, /extensions\.gin_trgm_ops/);
  const rpc = sql.slice(sql.indexOf('create or replace function public.read_ask_history_correction_page'));
  assert.doesNotMatch(rpc, /\b(?:insert into|update public|delete from)\b/i);
});
