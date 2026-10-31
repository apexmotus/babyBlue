# ROADMAP

Planning documents that feed this roadmap: [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md) (4NF target schema) · [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) (the 106-procedure data-access surface) · [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) (scalability, security, performance; its Tier 0 list is blocking for item 1 below) · [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md) (white-label platform). All four are proposals; none is applied.

## Now (unblocked once Supabase project is approved)
1. **Provision Supabase** (project in an appropriate region), apply `supabase/migrations/*`, set env vars → waitlist/contact go live on the preview. **Choose the region deliberately** — it is a POPIA s72 cross-border determination, not a latency preference (see `IMPROVEMENT_PLAN.md` §15). Apply `IMPROVEMENT_PLAN.md` Tier 0 before the first real patient record, in particular `revoke execute … from public` on all functions and `force row level security` on personal-data tables.
2. **Auth**: Supabase Auth (email + OTP/magic link), `profiles` trigger, route protection, session handling.
3. **Directory + search**: listed practitioners, speciality/service/location filters, profile pages, verified/unverified display.
4. **Booking MVP**: availability grid → `hold_slot` → `book_appointment`; my appointments; cancel/reschedule; confirmation + reminder emails (Resend or similar).
5. **Multi-connection concurrency test** against local Supabase/Postgres in CI (N parallel bookings of one slot → exactly one succeeds). All 82 existing database tests run on one PGlite connection, so no concurrency guarantee in the schema is currently covered (`IMPROVEMENT_PLAN.md` §18).

## Next
6. **OS**: dashboard (real metrics), calendar + availability editor, appointments & check-in, clients + consent, staff & roles, practice settings, locations.
7. **Flow on real data**: QR check-in tied to appointments, reception dashboard, patient status page via `get_queue_status`, SMS/WhatsApp notifications through an approved provider.
8. **Growth**: catalogue, request wizard, asset uploads (Supabase Storage, private buckets with RLS), approvals, operator dashboard, reports, deliverables library.
9. **Quality**: Playwright end-to-end suite, axe accessibility CI, Lighthouse budgets, Sentry, structured logging, rate limiting at the edge.

## Front door follow-ups
- **Slot alerts / standby ("no time that suits me?")**: patient picks a practitioner and a window and is told when a slot opens. Needs a `slot_alerts` table with RLS, a notification channel and a quota. Replaces SMOMO's open-ended "post a request", which is out of scope for health (D-19).
- **Server-side listing data** once Supabase is live: replace `demoListedFacets()` and `ListingResults` (D-17), then consider `Physician`/`MedicalBusiness` structured data for verified, real practices only.
- **Photography** into the hero stage and speciality tiles (add an image layer; layout is ready).
- Extend the hybrid layer to the practice OS and marketing sub-pages when the brand is formalised.

## Directory and sign-up follow-ups
- **Removal channel:** publish a monitored address (NEXT_PUBLIC_CONTACT_EMAIL) and connect storage so the contact form works. Required before the site is allowed into search engines.
- **More sources** for the directory: the national health-facility list (once its licence and a download are confirmed), private hospital groups by permission, council registers only on written terms.
- **Claim a listing:** a practice proves it is theirs, then its card turns into a bookable BabyBlue profile.
- **Notify practices** of new BabyBlue bookings by email or WhatsApp (needs a provider), using the same "via BabyBlue" wording.
- **Staff-side ID fields** in the Flow demo: remove or keep behind a clear need.
- Reviews stay out until a verified-visit policy has had legal review.

## Later
- Payments (PayFast/Peach/Stripe where available), invoices, revenue reporting.
- Reviews with verified-visit gating and moderation policy (only after legal review).
- Waitlist/standby for cancellations; recurring appointments; video consults.
- Southern Africa expansion: multi-country regulators, currencies, languages.
- Native mobile apps (only then use app-store badges).
- AI assistance (scheduling suggestions, summaries) after core is stable and reviewed for POPIA.

## Content/brand
- Commission photography; formal logo; Open Graph variants per product; case studies **only** from real early practices with permission.
