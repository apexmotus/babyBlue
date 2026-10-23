# ROADMAP

## Now (unblocked once Supabase project is approved)
1. **Provision Supabase** (project in an appropriate region), apply `supabase/migrations/*`, set env vars → waitlist/contact go live on the preview.
2. **Auth**: Supabase Auth (email + OTP/magic link), `profiles` trigger, route protection, session handling.
3. **Directory + search**: listed practitioners, speciality/service/location filters, profile pages, verified/unverified display.
4. **Booking MVP**: availability grid → `hold_slot` → `book_appointment`; my appointments; cancel/reschedule; confirmation + reminder emails (Resend or similar).
5. **Multi-connection concurrency test** against local Supabase/Postgres in CI (N parallel bookings of one slot → exactly one succeeds).

## Next
6. **OS**: dashboard (real metrics), calendar + availability editor, appointments & check-in, clients + consent, staff & roles, practice settings, locations.
7. **Flow on real data**: QR check-in tied to appointments, reception dashboard, patient status page via `get_queue_status`, SMS/WhatsApp notifications through an approved provider.
8. **Growth**: catalogue, request wizard, asset uploads (Supabase Storage, private buckets with RLS), approvals, operator dashboard, reports, deliverables library.
9. **Quality**: Playwright end-to-end suite, axe accessibility CI, Lighthouse budgets, Sentry, structured logging, rate limiting at the edge.

## Later
- Payments (PayFast/Peach/Stripe where available), invoices, revenue reporting.
- Reviews with verified-visit gating and moderation policy (only after legal review).
- Waitlist/standby for cancellations; recurring appointments; video consults.
- Southern Africa expansion: multi-country regulators, currencies, languages.
- Native mobile apps (only then use app-store badges).
- AI assistance (scheduling suggestions, summaries) after core is stable and reviewed for POPIA.

## Content/brand
- Commission photography; formal logo; Open Graph variants per product; case studies **only** from real early practices with permission.
