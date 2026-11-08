# BabyBlue

**A live queue and patient-flow system for South African clinics.**
Owned and operated by **Apex Motus**. Stage: **pre-pilot, building** (October 2026).

This README describes the business: who it serves, how it makes money, what it costs to run, how it reaches customers, and what is still undecided. Technical detail lives in `BabyBlue-Design-Implementation-Spec.md`.

> Convention used below: anything marked **[Assumption]** is a working guess that has not been measured. Anything marked **[Decide]** is an open decision. Nothing here is a proven result, because no clinic is using BabyBlue yet.

---

## 1. The problem

Patients at walk-in and small private practices sit in a waiting room to hold their place in line. Reception keeps the order on paper or in their head, patients cannot tell how long they will wait, and clinics cannot easily see how busy the day is. For appointment-based practices (such as dentists), a cancelled slot is often lost because there is no fast way to offer it to someone else.

## 2. The product

Two connected surfaces share one queue record:

- **Patient app (mobile web / PWA).** A patient scans a clinic's QR code, joins the queue from their phone, sees their position and an honest wait estimate, completes a short structured intake, and gets WhatsApp or SMS messages when they are nearly up. They can leave the building and come back when called.
- **Staff portal (web).** Reception sees one live list, adds walk-ins, creates bookings, calls patients, flags urgent cases for admin review, and manages patient files, opening hours, blocked time, and intake questions.

Design principles that are part of the business promise:

- The wait is always shown as an **Estimated range**, never a promise.
- Intake is **structured only**, so health detail is not typed into free text.
- Privacy is built in: consent is explicit and withdrawable, a guardian is required for minors, and messages never contain medical detail.

## 3. Who it is for

| Segment | Need | Status |
| --- | --- | --- |
| GP practices | One live list instead of a crowded waiting room | First target. Core queue product. |
| Dentists | Booked chairs, filled cancellations, fewer no-shows | Needs a standby list and procedure-length slots. Planned after the pilot. |
| Small multi-room clinics | One queue shared by nurses, GPs and treatment rooms | Needs multi-stream queues. Planned after the pilot. |

**[Decide]** which single segment is the pilot and first paying customer. The product that is built first (Phase 1) serves GP practices; the other two segments are priced and sold only once their features exist.

Two kinds of users inside each customer: **staff** (admin, reception, clinician) who run the system, and **patients** who never create an account.

## 4. Value proposition

| For | Value |
| --- | --- |
| Patients | Wait away from a crowded room, know roughly how long, get told when to come back. |
| Reception | One live list, fewer interruptions asking "how long?", less paper. |
| Practice owner | A clearer view of waiting time and daily volume, and a more professional patient experience. |

**[Assumption]** Claims such as "fewer people in the waiting room" or "faster set-up" are not yet measured and must not appear in marketing until the pilot produces real numbers.

## 5. Revenue model

Current pricing, set by the owner and **to be updated later**:

| Item | Price | Notes |
| --- | --- | --- |
| Installation fee | **R2,000** once per practice | Covers account set-up, practice details, QR code, and staff walkthrough. |
| Subscription | **R200 per month** per practice | Includes the platform. Message costs are not yet decided (see 6). |

Billing in the pilot is manual (EFT invoice). A payment gateway is built only after the price is proven.

**[Decide]** whether the subscription is per practice, per practitioner, or per location, and whether there are annual or multi-location discounts.

Possible future revenue (not committed): a usage line for WhatsApp and SMS, premium modules for dentists (standby list, procedure slots) and multi-stream queues, and onboarding or training packages.

## 6. Cost structure

| Cost | Type | Notes |
| --- | --- | --- |
| Hosting and database | Monthly, grows with usage | Cloud hosting in South Africa or the nearest region. |
| Email (SendGrid) | Monthly, small | Approvals, verification, password reset, daily summaries. SendGrid does not send WhatsApp or SMS. |
| WhatsApp and SMS provider | **Per message** | Provider not yet chosen. Likely the largest variable cost. |
| Error tracking, monitoring, backups | Monthly | Needed for a system holding health information. |
| Domain and short links (bby.co.za) | Annual | Short links appear in every patient message. |
| Legal | One-off then periodic | POPIA review, operator agreement, consent wording, terms of service. |
| Support and onboarding time | Founder time | Each new practice needs set-up and a walkthrough. |
| Development | Founder time now, hires later | Next.js frontend, .NET backend. |

### Unit economics: the main risk to check first

At R200 per month, message costs can consume the whole subscription. Illustration only, using **[Assumption]** figures that must be replaced with real provider quotes:

```
messages per month  = visits per month x messages per visit
variable cost       = messages per month x cost per message
monthly margin      = R200 - variable cost - hosting and support share
```

| Visits per month | Messages (3 per visit) | Cost at R0.25 each | Cost at R0.60 each |
| --- | --- | --- | --- |
| 200 | 600 | R150 | R360 |
| 500 | 1,500 | R375 | R900 |
| 880 | 2,640 | R660 | R1,584 |

On these assumptions a busy practice costs more in messages than it pays. Options to decide before the pilot ends:

1. Pass message costs through as a usage line on the invoice.
2. Include a monthly message allowance and charge above it.
3. Send only the three essential messages (confirmation, nearly up, ready) and cap SMS fallbacks.
4. Raise the monthly price. The R200 is already marked as a placeholder.

**[Decide]** which option, once real quotes exist.

## 7. Business Model Canvas

| Block | BabyBlue |
| --- | --- |
| Customer segments | GP practices first; dentists and small multi-room clinics later. Patients are end users, not payers. |
| Value propositions | Live queue, honest wait estimate, leave the waiting room, structured intake, simple reception dashboard. |
| Channels | Direct sales to practices, WhatsApp and phone follow-up, practice QR codes (patient discovery), referrals from pilot practices. |
| Customer relationships | Personal onboarding for each practice, a named contact, in-app support, monthly check-ins in the pilot. |
| Revenue streams | R2,000 installation fee; R200 per month subscription (to be updated); possible usage and module fees. |
| Key resources | The software, the founder's engineering and operations time, messaging provider accounts, a compliance document set. |
| Key activities | Building the product, onboarding practices, approving new practices, support, compliance upkeep. |
| Key partners | WhatsApp and SMS provider, SendGrid, cloud host, a privacy lawyer. |
| Cost structure | See section 6. |

## 8. Go-to-market (pilot first)

| Stage | Goal | Success looks like |
| --- | --- | --- |
| 1. Build | Core loop live: join, wait, be called, be seen | A full visit runs end to end on real devices |
| 2. Pilot | One practice for 2 to 4 weeks | Reception uses it daily; estimate accuracy and message cost are measured |
| 3. First paying clients | Convert the pilot and add a few more practices | Installation fees paid; monthly fees collected |
| 4. Expand | Dentist and multi-stream features, based on what pilot practices ask for | New modules sold, not just built |

How practices find BabyBlue: direct outreach in Johannesburg first, referrals from the pilot practice, and the QR code itself, which puts the BabyBlue name in front of every patient.

**[Decide]** the pilot practice, the outreach list, and the sales pitch. **[Decide]** whether to offer the pilot free or at a reduced price, and for how long.

## 9. Operations

- **Onboarding.** A new practice signs up in the staff portal and is created as **pending**. A platform admin manually reviews it and approves or declines with a written reason. Approved practices receive their patient link and QR code.
- **Support.** Direct contact with practice admins during the pilot. Define response targets before the first paying client.
- **Billing.** Manual invoicing at first (installation fee, then monthly).
- **Platform roles.** Platform admin (reviews practices), practice admin, reception, clinician.

## 10. Compliance and trust

BabyBlue handles health-related information about identifiable people, which South African privacy law treats as special personal information. The practice decides how the data is used; BabyBlue processes it on the practice's behalf under an operator agreement.

Commitments built into the product:

- Consent is explicit, unchecked by default, versioned, and withdrawable.
- A guardian or parent is required for patients under 18.
- ID numbers are collected for billing, stored encrypted, masked by default, and every reveal is logged.
- Messages never contain diagnosis, reason for visit or intake answers.
- Practices cannot see each other's data; every read of a patient file is audited.

**[Decide]** with a South African privacy lawyer: consent wording, the operator agreement, retention periods, and what "withdraw consent" deletes versus what the practice must legally keep. This is a business risk, not only a technical task.

## 11. Metrics to track

| Metric | Why it matters |
| --- | --- |
| Visits per practice per month | Drives messaging cost and shows adoption |
| Message cost per visit | Tests whether R200 per month works |
| Estimate accuracy (median error) | The core product promise |
| Share of patients who join via QR | Shows patient adoption |
| Reception actions per visit (Call, Mark seen) | Shows staff actually run the queue in the system |
| Approval time for new practices | Manual review should not slow sales |
| Monthly practice churn | Whether practices keep paying |
| Support requests per practice | Cost of support |

## 12. Competition and market

**[Decide / not yet researched]** No competitor or market-size analysis has been done for this README, so none is claimed. Before pitching, list the alternatives a practice uses today (paper queue, SMS-only reminders, practice-management software with built-in queueing, appointment-only booking systems) and write down why BabyBlue is better for the chosen segment.

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Message costs exceed R200 per month | Negative margin on busy practices | Usage pricing or allowance (section 6) |
| WhatsApp template approval or SMS sender registration delays | Launch delay | Start provider setup during Phase 1 |
| Privacy incident or regulator complaint | Loss of trust, legal exposure | Controls in section 10, lawyer review, breach runbook |
| Wait estimates are wrong early on | Patient and reception distrust | Use the practice's average until 20 real consults exist; always show ranges |
| Reception does not use it consistently | Queue data is wrong | Simple UI, onboarding, keep the paper fallback during the pilot |
| Founder capacity (several projects at once) | Slow progress | Narrow Phase 1 scope; pilot before building variants |
| Landing pages promise features not yet built | Broken expectations | Show only shipped features |

## 14. Roadmap

| Phase | Scope | Rough time |
| --- | --- | --- |
| 0. Foundations | Repo audit, rename to BabyBlue, design system, auth, data model | 1 to 2 weeks |
| 1. Core loop | Patient join and live status, staff queue, practice approvals, realtime | 4 to 5 weeks |
| 2. Messaging and intake | WhatsApp and SMS, intake builder, notifications | 2 to 3 weeks |
| 3. Patients and bookings | Patient files, bookings, roles, settings | 3 weeks |
| 4. Pilot | One practice live, measure everything | 2 to 4 weeks |
| 5. Variants | Dentist and multi-stream features, patient booking | After pilot, driven by demand |

Durations assume one developer and are rough.

## 15. Open decisions

1. Pilot segment and pilot practice.
2. Message-cost model and final pricing (section 6).
3. WhatsApp and SMS provider.
4. Retention rules and consent withdrawal behaviour (needs a lawyer).
5. Subscription basis: per practice, per practitioner, or per location.
6. Support promise and response targets.
7. Competitor analysis and positioning.
8. Whether the pilot is free or discounted.

## 16. Related documents

- `BabyBlue-Design-Implementation-Spec.md`: screens, data model, architecture and build phases.
- BabyBlue Canvas (design artifact): the 27-screen visual design.
