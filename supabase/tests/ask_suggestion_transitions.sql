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
create function pg_temp.fail_receipt() returns trigger language plpgsql as $$begin
 if new.id='71000000-0000-4000-8000-000000000035' and new.status='saved' then raise exception 'AUDIT_RECEIPT_FAILURE'; end if;
 return new; end$$;
create trigger audit_fail_receipt before update on public.ai_update_suggestions for each row execute function pg_temp.fail_receipt();
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$declare owner_id uuid:='71000000-0000-4000-8000-000000000001'; r record; begin
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000031','monitor');
 if r.apply_status <> 'applied' or r.concern_status <> 'monitoring' then raise exception 'monitor failed';end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000031','dismiss');
 if r.apply_status <> 'already_applied' then raise exception 'saved receipt was dismissed';end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000031','monitor');
 if r.apply_status <> 'already_applied' then raise exception 'monitor replay changed effect';end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000032','dismiss');
 if r.apply_status <> 'dismissed' then raise exception 'dismiss failed';end if;
 select * into r from public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000032','dismiss');
 if r.apply_status <> 'dismissed' then raise exception 'dismiss replay failed';end if;
 begin perform public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000032','monitor');raise exception 'dismissed monitor accepted';exception when serialization_failure then null;end;
 begin perform public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000033','monitor');raise exception 'resolved monitor accepted';exception when serialization_failure then null;end;
 begin perform public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000034','monitor');raise exception 'stale monitor accepted';exception when serialization_failure then null;end;
 begin perform public.transition_ask_suggestion(owner_id,'71000000-0000-4000-8000-000000000035','monitor');raise exception 'receipt fault not raised';
 exception when raise_exception then if sqlerrm <> 'AUDIT_RECEIPT_FAILURE' then raise;end if;end;
 if (select status from public.pet_concerns where id='71000000-0000-4000-8000-000000000025') <> 'active' then raise exception 'partial concern write';end if;
 if (select status from public.ai_update_suggestions where id='71000000-0000-4000-8000-000000000035') <> 'pending' then raise exception 'partial suggestion write';end if;
 begin perform public.transition_ask_suggestion('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000036','dismiss');raise exception 'foreign suggestion accepted';exception when no_data_found then null;end;
end$$;
reset role;
update public.dog_profiles set lifecycle_status='archived' where id='71000000-0000-4000-8000-000000000011';
set local role service_role;
do $$begin
 begin perform public.transition_ask_suggestion('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000037','monitor');raise exception 'archived monitor accepted';exception when serialization_failure then null;end;
end$$;
reset role;
do $$declare signature regprocedure:='public.transition_ask_suggestion(uuid,uuid,text)';begin
 if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') or not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'wrong RPC grants';end if;
end$$;
rollback;
