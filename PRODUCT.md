# PRODUCT

**BabyBlue connects people with practitioners and helps practitioners attract customers, manage appointments, run their practices and grow.**

## Product family and status

| Product | For | Status |
|---|---|---|
| **App** | Consumers: search, compare, book, manage | Marketing page + backend foundation (schema, availability, booking, tests). UI not built |
| **OS** | Practices: calendar, appointments, clients, staff, insights | Marketing page + schema/RLS. UI not built |
| **Growth** | Practices: marketing services | Marketing page + workflow schema/RLS. UI not built |
| **Flow** | Practices and patients: QR check-in, live queue | Working **demo** (fictional data, browser storage) + production schema/privacy-safe status RPC |

## Core journeys
**Consumer:** Search → Discover → Compare → Select time → Book → Confirm → Attend → Manage.
**Practitioner:** Join → Set up practice → Get verified → Open diary → Get booked → Run the day → Grow (Growth requests).
**Growth:** Request → Proposal → Approve → Create & approve creative → Deliver → Report.

## Principles
1. Real availability only; never fake slots.
2. Metrics from real data; never manufactured.
3. Trust is earned: verified badges only when verified.
4. Privacy first: minimal data, isolated practices, no health-data ad targeting.
5. Be honest about what's ready.

## MVP scope (next build, after Supabase approved)
1. Auth (consumer + practice) and onboarding.
2. Practitioner directory + search + profiles (listed & verified-aware).
3. Booking: slots → hold → confirm → my appointments → cancel/reschedule, email confirmations/reminders.
4. OS: dashboard, calendar/availability, appointments, clients (consent), team/roles, settings.
5. Flow on real data (QR check-in, reception dashboard, patient status).
6. Growth: catalogue, request form, assets, approvals, operator dashboard, reports.

## Metrics definitions (to implement from real data)
- *Utilisation* = booked minutes ÷ available minutes in period.
- *Cancellation rate* = cancelled ÷ (booked + cancelled).
- *Repeat bookings* = clients with ≥2 completed appointments ÷ clients with ≥1.
- *Revenue* only where payment data exists. *Attribution* only where a source is captured.

## Out of scope for now
Clinical records, e-prescribing, medical-aid claims, payments (until scoped), AI features (after booking/practice management are solid).
