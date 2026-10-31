# BabyBlue Database Schema — Fourth Normal Form

**Status:** specification. Nothing in this document has been applied to the repository.
**Supersedes:** [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) (which documents the schema as shipped in `supabase/migrations/0001`–`0005`).
**Companions:** [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) · [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) · [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md)

---

## 1. How this is to be applied

Supabase is not yet provisioned ([`ROADMAP.md`](ROADMAP.md) "Now", item 1) and the only live database is the browser-resident PGlite instance seeded with fictional data (D-17). **There is no production data.** The schema is therefore treated as pre-production and the five shipped migrations are to be **rewritten in place** rather than extended with decomposition migrations:

| Step | Action |
|---|---|
| 1 | Rewrite `supabase/migrations/0001_core_schema.sql` to the target schema in §5–§17 of this document. |
| 2 | Rewrite `0002_functions.sql`, `0004_app_functions.sql` for the changed column and table names (§19). |
| 3 | Rewrite `0003_rls_and_grants.sql` to cover the new tables (§20). |
| 4 | Fold `0005_signup_contact.sql` into `0001` (the `profiles.phone` check and the `leads` columns belong in the base schema). |
| 5 | Bump `LOCAL_DB_VERSION` in [`src/local/db.ts`](src/local/db.ts) from `7` to `8`. Browser demo databases rebuild and re-seed; local demo data is discarded by design. |
| 6 | Update `src/local/seed.ts` and `tests/db/*` for the new shape. Run `npm test`. |

Because migration history is discarded, this is a **one-time window**. Once Supabase holds real practice data, every change in this document would need the additive `0006+` / backfill / compat-view treatment instead.

## 2. Method and scope

Normalisation was assessed against the actual DDL in `supabase/migrations/`, not against this repository's prose documentation. For each relation the functional dependencies (FDs) and multivalued dependencies (MVDs) were enumerated and checked:

- **3NF** — no non-prime attribute transitively dependent on the key.
- **BCNF** — every non-trivial FD `X → Y` has `X` as a superkey.
- **4NF** — every non-trivial MVD `X ↠ Y` has `X` as a superkey.

Two framings are used honestly throughout. An array-valued column such as `practitioners.languages` is strictly a **1NF** violation (the attribute is not atomic). The reason the fix is a *separate relation* rather than repeating groups in a wider `practitioners` row is **4NF**: once flattened, `practitioner_id ↠ language` and `practitioner_id ↠ registration` are independent MVDs over the same key, and keeping them in one relation would multiply rows combinatorially. Where this document claims a 4NF violation, the independent MVDs are named.

**Out of scope:** the `local/` auth shim and demo helpers (§7 of `DATABASE_SCHEMA.md`), which stand in for Supabase Auth and are not production objects.

## 3. Findings

23 relations were audited. **11 carry defects.** 12 are already in 4NF and are unchanged.

| # | Relation | Defect | NF broken | §
|---|---|---|---|---|
| F-01 | `practitioners.languages` | `text[]`, non-atomic; `practitioner ↠ language` independent of `practitioner ↠ registration` and `practitioner ↠ service` | 1NF → 4NF | §6 |
| F-02 | `practitioner_registrations` | PK is `practitioner_id` alone, so a practitioner may hold exactly one council registration; `practitioner ↠ (body, number)` is a genuine MVD | 4NF | §6 |
| F-03 | `locations` | `city → province`: a city determines its province, and `city` is not a superkey | 3NF | §7 |
| F-04 | `practices.province` | Duplicates `locations.province`; a practice's province is derivable from its primary location. Two sources of truth, no constraint keeping them equal | 3NF / anomaly | §7 |
| F-05 | `services.currency` | `practice_id → currency`; currency is a property of the practice's country, not of an individual service | 3NF | §8 |
| F-06 | `appointments.during` | `(starts_at, ends_at, buffer_min) → during`; determinant is not a superkey and `during` is non-prime. Client-writable, so the three can disagree | 3NF | §9 |
| F-07 | `clients.consent_record_storage` + `consent_at` | A flag pair encoding one event. No history, so POPIA withdrawal and re-grant are unrepresentable; `client ↠ consent` independent of `client ↠ appointment` | 4NF / compliance | §10 |
| F-08 | `practitioners.verification_status` + `verified_at` + `verified_by` | Decision history collapsed into the subject row; a rejection followed by a re-submission loses the rejection | 4NF | §11 |
| F-09 | `queue_entries.display_name` + `phone` | Duplicates `clients` / `profiles` whenever `appointment_id` is set. Update anomaly: correcting a phone number in `clients` leaves the queue row stale | 2NF / anomaly | §13 |
| F-10 | `leads.interests` | `text[]`, non-atomic; `lead ↠ interest` | 1NF → 4NF | §14 |
| F-11 | `campaign_reports.metrics` | `jsonb` bag; `report ↠ metric` with no key, type or unit discipline | 1NF → 4NF | §15 |

Plus two defects that are not normalisation faults but are corrected here because the decomposition touches the same rows:

| # | Relation | Defect | §
|---|---|---|
| F-12 | `appointments` | No price snapshot. `practice_stats` and `practice_insights` (`0004_app_functions.sql:346,391`) compute revenue by joining live `services.price_cents`, so **editing a service price silently rewrites reported historical revenue** | §12 |
| F-13 | `availability_rules` | Nothing prevents two overlapping rules for the same practitioner and weekday, so `get_available_slots` can emit duplicate candidate slots | §16 |

## 4. The deliberate exception: redundant `practice_id`

Every practice-scoped child table carries `practice_id` even though it is functionally determined by its parent — `practitioner_id → practice_id`, so `practitioner_services.practice_id` is transitively dependent and **by the book a 3NF violation**. The same is true of `availability_rules`, `time_off`, `appointments`, `slot_holds` and every table added below.

**This redundancy is retained deliberately and must not be normalised away.** It is the mechanism behind D-04: the composite foreign keys `FOREIGN KEY (child_id, practice_id) REFERENCES parent(id, practice_id)` are what make it structurally impossible for a child row to reference a parent in another practice, and `practice_id` is the column every RLS policy predicates on. Removing it would:

- delete one of the two independent tenant-isolation layers, leaving RLS alone (D-04 exists precisely so that one bug does not leak data);
- force every RLS policy into a join, making every policy check a nested lookup;
- make the schema-per-brand model in [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md) materially harder to reason about.

The redundancy is safe because it is **enforced**, not merely duplicated: the composite FK makes a disagreeing `practice_id` unrepresentable. A redundancy that the database guarantees consistent is not an update anomaly. Normalisation is a tool for eliminating anomalies, and where no anomaly can occur the denormalised form is correct.

**Rule for all new tables:** every practice-scoped table carries `practice_id` and references its parent by composite FK. No exceptions.

## 5. Reference data

The schema currently stores `province`, `city`, `speciality` and the council `body` as free text, which is what permits F-03, F-04 and inconsistent spellings across `practices`, `locations` and `practitioners`. The taxonomy already exists in code ([`src/lib/directory.ts`](src/lib/directory.ts)) and becomes authoritative in the database.

```sql
-- ───────────────────────── reference data (shared, read-only to clients) ─────────────────────────

create table public.countries (
  code         text primary key check (code ~ '^[A-Z]{2}$'),   -- ISO 3166-1 alpha-2
  name         text not null unique,
  currency     text not null check (currency ~ '^[A-Z]{3}$'),  -- ISO 4217
  dial_prefix  text not null check (dial_prefix ~ '^\+[1-9][0-9]{0,3}$')
);

create table public.provinces (
  code         text primary key,
  country_code text not null references public.countries(code),
  name         text not null,
  unique (country_code, name)
);

create table public.cities (
  id            uuid primary key default gen_random_uuid(),
  province_code text not null references public.provinces(code),
  name          text not null,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  unique (province_code, name)
);

create table public.languages (
  code text primary key check (code ~ '^[a-z]{2,3}$'),         -- ISO 639
  name text not null unique
);

create table public.specialities (
  slug   text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name   text not null unique,
  active boolean not null default true
);

create table public.council_bodies (
  code         text primary key,                                -- HPCSA, SANC, SAPC, SADA
  country_code text not null references public.countries(code),
  name         text not null,
  unique (country_code, name)
);
```

`cities.slug` resolves F-03 **and** removes a latent inconsistency: the public listing routes `/{speciality}/{city}` and `/in/{city}` (D-16) slugify city names in TypeScript while the database stores display text, so the slug is currently derived twice by two different code paths. One authoritative slug per city ends that.

## 6. Practitioner multivalued attributes (F-01, F-02)

`languages` becomes a relation, and a practitioner may hold registrations with several councils — a specialist dentist registered with both HPCSA and SADA is ordinary, and the present single-row PK forbids it.

```sql
create table public.practitioners (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references public.practices(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete set null,
  display_name        text not null check (char_length(display_name) between 2 and 120),
  title               text,
  speciality_slug     text not null references public.specialities(slug),
  bio                 text,
  listing_status      text not null default 'draft'
                        check (listing_status in ('draft', 'listed', 'hidden')),
  -- cached current verification state; the authoritative history is practitioner_verifications (§11)
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at          timestamptz not null default now(),
  unique (id, practice_id)
);

create table public.practitioner_languages (
  practitioner_id uuid not null,
  practice_id     uuid not null,
  language_code   text not null references public.languages(code),
  primary key (practitioner_id, language_code),
  foreign key (practitioner_id, practice_id)
    references public.practitioners(id, practice_id) on delete cascade
);

create table public.practitioner_registrations (
  practitioner_id     uuid not null,
  practice_id         uuid not null,
  body_code           text not null references public.council_bodies(code),
  registration_number text not null check (char_length(registration_number) between 3 and 40),
  submitted_at        timestamptz not null default now(),
  primary key (practitioner_id, body_code),
  unique (body_code, registration_number),
  foreign key (practitioner_id, practice_id)
    references public.practitioners(id, practice_id) on delete cascade
);
```

`speciality` → `speciality_slug` with an FK is what makes `search_practitioners`' speciality filter indexable; the current `p.speciality = p_speciality` on free text cannot be constrained to the taxonomy, so a typo creates an unreachable listing page.

`unique (body_code, registration_number)` is preserved from the shipped schema (it is what `submit_verification` relies on to raise `registration_in_use`) and is now correctly scoped: the same number may legitimately exist under two different councils.

## 7. Location, city and province (F-03, F-04)

```sql
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name        text not null,
  address     text,
  city_id     uuid references public.cities(id),
  is_primary  boolean not null default false,
  unique (id, practice_id)
);

-- at most one primary location per practice
create unique index locations_one_primary on public.locations (practice_id) where is_primary;
create index locations_city on public.locations (city_id);
```

`practices.province` is **dropped**. A practice's province is `locations → cities → provinces` via the primary location. Everything that read `practices.province` reads this view instead:

```sql
create view public.practice_place_v as
  select p.id          as practice_id,
         l.id          as location_id,
         l.address,
         c.id          as city_id,
         c.name        as city,
         c.slug        as city_slug,
         pv.code       as province_code,
         pv.name       as province,
         co.code       as country_code,
         co.currency
    from public.practices p
    left join public.locations l on l.practice_id = p.id and l.is_primary
    left join public.cities    c on c.id = l.city_id
    left join public.provinces pv on pv.code = c.province_code
    left join public.countries co on co.code = pv.country_code;
```

`locations_one_primary` replaces the `order by name limit 1` heuristic used in four places today (`search_practitioners`, `my_appointments`, the hold page query, and `practice/settings`), each of which silently picks a different "main" location if a practice renames its rooms.

## 8. Currency belongs to the practice (F-05)

```sql
create table public.practices (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (char_length(name) between 2 and 120),
  slug                      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country_code              text not null default 'ZA' references public.countries(code),
  timezone                  text not null default 'Africa/Johannesburg',
  min_notice_minutes        int  not null default 60  check (min_notice_minutes >= 0),
  cancellation_notice_hours int  not null default 24  check (cancellation_notice_hours >= 0),
  -- status is cached; practice_status_events (§17) is authoritative
  status                    text not null default 'pending'
                              check (status in ('pending', 'active', 'suspended')),
  created_at                timestamptz not null default now()
);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references public.practices(id) on delete cascade,
  name         text not null,
  description  text,
  duration_min int  not null check (duration_min between 5 and 480),
  buffer_min   int  not null default 0 check (buffer_min between 0 and 120),
  price_cents  int  check (price_cents >= 0),
  active       boolean not null default true,
  unique (id, practice_id)
);
```

`services.currency` is dropped; currency is `practices.country_code → countries.currency`. This matters for the Southern Africa expansion in `ROADMAP.md` ("multi-country regulators, currencies, languages"): with currency on `services`, one practice could hold services priced in two currencies and `practice_stats` would sum them as if they were one number.

## 9. The appointment range stops being writable (F-06)

`appointments.during` is fully determined by `starts_at`, `ends_at` and `buffer_min`, but today it is an ordinary column that any `insert` or `update` can set independently — guarded only by `CHECK (lower(during) = starts_at)`, which leaves the upper bound free. A client could write a `during` that is narrower than the real appointment and defeat `no_double_booking` (D-05) without violating any constraint.

The correct form is a generated column, so the range is unwritable by construction. **A direct generated expression is rejected by PostgreSQL** — verified:

```
create table t1 (
  ..., during tstzrange generated always as
    (tstzrange(starts_at, ends_at + make_interval(mins => buffer_min), '[)')) stored );
ERROR:  generation expression is not immutable
```

`timestamptz + interval` is marked `STABLE`, not `IMMUTABLE`, because adding day or month components depends on the session `TimeZone`. The fix is an `IMMUTABLE` wrapper, which is **sound here specifically because the interval is minutes-only** and therefore genuinely timezone-independent:

```sql
-- IMMUTABLE is correct ONLY while the interval is minutes-only. If a buffer is ever
-- expressed in days or months, this marking becomes a lie to the planner and the
-- generated column must be replaced by a BEFORE trigger.
create function public.appointment_span(p_starts timestamptz, p_ends timestamptz, p_buffer_min int)
returns tstzrange language sql immutable parallel safe as $$
  select tstzrange(p_starts, p_ends + make_interval(mins => p_buffer_min), '[)')
$$;

create table public.appointments (
  id              uuid not null default gen_random_uuid() primary key,
  practice_id     uuid not null,
  practitioner_id uuid not null,
  service_id      uuid not null,
  location_id     uuid,
  client_id       uuid not null,
  consumer_id     uuid references auth.users(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null check (ends_at > starts_at),
  buffer_min      int not null default 0 check (buffer_min between 0 and 120),
  price_cents     int check (price_cents >= 0),          -- snapshot, see §12
  currency        text not null,                         -- snapshot, see §12
  during          tstzrange generated always as
                    (public.appointment_span(starts_at, ends_at, buffer_min)) stored,
  status          public.appointment_status not null default 'confirmed',
  source          text not null default 'app' check (source in ('app', 'os', 'flow')),
  cancelled_at    timestamptz,
  cancelled_by    uuid references auth.users(id) on delete set null,
  cancel_reason   text,
  reminder_sent_at timestamptz,
  created_at      timestamptz not null default now(),

  foreign key (practitioner_id, practice_id) references public.practitioners(id, practice_id),
  foreign key (service_id,      practice_id) references public.services(id, practice_id),
  foreign key (location_id,     practice_id) references public.locations(id, practice_id),
  foreign key (client_id,       practice_id) references public.clients(id, practice_id),

  constraint no_double_booking exclude using gist (practitioner_id with =, during with &&)
    where (status in ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed'))
);
```

Verified behaviour: the exclusion constraint builds on the generated column, the computed range is correct (`09:00`–`09:30` with a 10-minute buffer yields `["…09:00+02","…09:40+02")`), and any attempt to write the column fails with `cannot insert a non-DEFAULT value into column "during"`. The `CHECK (lower(during) = starts_at)` becomes unnecessary and is dropped.

The same treatment applies to `slot_holds.during`.

## 10. Consent becomes an event series (F-07)

`consent_record_storage boolean` with a nullable `consent_at` cannot express what POPIA requires. Section 11(2) gives a data subject the right to withdraw consent at any time, and s11(3) requires the responsible party to be able to show what was consented to and when. A boolean that is overwritten on withdrawal destroys exactly the evidence the Act expects, and the app compounds this by writing `consent_at = case when $2 then now() end` (`src/app/practice/clients/[id]/page.tsx:42`) — withdrawing consent nulls the timestamp, so the record of the original grant is gone.

```sql
create type public.consent_purpose as enum (
  'record_storage',        -- POPIA s11: storing the client's administrative record
  'appointment_reminders', -- contacting the client about their own bookings
  'marketing'              -- any other contact; must be separately and freely given
);

create table public.client_consents (
  id          bigint generated always as identity primary key,
  practice_id uuid not null,
  client_id   uuid not null,
  purpose     public.consent_purpose not null,
  granted     boolean not null,
  at          timestamptz not null default now(),
  actor_id    uuid references auth.users(id) on delete set null,
  channel     text not null default 'os' check (channel in ('os', 'app', 'flow', 'import', 'paper')),
  evidence    jsonb not null default '{}',   -- form version, wording shown, IP, signature reference
  foreign key (client_id, practice_id)
    references public.clients(id, practice_id) on delete cascade
);

create index client_consents_latest on public.client_consents (client_id, purpose, at desc);

-- current state, derived
create view public.client_consent_current_v as
  select distinct on (client_id, purpose)
         client_id, practice_id, purpose, granted, at, actor_id
    from public.client_consents
   order by client_id, purpose, at desc;
```

`clients` loses both columns:

```sql
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  first_name  text not null check (char_length(first_name) between 1 and 80),
  last_name   text not null default '',
  email       text,            -- practice-held contact; see §18 for precedence
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  admin_notes text,
  created_at  timestamptz not null default now(),
  unique (id, practice_id)
);

create unique index clients_practice_user on public.clients (practice_id, user_id) where user_id is not null;
```

Note the `phone` E.164 check, which `profiles` has (migration `0005`, D-21) but `clients` does not — so a staff member can today store a malformed number that the same person could not store about themselves.

## 11. Verification becomes an event series (F-08)

A practitioner submits, is rejected, corrects the registration number, resubmits and is verified. The shipped schema records only the final state, so the platform cannot show a reviewer what was previously rejected and why — and `appointment_history` style auditing exists for appointments but not for the verification decisions that gate the badge (D-06).

```sql
create table public.practitioner_verifications (
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

create index practitioner_verifications_latest
  on public.practitioner_verifications (practitioner_id, decided_at desc);
```

`practitioners.verified_at` and `verified_by` are dropped. `verification_status` is **kept as a cached current value** because `search_practitioners` filters on it and RLS/listing policies read it; it is maintained only by the trigger below, and the `practitioners_guard_verification` trigger (D-06) continues to block non-admin writes.

```sql
create function public.practitioner_verification_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.practitioners
     set verification_status = new.status
   where id = new.practitioner_id and practice_id = new.practice_id;
  return new;
end $$;

create trigger practitioner_verifications_sync
  after insert on public.practitioner_verifications
  for each row execute function public.practitioner_verification_sync();
```

This is a cache, not a second source of truth: it is written by exactly one trigger from exactly one table, so it cannot drift. The same pattern applies to `practices.status` (§17).

## 12. Price and currency are snapshotted at booking (F-12)

`practice_stats` and `practice_insights` both compute revenue as `sum(s.price_cents)` by joining `services` live (`0004_app_functions.sql:346` and `:391`). A practice that raises a consultation fee from R500 to R650 instantly rewrites its own last 30 days of reported revenue. The historical figure must not depend on a mutable row.

`appointments.price_cents` and `appointments.currency` (§9) are snapshots taken at booking, alongside the `buffer_min` snapshot the schema already takes for the same reason. This is not denormalisation: the price *of an appointment* is a different fact from the price *of a service today*, and the FD is `appointment_id → price_cents`, so the attribute belongs on `appointments`.

Revenue then reads `sum(a.price_cents)` with no join, which is also materially cheaper.

## 13. Queue entries reference a person (F-09)

A queue entry today carries its own `display_name` and `phone` even when `appointment_id` links it to an appointment that already identifies the client — so the same person's phone number exists in `profiles`, `clients` and `queue_entries`, and correcting it in one place leaves two stale.

A walk-in who has given no details still needs a name to call out, so the entry must support both shapes:

```sql
create table public.queue_entries (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references public.practices(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  client_id       uuid,
  -- only for an anonymous walk-in who has no client record yet
  walkin_name     text check (walkin_name is null or char_length(walkin_name) between 1 and 80),
  walkin_phone    text check (walkin_phone is null or walkin_phone ~ '^\+[1-9][0-9]{7,14}$'),
  public_token    text not null unique default encode(gen_random_bytes(12), 'hex'),
  status          public.queue_status not null default 'waiting',
  urgency         text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  source          text not null default 'qr' check (source in ('qr', 'reception', 'booked')),
  seq             bigint not null generated always as identity,
  joined_at       timestamptz not null default now(),
  called_at       timestamptz,
  completed_at    timestamptz,

  foreign key (client_id, practice_id) references public.clients(id, practice_id) on delete set null,

  -- exactly one identity source
  constraint queue_entry_identified check (
    (client_id is not null and walkin_name is null) or
    (client_id is null     and walkin_name is not null)
  )
);

create index queue_entries_live on public.queue_entries (practice_id, status, seq);

create view public.queue_entry_display_v as
  select q.id, q.practice_id, q.status, q.urgency, q.source, q.seq,
         q.joined_at, q.called_at, q.completed_at, q.appointment_id,
         coalesce(trim(c.first_name || ' ' || c.last_name), q.walkin_name) as display_name,
         coalesce(c.phone, pr.phone, q.walkin_phone)                       as phone
    from public.queue_entries q
    left join public.clients  c  on c.id = q.client_id and c.practice_id = q.practice_id
    left join public.profiles pr on pr.id = c.user_id;
```

The `check` makes "a queue entry with no identity at all" and "a queue entry with two conflicting names" both unrepresentable. `public_queue_info` and `get_queue_status` are unaffected — they already return no names (D-07).

## 14. Lead interests (F-10)

```sql
create table public.lead_interests (
  lead_id  uuid not null references public.leads(id) on delete cascade,
  interest text not null,
  primary key (lead_id, interest)
);
```

`leads.interests text[]` is dropped. `leads` is written only by the server with the `service_role` key (D-08) and has no client-facing RLS, so this change is confined to [`src/server/leads.ts`](src/server/leads.ts) and the `/api/leads` route.

## 15. Campaign report metrics (F-11)

`campaign_reports.metrics jsonb` is an untyped bag. Growth reporting is a commercial deliverable — a practice is being shown numbers about money it spent — so the metrics need names, units and comparability across reports.

```sql
create table public.metric_definitions (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label      text not null,
  unit       text not null check (unit in ('count', 'currency_cents', 'ratio', 'seconds')),
  precision  smallint not null default 0 check (precision between 0 and 6),
  active     boolean not null default true
);

create table public.campaign_report_metrics (
  report_id   uuid not null references public.campaign_reports(id) on delete cascade,
  metric_key  text not null references public.metric_definitions(key),
  value       numeric not null,
  primary key (report_id, metric_key)
);
```

`report ↠ metric` is now a relation with one row per fact. Charting a metric over time becomes an indexed scan rather than per-row JSON extraction, and a typo in a metric name fails loudly instead of creating a second invisible series.

**`audit_log.meta jsonb` is deliberately kept as `jsonb`** (and so is `client_consents.evidence`). An audit record is a serialised historical event whose payload shape varies by `action` and must never be rewritten by a later schema change; normalising it into typed columns would couple the immutable log to the mutable schema. 4NF governs relations that are updated, and an append-only event payload is not one.

## 16. Overlapping availability rules (F-13)

Two rules of `Monday 08:00–13:00` and `Monday 12:00–17:00` for one practitioner are accepted today, and `get_available_slots` then generates overlapping candidate slots from both windows. PostgreSQL has no built-in `time` range type, so one is declared (`subtype_diff` is optional and the obvious `time_mi_time` is rejected because it returns `interval`, not `double precision`):

```sql
create type public.timerange as range (subtype = time);

create table public.availability_rules (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  practitioner_id uuid not null,
  location_id     uuid,
  weekday         smallint not null check (weekday between 0 and 6),  -- 0 = Monday
  start_time      time not null,
  end_time        time not null check (end_time > start_time),
  during_local    public.timerange generated always as
                    (public.timerange(start_time, end_time, '[)')) stored,

  foreign key (practitioner_id, practice_id) references public.practitioners(id, practice_id) on delete cascade,
  foreign key (location_id,     practice_id) references public.locations(id, practice_id),

  constraint availability_no_overlap exclude using gist
    (practitioner_id with =, weekday with =, during_local with &&)
);

create index availability_rules_lookup on public.availability_rules (practitioner_id, weekday);
```

Verified: `08:00–13:00` then `12:00–17:00` on the same weekday is rejected by `availability_no_overlap`; `13:00–17:00` (adjacent, `[)` bounds) is accepted; the same window on a different weekday is accepted.

## 17. Practice status history

`practices.status` drives whether a practice is publicly visible at all (`anon` reads only `active`), and `activate_practice` changes it with only an `audit_log` row as evidence. Suspension is a commercial and compliance event and deserves a first-class record, with `status` cached by trigger exactly as in §11.

```sql
create table public.practice_status_events (
  id          bigint generated always as identity primary key,
  practice_id uuid not null references public.practices(id) on delete cascade,
  status      text not null check (status in ('pending', 'active', 'suspended')),
  actor_id    uuid references auth.users(id) on delete set null,
  at          timestamptz not null default now(),
  reason      text
);

create index practice_status_events_latest on public.practice_status_events (practice_id, at desc);
```

## 18. Client contact precedence

A `clients` row with `user_id` set duplicates contact details that `profiles` already holds for the same person, giving `user_id → phone` through two paths with nothing keeping them equal. Deleting the duplicate is wrong — a practice legitimately holds a different number for a patient (a work line, a next-of-kin) and must not lose it when the patient edits their own BabyBlue profile.

The resolution is explicit precedence rather than deduplication: `clients.email` / `clients.phone` mean *"the contact this practice holds"*, `profiles` means *"the contact the person maintains"*, and the practice-held value wins where present.

```sql
create view public.client_contact_v as
  select c.id as client_id, c.practice_id, c.user_id,
         trim(c.first_name || ' ' || c.last_name) as full_name,
         coalesce(c.phone, p.phone)               as phone,
         coalesce(c.email, u.email)               as email,
         c.phone is not null as phone_is_practice_held,
         c.email is not null as email_is_practice_held
    from public.clients c
    left join public.profiles   p on p.id = c.user_id
    left join auth.users        u on u.id = c.user_id;
```

Every read of client contact details goes through this view, so the precedence rule exists in one place instead of being re-decided at each of the nine call sites that currently select `c.phone, c.email` directly.

## 19. Final inventory

**23 → 38 tables.** 12 unchanged, 11 altered, 15 added.

| Group | Tables |
|---|---|
| Reference (new, 6) | `countries`, `provinces`, `cities`, `languages`, `specialities`, `council_bodies` |
| Identity (2) | `profiles`, `platform_roles` |
| Practice (4) | `practices`, `practice_members`, `locations`, `practice_status_events`<sup>new</sup> |
| Practitioner (5) | `practitioners`, `practitioner_languages`<sup>new</sup>, `practitioner_registrations`, `practitioner_services`, `practitioner_verifications`<sup>new</sup> |
| Services (1) | `services` |
| Scheduling (4) | `availability_rules`, `time_off`, `appointments`, `slot_holds` |
| Clients (2) | `clients`, `client_consents`<sup>new</sup> |
| Flow (1) | `queue_entries` |
| Growth (8) | `marketing_services`, `marketing_requests`, `marketing_assets`, `marketing_approvals`, `campaign_updates`, `campaign_reports`, `campaign_report_metrics`<sup>new</sup>, `metric_definitions`<sup>new</sup> |
| Platform (3) | `leads`, `lead_interests`<sup>new</sup>, `audit_log` |

**Views (6, all new):** `practice_place_v`, `client_consent_current_v`, `client_contact_v`, `queue_entry_display_v`, `practitioner_public_v`, `service_price_v`.

**New types:** `public.timerange` (range), `public.consent_purpose` (enum).
**New functions:** `appointment_span` (immutable), `practitioner_verification_sync` (trigger), `practice_status_sync` (trigger).
**Dropped columns:** `practices.province`, `services.currency`, `practitioners.languages`, `practitioners.speciality`, `practitioners.verified_at`, `practitioners.verified_by`, `locations.city`, `locations.province`, `clients.consent_record_storage`, `clients.consent_at`, `leads.interests`, `campaign_reports.metrics`, `queue_entries.display_name`, `queue_entries.phone`, `appointments` CHECK on `during`.

## 20. Knock-on changes

### Functions (`0002`, `0004`)

| Function | Change |
|---|---|
| `search_practitioners` | `p.speciality` → `speciality_slug`; `languages` → aggregate from `practitioner_languages`; `l.city`/`pr.province` → `practice_place_v`. Also restructured for cost — see [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) §3. |
| `get_available_slots` | Unchanged logic; benefits from `availability_no_overlap` removing duplicate windows. |
| `book_appointment`, `staff_create_appointment` | Must snapshot `price_cents` and `currency` (§12); must not write `during` (§9). |
| `reschedule_appointment` | Must not write `during`; sets `starts_at`/`ends_at` only. |
| `hold_slot` | Must not write `slot_holds.during`. |
| `check_in_appointment`, `queue_add_walkin`, `join_queue` | Write `client_id` or `walkin_name`, never both (§13). `join_queue` creates no client, so it writes `walkin_name`. |
| `set_verification`, `submit_verification` | Insert into `practitioner_verifications`; stop writing `verified_at`/`verified_by`. `submit_verification` takes `body_code`. |
| `activate_practice` | Inserts into `practice_status_events`. |
| `practice_stats`, `practice_insights` | Revenue from `a.price_cents` (§12), no `services` join. |
| `my_appointments` | Location via `practice_place_v`; price from the appointment snapshot. |
| `_audit` | Unchanged. |

### RLS (`0003`)

Each new table needs policies consistent with the existing matrix (`DATABASE_SCHEMA.md` §6):

| Table | Policy |
|---|---|
| `countries`, `provinces`, `cities`, `languages`, `specialities`, `council_bodies` | `select` to `anon` + `authenticated`; writes to `platform_admin` only. These are the only client-readable tables with no `practice_id`. |
| `practitioner_languages` | Read where the parent practitioner is readable; write by `practice_owner`. |
| `practitioner_verifications` | Read by `practice_owner` of the practice and `platform_admin`; insert by `platform_admin` only. |
| `practice_status_events` | Read by `practice_owner` and `platform_admin`; insert by `platform_admin` only. |
| `client_consents` | Read/insert by practice members; **no `update`, no `delete` policy for any role** — the series is append-only, which is the point. Consumer reads own via `client.user_id = auth.uid()`. |
| `lead_interests` | No policies. `service_role` only, matching `leads` (D-08). |
| `campaign_report_metrics` | Read by `practice_owner` of the owning request's practice and by `marketing_operator`; insert by `marketing_operator`. |
| `metric_definitions` | Read by `authenticated`; write by `platform_admin`. |

The six reference tables are the first client-readable tables in the schema with no tenant column. That is correct — they are shared, non-personal and identical for every tenant — but it must be deliberate, because the schema-per-brand model in [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md) keeps exactly these in a shared `public` schema while every tenant-scoped table moves into a brand schema.

### Application

All 123 `query()` / `mutate()` call sites are enumerated in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md). The ones broken by this decomposition specifically:

| Call site | Breaks on |
|---|---|
| `src/app/practice/team/page.tsx:75,122` | `languages`, `speciality` |
| `src/app/practice/team/page.tsx:271,277` | `practitioner_registrations` PK and `body` → `body_code` |
| `src/app/practice/onboarding/page.tsx:39,40,41` | `practices.province`, `locations.city`/`province`, `languages` |
| `src/app/practice/settings/page.tsx:22,33,34,35` | `practices.province`, `locations.city`/`province` |
| `src/app/practice/clients/[id]/page.tsx:42` | `consent_record_storage`, `consent_at` |
| `src/app/practice/clients/page.tsx:24,86` | `consent_record_storage` |
| `src/app/practice/queue/page.tsx:31` | `queue_entries.display_name`, `phone` |
| `src/app/practice/page.tsx:31` · `src/components/os/OsRoot.tsx:73` | `queue_entries.display_name` |
| `src/components/os/GrowthDetail.tsx:29,209` | `campaign_reports.metrics` |
| `src/lib/os-data.ts:21` | `languages`, `speciality` |
| `src/app/patient/search/page.tsx:44,45` | `locations.city`, `practitioners.speciality` |
| `src/app/patient/page.tsx:27` | `locations.city` |
| `src/server/leads.ts` | `leads.interests` |

## 21. Verification performed

The non-obvious DDL in this document was executed against PostgreSQL (PGlite 0.5.11 with `btree_gist` and `pgcrypto`, the same engine `tests/db/harness.ts` uses) before being written down:

| Claim | Result |
|---|---|
| Direct generated expression for `during` | **Rejected** — `generation expression is not immutable` |
| `IMMUTABLE` wrapper + generated column | Accepted; range computed correctly |
| Exclusion constraint over a generated column | Accepted |
| Writing to a generated column | **Rejected** — `cannot insert a non-DEFAULT value into column "during"` |
| `create type timerange as range (subtype = time, subtype_diff = time_mi_time)` | **Rejected** — `subtype_diff function must return type double precision` |
| `create type timerange as range (subtype = time)` | Accepted |
| `availability_no_overlap` rejects overlap, accepts adjacency and other weekdays | Confirmed |
| All decomposition DDL in §5–§18 | Compiles |

## 22. Test additions

`tests/db/` currently runs 82 tests (153 across the whole suite). The decomposition needs at least:

- `during` cannot be written directly on `appointments` or `slot_holds`; `no_double_booking` still rejects an overlap created through `starts_at`/`ends_at`.
- `availability_no_overlap` rejects overlapping rules and permits adjacent ones.
- A practitioner can hold two registrations with different `body_code` values and cannot hold two with the same.
- Consent withdrawal appends a row and leaves the original grant readable; no role can `update` or `delete` `client_consents`.
- `queue_entry_identified` rejects both the no-identity and the two-identity cases.
- Revenue in `practice_stats` is unchanged by editing a service's price after an appointment exists. (This test fails against the current schema — it is the regression F-12 describes.)
- A rejection followed by verification leaves both rows in `practitioner_verifications`, and `practitioners.verification_status` equals the latest.
- `anon` can read all six reference tables and write none.
