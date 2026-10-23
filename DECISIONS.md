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

**D-08 · Waitlist/contact storage fails loudly.**
Without storage configured the API returns 503 and the form says nothing was saved. It never fakes success. Dev writes to `.data/` (git-ignored).

**D-09 · Primary CTA is "Join the Waitlist".**
Booking isn't functional yet. Switch to "Find a Practitioner" when `/app` search is live.

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
