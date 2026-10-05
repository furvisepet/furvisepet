-- Derived fixture seams from immutable native witnesses. New specification UNEXECUTED.
-- Minimal native compatibility reproduction; strict expected no-effect oracle retained.
-- Test-only standard SQL. Parent MUST wrap in BEGIN ... ROLLBACK on its NEW
-- isolated local cluster. This file never disables production triggers or RLS.
-- Requires exact captured apply_ask_task_v2 installed alongside full candidate.
set local client_encoding='UTF8';
set local statement_timeout='45s';
set local lock_timeout='5s';
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.tv2_check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'TASK_V2_ASSERTION_FAILED: %',label; end if; end $$;
do $$ declare p regprocedure:='public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)'::regprocedure; begin
 perform pg_temp.tv2_check(current_user='postgres' and session_user='postgres','session is postgres');
 perform pg_temp.tv2_check((select not rolsuper and rolbypassrls from pg_roles where rolname=current_user),'NOSUPERUSER+BYPASSRLS session owner');
 perform pg_temp.tv2_check(current_user=(select pg_get_userbyid(relowner) from pg_class where oid='private.ask_tasks'::regclass),'task relation owner');
 perform pg_temp.tv2_check(current_database() like 'furvise_disposable_%','disposable database name');
 perform pg_temp.tv2_check(inet_server_addr() is null or inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet),'local connection');
 perform pg_temp.tv2_check((select not rolsuper from pg_roles where rolname='service_role'),'non-super service role');
 perform pg_temp.tv2_check((select prosecdef and pg_get_userbyid(proowner)='postgres' from pg_proc where oid=p),'exact RPC security definer owner');
 perform pg_temp.tv2_check(has_function_privilege('service_role',p,'EXECUTE') and not has_function_privilege('authenticated',p,'EXECUTE') and not has_function_privilege('anon',p,'EXECUTE'),'service-only exact RPC ACL');
 perform pg_temp.tv2_check(to_regprocedure('private.is_canonical_ask_source(uuid)') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='pet_care_entries' and column_name='canonical_ask_origin_message_id'),'full candidate source guards installed');
 perform pg_temp.tv2_check(not exists(select 1 from auth.users where id in('89720000-0000-4000-8000-000000000001','89720000-0000-4000-8000-000000000002')),'synthetic IDs unused');
end $$;
create function pg_temp.tv2_id(n integer) returns uuid language sql immutable as $$ select ('89720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
do $$ begin
 insert into auth.users(id) values(pg_temp.tv2_id(1)),(pg_temp.tv2_id(2));
 perform private.set_furvise_server_actor(pg_temp.tv2_id(1));
 -- Exactly one profile per free-plan owner; no entitlement changes.
 insert into public.dog_profiles(id,user_id,name,species) values(pg_temp.tv2_id(11),pg_temp.tv2_id(1),'Synthetic Alder','dog');
 perform private.set_furvise_server_actor(pg_temp.tv2_id(2));
 insert into public.dog_profiles(id,user_id,name,species) values(pg_temp.tv2_id(12),pg_temp.tv2_id(2),'Synthetic Foreign','dog');
end $$;
create function pg_temp.tv2_state() returns jsonb language plpgsql as $$
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
create function pg_temp.tv2_new_case(source_text text default 'Please save: Synthetic Alder rested quietly. Thanks.',note_text text default 'Synthetic Alder rested quietly.',owner_number integer default 1)
returns jsonb language plpgsql as $$
declare who uuid:=pg_temp.tv2_id(owner_number);pet uuid:=pg_temp.tv2_id(case when owner_number=1 then 11 else 12 end);
 conv uuid:=gen_random_uuid();source uuid:=gen_random_uuid();assistant uuid:=gen_random_uuid();request uuid:=gen_random_uuid();
begin
 perform private.set_furvise_server_actor(who);
 insert into public.ask_conversations(id,user_id,pet_profile_id,title) values(conv,who,pet,'Synthetic task-v2 fixture');
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id,created_at)
 values(source,conv,who,'user',1,source_text,request,'2026-10-03T12:00:00Z');
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
 values(assistant,conv,who,'furvise',2,'{}',request);
 return jsonb_build_object('user',who,'pet',pet,'conversation',conv,'source',source,'message',source,'assistant',assistant,'request',request,
  'sourceText',source_text,'note',note_text,'intent','save','task',null,'revision',null,'occurredAt',null,'explicitTime',null,'requiresAnswer',false);
end $$;
create function pg_temp.tv2_turn(f jsonb,body text default 'Continue the saved note.',seq integer default 3) returns jsonb language plpgsql as $$
declare msg uuid:=gen_random_uuid();begin
 insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,user_text,request_id)
 values(msg,(f->>'conversation')::uuid,(f->>'user')::uuid,'user',seq,body,gen_random_uuid());
 return f||jsonb_build_object('message',msg);
end $$;
-- SECURITY INVOKER wrapper: actual role is changed before entering the RPC.
-- No role/database grants and no direct business writes occur in this helper.
create function pg_temp.tv2_call(f jsonb,delta jsonb default '{}',request_role text default 'service_role') returns jsonb language plpgsql as $$
declare x jsonb:=f||delta;result jsonb;
begin
 if request_role not in ('service_role','authenticated','anon') then raise exception 'TEST_ROLE_INVALID';end if;
 execute format('set local role %I',request_role);
 if current_user<>request_role then raise exception 'TEST_ACTUAL_ROLE_MISMATCH';end if;
 if x->>'version'='1' then
 result:=public.apply_ask_task((x->>'user')::uuid,(x->>'conversation')::uuid,(x->>'message')::uuid,x->>'intent',
 (x->>'source')::uuid,x->>'sourceText',(x->>'pet')::uuid,(x->>'task')::uuid,(x->>'revision')::integer,
 (x->>'occurredAt')::timestamptz,x->>'explicitTime',(x->>'requiresAnswer')::boolean);
 else
 result:=public.apply_ask_task_v2((x->>'user')::uuid,(x->>'conversation')::uuid,(x->>'message')::uuid,x->>'intent',
 (x->>'source')::uuid,x->>'sourceText',x->>'note',(x->>'pet')::uuid,(x->>'task')::uuid,(x->>'revision')::integer,
 (x->>'occurredAt')::timestamptz,x->>'explicitTime',(x->>'requiresAnswer')::boolean);
 end if;
 execute 'reset role';return result;
exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.tv2_reject(f jsonb,delta jsonb,code_expected text,message_expected text,label text,request_role text default 'service_role') returns void language plpgsql as $$
declare before jsonb:=pg_temp.tv2_state();code text;msg text;rejected boolean:=false;
begin
 begin perform pg_temp.tv2_call(f,delta,request_role);exception when others then rejected:=true;get stacked diagnostics code=returned_sqlstate,msg=message_text;end;
 perform pg_temp.tv2_check(rejected,label||' rejected');
 perform pg_temp.tv2_check(code=code_expected,label||' expected SQLSTATE, got '||coalesce(code,'<none>')||' '||coalesce(msg,''));
 perform pg_temp.tv2_check(message_expected is null or msg=message_expected,label||' expected exact error, got '||coalesce(msg,'<none>'));
 perform pg_temp.tv2_check(pg_temp.tv2_state()=before,label||' atomic across lifecycle relations');
 raise notice 'PASS task_v2 rejection % SQLSTATE=% message=%',label,code,msg;
end $$;
-- Catalog-only identity evidence; the parent verifies the captured body/hash too.
select 'TASK_V2_RPC_CATALOG' as evidence,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl,md5(p.prosrc) prosrc_md5
 from pg_proc p where p.oid='public.apply_ask_task_v2(uuid,uuid,uuid,text,uuid,text,text,uuid,uuid,integer,timestamptz,text,boolean)'::regprocedure;

-- Append after 00-fixture.sql. Can also follow 10-core-contract.sql.
-- Mint is a privileged fixture seam with real production capability validation.
-- It does not claim to execute the JavaScript planner or confirmation UI.
create function pg_temp.tv2_mint_append(f jsonb) returns uuid language plpgsql as $$
declare a jsonb;body text:=f->>'note';start_at integer:=strpos(f->>'sourceText',f->>'note')-1;cap uuid;
begin
 -- This finite ASCII source uses exact zero-based UTF-16 coordinates.
 perform pg_temp.tv2_check(start_at>=0 and octet_length(body)=length(body),'ASCII exact synthetic canonical span');
 a:=jsonb_build_object('id',(f->>'request')||':append','kind','care_history.add','petId',f->'pet','sourceMessageId',f->'source',
  'safetyClass','LOW_RISK_REVERSIBLE','mutationClass','mutation','confirmationPolicy','explicit_intent','authorizationScope','owned_pet',
  'explicitIntent',false,'status','proposed','evidence',body,'label','Add to care history','description',body,
  'href',null,'resultMessage',null,'errorMessage',null,
  'input',jsonb_build_object('field',null,'value',null,'title','Owner note','detail',null,'category','general','target','specified'),
  'appendJob',jsonb_build_object('operation','append','petId',f->'pet','sourceMessageId',f->'source','items',jsonb_build_array(
   jsonb_build_object('body',jsonb_build_object('id',(f->>'source')||':'||start_at::text||':'||(start_at+length(body))::text,
    'sourceMessageId',f->'source','start',start_at,'end',start_at+length(body),'text',body),
    'date',null,'occurredAt',null,'semantics',jsonb_build_object('classification','observation','target',null)))));
 insert into public.ask_action_capabilities(user_id,assistant_message_id,source_message_id,source_action_id,action_kind,pet_profile_id,
  target_id,safety_class,mutation_class,confirmation_policy,authorization_scope,explicit_intent,action_payload)
 values((f->>'user')::uuid,(f->>'assistant')::uuid,(f->>'source')::uuid,a->>'id',a->>'kind',(f->>'pet')::uuid,
  null,a->>'safetyClass',a->>'mutationClass',a->>'confirmationPolicy',a->>'authorizationScope',false,a) returning id into cap;
 return cap;
end $$;
create function pg_temp.tv2_confirm_append(f jsonb,cap uuid,mode text default 'confirm') returns jsonb language plpgsql as $$
declare r record;begin
 execute 'set local role service_role';
 if current_user<>'service_role' then raise exception 'TEST_ACTUAL_ROLE_MISMATCH';end if;
 select * into strict r from public.execute_ask_action_capability(cap,(f->>'assistant')::uuid,(f->>'user')::uuid,mode,null);
 execute 'reset role';return jsonb_build_object('action',r.action,'changed',r.changed);
exception when others then execute 'reset role';raise;end $$;
create function pg_temp.tv2_guarded_legacy_reject(f jsonb) returns void language plpgsql as $$
declare before jsonb:=pg_temp.tv2_state();code text;msg text;rejected boolean:=false;
begin
 begin
  execute 'set local role service_role';
  if current_user<>'service_role' then raise exception 'TEST_ACTUAL_ROLE_MISMATCH';end if;
  perform public.persist_furvise_server_care_event((f->>'user')::uuid,(f->>'pet')::uuid,(f->>'source')::uuid,'{}'::jsonb,null);
  execute 'reset role';
 exception when others then execute 'reset role';rejected:=true;get stacked diagnostics code=returned_sqlstate,msg=message_text;end;
 perform pg_temp.tv2_check(rejected and code='42501' and msg='CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN','known legacy RPC canonical-source guard fires before payload processing');
 perform pg_temp.tv2_check(pg_temp.tv2_state()=before,'guarded legacy RPC is atomic');
 raise notice 'PASS task_v2 differential guarded legacy RPC SQLSTATE=% message=%',code,msg;
end $$;


