-- Supabase Auth & Role Bootstrap for PostgreSQL Integration Tests
-- Mirrors tests/db/harness.ts SUPABASE_STUBS (PHASE_0_PREREQUISITES_AND_FOUNDATION.md §3.6).

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;   -- bypassrls is what makes the §3.4 check meaningful
  else
    alter role service_role bypassrls;
  end if;
end $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
