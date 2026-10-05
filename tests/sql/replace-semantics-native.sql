-- UNEXECUTED: run only in a separately authorized, empty, fully migrated local
-- disposable Supabase/Postgres database, through run-replace-semantics-native.py.
-- The runner opens one transaction; every fixture/trigger/function rolls back.
-- PRIVILEGED OWNER-SESSION fixture. JWT settings below exercise request guards,
-- NOT SET ROLE service_role. ACL/RLS execution as service_role remains UNPROVEN.
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

-- The action payloads were produced by actual validateReplaceJob and
-- prepareBoundReplaceAction, not handcrafted SQL permission objects.
do $$
declare f jsonb:=pg_temp.fixture();a jsonb;cap uuid;actual record;replay record;e public.pet_care_entries;
 before_count integer;after_count integer;original_count integer;old_claims jsonb;meaning jsonb;assistant uuid:='89300000-0000-4000-8000-000000000006';i integer:=0;
begin
 for a in select value from jsonb_array_elements(f->'actions') loop
  i:=i+1;
  begin
   select count(*),jsonb_agg(to_jsonb(c) order by c.id) into original_count,old_claims from public.semantic_claims c;
   cap:=pg_temp.mint(a,assistant);
   perform pg_temp.check_true((select note=f#>>'{reference,body}' from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid),'no write at mint');
   perform pg_temp.check_true((select target_updated_at=(f#>>'{reference,updatedAt}')::timestamptz from public.ask_action_capabilities where id=cap),'exact version bound');
   select * into actual from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);
   perform pg_temp.check_true(actual.changed and actual.action->>'status'='succeeded','confirmed mutation');
   select * into e from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid;
   perform pg_temp.check_true(e.note=a#>>'{replaceJob,body,text}' and e.occurred_at=(f#>>'{reference,eventAt}')::timestamptz,'exact body/event time');
   meaning:=coalesce(a#>'{replaceJob,semantics}','{"classification":"unknown","target":null}'::jsonb);
   perform pg_temp.check_true((select count(*)=1 from public.semantic_claims c where c.user_id=(f->>'owner')::uuid
    and c.subject_type='pet' and c.subject_id=e.pet_profile_id and c.source_message_id=e.intelligence_source_message_id
    and c.source_message_lineage_id=e.id and c.source_local_claim_key='source_semantics'
    and c.turn_idempotency_key=md5(private.ask_source_semantics_snapshot(e)::text)::uuid
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->>'version'='source-semantics.v1'
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'source'=private.ask_source_semantics_snapshot(e)
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'classification'=meaning->'classification'
    and (c.governance_metadata->>'sourceSemanticsPayload')::jsonb->'target'=meaning->'target'
    and c.knowledge_status='unconfirmed' and c.modality='reported' and c.persistence_destination='none'),'exact one current non-effective version claim');
   perform pg_temp.check_true((select count(*)=original_count+1 from public.semantic_claims),'exact +1 total claim delta');
   perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(old_claims) old where not exists(select 1 from public.semantic_claims c where to_jsonb(c)=old)),'old claim snapshots unchanged');
   perform pg_temp.check_true(not exists(select 1 from public.semantic_claim_relations),'zero effective or other relation edges');
   perform pg_temp.check_true((select receipt=actual.action and status='succeeded' from public.ask_action_capabilities where id=cap),'persisted receipt exact equality');
   select count(*) into before_count from public.semantic_claims;
   select * into replay from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);
   select count(*) into after_count from public.semantic_claims;
   perform pg_temp.check_true(not replay.changed and replay.action=actual.action and before_count=after_count
    and (select to_jsonb(x)=to_jsonb(e) from public.pet_care_entries x where x.id=e.id)
    and not exists(select 1 from public.semantic_claim_relations),'durable exact receipt replay');
   raise notice 'PASS typed/legacy mint-confirm-stamp-replay %',i;
   raise exception using errcode='Z0001',message='rollback successful fixture variant';
  exception when sqlstate 'Z0001' then null;end;
 end loop;
end $$;

-- Reject malformed/extra WRITE meanings at mint; no capability or care effect.
do $$
declare f jsonb:=pg_temp.fixture();base jsonb:=f->'actions'->0;a jsonb;s jsonb;caps bigint;care jsonb;rejected boolean;variant jsonb;
begin
 select count(*) into caps from public.ask_action_capabilities;
 select to_jsonb(e) into care from public.pet_care_entries e where id=(f#>>'{reference,recordId}')::uuid;
 for s in select value from jsonb_array_elements(f->'bad') loop
  a:=jsonb_set(base,'{replaceJob,semantics}',s);rejected:=false;
  begin perform pg_temp.mint(a,'89300000-0000-4000-8000-000000000006');exception when check_violation then rejected:=true;end;
  perform pg_temp.check_true(rejected,'invalid semantics rejected at mint');
  perform pg_temp.check_true((select count(*)=caps from public.ask_action_capabilities),'no rejected capability');
  perform pg_temp.check_true((select to_jsonb(e)=care from public.pet_care_entries e where id=(f#>>'{reference,recordId}')::uuid),'no rejected care effect');
 end loop;
 for variant in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_set(base,'{replaceJob}',base->'replaceJob'||'{"extra":true}'),
  jsonb_set(base,'{replaceJob,petId}','"89300000-0000-4000-8000-000000000099"'),
  jsonb_set(base,'{replaceJob,sourceMessageId}','"89300000-0000-4000-8000-000000000099"'),
  jsonb_set(base,'{replaceJob,target,updatedAt}','"2020-01-01T00:00:00Z"'),
  jsonb_set(base,'{replaceJob,body,text}','"changed body"'))) loop
  rejected:=false;
  begin perform pg_temp.mint(variant,'89300000-0000-4000-8000-000000000006');exception when check_violation then rejected:=true;end;
  perform pg_temp.check_true(rejected,'job/source/subject/version/body drift rejected');
  perform pg_temp.check_true((select count(*)=caps from public.ask_action_capabilities),'no drift capability');
 end loop;
 raise notice 'PASS malformed semantics, unknown keys, subject/source/version/body drift';
end $$;

-- The exact same externally curated vectors are consumed by TS and this native
-- specification. No JS emulation is counted as a native SQL execution.
do $$
declare v jsonb;f jsonb:=pg_temp.fixture();a jsonb;rejected boolean;caps bigint;
begin
 select count(*) into caps from public.ask_action_capabilities;
 for v in select value from jsonb_array_elements(current_setting('furvise.test_semantics_vectors')::jsonb->'vectors') loop
  perform pg_temp.check_true(private.canonical_replace_write_semantics_valid(jsonb_build_object('semantics',v->'semantics'))=(v->>'expected')::boolean,'native differential: '||(v->>'name'));
  if not (v->>'expected')::boolean then
   a:=jsonb_set(f->'actions'->0,'{replaceJob,semantics}',v->'semantics');rejected:=false;
   begin perform pg_temp.mint(a,'89300000-0000-4000-8000-000000000006');exception when check_violation then rejected:=true;end;
   perform pg_temp.check_true(rejected,'strict malformed classification/date mint: '||(v->>'name'));
   perform pg_temp.check_true((select count(*)=caps from public.ask_action_capabilities),'no invalid vector capability');
  end if;
 end loop;
end $$;

-- Real distinct owner/pet/source identities, not a mismatched inner-ID surrogate.
do $$
declare f jsonb:=pg_temp.fixture();foreign_f jsonb:=f->'foreign';a jsonb;who uuid;assistant uuid;cap uuid;
 caps bigint;care jsonb;claims jsonb;rejected boolean;r record;i integer;
begin
 select count(*) into caps from public.ask_action_capabilities;
 select jsonb_agg(to_jsonb(e) order by e.id) into care from public.pet_care_entries e;
 select jsonb_agg(to_jsonb(c) order by c.id) into claims from public.semantic_claims c;
 for i in 1..2 loop
  a:=case when i=1 then f->'actions'->0 else foreign_f->'actions'->0 end;
  who:=(case when i=1 then foreign_f else f end->>'owner')::uuid;
  assistant:=case when i=1 then '89300000-0000-4000-8000-000000000106'::uuid else '89300000-0000-4000-8000-000000000006'::uuid end;
  rejected:=false;
  begin perform pg_temp.mint_for(who,a,assistant);exception when check_violation or insufficient_privilege or invalid_parameter_value then rejected:=true;end;
  perform pg_temp.check_true(rejected,'foreign-owner mint rejected');
 end loop;
 perform pg_temp.check_true((select count(*)=caps from public.ask_action_capabilities),'no cross-owner minted capability');
 cap:=pg_temp.mint(f->'actions'->0,'89300000-0000-4000-8000-000000000006');
 -- A foreign caller holds the real capability ID and correct assistant ID.
 -- Its request must not yield a succeeded result or affect the pending action.
 rejected:=false;
 begin
  select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(foreign_f->>'owner')::uuid,'confirm',null);
  rejected:=r.action is null or r.action->>'status'<>'succeeded';
 exception when insufficient_privilege or invalid_parameter_value or no_data_found then rejected:=true;end;
 perform pg_temp.check_true(rejected,'unauthorized real second owner cannot confirm');
 perform pg_temp.check_true((select status='pending' and receipt is null from public.ask_action_capabilities where id=cap),'unauthorized confirm preserves pending/null receipt');
 perform pg_temp.check_true((select jsonb_agg(to_jsonb(e) order by e.id)=care from public.pet_care_entries e),'both owners care unchanged');
 perform pg_temp.check_true((select jsonb_agg(to_jsonb(c) order by c.id)=claims from public.semantic_claims c),'both owners claims unchanged');
 -- Correct foreign owner mint/confirm is separately positive, rolled back here.
 begin
  cap:=pg_temp.mint_for((foreign_f->>'owner')::uuid,foreign_f->'actions'->0,'89300000-0000-4000-8000-000000000106');
  select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000106',(foreign_f->>'owner')::uuid,'confirm',null);
  perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','second owner valid own target');
  raise exception using errcode='Z0001',message='rollback foreign positive';
 exception when sqlstate 'Z0001' then null;end;
 raise exception using errcode='Z0002',message='rollback owner isolation fixtures';
exception when sqlstate 'Z0002' then null;
end $$;

-- Drift happens AFTER a successful mint; confirmation is the boundary tested.
do $$
declare f jsonb:=pg_temp.fixture();cap uuid;kind text;before_care jsonb;before_claims jsonb;r record;rejected boolean;
begin
 foreach kind in array array['target-version','source-body'] loop
  begin
   cap:=pg_temp.mint(f->'actions'->0,'89300000-0000-4000-8000-000000000006');
   if kind='target-version' then
    update public.pet_care_entries set note='Concurrent owner change',updated_at=clock_timestamp() where id=(f#>>'{reference,recordId}')::uuid;
   else
    update public.ask_conversation_messages set user_text='Changed source after mint' where id=(f#>>'{source,id}')::uuid;
   end if;
   select jsonb_agg(to_jsonb(e) order by e.id) into before_care from public.pet_care_entries e;
   select jsonb_agg(to_jsonb(c) order by c.id) into before_claims from public.semantic_claims c;
   rejected:=false;
   begin
    select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(f->>'owner')::uuid,'confirm',null);
    rejected:=r.action is null or r.action->>'status'<>'succeeded';
   exception when check_violation or invalid_parameter_value or no_data_found then rejected:=true;end;
   perform pg_temp.check_true(rejected,'post-mint drift rejected: '||kind);
   perform pg_temp.check_true((select jsonb_agg(to_jsonb(e) order by e.id)=before_care from public.pet_care_entries e),'no care effect after post-mint drift');
   perform pg_temp.check_true((select jsonb_agg(to_jsonb(c) order by c.id)=before_claims from public.semantic_claims c),'no claim effect after post-mint drift');
   raise exception using errcode='Z0001',message='rollback drift variant';
  exception when sqlstate 'Z0001' then null;end;
 end loop;
end $$;

-- Last-event selector and canonical suggestion delegate through the real public
-- executor. Both are separate positive controls, not shortcut confirmations.
do $$
declare f jsonb:=pg_temp.fixture();kind text;cap uuid;s public.ai_update_suggestions;r record;again record;n bigint;
begin
 foreach kind in array array['latest','suggestion'] loop
  begin
   cap:=pg_temp.mint(case when kind='latest' then f#>'{latest,action}' else f->'actions'->0 end,'89300000-0000-4000-8000-000000000006');
   perform pg_temp.check_true((select target_id=(f#>>'{reference,recordId}')::uuid from public.ask_action_capabilities where id=cap),'selector exact owned target');
   if kind='suggestion' then
    select * into s from public.persist_ask_canonical_suggestion((f->>'owner')::uuid,cap);
    select * into r from public.execute_ask_canonical_suggestion((f->>'owner')::uuid,s.id,cap);
   else
    select * into r from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(f->>'owner')::uuid,'confirm',null);
   end if;
   perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','valid delegated confirmation: '||kind);
   select count(*) into n from public.semantic_claims;
   if kind='suggestion' then
    select * into again from public.execute_ask_canonical_suggestion((f->>'owner')::uuid,s.id,cap);
    perform pg_temp.check_true((select status='saved' from public.ai_update_suggestions where id=s.id),'canonical suggestion saved');
   else
    select * into again from public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(f->>'owner')::uuid,'confirm',null);
   end if;
   perform pg_temp.check_true(not again.changed and again.action=r.action and (select receipt=r.action from public.ask_action_capabilities where id=cap) and (select count(*)=n from public.semantic_claims),'delegated exact durable replay');
   raise exception using errcode='Z0001',message='rollback delegated variant';
  exception when sqlstate 'Z0001' then null;end;
 end loop;
 -- Absence of semantics is legacy-compatible; absence of the canonical job is NOT.
 begin
  perform pg_temp.mint((f->'actions'->0)-'replaceJob','89300000-0000-4000-8000-000000000006');
  raise exception 'ASSERTION_FAILED: no-canonical-job minted';
 exception when check_violation then null;end;
end $$;

-- Unicode bodies use production Binder spans in UTF-16 units; SQL text length
-- alone is insufficient for astral code points. No normalization is performed.
do $$
declare f jsonb:=pg_temp.fixture();v jsonb;cap uuid;r record;src uuid;assistant uuid;request uuid;i integer:=0;bound public.ask_action_capabilities;
begin
 for v in select value from jsonb_array_elements(f->'unicode') loop
  i:=i+1;
  if (v->>'expected')::boolean then
   begin
    src:=(v#>>'{source,id}')::uuid;assistant:=('89300000-0000-4000-8000-'||lpad((300+i)::text,12,'0'))::uuid;
    request:=(v#>>'{source,requestId}')::uuid;
    insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id,created_at)
     values(src,'89300000-0000-4000-8000-000000000005',(f->>'owner')::uuid,'user',10+i*2,v#>>'{source,text}',request,(v#>>'{source,createdAt}')::timestamptz);
    insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
     values(assistant,'89300000-0000-4000-8000-000000000005',(f->>'owner')::uuid,'furvise',11+i*2,'{}',request);
    cap:=pg_temp.mint(v->'action',assistant);
    select * into r from public.execute_ask_action_capability(cap,assistant,(f->>'owner')::uuid,'confirm',null);
    perform pg_temp.check_true(r.changed and r.action->>'status'='succeeded','Unicode confirm');
    perform pg_temp.check_true((select note=v->>'body' from public.pet_care_entries where id=(f#>>'{reference,recordId}')::uuid),'exact Unicode body retained');
    raise exception using errcode='Z0001',message='rollback Unicode variant';
   exception when sqlstate 'Z0001' then null;end;
  else
   perform pg_temp.check_true((v->>'utf16Length')::integer=1001 and length(v->>'body')+length(regexp_replace(v->>'body',U&'[^\+010000-\+10FFFF]','','g'))=1001,'over-limit UTF16 vector');
   -- Begin with an ACTUALLY minted, fully bound capability. The counterexample
   -- preserves valid owner/pet/target/source/version/constraints while changing
   -- source/body together. It is not an empty composite rejected for missing keys.
   begin
    cap:=pg_temp.mint(f->'actions'->0,'89300000-0000-4000-8000-000000000006');
    select * into bound from public.ask_action_capabilities where id=cap;
    perform pg_temp.check_true(private.canonical_replace_matches(bound),'positive complete composite before UTF16 challenge');
    update public.ask_conversation_messages set user_text='Replace with: '||(v->>'body') where id=bound.source_message_id;
    bound.action_payload:=jsonb_set(bound.action_payload,'{replaceJob,body,text}',v->'body');
    bound.action_payload:=jsonb_set(bound.action_payload,'{replaceJob,body,start}','14');
    bound.action_payload:=jsonb_set(bound.action_payload,'{replaceJob,body,end}','1015');
    bound.action_payload:=jsonb_set(bound.action_payload,'{input,detail}',v->'body');
    perform pg_temp.check_true(not private.canonical_replace_matches(bound),'SQL rejects UTF16 1001 with otherwise bound fields');
    raise exception using errcode='Z0001',message='rollback over-limit challenge';
   exception when sqlstate 'Z0001' then null;end;
  end if;
 end loop;
end $$;

-- Inject ONLY a test trigger in this disposable transaction. The production
-- mint/executor/stamp and table guards stay unchanged and enabled.
create function pg_temp.fail_stamp() returns trigger language plpgsql as $$
begin raise exception 'OFFLINE_INJECTED_STAMP_FAILURE';end $$;
create trigger zz_offline_fail_stamp before insert on public.semantic_claims for each row execute function pg_temp.fail_stamp();
do $$
declare f jsonb:=pg_temp.fixture();cap uuid;before_row jsonb;before_cap jsonb;before_count bigint;rejected boolean:=false;
begin
 cap:=pg_temp.mint(f->'actions'->0,'89300000-0000-4000-8000-000000000006');
 select to_jsonb(c) into before_cap from public.ask_action_capabilities c where id=cap;
 select to_jsonb(e) into before_row from public.pet_care_entries e where id=(f#>>'{reference,recordId}')::uuid;
 select count(*) into before_count from public.semantic_claims;
 begin perform public.execute_ask_action_capability(cap,'89300000-0000-4000-8000-000000000006',(f->>'owner')::uuid,'confirm',null);
 exception when raise_exception then if sqlerrm<>'OFFLINE_INJECTED_STAMP_FAILURE' then raise;end if;rejected:=true;end;
 perform pg_temp.check_true(rejected,'stamp injection reached');
 perform pg_temp.check_true((select to_jsonb(e)=before_row from public.pet_care_entries e where id=(f#>>'{reference,recordId}')::uuid),'care mutation rolled back');
 perform pg_temp.check_true((select status='pending' and receipt is null and to_jsonb(c)=before_cap from public.ask_action_capabilities c where id=cap),'receipt transition rolled back');
 perform pg_temp.check_true((select count(*)=before_count from public.semantic_claims),'stamp rolled back');
 raise notice 'PASS stamp-failure transaction rollback';
end $$;
-- Runner appends ROLLBACK, never COMMIT.
