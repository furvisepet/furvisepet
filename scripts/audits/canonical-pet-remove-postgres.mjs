import test from 'node:test';
import {bindRemovePlan} from '../../app/lib/furvise-brain/remove-job.ts';
import {setup,localSql,id,owner,pet,other,otherPet,conversation,q,j,check,block,turn,mint,source,execute,append,ordinary} from '../../tests/helpers/canonical-ask-postgres.mjs';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'ROLLBACK;'));
const text='  Source instruction with arbitrary wording.  ';
function removal(n=2,transform=v=>v){const s=source(n),plan=bindRemovePlan({operation:'remove',domain:'pet_profile',target:'subject_profile',petName:'Subject',instructionQuote:text.trim()},
 {id:s.source,role:'user',text,createdAt:'2026-09-20T12:00:00Z'},{id:pet,name:'Subject'},{ownerId:owner,references:[]});
 return turn(text,n)+mint({n,kind:'pet.delete_permanently',extra:{safetyClass:'DESTRUCTIVE',confirmationPolicy:'always',authorizationScope:'owned_pet',status:'confirmation_required',input:{field:null,value:null,title:null,detail:null,category:null,target:'selected'}},
 payloadTransform:v=>transform(v+"||jsonb_build_object('removeJob',"+j(plan)+"||jsonb_build_object('resolvedTarget',jsonb_build_object('recordId','"+pet+"','updatedAt',(select updated_at from public.dog_profiles where id='"+pet+"'))))")});}
const exists=()=>block(check("exists(select 1 from public.dog_profiles where id='"+pet+"')",'pet missing'));
const deny=sql=>block("begin "+sql.trim().replace(/;$/,'')+";exception when check_violation or insufficient_privilege or raise_exception or no_data_found or object_not_in_prerequisite_state then denied:=true;end;"+check('denied','expected rejection'));
const success=(n=2)=>block('select * into r from '+execute(n)+';'+check("r.changed and r.action->>'status'='succeeded'",'remove did not succeed'));
run('canonical pet REMOVE survives the pet, conversation and message cascade with its exact receipt',append(['A historical record.'])+ordinary()+removal()+
 "create temp table original_cap as select * from public.ask_action_capabilities where id='"+source(2).cap+"';\n"+success()+block(
 check("not exists(select 1 from public.dog_profiles where id='"+pet+"')",'profile retained')+
 check("not exists(select 1 from public.ask_conversations where id='"+conversation+"') and not exists(select 1 from public.ask_conversation_messages where conversation_id='"+conversation+"')",'conversation retained')+
 check("not exists(select 1 from public.pet_care_entries where pet_profile_id='"+pet+"') and not exists(select 1 from public.pet_care_episodes where pet_profile_id='"+pet+"') and not exists(select 1 from public.pet_concerns where pet_profile_id='"+pet+"') and not exists(select 1 from public.pet_current_state where pet_profile_id='"+pet+"')",'linked data retained')+
 check("exists(select 1 from public.ask_action_capabilities c join original_cap o using(id) where c.status='succeeded' and c.action_payload=o.action_payload and c.source_message_id=o.source_message_id and c.assistant_message_id=o.assistant_message_id and c.pet_profile_id=o.pet_profile_id and c.receipt->'removeJob'=o.action_payload->'removeJob')",'receipt/provenance lost')+
 "select * into replay from "+execute(2)+";"+check("not replay.changed and replay.action=(select receipt from public.ask_action_capabilities where id='"+source(2).cap+"')",'replay lost')+
 check("(select status from public.ask_action_capabilities where id='"+source(1).cap+"')='succeeded'",'historical receipt lost')));
run('pending siblings cancel, terminal siblings stay immutable and foreign pets remain',append(['First.'])+removal(2)+removal(3)+success(2)+block(
 check("(select status from public.ask_action_capabilities where id='"+source(3).cap+"')='cancelled'",'pending orphan')+
 "select * into replay from "+execute(3)+";"+check("not replay.changed and replay.action->>'status'='cancelled'",'sibling executed')+
 check("exists(select 1 from public.dog_profiles where id='"+otherPet+"')",'foreign deletion'))+
 deny("update public.ask_action_capabilities set receipt=receipt||jsonb_build_object('changed',true) where id='"+source(1).cap+"'"));
for(const mode of ['auto','cancel'])run(mode+' cannot remove a pet',removal()+block('select * into r from '+execute(2,mode)+';'+check("not r.changed and r.action->>'status'='"+(mode==='auto'?'failed':'cancelled')+"'",'mode guard')+'select * into replay from '+execute(2)+';'+check('not replay.changed and replay.action=r.action','terminal reopened'))+exists());
for(const field of ['sourceMessageId','petId','domain','target','resolvedTarget,recordId','resolvedTarget,updatedAt','instruction,text'])run('pet RemoveJob rejects '+field+' tamper',deny(removal(2,v=>"jsonb_set("+v+",'{removeJob,"+field+"}',"+j(field==='resolvedTarget,updatedAt'?'2000-01-01':id(99))+")"))+exists());
for(const extra of [{explicitIntent:true},{targetSourceId:'care:'+id(9)},{input:{field:null,value:null,title:null,detail:'Extra meaning',category:null,target:'selected'}}])run('action binding rejects '+Object.keys(extra)[0],deny(removal(2,v=>v+'||'+j(extra)))+exists());
run('model-shaped permanent delete cannot mint',deny(removal(2,v=>'('+v+")-'removeJob'"))+exists());
for(const field of ['source_message_id','assistant_message_id','pet_profile_id','user_id'])run('mint requires existing owned '+field,deny(removal().replace(field==='source_message_id'?q(source(2).source)+','+q(source(2).request+':action'):field==='assistant_message_id'?q(source(2).assistant)+','+q(source(2).source):field==='pet_profile_id'?q('pet.delete_permanently')+','+q(pet):q(source(2).cap)+','+q(owner),
 field==='source_message_id'?q(id(999))+','+q(source(2).request+':action'):field==='assistant_message_id'?q(id(999))+','+q(source(2).source):field==='pet_profile_id'?q('pet.delete_permanently')+','+q(otherPet):q(source(2).cap)+','+q(other)))+exists());
run('wrong user or assistant cannot execute a valid capability',removal()+block(
 check('(select count(*) from '+execute(2,'confirm',other)+')=0','foreign owner executed')+
 check("(select count(*) from public.execute_ask_action_capability('"+source(2).cap+"','"+id(999)+"','"+owner+"','confirm',null))=0",'wrong assistant executed'))+exists());
run('changed profile generation fails closed',removal()+"update public.dog_profiles set name='Changed' where id='"+pet+"';\n"+block('select * into r from '+execute(2)+';'+check("not r.changed and r.action->>'status'='failed'",'stale executed'))+exists());
run('pet deletion failure rolls back success receipt and all sibling changes',removal(2)+removal(3)+
 "create function pg_temp.reject_delete() returns trigger language plpgsql as $$begin raise exception 'TEST_DELETE_FAILURE';end $$;create trigger zz_test_pet_delete before delete on public.dog_profiles for each row execute function pg_temp.reject_delete();\n"+
 deny('select * from '+execute(2))+exists()+block(check("(select count(*) from public.ask_action_capabilities where status='pending' and receipt is null)=2",'receipt committed without deletion')));
run('receipt persistence failure prevents deletion',removal()+
 "create function pg_temp.reject_receipt() returns trigger language plpgsql as $$begin if new.status='succeeded' then raise exception 'TEST_RECEIPT_FAILURE';end if;return new;end $$;create trigger zz_test_receipt before update on public.ask_action_capabilities for each row execute function pg_temp.reject_receipt();\n"+
 deny('select * from '+execute(2))+exists()+block(check("(select status from public.ask_action_capabilities where id='"+source(2).cap+"')='pending'",'partial terminal state')));
run('direct product delete keeps terminal receipts and cancels pending without fabricating success',append(['History.'])+removal()+block(
 "select public.delete_pet_profile_for_user('"+owner+"','"+pet+"') into denied;"+check('denied','direct deletion blocked')+
 check("(select status from public.ask_action_capabilities where id='"+source(2).cap+"')='cancelled'",'direct delete orphan')+
 check("(select status from public.ask_action_capabilities where id='"+source(1).cap+"')='succeeded'",'terminal receipt lost')+
 "select * into replay from "+execute(2)+";"+check("not replay.changed and replay.action->>'status'='cancelled'",'direct deletion fabricated Ask success')+
 "select public.delete_pet_profile_for_user('"+owner+"','"+pet+"') into denied;"+check('not denied','repeat changed')));
run('direct deletion retains ownership and service-only policy',removal()+block(
 "select public.delete_pet_profile_for_user('"+other+"','"+pet+"') into denied;"+check('not denied','foreign direct deletion'))+exists()+
 "select set_config('request.jwt.claim.role','authenticated',true);\n"+deny("select public.delete_pet_profile_for_user('"+owner+"','"+pet+"')")+exists());
run('deleting provenance alone cancels pending and prevents executable orphans',removal()+"delete from public.ask_conversations where id='"+conversation+"';\n"+exists()+block(
 check("(select status from public.ask_action_capabilities where id='"+source(2).cap+"')='cancelled'",'source orphan')+
 "select * into replay from "+execute(2)+";"+check("not replay.changed and replay.action->>'status'='cancelled'",'orphan executed')));
run('account boundary remains a cascading foreign key',removal()+block(check("exists(select 1 from pg_constraint where conrelid='public.ask_action_capabilities'::regclass and confrelid='auth.users'::regclass and contype='f' and confdeltype='c')",'account FK removed'))+
 "delete from auth.users where id='"+owner+"';\n"+block(check("not exists(select 1 from public.ask_action_capabilities where user_id='"+owner+"')",'account data retained')));
run('client roles cannot mint or execute privileged capability internals',block(check("not has_table_privilege('authenticated','public.ask_action_capabilities','insert') and not has_function_privilege('authenticated','public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute') and not has_function_privilege('service_role','private.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute')",'privileges widened')));
