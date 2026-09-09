-- Set furvise.test_account_id to the authorized synthetic test account in the SQL session.
begin;
create temporary table fix_pets as select * from public.dog_profiles where user_id=current_setting('furvise.test_account_id')::uuid;
create temporary table fix_history as select * from public.pet_care_entries where user_id=current_setting('furvise.test_account_id')::uuid;
create temporary table fix_map as select id old_id,overlay(overlay(id::text placing '4' from 15 for 1) placing '8' from 20 for 1)::uuid new_id from fix_pets;
do $fix$ declare r record; n bigint; u uuid:=current_setting('furvise.test_account_id')::uuid;
begin
if (select count(*) from fix_pets)<>10 or (select count(*) from fix_history)<>3729 or exists(select 1 from fix_history where care_event_metadata->>'dataset' is distinct from 'furvise-ten-pets-five-years-20260909-v1') then raise exception 'Wrong fixture'; end if;
for r in select conrelid::regclass tbl,a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.dog_profiles'::regclass and c.conrelid<>'public.pet_care_entries'::regclass loop
execute format('select count(*) from %s where %I in (select old_id from fix_map)',r.tbl,r.col) into n;
if n<>0 then raise exception 'Dependent rows exist in %',r.tbl; end if;
end loop;
for r in select conrelid::regclass tbl,a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='public.pet_care_entries'::regclass loop
execute format('select count(*) from %s where %I in (select id from fix_history)',r.tbl,r.col) into n;
if n<>0 then raise exception 'Dependent history rows exist in %',r.tbl; end if;
end loop;
if exists(select 1 from public.semantic_claims where user_id=u) then raise exception 'Semantic claims exist'; end if;
end $fix$;
update fix_pets p set id=m.new_id from fix_map m where p.id=m.old_id;
insert into public.dog_profiles select p.* from fix_pets p where not exists(select 1 from public.dog_profiles d where d.id=p.id);
update public.pet_care_entries c set pet_profile_id=m.new_id from fix_map m where c.pet_profile_id=m.old_id and m.new_id<>m.old_id;
update public.pet_care_entries set id=overlay(overlay(id::text placing '4' from 15 for 1) placing '8' from 20 for 1)::uuid where user_id=current_setting('furvise.test_account_id')::uuid;
delete from public.dog_profiles where id in (select old_id from fix_map where old_id<>new_id);
do $verify$ begin
if (select count(*) from public.pet_care_entries where user_id=current_setting('furvise.test_account_id')::uuid)<>3729 or (select count(*) from public.dog_profiles where user_id=current_setting('furvise.test_account_id')::uuid)<>10 then raise exception 'Count mismatch'; end if;
if exists((select to_jsonb(c)-array['id','pet_profile_id','updated_at'] from public.pet_care_entries c where user_id=current_setting('furvise.test_account_id')::uuid except all select to_jsonb(h)-array['id','pet_profile_id','updated_at'] from fix_history h)) then raise exception 'History content changed'; end if;
end $verify$;
commit;