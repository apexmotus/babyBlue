# Phase 2: Public Directory & Anonymous Queue Endpoints, Output Caching

**Spec reference:** `nestjs-api-implementation-spec.md` §4.2–4.4 (Manager/Repository/Mapper layering), §7.6 (pagination — adapted), §8.6 (caching, adapted to brand-isolated keys)
**Blueprint reference:** `api_dotnet` `Controllers/{PublicDirectoryController,PublicQueueController}.cs`, `Caching/PublicReadCache.cs`, `RateLimiting/BabyBlueRateLimiterPolicies.cs`, `Filters/{RequireBrandFeatureAttribute,RedactAccessLogAttribute}.cs`; `docs/plans/api/PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`
**Depends on:** [`PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md`](PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md)
**Next phase:** [`PHASE_3_PATIENT_AND_BOOKING_FLOW.md`](PHASE_3_PATIENT_AND_BOOKING_FLOW.md) (parallel with Phase 4)

---

## 1. Objective

Implement all **10 public (`anon` + `authenticated`) endpoints** — `PublicDirectoryController` equivalent (6 routes) and `PublicQueueController` equivalent (4 routes) — configure brand-isolated HTTP caching with strict authenticated-bypass, wire IP-keyed rate limits, and redact queue bearer tokens from every log line.

---

## 2. Endpoint & Policy Specification (10 Routes)

### 2.1 `directory.controller.ts` (`/v1/directory`, `@Public()` on every route, default policy `publicPerIp`)

| Verb & route | Procedure | Return shape | Rate limit | Cache policy | Validation |
|---|---|---|---|---|---|
| `GET /v1/directory/practitioners` | `public_practitioner_search` | `PublicPractitionerSearchRow[]` (`200`) | `directorySearch` (60/min/brand+IP) | `listing` (60s SWR, vary brand+Host+query) | `q?` ≤120 chars, `speciality?`/`city?` ≤64 chars, `verified_only?: boolean = false`, `limit?: 1-50 = 40`, `offset?: 0-10000 = 0` |
| `GET /v1/directory/practitioners/:id` | `public_practitioner_get` | `PublicPractitionerRow` (`200`/`404`) | `publicPerIp` (300/min/brand+IP) | `profile` (5min, vary brand+Host+id) | `id: uuid` |
| `GET /v1/directory/practitioners/:id/services` | `public_practitioner_services` | `PublicPractitionerServiceRow[]` (`200`) | `publicPerIp` | `profile` | `id: uuid` |
| `GET /v1/directory/practitioners/:id/slots` | `public_slots_list` | `PublicSlotRow[]` (`200`) | `publicPerIp` | **never** (`Cache-Control: no-store`) | `id: uuid`, `service: uuid` required, `from`/`to: date` required; controller validates `to >= from` and `(to - from) <= 31 days` → `400 invalid_range` |
| `GET /v1/directory/cities` | `public_city_list` | `PublicCityRow[]` (`200`) | `publicPerIp` | `facets` (1h, vary brand+Host) | none |
| `GET /v1/directory/specialities` | `public_speciality_list` | `PublicSpecialityRow[]` (`200`) | `publicPerIp` | `facets` | `city?` ≤64 chars |

**Brand feature-flag check:** if `isFeatureEnabled(brand, 'directory', true) === false`, the browse routes (`practitioners`, `cities`, `specialities`) return `404` (`code: "not_found"`); the single-profile/services/slots routes remain reachable while `features.booking === true`. Implement as a Nest guard (`DirectoryFeatureGuard`) applied to exactly those three routes, not the controller as a whole.

### 2.2 `queue.controller.ts` (`/v1/queue`, `@Public()`, default policy `publicPerIp`, class-level `@RequireBrandFeature('flow')` guard returning `404` when `features.flow === false`)

| Verb & route | Procedure | Return shape | Rate limit | Cache policy | Validation |
|---|---|---|---|---|---|
| `GET /v1/queue/:slug` | `public_queue_info` | `{ practice_name, address, city, waiting_count, accepting }` (`200`/`404`) | `publicPerIp` | `queueInfo` (10s, vary brand+Host+slug) | `slug` matches `^[a-z0-9-]{2,64}$` |
| `POST /v1/queue/:slug/join` | `public_queue_join` | scalar `text` token → `{ "token": "<public_token>" }` (`201`) | `queueJoin` (3/hr/brand+IP) | never | body: `full_name` required ≤120 chars min 1, `phone?` matches `^\+[1-9][0-9]{7,14}$`, `urgency: 'routine'|'urgent' = 'routine'` |
| `GET /v1/queue/tokens/:token` | `public_queue_status` | `{ status, queue_position, practice_name }` (`200`/`404`) | `publicPerIp` | **never** (`no-store`) | `token` matches `^[A-Za-z0-9_-]{16,64}$` |
| `DELETE /v1/queue/tokens/:token` | `public_queue_leave` | `void` (`204`) | `publicPerIp` | never | same token pattern |

**Queue token security (D-07):** decorate both `:token` routes with a `@RedactAccessLog()` metadata marker that the request-logging interceptor checks before writing its structured log line, so neither the resolved path nor the token value is ever logged — never rely on route-template matching alone in the logger, since a future route change could silently stop matching. **Assert the exact three response columns** (`status`, `queue_position`, `practice_name` — not `position`, no `estimated_wait_min`): a wait estimate is a change to `public_queue_status` itself, not something the controller may synthesise.

---

## 3. Caching & Rate-Limiting Implementation

### 3.1 Output cache (`caching/public-read-cache.ts`)

No first-class Fastify output-cache equivalent to ASP.NET's `AddOutputCache` ships out of the box; implement a small Nest interceptor + in-memory (or Redis, if horizontal scale requires shared cache) store with the same contract as `PublicReadCache`:

```ts
@Injectable()
export class PublicReadCacheInterceptor implements NestInterceptor {
  constructor(private readonly store: CacheStore, private readonly policy: CachePolicy) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<FastifyRequest['raw']>();
    if (!isCacheableAnonymousRead(req)) return next.handle(); // never read/write cache for an authenticated or bearer-bearing request
    const key = this.policy.keyFor(req); // vary by Host + resolved brand slug + (policy-specific: query, :id, :slug)
    const hit = this.store.get(key);
    if (hit) return of(hit);
    return next.handle().pipe(tap((body) => this.store.set(key, body, this.policy.ttlMs, this.policy.tags(req))));
  }
}

function isCacheableAnonymousRead(req: FastifyRequest['raw']): boolean {
  return req.method === 'GET' && !req.headers.authorization && !(req as any).user;
}
```

**Mandatory invariant, checked both ways** (mirrors the .NET predicate exactly): no request carrying a bearer token may ever read from or populate the anonymous cache, regardless of whether the token turned out to be valid. Every cache key includes the resolved brand slug **and** the request `Host`, never just one — this is the brand-isolation property Phase 1's pool-isolation gate proves at the DB layer; the cache layer needs its own equivalent proof (exit gate §5.3 below).

**Tag-based eviction:** `facets` tagged `brand:{slug}:facets`; `profile` tagged `brand:{slug}:practitioner:{id}`. Expose `invalidateTag(tag: string)` for Phase 4 (`practice_practitioner_update` evicts `profile` + `facets`) and Phase 5 (`platform_verification_set`, `platform_practice_status_set`) to call.

### 3.2 Rate limiters (`rate-limiting/policies.ts`)

Built on `@nestjs/throttler` with a custom partition-key storage, same partitioning rule as `BabyBlueRateLimiterPolicies` (`${brandSlug}:ip:${clientIp}` — never a bare IP):

| Policy | Limit | Window | Queue |
|---|---|---|---|
| `directorySearch` | 60 | 1 min | 0 (reject, don't queue) |
| `queueJoin` | 3 | 1 hour | 0 |
| `publicPerIp` | 300 | 1 min | 0 |

`clientIp` resolved from `request.ip` only after Fastify's `trustProxy` is configured with an explicit allowlist (Phase 1 §2.4 step 8) — an untrusted `X-Forwarded-For` must never be able to spoof the partition key.

---

## 4. Frontend Client Layer

1. `client-web`'s existing `src/lib/api/public.ts` (post-restructure path) already implements typed functions for all 10 endpoints against the .NET API's identical contract — **no changes needed to the client itself** if Phase 1 §2.6's response-shape decision is honored exactly. This phase's job is to make the NestJS server match that existing client, not the other way around.
2. If the cutover strategy (README §2) chosen is (b) incremental strangler, this is the first module to route through the reverse proxy to the new service, since it has no auth/session coupling and the smallest blast radius if something's wrong.

---

## 5. Verification & Exit Gate

1. **10-endpoint happy + denial suite:** every route returns `2xx` for both anonymous and authenticated callers. `GET /v1/directory/practitioners/:unknownId` and `GET /v1/queue/tokens/:unknownToken` → `404` (`code: "not_found"`). `POST /v1/queue/:slug/join` on a closed queue → `409` (`code: "queue_closed"`).
2. **Zero-PII schema assertion:** parse every response body from all 10 endpoints; assert no key at any nesting depth is `email`, `phone`, `full_name`, `first_name`, `last_name`, `admin_notes`, `registration_number`, `user_id`, or `client_id`. (`address`/`city` are deliberately **not** on this list — they're public business information, not person-level fields.)
3. **Authenticated cache-bypass assertion:** `GET /v1/directory/practitioners` and `/cities` **with** a valid `Authorization` header → `Cache-Control: no-store`, never served from or written to cache. Same routes **without** auth, called twice → second call served from cache. Same route with `Host: book.smilegroup.co.za` → never receives `babyblue.co.za`'s cached body (brand-isolation proof for the cache layer, matching Phase 1's DB-layer proof).
4. **Never-cached routes:** `/practitioners/:id/slots` and `/queue/tokens/:token` always return `no-store`, even anonymously.
5. **Rate-limit enforcement:** 4th `POST /v1/queue/:slug/join` from one IP within an hour → `429` with `Retry-After` and `code: "rate_limited"`. 61st `GET /v1/directory/practitioners` within a minute → `429`.
6. **Queue-token redaction test:** capture log output during `GET /v1/queue/tokens/secret-token-123456`; assert the literal string never appears in any log line or structured field.
