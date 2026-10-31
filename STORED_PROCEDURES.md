# BabyBlue Stored Procedures

**Status:** specification. Nothing in this document has been applied to the repository.
**Depends on:** [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md) — every signature below assumes the 4NF schema.
**Companions:** [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) · [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md)

---

## 1. Why

The application sends **123 SQL statements** to the database from **30 files**. **49** of them call one of the 44 existing SQL functions; the remaining **74 are hand-written `select`/`insert`/`update`/`delete` strings embedded in React client components**, executed by [`src/local/db.ts`](src/local/db.ts) under `set local role authenticated`.

(Counted by extracting every SQL-shaped string literal from `src/**/*.ts{,x}`: 158 matches, less 28 in `src/local/seed.ts` which seeds the demo database, 4 in `src/local/auth.ts` which stands in for Supabase Auth, 2 harness statements in `src/local/db.ts` and `worker.ts`, and one false positive in marketing copy.)

That arrangement has four consequences:

1. **RLS is the only gate on reads.** `ARCHITECTURE.md` states the principle — "the database is the security boundary" — and for reads that is currently the *whole* boundary. A policy that is a shade too permissive is immediately a data leak, with no second layer. D-04 provides defence in depth for *tenancy*; nothing provides it for *column exposure*. `select * from public.clients where id = $1` (`src/app/practice/clients/[id]/page.tsx:19`) returns `admin_notes` to every practice role.
2. **The query surface is unversioned and untestable.** A string in a `.tsx` file cannot be covered by `tests/db/`, so the 82 database tests exercise the SQL functions and none of the 74 hand-written statements.
3. **Schema changes break the UI silently.** The 13 call sites listed in `DATABASE_SCHEMA_4NF.md` §20 fail only at runtime, in the browser, on the screen that uses them.
4. **The schema-per-brand model needs an indirection point.** Under [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md), unqualified table references resolve through `search_path`. Statements that hard-code `public.` — which all 82 do — will read the *wrong schema or no schema* once tenants move into brand schemas. A procedure surface is the seam that makes that migration a server-side change instead of a 32-file rewrite.

This document specifies **106 procedures** that between them cover all 123 statements, leaving no SQL in `src/`.

## 2. Conventions

```
<domain>_<entity>_<action>
```

`domain` ∈ `public` (anonymous), `patient`, `practice`, `growth`, `platform` — expressed as a name prefix, not a schema, so the existing grant model is unchanged.

| Rule | |
|---|---|
| Language | `plpgsql` for anything with branching or more than one statement; `sql` for single-statement reads. |
| Security | `security definer set search_path = public` on every procedure, matching `0002_functions.sql`. Reads that rely solely on RLS use `security invoker`. |
| Access check | Every `security definer` procedure re-checks the caller as its **first statement**, via `is_member`, `has_practice_role`, `is_platform_admin` or `is_marketing_operator`. Never trust the argument. |
| Volatility | `stable` for reads, default `volatile` for writes. `stable` reads are safe to call inside other queries. |
| Parameters | `p_` prefix, in the order (tenant, entity, payload). |
| Returns | A composite `returns table (...)` for lists, the affected `uuid` for creates, `void` for state changes. **Never `jsonb` for a list** — typed columns are what let the TypeScript layer stay honest. The two existing exceptions (`practice_stats`, `practice_insights`) stay `jsonb` because their shape is genuinely a dashboard document. |
| Errors | `raise exception '<code>' using errcode = '...'` with codes drawn from the existing vocabulary in [`src/local/db.ts`](src/local/db.ts) `MESSAGES`. A new code requires a new entry there — that map is the user-facing contract. |
| Audit | Every write that changes a booking, a consent, a role, a verification or a Growth status calls `_audit`. |
| Grants | `revoke all on function ... from public; grant execute to <roles>` — explicit, per procedure. |

### Error codes

Existing (keep): `slot_unavailable`, `hold_expired`, `too_late_to_cancel`, `not_cancellable`, `not_reschedulable`, `too_early_to_check_in`, `not_checkin_able`, `invalid_transition`, `user_not_found`, `sole_owner`, `has_records`, `registration_in_use`, `invalid_registration`, `invalid_name`, `not_authenticated`, `forbidden`, `not_found`.

New (add to `MESSAGES`): `consent_required`, `service_in_use`, `overlapping_availability`, `invalid_range`, `last_practitioner`, `price_required`, `metric_unknown`, `queue_closed`, `asset_too_large`, `not_editable`.

## 3. Shared helpers

The four predicates in `0002_functions.sql` are kept and three are added.

```sql
-- existing, unchanged: is_platform_admin(), is_marketing_operator(), is_member(uuid),
--                      has_practice_role(uuid, public.practice_role[]), _audit(...)

-- Caller must be a member of the practice, else forbidden. Returns the practice row.
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

-- Caller must hold one of the given roles in the practice.
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

-- The practice a Growth request belongs to, with the caller authorised as owner or operator.
create or replace function public._require_request_access(p_request uuid, p_write boolean default false)
returns public.marketing_requests language plpgsql stable security definer set search_path = public as $$
declare v public.marketing_requests;
begin
  select * into v from public.marketing_requests where id = p_request;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.is_marketing_operator() then return v; end if;
  if public.has_practice_role(v.practice_id, array['practice_owner']::public.practice_role[]) then
    if p_write and v.status <> 'draft' then raise exception 'not_editable' using errcode = '42501'; end if;
    return v;
  end if;
  raise exception 'forbidden' using errcode = '42501';
end $$;
```

`_require_member` and `_require_role` replace a pattern repeated 23 times across `0004_app_functions.sql`, and make the access check impossible to omit by accident: a procedure that does not call one of them has no caller check at all, which is greppable.

## 4. Coverage map

| Area | Statements today | Procedures | § |
|---|---|---|---|
| Anonymous / public | 12 | 10 | §5 |
| Patient (consumer) | 15 | 13 | §6 |
| Practice — dashboard, calendar, context | 11 | 11 | §7 |
| Practice — team & practitioners | 13 | 12 | §8 |
| Practice — services | 6 | 5 | §9 |
| Practice — availability & leave | 6 | 6 | §10 |
| Practice — clients & consent | 10 | 9 | §11 |
| Practice — appointments | 11 | 7 | §12 |
| Practice — queue (Flow) | 3 | 5 | §13 |
| Practice — settings, locations, onboarding | 11 | 7 | §14 |
| Growth | 17 | 16 | §15 |
| Platform admin | 8 | 5 | §16 |
| **Total** | **123** | **106** | |

Not counted above: the 4 statements in `src/local/auth.ts` (§17, replaced by Supabase Auth rather than by procedures) and the 28 in `src/local/seed.ts` (demo seeding, which legitimately writes directly).

Counts differCounts differ where two statements collapse into one procedure (the paired `insert`/`update` of a service becomes one `upsert`) or where one statement becomes two (the consent toggle becomes an explicit grant and withdraw).

---

## 5. Public / anonymous — 10 procedures

Granted to `anon` and `authenticated`. These must never return a patient's name, a phone number or any other personal field (D-07).

```sql
-- ── directory search. Replaces search_practitioners. The two-phase structure (page first,
-- ── then compute availability for the page only) is the fix measured in IMPROVEMENT_PLAN §3.
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
           pr.name as practice_name, pr.slug as practice_slug, pl.city, pl.city_slug,
           pl.province, pl.address, pl.currency
      from public.practitioners p
      join public.practices pr on pr.id = p.practice_id and pr.status = 'active'
      join public.practice_place_v pl on pl.practice_id = pr.id
     where p.listing_status = 'listed'
       and (coalesce(p_speciality, '')  = '' or p.speciality_slug = p_speciality)
       and (coalesce(p_city_slug, '')   = '' or pl.city_slug = p_city_slug)
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
         pg.next_available_cached
    from page pg
    join public.specialities sp on sp.slug = pg.speciality_slug
   order by pg.display_name;
$$;
```

Two differences from the shipped function are deliberate and are product decisions, not just optimisations:

- **`p_q` uses a full-text index, not `ilike '%…%'`.** Three leading-wildcard `ilike` predicates currently make every search a sequential scan. See `IMPROVEMENT_PLAN.md` §4 for the `search_vector` column.
- **Ordering is by verified-then-name, not by soonest-available.** Ordering by `next_available` is what forces availability to be computed for *every* matching practitioner before the `LIMIT` can apply, and is the direct cause of the O(n) behaviour measured in `IMPROVEMENT_PLAN.md` §3. `next_available_cached` (a maintained column, `IMPROVEMENT_PLAN.md` §5) restores soonest-first ordering at no query cost. Until that column exists, soonest-first ordering must be dropped.

```sql
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

-- unchanged from 0002_functions.sql except for the name; the slot algebra is correct as written
create or replace function public.public_slots_list(
  p_practitioner uuid, p_service uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return query select * from public.get_available_slots(p_practitioner, p_service, p_from, p_to);
end $$;

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
    left join public.practices pr on pr.id = p.practice_id and pr.status = 'active'
   where sp.active
   group by sp.slug, sp.name
   order by sp.name;
$$;
```

`public_city_list` and `public_speciality_list` replace two statements that today read `public.locations` and `public.practitioners` directly from the client (`src/app/patient/search/page.tsx:44,45`, `src/app/patient/page.tsx:27`). They are also the server-side replacement for `demoListedFacets()` that D-17 names as the swap point for live Supabase — which means [`src/lib/directory-facets.ts`](src/lib/directory-facets.ts) becomes a call to these two procedures and the static listing pages (D-16) can be generated from real data.

```sql
-- Flow: queue procedures. join/status/leave are unchanged in behaviour from 0002/0004.
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
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid_name' using errcode = '22023'; end if;
  select id into v_practice from public.practices where slug = p_practice_slug and status = 'active';
  if not found then raise exception 'queue_closed' using errcode = 'P0002'; end if;

  -- walkin_name, not client_id: an anonymous QR join creates no client record (D-21)
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
         (select count(*)::int + 1 from public.queue_entries o
           where o.practice_id = q.practice_id and o.status = 'waiting' and o.seq < q.seq),
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

revoke all on function public.public_practitioner_search(text,text,text,boolean,int,int) from public;
grant execute on function public.public_practitioner_search(text,text,text,boolean,int,int) to anon, authenticated;
-- …same revoke/grant pair for each of the 10 procedures in this section
```

`public_queue_status` returns `status`, `queue_position` and `practice_name` and nothing else, preserving D-07 exactly. Note that it is `stable` and takes the token as its only argument — it must stay that way, because it is the one procedure a holder of a leaked token can call.

---

## 6. Patient (consumer) — 13 procedures

Granted to `authenticated`. Every one is scoped by `auth.uid()` internally; none takes a user id as an argument.

```sql
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

-- replaces my_appointments() plus the two filtered client-side variants
create or replace function public.patient_appointments_list(
  p_scope text default 'all')   -- 'all' | 'upcoming' | 'past'
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
returns setof record language sql stable security definer set search_path = public as $$
  select * from public.patient_appointments_list('all') where appointment_id = p_appointment;
$$;
```

`patient_appointment_get` removes a join the client currently performs itself — `src/app/patient/appointments/[id]/page.tsx:43` joins the result of `my_appointments()` back to `public.appointments` to recover `service_id`, which means the consumer role needs a direct `select` grant on `appointments` purely to read one column. Returning `service_id` from the list procedure lets that grant be revoked.

```sql
-- Booking: hold → book. Logic preserved from 0002_functions.sql; the change is that
-- `during` is no longer written (it is generated) and price/currency are snapshotted.
create or replace function public.patient_slot_hold(
  p_practitioner uuid, p_service uuid, p_starts timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_svc public.services; v_hold uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  delete from public.slot_holds where expires_at <= now();

  select s.* into v_svc from public.services s
    join public.practitioner_services ps on ps.service_id = s.id and ps.practitioner_id = p_practitioner
   where s.id = p_service and s.active;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.get_available_slots(p_practitioner, p_service, p_starts::date, p_starts::date) g
     where g.starts_at = p_starts
  ) then raise exception 'slot_unavailable' using errcode = '23P01'; end if;

  insert into public.slot_holds (practice_id, practitioner_id, service_id, consumer_id,
                                 starts_at, ends_at, expires_at)
  values (v_svc.practice_id, p_practitioner, p_service, v_uid, p_starts,
          p_starts + make_interval(mins => v_svc.duration_min), now() + interval '5 minutes')
  returning id into v_hold;

  return v_hold;
exception
  when exclusion_violation then raise exception 'slot_unavailable' using errcode = '23P01';
end $$;
```

The `exception when exclusion_violation` clause is the part worth noting: `no_double_hold` is what makes concurrent holds race-proof (D-05), but the raw constraint name reaches the UI today and is translated by a string match in `friendlyError`. Converting it inside the procedure makes `slot_unavailable` the contract and the constraint name an implementation detail.

```sql
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

  -- link or create this practice's client record for the signed-in consumer
  select id into v_client from public.clients
   where practice_id = v_h.practice_id and user_id = v_uid;
  if v_client is null then
    insert into public.clients (practice_id, user_id, first_name, last_name)
    select v_h.practice_id, v_uid,
           coalesce(nullif(split_part(p.display_name, ' ', 1), ''), 'Patient'),
           coalesce(nullif(substr(p.display_name, strpos(p.display_name, ' ') + 1), ''), '')
      from public.profiles p where p.id = v_uid
    returning id into v_client;
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
```

The `for update` on the hold and the `exclusion_violation` handler together are what make this safe under the concurrency test `ROADMAP.md` item 5 asks for (N parallel bookings of one slot → exactly one succeeds). `no_double_booking` does the real work; the handler only translates the error.

```sql
create or replace function public.patient_appointment_cancel(p_appointment uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.appointments; v_notice int;
begin
  select a.*, pr.cancellation_notice_hours into v_a, v_notice
    from public.appointments a join public.practices pr on pr.id = a.practice_id
   where a.id = p_appointment and a.consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
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
declare v_a public.appointments; v_notice int; v_dur int;
begin
  select a.*, pr.cancellation_notice_hours into v_a, v_notice
    from public.appointments a join public.practices pr on pr.id = a.practice_id
   where a.id = p_appointment and a.consumer_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_a.status not in ('booked', 'confirmed') then raise exception 'not_reschedulable' using errcode = '22023'; end if;
  if v_a.starts_at <= now() + make_interval(hours => v_notice) then
    raise exception 'too_late_to_cancel' using errcode = '22023';
  end if;

  select duration_min into v_dur from public.services where id = v_a.service_id;
  if not exists (
    select 1 from public.get_available_slots(v_a.practitioner_id, v_a.service_id,
                                             p_new_starts::date, p_new_starts::date) g
     where g.starts_at = p_new_starts
  ) then raise exception 'slot_unavailable' using errcode = '23P01'; end if;

  update public.appointments
     set starts_at = p_new_starts,
         ends_at = p_new_starts + make_interval(mins => v_dur),
         reminder_sent_at = null          -- reset: the old reminder described the old time
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

  -- a checked-in appointment always has a queue entry, linked to the client (§13 of the 4NF spec)
  insert into public.queue_entries (practice_id, appointment_id, client_id, source, status)
  select v_a.practice_id, v_a.id, v_a.client_id, 'booked', 'waiting'
   where not exists (select 1 from public.queue_entries where appointment_id = v_a.id);

  perform public._audit(v_a.practice_id, 'appointment.checked_in', 'appointment', p_appointment,
                        jsonb_build_object('by', 'consumer'));
end $$;
```

```sql
-- POPIA s23 (access) and s24 (correction). Today the account page assembles this in the
-- browser from two separate selects; one procedure makes the export auditable and complete.
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

-- behaviour preserved from delete_my_account(); the audit row is written before deletion
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
end $$;
```

`patient_account_export` is new. POPIA s23 gives a data subject the right to know what personal information a responsible party holds, and `COMPLIANCE.md` commits to honouring access requests; today that is a manual process. The export is also the honest companion to `patient_account_delete`, which is irreversible.

---

## 7. Practice — dashboard, calendar, context — 11 procedures

```sql
-- practice_stats / practice_insights keep their jsonb shape (see §2) and are renamed only.
create or replace function public.practice_dashboard_get(p_practice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  return public.practice_stats(p_practice);   -- body unchanged except revenue, see below
end $$;

create or replace function public.practice_insights_get(p_practice uuid, p_weeks int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_member(p_practice);
  if p_weeks not between 1 and 52 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return public.practice_insights(p_practice, p_weeks);
end $$;
```

Inside both, the revenue term changes from the live-join form to the snapshot form (`DATABASE_SCHEMA_4NF.md` §12):

```sql
-- before (0004_app_functions.sql:346) — a price edit rewrites history:
--   (select coalesce(sum(s.price_cents), 0) from public.appointments a
--      join public.services s on s.id = a.service_id where …)
-- after:
     (select coalesce(sum(a.price_cents), 0) from public.appointments a
       where a.practice_id = p_practice and a.status = 'completed'
         and a.starts_at >= now() - interval '30 days')
```

```sql
-- Replaces the five-subquery setup-progress statement in src/app/practice/page.tsx:34
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
```

The `p_to - p_from > interval '90 days'` guard is new and matters: `src/lib/os-data.ts:12` accepts any window the client passes, so a bug or a crafted call can ask one practice for every appointment it has ever had in one round trip. Bounding the window in the procedure is the kind of limit that cannot be added from the client side.

```sql
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

-- "New from BabyBlue" (D-22): bookings the patient made, not ones the practice entered
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

-- the caller's own memberships; no practice argument, so nothing to authorise
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
```

---

## 8. Practice — team and practitioners — 12 procedures

```sql
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

  -- note: verification_status is NOT updatable here; the trigger from D-06 blocks it anyway
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

  -- demoting the last owner would leave the practice unadministrable
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
```

`practice_member_role_set` closes a real gap. `src/app/practice/team/page.tsx:318` changes a role with a direct `update public.practice_members set role = …`, which bypasses `remove_practice_member`'s last-owner guard entirely — an owner can demote themselves to `staff` and leave the practice with no owner. The shipped schema protects against *removing* the last owner but not against *demoting* them.

---

## 9. Practice — services — 5 procedures

```sql
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
```

The `service_in_use` check is new. Nothing today stops a practice deactivating a service that has future appointments booked against it, which leaves those appointments referencing an inactive service — they still exist and still show in the diary, but the patient's view resolves a service that is no longer offered.

---

## 10. Practice — availability and leave — 6 procedures

```sql
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

-- Replace one practitioner's whole weekly template atomically.
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
```

The `exclusion_violation` handler is only reachable because of the new `availability_no_overlap` constraint (`DATABASE_SCHEMA_4NF.md` §16). The delete-then-insert inside one procedure is also what makes this atomic — `src/app/practice/team/page.tsx:195` achieves it today with a `with d as (delete …) insert …` CTE, which works but puts a non-obvious ordering guarantee in a client-side string.

```sql
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

  -- leave is stored in the practice's own timezone, not a hard-coded offset
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
```

Two corrections here. `src/app/practice/team/page.tsx:240` hard-codes `'T00:00:00+02:00'` when building the leave range, so a practice in any timezone other than SAST — and SAST itself if South Africa ever adopts DST — records leave on the wrong days; the procedure uses `practices.timezone`, which the schema already stores for exactly this purpose. And `practice_timeoff_add` counts the appointments the new leave collides with and records that count in the audit entry, rather than booking leave over existing appointments silently.

---

## 11. Practice — clients and consent — 9 procedures

```sql
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
```

The shipped statement (`src/app/practice/clients/page.tsx:24`) runs three correlated subqueries per client row with **no limit at all** — every client of the practice, each with three index lookups. Folding them into one `lateral` with `filter` clauses turns three scans per row into one, and the `limit`/`offset` makes the page bounded. For a practice with 8,000 patient records that is the difference between one round trip and a browser that stops responding.

```sql
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
```

This replaces `select * from public.clients where id = $1`. The `select *` is the clearest example of why a read surface matters: it returns `admin_notes` to every role that can read the table, including `staff` and `practitioner`, and it will return every future column added to `clients` without anyone deciding that it should.

```sql
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

  insert into public.clients (practice_id, first_name, last_name, phone, email)
  values (p_practice, trim(p_first_name), coalesce(trim(p_last_name), ''),
          nullif(p_phone, ''), nullif(p_email, ''))
  returning id into v_id;

  if p_consent then
    insert into public.client_consents (practice_id, client_id, purpose, granted, actor_id, channel)
    values (p_practice, v_id, 'record_storage', true, auth.uid(), 'os');
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
  -- administrative notes only; COMPLIANCE.md forbids clinical content in this field
  perform public._require_role(p_practice,
    array['practice_owner', 'receptionist', 'staff', 'practitioner']::public.practice_role[]);
  update public.clients set admin_notes = nullif(p_notes, '')
   where id = p_client and practice_id = p_practice;
  perform public._audit(p_practice, 'client.notes_updated', 'client', p_client, '{}');
end $$;

-- Consent is append-only. Two procedures, never a toggle, so withdrawal cannot erase the grant.
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
   order by cc.at desc;
end $$;
```

`practice_client_consents_list` is what makes a POPIA consent enquiry answerable: "when did this patient consent, to what, and who recorded it". There is no way to answer that question against the current `boolean` + nullable timestamp.

---

## 12. Practice — appointments — 7 procedures

```sql
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
```

Staff bookings deliberately do **not** go through `get_available_slots`: a receptionist is allowed to book outside the published template (squeezing someone in, a home visit), and `no_double_booking` is the only hard limit. That is the behaviour of the shipped `staff_create_appointment` and it is correct — but note that `source` is validated against `('os','flow')` so a staff booking can never masquerade as a patient booking and earn the "via BabyBlue" chip (D-22).

```sql
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

  -- keep the linked queue entry in step
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
  -- staff are not bound by the practice's own notice window
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
```

---

## 13. Practice — queue (Flow) — 5 procedures

```sql
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

  -- mirror onto the linked appointment, where one exists
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
  -- urgent first, then strict FIFO on seq. skip locked prevents two receptionists
  -- calling the same patient when both click at once.
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
```

`practice_queue_call_next` is new and is the one place in the system that genuinely needs `for update skip locked`: a busy reception has two or three people watching the same queue, and "call the next patient" must hand each of them a *different* patient. Nothing in the current implementation prevents two staff from calling the same person.

`practice_queue_link_client` is what turns an anonymous QR walk-in into a known patient once reception identifies them, which is the transition the `queue_entry_identified` check (`DATABASE_SCHEMA_4NF.md` §13) is designed to allow.

---

## 14. Practice — settings, locations, onboarding — 7 procedures

```sql
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

-- One transaction for the whole onboarding wizard. Today this is seven separate
-- statements (src/app/practice/onboarding/page.tsx:38–45): a failure at step five
-- leaves a half-built practice with no way for the UI to recover.
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
    raise exception 'forbidden' using errcode = '42501';   -- re-assign primary first
  end if;
  delete from public.locations where id = p_location and practice_id = p_practice;
  perform public._audit(p_practice, 'location.removed', 'location', p_location, '{}');
end $$;
```

`practice_settings_update` adds `p_timezone`, which the settings screen cannot currently change at all even though `practices.timezone` drives every slot computation — a practice outside SAST has no way to correct it. It drops `province`, which is now derived (`DATABASE_SCHEMA_4NF.md` §7) and is set by choosing a city on the location instead.

The `demo_activate_practice` call at `src/components/os/OsRoot.tsx:208` is **not** given a procedure. It exists only in `local/9000_demo_helpers.sql` so browser demo signups go live without a platform admin, and it must never reach a real deployment. It stays a demo-only helper, called only when the local database is in use.

---

## 15. Growth — 16 procedures

```sql
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
```

`growth_request_get` is a notable simplification. `src/components/os/GrowthDetail.tsx:24` resolves the practice name with a `coalesce` over *two* subqueries — one scanning `marketing_inbox()` and one reading `practices` — because an operator has no RLS access to `practices` while an owner does. A `security definer` procedure that has already authorised the caller can simply join, which removes a correlated scan of the whole inbox for every detail view.

```sql
create or replace function public.growth_request_status_set(p_request uuid, p_status public.marketing_status)
returns void language plpgsql security definer set search_path = public as $$
declare v public.marketing_requests; v_is_op boolean := public.is_marketing_operator();
begin
  v := public._require_request_access(p_request, false);

  -- the Growth state machine; owner-driven and operator-driven transitions are distinct
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

-- HPCSA Booklet 15 / SADA: creative naming a practitioner needs that practitioner's
-- practice to sign it off before it goes live. Only the owner may decide.
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
  -- only an operator may attach a deliverable; only the practice may attach a brief asset
  if p_kind = 'deliverable' and not public.is_marketing_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_size_bytes > 5242880 then raise exception 'asset_too_large' using errcode = '22023'; end if;

  insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, mime, size_bytes, content)
  values (p_request, auth.uid(), p_kind, p_file_name, p_mime, p_size_bytes, p_content)
  returning id into v_id;

  perform public._audit(v.practice_id, 'growth.asset_added', 'marketing_asset', v_id,
                        jsonb_build_object('kind', p_kind, 'size_bytes', p_size_bytes));
  return v_id;
end $$;

create or replace function public.growth_asset_download(p_asset uuid)
returns bytea language plpgsql security definer set search_path = public as $$
declare v_request uuid; v_content bytea;
begin
  select request_id, content into v_request, v_content from public.marketing_assets where id = p_asset;
  if v_request is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_request_access(v_request, false);
  return v_content;
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

  -- every metric key must exist in metric_definitions; an unknown key fails loudly
  for v_key in select jsonb_object_keys(coalesce(p_metrics, '{}')) loop
    if not exists (select 1 from public.metric_definitions where key = v_key and active) then
      raise exception 'metric_unknown' using errcode = '23503', detail = v_key;
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
```

`growth_asset_add` fixes a role gap: `src/components/os/GrowthDetail.tsx:171` passes `kind` straight from the client, so a practice owner can insert a row marked `deliverable` and a marketing operator can insert one marked `brief_asset`. The RLS policies on `marketing_assets` distinguish the two kinds, so the kind must be *authorised*, not merely accepted.

`growth_reports_list` returns one row per metric rather than a `jsonb` blob, which is what makes a metric chartable over several reporting periods (`DATABASE_SCHEMA_4NF.md` §15).

---

## 16. Platform admin — 5 procedures

```sql
create or replace function public.platform_overview()
returns table (kind text, id uuid, practice_id uuid, practice_name text, label text,
               detail text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select 'practice', p.id, p.id, p.name, p.name, coalesce(pv.city, ''), p.status, p.created_at
    from public.practices p left join public.practice_place_v pv on pv.practice_id = p.id
  union all
  select 'practitioner', pt.id, pt.practice_id, p.name, pt.display_name,
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

  -- the trigger on practitioner_verifications updates practitioners.verification_status (D-06)
  insert into public.practitioner_verifications
         (practice_id, practitioner_id, status, decided_by, note)
  values (v_practice, p_practitioner, p_status, auth.uid(), nullif(p_note, ''));

  perform public._audit(v_practice, 'practitioner.verification', 'practitioner', p_practitioner,
                        jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
end $$;
```

`platform_audit_log` replaces a client-side statement (`src/app/practice/admin/page.tsx:23`) that reads `public.audit_log` joined to `profiles` and `practices` with `order by at desc limit 100` and **no practice filter** — the whole platform's audit trail in one query, keyset-paginated here by `p_before` so it stays bounded as the log grows. Note also that the shipped statement selects `p.full_name`, a column that does not exist on `profiles` (it is `display_name`), so that query fails at runtime today.

---

## 17. Auth plumbing — no procedures

The four statements in [`src/local/auth.ts`](src/local/auth.ts) (`auth.users` lookup, insert, `auth.credentials` insert, credential read) are the PGlite stand-in for Supabase Auth. They are replaced by `supabase.auth.signUp()` / `signInWithPassword()` / `signInWithOtp()`, not by stored procedures. `handle_new_user()` already creates the `profiles` row by trigger and stays as it is.

---

## 18. Grants

Every procedure gets an explicit grant; nothing is executable by `public`.

```sql
-- template, applied per procedure
revoke all on function public.<name>(<args>) from public;
grant execute on function public.<name>(<args>) to <roles>;
```

| Prefix | Granted to |
|---|---|
| `public_*` | `anon`, `authenticated` |
| `patient_*` | `authenticated` |
| `practice_*` | `authenticated` (the procedure authorises the practice internally) |
| `growth_*` | `authenticated` |
| `platform_*` | `authenticated` (the procedure authorises the platform role internally) |
| `_require_*`, `_audit`, `is_*` | not granted to any client role — internal helpers only |

Roles are **not** used to gate which procedure a caller may execute, because a practice owner and a consumer are both `authenticated` in Supabase; authorisation happens inside each procedure against `auth.uid()`. The grant list exists to keep `anon` out of everything except the 11 public procedures.

Once the surface is complete, the table grants that currently back the 82 inline statements are revoked:

```sql
revoke select, insert, update, delete on all tables in schema public from authenticated;
revoke select on all tables in schema public from anon;

-- re-granted selectively: reference data stays directly readable, nothing else does
grant select on public.countries, public.provinces, public.cities,
                public.languages, public.specialities, public.council_bodies
  to anon, authenticated;
```

That revoke is the whole point of the exercise. With it in place RLS becomes the *second* line of defence rather than the first, which is what `ARCHITECTURE.md` claims the design already does.

## 19. Migration order

The procedures can land before the application changes, because adding a function breaks nothing.

| Phase | Work | Risk |
|---|---|---|
| 1 | Add all 106 procedures and their grants. Table grants untouched. | None — purely additive. |
| 2 | Add `tests/db/procedures.test.ts`: one test per procedure for the happy path, one per authorisation branch. | None. |
| 3 | Replace call sites domain by domain: `patient/*` → `practice/*` → `components/os/*` → `lib/*-data.ts`. One typed wrapper module per domain in `src/lib/api/`. | Per-screen, reversible. |
| 4 | After the last call site, revoke the table grants (§18). | This is the breaking step. Any missed statement fails immediately and loudly, which is the desired outcome — run the full suite and click through every screen first. |
| 5 | Delete `query()` from `src/local/db.ts`, keeping `rpc()` and `system()`. | Mechanical. |

Phase 4 is deliberately all-or-nothing: a partial revoke would leave the codebase in a state where some reads are protected and some are not, with nothing to tell them apart.

## 20. What the TypeScript side looks like

One module per domain, replacing hand-written SQL strings with typed calls. This is also what makes the schema-per-brand migration (`MULTITENANCY_PLAN.md`) a server-side concern:

```ts
// src/lib/api/practice.ts
import { rpc } from "@/local/db";

export type ClientRow = {
  client_id: string; full_name: string; phone: string | null; email: string | null;
  consent_record_storage: boolean; consent_at: string | null;
  last_visit: string | null; next_appointment: string | null; visits: number;
};

export const listClients = (uid: string, practiceId: string, q?: string, limit = 100, offset = 0) =>
  rpc<ClientRow>(uid, "practice_clients_list", [practiceId, q ?? null, limit, offset]);

export const grantConsent = (uid: string, practiceId: string, clientId: string,
                             purpose: "record_storage" | "appointment_reminders" | "marketing") =>
  rpc<void>(uid, "practice_client_consent_grant", [practiceId, clientId, purpose, {}]);
```

```ts
// src/local/db.ts — replaces query()/mutate() for application use
export async function rpc<T>(userId: string | null, fn: string, params: unknown[] = []): Promise<T[]> {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  return query<T>(userId, `select * from public.${fn}(${placeholders})`, params);
}
```

The `fn` name is interpolated, not parameterised, because PostgreSQL has no parameter slot for a function name. It must therefore come from this module's own exported wrappers and never from user input — the wrappers are the allowlist. Arguments stay parameterised.

Against real Supabase the same wrappers become `supabase.rpc(fn, {...})`, so `src/lib/api/` is the only layer that changes when the browser database is swapped out.

## 21. Testing

`tests/db/` grows from 82 tests to roughly 270: for each of the 106 procedures, one happy path and at least one authorisation denial.

The denial tests are the important half, and they are what the current 82 inline statements make impossible. For each procedure:

- a member of **another** practice is refused (`forbidden`);
- an unauthenticated caller is refused (`not_authenticated`);
- where the procedure names a role, a member holding a **lesser** role is refused;
- for `anon`-granted procedures, no personal field appears in the result.

Plus the specific regressions these procedures fix, each of which fails against the current code:

| Test | Currently |
|---|---|
| An owner cannot demote themselves while sole owner | Succeeds, leaving the practice ownerless |
| A practice owner cannot attach an asset of kind `deliverable` | Succeeds |
| Two concurrent `practice_queue_call_next` calls return different entries | Both return the same entry |
| `practice_calendar_appointments` refuses a window over 90 days | Unbounded |
| Deactivating a service with future appointments is refused | Succeeds |
| Leave added by a practice in `Africa/Lagos` covers the correct days | Off by an hour, hard-coded `+02:00` |
| `platform_audit_log` exists and returns rows | The equivalent client query selects `profiles.full_name`, which does not exist |
