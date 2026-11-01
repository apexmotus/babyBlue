# Phase 5: Growth (16) & Platform Admin (5), Binary Streaming, Observability & Stage 5 Cutover

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §8 (Growth, Platform), §15–§19, §20–§26 (Steps 4.4 & 4.5)
**Depends on:** [`PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`](PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md), [`PHASE_3_PATIENT_AND_BOOKING_FLOW.md`](PHASE_3_PATIENT_AND_BOOKING_FLOW.md), [`PHASE_4_PRACTICE_OS_ENDPOINTS.md`](PHASE_4_PRACTICE_OS_ENDPOINTS.md)
**Unlocks:** `IMPLEMENTATION_PLAN.md` Stage 5 (`revoke select, insert, update, delete` on all tenant tables from `anon` and `authenticated`)

---

## 1. Objective

Complete the remaining **21 endpoints** (`GrowthController` — 16 routes; `PlatformController` — 5 routes) to reach 100% coverage of the **106 stored procedures**, implement streaming binary upload/download with XSS-safe attachment headers (`API_LAYER_SPEC.md` §15), wire PII-free structured logging, OpenTelemetry tracing, and the 6 production alerts (§16), execute the 3-way error-code equality test and the 640-practitioner cold-cache load test (§20), and verify the complete Definition of Done (§26) so Stage 5's table-grant revocation can execute safely.

---

## 2. Endpoint Specification (21 Routes)

### 2.1 `GrowthController` (`Controllers/GrowthController.cs` — 16 Routes)

Class attributes:
- `[ApiController]`
- `[Authorize]`
- `[EnableRateLimiting(Policies.AuthenticatedPerUser)]`
- `[RequireBrandFeature("growth")]` — **returns `404 Not Found` (never `403`)** when `brand.IsFeatureEnabled("growth", defaultValue: false) == false` (`API_LAYER_SPEC.md` §14: *"a brand without Growth should not learn that Growth exists"*).

> **Routing rule (`API_LAYER_SPEC.md` §8):** Only `growth_requests_list` and `growth_request_create` are nested under `/v1/practices/{p:guid}/growth/requests`. The remaining 14 routes live under `/v1/growth/...` because `_require_request_access` resolves the practice from the request ID and authorises a `marketing_operator` who is not a member of that practice.

| Verb & Route | Procedure | HTTP Status & Return | Special Handling / Validation |
|---|---|---|---|
| `GET /v1/growth/services` | `growth_services_list` | `200 OK` (`IReadOnlyList<GrowthServiceRow>`) | Catalogue of marketing packages |
| `GET /v1/practices/{p:guid}/growth/requests` | `growth_requests_list` | `200 OK` (`IReadOnlyList<GrowthRequestRow>`) | Scoped to practice `{p}` |
| `POST /v1/practices/{p:guid}/growth/requests` | `growth_request_create` | `201 Created` (`{ "id": Guid }`) | Body: `ServiceSlug`, `Brief`, `BudgetCents` |
| `GET /v1/growth/requests/{id:guid}` | `growth_request_get` | `200 OK` (`GrowthRequestDetailRow`) / `404` | Authorised via `_require_request_access` |
| `PUT /v1/growth/requests/{id:guid}/status` | `growth_request_status_set` | `204 No Content` | Maps `invalid_transition` → `409`, `not_editable` → `403` |
| `GET /v1/growth/requests/{id:guid}/updates` | `growth_updates_list` | `200 OK` (`IReadOnlyList<GrowthUpdateRow>`) | |
| `POST /v1/growth/requests/{id:guid}/updates` | `growth_update_post` | `201 Created` (`{ "id": Guid }`) | Body: `[Required, StringLength(4000)] string Body` |
| `GET /v1/growth/requests/{id:guid}/approvals` | `growth_approvals_list` | `200 OK` (`IReadOnlyList<GrowthApprovalRow>`) | |
| `POST /v1/growth/requests/{id:guid}/approvals` | `growth_approval_add` | `201 Created` (`{ "id": Guid }`) | Operator-only inside procedure |
| `POST /v1/growth/requests/{id:guid}/approvals/{aid:guid}/decide` | `growth_approval_decide` | `204 No Content` | Practice owner decision (`approved` / `changes_requested`) |
| `GET /v1/growth/requests/{id:guid}/assets` | `growth_assets_list` | `200 OK` (`IReadOnlyList<GrowthAssetMetaRow>`) | Metadata only (no `bytea` column) |
| `POST /v1/growth/requests/{id:guid}/assets` | `growth_asset_add` | `201 Created` (`{ "id": Guid }`) | **`multipart/form-data` binary upload (§15)** — see §3.1 below |
| `GET /v1/growth/assets/{id:guid}/content` | `growth_asset_download` | `200 OK` (`FileContentResult`) | **Safe binary download (§15, Finding F-03)** — see §3.2 below |
| `GET /v1/growth/requests/{id:guid}/reports` | `growth_reports_list` | `200 OK` (`IReadOnlyList<GrowthReportRow>`) | One row per metric (`STORED_PROCEDURES.md` §15) |
| `POST /v1/growth/requests/{id:guid}/reports` | `growth_report_create` | `201 Created` (`{ "id": Guid }`) | Maps `metric_unknown` → `400` |
| `GET /v1/growth/inbox` | `growth_inbox` | `200 OK` (`IReadOnlyList<GrowthInboxRow>`) | Marketing operator queue |

---

### 2.2 `PlatformController` (`Controllers/PlatformController.cs` — 5 Routes)

Class attributes:
- `[ApiController]`
- `[Route("v1/platform")]`
- `[Authorize]` — **Deliberately no `[Authorize(Roles = "platform_admin")]` (`API_LAYER_SPEC.md` §8):** `is_platform_admin()` inside each of the 5 procedures is the single authority.
- `[EnableRateLimiting(Policies.AuthenticatedPerUser)]`.

| Verb & Route | Procedure | HTTP Status & Return | Validation / Notes |
|---|---|---|---|
| `GET /v1/platform/overview` | `platform_overview` | `200 OK` (`IReadOnlyList<PlatformOverviewRow>`) | Practices + practitioners verification queue |
| `GET /v1/platform/audit-log` | `platform_audit_log` | `200 OK` (`IReadOnlyList<PlatformAuditLogRow>`) | **Keyset paginated (`API_LAYER_SPEC.md` §8):** `Guid? practice`, `[Range(1, 500)] int limit = 100`, `DateTimeOffset? before = null`. Fixes Stage 0 `profiles.full_name` runtime failure (`src/app/practice/admin/page.tsx:23`). |
| `POST /v1/platform/roles` | `platform_role_grant` | `204 No Content` | Body: `[Required, EmailAddress] string Email`, `[AllowedValues("platform_admin", "marketing_operator")] string Role` (`user_not_found` → `409`) |
| `PUT /v1/platform/practices/{id:guid}/status` | `platform_practice_status_set` | `204 No Content` | Body: `[AllowedValues("pending", "active", "suspended")] string Status`, `[StringLength(500)] string? Reason`. Evicts public directory caches. |
| `PUT /v1/platform/practitioners/{id:guid}/verification` | `platform_verification_set` | `204 No Content` | Body: `[AllowedValues("unverified", "pending", "verified", "rejected")] string Status`, `[StringLength(500)] string? Note` (D-06). Evicts `CachePolicies.Profile` & `CachePolicies.Listing`. |

---

## 3. Binary Upload & Download Implementation (`API_LAYER_SPEC.md` §15)

### 3.1 `POST /v1/growth/requests/{id:guid}/assets` (`growth_asset_add`)
1. Decorate action with `[RequestSizeLimit(6_291_456)]` (`6 MiB` ceiling for multipart framing; the procedure enforces `octet_length(p_content) <= 5_242_880` (`5 MiB`) and raises `asset_too_large` → `413 Payload Too Large`). `[RequestSizeLimit]` raises the per-request ceiling above the global Kestrel limit, so step 2 does not have to be relaxed for this one route.
2. Keep global Kestrel `MaxRequestBodySize` at `65_536` (`64 KiB`) for all other JSON endpoints so non-upload endpoints cannot buffer large bodies.
3. Accept `[FromForm] IFormFile file` and `[FromForm, AllowedValues("brief_asset", "deliverable")] string kind`.
4. Stream `file.OpenReadStream()` into a `MemoryStream` capped at `5_242_881` bytes (so oversized streams trip `asset_too_large` without allocating unbounded memory) and pass `byte[]` to `GrowthProcedures.AssetAddAsync(...)`.
5. **Pass `p_size_bytes` computed from the materialised `byte[]`, never from `IFormFile.Length` or any client field** (Finding **F-13**). The Stage 3 draft guarded on the caller-supplied `p_size_bytes`, so understating the size bypassed the database limit entirely; [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) now guards on `octet_length(p_content)`. Both layers should agree, but only the `octet_length` check is evidence — keep an integration test that posts a 6 MiB body with a declared length of `1` and asserts `413 asset_too_large`.
5. Note on authorisation (`STORED_PROCEDURES.md` §15): `growth_asset_add` verifies that a `practice_owner` may only upload `kind = 'brief_asset'` and a `marketing_operator` may upload `kind = 'deliverable'` (returning `403 forbidden` otherwise).

### 3.2 `GET /v1/growth/assets/{id:guid}/content` (`growth_asset_download`)
1. Per Finding **F-03** (`API_IMPLEMENTATION_PLAN.md` §1.2), `growth_asset_download(p_asset uuid)` returns `table (file_name text, mime text, content bytea)`.
2. The controller calls `var asset = await growth.AssetDownloadAsync(id, ct);` (which throws `not_found` → `404` if no row is returned or `forbidden` → `403` via `_require_request_access`).
3. Set headers strictly to prevent stored XSS on the API origin:
   ```csharp
   Response.Headers.XContentTypeOptions = "nosniff";
   Response.Headers.CacheControl = "no-store";
   var safeMime = AllowedAssetMimes.Contains(asset.Mime) ? asset.Mime : "application/octet-stream";
   return File(asset.Content, safeMime, fileDownloadName: Path.GetFileName(asset.FileName));
   // File(..., fileDownloadName: ...) sets Content-Disposition: attachment; filename=...
   ```
   **Never** return `Content-Disposition: inline`.

---

## 4. Observability, Alerts & Dynamic CORS (`API_LAYER_SPEC.md` §16, §17, §19)

### 4.1 Structured Request Logging & PII Controls (`Middleware/RequestLoggingMiddleware.cs`)
Every request (except `/v1/queue/tokens/{token}`, which is completely excluded per §16) emits a single structured log event at completion:
```csharp
log.LogInformation(
    "request method={Method} route={Route} procedure={Procedure} status={Status} " +
    "duration_ms={Duration} brand={BrandSlug} role={DbRole} user_hash={UserHash} " +
    "request_id={RequestId} code={Code}",
    ctx.Request.Method,
    routeTemplate,                  // e.g. "/v1/practices/{p:guid}/clients" — NEVER ctx.Request.Path or QueryString
    callerAccessor.LastProcedure,
    ctx.Response.StatusCode,
    elapsedMs,
    brand?.Slug ?? "unresolved",
    caller?.DbRole.ToString() ?? "none",
    UserHash.Compute(caller?.UserId, authOptions.UserHashSalt), // HMAC-SHA256 truncated to 16 hex chars
    ctx.TraceIdentifier,
    ctx.Items["error_code"]);
```

### 4.2 OpenTelemetry & Sentry (`API_LAYER_SPEC.md` §16)
- Configure OpenTelemetry tracing with one server span per HTTP request (`http.route = routeTemplate`) and one child activity per `ProcedureGateway.RunAsync` call (`db.system = "postgresql"`, `db.operation = proc.Name`, `babyblue.brand = caller.Brand.Slug`).
- Configure Sentry to capture unhandled exceptions (`status == 500`) with `SendDefaultPii = false` and a `SetBeforeSend` hook that scrubs request bodies, cookies, headers, and query strings.

### 4.3 The Six Production Alerts (`API_LAYER_SPEC.md` §16)
Provision and fire-test in staging:
1. **`42501` rate > 1% of authenticated requests over 5 min** (detects RLS regression or missing `EXECUTE` grant).
2. **`57014` (`statement_timeout`) > 0 sustained over 2 min** (detects query shape regression).
3. **`53300` (`too_many_connections`) > 0** (detects `MaxPoolSize × instances` exceeding `bb_api` connection limit).
4. **`brand_unresolved` > 10/min for a single host** (detects DNS misconfiguration or host probing).
5. **Per-route p99 latency > 2× 7-day rolling baseline**.
6. **`too_many_holds` (`54000` / `SlotHold` 429) burst > 20/5 min** (detects diary DoS attempts).

### 4.4 Dynamic Brand CORS Provider (`BabyBlue.Api/Security/BrandCorsPolicyProvider.cs`, §17, §19)
- Background service refreshes verified domains from `public.tenant_brand_domains` every 60 minutes (plus on-demand cache refresh).
- `ICorsPolicyProvider` allows exact `https://<domain>` origins from the verified set (plus configured Vercel preview regex in non-production only).
- Never uses `AllowAnyOrigin`.

---

## 5. Next.js Growth & Platform Migration + Client Cleanup

1. **Create [`src/lib/api/growth.ts`](../../src/lib/api/growth.ts) and [`src/lib/api/platform.ts`](../../src/lib/api/platform.ts).**
2. **Migrate remaining screens:**
   - `src/components/os/GrowthDetail.tsx` and `src/app/practice/growth/*` → `src/lib/api/growth.ts` (sending `FormData` for asset uploads instead of client-supplied `kind` SQL inserts).
   - `src/app/practice/admin/page.tsx` → `src/lib/api/platform.ts`.
   - `src/lib/*-data.ts` helper modules → `src/lib/api/*`.

---

## 6. Final Verification, Load Testing & Definition of Done (`API_LAYER_SPEC.md` §20, §26)

### 6.1 Three-Way Error Code Equality Test (`BabyBlue.Integration.Tests/ErrorCodeParityTests.cs`)
Write an automated test that extracts:
1. Every key in `ProblemDetailsExceptionHandler.Codes` (C#).
2. Every key in `MESSAGES` parsed from [`src/lib/api/messages.ts`](../../src/lib/api/messages.ts) (TypeScript) — **not** from `src/local/db.ts`, which now only re-exports it (Finding **F-14**).
3. From `supabase/migrations/*.sql` (SQL), the **union** of:
   - every `raise exception '<code_name>'` literal — including `metric_unknown`, which is raised as `raise exception 'metric_unknown: %', v_key`, so match the code up to the first `:` or space;
   - every `raise exception '<code_name>'` inside a **trigger** function, which is where `too_many_holds` lives (`slot_holds_quota()`, [`IMPROVEMENT_PLAN.md`](../../IMPROVEMENT_PLAN.md) §6) — a procedures-only scan misses it;
   - every **named `check` constraint** that the handler maps by `ConstraintName`, which is where `profiles_phone_international` lives (migration `0005`) — it is never `raise`d, so a raise-only scan reports it as a C#/TS-only code and fails the test for the wrong reason.

Assert that all three sets are **identical** (`API_LAYER_SPEC.md` §10, §20, §26). The expected size is **28 raised codes + 1 constraint name = 29 entries**.

> **Why this gate is worth the effort.** Running it against the specifications as drafted would have failed: `has_records`, `last_practitioner`, `consent_required` and `price_required` were listed in [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) §2 as part of the contract but raised by no procedure body, and [`src/local/db.ts`](../../src/local/db.ts) was eleven codes short (Finding **F-10**). Both are now fixed at the source. Keep the test in CI, because a code added in one layer and forgotten in the other two is exactly the drift it exists to catch.

### 6.2 640-Practitioner Cold-Cache Load Test (`API_LAYER_SPEC.md` §20)
Write an executable load test (`tests/load/` or `BabyBlue.Integration.Tests/LoadTests.cs`):
- Seed **640 listed practitioners** across specialities and cities with availability rules and appointments (matching `IMPROVEMENT_PLAN.md` §3's benchmark corpus).
- Run concurrent cold-cache requests against `GET /v1/directory/practitioners?speciality=physiotherapy&city=johannesburg` and `POST /v1/me/holds`:
  - Assert `GET /v1/directory/practitioners` p99 < 250 ms and `POST /v1/me/holds` p99 < 150 ms.
  - Assert `NpgsqlDataSource` active connections never exceed `MaxPoolSize (40)` and zero `53300` errors occur.

### 6.3 Complete Definition of Done Checklist (`API_LAYER_SPEC.md` §26)

Before scheduling `IMPLEMENTATION_PLAN.md` Stage 5 (`revoke select, insert, update, delete on all tables ... from anon, authenticated`):

- [ ] `grep -rE "select |insert |update |delete " src/app src/components` returns zero matches.
- [ ] All **106** procedures have a generated method in `Procedures.g.cs`, a controller route under `/v1`, an OpenAPI entry in `/openapi/v1.json` (non-prod), and at least two integration tests (happy path + authorisation denial).
- [ ] The `MaxPoolSize = 1` cross-brand/cross-user pool-isolation test passes in CI.
- [ ] The 3-way error code equality test (`Codes` == `MESSAGES` == SQL `raise exception`) passes in CI.
- [ ] No function in the brand schema (`public` for Phases 0–5, per F-01 / D-31) is executable by `PUBLIC` (asserted by `BabyBlue.ContractGen` and by a database integration test).
- [ ] `BabyBlue.Api` configuration and environment variables contain no Supabase `service_role` key (`/api/leads` remains in Next.js).
- [ ] `bb_api` is verified at startup and in CI as `noinherit`, `nobypassrls`, owning zero tables, and holding zero direct table privileges.
- [ ] Every authenticated response across all 106 routes carries `Cache-Control: no-store`.
- [ ] Binary asset downloads (`GET /v1/growth/assets/{id}/content`) carry `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`; practice owners attempting to upload `kind = 'deliverable'` receive `403 forbidden`.
- [ ] A brand with `features.growth = false` receives `404` (not `403`) on all 16 `/v1/growth/*` routes.
- [ ] The 6 production alerts (§4.3) are configured and have been test-fired in staging.
- [ ] `bb_api`'s `connection limit` satisfies `instances x MaxPoolSize + reserve` for the deployed instance count (F-15), and the `53300` alert has been test-fired by temporarily lowering it.
- [ ] Every route table in Phases 2–5 matches its procedure's actual signature, verified by the generated contracts compiling without hand-editing (F-12). No DTO accepts a field that has no procedure parameter.
- [ ] Error responses on cross-origin requests carry both CORS and security headers (the `UseExceptionHandler` ordering check in Phase 1 §2.4).
- [ ] [`DECISIONS.md`](../../DECISIONS.md) carries **D-30** and **D-31**, [`ARCHITECTURE.md`](../../ARCHITECTURE.md) is updated, and `PROGRESS.md` records Stage 4 completion.
