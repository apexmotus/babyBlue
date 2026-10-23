-- BabyBlue core schema (PostgreSQL / Supabase)
-- Tenant isolation is enforced twice: composite foreign keys keep child rows inside their own practice,
-- and row-level security (0003) keeps users inside the practices they belong to.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ───────────────────────── identity & roles ─────────────────────────
create type public.practice_role  as enum ('practice_owner', 'practitioner', 'receptionist', 'staff');
create type public.platform_role  as enum ('platform_admin', 'marketing_operator');
create type public.appointment_status as enum ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.queue_status as enum ('waiting', 'in_consultation', 'done', 'cancelled');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone        text,
  created_at   timestamptz not null default now()
);

-- Platform-level roles. "Consumer" is any signed-in user; practice roles live in practice_members.
create table public.platform_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    public.platform_role not null
);

-- ───────────────────────── practices ─────────────────────────
create table public.practices (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (char_length(name) between 2 and 120),
  slug                      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status                    text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  timezone                  text not null default 'Africa/Johannesburg',
  province                  text,
  min_notice_minutes        int  not null default 60  check (min_notice_minutes >= 0),
  cancellation_notice_hours int  not null default 24  check (cancellation_notice_hours >= 0),
  created_at                timestamptz not null default now()
);

create table public.practice_members (
  practice_id uuid not null references public.practices (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.practice_role not null,
  created_at  timestamptz not null default now(),
  primary key (practice_id, user_id)
);
create index on public.practice_members (user_id);

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  name        text not null,
  address     text,
  city        text,
  province    text,
  unique (id, practice_id)
);

-- ───────────────────────── practitioners & services ─────────────────────────
create table public.practitioners (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references public.practices (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete set null,
  display_name        text not null,
  title               text,
  speciality          text not null,
  bio                 text,
  languages           text[] not null default '{}',
  -- A verified badge is only ever shown when verification_status = 'verified'. Set by platform admins only (see 0003).
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         timestamptz,
  verified_by         uuid references auth.users (id),
  listing_status      text not null default 'draft' check (listing_status in ('draft', 'listed', 'hidden')),
  created_at          timestamptz not null default now(),
  unique (id, practice_id),
  check (verification_status <> 'verified' or verified_at is not null)
);
create index on public.practitioners (practice_id);

-- Registration numbers are kept off the public table.
create table public.practitioner_registrations (
  practitioner_id     uuid primary key references public.practitioners (id) on delete cascade,
  body                text not null,   -- e.g. HPCSA, SANC, SAPC, SADA
  registration_number text not null,
  submitted_at        timestamptz not null default now(),
  unique (body, registration_number)
);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references public.practices (id) on delete cascade,
  name         text not null,
  description  text,
  duration_min int  not null check (duration_min between 5 and 480),
  buffer_min   int  not null default 0 check (buffer_min between 0 and 120),
  price_cents  int  check (price_cents >= 0),
  currency     text not null default 'ZAR',
  active       boolean not null default true,
  unique (id, practice_id)
);

create table public.practitioner_services (
  practitioner_id uuid not null,
  service_id      uuid not null,
  practice_id     uuid not null,
  primary key (practitioner_id, service_id),
  foreign key (practitioner_id, practice_id) references public.practitioners (id, practice_id) on delete cascade,
  foreign key (service_id, practice_id)      references public.services (id, practice_id)      on delete cascade
);

-- ───────────────────────── availability ─────────────────────────
create table public.availability_rules (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  practitioner_id uuid not null,
  location_id     uuid,
  weekday         smallint not null check (weekday between 0 and 6),  -- 0 = Monday
  start_time      time not null,
  end_time        time not null,
  check (end_time > start_time),
  foreign key (practitioner_id, practice_id) references public.practitioners (id, practice_id) on delete cascade,
  foreign key (location_id, practice_id)     references public.locations (id, practice_id)
);
create index on public.availability_rules (practitioner_id, weekday);

create table public.time_off (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  practitioner_id uuid not null,
  during          tstzrange not null,
  reason          text,
  foreign key (practitioner_id, practice_id) references public.practitioners (id, practice_id) on delete cascade
);
create index on public.time_off using gist (practitioner_id, during);

-- ───────────────────────── clients & appointments ─────────────────────────
create table public.clients (
  id                      uuid primary key default gen_random_uuid(),
  practice_id             uuid not null references public.practices (id) on delete cascade,
  user_id                 uuid references auth.users (id) on delete set null,  -- linked consumer account, if any
  first_name              text not null,
  last_name               text not null default '',
  email                   text,
  phone                   text,
  consent_record_storage  boolean not null default false,
  consent_at              timestamptz,
  admin_notes             text,   -- administrative only; not a clinical record
  created_at              timestamptz not null default now(),
  unique (id, practice_id)
);
create unique index clients_practice_user on public.clients (practice_id, user_id) where user_id is not null;

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  practitioner_id uuid not null,
  service_id      uuid not null,
  location_id     uuid,
  client_id       uuid not null,
  consumer_id     uuid references auth.users (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  buffer_min      int not null default 0,
  -- The range that blocks the practitioner's diary: appointment plus buffer.
  during          tstzrange not null,
  status          public.appointment_status not null default 'confirmed',
  source          text not null default 'app' check (source in ('app', 'os', 'flow')),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users (id),
  cancel_reason   text,
  reminder_sent_at timestamptz,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (lower(during) = starts_at),
  foreign key (practitioner_id, practice_id) references public.practitioners (id, practice_id),
  foreign key (service_id, practice_id)      references public.services (id, practice_id),
  foreign key (client_id, practice_id)       references public.clients (id, practice_id),
  foreign key (location_id, practice_id)     references public.locations (id, practice_id),
  -- Database-level double-booking protection: no two live appointments may overlap for one practitioner.
  constraint no_double_booking exclude using gist (practitioner_id with =, during with &&)
    where (status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed'))
);
create index on public.appointments (practice_id, starts_at);
create index on public.appointments (consumer_id, starts_at);

-- Short-lived holds so a slot is reserved while someone completes a booking.
create table public.slot_holds (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  practitioner_id uuid not null,
  service_id      uuid not null,
  consumer_id     uuid not null references auth.users (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  during          tstzrange not null,
  expires_at      timestamptz not null,
  foreign key (practitioner_id, practice_id) references public.practitioners (id, practice_id) on delete cascade,
  foreign key (service_id, practice_id)      references public.services (id, practice_id)      on delete cascade,
  constraint no_double_hold exclude using gist (practitioner_id with =, during with &&)
);

-- ───────────────────────── Flow (queue) ─────────────────────────
create table public.queue_entries (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references public.practices (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  display_name   text not null,
  phone          text,
  public_token   text not null unique default encode(gen_random_bytes(12), 'hex'),
  status         public.queue_status not null default 'waiting',
  urgency        text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  source         text not null default 'qr' check (source in ('qr', 'reception', 'booked')),
  seq            bigint generated always as identity,
  joined_at      timestamptz not null default now(),
  called_at      timestamptz,
  completed_at   timestamptz
);
create index on public.queue_entries (practice_id, status, seq);

-- ───────────────────────── Growth (marketing) ─────────────────────────
create table public.marketing_services (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null,
  active      boolean not null default true
);

create type public.marketing_status as enum
  ('draft', 'submitted', 'in_review', 'proposal_sent', 'approved', 'in_progress', 'awaiting_approval', 'delivered', 'closed', 'declined');

create table public.marketing_requests (
  id               uuid primary key default gen_random_uuid(),
  practice_id      uuid not null references public.practices (id) on delete cascade,
  service_id       uuid not null references public.marketing_services (id),
  created_by       uuid not null references auth.users (id),
  title            text not null check (char_length(title) between 3 and 160),
  brief            text not null,
  budget_min_cents int check (budget_min_cents >= 0),
  budget_max_cents int check (budget_max_cents >= 0),
  deadline         date,
  status           public.marketing_status not null default 'draft',
  assigned_to      uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (budget_max_cents is null or budget_min_cents is null or budget_max_cents >= budget_min_cents)
);
create index on public.marketing_requests (practice_id, status);

create table public.marketing_assets (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.marketing_requests (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id),
  kind        text not null check (kind in ('brief_asset', 'deliverable')),
  file_name   text not null,
  storage_path text not null,
  created_at  timestamptz not null default now()
);

create table public.marketing_approvals (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests (id) on delete cascade,
  item       text not null,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  comment    text,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaign_updates (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests (id) on delete cascade,
  author_id  uuid not null references auth.users (id),
  body       text not null,
  created_at timestamptz not null default now()
);

create table public.campaign_reports (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketing_requests (id) on delete cascade,
  period     text not null,
  summary    text not null,
  metrics    jsonb not null default '{}',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── leads & audit ─────────────────────────
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('waitlist', 'contact')),
  name        text not null,
  email       text not null,
  role        text,
  speciality  text,
  province    text,
  interests   text[] not null default '{}',
  topic       text,
  message     text,
  consent     boolean not null,
  source_path text,
  created_at  timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  practice_id uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  meta        jsonb not null default '{}'
);
create index on public.audit_log (practice_id, at desc);
