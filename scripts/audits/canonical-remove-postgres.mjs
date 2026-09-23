import test from 'node:test';
import {localSql,setup,turn,mint,append,ordinary,execute,row,block,check,q,j,id,source,owner,pet,other,otherPet,conversation,snapshot} from '../../tests/helpers/canonical-ask-postgres.mjs';
import {bindRemovePlan} from '../../app/lib/furvise-brain/remove-job.ts';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'\nROLLBACK;'));
const ready=()=>append(['Original older note.'],1)+append(['Newer note.'],2)+
 "update public.pet_care_entries set created_at=case when intelligence_source_message_id='"+source(1).source+"' then '2026-09-18'::timestamptz else '2026-09-19'::timestamptz end;\n";
const text='  Retire the supplied record; nothing else.  ';
function remove({target=row(1),latest=false,transform=v=>v}={}){
 const plan=bindRemovePlan({operation:'remove',domain:'care_history',target:'last_event_for_subject',petName:'Subject',instructionQuote:text.trim()},
 {id:source(3).source,role:'user',text,createdAt:'2026-09-20T12:00:00Z'},{id:pet,name:'Subject'},{ownerId:owner,references:[]});
 return turn(text,3)+mint({n:3,kind:'care_history.remove',target,extra:{removeJob:plan},payloadTransform:v=>{
 const bound="jsonb_build_object('recordId',"+target+",'updatedAt',(select updated_at from public.pet_care_entries where id="+target+"))";
 let p="jsonb_set("+v+",'{removeJob,resolvedTarget}',"+bound+")";
 if(!latest)p="jsonb_set("+p+",'{removeJob,target}',"+bound+"||jsonb_build_object('kind','exact_record','ref','supplied'))";
 return transform(p+"||jsonb_build_object('targetSourceId','care:'||"+target+"::text)");
 }});
}
const deny=sql=>block("begin "+sql.trim().replace(/;$/,'')+";exception when check_violation or insufficient_privilege or invalid_parameter_value or object_not_in_prerequisite_state then denied:=true;end;"+check('denied','invalid authority accepted'));
const fail=()=>block("select * into r from "+execute(3)+";"+check("not r.changed and r.action->>'status'='failed'",'unsafe remove executed'));
const intact=()=>block(check('(select deleted_at from public.pet_care_entries where id='+row(1)+') is null','failed removal touched row'));
for(const latest of [false,true])run((latest?'latest':'exact older')+' REMOVE tombstones only the frozen row with exact terminal receipt',ready()+remove({latest,target:row(latest?2:1)})+
"create temp table original as select * from public.pet_care_entries;\n"+block(
"select * into r from "+execute(3)+";"+check("r.changed and r.action->>'status'='succeeded'",'remove failed')+
check('(select count(*) from public.pet_care_entries)=2','physical deletion')+
check('(select deleted_at is not null and deleted_by='+q(owner)+" and deletion_reason='user_removed' from public.pet_care_entries where id="+row(latest?2:1)+')','missing tombstone')+
check("not exists(select 1 from public.pet_care_entries e join original o using(id) where (to_jsonb(e)-array['deleted_at','deleted_by','deletion_reason','updated_at'])<>(to_jsonb(o)-array['deleted_at','deleted_by','deletion_reason','updated_at']))",'record content rewritten')+
check('(select count(*) from public.pet_care_entries where deleted_at is null)=1','tombstone still current')+
check("r.action->'removeJob'=(select action_payload->'removeJob' from public.ask_action_capabilities where id='"+source(3).cap+"')",'job receipt changed')+
"select * into replay from "+execute(3)+";"+check('not replay.changed and replay.action=r.action','replay changed')+
check('(select count(*) from public.pet_current_state)=0 and (select count(*) from public.pet_care_episodes)=0','derived state inferred')));
for(const latest of [false,true])run('concurrent newer append does not reselect '+latest,ready()+remove({latest,target:row(latest?2:1)})+append(['Concurrent record.'],4)+block(
"select * into r from "+execute(3)+";"+check('r.changed','frozen remove failed')+
check('(select deleted_at from public.pet_care_entries where id='+row(4)+') is null','concurrent row removed')));
for(const mode of ['auto','cancel'])run(mode+' cannot authorize REMOVE',ready()+remove()+block(
"select * into r from "+execute(3,mode)+";"+check("not r.changed and r.action->>'status'='"+(mode==='auto'?'failed':'cancelled')+"'",'confirmation changed'))+intact());
run('foreign owner cannot execute REMOVE',ready()+remove()+block(check('(select count(*) from '+execute(3,'confirm',other)+')=0','foreign execution'))+intact());
for(const field of ['user_id','pet_profile_id'])run('foreign '+field+' target cannot mint',
(field==='pet_profile_id'?"insert into public.dog_profiles(id,user_id,name,species)values('"+id(72)+"','"+owner+"','Other subject','dog');\n":"")+ready()+
"insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at)values('"+id(71)+"','"+(field==='user_id'?other:owner)+"','"+(field==='user_id'?otherPet:id(72))+"','general','Other','Other','2026-09-18');\n"+deny(remove({target:q(id(71))})));
for(const set of ["note='Intervening revision.'","deleted_at=clock_timestamp(),deletion_reason='Prior removal'"])run(set+' invalidates REMOVE without choosing another row',ready()+remove()+
'update public.pet_care_entries set '+set+' where id='+row(1)+';\n'+fail()+block(check('(select deleted_at from public.pet_care_entries where id='+row(2)+') is null','other row touched')));
run('unbound model REMOVE cannot mint',ready()+turn(text,3)+deny(mint({n:3,kind:'care_history.remove',target:row(1)})));
for(const field of ['targetSourceId','removeJob,resolvedTarget,recordId','removeJob,sourceMessageId','removeJob,instruction,text','input,detail'])run('binding rejects tampered '+field,ready()+deny(remove({transform:v=>"jsonb_set("+v+",'{"+field+"}',"+j(id(999))+")"})));
run('capability target cannot change after mint',ready()+remove()+deny("update public.ask_action_capabilities set target_id="+row(2)+" where id='"+source(3).cap+"'"));
run('legacy episode and concern target rejected without derived-state cleanup',ordinary()+remove({target:q(id(61))})+
'create temp table original as select '+snapshot+' facts;\n'+fail()+block(check('(select deleted_at from public.pet_care_entries where id='+q(id(61))+') is null','legacy removed')+check(snapshot+'=(select facts from original)','dependent state changed')));
const dependencies={
 'current-state array':"insert into public.pet_current_state(pet_profile_id,user_id,state,source_event_ids)values('"+pet+"','"+owner+"','{}',array["+row(1)+"]);",
 'medication JSON':"insert into public.pet_current_state(pet_profile_id,user_id,state)values('"+pet+"','"+owner+"',jsonb_build_object('currentMedications',jsonb_build_array(jsonb_build_object('sourceEventId',"+row(1)+"))));",
 'concern reference':"insert into public.pet_concerns(user_id,pet_profile_id,title,normalized_key,status,severity,source_care_entry_id)values('"+owner+"','"+pet+"','Existing','ref','active','routine',"+row(1)+");",
 'suggestion reference':"insert into public.ai_update_suggestions(user_id,pet_profile_id,type,title,care_entry_id)values('"+owner+"','"+pet+"','history','Existing',"+row(1)+");",
 'enrichment reference':"insert into public.owner_note_jobs(entry_id,user_id,pet_profile_id,source_revision)values("+row(1)+",'"+owner+"','"+pet+"','revision');",
 'task reference':"insert into private.ask_tasks(user_id,conversation_id,source_message_id,authorization_message_id,last_message_id,last_sequence,status,pet_id,entry_id)values('"+owner+"','"+conversation+"','"+source(1).source+"','"+source(1).source+"','"+source(1).source+"',1,'completed','"+pet+"',"+row(1)+");"
};
for(const [name,sql]of Object.entries(dependencies))run(name+' added after binding blocks REMOVE',ready()+remove()+sql+
'create temp table original as select '+snapshot+' facts;\n'+fail()+intact()+block(check(snapshot+'=(select facts from original)','dependent state changed')));
run('non-Ask legacy removal remains separate and preserves existing dismissal behavior',ordinary()+block(
"select private.remove_ask_action_care_entry('"+owner+"','"+id(61)+"') into denied;"+check('denied','legacy remove blocked')+
check("(select deleted_at from public.pet_care_entries where id='"+id(61)+"') is not null",'legacy not tombstoned')+
check("not exists(select 1 from public.pet_care_episodes where status in ('active','monitoring'))",'legacy dismissal changed')));
run('unsupported REMOVE suggestions cannot gain continuation authority',ready()+remove()+deny("select * from public.persist_ask_canonical_suggestion('"+owner+"','"+source(3).cap+"')")+intact());
run('receipt failure rolls back the tombstone',ready()+remove()+
"create function pg_temp.reject_receipt() returns trigger language plpgsql as $$ begin if new.action_kind='care_history.remove' and new.status='succeeded' then raise exception 'TEST_RECEIPT_FAILURE';end if;return new;end $$;create trigger zz_reject_remove_receipt before update on public.ask_action_capabilities for each row execute function pg_temp.reject_receipt();\n"+
block("begin perform * from "+execute(3)+";exception when raise_exception then if sqlerrm<>'TEST_RECEIPT_FAILURE' then raise;end if;denied:=true;end;"+check('denied','receipt failure missing')+
check("(select status from public.ask_action_capabilities where id='"+source(3).cap+"')='pending'",'partial receipt'))+intact());
run('canonical REMOVE helper is private and legacy helper is absent from canonical executor',block(
check("not has_function_privilege('service_role','private.remove_canonical_ask_care_entry(public.ask_action_capabilities)','execute')",'helper exposed')+
check("position('private.remove_ask_action_care_entry' in pg_get_functiondef('private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)'::regprocedure))=0",'legacy side effects reachable')));

run('episode membership added after binding prevents removal without dismissing episode',ordinary()+ready()+remove()+
"insert into public.pet_care_episode_events(care_entry_id,episode_id,user_id,pet_profile_id,event_ordinal,event_role,occurred_at)select "+row(1)+",episode_id,'"+owner+"','"+pet+"',99,'continuation','2026-09-19' from public.pet_care_entries where id='"+id(61)+"';\n"+
'create temp table original as select '+snapshot+' facts;\n'+fail()+intact()+block(check(snapshot+'=(select facts from original)','episode changed')));
run('memory reference prevents removal without rewriting remembered facts',ready()+remove()+
"insert into public.furvise_memories(user_id,pet_id,subject_type,category,fact_key,fact_value,normalized_value,confidence,importance,durability,source_type,source_id,dedupe_key)values('"+owner+"','"+pet+"','pet','behavior','approachSensitivity',to_jsonb('Prefers quiet surroundings'::text),'prefers quiet surroundings',1,'low','durable','care_entry',"+row(1)+",'fixture');\n"+
fail()+intact()+block(check('(select count(*) from public.furvise_memories)=1','memory changed')));
