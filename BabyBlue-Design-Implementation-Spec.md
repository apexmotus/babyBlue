# BabyBlue: Design Implementation Spec

Version 2, 21 October 2026. Reviewed from the "BABY BLUE CANVAS" artifact (27 screens: 15 patient, 12 staff) and updated with the owner's decisions.

---

## 1. Decisions locked in

| # | Question | Decision | Effect on the build |
| --- | --- | --- | --- |
| 1 | Product name | **BabyBlue** | Drop "ClinicOS" from the UI, repo strings, emails and domains. Keep the shield logo until a final mark is chosen. |
| 2 | Urgent patients | **Urgency flags the visit; an admin approves or declines moving it up, and must give a reason.** | New "Needs review" state on S4 and a decision dialog. Queue order never changes automatically. See 6.4. |
| 3 | IDs | **Needed for billing** | ID stays required at reception. See 6.5 for how this fits the patient join form and POPIA. |
| 4 | Consent withdrawal and retention | Not understood, explained in section 9 | Default proposed below; needs a lawyer's check. |
| 5 | Minors | **A guardian or parent is required** | New "joining for someone else" path on P6 and S5, guardian fields on the visit. |
| 6 | New practice approval | **Manual review** | New platform-admin screen (S13) and a "pending" holding screen. |
| 7 | Messaging provider | **SendGrid** | SendGrid is an email service. It cannot send WhatsApp or SMS. See 8.3. |
| 8 | Pricing | **R2,000 installation, then R200 per month** (to be updated) | Manual invoicing in the MVP. Check message costs against the R200 margin (8.4). |
| 9 | Stack | **Frontend: Next.js (PWA). Backend: .NET (MVC structure).** | Architecture in section 4 is rewritten for this stack. |

---

## 2. Overview

The canvas defines a two-surface product for South African clinics. The patient surface is a mobile web app (P1 to P15). The staff portal is an admin app (S1 to S12). Both read one shared queue record.

In one line: patients scan a QR code, join a clinic's live queue from their phone, and get an honest wait estimate plus WhatsApp or SMS nudges. Reception runs one live list, with bookings, intake and patient files alongside.

Canvas contents:

- **Patient surface**, 402px viewport, 44px minimum tap targets. Three landing variants (general practice, dentist, small clinic), find a clinic, clinic page, join form, live status in five states (waiting, offline, in consultation, done, cancelled), leave-queue confirmation, structured intake, notification previews.
- **Staff portal**, 1320px shell, 1200px content column. Sign in, two-step onboarding, queue dashboard, add-walk-in and new-booking modals, appointment detail, patients list and file, settings (hours, blocked time, intake builder, QR), profile.
- The canvas notes say tokens, copy and component behaviour were lifted from the existing repo (BabyBlueTheme, tailwind.config.ts, the live appointment route, JoinQueueForm, QueueClient, IntakeClient).

Limits of this review: the canvas was read by scrolling the rendered page, not from source. Take exact colour, spacing and radius values from `tailwind.config.ts`.

---

## 3. Design review

### Keep exactly as designed

- One estimate component, always labelled "Estimated" and always a range, reused on the patient card, queue table and appointment detail. Never show a bare number of minutes.
- Structured-only intake with free text off by default.
- Explicit failure states: offline banner with "your place is held", cancelled-by-practice, and a leave-queue confirmation that says exactly what is lost.
- POPIA consent unchecked by default, withdrawable, with export and withdraw on the patient file.
- Status colour always paired with text and an icon, plus 44px tap targets.

### Findings

| # | Finding | Where | Severity | Status / recommendation |
| --- | --- | --- | --- | --- |
| 1 | Landing pages promise a standby list, procedure-length slots and multi-stream queues with no screens behind them. | P2, P3 | High | Phase 5. Ship P1 only at launch; remove or hide those claims until built. |
| 2 | Marketing stats ("31% fewer people in the waiting room", "4 min to set up") have no source. | P1 | High | Remove until measured in the pilot. |
| 3 | ID is mandatory for walk-ins on staff side but optional on the patient form. | S5, P6 | Medium | **Resolved by decision 3.** ID is required for billing; see 6.5. |
| 4 | Status link (bby.co.za/q/8fd2) is a public URL revealing queue state; a short code is guessable. | P15, P7 | High | 128-bit random token per visit, expires after the visit, rate-limited, first name only in public views. |
| 5 | Sample data conflicts: patient is #3 on P7 but #1 on S4 and S7; ID 8904125... gives DOB 12/04/1989 (age 37) while S7 says 34; weekday labels do not match 2026 dates. | P7, S4, S5, S7 | Medium | Seed fixtures from one source; compute ages and weekdays from the clock; position comes from one query. |
| 6 | New practice is "pending" but no approval flow exists. | S3 | Medium | **Resolved by decision 6.** Add S13 (platform admin) and a pending screen. |
| 7 | Roles are named but only the Admin view is drawn. Clinical notes and intake are health information. | S7, S10 | Medium | Role matrix in 7.3, enforced on the server. |
| 8 | Patient-side booking is implied but has no screens. | P4, P5, P10 | Medium | For v1, turn those buttons into "Call reception" or a simple request form. |
| 9 | "We recognised these details from this device" conflicts with "nothing is stored until you join". | P6 | Medium | Store details in the browser only, as a clearable convenience, and say so. |
| 10 | WhatsApp and SMS have platform rules, and the chosen provider (SendGrid) does neither. | P15 | **High** | See 8.3. |
| 11 | Password-only staff sign-in for a system holding health data. | S1 | Medium | Email verification at sign-up, optional TOTP for Admin. |
| 12 | Staff portal is fixed at 1320px; reception may use tablets. | S1 to S12 | Low | Breakpoints at 1024 and 768 with a collapsible nav. |
| 13 | Repo logo reads ClinicOS. | all | Low | **Resolved by decision 1.** Rename to BabyBlue everywhere. |
| 14 | Intake shows Questions 3 and 4 together with Question 1 collapsed, while the header says "3 of 4". | P13 | Low | This spec assumes one question per step. |
| 15 | At R200 per month, WhatsApp and SMS costs could consume or exceed the subscription. | pricing | **High** | See 8.4. |
| 16 | No flow for a child or dependent. | P6, S5 | High | **Resolved by decision 5.** See 6.6. |

---

## 4. Design system

Build one token layer in `tailwind.config.ts` and one shared primitive set; both surfaces consume it. Import the repo's existing values rather than sampling colours from the canvas.

### Colour tokens

Colour carries meaning only. No decorative gradients beyond the logo shield.

| Token | Meaning | Used for |
| --- | --- | --- |
| primary | Actions, links, in-consultation, info | Primary buttons, links, active nav, progress bar, selected slot |
| accent | Confirmed, done, connected | Done card, Confirmed and Open pills, live dot |
| warning | Offline, reconnecting, urgency | Offline banner, Soon pill, open standby slot, stale-estimate text |
| error | Irreversible actions | Leave the queue, Urgent pill, delete, sign out of device |
| surface | Cards, inputs, modals | White |
| background | App background | #F7FAFC (read from the canvas notes) |
| text / muted | Body and secondary | Slate scale, at least 4.5:1 on surface |

### Primitives

All with a visible primary-colour focus ring.

- **Button:** 44px tall by default, 56px for the primary patient call to action, 12px radius. Variants: primary, secondary (outlined), ghost or link, destructive (outlined red).
- **Input:** 48px tall, 12px radius, blue focus ring, label above, helper or error text below. Selects and segmented controls (Urgency, 0 to 5 scale, Yes/No) share the height.
- **Card:** white, 1px slate border, light shadow.
- **Badge / pill:** the one status pill used everywhere.
- **Modal:** centred on desktop, bottom sheet on mobile. Dimmed backdrop, close button, Escape closes, focus trapped.
- Also: toggle, checkbox, accordion, tabs, stepper, toast.

### Status pill map

| State | Label | Colour |
| --- | --- | --- |
| waiting | Waiting | neutral |
| in_consultation | In consultation | primary |
| done | Done | accent |
| cancelled | Cancelled | neutral |
| urgency routine / soon / urgent | Routine / Soon / Urgent | neutral / warning / error |
| urgent review pending | Needs review | warning |
| clinic open / closed | Open / Closed | accent / neutral |
| slot confirmed / open standby | Confirmed / Open | accent / warning |
| consent given / not given | Given / Not given | accent / neutral |
| ID on file / missing | ID on file / ID missing | accent / warning |
| practice pending / approved / declined | Pending / Approved / Declined | warning / accent / error |

### Estimate component (EstimateRange)

Props: `minMinutes`, `maxMinutes`, `lastConfirmedAt`, `size` (hero, row, inline). Renders "Estimated 20 to 35 min", or "Under 10 min" at position 1. Never a single figure. If the last server confirmation is older than 60 seconds, append "Last confirmed N minutes ago" in warning colour.

### Type, layout, accessibility

Sans-serif system stack. Large bold queue position at hero size. Patient surface is a single column at 402px with 16px side padding. Staff portal is a 240px left nav plus a 1200px max content column with a four-stat strip above tables. Target WCAG 2.2 AA: 44px targets, semantic headings, labelled inputs, `aria-live="polite"` on position and status changes, reduced motion respected, focus-trapped modals.

---

## 5. Architecture and stack (revised for decision 9)

One Next.js PWA frontend and one ASP.NET Core backend, with PostgreSQL (or SQL Server if you already run it) behind it and SignalR for realtime.

### Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js (App Router, TypeScript), Tailwind, Radix-based primitives | PWA: web manifest, service worker for the patient app shell and offline banner. Installable, but joining must work without installing. |
| Backend | ASP.NET Core, controller-based (MVC structure) exposing a JSON API under `/api` | Use controllers for the API and keep Razor views out of it; Next.js owns the UI. Keep the MVC layering: Controllers, Services, Repositories or EF Core, DTOs. |
| Data access | Entity Framework Core with global query filters on `PracticeId` | This replaces database row-level security: the tenant filter is applied to every query, and tests prove it. |
| Database | PostgreSQL recommended; SQL Server acceptable | Pick one before Phase 0. |
| Realtime | SignalR with one group per practice queue and one per visit | Falls back to long polling by default; the client also polls every 15 seconds if the connection drops. |
| Background jobs | Hangfire or a hosted worker | Reminders, SMS fallback, estimate refresh, retention deletes. |
| Staff auth | ASP.NET Core Identity, cookie session, email verification, optional TOTP | Next.js and the API share a parent domain so the cookie is first-party. |
| Patient auth | None. A visit token in the URL | Hashed at rest, expires after the visit. |
| Email | SendGrid | Approval and decline emails, verification, password reset, daily summary, optional booking confirmation. |
| WhatsApp / SMS | A separate messaging provider (see 8.3) | Not SendGrid. |
| Hosting | Azure South Africa North, or the nearest region offering it | Health data: prefer South African hosting. |
| Observability | Structured logs, error tracking, audit table | Keep patient data out of third-party logs. |

### Route map

| Route | Screens | Auth |
| --- | --- | --- |
| `/`, `/for-clinics` | P1 to P3 | Public |
| `/clinics` | P4 | Public |
| `/c/[slug]` | P5, P6 | Public |
| `/q/[token]` | P7 to P12; `/q/[token]/intake` P13 to P14; `/q/[token]/messages` P15 | Visit token |
| `/staff/sign-in`, `/staff/sign-up` | S1 | Public |
| `/staff/onboarding` | S2, S3 | Staff, no active practice |
| `/staff/pending` | Practice under review, or declined with reason | Staff, pending or declined |
| `/staff/queue` | S4, modals S5, S6, urgent review dialog | Staff |
| `/staff/visits/[id]` | S7 | Staff |
| `/staff/patients`, `/staff/patients/[id]` | S8, S9 | Staff, role-gated |
| `/staff/settings/[tab]` | S10, S11 | Admin |
| `/staff/profile` | S12 | Staff |
| `/platform/practices` | S13 practice approvals | Platform admin |

The existing live `/appointmentId/` route must be migrated to the visit-token route so identifiers are not guessable.

### Data flow

Staff actions (Call, Mark seen, Cancel, Add walk-in) hit API endpoints that write the visit and a queue event in one transaction, then broadcast through SignalR. Patient clients subscribe to their own visit and the queue summary, never other patients' rows. If the socket drops, the client polls every 15 seconds and shows the P8 banner after two failed polls. Mutations use idempotency keys so a double tap on Call cannot call two patients.

### Environments

Local, preview per pull request, production. A seed creates the demo practice (Rosebank Family Practice) so every screen can be compared with the canvas.

---

## 6. Data model and state machine

A visit is the central record: a queue entry that may originate from a booking, with status, estimate inputs and a public token. Every table carries `PracticeId`.

### Entities

| Entity | Key fields | Notes |
| --- | --- | --- |
| practice | id, name, slug, address, phone, avg_consult_minutes, status (pending, approved, declined, suspended), decline_reason, reviewed_by, reviewed_at, timezone | Slug drives `/c/[slug]`; changing it breaks QR codes |
| practice_hours | practice_id, weekday, opens, closes, is_open | Patients can only join while open |
| blocked_time | practice_id, practitioner_id?, starts_at, ends_at, repeat_rule, reason | Pauses queue and bookings |
| staff_user | id, practice_id, names, mobile, hpcsa_number?, role (admin, reception, clinician) | First user is admin |
| platform_admin | id, email | Reviews practices; separate from practice staff |
| practitioner | id, practice_id, name, room | Shown on P5 and S6 |
| patient | id, practice_id, names, phone, phone_is_whatsapp, id_type, id_number (encrypted), dob, email?, medical_aid?, next_of_kin? | ID needed for billing, see 6.5 |
| consent | patient_id, kind, given_at, withdrawn_at, notice_version | Gates retention of history |
| visit | id, practice_id, patient_id, practitioner_id?, source, status, urgency, urgency_review_status, reason, joined_at, called_at, seen_at, ended_at, token_hash, booking_id?, is_for_dependent, guardian_name, guardian_phone, guardian_relationship | Position is derived, not stored |
| urgency_review | visit_id, requested_by, decided_by, decision (approved, declined), reason, decided_at | Audit of every urgent decision |
| booking | id, practice_id, patient_id, practitioner_id, starts_at, duration, reason | Becomes a visit on check-in |
| intake_question / intake_answer | question: type, prompt, options, range, labels, required, active, position. Answer: visit_id, question_id, value | Structured only |
| clinical_note | visit_id or patient_id, author_id, body | Staff only, never exposed to patient API |
| notification | visit_id, channel, template, status, provider_id, sent_at | Delivery audit |
| queue_event | visit_id, type, actor_id?, at | S7 timeline and estimate history |
| audit_log | actor_id, action, entity, entity_id, at | Reads of patient files, ID reveals, exports |
| subscription | practice_id, installation_fee_paid_at, monthly_fee, next_invoice_at | Manual invoicing in the MVP |

### Visit status transitions

| From | To | Actor | Side effects |
| --- | --- | --- | --- |
| (none) | waiting | Patient (P6) or reception (S5) | Assign position, send confirmation, start estimate |
| booked | waiting | Reception check-in or patient scan | Joins at arrival time |
| waiting | in_consultation | Staff Call or Call next | Send "ready for you", show room |
| in_consultation | done | Staff Mark seen | Record seen_at, open P10 |
| waiting | cancelled | Patient (P12) | Reorder queue, no message |
| waiting | cancelled | Staff Cancel | Show P11, send message, reorder |
| waiting | no_show | Staff | Counts on S9 |

When a visit leaves waiting, later positions move up by one and estimates recompute within one second.

### 6.4 Urgent flag and admin review (decision 2)

I read your answer to question 2 as: a staff member marks a visit Urgent; this only flags it; an admin approves or declines moving it up, and records a reason. If you meant something else, say so and I will revise.

1. Staff set urgency to Urgent in S5 or S7. The visit gets the **Needs review** pill and a banner at the top of S4. Queue order does not change. The patient never sees the urgency.
2. An admin opens the review dialog showing patient, reason, joined time and position, and chooses **Approve** or **Decline**. A reason is required either way.
3. Approve moves the visit to the front of the waiting list (position 1) and recalculates every estimate. Decline keeps it where it is and lowers the flag to a note.
4. Every decision writes an `urgency_review` row and a `queue_event`, with who decided, when and why.
5. Emergencies are not a software queue problem. Add a standing line on P5 and P6: "If this is an emergency, call 10177 or go to the nearest emergency unit." Confirm the wording with the practice.

### 6.5 ID rule (decision 3)

IDs are needed for billing, so the rule is: **ID is required before billing, not before queueing.**

- **S5 (reception walk-in):** ID type and number stay required, as designed. Allow passport and other ID types for non-citizens; nationality stays.
- **P6 (patient self-join):** ID stays optional so a patient is never blocked from joining. The visit shows an **ID missing** pill on S4 until reception captures it.
- **Mark seen** warns when the ID is still missing. An Admin can override with a reason.
- Under POPIA, state the purpose on screen where ID is asked: "Used for billing and your medical aid claim." Do not use IDs for anything else.
- Store ID numbers encrypted, mask them by default (S9), and audit every reveal.

### 6.6 Minors and dependents (decision 5)

- P6 and S5 gain a first question: **Who is this visit for? Me / A child or someone I care for.**
- If "someone I care for": capture the patient's name and date of birth, plus guardian name, relationship and phone. Messages go to the guardian's number.
- If a date of birth makes the patient under 18, the guardian fields are required and the consent checkbox is given by the guardian, with the guardian named in the consent record.
- On S4 and S7, show a small "Guardian: name, phone" line. Clinical notes attach to the patient, not the guardian.

---

## 7. Patient surface (P1 to P15)

Mobile web at 402px, single column, no login. The journey is: scan, join, wait, be called, give feedback. Build in that order.

| ID | Screen | Build spec | States and edge cases |
| --- | --- | --- | --- |
| P1 | Landing, general practice | Hero, two CTAs, demo phone card with position and EstimateRange, how it works, FAQ accordion. | Demo uses labelled fixture data. Remove unmeasured stats. |
| P2 | Landing, dentist | Same shell; chair list, three feature cards. | Phase 5. Claims must match shipped features. |
| P3 | Landing, small clinic | Same shell; three-stream counts, WhatsApp CTA. | Phase 5, needs multi-stream queues. |
| P4 | Find a clinic | Search, filter chips (All, GP, Dentist, Open now), practice cards with Open or Closed pill, distance, estimate, waiting count, Join the queue or Request a booking. | Location optional and off by default. Closed cards show next opening. Empty state offers phone numbers. |
| P5 | Clinic page | Name, practitioners, open status, queue length and estimate, Join the queue, Book a time instead, address with Open in Maps, phone, hours, leave-the-building note, emergency line. | Closed: replace Join with opening time. Estimate says it is not a booked time. |
| P6 | Join the queue | "Who is this for" choice, first and last name, phone, WhatsApp checkbox, optional ID type and number with billing-purpose note, POPIA consent checkbox with notice link, Join the queue. Returning-device banner with Not you? Clear and start fresh. | Consent unchecked by default and not required to join. Validate SA mobile numbers; validate RSA ID checksum only when entered. Duplicate join on the same phone returns the existing visit. Disable the button while submitting. |
| P7 | Live status, waiting | Practice header, refresh, hero card (Waiting, position, in line, estimate with basis), Complete quick intake row, messaging row, updated dot, Leave the queue link. | Realtime with `aria-live`. Leave opens P12. |
| P8 | Waiting, offline | P7 plus warning banner, "You're next in line", Under 10 min, Last confirmed N minutes ago, explanation card, Try again now. | Triggered by failed polls or socket loss. Never remove the patient because the client is offline. |
| P9 | Called, in consultation | Primary card with icon, "You're being seen now", practitioner and room, visit summary. | Vibrate if supported. Leave link removed. |
| P10 | Done | Accent card, visit complete, time seen and minutes in room, 1 to 5 star feedback with optional comment, follow-up row. | Feedback goes to reception, not the clinical record (say so on screen). |
| P11 | Cancelled by practice | Neutral card with who cancelled and when; Join the queue again; Call reception. | Rejoin goes to the back; copy says so. |
| P12 | Leave-queue confirm | Bottom sheet over dimmed P7: warning icon, text naming current position, Keep my place (primary), Yes, leave the queue (destructive outline). | Default focus on Keep my place. Idempotent. |
| P13 | Quick intake | Back, progress bar, one structured question per step, Submit intake. | Questions come from the builder (S11). No free text. Save per answer. |
| P14 | Intake submitted | Confirmation, still position, Back to my queue position. | Position is live. |
| P15 | Notification preview | Explains WhatsApp first and SMS fallback with no medical detail; shows the real templates. | Render from the same template source as the sender. |

Patient-side rules that apply everywhere:

- The page title and every message show the practice name, never other patients' names or positions.
- The word "Estimated" is part of the estimate component, not the copy.
- Leaving the queue and consent withdrawal are the only destructive patient actions, and both need confirmation.
- An invalid or expired token shows a neutral screen with the practice phone, not an error.

---

## 8. Staff portal (S1 to S13)

Desktop and tablet at a 1320px shell: 240px left nav (Queue, Patients, My profile, and Settings for Admin), practice name under the logo, signed-in name and role at the foot, 1200px content column.

| ID | Screen | Build spec | States and edge cases |
| --- | --- | --- | --- |
| S1 | Sign in | Split layout: brand panel, form with email, password with show/hide, Sign in, Forgot password, New practice? Sign up. | Generic error on bad credentials, lockout after repeated failures, email verification via SendGrid. Brand panel must not show another practice's details to signed-out users. |
| S2 | Onboarding 1 of 2 | Stepper, practice name, patient-link slug with live availability, street address, reception phone, average consult duration (default 15 min). | Slug rules: lowercase, hyphens, unique. Autosave draft. |
| S3 | Onboarding 2 of 2 | First and last name, mobile, optional HPCSA number, info box about Admin role and pending status, POPIA statement, Go to queue. | Submitting creates the practice as **pending** and sends it to review. Record acceptance of the operator terms with timestamp and version. |
| Pending | Under review | Plain screen: "Your practice is under review." Shows submitted details and a contact. If declined, shows the reason and an Edit and resubmit button. | Staff can sign in but see only this screen until approved. Email sent on every decision. |
| S4 | Queue dashboard | Title, date, practitioners on shift; New booking and Add walk-in; four stat cards (Waiting, Called today, Seen today, Estimated median wait); filter tabs with counts; table (position, patient and phone, urgency pill and reason, joined time, estimate, actions); Needs review banner for flagged urgent visits; live dot. | Actions by state: Call next on the first waiting row, Call on others, Cancel (one-line confirm), Open; Mark seen for in consultation. Done rows greyed. ID missing pill where relevant. Optimistic updates with rollback. |
| S5 | Add walk-in modal | Find existing patient by name, phone or ID (with Already in queue and Select); or new patient: who is this for, names, nationality, ID type and number with live validation and derived date of birth, phone with WhatsApp checkbox, optional email, reason, urgency, send-link checkbox, Add to queue. Header shows the position they will get. | ID required (6.5). Guardian fields for dependents (6.6). Block adding someone already in the queue. Choosing Urgent triggers the review flow (6.4). |
| S6 | New booking modal | Patient card with Change patient, date, practitioner, 15-minute slot grid, reason, confirmation checkbox, summary, Create booking. | Slots from hours, blocked time and existing bookings. Past slots disabled. Blocked windows cannot be booked. |
| S7 | Appointment detail | Back link, patient header with age and join time, status pill, Call next and Cancel visit; intake answers; clinical note with Discard and Save; estimate card; visit timeline; consent card; guardian line if a dependent. | Notes role-restricted and audited. Timeline from `queue_event`. The estimate matches the patient's figure. |
| S8 | Patients list | Record count, search, filter chips, table (name, phone, last visit, visits, consent pill), Add patient. | Server-side search and sort by most recent visit. |
| S9 | Patient file | Header with masked ID, Edit details, Add to today's queue; visit history; notes; contact; visit pattern; POPIA card with Export file and Withdraw consent. | Withdraw and export write audit entries. ID reveal audited. See section 10 for what withdrawal deletes. |
| S10 | Settings: hours and blocked time | Tabs; weekly hours with toggles; blocked time list; patient QR code with Copy link, Download QR, Open patient app; estimates note. | Validate close after open. Warn on slug change. QR as PNG and print PDF. |
| S11 | Intake question builder | Drag to reorder, required and active toggles, inline editor, live patient preview, Add a question tiles, free text disabled. | Reorder persists. Questions with past answers are soft-deleted. |
| S12 | My profile | Name and email, role, names, mobile, HPCSA; notification toggles; security (change password, devices, sign out of another device). | Email read-only. Remote sign-out ends that session immediately. |
| S13 | Practice approvals (new, platform admin) | List of pending practices with name, submitter, address, submitted date. Detail view with the submitted details. **Approve** or **Decline**, where Decline requires a written reason. | Manual review (decision 6). Approve sets status approved, sends the welcome email with the patient link and QR instructions. Decline stores the reason, emails it, and lets the applicant correct and resubmit. Every decision is logged. |

### Role matrix (confirm with the pilot practice)

| Capability | Platform admin | Practice admin | Reception | Clinician |
| --- | --- | --- | --- | --- |
| Approve or decline practices | Yes | No | No | No |
| View and operate queue | No | Yes | Yes | Yes |
| Add walk-in, create booking | No | Yes | Yes | No |
| Call patient, mark seen | No | Yes | Yes | Yes |
| Flag a visit Urgent | No | Yes | Yes | Yes |
| Approve or decline an urgent move-up | No | Yes | No | No |
| Read and write clinical notes | No | Yes | No | Yes |
| View patient file | No | Yes | View only | View only |
| Export file, withdraw consent | No | Yes | No | No |
| Settings, staff, intake builder, QR | No | Yes | No | No |

---

## 9. Queue, estimates, messaging and offline

### 9.1 Estimate engine

Position and estimate are computed on the server so every client shows the same result. Position is derived by ordering waiting visits by `joined_at` (with approved urgent move-ups applied); it is never stored.

For a waiting patient at position n, the expected wait is the sum of expected consult durations of everyone ahead, divided by the practitioners currently seeing patients, plus any blocked time inside that window:

```
W(n) = ( sum of d(i) for i = 1 to n-1 ) / k + B
```

Here d(i) is the expected duration of visit i, k is practitioners in session, and B is overlapping blocked minutes (for example lunch 13:00 to 13:45).

- Expected duration: the practice's average consult setting until at least 20 real consults exist; then the rolling median of the last 30 consults for that practitioner.
- Range: W(n) plus or minus a spread taken from the interquartile range of recent consults, never below 5 minutes. Round to 5-minute steps. Position 1 shows "Under 10 min".
- Always labelled Estimated. Refresh on every queue event and at least every 60 seconds.
- Dashboard median wait (S4) is the median of current estimates for waiting visits.

### 9.2 Ordering

Default order is arrival. Staff may Call any waiting visit out of order and every other estimate recalculates. Urgent move-ups happen only after an admin approves them (6.4).

### 9.3 Messaging provider (decision 7)

**SendGrid cannot send WhatsApp or SMS.** It is an email platform. Plan for two providers:

| Channel | Used for | Provider |
| --- | --- | --- |
| Email | Practice approval and decline, verification, password reset, daily summary, optional patient booking confirmations | SendGrid |
| WhatsApp and SMS | Queue confirmation, "two away", "ready for you", cancellation, booking reminders | A messaging provider with WhatsApp Business API and SMS, for example Twilio (which also owns SendGrid), Clickatell or BulkSMS. Compare current rates and South African sender-ID support before choosing. |

Requirements for the WhatsApp and SMS provider: pre-approved WhatsApp utility templates, a verified business account, delivery-status webhooks, STOP handling, and a clean fallback from WhatsApp to SMS.

### 9.4 Message cost against the R200 plan (decision 8)

At R2,000 installation and R200 per month, per-message cost matters. As an illustration only (my assumptions, replace with real provider quotes): a clinic seeing 40 patients a day for 22 days, at three messages per visit, sends about 2,640 messages a month. At a cost of even R0.25 to R0.60 per message that is roughly R660 to R1,580, which is more than the R200 subscription.

Options to decide before launch:

- Pass message costs through to the practice as a usage line on the invoice.
- Include a monthly message allowance in the R200 and charge above it.
- Send WhatsApp first and cap SMS fallbacks; send only the three essential messages (confirmation, two away, ready).
- Raise the monthly price. You noted it will be updated later; use real quotes when you do.

Payments in the MVP: invoice manually (EFT) for the installation fee and monthly fee. Do not build a payment gateway until the pilot proves the price.

### 9.5 Notification triggers

| Trigger | Intent | Channel |
| --- | --- | --- |
| Visit created | Position, estimate with "this can change", live link | WhatsApp, SMS if undelivered after 2 minutes |
| Position reaches 3 or fewer ("two away") | Make your way to reception | WhatsApp, SMS fallback |
| Staff calls patient | Practitioner is ready, room number | WhatsApp, SMS fallback |
| Staff cancels | No longer in the queue, call reception | WhatsApp, SMS fallback |
| Booking created | Confirmation, then reminder the evening before | WhatsApp, SMS fallback |

No diagnosis, reason or intake content in any message. Keep SMS under 160 characters. Store delivery status and provider id, not extra identifiers.

### 9.6 Realtime and offline

The client subscribes to its visit and the practice queue summary. If the socket drops it polls every 15 seconds. After two failed polls it shows the P8 banner, keeps the last known position and stamps "Last confirmed N minutes ago". On reconnect it fetches current state, removes the banner and announces the change with `aria-live`. Staff screens use the same channel and the S4 live dot turns to a warning state when stale. As a PWA, cache the app shell so the offline banner still renders without a network.

---

## 10. POPIA, privacy and security

This is an engineering checklist, not legal advice. Have a South African privacy lawyer review the consent text, operator agreement and retention rules before launch.

The app stores health-related information about identifiable people, which South African law treats as special personal information. The practice decides why and how data is used (responsible party); BabyBlue processes it on the practice's behalf (operator). The canvas references a signed operator agreement (S1) and an authorisation statement (S3): both need real documents and versioned acceptance records.

### Controls to build

- **Minimise:** only name and phone are needed to join. ID is collected for billing (6.5) with its purpose stated. Nationality, email, medical aid and next of kin are optional.
- **Consent:** record-storage consent is a separate, unchecked, withdrawable checkbox with a versioned notice. Joining must work without it.
- **Minors:** guardian required (6.6); the guardian gives consent.
- **Access:** tenant filter on every query, role matrix enforced on the server, every read of a patient file, ID reveal, note and export audited.
- **Encryption:** TLS everywhere; encryption at rest; field-level encryption for ID numbers and clinical notes with keys held outside the database.
- **Visit tokens:** 128-bit random, hashed at rest, expire after the visit, rate-limited, first name only in public views, `noindex` and no-referrer headers on `/q/` routes.
- **Messaging:** no medical content; opt-out honoured; delivery logs kept for the practice.
- **Authentication:** email verification, strong passwords, optional TOTP for Admin, device list and remote sign-out, idle timeout on shared reception machines.
- **Retention:** a default schedule per data type, configurable by Admin, with automatic deletion jobs and a documented backup retention.
- **Hosting and transfers:** South African or nearest-region hosting; document any cross-border processing (messaging, email, error tracking); keep patient data out of third-party logs and analytics.
- **Incidents:** a breach runbook, a named contact, alerts from the audit log, and a notification template for practices.
- **Analytics:** none on `/q/` routes; consent-based only on marketing pages.

### Open question 4, explained

The canvas says "Withdrawing consent removes visit history from the patient file." The problem: medical practices are usually required by professional rules to keep patient records for a number of years, so a patient pressing "Withdraw consent" may not be able to make the practice delete everything.

What the app needs to know is: when a patient withdraws consent, what exactly is deleted, and what is kept because the practice must keep it?

Proposed default until a lawyer confirms:

- Withdrawing stops BabyBlue from storing new visit history for that patient and hides past history from reception's day-to-day view.
- Clinical notes and billing data are kept for the legally required period, then deleted automatically.
- The practice, not BabyBlue, decides on any early deletion request and the Admin sees a clear message saying so.

### Testing

Tenant-isolation tests for every query (a user from practice A must never see practice B, including through SignalR groups), token enumeration tests, role-matrix tests, and a test that a declined or pending practice cannot reach queue endpoints.

---

## 11. Build phases

Ship the smallest slice a clinic can pay for first: join by QR, live queue, honest estimate, WhatsApp or SMS nudge, and a reception dashboard. Durations assume one full-stack developer and are rough. Two codebases (Next.js and .NET) add overhead, so re-plan after Phase 1.

| Phase | Scope | Rough time | Exit gate |
| --- | --- | --- | --- |
| 0. Foundations | Repo audit and rename to BabyBlue; .NET solution (controllers, services, EF Core, tenant filter); Next.js shell; tokens and primitives; auth; practice and staff schema; seed data; CI and preview deploys | 1 to 2 weeks | Primitives match the canvas; tenant-isolation tests pass |
| 1. Core loop | S1 to S4, S5, S13 and the pending screen; P5, P6 (with guardian path), P7 to P9, P11, P12; queue engine v1; SignalR; offline banner; urgent review flow; SendGrid emails | 4 to 5 weeks | A staff user and a patient phone run a full visit; two devices stay in sync under network loss; a new practice can be approved or declined with a reason |
| 2. Messaging and intake | P13 to P15, S11, WhatsApp and SMS provider, templates, delivery webhooks, two-away and cancel triggers | 2 to 3 weeks | Messages delivered in a live test; no medical content; STOP handled; message cost per visit measured |
| 3. Patients and bookings | S6, S7 notes, S8 to S9, export and withdraw, P10, P4, role matrix, S10, S12 | 3 weeks | Role-matrix and audit tests pass; withdrawal wording approved by counsel |
| 4. Pilot | One practice live for 2 to 4 weeks. Manual invoicing: R2,000 installation then R200 monthly (to be updated) | 2 to 4 weeks | Estimate error, adoption and message cost per practice measured; first real stats usable on P1 |
| 5. Variants | P1 to P3 final copy, dentist standby list and procedure-length slots, multi-stream queues, patient-side booking | After pilot | Build only what pilot practices ask for and will pay for |

### Definition of done for any screen

- Matches the canvas at 402px (patient) or 1320px (staff), with documented breakpoints below.
- Every state exists: loading, empty, error, offline where relevant, disabled.
- Keyboard and screen-reader pass: focus order, labels, `aria-live` where status changes.
- Uses only design-system tokens and primitives.
- The server enforces authorisation and validation; client validation is a convenience.
- Has at least one test for the happy path and the main failure.

### Key acceptance tests

- A patient joins from a QR scan on a mid-range Android phone over a weak connection and sees position and estimate within 3 seconds of the page loading.
- Staff presses Call next; the patient's screen flips to the in-consultation card within 2 seconds and every later position drops by one.
- A patient in airplane mode for 60 seconds keeps their position; the banner appears and state reconciles on reconnect.
- A token for visit A cannot read visit B; staff of practice A cannot see practice B data, including over SignalR.
- Leaving the queue needs confirmation, can be repeated safely, and reorders everyone behind.
- A visit flagged Urgent does not move until an admin approves; approving or declining without a reason is rejected.
- A pending practice cannot reach queue pages; a declined practice sees the reason and can resubmit.
- A visit for a child cannot be created without guardian name, relationship and phone.

---

## 12. Remaining open questions

1. **Messaging provider:** which WhatsApp and SMS provider will you use alongside SendGrid, and who owns the WhatsApp Business verification?
2. **Message costs:** how will message costs be covered at R200 per month (pass through, allowance, or higher price)?
3. **Retention:** confirm the default in section 10 (open question 4) with a lawyer or the pilot practice.
4. **Urgent review:** confirm the reading of decision 2 in 6.4, and whether clinicians as well as admins may approve.
5. **Database:** PostgreSQL or SQL Server?
6. **Repo:** confirm the existing repo's real structure so this spec's architecture can be reconciled with it.
7. **Emergency wording:** confirm the standing emergency line on P5 and P6 with the pilot practice.
