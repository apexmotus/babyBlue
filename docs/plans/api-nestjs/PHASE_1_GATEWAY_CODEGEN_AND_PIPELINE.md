# Phase 1: `ProcedureGateway`, Contract Generator, Middleware Pipeline & Pool-Isolation Gate

**Spec reference:** `nestjs-api-implementation-spec.md` §4 (layer rules, adapted), §7 (HTTP conventions — envelope overridden per README §1), §8 (cross-cutting concerns)
**Blueprint reference:** `api_dotnet` `Program.cs`, `ProcedureGateway.cs`, `ProcedureName.cs`, `Generated/Procedures.g.cs`, `Middleware/{BrandResolutionMiddleware,CallerContextMiddleware,ProblemDetailsExceptionHandler,SecurityHeadersMiddleware,CorrelationIdMiddleware}.cs`, `Auth/SupabaseJwtSetup.cs`, `BrandRegistry.cs`, `tools/BabyBlue.ContractGen`; `docs/plans/api/PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md`
**Depends on:** [`PHASE_0_FOUNDATION_AND_SESSION_CONTEXT.md`](PHASE_0_FOUNDATION_AND_SESSION_CONTEXT.md)
**Next phase:** [`PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`](PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md)

---

## 1. Objective

Build the execution engine every endpoint in Phases 2–5 sits on top of:
1. **`ProcedureGateway`** — executes allowlisted Postgres functions inside a transaction with `applySessionContext`, in four strongly-typed shapes, with the same retry discipline as the .NET version.
2. **`contract-gen`** — a standalone TS tool reading `pg_proc`/`pg_namespace`/`pg_type`/`pg_attribute`, generating typed procedure wrappers and row types, with the same build-failing assertions as `BabyBlue.ContractGen`.
3. **The full request pipeline**, wired in the exact load-bearing order the .NET API proved necessary.
4. **Two vertical-slice routes** and the **pool-isolation gate** — nothing in Phase 2–5 may start until this passes.

---

## 2. Step-by-Step Implementation Tasks

### 2.1 `ProcedureRef` and `ProcedureGateway`

```ts
// database/procedure.ts
export type Volatility = 'stable' | 'volatile';
export type GrantedTo = 'authenticated' | 'anon-and-authenticated';
export type ReturnShape = 'table-list' | 'table-single' | 'scalar' | 'void';

export interface ProcedureRef {
  readonly name: string;        // e.g. "practice_clients_list"
  readonly sqlCall: string;     // e.g. "practice_clients_list(p_practice => $1, p_q => $2, ...)"
  readonly volatility: Volatility;
  readonly grantedTo: GrantedTo;
  readonly shape: ReturnShape;
}
```

`ProcedureGateway` (`database/procedure-gateway.ts`), four entry points matching `IProcedureGateway` exactly:

| Method | SQL emitted | Empty/zero-row behaviour |
|---|---|---|
| `queryMany<TRow>(proc, args, ct)` | `select * from <proc.sqlCall>` | Returns `[]` → `200 OK` |
| `queryOne<TRow>(proc, args, ct)` | `select * from <proc.sqlCall>` | Throws `ProcedureNotFoundError` → mapped to `404` (`code: "not_found"`) |
| `scalar<T>(proc, args, ct)` | `select <proc.sqlCall>` | Returns `T` (or `not_found` if a required resource is null — caller's responsibility, same as `.NET`) |
| `execute(proc, args, ct)` | `select <proc.sqlCall>` | Returns `void` → `204 No Content` |

```ts
// database/procedure-gateway.ts
@Injectable()
export class ProcedureGateway {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async queryMany<TRow>(proc: ProcedureRef, args: unknown[] = []): Promise<TRow[]> {
    return this.runWithRetry(proc, args, async (client, sql, params) => {
      const res = await client.query<TRow>(sql, params);
      return res.rows;
    });
  }

  async queryOne<TRow>(proc: ProcedureRef, args: unknown[] = []): Promise<TRow> {
    const rows = await this.runWithRetry(proc, args, async (client, sql, params) => {
      const res = await client.query<TRow>(sql, params);
      return res.rows;
    });
    const row = rows[0];
    if (!row) throw new ProcedureNotFoundError(proc.name);
    return row;
  }

  async scalar<T>(proc: ProcedureRef, args: unknown[] = []): Promise<T> {
    return this.runWithRetry(proc, args, async (client, sql, params) => {
      const res = await client.query<Record<string, T>>(sql.replace('select *', 'select'), params);
      return Object.values(res.rows[0] ?? {})[0] as T;
    });
  }

  async execute(proc: ProcedureRef, args: unknown[] = []): Promise<void> {
    await this.runWithRetry(proc, args, async (client, sql, params) => {
      await client.query(sql.replace('select *', 'select'), params);
      return undefined;
    });
  }

  private async runWithRetry<T>(
    proc: ProcedureRef,
    args: unknown[],
    run: (client: PoolClient, sql: string, params: unknown[]) => Promise<T>,
  ): Promise<T> {
    const caller = callerContextStore.current;
    caller.lastProcedure = proc.name; // mirrors CallerAccessor.LastProcedure — read by the error filter and request logger

    const maxAttempts = proc.volatility === 'stable' ? 3 : 1;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.runOnce(proc, args, caller, run);
      } catch (err) {
        if (proc.volatility === 'stable' && attempt < maxAttempts && isRetryable(err)) {
          await sleep(25 + Math.random() * 50);
          continue;
        }
        throw mapPgError(err, proc.name); // Phase 1 §2.5
      }
    }
  }

  private async runOnce<T>(
    proc: ProcedureRef,
    args: unknown[],
    caller: CallerContext,
    run: (client: PoolClient, sql: string, params: unknown[]) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await applySessionContext(client, caller);
      const sql = `select * from ${proc.sqlCall}`;
      const result = await run(client, sql, args);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === '40001' || code === '40P01'; // serialization_failure / deadlock_detected
}
```

**Retry/no-retry discipline, ported verbatim (Finding set, `API_LAYER_SPEC.md` §4):**
- Retry **only** `volatility: 'stable'` procedures, **only** on `40001`/`40P01`, **at most twice**, with 25–75ms jitter.
- **Never** retry `volatility: 'volatile'` procedures — this is the rule Phase 3 §3.1 depends on for `patient_slot_hold`/`patient_appointment_book`, and Phase 4 §2.6 depends on for `practice_queue_call_next`.
- `caller.lastProcedure` is set **before** the connection is acquired, matching `callerAccessor.LastProcedure = proc.Name` happening before `OpenConnectionAsync`, so a connection-acquisition failure is still attributable to the right procedure in logs.

### 2.2 `IBrandRegistry` equivalent (`database/brand-registry.ts`)

```ts
@Injectable()
export class BrandRegistry {
  private readonly cache = new Map<string, { brand: ResolvedBrand | null; expiresAt: number }>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async resolve(host: string): Promise<ResolvedBrand | null> {
    const key = host.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.brand;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`set local search_path = public; set local role anon; set local statement_timeout = '5s';`);
      const { rows } = await client.query<ResolvedBrandRow>(
        `select * from public.resolve_brand(p_host => $1)`,
        [key],
      );
      await client.query('COMMIT');
      const brand = rows[0] ? toResolvedBrand(rows[0]) : null;
      this.cache.set(key, { brand, expiresAt: Date.now() + (brand ? 5 * 60_000 : 30_000) });
      return brand;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
```

Positive hits cached 5 minutes, negative hits (unknown host) cached 30 seconds — identical to `IBrandRegistry`'s rationale: a flood of requests for an unresolvable host must not exhaust the pool. `Map`-based in-process cache is sufficient at single-instance scale; if the API runs multi-instance behind a shared cache need later, swap for `@nestjs/cache-manager` + Redis without changing the interface.

### 2.3 Contract generator (`tools/contract-gen`)

A standalone Node/TS script, run as `pnpm --filter contract-gen run generate -- --connection "$DATABASE_URL" --schema public`, writing:
- `api/generated/procedures.g.ts`
- `api/generated/rows.g.ts`

**Catalogue query**, same filters as `BabyBlue.ContractGen`:
- `pg_proc` joined to `pg_namespace` (`nspname = $schema`), `pg_type`/`pg_attribute` for `RETURNS TABLE` columns.
- Exclude `proname like '\_%'` (helper functions) **and** the explicit deny-list `is_member`, `has_practice_role`, `is_platform_admin`, `is_marketing_operator` (no leading underscore, so the glob alone won't catch them — same gap F-… already found and fixed on the .NET side; carry the explicit deny-list forward so it isn't rediscovered).

**Build-failing assertions — exit non-zero, same four as `BabyBlue.ContractGen`:**
1. Non-helper procedure count in the target schema ≠ **106** (or the generated set doesn't match the Phase 2–5 route manifest 1:1).
2. Any function has `has_function_privilege('public', p.oid, 'execute') = true`.
3. Any of the 106 has neither `anon` nor `authenticated` EXECUTE, or a non-`public_*` procedure is `anon`-executable.
4. Any procedure's return type is `timerange` or otherwise unmapped (see type table below).

**Type mapping** (same table as `API_LAYER_SPEC.md` §6, TS instead of C#):

| Postgres | TS |
|---|---|
| `uuid` | `string` |
| `text`/`varchar`/enum domains (`practice_role`, `consent_purpose`, `platform_role`, `marketing_status`) | `string` |
| `int4` | `number`; `int2` | `number`; `int8` | `string` (precision safety — mirrors `BigInt → string` in the generic template §9) |
| `bool` | `boolean` |
| `timestamptz` | `string` (ISO 8601, **never** a parsed `Date` — avoids timezone round-trip bugs the way `DateTimeOffset` does on the .NET side by staying explicit) |
| `date` | `string` (`YYYY-MM-DD`) |
| `text[]` | `string[]`; `uuid[]` | `string[]` |
| `numeric` | `string` (avoid float precision loss — **required**, same reason Finding F-09 added it on the .NET side: `growth_reports_list.metric_value` is `numeric` and silently coercing to `number` loses precision pg's driver would otherwise preserve as a string by default) |
| `jsonb` | `Record<string, unknown>` / `unknown[]` per-procedure, passed through verbatim |
| `bytea` | `Buffer` |

**Single-row vs table-list classification** — same deterministic set as `SingleRowProcedures` on the .NET side, carried forward unchanged: `public_practitioner_get`, `public_queue_info`, `public_queue_status`, `patient_profile_get`, `patient_appointment_get`, `patient_hold_get`, `practice_setup_progress`, `practice_client_get`, `practice_appointment_get`, `practice_settings_get`, `growth_request_get`, `growth_asset_download`. The last one belongs here only because the live `growth_asset_download` already returns `table (file_name text, mime text, content bytea)` — confirm this is still the deployed signature before running the generator (Finding F-03's fix is already in production; this generator is reading the live catalogue, not re-deriving the fix).

**CI gate:** `pnpm --filter contract-gen run generate && git diff --exit-code generated/` — identical drift gate to the .NET plan's Phase 1 exit criterion 5.

### 2.4 Middleware pipeline (exact order)

Fastify adapter (`nestjs-api-implementation-spec.md` §2 stack choice stands). Wire in `main.ts` / module-level middleware in this order, matching `Program.cs` step for step:

1. **Correlation ID** (`middleware/correlation-id.middleware.ts`): read `X-Request-Id` if it matches `^[a-zA-Z0-9_-]{1,64}$`, else generate one; attach to `request.id` and echo on the response.
2. **Exception filter** registered as a global Nest filter (`ProblemDetailsExceptionFilter`, §2.5 below) — functionally "upstream" in the sense that it's what every later stage's thrown errors resolve through; the ordering risk called out below is about response **headers**, not catch order.
3. **Security headers** (`middleware/security-headers.middleware.ts`): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: no-store` (unless overridden by the output-cache layer on anonymous public routes in Phase 2), strip `Server`/`X-Powered-By`.
4. **Dynamic brand CORS** (`BrandCorsPolicyProvider` equivalent — Phase 5 §4.4 implements the dynamic domain refresh; this phase wires the `@fastify/cors` hook shape so later phases only need to supply the origin-matching function).

   > **Load-bearing ordering risk, ported from the .NET Phase 1 plan verbatim:** whatever mechanism catches thrown errors in this stack must not run "above" CORS/security-header application in a way that a Fastify `onError` hook or Nest exception filter ends up emitting a response with those headers stripped. Add the same integration test the .NET plan requires: a cross-origin request producing `409 slot_unavailable` must carry **both** CORS headers and security headers in the error response. If it fails, re-apply headers from inside the exception filter itself rather than reordering the pipeline.
5. **Brand resolution** (`middleware/brand-resolution.middleware.ts`) — runs **before** auth:
   ```ts
   @Injectable()
   export class BrandResolutionMiddleware implements NestMiddleware {
     constructor(private readonly registry: BrandRegistry, private readonly config: ConfigService) {}

     async use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
       const host = resolveEffectiveHost(req, this.config);
       const brand = host ? await this.registry.resolve(host) : null;

       if (!brand) {
         res.statusCode = 404;
         res.setHeader('content-type', 'application/problem+json');
         res.end(JSON.stringify(problem('brand_not_found', 404, req)));
         return;
       }
       if (brand.status === 'suspended' || brand.status === 'archived') {
         res.statusCode = 403;
         res.end(JSON.stringify(problem('brand_unavailable', 403, req)));
         return;
       }
       (req as any).resolvedBrand = brand;
       next();
     }
   }
   ```
   `resolveEffectiveHost` ports `BrandResolutionMiddleware.ResolveEffectiveHost` exactly: if the request landed on a configured `CORS_PLATFORM_API_HOSTS` entry (or falls back to the `api.` prefix convention when unconfigured), prefer a syntactically valid `X-Tenant-Host` header, else the `Origin` header's host, else `Request.Host`; a syntactically invalid `X-Tenant-Host` returns empty (no fallback to `Request.Host`) exactly as the .NET version does — this is a caller-supplied header on a shared host, never a privilege boundary, since RLS still scopes every row by `auth.uid()` regardless of which brand schema got selected (same comment as the .NET source carries — keep it).
6. **Authentication** (`auth/supabase-jwt.guard.ts`, global `APP_GUARD`, `@Public()` escape hatch):
   - Verifies `Authorization: Bearer <token>` against issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`, `clockTolerance: 30` seconds.
   - **JWKS discovery by default** (`${issuer}/.well-known/jwks.json` via `jwks-rsa` or `jose`'s `createRemoteJWKSet`), restricted to `ES256`/`RS256`. **Symmetric `SUPABASE_JWT_SECRET` (HS256) only** when explicitly configured, for local/test — and when used, pin `algorithms: ['HS256']` exclusively, mirroring the .NET `ValidAlgorithms` pinning that exists specifically to block algorithm-confusion downgrade attacks.
   - On failure: emit the same Problem-Details 401 body, `code: "token_expired"` when the failure is expiry-specific, else `code: "not_authenticated"`.
   - **No `/auth/login`, `/auth/refresh`, `/auth/logout` routes exist in this module** — see README §1. Supabase Auth issues tokens directly to `client-web`/`admin-dashboard`.
7. **Caller context** (`database/caller-context.middleware.ts`) — runs **after** auth, **before** rate limiting:
   ```ts
   @Injectable()
   export class CallerContextMiddleware implements NestMiddleware {
     use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
       const brand = (req as any).resolvedBrand as ResolvedBrand | undefined;
       if (!brand) throw new Error('BrandResolutionMiddleware must run before CallerContextMiddleware.');

       const jwt = (req as any).user as DecodedSupabaseJwt | undefined; // set by the auth guard
       const requestId = (req as any).id as string;

       const caller: CallerContext = jwt
         ? buildAuthenticatedCaller(jwt, brand, requestId) // validates `sub` is a UUID, 401s via the same Problem-Details path otherwise
         : { userId: null, dbRole: 'anon', claimsJson: '{}', brand, requestId };

       callerContextStore.run(caller, next);
     }
   }
   ```
   **`dbRole` is derived solely from whether a valid JWT was presented — never from the JWT's own `role` claim** (so a leaked `service_role` token still runs as `authenticated`, exactly as `CallerContextMiddleware.InvokeAsync`'s comment states). `claimsJson` carries only `sub`, a hardcoded `role: "authenticated"`, and optionally `email`/`exp` — never the token's real claims verbatim.
8. **Rate limiting** — per-route policies defined in each domain phase (Phase 2 §3.2, Phase 3 §3.1, Phase 4 PR tables), implemented via `@nestjs/throttler` with a custom `ThrottlerStorage` keyed as `${brandSlug}:ip:${clientIp}` or `${brandSlug}:u:${sub}` depending on policy — never a bare IP or bare user id, so traffic on one brand cannot exhaust another's limit. `ClientIpOf` reads `request.ip` only after Fastify's trusted-proxy config is set (explicit `trustProxy` allowlist — never blind `X-Forwarded-For` trust, same as the .NET `UseForwardedHeaders` requirement).
9. **Output cache** — Phase 2 §3.1 implements the policy layer; this phase only needs the Fastify response-caching hook point to exist.
10. **Controllers** (`app.useGlobalPipes`, snake_case serialization — see §2.6).

### 2.5 Error mapping (`database/pg-error.mapper.ts`)

Reproduces `ProblemDetailsExceptionHandler`'s exact 3-step resolution order — **do not reorder this**, because SQLSTATEs are not unique per code (the .NET plan's own warning: `P0002` alone serves `not_found`, `queue_closed`, *and* `user_not_found`; `23503` serves `service_in_use`, `last_practitioner`, *and* `metric_unknown`; `23P01` serves both `slot_unavailable` and `overlapping_availability`). Resolving by SQLSTATE first returns the wrong status on several endpoints.

```ts
// database/pg-error.mapper.ts
export const CODES: Record<string, number> = {
  not_authenticated: 401, forbidden: 403, not_found: 404, not_editable: 403,
  slot_unavailable: 409, hold_expired: 409, too_late_to_cancel: 409, not_cancellable: 409,
  not_reschedulable: 409, too_early_to_check_in: 409, not_checkin_able: 409, invalid_transition: 409,
  user_not_found: 409, sole_owner: 409, has_records: 409, registration_in_use: 409,
  last_practitioner: 409, service_in_use: 409, overlapping_availability: 409, queue_closed: 409,
  consent_required: 409, too_many_holds: 429, invalid_registration: 400, invalid_name: 400,
  invalid_range: 400, price_required: 400, metric_unknown: 400, asset_too_large: 413,
  profiles_phone_international: 400,
};

export const TRANSPORT_CODES: Record<string, number> = {
  rate_limited: 429, invalid_input: 400, invalid_argument: 400, invalid_email: 400,
  invalid_slug: 400, token_expired: 401, brand_not_found: 404, brand_unavailable: 403,
  conflict: 409, statement_timeout: 504, too_many_connections: 503, client_closed: 499,
  internal_error: 500, api_not_configured: 500,
};

export function mapPgError(err: unknown, procName: string): HttpException {
  if (err instanceof ProcedureNotFoundError) return problemException(404, 'not_found');

  const pg = err as { code?: string; message?: string; constraint?: string };
  if (pg?.code) {
    // Step 1: message text (authoritative — procedures put the semantic code in the message,
    // e.g. `raise exception 'queue_closed' using errcode = 'P0002'`)
    const text = (pg.message ?? '').trim();
    if (text.startsWith('metric_unknown:')) {
      return problemException(400, 'metric_unknown', text.slice('metric_unknown:'.length).trim());
    }
    if (CODES[text] !== undefined) return problemException(CODES[text], text);

    // Step 2: constraint name
    if (pg.constraint) {
      if (['no_double_booking', 'no_overlapping_holds', 'no_double_hold'].includes(pg.constraint)) {
        return problemException(409, 'slot_unavailable');
      }
      if (CODES[pg.constraint] !== undefined) return problemException(CODES[pg.constraint], pg.constraint);
    }

    // Step 3: SQLSTATE terminal fallback
    const fallback: Record<string, [number, string]> = {
      '22023': [400, 'invalid_input'], '23P01': [409, 'slot_unavailable'],
      '23505': [409, 'conflict'], '23503': [409, 'conflict'], '42501': [403, 'forbidden'],
      '28000': [401, 'not_authenticated'], P0002: [404, 'not_found'], '23514': [400, 'invalid_input'],
      '57014': [504, 'statement_timeout'], '54000': [429, 'too_many_holds'], '53300': [503, 'too_many_connections'],
    };
    const mapped = fallback[pg.code];
    if (mapped) return problemException(mapped[0], mapped[1]);
  }
  // Never log/serialize pg.detail, pg.hint, pg.where, or SQL text — see Phase 0 §2.3.
  return problemException(500, 'internal_error');
}
```

The global `ProblemDetailsExceptionFilter` wraps `mapPgError` plus the transport-level codes, produces the Problem-Details body:

```json
{ "type": "https://babyblue.co.za/errors/<code>", "title": "<code>", "status": 409, "code": "slot_unavailable", "request_id": "<correlation id>" }
```

— **not** the generic template's `{ status, code, title, detail, traceId, path, timestamp, errors }` shape. Match the .NET body exactly (field names and all) since `src/lib/api/http.ts`'s `ApiError` parsing is not being rewritten. `detail` is included only for the handful of codes that carry one (e.g. `metric_unknown`'s offending key). Re-apply CORS and security headers from inside this filter per the §2.4 step 4 ordering note.

### 2.6 Response shape & JSON casing (overrides generic template §6, §7.3)

- **snake_case** JSON on every response — register a global Fastify serializer replacer (or a Nest `ClassSerializerInterceptor` substitute using a plain recursive key-mapper, since `class-transformer`'s interceptor is forbidden by the generic template's own performance rule §12.6) converting camelCase TS property names to snake_case on the wire.
- **No `{ data: ... }` envelope.** Handlers return exactly what the .NET route tables specify: a row/array directly, or a small wrapper object (`{ id }`, `{ count }`, `{ role }`, `{ token }`) only where the .NET controller constructs one. Copy each phase's route table's "Return Shape" column literally.
- `204 No Content` for every route the .NET table marks `void`/`204` — a Nest handler returning `undefined` with `@HttpCode(204)`.

### 2.7 Two vertical-slice routes

1. `GET /v1/directory/cities` — `@Public()`, calls `publicProcedures.cityList()` → `public_city_list()`.
2. `GET /v1/practices` — behind the auth guard, calls `practiceContextProcedures.membershipsList()` → `practice_memberships_list()`.

Both exercised end-to-end through the full pipeline above before Phase 2 starts.

---

## 3. Verification & Hard Exit Gate

**Nothing in Phase 2, 3 or 4 may start until every item below passes** (same hard-gate posture as the .NET plan's Step 4.0).

1. **Single-connection pool-isolation test — the gate everything else rests on.** Configure the test app with `DB_POOL_MAX=1` so every request in the test provably shares one physical connection (use `@testcontainers/postgresql` + the same Supabase-stub bootstrap described in Phase 0, ported to a `test/fixtures/supabase-bootstrap.sql` — `auth.users`, `auth.uid()`, `anon`/`authenticated`/`service_role` roles, `btree_gist`/`pgcrypto` extensions).
   - **(a) Cross-user/cross-role, real schema:** seed `ownerA`/`practiceA`, `ownerB`/`practiceB` on host `babyblue.co.za`. `GET /v1/practices` as `ownerA` → `[practiceA]`. Immediately as `ownerB` → `[practiceB]` only (proves no `request.jwt.claim.sub` leak). Immediately `GET /v1/directory/cities` anonymously → runs as `anon`, not `ownerB` (proves no `role` leak — the case plain connection reuse without a transaction-scoped preamble would not catch). Then acquire the pool's one connection directly and assert `current_user = 'bb_api'`, `search_path = ''`, `request.jwt.claim.sub = ''`.
   - **(b) Cross-brand, purpose-built second schema:** bootstrap a minimal `bb_testbrand` schema (practices/practice_members/cities + `public_city_list`/`practice_memberships_list` with the same RLS/`security definer`/`search_path` shape), register it in `tenant_brands` on host `book.testbrand.co.za`. `GET /v1/practices` on `babyblue.co.za` as `ownerA` → `[practiceA]`; immediately on `book.testbrand.co.za` with the **same** `ownerA` token, same pooled connection → `[]` (zero rows, not an error — `ownerA` is real but matches no membership in that schema). Assert the `search_path` observed was `bb_testbrand`, not `public`, so a pass can't be a false negative from the schema never changing.
2. **Unknown-host test:** `GET /v1/practices` with a valid JWT and `Host: unknown.example.com` returns `404` without invoking any procedure (assert `ProcedureGateway.queryMany`/`queryOne` was never called — e.g. via a spy).
3. **`service_role` downgrade test:** a validly signed JWT with `role: "service_role"` and a real `sub` still runs with `current_setting('role') = 'authenticated'`, never `service_role`.
4. **Statement-timeout test:** a test-only route executing `pg_sleep` past the role's budget returns `504` with `code: "statement_timeout"`.
5. **CORS/security-header-on-error test:** a cross-origin request producing `409 slot_unavailable` carries both sets of headers (§2.4 step 4).
6. **Contract-gen drift gate:** `pnpm --filter contract-gen run generate && git diff --exit-code generated/` exits 0.
7. **Boundary test from Phase 0 §2.6 still passes** with `ProcedureGateway` now in the tree (confirms the lint rule actually covers the new file).
