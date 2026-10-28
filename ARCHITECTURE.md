# ARCHITECTURE

## Overview

```
Browser ──► Next.js (Vercel)  ──► Supabase Postgres (RLS + SQL functions)
              │  marketing site (static)
              │  /api/leads (server, service role, validation, throttle)
              │  App / OS / Growth / Flow UIs (to be wired, use user JWT → RLS)
              └  Flow demo (/c /q /staff, browser storage, fictional data)
```

Principle: **the database is the security boundary.** Clients use the user's JWT; RLS decides what they can see. Only the server-side lead endpoint uses the service-role key.

## Repository layout

| Path | Purpose |
|---|---|
| `src/app/(site)/` | Public marketing site (13 pages) + `site.css` |
| `src/app/(site)/[speciality]`, `[speciality]/[city]`, `in/[city]` | Public listing pages (see below) |
| `src/components/front/` · `src/styles/front.css` | Finder, tiles, reveal, listing page: the hybrid front-door layer |
| `src/lib/directory.ts` · `directory-facets.ts` | Taxonomy and slug helpers (pure) · which pages have practitioners (server only; the swap point for Supabase) |
| `src/app/api/leads/` | Contact-form endpoint |
| `src/app/og/` | Generated Open Graph images |
| `src/app/c`, `q`, `staff`, `find` | Flow demo (fictional data, local storage) |
| `src/components/site/` | Nav, footer, blocks, mockups, forms |
| `src/server/` | Server-only modules (`leads.ts`) |
| `src/lib/` | Config, metadata helper, demo store/seed/utilities |
| `supabase/migrations/` | Schema, functions, RLS (applied in order) |
| `tests/db/` | Postgres tests (PGlite) · `tests/unit/` unit tests |

## Data model (high level)

- **Identity:** `auth.users` → `profiles`. Practice roles in `practice_members` (`practice_owner`, `practitioner`, `receptionist`, `staff`). Platform roles in `platform_roles` (`platform_admin`, `marketing_operator`). A consumer is any signed-in user without a membership.
- **Directory:** `practices` → `locations`, `practitioners` (+ private `practitioner_registrations`), `services`, `practitioner_services`.
- **Scheduling:** `availability_rules` (weekly template), `time_off`, `appointments`, `slot_holds`.
- **Clients:** `clients` per practice (contact, consent, admin notes only — not clinical records).
- **Flow:** `queue_entries` with an unguessable `public_token`.
- **Growth:** `marketing_services`, `marketing_requests` (+ assets, approvals, campaign updates, reports).
- **Platform:** `leads` (service role only), `audit_log` (append-only via functions).

## Public directory pages

`/{speciality}` (e.g. `/physiotherapy`), `/{speciality}/{city}` and `/in/{city}` are statically generated from `directory-facets.ts` with `dynamicParams = false`. The static shell carries the heading, copy, breadcrumbs (JSON-LD), related links and FAQ. Practitioners are filled in client-side by `ListingResults` from the local database (`search_practitioners`, anonymous role), because that database only exists in the browser today. Pairs with nobody listed resolve to an honest empty state, are `noindex` and stay out of the sitemap. The whole site remains `noindex` until `ALLOW_INDEXING=true`.

## Practice directory (real, read-only, not on BabyBlue)

`/directory` and `/directory/p/{id}` are rendered on the server from `src/data/practices/batch-NNN.json` (listed in `index.ts`), loaded by `src/lib/practices/data.ts` and queried by pure functions in `query.ts`. This data is separate from the browser demo database: no diaries, bookings, reviews or verified badges. Listing pages add a "Practice directory" section for the same speciality and city. `GET /api/directory/stats` returns counts only and is what the release script checks in production.

## Roles and access

| Role | Can |
|---|---|
| Anonymous | Read public directory; read open slots; join a queue; read own queue token status |
| Consumer | Above + hold/book/cancel/reschedule own appointments; see own client record |
| Practice owner | Full control of own practice: team, services, availability, clients, Growth requests, audit log |
| Receptionist | Diary, clients, queue, availability for own practice; cannot change settings/team |
| Staff / Practitioner | Own practice's appointments, clients, queue |
| Marketing operator | Submitted Growth requests and their assets/approvals/reports **only** — no clients, appointments or queues |
| Platform admin | Activate practices, verify practitioners, read directory/registrations, manage marketing catalogue. No blanket client-data access |

## Booking flow (concurrency-safe)

1. `get_available_slots(practitioner, service, from, to)` — computes open slots from rules, minus leave, appointments and active holds, honouring duration, buffer and minimum notice. Public, returns no personal data.
2. `hold_slot(...)` — authenticated; re-validates the slot, purges stale holds, reserves 5 minutes (exclusion constraint on holds).
3. `book_appointment(hold)` — converts the hold to a confirmed appointment and links/creates the client; guarded by `no_double_booking` exclusion constraint.
4. `cancel_appointment` / `reschedule_appointment` — consumers obey the practice's notice window; staff don't. Rescheduling re-validates availability for consumers.

## Security controls

- Default-deny RLS on every table; explicit least-privilege grants; leads/platform roles unreachable by client roles.
- `SECURITY DEFINER` functions pin `search_path` and re-check identity/roles.
- Practitioner verification protected by trigger + admin-only function.
- Security headers, server-side validation, honeypot, per-instance throttle (edge/WAF rate limiting recommended in production).
- Audit log for bookings, cancellations, verification and marketing status changes.

## Testing

`npm test` runs 49 tests: availability, booking, double-booking, holds/expiry, cancellation and notice windows, rescheduling, tenant isolation, role boundaries, verification, Flow privacy, Growth workflow and operator isolation, lead validation. Database tests run real migrations on PostgreSQL via PGlite with Supabase-compatible `auth`/roles stubs (`tests/db/harness.ts`).

## Not yet built

Auth UI, consumer app screens, OS UI, Growth UI, Flow on real data, email, monitoring, storage buckets for marketing assets. See ROADMAP.md.
