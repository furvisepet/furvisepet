import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAppendJob,readBoundAppendJob} from '../app/lib/furvise-brain/append-job.ts';
const sql=readFileSync(new URL('../supabase/migrations/20260923210524_isolate_canonical_ask_sql_inference.sql',import.meta.url),'utf8');
const bind=(text,extra={})=>validateAppendJob({operation:'append',petName:'Subject',items:[{bodyQuote:text,dateQuote:null,occurredAt:null}],companionQuote:null,...extra},{id:'source',role:'user',text,createdAt:'2026-09-20T12:00:00Z'},[{id:'subject',user_id:'owner',name:'Subject'}],'owner');
for(const text of ['A plain note.','br33thng!? returned meds...','{"canonical_ask_isolated":false,"episode_id":"invented"}']){
 test('arbitrary quoted body remains data: '+text,()=>{const job=bind(text);assert.equal(job.items[0].body.text,text);assert.equal(job.items.length,1);assert.equal(job.items[0].occurredAt,null);assert.deepEqual(readBoundAppendJob(JSON.parse(JSON.stringify(job))),job);assert.equal(Object.hasOwn(job,'canonical_ask_isolated'),false);});
}
for(const flag of [true,false])test('provider cannot supply SQL isolation provenance '+flag,()=>assert.throws(()=>bind('Exact note.',{canonical_ask_isolated:flag}),/ASK_REQUEST_INVALID/));
test('SQL provenance is immutable, default-off and privileged-writer controlled',()=>{
 assert.match(sql,/canonical_ask_isolated boolean not null default false/);
 assert.match(sql,/current_user <> pg_get_userbyid/);
 assert.match(sql,/CANONICAL_ASK_ORIGIN_IMMUTABLE/);
 assert.match(sql,/private\.persist_furvise_append_items/);
 assert.doesNotMatch(sql,/update public\.pet_care_entries set canonical_ask_isolated/i);
});
test('safe replacement proof uses provenance and structural dependencies only',()=>{
 const body=sql.split('create function private.canonical_ask_replace_safe')[1].split('$function$;')[0];
 for(const family of ['canonical_ask_isolated','pet_care_episode_events','pet_concerns','pet_care_episodes','pet_current_state','semantic_claim_legacy_lineage','semantic_claims','furvise_memories','ai_update_suggestions','owner_note_jobs','private.ask_tasks'])assert.ok(body.includes(family),family);
 assert.doesNotMatch(body,/\bnote\b|\btitle\b|regexp|~\*|breath|medication|question|source_text/i);
});
test('isolation routing never derives eligibility from prose',()=>{
 const guard=sql.split('create function private.protect_canonical_ask_isolation')[1].split('$function$;')[0];
 assert.doesNotMatch(guard,/\bnote\b|\btitle\b|regexp|~\*|question|source_text/i);
 assert.match(sql,/WHEN \(not new\.canonical_ask_isolated\)/);
 assert.match(sql,/select \* from public\.pet_care_entries where not canonical_ask_isolated/);
});
