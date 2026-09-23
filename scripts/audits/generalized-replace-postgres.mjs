import test from 'node:test';
import {localSql,setup,turn,mint,append,replace,ordinary,execute,row,block,check,q,j,id,source,owner,pet,other,otherPet,snapshot} from '../../tests/helpers/canonical-ask-postgres.mjs';
import {validateReplaceJob} from '../../app/lib/furvise-brain/replace-job.ts';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'\nROLLBACK;'));
const ready=()=>append(['Original older note.'],1)+append(['Newer note.'],2)+
 "update public.pet_care_entries set created_at=case when intelligence_source_message_id='"+source(1).source+"' then '2026-09-18T00:00:00Z'::timestamptz else '2026-09-19T00:00:00Z'::timestamptz end;\n";
const body='  Exact \u732b / \u{1f43e} / e\u0301\n\tReplacement.  ';
function exact({target=row(1),text=body,transform=v=>v}={}){
 const message='Replacement instruction:\n'+text;
 const job=validateReplaceJob({operation:'replace',target:'last_event_for_subject',petName:'Subject',instructionQuote:message.trim(),bodyQuote:text,constraints:[]},
  {id:source(3).source,text:message,createdAt:'2026-09-20T12:00:00Z'},{id:pet,name:'Subject'});
 return turn(message,3)+mint({n:3,kind:'care_history.edit',target,detail:text,extra:{replaceJob:job},
 payloadTransform:v=>transform("jsonb_set("+v+",'{replaceJob,target}',jsonb_build_object('kind','exact_record','ref','supplied-handle','recordId',"+target+",'updatedAt',(select updated_at from public.pet_care_entries where id="+target+")))")});
}
const deny=sql=>block("begin "+sql+"exception when check_violation or invalid_parameter_value or object_not_in_prerequisite_state then denied:=true;end;"+check('denied','invalid authority accepted'));
run('latest selector remains the exact newest pre-turn target',ready()+replace({n:3,target:row(2)})+block(
"select * into r from "+execute(3)+";"+check("r.changed and r.action->>'status'='succeeded'",'latest failed')+
check('(select note from public.pet_care_entries where id='+row(1)+")='Original older note.'",'latest touched older row')));
run('exact supplied selector replaces older safe record and preserves Unicode body',ready()+exact()+block(
"select * into r from "+execute(3)+";"+check("r.changed and r.action->>'status'='succeeded'",'exact failed')+
check('(select note from public.pet_care_entries where id='+row(1)+')='+q(body),'body fidelity lost')+
check('(select note from public.pet_care_entries where id='+row(2)+")='Newer note.'",'exact became latest')));
run('new append before confirmation cannot change frozen exact target',ready()+exact()+append(['Newest concurrent note.'],4)+block(
"select * into r from "+execute(3)+";"+check("r.changed",'exact not executed')+
check('(select note from public.pet_care_entries where id='+row(1)+')='+q(body),'target drift')+
check('(select note from public.pet_care_entries where id='+row(4)+")='Newest concurrent note.'",'new row overwritten')));
for(const field of ['user_id','pet_profile_id'])run('foreign '+field+' target rejected before mint',
(field==='pet_profile_id'?"insert into public.dog_profiles(id,user_id,name,species)values('"+id(72)+"','"+owner+"','Other subject','dog');\n":"")+ready()+
"insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at)values('"+id(71)+"','"+(field==='user_id'?other:owner)+"','"+(field==='user_id'?otherPet:id(72))+"','general','Other','Other','2026-09-18');\n"+
deny(exact({target:q(id(71))})));
for(const change of ["deleted_at=clock_timestamp(),deletion_reason='Fixture removal'","note='Newer revision.'"])run(change+' invalidates the pending exact target',ready()+exact()+
"update public.pet_care_entries set "+change+" where id="+row(1)+";\n"+block(
"select * into r from "+execute(3)+";"+check("not r.changed and r.action->>'status'='failed'",'stale target executed')+
check('(select note from public.pet_care_entries where id='+row(2)+")='Newer note.'",'fallback selected another row')));
run('unsafe inference-dependent exact target fails without changing derived state',ordinary()+exact({target:q(id(61))})+
"create temp table prior as select "+snapshot+" facts;\n"+block(
"select * into r from "+execute(3)+";"+check("not r.changed and r.action->>'status'='failed'",'unsafe target executed')+
check(snapshot+'=(select facts from prior)','derived state changed')));
run('a dependency added after exact binding still prevents mutation',ready()+exact()+
"insert into public.pet_current_state(pet_profile_id,user_id,state,source_event_ids)values('"+pet+"','"+owner+"','{}',array["+row(1)+"]);\n"+block(
"select * into r from "+execute(3)+";"+check("not r.changed and r.action->>'status'='failed'",'new dependency bypassed')));
run('over-limit replacement is rejected at SQL authority binding',ready()+deny(exact({transform:v=>
"jsonb_set(jsonb_set("+v+",'{replaceJob,body,text}',"+j('x'.repeat(1001))+"),'{input,detail}',"+j('x'.repeat(1001))+")"})));
run('canonical target mismatch is rejected at capability mint',ready()+deny(exact({transform:v=>
"jsonb_set("+v+",'{replaceJob,target,recordId}',to_jsonb("+row(2)+"))"})));
run('body action mismatch is rejected at capability mint',ready()+deny(exact({transform:v=>
"jsonb_set("+v+",'{input,detail}',"+j('Forged replacement')+")"})));
run('stored target and job cannot be changed after mint',ready()+exact()+deny(
"update public.ask_action_capabilities set target_id="+row(2)+" where id='"+source(3).cap+"';\n")+deny(
"update public.ask_action_capabilities set action_payload=jsonb_set(action_payload,'{replaceJob,target,recordId}',to_jsonb("+row(2)+")) where id='"+source(3).cap+"';\n"));
run('unbound model edit cannot mint a durable capability',ready()+turn('Unbound edit',3)+deny(
mint({n:3,kind:'care_history.edit',target:row(1),detail:'Unbound edit'})));
run('persisted suggestion keeps exact selector through execute and replay',ready()+exact()+
"select * from public.persist_ask_canonical_suggestion('"+owner+"','"+source(3).cap+"');\n"+
"create temp table original_job as select canonical_payload from public.ai_update_suggestions;\n"+block(
"select * into r from public.execute_ask_canonical_suggestion('"+owner+"',(select id from public.ai_update_suggestions),'"+source(3).cap+"');"+
"select * into replay from public.execute_ask_canonical_suggestion('"+owner+"',(select id from public.ai_update_suggestions),'"+source(3).cap+"');"+
check('r.changed and not replay.changed and r.action=replay.action','suggestion replay diverged')+
check('(select canonical_payload from public.ai_update_suggestions)=(select canonical_payload from original_job)','selector changed')+
check("(select canonical_payload#>>'{job,target,kind}' from public.ai_update_suggestions)='exact_record'",'selector lost')+
check('(select note from public.pet_care_entries where id='+row(2)+")='Newer note.'",'suggestion reselected latest')));
run('catalog exposes only owned safe records; unsupported references gain no handle',ready()+ordinary()+block(
check("(select count(*) from public.list_ask_replace_targets('"+owner+"',array['"+pet+"'::uuid],'2026-09-20T12:00:00Z'))=2",'unsafe catalog member')+
check("(select count(*) from public.list_ask_replace_targets('"+other+"',array['"+pet+"'::uuid],'2026-09-20T12:00:00Z'))=0",'foreign catalog leak')+
check("not has_function_privilege('authenticated','public.list_ask_replace_targets(uuid,uuid[],timestamptz)','execute')",'catalog client grant')+
check("not has_function_privilege('service_role','private.canonical_replace_matches(public.ask_action_capabilities)','execute')",'private validator exposed')));
