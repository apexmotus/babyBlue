# Phase 2: Public Directory & Anonymous Queue Endpoints, Caching & RSC Cutover

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §8 (Public), §12–§13, §16, §20–§22 (Step 4.1)
**Depends on:** [`PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md`](PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md)
**Next Phase:** [`PHASE_3_PATIENT_AND_BOOKING_FLOW.md`](PHASE_3_PATIENT_AND_BOOKING_FLOW.md)

---

## 1. Objective

Implement all **10 Public (`anon` + `authenticated`) endpoints** across `PublicDirectoryController` (6 routes) and `PublicQueueController` (4 routes), configure brand-isolated `OutputCache` policies with strict `Authenticated` bypass, wire the IP-keyed rate limiters (`DirectorySearch`, `QueueJoin`, `PublicPerIp`), exclude bearer queue tokens from access logs, and cut the Next.js public listing pages over to Server Components backed by `src/lib/api/public.ts`.

---

## 2. Endpoint & Policy Specification (10 Routes)

### 2.1 `PublicDirectoryController` (`Controllers/PublicDirectoryController.cs` — 6 Routes)

Class attributes: `[ApiController]`, `[Route("v1/directory")]`, `[AllowAnonymous]`, `[EnableRateLimiting(Policies.PublicPerIp)]`.

| Verb & Route | Procedure | Return Shape | Rate Limit Policy | OutputCache Policy | Query / Path Validation |
|---|---|---|---|---|---|
| `GET /v1/directory/practitioners` | `public_practitioner_search` | `IReadOnlyList<PublicPractitionerSearchRow>` (`200`) | `Policies.DirectorySearch` (60/min/brand+IP) | `CachePolicies.Listing` (60s SWR, vary by brand Host + query) | `[StringLength(120)] string? q`, `[StringLength(64)] string? speciality`, `[StringLength(64)] string? city`, `bool verified_only = false`, `[Range(1, 50)] int limit = 40`, `[Range(0, 10_000)] int offset = 0` |
| `GET /v1/directory/practitioners/{id:guid}` | `public_practitioner_get` | `PublicPractitionerRow` (`200` / `404`) | `Policies.PublicPerIp` (300/min/brand+IP) | `CachePolicies.Profile` (5 min, vary by brand Host + `id`) | `Guid id` |
| `GET /v1/directory/practitioners/{id:guid}/services` | `public_practitioner_services` | `IReadOnlyList<PublicPractitionerServiceRow>` (`200`) | `Policies.PublicPerIp` | `CachePolicies.Profile` (5 min, vary by brand Host + `id`) | `Guid id` |
| `GET /v1/directory/practitioners/{id:guid}/slots` | `public_slots_list` | `IReadOnlyList<PublicSlotRow>` (`200`) | `Policies.PublicPerIp` | **Never (`NoCache`)** (`ResponseCache(NoStore = true)`) | `Guid id`, `[Required] Guid service`, `[Required] DateOnly from`, `[Required] DateOnly to` (controller validates `to >= from` and `to.DayNumber - from.DayNumber <= 31` → `400 invalid_range`) |
| `GET /v1/directory/cities` | `public_city_list` | `IReadOnlyList<PublicCityRow>` (`200`) | `Policies.PublicPerIp` | `CachePolicies.Facets` (1 h, vary by brand Host) | None |
| `GET /v1/directory/specialities` | `public_speciality_list` | `IReadOnlyList<PublicSpecialityRow>` (`200`) | `Policies.PublicPerIp` | `CachePolicies.Facets` (1 h, vary by brand Host) | `[StringLength(64)] string? city` |

#### Brand Feature-Flag Check (`API_LAYER_SPEC.md` §14, `MULTITENANCY_PLAN.md` §8)
- If a brand has `features.directory == false`, directory browse endpoints (`practitioners`, `cities`, `specialities`) return `404 Not Found` (`code: "not_found"`). Single practitioner profile/services/slots remain reachable if `features.booking == true`.

---

### 2.2 `PublicQueueController` (`Controllers/PublicQueueController.cs` — 4 Routes)

Class attributes: `[ApiController]`, `[Route("v1/queue")]`, `[AllowAnonymous]`, `[EnableRateLimiting(Policies.PublicPerIp)]`.
If `features.flow == false` on the resolved brand, an action filter (`[RequireBrandFeature("flow")]`) returns `404`.

| Verb & Route | Procedure | Return Shape | Rate Limit Policy | OutputCache Policy | Request / Path Validation |
|---|---|---|---|---|---|
| `GET /v1/queue/{slug}` | `public_queue_info` | `PublicQueueInfoRow` = `(practice_name, address, city, waiting_count, accepting)` (`200` / `404`) | `Policies.PublicPerIp` | `CachePolicies.QueueInfo` (10s, vary by brand Host + `slug`) | `[RegularExpression(@"^[a-z0-9-]{2,64}$")] string slug` |
| `POST /v1/queue/{slug}/join` | `public_queue_join` | **Scalar `text`** token, wrapped as `{ "token": "<public_token>" }` (`201 Created`) | `Policies.QueueJoin` (3/h/brand+IP) | **Never** | Body `JoinQueueRequest`: `[Required, StringLength(120, MinimumLength = 1)] string FullName`, `[RegularExpression(@"^\+[1-9][0-9]{7,14}$")] string? Phone`, `[AllowedValues("routine", "urgent")] string Urgency = "routine"` |
| `GET /v1/queue/tokens/{token}` | `public_queue_status` | `PublicQueueStatusRow` = `(status, queue_position, practice_name)` (`200` / `404`) | `Policies.PublicPerIp` | **Never (`NoCache`)** | `[RegularExpression(@"^[A-Za-z0-9_-]{16,64}$")] string token` |
| `DELETE /v1/queue/tokens/{token}` | `public_queue_leave` | `void` (`204 No Content`) | `Policies.PublicPerIp` | **Never** | `[RegularExpression(@"^[A-Za-z0-9_-]{16,64}$")] string token` |

#### Queue Token Security & Access Log Redaction (`API_LAYER_SPEC.md` §8, §16, D-07)
- `token` is a 96-bit bearer credential (`public_token`).
- Decorate `GET /v1/queue/tokens/{token}` and `DELETE /v1/queue/tokens/{token}` with `[RedactAccessLog]` (or match route template `/v1/queue/tokens/{token}` in the Serilog request logging middleware) so neither the resolved path nor the token value is ever written to logs or OpenTelemetry span attributes.
- Ensure `public_queue_status` returns **only** `status`, `queue_position` and `practice_name` — never the patient's name, phone, or urgency (D-07). **Assert those three column names exactly** (Finding **F-12**): the procedure's column is `queue_position`, not `position`, and there is no `estimated_wait_min` column — an earlier draft of this plan named both, which would have made the D-07 assertion fail against a correct procedure. If a wait estimate is wanted, it is a change to `public_queue_status` in [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md), not a field the controller can synthesise.

---

## 3. Caching & Rate-Limiting Implementation

### 3.1 `PublicReadCache.cs` (`BabyBlue.Api/Caching/PublicReadCache.cs`)

Configure `AddOutputCache` (`API_LAYER_SPEC.md` §13):
1. **Default base policy:** `b.NoCache()`.
2. **Mandatory authentication exclusion predicate on every policy:**
   ```csharp
   static bool IsCacheableAnonymousRead(OutputCacheContext c) =>
       HttpMethods.IsGet(c.HttpContext.Request.Method) &&
       !c.HttpContext.Request.Headers.ContainsKey("Authorization") &&
       c.HttpContext.User.Identity?.IsAuthenticated != true;
   ```
   Checking **both** `!Request.Headers.ContainsKey("Authorization")` and `IsAuthenticated != true` guarantees that no request carrying a bearer token can ever read from or populate the anonymous output cache, nor receive a cacheable `Cache-Control` header.
3. **Brand key isolation:** Every policy calls `.SetVaryByHost(true)` and `.VaryByValue(ctx => ctx.Items[BrandKeys.Resolved] is ResolvedBrand b ? b.Slug : "none")`.
4. **Tag eviction support:**
   - Tag `CachePolicies.Facets` with `"brand:{slug}:facets"`.
   - Tag `CachePolicies.Profile` with `"brand:{slug}:practitioner:{id}"`.
   - Expose `IPublicReadCacheInvalidator` so Phase 4/5 writes (practitioner update, service update, verification change) evict the corresponding tag in-process.

### 3.2 Public Rate Limiters (`BabyBlue.Api/RateLimiting/BabyBlueRateLimiterPolicies.cs`)

Implement the anonymous IP-keyed policies from `API_LAYER_SPEC.md` §12:
- `ClientIpOf(ctx)` reads `ctx.Connection.RemoteIpAddress` after `UseForwardedHeaders` (configured with explicit `KnownProxies` / `KnownNetworks` so an untrusted `X-Forwarded-For` header cannot spoof the client IP, per §19).
- Partition key is always `${brandSlug}:ip:${clientIp}` so traffic on one brand cannot exhaust another brand's rate limit.
- `Policies.DirectorySearch`: Fixed window, `60` permits / `1 minute`, `QueueLimit = 0`.
- `Policies.QueueJoin`: Fixed window, `3` permits / `1 hour`, `QueueLimit = 0`.
- `Policies.PublicPerIp`: Token bucket / fixed window, `300` permits / `1 minute`, `QueueLimit = 0`.

---

## 4. Next.js Client & Server Component Migration

1. **Create [`src/lib/api/public.ts`](../../src/lib/api/public.ts):**
   - Typed functions matching `STORED_PROCEDURES.md` §20 (`searchPractitioners`, `getPractitioner`, `listPractitionerServices`, `listSlots`, `listCities`, `listSpecialities`, `getQueueInfo`, `joinQueue`, `getQueueStatus`, `leaveQueue`).
2. **Swap D-17's client-side directory reads to Server Components (`API_LAYER_SPEC.md` §21, `IMPROVEMENT_PLAN.md` §6):**
   - Update [`src/lib/directory-facets.ts`](../../src/lib/directory-facets.ts) and [`src/components/front/ListingResults.tsx`](../../src/components/front/ListingResults.tsx) (plus `src/app/(site)/[speciality]/page.tsx`, `src/app/(site)/[speciality]/[city]/page.tsx`, `src/app/(site)/in/[city]/page.tsx`) to fetch via `src/lib/api/public.ts` when `NEXT_PUBLIC_API_BASE_URL` is configured, while keeping the browser PGlite fallback only for the standalone offline demo mode if needed during transition.
   - Update public queue screens (`src/app/q/[slug]/*`) to call `src/lib/api/public.ts` instead of inline SQL.

---

## 5. Verification & Exit Gate (`Step 4.1`)

1. **10-Endpoint Happy + Denial Integration Suite (`BabyBlue.Integration.Tests`):**
   - Every one of the 10 public endpoints returns `2xx` for both anonymous callers (`DbRole.Anonymous`) and authenticated callers (`DbRole.Authenticated`).
   - `GET /v1/directory/practitioners/{unknownId}` and `GET /v1/queue/tokens/{unknownToken}` return `404` with `code: "not_found"`.
   - `POST /v1/queue/{slug}/join` on a closed queue returns `409` with `code: "queue_closed"`.
2. **Zero-PII Schema Assertion on Public Endpoints (`API_LAYER_SPEC.md` §8, §20):**
   - Parse the JSON response of all 10 public endpoints and assert that no JSON object at any nesting level contains keys `email`, `phone`, `full_name`, `first_name`, `last_name`, `admin_notes`, `registration_number`, `user_id`, or `client_id`.
   - `address` and `city` are **deliberately not** on that list: `public_practitioner_get` and `public_queue_info` both return a practice's street address, which is public business information and the point of a directory. Keep the list to person-level fields so the assertion stays meaningful rather than becoming something future contributors suppress.
3. **Authenticated Cache Bypass Assertion (`API_LAYER_SPEC.md` §13, §20):**
   - Issue `GET /v1/directory/practitioners` and `GET /v1/directory/cities` **with** an `Authorization: Bearer <validToken>` header → assert response has `Cache-Control: no-store` and does **not** serve or populate the `OutputCache`.
   - Issue the same `GET` **without** `Authorization` twice → second call is served from `OutputCache`.
   - Issue the same `GET` with `Host: book.smilegroup.co.za` → does not receive `babyblue.co.za`'s cached response.
4. **Slots & Queue Token Never Cached:**
   - Assert `GET /v1/directory/practitioners/{id}/slots` and `GET /v1/queue/tokens/{token}` always return `Cache-Control: no-store` even for anonymous callers.
5. **Rate Limit Enforcement:**
   - 4th `POST /v1/queue/{slug}/join` from the same IP within an hour returns `429` with `Retry-After` header and `code: "rate_limited"`.
   - 61st `GET /v1/directory/practitioners` from the same IP within a minute returns `429`.
6. **Queue Token Log Redaction Test:**
   - Capture structured log events during `GET /v1/queue/tokens/secret-token-123456` and assert the string `"secret-token-123456"` does not appear in any log message or property.
