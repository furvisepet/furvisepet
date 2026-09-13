create extension if not exists pg_trgm;

create or replace function public.catalog_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.species (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (name = btrim(name) and name <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists species_normalized_name_key on public.species(lower(btrim(name)));

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and name <> ''),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  website_url text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_brands_normalized_name_key
  on public.product_brands(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories(id) on delete restrict,
  name text not null check (name = btrim(name) and name <> ''),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index if not exists product_categories_parent_sort_idx
  on public.product_categories(parent_id, sort_order, name);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.product_brands(id) on delete restrict,
  category_id uuid not null references public.product_categories(id) on delete restrict,
  name text not null check (name = btrim(name) and name <> ''),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  short_description text,
  description text,
  product_type text not null check (btrim(product_type) <> ''),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'discontinued', 'rejected')),
  manufacturer_product_code text,
  global_trade_item_number text,
  default_image_url text,
  is_active boolean not null default true,
  life_stage text not null default 'all' check (life_stage in ('puppy', 'kitten', 'adult', 'senior', 'all')),
  primary_protein text,
  search_tags text[] not null default '{}',
  concern_tags text[] not null default '{}',
  ingredient_list_complete boolean not null default false,
  advisor_summary text,
  category_rationale text,
  cautions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_brand_id_idx on public.products(brand_id);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_status_active_idx on public.products(status, is_active);
create index if not exists products_name_search_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_description_search_idx
  on public.products using gin ((coalesce(short_description, '') || ' ' || coalesce(description, '') || ' ' || product_type) gin_trgm_ops);
create index if not exists product_brands_name_search_idx on public.product_brands using gin (name gin_trgm_ops);
create index if not exists product_categories_name_search_idx on public.product_categories using gin (name gin_trgm_ops);

create table if not exists public.product_species (
  product_id uuid not null references public.products(id) on delete cascade,
  species_id uuid not null references public.species(id) on delete restrict,
  suitability_type text not null default 'intended' check (suitability_type in ('intended', 'compatible', 'restricted')),
  created_at timestamptz not null default now(),
  primary key (product_id, species_id)
);

create index if not exists product_species_species_product_idx
  on public.product_species(species_id, product_id);

create table if not exists public.product_markets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'unknown' check (status in ('available', 'unavailable', 'unknown', 'discontinued')),
  regulatory_notes text,
  first_seen_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, country_code)
);

create index if not exists product_markets_country_status_product_idx
  on public.product_markets(country_code, status, product_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  sku text,
  gtin text,
  size_value numeric(12, 3) check (size_value is null or size_value > 0),
  size_unit text,
  flavor text,
  package_quantity integer check (package_quantity is null or package_quantity > 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, product_id),
  unique(product_id, name)
);

create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create unique index if not exists product_variants_product_sku_key
  on public.product_variants(product_id, sku) where sku is not null;
create unique index if not exists product_variants_gtin_key
  on public.product_variants(gtin) where gtin is not null;
create unique index if not exists product_variants_one_default_key
  on public.product_variants(product_id) where is_default and is_active;

create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and name <> ''),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  website_url text not null check (btrim(website_url) <> ''),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  affiliate_program text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retailers_normalized_name_key
  on public.retailers(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table if not exists public.product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  provider text not null check (btrim(provider) <> ''),
  source_type text not null check (source_type in ('manual', 'manufacturer_page', 'retailer_feed', 'retailer_page', 'api', 'csv')),
  external_id text,
  source_url text,
  fetched_at timestamptz,
  content_hash text,
  raw_payload jsonb,
  trust_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, source_type, external_id)
);

create index if not exists product_sources_provider_external_idx
  on public.product_sources(provider, external_id);
create index if not exists product_sources_product_id_idx on public.product_sources(product_id);

alter table public.product_species
  add column if not exists source_id uuid references public.product_sources(id) on delete set null;
alter table public.product_markets
  add column if not exists source_id uuid references public.product_sources(id) on delete set null;
alter table public.product_variants
  add column if not exists source_id uuid references public.product_sources(id) on delete set null;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  image_url text not null check (btrim(image_url) <> ''),
  alt_text text,
  position integer not null default 0 check (position >= 0),
  source_id uuid references public.product_sources(id) on delete set null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade
);

create index if not exists product_images_product_position_idx
  on public.product_images(product_id, position);
create unique index if not exists product_images_one_product_primary_key
  on public.product_images(product_id) where variant_id is null and is_primary;
create unique index if not exists product_images_one_variant_primary_key
  on public.product_images(variant_id) where variant_id is not null and is_primary;

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (canonical_name = btrim(canonical_name) and canonical_name <> ''),
  slug text not null unique check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create unique index if not exists ingredients_normalized_name_key
  on public.ingredients(lower(regexp_replace(btrim(canonical_name), '\s+', ' ', 'g')));

create table if not exists public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  label_name text not null check (btrim(label_name) <> ''),
  position integer check (position is null or position >= 0),
  is_active_ingredient boolean,
  source_id uuid references public.product_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade
);

create index if not exists product_ingredients_product_position_idx
  on public.product_ingredients(product_id, position);
create unique index if not exists product_ingredients_label_position_key
  on public.product_ingredients(
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(label_name)),
    coalesce(position, -1)
  );

create table if not exists public.product_warnings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  warning_type text not null check (btrim(warning_type) <> ''),
  text text not null check (btrim(text) <> ''),
  source_id uuid references public.product_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade
);

create index if not exists product_warnings_product_id_idx on public.product_warnings(product_id);

create table if not exists public.product_directions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  direction_type text not null check (btrim(direction_type) <> ''),
  text text not null check (btrim(text) <> ''),
  source_id uuid references public.product_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade
);

create index if not exists product_directions_product_id_idx on public.product_directions(product_id);

create table if not exists public.product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  retailer_id uuid not null references public.retailers(id) on delete restrict,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  external_product_id text,
  destination_url text not null check (btrim(destination_url) <> ''),
  affiliate_url text,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  original_price_amount numeric(12, 2) check (original_price_amount is null or original_price_amount >= 0),
  availability_status text not null default 'unknown' check (availability_status in ('in_stock', 'out_of_stock', 'preorder', 'unknown')),
  last_checked_at timestamptz,
  source_id uuid references public.product_sources(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, variant_id, retailer_id, country_code),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade,
  check (original_price_amount is null or price_amount is null or original_price_amount >= price_amount)
);

create index if not exists product_offers_product_id_idx on public.product_offers(product_id);
create index if not exists product_offers_retailer_id_idx on public.product_offers(retailer_id);
create index if not exists product_offers_country_availability_idx
  on public.product_offers(country_code, availability_status, product_id);
create unique index if not exists product_offers_destination_key
  on public.product_offers(
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    retailer_id,
    country_code,
    destination_url
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'product_brands', 'product_categories', 'products', 'product_markets',
    'product_variants', 'retailers', 'product_sources', 'product_offers'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.catalog_touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into public.species(code, name)
values ('dog', 'Dog'), ('cat', 'Cat')
on conflict (code) do update set name = excluded.name, is_active = true;

insert into public.product_categories(name, slug, sort_order)
values
  ('Food', 'food', 10),
  ('Grooming', 'grooming', 20),
  ('Dental', 'dental', 30),
  ('Supplements', 'supplements', 40),
  ('Skin and Coat', 'skin-and-coat', 50),
  ('Paw Care', 'paw-care', 60),
  ('Ear Care', 'ear-care', 70),
  ('Eye Care', 'eye-care', 80),
  ('Flea and Tick', 'flea-and-tick', 90),
  ('Litter', 'litter', 100),
  ('Travel', 'travel', 110),
  ('Cleaning', 'cleaning', 120),
  ('Health Essentials', 'health-essentials', 130)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true;

insert into public.product_categories(parent_id, name, slug, sort_order)
select parent.id, child.name, child.slug, child.sort_order
from public.product_categories parent
cross join (values
  ('Dry Food', 'dry-food', 10),
  ('Wet Food', 'wet-food', 20),
  ('Veterinary Diet', 'veterinary-diet', 30)
) as child(name, slug, sort_order)
where parent.slug = 'food'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, is_active = true;

insert into public.product_categories(parent_id, name, slug, sort_order)
select parent.id, child.name, child.slug, child.sort_order
from public.product_categories parent
cross join (values
  ('Shampoo', 'shampoo', 10),
  ('Conditioner', 'conditioner', 20),
  ('Brushes', 'brushes', 30),
  ('Grooming Wipes', 'grooming-wipes', 40),
  ('Nail Care', 'nail-care', 50)
) as child(name, slug, sort_order)
where parent.slug = 'grooming'
on conflict (slug) do update set parent_id = excluded.parent_id, name = excluded.name, sort_order = excluded.sort_order, is_active = true;

create or replace function public.search_catalog_product_ids(
  p_species_code text,
  p_country_code text,
  p_category_slug text default null,
  p_text_query text default null,
  p_limit integer default 24,
  p_after_slug text default null
)
returns table(product_id uuid, product_slug text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct p.id, p.slug
  from public.products p
  join public.product_brands b on b.id = p.brand_id and b.is_active
  join public.product_categories c on c.id = p.category_id and c.is_active
  join public.product_species ps on ps.product_id = p.id
  join public.species s on s.id = ps.species_id and s.is_active
  join public.product_markets pm on pm.product_id = p.id
  where p.status = 'active'
    and p.is_active
    and s.code = lower(btrim(p_species_code))
    and ps.suitability_type in ('intended', 'compatible')
    and pm.country_code = upper(btrim(p_country_code))
    and pm.status = 'available'
    and (p_category_slug is null or c.slug = lower(btrim(p_category_slug)))
    and (p_after_slug is null or p.slug > p_after_slug)
    and (
      nullif(btrim(p_text_query), '') is null
      or exists (
        select 1
        from regexp_split_to_table(lower(btrim(p_text_query)), '[^a-z0-9]+') term
        where length(term) >= 2
          and lower(concat_ws(
            ' ', p.name, p.short_description, p.description, p.product_type,
            b.name, c.name, array_to_string(p.search_tags, ' '), array_to_string(p.concern_tags, ' ')
          )) like '%' || term || '%'
      )
    )
  order by p.slug
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

revoke all on function public.search_catalog_product_ids(text, text, text, text, integer, text) from public;
grant execute on function public.search_catalog_product_ids(text, text, text, text, integer, text) to authenticated;

alter table public.species enable row level security;
alter table public.product_brands enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_species enable row level security;
alter table public.product_markets enable row level security;
alter table public.product_variants enable row level security;
alter table public.retailers enable row level security;
alter table public.product_sources enable row level security;
alter table public.product_images enable row level security;
alter table public.ingredients enable row level security;
alter table public.product_ingredients enable row level security;
alter table public.product_warnings enable row level security;
alter table public.product_directions enable row level security;
alter table public.product_offers enable row level security;

create policy "Authenticated users can read active species" on public.species
  for select to authenticated using (is_active);
create policy "Authenticated users can read active product brands" on public.product_brands
  for select to authenticated using (is_active);
create policy "Authenticated users can read active product categories" on public.product_categories
  for select to authenticated using (is_active);
create policy "Authenticated users can read active products" on public.products
  for select to authenticated using (is_active and status = 'active');
create policy "Authenticated users can read active product species" on public.product_species
  for select to authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read available product markets" on public.product_markets
  for select to authenticated using (
    status = 'available'
    and exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read active product variants" on public.product_variants
  for select to authenticated using (
    is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read active retailers" on public.retailers
  for select to authenticated using (is_active);
create policy "Authenticated users can read active product images" on public.product_images
  for select to authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read ingredients" on public.ingredients
  for select to authenticated using (true);
create policy "Authenticated users can read active product ingredients" on public.product_ingredients
  for select to authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read active product warnings" on public.product_warnings
  for select to authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read active product directions" on public.product_directions
  for select to authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active and p.status = 'active')
  );
create policy "Authenticated users can read active product offers" on public.product_offers
  for select to authenticated using (
    is_active
    and exists (select 1 from public.products p where p.id = product_offers.product_id and p.is_active and p.status = 'active')
    and exists (select 1 from public.retailers r where r.id = product_offers.retailer_id and r.is_active)
    and exists (
      select 1 from public.product_markets pm
      where pm.product_id = product_offers.product_id
        and pm.country_code = product_offers.country_code
        and pm.status = 'available'
    )
  );

-- product_sources intentionally has no client-readable or client-writable policy.
-- No catalog table grants insert, update, or delete access to authenticated users.
