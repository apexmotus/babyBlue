# BabyBlue Improvement Plan — Scalability, Security, Performance

**Status:** plan. Nothing in this document has been applied to the repository.
**Target:** national scale — 2,000+ practices, ~500,000 appointments/month.
**Compliance scope:** POPIA (Act 4 of 2013) and the HPCSA / SADA ethical rules.
**Companions:** [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md) · [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) · [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md)

---

## 1. Where the system actually stands

Being accurate about the starting point matters, because most of this plan is about things that are *not yet built* rather than things that are slow.

| | State |
|---|---|
| Schema & business logic | Complete and well-designed. 23 tables, 44 SQL functions, default-deny RLS, race-proof booking (D-04, D-05). |
| Database deployment | **None.** Supabase is not provisioned (`ROADMAP.md` "Now" item 1). The only live database is PGlite in the browser (D-17). |
| Server-side data access | **None.** No `@supabase/supabase-js` anywhere in `src/`. Every query runs in the browser. |
| Application data access | 123 SQL statements across 30 files, 74 of them hand-written in React components. |
| Auth | Not built. `src/local/auth.ts` is a PBKDF2 shim. |
| Observability | None. One `console.info` for queries over 400 ms in `src/local/db.ts`. |
| Rate limiting | A per-instance in-memory throttle on `/api/leads` only. |
| Tests | 153 tests (82 of them database tests on PGlite), all single-connection. |

So "making the app faster" is largely **choosing the right shape before the first real row is written**, and this is the cheapest moment in the project's life to do that. Two defects, however, are already real and measurable, and they are §3 and §4.

## 2. Priority order

Ordered by expected damage if left alone, not by effort.

| | Item | Why first | §
|---|---|---|---|
| **P0** | `search_practitioners` is O(total listed practitioners) per search | The public front door. Measured below: 1.3 s at 640 practitioners, growing linearly | §3 |
| **P0** | Directory search is unindexable (`ilike '%q%'` ×3) | Sequential scan on every search | §4 |
| **P0** | Connection model | Browser-direct Postgres does not survive contact with 2,000 practices | §6 |
| **P1** | Unbounded reads | Four procedures with no `LIMIT` at all | §7 |
| **P1** | Missing indexes on every foreign key and filter | Sequential scans as soon as tables are non-trivial | §8 |
| **P1** | Revenue reporting is retroactively mutable | Reports a practice may rely on commercially | §9 |
| **P1** | No rate limiting on booking, holds or queue-join | Slot-hold exhaustion is a trivial denial of service | §10 |
| **P2** | `audit_log` growth | ~6M rows/year at target scale | §11 |
| **P2** | Dashboard aggregates recomputed per page load | `practice_stats` is 8 subqueries | §12 |
| **P2** | No observability | Cannot find the next problem | §13 |
| **P2** | Security hardening beyond RLS | §14–§16 | §14 |

## 3. P0 — The directory search is linear in the size of the directory

### Measured

Real migrations applied to PostgreSQL (PGlite 0.5.11, the same engine as `tests/db/harness.ts`), seeded with N practices × 2 listed practitioners × 3 services, Mon–Fri 08:00–16:00 availability, `limit 40`:

| Practices | Listed practitioners | `search_practitioners(…, 40)` | `get_available_slots` (1 practitioner, 14 d) |
|---|---|---|---|
| 10 | 20 | 41 ms | 1 ms |
| 40 | 80 | 148 ms | 1 ms |
| 160 | 320 | 608 ms | 1 ms |
| 320 | 640 | 1,283 ms | 1 ms |

A 32× increase in corpus size gives a 31× increase in latency. The function returns 40 rows throughout. **`limit 40` is doing nothing.**

### Cause

`0004_app_functions.sql:25–57`. The `next_available` column is a correlated subquery containing `cross join lateral public.get_available_slots(p.id, s.id, current_date, current_date + 13)` — evaluated for **every active service of every matching practitioner** — and the outer query is `order by r.next_available nulls last`. Ordering on a computed column forces PostgreSQL to materialise every candidate row before it can apply the `LIMIT`. Per search the work is:

```
matching practitioners × services each × 14 days × slots/day × 3 anti-joins (time_off, appointments, slot_holds)
```

At 2,000 practices × 2 practitioners × 4 services × 14 days × 16 slots/day that is on the order of **3.5 million slot evaluations per search request**, single-threaded, uncached. Extrapolating the measured line to 4,000 listed practitioners gives ≈8 s in PGlite; server-grade PostgreSQL is perhaps 5–20× faster, so ≈0.4–1.6 s of CPU **per search**, on one core, with no caching. Two concurrent searches per second saturates a small instance.

This is not hypothetical headroom: the practice directory already holds 1,434 real practices (`PROGRESS.md`), and `/{speciality}/{city}` listing pages (D-16) call this function on every page view.

### Fix — two phases

**Phase 1: page first, then compute.** Filter and `LIMIT` the practitioners, *then* compute availability for the 40 rows that survive. Measured against the same corpus:

| Listed practitioners | Current | Two-phase | Speedup |
|---|---|---|---|
| 320 | 600 ms | 80 ms | 7.5× |
| 640 | 1,283 ms | 104 ms | 12.3× |

Current cost doubles with the corpus; the two-phase cost is nearly flat (80 → 104 ms), because it depends on the page size rather than the corpus. The implementation is `public_practitioner_search` in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) §5.

**This changes product behaviour and that has to be acknowledged.** You cannot order by "soonest available" without computing it for everyone. Phase 1 therefore orders by verified-then-name, and the "soonest available" promise is lost until Phase 2.

**Phase 2: maintain `next_available` as a column.** Restore soonest-first ordering at zero query cost.

```sql
alter table public.practitioners
  add column next_available_cached timestamptz,
  add column next_available_at     timestamptz;   -- when the cache was computed

create index practitioners_next_available
  on public.practitioners (listing_status, next_available_cached nulls last)
  where listing_status = 'listed';
```

Recomputed for **one practitioner** (≈1 ms, per the table above) whenever their availability could have changed:

```sql
create or replace function public.refresh_next_available(p_practitioner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_next timestamptz;
begin
  select min(sl.starts_at) into v_next
    from public.services s
    join public.practitioner_services ps on ps.service_id = s.id and ps.practitioner_id = p_practitioner
    cross join lateral public.get_available_slots(p_practitioner, s.id, current_date, current_date + 13) sl
   where s.active;
  update public.practitioners
     set next_available_cached = v_next, next_available_at = now()
   where id = p_practitioner;
end $$;

-- fired on anything that can change a practitioner's open slots
create trigger appointments_refresh_availability
  after insert or update of starts_at, ends_at, status or delete on public.appointments
  for each row execute function public.refresh_next_available_trg();
-- …likewise on availability_rules, time_off, practitioner_services, services(active, duration_min)
```

Slot *holds* deliberately do **not** fire the trigger: they last five minutes, and firing on every hold would make the cache the busiest write in the system for a value that is only a hint. A staleness window of a few minutes on "next available" is acceptable; a stale *booking* is not, and that is guarded by `no_double_booking`, not by this cache.

A safety net for drift, since the cache depends on `current_date`:

```sql
-- pg_cron, hourly: refresh anything stale or past
select cron.schedule('refresh-next-available', '7 * * * *', $$
  select public.refresh_next_available(id) from public.practitioners
   where listing_status = 'listed'
     and (next_available_at is null
          or next_available_at < now() - interval '6 hours'
          or next_available_cached < now())
   limit 500;
$$);
```

### Also: bound the horizon

`get_available_slots` accepts a 31-day range and `search_practitioners` asks for 14. Patient-facing search needs "is there anything this week", not a fortnight of slots. Reducing the search horizon to **7 days** halves the work for an answer no one reads past the first entry; the full 31-day range stays available on the practitioner's own booking page, where it is called once.

## 4. P0 — Directory search cannot use an index

`search_practitioners` filters with three leading-wildcard predicates:

```sql
p.display_name ilike '%' || p_q || '%' or p.speciality ilike '%' || p_q || '%'
  or pr.name ilike '%' || p_q || '%'
  or exists (select 1 from services … where s.name ilike '%' || p_q || '%')
```

A leading `%` makes a B-tree index unusable, so each is a sequential scan, and the fourth is a correlated scan of `services` per row. `src/app/practice/clients/page.tsx` and the two client-search statements have the same shape.

### Fix: a generated `tsvector` plus trigram indexes for the fuzzy case

```sql
create extension if not exists pg_trgm;
create extension if not exists unaccent;

alter table public.practitioners add column search_vector tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(display_name, '') || ' ' || coalesce(title, '') || ' ' ||
      coalesce(speciality_slug, '') || ' ' || coalesce(bio, ''))
  ) stored;

create index practitioners_search on public.practitioners using gin (search_vector);
create index practitioners_name_trgm on public.practitioners using gin (display_name gin_trgm_ops);
create index practices_name_trgm    on public.practices    using gin (name gin_trgm_ops);
create index clients_name_trgm      on public.clients      using gin
  ((first_name || ' ' || last_name) gin_trgm_ops);
```

`to_tsvector` is `IMMUTABLE` only with an explicit configuration name — `to_tsvector(text)` without one reads `default_text_search_config` and is `STABLE`, so a generated column using it is rejected exactly as in `DATABASE_SCHEMA_4NF.md` §9. `'simple'` is used rather than `'english'` deliberately: practitioner and practice names are largely proper nouns, often isiZulu, Sesotho or Afrikaans, and English stemming would mangle them.

Service names stay out of `search_vector` because they live on another table; a separate `practice_search` materialised view (§12) covers "find me a practice that does X".

Expected effect: `where search_vector @@ websearch_to_tsquery('simple', $1)` becomes a GIN index scan, so the filter cost stops scaling with corpus size and the two-phase structure from §3 gets a cheap first phase. Trigram indexes handle the misspelling case (`gin_trgm_ops` with `%` similarity), which `ilike` never did well anyway.

## 5. Capacity model

So the targets below are concrete rather than aspirational:

| | At 2,000 practices |
|---|---|
| Practitioners | ~5,000 (2.5 per practice) |
| Services | ~20,000 |
| `availability_rules` | ~25,000 (5 weekdays × 5,000) |
| Appointments | 500,000/month → **6M/year** |
| `slot_holds` | ~50,000/day transient, 5-minute TTL |
| `queue_entries` | ~40,000/day → 14M/year |
| `audit_log` | ~6 rows per appointment → **36M/year** |
| `clients` | ~2M |

The two tables that grow without bound are `audit_log` and `queue_entries`. `appointments` grows fast but stays queryable with the right indexes. Nothing here is large for PostgreSQL — the risk is query shape, not data volume.

## 6. P0 — Connection and deployment model

Today every query is issued from the browser. Against real Supabase that means every patient's browser holds a PostgreSQL session, and PostgreSQL's per-connection cost (~10 MB, one backend process) makes that untenable well before 2,000 practices.

**Target shape:**

```
Browser ──► Next.js Server Components / Route Handlers (Vercel, Node runtime, Fluid Compute)
              │   user's JWT forwarded → RLS still decides
              ├─► Supabase: Supavisor in transaction mode (pooled)  ← all request-path queries
              ├─► Supabase: direct connection (session mode)         ← migrations only
              └─► Runtime cache for public, non-personal reads
```

Decisions:

1. **Pooled, transaction mode, for everything in the request path.** Supavisor in transaction mode multiplexes thousands of clients onto a few dozen backends. The constraint it imposes is real and must be designed around: **no session state**. `set local role` and `set_config(..., true)` inside a transaction are fine; anything outside one is not. The current `src/local/db.ts` already wraps role and identity in a transaction per call, so this translates directly.
2. **Move the request path to the server.** Public directory and listing pages (D-16, D-17) become Server Components calling the `public_*` procedures. This is what D-17 names as the swap point, and it is also what makes caching and rate limiting possible at all. Authenticated screens may still call Supabase from the browser with the user's JWT where latency matters, but through the typed `src/lib/api/` wrappers ([`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) §20).
3. **`statement_timeout` per role.** Nothing currently stops a single query consuming a backend indefinitely.

```sql
alter role anon          set statement_timeout = '5s';
alter role authenticated set statement_timeout = '15s';
alter role service_role  set statement_timeout = '60s';
alter role anon          set idle_in_transaction_session_timeout = '10s';
alter role authenticated set idle_in_transaction_session_timeout = '30s';
```

`anon` gets the tightest budget because it is the only unauthenticated, unmetered surface.

4. **Cache public reads at the edge.** Directory listings, speciality and city facets, and practitioner profiles are identical for every viewer and contain no personal data.

| Data | TTL | Invalidate on |
|---|---|---|
| City / speciality facets | 1 h | practitioner listing change |
| Listing page results | 60 s, `stale-while-revalidate` | — |
| Practitioner profile | 5 min | profile or verification change |
| Available slots | **never** | — |
| Anything behind auth | **never** | — |

Slots are deliberately uncached. A patient shown a stale slot gets `slot_unavailable` at hold time, which is correct but is the single worst moment in the product to be wrong.

## 7. P1 — Unbounded reads

Four statements can return an entire table:

| Call site | Unbounded in | At target scale |
|---|---|---|
| `src/app/practice/clients/page.tsx:24` | every client of the practice, plus 3 correlated subqueries each | 8,000 rows × 3 lookups |
| `src/lib/os-data.ts:12` | any date window the client asks for | a practice's entire history |
| `src/app/practice/admin/page.tsx:23` | `audit_log` across all practices (`limit 100`, no filter, no keyset) | scans 36M rows to find 100 |
| `src/app/practice/queue/page.tsx:31` | all entries completed in the last 6 hours | fine today, grows with volume |

Every replacement procedure in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) takes `p_limit` clamped with `least(greatest(p_limit, 1), <ceiling>)` and, where ordering is temporal, keyset pagination (`p_before timestamptz`) rather than `OFFSET`. `OFFSET` on page 500 of the audit log reads 50,000 rows to discard 49,900; keyset reads 100.

## 8. P1 — Indexes

The shipped schema indexes `(practice_id, starts_at)`, `(consumer_id, starts_at)`, `(practitioner_id, weekday)`, `(practice_id, status, seq)`, `(practice_id, at desc)`, `(user_id)` on members, and the GiST indexes behind the exclusion constraints. Several foreign keys and every status filter are unindexed.

```sql
-- appointments: the three access patterns the procedures actually use
create index appointments_practitioner_day on public.appointments (practitioner_id, starts_at)
  where status in ('booked', 'confirmed', 'checked_in', 'in_progress');
create index appointments_client on public.appointments (client_id, starts_at desc);
create index appointments_service on public.appointments (service_id);
create index appointments_practice_source on public.appointments (practice_id, source, created_at desc)
  where source = 'app';                      -- the "New from BabyBlue" card (D-22)
create index appointments_reminders on public.appointments (starts_at)
  where reminder_sent_at is null and status in ('booked', 'confirmed');

-- partial indexes matter here: ~70% of rows will eventually be 'completed' or 'cancelled',
-- and no hot query looks at those. Excluding them keeps the hot indexes small enough to stay cached.

create index slot_holds_expiry on public.slot_holds (expires_at);
create index slot_holds_consumer on public.slot_holds (consumer_id);

create index practitioners_listed on public.practitioners (speciality_slug, listing_status)
  where listing_status = 'listed';
create index practitioners_practice on public.practitioners (practice_id, display_name);
create index practitioner_services_service on public.practitioner_services (service_id);
create index services_practice_active on public.services (practice_id) where active;

create index clients_practice_name on public.clients (practice_id, last_name, first_name);
create index time_off_practice on public.time_off (practice_id, during);
create index queue_entries_token on public.queue_entries (public_token);   -- unique already; explicit
create index queue_entries_appointment on public.queue_entries (appointment_id)
  where appointment_id is not null;

create index marketing_requests_operator on public.marketing_requests (status, updated_at desc)
  where status <> 'draft';                   -- the operator inbox
create index marketing_requests_assigned on public.marketing_requests (assigned_to, updated_at desc);
create index audit_log_entity on public.audit_log (entity, entity_id, at desc);
create index audit_log_actor on public.audit_log (actor_id, at desc);
```

`audit_log_entity` is the one that fixes `appointment_history`, which currently filters `entity = 'appointment' and entity_id = $1` against an index on `(practice_id, at desc)` — so reading one appointment's history scans every audit row for that practice.

**RLS makes indexes matter more than usual.** A policy's `USING` clause is evaluated per candidate row, so an unindexed policy predicate turns every query on that table into a sequential scan *plus* a function call per row. `is_member(practice_id)` is called for each row considered, which is why `practice_members (practice_id, user_id)` being the primary key is load-bearing, and why the helper functions must stay `STABLE` so PostgreSQL can cache the result within a statement.

## 9. P1 — Revenue reporting must not be retroactively mutable

`practice_stats` and `practice_insights` compute revenue by joining live `services.price_cents` (`0004_app_functions.sql:346`, `:391`). Raising a consultation fee rewrites the practice's reported revenue for every past appointment.

Fixed by the price snapshot in `DATABASE_SCHEMA_4NF.md` §12 and the revenue term in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) §7. Beyond correctness it is also faster — `sum(a.price_cents)` with no join, on an index-only scan.

## 10. P1 — Rate limiting and abuse

The only throttle in the system is an in-memory counter on `/api/leads`, which resets on every deployment and is per-instance (so useless behind more than one serverless instance). Meanwhile these are reachable by `anon` or any signed-in user:

| Surface | Abuse | Consequence |
|---|---|---|
| `hold_slot` | Hold every slot of a practitioner in a loop | **Denial of service on a real practice's diary.** Holds last 5 minutes; a loop keeps a diary permanently unbookable. No per-user limit exists. |
| `join_queue` | Flood a practice's queue with walk-ins | Reception unusable; `anon`-callable with only a name |
| `get_queue_status` | Enumerate tokens | 24 hex chars (96 bits) — not feasible, but worth rate limiting anyway |
| `search_practitioners` | Repeat uncached searches | Each one is the §3 cost |
| `create_practice` | Create practices in a loop | Any signed-in user; pollutes the admin queue |

### Database-level quota, because it cannot be bypassed

```sql
-- at most 3 live holds per user, and at most 10 holds per user per hour
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

create trigger slot_holds_quota before insert on public.slot_holds
  for each row execute function public.slot_holds_quota();
```

Three concurrent holds is generous for a real patient comparing two or three times, and ruinous for a loop. The hourly ceiling needs `hold.created` to be audited, which it currently is not.

### Edge layer

| Surface | Limit |
|---|---|
| `POST /api/leads` | 5 / hour / IP (replacing the in-memory counter) |
| `public_queue_join` | 3 / hour / IP, 10 / hour / practice |
| `public_practitioner_search` | 60 / minute / IP |
| `patient_slot_hold` | 10 / hour / user (edge, mirroring the trigger) |
| `practice_create` | 3 / day / user |
| Auth endpoints | Supabase Auth's own limits, plus CAPTCHA on signup |

Vercel's WAF handles the IP-keyed rules; the per-user rules need the JWT, so they belong in the Route Handler. `ARCHITECTURE.md` already names edge rate limiting as "recommended in production" — this is the specification of what that means.

## 11. P2 — Table growth

### `audit_log` — partition by month

~36M rows/year. Partitioning keeps indexes small and makes retention a `drop table` instead of a 10M-row `DELETE`. **Verified to work**:

```sql
create table public.audit_log (
  id bigint generated always as identity,
  at timestamptz not null default now(),
  actor_id uuid, practice_id uuid,
  action text not null, entity text not null, entity_id uuid,
  meta jsonb not null default '{}',
  primary key (id, at)                  -- partition key must be in the PK
) partition by range (at);

create table public.audit_log_2027m01 partition of public.audit_log
  for values from ('2027-01-01') to ('2027-02-01');
create table public.audit_log_default partition of public.audit_log default;

create index on public.audit_log (practice_id, at desc);
create index on public.audit_log (entity, entity_id, at desc);
```

The `default` partition is not optional — without it an insert outside every declared range fails, which would make an audited write fail, which would make the *business operation* fail. Monthly partitions created a quarter ahead by `pg_cron`, and `pg_partman` if the manual list becomes tedious.

### `appointments` — **do not partition**

The obvious move at this scale is to partition `appointments` by `starts_at`. **It is not available**, and this is worth stating plainly because it is an easy mistake to make later:

```
create table appointments (…, primary key (id, starts_at),
  constraint no_double_booking exclude using gist (practitioner_id with =, during with &&))
  partition by range (starts_at);
ERROR:  unique constraint on partitioned table must include all partitioning columns
```

PostgreSQL cannot enforce an exclusion constraint across partitions. Partitioning `appointments` therefore means **giving up `no_double_booking`** — the guarantee D-05 is built on, and the one thing in the schema that makes concurrent booking safe by construction. Per-partition exclusion constraints would not help: an overlap spanning a partition boundary would be accepted.

Growth is handled by archival instead, which keeps the hot table small while leaving the constraint intact:

```sql
-- same columns, no exclusion constraint: these rows are closed and cannot be double-booked
create table public.appointments_archive (like public.appointments including defaults including indexes);

-- pg_cron, monthly
create or replace function public.archive_appointments(p_before date)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_moved bigint;
begin
  with moved as (
    delete from public.appointments
     where starts_at < p_before and status in ('completed', 'cancelled', 'no_show')
     returning *
  ) insert into public.appointments_archive select * from moved;
  get diagnostics v_moved = row_count;
  return v_moved;
end $$;
```

Only terminal statuses move, and only past ones, so nothing live can be archived. A `UNION ALL` view covers the rare report that needs both. At 6M rows/year with a 24-month hot window, `appointments` stabilises around 12M rows — entirely comfortable for the partial indexes in §8.

### `slot_holds` — actually delete them

`hold_slot` purges expired holds opportunistically on each call, so a quiet period leaves them to accumulate inside the GiST index that every booking consults.

```sql
select cron.schedule('purge-slot-holds', '*/5 * * * *',
  $$delete from public.slot_holds where expires_at < now() - interval '1 minute'$$);
```

### `queue_entries` — monthly partitions, 13-month retention

14M rows/year and no query ever looks past today. Partition by `joined_at` (no exclusion constraint, so partitioning is available), drop partitions older than 13 months. Note that `seq` is `GENERATED ALWAYS AS IDENTITY` and identity is per-partition, so **FIFO ordering must become `(joined_at, seq)`** or the sequence must move to a shared one. This is exactly the kind of correctness detail that makes partitioning worth doing deliberately rather than reactively.

### Retention

POPIA s14 requires that records not be kept longer than necessary; the HPCSA and SADA rules set *minimums* that override it for clinical records.

| Data | Retention | Basis |
|---|---|---|
| `appointments` (completed) | 6 years after last visit | HPCSA record-keeping; the appointment is part of the treatment record |
| Minors' appointments | until age 21 | HPCSA |
| `clients` | 6 years after last appointment, then anonymise | POPIA s14 + HPCSA |
| `client_consents` | life of the client record + 6 years | Evidence of lawful processing |
| `audit_log` | 7 years | Longest applicable; also the security trail |
| `queue_entries` | 13 months | No clinical content |
| `slot_holds` | minutes | Transient |
| `leads` | 24 months, or on request | POPIA s11(3) withdrawal |
| `marketing_assets` | 3 years after `closed` | Commercial record; HPCSA advertising evidence |

Anonymisation rather than deletion for `clients`, because deleting a client row cascades to appointments the practice is legally required to keep. The anonymiser clears names, contact details and `admin_notes`, keeps the appointment skeleton, and writes an audit row.

## 12. P2 — Precompute the dashboards

`practice_stats` runs 8 correlated subqueries over `appointments` per call; `practice_insights` runs weekly trend, weekday/hour heatmap, source breakdown and repeat-client counts over an 8-week window. Both are called on page load, and `useQuery` re-runs on **every database change in any tab** (`onDbChange` in `src/local/hooks.ts`) — so one booking recomputes the whole dashboard for every open screen.

Three layers:

1. **Today's numbers stay live.** They read one day of one practice via `appointments_practice_day`; that is already cheap and must be current.
2. **Historical aggregates become a materialised view**, refreshed every 15 minutes.

```sql
create materialized view public.practice_daily_stats as
  select practice_id, starts_at::date as day,
         count(*) filter (where status = 'completed')                  as completed,
         count(*) filter (where status = 'no_show')                    as no_shows,
         count(*) filter (where status = 'cancelled')                  as cancelled,
         count(*) filter (where source = 'app')                        as via_babyblue,
         coalesce(sum(price_cents) filter (where status = 'completed'), 0) as revenue_cents,
         count(distinct client_id)                                     as distinct_clients
    from public.appointments
   group by practice_id, starts_at::date;

create unique index practice_daily_stats_pk on public.practice_daily_stats (practice_id, day);

select cron.schedule('refresh-practice-stats', '*/15 * * * *',
  $$refresh materialized view concurrently public.practice_daily_stats$$);
```

`concurrently` requires the unique index and avoids locking readers. A 15-minute lag on last month's numbers is invisible; a 15-minute lag on "patients waiting right now" would not be, which is why layer 1 stays live.

3. **Stop refetching everything on every change.** `onDbChange` is a single global signal. It should carry which table changed so a queue insert refreshes the queue, not the 30-day revenue.

## 13. P2 — Observability

Currently one `console.info` for queries over 400 ms, in the browser.

| Layer | Tool | What it must answer |
|---|---|---|
| Postgres | `pg_stat_statements` | Which 20 statements consume the most total time |
| Postgres | `auto_explain` (`log_min_duration = 2s`) | Why that one query was slow, with its plan |
| Postgres | `pg_stat_user_tables` | Sequential scans on tables that have indexes |
| Application | Structured logs with a request id | Trace one patient's booking end to end |
| Application | Sentry | Errors, with the RPC name as the grouping key |
| Platform | Vercel observability | p50/p95/p99 per route |
| Product | A `rpc_latency` custom metric | Per-procedure latency, which is the unit that matters once §1 is done |

Four alerts worth having from day one, each tied to something in this document:

- `no_double_booking` violations per hour > 0 → a UI is racing where it should hold first.
- `slot_unavailable` rate > 5% of hold attempts → stale slot data, i.e. the §6 caching rule is being broken.
- p95 of `public_practitioner_search` > 300 ms → §3 has regressed.
- `audit_log` insert failures > 0 → **an audited write is failing**, which under POPIA s17 is a compliance event, not just an error.

## 14. Security — the gaps RLS does not cover

D-04 and the `SECURITY DEFINER` discipline are genuinely good. These are the holes around them.

### 14.1 Reads are gated only by RLS

Covered in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) §1 and §18. The concrete consequence: `select * from public.clients where id = $1` (`src/app/practice/clients/[id]/page.tsx:19`) returns `admin_notes` to `staff` and `practitioner` roles, and will return every future column. The revoke in §18 of that document is the fix.

### 14.2 Privilege escalation paths in the shipped schema

| Path | Effect | Fix |
|---|---|---|
| `update public.practice_members set role = …` from the client (`team/page.tsx:318`) | An owner can demote themselves and leave the practice with **no owner**; `remove_practice_member` guards removal but nothing guards demotion | `practice_member_role_set` with the last-owner check |
| `marketing_assets.kind` passed from the client (`GrowthDetail.tsx:171`) | A practice owner can insert a row marked `deliverable`; an operator can insert `brief_asset`. RLS distinguishes the kinds, so the kind must be authorised | `growth_asset_add` authorises `kind` against the caller's role |
| `create_practice` callable by any signed-in user with no limit | Admin queue flooding | Rate limit (§10) + an onboarding gate |
| `practitioners.verification_status` | Already correctly guarded by trigger + admin-only function (D-06) | No change — this one is right |

### 14.3 `SECURITY DEFINER` hygiene

All existing functions pin `search_path = public`, which is correct and the most important part. Two additions:

- **`revoke execute … from public` on every function.** PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default, so a `SECURITY DEFINER` function is callable by every role unless explicitly revoked. The grant tables in `0003_rls_and_grants.sql` grant to `anon`/`authenticated` but, if the default grant is not revoked first, the intended restriction is not actually enforced. This is the highest-value one-line change in this document.

```sql
alter default privileges in schema public revoke execute on functions from public;
revoke execute on all functions in schema public from public;
-- then grant explicitly, per STORED_PROCEDURES.md §18
```

- **`force row level security`** on tables holding personal data. Table owners bypass RLS by default; `FORCE` makes the owner obey its own policies, which matters the moment a migration or a job runs as the owner.

```sql
alter table public.clients          force row level security;
alter table public.appointments     force row level security;
alter table public.client_consents  force row level security;
alter table public.queue_entries    force row level security;
alter table public.slot_holds       force row level security;
```

### 14.4 Secrets and keys

| | Rule |
|---|---|
| `service_role` key | Server-only, never in a `NEXT_PUBLIC_` variable, never in a Client Component. Currently used only by `/api/leads` (D-08) — keep it that way. |
| Key rotation | Quarterly, and immediately on any contractor offboarding (D-20 added a collaborator). |
| `anon` key | Public by design; its safety depends entirely on RLS and on §14.3's revoke. |
| Local `.env` | Already git-ignored. Add a pre-commit secret scan. |
| PGlite demo | Holds fictional data only (D-13, D-17) and must never be pointed at a real database. |

### 14.5 Headers and transport

`next.config.mjs` already sets security headers. For a medical platform, add:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:;
  connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
Cross-Origin-Opener-Policy: same-origin
Referrer-Policy: strict-origin-when-cross-origin
```

`geolocation=(self)` rather than `()` because "practices near me" is a plausible feature; `camera`/`microphone` stay off until video consults (`ROADMAP.md` "Later") actually arrive.

## 15. POPIA

`COMPLIANCE.md` sets the policy. This is what it requires of the database and the application.

| Section | Requirement | State | Action |
|---|---|---|---|
| s8–s11 | Lawful processing, consent | Consent is a boolean that withdrawal erases | `client_consents` event series (4NF §10) |
| s11(3) | Withdrawal at any time | Not representable | `practice_client_consent_withdraw` |
| s13–s14 | Purpose limitation, retention | No retention policy implemented | §11 retention table + anonymiser |
| s17 | Documentation of processing | `audit_log` covers bookings and status changes, not reads | Audit reads of `admin_notes` and client exports |
| s19 | Security safeguards | RLS, composite FKs, exclusion constraints | §14 |
| s22 | Breach notification to the Regulator and data subjects | No detection, no process | §13 alerts + a written runbook with the 72-hour clock |
| s23 | Right of access | Manual | `patient_account_export` (procedures §6) |
| s24 | Right to correction | Partial — patients edit their profile, not the practice's client record | A correction-request flow |
| s72 | Cross-border transfer | **Supabase region not yet chosen** | See below |

### Data residency

POPIA s72 permits transfer outside South Africa only under specific conditions (comparable law, consent, contractual safeguards). `ROADMAP.md` says "project in an appropriate region" without naming one, and `practices.timezone` defaults to `Africa/Johannesburg`.

**Choose a region before the first real patient record exists.** Supabase has no South African region today, so the realistic options are:

1. **`eu-west-1` / `eu-central-1`** — GDPR-adequate, which is the most defensible s72 basis available, and the shortest path. Latency from South Africa ≈150–180 ms, noticeable but acceptable for a booking app, and §6's edge caching covers the public pages where it would be felt most.
2. **Self-hosted PostgreSQL in a South African data centre** — fully compliant, far more operational work, loses Supabase Auth and Storage.

The recommendation is option 1, documented as an explicit s72 determination with the operator agreement in place, and option 2 noted as the migration path if a client or the Regulator requires local residency. The migrations are plain PostgreSQL (D-03), so that path stays open.

### Information Officer

POPIA requires a registered Information Officer. `COMPLIANCE.md` should name the role, and `ROADMAP.md` already flags that a monitored contact address is needed before the site may be indexed — the same person.

## 16. HPCSA / SADA ethical rules

These bite hardest on Growth, which is the product that advertises healthcare practitioners.

| Rule | Requirement | Action |
|---|---|---|
| HPCSA Booklet 15 | Advertising must be factual and verifiable; no claims of superiority, no testimonials implying guaranteed outcomes | A pre-publication checklist as `marketing_approvals` items, created by the operator and signed off by the practice owner. `growth_approval_decide` already restricts sign-off to `practice_owner` — the *content* rules need to become mandatory checklist rows. |
| HPCSA | Only a registered practitioner may be advertised as one | The verified badge is platform-controlled (D-06) and backed by `practitioner_registrations`. Keep "unverified" visibly distinct — it already is. |
| HPCSA / SADA | Canvassing and touting prohibited | Keeps `ROADMAP.md`'s "claim a listing" honest: a practice must prove the listing is theirs, and BabyBlue must not imply endorsement of unclaimed directory entries. The directory already states it is read-only and not on BabyBlue. |
| HPCSA | Record retention: adults 6 years from last entry; minors to age 21 | §11 retention table |
| SADA | Dental-specific advertising constraints | Per-speciality checklist templates, which the `metric_definitions` / checklist pattern supports |
| HPCSA | Fee transparency | D-11 holds — no prices published. When they are, `appointments.price_cents` is the snapshot that makes a quote verifiable. |

Reviews remain out of scope until legal review (`ROADMAP.md`), which is the right call: a review implying a guaranteed outcome is a Booklet 15 problem for the *practitioner*, not just for BabyBlue.

## 17. Phased plan

Each tier names the metric that triggers the next.

### Tier 0 — before the first real patient record (blocking)

| | Item | § |
|---|---|---|
| 1 | Choose the Supabase region and record the s72 determination | §15 |
| 2 | `revoke execute … from public` on all functions; `alter default privileges` | §14.3 |
| 3 | `force row level security` on personal-data tables | §14.3 |
| 4 | `statement_timeout` per role | §6 |
| 5 | Apply the 4NF rewrite and bump `LOCAL_DB_VERSION` | 4NF §1 |
| 6 | Add the 106 procedures; revoke table grants | Procedures §19 |
| 7 | All indexes in §8 | §8 |
| 8 | Two-phase `public_practitioner_search` + `search_vector` | §3, §4 |
| 9 | Price snapshot on `appointments` | §9 |
| 10 | Slot-hold quota trigger + edge rate limits | §10 |
| 11 | Supavisor transaction mode; move public reads server-side | §6 |
| 12 | `pg_stat_statements`, `auto_explain`, Sentry, the four alerts | §13 |
| 13 | Multi-connection concurrency test (`ROADMAP.md` item 5) — all 82 existing database tests are single-connection and cannot catch a real race | §18 |

Items 2, 3 and 13 are the ones that are cheap now and expensive later.

### Tier 1 — at ~200 practices

Trigger: p95 of any `practice_*` procedure > 500 ms, or > 50k appointments.

- `practice_daily_stats` materialised view + `pg_cron` refresh (§12)
- `next_available_cached` with triggers, restoring soonest-first ordering (§3 phase 2)
- `slot_holds` purge job (§11)
- Scoped change notifications instead of one global signal (§12)
- Retention jobs and the client anonymiser (§11)
- A read replica for public directory traffic

### Tier 2 — at ~1,000 practices

Trigger: `audit_log` > 10M rows, or > 1M appointments.

- Partition `audit_log` by month, `pg_partman`, 7-year retention (§11)
- Partition `queue_entries`, fixing FIFO ordering to `(joined_at, seq)` (§11)
- `appointments_archive` with a 24-month hot window — **not** partitioning (§11)
- Connection-pool sizing from measured concurrency, not guesswork

### Tier 3 — at ~5,000 practices or the first white-label tenant

Trigger: a tenant requires isolated backups, or a region requires local residency.

- Schema-per-brand ([`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md))
- Per-region databases for residency
- Promote the largest tenants to dedicated databases

## 18. Testing this plan

All 82 existing database tests run on a single PGlite connection, which means **no concurrency guarantee in this schema is currently tested**. `no_double_booking` and `no_double_hold` are the system's two most important correctness properties and neither has a test that could fail.

| Test | Shape |
|---|---|
| Concurrent booking | N=20 parallel `patient_appointment_book` on one slot against real PostgreSQL → exactly 1 success, 19 `slot_unavailable` |
| Concurrent hold | N=20 parallel `patient_slot_hold` on one slot → exactly 1 success |
| Concurrent queue call | 3 parallel `practice_queue_call_next` → 3 distinct entries |
| Hold quota | 4th concurrent hold by one user → `too_many_holds` |
| Search cost | `public_practitioner_search` p95 under a seeded 2,000-practice corpus, asserted under a budget, in CI |
| Index coverage | `explain` every procedure against the seeded corpus; fail on `Seq Scan` over a table with more than 10,000 rows |
| RLS completeness | For every table, assert `anon` and a member of another practice read 0 rows — generated from the catalogue, so a new table without a policy fails |
| Retention | The anonymiser clears contact fields and preserves the appointment skeleton |
| Function grants | No function in `public` is executable by `PUBLIC` — a catalogue assertion, so §14.3 cannot silently regress |

The last one is worth singling out: it converts the most dangerous default in PostgreSQL into a test that fails loudly.
