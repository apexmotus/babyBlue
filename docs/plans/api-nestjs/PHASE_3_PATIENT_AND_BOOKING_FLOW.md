# Phase 3: Patient (Consumer) Endpoints & Concurrency-Safe Booking

**Spec reference:** `nestjs-api-implementation-spec.md` §4.2 (business rules live in the Manager-equivalent service), §7.4 (status codes)
**Blueprint reference:** `api_dotnet` `Controllers/PatientController.cs`; `docs/plans/api/PHASE_3_PATIENT_AND_BOOKING_FLOW.md`
**Depends on:** [`PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md`](PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md) only — independent of Phases 2 and 4, may be built in parallel
**Next phase:** [`PHASE_4_PRACTICE_OS_ENDPOINTS.md`](PHASE_4_PRACTICE_OS_ENDPOINTS.md)

---

## 1. Objective

Implement all **13 authenticated patient endpoints**, enforce the per-user slot-hold rate limit alongside the database's own `slot_holds_quota()` trigger, prove race-proof booking, and wire the POPIA s23 export and s14 delete routes. Identity for every route comes exclusively from `auth.uid()` inside the transaction — **no route or body parameter ever accepts a `user_id`.**

---

## 2. Endpoint Specification (`patient.controller.ts`, `/v1/me`, `@Authorize()` on every route, default policy `authenticatedPerUser` — 120/min/brand+user)

| Verb & route | Procedure | Status | Request DTO / query | Error codes |
|---|---|---|---|---|
| `GET /v1/me/profile` | `patient_profile_get` | `200` (`PatientProfileRow`) | none | `401`, `404` |
| `PATCH /v1/me/profile` | `patient_profile_update` | `204` | `UpdateProfileDto`: `display_name` required 1-120 chars, `phone?` matches **the live database constraint pattern** (see §2.2) | `400 invalid_name`, `400 profiles_phone_international` |
| `GET /v1/me/appointments` | `patient_appointments_list` | `200` (`PatientAppointmentRow[]`) | `upcoming_only?: boolean = false`, `limit?: 1-100 = 50`, `offset?: 0-10000 = 0` | `401` |
| `GET /v1/me/appointments/:id` | `patient_appointment_get` | `200`/`404` (`PatientAppointmentDetailRow`) | `id: uuid` | `403`, `404` |
| `POST /v1/me/holds` | `patient_slot_hold` | `201` (`{ "id": "<hold_uuid>" }`, `Location`) | `CreateSlotHoldDto`: `practitioner_id`, `service_id`, `starts_at` all required · **rate limit: `slotHold` (10/hr/user)** | `409 slot_unavailable`, `429 rate_limited`, `429 too_many_holds` (`54000`) |
| `GET /v1/me/holds/:id` | `patient_hold_get` | `200`/`404` | `id: uuid` | `403`, `404` |
| `DELETE /v1/me/holds/:id` | `patient_hold_release` | `204` | `id: uuid` | `403`, `404` |
| `POST /v1/me/appointments` | `patient_appointment_book` | `201` (`{ "id": "<appt_uuid>" }`, `Location`) | `BookAppointmentDto`: `hold_id` required — **and nothing else** (see §2.1) | `404`, `409 hold_expired`, `409 slot_unavailable` |
| `POST /v1/me/appointments/:id/cancel` | `patient_appointment_cancel` | `204` | `reason?` ≤240 chars | `403`, `404`, `409 too_late_to_cancel`, `409 not_cancellable` |
| `POST /v1/me/appointments/:id/reschedule` | `patient_appointment_reschedule` | **`204`** (procedure is `returns void` — no new id) | `new_starts_at` required | `403`, `404`, `409 too_late_to_cancel`, `409 not_reschedulable`, `409 slot_unavailable` |
| `POST /v1/me/appointments/:id/check-in` | `patient_appointment_check_in` | `204` | none | `403`, `404`, `409 too_early_to_check_in`, `409 not_checkin_able` |
| `GET /v1/me/export` | `patient_account_export` | `200` (attachment) | none | `401` |
| `DELETE /v1/me` | `patient_account_delete` | `204` | none | `409 has_records`, `409 sole_owner` |

### 2.1 Signature discipline — don't let the DTO promise what the database can't store

`patient_appointment_book(p_hold uuid)` takes **one** argument. A DTO with `notes` or `marketing_opt_in` fields will compile, accept input, and silently drop it — `contract-gen`'s generated wrapper only exposes `holdId`, so the moment someone wires a DTO field to a parameter that doesn't exist, the build fails loudly instead. If notes-on-booking or marketing opt-in are wanted, that's a procedure change (and, for marketing consent, a `client_consents` series change) made first, with `contract-gen` regenerated after — never a controller-side field with nowhere to go.

`consent_required` is **not** reachable from this route: `patient_appointment_book` writes its own `record_storage` consent event with `channel = 'app'` when it auto-creates the client row (the patient's own booking is the consent act under POPIA s11(1)(a)). The only raise site for `consent_required` on the write path is the staff-side `practice_appointment_create` in Phase 4.

### 2.2 Phone validation — mirror the constraint, don't invent a new one

The DTO's `phone` validator must use **exactly** the pattern the database's `check` constraint enforces, because the route promises `code: "profiles_phone_international"` and that code can only be produced by a constraint-name match in `pg-error.mapper.ts` (Phase 1 §2.5) — a stricter regex in the DTO instead returns Nest's generic validation-pipe error shape, which carries no `code`, so `src/lib/api/messages.ts` has nothing to look up.

Confirm the current constraint text before writing the DTO regex — `supabase/migrations/0005_signup_contact.sql` is the source of truth, not any prose description of it elsewhere in the docs tree (cross-reference and resolve any mismatch between what's documented and what's actually deployed before shipping this route; add a test asserting the DTO pattern and the live constraint accept/reject the identical set of inputs, so they can't drift apart silently in either direction again).

---

## 3. Critical Implementation Details

### 3.1 `POST /v1/me/holds` & `POST /v1/me/appointments` — concurrency discipline

1. **No retries.** `patient_slot_hold` and `patient_appointment_book` are `volatility: 'volatile'` in the generated catalogue — `ProcedureGateway.runWithRetry`'s `maxAttempts` is `1` for these by construction (Phase 1 §2.1). Do not special-case a retry here; if one is ever added, it would silently double-book on a `40001` that actually succeeded server-side before the client saw the error.
2. **No application-level availability pre-check.** `patient_appointment_book` takes `FOR UPDATE` on the hold itself and translates `exclusion_violation` into `slot_unavailable`. A pre-check here would be redundant at best and a race-introducing TOCTOU bug at worst — `no_double_booking`'s GiST exclusion constraint is the actual source of truth.
3. **Dual-layer hold quota:**
   - `slotHold` throttler policy: fixed window, 10/hr, keyed `${brandSlug}:u:${sub}`. The 11th request in the window → `429` with `code: "rate_limited"` and `Retry-After`, **without ever reaching `ProcedureGateway`**.
   - If a request does reach the database and the `slot_holds_quota()` trigger rejects with SQLSTATE `54000`, `pg-error.mapper.ts`'s fallback table maps it to `429 too_many_holds` — a distinct code from `rate_limited`, deliberately, because one is an in-process throttle and the other is a database-enforced invariant that would still fire even if the throttler were ever bypassed or misconfigured.
4. **Exclusion-constraint mapping:** `SqlState === '23P01'` on constraint `no_double_booking`/`no_overlapping_holds` → `409 slot_unavailable` (Phase 1 §2.5 step 2 — constraint-name resolution).

### 3.2 POPIA s23 export (`GET /v1/me/export`)

`patient_account_export` returns a `jsonb` document. The handler must **not** deserialize it into a typed DTO — pass the raw parsed JSON straight through, so new tables added by future clinical-phase work automatically appear in the export without a code change here:

```ts
@Get('export')
@Header('Content-Disposition', 'attachment; filename="babyblue-export.json"')
@Header('Cache-Control', 'no-store')
async exportAccount(): Promise<unknown> {
  return this.procedures.scalar(Procedures.patientAccountExport, []); // jsonb passthrough, never logged, never truncated
}
```

### 3.3 POPIA s14 delete (`DELETE /v1/me`)

Calls `patient_account_delete()`. When the patient has retained records, the procedure raises `has_records` and the response is `409` with `{ "code": "has_records", "request_id": "..." }` — confirm the live procedure still carries its `foreign_key_violation` → `has_records` exception handler (this was previously found missing in a draft of the underlying SQL on the .NET side; this phase only consumes the procedure, it does not re-verify the SQL, but the integration test in §4 below must assert on `code`, never on HTTP status alone, specifically because a regression here degrades silently to a generic `409 conflict`).

---

## 4. Verification & Exit Gate

1. **Happy + denial suite, all 13 routes:** unauthenticated calls → `401` (`code: "not_authenticated"`) without ever invoking `ProcedureGateway` (assert via spy). `consumer1` requesting any of `consumer2`'s appointment/hold resources (`GET`, `cancel`, `reschedule`, `check-in`, hold `GET`/`DELETE`) → `403` or `404`.
2. **Multi-connection booking concurrency test:** launch two parallel HTTP requests (`consumer1`, `consumer2`) at `POST /v1/me/holds` for the identical `(practitioner_id, service_id, starts_at)`. Assert **exactly one** returns `201` and the other `409 slot_unavailable`. Run this against a real Postgres (Testcontainers), not a mocked gateway — the property under test is the database's exclusion constraint, not the Node code.
3. **Hold quota rate-limit test:** 11 rapid `POST /v1/me/holds` as `consumer1` → first 10 proceed to normal slot evaluation, 11th returns `429` (`code: "rate_limited"`) without reaching the database.
4. **Cancellation/check-in window tests:** cancelling inside the practice's `cancellation_window_hours` → `409 too_late_to_cancel`. Checking in more than 2 hours early → `409 too_early_to_check_in`.
5. **POPIA journeys:** `GET /v1/me/export` → `200`, `Content-Disposition: attachment; filename="babyblue-export.json"`, `Cache-Control: no-store`. `DELETE /v1/me` with retained records → `409` `code: "has_records"`; with none → `204`; as sole practice owner → `409` `code: "sole_owner"`.
6. **Zero consumer SQL gate:** `grep -rE "select |insert |update |delete " client-web/src/app/patient` (post-restructure path) returns empty — the frontend never talks to Postgres directly, only through this API.
