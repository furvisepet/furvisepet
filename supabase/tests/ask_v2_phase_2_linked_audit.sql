begin;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare tenant record;
begin
  for tenant in
    select distinct user_id from (
      select user_id from public.pet_care_entries
      union
      select user_id from public.furvise_memories
    ) source_users
  loop
    perform public.import_legacy_semantic_claims_v2(tenant.user_id, 'pet_care_entries', null, 'ask_v2.phase2.audit.v1', 500);
    perform public.import_legacy_semantic_claims_v2(tenant.user_id, 'furvise_memories', null, 'ask_v2.phase2.audit.v1', 500);
  end loop;
end;
$$;

with tenant_audits as (
  select public.get_semantic_rebuild_audit_input_v2(user_id) audit
  from (
    select distinct user_id from (
      select user_id from public.pet_care_entries
      union
      select user_id from public.furvise_memories
    ) source_users
  ) tenants
)
select jsonb_build_object(
  'claims', coalesce((select jsonb_agg(claim.value) from tenant_audits cross join lateral jsonb_array_elements(audit->'claims') claim), '[]'::jsonb),
  'relations', coalesce((select jsonb_agg(relation.value) from tenant_audits cross join lateral jsonb_array_elements(audit->'relations') relation), '[]'::jsonb),
  'imported', jsonb_build_object(
    'canonical', sum((audit#>>'{imported,canonical}')::integer),
    'provisional', sum((audit#>>'{imported,provisional}')::integer),
    'ambiguous', sum((audit#>>'{imported,ambiguous}')::integer),
    'unresolved', sum((audit#>>'{imported,unresolved}')::integer)
  ),
  'legacy', jsonb_build_object(
    'historyRows', sum((audit#>>'{legacy,historyRows}')::integer),
    'activeEpisodes', sum((audit#>>'{legacy,activeEpisodes}')::integer),
    'resolvedEpisodes', sum((audit#>>'{legacy,resolvedEpisodes}')::integer),
    'concerns', sum((audit#>>'{legacy,concerns}')::integer),
    'currentStateRows', sum((audit#>>'{legacy,currentStateRows}')::integer),
    'activeMemories', sum((audit#>>'{legacy,activeMemories}')::integer)
  ),
  'orphanLegacySourceRows', sum((audit->>'orphanLegacySourceRows')::integer),
  'duplicateLineage', sum((audit->>'duplicateLineage')::integer),
  'invalidCrossUserLineage', sum((audit->>'invalidCrossUserLineage')::integer)
) audit_input
from tenant_audits;

rollback;
