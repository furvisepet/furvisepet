-- UNEXECUTED independent post-migration assertion; requires capture probe.
do $$ begin
 if (select count(*) from public.pet_care_entries)<>(select count(*) from canonical_backfill_before)
  or exists(select 1 from canonical_backfill_before b left join public.pet_care_entries e on e.id=b.id
   where e.id is null or (to_jsonb(e)-'canonical_ask_origin_message_id') is distinct from b.care
    or private.ask_source_semantics_snapshot(e) is distinct from b.snapshot
    or e.canonical_ask_origin_message_id is distinct from case when e.canonical_ask_isolated then (b.care->>'intelligence_source_message_id')::uuid else null end)
  then raise exception 'BACKFILL_CHANGED_CARE_OR_SNAPSHOT';end if;
 if (select count(*) from public.semantic_claims)<>(select count(*) from canonical_claims_before)
  or exists(select 1 from canonical_claims_before b left join public.semantic_claims c on c.id=b.id where to_jsonb(c) is distinct from b.claim)
  then raise exception 'BACKFILL_CHANGED_SEMANTIC_EVIDENCE';end if;
 if (select count(*) from public.ask_action_capabilities)<>(select count(*) from canonical_receipts_before)
  or exists(select 1 from canonical_receipts_before b left join public.ask_action_capabilities c on c.id=b.id where to_jsonb(c) is distinct from b.capability)
  then raise exception 'BACKFILL_CHANGED_RECEIPTS';end if;
 raise notice 'CANONICAL_ORIGIN_BACKFILL_EXACT_COMPLETE';
end $$;
