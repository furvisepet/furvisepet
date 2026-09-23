// Opt-in real PostgreSQL behavior. Each fixture rolls back; no remote URL is accepted.
import test from 'node:test';
import {localSql,setup,turn,mint,boundAppend,append,replace,ordinary,execute,row,block,check,q,j,id,source,owner,pet,other,snapshot} from '../../tests/helpers/canonical-ask-postgres.mjs';
const run=(name,sql)=>test(name,()=>localSql(setup()+sql+'\nROLLBACK;'));
run('canonical APPEND preserves exact body and isolated provenance',append(['  Exact  note.\n\tSecond line.  '])+block(
check(`exists(select 1 from public.pet_care_entries where id=${row(1)} and canonical_ask_isolated and note=${q('  Exact  note.\n\tSecond line.  ')})`,'body or provenance changed')+
check(`(select count(*) from public.pet_current_state where pet_profile_id='${pet}')=0`,'note created current state')));
for(const [label,body] of [
 ['breathing','Breathing is normal again after trouble breathing.'],
 ['medication','Started ExampleMed. Finished the prior medication course.'],
 ['emergency','Seizure, collapse, severe bleeding and repeated vomiting returned.'],
 ['unusual wording','br33thng back?? med took/stoppd; no new facts allowed']]){
 run('canonical '+label+' prose does not create derived facts',append([body])+block(
 check('(select count(*) from public.pet_care_episodes)=0','episode inferred')+
 check('(select count(*) from public.pet_care_episode_events)=0','membership inferred')+
 check('(select count(*) from public.pet_concerns)=0','concern inferred')+
 check('(select count(*) from public.pet_current_state)=0','current state inferred')+
 check('(select count(*) from public.owner_note_jobs)=0','enrichment scheduled')));
}
run('ordinary non-Ask logging retains inference',ordinary()+block(
check(`(select episode_id from public.pet_care_entries where id='${id(61)}') is not null`,'episode lost')+
check('(select count(*) from public.pet_care_episode_events)=1','membership lost')+
check('(select count(*) from public.pet_concerns)>0','concern lost')+
check(`(select state#>>'{breathing,status}' from public.pet_current_state where pet_profile_id='${pet}')='abnormal'`,'breathing inference lost')));
run('canonical note cannot reopen resolved concern or alter existing state',ordinary()+
`update public.pet_concerns set status='resolved',resolved_at=now();create temp table before_state as select ${snapshot} value;\n`+
append(['Trouble breathing again. Severe bleeding returned.'])+
block(check(`${snapshot}=(select value from before_state)`,'canonical note altered derived state')));
run('later recompute, medication refresh, backfill and import exclude isolated rows',ordinary()+append(['Breathing is normal again. Started ExampleMed.'])+
`select * from public.recompute_pet_current_state('${pet}',false);
select public.refresh_pet_current_medications('${pet}');
select public.rebuild_pet_lifecycle_projections('${pet}');
select * from public.backfill_pet_care_episodes('${pet}',false);
select * from public.import_legacy_semantic_claims_v2('${owner}','pet_care_entries');
`+block(check(`(select state#>>'{breathing,sourceEventId}' from public.pet_current_state where pet_profile_id='${pet}')='${id(61)}'`,'recompute selected Ask note')+
check(`not exists(select 1 from public.pet_current_state where ${row(1)}=any(source_event_ids))`,'Ask entered current-state sources')+
check(`not exists(select 1 from public.semantic_claim_legacy_lineage where legacy_row_id=${row(1)})`,'Ask acquired imported semantics')+
check(`(select count(*) from public.pet_care_entries where id=${row(1)})=1`,'history note lost')));
run('safe isolated target REPLACE preserves exact body and replay',append(['Initial exact observation.'])+replace()+block(
`select * into r from ${execute(2)};`+check("r.changed and r.action->>'status'='succeeded'",'safe replace failed')+
check(`(select note from public.pet_care_entries where id=${row(1)})=${q('  Exact  replacement.\n\tPreserved.  ')}`,'replace lost fidelity')+
`select * into replay from ${execute(2)};`+check('not replay.changed and replay.action=r.action','replace replay changed')+
check('(select count(*) from public.pet_current_state)=0','replacement inferred state')));
run('legacy episode target REPLACE fails without changing target or dependents',ordinary()+replace({target:q(id(61))})+
`create temp table before_state as select ${snapshot} value;\n`+block(
`select * into r from ${execute(2)};`+check("not r.changed and r.action->>'status'='failed'",'legacy target accepted')+
check(`(select note from public.pet_care_entries where id='${id(61)}')='Trouble breathing again.'`,'unsafe target changed')+
check(`${snapshot}=(select value from before_state)`,'dependent state changed')));
for(const nested of [false,true])run('isolated target with '+(nested?'nested JSON':'array')+' current-state dependency fails closed',append(['Initial exact observation.'])+
`insert into public.pet_current_state(pet_profile_id,user_id,state,source_event_ids)values('${pet}','${owner}',${nested?"jsonb_build_object('currentMedications',jsonb_build_array(jsonb_build_object('sourceEventId',"+row(1)+")))":"'{}'::jsonb"},${nested?"'{}'::uuid[]":"array["+row(1)+"]"});\n`+
replace()+`create temp table before_state as select ${snapshot} value;\n`+block(
`select * into r from ${execute(2)};`+check("not r.changed and r.action->>'status'='failed'",'dependent isolated target accepted')+
check(`(select note from public.pet_care_entries where id=${row(1)})='Initial exact observation.'`,'dependent target changed')+
check(`${snapshot}=(select value from before_state)`,'dependent state changed')));
run('client role cannot forge isolation provenance',turn('Untrusted marker')+'set local role service_role;\n'+block(
`begin insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,intelligence_source_message_id,intelligence_source_type,canonical_ask_isolated)values('${owner}','${pet}','general','Untrusted','Untrusted marker','${source(1).source}','ask_application_action',true);
exception when insufficient_privilege then denied:=sqlerrm='CANONICAL_ASK_ORIGIN_REQUIRES_WRITER';end;`+check('denied','client forged isolated origin'))+'reset role;\n');
run('existing origin cannot be promoted or removed after persistence',ordinary({category:'general',note:'Plain note.',severity:null})+block(
`begin update public.pet_care_entries set canonical_ask_isolated=true where id='${id(61)}';exception when check_violation then denied:=sqlerrm='CANONICAL_ASK_ORIGIN_IMMUTABLE';end;`+check('denied','legacy row promoted')));
run('legacy semantic RPC cannot reinterpret an isolated source',append(['The original exact note.'])+block(
`begin perform * from public.persist_furvise_server_semantic_event('${owner}','${pet}','${source(1).source}','{}');exception when insufficient_privilege then denied:=sqlerrm='CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN';end;`+check('denied','legacy semantic RPC reopened')+
check('(select count(*) from public.pet_care_episodes)=0','RPC created episode')));
run('Ask REMOVE stays unsupported without dismissing dependents',ordinary()+turn('Remove this record',1)+mint({kind:'care_history.remove',target:q(id(61)),explicit:true})+
`create temp table before_state as select ${snapshot} value;\n`+block(
`select * into r from ${execute()};`+check("not r.changed and r.action->>'status'='failed'",'Ask removal executed')+
check(`(select deleted_at from public.pet_care_entries where id='${id(61)}') is null`,'target removed')+check(`${snapshot}=(select value from before_state)`,'dependent dismissed')));
for(const mode of ['auto','cancel'])run('canonical append '+mode+' cannot write',boundAppend(['Exact note.']).sql+block(
`select * into r from ${execute(1,mode)};`+check(`not r.changed and r.action->>'status'='${mode==='auto'?'failed':'cancelled'}'`,'confirmation boundary changed')+
check('(select count(*) from public.pet_care_entries)=0','unconfirmed write')));
run('foreign owner cannot execute a canonical capability',boundAppend(['Exact note.']).sql+block(check(`(select count(*) from ${execute(1,'confirm',other)})=0`,'foreign execution')+check('(select count(*) from public.pet_care_entries)=0','foreign write')));
run('stale safe-target capability cannot overwrite an intervening edit',append(['Initial exact observation.'])+replace()+
`update public.pet_care_entries set note='Newer note.' where id=${row(1)};\n`+block(
`select * into r from ${execute(2)};`+check("not r.changed and r.action->>'errorMessage'='That history update changed after this action was prepared.'",'freshness changed')+
check(`(select note from public.pet_care_entries where id=${row(1)})='Newer note.'`,'newer value overwritten')));
run('append replay stays idempotent under isolation',append(['First exact note.','Second exact note.'])+block(
`select * into r from ${execute()};`+check("not r.changed and r.action->>'status'='succeeded'",'replay changed')+
check('(select count(*) from public.pet_care_entries)=2','duplicate rows')));
const {bindStateTransitionJob}=await import('../../app/lib/furvise-brain/state-transition-job.ts');
const transitionText='Mark the selected concern resolved.';
const transition=bindStateTransitionJob({domain:'care_concern',operation:'transition',targetRef:'concern-one',petName:'Subject',toState:'resolved',authorizationQuote:transitionText},{
 source:{id:source(1).source,role:'user',text:transitionText,createdAt:'2026-09-20T12:00:00Z'},ownerId:owner,
 pets:[{id:pet,user_id:owner,name:'Subject'}],references:[{ref:'concern-one',ownerId:owner,petId:pet,concernId:id(91),status:'active',title:'Existing concern'}]});
run('independently bound StateTransitionJob updates only its exact concern',
`insert into public.pet_concerns(id,user_id,pet_profile_id,title,normalized_key,status,severity)values
('${id(91)}','${owner}','${pet}','Existing concern','first','active','routine'),
('${id(92)}','${owner}','${pet}','Other concern','second','active','routine');\n`+
turn(transitionText)+mint({kind:'care_state.resolve',target:q(transition.concernId),explicit:true,extra:{stateTransitionJob:transition}})+block(
`select * into r from ${execute(1,'auto')};`+check("r.changed and r.action->>'status'='succeeded'",'typed transition blocked')+
check(`(select status from public.pet_concerns where id='${id(91)}')='resolved' and (select status from public.pet_concerns where id='${id(92)}')='active'`,'wrong concern transitioned')+
check('(select count(*) from public.pet_care_entries)=0','transition invented note')));
run('expired capability cannot bypass isolation or confirmation',boundAppend(['Exact note.']).sql+
`alter table public.ask_action_capabilities disable trigger ask_action_capabilities_protect_update;
update public.ask_action_capabilities set created_at=created_at-interval '16 minutes',expires_at=expires_at-interval '16 minutes' where id='${source(1).cap}';
alter table public.ask_action_capabilities enable trigger ask_action_capabilities_protect_update;\n`+block(
`select * into r from ${execute()};`+check("not r.changed and r.action->>'errorMessage'='That action expired before it was confirmed.'",'expiry changed')+
check('(select count(*) from public.pet_care_entries)=0','expired write')));
const atomic=boundAppend(['First exact observation.','Second exact observation.']);
const invalid=structuredClone(atomic.job);invalid.items[1].body.start--;
run('invalid second append item rolls back all notes and receipts',turn(atomic.text)+mint({job:invalid})+block(
`begin perform * from ${execute()};exception when others then denied:=sqlerrm='APPEND_SPAN_INVALID';end;`+
check('denied','bad item accepted')+check('(select count(*) from public.pet_care_entries)=0','partial batch persisted')+
check(`(select status from public.ask_action_capabilities where id='${source(1).cap}')='pending'`,'receipt persisted after failed batch')));
run('non-Ask medication refresh keeps its existing source while ignoring Ask prose',
ordinary({category:'medication',title:'Started ExampleMed',note:'Existing medication course.',severity:null})+
append(['Started OtherMed. Stopped ExampleMed.'])+
`select public.refresh_pet_current_medications('${pet}');\n`+block(
check(`(select state#>>'{currentMedications,0,name}' from public.pet_current_state where pet_profile_id='${pet}')='ExampleMed'`,'non-Ask medication changed')+
check(`(select state#>>'{currentMedications,0,sourceEventId}' from public.pet_current_state where pet_profile_id='${pet}')='${id(61)}'`,'medication source changed')));
run('non-Ask legacy import fingerprint and replay remain compatible',ordinary()+
`select * from public.import_legacy_semantic_claims_v2('${owner}','pet_care_entries');\n`+block(
check(`(select l.source_row_hash from public.semantic_claim_legacy_lineage l where l.legacy_row_id='${id(61)}') =
(select encode(extensions.digest(convert_to((to_jsonb(e)-'canonical_ask_isolated'||jsonb_build_object('species',p.species,'membership_role',m.event_role))::text,'UTF8'),'sha256'),'hex') from public.pet_care_entries e join public.dog_profiles p on p.id=e.pet_profile_id left join public.pet_care_episode_events m on m.care_entry_id=e.id where e.id='${id(61)}')`,'old import fingerprint changed')+
`select * into r from public.import_legacy_semantic_claims_v2('${owner}','pet_care_entries');`+check('r.already_imported=1 and r.imported=0','import replay changed')));
run('unmarked legacy target remains unsupported even without recorded dependencies',
ordinary({category:'general',note:'Plain historical note.',severity:null})+
'delete from public.pet_current_state;\n'+replace({target:q(id(61))})+
block(`select * into r from ${execute(2)};`+check("not r.changed and r.action->>'status'='failed'",'unproven legacy target accepted')+
check(`(select note from public.pet_care_entries where id='${id(61)}')='Plain historical note.'`,'legacy body changed')));

const {validateAppendJob}=await import('../../app/lib/furvise-brain/append-job.ts');
const datedBody='  2024-02-03: Exact dated observation.  ';
const datedJob=validateAppendJob({operation:'append',petName:'Subject',items:[{bodyQuote:datedBody,dateQuote:'2024-02-03',occurredAt:'2024-02-03T00:00:00Z'}],companionQuote:null},{id:source(1).source,role:'user',text:datedBody,createdAt:'2026-09-20T12:00:00Z'},[{id:pet,name:'Subject',user_id:owner}],owner);
run('isolated APPEND retains its bound explicit date and exact body',turn(datedBody)+mint({job:datedJob})+block(
'select * into r from '+execute()+';'+check("r.changed and r.action->>'status'='succeeded'",'dated append failed')+
check('(select note from public.pet_care_entries where id='+row(1)+')='+q(datedBody),'dated body changed')+
check('(select occurred_at from public.pet_care_entries where id='+row(1)+")='2024-02-03T00:00:00Z'::timestamptz",'bound date changed')));
run('isolation helpers and views add no client privileges',block(
check("not has_function_privilege('service_role','private.canonical_ask_replace_safe(uuid,uuid,uuid)','execute')",'private checker exposed')+
check("not has_function_privilege('authenticated','private.is_canonical_ask_source(uuid)','execute')",'source checker exposed')+
check("not has_table_privilege('service_role','private.legacy_inference_care_entries','select')",'inference view exposed')+
check("has_function_privilege('service_role','public.execute_ask_action_capability(uuid,uuid,uuid,text,uuid)','execute')",'governed executor grant lost')+
check("(select count(*) from pg_trigger where tgrelid='public.pet_care_entries'::regclass and tgenabled='D')=0",'trigger disabled')));
