-- Contract phase: deploy only after every production caller uses the trusted
-- service boundary introduced by 20260823232620.

revoke all privileges
  on table public.pet_concerns, public.ai_update_suggestions
  from public, anon, authenticated;

grant select on table public.pet_concerns, public.ai_update_suggestions
  to authenticated;

drop policy if exists pet_concerns_insert_own on public.pet_concerns;
drop policy if exists pet_concerns_update_own on public.pet_concerns;
drop policy if exists pet_concerns_delete_own on public.pet_concerns;
drop policy if exists ai_update_suggestions_insert_own on public.ai_update_suggestions;
drop policy if exists ai_update_suggestions_update_own on public.ai_update_suggestions;
drop policy if exists ai_update_suggestions_delete_own on public.ai_update_suggestions;

-- Function privileges survive ALTER FUNCTION ... RENAME. Revoke every active
-- care persistence implementation, including retained renamed delegates.
revoke all on function public.persist_furvise_semantic_event(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_semantic_event_exact_20260807(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_care_event(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_care_event_before_destination_routing(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.persist_furvise_care_event_with_concern(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_furvise_state_suggestion(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_concern_suggestion(uuid)
  from public, anon, authenticated, service_role;
