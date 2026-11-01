# Phase 4: Practice OS Endpoints (62 Endpoints Across 8 Controllers)

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §8 (Practice sub-domains), §9–§10, §12, §15, §20–§22 (Step 4.3)
**Depends on:** [`PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md`](PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md) only — Phases 2, 3 and 4 are independent of each other and run in parallel once Phase 1's exit gate passes. (The dependency graph in [`API_IMPLEMENTATION_PLAN.md`](../../API_IMPLEMENTATION_PLAN.md) §2 has been corrected to match.)
**Next Phase:** [`PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md`](PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md)

---

## 1. Objective

Implement all **62 Practice OS endpoints** across the 8 domain controllers specified in `API_LAYER_SPEC.md` §2 and §8, enforce role-based and practice-isolation checks strictly inside the database procedures (`_require_member` / `_require_role`), close the Stage 0 sole-owner demotion bug behind `PUT /v1/practices/{p}/members/{userId}/role`, preserve the append-only POPIA s11(3) consent model (`POST` grant + `DELETE` withdraw), verify non-idempotent concurrent queue calling (`POST /v1/practices/{p}/queue/call-next`), and remove all inline SQL from `src/app/practice/*` and Practice OS components.

---

## 2. Sub-Domain Delivery Order & Endpoint Specification (62 Routes)

Per `API_LAYER_SPEC.md` §22, deliver this phase in **one PR per sub-domain controller** (8 PRs total) so code review stays tractable. All 8 controllers carry `[ApiController]`, `[Authorize]`, and `[EnableRateLimiting(Policies.AuthenticatedPerUser)]`.

### 2.1 PR 4.1 — `PracticeContextController` (11 Routes)

*(Note: `GET /v1/practices` was scaffolded in Phase 1; complete the remaining 10 routes here.)*

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices` | `practice_memberships_list` | `IReadOnlyList<PracticeMembershipRow>` (`200`) | Built in Phase 1 |
| `GET /v1/me/platform-role` | `platform_my_role` | `string?` wrapped as `{ "role": string? }` (`200`) | Scalar `text` return |
| `GET /v1/practices/{p:guid}/dashboard` | `practice_dashboard_get` | `JsonElement` (`200`) | Verbatim `jsonb` (`API_LAYER_SPEC.md` §15) |
| `GET /v1/practices/{p:guid}/insights` | `practice_insights_get` | `JsonElement` (`200`) | Verbatim `jsonb` (`API_LAYER_SPEC.md` §15) |
| `GET /v1/practices/{p:guid}/setup-progress` | `practice_setup_progress` | `PracticeSetupProgressRow` (`200`) | Single-row `RETURNS TABLE` |
| `GET /v1/practices/{p:guid}/calendar/appointments` | `practice_calendar_appointments` | `IReadOnlyList<PracticeCalendarAppointmentRow>` (`200`) | `[Required] DateTimeOffset from`, `[Required] DateTimeOffset to`, `Guid? practitioner` (`> 90 days` → `400 invalid_range`) |
| `GET /v1/practices/{p:guid}/calendar/availability` | `practice_calendar_availability` | `IReadOnlyList<PracticeCalendarAvailabilityRow>` (`200`) | `Guid? practitioner` |
| `GET /v1/practices/{p:guid}/calendar/time-off` | `practice_calendar_timeoff` | `IReadOnlyList<PracticeCalendarTimeOffRow>` (`200`) | `[Required] DateTimeOffset from`, `[Required] DateTimeOffset to`, `Guid? practitioner` |
| `GET /v1/practices/{p:guid}/queue/preview` | `practice_queue_preview` | `IReadOnlyList<PracticeQueuePreviewRow>` (`200`) | `[Range(1, 20)] int limit = 5` |
| `GET /v1/practices/{p:guid}/queue/waiting-count` | `practice_queue_waiting_count` | `{ "count": int }` (`200`) | Scalar `int` return |
| `GET /v1/practices/{p:guid}/bookings/recent` | `practice_recent_app_bookings` | `IReadOnlyList<PracticeRecentAppBookingRow>` (`200`) | Supports D-22 "New from BabyBlue" dashboard card |

---

### 2.2 PR 4.2 — `PracticeTeamController` (12 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/practitioners` | `practice_practitioners_list` | `IReadOnlyList<PracticePractitionerRow>` (`200`) | Any practice member |
| `POST /v1/practices/{p:guid}/practitioners` | `practice_practitioner_create` | `201 Created` (`{ "id": Guid }`) | Body: `DisplayName`, `Speciality`, `Title`, `Bio`, ` string[] Languages`, `ListingStatus` |
| `PATCH /v1/practices/{p:guid}/practitioners/{id:guid}` | `practice_practitioner_update` | `204 No Content` | Evicts `OutputCache` tag `"brand:{slug}:practitioner:{id}"` and `"brand:{slug}:facets"` |
| `GET /v1/practices/{p:guid}/practitioners/{id:guid}/services` | `practice_practitioner_services_list` | `IReadOnlyList<Guid>` / rows (`200`) | |
| `PUT /v1/practices/{p:guid}/practitioners/{id:guid}/services` | `practice_practitioner_services_set` | `204 No Content` | Body: `Guid[] ServiceIds` (`uuid[]` passed natively via Npgsql, §15) |
| `GET /v1/practices/{p:guid}/practitioners/{id:guid}/registrations` | `practice_registrations_list` | `IReadOnlyList<PracticeRegistrationRow>` (`200`) | Multi-council registration support (4NF) |
| `POST /v1/practices/{p:guid}/practitioners/{id:guid}/registrations` | `practice_registration_submit` | `201 Created` / `204` | Maps `registration_in_use` → `409`, `invalid_registration` → `400` |
| `GET /v1/practices/{p:guid}/practitioners/{id:guid}/verifications` | `practice_verifications_list` | `IReadOnlyList<PracticeVerificationRow>` (`200`) | Append-only verification history (4NF) |
| `GET /v1/practices/{p:guid}/members` | `practice_team_list` | `IReadOnlyList<PracticeTeamMemberRow>` (`200`) | |
| `POST /v1/practices/{p:guid}/members` | `practice_member_add` | `201 Created` / `204` | Body: `[Required, EmailAddress] string Email`, `[AllowedValues("practice_owner", "practitioner", "receptionist", "staff", "clinician")] string Role` (`user_not_found` → `409`) |
| `PUT /v1/practices/{p:guid}/members/{userId:guid}/role` | `practice_member_role_set` | `204 No Content` | **Fixes Stage 0 bug (`src/app/practice/team/page.tsx:318`).** Maps `sole_owner` → `409 Conflict`. |
| `DELETE /v1/practices/{p:guid}/members/{userId:guid}` | `practice_member_remove` | `204 No Content` | Maps `sole_owner` → `409 Conflict` |

---

### 2.3 PR 4.3 — `PracticeServicesController` (5 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/services` | `practice_services_list` | `IReadOnlyList<PracticeServiceRow>` (`200`) | |
| `PUT /v1/practices/{p:guid}/services` | `practice_service_upsert` | `200 OK` (`{ "id": Guid }`) | Optional `Guid? ServiceId` in body; maps `price_required` → `400` (raised when `Active = true` and `PriceCents` is null — guard added per Finding **F-10**), `invalid_name` → `400`, `not_found` → `404` |
| `GET /v1/practices/{p:guid}/services/{id:guid}/practitioners` | `practice_service_practitioners_list` | `IReadOnlyList<Guid>` / rows (`200`) | |
| `PUT /v1/practices/{p:guid}/services/{id:guid}/practitioners` | `practice_service_practitioners_set` | `204 No Content` | Body: `Guid[] PractitionerIds`; maps `last_practitioner` → `409`, raised when the array is empty **and** the service has future `booked`/`confirmed` appointments (guard added per Finding **F-10** — emptying the set would leave bookings nobody can deliver) |
| `POST /v1/practices/{p:guid}/services/{id:guid}/deactivate` | `practice_service_deactivate` | `204 No Content` | Deliberately `POST .../deactivate` (not `DELETE`, §8); maps `service_in_use` → `409` when future appointments exist |

---

### 2.4 PR 4.4 — `PracticeAvailabilityController` (6 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/practitioners/{id:guid}/availability` | `practice_availability_list` | `IReadOnlyList<PracticeAvailabilityRow>` (`200`) | Exposes `start_time` / `end_time` as `string`, never `timerange` (§6, §15) |
| `PUT /v1/practices/{p:guid}/practitioners/{id:guid}/availability` | `practice_availability_set` | `204 No Content` | Maps `overlapping_availability` → `409`, `invalid_range` → `400` |
| `POST /v1/practices/{p:guid}/practitioners/{id:guid}/availability/pattern` | `practice_availability_apply_pattern` | `204 No Content` | Preset weekly pattern application |
| `GET /v1/practices/{p:guid}/time-off` | `practice_timeoff_list` | `IReadOnlyList<PracticeTimeOffRow>` (`200`) | Uses `DateTimeOffset` (`timestamptz`), never `DateTime` (§6) |
| `POST /v1/practices/{p:guid}/time-off` | `practice_timeoff_add` | `201 Created` (`{ "id": Guid }`) | Practice timezone-aware (`Africa/Lagos` regression test, `STORED_PROCEDURES.md` §21) |
| `DELETE /v1/practices/{p:guid}/time-off/{id:guid}` | `practice_timeoff_remove` | `204 No Content` | |

---

### 2.5 PR 4.5 — `PracticeClientsController` (9 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/clients` | `practice_clients_list` | `IReadOnlyList<PracticeClientRow>` (`200`) | `[StringLength(120)] string? q`, `[Range(1, 100)] int limit = 50`, `[Range(0, 100_000)] int offset = 0` |
| `GET /v1/practices/{p:guid}/clients/search` | `practice_client_search` | `IReadOnlyList<PracticeClientSearchRow>` (`200`) | Separate typeahead route (`limit` default 6, max 20) with `Policies.ClientTypeahead` (60/min/user) |
| `GET /v1/practices/{p:guid}/clients/{id:guid}` | `practice_client_get` | `PracticeClientDetailRow` (`200` / `404`) | Column-scoped by role inside the procedure (`STORED_PROCEDURES.md` §1) |
| `POST /v1/practices/{p:guid}/clients` | `practice_client_create` | `201 Created` (`{ "id": Guid }`) | Body: `[Required, StringLength(120, MinimumLength = 1)] string FirstName`, `[StringLength(120)] string LastName = ""`, `string? Phone`, `[EmailAddress] string? Email`, `bool ConsentRecordStorage = false`. **No `Evidence` field** (Finding **F-12**): `practice_client_create` takes `p_consent boolean`, not a `jsonb`. To attach consent evidence, create the client then `POST .../consents` — which does take `p_evidence`. Maps `invalid_name` → `400`. |
| `PATCH /v1/practices/{p:guid}/clients/{id:guid}` | `practice_client_update` | `204 No Content` | |
| `PUT /v1/practices/{p:guid}/clients/{id:guid}/notes` | `practice_client_notes_set` | `204 No Content` | Administrative notes only (`COMPLIANCE.md`) |
| `GET /v1/practices/{p:guid}/clients/{id:guid}/consents` | `practice_client_consents_list` | `IReadOnlyList<PracticeClientConsentRow>` (`200`) | Returns full append-only event series |
| `POST /v1/practices/{p:guid}/clients/{id:guid}/consents` | `practice_client_consent_grant` | `204 No Content` | Body: `[AllowedValues("record_storage", "appointment_reminders", "marketing")] string Purpose`, `JsonElement? Evidence` (≤ 8 KiB) |
| `DELETE /v1/practices/{p:guid}/clients/{id:guid}/consents/{purpose}` | `practice_client_consent_withdraw` | `204 No Content` | Route param `purpose` validated against allowed values; appends withdrawal event without erasing prior grant (§8) |

---

### 2.6 PR 4.6 — `PracticeQueueController` (5 Routes)

Decorate controller with `[RequireBrandFeature("flow")]`.

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/queue` | `practice_queue_list` | `IReadOnlyList<PracticeQueueEntryRow>` (`200`) | |
| `POST /v1/practices/{p:guid}/queue/walk-ins` | `practice_queue_walkin_add` | `201 Created` (`{ "id": Guid }`) | |
| `PUT /v1/practices/{p:guid}/queue/{id:guid}/status` | `practice_queue_status_set` | `204 No Content` | Maps `invalid_transition` → `409` |
| `POST /v1/practices/{p:guid}/queue/call-next` | `practice_queue_call_next` | **Scalar `uuid`** → `200 OK` `{ "id": Guid }`, or `204 No Content` when the queue is empty (Finding **F-12**) | **Non-idempotent (`FOR UPDATE SKIP LOCKED`)** — never retried, never cached (§8). The procedure `returns uuid`, not a row, so this is `ScalarAsync<Guid?>` with `ReturnShape.Scalar`; the caller fetches the entry with `GET /v1/practices/{p}/queue` if it needs the detail. |
| `PUT /v1/practices/{p:guid}/queue/{id:guid}/client` | `practice_queue_link_client` | `204 No Content` | Links walk-in queue entry to a `clients` record |

---

### 2.7 PR 4.7 — `PracticeAppointmentsController` (7 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `GET /v1/practices/{p:guid}/appointments/{id:guid}` | `practice_appointment_get` | `PracticeAppointmentDetailRow` (`200` / `404`) | Includes `source` (`'app'` for D-22 "via BabyBlue" chip) |
| `GET /v1/practices/{p:guid}/appointments/{id:guid}/history` | `practice_appointment_history` | `IReadOnlyList<PracticeAppointmentHistoryRow>` (`200`) | Status event history (4NF) |
| `POST /v1/practices/{p:guid}/appointments` | `practice_appointment_create` | `201 Created` (`{ "id": Guid }`) | Maps `slot_unavailable` (`23P01`) → `409`, `consent_required` → `409`, `not_found` → `404`. **This is the only raise site for `consent_required`** (Finding **F-10**): the guard reads the latest `client_consents` event for `record_storage` and refuses when it is absent or withdrawn, which is the POPIA s11 check staff booking must not be able to skip. |
| `PUT /v1/practices/{p:guid}/appointments/{id:guid}/status` | `practice_appointment_status_set` | `204 No Content` | Maps `invalid_transition` → `409` |
| `POST /v1/practices/{p:guid}/appointments/{id:guid}/cancel` | `practice_appointment_cancel` | `204 No Content` | Staff bypass patient cancellation window per `ARCHITECTURE.md` |
| `POST /v1/practices/{p:guid}/appointments/{id:guid}/reschedule` | `practice_appointment_reschedule` | `204 No Content` | Maps `slot_unavailable` → `409` |
| `GET /v1/practices/{p:guid}/appointments/slots` | `practice_appointment_slots` | `IReadOnlyList<PublicSlotRow>` (`200`) | Staff slot finder |

---

### 2.8 PR 4.8 — `PracticeSettingsController` (7 Routes)

| Verb & Route | Procedure | Return Shape | Validation / Notes |
|---|---|---|---|
| `POST /v1/practices` | `practice_create` | `201 Created` (`{ "id": Guid }`) | Rate limit: **`Policies.PracticeCreate` (3/day/user)** (§12); maps duplicate `slug` (`23505`) → `409 conflict` |
| `POST /v1/practices/onboard` | `practice_onboard` | `201 Created` (`{ "id": Guid }`) | Full onboarding wizard payload; rate limit: `Policies.PracticeCreate` |
| `GET /v1/practices/{p:guid}/settings` | `practice_settings_get` | `PracticeSettingsRow` (`200` / `404`) | |
| `PATCH /v1/practices/{p:guid}/settings` | `practice_settings_update` | `204 No Content` | Only `practice_owner` (enforced by `_require_role` in DB) |
| `GET /v1/practices/{p:guid}/locations` | `practice_locations_list` | `IReadOnlyList<PracticeLocationRow>` (`200`) | |
| `PUT /v1/practices/{p:guid}/locations` | `practice_location_upsert` | `200 OK` (`{ "id": Guid }`) | Evicts `CachePolicies.Facets` tag |
| `DELETE /v1/practices/{p:guid}/locations/{id:guid}` | `practice_location_remove` | `204 No Content` | |

---

## 3. Next.js Practice OS Migration (`src/app/practice/*` & `src/components/os/*`)

1. **Create [`src/lib/api/practice.ts`](../../src/lib/api/practice.ts)** (or split into `practice-context.ts`, `practice-team.ts`, `practice-services.ts`, `practice-availability.ts`, `practice-clients.ts`, `practice-queue.ts`, `practice-appointments.ts`, `practice-settings.ts` re-exported from `src/lib/api/practice.ts`).
2. **Replace all inline SQL in `src/app/practice/*` (except `src/app/practice/admin/page.tsx` and `src/app/practice/growth/*`, which land in Phase 5):**
   - Notably `src/app/practice/team/page.tsx:318` now calls `PUT /v1/practices/{p}/members/{userId}/role` instead of `update practice_members set role`.

---

## 4. Verification & Exit Gate (`Step 4.3`)

1. **62-Endpoint Happy + Cross-Practice Denial + Lesser-Role Denial Suite (`BabyBlue.Integration.Tests`):**
   - For every `/v1/practices/{p}/...` endpoint:
     - Calling with `ownerB`'s token against `practiceA` returns `403 Forbidden` (`code: "forbidden"`).
     - Calling an owner-only mutation (`PATCH /settings`, `PUT /members/{u}/role`, `DELETE /members/{u}`, `POST /practitioners`) with `receptionA`'s token returns `403 Forbidden` (`code: "forbidden"`).
2. **Stage 0 Sole-Owner Demotion Regression Test (`STORED_PROCEDURES.md` §21, `API_LAYER_SPEC.md` §8):**
   - `ownerA` (sole owner of `practiceA`) calls `PUT /v1/practices/{practiceA}/members/{ownerA}/role` with `{ "role": "practitioner" }` → returns `409 Conflict` with `code: "sole_owner"`.
3. **Service Deactivation Guard Test:**
   - Calling `POST /v1/practices/{practiceA}/services/{serviceA}/deactivate` while a future confirmed appointment exists for `serviceA` returns `409 Conflict` with `code: "service_in_use"`.
4. **Append-Only Consent Event Series Test (`DATABASE_SCHEMA_4NF.md` §10, `API_LAYER_SPEC.md` §8):**
   - `POST .../consents` (`record_storage`) followed by `DELETE .../consents/record_storage` followed by `GET .../consents` returns **both** the original grant event and the withdrawal event in chronological order.
   - **Then assert the withdrawal actually bites:** `POST /v1/practices/{p}/appointments` for that client now returns `409` with `code: "consent_required"`, and succeeds again after a fresh `POST .../consents`. An append-only series is only a safety property if the newest event is the one that governs — this is the test that proves the guard reads `order by at desc limit 1` and not `exists(... granted)`.

4b. **`price_required` and `last_practitioner` Guard Tests (Finding F-10):**
   - `PUT /v1/practices/{p}/services` with `Active = true` and `PriceCents = null` returns `400` with `code: "price_required"`.
   - `PUT /v1/practices/{p}/services/{id}/practitioners` with an empty array returns `409` with `code: "last_practitioner"` while a future confirmed appointment exists for that service, and `204` once there is none.
5. **Concurrent `POST /queue/call-next` Test (`STORED_PROCEDURES.md` §21, `API_LAYER_SPEC.md` §20):**
   - Seed 2 waiting queue entries in `practiceA`. Issue two concurrent `POST /v1/practices/{practiceA}/queue/call-next` requests over HTTP → assert they return **two distinct queue entry IDs**.
6. **Timezone Leave Window Test (`Africa/Lagos`, `STORED_PROCEDURES.md` §21):**
   - Create a practice with `timezone = 'Africa/Lagos'` (`UTC+1`), add leave via `POST /v1/practices/{p}/time-off` using `DateTimeOffset`, and assert the stored window matches `UTC+1` rather than hard-coded `+02:00`.
7. **Practice Create Quota Test:**
   - 4th `POST /v1/practices` by the same user within 24 hours returns `429` (`code: "rate_limited"`).
