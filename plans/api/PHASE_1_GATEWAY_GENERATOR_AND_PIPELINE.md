# Phase 1: Procedure Gateway, Code Generator, Middleware Pipeline & Pool-Isolation Gate

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §5–§7, §10–§11, §14, §19–§22 (Step 4.0b)
**Depends on:** [`PHASE_0_PREREQUISITES_AND_FOUNDATION.md`](PHASE_0_PREREQUISITES_AND_FOUNDATION.md)
**Next Phase:** [`PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`](PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md)

---

## 1. Objective

Build the core execution engine of `BabyBlue.Api`:
1. **`ProcedureGateway`** (`API_LAYER_SPEC.md` §5): Executes allowlisted PostgreSQL functions inside a single transaction with `SessionContext.ApplyAsync`, supporting table-list, single-row, scalar, and void return shapes, plus bounded retries on `stable` reads.
2. **`BabyBlue.ContractGen`** (`API_LAYER_SPEC.md` §6): Reads `pg_proc` from a freshly migrated database, enforces the two build-time security assertions, and generates `Procedures.g.cs` and `Contracts.g.cs` for all 106 procedures.
3. **The Request Middleware Pipeline** (`API_LAYER_SPEC.md` §7, §10, §11, §14, §19): Wired in the exact load-bearing order (`CorrelationId` → `ExceptionHandler` → `SecurityHeaders` → `Cors` → `BrandResolution` → `Authentication` → `CallerContext` → `RateLimiter` → `OutputCache` → `Controllers`).
4. **Two End-to-End Vertical Slices & Pool-Isolation Gate** (`API_LAYER_SPEC.md` §20, §22 Step 4.0): `GET /v1/directory/cities` (anonymous) and `GET /v1/practices` (authenticated), plus the single-connection (`MaxPoolSize = 1`) cross-brand/cross-user pool-isolation integration test.

---

## 2. Step-by-Step Implementation Tasks

### 2.1 `ProcedureGateway` (`BabyBlue.Data/ProcedureGateway.cs`)

Address `API_LAYER_SPEC.md` §5 and Findings **F-02** (single-row `404` support) and **F-05** (recording the procedure name for error/request logging):

```csharp
// api/src/BabyBlue.Data/ProcedureName.cs
public enum Volatility { Stable, Volatile }

[Flags]
public enum GrantedTo { None = 0, Anon = 1, Authenticated = 2 }

public enum ReturnShape { TableList, TableSingle, Scalar, Void }

public sealed record ProcedureName(
    string Name,
    string SqlCall,        // e.g. "practice_clients_list(p_practice => @Practice, p_q => @Q, ...)"
    Volatility Volatility,
    GrantedTo GrantedTo,
    ReturnShape Shape);
```

Implement `ProcedureGateway` with four strongly-typed entry points:

| Method | SQL emitted | Dapper call | Empty behaviour |
|---|---|---|---|
| `QueryAsync<TRow>(proc, args, ct)` | `select * from <proc.SqlCall>` | `conn.QueryAsync<TRow>` | Returns `[]` (`200 OK`) |
| `QuerySingleAsync<TRow>(proc, args, ct)` | `select * from <proc.SqlCall>` | `conn.QuerySingleOrDefaultAsync<TRow>` | Throws `ProcedureNotFoundException` → mapped to `404` (`code: "not_found"`) |
| `ScalarAsync<T>(proc, args, ct)` | `select <proc.SqlCall>` | `conn.ExecuteScalarAsync<T>` | Returns `T` (or throws `not_found` if null on required resource) |
| `ExecuteAsync(proc, args, ct)` | `select <proc.SqlCall>` | `conn.ExecuteAsync` | Returns `Task` (`204 No Content`) |

#### Execution & Retry Rules (`API_LAYER_SPEC.md` §4, §5)
1. Retrieve `var caller = callerAccessor.Current` (throws `InvalidOperationException` if middleware was bypassed).
2. Set `callerAccessor.LastProcedure = proc.Name` (and `HttpContext.Items["procedure"] = proc.Name`) **before** opening the connection so `ProblemDetailsExceptionHandler` and request logging always know which procedure ran.
3. Open a connection from `NpgsqlDataSource`, begin an `NpgsqlTransaction`, call `await SessionContext.ApplyAsync(conn, tx, caller, ct)`, execute the Dapper `CommandDefinition`, and `await tx.CommitAsync(ct)`.
4. **Retries (`API_LAYER_SPEC.md` §4):** Only when `proc.Volatility == Volatility.Stable`, retry at most **twice** with jitter (25–75 ms) on:
   - Transient connection establishment failure (`NpgsqlException { IsTransient: true }` before query execution)
   - `PostgresException` with `SqlState is "40001" or "40P01"` (serialization failure / deadlock).
   Never retry `Volatility.Volatile` procedures.

---

### 2.2 `IBrandRegistry` (`BabyBlue.Data/BrandRegistry.cs`)

Implement the one exception permitted outside a brand schema (`API_LAYER_SPEC.md` §14):

1. `ResolveAsync(string host, CancellationToken ct)` normalises `host = host.Trim().ToLowerInvariant()`.
2. Checks `IMemoryCache` key `"brand:host:" + host`:
   - Positive hit: cached for **5 minutes**.
   - Negative hit (`null` sentinel): cached for **30 seconds** to prevent an unknown-host flood from exhausting the connection pool.
3. On cache miss:
   - Opens a connection and transaction from `NpgsqlDataSource`.
   - Executes:
     ```sql
     set local search_path = public;
     set local role anon;
     set local statement_timeout = '5s';
     select * from public.resolve_brand(p_host => @Host);
     ```
   - Commits and caches the `ResolvedBrand` (or negative sentinel).

---

### 2.3 Catalogue Code Generator (`tools/BabyBlue.ContractGen`)

Build `BabyBlue.ContractGen` (`API_LAYER_SPEC.md` §6) so running `dotnet run --project api/tools/BabyBlue.ContractGen -- --connection "..." --schema public` inspects `pg_proc` and writes:
- `api/src/BabyBlue.Data/Generated/Procedures.g.cs`
- `api/src/BabyBlue.Data/Generated/Contracts.g.cs`

#### Catalogue Query & Metadata Extraction
Query `pg_proc`, `pg_namespace`, `pg_type`, and `pg_attribute` (for `proallargtypes` / `proargmodes` `'t'` `RETURNS TABLE` columns):
- Filter `n.nspname = @schema` (`public` for Phases 0–5, per F-01 / D-31) and `p.proname not like '\_%'` (excludes `_require_member`, `_require_role`, `_require_request_access`, `_audit`, and `is_*` predicates).
- Also assert `is_member`, `has_practice_role`, `is_platform_admin`, `is_marketing_operator` are excluded from the generated endpoint surface.

#### Build-Failing Generator Assertions (`API_LAYER_SPEC.md` §6)
The generator must exit non-zero and fail the build if:
1. **Count / Surface Mismatch:** The count of non-helper procedures in the target schema does not equal **106** (or any procedure in the route manifest lacks a matching function there). Note the helper filter `proname not like '\_%'` does **not** exclude the four `is_*` / `has_*` predicates, since they carry no leading underscore — they are excluded by an explicit deny-list, asserted separately below.
2. **`PUBLIC` Execute Grant Present:** Any function in the target schema has `has_function_privilege('public', p.oid, 'execute') = true`.
3. **Missing Role Grant:** Any of the 106 procedures has neither `anon` nor `authenticated` `EXECUTE` privilege, or a non-`public_*` procedure is executable by `anon`.
4. **Prohibited Return Type:** Any procedure exposes `timerange` or an unmapped PostgreSQL type.

#### Single-Row vs Table-List Classification (Finding **F-02**)
Maintain a deterministic `SingleRowProcedures` set in `BabyBlue.ContractGen` for the `RETURNS TABLE` functions that represent a single resource:
- `public_practitioner_get`, `public_queue_info`, `public_queue_status`
- `patient_profile_get`, `patient_appointment_get`, `patient_hold_get`
- `practice_setup_progress`, `practice_client_get`, `practice_appointment_get`, `practice_settings_get`
- `growth_request_get`, `growth_asset_download`

> `growth_asset_download` only belongs in this set because [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) now declares it `returns table (file_name text, mime text, content bytea)` (Finding **F-03**). That redefinition is part of the **Stage 3 migration**, not Phase 5 — if it were deferred, the generator would classify a `returns bytea` function as single-row on its first run and emit a contract that cannot compile. Verify the applied migration before running the generator.

For these, generate `gw.QuerySingleAsync<TRow>(...)` returning `Task<TRow>` instead of `Task<IReadOnlyList<TRow>>`.

#### Type Mapping Table (`API_LAYER_SPEC.md` §6)
- `uuid` → `Guid` (`Guid?`)
- `text` / `varchar` / `public.practice_role` / `public.consent_purpose` / `public.platform_role` / `public.marketing_status` → `string` (`string?`)
- `int4` → `int`, `int2` → `short`, `int8` → `long`
- `bool` → `bool`
- `timestamptz` → `DateTimeOffset` (**never `DateTime`**)
- `date` → `DateOnly`
- `text[]` → `string[]`, `uuid[]` → `Guid[]`
- `numeric` → `decimal` (`decimal?`) — **required** (Finding **F-09**): `growth_reports_list` returns `metric_value numeric`, and without this entry generator assertion 4 ("unmapped type") fails the build on the first run against the real catalogue
- `jsonb` → `JsonElement`
- `bytea` → `byte[]`

---

### 2.4 Request Pipeline & Middleware (`BabyBlue.Api`)

Wire `Program.cs` in the exact order mandated by `API_LAYER_SPEC.md` §7:

1. **`CorrelationIdMiddleware` (`Middleware/CorrelationIdMiddleware.cs`):**
   - Reads incoming `X-Request-Id` header if valid ASCII `^[a-zA-Z0-9_-]{1,64}$`; otherwise generates a new `Guid.NewGuid().ToString("n")`.
   - Sets `ctx.TraceIdentifier = requestId` and writes `X-Request-Id` to `ctx.Response.Headers` via `OnStarting`.
2. **`ProblemDetailsExceptionHandler` (`Middleware/ProblemDetailsExceptionHandler.cs`, §10):**
   - **Resolution order is load-bearing (Finding F-11).** Resolve in exactly three steps and stop at the first hit:
     1. **`PostgresException.MessageText`** — match against the 28-code table. The procedures put the semantic code *in the message* (`raise exception 'queue_closed' using errcode = 'P0002'`), so this is the authoritative signal.
     2. **`PostgresException.ConstraintName`** — `no_double_booking` / `no_overlapping_holds` → `409 slot_unavailable`; `profiles_phone_international` → `400`. (`ConstraintName` is populated independently of `IncludeErrorDetail`, so disabling detail does not break this step.)
     3. **`SqlState`** — the terminal fallback below.

     Message-first is not a stylistic preference: **SQLSTATEs are not unique per code.** `P0002` serves `not_found` (`404`), `queue_closed` (`409`) *and* `user_not_found` (`409`); `23503` serves `service_in_use` (`409`), `last_practitioner` (`409`) and `metric_unknown` (`400`); `23P01` serves `slot_unavailable` and `overlapping_availability`. Resolving by SQLSTATE first would return the wrong status on seven endpoints and break the Phase 2 and Phase 4 exit gates.
   - Maps all 28 procedure error codes (`not_authenticated`, `forbidden`, `not_found`, `not_editable`, `slot_unavailable`, `hold_expired`, `too_late_to_cancel`, `not_cancellable`, `not_reschedulable`, `too_early_to_check_in`, `not_checkin_able`, `invalid_transition`, `user_not_found`, `sole_owner`, `has_records`, `registration_in_use`, `last_practitioner`, `service_in_use`, `overlapping_availability`, `queue_closed`, `consent_required`, `too_many_holds`, `invalid_registration`, `invalid_name`, `invalid_range`, `price_required`, `metric_unknown`, `asset_too_large`) plus the `profiles_phone_international` constraint name (`400`).
   - **SQLSTATE fallbacks**, used only when steps 1 and 2 miss: `22023` → **`400 invalid_input`** (**required**: eleven semantic codes raise `22023`, and without this entry an unrecognised message falls through to `500`), `23P01` → `409 slot_unavailable`, `23505`/`23503` → `409 conflict`, `42501` → `403 forbidden`, `28000` → `401 not_authenticated`, `P0002` → `404 not_found`, `23514` → `400 invalid_input`, `57014` → `504 statement_timeout`, `54000` → `429 too_many_holds`, `53300` → `503 too_many_connections`. Anything else → `500` with the code omitted.
   - `metric_unknown` is raised as `metric_unknown: <key>`, so match the code as a **prefix before `:`** and surface the key in `detail`. [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) was changed to put the key in the message precisely because this handler must never read `PostgresException.Detail`.
   - Never logs or serialises `PostgresException.Detail`, `.Hint`, `.Where`, or SQL text.
3. **`SecurityHeadersMiddleware` & `UseCors("brand-domains")` (§19):**

   > **Verify the error-response header path before locking this order in.** `UseExceptionHandler` sits *upstream* of `UseCors` and `SecurityHeadersMiddleware` in the §7 order, and .NET's `ExceptionHandlerMiddleware` clears the response (headers included) before re-dispatching to the handler. If that strips `Access-Control-Allow-Origin`, a browser receives a CORS failure instead of the `ProblemDetails` body the client needs to read `code` from — which would silently defeat §21's error contract for every 4xx and 5xx. Add an integration test that asserts a cross-origin request producing `409 slot_unavailable` carries **both** the CORS headers and the security headers, and if it fails, re-apply them inside `ProblemDetailsExceptionHandler` rather than reordering the pipeline (the §7 order is load-bearing for other reasons).


   - Emits `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: no-store` (unless overridden by `OutputCache` on anonymous public routes), and removes `Server` and `X-Powered-By`.
4. **`BrandResolutionMiddleware` (`Middleware/BrandResolutionMiddleware.cs`, §14 & Finding F-07):**
   - Runs **before** `UseAuthentication()`.
   - Resolves the effective brand host: uses `X-Tenant-Host` if present and syntactically valid, else `Origin` host if `Request.Host` is the shared API host, else `ctx.Request.Host.Host.ToLowerInvariant()`.
   - Calls `IBrandRegistry.ResolveAsync(host, ct)`:
     - `null` → logs `brand_unresolved` and returns `404 ProblemDetails` (`code: "brand_not_found"`), **never** falling back to the default brand.
     - `brand.Status is "suspended" or "archived"` → returns `403 ProblemDetails` (`code: "brand_unavailable"`).
     - Stores `brand` in `ctx.Items[BrandKeys.Resolved]`.
5. **JWT Authentication (`Auth/SupabaseJwtSetup.cs`, §11 & Finding F-06):**
   - Validates `Issuer = "{SupabaseUrl}/auth/v1"`, `Audience = "authenticated"`, `ClockSkew = 30s`, `MapInboundClaims = false`.
   - Supports JWKS discovery (default) or symmetric `Supabase:JwtSecret` in local/test environments.
   - `JwtBearerEvents.OnChallenge` writes `ProblemDetails` JSON with `status: 401` and `code: "token_expired"` (when `AuthenticateFailure is SecurityTokenExpiredException`) or `code: "not_authenticated"`.
6. **`CallerContextMiddleware` (`Middleware/CallerContextMiddleware.cs`, §3 detail 4):**
   - Constructs `CallerContext`:
     - `DbRole`: `ctx.User.Identity?.IsAuthenticated == true ? DbRole.Authenticated : DbRole.Anonymous` (**ignores** the JWT `role` claim completely so a `service_role` token still maps to `DbRole.Authenticated`).
     - `UserId`: parsed `Guid` from `sub` claim when authenticated (rejects with `401` if `IsAuthenticated` is true but `sub` is missing/non-UUID).
     - `ClaimsJson`: minimal JSON object containing `sub`, `role: "authenticated"`, `email`, and `exp`.
7. **`UseRateLimiter()` (§12) & `UseOutputCache()` (§13) & `MapControllers()`:**
   - JSON options configured with `JsonNamingPolicy.SnakeCaseLower` so all generated PascalCase C# properties serialise to exact snake_case columns matching `STORED_PROCEDURES.md` §20.

---

### 2.5 Two Vertical-Slice Endpoints (`Step 4.0`)

Implement the first two routes end-to-end:
1. **`GET /v1/directory/cities`** (`PublicDirectoryController.ListCities`):
   - `[AllowAnonymous]`, calls `PublicProcedures.CityListAsync(ct)` → `public_city_list()` resolved through the transaction's `search_path`.
2. **`GET /v1/practices`** (`PracticeContextController.ListMemberships`):
   - `[Authorize]`, calls `PracticeContextProcedures.MembershipsListAsync(ct)` → `practice_memberships_list()` resolved through the transaction's `search_path`.

### 2.6 Next.js HTTP Client Foundation (`src/lib/api/http.ts`)

Create [`src/lib/api/http.ts`](../../src/lib/api/http.ts) (`API_LAYER_SPEC.md` §21):
- Exports `ApiError` (carrying `code: string`, `status: number`, `requestId?: string`, and resolving `message` through `MESSAGES[code]` from [`src/lib/api/messages.ts`](../../src/lib/api/messages.ts)).

  > **Import from `src/lib/api/messages.ts`, never from [`src/local/db.ts`](../../src/local/db.ts)** (Finding **F-14**). `db.ts` is a `"use client"` module that imports `@electric-sql/pglite/worker`; importing `MESSAGES` from it would pull PGlite and a `Worker` into every Server Component that touches the API client. The contract now lives in a zero-dependency module and `db.ts` re-exports it, so the existing demo screens keep working unchanged. `friendlyError` prefers `ApiError.code` over substring matching and falls back longest-key-first, so a short code can never shadow a longer one that contains it.
- Exports `call<T>(path, init)` attaching `Authorization: Bearer <token>`, `X-Tenant-Host`, and `cache: "no-store"` by default (with opt-in Next.js `next: { revalidate }` for anonymous Server Component reads).

---

## 3. Verification & Hard Exit Gate (`Step 4.0`)

Per `API_LAYER_SPEC.md` §22: **Do not proceed to Phase 2 until all of the following pass:**

1. **The Single-Connection Pool-Isolation Test (`API_LAYER_SPEC.md` §20, #1 most important test):**

   This is the gate the whole posture rests on, and the §1 schema decision (F-01 / D-31) must not be allowed to weaken it. It leaks three things across a reused physical connection — `role`, `request.jwt.claim.sub`, and `search_path` — so test all three, which takes **two** fixtures rather than one.

   **(a) Cross-user and cross-role, on the real schema.** Configure `WebApplicationFactory` with `MaxPoolSize = 1`, so every request in the test provably shares one physical connection.
   - Seed `ownerA` / `practiceA` and `ownerB` / `practiceB` in `public`, both on host `babyblue.co.za`.
   - `GET /v1/practices` with `ownerA`'s JWT → `[practiceA]`.
   - Immediately `GET /v1/practices` with `ownerB`'s JWT → `[practiceB]` and **never** `practiceA`. This is the `request.jwt.claim.sub` leak.
   - Immediately `GET /v1/directory/cities` anonymously → runs as `anon`, not as `ownerB`. This is the `role` leak, and it is the case that `DISCARD ALL` alone would not catch if the preamble were ever moved outside the transaction.
   - Open the single connection directly from the pool afterwards and assert `current_user = 'bb_api'`, `current_setting('search_path') = ''`, and `current_setting('request.jwt.claim.sub', true) = ''`.

   **(b) Cross-brand, on a purpose-built second schema.** While the live brand's `schema_name` is `public` there is no second brand schema to cross, so the integration bootstrap creates a deliberately minimal one — this costs a few dozen lines and keeps the cross-brand assertion real instead of deferring it to `MULTITENANCY_PLAN.md` Phase 1.
   - In the §3.6 bootstrap, create schema `bb_testbrand` holding only what the two vertical slices touch: a `practices` table, a `practice_members` table, a `cities` view or table, and `public_city_list()` / `practice_memberships_list()` with the same RLS and the same `security definer` + `set search_path = bb_testbrand` shape as the real pair.
   - Register it in `public.tenant_brands` as slug `testbrand` on host `book.testbrand.co.za`, seeded with `ownerB` / `practiceB2`.
   - `GET /v1/practices` on `babyblue.co.za` with `ownerA`'s JWT → `[practiceA]`.
   - Immediately `GET /v1/practices` on `book.testbrand.co.za` with **`ownerA`'s** JWT, reusing the same pooled connection → `[]`. Zero rows, not an error: `ownerA` is a real authenticated user whose `auth.uid()` simply matches no membership in that schema, which is the §3 isolation claim stated as a test.
   - Assert the `search_path` observed inside the second request was `bb_testbrand` and not `public`, so a passing result cannot be a false negative caused by the schema never having changed.

   When [`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) Phase 1 lands and the live brand moves to `bb_babyblue`, fixture (b) is deleted and the real second brand takes its place. Fixture (a) is unchanged.
2. **Unknown Host `404` Test:** `GET /v1/practices` with a valid JWT and `Host: unknown.example.com` returns `404` without invoking any procedure.
3. **`service_role` Claim Downgrade Test:** A validly signed JWT containing `"role": "service_role"` and `"sub": "<consumer1>"` runs with `current_setting('role') = 'authenticated'`, never `service_role`.
4. **Statement Timeout (`57014` → `504`) Test:** Executing a test query with `pg_sleep` exceeding the role's budget returns `504 Gateway Timeout` with `code: "statement_timeout"`.
5. **Generator Drift Gate:** Running `dotnet run --project api/tools/BabyBlue.ContractGen` followed by `git diff --exit-code api/src/BabyBlue.Data/Generated/` exits `0`.
