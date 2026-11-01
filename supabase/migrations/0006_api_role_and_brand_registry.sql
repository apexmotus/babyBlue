-- 0006 · API zero-authority login role (bb_api) and white-label brand registry (D-28, D-30, D-31).
-- Phase 0 of the .NET 10 API layer implementation plan (plans/api/PHASE_0_PREREQUISITES_AND_FOUNDATION.sql).

-- ───────────────────────── 1. API login role (bb_api) ─────────────────────────
-- Connection limit sizing (Finding F-15, D-30):
--   connection limit >= (instances × MaxPoolSize) + reserve
--   At 2 API instances × MaxPoolSize 40 + 5 reserve = 85.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bb_api') then
    create role bb_api with login
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls
      connection limit 85;
  else
    alter role bb_api with login
      nosuperuser nocreatedb nocreaterole noinherit nobypassrls
      connection limit 85;
  end if;
end $$;

grant anon, authenticated to bb_api;

alter role bb_api set statement_timeout = '15s';
alter role bb_api set idle_in_transaction_session_timeout = '30s';
alter role bb_api set search_path = '';

-- Ensure bb_api holds zero direct privileges on schema objects; it must SET LOCAL ROLE inside a transaction.
revoke all on all tables    in schema public from bb_api;
revoke all on all sequences in schema public from bb_api;
revoke all on all functions in schema public from bb_api;

-- ───────────────────────── 2. Schema usage grants ─────────────────────────
grant usage on schema public to anon, authenticated;

-- ───────────────────────── 3. Brand registry & resolve_brand ─────────────────────────
create table if not exists public.tenant_brands (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- Accepts 'public' during Phases 0–5 (F-01 / D-31) and 'bb_*' per-brand schemas (MULTITENANCY_PLAN §4).
  schema_name      text not null unique check (schema_name ~ '^(public|bb_[a-z][a-z0-9_]{1,28})$'),
  display_name     text not null,
  status           text not null default 'provisioning'
                     check (status in ('provisioning', 'active', 'suspended', 'archived')),
  tier             text not null default 'standard'
                     check (tier in ('standard', 'enterprise')),
  country_code     text not null default 'ZA' check (country_code ~ '^[A-Z]{2}$'),
  default_timezone text not null default 'Africa/Johannesburg',
  support_email    text not null,
  from_email       text not null,
  logo_url         text,
  wordmark_url     text,
  favicon_url      text,
  theme            jsonb not null default '{}',
  copy_overrides   jsonb not null default '{}',
  features         jsonb not null default '{}',
  contract_ref     text,
  data_region      text not null default 'eu-central-1',
  created_at       timestamptz not null default now()
);

create table if not exists public.tenant_brand_domains (
  domain      text primary key check (domain in ('localhost', '127.0.0.1') or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  brand_id    uuid not null references public.tenant_brands(id) on delete cascade,
  is_primary  boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists tenant_brand_primary_domain
  on public.tenant_brand_domains (brand_id) where is_primary;

alter table public.tenant_brands        enable row level security;
alter table public.tenant_brands        force row level security;
alter table public.tenant_brand_domains enable row level security;
alter table public.tenant_brand_domains force row level security;

revoke all on public.tenant_brands, public.tenant_brand_domains from anon, authenticated, public, bb_api;

-- Routing lookup: the hot path for every request (MULTITENANCY_PLAN §4, API_LAYER_SPEC §14).
-- Returns presentational and routing columns only; contract_ref, tier and data_region never leave the DB.
create or replace function public.resolve_brand(p_host text)
returns table (
  brand_id       uuid,
  slug           text,
  schema_name    text,
  status         text,
  display_name   text,
  theme          jsonb,
  copy_overrides jsonb,
  features       jsonb,
  logo_url       text,
  favicon_url    text,
  support_email  text
)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.schema_name, b.status, b.display_name, b.theme,
         b.copy_overrides, b.features, b.logo_url, b.favicon_url, b.support_email
    from public.tenant_brand_domains d
    join public.tenant_brands b on b.id = d.brand_id
   where d.domain = lower(trim(p_host))
     and d.verified_at is not null
     and b.status in ('active', 'provisioning', 'suspended', 'archived');
$$;

revoke all on function public.resolve_brand(text) from public, bb_api;
grant execute on function public.resolve_brand(text) to anon, authenticated;

-- Seed the default BabyBlue brand targeting `public` (F-01 / D-31) with explicit module feature flags.
insert into public.tenant_brands (
  id, slug, schema_name, display_name, status, tier, country_code, default_timezone,
  support_email, from_email, features
)
values (
  '00000000-0000-4000-8000-000000000900',
  'babyblue',
  'public',
  'BabyBlue',
  'active',
  'standard',
  'ZA',
  'Africa/Johannesburg',
  'support@babyblue.co.za',
  'noreply@babyblue.co.za',
  '{"booking": true, "os": true, "flow": true, "growth": true, "directory": true, "public_listings": true, "clinical": false, "claims": false, "layout": "standard"}'::jsonb
)
on conflict (slug) do update
  set schema_name   = excluded.schema_name,
      display_name  = excluded.display_name,
      status        = excluded.status,
      support_email = excluded.support_email,
      from_email    = excluded.from_email,
      features      = excluded.features;

insert into public.tenant_brand_domains (domain, brand_id, is_primary, verified_at)
values
  ('babyblue.co.za', '00000000-0000-4000-8000-000000000900', true,  now()),
  ('localhost',      '00000000-0000-4000-8000-000000000900', false, now()),
  ('127.0.0.1',      '00000000-0000-4000-8000-000000000900', false, now())
on conflict (domain) do update
  set brand_id    = excluded.brand_id,
      is_primary  = excluded.is_primary,
      verified_at = excluded.verified_at;

-- Public city list procedure used by the Phase 0 `noinherit` enforcement gate and Phase 1 vertical slice.
create or replace function public.public_city_list()
returns table (city_id uuid, name text, slug text, province text, practitioner_count int)
language sql stable security definer set search_path = public as $$
  select md5(lower(trim(l.city)))::uuid as city_id,
         l.city as name,
         regexp_replace(lower(trim(l.city)), '[^a-z0-9]+', '-', 'g') as slug,
         coalesce(pr.province, '') as province,
         count(distinct p.id)::int as practitioner_count
    from public.locations l
    join public.practices pr on pr.id = l.practice_id and pr.status = 'active'
    join public.practitioners p on p.practice_id = pr.id and p.listing_status = 'listed'
   where l.city is not null and trim(l.city) <> ''
   group by l.city, pr.province
   having count(distinct p.id) > 0
   order by l.city;
$$;

revoke all on function public.public_city_list() from public, bb_api;
grant execute on function public.public_city_list() to anon, authenticated;
