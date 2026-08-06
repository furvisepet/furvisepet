create or replace function public.resolve_organic_product_destinations(
  p_product_ids uuid[],
  p_country_code text,
  p_species_code text
)
returns table(product_id uuid, validated_destination_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_product_ids), 0) < 1
    or cardinality(p_product_ids) > 60
    or p_country_code not in ('CA', 'US')
    or p_species_code not in ('dog', 'cat') then
    return;
  end if;

  return query
  select distinct on (source.product_id)
    source.product_id,
    source.source_url as validated_destination_url
  from public.product_sources source
  join public.products product on product.id = source.product_id
  cross join lateral (
    select lower(substring(
      source.source_url
      from '(?i)^https?://([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?(?:[/?#]|$)'
    )) as hostname
  ) destination
  where source.product_id = any(p_product_ids)
    and product.is_active
    and product.status = 'active'
    and destination.hostname is not null
    and source.raw_payload -> '_furvisePermissionSnapshot' ->> 'ingestionMode' = 'organic_curated'
    and source.raw_payload -> '_furvisePermissionSnapshot' ->> 'sourceUseStatus' = 'permitted'
    and source.raw_payload -> '_furvisePermissionSnapshot' -> 'provenanceComplete' = 'true'::jsonb
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(source.raw_payload -> '_furvisePermissionSnapshot' -> 'permittedFields') = 'array'
            then source.raw_payload -> '_furvisePermissionSnapshot' -> 'permittedFields'
          else '[]'::jsonb
        end
      ) permitted(field_name)
      where permitted.field_name = 'destination_links'
    )
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(source.raw_payload -> '_furvisePermissionSnapshot' -> 'allowedHosts') = 'array'
            then source.raw_payload -> '_furvisePermissionSnapshot' -> 'allowedHosts'
          else '[]'::jsonb
        end
      ) allowed(hostname)
      where lower(allowed.hostname) = destination.hostname
    )
    and exists (
      select 1
      from public.product_markets market
      where market.product_id = product.id
        and market.country_code = p_country_code
        and market.status = 'available'
    )
    and exists (
      select 1
      from public.product_species product_species
      join public.species species on species.id = product_species.species_id
      where product_species.product_id = product.id
        and product_species.suitability_type in ('intended', 'compatible')
        and species.code = p_species_code
        and species.is_active
    )
  order by source.product_id, source.updated_at desc, source.id;
end;
$$;

revoke all on function public.resolve_organic_product_destinations(uuid[], text, text) from public, anon, service_role;
grant execute on function public.resolve_organic_product_destinations(uuid[], text, text) to authenticated;

comment on function public.resolve_organic_product_destinations(uuid[], text, text) is
  'Returns only permission-approved organic destination URLs for authenticated, active regional catalogue results.';
