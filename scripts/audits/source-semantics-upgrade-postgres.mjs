
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeAskSchema} from './helpers/ask-schema.mjs';
import {localSql,setup,ordinary,boundAppend,append,execute,block,check,q,owner,pet} from '../../tests/helpers/canonical-ask-postgres.mjs';
test('134 to 135 preserves legacy receipts and requires explicit source semantics import',async()=>{
 const version='20260927061142';let deferred=0;
 const db={exec:async sql=>{if(sql.includes('create function private.ask_source_semantics_snapshot')){deferred++;return;}return localSql(sql);},
  query:async(sql,values)=>({rows:values[0]===version?[]:localSql(sql.replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1])))})};
 const count=await initializeAskSchema(db);assert.equal(count,135);assert.equal(deferred,1);
 localSql(setup()+ordinary()+boundAppend(['Pending exact note.']).sql+append(['Succeeded exact note.'],2)+
  boundAppend(['Failed exact note.'],3).sql+`select * from ${execute(3,'auto')};`+
  boundAppend(['Cancelled exact note.'],4).sql+`select * from ${execute(4,'cancel')};COMMIT;`);
 const snapshot=()=>localSql(`select jsonb_agg(to_jsonb(c)order by id)from public.ask_action_capabilities c where user_id='${owner}';`);
 const before=snapshot();
 localSql('begin;'+readFileSync(new URL('../../supabase/migrations/20260927061142_attributed_source_semantics.sql',import.meta.url),'utf8')+'commit;');
 assert.equal(snapshot(),before,'migration must not rewrite prior capability authority or receipts');
 localSql(block(check("(select count(*) from public.semantic_claims where governance_metadata ? 'sourceSemanticsPayload')=0",'migration invented source semantics'))+
  `select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`+
  block(check(`not(public.read_ask_source_semantics(array['${pet}'::uuid],'{}')->>'complete')::boolean`,'legacy source assumed classified'))+'reset role;');
 localSql(block(`for r in select * from public.pet_care_entries where user_id='${owner}' and deleted_at is null loop
  perform public.import_ask_source_semantics('${owner}',jsonb_build_object('version','source-semantics.v1',
   'source',(select private.ask_source_semantics_snapshot(e) from public.pet_care_entries e where e.id=r.id),'classification','observation','target',null)::text);
 end loop;`)+`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;`+
 block(check(`(public.read_ask_source_semantics(array['${pet}'::uuid],'{}')->>'complete')::boolean`,'reviewed import remains unavailable'))+'reset role;');
 localSql("select set_config('request.jwt.claim.role','service_role',false);"+block(`select * into r from ${execute(1)};`+check("r.changed and r.action->>'status'='succeeded'",'pre-upgrade pending capability changed')+
 check("(select count(*) from public.semantic_claims where (governance_metadata->>'sourceSemanticsPayload')::jsonb->>'classification'='unknown')=1",'old pending job inferred meaning')));
 console.log('baseline migrations 134; final migrations 135; legacy pending/succeeded/failed/cancelled preserved; reviewed import verified');
});
