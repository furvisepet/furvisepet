-- UNEXECUTED candidate SQL. Independent isolated rollback-only transaction.
-- Actual SET LOCAL ROLE service_role at RPC boundaries; privileged fixture setup.
set local client_encoding='UTF8';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ASSERTION_FAILED: %',label; end if; end $$;
do $$ begin
 perform pg_temp.check_true((select rolsuper from pg_roles where rolname=current_user) or current_user=(select pg_get_userbyid(relowner) from pg_class where oid='public.ask_action_capabilities'::regclass),'privileged fixture owner required; not ACL proof');
 perform pg_temp.check_true(current_database() like 'furvise_disposable_%','disposable database name');
 perform pg_temp.check_true(inet_server_addr() is null or inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet),'local connection');
 perform pg_temp.check_true(not exists(select 1 from auth.users),'empty fixture database');
 perform pg_temp.check_true(to_regprocedure('private.canonical_replace_write_semantics_valid(jsonb)') is not null,'new migration installed');
end $$;

create function pg_temp.fixture() returns jsonb language sql as $$ select current_setting('furvise.test_fixture')::jsonb $$;
create function pg_temp.mint_for(who uuid,a jsonb,assistant uuid) returns uuid language plpgsql as $$
declare result uuid;
begin
 insert into public.ask_action_capabilities(user_id,assistant_message_id,source_message_id,source_action_id,action_kind,pet_profile_id,target_id,safety_class,mutation_class,confirmation_policy,authorization_scope,explicit_intent,action_payload)
 values(who,assistant,(a->>'sourceMessageId')::uuid,a->>'id',a->>'kind',(a->>'petId')::uuid,
 case when a ? 'targetSourceId' then replace(a->>'targetSourceId','care:','')::uuid else null end,
 a->>'safetyClass',a->>'mutationClass',a->>'confirmationPolicy',a->>'authorizationScope',(a->>'explicitIntent')::boolean,a)
 returning id into result;return result;
end $$;

create function pg_temp.mint(a jsonb,assistant uuid) returns uuid language sql as $$ select pg_temp.mint_for((pg_temp.fixture()->>'owner')::uuid,a,assistant) $$;

-- Seed a prior canonical append and its immutable provenance. This is a fixture
-- setup seam, not a claim that the JS route was exercised in SQL.
do $$
declare f jsonb;owner_id uuid;pet uuid;conv uuid;assistant uuid;oldsource uuid;oldassistant uuid;request uuid;oldrequest uuid;off integer;
 a jsonb;cap uuid;span text:='offline-original-span';body text;
begin
 for f in select value from jsonb_array_elements(jsonb_build_array(pg_temp.fixture(),pg_temp.fixture()->'foreign')) loop
 owner_id:=(f->>'owner')::uuid;pet:=(f#>>'{subject,id}')::uuid;body:=f#>>'{reference,body}';off:=(f->>'offset')::integer;
 conv:=('89300000-0000-4000-8000-'||lpad((off+5)::text,12,'0'))::uuid;
 assistant:=('89300000-0000-4000-8000-'||lpad((off+6)::text,12,'0'))::uuid;
 oldsource:=('89300000-0000-4000-8000-'||lpad((off+7)::text,12,'0'))::uuid;
 oldassistant:=('89300000-0000-4000-8000-'||lpad((off+8)::text,12,'0'))::uuid;
 request:=(f#>>'{source,requestId}')::uuid;
 oldrequest:=('89300000-0000-4000-8000-'||lpad((off+10)::text,12,'0'))::uuid;
 insert into auth.users(id) values(owner_id);
 perform private.set_furvise_server_actor(owner_id);
 insert into public.dog_profiles(id,user_id,name,species) values(pet,owner_id,f#>>'{subject,name}','dog');
 insert into public.ask_conversations(id,user_id,pet_profile_id,title) values(conv,owner_id,pet,'Isolated SQL contract');
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id,created_at)
 values(oldsource,conv,owner_id,'user',1,body,oldrequest,(f#>>'{reference,createdAt}')::timestamptz),
 ((f#>>'{source,id}')::uuid,conv,owner_id,'user',3,f#>>'{source,text}',request,(f#>>'{source,createdAt}')::timestamptz);
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
 values(oldassistant,conv,owner_id,'furvise',2,'{}',oldrequest),(assistant,conv,owner_id,'furvise',4,'{}',request);
 a:=(f->'actions'->0)-array['replaceJob','targetSourceId']||jsonb_build_object('id',oldrequest::text||':append','kind','care_history.add',
 'sourceMessageId',oldsource,'authorizationScope','owned_pet','input',jsonb_build_object('field',null,'value',null,'title',null,'detail',body,'category',null,'target','specified'),
 'appendJob',jsonb_build_object('operation','append','petId',pet,'sourceMessageId',oldsource,'items',jsonb_build_array(jsonb_build_object(
 'body',jsonb_build_object('id',span,'sourceMessageId',oldsource,'start',0,'end',length(body),'text',body),
 'date',null,'occurredAt',f#>>'{reference,eventAt}'))));
 cap:=pg_temp.mint_for(owner_id,a,oldassistant);
 insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,created_at,updated_at,intelligence_source_message_id,intelligence_source_type,canonical_ask_isolated,care_event_metadata)
 values((f#>>'{reference,recordId}')::uuid,owner_id,pet,'general','Owner note',body,(f#>>'{reference,eventAt}')::timestamptz,
 (f#>>'{reference,createdAt}')::timestamptz,(f#>>'{reference,updatedAt}')::timestamptz,oldsource,'ask_application_action',true,jsonb_build_object('sourceSpanId',span));
 update public.ask_action_capabilities set status='succeeded',receipt=a||jsonb_build_object('id',cap,'status','succeeded','resultMessage','Fixture append','errorMessage',null),terminal_at=clock_timestamp(),updated_at=clock_timestamp() where id=cap;
 perform pg_temp.check_true(private.canonical_ask_replace_safe((f#>>'{reference,recordId}')::uuid,owner_id,pet),'canonical target provenance');
 end loop;
end $$;

create function pg_temp.lifecycle_state() returns jsonb language plpgsql as $$
declare result jsonb:='{}'; name text; rows_json jsonb;
begin
 foreach name in array array['public.dog_profiles','public.ask_conversations','public.ask_conversation_messages',
  'public.ask_action_capabilities','public.pet_care_entries','public.semantic_claims','public.semantic_claim_relations',
  'public.pet_care_episodes','public.pet_care_episode_events','public.pet_concerns','public.pet_current_state',
  'public.furvise_memories','public.dog_memories','public.ai_update_suggestions','public.owner_note_jobs','private.ask_tasks',
  'public.semantic_claim_legacy_lineage','public.ask_recorded_inventory_revision','public.ask_recorded_inventory_removals'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from %s t',name) into rows_json;
  result:=result||jsonb_build_object(name,rows_json);
 end loop;return result;
end $$;
create function pg_temp.expect_reject(statement text,label text) returns void language plpgsql as $$
declare before jsonb:=pg_temp.lifecycle_state(); rejected boolean:=false; code text; msg text;
begin
 begin execute statement; exception when others then rejected:=true;get stacked diagnostics code=returned_sqlstate,msg=message_text;end;
 perform pg_temp.check_true(rejected,label||' rejected');
 perform pg_temp.check_true(pg_temp.lifecycle_state()=before,label||' atomic');
 raise notice 'PASS rejection % SQLSTATE=% message=%',label,code,msg;
end $$;
create function pg_temp.delete_owned(who uuid,conversation uuid) returns boolean language plpgsql as $$
declare result boolean;
begin
 execute 'set local role service_role';
 perform pg_temp.check_true(current_user='service_role','actual service_role');
 result:=public.delete_ask_conversation(who,conversation);
 execute 'reset role';return result;
exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.new_source(source jsonb,assistant uuid,conversation uuid) returns void language plpgsql as $$
begin
 insert into public.ask_conversations(id,user_id,pet_profile_id,title) values(conversation,(pg_temp.fixture()->>'owner')::uuid,(pg_temp.fixture()#>>'{subject,id}')::uuid,'New independent source');
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id,created_at)
 values((source->>'id')::uuid,conversation,(pg_temp.fixture()->>'owner')::uuid,'user',1,source->>'text',(source->>'requestId')::uuid,(source->>'createdAt')::timestamptz);
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
 values(assistant,conversation,(pg_temp.fixture()->>'owner')::uuid,'furvise',2,'{}',(source->>'requestId')::uuid);
end $$;

-- Protected origin and live relations; actual second owner; role spoof.
do $$ declare e public.pet_care_entries; statement text; before jsonb; begin
 select * into e from public.pet_care_entries where id=(pg_temp.fixture()#>>'{reference,recordId}')::uuid;
 foreach statement in array array[
  'id=''89300000-0000-4000-8000-000000000998''','canonical_ask_origin_message_id=null',
  'canonical_ask_origin_message_id=''89300000-0000-4000-8000-000000000107''',
  'intelligence_source_message_id=null',
  'intelligence_source_message_id=''89300000-0000-4000-8000-000000000107''',
  'canonical_ask_isolated=false','user_id=''89300000-0000-4000-8000-000000000101''',
  'pet_profile_id=''89300000-0000-4000-8000-000000000102''','intelligence_source_type=''forged''',
  'care_event_metadata=jsonb_build_object(''sourceSpanId'',''forged'')',
  'intelligence_source_message_id=null,note=''combined forged body''',
  'intelligence_source_message_id=null,updated_at=clock_timestamp()'
 ] loop perform pg_temp.expect_reject('update public.pet_care_entries set '||statement||' where id='||quote_literal(e.id),'protected care '||statement);end loop;
 perform pg_temp.expect_reject('update public.semantic_claims set source_message_id=null where source_message_lineage_id='||quote_literal(e.id),'claim live link while parent exists');
 before:=pg_temp.lifecycle_state();execute 'set local role service_role';
 begin
  insert into public.pet_care_entries(user_id,pet_profile_id,note,category,occurred_at,intelligence_source_type,intelligence_source_message_id,canonical_ask_isolated)
  values(e.user_id,e.pet_profile_id,'forged','general',clock_timestamp(),'ask_application_action',e.intelligence_source_message_id,true);
  raise exception using errcode='ZFAIL',message='ROLE_SPOOF_INSERT_ACCEPTED';
 exception when insufficient_privilege then null;end;
 execute 'reset role';perform pg_temp.check_true(before=pg_temp.lifecycle_state(),'role spoof atomic');
 foreach statement in array array['null','''89300000-0000-4000-8000-000000000999''','''89300000-0000-4000-8000-000000000107'''] loop
  perform pg_temp.expect_reject(format('insert into public.pet_care_entries(user_id,pet_profile_id,note,category,occurred_at,intelligence_source_type,intelligence_source_message_id,canonical_ask_isolated) values(%L,%L,''forged'',''general'',clock_timestamp(),''ask_application_action'',%s,true)',e.user_id,e.pet_profile_id,statement),'missing/foreign canonical insert');
 end loop;
 perform pg_temp.expect_reject(format('insert into public.pet_care_entries(user_id,pet_profile_id,note,category,occurred_at,intelligence_source_type,intelligence_source_message_id,canonical_ask_isolated) values(%L,%L,''forged'',''general'',clock_timestamp(),''ask_application_action'',%L,true)',e.user_id,e.pet_profile_id,e.intelligence_source_message_id),'no pending exact origin authority');
 before:=pg_temp.lifecycle_state();perform pg_temp.check_true(not pg_temp.delete_owned((pg_temp.fixture()->'foreign'->>'owner')::uuid,'89300000-0000-4000-8000-000000000005'),'second owner denied');
 perform pg_temp.check_true(before=pg_temp.lifecycle_state(),'foreign delete atomic');
 insert into public.ask_conversations(id,user_id,pet_profile_id,title) values('89300000-0000-4000-8000-000000000777',e.user_id,e.pet_profile_id,'Plain');
 perform pg_temp.check_true(pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000777'),'plain service delete');
 perform pg_temp.check_true(not pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000777'),'plain repeat false');
 raise notice 'PASS origin/live/source/owner/pet/span/flag/combined/role/plain controls';
end $$;

create function pg_temp.reject_detach() returns trigger language plpgsql as $$ begin
 if old.intelligence_source_message_id is not null and new.intelligence_source_message_id is null then raise exception 'INJECTED_DETACH_FAILURE';end if;return new;end $$;
create function pg_temp.reject_message_delete() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_DELETE_FAILURE';end $$;
create function pg_temp.tamper_after_detach_guard() returns trigger language plpgsql as $$ begin
 if old.canonical_ask_isolated and old.intelligence_source_message_id is not null and new.intelligence_source_message_id is null then new.note:='INJECTED_COMBINED_EDIT';end if;return new;end $$;
do $$ declare variant text;begin
 foreach variant in array array['detach','message','combined'] loop
  begin
   if variant='detach' then execute 'create trigger zz_test_detach before update on public.pet_care_entries for each row execute function pg_temp.reject_detach()';
   elsif variant='message' then execute 'create trigger zz_test_delete before delete on public.ask_conversation_messages for each row execute function pg_temp.reject_message_delete()';
   else execute 'create trigger zz_test_combined before update on public.pet_care_entries for each row execute function pg_temp.tamper_after_detach_guard()';end if;
   perform pg_temp.expect_reject(format('select pg_temp.delete_owned(%L,%L)',pg_temp.fixture()->>'owner','89300000-0000-4000-8000-000000000005'),'injected '||variant);
   raise exception using errcode='Z0001',message='rollback injection';
  exception when sqlstate 'Z0001' then null;end;
 end loop;raise notice 'PASS injected delete/detach/combined-change atomicity';
end $$;

create function pg_temp.add_second_saved_item() returns void language plpgsql as $$
declare f jsonb:=pg_temp.fixture();a jsonb;cap uuid;r record;body text:='Second exact observation.';
 source uuid:='89300000-0000-4000-8000-000000000017';assistant uuid:='89300000-0000-4000-8000-000000000018';request uuid:='89300000-0000-4000-8000-000000000019';
begin
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id)
 values(source,'89300000-0000-4000-8000-000000000005',(f->>'owner')::uuid,'user',5,body,request);
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
 values(assistant,'89300000-0000-4000-8000-000000000005',(f->>'owner')::uuid,'furvise',6,'{}',request);
 select action_payload into a from public.ask_action_capabilities where user_id=(f->>'owner')::uuid and action_kind='care_history.add' and status='succeeded' limit 1;
 a:=a||jsonb_build_object('id',request::text||':append','sourceMessageId',source,
 'appendJob',jsonb_build_object('operation','append','petId',f#>>'{subject,id}','sourceMessageId',source,'items',jsonb_build_array(jsonb_build_object(
  'body',jsonb_build_object('id',source::text||':0:'||length(body)::text,'sourceMessageId',source,'start',0,'end',length(body),'text',body),
  'date',null,'occurredAt',null,'semantics',jsonb_build_object('classification','observation','target',null)))),
 'input',jsonb_build_object('field',null,'value',null,'title',null,'detail',body,'category',null,'target','specified'));
 cap:=pg_temp.mint(a,assistant);execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);execute 'reset role';
 perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','actual second append confirmation');
 perform pg_temp.check_true((select count(*)=2 from public.pet_care_entries where user_id=(f->>'owner')::uuid),'two actual saved rows');
 perform pg_temp.check_true((select count(*)=2 from public.semantic_claims where user_id=(f->>'owner')::uuid and governance_metadata ? 'sourceSemanticsPayload'),'two actual stamps');
end $$;

-- These variants roll back independently. Actual inventory revision may advance;
-- immutable semantic payload/source snapshot and care content generation may not.
do $$ declare f jsonb:=pg_temp.fixture(); variant text;before jsonb;after jsonb;care_before jsonb;claims_before jsonb;receipts_before jsonb;
 e public.pet_care_entries;cap public.ask_action_capabilities;a jsonb;r record;page jsonb;begin
 foreach variant in array array['active','soft_deleted','multiple'] loop
  begin
   select * into e from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid;
   if variant='soft_deleted' then update public.pet_care_entries set deleted_at=clock_timestamp(),deleted_by=e.user_id,deletion_reason='fixture prior removal' where id=e.id;end if;
   if variant='multiple' then perform pg_temp.add_second_saved_item();end if;
   before:=pg_temp.lifecycle_state();care_before:=before->'public.pet_care_entries';claims_before:=before->'public.semantic_claims';receipts_before:=before->'public.ask_action_capabilities';
   perform pg_temp.check_true(pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000005'),'populated delete '||variant);
   perform pg_temp.check_true(not exists(select 1 from public.ask_conversations where id='89300000-0000-4000-8000-000000000005') and not exists(select 1 from public.ask_conversation_messages where conversation_id='89300000-0000-4000-8000-000000000005'),'physical transcript absence');
   perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(care_before) old where not exists(select 1 from public.pet_care_entries x where x.id=(old->>'id')::uuid and (to_jsonb(x)-'intelligence_source_message_id')=(old-'intelligence_source_message_id') and (x.user_id<>e.user_id or x.intelligence_source_message_id is null))),'care protected fields/generation unchanged');
   perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(claims_before) old where not exists(select 1 from public.semantic_claims x where x.id=(old->>'id')::uuid and (to_jsonb(x)-'source_message_id')=(old-'source_message_id'))),'claim payload/hash/classification/non-effective/snapshot unchanged');
   after:=pg_temp.lifecycle_state();perform pg_temp.check_true(after->'public.ask_action_capabilities'=receipts_before,'receipts unchanged on delete');
   perform pg_temp.check_true((after-array['public.ask_conversations','public.ask_conversation_messages','public.pet_care_entries','public.semantic_claims','public.ask_recorded_inventory_revision','public.ask_recorded_inventory_removals'])=(before-array['public.ask_conversations','public.ask_conversation_messages','public.pet_care_entries','public.semantic_claims','public.ask_recorded_inventory_revision','public.ask_recorded_inventory_removals']),'no inferred or effective effects');
   perform pg_temp.check_true(after->'public.ask_recorded_inventory_revision' is distinct from before->'public.ask_recorded_inventory_revision','real inventory invalidation');
   if variant='active' then
    perform set_config('request.jwt.claim.sub',e.user_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',e.user_id,'role','authenticated')::text,true);
    execute 'set local role authenticated';page:=public.read_ask_source_semantics(array[e.pet_profile_id],array[e.id]);execute 'reset role';
    perform pg_temp.check_true((page->>'complete')::boolean and jsonb_array_length(page->'claims')=1,'current detached semantics complete');
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    perform pg_temp.check_true(private.canonical_ask_replace_safe(e.id,e.user_id,e.pet_profile_id),'surviving safe replacement provenance');
   end if;
   select * into cap from public.ask_action_capabilities where user_id=e.user_id and status='succeeded' order by id limit 1;
   before:=pg_temp.lifecycle_state();execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap.id,cap.assistant_message_id,cap.user_id,'confirm',null);execute 'reset role';
   perform pg_temp.check_true(not r.changed and r.action=cap.receipt and pg_temp.lifecycle_state()=before,'exact old receipt replay after transcript delete');
   perform pg_temp.check_true(not pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000005'),'repeated canonical delete false');
   raise notice 'PASS populated physical deletion % protected state/semantics/receipt/replay',variant;
   raise exception using errcode='Z0001',message='rollback deletion variant';
  exception when sqlstate 'Z0001' then null;end;
 end loop;
end $$;

-- Existing pending authority loses its live source; receipt replay alone cannot
-- manufacture a new effect. A genuinely new source in a new conversation can.
do $$ declare f jsonb:=pg_temp.fixture();cap uuid;r record;care jsonb;claims jsonb;a jsonb;variant text;src jsonb;assistant uuid;conv uuid;
 e public.pet_care_entries;before_count bigint;receipt jsonb;begin
 begin
  cap:=pg_temp.mint(f->'actions'->0,'89300000-0000-4000-8000-000000000006');
  perform pg_temp.check_true(pg_temp.delete_owned((f->>'owner')::uuid,'89300000-0000-4000-8000-000000000005'),'delete pending source');
  select to_jsonb(x) into care from public.pet_care_entries x where id=(f#>>'{reference,recordId}')::uuid;
  execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(f->>'owner')::uuid,'confirm',null);execute 'reset role';
  perform pg_temp.check_true(not r.changed and r.action->>'status'<>'succeeded' and (select to_jsonb(x)=care from public.pet_care_entries x where id=(f#>>'{reference,recordId}')::uuid),'old pending denied without care effect');
  perform pg_temp.expect_reject(format('select pg_temp.mint(%L::jsonb,%L)',(f->'actions'->0)::text,'89300000-0000-4000-8000-000000000006'),'deleted UUID cannot mint');
  raise notice 'PASS old pending denial and deleted-source mint rejection';
  raise exception using errcode='Z0001',message='rollback pending case';
 exception when sqlstate 'Z0001' then null;end;
 foreach variant in array array['replace','remove','source_stale','target_stale']loop
  begin
   perform pg_temp.check_true(pg_temp.delete_owned((f->>'owner')::uuid,'89300000-0000-4000-8000-000000000005'),'delete before new source');
   a:=case when variant='remove' then f#>'{deletion,remove}' else f#>'{deletion,replace}' end;
   src:=case when variant='remove' then f#>'{deletion,removeSource}' else f#>'{deletion,source}' end;
   assistant:='89300000-0000-4000-8000-000000000306';conv:='89300000-0000-4000-8000-000000000305';
   perform pg_temp.new_source(src,assistant,conv);
   cap:=pg_temp.mint(a,assistant);
   if variant='source_stale' then perform pg_temp.check_true(pg_temp.delete_owned((f->>'owner')::uuid,conv),'post-mint source deletion');end if;
   if variant='target_stale' then update public.pet_care_entries set note='Later fixture generation' where id=(f#>>'{reference,recordId}')::uuid;end if;
   select * into e from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid;
   select count(*),coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]')into before_count,claims from public.semantic_claims c;
   execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);execute 'reset role';
   if variant in('source_stale','target_stale') then
    perform pg_temp.check_true(not r.changed and r.action->>'status'<>'succeeded' and (select to_jsonb(x)=to_jsonb(e) from public.pet_care_entries x where id=e.id),'sequential stale authority denied '||variant);
    perform pg_temp.check_true((select count(*)=before_count from public.semantic_claims),'stale no stamp');
   else
    perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','new source '||variant);
    perform pg_temp.check_true((select canonical_ask_origin_message_id=e.canonical_ask_origin_message_id and intelligence_source_message_id is null and occurred_at=e.occurred_at from public.pet_care_entries where id=e.id),'permanent origin/event preserved');
    if variant='replace' then
     perform pg_temp.check_true((select note=a#>>'{replaceJob,body,text}' and updated_at<>e.updated_at from public.pet_care_entries where id=e.id),'new exact body/new content generation');
     perform pg_temp.check_true((select count(*)=before_count+1 from public.semantic_claims),'replacement exact +1 stamp');
     perform pg_temp.check_true((select count(*)=1 from public.semantic_claims c join public.pet_care_entries x on x.id=c.source_message_lineage_id
      where x.id=e.id and c.user_id=e.user_id and c.subject_id=e.pet_profile_id and c.source_message_id is null
       and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'source'=private.ask_source_semantics_snapshot(x)
       and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->>'classification'='observation'
       and c.knowledge_status='unconfirmed' and c.modality='reported' and c.persistence_destination='none'),'new exact non-effective current stamp');
    else
     perform pg_temp.check_true((select deleted_at is not null and note=e.note from public.pet_care_entries where id=e.id),'new source governed remove');
     perform pg_temp.check_true((select count(*)=before_count from public.semantic_claims),'remove no invented stamp');
    end if;
    perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(claims) old where not exists(select 1 from public.semantic_claims c where to_jsonb(c)=old)),'old claims byte exact after new effect');
    perform pg_temp.check_true(not exists(select 1 from public.semantic_claim_relations),'no effective relation');
    receipt:=r.action;care:=pg_temp.lifecycle_state();execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);execute 'reset role';
    perform pg_temp.check_true(not r.changed and r.action=receipt and pg_temp.lifecycle_state()=care,'new receipt exact replay');
   end if;
   raise notice 'PASS fresh-source post-delete %',variant;
   raise exception using errcode='Z0001',message='rollback new source variant';
  exception when sqlstate 'Z0001' then null;end;
 end loop;
end $$;

-- Canonical lifecycle audit note is created by the real capability executor.
do $$ declare f jsonb:=pg_temp.fixture();cap uuid;r record;e public.pet_care_entries;before jsonb;begin
 begin
  perform pg_temp.new_source(f#>'{deletion,lifecycleSource}','89300000-0000-4000-8000-000000000326','89300000-0000-4000-8000-000000000325');
  cap:=pg_temp.mint(f#>'{deletion,lifecycle}','89300000-0000-4000-8000-000000000326');
  execute 'set local role service_role';select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000326',(f->>'owner')::uuid,'confirm',null);execute 'reset role';
  perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','real lifecycle executor');
  select * into strict e from public.pet_care_entries where idempotency_key=cap;
  perform pg_temp.check_true(e.canonical_ask_isolated and e.canonical_ask_origin_message_id=(f#>>'{deletion,lifecycleSource,id}')::uuid,'canonical lifecycle origin');
  before:=pg_temp.lifecycle_state();
  perform pg_temp.check_true(pg_temp.delete_owned(e.user_id,'89300000-0000-4000-8000-000000000325'),'lifecycle conversation deletion');
  perform pg_temp.check_true((select intelligence_source_message_id is null and (to_jsonb(x)-'intelligence_source_message_id')=(to_jsonb(e)-'intelligence_source_message_id') from public.pet_care_entries x where id=e.id),'lifecycle care exact preservation');
  perform pg_temp.check_true((pg_temp.lifecycle_state()->'public.dog_profiles')=(before->'public.dog_profiles'),'delete cannot reverse or infer lifecycle');
  perform pg_temp.check_true(not exists(select 1 from public.ask_conversation_messages where conversation_id='89300000-0000-4000-8000-000000000325'),'lifecycle physical transcript absence');
  raise notice 'PASS canonical lifecycle note deletion';raise exception using errcode='Z0001',message='rollback lifecycle';
 exception when sqlstate 'Z0001' then null;end;
end $$;

-- Legacy noncanonical FK behavior is unchanged, including ordinary version touch.
do $$ declare f jsonb:=pg_temp.fixture();entry uuid;before timestamptz;begin
 begin
  perform pg_temp.new_source(f#>'{deletion,source}','89300000-0000-4000-8000-000000000306','89300000-0000-4000-8000-000000000305');
  insert into public.pet_care_entries(user_id,pet_profile_id,category,title,note,occurred_at,intelligence_source_message_id,intelligence_source_type)
  values((f->>'owner')::uuid,(f#>>'{subject,id}')::uuid,'general','Legacy fixture','Plain prior note.',clock_timestamp(),(f#>>'{deletion,source,id}')::uuid,'ask_furvise')returning id,updated_at into entry,before;
  perform pg_temp.check_true(pg_temp.delete_owned((f->>'owner')::uuid,'89300000-0000-4000-8000-000000000305'),'legacy linked conversation delete');
  perform pg_temp.check_true((select intelligence_source_message_id is null and canonical_ask_origin_message_id is null and not canonical_ask_isolated and updated_at<>before from public.pet_care_entries where id=entry),'legacy FK/version behavior');
  raise notice 'PASS legacy FK behavior';raise exception using errcode='Z0001',message='rollback legacy';
 exception when sqlstate 'Z0001' then null;end;
 raise notice 'CANONICAL_CONVERSATION_DELETE_NATIVE_COMPLETE';
end $$;
