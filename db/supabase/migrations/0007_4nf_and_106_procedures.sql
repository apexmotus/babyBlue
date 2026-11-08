-- 0007 · 4NF Schema Extensions, Views, Triggers, Indexes & 106 Stored Procedures
-- Spec references: DATABASE_SCHEMA_4NF.md, STORED_PROCEDURES.md, IMPROVEMENT_PLAN.md, API_LAYER_SPEC.md

-- ───────────────────────── 1. Reference tables & types ─────────────────────────
create type public.timerange as range (subtype = time);

create type public.consent_purpose as enum (
  'record_storage',
  'appointment_reminders',
  'marketing'
);

do $$
begin
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.practice_role'::regtype) then
    create cast (text as public.practice_role) with inout as implicit;
  end if;
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.platform_role'::regtype) then
    create cast (text as public.platform_role) with inout as implicit;
  end if;
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.appointment_status'::regtype) then
    create cast (text as public.appointment_status) with inout as implicit;
  end if;
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.queue_status'::regtype) then
    create cast (text as public.queue_status) with inout as implicit;
  end if;
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.marketing_status'::regtype) then
    create cast (text as public.marketing_status) with inout as implicit;
  end if;
  if not exists (select 1 from pg_cast where castsource = 'text'::regtype and casttarget = 'public.consent_purpose'::regtype) then
    create cast (text as public.consent_purpose) with inout as implicit;
  end if;
end $$;

create table if not exists public.countries (
  code             text primary key check (code ~ '^[A-Z]{2}$'),
  name             text not null unique,
  currency         text not null check (currency ~ '^[A-Z]{3}$'),
  default_timezone text not null
);

create table if not exists public.provinces (
  code         text primary key,
  country_code text not null references public.countries(code),
  name         text not null,
  unique (country_code, name)
);

create table if not exists public.cities (
  id            uuid primary key default gen_random_uuid(),
  province_code text not null references public.provinces(code),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  unique (province_code, name)
);

create table if not exists public.languages (
  code text primary key check (code ~ '^[a-z]{2,3}$'),
  name text not null unique
);

create table if not exists public.specialities (
  slug   text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name   text not null unique,
  active boolean not null default true
);

create table if not exists public.council_bodies (
  code         text primary key check (code ~ '^[A-Z]{2,10}$'),
  country_code text not null references public.countries(code),
  name         text not null
);

create table if not exists public.metric_definitions (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  unit       text not null check (unit in ('count', 'currency_cents', 'ratio', 'seconds')),
  precision  smallint not null default 0 check (precision between 0 and 6),
  active     boolean not null default true
);

insert into public.countries (code, name, currency, default_timezone) values
  ('ZA', 'South Africa', 'ZAR', 'Africa/Johannesburg'),
  ('NG', 'Nigeria', 'NGN', 'Africa/Lagos')
on conflict (code) do nothing;

insert into public.provinces (code, country_code, name) values
  ('GP',  'ZA', 'Gauteng'),
  ('WC',  'ZA', 'Western Cape'),
  ('KZN', 'ZA', 'KwaZulu-Natal'),
  ('EC',  'ZA', 'Eastern Cape'),
  ('FS',  'ZA', 'Free State'),
  ('LP',  'ZA', 'Limpopo'),
  ('MP',  'ZA', 'Mpumalanga'),
  ('NC',  'ZA', 'Northern Cape'),
  ('NW',  'ZA', 'North West')
on conflict (code) do nothing;

insert into public.cities (id, province_code, slug, name) values
  ('10000000-0000-4000-8000-000000000001', 'GP',  'johannesburg', 'Johannesburg'),
  ('10000000-0000-4000-8000-000000000002', 'WC',  'cape-town',    'Cape Town'),
  ('10000000-0000-4000-8000-000000000003', 'KZN', 'durban',       'Durban'),
  ('10000000-0000-4000-8000-000000000004', 'GP',  'pretoria',     'Pretoria'),
  ('10000000-0000-4000-8000-000000000005', 'EC',  'gqeberha',     'Gqeberha'),
  ('10000000-0000-4000-8000-000000000006', 'FS',  'bloemfontein', 'Bloemfontein'),
  ('10000000-0000-4000-8000-000000000007', 'WC',  'stellenbosch', 'Stellenbosch'),
  ('10000000-0000-4000-8000-000000000008', 'GP',  'sandton',      'Sandton')
on conflict (slug) do nothing;

insert into public.languages (code, name) values
  ('en',  'English'),
  ('af',  'Afrikaans'),
  ('zu',  'isiZulu'),
  ('xh',  'isiXhosa'),
  ('st',  'Sesotho'),
  ('tn',  'Setswana'),
  ('nso', 'Sepedi'),
  ('ts',  'Xitsonga'),
  ('ss',  'siSwati'),
  ('ve',  'Tshivenda'),
  ('nr',  'isiNdebele'),
  ('gu',  'Gujarati'),
  ('ta',  'Tamil')
on conflict (code) do nothing;

insert into public.specialities (slug, name, active) values
  ('general-practice', 'General practice', true),
  ('dentistry',        'Dentistry',        true),
  ('physiotherapy',    'Physiotherapy',    true),
  ('psychology',       'Psychology',       true),
  ('counselling',      'Counselling',      true),
  ('dietetics',        'Dietetics',        true),
  ('optometry',        'Optometry',        true),
  ('chiropractic',     'Chiropractic',     true),
  ('dermatology',      'Dermatology',      true),
  ('gp',               'GP',               false)
on conflict (slug) do nothing;

insert into public.council_bodies (code, country_code, name) values
  ('HPCSA',  'ZA', 'Health Professions Council of South Africa'),
  ('SANC',   'ZA', 'South African Nursing Council'),
  ('SAPC',   'ZA', 'South African Pharmacy Council'),
  ('SADA',   'ZA', 'South African Dental Association'),
  ('AHPCSA', 'ZA', 'Allied Health Professions Council of South Africa')
on conflict (code) do nothing;

insert into public.metric_definitions (key, label, unit, precision, active) values
  ('impressions',            'Impressions',            'count',          0, true),
  ('clicks',                 'Clicks',                 'count',          0, true),
  ('enquiries',              'Enquiries',              'count',          0, true),
  ('bookings_attributed',    'Attributed bookings',    'count',          0, true),
  ('spend_cents',            'Ad spend',               'currency_cents', 0, true),
  ('cost_per_booking_cents', 'Cost per booking',       'currency_cents', 0, true),
  ('profile_views',          'Profile views (search)', 'count',          0, true),
  ('direction_requests',     'Direction requests',     'count',          0, true),
  ('directories_corrected',  'Directories corrected',  'count',          0, true)
on conflict (key) do nothing;

-- ───────────────────────── 2. 4NF columns & decomposition tables ─────────────────────────
alter table public.practices
  add column if not exists country_code text not null default 'ZA' references public.countries(code);

create table if not exists public.practice_status_events (
  id          bigint generated always as identity primary key,
  practice_id uuid not null references public.practices(id) on delete cascade,
  status      text not null check (status in ('pending', 'active', 'suspended')),
  actor_id    uuid references auth.users(id) on delete set null,
  at          timestamptz not null default now(),
  reason      text
);
create index if not exists practice_status_events_latest on public.practice_status_events (practice_id, at desc);

alter table public.locations
  add column if not exists city_id uuid references public.cities(id),
  add column if not exists is_primary boolean not null default false;

create unique index if not exists locations_one_primary on public.locations (practice_id) where is_primary;
create index if not exists locations_city on public.locations (city_id);

-- Sync trigger on locations so both city/province text and city_id/is_primary stay aligned
create or replace function public._locations_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.city_id is null and new.city is not null then
    select c.id, pv.name into new.city_id, new.province
      from public.cities c join public.provinces pv on pv.code = c.province_code
     where lower(c.name) = lower(trim(new.city)) or c.slug = lower(trim(new.city))
     limit 1;
  elsif new.city_id is not null and new.city is null then
    select c.name, pv.name into new.city, new.province
      from public.cities c join public.provinces pv on pv.code = c.province_code
     where c.id = new.city_id;
  end if;
  if tg_op = 'INSERT' and not new.is_primary then
    if not exists (select 1 from public.locations where practice_id = new.practice_id and is_primary) then
      new.is_primary := true;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists locations_sync_trg on public.locations;
create trigger locations_sync_trg
  before insert or update on public.locations
  for each row execute function public._locations_sync_trg();

alter table public.practitioners
  alter column speciality drop not null,
  add column if not exists speciality_slug text references public.specialities(slug),
  add column if not exists next_available_cached timestamptz,
  add column if not exists next_available_at timestamptz,
  add column if not exists search_vector tsvector generated always as (
    to_tsvector('simple',
      coalesce(display_name, '') || ' ' || coalesce(title, '') || ' ' ||
      coalesce(speciality_slug, '') || ' ' || coalesce(speciality, '') || ' ' || coalesce(bio, ''))
  ) stored;

create index if not exists practitioners_search on public.practitioners using gin (search_vector);
create index if not exists practitioners_next_available on public.practitioners (listing_status, next_available_cached nulls last)
  where listing_status = 'listed';

create table if not exists public.practitioner_languages (
  practitioner_id uuid not null,
  practice_id     uuid not null,
  language_code   text not null references public.languages(code),
  primary key (practitioner_id, language_code),
  foreign key (practitioner_id, practice_id)
    references public.practitioners(id, practice_id) on delete cascade
);

create or replace function public._practitioners_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.speciality_slug is null and new.speciality is not null then
    select slug, name into new.speciality_slug, new.speciality
      from public.specialities
     where lower(name) = lower(trim(new.speciality)) or slug = lower(trim(new.speciality))
     limit 1;
    if new.speciality_slug is null then
      insert into public.specialities (slug, name, active)
      values (lower(regexp_replace(trim(new.speciality), '[^a-zA-Z0-9]+', '-', 'g')), trim(new.speciality), false)
      on conflict (slug) do nothing;
      new.speciality_slug := lower(regexp_replace(trim(new.speciality), '[^a-zA-Z0-9]+', '-', 'g'));
    end if;
  elsif new.speciality_slug is not null and new.speciality is null then
    select name into new.speciality from public.specialities where slug = new.speciality_slug;
  end if;
  return new;
end $$;

drop trigger if exists practitioners_sync_trg on public.practitioners;
create trigger practitioners_sync_trg
  before insert or update on public.practitioners
  for each row execute function public._practitioners_sync_trg();

create or replace function public._practitioners_after_languages_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lang text; v_code text;
begin
  if coalesce(array_length(new.languages, 1), 0) > 0 then
    foreach v_lang in array new.languages loop
      select code into v_code from public.languages
       where code = lower(trim(v_lang)) or lower(name) = lower(trim(v_lang))
       limit 1;
      if v_code is not null then
        insert into public.practitioner_languages (practitioner_id, practice_id, language_code)
        values (new.id, new.practice_id, v_code)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists practitioners_after_languages_trg on public.practitioners;
create trigger practitioners_after_languages_trg
  after insert or update of languages on public.practitioners
  for each row execute function public._practitioners_after_languages_trg();

-- practitioner_registrations: support both (practitioner_id, body_code) 4NF key and legacy body column
alter table public.practitioner_registrations
  alter column body drop not null,
  add column if not exists practice_id uuid,
  add column if not exists body_code text references public.council_bodies(code);

update public.practitioner_registrations r
   set body_code = coalesce(r.body_code, r.body),
       practice_id = coalesce(r.practice_id, (select p.practice_id from public.practitioners p where p.id = r.practitioner_id))
 where r.body_code is null or r.practice_id is null;

alter table public.practitioner_registrations
  drop constraint if exists practitioner_registrations_pkey;

create or replace function public._practitioner_registrations_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.body_code := coalesce(new.body_code, trim(new.body));
  new.body := coalesce(new.body, new.body_code);
  if new.practice_id is null then
    select practice_id into new.practice_id from public.practitioners where id = new.practitioner_id;
  end if;
  return new;
end $$;

drop trigger if exists practitioner_registrations_sync_trg on public.practitioner_registrations;
create trigger practitioner_registrations_sync_trg
  before insert or update on public.practitioner_registrations
  for each row execute function public._practitioner_registrations_sync_trg();

alter table public.practitioner_registrations
  add primary key (practitioner_id, body_code);

create unique index if not exists practitioner_registrations_body_code_num_key
  on public.practitioner_registrations (body_code, registration_number);

-- practitioner_verifications event table + sync trigger
create table if not exists public.practitioner_verifications (
  id              bigint generated always as identity primary key,
  practice_id     uuid not null,
  practitioner_id uuid not null,
  status          text not null check (status in ('unverified', 'pending', 'verified', 'rejected')),
  decided_by      uuid references auth.users(id) on delete set null,
  decided_at      timestamptz not null default now(),
  note            text,
  foreign key (practitioner_id, practice_id)
    references public.practitioners(id, practice_id) on delete cascade
);
create index if not exists practitioner_verifications_latest
  on public.practitioner_verifications (practitioner_id, decided_at desc);

create or replace function public.practitioner_verification_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.practitioners
     set verification_status = new.status,
         verified_at = case when new.status = 'verified' then new.decided_at else null end,
         verified_by = case when new.status = 'verified' then new.decided_by else null end
   where id = new.practitioner_id and practice_id = new.practice_id;
  return new;
end $$;

drop trigger if exists practitioner_verifications_sync on public.practitioner_verifications;
create trigger practitioner_verifications_sync
  after insert on public.practitioner_verifications
  for each row execute function public.practitioner_verification_sync();

-- availability_rules: during_local timerange + availability_no_overlap exclusion constraint
alter table public.availability_rules
  add column if not exists during_local public.timerange
    generated always as (public.timerange(start_time, end_time, '[)')) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'availability_no_overlap'
  ) then
    alter table public.availability_rules
      add constraint availability_no_overlap exclude using gist
        (practitioner_id with =, weekday with =, during_local with &&);
  end if;
end $$;

-- client_consents append-only event series
create table if not exists public.client_consents (
  id          bigint generated always as identity primary key,
  practice_id uuid not null,
  client_id   uuid not null,
  purpose     public.consent_purpose not null,
  granted     boolean not null,
  at          timestamptz not null default now(),
  actor_id    uuid references auth.users(id) on delete set null,
  channel     text not null default 'os' check (channel in ('os', 'app', 'flow', 'import', 'paper')),
  evidence    jsonb not null default '{}',
  foreign key (client_id, practice_id)
    references public.clients(id, practice_id) on delete cascade
);
create index if not exists client_consents_latest on public.client_consents (client_id, purpose, at desc);

-- Sync trigger so clients created with consent_record_storage = true (or default in tests) have a record_storage consent row
create or replace function public._clients_after_consent_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.consent_record_storage then
    insert into public.client_consents (practice_id, client_id, purpose, granted, at, channel)
    values (new.practice_id, new.id, 'record_storage', true, coalesce(new.consent_at, now()), 'os');
  end if;
  return new;
end $$;

drop trigger if exists clients_after_consent_sync_trg on public.clients;
create trigger clients_after_consent_sync_trg
  after insert on public.clients
  for each row execute function public._clients_after_consent_sync_trg();

-- Immutable span helper & appointments / slot_holds triggers
create or replace function public.appointment_span(p_starts timestamptz, p_ends timestamptz, p_buffer_min int)
returns tstzrange language sql immutable parallel safe as $$
  select tstzrange(p_starts, p_ends + make_interval(mins => coalesce(p_buffer_min, 0)), '[)')
$$;

alter table public.appointments
  alter column during drop not null,
  add column if not exists price_cents int check (price_cents >= 0),
  add column if not exists currency text not null default 'ZAR';

create or replace function public._appointments_span_and_snapshot_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.during := public.appointment_span(new.starts_at, new.ends_at, new.buffer_min);
  if new.price_cents is null and new.service_id is not null then
    select s.price_cents into new.price_cents from public.services s where s.id = new.service_id;
  end if;
  if new.currency is null then
    new.currency := 'ZAR';
  end if;
  return new;
end $$;

drop trigger if exists appointments_span_and_snapshot_trg on public.appointments;
create trigger appointments_span_and_snapshot_trg
  before insert or update on public.appointments
  for each row execute function public._appointments_span_and_snapshot_trg();

alter table public.slot_holds
  alter column during drop not null;

create or replace function public._slot_holds_span_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_buf int := 0;
begin
  if new.service_id is not null then
    select coalesce(s.buffer_min, 0) into v_buf from public.services s where s.id = new.service_id;
  end if;
  new.during := public.appointment_span(new.starts_at, new.ends_at, v_buf);
  return new;
end $$;

drop trigger if exists slot_holds_span_trg on public.slot_holds;
create trigger slot_holds_span_trg
  before insert or update on public.slot_holds
  for each row execute function public._slot_holds_span_trg();

-- Database-level slot-hold quota trigger (IMPROVEMENT_PLAN.md §10)
create or replace function public.slot_holds_quota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.slot_holds
       where consumer_id = new.consumer_id and expires_at > now()) >= 3 then
    raise exception 'too_many_holds' using errcode = '54000';
  end if;
  if (select count(*) from public.audit_log
       where actor_id = new.consumer_id and action = 'hold.created'
         and at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_holds' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists slot_holds_quota on public.slot_holds;
create trigger slot_holds_quota
  before insert on public.slot_holds
  for each row execute function public.slot_holds_quota();

-- queue_entries: 4NF client_id / walkin_name / walkin_phone columns
alter table public.queue_entries
  alter column display_name drop not null,
  add column if not exists client_id uuid,
  add column if not exists walkin_name text,
  add column if not exists walkin_phone text;

create or replace function public._queue_entries_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.walkin_name is null and new.client_id is null and new.display_name is not null then
    new.walkin_name := new.display_name;
    new.walkin_phone := coalesce(new.walkin_phone, new.phone);
  elsif new.display_name is null and new.walkin_name is not null then
    new.display_name := new.walkin_name;
    new.phone := coalesce(new.phone, new.walkin_phone);
  elsif new.display_name is null and new.client_id is not null then
    select trim(c.first_name || ' ' || c.last_name), c.phone
      into new.display_name, new.phone
      from public.clients c where c.id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists queue_entries_sync_trg on public.queue_entries;
create trigger queue_entries_sync_trg
  before insert or update on public.queue_entries
  for each row execute function public._queue_entries_sync_trg();

-- lead_interests & campaign_report_metrics
create table if not exists public.lead_interests (
  lead_id  uuid not null references public.leads(id) on delete cascade,
  interest text not null,
  primary key (lead_id, interest)
);

create table if not exists public.campaign_report_metrics (
  report_id   uuid not null references public.campaign_reports(id) on delete cascade,
  metric_key  text not null references public.metric_definitions(key),
  value       numeric not null,
  primary key (report_id, metric_key)
);

-- ───────────────────────── 3. Views ─────────────────────────
create or replace view public.practice_place_v as
  select p.id          as practice_id,
         l.id          as location_id,
         l.address,
         c.id          as city_id,
         coalesce(c.name, l.city)       as city,
         coalesce(c.slug, lower(regexp_replace(coalesce(l.city, ''), '[^a-zA-Z0-9]+', '-', 'g'))) as city_slug,
         pv.code       as province_code,
         coalesce(pv.name, l.province, p.province) as province,
         p.country_code,
         coalesce(co.currency, 'ZAR')   as currency
    from public.practices p
    left join public.countries co on co.code = p.country_code
    left join lateral (
      select loc.*
        from public.locations loc
       where loc.practice_id = p.id
       order by loc.is_primary desc, loc.name
       limit 1
    ) l on true
    left join public.cities    c  on c.id = l.city_id
    left join public.provinces pv on pv.code = c.province_code;

create or replace view public.client_consent_current_v as
  select distinct on (client_id, purpose)
         client_id, practice_id, purpose, granted, at, actor_id
    from public.client_consents
   order by client_id, purpose, at desc;

create or replace view public.client_contact_v as
  select c.id as client_id, c.practice_id, c.user_id,
         trim(c.first_name || ' ' || c.last_name) as full_name,
         coalesce(c.phone, p.phone)               as phone,
         coalesce(c.email, u.email)               as email,
         c.phone is not null as phone_is_practice_held,
         c.email is not null as email_is_practice_held
    from public.clients c
    left join public.profiles p on p.id = c.user_id
    left join auth.users      u on u.id = c.user_id;

create or replace view public.queue_entry_display_v as
  select q.id, q.practice_id, q.status, q.urgency, q.source, q.seq,
         q.joined_at, q.called_at, q.completed_at, q.appointment_id,
         coalesce(trim(c.first_name || ' ' || c.last_name), q.walkin_name, q.display_name) as display_name,
         coalesce(c.phone, pr.phone, q.walkin_phone, q.phone)                              as phone
    from public.queue_entries q
    left join public.clients  c  on c.id = q.client_id and c.practice_id = q.practice_id
    left join public.profiles pr on pr.id = c.user_id;

-- ───────────────────────── 4. Indexes & RLS on new tables ─────────────────────────
create index if not exists appointments_practitioner_day on public.appointments (practitioner_id, starts_at)
  where status in ('booked', 'confirmed', 'checked_in', 'in_progress');
create index if not exists appointments_client on public.appointments (client_id, starts_at desc);
create index if not exists appointments_service on public.appointments (service_id);
create index if not exists appointments_practice_source on public.appointments (practice_id, source, created_at desc)
  where source = 'app';
create index if not exists slot_holds_expiry on public.slot_holds (expires_at);
create index if not exists slot_holds_consumer on public.slot_holds (consumer_id);
create index if not exists practitioners_listed on public.practitioners (speciality_slug, listing_status)
  where listing_status = 'listed';
create index if not exists practitioner_services_service on public.practitioner_services (service_id);
create index if not exists services_practice_active on public.services (practice_id) where active;
create index if not exists clients_practice_name on public.clients (practice_id, last_name, first_name);
create index if not exists queue_entries_appointment on public.queue_entries (appointment_id)
  where appointment_id is not null;
create index if not exists marketing_requests_operator on public.marketing_requests (status, updated_at desc)
  where status <> 'draft';
create index if not exists audit_log_entity on public.audit_log (entity, entity_id, at desc);
create index if not exists audit_log_actor on public.audit_log (actor_id, at desc);

alter table public.countries                  enable row level security;
alter table public.provinces                  enable row level security;
alter table public.cities                     enable row level security;
alter table public.languages                  enable row level security;
alter table public.specialities               enable row level security;
alter table public.council_bodies             enable row level security;
alter table public.metric_definitions         enable row level security;
alter table public.practice_status_events     enable row level security;
alter table public.practitioner_languages     enable row level security;
alter table public.practitioner_verifications enable row level security;
alter table public.client_consents            enable row level security;
alter table public.lead_interests             enable row level security;
alter table public.campaign_report_metrics    enable row level security;

alter table public.clients          force row level security;
alter table public.appointments     force row level security;
alter table public.client_consents  force row level security;
alter table public.queue_entries    force row level security;
alter table public.slot_holds       force row level security;

create policy countries_public_read      on public.countries      for select to anon, authenticated using (true);
create policy provinces_public_read      on public.provinces      for select to anon, authenticated using (true);
create policy cities_public_read         on public.cities         for select to anon, authenticated using (true);
create policy languages_public_read      on public.languages      for select to anon, authenticated using (true);
create policy specialities_public_read   on public.specialities   for select to anon, authenticated using (true);
create policy council_bodies_public_read on public.council_bodies for select to anon, authenticated using (true);
create policy metric_defs_read           on public.metric_definitions for select to authenticated using (true);

create policy plang_public_read on public.practitioner_languages for select to anon, authenticated
  using (exists (select 1 from public.practitioners pt where pt.id = practitioner_id and pt.listing_status = 'listed'));
create policy plang_member_read on public.practitioner_languages for select to authenticated using (public.is_member(practice_id));
create policy plang_owner_write on public.practitioner_languages for all to authenticated
  using (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]))
  with check (public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy pverif_read on public.practitioner_verifications for select to authenticated
  using (public.is_platform_admin() or public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy pstatus_read on public.practice_status_events for select to authenticated
  using (public.is_platform_admin() or public.has_practice_role(practice_id, array['practice_owner']::public.practice_role[]));

create policy consents_member_read   on public.client_consents for select to authenticated using (public.is_member(practice_id));
create policy consents_own_read      on public.client_consents for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
create policy consents_member_insert on public.client_consents for insert to authenticated with check (public.is_member(practice_id));

create policy crep_metrics_read on public.campaign_report_metrics for select to authenticated
  using (exists (select 1 from public.campaign_reports r where r.id = report_id and public.can_see_marketing_request(r.request_id)));

grant select on public.countries, public.provinces, public.cities,
                public.languages, public.specialities, public.council_bodies
  to anon, authenticated;
grant select on public.metric_definitions, public.practice_status_events,
                public.practitioner_languages, public.practitioner_verifications,
                public.client_consents, public.campaign_report_metrics
  to authenticated;

-- ───────────────────────── 5. Shared helpers (STORED_PROCEDURES.md §3) ─────────────────────────
create or replace function public._require_member(p_practice uuid)
returns public.practices language plpgsql stable security definer set search_path = public as $$
declare v public.practices;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.practices where id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function public._require_role(p_practice uuid, p_roles public.practice_role[])
returns public.practices language plpgsql stable security definer set search_path = public as $$
declare v public.practices;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_practice_role(p_practice, p_roles) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.practices where id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

create or replace function public._require_request_access(p_request uuid, p_write boolean default false)
returns public.marketing_requests language plpgsql stable security definer set search_path = public as $$
declare v public.marketing_requests;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v from public.marketing_requests where id = p_request;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.is_marketing_operator() then return v; end if;
  if public.has_practice_role(v.practice_id, array['practice_owner']::public.practice_role[]) then
    if p_write and v.status <> 'draft' then raise exception 'not_editable' using errcode = '42501'; end if;
    return v;
  end if;
  raise exception 'forbidden' using errcode = '42501';
end $$;

-- Update legacy submit_verification to use (practitioner_id, body_code) conflict target
create or replace function public.submit_verification(p_practitioner uuid, p_body text, p_number text) returns void
language plpgsql security definer set search_path = public as $$
declare v_practice uuid;
begin
  select practice_id into v_practice from public.practitioners where id = p_practitioner;
  if v_practice is null or not public.has_practice_role(v_practice, array['practice_owner']::public.practice_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 or char_length(trim(coalesce(p_number, ''))) < 3 then raise exception 'invalid_registration'; end if;
  insert into public.practitioner_registrations (practitioner_id, practice_id, body, body_code, registration_number)
  values (p_practitioner, v_practice, trim(p_body), trim(p_body), trim(p_number))
  on conflict (practitioner_id, body_code) do update set body = excluded.body, registration_number = excluded.registration_number, submitted_at = now();
  insert into public.practitioner_verifications (practice_id, practitioner_id, status, decided_by)
  values (v_practice, p_practitioner, 'pending', auth.uid());
  perform public._audit(v_practice, 'practitioner.verification_submitted', 'practitioner', p_practitioner, '{}');
exception when unique_violation then
  raise exception 'registration_in_use';
end $$;

-- Update practice_stats and practice_insights to use snapshotted a.price_cents
create or replace function public.practice_stats(p_practice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_avail numeric; v_booked numeric;
  r jsonb;
begin
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into v_tz from public.practices where id = p_practice;
  v_today := (now() at time zone v_tz)::date;

  select coalesce(sum(greatest(0, extract(epoch from (
           upper(w.win) - lower(w.win)) / 60.0)
         - coalesce((select sum(extract(epoch from (upper(w.win * t.during) - lower(w.win * t.during))) / 60.0)
                       from public.time_off t where t.practitioner_id = w.pid and t.during && w.win), 0))), 0)
    into v_avail
    from (select pt.id as pid,
                 tstzrange((d.day + ru.start_time) at time zone v_tz, (d.day + ru.end_time) at time zone v_tz) as win
            from public.practitioners pt
            join public.availability_rules ru on ru.practitioner_id = pt.id
            cross join (select generate_series(v_today::timestamp, (v_today + 6)::timestamp, interval '1 day')::date as day) d
           where pt.practice_id = p_practice and ru.weekday = extract(isodow from d.day)::int - 1) w;

  select coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60.0), 0) into v_booked
    from public.appointments a
   where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
     and a.starts_at >= (v_today::timestamp at time zone v_tz) and a.starts_at < ((v_today + 7)::timestamp at time zone v_tz);

  select jsonb_build_object(
    'today_total',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status <> 'cancelled'
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'today_completed',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'completed'
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'today_remaining',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in', 'in_progress')
                          and (a.starts_at at time zone v_tz)::date = v_today),
    'upcoming_7d',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status in ('booked', 'confirmed', 'checked_in')
                          and a.starts_at >= now() and a.starts_at < now() + interval '7 days'),
    'new_bookings_7d',  (select count(*) from public.appointments a where a.practice_id = p_practice and a.created_at >= now() - interval '7 days'),
    'bookings_30d',     (select count(*) from public.appointments a where a.practice_id = p_practice and a.starts_at >= now() - interval '30 days' and a.starts_at < now()
                          and a.status in ('completed', 'in_progress', 'checked_in', 'confirmed', 'booked')),
    'cancelled_30d',    (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'cancelled'
                          and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '30 days'),
    'no_show_30d',      (select count(*) from public.appointments a where a.practice_id = p_practice and a.status = 'no_show' and a.starts_at >= now() - interval '30 days'),
    'scheduled_30d',    (select count(*) from public.appointments a where a.practice_id = p_practice and a.starts_at >= now() - interval '30 days' and a.starts_at < now() + interval '30 days'),
    'new_clients_30d',  (select count(*) from public.clients c where c.practice_id = p_practice and c.created_at >= now() - interval '30 days'),
    'total_clients',    (select count(*) from public.clients c where c.practice_id = p_practice),
    'booked_minutes_7d', round(v_booked),
    'available_minutes_7d', round(v_avail),
    'utilisation_7d',   case when v_avail > 0 then round(v_booked / v_avail * 100, 1) end,
    'revenue_est_30d_cents', (select coalesce(sum(a.price_cents), 0) from public.appointments a
                               where a.practice_id = p_practice and a.status = 'completed' and a.starts_at >= now() - interval '30 days'),
    'queue_waiting',    (select count(*) from public.queue_entries q where q.practice_id = p_practice and q.status = 'waiting'),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'booked', coalesce(x.booked, 0), 'cancelled', coalesce(x.cancelled, 0)) order by d.day), '[]')
                 from (select generate_series(v_today - 29, v_today, interval '1 day')::date as day) d
                 left join (select (a.starts_at at time zone v_tz)::date as day,
                                   count(*) filter (where a.status <> 'cancelled') as booked,
                                   count(*) filter (where a.status = 'cancelled') as cancelled
                              from public.appointments a where a.practice_id = p_practice group by 1) x on x.day = d.day),
    'top_services', (select coalesce(jsonb_agg(t order by t.n desc), '[]') from (
                       select s.name, count(*) as n from public.appointments a join public.services s on s.id = a.service_id
                        where a.practice_id = p_practice and a.status <> 'cancelled' and a.starts_at >= now() - interval '30 days'
                        group by s.name order by count(*) desc limit 5) t)
  ) into r;
  return r;
end $$;

create or replace function public.practice_insights(p_practice uuid, p_weeks int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_since timestamptz; r jsonb;
begin
  if not public.is_member(p_practice) then raise exception 'forbidden' using errcode = '42501'; end if;
  select timezone into v_tz from public.practices where id = p_practice;
  v_since := date_trunc('week', now() at time zone v_tz) at time zone v_tz - make_interval(weeks => greatest(p_weeks, 1) - 1);
  select jsonb_build_object(
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'booked', coalesce(x.booked, 0), 'cancelled', coalesce(x.cancelled, 0), 'no_show', coalesce(x.no_show, 0), 'completed', coalesce(x.completed, 0)) order by w.wk), '[]')
                 from (select generate_series(date_trunc('week', v_since at time zone v_tz), date_trunc('week', now() at time zone v_tz), interval '1 week')::date as wk) w
                 left join (select date_trunc('week', a.starts_at at time zone v_tz)::date as wk,
                                   count(*) filter (where a.status not in ('cancelled', 'no_show')) as booked,
                                   count(*) filter (where a.status = 'cancelled') as cancelled,
                                   count(*) filter (where a.status = 'no_show') as no_show,
                                   count(*) filter (where a.status = 'completed') as completed
                              from public.appointments a where a.practice_id = p_practice and a.starts_at >= v_since group by 1) x on x.wk = w.wk),
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('weekday', h.wd, 'hour', h.hr, 'n', h.n)), '[]') from (
                  select extract(isodow from a.starts_at at time zone v_tz)::int - 1 as wd, extract(hour from a.starts_at at time zone v_tz)::int as hr, count(*) as n
                    from public.appointments a where a.practice_id = p_practice and a.status not in ('cancelled') and a.starts_at >= v_since group by 1, 2) h),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'n', s.n)), '[]') from (
                    select a.source, count(*) as n from public.appointments a where a.practice_id = p_practice and a.starts_at >= v_since and a.status <> 'cancelled' group by a.source) s),
    'by_practitioner', (select coalesce(jsonb_agg(jsonb_build_object('name', pt.display_name,
                          'booked', (select count(*) from public.appointments a where a.practitioner_id = pt.id and a.status not in ('cancelled', 'no_show') and a.starts_at >= v_since and a.starts_at < now()),
                          'cancelled', (select count(*) from public.appointments a where a.practitioner_id = pt.id and a.status = 'cancelled' and a.starts_at >= v_since and a.starts_at < now()))), '[]')
                          from public.practitioners pt where pt.practice_id = p_practice),
    'repeat', jsonb_build_object(
        'clients_with_visit', (select count(distinct a.client_id) from public.appointments a where a.practice_id = p_practice and a.status = 'completed'),
        'repeat_clients', (select count(*) from (select a.client_id from public.appointments a where a.practice_id = p_practice and a.status = 'completed' group by a.client_id having count(*) >= 2) rc)),
    'revenue_est_cents', (select coalesce(sum(a.price_cents), 0) from public.appointments a
                           where a.practice_id = p_practice and a.status = 'completed' and a.starts_at >= v_since)
  ) into r;
  return r;
end $$;

-- ───────────────────────── §5. Public / anonymous — 10 procedures ─────────────────────────
create or replace function public.public_practitioner_search(
  p_q text default null, p_speciality text default null, p_city_slug text default null,
  p_verified_only boolean default false, p_limit int default 40, p_offset int default 0)
returns table (practitioner_id uuid, practice_id uuid, display_name text, title text,
               speciality_slug text, speciality text, bio text, languages text[],
               verification_status text, practice_name text, practice_slug text,
               city text, city_slug text, province text, address text,
               from_price_cents int, currency text, service_count int, next_available timestamptz)
language sql stable security definer set search_path = public as $$
  with page as (
    select p.id, p.practice_id, p.display_name, p.title, p.speciality_slug, p.bio, p.verification_status,
           p.next_available_cached,
           pr.name as practice_name, pr.slug as practice_slug, pl.city, pl.city_slug,
           pl.province, pl.address, pl.currency
      from public.practitioners p
      join public.practices pr on pr.id = p.practice_id and pr.status = 'active'
      join public.practice_place_v pl on pl.practice_id = pr.id
     where p.listing_status = 'listed'
       and (coalesce(p_speciality, '')  = '' or p.speciality_slug = p_speciality or lower(p.speciality) = lower(p_speciality))
       and (coalesce(p_city_slug, '')   = '' or pl.city_slug = lower(p_city_slug) or lower(pl.city) = lower(p_city_slug))
       and (not p_verified_only or p.verification_status = 'verified')
       and (coalesce(p_q, '') = '' or p.search_vector @@ websearch_to_tsquery('simple', p_q))
     order by p.verification_status = 'verified' desc, p.display_name
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select pg.id, pg.practice_id, pg.display_name, pg.title, pg.speciality_slug, sp.name, pg.bio,
         (select coalesce(array_agg(l.name order by l.name), '{}')
            from public.practitioner_languages pl2
            join public.languages l on l.code = pl2.language_code
           where pl2.practitioner_id = pg.id),
         pg.verification_status, pg.practice_name, pg.practice_slug, pg.city, pg.city_slug,
         pg.province, pg.address,
         (select min(s.price_cents) from public.services s
            join public.practitioner_services ps on ps.service_id = s.id
           where ps.practitioner_id = pg.id and s.active),
         pg.currency,
         (select count(*)::int from public.services s
            join public.practitioner_services ps on ps.service_id = s.id
           where ps.practitioner_id = pg.id and s.active),
         coalesce(
           pg.next_available_cached,
           (select min(sl.starts_at)
              from public.services s
              join public.practitioner_services ps on ps.service_id = s.id and ps.practitioner_id = pg.id
              cross join lateral public.get_available_slots(pg.id, s.id, current_date, current_date + 6) sl
             where s.active)
         )
    from page pg
    join public.specialities sp on sp.slug = pg.speciality_slug
   order by pg.display_name;
$$;

create or replace function public.public_practitioner_get(p_practitioner uuid)
returns table (practitioner_id uuid, practice_id uuid, display_name text, title text,
               speciality text, bio text, languages text[], verification_status text,
               practice_name text, practice_slug text, city text, province text, address text,
               currency text, cancellation_notice_hours int, min_notice_minutes int)
language sql stable security definer set search_path = public as $$
  select p.id, p.practice_id, p.display_name, p.title, sp.name, p.bio,
         (select coalesce(array_agg(l.name order by l.name), '{}')
            from public.practitioner_languages pl
            join public.languages l on l.code = pl.language_code
           where pl.practitioner_id = p.id),
         p.verification_status, pr.name, pr.slug, pv.city, pv.province, pv.address,
         pv.currency, pr.cancellation_notice_hours, pr.min_notice_minutes
    from public.practitioners p
    join public.practices pr on pr.id = p.practice_id and pr.status = 'active'
    join public.specialities sp on sp.slug = p.speciality_slug
    left join public.practice_place_v pv on pv.practice_id = pr.id
   where p.id = p_practitioner and p.listing_status = 'listed';
$$;

create or replace function public.public_practitioner_services(p_practitioner uuid)
returns table (service_id uuid, name text, description text, duration_min int,
               buffer_min int, price_cents int, currency text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.description, s.duration_min, s.buffer_min, s.price_cents, c.currency
    from public.services s
    join public.practitioner_services ps on ps.service_id = s.id
    join public.practices pr on pr.id = s.practice_id and pr.status = 'active'
    join public.countries c on c.code = pr.country_code
   where ps.practitioner_id = p_practitioner and s.active
   order by s.price_cents nulls last, s.name;
$$;

create or replace function public.public_slots_list(
  p_practitioner uuid, p_service uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return query select * from public.get_available_slots(p_practitioner, p_service, p_from, p_to);
end $$;

drop function if exists public.public_city_list();
create or replace function public.public_city_list()
returns table (city_id uuid, name text, slug text, province text, practitioner_count int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.slug, pv.name, count(distinct p.id)::int
    from public.cities c
    join public.provinces pv on pv.code = c.province_code
    join public.locations l  on l.city_id = c.id
    join public.practices pr on pr.id = l.practice_id and pr.status = 'active'
    join public.practitioners p on p.practice_id = pr.id and p.listing_status = 'listed'
   group by c.id, c.name, c.slug, pv.name
   having count(distinct p.id) > 0
   order by c.name;
$$;

create or replace function public.public_speciality_list()
returns table (slug text, name text, practitioner_count int)
language sql stable security definer set search_path = public as $$
  select sp.slug, sp.name, count(p.id)::int
    from public.specialities sp
    left join public.practitioners p on p.speciality_slug = sp.slug and p.listing_status = 'listed'
          and exists (select 1 from public.practices pr where pr.id = p.practice_id and pr.status = 'active')
   where sp.active
   group by sp.slug, sp.name
   order by sp.name;
$$;

drop function if exists public.public_queue_info(text);
create or replace function public.public_queue_info(p_slug text)
returns table (practice_name text, address text, city text, waiting_count int, accepting boolean)
language sql stable security definer set search_path = public as $$
  select pr.name, pv.address, pv.city,
         (select count(*)::int from public.queue_entries q
           where q.practice_id = pr.id and q.status = 'waiting'),
         pr.status = 'active'
    from public.practices pr
    left join public.practice_place_v pv on pv.practice_id = pr.id
   where pr.slug = p_slug and pr.status = 'active';
$$;

create or replace function public.public_queue_join(
  p_practice_slug text, p_name text, p_phone text default null, p_urgency text default 'routine')
returns text language plpgsql security definer set search_path = public as $$
declare v_practice uuid; v_token text;
begin
  if coalesce(trim(p_name), '') = '' or char_length(trim(p_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  select id into v_practice from public.practices where slug = p_practice_slug and status = 'active';
  if not found then raise exception 'queue_closed' using errcode = 'P0002'; end if;

  insert into public.queue_entries (practice_id, walkin_name, walkin_phone, urgency, source)
  values (v_practice, trim(p_name), nullif(p_phone, ''), p_urgency, 'qr')
  returning public_token into v_token;

  perform public._audit(v_practice, 'queue.joined', 'queue_entry', null,
                        jsonb_build_object('source', 'qr', 'urgency', p_urgency));
  return v_token;
end $$;

create or replace function public.public_queue_status(p_token text)
returns table (status text, queue_position int, practice_name text)
language sql stable security definer set search_path = public as $$
  select q.status::text,
         case when q.status = 'waiting' then
           (select count(*)::int + 1 from public.queue_entries o
             where o.practice_id = q.practice_id and o.status = 'waiting' and o.seq < q.seq)
         end,
         pr.name
    from public.queue_entries q
    join public.practices pr on pr.id = q.practice_id
   where q.public_token = p_token;
$$;

create or replace function public.public_queue_leave(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_practice uuid;
begin
  update public.queue_entries set status = 'cancelled', completed_at = now()
   where public_token = p_token and status = 'waiting'
   returning id, practice_id into v_id, v_practice;
  if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._audit(v_practice, 'queue.left', 'queue_entry', v_id, '{}');
end $$;

-- ───────────────────────── §6. Patient (consumer) — 13 procedures ─────────────────────────
create or replace function public.patient_profile_get()
returns table (user_id uuid, display_name text, phone text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.phone, u.email, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = auth.uid();
$$;

create or replace function public.patient_profile_update(p_display_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(trim(p_display_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.profiles
     set display_name = trim(p_display_name), phone = nullif(p_phone, '')
   where id = auth.uid();
end $$;

create or replace function public.patient_appointments_list(
  p_scope text default 'all')
returns table (appointment_id uuid, status text, starts_at timestamptz, ends_at timestamptz,
               practice_name text, practice_slug text, practitioner_name text, service_name text,
               service_id uuid, price_cents int, currency text, address text, city text,
               cancellation_notice_hours int, can_cancel boolean, can_check_in boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.status::text, a.starts_at, a.ends_at, pr.name, pr.slug, pt.display_name, s.name,
         a.service_id, a.price_cents, a.currency, pv.address, pv.city, pr.cancellation_notice_hours,
         a.status in ('booked', 'confirmed')
           and a.starts_at > now() + make_interval(hours => pr.cancellation_notice_hours),
         a.status in ('booked', 'confirmed')
           and a.starts_at between now() - interval '2 hours' and now() + interval '2 hours'
    from public.appointments a
    join public.practices pr      on pr.id = a.practice_id
    join public.practitioners pt  on pt.id = a.practitioner_id
    join public.services s        on s.id  = a.service_id
    left join public.practice_place_v pv on pv.practice_id = pr.id
   where a.consumer_id = auth.uid()
     and case p_scope
           when 'upcoming' then a.starts_at > now() - interval '30 minutes'
                                and a.status in ('booked','confirmed','checked_in')
           when 'past'     then a.starts_at <= now()
           else true
         end
   order by a.starts_at desc;
$$;

create or replace function public.patient_appointment_get(p_appointment uuid)
returns table (appointment_id uuid, status text, starts_at timestamptz, ends_at timestamptz,
               practice_name text, practice_slug text, practitioner_name text, service_name text,
               service_id uuid, price_cents int, currency text, address text, city text,
               cancellation_notice_hours int, can_cancel boolean, can_check_in boolean)
language sql stable security definer set search_path = public as $$
  select * from public.patient_appointments_list('all') where appointment_id = p_appointment;
$$;

create or replace function public.patient_slot_hold(
  p_practitioner uuid, p_service uuid, p_starts timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_svc public.services; v_tz text; v_day date; v_hold uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  delete from public.slot_holds where expires_at <= now();

  select s.* into v_svc from public.services s
    join public.practitioner_services ps on ps.service_id = s.id and ps.practitioner_id = p_practitioner
   where s.id = p_service and s.active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select timezone into v_tz from public.practices where id = v_svc.practice_id;
  v_day := (p_starts at time zone coalesce(v_tz, 'Africa/Johannesburg'))::date;

  if not exists (
    select 1 from public.get_available_slots(p_practitioner, p_service, v_day, v_day) g
     where g.starts_at = p_starts
  ) then raise exception 'slot_unavailable' using errcode = '23P01'; end if;

  insert into public.slot_holds (practice_id, practitioner_id, service_id, consumer_id,
                                 starts_at, ends_at, expires_at)
  values (v_svc.practice_id, p_practitioner, p_service, v_uid, p_starts,
          p_starts + make_interval(mins => v_svc.duration_min), now() + interval '5 minutes')
  returning id into v_hold;

  perform public._audit(v_svc.practice_id, 'hold.created', 'slot_hold', v_hold,
                        jsonb_build_object('starts_at', p_starts));
  return v_hold;
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;

create or replace function public.patient_hold_get(p_hold uuid)
returns table (hold_id uuid, starts_at timestamptz, ends_at timestamptz, expires_at timestamptz,
               practitioner_id uuid, practitioner_name text, speciality text, service_name text,
               duration_min int, price_cents int, currency text, practice_name text,
               cancellation_notice_hours int, address text, city text)
language sql stable security definer set search_path = public as $$
  select h.id, h.starts_at, h.ends_at, h.expires_at, h.practitioner_id, pt.display_name,
         sp.name, s.name, s.duration_min, s.price_cents, co.currency, pr.name,
         pr.cancellation_notice_hours, pv.address, pv.city
    from public.slot_holds h
    join public.practitioners pt on pt.id = h.practitioner_id
    join public.specialities sp  on sp.slug = pt.speciality_slug
    join public.services s       on s.id = h.service_id
    join public.practices pr     on pr.id = h.practice_id
    join public.countries co     on co.code = pr.country_code
    left join public.practice_place_v pv on pv.practice_id = pr.id
   where h.id = p_hold and h.consumer_id = auth.uid();
$$;

create or replace function public.patient_hold_release(p_hold uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.slot_holds where id = p_hold and consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.patient_appointment_book(p_hold uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_h public.slot_holds; v_svc public.services;
  v_cur text; v_client uuid; v_appt uuid; v_loc uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_h from public.slot_holds where id = p_hold and consumer_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_h.expires_at <= now() then raise exception 'hold_expired' using errcode = '22023'; end if;

  select * into v_svc from public.services where id = v_h.service_id;
  select co.currency into v_cur from public.practices pr
    join public.countries co on co.code = pr.country_code where pr.id = v_h.practice_id;
  select id into v_loc from public.locations where practice_id = v_h.practice_id and is_primary;

  select id into v_client from public.clients
   where practice_id = v_h.practice_id and user_id = v_uid;
  if v_client is null then
    insert into public.clients (practice_id, user_id, first_name, last_name)
    select v_h.practice_id, v_uid,
           coalesce(nullif(split_part(p.display_name, ' ', 1), ''), 'Patient'),
           coalesce(nullif(substr(p.display_name, strpos(p.display_name, ' ') + 1), ''), '')
      from public.profiles p where p.id = v_uid
    returning id into v_client;
    insert into public.client_consents (practice_id, client_id, purpose, granted, actor_id, channel, evidence)
    values (v_h.practice_id, v_client, 'record_storage', true, v_uid, 'app',
            jsonb_build_object('via', 'patient_appointment_book', 'hold_id', p_hold));
  end if;

  insert into public.appointments (practice_id, practitioner_id, service_id, location_id, client_id,
                                   consumer_id, starts_at, ends_at, buffer_min, price_cents, currency,
                                   status, source)
  values (v_h.practice_id, v_h.practitioner_id, v_h.service_id, v_loc, v_client, v_uid,
          v_h.starts_at, v_h.ends_at, v_svc.buffer_min, v_svc.price_cents, v_cur, 'confirmed', 'app')
  returning id into v_appt;

  delete from public.slot_holds where id = p_hold;

  perform public._audit(v_h.practice_id, 'appointment.booked', 'appointment', v_appt,
                        jsonb_build_object('source', 'app', 'starts_at', v_h.starts_at));
  return v_appt;
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;

create or replace function public.patient_appointment_cancel(p_appointment uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.appointments; v_notice int;
begin
  select * into v_a from public.appointments
   where id = p_appointment and consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select cancellation_notice_hours into v_notice from public.practices where id = v_a.practice_id;
  if v_a.status not in ('booked', 'confirmed') then raise exception 'not_cancellable' using errcode = '22023'; end if;
  if v_a.starts_at <= now() + make_interval(hours => v_notice) then
    raise exception 'too_late_to_cancel' using errcode = '22023';
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = nullif(p_reason, '')
   where id = p_appointment;

  perform public._audit(v_a.practice_id, 'appointment.cancelled', 'appointment', p_appointment,
                        jsonb_build_object('by', 'consumer', 'reason', p_reason));
end $$;

create or replace function public.patient_appointment_reschedule(p_appointment uuid, p_new_starts timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.appointments; v_notice int; v_tz text; v_day date; v_dur int;
begin
  select * into v_a from public.appointments
   where id = p_appointment and consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select cancellation_notice_hours, timezone into v_notice, v_tz from public.practices where id = v_a.practice_id;
  if v_a.status not in ('booked', 'confirmed') then raise exception 'not_reschedulable' using errcode = '22023'; end if;
  if v_a.starts_at <= now() + make_interval(hours => v_notice) then
    raise exception 'too_late_to_cancel' using errcode = '22023';
  end if;

  select duration_min into v_dur from public.services where id = v_a.service_id;
  v_day := (p_new_starts at time zone coalesce(v_tz, 'Africa/Johannesburg'))::date;
  if not exists (
    select 1 from public.get_available_slots(v_a.practitioner_id, v_a.service_id, v_day, v_day) g
     where g.starts_at = p_new_starts
  ) then raise exception 'slot_unavailable' using errcode = '23P01'; end if;

  update public.appointments
     set starts_at = p_new_starts,
         ends_at = p_new_starts + make_interval(mins => v_dur),
         reminder_sent_at = null
   where id = p_appointment;

  perform public._audit(v_a.practice_id, 'appointment.rescheduled', 'appointment', p_appointment,
                        jsonb_build_object('from', v_a.starts_at, 'to', p_new_starts, 'by', 'consumer'));
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;

create or replace function public.patient_appointment_check_in(p_appointment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.appointments;
begin
  select * into v_a from public.appointments
   where id = p_appointment and consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_a.status not in ('booked', 'confirmed') then raise exception 'not_checkin_able' using errcode = '22023'; end if;
  if v_a.starts_at > now() + interval '2 hours' then
    raise exception 'too_early_to_check_in' using errcode = '22023';
  end if;

  update public.appointments set status = 'checked_in' where id = p_appointment;

  insert into public.queue_entries (practice_id, appointment_id, client_id, source, status)
  select v_a.practice_id, v_a.id, v_a.client_id, 'booked', 'waiting'
   where not exists (select 1 from public.queue_entries where appointment_id = v_a.id);

  perform public._audit(v_a.practice_id, 'appointment.checked_in', 'appointment', p_appointment,
                        jsonb_build_object('by', 'consumer'));
end $$;

create or replace function public.patient_account_export()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select jsonb_build_object(
    'exported_at', now(),
    'profile',      (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'email',        (select u.email from auth.users u where u.id = v_uid),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                       from public.patient_appointments_list('all') a),
    'client_records', (select coalesce(jsonb_agg(jsonb_build_object(
                           'practice', pr.name, 'first_name', c.first_name, 'last_name', c.last_name,
                           'email', c.email, 'phone', c.phone)), '[]'::jsonb)
                       from public.clients c join public.practices pr on pr.id = c.practice_id
                      where c.user_id = v_uid),
    'consents',     (select coalesce(jsonb_agg(jsonb_build_object(
                           'practice', pr.name, 'purpose', cc.purpose, 'granted', cc.granted, 'at', cc.at)), '[]'::jsonb)
                       from public.client_consents cc
                       join public.clients c on c.id = cc.client_id
                       join public.practices pr on pr.id = cc.practice_id
                      where c.user_id = v_uid)
  ) into v_out;

  perform public._audit(null, 'account.exported', 'profile', v_uid, '{}');
  return v_out;
end $$;

create or replace function public.patient_account_delete()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  if exists (
    select 1 from public.practice_members m
     where m.user_id = v_uid and m.role = 'practice_owner'
       and not exists (select 1 from public.practice_members o
                        where o.practice_id = m.practice_id and o.user_id <> v_uid
                          and o.role = 'practice_owner')
  ) then raise exception 'sole_owner' using errcode = '42501'; end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = 'account deleted'
   where consumer_id = v_uid and starts_at > now() and status in ('booked', 'confirmed');

  delete from public.slot_holds where consumer_id = v_uid;

  perform public._audit(null, 'account.deleted', 'profile', v_uid, '{}');
  delete from auth.users where id = v_uid;
exception
  when foreign_key_violation then raise exception 'has_records' using errcode = '23503';
end $$;

-- ───────────────────────── §7. Practice — dashboard, calendar, context — 11 procedures ─────────────────────────
create or replace function public.practice_dashboard_get(p_practice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return public.practice_stats(p_practice);
end $$;

create or replace function public.practice_insights_get(p_practice uuid, p_weeks int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  if p_weeks not between 1 and 52 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return public.practice_insights(p_practice, p_weeks);
end $$;

create or replace function public.practice_setup_progress(p_practice uuid)
returns table (practitioners int, listed int, verified int, services int,
               availability_rules int, locations int, is_complete boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select (select count(*)::int from public.practitioners where practice_id = p_practice),
         (select count(*)::int from public.practitioners where practice_id = p_practice and listing_status = 'listed'),
         (select count(*)::int from public.practitioners where practice_id = p_practice and verification_status = 'verified'),
         (select count(*)::int from public.services where practice_id = p_practice and active),
         (select count(*)::int from public.availability_rules where practice_id = p_practice),
         (select count(*)::int from public.locations where practice_id = p_practice),
         (select count(*) from public.practitioners where practice_id = p_practice and listing_status = 'listed') > 0
           and (select count(*) from public.services where practice_id = p_practice and active) > 0
           and (select count(*) from public.availability_rules where practice_id = p_practice) > 0;
end $$;

create or replace function public.practice_calendar_appointments(
  p_practice uuid, p_from timestamptz, p_to timestamptz, p_include_cancelled boolean default false)
returns table (appointment_id uuid, starts_at timestamptz, ends_at timestamptz, status text,
               source text, created_at timestamptz, practitioner_id uuid, practitioner_name text,
               service_id uuid, service_name text, price_cents int, currency text,
               client_id uuid, client_name text, client_phone text, client_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  if p_to <= p_from or p_to - p_from > interval '90 days' then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  return query
  select a.id, a.starts_at, a.ends_at, a.status::text, a.source, a.created_at,
         a.practitioner_id, pt.display_name, a.service_id, s.name, a.price_cents, a.currency,
         cc.client_id, cc.full_name, cc.phone, cc.email
    from public.appointments a
    join public.practitioners pt on pt.id = a.practitioner_id
    join public.services s on s.id = a.service_id
    join public.client_contact_v cc on cc.client_id = a.client_id
   where a.practice_id = p_practice
     and a.starts_at >= p_from and a.starts_at < p_to
     and (p_include_cancelled or a.status <> 'cancelled')
   order by a.starts_at;
end $$;

create or replace function public.practice_calendar_availability(p_practice uuid)
returns table (practitioner_id uuid, weekday smallint, start_time text, end_time text, location_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select r.practitioner_id, r.weekday, r.start_time::text, r.end_time::text, r.location_id
    from public.availability_rules r
   where r.practice_id = p_practice
   order by r.practitioner_id, r.weekday, r.start_time;
end $$;

create or replace function public.practice_calendar_timeoff(
  p_practice uuid, p_from timestamptz, p_to timestamptz)
returns table (timeoff_id uuid, practitioner_id uuid, starts_at timestamptz, ends_at timestamptz, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select t.id, t.practitioner_id, lower(t.during), upper(t.during), t.reason
    from public.time_off t
   where t.practice_id = p_practice and t.during && tstzrange(p_from, p_to)
   order by lower(t.during);
end $$;

create or replace function public.practice_queue_preview(p_practice uuid, p_limit int default 5)
returns table (entry_id uuid, display_name text, urgency text, joined_at timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select q.id, q.display_name, q.urgency, q.joined_at, q.status::text
    from public.queue_entry_display_v q
   where q.practice_id = p_practice and q.status in ('waiting', 'in_consultation')
   order by q.status desc, q.seq
   limit least(greatest(p_limit, 1), 50);
end $$;

create or replace function public.practice_queue_waiting_count(p_practice uuid)
returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return (select count(*)::int from public.queue_entries
           where practice_id = p_practice and status = 'waiting');
end $$;

create or replace function public.practice_recent_app_bookings(
  p_practice uuid, p_days int default 7, p_limit int default 10)
returns table (appointment_id uuid, created_at timestamptz, starts_at timestamptz, status text,
               client_name text, service_name text, practitioner_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select a.id, a.created_at, a.starts_at, a.status::text, cc.full_name, s.name, pt.display_name
    from public.appointments a
    join public.client_contact_v cc on cc.client_id = a.client_id
    join public.services s on s.id = a.service_id
    join public.practitioners pt on pt.id = a.practitioner_id
   where a.practice_id = p_practice and a.source = 'app' and a.status <> 'cancelled'
     and a.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
   order by a.created_at desc
   limit least(greatest(p_limit, 1), 50);
end $$;

create or replace function public.practice_memberships_list()
returns table (practice_id uuid, name text, slug text, status text, role text,
               min_notice_minutes int, cancellation_notice_hours int, timezone text,
               city text, province text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.slug, p.status, m.role::text,
         p.min_notice_minutes, p.cancellation_notice_hours, p.timezone, pv.city, pv.province
    from public.practice_members m
    join public.practices p on p.id = m.practice_id
    left join public.practice_place_v pv on pv.practice_id = p.id
   where m.user_id = auth.uid()
   order by p.name;
$$;

create or replace function public.platform_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.platform_roles where user_id = auth.uid();
$$;


-- ============================================================================
-- §8 Practice — team and practitioners (12 procedures)
-- ============================================================================

create or replace function public.practice_practitioners_list(p_practice uuid)
returns table (practitioner_id uuid, user_id uuid, display_name text, title text,
               speciality_slug text, speciality text, bio text, languages text[],
               verification_status text, listing_status text, service_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select p.id, p.user_id, p.display_name, p.title, p.speciality_slug, sp.name, p.bio,
         (select coalesce(array_agg(l.code order by l.name), '{}')
            from public.practitioner_languages pl join public.languages l on l.code = pl.language_code
           where pl.practitioner_id = p.id),
         p.verification_status, p.listing_status,
         (select count(*)::int from public.practitioner_services ps where ps.practitioner_id = p.id)
    from public.practitioners p
    join public.specialities sp on sp.slug = p.speciality_slug
   where p.practice_id = p_practice
   order by p.display_name;
end $$;

create or replace function public.practice_practitioner_create(
  p_practice uuid, p_display_name text, p_title text, p_speciality_slug text,
  p_bio text default '', p_languages text[] default array['en'], p_user_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(trim(p_display_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;

  insert into public.practitioners (practice_id, user_id, display_name, title, speciality_slug, bio)
  values (p_practice, p_user_id, trim(p_display_name), nullif(p_title, ''), p_speciality_slug, coalesce(p_bio, ''))
  returning id into v_id;

  insert into public.practitioner_languages (practitioner_id, practice_id, language_code)
  select v_id, p_practice, unnest(p_languages) on conflict do nothing;

  insert into public.practitioner_verifications (practice_id, practitioner_id, status, decided_by)
  values (p_practice, v_id, 'unverified', auth.uid());

  perform public._audit(p_practice, 'practitioner.created', 'practitioner', v_id,
                        jsonb_build_object('speciality', p_speciality_slug));
  return v_id;
end $$;

create or replace function public.practice_practitioner_update(
  p_practice uuid, p_practitioner uuid, p_display_name text, p_title text,
  p_speciality_slug text, p_bio text, p_languages text[], p_listing_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(trim(p_display_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;

  update public.practitioners
     set display_name = trim(p_display_name), title = nullif(p_title, ''),
         speciality_slug = p_speciality_slug, bio = coalesce(p_bio, ''),
         listing_status = p_listing_status
   where id = p_practitioner and practice_id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  delete from public.practitioner_languages
   where practitioner_id = p_practitioner
     and language_code <> all (coalesce(p_languages, '{}'));
  insert into public.practitioner_languages (practitioner_id, practice_id, language_code)
  select p_practitioner, p_practice, unnest(p_languages) on conflict do nothing;

  perform public._audit(p_practice, 'practitioner.updated', 'practitioner', p_practitioner,
                        jsonb_build_object('listing_status', p_listing_status));
end $$;

create or replace function public.practice_practitioner_services_list(p_practice uuid, p_practitioner uuid)
returns table (service_id uuid) language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query select ps.service_id from public.practitioner_services ps
                where ps.practitioner_id = p_practitioner and ps.practice_id = p_practice;
end $$;

create or replace function public.practice_practitioner_services_set(
  p_practice uuid, p_practitioner uuid, p_services uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  delete from public.practitioner_services
   where practitioner_id = p_practitioner and practice_id = p_practice
     and service_id <> all (coalesce(p_services, '{}'));
  insert into public.practitioner_services (practitioner_id, service_id, practice_id)
  select p_practitioner, unnest(p_services), p_practice on conflict do nothing;
  perform public._audit(p_practice, 'practitioner.services_set', 'practitioner', p_practitioner,
                        jsonb_build_object('count', coalesce(array_length(p_services, 1), 0)));
end $$;

create or replace function public.practice_registrations_list(p_practice uuid, p_practitioner uuid)
returns table (body_code text, body_name text, registration_number text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  return query
  select r.body_code, cb.name, r.registration_number, r.submitted_at
    from public.practitioner_registrations r
    join public.council_bodies cb on cb.code = r.body_code
   where r.practitioner_id = p_practitioner and r.practice_id = p_practice
   order by cb.name;
end $$;

create or replace function public.practice_registration_submit(
  p_practice uuid, p_practitioner uuid, p_body_code text, p_number text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(trim(p_body_code), '') = '' or coalesce(trim(p_number), '') = '' then
    raise exception 'invalid_registration' using errcode = '22023';
  end if;

  insert into public.practitioner_registrations
         (practitioner_id, practice_id, body_code, registration_number)
  values (p_practitioner, p_practice, p_body_code, trim(p_number))
  on conflict (practitioner_id, body_code)
    do update set registration_number = excluded.registration_number, submitted_at = now();

  insert into public.practitioner_verifications (practice_id, practitioner_id, status, decided_by)
  values (p_practice, p_practitioner, 'pending', auth.uid());

  perform public._audit(p_practice, 'practitioner.verification_submitted', 'practitioner',
                        p_practitioner, jsonb_build_object('body', p_body_code));
exception
  when unique_violation then raise exception 'registration_in_use' using errcode = '23505';
end $$;

create or replace function public.practice_verifications_list(p_practice uuid, p_practitioner uuid)
returns table (status text, decided_at timestamptz, decided_by_name text, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  return query
  select v.status, v.decided_at, coalesce(p.display_name, ''), v.note
    from public.practitioner_verifications v
    left join public.profiles p on p.id = v.decided_by
   where v.practitioner_id = p_practitioner and v.practice_id = p_practice
   order by v.decided_at desc;
end $$;

create or replace function public.practice_team_list(p_practice uuid)
returns table (user_id uuid, email text, display_name text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select m.user_id, u.email, p.display_name, m.role::text, m.created_at
    from public.practice_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
   where m.practice_id = p_practice
   order by m.role, p.display_name;
end $$;

create or replace function public.practice_member_add(p_practice uuid, p_email text, p_role public.practice_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;

  insert into public.practice_members (practice_id, user_id, role)
  values (p_practice, v_user, p_role)
  on conflict (practice_id, user_id) do update set role = excluded.role;

  perform public._audit(p_practice, 'member.added', 'practice_member', v_user,
                        jsonb_build_object('role', p_role));
  return v_user;
end $$;

create or replace function public.practice_member_role_set(p_practice uuid, p_user uuid, p_role public.practice_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.practice_role;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  select role into v_old from public.practice_members where practice_id = p_practice and user_id = p_user;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  if v_old = 'practice_owner' and p_role <> 'practice_owner'
     and (select count(*) from public.practice_members
           where practice_id = p_practice and role = 'practice_owner') <= 1 then
    raise exception 'sole_owner' using errcode = '42501';
  end if;

  update public.practice_members set role = p_role
   where practice_id = p_practice and user_id = p_user;

  perform public._audit(p_practice, 'member.role_changed', 'practice_member', p_user,
                        jsonb_build_object('from', v_old, 'to', p_role));
end $$;

create or replace function public.practice_member_remove(p_practice uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if (select role from public.practice_members where practice_id = p_practice and user_id = p_user) = 'practice_owner'
     and (select count(*) from public.practice_members
           where practice_id = p_practice and role = 'practice_owner') <= 1 then
    raise exception 'sole_owner' using errcode = '42501';
  end if;
  delete from public.practice_members where practice_id = p_practice and user_id = p_user;
  perform public._audit(p_practice, 'member.removed', 'practice_member', p_user, '{}');
end $$;

-- ============================================================================
-- §9 Practice — services (5 procedures)
-- ============================================================================

create or replace function public.practice_services_list(p_practice uuid, p_include_inactive boolean default true)
returns table (service_id uuid, name text, description text, duration_min int, buffer_min int,
               price_cents int, currency text, active boolean, practitioner_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select s.id, s.name, s.description, s.duration_min, s.buffer_min, s.price_cents, co.currency, s.active,
         (select count(*)::int from public.practitioner_services ps where ps.service_id = s.id)
    from public.services s
    join public.practices pr on pr.id = s.practice_id
    join public.countries co on co.code = pr.country_code
   where s.practice_id = p_practice and (p_include_inactive or s.active)
   order by s.active desc, s.name;
end $$;

create or replace function public.practice_service_upsert(
  p_practice uuid, p_service uuid, p_name text, p_description text,
  p_duration_min int, p_buffer_min int, p_price_cents int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_active and p_price_cents is null then
    raise exception 'price_required' using errcode = '22023';
  end if;

  if p_service is null then
    insert into public.services (practice_id, name, description, duration_min, buffer_min, price_cents, active)
    values (p_practice, trim(p_name), nullif(p_description, ''), p_duration_min, p_buffer_min, p_price_cents, p_active)
    returning id into v_id;
    perform public._audit(p_practice, 'service.created', 'service', v_id, jsonb_build_object('name', p_name));
  else
    update public.services
       set name = trim(p_name), description = nullif(p_description, ''), duration_min = p_duration_min,
           buffer_min = p_buffer_min, price_cents = p_price_cents, active = p_active
     where id = p_service and practice_id = p_practice
     returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public._audit(p_practice, 'service.updated', 'service', v_id,
                          jsonb_build_object('price_cents', p_price_cents, 'active', p_active));
  end if;
  return v_id;
end $$;

create or replace function public.practice_service_practitioners_set(
  p_practice uuid, p_service uuid, p_practitioners uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(array_length(p_practitioners, 1), 0) = 0
     and exists (select 1 from public.appointments a
                  where a.service_id = p_service and a.practice_id = p_practice
                    and a.starts_at > now() and a.status in ('booked', 'confirmed')) then
    raise exception 'last_practitioner' using errcode = '23503';
  end if;
  delete from public.practitioner_services
   where service_id = p_service and practice_id = p_practice
     and practitioner_id <> all (coalesce(p_practitioners, '{}'));
  insert into public.practitioner_services (practitioner_id, service_id, practice_id)
  select unnest(p_practitioners), p_service, p_practice on conflict do nothing;
  perform public._audit(p_practice, 'service.practitioners_set', 'service', p_service,
                        jsonb_build_object('count', coalesce(array_length(p_practitioners, 1), 0)));
end $$;

create or replace function public.practice_service_practitioners_list(p_practice uuid, p_service uuid)
returns table (practitioner_id uuid) language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query select ps.practitioner_id from public.practitioner_services ps
                where ps.service_id = p_service and ps.practice_id = p_practice;
end $$;

create or replace function public.practice_service_deactivate(p_practice uuid, p_service uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if exists (select 1 from public.appointments
              where service_id = p_service and starts_at > now()
                and status in ('booked', 'confirmed', 'checked_in')) then
    raise exception 'service_in_use' using errcode = '23503';
  end if;
  update public.services set active = false where id = p_service and practice_id = p_practice;
  perform public._audit(p_practice, 'service.deactivated', 'service', p_service, '{}');
end $$;

-- ============================================================================
-- §10 Practice — availability and leave (6 procedures)
-- ============================================================================

create or replace function public.practice_availability_list(p_practice uuid, p_practitioner uuid)
returns table (rule_id uuid, weekday smallint, start_time text, end_time text, location_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select r.id, r.weekday, r.start_time::text, r.end_time::text, r.location_id
    from public.availability_rules r
   where r.practitioner_id = p_practitioner and r.practice_id = p_practice
   order by r.weekday, r.start_time;
end $$;

create or replace function public.practice_availability_set(
  p_practice uuid, p_practitioner uuid,
  p_weekdays int[], p_starts text[], p_ends text[], p_location uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist']::public.practice_role[]);

  if coalesce(array_length(p_weekdays, 1), 0) <> coalesce(array_length(p_starts, 1), 0)
     or coalesce(array_length(p_weekdays, 1), 0) <> coalesce(array_length(p_ends, 1), 0) then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  delete from public.availability_rules
   where practitioner_id = p_practitioner and practice_id = p_practice;

  insert into public.availability_rules (practice_id, practitioner_id, location_id, weekday, start_time, end_time)
  select p_practice, p_practitioner, p_location, x.wd, x.s::time, x.e::time
    from unnest(p_weekdays, p_starts, p_ends) as x(wd, s, e);

  perform public._audit(p_practice, 'availability.set', 'practitioner', p_practitioner,
                        jsonb_build_object('rules', coalesce(array_length(p_weekdays, 1), 0)));
exception
  when exclusion_violation then raise exception 'overlapping_availability' using errcode = '23P01';
end $$;

create or replace function public.practice_availability_apply_pattern(
  p_practice uuid, p_practitioner uuid, p_weekdays int[],
  p_start text, p_end text, p_location uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist']::public.practice_role[]);
  insert into public.availability_rules (practice_id, practitioner_id, location_id, weekday, start_time, end_time)
  select p_practice, p_practitioner, p_location, d, p_start::time, p_end::time
    from unnest(p_weekdays) d;
  perform public._audit(p_practice, 'availability.pattern_applied', 'practitioner', p_practitioner,
                        jsonb_build_object('start', p_start, 'end', p_end));
exception
  when exclusion_violation then raise exception 'overlapping_availability' using errcode = '23P01';
end $$;

create or replace function public.practice_timeoff_list(
  p_practice uuid, p_practitioner uuid default null, p_from timestamptz default now())
returns table (timeoff_id uuid, practitioner_id uuid, starts_at timestamptz, ends_at timestamptz, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select t.id, t.practitioner_id, lower(t.during), upper(t.during), t.reason
    from public.time_off t
   where t.practice_id = p_practice
     and (p_practitioner is null or t.practitioner_id = p_practitioner)
     and upper(t.during) > p_from
   order by lower(t.during);
end $$;

create or replace function public.practice_timeoff_add(
  p_practice uuid, p_practitioner uuid, p_from date, p_to date, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tz text; v_affected int;
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist']::public.practice_role[]);
  if p_to < p_from then raise exception 'invalid_range' using errcode = '22023'; end if;

  select timezone into v_tz from public.practices where id = p_practice;

  insert into public.time_off (practice_id, practitioner_id, during, reason)
  values (p_practice, p_practitioner,
          tstzrange((p_from::timestamp) at time zone v_tz,
                    ((p_to + 1)::timestamp) at time zone v_tz, '[)'),
          nullif(p_reason, ''))
  returning id into v_id;

  select count(*) into v_affected from public.appointments a
   where a.practitioner_id = p_practitioner
     and a.status in ('booked', 'confirmed')
     and a.during && (select during from public.time_off where id = v_id);

  perform public._audit(p_practice, 'timeoff.added', 'time_off', v_id,
                        jsonb_build_object('from', p_from, 'to', p_to, 'conflicting_appointments', v_affected));
  return v_id;
end $$;

create or replace function public.practice_timeoff_remove(p_practice uuid, p_timeoff uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist']::public.practice_role[]);
  delete from public.time_off where id = p_timeoff and practice_id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._audit(p_practice, 'timeoff.removed', 'time_off', p_timeoff, '{}');
end $$;

-- ============================================================================
-- §11 Practice — clients and consent (9 procedures)
-- ============================================================================

create or replace function public.practice_clients_list(
  p_practice uuid, p_q text default null, p_limit int default 100, p_offset int default 0)
returns table (client_id uuid, full_name text, phone text, email text,
               consent_record_storage boolean, consent_at timestamptz,
               created_at timestamptz, last_visit timestamptz, next_appointment timestamptz, visits int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select cc.client_id, cc.full_name, cc.phone, cc.email,
         coalesce(cv.granted, false), cv.at, c.created_at,
         agg.last_visit, agg.next_appointment, coalesce(agg.visits, 0)
    from public.clients c
    join public.client_contact_v cc on cc.client_id = c.id
    left join public.client_consent_current_v cv
           on cv.client_id = c.id and cv.purpose = 'record_storage'
    left join lateral (
      select max(a.starts_at) filter (where a.status = 'completed')  as last_visit,
             min(a.starts_at) filter (where a.status in ('booked','confirmed','checked_in')
                                        and a.starts_at > now())     as next_appointment,
             count(*) filter (where a.status = 'completed')::int      as visits
        from public.appointments a where a.client_id = c.id
    ) agg on true
   where c.practice_id = p_practice
     and (coalesce(p_q, '') = '' or cc.full_name ilike '%' || p_q || '%' or cc.phone ilike '%' || p_q || '%')
   order by cc.full_name
   limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

create or replace function public.practice_client_get(p_practice uuid, p_client uuid)
returns table (client_id uuid, user_id uuid, first_name text, last_name text,
               email text, phone text, admin_notes text, created_at timestamptz,
               consent_record_storage boolean, consent_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select c.id, c.user_id, c.first_name, c.last_name,
         coalesce(c.email, u.email), coalesce(c.phone, p.phone), c.admin_notes, c.created_at,
         coalesce(cv.granted, false), cv.at
    from public.clients c
    left join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.client_consent_current_v cv on cv.client_id = c.id and cv.purpose = 'record_storage'
   where c.id = p_client and c.practice_id = p_practice;
end $$;

create or replace function public.practice_client_search(p_practice uuid, p_q text, p_limit int default 6)
returns table (client_id uuid, full_name text, phone text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  if length(coalesce(p_q, '')) < 2 then return; end if;
  return query
  select cc.client_id, cc.full_name, cc.phone, cc.email
    from public.clients c join public.client_contact_v cc on cc.client_id = c.id
   where c.practice_id = p_practice
     and (cc.full_name ilike '%' || p_q || '%' or cc.phone ilike '%' || p_q || '%')
   order by cc.full_name
   limit least(greatest(p_limit, 1), 25);
end $$;

create or replace function public.practice_client_create(
  p_practice uuid, p_first_name text, p_last_name text default '',
  p_phone text default null, p_email text default null, p_consent boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  if coalesce(trim(p_first_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;

  insert into public.clients (practice_id, first_name, last_name, phone, email, consent_record_storage, consent_at)
  values (p_practice, trim(p_first_name), coalesce(trim(p_last_name), ''),
          nullif(p_phone, ''), nullif(p_email, ''), p_consent, case when p_consent then now() end)
  returning id into v_id;

  -- Note: _clients_after_consent_sync_trg inserts the client_consents row if p_consent is true;
  -- if it ran without actor_id, update actor_id to auth.uid()
  if p_consent then
    update public.client_consents
       set actor_id = auth.uid(), channel = 'os'
     where client_id = v_id and purpose = 'record_storage';
  end if;

  perform public._audit(p_practice, 'client.created', 'client', v_id,
                        jsonb_build_object('consent', p_consent));
  return v_id;
end $$;

create or replace function public.practice_client_update(
  p_practice uuid, p_client uuid, p_first_name text, p_last_name text, p_phone text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  if coalesce(trim(p_first_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  update public.clients
     set first_name = trim(p_first_name), last_name = coalesce(trim(p_last_name), ''),
         phone = nullif(p_phone, ''), email = nullif(p_email, '')
   where id = p_client and practice_id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._audit(p_practice, 'client.updated', 'client', p_client, '{}');
end $$;

create or replace function public.practice_client_notes_set(p_practice uuid, p_client uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  update public.clients set admin_notes = nullif(p_notes, '')
   where id = p_client and practice_id = p_practice;
  perform public._audit(p_practice, 'client.notes_updated', 'client', p_client, '{}');
end $$;

create or replace function public.practice_client_consent_grant(
  p_practice uuid, p_client uuid, p_purpose public.consent_purpose, p_evidence jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  insert into public.client_consents (practice_id, client_id, purpose, granted, actor_id, channel, evidence)
  values (p_practice, p_client, p_purpose, true, auth.uid(), 'os', coalesce(p_evidence, '{}'));
  perform public._audit(p_practice, 'client.consent_granted', 'client', p_client,
                        jsonb_build_object('purpose', p_purpose));
end $$;

create or replace function public.practice_client_consent_withdraw(
  p_practice uuid, p_client uuid, p_purpose public.consent_purpose, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  insert into public.client_consents (practice_id, client_id, purpose, granted, actor_id, channel, evidence)
  values (p_practice, p_client, p_purpose, false, auth.uid(), 'os',
          jsonb_build_object('reason', p_reason));
  perform public._audit(p_practice, 'client.consent_withdrawn', 'client', p_client,
                        jsonb_build_object('purpose', p_purpose, 'reason', p_reason));
end $$;

create or replace function public.practice_client_consents_list(p_practice uuid, p_client uuid)
returns table (purpose text, granted boolean, at timestamptz, actor_name text, channel text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select cc.purpose::text, cc.granted, cc.at, coalesce(p.display_name, ''), cc.channel
    from public.client_consents cc
    left join public.profiles p on p.id = cc.actor_id
   where cc.client_id = p_client and cc.practice_id = p_practice
   order by cc.at desc, cc.id desc;
end $$;

-- ============================================================================
-- §12 Practice — appointments (7 procedures)
-- ============================================================================

create or replace function public.practice_appointment_get(p_practice uuid, p_appointment uuid)
returns table (appointment_id uuid, starts_at timestamptz, ends_at timestamptz, status text,
               source text, created_at timestamptz, practitioner_id uuid, practitioner_name text,
               service_id uuid, service_name text, price_cents int, currency text,
               client_id uuid, client_name text, client_phone text, client_email text,
               location_name text, cancel_reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select a.id, a.starts_at, a.ends_at, a.status::text, a.source, a.created_at,
         a.practitioner_id, pt.display_name, a.service_id, s.name, a.price_cents, a.currency,
         cc.client_id, cc.full_name, cc.phone, cc.email, l.name, a.cancel_reason
    from public.appointments a
    join public.practitioners pt on pt.id = a.practitioner_id
    join public.services s on s.id = a.service_id
    join public.client_contact_v cc on cc.client_id = a.client_id
    left join public.locations l on l.id = a.location_id
   where a.id = p_appointment and a.practice_id = p_practice;
end $$;

create or replace function public.practice_appointment_history(p_practice uuid, p_appointment uuid)
returns table (at timestamptz, action text, actor_name text, meta jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select al.at, al.action, coalesce(p.display_name, 'system'), al.meta
    from public.audit_log al
    left join public.profiles p on p.id = al.actor_id
   where al.entity = 'appointment' and al.entity_id = p_appointment and al.practice_id = p_practice
   order by al.at;
end $$;

create or replace function public.practice_appointment_create(
  p_practice uuid, p_practitioner uuid, p_service uuid, p_client uuid,
  p_starts timestamptz, p_source text default 'os', p_location uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_svc public.services; v_cur text; v_id uuid; v_loc uuid;
begin
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  if p_source not in ('os', 'flow') then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_svc from public.services
   where id = p_service and practice_id = p_practice and active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_client is not null and not coalesce(
       (select c.granted from public.client_consents c
         where c.client_id = p_client and c.practice_id = p_practice
           and c.purpose = 'record_storage'
         order by c.at desc, c.id desc limit 1), false) then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  select co.currency into v_cur from public.practices pr
    join public.countries co on co.code = pr.country_code where pr.id = p_practice;
  v_loc := coalesce(p_location, (select id from public.locations
                                  where practice_id = p_practice and is_primary));

  insert into public.appointments (practice_id, practitioner_id, service_id, location_id, client_id,
                                   starts_at, ends_at, buffer_min, price_cents, currency, status, source)
  values (p_practice, p_practitioner, p_service, v_loc, p_client, p_starts,
          p_starts + make_interval(mins => v_svc.duration_min), v_svc.buffer_min,
          v_svc.price_cents, v_cur, 'confirmed', p_source)
  returning id into v_id;

  perform public._audit(p_practice, 'appointment.booked', 'appointment', v_id,
                        jsonb_build_object('source', p_source, 'starts_at', p_starts));
  return v_id;
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;

create or replace function public.practice_appointment_status_set(
  p_practice uuid, p_appointment uuid, p_status public.appointment_status)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.appointment_status; v_client uuid;
begin
  perform public._require_member(p_practice);
  select status, client_id into v_old, v_client from public.appointments
   where id = p_appointment and practice_id = p_practice;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  if not (
    (v_old = 'booked'       and p_status in ('confirmed', 'checked_in', 'cancelled', 'no_show')) or
    (v_old = 'confirmed'    and p_status in ('checked_in', 'cancelled', 'no_show')) or
    (v_old = 'checked_in'   and p_status in ('in_progress', 'completed', 'cancelled', 'no_show')) or
    (v_old = 'in_progress'  and p_status in ('completed', 'cancelled')) or
    (v_old = p_status)
  ) then raise exception 'invalid_transition' using errcode = '22023'; end if;

  update public.appointments set status = p_status where id = p_appointment;

  if p_status = 'checked_in' then
    insert into public.queue_entries (practice_id, appointment_id, client_id, source, status)
    select p_practice, p_appointment, v_client, 'booked', 'waiting'
     where not exists (select 1 from public.queue_entries where appointment_id = p_appointment);
  elsif p_status = 'in_progress' then
    update public.queue_entries set status = 'in_consultation', called_at = coalesce(called_at, now())
     where appointment_id = p_appointment;
  elsif p_status = 'completed' then
    update public.queue_entries set status = 'done', completed_at = now()
     where appointment_id = p_appointment;
  elsif p_status in ('cancelled', 'no_show') then
    update public.queue_entries set status = 'cancelled', completed_at = now()
     where appointment_id = p_appointment and status in ('waiting', 'in_consultation');
  end if;

  perform public._audit(p_practice, 'appointment.status', 'appointment', p_appointment,
                        jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function public.practice_appointment_cancel(
  p_practice uuid, p_appointment uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = nullif(p_reason, '')
   where id = p_appointment and practice_id = p_practice
     and status in ('booked', 'confirmed', 'checked_in');
  if not found then raise exception 'not_cancellable' using errcode = '22023'; end if;
  update public.queue_entries set status = 'cancelled', completed_at = now()
   where appointment_id = p_appointment and status in ('waiting', 'in_consultation');
  perform public._audit(p_practice, 'appointment.cancelled', 'appointment', p_appointment,
                        jsonb_build_object('by', 'practice', 'reason', p_reason));
end $$;

create or replace function public.practice_appointment_reschedule(
  p_practice uuid, p_appointment uuid, p_new_starts timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_old timestamptz; v_dur int;
begin
  perform public._require_member(p_practice);
  select a.starts_at, s.duration_min into v_old, v_dur
    from public.appointments a join public.services s on s.id = a.service_id
   where a.id = p_appointment and a.practice_id = p_practice;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update public.appointments
     set starts_at = p_new_starts,
         ends_at = p_new_starts + make_interval(mins => v_dur),
         reminder_sent_at = null
   where id = p_appointment;

  perform public._audit(p_practice, 'appointment.rescheduled', 'appointment', p_appointment,
                        jsonb_build_object('from', v_old, 'to', p_new_starts, 'by', 'practice'));
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;

create or replace function public.practice_appointment_slots(
  p_practice uuid, p_practitioner uuid, p_service uuid, p_day date)
returns table (starts_at timestamptz) language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query select g.starts_at from public.get_available_slots(p_practitioner, p_service, p_day, p_day) g;
end $$;

-- ============================================================================
-- §13 Practice — queue (Flow) (5 procedures)
-- ============================================================================

create or replace function public.practice_queue_list(p_practice uuid, p_window_hours int default 6)
returns table (entry_id uuid, display_name text, phone text, status text, urgency text,
               source text, joined_at timestamptz, called_at timestamptz,
               completed_at timestamptz, appointment_id uuid, seq bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select q.id, q.display_name, q.phone, q.status::text, q.urgency, q.source,
         q.joined_at, q.called_at, q.completed_at, q.appointment_id, q.seq
    from public.queue_entry_display_v q
   where q.practice_id = p_practice
     and (q.status in ('waiting', 'in_consultation')
          or q.completed_at > now() - make_interval(hours => least(greatest(p_window_hours, 1), 24)))
   order by q.seq;
end $$;

create or replace function public.practice_queue_walkin_add(
  p_practice uuid, p_name text, p_phone text default null,
  p_urgency text default 'routine', p_client uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_member(p_practice);
  if p_client is null and coalesce(trim(p_name), '') = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.queue_entries (practice_id, client_id, walkin_name, walkin_phone, urgency, source)
  values (p_practice, p_client,
          case when p_client is null then trim(p_name) end,
          case when p_client is null then nullif(p_phone, '') end,
          p_urgency, 'reception')
  returning id into v_id;

  perform public._audit(p_practice, 'queue.walkin_added', 'queue_entry', v_id,
                        jsonb_build_object('urgency', p_urgency, 'linked_client', p_client is not null));
  return v_id;
end $$;

create or replace function public.practice_queue_status_set(
  p_practice uuid, p_entry uuid, p_status public.queue_status)
returns void language plpgsql security definer set search_path = public as $$
declare v_appt uuid; v_old public.queue_status;
begin
  perform public._require_member(p_practice);
  select status, appointment_id into v_old, v_appt from public.queue_entries
   where id = p_entry and practice_id = p_practice;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update public.queue_entries
     set status = p_status,
         called_at    = case when p_status = 'in_consultation' then coalesce(called_at, now()) else called_at end,
         completed_at = case when p_status in ('done', 'cancelled') then now() else completed_at end
   where id = p_entry;

  if v_appt is not null then
    if    p_status = 'in_consultation' then
      update public.appointments set status = 'in_progress' where id = v_appt and status = 'checked_in';
    elsif p_status = 'done' then
      update public.appointments set status = 'completed'   where id = v_appt and status in ('checked_in','in_progress');
    elsif p_status = 'cancelled' then
      update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
       where id = v_appt and status in ('booked','confirmed','checked_in');
    end if;
  end if;

  perform public._audit(p_practice, 'queue.status', 'queue_entry', p_entry,
                        jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function public.practice_queue_call_next(p_practice uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_member(p_practice);
  select id into v_id from public.queue_entries
   where practice_id = p_practice and status = 'waiting'
   order by case urgency when 'urgent' then 0 when 'soon' then 1 else 2 end, seq
   limit 1 for update skip locked;
  if v_id is null then return null; end if;
  perform public.practice_queue_status_set(p_practice, v_id, 'in_consultation');
  return v_id;
end $$;

create or replace function public.practice_queue_link_client(p_practice uuid, p_entry uuid, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  update public.queue_entries
     set client_id = p_client, walkin_name = null, walkin_phone = null
   where id = p_entry and practice_id = p_practice;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._audit(p_practice, 'queue.client_linked', 'queue_entry', p_entry,
                        jsonb_build_object('client_id', p_client));
end $$;

-- ============================================================================
-- §14 Practice — settings, locations, onboarding (7 procedures)
-- ============================================================================

create or replace function public.practice_create(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;

  insert into public.practices (name, slug, status) values (trim(p_name), p_slug, 'pending')
  returning id into v_id;

  insert into public.practice_members (practice_id, user_id, role)
  values (v_id, auth.uid(), 'practice_owner');

  insert into public.practice_status_events (practice_id, status, actor_id, reason)
  values (v_id, 'pending', auth.uid(), 'created');

  perform public._audit(v_id, 'practice.created', 'practice', v_id, jsonb_build_object('slug', p_slug));
  return v_id;
end $$;

create or replace function public.practice_onboard(
  p_name text, p_slug text, p_city_id uuid, p_address text,
  p_practitioner_name text, p_title text, p_speciality_slug text, p_bio text, p_languages text[],
  p_service_name text, p_duration_min int, p_buffer_min int, p_price_cents int,
  p_weekdays int[], p_start text, p_end text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_practice uuid; v_practitioner uuid; v_service uuid;
begin
  v_practice := public.practice_create(p_name, p_slug);

  insert into public.locations (practice_id, name, address, city_id, is_primary)
  values (v_practice, 'Main rooms', nullif(p_address, ''), p_city_id, true);

  v_practitioner := public.practice_practitioner_create(
    v_practice, p_practitioner_name, p_title, p_speciality_slug, p_bio, p_languages, auth.uid());

  v_service := public.practice_service_upsert(
    v_practice, null, p_service_name, null, p_duration_min, p_buffer_min, p_price_cents, true);

  insert into public.practitioner_services (practitioner_id, service_id, practice_id)
  values (v_practitioner, v_service, v_practice);

  perform public.practice_availability_apply_pattern(
    v_practice, v_practitioner, p_weekdays, p_start, p_end, null);

  perform public._audit(v_practice, 'practice.onboarded', 'practice', v_practice, '{}');
  return v_practice;
end $$;

create or replace function public.practice_settings_get(p_practice uuid)
returns table (practice_id uuid, name text, slug text, status text, timezone text,
               country_code text, currency text, min_notice_minutes int,
               cancellation_notice_hours int, city text, province text, address text,
               primary_location_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select p.id, p.name, p.slug, p.status, p.timezone, p.country_code, co.currency,
         p.min_notice_minutes, p.cancellation_notice_hours,
         pv.city, pv.province, pv.address, pv.location_id
    from public.practices p
    join public.countries co on co.code = p.country_code
    left join public.practice_place_v pv on pv.practice_id = p.id
   where p.id = p_practice;
end $$;

create or replace function public.practice_settings_update(
  p_practice uuid, p_name text, p_timezone text,
  p_min_notice_minutes int, p_cancellation_notice_hours int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_min_notice_minutes < 0 or p_cancellation_notice_hours < 0 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  update public.practices
     set name = trim(p_name), timezone = p_timezone,
         min_notice_minutes = p_min_notice_minutes,
         cancellation_notice_hours = p_cancellation_notice_hours
   where id = p_practice;
  perform public._audit(p_practice, 'practice.settings_updated', 'practice', p_practice,
                        jsonb_build_object('min_notice_minutes', p_min_notice_minutes,
                                           'cancellation_notice_hours', p_cancellation_notice_hours));
end $$;

create or replace function public.practice_locations_list(p_practice uuid)
returns table (location_id uuid, name text, address text, city_id uuid, city text,
               province text, is_primary boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return query
  select l.id, l.name, l.address, l.city_id, c.name, pv.name, l.is_primary
    from public.locations l
    left join public.cities c on c.id = l.city_id
    left join public.provinces pv on pv.code = c.province_code
   where l.practice_id = p_practice
   order by l.is_primary desc, l.name;
end $$;

create or replace function public.practice_location_upsert(
  p_practice uuid, p_location uuid, p_name text, p_address text,
  p_city_id uuid, p_is_primary boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if p_is_primary then
    update public.locations set is_primary = false
     where practice_id = p_practice and (p_location is null or id <> p_location);
  end if;

  if p_location is null then
    insert into public.locations (practice_id, name, address, city_id, is_primary)
    values (p_practice, coalesce(nullif(trim(p_name), ''), 'Main rooms'),
            nullif(p_address, ''), p_city_id,
            p_is_primary or not exists (select 1 from public.locations where practice_id = p_practice))
    returning id into v_id;
  else
    update public.locations
       set name = coalesce(nullif(trim(p_name), ''), name), address = nullif(p_address, ''),
           city_id = p_city_id, is_primary = p_is_primary
     where id = p_location and practice_id = p_practice
     returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;

  perform public._audit(p_practice, 'location.saved', 'location', v_id, '{}');
  return v_id;
end $$;

create or replace function public.practice_location_remove(p_practice uuid, p_location uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if (select is_primary from public.locations where id = p_location and practice_id = p_practice) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.locations where id = p_location and practice_id = p_practice;
  perform public._audit(p_practice, 'location.removed', 'location', p_location, '{}');
end $$;

-- ============================================================================
-- §15 Growth (16 procedures)
-- ============================================================================

create or replace function public.growth_services_list()
returns table (service_id uuid, slug text, name text, description text)
language sql stable security definer set search_path = public as $$
  select id, slug, name, description from public.marketing_services where active order by name;
$$;

create or replace function public.growth_requests_list(p_practice uuid)
returns table (request_id uuid, title text, service_name text, status text,
               updated_at timestamptz, pending_approvals int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  return query
  select r.id, r.title, s.name, r.status::text, r.updated_at,
         (select count(*)::int from public.marketing_approvals a
           where a.request_id = r.id and a.status = 'pending')
    from public.marketing_requests r
    join public.marketing_services s on s.id = r.service_id
   where r.practice_id = p_practice
   order by r.updated_at desc;
end $$;

create or replace function public.growth_request_create(
  p_practice uuid, p_service uuid, p_title text, p_brief text,
  p_budget_min_cents int default null, p_budget_max_cents int default null, p_deadline date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._require_role(p_practice, array['practice_owner']::public.practice_role[]);
  if char_length(coalesce(trim(p_title), '')) not between 3 and 160 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  insert into public.marketing_requests (practice_id, service_id, created_by, title, brief,
                                         budget_min_cents, budget_max_cents, deadline)
  values (p_practice, p_service, auth.uid(), trim(p_title), p_brief,
          p_budget_min_cents, p_budget_max_cents, p_deadline)
  returning id into v_id;
  perform public._audit(p_practice, 'growth.request_created', 'marketing_request', v_id, '{}');
  return v_id;
end $$;

create or replace function public.growth_request_get(p_request uuid)
returns table (request_id uuid, practice_id uuid, practice_name text, service_name text,
               created_by uuid, title text, brief text, budget_min_cents int, budget_max_cents int,
               deadline date, status text, assigned_to uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v public.marketing_requests;
begin
  v := public._require_request_access(p_request, false);
  return query
  select r.id, r.practice_id, pr.name, s.name, r.created_by, r.title, r.brief,
         r.budget_min_cents, r.budget_max_cents, r.deadline, r.status::text,
         r.assigned_to, r.created_at, r.updated_at
    from public.marketing_requests r
    join public.practices pr on pr.id = r.practice_id
    join public.marketing_services s on s.id = r.service_id
   where r.id = p_request;
end $$;

create or replace function public.growth_request_status_set(p_request uuid, p_status public.marketing_status)
returns void language plpgsql security definer set search_path = public as $$
declare v public.marketing_requests; v_is_op boolean := public.is_marketing_operator();
begin
  v := public._require_request_access(p_request, false);

  if not (
    (v.status = 'draft'             and p_status = 'submitted'          and not v_is_op) or
    (v.status = 'submitted'         and p_status in ('in_review','declined')   and v_is_op) or
    (v.status = 'in_review'         and p_status in ('proposal_sent','declined') and v_is_op) or
    (v.status = 'proposal_sent'     and p_status in ('approved','declined') and not v_is_op) or
    (v.status = 'approved'          and p_status = 'in_progress'        and v_is_op) or
    (v.status = 'in_progress'       and p_status = 'awaiting_approval'  and v_is_op) or
    (v.status = 'awaiting_approval' and p_status in ('in_progress','delivered') and v_is_op) or
    (v.status = 'delivered'         and p_status = 'closed')
  ) then raise exception 'invalid_transition' using errcode = '22023'; end if;

  update public.marketing_requests
     set status = p_status, updated_at = now(),
         assigned_to = case when p_status = 'in_review' and assigned_to is null
                            then auth.uid() else assigned_to end
   where id = p_request;

  perform public._audit(v.practice_id, 'growth.status', 'marketing_request', p_request,
                        jsonb_build_object('from', v.status, 'to', p_status, 'by',
                                           case when v_is_op then 'operator' else 'owner' end));
end $$;

create or replace function public.growth_updates_list(p_request uuid)
returns table (update_id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_request_access(p_request, false);
  return query
  select u.id, u.author_id, coalesce(p.display_name, ''), u.body, u.created_at
    from public.campaign_updates u
    left join public.profiles p on p.id = u.author_id
   where u.request_id = p_request
   order by u.created_at;
end $$;

create or replace function public.growth_update_post(p_request uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.marketing_requests; v_id uuid;
begin
  v := public._require_request_access(p_request, false);
  if v.status = 'draft' then raise exception 'not_editable' using errcode = '42501'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  insert into public.campaign_updates (request_id, author_id, body)
  values (p_request, auth.uid(), trim(p_body)) returning id into v_id;
  update public.marketing_requests set updated_at = now() where id = p_request;
  return v_id;
end $$;

create or replace function public.growth_approvals_list(p_request uuid)
returns table (approval_id uuid, item text, status text, comment text,
               decided_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_request_access(p_request, false);
  return query
  select a.id, a.item, a.status, a.comment, a.decided_at, a.created_at
    from public.marketing_approvals a where a.request_id = p_request order by a.created_at;
end $$;

create or replace function public.growth_approval_add(p_request uuid, p_item text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_marketing_operator() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public._require_request_access(p_request, false);
  insert into public.marketing_approvals (request_id, item) values (p_request, p_item) returning id into v_id;
  return v_id;
end $$;

create or replace function public.growth_approval_decide(
  p_approval uuid, p_status text, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_request uuid; v_practice uuid;
begin
  if p_status not in ('approved', 'changes_requested') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select a.request_id, r.practice_id into v_request, v_practice
    from public.marketing_approvals a join public.marketing_requests r on r.id = a.request_id
   where a.id = p_approval;
  if v_request is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_practice_role(v_practice, array['practice_owner']::public.practice_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.marketing_approvals
     set status = p_status, comment = nullif(p_comment, ''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_approval;

  perform public._audit(v_practice, 'growth.approval_decided', 'marketing_approval', p_approval,
                        jsonb_build_object('status', p_status, 'request_id', v_request));
end $$;

create or replace function public.growth_assets_list(p_request uuid)
returns table (asset_id uuid, kind text, file_name text, mime text,
               size_bytes int, created_at timestamptz, uploaded_by uuid, uploader_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_request_access(p_request, false);
  return query
  select a.id, a.kind, a.file_name, a.mime, a.size_bytes, a.created_at,
         a.uploaded_by, coalesce(p.display_name, '')
    from public.marketing_assets a
    left join public.profiles p on p.id = a.uploaded_by
   where a.request_id = p_request order by a.created_at;
end $$;

create or replace function public.growth_asset_add(
  p_request uuid, p_kind text, p_file_name text, p_mime text, p_size_bytes int, p_content bytea)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.marketing_requests; v_id uuid;
begin
  v := public._require_request_access(p_request, false);
  if p_kind not in ('brief_asset', 'deliverable') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'deliverable' and not public.is_marketing_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if octet_length(p_content) > 5242880 then
    raise exception 'asset_too_large' using errcode = '22023';
  end if;

  insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, mime, size_bytes, content)
  values (p_request, auth.uid(), p_kind, p_file_name, p_mime, p_size_bytes, p_content)
  returning id into v_id;

  perform public._audit(v.practice_id, 'growth.asset_added', 'marketing_asset', v_id,
                        jsonb_build_object('kind', p_kind, 'size_bytes', p_size_bytes));
  return v_id;
end $$;

drop function if exists public.growth_asset_download(uuid);

create or replace function public.growth_asset_download(p_asset uuid)
returns table (file_name text, mime text, content bytea)
language plpgsql stable security definer set search_path = public as $$
declare v_request uuid;
begin
  select a.request_id into v_request from public.marketing_assets a where a.id = p_asset;
  if v_request is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_request_access(v_request, false);
  return query
  select a.file_name, a.mime, a.content from public.marketing_assets a where a.id = p_asset;
end $$;

create or replace function public.growth_reports_list(p_request uuid)
returns table (report_id uuid, period text, summary text, created_at timestamptz,
               metric_key text, metric_label text, metric_unit text, metric_value numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_request_access(p_request, false);
  return query
  select r.id, r.period, r.summary, r.created_at, m.key, m.label, m.unit, rm.value
    from public.campaign_reports r
    left join public.campaign_report_metrics rm on rm.report_id = r.id
    left join public.metric_definitions m on m.key = rm.metric_key
   where r.request_id = p_request
   order by r.created_at desc, m.label;
end $$;

create or replace function public.growth_report_create(
  p_request uuid, p_period text, p_summary text, p_metrics jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.marketing_requests; v_id uuid; v_key text;
begin
  v := public._require_request_access(p_request, false);
  if not public.is_marketing_operator() then raise exception 'forbidden' using errcode = '42501'; end if;

  insert into public.campaign_reports (request_id, period, summary, created_by)
  values (p_request, p_period, p_summary, auth.uid()) returning id into v_id;

  for v_key in select jsonb_object_keys(coalesce(p_metrics, '{}')) loop
    if not exists (select 1 from public.metric_definitions where key = v_key and active) then
      raise exception 'metric_unknown: %', v_key using errcode = '23503';
    end if;
    insert into public.campaign_report_metrics (report_id, metric_key, value)
    values (v_id, v_key, (p_metrics ->> v_key)::numeric);
  end loop;

  perform public._audit(v.practice_id, 'growth.report_created', 'campaign_report', v_id,
                        jsonb_build_object('period', p_period));
  return v_id;
end $$;

create or replace function public.growth_inbox(p_status text default null)
returns table (request_id uuid, practice_name text, service_name text, title text,
               status text, deadline date, updated_at timestamptz, assigned_to uuid, pending_approvals int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_marketing_operator() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select r.id, pr.name, s.name, r.title, r.status::text, r.deadline, r.updated_at, r.assigned_to,
         (select count(*)::int from public.marketing_approvals a
           where a.request_id = r.id and a.status = 'pending')
    from public.marketing_requests r
    join public.practices pr on pr.id = r.practice_id
    join public.marketing_services s on s.id = r.service_id
   where r.status <> 'draft'
     and (p_status is null or r.status::text = p_status)
   order by r.updated_at desc;
end $$;

-- ============================================================================
-- §16 Platform admin (5 procedures)
-- ============================================================================

create or replace function public.platform_overview()
returns table (kind text, id uuid, practice_id uuid, practice_name text, label text,
               detail text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select 'practice'::text, p.id, p.id, p.name, p.name, coalesce(pv.city, ''), p.status, p.created_at
    from public.practices p left join public.practice_place_v pv on pv.practice_id = p.id
  union all
  select 'practitioner'::text, pt.id, pt.practice_id, p.name, pt.display_name,
         coalesce(string_agg(cb.code || ' ' || r.registration_number, ', '), ''),
         pt.verification_status, pt.created_at
    from public.practitioners pt
    join public.practices p on p.id = pt.practice_id
    left join public.practitioner_registrations r on r.practitioner_id = pt.id
    left join public.council_bodies cb on cb.code = r.body_code
   group by pt.id, pt.practice_id, p.name, pt.display_name, pt.verification_status, pt.created_at
   order by created_at desc;
end $$;

create or replace function public.platform_audit_log(
  p_practice uuid default null, p_limit int default 100, p_before timestamptz default null)
returns table (id bigint, at timestamptz, action text, entity text, entity_id uuid,
               actor_name text, practice_name text, meta jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select a.id, a.at, a.action, a.entity, a.entity_id,
         coalesce(p.display_name, 'system'), coalesce(pr.name, ''), a.meta
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
    left join public.practices pr on pr.id = a.practice_id
   where (p_practice is null or a.practice_id = p_practice)
     and (p_before is null or a.at < p_before)
   order by a.at desc
   limit least(greatest(p_limit, 1), 500);
end $$;

create or replace function public.platform_role_grant(p_email text, p_role public.platform_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.platform_roles (user_id, role) values (v_user, p_role)
  on conflict (user_id) do update set role = excluded.role;
  perform public._audit(null, 'platform.role_granted', 'platform_role', v_user,
                        jsonb_build_object('role', p_role, 'email', p_email));
end $$;

create or replace function public.platform_practice_status_set(
  p_practice uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('pending', 'active', 'suspended') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select status into v_old from public.practices where id = p_practice;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  insert into public.practice_status_events (practice_id, status, actor_id, reason)
  values (p_practice, p_status, auth.uid(), nullif(p_reason, ''));
  update public.practices set status = p_status where id = p_practice;

  perform public._audit(p_practice, 'practice.status', 'practice', p_practice,
                        jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
end $$;

create or replace function public.platform_verification_set(
  p_practitioner uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_practice uuid; v_old text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('unverified', 'pending', 'verified', 'rejected') then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;
  select practice_id, verification_status into v_practice, v_old
    from public.practitioners where id = p_practitioner;
  if v_practice is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  insert into public.practitioner_verifications
         (practice_id, practitioner_id, status, decided_by, note)
  values (v_practice, p_practitioner, p_status, auth.uid(), nullif(p_note, ''));

  perform public._audit(v_practice, 'practitioner.verification', 'practitioner', p_practitioner,
                        jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
end $$;

-- ============================================================================
-- §18 Grants — zero PUBLIC execute grants in schema public
-- ============================================================================

alter default privileges in schema public revoke execute on functions from public;
revoke execute on all functions in schema public from public;

-- Re-grant execute to anon, authenticated on extension functions (btree_gist, pgcrypto) and range constructors
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname in ('timerange', 'timemultirange')
            or exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'))
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;

-- Brand resolver (anon only, used pre-auth by BrandRegistry)
grant execute on function public.resolve_brand(text) to anon;

-- Internal helpers / RLS policy functions needed when policies evaluate under anon/authenticated
grant execute on function public.appointment_span(timestamptz, timestamptz, int) to anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_marketing_operator() to anon, authenticated;
grant execute on function public.is_member(uuid) to anon, authenticated;
grant execute on function public.has_practice_role(uuid, public.practice_role[]) to anon, authenticated;
grant execute on function public.can_see_marketing_request(uuid) to anon, authenticated;

-- 10 public_* procedures -> anon, authenticated
grant execute on function public.public_practitioner_search(text, text, text, boolean, int, int) to anon, authenticated;
grant execute on function public.public_practitioner_get(uuid) to anon, authenticated;
grant execute on function public.public_practitioner_services(uuid) to anon, authenticated;
grant execute on function public.public_slots_list(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.public_city_list() to anon, authenticated;
grant execute on function public.public_speciality_list() to anon, authenticated;
grant execute on function public.public_queue_info(text) to anon, authenticated;
grant execute on function public.public_queue_join(text, text, text, text) to anon, authenticated;
grant execute on function public.public_queue_status(text) to anon, authenticated;
grant execute on function public.public_queue_leave(text) to anon, authenticated;

-- 13 patient_* procedures -> authenticated ONLY
grant execute on function public.patient_profile_get() to authenticated;
grant execute on function public.patient_profile_update(text, text) to authenticated;
grant execute on function public.patient_appointments_list(text) to authenticated;
grant execute on function public.patient_appointment_get(uuid) to authenticated;
grant execute on function public.patient_slot_hold(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.patient_hold_get(uuid) to authenticated;
grant execute on function public.patient_hold_release(uuid) to authenticated;
grant execute on function public.patient_appointment_book(uuid) to authenticated;
grant execute on function public.patient_appointment_cancel(uuid, text) to authenticated;
grant execute on function public.patient_appointment_reschedule(uuid, timestamptz) to authenticated;
grant execute on function public.patient_appointment_check_in(uuid) to authenticated;
grant execute on function public.patient_account_export() to authenticated;
grant execute on function public.patient_account_delete() to authenticated;

-- 62 practice_* procedures -> authenticated ONLY
grant execute on function public.practice_dashboard_get(uuid) to authenticated;
grant execute on function public.practice_insights_get(uuid, int) to authenticated;
grant execute on function public.practice_setup_progress(uuid) to authenticated;
grant execute on function public.practice_calendar_appointments(uuid, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.practice_calendar_availability(uuid) to authenticated;
grant execute on function public.practice_calendar_timeoff(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.practice_queue_preview(uuid, int) to authenticated;
grant execute on function public.practice_queue_waiting_count(uuid) to authenticated;
grant execute on function public.practice_recent_app_bookings(uuid, int, int) to authenticated;
grant execute on function public.practice_memberships_list() to authenticated;
grant execute on function public.practice_practitioners_list(uuid) to authenticated;
grant execute on function public.practice_practitioner_create(uuid, text, text, text, text, text[], uuid) to authenticated;
grant execute on function public.practice_practitioner_update(uuid, uuid, text, text, text, text, text[], text) to authenticated;
grant execute on function public.practice_practitioner_services_list(uuid, uuid) to authenticated;
grant execute on function public.practice_practitioner_services_set(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.practice_registrations_list(uuid, uuid) to authenticated;
grant execute on function public.practice_registration_submit(uuid, uuid, text, text) to authenticated;
grant execute on function public.practice_verifications_list(uuid, uuid) to authenticated;
grant execute on function public.practice_team_list(uuid) to authenticated;
grant execute on function public.practice_member_add(uuid, text, public.practice_role) to authenticated;
grant execute on function public.practice_member_role_set(uuid, uuid, public.practice_role) to authenticated;
grant execute on function public.practice_member_remove(uuid, uuid) to authenticated;
grant execute on function public.practice_services_list(uuid, boolean) to authenticated;
grant execute on function public.practice_service_upsert(uuid, uuid, text, text, int, int, int, boolean) to authenticated;
grant execute on function public.practice_service_practitioners_set(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.practice_service_practitioners_list(uuid, uuid) to authenticated;
grant execute on function public.practice_service_deactivate(uuid, uuid) to authenticated;
grant execute on function public.practice_availability_list(uuid, uuid) to authenticated;
grant execute on function public.practice_availability_set(uuid, uuid, int[], text[], text[], uuid) to authenticated;
grant execute on function public.practice_availability_apply_pattern(uuid, uuid, int[], text, text, uuid) to authenticated;
grant execute on function public.practice_timeoff_list(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.practice_timeoff_add(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.practice_timeoff_remove(uuid, uuid) to authenticated;
grant execute on function public.practice_clients_list(uuid, text, int, int) to authenticated;
grant execute on function public.practice_client_get(uuid, uuid) to authenticated;
grant execute on function public.practice_client_search(uuid, text, int) to authenticated;
grant execute on function public.practice_client_create(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.practice_client_update(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.practice_client_notes_set(uuid, uuid, text) to authenticated;
grant execute on function public.practice_client_consent_grant(uuid, uuid, public.consent_purpose, jsonb) to authenticated;
grant execute on function public.practice_client_consent_withdraw(uuid, uuid, public.consent_purpose, text) to authenticated;
grant execute on function public.practice_client_consents_list(uuid, uuid) to authenticated;
grant execute on function public.practice_appointment_get(uuid, uuid) to authenticated;
grant execute on function public.practice_appointment_history(uuid, uuid) to authenticated;
grant execute on function public.practice_appointment_create(uuid, uuid, uuid, uuid, timestamptz, text, uuid) to authenticated;
grant execute on function public.practice_appointment_status_set(uuid, uuid, public.appointment_status) to authenticated;
grant execute on function public.practice_appointment_cancel(uuid, uuid, text) to authenticated;
grant execute on function public.practice_appointment_reschedule(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.practice_appointment_slots(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.practice_queue_list(uuid, int) to authenticated;
grant execute on function public.practice_queue_walkin_add(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.practice_queue_status_set(uuid, uuid, public.queue_status) to authenticated;
grant execute on function public.practice_queue_call_next(uuid) to authenticated;
grant execute on function public.practice_queue_link_client(uuid, uuid, uuid) to authenticated;
grant execute on function public.practice_create(text, text) to authenticated;
grant execute on function public.practice_onboard(text, text, uuid, text, text, text, text, text, text[], text, int, int, int, int[], text, text) to authenticated;
grant execute on function public.practice_settings_get(uuid) to authenticated;
grant execute on function public.practice_settings_update(uuid, text, text, int, int) to authenticated;
grant execute on function public.practice_locations_list(uuid) to authenticated;
grant execute on function public.practice_location_upsert(uuid, uuid, text, text, uuid, boolean) to authenticated;
grant execute on function public.practice_location_remove(uuid, uuid) to authenticated;

-- 16 growth_* procedures -> authenticated ONLY
grant execute on function public.growth_services_list() to authenticated;
grant execute on function public.growth_requests_list(uuid) to authenticated;
grant execute on function public.growth_request_create(uuid, uuid, text, text, int, int, date) to authenticated;
grant execute on function public.growth_request_get(uuid) to authenticated;
grant execute on function public.growth_request_status_set(uuid, public.marketing_status) to authenticated;
grant execute on function public.growth_updates_list(uuid) to authenticated;
grant execute on function public.growth_update_post(uuid, text) to authenticated;
grant execute on function public.growth_approvals_list(uuid) to authenticated;
grant execute on function public.growth_approval_add(uuid, text) to authenticated;
grant execute on function public.growth_approval_decide(uuid, text, text) to authenticated;
grant execute on function public.growth_assets_list(uuid) to authenticated;
grant execute on function public.growth_asset_add(uuid, text, text, text, int, bytea) to authenticated;
grant execute on function public.growth_asset_download(uuid) to authenticated;
grant execute on function public.growth_reports_list(uuid) to authenticated;
grant execute on function public.growth_report_create(uuid, text, text, jsonb) to authenticated;
grant execute on function public.growth_inbox(text) to authenticated;

-- 6 platform_* procedures (1 in §7 + 5 in §16) -> authenticated ONLY
grant execute on function public.platform_my_role() to authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_audit_log(uuid, int, timestamptz) to authenticated;
grant execute on function public.platform_role_grant(text, public.platform_role) to authenticated;
grant execute on function public.platform_practice_status_set(uuid, text, text) to authenticated;
grant execute on function public.platform_verification_set(uuid, text, text) to authenticated;

-- Legacy pre-Stage-3 functions kept for PGlite test suite compatibility
grant execute on function public.get_available_slots(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.search_practitioners(text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.join_queue(text, text, text, text) to anon, authenticated;
grant execute on function public.get_queue_status(text) to anon, authenticated;
grant execute on function public.leave_queue(text) to anon, authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.hold_slot(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.book_appointment(uuid) to authenticated;
grant execute on function public.staff_create_appointment(uuid, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.create_practice(text, text) to authenticated;
grant execute on function public.activate_practice(uuid, text) to authenticated;
grant execute on function public.set_verification(uuid, text) to authenticated;
grant execute on function public.marketing_set_status(uuid, public.marketing_status) to authenticated;
grant execute on function public.decide_approval(uuid, text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.check_in_appointment(uuid) to authenticated;
grant execute on function public.set_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.queue_add_walkin(uuid, text, text, text) to authenticated;
grant execute on function public.queue_set_status(uuid, public.queue_status) to authenticated;
grant execute on function public.add_practice_member_by_email(uuid, text, public.practice_role) to authenticated;
grant execute on function public.remove_practice_member(uuid, uuid) to authenticated;
grant execute on function public.practice_team(uuid) to authenticated;
grant execute on function public.submit_verification(uuid, text, text) to authenticated;
grant execute on function public.grant_platform_role(text, public.platform_role) to authenticated;
grant execute on function public.my_platform_role() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.marketing_inbox() to authenticated;
grant execute on function public.practice_stats(uuid) to authenticated;
grant execute on function public.practice_insights(uuid, int) to authenticated;
grant execute on function public.release_hold(uuid) to authenticated;
grant execute on function public.appointment_history(uuid) to authenticated;
