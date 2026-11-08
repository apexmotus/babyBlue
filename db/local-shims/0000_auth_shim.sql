-- Browser-only stand-in for Supabase Auth, used when BabyBlue runs on its local PostgreSQL (PGlite) database.
-- The real migrations expect an `auth` schema, `auth.uid()` and the anon/authenticated roles.
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table auth.credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  salt text not null,
  hash text not null
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
