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
