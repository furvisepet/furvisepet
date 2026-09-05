-- Disposable LOCAL PostgreSQL only. Real RLS, indexes and query execution.
-- All synthetic rows, temporary functions and statistics changes roll back.
\timing on
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('83000000-0000-4000-8000-000000000001','authenticated','authenticated','scale@example.test',now(),now());
insert into public.dog_profiles(id,user_id,name,species) values
 ('83000000-0000-4000-8000-000000000011','83000000-0000-4000-8000-000000000001','Synthetic Milo','dog');
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('84000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'grooming','Synthetic routine grooming, no clinical update.', '2026-01-01'::timestamptz + i * interval '1 minute'
 from generate_series(1,100000) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at)
 select ('85000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011',
 'symptom','Synthetic vomiting note.', '2014-07-09'::timestamptz from generate_series(1,60) i;
insert into public.pet_care_entries(id,user_id,pet_profile_id,category,note,occurred_at) values
 ('85000000-0000-4000-8000-000000000061','83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000011','symptom','Synthetic decisive 2011 soft-stool note, not vomiting.','2011-02-01');
analyze public.pet_care_entries;
analyze public.dog_profiles;
select count(*) as synthetic_rows from public.pet_care_entries;
select indexname,indexdef from pg_indexes where indexname in
 ('care_history_owner_pet_cursor_idx','care_history_note_search_idx','care_history_title_search_idx','ask_correction_subject_event_idx','ask_history_removed_source_idx') order by indexname;
do $$ begin
 if (select count(*) from pg_indexes where indexname in ('care_history_owner_pet_cursor_idx','care_history_note_search_idx','care_history_title_search_idx','ask_correction_subject_event_idx','ask_history_removed_source_idx')) <> 5 then raise exception 'prepared indexes missing'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
-- Exact production cursor predicate, including the unique ID tie-breaker.
do $$ declare last_time timestamptz; last_id uuid; item record; page_count int; seen uuid[] := '{}'; pages int := 0; begin
 loop
  page_count := 0; pages := pages + 1;
  for item in select id,occurred_at from public.pet_care_entries
    where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null
      and occurred_at >= '2014-01-01' and occurred_at < '2015-01-01'
      and (note ilike '%vomit%' or title ilike '%vomit%')
      and (last_time is null or occurred_at > last_time or (occurred_at=last_time and id>last_id))
    order by occurred_at,id limit 25
  loop
   if item.id=any(seen) then raise exception 'duplicate cursor row'; end if;
   seen := array_append(seen,item.id); last_time := item.occurred_at; last_id := item.id; page_count := page_count+1;
  end loop;
  exit when page_count=0;
  if pages>4 then raise exception 'cursor did not terminate'; end if;
 end loop;
 if cardinality(seen)<>60 or pages<>4 then raise exception 'cursor gap: %, pages %',cardinality(seen),pages; end if;
 raise notice 'PASS: 60 identical-timestamp rows, 4 queries (including empty end), no gaps/duplicates';
 if (select note from public.pet_care_entries where user_id='83000000-0000-4000-8000-000000000001' and pet_profile_id='83000000-0000-4000-8000-000000000011' and deleted_at is null and occurred_at >= '2011-01-01' and occurred_at < '2012-01-01') <> 'Synthetic decisive 2011 soft-stool note, not vomiting.' then raise exception 'old decisive evidence lost'; end if;
end $$;
-- Same predicates/projection as the production candidate request. Three warm
-- repetitions, no forced planner settings, with actual buffers and row counts.
do $benchmark$ declare label text; predicate text; plan json; attempt int; statement text; begin
 for label,predicate in values
  ('period_2011', 'occurred_at >= ''2011-01-01'' and occurred_at < ''2012-01-01'' and (note ilike ''%vomit%'' or title ilike ''%vomit%'')'),
  ('topic_all_time', '(note ilike ''%vomit%'' or title ilike ''%vomit%'' or note ilike ''%threw up%'' or title ilike ''%threw up%'' or note ilike ''%thrown up%'' or title ilike ''%thrown up%'')'),
  ('topic_no_match', '(note ilike ''%weight%'' or title ilike ''%weight%'' or note ilike ''%weigh%'' or title ilike ''%weigh%'')'),
  ('tied_cursor', 'occurred_at >= ''2014-01-01'' and occurred_at < ''2015-01-01'' and (occurred_at > ''2014-07-09'' or (occurred_at = ''2014-07-09'' and id > ''85000000-0000-4000-8000-000000000025'')) and (note ilike ''%vomit%'' or title ilike ''%vomit%'')')
 loop
  statement := 'select id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at from public.pet_care_entries where user_id=''83000000-0000-4000-8000-000000000001'' and pet_profile_id=''83000000-0000-4000-8000-000000000011'' and deleted_at is null and (' || predicate || ') order by occurred_at,id limit 25';
  for attempt in 1..3 loop
   execute 'explain (analyze,buffers,format json) ' || statement into plan;
   raise notice 'BENCH % run %: %',label,attempt,plan;
  end loop;
 end loop;
 for attempt in 1..3 loop
  execute 'explain (analyze,buffers,format json) select public.read_ask_history_correction_page(array[''85000000-0000-4000-8000-000000000061''::uuid],''{}'',''{}'',''2011-01-01'',''2012-01-01'',array[''vomit''])' into plan;
  raise notice 'BENCH correction_rpc run %: %',attempt,plan;
 end loop;
end $benchmark$;
rollback;
