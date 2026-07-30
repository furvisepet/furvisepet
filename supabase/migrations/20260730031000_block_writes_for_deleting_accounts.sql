begin;

create or replace function public.block_deleting_account_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.account_deletion_requests request_row
    where request_row.user_id = new.user_id
      and request_row.status in ('application_deleted', 'auth_delete_failed', 'completed')
  ) then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_PENDING';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'user_profiles', 'dog_profiles', 'pet_care_entries', 'dog_memories', 'dog_product_feedback',
    'ask_furvise_usage', 'shop_search_usage', 'product_question_usage', 'product_ai_usage',
    'vet_visit_briefs', 'ask_conversations', 'ask_conversation_messages', 'ai_usage_events',
    'pet_concerns', 'ai_update_suggestions', 'furvise_memories', 'pet_care_episodes',
    'pet_current_state', 'idempotency_operations'
  ] loop
    execute format('drop trigger if exists block_deleting_account_writes on public.%I', table_name);
    execute format('create trigger block_deleting_account_writes before insert or update on public.%I for each row execute function public.block_deleting_account_writes()', table_name);
  end loop;
end;
$$;

revoke all on function public.block_deleting_account_writes() from public, anon, authenticated;

commit;
