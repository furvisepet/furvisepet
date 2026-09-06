import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const ascending = read('supabase/migrations/20260905080008_ask_history_candidate_read.sql');
const descending = read('supabase/migrations/20260906103706_ask_history_latest_candidates.sql');

test('latest candidate SQL retains the reviewed authentication, bounds, ownership and timeout body', () => {
  const body = sql => sql.slice(sql.indexOf(') returns table'), sql.indexOf('end $fn$;'));
  const normalizeDirection = sql => sql.replace('history_candidate_latest', 'experimental_candidate_any')
    .replace('e.occurred_at < $6', 'e.occurred_at > $6').replace('e.id<$7', 'e.id>$7')
    .replace('order by e.occurred_at desc,e.id desc', 'order by e.occurred_at,e.id');
  assert.equal(normalizeDirection(body(descending)), body(ascending));
  const grants = sql => sql.slice(sql.indexOf('revoke all on function public.read_ask_history_candidates'));
  assert.equal(grants(descending).replaceAll('read_ask_history_candidates_latest', 'read_ask_history_candidates').trim(), grants(ascending).trim());
  assert.ok(!descending.includes('create role'), 'reuse the existing least-privileged role');
  assert.match(descending, /current_user <> 'postgres'/);
});
