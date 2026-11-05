# Front-door features: slot alerts, claim a listing, booking notifications

_Drafted 2026-11-05 by the front-of-house side (Thami) for Thabo's review. Nothing here is built yet. All three need schema, RLS, procedures and API routes, which are Thabo's area, so this is the brief for that work and the contract the screens will be built against._

Context: ROADMAP "Front door follow-ups" and "Directory and sign-up follow-ups"; D-19 (slot alerts replace SMOMO's open-ended "post a request"); D-34 (patients never see the practice side).

## Shared piece first: one notification outbox

All three features send messages, so build the delivery path once.

- `notification_outbox` (id, kind, recipient channel + address, template, payload `jsonb`, status `queued|sent|failed`, attempts, created_at, sent_at). No health detail in `payload`: practice name, a time, a link behind login. Same rule as the queue messages (D-07).
- One worker drains it. Provider is **an open decision** (see the end). `RESEND_API_KEY` is already named, unwired, in `.env.example`.
- Idempotent per `(kind, subject id)` so a retry never double-sends.

## 1. Slot alerts ("no time that suits me?")

**Patient experience (front-end, mine):** on a practitioner profile with no open time that suits them, "No time that suits you? Tell us when." Opens a short sheet: practitioner and service pre-filled; days of the week; morning / afternoon / evening; earliest and latest date (max 60 days out). Signed-in only, using the name, email and WhatsApp number we already hold from sign-up, so no anonymous personal data is collected. Confirmation screen, then a list of alerts under the patient account with pause and cancel. The message says "A time has opened with {practice}" and a link. It never says why they were booking.

**Backend (Thabo):**
- `slot_alerts` owned by the patient, RLS owner-only. Window days and time bands as child rows rather than arrays, to stay in 4NF. Status `active|notified|cancelled|expired`; default expiry 30 days.
- Quota of 5 active alerts per patient (same pattern as the hold quota). New error codes, which means the 3-way parity test needs `Codes`, `MESSAGES` and the SQL `raise` to agree: `alert_quota`, `alert_window_invalid`, `alert_exists`.
- Procedures (suggested): `patient_slot_alert_create`, `patient_slot_alerts_list`, `patient_slot_alert_cancel`. Optional: `practice_slot_alert_demand` returning counts only, so a practice can see unmet demand without seeing who.
- Matcher: when a slot frees (cancellation, availability added, time-off removed) find matching active alerts and enqueue one outbox row each. An alert fires once. It does **not** hold the slot: the patient still goes through hold then book, so the concurrency guarantees are unchanged.
- Consent: add an alert purpose to the consent events so withdrawal is recorded the same way as the others (POPIA s11). Delete or anonymise notified and expired alerts after a short retention period.

## 2. Claim a listing

**Practice experience (front-end, mine):** a practice finds its entry and starts a claim on the practice side of the site (`/practitioners/claim`). It enters their name, role, work email and phone. Status page: pending, verified, rejected. On approval the directory entry becomes the starting point of onboarding, with name, address and kind already filled in.

**Open question on discoverability:** per D-34 patients see nothing of the practice side. A claim link on each directory page ("Own this practice?") is the usual pattern but it tells patients there is a practice side. Default until decided: no link on patient pages; practices are pointed to the claim page by outreach. Decide with Thami.

**Verification, strongest first (never fabricate a verified state):**
1. Email at the practice's own website domain, by magic link. The directory already holds the website for many entries.
2. One-time code to the phone number published in the directory.
3. Manual review by a platform admin when 1 and 2 are not possible.

A claim does not give a verified badge. That stays D-06 (checked against the council register).

**Backend (Thabo):**
- `directory_claims` (id, directory practice id, claimant user, role, contact email and phone, method, status, reviewed_by, timestamps). RLS: claimant sees their own; platform admins see all. One pending claim per directory entry.
- Procedures (suggested): `claim_start`, `claim_verify`, `claim_status_get`, `platform_claims_list`, `platform_claim_decide`. Rate-limit `claim_start` per IP and per user.
- The directory is currently static data (`src/data/practices/`). Claims key on the existing OSM id, and a claimed entry is flagged so the patient listing can show "on BabyBlue" and link to the live profile once active.
- A takedown path if a claim is disputed.

## 3. Notify a practice of a BabyBlue booking

Today the "via BabyBlue" chip only shows inside the practice dashboard. Add email (and later WhatsApp) when a booking is made, rescheduled or cancelled through BabyBlue.

- **Content rule:** "New booking via BabyBlue", date and time, service, and a link into the dashboard. No reason for the visit and no full phone number in the message. The detail sits behind login.
- **Backend (Thabo):** `practice_notification_prefs` (practice, channel, address, events) and a trigger on booking and status changes that enqueues an outbox row. Procedures `practice_notification_prefs_get` and `practice_notification_prefs_set`.
- **Front-end (mine):** a "Notifications" section in practice settings. Owners only.

## Suggested order

1. Outbox and worker, plus provider decision.
2. Booking notifications (smallest, and exercises the outbox end to end).
3. Slot alerts.
4. Claim a listing (needs the discoverability decision and a verification channel).

## Who does what

| Piece | Thami | Thabo |
|---|---|---|
| Screens, copy, empty and error states | yes | review |
| Schema, RLS, procedures, API routes, generated contracts | | yes |
| Notification provider account and templates | decides | wires |
| Legal wording for the alert and claim consent | commissions the review | |

## Decisions needed before building

- **Provider and channel** for alerts: email only first (cheapest, no template approval), or WhatsApp now (needs approved templates and a business account). Cost per message is real.
- **Claim link on patient pages:** yes or no (see above).
- **Alert expiry** (30 days proposed) and quota (5 proposed).
- **Hosting region** (already open as Decision 1), because messages carry personal data.
