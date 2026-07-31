alter table public.product_offers
  add column if not exists fetched_at timestamptz,
  add column if not exists source_export_date timestamptz,
  add column if not exists source_feed_version text,
  add column if not exists source_content_hash text,
  add column if not exists stale_after timestamptz,
  add column if not exists freshness_status text not null default 'unknown' check (
    freshness_status in ('fresh', 'stale', 'unknown')
  );

create index if not exists product_offers_freshness_idx
  on public.product_offers(country_code, freshness_status, stale_after)
  where is_active = true;

-- Freshness metadata is intentionally not selected by public catalog queries.
-- Public prices are cleared when an authorized source is stale.
