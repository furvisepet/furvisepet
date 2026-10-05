-- UNEXECUTED specification. Load task-writer-isolation-fixture.sql first.
-- Every variant rolls back to the same fixture. No source/role/trigger bypass.
do $$
declare version text;scenario text;f jsonb;other jsonb;r jsonb;replayed jsonb;cap uuid;
 before jsonb;task_before jsonb;entry public.pet_care_entries;body text;note_cancel jsonb;
 modes text[]:=array['pending','pending_null_pet','canonical_source_ordinary_current','ordinary_source_canonical_current',
 'later_canonical_resume','later_canonical_replay','later_canonical_cancel','canonical_succeeded','canonical_cancelled','canonical_failed',
 'ordinary_create','ordinary_explicit_time','ordinary_resume','ordinary_cancel','ordinary_replay','cancelled_replay',
 'owner_negative','role_anon','role_authenticated','stale_turn','revision_negative','source_text_negative','foreign_pet',
 'source_identity_negative','pending_source_negative','replay_entry_integrity','ordinary_supersession','v2_span_negative','v2_cancel_note_negative'];
begin
 foreach version in array array['1','2']loop
  foreach scenario in array modes loop
   if version='1' and scenario in('v2_span_negative','v2_cancel_note_negative')then continue;end if;
   begin
    f:=pg_temp.tv2_new_case()||jsonb_build_object('version',version);
    body:=case when version='1' then f->>'sourceText' else f->>'note' end;
    note_cancel:=case when version='2' then 'null'::jsonb else f->'note' end;
    if scenario in('pending','pending_null_pet','canonical_source_ordinary_current','canonical_succeeded','canonical_cancelled','canonical_failed')then
     cap:=pg_temp.tv2_mint_append(f);
     if scenario='canonical_source_ordinary_current'then f:=pg_temp.tv2_turn(f);end if;
     if scenario in('canonical_succeeded','canonical_cancelled','canonical_failed')then
      r:=pg_temp.tv2_confirm_append(f,cap,case scenario when 'canonical_cancelled' then 'cancel' when 'canonical_failed' then 'auto' else 'confirm' end);
      perform pg_temp.tv2_check(r#>>'{action,status}'=case scenario when 'canonical_succeeded' then 'succeeded' when 'canonical_cancelled' then 'cancelled' else 'failed' end,'genuine terminal executor state');
      if scenario='canonical_succeeded'then
       perform pg_temp.tv2_check((select count(*)=1 from public.pet_care_entries where canonical_ask_origin_message_id=(f->>'source')::uuid and canonical_ask_isolated),'canonical append preserved');
       perform pg_temp.tv2_check((select count(*)=1 from public.semantic_claims where source_message_id=(f->>'source')::uuid and governance_metadata ? 'sourceSemanticsPayload' and knowledge_status='unconfirmed' and persistence_destination='none'),'canonical stamp preserved');
      end if;
     end if;
     perform pg_temp.tv2_check(private.is_canonical_ask_source((f->>'source')::uuid),'helper classification before denied call');
     perform pg_temp.tv2_reject(f,case when scenario='pending_null_pet'then '{"pet":null}'::jsonb else '{}'::jsonb end,
      '42501','CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN',version||' '||scenario);
    elsif scenario='ordinary_source_canonical_current'then
     r:=pg_temp.tv2_call(f,'{"pet":null}');
     other:=pg_temp.tv2_turn(f,'A distinct ordinary current instruction.',3);
     insert into public.ask_conversation_messages(id,conversation_id,user_id,role,sequence_number,response_data,request_id)
      select gen_random_uuid(),conversation_id,user_id,'furvise',4,'{}',request_id from public.ask_conversation_messages where id=(other->>'message')::uuid
      returning id into cap;
     other:=other||jsonb_build_object('source',other->'message','assistant',cap,'sourceText','A distinct ordinary current instruction.','note','A distinct ordinary current instruction.',
      'request',(select request_id from public.ask_conversation_messages where id=(other->>'message')::uuid));
     cap:=pg_temp.tv2_mint_append(other);
     f:=f||jsonb_build_object('message',other->'message','intent','resume','task',r->'id','revision',r->'revision');
     r:=pg_temp.tv2_call(f);perform pg_temp.tv2_check(r->>'status'='completed','canonical current does not classify ordinary source');
     perform pg_temp.tv2_check((select note=body and not canonical_ask_isolated from public.pet_care_entries where id=(r->>'entryId')::uuid),'ordinary source text contract');
    elsif scenario in('later_canonical_resume','later_canonical_replay','later_canonical_cancel')then
     r:=pg_temp.tv2_call(f,case when scenario='later_canonical_resume' then '{"pet":null,"requiresAnswer":true}' else '{"requiresAnswer":true}' end::jsonb);
     cap:=pg_temp.tv2_mint_append(f);
     if scenario='later_canonical_replay'then
      before:=pg_temp.tv2_state();replayed:=pg_temp.tv2_call(f);perform pg_temp.tv2_check(replayed=r and pg_temp.tv2_state()=before,'later canonical harmless exact replay');
     else
      f:=pg_temp.tv2_turn(f)||jsonb_build_object('task',r->'id','revision',r->'revision');
      if scenario='later_canonical_resume'then
       perform pg_temp.tv2_reject(f,'{"intent":"resume"}','42501','CANONICAL_ASK_LEGACY_SEMANTICS_FORBIDDEN','later canonical distinct-current resume no revision or effects');
      else
       before:=pg_temp.tv2_state();r:=pg_temp.tv2_call(f,jsonb_build_object('intent','cancel','note',note_cancel));
       perform pg_temp.tv2_check(r->>'status'='cancelled' and (pg_temp.tv2_state()-'private.ask_tasks')=(before-'private.ask_tasks'),'later canonical task-only cancellation');
      end if;
     end if;
    elsif scenario in('ordinary_create','ordinary_explicit_time','ordinary_replay')then
     r:=pg_temp.tv2_call(f,case when scenario='ordinary_explicit_time' then '{"occurredAt":"2024-02-29T09:15:00Z","explicitTime":"February 29","requiresAnswer":true}' else '{}' end::jsonb);
     select * into strict entry from public.pet_care_entries where id=(r->>'entryId')::uuid;
     perform pg_temp.tv2_check(entry.note=body and not entry.canonical_ask_isolated and entry.intelligence_source_type='owner_note','v1 whole exact text / v2 literal exact span');
     perform pg_temp.tv2_check((select count(*)=1 from public.owner_note_jobs where entry_id=entry.id),'one ordinary outbox');
     perform pg_temp.tv2_check((select count(*)=1 from private.ask_tasks where source_message_id=(f->>'source')::uuid),'one ordinary task');
     perform pg_temp.tv2_check(entry.occurred_at=case when scenario='ordinary_explicit_time' then '2024-02-29T09:15:00Z'::timestamptz else '2026-10-03T12:00:00Z'::timestamptz end,'event time exact');
     perform pg_temp.tv2_check(entry.care_event_metadata->>'occurrenceBasis'=case when scenario='ordinary_explicit_time' then 'explicit' when version='1' then 'recorded_at' else 'saved_at' end,'version-specific occurrence basis');
     perform pg_temp.tv2_check(entry.care_event_metadata->>'authorizationMessageId'=f->>'message' and (entry.care_event_metadata->>'sourceRecordedAt')::timestamptz='2026-10-03T12:00:00Z','source and authorization metadata');
     perform pg_temp.tv2_check(r->>'status'=case when scenario='ordinary_explicit_time' then 'awaiting_answer' else 'completed' end,'requires answer respected');
     before:=pg_temp.tv2_state();replayed:=pg_temp.tv2_call(f);perform pg_temp.tv2_check(replayed=r and pg_temp.tv2_state()=before,'ordinary exact replay no effects');
    elsif scenario in('ordinary_resume','ordinary_cancel','cancelled_replay','revision_negative','pending_source_negative','v2_cancel_note_negative','ordinary_supersession')then
     r:=pg_temp.tv2_call(f,'{"pet":null,"requiresAnswer":true}');
     perform pg_temp.tv2_check(r->>'status'='awaiting_subject' and r->'entryId'='null'::jsonb,'awaiting subject without care/outbox');
     f:=pg_temp.tv2_turn(f)||jsonb_build_object('task',r->'id','revision',r->'revision');
     if scenario='revision_negative'then perform pg_temp.tv2_reject(f,'{"intent":"resume","revision":999}','40001','ASK_TASK_REVISION_CONFLICT','revision negative');
     elsif scenario='pending_source_negative'then
      other:=f||jsonb_build_object('source',f->'message','sourceText','Continue the saved note.','note','Continue the saved note.','intent','resume');
      perform pg_temp.tv2_reject(other,'{}','22023','ASK_TASK_NOT_PENDING','pending source integrity');
     elsif scenario='v2_cancel_note_negative'then perform pg_temp.tv2_reject(f,'{"intent":"cancel"}','42501','ASK_TASK_SOURCE_MISMATCH','v2 cancel requires null note');
     elsif scenario='ordinary_supersession'then
      other:=f||jsonb_build_object('source',f->'message','sourceText','Continue the saved note.','note','Continue the saved note.');
      replayed:=pg_temp.tv2_call(other);perform pg_temp.tv2_check((select status='superseded' and revision=2 from private.ask_tasks where id=(r->>'id')::uuid),'ordinary pending supersession preserved');
      perform pg_temp.tv2_check(replayed->>'status'='completed','new ordinary source saves');
     elsif scenario='ordinary_resume'then
      r:=pg_temp.tv2_call(f,'{"intent":"resume"}');perform pg_temp.tv2_check(r->>'status'='awaiting_answer' and (r->>'revision')::int=2,'resume preserves requires answer and increments revision');
      perform pg_temp.tv2_check((select authorization_message_id=(f->>'source')::uuid and requires_answer from private.ask_tasks where id=(r->>'id')::uuid),'original authorization preserved');
     else
      before:=pg_temp.tv2_state();r:=pg_temp.tv2_call(f,jsonb_build_object('intent','cancel','note',note_cancel));
      perform pg_temp.tv2_check(r->>'status'='cancelled' and (r->>'revision')::int=2 and (pg_temp.tv2_state()-'private.ask_tasks')=(before-'private.ask_tasks'),'ordinary cancel task only');
      before:=pg_temp.tv2_state();replayed:=pg_temp.tv2_call(f,jsonb_build_object('intent','cancel','note',note_cancel));
      perform pg_temp.tv2_check(replayed=r and pg_temp.tv2_state()=before,'cancelled replay does not revive');
     end if;
    elsif scenario='owner_negative'then perform pg_temp.tv2_reject(f,jsonb_build_object('user',pg_temp.tv2_id(2)),'42501','ASK_TASK_NOT_OWNED','foreign owner');
    elsif scenario in('role_anon','role_authenticated')then perform pg_temp.tv2_reject(f,'{}','42501',null,'actual role execute denial',replace(scenario,'role_',''));
    elsif scenario='stale_turn'then other:=pg_temp.tv2_turn(f);perform pg_temp.tv2_reject(f,'{}','40001','ASK_TASK_STALE_TURN','stale current');
    elsif scenario='source_text_negative'then perform pg_temp.tv2_reject(f,'{"sourceText":"Changed"}','42501','ASK_TASK_SOURCE_MISMATCH','source text mismatch');
    elsif scenario='foreign_pet'then perform pg_temp.tv2_reject(f,jsonb_build_object('pet',pg_temp.tv2_id(12)),'42501','ASK_TASK_PET_NOT_OWNED','foreign pet');
    elsif scenario='source_identity_negative'then other:=pg_temp.tv2_new_case(owner_number=>2);perform pg_temp.tv2_reject(f,jsonb_build_object('source',other->'source'),'42501','ASK_TASK_SOURCE_MISMATCH','foreign source');
    elsif scenario='v2_span_negative'then perform pg_temp.tv2_reject(f,'{"note":"Invented substring"}','42501','ASK_TASK_SOURCE_MISMATCH','v2 literal span negative');
    elsif scenario='replay_entry_integrity'then
     r:=pg_temp.tv2_call(f);update public.pet_care_entries set deleted_at=clock_timestamp(),deleted_by=(f->>'user')::uuid,deletion_reason='user_removed' where id=(r->>'entryId')::uuid;
     perform pg_temp.tv2_reject(f,'{}','22023','ASK_TASK_SOURCE_CHANGED','replay still validates existing entry');
    else raise exception 'UNHANDLED_NATIVE_SCENARIO';end if;
    raise notice 'PASS task writer version=% scenario=%',version,scenario;
    raise exception using errcode='Z0001',message='rollback task variant';
   exception when sqlstate 'Z0001' then null;end;
  end loop;
 end loop;
end $$;
