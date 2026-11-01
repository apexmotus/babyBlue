# Phase 3: Patient (Consumer) Endpoints & Concurrency-Safe Booking Flow

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §8 (Patient), §9–§10, §12, §15, §20–§23 (Step 4.2)
**Depends on:** [`PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md`](PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md) only — Phases 2, 3 and 4 run in parallel once Phase 1's exit gate passes. (The booking UI consumes Phase 2's `public_slots_list`, so ship Phase 2 first if the Next.js patient screens are being migrated in the same pass; the API work itself is independent.)
**Next Phase:** [`PHASE_4_PRACTICE_OS_ENDPOINTS.md`](PHASE_4_PRACTICE_OS_ENDPOINTS.md)

---

## 1. Objective

Implement all **13 Patient (`authenticated`) endpoints** in `PatientController`, enforce the per-user `SlotHold` rate limit (`10/hour/user`) alongside the database's `slot_holds_quota()` trigger, verify race-proof booking and hold conflict handling (`23P01` on `no_double_booking` → `409 slot_unavailable`), wire the POPIA s23 (`GET /v1/me/export`) and POPIA s14 (`DELETE /v1/me` with `has_records` → `409`) routes, and migrate all consumer screens in `src/app/patient/*` to `src/lib/api/patient.ts`.

---

## 2. Endpoint Specification (`PatientController` — 13 Routes)

Class attributes:
- `[ApiController]`
- `[Route("v1/me")]`
- `[Authorize]` (requires a valid Supabase JWT; identity comes exclusively from `auth.uid()` inside the transaction — **no route or body parameter ever accepts a `user_id`**)
- `[EnableRateLimiting(Policies.AuthenticatedPerUser)]` (120 req/min/brand+user default, overridden on `POST /v1/me/holds`).

| Verb & Route | Procedure | HTTP Status | Request DTO / Query Parameters | Error Codes Mapped |
|---|---|---|---|---|
| `GET /v1/me/profile` | `patient_profile_get` | `200 OK` (`PatientProfileRow`) | None | `401 not_authenticated`, `404 not_found` |
| `PATCH /v1/me/profile` | `patient_profile_update` | `204 No Content` | `UpdateProfileRequest`: `[Required, StringLength(120, MinimumLength = 1)] string DisplayName`, `string? Phone` validated against **the same pattern as the database constraint** — see the note below | `400 invalid_name`, `400 profiles_phone_international` |
| `GET /v1/me/appointments` | `patient_appointments_list` | `200 OK` (`IReadOnlyList<PatientAppointmentRow>`) | `[FromQuery] bool upcoming_only = false`, `[FromQuery, Range(1, 100)] int limit = 50`, `[FromQuery, Range(0, 10_000)] int offset = 0` | `401 not_authenticated` |
| `GET /v1/me/appointments/{id:guid}` | `patient_appointment_get` | `200 OK` (`PatientAppointmentDetailRow`) / `404` | `Guid id` | `403 forbidden`, `404 not_found` |
| `POST /v1/me/holds` | `patient_slot_hold` | `201 Created` (`{ "id": "<hold_uuid>" }`, `Location: /v1/me/holds/{id}`) | `CreateSlotHoldRequest`: `[Required] Guid PractitionerId`, `[Required] Guid ServiceId`, `[Required] DateTimeOffset StartsAt` · Rate Limit: **`Policies.SlotHold` (10/h/user)** | `409 slot_unavailable`, `429 rate_limited`, `429 too_many_holds` (`54000`) |
| `GET /v1/me/holds/{id:guid}` | `patient_hold_get` | `200 OK` (`PatientHoldRow`) / `404` | `Guid id` | `403 forbidden`, `404 not_found` |
| `DELETE /v1/me/holds/{id:guid}` | `patient_hold_release` | `204 No Content` | `Guid id` | `403 forbidden`, `404 not_found` |
| `POST /v1/me/appointments` | `patient_appointment_book` | `201 Created` (`{ "id": "<appt_uuid>" }`, `Location: /v1/me/appointments/{id}`) | `BookAppointmentRequest`: `[Required] Guid HoldId` — **and nothing else** (Finding **F-12**) | `404 not_found`, `409 hold_expired`, `409 slot_unavailable` (`23P01` `no_double_booking`) |
| `POST /v1/me/appointments/{id:guid}/cancel` | `patient_appointment_cancel` | `204 No Content` | `CancelAppointmentRequest`: `[StringLength(240)] string? Reason` | `403 forbidden`, `404 not_found`, `409 too_late_to_cancel`, `409 not_cancellable` |
| `POST /v1/me/appointments/{id:guid}/reschedule` | `patient_appointment_reschedule` | **`204 No Content`** (the procedure is `returns void`; it moves the existing appointment rather than creating a new one, so there is no id to return) | `RescheduleAppointmentRequest`: `[Required] DateTimeOffset NewStartsAt` | `403 forbidden`, `404 not_found`, `409 too_late_to_cancel`, `409 not_reschedulable`, `409 slot_unavailable` |
| `POST /v1/me/appointments/{id:guid}/check-in` | `patient_appointment_check_in` | `204 No Content` | None | `403 forbidden`, `404 not_found`, `409 too_early_to_check_in`, `409 not_checkin_able` |
| `GET /v1/me/export` | `patient_account_export` | `200 OK` (`application/json` attachment) | None | `401 not_authenticated` |
| `DELETE /v1/me` | `patient_account_delete` | `204 No Content` | None | `409 has_records`, `409 sole_owner` |

---

### 2.1 Signature Notes (Finding **F-12**)

The route table above mirrors [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) exactly. Three contracts in the first draft did not, and all three would have failed to compile once `BabyBlue.ContractGen` generated from the real catalogue:

- **`patient_appointment_book(p_hold uuid)` takes one argument.** `Notes` and `MarketingOptIn` have no parameters to bind to. Notes on a patient booking and marketing opt-in are both real product questions, but they are **changes to the procedure** (and, for marketing consent, to the `client_consents` series), not fields a controller can accept and drop. If they are wanted, add them in Stage 3 and regenerate; do not let the DTO promise what the database cannot store.
- **`consent_required` is not reachable from this route.** `patient_appointment_book` now writes its own `record_storage` consent event with `channel = 'app'` when it auto-creates the client row — the patient's own booking *is* the consent act under POPIA s11(1)(a). That both closes a real gap (the auto-created client row previously had no consent trail at all) and means the code has exactly one raise site, on the staff-side `practice_appointment_create`.
- **`patient_appointment_reschedule` is `returns void`.** `204`, not `200` with an id.

### 2.2 Phone Validation — Mirror the Constraint, Don't Invent One

Request validation for `Phone` must use **the same pattern the database enforces**, because the route table promises `400 profiles_phone_international` — and that code can only be produced by the `check` constraint of that name. A stricter regex in the DTO returns ASP.NET's generic model-validation payload instead, which carries no `code` at all, so [`src/lib/api/messages.ts`](../../src/lib/api/messages.ts) has nothing to look up and the user sees a raw field error.

There is an unresolved divergence to settle first (**Decision 8** in [`API_IMPLEMENTATION_PLAN.md`](../../API_IMPLEMENTATION_PLAN.md) §3):

- `DECISIONS.md` **D-21** says the number "must be a mobile that works on WhatsApp (South African landlines are refused with a helpful message), is stored as `+27`… and is enforced by a database check (migration 0005)".
- Migration `0005` actually enforces only E.164: `check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')`.

So D-21 describes a constraint that does not exist. Resolve it in **one** place and have the DTO follow:

- **If D-21 wins:** tighten the constraint to `^\+27[6-8][0-9]{8}$` in a Stage 2/3 migration, and use that same pattern in the DTO. Note this rejects every non-South-African number, which is a product decision about who can hold an account, not just a formatting rule.
- **If the constraint wins:** use `^\+[1-9][0-9]{7,14}$` in the DTO and amend D-21's wording, keeping the landline guidance as client-side help text rather than a hard rule.

Either way, add a test asserting the DTO pattern and the constraint accept and reject exactly the same set, so they cannot drift again.

---

## 3. Critical Implementation Details

### 3.1 `POST /v1/me/holds` & `POST /v1/me/appointments` — Concurrency & No-Retry Discipline (`API_LAYER_SPEC.md` §4, §10, §12)

1. **No Retries on Writes:** Both `patient_slot_hold` and `patient_appointment_book` are marked `Volatility.Volatile` by `BabyBlue.ContractGen`. `ProcedureGateway` must never retry them.
2. **`patient_appointment_book` is safe to call without an application-level slot check.** It takes `for update` on the hold and translates `exclusion_violation` into `slot_unavailable` itself, so `no_double_booking` does the real work. The controller must not pre-check availability and must not retry.
3. **Dual-Layer Hold Quota (`API_LAYER_SPEC.md` §12):**
   - `Policies.SlotHold` uses `RateLimitPartition.GetFixedWindowLimiter($"{brandSlug}:u:{sub}", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromHours(1), QueueLimit = 0 })`.
   - When the in-process limiter rejects the 11th hold in an hour, it returns `429` with `code: "rate_limited"` and `Retry-After`.
   - When the database trigger `slot_holds_quota()` rejects with SQLSTATE `54000` (`too_many_holds`), `ProblemDetailsExceptionHandler` maps it to `429` with `code: "too_many_holds"`.
4. **Exclusion Constraint Mapping (`D-05`, `API_LAYER_SPEC.md` §10):**
   - If two concurrent requests race past the hold check or attempt overlapping bookings/holds, PostgreSQL's GiST exclusion constraint (`no_double_booking` or `no_overlapping_holds`) raises SQLSTATE `23P01`.
   - `ProblemDetailsExceptionHandler` maps `SqlState == "23P01"` on `no_double_booking` / `no_overlapping_holds` to HTTP `409 Conflict` with `code: "slot_unavailable"`.

### 3.2 POPIA s23 Data Export (`GET /v1/me/export`, `API_LAYER_SPEC.md` §15, §23)

- `patient_account_export` returns a `jsonb` document (`JsonElement`).
- The controller action sets:
  ```csharp
  Response.Headers.ContentDisposition = "attachment; filename=\"babyblue-export.json\"";
  Response.Headers.CacheControl = "no-store";
  return Ok(exportJsonElement);
  ```
- Do not deserialise into a C# DTO (allowing the export document to include new tables as clinical phases arrive) and never log or truncate the payload.

### 3.3 POPIA s14 Account Deletion (`DELETE /v1/me`, `API_LAYER_SPEC.md` §8, §23, D-29)

- Calls `patient_account_delete()`.
- When the patient has active/retained records (`has_records`), the procedure raises `has_records` and the API returns `409 Conflict` with `{ "code": "has_records", "request_id": "..." }`.
- Ensure [`src/local/db.ts`](../../src/local/db.ts) `MESSAGES["has_records"]` is displayed cleanly in the patient profile UI so the patient receives an accurate explanation.

---

## 4. Next.js Consumer App Migration (`src/app/patient/*`)

1. **Create [`src/lib/api/patient.ts`](../../src/lib/api/patient.ts):**
   - Implement typed functions for all 13 endpoints (`getMyProfile`, `updateMyProfile`, `listMyAppointments`, `getMyAppointment`, `holdSlot`, `getHold`, `releaseHold`, `bookAppointment`, `cancelMyAppointment`, `rescheduleMyAppointment`, `checkInAppointment`, `exportMyAccount`, `deleteMyAccount`).
2. **Migrate consumer pages (`src/app/patient/*`):**
   - Replace every `query()`, `mutate()`, and inline SQL call in `src/app/patient/page.tsx`, booking drawers, hold timers, appointment detail screens, and account settings with `src/lib/api/patient.ts`.
   - Keep error handling wired through `friendlyError(err)` reading `ApiError.code` → `MESSAGES[code]`.

---

## 5. Verification & Exit Gate (`Step 4.2`)

1. **Happy + Denial Tests for all 13 Endpoints (`BabyBlue.Integration.Tests`):**
   - Unauthenticated calls to all 13 routes return `401` (`code: "not_authenticated"`) without invoking any procedure.
   - `consumer1` requesting `GET /v1/me/appointments/{consumer2ApptId}`, `POST .../cancel`, `POST .../reschedule`, `POST .../check-in`, `GET /v1/me/holds/{consumer2HoldId}`, or `DELETE /v1/me/holds/{consumer2HoldId}` receives `403` (`code: "forbidden"`) or `404` (`code: "not_found"`).
2. **Multi-Connection Booking Concurrency Test (`ROADMAP.md` item 5, `API_LAYER_SPEC.md` §20):**
   - Launch two parallel HTTP requests (`consumer1` and `consumer2`) to `POST /v1/me/holds` for the exact same `(practitioner_id, service_id, starts_at)`:
     - Assert **one** returns `201 Created` and **the other** returns `409 Conflict` with `code: "slot_unavailable"`.
3. **Hold Quota Rate-Limit Test (`API_LAYER_SPEC.md` §12, §20):**
   - Issue 11 rapid `POST /v1/me/holds` requests as `consumer1` → the first 10 succeed (or evaluate normal slot logic) and the **11th returns `429 Too Many Requests`**.
4. **Cancellation Window & Check-In Window Tests:**
   - Cancelling an appointment inside the practice's `cancellation_window_hours` returns `409` with `code: "too_late_to_cancel"`.
   - Checking in more than 2 hours before `starts_at` returns `409` with `code: "too_early_to_check_in"`.
5. **POPIA s23 & s14 Journey Tests:**
   - `GET /v1/me/export` returns `200 OK` with `Content-Disposition: attachment; filename="babyblue-export.json"` and `Cache-Control: no-store`.
   - `DELETE /v1/me` for a patient with retained records returns `409` with `code: "has_records"`; for a patient with no blocking records returns `204 No Content`; for a patient who is the sole owner of a practice returns `409` with `code: "sole_owner"`.
   - **This test only passes because of Finding F-10.** The Stage 3 draft of `patient_account_delete` had dropped the `exception when foreign_key_violation then raise exception 'has_records'` handler that ships today at `supabase/migrations/0004_app_functions.sql:90-91`; without it a retained row surfaces as SQLSTATE `23503` and maps to a generic `409 conflict`, so assert on `code`, never on the status alone.
6. **Zero Consumer SQL Gate:**
   - `grep -rE "select |insert |update |delete " src/app/patient` returns empty.
