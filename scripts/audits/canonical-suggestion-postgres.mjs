// Opt-in local PostgreSQL tests. Each scenario rolls back and accepts no remote URL.
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {localSql,setup,turn,mint,boundAppend,append,ordinary,execute,row,block,check,q,j,id,source,owner,pet,other,conversation,snapshot} from '../../tests/helpers/canonical-ask-postgres.mjs';
import {validateAppendJob} from '../../app/lib/furvise-brain/append-job.ts';
import {validateReplaceJob} from '../../app/lib/furvise-brain/replace-job.ts';
import {bindStateTransitionJob} from '../../app/lib/furvise-brain/state-transition-job.ts';
import {bindFieldMutationJob} from '../../app/lib/furvise-brain/field-mutation-job.ts';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'\nROLLBACK;'));
const sid=n=>"(select id from public.ai_update_suggestions where canonical_capability_id='"+source(n).cap+"')";
const persist=(n=1)=>"select * from public.persist_ask_canonical_suggestion('"+owner+"','"+source(n).cap+"');\n";
const save=(n=1,who=owner)=>"public.execute_ask_canonical_suggestion('"+who+"',"+sid(n)+",'"+source(n).cap+"')";
const prepared=()=>boundAppend(['  Exact note.  ']).sql+persist();
const denied=sql=>block("begin "+sql+";exception when check_violation or insufficient_privilege or invalid_parameter_value then denied:=true;end;"+check('denied','tamper accepted'));
run('canonical suggestion stores exact bound APPEND then executes with isolated SQL',prepared()+block(
"select * into r from "+save()+";"+check("r.changed and r.action->>'status'='succeeded'",'append not executed')+
check('(select note from public.pet_care_entries where id='+row(1)+")='  Exact note.  '",'body changed')+
check('(select canonical_ask_isolated from public.pet_care_entries where id='+row(1)+')','isolation missing')+
check("(select status from public.ai_update_suggestions where id="+sid(1)+")='saved'",'receipt not reflected')+
check('(select count(*) from public.pet_care_episodes)=0 and (select count(*) from public.pet_concerns)=0','SQL inferred facts')));
for(const [name,path,value] of [
 ['body','job,items,0,body,text','Changed body'],['source','sourceMessageId',id(900)],['subject','job,petId',id(12)],
 ['date span','job,items,0,date',{text:'invented'}],['occurredAt','job,items,0,occurredAt','2024-01-01T00:00:00Z'],
 ['kind','kind','state_transition'],['target','targetId',id(901)],['version','version',2],
])run(name+' cannot alter stored canonical authority',prepared()+denied("update public.ai_update_suggestions set canonical_payload=jsonb_set(canonical_payload,'{"+path+"}',"+j(value)+") where id="+sid(1)));
run('row subject cannot drift independently of stored job',prepared()+denied("update public.ai_update_suggestions set pet_profile_id='"+id(12)+"' where id="+sid(1)));
run('row USER provenance cannot be replaced by another message',prepared()+turn('Another source',2)+denied("update public.ai_update_suggestions set source_message_id='"+source(2).assistant+"' where id="+sid(1)));
run('client cannot create canonical suggestion fields directly',boundAppend(['Exact note.']).sql+"set local role service_role;\n"+denied(
"insert into public.ai_update_suggestions(user_id,pet_profile_id,conversation_id,source_message_id,type,title,canonical_capability_id,canonical_payload)values('"+owner+"','"+pet+"','"+conversation+"','"+source(1).assistant+"','history','Forged','"+source(1).cap+"','{}')")+"reset role;\n");
run('canonical save and creation replay are idempotent',prepared()+persist()+block(
"select * into r from "+save()+";select * into replay from "+save()+";"+
check('r.changed and not replay.changed and r.action=replay.action','replay altered receipt')+
check('(select count(*) from public.pet_care_entries)=1 and (select count(*) from public.ai_update_suggestions)=1','duplicate effect')));
const body='  2024-02-03: Exact dated note.  ';
const dated=validateAppendJob({operation:'append',petName:'Subject',items:[{bodyQuote:body,dateQuote:'2024-02-03',occurredAt:'2024-02-03T00:00:00Z'}],companionQuote:null},{id:source(1).source,role:'user',text:body,createdAt:'2026-09-20T12:00:00Z'},[{id:pet,name:'Subject',user_id:owner}],owner);
run('bound date survives suggestion storage and execution',turn(body)+mint({job:dated})+persist()+block(
"select * into r from "+save()+";"+check("r.changed",'dated save failed')+
check('(select note from public.pet_care_entries where id='+row(1)+')='+q(body),'dated body changed')+
check('(select occurred_at from public.pet_care_entries where id='+row(1)+")='2024-02-03T00:00:00Z'::timestamptz",'date changed')));
function state(to='resolved'){
 const from=to==='resolved'?'active':'resolved',text='Perform the selected transition.';
 const job=bindStateTransitionJob({domain:'care_concern',operation:'transition',targetRef:'owned',petName:'Subject',toState:to,authorizationQuote:text},{source:{id:source(1).source,role:'user',text,createdAt:'2026-09-20T12:00:00Z'},ownerId:owner,pets:[{id:pet,name:'Subject',user_id:owner}],references:[{ref:'owned',ownerId:owner,petId:pet,concernId:id(91),status:from,title:'Existing'}]});
 return "insert into public.pet_concerns(id,user_id,pet_profile_id,title,normalized_key,status,severity)values('"+id(91)+"','"+owner+"','"+pet+"','Existing','one','"+from+"','routine'),('"+id(92)+"','"+owner+"','"+pet+"','Other','two','active','routine');\n"+
 turn(text)+mint({kind:to==='resolved'?'care_state.resolve':'care_state.reopen',target:q(id(91)),explicit:true,extra:{stateTransitionJob:job}})+persist();
}
for(const to of ['resolved','reopened'])run('exact owned concern '+to+' uses existing governed capability',state(to)+block(
"select * into r from "+save()+";"+check("r.changed and r.action->>'status'='succeeded'",'transition rejected')+
check("(select status from public.pet_concerns where id='"+id(91)+"')='"+to+"' and (select status from public.pet_concerns where id='"+id(92)+"')='active'",'transition widened')+
check('(select count(*) from public.pet_care_entries)=0','invented care event')));
run('stale concern cannot execute or become saved',state()+"update public.pet_concerns set title='Changed' where id='"+id(91)+"';\n"+block(
"select * into r from "+save()+";"+check("not r.changed and r.action->>'status'='failed'",'stale transition executed')+
check("(select status from public.pet_concerns where id='"+id(91)+"')='active'",'stale concern changed')+
check("(select status from public.ai_update_suggestions where id="+sid(1)+")='pending'",'failed receipt became success')));
run('foreign owner cannot execute stored suggestion',state()+block(
"begin perform * from "+save(1,other)+";exception when no_data_found then denied:=true;end;"+
check('denied','foreign suggestion executed')+check("(select status from public.pet_concerns where id='"+id(91)+"')='active'",'foreign state changed')));
const legacy=(type='history')=>turn('Legacy instruction')+"insert into public.ai_update_suggestions(id,user_id,pet_profile_id,conversation_id,source_message_id,type,title,details,payload)values('"+id(71)+"','"+owner+"','"+pet+"','"+conversation+"','"+source(1).assistant+"',"+q(type)+",'Legacy','Unbound prose','{\"semanticTransition\":\"opened\",\"note\":\"Legacy detail\"}');\n";
for(const type of ['history','concern_opening','concern_resolution','memory'])run('legacy '+type+' has no executable canonical authority',legacy(type)+denied("select * from public.execute_ask_canonical_suggestion('"+owner+"','"+id(71)+"','"+source(1).cap+"')")+block(check('(select count(*) from public.pet_care_entries)=0 and (select count(*) from public.pet_concerns)=0 and (select count(*) from public.furvise_memories)=0','legacy created fact')));
run('legacy compatibility save RPCs cannot bypass canonical continuation',legacy()+denied("select * from public.apply_furvise_server_state_suggestion('"+owner+"','"+id(71)+"')")+denied("select * from public.save_ask_memory_suggestion('"+owner+"','"+id(71)+"','"+pet+"','Legacy detail','behavior')"));
run('monitor is unsupported and cannot alter a concern',state()+denied("select * from public.transition_ask_suggestion('"+owner+"',"+sid(1)+",'monitor')")+block(check("(select status from public.pet_concerns where id='"+id(91)+"')='active'",'monitor mutated concern')));
run('owned legacy dismissal is idempotent workflow only',legacy()+block(
"select * into r from public.transition_ask_suggestion('"+owner+"','"+id(71)+"','dismiss');"+
"select * into replay from public.transition_ask_suggestion('"+owner+"','"+id(71)+"','dismiss');"+
check("r.apply_status='dismissed' and replay.apply_status='dismissed'",'dismiss replay changed')+check('(select count(*) from public.pet_care_entries)=0','dismiss wrote fact')));
run('edit invalidates capability without changing canonical body; alternate action endpoint cannot execute',prepared()+
"create temp table original_job as select canonical_payload from public.ai_update_suggestions;\n"+
"select * from public.edit_ask_canonical_suggestion('"+owner+"',"+sid(1)+",'New display text');\n"+
denied("select * from "+save())+block("select * into r from "+execute()+";"+
check("not r.changed and r.action->>'status'='cancelled'",'edit bypassed by action endpoint')+
check('(select canonical_payload from public.ai_update_suggestions)=(select canonical_payload from original_job)','edit changed job')+
check('(select count(*) from public.pet_care_entries)=0','edited suggestion wrote')));
run('canonical dismissal cancels its capability without patient-state effects',prepared()+
"select * from public.transition_ask_suggestion('"+owner+"',"+sid(1)+",'dismiss');\n"+denied("select * from "+save())+
block("select * into r from "+execute()+";"+check("r.action->>'status'='cancelled' and not r.changed",'dismiss left execution authority')));
run('an unrelated linked care entry cannot manufacture a saved receipt',prepared()+ordinary({category:'general',title:'Similar',note:'  Exact note.  ',severity:null})+
"update public.ai_update_suggestions set care_entry_id='"+id(61)+"' where id="+sid(1)+";\n"+
denied("update public.ai_update_suggestions set status='saved' where id="+sid(1))+
block(check("(select status from public.ai_update_suggestions where id="+sid(1)+")='pending'",'similar record marked saved')));
const replaceText='Replace this record with:  Exact replacement.  ';
const replaceJob=validateReplaceJob({operation:'replace',target:'last_event_for_subject',petName:'Subject',instructionQuote:replaceText.trim(),bodyQuote:'  Exact replacement.  ',constraints:[]},{id:source(2).source,text:replaceText,createdAt:'2026-09-20T12:00:00Z'},{id:pet,name:'Subject'});
run('safe canonical REPLACE suggestion keeps target and exact body',append(['Original note.'])+
"update public.pet_care_entries set created_at='2026-09-19T00:00:00Z' where id="+row(1)+";\n"+
turn(replaceText,2)+mint({n:2,kind:'care_history.edit',detail:replaceJob.body.text,target:row(1),extra:{replaceJob}})+persist(2)+block(
"select * into r from "+save(2)+";"+check("r.changed and r.action->>'status'='succeeded'",'safe replace rejected')+
check('(select note from public.pet_care_entries where id='+row(1)+')='+q(replaceJob.body.text),'replace body changed')+
check('(select count(*) from public.pet_care_entries)=1','replace created copy')));
run('unsafe legacy REPLACE suggestion retains Checkpoint B rejection',ordinary()+turn(replaceText,2)+
mint({n:2,kind:'care_history.edit',detail:replaceJob.body.text,target:q(id(61)),extra:{replaceJob}})+persist(2)+
"create temp table original_state as select "+snapshot+" facts;\n"+block("select * into r from "+save(2)+";"+
check("not r.changed and r.action->>'status'='failed'",'unsafe replace executed')+
check(snapshot+'=(select facts from original_state)','legacy dependents changed')));
const preferenceText='Prefer metric units.';
const fieldMutationJob=bindFieldMutationJob({domain:'owner_preference',operation:'set_field',petName:null,field:'preferred_units',instructionQuote:preferenceText,valueQuote:'metric'},{id:source(1).source,role:'user',text:preferenceText,createdAt:'2026-09-20T12:00:00Z'},[{id:pet,user_id:owner,name:'Subject'}],owner);
run('owner preference cannot bypass unsupported durable executor',turn(preferenceText)+mint({kind:'memory.set_preference',extra:{fieldMutationJob,authorizationScope:'owned_user',input:{field:'preferred_units',value:'metric',title:null,detail:null,category:null,target:'specified'}}})+persist()+block(
"select * into r from "+save()+";"+check("not r.changed and r.action->>'status'='failed'",'preference executor bypassed')+
check('(select count(*) from public.furvise_memories)=0','preference created memory')));
run('conversation cleanup can remove canonical suggestion transport',prepared()+
"delete from public.ask_conversations where id='"+conversation+"';\n"+block(
check('(select count(*) from public.ai_update_suggestions)=0 and (select count(*) from public.ask_action_capabilities)=0','cleanup blocked')));

run('suggestion created after an exact successful action receipt is already saved',append(['Exact original note.'])+persist()+block(
check("(select status from public.ai_update_suggestions where id="+sid(1)+")='saved'",'existing exact receipt not reflected')+
check("(select applied_at from public.ai_update_suggestions where id="+sid(1)+")=(select terminal_at from public.ask_action_capabilities where id='"+source(1).cap+"')",'receipt timestamp lost')));
run('matching concern state without this receipt cannot become saved',state()+
"update public.pet_concerns set status='resolved',resolved_at=clock_timestamp() where id='"+id(91)+"';\n"+block(
"select * into r from "+save()+";"+check("not r.changed and r.action->>'status'='failed'",'state coincidence authorized success')+
check("(select status from public.ai_update_suggestions where id="+sid(1)+")='pending'",'coincident state became receipt')));

run('suggestion receipt failure rolls back the exact state transition and capability receipt',state()+
"create function pg_temp.reject_suggestion_receipt() returns trigger language plpgsql as $$ begin if new.status='saved' then raise exception 'TEST_RECEIPT_FAILURE'; end if; return new; end $$;\n"+
"create trigger zz_reject_suggestion_receipt before update on public.ai_update_suggestions for each row execute function pg_temp.reject_suggestion_receipt();\n"+
block("begin perform * from "+save()+";exception when raise_exception then if sqlerrm <> 'TEST_RECEIPT_FAILURE' then raise;end if;denied:=true;end;"+
check('denied','receipt fault did not occur')+
check("(select status from public.pet_concerns where id='"+id(91)+"')='active'",'partial concern mutation')+
check("(select status from public.ask_action_capabilities where id='"+source(1).cap+"')='pending'",'partial capability receipt')+
check("(select status from public.ai_update_suggestions where id="+sid(1)+")='pending'",'partial suggestion receipt')));
for(const file of ['ask_suggestion_canonical_memory.sql','ask_suggestion_transitions.sql'])
 test('legacy compatibility contract: '+file,()=>localSql(readFileSync(new URL('../../supabase/tests/'+file,import.meta.url),'utf8')));
