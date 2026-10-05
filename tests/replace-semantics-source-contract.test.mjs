import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import {readWriteSourceSemantics}from'../app/lib/furvise-brain/source-semantics.ts';
const oldPath='supabase/migrations/20260923221741_generalize_canonical_replace_targets.sql';
const newPath='supabase/migrations/20261004171300_validate_canonical_replace_write_semantics.sql';
const old=readFileSync(oldPath,'utf8'),sql=readFileSync(newPath,'utf8');
test('immutable old validator evidence is preserved, and only WRITE semantics extends the binding predicate',()=>{
 assert.equal(createHash('sha256').update(readFileSync(oldPath)).digest('hex'),'813e334ceb4b55ad55eaabd0e2d4e2455721173644349de5d41c7a73fbec09b6');
 const start='create function private.canonical_replace_matches';
 const baseline=old.slice(old.indexOf(start),old.indexOf('\ncreate function private.bind_canonical_replace_capability')).trim();
 let candidate=sql.slice(sql.indexOf('create or replace function private.canonical_replace_matches'),sql.lastIndexOf('\ncommit;')).trim();
 candidate=candidate.replace('create or replace function','create function').replace("'constraints','semantics']","'constraints']").replace('  if private.canonical_replace_write_semantics_valid(j) is not true then return false; end if;\n','');
 assert.equal(candidate,baseline,'all pre-existing owner/source/body/span/target/version/constraint checks must remain byte-identical');
});
test('new migration is transactional, private, prerequisite-bound and does not backfill or infer source truth',()=>{
 assert.match(sql,/begin;\s*do \$precondition\$/);assert.match(sql,/stamp_canonical_source_semantics\(\)/);assert.match(sql,/commit;\s*$/);
 assert.doesNotMatch(sql,/\b(?:insert into|update public|delete from|drop|grant execute)\b/i);
 assert.match(sql,/revoke all on function private.canonical_replace_write_semantics_valid\(jsonb\) from public,anon,authenticated,service_role/);
 assert.match(sql,/if not \(j \? 'semantics'\) then return true/);
 const stamp=readFileSync('supabase/migrations/20260927061142_attributed_source_semantics.sql','utf8');
 assert.match(stamp,/meaning:=coalesce\(new.action_payload#>'\{replaceJob,semantics\}','\{"classification":"unknown","target":null\}'::jsonb\)/);
});
test('SQL WRITE shape requires exact keys, null concept identity, valid temporal boundaries and closed classification alternatives',()=>{
 for(const token of ["s-array['classification','target']","s ?& array['classification','target']","t-array['kind','from','to','conceptKey']","t ?& array['kind','from','to','conceptKey']","t->'conceptKey' is distinct from 'null'::jsonb","private.canonical_replace_instant_valid(boundary) is not true","from_at>=to_at","t=jsonb_build_object('kind','target_unknown')"] )assert.ok(sql.includes(token),token);
 for(const kind of ['source','claim'])assert.equal(readWriteSourceSemantics({classification:'attributed_correction',target:{kind,id:'unbound-id'}}),null);
});
