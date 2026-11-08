# Phase 0: Project Skeleton, Pooled Client & `SessionContext`

**Spec reference:** `nestjs-api-implementation-spec.md` §2 (stack, overridden per README §1), §3 (repo structure, adapted), §5 (database layer — fully replaced), §8.1 (config)
**Blueprint reference:** `api_dotnet` `BabyBlue.Data/Npgsql/{DataSourceFactory,SessionContext}.cs`, `DatabaseOptions.cs`, `CallerAccessor.cs`; `docs/plans/api/PHASE_0_PREREQUISITES_AND_FOUNDATION.md` §3.4–3.6
**Depends on:** Repo restructuring to `api/` complete; existing `supabase/migrations/0006_api_role_and_brand_registry.sql` and `0007_4nf_and_106_procedures.sql` already applied in every target environment (local, CI, staging, prod) — **this phase creates no migrations**
**Next phase:** [`PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md`](PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md)

---

## 1. Objective

Scaffold the NestJS project at `api/`, wire a pooled `pg.Pool` with the exact pooling invariants the live `bb_api` posture requires, implement `SessionContext` (the per-transaction `SET LOCAL` preamble every procedure call depends on) and `CallerContext` (request-scoped, via `AsyncLocalStorage`, never a mutable singleton), and prove at startup — not at the first request — that the configured database credentials have the same zero-authority posture `DatabaseStartupValidator` already proves on the .NET side.

This phase does **not** touch the database schema. The `bb_api` role, `tenant_brands`/`resolve_brand`, and RLS/grants already exist (`supabase/migrations/0006`, `0007`). If any startup assertion in §3.4 below fails, the fix is operational (wrong connection string, wrong environment) — it is never "run a migration from this phase."

---

## 2. Step-by-Step Implementation Tasks

### 2.1 Project layout (`api/`)

```
api/
  package.json                     # pnpm workspace member
  tsconfig.json                    # strict: true, noUncheckedIndexedAccess, target ES2022
  nest-cli.json
  src/
    main.ts
    app.module.ts
    config/
      env.schema.ts                # zod schema — single source of truth for env vars
      config.module.ts
    database/
      database.module.ts           # @Global
      database.constants.ts        # PG_POOL token
      database.providers.ts        # pool factory
      database-shutdown.service.ts
      caller-context.ts            # AsyncLocalStorage<CallerContext>
      caller-context.middleware.ts
      session-context.ts           # SET LOCAL preamble
      procedure.ts                  # ProcedureRef type (name, sqlCall, volatility, grantedTo)
      procedure-gateway.ts
      pg-error.mapper.ts
      database-startup.service.ts  # OnApplicationBootstrap posture check
    common/
      decorators/                  # @Public, @CurrentCaller
      filters/                     # ProblemDetailsExceptionFilter (Phase 1)
      middleware/                  # brand-resolution, security-headers (Phase 1)
    modules/
      health/
      <domain-module>/             # one per Phase 2–5 sub-domain
  test/
  generated/                       # contract-gen output — see Phase 1 §2.3
  tools/
    contract-gen/                  # standalone TS codegen script
  Dockerfile
  docker-compose.yml
  .env.example
```

This mirrors `api_dotnet`'s three-project split (`BabyBlue.Contracts` / `BabyBlue.Data` / `BabyBlue.Api`) collapsed into NestJS's conventional single-project `src/` layout, because Nest's module system already gives the same encapsulation the .NET project-reference boundaries were enforcing (no ORM, no business logic in controllers, no HTTP knowledge in the database layer) without needing separate compiled assemblies. The boundary is enforced by lint rule, not by project reference — see §2.6.

### 2.2 Environment configuration (`config/env.schema.ts`)

zod schema, validated at boot (process exits with a readable message on failure — same fail-fast contract as the generic template §8.1, values adapted to Postgres):

| Variable | Type | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | enum `development`\|`test`\|`production` | `development` | |
| `PORT` | int | `3000` | |
| `LOG_LEVEL` | enum | `info` | |
| `DATABASE_URL` | string | required | `postgres://bb_api:...@host:5432/postgres` — the live Supabase pooler connection string for `bb_api` |
| `DB_POOL_MAX` | int | `40` | Mirrors `DatabaseOptions.MaxPoolSize`. See §2.3 sizing note. |
| `DB_POOL_MIN` | int | `5` | |
| `DB_IDLE_TIMEOUT_MS` | int | `300000` | `pg.Pool`'s `idleTimeoutMillis`, mirrors `ConnectionIdleLifetimeSeconds` |
| `DB_CONNECT_TIMEOUT_MS` | int | `10000` | |
| `DB_STATEMENT_TIMEOUT_MS` | int | `20000` | **Must exceed** the role-level 15s (`authenticated`)/5s (`anon`) `statement_timeout` set by `SessionContext`, for the same reason `DatabaseOptionsValidator` enforces `CommandTimeoutSeconds > 15`: so Postgres raises `57014` instead of the client aborting first. |
| `DB_SSL_MODE` | enum `disable`\|`require`\|`verify-full` | `verify-full` | `disable`/`require` permitted only in `development`/`test`. |
| `SUPABASE_URL` | string | required | Used to derive the JWT issuer (`{SUPABASE_URL}/auth/v1`) — Phase 1 §2.4. |
| `SUPABASE_JWT_SECRET` | string | optional | Symmetric HS256 verification secret for local/test; production uses JWKS discovery when unset. |
| `CORS_PLATFORM_API_HOSTS` | string (comma list) | optional | Mirrors `NetworkOptions.PlatformApiHosts` — see Phase 1 §2.4.4. |
| `THROTTLE_*` | — | — | Defined per-policy in Phase 1 §2.6, not globally. |
| `SWAGGER_ENABLED` | boolean | `false` | |

Booleans parsed explicitly (`"true"`/`"false"`), never by truthiness, per the generic template's own rule.

### 2.3 Pooled client (`database/database.providers.ts`)

```ts
// database/database.providers.ts
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export const PG_POOL = Symbol('PG_POOL');

export const pgPoolProvider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<Pool> => {
    const pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.getOrThrow<number>('DB_POOL_MAX'),
      min: config.getOrThrow<number>('DB_POOL_MIN'),
      idleTimeoutMillis: config.getOrThrow<number>('DB_IDLE_TIMEOUT_MS'),
      connectionTimeoutMillis: config.getOrThrow<number>('DB_CONNECT_TIMEOUT_MS'),
      statement_timeout: config.getOrThrow<number>('DB_STATEMENT_TIMEOUT_MS'),
      ssl: resolveSsl(config),
      application_name: 'babyblue-api-node',
    });
    pool.on('error', (err) => new Logger('PgPool').error(`Pool error: ${err.message}`));
    const probe = await pool.connect();
    probe.release(); // fail fast at boot
    return pool;
  },
};
```

Mandatory invariants, ported from `DataSourceFactory.Create` (`API_LAYER_SPEC.md` §4, §17):
- **Pool sizing is derived, not guessed**, same as Finding F-15 on the .NET side: `bb_api`'s `connection limit` in Postgres must satisfy `(instances × DB_POOL_MAX) + reserve`. Document the current instance count and the resulting required `connection limit` in this file's PR description; if it changes, `alter role bb_api connection limit <n>` must change with it.
- `pg` has no direct equivalent of `NoResetOnClose`/`IncludeErrorDetail` — the two Npgsql invariants that matter here translate as:
  - **Every connection returned to the pool must have had `DISCARD ALL` semantics applied.** `pg.Pool` does **not** do this automatically (unlike Npgsql's `NoResetOnClose=false`, which runs it on the server side). Because `SessionContext.applyAsync` (below) only ever issues `SET LOCAL` (transaction-scoped — see §2.4) and `set_config(..., is_local=true)`, nothing set during a request survives `COMMIT`/`ROLLBACK` even without an explicit `DISCARD ALL`. **This is load-bearing**: do not introduce a session-level `SET` (non-`LOCAL`) anywhere in this codebase, or the pool-isolation gate in Phase 1 fails.
  - There is no `pg` equivalent to toggle for error-detail suppression; **never log `error.detail`, `error.hint`, `error.where`, or raw SQL text** anywhere downstream (the mapper in Phase 1 §2.5 enforces this by construction — it is only ever given `error.message`, `error.code`, `error.constraint`).
- `ssl: { rejectUnauthorized: true }` (the `verify-full` equivalent) outside `development`/`test`.

### 2.4 `CallerContext` via `AsyncLocalStorage` (`database/caller-context.ts`)

The generic template's own `TransactionContext` pattern (§5.5) is the right shape — a per-request immutable context carried without a mutable singleton:

```ts
// database/caller-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export type DbRole = 'authenticated' | 'anon';

export interface ResolvedBrand {
  brandId: string;
  slug: string;
  schemaName: string;
  status: string;
  displayName: string;
  theme: Record<string, unknown>;
  copyOverrides: Record<string, unknown>;
  features: Record<string, boolean | string>;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportEmail: string;
}

export function isFeatureEnabled(brand: ResolvedBrand, key: string, defaultValue = true): boolean {
  const v = brand.features[key];
  return typeof v === 'boolean' ? v : defaultValue;
}

export interface CallerContext {
  userId: string | null;
  dbRole: DbRole;
  claimsJson: string;
  brand: ResolvedBrand;
  requestId: string;
  lastProcedure?: string; // mutated in place by ProcedureGateway for error/request logging — the one deliberate exception to immutability, matching CallerAccessor.LastProcedure
}

class CallerContextStore {
  private readonly als = new AsyncLocalStorage<CallerContext>();

  get current(): CallerContext {
    const ctx = this.als.getStore();
    if (!ctx) throw new Error('CallerContext has not been initialized for this request.');
    return ctx;
  }

  run<T>(ctx: CallerContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }
}

export const callerContextStore = new CallerContextStore();
```

`caller-context.middleware.ts` (Phase 1 §2.4.5) calls `callerContextStore.run(ctx, () => next())` exactly where `CallerContextMiddleware.InvokeAsync` calls `callerAccessor.Initialize(caller)` then `await next(ctx)` — same position in the pipeline, same "throws if read before middleware ran" failure mode as `CallerAccessor.Current`.

### 2.5 `SessionContext` (`database/session-context.ts`)

Ports `SessionContext.ApplyAsync` verbatim, including the schema allowlist regex and the single-round-trip batching note:

```ts
// database/session-context.ts
import type { PoolClient } from 'pg';
import type { CallerContext } from './caller-context';

// Same allowlist as the live .NET API (API_LAYER_SPEC.md §3, D-31): `public` today,
// `bb_[a-z][a-z0-9_]{1,28}` once MULTITENANCY_PLAN.md Phase 1 moves the live brand off `public`.
// Validated here, before string interpolation, because `search_path`/`role` cannot be bound
// as query parameters — this regex is what makes that interpolation safe.
const SCHEMA_PATTERN = /^(public|bb_[a-z][a-z0-9_]{1,28})$/;

export async function applySessionContext(client: PoolClient, caller: CallerContext): Promise<void> {
  const { brand, dbRole, userId, claimsJson, requestId } = caller;

  if (!SCHEMA_PATTERN.test(brand.schemaName)) {
    throw new Error('invalid_schema');
  }
  if (dbRole !== 'authenticated' && dbRole !== 'anon') {
    throw new Error('invalid_role');
  }

  const budget = dbRole === 'anon' ? '5s' : '15s';
  const idleBudget = dbRole === 'anon' ? '10s' : '30s';

  // One round trip for the four SET LOCAL statements — schemaName/dbRole/budget are
  // regex-validated above, never bound as parameters (SET LOCAL cannot take them as $1).
  await client.query(
    `set local search_path = ${brand.schemaName};
     set local role ${dbRole};
     set local statement_timeout = '${budget}';
     set local idle_in_transaction_session_timeout = '${idleBudget}';`,
  );

  if (userId) {
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims',    $2, true),
              set_config('application_name',      $3, true)`,
      [userId, claimsJson, `bb-api-node:${requestId}`],
    );
  } else {
    await client.query(
      `select set_config('request.jwt.claim.sub', '', true),
              set_config('request.jwt.claims',    '', true),
              set_config('application_name',      $1, true)`,
      [`bb-api-node:${requestId}`],
    );
  }
}
```

Same two notes as the .NET source carry over unchanged and should be left as comments in the real file:
- `search_path` is set to the brand schema **alone**, never `${schema}, public` — so that once the live brand moves to `bb_babyblue`, a procedure cannot silently resolve a tenant table in `public`. Shared reference data is qualified explicitly by the procedures themselves.
- Everything here is `set local` / `set_config(..., is_local=true)` on an **open transaction** — nothing survives `COMMIT`/`ROLLBACK`, which is what makes connection reuse across requests safe (see §2.3's `DISCARD ALL` note).

### 2.6 Architecture boundary enforcement (lint, not project references)

Because Nest collapses the .NET solution's three-project boundary into one `src/` tree, the boundary has to be enforced by ESLint instead of the compiler:

- `no-restricted-imports`: forbid importing `pg` anywhere outside `src/database/**`. Only `ProcedureGateway` and the database module's own files may touch the driver.
- `no-restricted-imports`: forbid importing anything from `src/database/session-context.ts` or `src/database/caller-context.ts` from `src/modules/**/*.controller.ts` — controllers call managers/services, never the database layer directly.
- Add a Jest "architecture" test (`test/architecture.spec.ts`) using `madge` or a simple `ts-morph` AST scan to assert the same two rules at test time, not just lint time — mirroring `ArchitectureBoundaryTests.cs` on the .NET side, which exists precisely because lint rules can be disabled inline and a test cannot.

### 2.7 Startup posture validation (`database/database-startup.service.ts`)

A NestJS lifecycle hook (`OnApplicationBootstrap`) reproducing `DatabaseStartupValidator`'s fail-fast check — the one assertion this phase is actually allowed to depend on existing infrastructure for, since it only *reads* role metadata that `supabase/migrations/0006` already created:

```ts
// database/database-startup.service.ts
@Injectable()
export class DatabaseStartupService implements OnApplicationBootstrap {
  constructor(@Inject(PG_POOL) private readonly pool: Pool, private readonly logger: Logger) {}

  async onApplicationBootstrap(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{
        current_user: string;
        bypass_rls: boolean;
        inherit: boolean;
        can_assume_authenticated: boolean;
        can_assume_anon: boolean;
        can_assume_service_role: boolean;
      }>(`
        select current_user as current_user,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls,
               (select rolinherit   from pg_roles where rolname = current_user) as inherit,
               pg_has_role(current_user, 'authenticated', 'member') as can_assume_authenticated,
               pg_has_role(current_user, 'anon', 'member')          as can_assume_anon,
               pg_has_role(current_user, 'service_role', 'member') as can_assume_service_role
      `);
      const r = rows[0];
      if (
        r.current_user !== 'bb_api' ||
        r.bypass_rls ||
        r.inherit ||
        !r.can_assume_authenticated ||
        !r.can_assume_anon ||
        r.can_assume_service_role
      ) {
        this.logger.error(`Database posture check failed: ${JSON.stringify(r)}`);
        throw new Error('Unsafe database role posture detected at startup — refusing to serve traffic.');
      }
      this.logger.log('bb_api posture verified: noinherit, nobypassrls, no service_role membership.');
    } finally {
      client.release();
    }
  }
}
```

`OnApplicationBootstrap` throwing here must abort Nest's bootstrap (Nest already propagates an unhandled rejection in a lifecycle hook as a fatal boot failure — verify this holds for the chosen adapter in Phase 1 and add a boot-level integration test, not an assumption).

### 2.8 `database.module.ts`

`@Global()` module providing and exporting: `pgPoolProvider`, `DatabaseStartupService`, and (introduced in Phase 1) `ProcedureGateway`. Nothing about `ProcedureGateway` itself belongs in this phase — it needs the error mapper and the generated procedure catalogue from Phase 1 first; Phase 0 only needs the pool, the session preamble function, and the caller-context store to exist and be unit-testable in isolation.

---

## 3. Verification & Exit Gate

1. **Config fail-fast test:** booting with `DATABASE_URL` unset exits non-zero with a readable zod error, not a stack trace from inside `pg`.
2. **Startup posture test (the Node-side equivalent of the .NET `Startup Role Validation Test`):**
   - Against a local/test database where the configured user is `postgres` (or any role with `rolinherit = true`), `onApplicationBootstrap` throws and Nest refuses to start.
   - Against a correctly configured `bb_api` connection, boot succeeds and the log line in §2.7 is emitted.
3. **`SessionContext` regex & role-guard unit test (no database needed):**
   - `schemaName = "public"` and `"bb_babyblue"` both pass; `"pg_catalog"`, `"bb_babyblue; drop table x"`, `"Public"`, `""`, `"bb_"` all throw `Error('invalid_schema')` **before** any query is issued (assert by mocking `PoolClient.query` and verifying it was never called).
   - `dbRole` outside `'authenticated' | 'anon'` throws `Error('invalid_role')` before any query.
4. **`noinherit` enforcement test (requires a real `bb_api` connection against a seeded test database):** opening a connection as `bb_api` and calling `select * from public.public_city_list()` **without** calling `applySessionContext` first fails with Postgres error code `42501` (`permission denied for function public_city_list`). This is the same zero-authority proof the .NET plan's Phase 0 gate depends on, and it must pass before Phase 1 is allowed to build anything on top of `ProcedureGateway`.
5. **Transaction unwind test (`DB_POOL_MAX=1`):** open transaction 1, call `applySessionContext` with `userId=ownerA`, `dbRole='authenticated'`, `schemaName='public'`; commit and release. Immediately acquire a client from the same size-1 pool (transaction 2) and, **before** calling `applySessionContext` again, assert `current_user = 'bb_api'`, `current_setting('search_path') = ''`, `current_setting('request.jwt.claim.sub', true) = ''`. This is the Node translation of the .NET Phase 0 gate's final test and is the first proof that connection reuse is safe on this driver.
6. **Boundary test:** the Jest architecture spec from §2.6 passes; lint run with `no-restricted-imports` active reports zero violations.
