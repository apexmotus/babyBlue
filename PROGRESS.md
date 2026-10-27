# PROGRESS

_Last updated: 2026-10-28. Branch: `dev` (local; no git remote yet)._

## Phase 0 — Repository audit (done)

| Area | Finding | Decision |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript, plain CSS | **Reuse.** Right tool; no migration needed. |
| Styling | Hand-written CSS with tokens; no Tailwind | **Keep** (see DECISIONS D-02). Tokens re-based on the new palette. |
| State / data | Entire previous product (BabyBlue queue demo) kept state in `localStorage` — no auth, no server, no database | Demo kept as the **Flow demo**; real backend built separately (`supabase/`). |
| Existing functionality | Queue management demo: patient join/status/intake, staff queue, walk-ins, bookings, patients, settings, intake builder | **Preserved** under `/c`, `/q`, `/staff`, `/find` (fictional data, clearly labelled). Logic informed the Flow schema. |
| Deployment | Vercel project `babyblue-demo` (team `jameel-the-designers-projects`), deployed via CLI, no git integration | Preview deployments only until production promotion is authorised. |
| Git | Local repo, `dev` branch, no remote | Connect remote when chosen. |
| Tests | None | Added Vitest unit + database suites (49 tests). |
| Security | No headers, no server validation | Security headers, server-side validation, RLS-first schema added. |

## Phase 1 — Brand and public website (done, verified visually on desktop and mobile)

- Brand system (tokens, Manrope + Inter, wordmark) — see BRAND.md, DESIGN_SYSTEM.md.
- 13 pages: `/`, `/app`, `/practitioners`, `/os`, `/growth`, `/flow`, `/solutions`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms` (+ `/popia`).
- Homepage with all 12 requested sections, illustrative device mockups, art-directed photography slots.
- Contact form: accessible, validated client and server side, honeypot, throttling, honest failure states.
- SEO: per-page metadata, canonical URLs, generated Open Graph/Twitter image (`/og`), sitemap, robots (noindex until `ALLOW_INDEXING=true`), JSON-LD.
- Security headers.

## Phase 7 — Front door: public listing pages + hybrid UI (done, 2026-10-28)

Inspired by how SMOMO's client side works (finder-first, browse-before-sign-in, indexable category/city pages), adapted to BabyBlue's rules (D-15 to D-19).

- **Public listing pages:** `/{speciality}` (8), `/{speciality}/{city}` (32) and `/in/{city}` (4), statically generated (44 pages). Unknown slugs are 404s; combinations with nobody listed show an honest empty state, are `noindex` and are left out of the sitemap (checked on a production build with `ALLOW_INDEXING=true`). Breadcrumb JSON-LD, canonical URLs, per-page OG image.
- **Finder** on the homepage and every listing page: speciality + city, only offers choices that lead to a populated page.
- **Hybrid UI ("editorial calm"):** new hero (finder, quick links, art-directed stage with an illustrative phone), tone-tile bento of specialities (marketing site and patient app), city links, squircle practitioner cards, oversized display type, header transparent over the hero and glass on scroll, scroll reveal that never hides content without JavaScript, new "Find care" footer column. Checked at 1280px and 390px, no horizontal overflow, no console errors.
- **Patient app:** hero type, tiles and cards restyled; booking flow untouched and still works from a listing (listing → profile → "Sign in to continue").
- **Tests:** 85 pass (13 new): taxonomy/slugs, collision with existing routes, facets, and a database test that keeps the static facets equal to `search_practitioners`.

### Known limitations (this phase)
- Listing results render client-side from the browser-only database, so the HTML a search engine sees holds the heading, copy and links but not the practitioners. Fine while the site is `noindex` and the data is fictional; moving to Supabase means a server fetch (D-17).
- First visit to a listing waits a few seconds for the demo database to start (skeletons show meanwhile).
- Tiles and the hero stage are photography placeholders (labelled). No licensed photos yet.
- Slot alerts ("no time that suits me?") are not built (D-19).
- The practice OS keeps its previous look.

## Phase 2–5 — Backend foundation (done and tested) / product UI (not started)

Built and verified against a real Postgres engine (PGlite, PostgreSQL 18) — 49 passing tests:

- Schema for practices, practitioners, services, availability, leave, clients, appointments, holds, queue, marketing, leads, audit (`supabase/migrations/0001`).
- Atomic booking: slot holds → booking, DB-level exclusion constraint against double booking, cancellation and reschedule rules (`0002`).
- Default-deny row-level security, least-privilege grants, platform-admin-only verification (`0003`).
- Flow: privacy-safe public queue status.
- Growth: controlled request status transitions, approvals, operator isolation from client data.

**Not built yet** (needs a live Supabase project — see Blockers): consumer sign-up/login and booking screens, OS dashboards/calendar/clients/staff UI, Growth request UI and operator dashboard, Flow wired to the real database, transactional email, error monitoring.

## Bugs found by tests and fixed

1. Verification guard trigger ran as its owner, so it never blocked self-verification → now `SECURITY INVOKER`.
2. Marketing request insert failed because its read policy queried the table it was inserting into → policy evaluated inline.
3. Function `queue_status` collided with enum type of the same name when called with a literal → renamed `get_queue_status`.

## Known limitations

- Photography slots are placeholders; licensed South African photography has to be commissioned (BRAND.md).
- Device mockups are illustrative (labelled as such); they contain no real practitioners, ratings or results.
- Legal pages are drafts pending attorney review; Information Officer not yet appointed.
- Concurrency is proven at the constraint level and by sequential contention in tests. A true multi-connection race test must run against a real Postgres (Supabase local) in CI — PGlite is single-connection.
- Pricing is intentionally unpublished.
- The Flow demo uses browser storage and is not multi-device.

## Blockers needing a decision

1. **Supabase project.** Creating one may carry cost, so it needs authorisation (or give me credentials). Unblocks: working waitlist on the preview, auth, booking, OS, Growth, Flow on real data.
2. **Production promotion/DNS.** Not touched. The existing `babyblue-demo.vercel.app` production alias still serves the previous demo until you approve promoting this build.
3. **Transactional email provider** (Resend, Postmark, etc.) and a sending domain.
4. **Photography** and a decision on who verifies practitioners (staff process for checking council registers).
