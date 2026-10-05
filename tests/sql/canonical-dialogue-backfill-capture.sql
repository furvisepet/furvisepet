-- UNEXECUTED independent reviewer pre-migration probe, on an already isolated
-- disposable clone with genuine canonical fixture rows seeded by the ORIGINAL
-- native reproduction. No creation of a target, connection, or migration here.
do $$ begin
 if current_database() not like 'furvise_disposable_%' or (inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet)) then raise exception 'DISPOSABLE_LOCAL_REQUIRED';end if;
 if exists(select 1 from pg_attribute where attrelid='public.pet_care_entries'::regclass and attname='canonical_ask_origin_message_id' and not attisdropped) then raise exception 'PROBE_REQUIRES_PRE_MIGRATION_SCHEMA';end if;
 if not exists(select 1 from public.pet_care_entries where canonical_ask_isolated) then raise exception 'CANONICAL_FIXTURE_REQUIRED';end if;
end $$;
create temp table canonical_backfill_before as
 select e.id,to_jsonb(e) as care,private.ask_source_semantics_snapshot(e) as snapshot from public.pet_care_entries e;
create temp table canonical_claims_before as select id,to_jsonb(c) as claim from public.semantic_claims c;
create temp table canonical_receipts_before as select id,to_jsonb(c) as capability from public.ask_action_capabilities c;
-- Independent runner applies the candidate forward migration in THIS session,
-- then runs canonical-dialogue-backfill-assert.sql. Temp tables are not persisted.
