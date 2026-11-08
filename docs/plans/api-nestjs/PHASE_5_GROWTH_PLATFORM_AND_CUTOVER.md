# Phase 5: Growth (16) & Platform (5), Binary Streaming, Observability & Cutover

**Spec reference:** `nestjs-api-implementation-spec.md` §8.2 (logging), §8.7 (background jobs — not used here), §12 (performance)
**Blueprint reference:** `api_dotnet` `Controllers/{Growth,Platform}Controller.cs`, `Middleware/RequestLoggingMiddleware.cs`, `Observability/ObservabilitySetup.cs`, `Security/BrandCorsPolicyProvider.cs`; `docs/plans/api/PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md`
**Depends on:** [`PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`](PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md), [`PHASE_3_PATIENT_AND_BOOKING_FLOW.md`](PHASE_3_PATIENT_AND_BOOKING_FLOW.md), [`PHASE_4_PRACTICE_OS_ENDPOINTS.md`](PHASE_4_PRACTICE_OS_ENDPOINTS.md)
**Unlocks:** execution of the cutover decision recorded in `README.md` §2

---

## 1. Objective

Ship the remaining **21 routes** (Growth 16, Platform 5) to reach full coverage of the 106 procedures, implement safe binary upload/download, wire PII-free structured logging and tracing, run the 3-way error-code parity test and a cold-cache load test, complete the Definition of Done, and execute the cutover.

---

## 2. Endpoint Specification (21 Routes)

### 2.1 `growth.controller.ts` (16 routes) — class-level `@Authorize()`, `authenticatedPerUser` throttle, `@RequireBrandFeature('growth')` guard that returns **`404`, never `403`**, when `isFeatureEnabled(brand, 'growth', false) === false` — a brand without Growth must not learn that Growth exists.

> **Routing rule:** only `growth_requests_list` and `growth_request_create` nest under `/v1/practices/:p/growth/requests`. The remaining 14 live under `/v1/growth/...` because `_require_request_access` resolves the practice from the request id itself and authorizes a `marketing_operator` who is not a member of that practice — nesting them under `/practices/:p/...` would imply a membership check this layer must not perform.

| Verb & route | Procedure | Status & return | Notes |
|---|---|---|---|
| `GET /v1/growth/services` | `growth_services_list` | `200` (`GrowthServiceRow[]`) | Marketing package catalogue |
| `GET /v1/practices/:p/growth/requests` | `growth_requests_list` | `200` (`GrowthRequestRow[]`) | Scoped to `:p` |
| `POST /v1/practices/:p/growth/requests` | `growth_request_create` | `201` (`{ "id": string }`) | Body: `service_slug`, `brief`, `budget_cents` |
| `GET /v1/growth/requests/:id` | `growth_request_get` | `200`/`404` (`GrowthRequestDetailRow`) | Authorized via `_require_request_access` |
| `PUT /v1/growth/requests/:id/status` | `growth_request_status_set` | `204` | Maps `invalid_transition` → `409`, `not_editable` → `403` |
| `GET /v1/growth/requests/:id/updates` | `growth_updates_list` | `200` (`GrowthUpdateRow[]`) | |
| `POST /v1/growth/requests/:id/updates` | `growth_update_post` | `201` (`{ "id": string }`) | Body: `body` required ≤4000 chars |
| `GET /v1/growth/requests/:id/approvals` | `growth_approvals_list` | `200` (`GrowthApprovalRow[]`) | |
| `POST /v1/growth/requests/:id/approvals` | `growth_approval_add` | `201` (`{ "id": string }`) | Operator-only, enforced in-procedure |
| `POST /v1/growth/requests/:id/approvals/:aid/decide` | `growth_approval_decide` | `204` | Practice-owner decision: `approved`\|`changes_requested` |
| `GET /v1/growth/requests/:id/assets` | `growth_assets_list` | `200` (`GrowthAssetMetaRow[]`) | Metadata only, no binary column |
| `POST /v1/growth/requests/:id/assets` | `growth_asset_add` | `201` (`{ "id": string }`) | **Multipart binary upload** — see §3.1 |
| `GET /v1/growth/assets/:id/content` | `growth_asset_download` | `200` (binary) | **Safe binary download** — see §3.2 |
| `GET /v1/growth/requests/:id/reports` | `growth_reports_list` | `200` (`GrowthReportRow[]`) | One row per metric |
| `POST /v1/growth/requests/:id/reports` | `growth_report_create` | `201` (`{ "id": string }`) | Maps `metric_unknown` → `400` with the offending key in `detail` |
| `GET /v1/growth/inbox` | `growth_inbox` | `200` (`GrowthInboxRow[]`) | Marketing-operator queue |

### 2.2 `platform.controller.ts` (5 routes, `/v1/platform`, `@Authorize()` — **deliberately no role-based route guard**: `is_platform_admin()` inside each procedure is the single authority, same as the .NET version)

| Verb & route | Procedure | Status & return | Notes |
|---|---|---|---|
| `GET /v1/platform/overview` | `platform_overview` | `200` (`PlatformOverviewRow[]`) | Practices + verification queue |
| `GET /v1/platform/audit-log` | `platform_audit_log` | `200` (`PlatformAuditLogRow[]`) | **Keyset paginated**: `practice?: uuid`, `limit?: 1-500 = 100`, `before?: timestamptz` |
| `POST /v1/platform/roles` | `platform_role_grant` | `204` | Body: `email` required valid, `role` in `platform_admin`\|`marketing_operator`; `user_not_found` → `409` |
| `PUT /v1/platform/practices/:id/status` | `platform_practice_status_set` | `204` | Body: `status` in `pending`\|`active`\|`suspended`, `reason?` ≤500 chars. Evicts public directory caches |
| `PUT /v1/platform/practitioners/:id/verification` | `platform_verification_set` | `204` | Body: `status` in `unverified`\|`pending`\|`verified`\|`rejected`, `note?` ≤500 chars. Evicts `profile` and `listing` cache tags |

---

## 3. Binary Upload & Download

### 3.1 `POST /v1/growth/requests/:id/assets`

1. Register a `@fastify/multipart` route-level body-size limit of **6 MiB** (framing overhead above the 5 MiB the procedure enforces) — do **not** raise the global Fastify body-size ceiling (kept at 64 KiB for every other JSON route per Phase 1) for the whole app; scope the increase to this one route only.
2. Accept `file` (multipart) and `kind` (`brief_asset`|`deliverable`).
3. Stream into a `Buffer` capped at **5,242,881 bytes** — one byte past the limit, so an oversized stream trips the size guard without buffering an unbounded amount of memory first.
4. **Compute `size_bytes` from the materialised buffer's own length, never from a client-supplied field or the multipart `Content-Length` header.** This is the same guard the .NET side had to add after discovering the original draft trusted a caller-supplied size — understating it would bypass the database's `octet_length(p_content) <= 5_242_880` check entirely. Both layers should agree in the happy path, but only the server-computed length is evidence; keep the regression test in §5 that posts a 6 MiB body with a falsified `Content-Length: 1` and asserts `413 asset_too_large`.
5. `growth_asset_add` itself enforces that a `practice_owner` may only upload `kind: 'brief_asset'` and a `marketing_operator` only `kind: 'deliverable'` — returning `403 forbidden` otherwise. This layer does not duplicate that check.

### 3.2 `GET /v1/growth/assets/:id/content`

`growth_asset_download(p_asset uuid)` returns `table (file_name text, mime text, content bytea)`. The handler sets headers to prevent stored XSS on the API's own origin:

```ts
@Get('assets/:id/content')
async downloadAsset(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
  const asset = await this.growth.assetDownload(id); // throws not_found (404) / forbidden (403) per _require_request_access
  const safeMime = ALLOWED_ASSET_MIMES.has(asset.mime) ? asset.mime : 'application/octet-stream';
  res.header('x-content-type-options', 'nosniff');
  res.header('cache-control', 'no-store');
  res.header('content-disposition', `attachment; filename="${sanitizeFilename(asset.fileName)}"`); // never "inline"
  res.type(safeMime);
  return asset.content;
}
```

Never set `Content-Disposition: inline`. `sanitizeFilename` strips path separators and control characters — the filename is user-supplied at upload time.

---

## 4. Observability, Alerts & Dynamic CORS

### 4.1 Structured request logging

One structured log line per request on completion, **excluding** `/v1/queue/tokens/:token` entirely (not just redacted — never logged at all, per Phase 2 §2.2):

```ts
logger.info({
  method: req.method,
  route: routeTemplate,          // the matched route pattern, e.g. "/v1/practices/:p/clients" — NEVER req.url or the query string
  procedure: caller.lastProcedure,
  status: res.statusCode,
  duration_ms: elapsedMs,
  brand: brand?.slug ?? 'unresolved',
  role: caller?.dbRole ?? 'none',
  user_hash: hmacSha256Truncated(caller?.userId, config.userHashSalt), // 16 hex chars, never the raw user id
  request_id: req.id,
  code: req.errorCode,
}, 'request');
```

### 4.2 Tracing & error capture

- OpenTelemetry: one server span per HTTP request (`http.route = routeTemplate`), one child span per `ProcedureGateway` call (`db.system: "postgresql"`, `db.operation: proc.name`, `babyblue.brand: caller.brand.slug`).
- Sentry (or equivalent) captures unhandled exceptions (status `500`) only, `sendDefaultPii: false`, with a `beforeSend` hook scrubbing request bodies, cookies, headers, and query strings.

### 4.3 The six production alerts (provision and fire-test in staging — same six, unchanged)

1. SQLSTATE `42501` rate > 1% of authenticated requests over 5 min (RLS regression or missing EXECUTE grant).
2. `57014` (`statement_timeout`) > 0 sustained over 2 min (query-shape regression).
3. `53300` (`too_many_connections`) > 0 (`DB_POOL_MAX × instances` exceeding `bb_api`'s connection limit — see Phase 0 §2.3).
4. `brand_unresolved` > 10/min for a single host (DNS misconfiguration or host probing).
5. Per-route p99 latency > 2× the 7-day rolling baseline.
6. `too_many_holds` (`54000` / `slotHold` 429) burst > 20/5min (diary DoS attempt).

### 4.4 Dynamic brand CORS

A background task refreshes verified domains from `public.tenant_brand_domains` every 60 minutes (plus on-demand refresh on cache miss). The CORS origin-matching function allows exact `https://<domain>` origins from that verified set, plus a configured preview-deployment regex in non-production only. **Never `origin: '*'` / allow-any-origin.**

---

## 5. Final Verification, Load Test & Definition of Done

### 5.1 Three-way error-code parity test

Extract and compare three sets, asserting they are **identical**:
1. Every key in `CODES`/`TRANSPORT_CODES` (`pg-error.mapper.ts`, Phase 1 §2.5).
2. Every key in `MESSAGES` parsed from the frontend's `src/lib/api/messages.ts` (post-restructure path — whichever shared package it lands in under the pnpm workspace).
3. From `supabase/migrations/*.sql`, the **union** of: every `raise exception '<code>'` literal (including `metric_unknown`, matched up to the first `:`); every `raise exception` **inside a trigger function** (`too_many_holds` lives in `slot_holds_quota()` — a procedures-only scan misses triggers entirely); every named `check` constraint referenced by the mapper's constraint-name step (`profiles_phone_international` is never `raise`d, so a raise-only scan reports it as mapper/frontend-only and fails the test for the wrong reason).

Expected size: **28 raised codes + 1 constraint name = 29 entries.** Keep this test in CI permanently — it is the only thing that catches a code added in one layer and forgotten in the other two.

### 5.2 640-practitioner cold-cache load test

Seed 640 listed practitioners across specialities/cities with availability and appointments. Run concurrent cold-cache load against `GET /v1/directory/practitioners?speciality=physiotherapy&city=johannesburg` and `POST /v1/me/holds`:
- `GET /v1/directory/practitioners` p99 < 250ms; `POST /v1/me/holds` p99 < 150ms.
- Pool active-connection count never exceeds `DB_POOL_MAX`; zero `53300` errors.

### 5.3 Definition of Done

- [ ] `grep -rE "select |insert |update |delete " client-web/src admin-dashboard/src` (post-restructure paths) returns zero matches.
- [ ] All 106 procedures have a generated wrapper, a route under `/v1`, an OpenAPI entry (non-prod), and at least two tests (happy path + authorization denial).
- [ ] The `DB_POOL_MAX=1` cross-brand/cross-user pool-isolation test (Phase 1 §3.1) passes in CI.
- [ ] The 3-way error-code parity test (§5.1) passes in CI.
- [ ] No function in the brand schema is executable by `PUBLIC` (asserted by `contract-gen` and by a database integration test).
- [ ] No Supabase `service_role` key exists anywhere in this API's configuration or environment (`/api/leads` stays in the Next.js app it already lives in — it needs the service-role key for a reason specific to that route, and that reason does not change by rebuilding this API).
- [ ] `bb_api` verified at startup and in CI as `noinherit`, `nobypassrls`, owning zero tables, holding zero direct table privileges (Phase 0 §2.7).
- [ ] Every authenticated response across all 106 routes carries `Cache-Control: no-store`.
- [ ] Binary downloads carry `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`; a practice owner uploading `kind: 'deliverable'` → `403 forbidden`.
- [ ] A brand with `features.growth = false` → `404` (never `403`) on all 16 `/v1/growth/*` routes.
- [ ] The 6 production alerts (§4.3) are configured and fire-tested in staging.
- [ ] `bb_api`'s connection limit still satisfies `(instances × DB_POOL_MAX) + reserve`; the `53300` alert fire-tested by temporarily lowering it.
- [ ] Every route table in Phases 2–5 matches its procedure's real signature, verified by `contract-gen`'s output compiling without hand-editing — no DTO accepts a field with no matching procedure parameter.
- [ ] Error responses on cross-origin requests carry both CORS and security headers (Phase 1 §2.4 ordering test).
- [ ] This plan's README §2 cutover decision is recorded as made (not left open) before proceeding to §6.

---

## 6. Cutover Execution

Execute per the strategy chosen in `README.md` §2:

**If (a) big-bang:** deploy the complete NestJS API to its own target, run §5.1–§5.3 against it in full, flip the reverse-proxy/DNS target from `api_dotnet` to the NestJS service in a single change, monitor the 6 alerts (§4.3) through the first real traffic window, then retire `api_dotnet/` (delete the directory, remove its CI jobs and deployment target) once the NestJS API has run clean in production for an agreed soak period — do not delete it same-day as the flip.

**If (b) incremental strangler:** confirm the reverse-proxy routing rules match the module boundaries this plan shipped in (Public/Queue first per Phase 2, then Patient/Practice/Growth-Platform as each phase's own exit gate passed), verify no route is served by both APIs simultaneously (a route must belong to exactly one backend at any time, or the output-cache and rate-limit partition keys in Phase 2/3 double-count), and only retire `api_dotnet/` once every route group has been switched and soaked.

Either way: `api_dotnet/` is not deleted as part of merging this plan's code — it is deleted as a separate, explicit step after production has proven the replacement, per whichever soak criterion is agreed when this phase starts.
