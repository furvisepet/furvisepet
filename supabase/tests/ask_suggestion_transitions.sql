-- Disposable PostgreSQL only. Every fixture, trigger and mutation is rolled back.
begin;
insert into auth.users(id) values ('71000000-0000-4000-8000-000000000001'),('71000000-0000-4000-8000-000000000002');
insert into public.dog_profiles(id,user_id,name,species) values
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000001','Audit Milo','dog');
insert into public.pet_concerns(id,user_id,pet_profile_id,title,normalized_key,status,updated_at)
 select ('71000000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,
 '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000011','Audit concern '||i,'audit_'||i,'active',now()-interval '1 day'
 from generate_series(1,7) i;
insert into public.ai_update_suggestions(id,user_id,pet_profile_id,type,title,details,concern_id,created_at)
 select ('71000000-0000-4000-8000-'||lpad((30+i)::text,12,'0'))::uuid,
 '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000011','concern_resolution','Audit update','Still improving',
 ('71000000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,now()
 from generate_series(1,7)i;
update public.pet_concerns set status='resolved',resolved_at=now() where id='71000000-0000-4000-8000-000000000023';
update public.pet_concerns set updated_at=now()+interval '1 hour' where id='71000000-0000-4000-8000-000000000024';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$declare owner_id uuid:='71000000-0000-4000-8000-000000000001'; r record; suggestion uuid; begin
 for suggestion in select id from public.ai_update_suggestions where user_id=owner_id loop
   begin
     perform public.transition_ask_suggestion(owner_id,suggestion,'monitor');
     raise exception 'legacy monitor accepted';
   exception when invalid_parameter_value then
     if sqlerrm <> 'CANONICAL_SUGGESTION_UNSUPPORTED' then raise;end if;
   end;
 end loop;
 if exists(select 1 from public.pet_concerns where user_id=owner_id and status not in ('active','resolved'))
   or exists(select 1 from public.ai_update_suggestions where user_id=owner_id and status<>'pending') then
   raise exception 'unsupported monitor changed state';
 end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000032','dismiss');
 if r.apply_status is distinct from 'dismissed' then raise exception 'dismiss failed';end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000032','dismiss');
 if r.apply_status is distinct from 'dismissed' then raise exception 'dismiss replay failed';end if;
 begin
   perform public.transition_ask_suggestion('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000036','dismiss');
   raise exception 'foreign suggestion accepted';
 exception when no_data_found then null;end;
 if (select status from public.pet_concerns where id='71000000-0000-4000-8000-000000000022') is distinct from 'active'
   or exists(select 1 from public.pet_care_entries where user_id=owner_id) then raise exception 'dismiss changed patient facts';end if;
end $$;
reset role;
update public.dog_profiles set lifecycle_status='archived' where id='71000000-0000-4000-8000-000000000011';
set local role service_role;
do $$begin
 begin perform public.transition_ask_suggestion('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000037','monitor');
 raise exception 'archived monitor accepted';exception when invalid_parameter_value then null;end;
end$$;
reset role;
do $$declare signature regprocedure:='public.transition_ask_suggestion(uuid,uuid,text)';begin
 if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'wrong RPC grants';end if;
end$$;
rollback;
