# NestJS API: Implementation Spec

Spec version: 1.0
Target: Node.js API that replicates the structure and benefits of an ASP.NET Core Web API
Database access: stored procedures only (SQL Server by default)
Layering: Controller → Manager → Repository → StoredProcRunner → SQL Server

---

## 0. Instructions to the implementing agent

You are building a production-quality API from this document. This document is authoritative. Follow it literally.

### 0.1 Hard rules

1. **Do not invent anything in Section 1.** Modules, endpoints, stored procedure names, parameters and result columns come only from Section 1. If something you need is missing or ambiguous, stop and ask. Never guess an SP signature.
2. **Do not write or modify stored procedures** unless Section 1.2 says `Generate local SP stubs: yes`. Stubs go in `db/stubs/` only and are for local development.
3. **No ORM.** No TypeORM, Prisma, Sequelize, MikroORM, Knex or any query builder. All data access goes through `StoredProcRunner`.
4. **No inline SQL** anywhere except the health check (`SELECT 1`).
5. **Respect the layer rules in Section 4.** A violation is a bug even if the code works.
6. **TypeScript `strict: true`.** No `any` except where this spec shows it. No `@ts-ignore`.
7. **Use the code skeletons in Section 5 as the baseline.** You may fix compile errors against current library typings, but do not change their behaviour or public API.
8. **Install the latest stable versions** of all packages at build time (Node LTS). Commit the lockfile. Do not use deprecated packages. Do not pin to versions from your memory; run `pnpm add` and let the registry decide.
9. **Work in the phases of Section 13**, and verify each phase before starting the next.
10. **Never log secrets, tokens, passwords or full request bodies.**

### 0.2 Stop conditions (ask the owner instead of proceeding)

- Any `<<FILL>>` placeholder remains in Section 1.
- An SP in the catalogue has no stated result shape.
- Two parts of this spec contradict each other.
- A requirement cannot be met with the specified stack.

### 0.3 Definition of done

The project is complete only when ALL of these pass on a clean clone:

```
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
docker compose up --build     # API boots, GET /api/health/ready returns 200
```

and the checklist in Section 13.5 is fully ticked.

---

## 1. App definition (OWNER FILLS THIS IN)

> Everything below marked `<<FILL>>` must be completed before handing the spec to an agent.

### 1.1 Identity

| Field | Value |
|---|---|
| App name | `<<FILL>>` |
| One-line purpose | `<<FILL>>` |
| API base path | `/api` (URI versioning: `/api/v1/...`) |
| Package name | `<<FILL: kebab-case>>` |
| Database engine | SQL Server (default). Change only if stated: `<<FILL or "SQL Server">>` |
| Expected load | `<<FILL: e.g. 200 concurrent users, ~100 req/s peak>>` |

### 1.2 Options

| Option | Value |
|---|---|
| Generate local SP stubs | `<<FILL: yes / no>>` |
| Redis caching | `<<FILL: yes / no>>` (if yes, list cacheable reads in 1.7) |
| Background jobs (BullMQ) | `<<FILL: yes / no>>` (requires Redis) |
| File uploads | `<<FILL: yes / no>>` (if yes, describe in 1.7) |
| Multi-tenant | `<<FILL: yes / no>>` (if yes, describe how tenant is resolved in 1.7) |

### 1.3 Authentication and authorisation

| Field | Value |
|---|---|
| Auth model | JWT access token; `<<FILL: also refresh tokens? yes/no>>` |
| Login identifier | `<<FILL: email / username / phone>>` |
| Roles | `<<FILL: e.g. Admin, Manager, User>>` |
| Public endpoints | `<<FILL: e.g. POST /auth/login, POST /auth/register>>` |
| Password hashing | argon2id performed in the API; SP receives and stores the hash |

### 1.4 Modules

List every module (one NestJS module per row):

| Module | Folder name | Purpose |
|---|---|---|
| `<<FILL>>` | `<<FILL: kebab-case plural, e.g. customers>>` | `<<FILL>>` |

`auth` and `health` modules always exist and are specified in Sections 8 and 9.

### 1.5 Endpoints (one table per module)

Copy this table for every module.

**Module: `<<FILL>>`**

| # | Method | Path | Roles | Manager method | SP(s) called | Request DTO | Response DTO | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` | `<<FILL>>` |

### 1.6 Stored procedure catalogue

One block per SP. The agent derives repository methods, Row interfaces and parameter lists strictly from this.

```
SP:            <<FILL: e.g. usp_Customer_GetById>>
Module:        <<FILL>>
Kind:          read | write
Purpose:       <<FILL>>
Input params:  <<FILL: Name:SqlType(length):required|nullable, ...>>
Output params: <<FILL: Name:SqlType, or "none">>
Result sets:   <<FILL: 1) columns with SQL types; 2) columns..., or "none">>
Return value:  <<FILL: used? meaning?>>
Raises:        <<FILL: THROW numbers per Section 5.6, or "none">>
Idempotent:    yes | no
```

### 1.7 Business rules, caching, special cases

For each module, list the rules the Manager must enforce, in plain imperative sentences:

```
<<FILL, e.g.
Module customers:
- Email must be unique (enforced by SP via THROW 51409; the manager does not pre-check).
- A customer with open orders cannot be deactivated (manager checks usp_Order_CountOpenByCustomer, throws BusinessRuleException 'CUSTOMER_HAS_OPEN_ORDERS').
- Cacheable: getById for 60s, invalidated on update/deactivate.
>>
```

### 1.8 Worked example (shows the expected level of detail; delete when filling in)

**Module: customers**

| # | Method | Path | Roles | Manager method | SP(s) | Request DTO | Response DTO |
|---|---|---|---|---|---|---|---|
| 1 | GET | /customers/:id | Admin, Manager | `getById(id)` | usp_Customer_GetById | none | CustomerDto |
| 2 | GET | /customers | Admin, Manager | `list(query)` | usp_Customer_List | ListCustomersQueryDto | PagedResult<CustomerDto> |
| 3 | POST | /customers | Admin | `create(dto, actorId)` | usp_Customer_Create | CreateCustomerDto | CustomerDto |
| 4 | PATCH | /customers/:id | Admin | `update(id, dto, actorId)` | usp_Customer_Update | UpdateCustomerDto | CustomerDto |

```
SP:            usp_Customer_GetById
Module:        customers
Kind:          read
Purpose:       Returns one customer by id
Input params:  CustomerId:Int:required
Output params: none
Result sets:   1) CustomerId Int, FullName NVarChar(200), Email NVarChar(255), IsActive Bit, CreatedAt DateTime2
Raises:        51404 if not found
Idempotent:    yes

SP:            usp_Customer_List
Kind:          read
Input params:  Search:NVarChar(100):nullable, PageNumber:Int:required, PageSize:Int:required
Result sets:   1) same columns as above; 2) TotalCount Int (single row)
Idempotent:    yes
```

---

## 2. Technology stack

| Concern | Choice |
|---|---|
| Runtime | Node.js, current LTS |
| Language | TypeScript, `strict: true` |
| Package manager | pnpm |
| Framework | NestJS (latest stable major) with `@nestjs/platform-fastify` |
| HTTP server | Fastify (NOT Express) |
| DB driver | `mssql` (node-mssql) |
| Validation | `class-validator` + `class-transformer` via global `ValidationPipe` |
| Config | `@nestjs/config` + `zod` schema validation at boot |
| Auth | `@nestjs/jwt` with a custom guard (no Passport) |
| Password hashing | `argon2` (argon2id) |
| Logging | `nestjs-pino` + `pino-http` |
| API docs | `@nestjs/swagger` |
| Health | `@nestjs/terminus` |
| Rate limiting | `@nestjs/throttler` |
| Security headers | `@fastify/helmet` |
| Compression | `@fastify/compress` |
| Caching (if enabled) | `@nestjs/cache-manager` + Redis store |
| Jobs (if enabled) | `@nestjs/bullmq` |
| Tests | Jest + `@nestjs/testing` + supertest |
| Lint/format | ESLint (typescript-eslint, strict-type-checked) + Prettier |
| Git hooks | husky + lint-staged |

---

## 3. Repository structure

```
.
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.schema.ts              # zod schema, single source of truth for env vars
│   │   └── config.module.ts
│   ├── database/
│   │   ├── database.module.ts         # @Global
│   │   ├── database.constants.ts      # MSSQL_POOL token
│   │   ├── database.providers.ts      # pool factory
│   │   ├── database-shutdown.service.ts
│   │   ├── stored-proc.runner.ts
│   │   ├── sp-param.ts                # typed parameter helpers
│   │   ├── sql-error.mapper.ts
│   │   ├── transaction.context.ts
│   │   └── unit-of-work.ts
│   ├── common/
│   │   ├── common.module.ts           # registers global guards/filters/interceptors/pipes
│   │   ├── decorators/                # @Public, @Roles, @CurrentUser, @RawResponse
│   │   ├── dto/                       # PaginationQueryDto
│   │   ├── exceptions/                # BusinessRuleException
│   │   ├── filters/                   # AllExceptionsFilter
│   │   ├── guards/                    # JwtAuthGuard, RolesGuard
│   │   ├── interceptors/              # ResponseEnvelopeInterceptor
│   │   ├── types/                     # PagedResult, AuthUser
│   │   └── error-codes.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── health/
│   │   └── <module-name>/             # one folder per module in Section 1.4
│   │       ├── dto/
│   │       ├── rows/                  # Row interfaces mirroring SP result sets
│   │       ├── <name>.controller.ts
│   │       ├── <name>.manager.ts
│   │       ├── <name>.repository.ts
│   │       ├── <name>.mapper.ts
│   │       ├── <name>.module.ts
│   │       └── *.spec.ts
├── test/                              # e2e tests
├── db/stubs/                          # only if "Generate local SP stubs: yes"
├── docs/sp-contract.md                # generated from Section 1.6 (human-readable)
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.mjs
└── package.json
```

---

## 4. Layer rules (non-negotiable)

Dependency direction is strictly downward: **Controller → Manager → Repository → StoredProcRunner**. A layer may only inject the layer directly beneath it (plus cross-cutting services such as logger, config, cache, `UnitOfWork`).

### 4.1 Controller

Allowed:
- Route decorators, `@Param/@Query/@Body` with DTOs, `@Roles`, `@Public`, Swagger decorators.
- `@HttpCode` for non-default statuses.
- Calling exactly one Manager method per handler and returning its result.

Forbidden:
- Business logic, conditionals on data, mapping, DB access, `try/catch`, injecting repositories or the runner.

### 4.2 Manager (business layer)

Allowed:
- Business rules, orchestration of multiple repository calls, calling other Managers, `UnitOfWork.run`, caching, mapping Row → DTO via the module's Mapper.
- Throwing `NotFoundException`, `ConflictException`, `ForbiddenException`, `BusinessRuleException`.

Forbidden:
- Knowledge of HTTP (`Request`, `Reply`, status codes beyond throwing the exceptions above), knowledge of SQL, SP names, `mssql` types.

### 4.3 Repository

Allowed:
- One public method per stored procedure (or per tightly coupled SP pair), calling `StoredProcRunner` with typed parameters, returning Row types or primitives.

Forbidden:
- Business logic, validation, DTOs, mapping to DTOs, throwing HTTP exceptions, caching, calling other repositories, inline SQL.

### 4.4 Mapper

A plain class with static pure functions `toDto(row)` and `toDtos(rows)`. No injection, no side effects.

### 4.5 Rows vs DTOs

- **Row** = exactly what the SP returns (DB column names and casing, e.g. `CustomerId`). Lives in `rows/`.
- **DTO** = API contract (camelCase, e.g. `customerId`). Request DTOs use class-validator decorators. Response DTOs are plain classes/interfaces with Swagger `@ApiProperty`.
- Rows never leave the Manager. DTOs never enter the Repository.

---

## 5. Database layer (implement exactly)

### 5.1 `database.constants.ts`

```ts
export const MSSQL_POOL = Symbol('MSSQL_POOL');
```

### 5.2 `database.providers.ts`

```ts
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MSSQL_POOL } from './database.constants';

export const mssqlPoolProvider = {
  provide: MSSQL_POOL,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<sql.ConnectionPool> => {
    const logger = new Logger('MssqlPool');
    const pool = new sql.ConnectionPool({
      server: config.getOrThrow<string>('DB_SERVER'),
      port: config.getOrThrow<number>('DB_PORT'),
      database: config.getOrThrow<string>('DB_NAME'),
      user: config.getOrThrow<string>('DB_USER'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      connectionTimeout: config.getOrThrow<number>('DB_CONNECTION_TIMEOUT_MS'),
      requestTimeout: config.getOrThrow<number>('DB_REQUEST_TIMEOUT_MS'),
      pool: {
        max: config.getOrThrow<number>('DB_POOL_MAX'),
        min: config.getOrThrow<number>('DB_POOL_MIN'),
        idleTimeoutMillis: 30_000,
      },
      options: {
        encrypt: config.getOrThrow<boolean>('DB_ENCRYPT'),
        trustServerCertificate: config.getOrThrow<boolean>('DB_TRUST_SERVER_CERT'),
        enableArithAbort: true,
      },
    });
    pool.on('error', (err) => logger.error(`Pool error: ${err.message}`));
    await pool.connect(); // fail fast at boot
    logger.log('Connected to SQL Server');
    return pool;
  },
};
```

### 5.3 `database-shutdown.service.ts`

```ts
@Injectable()
export class DatabaseShutdownService implements OnApplicationShutdown {
  constructor(@Inject(MSSQL_POOL) private readonly pool: sql.ConnectionPool) {}
  async onApplicationShutdown(): Promise<void> {
    await this.pool.close();
  }
}
```

### 5.4 `sp-param.ts` (typed parameter helpers)

```ts
import * as sql from 'mssql';

export type SqlType = sql.ISqlType | sql.ISqlTypeFactory;

export interface SpParam {
  name: string;               // WITHOUT the leading '@'
  type: SqlType;
  value: unknown;
  direction?: 'in' | 'out';   // default 'in'
}

export const p = {
  int: (name: string, value: number | null): SpParam => ({ name, type: sql.Int, value }),
  bigint: (name: string, value: string | number | null): SpParam => ({ name, type: sql.BigInt, value }),
  bit: (name: string, value: boolean | null): SpParam => ({ name, type: sql.Bit, value }),
  decimal: (name: string, value: number | null, precision = 18, scale = 2): SpParam =>
    ({ name, type: sql.Decimal(precision, scale), value }),
  nvarchar: (name: string, value: string | null, length: number | 'max' = 'max'): SpParam =>
    ({ name, type: length === 'max' ? sql.NVarChar(sql.MAX) : sql.NVarChar(length), value }),
  uuid: (name: string, value: string | null): SpParam => ({ name, type: sql.UniqueIdentifier, value }),
  date: (name: string, value: Date | null): SpParam => ({ name, type: sql.Date, value }),
  datetime2: (name: string, value: Date | null): SpParam => ({ name, type: sql.DateTime2, value }),
  tvp: (name: string, table: sql.Table): SpParam => ({ name, type: sql.TVP, value: table }),
  out: (name: string, type: SqlType): SpParam => ({ name, type, value: undefined, direction: 'out' }),
};
```

Rules: every SP parameter in the catalogue MUST be passed with the exact SQL type and length from Section 1.6. Never rely on type inference. Nullable parameters receive `null`, never `undefined`.

### 5.5 `transaction.context.ts` and `unit-of-work.ts`

```ts
// transaction.context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';

@Injectable()
export class TransactionContext {
  private readonly als = new AsyncLocalStorage<sql.Transaction>();
  get current(): sql.Transaction | undefined { return this.als.getStore(); }
  run<T>(tx: sql.Transaction, fn: () => Promise<T>): Promise<T> { return this.als.run(tx, fn); }
}

// unit-of-work.ts
@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(MSSQL_POOL) private readonly pool: sql.ConnectionPool,
    private readonly ctx: TransactionContext,
  ) {}

  async run<T>(
    fn: () => Promise<T>,
    isolation: number = sql.ISOLATION_LEVEL.READ_COMMITTED,
  ): Promise<T> {
    if (this.ctx.current) return fn(); // join the ambient transaction
    const tx = new sql.Transaction(this.pool);
    await tx.begin(isolation);
    try {
      const result = await this.ctx.run(tx, fn);
      await tx.commit();
      return result;
    } catch (err) {
      try { await tx.rollback(); } catch { /* already rolled back */ }
      throw err;
    }
  }
}
```

Usage rule: Managers wrap multi-SP write flows in `this.uow.run(async () => { ... })`. Inside a unit of work, SP calls MUST be awaited sequentially (never `Promise.all`), because a transaction uses a single connection.

### 5.6 `sql-error.mapper.ts`

SP error convention (all SPs follow this; document it in `docs/sp-contract.md`):

| SQL `THROW` number | Meaning | HTTP | Error code |
|---|---|---|---|
| 51400 | Invalid input detected by SP | 400 | `VALIDATION_FAILED` |
| 51403 | Not permitted | 403 | `FORBIDDEN` |
| 51404 | Not found | 404 | `NOT_FOUND` |
| 51409 | Conflict / duplicate | 409 | `CONFLICT` |
| 51422 | Business rule violated | 422 | `BUSINESS_RULE_VIOLATION` |

Native SQL Server errors:

| Condition | HTTP | Error code |
|---|---|---|
| number 2627 or 2601 (unique violation) | 409 | `CONFLICT` |
| number 547 (FK/check violation) | 409 | `CONFLICT` |
| number 1205 (deadlock victim) | 503 (after retries, see 5.7) | `SERVICE_UNAVAILABLE` |
| `err.code === 'ETIMEOUT'` | 504 | `GATEWAY_TIMEOUT` |
| `err.code` in `ELOGIN`, `ESOCKET`, `ECONNCLOSED`, `ENOTOPEN` | 503 | `SERVICE_UNAVAILABLE` |
| anything else | 500 | `INTERNAL_ERROR` |

Implementation requirements:
- Export `SqlErrorMapper.map(err: unknown, proc: string): Error` returning a Nest `HttpException` subclass (or `BusinessRuleException` for 51422).
- For 51xxx errors, the HTTP `detail` is the SP's `message` (SPs are trusted to write client-safe messages).
- For ALL other errors, never expose the SQL message to the client. Log the original error (SP name, error number, message) at `error` level and return a generic message.
- Attach `proc` and original `number` to the logged context only.

### 5.7 `stored-proc.runner.ts`

```ts
export interface SpResult<T> {
  recordsets: T[][];            // all result sets (first is recordsets[0])
  output: Record<string, unknown>;
  returnValue: number;
  rowsAffected: number[];
}

export interface ExecOptions {
  /** Retry on deadlock (1205). Only honoured outside a transaction. Default false. Set true for idempotent SPs. */
  retryOnDeadlock?: boolean;
}

@Injectable()
export class StoredProcRunner {
  private readonly logger = new Logger(StoredProcRunner.name);

  constructor(
    @Inject(MSSQL_POOL) private readonly pool: sql.ConnectionPool,
    private readonly txCtx: TransactionContext,
  ) {}

  async execute<T = unknown>(proc: string, params: SpParam[] = [], opts: ExecOptions = {}): Promise<SpResult<T>> {
    const maxAttempts = opts.retryOnDeadlock && !this.txCtx.current ? 3 : 1;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.executeOnce<T>(proc, params);
      } catch (err) {
        const isDeadlock = (err as { number?: number }).number === 1205;
        if (isDeadlock && attempt < maxAttempts) {
          this.logger.warn(`Deadlock on ${proc}, retry ${attempt}`);
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }
        throw SqlErrorMapper.map(err, proc);
      }
    }
  }

  private async executeOnce<T>(proc: string, params: SpParam[]): Promise<SpResult<T>> {
    const tx = this.txCtx.current;
    const request = tx ? new sql.Request(tx) : this.pool.request();
    for (const prm of params) {
      if (prm.direction === 'out') request.output(prm.name, prm.type);
      else request.input(prm.name, prm.type, prm.value);
    }
    const res = await request.execute<T>(proc);
    return {
      recordsets: res.recordsets as unknown as T[][],
      output: res.output,
      returnValue: res.returnValue as number,
      rowsAffected: res.rowsAffected,
    };
  }

  /** First row of first result set, or undefined. */
  async queryOne<T>(proc: string, params: SpParam[] = [], opts?: ExecOptions): Promise<T | undefined> {
    const r = await this.execute<T>(proc, params, opts);
    return r.recordsets[0]?.[0];
  }

  /** All rows of first result set. */
  async queryMany<T>(proc: string, params: SpParam[] = [], opts?: ExecOptions): Promise<T[]> {
    const r = await this.execute<T>(proc, params, opts);
    return r.recordsets[0] ?? [];
  }

  /** Paged read: result set 1 = rows, result set 2 = single row { TotalCount }. */
  async queryPaged<T>(proc: string, params: SpParam[] = [], opts?: ExecOptions): Promise<{ rows: T[]; totalCount: number }> {
    const r = await this.execute<T | { TotalCount: number }>(proc, params, opts);
    const rows = (r.recordsets[0] ?? []) as T[];
    const totalCount = ((r.recordsets[1]?.[0] as { TotalCount?: number } | undefined)?.TotalCount) ?? 0;
    return { rows, totalCount };
  }

  /** Write with no result set; returns output params and return value. */
  async executeNonQuery(proc: string, params: SpParam[] = [], opts?: ExecOptions) {
    const r = await this.execute(proc, params, opts);
    return { output: r.output, returnValue: r.returnValue, rowsAffected: r.rowsAffected };
  }
}
```

### 5.8 `database.module.ts`

`@Global()` module providing and exporting: `mssqlPoolProvider`, `StoredProcRunner`, `TransactionContext`, `UnitOfWork`; providing `DatabaseShutdownService`.

### 5.9 Pool sizing rule

`DB_POOL_MAX × (number of API instances)` must not exceed the SQL Server connection budget given in Section 1.1. Default `DB_POOL_MAX=20`, `DB_POOL_MIN=2`. Document this in the README.

---

## 6. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case, role suffix | `customers.manager.ts` |
| Module folder | kebab-case plural | `customers/` |
| Classes | PascalCase + role suffix | `CustomersManager`, `CustomersRepository` |
| Request DTOs | `<Verb><Entity>Dto` | `CreateCustomerDto`, `ListCustomersQueryDto` |
| Response DTOs | `<Entity>Dto` | `CustomerDto` |
| Row interfaces | `<Entity>Row` (DB column names verbatim) | `CustomerRow` |
| Repository methods | camelCase verb, mirrors SP action | `getById`, `list`, `create` |
| SP names | Exactly as in Section 1.6 | `usp_Customer_GetById` |
| SP name constants | Defined once at top of repository file as `const SP = { getById: 'usp_Customer_GetById', ... } as const` | |
| JSON properties | camelCase | `customerId` |
| Env vars | UPPER_SNAKE_CASE | `DB_POOL_MAX` |
| Dates in JSON | ISO 8601 UTC strings | `2026-11-05T19:24:00.000Z` |
| IDs | As the DB defines them. `BigInt` IDs are serialised as strings. | |

---

## 7. HTTP conventions

### 7.1 Bootstrap (`main.ts`)

Must do all of the following:

```ts
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
  { bufferLogs: true },
);
app.useLogger(app.get(Logger));            // nestjs-pino
app.setGlobalPrefix('api', { exclude: [] });
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
await app.register(helmet);
await app.register(compress);
app.enableCors({ origin: config.get('CORS_ORIGINS').split(','), credentials: true });
app.enableShutdownHooks();
// Swagger only when SWAGGER_ENABLED=true, served at /api/docs, with bearer auth scheme
await app.listen(port, '0.0.0.0');
```

Health endpoints must be reachable at `/api/health/live` and `/api/health/ready` (version-neutral: use `@Version(VERSION_NEUTRAL)`).

### 7.2 Global pipe

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  stopAtFirstError: false,
})
```

Query/params needing numbers use explicit `@Type(() => Number)` or `ParseIntPipe`. All request DTO properties MUST have class-validator decorators.

### 7.3 Success response envelope

Applied by a global `ResponseEnvelopeInterceptor`:

```json
{ "data": <payload> }
```

For paged results (Manager returns `PagedResult<T>`):

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 134, "totalPages": 7 }
}
```

- `PagedResult<T>` is a class `{ items: T[]; page: number; pageSize: number; totalCount: number }`. The interceptor detects it with `instanceof`.
- `@RawResponse()` decorator skips the envelope (used for health endpoints and file downloads).
- `204 No Content` for deletes/updates that return nothing (handler returns `void`; interceptor does not wrap `undefined`).

### 7.4 Status codes

| Action | Status |
|---|---|
| GET success | 200 |
| POST creating a resource | 201 |
| POST that is an action (login, etc.) | 200 via `@HttpCode(200)` |
| PATCH/PUT success returning resource | 200 |
| DELETE / no body | 204 |

### 7.5 Error response (all errors, by `AllExceptionsFilter`)

```json
{
  "status": 422,
  "code": "BUSINESS_RULE_VIOLATION",
  "title": "Unprocessable Entity",
  "detail": "Customer has open orders and cannot be deactivated.",
  "traceId": "c0a8...-request-id",
  "path": "/api/v1/customers/12",
  "timestamp": "2026-11-05T19:24:00.000Z",
  "errors": [ { "field": "email", "messages": ["email must be an email"] } ]
}
```

- `errors` only present for validation failures (flatten class-validator errors, including nested).
- `traceId` equals the request id (see 8.2).
- Unknown errors → 500, `code: INTERNAL_ERROR`, generic `detail: "An unexpected error occurred."`; the real error is logged with the stack.
- Error codes live in `common/error-codes.ts` as a `const` object.
- `BusinessRuleException(code: string, message: string)` extends `HttpException` with status 422 and carries a custom domain `code` (e.g. `CUSTOMER_HAS_OPEN_ORDERS`) that the filter surfaces in `code`.

### 7.6 Pagination and filtering

`PaginationQueryDto` (extended by every list query DTO):

| Param | Type | Default | Constraint |
|---|---|---|---|
| `page` | int | 1 | min 1 |
| `pageSize` | int | 20 | min 1, max 100 |
| `search` | string? | none | max 100 |
| `sortBy` | string? | none | must be in a per-endpoint allow-list defined in the DTO (`@IsIn`) |
| `sortDir` | `asc` \| `desc` | `asc` | |

Sort fields are never concatenated into SQL by the API; they are passed to the SP as parameters and the SP is responsible for allow-listing.

### 7.7 Swagger

- Every controller: `@ApiTags`, `@ApiBearerAuth()` (unless public).
- Every handler: `@ApiOperation({ summary })`, `@ApiOkResponse`/`@ApiCreatedResponse` with the response DTO type, and `@ApiResponse` for 400/401/403/404/409/422 where applicable.
- Every DTO property: `@ApiProperty` or `@ApiPropertyOptional`.

---

## 8. Cross-cutting concerns

### 8.1 Configuration (`config/env.schema.ts`)

Validate with zod at boot; the process MUST exit with a clear message if validation fails.

| Variable | Type | Default | Notes |
|---|---|---|---|
| NODE_ENV | enum development/test/production | development | |
| PORT | int | 3000 | |
| LOG_LEVEL | enum | info | |
| DB_SERVER | string | required | |
| DB_PORT | int | 1433 | |
| DB_NAME | string | required | |
| DB_USER | string | required | |
| DB_PASSWORD | string | required | |
| DB_POOL_MAX | int | 20 | |
| DB_POOL_MIN | int | 2 | |
| DB_ENCRYPT | boolean | true | |
| DB_TRUST_SERVER_CERT | boolean | false | true only for local dev |
| DB_REQUEST_TIMEOUT_MS | int | 15000 | |
| DB_CONNECTION_TIMEOUT_MS | int | 15000 | |
| JWT_ACCESS_SECRET | string (min 32) | required | |
| JWT_ACCESS_TTL | string | 15m | |
| JWT_REFRESH_TTL_DAYS | int | 7 | only if refresh tokens enabled |
| CORS_ORIGINS | string (comma list) | required in production | |
| THROTTLE_TTL_MS | int | 60000 | |
| THROTTLE_LIMIT | int | 120 | |
| SWAGGER_ENABLED | boolean | false | |
| REDIS_URL | string | optional | required if caching/jobs enabled |

Booleans are parsed explicitly (`"true"`/`"false"`), not with truthiness. Provide `.env.example` with every variable.

### 8.2 Logging

- `nestjs-pino` with `pino-http`.
- Request id: use incoming `x-request-id` if present and valid, else `crypto.randomUUID()`. Echo it in the `x-request-id` response header and use it as `traceId` in errors.
- Redact: `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.passwordHash`, `*.refreshToken`.
- Pretty printing only in development.
- Each log line includes: request id, method, url, status, response time.
- Log SP failures with SP name and SQL error number (never parameters containing PII).

### 8.3 Authentication and authorisation

- `JwtAuthGuard` registered globally (`APP_GUARD`). Verifies `Authorization: Bearer <token>` with `JwtService`, attaches `AuthUser` (`{ id, roles, ... }`) to the request. Endpoints marked `@Public()` skip it.
- `RolesGuard` registered globally after `JwtAuthGuard`. If `@Roles(...)` is present, require at least one match; otherwise allow any authenticated user.
- `@CurrentUser()` param decorator returns `AuthUser`.
- Access token payload: `sub`, `roles`, `iat`, `exp`. Keep it minimal.
- `auth` module endpoints (adjust per Section 1.3):
  - `POST /auth/login`: `AuthManager` fetches the user via SP, verifies the argon2 hash, issues tokens. Wrong credentials → 401 with a generic message (never reveal which part was wrong). Add a stricter `@Throttle` on this route (e.g. 5/min per IP).
  - `POST /auth/refresh` (only if refresh tokens enabled): opaque random 256-bit token, only its SHA-256 hash is stored via SP; rotate on every use; reuse of a rotated token revokes the family (SP responsibility, the API passes the hash and reacts to the SP's result).
  - `POST /auth/logout` (if refresh enabled): revokes the refresh token via SP.
- The SPs required by `auth` MUST appear in Section 1.6 like any other. If they do not, stop and ask.

### 8.4 Rate limiting

`ThrottlerModule` global with `THROTTLE_TTL_MS` / `THROTTLE_LIMIT`; `ThrottlerGuard` as `APP_GUARD`. Health endpoints use `@SkipThrottle()`.

### 8.5 Health

- `GET /api/health/live`: returns 200 if the process is up (no dependencies checked).
- `GET /api/health/ready`: Terminus check running `SELECT 1` through the pool (the only allowed inline SQL), plus Redis ping when enabled. Returns 503 if any check fails.

### 8.6 Caching (only if enabled in 1.2)

- Cache lives in Managers only, via a small `CacheService` wrapper (`get/set/del`, typed, with key builders in one file per module).
- Key format: `<app>:<module>:<entity>:<id>` (e.g. `myapp:customers:byId:12`).
- Only cache what Section 1.7 lists. Every write path that affects a cached entity MUST invalidate it.
- Never cache anything user-specific without the user id in the key.

### 8.7 Background jobs (only if enabled)

BullMQ queues registered per module; processors call Managers (never repositories directly). Retries with exponential backoff. Dead-letter handling logged at `error`.

### 8.8 Graceful shutdown

`enableShutdownHooks()`; on SIGTERM: stop accepting requests, finish in-flight requests, close DB pool (`DatabaseShutdownService`), close Redis, exit 0.

---

## 9. Module generation recipe

For EVERY module in Section 1.4, produce, in this order:

1. **Rows** (`rows/*.row.ts`): one interface per distinct SP result set, columns and TS types exactly per Section 1.6 type mapping:

   | SQL | TS |
   |---|---|
   | Int, SmallInt, TinyInt | `number` |
   | BigInt | `string` (configure driver or convert) |
   | Decimal, Numeric, Money | `number` |
   | Bit | `boolean` |
   | NVarChar, VarChar, Char | `string` |
   | UniqueIdentifier | `string` |
   | Date, DateTime, DateTime2 | `Date` |
   | nullable column | `T \| null` |

2. **Repository** (`<name>.repository.ts`):
   - `const SP = {...} as const` map.
   - One method per SP, typed parameters via `p.*` helpers, using `queryOne` / `queryMany` / `queryPaged` / `executeNonQuery` as appropriate.
   - Pass `{ retryOnDeadlock: true }` only for SPs marked `Idempotent: yes`.
3. **DTOs** (`dto/`): request DTOs with class-validator and Swagger decorators, response DTOs with Swagger decorators.
4. **Mapper** (`<name>.mapper.ts`): Row → DTO static functions.
5. **Manager** (`<name>.manager.ts`): one method per endpoint row in Section 1.5, implementing the rules in Section 1.7. Handles "not found" by checking for `undefined` from `queryOne` and throwing `NotFoundException` (when the SP does not already THROW 51404).
6. **Controller** (`<name>.controller.ts`): one handler per endpoint row, exactly the method, path, roles, DTOs and status codes in Section 1.5.
7. **Module** (`<name>.module.ts`): declares controller, providers `[Manager, Repository]`, exports `Manager` if other modules need it. Imports nothing from `database` (it is global).
8. **Tests**: see Section 10.
9. **Register** the module in `AppModule`.

### 9.1 Reference implementation for one slice (use as the template for style)

```ts
// customers.repository.ts
const SP = {
  getById: 'usp_Customer_GetById',
  list: 'usp_Customer_List',
} as const;

@Injectable()
export class CustomersRepository {
  constructor(private readonly sp: StoredProcRunner) {}

  getById(customerId: number): Promise<CustomerRow | undefined> {
    return this.sp.queryOne<CustomerRow>(SP.getById, [p.int('CustomerId', customerId)], { retryOnDeadlock: true });
  }

  list(q: { search: string | null; page: number; pageSize: number }) {
    return this.sp.queryPaged<CustomerRow>(SP.list, [
      p.nvarchar('Search', q.search, 100),
      p.int('PageNumber', q.page),
      p.int('PageSize', q.pageSize),
    ], { retryOnDeadlock: true });
  }
}

// customers.manager.ts
@Injectable()
export class CustomersManager {
  constructor(private readonly repo: CustomersRepository) {}

  async getById(id: number): Promise<CustomerDto> {
    const row = await this.repo.getById(id);
    if (!row) throw new NotFoundException('Customer not found.');
    return CustomersMapper.toDto(row);
  }

  async list(q: ListCustomersQueryDto): Promise<PagedResult<CustomerDto>> {
    const { rows, totalCount } = await this.repo.list({ search: q.search ?? null, page: q.page, pageSize: q.pageSize });
    return new PagedResult(CustomersMapper.toDtos(rows), q.page, q.pageSize, totalCount);
  }
}

// customers.controller.ts
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly manager: CustomersManager) {}

  @Get(':id')
  @Roles('Admin', 'Manager')
  @ApiOperation({ summary: 'Get a customer by id' })
  @ApiOkResponse({ type: CustomerDto })
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.manager.getById(id);
  }

  @Get()
  @Roles('Admin', 'Manager')
  list(@Query() query: ListCustomersQueryDto) {
    return this.manager.list(query);
  }
}
```

---

## 10. Testing requirements

| Level | Scope | Rules |
|---|---|---|
| Unit: Manager | Every Manager method | Repository mocked (`jest.Mocked<...>`). Cover happy path, not-found, every business rule from 1.7, and every cache invalidation. |
| Unit: Repository | Every repository method | `StoredProcRunner` mocked. Assert exact SP name, parameter names, SQL types, lengths, and values. This catches signature drift. |
| Unit: Mapper | Every mapper | Row → DTO field mapping, nullable handling. |
| Unit: infra | `SqlErrorMapper`, `ResponseEnvelopeInterceptor`, `AllExceptionsFilter`, guards, `UnitOfWork` (commit and rollback paths) | |
| E2E | Every endpoint in Section 1.5 | Boot the real Nest app on Fastify with `StoredProcRunner` overridden by an in-memory fake (`overrideProvider`). Verify: status codes, envelope shape, validation errors (400 + `errors`), 401 without token, 403 with wrong role, error shape. No real DB needed. |

- Coverage thresholds (Jest): Managers ≥ 85% lines, overall ≥ 75%.
- Tests must not depend on network, clock or random without controlling them.
- `pnpm test` runs unit tests; `pnpm test:e2e` runs e2e.

---

## 11. Tooling and deployment

### 11.1 `package.json` scripts

`start`, `start:dev`, `start:prod`, `build`, `lint`, `lint:fix`, `format`, `test`, `test:cov`, `test:e2e`, `typecheck` (`tsc --noEmit`).

### 11.2 TypeScript

`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes: false` (class-validator DTOs make it impractical), `emitDecoratorMetadata`, `experimentalDecorators`, `target ES2022`.

### 11.3 ESLint/Prettier

typescript-eslint strict type-checked config. Enforce `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`. Add a lint rule (`no-restricted-imports`) that forbids importing `mssql` outside `src/database/` and `*.repository.ts` files (repositories use `p.*` helpers, so only `src/database/` should need it). Forbid importing `*.repository` from controllers.

### 11.4 Docker

`Dockerfile`: multi-stage (deps → build → runtime), runtime image uses Node LTS slim/alpine, runs as non-root, `NODE_ENV=production`, copies only `dist` and production dependencies, has a `HEALTHCHECK` hitting `/api/health/live`.

`docker-compose.yml` (development): services `api` and `sqlserver` (official Microsoft SQL Server image, `ACCEPT_EULA=Y`, SA password from env, healthcheck), plus `redis` only if enabled. If SP stubs are enabled, a one-shot `db-init` service runs `db/stubs/*.sql` against the server.

### 11.5 README

Must contain: prerequisites, env setup, how to run locally, how to run tests, project structure summary, the layer rules from Section 4 in brief, how to add a module (Section 9 condensed), the SP error convention (Section 5.6), and pool sizing guidance.

---

## 12. Performance requirements

1. Fastify adapter, pino logger, `@fastify/compress` (threshold 1 KB).
2. One shared `ConnectionPool` for the whole process; never create pools or connections per request.
3. No synchronous CPU-heavy work on the request path (no sync crypto other than JWT verification; argon2 runs on its own thread pool by design).
4. No `JSON.parse(JSON.stringify(...))` deep clones; mappers build new objects explicitly.
5. List endpoints must always be paginated; `pageSize` capped at 100.
6. Do not use `class-transformer` for response serialisation (`ClassSerializerInterceptor` is forbidden); mappers return plain objects.
7. Independent read SP calls inside one Manager method run in parallel with `Promise.all` (outside transactions).
8. Scaling is by running more container instances, not in-process clustering. Do not add PM2/cluster code.
9. Provide `docs/load-test.md` with a ready-to-run k6 script (`test/load/smoke.js`) that logs in, then hammers one read endpoint and one write endpoint, with thresholds `p(95) < 300ms` and error rate `< 1%` as defaults the owner can tune.

---

## 13. Delivery phases and acceptance

Complete each phase and run its verification before proceeding.

### Phase 1: Scaffold and infrastructure
- Project, tsconfig, ESLint, Prettier, husky, scripts.
- Config module with zod validation, `.env.example`.
- Database layer (Section 5) with unit tests.
- `main.ts` bootstrap, pino logging, helmet, compression, CORS, throttler, versioning.
- `common/`: filter, interceptor, guards, decorators, `PagedResult`, `BusinessRuleException`, error codes.
- Health module.
- Dockerfile and docker-compose.
- **Verify:** app boots, `/api/health/live` is 200, `/api/health/ready` reflects DB state, unit tests for infra pass.

### Phase 2: Auth
- `auth` module per Section 8.3 using only SPs in the catalogue.
- **Verify:** e2e tests for login success/failure, protected route without token (401), wrong role (403).

### Phase 3: Feature modules
- One module at a time, following Section 9. Run lint, unit and e2e tests after each.
- **Verify:** all endpoints in Section 1.5 exist with the specified method, path, roles and DTOs; Swagger shows them.

### Phase 4: Hardening and docs
- Coverage thresholds, `docs/sp-contract.md`, README, k6 script.
- **Verify:** Definition of done (Section 0.3).

### 13.5 Final acceptance checklist

- [ ] No `<<FILL>>` item was guessed; every endpoint and SP traces back to Section 1.
- [ ] No ORM, no inline SQL (other than `SELECT 1`), no `any`, no `@ts-ignore`.
- [ ] Controllers contain no logic; Managers contain no HTTP/SQL knowledge; Repositories contain no business logic.
- [ ] Every SP parameter uses an explicit SQL type and length matching the catalogue.
- [ ] All multi-SP writes use `UnitOfWork` and sequential awaits.
- [ ] Every error returns the Section 7.5 shape; SQL internals are never leaked.
- [ ] Validation is whitelist-only; unknown properties are rejected.
- [ ] Secrets never logged; `.env` is git-ignored; `.env.example` is complete.
- [ ] Swagger complete for all endpoints and DTOs.
- [ ] Unit + e2e tests pass; coverage thresholds met.
- [ ] Docker build and compose boot succeed.
- [ ] README complete.

---

## 14. Explicitly out of scope and forbidden

- ORMs, query builders, raw SQL in application code.
- GraphQL, WebSockets, microservice transports (unless added to Section 1).
- Passport, session cookies, server-side sessions.
- Express adapter.
- In-process clustering (PM2/cluster).
- Writing production SP SQL.
- Adding features, endpoints, fields or modules not listed in Section 1.
