# Phase 4: Practice OS Endpoints (62 Routes Across 8 Sub-Domain Modules)

**Spec reference:** `nestjs-api-implementation-spec.md` §9 (module generation recipe — followed per sub-domain)
**Blueprint reference:** `api_dotnet` `Controllers/Practice{Context,Team,Services,Availability,Clients,Queue,Appointments,Settings}Controller.cs`; `docs/plans/api/PHASE_4_PRACTICE_OS_ENDPOINTS.md`
**Depends on:** [`PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md`](PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md) only — independent of Phases 2 and 3, may be built in parallel
**Next phase:** [`PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md`](PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md)

---

## 1. Objective

Implement all **62 practice-OS routes** across 8 sub-domain modules. Role-based and practice-isolation checks are enforced **inside the database procedures** (`_require_member`/`_require_role`) — this layer's job is routing, validation shape, and correct error-code mapping, never re-implementing authorization logic that already lives in SQL. Close the sole-owner demotion gap, preserve the append-only consent model, verify non-idempotent concurrent queue calling, and keep every sub-domain's module boundary matching the .NET controller split 1:1 so the generated-contract diff stays reviewable.

Deliver **one PR per sub-domain module** (8 PRs), same reviewability reasoning as the .NET plan. All 8 modules carry the auth guard and `authenticatedPerUser` throttle policy by default.

---

## 2. Sub-Domain Delivery Order & Endpoint Specification

### 2.1 PR 4.1 — `practice-context` module (11 routes, `/v1/practices`, `/v1/me/platform-role`)

*(`GET /v1/practices` was scaffolded in Phase 1 §2.7; this PR completes the remaining 10.)*

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices` | `practice_memberships_list` | `PracticeMembershipRow[]` (`200`) | Built in Phase 1 |
| `GET /v1/me/platform-role` | `platform_my_role` | scalar `string?` → `{ "role": string \| null }` (`200`) | |
| `GET /v1/practices/:p/dashboard` | `practice_dashboard_get` | `jsonb` passthrough (`200`) | Never typed/deserialized — same rule as Phase 3 §3.2 |
| `GET /v1/practices/:p/insights` | `practice_insights_get` | `jsonb` passthrough (`200`) | |
| `GET /v1/practices/:p/setup-progress` | `practice_setup_progress` | `PracticeSetupProgressRow` (`200`) | Single-row — see Phase 1 §2.3 classification list |
| `GET /v1/practices/:p/calendar/appointments` | `practice_calendar_appointments` | `PracticeCalendarAppointmentRow[]` (`200`) | `from`/`to: timestamptz` required, `practitioner?: uuid`; `(to - from) > 90 days` → `400 invalid_range` |
| `GET /v1/practices/:p/calendar/availability` | `practice_calendar_availability` | `PracticeCalendarAvailabilityRow[]` (`200`) | `practitioner?: uuid` |
| `GET /v1/practices/:p/calendar/time-off` | `practice_calendar_timeoff` | `PracticeCalendarTimeOffRow[]` (`200`) | `from`/`to: timestamptz` required, `practitioner?: uuid` |
| `GET /v1/practices/:p/queue/preview` | `practice_queue_preview` | `PracticeQueuePreviewRow[]` (`200`) | `limit?: 1-20 = 5` |
| `GET /v1/practices/:p/queue/waiting-count` | `practice_queue_waiting_count` | scalar `int` → `{ "count": number }` (`200`) | |
| `GET /v1/practices/:p/bookings/recent` | `practice_recent_app_bookings` | `PracticeRecentAppBookingRow[]` (`200`) | Backs the "new from BabyBlue" dashboard card |

### 2.2 PR 4.2 — `practice-team` module (12 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/practitioners` | `practice_practitioners_list` | `PracticePractitionerRow[]` (`200`) | Any practice member |
| `POST /v1/practices/:p/practitioners` | `practice_practitioner_create` | `201` (`{ "id": string }`) | Body: `display_name`, `speciality`, `title`, `bio`, `languages: string[]`, `listing_status` |
| `PATCH /v1/practices/:p/practitioners/:id` | `practice_practitioner_update` | `204` | Evicts cache tags `brand:{slug}:practitioner:{id}` and `brand:{slug}:facets` (Phase 2 §3.1) |
| `GET /v1/practices/:p/practitioners/:id/services` | `practice_practitioner_services_list` | `string[]`/rows (`200`) | |
| `PUT /v1/practices/:p/practitioners/:id/services` | `practice_practitioner_services_set` | `204` | Body: `service_ids: string[]` (`uuid[]` passed natively via `pg`'s array support) |
| `GET /v1/practices/:p/practitioners/:id/registrations` | `practice_registrations_list` | `PracticeRegistrationRow[]` (`200`) | Multi-council registration (4NF) |
| `POST /v1/practices/:p/practitioners/:id/registrations` | `practice_registration_submit` | `201`/`204` | Maps `registration_in_use` → `409`, `invalid_registration` → `400` |
| `GET /v1/practices/:p/practitioners/:id/verifications` | `practice_verifications_list` | `PracticeVerificationRow[]` (`200`) | Append-only history |
| `GET /v1/practices/:p/members` | `practice_team_list` | `PracticeTeamMemberRow[]` (`200`) | |
| `POST /v1/practices/:p/members` | `practice_member_add` | `201`/`204` | Body: `email` required valid email, `role` in `practice_owner`\|`practitioner`\|`receptionist`\|`staff`\|`clinician`; `user_not_found` → `409` |
| `PUT /v1/practices/:p/members/:userId/role` | `practice_member_role_set` | `204` | **Closes the sole-owner demotion gap** (see §2.2.1). Maps `sole_owner` → `409` |
| `DELETE /v1/practices/:p/members/:userId` | `practice_member_remove` | `204` | Maps `sole_owner` → `409` |

#### 2.2.1 Sole-owner demotion — the gap this route exists to close

The route this PR ships is itself the fix for a bug the original frontend-direct-SQL code had: `ownerA`, the sole owner of `practiceA`, must not be able to demote themselves (or be demoted) to a non-owner role, and must not be removable, while they are the only owner. Both cases are enforced by the procedure (`practice_member_role_set`/`practice_member_remove` raise `sole_owner`), not by this layer — the controller's only job is mapping `sole_owner` → `409` correctly and never short-circuiting before the procedure runs. §4 item 2 below is the regression test that must exist for this specific case, because it was previously missing entirely.

### 2.3 PR 4.3 — `practice-services` module (5 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/services` | `practice_services_list` | `PracticeServiceRow[]` (`200`) | |
| `PUT /v1/practices/:p/services` | `practice_service_upsert` | `200` (`{ "id": string }`) | Optional `service_id` in body; maps `price_required` → `400` (raised when `active = true` and `price_cents` is null), `invalid_name` → `400`, `not_found` → `404` |
| `GET /v1/practices/:p/services/:id/practitioners` | `practice_service_practitioners_list` | `string[]`/rows (`200`) | |
| `PUT /v1/practices/:p/services/:id/practitioners` | `practice_service_practitioners_set` | `204` | Body: `practitioner_ids: string[]`; maps `last_practitioner` → `409` — raised when the array is empty **and** the service has future `booked`/`confirmed` appointments |
| `POST /v1/practices/:p/services/:id/deactivate` | `practice_service_deactivate` | `204` | Deliberately `POST .../deactivate`, not `DELETE`; maps `service_in_use` → `409` when future appointments exist |

### 2.4 PR 4.4 — `practice-availability` module (6 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/practitioners/:id/availability` | `practice_availability_list` | `PracticeAvailabilityRow[]` (`200`) | `start_time`/`end_time` exposed as `string`, never a parsed range type |
| `PUT /v1/practices/:p/practitioners/:id/availability` | `practice_availability_set` | `204` | Maps `overlapping_availability` → `409`, `invalid_range` → `400` |
| `POST /v1/practices/:p/practitioners/:id/availability/pattern` | `practice_availability_apply_pattern` | `204` | Preset weekly pattern |
| `GET /v1/practices/:p/time-off` | `practice_timeoff_list` | `PracticeTimeOffRow[]` (`200`) | `timestamptz` fields as ISO strings, never a naive local time |
| `POST /v1/practices/:p/time-off` | `practice_timeoff_add` | `201` (`{ "id": string }`) | Practice-timezone-aware — see §4 item 6 (non-SAST timezone regression) |
| `DELETE /v1/practices/:p/time-off/:id` | `practice_timeoff_remove` | `204` | |

### 2.5 PR 4.5 — `practice-clients` module (9 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/clients` | `practice_clients_list` | `PracticeClientRow[]` (`200`) | `q?` ≤120 chars, `limit?: 1-100 = 50`, `offset?: 0-100000 = 0` |
| `GET /v1/practices/:p/clients/search` | `practice_client_search` | `PracticeClientSearchRow[]` (`200`) | Separate typeahead route, `limit` default 6 max 20, policy `clientTypeahead` (60/min/user) |
| `GET /v1/practices/:p/clients/:id` | `practice_client_get` | `PracticeClientDetailRow` (`200`/`404`) | Column visibility scoped by role **inside the procedure** |
| `POST /v1/practices/:p/clients` | `practice_client_create` | `201` (`{ "id": string }`) | Body: `first_name` required 1-120 chars, `last_name?` ≤120 chars default `""`, `phone?`, `email?` valid, `consent_record_storage?: boolean = false`. **No `evidence` field** — `practice_client_create` takes `p_consent boolean`, not jsonb; evidence attaches via a follow-up `POST .../consents` call. Maps `invalid_name` → `400` |
| `PATCH /v1/practices/:p/clients/:id` | `practice_client_update` | `204` | |
| `PUT /v1/practices/:p/clients/:id/notes` | `practice_client_notes_set` | `204` | Administrative notes only |
| `GET /v1/practices/:p/clients/:id/consents` | `practice_client_consents_list` | `PracticeClientConsentRow[]` (`200`) | Returns the full append-only event series |
| `POST /v1/practices/:p/clients/:id/consents` | `practice_client_consent_grant` | `204` | Body: `purpose` in `record_storage`\|`appointment_reminders`\|`marketing`, `evidence?: jsonb` ≤8KiB |
| `DELETE /v1/practices/:p/clients/:id/consents/:purpose` | `practice_client_consent_withdraw` | `204` | `purpose` route param validated against the same allowed set; appends a withdrawal event, never erases the grant |

#### 2.5.1 Append-only consent — the read that governs is `order by at desc limit 1`

`practice_appointment_create` (§2.7) is the only write-path raise site for `consent_required`, and it reads the client's **latest** `record_storage` consent event, not an `exists(... granted)` check. §4 item 4's test exists specifically to prove this: grant → withdraw → grant again must leave booking working, and a withdrawal between the two grants must have actually blocked a booking attempted in that window — a series that only ever appends rows is a safety property only if the newest row is the one enforced.

### 2.6 PR 4.6 — `practice-queue` module (5 routes, class-level `@RequireBrandFeature('flow')`)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/queue` | `practice_queue_list` | `PracticeQueueEntryRow[]` (`200`) | |
| `POST /v1/practices/:p/queue/walk-ins` | `practice_queue_walkin_add` | `201` (`{ "id": string }`) | |
| `PUT /v1/practices/:p/queue/:id/status` | `practice_queue_status_set` | `204` | Maps `invalid_transition` → `409` |
| `POST /v1/practices/:p/queue/call-next` | `practice_queue_call_next` | scalar `uuid` → `200` `{ "id": string }`, or `204` when empty | **Non-idempotent (`FOR UPDATE SKIP LOCKED`), never retried, never cached** — `volatility: 'volatile'` in the generated catalogue, same no-retry guarantee as Phase 3's booking routes. Returns a bare id, not a row; fetch detail separately via `GET .../queue` if needed |
| `PUT /v1/practices/:p/queue/:id/client` | `practice_queue_link_client` | `204` | Links a walk-in queue entry to a `clients` record |

### 2.7 PR 4.7 — `practice-appointments` module (7 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `GET /v1/practices/:p/appointments/:id` | `practice_appointment_get` | `PracticeAppointmentDetailRow` (`200`/`404`) | Includes `source` (drives the "via BabyBlue" UI chip) |
| `GET /v1/practices/:p/appointments/:id/history` | `practice_appointment_history` | `PracticeAppointmentHistoryRow[]` (`200`) | Status-event history (4NF) |
| `POST /v1/practices/:p/appointments` | `practice_appointment_create` | `201` (`{ "id": string }`) | Maps `slot_unavailable` (`23P01`) → `409`, `consent_required` → `409`, `not_found` → `404`. **Only raise site for `consent_required`** — see §2.5.1 |
| `PUT /v1/practices/:p/appointments/:id/status` | `practice_appointment_status_set` | `204` | Maps `invalid_transition` → `409` |
| `POST /v1/practices/:p/appointments/:id/cancel` | `practice_appointment_cancel` | `204` | **Staff bypass the patient cancellation window deliberately** — staff cancelling a tomorrow-morning appointment the patient phoned about is a legitimate case the patient-side window must not block |
| `POST /v1/practices/:p/appointments/:id/reschedule` | `practice_appointment_reschedule` | `204` | Maps `slot_unavailable` → `409` |
| `GET /v1/practices/:p/appointments/slots` | `practice_appointment_slots` | `PublicSlotRow[]` (`200`) | Staff slot finder, `practitioner`/`service: uuid` required, `day: date` required (one day at a time, not a range) |

### 2.8 PR 4.8 — `practice-settings` module (7 routes)

| Verb & route | Procedure | Return shape | Validation / notes |
|---|---|---|---|
| `POST /v1/practices` | `practice_create` | `201` (`{ "id": string }`) | Rate limit: `practiceCreate` (3/day/user); maps duplicate `slug` (`23505`) → `409 conflict` |
| `POST /v1/practices/onboard` | `practice_onboard` | `201` (`{ "id": string }`) | Full onboarding wizard payload; same `practiceCreate` limit |
| `GET /v1/practices/:p/settings` | `practice_settings_get` | `PracticeSettingsRow` (`200`/`404`) | |
| `PATCH /v1/practices/:p/settings` | `practice_settings_update` | `204` | Owner-only, enforced by `_require_role` **in the database**, not re-checked here |
| `GET /v1/practices/:p/locations` | `practice_locations_list` | `PracticeLocationRow[]` (`200`) | |
| `PUT /v1/practices/:p/locations` | `practice_location_upsert` | `200` (`{ "id": string }`) | Evicts the `facets` cache tag |
| `DELETE /v1/practices/:p/locations/:id` | `practice_location_remove` | `204` | |

---

## 3. Frontend Migration Note

`admin-dashboard`'s post-restructure `src/lib/api/practice*.ts` modules already call this exact contract against the .NET API today — same note as Phase 2 §4.1: this phase's job is making the NestJS server match the existing client contract, not changing the client.

---

## 4. Verification & Exit Gate

1. **62-route happy + cross-practice denial + lesser-role denial suite:** for every route, calling with `ownerB`'s token against `practiceA` → `403`. Calling an owner-only mutation (`PATCH /settings`, `PUT /members/:u/role`, `DELETE /members/:u`, `POST /practitioners`) with a receptionist's token → `403`.
2. **Sole-owner demotion regression test:** `ownerA` (sole owner of `practiceA`) calling `PUT /v1/practices/:practiceA/members/:ownerA/role` with `{ "role": "practitioner" }` → `409` `code: "sole_owner"`. This is the one test that must never be allowed to regress silently — it is the fix this module exists to ship.
3. **Service deactivation guard:** deactivating a service with a future confirmed appointment → `409 service_in_use`.
4. **Append-only consent series test:** `POST .../consents` (`record_storage`) → `DELETE .../consents/record_storage` → `GET .../consents` returns **both** events in chronological order. Then: `POST /v1/practices/:p/appointments` for that client → `409 consent_required` while withdrawn, succeeds again after a fresh grant. This second half is the test that actually proves §2.5.1's "newest event governs" claim — the first half alone only proves the series records history, not that anything reads it.
5. **`price_required`/`last_practitioner` guard tests:** `PUT /services` with `active: true, price_cents: null` → `400 price_required`. `PUT /services/:id/practitioners` with an empty array while a future confirmed appointment exists → `409 last_practitioner`; → `204` once there is none.
6. **Concurrent `call-next` test:** seed 2 waiting queue entries; fire two concurrent `POST /queue/call-next` requests over real HTTP against a real Postgres → assert **two distinct** entry ids returned, never the same one twice and never an error.
7. **Non-SAST timezone test:** create a practice with a non-UTC+2 timezone (e.g. `Africa/Lagos`, UTC+1), add time-off via the timestamptz-typed route, assert the stored window reflects that offset rather than a hardcoded `+02:00` — a regression here means someone replaced a timezone-aware column read with a hardcoded offset somewhere in the mapping layer.
8. **Practice-create quota test:** 4th `POST /practices` by one user within 24 hours → `429 rate_limited`.
