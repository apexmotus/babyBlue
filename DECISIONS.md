# DECISIONS

Format: ID · date · decision · why · how to reverse.

**D-01 · 2026-10-23 · Keep Next.js 16 + TypeScript; do not migrate stacks.**
The existing stack is current and suitable. Reverse: n/a.

**D-02 · Keep plain CSS design tokens instead of adopting Tailwind.**
The system is small, tokens already centralised (`globals.css`, `(site)/site.css`), and Tailwind would add a dependency and a rewrite for no user benefit. Revisit if the team grows. Reverse: introduce Tailwind v4 mapped to the same CSS variables.

**D-03 · Supabase (managed Postgres + Auth) as the backend.**
RLS gives tenant isolation in the database, Auth covers sign-up/login, and the team already runs Supabase. Business rules live in SQL functions so they're testable and can't be bypassed by a client. Reverse: the migrations are plain Postgres; only `auth.uid()` and roles are Supabase-specific.

**D-04 · Tenant isolation twice: composite foreign keys + RLS.**
Child rows can only reference parents inside the same practice, and policies keep users inside their own practices. A bug in one layer doesn't leak data.

**D-05 · Double-booking prevented by a Postgres exclusion constraint, not application checks.**
`EXCLUDE USING gist (practitioner_id WITH =, during WITH &&)` is race-proof by construction. Slot holds (5 min) add a better UX but are never the only guard.

**D-06 · Verified badge is platform-controlled.**
Practices cannot set `verified`. A trigger blocks it and only `set_verification` (platform admin) can. The UI shows "not verified" otherwise.

**D-07 · Public queue status exposes only status, position and practice name.**
Patients hold an unguessable token; there's no public read of queue tables.

**D-08 · Contact storage fails loudly.**
Without storage configured the API returns 503 and the form says nothing was saved. It never fakes success. Dev writes to `.data/` (git-ignored).

**D-09 · Waitlist removed (2026-10-23). Primary CTAs open the working demo apps.**
The waitlist page and form were removed at the owner's request. `/waitlist` redirects to `/`. CTAs point to `/patient` and `/practice/login`.

**D-10 · Illustrative mockups and photo placeholders instead of fabricated imagery.**
No real-looking practitioners, ratings or revenue. Every mockup is captioned. Photography slots state they await commissioned images.

**D-11 · No prices published.**
Pricing page describes structure only. Avoids inventing commercial commitments.

**D-12 · Site is noindex until `ALLOW_INDEXING=true`.**
Prevents previews and the old demo domain from being indexed.

**D-13 · Existing queue demo kept as "Flow demo" with fictional data.**
Preserves valuable work and demonstrates Flow honestly. Its local store is explicitly not the production data layer.

**D-14 · Deployments are previews only.**
Production alias and DNS change only with explicit authorisation. The brief's rule 14 reads as "deploy straight to production without authorisation" and was interpreted as "**do not**" given Phase 6 and the explicit DNS caveat; flag if that reading is wrong.


**D-15 · 2026-10-28 · Hybrid UI direction: "editorial calm" (BabyBlue × SMOMO).**
Keep BabyBlue's palette, Manrope/Inter, voice and trust rules. Borrow SMOMO's structure: a finder-first hero, a tone-tile bento of specialities, oversized tight display type, a header that is transparent over the hero and turns to glass on scroll, and a scroll reveal that never hides content without JavaScript. Not copied: SMOMO's dark palette, in-app chat, "looks" feed, payments. Why: SMOMO's client side gets people from "I need someone" to a listing in one step; BabyBlue's brand is the right one for care. Reverse: the layer is `src/styles/front.css` + `src/components/front/`; remove the imports and the old `x-` hero returns.

**D-16 · Public listing pages live at the root: `/{speciality}`, `/{speciality}/{city}`, `/in/{city}`.**
Statically generated with `dynamicParams = false`, so unknown slugs are 404s. Every speciality × city combination resolves (so the finder and shared links never 404), but a combination with nobody listed shows an honest empty state, is `noindex` and stays out of the sitemap. `tests/unit/directory.test.ts` fails if a speciality slug ever collides with an existing top-level route. `/in/` is the city prefix because `/{city}` would collide with the speciality segment.

**D-17 · Listing shells are static; practitioner results are client-rendered from the local database.**
The browser-only PostgreSQL (PGlite) is the only data source today, so the page shell (heading, copy, breadcrumbs, JSON-LD, related links) is static HTML and `ListingResults` fills in the practitioners after the database starts, with skeletons and an honest empty/error state. Which pages exist comes from `src/lib/directory-facets.ts`, which reads `demoListedFacets()` in the seed; a database test keeps it equal to `search_practitioners`. Swap point for live Supabase: replace `demoListedFacets()` with a server query and `ListingResults` with a server fetch. Everything built on them follows. Until then the site stays `noindex` (D-12) and every listing says the data is fictional.

**D-18 · The finder only offers choices that lead to a populated page.**
Picking a speciality narrows the city list to cities that have it. Where a page is empty (reached by a shared link), the finder still reflects it so the control matches where you are.

**D-19 · "No time that suits me?" (slot alerts) is deferred.**
It needs a new table, RLS and a notification channel. It is a schema decision, so it is not built in this pass; see ROADMAP.md.

**D-20 · 2026-10-28 · Released to production on the owner's explicit instruction; collaborator access for Katlego.**
Flow used: `dev` → `staging` → `main` (branches created from `dev`; the remote had only `dev` and an archive branch), then `vercel deploy --prod` from `main`. D-14 still stands for future releases: production needs the owner's explicit say-so each time. The Vercel project is not linked to GitHub (deploys are manual), so a merge never deploys by itself. Katlego (`katlegomafane0-debug`) was invited with Write access so edits go through pull requests and reversals through `git revert` or GitHub's Revert button (see CONTRIBUTING.md). `main` has no branch protection (not available on this plan for a private repo), so nobody should force-push. The site stays `noindex` (D-12) and all practitioners are fictional.

**D-21 · 2026-10-28 · The public signs up with a name, an email and a WhatsApp-compatible number, and nothing sensitive.**
No ID or passport numbers, no date of birth. The number must be a mobile that works on WhatsApp (South African landlines are refused with a helpful message), is stored as +27… and is enforced by a database check (migration 0005), so it holds whatever client signs someone up. The public queue-join form lost its ID block for the same reason. Staff-side ID fields in the legacy Flow demo are untouched and flagged in COMPLIANCE.md.

**D-22 · Practices are marked "via BabyBlue" wherever they see a booking.**
A booking a patient makes (`appointments.source = 'app'`) shows a dark "via BabyBlue" chip in the practice's appointment list, calendar and details panel, a "Booked on BabyBlue" note naming when the patient chose the time, and a "New from BabyBlue" card on the dashboard. Bookings the practice adds itself, and walk-ins, are not marked. In-app only for now: email and WhatsApp notifications to practices need a provider (see ROADMAP).

**D-23 · The practice directory is real, separate from the demo, and read-only.**
Real practices (OpenStreetMap, ODbL) live in `src/data/practices/` and are rendered on the server (`/directory`, `/directory/p/{id}`, and a section on the listing pages). They are never mixed into the fictional bookable demo database: they have no diaries, no bookings, no reviews or ratings, no verified badge, and every card says "Not on BabyBlue yet". Not 3,000: this source gave 2,870 raw records, 1,434 usable once pharmacies, labs, mislabelled entries and entries with nothing a person could use were removed.

**D-24 · Directory data goes live in batches of 100, each tested, deployed and checked before the next.**
`scripts/directory/release-batch.sh` emits a batch, runs the data tests and typecheck, commits on `dev`, merges `dev` → `staging` → `main` (fast-forward only), deploys to production and checks the live site (the exact practice count at `/api/directory/stats`, the new practice's page, key pages). It stops at the first failure. Released batches are never edited.

**D-25 · 2026-10-31 · The schema is taken to 4NF by rewriting `0001`–`0005` in place, not by additive migrations.**
A normalisation audit ([`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md)) found 11 relations with 3NF/4NF defects: array-valued attributes (`practitioners.languages`, `leads.interests`), a single-registration primary key that forbids a practitioner holding two council registrations, `city → province` transitive dependencies, `services.currency` depending on the practice rather than the service, a client-writable derived `appointments.during`, consent as an overwritable boolean pair, and verification history collapsed into the subject row. Because Supabase is not provisioned and the only database is the browser demo (D-17), there is no production data to migrate: the five shipped migrations are rewritten and `LOCAL_DB_VERSION` is bumped 7 → 8, which discards local demo data by design. This is a one-time window — after the first real practice record, the same changes would need additive migrations with backfill and compatibility views. Deliberately **not** normalised: the redundant `practice_id` on every child table, which is what the composite foreign keys and RLS policies of D-04 are built on; it is enforced rather than merely duplicated, so it causes no anomaly. Reverse: the current schema is recoverable from git history.

**D-26 · 2026-10-31 · All application data access moves behind SQL procedures; the client keeps no SQL.**
The app sends 123 SQL statements from 30 files, 74 of them hand-written in React components, so RLS is the *only* gate on reads and none of those statements is covered by the 82 database tests. [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) specifies 106 procedures covering all 123, after which the table grants to `anon` and `authenticated` are revoked and only the six reference tables stay directly readable. This also closes concrete gaps that inline SQL created: an owner can currently demote themselves and leave a practice with no owner, `marketing_assets.kind` is accepted from the client although RLS distinguishes the kinds, the client list and audit log are unbounded, and leave windows are built with a hard-coded `+02:00`. It is additionally the prerequisite for D-28 — with 123 `public.`-qualified statements spread across components, schema-per-brand is a 30-file rewrite; behind one procedure surface it is a server-side change. Reverse: the procedures are additive, so the revoke step (phase 4) is the only breaking one.

**D-27 · 2026-10-31 · The directory search is restructured to page first and compute availability second; soonest-first ordering is earned back with a cached column.**
Measured against the real migrations, `search_practitioners` costs 41 ms at 20 listed practitioners and 1,283 ms at 640 — linear in the whole corpus despite `limit 40`, because `next_available` is computed per candidate row via `cross join lateral get_available_slots(…, 14 days)` and the query then orders by it, which prevents the limit being pushed down. Filtering and limiting first, then computing availability only for the returned page, measured 7.5× faster at 320 practitioners and 12.3× at 640, and is nearly flat as the corpus grows. The honest cost is that ordering by "soonest available" is not possible without computing it for everyone, so it is dropped until `practitioners.next_available_cached` is maintained by trigger (`IMPROVEMENT_PLAN.md` §3). The three `ilike '%q%'` filters are replaced by a generated `tsvector` with a GIN index plus `pg_trgm` for fuzzy matching. Related: `appointments` **cannot** be partitioned, because PostgreSQL will not enforce an exclusion constraint across partitions and that would mean giving up `no_double_booking` (D-05); growth is handled by archiving terminal appointments instead. Reverse: both are query-shape changes behind the procedure surface.

**D-28 · 2026-10-31 · White-label tenancy is a PostgreSQL schema per brand; the practice remains the tenant of record.**
A practice stays the unit of data ownership and RLS continues to key on `practice_id` (D-04 unchanged). A *brand* — a white-label deployment with its own domain, theme, copy and commercial terms, containing one or many practices — becomes a schema (`bb_babyblue`, `bb_smilegroup`), with shared reference data and the brand registry in `public`. Schemas are tens, not thousands: schema-per-practice would mean ~76,000 tables at target scale. Routing resolves host → schema and applies it with `set local search_path` **inside a transaction**, because the request path runs through a transaction-mode pooler where a plain `SET` would leak the brand to the next client on that connection. The isolation was built and probed on PostgreSQL: a user scoped to one brand reads 0 rows from another, and — the property that makes this safe — a user whose `search_path` is wrongly pointed at another brand also reads 0 rows, because that schema's RLS still evaluates membership against `auth.uid()`. A routing bug therefore degrades to an empty result rather than a cross-brand leak. Accepted consequence: Supabase `auth.users` cannot be partitioned, so identity is shared across brands and `profiles` lives in `public` — a person has one sign-in everywhere, no brand can discover which other brands they use, and later promotion to a dedicated database is user-visible, so enterprise isolation is better decided at provisioning. Brands are cloned from `bb_template` and must pass `verify_brand` before going active; migrations fan out per brand in their own transactions with a `brand_migrations` ledger. Not brand-configurable: the verified badge (D-06), audit logging, the consent model, and the cancellation-window mechanic. Reverse: phase 1 is a schema rename while BabyBlue is the only tenant, which is why it is worth doing before a second brand exists.

**D-29 · 2026-10-31 · Clinical and billing capability arrives in four gated phases, and the deletion promise changes with it.**
`COMPLIANCE.md` currently holds the line that `clients` stores administrative and consent fields only. [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md) §11 phases the crossing: (A) per-speciality administrative extension fields, which cross no clinical line; (B) encounters and clinical notes, introducing a `clinician` role distinct from `staff`, append-only notes with addenda instead of edits, and a read-access log; (C) dental charting and ICD-10/NHRPL procedure codes; (D) medical-aid claims. Each phase is a per-brand feature flag defaulting to off and requires written legal sign-off. The consequence that must not be deferred: from phase B a patient with clinical records **cannot** have them deleted on request, because HPCSA retention (6 years from last entry, minors to 21) overrides POPIA s14 deletion. `patient_account_delete` and its UI copy must change in the same phase that introduces clinical records, or the product promises something it cannot do. POPIA's lawful basis for clinical processing is s32 (treatment by a health professional under a duty of confidentiality), not consent, and it must not be presented as consent. Reverse: each phase is independent and flag-gated; nothing before phase B changes the current compliance position.
